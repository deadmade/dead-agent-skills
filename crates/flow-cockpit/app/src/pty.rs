//! The Claude sessions the window hosts: each is a plain foreground `claude` process in its own pseudo-terminal,
//! reachable by its session id. The PTY layer passes bytes through untouched, in both directions: it never reads,
//! rewrites or filters an escape sequence.
//!
//! Stopping a session is graceful first. Every command Claude Code runs starts in a session of its own, which killing
//! `claude`'s process group doesn't reach, so only `claude`'s own exit path reaps them. That path runs on SIGHUP,
//! which `portable-pty`'s killer sends; a plain `child.kill()` follows SIGHUP with SIGKILL after 200 ms and leaves
//! those commands running as orphans. So the stop sends SIGHUP, waits, and forces only when that didn't work.
//!
//! A session's output goes to the ring buffer of its last bytes and to the subscribed channel, both fed by the
//! session's reader thread. A second thread polls for the exit; an exited session stays registered, holding its last
//! output, until `kill` dismisses it.

// Tauri hands a command its `State` and arguments by value.
#![expect(clippy::needless_pass_by_value)]

use std::collections::{HashMap, VecDeque};
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use flow_cockpit_core::session::launch::{LaunchSpec, build_resume_argv, build_start_argv};
use portable_pty::{Child, ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, InvokeResponseBody, Response};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

/// How long a session gets to exit on SIGHUP before it is killed: Claude Code took 0.65-1.05 s to clean up and exit.
const GRACE: Duration = Duration::from_secs(5);
/// How long the exit is awaited after the forced kill, which is immediate where it works.
const FORCED_WAIT: Duration = Duration::from_secs(2);
/// How often the exit is polled for.
const EXIT_POLL: Duration = Duration::from_millis(25);
/// How long an exit waits for the reader to drain the last output before it is reported: a process that outlives
/// `claude` and keeps the terminal open must not hold the report back.
const DRAIN_WAIT: Duration = Duration::from_millis(250);
/// How much of a session's output is kept for a pane that connects later.
const SCROLLBACK_BYTES: usize = 256 * 1024;
/// How long the login shell gets to print its `PATH`.
const LOGIN_SHELL_WAIT: Duration = Duration::from_secs(10);

/// Where the child finds `claude`: the inherited `PATH`, and the shell that knows the user's own.
struct HostEnv {
    path: Option<OsString>,
    shell: Option<PathBuf>,
}

impl HostEnv {
    fn from_process() -> HostEnv {
        // `$SHELL`, else the passwd entry's shell.
        #[cfg(unix)]
        let shell = Some(PathBuf::from(CommandBuilder::new("claude").get_shell()));
        #[cfg(not(unix))]
        let shell = None;
        HostEnv {
            path: std::env::var_os("PATH"),
            shell,
        }
    }

    /// The `PATH` to run `program` with when the inherited one lacks it: what the user's login shell prints. A GUI
    /// launch often has no `~/.local/bin`, where Claude Code's installer puts `claude`. `None` leaves the inherited
    /// `PATH` as it is, so the spawn reports what it can't find.
    fn login_path(&self, program: &str) -> Option<OsString> {
        if self.path.as_deref().is_some_and(|p| on_path(p, program)) {
            return None;
        }
        let path = login_shell_path(self.shell.as_deref()?)?;
        on_path(&path, program).then_some(path)
    }
}

/// Whether an executable file `program` lies in one of the folders of `path`.
#[cfg(unix)]
fn on_path(path: &std::ffi::OsStr, program: &str) -> bool {
    use std::os::unix::fs::PermissionsExt;

    std::env::split_paths(path).any(|dir| {
        std::fs::metadata(dir.join(program))
            .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    })
}

#[cfg(not(unix))]
fn on_path(_: &std::ffi::OsStr, _: &str) -> bool {
    true
}

/// The `PATH` a login shell prints on its last line (rc files may print before it), `None` when it fails or hangs.
#[cfg(unix)]
fn login_shell_path(shell: &Path) -> Option<OsString> {
    use std::process::{Command, Stdio};

    let mut child = Command::new(shell)
        .args(["-lc", "command -v claude; printf '%s\\n' \"$PATH\""])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let mut out = Vec::new();
        let _ = stdout.read_to_end(&mut out);
        let _ = tx.send(out);
    });
    let deadline = Instant::now() + LOGIN_SHELL_WAIT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(EXIT_POLL),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    let out = rx.recv_timeout(Duration::from_secs(1)).ok()?;
    if !status.success() {
        return None;
    }
    String::from_utf8_lossy(&out)
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(OsString::from)
}

#[cfg(not(unix))]
fn login_shell_path(_: &Path) -> Option<OsString> {
    None
}

/// A session's output sink: gets each chunk, and says whether it is still listening.
type Sink = Box<dyn FnMut(&[u8]) -> bool + Send>;

