# Change Map Implementation Plan

<!-- glance -->
```
Plan: Change Map · 4 tasks · ~710 lines · 21 files
 1  [1 Parse symbols, whys and…]
 2  [2 Outline files with tree… ←1]
 3  [3 Draw the overview and t… ←2]
 4  [4 Document the format ←3]

#  does                                                          files  adds                            size
1  The checker reads the new lines in a files block and a plan…  2      entry fields `why`, `symbols:…  ~170
2  A new script, run from the checker's cache, lists each file…  12     `scripts/outline.mjs` exporti…  ~230
3  The page shows one overview graph per map and a collapsible…  4      exports `overviewMermaid(entr…  ~260
4  SKILL.md, the plan-shape step and the component docs tell a…  3      nothing new                     ~50
```
<!-- /glance -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the diagrams page's folder-tree file map with an overview graph (files, moves, relations) and one
card per file showing its real tree-sitter outline with the predicted change marked.

**Architecture:** `check.mjs` parses the extended change data (file why, symbol lines, `uses`, a plan task's own
`files` fence); a new `outline.mjs` runs from the checker's user cache with web-tree-sitter and returns each file's
symbols; `render.mjs` turns the change data into a Mermaid flowchart (parse-checked, drawn in the browser like every
other diagram) and Node-built HTML cards.

**Tech Stack:** Node ESM, `node:test`, web-tree-sitter 0.27.2 with tree-sitter-javascript 0.25.0,
tree-sitter-typescript 0.23.2, tree-sitter-rust 0.24.0, tree-sitter-c-sharp 0.23.5, tree-sitter-python 0.25.0
(measured 2026-11-16: each ships its `.wasm`; each loads in web-tree-sitter 0.27.2), Mermaid 12.3.0.

**Spec:** [spec.md](spec.md)

## Global Constraints

- Change data (files, symbols, moves, relations): resolved in `check.mjs` (`parseFilesBlock`, `planMap`); never seen
  by `outline.mjs` or the page script as markdown.
- Real outline and language by extension: resolved in `outline.mjs`, run from the cache folder; never seen by
  `check.mjs`'s parsing, `render.mjs`'s HTML builders or the page.
