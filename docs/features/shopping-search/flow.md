---
flow: feature
phase: execute
now: Task 7 (live check) is being run.
---

# Shopping search: flow

## Request

Hey, so I noticed that agents have quite a hard time helping me with buying decissions especaiily like searching for up to date pricing, products on for example Kleinanzeigen-mcp. Me personally I fucking hate having a trillion mcp tools for each side. I mean when I look for a server rack. I dont want to search on kleinanzeigen, galaxus, geizhals I would like the llm to call the tool, I need this and it gives me all the answers if this makes sense. Would such a thing possible and maintainable while speed and having good results?

## Artifacts

- Prior art: [prior-art.md](prior-art.md)
- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs:
- Glossary: [GLOSSARY.md](../../../GLOSSARY.md) (shopping-search: Group, Row, Recipe)

## Gates

- Gate 1, spec approved: 2026-11-08. Reopened 2026-11-08: the spec's avoid-list was widened after plan review (robots.txt paths `/redir/`, `condition_s`, `*filterGrid=`, `*/marketplace/`), the render wait was reworded, and done check 7 (Geizhals category discovery) was added. Approved again at Gate 2.
- Gate 2, plan approved: 2026-11-08, execution: subagent-driven. Spec Gate 1 reapproved with it.

## Skipped

## Grounding

Verified by an Explore agent reading `tools/web-mcp` (not run):

- A tool is an `async fn` on `Server` with `#[tool(...)]` in one router (`tools/web-mcp/src/tools.rs:323-385`), args as a `JsonSchema` struct; adding one needs a `mod` in `main.rs`, and `tests/mcp.rs:7` (`lists_four_tools`) asserts the exact list. Docs to update: plugin.json description, AGENTS.md web-mcp paragraph.
- `search` fans out to engines in parallel with one 10 s deadline (`search.rs:466`, `profile.rs:28`); engines are an enum, not a trait (`engines/mod.rs:42-164`); a `Found` is only `{url,title,snippet}` (`engines/mod.rs:53`): no price type exists. Blocked engines rest 30 min (`profile.rs:26`). Ranking is RRF + BM25 over text (`fuse.rs`, `rank.rs`).
- `papers::search` (`papers.rs:665`) is the closest fan-out template: parallel sources, per-source deadline, merged output. `lookup` (`lookup/mod.rs`) is JSON-API only.
- `fetch` reads readability text; no JSON-LD / schema.org parsing, no robots.txt handling anywhere; HTML parsing uses `dom_query`. Browser fallback is not available to tool-initiated fetches (`fetch.rs:375`).
- Browser window: 0.3-2 s per batch warm, 2-5 s cold (`docs/features/web-mcp-search/findings.md:158`); no stealth (ADR 0004), so bot walls (Cloudflare-style) are unsolved here.
- Host limits: 4 in flight per host, spacing list in `limits.rs:11-34`. Fixtures are captured real pages; shop pages would need capturing by hand.
- ADR 0011 (api-mcp): this repo keeps tool lists fixed per request.

## Prior art

Report: [prior-art.md](prior-art.md). No open-source MCP merges many DACH shops. Approaches: per-site adapters, query an aggregator (Geizhals/Google Shopping), generic extraction, smallest (eBay Browse + Geizhals + Kleinanzeigen in parallel). Observed by the agent: plain HTTP got 200 from Kleinanzeigen, 403 from Galaxus, idealo, Geizhals, eBay.de. Source check: running.

## User intent (brainstorm)

Guidance on a purchase, not shopping automation: a real current price baseline (no guessed prices) and a short list instead of hundreds of Kleinanzeigen ads. The model gets the listings and decides; the tool does not give verdicts. Price-history timeline wanted if cheap. Location/pickup question unanswered.

