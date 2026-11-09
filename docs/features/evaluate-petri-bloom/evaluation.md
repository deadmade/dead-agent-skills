# Petri Bloom: try

It is the maintained way to get a behaviour's rate from generated scenarios, but only a run here can show whether its scores separate a conductor's rule from no rule.

- Date: 2026-11-09
- Read: https://meridianlabs-ai.github.io/petri_bloom/ (release 0.2.6)

## Assumed purpose

Measure how often a model breaks a rule the conductors set (for example, skipping a gate), from generated scenarios and a judge's score.

## What it is

A framework for generating behavioural evaluations of frontier AI models. From a behaviour description it writes editable Markdown seeds and judge dimensions; an auditor model plays the user and simulates tools, and a judge scores the target from 1 to 10.

## Fit here

- Has: twelve `claude plugin eval` cases (`plugins/opt-in/implementation/{rust,csharp}-skills/evals/`; verified), whose every arm scored 1.00 (`docs/features/language-skills/eval-results.md:39`; verified). Conductors are checked by compose-time checks and hand-run seeded agents (inferred, from the grounding).
- Gap: no generated scenarios and no rate for a named behaviour (inferred).
- Against: tools are simulated, so a conductor is tested as text, not as a running plugin (inferred). It needs provider API keys, and no code here holds one (measured by search). It would stand alone beside the plugins (inferred).

## Evidence

- Licence: MIT ([API](https://api.github.com/repos/meridianlabs-ai/petri_bloom)).
- Latest release: 0.2.6, 2026-07-15 ([API](https://api.github.com/repos/meridianlabs-ai/petri_bloom/releases/latest)).
- Activity: pushed 2026-11-09, not archived ([API](https://api.github.com/repos/meridianlabs-ai/petri_bloom)).
- Needs to run: Python 3.12 or later, `inspect-ai`, `inspect-petri`, model API keys ([docs](https://meridianlabs-ai.github.io/petri_bloom/)).
- Security: 0 published advisories ([API](https://api.github.com/repos/meridianlabs-ai/petri_bloom/security-advisories)). Open: literal braces raise `KeyError` on every sample in 0.2.6 ([#23](https://github.com/meridianlabs-ai/petri_bloom/issues/23)).

Source check: 32 confirmed, 6 not supported, 0 couldn't open.

## Alternatives

- `claude plugin eval`: the real agent with and without the plugin; Claude Code only.
- Promptfoo, Inspect scorers: cases you write, with assertions and model-graded rubrics.
- Petri: broad audits from built-in seeds.

## Next step

Run one behaviour, a skipped approval gate, at a small scenario count, with the conductor's text in the target's system prompt and without it. Adopt if the two scores clearly separate, which the twelve cases above never did.

## Skipped

Grounding was reused from this date's Bloom run: same question, same repository.

Not checked: installing and running the tool; its prompts and scorer code; API cost for this project. The tool was not tried.
