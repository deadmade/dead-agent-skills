---
flow: fix
phase: finish
---

# Sync reports three new upstream skills with no issue: flow

## Request

Hey, could we pls analyze this failure and fix them ignore it.
2. Sync gap, not part of this PR: three upstream skills have no decision and no issue.
   - engineering/implement-spec, engineering/pr and engineering/retro are neither vendored nor in SKIPPED.
   - The sync detected them (the CI log and my local run both show "new upstream skill"), but no "New upstream skill" issues exist. Issue numbers #101–#108 are contiguous, so none were created and later deleted.
   - With a stubbed gh, the issues step does try to create all three, so I couldn't find the cause. It's worth a look.
   - You still need to decide whether to include or skip them. implement-spec likely overlaps your /implement conductor.
   - SKIPPED also still lists engineering/resolving-merge-conflicts, which upstream no longer publishes. That's harmless.
3. Minor:
   - The PR body is only "Automated sync … cc @deadmade", with no summary of what changed.
   - Merging will cut a patch release, because the PR touches more than docs/. That's expected.
   - I couldn't check upstream's claim that gh issue close --comment drops the comment on an already-closed issue, since that needs a write.

(Item 1 of the list did not come through, and "ignore it" has no clear referent. Asked at the gate.)

## Artifacts

- CI run 41461534714 (schedule, 2026-11-02), job 125331650990 `sync (mattpocock-picks)`: its log is the evidence for
  the Sync and Issues steps.
- Read-only proof script: `/tmp/claude-1000/-home-deadmade-projects-dead-claude-skills/bbeffb5c-52d0-4733-ab4a-c8c2912f6f6e/scratchpad/prove-issues.mjs`.

## Gates

- Cause gate (phase 3): passed 2026-11-03. Options offered: log what the Issues step does (recommended), no code
  change, pin the repo in the step. The user answered: "can you just fix the gh thing because of the rename?" and ticked
  none of skip-the-3-skills, list-new-skills-in-PR-bodies, prune-SKIPPED.

## Skipped

- Phase 4's failing test: the approved fix is a change to this checkout's git remote, which no repo test can fail for.
  No repo file changed.

## Findings

### Reproduce

The repo's real `issues()` (`tools/upstream-sync/src/github.ts:82`) run against real GitHub reads, `gh issue create`
refused and counted, with the three skills the CI log reported:

- As this checkout runs it (`origin` is `https://github.com/deadmade/dead-claude-skills.git`, the pre-rename name):
  `WOULD CREATE` for implement-spec, pr and retro, `creates=3`. This is the reviewer's "stubbed gh tries to create all
  three".
- As CI runs it (`GH_REPO=deadmade/dead-agent-skills`, the name `actions/checkout` gives the remote): `creates=0`.

### Ground

- The three issues exist: #9 (implement-spec), #10 (pr), #11 (retro), "New upstream skill in mattpocock/skills:
  <name>", all open, opened 2026-10-05T14:28:33Z–36Z by github-actions. They are not in the #101–#108 range the report
  checked.
- CI job 125331650990: the Sync step logged all three as new at 14:24:12Z; the Issues step ran 14:24:13Z–14:24:15Z and
  succeeded; the issue counter went 101 (pstack failing, 14:24:14Z) to 102 (tob failing, 14:24:28Z) with nothing from
  this job between. The step found #9–#11 by title and skipped them.
- Why a local run disagrees: `gh issue list --search` scopes the search to the repo named by the git remote. GraphQL
  query gh sent from this checkout: `repo:deadmade/dead-claude-skills type:issue`. Search does not follow a rename, so
  it returns nothing here, even for titles that exist (`statechart in:title`, `failing in:title` return nothing; REST
  search under the new name finds them). Under `-R deadmade/dead-agent-skills`, `implement-spec`, `pr` and `retro`
  each return exactly their #9, #10, #11.
- No sync code changed between the CI run's commit (1acc458) and origin/main, so the CI behaviour above is the current
  behaviour.
- The sync's other jobs failing on 2026-11-02 (pstack-picks, tob-picks, hallmark) are known and unrelated
  (AGENTS.md: pstack's `GUARD`); each opened its "Sync <name> failing" issue (#101, #102, #108).

### Cause

There is no sync bug and no gap. The report's evidence was a local artefact (stale `origin` URL makes the duplicate
search empty) read against the wrong issue range (#101–#108 instead of #9–#11).

### Item 3, read against the code

- PR body: by design. `commitPr` in `tools/upstream-sync/src/sources.ts:56` builds "a one-line body naming what was
  synced from where". `reportNew` logs but does not add to `result.report`, so even a body built from the report would
  not list the new skills. A feature request, not a failure.
- Patch release: expected (AGENTS.md, Versions and releases).
- `gh issue close --comment` on an already-closed issue: `passed()` (`github.ts:67`) closes only an issue that
  `openFailing` found with `--state open`, so the case cannot arise outside a race.

## Tasks

## Rulings

- 2026-11-03: read "fix the gh thing because of the rename" as `git remote set-url origin
  https://github.com/deadmade/dead-agent-skills.git` in this checkout — it is the only thing `gh` takes the repo name
  from here — costs: if it meant a repo change, nothing was fixed there; the old URL is one `set-url` away.
- 2026-11-03: left the remaining `dead-claude-skills` strings alone (package, marketplace and installer names that
  AGENTS.md keeps stable, and release download URLs that GitHub redirects) — none of them feeds a search — costs: a
  later rename of those is a separate decision.
- 2026-11-03: took "ignore it" to cover item 3 and the include/skip decision, since the user ticked none of them.

## Deviations

## Verify

2026-11-03: `/verify` stops here: the fix changed no tracked or untracked repo file (`.git/config` only), so its scope
is empty. Re-ran the proof after the change: `RUNNER_TEMP=<scratch>/runner node prove-issues.mjs ''` prints `creates=0`
from this checkout, and `gh issue list --search "implement-spec in:title"` now returns #9. The tree's other changes
(crates/ado-mcp, docs/features/upgrade-all) belong to other work and were not touched.

## Learned

## Run verdict
