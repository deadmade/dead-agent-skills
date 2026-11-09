# Review: shopping-search

The review covers branch shopping-search against origin/main (merge-base 24d39d70): 30 files, +2037 −35, in 9 commits, plus the run's untracked spec, plan and prior-art.

- **Lenses:** correctness (on a neutral brief; the built-in review was not used because the tree holds untracked files), lean, tests (33 mutations run on a scratch copy), docs, security (incomplete: a safety classifier stopped the agent after its first pass), and risk.
- **Checks**, all green on `50569ac9` (2026-11-09):
  - `cargo build --locked -p web-mcp --bin fake-agent-browser`
  - `cargo test --locked -p web-mcp` (198 unit tests; 29, 17, 37, 1, 11, 15 and 37 in the integration suites)
  - `cargo clippy -p web-mcp --all-targets --locked -- -D warnings`
  - `cargo fmt --all -- --check`
  - `npm run build:harnesses`
  - `node tools/harness-compiler/src/cli.ts lint`
  - `npm test` (56 of 56)
  - the skill scan of `plugins/opt-in/shop` through `uvx` (cisco-ai-skill-scanner 2.3.2: 1 INFO finding)

## Findings

<!-- Every verified finding, most severe first. The verifier (a fresh agent) read each cited line and ran probes on a copy of the crate outside the repo; the risk lens ran after it, and its two findings were checked by the main session against the code. -->

| #   | severity | where | finding | evidence | fix (recommended) | bucket |
| --- | -------- | ----- | ------- | -------- | ----------------- | ------ |
| 1 | medium | `tools/web-mcp/src/rows.rs:93`, `tools/web-mcp/src/archive.rs:252` | `rows` archives into the same folder `fetch` caches in and writes an empty `page.md` there, so if `fetch(URL)` is followed by `rows(URL)`, a second `fetch(URL)` returns an empty page and no error | confirmed: `archive.rs:257-258` writes `page.md` from `markdown: String::new()`; `fetch.rs:215-224` reads it back. Not run end to end. `search.rs` `keep_page` already had the same bug before this branch | in `Archive::put`, skip `page.md` when `markdown` is empty and point the index at `raw.html` (fixes `rows` and `search` together) | fix before merge |
| 2 | medium | `tools/installer/steps/codex.ts:120` | On Codex, the installer still offers `shop` on a machine with no web-mcp build (macOS, ARM); choosing it adds `shop` and `web-mcp`, then throws "No web-mcp release for this platform" and leaves the install half done | confirmed: the risk lens drove the real `applyCodex` with the platform forced to darwin-arm64; its scripts are `shop-codex.test.ts` and `pages.ts` in the scratchpad. In that case `flows` is removed from the pages, but `shop` is not | remove every page key whose dependencies include `web-mcp`, not only `flows`, and reword the reason given for the hidden item | fix before merge |
| 3 | low | `tools/web-mcp/src/rows.rs:123` | The no-group reply takes the title from `head > title`, but the browser read is `get html body`, so on a real page that branch never runs and the reply shows the first `h1` or nothing. The spec, the plugin README and the skill all promise "the page title" | confirmed: `browser.rs:749`; the test passes only because the fake serves a whole document | delete the `head > title` branch, label the line "Heading", and correct the spec, README, skill and `rows_no_group_names_the_title_and_the_hints` | fix before merge |
| 4 | low | `tools/web-mcp/src/limits.rs:58` | After a `rows` call on `export.arxiv.org` (3 s) or `services.nvd.nist.gov` (6 s), the next papers or NVD request waits only 1 s, so it comes sooner than the API's spacing allows | confirmed by reading `acquire_with`: `*next = start + gap` ignores `interval(url)`; callers of `acquire` are unaffected | `*next = start + gap.max(interval(url))` | worth doing |
| 5 | low | `tools/web-mcp/src/rows.rs:329` | `drop_wrapped` compares `score` only, but the sort uses `(score, volume)`: on a page with no links, 6 linkless `section`s holding 50 cards each return only the 6 sections | confirmed by probe (kind `SECTION`, total 6). The tuple fix is partial: it works only when the inner group's volume exceeds 400 × the outer count | compare `(score, volume)` in `drop_wrapped`, and say in the skill that a page without links needs `item` | worth doing |
| 6 | low | `tools/web-mcp/src/rows.rs:272` (`text_of`), `:286` (`candidates`) | A hostile page of 3,000 nested `div`s around 200 KB of text took 25 s in a debug build and blocks a tokio worker, because the text under every child is built and stored | confirmed by probe: 233 KB page, 25.27 s | stop `text_of` after `SCORE_CAP` (400) characters; this also makes the ADR's "capped at 400 characters per item" true | worth doing |
| 7 | medium | `tools/web-mcp/src/rows.rs:260`, `:296` | The kind is the tag plus the first two sorted classes, so siblings that differ by a state class split: 10 `li.ad-listitem` plus 4 `li.ad-listitem.is-topad` return 10 and drop the 4. The Geizhals fixture shows it: the auto group has 9 `filter-element` blocks, where `item` returns 10 | confirmed by probe; the fixture counts are in the fixture README | a heuristic limit: say so in the skill and README (use `item` when a total looks short), or group by tag plus the first class only (risk: a shared utility class merges unrelated lists) | worth doing |
| 8 | low | `tools/web-mcp/src/rows.rs:85`, `tools/web-mcp/src/fetch.rs:398` | Whether "The requested address was private" is decided after the load, by resolving DNS again, so a host that answers web-mcp differently from the browser (mixed answers, rebinding, a failed lookup) skips the landing check. By then the browser has already sent the request | confirmed in part: `private_landing` counts any private answer or a failed lookup as private. The other tools (`fetch` with `allow_private: true`, `browser`) already reach private hosts | decide the requested address before the load, from the URL text alone (`archive::is_private`), and treat an unresolvable host as public; a dev hostname that maps to loopback would then be refused | worth doing |
| 9 | low | `tools/web-mcp/src/rows.rs:198`, `:260` | The `Group N: M items (kind)` line falls outside the budget, and the kind has no length cap: a 10,006-character kind gave a 10,095-character render on a budget of 100 | confirmed by probe; needs a hostile page | cut the kind to 80 characters where `render` prints it | worth doing |
| 10 | low | `docs/adr/0012-rows-tool-and-shop-skill.md:6`, `tools/web-mcp/src/rows.rs:18` | The ADR and a doc comment say an item's text is capped at 400 characters, but the code caps the group's total at 400 × the item count | confirmed: `rows.rs:313` | reword both (or let finding 6 make them true) | worth doing |
| 11 | low | `tools/web-mcp/tests/fixtures/rows/README.md` | The group counts mix element counts and group counts: 10 `filter-element` in the cards file but 9 in the group; 10 `details` in the ads file, 9 in the group; 40 `cms-fliesstext`, 39 in the group | confirmed by count | say which basis each number uses | worth doing |
| 12 | low | `tools/web-mcp/src/rows.rs` tests, `tools/web-mcp/tests/rows.rs` | Six of the 33 mutations survived, each an untested case: an inner group that outscores its wrapper (and the two nested tests are the same case: delete one); the default `limit` of 30; `header` and `footer` as skipped containers; `javascript:` and `mailto:` links; an item that is itself an `a`; the `(kind)` part of the group line | confirmed: all 20 unit tests passed with the drop rule mutated | add one small test for each, and delete the duplicate nested test | worth doing |
| 13 | low | `tools/web-mcp/src/rows.rs:93`, `:50`, `:42`, `:281` | About 35 lines could go: the archive step repeats `search.rs` `keep_page`; each item's text is computed twice; `Group.total` always equals `rows.len()`; `collapse` repeats `papers.rs:50` | confirmed | call `keep_page`, pass the stored text on, delete `total`, share `collapse` | worth doing |
| 14 | low | `tools/web-mcp/tests/rows.rs:123` and others | Four weaker test gaps: hidden-text removal is tested only in aggregate (`[hidden]`, `style` and `noscript` are uncovered); the budget bound is 12,500 where the design says 12,000; the sorted two-class rule; the `item` variant of the "group 2" message | confirmed, low value | tighten the bound to 12,000 and split the hidden-text test per case; the rest can stay | worth doing |
| 15 | low | `docs/adr/0012-rows-tool-and-shop-skill.md:12` | The ADR links `../features/shopping-search/spec.md`, which is untracked on this branch, so the link dangles after a merge unless the run commits it | plausible: `git ls-tree HEAD` lists only `flow.md` and `live-client.mjs` | commit the run folder's spec, plan and prior-art with the branch | worth doing |

