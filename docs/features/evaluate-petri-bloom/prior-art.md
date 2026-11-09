Source check: 32 confirmed, 6 not supported (corrected below), 0 couldn't open; 3 inferred claims: 2 follow, 0 partly, 1 doesn't (removed).

Gaps: Context7 was not queried (Inspect, Promptfoo and Claude Code docs were fetched from their own sites instead). Petri's `using/running.html` and `using/concepts.html` pages were not opened, so Petri's cost and parallelism guidance comes only from its landing page. Petri Bloom's repo source (prompts, scorer code) was read only through its docs and issues, not file by file. No postmortems or blog posts on Petri Bloom itself turned up.

**Tool facts** (Petri Bloom)

- What it is: "Framework for generating behavioral evaluations of frontier AI models" [source: GitHub API `repos/meridianlabs-ai/petri_bloom`].
- Licence: MIT [source: same].
- Latest release: 0.2.6, published 2026-07-15 [source: `releases/latest`]. Repo created 2026-04-02, last push 2026-11-09, 48 stars, not archived [source: repos endpoint].
- Security advisories: none (the `security-advisories` endpoint returned `[]`) [source].
- Needs: Python >=3.12, `inspect-ai>=0.3.237`, `inspect-petri>=3.0.11`, plus the openai, anthropic and google-genai SDKs; model API keys in the environment or a `.env` [source: [pyproject.toml](https://github.com/meridianlabs-ai/petri_bloom), read through the contents API; [landing page, Installation](https://meridianlabs-ai.github.io/petri_bloom/)].
- Latest versions seen: inspect_ai 0.3.288 (2026-11-07), inspect_petri 3.1.1 (2026-10-01), promptfoo 0.125.1 (2026-10-25) [source: each repo's `releases/latest`].

## What Petri Bloom does

A behavior directory (`BEHAVIOR.md` with YAML options, optional `examples/`) goes through `understanding`, then `ideation`, which writes markdown seeds and 1-10 judge dimensions under `scenarios/`. `inspect eval petri_bloom/bloom_audit` then maps each seed to an Inspect sample; an auditor model plays the user and simulates tools, a target answers, a judge scores. The stages write editable markdown, so seeds can be reviewed and frozen for reproducibility [source: [Pipeline](https://meridianlabs-ai.github.io/petri_bloom/pipeline.html), Ideation, Editing Outputs]. Models are set per role (`--model-role auditor=…`) [source: [Evaluation, Model Options](https://meridianlabs-ai.github.io/petri_bloom/evaluation.html)].

## Approaches

### A. Generated scenarios, simulated-user rollouts

**Shape:** an LLM writes scenario seeds from a behavior description; an auditor model drives a multi-turn run against the target; a judge scores the transcript.
**Used by:** Petri Bloom; [Bloom original](https://github.com/safety-research/bloom) (stages Understanding, Ideation, Rollout, Judgment; now frozen, "new home" is Petri Bloom) [source]; [Petri](https://meridianlabs-ai.github.io/inspect_petri/) (170+ built-in seeds, 38 judge dimensions) [source].
**Good at:** probing a behavior no fixed dataset covers, with variations along axes (`noise`, `emotional_pressure`) [source: [Behaviors, Configuration](https://meridianlabs-ai.github.io/petri_bloom/behaviors.html)].
**Costs:** three model roles per sample, 15 auditor turns by default, so every sample is many calls. Petri warns its full default set is "a few hours and a non-trivial API spend" [source: Petri landing page, Running an Audit]. Epochs average the score by default [source: [Evaluation, Epochs](https://meridianlabs-ai.github.io/petri_bloom/evaluation.html)].
**Bad fit:** a pass/fail regression gate in CI [inferred]. Results should be cited with the full seed config [source: Petri Bloom landing page]. The judge's 1-10 score is a rubric reading, not a deterministic check [inferred].

### B. Fixed cases with assertions and model-graded rubrics

**Shape:** a table of prompts, each with deterministic checks and optional LLM-judge assertions; pass/fail plus a score.
**Used by:** Promptfoo's `llm-rubric` returns `{reason, score, pass}` and takes a `threshold` [source: [llm-rubric](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/), Threshold Support]; Inspect AI ships text matchers and `model_graded_qa()` as scorers [source: [Scorers](https://inspect.aisi.org.uk/scorers.html)]. Promptfoo's red-team mode adds generated adversarial inputs on top [source: [Red teaming](https://www.promptfoo.dev/docs/red-team/)].
**Good at:** CI use [source: red-team page, "CI/CD integration"].
**Costs:** you write or generate every case; a default grader needs provider credentials (an API key, a login or a cloud credential) [source: llm-rubric, How it works]; one red team "can range anywhere from a few cents to hundreds of dollars" [source: red-team page, Step 1].
**Bad fit:** a grader that returns a score but no `pass` passes any positive score unless a `threshold` is set [source: llm-rubric, Common misconfiguration].

### C. Run the real agent in its host, compare to a no-plugin baseline

**Shape:** each case is a prompt plus graders (regex, tool-called, LLM rubric); runs repeat and are scored with and without the plugin.
**Used by:** `claude plugin eval` [source: [Plugin evals](https://code.claude.com/docs/en/plugin-evals)].
**Good at:** the question "does my skill change what Claude does", including whether the skill triggers; reports a `Δ` against no plugin [source: same, first-run output and "most common first finding"].
**Costs:** "Every eval run and every judge grader is a real model call"; needs Claude Code 2.1.269+ and git 2.31+ [source: Requirements]; defaults are 10 turns and 300 seconds per case [source: Plugin evals]; `--max-cost-usd` is a ceiling on the estimated list-price cost, and spend can pass it [source: same].
**Bad fit:** another host such as Codex, since it runs Claude Code only [inferred]; user settings, hooks, MCP and other plugins are absent from a run, so interactions with them are untested [source: What happens in a run]. A single run is noisy [source: Plugin evals, step 4].

## Pitfalls (Petri Bloom, open issues)

- [#23](https://github.com/meridianlabs-ai/petri_bloom/issues/23): `bloom_audit` formats the system message twice, so literal braces in generated understanding text (for example a quoted JSON tool call) raise `KeyError` on every sample; reported against 0.2.6 and inspect_petri 3.1.0 [source].
- [#33](https://github.com/meridianlabs-ai/petri_bloom/issues/33): ideation overwrites scenarios whose names collide after filename sanitization, such as `tool-misuse` and `tool_misuse`, with no warning; the audit then runs a smaller dataset [source].
- [#21](https://github.com/meridianlabs-ai/petri_bloom/issues/21): the ideation prompt makes some generated target system prompts say "the target model", which is unrealistic [source]. `eval_awareness` and `scenario_realism` assess the evaluation's own quality [source: Pipeline, Judge Dimensions].
- Petri 3.0 changed its Python API; 2.0 stays on a `petri-v2` branch, so the `inspect-petri` pin matters [source: [inspect_petri README](https://github.com/meridianlabs-ai/inspect_petri)].
- Petri can generate harmful content and "model providers may block accounts" that send too many harmful requests [source: Petri landing page, Responsible Use].
- Bloom original is frozen at its last standalone release [source: [safety-research/bloom README](https://github.com/safety-research/bloom)].