Revised shape (user, turn 4): two tools. (1) `search` across normal retailers (Amazon, eBay, Kleinanzeigen, Böttcher, whatever) with an optional source parameter. (2) a Geizhals-style compare tool: a category plus filters (e.g. monitor, WQHD), then a price timeline per product to know a thing's value. Timeline is an extra, inside or beside the compare tool (open).

Finding (fetched 2026-11-08, Samxel/geizhals-mcp README + search_api.md): Geizhals' mobile JSON API (`api.geizhals.net/gh/v9`) has search, category list (2200+ categories), compare_products with specs, price_history (31/91/183/365 days), price drops. It is signed with an HS256 secret reverse-engineered from the Flutter app, so it can rotate. Whether it filters by spec (e.g. WQHD) is not shown: the category tree has `xf` filter nodes, but the upstream tools expose only price bounds, sort and paging.

## Findings

Baseline (2026-11-08, worktree at 24d39d70, before any change): `cargo build --locked -p web-mcp --bin fake-agent-browser` and `cargo test --locked -p web-mcp` passed (176 unit, 29, 17, 37, 11 and smaller suites, no failures).


Browser probe, measured 2026-11-08 21:41, one request per site, from this machine through web-mcp's browser tool (not the plain `fetch`): geizhals.de (category page with filters in the URL), galaxus.de search, idealo.de search all loaded real pages with prices and filter facets with counts. Plain `fetch` got 403 from Geizhals and only a JS shell from Galaxus. Both Geizhals and Galaxus turned the query "monitor wqhd" into a category plus a WQHD filter on their own (Geizhals's redirect mangled `&` into `%26`, giving "Seite existiert nicht"; the hand-built URL `?cat=monlcd19wide&xf=18315_ab+2560x1440` worked). Not tested: volume (blocking after many requests), Kleinanzeigen/eBay/Amazon in the browser, speed per page.

### Live check (2026-11-09)

Run 00:29-00:35 CET through `docs/features/shopping-search/live-client.mjs` and the debug build of `web-mcp` (HEAD 46dc0169), one `rows` call per run, 5 s or more between runs, logged out, with the plugin's real browser window (Helium) and `~/.claude/bin/agent-browser`. The installed web-mcp sessions kept their windows (profiles 1 to 3); this run took the free slot `profiles/4` (created by it, left in place) and its window closed when the client closed stdin. Page text is the text of the archived `raw.html` without script and style (`textlen.py`, my count, not the tool's). Source lines carry UTC times (23:30 UTC = 00:30 CET). **Page loads: 14** (list below), none of them a disallowed path or parameter. No page was a bot wall or a consent page, and no run returned "no group found", so the no-group reply (title and hints) was not seen live.

| # | page | groups (kind, total) | reply chars | page text chars |
| - | ---- | -------------------- | ----------- | --------------- |
| 1 | Kleinanzeigen `s-serverschrank-19-zoll/k0` | 1: `LI.bg-surface.border` 25; 2: `DETAILS` 9 (filter panel) | 9,388 | 8,861 |
| 2 | Geizhals monitor category (`cat=monlcd19wide`, IPS, ab 2560x1440) | 1: `DIV.card.galleryview__item` 30; 2: `DIV.cms-fliesstext` 39 | 11,496 | 63,241 |
| 3 | Galaxus `producttype/monitor-31` | 1: `ARTICLE` 43 (30 shown); 2: `LI` 10 | not captured (my pipe cut it; about 6,000 by the rows seen) | 11,993 |
| 4 | `https://geizhals.de/` | 1: `ARTICLE.card.galleryview__item` 10 (bestsellers); 2: `LI.card.main-category` 14 | 4,483 | 8,766 |
| 5 | Geizhals product page (Gigabyte G27Q26, the link of row 1 of page 2) | 1: `DIV.offer.offer--available` 9; 2: `LI.toplist__listitem` 10 | 6,787 | 18,128 |

