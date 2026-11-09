---
flow: feature
phase: done
now: 'Done: PR handed over for worktree-evaluate-conductor.'
---

# /evaluate conductor: flow

## Request

Hey, could we build a **3. A lightweight `/evaluate <url>` conductor (small).** You keep asking "is X useful here?", and those runs go through the feature flow and stall: Symposium and Strix at brainstorm, Petri at grounding. It would run prior art and a source check, then end on adopt, try or skip in one page.

## Artifacts

- Prior art: docs/features/evaluate-conductor/prior-art.md

- Spec: docs/features/evaluate-conductor/spec.md
- Plan: docs/features/evaluate-conductor/plan.md
- ADRs: none (easy to reverse)
- Glossary: Evaluation page, Verdict (added on the build branch; the working GLOSSARY.md holds unrelated uncommitted entries)

## Gates

- Gate 1, spec approved: 2026-11-09. Reopened 2026-11-09: plan review changed when the prior-art agent starts, the adopt rule and the tool-facts rules.
- Gate 2, plan approved: 2026-11-09, execution: native
- Gate 3, review-code: report picks: 2026-11-09 (all 16)

## Skipped

- Review: tests lens: no source or test changed. Accepted by the user 2026-11-09.
- Review: risk lens: no migration, wire format or changed interface. Accepted by the user 2026-11-09.
- Review: pstack `interrogate`: offered, declined by the user on 2026-11-09. Accepted by the user 2026-11-09.
- A repeat run on an existing page: not exercised (the plan says so). Accepted by the user 2026-11-09.
- An article naming no tool: not exercised (the plan says so). Accepted by the user 2026-11-09.
- A prior-art agent that ends without its report: not exercised. Accepted by the user 2026-11-09.
- A live run against a non-public link: the rule is checked by reading only. Accepted by the user 2026-11-09.
- Codex's built conductor: read, not run (the plan's seams exclude Codex). Accepted by the user 2026-11-09.

## Grounding

`pstack-picks:how` ran as one explainer agent (simple path); the citations below marked read were opened by the main session.

- A conductor is one `plugins/flows/skills/<name>/SKILL.md` with `disable-model-invocation: true` (read: `tools/harness-compiler/src/flows/compose.ts:71-75`). Nothing registers it by name; the compiler and `scripts/flows-uses.mjs` find it by scanning (agent report).
- Phase table comes from `## Phase N: Word` headings and a `<!-- runs: … · output: … -->` comment; `[step: run-rules]` is mandatory; steps carrying `writes` force a `template:` with those sections (read: `steps/prior-art.toml` writes `Skipped`; rest agent report).
- Two record models exist: `/research-feature` keeps `docs/features/<slug>/flow.md` from a template (read at origin/main); `/understand` keeps only a scratch file outside the repo and says "the scratch file stands in" (read: `plugins/flows/skills/understand/SKILL.md:32-35`).
- `steps/prior-art.toml` and `skills/build-feature/references/prior-art.md` already give the prior-art agent and its source check; the prompt is feature-shaped, and `/research-feature` reuses it by saying the question takes the feature's place (read).
- A new conductor touches: its SKILL.md (and template, if it keeps a flow.md), `plugins/flows/README.md`'s table, `AGENTS.md`'s conductor list, `plugins/flows/plugin.json`'s description; `scripts/flows-uses.mjs` regenerates the uses tree and dependencies (agent report, not yet run).
- Name: `evaluate` is also build-feature's Phase 5 key (read: `flow-template.md:6`). It is a `phase:` value, not a `flow:` value, so `start.toml`'s match on `flow:` doesn't clash (read: `steps/start.toml`).
- Local `main` is one commit behind `origin/main` (`32b4956f`, claim vote in `/research-feature`), and the working tree holds other runs' uncommitted work: the build branches from `origin/main`.
- Why the three runs stalled (read their flow.md files): Strix waits on "say what you want Strix for" (`phase: brainstorm`); Symposium's follow-up came after the user said they expected Rust crate docs from it; Petri had its purpose settled and was waiting for a report that never got its source check (`phase: ground`). None reached a verdict.

