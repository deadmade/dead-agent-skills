# Parallel searches fail with "No engine answered: busy" or "timed out", while the same searches one at a time work

- **Seen:** 2026-11-09, six `search` calls in one message: 5 failed on the installed binary, and 3 failed on `origin/main` with a fake browser taking 3 s per render. Over 60 days, 108 of 366 searches failed.
- **Cause:** each engine serves one search at a time through a turn (`engines::Turns::turn`), and one 10 s deadline, started with the search, covered both the wait for the turn and the work (`run_engine` in `tools/web-mcp/src/search.rs`). The third and later searches spent their deadline in line.
- **Fix:** the deadline starts when the engine's turn does, and the wait for a turn has its own cap, `QUEUE_WAIT`. A cancelled search leaves the line, because rmcp only cancels a token and never drops the handler.
- **Spot it next time:** when a resource is shared by a queue, check whether the timeout covers the wait as well as the work. Test it with more waiters than one deadline can serve, so the last one waits longer than the deadline.
