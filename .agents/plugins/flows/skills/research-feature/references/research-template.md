# Research flow template

Copy everything below the line into `docs/features/<slug>/flow.md`, with the question's name filled in. Keep the
frontmatter first.

- `phase`: frame | search | weigh | report | done

---

```markdown
---
flow: research
phase: frame
now: <one plain sentence: where the run stands and what comes next>
---

# <Question>: research

## Request

<!-- The user's words, verbatim; then the question in one sentence, its constraints, and what answer would change
what we build. -->

## Artifacts

- Report:

## Gates

<!-- One line per gate: `- Gate <n>, <what>: <date>[, <extra>]`. The date stays empty while the gate is open; a
reopening is appended as `Reopened <date>: <why>`. -->

- Gate 1, report approved:

## Skipped

<!-- Phases the user chose to skip, and why. -->

## Grounding

<!-- What the code looks like where the answer lands: modules, entry points, conventions, file:line. -->

## Prior art

<!-- Approaches found, who uses them, key sources; source check: confirmed / not supported / couldn't open. -->

## Evidence

<!-- The evidence table (E1, E2, …) from papers and engineering sources, agreements, conflicts, gaps. -->

## Options

<!-- One `### <decision>` heading per decision, then `Picked: <the choice in plain words>`; below it, the options
offered, the evidence rows and the recommendation. -->

## Parking lot

<!-- Checks, fixes and ideas outside the question, one line each (`file`: what); not done. The user picks at the
end: do now, a follow-up, or drop. -->

## Learned

<!-- What /learn kept, and where. -->

## Run verdict

<!-- The user's, at the end: worked as a whole: yes | no; clean: yes | no. -->
```
