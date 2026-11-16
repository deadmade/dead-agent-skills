---
flow: upgrade
phase: done
now: "Done: merged into dev."
---

# Upgrade outdated packages (2026-11-16): flow

## Request

> Lets upgrade all out of date packages pls!

Input: `outdated`. Bump list, confirmed 2026-11-16 ("All incl. marked"):

| package | area | from → to | kind |
| --- | --- | --- | --- |
| jsdom | root npm (`package.json`) | 31.0.0 → 31.0.1 | patch |
| jsdom | diagrams (`plugins/flows/skills/diagrams/package.json`) | 31.0.0 → 31.0.1 | patch |
| rmcp | Cargo workspace (`Cargo.toml`, exact pin) | 3.9.0 → 3.10.0 | minor |
| zip | Cargo workspace (exact pin) | 9.5.0 → 9.6.0 | minor |
| jsonpath-rust | Cargo workspace (exact pin) | 1.0.12 → 1.0.13 | patch |
| jiff | Cargo workspace (`0.2.38`) | 0.2.41 → 1.0.0 | **major** |
| ~25 transitive crates | `Cargo.lock` (`cargo update`) | patch/minor | patch/minor |
| headroom-ai | headroom-trim (`server/pyproject.toml`, `uv.lock`) | 0.43.1 → 0.44.0 | **major** (0.x minor) |

Also confirmed (hand pin, not a manifest): marked CDN constant in `render.mjs` 18.1.3 → 18.2.0.

## Artifacts

