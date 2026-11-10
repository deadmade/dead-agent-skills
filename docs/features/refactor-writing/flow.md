---
flow: refactor
phase: done
now: Done: PR handed over for worktree-refactor-writing.
---

# Remove the writing skill: flow

<!-- Placeholders to fill when copying: `<Title>`; `flow:` the conductor's name; `phase:` the key of its first phase,
from its phase table; `now:` one plain sentence. -->

## Request

lets remove it. It was an interesting idea but it didnt really payed off unfortunatly

Scope picked 2026-11-10: all three parts (the writing skill, the copyedit and the prose hook). Flow picked: /refactor, with the test deletions approved at Gate 1.

## Artifacts

- Plan: [plan.md](plan.md)
- Evaluation that led here: transcripts of the last 30 days (this session), 48 copyedit runs, 9 skill loads, 19 hook hits.

## Gates

- Gate 1, plan approved: 2026-11-10, execution: native
- Gate 2, review-code: report: 2026-11-10

## Skipped

- copyedit of plan.md: skipped by the user, 2026-11-10 (the run removes the copyedit). Accepted.
- security lens: skipped (deletion and prose only). Accepted 2026-11-10.
- pstack interrogate: declined at Gate 2. Accepted 2026-11-10.

## Grounding

Base: `origin/main` at `5bed970c`, worktree `.claude/worktrees/refactor-writing`, branch `worktree-refactor-writing`.
Suite: `npm ci && npm test`, measured green (exit 0; the four suites report 0 failed, skipped tests are offline-only).
No graphify query or pstack `how` ran: this removes code rather than reshaping it, so one `rg` over the tree for
`flows:writing`, `skills/writing`, `copyedit`, `prose-check`, `prose.mjs` and `FLOWS_PROSE_CHECK` found every caller.

What goes:

- `plugins/flows/skills/writing/` (SKILL.md, 14 references, `scripts/compare.mjs`, two test files).
- The prose hook: `plugins/flows/hooks/` (`hooks.json`, `prose-check.mjs`, `prose.mjs`, `prose.test.mjs`,
  `hooks.test.mjs`, `fixtures/clean.md`); `plugin.json`'s `hooks` key; `hooks/prose.mjs` in `plugins/catalog.json`'s
  flows resources.
- The copyedit step: `plugins/flows/steps/copyedit.toml`, `[step: copyedit]` in build-feature, research-feature,
  refactor, upgrade and review-code, and the copyedit wording in `gate.toml`, `plan-check.toml`, `run-rules.toml`,
  build-feature's Gate 2, implement, upgrade, diagrams' step 1 and review-code's `references/report.md`.

What points at it and changes:

- `flows:writing` in `uses:` of review-code (`skills/review-code/SKILL.md:6`) and `steps/close.toml:6`, and the PR body's
  "Revise it by `flows:writing`" (`steps/close.toml:32`); review-code's docs lens reads prose against it
  (`skills/review-code/references/docs.md:66`).
- pstack-picks: `tools/upstream-sync/src/adapters/pstack.ts:147-153` rewrites pstack's `unslop` references to
  `flows:writing`, which lands in the vendored `blast-radius`, `recall` and `show-me-your-work` SKILL.md files. The pack
  can't be hand-edited, so the adapter changes and the pack is re-synced at its pinned commit
  (`6b0300214a09fd6029cfb7077043125758cd1fd2`, `plugins/flows/packs/pstack-picks/UPSTREAM`).
- `package.json`'s test script globs `plugins/flows/skills/{writing,build-feature,diagrams}/tests/*.test.mjs` and
  `plugins/flows/hooks/*.test.mjs`; `.github/skill-scanner.yaml:42-45` suppresses a finding in `tests/copyedit.test.mjs`;
  `tools/harness-compiler/src/lint-allowlist.json:27` allows `writing-skill.test.mjs`.
- Docs: `AGENTS.md:25`, `README.md:69-72`, `plugins/flows/README.md` (the `/flows:writing copyedit` row and lines
  163-180), `plugins/flows/plugin.json`'s description, `GLOSSARY.md:179-197`, `THIRD_PARTY.md:51-52` and its
  "writing (flows)" section, `docs/components/flows.md:40-55`, `docs/components/packs.md:12`, ADR 0014.
- Comments only: `scripts/flows-uses.mjs:20,57` name writing as an example of a non-conductor skill.

Stays as is: the self-contained fixtures in `scripts/flows-uses.test.mjs:93` and
`tools/harness-compiler/test/compose.test.ts:365` invent a `skills/writing/SKILL.md` in a temporary tree; they test
the generic non-conductor rule and still pass with the real skill gone. The installer names none of this (`rg` over
`tools/installer/` finds nothing).

Thin coverage: none that matters for a removal. A leftover `[step: copyedit]` fails the build (compose stops on an
unknown step), and a leftover `flows:writing` in a `uses:` fails check-repo (`flows-uses.mjs`). Both run in `npm test`.

## Findings

<!-- /fix's reproduction and its output, and /upgrade's breaking changes, each with its source. -->

## Options

### Shape

Delete the writing skill, the prose hook and the copyedit step; every conductor goes straight from writing a document
to its gate. pstack's three references that pointed at `flows:writing` become plain wording through the sync adapter.
Docs and the glossary drop the three terms; ADR 0014 gets a superseded line.

### Size

Picked: local.

Local: deletion and the edits that keep the build and docs true; no module boundary moves.

### Tests

The removed features' tests go with them: `writing-skill.test.mjs`, `copyedit.test.mjs`, `prose.test.mjs` and
`hooks.test.mjs`. Under /refactor a deleted test is a deviation; the user approved naming them in the plan and approving
them at Gate 1 (2026-11-10). Every other test that passed on the base must still pass.

