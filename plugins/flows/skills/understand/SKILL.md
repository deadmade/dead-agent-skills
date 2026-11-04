---
name: understand
description: 'Learn a codebase, a subsystem or a concept by doing: map it (pstack how, graphify when a graph exists), learn why it is that way (pstack why), then a guided lesson through mattpocock teach where you write the key lines and Claude explains, and keep the terms you settled in GLOSSARY.md. Use for /understand [topic, path or concept].'
disable-model-invocation: true
argument-hint: 'What do you want to understand? (a path, a subsystem, a concept)'
uses: pstack-picks:why, graphify:graphify, mattpocock-picks:teach, mattpocock-picks:domain-modeling
---

# understand

Reading an explanation isn't understanding. This flow maps the ground, then makes the user do the parts that matter.

[step: phases]

## Rules for the whole run

[step: host]

[step: run-rules]

This flow adds:

- One lesson per run. The real tree is never edited here: a change the user wants for real stops the lesson and goes
  to a build flow (Phase 3).

**A missing piece** (a plugin or a pack file this flow uses):

[step: missing-piece]

## Start

/understand keeps no flow.md: its record is the chat and one scratch file, `understand-<topic>.md` in the system's
temp folder, outside the repo. Wherever a rule above says flow.md, the scratch file stands in. The argument is the
topic (a path, a subsystem or a concept); without one, ask for it in one line.

## Phase 1: Map

<!-- runs: `pstack-picks:how`, graphify · output: a map in the scratch file: parts, flow, entry points -->

Ask the user, once: what they already know, and what they want to be able to do afterwards (change it, review it,
explain it). Then ground the topic, which is the subsystem here; its `why` waits for Phase 2:

[step: ground-code]

Put the shape you want into the `pstack-picks:how` question: the parts, how a request or call flows through them and
the entry points, with `file:line`, as one short diagram or table, not a wall of text. Show what it returns as it is,
and write it to the scratch file. No graph: offer `/graphify` for a large repo (it costs a build), only on the
user's yes.

## Phase 2: Why

<!-- runs: `pstack-picks:why` · output: the decisions behind it, in the scratch file -->

One `pstack-picks:why` run whose question names the two or three choices in the map that look strangest. Add to its
code anchor the repo's decision records: `docs/adr/`, and the `docs/features/*/` flow.md, spec and plan that touch the
target. Cite the commit, PR, ADR or doc for each; "unknown" is an answer. Add it to the scratch file, under the map.

## Phase 3: Lesson

<!-- runs: `mattpocock-picks:teach`'s Philosophy, learning style · output: the user did the key parts -->

Teach this one lesson from the map, the why and the user's goal, by the **Philosophy** section of
`mattpocock-picks:teach` (`<flow-root>/packs/mattpocock-picks/skills/teach/SKILL.md`) only. The rest of teach doesn't
apply: no `MISSION.md`, `lessons/`, `assets/`, `learning-records/` or other workspace files. The lesson is the chat
and the scratch file.
<!-- overrides mattpocock-picks/skills/teach/SKILL.md: "This is a stateful request - they intend to learn the topic over multiple sessions." -->
<!-- overrides mattpocock-picks/skills/teach/SKILL.md: "Treat the current directory as a teaching workspace." -->
<!-- overrides mattpocock-picks/skills/teach/SKILL.md: "Each lesson is one self-contained HTML file, saved to `./lessons/` and titled `0001-<dash-case-name>.html` where the number increments each time." -->

Teach in learning style throughout:

- At each decision point the user writes the code or the answer (5–10 lines, or one sentence) in the scratch file or
  the chat.
- Claude takes the boilerplate, then reviews what the user wrote against the real code and says what differs and why.
- Short insight notes on the patterns the code uses, tied to `file:line`.

For a codebase lesson, the map's `file:line` and why's citations are the sources; outside resources only for a concept
lesson. Stop when the user can do what they said they wanted, or says stop.

A change the user wants for real stops the lesson. Offer the build flow that fits, with the scratch file's path in its
request as the map and the why: `/build-feature <the change>; map and why: <scratch file>` (`/fix` for a bug).

## Phase 4: Keep

<!-- runs: `mattpocock-picks:domain-modeling` · output: terms in `GLOSSARY.md` -->

Collect the terms that came up during the lesson. Offer to run mattpocock `domain-modeling` on them, so the next
person (or session) has them in `GLOSSARY.md` (or the one `GLOSSARY-MAP.md` points at). Only on the user's yes, with
the exact entries shown first. Terms from a concept lesson aren't the project's: they never go into its glossary.
<!-- overrides mattpocock-picks/skills/domain-modeling/SKILL.md: "Don't batch these up: capture them as they happen." -->
