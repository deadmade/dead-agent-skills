# `click` and `press` report done in a web-mcp tab but nothing happens, and agent-browser's `tab <id>` then answers `Unknown ref`

- **Seen:** 2026-11-06, the `browser` tool's `click` on a button and `press Enter` reached no page event, and `search`
  alternated between four engines and one engine after about 32 s (a typed follow-up search lost its keys, then the URL
  load that followed worked). On a fresh server 0 of 3 clicks arrived, with `document.visibilityState` `"hidden"`.
- **Cause:** every engine, `browser` session and fetch fallback is a tab of one window, and only the front tab takes
  input: agent-browser 0.41.1 reports `click` and `press` done and delivers nothing to a hidden one (upstream
  issue #2146). The obvious fix, agent-browser's own `tab <id>`, does raise the tab but makes the daemon forget its
  refs, so every `click @e1` after it answers `Unknown ref` (measured). The fake agent-browser doesn't model that, so
  every unit and integration test passed until the live run.
- **Fix:** `Browser::raise` (`tools/web-mcp/src/browser.rs`) finds the session's own tab with `tab list` (the `active`
  row's `targetId`) and activates it through Chrome's debug port, `GET /json/activate/<targetId>`, under one `front`
  lock held until the input is sent. Live, the same replay delivered 3 of 3 clicks by ref and 3 of 3 `press Enter`,
  against 0 of 3 before. Branch `worktree-web-mcp-google-results-and-clicks`.
- **Spot it next time:** input that succeeds with no page event is a hidden tab: read `document.visibilityState` in the
  tab before blaming the selector. Prove a raise live (a fresh server, then click by ref), never with the fake alone,
  and again whenever the agent-browser pin moves.
