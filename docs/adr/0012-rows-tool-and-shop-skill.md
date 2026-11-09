# `rows` is a generic tool in web-mcp, and shop knowledge is a skill

A shopping search (Kleinanzeigen ads, Geizhals products) came back from `fetch` as a page of markdown that the agent
had to dig through. web-mcp now has a fifth tool, `rows`: it opens one page in the browser window, finds the page's
repeating groups of items, and returns the two largest as numbered one-line rows, each with its link. A group's score
is its count times its text volume (each item's text counted up to 400 characters) times the square of the share of
its items that hold a link; the plain share was tried first and did not stop Geizhals' guide text from outscoring its
30 product cards. `item`, a CSS selector, overrides the guess. Which shop to ask, with which address, and how to judge
the rows live in the opt-in `shop` plugin, as a skill of text only. No shop name appears in web-mcp's code.

## Considered options

The user declined these (the spec's [Scope](../features/shopping-search/spec.md) lists them):

- **Shop code in web-mcp**, **a separate `shop-mcp` crate**, **a library split of web-mcp**, **parsers in Rust** and
  **a selector DSL per shop.**

A split returns if auto-detection proves too weak on real pages, or if we need to merge duplicates or keep a price
history.
