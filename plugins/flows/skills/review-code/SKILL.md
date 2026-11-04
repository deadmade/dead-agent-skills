---
name: review-code
description: 'Review a branch before it merges, the whole repo, or a pull request: run its checks once, settle the intent, pick review lenses from what the diff touches (correctness, lean and spec, tests, docs, security, risk), verify every finding, and report on one screen with the full table in docs/audits/. Fixes only what you pick, then confirms the decisions the build made on its own, makes the commits and offers how to integrate; a pull request is only reported on. Never posts or pushes. Use for /review-code [branch|all|pr <number>] [base].'
disable-model-invocation: true
argument-hint: '[branch|all|pr <number>] [base branch or commit]'
uses: flows:writing, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:test-driven-development, ponytail:ponytail-review, ponytail:ponytail-audit, pstack-picks:blast-radius, pstack-picks:interrogate, pstack-picks:principle-boundary-discipline, tob-picks:spec-to-code-compliance, tob-picks:spec-compliance, tob-picks:spec-compliance-checker, tob-picks:mutation-testing, tob-picks:property-based-testing, tob-picks:sharp-edges, security-audit:security-audit, mattpocock-picks:improve-codebase-architecture, mattpocock-picks:grilling
template: skills/review-code/references/audit-template.md
---

# review-code

Is this change ready, and what should be fixed first? One review, as few agents as the diff needs, one short report.

[step: phases]

## Rules for the whole run

[step: host]

[step: run-rules]

This flow adds:

- **Never post.** Nothing goes to GitHub or anywhere else; the report stays in chat and in `docs/audits/`.
- **The diff** is the working tree against the merge-base, untracked files included: `git diff <merge-base>` plus
  `git ls-files --others --exclude-standard`. Under `pr`, it is `gh pr diff <number>`.
- **Lenses are independent.** A lens gets only the diff command, the file list, the intent, the repo's standards and
  its brief, and never sees another lens's findings; the small diff's combined agent is the one exception
  ([references/lenses.md](references/lenses.md)). Where the adapter says a built-in review "runs forked", that is the
  host's own fresh reviewer, which counts as fresh; a fork of this conversation never does.
- No code changes before Gate 1 passes.

Without subagents: the lenses, the verifier and the fix check are skipped and recorded under **Skipped** in the audit
file. The repo's own checks (Phase 2) still run, and the report's verdict is `blocked: the review was not done (no
subagents)`. The main session never reviews its own diff.

**A missing piece** (a plugin or a pack file this flow uses):

[step: missing-piece]

## Start

/review-code keeps no flow.md: its record is the audit file (Phase 5), and without a flow.md the audit file stands in
for it wherever a step below says flow.md. Gate lines go into the audit file: Gate 1 under **Findings**, after the
`Picks:` line; Gate 2 under **Run verdict**.

