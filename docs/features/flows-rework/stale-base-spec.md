# flows-rework: spec

This spec was approved at Gate 1 on 2026-11-03 (plan mode approved this text). Its stage outlines give the shape of
the plan; they are not the plan.

## Seam lines (go verbatim into the plan's Global Constraints)

- Which review lenses run: resolved in `/review-code`'s lens table. The build conductors never see it; they only call
  `/review-code`.
- A task's allowed size and new surface: resolved in the plan (`Adds:`/`Size:` per task). Only the files check and the
  task reviewer check them; implementers never do.
- The plan picture: resolved in `glance.mjs` from the plan's task lines. No model draws it by hand.
- `flow:` values stay `feature | research | fix`; only skill names change.

## Stage 1: upstream issues (decide, record, close)

| #  | Skill | Decision | Where an idea lands |
| -- | ----- | -------- | ------------------- |
| 9 | implement-spec | skip: parallel implementers, no gates | — |
| 10 | pr | borrow | `/integrate` PR body: one-line door (one-way/two-way), smallest visual of the change, before/after evidence |
| 11 | retro | borrow | `/learn`: a lesson can land as a **check** (test, lint, script) instead of a rule; prune rules that never fired |
| 13 | benchmark-checklist | skip: research no longer benchmarks | — |
| 14 | correct | borrow, with #11 | `/learn`: order of homes (structure → types → check → test → docs); a check must fail on the past mistake |
| 15 | poteto-help | skip: Cursor-only router | — |
| 16 | principle-explain-the-number | skip: no measurement left in research | — |
| 56, 59 | formal-verification pair | skip: niche, writes skills into repos | — |
| 57 | in-your-own-words | skip: build-feature stays as is | — |
| 58 | ketchup | borrow | `/review-code` report and gate messages: every call waiting on the user listed, decidable from the reply alone |
| 60 | sharpen | skip: invites scope growth | — |
| 76 | ketchup-video | skip: needs a video renderer | — |
| 77 | statechart | skip: Java/TLA+, POSIX only | — |
| 80 | patching-bugs | borrow | `/fix`: three-arm proof (test fails before, passes after, fails again with only the fix reverted); a fresh validator that never saw the fixer's transcript |
| 81 | regression-hunt | borrow | `/review-code` correctness lens: a finding counts only when a supported caller reaches it; "nothing reproduced" is a coverage gap, not a pass |

- The pstack issues are already in `SKIPPED`. The mattpocock and tob skills go into their adapter's `SKIPPED`
  (`tools/upstream-sync/src/adapters/{mattpocock,tob}.ts`), each with a comment that names where the borrowed idea
  lives.
- Close each of the 16 issues with a one-line comment that names its decision. Close #58, #80 and #81 only once the
  stage that borrows from them has landed. Closing issues is outward-facing, so I ask you before running the
  `gh issue close` commands.

## Stage 2: over-engineering guards and the plan picture

Prevent at plan time:

- A writing-plans override makes every task carry `**Adds:**` (new files, types/classes, exported functions, config
  keys or flags, dependencies) and `**Size:** ~N lines`. Global Constraints gain three lines: one implementation gets
  no interface; one caller gets no helper; no option nobody sets. These override writing-plans' "prefer smaller, focused
  files", marked with an `<!-- overrides -->` marker.
- Name ponytail's **Before you write** and **The smallest complete change** in build-feature Phase 4/6, `/implement`
  and `/fix`. flow-rules already has the table, but no conductor step names it today.
- `plugins/default/rules.md` gains two lines, in our own words, from Anthropic's overeagerness guidance: no file,
  abstraction, helper or option the task doesn't need; validate only at trust boundaries.
- Tests get one flow-rules rule, kept next to TDD: test behaviour at the seam the plan names, one test per behaviour in
  the spec, and no tests of private helpers or of the framework. This rule caps the extra tests in writing-plans'
  Review Focus.

Catch while building:

- The files check also runs `git diff --numstat <base> -- <the task's Files>`, with generated output excluded. A change
  of more than 2× the task's `Size`, or a file not on its list, is a deviation (the fifth stop). The task reviewer gets
  the `Adds:` list and reports a new type, export, flag or dependency not on it as a deviation, not a quality note.
  (The API-client case: 8 classes against an `Adds:` of one.)
- The rule "Small cleanups inside the task's files aren't deviations" becomes a **Parking lot** section in flow.md:
  such cleanups are noted, not done, and the user picks from them at Finish.

The plan picture is `glance.mjs`, in build-feature's `scripts/`, with its node:test tests in build-feature's `tests/`;
the plugin's catalog `resources` don't ship a top-level `scripts/`.

- It reads plan.md's `### Task N`, `Does:`, `Depends on:`, `Files:`, `Adds:`, `Size:` lines (the format flow-cockpit's
  `plan.rs` already parses) and writes an **At a glance** block between `<!-- glance -->` markers at the top of
  plan.md. The block is plain text, which agents and the terminal both read:

  ```
  Plan: checkout-webhooks · 6 tasks · ~400 lines · 9 files · adds 2 types, 1 flag
   1  [1 schema]
   2  [2 handler ←1]  [3 signer ←1]
   3  [4 retry ←2,3]  [5 docs ←2]
   4  [6 e2e ←4]
  #  does                     files  adds          size
  1  webhook table + model    2      type Webhook  ~60
  ...
  ```
