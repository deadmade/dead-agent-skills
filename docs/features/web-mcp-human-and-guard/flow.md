---
flow: feature
phase: close
now: Built, reviewed and committed; the user pushes and opens the PR.
---

# web-mcp human-like input and injection guard: flow

## Request

> /build-feature docs/features/web-mcp-human-and-injection/research.md

Question (from the approved research report): which changes to web-mcp (and browser-core) would most cut blocks,
captchas, busy errors and timeouts by making its traffic look like one real person's, and which defences would most
reduce prompt injection through the text, images and actions it hands the agent? Picked there: H1 (behaviour and
honest consistency inside ADR 0009), an opt-in bot-check run plus a per-engine block/timeout log, and I0 plus hidden
elements and a 50,000-char cap; capability limits declined as accepted risks.

## Artifacts

- Prior art: [../web-mcp-human-and-injection/research.md](../web-mcp-human-and-injection/research.md) (research run:
  [flow.md](../web-mcp-human-and-injection/flow.md))
- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs: [0017](../../adr/0017-web-mcp-guards-replies-keeps-capabilities.md)
- Glossary: none (implementation terms only)

## Gates

- Gate 1, spec approved: 2026-11-25. Reopened 2026-11-25: plan review F1–F5, F8 changed G1, G2, G4, G5, G7, G8, G9
  (user's decisions in **Plan review round 1**); re-approved with Gate 2 (2026-11-25).
- Gate 2, plan approved: 2026-11-25, subagent-driven execution.

## Skipped

- Prior-art agent and its source check: the approved research report is the prior art (its own source check and
  claim vote ran there).
- Serena symbol lookup: the serena MCP server failed to connect this session; grounding used Explore agents.

## Grounding

Reuses the research run's **Grounding** ([flow.md](../web-mcp-human-and-injection/flow.md#grounding)). Added here
by two read-only Explore agents (read, not run: inferred). Paths under `tools/web/`.

**Input (search typing, browser tool).**

- `typing()` (`web-mcp/src/search.rs:389-421`) builds one batch: `eval performance.timeOrigin`, `click <box>`,
  `press Control+a`, one `press <char>` per ASCII alphanumeric (`press Space` for spaces), `keyboard inserttext` for
  other runs, `press Enter`. Sent as one `agent-browser batch --json --bail` over stdin (`browser-core/src/browser.rs:559,
669-709`); no delay between keys. Typed only when a previous different query exists (`types()`, `search.rs:378`);
  failures fall back to loading the result URL (`search.rs:183-205`).
- Budget: the typing batch must end by `deadline - READ_MARGIN` (2 s, `browser.rs:193`); engine deadline 10 s
  (`search.rs:30`) counted from the won turn (`search.rs:168`); typed read waits ≤ 4 s (`search.rs:40`).
- Busy = waiting > 60 s for the per-engine in-process `Turns` mutex (`engines/mod.rs:169-186`, `search.rs:43,164`).
  Rest = file `<search dir>/<engine>/rest`, 30 min, shared across processes (`browser-core/src/profile.rs:334-347`).
- `browser` tool (`web-mcp/src/tools.rs:~160-312`): `click @ref` and `press` via `ctx.browser.run` (one process);
  `type`/`fill`/`eval` via `ctx.browser.batch` (stdin). Input raises the tab first (`browser.rs:160,597-619`).
- Randomness: none in web-mcp or browser-core; `getrandom 0.4` is already a workspace dependency (root `Cargo.toml:26`,
  used by http-runner).
- Logging: none. The only record per search is the archived `Item::Search` (`search.rs:553-563`) with free-text
  `skipped` reasons ("busy", "timed out", "captcha (.web/…)", "resting until …"); no timings, no structured status.
- Tests: fake agent-browser (`web-mcp/tests/bin/fake_agent_browser.rs`) logs argv/stdin per call to `$FAKE_AB_LOG`;
  typed-search tests in `tests/search.rs:292-490`, a `typing()` unit test near `search.rs:996`; browser tests in
  `tests/browser.rs`.

**Output (what reaches the model).**

- The untrusted sentence is repeated as a literal in 5 places (`fetch.rs:653-656`, `search.rs:575-578`,
  `papers.rs:540-545`, `lookup/mod.rs:124-127`, `tools.rs:272-275`); only `rows.rs:39` has a `const UNTRUSTED`. Tests
  assert on it in `tests/{fetch,browser,search,papers,lookup,rows}.rs`.
- Extraction: `dom_smoothie` Readability → `htmd` (`extract.rs:15-35`), no DOM pre-pass. `rows` removes
  `script, style, template, noscript, [hidden], [aria-hidden="true"]` with `dom_query` (`rows.rs:40,157-158`), reusable.
  Non-HTML text/JSON/markdown pass through as-is (`fetch.rs:334-340`).
- Cap: fetch only, 200,000 chars (or `(24_000 - 1_600·images)·4 - 1` with images), cut at a paragraph break with
  `[… truncated: the full page is at .web/<dir>/page.md]` (`fetch.rs:633-688`). Search, browser, lookup: no cap; rows
  12,000.
- HTTP: UA `web-mcp/<version>`, `Accept` only (`fetch.rs:23,97-107`). 429/503 retried once after `Retry-After` ≤ 10 s;
  other statuses are `FetchError::Status` with no browser fallback (`fetch.rs:417-443`). Browser fallback only for
  near-empty HTML with `allow_private` (`fetch.rs:322-331,380-382`); search passes `browser_fallback: false`.
- Search page text goes through the same `fetch::get` + extraction (`search.rs:~590`), passages under `## [i] {title}`
  lines (`search.rs:458-479`).

## Prior art

The research report: [research.md](../web-mcp-human-and-injection/research.md) (source check 41 confirmed, 3 not
supported, 2 implied; claim vote: E2 and E7 sank, E1 unverified, E21 split).

## Findings

### Task 1: typing in a hidden tab (2026-11-25)

Setup: Chrome for Testing 158.0.8127.88 (headed, fresh profile, `--lang=en-US`), agent-browser 0.43.0 attached with
`--cdp <ws url> --pin-tab --config attach.json` and `AGENT_BROWSER_DEFAULT_TIMEOUT=8000`, one session per tab, the
raise done as browser-core does it (`tab list`, then `/json/activate/<targetId>`). One Windows machine, one run per
cell unless a count is given. Every figure below is **measured** unless marked _inferred_.

**Local page, tab A hidden (`document.visibilityState` `hidden` before and during every keystroke), tab B in front
via `tab t5`.** Batch `[["eval","performance.timeOrigin"],["type","#q","--clear","--delay",D,"--",TEXT]]`, then raise
A and `[["press","Enter"]]` alone:

| delay D | text                 | value after type                    | interval min / median / max (ms)    | submit: value, input focused |
| ------- | -------------------- | ----------------------------------- | ----------------------------------- | ---------------------------- |
| 50      | `hello world`        | `hello world` (`old query` cleared) | 55.1 / 61.8 / 63.9                  | right, focused               |
| 50      | `café 東京 ü`        | exact                               | 54.8 / 62.1 / 63.1                  | right, focused               |
| 50      | 60 chars             | exact                               | 52.1 / 62.4 / 63.5                  | right, focused               |
| 70      | the same three texts | exact, each                         | 75.1–76.7 / 77.2–78.2 / 80.5–82.2   | right, focused, each         |
| 90      | the same three texts | exact, each                         | 91.9–92.6 / 93.9–96.4 / 107.8–108.8 | right, focused, each         |

Intervals are between consecutive trusted `input` events. The medians sit on multiples of 15.6 ms (62.5, 78.1,
93.75): _inferred_, Windows' timer granularity rounds each delay up. 9/9 delivered, 9/9 kept focus through the raise.

**Real engines, typed follow-up in a hidden tab** (`café 東京 ü`, delay 70; the box held `rust borrow checker` from
the cold load). Raise = `tab list` + activate; Enter = the `[["press","Enter"]]` batch; read = the typed read batch
(`wait --fn <ready && new timeOrigin> --timeout 4000`, `get html body`, `get url`):

| engine     | typed text in box       | focus after raise | result `q` = query | type batch | raise | Enter | read | overhead (raise+Enter+read) |
| ---------- | ----------------------- | ----------------- | ------------------ | ---------- | ----- | ----- | ---- | --------------------------- |
| Google     | yes (2nd attempt)       | yes               | yes                | 937        | 138   | 56    | 1101 | 1295                        |
| Bing       | yes                     | yes               | yes                | 840        | 140   | 61    | 1360 | 1561                        |
| DuckDuckGo | **no**: appended to old | yes               | no (old+new)       | 875        | 141   | 108   | 980  | 1229                        |
| Brave      | yes                     | yes               | yes                | 831        | 139   | 404   | 1743 | 2286                        |
| Scholar    | yes                     | yes               | yes                | 776        | 132   | 104   | 651  | 887                         |

- Google, 1st attempt: the fresh profile showed the EU consent dialog (`aria-modal`) over the results. The text
  arrived, but the dialog took focus back after each character, so Enter went to the dialog and the page stayed on the
  old query. After rejecting consent once (what web-mcp's cookie extension does), the 2nd attempt above passed.
- DuckDuckGo: `type --clear` does not clear on the first input after a page load **while the tab is hidden** (5 of 5
  fresh loads; `fill <box> ""` first failed the same way once). Visible, the same first `--clear` cleared (1 of 1); a
  second `type --clear` in the same hidden batch cleared (1 of 1). Once cleared by hand, the typed query landed with
  the right `q` (Enter 123 ms, read 614 ms).
- `type` sends no `keydown`/`keyup`: only trusted `beforeinput`/`input` per character (the local page saw 1 keydown,
  the Enter). `--clear` fires one untrusted `input` event (`isTrusted: false`). Today's per-key `press` sends key
  events. A page that watches keys sees typing with no keys.
- The type batch's cost on top of chars × interval (process start, `eval`, `--clear`) was 35–270 ms.

**Cold result-URL load** (today's fallback: `open`, `wait --fn READY --timeout 8000`, `get html body`, `get url`,
in an existing tab):

- **As web-mcp sends it today, the wait never succeeds:** agent-browser 0.43.0's `wait --fn` times out on any
  expression ending in `;` (`!!(true);` timed out, `!!(true)` returned at once), and every engine's `READY` ends in
  `);` (pinned by a test in `engines/mod.rs`). Google 9430 and 11179 ms, Bing 8874 ms: each the full 8000 ms wait,
  then the read. The typed read strips the `;` (`typed_ready`), so it is not affected. _Inferred_: every first search
  per engine in production waits out its whole budget before reading.
- With the `;` stripped: Google 3704, DuckDuckGo 2310, Brave 1362, Bing 1155, Scholar 688 ms. Slowest: **3704 ms**.

**Values for Task 7.**

- `KEY_EXTRA` (median interval − nominal): +11.8 to +12.4 ms at 50, +7.2 to +8.2 at 70, +3.9 to +6.4 at 90; max
  single interval +18.8 ms. Suggested 16 ms (one timer tick, covers every median; _inferred_ choice).
- `TYPED_OVERHEAD` (raise + Enter + read, plus the type batch's own ~250 ms): max 2286 + 250 ≈ **2.5 s** (Brave);
  median engine 1295 + 250 ≈ 1.5 s.
- `FALLBACK_RESERVE`: **3.7 s** (Google, the `;` stripped). With today's `;` it is the whole wait plus a read, ≥ 8.9 s.

**Step 5's rule** (`chars × (90 + KEY_EXTRA) + TYPED_OVERHEAD + FALLBACK_RESERVE ≤ ENGINE_DEADLINE − READ_MARGIN`):

- Web engines, 8 s: (8000 − 2500 − 3700) / 106 = **16 characters** (19 with `KEY_EXTRA` at the 90 ms median, 4.3).
  Below 20. Per engine (its own overhead and reserve) it would be Google 25, Bing 47, Brave 38, DuckDuckGo 39.
- Papers, 8 s deadline so 6 s: 6000 − 2500 − 3700 < 0: **0 characters** with shared constants (Scholar's own
  numbers, 1.15 s + 0.7 s, would leave 39).
- With today's `;` bug the reserve alone exceeds the budget: 0 characters everywhere.

Result: typing reaches a hidden tab (local page, Google, Bing, Brave, Scholar), but the rule leaves fewer than 20
characters on the web engines, DuckDuckGo's `--clear` fails hidden, and the fallback wait is broken: `NEEDS_CONTEXT`
for Task 7.

## Options

### Injection filter library (added by the user, 2026-11-25)

Picked: add `llm-guard` (Rust, offline rules) and **remove** the spans it flags from replies; the `.web/` archive keeps
the original. This reverses the research run's "no detector library" (its I2 / E35), on the user's request ("I would
also like to add a lib for the injection guard to filter prompt stuff out"). Offered: flag in place (recommended:
false positives cost nothing, pages about injection stay readable), remove (picked), withhold the whole page. Verified
this session (docs.rs llm-guard, fetched 2026-11-25): it detects and returns spans with a severity; "the library never
enforces - the caller decides"; scanners include `BanSubstrings` + curated `patterns`, `RoleOverride`,
`InvisibleText`, `MarkdownLinkSmuggle`, `Deobfuscate`, `TemplateMarkerShape`. Against it: E14, E18 (rephrased attacks
pass), false positives cut real text.

### Seams and approach

Picked: all recommended (2026-11-25): one `guard.rs` that every reply goes through (`guard::reply(source, body)` at
the six Source-line sites), a `pace.rs` in web-mcp with search typing as `fill` → `type --delay` → Enter (browser-core
stays policy-free), a machine-wide JSONL block log in the search folder, and `examples/botcheck.rs`. Rejected: guard
post-hoc in `tools.rs` (parses our own output), a separate guard crate (one consumer), pacing inside browser-core
(search policy in the driver), an `#[ignore]` test for the bot-check (hides output); lite = markers + Unicode
stripping only. Removal leaves `[removed by web-mcp: <scanner>]` and the Source line counts removals (picked over
silent removal). llm-guard 0.2.0 depends on `aho-corasick`, `base64`, `regex`, `unicode-security` (crates.io API,
fetched 2026-11-25); whether `InvisibleText` covers Unicode Tags is still not stated, so in-house stripping stays.

### Typing pace

Picked: fast typist, 50–90 ms per key with jitter, staying inside the 10 s engine deadline (offered: 90–160 ms with a
longer deadline; no limit). Driven by the front-tab lock finding: `click`/`press` serialise engines through
`FRONT_WAIT` 5 s (`browser-core/src/browser.rs:162-176`, verified), so human-speed `press` per key would collide;
`type`/`fill` worked in a hidden tab (same comment, measured 2026-11-06).

## Plan review

### Round 1 (2026-11-25)

Reviewers: correctness (opus), fit (fable, pstack `blast-radius`), simpler (sonnet, ponytail `ponytail-review`).
Correctness and fit ran probes: llm-guard 0.2.0 from crates.io, dom_smoothie 0.19.0 + htmd 0.5.6, and
`agent-browser 0.43.0 --help` (measured). 3 + 16 + 6 findings, merged to F1–F8 plus fixes; none dropped.

- **F1 (blocking, measured by both):** the "Block only" llm-guard set removes ordinary text (`system:` substring in
  "Operating system:", `### Example:`, `[PDF]`, `[README.md](…)`, `<<endl>>`) and never removes injection phrases
  (its `BanSubstrings` defaults to `Warn`). **Decided (user): own Block tables** — multi-word phrases and template
  sentinels through llm-guard's `BanSubstrings`, its `RoleOverride`/`TemplateMarkerShape`/`MarkdownLinkSmuggle` off,
  an ordinary-docs test with 0 removals. Spec G7, ADR 0017 changed.
- **F2 (should-fix, inferred arithmetic):** 60 chars × 90 ms + Enter step + raise + typed read overruns the 10 s
  deadline (papers 8 s), leaving no time for the URL fallback. **Decided: type only when it fits the budget**, with the
  overhead measured in Task 1. Spec G1 changed.
- **F3 (should-fix, measured `mouse move <x> <y>` only):** mouse move needs `get box`, a random seed and a
  browser-core change to keep the tab raise. **Decided: dropped for now**, parked. Spec G2 changed.
- **F4 (should-fix):** pacing built before the log that measures it. **Decided: log before pacing** in this branch.
- **F5 (should-fix, measured):** Readability already drops `[hidden]`, `aria-hidden`, `<template>`; the pre-pass
  would lose `<noscript>` images. **Accepted:** Task 4 is a regression pin; spec G8, ADR 0017 changed.
- **F6:** one `guard::reply` with web-mcp's own lines after the closer (fit 7, 16; simpler 4). **Accepted.**
- **F7:** lookup's and wayback's later cuts would chop the closer (fit 2). **Accepted:** cut before wrapping;
  `fetch::render` takes a cap.
- **F8:** the 403 retry hid the status, reused the empty-page wording, inverted raw/rendered (fit 6; correctness 10).
  **Accepted:** a note, near-empty keeps the error, `browser_page` reason parameter, `rendered: Some`.
- **Fixes accepted with "Accept all":** `type <sel> --clear --delay N -- <query>` (measured syntax); the fake's
  larger rewrite named; browser `type` ≤ 5 s; outcome `unresolved` and an outcome value instead of parsing strings;
  getrandom fallbacks; the `200_000` pins; one cap; stale docs (`FRONT_WAIT`, README `:65-72`, `tools.rs` `--`
  comment); botcheck through `browser_core`; strict task order; headroom-trim note; Task 5's 127.0.0.1/127.0.0.2
  test setup.
- Spec change: "guard before cap" became "fetch cuts the text first, with a 2,000-char margin" (my call, so the guard
  stays one function; listed for the Gate 1 re-approval).
- **Fix check (fresh agent):** F7 and F8 FAIL as first applied (lookup's `CUT_NOTE` still appended inside the
  block; the 403 test's casing and the private-landing message missed). Fixed in the plan.
- **Fresh-eyes reviewer B:** B1 notes carry external text (notes now stripped; passage-less titles moved into the
  body), B2 divide by zero on empty `type` (rejected), B3 placeholders can push past the cap (re-cut, test with
  20,000 `[INST]`), B4 no room left for the URL fallback (`FALLBACK_RESERVE`), B5 per-key cost above the nominal delay
  (`KEY_EXTRA`), B6 Task 1 blocking everything (holds only Task 7), B7 Task 1 measured one engine (all five), B8
  whitespace variants pass the tables (recorded in spec G7 and ADR 0017), B9 the "raised to Block" claim (dropped;
  severity unused), B10 the retry's `allow_private` gate (stated in G4). All applied; no new user decision needed
  (each follows from a decision already made).
- **Fresh-eyes reviewer A (opus):** 0 blocking, 9 should-fix, 4 consider. Applied without a decision: fallback
  reserve and per-key extra (as B4/B5), Task 1 prefills the box and checks focus after the raise, rows' hint and
  `Showing` lines stay in the body (they quote the page), the re-cut (as B3), `type` empty text (as B2), the fake's eval
  literal rule and `type … --clear` typing-batch rule, the budget test built from the constants plus a `types()` unit
  test, the strip list widened (U+00AD, U+2061–U+2064, U+E0100–U+E01EF; U+FE00–U+FE0F kept), the retry's error as
  `Network` text, the log write awaited, browser error text stripped and ADR 0017 narrowed to "replies carrying page
  text". Whitespace bypass (A10) recorded as accepted (B8). **Decided (user):** `browser eval` output gets markers and
  stripping only (`Scan::Keep`; no archive to recover from); the browser retry covers 403/503 only and takes the
  host's request slot first (a 429 keeps today's `Retry-After` retry). Spec G4, G7 and ADR 0017 changed.

## Tasks

- Task 1 (measure typing): NEEDS_CONTEXT. Typing reaches a hidden tab, but `type` sends no key events, DuckDuckGo's
  first `--clear` fails hidden, and only 16 characters fit with shared constants (Findings). It also found an existing
  bug, re-measured by the conductor (`wait --fn "!!(true)"` 256 ms, `"!!(true);"` timed out at 3 s): every engine's
  `READY` ends in `;`, so every result-URL load waits its whole budget. **Decided (user, 2026-11-25):** fix the `;`
  first (new Task 6, before the log) and defer paced search typing (old Task 7; spec G1 deferred, G10 added). The
  browser tool's pacing (Task 8) now creates `pace.rs`.
- Task 2 (guard): `10188f86`, 13 tests. Spec review: all PASS. Quality review (measured with a probe): quadratic
  in-place replacement (2 MB + 50,000 hits: 2.08 s), forged markers left as they are, more invisible code points, an
  unstripped Source line, phrase bypasses (whitespace, NBSP, Turkish İ; recorded as accepted). Fixed by the conductor in
  `f5c86cf4`: one forward pass, `<<untrusted-`, `<</untrusted-` and `[removed by web-mcp:` added to the template
  table, Source line stripped, U+206A–206F, U+FFF9–FFFB, U+034F and Hangul fillers stripped, 15 tests pass, clippy
  clean. `Cargo.lock`'s `windows-sys` 0.59/0.60 → 0.61 moves come back on a minimal offline resolve too (cargo's
  unification, kept).
- Task 3 (wire the guard): `8b176422`. Spec review: all PASS. Quality review: forged markers passed in `Scan::Keep`,
  the re-cut emptied a sentinel-flood page, the cap counted in `char`s while the client likely counts UTF-16 units,
  browser and upstream error texts unguarded. Fixed by the implementer in `94ee1e06` (conductor's brief): a `marker`
  table (`<<untrusted-`, `<</untrusted-`, `[removed by web-mcp:`) runs in both modes, lookup shows the count; the
  first re-cut scales, then a backstop; over-cap check in UTF-16 units; browser errors through `reply` with `Keep`,
  other error texts stripped; `SHOWN_URL` 300 (fetch's Source line shortens long URLs, added because the hard cut is
  gone). Conductor reran `cargo test --locked -p web-mcp`: all pass (188 unit, 32/25/39/1/11/23/41 integration).
- Task 4 (hidden-elements pin): `34e017de`, `hidden_elements_stay_out` passes on unchanged extraction; conductor read
  the diff (small, no separate reviewers).
- Task 5 (Accept-Language, 403/503 retry): `dffc369c`. Spec review: all PASS. Quality review: the landed URL dropped,
  the browser load outside the fetch deadline, the `fetch` description still sending blocks to the browser tool, a
  weak empty-rendering test. Fixed in `86c941ec` (`browser_page` returns the landed URL; the retry gets the remaining
  deadline, so `browser_core::Browser::rendered_html` takes a deadline; description updated; tests strengthened).
  Conductor reran `cargo test -p web-mcp -p browser-core`: all pass.
- Task 6 (ready checks without `;`): `6c4f3376`, pin test failed first, then all six `READY` consts fixed and
  `typed_ready`'s strip dropped. The conductor found the commit had garbled a `ü` to `Ã¼` in an engine test query
  (a non-UTF-8 write) and restored it in `500bb20e`; no other commit on the branch has such bytes.
- Task 7 (block log): `2c8d6eb3`. Spec review: all PASS. Quality review: a cut Google link walk logged as
  `unresolved` (a block) instead of `timeout`; `empty`/`timeout` untested; the concurrency test used one process.
  Fixed in `9f24c73a` (`resolve_goto` tells the two apart; outcome checks on existing tests; two servers on one
  folder). Not done: size cap/rotation (about 110 bytes a line, tens of MB a year), renaming `blocked`. Conductor
  reran `cargo test -p web-mcp`: all pass.
- Task 8 (browser tool typing): `f33b2da2`, `pace.rs` with `BROWSER` only, `type --delay N -- <text>`, empty text
  rejected; conductor read the diff (small, no separate reviewers).
- Task 9 (bot-check example): `48595ec4`, builds and lints; not run against the live sites (the user's, by hand:
  `cargo run -p web-mcp --example botcheck`). Its reading of `get text body` was a guess; the conductor measured
  agent-browser 0.43.0's reply (`data.text`, which `Browser::run` returns as `["text"]`), matching what the example reads.
- Task 10 (docs): `187ba1f6`, `docs/components/web-mcp.md` and the plugin README; tool descriptions unchanged (the
  `fetch` one changed in Task 5). `npm test`: 601 of 612 pass, the 5 failures are the known `EPERM … symlink` ones.

## Rulings

## Parking lot

- Paced search typing (spec G1), deferred after Task 1: decide from `blocks.jsonl` once it has data; options measured
  in Task 1 (per-engine constants with two `--clear` passes, `press` per key under the front lock, `keyboard type`
  in a hidden tab, not yet measured).

- From the research run: `docs/adr/`: an ADR recording stealth (H2) rejected again and private addresses and `eval`
  kept open as accepted risks (follow-up "in the build run"). Done in the grill: ADR 0017.
- From the research run: `check-repo.mjs` should fail on two ADRs with the same number (follow-up).
- From the research run: `docs/adr/0009-hosted-search-first.md` (only on the main checkout's `upgrade-run` branch, not
  on this branch's base) describes unbuilt hosted search (follow-up).

## Deviations

- Task 3: fetch's Source line shortens URLs over 300 characters; the cap is counted in UTF-16 units; marker and
  placeholder copies are removed in both scan modes (a third `marker` table); a no-results search sends an empty block
  with "No results from …" as a note.
- Task 5: the retry runs in `fetch::get`'s task (clippy `too_many_lines` in `run`); `rendered_html` in browser-core
  gained a `deadline` parameter (outside Task 5's file list); the `fetch` description changed here instead of Task 10.

## Walkthrough

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |

## Review

Whole-branch review (fresh agent, opus, 2026-11-25), after the user picked "Review, then commit docs": 0 blocking, 6
should-fix, 4 nits. Fixed in `be9cd517` (code, tests) and `0268299d` (docs):

- The 403/503 browser retry passed a refusal the browser also got as success: now HTML only, and the browser's own
  navigation status (`responseStatus`, measured on agent-browser 0.43.0: 403/200 as a number) keeps a ≥ 400 an error.
- Server-controlled text outside the block (Content-Type, refused redirect URLs, serde messages quoting replies): mime
  types keep token characters only, redirects show their scheme or host only, lookup's JSON errors give line and column.
- With the `;` gone, ready checks that are true on self-clearing challenges (Semantic Scholar's `#challenge-container`,
  Bing's Turnstile iframe) would end the wait early and rest the engine: dropped from `READY`, kept in block detection.
  Every `READY` also waits for `document.readyState !== 'loading'` (a streamed page read part-way).
- Docs: ADR 0017 committed with the branch; `type` described as inserting characters (no key events); the cap counts
  UTF-16 units; the retry returns no images; a search without a window logs no line; agent-browser 0.43.0 named as the
  minimum.

Open: Semantic Scholar's `READY` still ends on `document.title === 'Human Verification'`; whether that title also shows
on the self-clearing stage is not known (no fixture has a title). Conductor reran `cargo test -p web-mcp -p browser-core`
(all pass), clippy (exit 0) and `cargo fmt --check`; no mojibake in `git diff 7741a1b4..HEAD`.

## Learned

- agent-browser 0.43.0 never finishes `wait --fn` on an expression ending in `;` (measured); every untyped search had
  been waiting out its whole budget. Now in `docs/components/web-mcp.md` and pinned by a test.
- agent-browser's `type --delay` sends `input` events only, no `keydown`/`keyup`, and DuckDuckGo's first `--clear` fails
  in a hidden tab (measured, Task 1): pacing search typing this way would look less human, not more.
- A PowerShell write turned `ü` into `Ã¼` in one commit; checking each diff for `Ã`/`Â`/`â€` caught it.

## Run verdict

Built: G2–G10 (G1, paced search typing, deferred by the user after Task 1's measurement and parked). 18 commits on
`t3/web-mcp-human-injection`; every task reviewed (spec and quality reviewers on the larger ones, the conductor on the
small ones), then a whole-branch review. Not checked: `examples/botcheck.rs` against the live sites (the user runs it
by hand); the block log's real block rates (it needs time to fill).
