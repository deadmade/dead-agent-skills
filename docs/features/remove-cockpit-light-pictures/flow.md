---
flow: feature
phase: done
now: Done: pull request #133 is open against main (https://github.com/deadmade/dead-agent-skills/pull/133).
---

# Remove flow-cockpit, show plans as pictures the light way: flow

## Request

> Lets build/refactor our approch. Remove flow-cockpit completly. and go with a miuch lighter approch

Context from the conversation before the run: the cockpit's two jobs were hosting Claude sessions (T3 Code now does that
better) and rendering flow runs and Mermaid diagrams. What the user still misses is seeing a visual interpretation of
what will be built before it is built (architecture, several small views, not one big picture). Claude's Mermaid output
often has syntax errors (the reserved node id `call` broke a diagram), and looking at renders costs many tokens. A test
on `api-mcp` showed four small ELK-laid Mermaid diagrams read well once a local parse check
(`mermaid.parse` under jsdom) had caught the syntax error. The wish: a skill or tool that decides whether a picture
makes sense, drafts it, runs every cheap check and shows it.

## Artifacts

- Prior art: [prior-art.md](prior-art.md)

- Spec: [spec.md](spec.md) (written 2026-11-08, builder check pending)
- Plan: [plan.md](plan.md) (7 tasks, written 2026-11-08)
- ADRs:
- Glossary:

## Gates

- Gate 1, spec approved: 2026-11-08, "Approve, and render the plan too" (copyedit refused: it dropped two inline code spans
  holding triple backticks; the spec was shown unedited). The plan rendering was folded into the spec after approval:
  Out list and Risks edited, and the renderer section gained the plan file map. Reopened 2026-11-08: the parser changed
  from the Python `mermaid-syntax-parser` through uv to full Mermaid via npm (checker section, Risks, scope and file map
  edited), because the build measured the Python parser to reject valid diagram types; approved again: 2026-11-08, "Approve, resume Task 1".
- Gate 2, plan approved: 2026-11-08, execution: subagent-driven (copyedited; three calls of mine named at the gate: uv installed for flows, scoped lint exception for `check.mjs`, `flows-rework/plan.md` left alone). Reopened 2026-11-08: Tasks 1 and 3 and the Global Constraints revised for the npm parser (no uv, no installer change, no lint exception, `parse.mjs` and `package.json` replace the Python helper); approved again: 2026-11-08, "Approve, resume Task 1".
- Gate 3, review-code report: 2026-11-09, `Picks: 1, 8` (copyedited)

## Skipped

- Gate 1 copyedit of the spec: refused by `compare.mjs` (it dropped two inline code spans holding triple backticks), so the spec was shown unedited. Shown to the user at Gate 1, who approved it. Accepted 2026-11-09.
- `nix flake check --no-build`: fails in the pre-commit derivation on this machine, on the parent commit too (measured by a reviewer); the packages and dev shell evaluate with `nix eval`, and `cargo check`, clippy `--locked` and `npm test` pass. Accepted 2026-11-09.
- Done means 4: a real Gate 1 in T3 showing the page was not run; the page was screenshotted in a browser and the gate wiring composed into every gate (measured), but no real gate used it. Accepted 2026-11-09.
- Done means 5: a fresh installer run was not done; the installer's tests (208) pass. Accepted 2026-11-09.

## Grounding

Verified against source (git grep, file reads, 2026-11-08). The cockpit is wired into much more than its own folders:

- **Own folders:** `tools/flow-cockpit/` (core, app, bindings, extensions, vendored JS, fixtures; ~13k lines Rust, ~5k
  TS), `plugins/opt-in/flow-cockpit/` (capture hooks, `views` skill, README), ADRs 0005 and 0007, the feature docs
  `docs/features/flow-observability/` and `docs/features/cockpit-harness/`.
- **Workspace and build:** `Cargo.toml` (two members plus the `flow-cockpit-core` dependency), `Cargo.lock`, `flake.nix`
  (19 hits: a `flow-cockpit` package, path filters, dev-shell GTK/WebKit libraries), `treefmt.toml`, `.gitattributes`,
  `.gitignore`.
- **CI:** `crates.yml` (10 hits: frontend tests, nix package check), `crates-build.yml` (9: Windows zip with
  extensions), `release.yml` (3).
- **Installer:** `tools/installer/` (`core/binaries.ts` and tests, `core/options.ts`, `steps/binaries.ts`, `install.ts`
  line 290, plus three tests): it downloads the Windows zip and sets the plugin's `appPath`. Users who installed it
  have a folder `~/.claude/bin/flow-cockpit/` the installer replaces whole on update.
