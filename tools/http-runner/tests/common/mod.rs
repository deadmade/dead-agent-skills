#![allow(dead_code)]
//! A fake carrier on a loopback port, a temporary folder, a seeded store and the login page.

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fmt::Write as _;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock, PoisonError};
use std::thread;
use std::time::Duration;

use http_runner::login_page::{Open, Pages};
use http_runner::run::{self, Ctx, RunArgs};
use http_runner::store::Store;
use serde_json::{Value, json};
use tokio::task::JoinHandle;

/// One request as the carrier received it. Header names are lower case.
#[derive(Clone, Debug)]
pub struct Seen {
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

impl Seen {
    pub fn header(&self, name: &str) -> Option<&str> {
        let found = self.headers.iter().find(|(k, _)| k == name);
        found.map(|(_, v)| v.as_str())
    }

    pub fn host(&self) -> &str {
        self.header("host").unwrap_or_default()
    }
}

/// A raw HTTP response for a handler to return.
pub fn reply(status: &str, headers: &[(&str, &str)], body: &str) -> String {
    String::from_utf8(reply_bytes(status, headers, body.as_bytes())).unwrap()
}

/// `reply` for a body that is not UTF-8.
pub fn reply_bytes(status: &str, headers: &[(&str, &str)], body: &[u8]) -> Vec<u8> {
    let mut head = String::new();
    for (k, v) in headers {
        write!(head, "{k}: {v}\r\n").unwrap();
    }
    let mut raw = format!(
        "HTTP/1.1 {status}\r\n{head}Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    raw.extend_from_slice(body);
    raw
}

pub fn ok(body: &str) -> String {
    reply("200 OK", &[], body)
}

/// Answers on one port, so `localhost` and `127.0.0.1` reach it as two hosts.
pub struct Carrier {
    pub port: u16,
    seen: Arc<Mutex<Vec<Seen>>>,
    connections: Arc<AtomicUsize>,
}

impl Carrier {
    pub fn start<R: Into<Vec<u8>>>(handler: impl Fn(&Seen) -> R + Send + Sync + 'static) -> Self {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let connections = Arc::new(AtomicUsize::new(0));
        let handler = Arc::new(move |s: &Seen| -> Vec<u8> { handler(s).into() });
        let (log, count) = (seen.clone(), connections.clone());
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                count.fetch_add(1, Ordering::SeqCst);
                let (log, handler) = (log.clone(), handler.clone());
                std::thread::spawn(move || answer(stream, &log, &*handler));
            }
        });
        Self {
            port,
            seen,
            connections,
        }
    }

    pub fn seen(&self) -> Vec<Seen> {
        self.seen.lock().unwrap().clone()
    }

    pub fn paths(&self) -> Vec<String> {
        self.seen().into_iter().map(|s| s.path).collect()
    }

    pub fn connections(&self) -> usize {
        self.connections.load(Ordering::SeqCst)
    }
}

fn answer(mut stream: TcpStream, log: &Mutex<Vec<Seen>>, handler: &dyn Fn(&Seen) -> Vec<u8>) {
    let Some(request) = read(&mut stream) else {
        return;
    };
    log.lock().unwrap().push(request.clone());
    let _ = stream.write_all(&handler(&request));
}

fn read(stream: &mut TcpStream) -> Option<Seen> {
    let mut buf = Vec::new();
    let mut chunk = [0; 4096];
    let end = loop {
        if let Some(end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break end;
        }
        let n = stream.read(&mut chunk).ok().filter(|n| *n > 0)?;
        buf.extend_from_slice(&chunk[..n]);
    };
    let head = String::from_utf8_lossy(&buf[..end]).into_owned();
    let mut lines = head.split("\r\n");
    let mut start = lines.next()?.split(' ');
    let (method, path) = (start.next()?.to_string(), start.next()?.to_string());
    let headers: Vec<(String, String)> = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(k, v)| (k.trim().to_lowercase(), v.trim().to_string()))
        .collect();
    let len = headers
        .iter()
        .find(|(k, _)| k == "content-length")
        .map_or(0, |(_, v)| v.parse().unwrap_or(0));
    let mut body = buf.split_off(end + 4);
    while body.len() < len {
        let n = stream.read(&mut chunk).ok().filter(|n| *n > 0)?;
        body.extend_from_slice(&chunk[..n]);
    }
    let body = String::from_utf8_lossy(&body).into_owned();
    Some(Seen {
        method,
        path,
        headers,
        body,
    })
}

