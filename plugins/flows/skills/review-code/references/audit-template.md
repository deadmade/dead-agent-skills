# Audit template

Copy everything below the line into `docs/audits/<YYYY-MM-DD>-review-<scope>.md`, with the title and the scope line
filled in.

---

```markdown
# Review: <scope>

<scope line>

## Findings

<!-- Every verified finding, most severe first, `confirmed` or `plausible` in the evidence; `bucket` is
`fix before merge` or `worth doing`, so `all fix` resolves from this table. Then the dropped count. After the gate:
`Picks: <finding numbers> | none`, then one line `Fixed <date>: <number>` per pick once its check passes. -->

| #   | severity | where | finding | evidence | fix (recommended) | bucket |
| --- | -------- | ----- | ------- | -------- | ----------------- | ------ |

## Tasks

<!-- One line per task: `Fix <n>: base <sha>`, untracked at start: <files or none>, then `files clean` or
`deviation` (see Deviations). -->

## Rulings

<!-- Calls the fixes made on their own (not deviation-class), one line each, as they are made. -->

## Parking lot

<!-- Cleanups and ideas outside a fix, one line each (`file`: what); not done. The user picks at Decide. -->

## Deviations

<!-- Decisions that go to the user, one per `### <deviation>` heading, then `Status: open` or
`Status: decided <date>: <what>`; below it, why the pick doesn't hold and the options with a recommendation. -->

## Skipped

<!-- Checks and lenses skipped, and why. -->

## Run verdict

<!-- The user's, at Decide: worked as a whole: yes | no; clean: yes | no. -->
```
