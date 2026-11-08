# Captured result pages for the `rows` tests

Each file is the `get html body` of a rendered result page, taken on 2026-11-08 through the running web-mcp browser
window (one page load per site, logged out), then scrubbed. The tests assert what these files hold, so a re-capture
means updating the numbers below and in the tests.

| file                      | source address                                                                                    | scrubbed                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ads_page.html`           | `https://www.kleinanzeigen.de/s-serverschrank-19-zoll/k0`                                         | every ad's text, ids, links, image URLs and seller (see below); script bodies; JSON props; a CSRF token; long SVG paths |
| `product_cards_page.html` | `https://geizhals.de/?cat=monlcd19wide&xf=18036_IPS~18315_ab+2560x1440&pagesize=30&promode=false` | script bodies; JSON props; UUIDs; long SVG paths                                                                        |
| `tiles_page.html`         | `https://www.galaxus.de/de/s1/producttype/monitor-31`                                             | script bodies; JSON props; UUIDs; long SVG paths                                                                        |

Scrubbing kept every tag, class and sibling, so the repeating groups are as the site sent them. In `ads_page.html`
each ad (all 25) has its title, description, place and postcode, ad id, `/s-anzeige/...` link, image URLs, alt text and
seller name replaced by placeholders (`Ad title NN`, `Ad description NN`, `00000 Ort`, `/s-anzeige/ad-NN/0000000000`,
`https://img.example.invalid/ad-NN.jpg`, `Seller NN`). Prices, dates, flags and the page's own text stay. The zeros in
the placeholder link and id are why the leak check `0\d{3,}[ /-]?\d{5,}` still matches there.

## Groups (largest sibling groups, counted on the scrubbed files)

- `ads_page.html`: 25 `li` ads under `ul#srchrslt-adtable`; next a filter panel of 9 `details` sections
  (`form#browsebox-form`), then 15-item `li` and `a` navigation groups.
- `product_cards_page.html`: 30 `div.galleryview__item.card` products and 9 `div.filter-element` entries in the sidebar
  filter row `filter-row-5080`. A guide text below the list (`section#ratgeber`) forms larger sibling groups than the product list: 40
  `div.cms-fliesstext` paragraphs and 37 `li.cms-toc__item` entries. The probe's count of 30 products and 9 filter
  blocks did not include them.
- `tiles_page.html`: 43 `article` tiles in one `div` (50 `article` elements in all; 47 link to a `/product/` page).
  This is a category page, not the 15-tile search page the probe measured. Next come 21 keyword-filter `div`s in a
  `fieldset`, then 13 and 12 `li` navigation groups.