/// What a session wrote: the last bytes, and whoever listens to the rest.
struct Stream {
    ring: VecDeque<u8>,
    cap: usize,
    sink: Option<Sink>,
}

/// One hosted `claude`. The master, writer, child and killer each sit behind their own lock: `MasterPty` is `Send` but
/// not `Sync`, and the exit poll must not hold up a resize or a keystroke.
struct Session {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    stream: Mutex<Stream>,
    /// Whether the process has exited.
    exit: Mutex<bool>,
    exited: Condvar,
    reader_done: AtomicBool,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Session {
    fn is_live(&self) -> bool {
        !*lock(&self.exit)
    }

    fn push(&self, chunk: &[u8]) {
        let mut stream = lock(&self.stream);
        stream.ring.extend(chunk);
        let excess = stream.ring.len().saturating_sub(stream.cap);
        stream.ring.drain(..excess);
        if let Some(sink) = &mut stream.sink
            && !sink(chunk)
        {
            stream.sink = None;
        }
    }

    fn mark_exited(&self) {
        *lock(&self.exit) = true;
        self.exited.notify_all();
    }

    /// Whether the process exited within `timeout`.
    fn wait_exit(&self, timeout: Duration) -> bool {
        let guard = lock(&self.exit);
        let (guard, _) = self
            .exited
            .wait_timeout_while(guard, timeout, |exited| !*exited)
            .unwrap_or_else(PoisonError::into_inner);
        *guard
    }

    /// SIGHUP, so `claude` runs its own exit path and reaps every command it started; the forced kill only when
    /// that didn't end it within `grace`.
    fn stop(&self, grace: Duration) -> Result<(), String> {
        if !self.is_live() {
            return Ok(());
        }
        let hangup = lock(&self.killer).kill();
        if hangup.is_ok() && self.wait_exit(grace) {
            return Ok(());
        }
        let forced = lock(&self.child).kill();
        if self.wait_exit(FORCED_WAIT) {
            return Ok(());
        }
        Err(match (hangup, forced) {
            (_, Err(e)) | (Err(e), _) => format!("the session did not stop: {e}"),
            _ => "the session did not stop".to_owned(),
        })
    }
}

/// The reader thread: bytes from the terminal to the ring and the sink, until the terminal closes.
fn pump(session: &Session, mut reader: Box<dyn Read + Send>) {
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => session.push(&buf[..n]),
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => break,
        }
    }
    session.reader_done.store(true, Ordering::Release);
}

/// The exit thread: polls for the process's end, then reports it once the reader has drained the last output.
fn watch(session: &Session, id: Uuid, on_exit: &OnExit) {
    let code = loop {
        // The lock is released before the sleep, or the forced kill would starve waiting for it.
        let polled = lock(&session.child).try_wait();
        match polled {
            Ok(Some(status)) => {
                break if status.signal().is_none() {
                    i32::try_from(status.exit_code()).ok()
                } else {
                    None
                };
            }
            Ok(None) => thread::sleep(EXIT_POLL),
            Err(_) => break None,
        }
    };
    session.mark_exited();
    let deadline = Instant::now() + DRAIN_WAIT;
    while !session.reader_done.load(Ordering::Acquire) && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    on_exit(id, code);
}

type OnExit = Arc<dyn Fn(Uuid, Option<i32>) + Send + Sync>;

/// Every hosted session, by its id. Tauri-managed state.
pub struct HostedSessions {
    sessions: Mutex<HashMap<Uuid, Arc<Session>>>,
    on_exit: OnExit,
    env: HostEnv,
    grace: Duration,
    scrollback: usize,
}

impl HostedSessions {
    /// `on_exit` is told of every process's end, with its exit code (`None` after a signal).
    pub fn new(on_exit: impl Fn(Uuid, Option<i32>) + Send + Sync + 'static) -> HostedSessions {
        HostedSessions {
            sessions: Mutex::new(HashMap::new()),
            on_exit: Arc::new(on_exit),
            env: HostEnv::from_process(),
            grace: GRACE,
            scrollback: SCROLLBACK_BYTES,
        }
    }

    fn get(&self, id: Uuid) -> Result<Arc<Session>, String> {
        lock(&self.sessions)
            .get(&id)
            .cloned()
            .ok_or_else(|| format!("no hosted session {id}"))
    }

    fn live(&self, id: Uuid) -> Result<Arc<Session>, String> {
        let session = self.get(id)?;
        if session.is_live() {
            Ok(session)
        } else {
            Err(format!("session {id} has exited"))
        }
    }

    fn ensure_free(sessions: &HashMap<Uuid, Arc<Session>>, id: Uuid) -> Result<(), String> {
        if sessions.get(&id).is_some_and(|s| s.is_live()) {
            Err(format!("session {id} is already hosted"))
        } else {
            Ok(())
        }
    }

