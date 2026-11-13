# `rows` stalls for a minute on a page with one huge text node under deeply nested elements

- **Seen:** 2026-11-09, the fix check of the shopping-search review. 3,000 nested `div`s around one 3.9 MB text node
  (spaces, one long word or newlines) took 23 to 88 s in a debug build, after a node-count budget and a 400-character
  cap on each item's text were already in place. Before the cap, 3,000 nested `div`s around 200 KB of text took 25 s.
- **Cause:** `text_of` (`tools/web/web-mcp/src/rows.rs`) runs once per child of every parent, so a text node is read once
  per ancestor. A budget of nodes visited bounds the walk, and a cap on the output bounds the result, but neither
  bounds the cost of reading one node: `NodeRef::text()` copies it and `split_whitespace` scans all of it. Two traps
  came with it: a cap tested with `==` is stepped over when the separator pushes the count past it, and html5ever
  itself is quadratic in nesting depth (30 s to parse 20,000 nested `div`s in a debug build), so the tests use 3,000.
- **Fix:** `4eb71701` reads the node by reference, stops at the cap, and charges its byte length against the same visit
  budget (one visit per 8 bytes); the cap checks use `>=`.
- **Spot it next time:** a test for a bound on hostile input needs a page that is large in the dimension the bound
  does not count: deep nesting with one huge text node, not only deep nesting with little text. Mutate each
  comparison of the cap (`>=` to `>`) and see a test fail.
