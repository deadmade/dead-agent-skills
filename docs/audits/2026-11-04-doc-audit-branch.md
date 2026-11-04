# Doc audit: worktree-web-mcp-google-block ← origin/main (2baae14)

Run from `/verify` (feature flow `web-mcp-google-block`), 2026-11-04, on 14433d5 plus the uncommitted self-review fix
wave. The CLAUDE.md step was skipped: self-review's CLAUDE.md pass already ran.

## Scope

- `AGENTS.md`: changed; the web-mcp paragraph names the flag, Google's fixture, the typed path and the fake.
- `GLOSSARY.md`: changed; "Automation flag" and "Typed search".
- `docs/adr/0004-browser-search.md`: changed; the "No stealth" note.
- `docs/adr/0009-no-automation-flag.md`: new.
- `plugins/shared/web-mcp/README.md`: changed; "How search reads engines".
- `crates/web-mcp/tests/bin/fake_agent_browser.rs` module doc: changed; AGENTS.md cites it.
- `docs/solutions/chrome-version-opens-a-window-on-windows.md`: names `--version` and the Chrome major, which the
  branch changed.

## Checks run

- Claims: five `flows:spec-compliance-checker` agents. Their analyses are in the session scratchpad
  (`doc-audit/claim-{B,C,D,E,F}.md`):
  - B: AGENTS.md on Google.
  - C: AGENTS.md on the typed path.
  - D: the fake's module doc and AGENTS.md on the fake.
  - E: the README section.
  - F: ADR 0009 and ADR 0004's code claims.
- Mechanics:
  - Every repo path the branch added to these docs exists. The script listed only older paths that are relative to
    their own subproject.
  - The branch adds no URLs and no Markdown links.
  - No manifest changed.
- Prose: the changed docs, read against `technical-writing`. The findings are folded in below.

## Findings

| #   | severity | where                                                           | finding                                                                                                                                                                                                                                                                                                                                                                       | evidence                                                                                                                                                                         | fix (recommended)                                                                                                                                                                          |
| --- | -------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | med      | `plugins/shared/web-mcp/README.md:43-45`                        | The README lists four cases that load the result URL. It misses the search after any search that didn't get results (consent, block, unrecognised, timeout, a `since` search) and an odd query. It says a failed typing loads the URL, but a typing that runs out of time answers "timed out". "Google once its results parse" hides that Google's results don't parse today. | claim E: `search.rs:152` takes the remembered query and `:196-198` puts it back only on results without `since`; `:174-176` "timed out"; `:268-269` odd queries; `google.rs:1-4` | Say typing needs the engine's last search to have got results for another query. Name the fallback as "anything else". Say Google doesn't type yet because its result links don't parse.   |
| 2   | med      | `plugins/shared/web-mcp/README.md`                              | The user doc never says the window turns the automation flag off and sets no user agent. That setting carries the terms-of-service risk ADR 0009 names.                                                                                                                                                                                                                       | claim E: a grep of `plugins/shared/web-mcp` for webdriver, automation and userAgent finds nothing; `profile.rs:207-209`                                                          | Add one sentence with a pointer to ADR 0009.                                                                                                                                               |
| 3   | med      | `AGENTS.md:97` (typed path)                                     | "after results for another query" reads as "any earlier search". It must be the engine's last search in this process. "a failed typing … loads the URL instead" isn't true when time runs out. The sentence also omits the box and query-shape conditions.                                                                                                                    | claim C, C1(d) and C4: `search.rs:152`, `:196-198`, `:236-246`, `:264-270`                                                                                                       | Write "when the engine's last search here got results without `since` for another query, and the engine has a box and the query is plain", then "…loads the URL instead, time permitting". |
| 4   | low      | `AGENTS.md:97` (Google)                                         | "never types" is too strong. A Google no-results page, or a row that links off google.com, would parse as results and let the next Google search type.                                                                                                                                                                                                                        | claim B, B4: `engines/mod.rs:204-205`, `google.rs:77-79`                                                                                                                         | Write "doesn't type today".                                                                                                                                                                |
| 5   | low      | `AGENTS.md:97` (fake)                                           | "a session's tab keeps its last opened URL" isn't quite right: only a batch's `open` stores it, and a top-level `open` (the browser tool's) doesn't.                                                                                                                                                                                                                          | claim D, D.21: `fake_agent_browser.rs:83`, `:99`, `:122`                                                                                                                         | Write "keeps the URL its last batch opened".                                                                                                                                               |
| 6   | low      | `docs/adr/0009-no-automation-flag.md:39-40`                     | "No browser version is read any more" isn't true: web-mcp and the installer still parse Chrome for Testing's folder version to pick the newest install. What stopped is reading a major from the browser.                                                                                                                                                                     | claim F, F2: `profile.rs:429-448`, `:475-479`; `tools/installer/core/binaries.ts:225-230`                                                                                        | Write "No browser reports its version any more…; Chrome for Testing's folder name still picks the newest install".                                                                         |
| 7   | low      | `crates/web-mcp/tests/bin/fake_agent_browser.rs:19-21`          | The doc says the `.stuck` mark is consumed by the session's next batch without an `open`. It isn't consumed by a typing batch or a gone-tab batch, and `tab new` leaves it.                                                                                                                                                                                                   | claim D, D.19: `:116`, `:132`, `:74-78`                                                                                                                                          | Write "the next read (not typing, not a gone tab)".                                                                                                                                        |
| 8   | low      | `docs/solutions/chrome-version-opens-a-window-on-windows.md:10` | The doc's Fix line says Chrome for Testing's "major version comes from its folder name". No major is used any more.                                                                                                                                                                                                                                                           | claim F, outside notes; `profile.rs:414-416`                                                                                                                                     | Leave it: solutions docs record the fix as made (d09fd2e).                                                                                                                                 |
| 9   | low      | `crates/web-mcp/tests/bin/fake_agent_browser.rs:1-21`           | The module doc doesn't describe five behaviours that tests rely on: a `/slow` input sleeping 3 s, `redirect-private`, `screenshot`, a missing `chrome` file answering "1", and a batch `open` of a "fail" URL succeeding. All predate this branch.                                                                                                                            | claim D, U.1–U.5 and D.2                                                                                                                                                         | Leave it for a fake-doc pass; not this branch's surface.                                                                                                                                   |
| 10  | low      | `plugins/shared/web-mcp/README.md`                              | Two older overstatements. A tab is "kept and reused", but a failed read closes it. The Helium wrapper is described as "On Linux", but the code applies it on every non-Windows OS.                                                                                                                                                                                            | claim E: `browser.rs:626-640`; `profile.rs:277-281`                                                                                                                              | Leave them: older text, not this branch's surface.                                                                                                                                         |

## Picks

The user picked 1–7 ("fix them"); 8–10 left as recommended.

- 1, 2: `plugins/shared/web-mcp/README.md` names the condition for typing, every case that loads the URL, the
  timed-out case and Google's state today, and a new paragraph names the flag, the missing user agent, the terms risk
  and ADR 0009.
- 3, 4, 5: `AGENTS.md:97` gives the full typing condition and the timed-out case, says Google "doesn't type today",
  and says the fake keeps the URL its last batch opened.
- 6: ADR 0009 says no Chrome major is read and the folder version still picks the newest install.
- 7: the fake's module doc says which batch consumes the `.stuck` mark and that `tab new` leaves it.

Re-check: each new sentence held against the lines the claim checkers cited (`search.rs:152`, `:174-176`,
`:196-198`, `:236-246`, `:264-270`; `fake_agent_browser.rs:114-132`; `profile.rs:429-448`); paths named in the
new text exist; prettier clean.
