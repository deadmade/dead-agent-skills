Source check: 37 confirmed, 3 not supported (corrected below), 0 couldn't open; 6 inferred claims: 2 follow, 3 partly, 1 doesn't (removed).

Gaps: web search timed out on every engine, so I read only pages I knew the URL of. I did not read the Bloom paper or blog, any Bloom/Petri source file beyond `pyproject.toml` and the file listing, or the full text of Inspect's scoring-policy page (the fetch was truncated). The LiteLLM compromise is known only from a Bloom PR description, not from PyPI or LiteLLM. context7 was not used (Python and docs-site tools); I fetched the official docs directly.

**Tool facts**

- Frozen `safety-research/bloom`: MIT; no GitHub release (`releases/latest` is 404), tags `v1.1.0`, `v1.0.0`; last push 2026-05-07; README says frozen, development moved to Meridian Labs; 0 published security advisories; Python >=3.11, deps `litellm>=1.80.0`, `pyyaml`, `wandb`; needs provider API keys. [source: `api.github.com/repos/safety-research/bloom`, `/contents/pyproject.toml`, [README](https://raw.githubusercontent.com/safety-research/bloom/main/README.md)]
- `meridianlabs-ai/petri_bloom`: MIT; release 0.2.6 on 2026-07-15; pushed 2026-11-09; failed fact: "8 open issues" (not supported: the API's count includes pull requests, and the open list is 3 issues and 5 pull requests); 0 published advisories; Python >=3.12, deps `inspect-ai>=0.3.237`, `inspect-petri>=3.0.11`, `anthropic`, `openai`, `google-genai`; needs provider API keys. [source: `api.github.com/repos/meridianlabs-ai/petri_bloom` and `/contents/pyproject.toml`, [docs](https://meridianlabs-ai.github.io/petri_bloom/)]
- Frozen repo PR "Critical LiteLLM supply chain compromise advisory" (open, unmerged) says LiteLLM 1.82.7 and 1.82.8 contained malicious code (2026-03-24) and that Bloom depends on LiteLLM. [source: `api.github.com/repos/safety-research/bloom/issues/50`]
- Comparables: Inspect AI MIT, 0.3.288 (2026-11-07); inspect_petri MIT, 3.1.1 (2026-10-01); promptfoo MIT, 0.125.1 (2026-10-25); 0 published advisories each. [source: their `api.github.com/repos/...` endpoints]
- Security issues beyond these: unknown.

## Comparable implementations

1. **petri_bloom** (the subject's successor). A behavior directory (`BEHAVIOR.md` with YAML frontmatter plus `examples/`) is turned by `bloom understanding` and `bloom ideation` into `scenarios/understanding.md`, `scenarios/seeds/` and `scenarios/dimensions/`. Run time maps seeds to Inspect samples and dimensions to a scorer. Decisions: every intermediate is an editable Markdown file; generation is separate from the run. [source: [Pipeline](https://meridianlabs-ai.github.io/petri_bloom/pipeline.html), [Behaviors](https://meridianlabs-ai.github.io/petri_bloom/behaviors.html)]
2. **Petri** (`inspect_petri`). No generation stage: 170+ built-in seed paragraphs, an auditor model plays the user and simulates tools, a judge scores 1–10 on 38 dimensions. Decision: the seed is the unit; the auditor invents the rest at run time. [source: [Petri docs](https://meridianlabs-ai.github.io/inspect_petri/)]
3. **Inspect AI scorers.** Task = dataset + solver + scorer; scorers are text-match or model-graded; unscoreable results are `NaN`, excluded from metrics and counted separately. Decision: "could not grade" is a distinct outcome from "failed". [source: [Scorers](https://inspect.aisi.org.uk/scorers.html), [Scoring policy](https://inspect.aisi.org.uk/scoring-policy.html)]
4. **promptfoo.** One YAML file: prompts × providers × tests, each with assertions (`contains-json`, `javascript`, `llm-rubric`). Red-team mode adds plugins (what to attack) and strategies (how to deliver). Decision: grading is declarative; assertions range from text checks to `llm-rubric`. [source: [config guide](https://www.promptfoo.dev/docs/configuration/guide/), [red-team architecture](https://www.promptfoo.dev/docs/red-team/architecture/)]
5. **`claude plugin eval`** (and skill-creator). `evals/<case>/prompt.md` plus `graders/*.md`; each case runs 3 times with the plugin and 3 without; score is the fraction of graders passed; there are no custom-code graders. Decision: the no-plugin baseline gives Δ, and `tool_used: Skill` is a trigger check, not scored. skill-creator runs a similar with/without comparison from `evals/evals.json`, with a human review viewer. [source: [plugin evals](https://code.claude.com/docs/en/plugin-evals.md), [skill-creator SKILL.md](https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md)]

## Approaches

**A. Generate-then-run, files as state (Bloom, petri_bloom).** An LLM writes scenarios and a rubric; a simulator runs them; a judge scores.

- Good at: coverage of one behavior you cannot enumerate; reproducibility, because seeds are on disk [source: Pipeline page, "leave them in place for long-term reproducibility"].
- Costs: three or four model roles, so every run is many calls [inferred from the role list]; scores depend on generated text.
- Bad fit: a behavior one grader can check, or a suite that must be cheap in CI [inferred].

**B. Built-in seeds plus a simulating auditor (Petri).**

- Good at: exploring many behaviors with no generation step.
- Costs: the full set is "a few hours and a non-trivial API spend" [source: Petri docs]; providers "may block accounts" for harmful requests [source: Petri docs, Responsible Use].
- Bad fit: one targeted behavior, where authoring seeds is the work Bloom automates [inferred].

**C. Declarative cases and assertions (promptfoo, Inspect scorers).**

- Good at: matrix over models and prompts; CI.
- Costs: you write the cases; rubric graders still need a judge model.

**D. Plugin/skill evals with baseline (`claude plugin eval`, skill-creator).**

- Good at: showing what a skill adds, and whether it triggers.
- Costs: every run and judge call bills your account [source: plugin evals, Requirements]; runs need 3×2 repeats to be stable; `--allow-tools` and sandbox needs for Bash.
- Bad fit: scoring a _model's_ behavior across models; it tests a plugin, not a target model [inferred].

## Pitfalls

- **Unscoreable judge read as "behavior absent":** frozen Bloom coerced a missing score to 0, lowering elicitation rates; a fix PR is open. Inspect's policy treats it as unscored. [source: `api.github.com/repos/safety-research/bloom/issues/56`, Scoring policy]
- **Evaluator writes both sides of the conversation**, inflating scores. [source: `api.github.com/repos/safety-research/bloom/issues/49`]
- **Generated text breaks templating:** literal braces in understanding output raise `KeyError` on every sample (0.2.6). [source: `api.github.com/repos/meridianlabs-ai/petri_bloom/issues/23`]
- **Silent data loss:** ideation overwrites scenarios whose sanitized filenames collide. [source: `.../petri_bloom/issues/33`]
- **Evaluation leaks into the target's system prompt** ("target model" wording). [source: `.../petri_bloom/issues/21`]
- **Eval awareness and realism** are scored as separate dimensions because targets may notice the test. [source: Petri and petri_bloom docs]
- **Dependency risk:** the frozen repo pins `litellm>=1.80.0`, a range that included the compromised versions [inferred from the PR text and `pyproject.toml`].
- **Judge instability:** `claude plugin eval` advises a stronger `--judge-model` when a small judge misgrades formatting. [source: plugin evals, "Choose graders that give a stable signal"]
