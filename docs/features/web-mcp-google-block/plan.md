# web-mcp Google block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web-mcp's browser stops announcing automation and drops its UA override, and an engine's follow-up searches
are typed into the result page already open in its tab.

**Architecture:** The window's owner config (`profile.rs`) gains `--disable-blink-features=AutomationControlled` and
loses `userAgent`. `search.rs` remembers per engine its last query that parsed as results (held in the engine's
turn). When the next search may type, it runs one `--bail` typing batch in the engine's tab (read
`performance.timeOrigin`, `click` the box, `Control+a`, a `press` per letter, digit or space, inserted text for the
rest, `Enter`), then a render that waits for `ready_js` and a new document, and keeps the page only when its `q` is
the query (a block is a block either way); otherwise it loads the result URL as today. `browser.rs` gains a `render`
that can read the tab as it is and a one-shot batch.

**Tech Stack:** Rust (tokio, serde_json, url, dom_query), agent-browser 0.41.1 driven as a child process, the fake
agent-browser in `tests/bin/fake_agent_browser.rs`. Stack skill: rust-skills `rust-best-practices`.

**Spec:** [spec.md](spec.md); measurements in [findings.md](findings.md) (spike 1, and spike 2 for typing).

## Global Constraints

- Browser launch switches and the UA: resolved in `profile.rs` (`owner_config`); never seen by `browser.rs`,
  `search.rs`, the engines or the tools.
- Typed or loaded (does this tab already hold the engine's result page): resolved in `search.rs` (`run_engine`) from
  the engine's last query in this process; the engine modules only supply their search box selector; `browser.rs`
  runs whatever batch it is given and never sees the choice.
- The owner's launch `args` carry `--disable-blink-features=AutomationControlled`; the owner config has no
  `userAgent`.
- Still forbidden (ADR 0009): making the browser report values other than its own (a faked UA, overridden
  `navigator` properties, hiding CDP).
- Typing uses agent-browser 0.41.1's own commands only: `eval`, `click <sel>`, `press <key>`,
  `keyboard inserttext <text>`, in `batch --json --bail`.
- No new dependencies.
- In `crates/web-mcp`: `cargo build --bins` before the unit tests; `cargo test` and
  `cargo clippy --all-targets -- -D warnings` pass at the end of every task. Code under `#[cfg(windows)]` is not
  compiled on Linux: grep it for every name a task removes or renames.
- A commit message is one sentence with no co-author lines; stage with `git add -u` plus new paths by name.

## Before you write

Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config,
exports. Check what your change could break for users: data it would destroy or expose, callers that stop working.
That is scope. Extra features are not.

## Review Focus

1. **Enter that doesn't navigate** (swallowed, or an engine that updates in place): the old page must never come back
   as this query's results, and the capped typed read leaves time to load the URL (Task 3 test
   `no_navigation_falls_back_to_the_url`, whose fake runs the wait out).
2. **A missing box**: nothing after the failed `click` may run, so no stray keys reach the page (Task 3 test
   `missing_box_falls_back_to_the_url` asserts the batch stopped at the click).
3. **The same query twice, a `since` search, a query with control characters or doubled spaces**: each loads the URL
   (Task 3 tests `same_query_loads_the_url`, `since_search_loads_the_url`, `odd_query_loads_the_url`).
4. **A tab gone or a new Chrome between searches** while an engine remembers its query: the typing batch fails once
   without rebinding, and the search answers through the URL without a rest (Task 3 tests
   `gone_tab_falls_back_to_the_url`, `typing_survives_a_chrome_restart`).
5. **A consent page from the last search** is never typed into (Task 3 test `consent_page_is_not_typed_into`; the
   existing `consent_clears_by_the_next_search` keeps passing).

---

### Task 1: The window stops announcing automation

**Files:**

