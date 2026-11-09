---
flow: feature
phase: done
---

# web-mcp Google block: flow

## Request

> Hey, so I have one problem I still get quite often blocked by google even just using the browser but only the tab
> with the browser does when I do it normaly it doesnt. Could we evaluate this, and create a plan to fix this issue?

## Artifacts

- Spec: [spec.md](spec.md)
- Findings: [findings.md](findings.md)
- Plan: [plan.md](plan.md)
- ADRs: 0009 (to write in the build; decided in the grill)
- Glossary: GLOSSARY.md (Automation flag, Typed search)

## Gates

- Gate 1, spec approved: 2026-11-03 ("I approve"). Reopened 2026-11-03: plan review D2 (agent-browser's
  `keyboard type` inserts text, so "real keystrokes" becomes one `press` per character) and D3 (filtered searches
  always load the URL) change G3 and the typing decisions; D1, D5, D6 sharpen the wait and the fallback.
  Re-approved 2026-11-03 with Gate 2 ("I approve"), with round 2's R2-1 and R2-2.
- Gate 2, plan approved: 2026-11-03 ("I approve, subagent-driven"), execution: subagent-driven

## Skipped

## Grounding

- "The browser" is web-mcp's `browser` tool (`crates/web-mcp/src/browser.rs`), which drives agent-browser 0.41.1
  (`tools/installer/assets/agent-browser.json`; installed at `~/.claude/bin/agent-browser`).
- **The installed web-mcp is older than the code.** `~/.claude/bin/web-mcp` (`0.6.1`, built 2026-10-28) has neither
  `--pin-tab` nor `attach.json` among its strings. The one-window rewrite (ADR 0007, PR #92, `1f1eb65`, 2026-10-30)
  came after it. The search folder `~/.local/share/web-mcp/` still holds the old per-engine profiles (`google/`,
  `bing/` and so on, `headed: false`, Consent-O-Matic) and no `profiles/` slot. The latest release is v0.6.17.
- **What a `browser` tab shows sites today** (probe of httpbin.org/headers plus `navigator`, 2026-11-03, session
  `diag`): `User-Agent: … HeadlessChrome/154.0.0.0 …`, `navigator.webdriver: true`, Sec-CH-UA brands
  `Chromium/Google Chrome 154`, `languages: [en-US]`, a 1280x720 window. In the old code a `browser` session is a
  throwaway agent-browser session with no `--config` of web-mcp's (`git show 1f1eb65~1:crates/web-mcp/src/browser.rs`
  around line 313), so agent-browser's defaults apply: `~/.agent-browser/config.json` names Helium, headless. A
  headless UA and `webdriver: true` are each enough for Google's `/sorry` page.
- **The current code** (`crates/web-mcp/src/window.rs`, `profile.rs:204-216`): one owner session launches headed
  Helium with the slot profile, the idcac extension, `userAgent` = a reduced `Chrome/<major>` UA
  (`profile.rs:507-517`) and `--lang=en-US`. Every `browser`, engine and fetch-fallback session attaches with
  `--cdp <url> --pin-tab` under `attach.json` (`{"idleTimeout":"3600s"}` only, `profile.rs:222-228`), so the
  owner's `userAgent` may not reach attached tabs.
- **What the current design would show** (probe 2026-11-03: agent-browser 0.41.1 by hand, the owner config of
  `profile.rs:204-216` without the extension, a scratch profile, headed Helium 154, httpbin.org/headers):
  - owner tab: `User-Agent` is the override, but **no `Sec-CH-UA` header and `userAgentData.brands` is empty**. A
    Chrome UA with no client hints is a mismatch no real Chrome produces.
  - attached tab (`--cdp … --pin-tab`, where `browser`, search and fetch run): Helium's own UA (`Chrome/154`, not
    headless) with matching `Sec-CH-UA`. So the override never reaches the tabs that do the work.
  - both: **`navigator.webdriver: true`**.
- Google block detection: `/sorry` path or `#captcha-form` (`engines/google.rs:70-75`). Google URLs carry
  `hl=en&gl=us&num=10` (`engines/google.rs:20-35`). Earlier findings: Google rate-limits the residential line after a
  burst; from a DE IP `/search` went to `/sorry` even with consent answered (`web-mcp-search/findings.md:197-208`,
  `web-mcp-one-window/findings.md:111-114`).
