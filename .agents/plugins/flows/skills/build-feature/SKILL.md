---
name: build-feature
description: "Build a feature through the whole skill chain: ground in the code and in how other projects solve it, brainstorm with options, grill the spec with domain docs and ADRs, write the plan, evaluate it adversarially, then execute, verify and finish. Two approval gates, no lock. Use for /build-feature [what to build]; no argument resumes the active feature, a run's slug resumes that run."
disable-model-invocation: true
argument-hint: "What do you want to build (or a run's slug)?"
---

# build-feature

One entry point that runs the skills this marketplace already ships, in order, and stops at two gates for the user.
Claude proposes and recommends; the user decides.

| Phase        | Runs                                                           | Output                                    |
| ------------ | -------------------------------------------------------------- | ----------------------------------------- |
| 1 Ground     | pstack `how` or Explore agents, a prior-art agent              | grounding notes, prior-art report         |
| 2 Brainstorm | superpowers `brainstorming`, the seam question                 | spec                                      |
| 3 Grill      | mattpocock `grilling` + `domain-modeling`                      | sharper spec, glossary, ADRs. **Gate 1**  |
| 4 Plan       | superpowers `writing-plans`                                    | plan                                      |
| 5 Evaluate   | reviewer subagents per plan-review.md                          | revised plan. **Gate 2**                  |
| 6 Execute    | superpowers `subagent-driven-development` or `executing-plans` | code, tests                               |
| 7 Finish     | `/review-code`, then `/learn`                                  | walkthrough, branch handled, lessons kept |

- **Say how you know.** A claim the user decides on (in options, gate summaries, plan findings) is _measured_ (you
  ran it), _verified_ (a source or `file:line` says so; what code does, read but not run, is inferred), _inferred_ (your
  reasoning) or _assumed_. Check an inferred
  or assumed claim an option rests on, or present it as a guess.
- **Reviewers are independent.** Every checking agent (source check, plan reviewers, rulings, fix checks) is a fresh
  subagent: never a fork, and no `name`. It gets only the files its prompt names, plus the findings it rules on or
  checks: never this conversation, drafts, or which option the user leans to.

## Rules for the whole run

[flow-rules.md](../../references/flow-rules.md) applies: read it first. Packs: `<flow-root>/packs` (pstack,
mattpocock and tob are its `-picks` folders). Only this differs:

- After every phase update `docs/features/<slug>/flow.md` (`flow: feature`, `phase:`, `now:`).
- Nothing is planned before Gate 1 and nothing is built before Gate 2.
- Every claim about another project or a library cites a source fetched in this session (rules in
  [references/prior-art.md](references/prior-art.md)).

## Start or resume

- **With an argument, an existing run's slug** (`docs/features/<arg>/flow.md` exists in the repository root or a
  worktree under `.worktrees/*/` or `.claude/worktrees/*/`): read the newest copy. A `flow:` other than `feature` (or
  missing) → say which conductor it belongs to and stop. `phase: done` → say it's done and ask what to do. When the
  newest copy is in a worktree, work in that worktree (the host worktree tool, or run commands with that worktree as their working directory) and write that copy; if the
  switch is refused (the host cannot switch its working directory), say so and
  ask the user to start the session in that worktree. Then continue at its phase, as "Without one" does. Never create
  a flow.md over an existing one.
- **With an argument, anything else:** derive a kebab-case slug (`checkout-webhooks`), create
  `docs/features/<slug>/flow.md` from [references/flow-template.md](references/flow-template.md), then Phase 1. If
  the derived slug exists, ask before choosing another.
- **Without one:** find `docs/features/*/flow.md` files whose `phase:` isn't `done` and whose `flow:` is `feature` or
  missing (other values belong to other conductors). One: read it and the artifacts
  it links, then continue at its phase. Several: ask which. None: ask what to build.

## Phase 1: Ground

Ask nothing yet. In one message, start both:

- **Codebase:** pstack `how` on the subsystems the feature touches (fallback: 1–3 Explore agents), and pstack `why`
  when the feature moves an existing concern. Also read the domain docs that
  `<packs>/mattpocock-picks/skills/setup-matt-pocock-skills/domain.md` lists (the glossary and the ADRs).
