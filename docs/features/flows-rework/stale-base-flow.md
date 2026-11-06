---
flow: feature
phase: execute
now: Gate 2 passed (native); setting up the worktree and starting Task 1.
---

# flows-rework: flow

## Request

Hey, this feature needs two things for you. First we need to audit all the current issus with the new upstram skills and decide if it makes sense to include them in some sort of form. Second we need to change the flows a bit in my opinion. First feature flow I really like the workflow we shoudnt really change it. research-flow should primarly be focues around researching academic papers, other sources etc for a new archiecture, etc. For example how to split databases per customer but it should not provide a benchmark thats a bit annoying. For the three skills with the name flow we should find a better naming convention. What I lack about them is there is a lot of text I need some sort of visulization of the planb that is proper and easy to understand. Without it, its just so hard to read them. understand is also quite good dont want to change something here really. Writing is also okay not 100% sure what to thinbk here for now maybe later but then come the review audit stuff. I just dont like them. They are in my opinion to many but also just one is completly overwhelming to read and I feel its also missing stuff possible. Also I feel like claude still overenigiees quit a lot and nothing catches or prevents it.

## Artifacts

- Prior art: this file, **Prior art**; upstream copies in the session scratchpad (not kept).

- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs:
- Glossary:

## Gates

- Gate 1, spec approved: 2026-11-03 (approved as the plan-mode plan file, which held the spec). Reopened 2026-11-03:
  plan review D1 (`/review` → `/review-code`), D3 (lean and security lens scope), D4 (vendoring decided by the eval).
  Re-approved 2026-11-03 through the user's answers to D1, D2+D3, D4.
- Gate 2, plan approved: 2026-11-03, execution: native

## Skipped

- Grill as a separate phase: folded into the brainstorm's two question rounds, since the session ran in plan mode.
  The spec records each settled decision.

## Grounding

