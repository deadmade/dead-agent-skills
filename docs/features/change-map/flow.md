---
flow: feature
phase: done
now: "Done: PR handed over for change-map (base dev)."
---

# Change map: flow

## Request

Hey, I would like to build something that is able to easily visulize changed in files and code structure. Im a bit
unhappy whith something like [screenshot: the diagrams page's file map, a folder tree of `~` files with per-folder
counts]

## Artifacts

- Prior art: [prior-art.md](prior-art.md)

- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs:
- Glossary:

## Gates

- Gate 1, spec approved: 2026-11-16. Reopened 2026-11-16: plans carry symbols in a per-task files fence (prettier
  rewrites indented lines), and big maps collapse in Node; approved again 2026-11-16 with Gate 2.
- Gate 2, plan approved: 2026-11-16, execution: subagent-driven
- Gate 3, review-code: report: 2026-11-16 (Picks: 1-8)

## Skipped

- Grounding ran inline (direct reads of the one subsystem) instead of pstack `how`: the subsystem is three files.

- Spike (throwaway, not built code): a hand-written HTML mockup of the overview and file cards, drawn from this
  feature's own predicted change, shown before Gate 1 at the user's request.

- /review-code: the built-in correctness review didn't run (untracked run notes); the neutral lens brief ran. The
  python and rust suites didn't run on this Windows shell (neither is touched). Accepted by the user 2026-11-16.

## Grounding

- The screenshot is `flows:diagrams`' file map (verified: `plugins/flows/skills/diagrams/scripts/render.mjs:55-99`):
  a nested `<details>` tree, folders with one child folded, per-folder marker counts, files coloured by marker.
