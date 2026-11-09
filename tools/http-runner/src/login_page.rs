//! The local page where the user types a login: the only guard on which hosts get called and the
//! only place a secret enters the system. No text of a typed value, and not the page's address,
//! leaves this module except into the store and the browser.

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fmt::Write as _;
use std::io::{Read, Write as _};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError};
use std::time::{Duration, Instant};

use tokio::sync::{oneshot, watch};

use crate::store::Store;

const MAX_HEAD: usize = 16 * 1024;
const MAX_BODY: usize = 64 * 1024;
/// How long after a save an ask still gets `Saved`: long enough for an ask that was on its way
/// when the user saved, too short for a retyped login to be taken for that save.
const SAVED_REPLAY: Duration = Duration::from_secs(2);
const BAD: Option<&str> = Some("400 Bad Request");
const CSP: &str = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

/// A host and the names of the values its requests need; no names: the host only needs confirming.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostFields {
    pub host: String,
    pub names: Vec<String>,
}

/// What a run still lacks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ask {
    pub hosts: Vec<HostFields>,
}

/// How the page's address reaches the user.
pub enum Open {
    System,
    /// A program and its leading arguments; the address is appended as the last one.
    Program(Vec<OsString>),
}

/// How an `ask` ended. `Failed` holds neither the page's address nor a child process's output.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Saved,
    StillOpen,
    Replaced,
    Failed(String),
}

/// One page at a time, on one loopback listener that starts with the first `ask`.
pub struct Pages {
    shared: Arc<Shared>,
}

struct Shared {
    store: Arc<Store>,
    open: Open,
    lifetime: Duration,
    /// An open page, or a saved one that an ask within `SAVED_REPLAY` of the save still reports.
    page: Mutex<Option<Page>>,
    port: OnceLock<Result<u16, String>>,
}

struct Page {
    token: String,
    hosts: Vec<HostFields>,
    /// `None` while open.
    state: watch::Sender<Option<Outcome>>,
    saved: Option<Instant>,
}

impl Pages {
    /// A page lives `lifetime` from the ask that opened it.
    #[must_use]
    pub fn new(store: Arc<Store>, open: Open, lifetime: Duration) -> Self {
        let page = Mutex::new(None);
        let shared = Shared {
            store,
            open,
            lifetime,
            page,
            port: OnceLock::new(),
        };
        Self {
            shared: Arc::new(shared),
        }
    }

    /// Waits up to `wait` for the user to save what `ask` lacks. An ask the open page already
    /// covers waits on it; any other closes that page, whose waiters get `Replaced`, and opens a
    /// new one. A saved page answers one ask made within two seconds of the save, so a later ask,
    /// such as a retyped login, opens its own.
    pub async fn ask(&self, ask: Ask, wait: Duration) -> Outcome {
        let shared = &self.shared;
        let port = match shared.port.get_or_init(|| serve(shared.clone())) {
            Ok(port) => *port,
            Err(why) => return Outcome::Failed(why.clone()),
        };
        let (mut state, token, fresh) = {
            let mut slot = shared.page();
            if let Some(page) = slot.as_ref().filter(|p| p.live() && p.covers(&ask)) {
                (page.state.subscribe(), page.token.clone(), false)
            } else {
                let Some(token) = new_token() else {
                    return Outcome::Failed("cannot start the login page".into());
                };
                if let Some(old) = slot.take() {
                    old.finish(Outcome::Replaced);
                }
                let (sender, state) = watch::channel(None);
                let hosts = ask.hosts;
                *slot = Some(Page {
                    token: token.clone(),
                    hosts,
                    state: sender,
                    saved: None,
                });
                (state, token, true)
            }
        };
        if fresh {
            let (later, lifetime, own) = (shared.clone(), shared.lifetime, token.clone());
            tokio::spawn(async move {
                tokio::time::sleep(lifetime).await;
                later.fail(&own, "the login page expired");
            });
            if !launch(&shared.open, &format!("http://127.0.0.1:{port}/{token}")).await {
                shared.fail(&token, "no browser opened");
            }
        }
        let outcome = match tokio::time::timeout(wait, async {
            state.wait_for(Option::is_some).await.map(|s| s.clone())
        })
        .await
        {
            Ok(Ok(Some(outcome))) => outcome,
            Ok(_) => Outcome::Replaced,
            Err(_) => Outcome::StillOpen,
        };
        if outcome == Outcome::Saved {
            let mut slot = shared.page();
            if slot.as_ref().is_some_and(|p| p.token == token) {
                *slot = None;
            }
        }
        outcome
    }
}