- **Standalone,** the argument is the target, `branch` (the default), `all` or `pr <number>`, then an optional base.
- **Called inline** (a build flow's Finish, or /fix), the caller hands over the target, the intent and whether
  execution ran natively. The run goes through Phase 6 and stops there: the caller's Decide and Close cover Phase 7.
  Its gates continue the caller's numbering in the caller's flow.md.

## Phase 1: Scope

<!-- runs: the target, the intent question · output: base, diff, intent -->

- **branch:** the base is a named base, else `origin/HEAD`, else `origin/main` or `origin/master`. The scope is the
  working tree against `git merge-base <base> HEAD`, untracked files included, plus what the change should have
  touched and didn't: the tests of changed code, the docs that describe it.
- **all:** every tracked file.
- **pr `<number>`:** someone else's pull request, read-only. The diff is `gh pr diff <number>`, the base and head
  come from `gh pr view <number>`, and the code around the diff is read with `git show <head sha>:<path>` after
  `git fetch origin pull/<number>/head`. The PR is never checked out, built or run.
- Either way, skip content the repo marks as vendored or generated (CLAUDE.md, a `THIRD_PARTY.md`, a sync script):
  a finding there names the upstream or the sync transform, never the copied file.
- Say the scope in one line (`branch: feat-x ← main, 12 files, +340 −95, 4 commits + uncommitted`,
  `all: 340 files, vendored skipped` or `pr 42: feat-x → main, 5 files`). An empty diff: say so and stop.

The intent is what a calling flow hands over: the spec and the plan of a build flow, a ticket, or the cause /fix
fixed. Otherwise, first match: a `docs/features/*/flow.md` whose `phase:` isn't `done`, with the spec and plan it
links (several: ask which one); issue refs in the commit messages (under `pr`, in the PR's body); a path the user
names. None: ask once in one line. "none" skips the spec check, and the report says so. Ask now, while Phase 2 runs;
no lens starts before the intent is settled.

The standards are every applicable AGENTS.md and CLAUDE.md (root and changed folders), CONTRIBUTING.md and similar.

## Phase 2: Checks

<!-- runs: the repo's documented checks, superpowers `verification-before-completion` · output: every check green or pre-existing, or a stop; one run -->

Follow [references/checks.md](references/checks.md). Under `pr`, nothing runs: the Checks row is the output of
`gh pr checks <number>`, as it stands.

## Phase 3: Lenses

<!-- runs: the lenses lenses.md picks · output: candidate findings -->

Once the checks are done and the intent is settled, follow [references/lenses.md](references/lenses.md): it says which
lenses run for this diff, with their briefs and models. In one message, start them all. Tell the user in one line
which ran and which were skipped, and why, and write the skipped ones under **Skipped**.

Then offer, in one question with your recommendation and each one's cost in agents, the passes the lenses can't run
themselves: under `all`, those in lenses.md **`all`** ([references/tests-all.md](references/tests-all.md),
[references/harden-all.md](references/harden-all.md)); and the every-claim pass
([references/docs.md](references/docs.md) **Every claim**) when the docs lens returned claims it didn't check. Run
those the user says yes to; their findings join the candidates.

## Phase 4: Verify

<!-- runs: one fresh agent · output: confirmed or plausible, each with a case -->

One fresh agent that ran no lens gets every candidate (merged: the same issue from two lenses is one, citing both),
the diff command and the cited files. Per candidate it reads the lines and marks it **confirmed** (it read the line,
and the failure follows for the stated case) or **plausible** (likely, not shown). A candidate without a concrete
case (this input or situation leads to this wrong result) is dropped and counted. Security and security-domain
findings keep their own severity.

## Phase 5: Report

<!-- runs: report.md, the copyedit · output: one screen, `docs/audits/…` -->

Follow [references/report.md](references/report.md), then copyedit the audit file:

[step: copyedit]

**Gate 1, report:** the user picks by number (`1,3`, `all fix` for every finding whose `bucket` is
`fix before merge`, `all`, `none`). Record `Picks: <finding numbers> | none` in the audit file. Under `pr`, there is
nothing to pick: the gate approves the report, with `Picks: none`, and Phase 6 doesn't run.

[step: gate]

## Phase 6: Fix

<!-- runs: the picks, test-first where behaviour changes; one fresh fix-check agent · output: fixes, re-checked -->

Fix only the picks. Each pick is a task, `Task <finding number>` under **Tasks**, and the files its finding names are
its **Files** list. A fix that changes behaviour gets a failing test first (superpowers
`test-driven-development`); a doc fix changes the doc to match the code, unless the user picks fixing the code. Picks
from the `all` passes follow their own fix rules in tests-all.md and harden-all.md. Every fix follows the builder
brief:

[step: before-you-write]

[step: builder-brief]

[step: deviations]

A finding that needs a cause before a fix (a failing test, a symptom whose root cause isn't known): offer `/fix` on
it. On the user's yes, run `/fix` inline, up to its Finish, by this rule:

[step: call-conductor]

Then one fresh agent that wrote no fix gets each fixed finding, the fix diff and the cited places:

```
For each finding, check whether the fix resolves it at the cited place and wherever the same problem appears in
the diff. Look for regressions next to the change. Run a test or a command where reading can't settle it;
otherwise say what you couldn't check. Per finding: PASS or FAIL, with the line you read or the command you ran
and its output. Don't rewrite the code.
```

A FAIL goes back to the fix. The same finding failing twice goes to the user with both attempts. Once a pick's check
passes, add `Fixed <date>: <number>` under **Findings**.

Called inline, the run stops here and returns to its caller.

## Phase 7: Decide

<!-- runs: the decisions gate, superpowers `finishing-a-development-branch` · output: decisions, commits, how the branch ends -->

Standalone only. Offer `/learn` first; the Parking-lot lines it adds are decided below. The decisions include each new
`shortcut:` line (what ponytail `ponytail-debt` lists), each decided under **Waiting on you**. The Checks row says what
Phase 2 found: green, a pre-existing red check, no documented checks, or under `pr` the output of `gh pr checks`.
Under `pr`, the only commit Decide offers is the audit file's.

[step: gate]

[step: decide]

Under `pr`, the run ends here: the branch is someone else's, so Close doesn't run.

[step: close]
