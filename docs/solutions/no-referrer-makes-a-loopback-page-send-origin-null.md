# A form on a loopback page always fails its Origin check under `Referrer-Policy: no-referrer`

- **Seen:** 2026-11-09, `tools/http-runner/src/login_page.rs`. No save from the login page ever worked in a real browser, though every test over raw HTTP passed.
- **Cause:** with `Referrer-Policy: no-referrer`, browsers send `Origin: null` on the form's POST, so a check that compares `Origin` with the page's own address refuses every save. The tests built their own requests with the correct `Origin` and never met the browser's behaviour.
- **Fix:** serve the page with `Referrer-Policy: same-origin` (commit `5eabb096`), which keeps the address out of any cross-origin `Referer` and still sends the real `Origin` on the page's own POST.
- **Spot it next time:** submit such a page once from a real browser (headless is enough) before trusting tests that forge the headers.
