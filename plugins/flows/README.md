# flows

Conductor skills: each one runs the skills the rest of this marketplace ships, in order, and stops at approval gates.
Build and research flows keep a flow.md to resume from; /review-code keeps an audit file. /evaluate has no gate and ends
on one page. /tidy runs one read-only agent and has no gate: it applies what it can confirm, drops what fails its checks and asks only about what looks strange.
Claude proposes and recommends; you decide.

| Command                                          | Job                                                             | Runs                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ends in                                           |
| ------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `/understand <topic>`                            | learn a codebase, subsystem or concept                          | graphify, pstack `how` and `why`, mattpocock `teach` in learning style (you write the key lines)                                                                                                                                                                                                                                                                                                                                             | terms in GLOSSARY.md                              |
| `/build-feature <what>`                          | a new feature with a design                                     | prior art, `brainstorming`, `grilling` + `domain-modeling`, `writing-plans`, plan review, execute                                                                                                                                                                                                                                                                                                                                            | `/review-code`, `/learn`                          |
| `/research-feature <question>`                   | research a design question before building                      | frame, papers and engineering sources (web-mcp, paper-lookup), source check, a claim vote on what the options rest on, `grilling` on the options; no build, no benchmark                                                                                                                                                                                                                                                                     | a decision report, then `/build-feature`          |
| `/evaluate <url or name> [purpose]`              | is this tool useful here?                                       | identifies the tool, reads the project, prior art, source check; reads only, never runs the tool                                                                                                                                                                                                                                                                                                                                             | one page: adopt, try or skip                      |
| `/implement <ticket or plan>`                    | build a ticket or a given plan                                  | reads and checks the input, one gate to confirm it; a ticket in this session, a plan through superpowers execution; never plans, never changes a plan                                                                                                                                                                                                                                                                                        | `/review-code`, `/learn`                          |
| `/fix <symptom>`                                 | fix a bug                                                       | reproduce, `how` + `blast-radius`, upstream search, `systematic-debugging`, failing test first                                                                                                                                                                                                                                                                                                                                               | `/review-code`, `/learn`                          |
| `/upgrade <pkg>[@v] …`                           | bump one dependency, a list, or all outdated                    | changelogs via web-mcp and context7, `blast-radius`; patch and minor bumps as one task, majors through a plan; bump, fix test-first in batches                                                                                                                                                                                                                                                                                               | `/review-code`, `/learn`                          |
| `/refactor <what>`                               | restructure code without changing behaviour                     | `how` and the suite, shape and size the target, a plan, characterization tests where coverage is thin, the moves on a branch                                                                                                                                                                                                                                                                                                                 | `/review-code`, `/learn`                          |
| `/review-code [branch\|all\|pr <number>] [base]` | review a branch before merge, the whole repo, or a pull request | checks once, lenses picked from the diff (correctness: the host's `code-review` or ponytail; lean and spec; tests; docs; security; risk), one verifier, a one-screen report; `all` adds mutation testing, hardening and a full security scan on your yes; `pr` only reports                                                                                                                                                                  | merge, or a PR (`!` lines to push) and CI watched |
| `/learn [flow]`                                  | keep what the work taught                                       | no questions: the few lessons that matter, written to AGENTS.md/CLAUDE.md, `domain-modeling`, a `docs/solutions/` note or memory; ADRs, checks and skill fixes to the Parking lot                                                                                                                                                                                                                                                            | done                                              |
| `/flows:diagrams <file.md>`                      | check a spec or plan's pictures and show it as one page         | `check.mjs` parses each Mermaid diagram with Mermaid itself and checks file maps against the repo; `render.mjs` writes the text and pictures as one HTML page; every gate that shows a spec or plan runs both                                                                                                                                                                                                                                | a page, or its path                               |
| `/flows:tidy`                                    | recheck memory notes and flow folders                           | a read-only agent proposes; the main session checks each proposal and drops what fails. It edits memory notes and `flow.md`, writes findings under `docs/` and runs `git rm` on finished flow folders. It asks first about what looks strange: closing a flow, promoting a finding to `docs/`, `user` or `feedback` notes, a note's `name` or `description`, rules about behaviour, and new text without evidence from git or a tracked file | changes applied and reported, uncommitted         |

`branch` (the default) audits what changed against the base, plus the tests and docs that should have changed with
it; `all` audits the whole repo, vendored content skipped.

## What each conductor uses

Generated from each conductor's `uses:` line, its steps' and its host wording's by `node scripts/flows-uses.mjs`;
`npm test` fails when it is stale. The tree names what a conductor may run: a run can skip one, as /evaluate skips `why`.
Installing flows installs every plugin below except `claude-code`, which names the host's built-ins; the packs ship inside flows itself.

<!-- uses:start -->

```text
build-feature
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), WebSearch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: diagrams
├ graphify: graphify
├ mattpocock-picks: codebase-design, domain-modeling, grilling, setup-matt-pocock-skills
├ ponytail: ponytail-review
├ pstack-picks: architect, arena, blast-radius, how, interrogate, principle-boundary-discipline, principle-redesign-from-first-principles, why
├ superpowers: brainstorming, executing-plans, finishing-a-development-branch, subagent-driven-development, systematic-debugging, using-git-worktrees, writing-plans
└ web-mcp: fetch, search

evaluate
├ claude-code: Explore (claude-code), WebFetch (claude-code), WebSearch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ graphify: graphify
├ mattpocock-picks: setup-matt-pocock-skills
├ pstack-picks: how, why
└ web-mcp: fetch, search

fix
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), WebSearch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: diagrams
├ pstack-picks: blast-radius, how, interrogate, why
├ superpowers: finishing-a-development-branch, systematic-debugging, test-driven-development, using-git-worktrees
└ web-mcp: fetch, search

implement
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: diagrams
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
├ flows: diagrams
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
├ flows: diagrams
├ graphify: graphify
├ mattpocock-picks: grilling, setup-matt-pocock-skills
├ paper-lookup: paper-lookup
├ pstack-picks: how, why
└ web-mcp: fetch, search

review-code
├ claude-code: AskUserQuestion (claude-code), Explore (claude-code), Monitor (claude-code), WebFetch (claude-code), code-review (claude-code), security-review (claude-code)
├ claude-md-management@claude-plugins-official: claude-md-improver (claude-code)
├ claude-security@claude-plugins-official: claude-security (claude-code)
├ flows: diagrams
├ mattpocock-picks: grilling, improve-codebase-architecture
├ ponytail: ponytail-audit, ponytail-review
├ pstack-picks: blast-radius, interrogate, principle-boundary-discipline
├ security-audit: security-audit
├ superpowers: finishing-a-development-branch, systematic-debugging, test-driven-development, verification-before-completion
├ tob-picks: mutation-testing, property-based-testing, sharp-edges, spec-to-code-compliance
└ web-mcp: fetch

tidy

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
├ flows: diagrams
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

## Packs

flows carries the skill packs its conductors run, in `packs/`: superpowers, ponytail, mattpocock-picks, pstack-picks,
tob-picks, paper-lookup and security-audit, each written there by its `tools/upstream-sync/src/adapters/*.ts`. The agent loads components only from a plugin's root, such as
`skills/`, `agents/` and `hooks/hooks.json`, so nothing under `packs/` loads on its own; the conductors read a pack's
skills by path (`<flow-root>/packs`, written `<packs>`). tob's spec checker is flows' own agent (`agents/spec-compliance-checker.md`),
since a pack's agents don't load. `/review-code` vendors one agent too, pr-review-toolkit's `pr-test-analyzer`
(`agents/`, written by `tools/upstream-sync/src/adapters/self-review.ts`). Where a conductor or a step overrides a
sentence of a pack, or pastes a section of one, a marker next to it quotes each sentence:
`<!-- overrides <pack>/<path inside the pack>: "<sentence>" -->`. The build strips the markers, and `npm test` fails
when the pack no longer holds the sentence, so an upstream change to an overridden or pasted rule is noticed at its
sync. To add a pack, follow [docs/vendor-a-pack.md](../../docs/vendor-a-pack.md).

## Install

Pick it in the installer (see the [main README](../../README.md)), which also installs its dependencies.

## Supported agents

The same conductors and flow-state documents work in every supported coding agent, except `/tidy`, which needs Claude Code's memory folder and a tool-limited subagent and stops elsewhere. Each distribution carries all pack
resources; only conductor skills are discovered automatically. A conductor runs only when called by name: the build
writes each host's form of that policy from the conductor's `disable-model-invocation: true`. The host-specific tool
mapping is written into each built conductor (`tools/harness-compiler/src/templates/hosts/`), and cross-package lookups are described in
`references/resource-index.md`.
If a session cannot launch subagents, the main session does the delegated work (searching, exploring) itself, and
independent checks (reviewers, source checks) are skipped and recorded as not checked. Keep approval gates.

Install instructions are generated with each distribution and listed in the repository README.

Author conductors here; `node scripts/flows-uses.mjs` regenerates dependencies, the tree and native packages.
`npm run build:harnesses` refreshes all outputs (gitignored; only the release branch commits them).
Independent checks skipped for want of subagents are never claimed successful.
