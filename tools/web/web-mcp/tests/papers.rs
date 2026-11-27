//! `search` with `papers: true` against stub `OpenAlex`, arXiv and Crossref servers, and Google Scholar's and Semantic
//! Scholar's captured pages through the real browser (`Mcp::start_real`).
mod common;

use std::time::{Duration, Instant};

use common::{Fixture, Mcp, PUBLIC, Resp, guarded, is_error, tempdir, text};
use serde_json::json;
use url::Url;

fn fixture(name: &str) -> String {
    std::fs::read_to_string(format!(
        "{}/tests/fixtures/papers/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

fn ok(ct: &str, name: &str) -> Vec<Resp> {
    vec![Resp::new(200, ct, fixture(name))]
}

/// `path` with `pairs` as the query string, spelled the way the server builds it.
fn with_query(path: &str, pairs: &[(&str, &str)]) -> String {
    let mut u = Url::parse("http://x").unwrap();
    u.set_path(path);
    u.query_pairs_mut().extend_pairs(pairs);
    format!("{}?{}", u.path(), u.query().unwrap())
}

fn start(fx: &Fixture) -> Mcp {
    Mcp::start_with(
        tempdir(),
        &[
            ("WEB_MCP_ARXIV_URL", fx.url("/arxiv")),
            ("WEB_MCP_OPENALEX_URL", fx.url("/openalex")),
            ("WEB_MCP_CROSSREF_URL", fx.url("/crossref")),
        ],
    )
}

fn papers(mcp: &mut Mcp, q: &str) -> serde_json::Value {
    mcp.call("search", json!({ "query": q, "papers": true }))
}

#[cfg(debug_assertions)]
#[test]
fn doi_query_merges_crossref_and_openalex() {
    let fx = Fixture::start(PUBLIC);
    fx.route(
        "/crossref/10.7717%2Fpeerj.4375",
        ok("application/json", "crossref-doi.json"),
    );
    fx.route(
        "/openalex/doi:10.7717/peerj.4375",
        ok("application/json", "openalex-doi.json"),
    );
    let mut mcp = start(&fx);
    let r = papers(&mut mcp, "doi:10.7717/peerj.4375");
    assert!(!is_error(&r), "{r}");
    let t = text(&r);
    assert!(
        t.starts_with("Source: Crossref + OpenAlex (searched "),
        "{t}"
    );
    assert!(
        t.contains(
            "## [1] The state of OA: a large-scale analysis (2018)\nDOI 10.7717/peerj.4375 · https://peerj.com/articles/4375.pdf\n\nDespite growing interest in Open Access (OA)."
        ),
        "{t}"
    );
    assert!(!t.contains("## [2]"), "{t}");
    assert!(!t.contains("Failed:"), "{t}");
}

#[cfg(debug_assertions)]
#[test]
fn one_source_failing_keeps_others() {
    let fx = Fixture::start(PUBLIC);
    fx.route(
        &with_query("/openalex", &[("search", "attention"), ("per_page", "5")]),
        ok("application/json", "openalex-search.json"),
    );
    fx.route(
        &with_query(
            "/arxiv",
            &[("search_query", "all:\"attention\""), ("max_results", "5")],
        ),
        ok("application/atom+xml", "arxiv-error.xml"),
    );
    let mut mcp = Mcp::start_with(
        tempdir(),
        &[
            ("WEB_MCP_ARXIV_URL", fx.url("/arxiv")),
            ("WEB_MCP_OPENALEX_URL", fx.url("/openalex")),
        ],
    );
    let r = papers(&mut mcp, "attention");
    assert!(!is_error(&r), "{r}");
    let t = text(&r);
    assert!(
        t.contains("## [1] Attention Is All You Need (2017)\nDOI 10.48550/arxiv.1706.03762 · arXiv 1706.03762 · https://arxiv.org/pdf/1706.03762\n\nTransformers use attention"),
        "{t}"
    );
    assert!(t.contains("## [2] A paper without abstract\n"), "{t}");
    assert!(
        t.contains("Failed: arXiv: incorrect id format for bogus"),
        "{t}"
    );
}

#[cfg(debug_assertions)]
#[test]
fn arxiv_id_asks_arxiv_and_openalex_and_lists_that_paper_first() {
    let fx = Fixture::start(PUBLIC);
    fx.route(
        &with_query("/arxiv", &[("id_list", "2005.14165")]),
        ok("application/atom+xml", "arxiv-ok.xml"),
    );
    fx.route(
        "/openalex/arxiv:2005.14165",
        vec![Resp::new(404, "application/json", "{}")],
    );
    let mut mcp = start(&fx);
    let r = papers(&mut mcp, "arXiv:2005.14165v4");
    let t = text(&r);
    let first = t.find("## [1] Language Models").expect(t);
    assert!(first < t.find("Attention Is All You Need").unwrap(), "{t}");
    assert!(
        t.contains("DOI 10.1000/GPT3 · arXiv 2005.14165 · http://arxiv.org/abs/2005.14165v4"),
        "{t}"
    );
    let (body, after) = guarded(t);
    assert!(body.contains("## [1] Language Models"), "{t}");
    assert_eq!(after, "\n\nFailed: OpenAlex: HTTP 404", "{t}");
}

#[cfg(debug_assertions)]
#[test]
fn a_429_is_retried_once_after_retry_after() {
    let fx = Fixture::start(PUBLIC);
    fx.route(
        "/crossref/10.7717%2Fpeerj.4375",
        vec![
            Resp::new(429, "text/plain", "slow down").header("Retry-After", "0"),
            Resp::new(200, "application/json", fixture("crossref-doi.json")),
        ],
    );
    fx.route(
        "/openalex/doi:10.7717/peerj.4375",
        vec![Resp::new(500, "text/plain", "")],
    );
    let mut mcp = start(&fx);
    let t = papers(&mut mcp, "10.7717/peerj.4375");
    let t = text(&t);
    assert!(t.contains("## [1] The state of OA"), "{t}");
    assert!(t.contains("Failed: OpenAlex: HTTP 500"), "{t}");
    assert_eq!(fx.hits("/crossref/10.7717%2Fpeerj.4375"), 2);
}

#[cfg(debug_assertions)]
#[test]
fn nothing_found_is_an_error_listing_the_failures() {
    let fx = Fixture::start(PUBLIC);
    fx.route(
        "/arxiv?id_list=1706.03762",
        vec![Resp::new(200, "text/plain", fixture("arxiv-throttled.txt"))],
    );
    let mut mcp = start(&fx);
    let r = papers(&mut mcp, "1706.03762");
    assert!(is_error(&r), "{r}");
    assert!(text(&r).contains("Failed: arXiv: throttled"), "{r}");
}

#[cfg(debug_assertions)]
#[test]
fn a_stalled_source_is_cut_at_the_deadline_and_the_others_answer() {
    let fx = Fixture::start(PUBLIC);
    fx.route(
        &with_query("/openalex", &[("search", "attention"), ("per_page", "5")]),
        ok("application/json", "openalex-search.json"),
    );
    fx.route(
        &with_query(
            "/arxiv",
            &[("search_query", "all:\"attention\""), ("max_results", "5")],
        ),
        vec![
            Resp::new(200, "application/atom+xml", fixture("arxiv-ok.xml"))
                .delay(Duration::from_secs(10)),
        ],
    );
    let mut mcp = Mcp::start_with(
        tempdir(),
        &[
            ("WEB_MCP_ARXIV_URL", fx.url("/arxiv")),
            ("WEB_MCP_OPENALEX_URL", fx.url("/openalex")),
            ("WEB_MCP_PAPERS_MS", "500".to_owned()),
        ],
    );
    let t0 = Instant::now();
    let r = papers(&mut mcp, "attention");
    assert!(
        t0.elapsed() < Duration::from_secs(5),
        "waited {:?}",
        t0.elapsed()
    );
    let t = text(&r);
    assert!(t.contains("## [1] Attention Is All You Need (2017)"), "{t}");
    assert!(t.contains("Failed: arXiv: no answer within 0.5 s"), "{t}");
}

fn route_attention(fx: &Fixture) {
    fx.route(
        &with_query("/openalex", &[("search", "attention"), ("per_page", "5")]),
        ok("application/json", "openalex-search.json"),
    );
    fx.route(
        &with_query(
            "/arxiv",
            &[("search_query", "all:\"attention\""), ("max_results", "5")],
        ),
        ok("application/atom+xml", "arxiv-ok.xml"),
    );
}

/// `route_attention` narrowed to the year before today, as `since: year` asks.
fn route_attention_since_a_year(fx: &Fixture) {
    let day = jiff::Timestamp::now()
        .to_zoned_datetime(jiff::tz::TimeZone::UTC)
        .date()
        .saturating_sub(jiff::ToSpan::year(1));
    // The server may read the clock just after UTC midnight: route the next day too.
    for day in [day, day.tomorrow().unwrap()] {
        let compact = day.strftime("%Y%m%d").to_string();
        fx.route(
            &with_query(
                "/openalex",
                &[
                    ("search", "attention"),
                    ("per_page", "5"),
                    ("filter", &format!("from_publication_date:{day}")),
                ],
            ),
            ok("application/json", "openalex-search.json"),
        );
        fx.route(
            &with_query(
                "/arxiv",
                &[
                    (
                        "search_query",
                        &format!(
                            "all:\"attention\" AND submittedDate:[{compact}0000 TO 999912312359]"
                        ),
                    ),
                    ("max_results", "5"),
                ],
            ),
            ok("application/atom+xml", "arxiv-ok.xml"),
        );
    }
}

/// Google Scholar's and Semantic Scholar's captured pages, read through the real browser, join the APIs' records:
/// Scholar's "Attention is all you need" is the `OpenAlex` and arXiv record, not a second one. With `since`, Scholar
/// takes the year and Semantic Scholar, which has no date filter, is skipped.
#[cfg(debug_assertions)]
#[test]
fn papers_merge_browser_engines_with_the_apis() {
    let fx = Fixture::start(PUBLIC);
    route_attention(&fx);
    route_attention_since_a_year(&fx);
    let mut mcp = Mcp::start_real_with(
        &["scholar", "semanticscholar"],
        &[
            ("WEB_MCP_ARXIV_URL", fx.url("/arxiv")),
            ("WEB_MCP_OPENALEX_URL", fx.url("/openalex")),
        ],
    );
    let r = papers(&mut mcp, "attention");
    assert!(!is_error(&r), "{r}");
    let t = text(&r);
    assert!(
        t.starts_with("Source: OpenAlex + arXiv + Google Scholar + Semantic Scholar (searched "),
        "{t}"
    );
    assert_eq!(
        t.to_lowercase()
            .matches("attention is all you need (")
            .count(),
        1,
        "{t}"
    );
    assert!(t.contains("## [1] Attention Is All You Need (2017)"), "{t}");
    assert!(
        t.contains("Searching for best practices in retrieval-augmented generation"),
        "{t}"
    );
    assert!(t.contains("Rust-Like Borrow Checker"), "{t}");
    // The paper engines log their outcome to the block log as the search engines do.
    let raw = std::fs::read_to_string(mcp.search.join("blocks.jsonl")).unwrap();
    let mut logged: Vec<(String, String)> = raw
        .lines()
        .map(|l| {
            let v: serde_json::Value = serde_json::from_str(l).unwrap();
            let get = |k: &str| v[k].as_str().unwrap_or_default().to_owned();
            (get("engine"), get("outcome"))
        })
        .collect();
    logged.sort();
    assert_eq!(
        logged,
        [
            ("scholar".to_owned(), "ok".to_owned()),
            ("semanticscholar".to_owned(), "ok".to_owned())
        ]
    );

    let r = mcp.call(
        "search",
        json!({"query": "attention", "papers": true, "since": "year"}),
    );
    assert!(!is_error(&r), "{r}");
    let t = text(&r);
    assert!(t.contains("## [1] Attention Is All You Need (2017)"), "{t}");
    assert!(!t.contains("Failed:"), "{t}");
    assert!(
        t.contains("skipped: semanticscholar: no year filter"),
        "{t}"
    );
    assert!(
        t.contains("Searching for best practices in retrieval-augmented generation"),
        "{t}"
    );
    assert!(!t.contains("Rust-Like Borrow Checker"), "{t}");
}

#[cfg(debug_assertions)]
#[test]
fn browser_trouble_still_answers_from_apis() {
    let fx = Fixture::start(PUBLIC);
    route_attention(&fx);
    let mut mcp = Mcp::start_with(
        tempdir(),
        &[
            ("WEB_MCP_ARXIV_URL", fx.url("/arxiv")),
            ("WEB_MCP_OPENALEX_URL", fx.url("/openalex")),
            ("WEB_MCP_CHROME", "/nonexistent/chrome".into()),
        ],
    );
    let r = papers(&mut mcp, "attention");
    assert!(!is_error(&r), "{r}");
    let t = text(&r);
    assert!(t.contains("## [1] Attention Is All You Need (2017)"), "{t}");
    assert!(
        t.contains("skipped: scholar: WEB_MCP_CHROME=/nonexistent/chrome is not a file"),
        "{t}"
    );
    assert!(t.contains("semanticscholar: WEB_MCP_CHROME"), "{t}");
}

/// A DOI is the APIs' alone: no browser engine is asked, so a missing agent-browser goes unnoticed.
#[cfg(debug_assertions)]
#[test]
fn doi_query_skips_browser_engines() {
    let fx = Fixture::start(PUBLIC);
    fx.route(
        "/crossref/10.7717%2Fpeerj.4375",
        ok("application/json", "crossref-doi.json"),
    );
    fx.route(
        "/openalex/doi:10.7717/peerj.4375",
        ok("application/json", "openalex-doi.json"),
    );
    let mut mcp = Mcp::start_with(
        tempdir(),
        &[
            ("WEB_MCP_OPENALEX_URL", fx.url("/openalex")),
            ("WEB_MCP_CROSSREF_URL", fx.url("/crossref")),
            ("WEB_MCP_AGENT_BROWSER", "/nonexistent/agent-browser".into()),
        ],
    );
    let r = papers(&mut mcp, "doi:10.7717/peerj.4375");
    assert!(!is_error(&r), "{r}");
    assert!(!text(&r).contains("skipped"), "{r}");
}