## Plan review

<!-- Round N: findings, the user's decision on each, what changed, fix checks, fresh-eyes rounds. -->

## Tasks

- Task 1: base 5bed970ca3ab14a5216bd7ddf0b567960995fead, untracked at start: flow.md, plan.md. files clean (14 files, size 69 of ~45).
- Task 2: base 8fe8a103b2baeac617c51d17141f7ea5342fea55, untracked at start: flow.md, plan.md. files clean (plus `plugins/flows/README.md`'s generated uses tree, rewritten by `scripts/flows-uses.mjs`); size about 2,330 of ~2330. `npm test` measured green: 183 of the base's 229 tests in that suite remain, and the 46 gone are exactly those of the four deleted files (2 + 17 + 23 + 4); no other test name changed.
- Task 3: base 1f3c1d963c8efb4f02a2968f2c8c5a43cf0058e0, untracked at start: flow.md, plan.md. files clean (4 files, size 22 of ~20). The re-sync at the pinned commit changed only the three rewritten lines; `UPSTREAM` unchanged; `npm run typecheck` exit 0.
- Task 4: base 4e27acc39f757a7151c48f14416f194b814b8366, untracked at start: flow.md, plan.md. files clean (8 files, size about 90 of ~90). The sync's JSON writer had expanded `plugins/catalog.json` and `plugins/flows/plugin.json`; `treefmt` put them back, so against HEAD each differs only by the planned lines. `npm run build:harnesses` exit 0, `npm test` exit 0.

- Fix 1-5: base 26364290d661bec2a2b537ad31c4c082ea2cf92d, untracked at start: flow.md, plan.md, the audit file. files clean (the files the findings name; Fix 4's test edit is the decided deviation). Fix check: PASS on all five.

## Rulings

- 2026-11-10, Task 4: dropped the glossary's **Conversation shorthand** entry too — only ADR 0014, which is history and explains the term itself, still uses it — if wrong, one entry to restore. — confirmed
- 2026-11-10, Task 4: also removed "the copyedit" from `plugins/flows/README.md:184`'s list of skipped independent checks, which the plan's `rg` step found — the file was on Task 4's list — none. — confirmed
- 2026-11-10, Task 2: left `scripts/flows-uses.test.mjs:93` and `tools/harness-compiler/test/compose.test.ts:365` as they are; their invented `skills/writing/SKILL.md` lives in a temporary tree and tests the generic rule — if wrong, a rename in two test fixtures. — confirmed

## Parking lot

- `tools/harness-compiler/src/model.ts:32-33`: the neutral hook tools `file.write` and `file.edit` have no plugin hook using them now; drop them with their target mappings, or keep them as vocabulary (recommended: keep; they cost nothing and a future hook may need them). Pick: drop (keep the names; no change).

## Deviations

### Fix 4 deletes the compiler's unused hook `paths` option and its test assertions

Status: decided 2026-11-10: the user picked Fix 4 at Gate 2, approving the edit to `tools/harness-compiler/test/hooks.test.ts`, a passing test outside the plan's Files (deviation classes 4 and 8). Confirmed at Decide.

<!-- Decisions that go to the user, one per `### <deviation>` heading, then `Status: open` or
`Status: decided <date>: <what>`; below it, why the plan doesn't hold and the options with a recommendation. -->

## Walkthrough

| goal                                                             | plan task | file:line                                                                            | test                                                                                                      |
| ---------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Conductors go from a document straight to its gate, no copyedit  | Task 1    | `plugins/flows/steps/gate.toml`, `plugins/flows/skills/review-code/SKILL.md:125-127` | `npm test` (compose and check-repo); `rg` for leftovers: none                                             |
| The writing skill and the prose hook are gone, with their wiring | Task 2    | `plugins/flows/plugin.json`, `plugins/catalog.json:12`, `package.json` test script   | `npm test`                                                                                                |
| pstack's three references become plain wording, through the sync | Task 3    | `tools/upstream-sync/src/adapters/pstack.ts:146-149`                                 | the pinned-commit re-sync diff (three lines); `npm run typecheck`                                         |
| Docs describe flows as it now is                                 | Task 4    | `AGENTS.md:25`, `docs/components/flows.md`, `GLOSSARY.md`                            | `rg` for leftovers: only history and two test fixtures                                                    |
| Behaviour unchanged                                              | all       | —                                                                                    | `npm test` green on the base (5bed970c) and on the branch; only the four deleted files' 46 tests are gone |

## Review

Verdict: ready (0 to fix before merge, 5 worth doing, 1 dropped). Audit file: [docs/audits/2026-11-10-review-refactor-writing.md](../../audits/2026-11-10-review-refactor-writing.md). Fixed: 1 (glance re-run after refactor's plan review), 2 (THIRD_PARTY and pstack.ts name only `unslop`), 3 (`flake.nix` pre-commit pattern), 4 (compiler's hook `paths` option removed), 5 (flow.md table). After the fixes: `npm run typecheck`, `npm run build:harnesses` and `npm test` measured exit 0. Skipped: the security lens (deletion and prose only), pstack interrogate (declined at Gate 2).

<!-- /review-code's verdict and what it fixed. -->

## Learned

- memory: `model-passes-need-measured-payoff.md` — the user removed the per-gate copyedit for low measured payoff; measure a model pass's benefit from transcripts before proposing one.
- Dropped as not worth keeping: the sync's JSON writer expanding `catalog.json` and `plugin.json` (treefmt's pre-commit hook already restores it).

## Run verdict

Worked as a whole: yes; clean: yes (the user, 2026-11-10).
