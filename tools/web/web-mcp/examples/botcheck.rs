//! Bot-check run (spec G6): opens four public bot-check pages in web-mcp's real window, each in its own session,
//! saves each page's text and a screenshot under `<search dir>/botcheck/<timestamp>/`, and prints the checks each page
//! flags. Opt-in and by hand only; not in `npm test` or CI.
//!
//! `cargo run -p web-mcp --example botcheck`, with web-mcp's own variables: `WEB_MCP_SEARCH_DIR`, `WEB_MCP_CHROME`
//! and `WEB_MCP_AGENT_BROWSER` (each optional, with the server's defaults).
#[allow(
    dead_code,
    reason = "only the search folder and agent-browser are read here"
)]
#[path = "../src/config.rs"]
mod config;

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use browser_core::browser::Browser;
use browser_core::profile::Profiles;
use browser_core::window::{Window, tie_to_process};
use serde_json::Value;

/// Session name and page: one tab each.
const PAGES: [(&str, &str); 4] = [
    ("botcheck-sannysoft", "https://bot.sannysoft.com/"),
    (
        "botcheck-browserscan",
        "https://www.browserscan.net/bot-detection",
    ),
    (
        "botcheck-deviceinfo",
        "https://deviceandbrowserinfo.com/are_you_a_bot",
    ),
    (
        "botcheck-creepjs",
        "https://abrahamjuliot.github.io/creepjs/",
    ),
];

/// How long each page gets to run its checks before it is read.
const SETTLE: Duration = Duration::from_secs(8);

/// Words that name an automation signal on the pages other than sannysoft (matched lowercase).
const SIGNALS: [&str; 6] = ["bot", "robot", "webdriver", "automation", "headless", "cdp"];

#[tokio::main]
async fn main() -> Result<()> {
    tie_to_process();
    let cfg = config::Config::from_env()?;
    // ring, as in web-mcp's main.rs: browser-core picks no rustls provider.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let search_dir = cfg
        .search_dir
        .clone()
        .ok_or_else(|| anyhow!("no search folder: set WEB_MCP_SEARCH_DIR"))?;
    let stamp = jiff::ZonedDateTime::now()
        .strftime("%Y-%m-%d_%H%M%S")
        .to_string();
    let out = std::path::absolute(search_dir.join("botcheck").join(stamp))?;
    std::fs::create_dir_all(&out).with_context(|| format!("create {}", out.display()))?;

    let profiles = Profiles::new(Some(search_dir)).map(Arc::new);
    let browser = Browser::new(&cfg.agent_browser, Window::new(profiles));
    let result = check_all(&browser, &out).await;
    browser.close_all().await;
    result?;
    println!("\nSaved to {}", out.display());
    Ok(())
}

async fn check_all(browser: &Browser, out: &Path) -> Result<()> {
    browser.warm().await.map_err(|e| anyhow!("window: {e}"))?;
    for (name, url) in PAGES {
        println!("\n== {url}");
        match check(browser, name, url, out).await {
            Ok(flagged) if flagged.is_empty() => println!("  (nothing flagged)"),
            Ok(flagged) => flagged.iter().for_each(|l| println!("  {l}")),
            Err(e) => println!("  failed: {e:#}"),
        }
        let _ = browser.close(&browser.session(name)).await;
    }
    Ok(())
}

/// Opens `url` in session `name`, saves its text and screenshot as `<name>.txt` / `<name>.png` in `out`, and returns
/// the lines naming a failed or flagged check.
async fn check(browser: &Browser, name: &str, url: &str, out: &Path) -> Result<Vec<String>> {
    let key = browser.session(name);
    let run = |args: Vec<String>| {
        let key = key.clone();
        async move {
            browser
                .run(&key, &args)
                .await
                .map_err(|e| anyhow!("{}: {e}", args.join(" ")))
        }
    };
    run(vec!["open".into(), url.into()]).await?;
    tokio::time::sleep(SETTLE).await;
    let text = run(["get", "text", "body"].map(str::to_owned).to_vec()).await?;
    let text = match &text {
        Value::String(s) => s.clone(),
        v => v["text"]
            .as_str()
            .map_or_else(|| v.to_string(), str::to_owned),
    };
    std::fs::write(out.join(format!("{name}.txt")), &text)?;
    let shot = out.join(format!("{name}.png"));
    run(vec![
        "screenshot".into(),
        shot.to_string_lossy().into_owned(),
    ])
    .await?;
    Ok(flagged(name, &text))
}

/// Sannysoft marks each failed row `failed`; the other pages are searched for the words in `SIGNALS`.
fn flagged(name: &str, text: &str) -> Vec<String> {
    let words: &[&str] = if name == "botcheck-sannysoft" {
        &["failed"]
    } else {
        &SIGNALS
    };
    text.lines()
        .map(str::trim)
        .filter(|l| {
            let l = l.to_lowercase();
            words.iter().any(|w| l.contains(w))
        })
        .map(str::to_owned)
        .collect()
}