## Prior art

Report: [prior-art.md](prior-art.md). Source check: 20 confirmed, 3 not supported (corrected), 0 couldn't open; 13 inferred claims: 5 follow, 3 partly, 5 don't (corrected or relabelled as proposals).

- Approaches: ring radar (ThoughtWorks, Zalando); evidence checklist (Scorecard, Cox); gate with a recorded audit (cargo-vet); decision record (MADR). No agent skill producing an adoption verdict was found (search coverage thin).
- Bears on the scale: ThoughtWorks gives Trial only with production experience, and reading alone reaches Assess at most. So "adopt" from reading alone is an unearned verdict by that rule. Reading "try" as "use it here" is our proposal, not the source's.
- Cox's by-hand questions are the only source that reaches fit with one codebase, and they suit one developer deciding.

## Findings

Fixed 2026-11-09: 1 (within the limit recorded under Deviations)
Fixed 2026-11-09: 2
Fixed 2026-11-09: 3
Fixed 2026-11-09: 4
Fixed 2026-11-09: 5
Fixed 2026-11-09: 6
Fixed 2026-11-09: 7
Fixed 2026-11-09: 8
Fixed 2026-11-09: 9
Fixed 2026-11-09: 10
Fixed 2026-11-09: 11
Fixed 2026-11-09: 12
Fixed 2026-11-09: 13
Fixed 2026-11-09: 14
Fixed 2026-11-09: 15
Fixed 2026-11-09: 16

## Options

### Grilled decisions

Picked: all six recommended answers (2026-11-09): a tool's name works in place of a URL; "already have" covers code, manifests and visible agent plugins and skills; a repeat run replaces the page and keeps the old verdict and date in one line; an unknown licence or a skipped or failed source check on what an adopt rests on caps it at try; the page goes in `docs/features/evaluate-<tool>/` uncommitted, in any project; the two terms go into GLOSSARY.md on the build branch, with no ADR.

### The run's shape and record

Picked: runs straight through with no stops and writes one page (`evaluation.md` in the run folder), with no flow.md and no gate.

Offered: A one page, no stops (recommended: stopping is what stalled the earlier runs); B full flow.md, approval gate, /learn and a commit, like /research-feature; C the smallest, verdict in the chat only, nothing saved in the project.

### What the verdicts mean

Picked: adopt = add it now (fills a real gap, nothing here covers it, released and maintained, licence fine; the page says it was not tried, and anything depending on it actually working goes to try); try = useful but reading can't settle it (the page names one small experiment and the result that would mean adopt); skip = doesn't fit, duplicates, or too risky (reason, and what would change it). Reading only: the run never installs or runs the tool. An article resolves to its main tool, others listed in one line.

### Where the purpose comes from

Picked: the run works out the likeliest use from the current project and states it as an assumption on the page; it never stops to ask.

The user's reason: "Sometimes I just see an article read it, find the tool instesteing but dont know if I should add it to a project". So the input can be an article, not only the tool's own repo, and the project is whichever one the run starts in.

## Plan review

### Round 1 (2026-11-09; Correctness on opus, Fit on sonnet, Simpler on fable)

No blocking findings; none dropped. Reviewers' cited lines spot-checked (`compose.ts:201`, `steps/prior-art.toml`, `targets/codex.ts:16-18`).