/// Hosts the store already knows, each with its typed values.
pub type Confirmed<'a> = &'a [(&'a str, &'a [(&'a str, &'a str)])];

/// A folder of this process's own for one test, emptied first.
pub fn tempdir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("http-runner-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// A store in `dir/store` that holds `confirmed`.
fn seeded_store(dir: &Path, confirmed: Confirmed) -> Arc<Store> {
    let store = Arc::new(Store::at(dir.join("store")));
    for (host, values) in confirmed {
        let typed: BTreeMap<_, _> = values
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect();
        store.save(host, &typed).unwrap();
    }
    store
}

/// The real agent-browser, a short copy of browser-core's `real_agent_browser`: `WEB_MCP_AGENT_BROWSER` if set, else
/// the installer's copy in `<CLAUDE_CONFIG_DIR or ~/.claude>/bin`. Unchecked, for the program a page opens with.
fn agent_browser_path() -> PathBuf {
    let var = |k: &str| {
        std::env::var_os(k)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
    };
    var("WEB_MCP_AGENT_BROWSER").unwrap_or_else(|| {
        let home = var(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default();
        var("CLAUDE_CONFIG_DIR")
            .unwrap_or_else(|| home.join(".claude"))
            .join("bin")
            .join(format!("agent-browser{}", std::env::consts::EXE_SUFFIX))
    })
}

/// `agent_browser_path`, for a test that drives the browser itself.
pub fn agent_browser() -> PathBuf {
    let path = agent_browser_path();
    assert!(
        path.is_file(),
        "agent-browser not found: run the installer or set WEB_MCP_AGENT_BROWSER"
    );
    path
}

/// Where agent-browser keeps its sessions' files (`.pid`, `.port`, `.target`, …): `$XDG_RUNTIME_DIR/agent-browser`
/// (0.43.0, on Windows too), else `~/.agent-browser`. On Windows this process points the variable at a temp folder of
/// its own first, so the files don't pile up in `~/.agent-browser`; not elsewhere, where Chrome finds its Wayland
/// socket under it and a socket path in a temp folder can outgrow agent-browser's ~103 bytes.
fn session_dir() -> &'static Path {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        if cfg!(windows) {
            let own = std::env::temp_dir()
                .join(format!("http-runner-agent-browser-{}", std::process::id()));
            // SAFETY: setting a variable is always safe on Windows (std's docs).
            unsafe { std::env::set_var("XDG_RUNTIME_DIR", own) };
        }
        let home = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
        std::env::var_os("XDG_RUNTIME_DIR")
            .filter(|d| !d.is_empty())
            .map_or_else(
                || PathBuf::from(std::env::var_os(home).unwrap()).join(".agent-browser"),
                |d| PathBuf::from(d).join("agent-browser"),
            )
    })
}

/// The program a page opens with when no browser can: agent-browser with a command it doesn't know, which starts and
/// exits with an error.
pub fn no_browser() -> Vec<OsString> {
    let program: Vec<OsString> = vec![agent_browser().into(), "no-such-command".into()];
    let out = Command::new(&program[0])
        .args(&program[1..])
        .arg("http://127.0.0.1:9/")
        .output()
        .unwrap();
    assert!(!out.status.success(), "agent-browser took the command");
    program
}

/// `program` as `HTTP_RUNNER_OPEN` takes it: one line each.
pub fn open_hook(program: &[OsString]) -> String {
    let lines: Vec<_> = program.iter().map(|a| a.to_string_lossy()).collect();
    lines.join("\n")
}

