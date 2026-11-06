---
flow: fix
phase: done
now: Done: PR handed over for worktree-web-mcp-google-results-and-clicks.
---

# web-mcp Google results and page input: flow

## Request

Could we fix the Google is skipped with "unrecognised page". It now relialbe opens but it seems we are having a hard time of reading it. Also it seams that navigatin a page is quite hard or complely broken use ultracode

## Artifacts

- Prior art: [web-mcp-google-block findings](../web-mcp-google-block/findings.md) (the `/goto?url=CAES…` rows, "Build check"), [web-mcp-one-window findings](../web-mcp-one-window/findings.md).
- This session's smoke test of web-mcp (2026-11-06): `fetch`, `lookup` dns, `search`, `browser` open, snapshot, eval, screenshot, console, network, fill, type and scroll worked; `browser` `click` on a button and `press Enter` reached the page with no events; Google was skipped as "unrecognised page".

## Gates

- Gate 1, cause approved: 2026-11-06
- Gate 2, review report: 2026-11-06 (picks: all 14, by the user's "All 14")
- Gate 3, decide (decisions a to p, Skipped rows, run verdict, commits): 2026-11-06 for the decisions and Skipped rows (all confirmed, all accepted, both Parking-lot lines a follow-up); the run verdict and the commits are asked next.

## Skipped

- Phase 5 (Prove), skipped at your word ("we dont need phase 5!", 2026-11-06). No independent agent reran the tests before and after each fix. What stands in its place: my own failing-test-first runs in Phase 4, the live before/after replays (Findings §2 and §3), and a final full suite, clippy and fmt run by me, the author, which is not an independent check.
- Decide, 2026-11-06: the user accepted every Skipped row ("Accept all"): the risk lens (no migration, public interface or wire format in the diff); the built-in `code-review` for the correctness lens (uncommitted tree: the neutral brief ran); pstack `interrogate` (not run; decision p, confirmed); `npm test` and `npm run typecheck` (no `node_modules`; no JS or TS changed; the unrelated red `flow-cockpit-core` test named in the audit file); not run live: a real Google `429` or `/sorry`, a live Chrome for the `front` gap (Finding 10), Windows.
- Decision o, confirmed 2026-11-06: the one new `shortcut:` line, on `Browser::raise` (`browser.rs`): it leans on agent-browser 0.41.1's `tab list` marking a session's own tab `active` and on Chrome's `/json/activate/<targetId>`; retest input in a hidden tab whenever the agent-browser pin moves.
- `pstack-picks:how` and `blast-radius` were not run as skills: two read-only Explore agents mapped the code instead (the flow's fallback); their claims were spot-checked against the source (below).

## Grounding

Where this lands: `tools/web-mcp/` (Rust, one binary crate; unit tests are in `--bin web-mcp`, not a lib). Verified by reading unless marked.

- **Search path.** `tools.rs:329` `search` → `search::web` (`search.rs:364`) → `run_engine` per engine (`search.rs:134`) → `Engine::parse` (`engines/mod.rs:153`) → `google::parse` (`engines/google.rs:53`) → `fuse` (RRF, `fuse.rs:48`) → BM25. `run_engine` decides each engine's outcome at `search.rs:193-216`; `Parsed::Unrecognised` becomes `Err("unrecognised page")` at `:215`. `run_engine` is also called from `papers.rs:652`.
- **Types.** `Found {url, title, snippet}` (`engines/mod.rs:53-57`), `Parsed` (`:67-73`), built by `row()` (`:177-184`). Google's parser drops every row whose host is the page's own (`google.rs:67`), and `/goto?url=…` has no `/url?q=` form for `unwrap_redirect` (`google.rs:40`) to unwrap.
- **HTTP.** `Ctx` (`main.rs:25-37`) holds `http_public`; `fetch::client` sets `redirect(Policy::none())` and, for `public_only`, a resolver that refuses private addresses (`fetch.rs:97-137`); `ctx.limits.acquire` caps 4 requests in flight per host. Nothing in the crate reads a `Location` header and stops without following it (`fetch.rs:492-498` follows).
- **Browser path.** `tools.rs:246-256`: `click`/`press` go to `Browser::run` → `attached` (`browser.rs:340`, the `tab_gone` retry loop) → `run_with` → `call` (`:165`) with `Via::Tab` flags (`--cdp <url> --pin-tab --config attach.json`, `:121-127`). `fill`/`type`/`eval` go through `batch`. Search's typing batch (`search.rs:275-307`: `click` the box, `press Control+a`, one `press` per character, `press Enter`) goes through `batch_once`, which never rebinds and bypasses `attached` (agent-mapped, `browser.rs:520`; not read by me).
- **Tests.** The fake agent-browser (`tests/bin/fake_agent_browser.rs:72-99`) handles only `tab new`; `tab list`, `tab <id>`, `click` and `press` get the default answer. No existing test sends a successful `click` or `press` through the tool. Google's engine can't be pointed at a fake host (hard-coded URL, `google.rs:23`); `google_parses_fixture` is `#[ignore]`d with "resolving them is a follow-up" (`google.rs:104`).
- **Recent change on this path.** #115 (`fad7052`) added typed follow-up searches. History before the crate move (#117/#118) is not in `git log` for `tools/web-mcp`.
- **Upstream.** agent-browser (vercel-labs/agent-browser): **#2146** "`click` reports ✓ Done but misses when the pinned tab is in the background (visibilityState hidden)", open since 2026-10-18, seen on 0.38.2; the fix it asks for is "click brings the tab to the front, or warns". **PR #1695** (open) would remove the implicit `Page.bringToFront` on tab switch and keep an explicit `bringtofront` command; **#1427** (open) "keep non-foreground tabs operable". The pinned 0.41.1 has no `bringtofront` command (`agent-browser --help` lists none, measured). The GitHub pages are third-party data, read for facts only.

## Findings

All runs 2026-11-06, NixOS, Helium 0.18.1.1 (Chromium 154), agent-browser 0.41.1, web-mcp built 09:30 the same day. Scripts: `/tmp/claude-1000/-home-deadmade-projects-dead-claude-skills/073a3525-6b03-4094-8a6a-705d1adb95ea/scratchpad/` (`repro-*.sh`, `cold-start.py`, `resolve-goto.py`); not committed.

### 1. Google: the rows are dropped

- **Reproduction (measured):** `cargo test --locked -p web-mcp --bin web-mcp google_parses_fixture -- --ignored` → `FAILED … not results: Unrecognised`.
- **Live page (verified by reading):** web-mcp's own capture of a live Google results page has 9 result headings and 52 `/goto?url=CAES…` links; each result is `<a href="/goto?url=CAES…" ping="/url?…&url=CAES…">`, the target is in no attribute.
- **What resolves it (measured):** a plain cookie-less GET of each `/goto` link, redirects not followed, answered `302` with the real target for 8 of 8 result rows (0.07-0.17 s each, Python urllib, 0.3 s apart, one page). Not measured: web-mcp's own client, many searches in a row, a token's lifetime.
- **Dead end (measured):** `gbv=1` (basic HTML) redirects to `gbv=2`, the full page.
- **Correction, found while proving the fix (measured, same day):** the 8 of 8 above was a minutes-old page. On a **fresh** page Google redirects only the first few links and then answers `200` with an interstitial (`<meta content="3;url=/goto?url=…">`, a spinner page) whose delay grows with each further request (3, 4, 5, 7, 12, 22 s). With web-mcp's client: burst of 4 at a time → rows 1 and 2 only; sequential, no spacing → the first 3 on 4 of 4 pages; 400 ms spacing → the first 4 on 4 of 4 pages; echoing the `__Secure-ENID` cookie → the first 3 on 4 of 4. Old saved tokens resolved 9 of 9 even in a rapid burst, so the limit is on fresh tokens. The token itself is opaque (93 to 114 bytes, no plain-text target). After a burst, every request for the next ~30 s is `200`, so extra requests also hurt the next search.
- **Live, final build (measured):** Google is no longer skipped; it contributes 2 rows (2 of 2 successful searches in the last run, 3 to 4 in cleaner earlier runs), the rest of Google's page is dropped. Before the fix the same query gave `skipped: google: unrecognised page`.

### 2. Input is lost in a hidden tab

- **Reproduction (measured):** `cold-start.py 3 8766 <dir> full` starts a fresh web-mcp per trial and replays my smoke run (a `search`, a second `search`, a link click, fill, type, then `click` on the button by ref and `press Enter`). Result: **0 of 3** clicks and **0 of 3** Enter presses reached the page (`log: []`), each time with `visibilityState: "hidden"`; `fill`, `type` and `scroll` still worked.
- **Controls (measured):** a visible tab: click and press delivered in 5 of 5 (CLI by ref and by selector, MCP twice, one cold trial). After activating the tab: delivered **5 of 5** (`/json/activate` 2, agent-browser's own `tab <targetId>` from the session 3; `visibilityState` became `visible`).
- **Not explained (measured):** in the long-running live window a hidden tab still took click and press (2 of 2, with `hasFocus()` false); in every failing fresh window `hasFocus()` was true. Chrome's mechanism is inferred; the upstream report #2146 describes the same symptom.
- **How to find the tab (measured):** `tab list` from the session marks its own tab `"active":true`.
- **Gate 1's Option A does not work (measured, built then discarded):** agent-browser's `tab <id>` raises the tab (`press Enter` delivered 3 of 3, `visibilityState` visible) but resets the daemon's ref table, so every `click @eN` after it answered `Unknown ref`. The fake agent-browser doesn't model that, so the unit and integration tests passed until the live `clickref` run. Chrome's `/json/activate/<targetId>` on the debug port raises the tab and leaves the refs valid (measured in `activate` mode). Built as Option B; see Deviation 2.
- **Concurrency (verified by reading, then measured):** four engines type in parallel and only one tab can be in front, so a raise and its input are one step under a `tokio::sync::Mutex`. Unbounded, one hung holder stalled the others (`slow_typing_times_out_without_a_second_load` failed), so a waiter goes on without the lock after `FRONT_WAIT` = 5 s (a follow-up search over all four engines took 6 to 8 s).
- **Proof, live (measured, same replay as the reproduction, `cold-start.py 3 8766 <dir> full`):** installed binary (before) click by ref delivered **0 of 3**, `vis: hidden`, and `/json/activate` then fixed it 3 of 3; the fixed binary (after) click by ref delivered **3 of 3** with `vis: visible`, and `press Enter` reached the page (`keydown go key=Enter`) 3 of 3. A two-tab `hidden` run on the installed binary delivered 1 of 1 (hidden tab, click and ref both worked), so a hidden tab does not always lose input; the replay above is the sequence that does, 3 of 3.

### 3. Search follow-ups fail in step (same cause, inferred)

- **Measured:** six searches in a row on a fresh server: 1 all four engines timed out (cold), 2 ok 11.0 s, **3 one engine, 32.4 s**, 4 ok 10.8 s, **5 one engine, 32.2 s**, 6 ok 10.7 s. The live window showed the same: fail, ok, fail, ok, fail.
- **Verified by reading:** a search types its query only when the engine's previous search succeeded (`types()`, `search.rs:264-270`, `prev` from `last.take()` at `:152`; only `Parsed::Results` sets `last`, `:196-198`), so a failed typed search is followed by a URL load that works. That produces the alternation.
- **Inferred, not measured:** the typed batch's `click`/`press` are lost in the three hidden engine tabs. Prove measures it: the `searches` mode of `cold-start.py` before and after the fix.
- **After the fix (measured, same `searches` mode, fixed binary, one fresh server):** search 1 timed out on all four engines (13.2 s, the cold start, as before), then 2 ok 35.7 s, 3 ok 27.2 s, **4 ok 8.3 s, 5 ok 6.3 s, 6 ok 6.1 s**, each with all four engines (Google included). The alternation is gone: before, searches 3 and 5 returned one engine after 32 s. Not fixed and out of scope: the cold-start timeout of search 1 and the slow searches 2 and 3 (unexplained). The harness line `delivered 0 of 1` only reflects search 1's error. One run, not a rate.

## Options

### Fix 1: Google results

Picked: A, resolve the `/goto` links (the user, 2026-11-06).

- **A. Resolve the `/goto` links (recommended).** The Google parser keeps `/goto` rows and still drops Google's other own links (ads, "AI Mode"); after a successful parse, `run_engine` resolves each kept row with one GET, redirects not followed, through `ctx.http_public` and the per-host cap of 4, only for the landed page's own host and path `/goto`; the `Location` (http or https, not Google) becomes the row's URL, a row that fails is dropped, and if none resolves the engine is skipped as before. Measured: 8 of 8 rows resolved. Files: `engines/google.rs`, `search.rs`, `engines/mod.rs` only if the resolver lives there; tests in `engines/google.rs` (`google_parses_fixture` un-ignored) and `tests/search.rs` (a Google page of `/goto` rows answers with the stub's targets, which needs a seam because Google's host is hard-coded: reuse the landed page's host, no new env hook). Blast radius: `run_engine` also serves Scholar and Semantic Scholar (`papers.rs:652`), so the step is Google-only; up to ~10 extra GETs to www.google.com per search, the thing most likely to bring a block back (unmeasured at volume). Door: two-way.
- **B. Resolve inside the browser tab.** Not workable (inferred): `fetch` with `redirect: "manual"` hides `Location`, and following it contacts third-party sites from the user's browser.
- **C. Read the target from the visible URL line under each result.** Lossy (truncated breadcrumbs) and unverifiable (inferred).
- **D. `gbv=1` basic HTML.** Dead (measured): Google redirects it to `gbv=2`.
- **E. Leave Google out of the default engines.** No code, one engine fewer.

### Fix 2: input lost in a hidden tab

Picked: A, raise the session's tab through agent-browser's `tab list` and `tab <id>` before `click`, `press` and the search typing batch (the user, 2026-11-06). **Built as B** (Chrome's `/json/activate`), because A makes every click by ref answer `Unknown ref`: Deviation 2.

- **A. Raise the session's tab before `click` and `press` (recommended).** One helper in `browser.rs`: `tab list` → the row with `"active":true` → `tab <tabId>`, both with the session's `Via::Tab` flags. Called in `attached` before a `click` or `press` (inside the `tab_gone` retry loop) and once in `batch_once` before a batch that holds `click` or `press` (the search typing batch; best effort, since `typed_page` already falls back to a URL load). `fill`, `type`, `scroll`, `eval`, `snapshot`, `screenshot` are untouched. Measured: input delivered 3 of 3 after `tab <targetId>`. Files: `browser.rs`; `tests/bin/fake_agent_browser.rs` (answer `tab list` with an `active` row, update its module doc: AGENTS.md says it changes with any answer web-mcp reads); `tests/browser.rs` (regression: a `click` and a `press` are preceded by `tab list` and `tab <id>`, a `fill` is not); a unit test in `browser.rs` for `batch_once`. Blast radius: two more agent-browser calls per click or press, and two per typed search per engine; the window's front tab changes while Claude works. Risk: it relies on 0.41.1's `tab <id>` raising the tab; upstream PR #1695 would remove that raise and keep an explicit `bringtofront` that 0.41.1 lacks, so a later pin bump could silently undo the fix (a `shortcut:` comment names this). Door: two-way.
- **B. The same through Chrome's HTTP endpoint** (`/json/activate/<targetId>`, measured 2 of 2): independent of agent-browser's version, but a new HTTP call to the debug port and more code.
- **C. Wait for upstream** (#2146, open since 2026-10-18, no fix): nothing changes for the user.
- **D. One window per session**, so no tab is ever hidden: reverses ADR 0007 (`window.rs`), a large change.
- **E. Raise before every attached call:** also covers any other input, but adds calls everywhere and breaks the exact command lists the tests assert (agent-inferred).

### Scope

Picked: one run, two tasks, each with its own failing test, proof and commit (the user, 2026-11-06). The user also confirmed that the hidden-tab loss matches the "navigating a page is hard or broken" they hit.

- **One run, two tasks (recommended):** Task 1 Google, Task 2 input, each with its own failing test first and its own commit; both are in `tools/web-mcp/` and the user asked for both together.
- Two separate runs, or only one of them now.

## Plan review

## Tasks

Branch `worktree-web-mcp-google-results-and-clicks` (the host worktree tool's name), cut from origin/main `9e5dc54`; worktree `.claude/worktrees/web-mcp-google-results-and-clicks`. This run's folder was moved here from the main checkout (diff -r clean). Baseline `cargo test --locked -p web-mcp` (cargo target dir shared with the main checkout): 161 unit, 26 browser, 17 fetch, 37 lookup, 1 mcp, 11 papers, 33 search passed; 4 ignored (Google's two, Semantic Scholar's two).

Task 1: base 9e5dc545ac20697a3b46510c10540f92883b23ad, untracked at start: `docs/features/web-mcp-google-results-and-clicks/flow.md`, `graphify-out/cache/hook_sessions/073a3525-6b03-4094-8a6a-705d1adb95ea.nudges` (a hook's file, not ours). **Files:** `tools/web-mcp/src/engines/google.rs`, `tools/web-mcp/src/engines/mod.rs`, `tools/web-mcp/src/search.rs`, `AGENTS.md` (its web-mcp bullet says Google's tests are `#[ignore]`d until captured), this flow.md.

Task 1 done, uncommitted (it waits for your yes at Finish): `google_parses_fixture` un-ignored and passing; three resolver tests (`resolve_goto_replaces_each_redirect_with_its_target`, `…_stops_when_google_throttles` seen failing for the right reason against the concurrent first draft, `…_fails_when_no_link_resolves_but_not_on_an_empty_page`) pass; `cargo test --locked -p web-mcp` 165 unit, 26, 17, 37, 1, 11, 33 passed, 3 ignored; `cargo clippy --workspace --all-targets --locked -- -D warnings` and `cargo fmt --all -- --check` clean; files clean (the four tracked paths above, nothing else; the hook's untracked file is not ours). Task 1's diff is saved as `…/scratchpad/task1.patch` (sha256 `cc3d327a…8612`) so Task 2's files check can tell the tasks apart before either is committed.

Task 2: base 9e5dc545ac20697a3b46510c10540f92883b23ad plus Task 1's uncommitted diff (`task1.patch`, sha256 `cc3d327a…8612`), so a files check can tell the tasks apart. **Files:** `tools/web-mcp/src/browser.rs`, `tools/web-mcp/tests/bin/fake_agent_browser.rs`, `tools/web-mcp/tests/browser.rs`, `AGENTS.md` (the web-mcp bullet: the raise, the lock, the fake's `tab list` and `cdp-port`, the `shortcut:` caveat), this flow.md.

Task 2 built, uncommitted (it waits for your yes at Finish): test first (`batch_once_raises_the_tab_only_for_input`, `input_takes_the_front_tab_one_session_at_a_time`, and in `tests/browser.rs` a click and a press preceded by `tab list` with the `/json/activate/<targetId>` hit and no `tab <id>`, and a rebind after `tab_gone`); `cargo test --locked -p web-mcp` 167 unit, 28 browser, 17 fetch, 37 lookup, 1 mcp, 11 papers, 33 search passed, 3 ignored; clippy `-D warnings` and `cargo fmt --all -- --check` clean. Live proof is in Findings §2.

Review fixes (Gate 2, "All 14"). **Base for Fix 1 to 14:** `817060f8629939f0545b8a690b953bd73ab3f377` (`git stash create`: Tasks 1 and 2 as uncommitted), untracked then present: this run's folder, `docs/audits/2026-11-06-review-branch.md`, `graphify-out/cache/hook_sessions/073a3525-6b03-4094-8a6a-705d1adb95ea.nudges`. One shared base, so the files check runs once over the union of the lists below (an earlier fix's files can't be told from a later one's); each fix's own files are still named. Each pick's finding names its **Files**:

- Fix 1: `plugins/shared/web-mcp/README.md`.
- Fix 2: `tools/web-mcp/src/search.rs` (`resolve_goto` and its unit tests).
- Fix 3: `AGENTS.md`, `tools/web-mcp/src/search.rs` (two comments).
- Fix 4: `AGENTS.md`.
- Fix 5: `tools/web-mcp/src/browser.rs` (the test), `tools/web-mcp/tests/bin/fake_agent_browser.rs` (a typing delay, if the test needs one).
- Fix 6: `tools/web-mcp/src/search.rs` (unit tests), `tools/web-mcp/tests/search.rs`, `tools/web-mcp/tests/bin/fake_agent_browser.rs`, `tools/web-mcp/tests/fixtures/search/` (a Google page of `/goto` rows).
- Fix 7: `tools/web-mcp/src/search.rs`, `tools/web-mcp/tests/search.rs`.
- Fix 8, 9, 10: `tools/web-mcp/src/browser.rs`.
- Fix 11: `tools/web-mcp/src/search.rs`, `tools/web-mcp/src/browser.rs`, `tools/web-mcp/tests/bin/fake_agent_browser.rs`.
- Fix 12: `tools/web-mcp/src/fetch.rs`, `tools/web-mcp/src/search.rs`, `tools/web-mcp/src/engines/mod.rs` (the wrapper; the second client stays, see Rulings).
- Fix 13: `tools/web-mcp/tests/browser.rs`, `tools/web-mcp/src/browser.rs`, `tools/web-mcp/src/search.rs`, `tools/web-mcp/src/api.rs`.
- Fix 14: none (the finding's fix is "leave it").

Review fixes built, uncommitted (2026-11-06), by this session, test first where behaviour changed: Fix 2's resolver tests, Fix 7's `unresolved_links_clear_the_consent_mark` (seen failing on its last assertion, `consent-seen` still present, before the reorder), Fix 6's two `run_engine` tests, and Fix 5's test strengthened to a timing bound (mutation: with the lock released right after `raise`, it failed 6 of 6 runs; before, the old test passed 10 of 10 under the same mutation; with the real code it passes 6 of 6). Mutation checks on the resolver (2026-11-06): a failed request no longer stopping the walk fails `resolve_goto_stops_when_a_request_fails`, and dropping the deadline bound fails `resolve_goto_gives_up_at_the_deadline`. `cargo test --workspace --locked --no-fail-fast`: web-mcp 173 unit (3 ignored: Google's no-results, Semantic Scholar's two), 28 browser, 17 fetch, 37 lookup, 1 mcp, 11 papers, 36 search, every other crate green except `flow-cockpit-core`'s `phase_lists_match_skill_tables`, which reads the generated `.claude-plugin/flows/…` that this worktree doesn't have (no `node_modules`, so `npm run build:harnesses` can't run here): not touched by this run, not shown to pass. Clippy `--workspace --all-targets --locked -- -D warnings` and `cargo fmt --all -- --check` clean. **Files check: files clean**: `git diff --name-only 817060f8…` lists ten paths, all on the union of the lists above (`AGENTS.md`, `plugins/shared/web-mcp/README.md`, `tools/web-mcp/src/{api,browser,fetch,search}.rs`, `tools/web-mcp/src/engines/mod.rs`, `tools/web-mcp/tests/{browser,search}.rs`, `tools/web-mcp/tests/bin/fake_agent_browser.rs`); `tools/web-mcp/tests/fixtures/search/` stayed unchanged (Fix 6's pages are built in the test). New untracked since the base: only more of the hook's `graphify-out/cache/hook_sessions/2205e588-….nudges` files, which are not ours. No Size or Adds lines.

**Fix check, round 1** (one fresh opus agent, which wrote no fix; it ran every test and mutations in a scratch copy): 13 of 14 PASS, **Finding 10 FAIL**: my comment on `front` gave "a `tab` command of the `browser` tool" as an example, and the tool has no `tab` action (`BrowserAction`, `tools.rs:70-83`; verified by me). It also found: (1) Fix 2's stop on any `*.google.com` target would drop real results on `support.google.com` and the like (found by reading; I confirmed it with a failing test first); (2) `limits.acquire` ran outside the deadline (my own code, not pre-existing against the base; confirmed with a failing test first); (3) `tests/browser.rs`'s exact path lists became counts on one path; (4) `a_refused_raise_does_not_fail_the_input` cannot see the stderr line. All of (1), (2) and Finding 10 went back to the fix (below); (3) and (4) are rulings. **Round 2** (one fresh sonnet agent, scratch-copy mutations): the `front` comment PASS (it asked me to make the first-bind wording exact: done), the resolver rule and its doc comments PASS, and both new tests were caught by their mutations (slot wait moved outside the deadline; stop on any same-site target). Its further remarks I acted on, with a failing test first: a target on the search host itself no longer stops the walk (the row is dropped, as in the base code), only a `/sorry` or `/sorry/…` page of the site does, and `notgoogle.com` and `/sorry-moved` are results; the dot boundary in `same_site` is now tested (mutation caught by me). Not acted on: a cancelled `acquire` leaves a host's interval schedule advanced (Google's interval is zero, so no effect today). **Those last changes were checked by their tests and my mutations only, not by a third fresh agent.** Final run: web-mcp 176 unit (3 ignored), 28, 17, 37, 1, 11, 36; clippy `-D warnings` and fmt clean; files clean (same ten paths).

## Rulings

- [c, confirmed 2026-11-06] 2026-11-06, Fix 12: the finding says to share a `location` helper and drop the wrapper, and to "leave the client unless you are in that code again". I leave the second `reqwest` client in `Browser` — the verifier found it saves little (four `Browser::new` call sites, tests need a default) — and do the other two. Costs if wrong: one more connection pool and a swallowed client-build failure on a path that is best effort anyway.
- [d, confirmed 2026-11-06] 2026-11-06, Fix 14: the finding's fix is "leave it": the `targetId` filter stays, untested; a test with a bad id would only pin the filter's character set. Costs if wrong: three lines nobody can see fail.
- [e, confirmed 2026-11-06] 2026-11-06, Fix 10: the finding names two fixes ("take `front` around that `tab new`, or say in the comment that `front` claims only raise against raise"). Chosen: the comment. The finding is plausible, not shown (a live Chrome is needed to know whether a new target takes the front), and the lock would not cover a fresh session's first bind anyway. Costs if wrong: a typing batch loses its keys when an engine rebinds mid-search; it falls back to a URL load, so a slower search, not a wrong answer.
- [f, confirmed 2026-11-06] 2026-11-06, Fix 9: the finding says "measure one locked typing step". The scratch harness that measured live runs is gone with the scratchpad, so I fix the comment to what was measured and leave the per-step hold unmeasured. Costs if wrong: the fixed 5 s bound may pass early on long queries (the same fallback as above).

- [g, confirmed 2026-11-06] 2026-11-06, Fix 12: after the wrapper went, `google::is_goto` has no caller outside `google.rs`; I leave it `pub(super)` instead of narrowing it, because `engines/google.rs` is not on Fix 12's list (the finding names `fetch.rs`, `search.rs`, `engines/mod.rs`) and a file outside the list would be a deviation for one word. Costs if wrong: one visibility wider than its use.
- [h, confirmed 2026-11-06] 2026-11-06, Fix 5: the finding says to strengthen the test or rename it. Chosen: strengthen it, with a new fake knob (`<state>/typedelay`, ms each typing batch sleeps first) and a lower bound of twice the delay on two sessions typing together. The bound only fails when the sessions overlap, so a slow machine cannot turn the real code red. Costs if wrong: a 0.8 s test and one more fake knob.
- [i, confirmed 2026-11-06] 2026-11-06, Fix 6: the resolver's `run_engine` wiring is tested with pages built inside the test (`goto_google` in `tests/search.rs`) and a new fake marker (`<pages>/google.landed`, the URL the page reports as landed), so no fixture file was added and `tests/fixtures/search/` is unchanged; targets are `127.0.0.1:9` addresses that are recorded but refused, never fetched. Costs if wrong: a second place that knows Google's `/goto` shape (the parser fixture `engines/google.html` is the first).

- [j, confirmed 2026-11-06] 2026-11-06, Fix 2: the finding says to "treat a target on a Google host as a stop". I narrowed that to the search host itself or a `/sorry` page on any host of its site (`flagged` in `search.rs`), because the round-1 checker showed the literal reading drops legitimate results on other Google hosts (`support.google.com`, `docs.google.com`; the parser deliberately keeps those rows, test `google_keeps_other_google_hosts`). The `/sorry` page is the one case with a reason behind it, and that reason is inferred, not measured (no real `429` or `/sorry` was ever seen in this run). Costs if wrong: a flagged client redirected somewhere else on Google's site would be ranked as a result, and the walk would go on asking.
- [k, confirmed 2026-11-06] 2026-11-06, Fix 13: the integration stub became `common::Fixture`, which counts hits per path but cannot list all requests, so `tests/browser.rs`'s exact path list became `hits(&target)` (2 and 1). An extra activation of the same tab still fails; an activation of a wrong path no longer does. An all-requests accessor would touch `tests/common/mod.rs`, which is on no fix's list. Costs if wrong: a regression that raises the wrong tab shows up as a failed click, not as a failed assertion about paths.
- [l, confirmed 2026-11-06] 2026-11-06, Fix 8: `a_refused_raise_does_not_fail_the_input` proves that a refusing Chrome (`404`) neither stops the input nor adds a request; it cannot see the stderr line, which no test reads (a test would have to capture the server's stderr). Costs if wrong: the message could vanish unnoticed.

## Parking lot

- [m, pick 2026-11-06: a follow-up] **Check (from /learn):** make the fake agent-browser model `tab <id>` resetting the daemon's refs (after `tab <id>` on a session, `click @eN` answers `Unknown ref` until a `snapshot`). It must fail on Option A, Gate 1's approved build (`tab list`, then `tab <id>`), which passed every unit and integration test and answered `Unknown ref` on the first live click by ref; shown by that live run, not re-run against the discarded build.
- [n, pick 2026-11-06: a follow-up] **Check (from /learn):** a live proof script kept in the repo (a fresh web-mcp server, a search, a click by ref, `press Enter`, assert the page saw both), because the `shortcut:` on `Browser::raise` says "test input in a hidden tab again whenever the agent-browser pin moves" and the harness that did it was lost with the session scratchpad. It must fail on the code before this run (0 of 3 clicks delivered); shown live in Findings §2.

## Deviations

1. [a, confirmed 2026-11-06: accepted as built, option (a)] **Task 1's approved option delivers less than it promised (needs your ruling).** Gate 1 picked "resolve the `/goto` links" on "8 of 8 resolved" and flagged the extra requests as the unmeasured block risk. Measured since: Google redirects only a fresh page's first 3 to 4 links and throttles the rest (Findings §1, correction). Built as: resolve in rank order, stop at the first throttled answer, drop the unresolved rows, fail the engine when none resolves. Google therefore adds its top 2 to 4 rows per search, not all 9, and sends at most one request past the limit. No file outside Task 1's list, no new interface or env hook. Options for you: **(a) accept this (recommended)**: Google is no longer skipped, costs at most 5 requests, and the other three engines carry the volume; **(b)** also wait out the interstitial's 3 to 4 s delay and follow its fresh link, which could resolve a few more rows but doubles the requests and the delay grows with every one (inferred, unmeasured); **(c)** take Google out of the default engines (Option E).

2. [b, confirmed 2026-11-06: accepted as built, option (a)] **Task 2's approved option could not be built as approved (needs your ruling).** Gate 1 picked Option A: `tab list`, then agent-browser's `tab <id>`. Measured: it raises the tab but resets agent-browser's refs, so `click @e1` then answers `Unknown ref` and the fix would have broken every click by ref (Findings §2). Built as Option B, which Fix 2 listed: `tab list` names the session's tab (the `active` row's `targetId`), then `GET http://<host>:<port>/json/activate/<targetId>` on the window's debug port raises it, and the refs stay valid. Two things the approved option did not name: a `reqwest` client held in `Browser` (one localhost request per click, press or typing batch), and a `front` lock with a 5 s bound so four engines' typing does not hide each other's tab. Files are the ones Gate 1 listed (`browser.rs`, the fake, `tests/browser.rs`), plus AGENTS.md. Options for you: **(a) accept B (recommended)**: it is the only one measured to deliver the click and keep the refs; **(b)** drop the raise and wait for upstream (#2146): clicks stay lost; **(c)** one window per session (Option D), which reverses ADR 0007.

## Walkthrough

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |
| Google is no longer skipped: its `/goto` rows survive the parser | Task 1 | `tools/web-mcp/src/engines/google.rs:55` (`is_goto`), `:73` (the filter) | `google_parses_fixture` (`google.rs:112`, un-ignored) |
| each `/goto` row is replaced by its target, in rank order, until Google throttles, refuses, redirects home, fails or the deadline passes | Task 1, Fix 2 | `tools/web-mcp/src/search.rs:244` (`resolve_goto`), `:292` (`same_site`), called at `:204` | the eight `resolve_goto_*` tests (`search.rs:692` to `:832`) |
| a Google page whose links don't resolve skips Google, rests nothing and still counts as read (consent mark, typed follow-up) | Fix 6, Fix 7 | `tools/web-mcp/src/search.rs:196-206` (`run_engine`: the marks before the resolver) | `google_rows_are_replaced_by_their_redirects_until_google_stops` (`tests/search.rs:719`), `google_without_a_resolved_link_is_skipped_without_rest` (`:748`), `unresolved_links_clear_the_consent_mark` (`:769`) |
| `click` and `press` reach a hidden tab, and click by ref still works | Task 2 | `tools/web-mcp/src/browser.rs:157` (`is_input`), `:363` (`attached`), `:547` (`batch_once`), `:583` (`with_front`), `:604` (`raise`, which writes a refused activation to stderr) | `click_and_press_raise_the_tab_first` (`tests/browser.rs:203`), `a_rebound_tab_is_raised_before_the_retry` (`:230`), `a_refused_raise_does_not_fail_the_input` (`browser.rs:1241`) |
| the typed follow-up search is raised once and does not hide the other engines' tabs | Task 2, Fix 5 | `browser.rs:547` (`batch_once`), `:165` (`FRONT_WAIT`) | `batch_once_raises_the_tab_only_for_input` (`browser.rs:1209`), `input_takes_the_front_tab_one_session_at_a_time` (`:1262`, a timing bound) |
| the fake answers what web-mcp now asks | Task 2, Fix 5, Fix 6 | `tools/web-mcp/tests/bin/fake_agent_browser.rs` (`tab_list` `:114`, `cdp_url` `:369`, `engine_landed` `:419`, the `typedelay` file in `typing`) | used by the tests above |
| a reader learns that Google works, what it contributes and why a search can skip it | Fix 1 | `plugins/shared/web-mcp/README.md` (the typing paragraph and the one after it) | none (prose) |
| a future session learns the throttle, the raise and the ref reset | Tasks 1 and 2, Fix 3, Fix 4 | `AGENTS.md:108` (the web-mcp bullet) | none (prose) |

No goal without code and no code without a goal; the two deviations (Google's rows limited by its throttle, Option B for the raise) are under Deviations.

## Review

Audit file: [docs/audits/2026-11-06-review-branch.md](../../audits/2026-11-06-review-branch.md). Five lenses (correctness on the neutral brief, lean, tests, docs, security; risk skipped), one verifier over 24 candidates: 14 findings, 3 candidates dropped. Verdict: 4 to fix before merge (README says Google gives no results; the resolver walks on after a `429`/`/sorry`; "however paced" contradicts our own burst measurement; AGENTS.md hides that Semantic Scholar's result page is missing). Security: no findings. The report was copyedited (nothing removed). Picks: all 14 (Gate 2). Fixes: all 14 built and checked by two rounds of fresh agents (Tasks, "Fix check"); the audit file carries `Fixed 2026-11-06`.

## Learned

Written by /learn, 2026-11-06 (uncommitted; revert by deleting the file):

- `docs/solutions/google-results-are-goto-links-that-resolve-only-a-few-times.md`: Google's opaque `/goto` links, the 2 to 4 resolution limit and the 30 s burst penalty, and that a minutes-old page gave a wrong 8 of 8.
- `docs/solutions/click-and-press-reach-nothing-in-a-hidden-tab.md`: input lost in a hidden tab (agent-browser#2146), and `tab <id>` resetting refs, which the fake doesn't model.
- Memory (outside the repo): `scratchpad-can-vanish.md` (keep scripts a later phase must rerun in the flow's folder), `dcg-blocks-redirect-over-existing-file.md`.
- AGENTS.md's web-mcp bullet was already updated by the run (Fixes 3 and 4 plus the stub and the fake's new knobs); CLAUDE.md names nothing web-mcp specific and needs no change.
- Parked, for Decide: two checks (the fake's ref reset, a live proof script), under **Parking lot**.

## Run verdict

2026-11-06, by the user at Decide: worked as a whole: **yes**; clean: **yes**. Decisions a to p confirmed, both Parking-lot lines a follow-up, every Skipped row accepted.