    pub fn start(&self, spec: LaunchSpec, cols: u16, rows: u16) -> Result<Uuid, String> {
        self.launch(
            spec.session_id,
            &build_start_argv(&spec),
            &spec.cwd,
            cols,
            rows,
        )
    }

    pub fn resume(&self, cwd: &Path, id: Uuid, cols: u16, rows: u16) -> Result<Uuid, String> {
        self.launch(id, &build_resume_argv(id), cwd, cols, rows)
    }

    fn launch(
        &self,
        id: Uuid,
        argv: &[String],
        cwd: &Path,
        cols: u16,
        rows: u16,
    ) -> Result<Uuid, String> {
        Self::ensure_free(&lock(&self.sessions), id)?;
        let (first, rest) = argv.split_first().ok_or("no command to run")?;
        let mut cmd = CommandBuilder::new(first);
        cmd.args(rest);
        cmd.cwd(cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if let Some(path) = self.env.login_path(first).or_else(|| self.env.path.clone()) {
            cmd.env("PATH", path);
        }

        let pair = native_pty_system()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);
        let session = Arc::new(Session {
            killer: Mutex::new(child.clone_killer()),
            child: Mutex::new(child),
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            stream: Mutex::new(Stream {
                ring: VecDeque::new(),
                cap: self.scrollback,
                sink: None,
            }),
            exit: Mutex::new(false),
            exited: Condvar::new(),
            reader_done: AtomicBool::new(false),
        });

        // Registered before the threads start, so an exit can never come ahead of the registration.
        {
            let mut sessions = lock(&self.sessions);
            if let Err(e) = Self::ensure_free(&sessions, id) {
                drop(sessions);
                let mut child = lock(&session.child);
                let _ = child.kill();
                let _ = child.wait();
                return Err(e);
            }
            sessions.insert(id, Arc::clone(&session));
        }
        let started = thread::Builder::new()
            .name(format!("pty-read-{id}"))
            .spawn({
                let session = Arc::clone(&session);
                move || pump(&session, reader)
            })
            .and_then(|_| {
                thread::Builder::new()
                    .name(format!("pty-wait-{id}"))
                    .spawn({
                        let session = Arc::clone(&session);
                        let on_exit = Arc::clone(&self.on_exit);
                        move || watch(&session, id, &on_exit)
                    })
            });
        if let Err(e) = started {
            let _ = lock(&session.child).kill();
            lock(&self.sessions).remove(&id);
            return Err(format!("could not start the session's threads: {e}"));
        }
        Ok(id)
    }

    pub fn write(&self, id: Uuid, bytes: &[u8]) -> Result<(), String> {
        let session = self.live(id)?;
        let mut writer = lock(&session.writer);
        writer
            .write_all(bytes)
            .and_then(|()| writer.flush())
            .map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: Uuid, cols: u16, rows: u16) -> Result<(), String> {
        let session = self.live(id)?;
        lock(&session.master)
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    /// Stops the session gracefully, forcing it only if it hasn't exited within the grace period, and dismisses it.
    pub fn kill(&self, id: Uuid) -> Result<(), String> {
        let session = self.get(id)?;
        session.stop(self.grace)?;
        let mut sessions = lock(&self.sessions);
        if sessions.get(&id).is_some_and(|s| Arc::ptr_eq(s, &session)) {
            sessions.remove(&id);
        }
        Ok(())
    }

    /// Stops every session the way [`HostedSessions::kill`] does, all at once: a serial wait would take up to the
    /// grace period for each.
    #[cfg_attr(not(test), expect(dead_code, reason = "called when the window closes"))]
    pub fn kill_all(&self) {
        let all: Vec<(Uuid, Arc<Session>)> = lock(&self.sessions)
            .iter()
            .map(|(id, s)| (*id, Arc::clone(s)))
            .collect();
        thread::scope(|scope| {
            for (id, session) in &all {
                scope.spawn(move || {
                    if let Err(e) = session.stop(self.grace) {
                        eprintln!("flow-cockpit: session {id}: {e}");
                    }
                });
            }
        });
        lock(&self.sessions).retain(|_, s| s.is_live());
    }

    /// Replays what the session wrote so far to `sink`, then streams the rest to it until it says it is gone. The
    /// replay and the hand-over happen under one lock, so no byte is lost or sent twice.
    pub fn subscribe(
        &self,
        id: Uuid,
        mut sink: impl FnMut(&[u8]) -> bool + Send + 'static,
    ) -> Result<(), String> {
        let session = self.get(id)?;
        let mut stream = lock(&session.stream);
        let (front, back) = stream.ring.as_slices();
        for part in [front, back] {
            if !part.is_empty() && !sink(part) {
                return Ok(());
            }
        }
        stream.sink = Some(Box::new(sink));
        Ok(())
    }

    /// The last bytes the session wrote. A session that isn't hosted (never started, or dismissed) is an error, which a
    /// pane must be able to tell from a session that has written nothing yet.
    fn scrollback_bytes(&self, id: Uuid) -> Result<Vec<u8>, String> {
        let session = self.get(id)?;
        let bytes = lock(&session.stream).ring.iter().copied().collect();
        Ok(bytes)
    }

    pub fn scrollback(&self, id: Uuid) -> Result<Response, String> {
        self.scrollback_bytes(id).map(Response::new)
    }

    /// Every session whose process is still running.
    pub fn ids(&self) -> Vec<Uuid> {
        let mut ids: Vec<Uuid> = lock(&self.sessions)
            .iter()
            .filter(|(_, s)| s.is_live())
            .map(|(id, _)| *id)
            .collect();
        ids.sort_unstable();
        ids
    }
}

/// The `session-exited` event's payload.
#[derive(Clone, Serialize)]
pub struct Exited {
    pub id: String,
    pub code: Option<i32>,
}

/// The `HostedSessions` that tells the window of each exit.
pub fn emitting_exits(handle: AppHandle) -> HostedSessions {
    HostedSessions::new(move |id, code| {
        let payload = Exited {
            id: id.to_string(),
            code,
        };
        if let Err(e) = handle.emit("session-exited", payload) {
            eprintln!("flow-cockpit: {e}");
        }
    })
}

/// The start form's fields as the window sends them.
#[derive(Deserialize)]
pub struct LaunchSpecInput {
    pub cwd: String,
    pub new_worktree: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub prompt: Option<String>,
    pub session_id: String,
}

fn parse_id(id: &str) -> Result<Uuid, String> {
    Uuid::parse_str(id).map_err(|e| format!("not a session id: {e}"))
}

/// Sends each chunk as raw bytes, which reach the window as an `ArrayBuffer` rather than a list of numbers.
fn to_channel(channel: Channel<InvokeResponseBody>) -> impl FnMut(&[u8]) -> bool + Send + 'static {
    move |chunk| {
        channel
            .send(InvokeResponseBody::Raw(chunk.to_vec()))
            .is_ok()
    }
}