/// Where a test's login page opens.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Page {
    /// Nowhere: every host is confirmed, and a page that opens anyway has no program to start, so the run fails.
    Never,
    /// In real Chrome through agent-browser.
    Browser,
    /// In `no_browser`'s program.
    NoBrowser,
}

/// Whether a `Browser` has its Chrome: one at a time, since a dozen at once abort pages they are sent to.
static ONE: (Mutex<bool>, Condvar) = (Mutex::new(false), Condvar::new());

/// One session of the real agent-browser, whose Chrome shows the login pages; dropping it closes it.
pub struct Browser {
    session: String,
    started: AtomicBool,
    /// Each login page the session showed, in order.
    seen: Mutex<Vec<String>>,
}

impl Browser {
    pub fn new(tag: &str) -> Arc<Self> {
        session_dir();
        Arc::new(Self {
            session: format!("http-runner-{tag}-{}", std::process::id()),
            started: AtomicBool::new(false),
            seen: Mutex::default(),
        })
    }

    /// The program for `page`; for the browser it waits for the other tests' Chrome to close, then starts this
    /// session's first, since a cold start can abort the first page it is sent to (`net::ERR_ABORTED`).
    pub fn program(&self, page: Page) -> Vec<OsString> {
        match page {
            Page::Never => Vec::new(),
            Page::NoBrowser => no_browser(),
            Page::Browser => {
                let mut busy = ONE.0.lock().unwrap_or_else(PoisonError::into_inner);
                while *busy {
                    busy = ONE.1.wait(busy).unwrap_or_else(PoisonError::into_inner);
                }
                *busy = true;
                drop(busy);
                self.started.store(true, Ordering::SeqCst);
                self.call(&["open", "about:blank"]);
                let args = ["--session", &self.session, "open"];
                let mut program = vec![agent_browser().into_os_string()];
                program.extend(args.iter().map(OsString::from));
                program
            }
        }
    }

