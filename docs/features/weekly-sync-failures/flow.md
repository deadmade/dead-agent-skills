---
flow: fix
phase: done
now: Done: PR handed over for worktree-weekly-sync-failures.
---

# Weekly sync failures: flow

## Request

"oh sry. /flows:fix then lets analyze the failed": the three upstream syncs that failed in `sync.yml` run 42638477549
(2026-11-09), with open issues #147 (superpowers), #144 (csharp-skills) and #101 (pstack-picks).

## Artifacts

- Failed run: https://github.com/deadmade/dead-agent-skills/actions/runs/42638477549
- Scratch checkout of origin/main 59f3440b, used for the reproduction only.

## Gates

- Gate 1, cause approved: 2026-11-09
- Gate 2, review-code report: 2026-11-09
- Gate 3, Decide: 2026-11-09

## Skipped

- pstack `interrogate`: the user declined the offer on 2026-11-09. Accepted.
- review-code security lens: the hand-written diff adds no input, network, process or secret surface; the vendored output went through the skill scan. Accepted.
- review-code risk lens: no migration, public interface, wire format or hot path changes. Accepted.

## Grounding

- `sync.yml` runs one job per source: `cli.ts apply`, then `scripts/check-repo.mjs`, then the skill scan, then the PR.
  A failure opens or keeps a "Sync <name> failing" issue (verified, `.github/workflows/sync.yml`).
- Each adapter fails closed on purpose. `csharp.ts` rejects any `BINLOG_MCP` match left after its rewrites, `pstack.ts`
  rejects any `GUARD` match, and `checkOverrides` (`scripts/flows-uses.mjs`) rejects a quoted sentence the pack no
  longer has (verified, read).
- Blast radius of csharp-skills: `sources.ts` wants 6 routers and at least 90 library skills; the generated routers,
  `transforms/rules.ts` and the evals consume `library/`. Blast radius of pstack-picks: `sources.ts` wants 16 skills;
  `/review-code` and `steps/finish.toml` offer `interrogate`; the only `overrides pstack-picks` marker is in
  `steps/seams.toml`. Neither is affected by the trial below (measured: check-repo passed).
- Nothing loads the superpowers hooks, and nothing references its deleted `systematic-debugging` files (subagent,
  verified by reading; not rerun here).

## Findings

### Reproduction

Measured on origin/main 59f3440b, Node 26.13.0, after `npm ci`:

| Source        | Command                                                                                     | Exit      | Output                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| csharp-skills | `node tools/upstream-sync/src/cli.ts preview csharp-skills`                                 | 1         | `library/find-repeated-work-within-one-build/SKILL.md still names the binlog MCP (upstream changed?)`                                                                                                            |
| pstack-picks  | `node tools/upstream-sync/src/cli.ts preview pstack-picks`                                  | 1         | `Cursor-specific text survived the rewrite`: `skills/arena/SKILL.md:19`, `:30`, `skills/interrogate/SKILL.md:19`                                                                                                 |
| superpowers   | `node tools/upstream-sync/src/cli.ts apply superpowers`, then `node scripts/check-repo.mjs` | 0, then 1 | `plugins/flows/skills/build-feature/SKILL.md:68: superpowers/skills/brainstorming/SKILL.md no longer contains "Offer recon. Once you have a bit of grounding and looking further would help, offer to go look:"` |

### Cause

No commit of ours broke these: upstream reworded text the sync pins exactly, and each check failed closed as designed.

- **csharp-skills.** `dropBinlogMcp` removes only sections whose heading names the binlog MCP. Upstream's new
  `find-repeated-work-within-one-build` names it in two body paragraphs of Step 1, so `BINLOG_MCP` fires (verified, read;
  measured by the trial).