- Modify: `crates/web-mcp/src/profile.rs` (module doc line 1; `FALLBACK_MAJOR` 34-36; `Ready` 96-105;
  `owner_config` 201-217; `ready_with` 268-287; `pick` 398-436; `newest_cft` 438-458; `version` 463-488; `major`
  490-499, keeping `four_part` 501-505; `user_agent` 507-518; tests `owner_config_is_exact`,
  `version_majors_are_read`, the UA test near 879, the `Ready` literal near 673,
  `browser_order_is_env_then_newest_cft_then_helium_then_chromium` 903-966, and the `#[cfg(windows)]`
  `windows_never_runs_a_browser_for_its_version` 969-1004)
- Create: `docs/adr/0009-no-automation-flag.md`
- Modify: `docs/adr/0004-browser-search.md` (the "No stealth" bullet), `AGENTS.md` (line 97)
- Commit with it: `GLOSSARY.md` (already edited in the working tree: Automation flag, Typed search)

**Interfaces:**

- Produces: `Ready { chrome: PathBuf, extension: PathBuf }` (no `ua`); `pick(...) -> Result<PathBuf, String>`;
  `version` becomes `starts(bin: &Path) -> bool` (cached as today).

- [ ] **Step 1: Change `owner_config_is_exact` to the new config**

