---
flow: refactor
phase: finish
now: Waiting for you: pick how the branch ends.
---

# Remove timetrack: flow

## Request

Hey, lets remove the timetracker. I rarly use it anymore

## Artifacts

- Plan: [plan.md](plan.md)

## Gates

- Gate 1, plan (size local): 2026-11-09, execution: native
- Gate 2, review-code report: 2026-11-09, Picks: 1,2
- Gate 3, decisions: 2026-11-09, all confirmed, skipped rows accepted

## Skipped

- Copyedit of the plan and of the audit report: not run, both are short lists.
- Review verify agent and the fresh fix-check agent: not run. The two findings were checked by command in the main session, and the fixes by clippy, fmt and the ado-mcp tests; no independent check of the fixes.
- Review: security lens and built-in `code-review` not used (reasons in the audit file).
- `cargo test` for web-mcp and `nix flake check`: not run.

All rows above accepted by the user, 2026-11-09.

## Grounding

- Base: `main` at 0fad597b (origin/main is the same commit).
- timetrack is the `tools/ado-mcp/src/bin/timetrack/` bin (`main.rs`, `ui.rs`, `log.rs`, `claude.rs`, 1881 lines), a personal Windows TUI. Not released, not installed by the installer (`AGENTS.md:43-51`).
- It is the only user of two things in the `ado-mcp` library: `Ticket`, `mine`, `tickets` (`tools/ado-mcp/src/wi.rs:551-612`, re-exported at `lib.rs:20`), and the crates `ratatui` and `jiff` in `tools/ado-mcp/Cargo.toml:25-26`. `ratatui` is declared once, in the root `Cargo.toml:31`; `jiff` stays (web-mcp uses it). `batch` and `field` in `wi.rs` are shared with the MCP tools.
- Tied to it elsewhere: `tools/ado-mcp/tests/wi.rs:516` (`mine_spans_the_collection`), `flake.nix:151-153` (`TZDIR` for timetrack's Europe/Berlin test), `scripts/ci-changes.mjs:29` and its test (`ci-changes.test.mjs:162`), `scripts/repo-facts.test.mjs` (palette check of `ui.rs`, and `OFF_PALETTE` that only `ui.rs` needs), `AGENTS.md:43-51`, the `Cargo.toml` description, `Cargo.lock`. Old flow and audit notes mention it as history and stay.
- Base suite (measured): `cargo test --locked -p ado-mcp` green (83 + 7 + 21 + 17 + 15 + 1 + 7 + 28 + 46 + 23 + 30 + 14 tests; the 7 in the `timetrack` bin are among them), and `node --test scripts/repo-facts.test.mjs scripts/ci-changes.test.mjs` 22 of 22. Not run: the rest of `npm test`, web-mcp and installer tests; nothing in the plan touches them except `Cargo.lock`/`Cargo.toml`, which `cargo test --workspace` and `check-repo` will cover after the change.
- Thin coverage: none. Nothing that stays changes; the code that goes has tests that go with it.
- This is a removal of a feature, not a pure shape change: the `timetrack` binary stops existing. The MCP server and installer behaviour stay as they are.

## Findings

## Options

### Shape

Delete the bin and everything only it used; change no behaviour of `ado-mcp` (the MCP server).

### Size

Picked: local.

Recommended: local (a deletion in one crate plus the repo facts that named it). Reason: no module boundary moves.

## Plan review

## Tasks

- Task 1: base 0fad597b607fe9530b93da8b7cf380cb527307d4, untracked at start: none (the run folder arrived after), files clean (deleted `tests/wi.rs::mine_spans_the_collection` with `mine`, as the gate approved; size 30 added / 2941 removed of ~2300, within twice).
- Task 2: base 0fad597b607fe9530b93da8b7cf380cb527307d4 (same tree), files clean (`ci-changes.test.mjs` lost the `ui.rs` path case and `repo-facts.test.mjs` lost its `ui.rs` palette copy, both approved at the gate).
- Full run (measured) on 0fad597b + the working tree: `npm test` exit 0 (check-repo, installer, compiler, upstream-sync, scripts, plugin tests: all pass, 0 fail); `cargo test --locked -p ado-mcp` green (the 7 timetrack-bin tests and `mine_spans_the_collection` gone, all other counts equal to the base); `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo fmt --all -- --check`, `scripts/check_cargo_workspace.py` green. `git diff Cargo.lock` adds no package. Not run: `cargo test` for web-mcp, `nix flake check`.

## Rulings

- 2026-11-09, setup: no superpowers sdd workspace or ledger for this two-task deletion; flow.md **Tasks** is the record — a resume reads flow.md and `git log` — nothing else lost.
- 2026-11-09, Task 1: `treefmt` (taplo) rewrote the `tokio` and `azure_devops_rust_api` feature arrays of `tools/ado-mcp/Cargo.toml` onto several lines — the pre-commit hook fails on a file it would change, so the base was not taplo-clean — a revert would fail the hook.
- 2026-11-09, review: lenses combined into one opus agent (correctness, lean, tests, risk) plus one sonnet docs agent, not six — the diff is almost all deletion with a green suite — a lens-specific miss (security was skipped: no input, network or process code was added).
- 2026-11-09, setup: the main checkout's copy of this run folder is renamed `refactor-timetrack.deleted-20261109` (untracked), since dcg blocks `rm -r` — nothing reads it; delete it by hand.

Decisions a (no ledger), c (taplo reflow), d (combined lenses), b (renamed folder), plus the review's Fix 1 and the two deleted tests: confirmed 2026-11-09.

## Parking lot

None.

## Deviations

None. The two deleted tests were approved at Gate 1 and Fix 1 (public-interface change) at the review gate.

## Walkthrough

| goal                                | plan task | file:line                                                                                                              | test                                                                        |
| ----------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| timetrack bin gone                  | 1         | `tools/ado-mcp/src/bin/timetrack/` (deleted)                                                                           | `cargo build`/`clippy --workspace --all-targets` find no bin                |
| library items only it used gone     | 1         | `tools/ado-mcp/src/wi.rs` (Ticket/mine/tickets removed), `lib.rs:16-17`, `tools/ado-mcp/tests/wi.rs`                   | `cargo test -p ado-mcp`                                                     |
| `ratatui` and `jiff` out of ado-mcp | 1         | `tools/ado-mcp/Cargo.toml`, root `Cargo.toml`, `Cargo.lock`                                                            | `scripts/check_cargo_workspace.py`, clippy `--locked`                       |
| repo facts that named it gone       | 2         | `scripts/ci-changes.mjs:26`, `scripts/ci-changes.test.mjs`, `scripts/repo-facts.test.mjs`, `flake.nix`, `AGENTS.md:43` | `node --test scripts/*.test.mjs`, `npm test`                                |
| behaviour unchanged                 | all       | n/a                                                                                                                    | suite green on base and on branch (counts equal except the 8 deleted tests) |

## Review

Verdict: ready, 0 to fix before merge. Audit: [docs/audits/2026-11-09-review-refactor-timetrack.md](../../audits/2026-11-09-review-refactor-timetrack.md). Two worth-doing findings, both picked and fixed (Fix 1: `Api`/`ApiError` back to `pub(crate)` and the `pub use` dropped; Fix 2: stale comment on `batch`); clippy `-D warnings`, fmt and `cargo test -p ado-mcp` (284 passed, 0 failed) re-run after. The fresh fix-check agent was not run (see Skipped).

## Learned

- Memory `dcg-undo-via-patch`: a folder can't be removed by `rm -r` or moved to the scratchpad; rename it in place to `.deleted-<date>`.
- Nothing for AGENTS.md: the removal already updated its `tools/ado-mcp/` bullet, and the review's leftover (visibility widened for the bin) was caught by the lean lens.

## Run verdict

worked as a whole: yes; clean: yes
