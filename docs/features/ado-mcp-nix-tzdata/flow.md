---
flow: fix
phase: done
---

# ado-mcp nix build fails without tzdata: flow

## Request

Could we fix this: I haven't fixed the ado-mcp problem, since it's outside a dependency PR. The likely fix is two lines
in flake.nix: add pkgs.tzdata to nativeCheckInputs and export TZDIR before the checks. Want it as a small separate PR?

## Artifacts

- Branch `fix-ado-mcp-nix-tzdata` (from `origin/main` c9bf39b); the change is `flake.nix`, the `ado-mcp` package's `preCheck`.
- Reproduction: `nix build .#ado-mcp -L`; the failing and passing logs are in the session scratchpad, quoted under Findings.
- Finish: the user chose "Push and create a PR" against `main` (2026-11-03).

## Gates

- 2026-11-03, Cause gate: the user approved option 1, a one-line `preCheck = "export TZDIR=${pkgs.tzdata}/share/zoneinfo";`
  in the `ado-mcp` package in `flake.nix`, with no `tzdata` in `nativeCheckInputs` (redundant: no setup hook, and the
  `${pkgs.tzdata}` reference already makes it a build input). Declined: the two-line version, jiff's `tzdb-bundle-always`,
  a POSIX-zone test.

## Skipped

## Findings

