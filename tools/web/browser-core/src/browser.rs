//! agent-browser, driven as a child process: one `--json` call per action. Every session but the window's owner is
//! a tab of web-mcp's one browser window (`window.rs`), attached with `--cdp <url> --pin-tab`. Before a `click` or
//! `press` the tab is raised: `tab list` names it and one HTTP GET to the window's debug port activates it (`raise`).

use std::collections::{BTreeMap, BTreeSet};
use std::ffi::{OsStr, OsString};
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::{Value, json};
use tokio::io::AsyncWriteExt as _;
use tokio::process::Command;
use url::Url;

use crate::window::{Live, Window};

/// Sessions the fetch fallback names for itself; the `browser` tool may not use them.
const FETCH_PREFIX: &str = "web-mcp-fetch-";
/// The HTTP status of the tab's own navigation: a number on a loaded page (agent-browser 0.43.0 answered 403 for a
/// 403 page and 200 for a 200 and a `data:` page), `undefined` or 0 where the browser doesn't know it.
const STATUS_JS: &str = "performance.getEntriesByType('navigation')[0]?.responseStatus";

/// A session name for the `browser` tool: short (agent-browser's socket path is length-limited),
/// plain, not flag-like and not one of web-mcp's own.
///
/// # Errors
/// What is wrong with the name.
pub fn check_session(s: &str) -> Result<(), String> {
    let plain = (1..=32).contains(&s.len())
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        && !s.starts_with('-');
    if !plain {
        return Err("session must be 1-32 characters of letters, digits, `_` and `-`, not starting with `-`".into());
    }
    if let Some(p) = [FETCH_PREFIX, "search-", "web-mcp-search-"]
        .into_iter()
        .find(|p| s.starts_with(p))
    {
        return Err(format!("session names starting with `{p}` are reserved"));
    }
    if s == "window" {
        return Err("the session name `window` is reserved".into());
    }
    Ok(())
}

/// Per call; a browser that hangs is killed.
const CALL_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug)]
pub enum BrowserError {
    Missing,
    Failed(String),
    /// `render`'s deadline passed.
    Timeout(Duration),
    /// The session's tab is gone (closed by hand, or with its window): `tab new` binds a new one.
    TabGone(String),
}

impl fmt::Display for BrowserError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing => f.write_str(
                "agent-browser is not installed. Install it with the web-mcp installer, or put agent-browser on PATH (https://github.com/vercel-labs/agent-browser/releases) and run `agent-browser install`.",
            ),
            Self::Failed(m) | Self::TabGone(m) => f.write_str(m),
            Self::Timeout(d) => write!(f, "the page did not finish within {} s", d.as_secs_f32()),
        }
    }
}

pub struct Browser {
    bin: PathBuf,
    /// How long the fetch fallback's batch may take.
    pub fallback_deadline: Duration,
    window: Window,
    /// The window as last seen; `None` until a call needed it.
    live: Mutex<Option<Live>>,
    /// The attached sessions this process has run and not closed, with their generation. Only these are ever
    /// closed: a `close` on a session without a daemon starts one and leaks a tab (web-mcp-one-window/findings.md).
    ran: Mutex<BTreeMap<String, u32>>,
    /// The sessions `bind` put in `ran` and no other call has run since; taken under `ran`'s lock.
    binding: Mutex<BTreeSet<String>>,
    /// The owner's config, from its first call; shutdown closes the owner under it.
    owner_config: Mutex<Option<PathBuf>>,
    /// Held from raising a tab until its input is sent: only the front tab takes input, so another session raising
    /// its own tab in between would hide this one again. It orders web-mcp's own raises against each other and nothing
    /// else: web-mcp's `tab new` (a rebind after `tab_gone`), a fresh session's first tab (agent-browser's own) and a
    /// person bringing another tab forward all run outside it, and may take the front from a session that is typing
    /// (unmeasured).
    front: tokio::sync::Mutex<()>,
    /// The client that activates a tab through Chrome's debug port, built on the first raise.
    http: std::sync::OnceLock<Option<reqwest::Client>>,
    /// Where agent-browser keeps its sessions' `.pid` and `.sock` files (`session_dir`); `None` on Windows.
    socket_dir: Option<PathBuf>,
    /// Where agent-browser keeps every session file, `.target` included (`session_dir`).
    pub(crate) session_dir: PathBuf,
}

/// A search's page load, in an engine's tab.
pub struct SearchRun<'a> {
    /// The `wait --fn` expression that is true once the page shows results, no results or a block.
    /// It must not end in `;`: agent-browser 0.43.0 never finishes such a wait, so it would run out its whole timeout.
    pub ready_js: &'a str,
}