First three rows (ads shortened, no links):
- 1: 86150 Augsburg, "2x Bachmann Steckdosenleisten fuer Serverschrank" (price cut to "40"); 97499 Donnersdorf, "19 Zoll Rack Serverschrank offen", 40 EUR, pickup only; 94032 Passau, "19-Zoll Netzwerkschrank / Serverschrank mit 48 CAT6", 199 EUR.
- 2: "Preisaenderung -11 % GIGABYTE G27Q26, 27", 2560x1440 (WQHD), 260Hz, IPS, 23 Angebote" (no price); "LG UltraGear G6 27G610A-B, 27" ..." (no price); "Philips Evnia 3000 27M2N3800A, 27" ... 3840x2160 (4K UHD)" (no price).
- 3: "Monitor EUR 1574,99 Dell UltraSharp U4025QW 5120 x 2160 Pixel, 40"", "Monitor EUR 600,89 Dell UltraSharp 27 U2725QE 3840 x 2160", "Monitor EUR 519,90 ASUS ROG Strix OLED XG27AQWMG 2560 x 1440".
- 4: "1 Nintendo Switch 2 schwarz ... ab EUR 449,99", "2 ASUS Prime Radeon RX 9070 XT OC ... ab EUR 936,99", "3 AMD Ryzen 7 9800X3D ... ab EUR 379,00".
- 5: "EUR 159,90 zum Angebot notebooksbilliger.de ...", "EUR 163,99 ... computeruniverse.net", "EUR 163,99 ... Cyberport.de" (every group-1 link is a `/redir/` shop link).

Answers to the questions of the task:
- Reply size against page text: Geizhals category 11,496 against 63,241 (smaller); Kleinanzeigen 9,388 against 8,861 (larger: 25 links of about 110 characters and the filter panel are in the reply but not in the text, so done check 2 fails there by my count); Galaxus first load about 6,000 against 11,993 (not measured exactly).
- Galaxus: the first load had 43 tiles, the same as the saved page (50 `article` elements, 43 tiles; the page says 2,853 products, so the rest is not loaded). The second load, 4 minutes later (load 14), had only 3 `article` elements and 6,392 characters of text (81 KB of HTML against 341 KB): group 1 was a 10-item `LI` list of guide and toplist links ("Monitor Modelle auf einen Blick", ...), group 2 six filter blocks (`DIV.yay0tyc1`), reply 2,179 characters, no tiles. The same address gave tiles once and none once; `rows` read the page as it was at the moment and said nothing about it.
- Category discovery (done check 7): the home page's default groups give one link per row (group 2: `?m=<n>` main categories, no slugs). With `item` = `a.o-category` and `limit` 200 (load 6) the home page gives 78 category links: some are `?cat=<slug>` (Monitore `?cat=monlcd19wide`, Notebooks `nb`, Grafikkarten `gra16_512`), the others `?o=<n>` pages that list sub-categories. `?o=14` (Netzwerk, load 7) shows 15 sub-category rows in group 1, each with a `?cat=<slug>` link (`switchgi`, `router`, `nwfw`, ...). None of those links is a `/hardware/` path or `?fs=`. A server rack category was not found under Netzwerk (the nearest is `Zubehoer`, `?cat=wlanzub`, a mixed accessory category); other main categories were not tried. A product page's breadcrumb holds `./?cat=monlcd19wide` in its HTML, but the default groups of a product page do not return it (group 1 is the offers, group 2 related products); an `item` for the breadcrumb was not tried (out of page loads). The skill now says this.

