# Review: web-mcp-parallel-search-json-fetch

The branch worktree-web-mcp-parallel-search-json-fetch, based on origin/main at 32b4956f, changes 7 files (+60 −36), all uncommitted.

Verdict: 4 findings to fix before merge.

The lenses ran in three fresh agents plus one verifier: correctness and risk combined, lean, docs and security combined, and tests. Because the tree is uncommitted, the built-in review's condition does not hold, so the neutral correctness brief ran. Execution ran natively; the user declined `interrogate`.

Checks ran on 32b4956f with the seven files modified and the run folder untracked:

- `npm test`: exit 0
- `npm run typecheck`: passed
- `cargo fmt --all -- --check`: clean
- `cargo clippy --locked -p web-mcp --all-targets -- -D warnings`: clean
- `cargo test --locked -p web-mcp`: 364 passed, 3 ignored
- `python3 scripts/check_cargo_workspace.py`: passed

## Findings

| #   | severity       | where                                             | finding                                                                                                                                                                              | evidence                                                                                                                                                                                                               | fix (recommended)                                                                                                                                                                                                                            | bucket           |
| --- | -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | med (security) | `tools/web-mcp/src/fetch.rs:257`, `:468`          | A public URL that redirects to a private address now returns that service's JSON, because a direct `fetch` runs with private access on every hop and `classify` used to refuse JSON. | confirmed: a public `/hop` answering 302 to a private fixture returned `application/json` with `is_error=false leaked=true`; the base refused it with "unsupported content type". `text/plain` leaked on the base too. | Keep private access on a later hop only when the chain is already private: `let allow_private = allow_private && (hop == 0 \|\| private);`, tested. `redirect_onto_private_is_never_cached` (`tests/fetch.rs:140`) then asserts the refusal. | fix before merge |
| 2   | med            | `tools/web-mcp/src/fetch.rs:359`                  | A public JSON URL is cached for the whole server run, so polling a status URL returns its first answer.                                                                              | confirmed: `/status` answering pending then done, fetched twice, gave `hits=1 second_pending=true second_done=false`. The base gave `hits=2` and an error.                                                             | Add `Kind::Json`, handled like text, and leave it out of the cache: `cache: !private && !matches!(kind, Kind::Json)`.                                                                                                                        | fix before merge |
| 3   | med            | `tools/web-mcp/src/search.rs:154`, `tools.rs:342` | A cancelled search stays in the queue for up to 60 s, up from 10 s, then sends a real query and holds the turn. rmcp cancels only a token, and web-mcp does not read it.             | confirmed: rmcp 3.9.0 `service.rs:1661-1664`. With a 6 s render the base opened 2 tabs and the diff 4. This behaviour already existed, and the queue widens it.                                                        | Race the turn wait against rmcp's `CancellationToken`. Dropping a render mid-flight was not examined, so race only the wait. Make this a follow-up, because it adds a handler parameter.                                                     | worth doing      |
| 4   | low            | `tools/web-mcp/src/profile.rs:27`                 | The comment "Each engine's whole budget in a search, lock wait included." is now false.                                                                                              | confirmed: `search.rs:159` starts the deadline after the turn.                                                                                                                                                         | Reword it to say the budget starts when the engine wins its turn.                                                                                                                                                                            | fix before merge |
| 5   | low            | `tools/web-mcp/src/search.rs:35`                  | The `QUEUE_WAIT` comment says six searches fit, but a failed render holds its turn up to 6 s longer, so about four fit.                                                              | confirmed: `browser.rs:765-769`, `CLOSE_TIMEOUT` 5 s and `session_gone` 1 s.                                                                                                                                           | Reword the comment to name that limit.                                                                                                                                                                                                       | fix before merge |
| 6   | low            | `tools/web-mcp/tests/search.rs:940`               | The regression test's loser waits only 8.5 s, under the 10 s deadline, so the test would pass with a 10 s cap on the wait.                                                           | confirmed: with `QUEUE_WAIT` set to 10 s the test still passes; a three-search, 6 s version fails on that mutation and passes on the real code.                                                                        | Use three searches, `FAKE_AB_DELAY_MS=6000`, and assert 3 opens.                                                                                                                                                                             | worth doing      |
| 7   | low            | `tools/web-mcp/src/search.rs:162`                 | No test covers the `resting()` recheck after a turn, the check that ends a queue after a captcha.                                                                                    | confirmed: deleting it leaves every existing test green; an added test counts 1 open with it and 2 without.                                                                                                            | Add that test: two queued searches, the first blocked, 1 open.                                                                                                                                                                               | worth doing      |
| 8   | low            | `tools/web-mcp/src/search.rs:166`                 | The `timed_out` closure now has one caller, and `:185` repeats its computation.                                                                                                      | confirmed: closure at `:166`, only use at `:179`.                                                                                                                                                                      | Compute `left` first and test `left < READ_MARGIN`.                                                                                                                                                                                          | worth doing      |
| 9   | low            | `tools/web-mcp/src/papers.rs:649`                 | `budget` is bound once and used once.                                                                                                                                                | confirmed: only use at `:653`.                                                                                                                                                                                         | Pass `ctx.cfg.papers_deadline` inline.                                                                                                                                                                                                       | worth doing      |
| 10  | low            | `tools/web-mcp/src/search.rs:154`                 | Every queued search now loads Google, one after another, where some used to fail in the queue. Google may flag that.                                                                 | plausible: at a 6 s render the base opened 2 of 4 searches and the diff all 4. No captcha rate was measured, and turns stay serial.                                                                                    | No change now. If a live run shows Google resting more, add a minimum gap between an engine's turns.                                                                                                                                         | worth doing      |

Dropped: 2 findings. One claimed `AGENTS.md` omits `rows`, but this branch lists it. The other proposed deleting `concurrent_searches_in_one_server_both_answer`, but that test covers all four engines and the new one covers only Bing.

Picks: 1, 2, 3, 4, 5, 6, 7, 8, 9

Fixed 2026-11-09: 1

Fixed 2026-11-09: 2

Fixed 2026-11-09: 3

Fixed 2026-11-09: 4

Fixed 2026-11-09: 5

Fixed 2026-11-09: 6

Fixed 2026-11-09: 7

Fixed 2026-11-09: 8

Fixed 2026-11-09: 9

## Tasks

Fix 1-9: base 3c899fb6f8e398da6006aa2c53ff375a5e449718, files clean (with the deviation below, decided by the user). A fresh agent checked every fix and passed all nine; each mutation turned its test red.

## Rulings

## Parking lot

## Deviations

## Skipped

- `interrogate`: declined by the user.
- Live browser run of the queue: not run, because it opens a second window and sends more traffic to engines that are already rate-limiting. The queue is proven only against the fake browser.

## Run verdict
