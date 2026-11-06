---
name: refactor
description: 'Refactor without changing behaviour: read the code and run its suite, shape the target and size it, approve a plan, write characterization tests where coverage is thin, make the moves on a branch, then /review-code and /learn. Resumable. Use for /refactor [what to refactor, and into what]; no argument resumes.'
disable-model-invocation: true
argument-hint: 'What to refactor, and into what shape?'
uses: ponytail:ponytail-review, pstack-picks:blast-radius
template: references/build-template.md
---

# refactor

Change the code's shape, never what it does: the tests that passed before still pass.

[step: phases]

## Rules for the whole run

[step: host]

[step: run-rules]

This flow adds: behaviour doesn't change, and every test that passed on the base still passes. Phase 4's eighth
deviation class says which test edits that allows.

**A missing piece** (a plugin or a pack file this flow uses):

[step: missing-piece]

## Start or resume

`flow: refactor`, template: [build-template.md](../../references/build-template.md). The input names the code to
refactor and the shape it should take. The slug is `refactor-<target>`, the target being the module or name that
moves (`refactor-session-store`).

[step: state]

[step: start]

## Phase 1: Ground

<!-- runs: pstack `how`, the test suite · output: grounding, the suite on the base, thin coverage -->

Read the code the refactor moves and everything that calls it:

[step: ground-code]

Run the full suite on the base and write the command, the commit and the result under **Grounding**. A suite already
red on the base stops the run here, since a red suite can't show that behaviour stayed the same: write the command and
the failing tests under **Findings**, offer `/fix` with them as its symptom, and set `now:` to
`Waiting for you: the suite is red on the base; once /fix has made it green, /refactor <slug> resumes here.`

Under **Grounding**, list where coverage is thin: each behaviour of the code that moves that no test runs, with its
`file:line`, from reading the tests that reach it, or from the repository's coverage tool when it has one.

## Phase 2: Shape

<!-- runs: the seam question and plan review (a restructuring), superpowers `writing-plans` · output: the target shape, the size, the plan -->

Write the target shape under **Options** as `### Shape`: what moves where, in a few lines. Then the size you
recommend, with its reason, under `### Size`: **local** (a rename, an extract, a move) or **restructuring** (a split,
a re-wire: modules or the boundaries between them change). The size picks the path below; Gate 1 confirms it.

**A restructuring** first gets options, by these rules:

[step: seams]

Here the seam lines go under `### Shape`, which stands in for a spec. Offer two or three options, each with its seams,
the files it changes and a rough effort, one of them always the smallest that would work, and your recommendation.
The user picks one, recorded as `Picked:` under `### Shape`.

**Both sizes** get a plan: a local one short (often one task), a restructuring one a task per seam or module. Its
**Global Constraints** add: "Behaviour doesn't change: tests that passed before still pass." Its **Test seams** list
the characterization tests: one per thin spot Ground listed, through the public boundary that code already has. The
first task writes them. The plan is written and checked by these rules, and the builder brief pastes in the first:

[step: before-you-write]

[step: plan-shape]

[step: plan-check]

**A restructuring** then gets plan review: follow [plan-review.md](../build-feature/references/plan-review.md), with
`### Shape` and its pick in place of the spec and no prior-art sections, logged under **Plan review**. Without
subagents: plan review is an independent check, so it is skipped and recorded under **Skipped**
(`plan review: no subagents`).

Then, for both sizes and once, after any plan review, the plan is copyedited and checked again before the gate:

[step: copyedit]

## Phase 3: Gate

<!-- runs: the gate · output: the size, the plan and the execution method, approved -->

**Gate 1** is a plan gate: the target shape, the size you recommend and why, the plan (glance's block, its **Test
seams**, each task's **Files** list) and, for a restructuring, the picked option and the plan review's findings.
Record the size the user approves as `Picked:` under `### Size`. A different size sends the run back to Phase 2 for
that size's path (`phase: shape`), and this gate reopens.

[step: gate]

## Phase 4: Build

<!-- runs: superpowers `subagent-driven-development` or `executing-plans` · output: characterization tests, then the moves -->

[step: worktree]

A red baseline here stops the run as a red suite does in Phase 1: record it, offer `/fix`, and never go on.

[step: builder-brief]

For this flow, the brief's **Tests** rule gains a line, pasted with it: the characterization tests the plan's **Test
seams** list are written first, each passing on the base before any move, although a rename or a move otherwise gets
no test.

[step: deviations]

This flow adds an eighth class, which the builder brief pastes in with the other seven:

8. a test edit beyond the moved names. A test that passed on the base may change only where a refactored name or path
   appears in it (imports, identifiers, a moved file). A changed assertion or expected value, or a deleted test, is a
   deviation; its recommendation keeps the test, and the behaviour change it points at goes under **Parking lot**.
   The files check looks for it too, in `git diff <base> -- <the task's test files>`, so native execution doesn't rest
   on the builder's word.

The plan is built by the method its gate picked, the characterization tests first, then the moves:

[step: execute]

## Phase 5: Finish

<!-- runs: `/review-code`, `/learn` · output: walkthrough, review, lessons, branch handled -->

/review-code and /learn run inline, by this rule:

[step: call-conductor]

/review-code's intent is "behaviour unchanged" plus plan.md, and for a restructuring the `Picked:` line under
`### Shape`. The Walkthrough's goals are the target shape's lines, plus one row for "behaviour unchanged" whose test
is the suite, green on the base and on the branch.

[step: finish]

[step: decide]

[step: close]
