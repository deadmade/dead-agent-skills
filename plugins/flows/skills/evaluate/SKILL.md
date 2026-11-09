---
name: evaluate
description: "Answer 'is this tool useful here?' for a tool you came across: read a URL, an article or a tool's name, work out what it could do for this project, gather prior art, check the sources, and end on adopt, try or skip in one page. Reads only: it never installs or runs the tool, and it never stops to ask. Use for /evaluate <url or tool name> [purpose]."
disable-model-invocation: true
argument-hint: 'A URL, an article or a tool name, then optionally what you would want it for'
template: skills/evaluate/references/evaluation-template.md
---

# evaluate

You read about a tool and want to know whether it belongs in this project. This flow answers in one unattended run and
one page: adopt, try or skip.

[step: phases]

## Rules for the whole run

[step: host]

[step: run-rules]

This flow adds:

- Never stop to ask anything between the start and the page. The one question is a missing argument, before the run
  starts. What the run can't find out goes on the page as assumed or unknown.
- The run only reads. It never installs, builds or runs the tool.
- **The verdicts.** **Adopt**: add it now. It fills a real gap that nothing here covers, is released and maintained, and
  its licence suits this project. **Try**: useful, but reading can't settle it. **Skip**: it doesn't fit, duplicates
  something here, or is too risky.
- Three rules keep the verdicts honest:
  - A case that depends on something only a trial in this project could show (performance here, or a stack no source covers) is a try, never an adopt.
  - An unknown licence, or a skipped or failed source check on the facts an adopt rests on, caps the verdict at try. A fact fails when the check marks it `not supported` or `couldn't open`.
  - The verdict is the run's recommendation. The page says the tool was not tried.

**A missing piece** (a plugin or a pack file this flow uses):

[step: missing-piece]

## Start

The argument is a URL, an article's URL or a tool's name, then an optional purpose. Everything after a URL is the
purpose; without a URL, the first phrase is the name and the rest, if any, the purpose. Without an argument, ask for one
in one line.

/evaluate keeps no flow.md: its record is the page, written from
[references/evaluation-template.md](references/evaluation-template.md). Wherever a rule above says flow.md, the page
stands in.

The run's folder is `docs/features/evaluate-<tool>/`, decided once the tool is known: `<slug>` in the steps below means
`evaluate-<tool>`, and `<tool>` is the tool's canonical name in kebab case, the repository name when it has one.

## Phase 1: Identify

<!-- runs: {{web-fetch}}, {{web-search}}, `pstack-picks:how`, a prior-art agent · output: the tool, the grounding, the purpose -->

A project is a Git root or a dependency manifest; check for one first. Read the argument with {{web-fetch}}. For a name,
find the tool's page with {{web-search}}, and note how the name was resolved and which candidates were rejected. For an
article, find the tool it is about and read that tool's own page; if the article names several tools, judge the main one
and list the others under `Also named`.

Stop with a one-line message and no page when no tool can be identified, the URL can't be opened, or there is no
project.

Otherwise, in one message, start both. Nothing moves a concern in an evaluation, so `pstack-picks:why` doesn't run.
[step: ground-code]
[step: prior-art]

The grounding works on what the tool does, and covers what the project already has for it: code at `file:line`,
dependency manifests, and the agent plugins and skills visible in the session.

The prior-art prompt takes the tool and what it does in place of the feature, and fills its "This codebase" line from the
project's manifests. That prompt and its report never contain the purpose. The prompt also asks for a **Tool facts**
section right after the report's Gaps line, each fact marked `[source]`: licence, latest release and its date, recent
activity, what it needs to run (runtime, services, keys), known security issues, and what the tool is. It prefers the
project's own API (for GitHub, the repository, `releases/latest` and `security-advisories` endpoints) or `LICENSE` file
to the README, and writes "unknown" for a fact it cannot find.

When the grounding returns, take the purpose from the argument, or work out the likeliest use for this project and
record it as the assumed purpose.

## Phase 2: Search

<!-- runs: the source check · output: a corrected report with its counts -->

If the report hasn't landed when the grounding ends, wait for it without ending the run on a question. When it lands,
give the source check the report and the codebase facts only, never the assumed purpose. Correct the report before the
verdict. A tool fact that comes back `not supported` or `couldn't open` stays listed as failed, so the verdict rules can
see it. An alternative resting on an unsupported claim is marked unverified on the page or left out.

## Phase 3: Verdict

<!-- runs: the verdict rules · output: `evaluation.md`, shown in the chat -->

Write `evaluation.md` from the template, with **What it is** and **Evidence** taken only from the corrected report and
the source check's counts under **Evidence**. Apply the verdict rules. For an adopt, say why its case rests on nothing
only a trial here could show.

**Next step**, by verdict: for an adopt, where it goes and what would make it a skip later; for a try, the one small
experiment and the result that would mean adopt; for a skip, what would change the answer.

A page already at that path: carry its verdict and date as one line under the new title, then replace it.

Show the page in the chat with its path, and suggest the next command in one line (for an adopt,
`/build-feature add <tool>; evaluation: <path>`). Commit nothing unless the user asks.
