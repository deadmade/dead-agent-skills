# Bloom: skip

The repository is frozen, and it scores a model on simulated tools, while this project's behaviour lives in plugins that `claude plugin eval` already runs for real.

- Date: 2026-11-09
- Read: https://alignment.anthropic.com/2025/bloom-auto-evals/ and https://github.com/safety-research/bloom (tag `v1.1.0`, last push 2026-05-07)

## Assumed purpose

Measure how often a model breaks a rule the conductors set (for example, skipping a gate), from generated scenarios and a judge's score.

## What it is

An open-source Python framework that generates a behavioural evaluation suite for an LLM from a seed configuration and scores how often the target shows the behaviour. The original repository is frozen; development moved to Meridian Labs as `petri_bloom`.

Also named: Petri.

## Fit here

- Has: twelve `claude plugin eval` cases with graders (`plugins/opt-in/implementation/{rust,csharp}-skills/evals/`; verified), run once; every arm scored 1.00, so they couldn't discriminate (`docs/features/language-skills/eval-results.md:39`; verified). Conductors are checked by compose-time checks and hand-run seeded agents (inferred, from the grounding). The session also has `skill-creator`'s evals (verified).
- Gap: no generated scenarios and no rate for a named behaviour (inferred).
- Against: Bloom needs provider API keys, and no code here holds one (measured by search). It would stand alone beside the plugins (inferred).

## Evidence

- Licence: MIT ([API](https://api.github.com/repos/safety-research/bloom)).
- Latest release: none; tags `v1.1.0`, `v1.0.0` ([README](https://raw.githubusercontent.com/safety-research/bloom/main/README.md)).
- Activity: frozen, last push 2026-05-07. Successor: 0.2.6 on 2026-07-15, pushed 2026-11-09 ([API](https://api.github.com/repos/meridianlabs-ai/petri_bloom)); its "8 open issues" failed the check (3 issues, 5 pull requests).
- Needs to run: Python 3.11 or later, LiteLLM, provider API keys ([README](https://raw.githubusercontent.com/safety-research/bloom/main/README.md)).
- Security: 0 published advisories. An open PR reports malicious LiteLLM 1.82.7 and 1.82.8, within Bloom's `>=1.80.0` ([#50](https://api.github.com/repos/safety-research/bloom/issues/50)).

Source check: 37 confirmed, 3 not supported, 0 couldn't open.

## Alternatives

- `claude plugin eval`: runs a plugin with and without, and bills per run.
- `petri_bloom`: same pipeline, maintained, Markdown intermediates.
- Petri: broad audits from built-in seeds.
- promptfoo or Inspect scorers: declarative cases you write.

## Next step

Skip the frozen repository. The answer changes if you want a behaviour's rate across models, or generated scenarios `claude plugin eval` can't give: then evaluate `petri_bloom`.

## Skipped

None.

Not checked: installing and running the tool; Bloom's source beyond `pyproject.toml`; the LiteLLM compromise is known only from that PR. The tool was not tried.
