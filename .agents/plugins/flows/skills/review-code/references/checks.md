# Checks and Decide

## Checks

Follow superpowers `verification-before-completion`. The checks are what the repo documents (AGENTS.md,
CONTRIBUTING.md, the `test`/`lint` scripts, the CI workflows the diff would trigger), not a guess: run every one that
applies to the changed files and read the output. A red check stops the flow: show the failing output, find the cause
with superpowers `systematic-debugging`, and fix it on the user's yes (offer `/fix`) before going on.

**One run.** This run is the latest run: its output is the evidence for every later phase and for the verdict. Keep
it, with the commit (`git rev-parse HEAD`) and `git status --short` it ran on. Nothing re-runs the suite while the
tree is unchanged: not Phase 6's fix check, not the deep tests pass's baseline, not finishing's Step 1. Where the
latest run is used next (the deep tests pass's baseline, the verdict), a tree changed since calls for one re-run
first, which becomes the latest run. A full-suite run by an inline `/fix` is the latest run too, while the tree
is unchanged after it.
<!-- overrides superpowers/skills/verification-before-completion/SKILL.md: "If you haven't run the verification command in this message, you cannot claim it passes." -->

A caller that says execution ran without per-task reviews also gets pstack `interrogate` offered before the lenses.

## Decide

The verdict, one row each, with the evidence:

| Part        | State                                                                                 |
| ----------- | ------------------------------------------------------------------------------------- |
| Checks      | green: the commands of the last run, its commit, and that the tree since is unchanged |
| Review      | findings fixed, findings the user left, and why                                       |
| Read        | `git diff --stat <merge-base>` shown and the walkthrough offered, or skipped          |
| Decisions   | every item below, confirmed or reopened by the user                                   |
| Not checked | flow-rules **ponytail at chosen steps**, the footer line                              |

**Decisions** are what the build decided without the user, in the report's **Waiting on you** list:

- each line under **Rulings** in the caller's flow.md, or an inline `/fix`'s when there is no caller;
- each entry under **Deviations** in it, with the decision it got;
- each line under **Parking lot** in it: do now, a follow-up, or drop;
- each new `shortcut:` line the branch adds: `git diff <merge-base> | rg '^\+.*shortcut:'`, plus `rg 'shortcut:'` on
  the untracked files.

Standalone, without a flow.md, the shortcut lines and an inline `/fix`'s Rulings. **Gate:** the user confirms or
reopens each one (`all`, or letters to reopen). A reopened one is a fix on the user's yes: back to the caller's build
flow, else fixed here, and the checks re-run.

**Ready** means every row is green or the user accepted what is left. If the tree changed since the last run, re-run
the checks first. Then follow `finishing-a-development-branch` from its Step 2: the last run is its Step 1. Show its
options as it lists them, with your recommendation. It's the user's choice; called from a build flow, record it and
the confirmed decisions in its flow.md.
<!-- overrides superpowers/skills/finishing-a-development-branch/SKILL.md: "Run the project's full test suite" -->