- Repo access: `render.mjs` / `check.mjs` (given `root`); the page never reads files.
- One implementation gets no interface; one caller gets no helper; no option nobody sets.
- Every existing `files` block and plan stays valid (warnings allowed, no new error); the old tree output goes away.
- Packages install only into the checker's existing cache folder, one `package.json` / `package-lock.json` for Mermaid,
  jsdom and the grammars (the user's pick: shared install); exact pins; lockfile regenerated with
  `npm install --package-lock-only --ignore-scripts`. The install runs only when the document has a Mermaid diagram (a
  generated overview counts, so rendering any map installs) or a mapped file whose extension has a grammar.
- No outline (no npm, offline, install or parse fails) is the warning `not outlined: <reason>`, never an error, and
  the page still renders.
- Page safety stays: Mermaid `securityLevel: 'strict'`; `clean()`'s attribute list unchanged (cards use `class` only);
  every author string is escaped into HTML and quoted into Mermaid labels (`"` as `#quot;`).
- Stack skill: none matches (Node scripts on an existing page).

## Test seams

- `node check.mjs <doc> --root <dir>` (`tests/check.test.mjs`'s `check()`): parse errors, warnings, exit codes as the
  user sees them; misses the page.
- `parseFilesBlock`, `planMap` (exported): the change-data shape; miss repo comparisons.
- `outlineFiles(paths, root)` (new export of `check.mjs`): real outlines per language from the cache; misses the page.
  Skips offline like the parser tests.
- `overviewMermaid(entries, prefix)`, `cardsHtml(entries, outlines, prefix)` (new exports of `render.mjs`): the
  generated Mermaid text and card HTML from hand-made entries and outlines; miss the drawn SVG.
- `node render.mjs <doc> <out>` / the produced page source (`tests/render.test.mjs`): the page's pure functions, as
  `safe`/`clean` are tested today, and one real Mermaid render for node ids (skips offline).

## Review Focus

- A `files` block or plan written before this change: renders, with "no symbols" warnings and no new error. Tests in
  Task 1.
- A plan whose Files bullets wrap onto indented continuation lines (7 existing plans): still a plan map, still checked.
  Test in Task 1.
- A file whose extension has no grammar (`.md`, `.toml`): the card shows its predicted symbols and "no outline for
  this file type". Test in Task 3.
- Offline/no npm: page renders cards from the author's symbols with the `not outlined` warning. Test in Task 2.
- Exported, decorated, namespaced and impl-block declarations, and overloads: all outlined, every overload marked.
  Test in Task 2.

---

### Task 1: Parse symbols, whys and relations

**Does:** The checker reads the new lines in a files block and a plan task's own files block, and reports bad
relations and `~` files without symbols.
**Depends on:** none
**Adds:** entry fields `why`, `symbols: [{ marker, name, why, to }]`, `uses: [path]` on `parseFilesBlock` and `planMap`
entries; warning "no symbols"; errors "uses names a path not in the block", "a task's files block names a path its
Files list doesn't"
**Size:** ~170

**Files:**

- Modify: `plugins/flows/skills/diagrams/scripts/check.mjs`
- Modify: `plugins/flows/skills/diagrams/tests/check.test.mjs`

**Interfaces:**

- Produces: `parseFilesBlock(text) -> Array<{ marker: '+'|'~'|'-'|'>', path, from?, why?, symbols: Array<{ marker,
  name, why?, to? }>, uses: string[] }>`; `planMap(markdown) -> Array<{ task, marker, path, why?, symbols, uses }>`.

Format: `extractBlocks` strips the opening fence's indent from the block's lines (a fence nested in a list). File
line: `<marker> <path>` then optionally two or more spaces and the why. Symbol line: indented deeper than the file
line above it, `<+|~|-> <name>` or `> <name> -> <path>`, then optionally two-plus spaces and the why. Unindented
`<a> uses <b>` adds `b` to `a`'s `uses`; both must be in the block (error otherwise). A symbol line before any file
line, or any other line, is `bad files line ...` as today.

Plans: a task's Files list stays paths (glance unchanged). The first ` ```files ` fence inside a task's section
supplies that task's whys, symbols and `uses`; each path in it must be in the task's Files list (error). `planMap`
finds it in the task's text, not through `t.lines` (glance drops fenced lines). A problem in a task's fence is reported
as its own problem; it never throws out of `planMap`, so the plan's path checks still run. `checkMarkdown` skips the
spec-style checks for a fence `planMap` already claims.

- [ ] **Step 1: Write the failing tests** in `tests/check.test.mjs`:
  `parseFilesBlock reads why, symbols, a symbol move and uses` (the spec's example block, full entry array);
  `a why needs two spaces, so a path with one space is still an error`; `a fence nested in a list keeps its file lines
  as files`; `a uses line naming a path not in the block is an error`; `a ~ file without symbols is a warning`;
  `an old paths-only block still passes`; `planMap takes a task's files fence`; `a task's fence naming a path outside
  its Files list is an error and the path checks still run`; `a Files bullet wrapped onto an indented line is still one
  entry` (wrapped bullet copied from `docs/features/web-mcp-search/plan.md`).
- [ ] **Step 2: Run** `node --test plugins/flows/skills/diagrams/tests/check.test.mjs` — the new tests FAIL.
- [ ] **Step 3: Implement** in `check.mjs`.
- [ ] **Step 4: Run** the same command — PASS; `npm test` green.

### Task 2: Outline files with tree-sitter

**Does:** A new script, run from the checker's cache, lists each file's functions, classes, methods and types with
their lines, and the checker warns on symbols the outline contradicts.
**Depends on:** Task 1
**Adds:** `scripts/outline.mjs` exporting `LANGS`; export `outlineFiles(paths, root)` in `check.mjs`; `checkMarkdown`
returns `{ problems, outlines }`; dependencies web-tree-sitter and five grammars; warnings "`<m> <file>: <symbol> not
found`", "`+ <file>: <symbol> already exists`", "not outlined: <reason>"; fixtures under `tests/fixtures/outline/`
**Size:** ~230

**Files:**

- Create: `plugins/flows/skills/diagrams/scripts/outline.mjs`
- Modify: `plugins/flows/skills/diagrams/scripts/check.mjs`
- Modify: `plugins/flows/skills/diagrams/scripts/render.mjs`
- Modify: `plugins/flows/skills/diagrams/package.json`
- Modify: `plugins/flows/skills/diagrams/package-lock.json`
- Create: `plugins/flows/skills/diagrams/tests/fixtures/outline/sample.ts`
- Create: `plugins/flows/skills/diagrams/tests/fixtures/outline/sample.rs`
- Create: `plugins/flows/skills/diagrams/tests/fixtures/outline/Sample.cs`
- Create: `plugins/flows/skills/diagrams/tests/fixtures/outline/sample.py`
- Modify: `plugins/flows/skills/diagrams/tests/check.test.mjs`
- Modify: `.github/dependabot.yml`
- Modify: `.github/skill-scanner.yaml`

**Interfaces:**

- Consumes: Task 1's entries.
- Produces: `outlineFiles(paths: string[], root: string) -> Promise<Map<path, Array<{ name, kind, line }> | null>>`
  (`null` = no grammar; rejects with a one-line reason); `checkMarkdown(markdown, root) -> Promise<{ problems,
  outlines: Map | null }>` (`null` when not outlined); `LANGS` (extension → grammar wasm path), importable without
  loading web-tree-sitter (import it inside the run).

outline.mjs reads a JSON array of absolute paths on stdin and prints `{ [path]: [...] | null }`, like parse.mjs;
`parserFolder()` copies it too (the stamp hash includes it). Grammar by extension: `.js .mjs .cjs .jsx` javascript,
`.ts .mts .cts` typescript, `.tsx` tsx, `.rs` rust, `.cs` c_sharp, `.py` python. The walk recurses through containers
(namespace, mod, class, struct, interface, trait, impl, record) and looks through wrappers (`export_statement`,
`decorated_definition`, TS `internal_module`); a member is named `Parent.member`, a Rust impl by its `type` field; a JS
`const f = () =>` or `= function` counts as a function. A symbol matches by full name or last segment; every match is
marked. Outlined: `~ - >` files (a `>` file by its `from`) that exist and have a grammar.

Plans: symbol checks walk tasks in order, as the path checks do (`check.mjs:216-224`): a symbol an earlier task adds
counts as present for later tasks. The CLI block (`check.mjs:244`) and `renderPage` read `.problems`.

Fixtures: write them, run `treefmt` on them, then write the line assertions. They hold an `export function`, an
`export const f = () =>`, a decorated Python def, a C# block-scoped namespace with two `Run` overloads, a Rust `impl`
and `mod tests`.

- [ ] **Step 1: Write the failing tests**: `outlineFiles lists the declarations of a TS, Rust, C# and Python file`
  (names, kinds, lines per fixture; `{ skip: NEEDS_PARSER }`); `a .md file has no outline (null)`; `a ~, - and >
  symbol missing from the outline is a warning`; `a + symbol already in the outline is a warning`; `an overloaded name
  marks every match`; `a symbol an earlier task adds is not reported missing in a later task`; `no npm gives
  "not outlined" and exit 0` (`isolated()`, `{ skip: WIN }` like its neighbours); `check.mjs on a doc with only a .md files block
  installs nothing`.
- [ ] **Step 2: Run** `node --test plugins/flows/skills/diagrams/tests/check.test.mjs` — FAIL.
- [ ] **Step 3: Add the pins**, regenerate the lockfile, implement `outline.mjs` and `outlineFiles`; update
  dependabot's comment (`.github/dependabot.yml:20`) and the scanner reason (`.github/skill-scanner.yaml:47-49`) to name
  the grammars and `outline.mjs`.
- [ ] **Step 4: Run** the diagrams tests — PASS; `npm run scan-skills` if `pipx` is present, else record it as not run.

### Task 3: Draw the overview and the file cards

**Does:** The page shows one overview graph per map and a collapsible card per file with its outline and the change
marked, and clicking a file in the graph opens its card.
**Depends on:** Task 2
**Adds:** exports `overviewMermaid(entries, prefix)`, `cardsHtml(entries, outlines, prefix)` in `render.mjs`; export
`parseDiagrams` in `check.mjs`; page function `cardFor(element)`; classes `card`, `c-<prefix>f<n>`, `same`
**Size:** ~260

**Files:**

- Modify: `plugins/flows/skills/diagrams/scripts/render.mjs`
- Modify: `plugins/flows/skills/diagrams/scripts/check.mjs`
- Modify: `plugins/flows/skills/diagrams/tests/render.test.mjs`
- Modify: `plugins/flows/skills/diagrams/tests/check.test.mjs`

**Interfaces:**

- Consumes: Task 1's entries, Task 2's `checkMarkdown -> { problems, outlines }`.

Overview (`overviewMermaid`): `flowchart LR`; node ids `<prefix>f<n>`, folder ids `<prefix>d<n>`, paths only in quoted
labels; `<prefix>` is `b<k>` for the k-th files block and `p` for the plan's map, so ids are unique on the page. Up to
12 files: a subgraph per folder (a chain with one child folds into one label, as `dirHtml` does), file nodes
`<marker> <name>` with symbol counts, `classDef add|mod|del|move` from `THEME`, `a --> b` for `uses`,
`old -.->|moved| new` for a `>` file, `a -.->|"<symbol>"| b` for a `>` symbol (`b` a grey node when not in the map).
Over 12 files: one flat node per folder that holds files, labelled with its counts, and the edges between folders
(deduplicated). Plan: one overview for the tasks' union; a file's marker is its net marker (`+` then `-` drops it,
`~` then `-` is `-`, `+` then `~` is `+`).

`check.mjs` exports `parseDiagrams` (unchanged otherwise). `renderPage`, after `checkMarkdown`, passes every
generated overview to it in one batch, without the 8-node and orphan rules; a failed parse refuses the page with an
error naming the block or `plan map`, and a parser that can't run is the existing `not parser-checked` warning. The
import direction stays `render.mjs` → `check.mjs`.

Card (`cardsHtml`): `<details class="card c-<id>">`, summary `<marker> <path>  <why>` (+ `Task 2, 3` in a plan);
body: the outline in file order, each row `line marker name why`, untouched rows class `same`; predicted `+` symbols
not in the outline follow, without a line; one symbol named by several tasks is one row with its net marker, by the file rule (`+` then `~` is `+`, `+` then `-`
drops the row, `-` then `+` is `~`);
a `null` outline shows the predicted symbols and "no outline for this file type"; `outlines === null` shows the
predicted symbols only.

Page: after Mermaid draws, a click inside an element matched by `closest('[id*="-flowchart-"]')` calls
`cardFor(element)`, which returns `c-<id>` from `-flowchart-(<id>)-` or `null`; the card opens and scrolls into view.
The id shape is Mermaid 12.3.0's internal `${diagramId}-flowchart-${id}-${counter}`: mark it with a `shortcut:`
comment (internal format, recheck on a Mermaid bump).

- [ ] **Step 1: Write the failing tests** (replace the tree tests at `render.test.mjs:53`, `:83-100`, `:146`, `:189`):
  `overviewMermaid draws a node per file with marker classes, uses and move edges`; `a symbol move to a path not in
  the map adds a grey node`; `over 12 files it draws one node per folder with counts`; `ids differ between two maps on
  one page`; `a plan's overview uses net markers`; `cardsHtml lists the outline in order, marks touched symbols and
  greys the rest`; `a file with no grammar says so`; `a symbol two tasks name is one row with its net marker (+ then ~ is +, + then - drops it, - then + is ~)`; `cardFor maps a node element id
  of Mermaid 12.3.0's shape to its card class, and anything else to null`; in `check.test.mjs` (the one file that may
  use the user's cache): `parseDiagrams accepts generated overviews of 3 and 13 files` (imports `overviewMermaid`,
  skips offline).
- [ ] **Step 2: Run** `node --test plugins/flows/skills/diagrams/tests/render.test.mjs plugins/flows/skills/diagrams/tests/check.test.mjs` — FAIL.
- [ ] **Step 3: Implement** in `render.mjs` and `check.mjs`.
- [ ] **Step 4: Run** the diagrams tests and `npm test` — PASS. Render `docs/features/change-map/spec.md` and compare
  with the mockup the user approved.

### Task 5: Show each map side by side

**Added:** 2026-11-16, after Task 3: the user found the stacked overview and cards unintuitive ("I have to scroll to
see the changes") and approved a side-by-side layout (mockup: scratchpad `change-map-mockup2.html`).
**Does:** Each map is one fixed-height panel: a file list on the left, the selected file's outline with the change on
the right, the overview graph in a Relations tab; nothing needs page scrolling to see a file's change.
**Depends on:** Task 3
**Adds:** export `mapHtml(entries, outlines, prefix)` in `render.mjs`, replacing `cardsHtml`; classes `cmap`, `bar`,
`tabs`, `tab`, `files`, `tree`, `dir`, `file`, `f-<prefix>f<n>`, `pane`, `on`, `relations`; the page's `cardFor`
keeps its name and returns the pane class `c-<id>`
**Size:** ~200

**Files:**

- Modify: `plugins/flows/skills/diagrams/scripts/render.mjs`
- Modify: `plugins/flows/skills/diagrams/tests/render.test.mjs`
- Modify: `plugins/flows/skills/diagrams/tests/check.test.mjs` (only if it imports `cardsHtml`)

**Interfaces:**

- Consumes: Task 3's `overviewMermaid`, `merge`, the row markup of `cardsHtml`.

`mapHtml(entries, outlines, prefix)` returns `<div class="cmap">` with:

- `bar`: the file totals by marker (`+1 new ~4 changed −0 removed`, zero kinds shown only for `−`), and `tabs`: two
  `<button type="button" class="tab">` Files and Relations.
- `files` (`display: grid`, left column `minmax(12rem, 34%)`, fixed height `min(70vh, 34rem)`, each column scrolls on
  its own): `tree` lists the files grouped under folder lines (`dir`, a chain with one child folded into one label),
  each file a `<button type="button" class="file f-<prefix>f<n>">` with its marker, name and per-marker symbol counts
  (and `Task 2, 3` in a plan); then one `<section class="pane c-<prefix>f<n>">` per file: path, `from`, why, the
  outline rows exactly as Task 3's cards, the no-outline note, and a `uses` line listing the files it uses and is used
  by as `<button type="button" class="file f-…">`. The first file's button and pane carry `on`.
- `relations`: Task 3's `<figure class="diagram overview">`, hidden until its tab is chosen.
- Under 560px wide the columns stack and the panel's height is automatic.

Markup keeps to `class` and `type` (the attributes `clean()` keeps; `clean()` is unchanged). The page script, not the
markup, sets `aria-selected`, `aria-pressed` and `hidden`: a click on a `.file` selects that file in its `.cmap`
(button and pane get `on`, the Files tab shows); ↑/↓ inside a `tree` moves the selection and focus; a tab click shows
its view; a click on an overview node shows Files and selects `cardFor(node)`'s pane. The overview draws while its
view is shown, then hides (Mermaid measures text in the document).

- [ ] **Step 1: Write the failing tests** (replace Task 3's card tests in `render.test.mjs`): `mapHtml lists every
  file in the tree with its marker and symbol counts, grouped by folder`; `mapHtml has one pane per file with the
  outline rows (touched marked, the rest same) and the first selected`; `a pane lists the files it uses and is used by`;
  `the bar counts files by marker`; `a plan's tree shows the tasks per file`; keep the net-marker, no-grammar and
  `cardFor` tests on the new markup; the clean-pass test checks the map survives `clean()` with its classes.
- [ ] **Step 2: Run** `node --test plugins/flows/skills/diagrams/tests/render.test.mjs` — FAIL.
- [ ] **Step 3: Implement** in `render.mjs` (markup, CSS, page script).
- [ ] **Step 4: Run** the diagrams tests and `npm test` — PASS. Render the scratchpad `demo.md` and compare with the
  mockup the user approved.

### Task 6: A flat Relations graph

**Added:** 2026-11-16, after Task 5: the user liked Files but not Relations (nested folder boxes) and picked a flat
graph.
**Does:** The Relations tab draws only the files that relate, as flat nodes with their folder as a caption, labelled
arrows, and the unrelated files listed under it; a node or a listed file opens in Files.
**Depends on:** Task 5
**Adds:** class `apart` (the unrelated files' line); nothing else
**Size:** ~120

**Files:**

- Modify: `plugins/flows/skills/diagrams/scripts/render.mjs`
- Modify: `plugins/flows/skills/diagrams/tests/render.test.mjs`
- Modify: `plugins/flows/skills/diagrams/tests/check.test.mjs` (only if the 3-file parse test's input changes)

**Interfaces:**

`overviewMermaid(entries, prefix)`, up to 12 files: no subgraphs. A node per file that has an edge (`uses`, a file
move, a symbol move), ids unchanged (`<prefix>f<n>`, `<prefix>x<n>` for a target outside the map); label line 1
`<marker> <name>`, line 2 `<parent folder>/` and the symbol counts (e.g. `scripts/ · +1 ~4`); every edge labelled
(`uses`, `moved`, the symbol name); `flowchart LR`; marker classes and page CSS colours as now; the caption line
muted if Mermaid's strict sanitizer keeps the markup for it, else plain (never loosen `securityLevel`). No file has an
edge: `overviewMermaid` returns `''` and the Relations view says "No relations between these files." Over 12 files:
unchanged (flat folder nodes).

`mapHtml`: under the graph, `<p class="apart">Not related: …</p>` lists each file without an edge as Task 5's
`<button type="button" class="file f-<prefix>f<n>">` (so it opens in Files); left out when every file relates.
`renderPage` parse-checks only non-empty overviews.

- [ ] **Step 1: Write the failing tests** (adapt Task 3's overview tests): `up to 12 files the overview has no
  subgraph and labels each node with its folder and counts`; `every edge carries a label`; `files without an edge
  are left out of the graph and listed as not related`; `with no relations there is no graph and the view says so`;
  over 12 files and the parse-check tests keep passing.
- [ ] **Step 2: Run** `node --test plugins/flows/skills/diagrams/tests/render.test.mjs` — FAIL.
- [ ] **Step 3: Implement** in `render.mjs`.
- [ ] **Step 4: Run** the diagrams tests — PASS. Render the scratchpad `demo.md`, open Relations in a browser tab and
  compare with the option the user picked (flat cards, caption, labelled arrows, unrelated files apart).

### Task 4: Document the format

**Does:** SKILL.md, the plan-shape step and the component docs tell authors how to write symbols, whys and relations
and what the page shows.
**Depends on:** Task 6
**Adds:** nothing new
**Size:** ~50

**Files:**

- Modify: `plugins/flows/skills/diagrams/SKILL.md`
- Modify: `plugins/flows/steps/plan-shape.toml`
- Modify: `docs/components/flows.md`

- [ ] **Step 1:** SKILL.md: the format (file why, symbol lines, `uses`, two-space rule), the plan task's own files
  fence, the outline cards, the `not outlined` warning, the first run fetching the grammars. `plan-shape.toml:21`: a
  task may add a `files` fence with its symbols below the plain-path Files list. `flows.md:40`: outline.mjs and the
  grammars in the cache.
- [ ] **Step 2: Run** `npm run build:harnesses` and `npm test` — PASS (lint keeps Claude-only words out of flows).