- ADR 0004: "No stealth. Normal browser settings are allowed (a regular user agent, window size,
  `Accept-Language`). Fingerprint patching is not. An engine that keeps blocking is dropped or switched to headed,
  not disguised." ADR 0007 makes every tab share the window's profile.

- **The user, 2026-11-03:** the blocks happen on both machines: "windows with the new one window setup and nixos
  with the old setup". So the one-window design is blocked too, which points past the headless UA to signals both
  share (`navigator.webdriver`, the UA/client-hint mismatch).
- **The user, 2026-11-03:** "the first goal would be to find out why we are flagged by google and also other sites.
  Dont really want to solve capatches over and over again! What would be important for me is that after a search we
  also hold the tab open and when we search again, we utilize the already open page". So: diagnosis first, Google
  and other sites; no captcha hand-off as the answer; search reuses its open page.
- Search today (`search.rs:118-190`, `browser.rs:563-601`): each engine has one tab (`search-<engine>`,
  `browser.rs:269`) that stays open after a good search; each search runs `open <result URL>` in it, a fresh
  navigation with no referrer from the page before. A failed render closes the tab. A block rests the engine
  (`profiles.rest`). The old NixOS build has no such tab: a headless Chrome per engine.
- **The user, 2026-11-03:** a follow-up search should type the query into the open page ("if it would be possible
  typing the next query into the page"), not load a new result URL.
- **The user, 2026-11-03:** the diagnosis is a one-off investigation that drives this fix ("idealy the one off
  investigation fixes things and I dont have to do it again"), not a check web-mcp keeps.
- **Spike (throwaway), agreed 2026-11-03** ("go ahead but use the new code!"): build web-mcp from `main` and drive
  its `browser` tool against bot-check pages and at most three Google searches, as it is and with the automation
  flag off and the UA override removed. Results go to [findings.md](findings.md). Its code lives in the scratchpad,
  isn't building and doesn't pass Gate 2; keeping any of it goes through the plan.
- **Spike result, 2026-11-03** ([findings.md](findings.md)): `navigator.webdriver` (from agent-browser's
  `--remote-debugging-port=0`) is the one signal every bot check names. `--disable-blink-features=AutomationControlled`
  turns it off in every tab; then sannysoft and browserscan pass, CreepJS drops to 0% headless, and two typed Google
  searches got results while the unchanged code got `/sorry` on its first. A fixed debugging port breaks
  agent-browser. The user's own Chrome (control): human on every page. Still flagged with the switch:
  deviceandbrowserinfo's `isAutomatedWithCDP` and two inconsistencies; Google ignored them. Windows unmeasured.
- **Spike (throwaway), agreed 2026-11-03** ("go ahead but use the new code!"): build web-mcp from `main` and drive
  its `browser` tool against bot-check pages and at most three Google searches, as it is and with the automation
  flag off and the UA override removed. Results go to [findings.md](findings.md). Its code lives in the scratchpad,
  isn't building and doesn't pass Gate 2; keeping any of it goes through the plan.
- **Spike result, 2026-11-03** ([findings.md](findings.md)): `navigator.webdriver` (from agent-browser's
  `--remote-debugging-port=0`) is the one signal every bot check names. `--disable-blink-features=AutomationControlled`
  turns it off in every tab; then sannysoft and browserscan pass, CreepJS drops to 0% headless, and two typed Google
  searches got results while the unchanged code got `/sorry` on its first. A fixed debugging port breaks
  agent-browser. The user's own Chrome (control): human on every page. Still flagged with the switch:
  deviceandbrowserinfo's `isAutomatedWithCDP` and two inconsistencies; Google ignored them. Windows unmeasured.

## Prior art

Background agent (sonnet), 2026-11-03; agent-browser read at v0.41.1 (`5868f7c`).

- **agent-browser's launch** (`cli/src/native/cdp/chrome.rs:467-480`): `--remote-debugging-port=0`,
  `--disable-popup-blocking`, `--disable-hang-monitor`, `--disable-sync` and others; no `--enable-automation`.
  [MDN navigator.webdriver](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver): Chrome sets it for
  `--enable-automation`, `--headless`, or `--remote-debugging-port` with port 0.
- **The `userAgent` option** (`native/browser.rs:762-769`): one `Emulation.setUserAgentOverride {userAgent}` on the
  owner's first page, no `userAgentMetadata`; never on `--cdp` sessions (`main.rs:349`). The
  [CDP protocol JSON](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/browser_protocol.json):
  "`userAgentMetadata` must be set for Client Hint headers to be sent". [MDN UA
  reduction](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/User-agent_reduction): Chrome's own UA is already
  the reduced `Chrome/<major>.0.0.0` form, so the override adds nothing.
- **On attach** (`browser.rs:1031-1051`): `Page`, `Runtime`, `Network` enable, `Target.setAutoAttach`. The
  `Runtime.enable` tell: [rebrowser-patches](https://github.com/rebrowser/rebrowser-patches) (vendor README) says
  anti-bot products detect it; a [crawlex blog](https://blog.crawlex.net/blog/detecting-cdp-runtime-enable/) (blog)
  says V8 closed its main form in M137. Same README: `--disable-popup-blocking` is page-observable.
- **Approaches:** A subtract (hygiene: drop the UA override, needless switches and params; Playwright
  [emulation docs](https://playwright.dev/docs/emulation), [nodriver config](https://raw.githubusercontent.com/ultrafunkamsterdam/nodriver/main/nodriver/core/config.py));
  B attach to a browser the user started (agent-browser `--auto-connect`, `docs/content/docs/cdp-mode.mdx:70-74`;
  [browser-use real browser](https://docs.browser-use.com/open-source/customize/browser/real-browser)); C treat
  `/sorry` as expected (cool down, fall back, hand off); D stealth stack (rebrowser,
  [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright), [Camoufox](https://camoufox.com/)). CDP also has
  `Emulation.setAutomationOverride` (experimental).
- **Google:** [help 86640](https://support.google.com/websearch/answer/86640) counts robots, programs and scrapers as
  automated traffic; [ToS](https://policies.google.com/terms) bans "bypassing our systems or protective measures";
  [TechCrunch](https://techcrunch.com/2025/01/17/google-begins-requiring-javascript-for-google-search/) JS required
  since Jan 2025; `num=10` is the default ([Decodo](https://decodo.com/blog/google-removes-num-100-parameter), blog).

## Options

- **The automation flag, 2026-11-03.** Offered: turn `navigator.webdriver` off as misconfiguration, or keep it as an
  honest signal and fix around it (pacing, a Google sign-in, captcha handed to the user). The user: "turn the flag
  off, it's just misconfiguration". This narrows ADR 0004's "no stealth" line, so it needs an ADR.
- **How the flag goes off, 2026-11-03.** Offered: A `--disable-blink-features=AutomationControlled` in the owner's
  `args`; B CDP `Emulation.setAutomationOverride` per tab (web-mcp's own CDP client); C a fixed debugging port
  (measured broken). Recommended A. The user: "A". Also asked for: "Drop the userAgent!" Rejected: B (a new CDP
  client and a held session per tab for the same result), C (breaks agent-browser).
- **Follow-up searches, 2026-11-03.** Offered: A real keystrokes (`click`, `Control+a`, `type`, `Enter`) in the search
  batch, URL on a tab's first search; B `fill` then Enter (no key events); C JS sets the value and submits; the
  smallest option, flag off only and URLs kept. Recommended A. The user: "2A". Rejected: B and C (less like a
  person), the smallest option (the user asked for typing).
- **NixOS:** no code; re-running the installer replaces the stale binary (`tools/installer/steps/binaries.ts:1-3`,
  it downloads the release unless one is on PATH).

## Plan review

Round 1, 2026-11-03: Correctness (opus), Fit with blast-radius (fable), Simpler with ponytail-review (sonnet).
Duplicates merged, none dropped. The user: "go" (every recommendation).

- **D1 (blocking): a typed search could return the old query's rows.** Enter doesn't wait for navigation and the
  wait may fail. Picked: the typed wait needs a new document (`performance.timeOrigin` changed) and `ready_js`;
  after it, the page counts only if the landed `q` equals the query, else the URL loads.
- **D2: `keyboard type` is `Input.insertText` in 0.41.1** (no key events). Picked: one `press <char>` per ASCII
  character, inserted text for the rest. Spec G3 reworded.
- **D3: the filter after typing is unmeasured.** Picked: only searches without `since` type; the remembered state is
  the last query.
- **D4: typing on result pages never ran.** Picked: a second spike before Gate 2 on all five engines with
  agent-browser 0.41.1; engines that fail don't type.
- **D5: the typing batch** gets `--bail`, a timeout of the deadline less the read margin, and no rebind or retry;
  any failure falls back to the URL.
- **D6: queries with control characters or untrimmed or doubled spaces** load the URL.
- **Batch:** Task 1 names `browser_order_is_env_then_newest_cft_then_helium_then_chromium` and the Windows-only
  `windows_never_runs_a_browser_for_its_version`, keeps `four_part`, fixes line ranges; `render(url: Option<&Url>)`;
  the fake learns each tab's page in that task, typing batches read no page marker, a `nonav` marker and a test
  across a Chrome restart; the typed wait is built in `search.rs`, `engines/` only gains `search_box()`, the
  tautology test goes, Google joins the selector test after capture; `google.html` from the open tab,
  `google-none.html` one nonsense search; `version()` returns a bool; the README step claims no generated copies;
  Task 1's commit carries the glossary.

Round 2, 2026-11-03: one Correctness and Fit reviewer (opus) on the revised plan. D1–D6 and the batch were all
carried. Measured before deciding ([findings.md](findings.md), "Spike 3"): a `click` on a missing box fails at once
(its "fails slowly" finding dropped); capitals, digits and a leading `-` in `inserttext` type correctly (its `-`
finding dropped); `eval` in a batch answers the number at `result.result`. The user: "I approve" (every
recommendation).

- **R2-1: Enter that doesn't navigate** ran the typed wait out and left the fallback no time. Picked: the typed read
  is capped at the read margin + 4 s (spike 2's slowest typed wait: 2.9 s); the fake runs out the wait under `nonav`.
- **R2-2: a typed block page** (Google's `/sorry` carries its own `q`) would trigger a second request. Picked: the
  typed page is parsed first; a block is handled as today; only results or an unrecognised page need `q` to match.
- **Fixes:** `batch_once` moves to Task 3 (dead code in Task 2 on a binary crate); `batch_once` takes
  `std::time::Instant`, `typing` returns what it takes, the origin is `result.result` (a non-number fails the typing
  batch); the fake defines a typing batch ("no `open`, holds a `click`"), writes `<session>.typed`, and `batches()`
  matches the `batch --json` prefix; owner-log counts before and after; `cargo test -- a b`; Task 1's grep adds
  `version(` and `VERSIONS`; Task 4 captures `google.html` by hand with agent-browser and types "Tokio 1.x vs
  smol"; ADR renumbered 0009 (0008 is `python-through-installer-uv`). Not taken: `render(None)` skipping the rebind
  (the cap bounds it).

## Tasks

Worktree `.claude/worktrees/web-mcp-google-block`, branch `worktree-web-mcp-google-block` from `2baae14` (=
origin/main). This flow folder and the glossary edit were moved here from the main checkout; the main checkout's
`GLOSSARY.md` still holds the same two entries uncommitted (the worktree guard refuses commands there).

- Task 1: base 2baae14, untracked at start: docs/features/web-mcp-google-block/{findings,flow,plan,spec}.md;
  commit 3b083b9; files clean (AGENTS.md, GLOSSARY.md, profile.rs, ADR 0004, ADR 0009; new untracked
  `node_modules` is an environment symlink, see Rulings). Review: approved, Minor only (parked for the final fix
  wave: ADR 0009 wording, stale stub version strings).
- Task 2: base 3b083b9, untracked at start: the flow folder's four files, `node_modules` (symlink); commit
  60ecd42; files clean (browser.rs, search.rs, the fake). Review: approved, Minor only (two carried into Task 3).
- Task 3: base 60ecd42, untracked at start: the flow folder's four files, `node_modules` (symlink); commit
  9af36d5; files clean (browser.rs, engines/mod.rs, profile.rs, search.rs, the fake, tests/search.rs, the README).
  Review: approved, Minor only (eight parked for the final review; two of them would change the plan: a cap on the
  typing batch, a tolerant origin compare).
- Task 4: base 9af36d5, untracked at start: the flow folder's four files, `node_modules` (symlink). Run in the
  coordinating session; commit 0c325e6; files clean (google.html created, google.rs, engines/mod.rs, AGENTS.md;
  findings.md in the untracked flow folder). `google-none.html` not created (Rulings). Deviation: Google's `/goto`
  links (Deviations, decided D). Review: Needs fixes (the fixture's scrub missed session tokens); fixed and the
  unpushed commit amended to 08af6e7 (Rulings).
- Final whole-branch review (fable), 2baae14..08af6e7: With fixes. Fix wave (one fixer, sonnet): the fixture's
  three sibling request ids and YouTube tokens (amend, 08af6e7 → f201a36), ADR 0009 wording, a `checked_sub`
  comment, a test pinning the typed wait (14433d5). Scoped re-review: all addressed, no new breakage. Left for the
  user at verify: typing an empty query or one with `--` (would change D6). Docs folder: committed at the finish.
- Verify self-review (2026-11-04): 15 findings; the user chose "all fix-before-PR" (3–9), fixed in the coordinating
  session. AGENTS.md:97 and the README no longer claim Google types or answers "no results", and AGENTS.md describes
  the typed path and the fake's rules. The `since` condition is now in the doc comments. ADR 0009 and GLOSSARY
  wording now matches the three-search sample. Tests added: three searches typed twice, slow typing timing out with
  no second load (the fake's `<engine>.slowtype`), and a trailing inserted run. Still open at the decisions gate: spec
  items 1 (Google's typing waits on the `/goto` follow-up) and 2 (the spec's "put back only on results" omits
  `since`), and Consider items 10–15.

## Rulings

- 2026-11-03, pre-flight: Task 3's `no_navigation_falls_back_to_the_url` asserts the typed read's `wait --timeout`
  is exactly 4000 (cap READ_MARGIN + 4 s less render's READ_MARGIN), not "at most 6000" — the plan's own formula
  gives 4000 — a test edit if the cap was meant differently.
- 2026-11-03, Task 1: the implementer symlinked `node_modules` and `.pre-commit-config.yaml` from the main checkout
  so the pre-commit hook could run in the worktree; kept for later tasks, removed before finishing, never staged —
  environment, not task code — a stray symlink commit if someone runs `git add -A`.
- 2026-11-03, Task 4: no `google-none.html` — a nonsense query got "About 577 results", and hunting a no-results
  page costs more Google requests; `google_no_results_is_empty` stays ignored with that reason — the no-results
  marker stays unverified.
- 2026-11-03, Task 4: commit message "Capture Google's result page as a fixture …" (singular) instead of the plan's
  "pages" — one page was captured — none.
- 2026-11-03, Task 4: the live check ran on the warm profile after a cold first pass, plus a `main` control and
  three Bing-only searches, to tell the branch's behaviour from the environment's — about a dozen Google requests
  in all today, none blocked — more Google traffic than the plan's two searches.
- 2026-11-03, Task 4 review fix: the fixture's re-scrub (request id everywhere, `gsessionid`, `sstk`, `fbs`, `ved`,
  `opi`, URL-encoded parameters, `data-msei`/`mstk`/`mrc` and others) went into the unpushed Task 4 commit by
  amend (0c325e6 → 08af6e7) so no token reaches history; its scoped re-review is folded into the final review —
  a missed token would surface only there.
- 2026-11-03, final review: the fix wave took the fixture's sibling ids and YouTube tokens, ADR 0009 wording, a
  `checked_sub` comment and a typed-wait assert; the `--`/empty query finding goes to the user (it changes D6) —
  one more decision for the user.
- 2026-11-03, fix wave: per-response UUIDs (`data-icl-uuid`, `data-suuid`) and one opaque `data-ffd` blob stay in
  the fixture — random per response, not session-bound — a re-scrub later if they matter.
- 2026-11-03, fix wave: two lines over 120 columns (src/search.rs:529, tests/search.rs:123) stay — rustfmt and
  clippy accept them — cosmetic.
- 2026-11-03, Task 4: the scoped re-review of the fixture fix was folded into the final review, which re-checked the
  scrub — none (a second re-review then ran over the fix wave anyway).

## Deviations

- **2026-11-03, Task 4: Google's result links are opaque redirects.** The captured result page (live, branch build,
  no `/sorry`) has its rows where the parser looks (`#rso .MjjYud`, `a:has(h3)`, `.VwiC3b` snippets), but every
  row's `href` (and `ping`) is `/goto?url=CAES…`, an encrypted blob; the target appears nowhere in the row (only in
  the AI Overview's script data). The parser keeps them as `www.google.com` links and drops them as Google's own,
  so every Google page parses as "unrecognised" — on `main` too (control run). `udm=14` uses the same links. A full
  `/goto` link answers a plain cookie-less GET with `302` to the target (checked once). Task 4 says "fix only its
  selectors", which can't fix this. Options: A resolve each row's `/goto` with web-mcp's HTTP client (redirects
  off, read `Location`; a new outside call, ~10 small requests to google.com per search); B keep the `/goto` rows
  and let the existing page fetch follow the redirect, reporting the landed URL (changes the search data flow);
  C drop Google from the default engines until fixed; D finish this branch with `google_parses_fixture` ignored
  under the new reason and fix Google's links in a follow-up flow. Recommended: D. Decision, 2026-11-03: D
  ("Follow-up flow"). Task 4 commits `google.html` (scrubbed), keeps both Google parser tests ignored with the
  `/goto` reason, adds Google to the search box test, and records the finding.

## Walkthrough

| spec goal                                         | plan task        | file:line                                                                                                                                                                                                                                                                                           | test                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 automation flag off in every tab               | Task 1           | `crates/web-mcp/src/profile.rs:209` (`owner_config` args)                                                                                                                                                                                                                                           | `profile.rs:791` `owner_config_is_exact`; live: findings.md "Build check" (`webdriver: false`, sannysoft clean)                                                                                                                                                                          |
| G2 no UA override; the UA-only code gone          | Task 1           | `profile.rs:200-215` (no `userAgent`), `profile.rs:400` `pick`, `profile.rs:455` `starts`                                                                                                                                                                                                           | `owner_config_is_exact`; `browser_order_…`; live: Helium's own UA with `Sec-CH-UA`                                                                                                                                                                                                       |
| G3 follow-ups typed (new plain query, no `since`) | Tasks 2, 3       | `search.rs:152` (`prev = last.take()`), `search.rs:264` `types`, `search.rs:275` `typing`, `search.rs:311` `typed_ready`, `search.rs:226-262` `typed_page` (cap `search.rs:33`, `:253`), `browser.rs:520` `batch_once`, `engines/mod.rs:132` `search_box`, `browser.rs` `render(url: Option<&Url>)` | unit: `search.rs:581`, `:598`, `:618`, `browser.rs:1058`, `engines/mod.rs:367`; integration `tests/search.rs:285-454` (stays, same query, since, odd query, missing box, no navigation, typed block, gone tab, restart, consent); live: Brave and Bing typed (findings.md "Build check") |
| G4 ADR                                            | Task 1, fix wave | `docs/adr/0009-no-automation-flag.md`, `docs/adr/0004-browser-search.md` (No stealth bullet), `AGENTS.md:97`                                                                                                                                                                                        | review only                                                                                                                                                                                                                                                                              |
| Google fixture (decision)                         | Task 4           | `crates/web-mcp/tests/fixtures/engines/google.html`, `engines/google.rs:1-4`                                                                                                                                                                                                                        | `search_boxes_match_one_element_in_the_fixtures` (Google row); `google_parses_fixture` ignored (`/goto`, Deviations)                                                                                                                                                                     |

Code with no goal: none found. `engines/google.rs`'s ignore reasons and doc and `AGENTS.md`'s capture sentence
serve the Task 4 decision; the fake's changes (`tests/bin/fake_agent_browser.rs`) serve G3's tests.

## Run verdict

| Part        | State                                                                                                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checks      | green: build, `cargo test`, clippy, fmt, `npm test`, `check:harnesses`, typecheck, run on the tree committed as ace5d12; since then only the flow folder and the audit report changed (untracked docs)                                                          |
| Review      | self-review, 15 findings: 3–9 fixed (ace5d12); spec 1–2 fixed in spec.md; 15 (privacy) trimmed in findings.md; 10–14 left by the user as follow-ups (the typed-read race, debug traces, empty or `--` queries (D6), small test gaps, `batch_with`'s parameters) |
| Docs        | doc-audit, 10 findings (`docs/audits/2026-11-04-doc-audit-branch.md`): 1–7 fixed (ace5d12); 8–10 left (a solutions record, older fake and README text)                                                                                                          |
| Tests       | skipped by the user: the analyzer's medium gaps were fixed, the rest are low                                                                                                                                                                                    |
| Read        | the user read the branch in tui-review ("lgtm")                                                                                                                                                                                                                 |
| Decisions   | rulings 1–10 and Deviation D confirmed by the user, 2026-11-04; no `shortcut:` lines                                                                                                                                                                            |
| Not checked | Windows (spec Q8: the user checks once after release); Google's typing (waits on the `/goto` follow-up)                                                                                                                                                         |

Finish, 2026-11-04: the user chose push and open a PR.