- It runs when the plan is written and again at Gate 2; the gate message shows the block, not the plan.
- A task missing `Depends on:` fails the script, which names the task. Today's plans miss that line.

## Stage 3: one `/review-code`

(The skill is named `review-code`, not `review`, because Claude Code's built-in `/code-review` already answers to
`/review`.)

- Step 0, before anything else: evaluate Anthropic's built-in `/code-review` (and `/simplify`) on two diffs
  whose `/self-review` findings are written down with `file:line`: PR #68's branch before its fixes, and this branch
  after the guards land (earlier runs record only counts). Compare real findings,
  false positives, agent count and report length. The evaluation decides one thing: whether `/code-review`, called
  through the Skill tool at a fixed effort level, becomes the correctness lens, or our own lens stays. You see the
  comparison before stage 3's tasks start; that is a decision point in the plan.
- `/review-code [branch|all] [base]` replaces `/test-audit`, `/doc-audit`, `/harden`, `/self-review` and `/verify`.
  Build flows call it at Finish.
- It runs the repo's checks first (tests, lint, build). If a check is red, it stops and offers `/fix`.
- Lenses:
  - Always: correctness, and lean (ponytail-review on the diff plus the `Adds:` comparison).
  - Whenever source or tests changed: tests, both missing and excessive.
  - When the diff touches them: docs, security (one agent following `security-review`; claude-security only under
    `all`), migrations, public API (`blast-radius`), performance.
  - `all` adds mutation testing, property tests and architecture, each on your yes.
- Each lens gets at most one agent; then one verifier pass marks each finding confirmed or plausible. A finding without
  a concrete failure scenario is dropped.
- The output is one report that fits one screen in chat: a verdict line, the lenses run and skipped, at most 5 **Fix
  before merge** items, at most 5 **Worth doing** items, then **Waiting on you** (rulings, parking lot, shortcuts: the
  old Decisions gate). Everything else goes only to `docs/audits/<date>-review-<scope>.md`. You pick items by number,
  as today.
- The five conductors' folders are deleted once every caller points at `/review-code`, in the same commit. Their method
  text moves unchanged into `review-code/references/`. Agents that no lens uses are deleted.
- The evaluation decides what stays vendored:
  - If `/code-review` wins, the vendored code-review and spec/standards files go; the other hosts' correctness lens is
    ponytail-review's bug, risk and scale sections plus the regression rule; and the sync keeps only
    `pr-test-analyzer`.
  - If ours wins, `code-review.md` stays and the rest goes.
- The lean lens checks only bloat (ponytail-review's Lean section plus `Adds:`/`Size:`). Under `branch`, the security
  lens is one agent following `security-review`; claude-security runs only under `all`, on your yes, with its cost
  named.
- flow-cockpit needs no change: `entries.rs` already files an unknown audit name under its first word, `review`.

## Stage 4: research-feature and the renames

- `/research-feature` (was research-flow) runs these steps in order:
  - Frame the question.
  - Search, with the literature agent widened to engineering sources (vendor docs, postmortems, other projects) and
    with prior-art.md's source check.
  - Grill the options.
  - Write `research.md`: the question, an evidence table, 2–4 options with trade-offs for this codebase, a
    recommendation and open questions.
  - **Gate** on the report.
  - Offer `/build-feature` with research.md as its prior art.

  It has no hypothesis, plan, build or measurement. An old-format run (one that has `## Hypothesis`) is skipped when
  `/research-feature` starts without an argument; when its slug is given, the run is named and the skill stops.
- Renames: feature-flow becomes `build-feature`, research-flow becomes `research-feature`, and fix-flow becomes `fix`.
  The `flow:` values stay. The renames touch about 26 source files plus generated copies, flow-cockpit's
  `start-form.js` map and its tests. The `docs/` history and the installer's old-plugin migration names stay.
- build-feature's workflow is unchanged beyond stage 2's lines.

## Out of scope

- understand
- writing
- upgrade
- implement's workflow
- flow-cockpit features
- an Artifact plan page (it can come later from the same glance data)
- fixing #101

## Verification

- Run `npm test` (flows-uses override markers, glance.mjs tests, copyedit/prose tests); `npm run build:harnesses`, then
  `npm run check:harnesses`; `harness-compiler lint`; and flow-cockpit's `cargo test` for the touched parser and
  start-form.
- Run glance.mjs on three existing plans (after adding `Depends on:` to a copy of each) and read the output in the
  terminal.
- Do a `/review-code branch` dry run on this feature's own branch: the report fits one screen, names its lenses, and is
  written to its report file.
- Grep: no `feature-flow`/`research-flow`/`fix-flow`/`self-review`/`verify` skill references remain outside `docs/`
  and the installer migration list.
- CLAUDE.md and AGENTS.md are updated for the new conductor list (the session-start rule).
