# Checks and Decide

## Checks

Follow superpowers `verification-before-completion`. The checks are what the repo documents (AGENTS.md,
CONTRIBUTING.md, the `test`/`lint` scripts, the CI workflows the diff would trigger), not a guess: run every one that
applies to the changed files and read the output. A red check stops the review: show the failing output, find the
cause with superpowers `systematic-debugging`, and offer `/fix` on it with your recommendation. The review goes on
only once the checks are green.

**One run.** This run is the latest run: its output is the evidence for every later phase and for the verdict. Keep
it, with the commit (`git rev-parse HEAD`) and `git status --short` it ran on. Nothing re-runs the suite while the
tree is unchanged: not Phase 6's fix check, not the deep tests pass's baseline, not finishing's Step 1. Where the
latest run is used next (the deep tests pass's baseline, the verdict), a tree changed since calls for one re-run
first, which becomes the latest run. A full-suite run by an inline `/fix` is the latest run too, while the tree
is unchanged after it.

A caller that says execution ran without per-task reviews also gets pstack `interrogate` offered before the lenses.

## Decide

The verdict, one row each, with the evidence:

| Part        | State                                                                                 |
| ----------- | ------------------------------------------------------------------------------------- |
| Checks      | green: the commands of the last run, its commit, and that the tree since is unchanged |
| Review      | findings fixed, findings the user left, and why                                       |
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

**Push and PR**, when the user picks that option. Commits are shown (message and files each) before any is made: one
sentence, no co-author lines, `git add -u` plus new paths by name. Never run `git push` or a `gh` command that writes;
pushing is the owner's call and their hooks block it.

- The body, saved to a scratchpad file: why; what changed, opening with the smallest picture of it (a call tree, a
  before/after line, a few boxes in plain text); blast radius (pstack `blast-radius` over the diff) with a **Door**
  line (one-way: data, a wire format, a public interface; two-way: a revert undoes it); verification, with the
  before/after output where behaviour changed. Revise it by `flows:writing`.
- **Gate:** show the title and body. On approval, hand over `! git push -u origin <branch>` and
  `! gh pr create --title "<title>" --body-file <file>`.
- Once the PR exists, `Monitor` on `gh pr checks <pr> --watch`. A red check: superpowers `systematic-debugging` to the
  cause, then stop with the check, the cause and the options (a fix, a rerun, a flaky test). The push of a fix is
  again the user's `!` line.
