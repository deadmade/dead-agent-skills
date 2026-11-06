//! Google: a result is an `a` holding an `h3`, inside `#rso`/`#search`. The captured result page
//! (`google.html`, web-mcp-google-block/findings.md) confirms the rows, but each row's link is an opaque
//! `/goto?url=…` redirect on Google's own host with no target in the page. The parser keeps those rows as they are
//! and `search::resolve_goto` reads each one's target (a plain GET answers `302`); Google's other own links (ads,
//! AI Mode) are dropped. The block and consent markers are checked against fixtures.

use dom_query::Document;
use url::Url;

use super::{Block, Found, Parsed, Since, captcha_if, first_text, on_domain, row, text, verdict};

pub(super) const READY: &str = r#"!!(
  document.body &&
  (document.querySelector('#rso a h3, #search a h3') ||
    /did not match any documents/.test(
      (document.querySelector('#topstuff, #botstuff, #rcnt') || {}).innerText || '',
    ) ||
    location.pathname.startsWith('/sorry') ||
    document.querySelector('#captcha-form, form[action="index"] #recaptcha'))
);"#;

pub(super) fn url(query: &str, since: Option<Since>) -> Url {
    let mut u = Url::parse_with_params(
        "https://www.google.com/search",
        [("q", query), ("hl", "en"), ("gl", "us"), ("num", "10")],
    )
    .expect("static URL");
    if let Some(s) = since {
        let qdr = match s {
            Since::Day => "qdr:d",
            Since::Week => "qdr:w",
            Since::Month => "qdr:m",
            Since::Year => "qdr:y",
        };
        u.query_pairs_mut().append_pair("tbs", qdr);
    }
    u
}

/// Google's `/url?q=<target>&sa=U` becomes the target; anything else stays.
fn unwrap_redirect(page: &Url, href: &str) -> String {
    let target = page
        .join(href)
        .ok()
        .filter(|u| on_domain(u, "google.com") && u.path() == "/url")
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "q" || k == "url")
                .map(|(_, v)| v.into_owned())
        });
    target.unwrap_or_else(|| href.to_owned())
}

/// A result's opaque redirect: `/goto?url=…` on the page's own host, whose `Location` holds the real address.
pub(super) fn is_goto(url: &Url, page: &Url) -> bool {
    url.host() == page.host() && url.path() == "/goto" && url.query_pairs().any(|(k, _)| k == "url")
}

pub(super) fn parse(doc: &Document, page: &Url) -> Parsed {
    let found = doc
        .select("#rso .MjjYud, #rso .g, #search .MjjYud, #search .g")
        .iter()
        .filter_map(|block| {
            let a = block.select("a:has(h3)").first();
            let snippet = first_text(&block, ".VwiC3b, [data-sncf]");
            row(
                page,
                &unwrap_redirect(page, &a.attr("href")?),
                text(&a.select("h3").first()),
                snippet,
            )
        })
        .filter(|f: &Found| f.url.host() != page.host() || is_goto(&f.url, page))
        .collect();
    let block = if page.host_str() == Some("consent.google.com")
        || doc.select("form[action*=\"consent.google.com\"]").exists()
    {
        Some(Block::Consent)
    } else {
        captcha_if(doc, "#captcha-form, form[action=\"index\"] #recaptcha")
            .or_else(|| page.path().starts_with("/sorry").then_some(Block::Captcha))
    };
    let none =
        text(&doc.select("#topstuff, #botstuff, #rcnt")).contains("did not match any documents");
    verdict(found, block, none)
}

#[cfg(test)]
mod tests {
    use super::super::tests::{assert_results, url};
    use super::super::{Block, Engine, Parsed};

    const CAPTCHA: &str = include_str!("../../tests/fixtures/engines/google-captcha.html");
    const CONSENT: &str = include_str!("../../tests/fixtures/engines/google-consent.html");

    fn page() -> url::Url {
        url("https://www.google.com/search?q=x")
    }

    /// A captured page, read at run time: `google-none.html` isn't in the repository yet.
    fn fixture(name: &str) -> String {
        let path = format!(
            "{}/tests/fixtures/engines/{name}",
            env!("CARGO_MANIFEST_DIR")
        );
        std::fs::read_to_string(path).unwrap()
    }

    /// Every organic row links to an opaque `/goto?url=…` redirect on Google's own host; the parser keeps those for
    /// `search::resolve_goto` to read.
    #[test]
    fn google_parses_fixture() {
        let found = assert_results(Engine::Google.parse(&fixture("google.html"), &page()), None);
        assert!(
            found
                .iter()
                .all(|f| f.url.host_str() == Some("www.google.com") && f.url.path() == "/goto"),
            "{found:?}"
        );
    }

    #[test]
    #[ignore = "needs a no-results page: a nonsense query still got results (web-mcp-google-block/findings.md)"]
    fn google_no_results_is_empty() {
        assert_eq!(
            Engine::Google.parse(&fixture("google-none.html"), &page()),
            Parsed::Results(vec![])
        );
    }

    #[test]
    fn google_unwraps_redirect_links() {
        let html = r#"<div id="rso"><div class="g"><a href="/url?q=https://tokio.rs/x&amp;sa=U"><h3>Tokio</h3></a>
            <div class="VwiC3b">An runtime</div></div></div>"#;
        let Parsed::Results(found) = Engine::Google.parse(html, &page()) else {
            panic!("no rows");
        };
        assert_eq!(found[0].url.as_str(), "https://tokio.rs/x");
        assert_eq!(found[0].title, "Tokio");
        assert_eq!(found[0].snippet, "An runtime");
    }

    #[test]
    fn google_keeps_other_google_hosts() {
        let html = r#"<div id="rso"><div class="g"><a href="https://developers.google.com/x"><h3>Docs</h3></a></div>
            <div class="g"><a href="https://www.google.com/aclk?x"><h3>Ad</h3></a></div></div>"#;
        let Parsed::Results(found) = Engine::Google.parse(html, &page()) else {
            panic!("no rows");
        };
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].url.host_str(), Some("developers.google.com"));
    }

    #[test]
    fn google_sorry_page_is_a_captcha() {
        let sorry = url("https://www.google.com/sorry/index?continue=x");
        assert_eq!(
            Engine::Google.parse(CAPTCHA, &sorry),
            Parsed::Blocked(Block::Captcha)
        );
        assert_eq!(
            Engine::Google.parse(CAPTCHA, &page()),
            Parsed::Blocked(Block::Captcha)
        );
    }

    #[test]
    fn google_consent_page_is_a_consent_block() {
        let consent = url("https://consent.google.com/m?continue=x");
        assert_eq!(
            Engine::Google.parse(CONSENT, &consent),
            Parsed::Blocked(Block::Consent)
        );
        assert_eq!(
            Engine::Google.parse(CONSENT, &page()),
            Parsed::Blocked(Block::Consent)
        );
    }
}