    fn call(&self, args: &[&str]) -> String {
        let out = Command::new(agent_browser())
            .args(["--session", &self.session])
            .args(args)
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&out.stderr);
        assert!(out.status.success(), "agent-browser {args:?}: {stderr}");
        String::from_utf8_lossy(&out.stdout).trim().to_owned()
    }

    /// The login pages shown so far, the current one read first.
    pub fn addresses(&self) -> Vec<String> {
        assert!(self.started.load(Ordering::SeqCst), "no browser started");
        let mut seen = self.seen.lock().unwrap();
        let url = self.call(&["get", "url"]);
        if url.starts_with("http://127.0.0.1:") && seen.last() != Some(&url) {
            seen.push(url);
        }
        seen.clone()
    }

    /// The `n`th login page (from 1) the session showed, from a thread that may block.
    pub fn wait_address(&self, n: usize) -> String {
        for _ in 0..300 {
            if let Some(address) = self.addresses().get(n - 1) {
                return address.clone();
            }
            thread::sleep(Duration::from_millis(100));
        }
        panic!("the browser showed no login page {n}");
    }

    /// `wait_address` for a test on the runtime whose task opens the page.
    pub async fn address(self: &Arc<Self>, n: usize) -> String {
        for _ in 0..300 {
            let browser = self.clone();
            let shown =
                tokio::task::spawn_blocking(move || browser.addresses().get(n - 1).cloned());
            if let Some(address) = shown.await.unwrap() {
                return address;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        panic!("the browser showed no login page {n}");
    }

    /// Types `pairs` (each field's name and value) into `page`, which the browser must be showing, and saves it; the
    /// page must answer that it saved.
    pub fn submit(&self, page: &str, pairs: &[(&str, &str)]) {
        let shown = self.addresses();
        let current = shown.last().map(String::as_str);
        assert_eq!(current, Some(page), "another page is shown");
        for (name, value) in pairs {
            self.call(&["fill", &format!("[name=\"{name}\"]"), value]);
        }
        self.call(&["click", "button"]);
        self.call(&["wait", "--fn", "document.title === 'Saved'"]);
    }

    /// Closes the session, its daemon and its Chrome, if it started.
    pub fn close(&self) {
        if self.started.swap(false, Ordering::SeqCst) {
            let session = &self.session;
            let _ = Command::new(agent_browser_path())
                .args(["--session", session, "close"])
                .output();
            // agent-browser's close leaves the session's tab binding behind.
            let _ = std::fs::remove_file(session_dir().join(format!("{session}.target")));
            *ONE.0.lock().unwrap_or_else(PoisonError::into_inner) = false;
            ONE.1.notify_one();
        }
    }
}

impl Drop for Browser {
    fn drop(&mut self) {
        self.close();
    }
}

pub struct Rig {
    pub ctx: Arc<Ctx>,
    pub carrier: Carrier,
    pub store: Arc<Store>,
    pub dir: PathBuf,
    pub browser: Arc<Browser>,
}

/// A rig for hosts that are all confirmed, so no login page opens.
pub fn rig<R: Into<Vec<u8>>>(
    tag: &str,
    confirmed: Confirmed,
    handler: impl Fn(&Seen) -> R + Send + Sync + 'static,
) -> Rig {
    rig_with(tag, Page::Never, confirmed, handler)
}

pub fn rig_with<R: Into<Vec<u8>>>(
    tag: &str,
    page: Page,
    confirmed: Confirmed,
    handler: impl Fn(&Seen) -> R + Send + Sync + 'static,
) -> Rig {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let dir = tempdir(&format!("run-{tag}"));
    let store = seeded_store(&dir, confirmed);
    let browser = Browser::new(&format!("run-{tag}"));
    let pages = Pages::new(
        store.clone(),
        Open::Program(browser.program(page)),
        Duration::from_secs(60),
    );
    Rig {
        ctx: Arc::new(Ctx::new(store.clone(), pages).unwrap()),
        carrier: Carrier::start(handler),
        store,
        dir,
        browser,
    }
}

impl Rig {
    pub fn deadline(mut self, deadline: Duration) -> Self {
        Arc::get_mut(&mut self.ctx).unwrap().deadline = deadline;
        self
    }

    /// Writes `t.http`, with `PORT` standing for the carrier's port.
    pub fn file(&self, text: &str) -> PathBuf {
        let path = self.dir.join("t.http");
        let text = text.replace("PORT", &self.carrier.port.to_string());
        std::fs::write(&path, text).unwrap();
        path
    }

    pub async fn run(&self, file: &Path, request: &str) -> String {
        self.start(file, request, false).await.unwrap()
    }

    pub fn start(&self, file: &Path, request: &str, retype_login: bool) -> JoinHandle<String> {
        let ctx = self.ctx.clone();
        let args = RunArgs {
            file: file.to_path_buf(),
            request: request.into(),
            retype_login,
        };
        tokio::spawn(async move { run::run(&ctx, args).await })
    }

    /// The `n`th login page (from 1) the browser showed.
    pub async fn address(&self, n: usize) -> String {
        self.browser.address(n).await
    }

    /// Types `pairs` into the login page at `page` in the browser and saves it.
    pub fn submit(&self, page: &str, pairs: &[(&str, &str)]) {
        self.browser.submit(page, pairs);
    }

    /// Every file under `http-replies`, side files included: its path and its text.
    pub fn saved(&self) -> Vec<(PathBuf, String)> {
        fn walk(dir: &Path, out: &mut Vec<(PathBuf, String)>) {
            for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, out);
                } else {
                    let text = std::fs::read_to_string(&path).unwrap();
                    out.push((path, text));
                }
            }
        }
        let mut out = Vec::new();
        walk(&self.dir.join("http-replies"), &mut out);
        out
    }

    /// The saved `.json` files of one request, in name order.
    pub fn saved_for(&self, request: &str) -> Vec<String> {
        let folder = Path::new("http-replies").join("t").join(request);
        let mut found: Vec<_> = self
            .saved()
            .into_iter()
            .filter(|(p, _)| {
                p.extension().is_some_and(|e| e == "json")
                    && p.parent().is_some_and(|d| d.ends_with(&folder))
            })
            .collect();
        found.sort();
        found.into_iter().map(|(_, text)| text).collect()
    }
}

