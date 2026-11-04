---
name: research-feature
description: "Research a design question before anything is built: frame it against this codebase, search papers and engineering sources (vendor docs, postmortems, how other projects do it), weigh the options against the evidence, and write a decision report with a recommendation. One approval gate, no plan, no build, no benchmark; then offers /build-feature with the report as its input. Use for /research-feature [question]; no argument resumes the active research, a run's slug resumes that run."
disable-model-invocation: true
argument-hint: "What should the research answer (or a run's slug)?"
uses: paper-lookup:paper-lookup, mattpocock-picks:grilling
template: skills/research-feature/references/research-template.md
---

# research-feature

Answers a design question with evidence: how to split databases per customer, which queue fits this workload, how
other systems shard. It ends in a report the user approves, not in code.

[step: phases]

## Rules for the whole run

[step: host]

[step: run-rules]

This flow adds:

- Every claim about what works cites a row of the evidence table, and every row cites a source fetched in this
  session (a paper by DOI or arXiv id, or a page). Never cite from memory.
- No plan, benchmark, prototype or measurement. When only a measurement in this repo could settle the question, say
  so as an open question in the report; building and measuring is `/build-feature`'s job.

**A missing piece** (a plugin or a pack file this flow uses):

[step: missing-piece]

## Start or resume

`flow: research`, template: [references/research-template.md](references/research-template.md). A run with a
`## Hypothesis` section was started by this conductor's earlier, build-and-measure version: given its slug, name its
phase, say this version can't continue it, and stop. Without an argument, leave such runs out and list them in one
line.

[step: state]

[step: start]

## Phase 1: Frame

<!-- runs: pstack `how`, then the questions the code doesn't answer · output: grounding, question, constraints -->

Ground first and ask nothing yet:
[step: ground-code]

Write a short summary under **Grounding** (`file:line`). Then write under **Request** the question in one sentence,
the constraints that decide it (scale, latency, cost, team, compliance, what can't change), and what answer would
change what we build. Ask the user only for what the code and the request don't say, one question at a time. Last,
confirm the framed question in one line with {{ask-user}}; a correction reframes it, and Phase 2 starts only on the
user's yes.

## Phase 2: Search

<!-- runs: a literature agent and a prior-art agent, then one source check · output: evidence table, approaches -->

In one message, start both: the literature agent, one fresh agent in the background with the prompt in
[references/literature.md](references/literature.md) and `docs/features/<slug>/literature.md` as its `<report path>`
(in it, paper-lookup is `<flow-root>/packs/paper-lookup/skills/paper-lookup/SKILL.md`, read by path), and the
prior-art agent, whose prompt takes the question in place of the feature:
[step: prior-art]

Without subagents: run the literature prompt yourself too, writing the same file to the same path. The source check
is skipped and recorded under **Skipped**, and every evidence row's source-check result reads `not checked`.

Link both reports under **Artifacts**. Here one source check covers both: when both have landed, give the source
check in prior-art.md both files and say which is which: `prior-art.md` is the report its prompt names, and
`literature.md` is an evidence table, checked the same way row by row. Its codebase facts are those of both prompts.
Then correct both.

Write the evidence table under **Evidence**, rows from both reports, each with its strength on literature.md's scale
(High / Med / Low) and its source-check result, and the approaches under **Prior art**. Thin or conflicting evidence
is a finding, not a reason to pad.

## Phase 3: Weigh

<!-- runs: mattpocock `grilling` on the options against the evidence · output: 2–4 options, a recommendation -->

Follow mattpocock `grilling` on the candidate options, with the evidence as the facts: per option, the rows for and
against it, whether their setting (data size, workload, team) transfers to this codebase, its cost here, and what
would make it a bad fit. Recommended answers are fine. Record each settled choice under **Options**. One option is
always the smallest that would work, named in one line (ponytail's `lite` level), even when it isn't your pick.
<!-- overrides ponytail/skills/ponytail/SKILL.md: "| lite | Build what was asked. Name the smaller option in one line and let the user pick. |" -->

## Phase 4: Report

<!-- runs: `research.md`, copyedited, then `/learn` and one commit · output: the report, lessons, the commit -->

Write `docs/features/<slug>/research.md` and link it under **Artifacts** as the Report:

1. **Question** and constraints, one paragraph.
2. **Answer** in two or three sentences: the recommendation and the main reason.
3. **Evidence**: the table (E1, E2, …: claim, source, type, setting, result, transfers here?, strength), with links
   to both search reports.
4. **Options**: 2–4, each with its shape in two lines, the rows for and against it, its trade-offs for this
   codebase and a rough effort.
5. **Recommendation** and what would change it.
6. **Open questions**, including any a measurement here would settle.

[step: copyedit]

**Gate 1, report approved:** ask the user to approve the report.

[step: gate]

Then, in this order:

1. **Learn.** Run `/learn` (`<flow-root>/skills/learn/SKILL.md`) on this flow, inline inside this run: it skips its
   own start, creates no flow.md, and writes its lines under **Learned** and **Parking lot** in this run's flow.md.
2. **Parking lot.** Show every line under **Parking lot**, /learn's included, and ask for each: do now, a follow-up,
   or drop. Record the answer on its line.
3. **Run verdict.** Ask for it and record it under **Run verdict**.
4. **Do now.** A "do now" line goes into the `/build-feature` request offered below. A doc edit (an ADR, a glossary
   line) is done in this session instead, on the user's yes.
5. **Commit.** Set `phase: done` and `now:` first, since nothing rewrites flow.md after this commit. Then show one
   commit, its message and files: the run folder plus /learn's files and any doc edit from 4. Make it on the user's
   yes, as the run rules say, so the report is in HEAD when a build's worktree is cut.
6. Offer `/build-feature docs/features/<slug>/research.md`, with the "do now" lines in its request and your
   recommendation: it starts a run of its own that links the report as its prior art and reuses this run's
   **Grounding**.
