# Naming review Implementation Plan

<!-- glance -->
```
Plan: Naming review · 4 tasks · ~109 lines · 8 files
 1  [1 The naming rubric]
 2  [2 Plan review's Naming an… ←1]  [3 /review-code's naming l… ←1]
 3  [4 Docs ←2,3]

#  does                                                          files  adds                            size
1  Writes the one file that says what a bad new name is and wh…  1      `plugins/flows/references/nam…  ~65
2  Adds a fourth reviewer to plan review that checks the plan'…  2      nothing new                     ~8
3  Adds three lenses to `/review-code` that check every new na…  3      lenses `naming-domain`, `nami…  ~30
4  Makes the flows README and component doc mention the naming…  2      nothing new                     ~6
```
<!-- /glance -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan review and `/review-code` check the names a change adds, from one shared naming rubric.

**Architecture:** A new reference, `plugins/flows/references/naming.md`, holds the rules. `plan-review.md` gains a
fourth angle, Naming, and `lenses.md` gains three lenses (naming-domain, naming-fit, naming-meaning); both only point
to the rubric and say which kinds a reviewer runs. All prose; the harness compiler copies it into both packages.

**Tech Stack:** Markdown conductor text, `{{model:*}}` host tokens, `npm run build:harnesses`, `npm test`.

**Spec:** [spec.md](spec.md)

## Global Constraints

- naming rules: resolved in `plugins/flows/references/naming.md`; never seen by `plan-review.md`, `lenses.md`,
  `review-code/SKILL.md` (they point to the rubric and name which kinds a reviewer runs, never restate a rule).
- One implementation gets no interface; one caller gets no helper; no option nobody sets.
- Stack: Markdown conductor text only; no stack pack from `stack-packs.md` applies.
- Keep Claude-only names out of flows text (`harness-compiler lint`); model choice goes through `{{model:standard}}`,
  `{{model:strongest}}`, `{{model:other}}` only.
- Severity, verbatim from the spec: Naming is never **blocking**. A misleading name (Meaning), an `_Avoid_` word, or a
  clash with an existing name that means something else is **should-fix** in plan review and `med`, bucket
  `fix before merge`, in `/review-code`. Any other evidenced finding is **consider** in plan review and `low`, bucket
  `worth doing`, in `/review-code`.
- Naming lenses don't run under `/review-code all`.
- Paths inside a reference resolve relative to that reference's own folder.

## Review Focus

1. A repo with no `GLOSSARY.md`: naming-domain is skipped (unless the run has a spec) and the report's Lenses line
   says why; the plan's Naming angle runs without it.
2. A small diff: the three naming lenses join the combined agent, they don't start three agents.
3. A diff that adds no names (a doc edit, a version bump): no naming lens runs.
4. A naming finding with no citation is dropped by the verifier, not downgraded to a nit.
5. `/review-code all`: no naming lens runs and the Lenses line says so.

## Test seams

- `npm test` (check-repo: build, `harness-compiler lint` and `validate`, `flows-uses` path and shape checks): catches a
  broken relative link to `naming.md`, Claude-only wording, an unknown `{{token}}`; misses whether the prose says the
  right thing.
- `npm run build:harnesses` then reading `.claude-plugin/flows/` and `.agents/plugins/flows/`: catches that
  `naming.md` ships in both packages with its tokens replaced; misses behaviour.

