---
flow: feature
phase: done
now: 'Done: PR handed over for worktree-research-claim-voting.'
---

# Research claim voting: flow

## Request

I would like to adjust the research flow to this :)

"This" is the proposal from the conversation: copy `/deep-research`'s claim voting into Phase 2 of `/research-feature`.
Three verifiers instead of one source check, each independently checking every evidence row an option depends on; a
row needs a majority to stand; rejected rows move to a "didn't survive" list; a source no verifier could open is marked
`unverified`; plain subagents and web-mcp; `/build-feature`'s check is left alone.

## Artifacts

- Prior art: [prior-art.md](prior-art.md)

- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs:
- Glossary:

## Gates

- Gate 1, spec approved: 2026-11-09. Reopened 2026-11-09: plan review changed the vote's model naming, tally inputs, quoting and `n/m` column; the owner approved these fixes the same day.
- Gate 2, plan approved: 2026-11-09, execution: native
- Gate 3, review-code report: 2026-11-09
- Gate 4, decisions: 2026-11-09

## Skipped

- Review tests lens: the diff is prompt text only.
- Review security and risk lenses: no code input, network or wire-format change.
- Built-in `code-review`: its scope excludes the untracked run folder; the correctness lens took its neutral brief.
- A real `/research-feature` run: no verifiers were started, and the tally was read, never performed.

All four accepted by the owner, 2026-11-09.

## Grounding

Read, not run. Base: `origin/main` b42ef737 is four commits ahead of local `main`; none touch this subsystem except
`templates/codex.ts` (one line) and the diagrams lockfile.

- The source check is one text, `plugins/flows/skills/build-feature/references/prior-art.md:38-54`, reached only through
  `plugins/flows/steps/prior-art.toml:8-9`. Its users are `/build-feature` (`SKILL.md:51`) and `/research-feature`
  (`SKILL.md:66`). Changing it changes both, and no build check notices.
- `/research-feature` already adapts it in prose (`SKILL.md:71-74`): one check over `prior-art.md` and `literature.md`.
  Steps take no parameters, so a research-only rule belongs in that prose.
- Evidence columns are prose only: `literature.md:26`, repeated at `SKILL.md:97`, which omits the source-check result that
  `SKILL.md:77` requires in flow.md. Nothing reads the columns: `/build-feature` reads the report as a whole, and
  `scripts/flows-uses.mjs:150-157` pins only `now:`, the gate line and `Picked:`.
- Timing: Phase 2 writes the evidence table, but options first exist in Phase 3 (`SKILL.md:84-87`). "Rows an option
  depends on" is not known at Phase 2.
- Host rules: no `AskUserQuestion`, `WebFetch`, `haiku|sonnet|opus|fable` or the like in flows' own text (`CLAUDE_ONLY`,
  `compose.ts:28-37`); use `{{model:*}}` tokens, which on Codex all mean the session's model (`codex.ts:9`). Text under a
  `## Phase` isn't in the 4,500-token budget (`compose.ts:367-375`).
- No subagents: `SKILL.md:68-69` skips the check, records it under **Skipped**, every row reads `not checked`.
- Describes this behaviour: `plugins/flows/README.md:11`, `research-template.md:45,49`, `run-rules.toml:16,33`. No test
  pins the check's content. No real `research.md` exists in the repo to compare with.
- ADR 0005 asks for few agents, combined where sensible, each on a fitting model.

## Prior art

[prior-art.md](prior-art.md). Source check, on a different model: 38 confirmed, 6 not supported (corrected), 0 couldn't
open; of 9 inferred claims 2 follow, 5 partly, 2 don't (fixed).

Three approaches: one isolated verifier per claim (SAFE, Databricks agent, CoVe factored); a per-claim panel with a vote
(`/deep-research`, the workflow-authoring example); one verifier over a batch (VeriFastScore, EAVer). Nothing measures
same-model verifiers on claim checking. Errors correlate across models, and mixed model families did better in the
judging and team studies found.

Measured in this run: the one source check took 193,953 tokens and 23 tool calls for 53 claims, and found 6 unsupported
and 2 non-following claims. Three such verifiers would cost about 580,000 tokens at that rate.

## Findings

## Options

### How to combine the source check with claim voting

Picked: B, keep today's source check as the first vote and add two verifiers on different models for the rows the
candidate options rest on, with two of three deciding.

Offered: A, one second opinion (smallest, no tiebreak); B, recommended, because it spends votes where a wrong fact
changes the decision; C, three verifiers on all rows in Phase 2 (about 390,000 extra tokens). The owner's reason:
combining both should give a better result; no specific past failure.

## Plan review

### Plan review round 1

Three reviewers (Correctness, Fit, Simpler). 19 findings, merged to 7 should-fix and 5 consider; none blocking, none dropped.

