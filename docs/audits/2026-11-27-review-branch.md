# Review: branch

branch: tests-use-the-real-thing ← main (238c8e10), 97 files, +5281 −4303, 39 commits + the untracked run folder
(`docs/features/integration-first-testing/`). Run inline from `/build-feature`'s Finish; intent: that folder's
spec.md, plan.md and the Options `Picked:` lines; execution was subagent-driven with per-task reviews.

Checks: green at 7a7d616f, tree unchanged since apart from the untracked run folder.

- `cargo test --locked -p web-mcp` and `-p browser-core -p http-runner -p ado-mcp` passed.
- clippy `-D warnings` and fmt passed.
- `node scripts/test.mjs --strict rust`, `npm run typecheck` and `npm run build:harnesses` passed.
- `node scripts/test.mjs repo node mods` failed on 5 tests, the EPERM symlink baseline.
- `node scripts/test.mjs real` failed on 4 tests, the same baseline. The installer e2e passed, at 92.47 % line coverage.
- These were the merge run at 92bf7fa8, with clippy re-run after 7a7d616f. `cargo test -p web-mcp --test browser` was re-run at 7a7d616f: 20/20.
- Windows only.

Lenses: correctness (neutral brief: the tree has an untracked folder, so the built-in review's conditions don't hold),
lean, tests, docs, security, risk; none skipped. One verifier on every candidate.

## Findings

