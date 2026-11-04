# Composition designs (panel, 2026-11-04)

Three independent designers (opus) wrote one design each from a different angle; two judges (opus) scored them. Raw output; the options presented to the user are in flow.md **Options**.

## Design minimal: Plain-Markdown steps, one include line, one compose pass

## 1. Source layout and syntax

Steps live in `plugins/flows/steps/<name>.md`. They aren't catalog `resources`, so they never ship, and `lint` already walks them. A flow stays at `plugins/flows/skills/<flow>/SKILL.md`, so the loader, the catalog and the conductor detection in `flows-uses.mjs` stay as they are. Host steps live in `tools/harness-compiler/src/templates/hosts/<target>/<name>.md` (§3).

- **Step file:** plain Markdown, inserted verbatim. Its optional frontmatter holds only `uses:` (`plugin:name, …`) and `requires:` (step names). A step has no `#` or `##` headings. Its override markers sit beside the sentences they override.
- **Flow file:** skill frontmatter, plus an optional `uses:`. It has one directive: a line holding only `[step: <name>]`. `phases` is the one built-in step. Phases are `## Phase <n>: <Name>` headings.

`steps/finish.md` removes findings #2, #3, #20, #36 and #87:

```markdown
---
requires: call-conductor
---

Run `/review-code branch` inline (`<flow-root>/skills/review-code/SKILL.md`). Its intent is this flow's flow.md:
the input, and the spec and plan it links; say whether execution ran natively. At its Decide gate, before
`finishing-a-development-branch`, run `/learn` on this flow, ask the user for the **Run verdict** (worked as a
whole, yes or no; clean, yes or no) and record it. Then Decide finishes the branch. Set `phase: done`.
```

`skills/implement/SKILL.md`:

```markdown
---
name: implement
description: 'Build an approved plan or a ready ticket as given; no planning. … no argument resumes.'
disable-model-invocation: true
uses: superpowers:test-driven-development
---

# implement

Build what you are given, as given. Planning is /build-feature's.

[step: phases]

## Rules for the whole run

[step: host]
[step: state]
[step: gates]
[step: agents]

## Start or resume

`flow: implement`.

[step: start]

## Phase 1: Read

[step: ground]
[step: ready-bar]

**Gate:** read back each Files list; the user picks the execution method.

## Phase 2: Execute

A ticket: superpowers `test-driven-development`, one acceptance criterion at a time.

[step: execute]
[step: deviations]

## Phase 3: Finish

[step: finish]
```

## 2. Assembly

