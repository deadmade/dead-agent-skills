# Remove timetrack Implementation Plan

<!-- glance -->

```
Plan: Remove timetrack · 2 tasks · ~2340 lines · 12 files
 1  [1 Remove the bin, its lib…]
 2  [2 Drop the repo facts tha… ←1]

#  does                                                          files  adds         size
1  Deletes the timetrack program and the work-item listing cod…  7      nothing new  ~2300
2  Removes the CI, Nix, test and doc lines that only existed f…  5      nothing new  ~40
```

<!-- /glance -->

**Goal:** Delete the `timetrack` TUI and everything only it used. The `ado-mcp` server behaves as before.

**Architecture:** One crate (`ado-mcp`) loses a bin, three library items and two dependencies; the repo facts that named the bin are dropped with it.

**Tech Stack:** Rust workspace, Node tests in `scripts/`, Nix flake.

## Global Constraints

- Behaviour doesn't change: tests that passed before still pass.
- One implementation gets no interface; one caller gets no helper; no option nobody sets.
- Test edits are limited to deleting the tests of what is deleted (see Test seams).
- Old notes under `docs/features/` and `docs/audits/` stay as history.
- Stack: Rust (`rust-skills:rust-best-practices`).

## Test seams

- `cargo test -p ado-mcp` through the MCP binary over stdio (`tests/mcp.rs` and the tool tests): catches a broken tool after the library trim; misses nothing about timetrack.
- `node --test scripts/repo-facts.test.mjs scripts/ci-changes.test.mjs`: catches a stale repo fact; misses Rust.
- No new tests: nothing new is added.

### Task 1: Remove the bin, its library API and its dependencies

**Does:** Deletes the timetrack program and the work-item listing code and crates that only it used.
**Depends on:** none
**Adds:** nothing new
**Size:** ~2300

**Files:**

- Delete: `tools/ado-mcp/src/bin/timetrack/` (all four files)
- Modify: `tools/ado-mcp/src/wi.rs`
- Modify: `tools/ado-mcp/src/lib.rs`
- Modify: `tools/ado-mcp/tests/wi.rs`
- Modify: `tools/ado-mcp/Cargo.toml`
- Modify: `Cargo.toml`
- Modify: `Cargo.lock`

- [ ] Delete the bin folder.
- [ ] In `wi.rs` delete `Ticket`, `TICKET_FIELDS`, `MINE`, `mine` and `tickets`, and any import only they used (clippy shows them).
- [ ] In `lib.rs` change the doc line to name only the MCP server and drop `pub use wi::{Ticket, mine, tickets};`.
- [ ] In `tests/wi.rs` delete `mine_spans_the_collection` (it tests `mine`); keep the fixtures other tests use.
- [ ] In `tools/ado-mcp/Cargo.toml` drop `ratatui`, `jiff` and the `# timetrack only.` comment, and the sentence "Also builds timetrack…" from `description`. In the root `Cargo.toml` drop `ratatui` (keep `jiff`).
- [ ] Rewrite `Cargo.lock` with `cargo metadata --format-version 1 > /dev/null` (no `--locked`); `git diff Cargo.lock` must only remove packages.
- [ ] Run `cargo test --locked -p ado-mcp`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo fmt --all -- --check`, `python3 scripts/check_cargo_workspace.py`.

### Task 2: Drop the repo facts that named timetrack

**Does:** Removes the CI, Nix, test and doc lines that only existed for the timetrack bin.
**Depends on:** Task 1
**Adds:** nothing new
**Size:** ~40

**Files:**

- Modify: `scripts/ci-changes.mjs`
- Modify: `scripts/ci-changes.test.mjs`
- Modify: `scripts/repo-facts.test.mjs`
- Modify: `flake.nix`
- Modify: `AGENTS.md`

- [ ] `ci-changes.mjs`: delete the `path === 'tools/ado-mcp/src/bin/timetrack/ui.rs' ||` line; `ci-changes.test.mjs`: drop that path from the `for` list at line 162.
- [ ] `repo-facts.test.mjs`: delete `OFF_PALETTE`, `uiPath` and the `[uiPath, …]` copy, keeping the installer's `view.ts` copy.
- [ ] `flake.nix`: delete the timetrack comment and the `preCheck = "export TZDIR=…"` line from `ado-mcp`.
- [ ] `AGENTS.md`: in the `tools/ado-mcp/` bullet delete the timetrack sentences (from "Its library (`lib.rs`) also backs" through the `cargo install` line) and keep the mcp-azure description; in the `tools/` bullet nothing else names it.
- [ ] Run `node --test scripts/*.test.mjs`, then `npm run build:harnesses` and `node scripts/check-repo.mjs`.