Should-fix: "Don't wait" in the prior-art step against the run's single phase with nothing else to do; built conductor never names the template; adoption facts can bypass the source check; "failed source check" invisible after the report is corrected; the Bloom article doesn't evaluate Petri Bloom (Meridian's project) and expects the wrong folder; an ambiguous name (`Strix`) has no handling; verdict rules not pinned by the runs; assumed-purpose seam has no guard against the report; "no project" undefined and untested; repeat-run replacement in the wrong phase, and `<slug>` unbound to `evaluate-<tool>`.

User's decisions (2026-11-09): narrow rule 1 so adopt stays reachable, and give adopt a "what would make it a skip later" line; four test runs with the article first, plus stop cases and a seeded verdict check; accept all the other fixes. Spec changed: the prior-art agent starts alongside grounding (Phase 1), adopt rule, tool facts in the report, `<slug>` binding, "Also named", repeat-run timing, Adoption verdict term.

Fix check (sonnet): 9 of 10 PASS, the verdict-rule test FAIL; seeded check rebuilt (adopt baseline, one changed input per case, a fresh agent); recheck PASS. Fresh-eyes round not needed: task order, modules and libraries unchanged.

Consider: rule 1 may leave adopt unreachable; suggested next command has no reader; descriptions claim gates; `Verdict` collides with `Run verdict`; skill scan not in the checks; 800-word prompt cap; a slot for other tools named; the run primed by the plan; `.web/` litter; `why` needn't run; check the first page before running the rest.

## Tasks

Task 1: base 32b4956f16dfbfe7f420a51fedbf6dfecbd24152, untracked at start: the run folder; files clean (size 193 of ~180). Build exit 0; `npm test` exit 0, 0 fails; skill scan (`uvx`) OK, no high or critical finding; Codex `allow_implicit_invocation: false` (measured).
Task 2: base 28c40972587d983de116cea70c1cf59bd06fad14, untracked at start: the run folder. Stop cases: one line, no folder (measured: `example.invalid` fetch failed; the empty folder is no Git root and has no manifest). Pages (measured: seven headings each, 358 to 374 words, no question to the user, purpose absent from each `prior-art.md`): Bloom skip, Symposium try, Petri Bloom try, Strix skip (name resolved to `usestrix/strix`, Strix Advanced Tools rejected). Source checks: Bloom 37/3/0, Symposium 23/2/0, Petri Bloom 32/6/0, Strix 29/5/0. No change to `SKILL.md` or the template was needed. Files clean: the worktree differs from the base only by the four `docs/features/evaluate-*` folders the task lists. Petri Bloom reused Bloom's grounding (same question, same repository), recorded on its page. Seeded verdict check, one fresh agent on the built Phase 3 and five seeded cases: csvkite adopt; parsewell (licence unknown), quillcsv (release not supported), rowsmith (check skipped) and tabline (rests on a trial) all try. Five of five as expected.
Fix 1: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: the audit file and the run folders; files clean.
Fix 2: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean. Also adds the outside mention to the report's tool facts and the page's Evidence, so the rule has an input.
Fix 3: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 4: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 5: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 6: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 7: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 8: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 9: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 10: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 11: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 12: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 13: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 14: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 15: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Fix 16: base 1d87348e6f115b1061da897aba88875835de26da, untracked at start: as Fix 1; files clean.
Task 3: base 3eb4b97b7cc613d24c6af21081b7d6a5fd13c012, untracked at start: the audit file and the run folders; files clean.

## Rulings

2026-11-09, Task 1: no failing test first, and test-driven-development not loaded — this task is prose and generated lists, which the builder brief's **Tests** exempts — a behaviour defect shows up only in Task 2's runs. confirmed
2026-11-09, Task 2: Petri Bloom's page reuses the Bloom run's grounding — same question about the same repository, and the page says so — a fresher grounding might have named one more thing the project has. confirmed
2026-11-09, Final: repeat run and an article naming no tool stay not checked — the plan says so; the text is there — a defect there shows only on first use. confirmed
2026-11-09, Final: Codex's built conductor is read, not run — the plan's seams exclude Codex — a Codex-only wording defect would ship. confirmed
2026-11-09, Final: the four verdicts' judgment isn't reviewed — the plan tests shape and rules, and each verdict states its reasons — a verdict could be wrong while the page is well formed. confirmed
2026-11-09, Final: `prior-art.toml`'s "before presenting options" and `ground-code.toml`'s "approved research run" read oddly here and stay — shared step text, and the plan forbids a new step — mild confusion for a reader of the built file. confirmed
2026-11-09, Final: web-mcp's refusal of JSON stays — outside this branch; its effect here is the first deviation below — nothing further. confirmed
2026-11-09, Final: letting `/build-feature` accept an evaluation page stays parked — out of scope — a reader re-enters the prior art by hand. confirmed
2026-11-09, Final: minor (deferred): the Tool facts push reports past the 800-word cap (four reports, 826 to 916 words). confirmed
2026-11-09, Final: minor (fixed by review finding 12): the generated README tree lists `why` for /evaluate, which doesn't run. confirmed
2026-11-09, Fix 6: a project with no licence file or field counts as closed-source — it is the safe reading for the adopt rule, and the finding's own example — an open project without a licence file gets a stricter comparison than it needs. confirmed
2026-11-09, Final: minor (deferred): a multi-word name followed by a purpose has no separator. confirmed
2026-11-09, Final: minor (deferred): the folder name comes from a fetched name, and "kebab case" only implies letters, digits and hyphens. reopened 2026-11-09: fix it now, since the name comes from untrusted text; done in Task 3.
2026-11-09, Final: minor (deferred): evaluate has no pointer to resume from after a compaction; the spec accepts that a dead run restarts. confirmed
2026-11-09, Final: minor (deferred): pages link `api.github.com` addresses, which show JSON to a reader. confirmed
2026-11-09, Final: minor (deferred): the template states the 400-word limit in prose rather than a comment. confirmed

## Parking lot

- `docs/features/{symposium-evaluation,strix-vendoring-evaluation,petri-bloom-evaluation}/flow.md`: abandon these open runs once /evaluate has answered them. Pick: do now. Symposium's copy here is done; the Strix and Petri Bloom folders exist only in the main checkout, which this worktree session may not edit, so those two wait for a session there.
- `plugins/flows/skills/build-feature/SKILL.md`: let an evaluation page stand in for the prior art, as a research report does; not needed for the first version. Pick: follow-up.
- `tools/web-mcp/src/tools.rs:381`: an option on `fetch` that refuses a private first hop too, for unattended runs such as /evaluate (review finding 1; #151 already refuses a public address redirecting onto a private one). Pick: follow-up.
- `plugins/flows/skills/build-feature/references/prior-art.md`: the prompt itself opens any link a page names; the public-URL rule exists only in /evaluate's wording around it (skill fix, through `writing-skills`; found by the first fix check on finding 1). Pick: follow-up.
- `plugins/flows/skills/evaluate/`: keep the seeded verdict check as a skill eval; it lives only in a scratchpad now. It must fail on an adopt whose Security fact and mentions rest only on the tool's own pages, which the original baseline case reached before finding 2 (measured: the first seeded run gave `csvkite` adopt on exactly those inputs). Pick: follow-up.

## Deviations

### The tool-facts prompt names no route to GitHub's JSON

Status: decided 2026-11-09: name `gh api` where available, otherwise the repository's own pages. Confirmed 2026-11-09.

web-mcp's fetch reads HTML and PDFs only (`plugins/shared/web-mcp/README.md:14`), so the API endpoints `SKILL.md` prefers can't be read through the prompt's fetch route. In Task 2 the agents improvised with `curl` and `gh api` (measured: the Gaps lines of the Symposium and Strix reports). The plan names no route, and a named shell call is an outside call it didn't decide. Options: name `gh api` where available and the repository's HTML pages otherwise (recommended: one clause, and it says what the agents already do); or leave it to the agents.

### A prior-art agent that ends without its report has no path

Status: decided 2026-11-09: such an agent counts as no subagents, so the session runs the prompt itself, records the check as skipped, and the verdict is capped at try. Check by rebuild, `npm test` and one rerun of the Strix prior-art agent. Done: build exit 0; `npm test` exit 0, 586 passed, 0 failed; the rerun read every GitHub fact with `gh api` (measured: its Gaps line). The missing-report path was not exercised. Confirmed 2026-11-09.

`SKILL.md`'s Phase 2 waits for the report with no end, and the step's "Without subagents" branch covers only a host with no agents. An unattended run could hang, or the session could invent the report. Not exercised in Task 2 (inferred from the text). This is new error handling the plan didn't decide. Options: treat such an agent as no subagents, so the session runs the prompt itself, records the check as skipped, and rule 2 caps the verdict at try (recommended); or leave it.

### Review finding 1 failed its fix check twice

Status: decided 2026-11-09: close what text can close, and park the rest; the limit stands that a hostname resolving to a private address still gets through (a redirect onto one was part of this limit until #151, below), and the web-mcp option is in the Parking lot. Confirmed 2026-11-09.

First attempt: the tool's page and the source check limited to public http(s) URLs. Second: the prior-art agent too, and a tool fact with a non-public link becomes "unknown". Left open: an Alternatives line could keep a value read from a private link (closed by the third attempt: any claim resting only on such a link is removed, and "public" excludes localhost and private IPs); a text rule sees only the URL string, while web-mcp's fetch runs with `allow_private: true` (`tools/web-mcp/src/tools.rs:376`, read).

### origin/main moved under the branch (#151)

Status: decided 2026-11-09: rebase on origin/main and keep `gh api`; correct only the sentence saying a page fetch can't read JSON, and the notes saying a redirect onto a private address gets through.

web-mcp's `fetch` now returns JSON and refuses a public address that redirects onto a private one (read: `git show origin/main:plugins/shared/web-mcp/README.md`, lines 14 and 146). The first fact removes the reason given for the `gh api` route, which stays for its higher rate limit and because it works without web-mcp. Options offered: rebase and drop `gh api` (recommended); rebase and keep it; open the PR as it stood.

## Walkthrough

| goal                                                        | plan task | file:line                                                           | test                                                                            |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A URL, article or name ends on one verdict for this project | Task 1    | `plugins/flows/skills/evaluate/SKILL.md:52`                         | Task 2: Bloom article and three named tools, a page each (measured)             |
| No question between the start and the page                  | Task 1    | `plugins/flows/skills/evaluate/SKILL.md:24`                         | Task 2: four runs, no question asked (measured)                                 |
| Every fact has a fetched source and an independent check    | Task 1    | `plugins/flows/skills/evaluate/SKILL.md:82`                         | Task 2: four source checks on a different model, counts on each page (measured) |
| No page when nothing can be judged                          | Task 1    | `plugins/flows/skills/evaluate/SKILL.md:61`                         | Task 2: bad URL and empty folder, one line and no folder (measured)             |
| An adopt claims no more than reading shows                  | Task 1    | `plugins/flows/skills/evaluate/SKILL.md:30`                         | Task 2: seeded check, five of five (measured)                                   |
| The purpose never reaches the source check                  | Task 1    | `plugins/flows/skills/evaluate/SKILL.md:72`                         | Task 2: purpose text absent from four reports (measured)                        |
| The one-page shape                                          | Task 1    | `plugins/flows/skills/evaluate/references/evaluation-template.md:9` | Task 2: seven headings, 358 to 374 words (measured)                             |
| A repeat run keeps the old verdict in one line              | Task 1    | `plugins/flows/skills/evaluate/SKILL.md:104`                        | not checked (no live run; the plan says so)                                     |

## Review

/review-code branch, lenses correctness, lean, docs and security: [audit](../../audits/2026-11-09-review-evaluate-conductor.md). 16 findings (4 fix before merge, 12 worth doing), all picked and fixed. Fix check by fresh agents: 14 of 16 passed first; finding 6 passed on its second attempt; finding 1 passed on its third, within the limit under Deviations. Seeded verdict check after the rule changes, one fresh agent, seven cases: csvkite adopt; csvlark (no outside source), parsewell, quillcsv, rowpipe (activity unknown), rowsmith and tabline try, as designed (measured; run before the last wording edits, which name the tool's licence and the URL rule and change no seeded input).

## Learned

- `AGENTS.md`, web-mcp entry: `fetch` allows private addresses, so a conductor following links from untrusted pages has only a text rule.
- Parking lot: the shared prior-art prompt's URL rule; the seeded verdict check as a skill eval.

## Run verdict

Worked as a whole: yes. Clean: no (user, 2026-11-09). Review finding 1 failed its fix check twice, and the verdict rules grew during review.
