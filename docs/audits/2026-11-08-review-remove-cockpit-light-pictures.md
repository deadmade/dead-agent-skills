# Review: remove-cockpit-light-pictures

branch: remove-cockpit-light-pictures ← origin/main (merge-base 24d39d70), 68 files outside the deleted cockpit folders, 15 commits, nothing uncommitted besides this run's folder.

## Findings

Lenses: correctness (given the neutral brief, because the run folder is untracked), lean, tests, docs, and security and risk, followed by one verifier. The correctness lens found nothing. On this commit the checks were green: `npm test`, `npm run typecheck`, `cargo check --workspace --offline` and clippy with `--locked`, the harness lint and the skill scanner. `nix flake check --no-build` fails in the pre-commit derivation, but it fails the same way on the parent commit.

| #   | severity | where | finding | evidence | fix (recommended) | bucket |
| --- | -------- | ----- | ------- | -------- | ----------------- | ------ |
| 1 | medium | `plugins/flows/skills/diagrams/scripts/render.mjs:198-201` | A protocol-relative or backslash image address (`//host/x`, `\\host\x`, `/\host/x`) passes `safe()` and, on a page opened from disk, resolves to `file://host/x`. On Windows that is a UNC path, which can start an SMB request that leaks a login hash. | plausible: the `<img src>` and its resolution reproduced in jsdom and Node's `new URL`; a Windows browser was not tested. | In `safe()`, reject an address that starts with two slashes or backslashes (`/^[\\/]{2}/`) and add tests for the three forms; optionally add a CSP meta `img-src https: data:`. | fix before merge |
| 2 | medium | `check.mjs:143,150`, `render.mjs:269`, `SKILL.md:55-65` | With no route to the npm registry and a cold npm cache, the checker waits about 70 s, and `render.mjs` then checks again, so a gate waits about 140 s, and so does every later round. | confirmed: measured 70.7 s per run with the registry refused, 0.64 s with `npm_config_fetch_retries=0`; the failure writes no stamp. | A short fetch timeout or one retry, and remember a failed install for an hour; optionally let SKILL.md run only `render.mjs`. | worth doing |
| 3 | medium | `tests/check.test.mjs:30-31` | One failed parser run skips all 11 parser tests, so a Mermaid bump that breaks `parse.mjs` leaves CI green. | confirmed: with a Mermaid module that throws on load, 19 tests gave 10 pass, 0 fail, 9 skipped. | Skip only when the reason is the environment (`npm was not found`, `npm ci ...`); otherwise, or when `CI` is set, let the tests fail. | worth doing |
| 4 | medium | `tests/render.test.mjs:106-113` | The page's marked renderers (html, link, image, walkTokens) are tested only by greps of the source; `marked.use` never runs in a test. | confirmed: `html({ text }) { return esc(text)` stays green if `esc` becomes the identity. | Add `marked@18.1.3` as a devDependency, evaluate the page's `marked.use` block, assert on `marked.parse` output for `<script>`, a `javascript:` link and an alt-text injection, and delete the greps. | worth doing |
| 5 | low | `SKILL.md:67-69`, `render.mjs:11-12,179-180` | The rendered page is blank offline or where a preview blocks jsdelivr, and the docs cover only the checker's offline case. | confirmed: the page text comes from a module that imports marked and Mermaid from jsdelivr. | One sentence in step 4: offline, show the checked document as text. | worth doing |
| 6 | low | `render.mjs:11-12,179-180` | Mermaid and marked load from jsdelivr with no integrity check and no content security policy. | confirmed (absence read); exploiting it needs a CDN or proxy compromise. | A CSP meta with `connect-src 'none'` (it also takes the `img-src` line from finding 1); later, SRI or inlined bundles. | worth doing |
| 7 | low | `check.mjs:223`, `render.mjs:269-270` | A plan Files item that is a glob or a brace list, or that has a `:line-range`, is refused as "does not exist". | confirmed: reproduced; none of the 24 older plans gives an error (22 stop at `no plan map`), and `plan-shape.toml` already forbids such items. | Say "a pattern or line range, not a path" in that case. | worth doing |
| 8 | low | `AGENTS.md:90-91` against `:100` | AGENTS.md says `writing` is the one model-invocable flows skill, but line 100 adds `diagrams` as a second. | confirmed: `skills/diagrams/SKILL.md` has no `disable-model-invocation`; only writing and diagrams lack it. | "the one skill" becomes "one of two skills (with `diagrams`, below)"; the `flows-uses.mjs` comment reads "the rest (writing, diagrams)". | fix before merge |
| 9 | low | `glance.mjs:118-121,157-165`, `check.mjs:65-73` | A task whose Files are written inline or as `- **Modify:**` gets no plan map and no warning. | confirmed: a plan with such lines and missing files gave no output and exit 0. | In `planMap`, throw when `t.files > 0 && t.entries.length === 0`, so the `no plan map` warning shows; add a test. | worth doing |
| 10 | low | `check.mjs:126-139` | The cache stamp hashes `parse.mjs`, so a change to `parse.mjs` alone reinstalls 150+ MB; offline, `npm ci` removes the working `node_modules` and then fails. | confirmed: line 137 copies all three files before the stamp compares, so a stale `parse.mjs` cannot run. | Hash only the two package files and fix the comment. | worth doing |
| 11 | low | `tests/check.test.mjs` | The `>` marker, `-` with a missing path, a plan Delete of a missing path and a plan Create of an existing path have no test. | confirmed: 19 tests read, none cover them. | One CLI test per branch with the existing `put` helper. | worth doing |
| 12 | low | `tests/check.test.mjs:67-71,86-91,107-114,166-169` | Several tests assert only exit 0, which a run with a `not parser-checked` warning also gives. | confirmed by reading; a late parser failure was not triggered. | `assert.doesNotMatch(r.out, /not parser-checked/)` in those tests. | worth doing |
| 13 | low | `check.mjs:125-152` | The cache-stamp logic has no test. | confirmed. | With the fake `npm`, run twice against one cache, then delete the stamp and expect the call again. | worth doing |
| 14 | low | `tests/render.test.mjs:202-203` | The test that pins the CDN versions restates the constants, and nothing ties the page's `mermaid@12.3.0` to `package.json`, which Dependabot bumps. | confirmed. | Replace the two lines with a comparison against the version in `package.json`. | worth doing |
| 15 | low | `parse.mjs:26-31` | Nothing pins how a flowchart subgraph counts toward the 8-node limit. | confirmed: a subgraph named by an edge counts; one no edge touches does not. | One test stating the count you want. | worth doing |
| 16 | low | `tools/installer/core/plugins.ts:82-83`, `install.ts:212` | An old flow-cockpit install keeps its 11 capture hooks until the installer runs again. | plausible: `retiredPlugins` has no caller outside the installer; what Claude Code does with a delisted plugin was not checked. | A line in the release notes or the installer's final report: run the installer again, or `claude plugin uninstall flow-cockpit@dead-claude-skills`. | worth doing |
| 17 | low | `THIRD_PARTY.md` | No entry for Mermaid, jsdom and marked, which the diagrams skill installs or loads. | confirmed: the removed cockpit section was the only mention. | A `## diagrams (flows)` section: nothing vendored, the pinned versions and their licences. | worth doing |