impl Page {
    fn is_open(&self) -> bool {
        self.state.borrow().is_none()
    }

    /// Ends an open page with `outcome`; one that ended already keeps its own.
    fn finish(&self, outcome: Outcome) {
        self.state.send_if_modified(|s| {
            let open = s.is_none();
            if open {
                *s = Some(outcome);
            }
            open
        });
    }

    /// Open, or saved so recently that an ask still gets the save.
    fn live(&self) -> bool {
        self.is_open() || self.saved.is_some_and(|at| at.elapsed() < SAVED_REPLAY)
    }

    fn covers(&self, ask: &Ask) -> bool {
        let has = |a: &HostFields| {
            let page = self.hosts.iter().find(|p| p.host == a.host);
            page.is_some_and(|p| a.names.iter().all(|n| p.names.contains(n)))
        };
        ask.hosts.iter().all(has)
    }
}

impl Shared {
    fn page(&self) -> MutexGuard<'_, Option<Page>> {
        self.page.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Ends the page `token` names, if it is still the current one: an open page fails with `why`
    /// and every page leaves the slot.
    fn fail(&self, token: &str, why: &str) {
        let mut slot = self.page();
        if let Some(page) = slot.take_if(|p| p.token == token) {
            page.finish(Outcome::Failed(why.into()));
        }
    }

    fn show(&self, token: &str) -> Reply {
        match self
            .page()
            .as_ref()
            .filter(|p| p.token == token && p.is_open())
        {
            Some(page) => ("200 OK", render(&page.hosts, false)),
            None => not_found(),
        }
    }

    fn submit(&self, token: &str, body: &[u8]) -> Reply {
        let mut slot = self.page();
        let Some(page) = slot.as_mut().filter(|p| p.token == token && p.is_open()) else {
            return not_found();
        };
        let Some(typed) = typed_values(&page.hosts, body) else {
            return ("422 Unprocessable Content", render(&page.hosts, true));
        };
        // The lock is held through the save: two posts to one address cannot both save.
        match typed
            .iter()
            .try_for_each(|(host, values)| self.store.save(host, values))
        {
            Ok(()) => {
                page.saved = Some(Instant::now());
                page.state.send_replace(Some(Outcome::Saved));
                (
                    "200 OK",
                    shell(
                        "Saved",
                        "<h1>Saved</h1><p>You can close this tab and go back to your agent.</p>",
                    ),
                )
            }
            Err(why) => {
                page.state.send_replace(Some(Outcome::Failed(why)));
                *slot = None;
                (
                    "500 Internal Server Error",
                    shell(
                        "Not saved",
                        "<h1>Not saved</h1><p>The login could not be written. Go back to your agent.</p>",
                    ),
                )
            }
        }
    }
}

/// Each host's values from the posted form, or `None` when one is missing, shorter than four
/// characters (masking it would rewrite unrelated text) or spans lines.
fn typed_values(
    hosts: &[HostFields],
    body: &[u8],
) -> Option<Vec<(String, BTreeMap<String, String>)>> {
    let form: BTreeMap<_, _> = url::form_urlencoded::parse(body).collect();
    let valid = |v: &str| v.chars().count() >= 4 && !v.contains(['\r', '\n']);
    hosts
        .iter()
        .map(|h| {
            let values = h.names.iter().map(|name| {
                let value = form.get(format!("{}/{name}", h.host).as_str())?;
                valid(value).then(|| (name.clone(), value.to_string()))
            });
            Some((h.host.clone(), values.collect::<Option<_>>()?))
        })
        .collect()
}

fn new_token() -> Option<String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).ok()?;
    Some(format!("{:032x}", u128::from_le_bytes(bytes)))
}

