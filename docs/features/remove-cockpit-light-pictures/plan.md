# Remove flow-cockpit, show a spec and its pictures as one page: Implementation Plan

<!-- glance -->
```
Plan: Remove flow-cockpit, show a spec and its pictures as one page: · 7 tasks · ~63330 lines · 20 files
 1  [1 The checker and its par…]
 2  [2 The renderer ←1]
 3  [3 The skill and the gate … ←2]
 4  [4 Check how the page looks ←3]
 5  [5 Remove the cockpit's wi… ←4]
 6  [6 Delete the cockpit's co… ←5]
 7  [7 Delete the cockpit's do… ←6]

#  does                                                          files  adds                            size
1  Reads a markdown file's `mermaid` and `files` blocks and re…  5      `extractBlocks`, `parseFilesB…  ~560
2  Turns a markdown file into one HTML page with the text, the…  1      `renderPage` and the CLI in `…  ~300
3  Tells Claude when to draw which pictures and makes every ga…  2      the full `SKILL.md`             ~180
4  Renders this run's own spec, looks at it in a real browser …  1      nothing new                     ~90
5  Takes the flow-cockpit plugin, its installer option and dow…  4      nothing new                     ~1700
6  Removes the two Rust crates and the web shell, and everythi…  4      nothing new                     ~55500
7  Removes the cockpit's ADRs, feature folders and glossary en…  3      nothing new                     ~5000
```
<!-- /glance -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `diagrams` skill that checks a spec's Mermaid diagrams and file map and renders the spec as one styled page, then delete the flow cockpit completely.

**Architecture:** The pictures come first: a checker that runs the full Mermaid parser from a small npm project kept in the user's cache, a renderer that draws one HTML page, the skill and gate wiring, and a look pass against a real screenshot. That way the result can be judged before the three deletion tasks run (wiring, code and build, docs).