- Input: ` ```files ` blocks (`+ ~ - >` per path) parsed by `parseFilesBlock` (`check.mjs:47`), or a plan's task
  **Files** lists via `planMap` (`check.mjs:65`), grouped per task in `planMapHtml` (`render.mjs:102`).
- The data carries only marker + path: no line counts, no symbols, no relations (verified: `check.mjs:47-75`).
- Page: self-contained HTML, Mermaid 12.3.0 + marked 18.1.3 from jsdelivr, theme tokens in `THEME` (`render.mjs:16`).
- Checker compares spec maps with the repo as warnings, plan maps as errors (SKILL.md, `check.mjs:174-247`).
- Docs: `docs/components/flows.md:38` (Diagrams). No glossary term or ADR covers diagrams.

## Prior art

Four approaches: sized-area maps (git-truck, repo-visualizer, CodeScene), diff-stat file lists (git `--numstat`,
diff2html, GitHub), relation graphs with changed nodes highlighted (Mermaid subgraphs + `classDef`, collapsible
subgraphs), ranked shortlists (CodeScene, difftastic). None of the sampled tools works from a predicted file list.
Source check: 26 confirmed, 3 not supported (fixed), 2 mis-cited (recited), 0 couldn't open.

## Findings

Baseline (worktree `change-map` from dev 72ea687, 2026-11-16): `node --test plugins/flows/skills/diagrams/tests/` 32
pass, 2 skipped, 0 fail.

## Options

### Where the view is used
Picked: the gate pages (flows:diagrams), not real diffs or a standalone tool.
Rejected: gates + real diffs; standalone tool.

### Shape
Picked: a picture drawn from structured change data: an overview graph (files, moves, relations) plus a card per file
with the file's real outline and the change overlaid.
Rejected: annotated tree (B), lite notes + symbols (A, the smallest option), treemap (C), before/after maps, signature
diff sketch. User: "with just more text we can't fix it"; "one picture is not enough".

### Outline parser
Picked: tree-sitter (web-tree-sitter + grammar wasm, in the checker's cache). Rejected: regex heuristics.
Tool language: Node ESM like the rest of diagrams/scripts (user asked; my call).

## Plan review

### Round 1 (correctness: opus, fit: fable, simpler: sonnet)

Findings, merged: 3 blocking, 9 should-fix, several consider; none dropped. One more blocking finding was mine,
measured: prettier 3.10.1 rewrites indented symbol lines under Files bullets (`+` → `-`, `>` → blockquote).
User decisions (2026-11-16):
- Plan symbols: a files fence per task (reopens Gate 1 for that spec line).
- Big maps: collapse in Node (flat folder nodes), not Mermaid collapsed subgraphs.
- Grammars: all four languages, shared install with Mermaid (against my recommendation of a separate cache).
- The rest, applied: wrapper-aware outline walk with fixtures; parse-check of generated overviews; page-wide ids and
  `closest()`; task-order symbol checks and net markers; exported test seams; plan-shape.toml; treefmt the fixtures; a
  why needs two spaces; strip a nested fence's indent; stale wording in dependabot, skill-scanner and the render tests.
- Simpler's "ship outlines later" and "only JS/TS + Rust" were not taken (the user picked outlines and four languages).
Fix check 1 (opus): 10 PASS, 2 FAIL (symbol net markers, install rule vs overview parse-check). Fixed.
Fix check 2 (sonnet): both PASS; the net-marker test was made explicit.
No fresh-eyes round: no new task order, module or library.

## Tasks

Task 1: base 72ea687, untracked at start: docs/features/change-map/{flow,plan,prior-art,spec}.md; files clean, size 231 of ~170 (under 2x), deviation (adds: planMap `add` parameter), decided; review approved, 1 fix (all-indented blocks), re-review resolved; complete 0cad730
Task 2: base 0cad730, untracked at start: the same four run files; files clean, size ~406 of ~230 (under 2x); review: 2
Important fixed (outside-root paths never outlined, C# file-scoped namespaces), re-review addressed; complete 381d292
Task 3: base 381d292, untracked at start: the same four run files; size 539 of ~260 (over 2x), deviation decided
(accept); review approved; complete df0a2ce; layout then rejected by the user, reworked in Task 5
Task 5: base df0a2ce, untracked at start: the same four run files; size 421 of ~200 (just over 2x, to the user); review:
2 Important fixed (handlers before Mermaid, aria-current), re-review approved; commits e48e328, c53bf24
Task 6: base c53bf24; files clean, size 158 of ~120 (under 2x); review approved; complete 457a3b1
Task 4: base 457a3b1; files clean, size 43 of ~50; complete 7552a99
Final review (opus, 72ea687..7552a99): with fixes; 1 Important + 5 Minor fixed in 4f08129 (diagrams 68 pass, 0 fail,
3 skipped; build:harnesses exit 0; npm test only the 7 known failures); re-review approved

## Rulings

2026-11-16, Task 1: in a plan task's files fence a `uses` target may be any path in the plan's map; its source must be
in that task's Files list — the spec's "in the block" read as the plan's whole map — a cross-task relation judged
wrongly; easy to tighten.
2026-11-16, Task 3: render.test.mjs:146 (clean-pass test) is adapted to the cards, not deleted — it guards page
safety — none.
2026-11-16, Task 1: the wrapped-bullet test uses a bullet whose first line is complete plus an indented prose line
(not web-mcp-search's verbatim bullet, which glance already rejects today) — it tests what this change could break —
the verbatim plans still show "no plan map", as before this change.
2026-11-16, Task 1: a file move (`>`) in a plan task's fence keeps the Files list's marker and drops `from` — plans express
file moves as Delete + Create — a moved file in a plan shows no move edge.
2026-11-16, Task 1: a document with `### Task` headings that glance can't parse still has its task fences claimed (no
spec-style checks on them) — no existing plan has such a fence — such a fence goes unchecked.
2026-11-16, Task 1: `npm test`'s 7 node failures (5 symlink EPERM on Windows, release.test.mjs, test.test.mjs) are
treated as pre-existing: Task 1 touches none of the code they test; not measured on the base commit — a real
regression would be missed.
2026-11-16, Task 2: the outlines Map leaves out files it doesn't outline (no null entry); Task 3 treats a missing
entry like null — the interface reads null as "no grammar" — one lookup in Task 3.
2026-11-16, Task 2: a path resolving outside the repository root is never outlined, silently (existing missing-path
warnings stand) — validation at the trust boundary the builder brief requires — a deliberate ../ path gets no outline.
2026-11-16, Task 5: the selected file button carries `aria-current="true"`, not the plan's `aria-selected` (a button
doesn't expose it to screen readers) — accessibility is never cut — none.
2026-11-16, Task 3: overview node colours come from page CSS (THEME tokens, `!important`), since classDef can't use
CSS variables — one colour source — a Mermaid bump that changes node markup loses the colours.
2026-11-16, Task 3: the map's markup classes and the `x` node id family are private names, not deviations — builder
brief — none.
2026-11-16, final review: fixed the docs (symbol move is `> name -> path`, `not outlined` is one warning per run, `>`
symbol check, symbols expected on `~` files), unchecked task fences when the plan map fails, and the pane note's
wording; deferred minors triaged as not blocking — reviewer's triage — the deferred minors stay as known limits.
2026-11-16, all: `tools/harness-compiler/src/cli.ts` shows as modified with no content diff (line endings only); left
alone, never staged — not this run's file — none.
2026-11-16, all: builders format with prettier 3.10.1 (treefmt's options) and rustfmt, since this worktree has no
pre-commit hooks — the hook would do the same — a formatting diff at the next hooked commit.

## Decide

2026-11-16: every Ruling and Deviation above confirmed by the user ("Confirm all"), Task 5's size (421 of ~200)
included; the Mermaid node-id `shortcut:` in render.mjs confirmed. Parking lot picks: taskFences fence length and
the per-file outline failure are follow-ups; the margin/caption line is dropped; review findings 10-11 (more KIND
fixtures, the duplicate test) are follow-ups, 12 (shared install) dropped.

## Parking lot

- `check.mjs` `taskFences`: toggles on any fence line, ignoring fence length; a longer fence holding ``` lines can
  attach a later files block to the wrong task (reuse `extractBlocks`' fence tracking).
- `outline.mjs`: one unreadable file fails the whole outline step; a per-file try returning null would keep the rest.
- `render.mjs`: the plan map's panel lost its 1.6rem margin; captions show only the parent folder.

## Deviations

### Task 1: `planMap(markdown, add)` takes an optional problem callback

Status: decided 2026-11-16: keep the optional `add` parameter.

The plan's interface is `planMap(markdown)`. To report a task fence's problems without throwing (so the plan's path
checks still run), the builder added an optional second parameter `add(level, block, message)`, passed only by
`checkMarkdown`. Options: (a) keep it (recommended: one caller, smallest change, `planMap(markdown)` unchanged for
Task 3); (b) `planMap` returns entries and fence problems as `{ entries, problems }`, which changes every caller; (c)
`checkMarkdown` re-parses the task fences itself, which duplicates the parsing.

### Page layout: side by side (added Task 5)

Status: decided 2026-11-16: build Task 5 as mocked.

After Task 3 the user found the page unintuitive: "I have to scroll to see the changes". They picked a side-by-side
layout: a file tree on the left with per-file change counts; the selected file's outline with the change overlaid on
the right, no scrolling; the relation graph in a Relations tab; arrow keys step through files. Mockup:
scratchpad `change-map-mockup2.html`. This changes the page Task 3 built (`render.mjs`'s overview and cards), so it
becomes Task 5 (~200 lines), before Task 4's docs. Options: (a) build Task 5 as mocked (recommended); (b) adjust the
mockup first.

### Task 5 size; Relations: a flat graph (added Task 6)

Status: decided 2026-11-16: Files accepted as built ("Files look good"); Relations redesigned as a flat graph (no
folder boxes, folder as a caption, labelled arrows, unrelated files listed apart), built as Task 6 (~120). The size
question (421 of ~200) was answered implicitly by accepting Files; recorded as accepted.

### Task 3: diff of 539 changed lines against ~260 (just over twice)

Status: decided 2026-11-16: accept the size.

Added lines are 426 (render.mjs 224/75, render.test.mjs 184/36, check.mjs and check.test.mjs small); the tests are
about half. Options: (a) accept as is (recommended: the overrun is mostly replaced tree tests and new card tests; the
task review checks the code itself); (b) ask the builder to trim, chiefly the tests.

## Walkthrough

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |
| Format: file why, symbol lines, `uses`, two-space why | 1 | `scripts/check.mjs:57` | check.test.mjs (parseFilesBlock tests) |
| Plans: a task's own files fence | 1 | `scripts/check.mjs:113` | check.test.mjs (planMap fence tests) |
| Symbol checks against the real outline (`~ - >` missing, `+` exists) | 2 | `scripts/check.mjs:265` | check.test.mjs (symbol warnings, task order) |
| Real outline by tree-sitter, JS/TS, Rust, C#, Python | 2 | `scripts/outline.mjs:9`, `scripts/check.mjs:256` | check.test.mjs (outline fixtures) |
| No outline → warning, page still renders | 2 | `scripts/check.mjs:265` | check.test.mjs (offline / not outlined) |
| Relations graph, flat, over 12 files collapse | 3, 6 | `scripts/render.mjs:134` | render.test.mjs (overview tests) |
| Overview parse-checked | 3 | `scripts/render.mjs:527` | check.test.mjs (parseDiagrams on generated overviews) |
| See a file's change without scrolling (Files view) | 5 | `scripts/render.mjs:198` | render.test.mjs (mapHtml tests) |
| A graph node opens its file | 3, 5 | `scripts/render.mjs:483` | render.test.mjs (cardFor) |
| Page safety stays | 3, 5 | `scripts/render.mjs` clean()/strict | render.test.mjs (clean-pass, attributes) |
| Docs | 4 | `SKILL.md`, `steps/plan-shape.toml`, `docs/components/flows.md` | build:harnesses lint |

## Review

/review-code branch (72ea687..4f08129, lenses: correctness neutral, lean, tests, docs, security, risk; one verifier):
Verdict: 4 to fix before merge, 8 worth doing; 10 confirmed, 2 plausible, 1 half dropped. Security: no findings.
Audit: [docs/audits/2026-11-16-review-change-map.md](../../audits/2026-11-16-review-change-map.md). Picks 1-8, fixed
in 8531e02, fix check PASS for all 8. Checks: `npm test` at 8531e02 589 pass, 7 fail (pre-existing, measured on the
base 72ea687), 6 skipped; diagrams 72 tests, 69 pass, 3 skipped; build:harnesses exit 0; python and rust not run.

## Learned

- AGENTS.md (Checks): the diagrams checker's user cache is shared by every checkout; tests in a worktree with another
  `package.json`/`outline.mjs` reinstall it.
- Memory `ui-mockup-before-build`: show an interactive mockup with real data before planning a page (the built layout
  was rejected twice).
- Memory `preview-tool-limits`: html_preview can't draw Mermaid or vh pages; preview screenshots time out.
- Not kept: prettier rewriting indented lines under bullets (already in plan-shape.toml and SKILL.md).

## Run verdict

Worked as a whole: yes. Clean: no (the layout was redone twice, Tasks 5-6; Gate 1 reopened once).