- Branch `fix-ado-mcp-nix-tzdata` from `origin/main` c9bf39b (local main lags; the previous branch's PR #110 is merged).
- Reproduction: `nix build .#ado-mcp -L` from the repo root fails in the check phase. `ado-mcp`'s 83 unit tests and
  the other bins pass; the `timetrack` bin fails 1 of 7:
  `log::tests::days_follow_the_time_zone_and_weeks_start_on_monday ... FAILED`, `panicked at src/bin/timetrack/log.rs:353:49:
called Result::unwrap() on an Err value: failed to find time zone Europe/Berlin since there is no time zone database
configured` (log: scratchpad `nix-build-1.log`).
- Why it passes locally: this NixOS host has `TZDIR=/etc/zoneinfo`, and `/etc/zoneinfo` is one of jiff's default
  directories (`/usr/share/zoneinfo`, `/usr/share/lib/zoneinfo`, `/etc/zoneinfo`; jiff-0.2.39 `tz/db/zoneinfo/enabled.rs:25`).
  The nix sandbox has none of them and `TZDIR` unset.
- Cause confirmed by a discriminating run (`unshare -Urm`, `/etc/zoneinfo` bind-mounted empty, one test via `cargo test --bin timetrack`):
  `TZDIR` unset → FAILED with the same message; `TZDIR=<nix tzdata>/share/zoneinfo` → `ok`.
- `pkgs.tzdata` (the `out` output; `nix build nixpkgs#tzdata` alone prints `-bin` and `-man`) holds `share/zoneinfo` and has
  no `nix-support`/setup hook, so nothing sets `TZDIR` for us (unlike `cacert`'s `SSL_CERT_FILE`). jiff reads `TZDIR` first
  (`enabled.rs:44`). So `tzdata` in `nativeCheckInputs` alone changes nothing; only the `TZDIR` export matters, and
  `${pkgs.tzdata}` inside it already makes tzdata a build input.
- Suspect: `crates/ado-mcp/src/bin/timetrack/log.rs:353` (`days_follow_the_time_zone_and_weeks_start_on_monday`) calls
  `TimeZone::get("Europe/Berlin").unwrap()`. That is the only named-zone lookup in ado-mcp's tests; jiff 0.2 (Cargo.toml:26,
  features `serde` only, so defaults) reads the system tz database on Linux (`TZDIR`, `/usr/share/zoneinfo`) and bundles
  one only on Windows (`tzdb-bundle-platform`). The nix build sandbox has neither.
- `ui.rs:82` uses `TimeZone::system()` at runtime, not under test.
- CI doesn't build `.#ado-mcp` with nix (`crates.yml` builds `.#flow-cockpit` only), so this is a local `nix build` failure.

## Tasks

Files: `flake.nix`.

- Task 1: base c9bf39be79c921dbb965e2c3bb0aa7621e1477b7, untracked at start: `docs/features/ado-mcp-nix-tzdata/flow.md`,
  `docs/features/symposium-evaluation/flow.md`, `docs/features/sync-new-skill-issues-missing/flow.md`,
  `docs/features/upgrade-all/{flow,plan,stale-base-flow,stale-base-plan}.md`; `files clean` (`git diff --name-only <base>`
  is `flake.nix` only; untracked set unchanged).
- Fix: `flake.nix`, `ado-mcp` package, `preCheck = "export TZDIR=${pkgs.tzdata}/share/zoneinfo";` with a two-line comment.
  `alejandra --check flake.nix` passes. `nix build .#ado-mcp -L` now exits 0: `days_follow_the_time_zone_and_weeks_start_on_monday ... ok`,
  `timetrack` 7 passed, every other test binary passed (log: scratchpad `nix-build-2.log`). The first run stopped
  at the failing `timetrack` bin, so the later test binaries had not run in the sandbox before this.

## Rulings

- 2026-11-03, Task 1: the regression test is the existing `timetrack` test, run by `nix build .#ado-mcp`'s check phase
  (already failing, output under Findings); no new test is added — the bug is the sandbox environment, not the code.
  Cost if wrong: none, the existing test covers the code path.
- 2026-11-03, Task 1: branched from `origin/main` c9bf39b (not the previous branch `installer-auto-compact-window`, whose
  PR #110 is merged) and unset the new branch's upstream so a bare `git push` can't target `origin/main` — a PR
  against `main` is what "a small separate PR" needs; cost if wrong: a rebase.
- 2026-11-03, Verify: `/self-review` and `/doc-audit` ran inline without agents, per self-review's small-diff rule (1 file,
  3 lines), and `/doc-audit` left no `docs/audits/` file because it found nothing; no AGENTS.md/README text was added
  for `TZDIR` (the comment beside `preCheck` in flake.nix is where the next person looks). Cost if wrong: a
  missing note, added later.

## Deviations

## Verify

Run on commit c9bf39b (base; the fix is uncommitted), `git status --short`: ` M flake.nix` plus the untracked docs.

- **Checks:** green. `nix build .#ado-mcp -L` exit 0 (Berlin test `ok`, every test binary passed); `npm test` exit 0, 0 failures
  (206 of 209 passed, 3 skipped, run on the final tree after the comment edit); `alejandra --check flake.nix` and
  `nix fmt -- --fail-on-change flake.nix` (0 changed); trailing newline present; no conflict markers. The comment
  edit left `.#packages.x86_64-linux.ado-mcp.outPath` identical to the built path, so the build result stands.
- **Blast radius:** `nix eval` of `drvPath` at c9bf39b and now: `tui-review`, `web-mcp`, `flow-cockpit` and
  `devShells.default` unchanged; `ado-mcp` changed (the fix); `checks.pre-commit` changed only because its
  `src = ./.` takes the whole tree. flake.nix matches only the treefmt, merge-conflict and end-of-file hooks' patterns;
  the plugin-validate and installer-test hooks don't apply to it.
- **Review (inline, small diff):** bugs: none (`${pkgs.tzdata}` is the `out` output holding `share/zoneinfo`; `preCheck`
  runs before cargo's check phase; the sandbox build proves it). Spec: matches the approved option 1; no scope creep.
  Standards: one comment line was 123 columns against its neighbours' 118–119 and said only
  `/usr/share/zoneinfo`; reworded to 119 and "system directories like". Security: an env var pointing at a read-only
  store path, nothing else. Silent failures: none (a missing `TZDIR` target makes the test fail loudly). Tests: the
  existing test went red → green; a gap outside this diff: no CI job builds `.#ado-mcp` with nix, which is why this
  went unnoticed after #96.
- **Docs:** nothing contradicted. `plugins/opt-in/mcp/mcp-azure/README.md:93` tells users to run `nix build .#ado-mcp`,
  which was false before this fix and is true now. AGENTS.md is still accurate.
- **ponytail-debt over the branch's added lines:** no `shortcut:` markers. No shortcut debt.
- **Tests (`/test-audit`):** not offered; no gaps reported for a build-config change.

## Learned

2026-11-03: `/learn` proposed a `docs/solutions/` note on the root cause (and an optional AGENTS.md sentence that
`nix build .#ado-mcp` is not in CI); the user chose to write nothing. The cause and reproduction stay in **Findings**
above and in the comment beside `preCheck` in `flake.nix`.

## Run verdict

2026-11-03, the user's: worked as a whole: yes; clean: yes.