**Tech Stack:** Node 26 (`node:test`), the full Mermaid parser (npm `mermaid` under `jsdom`, installed into the user's cache) for the checker, Mermaid and marked from a CDN for the page.

**Spec:** [spec.md](spec.md)

## Global Constraints

- The diagrams skill's table decides which pictures a task needs. The checker and the renderer never see that decision; they draw whatever blocks the markdown holds.
- `check.mjs` and its parse helper decide whether a picture is valid. The flow steps never see that decision; they only call the skill and read its exit code.
- `render.mjs` and its one theme decide how a page looks. The skill's drawing rules never see that decision.
- The gate step decides, in host-neutral words, where a page is shown (inline or a file path). `render.mjs` never sees that decision; it only writes a file. No tool slot is added to the harness compiler.
- Limits: at most 8 nodes per flowchart and 6 participants per sequence diagram, counted from Mermaid's own parse result; every other diagram type is parse-checked only. A `files` line is `+`, `~`, `-` or `> old-path -> new-path`, then the path.
- The parser is Mermaid itself: the npm packages `mermaid` (exact pin, `12.3.0` to start) and `jsdom` (exact pin, the root `package.json`'s version) in `plugins/flows/skills/diagrams/package.json` with `package-lock.json`. The user chose this over the 7-type Python parser (`mermaid-syntax-parser`, measured to reject pie, erDiagram, gitGraph, mindmap, quadrantChart and xychart-beta) knowing it brings npm packages (about 149 MB and 118 packages, measured in a scratch install).
- The packages never land in the plugin folder. `check.mjs` copies `package.json`, `package-lock.json` and `parse.mjs` into a folder in the user's cache (`LOCALAPPDATA` on Windows, else `XDG_CACHE_HOME` or `~/.cache`, then `dead-agent-skills/diagrams-node`), runs `npm ci --ignore-scripts` there when a stamp file (the hash of those three files) is missing or different, and runs `node parse.mjs` from that folder, so its imports resolve there. The plugin folder has no `node_modules`.
- `parse.mjs` reads a JSON array of diagram strings on stdin and prints a JSON array on stdout, one object per diagram: `{ ok, type, error?, nodes?, edges?, orphans?, participants? }`. It runs `mermaid.parse` under jsdom and, for flowcharts and sequence diagrams, takes the counts from `getDiagramFromText(...).db` (`getVertices()`, `getEdges()`, `getActors()`), so the limits are exact and not guessed from the text. It needs no frontmatter stripping: Mermaid reads `config: layout: elk` itself. Its stdout carries only the JSON.
- `npm` is run the way the repository's other scripts run it; take care on Windows, where `npm.cmd` cannot be spawned without a shell. The first run downloads the packages (timeout 300 s); a parse run has a 60 s timeout.
- When the parser step fails for any reason (no npm, `npm ci` fails or times out, node exits non-zero, output that is not the expected JSON), the checker prints one warning, `not parser-checked: <reason>` with the first line of the error, and goes on; its exit code then comes from its other checks. Tests that need the parser skip when the cache install cannot be made (offline).
- No installer change and no uv: the flows plugin needs only Node and npm, which a Claude Code or Codex user already has.
- A **Files** line in a plan is `- Create|Modify|Delete:` then items separated by `, ` outside parentheses; each item is one backticked path, optionally followed by a parenthetical note. Backticked text inside a note is not a path. `glance.mjs`'s `parse` is the only parser of this rule.
- The page's Mermaid and marked versions are constants in `render.mjs` (Mermaid `12.3.0`, marked `18.1.3`, both from `cdn.jsdelivr.net/npm/`). They are bumped by hand, because Dependabot cannot read them. Node 26 or later; exact pins, no ranges.
- Don't add an interface with only one implementation, a helper with only one caller, or an option nobody sets.
- Build in a fresh worktree cut from `origin/main`: the main checkout's index holds another run's staged files, and a plain `git commit` would take them. Stage only the task's own paths. Before each commit, run the formatter on the task's new and edited files (`nix fmt <paths>` when nix is present; it is the pre-commit hook's check) and re-run the task's tests. Commit messages are one sentence, with no co-author lines.
- Stack: the page and its theme are a new web page, so they load hallmark (`hallmark`); the deletion tasks load no stack skill.

## Review Focus

- A markdown file with no fenced blocks: the checker exits 0 and the page is just the text.
- A diagram with YAML frontmatter, and one that starts with a blank line: both parse.
- Mermaid text or markdown containing HTML or `</script>`: the page escapes it and Mermaid runs at its strict security level.
- A fenced `mermaid` block nested inside a longer fence (a spec quoting a block): not extracted as a real diagram.
- A plan task whose **Files** line has no backticked path, or a path with a trailing parenthetical note: the map shows only the real paths.

## Test seams

- `node check.mjs <doc.md> [--root <dir>]`: exit code and printed lines. Catches syntax errors (when the parser can be installed), size limits, orphan nodes, wrong file-map paths, a parser that could not be installed. Misses how a diagram looks.
- `node render.mjs <doc.md> <out.html>`: exit code, the file it writes and its content. Catches refusal on a failing check, embedded blocks, the folder tree, the plan's file map, escaping. Misses how the page looks in a browser (Task 4 checks that by screenshot).
- The repository's own checks (`npm test`, `cargo check --workspace`, `git grep`): catch what a deletion left behind.

---

### Task 1: The checker and its parser helper

**Does:** Reads a markdown file's `mermaid` and `files` blocks and reports every problem in them, so a broken picture never reaches the user.
**Depends on:** none
**Adds:** `extractBlocks`, `parseFilesBlock`, `checkMarkdown`, `planMap`, `findNpm` and the CLI in `check.mjs`; `parse.mjs`; `package.json`, `package-lock.json`; each task's files with their verb from `glance.mjs`'s `parse`; a stub `SKILL.md`
**Size:** ~560

**Files:**
- Create: `plugins/flows/skills/diagrams/scripts/check.mjs`, `plugins/flows/skills/diagrams/scripts/parse.mjs`, `plugins/flows/skills/diagrams/package.json`, `plugins/flows/skills/diagrams/package-lock.json`
- Create: `plugins/flows/skills/diagrams/SKILL.md` (a stub: frontmatter with `name: diagrams` and a description, one body line; Task 3 writes it in full, and the stub keeps this commit passing `check-repo`, which refuses a skill folder with no `SKILL.md`)
- Create: `plugins/flows/skills/diagrams/tests/check.test.mjs`, `plugins/flows/skills/diagrams/tests/fixtures/api-mcp-diagrams.md`
- Modify: `plugins/flows/skills/build-feature/scripts/glance.mjs`, `plugins/flows/skills/build-feature/tests/glance.test.mjs`
- Modify: `package.json` (add `plugins/flows/skills/diagrams/tests/*.test.mjs` to the `test` script), `.github/dependabot.yml` (an `npm` entry for `/plugins/flows/skills/diagrams`)

**Interfaces:**
- Consumes: nothing.
- Produces: `extractBlocks(markdown: string): { kind: 'mermaid' | 'files'; text: string; line: number }[]` (a fence nested in a longer fence is skipped); `parseFilesBlock(text: string): { marker: '+' | '~' | '-' | '>'; path: string; from?: string }[]` (a malformed line, a backslash path or a path with spaces throws with the line's text); `checkMarkdown(markdown: string, root: string): Promise<{ level: 'error' | 'warning'; block: number; message: string }[]>`; the CLI `node check.mjs <doc.md> [--root <dir>]` (one line per problem, exit 1 when any is an error). `parse.mjs` is the helper described in Global Constraints. `glance.mjs` exports `parse`, which keeps its `files` count and gains `entries: { verb: 'Create' | 'Modify' | 'Delete'; path: string }[]` per task, by the Files-line rule in Global Constraints; `parse` stays lenient and never throws on a Files line.
- `check.mjs` also exports `planMap(markdown: string): { task: string; marker: '+' | '~' | '-'; path: string }[]`, built on `parse`; Task 2 draws its file map from it. If `parse` throws (for example, on a task with no `**Depends on:**`), or a `Create`, `Modify` or `Delete` item has no backticked path, the checker prints `no plan map: <reason>` as a warning and the page has no map.
- Plan map rule (in `checkMarkdown`, for a document with `### Task` headings): the map lists each task's `entries` as `+`, `~`, `-`. The checker walks the tasks in order and reports errors: a `Modify` or `Delete` path must exist under `root` or be created by an earlier task. A `Create` path that already exists under `root` is only a warning, because a plan can be re-checked mid-build.

- [ ] **Step 1: Copy the fixtures.** Copy `docs/features/remove-cockpit-light-pictures/fixtures/api-mcp-diagrams.md` to `tests/fixtures/api-mcp-diagrams.md` (three flowcharts with frontmatter, one sequence).
- [ ] **Step 2: Write the failing tests** in `check.test.mjs`, running `check.mjs` as a child process on temp markdown files. Tests that need the parser are skipped when the cache install cannot be made (the first test that needs it installs it once):
  - `passes the four api-mcp diagrams`: exit 0, no error lines.
  - `fails a flowchart node named call`, `fails a syntax error`: exit 1 with the block number and Mermaid's message.
  - `fails a ninth node`, `fails a node with no edge`, `fails seven participants in a sequence`: exit 1 each, from the parse helper's counts.
  - `parse-checks other diagram types`: a 12-slice `pie` block, an `erDiagram` block and a `mindmap` block each exit 0; a broken `erDiagram` exits 1.
  - `a parser that cannot be installed is a warning`: `npm` replaced by a fake on `PATH` that exits 1, and one that is missing, gives `not parser-checked` and exit 0 (the cache folder pointed at an empty temp folder through `XDG_CACHE_HOME` and `LOCALAPPDATA`).
  - `a helper that prints text that is not JSON is a warning too`.
  - `works from another working directory`: spawn the checker with `cwd` set to a temp folder, not the repository.
  - `leaves no node_modules in the skill folder`: after a parser run, `plugins/flows/skills/diagrams/node_modules` does not exist.
  - `files block: a missing ~ path is a warning for a hand-written block`; `a plan's generated map makes it an error` (a document with `### Task` headings whose **Files** line names a missing `Modify` path exits 1); `a Modify of a file an earlier task creates passes`; `a trailing (note), a comma inside a note and a code span inside a note are not paths`; `a Files item with no backticked path gives "no plan map"`.
  - `files block: a + path that exists, a malformed line and a backslash path` are each reported.
  - `a document with no blocks exits 0`.
  In `glance.test.mjs`: `parse keeps each file with its verb`.
- [ ] **Step 3: Run `node --test plugins/flows/skills/diagrams/tests/check.test.mjs`.** Expected: FAIL (modules missing).
- [ ] **Step 4: Write the helper and its project.** `package.json` (private, `"type": "module"`, exact pins for `mermaid` and `jsdom`) and `npm install --package-lock-only --ignore-scripts` for the lock file (this builds no `node_modules` in the skill folder). `parse.mjs` per Global Constraints. Write the stub `SKILL.md`.
- [ ] **Step 5: Implement `check.mjs`** per the Interfaces and Global Constraints: the fence scanner, the cache install with its stamp, the helper call (`execFile`, fixed arguments, the 300 s install and 60 s parse timeouts), the limits from the helper's counts, and the `files` path checks against `root` (default: the current directory). Export `parse` from `glance.mjs`, add `entries` to it, and build a plan's map from it.
- [ ] **Step 6: Run the tests, then `npm test` and `node tools/harness-compiler/src/cli.ts lint`.** Expected: PASS.
- [ ] **Step 7: Commit.** `git add -- plugins/flows/skills/diagrams plugins/flows/skills/build-feature package.json .github/dependabot.yml` then `git commit -m "Add the diagrams checker for Mermaid blocks and file maps."`

### Task 2: The renderer

**Does:** Turns a markdown file into one HTML page with the text, the diagrams and the file tree inline, and refuses to when the checker finds an error.
**Depends on:** Task 1
**Adds:** `renderPage` and the CLI in `render.mjs`
**Size:** ~300

**Files:**
- Create: `plugins/flows/skills/diagrams/scripts/render.mjs`, `plugins/flows/skills/diagrams/tests/render.test.mjs`

**Interfaces:**
- Consumes: Task 1's `extractBlocks`, `parseFilesBlock`, `checkMarkdown` and `planMap`.
- Produces: `renderPage(markdown: string, root: string): Promise<string>`; the CLI `node render.mjs <doc.md> <out.html>` (exit 1 with the checker's lines and no file written on an error).

- [ ] **Step 1: Write the failing tests.** `render.test.mjs`, through the CLI: `writes one page that holds every block's text`, `draws the folder tree in Node with markers and per-folder counts, unchanged folders collapsed, <details> to collapse`, `refuses and writes nothing when the check fails`, `a plan gets a file map from its Files lists`, `a task without Files shows no map lines`, `escapes HTML and </script> in the markdown`, `Mermaid runs at the strict security level`, `ELK is set once for the page`, `the page links no web font and no stylesheet`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `render.mjs` builds the page template: the markdown as escaped JSON, an inline module that runs `marked` and Mermaid from the CDN constants (Mermaid 12.3.0 with ELK, which v12 bundles; marked 18.1.3; strict security level), a first theme on a system font stack, and the folder tree HTML built in Node.
- [ ] **Step 4: Run the tests, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit.** `git add -- plugins/flows/skills/diagrams` then `git commit -m "Add the diagrams renderer that writes a spec and its pictures as one page."`

### Task 3: The skill and the gate wiring

**Does:** Tells Claude when to draw which pictures and makes every gate that shows a spec or plan run the checker and show the rendered page.
**Depends on:** Task 2
**Adds:** the full `SKILL.md`
**Size:** ~180

**Files:**
- Modify: `plugins/flows/skills/diagrams/SKILL.md` (replaces Task 1's stub)
- Modify: `plugins/flows/steps/gate.toml`, `plugins/flows/README.md`, `plugins/flows/plugin.json` (only if `flows-uses.mjs` rewrites it), `AGENTS.md`, `.github/skill-scanner.yaml`

**Interfaces:**
- Consumes: Tasks 1 and 2's CLIs.
- Produces: a skill the gate step names by path, `<flow-root>/skills/diagrams/SKILL.md`.

- [ ] **Step 1: Write `SKILL.md`.** Frontmatter `name: diagrams` and a description that says when to load it (a spec or plan about to go to a gate). Body: the task-to-pictures table from the spec; the two block kinds and their limits; the rule that a small change gets no pictures and the page says so; the rule to draw from the code and mark inferred parts. Then the steps: run `node "<flow-root>/skills/diagrams/scripts/check.mjs" "<doc>"` until it exits 0, then `node "<flow-root>/skills/diagrams/scripts/render.mjs" "<doc>" "<scratchpad>/<name>.html"`, then show the page inline if the host has a tool that renders an HTML page in the conversation, and otherwise print the file's path. A `not parser-checked` warning is passed on to the user with the gate summary. For a document the run may not edit (a given plan, flow.md), a failing check is shown to the user as text beside the summary instead of a page, and the document is left as it is. The text names no host's folder.
- [ ] **Step 2: Add a bullet to `gate.toml`** and `uses = ["flows:diagrams"]`: "Before a gate shows a spec or a plan, read `<flow-root>/skills/diagrams/SKILL.md` and follow it; the gate shows the page it produces beside the usual summary. Render after the copyedit. A spec or plan the run was given, and flow.md, are rendered but never edited." Keep it host-neutral.
- [ ] **Step 3: Rewrite the generated pieces.** Run `node scripts/flows-uses.mjs` (flows README tree and `plugin.json`), then `npm run build:harnesses` and read its printed size estimates against the 4,500 budget. Add one table row to the flows README and one `AGENTS.md` line, including that the page's CDN versions are constants in `render.mjs`, bumped by hand, and update `AGENTS.md`'s Dependabot sentence that names "the headroom-trim `uv.lock`" to also name the diagrams skill's `package-lock.json`.
- [ ] **Step 4: Run the scanner.** `uvx --from cisco-ai-skill-scanner==2.3.2 skill-scanner scan-all plugins --recursive --policy .github/skill-scanner.yaml --fail-on-severity high`, and the same for `.claude-plugin/flows/skills` (the composed copy that `npm run scan-skills` also scans). If it flags the new skill's `child_process` use, spawn npm and node with `execFile` and fixed arguments, and add a scoped suppression with its reason to `.github/skill-scanner.yaml` only if it still fires.
- [ ] **Step 5: Run the checks.** `npm test`, `npm run typecheck`, `node tools/harness-compiler/src/cli.ts lint`. Expected: pass.
- [ ] **Step 6: Commit.** `git add -- plugins/flows AGENTS.md .github/skill-scanner.yaml` then `git commit -m "Add the diagrams skill and call it from every flow gate that shows a spec or plan."`

### Task 4: Check how the page looks

**Does:** Renders this run's own spec, looks at it in a real browser and tunes the theme until it reads well, so the "on point" requirement is checked by eye and not assumed.
**Depends on:** Task 3
**Adds:** nothing new
**Size:** ~90

**Files:**
- Modify: `plugins/flows/skills/diagrams/scripts/render.mjs`

**Interfaces:**
- Consumes: the finished CLIs.
- Produces: a theme the user judges at the final review.

- [ ] **Step 1: Check the spec's file map against the base.** `git worktree add <scratchpad>/base <the commit this branch was cut from>` and run `node plugins/flows/skills/diagrams/scripts/check.mjs docs/features/remove-cockpit-light-pictures/spec.md --root <scratchpad>/base`. Expected: no errors and no warnings. Remove the worktree.
- [ ] **Step 2: Render the spec** with `render.mjs` into the scratchpad and serve that folder with `python3 -m http.server <port> --directory <scratchpad folder>` (background), then open `http://localhost:<port>/<name>.html`. Stop the server afterwards.
- [ ] **Step 3: Screenshot it** through the web-mcp browser tool, taking the screenshot before any scroll (a scroll has dropped the tab to `about:blank` here). Look for clipped edge labels, small type, grey-on-grey, a diagram wider than the page and a file tree that is hard to scan. The file map and the flow diagram are the two cases to read.
- [ ] **Step 4: Tune the theme in `render.mjs`**: type size, the palette for new, kept and existing, the edge-label background, the width limit and the tree spacing. Keep a system font stack and no external font or stylesheet link (a Google Fonts link reloads the headless browser here). Re-render and screenshot until those faults are gone. Two rounds at most before showing the user.
- [ ] **Step 5: Run `npm test`.** Expected: pass.
- [ ] **Step 6: Commit.** `git add -- plugins/flows/skills/diagrams/scripts/render.mjs` then `git commit -m "Tune the diagrams page theme against a real screenshot."`

### Task 5: Remove the cockpit's wiring from the installer, catalog and checks

**Does:** Takes the flow-cockpit plugin, its installer option and download, and the cockpit-only guard text out, so nothing user-facing offers it.
**Depends on:** Task 4
**Adds:** nothing new
**Size:** ~1700

**Files:**
- Delete: `plugins/opt-in/flow-cockpit/` (hooks, `views` skill, README, plugin.json)
- Modify: `plugins/catalog.json`, `package.json` (the cockpit hook tests in the `test` script only)
- Modify: `tools/installer/install.ts`, `tools/installer/core/binaries.ts`, `tools/installer/core/binaries.test.ts`, `tools/installer/core/options.ts`, `tools/installer/core/options.test.ts`, `tools/installer/core/plugins.test.ts`, `tools/installer/steps/binaries.ts`, `tools/installer/steps/binaries.test.ts`, `tools/installer/system/net.ts`, `tools/installer/system/net.test.ts`
- Modify: `scripts/flows-uses.mjs`, `scripts/flows-uses.test.mjs`, `scripts/check-repo.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: an installer whose plugin and binary lists no longer contain `flow-cockpit`.

- [ ] **Step 1: Find every reference.** `git grep -n -i cockpit -- plugins/catalog.json package.json tools/installer scripts/flows-uses.mjs scripts/flows-uses.test.mjs scripts/check-repo.mjs` and keep the list.
- [ ] **Step 2: Write the failing test.** In `tools/installer/core/plugins.test.ts`: `a flow-cockpit install is retired once the real catalog no longer lists it`. Build the managed set from `plugins/catalog.json` (through `bundleIds`/`optIns`, as the neighbouring tests do) and assert `retiredPlugins` returns the installed `flow-cockpit` id. Run it; expected FAIL until the catalog entry is gone. (A test that hands `retiredPlugins` its own lists cannot fail, because the function only compares them.)
- [ ] **Step 3: Delete and edit.** Delete `plugins/opt-in/flow-cockpit/`; remove the cockpit's entries, constants and cases in the files above; update counts in tests. Remove the `folder`, `linuxHint` and `targets` machinery that only the cockpit used (`core/binaries.ts`, `steps/binaries.ts`, `system/net.ts`) together with its tests. In `flows-uses.mjs` rename `checkTemplates` to `checkShapes` (the test file and the `check-repo.mjs` call follow), reword its comment to "the shapes glance and the gates rely on", and keep every check it makes (`now:` after `phase:`, the gate line, `Picked:`, `Status: open`, `Status: decided`, `Waiting for you`, `**Does:**`, `**Depends on:**`, `Picks:`, `Fixed <date>`): conductors and glance still read them. Update its tests and the `check-repo.mjs` call to the new name. The new `retiredPlugins` test reads the generated marketplace like its neighbours, so run `npm run build:harnesses` before and after the catalog edit.
- [ ] **Step 4: Note the leftovers.** Write `~/.claude/bin/flow-cockpit/`, `~/.local/state/flow-cockpit/capture/` and `~/.config/flow-cockpit/` into flow.md **Parking lot** for the final report. The report also says whether the installer already removes a retired plugin's data: this plan did not check, so `git grep` the installer's retire and clean code once and report what it finds.
- [ ] **Step 5: Run the checks.** `npm test` and `npm run typecheck`, and the installer coverage gate inside `npm test` (79 percent). Expected: pass; `git grep -n -i cockpit -- plugins/catalog.json package.json tools/installer scripts/flows-uses.mjs scripts/flows-uses.test.mjs scripts/check-repo.mjs` prints nothing.
- [ ] **Step 6: Commit.** `git add -u -- plugins/catalog.json package.json tools/installer scripts/flows-uses.mjs scripts/flows-uses.test.mjs scripts/check-repo.mjs plugins/opt-in/flow-cockpit` then `git commit -m "Remove the flow-cockpit plugin and its installer wiring."`

### Task 6: Delete the cockpit's code and its build, CI and release wiring

**Does:** Removes the two Rust crates and the web shell, and everything that built, tested, released or listed them as a workspace member.
**Depends on:** Task 5
**Adds:** nothing new
**Size:** ~55500

**Files:**
- Delete: `tools/flow-cockpit/`
- Modify: `Cargo.toml`, `Cargo.lock`, `flake.nix`, `treefmt.toml`, `.gitattributes`, `.gitignore`
- Modify: `.github/workflows/crates.yml`, `.github/workflows/crates-build.yml`, `.github/workflows/release.yml`
- Modify: `scripts/ci-changes.mjs`, `scripts/ci-changes.test.mjs`, `scripts/release.test.mjs`, `scripts/repo-facts.test.mjs`, `scripts/repo-scripts.test.mjs`

**Interfaces:**
- Consumes: Task 5's removal of the installer download.
- Produces: a workspace of `web-mcp`, `ado-mcp` and the other tools only.

- [ ] **Step 1: Remove the workspace entries and the code.** In `Cargo.toml` drop the two `tools/flow-cockpit/*` members, the `flow-cockpit-core` dependency line and the `[workspace.dependencies]` only the cockpit used: `tauri`, `tauri-build`, `portable-pty`, `ts-rs`, `include_dir`, `uuid`, `toml` and the seven `oxc_*` crates (a grep of `tools/web-mcp/Cargo.toml` and `tools/ado-mcp/Cargo.toml` found none of them; re-run it before deleting). Delete `tools/flow-cockpit/`. In the five scripts remove the cockpit from the crate list and fixtures in the same commit, because they read the `Cargo.toml` members.
- [ ] **Step 2: Remove the Nix and format wiring.** In `flake.nix` drop the `flow-cockpit` package, `cockpitApp`, the path filters that name it, and the dev-shell GTK and WebKit libraries only it needed (check each against the remaining packages first). Edit `treefmt.toml`, `.gitattributes` and `.gitignore` the same way.
- [ ] **Step 3: Remove the CI wiring.** In the three workflows drop the cockpit matrix rows, steps (frontend tests, `tsc`, the nix package check, the Windows zip with extensions) and release notes.
- [ ] **Step 4: Refresh the lockfile and run the checks.** `cargo check --workspace` (rewrites `Cargo.lock`), `cargo clippy --workspace --all-targets --locked -- -D warnings`, `nix flake check --no-build`, then `npm test`. Expected: all pass; `git grep -il cockpit -- Cargo.toml Cargo.lock flake.nix treefmt.toml .gitattributes .gitignore .github scripts` prints nothing.
- [ ] **Step 5: Commit.** `git add -u -- tools/flow-cockpit Cargo.toml Cargo.lock flake.nix treefmt.toml .gitattributes .gitignore .github scripts` then `git commit -m "Delete the flow-cockpit crates and their build and release wiring."`

### Task 7: Delete the cockpit's docs and reword what the flows say about it

**Does:** Removes the cockpit's ADRs, feature folders and glossary entries, and edits the flows and prose that still name it.
**Depends on:** Task 6
**Adds:** nothing new
**Size:** ~5000

**Files:**
- Delete: `docs/adr/0005-flow-cockpit-outside-claude-code.md`, `docs/adr/0007-flow-cockpit-hosts-claude-sessions.md`, `docs/features/flow-observability/`, `docs/features/cockpit-harness/`
- Modify: `README.md`, `AGENTS.md`, `GLOSSARY.md`, `THIRD_PARTY.md`
- Modify: `plugins/flows/steps/state.toml`, `plugins/flows/skills/build-feature/scripts/glance.mjs`, `plugins/flows/skills/build-feature/tests/glance.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `state.toml` without the cockpit clause (Task 3 added the pointer to the diagrams skill in `gate.toml`).

- [ ] **Step 1: Delete the four records.**
- [ ] **Step 2: Edit the glossary.** Remove the **Flow cockpit** section's cockpit-only terms (Flow cockpit, Hosted session, Capture, View, Run bar, Extension, Default extension, Trusted repository). Keep **Flow run**, **Audit**, **Claude session** and **Loose session** only if a remaining doc or flow uses them; `git grep` each before deleting. Remove the "cockpit" mention in the first entry's _Avoid_ list.
- [ ] **Step 3: Edit `AGENTS.md`, `README.md`, `THIRD_PARTY.md`.** Remove each cockpit paragraph, list entry and vendored-JS note (`AGENTS.md` has 22 hits: the cockpit bullet, the Windows zip, the Nix package, the vendored JS, the CI and Dependabot lines, the workspace crate list).
- [ ] **Step 4: Edit the flows.** In `state.toml` change three places: reword line 5 ("gives the flow cockpit an unknown phase"), reword the `Waiting for you` sentence at line 12 so it no longer says the cockpit reads it, and delete the "the user reads specs, plans and flow.md in the flow cockpit" bullet at line 15. Leave `AGENTS.md` lines that cite "ADR 0005/0007" alone when they mean the other ADRs of those numbers. In `glance.mjs` reword every mention of the cockpit's `plan.rs` (the header at lines 4-6 and the comments at lines 55, 72 and 97) to say the rules are this script's own; in `glance.test.mjs` reword the three mentions (lines 42, 57 and 233). The older records under `docs/features/` (`flows-rework` and the like) and `docs/audits/` stay as history, code-span mentions of the cockpit included.
- [ ] **Step 5: Run the checks.** `npm run build:harnesses`, `npm test`. Expected: pass. `git grep -il cockpit` prints only `docs/audits/` files, older `docs/features/` records and this run's folder; `git grep -n "plan\.rs" -- plugins` prints nothing.
- [ ] **Step 6: Commit.** `git add -u -- docs README.md AGENTS.md GLOSSARY.md THIRD_PARTY.md plugins/flows` then `git commit -m "Remove the cockpit's ADRs, feature folders and glossary entries and the flow text that named it."`
