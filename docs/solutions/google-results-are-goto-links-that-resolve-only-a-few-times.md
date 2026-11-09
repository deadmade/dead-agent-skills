# Google is skipped as "unrecognised page", or gives only its first rows: its result links are `/goto?url=…` and resolve only a few times

- **Seen:** 2026-11-06, `search` answered `skipped: google: unrecognised page`. web-mcp's own capture of a live Google
  results page had 9 result headings and 52 `/goto?url=CAES…` links; each result's `href` is `/goto?url=<token>` on
  `www.google.com`, and the target is in no attribute.
- **Cause:** the Google parser dropped every row on Google's own host (`tools/web-mcp/src/engines/google.rs`), so
  nothing was left. The target is only in the `302 Location` of that link, and Google answers it for a fresh page's
  first 2 to 4 links only: after that `200` with a delay page (`<meta content="3;url=/goto?url=…">`) whose delay grows
  with every request (3, 4, 5, 7, 12, 22 s). After a burst of parallel requests every request got it for about 30 s
  (measured 2026-11-06, one machine; sending the `__Secure-ENID` cookie, or spacing requests 400 ms apart, changed the
  count by one at most). The walk is sequential and ends at its first such answer, and in one live run of six
  searches Google gave rows to every search after the first, so how soon after another search Google resolves again
  is unmeasured.
  `gbv=1` (basic HTML) redirects to the full page, so it is no way round.
- **Fix:** the parser keeps `/goto` rows; `search::resolve_goto` (`tools/web-mcp/src/search.rs`) reads each target with
  a cookie-less GET, redirects not followed, in rank order, and stops at the first answer that isn't a redirect or a
  `404`, a redirect to Google's `/sorry` page, a failed request or the engine's deadline. The rows after it are
  dropped; when none resolves the engine is skipped as "its result links did not resolve", with no rest, so the next
  search asks Google again, even after a `/sorry` redirect (a follow-up could rest the engine then). Branch
  `worktree-web-mcp-google-results-and-clicks`.
- **Spot it next time:** the first measurement (8 of 8 links resolved) was of a minutes-old page and was wrong for a
  fresh one. Before building on a per-link request pattern against a search engine, measure it on a fresh page, several
  searches in a row.
- **Seen again:** 2026-11-09, on most of a day's searches, with the parser already fixed. `~/.claude/bin/web-mcp` was
  still 0.6.19, because the marketplace updates plugins and only the installer updates this binary (ADR 0006). Before
  reading the parser, run the current parser over the page the error names, and check the installed binary's version.
