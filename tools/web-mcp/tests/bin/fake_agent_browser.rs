//! A stand-in for agent-browser: appends its argv, stdin, `AGENT_BROWSER_*` env and cwd as a JSON line to
//! `$FAKE_AB_LOG` (unset: to `calls.jsonl` beside its `--config`, if any) and prints canned `--json` answers.
//! An `open` of a URL containing "fail" fails; a batch's `wait` fails for a URL containing "wait-fail", and for
//! one containing "wait-slow" only after its `--timeout` ms. A batch opening a search engine's host answers from
//! `$FAKE_AB_PAGES` when that is set (see `engine_page`); so does a batch opening any other host, from the file
//! `<last path segment of the URL>.html` there when it exists (else the canned page). A file `<engine>.landed` there
//! holds the URL its `get url` answers (`engine_landed`), else it answers the opened one. A batch with an `open` stores its URL in
//! `<state>/<session>.url`: the session's tab keeps that page, so a batch without an `open` answers for the stored
//! URL (its `engine_page`, its `get url`, the host lookups and `wait` failures keyed on the URL), and `tab new`
//! removes it (a blank tab). `get cdp-url` answers `ws://127.0.0.1:<port>/devtools/browser/<chrome>`, `<chrome>` being
//! the contents of `<state>/chrome` (a changed one: Chrome relaunched, default 1) and `<port>` those of
//! `<state>/cdp-port` (default 9222, where nothing listens); with `$FAKE_AB_OWNER_DELAY_MS`, an owner's (`*-window`)
//! `open` sleeps that long first. `<state>` is `$FAKE_AB_STATE`, else `--config`'s folder. On a `--cdp` call,
//! `<state>/dead-g<n>` makes a `-g<n>-` session answer agent-browser's dead-Chrome connect error, and
//! `<state>/<session>.gone` makes a call other than `tab …` (in a batch: its first command) answer `tab_gone`,
//! until a `tab new` removes it. With `--bail`, a batch's entries stop after its first failed one. A `tab list`
//! answers the owner's blank tab and, unless the session's tab is gone, the session's own tab as `active` with the
//! tab id `t-<session>` and the target id `T-t-<session>` (`tab_list`).
//!
//! A typing batch (no `open`, a `click`) reads no page. Its `eval` answers `{"result": 1}`; its `click` fails when
//! the session has no stored URL or `$FAKE_AB_PAGES/<engine>.nobox` exists (the engine of the stored URL's host, as
//! in `engine_page`). It collects the text of its `press <one char>` (`Space`: a space) and `keyboard inserttext`
//! commands, and at `press Enter` writes it to `<state>/<session>.typed` and sets the stored URL's `q` to it, other
//! parameters kept; with `<engine>.nonav` the URL stays, `<state>/<session>.stuck` marks it, and the session's next
//! read (a batch with no `open` and no `click`, on a tab not gone) runs out its `wait`s' `--timeout`, fails them and
//! removes the mark; `tab new` leaves it. With `<engine>.slowtype` the typing batch sleeps 60 s first; a file
//! `<state>/typedelay` holding a number makes every typing batch sleep that many ms first.
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::{Value, json};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut stdin = String::new();
    if args.iter().any(|a| a == "batch") {
        let _ = std::io::stdin().read_to_string(&mut stdin);
    }
    let flag = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .map_or("", |i| args[i + 1].as_str())
    };
    let config = flag("--config");
    let log = std::env::var("FAKE_AB_LOG").ok().or_else(|| {
        Path::new(config)
            .parent()
            .filter(|_| !config.is_empty())
            .map(|d| d.join("calls.jsonl").to_string_lossy().into_owned())
    });
    if let Some(log) = log {
        let env: serde_json::Map<String, Value> = std::env::vars()
            .filter(|(k, _)| k.starts_with("AGENT_BROWSER_"))
            .map(|(k, v)| (k, json!(v)))
            .collect();
        let cwd = std::env::current_dir().unwrap();
        let line = json!({"args": args, "stdin": stdin, "env": env, "cwd": cwd});
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log)
            .unwrap();
        f.write_all(format!("{line}\n").as_bytes()).unwrap(); // one write: parallel calls must not interleave
    }
    let rest = command(&args);
    let session = flag("--session");
    let state = state_dir(config);
    let attached = args.iter().any(|a| a == "--cdp");
    if attached {
        attached_failure(&state, session, rest);
    }
    let gone = state.join(format!("{session}.gone"));
    let tab_gone = attached && gone.exists();
    if session.ends_with("-window") && rest.first().is_some_and(|c| c == "open") {
        owner_delay();
    }
    let out = match rest.first().map(String::as_str) {
        Some("get") if rest.get(1).is_some_and(|a| a == "cdp-url") => cdp_url(&state),
        Some("tab") if rest.get(1).is_some_and(|a| a == "new") => {
            let _ = std::fs::remove_file(&gone);
            let _ = std::fs::remove_file(stored_url(&state, session));
            json!({"success": true, "data": {"tabId": "t9", "url": "about:blank"}})
        }
        Some("tab") if rest.get(1).is_some_and(|a| a == "list") => {
            tab_list(&state, session, tab_gone)
        }
        Some("batch") => {
            let bail = rest.iter().any(|a| a == "--bail");
            batch(&stdin, &state, session, tab_gone, bail)
        }
        Some("open") if rest.get(1).is_some_and(|u| u.contains("fail")) => {
            println!(
                "{}",
                json!({"success": false, "error": "boom: net::ERR_FAILED"})
            );
            std::process::exit(1);
        }
        Some("screenshot") => {
            let path = rest[1..].iter().find(|a| !a.starts_with("--")).unwrap();
            std::fs::write(path, include_bytes!("../fixtures/photo.jpg")).unwrap();
            if session.contains("fail") {
                println!("{}", json!({"success": false, "error": "no screen"}));
                std::process::exit(1);
            }
            json!({"success": true, "data": {"path": path}})
        }
        cmd => json!({"success": true, "data": {"command": cmd, "session": session}}),
    };
    println!("{out}");
}

