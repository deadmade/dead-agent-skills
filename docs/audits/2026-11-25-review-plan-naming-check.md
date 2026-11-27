# Review: plan-naming-check

branch: t3/check-plan-naming ← 4e6a364a, 9 files, +48 −22 plus 1 new file (naming.md, 52 lines), uncommitted

## Findings

| #   | severity | where                                                                        | finding                                                                                                                                                        | evidence                                                                                                                                                                                      | fix (recommended)                                                                                                                                        | bucket           |
| --- | -------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | med      | `plugins/flows/references/naming.md:17`                                      | The kind "Fit" (and lens `naming-fit`) reuses plan review's **Fit** angle; a plan-review Naming finding labelled "Fit" can't be told from the angle's findings | confirmed: `plan-review.md:18` defines the Fit angle; `plan-review.md:20` runs "all four kinds"; Naming tail asks each finding for its kind (`naming.md:47`); naming-fit and naming-domain both raised it | Rename the kind to **Pattern**, the lens to `naming-pattern` (lenses.md, GLOSSARY entry, README row, review-code description)                            | fix before merge |
| 2   | med      | `plugins/flows/skills/review-code/references/report.md:45`                   | The screen still defines Fix before merge as "ships something wrong"; a med naming finding is `fix before merge` in the table and Verdict but may drop to Worth doing on the screen | confirmed: `report.md:11-12` vs the screen bullet; correctness lens and the final reviewer both raised it                                                                                       | "every finding whose bucket is `fix before merge`, however many"                                                                                         | fix before merge |
| 3   | low      | `plugins/flows/references/naming.md:41`                                      | "Naming tail" is a new concept with no glossary term                                                                                                           | plausible: GLOSSARY.md `## Flows` adds only Naming rubric; no tail term exists for the shared or prompt tail either                                                                             | Leave it (no tail has a term), or add one line to the Naming rubric entry                                                                                | worth doing      |

Dropped: 3 (`naming-domain` vs `security-domain`: the same line tells them apart; naming-domain missing the spec: the
intent already carries it, `review-code/SKILL.md:81`; `/refactor` not told: it follows plan-review.md as is).

Picks: 1, 2, 3

- Gate 3, review-code: report: 2026-11-25 (picks 1, 2, 3; interrogate skipped on the user's choice)

Fix check (sonnet, fresh): 1, 2, 3 PASS. Fixed 2026-11-25: 1. Fixed 2026-11-25: 2. Fixed 2026-11-25: 3.

## Tasks

- Fix 1, Fix 2, Fix 3: base 636938ee, untracked at start: the run folder, naming.md, this file.

## Rulings

- 2026-11-25, Fix 1: the run's own spec, plan and flow.md keep "Fit"/`naming-fit` as written — they record what was
  decided then; the shipped text is renamed — a reader of the run folder sees the old name.

## Parking lot

## Deviations

## Skipped

- tests lens: no source or test changed (prose only).
- security lens: the diff touches no input parsing, auth, network, files, processes, secrets or dependencies.
- risk lens: no migration, public interface, wire format, config or hot path.
- correctness: neutral brief, not the built-in code-review (uncommitted work in the tree).

## Run verdict
