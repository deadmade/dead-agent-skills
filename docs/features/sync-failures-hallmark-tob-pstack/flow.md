---
flow: fix
phase: done
---

# Sync failures for hallmark, tob-picks and pstack-picks: flow

## Request

Hey, could we pls fix the sync hallmark, tob-picks and pstack-picks issus?

Issues: #108 (hallmark), #102 (tob-picks), #101 (pstack-picks). All three point at the weekly sync run
https://github.com/deadmade/dead-agent-skills/actions/runs/41461534714 (2026-11-02, main at 1acc458).

## Artifacts

Branch `fix-sync-hallmark-tob-pstack` in the worktree `.claude/worktrees/fix-sync-hallmark-tob-pstack`, from
`origin/main` c9bf39b. Scratch copies of the upstreams and the hallmark sync output are in the session scratchpad.

## Gates

- 2026-11-03, Cause gate: the user approved tob-picks option A (the sync writes `${PLUGIN_ROOT}`) and hallmark option A
  (the adapter drops `*.test.*` files). Files: `tools/upstream-sync/src/adapters/tob.ts`, `tob.test.mjs` (new),
  `hallmark.ts`, `hallmark.test.mjs`.
- 2026-11-03: for pstack-picks the user chose to change nothing for now ("lets not change something there for now pls").
- 2026-11-03, Decisions gate (/verify): the user confirmed all three Rulings. Branch choice: push and create a PR.

## Skipped

