---
flow: feature
phase: done
now: "Done: PR handed over for t3/d3d91289."
---

# T3 Code PR prompt: flow

## Request

Hey, would it be possible to have the same pr prompt like t3code?

## Artifacts

- Prior art: [prior-art.md](prior-art.md)

- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs:
- Glossary:

## Gates

- Gate 1, spec approved: 2026-11-25 Reopened 2026-11-25: plan review finding 2 names the PR template locations in the spec. 2026-11-25
- Gate 2, plan approved: 2026-11-25, execution: native
- Gate 3, review-code: report: 2026-11-25
- Gate 4, decide: 2026-11-25

## Skipped

- pstack `interrogate` at /review-code: skipped by the user. Accepted 2026-11-25.
- /review-code tests, security and risk lenses: not applicable to a prose-only step. Accepted 2026-11-25.
- EPERM failures: matched to the recorded machine baseline, not re-run on the merge-base. Accepted 2026-11-25.
- Diagrams: both gate pages shown as a file path; T3's inline renderer rejected them (Parking lot 5).

## Grounding

- The PR body rules live once, in `plugins/flows/steps/close.toml` (**Push and PR**): body sections why / what
  changed (opening with a small picture) / blast radius with a **Door** line / verification; a gate shows title,
  body and closing commit; the user runs `git push -u` and `gh pr create --title --body-file` (verified).
- `[step: close]` is composed into six conductors: build-feature, fix, implement, refactor, upgrade, review-code
  (verified: `plugins/flows/skills/*/SKILL.md`). One edit to close.toml changes all of them (ADR 0011).
- Host wording comes from tokens in `tools/harness-compiler/src/templates/hosts/{claude-code,codex}.ts`
  (`user-runs`, `watch-checks`); close.toml must stay free of Claude-only names (`harness-compiler lint`).
- close.toml carries two `overrides` markers quoting superpowers' `finishing-a-development-branch`; check-repo fails
  if the quoted sentences vanish.
- GLOSSARY.md has no PR terms; no ADR covers PR bodies.

## Prior art

- [prior-art.md](prior-art.md). T3 Code's `buildPrContentPrompt` asks a one-shot model call for JSON `{title, body}`:
  title "concise and specific"; body `## Summary` (short bullets) and `## Testing` (concrete checks or "Not run");
  a repository PR template, when present, replaces those headings. No local paths or attachment links in the body.
- Approaches: A one-shot call over a pre-built diff (T3, Copilot); B in-session agent writes it (Claude
  commit-push-pr; what close.toml does now); C commit-derived (`gh pr create --fill`).
- Source check: 41 claims; 33 confirmed, 4 partly supported, 2 not supported, 0 couldn't open; 1 inferred trade-off contradicted. Report corrected.
- User (brainstorm): wants T3's PR text, "basically everything" about it (shorter, layout, title, consistency).

## Findings

## Options

### How the Close step writes the PR

Picked: T3 Code's title and body rules, written by the session itself; picture, blast radius and Door dropped.

- Offered: T3's rules in-session (recommended, picked); T3's rules plus a Door line; `gh pr create --fill` (smallest).
- Grill (my calls, in the spec): Testing lists the run's real check commands or `Not run`; template found by the session, no paths named; T3's commit prompt, JSON call, truncation and attribution out of scope; no glossary terms or ADR (reversible, one file).

## Plan review

Round 1 (correctness+fit on opus, simpler on sonnet; Correctness and Fit combined in one agent for a one-task plan):

1. should-fix: `flows-uses.mjs` rewrites `plugins/catalog.json` (format-only). Decided: restore it and `plugins/flows/plugin.json` after the script. Plan step 3 edited.
2. should-fix: template rule names no location. Decided: name root, `docs/`, `.github/` (verified: GitHub docs, creating-a-pull-request-template) and a `PULL_REQUEST_TEMPLATE/` folder rule. Plan step 1 and spec edited.
3. consider: /implement loses blast-radius from its uses tree. Decided: apply; plan says the README diff is that one line.
4. consider: step 3 built twice. Decided: apply; extra build dropped.

