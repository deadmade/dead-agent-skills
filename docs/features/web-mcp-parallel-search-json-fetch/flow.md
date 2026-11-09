---
flow: fix
phase: done
now: 'Done: PR handed over for worktree-web-mcp-parallel-search-json-fetch.'
---

# web-mcp parallel searches, JSON fetches and Google: flow

## Request

**2. Two web-mcp fixes (small).** It's your most-used tool of your own, at about 2,800 calls in 60 days.

- **Parallel searches:** 108 of 366 searches failed, about 100 of them with "No engine answered". Today 3 of 6 parallel searches failed, while all 7 run one at a time worked. Queue them instead of failing on "busy".
- **JSON fetches:** 42 fetches failed because `tools/web-mcp/src/fetch.rs:258` rejects `application/json`. Accepting it would also help your API work.
- **Google:** it returned "unrecognised page" on most searches today, so its parser needs checking.

## Artifacts

- Reproduction and evidence: **Findings** below.
- Review: [audit](../../audits/2026-11-09-review-web-mcp-parallel-search-json-fetch.md)

## Gates

- Gate 1, cause approved: 2026-11-09
- Gate 2, review-code report: 2026-11-09, picks 1,2,3,4,5,6,7,8,9

## Skipped

- `pstack-picks:how` and `blast-radius` agents: the main session read the code path and ran the deciding fact itself (Grounding); no independent explainer ran. Accepted by the user at Gate 1.
- Upstream issue search: no dependency is involved in any of the three causes.
- `interrogate`: declined by the user.
- Live browser run of the queue: accepted by the user at Decide; the queue is proven only against the fake browser, and the follow-up measures it.

## Grounding

Code read at `origin/main` (32b4956f, six commits ahead of local `main`; 14514365 touched web-mcp).

- `search::web` (`tools/web-mcp/src/search.rs:477`) sets one `deadline = now + ENGINE_DEADLINE` (10 s, `profile.rs:28`) at `search.rs:504`, then runs every engine with it through `run_engine` (`search.rs:136`).
- `run_engine` waits for the engine's turn with that same deadline (`search.rs:152`, `profiles.turn`, a FIFO `tokio::sync::Mutex` per engine, `profile.rs:112`, `:227`). A wait that runs out returns `busy`; a turn won with under `READ_MARGIN` (2 s) left returns `timed out` (`search.rs:160-163`).
- `papers.rs:649-652` calls `run_engine` the same way with `papers_deadline`.
- Google's turn is one tab per engine by design (ADR 0007). Google flags bursts (`docs/solutions/google-results-are-goto-links-that-resolve-only-a-few-times.md`), so several tabs per engine is ruled out.
- `fetch::classify` (`fetch.rs:246-260`) passes `text/*` to `Kind::Text` and rejects other types; `Kind::Text` returns the body as is (`fetch.rs:335-340`). `ACCEPT_VALUE` already allows `*/*`.
- Google parser: `engines/google.rs:59`. Binaries come only from the installer (ADR 0006), so a marketplace update of the plugin leaves `~/.claude/bin/web-mcp` as it was.

Blast radius:

- `run_engine`'s `deadline` parameter: two callers (`search.rs:507`, `papers.rs:652`).
- `tests/search.rs:942` `lock_won_late_starts_no_render` pins today's behaviour (the loser times out) and must change.
- `tests/fetch.rs:244` keeps the rejection of `application/zip`; `tools.rs:365` and `plugins/shared/web-mcp/README.md:14` describe what `fetch` returns.
- The fact the queue is safe because of: every turn holder is bounded by its own budget (`render` and `resolve_goto` both take the deadline), and the wait is capped. Measured: six parallel searches with a 3 s fake render all answer, one every 3 s.
- A queued search rechecks `resting()` once it has its turn (`search.rs:156`), so a captcha that rests an engine ends the queue behind it.

## Findings

### Reproduction (2026-11-09)

Installed binary, six `search` calls in one message: 5 of 6 failed (measured).

```text
No engine answered: google: timed out, bing: timed out, duckduckgo: timed out, brave: timed out
No engine answered: google: busy, bing: busy, duckduckgo: busy, brave: busy
No engine answered: google: busy, bing: busy, duckduckgo: busy, brave: busy
Source: brave (skipped: google: timed out, bing: timed out, duckduckgo: timed out)
No engine answered: google: timed out, bing: timed out, duckduckgo: timed out, brave: timed out
No engine answered: google: timed out, bing: timed out, duckduckgo: timed out, brave: timed out
```

`origin/main` with the fake browser (`FAKE_AB_DELAY_MS=3000`), six parallel searches: 3 of 6 failed, all three `timed out` at about 9 s (measured).

`fetch https://api.github.com/repos/rust-lang/rust`: `failed: unsupported content type: application/json` (measured).

### Cause 1: parallel searches

One deadline covers the wait in the queue and the work. It starts when the search starts, so the third and later search in a line spend their 10 s waiting (`search.rs:504`, `:152`). A queue already exists; it is the deadline that makes it fail.

Evidence: moving the deadline after the turn in a scratch worktree, and nothing else, turned the same run into 6 of 6 answered, 18 s in all, one every 3 s (measured).

### Cause 2: JSON fetches

`classify` has no arm for JSON (`fetch.rs:252-258`, verified; reproduced above).

