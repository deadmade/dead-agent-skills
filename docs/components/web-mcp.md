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

agent-browser's `--allowed-domains` rejects `--cdp` (its `--help`, 0.43.0), and every web-mcp tab attaches through
`--cdp`, so a domain or address limit on `browser` has to be written in web-mcp, not passed as that flag.

## The reply guard

Every reply that carries page text goes through `guard::reply` (`src/guard.rs`; the decision is
`docs/adr/0017-web-mcp-guards-replies-keeps-capabilities.md`). A reply is the Source line, then the body between
`<<untrusted-{nonce}>>` and `<</untrusted-{nonce}>>` (16 random hex digits, new for each reply), then web-mcp's own
notes after the closer: truncation, failed sources, "Not fetched", "No results from …", the fetch retry's note. The
Source line, body and notes all lose invisible characters (`guard::strip`): Unicode Tags, bidi controls, zero-width
spaces, soft hyphens, invisible operators, deprecated format controls (U+206A–206F), interlinear annotations, the
combining grapheme joiner, Hangul fillers and variation selectors 17–256. The joiners U+200C and U+200D and variation
selectors 1–16 stay, because emoji need them.

The body is then matched against three tables of our own, run through `llm-guard`'s `BanSubstrings`: `injection`
(multi-word phrases such as "ignore all previous instructions"), `template` (chat-template sentinels such as
`<|im_start|>` and `[INST]`) and `marker` (a page's own `<<untrusted-`, `<</untrusted-` or `[removed by web-mcp:`).
Each hit becomes `[removed by web-mcp: <table>]`, and the Source line counts them (`, 3 spans removed`). Matching is
exact up to ASCII case, so a phrase with doubled spaces, a line break or a non-ASCII look-alike inside passes: it is a
best-effort tripwire, not a filter. llm-guard's own scanners are off; ADR 0017 says why. `.web/` keeps the original
text.

`Scan::Keep` (lookup records, `browser eval` output and browser errors) removes only the `marker` table: a lookup
record is quoted as its source sent it, and an eval's script is the agent's own with no archive to recover a removal
from. Other error texts get `guard::strip` only, without markers.

`fetch`'s reply text is capped at 50,000 (`FETCH_CAP`, also its `maxResultSizeChars`), counted in UTF-16 units, as the
client most likely counts. The page is cut at a paragraph break, the truncation note goes after the closer, and a reply
still over the cap (placeholders longer than what they replace, astral characters) is cut again: first in proportion,
then by the excess, and after that the page is left out and only the notes remain. The Source line shortens a URL over
300 characters. `lookup wayback` with `at` uses the same rendering at 30,000.

headroom-trim (`plugins/opt-in/headroom-trim/`) rewrites tool results before Claude reads them and may move or drop
the markers; that was not measured.

## fetch

The plain request sends `Accept-Language: en-US,en;q=0.9`, matching the browser's `--lang=en-US`. A 429 or 503 is
retried once after its `Retry-After` (at most 10 s). A public site's 403 or 503 that remains, when its Content-Type is
HTML, is then loaded once in the browser, for the `fetch` tool only (not `search`'s page fetches): after the host's
request slot and within what is left of the fetch's 30 s. A JSON, PDF or other non-HTML refusal keeps its error without
a browser load. The reply names the URL the browser landed on, says it is the browser's rendering, and carries no images.
A private or loopback host's status is its real answer and is not retried. A failed or near-empty rendering keeps the
status with the browser's reason. The same batch that reads the rendering reads the browser's own navigation status
(`performance.getEntriesByType('navigation')[0]?.responseStatus`, `STATUS_JS` in browser-core; agent-browser 0.43.0
answered 403 for a 403 page, 200 for a 200 and a `data:` page): 400 or more keeps the error, naming both statuses,
because the browser was refused too and the rendering is the refusal page. A status the browser can't tell (0,
`undefined`, a failed read) counts as passed. The rendering is archived but not cached, so the next fetch asks the site
again.

Server-controlled text stays out of errors and notes outside the markers: an unsupported content type keeps only its
token characters (`[a-z0-9!#$&^_.+/-]`, at most 100), a refused redirect to another scheme names only the scheme, a
private-network refusal (`FetchError::Blocked`, and a browser landing on a private address) names only the host, and
`lookup certs` and `wayback` report a reply of the wrong JSON shape by line and column, not serde's message, which
quotes the reply's strings.

## Engine ready checks

An engine's `READY` expression must not end in `;`: agent-browser 0.43.0 never finishes a `wait --fn` whose
expression does (measured: `!!(true)` returned in 256 ms, `!!(true);` ran out its timeout), so every result-URL load
waited its whole budget until this was fixed. `every_engine_waits_on_an_expression` in `engines/mod.rs` pins it.

Every `READY` starts with `document.readyState !== 'loading' &&`, so a streamed result page is read after it has
finished parsing, not at its first results (`every_engine_waits_for_the_page_to_finish_parsing`). A challenge that
clears itself is left out of `READY`, so the wait sits it out within its budget: Semantic Scholar's
`#challenge-container` and Bing's Turnstile frame (`iframe[src*="challenges.cloudflare.com"]`). Both stay in their
engine's block detection, so a page that still shows them when the wait ends is read as a CAPTCHA; only a page that
won't clear on its own (a CAPTCHA form, a `/sorry` or `/challenge` path) ends the wait early.

## The block log

Each engine run of a `search` (papers' Scholar and Semantic Scholar included), except a cancelled one, appends one
JSON line to `blocks.jsonl` in the search folder: `at`, `engine`, `outcome`, `ms` (from the won turn until the outcome
is known, archiving a block page included; 0 without a turn) and `typed` (whether a typed follow-up was tried). Every
web-mcp process on the machine appends to the same file, each line with one append-mode write; a failed write is
ignored. Nothing rotates or caps it (about 110 bytes a line). A search whose browser window can't start logs no line:
the engines never run.

| outcome        | meaning                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| `ok`           | results                                                                                 |
| `empty`        | a results page with none                                                                |
| `captcha`      | a CAPTCHA page; the engine rests 30 minutes                                             |
| `consent`      | a first consent page, skipped while the cookie extension clears it; no rest             |
| `blocked`      | a consent page met again; the engine rests                                              |
| `busy`         | no turn on the engine's tab within a minute                                             |
| `timeout`      | the deadline ran out, or a Google link walk was cut by a failed request or the deadline |
| `resting`      | the engine rests from an earlier block                                                  |
| `unrecognised` | a page the parser knows as neither results nor a block                                  |
| `unresolved`   | Google answered its result links but none resolved (its usual soft block)               |
| `error`        | the browser's error, an unusable profile folder, or Google's page on a private address  |

## Typing

The `browser` tool's `type` sends `type <ref> --delay N -- <text>`: N is drawn from 30–60 ms per character
(`pace.rs`) and lowered so the whole text takes at most 5 s (`5000 / chars`). agent-browser's `type --delay` inserts
one character every N ms as input events, without keydown or keyup (measured), so `type` inserts text rather than
pressing keys; agent-browser 0.43.0 is the minimum for `--delay` and `--`. The `--` keeps text that starts with `-` from being read
as a flag. Empty text is rejected.

Search typing is unchanged: one `press` per key, as fast as agent-browser sends them. Pacing it was measured and
deferred: `type --delay` sends no key events in a hidden tab, DuckDuckGo's first `--clear` after a load doesn't clear
there, and at a human pace only about 16 characters fit in the 8 s an engine has before its read margin
(`ENGINE_DEADLINE` less `READ_MARGIN`), with a fallback load kept in reserve. `blocks.jsonl` is meant to show whether it
is needed.

## Bot-check run

`cargo run -p web-mcp --example botcheck` opens four public bot-check pages (sannysoft, browserscan,
deviceandbrowserinfo, CreepJS) in web-mcp's real window, one session each, and saves each page's text and a screenshot
under `<search dir>/botcheck/<timestamp>/`, printing the checks each page flags. It reads `WEB_MCP_SEARCH_DIR`,
`WEB_MCP_CHROME` and `WEB_MCP_AGENT_BROWSER` (each optional, with the server's defaults). It is run by hand only, not in
`npm test` or CI.

## Contributor rules

Contributor rules: no fake agent-browser is left. A test that opens a browser runs the real one (`Mcp::start_real`
below, or `real_agent_browser()` in an inline test); `Mcp::start` and the inline `test_ctx` give web-mcp an
agent-browser path that doesn't exist, for tests that never reach a browser. Test-only hooks:
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
kills web-mcp and every process whose command line holds its temp folder, and removes that folder. It finds them
from `/proc`, or on Windows through the kernel (Toolhelp and each process's command line), never WMI, `tasklist` or
`taskkill`, which a hung WMI holds up for minutes. agent-browser 0.43.0 keeps its session files in
`$XDG_RUNTIME_DIR/agent-browser`, else `~/.agent-browser`, and leaves a session's `.target` behind even after a clean
`close`. On Windows the harness sets `XDG_RUNTIME_DIR` to that folder, so the files (`<session>.pid`, `.port`,
`.target`, …) go with it instead of piling up in `~/.agent-browser`. On Linux it leaves the variable alone (Chrome finds
its Wayland socket under it, and a `.sock` path under the temp folder can outgrow the socket path limit), so the files
(`.sock` there instead of `.port`) stay in `/run/user/<uid>/agent-browser`, a tmpfs cleared at logout. The parsers still
see the loopback host, so a host check (Google's consent host) isn't covered. These tests are skipped in the Nix
package checks (`checkFlags` in `flake.nix`) and run in crates.yml's rust job, which downloads the pinned agent-browser
and caches Chrome for Testing; `scripts/test.mjs` reports web-mcp, browser-core and http-runner as NOT RUN when it
finds no agent-browser.

Env knobs: `WEB_MCP_CHROME` picks the browser binary; `WEB_MCP_SEARCH_DIR` picks where profile slots live (no temp
fallback).

`fetch` runs with `allow_private: true` (`tools.rs`, for the user's own localhost sites), so a conductor that follows
links from untrusted pages, as /evaluate does, has only a text rule on the URL: a hostname resolving to a private
address gets through, though a public URL's redirect onto one is refused.