/// `tab list` as agent-browser 0.41.1 answers it from a session attached to the window: the owner's blank tab, and
/// the session's own tab marked `"active": true` (tab id `t-<session>`), unless that tab is gone.
fn tab_list(state: &Path, session: &str, gone: bool) -> Value {
    let tab = |active: bool, id: String, url: String| {
        json!({"active": active, "label": null, "tabId": id, "targetId": format!("T-{id}"),
               "title": url, "type": "page", "url": url})
    };
    let mut tabs = vec![tab(false, "t1".into(), "about:blank".into())];
    if !gone {
        let url = std::fs::read_to_string(stored_url(state, session))
            .unwrap_or_else(|_| "about:blank".into());
        tabs.push(tab(true, format!("t-{session}"), url));
    }
    json!({"success": true, "data": {"lifecycle": {"reused": true}, "tabs": tabs}})
}

/// The file holding the URL `session`'s tab was last opened to.
fn stored_url(state: &Path, session: &str) -> PathBuf {
    state.join(format!("{session}.url"))
}

/// A batch's answer to the commands in `stdin`, for the page it `open`s, else the one its session's tab holds
/// (`stored_url`; none: blank). With `tab_gone`, its first command answers `tab_gone` and opens nothing; with
/// `bail`, the entries stop after the first failed one.
fn batch(stdin: &str, state: &Path, session: &str, tab_gone: bool, bail: bool) -> Value {
    let cmds: Vec<Vec<String>> = serde_json::from_str(stdin).unwrap();
    let opens = cmds.iter().any(|c| c[0] == "open");
    if !opens && cmds.iter().any(|c| c[0] == "click") {
        return Value::Array(typing(&cmds, state, session, tab_gone, bail));
    }
    if stdin.contains("/slow") {
        std::thread::sleep(std::time::Duration::from_secs(3)); // a page that hangs
    }
    let stored = stored_url(state, session);
    let url = match cmds.iter().find(|c| c[0] == "open") {
        Some(open) => {
            if !tab_gone {
                std::fs::write(&stored, &open[1]).unwrap();
            }
            open[1].clone()
        }
        None => std::fs::read_to_string(&stored).unwrap_or_default(),
    };
    // A typed search that never navigated: this read's wait runs out.
    let stuck = !opens && !tab_gone && std::fs::remove_file(stuck_mark(state, session)).is_ok();
    let url = url.as_str();
    let page = engine_page(url);
    let html = match &page {
        Some(Ok(html)) => html.clone(),
        _ => rendered(url, session),
    };
    // A redirect to the user's own network, for the fallback's landing check.
    let landed = if url.contains("redirect-private") {
        "http://127.0.0.1/admin"
    } else {
        url
    };
    let landed = engine_landed(url).unwrap_or_else(|| landed.to_owned());
    let mut entries = Vec::new();
    for (i, c) in cmds.iter().enumerate() {
        let entry = if tab_gone && i == 0 {
            gone_entry(session, c)
        } else if let (Some(Err(e)), "open") = (&page, c[0].as_str()) {
            json!({"command": c, "success": false, "result": null, "error": e})
        } else if c[0] == "wait" && wait_fails(url, c, stuck) {
            json!({"command": c, "success": false, "result": null, "error": "timed out"})
        } else {
            let result = match c.get(1).map(String::as_str) {
                Some("html") => json!({"html": html}),
                Some("url") => json!(landed),
                _ => json!({"url": url}),
            };
            json!({"command": c, "success": true, "result": result})
        };
        if push_bailed(&mut entries, entry, bail) {
            break;
        }
    }
    Value::Array(entries)
}