/// How a call reaches the browser. Every call passes `--config`, drops the user's `AGENT_BROWSER_*` variables and
/// runs in the search dir.
#[derive(Clone, Copy)]
enum Via<'a> {
    /// The window's owner, under its slot's `profiles/<n>/agent-browser.json`.
    Owner(&'a Path),
    /// A tab of the window at `cdp`, under the attach config.
    Tab { config: &'a Path, cdp: &'a str },
    /// The attach config without `--cdp`: an attached session's `close`, which works after its Chrome died.
    Detached(&'a Path),
}

/// Attached calls' `AGENT_BROWSER_DEFAULT_TIMEOUT`: a constant, because it is part of agent-browser's daemon
/// fingerprint. A search's `wait` carries its own `--timeout`.
pub const ATTACHED_TIMEOUT: Duration = Duration::from_secs(8);

/// Points `cmd` at the config with `--config` (and, for a tab, the window), runs it in the search dir and drops every
/// `AGENT_BROWSER_*` variable of `env` (web-mcp's), so nothing of the user's agent-browser setup applies.
fn isolate(cmd: &mut Command, via: Via<'_>, env: impl IntoIterator<Item = (OsString, OsString)>) {
    let (config, dir) = match via {
        // `<search dir>/profiles/<n>/agent-browser.json`
        Via::Owner(c) => (c, c.ancestors().nth(3)),
        Via::Tab { config, cdp } => {
            cmd.args(["--cdp", cdp, "--pin-tab"]);
            (config, config.parent())
        }
        Via::Detached(c) => (c, c.parent()),
    };
    cmd.arg("--config").arg(config);
    for (k, _) in env {
        // Windows names are case-insensitive.
        if k.to_string_lossy()
            .to_ascii_uppercase()
            .starts_with("AGENT_BROWSER_")
        {
            cmd.env_remove(k);
        }
    }
    if !matches!(via, Via::Owner(_)) {
        cmd.env(
            "AGENT_BROWSER_DEFAULT_TIMEOUT",
            ATTACHED_TIMEOUT.as_millis().to_string(),
        );
    }
    if let Some(dir) = dir {
        cmd.current_dir(dir);
    }
}

/// Whether `command` is input, which agent-browser reports as done while delivering nothing to a hidden tab
/// (agent-browser#2146). Measured 2026-11-06, in a hidden tab: in the replay that found it, `click` and `press`
/// delivered 0 of 3 each, while `fill`, `type` and `scroll` did their work there. The reads and `eval` were not
/// measured in a hidden tab. One machine, one browser.
fn is_input(command: &str) -> bool {
    matches!(command, "click" | "press")
}

/// How long input waits for the front tab before it goes on without the lock. A step holds it for a `tab list`, one
/// request to Chrome (at most `RAISE_TIMEOUT`) and the input batch, and only one tab can be in front, so engines type
/// one at a time while the waits last: a typed follow-up search takes about the sum of its engines' typing, not the
/// longest. A waiter that has waited `FRONT_WAIT` raises its own tab and types anyway, which takes the front from the
/// session typing then, so either may lose its keys (the search falls back to loading the URL, or the engine times
/// out); with four engines that starts at about 1.7 s a batch, because the fourth waits through three. How long one
/// step takes was not measured: the four-engine follow-ups of one live run finished in 6.1 to 8.3 s in all, which says
/// nothing of the longest batch. The 5 s is a guess: it lets a step finish, and a hung holder
/// costs each waiter up to 5 s of the 8 s the engines have for typing (`slow_typing_times_out_without_a_second_load`).
const FRONT_WAIT: Duration = Duration::from_secs(5);
/// How long Chrome's activate request may take. The 2 s is a guess, not a measured latency: the request goes to the
/// browser process on this machine, and a hung one costs each input this much before it goes on.
const RAISE_TIMEOUT: Duration = Duration::from_secs(2);

/// The client for Chrome's debug port: no redirects, and no proxy from the environment, because the port is on this
/// machine and a proxy would take the request to its own loopback (a refused activation, the click lost as before).
/// `None` when reqwest can't build a client (no TLS provider); the raise is then skipped.
fn loopback_client() -> Option<reqwest::Client> {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()
}
/// How long a `close` may take.
const CLOSE_TIMEOUT: Duration = Duration::from_secs(5);

/// How long `bind` waits for one tab: it runs before the engines' deadlines start, so it adds to the search.
const BIND_TIMEOUT: Duration = Duration::from_secs(2);
/// What a search batch keeps back from the daemon's wait for everything else: web-mcp-search/findings.md measured ~1 s
/// of process start, `open` and reads beyond the wait (3000/8000 ms waits: 4.0/8.9 s calls) and up to 2 s for a whole
/// warm batch, so 2 s lets a page that never gets ready still be read inside the deadline.
pub const READ_MARGIN: Duration = Duration::from_secs(2);

/// The folder agent-browser 0.43.0 keeps its sessions' files in, as it finds it (`get_socket_dir`):
/// `$XDG_RUNTIME_DIR/agent-browser`, on Windows too, else `~/.agent-browser`, else the temp dir's `agent-browser`. Its
/// `AGENT_BROWSER_SOCKET_DIR` comes first there, but every call drops it with the rest of `AGENT_BROWSER_*`.
fn session_dir() -> PathBuf {
    match std::env::var("XDG_RUNTIME_DIR") {
        Ok(d) if !d.is_empty() => PathBuf::from(d).join("agent-browser"),
        _ => std::env::home_dir().map_or_else(
            || std::env::temp_dir().join("agent-browser"),
            |h| h.join(".agent-browser"),
        ),
    }
}

/// Removes `session`'s `.target`, its tab binding, once its `close` succeeded: agent-browser 0.43.0's `close` removes
/// the session's other files but keeps this one (it unpins it), so one per session would pile up. Never after a failed
/// or cut-short close: the daemon may still be alive, and other sessions read its binding to keep off its tab. A
/// missing file is no error.
fn forget_binding(dir: &Path, session: &str) {
    let _ = std::fs::remove_file(dir.join(format!("{session}.target")));
}

/// The agent-browser session of `key` in generation `g`.
fn name(key: &str, g: u32) -> String {
    let pid = std::process::id(); // sessions are global per user: another web-mcp may be running
    match key.strip_prefix(FETCH_PREFIX) {
        Some(k) => format!("{FETCH_PREFIX}{pid}-g{g}-{k}"),
        None => format!("web-mcp-{pid}-g{g}-{key}"),
    }
}

/// Runs `bin --session <session> --json <via's flags> … <args>` and returns its `data`.
async fn call(
    bin: &Path,
    session: &str,
    args: &[String],
    stdin: Option<&str>,
    via: Via<'_>,
) -> Result<Value, BrowserError> {
    let mut cmd = Command::new(bin);
    cmd.args(["--session", session, "--json"]);
    isolate(&mut cmd, via, std::env::vars_os());
    let mut child = cmd
        .args(args)
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => BrowserError::Missing,
            _ => BrowserError::Failed(format!("could not start agent-browser: {e}")),
        })?;
    let mut pipe = child.stdin.take();
    let write = async move {
        if let (Some(input), Some(pipe)) = (stdin, pipe.as_mut()) {
            let _ = pipe.write_all(input.as_bytes()).await; // a dead child shows in its output
        }
        drop(pipe); // EOF
    };
    // The write runs beside the reads, so a big input can't deadlock on a full pipe, and both
    // sit under the timeout; dropping the future on timeout kills the child (kill_on_drop).
    let (out, ()) = tokio::time::timeout(CALL_TIMEOUT, async {
        let (out, ()) = tokio::join!(child.wait_with_output(), write);
        (out, ())
    })
    .await
    .map_err(|_| BrowserError::Failed("agent-browser did not answer within 60 s".into()))?;
    let out = out.map_err(|e| BrowserError::Failed(e.to_string()))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let Ok(v) = serde_json::from_str::<Value>(stdout.trim()) else {
        let err = String::from_utf8_lossy(&out.stderr);
        let msg = format!("{}{}", stdout.trim(), err.trim());
        return Err(BrowserError::Failed(if msg.is_empty() {
            format!("agent-browser exited with {} and no output", out.status)
        } else {
            msg
        }));
    };
    if v["success"] == false {
        return Err(if v["code"] == "tab_gone" {
            BrowserError::TabGone(failure(&v))
        } else {
            BrowserError::Failed(failure(&v))
        });
    }
    Ok(v.get("data").cloned().unwrap_or(v))
}

/// `tab close` while `session`'s generation is current (`cdp`), then `close` without `--cdp`, which also works
/// after its Chrome died. A tab already gone counts as closed. When both succeed, the session's `.target` in `dir` goes
/// too.
async fn end(
    bin: &Path,
    session: &str,
    config: &Path,
    cdp: Option<&str>,
    dir: &Path,
) -> Result<Value, BrowserError> {
    let tab = match cdp {
        Some(cdp) => {
            let tab_close = ["tab".to_owned(), "close".to_owned()];
            let via = Via::Tab { config, cdp };
            call(bin, session, &tab_close, None, via).await
        }
        None => Ok(Value::Null),
    };
    let tab = match tab {
        Err(BrowserError::TabGone(_)) => Ok(Value::Null),
        // shortcut: this text is assumed, not seen; the owner's blank tabs keep it from happening.
        Err(BrowserError::Failed(m)) if m.contains("Cannot close the last tab") => Ok(Value::Null),
        t => t,
    };
    let close = ["close".to_owned()];
    let closed = call(bin, session, &close, None, Via::Detached(config)).await;
    let ended = tab.and(closed);
    if ended.is_ok() {
        forget_binding(dir, session);
    }
    ended
}

impl Browser {
    /// `name` as configured: found on PATH, or kept as given so that running it reports `Missing`.
    #[must_use]
    pub fn new(name: &str, window: Window) -> Self {
        let session_dir = session_dir();
        Self {
            // Absolute: calls run in the search dir.
            bin: Self::resolve(name)
                .map_or_else(|| name.into(), |p| std::path::absolute(&p).unwrap_or(p)),
            fallback_deadline: Duration::from_secs(30),
            window,
            live: Mutex::default(),
            ran: Mutex::default(),
            binding: Mutex::default(),
            owner_config: Mutex::default(),
            front: tokio::sync::Mutex::default(),
            http: std::sync::OnceLock::new(),
            // A Windows daemon listens on a port (`.port`), not a `.sock`: `session_gone` waits its flat 1 s there.
            socket_dir: (!cfg!(windows)).then(|| session_dir.clone()),
            session_dir,
        }
    }

    /// The key of the user's session `name`. Run, batch and close map it to the current generation's agent-browser
    /// session, `web-mcp-<pid>-g<n>-<name>`: the pid keeps two servers off the same tab. At most `web-mcp-` + 10 pid
    /// digits + `-g99-` (longer after 99 browser restarts) + 32 name characters = 55 bytes, which leaves room in
    /// agent-browser's ~103-byte socket path.
    #[must_use]
    pub fn session(&self, name: &str) -> String {
        name.to_owned()
    }

