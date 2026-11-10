---
flow: refactor
phase: finish
now: Waiting for you: pick how the branch ends.
---

# Remove md-pane: flow

## Request

/flows:refactor Could we remove the markdown panel. I honestly dont really utilize it

## Artifacts

- Plan: [plan.md](plan.md)
- Base suite log: [base-suite.log](base-suite.log)

## Gates

- Gate 1, plan (size, shape, plan, execution method): 2026-11-10, execution: native

## Skipped

- Accepted 2026-11-10. Separate verifier agent for the review's findings (Phase 4): the main session checked findings 1-3 against the files instead. Not an independent check.
- Accepted 2026-11-10. Built-in `code-review` lens: tree was uncommitted, so the neutral brief ran inside the combined agent.
- Accepted 2026-11-10. Plan review: not run (local size).

## Grounding

Run on a worktree `.claude/worktrees/refactor-md-pane`, branch `refactor-md-pane`, cut from `origin/main` at `eed2493e`
(the main checkout is 4 commits behind and dirty, so it was not used). Created in Phase 1 instead of Phase 4 so the base
suite runs on a clean tree; the run folder was written here directly, so nothing is moved later.

- "The markdown panel" is the `md-pane` plugin (`plugins/opt-in/md-pane/`, 936 lines: `hooks/register.tsx`,
  `hooks/paths.ts`, their two test files, `plugin.json`, `tsconfig.json`, `types/index.d.ts`, `README.md`). It is the
  only mod that is opt-in; Night City (`plugins/default/`) is separate and stays. Verified by reading both `plugin.json`
  `extensions` entries.
- Nothing else depends on it: `catalog.json` lists it with `dependencies: []`, and no other plugin's dependencies name it
  (verified: `git grep md-pane` outside `docs/features` and the plugin itself).
- References to change (verified by `git grep -n -i md-pane`):
  - `plugins/catalog.json:105` the entry.
  - `tools/installer/core/options.ts:70` key in the Tools page.
  - `tools/harness-compiler/src/targets/claude-code.ts:129` the "productivity" category list.
  - `tools/harness-compiler/src/lint-allowlist.json:31,35` two allowlist entries for its files.
  - `.github/workflows/test.yml:94-99` the "md-pane mod tests" step.
  - `README.md:45,60-61` and `AGENTS.md:57-59,136-137` prose.
  - Tests: `scripts/plugin-dirs.test.mjs:34`, `tools/installer/core/{plugins,agents,catalog}.test.ts`,
    `tools/installer/steps/codex.test.ts:249`.
- Installers on existing machines: `retiredPlugins` (`tools/installer/core/plugins.ts:81`) removes any plugin of ours the
  marketplace no longer lists, so dropping the catalog entry uninstalls it on the next run (inferred from the function's
  comment and AGENTS.md's "Removing a plugin from the marketplace is enough to retire it"; the test at
  `plugins.test.ts:103` covers it with `dev-feature`).
- Docs under `docs/features/` that mention md-pane (`harness-independent-plugins`, ...) are history and stay as written.
- Base suite: command `npm test`, commit `eed2493e` — result below.

### Thin coverage

None that matters: nothing moves, so there is no behaviour of moved code to characterize. The code being deleted has its
own tests (`register.test.ts`, `paths.test.ts`) which go with it.

### Base suite

Command `npm test` in the worktree, commit `eed2493e`, exit 0 (measured, [base-suite.log](base-suite.log)): installer
223 tests (220 pass, 3 skipped), 83 (82 pass, 1 skipped), 183 and 58 all pass, 0 failures. The skips in the log are `writeAtomic`, `replaceBin` and `which` cases whose names say Windows (inferred, not read).

## Findings

## Options

### Shape

Delete `plugins/opt-in/md-pane/` and every reference to it; keep the rest as it is.

### Size

Local: one plugin folder removed and about a dozen one-line references. Recommended because no module boundary changes.
Picked: local (approved at Gate 1)

## Plan review

Not run: local size.

## Tasks

Task 1: base eed2493eaee1a46d2a896a2b704e2b6e912e93d5, untracked at start: docs/features/refactor-md-pane/; edits done, files clean (12 modified + 8 deleted, all on Task 1's list; the plan said 10 files for the folder, it holds 8 tracked). Full suite: one failure, see Deviations.

## Rulings

## Parking lot

None. Rulings: none (decision A confirmed, no other decisions).

## Deviations

### catalog.test.ts:10 expects 17 plugins in the whole catalog

Status: decided 2026-11-10: change 17 to 16

confirmed 2026-11-10

`tools/installer/core/catalog.test.ts:10` asserts `catalog.plugins.length === 17`; removing md-pane makes it 16 (measured:
`npm test`, [branch-suite.log](branch-suite.log); everything else passes). The plan listed only the Claude count at line 28
(16 to 15), so this changed expected value is a class-8 deviation the gate didn't name. Options: (a) change 17 to 16, the
same kind of edit as the approved one (recommended: the number is the catalog's size and md-pane left it); (b) keep the
test and put the plugin back (defeats the request).

## Walkthrough

| goal                       | plan task | file:line                                                                                                                                                                                                     | test                                                                                                 |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| md-pane plugin removed     | 1         | `plugins/opt-in/md-pane/` (8 tracked files deleted)                                                                                                                                                           | `scripts/plugin-dirs.test.mjs:34` (now asserts headroom-trim)                                        |
| No longer offered or built | 1         | `plugins/catalog.json` (entry), `tools/installer/core/options.ts:70`, `tools/harness-compiler/src/targets/claude-code.ts:129`, `tools/harness-compiler/src/lint-allowlist.json`, `.github/workflows/test.yml` | `tools/installer/core/catalog.test.ts:10,28`, `plugins.test.ts:38-55`                                |
| Docs true                  | 1         | `README.md:45,59`, `AGENTS.md:57,132-136`                                                                                                                                                                     | check-repo (in `npm test`)                                                                           |
| Behaviour unchanged        | 1         | rest of the repo untouched                                                                                                                                                                                    | `npm test`: green on base `eed2493e` and on the branch, same pass counts (220/82/183/58), 0 failures |

## Review

One combined fresh reviewer (opus: correctness, lean, tests, docs, risk) over the uncommitted diff, after the neutral
brief, since the built-in code-review needs a committed branch. Verdict: no breaking references; a stale md-pane install is
retired on the next installer run (`install.ts:155,212`, `core/plugins.ts:82`, `steps/plugins.ts:120`; read by the reviewer,
inferred, not run against a real install). Five findings, all wording or test leftovers, picks 1-4 fixed, 5 left on purpose:

1. `README.md:45` lowercase sentence start. Fixed.
2. `tools/installer/core/options.ts:69` Tools blurb said "pane". Fixed.
3. `AGENTS.md:132-135` "each plugin's" wording. Fixed.
4. `tools/installer/core/plugins.test.ts` sample id `md-pane@`. Renamed to `headroom-trim`. Fixed.
5. `tools/installer/steps/codex.test.ts:249` one-item loop. Left (test still sound).

Suite after the fixes: `npm test` exit 0, 220/82/183/58 pass, 0 fail ([branch-suite.log](branch-suite.log)); `npm run typecheck` clean.

## Learned

Nothing worth keeping: the one surprise (a second count assertion at `catalog.test.ts:10`) was caught by the suite in one run.

## Run verdict

worked as a whole: yes; clean: yes (2026-11-10)