Should-fix, all applied by the owner's decision of 2026-11-09: (1) tally table written into `claim-vote.md`, not pointed at `spec.md`; (2) first vote defined for corrected and `[inferred]` rows; (3) verifiers named by `{{model:strongest}}` and `{{model:other}}`; (4) drafts saved and voted rows not re-voted on resume; (5) `[step: smallest-option]` moved before the vote; (6) DOIs and arXiv ids written as full URLs (a reviewer ran `fetch` on a bare DOI and it was rejected); (7) every `not supported` quoted.

Consider, applied: `n/m confirmed`; E-number kept and evidence table overrides search reports; wait for both verifiers; template punctuation; text-search checks and the zero-rows branch dropped, long-batch degradation accepted in the spec.

Left unchanged: one merged `checked` column; vote still runs on one-model hosts (owner's earlier decision).

Fix check (fresh agent): all 8 finding groups PASS, every replacement string exists once. It raised 6 small gaps, closed
in the plan and spec: unrewritten "partly follows" is no vote; a blockquoted step line wouldn't compose, so it is now
fenced; the three-votes goal and left-out rows reworded; `not voted` rows aren't re-voted on resume; drafts follow the
template's `### <decision>` shape; quotes go below the evidence table; the model tokens are in Global Constraints.

Fit reviewer's trial build on a scratch copy of `origin/main`, before these fixes: `npm run build:harnesses` and `check-repo` exit 0, `scripts/flows-uses.test.mjs` 43 of 43.

## Tasks

Baseline on b42ef737, `npm test` in `nix develop`: exit 0, no failures.

Task 1: base b42ef737, untracked at start: docs/features/research-claim-voting/; files clean (43 lines of ~55, adds `claim-vote.md`)

Task 2: base 420bbc63, untracked at start: docs/features/research-claim-voting/; files clean (30 lines of ~18, under twice the estimate; adds nothing)

Full suite after Task 2, `npm test` in `nix develop`: exit 0, no failures.

Fix 1, 2, 3, 4, 5, 6, 7, 9: base 29ef1dbc, untracked at start: docs/audits/2026-11-09-review-research-claim-voting.md, docs/features/research-claim-voting/

## Rulings

2026-11-09, Task 1: `{{model:strongest}}` and `{{model:other}}` read as "the session's model" twice on Codex; kept as written — the host tokens are the convention and the report line covers it — a slightly awkward sentence in Codex's built text. Confirmed.
2026-11-09, Execute: executing-plans' final review is folded into `/review-code` at Finish, not run separately — run-rules ask to combine checks and the gate named that review — a reviewer reads the branch once, not twice. Confirmed.
2026-11-09, Execute: the prompt-text tasks ran without TDD's failing-test step — the builder brief gives prose no tests — nothing but the build and the review checks the wording. Confirmed.
2026-11-09, Fix 2: an arXiv id links to `/pdf/<id>` instead of telling the verifier to follow the PDF link — `fetch` returned the whole paper from that URL (measured) — a row already citing `/abs/` loses a vote through `couldn't open`. Confirmed.
2026-11-09, Fix 5: `n/m confirmed` is limited to a row that stands, after the fix check showed a one-vote row could read `1/1 confirmed` — the tally table already says `unverified` there — one more clause in the Apply section. Confirmed.

## Parking lot

- `tools/web-mcp/src/fetch.rs:23`: `Accept` puts `text/markdown` first, so doi.org answers HTTP 406 on Crossref DOIs, in Phase 2's source check as well. A follow-up.
- `plugins/flows/skills/build-feature/references/prior-art.md:38-54`: the shared source check has the claim vote's old gap: a page showing only an abstract can count against a claim. Fix through `writing-skills`. A follow-up.

## Deviations

## Walkthrough

| goal                                                            | plan task      | file:line                                                                                                                        | test                                 |
| --------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| A row an option rests on gets the vote before the owner sees it | Task 2         | `plugins/flows/skills/research-feature/SKILL.md:84-96`                                                                           | build only; prompt text gets no test |
| Two verifiers, independent, on different models where offered   | Task 1         | `plugins/flows/skills/research-feature/references/claim-vote.md:6-16`                                                            | build only; both built copies read   |
| An unopenable source is `unverified`, never refuted             | Task 1         | `plugins/flows/skills/research-feature/references/claim-vote.md:18-31`                                                           | none; final review reads it          |
| A report shows which rows lost, and why                         | Task 1, Task 2 | `plugins/flows/skills/research-feature/references/claim-vote.md:33-43`, `plugins/flows/skills/research-feature/SKILL.md:107-109` | none; final review reads it          |

## Review

[Audit report](../../audits/2026-11-09-review-research-claim-voting.md): 15 verified findings, 4 to fix before merge; 4 candidates dropped. Picked 1-7 and 9; all eight passed the fix check. Left, by the owner's pick: 8, 10-15. Checks after the fixes: `npm test` in `nix develop`, no failures; `treefmt` on both skill files changed nothing.

## Learned

- Memory: `subagent-reports-truncated.md` (how to recover a report the trim hook cut short).
- Parking lot: `fetch.rs` and the shared source check, one line each.

## Run verdict

Worked as a whole: yes; clean: yes.