- **Catalog and docs:** `plugins/catalog.json`, `README.md`, `AGENTS.md` (22 hits), `GLOSSARY.md` (11), `THIRD_PARTY.md`.
- **Scripts and tests:** `scripts/ci-changes.mjs` (+test), `scripts/flows-uses.mjs`, `scripts/release.test.mjs`,
  `scripts/repo-facts.test.mjs`, `scripts/repo-scripts.test.mjs`, root `package.json` test line (the cockpit hook tests).
- **Flows touching the cockpit:** `plugins/flows/steps/state.toml:5,11-15` (a `Waiting for you` prefix "which is what
  the flow cockpit reads", and "the user reads specs, plans and flow.md in the flow cockpit, which draws Mermaid"),
  `plugins/flows/skills/build-feature/scripts/glance.mjs:4` (its field parsing mirrors the cockpit's `plan.rs`; the
  parity is a comment, the script and its tests stand alone).
- **Historical, not live:** `docs/audits/*` mention it (records of past reviews); the flake and the cockpit's
  fixtures contain copies of flow.md files.
- **Already present and relevant:** `plugins/opt-in/md-pane` (click a `.md` path in Claude Code, opens rendered in a
  pane; its README doesn't mention Mermaid, not checked); the root `package.json` Node test setup; `graphify-out/`
  (a graph built Nov 8). No Mermaid check or diagram skill exists outside the cockpit and the vendored packs
  (`improve-codebase-architecture/HTML-REPORT.md`, pstack `how`'s explainer prompt).
- **Local state:** on `main`, 17 staged files belong to the unrelated `api-mcp` run; the build must go in a worktree.
- **Not checked:** whether the installer already has an uninstall or cleanup path for a removed opt-in (the cockpit's
  Windows folder would be left behind otherwise); whether `check-repo` has rules naming the cockpit.

## Prior art

[prior-art.md](prior-art.md). Source check: 35 confirmed, 1 not supported (corrected), 0 couldn't open. No comparable
tool shows a diagram at a plan gate (Claude Code, Cursor, Cline, Aider, spec-kit are text only), so the comparables
are adjacent. Four shapes: A Mermaid text plus a headless validator (`mermaid.parse` under jsdom works on 11.4.1, with
two Node-side issues #6370/#6531 your check already avoids); B one model with many views (Structurizr, needs a JVM);
C D2/Graphviz with native validators (an extra binary); D interactive HTML at the gate (the superpowers visual
companion, needs a local server or a host that renders HTML). Mermaid limits worth knowing: ELK is default and bundled
from v12 but a separate package on 11.4.1; collapsible subgraphs need 11.17+; `end` breaks flowcharts. Unsupported
guesses (labelled in the report): C's weaker GitHub/LLM familiarity, D's "no server in T3 Code", B's JVM cost.

## Findings

## Options

### How the pictures are made and shown

Picked: B, shaped by the user's requirement that the spec and its diagrams be one thing, "not harness text and extra
browser window": Mermaid blocks in spec.md and plan.md, a checker script, and a renderer that writes the markdown and its
diagrams as one styled HTML page (inline in T3 through `html_render`, else a file to open). The user said they read plain
markdown or a renderer and are flexible, but it must "look on point".

Offered: A, Mermaid in the spec plus a checker only (smallest; the viewer's default look, no styling control); B, A plus a
generated HTML page (picked); C, a model that generates the views (Structurizr-like; needs a JVM or a format of our own).
Recommendation was A, then B once the user asked for quality.

### Removing the cockpit

Picked: delete it completely (the user's words: "Remove flow-cockpit completly"). My calls, not the user's: the old ADRs
and the two feature folders stay as history under a new superseding ADR; the capture hooks and the `views` skill go too;
an old install folder on the user's machine is not cleaned up by the repo unless the installer already has a path for it.

### Grill decisions (user, 2026-11-08)

- Old cockpit records (ADRs 0005 and 0007, the two feature folders): Picked: delete them (recommendation was keep as
  history). Audits stay, since none audits the cockpit; the gate asks the user to confirm.
- When pictures are drawn: Picked: different pictures depending on the task, "I really would like to see the file layout
  and what files change etc in a graphical form" (recommendation was only when architecture changes). Became the spec's
  task-to-pictures table and the `files` block.
- Plan gate rendering: Picked: spec only (recommendation was both). Spec Risks records that the file map is exact only
  at the plan.
- Size limits: Picked: 8 nodes per flowchart and 6 participants per sequence diagram.

Builder check (sonnet, 7 questions): answered by reading the repo or settled in the spec: fixtures, diagram types,
host-neutral gate wording with no compiler change, no other crate depends on the cockpit, Mermaid 12 tried first
(`package.json` requires Node 26), leftover folders named in the final report, no cockpit rules in `check-repo`.

## Plan review

### Round 1 (two fresh reviewers on the first plan, 2026-11-08)

Findings and decisions (user answers in brackets):

- Tasks 1 and 2 were coupled through the Cargo members; "dangling edge" is a tautology in Mermaid; the reserved-word list duplicates the parser; `</script>` escaping; Done means 1 and 3 unreachable as worded; the `>` marker grammar differed between spec and plan; `<flow-root>` paths; `uses` in `gate.toml`; `scan-skills`. All fixed in the rewrite.
- Dependency choice: the user did not want more vendored packages ("im not really happy with vendoring more and more different eco systems") and chose uv ("could we use pythons uv eco system that we already rely heavily on?"). The plan now runs `mermaid-syntax-parser` through `uv run --locked`.
- Order: pictures first, then deletions [user]. File map: Node draws it, plans reuse glance [user]. Guards: reword `checkTemplates`, remove the dead installer code [user].

### Round 2 (fresh-eyes reviewers A and B on the rewritten plan, then one fix-check agent)

Blocking, fixed: `uv run --project` would put a 95 MB `.venv` in the skill folder (measured by B). Now the environment lives in the user's cache folder, `.venv` is ignored and skipped by the compiler, and a test checks it.

Should-fix, fixed:

- Relative helper path (now absolute, tested from another working directory).
- The lint forbids Claude's folder name under `plugins/` (scoped allowlist for `check.mjs` and its test only; my call).
- A flows-only install had no uv (Task 3 makes the installer install it for flows; my call, grows Task 3 by two installer files).
- A failing uv was undefined (now a `not parser-checked` warning, 120 s timeout).
- Tasks 1 and 2 could not be committed without a `SKILL.md` (Task 1 adds a stub).
- The plan-map rule failed on the plan's own Files lines (new grammar, task-ordered existence check, a single parser in `glance.mjs`, an exported `planMap`).
- Cockpit-only workspace dependencies in `Cargo.toml` (Task 6 lists them).
- The `retiredPlugins` test could not fail (now built from the real catalog).
- `checkTemplates` rule (renamed `checkShapes`, every check kept).
- Gate bullet: render after the copyedit, never edit a given plan, show a failing check as text for such a document.
- `state.toml` line 5, formatting before each commit, fresh worktree from `origin/main`.

Dropped: editing `flows-rework/plan.md` (older record, code spans only; spec updated).

Fix check (fresh sonnet agent): 11 of 12 fixed, 1 partly (since fixed). No blocking finding in its fresh-eyes pass; its four should-fix points are in the list above.

Copyedit of the plan: applied (`compare.mjs` exit 0, editor removed nothing); the diff is prose rewording only.

Not checked: the installer's removal path; whether uv is present on Codex installs; Mermaid 12.3.0 and marked 18.1.3 on the CDN (the first was parsed under jsdom; the page itself is first seen in Task 4).

## Tasks

Worktree `.claude/worktrees/remove-cockpit-light-pictures` on branch `remove-cockpit-light-pictures`, cut from `origin/main` 24d39d70 (local main lags by three commits). Baseline: `npm run build:harnesses` then `npm test` exit 0. Untracked at the start: this run's folder only. Ledger: `.superpowers/sdd/plan/progress.md`.

Task 1: base 24d39d70 (untracked at start: the run folder only) — files clean, size 646 of ~560 excl. lockfile (under 2x); review clean after one fix round (commits c5a7b484, ec6e9d3b).
Task 2: base ec6e9d3b — files clean, size 544 of ~300 (under 2x); review clean after four fix rounds, all about HTML safety of the page (raw HTML, URL schemes, marked inRawBlock text, image alt); commits 6129cad5..b7d67bee.
Task 3: base b7d67bee — files clean, size 106 of ~180; review clean (commit bda987cb).
Task 4: base bda987cb — files clean, one CSS line (tree capped to the prose width) after screenshots of the page; hostile-markup probe inert (commit 6ff2d1e4).
Task 5: base 6ff2d1e4 — deviation (adds: none; unlisted file `tools/installer/core/catalog.test.ts`, decided, see Deviations); size 1162 of ~1700; review clean (commit 2d2eacc6).
Task 6: base 2d2eacc6 — files clean, size 42506 of ~55500; review clean; first run was cancelled by a server restart and resumed, partial work had not been committed (commits 09ec18d5, b74102a6).
Task 7: base b74102a6 — files clean, size 4525 of ~5000; review clean (commits 852da3fc, b27635b3). Afterwards, one commit for deviation 4 (3ed0b952).
Fix 1: base 3ed0b952 — files clean (commit 6577ea78).
Fix 8: base 6577ea78 — files clean (commits c51540a7, 89a08720).

## Rulings

- 2026-11-08, pre-flight: Task 4 runs in the main session, not a subagent — the web-mcp browser tool is the only working screenshot tool here and the plan calls for it — if wrong, a small delay. Confirmed 2026-11-09.
- 2026-11-08, pre-flight: line numbers in Tasks 5-7 are hints and builders re-grep the text they name — origin/main changed several files after the plan — a stale number is caught by the stated grep gates. Confirmed 2026-11-09.
- 2026-11-08, Task 1: the builder's partial Python test file was rewritten for the npm route — the plan's test list changed with the parser — a stale Python test would fail. Confirmed 2026-11-09.
- 2026-11-08, Task 1: a fix round after the automated security review made the cache folder absolute and refreshed `parse.mjs` on every run — a relative env value or a stale cached script was real enough and cheap to close — a few extra lines if wrong. Confirmed 2026-11-09.
- 2026-11-08, Task 2: "unchanged folders collapsed" means single-child folders with no file of their own are folded into one line — a files block lists only changed paths, so no folder is unchanged — the tree rows look different if wrong, and Task 4 tuned the page. Confirmed 2026-11-09.

## Parking lot

- Left on the machines of users who installed the cockpit, for them to delete by hand (the installer removes none of them; Task 5 checked): `~/.claude/bin/flow-cockpit/`, `~/.local/state/flow-cockpit/capture/`, `~/.config/flow-cockpit/`. Pick (2026-11-09): a follow-up, named in the final report.
- From the final review (minor, left as is): a plan with Delete tasks fails the checker once those tasks have run, so Gate 2 cannot render it again (`check.mjs:219-224`); a Mermaid block inside a blockquote or nested in a list item is drawn but never checked (`check.mjs:22`). Pick (2026-11-09): a follow-up.
- 15 review findings worth doing stay in the audit table (`docs/audits/2026-11-08-review-remove-cockpit-light-pictures.md`). Pick (2026-11-09): a follow-up.
- `shortcut:` in `plugins/flows/skills/diagrams/scripts/render.mjs`: the diagram theme follows the colour scheme at load, not live. Pick (2026-11-09): keep it (confirmed).

## Deviations

### The parser rejects valid diagram types (Task 1)

Status: decided 2026-11-08: full Mermaid via npm (user: "Full Mermaid via npm"), after the user asked why the parser rejects them and whether Python tooling can validate everything. Measured: the package's 251 KB bundle holds parsers for seven diagram types only; the search found no Python tool that validates all types. The plan (Tasks 1 and 3, Global Constraints) and the spec (checker, Risks, file map) are revised and wait for the user's approval of the change before the build goes on. Confirmed 2026-11-09.

`mermaid-syntax-parser` 0.2.2 accepts flowchart, graph, sequenceDiagram, classDiagram, stateDiagram-v2, gantt, journey and timeline, and rejects pie, erDiagram, gitGraph, mindmap, quadrantChart and xychart-beta, which are valid Mermaid (measured by the Task 1 builder, 2026-11-08). The spec says the parser checks every diagram type and Task 1's `pie` test expects exit 0. Changed error handling, so it goes to the user.

Options: (1, recommended) `check.mjs` keeps a list of the types the parser handles; any other type is not parsed and gets the warning `not parser-checked: <type> is not covered by the parser`; the spec's "every diagram type" line is edited. (2) Send every type to the parser and treat a rejection of an unlisted type as a warning (needs the same list). (3) Change the test to a type the parser accepts (pie, erDiagram, gitGraph and mindmap would still be false errors in real use).

### `glance.mjs` `parse` would throw on a malformed Files item (Task 1)

Status: decided 2026-11-08: keep glance lenient (user: "Keep glance lenient (Recommended)"); `planMap` raises the "no plan map" warning itself. Confirmed 2026-11-09.

For `planMap` to have a "cannot be parsed" case, `parse` throws on a malformed `Create|Modify|Delete` item and ignores other verbs. The repo's older plans write items without backticks (`- Modify: path (note)`), so `parse` on them would start to throw. Options: (1, recommended) keep `parse` lenient for glance: it never throws on Files lines, and `planMap` raises the "no plan map" warning itself when a Create/Modify/Delete item has no backticked path; (2) throw in `parse` as the builder proposed.

### `catalog.test.ts` is not on Task 5's Files list (Task 5)

Status: decided 2026-11-08: accept (user: "Accept (Recommended)"). Confirmed 2026-11-09.

Task 5 step 3 says "update counts in tests", but `tools/installer/core/catalog.test.ts` (it counts the catalog: 16 to 15 plugins, 15 to 14 for claude-code) is not on the Files list, so editing it is a deviation by item 4. The test fails without the edit. Options: (1, recommended) accept the file as part of the task, since the plan's own step requires the count change; (2) revert and add the file to the list in a plan amendment.

### `binaries.test.ts` has a stale slice marker (Task 6)

Status: decided 2026-11-08: fix both (user: "Fix both (Recommended)"); the slice now ends at `    runs-on:`, the `replaceBin` comment no longer mentions folders and the unused folder-swap test is dropped, in one commit. Confirmed 2026-11-09.

`tools/installer/core/binaries.test.ts:91` slices the `crates-build.yml` matrix text up to `        exclude:`, a key Task 6 removed from the workflow, so the slice now runs to the end of the file and the assertions are looser. The file is not on Task 6's Files list. Options: (1, recommended) end the slice at `        runs-on:` in a one-line fix, accepted as part of the task; (2) leave it and amend the plan.

## Walkthrough

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |
| 1. Cockpit gone: no live mention, workspace builds without the two crates | Tasks 5, 6, 7 | `plugins/catalog.json` (entry removed); `Cargo.toml` (members); `tools/installer/core/plugins.test.ts:103-110` | `retiredPlugins` test built from the real catalog; `npm test`, `cargo check --workspace`, clippy `--locked` |
| 2. `check.mjs` fails `call`, a ninth node, an orphan node, seven participants; passes the four api-mcp diagrams | Task 1 | `plugins/flows/skills/diagrams/scripts/check.mjs:17-18,206-209` | `tests/check.test.mjs:67,73,86,93,99` |
| 3. `render.mjs` writes spec + diagrams + file map as one page, legible | Tasks 2, 4 | `plugins/flows/skills/diagrams/scripts/render.mjs:268` | `tests/render.test.mjs:39,48`; spec file map checked clean against the base commit; screenshot of the page (Task 4) |
| 4. A gate shows the page (inline or as a printed path) | Task 3 | `plugins/flows/steps/gate.toml:2,20`; `plugins/flows/skills/diagrams/SKILL.md` | composed in every `[step: gate]` once (final review, measured); not run through a real gate (Done means 4) |
| 5. Installer lists no flow-cockpit; fresh install works | Task 5 | `tools/installer/install.ts`, `tools/installer/core/options.ts` | installer tests (208 pass); a fresh install was not run (Done means 5) |
| 6. Safe page from untrusted markdown | Task 2 | `plugins/flows/skills/diagrams/scripts/render.mjs` (`clean`, `safe`, image renderer) | `tests/render.test.mjs:98-179`; final-review probes, all inert |

## Review

Verdict: 2 to fix before merge, both fixed and checked (Fixed 2026-11-09: 1, 8). Audit file: [docs/audits/2026-11-08-review-remove-cockpit-light-pictures.md](../../audits/2026-11-08-review-remove-cockpit-light-pictures.md). 15 more findings are worth doing and stay in its table (the user chose to fix only 1 and 8); 2 candidates were dropped, one of them the verifier's wrong "`OFF_PALETTE` is a leftover" (measured: the test fails without it).

## Learned

- `AGENTS.md` (the flows paragraph on `skills/diagrams/`): the page's script is a template literal in `render.mjs`, so each backslash in its regexes is written twice, and the tests run the produced page's source (the UNC fix of review pick 1 needed it).
- Memory: `nix-flake-check-fails-here.md` (`nix flake check --no-build` fails in the pre-commit derivation on the parent commit too); `headless-browsers-broken.md` updated (screenshot, eval and scrollTo work on a local page; `fullPage` is ignored).
- Nothing parked: no ADR, check or skill fix came out of /learn.

## Run verdict

Worked as a whole: yes. Clean: yes. (User, 2026-11-09, after seeing the rendered page of the spec.)