```rust
serde_json::json!({
    "profile": s(&slot.join("profile")),
    "extensions": [s(&r.extension)],
    "executablePath": s(&r.chrome),
    "headed": true,
    "args": "--lang=en-US\n--disable-background-timer-throttling\n--disable-renderer-backgrounding\n--disable-blink-features=AutomationControlled",
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `cargo build --bins && cargo test owner_config_is_exact`
Expected: FAIL, the config still has `userAgent` and lacks the switch.

- [ ] **Step 3: Implement**

In `owner_config`, drop `userAgent` and append the switch to `args` (newline-separated, as the comment there says).
Remove what only served the UA: `Ready.ua`, `user_agent()`, `FALLBACK_MAJOR`, `major()`, the `major_of` closure,
the `u32` in `pick`'s result, and their tests. `version` becomes `starts`, a bool (on Linux it is the "does Chrome
for Testing start" check; never run on Windows). `newest_cft` keeps choosing the newest by number through
`four_part`. In `browser_order_…` and the Windows test, replace the `r.ua` asserts with `r.chrome` ones; the Windows
test keeps its "never runs a browser" assert. Update the module doc's "user agent" wording.

- [ ] **Step 4: Run the crate's tests and clippy, and grep the Windows code**

Run: `cargo build --bins && cargo test && cargo clippy --all-targets -- -D warnings && grep -n 'ua\b\|FALLBACK_MAJOR\|major(\|version(\|VERSIONS' src/profile.rs`
Expected: PASS, no warnings; the grep finds no `ua`, `FALLBACK_MAJOR` or `major(` left, and every `version(`/`VERSIONS`
left (the `#[cfg(windows)]` test included) uses the renamed `starts` and its cache.

- [ ] **Step 5: Write ADR 0009 and point ADR 0004 and AGENTS.md at it**

`docs/adr/0009-no-automation-flag.md`, titled "web-mcp's browser doesn't announce automation", in the house ADR
shape (context paragraph, Considered options, Consequences). It records: agent-browser's
`--remote-debugging-port=0` sets `navigator.webdriver`; the spikes measured it as the signal Google acts on
(findings.md); normal settings now include `--disable-blink-features=AutomationControlled` and no UA override at
all; still forbidden is anything that makes the browser report values other than its own (a faked UA, overridden
`navigator` properties, hiding CDP); considered and rejected: CDP `Emulation.setAutomationOverride` per tab, a fixed
debugging port (measured: agent-browser never connects); the risk that Google's terms forbid "bypassing our systems
or protective measures". In ADR 0004's "No stealth" bullet add, as 0004 already does for 0007: "(ADR 0009 narrows
this: turning the automation flag off and setting no user agent are normal settings.)" In AGENTS.md line 97, after
the browser order: "The window launches with `--disable-blink-features=AutomationControlled` and no user agent
override (ADR 0009)."

- [ ] **Step 6: Commit**

```bash
git add -u && git add docs/adr/0009-no-automation-flag.md
git commit -m "Launch web-mcp's window without the automation flag or a user agent override."
```

### Task 2: The browser can read a tab as it is

**Files:**

- Modify: `crates/web-mcp/src/browser.rs` (`render` 551-610, `rendered_html` 630-635, `attached` 340-373 only if
  the one-shot path shares it, the render tests 848-1000, new tests)
- Modify: `crates/web-mcp/src/search.rs:157-161` (the call only)
- Modify: `crates/web-mcp/tests/bin/fake_agent_browser.rs` (module doc, `batch`)

**Interfaces:**

- Produces:
  - `Browser::render(&self, url: Option<&Url>, key: &str, search: Option<SearchRun<'_>>, deadline: Duration) -> Result<(String, Url), BrowserError>`:
    with `Some(url)` the batch starts with `open`, as today; with `None` it reads the tab as it is (the `wait`, if
    any, then `get html body`, `get url`). The wait stays the one command that may fail.

- [ ] **Step 1: Teach the fake to keep each tab's page and to bail**

In the fake's `batch`: a batch with `open` stores its URL in `<state>/<session>.url`; a batch without `open` uses the
stored URL for its page (`engine_page`), `get url` and the host lookups; `tab new` removes the stored URL. With
`<session>.gone`, a batch's first command answers `tab_gone` (today only an `open` does; every batch starts with one
today, so nothing else changes). Say all of this in the module doc.

- [ ] **Step 2: Write the failing tests**

- `render_search_without_open_reads_the_tab`: after a `render(Some(url), "search-bing", Some(run), 5 s)`,
  `render(None, "search-bing", Some(run), 5 s)` sends exactly
  `[["wait","--fn",READY_JS,"--timeout","3000"],["get","html","body"],["get","url"]]`, returns the same page and
  `landed == url`, and logs no `close`.
- The existing render tests pass `Some(&url)`; their expected batches stay as they are.

- [ ] **Step 3: Run them and see them fail**

Run: `cargo build --bins && cargo test render_`
Expected: FAIL to compile, `render` still takes a `&Url`.

- [ ] **Step 4: Implement**

`rendered_html` and `run_engine` pass `Some(&url)`. The close-on-failure rule of `render` is unchanged.

- [ ] **Step 5: Run the tests and clippy**

Run: `cargo build --bins && cargo test && cargo clippy --all-targets -- -D warnings`
Expected: PASS; `tests/search.rs`, `tests/browser.rs` and `tests/papers.rs` unchanged and green.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "Let the browser read a tab as it is."
```

### Task 3: Follow-up searches are typed

**Files:**

- Modify: `crates/web-mcp/src/browser.rs` (new `batch_once` beside `batch` at 505, `attached` 340-373 only if
  `batch_once` shares it, a new test)
- Modify: `crates/web-mcp/src/engines/mod.rs` (`impl Engine`, its tests)
- Modify: `crates/web-mcp/src/search.rs` (`run_engine` 118-190, new private fns and unit tests)
- Modify: `crates/web-mcp/src/profile.rs` (`turns` 117 and 142, `turn` 230-235)
- Modify: `crates/web-mcp/tests/bin/fake_agent_browser.rs` (module doc, `batch`)
- Modify: `crates/web-mcp/tests/search.rs` (`engine_tab_stays_between_searches`, new tests)
- Modify: `plugins/shared/web-mcp/README.md` (lines 40-44)

**Interfaces:**

- Consumes: `Browser::render(None, …)` (Task 2).
- Produces:
  - `Browser::batch_once(&self, key: &str, commands: &[Vec<String>], until: std::time::Instant) -> Result<Vec<Value>, BrowserError>`:
    one `batch --json --bail` in `key`'s tab of the window as last seen, never a `tab new` or an owner renewal;
    `Err(Timeout)` once `until` passes (`tokio::time::timeout_at(until.into(), …)`; the dropped call kills the CLI);
    `Err` on any failed command. Each answer is the entry's `result`, as `batch` gives it.
  - `Engine::search_box(self) -> Option<&'static str>`: Google `textarea[name=q]`, Bing `#sb_form_q`, DuckDuckGo
    `#search_form_input`, Brave `#searchbox`, Scholar `#gs_hdr_tsi`, Semantic Scholar `None`.
  - `Profiles::turn(&self, e: Engine, until: Instant) -> Option<tokio::sync::MutexGuard<'_, Option<String>>>`: the
    guard holds the engine's last query that parsed as results, in this process.
  - In `search.rs`, private: `fn types(e: Engine, prev: Option<&str>, query: &str, since: Option<Since>) -> bool`;
    `fn typing(sel: &str, query: &str) -> Vec<Vec<String>>`; `fn typed_ready(ready_js: &str, origin: f64) -> String`.

- [ ] **Step 1: Teach the fake to type**

A typing batch is a batch without `open` that holds a `click`; it reads no page (no `engine_page`, so no delay or
marker is spent). With `--bail` among the args, a batch's entries stop after the first failed one. `eval` answers
`{"result": 1}` (as agent-browser: the number at `result.result`). A typing batch collects the text of its
`press <one char>` (`Space` is a space) and `keyboard inserttext <t>` commands in order and writes it to
`<state>/<session>.typed`; at `press Enter` it sets the stored URL's `q` to that text, other parameters kept, unless
`$FAKE_AB_PAGES/<engine>.nonav` exists, in which case the next read batch's `wait` runs out its `--timeout` and
fails. A `click` fails when `<engine>.nobox` exists or the session has no stored URL. The engine comes from the
stored URL's host (the `engine_page` table). Say so in the module doc. In `tests/search.rs`, `batches()` matches
calls whose command starts with `batch --json`, so `--bail` batches count.

- [ ] **Step 2: Write the failing unit tests**

In `engines/mod.rs`:

```rust
#[test]
fn search_boxes_match_one_element_in_the_fixtures() {
    for (e, file) in [(Engine::Bing, "bing.html"), (Engine::DuckDuckGo, "duckduckgo.html"),
                      (Engine::Brave, "brave.html"), (Engine::Scholar, "scholar.html")] {
        let doc = dom_query::Document::from(fixture(file).as_str());
        assert_eq!(doc.select(e.search_box().unwrap()).length(), 1, "{file}");
    }
    assert_eq!(Engine::SemanticScholar.search_box(), None);
}
```

(`mod.rs`'s tests have no `fixture`: add one like `google.rs:94`'s.)

In `search.rs`:

```rust
#[test]
fn types_only_a_new_plain_query_without_since() {
    assert!(types(Engine::Google, Some("old"), "new query", None));
    assert!(!types(Engine::Google, None, "new", None));
    assert!(!types(Engine::Google, Some("new"), "new", None));
    assert!(!types(Engine::Google, Some("old"), "new", Some(Since::Week)));
    assert!(!types(Engine::SemanticScholar, Some("old"), "new", None));
    for odd in ["a\nb", "a\tb", " a", "a ", "a  b"] {
        assert!(!types(Engine::Bing, Some("old"), odd, None), "{odd:?}");
    }
}

#[test]
fn typing_presses_letters_digits_and_spaces_and_inserts_the_rest() {
    let v = |c: &[&str]| c.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
    assert_eq!(typing("#b", "Ab 1+ü-x"), vec![
        v(&["eval", "performance.timeOrigin"]), v(&["click", "#b"]), v(&["press", "Control+a"]),
        v(&["press", "A"]), v(&["press", "b"]), v(&["press", "Space"]), v(&["press", "1"]),
        v(&["keyboard", "inserttext", "+ü-"]), v(&["press", "x"]), v(&["press", "Enter"]),
    ]);
}

#[test]
fn typed_ready_needs_a_new_document() {
    assert_eq!(typed_ready("!!(x);\n", 1234.5), "(!!(x)) && performance.timeOrigin !== 1234.5");
}
```

In `browser.rs`: `batch_once_bails_and_never_rebinds`: with `<session>.gone` written for `search-bing`,
`batch_once` returns `Err(TabGone)`, its call carries `batch --json --bail`, and neither log gains a `tab new` or an
owner `get cdp-url` (compare each log's count before and after: owner calls go to `profiles/1/calls.jsonl`).

- [ ] **Step 3: Write the failing integration tests** (in `tests/search.rs`)

- `engine_tab_stays_between_searches` (changed): "zebra", then "zebra stripes". Each engine's session runs 3
  batches (open; typing with `--bail`; read), no `tab new`/`tab close`/`close`; the second search's typing batches
  hold `["press","Space"]` and no `open`.
- `same_query_loads_the_url`: "zebra" twice; no batch holds `click`, every engine `open`s twice.
- `since_search_loads_the_url`: "zebra", then "zebra stripes" with `since: week` (Google's second batch `open`s
  `tbs=qdr:w`), then "zebra mane" without `since` (an `open` again: a filtered search leaves nothing to type on).
- `odd_query_loads_the_url`: "zebra", then "zebra stripes" (two spaces): no `click`.
- `missing_box_falls_back_to_the_url`: mark `bing.nobox`; second search lists bing among its sources; Bing's typing
  batch carried `--bail` and no `<session>.typed` was written, then Bing's session `open`ed; `!any_rest(&mcp)`.
- `no_navigation_falls_back_to_the_url`: mark `bing.nonav`; second search: Bing's `<session>.typed` holds the query,
  Bing's read batch's `wait --timeout` is at most 6000 (read margin + 4 s), then Bing's session `open`ed; bing is in
  the sources; no rest.
- `typed_block_rests_without_a_second_load`: after the first search mark `google.blocked` (its page parses as a
  block whatever its `q`); the second search skips google as blocked, Google's session ran no `open` after the
  typing batch, and Google rests.
- `gone_tab_falls_back_to_the_url`: after the first search write `<bing session>.gone`; second search still lists
  bing, with exactly one `tab new` (from the fallback's render, not the typing batch), and no rest.
- `typing_survives_a_chrome_restart`: like `dead_chrome_is_replaced`, but the second query differs: every engine
  answers from generation 2 and nothing rests.
- `consent_page_is_not_typed_into`: mark `google.consent-once`; the second search's Google batch `open`s (no
  `click`).

- [ ] **Step 4: Run them and see them fail**

Run: `cargo build --bins && cargo test -- types_ typing_ typed_ready search_boxes batch_once && cargo test --test search`
Expected: the new tests FAIL; the others pass.

- [ ] **Step 5: Implement**

`turns` holds `tokio::sync::Mutex<Option<String>>`; `turn` returns that guard. In `run_engine`, with the guard as
`last`, start with `let prev = last.take();`. When `types(e, prev.as_deref(), query, since)`:
`batch_once(session, &typing(sel, query), deadline - READ_MARGIN)`; on `Ok`, the origin is `v[0]["result"].as_f64()`
(`None` counts as a failed typing batch), and the read is
`render(None, session, Some(SearchRun { ready_js: &typed_ready(e.ready_js(), origin) }), left.min(READ_MARGIN + Duration::from_secs(4)))`
with `left` recomputed after the typing batch and the existing `READ_MARGIN` check. Parse the typed page first: a
`Blocked` page is handled as today (rest, archive, no fallback); `Results` or `Unrecognised` count only when the
landed URL's `q` equals `query`. On a failed typing batch, a typed page with another `q`, or a typed render error:
render `Some(&url)` as today if time is left, else "timed out"; none of these rests the engine. Set
`*last = Some(query)` only when the page parsed as `Results` and `since` is `None`. `types`: `prev` is `Some` and
differs from `query`, `since` is `None`, `e.search_box()` is `Some`, and `query` has no control characters and equals
itself with whitespace trimmed and runs of spaces collapsed. `typing`: `eval performance.timeOrigin`, `click`,
`press Control+a`, then per char: ASCII letter or digit → `press <c>`, space → `press Space`, any run of other
characters → one `keyboard inserttext <run>`, then `press Enter`. `typed_ready`: `ready_js` trimmed of whitespace
and its trailing `;`, in parentheses, `&& performance.timeOrigin !== <origin>`.

- [ ] **Step 6: Run the tests and clippy**

Run: `cargo build --bins && cargo test && cargo clippy --all-targets -- -D warnings`
Expected: PASS, the papers tests included.

- [ ] **Step 7: README**

In `plugins/shared/web-mcp/README.md` after "one tab per engine, kept" (line 41): an engine's next search types its
query into the result page already open in that tab (Google, Bing, DuckDuckGo, Brave, Scholar); a tab's first
search, any `since`, a repeated query or a failed typing loads the result URL. Run `npm run build:harnesses` and
`npm run check:harnesses` at the root (the repository rule; expected: clean).

- [ ] **Step 8: Commit**

```bash
git add -u
git commit -m "Type an engine's follow-up searches into the result page already open in its tab."
```

### Task 4: Google result fixtures and the live check (coordinating session)

This task needs the live browser and Google; the coordinating session runs it, not a subagent.

**Files:**

- Create: `crates/web-mcp/tests/fixtures/engines/google.html`, `crates/web-mcp/tests/fixtures/engines/google-none.html`
- Modify: `crates/web-mcp/src/engines/google.rs` (the two `#[ignore]`s, module doc lines 1-3, and its row or
  no-results selectors only if the captured pages show they're wrong)
- Modify: `crates/web-mcp/src/engines/mod.rs` (Google joins `search_boxes_match_one_element_in_the_fixtures`)
- Modify: `AGENTS.md` (line 97: "Google's and Semantic Scholar's aren't captured yet")
- Modify: `docs/features/web-mcp-google-block/findings.md` (a "Build check" section)

- [ ] **Step 1: Build the branch and drive it**

`cargo build --release --bin web-mcp`; with a fresh `WEB_MCP_SEARCH_DIR` in the scratchpad and agent-browser 0.41.1,
drive its `browser` tool: `navigator.webdriver` is `false` in an attached tab, `httpbin.org/headers` shows Helium's
own UA with `Sec-CH-UA`, sannysoft shows no failures.

- [ ] **Step 2: Two `search` calls in one server**

`search {query: "rust async runtime comparison"}`, then `search {query: "Tokio 1.x vs smol"}` (the four web
engines; capitals, a digit and inserted text).
Expected: both answer with all four engines, the second through typing batches (the agent-browser calls show
`--bail` and `press`), no `/sorry`.

- [ ] **Step 3: Capture the fixtures**

`google.html` is `get html body` of the `search-google` tab Step 2 leaves open, read by hand (the `browser` tool
reserves `search-` names): `agent-browser --session web-mcp-<pid>-g1-search-google --json --cdp <cdp url> --pin-tab
--config <search dir>/attach.json get html body`, with the cdp url from the owner's `get cdp-url`.
`google-none.html` is one nonsense query in a `browser` tab. Scrub both as web-mcp-search/findings.md "Fixtures" describes (client IP to `0.0.0.0`, tokens).

- [ ] **Step 4: Un-ignore and run**

Remove the two `#[ignore]`s, update the module doc, add `(Engine::Google, "google.html")` to the selector test, run
`cargo test -- google_ search_boxes` (expected: PASS; if the parser misses rows, fix only its selectors). Update AGENTS.md's
capture sentence and write the build check into findings.md.

- [ ] **Step 5: Run everything and commit**

Run: `cargo build --bins && cargo test && cargo clippy --all-targets -- -D warnings` in `crates/web-mcp`, then
`npm test` at the root. Expected: PASS.

```bash
git add -u && git add crates/web-mcp/tests/fixtures/engines/google.html crates/web-mcp/tests/fixtures/engines/google-none.html
git commit -m "Capture Google result pages as fixtures and check the fix against the live browser."
```
