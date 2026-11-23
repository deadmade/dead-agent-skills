Source check: 31 confirmed, 4 not supported (corrected below), 0 couldn't open.

Gaps: `gh` is not installed here, so I used the same GitHub REST endpoints over HTTPS. I did not open the LICENSE file itself (licence is from the API and README). OSV was checked only through its web list page. Web search timed out, so no blog posts or postmortems beyond issues were found. I did not read the Hacker News comments, and I did not fetch the OSV API entry.

## Tool facts (EGM)

- What it is: an open-source plugin of skills plus reviewer personas for designing and reviewing software specs with agents. [source: [README](https://github.com/google/elephant-goldfish-model)]
- Licence: Apache-2.0. [source: [repo API](https://api.github.com/repos/google/elephant-goldfish-model)]
- Latest release: v0.1.1, 2026-11-06. [source: [releases/latest](https://api.github.com/repos/google/elephant-goldfish-model/releases/latest)]
- Activity: created 2026-09-13, pushed 2026-11-21, 158 open issues and PRs (the API count includes PRs), not archived. [source: [repo API](https://api.github.com/repos/google/elephant-goldfish-model)]
- Needs: a host with fresh-context subagents (Claude Code 2.1.271+ for `omitClaudeMd`). The skills read `agents/` and `resources/` at run time, so install the whole plugin. [source: [harnesses](https://github.com/google/elephant-goldfish-model/blob/main/docs/harnesses.md), [claude.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/claude.md)] Keys or services of its own: failed (source check: not supported; only the offline unit tests are said to need no keys). The test suite is Python 3.10+ and Node 22. [source: [TESTING](https://github.com/google/elephant-goldfish-model/blob/main/TESTING.md)]
- Security: the project lists no advisories. [source: [security-advisories API](https://api.github.com/repos/google/elephant-goldfish-model/security-advisories)] OSV's list search for the name returned no results. [source: [osv.dev](https://osv.dev/list?q=elephant-goldfish-model&ecosystem=)] Open isolation gap: see Pitfalls.
- Outside mention: a Hacker News post (98 points, 32 comments, 2026-11-16) listed by Algolia. [source: [HN search](https://hn.algolia.com/api/v1/search?query=elephant-goldfish-model&tags=story)]

## Comparable implementations

1. **EGM**. The elephant session drafts. Five staged reviews (zoom-out, comprehension, critic, zoom-out, readiness) run in parallel within a stage and in sequence across stages. A synthesizer merges the findings. [source: [architecture](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/architecture.md)]
   - Decision 1: reviewers stop if no fresh-context subagent exists, rather than reviewing in-thread. [source: [harnesses, Delegation](https://github.com/google/elephant-goldfish-model/blob/main/docs/harnesses.md)]
   - Decision 2: one persona text for all hosts, with a thin per-host adapter that sets tools and `omitClaudeMd`. [source: [claude.md, Reviewer isolation](https://github.com/google/elephant-goldfish-model/blob/main/docs/claude.md)]
   - Drift: `egm-drift-report` is a skill that compares each design doc to its code and writes a dated report. [source: [SKILL.md](https://github.com/google/elephant-goldfish-model/blob/main/skills/egm-drift-report/SKILL.md)] The method's source is the author's [essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874) (a blog post by the creator).
2. **Superpowers brainstorming**. One skill with a single fresh-subagent "builder check" over the written design. [source: [SKILL.md, The Written Design](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md)]
   - Decision: the reviewer lists only questions whose wrong guess changes the plan. It skips nitpicks, and the author sorts them into three piles. [source: [builder-check-prompt.md](https://github.com/obra/superpowers/blob/main/skills/brainstorming/builder-check-prompt.md)]
3. **GitHub Spec Kit**. A specify, plan, tasks pipeline with templates, a constitution and a read-only `analyze` command. [source: [spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md)]
   - Decision 1: templates make the same session self-check with `[NEEDS CLARIFICATION]` markers and checklists. [source: [spec-driven.md, Template-Driven Quality](https://github.com/github/spec-kit/blob/main/spec-driven.md)]
   - Decision 2: `analyze` is strictly read-only and checks spec, plan and tasks against each other. [source: [analyze.md](https://github.com/github/spec-kit/blob/main/templates/commands/analyze.md)]
4. **OpenSpec**. Specs under `specs/` are the source of truth. Each change is a folder of deltas (ADDED, MODIFIED, REMOVED) that merges on archive. [source: [concepts.md, Delta Specs](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)]
   - Decision: dependencies between artifacts are "enablers, not gates". [source: [concepts.md, Schemas](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)]
5. **Kiro specs**. Three files (requirements, design, tasks) with phased approval and a Review UI. [source: [Kiro docs](https://kiro.dev/docs/specs/)]

## Approaches

**A. Independent reviewer as the gate (EGM, Superpowers).**
- Shape: an author session writes the spec, then fresh agents read only the file. A human triages the findings.
- Used by: EGM, Superpowers' builder check.
- Good at: finding gaps the author cannot see. The EGM author reports about 30% of critic suggestions are highly valuable, by his own account. [source: [essay, Step 6](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874)]
- Costs: many reviewer runs. The EGM test record shows 9 to 16 reviewers per review, depending on host. [source: [TESTING, Harness Test Record](https://github.com/google/elephant-goldfish-model/blob/main/TESTING.md)]
- Bad fit: a host without fresh subagents (EGM refuses to run there [source]), or small changes. EGM ships `egm-lite` for those. [source: [README](https://github.com/google/elephant-goldfish-model)]

**B. Template and self-check pipeline (Spec Kit).**
- Shape: a fixed artifact chain whose templates and gates constrain the one session, plus a read-only consistency pass.
- Good at: traceability from requirement to task, and consistent output.
- Costs: rigid ceremony. [inferred]
- Bad fit: when you need an author-blind check. The same session still reviews its own work. [inferred]

**C. Living specs with change deltas (OpenSpec, Kiro).**
- Shape: current-behaviour specs plus per-change folders, merged on archive.
- Good at: brownfield work and parallel changes. [source: [concepts.md](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)]
- Costs: a merge or archive step to keep specs honest.
- Bad fit: one-off design docs, and checking prose against code, which is what drift reports do. [inferred]

## Pitfalls

- Host instruction files leak into reviewers. Codex and Antigravity inject `AGENTS.md` and `GEMINI.md` into fresh reviewers, so a reviewer carries the author's priors. Issue #237 is still open as of 2026-11-18. [source: [issue #237](https://github.com/google/elephant-goldfish-model/issues/237)] Claude Code is the control that passes, through `omitClaudeMd`. [source: same issue]
- Reviewer write limits are instructions, not enforcement, for a plugin subagent. [source: [claude.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/claude.md)] The "no source edits in phases 1-4" rule is a convention only. [source: [architecture, Phase 5](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/architecture.md)]
- Cloud hosts have unverified isolation traces. Cowork and ChatGPT Work are partial, tracked in #105 and #106. [source: [TESTING](https://github.com/google/elephant-goldfish-model/blob/main/TESTING.md)]
- Skill-only copying breaks EGM, since skills read persona and standard files at run time. [source: [harnesses](https://github.com/google/elephant-goldfish-model/blob/main/docs/harnesses.md)] Drift detection falls back to code search when a doc has no spec-to-code links, and asks the user to add them. [source: [drift SKILL.md](https://github.com/google/elephant-goldfish-model/blob/main/skills/egm-drift-report/SKILL.md)]