- Simpler: no findings. Dropped: none.
- Fix check (sonnet): findings 1 and 2 PASS; single build PASS.

## Tasks

Fix 1 (review finding 1): files clean (close.toml, spec.md); spec line changed to match the user's pick at Gate 3.

Task 2: base = Task 1 + Fix 1 tree, untracked at start: the run docs and the audit; files clean (close.toml, spec.md); size 6 of ~6; adds nothing new.

Task 1: base 43678415, untracked at start: docs/features/t3code-pr-prompt/ (4 files); files clean (close.toml, README.md); size 15 of ~20; adds nothing new.

Final review (executing-plans, opus): no Critical or Important; 4 Minor (Parking lot 1-3; the 4th was this flow.md lagging, fixed).

## Rulings

- 2026-11-25, Task 1: kept the executor's ledger in flow.md instead of an sdd workspace — one task, flow.md already records it — a resumed session finds no ledger, only flow.md. Confirmed.
- 2026-11-25, Task 1: ran `npm ci` (fresh worktree had no node_modules) and restored `tools/harness-compiler/src/cli.ts`, which it left with a line-ending-only change — no content change — none. Confirmed.
- 2026-11-25, Task 1: prettier rewrote the regenerated README's line endings only — content diff stays the one implement line — none. Confirmed.

## Parking lot

1. `plugins/flows/steps/close.toml`: Testing should point at Decide's **Checks** row and **Skipped** rows (`Not run: <check>` per Skipped row), not "its last check run" (final review Minor 1). Do now: Task 2, done.
2. `plugins/flows/steps/close.toml`: "name it at the gate" → "at the PR gate below" (Minor 2). Do now: Task 2, done.
3. `plugins/flows/steps/close.toml` + spec: a `PULL_REQUEST_TEMPLATE/` folder with one template, or a file plus a folder, has no rule (Minor 3). Same as /review-code finding 1; decided there.
4. `scripts/flows-uses.mjs` (`writeDeps`): rewrites `plugins/catalog.json` and `plugins/flows/plugin.json` with `JSON.stringify` even when the dependencies are unchanged, leaving a format-only diff (+105/−28 on catalog.json) that every run must undo by hand; write only on a change, or in prettier's shape. A check: a `flows-uses.test.mjs` case that fails on today's catalog when the deps are unchanged (/learn). Follow-up.
5. `plugins/flows/skills/diagrams/scripts/render.mjs`: the gate page uses `70vh`, which T3 Code's inline HTML renderer rejects, so on T3 both gates fell back to a printed path; use fixed pixel heights (/learn). Follow-up.

## Deviations

## Walkthrough

| goal                                                                      | plan task     | file:line                                                      | test                                |
| ------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------- | ----------------------------------- |
| Title concise and specific                                                | Task 1        | plugins/flows/steps/close.toml:27                              | prose: none; npm test (composition) |
| Body Summary/Testing without a template                                   | Task 1        | plugins/flows/steps/close.toml:31-33                           | prose: none; npm test               |
| Body follows a PR template (file or folder)                               | Task 1, Fix 1 | plugins/flows/steps/close.toml:28-31                           | prose: none; fix check walkthrough  |
| No local paths, embeds, attachment links                                  | Task 1        | plugins/flows/steps/close.toml:34                              | prose: none                         |
| Picture / blast radius / Door gone, in all six conductors, both harnesses | Task 1        | plugins/flows/steps/close.toml:2-5, plugins/flows/README.md:67 | grep of built output; npm test      |

## Review

Verdict: 1 to fix before merge, fixed (finding 1: folder-only PR templates fell through; fix check PASS). Audit: [docs/audits/2026-11-25-review-t3code-pr-prompt.md](../../audits/2026-11-25-review-t3code-pr-prompt.md). Lenses combined; tests/security/risk not applicable; interrogate skipped by the user.

## Learned

Nothing written: two lessons, both a script or skill fix, so Parking lot 4 and 5.

## Run verdict

Worked as a whole: yes; clean: yes (2026-11-25).
