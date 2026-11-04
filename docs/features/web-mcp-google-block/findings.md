# web-mcp Google block: spike findings

Throwaway spike, 2026-11-03, NixOS, Helium 0.18.1.1 (Chromium 154.0.8037.57), agent-browser 0.39.4 (the installed one,
from the same 2026-10-28 install as the stale web-mcp; the repository pins 0.41.1), a German
residential line. web-mcp was built from `main` (`2baae14`) in a scratch worktree and driven over stdio MCP through
its `browser` tool (one session, so one attached tab of the window). Each run used a fresh search folder, so a fresh
profile slot. Windows (Chrome for Testing) was not measured.

## Baseline: web-mcp from `main`, unchanged

What the attached tab shows (httpbin.org/headers, plus `navigator`):

- `User-Agent` is Helium's own (`Chrome/154.0.0.0`, not headless), with matching `Sec-CH-UA`
  (`Chromium`/`Google Chrome` 154) and `Sec-CH-UA-Platform: "Linux"`. The owner's `userAgent` doesn't reach this tab.
- `navigator.webdriver: true`. `window.chrome` has `loadTimes`, `csi` and `app`. Five plugins, `en-US` only,
  the local timezone, the real GPU through WebGL, a 944x1026 window on 1920x1080.
- `navigator.hardwareConcurrency` read 12 on one page and 16 on another, neither the machine's core count. Helium randomizes
  it per site (its fingerprinting protection), so it's not something web-mcp sets.

What the bot checks say:

| page                                   | verdict              | what gave it away                                                                                                                                                                          |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| bot.sannysoft.com                      | one failure          | "WebDriver (New) present"                                                                                                                                                                  |
| deviceandbrowserinfo.com/are_you_a_bot | **"You are a bot!"** | `hasWebdriverTrue`, `hasWebdriverInFrameTrue`, `isAutomatedWithCDP`, `hasInconsistentTimingResolution`, `hasInconsistentWorkerValues`; UA, client hints, headless, WebGL, screen all clean |
| browserscan.net/bot-detection          | Robot                | "Webdriver: Robot"; CDP, Dev Tool, headless, navigator all "Normal"                                                                                                                        |
| CreepJS                                | 38% like headless    | "33% headless", "0% stealth"                                                                                                                                                               |

So on the current design, `navigator.webdriver` is the one signal every check names. deviceandbrowserinfo alone also
sees the CDP connection itself, and two inconsistencies that Helium's randomization may explain.

## Variant 1: `--disable-blink-features=AutomationControlled`, no `userAgent`

The spike's hook added the switch to the owner config's `args` and dropped `userAgent` (`profile.rs:204-216` in the
scratch worktree only).

- `navigator.webdriver: false`; headers and every other `navigator` value as in the baseline.
- bot.sannysoft.com: no failures. browserscan: "Normal" on every check, Webdriver included. CreepJS: "0% headless"
  (was 33%), "38% like headless" unchanged.
- deviceandbrowserinfo: still "You are a bot!", now only for `isAutomatedWithCDP`, `hasInconsistentTimingResolution`
  and `hasInconsistentWorkerValues`.

## Variant 2: a fixed debugging port

