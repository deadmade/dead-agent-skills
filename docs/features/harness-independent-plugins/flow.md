---
flow: feature
phase: verify
---

# Harness-independent plugins: flow

## Request

> Hey, could we start a feature-flow? I would like to properly support two harnesses claude-code and codex. My thinking was to have a kind of abstraction for all the hooks etc that are currently only working for claude code and also to have the plugins not harness specific

## Phases

- [x] Ground
- [x] Brainstorm
- [x] Grill and spec approval
- [x] Plan
- [x] Evaluate and plan approval
- [x] Execute
- [ ] Verify and learn

## Artifacts

- Spec: [spec.md](spec.md) (approved at Gate 1)
- Plan: [plan.md](plan.md) (revised and reviewed; ready for Gate 2)
- ADRs: pending
- Glossary: ../../../GLOSSARY.md
- Existing solution evaluation: [evaluation.md](evaluation.md)
- Builder check: complete; scope of control hooks and existing-rule migration require user decisions, captured in spec.
- Plan review: [plan-review.md](plan-review.md)

## Gates

- Gate 1, spec approved: 2026-10-31, user: "I approve :)"; spec.md as presented after grilling.
- Gate 2, plan approved: 2026-10-31, user: "sdd pls go!"; execution: subagent-driven.

## Skipped

Cross-model diversity for plan review: pstack's fable/opus/sonnet identifiers are not available in this session. Three independent native reviewers still cover Correctness, Fit and Simpler using the inherited model. No model preference or session settings were changed.

## Grounding

- Starting tree has substantial uncommitted multi-harness work. Preserve it; this run builds on its current state rather than assuming it is absent.
- `installer/core/agents.ts` declares Claude Code and Codex plus a portable subset of plugins.
- `installer/system/portable.ts` generates Codex packages from Claude plugin resources, rewrites instruction text, and substitutes a project-rules skill for the default plugin's startup injection.
- `plugins/default/hooks/hooks.json` currently binds rules injection and notifications to Claude events and registers its Night City mod.
- `plugins/flows/references/hosts/codex.md` maps flow execution to native host capabilities.
- Detailed codebase grounding dispatched to an agent; findings pending.
- Grounding returned: the existing adapter is metadata only; portable packaging reads Claude manifests and explicitly excludes hooks. Shared notification logic already has a useful input boundary in `plugins/default/hooks/lib.mjs`. Terminal mods import the Claude engine directly and require a separate UI capability.

## Clarified intent

- Switching harnesses means a fresh conversation with the same plugins, rules, and resumable flow state; conversation migration is out of scope.
- The cockpit under development may replace md-pane and tui-review. Do not assume these need equivalent native terminal integrations in Codex or remove them in this feature without a decision.
- Preserving the Night City theme in both terminal CLIs is an explicit user requirement (confirmed 2026-10-31); matching the palette on supported surfaces is accepted.
- Both targets are terminal CLIs only. User accepts harness-specific plugin extensions and proposes shared API/adapters while hooks remain owned by their plugins. Maintainability is a major concern; user asks whether an existing solution can be reused before selecting an approach.
- Night City acceptance confirmed: palette matching across supported surfaces is enough; Claude-only spinner wording and UI effects need not be reproduced in Codex.

## Prior art

Background research dispatched; findings pending.

