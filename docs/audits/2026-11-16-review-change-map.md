# Review: change-map

branch: change-map ← 72ea687 (merge-base with dev), 17 files, +1544 −164, 10 commits + untracked run notes
(`docs/features/change-map/`). Intent: `docs/features/change-map/spec.md` and `plan.md` (Tasks 5–6 replace the spec's
card layout with a Files/Relations panel).

Checks: `npm test` at 4f08129: 588 pass, 7 fail, 6 skipped; python and rust suites not run (uv not on PATH; cargo not
run from Git Bash; neither touched). The 7 failures (symlinked CLI folder, release workspace, mods suite temp copy, 4
symlink EPERM in the installer) fail the same way at the base 72ea687 (13 fail there, these 7 included):
pre-existing, measured.

Lenses: correctness (neutral brief: the tree has untracked files), lean, tests, docs, security, risk. Verified by one
fresh agent.

## Findings

| #   | severity | where | finding | evidence | fix (recommended) | bucket |
| --- | -------- | ----- | ------- | -------- | ----------------- | ------ |
| 1 | med | `scripts/check.mjs:95-108`, `:138` | A `files` example inside a task's steps is taken as the task's own fence and fails the plan with an error ("its files block names X, which its Files list doesn't") | confirmed: `scratchpad/taskfence.mjs` → `error, block 1: Task 1: its files block names src/example/new.ts…` | Count a fence as the task's own only before the task's first `- [ ]` step line | fix before merge |
| 2 | med | `scripts/outline.mjs:52-66` | TS/JS class fields holding a function (`handler = () => {}`) aren't outlined: `~ handler` gets a false "not found" warning and the pane drops the row | confirmed: cached outliner on `class A { handler = () => {}; run() {} }` returns only `A`, `A.run` | Treat `public_field_definition` / `field_definition` with a function value like `variable_declarator` | fix before merge |
| 3 | med | `scripts/check.mjs:302`, `:329`; `steps/plan-shape.toml:23-25` | "`~` file has no symbols" warns for files without a grammar (README, JSON, TOML), 22 warnings on `shopping-search/plan.md`; the step text tells every conductor symbols are expected for every `~` file, inviting made-up symbols nothing checks | confirmed: checker on `docs/features/shopping-search/plan.md` | Warn only when the extension is in `LANGS`; say "every `~` code file" | fix before merge |
| 4 | low | `diagrams/SKILL.md:88` | Says the first check downloads "about 150 MB"; the cache is 352 MB on disk (grammars 136 MB, Mermaid 121 MB) | confirmed: `du -sh …/diagrams-node/node_modules` → 352M | "about 350 MB on disk" | fix before merge |
| 5 | med | `scripts/render.mjs:459-506`; `tests/render.test.mjs:361-371` | The page script (select, tabs, ↑/↓, node click) has no behavioural test; only source-order and `aria-current` presence are asserted | confirmed: read | One jsdom test that runs the script on `mapHtml` output and dispatches a tab click, a file click and ArrowUp | worth doing |
| 6 | low | `check.mjs:359`, `render.mjs:238-239` | The symbol-matching rule exists twice; if one side changes, page and checker disagree | confirmed: read | Export one matcher from `check.mjs` | worth doing |
| 7 | low | `docs/components/flows.md:43-46` | Two lists of what the checker installs | confirmed: read | One list: Mermaid, jsdom, web-tree-sitter and the grammars | worth doing |
| 8 | low | `plugins/flows/README.md:20` | The diagrams row omits outlines, symbol checks and the panel | confirmed: read | Add "checks each mapped file's symbols against its tree-sitter outline" | worth doing |
| 9 | low | `tests/check.test.mjs:436-437` | `.js/.mjs/.jsx/.tsx` grammars untested (they work today) | confirmed as gap: ran `.mjs`, `.tsx` → outlined | Add `.mjs` and `.tsx` fixtures to the existing test | worth doing |
| 10 | low | `tests/fixtures/outline/*` | Several KIND entries have no fixture (they work today) | confirmed as gap: ran enum/trait/record/struct/type → outlined | Add them to the existing fixtures | worth doing |
| 11 | low | `tests/check.test.mjs:358-364` | "an old paths-only block still passes" mostly duplicates `:239-244` | plausible: read | Delete it, or keep for the `-`/`>` lines | worth doing |
| 12 | low | `check.mjs:195-227`, `package.json` | One shared install now also serves outlines: more runs install, an `outline.mjs` edit reinstalls; download adds ~11 MB | plausible: tarballs measured ~10.7 MB | None now (the user chose the shared install) | worth doing |

Dropped: 1 (half of a tests finding: the `related` assertion in the bar test is the only check that the overview
figure exists).

Gate 1, report: 2026-11-16. Picks: 1, 2, 3, 4, 5, 6, 7, 8

Fixed in 8531e02, each checked by a fresh agent (PASS; taskfence.mjs now prints `[]`, the outliner returns
`A.handler`, a mutation of the page script fails the new jsdom test):
Fixed 2026-11-16: 1
Fixed 2026-11-16: 2
Fixed 2026-11-16: 3
Fixed 2026-11-16: 4
Fixed 2026-11-16: 5
Fixed 2026-11-16: 6
Fixed 2026-11-16: 7
Fixed 2026-11-16: 8

## Tasks

## Rulings

## Parking lot

## Deviations

## Skipped

- Built-in correctness review: the tree has untracked files (run notes), so the lens ran its neutral brief.

## Run verdict

Recorded in the build run's flow.md (`docs/features/change-map/flow.md`): worked as a whole: yes; clean: no.
