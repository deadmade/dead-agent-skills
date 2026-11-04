---
name: implement
description: "Implement a ticket or an approved plan as given; it never plans and never changes a plan. Read and check the input, confirm it at one gate, build it test-first (a ticket in this session, a plan through superpowers), then /review-code and /learn. A ticket that leaves a design decision open goes to /build-feature. Use for /implement [ticket, plan, or a /build-feature run's slug past Gate 2]; no argument resumes."
disable-model-invocation: true
argument-hint: "Path to a ticket or an approved plan, or a /build-feature run's slug"
template: references/build-template.md, skills/build-feature/references/flow-template.md
---

# implement

Build what you are given, as given. Planning is /build-feature's.

[step: phases]

## Rules for the whole run

[step: host]

[step: run-rules]

**A missing piece** (a plugin or a pack file this flow uses):

[step: missing-piece]

## Start or resume

`flow: implement`, template: [build-template.md](../../references/build-template.md). A /build-feature run keeps its
own flow.md and template.

**A /build-feature run's slug** (its flow.md says `flow: feature`; a plan path inside such a run's folder counts as
its slug): find its flow.md as the rules below say (the same places, the newest copy) and continue inside that run,
writing to that flow.md. `flow:` stays `feature`, so the run stays one record; the `flow:` rules below (a conductor
only resumes its own flow, another `flow:` stops) don't apply to it.

- Gate 2 is open, or `phase:` is still before `execute`: stop and offer `/build-feature <slug>`.
- `phase:` is `finish` or `done`: say so and stop; at `finish`, offer `/build-feature <slug>`, which resumes it.
- Otherwise resume it as **Resume** below says, then go straight to Phase 3 with the run's plan.md: no Read, no
  Confirm, no new gate. The method is Gate 2's `execution:`; ask only when it is missing, and record it on that line.
  That plan.md is the run's own, so Decide's added task and the split of a BLOCKED task go into it as in
  /build-feature. Write `phase: execute`, then `finish`. Its `now:` says that `/build-feature <slug>` or
  `/implement <slug>` resumes it; a bare /implement doesn't.

[step: state]

[step: start]

## Phase 1: Read

<!-- runs: the input, pstack `how`, glance's check · output: the ticket's Files list, or the plan checked -->

Read the input and everything it links, then ground it in the code:

[step: ground-code]

Write the grounding under **Grounding** in flow.md: where the work lands (`file:line`).

**A ticket** goes ahead only when it says what behaviour changes, how you'd know it's done, and leaves no design
decision open (the approach, where it lives, a new interface), and when it is one task's work. Write its **Files**
list from the grounding under **Grounding**, where the gate and one-task's files check find it. A gap or a ticket too
big for one task: stop, name it, and offer `/build-feature`.

**A plan** goes ahead when glance accepts it and every task has **Does**, **Depends on**, **Adds**, **Size** and a
**Files** list of plain paths (the files check compares paths, so a `path:123-145` entry is a gap). It is a plan the
run was given, so glance runs on it only with `--check` (the `--check` paragraph below), never in its writing mode:

[step: plan-check]

A missing field, a `path:lines` **Files** entry, or a path or name the grounding shows is stale: stop and name each
one, so the user can fix the plan and run /implement again.

Anything else (a spec, open questions): say it isn't a ticket or a plan and offer `/build-feature`.

Each stop in this phase leaves the run at `phase: read`: the stop message says that `/implement <slug>` continues it
once the ticket or plan is fixed, and otherwise offers to set `phase: done` with a note.

## Phase 2: Confirm

<!-- runs: the gate · output: the approved ticket or plan -->

- **A ticket** becomes one task: the gate shows the ticket, its **Files** list and its acceptance criteria, as
  `- Gate 1, ticket approved: <date>`. No plan.md is written and no execution method is asked.
- **A plan:** the gate shows glance's block, the plan's **Global Constraints** and **Test seams** (or that it has
  none), and each task's **Files** list (the deviation contract). A change the user asks for stops the run: name it,
  so the user can change the plan and run /implement again; offer `/build-feature` only when the user wants the design
  reopened.

Neither is copyedited, since the run changes neither: for a plan, the gate message says so as the gate rules below
give it; for a ticket, `not copyedited: a given ticket is not changed`.

[step: gate]

## Phase 3: Execute

<!-- runs: this session (a ticket), superpowers `subagent-driven-development` or `executing-plans` (a plan) · output: code, tests -->

[step: worktree]

The builder brief below pastes this in:

[step: before-you-write]

[step: builder-brief]

[step: deviations]

A plan given by path stays as it is during the build: a deviation's decision goes under **Deviations**, never into
the plan.

A ticket is built as one task:

[step: one-task]

A plan is built by the method its gate picked:

[step: execute]

## Phase 4: Finish

<!-- runs: `/review-code`, `/learn` · output: walkthrough, review, lessons, branch handled -->

/review-code and /learn run inline, by this rule:

[step: call-conductor]

On the ticket path no per-task review ran: tell /review-code that execution ran natively.

[step: finish]

On a plan given by path that isn't a feature run's own plan.md, the plan stays unchanged: a decision reopened at
Decide becomes the next numbered line under **Tasks**.

[step: decide]

[step: close]
