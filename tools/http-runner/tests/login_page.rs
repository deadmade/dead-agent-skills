//! `Pages` over real loopback HTTP, with a fake browser that records the address it is given.

use std::ffi::OsString;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use http_runner::login_page::{Ask, HostFields, Open, Outcome, Pages};
use http_runner::store::Store;
use tokio::task::JoinHandle;

const LONG: Duration = Duration::from_secs(60);
const TEN: Duration = Duration::from_secs(10);

struct Rig {
    pages: Arc<Pages>,
    store: Arc<Store>,
    out: PathBuf,
}

fn rig(tag: &str, lifetime: Duration, flags: &[&str]) -> Rig {
    let dir = std::env::temp_dir().join(format!("http-runner-pages-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let out = dir.join("out.txt");
    let mut program: Vec<OsString> = vec![
        env!("CARGO_BIN_EXE_fake-browser").into(),
        "--out".into(),
        out.clone().into(),
    ];
    program.extend(flags.iter().map(OsString::from));
    let store = Arc::new(Store::at(dir.join("store")));
    let pages = Arc::new(Pages::new(store.clone(), Open::Program(program), lifetime));
    Rig { pages, store, out }
}

impl Rig {
    fn start(&self, hosts: &[(&str, &[&str])], wait: Duration) -> JoinHandle<Outcome> {
        let (pages, ask) = (self.pages.clone(), ask(hosts));
        tokio::spawn(async move { pages.ask(ask, wait).await })
    }

    /// The `n`th address (from 1) the fake browser was given.
    async fn address(&self, n: usize) -> String {
        for _ in 0..250 {
            if let Some(line) = addresses(&self.out).get(n - 1) {
                return line.clone();
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("the fake browser got no address {n}");
    }
}

fn ask(hosts: &[(&str, &[&str])]) -> Ask {
    let field = |(host, names): &(&str, &[&str])| HostFields {
        host: (*host).into(),
        names: names.iter().map(|n| (*n).into()).collect(),
    };
    Ask {
        hosts: hosts.iter().map(field).collect(),
    }
}

fn addresses(out: &Path) -> Vec<String> {
    let text = std::fs::read_to_string(out).unwrap_or_default();
    text.lines().map(String::from).collect()
}

fn form(pairs: &[(&str, &str)]) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(pairs)
        .finish()
}

fn port(address: &str) -> u16 {
    url::Url::parse(address).unwrap().port().unwrap()
}

/// One request to the port of `address`, at its path; returns the response head and body.
fn exchange(address: &str, method: &str, headers: &[(&str, &str)], body: &str) -> (String, String) {
    let url = url::Url::parse(address).unwrap();
    let port = url.port().unwrap();
    let mut lines = vec![format!("{method} {} HTTP/1.1", url.path())];
    if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("host")) {
        lines.push(format!("Host: 127.0.0.1:{port}"));
    }
    lines.extend(headers.iter().map(|(k, v)| format!("{k}: {v}")));
    lines.push(format!(
        "Connection: close\r\nContent-Length: {}",
        body.len()
    ));
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    write!(stream, "{}\r\n\r\n{body}", lines.join("\r\n")).unwrap();
    let mut reply = String::new();
    stream.read_to_string(&mut reply).unwrap();
    let (head, body) = reply.split_once("\r\n\r\n").unwrap();
    (head.into(), body.into())
}

/// The same request; returns the status and the body.
fn request(address: &str, method: &str, headers: &[(&str, &str)], body: &str) -> (u16, String) {
    let (head, body) = exchange(address, method, headers, body);
    (head[9..12].parse().unwrap(), body)
}

fn get(address: &str) -> (u16, String) {
    request(address, "GET", &[], "")
}

fn post(address: &str, body: &str) -> (u16, String) {
    request(address, "POST", &[], body)
}

const A_VALUES: [(&str, &str); 2] = [
    ("a.example/USER", "user-one"),
    ("a.example/PASS", "pass-one"),
];

#[tokio::test]
async fn saves_typed_values_for_the_host() {
    let rig = rig("saves", LONG, &[]);
    let asking = rig.start(&[("a.example", &["USER", "PASS"]), ("b.example", &[])], TEN);
    let url = rig.address(1).await;
    let typed = form(&[
        ("a.example/USER", "user-one"),
        ("a.example/PASS", "p&ss w0rd"),
    ]);
    assert_eq!(post(&url, &typed).0, 200);
    assert_eq!(asking.await.unwrap(), Outcome::Saved);
    let saved = |host, name| rig.store.get(host, name).unwrap();
    assert_eq!(saved("a.example", "USER").as_deref(), Some("user-one"));
    assert_eq!(saved("a.example", "PASS").as_deref(), Some("p&ss w0rd"));
    assert_eq!(saved("b.example", "USER"), None);
    assert!(rig.store.is_confirmed("b.example").unwrap());
}

#[tokio::test]
async fn shows_host_and_each_field() {
    let rig = rig("shows", LONG, &[]);
    let _asking = rig.start(
        &[("h<i>.example", &["P&Q\"<b>", "TOKEN"]), ("c.example", &[])],
        TEN,
    );
    let (status, page) = get(&rig.address(1).await);
    assert_eq!(status, 200);
    assert!(
        page.contains("h&lt;i&gt;.example") && page.contains("c.example"),
        "{page}"
    );
    assert!(
        page.contains("P&amp;Q&quot;&lt;b&gt;") && page.contains("TOKEN"),
        "{page}"
    );
    assert!(!page.contains("<b>") && !page.contains("<i>"), "{page}");
    assert_eq!(page.matches("type=\"password\"").count(), 2, "{page}");
}

#[tokio::test]
async fn refuses_missing_token() {
    let rig = rig("token", LONG, &[]);
    let _asking = rig.start(&[("a.example", &["USER", "PASS"])], TEN);
    let url = rig.address(1).await;
    let base = format!("http://127.0.0.1:{}/", port(&url));
    let guess = format!("{base}{}", "0".repeat(32));
    for wrong in [base, guess] {
        assert_eq!(get(&wrong).0, 404);
        assert_eq!(post(&wrong, &form(&A_VALUES)).0, 404);
    }
    assert!(!rig.store.is_confirmed("a.example").unwrap());
}

#[tokio::test]
async fn refuses_bad_host_and_origin() {
    let rig = rig("origin", LONG, &[]);
    let asking = rig.start(&[("a.example", &["USER", "PASS"])], TEN);
    let url = rig.address(1).await;
    // A browser sends `Origin: null` for a form posted under a `no-referrer` policy, so none is served.
    let bad_ones = [
        ("Host", "evil.example"),
        ("Origin", "https://evil.example"),
        ("Origin", "null"),
    ];
    for bad in bad_ones {
        assert_eq!(request(&url, "POST", &[bad], &form(&A_VALUES)).0, 403);
        assert_eq!(request(&url, "GET", &[bad], "").0, 403);
    }
    assert!(!rig.store.is_confirmed("a.example").unwrap());
    let own = format!("http://127.0.0.1:{}", port(&url));
    assert_eq!(
        request(&url, "POST", &[("Origin", &own)], &form(&A_VALUES)).0,
        200
    );
    assert_eq!(asking.await.unwrap(), Outcome::Saved);
}

#[tokio::test]
async fn served_policy_is_same_origin() {
    // A raw client cannot show the browser's `Origin: null`; the policy that causes it is checked instead.
    let rig = rig("policy", LONG, &[]);
    let _asking = rig.start(&[("a.example", &["USER", "PASS"])], TEN);
    let (head, page) = exchange(&rig.address(1).await, "GET", &[], "");
    assert!(
        head.contains("\r\nReferrer-Policy: same-origin\r\n"),
        "{head}"
    );
    assert!(
        page.contains("<meta name=\"referrer\" content=\"same-origin\">"),
        "{page}"
    );
    assert!(!head.contains("no-referrer") && !page.contains("no-referrer"));
}

#[tokio::test]
async fn refuses_short_or_multiline_value() {
    let rig = rig("values", LONG, &[]);
    let _asking = rig.start(&[("a.example", &["USER", "PASS"])], TEN);
    let url = rig.address(1).await;
    for bad in ["abc", "two\r\nlines", "two\nlines", ""] {
        let (status, page) = post(
            &url,
            &form(&[("a.example/USER", "user-one"), ("a.example/PASS", bad)]),
        );
        assert!(
            status != 200 && page.contains("type=\"password\""),
            "{status} {page}"
        );
        assert!(!page.contains("user-one"), "{page}");
        assert!(!rig.store.is_confirmed("a.example").unwrap());
    }
    // A field left out is refused too.
    assert_ne!(post(&url, &form(&[("a.example/USER", "user-one")])).0, 200);
    assert!(!rig.store.is_confirmed("a.example").unwrap());
    assert_eq!(post(&url, &form(&A_VALUES)).0, 200);
}

#[tokio::test]
async fn refuses_oversized_body() {
    let rig = rig("big", LONG, &[]);
    let _asking = rig.start(&[("a.example", &["USER", "PASS"])], TEN);
    let url = rig.address(1).await;
    let mut stream = TcpStream::connect(("127.0.0.1", port(&url))).unwrap();
    let head = format!(
        "POST {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Length: 70000\r\n\r\n",
        url::Url::parse(&url).unwrap().path(),
        port(&url)
    );
    stream.write_all(head.as_bytes()).unwrap();
    let mut reply = String::new();
    stream.read_to_string(&mut reply).unwrap();
    assert!(reply.starts_with("HTTP/1.1 413"), "{reply}");
    assert!(!rig.store.is_confirmed("a.example").unwrap());
}

#[tokio::test]
async fn still_open_then_saved() {
    let rig = rig("still", LONG, &[]);
    let hosts: &[(&str, &[&str])] = &[("a.example", &["USER", "PASS"])];
    let short = Duration::from_millis(100);
    assert_eq!(rig.start(hosts, short).await.unwrap(), Outcome::StillOpen);
    // An ask the open page covers, here a subset, waits on it and opens no other.
    assert_eq!(
        rig.start(&[("a.example", &["PASS"])], short).await.unwrap(),
        Outcome::StillOpen
    );
    let url = rig.address(1).await;
    assert_eq!(post(&url, &form(&A_VALUES)).0, 200);
    assert_eq!(rig.start(hosts, short).await.unwrap(), Outcome::Saved);
    assert_eq!(addresses(&rig.out), [url]);
    // The saved page answers once: a later ask, such as a retyped login, gets a page of its own.
    assert_eq!(rig.start(hosts, short).await.unwrap(), Outcome::StillOpen);
    assert_eq!(addresses(&rig.out).len(), 2);
}

#[tokio::test]
async fn saved_page_is_not_replayed_later() {
    let rig = rig("later", LONG, &[]);
    let hosts: &[(&str, &[&str])] = &[("a.example", &["USER", "PASS"])];
    let short = Duration::from_millis(100);
    assert_eq!(rig.start(hosts, short).await.unwrap(), Outcome::StillOpen);
    let old = rig.address(1).await;
    assert_eq!(post(&old, &form(&A_VALUES)).0, 200);
    // Past the window, as with a retyped login after the carrier refused the saved one.
    tokio::time::sleep(Duration::from_millis(2500)).await;
    assert_eq!(rig.start(hosts, short).await.unwrap(), Outcome::StillOpen);
    let new = rig.address(2).await;
    assert_ne!(old, new);
    assert_eq!(post(&new, &form(&A_VALUES)).0, 200);
    assert_eq!(rig.start(hosts, short).await.unwrap(), Outcome::Saved);
}

#[tokio::test]
async fn different_ask_replaces_the_open_page() {
    let rig = rig("replace", LONG, &[]);
    let first = rig.start(&[("a.example", &["USER", "PASS"])], TEN);
    let old = rig.address(1).await;
    let second = rig.start(&[("b.example", &["KEY"])], TEN);
    let new = rig.address(2).await;
    assert_ne!(old, new);
    assert_eq!(get(&old).0, 404);
    assert_eq!(first.await.unwrap(), Outcome::Replaced);
    assert_eq!(post(&old, &form(&A_VALUES)).0, 404);
    assert_eq!(post(&new, &form(&[("b.example/KEY", "key-one")])).0, 200);
    assert_eq!(second.await.unwrap(), Outcome::Saved);
    assert!(!rig.store.is_confirmed("a.example").unwrap());
}

#[tokio::test]
async fn idle_connection_does_not_block_the_page() {
    let rig = rig("idle", LONG, &[]);
    let _asking = rig.start(&[("a.example", &["USER", "PASS"])], TEN);
    let url = rig.address(1).await;
    let _idle = TcpStream::connect(("127.0.0.1", port(&url))).unwrap();
    let started = Instant::now();
    assert_eq!(get(&url).0, 200);
    assert!(started.elapsed() < Duration::from_secs(3));
}

#[tokio::test]
async fn expires_after_its_lifetime() {
    let rig = rig("expires", Duration::from_millis(300), &[]);
    let started = Instant::now();
    let outcome = rig
        .start(&[("a.example", &["USER", "PASS"])], TEN)
        .await
        .unwrap();
    assert!(matches!(outcome, Outcome::Failed(_)), "{outcome:?}");
    assert!(started.elapsed() < Duration::from_secs(5));
    assert_eq!(post(&rig.address(1).await, &form(&A_VALUES)).0, 404);
    assert!(!rig.store.is_confirmed("a.example").unwrap());
}

#[tokio::test]
async fn no_browser_fails_without_the_address() {
    let rig = rig("nobrowser", LONG, &["--fail"]);
    let outcome = rig
        .start(&[("a.example", &["USER", "PASS"])], TEN)
        .await
        .unwrap();
    assert_eq!(outcome, Outcome::Failed("no browser opened".into()));
    let url = rig.address(1).await;
    assert!(!format!("{outcome:?}").contains(&port(&url).to_string()));
    assert_eq!(get(&url).0, 404);
}

#[tokio::test]
async fn one_time() {
    let rig = rig("once", LONG, &[]);
    let asking = rig.start(&[("a.example", &["USER", "PASS"])], TEN);
    let url = rig.address(1).await;
    assert_eq!(post(&url, &form(&A_VALUES)).0, 200);
    assert_eq!(asking.await.unwrap(), Outcome::Saved);
    assert_eq!(get(&url).0, 404);
    let again = form(&[
        ("a.example/USER", "other-user"),
        ("a.example/PASS", "other-pass"),
    ]);
    assert_eq!(post(&url, &again).0, 404);
    assert_eq!(
        rig.store.get("a.example", "USER").unwrap().as_deref(),
        Some("user-one")
    );
}