- **Prior art:** one background `general-purpose` agent with the prompt in
  [references/prior-art.md](references/prior-art.md), writing `docs/features/<slug>/prior-art.md`. Don't wait for it; Phase 2 starts with questions anyway. When it lands, run the source check in that reference and correct the report before presenting options.
  When the request hands over an approved `research.md` from `/research-feature`, that report is the prior art: link it
  and skip this agent.

Write a short summary of each into flow.md under **Grounding** and **Prior art** as they land, including the source check’s counts.

## Phase 2: Brainstorm

Follow superpowers `brainstorming` with the feature request. Hand it the grounding as context it already has: it
doesn't need to offer recon of the codebase, and the web recon is already running. These change it:
<!-- overrides superpowers/skills/brainstorming/SKILL.md: "Offer recon. Once you have a bit of grounding and looking further would help, offer to go look:" -->

- **Options.** Brainstorming wants the user describing before seeing options; keep that. Once the "how it gets made"
  question comes up, present the approaches from the prior-art report: per option, the shape in two lines, who does
  it this way (links), trade-offs for _this_ codebase, rough effort. One option is always the smallest that would work
  (flow-rules **ponytail at chosen steps**, the `lite` level), even when it isn't your pick. End with your
  recommendation and why. The user
  picks; record the choice and the rejected options in flow.md under **Options**, one `### <decision>` with
  `Picked: <the choice in plain words>`.
- **Seams.** Read mattpocock `codebase-design` and pstack `principle-redesign-from-first-principles` and
  `principle-boundary-discipline`. For each cross-cutting concern the feature adds (who the caller is, a tenant, a
  permission, a setting), the approaches message names the seam where it is resolved and the modules that never see
  it. Redesign picks the seam; boundary discipline keeps the policy there. Its "propagate" covers the seam's types and
  docs, never a parameter carried through modules that don't decide on it.
  <!-- overrides pstack-picks/skills/principle-redesign-from-first-principles/SKILL.md: "Propagate the change through every reference: types, docs, examples, rationale sections" -->
- **Size.** A quick task (everything that matters is in the request) doesn't need this flow: say so and offer to
  leave it. Only on the user's yes, set `phase: done` with a note and do the task. A small change stays in the flow:
  its short design doc is the spec, and Gate 1, the seam lines, the plan's Global Constraints and the build stop all
  apply. The user may skip the Grill for it; record that in flow.md.
  <!-- overrides superpowers/skills/brainstorming/SKILL.md: "This is a quick, clear task. Do it, and say what you did." -->
- **Skip.** If the user takes brainstorming's offer to skip the questions, brainstorming ends without a spec. Write it
  yourself from the request and the grounding, mark every choice you made as your call, and go to Phase 3; the grill
  stands in for the builder check. Gate 1 still applies.
- **Spike.** A spike the user agrees to is allowed. Record it in flow.md as throwaway: it isn't building, it doesn't
  pass Gate 2, and keeping its code goes through the plan like any other code.
- **Exit.** Once the spec is written (for a project, with the builder check folded in), stop: Gate 1 is the user's
  review of it, after the grill. Don't invoke `writing-plans`, even though brainstorming's hard gate says to. Link the
  spec in flow.md and go to Phase 3.

## Phase 3: Grill

Follow `grilling` and `domain-modeling` (both mattpocock-picks; this is what `grill-with-docs` does) on the spec.
The design tree is the spec's open and assumed decisions; facts come from the code and the prior-art report, not
from the user. Recommended answers are fine here.

- The tree has one branch per cross-cutting concern: the seam question from Phase 2. Each answer goes into the spec
  as one line: `<concern>: resolved in <module>; never seen by <modules>`.
- Resolved terms go into `GLOSSARY.md` (or the one `GLOSSARY-MAP.md` points at) as they happen; ADRs only under
  domain-modeling's three conditions. Link them in flow.md. An ADR takes the next free number in `docs/adr/` on the
  base branch; check again when it is committed, since another branch may have taken that number meanwhile.
- Fold every settled decision back into the spec. The spec is the single source the plan is written from.

