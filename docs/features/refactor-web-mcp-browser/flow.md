---
flow: refactor
phase: done
now: Done: PR handed over for refactor-web-mcp-browser.
---

# Refactor web-mcp's browser code: flow

## Request

/flows:refactor **Entanglement (measured, `wc` and grep):** the browser code is about 2,600 of web-mcp's 9,300 lines: `window.rs` 329, `profile.rs` 968 and `browser.rs` 1,368. `profile.rs` and `browser.rs` import search- and fetch-specific modules (`archive`, `engines`, `fetch`). A shared library means untangling those first, a refactor of working code with its own risk.

## Artifacts

- Context: [teams-mcp flow](../teams-mcp/flow.md) (picked a skill on web-mcp's `browser` tool, so no second Rust consumer exists today).
- Plan: [plan.md](plan.md); rendered page: scratchpad/refactor-web-mcp-browser.html (temporary, not kept)

## Gates

- Gate 1, plan and size: 2026-11-13, execution: subagent-driven
- Gate 2, review report: 2026-11-13 (picks: all 8)
- Gate 3, decide: 2026-11-13 (decisions a-e confirmed, skips f-i accepted)

## Skipped

- Extension download (`profile.rs:332-355`): no characterization test, no seam; not checked.
- Nix build and checks, treefmt/prettier on the new Markdown, TOML and Rust: not run (no nix here); `cargo fmt --check` ran.
- Node suite (`node scripts/test.mjs repo node`): 4 failures (3 installer symlink EPERM tests, `scripts/test.test.mjs` mods test), identical on the base `ccab8df` in a scratch worktree (measured, installer system tests 7 pass / 3 fail on both; mods test fails on both): environmental or pre-existing, not caused by this branch.
- Security lens of `/review-code`: skipped, the diff moves existing code and adds no parsing, auth or secrets.
- `pstack-picks:how`, graphify: no `graphify-out/`; grounded by reading and grep in the main session (no subagent).

## Grounding

Measured: `wc -l tools/web-mcp/src/*.rs` = 9,270 lines; `browser.rs` 1,368, `profile.rs` 968, `window.rs` 329 (2,665).

Base: commit `ccab8df`, `main`, clean except the untracked `docs/features/teams-mcp/`.

Suite on the base (measured, 2026-11-13, commit `ccab8df`): `cargo build --locked -p web-mcp --bin fake-agent-browser`, then
`cargo test -p web-mcp --locked`, run through `vcvars64.bat` (cargo needs MSVC's `link.exe` on PATH here): green, 364 passed,
3 ignored (204 unit, 29 browser, 20 fetch, 37 lookup, 1 mcp, 11 papers, 23 rows, 39 search). Clippy and fmt not run on the base.

**What the three files really import from search/fetch code** (verified, read and grep):

| edge | where | what it is |
| ---- | ----- | ---------- |
| `engines::Engine` | `profile.rs:19,112,229-385` | per-engine search state held in `Profiles`: `turns` array, `turn`, `resting`, `rest`, `consent_seen`, `set_consent_seen`, `consent_mark`; only the callers are `search.rs:152-231` |
| `engines::Engine` | `browser.rs:19,313` | `engine_session(e)` = `"search-<name>"`; one caller, `search.rs:171` |
| `profile::ENGINE_DEADLINE` | `browser.rs:20,122` | `ATTACHED_TIMEOUT = ENGINE_DEADLINE - READ_MARGIN` (8 s, a daemon-fingerprint constant); `search.rs:23` also imports it and `REST` |
| `archive::sha` | `profile.rs:42` and tests | a sha256 hex helper |
| `fetch::read_capped` | `profile.rs:347` | capped body read for the cookie-extension download; returns `FetchError` |
| `fetch::tests::{Seen, paths, reply, stub}` | `browser.rs:857` (tests only) | an HTTP stub for the tab-raise tests |
| cycle | `profile.rs:18,421` -> `browser::Browser::resolve_on`; `window.rs` <-> `browser.rs` <-> `profile.rs` | the three files already form one cycle; fine inside one module, but `profile` reaching into `browser` for a PATH lookup is a back edge |

Not an import but search/fetch-shaped API inside `browser.rs` (left as is, a rename would change the API):
`SearchRun`, `render(.., search: Option<SearchRun>, ..)`, `rendered_html`, `FETCH_PREFIX`, `fallback_deadline`.

Who uses the three files: `search.rs` (`BrowserError`, `READ_MARGIN`, `SearchRun`, `ENGINE_DEADLINE`, `REST`, `Profiles` engine methods,
`engine_session`), `rows.rs` (`BrowserError`), `fetch.rs` (the fallback's `rendered_html`; test wiring at `fetch.rs:810-827`),
`tools.rs:185` (`check_session`), `main.rs` (`Ctx`, `window::tie_to_process`).

**Thin coverage** (what moves that no test runs, from reading the tests):

- `Profiles::extension()` download path, `profile.rs:332-355` (the 2 MiB cap, the 20 s deadline, the error texts): `EXTENSION_URL` is a const and
  `https_only(true)`, so no test reaches it; `read_capped` itself is tested through `fetch`.
- Nothing else that moves is thin: `rest`/`turn`/`consent` have unit tests (`profile.rs:683-770`), `engine_session` is checked through
  `tests/search.rs`, `ATTACHED_TIMEOUT` = 8000 is asserted at `browser.rs:1067,1135` and `tests/browser.rs:90`.

## Findings

## Options

### Shape

Picked: C, a separate workspace crate, because the user's goal is "to create a separate lib so the drafted teams mcp could also use it" (their words, 2026-11-13). The untangling (the cuts below) comes first, in the same run.

Target: `browser.rs`, `window.rs` and `profile.rs` (non-test code) import nothing from `engines`, `search`, `fetch` or `archive`.
The five edges in Grounding are cut; the three files stay one module-cycle. Seams:

- search policy (engine identity, its turn, rest and consent marks, the `search-<engine>` session name, the 10 s engine deadline, the 30 min rest): resolved in `engines` and `search`; never seen by `browser`, `window` and `profile`.
- attached-call timeout (8 s, agent-browser daemon fingerprint): resolved in `browser`; never seen by `window`, `profile`, `fetch` and `rows`.
- cookie-extension download (2 MiB cap, sha-256 check): resolved in `profile` with its own helpers; never seen by `fetch` and `archive`.

Options (all three include the cuts above; each adds on the one before):

- **A. Untangle in place** (recommended). The cuts only: engine state leaves `Profiles`, search's names and deadlines leave
  `browser`/`profile`, `profile` gets two private helpers. Files: `profile.rs`, `browser.rs`, `engines/mod.rs`, `search.rs`,
  `main.rs`, `fetch.rs` (test wiring), `docs/components/web-mcp.md`. Effort: ~240 changed lines, 3 tasks. Door: two-way
  (a revert undoes it). Boundary checked by one grep.
- **B. A plus a `src/browser/` folder.** Moves the three files under `browser/` (`mod.rs`, `window.rs`, `profile.rs`) so the
  boundary is a module path. Adds `crate::profile::Profiles` -> `crate::browser::profile::Profiles` in `search.rs`, `fetch.rs`,
  `main.rs`, `rows.rs` and tests; `git mv` plus path edits, ~+60 lines and history churn. Gains a compiler-visible boundary
  but not a library.
- **C. B plus a workspace crate** (e.g. `tools/browser-core`). Needs a root `Cargo.toml` member, `pub` visibility on what is
  `pub(crate)` today, windows-sys/libc and `zip`/`reqwest` deps moved, `check_cargo_workspace.py`/`crates-build.yml`/installer
  `tools.json` touched, the test stub (`fetch::tests`) moved out of `browser.rs`, and a decision on whether the crate's API is
  public (one-way once a second consumer depends on it). Effort: several times A. No second consumer exists today: teams-mcp
  picked a skill on the existing `browser` tool.

Recommendation: A now, reason: it is the prerequisite for B and C, it is small and reversible, and no consumer needs the
library yet. Take B or C when a second consumer appears. (Inferred: no consumer, from `docs/features/teams-mcp/flow.md`
"Picked: a skill on top of web-mcp's existing `browser` tool; no new Rust code".)

### Size

Recommend: restructuring (the engine state moves between modules and the boundaries between `profile`, `browser` and
`search` change), though A is only three tasks.

Picked: restructuring (approved at Gate 1, 2026-11-13).

## Plan review

### Round 1 (fable: correctness, opus: fit, sonnet: simpler; none blocking except F1; 22 raw findings, 0 dropped, duplicates merged)

- **F1 blocking (fit):** `repo-facts.test.mjs:12-18` needs `selectChecks([], true).packages` to equal every workspace member, but `packages` = `binaries` = the three servers, so Task 5's routing fails `npm test`. Adding `browser-core` to `crates` would put it in `binaries`, which `crates-build.yml:30,60` and `crates.yml:73,83` build as a binary. Even routed, `crates.yml` fmt/clippy/MSRV use `packages`. Fix: `ci-changes.mjs` keeps `binaries` as the servers and emits `packages` = binaries plus `browser-core` when `web-mcp` is selected; `test.mjs` then needs no change. (The plan cited `ci-changes.test.mjs` as the guard; the real one is `repo-facts.test.mjs`.)
- **F2 should-fix (fit):** Task 4 can't commit green: the pre-commit `repo-node` hook runs `repo-facts` and `release.test.mjs` (a 4-member root with 3 fixture folders), and the Nix source filter lacks `tools/browser-core`. Fix: move the `ci-changes`, `release.test.mjs` and `flake.nix` edits into Task 4.
- **F3 should-fix (correctness, fit, simpler):** `with_chrome` has four `cfg(test)` sites (`profile.rs:114,138,144,252-257`); left gated, web-mcp's `fetch.rs:810` test would ignore the override and depend on the machine's browser. Options: (a) compile all four always; (b) a `test-support` feature of browser-core, enabled from web-mcp's `[dev-dependencies]`. Recommend (b): the release build and the library API stay exactly as today. Cost: one feature flag that only tests set.
- **F4 should-fix (correctness, fit):** exporting makes pedantic clippy (`-D warnings`) report what it skipped for private items: the `expect(unused_self)` on `Browser::session` and `Window::owner` go unfulfilled; `must_use_candidate`, `missing_panics_doc` likely. Fix: a Task 4 step that makes the exported API pass clippy, and narrows to `pub(crate)` whatever web-mcp doesn't use (`Window::owner`, `attach_config`, `unpack`, `EXTENSION_*`, `Ready`, `Browser::resolve` if unused). Task 4 size ~250 -> ~300.
- **F5 consider:** manifest list incomplete (`futures`; dev: `rustls` with `ring`, tokio `test-util`, `macros`); `description` can't be inherited (`[workspace.package]` has none), write it literally.
- **F6 consider:** browser-core's unit tests need `fake-agent-browser` built by `-p web-mcp`; fix the two assert messages (`browser.rs:882`, `window.rs:~161`) and say so in the doc.
- **F7 consider:** stale docs: `AGENTS.md` "three Rust packages" (:61) and "all three local package entries" (:94), `profile.rs:101-103` struct doc, `docs/solutions/click-and-press-reach-nothing-in-a-hidden-tab.md:11`, the `check_cargo_workspace.py` name (policy is `scripts/cargo-workspace.mjs`). Add to Files.
- **F8 consider (simpler):** Task 3's docs step is dead after Task 4: drop it; write the boundary line once in Task 5. Accepted.
- **F9 consider (simpler):** ADR 0016 and the component page overlap and the ADR's "what a second consumer may rely on" is speculative. Recommend: the component page only (with a short "why a crate"), no ADR.
- **F10 consider (simpler):** `Engine::session` has one caller: inline `format!("search-{}", e.name())` at `search.rs:171` (our own constraint says one caller gets no helper). Accepted.
- **F11 consider (simpler):** reword the mark seam line to "keyed by a plain name, not an `Engine`" (`profile.rs` still owns the files). Accepted.
- **F12 consider (fit):** `Profiles::{rest, resting, consent_*}(name)` now joins any string under the search folder: document "one plain path segment" in the component page; no validation added (that would be a behaviour addition).
- **F13 consider (simpler vs fit, conflict):** `release.test.mjs` second member list: simpler says only the line-51 list, fit says the root `Cargo.toml` copy needs a fourth fixture folder. Settled by running that test in Task 4; edit both only if it fails otherwise.
- **F14 consider (simpler):** keep the copied test stub (40 lines) rather than a smaller one. Accepted as planned.

User's decision (2026-11-13): apply all recommended, including F3 as the `test-support` feature. Plan edited accordingly (Task 2 now inlines the session name; Task 3 has no docs step; the scripts, release test and Nix list moved into Task 4; Task 5 is docs only, no ADR).

Fix check (fresh opus agent): F1 PASS, F2 PASS, F3 PASS (a dev-dependency feature does not reach the release build under resolver 3, inferred from cargo's rules by the checker), F4 FAIL: `Profiles::dir()` is used only by a test, so `pub(crate)` would trip `dead_code`; and Produces named types but not the methods web-mcp calls. Fixed in the plan (Produces lists the methods; a test-only item becomes `#[cfg(test)]`); also noted: the inline `crate::` paths at `fetch.rs:810-814`, `libraries` roots folded into the crate lookup so `node` stays true, `release.test.mjs` cargo fixture list needs `browser-core`. Re-check of F4 (fresh sonnet agent): PASS; it checked every web-mcp use of the three files against the Produces list and found none missing; `Profiles::dir` is the only test-only item.

## Tasks

Task 1: base ccab8df, untracked at start: docs/features/refactor-web-mcp-browser/{flow,plan}.md, docs/features/teams-mcp/{flow,prior-art}.md; files clean (5 files, diff 163 of ~150, Adds match, test edits are moved names only); commit 01508c6; task review: approved, no deviations

Task 2: base 01508c6, untracked at start: the same four docs/features files; files clean (3 files, diff 31 of ~40, Adds match, only test edit: REST -> Duration::from_mins(30)); commit fec90c6; task review: approved, no deviations

Task 3: base fec90c6, untracked at start: the same four docs/features files; files clean (1 file, diff 39 of ~45, Adds match, test edits: crate::archive::sha -> sha only; boundary grep prints nothing); commit 72687a1; task review: approved, no deviations

Task 4: base 72687a1, untracked at start: the same four docs/features files; files clean (17 paths, all on the Files list; diff 264 of ~320 with -M; Adds match: crate, workspace dep, test-support feature, libraries map); commit 2b293dc; implementer reported 6 node-suite failures it says are environmental (5 symlink EPERM, 1 test.test.mjs mods test failing on the base too): not independently reproduced; task review: approved, no deviations

Task 5: base 2b293dc, untracked at start: the same four docs/features files; files clean (4 paths, all on the Files list; diff 59 of ~70; no code); commit 4ffc9bb; node suite again 6 environmental failures reported

Task 6: base 4ffc9bb (added by the user's decision, one doc path); files clean (1 path, 1-line change); commit 2c74f51

## Rulings

- 2026-11-13, Task 3: `profile.rs` carries private copies of `archive::sha` and `fetch::read_capped` — the plan mandates them so the browser files import no fetch/archive code; the task reviewer labelled it Important (plan-mandated) — the copies can drift apart, nothing enforces equality.

## Parking lot

- `tools/web-mcp/src/profile.rs`: the doc comments on `resting`, `rest`, `consent_seen`, `set_consent_seen` still say "the engine's" (Task 1 report).

- `tools/browser-core/src/browser.rs` (`fake()` comment): says cargo builds the fake for the integration tests; true only inside a run that includes web-mcp (Task 4 review).
- `scripts/release.test.mjs:45`: the lock-version loop checks only the three servers, not browser-core (Task 4 review).
- `tools/web-mcp/src/profile.rs` (now `tools/browser-core/src/profile.rs`): doc comments on `resting`/`rest`/`consent_seen`/`set_consent_seen` still say "the engine" (Task 1).

- `docs/components/browser-core.md` (Task 5 review, Minor): `tie_to_process` does nothing off Windows (:11-12); consent marks join under the held slot, not the search folder (:141); the rustls provider is also needed for `Browser`'s raise (:139); "names none of it" means imports (:121); `Window::new` missing from the API list (:133).
- `tools/browser-core/src/browser.rs:292-297`: stale `session()` doc comment about `web-mcp-<pid>-g<n>-<name>` (Task 5 review).
- `docs/components/ci.md`: does not mention the library routing in `scripts/ci-changes.mjs` (a browser-core change selects web-mcp) (Task 5 review).

- `tools/browser-core/src/browser.rs`, `profile.rs`, `window.rs` (final review, Minor, not fixed): drop the leftover `pub(crate)` on the copied test stub (`browser.rs:853-889`); `#[must_use]` on private `Browser::resolve` and `window.rs:111` `# Panics / Never` exist only for the lint; a "copy of `fetch::read_capped` / `archive::sha`" comment on both sides of each duplicate.
- `docs/components/browser-core.md` (review): say the rustls provider is also needed for `Browser`'s raise; `tools/browser-core/src/browser.rs:292-297` stale `session()` doc comment (already stale on the base); `docs/components/ci.md` does not name the `libraries` map.
- (from /learn, a check) a script `npm test` runs that fails when a backticked repo path in `docs/` (outside `docs/features` and `docs/audits`) names no file: it must fail on `crates/web-mcp/src/profile.rs` in `docs/solutions/chrome-version-opens-a-window-on-windows.md:8` as of `ccab8df` (shown: `git grep "crates/web-mcp" ccab8df -- docs` finds it; the check itself is not built).

## Deviations

### A live doc outside Task 5's Files list names a stale path

Status: decided 2026-11-13: fix it as Task 6 (path-only doc fix, added to plan.md)

Task 5's implementer found `docs/solutions/chrome-version-opens-a-window-on-windows.md:8`, which names `crates/web-mcp/src/profile.rs` (`version()` and `pick`). The path was already wrong before this refactor (the crate folder is `tools/`, and the file is now `tools/browser-core/src/profile.rs`). The file is not on Task 5's Files list (deviation class 4). Options: (a) add it as Task 6 and fix the path; (b) leave it, Parking lot. Recommendation: (a), one line, same reason as the sibling `docs/solutions` edit.

## Walkthrough

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |
| engine state and search names leave the browser files | Tasks 1-2 | `tools/web-mcp/src/engines/mod.rs` (`Turns`), `tools/web-mcp/src/search.rs` (`search-<engine>`, `REST`, `ENGINE_DEADLINE`), `tools/browser-core/src/profile.rs` (marks keyed by name) | the suite: `cargo test --workspace --locked`, green on the base (364 passed, 3 ignored) and on the branch |
| `profile` no longer imports `fetch` or `archive` | Task 3 | `tools/browser-core/src/profile.rs` (private `sha`, `read_capped`) | boundary grep prints nothing; the extension download itself has no test |
| a separate crate | Task 4 | `tools/browser-core/src/lib.rs`, `Cargo.toml`, `scripts/ci-changes.mjs` | the suite, split across both crates |
| behaviour unchanged | all | whole branch | the suite, green before and after; final whole-branch review found no behaviour change |

## Review

`/review-code branch` (inline): verdict ready, 0 fix before merge, 8 worth doing (all low); audit file [2026-11-13-review-refactor-web-mcp-browser.md](../../audits/2026-11-13-review-refactor-web-mcp-browser.md). All 8 findings picked and fixed (fresh fix check: PASS). Checks green on ec188ae except the node suite, whose 4 failures (3 installer symlink EPERM, 1 mods test) are identical on the base.

## Learned

Nothing written to AGENTS.md, CLAUDE.md or `docs/solutions/`: the run's facts (the fourth crate, the `packages`/`binaries` split, the `test-support` feature) are already in AGENTS.md and `docs/components/browser-core.md` from Task 5, and the Windows `link.exe` trap is already in AGENTS.md. One check parked (Parking lot, last line).

## Run verdict

Decisions (confirmed 2026-11-13): a, the Task 3 duplicated `sha`/`read_capped` (a Ruling, plan-mandated): confirmed. b, the Task 6 path fix (Deviation, decided): confirmed. c, d, e (Parking lot lines above): confirmed as follow-ups, not done. No new `shortcut:` lines.
Skipped, accepted by the user: nix build/checks and treefmt/prettier; the node suite's 4 failures (identical on the base); the cookie-extension download (no test); the security lens.

worked as a whole: yes; clean: yes
