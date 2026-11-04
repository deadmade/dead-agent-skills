# web-mcp Google block: spec

Status: approved 2026-11-03 (Gate 1); G3 and the typing decisions reopened by plan review round 1. Size: a small change (one crate, two concerns).

## Why

Google, and other sites with bot checks, flag web-mcp's browser while the same machine and line used by hand pass.
The user wants the cause found and fixed once, not captchas solved over and over. The spike
([findings.md](findings.md)) found it: agent-browser starts the browser with `--remote-debugging-port=0`, which sets
`navigator.webdriver = true` in every tab. With the flag off, two typed Google searches got results; the unchanged
code got `/sorry` on its first.

The user also wants a search to use the engine's page that is already open: type the next query into it, as a person
does, instead of loading a fresh result URL.

## Goals

1. **G1 The automation flag is off.** Every tab of the window (`browser`, search engines, fetch fallback) reports
   `navigator.webdriver === false`. The owner's launch `args` carry `--disable-blink-features=AutomationControlled`.
2. **G2 No user agent override.** The owner config has no `userAgent`; every tab sends the browser's own UA and
   matching `Sec-CH-UA` client hints. The code that only builds that UA goes (the major read for it, the fallback
   major, `user_agent()`).
3. **G3 Follow-up searches are typed.** An engine whose last search in this process returned results for a different
   query gets the next query typed into its search box (one key press per letter, digit or space, the rest inserted
   as text) and submitted with Enter, when the search has no `since`. Otherwise it loads the result URL, as today.
4. **G4 ADR.** A new ADR records that turning the automation flag off and leaving the UA alone count as normal
   browser settings under ADR 0004's "No stealth" line; fingerprint patching stays out.

## Non-goals

- deviceandbrowserinfo's remaining flags (`isAutomatedWithCDP`, timing and worker inconsistencies): Google ignored
  them in the spike, and hiding CDP is patching.
- A diagnostic check that web-mcp keeps ("the one off investigation fixes things").
- Handing captchas to the user, a Google sign-in, rate pacing.
- The NixOS machine's stale binary: re-running the installer replaces it; no code.

## Approaches (picked in brainstorming, 2026-11-03)

- The flag: **A, the Blink switch in the owner's `args`** (picked). Rejected: CDP `Emulation.setAutomationOverride`
  per tab (web-mcp would need its own CDP client holding a session per tab, for the same result); a fixed debugging
  port (measured: agent-browser never connects).
- Typing: **A, real keystrokes with agent-browser commands in the search batch** (picked). Rejected: `fill` without
  key events, a JS value-and-submit (both less like a person); flag-off only with URLs kept (the user asked for
  typing).

## Seams

- Browser launch switches and the UA: resolved in `profile.rs` (`owner_config`); never seen by `browser.rs`,
  `search.rs`, the engines or the tools.
- Typed or loaded (does this tab already hold the engine's result page): resolved in `search.rs` (`run_engine`) from
  the engine's last query in this process; the engine modules only supply their search box selector; `browser.rs`
  runs whatever batch it is given and never sees the choice.

## Decisions (grill, 2026-11-03)

- **When a search types.** Only when the engine's last search in this process parsed as results for a different
  query, this search has no `since`, and the query has no control characters and no leading, trailing or doubled
  spaces. The remembered query is taken at the start of every search and put back only on results without `since`. Everything else
  (a tab's first search, any `since`, a block, consent or other outcome before) loads the result URL, as today.
- **The typing batch** is `click <box>`, `press Control+a`, one `press` per ASCII letter, digit or space (any other run of
  characters as one inserted text: `press` would read `+` or a leading `-` as a modifier or a flag), `press Enter`, run with `--bail`, within the deadline less the read margin, without rebinding or
  renewing the tab. It first reads `performance.timeOrigin`.
- **The wait after typing** is the engine's `ready_js` **and** a new document (`performance.timeOrigin` differs from
  the one read before typing), so a block page ends it at once and the old page never does.
- **The typed read** waits at most the read margin + 4 s (spike 2's slowest typed wait: 2.9 s), so a fallback still
  has time. Its page is parsed first: a block is handled as today (the engine rests). Results or an unrecognised
  page count only when the landed URL's `q` equals the query. Otherwise, and when the typing batch fails, the same
  search loads the result URL once in the same tab if time is left, else it is "timed out"; none of this rests the
  engine.
- **Which engines type:** all five the second spike measured ([findings.md](findings.md), "Spike 2"): Google
  (`textarea[name=q]`), Bing (`#sb_form_q`),
  DuckDuckGo (`#search_form_input`), Brave (`#searchbox`), Scholar (`#gs_hdr_tsi`), from
  `tests/fixtures/engines/`. Semantic Scholar (a single-page app, no captured result page) keeps loading URLs.
  Verify, 2026-11-04: Google can't type yet. Its result links are `/goto` redirects, so its pages parse as
  "unrecognised" and no Google query is remembered; its typing waits on the `/goto` follow-up flow (flow.md,
  Deviations). The live check typed on Bing and Brave instead of in a Google tab.
- **A Google result page fixture.** The build captures one real Google result page (reachable now) as a fixture; it
  checks the box selector and the row parser that `engines/google.rs:1-3` calls unverified.
- **ADR 0009, "web-mcp's browser doesn't announce automation"**, partly superseding ADR 0004's "No stealth" bullet:
  normal settings include the switch that turns `navigator.webdriver` off and no UA override at all. Still
  forbidden: making the browser report values other than its own (a faked UA, overridden `navigator` properties,
  hiding CDP). It names the risk: Google's terms forbid "bypassing our systems or protective measures".
- **Google's `gl=us&num=10` stay.** Nothing ties them to blocks.

- **Windows is checked once after release:** the user runs deviceandbrowserinfo, sannysoft and two typed searches
  in the same Google tab on Windows (Chrome for Testing); the result goes into flow.md at verify, and a failure
  reopens this spec.

## Verification

- A unit test per goal where code decides it: the owner config's `args` and no `userAgent` (G1, G2); the
  typed-or-loaded choice and the batch it produces (G3).
- After the build, a manual run of the findings' checks against the built binary: `navigator.webdriver` false in an
  attached tab, sannysoft clean, two searches typed in the same Google tab without `/sorry`.
- On Windows, the user runs the same checks once after release (unmeasured so far).
