---
flow: feature
phase: done
now: Done: PR handed over for tests-use-the-real-thing.
---

# Integration-first testing: flow

## Request

Hey, I would like to change the testing to switch from unit testing to primary integration testing. It doesnt help me
to test against mocks when my actual stuff doesnt work

## Artifacts

- Prior art: [prior-art.md](prior-art.md)

- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs: [0018](../../adr/0018-tests-use-the-real-thing.md) (0017 until the main merge, 92bf7fa8)
- Glossary: `GLOSSARY.md` **Testing** (real test, capture, replay server, fake)

## Gates

- Gate 1, spec approved: 2026-11-24 (reopened 2026-11-24 for plan review F1–F4, decided by the user)
- Gate 2, plan approved: 2026-11-24, execution: subagent-driven
- Gate 3, review-code: report: 2026-11-27, picks all (Fix 2, 10, 11, 19 options decided by the user; see the audit file)
- Gate 4, decide: decisions a–ap confirmed, Parking-lot picks taken, Skipped rows accepted: 2026-11-28

## Skipped

- pstack `how` explainer step: the main session wrote the synthesis from the two explorers instead of a fable
  explainer (not an independent check). Accepted by the user 2026-11-28.
- Linux: no check ran on Linux; CI on ubuntu-latest and windows-latest is the gate. Accepted by the user 2026-11-28.
- The `python` suite: NOT RUN locally (uv not on PATH). Accepted by the user 2026-11-28.
- CI: not run yet (the push is the user's). Accepted by the user 2026-11-28.
- Fix 2's symlink tests: skip here (EPERM, no symlink rights), so that path has not run anywhere. Accepted by the user 2026-11-28.

## Grounding

pstack `how`, complex path: two sonnet explorers (flows test guidance; this repo's own suites). The explainer
synthesis was done in the main session, below. Serena not used: the guidance is TOML/Markdown, and the suites were
surveyed by file. Glossary: no testing terms beyond "Test run" and captured-exchange fixtures (`GLOSSARY.md:292`).
No ADR on testing.

**A. Test guidance flows gives agents (every project).**

- `plugins/flows/steps/builder-brief.toml:79-82` "Tests.": failing test first, tests only through the plan's
  **Test seams**, one per behaviour, no tests of private helpers. Never mentions mock, fake, unit or integration.
  Overrides superpowers' TDD iron law (`:83`) and ponytail's self-check line (`:84`).
- `steps/plan-shape.toml:11-13`: a Test seam is "each public boundary (an exported function, a CLI, a route)". An
  exported function can be a unit seam; nothing prefers real collaborators.
- `steps/deviations.toml:17` (class 6) and `skills/review-code/references/lenses.md:43-46` (tests lens) both key off
  the seam list; the lens checks too few / too many tests, never over-mocking.
- Vendored (no hand edits; `overrides` markers only): superpowers `writing-good-tests.md:13,17-18,99-101,129-133`
  already says "exercise the real thing", mock only "slow or external", switch to integration when mock setup grows.
  But `test-driven-development/SKILL.md:314` ("Must mock everything → use dependency injection") and mattpocock
  `codebase-design` ("Accept dependencies", mockable seams) push toward injected doubles.
  `agents/pr-test-analyzer.md` is vendored too.

**B. This repo's own suites** (`scripts/test.mjs`: repo, node, mods, python, rust).

- Rust (~590 integration + ~380 inline): real server binaries over stdio (`CARGO_BIN_EXE_*`), fakes only at the
  edge: `web-mcp/tests/bin/fake_agent_browser.rs` (472 lines) for agent-browser/Chrome, a fixture HTTP server for
  Azure DevOps (`ado-mcp/tests/common/mod.rs`), `http-runner/tests/bin/fake_browser.rs`. No test runs a real
  browser; ADO's live check is a manual checklist (`docs/features/ado-mcp/smoke.md`).
- Installer (~190): `core/` pure + captured fixtures; `steps/` use injected fake IO (`steps/codex.test.ts:19-70`
  fakes the `codex` CLI); `system/` uses the real OS. Eight steps have no test (`agent-browser`, `binaries`,
  `ccstatusline`, `clean`, `dcg`, `plugins`, `settings`, `uv`). 84% line floor on the installer only.
  No test runs `install.ts` end to end; CI's "Installer package" step only checks the TTY guard.
- Real-runtime checks today: `claude plugin validate` (check-repo), `claude plugin test` (mods suite, real Claude
  Code 2.1.316 in CI). No real `codex`, browser, network or ADO in CI.
- `docs/solutions/` holds several bugs fakes missed (e.g. `click-and-press-reach-nothing-in-a-hidden-tab`,
  `chrome-version-opens-a-window-on-windows`); `docs/components/web-mcp.md:32-34` says the fake "doesn't model every
  upstream quirk".

## Prior art

[prior-art.md](prior-art.md), source check running. Four approaches: A prefer real collaborators, doubles only at
the awkward edge (Google SWE ch. 13, Fowler); B outside-in tests through the public edge (Spotify, Dodds blog);
C fakes kept honest by contract or re-recording suites that don't gate (Google, Fowler); D policy written as gates
for agents (superpowers). Gaps: web search timed out, no Anthropic or mattpocock guidance found.

## Findings

Measured 2026-11-24 on Windows 11, Claude Code 2.1.322, probe plugin in the scratchpad (`claude -p hi --plugin-dir`,
empty `CLAUDE_CONFIG_DIR`, no login):

- SessionStart hooks run without a login (`Not logged in · Please run /login`, the hook still wrote its file).
- A child the hook spawns with the launcher's win32 options (`detached: false`, `windowsHide: true`, `unref()`) is
  dead 4 s after the spawning hook exits, while claude still runs (a second hook checked `process.kill(pid, 0)`).
- The same child with `detached: true` is alive 4 s later and after claude exits.
- So the user's "started the server and instantly closed it again" matches `launcher.mjs:143`
  (`detached: process.platform !== 'win32'`). Whether a job object or the hook's console takes it down is inferred,
  not measured. The server running now (uv pid 43208) was started at 16:00:51Z by a session this probe doesn't
  explain (assumed: a host that spawns hooks differently).

Baseline 2026-11-24 on tests-use-the-real-thing at c4fb1812 (run folder, ADR 0017, glossary uncommitted), `npm ci && npm test` from Git Bash: repo passed, node failed with exactly the five known EPERM symlink tests (glance CLI symlinked folder, codex migration revalidates symlink, clean slate, theme installs atomically, theme publication), 591 of 602 pass, 6 skipped, installer line coverage 87.22 %; mods passed; python and rust NOT RUN (uv, cargo not on Git Bash's PATH). Known machine baseline (symlinks need privileges here), so the build goes on.

## Options

### Scope

Picked: this repo's own test suites; flows' agent guidance stays as it is.

- Offered: both (recommended), flows' guidance only, this repo's suites only.
- Motivating failure (user): headroom-trim "started the server and instantly closed it again". Measured 2026-11-24:
  the server is up now (`/health` → version 0.6.61; `launcher.log` last start 16:00:51Z, pid 43208 alive), so the
  failure doesn't reproduce at the moment. The launcher's tests inject fake `spawn` and `fetch`
  (`hooks/launcher.test.mjs:168-191`); nothing starts the real `launch.mjs` → uv → server and checks it survives the
  hook's exit.

### Old tests

Picked: a mock/fake test is deleted once a real test covers its behaviour; pure-logic tests that mock nothing stay.

- Offered: delete when covered (recommended), keep all and add, delete all mocked tests.

### Where the tests run

Picked: A, one gating suite in CI, real wherever CI can host it (uv trim server via the real launcher, claude and
codex CLIs, agent-browser with real Chrome on locally served pages, the installer into a temp HOME); live search
engines and the user's Azure DevOps Server replayed from captured real exchanges.

- Offered: A real + recorded (recommended); B fully live (engines and a cloud ADO org in CI); C headroom only
  (smallest, ponytail lite). User first: "would it be possible to use all in CI? Dont want two test suits"
  (rejected: CI plus a separate local live suite; local only).
- Evidence for replaying engines: Google sends even the user's home browser to `/sorry`
  (`docs/features/web-mcp-google-block/flow.md:10`, `findings.md:65`).

### How much this run covers

Picked: all four pieces in this run: the shared rule, headroom-trim launcher, installer end to end, web-mcp and
browser-core on real Chrome, http-runner's fake browser.

- Offered: rule + headroom + installer now, the rest as later runs (recommended); rule + headroom only. Verified: GitHub's Ubuntu 24.04 runner image ships Google Chrome 157 and Chromium
  ([runner-images readme](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2404-Readme.md),
  "Browsers and Drivers").

### Grill

Round 1 (2026-11-24), all six recommendations taken ("yes to all"): unpinned dcg/serena left out of the gating
test; headroom detached on Windows via `uv run --gui-script`; ADO capture mode masks identities and host, release
build, opt-in; `test.yml` builds the three Rust binaries; ADR 0017; glossary Testing section. Coverage question
settled by measurement (child-process code counts, Node 26.8.1).

### Build base

Picked (user, 2026-11-24): a fresh branch `tests-use-the-real-thing` from `main` (c4fb1812), worktree
`.worktrees/tests-use-the-real-thing`. The first run branch `integration-first-testing` was cut from
`serena-replaces-graphify` and carried 13 commits not on main; only this run's folder, ADR 0017 and the glossary
terms were carried over (uncommitted). On main graphify stands where serena stood: its CLI (`graphifyy`, no version
in `tools.json`) is the unpinned download the installer test leaves off; spec, plan and ADR say so. ADR keeps 0017
although main's next free number is 0016, because ADR 0016 is serena's on its unmerged branch.

- Offered: fresh branch from main (recommended), stack on the serena branch, wait for serena to merge.

## Plan review

### Round 1 (2026-11-24)

Reviewers: correctness (fable), fit with blast-radius (opus), simpler with ponytail-review (sonnet). 1 blocking,
~20 should-fix, ~10 consider after merging duplicates; none dropped. Merged findings (F = to decide, R = fix as
recommended):

- F1 (fit blocking, correctness 2/3, fit 8): deleting the step tests drops installer coverage to 73.43 % (measured)
  wherever the e2e test skips: the pre-commit hook and release.yml run `test.mjs repo node`; and the hook would run
  the e2e (Chrome 205 MB download) on every commit.
- F2 (correctness 4): `agent-browser install` fetches the current Chrome for Testing (measured: 158.0.8127.88), not a
  pinned one.
- F3 (correctness 5): `tests/fixtures/search/*.html` are hand-written 0.5–0.8 kB stubs, not captures.
- F4 (fit 2): the Nix packages' `cargo test` (`flake.nix:118-122,154-158`, sandbox, no network or Chrome) would run
  the real-browser tests.
- R1 (correctness 1, fit 4): the installer e2e would POST /shutdown to the developer's trim server on 47811.
- R2 (correctness 6, fit 9): `<base>/<engine><path>` breaks root-path logic (`/sorry`, `/goto`); per-engine origin.
- R3 (correctness 7): Codex config.toml holds only `env_vars`, not the Azure URL.
- R4 (correctness 8, fit 3): uv isn't on PATH on this machine (only `~/.claude/bin/uv.exe`); `realTool` needs
  candidate paths (also for `target/debug` binaries) and a `.d.mts` for the `.ts` importer (TS7016 measured).
- R5 (correctness 9): `realTool`'s non-strict test fails under CI's `--strict`; strict becomes a parameter.
- R6 (correctness 10): http-runner needs a real program that exits non-zero for the "no browser opened" branch.
- R7 (correctness 11, fit 10): capture in `Guard` and `exec`, file name path + query hash, two-pass identity masking
  incl. path segments and id GUIDs, non-JSON bodies host-masked.
- R8 (fit 5): the rust suite's agent-browser check only when web-mcp, browser-core or http-runner is selected; honour
  `CLAUDE_CONFIG_DIR`; `scripts/test.test.mjs` into Task 5's Files.
- R9 (fit 6): Task 5 adds `Mcp::start_real`, the default switches in Task 8; Tasks 6 and 7 run one after the other.
- R10 (fit 7): route `tools/installer/assets/tools.json` changes to web-mcp and http-runner in `ci-changes.mjs`;
  sync PRs bypassing tests stays as today, recorded in the ADR.
- R11 (simpler 1): one real test per behaviour class in Tasks 6–7, the rest deleted as covered.
- R12 (simpler 2): browser-core's test helper is the one Rust agent-browser lookup; web-mcp's tests call it.
- R13 (simpler 3): one env var; the answers JSON also carries the marketplace dir and release URL.
- R14 (simpler 4): drop the second install run.
- R15 (simpler 5): a minimal valid extension manifest, no download.
- R16 consider: keep the `HTTP_RUNNER_OPEN` newline split (fit cleared it); drop the server.log assertion (pythonw
  output measured fine); `shell: pwsh` for cargo in test.yml; rig `Drop` closes its agent-browser session; kill the
  launcher-logged uv pid if `/health` never answers; name the exact `ToolIo`/`CodexIO` fields removed; check
  `claude -p` hooks on CI's pinned 2.1.316 or bump the pin.

Decided (user): F1 own `real` suite; F2 named exception (Chrome for Testing unpinned, CI caches it by version);
F3 capture the engine pages in Task 5; F4 skip the real-browser tests in Nix. R1–R16 fixed as recommended. The spec
took F1–F4 (section **Decided in plan review**); Gate 1 reopened for those items only.

Fix check 1 (sonnet): 17 PASS, 3 FAIL. F2: test.yml had no Chrome cache and spec Goal 4 still called
`agent-browser install` pinned. F3: the plan re-captured pages already captured in `tests/fixtures/engines/`, under
the wrong names, and overwrote the fake's stubs. R9: Task 8's switch reached `fetch.rs`/`lookup.rs`, which no task
listed. Plus: `needsTrees` lacked `real`, crates.yml's fake comment, `launcher.log`'s location.

### Round 2, fresh eyes (2026-11-24)

Reviewers: opus and fable, angle "could you build this from the plan alone?". 0 blocking; merged should-fix:
`real` suite builds no trees; answers read once vs. tests in one process; stubs replaced under the fake; route match
by path + query and Google's `/goto`; captures' scripts reach engine hosts and the own-host filter moves with the
page; one missing tool hid the whole `real` suite (no Codex here); `Mcp::start` real everywhere breaks Nix and
non-browser tests; Chrome downloaded into every temp HOME; `Mcp` `Drop` leaks Chrome. Consider: `launcher.log` in
`CLAUDE_PLUGIN_DATA`, `claude -p` exits 1 without login, measure coverage before deleting step tests, test.yml
needs `rustup update`, Task 10 names come from paths and answers, Ubuntu AppArmor sandbox, Git Bash tar writes no zip,
core→system import, step reading a test variable, `--each-package` runs real-Chrome tests twice (left as is).
None dropped.

Changed (my calls, fixes as the reviewers recommended): all of the above folded in; Task 4 gains Step 0 (install
Codex CLI 0.172.0 on this machine, for Gate 2); the existing `tests/fixtures/engines/` captures are used, only
missing variants captured; engine pages served with a no-script CSP and one test that real-Chrome rows equal the
parser's rows; `Mcp::start` starts no browser, `start_real` stays; `real` suite split into two commands;
`core/answers.ts` read per call; `addsOfficialMarketplace()` in core. Spec Goals 4 and 5 reworded for F2/F3 only.

Fix check 2 (sonnet): all round-1 FAILs and round-2 items PASS. Broken neighbours, fixed: web-mcp's `src/fetch.rs`
inline tests missing from the Nix skip list; semanticscholar has no results capture (added to the capture list);
Tasks sharing files had no order (Global Constraint: tasks run one at a time, in number order); `pinMarketplace`
would pin the GitHub source over a local marketplace (`marketplaceSource()` follows the answers file). Not re-checked
after these four one-line fixes. No blocking finding in round 2, so no further fresh-eyes round.

## Tasks

- Task 1: base 53f53150f6721479caffc072891060b75da3221e (untracked at start: docs/adr/0017-tests-use-the-real-thing.md, docs/features/integration-first-testing/); commit 19e219f8; files clean; review clean
- Task 2: base 19e219f808b6f632a095173beb0e3f43ba552e15 (untracked at start: docs/features/integration-first-testing/); commits 5a7932bc, 4e059181; files clean; review clean after 1 fix round. Windows: session.real.test.mjs failed before the fix (no /health within 240 s) and passed after it (10-20 s); also passes with CI pin 2.1.316, so the pin stays. Linux: not measured locally, CI ubuntu is the first run.
- Task 3: base 4e059181 (untracked at start: docs/features/integration-first-testing/); commits 6c41d9f6, 8e82077d; files: deviation (2, user removed both); review clean after 1 fix round. Measured: a local marketplace add writes {source: directory, path: <native dir>}.
- Task 4: base 8e82077d (untracked at start: docs/features/integration-first-testing/); commit 6b06a2d5; files: deviation (core/codex.ts + test, user-approved; modules.test.ts needed no change); size 467 insertions of ~300 plus 347 mandated deletions; review clean, 8 minors deferred to the final review. Removed injected-IO fields: ToolIo ask, version; collectConfig services (claude, line, secret, log) and defaults; CodexIO confirm, download, browser. e2e passes on Windows for both CLIs (55.7 s with seeded Chrome, 71 s cold); installer coverage 93.36 % (90.79 % without the step tests); CI timeout 30 to 45 min from local numbers, CI to confirm.
- Task 5: base 6b06a2d5 (untracked at start: docs/features/integration-first-testing/); commits f423c78c, efad88b4; files: deviations D1, D2, D4 and size (586 of 2x260, from D2), all decided by the user; review clean after 1 fix round (process match anchored on the root folder). Real tests: google, the rows parity for 4 engines, the drop test, all passing on Windows; web-mcp makes no outside connections in them (sampled Get-NetTCPConnection). Unverified until CI: crates.yml, xvfb, AppArmor, flake.nix.
- Task 6: base efad88b4 (untracked at start: docs/features/integration-first-testing/); commits 5d5f0a1d (dead-Chrome relaunch), 4427e6c3 (tests), 53db5a78 (slow-fallback session close), 62602352, 50467cdd (inert flags dropped), cb795f0b (background close only for fetch keys); files: deviations decided by the user (window.rs, browser-core fixes, flags); size 451 insertions of 2x500; review clean after 2 fix rounds. fetch.rs unchanged (no browser-fallback tests). Kept real tests: each_session_reads_its_own_tab_and_exit_closes_them, input_reaches_a_hidden_tab_despite_a_proxy, a_closed_tab_is_replaced_and_closing_it_again_is_no_error, a_dead_chrome_is_replaced_on_the_next_action, a_slow_page_ends_the_fallback_at_its_deadline_and_closes_its_tab, an_open_chrome_cannot_load_is_a_tool_error, a_screenshot_is_a_jpeg_and_archived, an_app_shell_is_rendered_archived_and_cached. Deleted as covered: open_passes_session_json_and_limits, two_sessions_stay_separate, longest_session_name_stays_short, browser_starts_no_window_until_used, opened_sessions_are_closed_on_shutdown_unless_closed, click_and_press_raise_the_tab_first, the_raise_ignores_a_proxy_in_the_environment, dash_leading_text_is_passed_as_text, eval_never_starts_with_dash, gone_tab_is_rebound_once, closing_a_gone_tab_opens_none, a_rebound_tab_is_raised_before_the_retry, dead_chrome_is_replaced_mid_call, slow_fallback_still_closes_its_session, failed_action_is_tool_error, screenshot_is_jpeg_image_and_archived, rendered_page_is_archived_and_cached, app_shell_falls_back_to_browser, parallel_fallbacks_use_separate_sessions, fallback_session_names_include_pid, fallback_batch_has_no_output_limits; deleted with no real trigger: screenshot_temp_removed_on_failure. Not covered: the tab raise (input reaches a hidden tab on Chrome for Testing 158 without it).
- Task 7: base cb795f0b (untracked at start: docs/features/integration-first-testing/); commits 29db0efa (READY semicolons), 795d9ec4 (bind before navigation), 770a0809 (tests), ca4a771c (failed bind forgotten), a7eaf074 (Brave bot check), e2147a55 (tests); files: deviations (READY, bind, Brave, window start, typed test), all decided by the user; size 796 insertions of 2x450 before the fix rounds, incl. user-decided product commits; review clean after 2 fix rounds. Deleted fake tests: the class table in .superpowers/sdd/plan/task-7-report.md (search, rows, papers; about 50). Not covered: Google and Brave no-results, window start, google_links_on_a_private_address_are_not_asked, a_cancelled_search_leaves_the_queue, rows_invalid_item_costs_no_page_load, consent typing, the since follow-up (partly), unresolved Google links (unit only), a fetch or rows tab binding behind a hanging page, a typed follow-up meeting a block (test ignored, ~1% flaky). Final workspace run: exit 101 on two tests outside Task 7 (dead-Chrome kill under the WMI hang; ado-mcp view_concurrent timing, passes alone).
- Speed slot (between Tasks 7 and 8, user-decided): commits 46243797 (process lookup and kill without WMI, session files in each test folder), 877fb446 (that folder on Windows only), debb9fa6 (browser-core removes its closed sessions' .target); reviews clean, 1 fix round; browser suite 1580 s -> 59 s, web-mcp full ~330 s. Not run: Linux.
- Task 8: base debb9fa6 (untracked at start: docs/features/integration-first-testing/); commit 2a24ef47; files clean; size 499 insertions of 2x400 plus 546 mandated deletions; review clean. The fake agent-browser, its [[bin]], tests/fixtures/search/ and its build step are gone; no Mcp::start test needed start_real. Not covered (user decision): a refused tab raise, the owner calls' working folder and missing timeout. Not run here: Linux paths (previous_owner_is_closed_first), npm test's python suite.
- Task 9: base 2a24ef47 (untracked at start: docs/features/integration-first-testing/); commit f62a5bf1; files clean; size 401 insertions of 2x250; review clean. Tests 14+55+8 -> 13+54+8 on the real rig; deleted or merged: login_page saves_typed_values_for_the_host (merged into a_real_browser_submits_the_login_form), served_policy_is_same_origin (covered by behaviour: Origin null gets 403), unconfirmed_host_is_not_sent, the mcp saved case (into run_through_the_tool). Tests run one Chrome at a time per binary (intermittent net::ERR_ABORTED under parallel load, cause unknown). Not run here: Linux, the nix build.
- Task 10: base f62a5bf1 (untracked at start: docs/features/integration-first-testing/); commits 23e1356d, 261b37b0; files: deviation (tools/ado-mcp/tests/common/mod.rs, user-approved); size ~708 insertions of 2x200, user-accepted; review clean after 1 fix round. Not masked (documented): names only in free text, team/wiki/pipeline/branch names, hosts other than ADO_ORG_URL's. Not covered: the harness stripping ADO_CAPTURE_DIR, the stderr line's text.

## Rulings

- 2026-11-24, Task 4: Task 4 updates Task 1's real-suite test to the two-command shape — Task 4 Step 4 mandates the split — a stale assertion fails loudly if missed. — confirmed 2026-11-28.
- 2026-11-24, Task 5: the implementer writes the new engine captures and reports before committing them; the user reviews them, then the commit — plan Step 1 says the user reviews new captures first — one extra round trip. — confirmed 2026-11-28.

## Parking lot

- flows conductors (skill fix, via `writing-skills`): long subagent hand-backs arrive truncated; briefs should cap the reply length or have the report written to a file and the reply point at it. Pick: follow-up.

## Deviations

- Task 3 (6c41d9f6): an exported `Answers` type in core/answers.ts and an optional `local` parameter on `marketplaceSource()`, neither named by the plan nor needed. Decided by the user 2026-11-24: remove both. — confirmed 2026-11-28.
- Task 4: on a fresh CODEX_HOME, `codex mcp add <name> --url <context7>` starts an OAuth sign-in, times out after 301 s and exits 1 (measured, Codex 0.172.0), so every Codex install failed and a rerun refused the leftover server. Decided by the user 2026-11-24: the installer writes url servers (Context7, atlassian, mcp-github) into config.toml directly through a new core/codex.ts function with its test; `codex mcp add` stays for stdio servers; sign-in stays opt-in via `codex mcp login`. — confirmed 2026-11-28.
- Task 4: steps/codex.test.ts keeps the ~10 tests whose behaviour one fresh run cannot reach (reruns, upgrades, foreign configs, darwin, cancellation, migrations), each with a `// fake:` line. Decided by the user 2026-11-24. — confirmed 2026-11-28.
- Task 5 D1: the plan has Google's /goto 302 to the url parameter, but that is an opaque token; each link redirects to a stand-in at 127.0.0.2/<token>. Accepted by the user 2026-11-24. — confirmed 2026-11-28.
- Task 5 D2: searches through real Chrome fetched the captured pages' top 5 result URLs from live sites, against the network rule. Decided by the user 2026-11-24: the fixture server rewrites result links to local stand-ins on 127.0.0.2 when serving; capture files and product code untouched. — confirmed 2026-11-28.
- Task 5 D4: the rows-vs-parser test covers google, bing, duckduckgo and brave, not the paper engines (their records carry no URL and merge with live APIs). Accepted by the user 2026-11-24. — confirmed 2026-11-28.
- Task 5: brave-none.html and google-none.html could not be captured (bot check; consent timeout). Decided by the user 2026-11-24: Task 7 retries each once (Google with consent accepted); one that still fails leaves that none test skipped and recorded as not covered; nothing hand-shaped. — confirmed 2026-11-28.
- Task 5 captures (semanticscholar.html, semanticscholar-none.html, brave-captcha.html with country and geoLocation blanked) reviewed and approved by the user 2026-11-24 (ruling 2). — confirmed 2026-11-28.
- Task 5 size: 586 insertions without the captures, against 2x ~260; 484 before D2, the rest is D2's link rewrite, all test-harness code. Accepted by the user 2026-11-25. — confirmed 2026-11-28.
- Task 6: the real dead-Chrome test showed that agent-browser 0.43.0 never relaunches a dead Chrome (get cdp-url answers "Browser not launched"), so web-mcp failed every later browser, search, rows and fetch-fallback call until it restarted. Decided by the user 2026-11-25: fix it in browser-core window.rs (Window::live sends open about:blank and asks again once). — confirmed 2026-11-28.
- Task 6 review: a slow browser fallback never closes its agent-browser session (the 5 s close timeout drops the close after the session left the exit list), leaking a daemon per slow fallback; the deleted fake test hid it. Decided by the user 2026-11-25: fix it now in browser-core, with a real failing-first assertion. — confirmed 2026-11-28.
- Task 6 fix round: --content-boundaries and --max-output reach no browser answer under --json (agent-browser 0.43.0 puts the marker in a _boundary field browser-core drops). Decided by the user 2026-11-25: drop both flags; web-mcp-side boundaries go to the parking lot. — confirmed 2026-11-28.
- Task 6 fix round: the tab raise before click/press proved unneeded on headed Chrome for Testing 158 with agent-browser 0.43.0 (both mutations survived). Decided by the user 2026-11-25: keep it, recorded as not covered. — confirmed 2026-11-28.
- Task 7: agent-browser 0.43.0's wait --fn never resolves an expression ending in ;. All six engines' READY constants end in ); and the URL-load path passes them unchanged, so every live search lost about 8 s per engine (one-engine search 8.3-10.6 s, 0.23-2.6 s with the fix) and Google's link walk got the last second (the C11 flake). Decided by the user 2026-11-25: drop the semicolons from the constants in their own commit, with the constants' test asserting it. — confirmed 2026-11-28.
- Task 7: on the first search in a fresh window, an engine whose page hangs holds up the other engines (Bing plus a 30 s Brave: both timed out; warm sessions and offline engines are fine). Decided by the user 2026-11-25: fix the product now, before Task 7 commits. — confirmed 2026-11-28.
- Task 7: window_start_is_outside_the_engine_deadline cannot tell a first Chrome start inside the deadline from one outside it on real Chrome (agent-browser's 8 s open limits the page delay; starts measured 2.0-4.5 s). Decided by the user 2026-11-25: delete it, recorded as not covered. — confirmed 2026-11-28.
- Task 7 (cause measured): inside agent-browser, a session's first --cdp call (binding its tab) waits while any other tab is still loading. Decided by the user 2026-11-25: a new browser-core bind(keys) binds the engine tabs not yet bound, each within 2 s, before any engine navigates; called from search and papers. A fetch or rows tab binding while another tab hangs stays not covered. — confirmed 2026-11-28.
- Task 7 fix round: a typed follow-up search sometimes types but never submits inside web-mcp's window (2 of 9 runs; 70 of 70 outside it) and falls back to a URL load. Decided by the user 2026-11-26: investigate and fix now, before Task 7 commits. — confirmed 2026-11-28.
- Task 7 fix round: Brave's real bot-check page parses as unrecognised, so Brave never rests on it. Decided by the user 2026-11-26: fix the parser now, in its own commit, with the capture as its test. — confirmed 2026-11-28.
- Task 7 fix round 2: the typed-search flake is about 1% (3 of ~140); click and keys miss the box, suspected focus race after the raise, unproven. Decided by the user 2026-11-26: the typed-captcha test is ignored with its rate and evidence, the class recorded not covered, the investigation a follow-up. — confirmed 2026-11-28.
- Before Task 8 (measured 2026-11-26/27): every real web-mcp test lists processes at teardown through WMI (Get-CimInstance), which on this machine takes 60-120 s (tasklist and taskkill time out too; Get-Process takes 1.5 s), so suites run 3-4x slower (search 1777-2127 s against ~600 s) and kill_chrome fails; ~/.agent-browser keeps ~1800 .target and 139 stale daemon file sets (the 1.4 GB is three Chrome builds). Decided by the user 2026-11-27: a speed slot before Task 8 that finds and kills test processes without WMI and stops the tests leaving session files. — confirmed 2026-11-28.
- Speed slot (measured): web-mcp in normal use leaves one .target file per agent-browser session in agent-browser's runtime folder after a clean exit (agent-browser's close removes the rest; ~1800 piled up). Decided by the user 2026-11-27: fix it now in browser-core, in its own commit with a real test, before Task 8. — confirmed 2026-11-28.
- Task 8: a_refused_raise_does_not_fail_the_input (real Chrome never refuses a raise) and owner_calls_run_in_the_search_dir_without_timeout (no visible effect on real agent-browser) were deleted with no real test covering them; the plan said rewrite to the outcome. Decided by the user 2026-11-27: accept the deletions, recorded not covered. — confirmed 2026-11-28.
- Task 10: the brief leaves open what a failed capture write does and what happens to a non-UTF-8 body. Decided by the user 2026-11-27: a failed write prints one stderr line (file and OS error, never the body) and the caller's answer is unchanged; a non-UTF-8 body is not written. — confirmed 2026-11-28.
- Task 10: size ~710 insertions against ~200 (limit 400), from masking rules real answers need beyond the brief's list (`Name <DOMAIN\user>` strings, git authors, double percent-encoding, properties.Mail, html/xml bodies). Decided by the user 2026-11-27: accept as is, one commit. — confirmed 2026-11-28.
- Task 10 review: the tests inherit ADO_CAPTURE_DIR from the shell and could overwrite reviewed captures; the fix is in tools/ado-mcp/tests/common/mod.rs, not on the Files list. Decided by the user 2026-11-27: add the file and strip the variable there, plus a smoke step that unsets it after capturing. — confirmed 2026-11-28.
- Before Phase 7 (verified 2026-11-27): main moved 9 commits past c4fb1812 (to 530b65d6); #189 changes 34 of this branch's files, takes ADR 0017 and fixes the same READY semicolon. Decided by the user 2026-11-27: after the final review's fix wave, merge main into the branch (one merge commit), renumber this branch's ADR to 0018, port #189's new fake-based tests to the real rig, then a scoped review and full test run before Phase 7. — confirmed 2026-11-28.

## Walkthrough

| goal                                                                                                   | plan task              | file:line                                                                                                                                                                               | test                                                                                                        |
| ------------------------------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1 One rule in AGENTS.md; missing tool fails under --strict, NOT RUN locally                            | 1                      | `AGENTS.md:123`, `docs/adr/0018-tests-use-the-real-thing.md`, `scripts/test.mjs:90` (`realTool`)                                                                                        | `scripts/test.test.mjs` (realTool strict/skip)                                                              |
| 2 One suite gating CI on ubuntu and windows; slow Node tests in a `real` suite with the coverage floor | 1, 2, 4, final fix     | `scripts/test.mjs:14,114`, `.github/workflows/test.yml:24`, `.github/workflows/crates.yml` (per-package `--no-run`, 7481f168)                                                           | `scripts/test.test.mjs`; CI not yet run on this branch                                                      |
| 3 headroom-trim through real Claude Code; server outlives the hook on Windows, no window               | 2                      | `plugins/opt-in/headroom-trim/hooks/launcher.mjs:71-80` (`--gui-script`)                                                                                                                | `plugins/opt-in/headroom-trim/hooks/session.real.test.mjs:50`                                               |
| 4 Installer end to end, unattended, fresh homes, real claude and codex                                 | 3, 4                   | `tools/installer/system/ui.ts` + `core/answers` (DEAD_SKILLS_TEST_ANSWERS), local release; `core/codex.ts` url servers in config.toml                                                   | `tools/installer/install.real.test.ts:36`                                                                   |
| 5 web-mcp and browser-core on real agent-browser and Chrome against captured engine pages              | 5, 6, 7, 8, speed slot | `tools/web/web-mcp/src/engines/mod.rs:135` (WEB_MCP_TEST_ENGINES), `tests/common/mod.rs:566` (`start_real`), `browser-core/src/browser.rs:379` (`bind`), `:1007` (`real_agent_browser`) | `tests/search.rs:234,454`, `tests/browser.rs:185,306`, browser-core `bind_tries_a_failed_tab_again` (:1494) |
| 6 http-runner login page in real Chrome; carrier stays local                                           | 9                      | `tools/http-runner/src/tools.rs:45` (newline split, debug-only)                                                                                                                         | `tools/http-runner/tests/login_page.rs:111`                                                                 |
| 7 ado-mcp opt-in masked capture                                                                        | 10                     | `tools/ado-mcp/src/api.rs:594-596` (`ADO_CAPTURE_DIR`)                                                                                                                                  | `tools/ado-mcp/tests/api.rs:582` (`capture_writes_masked_answers`)                                          |
| 8 Fake-injecting tests deleted once real tests cover them; pure-logic tests stay                       | 2-10, main merge       | fake agent-browser and fake-browser deleted (2a24ef47, f62a5bf1); class tables in `.superpowers/sdd/plan/task-{5..9}-report.md`                                                         | covered per class table; not-covered lists in **Tasks**                                                     |
| (no goal) product fixes found by the real tests                                                        | 2, 4, 6, 7, speed slot | dead-Chrome relaunch, slow-fallback close, background close for fetch keys, inert flags, READY `;`, bind, Brave bot check, `.target` removal                                            | each recorded under **Deviations**, decided by the user                                                     |

## Review

- Verdict: 4 to fix before merge (24 findings, 5 dropped); audit: [2026-11-27-review-branch.md](../../audits/2026-11-27-review-branch.md). Picks: all.
- Fixed 2026-11-28: all 23 picked fixes (Fix 10 accepted with no change), 15 commits 0bfaf2a9..9dd29e09 and 472d7b42, plus the uncommitted AGENTS.md `real_` line; fix check PASS on all, two follow-ups decided by the user and re-checked PASS. Rulings and Parking-lot lines from the fixes are in the audit file.

## Learned

- Memory: `windows-wmi-hangs.md` (WMI, tasklist, taskkill /FI and ps -W hang on this machine; use Get-Process).
- Parking lot: flows conductors: a subagent reply over ~80 lines reaches the coordinator truncated ("[N lines omitted]"), which cost two resends this run; builder and checker briefs should cap the reply or have it written to a file.
- AGENTS.md: the `real_` test-name rule (Fix 19), written during the fixes.

## Run verdict

Worked as a whole: yes; clean: no (2026-11-28, the user).