Surprises:
1. A row is cut at 200 characters, and the price comes last in a Geizhals card, so 28 of the 30 cards in load 2 show no price (only rows 19 and 30 do) and the monitor limit of 250 EUR cannot be applied from the default rows. In Kleinanzeigen ads the price follows the description: 4 of 25 rows (1, 9, 18, 19) show none or a cut one ("40", "1"). Workaround that worked (load 13): `item` = `div.galleryview__price` returns 30 rows "ab EUR 159,90 | product link", in the same order as the cards, so a price pairs with a name by the link's slug. It costs a second load of the same page.
2. Kleinanzeigen row text starts with numbers that are not part of the ad (image counts: "2 86150 Augsburg"), and a flag such as "Direkt kaufen" or "Versand" is often cut ("Direkt kauf").
3. On an ad page the default groups are the seller's other ads (load 8, 10 `LI`), not the description. `item` = `#viewad-description-text` (loads 9 to 11) returns one row of about 200 characters, kind `DIV.break-words`, and the page it saw was a larger variant (1.5 MB of HTML against 190 KB for the first load of the same ad). A depth named after the first 200 characters is not visible: the HP rack (load 10) names "Tiefe: ca. 950 mm" early; the other two ads (loads 9 and 11) state no depth at all.
4. Ad place: the 399 EUR ad is listed under Passau (94032) but its description says pickup only in Vilshofen an der Donau.
5. Geizhals filters: `item` = `div.filter-element` (load 12) gives 10 filter blocks, each with its values as text (for example "2560x1440 (WQHD) (505)") but only one link, the filter's own `...&fcols=<id>` address. The value links (`xf=...`) are not in the rows, so the skill's sentence "build the next address from each filter's link" is not what the rows allow; what the `fcols` page shows was not tried. The skill's own example filter `ab 2560x1440` includes 4K monitors (rows 3, 5, 10 of load 2 are 3840x2160), so WQHD must be read from the card text.
6. A price moved between two loads minutes apart (card 30: "EUR 117,89" in load 2, "ab EUR 111,99" in load 13).
7. The product page's group 1 is the shop offers, and each link is a `/redir/` URL, which robots.txt disallows; `rows` prints them and the skill's rule is the only guard. The product's group 2 is a list of related monitors with prices.
8. One run left its browser window open because the client killed `web-mcp` instead of closing stdin (my first client version); I ended that window's processes by hand (only slot 4). The client now closes stdin and waits.