- Research returned: candidate boundaries are a neutral plugin catalog with native package adapters, plus normalization at shared runtime hook entry points. Avoid host detection scattered through feature logic.
- Official docs fetched by researcher: https://code.claude.com/docs/en/plugins-reference and https://code.claude.com/docs/en/hooks ; https://developers.openai.com/plugins/build/plugins and https://learn.chatgpt.com/docs/hooks . Research reports Codex hook support, with installation/channel constraints requiring verification against the intended harness versions. Actual hook execution has not been checked.
- Main session fetched AgentPlugins architecture (https://raw.githubusercontent.com/sigilco/agentplugins/main/ARCHITECTURE.md): shared contract/compiler, target adapters, capability warnings, and native distributions; closest candidate for reuse, not yet validated against our hooks or theme needs.
- Main session fetched Mentu Policy Harness README (https://raw.githubusercontent.com/mentu-ai/mentu-hooks/main/README.md) and wshobson harness guide (https://raw.githubusercontent.com/wshobson/agents/main/docs/harnesses.md): respectively policy-focused runtime normalization and shared-source generated harness artifacts.

## Options

Existing-solution evaluation authorized and completed: see [evaluation.md](evaluation.md).

### Chosen architecture

User selected the build-and-commit approach on 2026-10-31 ("lets lock thjat it"):

- Author harness-neutral plugin definitions and shared handlers once; plugins own their behavior and hook declarations.
- Generate harness-specific native package folders before committing, and check those outputs into the repository. Both marketplaces remain directly usable from a fresh clone.
- Package small harness adapter modules alongside shared handlers to normalize live event inputs and encode native responses. Generate registrations at build time; process actual event payloads at runtime.
- Keep adapter logic in ordinary source modules copied/packaged by the build rather than large generated code strings.
- Explicit native extensions cover capabilities with no shared equivalent; report unsupported capabilities honestly.
- Use one Night City palette with target-specific outputs; supported surfaces should match, without requiring Claude-only UI effects in Codex.
- Generate during development or before committing; commit checks and CI verify outputs are current, rather than silently rewriting staged content.
- Initially target Claude Code and Codex terminal CLIs. Additional harnesses should require new adapters rather than editing shared plugin behavior.

Rejected alternatives: manually maintain every plugin's native hook definitions (repetitive as harness count grows); adopt an external universal framework now (evaluated compatibility and maintenance costs); runtime-only definition interpretation (unnecessary parsing and installation complexity).

This approves the architectural direction only. No spec or plan approval is implied; both gates remain pending. Exact source/distribution paths and capability contract are still to be designed.

### Grilling decisions accepted

2026-10-31: User accepted all three recommendations ("I accapt"): migrate the existing shared catalog, startup rules, notifications and Night City; retain Claude-only extensions and defer general control hooks; fail on unsupported required capabilities and diagnose/omit explicitly optional ones; preserve managed global rules until hooks are trusted and verified, then offer removal of only our block. Folded into spec.md. Design frontier empty; Gate 1 document approval pending.

## Plan review

Round 1 complete: Correctness, Fit, Simpler. Six findings retained (two blocking, three should-fix, one consider), no dismissed findings; see plan-review.md for evidence/options. User approved all six recommended fixes on 2026-10-31 ("I approve"). All applied to plan.md, including atomic catalog cutover and removal of obsolete internal wrappers. Focused round 2 complete: all three reviewers returned no remaining findings. No implementation started. Self-review maps all spec goals and five failure classes to seven tasks. Proposed paths preserve portable/plugins for Codex and add portable/claude-code/plugins for Claude; source native manifests remain explicit development overlays. Gate 2 final plan approval and execution method remain pending.

## Tasks

Task 1: base f3dab0bad064c0b469b02e263cc933a7bb68a4e4; files clean against approved list (18 product files plus coordinator bookkeeping), complete without commits. Focused tests/typecheck/generated-output checks passed; packaged subprocess fixture needed sandbox escalation. Independent spec and quality review approved after one test-only follow-up. Baseline/task preimages and reports preserved under .superpowers/sdd/plan-harness-independent-plugins/.

Task 2: base f3dab0bad064c0b469b02e263cc933a7bb68a4e4; files clean against approved list (including approved common.mjs). Complete without commits; independent spec/quality review approved after fix round 1. Focused checks: 26 passed, 1 Windows-only skip. Real Codex SessionStart capture; other live lifecycle captures, Codex headless signal and Windows launch remain unverified. Missing-node native harness launch check belongs Task 3; rules dispatch belongs Task 4.

Task 3: base f3dab0bad064c0b469b02e263cc933a7bb68a4e4; task-3-before.json/zip and task-3-untracked.txt preserve task-start state. Implementing both native distributions.

2026-11-01 resume: Task 3 implementation and independent spec/quality review were already complete in the SDD ledger. Approved with minor import-closure/checklist follow-ups; native trust, missing-Node and Windows checks remain pending. Task 4 resumed from a fresh snapshot, preserving all existing work.

## Rulings

- 2026-10-31: Use slug `harness-independent-plugins`; existing dirty files are pre-existing work and remain preserved.
- 2026-10-31, setup: Use the authorized current checkout on feat/harness-independent-plugins, preserving the full dirty baseline. No commits/pushes. Initial sandbox baseline suite failed loading the Nix OpenSSL certificate store; approved outside-sandbox rerun passed. Typecheck passed.
- 2026-10-31, Task 2: Fixed dispatch includes notifications now; Task 4 adds rules behavior in its already-listed rules.mjs/run.mjs files. Test encodeContext independently in Task 2. This resolves task ordering without inventing a callable rules export or editing an unlisted file; cost if wrong is handler wiring rework in Task 4.

## Deviations

2026-10-31, Task 1: atomic catalog cutover needs scripts/build-codex.mjs and scripts/check-codex.mjs, current codexMarketplace callers omitted from Task 1's Files. User approved the recommended correction ("I approve"): include both in Task 1 and use `codexMarketplace(source: string, prefix = './portable/plugins')`, passing the checkout root explicitly from both callers/tests. Plan and task brief updated; implementation resumed. No scope/spec change or implicit-root fallback.

2026-10-31, Task 2 review: both adapters duplicate validation/normalization/context encoding, and malformed question entries such as questions:[42] or [null] pass through. Validation regression fixed in existing files (25 passed/1 Windows skip). User approved ("sure") adding runtime/common.mjs with internal shared validation/normalization/encoding helpers while native matching/interactivity stay in target adapters. Plan/brief updated; consolidation resumed. No new native capability or feature behavior.

2026-10-31, Task 3 preflight: user approved ("I approve") nativeMarketplace(source: string,target: AgentId,prefix: string), explicit supplied catalog/version context, and adding scripts/check-repo.mjs plus catalog/plugins.json to Task 3 Files. Checks separate authored ownership from generated paths; overlays preserve existing tui-review/md-pane types and graphify Claude hooks. Tests fit already-listed package tests. Plan/brief updated; implementation resumed. Existing agreed output layout and spec unchanged.

## Walkthrough

| spec goal | plan task | file:line | test |
| --------- | --------- | --------- | ---- |

## Run verdict

Pending.

2026-11-01, Task 4 sequencing ruling: Task4 implements pure migration decisions and runtime receipts; Task6 implements the explicitly listed mocked-confirmation installer tests and OS reread/symlink/source guards. Integration checks remain pending Task6.

2026-11-01, Task 4: Ruling: source, managedBlockPresent and cleanupEligible are private receipt state fields implementing the approved actual-transition-state requirement; specified version/hash fields and public functions remain unchanged. Malformed/edited blocks preserve user bytes, diagnose, inject packaged context and withhold cleanup as required. Cost if wrong: private receipt format rework before installer integration.

Task 4: complete (no commits; independent spec/quality approved). Minor generated policy repeats AGENTS.md and needs plural grammar correction; deferred to final review fix wave per SDD minor-finding rule, not discarded. All Task6 installer guards and native/Windows trust observations remain pending.
Task 5: base f3dab0bad064c0b469b02e263cc933a7bb68a4e4; snapshot saved; implementing Night City palette/native outputs.

2026-11-01, Task5 deviation pending: source Claude theme generation/freshness are required but build-harnesses.mjs/check-codex.mjs are omitted from Task5 Files. Adding both scripts is recommended: builder writes renderer output, checker compares the source theme. Putting source mutations in buildPackages would break its temporary-output/read-only contract. Alternative: defer this requirement, leaving Task5 incomplete. User approval requested; dependent build paused.

2026-11-01 Task5 deviation approved by user: add build-harnesses.mjs and check-codex.mjs for required source theme generation/freshness. Plan and brief updated; resume implementation.

Task5: complete implementation (no commits; independent spec/quality approved). Minor: preservation test expected artifact is regenerated; new code formatting follow-up. Both deferred to final review triage. Native picker/visual checklist and Windows acceptance remain pending. Task6: base f3dab0bad064c0b469b02e263cc933a7bb68a4e4; snapshot saved; installer integration starting.

Task6: fix round1/5 addressed 1 Important concurrent theme publication overwrite with exclusive hard-link publish; 24 covering checks/typecheck pass and scoped re-review approved. Task6: complete (no commits; independent spec/quality approved). Task7: base f3dab0bad064c0b469b02e263cc933a7bb68a4e4; snapshot saved; readiness/release/sync/documentation integration starting.

## Task 7 validation and acceptance map (2026-11-01)

Implementation and required repository checks complete; native interactive/Windows acceptance is **pending**.
This record does not mark Execute/Verify/Learn complete. The coordinating session owns review and final gates.

| Spec goal / acceptance criterion                                                   | Tasks   | Source / integration                                                                                         | Evidence and remaining limits                                                                                                                               |
| ---------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Author shared catalog, resources, identities and dependencies once                 | 1, 3, 7 | `catalog/plugins.json`, `installer/core/catalog.ts`, `installer/system/catalog.ts`, `scripts/flows-uses.mjs` | catalog/agents/package tests and flows-uses tests; authored overlays remain versioned                                                                       |
| Generate native declarations and package live adapters                             | 2, 3, 7 | `installer/core/package-adapters.ts`, `installer/system/packages.ts`, `plugins/default/hooks/runtime/`       | adapter/package/runtime tests; packaged relative import checks and startup subprocess execution                                                             |
| Both marketplaces usable without installer/build                                   | 3, 7    | root marketplaces, `portable/plugins/`, `portable/claude-code/plugins/`, `scripts/codex-smoke.test.mjs`      | isolated Codex installs all selected packages; isolated Claude installs/lists/removes md-pane using distribution-only checkout                              |
| Rules/notifications registration → decode → shared behavior → native output        | 2, 4, 7 | shared.json, runtime/run.mjs, hooks/lib.mjs, hooks/rules.mjs                                                 | representative packaged runtime subprocess tests pass; trusted authenticated native lifecycle execution remains unverified                                  |
| Native shapes have provenance beyond generated string checks                       | 2, 3, 7 | hooks/fixtures/, package-adapters tests, runtime tests, harness-packages tests                               | fixtures pin Claude 2.1.314/Codex 0.166.0; only Codex SessionStart is a live capture; other events explicitly documented/synthetic                          |
| Shared rules load once; managed-block migration preserves user ownership           | 4, 6    | hooks/rules.mjs, core/rules-migration.ts, system/harness-setup.ts, steps/codex.ts                            | rules, migration and installer tests cover fresh/existing/edited/override/receipt/version/source/concurrent changes; cleanup requires explicit verification |
| Notification focus, continuation, subagents and supported waiting signals          | 2       | hooks/lib.mjs, runtime/claude-code.mjs, runtime/codex.mjs                                                    | runtime/lib tests cover normalization, main/child completion, continuation, malformed input, focus and OS policy; live waiting emissions pending            |
| One Night City palette, native formats and explicit native-only effects            | 5, 6, 7 | themes/palette.json, core/themes.ts, setup-night-city skill, harness-setup.ts                                | renderer/package/install tests, source dead-skills mod tests pass; native theme picker/visual checklist remains open on both CLIs and Windows               |
| Explicit Claude-only md-pane/tui-review/LSP/native dependencies; no parity fiction | 1, 3, 7 | catalog target overlays, package emitters, README/AGENTS                                                     | selection/overlay isolation tests, native generated-root validation and Claude md-pane installation pass; cockpit decisions unchanged                       |
| Stale/extra/missing generated files, deterministic fresh clone/release/sync/pack   | 3, 7    | check-harnesses.mjs, harness-packages.test.mjs, codex-marketplace.test.mjs, release/sync/CI configs          | CRLF source-only rebuilds, repeat identity, target-only files, root source resolution, tarball catalog selection, release/flow/sync ordering tests pass     |
| No third harness, transcript prerequisite or conversation migration                | 1–7     | catalog targets, runtime fixed dispatch, host flow references                                                | two-target selection/runtime tests; switching starts a new conversation with shared resumable documents                                                     |

Actual Linux checks (Node 26.12.0, Claude Code 2.1.316, Codex 0.166.0):

- `npm run build:harnesses`: passed, regenerated both distributions/catalogs and source Claude theme. Explicit escalation required for sandbox-mounted `.agents` publication.
- `npm run check:harnesses`: passed after final formatting/regeneration. Compatibility checker delegates to exactly the same function.
- `npm test`: passed: installer **186 passed, 3 Windows skips**, **87.64% line coverage** (floor stays 79); scripts/shared hooks **94 passed, 1 Windows skip**. Log: `/tmp/task7-npm-test.log`. Existing OpenSSL-store/NO_COLOR diagnostic output did not fail tests.
- `npm run typecheck`: passed.
- `npm pack --dry-run`: passed, including prepack combined freshness and TypeScript compilation; **1,675 files**, 2.8 MB packed / 11.0 MB unpacked. Log: `/tmp/task7-pack.log`. Neutral `catalog/plugins.json`, both native distributions and catalogs included.
- Final focused tests after formatting and adding Claude smoke: **34 passed, 0 skipped/failed**, covering harness-packages, codex-marketplace, codex-smoke, sync-lib and flows-uses. Log: `/tmp/task7-focused-final.log`. Full suite was not repeated after this covered test-only addition/formatting.
- `claude plugin test .` in `plugins/default`: **17 passed**. In `plugins/opt-in/md-pane`: **40 passed**.
- Isolated native marketplaces: Codex discovery/install/reinstall/MCP/remove test and Claude distribution-only marketplace/md-pane install/list/uninstall both passed. Temporary profiles were removed; no credentials or user config copied.
- Shared hook/theme integration is covered by the full runtime/rules/package/renderer/installer suites above. Native interactive trust, native lifecycle waiting/continuation events, actual harness missing-Node diagnostics and theme visuals are not established by those tests.

Readiness gaps retained from Tasks 2–6: no authenticated native run; Codex isolated picker reaches onboarding; no Windows
host or user-supplied Windows visual observation. No native trust file was synthesized and no approval bypass was
introduced. Minimum supported CLI versions remain unclaimed until integration checks establish them. Existing fixture
provenance remains pinned rather than silently upgraded to the newly installed Claude version.

Final review note: `buildPackages` returns optional capability diagnostics, but the build CLI currently prints only its
success line rather than the returned diagnostics. The builder is outside Task 7's allowed source files; assess this
visibility gap in whole-branch review. Existing minor findings from Tasks 3–5 remain deferred to that review as agreed.

## 2026-11-01 implementation continuation

Tasks4–7 implemented and independently reviewed. Final review found two Important build contracts (visible optional diagnostics and rejecting conflicting overlay names before mutation), and four Minor policy/coverage/formatting issues; all six addressed in one fix wave, scoped rereview pending.

Latest unchanged-code automated evidence: build:harnesses/check:harnesses/typecheck/npm test/npm pack --dry-run/formatter pass. Installer188 passed,3 Windows skips,line coverage87.85%; scripts/hooks96 passed,1 Windows skip. Earlier source mod checks: default17 passed,md-pane40 passed. Isolated native marketplace smokes for Claude and Codex passed. Full evidence: `.superpowers/sdd/plan-harness-independent-plugins/final-fix-report.md`. No commits or pushes.

Still required before readiness: authenticated native hook/trust and lifecycle observations, missing-Node native interpretation, native theme picker/visual acceptance and Windows observations. Isolated Codex theme profile stopped at sign-in; no native success inferred from packaged subprocess tests. Flow remains active; no final readiness or run verdict claimed. Low docs finding left for user triage: Azure description mentions Claude-only /plugin configure in Codex manifest (`docs/audits/2026-11-01-doc-audit-branch.md`).

Final scoped review approved all six fixes; no residual implementation blocker. Implementation phase complete; resumed phase is verify, with native acceptance requirements still open.

### Dev integration, 2026-11-01

The user requested merging `dev` into the migration branch and removing unused files and folders. Checkpoint
`b384bf6` preserves the previously uncommitted migration. The merge includes `dev` at `a1d2f85`, keeps its typed
upstream-sync workspace, consolidated workflows, flow cockpit, writing tools and ado-mcp integration, and retains
the migration's authored catalog and checked-in native distributions.

Upstream sync now rebuilds native packages before validation and includes owned generated outputs in preview and
PR paths. The new Claude-only plugins remain available in the Claude marketplace. The writing comparison script's
shared prose module ships on both hosts. Codex uses the ado-mcp release binary and its `ADO_*` environment variables;
the old Azure Node launcher and replaced sync scripts/workflows are removed. Both native distributions were regenerated.

Validation: the full npm suite passed (228 installer, 184 script/hook and 54 upstream-sync tests; four Windows-only
skips), both TypeScript checks passed, default and md-pane native mod tests passed (17 and 40), and web-mcp's two
configuration tests passed. A focused Codex regression also covers downloading ado-mcp when it is absent from PATH.
The installer package dry run contains 1,878 files, includes the neutral catalog and excludes the retired launcher
and compiled tests. Existing native trust/authentication, theme visual and Windows acceptance gaps remain open.

The old `.web/` research cache was moved outside the checkout to
`/tmp/dead-agent-skills-cleanup-heukllih/web-research-cache` for recovery. Active/locked worktrees and `.superpowers/`
recovery records were preserved. No remote branches were pushed.
