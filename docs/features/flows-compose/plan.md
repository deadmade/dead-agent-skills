# flows-compose Implementation Plan

<!-- glance -->

```
Plan: flows-compose · 19 tasks · ~3990 lines · 69 files
 1  [1 The compose pass and it…]
 2  [2 Host token maps, build … ←1]
 3  [3 Uses from the composed … ←2]
 4  [4 One set of section name… ←3]
 5  [5 Run-level steps ←4]  [6 Plan and gate steps, an… ←4]  [8 Finish steps ←4]
 6  [7 Build steps ←6]  [17 writing and the copyedi… ←6]
 7  [9 /build-feature ←5,6,7,8]
 8  [10 /implement ←9]  [14 /research-feature ←9]  [15 /review-code ←9]  [16 /understand and /learn ←9]
 9  [11 /fix ←10]
10  [12 /upgrade ←11]
11  [13 /refactor ←12]
12  [18 Delete flow-rules, the … ←10,11,12,13,14,15,16,17]
13  [19 Check every finding aga… ←18]

#   does                                                          files  adds                            size
1   turns a conductor with `[step: name]` lines and host tokens…  2      `compose.ts` exporting `compo…  ~420
2   makes the build compose flows for each harness with that ha…  13     `TOKENS: HostTokens` exported…  ~320
3   makes flows' dependencies and README tree come from what ea…  5      nothing new (frontmatter keys…  ~280
4   gives the run templates the same section names for what the…  8      `audit-template.md` (sections…  ~170
5   writes the rules every conductor starts with: run rules, st…  2      seven step files                ~260
6   writes how a plan is shaped and checked, how a gate is aske…  3      five step files; glance flag …  ~260
7   writes how a build sets up its branch, runs its executor, b…  3      four step files, one reference  ~300
8   writes the end of every run: walkthrough, review, lessons, …  1      four step files                 ~170
9   makes /build-feature the first conductor built from steps, …  3      nothing new                     ~250
10  makes /implement build a ticket or a given plan as given, n…  2      nothing new                     ~120
11  makes /fix build from steps, prove its fix in a scratch wor…  2      nothing new                     ~140
12  makes /upgrade take many packages, group small bumps, plan …  2      nothing new                     ~140
13  adds a conductor for local and restructuring refactors that…  4      conductor `refactor`; `flow: …  ~140
14  makes /research-feature build from steps, ground before ask…  2      nothing new                     ~120
15  makes /review-code build from steps, ask its intent before …  3      target `pr <number>`            ~260
16  makes the two small conductors build from steps; /learn wri…  1      nothing new                     ~120
17  makes the copyedit find its script from any working directo…  4      nothing new                     ~60
18  removes the shared rules file and the separate host file no…  8      check 5; the lint's flows phr…  ~360
19  confirms each of the 93 findings is fixed in what agents ac…  1      nothing new                     ~100
```

<!-- /glance -->

> **For agentic workers:** execute task by task through the method chosen at Gate 2. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** every flows conductor is built from shared flow steps into one self-contained file per harness, the build
catches drift, and all 93 evaluation findings are fixed.

**Architecture:** a compose pass in the harness compiler (`src/flows/compose.ts`) copies `plugins/flows/steps/*.md`
into each conductor at its `[step: name]` lines, resolves host tokens from `src/templates/hosts/<target>.ts`, and
checks the result. `check()` and check-repo fail on what the checks report. The machinery lands first: at that point
compose is a no-op on today's files, and the checks that today's text would fail only warn. Then the steps are
written, then each conductor is converted, and last Task 18 deletes `flow-rules.md` and turns every warning into a
failure.

**Tech Stack:** TypeScript on Node 26 (`node --test`, type stripping), Markdown skills, Node ESM scripts, the
flow-cockpit Rust core tests.

**Spec:** [spec.md](spec.md), approved at Gate 1 on 2026-11-04; plan review round 1's edits to §2, §3, §4 and §5
reopened it for those lines. **Findings:** [evaluation.md](evaluation.md); each `#n` below names finding n there.

## Global Constraints

- Rule text: resolved in `plugins/flows/steps/` and each flow's own SKILL.md; never written by the compiler's code,
  which only composes and checks.
- Host wording: resolved in `tools/harness-compiler/src/templates/hosts/<target>.ts`; never seen by `plugins/`,
  which writes tokens.
- What a flow runs: resolved by its `[step:]` lines; a step never names the flows that use it.
- No interface for a single implementation, no helper for a single caller, and no option that nobody sets.
- A step reads the same in every flow: no slots, no parameters. A flow writes its own sentence around a step.
- A phase's name is one word, and that word is both the cockpit key and the `phase:` value. Existing keys never
  change, except that /implement's `plan` becomes `confirm` (no `flow: implement` run exists for the rename to
  break); new phases add keys.
- Paths in steps go through the literal `<flow-root>`; `<skill-dir>` appears only in a flow's own SKILL.md, which
  defines it where it uses it.
- A flow's own `uses:` lists only what its neutral text runs; host-only names come from the token maps' `uses`.
- `Size:` is one number, `~N`: added plus removed lines in the task's own **Files**, generated output excluded.
- Generated output is on every task's Files list, and the files check ignores it: `.claude-plugin/**`,
  `.agents/plugins/**`, and what `node scripts/flows-uses.mjs` rewrites (`plugins/catalog.json`,
  `plugins/flows/plugin.json`'s `dependencies`, `plugins/flows/README.md`'s tree).
- Every commit builds: after `npm run build:harnesses` and `node scripts/flows-uses.mjs`, `npm test`,
  `npm run typecheck` and `npm run check:harnesses` pass, and the generated trees ship in the same commit.
- A task that changes a phase table, a template's `## ` sections, an audit table or a `flow:` value runs
  `cargo test -p flow-cockpit-core --manifest-path crates/flow-cockpit/Cargo.toml`.
- Vendored files change only through `npm run sync -- apply <name>`. An `<!-- overrides <pack>/<path>: "<sentence>" -->`
  marker quotes the pack sentence exactly.
- `plugins/` stays agent-neutral (`node tools/harness-compiler/src/cli.ts lint`).
- Today's rule wording is kept unless a finding changes it; each finding a task fixes is named in its step. A task
  that moves text and fixes findings commits the verbatim move first and the fixes in a second commit.
