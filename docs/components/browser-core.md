# browser-core

`tools/web/browser-core/`, a Rust library crate in the root Cargo workspace. web-mcp is its only consumer.

## What it owns

- `browser.rs`: the agent-browser driver. It runs agent-browser as a child process, keeps each call's session key, runs
  `batch`, `render` and `rendered_html`, and holds the attached-call timeout (`ATTACHED_TIMEOUT`, 8 s, part of
  agent-browser's daemon fingerprint). After a session's `close` succeeds it removes that session's `<session>.target`
  from agent-browser's folder (`$XDG_RUNTIME_DIR/agent-browser`, on Windows too, else `~/.agent-browser`), which
  agent-browser 0.43.0's `close` keeps; a failed or timed-out close leaves it, since the daemon may still hold the tab.
- `window.rs`: the one window. It names the owner session, starts the window on the first call, relaunches a dead
  Chrome through the owner's `open` (agent-browser doesn't on its own; a restarted Chrome counts as a new generation),
  and hands out the attach config. `tie_to_process` makes the window's Chrome die with the server (a kill-on-close job
  on Windows).
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
  `session`, `warm`, `bind`, `run`, `batch`, `batch_once`, `render`, `rendered_html`, `close`, `close_all` and the public field
  `fallback_deadline`. `SearchRun` has the public field `ready_js`; `BrowserError` has the variants `Missing`, `Failed`,
  `Timeout` and `TabGone`.
- `bind(keys)` binds, after `warm` and before any of them navigates, each key's tab that no call has run in this
  window yet, each within 2 s. agent-browser 0.43.0 holds a session's first call while another tab's page is still
  loading (measured: 4 s headless, 10 s and more in the window), so a hanging page would cost tabs bound after it
  their deadline. It holds the window's lock throughout, so a second caller waits and then finds the keys run; a tab
  that doesn't bind is left to its first call, and the next `bind` tries it again unless another call ran it in
  between. A fetch's or `rows`' tab binds on its own first call and can still
  wait behind a hanging page.
- `window::{Window, tie_to_process}`. `Window::new` takes the `Profiles` (or the error that made them). `tie_to_process`
  does nothing off Windows.
- `profile::Profiles`: `new`, `rest`, `resting`, `consent_seen` and `set_consent_seen`. With the feature `test-support`,
  also `with_chrome`, which gives a test a browser instead of the lookup through `WEB_MCP_CHROME`, HOME and PATH.
- With the feature `test-support`, `browser::real_agent_browser`: the agent-browser a test runs (`WEB_MCP_AGENT_BROWSER`,
  else the installer's copy in `<CLAUDE_CONFIG_DIR or ~/.claude>/bin`, else it panics).

## What a consumer must do

- Install a rustls crypto provider before `Profiles::new`. The crate depends on reqwest with `rustls-no-provider` and
  picks none. web-mcp's `main.rs` installs ring first.
- `rest` and `resting` take a plain name and join it under the search folder; `consent_seen` and `set_consent_seen` join
  it under the held profile slot (the search folder until one is held). Pass one path segment: nothing checks it.
- Session names that start with `search-`, `web-mcp-search-` or `web-mcp-fetch-`, and the name `window`, are reserved:
  `check_session` rejects them, and a key with the fetch prefix is named differently from a user's.
- A crate that runs `Profiles::with_chrome` or `real_agent_browser` in its own tests enables `test-support`.

## Tests

The `Browser` and `Window` tests run the real agent-browser (`real_agent_browser`) and Chrome for Testing (or
`WEB_MCP_CHROME`) against pages a local listener serves; no fake agent-browser is left. `Real` in `browser.rs` gives
each one a fresh search folder and holds one lock, so one window runs at a time: every `Browser` in a test process
shares the owner's name, which carries the pid. Dropping it closes every session and the window, then removes the
folder. On Windows that folder is also the process's `XDG_RUNTIME_DIR` while the test runs, so agent-browser's session
files go with it, and the test process is tied to its children (`tie_to_process`), so a daemon a failed test never
closed dies with it. Off Windows the variable is left alone, as in web-mcp's harness. A Chrome that went away is ended
through its debug port (`Browser.close`). A refused tab raise has no real trigger (Chrome activates every tab it
lists) and has no test. The Nix package check skips these tests (`checkFlags` in `flake.nix`); crates.yml's rust job
runs them.

## Names that stay web-mcp's

The crate reads `WEB_MCP_CHROME` and names `WEB_MCP_SEARCH_DIR` in its errors; web-mcp's config reads that variable and
passes the path to `Profiles::new`. The crate sends the `web-mcp/` user agent. All three are unchanged. The other
`WEB_MCP_*` knobs are in `docs/components/web-mcp.md`.