### Cause 3: Google "unrecognised page"

The installed binary is stale; the parser is not broken. `~/.claude/bin/web-mcp` is 0.6.19, built 2026-11-06 09:30, and lacks the string `its result links did not resolve` that #122 added (measured). #122 (the parser keeping Google's `/goto` rows) landed that evening and first shipped in v0.6.26.

Evidence: `origin/main`'s parser, run over the 7 "unrecognised" Google pages archived today, returned results for all 7: 8 to 10 rows each (measured).

After today's burst Google also answered with a captcha and rests for 30 minutes (`.web/2026-11-09_150600-2421716/pages/www-google-com-sorry-index-d5ea23b5/raw.html`); that is its rate limit and not the parser.

## Options

### Fix

Picked: per-turn deadline with a 60 s queue cap; JSON and `application/*+json` returned as text; no Google code, rerun the installer.

Parallel searches:

- **A (recommended).** Give each engine its own deadline, started when it wins its turn, and cap the queue wait at 60 s. Touches both `run_engine` callers. Files: `tools/web-mcp/src/search.rs`, `tools/web-mcp/src/papers.rs`, `tools/web-mcp/tests/search.rs`. A search behind others now returns later instead of failing.
- B. Several tabs per engine. Rejected: more simultaneous requests to Google, which flags bursts.

JSON fetches:

- **A (recommended).** Accept `application/json` and `application/*+json` as text. Files: `tools/web-mcp/src/fetch.rs`, `tools/web-mcp/tests/fetch.rs`, `tools/web-mcp/src/tools.rs`, `plugins/shared/web-mcp/README.md`.
- B. `application/json` only. One condition shorter; `application/problem+json` and similar stay rejected.

Google:

- **A (recommended).** No code change; update the binary by rerunning the installer.
- B. Add today's page as a parser fixture. It would pass today, so it proves nothing about the bug.

## Plan review

## Tasks

Task 1: base 32b4956f16dfbfe7f420a51fedbf6dfecbd24152, untracked at start: docs/features/web-mcp-parallel-search-json-fetch/flow.md, files clean
Fix 1-9: base 3c899fb6f8e398da6006aa2c53ff375a5e449718, untracked at start: docs/features/web-mcp-parallel-search-json-fetch/flow.md, docs/audits/2026-11-09-review-web-mcp-parallel-search-json-fetch.md, files clean (with the deviation below)

## Rulings

- 2026-11-09, Task 1: removed `run_engine`'s "too little left" check after the turn, and edited the comment in `typed_page` that named it — a deadline that starts with the turn can't be nearly spent there; the later check before the URL load still covers a tiny budget — if wrong, a very short papers deadline starts one render it can't finish. — confirmed
- 2026-11-09, Fix 3: passed rmcp's `RequestContext` through search instead of naming its `CancellationToken` — naming it would add `tokio-util` as a direct dependency — if wrong, `search.rs` and `papers.rs` depend on one more rmcp type. — confirmed
- 2026-11-09, Task 1: rewrote `lock_won_late_starts_no_render` as the regression test instead of adding a second one — it pinned the bug; the gate listed `tests/search.rs` — if wrong, nothing tests the old path, which no longer exists. — confirmed

## Parking lot

- `tools/web-mcp/src/search.rs`: measure six parallel live searches on the new binary; if Google rests more, add a minimum gap between an engine's turns (review finding 10). — follow-up
- Installer/binaries: the marketplace updates plugins without the binaries, so `web-mcp` can sit 19 releases behind unnoticed (ADR 0006 chose this); a staleness warning is a separate change. — follow-up

## Deviations

### Fix 1, 2 and 3 need files their findings do not name

Status: decided 2026-11-09: both files approved by the user.

Fix 3's test sends `notifications/cancelled`, which needs `Mcp::send` public in `tools/web-mcp/tests/common/mod.rs`. Fixes 1 and 2 make two README statements incomplete (`plugins/shared/web-mcp/README.md`: the private-address limits and the run-long cache). Recommended: approve both, since neither changes production behaviour.

## Walkthrough

| goal                                              | plan task | file:line                         | test                                                |
| ------------------------------------------------- | --------- | --------------------------------- | --------------------------------------------------- |
| Parallel searches: the deadline covered the queue | Task 1    | `tools/web-mcp/src/search.rs:159` | `tools/web-mcp/tests/search.rs:940`                 |
| JSON fetches rejected                             | Task 1    | `tools/web-mcp/src/fetch.rs:257`  | `tools/web-mcp/tests/fetch.rs:244`                  |
| Google "unrecognised page": stale binary, no code | none      | none                              | parser run over today's 7 archived pages (Findings) |

## Review

Verdict: 4 findings to fix before merge; the user picked 1 to 9 and all nine are fixed and checked by a fresh agent. Finding 10 (possible extra Google traffic) needs a live measurement. Audit: `docs/audits/2026-11-09-review-web-mcp-parallel-search-json-fetch.md`.

## Learned

- `docs/solutions/parallel-searches-fail-as-busy-or-timed-out.md`: the shared-deadline root cause.
- `docs/solutions/google-results-are-goto-links-that-resolve-only-a-few-times.md`: "Seen again", a stale binary.
- `AGENTS.md` Checks: don't share `CARGO_TARGET_DIR` between worktrees.

## Run verdict

Worked as a whole: yes. Clean: yes.