    /// Starts the window, or asks its owner whether Chrome came back on a new url: before any deadline starts.
    ///
    /// # Errors
    /// When there is no search folder, browser or extension, or the owner fails.
    pub async fn warm(&self) -> Result<(), BrowserError> {
        self.live(true).await.map(drop)
    }

    /// Binds each of `keys`' tabs that no call has run in this window yet, all at once, each within `BIND_TIMEOUT`,
    /// after `warm` and before any of them navigates: a session's first call waits on another tab's pending page
    /// load in agent-browser 0.43.0 (measured: 4 s headless, 10 s and more in the window). A tab that doesn't bind is
    /// left to its first call, as before, and forgotten again unless another call ran it meanwhile, so the next `bind`
    /// tries it again; while it binds it stays in `ran`, so `close_all` still ends a daemon it may have started. The
    /// window's lock, held throughout, keeps a second caller from running any of these keys before their binds end:
    /// it waits, then finds them run.
    ///
    /// # Panics
    /// When another thread panicked holding the window or session lock.
    pub async fn bind(&self, keys: &[String]) {
        let _window = self.window.hold().await;
        let live = self.live.lock().expect("window").clone();
        let (Some(live), Ok(config)) = (live, self.window.attach_config()) else {
            return;
        };
        let fresh: Vec<String> = {
            let mut ran = self.ran.lock().expect("sessions");
            let mut binding = self.binding.lock().expect("binds");
            keys.iter()
                .map(|k| name(k, live.r#gen))
                .filter(|s| ran.insert(s.clone(), live.r#gen).is_none())
                .inspect(|s| {
                    binding.insert(s.clone());
                })
                .collect()
        };
        let via = Via::Tab {
            config: &config,
            cdp: &live.url,
        };
        let get_url = ["get".to_owned(), "url".to_owned()];
        let bound =
            futures::future::join_all(fresh.iter().map(|s| {
                tokio::time::timeout(BIND_TIMEOUT, self.run_with(s, &get_url, None, via))
            }))
            .await;
        let mut ran = self.ran.lock().expect("sessions");
        let mut binding = self.binding.lock().expect("binds");
        for (s, b) in fresh.iter().zip(bound) {
            if binding.remove(s) && !matches!(b, Ok(Ok(_))) {
                ran.remove(s);
            }
        }
    }

    /// The window: the one last seen unless `fresh` (or none was), else the owner's answer now. A newer generation
    /// closes the old one's sessions in the background.
    async fn live(&self, fresh: bool) -> Result<Live, BrowserError> {
        let cached = self.live.lock().expect("window").clone();
        if !fresh && let Some(l) = cached {
            return Ok(l);
        }
        let now = self.window.live(self).await.map_err(BrowserError::Failed)?;
        let renewed = {
            let mut cur = self.live.lock().expect("window");
            // A racing call already saw this generation or a later one.
            if let Some(c) = cur.as_ref().filter(|c| c.r#gen >= now.r#gen) {
                return Ok(c.clone());
            }
            cur.replace(now.clone()).is_some()
        };
        if renewed {
            self.retire(now.r#gen);
        }
        Ok(now)
    }

    /// Closes, in the background and without `--cdp`, the sessions of generations before `current`: their Chrome is
    /// gone.
    fn retire(&self, current: u32) {
        let old: BTreeMap<String, u32> = {
            let mut ran = self.ran.lock().expect("sessions");
            let (old, keep) = std::mem::take(&mut *ran)
                .into_iter()
                .partition(|(_, g)| *g < current);
            *ran = keep;
            old
        };
        if old.is_empty() {
            return;
        }
        let Ok(config) = self.window.attach_config() else {
            return;
        };
        let (bin, dir) = (self.bin.clone(), self.session_dir.clone());
        tokio::spawn(async move {
            futures::future::join_all(old.keys().map(|s| {
                let close = end(&bin, s, &config, None, &dir);
                tokio::time::timeout(CLOSE_TIMEOUT, close)
            }))
            .await;
        });
    }

    /// Notes `key`'s session in generation `g` as run, and returns it.
    fn track(&self, key: &str, g: u32) -> String {
        let s = name(key, g);
        let mut ran = self.ran.lock().expect("sessions");
        ran.insert(s.clone(), g);
        self.binding.lock().expect("binds").remove(&s);
        s
    }

    /// Runs `op` in `key`'s tab of the window. A `click` or `press` first raises the tab (`with_front`: `tab list` and
    /// one request to Chrome's debug port). A gone tab gets one `tab new` and one retry; any other failure asks the
    /// owner again, and a new generation (Chrome came back) gets one retry under its new name.
    async fn attached(&self, key: &str, op: Op<'_>) -> Result<Value, BrowserError> {
        let mut live = self.live(false).await?;
        let config = self.window.attach_config().map_err(BrowserError::Failed)?;
        let (mut rebound, mut renewed) = (false, false);
        loop {
            let session = self.track(key, live.r#gen);
            let via = Via::Tab {
                config: &config,
                cdp: &live.url,
            };
            let answer = match op {
                Op::Run(args) if args.first().is_some_and(|c| is_input(c)) => {
                    let input = self.run_with(&session, args, None, via);
                    self.with_front(&session, via, input).await
                }
                Op::Run(args) => self.run_with(&session, args, None, via).await,
                Op::Batch(cmds, may_fail) => self
                    .batch_with(&session, cmds, via, may_fail, false)
                    .await
                    .map(Value::Array),
            };
            match answer {
                Err(BrowserError::TabGone(_)) if !rebound => {
                    rebound = true;
                    let new = ["tab".to_owned(), "new".to_owned()];
                    self.run_with(&session, &new, None, via).await?;
                }
                Err(BrowserError::Failed(e)) if !renewed => {
                    renewed = true;
                    match self.live(true).await {
                        Ok(now) if now.r#gen != live.r#gen => live = now,
                        _ => return Err(BrowserError::Failed(e)),
                    }
                }
                answer => return answer,
            }
        }
    }

    /// Closes `key`'s tab (a key from `session`) and forgets it; a session this process never ran is left alone.
    ///
    /// # Errors
    /// As `run`; never retried.
    ///
    /// # Panics
    /// When another thread panicked holding the window or session lock.
    pub async fn close(&self, key: &str) -> Result<Value, BrowserError> {
        let live = self.live.lock().expect("window").clone();
        let Some(live) = live else {
            return Ok(json!({"closed": false}));
        };
        let session = name(key, live.r#gen);
        if self
            .ran
            .lock()
            .expect("sessions")
            .remove(&session)
            .is_none()
        {
            return Ok(json!({"closed": false}));
        }
        let config = self.window.attach_config().map_err(BrowserError::Failed)?;
        if !key.starts_with(FETCH_PREFIX) {
            return end(
                &self.bin,
                &session,
                &config,
                Some(&live.url),
                &self.session_dir,
            )
            .await;
        }
        // A fetch key is used once, so its close gets its own task: a caller that stops waiting (`render`'s 5 s)
        // doesn't stop it, and a tab whose page is still loading (its `tab close` waits behind the load, measured)
        // still gets its session closed afterwards. Any other key may be in use again by then, and a late `close`
        // would end the daemon under it: dropping that close kills it before it sends more.
        let (bin, dir) = (self.bin.clone(), self.session_dir.clone());
        tokio::spawn(async move { end(&bin, &session, &config, Some(&live.url), &dir).await })
            .await
            .map_err(|e| BrowserError::Failed(e.to_string()))?
    }

    /// Closes every session still open, in parallel, best effort, each within 5 s; then the owner, which closes
    /// Chrome.
    ///
    /// # Panics
    /// When another thread panicked holding the window, session or owner lock.
    pub async fn close_all(&self) {
        let ran = std::mem::take(&mut *self.ran.lock().expect("sessions"));
        let live = self.live.lock().expect("window").clone();
        if let (Some(live), Ok(config)) = (&live, self.window.attach_config()) {
            futures::future::join_all(ran.iter().map(|(s, g)| {
                let cdp = (*g == live.r#gen).then_some(live.url.as_str());
                let close = end(&self.bin, s, &config, cdp, &self.session_dir);
                tokio::time::timeout(CLOSE_TIMEOUT, close)
            }))
            .await;
        }
        let owner = self.owner_config.lock().expect("owner").clone();
        if let Some(config) = owner {
            self.close_owner(&self.window.owner(), &config).await;
        }
    }

    /// Closes the owner `session` under `config`, within 5 s, and removes its `.target` once that succeeded.
    pub(crate) async fn close_owner(&self, session: &str, config: &Path) {
        let close = ["close".to_owned()];
        let closed =
            tokio::time::timeout(CLOSE_TIMEOUT, self.run_owner(session, config, &close)).await;
        if matches!(closed, Ok(Ok(_))) {
            forget_binding(&self.session_dir, session);
        }
    }

    /// A path to an existing file, or `name` found on PATH. On Windows each `PATHEXT` extension is
    /// tried too, so npm's `agent-browser.cmd` resolves (Rust runs `.cmd` files through cmd.exe itself).
    #[must_use]
    fn resolve(name: &str) -> Option<PathBuf> {
        Self::resolve_on(name, &std::env::var_os("PATH").unwrap_or_default())
    }

    /// `resolve` with `path` in place of PATH.
    #[must_use]
    pub(crate) fn resolve_on(name: &str, path: &OsStr) -> Option<PathBuf> {
        let exts = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
        resolve_in(name, path, cfg!(windows).then_some(exts.as_str()))
    }

    /// Runs `agent-browser … <args>` in `key`'s tab and returns its `data`.
    ///
    /// # Errors
    /// `Missing` when the binary can't be started; `Failed` when there is no window, or the call times out,
    /// answers `{"success": false}` or answers no JSON; `TabGone` when the tab is gone twice.
    pub async fn run(&self, key: &str, args: &[String]) -> Result<Value, BrowserError> {
        self.attached(key, Op::Run(args)).await
    }

    /// Runs `args` in the window's owner `session`, under its `config` (`<search dir>/profiles/<n>/agent-browser.json`),
    /// in the search dir, with agent-browser's default timeout.
    ///
    /// # Errors
    /// As `run`.
    pub(crate) async fn run_owner(
        &self,
        session: &str,
        config: &Path,
        args: &[String],
    ) -> Result<Value, BrowserError> {
        *self.owner_config.lock().expect("owner") = Some(config.to_owned());
        self.run_with(session, args, None, Via::Owner(config)).await
    }

    async fn run_with(
        &self,
        session: &str,
        args: &[String],
        stdin: Option<&str>,
        via: Via<'_>,
    ) -> Result<Value, BrowserError> {
        call(&self.bin, session, args, stdin, via).await
    }

    /// Runs `commands` as one `batch --json` (read from stdin, so no value is parsed as a flag) in `key`'s tab and
    /// returns each command's result.
    ///
    /// # Errors
    /// As `run`, or when the answer is not one result per command or a command failed.
    pub async fn batch(
        &self,
        key: &str,
        commands: &[Vec<&str>],
    ) -> Result<Vec<Value>, BrowserError> {
        let answer = self.attached(key, Op::Batch(commands, None)).await;
        answer.map(entries)
    }

    /// Runs `commands` as one `batch --json --bail` in `key`'s tab of the window as last seen, before `until`, and
    /// returns each command's result. Unlike `batch`, it never binds a new tab or asks the owner again: the caller
    /// has another way to its page.
    ///
    /// # Errors
    /// `Timeout` once `until` passes (the call is killed), `TabGone` when the tab is gone, else as `batch`.
    pub async fn batch_once(
        &self,
        key: &str,
        commands: &[Vec<String>],
        until: std::time::Instant,
    ) -> Result<Vec<Value>, BrowserError> {
        let live = self.live(false).await?;
        let config = self.window.attach_config().map_err(BrowserError::Failed)?;
        let session = self.track(key, live.r#gen);
        let via = Via::Tab {
            config: &config,
            cdp: &live.url,
        };
        let cmds: Vec<Vec<&str>> = commands
            .iter()
            .map(|c| c.iter().map(String::as_str).collect())
            .collect();
        let left = until.saturating_duration_since(std::time::Instant::now());
        let input = commands
            .iter()
            .any(|c| c.first().is_some_and(|c| is_input(c)));
        let batch = self.batch_with(&session, &cmds, via, None, true);
        tokio::time::timeout_at(until.into(), async {
            if input {
                self.with_front(&session, via, batch).await
            } else {
                batch.await
            }
        })
        .await
        .unwrap_or(Err(BrowserError::Timeout(left)))
    }

    /// Runs `input` once `session`'s tab is the window's front one, and before any other session raises its own. A
    /// holder that hangs must not stall the rest: after `FRONT_WAIT` a waiter goes on without the lock, as it would
    /// have before the lock. Its raise then takes the front from the session that is typing, so either may lose its
    /// input; the alternative, to skip the raise then, would lose the late session's input instead and let a hung
    /// holder cost every other session its typing.
    async fn with_front<T>(
        &self,
        session: &str,
        via: Via<'_>,
        input: impl std::future::Future<Output = T>,
    ) -> T {
        let _front = tokio::time::timeout(FRONT_WAIT, self.front.lock()).await;
        self.raise(session, via).await;
        input.await
    }

    /// Brings `session`'s own tab to the front: `tab list` names it (the `active` row's `targetId`), and the
    /// window's debug port activates it with `/json/activate/<targetId>`. Never agent-browser's own `tab <id>`: that
    /// also raises the tab, but makes the daemon forget its refs, so the next `click @e1` answers `Unknown ref`
    /// (measured). Best effort: a failed call, or no active row (the tab is gone: the input then fails as `tab_gone`,
    /// and `attached` binds a new one), leaves the input to run as it is; a refused or failed activation is written to
    /// stderr and never fails the call.
    ///
    /// shortcut: this leans on agent-browser 0.41.1's `tab list` marking a session's own tab `active`, and on Chrome
    /// answering `/json/activate/<targetId>` on the debug port. Measured 2026-11-06 (Helium 0.18, one machine): a
    /// click reached the page 3 of 3 times through this code, 2 of 2 through a hand-made activation, and 0 of 3 before.
    /// Test input in a hidden tab again whenever the agent-browser pin moves.
    async fn raise(&self, session: &str, via: Via<'_>) {
        let Via::Tab { cdp, .. } = via else {
            return;
        };
        let list = ["tab".to_owned(), "list".to_owned()];
        let Ok(listing) = self.run_with(session, &list, None, via).await else {
            return;
        };
        let target = listing["tabs"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|t| t["active"] == true)
            .and_then(|t| t["targetId"].as_str())
            // The id is pasted into a URL path: Chrome's are hex, nothing else gets through.
            .filter(|id| {
                !id.is_empty()
                    && id
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            });
        let (Some(target), Ok(cdp)) = (target, Url::parse(cdp)) else {
            return;
        };
        let (Some(host), Some(port)) = (cdp.host_str(), cdp.port()) else {
            return;
        };
        let Some(http) = self.http.get_or_init(loopback_client) else {
            return;
        };
        let activated = http
            .get(format!("http://{host}:{port}/json/activate/{target}"))
            .timeout(RAISE_TIMEOUT)
            .send()
            .await;
        match activated {
            Ok(r) if r.status().is_success() => {}
            Ok(r) => eprintln!(
                "web-mcp: Chrome did not raise {session}'s tab: HTTP {}",
                r.status()
            ),
            Err(e) => eprintln!(
                "web-mcp: Chrome did not raise {session}'s tab: {}",
                e.without_url()
            ),
        }
    }

    /// `may_fail`: the index of a command whose failure doesn't fail the batch; `bail`: agent-browser stops at the
    /// first failed command.
    async fn batch_with(
        &self,
        session: &str,
        commands: &[Vec<&str>],
        via: Via<'_>,
        may_fail: Option<usize>,
        bail: bool,
    ) -> Result<Vec<Value>, BrowserError> {
        let input = json!(commands).to_string();
        let mut args = vec!["batch".to_owned(), "--json".to_owned()];
        if bail {
            args.push("--bail".to_owned());
        }
        let answer = self.run_with(session, &args, Some(&input), via).await?;
        // One entry per command: {"command", "success", "result"}.
        let entries = answer.as_array().ok_or_else(|| {
            BrowserError::Failed("agent-browser's batch answer is not a list".into())
        })?;
        if let Some(gone) = entries.iter().find(|e| e["code"] == "tab_gone") {
            return Err(BrowserError::TabGone(failure(gone)));
        }
        if let Some((_, bad)) = entries
            .iter()
            .enumerate()
            .find(|(i, e)| e["success"] == false && may_fail != Some(*i))
        {
            return Err(BrowserError::Failed(failure(bad)));
        }
        if entries.len() != commands.len() {
            return Err(BrowserError::Failed(
                "agent-browser's batch answered fewer results than commands".into(),
            ));
        }
        Ok(entries
            .iter()
            .map(|e| e.get("result").unwrap_or(&e["data"]).clone())
            .collect())
    }

    /// The rendered `<body>` of `url` and the URL the browser ended on (redirects included), from one batch in
    /// `key`'s tab within `deadline`. Without a `url` the batch opens nothing: it reads the tab as it is.
    ///
    /// Without `search`: the tab is closed again. With it: the batch waits on `ready_js` first, with `--timeout`
    /// `deadline` less `READ_MARGIN`, so a page that never gets ready (a consent wall, changed markup) times the
    /// wait out and is still read before the deadline: the parser decides what it is. That tab stays open for the
    /// next search unless the batch failed or the deadline passed.
    ///
    /// # Errors
    /// As `batch`, when the deadline passes, or when it answers no HTML or no URL.
    ///
    /// # Panics
    /// When another thread panicked holding the window or session lock.
    pub async fn render(
        &self,
        url: Option<&Url>,
        key: &str,
        search: Option<SearchRun<'_>>,
        deadline: Duration,
    ) -> Result<(String, Url), BrowserError> {
        let (html, landed, _) = self.render_read(url, key, search, deadline, false).await?;
        Ok((html, landed))
    }

    /// `render`, and with `status` the HTTP status of the tab's navigation, read in the same batch after the URL
    /// (`None` without `status`, and where the browser doesn't know it). A failed status read fails nothing.
    async fn render_read(
        &self,
        url: Option<&Url>,
        key: &str,
        search: Option<SearchRun<'_>>,
        deadline: Duration,
        status: bool,
    ) -> Result<(String, Url, Option<u16>), BrowserError> {
        // Never 0: what agent-browser makes of a zero timeout is unknown.
        let wait = deadline
            .saturating_sub(READ_MARGIN)
            .max(Duration::from_millis(100))
            .as_millis()
            .to_string();
        let mut cmds: Vec<Vec<&str>> = url.map(|u| vec!["open", u.as_str()]).into_iter().collect();
        let wait_at = cmds.len();
        if let Some(s) = &search {
            cmds.push(vec!["wait", "--fn", s.ready_js, "--timeout", &wait]);
        }
        cmds.extend([vec!["get", "html", "body"], vec!["get", "url"]]);
        if status {
            cmds.push(vec!["eval", STATUS_JS]);
        }
        // The HTML is data for the extractor: agent-browser's `--json` answer carries it whole.
        let may_fail = search
            .as_ref()
            .map(|_| wait_at)
            .or_else(|| status.then(|| cmds.len() - 1));
        let batch = self.attached(key, Op::Batch(&cmds, may_fail));
        let answer = tokio::time::timeout(deadline, batch)
            .await
            .unwrap_or(Err(BrowserError::Timeout(deadline)))
            .map(entries);
        // A fetch's tab never outlives the fetch; an engine's stays unless it failed (its page may be stuck).
        if search.is_none() || answer.is_err() {
            let session = self
                .live
                .lock()
                .expect("window")
                .as_ref()
                .map(|l| (name(key, l.r#gen), l.r#gen));
            let cut = tokio::time::timeout(CLOSE_TIMEOUT, self.close(key))
                .await
                .is_err();
            if search.is_some()
                && let Some((s, g)) = session
            {
                // A close cut short never ended the daemon: `close_all` ends it, unless the next search takes it.
                if cut {
                    self.ran.lock().expect("sessions").insert(s.clone(), g);
                }
                self.session_gone(&s).await;
            }
        }
        let answer = answer?;
        let field =
            |v: &Value, key: &str| v.as_str().or_else(|| v[key].as_str()).map(str::to_owned);
        // One entry per command: at least 3, the status read last.
        let n = answer.len() - usize::from(status);
        let html = field(&answer[n - 2], "html");
        let landed = field(&answer[n - 1], "url").and_then(|u| Url::parse(&u).ok());
        let code = status
            .then(|| {
                let v = &answer[n];
                v.as_u64().or_else(|| v["result"].as_u64())
            })
            .flatten()
            .and_then(|c| u16::try_from(c).ok())
            .filter(|c| *c != 0);
        html.zip(landed)
            .map(|(h, l)| (h, l, code))
            .ok_or_else(|| BrowserError::Failed("agent-browser returned no HTML or URL".into()))
    }

    /// Waits, at most 1 s, until agent-browser has removed `session`'s `.pid` and `.sock`: an `open` right after a
    /// `close` fails otherwise (web-mcp-search/findings.md, "Daemon behaviour"). Without a `socket_dir` (Windows): 1 s.
    async fn session_gone(&self, session: &str) {
        let Some(dir) = &self.socket_dir else {
            return tokio::time::sleep(Duration::from_secs(1)).await;
        };
        let files = ["pid", "sock"].map(|ext| dir.join(format!("{session}.{ext}")));
        let until = tokio::time::Instant::now() + Duration::from_secs(1);
        while files.iter().any(|f| f.exists()) && tokio::time::Instant::now() < until {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    /// The rendered `<body>` of `url` and the URL the browser ended on (redirects included), from one
    /// batch in a tab of its own that is closed again, within `deadline`. The window starts before the deadline.
    ///
    /// # Errors
    /// As `batch`, or when it answers no HTML or no URL.
    pub async fn rendered_html(
        &self,
        url: &Url,
        deadline: Duration,
    ) -> Result<(String, Url), BrowserError> {
        self.warm().await?;
        self.render(Some(url), &fetch_key(), None, deadline).await
    }

    /// `rendered_html`, and the HTTP status the browser's own load of `url` got: `None` where the browser doesn't
    /// know it (or the read failed).
    ///
    /// # Errors
    /// As `rendered_html`.
    pub async fn rendered_page(
        &self,
        url: &Url,
        deadline: Duration,
    ) -> Result<(String, Url, Option<u16>), BrowserError> {
        self.warm().await?;
        self.render_read(Some(url), &fetch_key(), None, deadline, true)
            .await
    }
}

/// A fetch's own tab key, new on every call.
fn fetch_key() -> String {
    static N: AtomicU64 = AtomicU64::new(0);
    format!("{FETCH_PREFIX}{}", N.fetch_add(1, Ordering::Relaxed))
}

/// What `attached` runs in a tab.
#[derive(Clone, Copy)]
enum Op<'a> {
    /// A call's args.
    Run(&'a [String]),
    /// A batch's commands, and the index of a command that may fail.
    Batch(&'a [Vec<&'a str>], Option<usize>),
}

/// A batch's results, from `attached`'s answer to an `Op::Batch`.
fn entries(v: Value) -> Vec<Value> {
    match v {
        Value::Array(a) => a,
        v => vec![v],
    }
}

fn failure(v: &Value) -> String {
    match v.get("error").or_else(|| v.get("message")) {
        Some(Value::String(s)) => s.clone(),
        Some(e) => e.to_string(),
        None => "agent-browser reported a failure".into(),
    }
}

fn resolve_in(name: &str, path: &OsStr, pathext: Option<&str>) -> Option<PathBuf> {
    let exts = pathext
        .into_iter()
        .flat_map(|e| e.split(';'))
        .filter(|e| !e.is_empty());
    let exts: Vec<&str> = std::iter::once("").chain(exts).collect();
    let find = |dir: &Path| {
        exts.iter().find_map(|ext| {
            let p = dir.join(format!("{name}{ext}"));
            p.is_file().then_some(p)
        })
    };
    if name.contains(['/', '\\']) {
        return find(Path::new(""));
    }
    std::env::split_paths(path).find_map(|d| find(&d))
}

/// The real agent-browser for tests: `WEB_MCP_AGENT_BROWSER` if set, else the installer's copy in
/// `<CLAUDE_CONFIG_DIR or ~/.claude>/bin`.
///
/// # Panics
///
/// When that file doesn't exist.
#[cfg(any(test, feature = "test-support"))]
#[must_use]
pub fn real_agent_browser() -> PathBuf {
    let var = |k: &str| {
        std::env::var_os(k)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
    };
    var("WEB_MCP_AGENT_BROWSER")
        .or_else(|| {
            let home = var(if cfg!(windows) { "USERPROFILE" } else { "HOME" });
            let config = var("CLAUDE_CONFIG_DIR").or_else(|| Some(home?.join(".claude")))?;
            Some(
                config
                    .join("bin")
                    .join(format!("agent-browser{}", std::env::consts::EXE_SUFFIX)),
            )
        })
        .filter(|p| p.is_file())
        .expect("agent-browser not found: run the installer or set WEB_MCP_AGENT_BROWSER")
}

/// Writes a minimal extension into the search folder `dir` in place of the cookie extension, so no test downloads it.
///
/// # Panics
///
/// When the files can't be written.
#[cfg(any(test, feature = "test-support"))]
pub fn test_extension(dir: &Path) {
    let ext = dir.join("extensions/idcac-8f70ab94");
    std::fs::create_dir_all(&ext).unwrap();
    std::fs::write(
        ext.join("manifest.json"),
        r#"{"manifest_version": 3, "name": "test", "version": "1"}"#,
    )
    .unwrap();
}

/// One real window at a time: every `Browser` in a test process shares the owner's name (it carries the pid) and, on
/// Windows, the `XDG_RUNTIME_DIR` its calls inherit.
#[cfg(any(test, feature = "test-support"))]
static ONE_REAL: Mutex<()> = Mutex::new(());

/// A `Browser` on the real agent-browser over a fresh search dir, whose window is Chrome for Testing (or
/// `WEB_MCP_CHROME`). Dropping it closes every session and the window, then removes the dir. On Windows the dir is
/// also the `XDG_RUNTIME_DIR` agent-browser keeps its session files in, so they go with it; not elsewhere, where
/// Chrome finds its Wayland socket there and a socket path in a temp dir can outgrow agent-browser's ~103 bytes. On
/// Windows the test process is tied to its children too, so a daemon a failed test never closed dies with it. Another
/// crate's test (`test-support`) installs rustls' crypto provider itself.
#[cfg(any(test, feature = "test-support"))]
pub struct Real {
    pub dir: PathBuf,
    pub b: Browser,
    runtime: Option<OsString>,
    _one: std::sync::MutexGuard<'static, ()>,
}

#[cfg(any(test, feature = "test-support"))]
impl Real {
    /// # Panics
    ///
    /// When the dir can't be made or agent-browser isn't found (`real_agent_browser`).
    #[must_use]
    pub fn new(tag: &str) -> Self {
        static TIED: std::sync::Once = std::sync::Once::new();
        TIED.call_once(crate::window::tie_to_process);
        let one = ONE_REAL
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let dir = std::env::temp_dir().join(format!("web-mcp-real-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        test_extension(&dir);
        let runtime = std::env::var_os("XDG_RUNTIME_DIR");
        if cfg!(windows) {
            // SAFETY: setting a variable is always safe on Windows (std's docs); `ONE_REAL` keeps the other real
            // tests' calls from reading it meanwhile.
            unsafe { std::env::set_var("XDG_RUNTIME_DIR", &dir) };
        }
        #[cfg(test)]
        let _ = rustls::crypto::ring::default_provider().install_default();
        let profiles = crate::profile::Profiles::new(Some(dir.clone())).unwrap();
        let bin = real_agent_browser();
        let b = Browser::new(
            &bin.to_string_lossy(),
            Window::new(Ok(std::sync::Arc::new(profiles))),
        );
        Self {
            dir,
            b,
            runtime,
            _one: one,
        }
    }

    /// Another window over the same search dir, for `Window`'s own tests; `b` runs its owner, and closes it on drop.
    ///
    /// # Panics
    ///
    /// When the dir's profiles can't be read.
    #[must_use]
    pub fn window(&self) -> Window {
        let profiles = crate::profile::Profiles::new(Some(self.dir.clone())).unwrap();
        Window::new(Ok(std::sync::Arc::new(profiles)))
    }
}

#[cfg(any(test, feature = "test-support"))]
impl Drop for Real {
    fn drop(&mut self) {
        // On a thread of its own: this one may be inside the test's runtime, or unwinding from it.
        let b = &self.b;
        std::thread::scope(|s| {
            let _ = s
                .spawn(|| {
                    tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                        .unwrap()
                        .block_on(b.close_all());
                })
                .join();
        });
        if cfg!(windows) {
            // SAFETY: as in `new`.
            unsafe {
                match &self.runtime {
                    Some(r) => std::env::set_var("XDG_RUNTIME_DIR", r),
                    None => std::env::remove_var("XDG_RUNTIME_DIR"),
                }
            }
        }
        // Windows frees a closed process's files a moment later.
        let until = std::time::Instant::now() + Duration::from_secs(5);
        while std::fs::remove_dir_all(&self.dir).is_err()
            && self.dir.exists()
            && std::time::Instant::now() < until
        {
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}

/// Ends the window's Chrome at `cdp` through its debug port (`Browser.close`), as a crash would: the owner's daemon
/// outlives it.
#[cfg(test)]
pub(crate) fn end_chrome(cdp: &str) {
    use std::io::{Read, Write};
    let url = Url::parse(cdp).unwrap();
    let (host, port) = (url.host_str().unwrap(), url.port().unwrap());
    let mut s = std::net::TcpStream::connect((host, port)).unwrap();
    // A Chrome that never answers fails the test instead of hanging it.
    s.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
    write!(
        s,
        "GET {} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
         Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
        url.path()
    )
    .unwrap();
    let mut head = Vec::new();
    let mut byte = [0];
    while !head.ends_with(b"\r\n\r\n") {
        s.read_exact(&mut byte).unwrap();
        head.push(byte[0]);
    }
    assert!(
        head.starts_with(b"HTTP/1.1 101"),
        "{}",
        String::from_utf8_lossy(&head)
    );
    // One masked text frame; a zero mask leaves the payload as it is.
    let msg = br#"{"id":1,"method":"Browser.close"}"#;
    let mut frame = vec![0x81, 0x80 | u8::try_from(msg.len()).unwrap(), 0, 0, 0, 0];
    frame.extend_from_slice(msg);
    s.write_all(&frame).unwrap();
    // Chrome drops the connection as it exits.
    let _ = s.read_to_end(&mut Vec::new());
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Instant;

    use super::*;

    /// The raw requests a `stub` was sent, in order.
    pub(crate) type Seen = Arc<std::sync::Mutex<Vec<String>>>;

    /// Serves `replies` (raw HTTP) in order, the last repeating, each after `delay`; returns the URL and the requests
    /// seen.
    pub(crate) fn stub(replies: Vec<String>, delay: std::time::Duration) -> (Url, Seen) {
        use std::io::{Read, Write};
        use std::sync::atomic::{AtomicUsize, Ordering};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
        let seen = Seen::default();
        let log = Arc::clone(&seen);
        let n = AtomicUsize::new(0);
        std::thread::spawn(move || {
            for mut c in listener.incoming().flatten() {
                let mut buf = [0; 8192];
                let len = c.read(&mut buf).unwrap_or(0);
                log.lock()
                    .unwrap()
                    .push(String::from_utf8_lossy(&buf[..len]).into_owned());
                std::thread::sleep(delay);
                let i = n.fetch_add(1, Ordering::SeqCst).min(replies.len() - 1);
                let _ = c.write_all(replies[i].as_bytes());
            }
        });
        (url, seen)
    }

    /// A raw HTTP reply for `stub`.
    pub(crate) fn reply(status: &str, headers: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}",
            body.len()
        )
    }

    /// The request paths of `seen`, in order.
    pub(crate) fn paths(seen: &Seen) -> Vec<String> {
        seen.lock()
            .unwrap()
            .iter()
            .map(|r| r.split_whitespace().nth(1).unwrap_or("").to_owned())
            .collect()
    }

    #[test]
    fn resolve_finds_cmd_via_pathext() {
        let dir = std::env::temp_dir().join(format!("web-mcp-resolve-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("agent-browser.CMD"), "").unwrap();
        let path = std::env::join_paths([&dir]).unwrap();
        let got = resolve_in("agent-browser", &path, Some(".COM;.EXE;.CMD"));
        assert_eq!(got, Some(dir.join("agent-browser.CMD")));
        assert_eq!(resolve_in("agent-browser", &path, None), None);
        assert_eq!(resolve_in("nope", &path, Some(".CMD")), None);
    }

    const READY_JS: &str = "!!(document.querySelector('#r'))";

    /// A page with a `#r` (`READY_JS`) and a button that retitles it `clicked`, served by a `stub`.
    fn page() -> (Url, Seen) {
        let body = "<title>P</title><button id=b onclick=\"document.title = 'clicked'\">Go</button><p id=r>ready</p>";
        stub(
            vec![reply("200 OK", "Content-Type: text/html\r\n", body)],
            Duration::ZERO,
        )
    }

    /// How often `seen` loaded the page: Chrome's own `/favicon.ico` requests left out.
    fn loads(seen: &Seen) -> usize {
        paths(seen).iter().filter(|p| *p != "/favicon.ico").count()
    }

    /// `args` as a command.
    fn cmd(args: &[&str]) -> Vec<String> {
        args.iter().map(|a| (*a).to_owned()).collect()
    }

    fn until() -> Instant {
        Instant::now() + Duration::from_secs(5)
    }

    /// A server that takes connections and never answers until it is dropped; then it closes them, so a page waiting
    /// on it fails at once.
    struct Silent {
        url: Url,
        held: Arc<std::sync::Mutex<Option<Vec<std::net::TcpStream>>>>,
    }

    impl Silent {
        fn new() -> Self {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let url =
                Url::parse(&format!("http://{}/slow", listener.local_addr().unwrap())).unwrap();
            let held = Arc::new(std::sync::Mutex::new(Some(Vec::new())));
            let h = Arc::clone(&held);
            std::thread::spawn(move || {
                for c in listener.incoming().flatten() {
                    // After the drop a connection is closed as it comes.
                    if let Some(v) = h.lock().unwrap().as_mut() {
                        v.push(c);
                    }
                }
            });
            Self { url, held }
        }
    }

    impl Drop for Silent {
        fn drop(&mut self) {
            self.held.lock().unwrap().take();
        }
    }

    /// The window's tabs as Chrome lists them: each page's URL.
    async fn tabs(b: &Browser) -> Vec<String> {
        let live = b.live.lock().unwrap().clone().unwrap();
        let port = Url::parse(&live.url).unwrap().port().unwrap();
        let list = loopback_client()
            .unwrap()
            .get(format!("http://127.0.0.1:{port}/json/list"))
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        let list: Value = serde_json::from_str(&list).unwrap();
        list.as_array()
            .unwrap()
            .iter()
            .filter(|t| t["type"] == "page")
            .map(|t| t["url"].as_str().unwrap().to_owned())
            .collect()
    }

    /// Opens the page in `keys`' tabs, in order, so the last one's is in front.
    async fn open_all(b: &Browser, url: &Url, keys: &[&str]) {
        for key in keys {
            let run = SearchRun { ready_js: READY_JS };
            b.render(Some(url), key, Some(run), Duration::from_secs(10))
                .await
                .unwrap();
        }
    }

    #[test]
    fn check_session_reserves_search() {
        for s in [
            "search-1",
            "web-mcp-search-ab12cd34-brave",
            "web-mcp-fetch-1",
            "window",
        ] {
            assert!(check_session(s).is_err(), "{s}");
        }
        for s in ["research", "searches", "s1", "windows"] {
            assert!(check_session(s).is_ok(), "{s}");
        }
    }

    #[test]
    fn search_calls_drop_agent_browser_env() {
        let mut cmd = Command::new("x");
        let config = Path::new("/srv/search/attach.json");
        let via = Via::Tab {
            config,
            cdp: "ws://127.0.0.1:1/devtools/browser/x",
        };
        let env = [
            ("AGENT_BROWSER_PROXY", "http://127.0.0.1:9"),
            ("agent_browser_headed", "1"),
            ("PATH", "/bin"),
        ]
        .map(|(k, v)| (OsString::from(k), OsString::from(v)));
        isolate(&mut cmd, via, env);
        let set: Vec<_> = cmd.as_std().get_envs().collect();
        assert!(
            set.contains(&(OsStr::new("AGENT_BROWSER_PROXY"), None)),
            "{set:?}"
        );
        assert!(
            set.contains(&(OsStr::new("agent_browser_headed"), None)),
            "{set:?}"
        );
        assert!(
            set.contains(&(
                OsStr::new("AGENT_BROWSER_DEFAULT_TIMEOUT"),
                Some(OsStr::new("8000"))
            )),
            "{set:?}"
        );
        assert!(!set.iter().any(|(k, _)| *k == "PATH"), "{set:?}");
        assert_eq!(
            cmd.as_std().get_current_dir(),
            Some(Path::new("/srv/search"))
        );
        let argv: Vec<_> = cmd.as_std().get_args().collect();
        assert_eq!(
            argv,
            [
                OsStr::new("--cdp"),
                OsStr::new("ws://127.0.0.1:1/devtools/browser/x"),
                OsStr::new("--pin-tab"),
                OsStr::new("--config"),
                config.as_os_str()
            ]
        );
    }

    /// A search page whose ready check never turns true is read anyway once its wait (the deadline less
    /// `READ_MARGIN`) runs out, before the deadline, and its tab stays open for the next search.
    #[tokio::test]
    async fn render_reads_a_page_that_never_gets_ready() {
        let r = Real::new("never");
        r.b.warm().await.unwrap();
        // Its daemon starts here, outside the deadline, as a search binds its tabs first.
        r.b.bind(&["search-google".to_owned()]).await;
        let (url, _) = page();
        let run = SearchRun { ready_js: "false" };
        let deadline = Duration::from_secs(5);
        let t = Instant::now();
        let (html, landed) =
            r.b.render(Some(&url), "search-google", Some(run), deadline)
                .await
                .unwrap();
        let took = t.elapsed();
        assert!(
            (deadline.saturating_sub(READ_MARGIN)..deadline).contains(&took),
            "{took:?}"
        );
        assert!(html.contains("ready"), "{html}");
        assert_eq!(landed, url);
        assert!(tabs(&r.b).await.contains(&url.to_string()));
    }

    /// A search without a URL reads the page its tab already shows, without loading it again.
    #[tokio::test]
    async fn render_search_without_open_reads_the_tab() {
        let r = Real::new("tab");
        let (url, seen) = page();
        let run = || SearchRun { ready_js: READY_JS };
        let deadline = Duration::from_secs(10);
        let loaded =
            r.b.render(Some(&url), "search-bing", Some(run()), deadline)
                .await
                .unwrap();
        let read =
            r.b.render(None, "search-bing", Some(run()), deadline)
                .await
                .unwrap();
        assert_eq!(read, loaded);
        assert_eq!(read.1, url);
        assert_eq!(loads(&seen), 1, "{:?}", paths(&seen));
    }

    /// A page that never loads ends `render` at its deadline. The tab's close waits behind the load and is cut short
    /// (`CLOSE_TIMEOUT`), then `session_gone` waits for the session's files (at most 1 s), so the call ends within
    /// those; the session is kept, and a later close ends it and its tab once the page has failed.
    #[tokio::test]
    async fn a_hung_page_ends_render_at_its_deadline_and_is_closed_later() {
        let r = Real::new("hung");
        r.b.warm().await.unwrap();
        let hung = Silent::new();
        let url = hung.url.clone();
        let key = "search-bing";
        let deadline = Duration::from_millis(500);
        let run = SearchRun { ready_js: READY_JS };
        let t = Instant::now();
        let err =
            r.b.render(Some(&url), key, Some(run), deadline)
                .await
                .unwrap_err();
        let took = t.elapsed();
        assert!(matches!(err, BrowserError::Timeout(_)), "{err}");
        let most = deadline + CLOSE_TIMEOUT + Duration::from_secs(1);
        // Slack for a loaded machine.
        let most = most + Duration::from_secs(2);
        assert!((deadline + CLOSE_TIMEOUT..most).contains(&took), "{took:?}");
        assert!(r.b.ran.lock().unwrap().contains_key(&name(key, 1)));
        drop(hung);
        r.b.close(key).await.unwrap();
        let left = tabs(&r.b).await;
        assert!(!left.contains(&url.to_string()), "{left:?}");
    }

    #[tokio::test(start_paused = true)]
    async fn session_gone_waits_for_the_files_up_to_a_second() {
        let dir = std::env::temp_dir().join(format!("web-mcp-gone-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut b = Browser::new("agent-browser", Window::new(Err("unused".into())));
        b.socket_dir = Some(dir.clone());
        let session = name("search-duckduckgo", 1);
        let files = ["pid", "sock"].map(|ext| dir.join(format!("{session}.{ext}")));
        for f in &files {
            std::fs::write(f, "").unwrap();
        }
        // Files that stay: the wait gives up after exactly 1 s.
        let t = tokio::time::Instant::now();
        b.session_gone(&session).await;
        assert_eq!(t.elapsed(), Duration::from_secs(1));
        // Files that go after 500 ms end the wait at the next poll, which runs every 50 ms.
        let gone = files.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            for f in &gone {
                std::fs::remove_file(f).unwrap();
            }
        });
        let t = tokio::time::Instant::now();
        b.session_gone(&session).await;
        let waited = t.elapsed();
        assert!(
            (Duration::from_millis(500)..=Duration::from_millis(550)).contains(&waited),
            "{waited:?}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A tab whose bind failed is bound again by the next `bind`; one that bound stays bound. Here the bind fails as
    /// it does when an earlier daemon of the session ended with its tab gone: agent-browser keeps the session's binding
    /// to that tab (its `.target`), and the next daemon answers `tab_gone`.
    #[tokio::test]
    async fn bind_tries_a_failed_tab_again() {
        let r = Real::new("bind");
        let b = &r.b;
        b.warm().await.unwrap();
        let live = b.live.lock().unwrap().clone().unwrap();
        let config = b.window.attach_config().unwrap();
        let via = Via::Tab {
            config: &config,
            cdp: &live.url,
        };
        let bing = name("search-bing", 1);
        // A daemon of bing's session that `b` never ran binds a tab, closes it, and ends.
        for c in [&["get", "url"][..], &["tab", "close"]] {
            call(&b.bin, &bing, &cmd(c), None, via).await.unwrap();
        }
        let close = cmd(&["close"]);
        let end = || call(&b.bin, &bing, &close, None, Via::Detached(&config));
        end().await.unwrap();
        let keys = ["search-bing".to_owned(), "search-brave".to_owned()];
        let bound = || {
            let ran = b.ran.lock().unwrap();
            keys.each_ref().map(|k| ran.contains_key(&name(k, 1)))
        };
        b.bind(&keys).await;
        assert_eq!(bound(), [false, true]);
        // Its daemon ended and its binding gone, as a successful `close` leaves it: bing binds now.
        end().await.unwrap();
        forget_binding(&b.session_dir, &bing);
        b.bind(&keys).await;
        assert_eq!(bound(), [true, true]);
    }

    /// `batch_once` stops at a failed command, and a gone tab fails it with `TabGone` without binding a new one: its
    /// caller has another way to the page.
    #[tokio::test]
    async fn batch_once_bails_and_never_rebinds() {
        let r = Real::new("once");
        let (url, _) = page();
        open_all(&r.b, &url, &["search-bing", "search-brave"]).await;
        let stop = [
            cmd(&["eval", "throw new Error('stop')"]),
            cmd(&["eval", "document.title = 'ran on'"]),
        ];
        let err = r.b.batch_once("search-brave", &stop, until()).await;
        assert!(matches!(err, Err(BrowserError::Failed(_))), "{err:?}");
        let title = [cmd(&["eval", "document.title"])];
        let t = r.b.batch_once("search-brave", &title, until()).await;
        assert_eq!(t.unwrap()[0]["result"], "P");
        r.b.run("search-bing", &cmd(&["tab", "close"]))
            .await
            .unwrap();
        let before = tabs(&r.b).await;
        let err =
            r.b.batch_once("search-bing", &[cmd(&["eval", "1"])], until())
                .await
                .unwrap_err();
        assert!(matches!(err, BrowserError::TabGone(_)), "{err}");
        assert_eq!(tabs(&r.b).await, before);
        assert_eq!(r.b.live.lock().unwrap().as_ref().unwrap().r#gen, 1);
    }

    const SEEN: &str = "document.visibilityState + ' ' + document.title";

    /// Input reaches only the front tab (agent-browser#2146): a batch with a `click` or `press` raises the session's
    /// own tab first (found with `tab list`, activated through Chrome's endpoint, never with agent-browser's own
    /// `tab <id>`, which makes it forget its refs); a batch that only reads does not. Chrome for Testing 158 delivers
    /// a click to a hidden tab anyway (measured), so the raise shows in the page's visibility, not in the click.
    #[tokio::test]
    async fn batch_once_raises_the_tab_only_for_input() {
        let r = Real::new("raise");
        let (url, _) = page();
        open_all(&r.b, &url, &["search-bing", "search-brave"]).await;
        let read =
            r.b.batch_once("search-bing", &[cmd(&["eval", SEEN])], until())
                .await;
        assert_eq!(read.unwrap()[0]["result"], "hidden P");
        let click = [cmd(&["click", "#b"]), cmd(&["eval", SEEN])];
        let clicked = r.b.batch_once("search-bing", &click, until()).await;
        assert_eq!(clicked.unwrap()[1]["result"], "visible clicked");
    }

    /// Sessions typing at once take the front tab one at a time: each raises its tab and sends its input as one step,
    /// so no other session's raise hides its tab before its input is done.
    #[tokio::test]
    async fn input_takes_the_front_tab_one_session_at_a_time() {
        let r = Real::new("front");
        let (url, _) = page();
        open_all(&r.b, &url, &["search-bing", "search-brave"]).await;
        let click = [cmd(&["click", "#b"]), cmd(&["eval", SEEN])];
        let (x, y) = tokio::join!(
            r.b.batch_once("search-bing", &click, until()),
            r.b.batch_once("search-brave", &click, until())
        );
        assert_eq!(x.unwrap()[1]["result"], "visible clicked");
        assert_eq!(y.unwrap()[1]["result"], "visible clicked");
    }
}
