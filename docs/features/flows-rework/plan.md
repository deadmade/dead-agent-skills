# flows-rework Implementation Plan

> **For agentic workers:** execute task by task through the method chosen at Gate 2. Steps use checkbox (`- [ ]`)
> syntax for tracking.

<!-- glance -->

```
Plan: flows-rework · 12 tasks · ~2853 lines · 33 files
 1  [1 Record the skip decisio…]  [2 Borrow mattpocock `pr` …]  [3 Borrow `retro` and `cor…]  [5 glance.mjs]
 2  [4 Close the 13 decided up… ←1,2,3]  [6 Plan-time guards ←5]
 3  [7 Build-time guards and t… ←6]
 4  [8 Evaluate the built-in /… ←7]
 5  [9 The /review-code conduc… ←7,8]
 6  [10 Point every caller at /… ←9]
 7  [11 research-flow researche… ←10]
 8  [12 Rename feature-flow, re… ←11]

#   does                                                          files  adds                            size
1   stops the weekly sync from reopening issues for the five un…  2      nothing new (five list entrie…  ~10
2   makes the PR body open with a small picture of the change a…  1      nothing new                     ~8
3   lets a lesson land as a check that fails on the mistake, no…  1      one home, "check"               ~10
4   clears the issue list except the three whose ideas land lat…  0      nothing                         ~0
5   turns a plan's task lines into a short text picture at the …  3      `glance.mjs`: exported `glanc…  ~200
6   makes every plan state each task's new surface and size, sh…  5      nothing new beyond the prose    ~35
7   stops a build that grows past its task's size or adds surfa…  4      one flow.md section, **Parkin…  ~40
8   measures Anthropic's `/code-review` against what `/self-rev…  1      one doc                         ~60
9   adds one review conductor that picks its lenses from the di…  3      conductor `review-code` (SKIL…  ~500
10  switches the build flows and docs to /review-code and remov…  6      nothing new                     ~1550
11  turns the research conductor into a paper-and-sources study…  5      artifact `docs/features/<slug…  ~290
12  gives the three build conductors verb-noun names, keeping e…  2      nothing new                     ~150
```

<!-- /glance -->

**Goal:** fewer, clearer conductors that catch over-engineering, show plans at a glance and research without
benchmarks, plus a decision on every open upstream-skill issue.

**Architecture:** prose edits to `plugins/flows/` conductors and `flow-rules.md`, one script (`glance.mjs`), one
conductor (`review-code`) that replaces five, three renames last. Generated distributions rebuilt with every source
change.

**Tech Stack:** Markdown skills, Node 26 ESM (`node:test`), the harness compiler, flow-cockpit's Rust core tests.

**Spec:** [spec.md](spec.md) (plan review round 1 decisions folded in; see flow.md **Plan review**).

## Global Constraints

- Which review lenses run: resolved in `/review-code`'s lens table; never seen by the build conductors, which only call
  `/review-code`.
- A task's allowed size and new surface: resolved in the plan (`Adds:`/`Size:` per task); checked only by the files
  check and the task reviewer; never by implementers.
- The plan picture: resolved in `glance.mjs` from the plan's task lines; never drawn by hand by a model.
- `flow:` values stay `feature | research | fix`; only skill names change.
- `Size:` is one number, `~N`: added plus removed lines in the task's own **Files**, generated output excluded.
- Generated output is on every task's Files list and the files check ignores it: `.claude-plugin/**`,
  `.agents/plugins/**`, and what `node scripts/flows-uses.mjs` rewrites (`plugins/catalog.json`,
  `plugins/flows/plugin.json`'s `dependencies`, `plugins/flows/README.md`'s tree). A task that changes a conductor's
  set, `uses.json` or name runs `node scripts/flows-uses.mjs` before `npm test`.
- `plugins/` stays agent-neutral (`node tools/harness-compiler/src/cli.ts lint`); host specifics go in
  `tools/harness-compiler/src/templates/hosts/`.
- Every source change under `plugins/` ships with `npm run build:harnesses` output in the same commit.
- Any template, `## ` section or phase-table change runs `cargo test -p flow-cockpit-core --manifest-path
crates/flow-cockpit/Cargo.toml` (CI's path filter won't).
- Vendored files (stamped `Don't edit`) change only through `npm run sync -- apply <name>`; an
  `<!-- overrides <pack>/<path>: "<sentence>" -->` marker quotes the pack sentence exactly.
- `docs/` history (other runs' flow.md, plans, audits), cockpit fixtures copied from real runs (`flow-pane`, `web-mcp`),
  and the installer's old-plugin migration names stay as they are.
- Commit messages are one sentence, no co-author lines; stage with `git add -u` plus new paths by name.

## Review Focus

1. An old `flow: research` run (it has `## Hypothesis`; two are open): skipped when starting without an argument,
   named and stopped when its slug is given.
2. glance.mjs on a plan without `Depends on:` lines: one error naming the first such task, exit 1, no stack trace.
3. A Codex session running `/review-code`: no built-in `/code-review`, so the correctness lens takes the neutral
   default in lenses.md.
4. The cockpit's template and phase-table tests after the Parking lot, research and rename changes.
5. A conductor pointing at a deleted conductor: Task 10's grep finds none.
6. A plan task with no `Adds:`/`Size:` (fix-flow, upgrade, plans started before this): the surface and size checks
   don't apply to it.

---

## Stage 1: upstream issues

### Task 1: Record the skip decisions in the sync adapters

**Does:** stops the weekly sync from reopening issues for the five undecided mattpocock and tob skills.
**Depends on:** none
**Files:**

- Modify: `tools/upstream-sync/src/adapters/mattpocock.ts` (`SKIPPED`)
- Modify: `tools/upstream-sync/src/adapters/tob.ts` (`SKIPPED`)
  **Adds:** nothing new (five list entries)
  **Size:** ~10

- [ ] Add `engineering/implement-spec`, `engineering/pr`, `engineering/retro` to mattpocock's `SKIPPED`, and
      `patching-bugs`, `regression-hunt` to tob's, each with a short comment: `ideas in /integrate` (pr), `/learn`
      (retro), `/fix` (patching-bugs), `/review-code` (regression-hunt), `parallel implementers, no gates`
      (implement-spec).
- [ ] `npm test --workspace=@dead-claude-skills/upstream-sync`. Expected: PASS.
- [ ] Commit: `Skip the five undecided mattpocock and tob skills in the sync adapters.`

### Task 2: Borrow mattpocock `pr` into /integrate's PR body

**Does:** makes the PR body open with a small picture of the change and a one-line risk door.
**Depends on:** none
**Files:**

- Modify: `plugins/flows/skills/integrate/SKILL.md` (Phase 2)
  **Adds:** nothing new
  **Size:** ~8

- [ ] In Phase 2's body list, three items in our own words: the summary is the smallest visual that shows the change
      (a call tree, a before/after line, a tiny text diagram); a **Door** line, one-way (data, wire format, public API) or
      two-way, next to the blast radius it already names; before/after evidence (command and output) where behaviour
      changed.
- [ ] `npm run build:harnesses && npm test`. Expected: PASS.
- [ ] Commit: `Have /integrate's PR body lead with a small picture of the change and a door line.`

### Task 3: Borrow `retro` and `correct` into /learn

**Does:** lets a lesson land as a check that fails on the mistake, not only as a rule in a file.
**Depends on:** none
**Files:**

- Modify: `plugins/flows/skills/learn/SKILL.md` (Phase 2 homes)
  **Adds:** one home, "check"
  **Size:** ~10

- [ ] A **check** home (a test, lint rule or script) ranked above prose: prefer a structural fix, then a type, a
      check, a test, a doc line. A check is proposed with the past mistake it must fail on and how that was shown. A rule
      the run shows nobody followed is offered for removal or for turning into a check.
- [ ] `npm run build:harnesses && npm test`. Expected: PASS.
- [ ] Commit: `Let /learn keep a lesson as a check that fails on the mistake.`

### Task 4: Close the 13 decided upstream-skill issues

**Does:** clears the issue list except the three whose ideas land later (#58, #80, #81).
**Depends on:** Task 1, Task 2, Task 3
**Files:** none (GitHub only)
**Adds:** nothing
**Size:** ~0

- [ ] Show the user the 13 `gh issue close <n> -R deadmade/dead-agent-skills --comment "<decision>"` lines (text
      from the spec's Stage 1 table) and run them only on the user's yes.
- [ ] `gh issue list -R deadmade/dead-agent-skills --search "New upstream skill in:title" --state open`. Expected:
      #58, #80, #81 only.

## Stage 2: over-engineering guards and the plan picture

### Task 5: glance.mjs

**Does:** turns a plan's task lines into a short text picture at the top of plan.md.
**Depends on:** none
**Files:**

- Create: `plugins/flows/skills/feature-flow/scripts/glance.mjs`
- Test: `plugins/flows/skills/feature-flow/tests/glance.test.mjs`
- Modify: `package.json` and `flake.nix:49` (test globs), `AGENTS.md` (its list of test globs)
  **Adds:** `glance.mjs`: exported `glance(text: string): string` and `run(path: string): {code: number, out: string}`,
  a three-line CLI wrapper; no dependency
  **Size:** ~200

- [ ] **Failing tests** (`node:test`, inline plan strings):
  - `layers`: 1 (none), 2 (Task 1), 3 (Task 1), 4 (Task 2, Task 3) → `1  [1 a]`, `2  [2 b ←1]  [3 c ←1]`,
    `3  [4 d ←2,3]`.
  - fields follow `plan.rs` (`crates/flow-cockpit/core/src/doc/plan.rs:66-95`, `field_span` in `doc/mod.rs:181-195`):
    a field continues on following lines until a blank, bold or list line; Depends ids are the numbers after a
    `Task`/`Tasks` word, brackets dropped non-greedily. Forms: `none`, `Tasks 1 and 2`, `Task 7 (the Session tab's
layout), Task 8`, `Task 8c, Task 8d`, and the two-line `**Depends on:**` copied from
    `docs/features/cockpit-harness/plan.md:214-215` (→ `1, 2`, not `2-14`).
  - `labels`: a box shows `<id> <title cut to 24 chars>`; a layer wider than 110 chars wraps onto an indented line.
  - `table`: one row per task: `Does` cut to 60 chars, number of **Files:** bullets, `Adds`, `Size`; a missing
    `Adds:`/`Size:` shows `?`.
  - `header`: `Plan: <title without " Implementation Plan"> · <n> tasks · ~<sum of Size> lines · <sum of files>
files`; any `?` Size makes it `size unknown`. `Size:` is the first integer after `~`; any other shape throws
    naming the task.
  - `replace`: an existing `<!-- glance -->…<!-- /glance -->` block is replaced; with none, it goes after the first
    `# ` heading; text outside it is byte-for-byte unchanged.
  - `missing depends`: throws `Task 3: no **Depends on:** line`. `cycle`: throws naming the tasks. Lettered tasks
    (`8b`) sort after `8`.
- [ ] `node --test plugins/flows/skills/feature-flow/tests/glance.test.mjs`. Expected: FAIL (no module).
- [ ] Implement: parse `### Task <id>: <title>` and the five fields; layer = 1 + max layer of its dependencies;
      render header, layers and table in a fenced block between the markers. `run(path)` writes the file and returns the
      block, or the error message with `code: 1`; the CLI prints `out` and exits with `code` (tests call `run`, never spawn
      node).
- [ ] Tests PASS. Run it on this plan, on a copy of `docs/features/flow-observability/plan.md` and of
      `docs/features/cockpit-harness/plan.md`; read the three outputs.
- [ ] `npm run build:harnesses && npm test`.
- [ ] Commit: `Add glance.mjs, which draws a plan's task graph and table at the top of plan.md.`

### Task 6: Plan-time guards

**Does:** makes every plan state each task's new surface and size, shows the glance at Gate 2, and tells planners and
builders once to take the smallest change.
**Depends on:** Task 5
**Files:**

- Modify: `plugins/flows/skills/feature-flow/SKILL.md` (Phase 4, Gate 2 message, Phase 6)
- Modify: `plugins/flows/skills/implement/SKILL.md` (Phase 2, Phase 3)
- Modify: `plugins/flows/skills/fix-flow/SKILL.md` (Phase 4)
- Modify: `plugins/flows/references/flow-rules.md` (a Tests rule next to "TDD wins here")
- Modify: `plugins/default/rules.md`
  **Adds:** nothing new beyond the prose
  **Size:** ~35

- [ ] feature-flow Phase 4: below `Does:`/`Depends on:`, every task gets `**Adds:** <new files, types or classes,
exported functions, config keys or flags, dependencies | nothing new>` (the superset; `Interfaces: Produces` lists
      only what a later task consumes) and `**Size:** ~<lines>`. Every plan's Global Constraints get one line: "One
      implementation gets no interface; one caller gets no helper; no option nobody sets." After writing the plan and
      after every edit run `node <skill-dir>/scripts/glance.mjs <plan.md>`. Marker `<!-- overrides
superpowers/skills/writing-plans/SKILL.md: "Prefer smaller, focused files over large ones that do too much." -->`
      with: split a file only where `Adds:` already names the second unit.
- [ ] The surface and size checks apply to a task only when it has `Adds:`/`Size:` lines.
- [ ] Gate 2's message shows the glance block and the findings, plan.md linked, not pasted.
- [ ] Phase 6, implement Phase 3, fix-flow Phase 4: one clause each: "with flow-rules **ponytail at chosen steps**
      pasted into every builder brief". implement Phase 2 gets the Adds/Size lines and runs
      `<flow-root>/skills/feature-flow/scripts/glance.mjs`. upgrade gets none (its tasks are bumps).
- [ ] flow-rules, next to "TDD wins here": "Test behaviour at the seam the plan names, one test per behaviour the spec
      states; no tests of private helpers, the framework or the language. Review Focus tests count towards that."
- [ ] `plugins/default/rules.md`, one line: "Build only what the task needs: no file, abstraction, helper, option or
      fallback it doesn't call for; validate at trust boundaries, not between your own functions."
- [ ] `npm run build:harnesses && npm test`. Expected: PASS (markers checked).
- [ ] Commit: `Have plans state each task's new surface and size, and builders take the smallest change.`

### Task 7: Build-time guards and the fix proof

**Does:** stops a build that grows past its task's size or adds surface the plan didn't name, parks side ideas, and
proves a fix three ways.
**Depends on:** Task 6
**Files:**

- Modify: `plugins/flows/references/flow-rules.md` (**Deviations**: classes, brief clause, files check)
- Modify: `plugins/flows/skills/feature-flow/references/flow-template.md`, `plugins/flows/references/build-template.md`
  (`## Parking lot`)
- Modify: `crates/flow-cockpit/core/tests/fixtures/docs/{feature,build}.flow.md` (same section)
- Modify: `plugins/flows/skills/fix-flow/SKILL.md` (Phase 4)
  **Adds:** one flow.md section, **Parking lot**
  **Size:** ~40

- [ ] Add `## Parking lot` to both fixtures; `cargo test -p flow-cockpit-core --manifest-path
crates/flow-cockpit/Cargo.toml --test docs`. Expected: FAIL (templates lack it).
- [ ] Add it to both templates; the test PASSES.
- [ ] Deviation classes gain "a new type, exported function, flag, config key or dependency the task's `Adds:`
      doesn't list". "Private names and small cleanups inside the task's files aren't deviations" becomes: private names
      aren't; a cleanup or idea outside the task is one line under **Parking lot** (file and what), not done; the user
      picks at Finish.
- [ ] The task reviewer's brief gets the task's `Adds:` and `Size:`; it reports new surface not on `Adds:` as a
      deviation. Both checks apply only to a task that has those lines.
- [ ] Files check: `git diff --numstat <base> -- <the task's Files paths>` plus the untracked files' line counts; over
      twice `Size` is a deviation, recorded `deviation (size <n> of ~<Size>)`.
- [ ] fix-flow Phase 4, from trailofbits `patching-bugs`, in our own words: three runs (test fails before the fix,
      passes after, fails again with only the fix reverted); a fresh agent that never saw the fixer's work reruns them.
- [ ] `npm run build:harnesses && npm test`. Expected: PASS.
- [ ] Commit: `Make size overruns and unplanned surface deviations, park side ideas, and prove fixes three ways.`
- [ ] Show the user `gh issue close 80 …`; run on their yes.

## Stage 3: one /review-code

### Task 8: Evaluate the built-in /code-review (decision point)

**Does:** measures Anthropic's `/code-review` against what `/self-review` found on the same PRs, so the user decides
the correctness lens and the vendoring.
**Depends on:** Task 7
**Files:**

- Create: `docs/features/flows-rework/code-review-eval.md`
  **Adds:** one doc
  **Size:** ~60

- [ ] Two diffs whose self-review findings are written down with `file:line`:
  1. `fix/agent-browser-binary` at e564369 against its merge-base 06dc138 (before the fixes in 8a1cfcf); findings in
     `docs/features/agent-browser-review-fixes/flow.md` **Findings** only (the other agent-browser run reviewed
     8a1cfcf, code that doesn't exist at e564369).
  2. This branch after Task 7 against `origin/main`: run the old `/self-review` (still present) and write its report
     into the eval doc first.
     Earlier runs record only counts, so recall is compared on these two only; the doc says so.
- [ ] Per diff, in a throwaway worktree at that commit with a local `main` set to the diff's base (`git branch -f
main 06dc138` for diff 1), run `/code-review high` on the branch (no `--comment`, no `--fix`), and `/simplify`'s findings on diff 2 (discard its edits). Record: findings, matches with self-review's,
      new real ones (cited line read), false positives, agents, report length.
- [ ] Write the table and a recommendation. **Stop and ask the user** (host question tool): correctness lens =
      `/code-review` on Claude Code with ponytail-review's bug/risk/scale sections plus the regression rule elsewhere
      (vendored code-review and spec/standards files dropped), or the vendored `code-review.md` everywhere (spec/standards
      dropped). Record under **Options**. Task 9 waits on it.

### Task 9: The /review-code conductor

**Does:** adds one review conductor that picks its lenses from the diff and reports on one screen; the old five keep
working until Task 10.
**Depends on:** Task 7, Task 8
**Files:**

- Create: `plugins/flows/skills/review-code/SKILL.md`, `references/lenses.md`, `references/report.md`, `uses.json`
- Copy, override markers kept and references to the old conductors rewritten to `/review-code` phases: doc-audit's
  Claims and Mechanics → `references/docs.md`; test-audit's probes → `references/tests-all.md`; harden's
  security-domain, sharp-edges, bloat (`ponytail-audit`) and architecture passes → `references/harden-all.md`;
  verify's Checks and Decide → `references/checks.md`
- Modify: `tools/harness-compiler/src/templates/hosts/claude-code.md` (correctness lens = `/code-review`, if Task 8
  chose it)
  **Adds:** conductor `review-code` (SKILL.md, uses.json, 6 references); no agent, no script
  **Size:** ~500

- [ ] Frontmatter `disable-model-invocation: true`, description `Use for /review-code [branch|all] [base]`. uses.json
      is the union of the five old ones minus what no lens uses, `claude-security@claude-plugins-official` included.
- [ ] SKILL.md phases (each lens skill named here too, for `checkUses`): 1 Scope (flow-rules **Scope**), 2 Checks
      (checks.md; red stops, offer `/fix-flow`), 3 Lenses (lenses.md), 4 Verify findings, 5 Report (report.md) **Gate**,
      6 Fix (picks; one fresh fix-check agent), 7 Decide (checks.md's Decisions and `finishing-a-development-branch` from
      its Step 2).
- [ ] lenses.md, one agent per lens:

  | Lens        | Runs when                                                       | Brief                                                                                                                                                                                                                                                                                                                                                                   | Model  |
  | ----------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
  | correctness | always                                                          | default (every host): ponytail-review's Bug, Risk and Scale sections, or the vendored `code-review.md` (read at `skills/self-review/references/upstream/` until Task 10 moves it) if Task 8 kept it; the Claude Code adapter swaps in `/code-review` if Task 8 chose it. Plus: a finding needs a supported caller that reaches it; nothing reproduced is a coverage gap | sonnet |
  | lean        | always                                                          | ponytail-review's Lean section on the diff + `Adds:`/`Size:` against the plan when one exists                                                                                                                                                                                                                                                                           | opus   |
  | tests       | source or tests changed                                         | `flows:pr-test-analyzer` + the flow-rules Tests rule (missing and excessive)                                                                                                                                                                                                                                                                                            | sonnet |
  | docs        | docs, an instruction file, a documented command or path changed | docs.md + the host's instruction-file review                                                                                                                                                                                                                                                                                                                            | sonnet |
  | security    | input parsing, auth, network, files, processes, dependencies    | one agent following `security-review`                                                                                                                                                                                                                                                                                                                                   | opus   |
  | risk        | migrations, public API, wire formats, config, hot paths         | pstack `blast-radius` + locks/reversibility/backfill + performance                                                                                                                                                                                                                                                                                                      | opus   |

  `all` offers, each with a recommendation and its cost, run on the user's yes: tests-all.md, harden-all.md,
  claude-security, every doc claim. A diff of ≤3 files and ~50 lines runs the lenses inline, correctness still in one
  fresh agent.

- [ ] Phase 4: one fresh agent marks each finding `confirmed` (read the line, the failure follows) or `plausible`; one
      without a concrete failure scenario is dropped and counted.
- [ ] report.md: line 1 scope, line 2 verdict, line 3 lenses run and skipped (why); **Fix before merge** ≤5, **Worth
      doing** ≤5, each `# · file:line · what breaks, when · fix`; **Waiting on you**: every decision owed (Rulings,
      Deviations, `shortcut:` lines and the **Parking lot**; checks.md's Decisions list names all four), answerable from
      the reply alone. The full table in flow-rules **Reports** format (with `Picks:`/`Fixed <date>:`, which stay in
      flow-rules) always goes to `docs/audits/<date>-review-<scope>.md`; chat says how many more are there.
- [ ] `node scripts/flows-uses.mjs`; `npm run build:harnesses && npm test && node tools/harness-compiler/src/cli.ts
lint`. Expected: PASS.
- [ ] Commit: `Add /review-code, one review conductor that picks its lenses from the diff.`

### Task 10: Point every caller at /review-code and delete the old five

**Does:** switches the build flows and docs to /review-code and removes the five conductors and unused agents in
the same commit.
**Depends on:** Task 9
**Files:**

- Modify: `plugins/flows/skills/{feature-flow, fix-flow, implement, upgrade, integrate, learn}/SKILL.md`,
  `plugins/flows/references/{flow-rules,build-template}.md`, `plugins/flows/plugin.json` (description),
  `plugins/flows/README.md`, `AGENTS.md`, `README.md`, `GLOSSARY.md`, `THIRD_PARTY.md`,
  `tools/upstream-sync/src/adapters/{mattpocock,tob,simple}.ts` (comments naming `/harden`)
- Modify: `tools/upstream-sync/src/adapters/self-review.ts` (`SKILL` = `skills/review-code`, so LICENSE/UPSTREAM and
  `references/upstream/` land there; description prefix `Used by /review-code:`; the ownership stamp
  `by scripts/sync-self-review.mjs.` stays; `AGENTS` trimmed per Task 8), `tools/upstream-sync/src/sources.ts`
  (`paths`, the agent count, the `exists()` checks, the mattpocock sha and commit body when that file goes),
  `treefmt.toml`, `flake.nix:20` (vendored excludes), `plugins/flows/skills/writing/references/lesson-09-concision.md`
  only if its "self-review" means the conductor
- Move or delete per Task 8: `plugins/flows/skills/self-review/{references/upstream/, LICENSE, LICENSE-MIT, NOTICE,
UPSTREAM}`
- Delete: `plugins/flows/skills/{verify, test-audit, doc-audit, harden}/` and `self-review/SKILL.md`,
  `references/synthesis.md`, `uses.json`, then by hand whatever of `self-review/` the sync didn't move (the adapter
  never touches the old folder); the sync removes the agents no lens names (`code-simplifier`, `comment-analyzer`,
  `type-design-analyzer`, `silent-failure-hunter`) once they leave `AGENTS`
- Modify: the moved `NOTICE` (hand-written; its "/self-review vendors…" line names the new conductor)
- Modify: `crates/flow-cockpit/core/tests/fixtures/docs/build.flow.md` if a `build-template.md` heading changes
  **Adds:** nothing new
  **Size:** ~1550

- [ ] Each `/verify` call → `/review-code branch` (spec as intent); each `/self-review`, `/test-audit`, `/doc-audit`,
      `/harden` → `/review-code` or `/review-code all`.
- [ ] Order: commit the adapter and `sources.ts` edits first, then on that clean tree run `npm run sync -- apply
self-review` (it pulls both upstreams' newest; note any drift for the PR), then the caller edits and the deletions
      above, then `node scripts/flows-uses.mjs`. Re-enter `nix develop` for the new excludes.
- [ ] `git grep -nE '/self-review\b|/verify\b|/test-audit\b|/doc-audit\b|/harden\b|skills/(verify|self-review|test-audit|doc-audit|harden)/'
-- ':!docs' ':!.claude-plugin' ':!.agents' ':!tools/installer' ':!plugins/flows/packs' ':!plugins/opt-in'
':!crates' | grep -v 'adapters/self-review'` returns nothing (the adapter keeps its file name, which `sources.ts`,
      `THIRD_PARTY.md` and the README name; ownership stamps say `sync-self-review.mjs`).
- [ ] `npm run build:harnesses && npm test && npm run check:harnesses`; `cargo test -p flow-cockpit-core
--manifest-path crates/flow-cockpit/Cargo.toml`. Expected: PASS.
- [ ] Commit (with the sync's output): `Point the build flows at /review-code and remove the five conductors it
replaces.`
- [ ] Show the user `gh issue close 58 …` and `81 …`; run on their yes.

## Stage 4: research-feature content

### Task 11: research-flow researches and recommends, nothing more

**Does:** turns the research conductor into a paper-and-sources study that ends in a decision report and an offer to
build.
**Depends on:** Task 10
**Files:**

- Modify: `plugins/flows/skills/research-flow/SKILL.md`, `uses.json`, `references/research-template.md`,
  `references/literature.md`
- Modify: `plugins/flows/skills/feature-flow/SKILL.md` (Phase 1: a handed-over research.md is the prior-art report)
- Modify: `crates/flow-cockpit/core/src/doc/phases.rs` (`RESEARCH`), `crates/flow-cockpit/core/tests/docs.rs`
  (research expectations: one gate, no Tasks/Rulings/Deviations), `crates/flow-cockpit/core/tests/fixtures/docs/
research.flow.md` (it mirrors the template, so it takes the new shape)
- Modify: `plugins/flows/README.md:10`, `plugins/flows/references/flow-rules.md:27,71`, `AGENTS.md:63` (where
  research is described as a build flow)
- Modify: `scripts/flows-uses.mjs` + `scripts/flows-uses.test.mjs` (research template gets its own need-list: gate
  line, `Picked:`, `now:`)
  **Adds:** artifact `docs/features/<slug>/research.md`
  **Size:** ~290

- [ ] Tests first: `RESEARCH` = `("frame", None), ("search", None), ("weigh", None), ("report", Some(1))`; docs.rs's
      research expectations and the new fixture; the flows-uses need-list. Run `cargo test -p flow-cockpit-core
--manifest-path crates/flow-cockpit/Cargo.toml` and `node --test scripts/flows-uses.test.mjs`. Expected: FAIL.
- [ ] SKILL.md, standalone: 1 **Frame**: the question, constraints, what would decide it, plus feature-flow Phase 1's
      codebase grounding; 2 **Search**: literature and prior-art agents in one message, literature.md widened to
      engineering sources (vendor docs, postmortems, other projects' designs) with prior-art.md's source check; 3
      **Weigh**: grilling on the options against the evidence; 4 **Report**: `research.md` (question, evidence table, 2–4
      options with trade-offs for this codebase, recommendation, open questions), copyedited, **Gate 1** on it; then offer
      `/feature-flow` with it as input. No hypothesis, plan, build or measurement; uses.json gains `grilling`.
- [ ] Resume: a `flow: research` run with `## Hypothesis` was started by the old conductor. Without an argument it
      is skipped (one line names it); with its slug, name its phase and stop. The SKILL.md still names `general-purpose`,
      `search` and `paper-lookup` (for `checkUses`).
- [ ] research-template.md: phases `frame | search | weigh | report | done`; sections Request, Artifacts, Gates (one),
      Grounding, Evidence, Options, Run verdict.
- [ ] Tests PASS; `node scripts/flows-uses.mjs && npm run build:harnesses && npm test && npm run check:harnesses`.
- [ ] Commit: `Refocus the research conductor on papers and sources, ending in a decision report.`

## Stage 5: renames

### Task 12: Rename feature-flow, research-flow and fix-flow

**Does:** gives the three build conductors verb-noun names, keeping every old run resumable.
**Depends on:** Task 11
**Files:**

- Move: `plugins/flows/skills/{feature-flow → build-feature, research-flow → research-feature, fix-flow → fix}/`
  (frontmatter `name:`, `Use for /…`)
- Modify: every reference found by `git grep -lE 'feature-flow|research-flow|fix-flow' -- ':!docs' ':!.claude-plugin'
':!.agents' ':!tools/installer' ':!crates/flow-cockpit/core/tests/fixtures'`, including `scripts/flows-uses.mjs`
  (`TEMPLATE_FILES`, `PLAN_FILES`) and its test, `package.json`/`flake.nix`/`AGENTS.md` (glance test glob),
  `crates/flow-cockpit/app/shell/start-form.js` (`FLOW_SKILL`) and its test, `crates/flow-cockpit/core/src/doc/phases.rs`
  (comments, test table), `crates/flow-cockpit/core/tests/docs.rs` (template paths)
  **Adds:** nothing new
  **Size:** ~150

- [ ] Update `start-form.test.mjs` and the `phases.rs` test table first; run `node --test
crates/flow-cockpit/app/shell/start-form.test.mjs` and `cargo test -p flow-cockpit-core --manifest-path
crates/flow-cockpit/Cargo.toml phase_lists_match`. Expected: FAIL.
- [ ] `git mv` the folders; update every reference from the grep.
- [ ] Both tests PASS; the grep returns nothing; `node scripts/flows-uses.mjs && npm run build:harnesses && npm test
&& npm run check:harnesses`.
- [ ] Commit: `Rename feature-flow, research-flow and fix-flow to build-feature, research-feature and fix.`

## Verification (Phase 7)

- `npm test`, `npm run typecheck`, `npm run check:harnesses`, harness lint, `cargo test -p flow-cockpit-core
--manifest-path crates/flow-cockpit/Cargo.toml`, `node --test crates/flow-cockpit/app/shell/*.test.mjs`.
- `node plugins/flows/skills/build-feature/scripts/glance.mjs docs/features/flows-rework/plan.md` regenerates this
  plan's block.
- Read the worktree's `plugins/flows/skills/review-code/SKILL.md` and follow it on this branch (`review-code branch`):
  one screen, lenses named, report file written.
- AGENTS.md and CLAUDE.md read against the new conductor list. The PR's door line names the stale Windows cockpit
  binary (old skill names until the installer reruns).
