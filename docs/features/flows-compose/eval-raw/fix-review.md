# Raw evaluation: /fix and /review-code (unverified, 2026-11-04)

Reviewer: fresh opus agent, read-only. C = it checked, L = likely. Verification pending.

## /fix

1. C: gate bypassed. fix:47 "Follow superpowers `systematic-debugging` … It ends with a root cause." But
   systematic-debugging/SKILL.md:158 "Did it work? Yes → Phase 4", and its Phase 4 (168–189) writes the failing test and
   "Implement Single Fix"; its Phase 3 "smallest possible change to test hypothesis" (152–155) edits code before the
   gate. Nothing stops the agent after Phase 3; flow-rules:49 only covers invoking another skill.
2. C: Prove it can destroy the fix. fix:68 "the fix reverted, the test kept" with no how; the fix is uncommitted, a
   `git checkout --` or bare stash loses it. tests-all.md:25–26 has the safe recipe (scratch `git worktree` of
   `git stash create`).
3. C: Finish order. fix:75 runs /review-code (whose Phase 7 runs finishing-a-development-branch: merge of commits,
   worktree removal, branch delete, finishing:94–111,161–176) and only then /learn; flow-rules:147 "Commit or push only
   when the user asks", no step commits the fix, flow.md or audit file. Merge carries nothing; /learn writes after merge.
4. L: the test file triggers a deviation. fix:63 "the files it names are its **Files** list"; gate options name the
   fixed files (fix:49), not the test; files check (flow-rules:117–118) flags the test.
5. C: dead references. fix:62 "pstack `tdd`", fix:67 "trailofbits `patching-bugs`": neither in packs/; flow-rules:233
   says a missing pack file means "flows is broken, reinstall it".
6. C: no retry limit on Prove it (fix:70 "goes back to Phase 3"); review-code:96 has "failing twice goes to the user";
   systematic-debugging:194–196 stops after 3.
7. C: flaky bugs. Only "Can't reproduce" (fix:32–33); a 1-in-20 bug can't pass Prove it; loops forever.
8. C: resume with several open fix flows: fix:28 has no "several: ask which" (implement:27 does).
9. L: brief clause has no brief: fix:57 pastes "into the fix brief" but never says Phase 4 runs in a subagent; the
   files check needs `Task <N>: base <sha>` (flow-rules:113–114) and /fix has no tasks.
10. C, low: fix:10 "no fix without a test that failed first" vs fix:59–61 runnable-check exception.

## /review-code

1. C: lenses start before checks. SKILL:42–43 "start the lenses meanwhile" (Phase 1) vs checks.md:8–9 "The review goes
   on only once the checks are green." Early lenses also miss the intent the user answers with.
2. C: claude-code.md:12 "use `security-review` or `claude-security` when available" vs lenses.md:47 "`claude-security`
   is not run here … it is an `all` pass."
3. C: claude-code.md:20 built-in code-review "runs forked" vs review-code:31 "never a fork".
4. C: small-diff rule (lenses.md:16, one agent runs every lens) vs review-code:33 "a lens never sees another lens's
   findings"; no model named for it.
5. C: merge doesn't contain what was reviewed: diff includes uncommitted (review-code:29–30); show-commits rule only
   under Push and PR (checks.md:50); merge option leaves uncommitted code behind.
6. C: Phase 6 lacks the smallest-change paste (flow-rules:192 says fixes in review-code get it; review-code:79–85
   doesn't); standalone Deviations/Rulings have no home (harden-all.md:44–45 has one, Phase 6 doesn't; checks.md:34,40).
7. C: missing cases: pre-existing red check on base stops all (checks.md:7–9); repo with no checks (checks.md:27); no
   target for someone else's PR.
8. L: docs lens (a subagent) launches spec-compliance-checker agents (docs.md:19–22); "two refuters per divergence"
   vs spec-compliance.md:16 one reviewer.
9. L: >5 fix-before-merge findings (report.md:33) have nowhere to go.
10. L: lean lens drops ponytail-review:63–64 ("a `shortcut:` comment … is a decision, not a finding").
11. L: Claude-only steps without Codex form: `Monitor` (review-code:102), `!` handover (checks.md:59–61); built-in
    code-review needs a clean tree (claude-code.md:18), flows never commit, so under /fix it never runs.
12. L: suite runs twice: checks.md:15 counts only an inline /fix's run.
13. L: intent pick with several open flows is arbitrary (review-code:41–42).

## Readability

- fix:55–65: one paragraph with TDD, ponytail paste, runnable-check exception, Files list, four-part Deviations import.
- checks.md:11–16 "not Phase 6's fix check", but Phase 6 always changes the tree.
- flow-rules:70–74: one sentence, six deviation classes.
- review-code:54–60: ~20 skills in one sentence, repeats lenses.md.
