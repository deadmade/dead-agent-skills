# Upgrade all dependencies (2026-11-09) Implementation Plan

<!-- glance -->

```
Plan: Upgrade all dependencies (2026-11-09) · 3 tasks · ~809 lines · 8 files
 1  [1 Bump rmcp, zip and the …]  [2 Bump jsdom to 31.0.0 in…]
 2  [3 Bump headroom-ai to 0.4… ←1,2]

#  does                                                          files  adds                            size
1  Moves the two pinned Rust crates to their new versions and …  2      nothing new (`Cargo.lock` gai…  ~141
2  Moves jsdom, which is both the test dependency and the diag…  4      nothing new                     ~650
3  Moves the trim server's pinned headroom-ai to 0.43.1, then …  2      nothing new                     ~18
```

<!-- /glance -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every outdated dependency to the versions confirmed in `flow.md`, in one branch, with each area's lockfile following its manifest.

**Architecture:** The plan changes no code, because a trial on `origin/main` 14514365 found no breaking change that reaches this repository's code. It has three tasks, one per area: Cargo, jsdom in its two manifests, then headroom-ai, whose task also runs the full suite. It needs no pictures, because it moves version pins and adds no boundary.

**Tech Stack:** Rust (cargo, root workspace), Node 26 (npm 11), Python 3.13 (uv).

**Spec:** the bump list and break map in `docs/features/upgrade-2026-11-09/flow.md` (**Request**, **Findings**).

## Global Constraints

- Pins stay exact: `rmcp = "=3.9.0"`, `zip = { version = "=9.5.0", default-features = false }`, `"jsdom": "31.0.0"` in both manifests, `headroom-ai==0.43.1`.
- `reqwest` and `azure_core` do not move; `cargo tree -d -i reqwest` still shows one version.
- `plugins/flows/skills/diagrams/` must end with no `node_modules` folder, because its test `leaves no node_modules in the skill folder` fails on one: use `npm install --package-lock-only` there.
- A failed install or restore stops the task: report `NEEDS_CONTEXT` with the package manager's error.
- Add no interface for a single implementation, no helper for a single caller and no option that nobody sets.
- Stack skill for the Rust task: rust-skills `rust-best-practices`.
- A commit message is one sentence, with no co-author lines; stage only the task's own paths with `git add -- <paths>`.
- A new worktree's first commit fails until `nix develop` has run there once, from its root, because `.pre-commit-config.yaml` is generated and untracked.

## Test seams

- `cargo test --workspace --locked`: runs web-mcp and ado-mcp over stdio against fake servers, and `web-mcp`'s `profile::unpack` unit tests. Catches rmcp and zip API or wire breaks. Misses live upstream answers.
- `node --test "plugins/flows/skills/diagrams/tests/*.test.mjs"`: runs `check.mjs`, `render.mjs` and the produced page's clean pass under jsdom. Catches a jsdom break in parsing or in Mermaid's parser. Misses how the page looks in a browser, where Mermaid and marked come from a CDN.
- `uv run --locked python -m unittest discover -s tests`, in `plugins/opt-in/headroom-trim/server`: runs `trim.headroom_text` and `server.py`. Catches a changed `compress`, `CompressConfig`, `get_tokenizer` or telemetry hook. Misses how well real tool output compresses.

No task adds a test, because the plan changes only version pins. Tests go only through these seams.

## Review Focus

Each line is pinned by the existing test or trial it names; none needs a new test.

1. An invalid Mermaid block must still fail the checker with an `error:` line. Pinned by `plugins/flows/skills/diagrams/tests/check.test.mjs`.
2. A page holding `<script>` or `on*` handlers must still come out clean under the new parser. Pinned by `plugins/flows/skills/diagrams/tests/render.test.mjs`.
3. A zip entry that escapes the target folder must still be refused after zip's refactors. Pinned by `symlink_or_escape_entries_are_refused` in `tools/web-mcp/src/profile.rs`.
4. The headroom telemetry functions that `server.py` replaces must still exist, or the replacement silently does nothing. No test pins this, because assigning a missing attribute succeeds and the test then calls the replacement. The trial found `post_session_event` and `_post_blocking` in 0.43.1's `headroom/telemetry/session.py`; if they ever go, `guard.py` still blocks non-loopback traffic.
5. A long log must still get shorter through `compress`, and `Read` output must stay whole. Pinned by `test_headroom_trims_a_long_log` and `test_headroom_keeps_read` in `plugins/opt-in/headroom-trim/server/tests/test_trim.py`.