- `docs/` history (other runs' flow.md, plans, audits) stays as it is.
- Commit messages are one sentence with no co-author lines. Stage with `git add -u` plus new paths by name.

## Test seams

- **`composeFlows()` and `checkBuilt()`** (`tools/harness-compiler/src/flows/compose.ts`), through
  `test/compose.test.ts`, its fixtures built in code with a `put` helper (as `build.test.ts` does): catches every
  compose rule and every check, each with its own failing fixture. Misses whether the real flows' prose is right.
- **`buildTree()` and `check()`** (`src/emit/build.ts`, `src/emit/commands.ts`), through `test/build.test.ts`:
  catches the wiring (compose after `target.emit`, before `transformMarkdown`; checks after it; compose errors throw;
  check problems fail `check()`, warnings don't; Codex `agents/openai.yaml`). Misses the real tree.
- **The flows-uses.mjs exports**, through `scripts/flows-uses.test.mjs`: catches uses per target, dependencies, the
  README tree and the template strings. Misses whether a name is really needed.
- **`glance.mjs` CLI**, through `plugins/flows/skills/build-feature/tests/glance.test.mjs`: catches the read-only mode.
- **The real tree**, through `npm test` (check-repo) and `npm run check:harnesses`: catches drift, unknown steps,
  missing sections, unresolved paths and the budget on the shipped flows. Misses meaning.
- **`phase_lists_match_skill_tables`**, `tests/docs.rs` and the audit tests, through `cargo test -p
flow-cockpit-core`: catches phase tables, template headings and audit columns drifting from the cockpit.

Prose (steps, conductors, references) gets no unit tests. Its check is Task 19, in which fresh agents re-check every
finding against the built text.

## Review Focus

1. A Windows checkout (CRLF) builds the same bytes and the same token estimates as Linux. A CRLF fixture made with
   `replaceAll('\n', '\r\n')` in `compose.test.ts` covers it (Task 1).
2. An upstream sync that rewords a sentence that an override marker quotes: check-repo fails in the sync job before
   the PR opens, as it does today (checkOverrides stays in flows-uses.mjs, and Task 3 keeps its test).
3. A Codex build whose token text or step text still names a Claude-only tool or model: a warning until Task 18, a
   `check()` failure after it (Tasks 2 and 18's build tests).
4. A step used twice in one flow without `repeat: true`, and `gate` used twice with it: the first fails with
   `file:line`, the second builds and numbers the gates (Task 1).
5. A conductor that uses a step whose `writes:` names a section its template lacks, including /implement's two
   templates and /review-code's audit template: fails naming the step, the section and the template (Task 1; real
   tree from Task 9 on).

---

## Stage 1: the machinery (compose is a no-op on today's files)

### Task 1: The compose pass and its checks on source

**Does:** turns a conductor with `[step: name]` lines and host tokens into one finished file, and refuses one that is
broken.
**Depends on:** none
**Files:**

- Create: `tools/harness-compiler/src/flows/compose.ts`
- Create: `tools/harness-compiler/test/compose.test.ts`

**Adds:** `compose.ts` exporting `composeFlows`, `checkBuilt` (Task 2 fills its body), `ComposeError`,
`CLAUDE_ONLY`, `SHORT_NAMES`, and the types `Uses`, `HostTokens`, `Composed`, `Checked`
**Size:** ~420

**Interfaces:**

- Produces:
  - `type Uses = Record<string, string[]>` (`{ plugin: [names] }`, the shape today's uses.json has; a plugin key
    carries its marketplace where it has one, `claude-security@claude-plugins-official`)
  - `type HostTokens = Record<string, { text: string; uses?: Uses }>` (key without braces: `ask-user`,
    `model:strongest`, `adapter`)
  - `interface Composed { files: Map<string, string>; uses: Record<string, Uses> }` (`files` maps each path relative
    to the flows plugin root to its composed text, for every `skills/**/*.md` and `references/**/*.md`; `uses` is
    keyed by conductor)
  - `interface Checked { problems: string[]; warnings: string[] }` (each line `<file>:<line>: <what>`)
  - `composeFlows(pluginDir: string, tokens: HostTokens): Composed`, throws `ComposeError`
  - `checkBuilt(dest: string, target: TargetId, composed: Composed): Checked`
  - `class ComposeError extends Error { file: string; line: number }`, message `<file>:<line>: <what>`
  - `const CLAUDE_ONLY: RegExp[]`: `AskUserQuestion`, `WebSearch`, `WebFetch`, `subagent_type`, `Monitor`,
    `Explore agent`, `the Skill tool`, and `haiku`, `sonnet`, `opus`, `fable` as whole words, case-insensitive
  - `const SHORT_NAMES: string[]`: `how`, `why`, `fetch`, `teach` (skill names that are also plain words)

- [ ] Write the failing tests in `test/compose.test.ts`, one per rule, each on a fixture plugin built in a temp dir
      with a `put` helper:
  - `composes a step in place`: a `[step: a]` line becomes `steps/a.md`'s body byte for byte, frontmatter dropped.
  - `leaves a file with no step line, no token and no override marker byte-identical`.
  - `strips override-marker lines` from composed output (a line holding only `<!-- overrides … -->`).
  - `resolves tokens per target`: `{{ask-user}}` gives each map's text; `{{nope}}` throws `ComposeError` naming file
    and line.
  - `draws the phase table`: `## Phase 1: Read` + `<!-- runs: a · output: b -->` (with and without a blank line
    between) gives `| 1 Read | a | b |`; a phase containing `[step: gate]` gets `**Gate 1**` appended to its last (output) cell, the
    one cell `phases.rs` reads, the next `**Gate 2**` (the expected table in the test has a gate row); then `phases: read | … | done`; the comment is stripped. In a file with `[step: phases]`, a phase name of more
    than one word throws; in a file without it, a multi-word phase heading builds unchanged.
  - `inlines the adapter`: `[step: host]` gives the `adapter` token's text.
  - `refuses`: an unknown step; a step without `repeat: true` used twice in one file; a `[step:` line inside a step;
    a `#` or `##` heading inside a step; `<skill-dir>` inside a step; an unmet `requires:`; a `writes:` section
    missing from any of the flow's `template:` files; a flow with no `template:` using a step that `writes:`; a
    `needs: subagents` step without a line starting `Without subagents:`. Each throws `ComposeError` with the step and
    the file.
  - `strips uses and template from frontmatter`, keeps every other key.
  - `computes uses`: a flow's own `uses:`, its steps' `uses:`, and each resolved token's `uses`, merged and sorted.
  - `reads CRLF as LF`: a fixture whose files were written with `replaceAll('\n', '\r\n')` composes to the same bytes
    as the LF one.
- [ ] Run `npm test --workspace=@dead-claude-skills/harness-compiler`. Expected: FAIL, module not found.
- [ ] Implement `compose.ts`. Frontmatter is `key: value` lines between `---` fences, no YAML library. `uses:` is one
      line, a comma list of `plugin:name` (`uses: superpowers:writing-plans, pstack-picks:how`). `requires:` and
      `writes:` are comma lists; `writes:` names `## ` sections. `template:` is a comma list of paths relative to the
      plugin root, and check 3 runs against each. A step line is a line that is exactly `[step: <name>]`. Every file
      is converted from CRLF to LF as it is read; paths use `/`. The phase table's comment is the first non-blank line after a
      `## Phase <n>: <Name>` heading. `checkBuilt` returns `{ problems: [], warnings: [] }`.
- [ ] Run the tests. Expected: PASS. `npm run typecheck`. Expected: PASS.
- [ ] Commit: `Add the flows compose pass with its source checks and fixture tests.`

### Task 2: Host token maps, build wiring and the checks on built text

**Does:** makes the build compose flows for each harness with that harness's wording, check the finished files, and
fail `check:harnesses` on what the checks find.
**Depends on:** Task 1
**Files:**

- Create: `tools/harness-compiler/src/templates/hosts/claude-code.ts`
- Create: `tools/harness-compiler/src/templates/hosts/codex.ts`
- Modify: `tools/harness-compiler/src/templates/hosts/claude-code.md` (names `claude-md-improver`)
- Modify: `tools/harness-compiler/src/flows/compose.ts` (`checkBuilt`)
- Modify: `tools/harness-compiler/src/emit/build.ts` (`Build` gains `problems` and `warnings`)
- Modify: `tools/harness-compiler/src/emit/commands.ts` (`check()` returns `buildTree`'s problems with the file drift)
- Modify: `tools/harness-compiler/src/cli.ts` (`build` prints warnings and problems)
- Modify: `tools/harness-compiler/src/targets/codex.ts` (`agents/openai.yaml` for conductors)
- Modify: `tools/harness-compiler/test/build.test.ts`, `tools/harness-compiler/test/compose.test.ts`
- Modify: `scripts/check-repo.mjs` (rebuild hint only on drift lines)
- Modify: `tools/harness-compiler/src/templates/hosts/codex.md` (line 12)
- Modify: `crates/flow-cockpit/core/src/doc/phases.rs` (`table()` reads `.claude-plugin/flows/skills/<skill>/SKILL.md`)
- Modify: `.github/workflows/crates.yml` (trigger paths and the cockpit filter)

**Adds:** `TOKENS: HostTokens` exported from each host file; `Build.problems`, `Build.warnings`
**Size:** ~320

- [ ] Write the failing tests:
  - `compose.test.ts` `checkBuilt`: a conductor's (`disable-model-invocation: true`) rules plus Start over 4,500
    estimated tokens (bytes ÷ 4, LF, from the file's start to its first `## Phase` heading) is a problem; a
    20,000-byte non-conductor skill with no `## Phase` heading is clean; a `node "./x.mjs"` line, a `node "<flow-root>/missing.mjs"`,
    a `node "<skill-dir>/missing.mjs"` (resolved against that file's own skill folder) and a
    `references/missing.md` link are each a warning (check 6); `node "<skill-dir>/x.mjs"` where `x.mjs` exists in
    that skill is clean; Codex text matching `CLAUDE_ONLY` outside `packs/` and `resources/` is a warning (#12, #13).
  - `compose.test.ts` `the host maps agree`: both `TOKENS` maps have the same keys.
  - `build.test.ts`: a fixture flows plugin with one step builds; the Claude Code tree has the step's text where the
    `[step:` line was and `{{ask-user}}` resolved; the Codex tree has its own wording and an `agents/openai.yaml`
    holding `policy:` / `  allow_implicit_invocation: false` (the form the packs ship, e.g.
    `packs/mattpocock-picks/skills/teach/agents/openai.yaml`) in each conductor's folder
    (`disable-model-invocation: true`); an unknown step makes `buildTree` throw; a conductor over budget makes
    `check()` return a problem; an unresolved `node` path does not.
- [ ] Run both. Expected: FAIL.
- [ ] Write the token maps from spec §3's table. Each entry's `uses` is filled where its text names a tool or skill
      (`watch-checks` on Claude Code: `{ 'claude-code': ['Monitor'] }`). `adapter` reads today's
      `templates/hosts/<target>.md`. On Claude Code its uses are exactly:
      `{ 'claude-code': ['code-review', 'security-review'], 'claude-md-management@claude-plugins-official': ['claude-md-improver'], 'claude-security@claude-plugins-official': ['claude-security'] }`.
      `claude-code.md` names `claude-md-improver`. The `adapter` text is the `.md` file's body without its H1; `codex.md:12` says "Claude
      tool names" without listing AskUserQuestion (which the rewrite pass would mangle). The `.md` files stay as the
      adapter's source.
- [ ] In `build.ts`, for the plugin named `flows`: after `target.emit`, run `composeFlows(plugin.dir, TOKENS)` and write
      each composed file over its copy in `dest`; after the `transformMarkdown` loop, add
      `checkBuilt(dest, target.id, composed)`'s lists to the build's `problems` and `warnings`. Check 6 maps
      `<flow-root>` to `dest` and `<skill-dir>` to the file's own skill folder before resolving. `check()` returns the
      file drift plus `problems`, each compose problem prefixed `flows: `; `cli.ts` and check-repo add the "run npm run
      build:harnesses" hint only to missing, stale or extra lines. The build prints each conductor's token estimate.
      Leave `references/host.md` emission alone (Task 18 removes it).
- [ ] In `phases.rs`, point `table()` at `../../../.claude-plugin/flows/skills/<skill>/SKILL.md`. In `crates.yml`, add
      `.claude-plugin/flows/skills/**`, `plugins/flows/references/build-template.md` and
      `plugins/flows/skills/*/references/*-template.md` to both the top-level `on.pull_request.paths` and the cockpit
      filter, so a flows-only change runs the phase-table and template tests.
- [ ] Run the harness-compiler tests, `npm run build:harnesses`, `npm test`, `npm run check:harnesses`,
      `cargo test -p flow-cockpit-core --manifest-path crates/flow-cockpit/Cargo.toml`. Expected: PASS; the generated
      trees change only by the new `agents/openai.yaml` files, the stripped override markers and both
      `references/host.md` files; the build prints the
      check-6 and phrase warnings on today's text.
- [ ] Commit: `Compose flows per harness with host token maps, fail check:harnesses on what the built-text checks find, and give Codex conductors an implicit-invocation policy.`

### Task 3: Uses from the composed text

**Does:** makes flows' dependencies and README tree come from what each built conductor actually uses, per harness.
**Depends on:** Task 2
**Files:**

- Modify: `scripts/flows-uses.mjs`, `scripts/flows-uses.test.mjs`, `scripts/check-repo.mjs`
- Modify: `tools/harness-compiler/src/flows/compose.ts`, `test/compose.test.ts` (check 7 in `checkBuilt`)
- Modify: `plugins/flows/skills/writing/tests/writing-skill.test.mjs` (its `checkUses`/`readUses` import and
  assertions go)
- Modify: `plugins/flows/skills/*/SKILL.md` (frontmatter `uses:` and `template:`, review-code's excepted)
- Delete: `plugins/flows/skills/*/uses.json`

**Adds:** nothing new (frontmatter keys replace uses.json; check 7's text half joins `checkBuilt`; `checkUses` is
renamed `checkUseNames`)
**Size:** ~280

- [ ] Write the failing tests in `compose.test.ts` `checkBuilt` (check 7's text half, per target). Problem: a uses
      name absent from the built text (SKILL.md plus the references it links). For a uses name on `SHORT_NAMES`, only
      `plugin:name` or a pack path counts as its mention, and bare words are never flagged: prose with "how" and "why"
      gives nothing, while uses `pstack-picks:how` with only a bare "how" in the text is a problem (#86). Warning: a
      pack path in built text (`<packs>/<pack>/skills/<name>`, `<flow-root>/packs/…`) that isn't in the uses.
- [ ] Write the failing tests in `flows-uses.test.mjs`: `expectedDeps` takes the Claude Code union of
      `composeFlows(…, claude-code TOKENS).uses`; `renderTree` lists the neutral union and marks a host-only entry
      `(claude-code)`; a new `checkUseNames(root, uses)` fed by `composeFlows(…).uses` keeps today's `checkUses`
      existence cases (an unknown plugin, a skill missing from its pack, a flows entry that is a conductor, a skill
      folder without SKILL.md) and adds "a conductor that still has a uses.json"; `checkOverrides` still fails on a
      marker whose sentence the pack lacks.
- [ ] Run both. Expected: FAIL.
- [ ] Move each conductor's uses.json into a one-line `uses:` frontmatter key and add its `template:` key
      (`references/build-template.md`, `skills/build-feature/references/flow-template.md`,
      `skills/research-feature/references/research-template.md`; review-code's comes in Task 4); delete the uses.json
      files. The uses move unchanged for now: review-code's `claude-code`, `claude-md-management@…` and
      `claude-security@…` entries stay in its `uses:` until Task 15 converts it to the adapter and `watch-checks`
      tokens, so the dependencies don't change here. `flows-uses.mjs` imports `composeFlows` and both `TOKENS`; `readUses` goes;
      `checkUses` becomes `checkUseNames`, and check-repo calls it in its place (#47, #61). Remove the uses import and
      assertions from `writing-skill.test.mjs`.
- [ ] Run `node scripts/flows-uses.mjs`, `npm run build:harnesses`, `npm test`, `npm run check:harnesses`. Expected:
      PASS; `plugin.json` dependencies unchanged; the README tree changes only by host marks.
- [ ] Commit: `Compute flows' uses from the composed conductors per harness and drop the uses.json files.`

### Task 4: One set of section names in the run and audit templates

**Does:** gives the run templates the same section names for what the same steps write, and gives /review-code an
audit template with the sections its steps write.
**Depends on:** Task 3
**Files:**

- Modify: `plugins/flows/references/build-template.md`
- Modify: `plugins/flows/skills/build-feature/references/flow-template.md`
- Modify: `plugins/flows/skills/research-feature/references/research-template.md`
- Create: `plugins/flows/skills/review-code/references/audit-template.md`
- Modify: `plugins/flows/skills/review-code/references/report.md` (links the audit template),
  `plugins/flows/skills/review-code/SKILL.md` (frontmatter `template:` only)
- Modify: `scripts/flows-uses.mjs`, `scripts/flows-uses.test.mjs` (`checkTemplates` reads `Picks:` and
  `Fixed <date>` from the audit template instead of flow-rules.md)
- Modify: `crates/flow-cockpit/core/tests/docs.rs` and its fixtures under `crates/flow-cockpit/core/tests/fixtures/docs/`
- Modify: `crates/flow-cockpit/core/src/doc/*.rs` only where a section name it reads changes

**Adds:** `audit-template.md` (sections Findings, Tasks, Rulings, Parking lot, Deviations, Skipped, Run verdict); in
both build templates the one list Grounding, Findings, Plan review, Tasks, Rulings,
Parking lot, Deviations, Review, Learned, Walkthrough (first column `goal`), Skipped, Run verdict, plus each flow's
own; in research-template Parking lot and Learned
**Size:** ~170

- [ ] build-template: **Grounding** replaces **Findings** as the grounding notes, **Findings** holds /fix's findings
      (#9), **Review** replaces **Verify**; flow-template gains Findings, Review and Learned (#41, #60);
      research-template gains Parking lot and Learned (#43, #60); both build templates name their placeholders in a
      comment the `state` step cites (#50).
- [ ] audit-template: the audit file's table (with `bucket` as its last column, #49, #79), its `Picks:` and
      `Fixed <date>` lines, and `## ` sections Findings, Tasks, Rulings, Parking lot, Deviations, Skipped and Run
      verdict (what `deviations`, `decide` and a standalone call-conductor write, #29). Repoint `checkTemplates`'
      `Picks:` and `Fixed <date>` to it.
- [ ] Update `tests/docs.rs` expectations and fixtures for the new headings; keep any old-run fixture as it is. Add
      a trailing `bucket` column to `tests/fixtures/docs/audit.md`, so the audit parse (`core/src/doc/audit.rs`, which
      reads the first four cells) is tested with it.
- [ ] `npm test`, `npm run check:harnesses`,
      `cargo test -p flow-cockpit-core --manifest-path crates/flow-cockpit/Cargo.toml`. Expected: PASS.
- [ ] Commit: `Give the run templates one set of section names and /review-code an audit template with the sections its steps write.`

## Stage 2: the steps

Each step is a file `plugins/flows/steps/<name>.md`: optional frontmatter, then text with no `#`/`##` heading and no
`<skill-dir>`. Its text comes from today's `references/flow-rules.md` and the conductors' repeated passages, changed
only where a named finding says so: the verbatim copy goes in one commit and the finding fixes in the next. A step is
checked only once a flow uses it, which happens from Task 9 on.

### Task 5: Run-level steps

**Does:** writes the rules every conductor starts with: run rules, state, start or resume, grounding, prior art,
seams, and the missing-piece fallbacks.
**Depends on:** Task 4
**Files:**

- Create: `plugins/flows/steps/run-rules.md`, `state.md`, `start.md`, `ground-code.md`, `prior-art.md`, `seams.md`,
  `missing-piece.md`
- Modify: `docs/features/flows-compose/flow.md` (the measured size)

**Adds:** seven step files
**Size:** ~260

- [ ] `run-rules`: user decides; say how you know; untrusted data; agents (count, fresh, models as `{{model:…}}`
      tokens); homes and commits; the definition of `<flow-root>` only ("the flows plugin folder: two levels above
      this SKILL.md"; each conductor defines `<skill-dir>` in its own prose where it uses it); flow-rules' **Loading
      skills** (packs read by path), without its uses.json and `node scripts/flows-uses.mjs` bullet and without
      naming `<skill-dir>` (flow-rules.md:162's pack-relative-path sentence says "the pack skill's folder"); every
      report ends with ponytail's "Not checked" footer line, with its marker; last line the re-read rule, worded to
      hold in every conductor: "After a compaction, or on resume, re-read this file from the `## Phase` heading of
      the phase you are in (flow.md's `phase:`, where the run keeps one), before acting." (#72, #93).
- [ ] `state` (no `writes:`): flow.md fields; `phase:` names the phase in progress (#50, #93); cites the template's
      placeholders.
- [ ] `start`: spec §6's `start` row in full (#7, #25, #31, #37, #55, #88).
- [ ] `ground-code` (no `writes:`; each flow's own prose says where the notes go, so /understand needs no template):
      pstack `how` written as `pstack-picks:how` (graphify first when a graph exists), `why` only for the concern
      asked; domain docs; reuse a research run's Grounding (#67, #70).
- [ ] `prior-art`: the agent and its source check, with the report path stated (#24); `needs: subagents` with its
      `Without subagents:` line.
- [ ] `seams`, `missing-piece`: today's text; `missing-piece` lists fallbacks per plugin, and one sentence says a
      flow's uses decide which rows matter.
- [ ] Measure: in a scratch copy of `plugins/flows`, add a stub conductor with `[step: phases]`, `[step: host]`,
      `[step: run-rules]`, `[step: state]` and `[step: start]` before one `## Phase 1: X`, run `composeFlows` with each
      `TOKENS` map and print `Buffer.byteLength(files.get('skills/stub/SKILL.md')) / 4`. Record both numbers in
      flow.md under **Tasks**. Over 4,000: the rules stay inline, and only Loading skills' pack-path details (lookups,
      not rules) move below the first `## Phase` heading of each conductor, as their own short section.
- [ ] `npm run build:harnesses && npm test`. Expected: PASS.
- [ ] Commit (twice, per the Global Constraints): `Copy the run-level rules into flow steps.`, then
      `Fix the run-level findings in the flow steps.`

### Task 6: Plan and gate steps, and glance's read-only mode

**Does:** writes how a plan is shaped and checked, how a gate is asked and recorded, and when a copyedit runs; lets
glance check a plan without writing into it.
**Depends on:** Task 4
**Files:**

- Create: `plugins/flows/steps/plan-shape.md`, `plan-check.md`, `gate.md`, `copyedit.md`, `before-you-write.md`
- Modify: `plugins/flows/skills/build-feature/scripts/glance.mjs`, `plugins/flows/skills/build-feature/tests/glance.test.mjs`
- Modify: `scripts/flows-uses.mjs`, `scripts/flows-uses.test.mjs` (`checkTemplates`: the gate line is read from
  `steps/gate.md`, `**Does:**` and `**Depends on:**` from `steps/plan-shape.md` instead of three SKILL.md files; the
  `without()` fixture copies `plugins/flows/steps/`)

**Adds:** five step files; glance flag `--check` (prints the block, writes nothing, same exit codes)
**Size:** ~260

- [ ] Write the failing test in `glance.test.mjs`: `--check` on a valid plan prints the block, exits 0 and leaves the
      file's bytes unchanged; on a plan missing `Depends on:` exits 1 with the task named.
- [ ] Run `node --test plugins/flows/skills/build-feature/tests/glance.test.mjs`. Expected: FAIL.
- [ ] Add `--check` to `run()` and the CLI. Run the test. Expected: PASS.
- [ ] `before-you-write`: a frozen copy of ponytail's **Before you write**, one override marker per copied sentence;
      the one place this rule lives.
- [ ] `plan-shape` (requires `plan-check`, `before-you-write`; doesn't repeat it): spec §6's row (#4, #6, #8, #16, #34, #39, #48), with the overrides of
      writing-plans' "smaller, focused files" and execution handoff moved here with their markers.
- [ ] `plan-check`: `node "<flow-root>/skills/build-feature/scripts/glance.mjs"` after every edit and after the
      copyedit; glance (and `--check`) keeps today's rules (headings, `Depends on:`, `Size: ~N`, in step with the
      cockpit's `plan.rs`), and the step's prose has the agent check that every task also has Does, Adds and Size;
      a plan outside the run folder is linked, never edited; a given plan uses `--check` (#6, #42, #48).
- [ ] `gate` (`repeat: true`): spec §6's row (#9, #15, #44, #64), the `- Gate <n>, <what>:` line, the execution offer
      only at a plan gate.
- [ ] `copyedit`: when it runs (spec, plan, research report, audit report, never a given plan), its command through
      `<flow-root>`, and the refused case (#1, #63).
- [ ] Update `checkTemplates` and its tests as listed under Files. `npm run build:harnesses && npm test`. Expected:
      PASS.
- [ ] Commit (twice): `Copy the plan, gate and copyedit rules into flow steps.`, then
      `Fix the plan and gate findings and give glance a read-only check mode.`

### Task 7: Build steps

**Does:** writes how a build sets up its branch, runs its executor, briefs its builders and stops on deviations.
**Depends on:** Task 6
**Files:**

- Create: `plugins/flows/steps/worktree.md`, `execute.md`, `builder-brief.md`, `deviations.md`
- Create: `plugins/flows/references/stack-packs.md` (flow-rules' Stack packs table, looked up, not followed)
- Modify: `scripts/flows-uses.mjs`, `scripts/flows-uses.test.mjs` (`checkTemplates` reads `Waiting for you` and
  `Status: decided` from `steps/deviations.md`)

**Adds:** four step files, one reference
**Size:** ~300

- [ ] `worktree`: spec §6's row, the move of the run folder with `diff -r` (#5, #10, #37).
- [ ] `execute` (requires `worktree`, `needs: subagents` with its fallback line): spec §6's row (#5, #92), with the
      handling-reports override marker for splitting a BLOCKED task, and executing-plans' "do the final review
      yourself" overridden: without subagents it is skipped and recorded "not checked" (#35).
- [ ] `stack-packs.md`: today's table; hallmark only for a new page or component, or when the user names it, with
      its marker (#17).
- [ ] `builder-brief` (requires `before-you-write`, which it doesn't repeat): the brief clause, the tests rule,
      ponytail's The smallest complete change as a frozen copy without the "one small test" line, one override marker
      per copied sentence, Never cut, the stack-pack skill (#91, #29).
- [ ] `deviations` (`writes: Tasks, Rulings, Parking lot, Deviations`): the classes as a numbered list; the fifth
      stop; the files check per task (base sha, files, size, Adds; run by the coordinating session itself in native
      mode); Rulings copied before either executor deletes its workspace; Parking lot (#38, #73, #85, #90). All of
      today's SDD/executing-plans override markers move here.
- [ ] Update `checkTemplates` and its tests as listed under Files. `npm run build:harnesses && npm test`. Expected:
      PASS.
- [ ] Commit (twice): `Copy the build rules into flow steps.`, then `Fix the build-step findings.`

### Task 8: Finish steps

**Does:** writes the end of every run: walkthrough, review, lessons, the decision list, commits and branch handling;
and how one conductor runs another inline.
**Depends on:** Task 4
**Files:**

- Create: `plugins/flows/steps/finish.md`, `decide.md`, `close.md`, `call-conductor.md`

**Adds:** four step files
**Size:** ~170

- [ ] `finish` (requires `decide`, `close`; `writes: Walkthrough, Review, Learned`): walkthrough,
      `/review-code branch` inline stopping after its Phase 6 with the generic intent and whether execution ran natively, then
      `/learn` (#2, #20, #36, #43). A build flow writes `[step: finish]`, `[step: decide]`, `[step: close]` in that
      order, so Decide comes after /learn and before the branch is finished (#3, #28).
- [ ] `decide` (`writes: Skipped, Run verdict`): spec §6's row (#15, #28).
- [ ] `close` (requires `decide`): `finishing-a-development-branch`, merge conflicts stop with the list and options,
      `phase: done` (#37, #87).
- [ ] `call-conductor` (`writes: Findings, Deviations, Rulings`): spec §6's row (#9, #26, #29).
- [ ] `npm run build:harnesses && npm test`. Expected: PASS.
- [ ] Commit (twice): `Copy the finishing rules into flow steps.`, then `Fix the finishing findings.`

## Stage 3: the conductors

Each task rewrites one conductor as its own prose, one-word `## Phase <n>: <Name>` headings with their runs/output
comments, and `[step:]` lines. The conductor starts with `[step: phases]`, then `## Rules for the whole run` with
`[step: host]` and `[step: run-rules]`, then Start (`[step: state]` and `[step: start]`). The exceptions are
/review-code, /understand and /learn, which keep no flow.md and write their own short start prose instead. The task
drops the "flow-rules.md applies" line and every passage a step now holds.

Phase keys stay as they are today; `phases.rs` changes in the same task only where the spec renames or adds a phase.
A build flow ends with `[step: finish]`, `[step: decide]`, `[step: close]`. Every conductor task's expected result
includes "no warning left in this conductor's files" (its SKILL.md and the references it owns).

### Task 9: /build-feature

**Does:** makes /build-feature the first conductor built from steps, with its findings fixed.
**Depends on:** Task 5, Task 6, Task 7, Task 8
**Files:**

- Modify: `plugins/flows/skills/build-feature/SKILL.md`
- Modify: `plugins/flows/skills/build-feature/references/prior-art.md`, `plan-review.md` (tokens for models and tools)
- Modify: `plugins/flows/steps/*.md` (only what the first real composition shows is wrong)

**Adds:** nothing new
**Size:** ~250

- [ ] Rewrite per spec §7 `/build-feature`, with `## Phase 5: Evaluate` and `## Phase 7: Finish` as the headings
      (keys `evaluate`, `finish`): Brainstorm always offers the smallest option; a research run as input is linked as
      prior art and its Grounding reused (#23, #70); the dead `tdd` reference goes (#40). `[step: copyedit]`
      appears once (in Grill, before Gate 1) and `[step: plan-check]` once (in Plan); their text covers every later
      gate and edit, and Evaluate's own prose points back to them; `[step: before-you-write]` comes in through
      `requires:` and appears once.
- [ ] `npm run build:harnesses`; read the built Claude Code and Codex SKILL.md end to end; `npm test`,
      `npm run check:harnesses`, cargo test. Expected: PASS, rules plus Start under the budget (the build prints it),
      no warning left in the build-feature files.
- [ ] Commit: `Build /build-feature from flow steps.`

### Task 10: /implement

**Does:** makes /implement build a ticket or a given plan as given, never planning and never changing a plan.
**Depends on:** Task 9
**Files:**

- Modify: `plugins/flows/skills/implement/SKILL.md`
- Modify: `crates/flow-cockpit/core/src/doc/phases.rs` (`IMPLEMENT`: read, confirm (Gate 1), execute, finish)

**Adds:** nothing new
**Size:** ~120

- [ ] Rewrite per spec §1's example and §7 `/implement`: the ticket bar; a ticket is one task built by the main
      session (builder brief, files check against the gate's commit, a `Task 1` line); a given plan through
      `plan-check` with `--check`, gaps and stale paths named, no copyedit; the build-feature slug route with its
      edge cases; `template:` naming both run templates for check 3.
- [ ] Build, read both built files, `npm test`, `npm run check:harnesses`, cargo test. Expected: PASS.
- [ ] Commit: `Build /implement from flow steps: a ticket or a given plan, never planned and never changed.`

### Task 11: /fix

**Does:** makes /fix build from steps, prove its fix in a scratch worktree only, and record its choice.
**Depends on:** Task 10
**Files:**

- Modify: `plugins/flows/skills/fix/SKILL.md`
- Modify: `crates/flow-cockpit/core/src/doc/phases.rs` (`FIX`: reproduce, ground, cause (Gate 1), fix, prove, finish)

**Adds:** nothing new
**Size:** ~140

- [ ] Rewrite per spec §7 `/fix` (#10, #11, #18, #19, #51, #52, #53, #54, #56, #57, #83): systematic-debugging
      through its Phase 3 with the Phase 4 override marker; `Picked:` under Options; `[step: worktree]`;
      `[step: builder-brief]` inlined; Prove's full scratch recipe from `tests-all.md:25-27`; flaky proof by 20 runs;
      two failed proofs go to the user.
- [ ] Build, read both built files, `npm test`, `npm run check:harnesses`, cargo test. Expected: PASS.
- [ ] Commit: `Build /fix from flow steps and prove fixes only in a scratch worktree.`

### Task 12: /upgrade

**Does:** makes /upgrade take many packages, group small bumps, plan majors and big migrations in batches, and
always work on a branch behind a gate.
**Depends on:** Task 11
**Files:**

- Modify: `plugins/flows/skills/upgrade/SKILL.md`
- Modify: `crates/flow-cockpit/core/src/doc/phases.rs` (`UPGRADE`: research, impact (Gate 1), bump, finish, kept)

**Adds:** nothing new
**Size:** ~140

- [ ] Rewrite per spec §7 `/upgrade` (#32, #33, #34, #87, #88, #89): inputs and "everything outdated"; one-line
      confirmation; patch/minor-only in one area as one task built by the main session; majors and multi-area through
      `plan-shape`; bump and batch checks; batches for a framework migration; failed install stops. The phase keys
      stay `research`, `impact`, `bump`, `finish`.
- [ ] Build, read both built files, `npm test`, `npm run check:harnesses`, cargo test. Expected: PASS.
- [ ] Commit: `Build /upgrade from flow steps for many packages, with batched migrations and a gate on every upgrade.`

### Task 13: /refactor

**Does:** adds a conductor for local and restructuring refactors that keeps behaviour unchanged.
**Depends on:** Task 12
**Files:**

- Create: `plugins/flows/skills/refactor/SKILL.md`
- Modify: `plugins/flows/references/build-template.md` (`flow:` line and intro sentence gain `refactor`)
- Modify: `crates/flow-cockpit/core/src/doc/phases.rs` (`REFACTOR` list, `list()` arm, the test's skill list)
- Modify: `crates/flow-cockpit/core/tests/docs.rs` (`flow:` assertion gains `refactor`)

**Adds:** conductor `refactor`; `flow: refactor` (the flow set, #69)
**Size:** ~140

- [ ] Write it per spec §7 `/refactor`: Ground → Shape → Gate → Build → Finish; the test-edit rule and its own
      deviation class next to `[step: deviations]`; characterization tests in Test seams; the size recommendation at
      the Gate; red base stops and offers /fix; `template: references/build-template.md`.
- [ ] `node scripts/flows-uses.mjs`, build, read both built files, `npm test`, `npm run check:harnesses`, cargo test.
      Expected: PASS.
- [ ] Commit: `Add /refactor, built from flow steps, for refactors that keep behaviour unchanged.`

### Task 14: /research-feature

**Does:** makes /research-feature build from steps, ground before asking, and hand over cleanly.
**Depends on:** Task 9
**Files:**

- Modify: `plugins/flows/skills/research-feature/SKILL.md`
- Modify: `plugins/flows/skills/research-feature/references/literature.md`

**Adds:** nothing new
**Size:** ~120

- [ ] Rewrite per spec §7 `/research-feature` (#23, #24, #58, #59, #63): Frame grounds first and confirms the
      question; both reports are files with given paths, one strength scale, [source]/[inferred]; the handover
      (/learn, its Parking-lot lines with "do now, follow-up or drop", the Run verdict, `phase: done`) is
      research-feature's own prose, with no `[step: finish]`, `[step: decide]` or `[step: close]`.
- [ ] Build, read both built files, `npm test`, `npm run check:harnesses`, cargo test. Expected: PASS.
- [ ] Commit: `Build /research-feature from flow steps with grounding before questions and a clean handover.`

### Task 15: /review-code

**Does:** makes /review-code build from steps, ask its intent before any lens, and report every must-fix finding.
**Depends on:** Task 9
**Files:**

- Modify: `plugins/flows/skills/review-code/SKILL.md`
- Modify: `plugins/flows/skills/review-code/references/checks.md` (Decide section removed), `lenses.md`, `report.md`,
  `docs.md`, `tests-all.md` (points at `references/stack-packs.md`), `harden-all.md` (points at the deviations step)
- Move into `review-code/SKILL.md` or its references: flow-rules' Audits, Scope, Reports and the tob spec-compliance
  lines (#71)

**Adds:** target `pr <number>`
**Size:** ~260

- [ ] Rewrite per spec §7 `/review-code` (#2, #27, #28, #29, #30, #31, #45, #46, #49, #71, #75, #76, #77, #78, #79,
      #80, #81, #82, #84, #86), with one-word phase headings (the multi-word one becomes `Verify`): Phase 7 is
      `[step: gate]` (Gate 2), `[step: decide]`, then `[step: close]`, and its read-only `pr` target's own sentence
      skips close; Phase 5 Report holds `[step: gate]` (Gate 1), so the drawn table keeps both gates; no
      `[step: state]` or `[step: start]` (its own short start prose); it uses
      `[step: deviations]` for its fixes, writing into the audit template's Tasks, Rulings, Parking lot and
      Deviations; its `uses:` drops the `claude-code`, `claude-md-management@…` and `claude-security@…` entries,
      which the adapter and `watch-checks` tokens now carry; "called inline: stop after Phase 6"; the `pr` target
      read-only from `gh pr diff` with `gh pr checks`; combined small-diff lens on `{{model:strongest}}`; the audit table's `bucket` is its last column.
- [ ] Build, read both built files, `npm test`, `npm run check:harnesses`, cargo test. Expected: PASS.
- [ ] Commit: `Build /review-code from flow steps, settle intent before lenses and list every must-fix finding.`

### Task 16: /understand and /learn

**Does:** makes the two small conductors build from steps; /learn writes its lessons itself and parks ADRs and checks.
**Depends on:** Task 9
**Files:**

- Modify: `plugins/flows/skills/understand/SKILL.md`, `plugins/flows/skills/learn/SKILL.md`

**Adds:** nothing new
**Size:** ~120

- [ ] Neither uses `[step: state]` or `[step: start]`; each keeps its own short start prose.
- [ ] /understand per spec §7 (#62, #65, #66): `ground-code`; `teach` for Philosophy only, with its marker; the map
      in a scratch file outside the repo, named in the offered command.
- [ ] /learn per spec §7 (#14, #21, #22, #68): writes lessons itself in its own prose; the domain-modeling ADR marker;
      ADRs, checks and conductor fixes go to the Parking lot; standalone reads the conversation, `recall` only for a
      named past topic.
- [ ] Build, read both built files, `npm test`, `npm run check:harnesses`. Expected: PASS.
- [ ] Commit: `Build /understand and /learn from flow steps.`

### Task 17: writing and the copyedit path

**Does:** makes the copyedit find its script from any working directory on both harnesses, in neutral wording.
**Depends on:** Task 6
**Files:**

- Modify: `plugins/flows/skills/writing/SKILL.md` (defines `<flow-root>`), `references/copyedit.md`
- Modify: `plugins/flows/skills/writing/tests/writing-skill.test.mjs` (asserts on `steps/copyedit.md`)
- Modify: `tools/harness-compiler/src/transforms/text.ts` (the rewrite of `${CLAUDE_SKILL_DIR}` to `.` applies only
  to `packs/`)
- Modify: `plugins/flows/README.md` (a `/flows:writing copyedit` row, #74)

**Adds:** nothing new
**Size:** ~60

- [ ] `writing-skill.test.mjs`: replace line 31's assertion on `${CLAUDE_SKILL_DIR}/../writing/scripts/compare.mjs`
      with one on `node "<flow-root>/skills/writing/scripts/compare.mjs"`, and replace the test that reads
      flow-rules.md (lines 40-44) with one on `steps/copyedit.md`'s copyedit rule. Run it. Expected: FAIL on the
      first assertion until copyedit.md changes.
- [ ] copyedit.md: `node "<flow-root>/skills/writing/scripts/compare.mjs"` and `<flow-root>/skills/writing/SKILL.md`
      as the standard; line 24's agent sentence becomes neutral (one fresh agent on `{{model:strongest}}`, no
      `subagent_type`); writing/SKILL.md:239's "a fresh Opus agent" becomes "a fresh agent on
      `{{model:strongest}}`"; writing's SKILL.md defines `<flow-root>` for a standalone copyedit (#1, #12, #13). The
      `${CLAUDE_SKILL_DIR}` rewrite in `text.ts` is kept for `packs/` only, so the Codex pack files don't change.
- [ ] Build; from the repo root, run the built copyedit's `node` command with `<flow-root>` replaced by each built
      plugin folder on a scratch copy of `spec.md`. Expected: compare.mjs runs (exit 0, 1 or 2 with its own message,
      never "module not found"). `npm test`, `npm run check:harnesses`. Expected: PASS, no warning left in writing's
      files.
- [ ] Commit: `Anchor the copyedit's paths on the flows plugin folder so it runs on both harnesses.`

## Stage 4: remove the old pieces

### Task 18: Delete flow-rules, the host reference, and turn warnings into failures

**Does:** removes the shared rules file and the separate host file now that every conductor carries its rules, and
makes every built-text check fail the build.
**Depends on:** Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17
**Files:**

- Delete: `plugins/flows/references/flow-rules.md`, `tools/harness-compiler/src/templates/hosts.ts`
- Modify: `tools/harness-compiler/src/targets/claude-code.ts`, `codex.ts` (no `references/host.md`)
- Modify: `tools/harness-compiler/src/templates/codex.ts` (flows README stops citing flow-rules.md)
- Modify: `tools/harness-compiler/src/flows/compose.ts`, `test/compose.test.ts`, `test/build.test.ts` (check 5:
  built text naming `flow-rules`; every warning becomes a problem)
- Modify: `tools/harness-compiler/src/lint.ts`, `test/lint.test.ts` (flows phrase lint with `CLAUDE_ONLY` over
  `plugins/flows/steps/**`, `skills/**/*.md`, `references/**/*.md`, skipping override-marker lines, README.md out)
- Modify: `scripts/flows-uses.mjs`, `scripts/flows-uses.test.mjs` (`RULES_FILE` and its last reads go)
- Modify: `package.json` (`scan-skills` becomes two `scan-all` runs joined with `&&`: `plugins` as today, then
  `.claude-plugin/flows/skills`)
- Modify: `AGENTS.md` (63-66 and the flows section), `CLAUDE.md` if it names flow-rules, `plugins/flows/README.md`,
  `GLOSSARY.md` (Copyedit pass and Prose check entries name steps, not flow-rules)

**Adds:** check 5; the lint's flows phrase list
**Size:** ~360

- [ ] Write the failing tests: `compose.test.ts` check 5 and "a check-6 path is a problem"; `build.test.ts` "an
      unresolved `node` path makes `check()` return a problem"; `lint.test.ts`: `AskUserQuestion` in a fixture
      `plugins/flows/steps/x.md` is a problem, on an override-marker line it isn't, in `plugins/flows/README.md` it
      isn't; `flows-uses.test.mjs`: `checkTemplates` without flow-rules.md. Run them. Expected: FAIL.
- [ ] Implement check 5, move every warning to `problems`, add the phrase lint; delete the files; remove
      `references/host.md` emission; repoint `checkTemplates`.
- [ ] `grep -rn "flow-rules" plugins .claude-plugin .agents/plugins AGENTS.md CLAUDE.md README.md GLOSSARY.md`.
      Expected: no hits (check 5's own code and tests under `tools/` contain the string on purpose).
- [ ] Build (no warnings printed), `npm test`, `npm run typecheck`, `npm run check:harnesses`, lint, cargo test,
      and `npm run scan-skills` once. Expected: PASS.
- [ ] Commit: `Delete flow-rules.md and the separate host reference, and make every built-text check fail the build.`

### Task 19: Check every finding against the built text

**Does:** confirms each of the 93 findings is fixed in what agents actually read.
**Depends on:** Task 18
**Files:**

- Modify: `docs/features/flows-compose/evaluation.md` (a `fixed in` column: built file and line, or the reason it
  isn't)

**Adds:** nothing new
**Size:** ~100

- [ ] Start one fresh agent per finding group of spec §9 (6 groups, opus), each given evaluation.md's rows and the
      built Claude Code and Codex trees, never this plan; each returns per finding: fixed (built `file:line`), partly,
      or not fixed with why.
- [ ] Fix every partly or not-fixed one inside the task that owns it (a new commit on top), or record it as a
      deviation.
- [ ] Record the results in evaluation.md; record each conductor's token estimate in flow.md.
- [ ] Commit: `Record where each evaluation finding is fixed in the built conductors.`
