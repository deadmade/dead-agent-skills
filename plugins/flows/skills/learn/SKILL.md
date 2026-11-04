---
name: learn
description: 'Keep what a piece of work taught, so the next session starts smarter: collect the surprises, decisions and root causes from a flow or the current session, sort each to its home (CLAUDE.md, GLOSSARY.md, an ADR, docs/solutions/, a skill, or memory), and write the few that matter without asking. The last step of every build flow. Use for /learn [flow.md or topic].'
disable-model-invocation: true
argument-hint: '[path to a flow.md, or what to look back on]'
uses: claude-md-management@claude-plugins-official:revise-claude-md, mattpocock-picks:domain-modeling, pstack-picks:recall, superpowers:writing-skills
---

# learn

Most of what a session learns dies with it. This flow keeps the few things the next session would otherwise pay for
again, and drops the rest.

| Phase    | Runs                                                            | Output                  |
| -------- | --------------------------------------------------------------- | ----------------------- |
| 1 Gather | the caller's flow.md, else pstack `recall`                      | candidate lessons       |
| 2 Sort   | each to one home, weak ones dropped                             | the entries to write    |
| 3 Write  | `revise-claude-md`, `domain-modeling`, a solutions note, memory | entries written, listed |

[flow-rules.md](../../references/flow-rules.md) applies: read it first. Packs: `<flow-root>/packs` (pstack
and mattpocock are its `-picks` folders).

## Phase 1: Gather

From a build flow: its flow.md (**Rulings**, deviations, rejected options, plan-review findings, the review verdict
with the decisions the user reopened) and the branch's commits. Each ruling is a candidate: one that cost a wrong
turn, or that the user reopened at /review-code, usually is a lesson. Standalone: the flow.md named in the argument, else
pstack `recall` on the topic or the current session.

A lesson is something that cost time or a wrong turn and isn't obvious from the code: a root cause, a constraint
found the hard way, a convention the code follows that nobody wrote down, a decision and what it gave up, a tool or
check that didn't behave as documented. Not a lesson: what the diff or `git log` already says, or a step-by-step of
what was done.

## Phase 2: Sort

Each lesson gets one home:

| Home                         | When                                                                                 | Through                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| a check                      | a mistake a machine can catch: a test, a lint rule, a script `npm test` runs         | the repo's own test or lint setup, written test-first                                    |
| AGENTS.md / CLAUDE.md        | an instruction a future session must follow in this repo (a command, a trap, a rule) | host instruction-file procedure (`claude-md-management:revise-claude-md` when available) |
| `GLOSSARY.md`                | a domain term or relationship got settled                                            | mattpocock `domain-modeling`                                                             |
| `docs/adr/`                  | a decision that is hard to reverse, surprising without context, and a real trade-off | mattpocock `domain-modeling`                                                             |
| `docs/solutions/<slug>.md`   | a solved problem someone may hit again                                               | the format below                                                                         |
| a skill or conductor         | a skill or conductor behaved wrong or left a step out                                | superpowers `writing-skills`                                                             |
| host memory (when available) | about the user or how they like to work, not about the repo                          | the memory directory                                                                     |

Prefer the home that makes the mistake impossible over the one that asks someone to remember it: a structural fix
first, then a type, a check, a test, and a line of prose last. A proposed check names the past mistake it must fail
on and how that was shown (run against the code as it was, it fails). A rule already in an AGENTS.md or CLAUDE.md
that this run shows nobody followed is offered for removal, or for turning into a check.

Don't ask the user; you decide. Keep a lesson only when the next session would otherwise pay for it again (a wrong
turn, a broken tool, a rule found the hard way) and drop the rest. Usually that is zero to three entries, and zero is a
fine result.

## Phase 3: Write

Write the kept entries through the skill named for their home. A check, or a fix to a skill or conductor, is code: it
becomes one line under **Parking lot** in the caller's flow.md (standalone: one line in the report) naming the past
mistake it must fail on, and it is not written here. The glossary is where
`<packs>/mattpocock-picks/skills/setup-matt-pocock-skills/domain.md` says it lives (`GLOSSARY.md`, or the one
`GLOSSARY-MAP.md` points at).

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

Called from a build flow, list what was written under **Learned** in its flow.md. Either way, end with one line per
entry (its home and file) so the user can see it and revert it, or "nothing worth keeping".