- **pstack-picks, failing since 2026-11-02 (#101).** Upstream rewrote `arena`, so the two model-panel rewrites no longer
  match: they end on "from its error message." and "Prefer a different model family from the parent's.", and neither
  sentence exists now. Upstream also rewrote `interrogate` around arena's fan-out, which brings in new
  `interrogate reviewers` and `generalPurpose` lines (measured).
- **superpowers v7.0.2.** "Offer recon" became "Do recon", so the override quote at `build-feature/SKILL.md:68` is stale
  (measured). The same release changes behaviour no quote covers (verified, read):
  - `brainstorming` may put a short design in its first message, and "Their approval covers the approach and the design:
    write the short design doc as approved and go on to the plan." This contradicts `build-feature` Gate 1 and
    `steps/gate.toml`.
  - `build-feature/SKILL.md:52` ("Phase 2 starts with questions") and `:70` (the "how it gets made" trigger) lose their
    premise.
  - "Do recon" now searches on its own, including the web, which duplicates the prior-art agents.
  - `steps/deviations.toml:41` says `task-brief 8` also picks up `8b`. The new script compares whole ids, so that holds
    only for a deeper heading (verified, read `task-brief`).

### Trial (scratch checkout, removed before this gate)

With candidate rewrites for csharp and pstack and the re-quoted marker, `apply` exited 0 for all three sources and
`check-repo` passed (measured). The syncs bring: csharp-skills to 96c3d68d (+2 skills, 17 files changed), pstack-picks to
6b030021 (`interrogate` rewritten, its 4 `references/` deleted, small `arena` edits), superpowers to v7.0.2. The trial
did not run the skill scan.

### Proof

Measured by fresh agents in scratch checkouts, before = 59f3440b, with = snapshot 239aafef, Node 26.13.0.

| Check                                             | Before                                                       | With fix |
| ------------------------------------------------- | ------------------------------------------------------------ | -------- |
| `cli.ts apply csharp-skills`                      | exit 1, `still names the binlog MCP`                         | exit 0   |
| `cli.ts apply pstack-picks`                       | exit 1, `Cursor-specific text survived the rewrite`, 3 lines | exit 0   |
| `cli.ts apply superpowers`, then `check-repo.mjs` | apply 0, check-repo 1, the `Offer recon` quote at `:68`      | 0 and 0  |

The first before-run chained all three sources in one checkout. csharp's failed `apply` had deleted its `skills/` folder,
so superpowers failed there on `Missing package resource csharp-skills/skills`, which isn't the bug. The superpowers
row is a separate run in its own checkout.

Latest full run, on 59f3440b plus the uncommitted fix (author's run): `npm test` exit 0, `npm run typecheck` exit 0,
both `skill-scanner` scans through `uvx` (`cisco-ai-skill-scanner==2.3.2`) exit 0.

## Options

### Fix

Picked: the recommended option for all three (superpowers: sync, re-quote and override the new behaviour; csharp-skills:
two rewrites; pstack-picks: adapt and sync), proven by the runnable check below.

**superpowers.** (a) Recommended: sync, re-quote the marker, and make `build-feature` override the new behaviour: no
short design or chat approval in place of Gate 1, questions and the approaches message stay, no recon of its own on the
web. Correct the reason in `deviations.toml`. (b) Re-quote only: smallest, but the gate can be bypassed silently.

**csharp-skills.** (a) Recommended: two `REWRITES` in `csharp.ts`, dropping the MCP paragraph and starting the next at
"For an available binlog, replay". The skill keeps its text-log path. (b) Add the skill to `DROPPED`: one line, loses
the skill.

**pstack-picks.** (a) Recommended: adapt `pstack.ts` (two rules re-anchored, two added) and take the new `interrogate`.
Update the `AGENTS.md` note that the pin is on purpose. (b) Stay at 519d36a: the weekly job stays red and #101 open.

**Files for the recommended set:** `tools/upstream-sync/src/adapters/csharp.ts`, `tools/upstream-sync/src/adapters/pstack.ts`,
`plugins/flows/skills/build-feature/SKILL.md`, `plugins/flows/steps/deviations.toml`, `AGENTS.md`, `THIRD_PARTY.md` if it
names a version, and the sync's own output under `plugins/flows/packs/superpowers/`, `plugins/flows/packs/pstack-picks/`
and `plugins/opt-in/implementation/csharp-skills/`. The marker quotes the new text, so superpowers has to land on the
same branch as the conductor edit.

**Check in place of a unit test.** `REWRITES` is private data matched against live upstream text and the conductor edits
are prose, so the check is the reproduction: `cli.ts apply <source>` for all three, then `check-repo`, then the skill
scan. It failed first (Findings).

## Plan review

## Tasks

Task 1: base 59f3440bc364c96ae8fb7629c8e0b99491d382e2, untracked at start: `docs/features/weekly-sync-failures/`, files clean
Fix 1-4: base 9ed5bf82a4c09ae8a4735977577cd42aa0f9f1eb, files clean

## Rulings

- 2026-11-09, Fix 2-4: reset the generated pstack output by reversing a saved patch before rerunning `apply`, because `apply` refuses a dirty destination and `dcg` blocks a direct checkout — the output is regenerated from upstream, so a wrong reset costs one more sync. confirmed
- 2026-11-09, Task 1: Phase 5 used separate checkouts for before and after instead of restoring files in one — `apply` refuses a dirty destination — the before-runs start at the base commit, so nothing is lost. confirmed
- 2026-11-09, Task 1: dropped the `Spawn one readonly judge subagent` rule in `pstack.ts`, because the re-anchored cross-judge rule now contains that sentence and writes it — if wrong, `GUARD` fails on the surviving `readonly`. confirmed

## Parking lot

- `tools/upstream-sync/src/adapters/pstack.ts`: a check that fails the sync when a `REWRITES` rule matches nothing, as `csharp.ts` does. Past mistake it must fail on: the eight old `interrogate` rules matched nothing at 6b030021 and no check said so (shown by the verifier's run over all 16 skills). Follow-up.

## Deviations

## Walkthrough

| goal                                                            | plan task | file:line                                        | test                                   |
| --------------------------------------------------------------- | --------- | ------------------------------------------------ | -------------------------------------- |
| csharp-skills sync strips the binlog MCP from the new skill     | Task 1    | `tools/upstream-sync/src/adapters/csharp.ts:166` | `cli.ts apply csharp-skills`           |
| pstack-picks sync survives upstream's arena/interrogate rewrite | Task 1    | `tools/upstream-sync/src/adapters/pstack.ts:105` | `cli.ts apply pstack-picks`            |
| superpowers override quote matches v7.0.2                       | Task 1    | `plugins/flows/skills/build-feature/SKILL.md:73` | `cli.ts apply superpowers`, check-repo |
| new brainstorming behaviour can't bypass Gate 1                 | Task 1    | `plugins/flows/skills/build-feature/SKILL.md:66` | prose; check-repo checks the quotes    |
| stale `task-brief` reason corrected                             | Task 1    | `plugins/flows/steps/deviations.toml:41`         | prose                                  |

## Review

Verdict at the gate: 2 to fix before merge, 4 low-severity findings, all picked and all fixed; a fresh fix check passed each. Audit: [2026-11-09-review-weekly-sync-failures.md](../../audits/2026-11-09-review-weekly-sync-failures.md).

## Learned

- `AGENTS.md`, Checks: the quote check sees only quoted sentences, so read a superpowers sync's `brainstorming` diff against `build-feature`.
- `AGENTS.md`, `tools/upstream-sync/`: a failed `apply` can leave its destination half-written and break the next source in that checkout.
- Parking lot: a check that fails on a `REWRITES` rule matching nothing.

## Run verdict

worked as a whole: yes; clean: yes
