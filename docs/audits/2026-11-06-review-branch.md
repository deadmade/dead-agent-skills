# Review: branch worktree-web-mcp-google-results-and-clicks

This review covers branch worktree-web-mcp-google-results-and-clicks against main (9e5dc54): 7 files, +516 −19. The branch has no commits yet, so all of its work is uncommitted; the run's flow.md and a hook's untracked file are out of scope. `/fix` called this review inline, and execution ran natively, with no per-task reviews.

## Findings

Five lenses ran: correctness, lean, tests, docs and security. Correctness ran on the neutral brief, because uncommitted work rules out the built-in `code-review`. Security found nothing. The risk lens was skipped: the diff has no migration, public interface, wire format or config.

One fresh verifier checked all 24 candidates (the lenses' own numbering, C1 to C24). It kept them as the 14 findings below, where related candidates share a row, and dropped 3 in full:

- C11, AGENTS.md size;
- C19, ADR 0007;
- "the `FRONT_WAIT` bound is untested", which `slow_typing_times_out_without_a_second_load` covers, as measured by mutation.

It also dropped one sub-claim, "a stalled Google would hang the call": only removing `timeout_at` would make it hang.

| #   | severity | where | finding | evidence | fix (recommended) | bucket |
| --- | -------- | ----- | ------- | -------- | ----------------- | ------ |
| 1 | medium | `plugins/shared/web-mcp/README.md:44-46` | The README says Google is "not Google yet: its result links don't parse, so it gets no results today". The diff made that false, and Google now also types follow-ups (`engines/mod.rs:134`). The README also never says that web-mcp's own client fetches Google's rows (`web-mcp/<version>` user agent, no cookies). | confirmed: the verifier read the sentence verbatim, and read `Engine::Google => Some("textarea[name=q]")` | List Google among the engines, and add one sentence saying that plain requests resolve its `/goto` rows and that it contributes its first few rows | fix before merge |
| 2 | low | `tools/web-mcp/src/search.rs:256-275` (`resolve_goto`) | The walk stops only on a 2xx, a send error or a timeout. On a `429`, a `5xx` or a `302` to a Google URL such as `/sorry/…`, the walk drops the row and goes on, so up to about 9 more requests go to a host that just refused. A `302` to another Google host (`ipv4.google.com/sorry/…`) passes the host filter (`u.host() != page.host()`) and would be ranked as a result. The deviation entry promised "at most one request past the limit". | confirmed for the walk (`if resp.status().is_success() { walking = false }` is the only status stop); plausible for the Google-host case (not measured: only the `200` delay page was) | Stop on any non-redirect answer except `404` (a dead row), and treat a target on a Google host as a stop; write a `429` test first | fix before merge |
| 3 | medium | `AGENTS.md:108`, `search.rs:234-235`, `search.rs:699-700` | "Google redirects only a fresh page's first 3 to 4 links, however they are paced" and "whether burst, spaced or with its cookie" contradict this run's own measurements: a burst of 4 gave only rows 1 and 2, and the final live build gave 2 rows. Nothing says that a Google search within about 30 s of another may resolve none of its links and be skipped as "its result links did not resolve". | confirmed against `flow.md` Findings §1 (burst → rows 1 and 2; "every request for the next ~30 s is 200") | Say "first 2 to 4 links, fewer after a burst", and add the 30 s consequence to the code comments and AGENTS.md | fix before merge |
| 4 | low | `AGENTS.md:108` | "Semantic Scholar's and Google's no-results page aren't captured yet, so those tests are `#[ignore]`d" hides that Semantic Scholar's result page is also missing: two Semantic Scholar tests are ignored, and one Google test. | confirmed: `semanticscholar.rs:75` and `:84` against `google.rs:123` | "Semantic Scholar's result and no-results pages and Google's no-results page aren't captured yet, so those three tests are `#[ignore]`d" | fix before merge |
| 5 | low | `tools/web-mcp/src/browser.rs:1253` (`input_takes_the_front_tab_one_session_at_a_time`) | The test cannot fail for the half of its claim that matters, "held until the input is sent": it checks only that raises do not interleave. | confirmed by mutation in a scratch copy: releasing the guard after `raise` and before `input.await` passed 10 of 10 runs; removing the lock failed | Make the fake's typing batch slow and assert that the second session's activation comes after the first session's input, or rename the test to what it proves | worth doing |
| 6 | low | `search.rs:197` (`run_engine`), `:258`, tests | Three paths are untested: the wiring of `resolve_goto` into `run_engine` (replacing the condition with `if false && e == Engine::Google` passes every test, because the Google fixture has no `/goto` rows); the `timeout_at(deadline)` bound and the stop on a failed request; and keeping a plain row that follows a throttle. | confirmed: `tests/fixtures/search/google.html` has no `/goto`; the swapped check passes both resolver tests | One `search` integration test with `/goto` rows (resolved targets appear; all-`200` gives "google: its result links did not resolve"); a stalled-server case; a plain row after `throttled` | worth doing |
| 7 | low | `search.rs:198` against `:202-205` | `resolve_goto(...).await?` returns before `set_consent_seen(e, false)` and `*last = Some(query)`. A search whose links do not resolve therefore leaves the consent mark set, so a later consent page rests Google for 30 minutes instead of getting a second clearing pass. This is unlikely, because consent must come back after results did. | confirmed by reading the statement order and `Parsed::Blocked(Block::Consent) if !profiles.consent_seen(e)` | Resolve after the mark and `last` are set | worth doing |
| 8 | low | `browser.rs:~629-633` (`raise`) | A failed raise leaves no trace (a refused port, Chrome's `404 No such target id`, a missing port, a client that did not build); `click` then lands in the hidden tab, and `browser` says done. Not a regression: `raise` behaved this way before. | confirmed: `let _ = http.get(…).send().await` and five silent early returns | Check the status and write one `eprintln!` line on failure (as `window.rs` does); never fail the call | worth doing |
| 9 | low | `browser.rs:161-165` (`FRONT_WAIT`) | The doc says four engines type "about 1 s each (measured: a follow-up search over all four took 6 to 8 s)". But the 6 to 8 s is the whole search, not one locked step. The fourth waiter waits through three holds, so a hold of 1.7 s or more passes the 5 s bound, and that waiter's raise then hides the holder's tab. | confirmed for the doc claim; plausible for the overrun (the per-step hold was not measured) | Fix the comment; measure one locked typing step | worth doing |
| 10 | low | `browser.rs:383-386` | The `front` lock covers only raise against raise. A `tab new` in the `TabGone` branch, and a fresh session's first bind, run outside it, so either may bring a new tab to the front while another session types. | plausible: only a live Chrome can show whether a new target takes the front | Take `front` around that `tab new`, or say in the comment that `front` claims only raise against raise | worth doing |
| 11 | low | `search.rs:132-133`, `browser.rs` (`raise`'s `shortcut:` comment, line 1 module doc), `tests/bin/fake_agent_browser.rs:8-9` | Four small inaccuracies. `run_engine`'s `# Errors` omits "its result links did not resolve". The `shortcut:` comment cites PR #1695, which mattered only to the rejected `tab <id>`. The module doc says "one `--json` call per action", but click and press now add a `tab list` and an HTTP request. The fake's doc says the cdp url "ends in" the port, but the url is `ws://127.0.0.1:<port>/devtools/browser/<chrome>`. | confirmed: each sentence quoted against its code | Correct the four sentences | worth doing |
| 12 | low | `browser.rs:93` and `~628`; `engines/mod.rs:166-169`; `search.rs:266-271` | Three duplications: a second `reqwest` client in `Browser` (`OnceLock<Option<…>>`) beside `Ctx::http`, whose `Option` swallows a build failure that `main.rs:50` already handles; the `is_google_goto` wrapper, which is the same test as `f.url.host() != page.host()`; and the `Location` chain copied from `fetch.rs:492-498`. | confirmed: lines read; the verifier notes that the client change saves little (four `Browser::new` call sites, and tests need a default) | Share a `location` helper in `fetch.rs`; drop the wrapper; leave the client unless you are in that code again | worth doing |
| 13 | low | `tests/browser.rs:186-211`, `browser.rs:~1183`, `search.rs:619-651` | Three new copies of a one-thread HTTP stub. `common::Fixture` (`tests/common/mod.rs:62-98`) already serves any path and counts hits per path, which covers `tests/browser.rs`; to cover the two unit tests, `api.rs`'s `stub` and `reply` need `pub(crate)`. | confirmed: lines read | Use `Fixture` in `tests/browser.rs` (bind `127.0.0.1`, because the fake hard-codes it); share `api.rs`'s helpers with the unit tests | worth doing |
| 14 | low | `browser.rs:~615` | The `targetId` filter has no test with a bad id, and the fake's ids are not Chrome-shaped. The filter guards no real trust boundary (the id comes from Chrome through agent-browser; a page controls only its title and url), but it costs three lines and stops a path-shaped id. | confirmed (untested); defensible either way | Leave it | worth doing |

Dropped: 3 findings in full, plus one sub-claim (listed above).

Picks: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 (the user's "All 14", 2026-11-06). Findings 12 and 14 name "leave it" for part or all of their fix and finding 10 names two options; the rulings are in the run's flow.md.

Fixed 2026-11-06: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 (14: "leave it", no change). Fix check, round 1 (one fresh opus agent): 13 PASS, 10 FAIL (its comment cited a `tab` command the `browser` tool does not have); it also found that Fix 2's stop on any `*.google.com` target would drop real results, and that the wait for the host's slot sat outside the deadline. Both were fixed with a failing test first, and 10 was reworded. Round 2 (one fresh sonnet agent): 10 PASS and the two resolver changes PASS, with mutations of the slot wait and the stop rule caught. After round 2 the stop was narrowed once more on that agent's remarks (only a `/sorry` page of the site stops the walk; a page of the search host itself is dropped; `/sorry-moved` and `notgoogle.com` are results), with a failing test first and a mutation of the dot boundary caught, and the `front` comment's wording on a first bind was made exact. Those last two changes were checked by their tests and mutations only, not by a third fresh agent.

## Tasks

See the run's flow.md, **Tasks**.

## Rulings

None made by this review.

## Parking lot

None yet.

## Deviations

See the run's flow.md, **Deviations**: 1 (Google's throttle) and 2 (Option B for the raise).

## Skipped

- Lens: risk. The diff has no migration, public interface, wire format or config; the run's two deviations name the extra Google requests and the extra loopback request per input.
- Built-in `code-review` for the correctness lens: the tree has uncommitted and untracked files, so the neutral brief ran instead.
- pstack `interrogate` (offered when execution ran natively): not run; offered at Decide.
- `npm test`, `npm run typecheck`: not run, because the worktree has no `node_modules` (`npm ci` needs the network) and the diff touches no TypeScript or JavaScript. What ran instead, all green on commit 9e5dc54 plus the uncommitted tree, after the fixes: `cargo test --locked -p web-mcp --no-fail-fast` (176 unit, 28 browser, 17 fetch, 37 lookup, 1 mcp, 11 papers, 36 search; 3 ignored), `cargo clippy --workspace --all-targets --locked -- -D warnings` and `cargo fmt --all -- --check`; `python3 scripts/check_cargo_workspace.py` with its unit tests ran before the fixes, and the fixes touch no manifest. `cargo test --workspace` has one red this run did not cause: `flow-cockpit-core`'s `phase_lists_match_skill_tables` reads the generated `.claude-plugin/flows/…`, which this worktree lacks (no `node_modules`, so `npm run build:harnesses` cannot run); it is not shown to pass.
- `/fix`'s Phase 5 (Prove): skipped at the user's word, so no independent agent reran the tests before and after each fix.
- Not run live: a real Google answering `429` or `/sorry`; a live Chrome for finding 10; Windows.

## Run verdict

2026-11-06, by the user at Decide: worked as a whole: yes; clean: yes. The decisions, the Parking-lot picks and the Skipped rows are in the run's flow.md.