- [plan.md](plan.md)
- Changelogs: [jsdom 31.0.1](https://github.com/jsdom/jsdom/releases/tag/v31.0.1),
  [rmcp](https://github.com/modelcontextprotocol/rust-sdk/releases), [zip](https://github.com/zip-rs/zip2/releases),
  [jsonpath-rust](https://github.com/besok/jsonpath-rust/compare/v1.0.12...v1.0.13),
  [marked](https://github.com/markedjs/marked/releases),
  [jiff CHANGELOG](https://raw.githubusercontent.com/BurntSushi/jiff/master/CHANGELOG.md),
  [headroom v0.44.0](https://github.com/headroomlabs-ai/headroom/releases/tag/v0.44.0)

## Gates

- Gate 1, upgrade plan approved: 2026-11-16, execution: native
- Gate 2, review-code: report approved: 2026-11-16, picks: 1

## Skipped

- pstack `how` / `blast-radius`: not run; the only code change is two renames inside one crate, mapped by grep. Accepted 2026-11-16.
- Review lenses docs and risk: not run — no live doc names the old versions (`git grep`, only past audits and feature
  records); no wire format or public interface beyond the jiff renames. Accepted 2026-11-16.
- pstack `interrogate`: offered (native execution), declined by the user 2026-11-16. Accepted.
- Built-in `code-review`: not used — the tree is uncommitted; the correctness lens ran the neutral ponytail brief. Accepted 2026-11-16.

## Grounding

The break map under **Findings** is the grounding: every hit grepped (`rg "to_zoned|jiff::Zoned" tools`,
`rg jsonpath_rust tools`); headroom-trim's imports read by the research agent. No `graphify-out/` in the repo.

## Findings

Measured 2026-11-16: `npm outdated` (root workspaces, diagrams), crates.io API for each `[workspace.dependencies]` entry
(`cargo-outdated` isn't installed), `cargo update --dry-run --verbose`, PyPI for headroom-ai. `uv` isn't on PATH here.
Node is v27.0.0-alpha (npm warns about `devEngines ^26`).

### Breaking changes and their hits

- jsdom 31.0.1: `tabIndex` parsing fix only. Not used by the diagrams checker (inferred).
- rmcp 3.10.0: nothing breaking; new optional `skills-fs` feature; MSRV 1.88. Not hit.
- zip 9.6.0: nothing breaking; raw-copy fixes; MSRV 1.88. Not hit.
- jsonpath-rust 1.0.13: `Query` trait gains a required method, breaking only own `impl Query`. Not hit: http-runner
  only calls `JsonPath` / `parse_json_path` (`tools/http-runner/src/extract.rs:3-5`, verified).
- marked 18.2.0: edge-case rendering fixes (nested lists, emphasis). Diagrams pages may render such input differently
  (inferred).
- **jiff 1.0.0** (MSRV 1.85): `Zoned` → `ZonedDateTime`, `Timestamp::to_zoned` → `to_zoned_datetime` (#374);
  `Timestamp - Timestamp` returns `SignedDuration`; `ToSpan` sealed; `Timestamp` → `SystemTime` fallible. Hits
  (verified by grep): `jiff::Zoned` at `tools/web/web-mcp/src/archive.rs:107,550,663,781,890,897`, `fetch.rs:826`,
  `main.rs:52`; `.to_zoned(` at `src/papers.rs:454`, `src/engines/mod.rs:348`, `src/engines/scholar.rs:25`,
  `tests/papers.rs:311`. Other jiff uses (rfc2822, strftime, `Timestamp + Duration`) not hit per the changelog
  (inferred). Feature-set changes: none listed (unverified; the build settles it).
- **headroom-ai 0.44.0**: the one listed break is `[all]` no longer pulling torch; we use no extras.
  `compress.py` and `telemetry/session.py` are byte-identical (verified by diffing the wheels); `click>=8.5.0`.
  Compression output may shift from transform fixes, which can move `server/tests/test_trim.py:58-66` (inferred).

### Baseline

`npm test` on base `0a8dea2` (temporary worktree, measured): 7 node tests fail before any change. Symlink EPERM
(no symlink privilege on this machine): `glance.test.mjs:272`, `tools/installer/steps/codex.test.ts:282`,
`system/files.test.ts:32`, `system/harness-setup.test.ts:7` and `:35`. Also `scripts/release.test.mjs:27`
(`cargo generate-lockfile` exits 101 in its fixture) and `scripts/test.test.mjs:184` (mods command string). The
final run on the branch fails exactly these 7; repo, mods and rust suites pass, `npm run typecheck` passes.

### New requirements

- No MSRV above 1.97, no new required dependency, no licence change reported. Python stays >=3.11 (we pin 3.13).
- `uv` isn't installed here and nix doesn't run on Windows: Task 3 needs uv (`winget install astral-sh.uv`) or WSL.

## Options

## Plan review

## Tasks

Task 1: base 0a8dea21cc00aff6e35db9adf846eb8c264a4dd2, untracked at start: docs/adr/0009-hosted-search-first.md,
docs/features/opencode-search/*, docs/features/upgrade-2026-11-16/*; files clean; deviation (size 209 of ~12)
Task 2: base e908f4b264ae555574624c245e839d23c076b279, untracked at start: same as Task 1; files clean; cargo build,
test (34 results, 0 failed), clippy -D warnings, fmt --check green; deviation (size 83 of ~30)
Task 3: base 30a26cb016aaeac5e92b56a988ab1dddb6ad2542, untracked at start: same as Task 1; uv installed
(`winget install astral-sh.uv`, approved at Gate 1); `uv lock`: only headroom-ai 0.43.1 → 0.44.0 moved; server tests
`Ran 30 tests … OK (skipped=1)`; `npm test`: node suite failed, 8 tests (see Findings, **Baseline**); deviation (file:
`plugins/flows/skills/diagrams/tests/render.test.mjs`)

Fix 1: base e2de6f96bc2311613e6cb72815ab38a119de48c5, untracked at start: as Task 1 plus the audit file; files clean
(`plugins/flows/skills/diagrams/tests/render.test.mjs` only); fix check PASS

## Rulings

- 2026-11-16, Worktree: branch `upgrade-2026-11-16` made in place from `dev` (3 commits ahead of origin/main) instead
  of a worktree — a worktree needs its own cargo `target/` (AGENTS.md) and a full rebuild — if wrong: the branch
  carries dev's 3 unmerged commits into its PR base.
 confirmed 2026-11-16

## Parking lot

- `tools/harness-compiler/src/cli.ts`: shows as modified (35 lines, line endings only, mtime 2026-11-16 13:30), not
  made by this run; left out of its commits. Pick: drop.
- `scripts/release.test.mjs:27` and `scripts/test.test.mjs:184`: fail on `0a8dea2` already; worth a /fix of their own. Pick: follow-up.
- `env_logger 0.11.11` still pulls jiff 0.2: two jiff versions in the lock until it moves. Pick: drop.
- flows `/upgrade` (skill fix, via `writing-skills`): the files check's Size counts lockfile lines, so every bump task
  with a `cargo update` or a new major trips a size deviation (Tasks 1 and 2 here). Leave the package manager's
  lockfiles out of Size, as generated output already is out of Files. Pick: follow-up.

## Deviations

### Task 1 size: 209 lines against ~12

Status: decided 2026-11-16: accepted as lockfile churn; plan Task 1 Size corrected to ~210. Confirmed 2026-11-16.

The plan's `~12` counted only the manifest and constant lines (8 measured). The other ~200 are `Cargo.lock` and the
two `package-lock.json` files: 32 crates moved by `cargo update` (all patch/minor, list in the terminal output) and
jsdom's lock entries. No code changed. Options: accept as lockfile churn and correct the plan's Size to `~210`
(recommended: the content is what the gate approved); or narrow `cargo update` to the three pinned crates only and
leave the transitive crates to Dependabot.

### Task 2 size: 83 lines against ~30

Status: decided 2026-11-16: accepted; Size corrected to ~85; lockfile lines in Task 3 count as churn, not size. Confirmed 2026-11-16.

Code: 16 renamed lines in web-mcp plus 1 in `Cargo.toml` (as planned). `Cargo.lock`: 57 lines, because jiff 1.0
joins the lock beside 0.2.46, which `env_logger 0.11.11` still pulls in (measured: `cargo tree -i jiff@0.2.46`).
All cargo checks green. Options: accept, correct Size to `~85`, and count lockfile lines as churn for Task 3's
`uv.lock` too (recommended); or stop and look for an env_logger that moved to jiff 1 (none is in the lock today).

### render.test.mjs pins the old marked version

Status: decided 2026-11-16: test regex updated to `marked@18\.2\.0`; render tests 15/15 pass. Confirmed 2026-11-16; superseded by Fix 1.

`plugins/flows/skills/diagrams/tests/render.test.mjs:213` asserts `marked@18.1.3` in the rendered page, so Task 1's
constant bump fails it. The file isn't on Task 1's **Files** list. Options: change the regex to `18\.2\.0` (recommended:
the test guards the pin itself, and the bump was approved); or revert the marked bump.

## Walkthrough

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |
| jiff 1.0: `Zoned` → `ZonedDateTime` | Task 2 | `tools/web/web-mcp/src/archive.rs:107` (+5 in archive.rs, `fetch.rs:826`, `main.rs:52`) | archive unit tests in `archive.rs`; `cargo test --workspace` green |
| jiff 1.0: `to_zoned` → `to_zoned_datetime` | Task 2 | `tools/web/web-mcp/src/papers.rs:454`, `engines/mod.rs:348`, `engines/scholar.rs:25` | `tools/web/web-mcp/tests/papers.rs:308` `since_reaches_openalex_and_arxiv` |
| marked 18.2.0 pin | Task 1 (+ deviation) | `plugins/flows/skills/diagrams/scripts/render.mjs:12` | `plugins/flows/skills/diagrams/tests/render.test.mjs:208` |
| headroom-ai 0.44 (no API hit) | Task 3 | `plugins/opt-in/headroom-trim/server/pyproject.toml:5` | server `tests/test_trim.py`, `tests/test_server.py` (30 ran, OK) |

## Review

Verdict: ready. Audit: [2026-11-16-review-upgrade-2026-11-16.md](../../audits/2026-11-16-review-upgrade-2026-11-16.md).
Correctness (diffed jiff 0.2.46 against 1.0.0 source), lean and security: no findings. Fixed: 1, the CDN Mermaid is now
tied to the checker's package version in `render.test.mjs`.

## Learned

- AGENTS.md, **Checks**: the five symlink EPERM node tests on Windows without symlink rights are the machine, not the
  change; compare with the base commit first.
- Parked (below): the upgrade conductor's Size rule counts lockfile lines.

## Run verdict

2026-11-16: worked as a whole: yes; clean: yes.
