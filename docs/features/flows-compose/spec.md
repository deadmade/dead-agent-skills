# Flows compose: design

Status: draft for Gate 1, 2026-11-04. Run state: [flow.md](flow.md). Evidence: [evaluation.md](evaluation.md) (93
verified findings, cited as #n), [prior-art.md](prior-art.md), [designs.md](designs.md).

## Intent

The flows plugin's conductors are hand-written Markdown. They restate the same steps in slightly different words, and
they lean on `flow-rules.md`, which they cite by section name. So a fix kept landing in one conductor and not in its
siblings: an independent evaluation found 93 problems, and 37 of them are copies that drifted apart.

This change builds every conductor from shared steps that are written once. A flow is its own short prose plus
`[step: name]` lines in order; the harness compiler copies each step's text into the flow and writes one
self-contained skill per harness. The same PR fixes all 93 findings and reshapes the set of flows to the one the user
decided on.

## Goals

1. **One source per step.** A rule an agent follows exists in exactly one file under `plugins/flows/steps/`, and every
   flow that uses it gets the same words.
2. **One file per flow for the agent.** A built conductor holds every rule it follows; none says "read flow-rules first".
   References hold only what an agent looks up (templates, subagent briefs, deep methods).
3. **Correct on both harnesses.** Claude Code and Codex each get wording they can act on, and `plugins/` stays
   agent-neutral.
4. **The build catches drift.** `npm run check:harnesses` fails on unknown steps, missing template sections, rules
   pushed past the compaction cut, script paths that don't resolve, Claude-only names in neutral text, and uses lists
   that don't match the text, and check-repo fails on the same; `build:harnesses` also stops on unknown steps and
   missing template sections (§4).
5. **The decided flow set:** `/implement` implements and never plans; `/upgrade` takes many packages and batches big
   migrations; a new `/refactor` is added; everything else keeps its job.
6. **All 93 findings fixed** (the finding map in §9 names where each one lands).

## Non-goals

- The flow cockpit. Nothing is designed for it; its tests that read SKILL.md tables and template headings keep passing
  for free where they can.
- Conductors as data: no phase fields, no `kinds.json`. Only steps are data: TOML with a schema (step format
  reopened 2026-11-04, §1).
- New flows beyond `/refactor`. Spike, release, incident and onboarding flows come later, built from the same steps.
- Changing vendored packs. They change only through their sync transforms, and conductors override them with markers.

## Anti-goals

- A step that reads differently per flow (no slots, no parameters).
- A built skill that sends the agent to another file for a rule it must follow.
- A compiler that writes rule text in TypeScript strings: rule text lives in `plugins/flows/steps/`.
- Composition machinery that is harder to maintain than the drift it removes (the B and C designs were rejected for
  this).

## Constraints

- `plugins/` is agent-neutral (AGENTS.md:322); harness prose lives in `tools/harness-compiler/src/templates/`.
- Generated `.claude-plugin/` and `.agents/plugins/` are committed and must work from a fresh clone;
  `check:harnesses` compares them with a fresh build (AGENTS.md:336-348).
- Vendored packs are never edited (AGENTS.md:224-229); `<!-- overrides pack/path: "…" -->` markers stay, and the build
  keeps checking them.
- After compaction, Claude Code keeps only a skill's first 5,000 tokens, with 25,000 shared across skills. The Agent
  Skills spec recommends under 500 lines and 5,000 tokens. Codex gives the skill list 2% of context (prior-art.md,
  source checked).
- One parser library, `smol-toml` (zero dependencies), pinned exactly in `tools/harness-compiler/package.json`, for
  the step files; nothing else new. Every job that runs check-repo or the compiler installs packages first (sync.yml
  gains `npm ci`; the flake's sandboxed pre-commit check gets `node_modules`), and a fresh clone runs `npm ci` before
  committing (user decisions after the TOML recheck, 2026-11-04). Node 26 runs `.ts` directly (`package.json` engines; `check-repo.mjs` imports
  `.ts`).

## Approaches

|     | Shape                                                                                                                                                     | Picked                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A   | Plain-Markdown steps copied verbatim; flows keep `SKILL.md`, real `## Phase` headings, own prose, `[step: name]` lines; one compose pass                  | yes, with the judges' grafts                                |
| B   | Agent-first: each step split into Always rules (lifted, deduplicated) and Do text; build numbers rules and gates; ~800 compiler lines and a trace command | no: source no longer reads like the output; cost            |
| C   | Checks-first: `[phase: … \| runs: … \| output: …]` lines, `kinds.json` of required steps per flow kind                                                    | no: structure as data the user didn't want; harder to write |

Both judges started from A (designs.md). The design takes these grafts:

- per-host tokens in every flows file;
- build checks (rules budget, template sections, script paths, uses from built text, subagent fallbacks);
- Codex `agents/openai.yaml`;
- B's finish order and commit offer;
- checks-first's phase-table shape.

## Design

### 1. Source layout

```
plugins/flows/
  steps/<name>.toml               shared steps; not a catalog resource, never shipped
  steps/step.schema.json          the step keys, types and values; compose reads them, editors complete from them
  skills/<flow>/SKILL.md          the flow source: frontmatter, own prose, ## Phase headings, [step: name] lines
  skills/<flow>/references/       lookups only: templates, subagent briefs, deep methods (also composed)
  skills/<flow>/scripts/          unchanged
  references/                     shrinks to lookups shared by several flows (templates, spec-compliance.md)
tools/harness-compiler/src/
  flows/compose.ts                parse, expand, render, check (new)
  templates/hosts/<target>.ts     token map per harness (replaces hosts.ts; hosts/<target>.md stays as the
                                  adapter token's source text, without its H1)
```

**A step file** is TOML (step format reopened after Task 5 and decided 2026-11-04, after two format panels; the
user: "using json in the steps is way easier to combine to one proper markdown file and is easier to create and
validate than just text"). Every key but `text` is optional:

- `uses`: the skills, agents and tools its text runs (`["superpowers:executing-plans", "pstack-picks:how"]`);
- `requires`: steps that must also be in any flow using it (`execute` requires `["worktree"]`);
- `writes`: flow.md sections it writes (`["Rulings", "Parking lot"]`), checked against the flow's template;
- `needs = "subagents"` when its text dispatches subagents; the text must then contain a line starting
  `Without subagents:` saying what happens instead;
- `repeat = true`: the step may appear more than once in a file (only `gate`);
- `in = "every-conductor"` (only `run-rules` has it): every converted conductor (a SKILL.md holding `[step: phases]`)
  must use the step. No step names a conductor;
- `text`: the step's Markdown, a multi-line literal string whose opener stands alone on its line (`text = '''`), so
  nothing in it is escaped and its lines map to file lines. Compose copies it byte for byte. It can't contain `'''`. It
  has no `#`/`##` headings, because it lives under the flow's heading, and when it is long it may use `###` for its
  own name.

`smol-toml` parses the files. Compose loads only `steps/<name>.toml` files whose name is a step name
(`[a-z][a-z-]*`), and takes the key list, types and allowed values from `steps/step.schema.json`, so the schema is the
one source. Each step's `#:schema ./step.schema.json` directive points editors at the schema, so completion and squiggles work while
writing. Treefmt runs Taplo on the step files; the text inside `'''` is preserved.

In steps (inside `text`) as in flows, override markers sit next to the sentences they override, and they are stripped from the built
output.

**A flow file** stays `skills/<flow>/SKILL.md`, so the loader, the catalog `skills` resource, conductor detection in
`scripts/flows-uses.mjs` and the skill scanner keep working. It holds skill frontmatter plus an optional `uses:`, then
the flow's own prose, `## Phase <n>: <Name>` headings, and lines holding only `[step: <name>]`. Two steps are built
in: `[step: phases]` draws the phase table, and `[step: host]` inlines the host adapter. Steps take no parameters:
where a flow differs, it writes its own sentence before or after the step.

Example, `skills/implement/SKILL.md` (shape, not final text):

```markdown
---
name: implement
description: 'Implement a ticket or an approved plan as given; it never plans. … no argument resumes.'
disable-model-invocation: true
---

# implement

Build what you are given, as given. Planning is /build-feature's.

[step: phases]

## Rules for the whole run

[step: host]
[step: run-rules]

## Start or resume

`flow: implement`, template: the build template.

[step: start]

## Phase 1: Read

Read the input and everything it links. A ticket goes ahead only when it says what behaviour changes, how you'd
know it's done, and leaves no design decision open (approach, where it lives, a new interface). A gap: stop, name it,
offer `/build-feature`. An approved plan goes ahead when glance accepts it; a missing field or a stale path: stop and
name each one, so the user can fix the plan and run /implement again.

[step: ground-code]

## Phase 2: Confirm

A ticket becomes one task: the gate shows the ticket, its **Files** list from Phase 1 and its acceptance criteria. No
plan.md is written and no execution method is asked. A ticket too big for one task fails the bar.

[step: gate]

## Phase 3: Execute

[step: worktree]

A ticket: build it yourself under the brief below, then run the files check against the gate's commit, and add a
`Task 1` line under **Tasks**. A plan: the execution skill the gate picked.

[step: builder-brief]
[step: deviations]
[step: execute]

## Phase 4: Finish

[step: finish]
[step: decide]
[step: close]
```

### 2. The built skill

The built SKILL.md follows the flow's order. By convention, which the budget check enforces, that order is:
frontmatter, title and purpose, the phase table, the rules for the whole run (host adapter, then the run rules),
Start, then the phases. The run rules end with: "After a compaction, or on resume, re-read this file from the
`## Phase` heading of the phase you are in (flow.md's `phase:`, where the run keeps one), before acting." /review-code,
/understand and /learn keep no flow.md, so they leave out `[step: state]` and `[step: start]` and write their own short
start prose.

`[step: phases]` renders today's table shape, `| <n> <Name> | <runs> | <output> |`, from the `## Phase` headings, and
then the line `phases: <a> | <b> | … | done`. A phase heading may carry `<!-- runs: … · output: … -->` on the next
line, which the build strips. A phase's row gets **Gate** when the phase contains `[step: gate]`, and gates are
numbered in the order they appear (`**Gate 1**`, `**Gate 2**`), because `phases.rs` reads a bare **Gate** as gate 1.
A phase's name is one word: it is the row name, the cockpit key and the `phase:` value, and compose rejects a longer
one. Existing keys never change, except /implement's `plan` → `confirm` (no implement run exists); new phases add keys.

Decision (plan review, 2026-11-04): the phase table is drawn from the headings rather than written by hand, so the
cockpit's table test reads the generated `.claude-plugin/flows/skills/*/SKILL.md`, and the cockpit CI's path filter
gains that folder. The cockpit's tests do not pass for free: the hard-coded phase lists in `phases.rs` (implement,
fix, a new refactor list), the `flow:` assertion in `tests/docs.rs:362-368` and the fixtures' headings
(`docs.rs:396-415`) change in the tasks that change those phases or templates. That is a data update and designs
nothing in the cockpit.

Everything an agent must follow is inline. `references/` keeps run templates, subagent briefs (prior-art,
plan-review, literature, the lens briefs, a builder brief), deep methods (tests-all, harden-all, spec-compliance,
copyedit, docs), and the Stack packs / missing-piece tables. A reference may also contain `[step: …]` lines, and it is
composed the same way.

Built, `/build-feature` is estimated at 6,000–7,500 tokens (designs.md, three independent estimates). The budget
check requires the rules plus Start to fit in the first ~4,500 tokens; the phases after that rely on the re-read line.
These sizes are unmeasured, so the build prints each flow's estimate and they can be watched.

### 3. Host differences

`templates/hosts/<target>.ts` exports a map from token to text. The compose pass resolves tokens in flows' own
Markdown (SKILL.md, steps, references), never in `packs/` or `agents/`, which already contain `{{`. An unknown token,
or a token one target lacks, fails the build. The tokens:

| Token                                                                         | Claude Code                              | Codex                                                      |
| ----------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `{{ask-user}}`                                                                | the AskUserQuestion tool                 | the host user-question tool, or ask in chat                |
| `{{explore}}`                                                                 | read-only Explore agents                 | read-only subagents                                        |
| `{{web-search}}` / `{{web-fetch}}`                                            | web-mcp, else WebSearch / WebFetch       | web-mcp, else the host web tools                           |
| `{{model:fast}}` `{{model:standard}}` `{{model:strongest}}` `{{model:other}}` | haiku, sonnet, opus, fable               | the session's model (the adapter forbids changing it)      |
| `{{watch-checks}}`                                                            | `Monitor` on `gh pr checks <pr> --watch` | run `gh pr checks <pr>` every minute until none is pending |
| `{{user-runs}}`                                                               | a `! <command>` line to type             | ask the user to run it and paste the output                |
| `{{adapter}}`                                                                 | today's `hosts/claude-code.md` text      | today's `hosts/codex.md` text                              |

Paths are written with the literal placeholders `<skill-dir>` and `<flow-root>`, never `${CLAUDE_*}`; they are the
same on both harnesses, so they are not tokens (plan review, 2026-11-04). `<flow-root>` is defined once in the
run-rules step ("the flows plugin folder: two levels above this SKILL.md"), and again in writing's SKILL.md for a
standalone copyedit; each conductor defines `<skill-dir>` in its own prose where it uses it. Check 6 resolves
`<flow-root>` against the built plugin folder and `<skill-dir>` against the file's own skill folder. Steps write every path through `<flow-root>`: `<skill-dir>` inside a step is a check 1 error,
because a shared step's skill folder differs per flow, and a bare relative link inside a step fails check 6. Script
commands, copyedit.md's included, read `node "<flow-root>/skills/writing/scripts/compare.mjs"`. The rewrite of
`${CLAUDE_SKILL_DIR}` to `.` in `transforms/text.ts:12-13` is kept for `packs/` only, and `writing-skill.test.mjs:31-37`
(which also calls `readUses`) is rewritten.
No built text runs a script relative to the shell's working directory (#1). The Codex flows README
(`templates/codex.ts:28`) stops citing flow-rules.md.

The lint gains a flows phrase list, one exported `CLAUDE_ONLY` list that the build-time check below shares: Explore agent, WebSearch, WebFetch, subagent_type, AskUserQuestion, Monitor,
haiku/sonnet/opus/fable and "the Skill tool". It applies the list only to the files compose reads
(`plugins/flows/steps/**`, `skills/**/*.md` and `references/**/*.md`) and skips lines that hold an
`<!-- overrides … -->` marker. It leaves README.md out, because its uses tree names `claude-code: … Monitor` (#12,
#13). A build-time check backs the lint: after `transformMarkdown`, Codex's composed conductors and references
(`packs/` and `resources/` excluded) contain none of the phrases.

For conductors (`disable-model-invocation: true`), the Codex target also writes `agents/openai.yaml` with
`policy: allow_implicit_invocation: false`, the form its packs already ship.

### 4. The build stage

`flows/compose.ts` (~200 lines with checks) runs in `emit/build.ts` for each target, after `target.emit` and before
`transformMarkdown`, over flows' `skills/**/*.md` and `references/**/*.md`. It is idempotent on files with no `[step:`
line and no token, so every other plugin's output stays byte-identical. Before parsing, it converts CRLF to LF on
every file it reads (flows, steps, templates, host maps), so the budget is measured on LF text. Paths inside compose
stay in `/` form. Compose takes a phase's runs/output comment from the first non-blank line after its heading, which
allows the blank line prettier inserts. It strips override-marker lines from its output. Tests live in
`tools/harness-compiler/test/compose.test.ts`, with fixture plugins built in code by a `put` helper, as the other
compiler tests do: one per failing check, and a CRLF one made with `replaceAll('\n', '\r\n')`, which no git setting
can rewrite. The workspace test glob and `flake.nix:47` already pick them up.

Each flow's SKILL.md names its run template in a `template:` frontmatter key, a comma list of paths relative to the
flows plugin root; review-code names `skills/review-code/references/audit-template.md`, a new audit template with
the sections its steps write (Findings, Tasks, Rulings, Parking lot, Deviations, Skipped, Run verdict). The build strips `template:` along with `uses:`. A step whose
file says `repeat = true` (only `gate` does) may appear more than once in a file, and each time it is copied in
full.

Compose reads every `steps/*.toml` once per build and checks it whether or not a flow uses it: a TOML syntax error
(with smol-toml's line and caret, and a hint when a `'''` inside the text ended it), an unknown key (the message
lists the valid keys), a wrong type (`repeat` not a boolean; `uses`, `requires` or `writes` not a list of strings; a
`uses` entry not `plugin:name`), a `needs` or `in` value outside its one allowed value, and a missing `text` or one
whose opener isn't alone on its line. The checks on a step's text (check 1's headings, `[step:` lines and
`<skill-dir>`, check 4's `Without subagents:` line, and its tokens) still run only on the steps a file uses, so a
verbatim commit can carry today's wording (the Task 1 ruling, narrowed to the text on 2026-11-04).

The build reports, citing `file:line`:

1. an unknown step or token, a token missing in one target, a step without `repeat = true`
   used twice in one file, a
   `[step:` line, a `#`/`##` heading or `<skill-dir>` inside a step, a phase name longer than one word in a file
   that contains `[step: phases]` (today's unconverted conductors build unchanged), and in such a file a line that
   looks like a step line but isn't exactly `[step: <name>]` (`[step:x]`, `[Step: x]`, a trailing space) or a
   converted conductor missing an `in = "every-conductor"` step; the two host maps' keys
   must match (a test, since `composeFlows` sees one map);
2. an unmet `requires`;
3. a `writes` section missing from a template: checked against every template the including flow names
   (/implement names both run templates, because of the slug route); a flow with no `template:` fails if any step it
   uses declares `writes`. A callee's writes land in the caller's own template, so nothing follows a call;
4. a `needs = "subagents"` step without a `Without subagents:` line;
5. built text that names `flow-rules` (the file is gone);
6. a `node …` command or `references/…` link in built text that doesn't resolve in that target's tree, or a
   `node "./…"` path relative to the working directory;
7. a uses mismatch, checked per target on that target's built text: every name in the flow's computed uses appears in
   the built text, and every pack path the built text names (`<packs>/<pack>/skills/<name>`, `<flow-root>/packs/…`)
   is in the uses. Plain words such as `how` or `fetch` are not matched in reverse; only paths are (my call). The
   check reads SKILL.md plus the references it links, and for a uses name on the exported `SHORT_NAMES` list (how,
   why, fetch, teach) only `plugin:name` or a pack path counts as its mention; bare words are never flagged (#86). Today's `checkUses` existence checks (an unknown plugin, a skill missing
   from its pack, a flows entry that is a conductor, a skill folder without SKILL.md, a leftover uses.json) stay in
   `flows-uses.mjs` as `checkUseNames`, fed by `composeFlows(…).uses`, because they need the catalog;
8. a conductor (`disable-model-invocation: true`; other skills are exempt) whose rules plus Start exceed ~4,500 estimated tokens (bytes ÷ 4, from the file's start to its first
   `## Phase` heading).

The build prints each conductor's token estimate.

Checks 1–4 run on compose's own source and throw with `file:line`, so `build` stops. Checks 5–8 run on the final
file in the target tree, after `transformMarkdown`, and return problems and warnings; `check()` (`emit/commands.ts`)
returns the problems with the file drift, so `check:harnesses` and check-repo fail on them. While the conductors are
being converted, the checks today's text would fail (6, 7's reverse and short-name rules, and the Codex phrase check)
report warnings; once flow-rules.md is deleted, every check reports problems. Override markers and pack paths stay
in `flows-uses.mjs` (`checkOverrides`, `checkPackPaths`), which check-repo already runs. An upstream sync that breaks
a marker therefore fails check-repo in the sync job before its PR opens (`sync.yml:68-76`), as it does today (plan
review, 2026-11-04; the earlier sentence that the sync PR still opens was wrong). Before resolving, checks 6 and 7 and
`checkPackPaths` map `<flow-root>` to the target's built plugin folder.

Traceability: step text is verbatim inside `text`, so `grep -rF "<sentence>" plugins/flows` finds the one source file.

### 5. What happens to existing pieces

| Piece                                            | Becomes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `references/flow-rules.md`                       | split into steps, then deleted; Audits, Scope, Reports and the tob spec-compliance lines move into review-code (#71)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `skills/*/uses.json`                             | deleted; `flows-uses.mjs` takes `composeFlows(…, TOKENS).uses` from compose.ts for the dependencies and README tree (#47, #61). A flow's uses per target = its own `uses:`, its steps', and the uses of the host text its tokens resolve to: each token map entry carries its own uses (`{{watch-checks}}` on Claude Code uses `claude-code:Monitor`; `{{adapter}}` on Claude Code uses `claude-code: code-review, security-review`, `claude-md-management@claude-plugins-official: claude-md-improver`, `claude-security@claude-plugins-official: claude-security`, and its text names claude-md-improver). `plugin.json` dependencies come from the Claude Code union; the neutral README tree lists the neutral union and marks host-only entries with the host (my call) |
| override markers                                 | unchanged syntax; `checkOverrides` already scans `steps/`; compose strips them from output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `checkTemplates`                                 | the gate line from `steps/gate.toml`; `Waiting for you` and `Status: decided` from `steps/deviations.toml`; `**Does:**` and `**Depends on:**` from `steps/plan-shape.toml`; `Picks:` and `Fixed <date>` from review-code's `audit-template.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| run templates                                    | the two use the same section names for what the same steps write: Grounding replaces Findings; flow-template gains /fix's Findings (#9), Review and Learned; both get a Walkthrough whose first column is `goal` (spec goal, ticket criterion or the fixed cause)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `checks.md`'s Decide section                     | becomes the `decide` step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `hosts/*.md`, `hosts.ts`, `references/host.md`   | the `{{adapter}}` token and the token maps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| writing's tests (`writing-skill.test.mjs:31-43`) | assert on `steps/copyedit.toml`; the `readUses` call goes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `phases.rs` table test                           | reads `.claude-plugin/flows/skills/*/SKILL.md`; its lists and `tests/docs.rs` updated in one task (§2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `npm run scan-skills`                            | also scans `.claude-plugin/flows/skills/`, where composed text lives (not the whole generated tree, which would scan every skill twice)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `steps/*.md` (Tasks 5)                           | renamed with `git mv` and converted to `steps/*.toml` with bodies unchanged byte for byte; `run-rules` gains `in = "every-conductor"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `checkOverrides`, `checkPackPaths`               | their shared walker (`conductorDocs`) takes `steps/*.toml` as well as `.md`. The prose hook stays on `.md`: its hooks.json gates on `**/*.md`, and it ships to users                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| package.json, `sync.yml`, `flake.nix`, AGENTS.md | `smol-toml` 1.9.1 pinned exactly; `npm ci` before every workflow step that runs check-repo or the compiler; the sandboxed pre-commit check gets `node_modules`; AGENTS.md says a fresh clone runs `npm ci` before committing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AGENTS.md:63-66, README, GLOSSARY                | rewritten for steps and the new flow set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### 6. Steps

The builder splits today's text into steps. This table is the expected set of steps and its owners, not a closed list.

| Step                                          | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fixes                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `run-rules`                                   | user decides; say how you know; untrusted data; agents (count, fresh, models as tokens; without subagents the main session does delegated work itself and skips independent checks); homes and commits; the re-read line                                                                                                                                                                                                                                                                                                                                                                                                       | #72, #93                       |
| `state`                                       | flow.md fields; `phase:` names the phase in progress, not the finished one; the template's placeholders named                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | #50, #93                       |
| `start`                                       | start or resume for every flow: argument = slug (search repo root, `.worktrees/*/`, `worktrees/*/`, `.claude/worktrees/*/`; newest copy; work in that worktree), else new slug (scoped package names flattened, `@types/node` → `types-node`; a collision asks), else resume (one / several: ask / none: ask); never create over an existing flow.md; `flow:` mismatch names the owner; on resume, a base that moved is offered a rebase or merge first; an open run can be abandoned (`phase: done`, `now: abandoned: <why>`)                                                                                                 | #7, #25, #31, #37, #55, #88    |
| `ground-code`                                 | pstack `how` (graphify first when a graph exists), `why` only for the concern asked; domain docs; reuses a research run's Grounding instead of re-running                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | #67, #70                       |
| `prior-art`                                   | the prior-art agent and its source check, with an explicit report path; without subagents the main session runs the search itself and the source check is skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                              | #24                            |
| `seams`                                       | the seam question and its spec line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                              |
| `before-you-write`                            | a frozen copy of ponytail's Before you write, one override marker per copied sentence; required by `plan-shape` and `builder-brief`, so the rule lives once                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | #91                            |
| `plan-shape` (requires `before-you-write`)    | writing-plans with Before you write; Does/Depends on/Adds/Size per task; Global Constraints with the seam lines, the no-interface line and Test seams; Files entries are plain paths (line ranges go in the step text); an added task takes the next free integer and states `Depends on:`; the execution handoff is overridden; stack-pack detection names the matching skill in Global Constraints; requires `plan-check`                                                                                                                                                                                                    | #4, #6, #8, #16, #34, #39, #48 |
| `plan-check`                                  | glance runs and accepts the plan (after every edit and after the copyedit); every task has Does, Depends on, Adds and Size; a plan outside the run folder is linked from flow.md, never edited in place. glance gains a read-only mode that prints its block and writes nothing (today `glance.mjs:234` writes into the plan), used for a plan /implement is given                                                                                                                                                                                                                                                             | #6, #42, #48                   |
| `gate` (`repeat = true`)                      | how a gate is asked and recorded: one line `- Gate <n>, <what>: <date>[, execution: …]`; an inline conductor's gates continue the caller's numbering and name the callee (`- Gate 3, fix: cause approved`); an execution method is offered only at a plan gate, and subagent-driven only when subagents exist; the copyedit line, and "not copyedited: no subagents" (or "a given plan is not changed") when skipped                                                                                                                                                                                                           | #9, #15, #44, #64              |
| `copyedit`                                    | when and how the copyedit runs; spec, plan, research report and audit report; never on a plan /implement is given                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | #1, #63                        |
| `worktree`                                    | already in this run's worktree: stay; called inline: never create one, work in the caller's tree; worktree declined: `git switch -c` in place, never work on main. It moves the run folder: copy `docs/features/<slug>/` into the worktree, confirm with `diff -r`, remove the main checkout's copy, so only one copy exists and finishing's `git merge` doesn't abort on untracked files                                                                                                                                                                                                                                      | #5, #10, #37                   |
| `execute` (requires `worktree`)               | read the chosen execution skill by path; baseline failures recorded in flow.md; stop before `finishing-a-development-branch`; split a BLOCKED task only through a deviation                                                                                                                                                                                                                                                                                                                                                                                                                                                    | #5, #92                        |
| `builder-brief` (requires `before-you-write`) | the brief clause, the tests rule, a frozen copy of ponytail's The smallest complete change (without its "one small test" line) with one override marker per copied sentence, so `checkOverrides` fails on any upstream change; Never cut; stack-pack skill. Pasted into every builder brief; /fix's main session inlines the same step                                                                                                                                                                                                                                                                                         | #91, #29                       |
| `deviations`                                  | the classes as a numbered list; the fifth stop; the files check (per task: base sha, files, size, and the Adds comparison, run by the coordinating session itself in native mode); Rulings copied before either executor deletes its workspace; Parking lot                                                                                                                                                                                                                                                                                                                                                                    | #38, #73, #85, #90             |
| `finish` (requires `decide`, `close`)         | in order: walkthrough (build flows); `/review-code branch` inline, stopping after its Phase 6, with the intent stated generically (what flow.md's Artifacts link, plus the Picked options) and whether execution ran natively; `/learn` on this flow. A step can't hold another step, so a build flow writes `[step: finish]`, `[step: decide]`, `[step: close]` in that order (plan review, 2026-11-04)                                                                                                                                                                                                                       | #2, #3, #20, #36, #43          |
| `decide`                                      | rulings, deviations, Parking lot including /learn's lines, shortcuts, and each skipped check as its own row that Ready needs the user's explicit acceptance of (skips also go under the template's **Skipped**); the **Run verdict**; show the commits (message and files) for everything uncommitted (code, flow.md, audit, lessons) and make them on the user's yes. A decision reopened here goes back through the deviations step to whichever phase built the code: Task <n+1> in plan.md, or a numbered line under Tasks when the run has no plan.md. Written after `finish` by build flows and as review-code's Phase 7 | #15, #28                       |
| `close` (requires `decide`)                   | `finishing-a-development-branch`; merge conflicts stop with the list and options; `phase: done`. review-code's read-only `pr` target leaves it out in its own sentence                                                                                                                                                                                                                                                                                                                                                                                                                                                         | #3, #37, #87                   |
| `call-conductor`                              | reading another conductor's SKILL.md inline: the callee skips its Start and stops before its Finish/Decide, then returns to the caller; it writes into the caller's flow.md when there is one, else (a standalone /review-code calling /fix) writes Findings, Deviations and Rulings into the audit file; gates per the gate step                                                                                                                                                                                                                                                                                              | #9, #26, #29                   |
| `missing-piece`                               | the fallbacks for a missing plugin or pack file, filtered to the flow's uses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                              |

### 7. The flows

**`/build-feature`** keeps its seven phases and two gates, built from the steps above: Ground → Brainstorm (the
smallest option always offered) → Grill → Gate 1 → Plan → Evaluate → Gate 2 → Execute → Finish. With a research run as
input, it links research.md as prior art and reuses its Grounding (#23, #70). The dead `tdd` reference is removed
(#40), and the template gets the Review and Learned sections (#41, #60).

**`/implement`** never plans (see the example in Design §1). Its input is a ticket, or an approved plan (a path, or a
build-feature run's slug whose Gate 2 is approved). Phases: Read → Confirm (Gate) → Execute → Finish.

- A ticket must meet the ticket bar above. It is one task the main session builds the way /fix does (builder brief
  inlined, files check against the gate's commit, a `Task 1` line under Tasks), with no plan.md, no executor and no
  execution-method question. A ticket too big for one task fails the bar and goes to `/build-feature` (the user,
  2026-11-04).
- A plan path gets `plan-check` only, with glance in read-only mode (every task has Does, Depends on, Adds and Size).
  /implement never changes a plan it is given. A missing field, a stale path or name that `ground-code` finds, or a
  change the user asks for at its gate stops the run (the user, 2026-11-04; the stale-path stop replaces
  `implement/SKILL.md:42`'s "fixed in place"). /implement names each missing field or requested change; the user
  fixes the plan and runs /implement again. Because `/build-feature` takes no plan as input, it is offered only for a
  ticket gap or when the user wants the design reopened (the user, 2026-11-04). The plan is not copyedited, and the
  gate records "not copyedited: a given plan is not changed".
- Given a build-feature run's slug, /implement continues inside that run from its Execute phase and writes to the same
  flow.md. `flow:` stays `feature`, so the run stays one record and `/build-feature <slug>` can resume it too (the
  user, 2026-11-04). This behaviour is /implement's own prose before `[step: start]`, and the start step's `flow:`
  mismatch rule doesn't apply to it. If Gate 2 is open, or `phase:` is still plan or evaluate, /implement stops and
  offers `/build-feature <slug>`. If `phase:` is finish or done, it says so and stops. A plan path inside a feature
  run's folder counts as that run's slug. /implement uses Gate 2's `execution:` and asks only when that is missing,
  writes `phase: execute` and then `finish`, and adds no gate. A bare /implement doesn't resume a feature run; the
  run's `now:` says that `/build-feature <slug>` or `/implement <slug>` resumes it.

**`/fix`** (Reproduce → Ground → Cause → Gate → Fix → Prove → Finish):

- Phase 3 follows systematic-debugging only through its Phase 3; its Phase 4 is overridden, and hypothesis edits are
  reverted before the gate (#18).
- The gate records the options and the pick under **Options** (`Picked:`); the picked option's files plus the
  regression test file are the **Files** list (#11, #51).
- Before editing, `[step: worktree]` creates the branch; called inline, /fix works in the caller's tree (#10).
- Fix: the regression test (or the agreed runnable check), the smallest fix, and the full suite, split into numbered
  steps. The main session does it with `[step: builder-brief]` inlined as its rules, and the files check uses the
  gate's commit as base (#56, #83). The headline is reworded to allow the runnable check (#57).
- Prove: a fresh agent reverts the fix only in a scratch worktree, never in the user's tree. It follows
  `tests-all.md:25-27`'s full recipe: `git stash create` (or HEAD when the tree is clean), the untracked regression
  test copied in, then the fix files restored to the gate commit's version (#19). A flaky bug is proven by N runs
  before and after (default 20: it fails at least once before and never after) (#54). Two failed proofs go to the user
  with both attempts (#53).
- The dead `pstack tdd` / `patching-bugs` names are removed; their ideas stay, credited in prose (#52).

**`/upgrade`** takes one package, a list, or "everything outdated". Read changelogs → map breaks → plan → Gate →
Execute → Finish:

- Patch and minor bumps are grouped into one task; each major gets its own changelog read and break map.
- Every upgrade gets `[step: worktree]` (a worktree, or a branch, never main) and a Gate, which closes #33. A
  patch/minor-only upgrade in one area is one task (bump, install, full suite) that the main session builds the way
  /fix does, with no plan.md and no executor. Majors, and upgrades touching several areas, get a plan through
  `plan-shape` and the executor (#34) (the user, 2026-11-04).
- "Everything outdated" means each manifest's own outdated command (npm, cargo, nuget, …), not flake inputs,
  SHA-pinned Actions or vendored packs. The list, with majors marked, is confirmed in one line before any changelog
  is read. A list gets the slug `upgrade-<YYYY-MM-DD>`.
- The bump task's check is the package manager's install or restore (lockfile updated, restore clean). Each batch
  task's check is that batch's build and tests; the last task runs the full suite (#32).
- A big framework migration (xUnit v2 → v4) plans its fixes in batches (per project or folder), each batch green.
  Where the ecosystem allows per-project versions, a batch bumps its own manifest with its fixes. Where it doesn't
  (one central version or lockfile), the plan says intermediate batches are checked by building that batch only.
- In a monorepo each manifest is an area. A failed install (peer conflict, registry down) stops with the cause and
  options (#89). The slug follows `start` (#88), and Finish follows `finish` (#87).

**`/refactor`** (new) Ground → Shape → Gate → Build → Finish:

- Ground: read the code, run the suite, note where coverage is thin.
- Shape: the target shape in a few lines, and the size. A local refactor (rename, extract, move) gets a short plan; a
  restructuring (split, re-wire) gets options with seams, a plan and plan review. Either way, a Gate follows.
- Build: characterization tests first where coverage is thin, then the moves.
- Rule for the whole run: behaviour doesn't change, and tests that passed before still pass. A test may change only
  where the refactored name or path appears (imports, identifiers, file moves). A changed assertion or expected value,
  or a deleted test, is a deviation and goes to the Parking lot. /refactor's own prose adds this deviation class next
  to `[step: deviations]`, and the plan's Test seams list the characterization tests, which overrides the builder
  brief's "a rename, a move … get none" for this flow (the user, 2026-11-04).
- The run is `flow: refactor` on the build template, with the slug `refactor-<target>`. Both sizes go through
  plan-shape, plan-check and execute (worktree and executor). Whether the refactor is local or a restructuring is the
  agent's recommendation, shown at the Gate. A suite already red on the base stops at Ground and offers /fix. Finish
  hands /review-code "behaviour unchanged" plus the plan as its intent.

**`/research-feature`** Frame → Search → Weigh → Report (Gate):

- Frame grounds first (`ground-code`), then asks only what the code doesn't answer, then confirms the framed question
  in one line before the search agents start (#59).
- Both search reports are files with given paths. They use one strength scale (High / Med / Low, literature.md's)
  and mark claims [source]/[inferred], and one source check covers both (#24, #58).
- Handover: after Gate 1 come `/learn`, then /learn's Parking-lot lines with "do now, follow-up or drop", the Run
  verdict and `phase: done`. A "do now" line goes into the `/build-feature` request offered below, or is done in this
  session on the user's yes when it is a doc edit (an ADR, a glossary line). One commit (the run folder and /learn's
  files) is shown and made on the user's yes, so the report is in HEAD when a build's worktree is cut. Then the flow
  offers `/build-feature <research.md>`, which starts its own run linking the report (#23; commit and "do now" routing
  decided by the user, 2026-11-04).
- The template gets Parking lot and Learned (#43, #60), and the copyedit covers research.md (#63).

**`/review-code`** keeps its seven phases:

- The intent question is asked in Scope; lenses start only after Checks are green and the intent is known (#27).
- When several flow.md files are open, it asks which one gives the intent (#31). The intent from a build flow
  includes its plan (#2).
- Checks: a check already red on the base is reported as pre-existing, and the review continues. A repo with no
  documented checks says so in the Checks row and continues (#30). Any full-suite run on the same commit with the tree
  unchanged counts as the latest run, a caller's included; the clause about Phase 6 is reworded (#82, #84).
- New target `pr <number>`: review someone else's PR read-only from `gh pr diff`, never running its code. The Checks
  row reports `gh pr checks`, and the review only reports: no Fix, no finishing (#30).
- Lenses: small diffs run one combined agent on `{{model:strongest}}`, labelled combined, with the independence claim
  scoped (#77). The lean lens keeps ponytail-review's shortcut rule (#80). The security lens wording agrees with the
  adapter (#75). "Forked" is defined as the host's own fresh reviewer (#76). The docs lens returns candidate claims,
  and the main session runs the every-claim pass on the user's yes, with the procedure's real inputs and named models
  (#45, #46, #78). The duplicated skill list goes (#86).
- Report: every Fix-before-merge finding is listed (no cap); only Worth doing is capped. The audit table gets a
  `bucket` column so `all fix` resolves from the file (#49, #79).
- Fix phase: the builder brief is pasted in; standalone, deviations and rulings go to the audit file (#29).
- Phase 7 is `[step: decide]` then `[step: close]` (the `pr` target leaves out close); fixes use `[step: deviations]`, writing into the audit template. Called inline (through `finish`), review-code stops after Phase 6. Standalone, Decide
  shows and makes commits before finishing (#28).
- Claude Code's built-in code review needs a clean committed tree. When the tree isn't clean, the correctness lens
  uses the neutral brief and says so (#81).

**`/understand`** uses `ground-code`. It uses `teach` only for its Philosophy section, without lessons/ or assets/
(#65). The multi-session course offer is removed (#66), and the dead "called from a build flow" rule goes (#62). It
writes its map and the why to a scratch file outside the repo and names that file in the build-flow command it
offers.

**`/learn`**, run from `finish` before Decide:

- It writes AGENTS.md/CLAUDE.md, glossary, `docs/solutions/` and memory entries itself, and its own prose says so. It
  no longer routes lessons through revise-claude-md, which isn't vendored, so a marker can't quote it. The
  `{{adapter}}` propose-only sentence stays, scoped to /review-code's instruction-file review. The only marker is on
  domain-modeling's ADR offer (#14, #21).
- An ADR, a check, or a skill/conductor fix is a Parking-lot line (Decide picks it), and the Sort table says so (#68).
- Standalone, it reads the current conversation itself, and uses pstack `recall` only for a named past topic (#22).

**`writing`** stays hand-written; `/flows:writing copyedit` gets a README row (#74).

### 8. Pack conflicts resolved by override markers

| Finding  | Pack text                                                        | Resolution                                                                                               |
| -------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| #18      | systematic-debugging Phase 4                                     | `/fix` stops after Phase 3                                                                               |
| #35      | executing-plans: without subagents, do the final review yourself | keep flow-rules' rule: skip it, record "not checked"                                                     |
| #17      | hallmark on every web frontend                                   | stack-pack row: hallmark only for a new page or component, or when the user names it                     |
| #92      | handling-reports: break a BLOCKED task into pieces               | only through a deviation                                                                                 |
| #91      | ponytail's "one small test" line                                 | left out of the builder brief's frozen copy; every copied sentence carries a marker                      |
| #14, #21 | domain-modeling's ADR offer                                      | ADRs go to the Parking lot; `/learn`'s direct writes are its own prose (revise-claude-md isn't vendored) |
| #22      | recall skips the current chat                                    | standalone `/learn` reads the conversation                                                               |
| #65      | teach's lessons/ and assets/                                     | Philosophy section only                                                                                  |

### 9. Finding map

Every finding has a home above. By group:

- Steps (composition): #4, #5, #6, #7, #8, #9, #15, #16, #25, #26, #31, #34, #36, #37, #38, #39, #42, #44, #48, #50,
  #55, #63, #64, #67, #70, #72, #73, #85, #88, #90, #92, #93.
- Finish order and commits: #2, #3, #20, #28, #43, #87.
- Hosts and build checks: #1, #12, #13, #47, #61, #81.
- Per flow: build-feature #40, #41, #60; fix #10, #11, #18, #19, #51, #52, #53, #54, #56, #57, #83; upgrade #32, #33,
  #89; research #23, #24, #58, #59; review-code #27, #29, #30, #45, #46, #49, #71, #75, #76, #77, #78, #79, #80, #82,
  #84, #86; understand #62, #65, #66; learn #14, #21, #22, #68; docs #74.
- Pack overrides: #17, #35, #91.
- Flow set: #69, decided by the user (refactor added; upgrade widened; others later).

## Seam lines (copied into the plan's Global Constraints)

- Rule text: resolved in `plugins/flows/steps/` and each flow's own SKILL.md; never written by the compiler's code,
  which only composes and checks.
- Host wording: resolved in `tools/harness-compiler/src/templates/hosts/<target>.ts`; never seen by `plugins/`,
  which writes tokens.
- What a flow runs: resolved by its `[step:]` lines; a step never names the flows that use it.

## Left to the builder

- The exact split of today's text into steps, and their names, within the table in §6.
- The final wording of every step, kept to the meaning of today's rule unless a finding changes it.
- The token-estimate method (bytes ÷ 4 is acceptable) and the exact budget number, as long as the rules plus Start
  sit before the 5,000-token cut.
- The order of commits, as long as each commit builds and `check:harnesses` passes.

## Verification

- `npm test`, `npm run typecheck`, `npm run check:harnesses`, `harness-compiler lint`, `cargo test -p
flow-cockpit-core`, the cockpit shell tests.
- compose.ts tests: each failing check has a fixture that fails for the stated reason; a file with no `[step:` and no
  token builds byte-identical.
- No built file names `flow-rules`; Codex's composed conductors and references name no Claude-only tool or model
  (build-time check after `transformMarkdown`).
- The copyedit command run from the repo root on both built trees finds its script (#1, measured).
- Each built conductor's token estimate is printed, and the rules plus Start are under the budget.
- A fresh agent re-checks each finding in the map against the built text before Finish.