`--remote-debugging-port=9333` (no `userAgent`): agent-browser never connected ("Failed to read: Resource
temporarily unavailable"), and its daemon kept relaunching Helium until it was killed. agent-browser's own
`--remote-debugging-port=0` can't be overridden from `args`, so this way out is closed.

## Control: the user's own Chrome (NixOS), by hand

The same pages, reported by the user: sannysoft only WebGL red; deviceandbrowserinfo "human"; browserscan "human";
CreepJS "19% like headless", "0% headless", "0% stealth", "chromium: false". So variant 1 matches a person's browser on
every check but deviceandbrowserinfo's three flags. The control browser is Chrome, not Helium, so it can't tell
whether the two inconsistency flags come from Helium itself.

## Google, typed into the page

Each search: open `https://www.google.com/?hl=en` in a `browser` tab, type the query, press Enter, read the page 4 s
later. Three searches in all, from the same line within about five minutes, 2026-11-03, evening.

| run | code                 | profile                         | result                                                     |
| --- | -------------------- | ------------------------------- | ---------------------------------------------------------- |
| 1   | variant 1 (flag off) | fresh; consent wall shown first | results page, 9 results, no `/sorry`; the wall was cleared |
| 2   | variant 1 (flag off) | run 1's, a new web-mcp process  | results page, 8 results, no `/sorry`; no wall              |
| 3   | baseline (`main`)    | fresh                           | **`/sorry/index`** on the first search                     |

- On this line and today, `navigator.webdriver` decides it: the same typing from the same IP was let through with
  it off and sent to `/sorry` with it on, the first time in each case. Three searches is a small sample; a rate limit
  after a burst (web-mcp-search/findings.md) is a separate thing and still applies.
- deviceandbrowserinfo's remaining flags (`isAutomatedWithCDP` and the two inconsistencies) didn't stop Google.
- Typing worked without a ref: on Google's home page the box has focus, so `type` landed in it. Typing into the
  box on a results page (the follow-up search the user wants) wasn't run: the spike's ref lookup missed the
  `[expanded=false, ref=eN]` form. Unverified.
- `hl=en` showed English pages; `gl` and `num` were not sent in these runs (the home page form doesn't add them).

## What follows for the fix

1. `--disable-blink-features=AutomationControlled` in the owner's `args` turns `navigator.webdriver` off in every tab
   of the window, attached ones included. It is the one change measured to matter.
2. The `userAgent` override can go: attached tabs never get it, and in the owner's tab it drops the client hints.
   Helium's own UA is already the reduced Chrome form.
3. The installed NixOS binary predates the window; until it is replaced, none of this reaches that machine.
4. Not measured: Windows with Chrome for Testing. The switch is Chromium's, so it should behave the same; the
   Windows check stays open until the user runs it there.

## Spike 2: typing into an open result page (plan review D4)

2026-11-03, agent-browser **0.41.1** (the pinned release, sha256 checked against
`tools/installer/assets/agent-browser.json`), Helium 154, the owner config with
`--disable-blink-features=AutomationControlled` and no `userAgent`, the profile of the Google runs above. One attached
tab per engine: a batch loads the engine's result URL for a first query and reads `performance.timeOrigin`; a
`--bail` batch runs `click <box>`, `press Control+a`, one `press` per character (`Space` for spaces) and
`press Enter`; a third batch waits for `ready_js && performance.timeOrigin !== <before>` (8 s) and reads the page.

| engine     | box                  | typing batch       | new document | landed `q` = query | path       | parameters kept after typing    | wait  |
| ---------- | -------------------- | ------------------ | ------------ | ------------------ | ---------- | ------------------------------- | ----- |
| google     | `textarea[name=q]`   | 25 commands, 0.4 s | yes          | yes                | `/search`  | `hl=en`, `gl=us`; `num` dropped | 0.3 s |
| bing       | `#sb_form_q`         | 25, 0.1 s          | yes          | yes                | `/search`  | none: `setlang`, `cc` dropped   | 0.6 s |
| duckduckgo | `#search_form_input` | 25, 0.3 s          | yes          | yes                | `/`        | `kl=us-en`, `ia=web`            | 0.7 s |
| brave      | `#searchbox`         | 25, 0.4 s          | yes          | yes                | `/search`  | `source=web`; `lang` dropped    | 2.9 s |
| scholar    | `#gs_hdr_tsi`        | 26, 0.0 s          | yes          | yes                | `/scholar` | `hl=en`                         | 0.8 s |

- Every engine typed, loaded a new document (no in-place update) and landed on the new `q`; no block. Google's
  `textarea[name=q]` is now checked live. Google answered both its searches here (plus one first load lost to a
  script error), so five Google requests today with the flag off, none blocked.
- Bing drops `setlang`/`cc` and Brave drops `lang` on a typed search: their typed pages fall back to the browser's
  `Accept-Language` (`en-US`, from `--lang=en-US`). Not seen to change the markup here; a typed page in another
  language would at worst parse as unrecognised, which loads nothing wrong.
- agent-browser keeps a session's pinned tab across `close`: a session name reused after its tab died answered
  `tab_gone` on every call until a new name was used. web-mcp's session names carry the process id and generation,
  so a server never reuses one; the typing batch's fallback covers a tab gone mid-process.

## Spike 3: keys and a missing box (plan review round 2)

2026-11-03, agent-browser 0.41.1, `AGENT_BROWSER_DEFAULT_TIMEOUT=8000` as web-mcp sets it for attached calls, an
attached tab on `https://httpbin.org/forms/post` (no search engine):

- `click #nope` (no such element) in `batch --json --bail` failed at once (0.0 s, "Element not found: #nope") and
  nothing after it ran. A missing box doesn't wait out the action timeout.
- `click <box>`, `press Control+a`, `press T`, `press o`, `press Space`, `press 1`, `keyboard inserttext "+ü-"`,
  `press x`, `keyboard inserttext "-async"` left the box at `To 1+ü-x-async`: capitals and digits press as
  themselves, and a leading `-` inside a JSON batch is text, not a flag.
- `eval performance.timeOrigin` in a batch answers
  `{"result": {"lifecycle": …, "origin": …, "result": 1793740800375.3}, "success": true}`: the number is the
  entry's `result.result`.

## Build check (Task 4)

2026-11-03, the branch's release build (`9af36d5` plus Task 4), agent-browser 0.41.1 behind a logging shim, a fresh
search folder, driven over stdio MCP.

- **The window:** in an attached `browser` tab `navigator.webdriver` is `false`; httpbin.org shows Helium's own
  `User-Agent` (`Chrome/154.0.0.0`) with matching `Sec-Ch-Ua`; bot.sannysoft.com shows no failures.
- **Typed follow-ups work live.** Brave's and Bing's follow-up searches ran the `--bail` typing batch and a typed
  read that ended on a new document. Three Bing-only searches: the first loaded its URL (agent-browser 9.2 s), the
  second and third typed (0.08 s and 0.06 s of typing, 1.4 s and 1.5 s of reading); the third search took 2.3 s in
  all.
- **Cold URL loads run close to the 10 s deadline here**, so the first search of a server timed out on two or three
  engines, on `main`'s build too (a control run on the same profile with the same agent-browser and shim). Not
  caused by this branch. Once, with four engines at once, Bing's typed read timed out after its typing batch; not
  reproduced in three Bing-only runs.
- **Google served result pages, never `/sorry`**, in every run today with the flag off (about a dozen requests), but
  **its parser finds no results**, on `main` too: every organic row links to `/goto?url=CAES…`, an encrypted
  redirect, and the target appears nowhere in the row (only in the AI Overview's script data). `udm=14` uses the same
  links. A full `/goto` link answers a plain cookie-less GET with `302` to its target (checked once). The parser keeps
  the rows as `www.google.com` links and drops them as Google's own, so Google counts as "unrecognised". The user
  chose a follow-up flow for this (flow.md, Deviations).
- **Fixtures:** `google.html` is the `search-google` tab's `get html body` after "Tokio 1.x vs smol", scrubbed
  (script and style bodies dropped; replaced by `DUMMY`: the request id (`ei`) everywhere it appears, `csiid` and
  `jsdata` included; the `ei`, `sxsrf`, `sei`, `sca_esv`, `iflsig`, `gs_lp`, `uact`, `bih`, `biw`, `gsessionid`,
  `sstk`, `fbs`, `ved` and `opi` parameters, URL-encoded ones too; the `data-ei`, `data-ved`, `data-async-fc`,
  `data-hveid`, `data-csiid`, `data-sstk`, `data-fbs`, `data-msei`, `data-mstk` and `data-mrc` attributes; three
  sibling request ids (`DUMMY1`–`DUMMY3`, their `_n` suffixes kept); the YouTube embed's `data-eidt` and
  `embed_config` tokens; per-response UUIDs (`data-icl-uuid`, `data-suuid`) and one opaque `data-ffd` blob stay; no
  client IP or place in it: "Can't determine location"; the `/goto?url=` blobs are encrypted and stay, since they
  are what the follow-up must resolve). It confirms
  `textarea[name=q]` (one element) and the row markup (`#rso .MjjYud`, `a:has(h3)`, `.VwiC3b`). No `google-none.html`:
  a nonsense query still got "About 577 results", so `google_no_results_is_empty` stays ignored.