type Sessions<'a> = State<'a, HostedSessions>;

/// Starts `claude` in its own terminal of `cols` by `rows`; its output streams to `on_output`. Returns the session id.
#[tauri::command(async)]
pub fn start_session(
    sessions: Sessions<'_>,
    input: LaunchSpecInput,
    cols: u16,
    rows: u16,
    on_output: Channel<InvokeResponseBody>,
) -> Result<String, String> {
    let spec = LaunchSpec {
        cwd: PathBuf::from(input.cwd),
        new_worktree: input.new_worktree,
        model: input.model,
        effort: input.effort,
        prompt: input.prompt,
        session_id: parse_id(&input.session_id)?,
    };
    let id = sessions.start(spec, cols, rows)?;
    sessions.subscribe(id, to_channel(on_output))?;
    Ok(id.to_string())
}

#[tauri::command(async)]
pub fn resume_session(
    sessions: Sessions<'_>,
    cwd: String,
    id: String,
    cols: u16,
    rows: u16,
    on_output: Channel<InvokeResponseBody>,
) -> Result<String, String> {
    let id = sessions.resume(Path::new(&cwd), parse_id(&id)?, cols, rows)?;
    sessions.subscribe(id, to_channel(on_output))?;
    Ok(id.to_string())
}

#[tauri::command(async)]
pub fn send_input(sessions: Sessions<'_>, id: String, bytes: Vec<u8>) -> Result<(), String> {
    sessions.write(parse_id(&id)?, &bytes)
}

#[tauri::command(async)]
pub fn resize_session(
    sessions: Sessions<'_>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    sessions.resize(parse_id(&id)?, cols, rows)
}

#[tauri::command(async)]
pub fn kill_session(sessions: Sessions<'_>, id: String) -> Result<(), String> {
    sessions.kill(parse_id(&id)?)
}

/// Connects a fresh `on_output` to a session that is already running (or has exited): what it wrote so far is replayed,
/// then the rest streams. A pane calls this when it mounts, a started session's first time and a reloaded window's again.
#[tauri::command(async)]
pub fn subscribe_session(
    sessions: Sessions<'_>,
    id: String,
    on_output: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    subscribe_by_id(&sessions, &id, to_channel(on_output))
}

fn subscribe_by_id(
    sessions: &HostedSessions,
    id: &str,
    sink: impl FnMut(&[u8]) -> bool + Send + 'static,
) -> Result<(), String> {
    sessions.subscribe(parse_id(id)?, sink)
}

#[tauri::command(async)]
pub fn hosted_sessions(sessions: Sessions<'_>) -> Vec<String> {
    sessions.ids().iter().map(Uuid::to_string).collect()
}

#[tauri::command(async)]
pub fn scrollback(sessions: Sessions<'_>, id: String) -> Result<Response, String> {
    sessions.scrollback(parse_id(&id)?)
}

#[cfg(all(test, unix))]
mod tests {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::sync::{OnceLock, mpsc};

    use super::*;

