//! `rows` against the fake agent-browser, which answers a page of `$FAKE_AB_PAGES` named by the last segment of the
//! opened address (see `other_page` in `tests/bin/fake_agent_browser.rs`).
mod common;

use std::fmt::Write as _;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use common::{Mcp, command_of, is_error, logged, tempdir, text};
use serde_json::{Value, json};

/// A server whose agent-browser is the fake, serving the pages in the returned folder, plus the fake's call log.
fn start(pages: &[(&str, String)]) -> (Mcp, PathBuf) {
    let dir = tempdir();
    for (name, html) in pages {
        std::fs::write(dir.join(format!("{name}.html")), html).unwrap();
    }
    let log = tempdir().join("calls.jsonl");
    let mcp = Mcp::start_with(
        tempdir(),
        &[
            ("FAKE_AB_PAGES", dir.display().to_string()),
            ("FAKE_AB_LOG", log.display().to_string()),
        ],
    );
    (mcp, log)
}

/// `n` list items in a list of class `class`, each a link with a text long enough to count.
fn list(class: &str, n: usize, filler: &str) -> String {
    let mut items = String::new();
    for i in 0..n {
        let _ = write!(
            items,
            r#"<li class="{class}"><a href="/{class}/{i}">Listing {i} {filler}</a></li>"#
        );
    }
    format!("<ul>{items}</ul>")
}

fn page(title: &str, body: &str) -> String {
    format!("<html><head><title>{title}</title></head><body><main>{body}</main></body></html>")
}

/// A page whose first group has 8 items and whose second has 6.
fn two_groups() -> String {
    page(
        "Two groups",
        &(list("ad", 8, "with some words of text") + &list("filter", 6, "another few words")),
    )
}

fn url(name: &str) -> String {
    format!("http://shop.test/{name}")
}

/// The numbered lines of a reply.
fn numbered(t: &str) -> usize {
    t.lines()
        .filter(|l| {
            l.split_once(". ")
                .is_some_and(|(n, _)| n.parse::<usize>().is_ok())
        })
        .count()
}

#[test]
fn rows_returns_numbered_groups_and_archives_the_page() {
    let (mut mcp, log) = start(&[("ads", two_groups())]);
    let r = mcp.call("rows", json!({"url": url("ads")}));
    assert!(!is_error(&r), "{r}");
    let t = text(&r);
    assert!(t.contains("Group 1: 8 items"), "{t}");
    assert!(t.contains("Group 2: 6 items"), "{t}");
    assert!(t.lines().any(|l| l.starts_with("1. ")), "{t}");
    let source = t.lines().next().unwrap();
    assert!(source.starts_with(&format!("Source: {} (fetched ", url("ads"))));
    let archived = source
        .split("archived at ")
        .nth(1)
        .and_then(|s| s.split("). Untrusted").next())
        .unwrap();
    assert!(mcp.project.join(archived).is_file(), "{source}");
    assert!(archived.ends_with("raw.html"), "{source}");
    let batches: Vec<Value> = logged(&log)
        .into_iter()
        .filter(|c| command_of(c).starts_with("batch --json"))
        .map(|c| serde_json::from_str(c["stdin"].as_str().unwrap()).unwrap())
        .collect();
    assert_eq!(
        batches,
        [json!([
            ["open", url("ads")],
            ["get", "html", "body"],
            ["get", "url"]
        ])]
    );
}

#[test]
fn rows_group_and_limit() {
    let (mut mcp, _) = start(&[("ads", two_groups())]);
    let r = mcp.call("rows", json!({"url": url("ads"), "group": 2, "limit": 3}));
    assert!(!is_error(&r), "{r}");
    let t = text(&r);
    assert_eq!(numbered(t), 3, "{t}");
    assert!(t.contains("Showing 3 of 6."), "{t}");
    assert!(!t.contains("Group 1"), "{t}");
}

#[test]
fn rows_budget_keeps_whole_rows() {
    let long = "words that make the row long enough to be cut ".repeat(8);
    let (mut mcp, _) = start(&[("many", page("Many", &list("ad", 400, &long)))]);
    let r = mcp.call("rows", json!({"url": url("many"), "limit": 200}));
    assert!(!is_error(&r), "{r}");
    let t = text(&r);
    assert!(
        t.chars().count() <= 12_500,
        "{} characters",
        t.chars().count()
    );
    assert!(t.lines().any(|l| l.starts_with("1. ")), "{t}");
    let shown: usize = t
        .lines()
        .find_map(|l| l.strip_prefix("Showing ")?.strip_suffix(" of 400."))
        .unwrap_or_else(|| panic!("no Showing line: {t}"))
        .parse()
        .unwrap();
    assert!(shown < 200, "{shown} rows");
    assert_eq!(numbered(t), shown, "{t}");
    assert!(t.lines().next().unwrap().contains(".web/"), "{t}");
}

#[test]
fn rows_no_group_names_the_title_and_the_hints() {
    let (mut mcp, _) = start(&[("few", page("Odd Page Title", &list("ad", 3, "some text")))]);
    let r = mcp.call("rows", json!({"url": url("few")}));
    let t = text(&r);
    assert!(t.contains("Odd Page Title"), "{t}");
    assert!(t.contains("`item`"), "{t}");
    assert!(t.contains("still loading"), "{t}");
}

#[test]
fn rows_bad_arguments_are_errors() {
    let one = page("One", &list("ad", 8, "with some words of text"));
    let (mut mcp, _) = start(&[("one", one)]);
    for (args, names) in [
        (json!({"url": url("one"), "group": 3}), "1 or 2"),
        (json!({"url": url("one"), "group": 2}), "only group 1"),
        (json!({"url": url("one"), "limit": 0}), "1 to 200"),
        (json!({"url": url("one"), "item": "li["}), "li["),
    ] {
        let r = mcp.call("rows", args.clone());
        assert!(is_error(&r), "{args}: {r}");
        assert!(text(&r).contains(names), "{args}: {r}");
    }
}

#[test]
fn rows_two_calls_to_one_host_are_a_second_apart() {
    let (mut mcp, _) = start(&[("ads", two_groups())]);
    mcp.call("rows", json!({"url": url("ads")}));
    std::thread::sleep(Duration::from_millis(1100));
    let started = Instant::now();
    for _ in 0..2 {
        let r = mcp.call("rows", json!({"url": url("ads")}));
        assert!(!is_error(&r), "{r}");
    }
    assert!(
        started.elapsed() >= Duration::from_secs(1),
        "{:?}",
        started.elapsed()
    );
}

#[test]
fn rows_links_follow_the_landed_address() {
    let (mut mcp, _) = start(&[("redirect-private", two_groups())]);
    let r = mcp.call("rows", json!({"url": url("redirect-private")}));
    assert!(!is_error(&r), "{r}");
    let t = text(&r);
    assert!(t.starts_with("Source: http://127.0.0.1/admin "), "{t}");
    assert!(t.contains("| http://127.0.0.1/ad/0"), "{t}");
}
