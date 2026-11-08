---
name: build-feature
description: "Build a feature through the whole skill chain: ground in the code and in how other projects solve it, brainstorm with options, grill the spec with domain docs and ADRs, write the plan, evaluate it adversarially, then execute, verify and finish. Two approval gates, no lock. Use for /build-feature [what to build]; no argument resumes the active feature, a run's slug resumes that run, and an approved research.md from /research-feature starts a run from that report."
disable-model-invocation: true
argument-hint: "What do you want to build (or a run's slug, or a research.md)?"
uses: superpowers:brainstorming, mattpocock-picks:grilling, mattpocock-picks:domain-modeling, pstack-picks:architect, pstack-picks:arena, pstack-picks:blast-radius, ponytail:ponytail-review
template: skills/build-feature/references/flow-template.md
---

# build-feature

One entry point that runs the skills this marketplace already ships, in order, and stops at two gates for the user.

[step: phases]

## Rules for the whole run

[step: host]

[step: run-rules]

This flow adds:

- Nothing is planned before Gate 1 and nothing is built before Gate 2.
- Every claim about another project or a library cites a source fetched in this session (rules in
  [references/prior-art.md](references/prior-art.md)).

**A missing piece** (a plugin or a pack file this flow uses):

[step: missing-piece]

## Start or resume

`flow: feature`, template: [references/flow-template.md](references/flow-template.md). A flow.md with no `flow:` line
is an older run of this conductor: treat it as `feature`.

An argument that hands over an approved research report (`docs/features/<slug>/research.md`, from
`/research-feature`) starts a new run, with the report's question as the request and a slug of its own, never the
research run's. Phase 1 links the report as the prior art and reuses that run's **Grounding**.

[step: state]

[step: start]

## Phase 1: Ground

<!-- runs: pstack `how`, a prior-art agent · output: grounding notes, prior-art report -->

Ask nothing yet. In one message, start both:
[step: ground-code]
[step: prior-art]

Phase 2 starts with questions, so the report has time to land. Write a short summary of each into flow.md under
**Grounding** and **Prior art** as they land, including the source check's counts.

## Phase 2: Brainstorm

<!-- runs: superpowers `brainstorming`, the seam question · output: spec -->

Follow superpowers `brainstorming` with the feature request. Hand it the grounding as context it already has. These
change it:
[step: seams]

- The approaches message (**Options**, below) names the seam of each cross-cutting concern, so the user picks it with
  the approach.
- **Recon.** It doesn't need to offer recon of the codebase, and the web recon is already running (or done, from a
  research run).
  <!-- overrides superpowers/skills/brainstorming/SKILL.md: "Offer recon. Once you have a bit of grounding and looking further would help, offer to go look:" -->
- **Options.** Brainstorming wants the user describing before seeing options; keep that. Once the "how it gets made"
  question comes up, present the approaches from the prior-art report: per option, the shape in two lines, who does
  it this way (links), trade-offs for _this_ codebase, rough effort. End with your recommendation and why. The user
  picks; record the choice and the rejected options in flow.md under **Options**, one `### <decision>` with
  `Picked: <the choice in plain words>`.

[step: smallest-option]

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
  <!-- overrides superpowers/skills/brainstorming/SKILL.md: "4. Invoke the superpowers:writing-plans skill." -->
  <!-- overrides superpowers/skills/brainstorming/SKILL.md: "After the design doc is approved, the next step is the plan: invoke superpowers:writing-plans and no other skill." -->

## Phase 3: Grill

<!-- runs: mattpocock `grilling` + `domain-modeling` · output: sharper spec, glossary, ADRs -->

Follow `grilling` and `domain-modeling` (both mattpocock-picks; this is what `grill-with-docs` does) on the spec.
The design tree is the spec's open and assumed decisions; facts come from the code and the prior-art report, not
from the user. Recommended answers are fine here.

- The tree has one branch per cross-cutting concern: the seam question from Phase 2. Each answer is that concern's
  seam line in the spec.
- Resolved terms go into `GLOSSARY.md` (or the one `GLOSSARY-MAP.md` points at) as they happen; ADRs only under
  domain-modeling's three conditions. Link them in flow.md. An ADR takes the next free number in `docs/adr/` on the
  base branch; check again when it is committed, since another branch may have taken that number meanwhile.
- Fold every settled decision back into the spec. The spec is the single source the plan is written from.

**Gate 1, spec approved:** when the frontier is empty, give a five-line summary of what changed in the spec and ask
the user to approve the spec.

[step: copyedit]

[step: gate]

## Phase 4: Plan

<!-- runs: superpowers `writing-plans` · output: plan -->

Write `plan.md` from the approved spec.

[step: before-you-write]

[step: plan-shape]

[step: plan-check]

## Phase 5: Evaluate

<!-- runs: reviewer subagents per plan-review.md · output: revised plan -->

Follow [references/plan-review.md](references/plan-review.md): 2–3 reviewer subagents with different angles, then
you synthesize and screen. Fit uses pstack `blast-radius`, and the Simpler angle is ponytail `ponytail-review`.
Present the findings, each with options and a recommendation. The user decides each one; you edit the plan, and the
spec too if a decision changes it (say so: that edit reopens Gate 1 for that item, recorded on its Gate line).

Optional, for a large or ambiguous design, offer before the review: pstack `architect` (sketch types and signatures
first) or `arena` (several models draft the plan, best one wins). Only on the user's yes.

**Gate 2, plan approved:** the plan and the execution method, in one answer. Before it, copyedit the edited plan
(Phase 3), then re-run glance on it (Phase 4). The gate message shows glance's block, the **Test seams** list and the
findings, with plan.md linked rather than pasted. Approving the plan approves the seams.

[step: gate]

## Phase 6: Execute

<!-- runs: superpowers `subagent-driven-development` or `executing-plans` · output: code, tests -->

Build the plan Gate 2 approved, with the method it picked.

[step: worktree]

[step: builder-brief]

[step: deviations]

[step: execute]

## Phase 7: Finish

<!-- runs: `/review-code`, `/learn` · output: walkthrough, review, lessons, branch handled -->

/review-code and /learn run inline, by this rule:

[step: call-conductor]

[step: finish]

[step: decide]

[step: close]