| #   | severity       | where                                                                                         | finding                                                                                                                                                                                                                                                                                                                     | evidence                                                                                                                                                                                      | fix (recommended)                                                                                                                                      | bucket           |
| --- | -------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| 1   | med            | `tools/web/web-mcp/tests/search.rs:207-226`                                                   | `a_dropped_server_leaves_no_chrome` can't fail: `Mcp::drop` kills the child and every process holding the root and removes the root before the test's asserts run                                                                                                                                                           | confirmed: `tests/common/mod.rs:838-855` `let _ = self.child.kill(); ... for pid in processes_holding(&real.root) { kill(pid); }` then `remove_dir_all`                                       | close stdin and wait for the child's own exit (as `finish()` does), assert no holder, then drop                                                        | fix before merge |
| 2   | med            | `tools/installer/steps/codex.ts:177-179,197,238`                                              | a symlinked `~/.codex/config.toml` (dotfiles, home-manager) now fails every Codex apply, since `configure('dead-skills', {url})` always goes through `editConfig`, which throws on a symlink; before, only the Azure and serena edits checked                                                                               | confirmed: `if (existsSync(config) && lstatSync(config).isSymbolicLink()) throw new Error(...)`; old code `git show 238c8e10` ran `codex mcp add --url` there. Plausible that it used to work | report the url servers as a manual step (one failure line, the rest of the apply goes on), or write through `realpathSync` when the target is writable | fix before merge |
| 3   | low            | `tools/web/web-mcp/tests/browser.rs:240-271`                                                  | `input_reaches_a_hidden_tab_despite_a_proxy` claims proxy coverage it doesn't give: its comment says it passes with the raise disabled and with the raise sent through the proxy; the deleted fake asserted the raise reached Chrome despite `HTTP_PROXY`, so `.no_proxy()` (`browser-core/src/browser.rs:188`) is untested | confirmed: `browser.rs:243-244` quoted; the raise itself was recorded not covered (Task 6 fix round, user)                                                                                    | rename it to the smoke test it is and drop the proxy envs; or assert `document.visibilityState` after a press (plausible)                              | fix before merge |
| 4   | low (security) | `tools/ado-mcp/src/api.rs:755-758`, `docs/components/mcp-azure.md:58-60`                      | an AD identity's `DN` (`CN=Doe\, John,OU=…,DC=…`) and `Description` survive masking into `ADO_CAPTURE_DIR` files; the doc's list of what isn't masked doesn't name them, so a reader trusts the masking                                                                                                                     | plausible: only `for k in ["Account", "Mail"]` reads `properties`; no captured on-prem identity with `DN` in the repo                                                                         | name `DN` and `Description` in the doc's not-masked list (smallest), or mask both properties whole                                                     | fix before merge |
| 5   | med            | deleted fake tests in `tools/web/web-mcp/tests/search.rs`                                     | no running test for: cancellation leaving the queue, typing falling back to the URL on a gone tab or after a Chrome restart, two processes taking two slots, window start outside the engine deadline, consent page not typed into                                                                                          | confirmed: `rg "notifications/cancelled" tools/web` finds nothing; window start, cancellation and consent typing were accepted as not covered by the user (flow.md Tasks, Task 7)             | port the cancellation test to real Chrome (three queued searches, cancel two, two loads)                                                               | worth doing      |
| 6   | med            | `tools/web/web-mcp/tests/search.rs:514-544`                                                   | the only test of a typed follow-up meeting a captcha is `#[ignore]`d (~1 % focus race), so the behaviour has no running test                                                                                                                                                                                                | confirmed: `#[ignore = "flaky in a headed window (3 of ~140 runs …"]`; accepted by the user at Task 7                                                                                         | un-ignore and retry once when the log shows `typed: false`                                                                                             | worth doing      |
| 7   | low            | `tools/web/web-mcp/src/search.rs:631`, `papers.rs:663`, `browser-core/src/browser.rs:406-409` | `bind` runs for resting engines (the rest check is later, in `run_engine`), so a resting engine gets a tab and a daemon each search; if that bind times out, the key leaves `ran` and `close_all` never ends the daemon (Linux; Windows has `tie_to_process`)                                                               | (a) confirmed, (b) plausible                                                                                                                                                                  | skip resting engines in `search::bind` / papers' bind (`ctx.profiles.resting(e.name(), now)`)                                                          | worth doing      |
| 8   | low            | `.github/workflows/crates.yml:60-83`                                                          | the Chrome for Testing cache key holds only the agent-browser version and `install` runs on a hit too; both steps run when `PACKAGES` is only ado-mcp, so a googlechromelabs outage fails an ado-mcp PR, and once Stable moves every run re-downloads and the hit key never re-saves                                        | confirmed (key, install on hit, unconditional); plausible (re-download)                                                                                                                       | guard both steps on web-mcp/browser-core/http-runner in `PACKAGES`; skip `install` on a hit as `test.yml:96` does                                      | worth doing      |
| 9   | low            | `tools/web/web-mcp/src/engines/semanticscholar.rs:75-91`                                      | two live parser defects hidden by `#[ignore]`: rows have no abstract; a zero-result page parses as `Unrecognised`, shown as "unrecognised page" (`search.rs:317`) instead of an empty list                                                                                                                                  | confirmed                                                                                                                                                                                     | fix both selectors against the committed captures, or record both defects in `docs/components/web-mcp.md`                                              | worth doing      |
| 10  | low            | `scripts/test.mjs:61,120-125`                                                                 | the installer's coverage floor runs only in `real`: pre-commit (`flake.nix:58`), `release.yml:100` and `release.mjs:93` run `repo node` and no longer check it; locally `real` is NOT RUN without claude, codex and debug builds; `real` re-runs every installer unit test                                                  | confirmed: main's `NODE_FLAGS` held `--test-coverage-lines=84`; CI's `--strict` still enforces it                                                                                             | accept (ci.md documents it), or run the installer unit tests only in `real`                                                                            | worth doing      |
| 11  | low            | `.github/workflows/test.yml:64-107`, `scripts/ci-changes.mjs:55-56`                           | any change routed to the node job (a Markdown edit in `plugins/`) now runs a Rust update, a three-crate debug build, a codex install, Chrome and the e2e on both OSes                                                                                                                                                       | confirmed                                                                                                                                                                                     | run those steps only when `tools/installer/`, `scripts/test.mjs` or the crates changed                                                                 | worth doing      |
| 12  | low            | `tools/installer/steps/tools.ts:45-46`                                                        | the declined-prompt path (`install skipped by you`, no download) lost its test; the other deleted cases are covered (`core/tools.test.ts:65-82`, the e2e)                                                                                                                                                                   | confirmed                                                                                                                                                                                     | one pure test of the decline decision, or accept as not covered                                                                                        | worth doing      |
| 13  | low            | `tools/web/web-mcp/tests/browser.rs:520-522`                                                  | `mean < 25.0` against a 10 ms cap and a 30 ms uncapped floor leaves 5 ms each way; xvfb on ubuntu may break it                                                                                                                                                                                                              | plausible: Linux never ran                                                                                                                                                                    | compare against the same run's uncapped gap (e.g. `< 0.7 ×`)                                                                                           | worth doing      |
| 14  | low            | `tools/web/web-mcp/tests/search.rs:147`                                                       | `search_through_real_chrome_reads_captured_google` is covered by `real_chrome_rows_match_the_parser` and `four_engines_fuse…`; costs one Chrome start                                                                                                                                                                       | confirmed                                                                                                                                                                                     | delete it                                                                                                                                              | worth doing      |
| 15  | low            | `tools/installer/core/codex.ts:94-98`                                                         | a user-added key (`startup_timeout_sec`) or `.env` subtable in a managed url server makes every install rewrite the table and drop it                                                                                                                                                                                       | confirmed; the comment says replacement is intended                                                                                                                                           | replace only the `url` and `bearer_token_env_var` lines                                                                                                | worth doing      |
| 16  | low            | `tools/web/browser-core/src/browser.rs:206-214,345-347,910`                                   | `session_dir` and `socket_dir` name one folder by two rules; on Linux without `XDG_RUNTIME_DIR` `session_gone` sleeps a flat 1 s though `session_dir` knows the folder                                                                                                                                                      | confirmed (the Windows 1 s wait predates the branch)                                                                                                                                          | `socket_dir = (!cfg!(windows)).then(session_dir)`                                                                                                      | worth doing      |
| 17  | low            | `tools/web/web-mcp/tests/browser.rs:13-21`, `rows.rs:60-63`, `papers.rs:381`                  | pass `WEB_MCP_AGENT_BROWSER=/nonexistent/agent-browser`, which `start_with` already sets (`common/mod.rs:536`)                                                                                                                                                                                                              | confirmed                                                                                                                                                                                     | `Mcp::start_with(tempdir(), &[])`; delete `no_browser()`                                                                                               | worth doing      |
| 18  | low            | `tools/web/web-mcp/src/fetch.rs:1096-1141`                                                    | repeats browser-core's test `Real` setup (XDG set/restore, `close_all`, 5 s removal retry); the manifest literal is in 3 places (`fetch.rs:969`, `common/mod.rs:515`, `browser.rs:1060`)                                                                                                                                    | confirmed                                                                                                                                                                                     | a browser-core test-support export (not small)                                                                                                         | worth doing      |
| 19  | low            | `flake.nix:125-…,258-…`                                                                       | 69 hand-kept `--skip` names; a new browser test not added fails `nix build` in crates.yml                                                                                                                                                                                                                                   | confirmed                                                                                                                                                                                     | a shared `real_` name prefix and one `--skip real_`                                                                                                    | worth doing      |
| 20  | low            | `.github/workflows/test.yml:84-106`, `crates.yml:60-83`                                       | two copies of the pin, download and Chrome-cache steps, already disagreeing on `install` after a hit (#8)                                                                                                                                                                                                                   | confirmed                                                                                                                                                                                     | one script both call                                                                                                                                   | worth doing      |
| 21  | low            | `tools/installer/install.real.test.ts:18,40-48`                                               | repeats `BUILD` and the debug-path candidates of `scripts/test.mjs:79-86`                                                                                                                                                                                                                                                   | confirmed                                                                                                                                                                                     | export `BUILD` from `test.mjs`                                                                                                                         | worth doing      |
| 22  | low            | `session.real.test.mjs:15-23,73-76`, `install.real.test.ts:21-29,83-86`                       | identical `freePort`, 47811 rewrite and "still names the developer's port" check twice                                                                                                                                                                                                                                      | confirmed                                                                                                                                                                                     | one helper next to `realTool`                                                                                                                          | worth doing      |
| 23  | low (security) | `plugins/opt-in/headroom-trim/hooks/session.real.test.mjs:66`, `:39-48`                       | if uv dies early, teardown after the 240 s wait runs `taskkill /T /F` on the logged pid, which Windows may have reused: an unrelated process tree is killed                                                                                                                                                                 | plausible                                                                                                                                                                                     | kill only when `/health` ever answered, or check the pid is still the logged process                                                                   | worth doing      |
| 24  | low            | `docs/components/ci.md:15`                                                                    | "`scripts/test.mjs` is the one list of Node suites"; it also defines `rust` and `python` (`test.mjs:184,205`), which `crates.yml` runs                                                                                                                                                                                      | confirmed                                                                                                                                                                                     | "the one list of test suites"                                                                                                                          | worth doing      |

Dropped: 5.

- The deleted `steps/config.test.ts` cases are covered by `core/config.test.ts:64-92`.
- The headroom 5 s re-check can't give a wrong result.
- The mcp-azure README names no environment variable at all; `ADO_CAPTURE_DIR` is a developer hook documented in `mcp-azure.md`.
- `installer.md:57-62` already states the e2e's prerequisites.
- The engines README files the typing pages as hand-made, not captures.

Picks: all (1-24).

- Gate 3, review-code: report: 2026-11-27, picks all

Decided with the picks (user, 2026-11-27):

- Fix 2: write through the link when it resolves to a writable file; a read-only target gives one failure line naming the url servers, and the rest of the install goes on.
- Fix 10: accept, no code change: without the e2e the installer coverage is below 84 %, CI --strict enforces the floor, and pre-commit and release run without it.
- Fix 11: a new ci-changes `installer` output gates the Rust, codex and Chrome steps and the installer part of `real`; headroom-trim's real test still runs.
- Fix 19: rename every browser-starting test with a `real_` prefix; flake.nix keeps one `--skip real_` per package.

Fixed 2026-11-28: 1
Fixed 2026-11-28: 2
Fixed 2026-11-28: 3
Fixed 2026-11-28: 4
Fixed 2026-11-28: 5
Fixed 2026-11-28: 6
Fixed 2026-11-28: 7
Fixed 2026-11-28: 8
Fixed 2026-11-28: 9
Fixed 2026-11-28: 11
Fixed 2026-11-28: 12
Fixed 2026-11-28: 13
Fixed 2026-11-28: 14
Fixed 2026-11-28: 15
Fixed 2026-11-28: 16
Fixed 2026-11-28: 17
Fixed 2026-11-28: 18
Fixed 2026-11-28: 19
Fixed 2026-11-28: 20
Fixed 2026-11-28: 21
Fixed 2026-11-28: 22
Fixed 2026-11-28: 23
Fixed 2026-11-28: 24

Fix check (fresh agent): PASS on all 23. Two follow-ups came out of it:

- Fix 2: Azure and serena still threw on a read-only link. The user decided they each get one failure line and the step goes on (9dd29e09).
- Fix 1: `finish()` waited with no bound; it now fails after 30 s (472d7b42).

A second fresh check passed both. Left as they are:

- Fix 1's test can fail only on Linux: on Windows `tie_to_process` kills Chrome with web-mcp.
- Fix 7's part (b) is not addressed: a bind timeout on a non-resting engine can leave a daemon on Linux. The recommended fix covered resting engines only.
- The symlink test of Fix 2 skips here (EPERM) and has not run anywhere.

Also dropped as parts of kept candidates:

- `rows.rs:280`'s bound predates the branch.
- The search wall-clock bounds sit well above their deadlines.
- The harness kill test guards teardown.
- `google_no_results_is_empty` is ignored by the user's decision.
- `Domain` and other host names are already documented as unmasked.

## Tasks

- Fixes 1, 3, 5, 6, 7, 9, 13, 14, 16, 17, 18, 19 (Rust track): base 7a7d616f25c6cc72b56d4d848403bca3d71bc633, untracked at start: docs/audits/2026-11-27-review-branch.md, docs/features/integration-first-testing/
- Fixes 2, 4, 8, 11, 12, 15, 20, 21, 22, 23, 24 (Node, CI and docs track): base 7a7d616f25c6cc72b56d4d848403bca3d71bc633, untracked at start: docs/audits/2026-11-27-review-branch.md, docs/features/integration-first-testing/
- Fix 10: no code change (decided by the user)

## Rulings

- 2026-11-28, Fix 1: kept and renamed the test (`real_a_server_that_exits_after_a_search_leaves_no_chrome`) instead of deleting it — `each_session_...` runs no search, so it never covers an engine tab — one more Chrome start per run. — confirmed 2026-11-28.
- 2026-11-28, Fix 6: the retry is keyed on the follow-up's URL-load count, not the log's `typed` field (which is true even when typing misses) — a retry that can't pass when typing loads every time — the test can't say whether a run needed the retry. — confirmed 2026-11-28.
- 2026-11-28, Fix 9: added the no-results marker to Semantic Scholar's READY too — a live no-results page would otherwise wait out its deadline — untested against a live page. — confirmed 2026-11-28.
- 2026-11-28, Fix 18: exported a function `browser::test_extension(dir)` rather than a manifest constant, so the extension folder path also exists once — behind `test-support` only. — confirmed 2026-11-28.
- 2026-11-28, Fix 19: renamed the non-browser `named_token_is_sent_real_and_masked_...` to `..._sent_unmasked_...` so `--skip real_` doesn't skip it — a test name changed for the filter. — confirmed 2026-11-28.
- 2026-11-28, Fix 11: the `installer` output also turns on the Node job, so a crate-only change (e.g. `tools/ado-mcp/src/wi.rs`) now runs the Node job with the e2e on both OSes — the e2e lives in that job — more CI time on crate changes. — confirmed 2026-11-28.

## Parking lot

- `docs/components/installer.md`: "Its only other direct edit is the Azure `env_vars` allowlist" leaves out serena's `startup_timeout_sec` edit. Pick: do now (done 2026-11-28).
- `tools/installer/steps/codex.ts`: deselecting a server when `config.toml` links to a read-only file still runs `codex mcp remove`, which fails there (already true for stdio servers). Pick: follow-up.
- `tools/web/browser-core/src/browser.rs`: on Windows `session_gone` still sleeps a flat 1 s; it could wait on the `.pid` file. Pick: follow-up.
- `tools/web/web-mcp/src/fetch.rs`: the unit test context's `web-mcp-fetch-unit-*` project folder is never removed (predates the branch). Pick: follow-up.

Follow-ups picked at Decide (2026-11-28):

- flows conductors: subagent replies over ~80 lines reach the coordinator truncated; briefs should cap the reply or have it written to a file.
- web-mcp: content boundaries on the web-mcp side (agent-browser's `--content-boundaries` reaches no `--json` answer; Task 6).
- browser-core: a bind timeout on a non-resting engine can leave its daemon running on Linux (Fix 7 part b).
- web-mcp: a `browser eval` reply carries agent-browser's whole answer; a thrown non-Error reaches it only as "Evaluation error: Uncaught".

The build's ledger lines, kept here as follow-ups before its workspace is deleted (71; some are since fixed by this review: Fixes 5, 6, 9, 13, 16, 18):

- Task 2: minor (deferred): nested claude inherits the parent CLAUDE_CODE__/ANTHROPIC__ env (a set API key makes one real call)
- Task 2: minor (deferred): POSIX process.kill(-pid) group kill unverified on Linux; CI ubuntu is the first run
- Task 2: minor (deferred): pid in launcher.log could be reused between /shutdown and taskkill (ms window)
- Task 3: minor (deferred): answers file not validated (missing prompts gives a TypeError, not the path); confirm treats a string answer as false; line/secret throw synchronously; empty prompts key matches all
- Task 4: minor (deferred): e2e asserts only web-mcp in codex mcp list, not the Context7 url server the fix wrote (install.real.test.ts:195-199)
- Task 4: minor (deferred): mcpUrlServer rewrites its own table on rerun, dropping user keys such as enabled = false (core/codex.ts:81-87)
- Task 4: minor (deferred): mcpUrlServer misses headers with trailing comments or dotted/inline definitions, would append a duplicate table (core/codex.ts:78)
- Task 4: minor (deferred): installer child not killed in t.after on timeout/hang (install.real.test.ts:149-161)
- Task 4: minor (deferred): XDG_* not redirected, uv cache can land in developer folders on Linux (install.real.test.ts:139-148)
- Task 4: minor (deferred): BUILD hint and debug-binary candidate path duplicated in scripts/test.mjs and install.real.test.ts
- Task 4: minor (deferred): which('tar')! gives an opaque error when tar is missing (install.real.test.ts:90)
- Task 4: minor (deferred): e2e doesn't assert the PAT stays out of settings.json (install.real.test.ts:201)
- Task 5: missing captures (user): brave-none and google-none retried once in Task 7 (Google with consent accepted); still failing -> that none test skipped and recorded not covered; nothing hand-shaped
- Task 5: minor (deferred): #[path] include reruns the engines' inline tests in the search binary
- Task 5: minor (deferred): localise rewrites only href="http..., misses protocol-relative //host links (live fetch risk with a future capture) and moves own-host absolute links off the engine origin (parser own-host filter no longer drops them)
- Task 5: minor (deferred): test.mjs existsSync vs Rust is_file for the agent-browser path (a directory counts as found in Node, panics in Rust)
- Task 5: minor (deferred): ADR 0017 sync-PR sentence reads self-contradictory (docs/adr/0017-tests-use-the-real-thing.md:61-62)
- Task 5: minor (deferred): crates.yml agent-browser download runs even when only ado-mcp is selected
- Task 5: minor (deferred): fixtures README first sentence says every file is get html body, legend C says two are archive raw.html
- Task 5: minor (deferred): Windows process match is case-sensitive
- Task 6: minor (deferred): slow fallback's tab stays open until the page loads and the fetch spends 5 s more closing it (C1)
- Task 6: minor (deferred): non-real Mcp tests leave project/search/state temp folders (C2, pre-existing)
- Task 6: minor (deferred): real tests leave session files in the real ~/.agent-browser (C3)
- Task 6: minor (deferred): window.rs discards the first get cdp-url error; a hung owner now costs up to 3x CALL_TIMEOUT
- Task 6: minor (deferred): docs/adr/0007-one-browser-window.md:31 still says the owner relaunches a dead Chrome
- Task 6: minor (deferred): exit-closes-sessions check is vacuous on Windows (kill-on-close job); only Linux tests close_all
- Task 6: minor (deferred): fallback_session_names_include_pid and longest_session_name_stays_short have no real equivalent
- Task 6: minor (deferred): failed-open test uses a freed port (racy in principle)
- Task 6: minor (deferred): Mcp::agent_browser copies isolate()'s flags; needs a comment pointing at isolate
- Task 6: minor (deferred): C6 per-test CIM process queries cost 15-23 s each on Windows; cheaper DevToolsActivePort / WQL filter checks possible
- Task 6: decisions (user, 2026-11-25): drop both inert flags (own commit); keep the raise, recorded not covered
- Task 6: minor (deferred): C9 a pending background close is lost if web-mcp exits first; C10 daemon folder off Windows assumed
- Task 6: minor (deferred): fake agent-browser and common/mod.rs still parse the dropped flags
- Task 6: minor (deferred): browser.rs:758 comment "never ended the daemon" overstates; tests/browser.rs:121 line 124 chars
- Task 7: not covered: google-none and brave-none (retries got /sorry and ERR_ABORTED), per user decision
- Task 7: deviation (user, 2026-11-25): delete window_start_is_outside_the_engine_deadline (cannot tell its cases apart on real Chrome), recorded not covered
- Task 7: not covered: google_links_on_a_private_address_are_not_asked, a_cancelled_search_leaves_the_queue, rows_invalid_item_costs_no_page_load (no precise real test)
- Task 7: not covered: a fetch or rows tab binding while another tab hangs
- Task 7: not covered (recorded): consent_page_is_not_typed_into, since follow-up loads URL (partly), unresolved_links_clear_the_consent_mark / google_without_a_resolved_link_is_skipped_without_rest (unit only)
- Task 7: minor (deferred): bind runs outside the engine's turn and may touch a session another search is closing (plausible, unverified)
- Task 7: minor (deferred): papers test comment claims a Scholar title merge the captures don't hold (unit title_merge_skips_conflicting_dois covers it)
- Task 7: minor (deferred): rows per-host gap >= 1 s and the whitespace ratio 1.77/2 are weak timing checks; closed-port reuse possible; attach_config written on every warm search
- Task 7: decision (user, 2026-11-26): typed-captcha test ignored with its ~1% rate and evidence; class not covered; focus-race investigation is a follow-up
- Task 7: minor (deferred): a forgotten cut-short bind leaves close_all unaware of a daemon its get url may have started (tie_to_process limits it, Windows only)
- Task 7: minor (deferred): brave .captcha-wrapper is a broad marker; a no-results page carrying a hidden one would rest Brave (no Brave no-results capture to check)
- Speed slot: flaky: rows_hostile_pages_return_in_bounded_time (walk < 2x parse) failed once under load, passed 3x
- Speed slot: minor (deferred): Drop lists then reopens by PID; a recycled PID could be killed (pre-existing with taskkill); reopen once and recheck the command line on the handle
- Speed slot: minor (deferred): new lookup test does not pin the separator anchoring (root …-5 vs …-50)
- Speed slot: minor (deferred): command_line reads UNICODE_STRING after only a len==0 check; Cargo.toml stray blank line
- .target fix: flaky: archive::tests::dropped_put_leaves_no_partial_files (300 ms wait after cancel) failed once under load, passed 3x alone
- .target fix: minor (deferred): previous_owner_is_closed_first never asserts the previous owner's .target is removed (Linux-only path untested)
- .target fix: minor (deferred): no test that a failed or cut-short close keeps the .target; real test does not assert t's .target survives s's close; retire path not covered
- .target fix: minor (deferred): fake-server tests resolve the user's real ~/.agent-browser and may remove a stale same-name .target (pid reuse); moot if Task 8 drops the fake
- .target fix: minor (deferred): socket_dir and session_dir resolve the folder twice (socket_dir None on Linux without XDG); relative XDG_RUNTIME_DIR misses; Linux decoys left on assert failure
- Task 8: decision (user, 2026-11-27): accept deleting a_refused_raise_does_not_fail_the_input and owner_calls_run_in_the_search_dir_without_timeout, recorded not covered
- Task 8: minor (deferred): end_chrome reads its CDP socket with no timeout (can hang changed_url_starts_next_generation)
- Task 8: minor (deferred): hung-page test pins agent-browser holding a loading tab's close for CLOSE_TIMEOUT; front-tab test power unmeasured
- Task 8: minor (deferred): previous_owner_is_closed_first (Linux) plants a .target in the user's session dir; point r.b.session_dir at r.dir
- Task 8: minor (deferred): stale fake references browser.rs:170,173 and tests/rows.rs:237; fetch test repeats Real's cleanup without tie_to_process; session_gone test and Silent leak on failure
- Task 9: minor (deferred): one-Chrome permit is per test binary (nextest would defeat it; a test holding two sessions deadlocks silently); note it at mod.rs:257
- Task 9: minor (deferred): ERR_ABORTED cause unknown; expires_after_its_lifetime has a 2 s window (likeliest CI flake); no-browser leak checks lost the token assertion (plan-induced)
- Task 9: minor (deferred): copied lookup goes relative when HOME/USERPROFILE unset (browser-core returns None); per-process session folder left in temp; to_string_lossy on the debug hook
- Task 10: minor (deferred): POSTs to one path with different bodies overwrite one file (name hashes only the query)
- Task 10: minor (deferred): name and email first seen apart get different <n>; file names not called out for review in smoke.md; Name <x> rule misses multi-line text; %2520 and + forms unmasked
- Task 10: minor (deferred): common-word project names overmask (main, git) undocumented; DefaultHasher not stable across Rust releases; masking runs under the global lock on the runtime thread
- Task 10: minor (deferred): capture_failure_keeps_the_answer passes without the feature; Guard derives the relative path twice
- Task 10: not covered: stripping ADO_CAPTURE_DIR in the harness (would need a process-wide env in parallel tests); the stderr line's text
- Final fix wave: flaky: http-runner run::deadline_after_send_says_it_may_have_completed (700 ms deadline) failed once in a workspace run, passed 3/3 alone and twice after
- Final fix wave: minor (residual): headroom-trim CLAUDE filter drops CLAUDE_CODE_GIT_BASH_PATH (non-default Git Bash path breaks nested claude); end_chrome may return before Chrome exits after 10 s; http-runner carrier lacks // fake: marker and AGENTS.md rule omits the carrier exception
- Final fix wave: residual: rows.rs:278 /deep keeps an absolute 5 s bound (parses reached 6.5 s under load); semanticscholar module doc stale and READY likely never resolves on a real no-results page (product follow-up)
- Main merge: minor (deferred): typing pace tests lost the upper bound and the 5 s cap check; papers captcha log line not ported though semanticscholar-captcha.html exists; concurrent_lines_stay_whole copies start_real_with env and bypasses the one-Chrome permit; install.real.test does not assert serena stayed uninstalled; thrown non-Error losing its message not recorded in repo; installer.md:59 says flows is unpinned (it is serena)

## Deviations

## Skipped

- (each accepted by the user 2026-11-28)
- Linux: no check ran on Linux (CI on ubuntu-latest and windows-latest is the gate, not run yet).
- The `python` suite of `npm test` and CI itself: not run locally.

## Run verdict

Worked as a whole: yes; clean: no (2026-11-28, the user).