/// A batch entry answering `tab_gone` for command `c`.
fn gone_entry(session: &str, c: &[String]) -> Value {
    let mut e = gone_json(session);
    e["command"] = json!(c);
    e
}

/// Pushes `entry`; whether the batch stops after it (`bail`, and it failed).
fn push_bailed(entries: &mut Vec<Value>, entry: Value, bail: bool) -> bool {
    let failed = entry["success"] == false;
    entries.push(entry);
    bail && failed
}

/// The file marking that `session`'s last typed search never navigated.
fn stuck_mark(state: &Path, session: &str) -> PathBuf {
    state.join(format!("{session}.stuck"))
}

/// A typing batch's entries, on the page `session`'s tab holds (see the module doc).
fn typing(
    cmds: &[Vec<String>],
    state: &Path,
    session: &str,
    tab_gone: bool,
    bail: bool,
) -> Vec<Value> {
    let stored = stored_url(state, session);
    let url = std::fs::read_to_string(&stored).ok();
    let engine = url.as_deref().and_then(engine_of);
    let marked = |m: &str| {
        pages_dir()
            .zip(engine)
            .is_some_and(|(d, e)| d.join(format!("{e}.{m}")).exists())
    };
    if marked("slowtype") {
        std::thread::sleep(Duration::from_mins(1)); // past any deadline; the server kills the call
    }
    if let Some(ms) = std::fs::read_to_string(state.join("typedelay"))
        .ok()
        .and_then(|ms| ms.trim().parse().ok())
    {
        std::thread::sleep(Duration::from_millis(ms));
    }
    let mut typed = String::new();
    let mut entries = Vec::new();
    for (i, c) in cmds.iter().enumerate() {
        let ok = json!({"command": c, "success": true, "result": null});
        let entry = if tab_gone && i == 0 {
            gone_entry(session, c)
        } else {
            match (c[0].as_str(), c.get(1).map(String::as_str)) {
                ("eval", _) => json!({"command": c, "success": true, "result": {"result": 1}}),
                ("click", _) if url.is_none() || marked("nobox") => json!({
                    "command": c, "success": false, "result": null,
                    "error": format!("Element not found: {}", c[1]),
                }),
                ("press", Some("Space")) => {
                    typed.push(' ');
                    ok
                }
                ("press", Some("Enter")) => {
                    std::fs::write(state.join(format!("{session}.typed")), &typed).unwrap();
                    match &url {
                        Some(_) if marked("nonav") => {
                            std::fs::write(stuck_mark(state, session), "").unwrap();
                        }
                        Some(u) => std::fs::write(&stored, with_q(u, &typed)).unwrap(),
                        None => {}
                    }
                    ok
                }
                ("press", Some(k)) if k.chars().count() == 1 => {
                    typed.push_str(k);
                    ok
                }
                ("keyboard", Some("inserttext")) => {
                    typed.push_str(&c[2]);
                    ok
                }
                _ => ok,
            }
        };
        if push_bailed(&mut entries, entry, bail) {
            break;
        }
    }
    entries
}