    fn sessions() -> HostedSessions {
        HostedSessions::new(|_, _| {})
    }

    /// A host whose `claude` lookup is confined to `path` and `shell`, whatever the test run inherited.
    fn confined(path: &Path, shell: &str) -> HostedSessions {
        let mut hosted = sessions();
        hosted.env = HostEnv {
            path: Some(path.as_os_str().to_owned()),
            shell: Some(PathBuf::from(shell)),
        };
        hosted
    }

    fn sh(script: &str, args: &[&Path]) -> Vec<String> {
        ["sh", "-c", script, "sh"]
            .into_iter()
            .map(str::to_owned)
            .chain(args.iter().map(|p| p.display().to_string()))
            .collect()
    }

    fn wait_until(what: &str, mut ok: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while !ok() {
            assert!(Instant::now() < deadline, "timed out waiting for {what}");
            thread::sleep(Duration::from_millis(20));
        }
    }

    fn contains(bytes: &[u8], needle: &str) -> bool {
        String::from_utf8_lossy(bytes).contains(needle)
    }

    fn screen(hosted: &HostedSessions, id: Uuid) -> String {
        String::from_utf8_lossy(&hosted.scrollback_bytes(id).unwrap()).into_owned()
    }

    /// A folder under the temp dir, removed when dropped.
    struct Dir(PathBuf);

    impl Dir {
        fn new(tag: &str) -> Dir {
            let path =
                std::env::temp_dir().join(format!("flow-cockpit-pty-{}-{tag}", std::process::id()));
            fs::remove_dir_all(&path).ok();
            fs::create_dir_all(&path).unwrap();
            Dir(path.canonicalize().unwrap())
        }
    }

