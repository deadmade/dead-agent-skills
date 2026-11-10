# Review: refactor-writing

branch: worktree-refactor-writing ← origin/main at 5bed970c, 62 files, uncommitted; intent: docs/features/refactor-writing/plan.md and the `### Shape` pick (local).

## Findings

| #   | severity | where                                                                                            | finding                                                                                                                                                                                                                     | evidence                                                                                                                                                                                                        | fix (recommended)                                                                                                                     | bucket                                           |
| --- | -------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | low      | `plugins/flows/skills/refactor/SKILL.md:82-87`                                                   | A restructuring's plan review edits plan.md after the plan-check step's text, and nothing there now says to re-run glance, so Gate 1 can show a stale task block; the removed copyedit sentence used to force the re-check. | plausible: composed `.claude-plugin/flows/skills/refactor/SKILL.md` runs plan-check (line 251), then plan review (261), then the gate (266); build-feature keeps an explicit re-run at Gate 2 (`SKILL.md:144`). | After the plan-review paragraph: "The review's edits are edits to the plan: run glance again before the gate."                        | worth doing                                      |
| 2   | low      | `THIRD_PARTY.md:51-52`, `tools/upstream-sync/src/adapters/pstack.ts:31`                          | Both say the sync rewrites references to `unslop` and `technical-writing`; the REWRITES handle only `unslop`, and a `technical-writing` reference fails the sync through GUARD.                                             | confirmed: `pstack.ts:146-149` holds three patterns, all for `unslop`; `technical-writing` appears only in `SKIPPED` and `GUARD`.                                                                               | Narrow both to `unslop`, as `docs/components/packs.md:12` says it.                                                                    | worth doing                                      |
| 3   | low      | `flake.nix:97`                                                                                   | The `installer-test` pre-commit pattern still lists `plugins/flows/hooks/`, a folder the change deletes; the alternative can never match.                                                                                   | confirmed: line 97 reads `…                                                                                                                                                                                     | plugins/flows/hooks/                                                                                                                  | …`; `git ls-files plugins/flows/hooks` is empty. | Delete `plugins/flows/hooks/ | ` from the regex. | worth doing |
| 4   | low      | `tools/harness-compiler/src/model.ts:47`, `schema/manifest.ts:180,207`, `targets/hooks.ts:63-66` | The compiler's hook `paths` filter is set by no `hooks.json` any more: the deleted prose hook was its only user, so it is an option nobody sets.                                                                            | confirmed: none of the four remaining `hooks.json` under `plugins/` has `"paths"`; only `test/hooks.test.ts:48-61` exercises it.                                                                                | Delete the option and its test assertions; this changes a passing test and a file the plan didn't list, so it is a deviation (below). | worth doing                                      |
| 5   | low      | `docs/features/refactor-writing/flow.md:133-134`                                                 | A second, empty Walkthrough table header follows the filled table.                                                                                                                                                          | confirmed: lines 133-134, directly before `## Review`.                                                                                                                                                          | Delete the two lines.                                                                                                                 | worth doing                                      |

Dropped: 1 (ADR 0014's link to the feature folder: `/flows:tidy` keeps a folder that a doc outside `docs/features/` links, so the link doesn't go dead).

Picks: 1, 2, 3, 4, 5

Fixed 2026-11-10: 1
Fixed 2026-11-10: 2
Fixed 2026-11-10: 3
Fixed 2026-11-10: 4
Fixed 2026-11-10: 5

## Tasks

## Rulings

## Parking lot

## Deviations

### Fix 4 removes the compiler's hook `paths` option and its test assertions

Status: decided 2026-11-10: the user picked it at Gate 2, approving the edit to `tools/harness-compiler/test/hooks.test.ts`, a passing test outside the plan's Files.

## Skipped

- pstack interrogate: declined by the user at Gate 2, 2026-11-10.

- security lens: the diff only deletes code and edits prose and config; it adds no input parsing, network, file or process handling.

## Run verdict

Worked as a whole: yes; clean: yes (the user, 2026-11-10, recorded in the run's flow.md).
