# flows

Conductor skills: each one runs the skills the rest of this marketplace ships, in order, and stops at approval gates.
Build and research flows keep a flow.md to resume from; /review-code keeps an audit file. Claude proposes and
recommends; you decide.

| Command                                          | Job                                                             | Runs                                                                                                                                                                                                                                                                        | Ends in                                           |
| ------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `/understand <topic>`                            | learn a codebase, subsystem or concept                          | graphify, pstack `how` and `why`, mattpocock `teach` in learning style (you write the key lines)                                                                                                                                                                            | terms in GLOSSARY.md                              |
| `/build-feature <what>`                          | a new feature with a design                                     | prior art, `brainstorming`, `grilling` + `domain-modeling`, `writing-plans`, plan review, execute                                                                                                                                                                           | `/review-code`, `/learn`                          |
| `/research-feature <question>`                   | research a design question before building                      | frame, papers and engineering sources (web-mcp, paper-lookup), source check, `grilling` on the options; no build, no benchmark                                                                                                                                              | a decision report, then `/build-feature`          |
| `/implement <ticket or plan>`                    | build a ticket or a given plan                                  | reads and checks the input, one gate to confirm it; a ticket in this session, a plan through superpowers execution; never plans, never changes a plan                                                                                                                       | `/review-code`, `/learn`                          |
| `/fix <symptom>`                                 | fix a bug                                                       | reproduce, `how` + `blast-radius`, upstream search, `systematic-debugging`, failing test first                                                                                                                                                                              | `/review-code`, `/learn`                          |
| `/upgrade <pkg>[@v] …`                           | bump one dependency, a list, or all outdated                    | changelogs via web-mcp and context7, `blast-radius`; patch and minor bumps as one task, majors through a plan; bump, fix test-first in batches                                                                                                                              | `/review-code`, `/learn`                          |
| `/refactor <what>`                               | restructure code without changing behaviour                     | `how` and the suite, shape and size the target, a plan, characterization tests where coverage is thin, the moves on a branch                                                                                                                                                | `/review-code`, `/learn`                          |
| `/review-code [branch\|all\|pr <number>] [base]` | review a branch before merge, the whole repo, or a pull request | checks once, lenses picked from the diff (correctness: the host's `code-review` or ponytail; lean and spec; tests; docs; security; risk), one verifier, a one-screen report; `all` adds mutation testing, hardening and a full security scan on your yes; `pr` only reports | merge, or a PR (`!` lines to push) and CI watched |
| `/learn [flow]`                                  | keep what the work taught                                       | no questions: the few lessons that matter, written to AGENTS.md/CLAUDE.md, `domain-modeling`, a `docs/solutions/` note or memory; ADRs, checks and skill fixes to the Parking lot                                                                                           | done                                              |
| `/flows:writing copyedit <file.md>`              | revise a finished document for a new reader                     | a fresh agent revises it by the `writing` skill; `compare.mjs` refuses an edit that lost what code can check                                                                                                                                                                | the edited document, uncommitted                  |

`branch` (the default) audits what changed against the base, plus the tests and docs that should have changed with
it; `all` audits the whole repo, vendored content skipped.

## What each conductor uses

Generated from each conductor's `uses:` line, its steps' and its host wording's by `node scripts/flows-uses.mjs`;
`npm test` fails when it is stale.
Installing flows installs every plugin below; the packs ship inside flows itself.

<!-- uses:start -->

```text
build-feature
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), WebSearch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: writing
├ graphify: graphify
├ mattpocock-picks: codebase-design, domain-modeling, grilling, setup-matt-pocock-skills
├ ponytail: ponytail-review
├ pstack-picks: architect, arena, blast-radius, how, interrogate, principle-boundary-discipline, principle-redesign-from-first-principles, why
├ superpowers: brainstorming, executing-plans, finishing-a-development-branch, subagent-driven-development, systematic-debugging, using-git-worktrees, writing-plans
└ web-mcp: fetch, search

fix
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), WebSearch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: writing
├ pstack-picks: blast-radius, how, interrogate, why
├ superpowers: finishing-a-development-branch, systematic-debugging, test-driven-development, using-git-worktrees
└ web-mcp: fetch, search

implement
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: writing
├ graphify: graphify
├ mattpocock-picks: setup-matt-pocock-skills
├ pstack-picks: blast-radius, how, interrogate, why
├ superpowers: executing-plans, finishing-a-development-branch, subagent-driven-development, systematic-debugging, using-git-worktrees
└ web-mcp: fetch

learn
├ claude-code: Explore (claude-code), WebFetch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ mattpocock-picks: domain-modeling, setup-matt-pocock-skills
├ pstack-picks: recall
├ superpowers: writing-skills
└ web-mcp: fetch

refactor
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: writing
├ graphify: graphify
├ mattpocock-picks: codebase-design, setup-matt-pocock-skills
├ ponytail: ponytail-review
├ pstack-picks: blast-radius, how, interrogate, principle-boundary-discipline, principle-redesign-from-first-principles, why
├ superpowers: executing-plans, finishing-a-development-branch, subagent-driven-development, systematic-debugging, using-git-worktrees, writing-plans
└ web-mcp: fetch

research-feature
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), WebFetch (claude-code), WebSearch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: writing
├ graphify: graphify
├ mattpocock-picks: grilling, setup-matt-pocock-skills
├ paper-lookup: paper-lookup
├ pstack-picks: how, why
└ web-mcp: fetch, search

review-code
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: writing
├ mattpocock-picks: grilling, improve-codebase-architecture
├ ponytail: ponytail-audit, ponytail-review
├ pstack-picks: blast-radius, interrogate, principle-boundary-discipline
├ security-audit: security-audit
├ superpowers: finishing-a-development-branch, systematic-debugging, test-driven-development, verification-before-completion
├ tob-picks: mutation-testing, property-based-testing, sharp-edges, spec-to-code-compliance
└ web-mcp: fetch

understand
├ claude-code: Explore (claude-code), WebFetch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ graphify: graphify
├ mattpocock-picks: domain-modeling, setup-matt-pocock-skills, teach
├ pstack-picks: how, why
└ web-mcp: fetch

upgrade
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ dead-skills: context7
├ flows: writing
├ graphify: graphify
├ mattpocock-picks: setup-matt-pocock-skills
├ pstack-picks: blast-radius, how, interrogate, why
├ superpowers: executing-plans, finishing-a-development-branch, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, writing-plans
└ web-mcp: fetch
```

<!-- uses:end -->

State lives in the repo: build flows in `docs/features/<slug>/flow.md`, audits in `docs/audits/`. The shared rules
are steps (`steps/*.toml`), which the build composes into each conductor that names them
([compose.ts](../../tools/harness-compiler/src/flows/compose.ts)), so every built SKILL.md carries all its rules.

Calls between conductors (`/fix` → `/review-code`) aren't listed. Each conductor still has a fallback for a
plugin that isn't there, for installs that skipped one.

Renamed in 2026-11: `/feature-flow` is `/build-feature`, `/research-flow` is `/research-feature` (it now researches
and builds nothing), `/fix-flow` is `/fix`, and `/review-code` replaces `/self-review`, `/verify`, `/test-audit`,
`/doc-audit` and `/harden`. Runs started under the old names resume under the new ones; research runs started before
the change don't.

## Writing

flows holds one standard for prose a person will read: a skill that states it, a check on every Markdown write, and a
copyedit that revises a document by it before a gate.

- **The `writing` skill** (`skills/writing/`) is Williams and Bizup's _Style: Lessons in Clarity and Grace_ in our own
  words, as checks to run on a draft from the top down: the problem and the point at the end of a short opening, the
  order the reader needs rather than the order the work happened in, topic strings and old-before-new, characters as
  subjects and actions as verbs, the book's six concision cuts limited by a density test, and naming who acted. A
  short section adds rules for technical documents that the book doesn't cover, such as no conversation shorthand.
  `references/` holds the full method of every lesson and both appendices, which Claude reads when a pass needs it.
  Unlike the conductors, Claude may load it on its own (`flows:writing`) whenever it writes a spec, a plan, a report,
  a README, a PR description or a commit message. `/review-code`'s docs lens reads changed docs against it, and its PR step
  revises the PR body by it.
- **The prose check** (`hooks/prose-check.mjs`, a `PostToolUse` hook on every `Write` and `Edit` of a `*.md` file)
  reports conversation shorthand (`Q4`, `D2`, `round 2`, `my call`) in the new text only: an Edit's new string, or the
  lines a Write added to the file, unless the file defines the label. It is Node code with no model call, so it costs no
  tokens. Claude sees its findings and may leave a sentence that a finding gets wrong. In `flow.md` files it is off,
  since flow.md is the log where those labels belong. `FLOWS_PROSE_CHECK=off` in the environment turns the check off.
- **The copyedit** (`skills/writing/references/copyedit.md`, `/flows:writing copyedit <file.md>`): a fresh agent
  revises a document by the skill for a reader who wasn't in the conversation, and the edit goes through only when
  code finds nothing lost that it can check. It refuses the edit when a heading or its order, a code block, a code span,
  a link target or link definition, a URL, an HTML comment, a number, a checkbox step, a table's shape or a quote is
  lost, when the edit has under 60% as many prose words as the original, when the editor wrote nothing, or when the
  document changed since it was saved. Code can't see meaning, so a dropped sentence or a flipped negation still needs
  the diff it shows. It commits nothing. Before a gate shows a spec, a plan, a research report or an audit report, the
  conductors run it on that document; when it refuses an edit, the gate shows the unedited document and what the edit
  lost.

## Packs

flows carries the skill packs its conductors run, in `packs/`: superpowers, ponytail, mattpocock-picks, pstack-picks,
tob-picks, paper-lookup and security-audit, each written there by its `tools/upstream-sync/src/adapters/*.ts`. The agent scans only a plugin's root
`skills/`, `agents/` and `hooks/hooks.json`, so nothing under `packs/` loads on its own; the conductors read a pack's
skills by path (`${PLUGIN_ROOT}/packs`). tob's spec checker is flows' own agent (`agents/spec-compliance-checker.md`),
since a pack's agents don't load. `/review-code` vendors one agent too, pr-review-toolkit's `pr-test-analyzer`
(`agents/`, written by `tools/upstream-sync/src/adapters/self-review.ts`). Where a conductor or a step overrides a
sentence of a pack, or pastes a section of one, a marker next to it quotes each sentence:
`<!-- overrides <pack>/<path inside the pack>: "<sentence>" -->`. The build strips the markers, and `npm test` fails
when the pack no longer holds the sentence, so an upstream change to an overridden or pasted rule is noticed at its
sync. To add a pack, follow [docs/vendor-a-pack.md](../../docs/vendor-a-pack.md).

## Install

Pick it in the installer (see the [main README](../../README.md)), which also installs its dependencies.

## Supported agents

The same conductors and flow-state documents work in every supported coding agent. Each distribution carries all pack
resources; only conductor skills are discovered automatically. A conductor runs only when called by name: the build
writes each host's form of that policy from the conductor's `disable-model-invocation: true`. The host-specific tool
mapping is written into each built conductor (`tools/harness-compiler/src/templates/hosts/`), and cross-package lookups are described in
`references/resource-index.md`.
If a session cannot launch subagents, the main session does the delegated work (searching, exploring) itself, and
independent checks (reviewers, source checks, the copyedit) are skipped and recorded as not checked. Keep approval gates.
tui-review is a separate optional tool for reading a diff.

Install instructions are generated with each distribution and listed in the repository README.

Author conductors here; `node scripts/flows-uses.mjs` regenerates dependencies, the tree and native packages.
`npm run build:harnesses` refreshes all outputs (gitignored; only the release branch commits them).
Independent checks skipped for want of subagents are never claimed successful.
