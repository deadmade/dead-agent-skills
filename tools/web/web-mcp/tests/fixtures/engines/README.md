# Engine captures

Real engine pages, each the `get html body` of the engine's tab, read by the engines' inline parser tests and served by
`Mcp::start_real` (`tests/common/mod.rs`) in place of the engine, which points their links at local stand-ins as it
serves them. No capture is hand-shaped. What each scrub replaced is in
the findings named below; nothing else was changed.

| file                                    | date       | how                        | query or page                                         |
| --------------------------------------- | ---------- | -------------------------- | ----------------------------------------------------- |
| `bing.html`                             | 2026-10-23 | agent-browser 0.39.1 (A)   | `tokio select cancellation safety`, 10 results        |
| `bing-ads.html`                         | 2026-10-23 | agent-browser 0.39.1 (A)   | `postgres partial index example`, with `li.b_ad` ads  |
| `bing-none.html`                        | 2026-10-23 | agent-browser 0.39.1 (A)   | a nonsense query: "There are no results for"          |
| `brave.html`                            | 2026-10-23 | agent-browser 0.39.1 (A)   | `tokio select cancellation safety`, 20 results        |
| `brave-captcha.html`                    | 2026-11-24 | web-mcp 0.6.61 archive (C) | a nonsense query: "Verifying you're not a bot"        |
| `duckduckgo.html`                       | 2026-10-23 | agent-browser 0.39.1 (A)   | `tokio select cancellation safety`, 10 results        |
| `duckduckgo-none.html`                  | 2026-10-23 | agent-browser 0.39.1 (A)   | a quoted nonsense query: "No results found for"       |
| `duckduckgo-captcha.html`               | 2026-10-23 | agent-browser 0.39.1 (A)   | the anomaly modal ("bots use DuckDuckGo too")         |
| `duckduckgo-captcha-lite.html`          | 2026-10-23 | agent-browser 0.39.1 (A)   | html.duckduckgo.com's error-lite page                 |
| `google.html`                           | 2026-11-03 | web-mcp from `2baae14` (B) | `Tokio 1.x vs smol`                                   |
| `google-captcha.html`                   | 2026-10-23 | agent-browser 0.39.1 (A)   | `/sorry` "unusual traffic" reCAPTCHA                  |
| `google-consent.html`                   | 2026-10-23 | agent-browser 0.39.1 (A)   | `consent.google.com`, reached from the home page      |
| `scholar.html`                          | 2026-10-23 | agent-browser 0.39.1 (A)   | `retrieval augmented generation`, 10 results          |
| `scholar-none.html`                     | 2026-10-23 | agent-browser 0.39.1 (A)   | a quoted nonsense query: "did not match any articles" |
| `semanticscholar.html`                  | 2026-11-24 | web-mcp 0.6.61 tab (C)     | `rust borrow checker`, 10 results                     |
| `semanticscholar-none.html`             | 2026-11-24 | web-mcp 0.6.61 archive (C) | a nonsense query: "No Papers Found"                   |
| `semanticscholar-captcha.html`          | 2026-10-23 | agent-browser 0.39.1 (A)   | AWS WAF "Let's confirm you are human"                 |
| `semanticscholar-captcha-noscript.html` | 2026-10-23 | agent-browser 0.39.1 (A)   | the challenge's first, noscript stage                 |

- **A**: agent-browser driving Helium on NixOS, before web-mcp searched (`docs/features/web-mcp-search/findings.md`,
  "Fixtures", which lists the scrubs).
- **B**: the `search-google` tab of a web-mcp built from `main` (`docs/features/web-mcp-google-block/findings.md`,
  which lists the scrubs).
- **C**: the release web-mcp 0.6.61 on Windows, agent-browser 0.43.0 and Chrome for Testing 158, a fresh search folder.
  "archive" is the `raw.html` web-mcp kept of a page without results; "tab" is `agent-browser get html body` from the
  engine's session after web-mcp parsed it as results, since web-mcp keeps no result page. In `brave-captcha.html` the
  located country and coordinates are now empty (`country:""`, `geoLocation:""`).

Not captured yet (tried on 2026-11-24, and once more each on 2026-11-25 with agent-browser 0.43.0 and a fresh profile):
`brave-none.html` (Brave answered with its bot check, now `brave-captcha.html`; the second time the open failed with
`net::ERR_ABORTED`) and `google-none.html` (a fresh profile's Google search timed out, and its tab was gone before it
could be read; the second time Google sent it straight to its `/sorry` page). Their engines' no-results answer is not
covered through the browser.

Hand-made, not captures: `bing-typing-nobox.html` (no search box), `bing-typing-nosubmit.html` (a form that never
submits) and `bing-typing-stall.html` (a box whose keydown handler holds the page for 30 s), Bing-shaped rows each, for
the typing faults. `Mcp::start_real` serves only these with their inline handlers allowed; every capture is served with
its scripts blocked.