/// Starts the browser on `url` and says whether it opened: a failed start, or an exit with an
/// error within two seconds, is not. A browser still running then is: some `xdg-open`s stay until
/// the browser closes. The child's output is dropped, because it may repeat the address.
async fn launch(open: &Open, url: &str) -> bool {
    let Some(mut command) = browser(open, url) else {
        return false;
    };
    let spawned = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    let Ok(mut child) = spawned else {
        return false;
    };
    // A thread reaps the child, so a browser that outlives the wait leaves no zombie.
    let (exit, exited) = oneshot::channel();
    let reaper = std::thread::Builder::new()
        .spawn(move || exit.send(child.wait().is_ok_and(|s| s.success())));
    if reaper.is_err() {
        return false;
    }
    match tokio::time::timeout(Duration::from_secs(2), exited).await {
        Ok(opened) => opened.unwrap_or(false),
        Err(_) => true,
    }
}

fn browser(open: &Open, url: &str) -> Option<Command> {
    let mut command;
    match open {
        Open::Program(args) => {
            let (program, lead) = args.split_first()?;
            command = Command::new(program);
            command.args(lead).arg(url);
        }
        Open::System if cfg!(windows) => {
            let root = PathBuf::from(std::env::var_os("SystemRoot")?);
            command = Command::new(root.join(r"System32\rundll32.exe"));
            command.args(["url.dll,FileProtocolHandler", url]);
        }
        Open::System => {
            // Only an absolute PATH entry, never the current folder or a bare name.
            let path = std::env::var_os("PATH")?;
            let dirs = std::env::split_paths(&path).filter(|d| d.is_absolute());
            command = Command::new(dirs.map(|d| d.join("xdg-open")).find(|p| p.is_file())?);
            command.arg(url);
        }
    }
    Some(command)
}

/// A status line and an HTML body.
type Reply = (&'static str, String);

struct Request {
    method: String,
    path: String,
    /// Names in lower case.
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Request {
    fn header(&self, name: &str) -> Option<&str> {
        let found = self.headers.iter().find(|(k, _)| k == name);
        found.map(|(_, v)| v.as_str())
    }
}

fn not_found() -> Reply {
    ("404 Not Found", String::new())
}

/// Binds a loopback port and serves it for the life of the process.
fn serve(shared: Arc<Shared>) -> Result<u16, String> {
    let cannot = |_| "cannot start the login page".to_string();
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(cannot)?;
    let port = listener.local_addr().map_err(cannot)?.port();
    let accept = move || {
        for stream in listener.incoming().flatten() {
            let shared = shared.clone();
            // shortcut: a thread per connection with no cap, since only this machine reaches the
            // port and a browser opens a handful; cap them if the page is ever served beyond loopback.
            let _ = std::thread::Builder::new().spawn(move || handle(&shared, port, stream));
        }
    };
    std::thread::Builder::new().spawn(accept).map_err(cannot)?;
    Ok(port)
}

fn handle(shared: &Shared, port: u16, mut stream: TcpStream) {
    // A browser opens idle connections in advance, so none may wait on another or for ever.
    let timeout = Some(Duration::from_secs(5));
    let _ = stream.set_read_timeout(timeout);
    let _ = stream.set_write_timeout(timeout);
    let reply = match read_request(&mut stream) {
        Ok(request) => route(shared, port, &request),
        Err(Some(status)) => (status, String::new()),
        Err(None) => return,
    };
    let head = format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: same-origin\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: {CSP}\r\nConnection: close\r\n\r\n",
        reply.0,
        reply.1.len()
    );
    let _ = stream
        .write_all(head.as_bytes())
        .and_then(|()| stream.write_all(reply.1.as_bytes()));
    let _ = stream.shutdown(Shutdown::Write);
}

/// Any local web page can reach a loopback port, so `Host` and `Origin` are checked before the token.
fn route(shared: &Shared, port: u16, request: &Request) -> Reply {
    let own = format!("127.0.0.1:{port}");
    let origin_ok = request
        .header("origin")
        .is_none_or(|o| o == format!("http://{own}"));
    if request.header("host") != Some(own.as_str()) || !origin_ok {
        return ("403 Forbidden", String::new());
    }
    let token = request.path.strip_prefix('/').unwrap_or_default();
    match request.method.as_str() {
        "GET" => shared.show(token),
        "POST" => shared.submit(token, &request.body),
        _ => not_found(),
    }
}

/// `Err(None)` for a connection that sent nothing usable, which gets no answer.
fn read_request(stream: &mut TcpStream) -> Result<Request, Option<&'static str>> {
    let mut buf = Vec::new();
    let end = loop {
        if let Some(end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break end;
        }
        if buf.len() > MAX_HEAD {
            return Err(Some("431 Request Header Fields Too Large"));
        }
        fill(stream, &mut buf)?;
    };
    let head = std::str::from_utf8(&buf[..end]).map_err(|_| BAD)?;
    let mut lines = head.split("\r\n");
    let mut start = lines.next().unwrap_or_default().split(' ');
    let (Some(method), Some(target)) = (start.next(), start.next()) else {
        return Err(BAD);
    };
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))
        .collect();
    let mut request = Request {
        method: method.into(),
        path: target.split('?').next().unwrap_or_default().into(),
        headers,
        body: Vec::new(),
    };
    if request.header("transfer-encoding").is_some() {
        return Err(BAD);
    }
    let len = request
        .header("content-length")
        .map_or(Ok(0), str::parse::<usize>)
        .map_err(|_| BAD)?;
    if len > MAX_BODY {
        return Err(Some("413 Content Too Large"));
    }
    let mut body = buf.split_off(end + 4);
    while body.len() < len {
        fill(stream, &mut body)?;
    }
    body.truncate(len);
    request.body = body;
    Ok(request)
}

