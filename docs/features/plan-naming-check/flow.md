---
flow: feature
phase: done
now: Done: PR handed over for t3/check-plan-naming.
---

# Plan naming check: flow

## Request

Hey, would it be possible and make sense when we check the plan to also check the naming if it makes sense and if it should be named differently?

## Artifacts

- Prior art: [prior-art.md](prior-art.md)

- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs: none (no decision meets domain-modeling's three conditions)
- Glossary: [GLOSSARY.md](../../../GLOSSARY.md), **Naming rubric** added

## Gates

- Gate 1, spec approved: 2026-11-25. Reopened 2026-11-25: plan review round 1 added the no-glossary rule and report.md to the spec; re-approved with Gate 2: 2026-11-25
- Gate 2, plan approved: 2026-11-25, execution: native
- Gate 3, review-code: report: 2026-11-25 (picks 1, 2, 3)

## Skipped

- serena symbol lookup: server failed to connect; grounding read the files directly. Accepted 2026-11-25.
- /review-code tests, security, risk lenses: not applicable to a prose-only diff. Accepted.
- built-in code-review for correctness: uncommitted tree; neutral brief ran. Accepted.
- pstack interrogate: skipped on the user's choice at Gate 3. Accepted.
- plan review fresh-eyes round: no shape change. Accepted.
- treefmt and the pre-commit hook: no nix on this machine; prettier via npx. Accepted.
- agent behaviour of the new prose: no test seam. Accepted.

## Grounding

- The plan check is `plugins/flows/skills/build-feature/references/plan-review.md`: 2–3 fresh reviewers with the angles
  Correctness, Fit, Simpler (ponytail-review), one shared prompt tail, then Synthesis, fix check, fresh eyes. Phase 5
  of build-feature (`SKILL.md:134-137`) runs it; `/refactor` reuses it for a restructuring (`refactor/SKILL.md:82`).
- Nothing in it looks at names. `writing-plans`' self-review only checks that a name is spelled the same in every task
  (`writing-plans/SKILL.md:171`), not whether it is a good name.
- Every new name a plan introduces is already listed: each task's `**Adds:**` line (new files, types, exported
  functions, config keys, flags) — `plan-shape.toml`. glance.mjs tables them.
- Domain terms are settled earlier, in the Grill (`domain-modeling` writes `GLOSSARY.md`, with `_Avoid_:` lines per
  term). The plan check doesn't compare the plan's names against it.
- `/review-code` has no naming lens either (lenses: correctness, lean, tests, docs, security, risk).
- Phase 5 reviewers get the spec, plan, grounding, prior art and ADRs; not the glossary.

## Prior art

[prior-art.md](prior-art.md). Source check: 15 confirmed / 1 not supported (dropped) / 0 couldn't open; 1 location fixed, 1 relabelled. No source runs a dedicated naming pass or reviews names in a
plan before code exists. Shapes found: a naming line in a design checklist (Google eng-practices), a fixed rule list
(Rust API Guidelines), a glossary challenge while modelling (mattpocock `domain-modeling`), and a standalone naming
reviewer (no source uses it). Pitfall: naming nits turn into bikeshedding; guides say label them non-blocking.

## Findings

Baseline (2026-11-25, `npm test` at 4e6a364a plus the uncommitted run folder and GLOSSARY.md): repo, mods, python, rust
pass; node fails only the five `EPERM ... symlink` tests AGENTS.md names (no Developer Mode): glance's "the CLI runs
through a symlinked folder", "migration revalidates symlink", "clean slate: backup copies…", "theme installs
atomically…", "theme publication preserves a concurrently created symlink".

## Options

### What a bad name is

Picked: all four kinds: domain words, codebase fit, misleading or vague, and the plan's own text.

### Where the check runs

