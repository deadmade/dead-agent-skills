# Review: refactor-timetrack

branch: worktree-refactor-timetrack ← main, 15 files (4 deleted), +54 −2967, uncommitted

## Findings

| #   | severity | where                             | finding                                                                                                                                                            | evidence                                                                                                                                                            | fix (recommended)                                                                                          | bucket      |
| --- | -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | low      | `tools/ado-mcp/src/lib.rs:16`     | `pub use api::{Api, ApiError}` and the `pub` on both structs (`api.rs:42`, `api.rs:213`) were widened only for timetrack; nothing outside the crate uses them now. | confirmed: `rg ado_mcp tools/ado-mcp/tests` finds no hit, and `src/main.rs:1` imports only `Config, Server`; the lean agent traced the widening to commit 7303fb16. | Delete the `pub use` line and make both structs `pub(crate)` again (a public-interface change: your call). | worth doing |
| 2   | low      | `tools/ado-mcp/src/wi.rs:457-458` | The doc on `batch` says `proj` may be "empty for the whole collection"; only the deleted `tickets` passed `""`.                                                    | confirmed: `rg 'batch\(' wi.rs` shows one caller left, `wi.rs:536`, passing `&proj` from `seg(project_id)`.                                                         | Delete ", empty for the whole collection" from the comment.                                                | worth doing |

Dropped: 0. Correctness, tests, risk and docs lenses: no findings.

Picks: 1,2
Fixed 2026-11-09: 1, 2 (clippy `--workspace --all-targets --locked -D warnings`, `cargo fmt --check`, `cargo test --locked -p ado-mcp`: 284 passed, 0 failed)

## Tasks

- Fix 1: base 0fad597b (working tree), files clean (`lib.rs`, `api.rs`).
- Fix 2: base 0fad597b (working tree), files clean (`wi.rs`).

## Rulings

## Parking lot

## Deviations

## Skipped

- Lenses ran combined (one opus agent for correctness, lean, tests and risk; one sonnet agent for docs), not six: the diff is almost all deletion. Security lens skipped: the diff adds no input parsing, network, file, process or secret code.
- Verify agent skipped: both candidates were checked by command in the main session (the lean agent, not the author, found them).
- Built-in `code-review` not used: the tree has uncommitted and untracked files, so the neutral correctness brief ran.
- Copyedit of this report: not run, a two-row table.

## Run verdict