/// `url` with its `q` set to `q`, its other parameters kept.
fn with_q(url: &str, q: &str) -> String {
    let mut u = url::Url::parse(url).unwrap();
    let pairs: Vec<(String, String)> = u
        .query_pairs()
        .map(|(k, v)| {
            let v = if k == "q" {
                q.to_owned()
            } else {
                v.into_owned()
            };
            (k.into_owned(), v)
        })
        .collect();
    u.query_pairs_mut().clear().extend_pairs(pairs);
    u.to_string()
}

/// The command after the global flags: --session <s>, --config <path>, --cdp <url>, --json, --max-output <n>,
/// --content-boundaries, --pin-tab.
fn command(args: &[String]) -> &[String] {
    let mut rest = args;
    while let Some(first) = rest.first() {
        let skip = match first.as_str() {
            "--session" | "--config" | "--cdp" | "--max-output" => 2,
            "--json" | "--content-boundaries" | "--pin-tab" => 1,
            _ => break,
        };
        rest = &rest[skip..];
    }
    rest
}

/// An owner's `open` waits `$FAKE_AB_OWNER_DELAY_MS`, if set.
fn owner_delay() {
    if let Some(ms) = std::env::var("FAKE_AB_OWNER_DELAY_MS")
        .ok()
        .and_then(|v| v.parse().ok())
    {
        std::thread::sleep(Duration::from_millis(ms));
    }
}

/// `$FAKE_AB_STATE`, else the folder of `config`.
fn state_dir(config: &str) -> PathBuf {
    std::env::var_os("FAKE_AB_STATE").map_or_else(
        || {
            Path::new(config)
                .parent()
                .unwrap_or(Path::new(""))
                .to_owned()
        },
        PathBuf::from,
    )
}

/// web-mcp-one-window/findings.md's `tab_gone` answer to a single call (a batch entry adds its `command`).
fn gone_json(session: &str) -> Value {
    let error = format!(
        "tab_gone: bound tab is gone (target T-{session}, last url about:blank). Run `agent-browser tab new <url>` to bind a new tab, or `agent-browser tab list` to pick an existing one"
    );
    json!({"success": false, "data": {"lastUrl": "about:blank", "targetId": format!("T-{session}")}, "error": error, "code": "tab_gone"})
}

/// Exits with web-mcp-one-window/findings.md's dead-Chrome connect error, or a single call's `tab_gone`, when `state`
/// says so.
fn attached_failure(state: &Path, session: &str, rest: &[String]) {
    let generation = session
        .split('-')
        .find(|p| p.len() > 1 && p.starts_with('g') && p[1..].bytes().all(|b| b.is_ascii_digit()));
    if generation.is_some_and(|g| state.join(format!("dead-{g}")).exists()) {
        println!(
            "{}",
            json!({"error": "CDP WebSocket connect failed: IO error: No connection could be made because the target machine actively refused it. (os error 10061)", "success": false})
        );
        std::process::exit(1);
    }
    let single = !matches!(rest.first().map(String::as_str), Some("tab" | "batch"));
    if single && state.join(format!("{session}.gone")).exists() {
        println!("{}", gone_json(session));
        std::process::exit(1);
    }
}

/// The window's cdp url, for the Chrome named in `<state>/chrome`, else 1, on the port in `<state>/cdp-port`, else
/// 9222 (where nothing listens: a test that wants Chrome's HTTP endpoint starts a stub and writes its port).
fn cdp_url(state: &Path) -> Value {
    let read = |name: &str, default: &str| {
        std::fs::read_to_string(state.join(name))
            .map_or_else(|_| default.to_owned(), |c| c.trim().to_owned())
    };
    let (chrome, port) = (read("chrome", "1"), read("cdp-port", "9222"));
    json!({"success": true, "data": {"cdpUrl": format!("ws://127.0.0.1:{port}/devtools/browser/{chrome}")}})
}