Picked: B, plan review and /review-code. Rejected: A plan only (misses names invented during the build, which is
where the dev lead's PR complaints come from); C /review-code only (renaming costs more after the code exists).

### How it is built

Picked: one naming rubric (`plugins/flows/references/naming.md`); plan review gets a fourth angle, Naming, running all
kinds; /review-code gets three lenses split by evidence (naming-domain, naming-fit, naming-meaning). Rejected: one line
in Fit and lean (lite; crowded out, and the shared tail's "No style taste" silences it); one shared rubric with a
single lens (user preferred separate lenses per angle).

### Severity and scope (grill)

Picked: misleading, `_Avoid_` word or clash with an existing name → should-fix / `fix before merge`; other evidenced
findings → consider / `worth doing`; never blocking. Naming lenses skip under `/review-code all`.

## Plan review

### Round 1 (2026-11-25): Correctness (fable), Fit (opus), Simpler (sonnet)

16 raw findings merged into 5 should-fix and 6 consider; 0 dropped; none blocking.

1. should-fix: report keeps no naming severity or bucket; `report.md:11` defines `fix before merge` as "ships
   something wrong", and Phase 4 exempts only security (Correctness 2, Fit 1).
2. should-fix: tails conflict: `lenses.md:4` "every brief ends with the shared tail" (small-diff combined agent) and
   plan review's "no style nits" still reach the naming reviewers (Correctness 1, 6; Fit 3).
3. should-fix: the evidence rule is restated in `lenses.md` and `review-code/SKILL.md` against the seam; the verifier
   never sees `naming.md` (Simpler 1b, Fit 2).
4. should-fix: no rule for a repo without a glossary; every domain noun becomes "no glossary term" (Correctness 3).
5. should-fix: spec goal 2's "private names, locals and test names" appears in no task text (Correctness 4).
6. consider: "the rubric" in `plan-review.md:10` already means the prompt tail (Correctness 5, Fit 4).
7. consider: under `pr`, which tree naming-fit searches and which glossary naming-domain reads (Correctness 7, Fit 5a).
8. consider: `docs/components/flows.md` has no plan-review section for Task 4's sentence (Fit 5b).
9. consider: description should say `naming (domain, fit, meaning)` (Fit 5c).
10. consider: Task 2 Step 3's naming.md link in build-feature SKILL.md is a second pointer (Simpler 1a).
11. consider: Task 2 Step 1 rewrites more than the count needs (Simpler 2).

User decision (2026-11-25): apply every recommendation (all 11). Plan edited: Task 1 (scope, no-glossary rule, case in
Evidence, tail precedence), Task 2 (count-only edit, "prompt tail", no SKILL link, only Naming gets naming.md), Task 3
(+report.md, `lenses.md:4` exception, `pr` sources, Phase 4 pointer and severity/bucket, description), Task 4 (docs
target). Spec: no-glossary rule and report.md added (reopens Gate 1 for those items).

Fix check (sonnet, fresh): 11/11 PASS, no neighbouring task broken. Fresh eyes not run: no decision changed the plan's
shape (same tasks and order, no new module or library).

## Tasks

All four tasks share base `7f5c6250` (`git stash create` before Task 1; untracked at start: the run folder's four
files). The tasks touch disjoint files, so one diff after Task 4 checks each against its own Files list.

- Task 1: base 7f5c6250, untracked at start: the run folder; files clean (naming.md, 52 of ~65).
- Task 2: base 7f5c6250; files clean (plan-review.md, build-feature SKILL.md; 13 of ~8, under twice).
- Task 3: base 7f5c6250; files clean (lenses.md, review-code SKILL.md, report.md; 46 of ~30, under twice; prettier
  realigned the lenses table). Adds: the three lenses, as named.
- Task 4: base 7f5c6250; files clean (README.md, docs/components/flows.md; 6 of ~6).

## Rulings

- 2026-11-25, Task 1–4: files check run once after Task 4 against the shared base, not per task — tasks touch disjoint
  files and nothing was committed between them — a per-task overrun would show only in the total if two tasks shared a
  file, which none does. (a) confirmed
- 2026-11-25, Task 3: the `pr` search sentence adds "a name from the PR quoted as SKILL.md says" — SKILL.md treats PR
  names as untrusted on a command line — costs one clause if wrong. (b) confirmed
- 2026-11-25, Task 2: the Naming row's link renders inside the table; the plan named the link, not its placement —
  cosmetic. (c) confirmed
- 2026-11-25, all: no treefmt on this Windows machine; formatted the changed Markdown with `npx prettier@3.6.2` and
  treefmt.toml's options — a different prettier version than nix's could reformat on the next treefmt run. (d) confirmed
- 2026-11-25, all: `tools/harness-compiler/src/cli.ts` shows as modified with an empty diff (line endings only), already
  after the baseline `npm test`; not this run's change, left out of every commit. (e) confirmed

- 2026-11-25, Fix 1: the run's spec, plan and flow.md keep "Fit"/`naming-fit` as the record; the shipped text is
  renamed — a reader of the run folder sees the old name. (f) confirmed

## Parking lot

Final whole-branch review (fable, fresh, 2026-11-25): ready to merge, 0 critical, 0 important, 6 minor (deferred, as
executing-plans says; all five Review Focus cases pass):

- (g, do now: done) `plugins/flows/references/naming.md:49`: scope the precedence sentence to naming findings ("For naming findings, where
  another tail …"), so the small-diff combined agent doesn't apply it to other lenses.
- (h, do now: done) `plugins/flows/skills/review-code/references/lenses.md:15`: naming-domain's trigger names no kinds of name; say prose
  alone adds no names.
- (fixed as review pick 2) `plugins/flows/skills/review-code/references/report.md:45`: the screen rule still says "ships something wrong"; make
  it "every finding whose bucket is `fix before merge`".
- (i, follow-up) `plugins/flows/references/naming.md:12`: "means something else in the glossary or spec" has no clear severity (spec
  wording).
- (j, follow-up) `plugins/flows/skills/review-code/SKILL.md:119`: under `pr`, the verifier should read glossary citations from the base.
- (k, drop) `lenses.md:4`, `review-code/SKILL.md:36`, `report.md:12`, `plan-review.md:11`: lines past 120 columns.

## Deviations

## Walkthrough

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |
| 1 Plan review checks the plan's new names | Task 2 | `plugins/flows/skills/build-feature/references/plan-review.md:20` | npm test (links, lint); prose, no behaviour test |
| 2 /review-code checks every added name from three angles | Task 3 | `plugins/flows/skills/review-code/references/lenses.md:15`, `:65` | npm test; prose |
| 3 One rubric, no restated rule | Task 1 | `plugins/flows/references/naming.md:1` | built into both packages (`.claude-plugin/flows/references/naming.md`, `.agents/plugins/flows/references/naming.md`) |
| 4 No evidence, no finding | Task 1, Task 3 | `plugins/flows/references/naming.md:28`, `plugins/flows/skills/review-code/SKILL.md:122` | prose |
| Severity and bucket kept in the report | Task 3 | `plugins/flows/skills/review-code/references/report.md:12` | prose |
| Docs true | Task 4 | `plugins/flows/README.md:11`, `docs/components/flows.md:28` | prose |

## Review

Fixed (picks 1, 2, 3; fix check PASS): kind Fit → Pattern and lens naming-fit → naming-pattern; report.md screen
rule; Naming tail in the glossary.

[docs/audits/2026-11-25-review-plan-naming-check.md](../../audits/2026-11-25-review-plan-naming-check.md).
Verdict: 2 to fix before merge. Lenses: correctness (neutral), lean, docs, naming-domain, naming-fit, naming-meaning;
skipped tests, security, risk. 6 candidates, 3 verified, 3 dropped.

## Learned

- AGENTS.md § Checks: without nix (plain Windows), format changed files with prettier and treefmt.toml's options.
- Memory (user): the user's dev lead mostly flags naming in PRs; check new names rigorously.
- Dropped: the Fit/Fit clash (the shipped naming-pattern lens now catches that class), CRLF→LF rewrites (harmless,
  git normalizes), the dcg redirect block (host tooling, one retry).

## Run verdict

worked as a whole: yes; clean: yes (the user, 2026-11-25)
