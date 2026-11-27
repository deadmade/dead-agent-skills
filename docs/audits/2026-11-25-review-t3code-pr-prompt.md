# Review: t3code-pr-prompt

branch: t3/d3d91289 ← origin/main (43678415), 2 files, +10 −7, uncommitted; intent: docs/features/t3code-pr-prompt/
spec.md and plan.md (called inline by /build-feature).

Checks: `npm test` on 43678415 with `M plugins/flows/README.md`, `M plugins/flows/steps/close.toml`,
`?? docs/features/t3code-pr-prompt/`: 612 tests, 601 pass, 5 fail. The 5 are this machine's recorded EPERM symlink
baseline (same five names, all `EPERM ... symlink`); not re-run on the merge-base in this run.

Lenses: combined (small diff, opus): correctness (neutral brief: tree uncommitted, so the built-in review can't run),
lean, docs. Skipped: tests (no source or tests changed), security (no input, auth, network, files, processes, secrets
or dependencies), risk (no migration, wire format, public interface, config or hot path). pstack `interrogate`
offered (native execution); the user skipped it.

## Findings

| #   | severity | where                                  | finding                                                                                                                            | evidence                                                                                                                                                                                       | fix (recommended)                                                                                                                                                                                                                               | bucket           |
| --- | -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | med      | `plugins/flows/steps/close.toml:28-31` | A repo with only a `PULL_REQUEST_TEMPLATE/` folder (no single `pull_request_template.md`) gets Summary/Testing, not its templates. | confirmed: the condition names only `pull_request_template.md`; the folder clause sits inside that branch, so a folder-only repo falls to "Otherwise". spec.md Behaviour has the same nesting. | Put the folder in the condition: "(`pull_request_template.md`, or a `PULL_REQUEST_TEMPLATE/` folder of them, in its root, `docs/` or `.github/`, any case) … with several, pick the one that fits and name it at the PR gate"; same in spec.md. | fix before merge |

Dropped: 0.

Picks: 1 (Gate 3, review-code report: 2026-11-25)

Fixed 2026-11-25: 1 (fix check PASS: folder-only, file-only, one-file folder and no-template cases walked through the new text)

## Tasks

Fix 1: base 43678415 + the Task 1 changes, untracked at start: docs/features/t3code-pr-prompt/, docs/audits/2026-11-25-review-t3code-pr-prompt.md; files clean (close.toml, spec.md).

## Rulings

## Parking lot

## Deviations

## Skipped

- tests, security, risk lenses: not applicable to the diff (see Lenses).
- pstack `interrogate`: skipped by the user.

## Run verdict
