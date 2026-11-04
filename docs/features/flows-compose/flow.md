---
flow: feature
phase: execute
now: Gate 2 approved (subagent-driven); starting Task 1.
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

- Gate 1, spec approved: 2026-11-04 (copyedited; "I approve", the user). Reopened 2026-11-04: plan review round 1 changed §2 (drawn phase table as a decision, one-word phase names), §3 (path placeholders are not tokens), §4 (check() fails on check problems; warnings until flow-rules goes; the sync-PR sentence was wrong) and §5 (uses from composeFlows, audit template, scan scope); approved with "pls fix all the issus!", the user, 2026-11-04
- Gate 2, plan approved: 2026-11-04, execution: subagent-driven (copyedited; "I approve sdd pls", the user)

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

## Rulings

## Parking lot

## Deviations

## Walkthrough

| spec goal | plan task | file:line | test |
| --------- | --------- | --------- | ---- |

## Run verdict