**Gate 1:** when the frontier is empty, give a five-line summary of what changed in the spec and ask the user to
approve the spec. Record it.

## Phase 4: Plan

Follow superpowers `writing-plans` on the approved spec, with flow-rules **ponytail at chosen steps**' **Before you
write** pasted into it. Copy each seam line from the spec verbatim into the plan's **Global Constraints**, and add one
line to them: "One implementation gets no interface; one caller gets no helper; no option nobody sets." They also get a
**Test seams** list (after mattpocock `tdd`): each public boundary the tests go through (an exported function, a CLI,
a route), one line each on what a test there catches and what it misses. Tests go only there, and the plan's test
steps use only these. Every task gets, right below its heading:

- `**Does:** <one plain sentence for a reader who doesn't know the code>`
- `**Depends on:** Task <n>, … | none`
- `**Adds:** <new files, types or classes, exported functions, config keys or flags, dependencies> | nothing new`:
  every new piece of surface, so `Interfaces: Produces` lists only what a later task consumes.
- `**Size:** ~<N>`: the lines the task adds plus removes in its own files, one number.

Split a file only where a task's `Adds:` already names the second unit.
<!-- overrides superpowers/skills/writing-plans/SKILL.md: "Prefer smaller, focused files over large ones that do too much." -->

Let it run its own self-review. Then run `node <skill-dir>/scripts/glance.mjs <plan.md>`: it writes the plan's task
graph and table at the top of plan.md, and it fails with the reason when the plan has no `### Task <n>:` headings or
a task lacks `Depends on:`, names no task in it, or has a `Size:` that isn't `~N`. Run it again after every plan edit. When it reaches its **Execution Handoff**, don't ask for an
execution method yet and don't invoke an execution skill: link the plan in flow.md and go to Phase 5.
<!-- overrides superpowers/skills/writing-plans/SKILL.md: "Otherwise, ask them to review the plan and choose an execution method before implementation." -->

## Phase 5: Evaluate the plan

Follow [references/plan-review.md](references/plan-review.md): 2–3 reviewer subagents with different angles, then
you synthesize and screen. Its reviewers run on `fable`, `opus` and `sonnet`, Fit uses pstack `blast-radius`, and
the Simpler angle is ponytail `ponytail-review`. Present the findings, each with options and a recommendation. The
user decides each one; you edit the plan, and the spec too if a decision changes it (say so: that edit reopens Gate 1
for that item). Record a reopening on its Gate line in flow.md as `Reopened <date>: <why>`, and the re-approval date
after it.

Optional, for a large or ambiguous design, offer before the review: pstack `architect` (sketch types and signatures
first) or `arena` (several models draft the plan, best one wins). Only on the user's yes.

**Gate 2:** ask the user to approve the plan **and** pick the execution method from `writing-plans`' handoff
(subagent-driven, or native = `executing-plans`), with your recommendation. Record both. The gate message shows
glance's block (re-run after the review's edits), the **Test seams** list and the findings, with plan.md linked
rather than pasted. Approving the plan approves the seams.

## Phase 6: Execute

Read the chosen skill by path and follow it: superpowers `subagent-driven-development` or `executing-plans`. They set
up the worktree (`using-git-worktrees`), run TDD and reviews themselves, with flow-rules **ponytail at chosen
steps** pasted into every builder brief. Stop when they would invoke `finishing-a-development-branch`.

Deviations stop the build: flow-rules **Deviations** (the fifth stop, the brief clause, the files check, Rulings).
Before SDD deletes its workspace, copy its ledger's `Ruling:` lines into flow.md (flow-rules **Rulings**).

## Phase 7: Verify and finish

1. Walkthrough table in flow.md: every spec goal → plan task → `file:line` → test. A goal with no code, or code with
   no goal, is a deviation: report it.
2. Run `/review-code branch` (read `<skill-dir>/../review-code/SKILL.md`) on the branch, with the spec as its intent. If
   execution ran natively (no per-task reviews), tell it so: it then also offers pstack `interrogate`.
3. Run `/learn` (`<skill-dir>/../learn/SKILL.md`) on this flow. Set `phase: done`.