Dropped: 0.

Picks: 1, 2, 3, 4, 6, 9, 10, 11, 12, 13

Fixed 2026-11-09: 1 (8a0f03d2)
Fixed 2026-11-09: 2 (b0c1807f)
Fixed 2026-11-09: 3 (45f5980f)
Fixed 2026-11-09: 4 (99e3992b)
Fixed 2026-11-09: 6 (42fefc26, then 2c0bd731 and 4eb71701 after the fix check found the cap steppable and the walk unbounded for one huge text node)
Fixed 2026-11-09: 9 (7ea293c0)
Fixed 2026-11-09: 10 (42fefc26)
Fixed 2026-11-09: 11 (0b1b1a72)
Fixed 2026-11-09: 12 (67c4db56)
Fixed 2026-11-09: 13 (5a8f175f)

Gate 3 (review report), approved 2026-11-09 with the picks above; finding 2 touches `tools/installer/steps/codex.ts` and `tools/installer/steps/codex.test.ts`, outside the plan, and the pick approves that. Not picked, left for Decide: 5, 7, 8, 14, 15.

## Tasks

Task 1: base f011369bbb7d38bb767cfc16d99e22eeb2998e74, files clean.
Task 2 to Task 7: see `docs/features/shopping-search/flow.md`.

## Rulings

See `docs/features/shopping-search/flow.md`.

## Parking lot

- `tools/web-mcp/src/rows.rs`: `text_of` joins text nodes with a space, so inline markup splits words (`Mon<b>itor</b>`).
- `tools/web-mcp/src/rows.rs`: a row's link has no length cap.
- `tools/web-mcp/src/rows.rs`: `html.clone()` copies the whole page only to archive it.
- `docs` (AGENTS.md:104, ADR 0007): they still say that only engines, `browser` sessions and the fetch fallback open tabs in the window, but `rows` opens them too.

## Deviations

None open. The run decided two: the group score (squared link share) and the refusal of a private landing; see `docs/features/shopping-search/flow.md`.

## Skipped

- The built-in `code-review` skill for the correctness lens: the tree holds untracked files, so the lens ran on the neutral brief instead.
- The security lens stopped early, when a safety classifier ended the agent's last response. Its first pass produced findings 6, 8 and 9 and the memory/CPU probe; the paths it did not reach are listed under "Not checked" in the report.
- Done checks 3 (a fresh session), 5 (a live "no group" reply) and 6 (live pacing): the live run did not check them; tests cover 5 and 6.

## Run verdict
