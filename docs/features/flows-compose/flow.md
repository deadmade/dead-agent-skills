---
flow: feature
phase: execute
now: Task 19 (check every finding against the built text) dispatched; base 91480ed.
---

# Flows compose: flow

## Request

Hey, so since we had relativly things now where stuff wasnt correct always or one step had it and another didnt, I
want to revamp the plugin flows as a whole in this session and in this pr! First of all lets stop writing Markdown
and switch to a format we can essentialy combine when building the skills at the end for each agent! Every flow then
essentialy combines the different steps layed out in it! Second we need to evaluate all the flows independently and
what they do and also if how they are currently structured is proper, if we are missing stuff etc!

## Artifacts

- Prior art: [prior-art.md](prior-art.md)
- Designs: [designs.md](designs.md)
- Flow evaluation: [evaluation.md](evaluation.md)
- Spec: [spec.md](spec.md) (approved; plan review round 1 edited §2, §3, §4, §5)
- Plan: [plan.md](plan.md)
- ADRs: [0009 conductors composed from flow steps](../../adr/0009-conductors-composed-from-flow-steps.md)
- Glossary: GLOSSARY.md **Flows** (Conductor, Flow step, Host token)

## Gates

- Gate 1, spec approved: 2026-11-04 (copyedited; "I approve", the user). Reopened 2026-11-04: plan review round 1 changed §2 (drawn phase table as a decision, one-word phase names), §3 (path placeholders are not tokens), §4 (check() fails on check problems; warnings until flow-rules goes; the sync-PR sentence was wrong) and §5 (uses from composeFlows, audit template, scan scope); approved with "pls fix all the issus!", the user, 2026-11-04 Reopened 2026-11-04: the user asked for structured steps after Task 5; steps became TOML (spec §1, §4, §5, Constraints, Non-goals; ADR 0009 amendment). Re-approved 2026-11-04 ("Approve both", the user).
- Gate 2, plan approved: 2026-11-04, execution: subagent-driven (copyedited; "I approve sdd pls", the user) Reopened 2026-11-04: Task 20 (steps in TOML) added, Tasks 6-8 write .toml. Re-approved 2026-11-04 ("Approve both", the user).

## Skipped

## Grounding

**Build today.** The compiler (`tools/harness-compiler/src/emit/build.ts:56-91`) copies each skill folder as opaque
files, runs string replacements (`transforms/text.ts`, `rules.ts`; per-file line edits only target vendored files),
and writes the host adapter as a separate `references/host.md` (`targets/claude-code.ts:100`, `codex.ts:68`). It
never parses skill frontmatter, and `<flow-root>`, `<skill-dir>`, `<packs>` stay literal prose (`flow-rules.md:19-22`).
Generated conductor SKILL.md files are byte-identical to the sources. No include, partial or template mechanism
exists anywhere; no YAML/TOML/Markdown library is a dependency (root: `@types/node`, `jsdom`, `typescript`).

**Checks on the Markdown shape.** `scripts/flows-uses.mjs`: each `uses.json` name must appear literally in its
SKILL.md (`:84,113`); override markers must quote live pack text (`:123-149`); templates and three SKILL.md files
must keep `phase:`/`now:`, gate lines, `Picked:`, `Status:`, `**Does:**`/`**Depends on:**` (`:153-189`); pack paths
exist (`:194-209`); it regenerates dependencies and the README tree. flow-cockpit parses each SKILL.md phase table
(`phases.rs:130-182`) and the templates' fenced bodies and headings (`tests/docs.rs:323-385`). writing's tests pin
lines in flow-rules (`writing-skill.test.mjs:41-43`). The prose hook runs on every `*.md` write.

**Repeats across conductors** (each a drift risk): the "flow-rules applies" line (8 conductors), start/resume in a
long form (build-feature, research) and a short form (fix, implement, upgrade), the Deviations import (4), the SDD
Rulings copy (2), the execute stop (2), ponytail pastes (3), `Does:`/`Depends on:` (3), gate wording (3 + 2), Finish
(4), the seam skills (2), domain docs (3), `how` grounding (4), "Reviewers are independent" (2).

**Constraints.** `plugins/` stays agent-neutral (AGENTS.md:322); harness prose lives in compiler `templates/`
(:329-333); outputs are committed and must work from a fresh clone (:336-348); vendored packs are never edited
(:224-229). AGENTS.md:63-66 ("rules live once in flow-rules.md") changes with this feature.