---

### Task 1: Bump rmcp, zip and the Cargo lock

**Does:** Moves the two pinned Rust crates to their new versions and refreshes the lockfile's other compatible versions.
**Depends on:** none
**Adds:** nothing new (`Cargo.lock` gains the transitive `constant_time_eq` 0.6.1 and `zeroize_derive` 1.5.0, and loses `bitflags` 1.3.2 and `defmt*`)
**Size:** ~141

**Files:**

- Modify: `Cargo.toml`
- Modify: `Cargo.lock`

**Interfaces:**

- Consumes: nothing
- Produces: nothing a later task reads

- [ ] **Step 1: Bump the pins** in `[workspace.dependencies]`: `rmcp = "=3.9.0"`, `zip = { version = "=9.5.0", default-features = false }`.
- [ ] **Step 2: Refresh the lock.** Run `cargo update`. Expected: `rmcp`, `rmcp-macros` and `zip` move, along with the patch refreshes listed under **Request** in `flow.md`; `reqwest` and `azure_core` do not appear.
- [ ] **Step 3: Check the restore.** Run `cargo build --workspace --locked`, then `cargo tree -d -i reqwest`. Expected: the build finishes and one `reqwest` is listed.
- [ ] **Step 4: Commit** `Cargo.toml` and `Cargo.lock` with the message `Bump rmcp to 3.9.0, zip to 9.5.0 and refresh Cargo.lock.`

### Task 2: Bump jsdom to 31.0.0 in both manifests

**Does:** Moves jsdom, which is both the test dependency and the diagrams checker's parser host, to 31.0.0.
**Depends on:** none
**Adds:** nothing new
**Size:** ~650

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `plugins/flows/skills/diagrams/package.json`
- Modify: `plugins/flows/skills/diagrams/package-lock.json`

**Interfaces:**

- Consumes: nothing
- Produces: nothing a later task reads

- [ ] **Step 1: Bump the root.** Run `npm install --save-exact --save-dev --ignore-scripts --no-audit --no-fund jsdom@31.0.0`. Expected: `npm ls jsdom --depth=0` prints `jsdom@31.0.0`.
- [ ] **Step 2: Bump the skill.** In `plugins/flows/skills/diagrams`, run `npm install --package-lock-only --save-exact --ignore-scripts --no-audit --no-fund jsdom@31.0.0`. Expected: its `package.json` says `"jsdom": "31.0.0"`, and no `node_modules` appears there.
- [ ] **Step 3: Run the batch's tests.** Run `node --test "plugins/flows/skills/diagrams/tests/*.test.mjs"`. Expected: 34 tests, 0 failures.
- [ ] **Step 4: Commit** the four files with the message `Bump jsdom to 31.0.0 in the root and the diagrams skill.`

### Task 3: Bump headroom-ai to 0.43.1 and run the full suite

**Does:** Moves the trim server's pinned headroom-ai to 0.43.1, then checks every area together.
**Depends on:** Task 1, Task 2
**Adds:** nothing new
**Size:** ~18

**Files:**

- Modify: `plugins/opt-in/headroom-trim/server/pyproject.toml`
- Modify: `plugins/opt-in/headroom-trim/server/uv.lock`

**Interfaces:**

- Consumes: the bumps of Task 1 and Task 2, through the full suite
- Produces: nothing

- [ ] **Step 1: Bump the pin** in `pyproject.toml` to `dependencies = ["headroom-ai==0.43.1"]`.
- [ ] **Step 2: Lock.** In `plugins/opt-in/headroom-trim/server`, with `UV_PROJECT_ENVIRONMENT` set to a folder outside the repository, run `uv lock`. Expected: `Updated headroom-ai v0.42.0 -> v0.43.1` and no other package.
- [ ] **Step 3: Run the batch's tests.** In the same folder, run `PYTHONDONTWRITEBYTECODE=1 uv run --locked python -m unittest discover -s tests`. Expected: 30 tests, `OK`.
- [ ] **Step 4: Commit** the two files with the message `Bump headroom-ai to 0.43.1.`
- [ ] **Step 5: Run the full suite** from the repository root: `npm test`; `npm run typecheck`; `cargo build --locked -p web-mcp --bin fake-agent-browser`; `cargo test --workspace --locked`; `cargo clippy --workspace --all-targets --locked -- -D warnings`; `cargo fmt --all -- --check`; `python3 scripts/check_cargo_workspace.py`. Expected: each exits 0.
