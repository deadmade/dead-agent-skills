# Checks

Follow superpowers `verification-before-completion`. The checks are what the repo documents (CLAUDE.md,
CONTRIBUTING.md, the `test`/`lint` scripts, the CI workflows the diff would trigger), not a guess: run every one that
applies to the changed files and read the output. A repo that documents no checks: say so in the Checks row and go on.

A red check: run the same command on the merge-base, in a scratch `git worktree` (never the user's tree). Red there
too, it is **pre-existing**: the Checks row reports it as such, with both outputs, and the review goes on. Red only
on this tree, it stops the review: show the failing output, find the cause with superpowers `systematic-debugging`,
and offer `/fix` on it with your recommendation. The review goes on once the checks are green or pre-existing.

**One run.** This run is the latest run: its output is the evidence for every later phase and for the verdict. Keep
it, with the commit (`git rev-parse HEAD`) and `git status --short` it ran on. Any full-suite run on the same commit,
with the tree unchanged, counts as the latest run, a caller's or an inline `/fix`'s included: a caller hands over its
commands, commit and status, and this phase runs only the checks it didn't. Nothing re-runs the suite while the tree
is unchanged: not the deep tests pass's baseline, not finishing's Step 1. Phase 6's fixes change the tree, so where the
latest run is used after them (the deep tests pass's baseline, the verdict), the checks re-run once first, and that
run becomes the latest.

A caller that says execution ran without per-task reviews also gets pstack `interrogate` offered before the lenses.
