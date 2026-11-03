---
name: review-code
description: 'Review a branch before it merges, or the whole repo: run its checks once, pick review lenses from what the diff touches (correctness, lean and spec, tests, docs, security, risk), verify every finding, and report on one screen with the full table in docs/audits/. Fixes only what you pick, then confirms the decisions the build made on its own and offers how to integrate. Never posts or pushes. Use for /review-code [branch|all] [base].'
disable-model-invocation: true
argument-hint: '[branch|all] [base branch or commit]'
---

# review-code

Is this change ready, and what should be fixed first? One review, as few agents as the diff needs, one short report.
The coding agent proposes and recommends; the user decides.

| Phase    | Runs                                                                                       | Output                                      |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 1 Scope  | flow-rules **Scope**                                                                       | base, diff, intent                          |
| 2 Checks | [references/checks.md](references/checks.md), superpowers `verification-before-completion` | every check green, or a stop; one run       |
| 3 Lenses | [references/lenses.md](references/lenses.md)                                               | candidate findings                          |
| 4 Verify | one fresh agent                                                                            | confirmed or plausible, each with a case    |
| 5 Report | [references/report.md](references/report.md)                                               | one screen, `docs/audits/…`. **Gate**       |
| 6 Fix    | the picks, test-first where behaviour changes; one fresh fix-check agent                   | fixes, re-checked                           |
| 7 Decide | checks.md **Decide**, superpowers `finishing-a-development-branch`                         | **Gate**: decisions, then what happens next |

[flow-rules.md](../../references/flow-rules.md) applies: read it first. Packs: `<flow-root>/packs` (tob, pstack and
mattpocock are its `-picks` folders; cloudflare is `security-audit`).

## Rules for the whole run

- **Never post.** Nothing goes to GitHub or anywhere else; the report stays in chat and in `docs/audits/`.
- **The diff is the working tree** against the merge-base, untracked files included: `git diff <merge-base>` plus
  `git ls-files --others --exclude-standard`.
- **Reviewers are independent.** Every agent is fresh (never a fork, no `name`) and gets only the diff command, the
  file list, the intent, the repo's standards and its brief. Never this conversation's account of why the code is
  right, and a lens never sees another lens's findings. The session that wrote the code is the author, not a reviewer.
- No code changes before the user picks in Phase 5. Commit only when the user asks.

## Phase 1: Scope

The argument is `branch` (default) or `all`, then an optional base; flow-rules **Scope** picks the base. Say the scope
in one line (`feature-x ← main, 12 files, +340 −95, 4 commits + uncommitted`). An empty diff: say so and stop.

The intent is the spec a calling build flow hands over; otherwise, first match: a `docs/features/*/flow.md` whose
`phase:` isn't `done` with the spec and plan it links, issue refs in the commit messages, a path the user names. None:
ask once in one line and start the lenses meanwhile; "none" skips the spec check, and the report says so. The
standards are every applicable AGENTS.md and CLAUDE.md (root and changed folders), CONTRIBUTING.md and similar.

## Phase 2: Checks

Follow [references/checks.md](references/checks.md) **Checks** (superpowers `systematic-debugging` for a red one, pstack
`interrogate` offered when execution ran without per-task reviews). A red check stops the review: show the output and
offer `/fix-flow` on it, with your recommendation.

## Phase 3: Lenses

Follow [references/lenses.md](references/lenses.md): it says which lenses run for this diff, one agent each, with
their briefs and models (`general-purpose` agents unless a brief names its own). In one message, start them all. Tell the user in one line which run and which were skipped,
and why. The lenses use: the host's `code-review` (correctness on a host that has it), ponytail `ponytail-review`,
`flows:pr-test-analyzer`, the host's `security-review`, pstack `blast-radius`, tob `spec-to-code-compliance` and
`flows:spec-compliance-checker` (docs), the instruction-file procedure (`claude-md-management:claude-md-improver`),
web-mcp `fetch` and `flows:writing` (docs), and under `all` tob `mutation-testing` and `property-based-testing`,
cloudflare `security-audit`, tob `sharp-edges`, ponytail `ponytail-audit`, mattpocock `improve-codebase-architecture`
and `grilling`, pstack `principle-boundary-discipline`, and `claude-security:claude-security`.

If subagents are unavailable, skip the agent lenses and list them as not checked; never run them one after another in
the main session.

## Phase 4: Verify findings

One fresh agent that ran no lens gets every candidate (merged: the same issue from two lenses is one, citing both),
the diff command and the cited files. Per candidate it reads the lines and marks it **confirmed** (it read the line,
and the failure follows for the stated case) or **plausible** (likely, not shown). A candidate without a concrete
case (this input or situation leads to this wrong result) is dropped and counted. Security and security-domain
findings keep their own severity.

## Phase 5: Report

Follow [references/report.md](references/report.md). **Gate:** the user picks by number (`1,3`, `all fix`, `none`).

## Phase 6: Fix

Per pick: a fix that changes behaviour gets a failing test first (superpowers `test-driven-development`); a doc fix
changes the doc to match the code, unless the user picks fixing the code. A finding that needs a cause before a fix
(a failing test, a symptom whose root cause isn't known): offer `/fix-flow` on it; on the user's yes read
`<skill-dir>/../fix-flow/SKILL.md` and run it inline (flow-rules **Calling another conductor**), up to its Finish. The
picks are the contract: the files their findings name are the **Files** list, and a fix that needs more is a
deviation (flow-rules **Deviations**). Picks from the `all` passes follow their own fix rules in
[references/tests-all.md](references/tests-all.md) and [references/harden-all.md](references/harden-all.md).

Then one fresh agent that wrote no fix gets each fixed finding, the fix diff and the cited places:

```
For each finding, check whether the fix resolves it at the cited place and wherever the same problem appears in
the diff. Look for regressions next to the change. Run a test or a command where reading can't settle it;
otherwise say what you couldn't check. Per finding: PASS or FAIL, with the line you read or the command you ran
and its output. Don't rewrite the code.
```

A FAIL goes back to the fix. The same finding failing twice goes to the user with both attempts. Record picks and
fixes in the audit file (flow-rules **Reports**).

## Phase 7: Decide

Follow [references/checks.md](references/checks.md) **Decide**: the verdict, the decisions the build made on its own
(**Waiting on you** in the report), then `finishing-a-development-branch`. Called from a build flow, record the
result in its flow.md; standalone, offer `/learn` after this gate.
