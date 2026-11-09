# Shopping search: prior art

**Source check (fresh agent, 17 of 17 links opened):** 21 of 24 linked claims confirmed, 3 not supported (corrected below), 0 couldn't open. The probe results (status codes, JSON-LD) and the Gaps paragraph are the report's own observations, not re-checked. Two inferences did not follow from their pages and are corrected.

**Gaps:** eBay's developer site returned HTTP 403 to fetch, so I read only the Browse API overview, not the search reference, rate limits or the DE marketplace id. No Terms of Service page was read for any shop. I found no official consumer API for Galaxus or Geizhals. Amazon.de, Willhaben, Mercateo and Ricardo got only an HTTP status probe. Whether Galaxus, idealo, Geizhals or eBay pages carry Product JSON-LD is unverified, because plain HTTP was blocked. The Kleinanzeigen issue tracker page loaded empty. I found no postmortem on stale prices or duplicate listings beyond READMEs.

## Access facts

- Kleinanzeigen: [robots.txt](https://www.kleinanzeigen.de/robots.txt) disallows `/s-feed.rss`, `/api`, `/*/preis:*`, `/*sortierung:*` and pages past `seite:5`, and lists a sitemap. A scraper README says the site has no public API and scraping conflicts with its ToS ([jnslmk README, Caveats](https://github.com/jnslmk/kleinanzeigen-mcp)).
- eBay.de: [robots.txt](https://www.ebay.de/robots.txt) states that automated access without permission is prohibited and that approved integrations must use the official API. It disallows `/sch/` and blocks ClaudeBot.
- eBay Browse API: it searches by keyword, GTIN or EPID, with filters for price, condition and buying option ([overview](https://developer.ebay.com/api-docs/buy/api-browse.html)).
- Geizhals: [robots.txt](https://geizhals.de/robots.txt) disallows `/redir/`, the `/hardware/` category paths and `?sort=`, `?bpmax=` and `?fs=` parameters, and lists a sitemap.
- Galaxus: [robots.txt](https://www.galaxus.de/robots.txt) disallows `*/search`, `*filterGrid=` and `*/marketplace/`, and lists product sitemaps.
- idealo: [robots.txt](https://www.idealo.de/robots.txt) disallows `ProductCategory/*?q=*`, `/offerpage/`, `/productpage/` and `priceChartApi`. Its documented APIs are for merchants who push offers: [PWS 2.0 via the FAQ](https://partner.idealo.com/partner-idealo-com/uk/learning-center/faq-technical-integration). I saw no buyer-side search API [inferred from absence].
- Observed this run, not from a doc: a plain curl with a browser User-Agent returned 200 from Kleinanzeigen, Willhaben and Mercateo. It returned 403 from Galaxus, idealo, Geizhals, eBay.de and Ricardo, and 503 from Amazon.de.
- Observed this run: the Kleinanzeigen search page's JSON-LD holds only `WebSite` and `ImageObject` entries, with no `Product` or `Offer`. Prices come from the HTML cards.

## Comparable implementations

1. **jnslmk/kleinanzeigen-mcp**, wrapping DanielWTE/ebay-kleinanzeigen-api ([README](https://github.com/jnslmk/kleinanzeigen-mcp)). Five tools, with search returning summaries and a batch tool returning details. It uses headless Chromium with pooled contexts and bounds scrape concurrency. The scraper is pinned to a commit and patched, and Renovate opens a bump PR within an hour of each upstream commit. Decision: search results omit descriptions to protect context.
2. **Samxel/geizhals-mcp** ([README](https://github.com/Samxel/geizhals-mcp), [API notes](https://github.com/Samxel/geizhals-mcp/blob/main/search_api.md)). It calls Geizhals' internal mobile API with a locally signed JWT. Search results already carry best price, offer count and cheapest shop. Decisions: it leans on a site that already aggregates shops, and `match_geizhals` maps a used ad title to a new product with a confidence score and a "too close to call" note.
3. **SerpApi Google Shopping** ([docs](https://serpapi.com/google-shopping-api)). Hosted. It has `min_price`/`max_price`, a `gl` country code, a 1-hour cache that costs nothing when hit, and `output=md` for agents. The MCP wrappers I found ([mcp-searchapi](https://github.com/samwang0723/mcp-searchapi), [FlashData](https://mcpservers.org/servers/github-com-rocosen-flashdata-mcp-tree-main-registry-servers-google-shopping)) wrap other Google Shopping providers (SearchAPI.io, FlashData), not SerpApi.
4. **Zyte API** ([extract docs](https://docs.zyte.com/zyte-api/usage/extract/index.html)). Hosted AI extraction with `product` and `productList` types. `extractFrom: userHtml` accepts HTML you fetched yourself, up to 2.5 MiB. Models can be pinned.
5. **detushar/shop-mcp** ([README](https://github.com/detushar/shop-mcp)). Per-site Playwright modules for Amazon.in and Flipkart, run in a headed browser. A comparison is two searches.

I found no open-source MCP that searches many DACH shops and merges the results. SearXNG's [engine list](https://docs.searxng.org/user/configured_engines.html) shows tabs for general, images, videos, news, map, music, it, science and files, and none for shopping.

## Approaches

**A. Per-site adapters inside one server** (1, 5). Each shop gets a parser behind a shared output type, and the server fans out in parallel. Strong where no aggregator covers the shop, such as used classifieds. It costs a maintenance stream per site. [source] Kleinanzeigen's Astro relaunch broke price and date extraction and needed a patch, and a price-filter URL returned JSON that the scraper read as "no results" ([jnslmk, Upgrading the scraper](https://github.com/jnslmk/kleinanzeigen-mcp)). Bad fit when the user wants low maintenance [inferred].

**B. Query an aggregator that already merges** (2, 3). Geizhals or Google Shopping do the cross-shop dedup and ranking. Fast and small. [source] The Geizhals secret can rotate, and the maintainer runs a daily live test to catch it ([README, Tests](https://github.com/Samxel/geizhals-mcp)). [source] SerpApi ignores `start`, so you get one page of about 40 ([docs](https://serpapi.com/google-shopping-api)). Bad fit for classifieds and for used items [inferred], and it adds a paid key or a reverse-engineered API.

**C. Generic extraction over fetched pages** (4). One schema and no selectors. [source] Zyte warns that retrained models can get worse for specific fields of specific sites ([model pinning](https://docs.zyte.com/zyte-api/usage/extract/index.html)). [source] Zyte fetches pages itself by default (`browserHtml`/`httpResponseBody`), so bot walls are Zyte's problem; only the `userHtml` mode leaves the 403 to us. Cost is per request, no figures read [inferred].

**D. Smallest thing that would work** [inferred]. One tool, `shopping_search(query, max_price, condition)`. It calls eBay Browse, Geizhals and Kleinanzeigen concurrently, each under a deadline, which fits `lookup`. Each result is normalised to `{title, price, shipping, condition, source, url, fetched_at}`. Merge by GTIN or EPID when present, otherwise by normalised title. Failed sources are reported as such. Add Galaxus and idealo only if a 403 can be solved by `fetch`'s browser fallback. Unchecked or against it: Kleinanzeigen has no GTIN; its robots.txt also disallows `/*condition_s*`; Geizhals' GTIN is on `query_product`, not on search hits; Galaxus's and idealo's robots.txt disallow their search paths, so a 403 is not the only barrier.

## Pitfalls

- [source] Geizhals' author built a separate matcher that maps a marketplace ad to a product with a 0-1 confidence and a "too close to call" note; ads with no category (mostly prebuilt PCs naming the card inside) score low so they don't pass for the card ([match_geizhals](https://github.com/Samxel/geizhals-mcp)). That used and new prices mix badly is my inference [inferred].
- [source] Shipping can be negative per payment method, and a shop without a shipping entry is pickup-only ([Offers](https://github.com/Samxel/geizhals-mcp/blob/main/search_api.md)). Compare total price, not item price [inferred].
- [source] Currencies disagree on non-DE and non-AT Geizhals sites ([Sites](https://github.com/Samxel/geizhals-mcp/blob/main/search_api.md)).
- [source] Sorting by price drops unpriced products from the result total ([Response quirks](https://github.com/Samxel/geizhals-mcp/blob/main/search_api.md)).
- [source] Kleinanzeigen search has paid "TOP" ads pinned above date-sorted results (`is_top_ad`), and the API deduplicates by ad id only ([README](https://github.com/DanielWTE/ebay-kleinanzeigen-api)).
- [source] Parallel use may trip bot detection, particularly from datacenter IPs ([jnslmk, Caveats](https://github.com/jnslmk/kleinanzeigen-mcp)).
