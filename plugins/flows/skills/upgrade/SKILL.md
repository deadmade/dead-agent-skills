---
name: upgrade
description: 'Upgrade dependencies safely: one package, a list, or everything outdated. Read each changelog and migration guide, map what the breaking changes hit, approve one task or a plan, bump on a branch, fix and test in batches, then /review-code and /learn. Resumable. Use for /upgrade [package[@version] …, or outdated]; no argument resumes.'
disable-model-invocation: true
argument-hint: '<package>[@version] …, or outdated'
uses: dead-skills:context7, superpowers:test-driven-development
template: references/build-template.md
---

# upgrade

Know what a bump breaks before you make it, and make it on a branch, behind a gate.

[step: phases]

## Rules for the whole run

[step: host]

[step: run-rules]

**A missing piece** (a plugin or a pack file this flow uses):

[step: missing-piece]

## Start or resume

`flow: upgrade`, template: [build-template.md](../../references/build-template.md). The input is one package
(`react`, `react@19`), a list, or `outdated` (everything outdated). One package's slug is `upgrade-<package>`
(`upgrade-types-node` for `@types/node`); a list's or `outdated`'s is `upgrade-<YYYY-MM-DD>`.

[step: state]

[step: start]

## Phase 1: Research

<!-- runs: each manifest's outdated command, the changelogs and migration guides, context7 · output: the confirmed bump list, breaking changes -->

**The bump list.** Each package's current version comes from its manifest and lockfile, the target from the input,
else the latest stable release. `outdated` means each manifest's own outdated command (`npm outdated`,
`cargo outdated`, `dotnet list package --outdated`, …), not flake inputs, SHA-pinned Actions or vendored packs. An
area is one manifest with its lockfile; in a monorepo each manifest is its own area. Show the list (package, area,
from → to, majors marked) and have the user confirm it in one line before any changelog is read.

**The changelogs.** Patch and minor bumps are read as one group: their release notes, for deprecations and changed
defaults. Each major gets its own read: the release notes for every version in between (the changelog, GitHub
releases, the migration guide) with {{web-fetch}}, and the new API with context7. List under **Findings** each
breaking change, deprecation and changed default, with its source link, and link the sources under **Artifacts**.

## Phase 2: Impact

<!-- runs: grep, pstack `blast-radius` and `how`, superpowers `writing-plans` (a plan) · output: the break map, one task or a plan -->

Grep every import and call of each package with a finding; run pstack `blast-radius` on the busiest ones. Ground the
code they hit:

[step: ground-code]

Under **Findings**, map each finding to the `file:line`s it hits, or "not used here". Check each dependency's own new
requirements (runtime version, peer dependencies, licence change).

The one task and the plan below are both written under this rule, and the builder brief pastes it in:

[step: before-you-write]

**One task**, when the list holds only patch and minor bumps, all in one area: no plan.md and no executor. The task
is the bump list; its **Files** list is that area's manifest and lockfile plus every file the break map says a change
hits, written under **Grounding**. The gate shows the bump list, the break map and the **Files** list, as
`- Gate 1, upgrade approved: <date>`, and asks no execution method. flow.md is never copyedited, so the gate message
says `not copyedited: no plan`.

**A plan**, for any major and for bumps in several areas. The patch and minor bumps are one task together; each major
gets its own. The bump task's check, its test command, is the package manager's install or restore (the lockfile
updated, the restore clean), never the suite, which a breaking bump leaves red. Each later task fixes one batch (a
project or a folder) and its check is that batch's build and tests; the last task runs the full suite. A framework
migration (xUnit v2 → v4) plans its fixes in such batches, each one green. Where the ecosystem allows a version per
project, a batch bumps its own manifest with its fixes; where it doesn't (one central version or lockfile), the plan
says that the intermediate batches are checked by building that batch only. Deprecated calls are replaced only where
the plan says so. **Global Constraints** also get: "A failed install or restore stops the task: report
`NEEDS_CONTEXT` with the package manager's error." The plan is written, copyedited and checked by these rules:

[step: plan-shape]

[step: copyedit]

[step: plan-check]

**Gate 1:** the break map, the one task or the plan (glance's block, its **Test seams**, each task's **Files** list),
the new requirements, and your recommendation: the targets as listed, or stop a package at an earlier version.

[step: gate]

## Phase 3: Bump

<!-- runs: the package manager, then this session (one task) or superpowers `subagent-driven-development` or `executing-plans` (a plan) · output: updated manifests and lockfiles, code, tests -->

[step: worktree]

[step: builder-brief]

[step: deviations]

**A failed install or restore** (a peer conflict, the registry down, a lockfile that won't resolve), on either path:
stop with the package manager's error, its cause and the options (pin an earlier target, bump or add the peer, retry
later), with a recommendation. Nothing after it runs until the user picks one.

**The one task** is built by this session:

[step: one-task]

In this order, the fixes by superpowers `test-driven-development`:

1. **The bump**, with each manifest's own package manager, so its lockfile follows; then the install or restore.
2. **Each hit** the break map lists: where no test covers the changed behaviour, write one that fails on the old
   usage first, then fix the usage. Deprecated calls are replaced only where the gate's task says so.
3. **The full suite.**

**A plan** is built by the method its gate picked:

[step: execute]

## Phase 4: Finish

<!-- runs: `/review-code`, `/learn` · output: walkthrough, review, lessons, branch handled -->

/review-code and /learn run inline, by this rule:

[step: call-conductor]

/review-code's intent is the confirmed bump list and the break map under **Findings**, with plan.md on the plan path.
On the one-task path no per-task review ran: tell /review-code that execution ran natively. The Walkthrough's goals
are the breaking changes that hit, one row each.

[step: finish]

[step: decide]

[step: close]