Rack example ("19 inch server rack, about 720 mm deep, used is fine"), by hand:
- Calls: (a) `rows` on the load-1 address (the same call, not repeated); (b) `rows` with `item` `#viewad-description-text` on three ads one at a time: 19 Zoll HP 42 HE, 230 EUR VB, Arnstadt (depth ca. 950 mm, too deep); "groß mit Zubehör (VB)", 120 EUR VB, Kreuztal (description gives no dimensions; this ad needed a first default call that showed only the seller's other ads); "Serverschrank / Netzwerkschrank" with AMP patch panels, 399 EUR, Vilshofen, pickup only (no depth). (c) A Geizhals look-up for a new-price baseline or a depth was not made: no rack category was found (see above), and the skill says to ask the user for the address.
- Result: no ad confirms about 720 mm. Each ad price names its source (the ad's link in the row and the `Source:` line's time), so the answer could name them; the new-price baseline the skill asks for has no source and was left out.

Monitor example ("WQHD IPS monitor, up to 250 euro"), by hand:
- Calls: (a) `rows` on the load-2 address (the Geizhals category with `xf=18036_IPS~18315_ab+2560x1440`); (b) the same address with `item` `div.filter-element` (load 12); (c) the same address with `item` `div.galleryview__price` (load 13), which the skill does not name.
- Result: from (a) and (c) paired by position, WQHD IPS monitors up to 250 EUR include Gigabyte G27Q26 (ab 159,90), LG UltraGear 27G610A-B (129,00), Lenovo Legion 27Q-11 (149,00), Samsung Odyssey G50F (135,98), Gigabyte G27Q2 (138,99), Gigabyte M27Q2 QD (214,59), Dell Alienware AW2726DL (147,14), BenQ EW270Q (149,00), MSI MAG 274QPF X32 (189,00); the 4K cards (Philips 27M2N3800A 257,90, Dell S2725QS 230,00) have to be dropped by their text. Each price names its source (the product link and the `Source:` time). Without (c) only 2 of 30 cards show a price.

Page loads (14): 1 Kleinanzeigen search; 2 Geizhals category; 3 Galaxus category; 4 Geizhals home; 5 Geizhals product page; 6 home with `item` `a.o-category`; 7 `?o=14`; 8 ad (default); 9 same ad with `item`; 10 HP ad with `item`; 11 third ad with `item`; 12 category with `div.filter-element`; 13 category with `div.galleryview__price`; 14 Galaxus category again.

## Options

### Grill decisions (settled 2026-11-08)
Picked: `rows(url, group?, item?, limit?)` is its own fifth tool in web-mcp, not a `browser` action. It opens the page itself and finds repeating groups automatically (no selectors from the agent); the user's idea. Normal-user rules: one address per call, about 1 s per host, no automatic pagination, no robots.txt-disallowed parameters (no `bpmax`, `sort`, `preis:`). The `shop` skill is an opt-in plugin that depends on web-mcp. Rows show the ad's place; no location setting. Limits: 30 rows, about 12,000 characters. Terms Group, Row, Recipe. An ADR is deferred to the plan stage.
Evidence: the detection heuristic found the product list as the top group on Kleinanzeigen, Geizhals and Galaxus (measured, JS in the page, 2026-11-08, one page each).

### How the tool reads shops
Picked: E. A generic extraction capability in web-mcp (page + recipe of CSS selectors -> compact rows) and the shop knowledge as a skill (URLs and selectors as text); a spike on Kleinanzeigen, Geizhals and Galaxus first. The user said "that looks good for me" to E and no to L (their words: "No, I dont for now").
Rejected: A (own shop tool with three adapters in web-mcp), B (browser-driven shop tool in web-mcp), C (hosted API), D (skill only with raw eval), P/Q (shop tool in web-mcp, text or parsers), R (separate `shop-mcp` crate), W (one-file Node script), L (web-mcp as a library plus a `shop-mcp` package), M (shop-mcp as a client of web-mcp), X/Y/Z (Geizhals app API reimplemented / upstream Python server / website via browser; the browser route won because it works and filters are in the URL).
Recommendation was E; reasons: smallest change, keeps web-mcp general, no new binary, server-side compact rows. L was the fallback if selectors prove too weak.

## Plan review

Round 1: three fresh reviewers found 13 findings. The user chose "Apply all" (2026-11-08). Main changes:
- `fetch::truncate` cuts at a blank line, so `render` takes a character budget instead.
- Task 1 and the pacing test were corrected.
- Tied groups collapse to one; the ads fixture is scrubbed of private sellers' data (titles, places, ids, link slugs, image URLs, `data-*` ids) across all ads.
- Robots-disallowed paths are kept out of captures and recipes.
- Task 3 got a clippy-safe `allow(dead_code)`, `mod rows;` moved into Step 1, and kinds/totals derived from the fixtures.
- Tasks 5 and 6 got the missing files; the fake browser's page variable was de-duplicated.
- Task 7 now updates the skill's category note.

A fix-check agent re-read the plan: findings 5, 7, 9 and 10 still failed on the first pass; the edits above address them. No second fix-check ran. The plan and spec were then copyedited (compare.mjs passed, nothing removed).

## Tasks

Task 1: base f011369bbb7d38bb767cfc16d99e22eeb2998e74 (untracked at start: docs/features/shopping-search/) — files clean (limits.rs only; size 35 of ~40); main session reviewed the diff itself, no separate reviewer for this 35-line task (ruling below)
Task 2: base c6166a5ee88a85a283ad948c00b9525e87dd5dfa (untracked at start: docs/features/shopping-search/) — files clean (4 fixture paths; 660 lines of ~1500); scrub checked by the main session (no emails, phones, ids, titles or image hosts left in the ads page); builder reports the Geizhals page has guide-text sibling groups (40 `div.cms-fliesstext`, 37 `li.cms-toc__item`) that may outscore the 30 product cards, and the Galaxus category page has 43 tiles; the main session's own scoring put the 30 cards first (7751) and the filters 7th, to be settled by Task 3's real detection
Task 3: base 9d53fcf5c6b309da2dbaa5af40d66f49c48e33e1 (untracked at start: docs/features/shopping-search/) — files clean (rows.rs, main.rs; size 415 of ~420; adds: Row, Group, find_groups, render only); deviation decided 2026-11-09 (group score: squared link share, see Deviations); commit 9fdd898b; task review found 9 points, 6 fixed in a1b37991 (weak tiles test, vacuous tie test, a `#` link winning, the no-link tie order, the budget claim, missing render and share tests), 3 not changed (text-node spacing, nav/header/footer elements forming a group, single-caller helpers)
Task 4: base 9bd499aea885164b8ca1b5db8da1c9779d5891ce (untracked at start: docs/features/shopping-search/) 
Task 5: base 47a7bf60bf15acf510a23562b899a04981ce391d (untracked at start: docs/features/shopping-search/) — files clean (the ten listed paths; 55 added of ~160); commit 3eb28daf; `npm test` had one failure that came from the worktree having no node_modules (the test runs tsc from it) — a symlink to the main checkout's node_modules was added (untracked)
Task 4 follow-up: commit c12517af — private landing refused (user decision), no-group reply labelled and capped, `item` validated before the read, 4 MiB page cap, 8 more tests; touched fetch.rs (visibility of `private_landing` only) and the plugin README; task review items 1-5 fixed, item 6 (unbounded row link) and the `html.clone()` copy left
Task 6: base 350679debf65441139dfbd92b35f154ac04b1005 (untracked at start: docs/features/shopping-search/) — files clean (the eight listed paths; 80 added of ~220); commit 46dc0169; npm test, lint, build:harnesses and the skill scan (uvx, cisco-ai-skill-scanner 2.3.2, 1 INFO finding) passed per the builder
Task 7: base 393a73ba0838aa8189edc3f62fdb59f82512de8d (untracked at start: docs/features/shopping-search/)
— files clean (rows.rs, tools.rs, fake_agent_browser.rs, tests/rows.rs, tests/mcp.rs; size 334 added of ~280; adds: RowsArgs, Server::rows, rows::run, the fake's page lookup); commit 94fcd2d5

## Rulings

- 2026-11-09, Tasks 5 and 6: no separate task reviewer — docs, metadata and a text-only skill, checked by the files check and size check, the build, lint, `npm test` and the skill scan — a wrong sentence in the README or skill would surface at the final review and the live check.

- 2026-11-08, Task 0: the superpowers skills `subagent-driven-development` and `using-git-worktrees` are not installed here — the main session ran the worktree step by hand (`git worktree add .claude/worktrees/shopping-search -b shopping-search origin/main`) and runs the subagent-driven loop itself: a fresh builder agent per task with the builder brief, the files check by the main session, a fresh task reviewer per task — the loop's rules are followed as the conductor states them; it costs a less polished ledger if wrong.
- 2026-11-08, Task 1: no separate task reviewer — the 35-line diff was read by the main session after its files and size check — a trivial change and a full test, clippy and fmt pass by the builder — a missed defect would surface in Task 4's pacing test and the final review.
- Geizhals category discovery without `?fs=` or `/hardware/` is unverified; Task 7 measures it and the skill states the result.

## Parking lot

- `tools/web-mcp/src/search.rs`: `keep_page` and the archive step in `rows::run` are near-duplicates (`Item::Page` plus the `raw.html` path); merging them touches `search.rs`.
- `Browser::rendered_html` returns only `get html body`, so a real page has no `<title>` in what `rows::run` sees; the no-group reply falls back to the first `h1`. Task 7 checks what the live reply shows.

- `tools/web-mcp/src/rows.rs`: `text_of` joins text nodes with a space, so inline markup splits words and prices (`Mon<b>itor</b>` reads "Mon itor"); decide after the live check whether rows need joining without a space.

- Codex offers the `shop` plugin where web-mcp has no binary (`tools/installer/steps/codex.ts:72-77`).
- Galaxus lazy loading (15 of about 373 tiles) is not handled in v1.

## Deviations

### Task 4 follow-up: `rows` refuses a private landing
Status: decided 2026-11-09: refuse a private landing (the user's choice). Task 4's reviewer and the automated security review noted that `rows`, like `fetch`, opens private and local addresses and follows a public address that redirects to one, in the user's logged-in browser window. The plan said to match `fetch`. Decision: a requested private address still works; a public address that lands on a private one is an error, with nothing archived or returned. The fix commit also touches `plugins/shared/web-mcp/README.md` (its private-address line, written in Task 5) and, only if needed, the visibility of `fetch`'s private-address check.

### The group score ranks Geizhals' guide text above its products
Status: decided 2026-11-09 (round 2: B2, the square of the link share; the plain share left the guide text first): option B, weight each group's score by the share of its items that hold a link; plan Task 3's rule and the spec's group-finding line were updated, the builder re-runs the tests.
Task 3's builder implemented the plan's rule as written and measured the real Geizhals fixture (`product_cards_page.html`): `DIV.cms-fliesstext` 39 items score 15600 comes first, the 30 product cards (7751) second, `DIV.cms-alert` 19 (6122) third, the 9 filter blocks fifth (1275, not returned). Done check 1 (product list is group 1) and the spec's monitor example (filters as group 2) fail on this page. The probe's JS saw the product list first because it ran on a different page state. Ads page: ads 25 (1706) then filter panel 9 (534); Galaxus category page: 43 tiles (3593) first.
Options: (A) keep the rule and accept; agents pass `item` for Geizhals (recipes would then hold a selector, which the spec excluded). (B) weight each group's score by the share of its items that hold a link (guide paragraphs rarely do; cards, ads, tiles and filters do). The main session's rough check of B on the three fixtures: products first (7751), filters second (1275), ads and tiles unchanged. (C) cut the guide section from the fixture (hides the real page's shape).
Recommendation: B.
Round 2 (2026-11-09): with B built, the Geizhals guide text still leads: 39 items, 23 hold a link, score 9200 (products 7751, filters 1275 third, no longer returned). Options: (B2) square the link share: guide about 5400, products 7751 first, filters still not in the top two; (B3) cap the per-item text at 200 (what a Row shows): products 6000, guide 4600; (A) keep B and give the agent `item` for Geizhals' filters.

## Walkthrough

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |
| done check 1: same groups on real pages | 7 | flow.md, Findings, Live check | pass on loads 1, 2 and 3 (ads, products, tiles are group 1); Galaxus load 14 returned no tiles |
| done check 2: reply smaller than page text | 7 | flow.md, Findings, Live check | Geizhals 11,496 against 63,241 pass; Kleinanzeigen 9,388 against 8,861 fail; Galaxus not measured exactly |
| done check 3: end to end in a fresh session | 7 | flow.md, Findings, Live check | not checked in a fresh session; both examples run by hand, prices name sources, monitor needs a call the skill does not name |
| done check 4: `rows` stays general | 7 | none | not checked live (a test matter) |
| done check 5: a failure is visible | 7 | none | not checked: no run gave "no group found" or "did not render" |
| done check 6: pacing holds | 7 | none | not checked: each run was its own process, 5 s or more apart |
| done check 7: category slug findable | 7 | flow.md, Findings, Live check | pass: `item` `a.o-category` on the home page, then `?o=<n>` pages; no rack category found |

## Review

## Learned

## Run verdict