fn fill(stream: &mut TcpStream, buf: &mut Vec<u8>) -> Result<(), Option<&'static str>> {
    let mut chunk = [0u8; 4096];
    match stream.read(&mut chunk) {
        Ok(n) if n > 0 => {
            buf.extend_from_slice(&chunk[..n]);
            Ok(())
        }
        _ => Err(None),
    }
}

fn esc(text: &str) -> String {
    let marks = [
        ('&', "&amp;"),
        ('<', "&lt;"),
        ('>', "&gt;"),
        ('"', "&quot;"),
        ('\'', "&#39;"),
    ];
    marks
        .iter()
        .fold(text.to_string(), |t, (c, to)| t.replace(*c, to))
}

fn shell(title: &str, body: &str) -> String {
    format!(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta name=\"referrer\" content=\"same-origin\"><meta name=\"description\" content=\"Confirm where http-runner sends your login.\"><title>{title}</title><style>{STYLE}</style><main>{body}</main></html>"
    )
}

/// The form, one fieldset per host with the host in large type. Nothing typed is ever written back.
fn render(hosts: &[HostFields], refused: bool) -> String {
    let mut body = String::from(
        "<h1>Confirm where your login goes</h1><p>Requests will go to the hosts below. A value you type is kept for its host only.</p>",
    );
    if refused {
        body.push_str("<p class=\"error\" role=\"alert\">Nothing was saved. Every value needs at least four characters on one line.</p>");
    }
    body.push_str("<form method=\"post\">");
    for (h, host) in hosts.iter().enumerate() {
        let _ = write!(body, "<fieldset><legend>{}</legend>", esc(&host.host));
        for (n, name) in host.names.iter().enumerate() {
            let (id, name) = (format!("f{h}-{n}"), esc(name));
            let _ = write!(
                body,
                "<label for=\"{id}\"><code>{name}</code></label><input id=\"{id}\" type=\"password\" name=\"{}/{name}\" required minlength=\"4\" autocomplete=\"off\">",
                esc(&host.host)
            );
        }
        if host.names.is_empty() {
            body.push_str("<p>Nothing to type. This only allows requests to the host.</p>");
        }
        body.push_str("</fieldset>");
    }
    let any = hosts.iter().any(|h| !h.names.is_empty());
    let _ = write!(
        body,
        "<button>{}</button></form>",
        if any { "Save and allow" } else { "Allow" }
    );
    shell("Confirm login", &body)
}