Dropped: 2.

- The lean lens's "`clean()` changes nothing". `clean()` is the layer that commits d5e4be9d and b7d67bee added on purpose, and it is tested at `render.test.mjs:116-161`; the lens also probed marked 16.4.2, not the page's 18.1.3.
- The verifier's "`OFF_PALETTE` is a leftover". Measured here: with the list emptied, `scripts/repo-facts.test.mjs` fails, because `tools/ado-mcp/src/bin/timetrack/ui.rs:30` still holds `0x0022_1d33`.

Not worth fixing, so left out of the table:

- The install is 227 MB on disk, against "about 150 MB" in `SKILL.md:70`.
- `README.md` and `plugins/flows/plugin.json` do not mention the diagrams page.
- `parse.mjs` returns an `edges` count that nothing reads.
- `render.test.mjs:44` repeats an assertion.

Picks: 1, 8

Fixed 2026-11-09: 1 (commit 6577ea78: `safe()` refuses an address that starts with two slashes or backslashes; the test failed first, then passed)
Fixed 2026-11-09: 8 (commits c51540a7 and 89a08720: AGENTS.md and both `flows-uses.mjs` comments name two model-invocable skills)

A fresh checker passed both against the real marked 18.1.3 and the produced page source.

## Tasks

Fix 1: base 3ed0b952, untracked at start: this audit file and the run folder; files clean.
Fix 8: base 6577ea78, untracked at start: the same; files clean.

## Rulings

## Parking lot

- Left on users' machines, for them to delete by hand: `~/.claude/bin/flow-cockpit/`, `~/.local/state/flow-cockpit/capture/`, `~/.config/flow-cockpit/`, and `~/.cache/dead-agent-skills/diagrams-venv` (an unused stray folder from a builder's probe).
- A plan with Delete tasks fails the checker once those tasks have run, so Gate 2 cannot render it again (`check.mjs:219-224`). A Mermaid block inside a blockquote or nested in a list item is drawn but never checked (`check.mjs:22`).

## Deviations

## Skipped

## Run verdict
