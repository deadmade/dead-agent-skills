# Evaluation page template

Copy everything below the line into `docs/features/evaluate-<tool>/evaluation.md`, with every placeholder filled in and
the lines that don't apply left out. Keep the filled page under about 400 words.

---

```markdown
# <Tool>: <adopt | try | skip>

<!-- The reason in one sentence. -->

- Date: <date>
- Read: <the URL, and the version or commit>
- Name resolved: <how a name was resolved and which candidates were rejected; only when the run was given a name>
- Previous verdict: <verdict> on <date>, only for a repeat run

## Assumed purpose

<!-- The likeliest use the run worked out for this project, or "Given: <the purpose>" when the user gave one. -->

## What it is

<!-- Two sentences, from the corrected report. -->

Also named: <other tools the article mentions; only for an article that names several>

## Fit here

<!-- What the project already has for this job (code at `file:line`, dependency manifests, the agent plugins and skills
visible in the session), the gap, and where the tool would go. Label each claim measured, verified, inferred or assumed. -->

## Evidence

<!-- Each with its link, from the corrected report. A fact the source check failed stays listed, marked failed. -->

- Licence:
- Latest release:
- Activity:
- Needs to run:
- Security:

Source check: <confirmed> confirmed, <not supported> not supported, <couldn't open> couldn't open.

## Alternatives

<!-- The prior-art report's approaches, a line each. One resting on an unsupported claim is marked unverified or left out. -->

## Next step

<!-- Adopt: where it goes, and what would make it a skip later. Try: the one small experiment, and the result that would
mean adopt. Skip: what would change the answer. -->

## Skipped

<!-- Checks or steps the run skipped, and why. "None" when there were none. -->

Not checked: installing and running the tool; <anything else the run did not check, and any risk the user must know>.
```
