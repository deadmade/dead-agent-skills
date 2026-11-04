# Raw evaluation: /build-feature, /implement, /upgrade (unverified, 2026-11-04)

Reviewer: fresh opus agent, read-only. Paths under `plugins/flows/`. [certain] checked, [measured] ran, [likely]
inferred. Verification pending.

## build-feature

1. [measured] Added tasks break `task-brief`: flow-rules:93 numbers added tasks `8b`, `8c`; task-brief:33 matches
   `"Task " n "([^0-9]|$)"`, so `task-brief plan.md 8` returns 8b's steps too.
2. [certain] Rulings lost in native mode: build-feature:168 and flow-rules:126 copy Rulings "Before SDD deletes its
   workspace", but executing-plans:300 also deletes its workspace; Decide reads only flow.md (flow-rules:127-128).
3. [likely] The SDD worktree (cut from HEAD) lacks the uncommitted spec, plan and flow.md (flow-rules:148); no step
   copies them; resume search misses `worktrees/` (using-git-worktrees:72).
4. [likely] writing-plans:99 writes `Modify: path:123-145`; the files check (flow-rules:116-120) compares Files to
   `git diff --name-only` and passes them to `git diff --numstat <base> --`: off-list for every modified file, size 0.
5. [certain] Dead reference: SKILL.md:125 "(after mattpocock `tdd`)"; no such pack skill.
6. [certain] flow-template.md lacks Learned and review sections that learn:80 and review-code write.

## implement

1. [certain] Does/Depends on/Adds/Size required only for a supplied plan (implement:42-45), not on the spec/ticket
   path (46-48) or "Either way" (50-53): glance fails, Adds check never runs.
2. [certain] Start lacks build-feature's guards (slug exists, flow: mismatch, worktree search, never create over
   existing; implement:26-28 vs build-feature:43-52).
3. [likely] A supplied plan outside docs/features/<slug>/ is edited in place (implement:42) though flow-rules:143 says
   plans live only there.
4. [likely] writing-plans asks for the execution method before the Gate in implement and upgrade; only build-feature:142
   overrides it.
5. [likely] Leftover tickets after "plan only the first ticket" (implement:47-48) are recorded nowhere.

## upgrade

1. [likely] Bump-first task can't complete: upgrade:38-39 "the bump first"; executing-plans task-done (224-231)
   records completion "only if they pass".
2. [certain] Inline path (≤2 areas, upgrade:46-50): no worktree, branch guard, per-task base or ledger, yet it names
   the files check, which needs `Task <N>: base <sha>`; can bump on main without executing-plans:112's consent.
3. [certain] Plan lacks "Before you write" (flow-rules:191), Adds/Size, Test seams, seam constraints; flow-rules:207
   "only through the plan's Test seams" vs upgrade:47-48 "write one that fails on the old usage first".
4. [likely] upgrade:54 bare "Run `/review-code`" (no `branch`, intent, native flag; cf implement:69); review-code:41-42
   may pick another run's flow.md.
5. [certain] slug `upgrade-<package>` (upgrade:18) breaks on `@types/node`; a second upgrade recreates the flow.md.
6. Missing: failed install (peer conflict, registry down), monorepos with several manifests.

## Shared across build flows

- [certain] flow-rules:10-11 "do not replace it with a sequential review in the main session" vs executing-plans:253-254
  "Without a subagent tool: read code-reviewer.md and perform that review yourself"; no override marker.
- [certain] Adds check lives only in the task reviewer's prompt (flow-rules:111-112); native mode has no task
  reviewer; the brief clause (105) has no recipient.
- [likely] The pasted "smallest complete change" includes ponytail:41 ("one small test or an assert-based
  self-check"), overridden at flow-rules:213; briefs carry both.
- [likely] executing-plans:278-283 "write the test that reproduces the finding" vs flow-rules:207-209 Test seams only.
- [likely] handling-reports.md:12 "break it into smaller pieces" not overridden: splits change the plan without the
  user.
- [certain] No build conductor asks for the Run verdict (flow-rules:130); build-feature:176, implement:69-70,
  upgrade:54 go to done; only research-feature:94 asks.
- Missing: re-entry point for a decision reopened at Decide (checks.md:41); abandoning/rolling back a run; resume
  after the base moved; merge conflicts; failing baseline tests not recorded.
- Readability: flow-rules:70-74 one sentence with nested clauses; flow-rules:113-122 files + size check in one
  bullet; build-feature:43-49 five rules in one bullet; implement:50-53 four requirements in one sentence; whether
  `phase:` names the finished or the next phase is unsaid.