/// Any page as a browser would render it.
fn rendered(url: &str, session: &str) -> String {
    format!(
        "<html><body><main><article><h1>Rendered</h1><p>Rendered page for {url} in {session}. {}</p></article></main></body></html>",
        "It has plenty of words once a browser has run its scripts. ".repeat(6)
    )
}

/// Whether a batch's `wait` command `c` on `url` fails; a page that never gets ready (or a `stuck` typed search)
/// first runs out the wait's `--timeout`, as the daemon does.
fn wait_fails(url: &str, c: &[String], stuck: bool) -> bool {
    if url.contains("wait-slow") || stuck {
        let ms = c
            .iter()
            .position(|a| a == "--timeout")
            .map_or(25_000, |i| c[i + 1].parse().unwrap());
        std::thread::sleep(std::time::Duration::from_millis(ms));
        return true;
    }
    url.contains("wait-fail")
}

/// The engine whose host `url` is on.
fn engine_of(url: &str) -> Option<&'static str> {
    let host = url::Url::parse(url).ok()?.host_str()?.to_owned();
    // scholar.google.com before google.com.
    [
        ("scholar.google.com", "scholar"),
        ("google.com", "google"),
        ("bing.com", "bing"),
        ("duckduckgo.com", "duckduckgo"),
        ("search.brave.com", "brave"),
        ("semanticscholar.org", "semanticscholar"),
    ]
    .into_iter()
    .find(|(d, _)| host == *d || host.ends_with(&format!(".{d}")))
    .map(|(_, e)| e)
}

/// Where the engine's result page landed, when `<engine>.landed` in `$FAKE_AB_PAGES` names the URL: the page's own
/// relative links are then on that address, as when a test serves the engine's links from its stub.
fn engine_landed(url: &str) -> Option<String> {
    let name = format!("{}.landed", engine_of(url)?);
    let url = std::fs::read_to_string(pages_dir()?.join(name)).ok()?;
    Some(url.trim().to_owned())
}

/// `$FAKE_AB_PAGES`.
fn pages_dir() -> Option<PathBuf> {
    std::env::var_os("FAKE_AB_PAGES").map(PathBuf::from)
}

/// For a host that is no engine: `$FAKE_AB_PAGES/<last path segment of url>.html`, when that file exists.
fn other_page(url: &str) -> Option<String> {
    let url = url::Url::parse(url).ok()?;
    let name = url.path_segments()?.next_back()?;
    std::fs::read_to_string(pages_dir()?.join(format!("{name}.html"))).ok()
}

/// The result page of the engine whose host `url` is on, from `$FAKE_AB_PAGES` (unset: `None`), after
/// `$FAKE_AB_DELAY_MS`. A marker file `<engine>.<marker>` there picks it: `none`, `blocked`, `consent-once` (the
/// consent page, once), `slow` (60 s first) or `offline` (`Err`: the failure `open` reports); else `<engine>.html`.
fn engine_page(url: &str) -> Option<Result<String, &'static str>> {
    let Some(engine) = engine_of(url) else {
        return other_page(url).map(Ok);
    };
    let dir = pages_dir()?;
    if let Some(ms) = std::env::var("FAKE_AB_DELAY_MS")
        .ok()
        .and_then(|v| v.parse().ok())
    {
        std::thread::sleep(Duration::from_millis(ms));
    }
    let marker = |m: &str| dir.join(format!("{engine}.{m}"));
    if marker("slow").exists() {
        std::thread::sleep(Duration::from_mins(1)); // past any deadline; the server kills the call
    }
    if marker("offline").exists() {
        return Some(Err("net::ERR_INTERNET_DISCONNECTED"));
    }
    let suffix = if marker("none").exists() {
        "-none"
    } else if marker("blocked").exists() {
        "-blocked"
    } else if std::fs::remove_file(marker("consent-once")).is_ok() {
        "-consent"
    } else {
        ""
    };
    Some(Ok(std::fs::read_to_string(
        dir.join(format!("{engine}{suffix}.html")),
    )
    .unwrap()))
}