**Flow evaluation.** Three independent reviewers; raw reports in `eval-raw/` (about 70 findings). Verified by the
`verify-flow-evaluation` workflow (one skeptic per slice, plus a completeness critic): 76 claims, 42 confirmed, 32
partly, 2 refuted; the critic added 19. 93 live findings (3 high, 34 medium, 56 low) in
[evaluation.md](evaluation.md); 37 are removed by composition by construction, 56 need a design or text change.
Highs: /learn runs after the branch is finished (#1); the copyedit's script path is broken on Codex (and on Claude
Code when the variable isn't set), so every copyedit reports "refused" (critic); build flows hand /review-code the
spec, never the plan, so the Adds/Size and Test-seams checks never run at review (critic).

### The set of flows

The user, 2026-11-04: bumping many dependencies is done with /upgrade today; refactors happen sometimes; the rest
(spike, migration, release, incident, onboarding) not now, though a big framework migration (xUnit v2 → v4) and a
new repo to build something in would be handy later.

Picked (the user's "lgtm" to my proposals, 2026-11-04):

- /upgrade takes one package, a list or "everything outdated"; groups patch/minor bumps, one changelog and break map
  per major; a big framework migration (xUnit v2 → v4) plans its fixes in batches (per project or folder, each
  green). No separate migration flow.
- New /refactor for both sizes: Ground (read the code, run the suite, note thin coverage) → Shape (target shape and
  size; local: short plan, Gate; restructuring: options with seams, plan, plan review, Gate) → Build (characterization
  tests first where thin, then the moves) → Finish. Rule throughout: behaviour doesn't change; existing tests pass
  unchanged (moved or renamed only); anything else goes to the Parking lot.
- Spike, release, incident, onboarding: not now; cheap to add later from the shared steps.

### Scope of the evaluation fixes

Picked: fix all 93 verified findings in this PR ("fix all of it!", the user, 2026-11-04). Rejected: highs and mediums
only with lows as follow-ups; composition first with the findings in a second PR.

### How composition is built

Picked: A, plain-Markdown steps and one include line, with the judges' grafts (the user, 2026-11-04). Steps in
`plugins/flows/steps/<name>.md`, copied verbatim; flows stay `skills/<flow>/SKILL.md` with their own prose, real
`## Phase` headings and `[step: name]` lines; a compose pass in the harness compiler. Grafts: per-host tokens resolved
in every flows file (references included, never packs); build checks (rules before the compaction cut, a step's
written sections exist in the template, script paths resolve per harness, uses computed from built text); Codex
`agents/openai.yaml` for conductors. Rejected: B agent-first (Always/Do split, ~800 compiler lines, trace command);
C checks-first (`[phase:]` lines, `kinds.json`, closer to structure as data). Designs and scores:
[designs.md](designs.md); both judges started from A.

### /implement with a run slug or a plan

Picked (the user, 2026-11-04, "a and a"): given a build-feature run's slug, /implement continues inside that run from
Execute, same flow.md, `flow:` stays `feature` (rejected: a new run linking the plan; refusing). Given a plan, it
never changes it: a missing field or a requested change stops and sends the user to /build-feature (rejected: small
fixes at its gate). Builder check's other questions were mine to settle (uses per host from the token maps, the uses
check per target, reverse matching on pack paths only); marked "my call" in the spec.

### Brainstorm so far

- The flow cockpit is not a design constraint for this run ("lets not worry about the cockpit for now", the user,
  2026-11-04). Its CI tests still parse SKILL.md phase tables and template headings; keep whatever passes them for
  free, change or drop the rest without designing for it.

- Composition, not structure as data: a flow is prose plus `[step: …]` lines; the build draws the phase table from
  that order and checks a few rules (my call; the user wasn't sure structure-as-data helps).
- Inline every rule an agent follows; reference files only for what it looks up (templates, subagent briefs, the
  deep `all` methods), so compaction's first-5,000-token cut keeps the rules (my proposal; not yet confirmed).

## Prior art

[prior-art.md](prior-art.md); source check: 44 confirmed, 3 not supported (corrected), 0 couldn't open. No project builds multi-phase workflow skills from a shared step
library. Nearest: ruler (concatenates Markdown fragments with `<!-- Source: -->` markers), rulesync (per-tool
frontmatter, bodies copied), spec-kit presets (layers that replace, prepend, append or wrap a base command via
`{CORE_TEMPLATE}`), POML (`<include>`, loops, conditions; renders through an SDK). Targets: the Agent Skills spec
(SKILL.md under 500 lines / 5,000 tokens), Claude Code keeps only a skill's first 5,000 tokens after compaction,
Codex gives the skill list 2% of context.

## Options

### Self-contained built skills

Picked: each built skill carries the full text of every shared step it uses; an agent reads one file per flow, and
`flow-rules.md` goes away as a file agents read (the user, 2026-11-04). Rejected: a small shared rules file the
skills point to.

### Shared steps

Picked: a shared step reads the same in every flow; a flow writes its own text around the steps it uses ("The steps
should be the same", the user, 2026-11-04). Rejected: free-text slots inside steps; per-step parameters (C) are not
needed for now, since the case that motivated them (/implement planning from a ticket) goes away.

### /implement's job

Picked: /implement doesn't plan. It implements what it is given as given: a ticket as the ticket rules, or an
approved plan from a flow. When the input is too thin to implement, it stops. Planning is /build-feature's (the user,
2026-11-04). The bar for a ticket (the user's yes to my proposal): it says what behaviour changes, how you'd know it's
done (acceptance criteria), and it leaves no open design decision (approach, where it lives, a new interface). A gap →
stop, name it, point to /build-feature.

### Grill

Round 1 (three grillers, facts checked against the repo, 2026-11-04): 20 decisions settled from the code or earlier
picks and folded into the spec (worktree and decide steps, a repeatable gate, pack drift as diagnostics, `<flow-root>`
paths, `template:` frontmatter, the cockpit data task, and the per-flow details). Four were the user's; picked all
four recommendations ("I accept all", the user, 2026-11-04):

- /implement given a plan with a gap names each gap; the user fixes the plan and re-runs. /build-feature only for a
  ticket gap or to reopen the design. Rejected: /build-feature learns a plan input; a normal run with the plan linked.
- /implement on a ticket: one task built by the main session the way /fix builds; no plan.md, no executor. Rejected:
  a one-task plan.md through an executor; every ticket to /build-feature.
- /refactor: tests change only where the refactored name or path appears; changed assertions are deviations.
  Rejected: only whole test files may move.
- /upgrade: every upgrade gets a worktree and a Gate; patch/minor-only in one area is one task built like /fix;
  majors and multi-area take the full path. Rejected: full path for everything; today's inline path plus a guard.

## Plan review

### Plan review round 1 (2026-11-04)

Three reviewers (correctness on opus, fit on fable with pstack blast-radius, simpler on sonnet with ponytail-review)
raised 32 findings; merged to 22 (1 blocking, 10 should-fix, 11 consider); 3 downgraded in the merge, none blocking,
so no ruling was needed. The user accepted every recommendation ("pls fix all the issus!", 2026-11-04):

1. blocking: the built-text checks failed nothing (`check()` ignored buildTree's result) and the uses check was
   dropped. → `check()` returns check problems; build throws only on compose errors; spec's sync-PR sentence fixed.
2. Checks would fail commits 2-17 on today's text. → warnings until Task 18, then failures.
3. Tests broken in tasks that didn't list them. → writing-skill.test in Task 3; flows-uses.test in Tasks 6, 7, 18;
   each checkTemplates string named.
4. review-code had no template with decide's sections. → audit-template.md in Task 4.
5. Multi-word phase headings broke cockpit keys. → one-word names, compose rejects longer ones; keys never change
   (except /implement plan → confirm; no implement run exists).
6. Adapter uses lacked the marketplace suffix and claude-md-improver. → exact uses; adapter text names it.
7. Override markers were never stripped. → compose strips them (Task 1).
8. copyedit.md:24 named subagent_type and opus. → neutral wording in Task 17.
9. Check 7 lost checkUses' existence checks. → folded in.
10. `<skill-dir>` in a shared step. → a check 1 error; stale Loading-skills bullet dropped.
11. /refactor's flow: line in build-template. → Task 13.
    12-22 (consider): Stage 2 wording fixed and copy/fix split into two commits; size measured in Task 5; one template
    section list; bucket last; CLAUDE_SKILL_DIR rewrite kept for packs; drawn phase table stated as a decision with the
    CI filter; skill-dir/flow-root tokens, Composed.template, the flowUses alias and the single-use warning dropped
    (check 5 kept); fixtures built in code; Codex openai.yaml kept and named in the PR description as a Codex
    behaviour change; one CLAUDE_ONLY list; scan-skills limited to plugins/ plus .claude-plugin/flows/skills/.

Changed: plan.md rewritten (19 tasks, ~3970 lines, glance clean); spec.md §2, §3, §4, §5 and goal 4.

### Plan review round 1, fix check and fresh eyes (2026-11-04)

Fix check (fresh opus agent, the 11 blocking and should-fix edits): 6 PASS, 5 FAIL (late warnings in files no task
owned; Task 7's fixture; the audit template lacked Tasks and Parking lot; writing/SKILL.md:239; `<skill-dir>` defined
in a step that check 1 forbids it in). Fresh eyes (opus, fable; no revision history): no blocking finding. Merged
with the FAILs: 10 should-fix, 9 consider. The user accepted every recommendation ("I approve your recomendatiomns
and the considerations!", 2026-11-04):

- R1 finish split into finish, decide, close (Decide after /learn, before the branch is finished); R2 run-rules
  defines only `<flow-root>`, conductors define `<skill-dir>`, check 6 resolves both; R3 existence checks stay in
  flows-uses.mjs as checkUseNames; R4 a flow's own uses: only neutral names (review-code's host-only ones move to
  the tokens in Task 15); R5 audit template gains Tasks and Parking lot, check 3's call-through clause dropped; R6
  Picks:/Fixed repointed in Task 4; R7 Task 7 after 6, Tasks 11-13 chained after 10, Task 9 may edit steps; R8 Task
  15 owns tests-all.md and harden-all.md, every conductor task ends with no warnings in its files; R9 crates.yml
  trigger and filter; R10 one-word check only where [step: phases] is.
- R11-R19: writing/SKILL.md:239; spec facts (plugin:name, audit-template path, execute requires worktree, host .md
  files kept); host-map key test; adapter without H1 and codex.md:12; writing-skill.test assertions named; `flows: `
  prefix instead of the rebuild hint; scan-skills as two runs; ground-code and state declare no writes:; plan-check
  prose checks Does/Adds/Size.

Changed: plan.md (19 tasks, ~3990 lines, glance clean); spec.md §1, §3, §4, §6, §7. Gate 1 stays approved under the
same reopening.

### Plan review round 2, fix check and fresh eyes (2026-11-04)

Fix check (fresh opus agent, round 2's 10 should-fix edits): 10 PASS. Fresh eyes (opus, fable): no blocking
finding; 2 should-fix, 11 consider, none changing the plan's shape, so the review loop ends here. The user accepted
every recommendation ("yes I approve!", 2026-11-04): S1 the re-read line holds without a flow.md, and /review-code,
/understand and /learn skip state and start; S2 SHORT_NAMES as a forward rule; S3 every task runs flows-uses.mjs;
S4 the measure and its fallback (rules stay inline); S5 the budget applies to conductors only; S6 the gate mark in the
last cell; S7 /review-code's two gates; S8 research's handover is its own prose; S9 copyedit and plan-check once in
build-feature; S10 a before-you-write step; S11 Task 2's host.md diff; S12 Task 18's grep scope; S13 the audit
fixture gets the bucket column in Task 4, the wrong cockpit path is dropped.

Changed: plan.md (19 tasks, glance clean); spec.md §2, §4, §6.

## Tasks

Task 1: base 4e06895 (no untracked files); files check: 2 files, both listed; 509 lines against ~420 (limit 840); commit 271e5eb
Task 2: base 271e5eb (no untracked files); files check: 14 source files, all listed, plus generated trees; 294 lines against ~320 (limit 640); commit 64fc793; fix 4a48556 (CRLF H1 strip)
Task 3: base 4a48556 (no untracked files); files check: 22 source files, all listed, plus generated trees and README tree; ~410 lines against ~280 (limit 560); commit e854817
Task 4: base e854817 (no untracked files); files check: 13 files, all listed; 206 lines against ~170 (limit 340); commit 8f4ea66
Task 5: base 8f4ea66 (no untracked files); files check: 7 step files, all listed; 284 lines over both commits against ~260 (limit 520); commits d7f89f9, 474c372, fix 2d2141b; measured stub (rules plus Start, bytes ÷ 4) after the fix: claude-code 2524, codex 2496, both under 4,000, so nothing moves below Phase 1
Task 20: base 2d2141b (no untracked files); files check: 18 files, all listed (lockfile excluded); 403 lines against ~380 (limit 760); NEEDS_CONTEXT ruled (readFileSync schema; flake fixtures parked); commit d7d4ef0
Task 6: base d7d4ef0 (no untracked files); files check: 9 files, all listed; 207 lines against ~260 (limit 520); commits 224097e, 9cb20e1
Task 8: base 9cb20e1 (no untracked files); files check: 4 files, all listed; 114 lines against ~170 (limit 340); commits 9360992, 631d22c, fix 0ea94db (decide records its outcome before its commits), fix 4e95d6b (flow.md unchanged until the closing commit)
Task 7: base 4e95d6b (no untracked files); files check: 8 files, all listed; 230 lines against ~300 (limit 600); commits 7c17342, efc80fa
Task 17: base efc80fa (no untracked files); files check: 5 files, all listed, plus generated trees; 75 lines against ~60 (limit 120; 18 are the formatter re-padding writing's lesson table); commit 6def66c
Task 9: base 6def66c (no untracked files); files check: 3 source files, all listed, plus README tree and generated trees; 204 lines against ~250 (limit 500); rules plus Start: claude-code ~3457, codex ~3430 (budget 4,500); commit 2934e3f, fix da423d9 (call-conductor in Phase 7; after it claude-code ~3494, codex ~3467)
Task 10: base da423d9 (no untracked files); files check: 2 source files, both listed, plus README tree and generated trees; 158 lines against ~120 (limit 240); rules plus Start: claude-code ~3505, codex ~3478; commit 06542a3, polish ff74e99 (resume and stop wording; after it claude-code ~3551, codex ~3524)
Task 14: base ff74e99 (no untracked files); files check: 2 source files, both listed, plus README tree and generated trees; 143 lines against ~120 (limit 240); rules plus Start: claude-code ~3476, codex ~3449; commit 85a917b, fix 1f74ddd (no-subagent narrowing, research handover commit; the user's decisions), fix 9949804 (Codex adapter sentence)
Task 15: base efa74f0 (no untracked files); files check: 9 files, all listed (docs.rs by ruling), plus README tree and generated trees; 390 lines against ~260 (limit 520); rules plus Start: claude-code ~3023, codex ~3015; commits c53cfdf, a293355, fix 8ee1bb5 (pr reads the PR head, the user's decision; base-red only on the same failure; Fix <n> labels), polish fc7e213 (after it claude-code ~3141, codex ~3133; ~444 lines over all four)
Task 16: base fc7e213 (no untracked files); files check: 2 source files, both listed, plus README tree and generated trees; 155 lines against ~120 (limit 240); rules plus Start: learn ~2213/~2204, understand ~2558/~2550; commit cbf8889, polish cc3bf02 (missing-piece in /learn; after it learn ~2693/~2685, understand ~2579/~2571)
Task 11: base cc3bf02 (no untracked files); files check: 2 source files, both listed, plus README tree and generated trees; 173 lines against ~140 (limit 280); rules plus Start: claude-code ~3546, codex ~3541; commit ef71219, polish a5edebd (proof and inline rules; review-code hands a /fix pick its Files; after it ~3575/~3570)
Task 12: base a5edebd (no untracked files); files check: 1 source file, listed, plus README tree and generated trees; 147 lines against ~140 (limit 280); rules plus Start: claude-code ~3364, codex ~3357; commit c75c553, fix c000da5 (patch/minor read for breaking changes, 0.x minor as a major; after it ~3380/~3372)
Task 13: base c000da5 (no untracked files); files check: 4 source files, all listed, plus README tree and generated trees; 161 lines against ~140 (limit 280); rules plus Start: claude-code ~3381, codex ~3373; commit 3aba258, polish e7b9d59 (cockpit FLOW_SKILL gains refactor by ruling; one copyedit; phase: shape on reopen)
Task 18: base e7b9d59 (no untracked files); files check: 14 files, all listed, plus generated trees; 464 lines against ~360 (limit 720; 265 the deleted flow-rules.md); commit 1210421, fix 91480ed (two narrowed rules restored after an independent loss audit; dead warnings field removed; docs; total 556)
Task 19: base 91480ed (no untracked files)
Token estimates (rules plus Start, Claude Code / Codex, budget 4,500): build-feature ~3528/~3521, fix ~3575/~3570, implement ~3585/~3577, learn ~2693/~2685, refactor ~3381/~3373, research-feature ~3517/~3509, review-code ~3141/~3133, understand ~2579/~2571, upgrade ~3380/~3372

## Rulings

- 2026-11-04, pre-flight (Task 3): check 7's short-name rule is a warning until Task 18, not a problem — spec §4 says the checks today's text fails warn until flow-rules goes; all 12 short-name uses are bare words today — Task 3's commit fails check:harnesses
- 2026-11-04, pre-flight (Tasks 2, 5, 16): the `web-fetch` token text names `web-mcp:fetch`; ground-code writes `pstack-picks:why` as well as `pstack-picks:how`; /understand writes `mattpocock-picks:teach` — check 7's forward rule needs the qualified form for every SHORT_NAMES use; the spec leaves wording to the builder — Task 18 fails on the bare names
- 2026-11-04, pre-flight (Task 1): checks 1-4 run only on the steps a file uses, and Task 1 adds a test that an unused step with a check-1 error builds — spec §4 checks steps against 'the including flow'; plan Stage 2 says a step is checked once a flow uses it; Task 5's verbatim commit carries flow-rules.md:162's `<skill-dir>` — Task 5's verbatim commit fails
- 2026-11-04, pre-flight (Task 7): no override marker for the hallmark row (#17); the row change alone — checkOverrides resolves markers only under plugins/flows/packs/, and hallmark lives in plugins/opt-in/hallmark; spec §8's resolution is the row — a marker would fail npm test
- 2026-11-04, pre-flight (Task 7): markers sit next to the sentence they override: `execute` takes the handling-reports, executing-plans final-review and stop-before-finishing markers; `deviations` takes continuous-execution, rulings, four-stops, fix-loop and NEEDS_CONTEXT — spec §1: markers sit next to the sentences they override; Task 7's 'all move to deviations' contradicts its own execute step — markers in the wrong step confuse the next upstream sync
- 2026-11-04, pre-flight (Task 18): no new checkTemplates test; Task 18 deletes the dead RULES_FILE constant and the without() fixture's flow-rules copy — Tasks 4, 6 and 7 move all five reads off RULES_FILE, so a 'FAIL first' test can't fail — none; the real-repo test still covers checkTemplates
- 2026-11-04, pre-flight (Task 15): two commits: the verbatim move of flow-rules' Audits, Scope, Reports and the tob lines, then the rewrite — Global Constraint: a task that moves text and fixes findings commits the move first — one commit hides the move inside 20 fixes
- 2026-11-04, pre-flight (Tasks 9, 14, 16): drop host-only names from flows' own uses: `claude-code:general-purpose` (build-feature, research-feature) and `revise-claude-md` (learn); their text says 'a fresh agent' (or the matching token) instead — Global Constraint: a flow's own uses: lists only what its neutral text runs; Task 2's adapter uses are exactly four names — Task 18's lint or check 7 fails on Codex
- 2026-11-04, pre-flight (Tasks 10-16): each conductor task may edit `plugins/flows/steps/*.md`, only for what its first composition shows wrong — these tasks first compose steps build-feature doesn't use and must leave no warning; Task 9 already has the clause — a needed step fix becomes a files-check deviation
- 2026-11-04, pre-flight (Task 19): flow.md is on Task 19's Files list — its step records the token estimates in flow.md — a files-check deviation
- 2026-11-04, pre-flight (Task 12): phases.rs is not on Task 12's Files list — its step keeps the upgrade keys, so the list doesn't change — none
- 2026-11-04, pre-flight (Task 16): Task 16 runs cargo test -p flow-cockpit-core — Global Constraint: a task that changes a phase table runs it; [step: phases] redraws both tables — none; it can't fail, there is no list for them
- 2026-11-04, pre-flight (Task 9): build-feature writes `[step: before-you-write]` once itself; `requires:` only checks — spec §1 and Task 1: requires is a check that refuses, not an include — a missing step fails check 2
- 2026-11-04, pre-flight (Task 5): missing-piece stays a step — spec §6 and Task 5 make it a step; §6's list is not closed; either passes the checks — a lookup table in the rules costs budget; Task 5's measure shows it
- 2026-11-04, pre-flight (Task 2): check() keeps its string[] return; cli.ts and check-repo split it by the `flows: ` prefix in one line each — a changed check() return type is an interface change the plan doesn't make — two one-line splits to keep in step
- 2026-11-04, pre-flight (Task 18): Task 18's build.test adds one fixture: Codex text naming a CLAUDE_ONLY phrase makes check() return a problem — Review Focus 3 promises it; Task 18's test list lacked it — Review Focus 3 unchecked
- 2026-11-04, pre-flight (Task 14): research-feature's handover stays its own prose, no `[step: decide]` — the user's S8 decision (plan review round 2) outranks the scan's suggestion — a little repeated prose
- 2026-11-04, Task 1: implementers stage their task's Files paths and the generated trees by name, never `git add -u` — the coordinating session keeps uncommitted flow.md bookkeeping that `-u` would sweep into a task commit — a stray flow.md hunk in a task commit if wrong
- 2026-11-04, Task 2: commands.ts build() returns Build (estimates, warnings, problems) instead of Diagnostic[]; its one caller is cli.ts — the user's pre-flight decision 1(a) has cli build print estimates, and this is the one path that carries them there — a public-signature change outside an Adds line if wrong
- 2026-11-04, Task 3: renderTree takes both hosts' uses (renderTree(byHost)) — the brief's test needs the neutral union and (claude-code) marks — an exported signature change outside Adds if wrong
- 2026-11-04, Task 3: the README uses tree is sorted, not in the authors' order — composeFlows sorts uses (Task 1 contract); same 78 entries — a readability loss if wrong
- 2026-11-04, Task 5: the implementer reports the two measured stub sizes and the controller writes them under **Tasks**; flow.md stays off the implementer's commits — flow.md holds the controller's uncommitted bookkeeping, and staging it would sweep that in — the numbers land one step later than the commit if wrong
- 2026-11-04, Task 5: run-rules keeps today's Host capabilities sentences (skip subagent-only steps with no sequential substitute, record skips, a skipped check never counts as passed) and the todo-list rule — no later task places them and Task 18 deletes flow-rules.md — rules silently lost if wrong
- 2026-11-04, Task 5: run-rules also keeps flow-rules.md:49-51's handoff sentence (a sub-skill's "invoke the next skill" is not followed; come back to the conductor and run its next phase) and :21-22's "resolve resource paths relative to their containing document, never the shell working directory" — the Task 5 review found no other home, and Task 18 deletes flow-rules.md — rules silently lost if wrong
- 2026-11-04, Task 5: ponytail's `lite` row for brainstorm approaches and its marker (flow-rules.md:193, :202) go into build-feature's and research-feature's own text in Tasks 9 and 14; the "report gates" half of that row and "ponytail never runs as a mode" (:186-187) are dropped — the first is conductor-specific, the others have no reader that needs them — a lost nuance if wrong
- 2026-11-04, Task 20: compose.ts reads `step.schema.json` at runtime (`readFileSync`) instead of a JSON import; the import puts the schema into the installer's tsc program, whose catalog test then finds an emitted `plugins/flows/steps/` and fails. Still one source of keys (spec §1) — a stale key list if wrong
- 2026-11-04, Task 20: the flake's sandboxed check gets `node_modules` (check-repo with smol-toml runs there); "`nix flake check` still passes" can't hold, because it already fails at 2d2141b on end-of-file-fixer and treefmt over 31 test fixtures. Those go to the parking lot — a red flake check stays red if wrong
- 2026-11-04, Task 9: every conductor that runs another inline (build-feature's /review-code and /learn, and the later callers) writes `[step: call-conductor]` before the inline call; no plan task placed it, and flow-rules.md:180-182, its only other home, goes in Task 18 — the callee rules (skip start, stop before Decide, write into the outermost flow.md) lost if wrong
- 2026-11-04, Task 9: `pstack-picks:interrogate` moves into `finish.toml`'s `uses`, out of build-feature's own `uses:` (Global Constraint: a flow's own `uses:` lists only what its own text runs) — every finishing conductor repeats the workaround if wrong
- 2026-11-04, Task 14: research-feature runs /learn inline by one sentence of its own (skip its start, no flow.md, its lines under **Learned** and **Parking lot**) instead of `[step: call-conductor]`, whose `writes` (Findings, Deviations, Rulings) research-template.md lacks; the user's S8 decision already keeps its handover its own prose — check 3 fails on the research template if wrong
- 2026-11-04, Task 11: a /review-code pick run through /fix takes its **Files** list and its task line from /fix's gate; /review-code writes no `Fix <n>` line of its own for it (review-code/SKILL.md, one line ruled into Task 11) — the files check raises a false deviation, or the task line is written twice, if wrong
- 2026-11-04, Task 13: the cockpit's `FLOW_SKILL` map (crates/flow-cockpit/app/shell/start-form.js) and its test gain `refactor`, ruled into Task 13: without it every open refactor run is dropped from the start form's resume list; the README command table and AGENTS.md:63 /refactor rows go to Task 18, which edits both files — a refactor run the cockpit can't resume if wrong
- 2026-11-04, Task 18: the added-task format (next free number, never a letter, at the end of plan.md with its own `Depends on:` and an `**Added:**` line) moves from `plan-shape` into `deviations`, so every building conductor carries it, /implement's build-feature slug route included; the independent loss audit found it reached only build-feature, refactor and upgrade — /implement adds lettered or unmarked tasks to a feature run's plan if wrong
- 2026-11-04, Task 18: the tob spec-compliance redirect (flow-rules.md:167-172) also goes next to review-code/references/tests-all.md's Requirements probe, which dispatches tob `spec-to-code-compliance`; it had lived only in docs.md — the probe meets a slash command that doesn't exist if wrong
- 2026-11-04, Task 18: the always-empty `warnings` field (Checked, Build) and cli.ts's `warning:` print are removed with Task 18's fix round (build.ts and cli.ts ruled in; 'no option that nobody sets') — a live warning path that invites checks to downgrade again if wrong
- 2026-11-04, Task 18: flow-rules.md:20-21's `<skill-dir>` definition is dropped: no text outside the packs uses it, and conductors define it where they use it (spec §1) — none

## Parking lot

- On Codex, run-rules' model sentence renders as "the session's model or the session's model where the judgment is hard" (the `{{model:*}}` tokens; same as the Task 9 entry).
- `ground-code.toml`'s text opens with a blank line, so every built conductor that uses it has a double blank line there (found in Task 16).
- review-code's audit template has no `## Gates` section; gate lines sit under Findings and Run verdict (found in Task 15).
- `spec-compliance.md` names no models in the procedure itself; review-code's docs.md names them at the offer (found in Task 15, #46).
- `build-feature/references/prior-art.md`: neither its agent prompt nor its source-check prompt has an untrusted-data line, and both go to fresh agents that never see run-rules (found in Task 14).
- On Codex every `{{model:*}}` token reads "the session's model", so plan-review's model list and run-rules' Agents line repeat it (codex.ts or a one-token sentence; found in Task 9).
- `node scripts/flows-uses.mjs` rewrites `plugins/catalog.json` and `plugins/flows/plugin.json` in JSON.stringify layout, which treefmt then reverts: its output isn't formatter-stable (found in Task 6).
- `nix flake check` fails at 2d2141b and before: end-of-file-fixer and treefmt on 31 test fixtures (headroom-trim `tests/fixtures/*.json`, web-mcp captcha HTML, …) and one hook file; the flake's Node is 24.21 while `engines` asks for 26 (found in Task 20).

## Deviations

### /review-code pr reads the PR head

Task 15's two reviews found that under `pr <number>` the lens and verifier agents read the user's checked-out tree,
not the PR; the implementer had added `gh pr view` and a fetch of `pull/<n>/head` from `origin` (outside calls spec
§7 doesn't name) without handing the result to any agent. The user decided (2026-11-04, "Allow, with fallback"):
`gh pr view` gives the head sha and body; the PR head is fetched from the base repo as `gh` knows it (not assuming
`origin`), objects only, no checkout; every agent gets the head sha and reads files at that sha; when the fetch fails,
the review runs from the diff alone and the report says so. Applied in Task 15's fix round.

Status: decided 2026-11-04 (the user)

### Research handover commits and routes "do now"

Task 14's review found that /research-feature's handover leaves the run folder and /learn's files uncommitted, and a
"do now" Parking-lot line has nothing to act on it; /build-feature cuts its worktree from HEAD, so an uncommitted
research.md never reaches the build it is offered to. The user decided (2026-11-04, "Commit + route"): a "do now" line
goes into the offered /build-feature request, or is done in the session on the user's yes when it is a doc edit; one
commit (run folder plus /learn's files) is shown and made on the user's yes before the /build-feature offer. Spec §7's
/research-feature entry says so. Applied in Task 14's fix round.

Status: decided 2026-11-04 (the user)

### Without subagents: delegated work runs in the main session

Task 14 found that a host without subagents gets a research report with no evidence: run-rules (copied verbatim from
flow-rules' Host capabilities, #96) skips "every subagent-only step", which catches the literature and prior-art
searches along with the reviews. The rule exists so a review isn't the author grading itself; a search loses nothing
essential when the main session does it. The user decided (2026-11-04, "narrow it pls"): without subagents, work a
subagent only does on the session's behalf (searching, exploring, gathering sources) runs in the main session; a step
whose point is an independent check (a reviewer, the prior-art source check, the final review, the copyedit) is still
skipped and recorded as not checked. Spec §6's run-rules and prior-art rows say so. Applied in Task 14's fix round
(run-rules.toml, prior-art.toml, research-feature's literature search).

Status: decided 2026-11-04 (the user)

### Step format reopened

Status: decided 2026-11-04 (see the end of this entry)

After Task 5 the user wrote "I think json or xml or something would be way better for the steps" (2026-11-04).
Design A (plain-Markdown steps plus a compose pass, ADR 0009) is Gate 1's decision, so this reopens Gate 1 for the
step format. Tasks 1–5 are built and pushed (474c372); Task 5's fix round and Task 6 wait on the decision.
Asked what a data format should give, the user said (2026-11-04): "at the end there should be markdown, I just
thought using json in the steps is way easier to combine to one proper markdown file and is easier to create and
validate than just text". A format panel (Markdown, XML, JSON, YAML, hybrid; real steps and /fix converted, no library) picked Markdown
(author, cost) and XML (checks); JSON scored worst. The user then allowed a small parser library and said source
preview doesn't matter ("I can see it in the skills itself in md"); a second panel (TOML, YAML, XML, Markdoc, a JSON
sidecar, each with a real library) scored Markdown with strict checks 23.5, TOML 20, sidecar 18, YAML and Markdoc
17.5, XML 15, JSON 8.5 (author, checks, cost). The user picked TOML steps (2026-11-04). Spec §1, §4, §5, Constraints
and Non-goals, ADR 0009 (amendment) and GLOSSARY edited; plan gains Task 20 (Steps in TOML, after Task 5, before
Tasks 6 and 8) and a Global Constraint. Vendored smol-toml is the controller's recommendation, not yet decided. A
two-reviewer recheck (fit, simpler) found 5 important and 7 minor problems. Applied as corrections: the prose hook's
second gate (hooks.json), `conductorDocs` shared by checkOverrides and checkPackPaths, `.taplo.toml` at the root and a
step-name filter, one key list (compose reads the schema), TOML key forms in checks 2-4 and the gate row, Size ~380
with `git mv`, Task 5's fix round first on the .md files. The user decided (2026-11-04): smol-toml as a pinned npm
dependency (sync.yml `npm ci`, the flake check gets node_modules), not vendored; `in = "every-conductor"` on run-rules
only, no `except`; keys and types checked on every step, text checks only on used ones, no did-you-mean; no taplo
formatter; the prose hook stays on `.md`.

Status: decided 2026-11-04: steps are TOML (spec §1, §4, §5; ADR 0009 amendment; plan Task 20). Gate 1 and Gate 2 re-approved
2026-11-04.

### Pre-flight 1: no channel for each conductor's token estimate

Status: decided 2026-11-04: (a) `Checked` and `Build` gain `estimates`; cli build prints them

The spec (§4, Verification) and Task 2 say the build prints each conductor's estimate, but `Checked` and `Build`
carry only problems and warnings, and a warning won't do because Task 18 turns every warning into a problem.
Options: (a, recommended) `Checked` and `Build` gain `estimates: Record<string, number>`, named in Task 1's and Task 2's
Adds, and `cli.ts build` prints them; (b) drop printing from the spec, and Tasks 5 and 19 measure with a one-line
command.

### Pre-flight 2: /review-code's Phase 7 gate has nowhere to record its line

Status: decided 2026-11-04: (a) both gates kept; gate declares no writes:, a run without flow.md records its gate line in its audit file

Task 15 puts `[step: gate]` in Phase 7 (your S7 decision), but the gate step records its line in flow.md's Gates,
and /review-code keeps no flow.md. Options: (a, recommended) keep both gates; the gate step declares no `writes:`, and
its text says a run without flow.md records the gate line in its audit file; (b) Phase 7 is decide then close with no
gate (the table loses a gate it shows today).

### Pre-flight 3: two tests run through seams the Test seams list doesn't name

Status: decided 2026-11-04: (a) writing-skill.test.mjs and lint.test.ts added to Test seams

Task 17 tests through `writing-skill.test.mjs` and Task 18 through `lint.test.ts`; both are required by the spec (§5,
§3), but the approved Test seams list lacks them. Options: (a, recommended) add both to Test seams; (b) drop those
tests.

### Pre-flight 4: /implement, /fix and /upgrade each restate the one-task build

Status: decided 2026-11-04: (a) a `one-task` step in Task 7, used by /implement, /fix and /upgrade

Tasks 10, 11 and 12 each write "the main session builds one task: builder brief, files check against the gate's
commit, a Task 1 line" in their own prose, which is the repeated rule Goal 1 removes. Options: (a, recommended) a
`one-task` step (written in Task 7 with the build steps, requires `builder-brief` and `deviations`) used by the three;
(b) keep the three copies.

## Walkthrough

| spec goal | plan task | file:line | test |
| --------- | --------- | --------- | ---- |

## Run verdict
