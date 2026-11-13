# browser-core

`tools/browser-core/`, a Rust library crate in the root Cargo workspace. web-mcp is its only consumer.

## What it owns

- `browser.rs`: the agent-browser driver. It runs agent-browser as a child process, keeps each call's session key, runs
  `batch`, `render` and `rendered_html`, and holds the attached-call timeout (`ATTACHED_TIMEOUT`, 8 s, part of
  agent-browser's daemon fingerprint).
- `window.rs`: the one window. It names the owner session, starts the window on the first call (a restarted Chrome
  counts as a new generation), and hands out the attach config. `tie_to_process` makes the window's Chrome die with the
  server (a kill-on-close job on Windows).
- `profile.rs`: the search folder. It finds Chrome, downloads the cookie extension (2 MiB cap, sha-256 check), holds a
  profile slot under a lock until exit, writes the config files and keeps the rest and consent marks.

## Why a crate

A second server can use the window without taking web-mcp's search, fetch and rows code. The three files import none of
it (`engines`, `search`, `fetch`, `archive`, `rows`, `papers`, `tools`, `api`, `lookup`), and as a separate crate the
compiler enforces that. They still carry web-mcp's session-name conventions: see the reserved names below. Search policy stays in web-mcp: which engine, its turn, the `search-<engine>` session name, the
10 s engine deadline and the 30 min rest.

## Public API

What web-mcp uses, and nothing else:

- `browser::{Browser, BrowserError, SearchRun, ATTACHED_TIMEOUT, READ_MARGIN, check_session}`. `Browser` has `new`,
  `session`, `warm`, `run`, `batch`, `batch_once`, `render`, `rendered_html`, `close`, `close_all` and the public field
  `fallback_deadline`. `SearchRun` has the public field `ready_js`; `BrowserError` has the variants `Missing`, `Failed`,
  `Timeout` and `TabGone`.
- `window::{Window, tie_to_process}`. `Window::new` takes the `Profiles` (or the error that made them). `tie_to_process`
  does nothing off Windows.
- `profile::Profiles`: `new`, `rest`, `resting`, `consent_seen` and `set_consent_seen`. With the feature `test-support`,
  also `with_chrome`, which gives a test a browser instead of the lookup through `WEB_MCP_CHROME`, HOME and PATH.

## What a consumer must do

- Install a rustls crypto provider before `Profiles::new`. The crate depends on reqwest with `rustls-no-provider` and
  picks none. web-mcp's `main.rs` installs ring first.
- `rest` and `resting` take a plain name and join it under the search folder; `consent_seen` and `set_consent_seen` join
  it under the held profile slot (the search folder until one is held). Pass one path segment: nothing checks it.
- Session names that start with `search-`, `web-mcp-search-` or `web-mcp-fetch-`, and the name `window`, are reserved:
  `check_session` rejects them, and a key with the fetch prefix is named differently from a user's.
- Build `fake-agent-browser` before the crate's unit tests: `cargo build --locked -p web-mcp --bin fake-agent-browser`.
  The fake stays in web-mcp. A crate that runs `Profiles::with_chrome` in its own tests enables `test-support`.

## Names that stay web-mcp's

The crate reads `WEB_MCP_CHROME` and names `WEB_MCP_SEARCH_DIR` in its errors; web-mcp's config reads that variable and
passes the path to `Profiles::new`. The crate sends the `web-mcp/` user agent. All three are unchanged. The other
`WEB_MCP_*` knobs are in `docs/components/web-mcp.md`.