**Upstream issues.** All 11 pstack skills (#13–16, #56–60, #76, #77) are already in `SKIPPED`
(`tools/upstream-sync/src/adapters/pstack.ts`, commit 84f4233, #96); their issues are stale, nothing closes them.
Undecided: mattpocock implement-spec/pr/retro (`adapters/mattpocock.ts`), tob patching-bugs/regression-hunt
(`adapters/tob.ts`; its adapter copies only `plugins/<s>/skills/<s>`, so neither vendors as is). pstack stays pinned at
`519d36a` (#101, left alone on purpose). Prior analysis: `docs/features/skill-composition/skill-map.md`.

**Review/audit conductors.** test-audit, doc-audit, harden, self-review, verify (+ integrate, learn). verify stacks
self-review's report + doc-audit's table + optional test-audit's table + its verdict table + Decisions: 3–4 numbered
lists per run. self-review alone is ~12–16 agents + scorers. Duplicates: tests (3 places), spec compliance (5),
security (3), CLAUDE.md (4). Gaps on the default verify path: lean/over-engineering on the built code (ponytail-review
runs only in harden and on the plan), performance/scale, dead code, migration safety, API compatibility.
self-review/verify reports live only in chat. Audit files are parsed by flow-cockpit by name
(`crates/flow-cockpit/core/src/index/entries.rs:31,313-328`).

**Over-engineering guards.** All advisory prose except the files check (`flow-rules.md`, files outside a task's
**Files** list). Nothing measures size or new surface (classes, exports, config keys). ponytail's "Before you write" /
"smallest complete change" pastes aren't named in any conductor step. `plugins/default/rules.md` has no scope rule.
writing-plans pushes towards structure ("smaller, focused files", an Interfaces block per task). code-simplifier keeps
abstractions. TDD overrides ponytail's no-test-for-trivial rule.

**Plans.** 15 plans run 252–935 lines; none has a diagram. feature-flow tasks carry `Does:`/`Depends on:`, which
flow-cockpit's parser (`crates/flow-cockpit/core/src/doc/plan.rs:14-57`) already turns into a graph. Cockpit not in use.

**research-flow.** feature-flow plus a frozen measurable hypothesis, baseline/repeat measurement tasks and a Validate
phase (`plugins/flows/skills/research-flow/SKILL.md:72-114`). Literature agent: papers only, no source check.

**Rename cost.** feature-flow 67 files, research-flow 36, fix-flow 43 (≈26 source + generated copies; `docs/` history
left alone). State files key on `flow: feature|research|fix`, not skill names, so keeping those values breaks no run.
flow-cockpit maps `flow:` → skill (`app/shell/start-form.js:20-23`). Old plugin name `feature-flow` in installer
migration code stays.

## Prior art (fetched 2026-11-03)

- Google eng-practices, what reviewers look for: design first, then functionality, complexity ("be especially
  vigilant about over-engineering"), tests ("tests are also code that has to be maintained"), naming, comments, docs.
  https://google.github.io/eng-practices/review/reviewer/looking-for.html
- AI review noise: bots posting 12–25 comments per PR get ignored; fixes are callers in context, every finding states
  when it breaks, severity and confidence split with deterministic thresholds, no repeats.
  https://dev.to/nouman_qureshi_dd9fc28a5a/why-developers-mute-ai-code-reviewers-and-what-i-changed-to-stop-it-1pjh,
  https://diffray.ai/blog/why-developers-ignore-ai-code-review-tools/ (vendor blogs, weak evidence)
- Diff budget per task + parking lot for out-of-scope ideas ("instructions describe intent; a guarantee needs a
  mechanism"). https://dev.to/yureki_lab/how-i-stopped-my-ai-coding-agents-scope-creep-with-a-diff-budget-47lj
- Anthropic prompting guide, "Overeagerness": Opus models create extra files, abstractions, flexibility; sample
  scope/abstraction block. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Plan views: Kiro (tasks sequenced by dependency, linked to requirements) https://kiro.dev/blog/introducing-kiro/ ;
  Cursor 2.2 plan mode inline diagrams https://cursor.com/changelog/2-2
- Upstream skill sources: mattpocock `4ae2317`, cursor/plugins `ae5650f`, trailofbits `711af09` (per-skill URLs in
  the audit table below).

## Options

### Plan view
Picked: plain-text At a glance block generated by a script (agents read it as well as people).
Offered: Artifact page (recommended first; user: interesting, but wants it where agents read it), Mermaid in plan.md
(user: messy), terminal summary, flow-cockpit (user: not ready).

### Reviews
Picked: one `/review-code` replacing five conductors, after evaluating Anthropic's `/code-review` as its correctness lens.
Offered: one `/review` (recommended), `/review` + `/audit`, keep the five with shorter output.

### Names
Picked: `build-feature`, `research-feature`, `fix`. Offered: verb-noun (recommended: build-feature, research-design,
fix-bug), nouns, a `flow-` prefix.

### Research output
Picked: decision report, then offer build-feature. Offered: report (recommended), report + ADR, report then build.

### Scope
Picked: one spec, staged plan (4 stages, each mergeable alone). Offered: separate runs, one plan/one PR.

## Plan review

### Round 1 (2026-11-03): Correctness (fable), Fit (opus), Simpler (sonnet)

No blocking findings. Merged into decisions (D) and mechanical fixes (M); none dropped.

- D1 `/review` collides with Claude Code's built-in `/code-review` alias `review` (Fit, read from the 2.1.317 binary);
  Codex may ship a `/review` too (Correctness, unverified).
- D2 Task 10 deletes five conductors whose method text its lens briefs cite, and leaves callers pointing at deleted
  folders until Task 11 (Simpler, Correctness, Fit).
- D3 Lean lens runs all of ponytail-review and overlaps four lenses; security lens via claude-security is a many-agent
  pipeline, not one agent (Simpler).
- D4 Vendored self-review pipeline kept unconditionally against the spec; `silent-failure-hunter` used by no lens;
  the adapter stamps `Used by /self-review` (Simpler, Fit, Correctness).
- D5 Renames placed first, ahead of everything that fixes the user's complaints (Simpler).
- M1 Size check counts the generated copies (3×): scope `git diff --numstat` to the task's Files (Simpler).
- M2 Cockpit template tests (`crates/flow-cockpit/core/tests/docs.rs:337-410`) break on Parking lot and the research
  template; `npm test` and the CI path filter don't run them (Fit ran it: fails). Add docs.rs + fixtures to Tasks 8,
  11, 12, run `cargo test -p flow-cockpit-core`.
- M3 `checkTemplates` fails on the research template (Fit ran it); research template gets its own need-list.
- M4 Old research runs at `phase: grill` resume into the new Grill: rename the new phase `weigh`, detect the old
  template by `## Hypothesis`.
- M5 `checkUses` reads SKILL.md only: review's SKILL.md names every lens skill; `research-feature/uses.json` in Task 12.
- M6 Moving **Reports** out of flow-rules breaks `checkTemplates` and the cockpit's `Picks:`/`Fixed` parse: keep those
  lines in flow-rules.
- M7 Vendored files regenerate only through the sync: change the adapter's stamp to the new conductor and run
  `npm run sync -- apply self-review`; fix `sources.ts` paths and count; formatter excludes move with the files.
- M8 Greps in Tasks 5 and 11 hit cockpit fixtures, adapter comments, NOTICE, plugin.json: add excludes and list the
  rest.
- M9 16 issues, not 15; close #58, #80, #81 only after their stage lands.
- M10 glance.mjs: one Depends regex matching `plan.rs` (`Tasks 1 and 2`, parentheticals, `8b`), implement uses
  `<flow-root>/skills/build-feature/scripts/glance.mjs`, test glob also in `flake.nix:49`, upgrade gets no Adds lines.
- M11 Task 7 says the same rule three ways: `Adds:` is the superset, `Interfaces: Produces` only lists what a later
  task consumes; the no-interface rule lives in Global Constraints and rules.md only.
- M12 Record the spec changes: entries.rs needs no change (its fallback yields `review`); glance.mjs lives under the
  skill folder because catalog `resources` don't ship `plugins/flows/scripts/`.
- Decisions 2026-11-03: D1 `review-code`; D2+D3 all four fixes; D4 decide by the eval; D5 renames last. M1-M13
  applied as recommended.
- M13 `cargo test -p flow-cockpit-core` instead of the whole workspace (Tauri needs GTK); Task 9 drops its Task 5
  dependency; the PR's door line names the stale Windows cockpit binary.

#### Round 1 fix check and fresh eyes (2026-11-03)

- Fix check (sonnet): D1-D5 and M1-M7, M9-M13 PASS; M8 FAIL (Task 10's grep expectation). Gaps it found: flows-uses
  regeneration in Tasks 10-12, Task 8's candidates hold no finding text, the sync needs a clean tree and a new
  `SKILL` path, spec lag, research described as a build flow in README/flow-rules/AGENTS, Task 10's size, review-code
  frontmatter, "brief clause" wording, the stale glance note.
- Fresh eyes (fable): no blocking; Size grammar, wrapped Depends lines, generated output vs the files check, Task 8
  candidates, two open old research runs stop a bare start, Task 10 grep leftovers, the vendored brief's path between
  Tasks 9 and 10, glance header fields.
- Fresh eyes (opus): blocking: Task 8 compared PRs squash-merged into #96 whose findings were never written down.
  Should-fix: generated output vs the files check, Task 10 grep and sync steps, glance parsing/labels/Size, Parking
  lot not shown at Finish, Adds/Size checks for flows without them, no home for the Codex fallback.
- All applied (rulings, mechanical): Task 8 evaluates PR #68 at e564369 (findings recorded with file:line) and this
  branch after Task 7 (old /self-review still present), so Task 8 now depends on Task 7; generated output is on every
  Files list; `Size:` is one number; glance follows plan.rs's field and Depends rules with labelled boxes; the
  sync runs on a clean tree with `SKILL` = `skills/review-code`; grep tightened to skill calls; the correctness
  default lives in lenses.md; Parking lot named in Waiting on you; Adds/Size checks apply only where the lines exist;
  old research runs skipped without an argument. Spec edited to match (numstat scope, tests lens trigger, security
  lens, old research runs).

- Final fix check (opus, 2026-11-03): no blocking findings; every applied item PASS except three small ones, now
  fixed: Task 4 `Size: ~0`; Task 8 diff 1 compared only with agent-browser-review-fixes' findings, base 06dc138 set
  as local `main` in the worktree; Task 10's grep filters the adapter's own file name, and the moved NOTICE is edited
  by hand.

- Copyedit (2026-11-03): spec.md edited and applied (`compare.mjs` exit 0, diff read, no meaning lost; one stale
  line about the evaluation then corrected by hand). plan.md refused: `compare.mjs` exit 1, "quote: **For agentic
  workers:** ..." (the editor reworded the blockquote); plan.md stays unedited.

## Tasks

## Rulings

- 2026-11-03: the docs lookup on built-in `/code-review` was stopped by the user mid-run — its evaluation became stage
  3's first step, run on real branches — costs: stage 3's lens design waits on it.

## Parking lot

## Deviations

## Walkthrough

| spec goal | plan task | file:line | test |
| --------- | --------- | --------- | ---- |

## Run verdict