    impl Drop for Dir {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).ok();
        }
    }

    struct Fixtures {
        /// Holds a `claude` that reports how it was started and exits.
        claude_dir: PathBuf,
        /// A folder with nothing in it.
        empty_dir: PathBuf,
        /// A login shell that prints `claude_dir` as its `PATH`.
        shell: PathBuf,
    }

    /// Written once, before any test runs a script: a script being executed while another test's fork still holds
    /// its write handle fails with "Text file busy".
    fn fixtures() -> &'static Fixtures {
        static FIXTURES: OnceLock<Fixtures> = OnceLock::new();
        FIXTURES.get_or_init(|| {
            let root = std::env::temp_dir().join(format!("flow-cockpit-pty-fixtures-{}", std::process::id()));
            fs::remove_dir_all(&root).ok();
            let claude_dir = root.join("bin");
            let empty_dir = root.join("empty");
            fs::create_dir_all(&claude_dir).unwrap();
            fs::create_dir_all(&empty_dir).unwrap();
            let write = |path: &Path, body: &str| {
                fs::write(path, body).unwrap();
                fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
            };
            write(
                &claude_dir.join("claude"),
                "#!/bin/sh\nprintf 'ARGS:%s\\n' \"$*\"\nprintf 'CWD:%s\\n' \"$(pwd -P)\"\nprintf 'TERM:%s %s\\n' \"$TERM\" \"$COLORTERM\"\n",
            );
            let shell = root.join("login-shell");
            write(
                &shell,
                &format!("#!/bin/sh\necho /somewhere/claude\nprintf '%s\\n' '{}'\n", claude_dir.display()),
            );
            thread::sleep(Duration::from_millis(200));
            Fixtures {
                claude_dir,
                empty_dir,
                shell,
            }
        })
    }

    fn spec(cwd: &Path, id: Uuid) -> LaunchSpec {
        LaunchSpec {
            cwd: cwd.to_path_buf(),
            new_worktree: None,
            model: None,
            effort: None,
            prompt: None,
            session_id: id,
        }
    }

    /// A shell that traps SIGHUP, noting it in the file named by its argument, and only dies of SIGKILL.
    const STUBBORN: &str =
        "trap 'echo hup >> \"$1\"' HUP; echo ready; while :; do sleep 0.05; done";

    fn pid_of(session: &Session) -> u32 {
        lock(&session.child).process_id().unwrap()
    }

    fn alive(pid: u32) -> bool {
        if let Ok(stat) = fs::read_to_string(format!("/proc/{pid}/stat")) {
            // A zombie is dead, only not reaped yet.
            return stat
                .rsplit(") ")
                .next()
                .is_some_and(|rest| !rest.starts_with('Z'));
        }
        if Path::new("/proc/self").exists() {
            return false;
        }
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    }

    #[test]
    fn spawns_and_reads_output() {
        let dir = Dir::new("reads");
        let hosted = sessions();
        let id = Uuid::new_v4();
        hosted
            .launch(id, &sh("echo hello", &[]), &dir.0, 80, 24)
            .unwrap();
        wait_until("the output", || {
            contains(&hosted.scrollback_bytes(id).unwrap(), "hello\r\n")
        });
    }

    #[test]
    fn resize_reaches_the_pty() {
        let dir = Dir::new("resize");
        let hosted = sessions();
        let id = Uuid::new_v4();
        hosted
            .launch(id, &["cat".to_owned()], &dir.0, 80, 24)
            .unwrap();
        let session = hosted.get(id).unwrap();
        let size = lock(&session.master).get_size().unwrap();
        assert_eq!(
            (size.cols, size.rows),
            (80, 24),
            "the spawn size is the caller's"
        );
        hosted.resize(id, 132, 43).unwrap();
        let size = lock(&session.master).get_size().unwrap();
        assert_eq!((size.cols, size.rows), (132, 43));
        hosted.kill(id).unwrap();
    }

    #[test]
    fn kill_sends_graceful_stop_before_sigkill() {
        let dir = Dir::new("graceful");
        let marker = dir.0.join("hup");
        let mut hosted = sessions();
        hosted.grace = Duration::from_millis(300);
        let id = Uuid::new_v4();
        hosted
            .launch(id, &sh(STUBBORN, &[&marker]), &dir.0, 80, 24)
            .unwrap();
        wait_until("the trap", || screen(&hosted, id).contains("ready"));
        let session = hosted.get(id).unwrap();

        let started = Instant::now();
        hosted.kill(id).unwrap();

        assert!(
            started.elapsed() >= Duration::from_millis(300),
            "it didn't wait for the graceful stop"
        );
        assert!(
            fs::read_to_string(&marker).unwrap().contains("hup"),
            "SIGHUP never came first"
        );
        assert!(!session.is_live(), "the forced phase didn't end it");
        assert!(!alive(pid_of(&session)));
    }

    #[test]
    fn kill_stops_the_child() {
        let dir = Dir::new("stops");
        let hosted = sessions();
        let id = Uuid::new_v4();
        hosted
            .launch(id, &["cat".to_owned()], &dir.0, 80, 24)
            .unwrap();
        let session = hosted.get(id).unwrap();
        let pid = pid_of(&session);
        assert!(alive(pid));
        assert_eq!(hosted.ids(), [id]);

        hosted.kill(id).unwrap();

        assert!(!alive(pid));
        assert_eq!(hosted.ids(), Vec::<Uuid>::new());
        assert!(
            hosted.write(id, b"x").is_err(),
            "a stopped session still takes input"
        );
    }

    /// Like Claude Code, the child starts a command in a session of its own, which only the child's own exit path
    /// reaps, and that path takes a while. A bare `child.kill()` follows SIGHUP with SIGKILL after 200 ms and
    /// orphans it.
    #[cfg(target_os = "linux")]
    #[test]
    fn graceful_kill_does_not_orphan_a_child_process() {
        let dir = Dir::new("orphan");
        let pid_file = dir.0.join("grandchild");
        let script = "setsid sleep 60 & child=$!; trap 'sleep 0.6; kill $child; exit 129' HUP; echo $child > \"$1\"; echo ready; wait";
        let hosted = sessions();
        let id = Uuid::new_v4();
        hosted
            .launch(id, &sh(script, &[&pid_file]), &dir.0, 80, 24)
            .unwrap();
        wait_until("the grandchild", || {
            screen(&hosted, id).contains("ready")
                && fs::read_to_string(&pid_file).is_ok_and(|s| !s.trim().is_empty())
        });
        let grandchild: u32 = fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        assert!(alive(grandchild));

        let result = hosted.kill(id);
        let orphaned = (0..100).any(|_| {
            thread::sleep(Duration::from_millis(20));
            !alive(grandchild)
        });
        let leaked = alive(grandchild);
        if leaked {
            let _ = std::process::Command::new("kill")
                .args(["-9", &grandchild.to_string()])
                .status();
        }
        result.unwrap();
        assert!(orphaned && !leaked, "the grandchild outlived the session");
    }

    #[test]
    fn exit_is_reported() {
        let dir = Dir::new("exit");
        let (tx, rx) = mpsc::channel();
        let tx = Mutex::new(tx);
        let hosted = HostedSessions::new(move |id, code| {
            let _ = lock(&tx).send((id, code));
        });
        let id = Uuid::new_v4();
        hosted
            .launch(id, &sh("echo bye; exit 3", &[]), &dir.0, 80, 24)
            .unwrap();
        assert_eq!(
            rx.recv_timeout(Duration::from_secs(10)).unwrap(),
            (id, Some(3))
        );
        assert!(
            contains(&hosted.scrollback_bytes(id).unwrap(), "bye"),
            "the output is gone with the exit"
        );
        assert!(
            hosted.ids().is_empty(),
            "an exited session is still listed as running"
        );
        assert!(hosted.write(id, b"x").is_err());

        let killed = Uuid::new_v4();
        hosted
            .launch(killed, &["cat".to_owned()], &dir.0, 80, 24)
            .unwrap();
        hosted.kill(killed).unwrap();
        assert_eq!(
            rx.recv_timeout(Duration::from_secs(10)).unwrap(),
            (killed, None),
            "a signal has no code"
        );
    }

    #[test]
    fn scrollback_returns_the_last_bytes_written() {
        let dir = Dir::new("scrollback");
        let mut hosted = sessions();
        hosted.scrollback = 1024;
        let id = Uuid::new_v4();
        hosted
            .launch(id, &sh("seq 1 3000", &[]), &dir.0, 80, 24)
            .unwrap();
        wait_until("the end of the output", || {
            screen(&hosted, id).ends_with("3000\r\n")
        });
        let kept = hosted.scrollback_bytes(id).unwrap();
        assert_eq!(kept.len(), 1024, "the buffer is bounded, and full");
        let tail: Vec<String> = (2990..=3000).map(|n| n.to_string()).collect();
        let expected = format!("{}\r\n", tail.join("\r\n"));
        assert!(String::from_utf8(kept).unwrap().ends_with(&expected));

        let small = sessions();
        let id = Uuid::new_v4();
        small
            .launch(id, &sh("printf hi", &[]), &dir.0, 80, 24)
            .unwrap();
        wait_until("the output", || screen(&small, id) == "hi");
    }

    #[test]
    fn scrollback_of_an_unhosted_session_is_an_error_not_empty_output() {
        let dir = Dir::new("scrollback-unknown");
        let hosted = sessions();
        let unknown = Uuid::new_v4();
        let err = hosted.scrollback_bytes(unknown).unwrap_err();
        assert!(err.contains("no hosted session"), "{err}");
        assert!(hosted.scrollback(unknown).is_err());

        let id = Uuid::new_v4();
        hosted
            .launch(id, &["cat".to_owned()], &dir.0, 80, 24)
            .unwrap();
        assert_eq!(
            hosted.scrollback_bytes(id),
            Ok(Vec::new()),
            "a session with no output yet is not an error"
        );
        hosted.kill(id).unwrap();
        assert!(
            hosted.scrollback_bytes(id).is_err(),
            "a dismissed session is not hosted any more"
        );
    }

    #[test]
    fn subscribe_replays_what_was_written_then_streams_the_rest_once() {
        let dir = Dir::new("subscribe");
        let hosted = sessions();
        let id = Uuid::new_v4();
        hosted
            .launch(
                id,
                &sh("echo one; sleep 0.4; echo two", &[]),
                &dir.0,
                80,
                24,
            )
            .unwrap();
        wait_until("the first line", || screen(&hosted, id).contains("one"));
        let got = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&got);
        hosted
            .subscribe(id, move |chunk| {
                lock(&sink).extend_from_slice(chunk);
                true
            })
            .unwrap();
        wait_until("the second line", || contains(&lock(&got), "two"));
        let text = String::from_utf8(lock(&got).clone()).unwrap();
        assert_eq!(text.matches("one").count(), 1, "{text:?}");
        assert!(hosted.subscribe(Uuid::new_v4(), |_| true).is_err());
    }

    #[test]
    fn start_runs_claude_with_its_arguments_folder_and_colors() {
        let dir = Dir::new("start");
        let hosted = confined(&fixtures().claude_dir, "/nonexistent/shell");
        let id = Uuid::new_v4();
        let spec = LaunchSpec {
            model: Some("opus".into()),
            ..spec(&dir.0, id)
        };
        assert_eq!(hosted.start(spec, 100, 30).unwrap(), id);
        wait_until("the report", || screen(&hosted, id).contains("TERM:"));
        let text = screen(&hosted, id);
        assert!(
            text.contains(&format!("ARGS:--session-id {id} --model opus\r\n")),
            "{text:?}"
        );
        assert!(
            text.contains(&format!("CWD:{}\r\n", dir.0.display())),
            "{text:?}"
        );
        assert!(
            text.contains("TERM:xterm-256color truecolor\r\n"),
            "{text:?}"
        );
    }

    #[test]
    fn resume_uses_the_given_id_and_cwd() {
        let dir = Dir::new("resume");
        let hosted = confined(&fixtures().claude_dir, "/nonexistent/shell");
        let id = Uuid::new_v4();
        assert_eq!(hosted.resume(&dir.0, id, 90, 25).unwrap(), id);
        wait_until("the report", || screen(&hosted, id).contains("TERM:"));
        let text = screen(&hosted, id);
        assert!(
            text.contains(&format!("ARGS:--resume {id}\r\n")),
            "{text:?}"
        );
        assert!(
            text.contains(&format!("CWD:{}\r\n", dir.0.display())),
            "{text:?}"
        );
        assert!(
            text.contains("TERM:xterm-256color truecolor\r\n"),
            "{text:?}"
        );
    }

    #[test]
    fn claude_not_found_is_a_spawn_error_not_a_panic() {
        let dir = Dir::new("missing");
        let hosted = confined(&fixtures().empty_dir, "/nonexistent/shell");
        let err = hosted
            .start(spec(&dir.0, Uuid::new_v4()), 80, 24)
            .unwrap_err();
        assert!(err.contains("claude"), "{err}");
        assert_eq!(hosted.ids(), Vec::<Uuid>::new());
        assert!(hosted.resume(&dir.0, Uuid::new_v4(), 80, 24).is_err());
    }

    #[test]
    fn claude_is_found_through_the_login_shells_path() {
        let dir = Dir::new("login");
        let fixtures = fixtures();
        let hosted = confined(&fixtures.empty_dir, fixtures.shell.to_str().unwrap());
        let id = Uuid::new_v4();
        hosted.start(spec(&dir.0, id), 80, 24).unwrap();
        wait_until("the report", || screen(&hosted, id).contains("TERM:"));
        assert!(screen(&hosted, id).contains(&format!("ARGS:--session-id {id}")));
    }

    #[test]
    fn a_login_shell_without_claude_changes_nothing() {
        let env = HostEnv {
            path: Some(fixtures().empty_dir.as_os_str().to_owned()),
            shell: Some(PathBuf::from("/bin/sh")),
        };
        assert_eq!(env.login_path("surely-not-a-program-anywhere"), None);
        let env = HostEnv {
            path: Some(fixtures().claude_dir.as_os_str().to_owned()),
            shell: None,
        };
        assert_eq!(env.login_path("claude"), None, "the inherited PATH had it");
    }

    /// What `subscribe_session` runs: a window that reloaded re-attaches a fresh sink to a session still running.
    #[test]
    fn subscribe_session_reattaches_to_a_running_session_by_its_id_string() {
        let dir = Dir::new("resubscribe");
        let hosted = sessions();
        let id = Uuid::new_v4();
        hosted
            .launch(
                id,
                &sh("echo before; sleep 0.4; echo after", &[]),
                &dir.0,
                80,
                24,
            )
            .unwrap();
        wait_until("the first line", || screen(&hosted, id).contains("before"));
        let first = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&first);
        subscribe_by_id(&hosted, &id.to_string(), move |chunk| {
            lock(&sink).extend_from_slice(chunk);
            true
        })
        .unwrap();
        // The page reloads: the first channel is gone (its sink says so), and a fresh one is attached.
        let second = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&second);
        subscribe_by_id(&hosted, &id.to_string(), move |chunk| {
            lock(&sink).extend_from_slice(chunk);
            true
        })
        .unwrap();
        wait_until("the later line", || contains(&lock(&second), "after"));
        let text = String::from_utf8(lock(&second).clone()).unwrap();
        assert_eq!(
            text.matches("before").count(),
            1,
            "the backlog is replayed once: {text:?}"
        );
        assert!(
            !contains(&lock(&first), "after"),
            "the replaced sink still receives output"
        );

        let sink = |_: &[u8]| true;
        let err = subscribe_by_id(&hosted, "not-a-uuid", sink).unwrap_err();
        assert!(err.contains("not a session id"), "{err}");
        let err = subscribe_by_id(&hosted, &Uuid::new_v4().to_string(), sink).unwrap_err();
        assert!(err.contains("no hosted session"), "{err}");
    }

    #[test]
    fn a_session_id_can_only_be_hosted_once() {
        let dir = Dir::new("twice");
        let hosted = sessions();
        let id = Uuid::new_v4();
        hosted
            .launch(id, &["cat".to_owned()], &dir.0, 80, 24)
            .unwrap();
        let err = hosted
            .launch(id, &["cat".to_owned()], &dir.0, 80, 24)
            .unwrap_err();
        assert!(err.contains("already hosted"), "{err}");
        hosted.kill(id).unwrap();
        hosted
            .launch(id, &["cat".to_owned()], &dir.0, 80, 24)
            .unwrap();
        hosted.kill_all();
    }

    #[test]
    fn kill_all_stops_every_session_at_once() {
        let dir = Dir::new("all");
        let mut hosted = sessions();
        hosted.grace = Duration::from_millis(1000);
        let ids: Vec<Uuid> = (0..3).map(|_| Uuid::new_v4()).collect();
        let sessions: Vec<_> = ids
            .iter()
            .map(|&id| {
                let marker = dir.0.join(id.to_string());
                hosted
                    .launch(id, &sh(STUBBORN, &[&marker]), &dir.0, 80, 24)
                    .unwrap();
                wait_until("the trap", || screen(&hosted, id).contains("ready"));
                hosted.get(id).unwrap()
            })
            .collect();

        let started = Instant::now();
        hosted.kill_all();
        let took = started.elapsed();

        assert!(sessions.iter().all(|s| !s.is_live()));
        assert_eq!(hosted.ids(), Vec::<Uuid>::new());
        assert!(
            took >= Duration::from_millis(1000),
            "{took:?}: no graceful wait"
        );
        assert!(
            took < Duration::from_millis(2600),
            "{took:?}: one session after another"
        );
    }
}