/// A port nothing listens on.
pub fn closed_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

/// The `http-runner` binary over stdio, initialized, with the browser and a login store of its own.
pub struct Mcp {
    /// The folder holding the store and the files a test writes.
    pub dir: PathBuf,
    browser: Arc<Browser>,
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    stderr: Option<thread::JoinHandle<String>>,
    next_id: u64,
}

#[allow(clippy::needless_pass_by_value)] // callers build the JSON inline with `json!`
impl Mcp {
    /// A server whose store already holds `confirmed` and whose login page opens as `page`, with `envs` set.
    pub fn start(tag: &str, page: Page, confirmed: Confirmed, envs: &[(&str, &str)]) -> Self {
        let dir = tempdir(&format!("mcp-{tag}"));
        seeded_store(&dir, confirmed);
        let browser = Browser::new(&format!("mcp-{tag}"));
        let mut child = Command::new(env!("CARGO_BIN_EXE_http-runner"))
            .env("HTTP_RUNNER_DIR", dir.join("store"))
            .env("HTTP_RUNNER_OPEN", open_hook(&browser.program(page)))
            .envs(envs.iter().copied())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        let mut stderr = child.stderr.take().unwrap();
        let stderr = thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.read_to_string(&mut text);
            text
        });
        let mut mcp = Self {
            dir,
            browser,
            child,
            stdin,
            stdout,
            stderr: Some(stderr),
            next_id: 1,
        };
        mcp.request(
            "initialize",
            json!({"protocolVersion":"2025-06-18","capabilities":{},
                   "clientInfo":{"name":"t","version":"0"}}),
        );
        mcp.send(&json!({"jsonrpc":"2.0","method":"notifications/initialized"}));
        mcp
    }

    fn send(&mut self, message: &Value) {
        let stdin = self.stdin.as_mut().unwrap();
        writeln!(stdin, "{message}").unwrap();
        stdin.flush().unwrap();
    }

    /// The whole JSON-RPC response, so a protocol error can be checked.
    pub fn request_raw(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}));
        loop {
            let mut line = String::new();
            assert!(
                self.stdout.read_line(&mut line).unwrap() > 0,
                "server exited"
            );
            let response: Value = serde_json::from_str(&line).unwrap();
            if response["id"].as_u64() == Some(id) {
                return response;
            }
        }
    }

    /// The response's `result`; a protocol error fails the test.
    pub fn request(&mut self, method: &str, params: Value) -> Value {
        let mut response = self.request_raw(method, params);
        assert!(response["error"].is_null(), "{response}");
        response["result"].take()
    }

    /// The text of a tool call's first block.
    pub fn call(&mut self, tool: &str, arguments: Value) -> String {
        let result = self.request("tools/call", json!({"name": tool, "arguments": arguments}));
        result["content"][0]["text"].as_str().unwrap().to_owned()
    }

    /// Writes `t.http` and returns its path.
    pub fn file(&self, text: &str) -> PathBuf {
        let path = self.dir.join("t.http");
        std::fs::write(&path, text).unwrap();
        path
    }

    /// The `n`th login page (from 1) the browser showed.
    pub fn address(&self, n: usize) -> String {
        self.browser.wait_address(n)
    }

    /// Types `pairs` on the first login page from another thread, since `call` blocks this one.
    pub fn type_login(
        &self,
        pairs: &'static [(&'static str, &'static str)],
    ) -> thread::JoinHandle<()> {
        let browser = self.browser.clone();
        thread::spawn(move || browser.submit(&browser.wait_address(1), pairs))
    }

    /// Closes the server's stdin as a client does on exit, waits for it and returns what it wrote to stderr.
    pub fn finish(mut self) -> String {
        self.stdin = None;
        self.child.wait().unwrap();
        // On Windows the browser it started inherited its stderr, which ends only once that browser does.
        self.browser.close();
        self.stderr.take().unwrap().join().unwrap()
    }
}

impl Drop for Mcp {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