The built skill follows the flow's order: frontmatter (with `uses:` stripped), the opening, the phase table, the rules, Start, then the phases. The rules come first because compaction keeps only a skill's first 5,000 tokens [verified: code.claude.com/docs/en/skills#skill-content-lifecycle, via prior-art.md]. The `state` step adds: "After a compaction, re-read this SKILL.md from the heading that flow.md's `phase:` names."

`phases` renders a `| Phase | Steps |` table from the headings and the steps under each one. A section that contains `**Gate` is marked **Gate**. The table ends with the `phases a | b | done` line.

Every rule an agent must follow goes inline, including the host adapter. `references/` keeps only what an agent looks up: templates, subagent briefs (`prior-art.md`, `plan-review.md`, `lenses.md`) and deep methods (`spec-compliance.md`, `tests-all.md`, `harden-all.md`, `copyedit.md`).

**Size of /build-feature once built** (counted with `wc -c`):

| Part                                                                          | Bytes      |
| ----------------------------------------------------------------------------- | ---------- |
| Its own text, without markers or the duplicated rules (13,708 − 751 − ~2,500) | ~10,500    |
| flow-rules, without markers or the review-only sections (19,677 − 2,166)      | ~17,500    |
| The host step                                                                 | ~1,400     |
| **Total**                                                                     | **~29 KB** |

At 80 B per line and ~4 characters per token [inferred], that is **~370 lines and ~7,300 tokens**: under the 500-line limit, over the 5,000-token budget. Today a run reads ~10,000 tokens across three files.

## 3. Host differences

The build looks a step up in `templates/hosts/<target>/` first, then in `plugins/flows/steps/`. A step that exists in both places is an error. Every host step must exist for every target, though it may be empty:

| Step                                        | Claude Code                                  | Codex                                                      |
| ------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `models`                                    | small/standard/strongest → haiku/sonnet/opus | the session's model [verified: templates/hosts/codex.md]   |
| `wait`                                      | Monitor                                      | poll the command [inferred]                                |
| `hand-over`                                 | the `!` prefix                               | the user runs the command and pastes the output [inferred] |
| `host`, `correctness-lens`, `security-lens` | today's adapter, the built-ins               | today's adapter, the neutral brief                         |

`references/host.md` goes away. Neutral text says "the question tool", "a fresh subagent" and "a strongest-tier model". `lint.ts` gains a flows-only phrase list (`Explore agent`, `WebSearch`, `WebFetch`, `subagent_type`, `AskUserQuestion`, `Monitor`, model names, `the Skill tool`), which removes #12, #13 and #81 by construction.

## 4. Build stage

What changes:

- a new `transforms/compose.ts` with `composeSkill(target, text)` and `flowUses(root)`: ~120 lines, plus a ~90-line test
- `emit/build.ts`: +5 lines, to compose flows' `skills/*/SKILL.md` before `transformMarkdown`
- `templates/hosts.ts`: ~8 lines
- `targets/*.ts`: −1 line each
- `lint.ts`: +12 lines

The build fails, citing `file:line`, on any of these:

- an unknown step
- a step defined in both places
- a host step that one target lacks
- a step used twice
- an unmet `requires:` (for example, `execute` needs `deviations`)
- a `[step:` line or a heading inside a step
- an unknown frontmatter key
- built text that names `flow-rules`

It warns on unused steps and on any skill over 500 lines or 5,000 estimated tokens. It strips override markers from the output, because nobody knows whether harnesses strip HTML comments from a SKILL.md [inferred, prior-art.md].

**Traceability:** steps are copied byte for byte, so `grep -rF "<sentence>" plugins/flows/steps plugins/flows/skills` finds the one file a sentence came from. The phase table also names each phase's steps.

## 5. Existing pieces

- **flow-rules.md** is split into about 20 steps, then deleted. Scope, Reports and Audits move into review-code's SKILL.md (#71). AGENTS.md:63-66 gets rewritten.
- **uses.json** is deleted. `flowUses()` joins a flow's `uses:` with its steps' `uses:`, and `flows-uses.mjs` imports it [verified: package.json engines node>=26; cli.ts runs as plain .ts]. The dependencies, the README tree and the check that each listed name appears in the text keep working. Finding #47 goes away.
- **Override markers** move with their sentences, and `checkOverrides` already scans the step files. `RULES_FILE`/`PLAN_FILES` point at `steps/gates.md`, `steps/deviations.md` and `steps/plan-shape.md`.
- **writing's tests** assert on `steps/copyedit.md` and on the built build-feature SKILL.md.

## 6. Migration

Every commit includes the regenerated outputs, and `check:harnesses` stays green throughout.

1. The compiler and its tests. The outputs stay byte-identical.
2. The host steps, with `[step: host]` in every conductor.
3. One commit per conductor that only moves text: implement, fix, upgrade, build-feature, research-feature, review-code, understand, learn. Where two copies differ, the commit message names the copy that won. Review each commit with `git diff --word-diff` on the built SKILL.md. Then delete flow-rules.md.
4. The behaviour changes, one commit per group of findings: /implement stops planning, /upgrade takes many packages and batches big migrations, and the start guards.
5. /refactor, built from the existing steps plus a new `behaviour-unchanged` step.

## 7. Risks and costs

- Built skills exceed 5,000 tokens. Putting the rules first and re-reading after compaction should help; neither is measured.
- Shared text is copied into 9 skills × 2 harnesses. One step edit touches up to 16 generated files, and the outputs grow by about 200 KB.
- A source SKILL.md can't run on its own. The marketplaces point at the generated trees [verified: targets/claude-code.ts:64, codex.ts:25].
- Steps can't name a flow. Where a step fits a flow awkwardly, that flow needs its own prose or a second step.
- Host text lives in the compiler, a second place authors have to know about.
- The flow cockpit may stop parsing phase tables [inferred]; the user accepted that.
- Cost: about 150 lines of compiler code, 90 lines of tests, 25 steps, 12 host steps and 8 rewritten conductors. 56 findings still need text or design work.

## Design agent-first: Agent-first: steps composed into one self-contained SKILL.md

# Agent-first: steps composed into one self-contained SKILL.md

## 1. Source layout

- `plugins/flows/steps/<name>.md`: one shared step each (`start`, `gate`, `execute`, `deviations`, `finish`, …).
- `plugins/flows/skills/<name>/conductor.md`: the flow, beside its `references/` and `scripts/`. `writing/SKILL.md` stays hand-written.
- A step: flat `key: value` front matter (no YAML library), then `## Always` (rules lifted to the skill's top, deduplicated) and `## Do` (placed where the flow names it). `{{token}}` is host wording. Override markers stay in source, not output.

`steps/finish.md`:

```markdown
---
title: Finish
runs: /review-code, /learn, superpowers `finishing-a-development-branch`
uses: superpowers/finishing-a-development-branch
requires: state
expects: Intent:
---

## Always

- Nothing merges, pushes or opens a PR before the user picks it at the last gate.

## Do

1. Ask for the **Run verdict** (worked as a whole, clean: yes or no each); record it in flow.md.
2. Run `/review-code branch` inline with the Intent above, plan included; say if execution ran natively. Stop after Decide's decisions.
3. Run `/learn` on this flow.md; it lists its entries under **Learned**.
4. Offer to commit the uncommitted flow.md, audit and /learn entries.
5. Follow `finishing-a-development-branch`; its PR option ends with {{watch-checks}}.
6. Set `phase: done`.
```

`skills/implement/conductor.md`:

```markdown
---
name: implement
description: 'Implement a ticket or an approved plan as given …'
argument-hint: 'Path to a ticket or an approved plan'
invocation: explicit
flow: implement
state: build-template
---

# implement

Implements what it is given, as given; it never plans.
[step: start]

## Phase 1: Read — what's settled

Read the input and everything it links.
[step: ground-codebase]
A ticket names the behaviour change and acceptance criteria and leaves no design open; a gap: stop, offer /build-feature.

## Phase 2: Confirm — the contract

A ticket becomes one task with a **Files** list from Phase 1.
[step: plan-shape]
Gate on the contract: the Global Constraints and every **Files** list.
[step: gate]

## Phase 3: Execute — code, tests

[step: execute]

## Phase 4: Finish — branch handled

Intent: the ticket, or the plan and the spec it links.
[step: finish]
```

`execute` declares `requires: deviations, files-check, rulings`; the build inserts them, so no flow drops one.

## 2. The built SKILL.md, in order

1. Frontmatter, title, purpose.
2. Phase table, generated (phase, steps' `runs:`, the heading's output, `Gate n`), and `phases: read | confirm | execute | finish | done`.
3. `## Always`: R1…Rn, one or two lines each. R1: "After compaction or on resume, re-read this file's `## Phase <n>` for flow.md's phase before acting." Then the steps' Always lines and host lines. Claude Code keeps a skill's first 5,000 tokens after compaction; rules go first [verified: prior-art.md, citing code.claude.com/docs/en/skills].
4. `## Start or resume`.
5. `## Phase n: Name`; steps as numbered bold leads (`**3.2 Deviations stop the build.**`), gates numbered by the build, a generated `State:` line (`phase:`, `now:`) last.
6. `## If something is missing`: only the fallback rows this flow's `uses:` need.
7. `## Look up`: each reference and when to read it.

No rule lives in another file. `references/` keeps templates, subagent briefs (prior-art, plan-review, lenses, and a generated `builder-brief.md`: the brief clause, the test line, ponytail's texts pasted at build time by `[paste: <pack path> "<first sentence>" … "<last sentence>"]`), and deep methods (checks, tests-all, copyedit).

**/build-feature's size.** Today: SKILL.md 13,708 B + flow-rules.md 25,073 B + host.md ~2,000 B = 40.8 KB. Minus override markers (6,030 B, measured), review-only sections (~2,400 B), the brief (~2,500 B), pointers and duplicates (~2,500 B, estimated), review-only host text (~1,200 B): ~26 KB, ~310 lines at 85 B/line, ~7,000 tokens at 3.7 B/token [inferred ratio, no tokenizer run]; tightening may reach ~6,000. Execute and Finish fall past the compaction cut; R1 covers them.

## 3. Host differences

`tools/harness-compiler/src/templates/hosts/<id>.ts` exports a `Record<Token, string>`, so a token missing on one host fails typecheck: `{{ask-user}}`, `{{explore}}`, `{{load-skill}}`, `{{web-search}}`, `{{model:fast|standard|deep}}`, `{{watch-checks}}`, `{{user-runs:<cmd>}}`.

- Claude Code: AskUserQuestion, Explore agents, haiku/sonnet/opus/fable, `Monitor`, `! <cmd>`.
- Codex: the session's model, since its adapter forbids changing it [verified: templates/hosts/codex.md:8]; chat when no question tool [verified: codex.md:3-4]; poll `gh pr checks` [inferred: no Monitor, #81]; the user runs the command and pastes the output [inferred].
- Subagents are decided at runtime [verified: flow-rules.md:8-10]: a step marked `subagent: yes` gets a build-appended "No subagents: skip this, record it as not checked" (#15).
- `invocation: explicit` emits `disable-model-invocation: true`, or Codex's `agents/openai.yaml` with `allow_implicit_invocation: false` [verified: prior-art.md, learn.chatgpt.com/docs/build-skills].
- `lint` fails on Claude-only names in `steps/` and `conductor.md` (#12, #13). `host.md` becomes Always host lines.

## 4. The build stage

New: `src/flows/parse.ts` (~120 lines), `compose.ts` (~200: assembly, numbering, phase table, line map), `check.ts` (~100), `templates/hosts/*.ts` (~60 each, replacing `hosts/*.md`, `hosts.ts`), fixture tests (~200). Changed: `emit/build.ts` (+15: compose into `dest`, drop `conductor.md`, `uses.json`), `targets/codex.ts` (+10, openai.yaml), `transforms/text.ts` (+10, tokens in every shipped `.md`), `lint.ts` (+20), `cli.ts` (+20, `trace`). About 800 lines.

The build fails on: an unknown step or token; a missing `requires:` step or `expects:` line; a step used twice; phases not numbered 1…n; a `uses:` or `[paste:]` target gone from packs; Always plus Start over 2,000 tokens; over 500 lines. It warns over 5,000 tokens.

Traceability: output carries no markers (whether Claude strips comments from SKILL.md is undocumented [verified: prior-art.md]). `harness-compiler trace <built file>:<line>` prints the source `file:line` from the line map.

## 5. What happens to

- **flow-rules.md:** deleted; its sections become steps, Scope and Reports move into review-code (#71). AGENTS.md:63-66 rewritten.
- **uses.json:** deleted. The compiler exports `flowUses(root)` from `uses:` lines; `flows-uses.mjs` imports it for dependencies and the README tree. Its "mentioned" check is true by construction.
- **Override markers:** unchanged; `checkOverrides` already scans every non-pack `.md` under `plugins/flows` [verified: flows-uses.mjs:126-131].
- **writing's tests** (writing-skill.test.mjs:41-43) and `checkTemplates` retarget to `steps/copyedit.md`, `gate.md`, `deviations.md`.

## 6. Migration (one PR, commits in order)

1. Compiler and fixture tests; no output diff.
2. /implement, extracting most build steps.
3. /fix, /upgrade (many packages, batched migrations).
4. /build-feature; then /research-feature, /understand, /learn; then /review-code.
5. /refactor: existing steps plus `characterization-tests` and a "behaviour doesn't change" Always line.
6. Delete flow-rules.md, uses.json, host.md; update AGENTS.md, README.

Each conductor is two commits: a move (review the built SKILL.md's `git diff --word-diff`), then fixes citing evaluation numbers.

## 7. Risks and cost

- /build-feature stays over 5,000 tokens [estimate]; following Execute after compaction rests on R1 [inferred].
- Inline calls load the Always rules twice (~1,500 tokens) against the 25,000-token shared budget [verified: prior-art.md].
- A step edit regenerates up to nine skills on two hosts; steps written apart may mix terms [verified pitfall: prior-art.md].
- /learn must edit `steps/`; cockpit tests on source SKILL.md break.
- Cost: ~800 compiler lines, ~25 steps, nine conductors rewritten.

## Design checks-first: Checks-first composed flows

## 1. Source layout

```
plugins/flows/steps/<step>.md          shared steps, one per file (finish.md, gate.md, deviations.md, start.md …)
plugins/flows/steps/kinds.json         {"build": ["run-rules","start","gate","deviations","execute","finish"], "research": […], "review": […], "inline": […]}
plugins/flows/skills/<flow>/SKILL.in.md   flow source; references/, scripts/ and tests/ stay beside it
plugins/flows/skills/writing/SKILL.md  stays hand-written
```

A step has a `key: value` header (about 15 lines of regex parsing, no YAML) and a Markdown body that reads the same in every flow:

```markdown
---
step: finish
after: execute
writes: Run verdict, Learned
uses: flows-conductor: review-code, learn
---

Read `<flow-root>/skills/review-code/SKILL.md` and run it inline on `branch`, up to its Decide gate. Its intent is this
flow.md with the spec and plan it links, and whether execution ran natively. Then run `/learn` on this flow, so its
entries and Parking-lot lines land before the branch is finished. Then run review-code's Decide. Ask the user for the
**Run verdict** (worked as a whole, yes or no; clean, yes or no), record it, and set `phase: done` and `now:`.
```

A flow is frontmatter, its own prose, `[phase: …]` lines and bare `[step: …]` lines. Steps take no parameters:

```markdown
---
name: implement
kind: build
flow: implement
template: build
description: 'Build what you are given, as given: an approved plan, or a ticket … no argument resumes.'
uses: superpowers: subagent-driven-development, executing-plans; pstack-picks: how
---

# implement

The design is done; build it as given. Planning is /build-feature's.

[step: run-rules]
[step: start]
[phase: Read | runs: the input, pstack `how` | output: what's settled, what's open]
Read the input and everything it links.
[step: ground-code]
A ticket passes when it says what behaviour changes, how you'd know it's done, and leaves no design decision open.
A gap: stop, name it, offer `/build-feature`. A plan passes when glance accepts it.
[step: plan-shape]
[phase: Approve | runs: the contract, read back | output: approved input]
[step: gate]
[phase: Execute | runs: superpowers `subagent-driven-development` or `executing-plans` | output: code, tests]
[step: execute]
[phase: Finish | runs: `/review-code`, `/learn` | output: branch handled, lessons kept]
[step: finish]
```

This finish step fixes evaluation findings #2, #3, #36 and #87 once, for every build flow.

## 2. The built SKILL.md

The parts come in this order:

1. Frontmatter.
2. Title and the flow's purpose.
3. The phase table, drawn from the `[phase:]` lines (`**Gate n**` where a phase holds `[step: gate]`).
4. A State line, generated from the frontmatter: `flow: implement`, the template link, `phases read | approve | execute | finish | done`.
5. `run-rules`, the rules that hold for the whole run: host, gates, copyedit, deviations, rulings, agents, commits, untrusted data. Its last line says: "If text after a phase heading is gone from your context, re-read `<skill-dir>/SKILL.md`."
6. Start or resume.
7. The phases.

Every rule is inline. `references/` keeps only what an agent looks up: templates, prior-art.md, plan-review.md, literature.md, review-code's lens briefs, tests-all.md and harden-all.md, and the Stack packs and Missing piece tables. It also holds a generated `builder-brief.md` with the brief clause and the ponytail pastes.

**Size of /build-feature (estimate).** Today's SKILL.md is 12.9 KB without markers. Add the flow-rules sections it would inline (13.5 KB, measured without markers and without Scope, Reports, Stack packs and Missing piece), take off about 1.5 KB of cross-references that go away, and add about 0.8 KB of new text: about 25.7 KB. At today's 78 bytes per line that is about 330 lines, and at 4 bytes per token about 6,400 tokens. That is a heuristic; I ran no tokenizer. The result goes over the 5,000-token recommendation [verified: prior-art.md, agentskills.io]. /implement comes to about 4,000 tokens.

## 3. Host differences

Steps write neutral tokens:

- `<host:ask>`, `<host:explore>`, `<host:monitor-checks>`, `<host:handover>`, `<host:web-search>`, `<host:skill-dir>`
- `<model:mechanical|search|judgment>`
- `<host:adapter>`, which inlines `templates/hosts/<target>.md` and replaces `references/host.md`

`tools/harness-compiler/src/templates/hosts/terms.ts` maps each token per target. Claude Code gets `AskUserQuestion`, `Explore` agents, `Monitor`, `!`, haiku, sonnet and opus. Codex gets the user-question tool, read-only subagents, polling `gh pr checks`, "ask the user to run it", and "the session's model". The Codex adapter forbids changing the user's model [verified: templates/hosts/codex.md:8]. A step that declares `needs: subagents` must contain a `Without subagents:` line, which fixes #15 and #64.

## 4. Build stage

**New files**

- `src/flows/compose.ts` (~180 lines): parse, expand, number gates, render the table and State line, resolve `[paste: ponytail/skills/ponytail/SKILL.md#The smallest complete change, without "Lazy code without its check"]`, strip override markers.
- `src/flows/checks.ts` (~150 lines).
- `terms.ts` (~50 lines).
- `test/flows.test.ts` (~220 lines).

**Changed files**

- `emit/build.ts` (+15): compose before `transformMarkdown`, and don't ship `SKILL.in.md` or `steps/`.
- `lint.ts` (+20).

**Checks.** Each one fails the build:

1. An unknown step, phase field, host token, or a token missing from one target's map.
2. A step that the flow's kind requires (`kinds.json`) is missing, or `after:` order is broken (for example `learn` before `finish`).
3. Gate-line text appears outside `gate.md`, or a build flow has no gate. This makes "every gate recorded" structural.
4. A build or research flow without a Run verdict.
5. A `writes:` section missing from the flow's template. This would have caught #41 and #60.
6. Claude-only names (Monitor, Explore, subagent_type, WebSearch, WebFetch, Skill tool, AskUserQuestion, model names) in `steps/` or `SKILL.in.md`, checked by lint.
7. A `[paste:]` heading or excluded sentence no longer in the pack. This replaces six override markers and fixes #91.
8. A `node …mjs` or `references/…` path in the built text that doesn't resolve in that target's tree. This catches #1.
9. A uses mismatch: every built `<packs>/x/skills/y` and pack skill name must be in the union of the `uses:` lines, and every listed name must appear in the text. This fixes #47 and #61.
10. Size: the end of `run-rules` plus start must fall before an estimated 5,000 tokens. A whole skill over 5,000 tokens is a warning.

A step used by only one flow is a warning, against over-abstraction.

**Traceability.** Each expanded step starts with `<!-- step: finish -->` in the built file, about 10 tokens each, so a grep goes from any sentence to its step file. Whether Claude strips comments in SKILL.md is unknown [inferred].

## 5. Existing pieces

- **flow-rules.md:** deleted. Its text is split into steps, and Scope and Reports become review-code-only prose (#71).
- **uses.json:** deleted. The `uses:` headers replace it. `scripts/flows-uses.mjs` imports `compose.ts` to get the union, then writes the dependencies and the README tree as it does today.
- **Override markers:** they stay in step and flow sources with the same syntax. `checkOverrides` scans `plugins/flows/**/*.md`, so it covers `steps/` unchanged.
- **checkTemplates:** its RULES_FILE and PLAN_FILES checks move into the compiler.
- **writing's tests:** the flow-rules test points at `steps/copyedit.md`.
- **Cockpit test (`phases.rs`):** it moves to `.claude-plugin/flows/skills/*/SKILL.md`. The table shape is unchanged.
- **AGENTS.md:63-66:** rewritten.

## 6. Migration, one PR in reviewable commits

1. Compiler and checks, with fixtures. The built output stays byte-identical.
2. Extract the steps from flow-rules with their text unchanged except host tokens, and convert /implement. Review this as a diff of old SKILL.md plus flow-rules against the new built file.
3. /fix and /upgrade (many packages, batched migrations).
4. /build-feature and /research-feature.
5. /review-code, /learn and /understand.
6. Add /refactor, built almost entirely from existing steps.
7. Delete flow-rules, uses.json and host.md, and update the docs.
8. Fixes that composition doesn't remove, one commit per group of finding numbers.

Commits 2–6 only move text. Behaviour changes are only in commit 8 and in /implement's no-plan rule.

## 7. Risks and costs

- **Size:** /build-feature is about 6,400 tokens, so after compaction its last phases may be cut [verified: prior-art.md, skills#skill-content-lifecycle]. Mitigations are the order, the re-read line and the size check. Shrinking it further is still open work.
- **Shared budget:** a build flow that reads review-code and learn inline loads about 14,000 tokens of partly repeated rules against the 25,000-token shared budget [verified: prior-art.md].
- **Wording:** steps that must read the same everywhere get generic wording, and a flow's prose can contradict a step. The build can't check meaning [inferred].
- **Review effort:** reviewers read sources and built output.
- **Compiler cost:** about 640 compiler lines including tests, and a mini-syntax only this repo knows.
- **Cockpit:** the test changes its path.

## Judges

### Judge: engineering

| design       | author | agent | drift | hosts | cost | correct | total |
| ------------ | ------ | ----- | ----- | ----- | ---- | ------- | ----- |
| minimal      | 5      | 3     | 3     | 3     | 5    | 4       | 23    |
| agent-first  | 3      | 5     | 4     | 4     | 2    | 3       | 21    |
| checks-first | 4      | 4     | 5     | 4     | 3    | 3       | 23    |

- **minimal**. Strongest: It keeps `plugins/flows/skills/<flow>/SKILL.md` as the source file name. That leaves flows-uses.mjs's conductor detection (frontmatter `disable-model-invocation: true`, flows-uses.mjs:18-29) and its 'no SKILL.md' check (:58-60) unchanged, and the skill scanner still finds every conductor. Steps sit outside catalog `resources` (skills, references, packs, agents, hooks/prose.mjs), so they never ship, and both lint and checkOverrides (conductorDocs, flows-uses.mjs:126-131) already walk them. It is plain Markdown copied byte for byte with one directive, which is exactly what the user asked for, at about 150 compiler lines. The 'built text that names flow-rules' check is the one guard any design has against dangling citations. Weakest: Host handling covers only steps. Every subagent brief and deep method under references/ is copied rather than composed, so the Claude-only names in them still reach Codex: lenses.md's Model column, plan-review.md's model spread, copyedit.md's `subagent_type`/`opus`, and WebSearch/WebFetch in prior-art.md and literature.md. The proposed flows-only lint phrase list would then either fail on those files or have to exempt them. Either way #12 and #13 are not removed by construction, and the design has no fallback mechanism for them. It also has no hard check on the rules-first budget: rules come first only by authoring convention, with a whole-skill size warning and nothing that fails. Errors: (1) It claims the lint phrase list removes #12, #13 and #81 by construction. #12's own evidence is in reference files that are never composed: lenses.md, plan-review.md and copyedit.md, which hold opus/sonnet/subagent_type, plus checks.md's Monitor for #81. (2) It says the cockpit 'may stop parsing phase tables [inferred]'. That is certain, not inferred: crates/flow-cockpit/core/src/doc/phases.rs:134-136 reads the source plugins/flows/skills/<x>/SKILL.md, which would then hold `[step: phases]`. (3) Migration step 1 says outputs stay byte-identical, yet compose runs over every flows skills/*/SKILL.md and strips override markers. That would change build-feature's output (747 B of markers) unless stripping happens only in files that hold a step line. (4) The finish step claims to remove #20, but #20 also covers 'no step commits the fix, flow.md or audit file' (evaluation.md:32), and the step adds no commit. (5) It overlooks the references that cite flow-rules sections, which go dangling: harden-all.md:43, lenses.md:38,67, tests-all.md:3, docs.md:11. Its 'names flow-rules' check must cover references/ too, not only the built SKILL.md. Verified correct: targets/claude-code.ts:64 and codex.ts:25 (marketplacePrefix); codex.md:8 (the session's model); check-repo.mjs importing .ts from .mjs on node>=26; lint walking all of plugins/.
- **agent-first**. Strongest: It has the best host story. Typed per-host token maps fail on a missing token. A `subagent: yes` step gets an appended no-subagent fallback (#15). `invocation: explicit` emits Codex `agents/openai.yaml` with `allow_implicit_invocation: false`, the form already shipped for packs (.agents/plugins/flows/packs/mattpocock-picks/skills/*/agents/openai.yaml); today Codex gets only `disable-model-invocation: true`. The build fails when Always plus Start exceeds 2,000 tokens. The finish step adds a commit offer, which actually closes #20. Weakest: The compiler cost and the mismatch between source and output. About 800 new lines grows a 1,455-line compiler by more than half. Splitting each step into `## Always` (lifted and deduplicated) and `## Do`, plus build-numbered bold leads and gates and `expects:` lines, means a step's source no longer reads like what the agent gets. A `trace` command with a line map is needed to get back. That is more machinery for one owner to maintain, and closer to the layer/DSL approach prior-art.md warns about. Errors: (1) `{{token}}` substitution 'in every shipped .md' (transforms/text.ts) with 'fails on an unknown token' would hit vendored double-brace text: plugins/flows/packs/mattpocock-picks/skills/improve-codebase-architecture/HTML-REPORT.md and csharp-skills' nuget-trusted-publishing (GitHub `${{ }}`), 14 lines across plugins/. It must be scoped to flows' own files. (2) 'A step used twice' fails the build, yet gates are 'numbered by the build'. build-feature has Gate 1 and Gate 2, so either `[step: gate]` appears twice and fails, or the gate text needs another mechanism; the design doesn't say which. (3) Renaming to conductor.md breaks scripts/flows-uses.mjs: checkUses reports `skills/<x>: no SKILL.md` for every conductor (:58-60), and flowsSkills finds conductors by `disable-model-invocation` in SKILL.md (:18-29). The design mentions only the dependency and README parts. The Cisco skill-scanner (`scan-all plugins --recursive`) stops seeing conductors at all. (4) It cites flow-rules.md:8-10 for the runtime subagent rule; the 'If subagents are unavailable' text is at :10-12. (5) It calls the 'mentioned' check 'true by construction'; a step's `uses:` can still list a name its body never mentions. (6) 6,030 B of override markers 'measured': the marker text in flow-rules plus build-feature comes to about 5,190 B (4,443 + 747), so the figure is slightly off.
- **checks-first**. Strongest: Its build-time checks target real failure classes from the evaluation. Check 8 resolves `node …mjs` and `references/…` paths in each target's built tree, which catches #1, the Codex `${CLAUDE_SKILL_DIR}`→`.` copyedit breakage that composition alone never removes. Checks also cover `writes:` against template sections (#41, #60), a required `Without subagents:` line (#15, #64), `[paste:]` validity (#91), the uses union both ways (#47, #61), and a hard budget that run-rules plus start must fit before 5,000 tokens. It also says to retarget the cockpit test to the generated tree. Weakest: The rename to SKILL.in.md, together with moving checkTemplates into the compiler, spreads changes across flows-uses.mjs, check-repo.mjs and the general-purpose compiler, which then encodes flows/cockpit field names. kinds.json plus `[phase: …|runs:|output:]` lines move toward the structure-as-data the user was unsure about. The required-steps-per-kind list will need editing whenever a flow legitimately diverges, for example /refactor or /understand. Errors: (1) The rename to SKILL.in.md hits the same flows-uses.mjs breakage the design doesn't mention: 'no SKILL.md' at :58-60, conductor detection at :18-29. The example frontmatter also drops `disable-model-invocation: true` and adds non-spec keys (`kind`, `flow`, `template`, `uses`), and nothing says they are stripped and the invocation flag emitted. prior-art.md notes that claude.ai rejects non-spec fields. (2) It says checkOverrides 'scans plugins/flows/**/*.md'; it skips packs/ and agents/ (flows-uses.mjs:129). That is harmless for steps/. (3) Host tokens apply only to steps, and lint check 6 covers only steps/ and SKILL.in.md. references/ (lenses.md, plan-review.md, copyedit.md, prior-art.md) still ship Claude model and tool names to Codex, so #12 and #13 are only partly removed. (4) `<host:skill-dir>` tokens look like the existing literal `<skill-dir>`/`<flow-root>` prose placeholders (flow-rules.md:20-21), which invites confusion. (5) Like the other two, it ignores the references that cite flow-rules sections (harden-all.md:43, lenses.md:38,67, tests-all.md:3, docs.md:11).

**Graft:** Start from minimal. It is the only design that keeps `skills/<flow>/SKILL.md` as the source. That keeps flows-uses.mjs's conductor detection and its 'no SKILL.md' check, the skill scanner's coverage and the loader as they are. It is plain Markdown copied byte for byte with a single `[step: …]` directive, which is what the user described. At about 150 compiler lines it is cheap to maintain. Compose before transformMarkdown, so `${CLAUDE_PLUGIN_ROOT}` and the Codex portableText rewrite still apply at the dest path, and keep the CRLF tolerance that the Windows CI leg needs.

Graft these from checks-first:
(a) Check 8: resolve every `node …mjs` and `references/…` path in each target's built tree. This is the only check that catches #1.
(b) A `writes:` header on steps, checked against the template headings (#41, #60).
(c) Steps that need subagents must carry a `Without subagents:` line (#15, #64).
(d) Make the budget a failure, not a warning: rules plus Start must fit before about 5,000 estimated tokens, so 'rules first' is enforced rather than conventional.
(e) Retarget the cockpit's phases.rs:134 to the generated .claude-plugin tree.

Graft these from agent-first:
(a) A small typed per-target token map (Record<Token,string> in templates/hosts/<id>.ts) for one-word host names: question tool, explore, web search, model tiers, watch checks, the `!` handover. Use minimal's host steps only for whole paragraphs such as the adapter. Apply tokens to flows' own non-pack .md files, references/ included, never to vendored packs, so they don't collide with `{{`/`${{ }}` there. That is what actually removes #12, #13 and #81.
(b) Emit Codex `agents/openai.yaml` with `allow_implicit_invocation: false` for conductors.
(c) The finish step's commit offer (#20).
(d) Optionally, a generated builder-brief.md that uses `[paste: <pack path> …]` instead of runtime pastes (#91). Keep the override-marker check for anything not pasted.

Three gaps none of the designs cover:

1. Extend minimal's 'names flow-rules' check to references/, and rewrite the deep-method references that cite flow-rules sections (harden-all.md:43, lenses.md:38/67, tests-all.md:3, docs.md:11). Either inline the rule or allow `[step:]` in references too.
2. Re-anchor the `<flow-root>` definition (flow-rules.md:20), which today means 'the folder containing this references/ directory'.
3. Point scan-skills at the generated trees as well as plugins/, since composed step text never appears in a source SKILL.md.

### Judge: use

| design       | author | agent | drift | hosts | cost | correct | total |
| ------------ | ------ | ----- | ----- | ----- | ---- | ------- | ----- |
| minimal      | 5      | 3     | 3     | 3     | 5    | 4       | 23    |
| agent-first  | 4      | 5     | 4     | 5     | 2    | 3       | 23    |
| checks-first | 3      | 4     | 5     | 4     | 3    | 3       | 22    |

- **minimal**. Strongest: It is the closest to how the user writes. A flow keeps real `## Phase n:` headings and its own prose, and has one directive (`[step: name]`). Steps are plain Markdown pasted byte for byte, so grep traces any sentence back to its file. Because SKILL.md stays where it is, flows-uses.mjs's conductor detection (frontmatter `disable-model-invocation`, flows-uses.mjs:19-29), the catalog `skills` resource and the loader are all untouched. It is also the cheapest: about 150 compiler lines, and steps/ is not a catalog resource, so it never ships (catalog.json:12). Weakest: The agent gets a large verbatim block of rules: about 17.5 KB of flow-rules plus the host step, with no sub-headings, no deduplication and no budget on the rules plus Start. That pushes Start and every phase past the 5,000-token compaction cut, and the design leans entirely on an unmeasured re-read line. Host variation also stops at whole-paragraph host steps inside composed SKILL.md files. The references agents still read (writing/references/copyedit.md:24 `subagent_type`/`opus`, build-feature/references/plan-review.md:10 `fable`/`sonnet`, prior-art.md and literature.md WebFetch, review-code/references/checks.md:59-61 `!` and `Monitor`) have no per-target mechanism. The proposed flows phrase lint would either flag them or force them to neutral wording that drops Claude's specifics, so the claim that #12, #13 and #81 are removed 'by construction' is overstated. Errors: (1) 'The dependencies ... and the check that each listed name appears in the text keep working' is wrong as stated: checkUses tests `skill.includes(name)` against the source SKILL.md (scripts/flows-uses.mjs:76,84,113). Names that move into steps (for example finishing-a-development-branch) disappear from the source, so the check has to read composed text. (2) The cockpit breaking is labelled '[inferred]', but it is certain: crates/flow-cockpit/core/src/doc/phases.rs:130-136 parses `| <n> <Name> |` rows from plugins/flows/skills/*/SKILL.md. The source would have `[step: phases]` and the table changes to `| Phase | Steps |`. (3) The flows-only phrase lint ignores the Claude names in references/ (files listed above). It runs over all of plugins/ (lint.ts:69-83), so it fails at once unless those files are rewritten too. Verified as correct: lint walks every file under plugins/; checkOverrides scans steps/ (flows-uses.mjs:126-131); targets/claude-code.ts:64 and codex.ts:25 set the marketplace prefixes; host.md is emitted at claude-code.ts:100 and codex.ts:68 (the '-1 line each'); engines node>=26, and check-repo.mjs:7 already imports .ts from .mjs; marker byte counts (742 in build-feature, about 5.2 KB in flow-rules) roughly match.
- **agent-first**. Strongest: It is the best built skill for an agent. Short numbered `## Always` rules come first, and the build fails when Always plus Start exceeds 2,000 tokens, so the rules and Start survive compaction by construction. It adds a generated State line, numbered leads, a Missing-piece table filtered to the rows this flow's `uses:` needs, and a Look-up list. Host handling is the most complete. `{{token}}` substitution in transforms/text.ts covers every shipped .md, references included. `invocation: explicit` finally maps to Codex's `agents/openai.yaml` `allow_implicit_invocation: false`, which the compiler does not emit today (grep finds no openai.yaml in src/). Its Finish step puts the Run verdict, Decide, /learn and an offer to commit in the right order. Weakest: Cost and authoring weight. It is about 800 compiler lines with a line map and a `trace` command. Steps are split into `## Always`/`## Do`, carry `expects:` (a soft slot close to the per-step parameters the user rejected) and add `[paste:]` directives. The 2,000-token Always cap also conflicts with inlining every rule: flow-rules' State, Agents, Homes, Loading skills and Deviations are global rules of about 4,000+ tokens. Either they get compressed to one or two lines each, which risks losing behaviour in a 'move only' commit, or they spill into Do sections, which brings back the compaction problem. Errors: (1) Renaming the source to `conductor.md` breaks flows-uses.mjs, and the design never mentions it. flowsSkills only sees directories with a SKILL.md and detects conductors by `disable-model-invocation: true` (flows-uses.mjs:19-29). checkUses reports '<dir>: no SKILL.md' (:59-61). `invocation: explicit` would make every conductor a non-conductor. Importing flowUses only replaces uses.json and does not fix this. (2) '{{token}} in every shipped .md' with 'unknown token fails the build' would fail on vendored packs: plugins/flows/packs/mattpocock-picks/skills/improve-codebase-architecture/HTML-REPORT.md already contains `{{`. (3) A `Record<Token,string>` catches a missing token only under `npm run typecheck`, not under check:harnesses or npm test (package.json scripts). Parameterised tokens (`{{model:...}}`, `{{user-runs:<cmd>}}`) do not fit a plain string record. Verified as correct: codex.md:3-4 (chat fallback) and :8 (never change the model); flow-rules.md:8-10 (subagents decided at runtime); flows-uses.mjs:126-131; writing-skill.test.mjs:41-43; the size inputs (13,708 + 25,073 + about 2,087 bytes; markers about 5,983 bytes measured against 6,030 claimed).
- **checks-first**. Strongest: It has the most drift and composable-finding checks enforced at build time. Each flow kind must contain its required steps, in `after:` order. Gate text may appear only in gate.md. A build or research flow without a Run verdict fails. Every `writes:` section must exist in the flow's template (#41, #60). A `needs: subagents` step must contain a 'Without subagents:' line (#15, #64). The `uses:` union is checked against the built text (#47, #61). `[paste:]` is checked against the pack (#91), and rules plus Start must fit before the 5,000-token cut. It also keeps today's three-column phase-table shape, so the cockpit test only moves to the built path, which is the 'keep what passes for free' the user asked for. Weakest: It is the hardest source to write and read the way the user writes ('do ticket x, then step y'). Phases are `[phase: Read | runs: ... | output: ...]` bracket lines instead of headings. A `kinds.json` decides which steps a flow must have, and steps carry `step:/after:/writes:/uses:` headers. Host tokens use `<host:ask>`/`<model:...>`, which look like the existing literal placeholders `<flow-root>`/`<skill-dir>`/`<packs>` (flow-rules.md:19-22) and like HTML tags. kinds.json drifts toward the structure-as-data the user deprioritised. The `<!-- step: -->` markers also ship tokens into every built skill. Errors: (1) `SKILL.in.md` breaks flows-uses.mjs in the same way: there is no SKILL.md, so checkUses reports 'no SKILL.md' (flows-uses.mjs:59-61), and conductor detection reads SKILL.md frontmatter (:19-29). Only the uses union is said to move. (2) The claim that check 8 'catches #1' does not hold. The broken command lives in plugins/flows/skills/writing/references/copyedit.md:43 (shipped to Codex as `node "./../writing/scripts/compare.mjs"`, .agents/plugins/flows/skills/writing/references/copyedit.md:43). That file is a reference, not composed 'built text'. The bug is resolution against the shell's working directory, which a file-relative existence check passes. (3) Lint check 6 covers only steps/ and SKILL.in.md, so the Claude names in references/ (copyedit.md:24, plan-review.md:10, checks.md:59-61, prior-art.md:20,57) still reach Codex. Verified as correct: 12.9 KB without markers and 78 bytes per line (13,708/176); codex.md:8; checkOverrides scanning flows' .md files apart from packs/ and agents/; phases.rs parsing SKILL.md tables (phases.rs:130-182); about 640 lines adding up from its own parts.

**Graft:** Start from minimal. It is the source the user can actually write and read: real `## Phase n:` headings, the flow's own prose, a single `[step: name]` directive, and steps that are headingless plain Markdown copied byte for byte. SKILL.md stays in place, so flows-uses.mjs conductor detection, the catalog `skills` resource and the loader stay unchanged, and it costs about 150 compiler lines. Fix its gaps by grafting.

From agent-first:
(a) Apply host tokens (`{{ask-user}}`, `{{model:...}}`, `{{watch-checks}}`, `{{user-runs}}`) in transformMarkdown to every shipped non-pack .md, references included, so copyedit.md, plan-review.md, the lens briefs and checks.md get per-target wording. Keep the per-target map in templates/hosts/, fail the build (not only typecheck) on a missing or unknown token, and skip packs/, where `{{` already occurs.
(b) Map `disable-model-invocation` to Codex `agents/openai.yaml` with `allow_implicit_invocation: false`.
(c) Add a build-time token budget on the rules plus Start, as a failure or at least a warning, with a generated State line and short rule leads at the top. Do not force a 2,000-token cap in the move-only commits.
(d) Render the Missing-piece rows filtered to the flow's `uses:`.
(e) Use its Finish order: Run verdict, review-code up to Decide, /learn, offer to commit flow.md/audit/lessons, then finishing-a-development-branch.
(f) Use `[paste: <pack path> "<first>" ... "<last>"]` with a check that the pack still holds the text, for the ponytail texts (#91).

From checks-first:
(a) Render the phase table in today's `| n Name | Runs | Output |` shape and point phases.rs at the built tree, so the cockpit test passes for free.
(b) Require a 'Without subagents:' line in any step that declares it needs subagents (#15, #64).
(c) Require every section a step writes to exist in the flow's template (#41, #60).
(d) Compute the uses union from composed text and check it there; minimal's checkUses 'mentioned' check must read built text, not the source.
(e) Check the built output, references included, for cwd-relative script paths, aimed at #1.

Leave out: kinds.json, `<!-- step: -->` markers in output, source renames to conductor.md or SKILL.in.md, the `## Always`/`## Do` split and the `trace` command (grep works because steps are verbatim).
