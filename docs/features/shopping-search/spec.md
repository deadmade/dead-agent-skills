# shopping-search: spec

## Problem and point

When the user prepares a purchase, an agent has two weak spots. It does not know what a thing really costs, so it guesses a price. And it cannot read Kleinanzeigen well, because a search there shows hundreds of ads, most of them noise. The user also does not want one MCP server per shop.

This feature gives web-mcp one generic tool, `rows`, that opens any page and returns its repeating items (the ads, the products, the search hits) as short numbered lines, without being told where they are. A small skill, `shop`, then tells the agent where to point `rows` for the shops that matter and how to judge what comes back. The agent, not the tool, judges the result.

web-mcp stays the general base for dev work and search: `rows` knows no shop, and everything shop-specific is plain text in the skill.

## What the user sees

**A used rack.** The user says: "I need a 19 inch server rack, about 720 mm deep, used is fine." The agent reads the `shop` skill and calls `rows` on Kleinanzeigen's search address. Instead of the whole page, it gets back one numbered line per ad: the ad's text, collapsed, and its link. Kleinanzeigen has no depth filter, so the agent opens the few promising ads, reads their descriptions, and drops cabinets whose depth is missing or wrong. For a named model such as a Rittal or an APC NetShelter, it looks the depth up on Geizhals. The answer is a short list with reasons.

**A new monitor.** The user says: "A WQHD IPS monitor, up to 250 euro." The agent calls `rows` on Geizhals' monitor category with the resolution and panel filters in the address. `rows` returns the product list as group 1; the page's guide text below it is group 2. To read the filter panel, the agent calls `rows` again with `item` set to the filter blocks, which the Geizhals recipe names (`div.filter-element`). It builds the next address from each filter's link, so it never guesses a filter id, and it applies the price limit itself from the rows.

**The price reality check.** For a used ad, the agent first reads Geizhals' current new price for the same model, so it never says "this GPU costs 400" without a source.

## Scope of v1

In:

- **`rows(url, group?, item?, limit?)`, a fifth tool in web-mcp.**
  - It opens the address itself in a throwaway tab of web-mcp's browser window, reads the page as rendered once it has loaded (v1 adds no further wait), and closes the tab.
  - It finds repeating groups: sibling elements of the same kind, outside menus, headers and footers, whose count and text volume are large, with each group's score multiplied by the square of the share of its items that hold a link (so a page's guide text does not outrank its product list). It drops any group nested inside a larger group and returns the largest two, numbered. `group` picks one of them; `item` is a CSS selector that overrides the guess.
  - A **Row** is the item's text collapsed to one line and cut at about 200 characters, plus the item's first link, made absolute. The tool pulls out no prices or specs; the agent reads them from the text.
  - `limit` defaults to 30. The reply is capped at about 12,000 characters and ends with the row count and the path of the archived page under `.web/`.
  - If it finds no group, it says so and gives the first heading, the page's text length, and a hint to try `item`. If a page does not load in time, it reports that and says the page may still be loading.
- **Normal-user behaviour.** One address per call. A gap of about 1 s between pages on the same host. No automatic pagination: the agent asks for page 2 itself, one call at a time. No stealth and no hidden endpoints: `rows` reads the page a visitor's browser shows.
- **The `shop` skill, in its own opt-in plugin that depends on web-mcp.** It holds a **Recipe** per shop: the search address pattern and notes (what a blocked page looks like, which parts of the address are filters, what to check). v1 has recipes for Kleinanzeigen and Geizhals. The skill also holds the guidance for judging: price a used ad against Geizhals' new price, count shipping, treat pickup-only ads as local, and show each ad's place.

Out, with what happens instead:

- **Shop code in web-mcp.** None: a shop's address pattern lives only in the skill.
- **A new binary, a library split of web-mcp, parsers in Rust, selector recipes.** The user declined these; the one exception is a single `item` hint in the Geizhals recipe, where the guide text takes second place from the filter panel. They return only if auto-detection proves too weak on real pages, or if we need a store that merges duplicates or keeps price history.
- **Parameters and paths the shops' robots.txt disallows.** On Geizhals these are `?bpmax=`, `?sort=`, `?fs=`, the `/redir/` shop links and the `/hardware/` category paths; on Kleinanzeigen the `preis:`, `sortierung:` and `condition_s` paths and pages past `seite:5`; on Galaxus `*/search`, `*filterGrid=` and `*/marketplace/`. The agent applies price limits itself. Filters such as `xf=` for panel and resolution are not on the robots.txt lists that were read.
- **Scrolling.** Galaxus returned 15 items, which I think means it loads the rest on scroll. v1 reads what has loaded and reports the count. Scrolling like a person is a later question.
- **Galaxus, idealo, eBay, Amazon, Böttcher.** A shop becomes a recipe only after `rows` has been tested on its pages, and each of these either loaded in the browser or was not tried there.
- **A price timeline.** It probably sits on Geizhals' product page, which has not been opened yet. It comes as a recipe after v1.
- **A location setting.** Rows show each ad's place; the agent asks where the user is only when the user mentions pickup or distance.
- **Verdicts from the tool.** The tool returns rows; the agent advises.

## Seams

- Which shop, address pattern and notes: resolved in the `shop` skill; web-mcp never sees them.
- Finding the repeating items, collapsing them to rows, the size cap and the pacing: resolved in `rows`; the skill sees none of it beyond the arguments it passes.
- A blocked or changed page: `rows` reports "no group found" or "did not render", and the skill's notes say what that means for each shop. `rows` does not detect bot walls.

## Done checks

1. **Same groups from saved pages.** On saved HTML of a Kleinanzeigen search page, a Geizhals category page and a Galaxus category page, the Rust detection returns the product list as group 1 on all three, as the probe's JavaScript did (measured 2026-11-08, one page each). For Galaxus the probe used a search page, which robots.txt disallows.
2. **Smaller than the page.** On a page that is mostly prose and markup around its list, the reply is smaller than the page's text; the probe measured 11,921 characters of page text for Geizhals, the live check 11,496 characters of reply against 63,241. On a page that is mostly its list, such as Kleinanzeigen's (9,388 against 8,861), the reply can be larger, because each row adds its link.
3. **End to end.** In a fresh session that uses the skill, the rack example and the monitor example each produce an answer that gives a source for every price it names.
4. **`rows` stays general.** Its code and tests name no shop, the existing web-mcp tests pass, and `tests/mcp.rs` expects five tools.
5. **A failure is visible.** A page with no repeating group and a page that does not render each give a clear message, not an empty reply.
6. **Pacing holds.** Two calls in a row to one host are at least the per-host gap apart, and `rows` never fetches a second page within one call.
7. **Geizhals categories are findable.** Starting from `https://geizhals.de/` or a product page, the agent finds a category slug without a link to a `/hardware/` path or a `?fs=` parameter. If it cannot, the skill says so and tells the agent to ask the user for the category address.
