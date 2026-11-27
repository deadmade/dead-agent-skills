# Upgrade outdated packages (2026-11-16): plan

<!-- glance -->
```
Plan: Upgrade outdated packages (2026-11-16): plan · 3 tasks · ~335 lines · 18 files
 1  [1 Patch and minor bumps]
 2  [2 jiff 1.0 ←1]
 3  [3 headroom-ai 0.44 and th… ←2]

#  does                                                          files  adds         size
1  Moves jsdom, rmcp, zip, jsonpath-rust, the transitive crate…  7      nothing new  ~210
2  Moves jiff to 1.0 and follows its renames of `Zoned` and `T…  9      nothing new  ~85
3  Moves headroom-trim's server to headroom-ai 0.44.0, re-lock…  2      nothing new  ~40
```
<!-- /glance -->

**Goal:** Move every outdated package in the confirmed bump list (flow.md, **Request**) to its target, with the code
jiff 1.0 breaks fixed and every check green.

**Architecture:** Three areas move: the npm manifests (root and diagrams), the root Cargo workspace (one central
`Cargo.toml` and `Cargo.lock`) and headroom-trim's uv project. Only jiff 1.0 needs code changes (two renames in
`tools/web/web-mcp`); the rest are manifest, lockfile and constant edits.

**Tech stack:** npm, cargo (Rust 1.97 floor), uv (Python 3.13).

## Global Constraints

- Before you write: read the task and the code it touches. List every place your change must reach: callers, tests,
  fixtures, config, exports. Check what your change could break for users. That is scope. Extra features are not.
- A failed install or restore stops the task: report `NEEDS_CONTEXT` with the package manager's error.
- One implementation gets no interface; one caller gets no helper; no option nobody sets.
- Workspace dependency versions live only in the root `Cargo.toml` `[workspace.dependencies]`; keep the existing exact
  `=` pins exact (`scripts/cargo-workspace.mjs` enforces the placement).
- Run cargo from PowerShell, not Git Bash (Git Bash's `link` shadows MSVC's).
- Deprecated calls are not replaced unless a task says so.
- Stack skill: `rust-skills:rust-best-practices` (Task 2).

## Test seams

- `cargo test --workspace --locked` (web-mcp's unit and integration tests): catches a jiff rename or behaviour change
  that compiles wrong or shifts a date window; misses runtime-only drift in live search engines.
- `npm test` (`scripts/test.mjs`, check-repo, harness build, installer tests, diagrams tests): catches jsdom or marked
  breaking the diagrams checker and version/manifest drift; misses rendering differences a person would see.
- headroom-trim server tests (`uv run --locked python -m unittest discover -s tests` in
  `plugins/opt-in/headroom-trim/server`): catches headroom-ai API changes and trimming outcomes the tests assert;
  misses compression differences no test asserts.

No new tests: the bumps change no behaviour of this repository's own, and the jiff fix is a rename.

### Task 1: Patch and minor bumps

**Does:** Moves jsdom, rmcp, zip, jsonpath-rust, the transitive crates and the marked CDN constant to their latest
compatible versions.
**Depends on:** none
**Adds:** nothing new
**Size:** ~210

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `plugins/flows/skills/diagrams/package.json`
- Modify: `plugins/flows/skills/diagrams/package-lock.json`
- Modify: `plugins/flows/skills/diagrams/scripts/render.mjs`
- Modify: `Cargo.toml`
- Modify: `Cargo.lock`

**Steps:**

1. Root: `npm install --save-exact jsdom@31.0.1`.
2. Diagrams (`plugins/flows/skills/diagrams`): `npm install --save-exact jsdom@31.0.1`, then remove its
   `node_modules` if the folder didn't exist before.
3. `render.mjs:12`: `marked@18.1.3` → `marked@18.2.0`.
4. Root `Cargo.toml`: `rmcp = "=3.10.0"`, `jsonpath-rust = "=1.0.13"`, `zip = { version = "=9.6.0", … }`.
5. `cargo update` (all crates, not `--workspace`), from PowerShell.
6. Check: `cargo fetch --locked` and `npm ci` both clean; `git diff Cargo.lock` shows only version moves.

### Task 2: jiff 1.0

**Does:** Moves jiff to 1.0 and follows its renames of `Zoned` and `Timestamp::to_zoned` in web-mcp.
**Depends on:** Task 1
**Adds:** nothing new
**Size:** ~85

**Files:**

- Modify: `Cargo.toml`
- Modify: `Cargo.lock`
- Modify: `tools/web/web-mcp/src/archive.rs`
- Modify: `tools/web/web-mcp/src/fetch.rs`
- Modify: `tools/web/web-mcp/src/main.rs`
- Modify: `tools/web/web-mcp/src/papers.rs`
- Modify: `tools/web/web-mcp/src/engines/mod.rs`
- Modify: `tools/web/web-mcp/src/engines/scholar.rs`
- Modify: `tools/web/web-mcp/tests/papers.rs`

**Steps:**

1. Root `Cargo.toml`: `jiff = "1.0.0"`; `cargo update -p jiff`.
2. `jiff::Zoned` → `jiff::ZonedDateTime` at `archive.rs:107,550,663,781,890,897`, `fetch.rs:826`, `main.rs:52`.
3. `.to_zoned(` → `.to_zoned_datetime(` at `papers.rs:454`, `engines/mod.rs:348`, `engines/scholar.rs:25`,
   `tests/papers.rs:311`.
4. Whatever else `cargo build --workspace --all-targets --locked` reports from jiff 1.0 is fixed by its rename only;
   anything beyond a rename is a deviation.
5. Check: `cargo build --locked -p web-mcp --bin fake-agent-browser`, `cargo test --workspace --locked`,
   `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo fmt --all -- --check`.

### Task 3: headroom-ai 0.44 and the full suite

**Does:** Moves headroom-trim's server to headroom-ai 0.44.0, re-locks it, and runs every check in the repository.
**Depends on:** Task 2
**Adds:** nothing new
**Size:** ~40

**Files:**

- Modify: `plugins/opt-in/headroom-trim/server/pyproject.toml`
- Modify: `plugins/opt-in/headroom-trim/server/uv.lock`

**Steps:**

1. `pyproject.toml:5`: `headroom-ai==0.43.1` → `headroom-ai==0.44.0`; `uv lock` in `server/`.
2. Check: the server tests with `UV_PROJECT_ENVIRONMENT` outside the repo
   (`uv run --locked python -m unittest discover -s tests`); then the full suite: `npm test`, `npm run typecheck`,
   and Task 2's cargo checks.