const STYLE: &str = r"/* Hallmark · shape: app screen · genre: modern-minimal · theme: Cobalt (deal 1/3, seed local-where-developer-types-f988·3dd1232e·2026-11-09·r0)
 * nav: none · signature: the host named in large type · states: form, form refused, saved
 * axes: light/system-sans/cool · posture: restrained · contrast: pass · v2.0.0 */
/* Hallmark · pre-emit critique: P4 H4 E4 S4 R4 V3 · weakest: V, one form leaves little to vary; kept to the host in large type, because the page is a guard */
:root { color-scheme: light dark;
  --color-paper: oklch(98.6% 0.005 250); --color-panel: oklch(96.2% 0.008 252); --color-ink: oklch(21% 0.028 262);
  --color-muted: oklch(46% 0.018 258); --color-rule: oklch(86% 0.012 252); --color-error: oklch(50% 0.19 27);
  --color-accent: oklch(52% 0.19 258); --color-accent-deep: oklch(43% 0.2 262); --color-accent-ink: oklch(98.6% 0.005 250);
  --font-body: system-ui, sans-serif; --font-mono: ui-monospace, monospace; --radius: 6px; --dur: 120ms; }
@media (prefers-color-scheme: dark) { :root {
  --color-paper: oklch(19% 0.02 262); --color-panel: oklch(24% 0.024 262); --color-ink: oklch(93% 0.01 250);
  --color-muted: oklch(72% 0.02 256); --color-rule: oklch(34% 0.025 260); --color-error: oklch(72% 0.16 27);
  --color-accent: oklch(72% 0.14 256); --color-accent-deep: oklch(80% 0.12 254); --color-accent-ink: oklch(19% 0.02 262); } }
*, ::before, ::after { box-sizing: border-box; }
html, body { overflow-x: clip; }
html { scrollbar-color: var(--color-muted) var(--color-paper); }
::selection { background: color-mix(in oklab, var(--color-accent) 25%, transparent); }
body { margin: 0; caret-color: var(--color-accent); background: var(--color-paper); color: var(--color-ink); font: 1rem/1.55 var(--font-body); }
main { max-width: 36rem; margin: 0 auto; padding: 4rem 1rem; }
h1 { margin: 0 0 0.5rem; font-size: 1.44rem; line-height: 1.15; letter-spacing: -0.02em; text-wrap: balance; overflow-wrap: break-word; min-width: 0; }
p { margin: 0 0 1.5rem; color: var(--color-muted); max-width: 52ch; }
.error { color: var(--color-error); }
fieldset { min-width: 0; margin: 0 0 1rem; padding: 0.5rem 1.25rem 1.25rem; border: 1px solid var(--color-rule); border-radius: var(--radius); background: var(--color-panel); }
fieldset p { margin: 0.75rem 0 0; }
legend { max-width: 100%; padding: 0 0.5rem; font-size: 1.44rem; font-weight: 600; line-height: 1.2; overflow-wrap: anywhere; }
code { font: 0.875rem var(--font-mono); }
label { display: block; margin: 1rem 0 0.25rem; font-size: 0.875rem; color: var(--color-muted); }
input { width: 100%; min-height: 2.75rem; padding: 0 0.75rem; font: inherit; color: var(--color-ink); background: var(--color-paper); border: 1px solid var(--color-rule); border-radius: var(--radius); transition: border-color var(--dur); }
input:hover { border-color: var(--color-muted); }
:disabled { opacity: 0.5; cursor: not-allowed; }
input:user-invalid { border-color: var(--color-error); }
button { min-height: 2.75rem; padding: 0 1.5rem; font: 600 1rem var(--font-body); color: var(--color-accent-ink); background: var(--color-accent); border: 0; border-radius: var(--radius); cursor: pointer; transition: background-color var(--dur), transform var(--dur); }
button:hover { background: var(--color-accent-deep); }
button:active { transform: translateY(1px); }
input:focus-visible, button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { input, button { transition: none; } }
";
