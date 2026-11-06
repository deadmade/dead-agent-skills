# Flow template

Copy everything below the line into `docs/features/<slug>/flow.md`, with the placeholders its first comment names
filled in. Keep the frontmatter first.

- `phase`: ground | brainstorm | grill | plan | evaluate | execute | finish | done

---

```markdown
---
flow: feature
phase: ground
now: <one plain sentence: where the run stands and what comes next>
---

# <Feature>: flow

<!-- Placeholders to fill when copying: `<Feature>`; `now:` one plain sentence. -->

## Request

<!-- The user's words, verbatim. -->

## Artifacts

- Prior art:

- Spec:
- Plan:
- ADRs:
- Glossary:

## Gates

<!-- One line per gate: `- Gate <n>, <what>: <date>[, <extra>]`. The date stays empty while the gate is open; a
reopening is appended as `Reopened <date>: <why>`. A plan gate adds `, execution: subagent-driven | native`. -->

- Gate 1, spec approved:
- Gate 2, plan approved:

## Skipped

<!-- Phases the user chose to skip, and why. -->

## Grounding

<!-- What the code looks like where this lands: modules, entry points, conventions, file:line. -->

## Prior art

<!-- Approaches found, who uses them, key sources; source check: confirmed / not supported / couldn't open. -->

## Findings

<!-- /fix's reproduction and its output, when /review-code runs /fix inline. -->

## Options

<!-- One `### <decision>` heading per decision, then `Picked: <the choice in plain words>`; below it, the options
offered and the recommendation. -->

## Plan review

<!-- Round N: findings, the user's decision on each, what changed, fix checks, fresh-eyes rounds. -->

## Tasks

<!-- One line per task: `Task <N>: base <sha>`, untracked at start: <files or none>, then `files clean` or
`deviation` (see Deviations). -->

## Rulings

<!-- Calls the build made on its own (not deviation-class), one line each, as they are made. -->

## Parking lot

<!-- Cleanups and ideas outside a task, one line each (`file`: what); not done. The user picks at Finish. -->

## Deviations

<!-- Decisions that go to the user, one per `### <deviation>` heading, then `Status: open` or
`Status: decided <date>: <what>`; below it, why the plan doesn't hold and the options with a recommendation. -->

## Walkthrough

<!-- One row per goal: the spec goal, the ticket criterion or the fixed cause. -->

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |

## Review

<!-- /review-code's verdict and what it fixed. -->

## Learned

<!-- What /learn kept, and where. -->

## Run verdict

<!-- The user's, at Finish: worked as a whole: yes | no; clean: yes | no. -->
```