No new automated tests: every change is prose (the builder brief's Tests rule: prose gets none).

---

### Task 1: The naming rubric

**Does:** Writes the one file that says what a bad new name is and what a naming finding must show.
**Depends on:** none
**Adds:** `plugins/flows/references/naming.md`
**Size:** ~65

**Files:**

- Create: `plugins/flows/references/naming.md`

- [ ] **Step 1: Write `naming.md`** with these sections, in this order, wording from the spec's "The rubric":
  - `# Naming` and one paragraph: what it is for, who reads it (plan review's Naming angle, `/review-code`'s naming
    lenses, the `/review-code` verifier), and **Scope**: every name the change adds or renames, private names, locals
    and test names included; existing names are out of scope.
  - `## Kinds`: the four kinds (Domain, Fit, Meaning, Plan text), each as a heading-less bold item with what to check
    against and what a finding cites (the spec's table). Domain reads `GLOSSARY.md`, or the file `GLOSSARY-MAP.md`
    points at, plus the spec; with no glossary it checks against the spec only, and "no glossary term" is raised only
    where a glossary exists. Fit searches the repo for the names near it and for the same name used elsewhere. Meaning
    reads the code behind the name (in plan review: the task's steps). Plan text is plan review only.
  - `## Evidence`: every finding cites one of the above and proposes one or two better names; its concrete case is that
    evidence plus what a reader gets wrong with the current name; no citation, no finding; taste alone is dropped, not
    downgraded.
  - `## Severity`: the Global Constraints' severity sentence, verbatim.
  - `## Naming tail`: a fenced block replacing `/review-code`'s shared tail for naming lenses and appended to plan
    review's tail for its Naming angle: "Review only the kinds you were given, on names this change adds or renames,
    private names, locals and test names included. Each finding: the name, its `file:line` (or plan task), the kind,
    the evidence (the glossary line, the clashing name with `file:line`, or the code line that does something else),
    what a reader gets wrong with the current name, one or two proposed names, and the severity from naming.md. No
    evidence, no finding. Where another tail in your prompt differs, this one holds: an evidenced naming finding is not
    a style nit and is never blocking. No praise, no summary. 'No findings' is a valid answer."
- [ ] **Step 2: Verify** `npm run build:harnesses` exits 0 and
      `.claude-plugin/flows/references/naming.md` and `.agents/plugins/flows/references/naming.md` exist.

### Task 2: Plan review's Naming angle

**Does:** Adds a fourth reviewer to plan review that checks the plan's new names against the rubric.
**Depends on:** Task 1
**Adds:** nothing new
**Size:** ~8

**Files:**

- Modify: `plugins/flows/skills/build-feature/references/plan-review.md`
- Modify: `plugins/flows/skills/build-feature/SKILL.md`

- [ ] **Step 1: In `plan-review.md` § Reviewers**, change "Spawn 2–3 fresh subagents" to "Spawn four fresh
      subagents", "and the rubric" to "and the prompt tail below", and after "one angle per model where the host offers
      more than one" add "(with four angles one model runs two, each still a fresh agent)"; "Simpler included" becomes
      "Simpler and Naming included". Nothing else in the paragraph changes.
- [ ] **Step 2: Add the table row** **Naming**: `[naming.md](../../../references/naming.md)`, all four kinds, on every
      name in the plan's `**Adds:**` lines, the task headings, the run's slug and the names the steps use for things.
      Below the table, one line: only the Naming reviewer gets `naming.md`, plus `GLOSSARY.md` (or the file
      `GLOSSARY-MAP.md` points at) when the repo has one, and it ends its prompt with naming.md's **Naming tail** after
      the shared tail.
- [ ] **Step 3: In `build-feature/SKILL.md` Phase 5**, change "2–3 reviewer subagents with different angles" to "four
      reviewer subagents with different angles". No link to `naming.md` here.
- [ ] **Step 4: Verify** `npm test` passes (links resolve, lint clean).

### Task 3: /review-code's naming lenses

**Does:** Adds three lenses to `/review-code` that check every new name in a diff from one angle each.
**Depends on:** Task 1
**Adds:** lenses `naming-domain`, `naming-fit`, `naming-meaning`
**Size:** ~30

**Files:**

- Modify: `plugins/flows/skills/review-code/references/lenses.md`
- Modify: `plugins/flows/skills/review-code/SKILL.md`
- Modify: `plugins/flows/skills/review-code/references/report.md`

- [ ] **Step 1: Table rows** in `lenses.md`, model `{{model:standard}}` each:
  - naming-domain: the diff adds or renames names, and the repo has a glossary or the run has a spec
  - naming-fit: the diff adds or renames names (source, tests, files, config keys, flags)
  - naming-meaning: the diff adds or renames names in source or tests
- [ ] **Step 2: Brief** `**naming-domain, naming-fit, naming-meaning.**`: each follows
      `[naming.md](../../../references/naming.md)` for its one kind (Domain, Fit, Meaning), on the names the diff adds or
      renames; naming-domain also gets the glossary (or the file `GLOSSARY-MAP.md` points at) and the spec. Each ends
      with naming.md's **Naming tail** in place of the shared tail. Under `pr`: the glossary and conventions are read
      from the base, names are searched with `git grep <head sha>`, and naming-fit is skipped (recorded) when the head
      couldn't be fetched. No rule from naming.md is restated here.
- [ ] **Step 3: `lenses.md:4`**: "Every brief ends with the shared tail below" gets ", except the naming lenses, which
      end with naming.md's Naming tail; in the small-diff combined agent each tail governs only its own briefs".
- [ ] **Step 4: Under `## \`all\``**, one sentence: the naming lenses don't run under `all`; the Lenses line lists them
      as skipped (no change to judge).
- [ ] **Step 5: Phase 4 in `review-code/SKILL.md`**: the verifier also gets `naming.md` when a naming candidate exists;
      "Security and security-domain findings keep their own severity." becomes "Security and security-domain findings
      keep their own severity; naming findings take their case from naming.md § Evidence and keep the severity and
      bucket of naming.md § Severity." The independence line (lens inputs) adds "and, for naming-domain, the glossary".
- [ ] **Step 6: `report.md:11-12`**: the bucket definition "`fix before merge` (it ships something wrong)" becomes
      "(it ships something wrong, or naming.md puts it there)".
- [ ] **Step 7: The description** in `review-code/SKILL.md` frontmatter: the lens list becomes
      `(correctness, lean and spec, tests, docs, security, risk, naming: domain, fit, meaning)`.
- [ ] **Step 8: Verify** `npm test` passes.

### Task 4: Docs

**Does:** Makes the flows README and component doc mention the naming checks.
**Depends on:** Task 2, Task 3
**Adds:** nothing new
**Size:** ~6

**Files:**

- Modify: `plugins/flows/README.md`
- Modify: `docs/components/flows.md`

- [ ] **Step 1: `plugins/flows/README.md`**, the `/review-code` row: add `naming (domain, fit, meaning)` to the lens
      list; if the `/build-feature` row lists plan review's angles, add Naming there.
- [ ] **Step 2: `docs/components/flows.md` § /review-code** (it has no plan-review section; the README row carries
      plan review): one sentence: plan review's Naming angle and the three naming lenses read `references/naming.md`, the only place the naming rules live; the lenses skip under `all`.
- [ ] **Step 3: Verify** `npm test` passes and `git status --short` shows only the plan's files, the run folder and
      `GLOSSARY.md` (changed in Phase 3).
