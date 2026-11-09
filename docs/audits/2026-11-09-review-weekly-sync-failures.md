# Review: weekly-sync-failures

branch: worktree-weekly-sync-failures ← origin/main 59f3440b, 5 hand-written files, +36 −17, uncommitted; vendored sync output skipped.

Intent: the three upstream syncs that failed on 2026-11-09 (superpowers, csharp-skills, pstack-picks) pass again, and the `build-feature` conductor keeps its gates under superpowers v7.0.2.

Verdict: 2 findings need a fix before merge. All four findings are low severity.

Lenses: correctness (neutral brief, because the tree is uncommitted), lean, tests, docs.

## Findings

| #   | severity | where                                                | finding                                                                                                                                                               | evidence                                                                                                                                                                                                 | fix (recommended)                                                                 | bucket           |
| --- | -------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------- |
| 1   | low      | `plugins/flows/skills/build-feature/SKILL.md:76`     | The Options bullet changes brainstorming's rule on outcomes without quoting it, so a later sync can change that rule unnoticed.                                       | confirmed: `brainstorming/SKILL.md:125-127`, "Someone who talks about outcomes is handing you the how"; none of the seven brainstorming markers quotes it.                                               | Add an `overrides` marker quoting that sentence.                                  | fix before merge |
| 2   | low      | `tools/upstream-sync/src/adapters/pstack.ts:66`      | The synced `interrogate` tells the model to use `in-your-own-words`, which the pack doesn't vendor, so a model that follows the port note's path hits a missing file. | confirmed: `interrogate/SKILL.md:15` names it, the name is in `SKIPPED`, and `packs/pstack-picks/skills/` has no such folder.                                                                            | Add a rewrite turning the clause into "State the intent in your own words, from". | fix before merge |
| 3   | low      | `tools/upstream-sync/src/adapters/pstack.ts:118-134` | Eight rules for the old `interrogate` match nothing at 6b030021 and mislead whoever next adapts a `GUARD` failure.                                                    | confirmed: the verifier ran `REWRITES` over all 16 vendored skills and rules 10 to 17 had 0 matches; a grep of upstream `pstack/` finds none of their text.                                              | Delete the eight rules.                                                           | worth doing      |
| 4   | low      | `tools/upstream-sync/src/adapters/pstack.ts:114`     | If upstream rewords the `interrogate reviewers` sentence, the new rule misses, `GUARD` passes, and the sync ships an instruction to read a Cursor-only line.          | confirmed for this line by a simulated reword; the rules at `:105` and `:109` still fail on `.cursor`. The vendored pack contains no `interrogate reviewers`, so a `GUARD` entry adds no false positive. | Add `interrogate reviewers` to `GUARD`.                                           | worth doing      |

Dropped: 1 finding. The sentence kept at `AGENTS.md:129` partly repeats other text, but no wrong result follows.

Picks: 1,2,3,4

Fixed 2026-11-09: 1
Fixed 2026-11-09: 2
Fixed 2026-11-09: 3
Fixed 2026-11-09: 4

## Tasks

## Rulings

## Parking lot

## Deviations

## Skipped

- pstack `interrogate`: the user declined the offer on 2026-11-09.
- security lens: the hand-written diff adds no input, network, process or secret surface; the vendored output went through the skill scan.
- risk lens: no migration, public interface, wire format or hot path changes.

## Run verdict
