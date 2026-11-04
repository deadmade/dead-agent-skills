---
name: learn
description: 'Keep what a piece of work taught, so the next session starts smarter: collect the surprises, decisions and root causes from a flow or the current session, sort each to its home, write the few that matter without asking (CLAUDE.md, GLOSSARY.md, docs/solutions/, or memory), and park an ADR, a check or a skill fix for the Decide step. The last step of every build flow before Decide. Use for /learn [flow.md or topic].'
disable-model-invocation: true
argument-hint: '[path to a flow.md, or what to look back on]'
uses: mattpocock-picks:domain-modeling, mattpocock-picks:setup-matt-pocock-skills, pstack-picks:recall, superpowers:writing-skills
---

# learn

Most of what a session learns dies with it. This flow keeps the few things the next session would otherwise pay for
again, and drops the rest.

[step: phases]

## Rules for the whole run

[step: host]

[step: run-rules]

This flow adds:

- **Written here, without asking.** /learn writes AGENTS.md or CLAUDE.md lines, glossary entries, solutions notes
  and memory itself; the user sees each in the closing list and can revert it. The host adapter's instruction-file
  review, which only proposes, is /review-code's and doesn't apply here. An ADR, a check, or a fix to a skill or
  conductor is never written here: it becomes a **Parking lot** line for the caller's Decide (standalone: for the
  user).

**A missing piece** (a plugin or a pack file this flow uses):

[step: missing-piece]

## Start

/learn keeps no flow.md of its own.

- **Called inline** (by another conductor): skip this start and create no flow.md. Write into the
  caller's file (its flow.md, or the audit file for a standalone /review-code): what was written under its
  **Learned**, where it has one, the Parking-lot lines under its **Parking lot**, and its `now:` where it keeps one.
  When the caller reviewed a pull request (`/review-code pr`), Phase 1 reads the PR's diff and this conversation in
  place of the branch's commits: the checked-out branch isn't the PR. Then return to the caller.
- **Standalone,** the argument is a flow.md path or a topic. Wherever a rule above says flow.md, the closing list
  stands in.

## Phase 1: Gather

<!-- runs: the caller's file, else this conversation or pstack `recall` · output: candidate lessons -->

From a caller: its file (**Rulings**, deviations, rejected options, plan-review findings, the review verdict with the
decisions the user reopened) and the branch's commits. Each ruling is a candidate: one that cost a wrong turn, or that
the user reopened at /review-code, usually is a lesson. Standalone: the flow.md named in the argument, else this
conversation, which you read yourself. pstack `recall` (`<packs>/pstack-picks/skills/recall/SKILL.md`) is only for a
past topic the user names, since it skips the current chat.

A lesson is something that cost time or a wrong turn and isn't obvious from the code: a root cause, a constraint
found the hard way, a convention the code follows that nobody wrote down, a decision and what it gave up, a tool or
check that didn't behave as documented. Not a lesson: what the diff or `git log` already says, or a step-by-step of
what was done.

## Phase 2: Sort

<!-- runs: each to one home, weak ones dropped · output: the entries to write or park -->

Each lesson gets one home:

| Home                         | When                                                                                 | Through                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| a check                      | a mistake a machine can catch: a test, a lint rule, a script `npm test` runs         | a **Parking lot** line; built later, test-first, in the repo's own setup |
| AGENTS.md / CLAUDE.md        | an instruction a future session must follow in this repo (a command, a trap, a rule) | written here: one line in the section it belongs to                      |
| `GLOSSARY.md`                | a domain term or relationship got settled                                            | written here, in mattpocock `domain-modeling`'s glossary format          |
| `docs/adr/`                  | a decision that is hard to reverse, surprising without context, and a real trade-off | a **Parking lot** line; once picked, written through `domain-modeling`   |
| `docs/solutions/<slug>.md`   | a solved problem someone may hit again                                               | written here, in the format below                                        |
| a skill or conductor         | a skill or conductor behaved wrong or left a step out                                | a **Parking lot** line; built later through superpowers `writing-skills` |
| host memory (when available) | about the user or how they like to work, not about the repo                          | written here, in the memory directory                                    |

Prefer the home that makes the mistake impossible over the one that asks someone to remember it: a structural fix
first, then a type, a check, a test, and a line of prose last. A proposed check names the past mistake it must fail
on and how that was shown (run against the code as it was, it fails). A rule already in an AGENTS.md or CLAUDE.md
that this run shows nobody followed is offered for removal, or for turning into a check.

Don't ask the user; you decide. Keep a lesson only when the next session would otherwise pay for it again (a wrong
turn, a broken tool, a rule found the hard way) and drop the rest. Usually that is zero to three entries, and zero is a
fine result. An ADR is never offered here: one that passes `domain-modeling`'s three tests is a Parking-lot line.
<!-- overrides mattpocock-picks/skills/domain-modeling/SKILL.md: "Only offer to create an ADR when all three are true:" -->

## Phase 3: Write

<!-- runs: the entries, a solutions note, memory, Parking-lot lines · output: entries written or parked, listed -->

Write the entries marked "written here" yourself. The glossary is where
`<packs>/mattpocock-picks/skills/setup-matt-pocock-skills/domain.md` says it lives (`GLOSSARY.md`, or the one
`GLOSSARY-MAP.md` points at).

An ADR, a check, or a fix to a skill or conductor becomes one line under **Parking lot** in the caller's file
(standalone: one line in the closing list): a check names the past mistake it must fail on, an ADR its trade-off, a
fix what behaved wrong, to be built through superpowers `writing-skills`. It is not written here.

When a skill or conductor line is built later, `writing-skills` owns skill writing, its description rule included. skill-creator, when
installed, is used only for its eval tooling (running evals and benchmarks), never to write or reword a skill. A
vendored skill changes in its sync script's transform, never in the copied file.

A solutions note:

```markdown
# <Symptom, in the words someone would search for>

- **Seen:** <date>, <where: command, file, error text>
- **Cause:** <the root cause, with file:line>
- **Fix:** <what fixed it; commit or PR>
- **Spot it next time:** <the check or signal that would have caught it sooner>
```

End with one line per entry and per parked line (its home and file) so the user can see it and revert it, or
"nothing worth keeping".
