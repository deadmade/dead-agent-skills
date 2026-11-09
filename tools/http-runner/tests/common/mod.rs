#![allow(dead_code)]
//! A fake carrier on a loopback port, a temporary folder, a seeded store and the login page.

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fmt::Write as _;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use http_runner::login_page::{Open, Pages};
use http_runner::run::{self, Ctx, RunArgs};
use http_runner::store::Store;
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
    let mut lines = String::new();
    for (k, v) in headers {
        write!(lines, "{k}: {v}\r\n").unwrap();
    }
    format!(
        "HTTP/1.1 {status}\r\n{lines}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
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
    pub fn start(handler: impl Fn(&Seen) -> String + Send + Sync + 'static) -> Self {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let connections = Arc::new(AtomicUsize::new(0));
        let (log, count, handler) = (seen.clone(), connections.clone(), Arc::new(handler));
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

fn answer(mut stream: TcpStream, log: &Mutex<Vec<Seen>>, handler: &dyn Fn(&Seen) -> String) {
    let Some(request) = read(&mut stream) else {
        return;
    };
    log.lock().unwrap().push(request.clone());
    let _ = stream.write_all(handler(&request).as_bytes());
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

pub struct Rig {
    pub ctx: Arc<Ctx>,
    pub carrier: Carrier,
    pub store: Arc<Store>,
    pub dir: PathBuf,
    out: PathBuf,
}

pub fn rig(
    tag: &str,
    confirmed: Confirmed,
    handler: impl Fn(&Seen) -> String + Send + Sync + 'static,
) -> Rig {
    rig_with(tag, &[], confirmed, handler)
}

pub fn rig_with(
    tag: &str,
    browser_flags: &[&str],
    confirmed: Confirmed,
    handler: impl Fn(&Seen) -> String + Send + Sync + 'static,
) -> Rig {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let dir = std::env::temp_dir().join(format!("http-runner-run-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let store = Arc::new(Store::at(dir.join("store")));
    for (host, values) in confirmed {
        let typed: BTreeMap<_, _> = values
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect();
        store.save(host, &typed).unwrap();
    }
    let out = dir.join("browser.txt");
    let mut program: Vec<OsString> = vec![
        env!("CARGO_BIN_EXE_fake-browser").into(),
        "--out".into(),
        out.clone().into(),
    ];
    program.extend(browser_flags.iter().map(OsString::from));
    let pages = Pages::new(
        store.clone(),
        Open::Program(program),
        Duration::from_secs(60),
    );
    Rig {
        ctx: Arc::new(Ctx::new(store.clone(), pages).unwrap()),
        carrier: Carrier::start(handler),
        store,
        dir,
        out,
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

    /// The `n`th address (from 1) the fake browser was given.
    pub async fn address(&self, n: usize) -> String {
        for _ in 0..250 {
            let text = std::fs::read_to_string(&self.out).unwrap_or_default();
            if let Some(line) = text.lines().nth(n - 1) {
                return line.to_string();
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("the fake browser got no address {n}");
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

/// Posts `pairs` to a login page and expects it to save them.
pub fn submit(address: &str, pairs: &[(&str, &str)]) {
    let url = url::Url::parse(address).unwrap();
    let port = url.port().unwrap();
    let form = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(pairs)
        .finish();
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    write!(
        stream,
        "POST {} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{form}",
        url.path(),
        form.len()
    )
    .unwrap();
    let mut answer = String::new();
    stream.read_to_string(&mut answer).unwrap();
    assert!(answer.starts_with("HTTP/1.1 200"), "{answer}");
}

/// A port nothing listens on.
pub fn closed_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}