- pstack-picks (#101): left unfixed on the user's say-so. Its cause is above; the failure stays, as AGENTS.md records.
  Issue #101 stays open.
- pstack `how` and `blast-radius` as agent runs: each code path here is one small adapter file, so grounding was done
  inline with grep and the CI logs (the fan-out would cost more than the three files it would read).

## Findings

The run failed three jobs, each at a different step, for three unrelated causes.

### 1. pstack-picks: the rewrite rules no longer match upstream's text (step "Sync")

- Reproduced locally: `node tools/upstream-sync/src/cli.ts preview pstack-picks` exits 1 with the same three lines as
  CI (`skills/arena/SKILL.md:19`, `:30`, `skills/interrogate/SKILL.md:19`; the numbers include the two-line port note).
- Upstream pstack is at ae5650f; our pin is 519d36a. Two upstream commits since (c742dd6, ab1f702) rewrote arena's step 3
  and Phase C and rebuilt `interrogate` around arena (its four `references/` files are gone).
- Cause: `REWRITES` in `tools/upstream-sync/src/adapters/pstack.ts` anchors the arena rules on the old sentence endings
  (`... from its error message.` and `Prefer a different model family from the parent's.`). Upstream's longer fallback
  text has neither, so the rules match nothing and `GUARD` correctly refuses the Cursor model rule and `generalPurpose`.
  The interrogate rules (`Reviewer A-D` table, `Each reviewer gets ...`) target text upstream deleted.
- AGENTS.md already records this as a standing failure ("fails until a PR adapts the rewrites; don't hand-edit the pack").

### 2. tob-picks: the sync writes a name the repo's lint now forbids (step "Repo checks")

- Reproduced locally: `preview tob-picks` shows `spec-compliance-checker.md` changing `${PLUGIN_ROOT}` to
  `${CLAUDE_PLUGIN_ROOT}`; CI's `harness-compiler lint` reports lines 80, 86, 87, 91 and 93 of that file.
- The pack itself is unchanged ("no vendored changes"), so the sync opens no PR, but its side effect on the agent file
  persists in the checkout and check-repo fails.
- Cause: `tools/upstream-sync/src/adapters/tob.ts:126` replaces `{baseDir}/skills/` with `${CLAUDE_PLUGIN_ROOT}/packs/...`.
  #96 (2026-11-02, in the failed run's main) made `plugins/` agent-neutral: the committed file holds `${PLUGIN_ROOT}`,
  which the compiler maps per target (`transforms/text.ts:30`), and `lint` forbids `CLAUDE_PLUGIN_ROOT` outside
  `lint-allowlist.json`. That list covers `plugins/flows/packs` but not `plugins/flows/agents`, where this file lives.
- csharp.ts also writes `${CLAUDE_PLUGIN_ROOT}`, but into `plugins/opt-in/implementation/csharp-skills`, which is
  allowlisted; that is why only tob fails.

### 3. hallmark: upstream added test files that trip the skill scanner (step "Skill scan")

- Reproduced locally: applied `hallmark` in a scratch worktree (upstream 52328cb; CI had 4f6a46c) and ran
  `skill-scanner` 2.3.2 with the repo policy: 8 CRITICAL findings, all in four new files under `scripts/`:
  `capture.test.mjs`, `reroll-exhaustion.test.mjs`, `sloplint-render.test.mjs` (`COMMAND_INJECTION_EVAL`),
  `theme.test.mjs` (`child_process` spawns of node). The other findings are LOW, INFO and MEDIUM.
- None of the four is committed in our tree (`git ls-files` finds no `.test.` file in the three hallmark locations), and
  no vendored Markdown mentions them.
- Cause: the hallmark adapter ships "only the skill itself" and deletes upstream's dev checks by an explicit path list
  (`DROPPED`), which names no test files. Upstream added four in a week, so a list of names would fail again at the next
  one. The policy's existing hallmark suppressions cover `capture.mjs` and `sloplint-render.mjs`, not the tests.

## Tasks

- Task 1 (tob-picks): base c9bf39be79c921dbb965e2c3bb0aa7621e1477b7, untracked at start: `docs/features/sync-failures-hallmark-tob-pstack/flow.md`.
  Files: `tools/upstream-sync/src/adapters/tob.ts`, `tools/upstream-sync/src/adapters/tob.test.mjs`. files clean.
  Red: the new test failed with "plugins/ stays agent-neutral (harness-compiler lint)": the sync wrote `CLAUDE_PLUGIN_ROOT`.
  Green after the one-token change in `tob.ts`.
- Task 2 (hallmark): base c9bf39be79c921dbb965e2c3bb0aa7621e1477b7 (nothing committed yet, so `tob.ts` from task 1 is also
  in the diff), untracked at start: `docs/features/sync-failures-hallmark-tob-pstack/flow.md`,
  `tools/upstream-sync/src/adapters/tob.test.mjs`.
  Files: `tools/upstream-sync/src/adapters/hallmark.ts`, `tools/upstream-sync/src/adapters/hallmark.test.mjs`. files clean.
  Red: the new `run` test failed with `capture.test.mjs`, `sloplint-render.test.mjs` and `theme.test.mjs` in the shipped
  scripts. Green after the `cpSync` filter in `hallmark.ts`.

## Rulings

- 2026-11-03, Task 1: the tob regression test runs the adapter's `run(ctx)` against a fake local upstream and compares its
  output with the committed checker, instead of extracting a pure helper — extracting first would have been production code
  without a failing test, and the committed-file comparison pins the invariant that broke — if wrong, the fixture needs
  updating when the adapter's `REWRITES` change.
- 2026-11-03, Task 2: kept `treefmt`'s reflow of one pre-existing line in `hallmark.ts` (`scopeDescription`) — the repo's
  pre-commit treefmt would apply it at commit time anyway — if wrong, the diff carries one unrelated three-line hunk.
- 2026-11-03, Verify: ran `/self-review`'s passes inline instead of fanning out six agents — four code files but about
  eight lines of source change, just over its small-diff threshold of three files — if wrong, a finding an agent would
  have caught goes unseen.

## Deviations

## Verify

Latest run: HEAD c9bf39b with the uncommitted changes in `git status --short` (3 modified adapter files, the new
`tob.test.mjs`, this flow.md); the tree has not changed since.

| Part          | State                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checks        | green: `treefmt --fail-on-change` on the five files, `npm run typecheck`, `npm test` (0 failures, 3 skipped as before, both new tests in the run)                                                                                                                    |
| Real upstream | green: in a scratch worktree with the two adapter fixes, `apply tob-picks` left no diff and `check-repo` passed; `apply hallmark` (52328cb) shipped no `.test.` file, `check-repo` passed and the CI skill scan exited 0 (hallmark: 4 MEDIUM, was `[FAIL]` CRITICAL) |
| Review        | no findings (passes run inline, see Rulings): bugs, spec, standards, security, CLAUDE.md, comments, tests                                                                                                                                                            |
| Docs          | the diff leaves every statement it touches true; one stale sentence outside it (below)                                                                                                                                                                               |
| Tests         | `/test-audit` not offered: the analyzer pass found no gap that matters (regex variants beyond `.test.mjs` are untested and unused upstream)                                                                                                                          |
| Read          | the source diff was shown to the user in the conversation                                                                                                                                                                                                            |

Found outside the diff: AGENTS.md's CI paragraph says `sync.yml` also runs "as a dry run (no PR, no issues) on PRs
touching the sync code", but its `on:` has only `schedule` and `workflow_dispatch` (`grep -c pull_request` finds none;
removed in #89/#96). Not fixed here.

Not checked: the `issues` and `passed` steps (they talk to GitHub, so they run only in the workflow); a real green run
only comes from the Monday 06:00 UTC schedule or `gh workflow run sync.yml -f source=<name>` after the merge. pstack-picks
is unchanged and still red, by the user's decision.

## Learned

Nothing kept. `/learn` proposed three entries (an AGENTS.md line on neutral tokens in sync adapters and hallmark's
test-file drop, a fix for AGENTS.md's stale `sync.yml` dry-run sentence, and a `docs/solutions/` note on reproducing a
Skill scan failure with `skill-scanner scan <dir> --format json`); the user's answer picked none of them.

## Run verdict

2026-11-03, the user: worked as a whole: yes; clean: yes.
