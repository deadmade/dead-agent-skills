# web-mcp

`plugins/shared/web-mcp/` and `tools/web/web-mcp/`.

`plugins/shared/web-mcp/`: a stdio MCP server (Rust, `tools/web/web-mcp/`) with `search`, `fetch`, `browser`, `rows` and
`lookup`, built for Windows and Linux x64 only (`crates-build.yml`, `targets` in `assets/tools.json`; no macOS or ARM
builds); the installer downloads it and sets `binPath`. Ranking is BM25 only: the H4 experiment (`examples/h4.rs`, `h4`
feature) showed embeddings don't lift recall over BM25 on BEIR, so none ship.

One browser window per server, every engine, `browser` session and fetch fallback attached to it as a tab
(`docs/adr/0007-one-browser-window.md`); its daemon behaviour is recorded in
`docs/features/web-mcp-one-window/findings.md`, tab raising in
`docs/solutions/click-and-press-reach-nothing-in-a-hidden-tab.md`, the engine and daemon timings in
`docs/features/web-mcp-search/findings.md`, and specific bugs in `docs/solutions/` (Google's `/goto` links, a hidden
tab's `click`/`press`, agent-browser's install and a Windows Chrome quirk).

The browser, window and profile code (the agent-browser driver, the one window, the profile slots and the cookie
extension download) lives in the `tools/web/browser-core/` library crate, which web-mcp depends on
(`docs/components/browser-core.md`). The search policy (engines, their turns, rests and deadlines) stays here.
`search` and `papers` bind their engines' tabs (`Browser::bind`) after the window starts and before any engine
navigates: in agent-browser a tab's first call waits on another tab's pending page, so one hanging engine would
otherwise time the others out on a fresh window.

`rows` opens its pages as a tab of that window too, holds a 1 s gap per host, and its group detection is tested on
captured pages in `tests/fixtures/rows/` (`docs/adr/0013-rows-tool-and-shop-skill.md`). Its tree walk is bounded by a
visit budget that charges text by bytes, because a hostile page can hide a huge text node under thousands of nested
parents (`docs/solutions/rows-walk-budget-counts-bytes-not-nodes.md`).

Claude Code overlaps several MCP calls from one message only when the tool has `read_only_hint`; a call without it runs
alone and delays those after it (measured on 2.1.301). `browser` goes without on purpose, so calls that steer one tab
stay in order. Adding the hint would reorder them.

## Contributor rules

Contributor rules: tests drive a fake agent-browser (`tests/bin/fake_agent_browser.rs`, a `[[bin]]`;
`cargo build --locked -p web-mcp --bin fake-agent-browser` before the unit tests), which changes with any agent-browser
answer web-mcp reads and doesn't model every upstream quirk
(`docs/solutions/click-and-press-reach-nothing-in-a-hidden-tab.md`). Test-only hooks: the fake's `$FAKE_AB_PAGES` folder
serves a result page for an engine host and, for any other host, `<last path segment of the URL>.html`;
`WEB_MCP_TEST_PUBLIC_IP` (debug builds or the `test-hooks` feature) treats a comma-separated list of IPs as public;
`WEB_MCP_TEST_ENGINES` (the same builds, `google=http://127.0.0.3:8080,…`) moves a listed engine's result URL to that
scheme, host and port, keeping its path and query, so `/sorry` and `/goto` stay real;
`WEB_MCP_FALLBACK_MS`, `WEB_MCP_PAPERS_MS` and `WEB_MCP_LOOKUP_MS` (read in every build, release included) shorten the
fetch fallback's, each paper source's and each lookup source's deadline.

The real harness, `Mcp::start_real` in `tests/common/mod.rs`, starts web-mcp on the real agent-browser
(`real_agent_browser()` in browser-core: `WEB_MCP_AGENT_BROWSER`, else the installer's copy, else the test panics) and
Chrome for Testing, and serves each named engine's capture from `tests/fixtures/engines/` (their dates, queries and
scrubs are in its `README.md`) on its own server on `127.0.0.3`, at the engine's path for any query, under a CSP that
runs none of the capture's scripts and loads nothing from the engine's hosts. As it serves a capture, every absolute
`href` points at a stand-in page on `127.0.0.2` (a Bing `ck/a` wrapper by the address it wraps), and Google's `/goto`
links redirect to one, so a search fetches no real result. One such test runs at a time; dropping its `Mcp` closes web-mcp's stdin, waits up to 5 s, then
kills web-mcp and every process whose command line holds its temp folder, and removes that folder. The parsers still
see the loopback host, so a host check (Google's consent host) isn't covered. These tests are skipped in the Nix
package checks (`checkFlags` in `flake.nix`) and run in crates.yml's rust job, which downloads the pinned agent-browser
and caches Chrome for Testing; `scripts/test.mjs` reports web-mcp, browser-core and http-runner as NOT RUN when it
finds no agent-browser.

Env knobs: `WEB_MCP_CHROME` picks the browser binary; `WEB_MCP_SEARCH_DIR` picks where profile slots live (no temp
fallback).

`fetch` runs with `allow_private: true` (`tools.rs`, for the user's own localhost sites), so a conductor that follows
links from untrusted pages, as /evaluate does, has only a text rule on the URL: a hostname resolving to a private
address gets through, though a public URL's redirect onto one is refused.
