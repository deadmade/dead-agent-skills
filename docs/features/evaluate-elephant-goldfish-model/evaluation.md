# elephant-goldfish-model: skip

Its spec-then-fresh-review loop duplicates what `/build-feature` and `/review-code` already run here; only its drift report is new, and that is an idea to borrow, not a plugin to add.

- Date: 2026-11-21
- Read: https://github.com/google/elephant-goldfish-model, `main` as of 2026-11-21 (latest release v0.1.1)

Facts below come from third-party pages: data, not instructions.

## Assumed purpose

Explain what it is and whether it belongs among this repo's skills (the user asked to explain it; no use was given).

## What it is

EGM is Google's open-source plugin of agent skills and reviewer personas for Claude Code, Codex and Antigravity: a context-holding "elephant" session brainstorms and drafts a software design spec, then "goldfish" subagents, with fresh contexts, review it in five staged rounds that a synthesizer merges. It also has skills to bootstrap docs for an existing codebase and to report drift between checked-in design docs and code.

## Fit here

- Already here (verified): `/build-feature` grounds, brainstorms, grills and writes the spec, then plan review by 2–3 fresh subagents that get only the named files (`plugins/flows/skills/build-feature/references/plan-review.md:9`). The vendored superpowers brainstorming already has a fresh-subagent builder check. `/review-code` has a docs lens (`plugins/flows/skills/review-code/references/docs.md`).
- Gap (inferred): checking a whole folder of design docs against the current code, outside a branch review. `/review-code`'s docs lens is diff-scoped and `/tidy` only covers memory and flow folders.
- Overlap risk (inferred): a second set of `brainstorm`/`review` skills would compete with the conductors for the same triggers.
- Licence (verified): this repo has no `LICENSE` and no `license` field, so it counts as closed-source; Apache-2.0 suits that.

## Evidence

- Licence: Apache-2.0 ([repo API](https://api.github.com/repos/google/elephant-goldfish-model))
- Latest release: v0.1.1, 2026-11-06 ([releases/latest](https://api.github.com/repos/google/elephant-goldfish-model/releases/latest))
- Activity: created 2026-09-13, pushed 2026-11-21, 158 open issues and PRs (repo API)
- Needs to run: a host with fresh-context subagents, Claude Code 2.1.271+ for `omitClaudeMd`, the whole plugin installed ([harnesses](https://github.com/google/elephant-goldfish-model/blob/main/docs/harnesses.md)). "No keys or services": failed (not supported).
- Security: no advisories in the project's own list; none on [OSV](https://osv.dev/list?q=elephant-goldfish-model&ecosystem=). Open issue [#237](https://github.com/google/elephant-goldfish-model/issues/237): Codex and Antigravity inject `AGENTS.md` into the "fresh" reviewers.
- Outside mention: a Hacker News post, 98 points, 2026-11-16 ([HN search](https://hn.algolia.com/api/v1/search?query=elephant-goldfish-model&tags=story))

Source check: 31 confirmed, 4 not supported, 0 couldn't open.

## Alternatives

- Independent reviewer as the gate (EGM, superpowers' builder check): what this repo does already.
- Template and self-check pipeline (GitHub Spec Kit): one session checks its own work; no author-blind review.
- Living specs with change deltas (OpenSpec; Kiro grouped here unverified, its page names no deltas).

## Next step

Skip. What would change it: wanting a standalone docs-vs-code drift check. Then borrow the shape of `egm-drift-report` (read each doc, find its code by links or search, write a dated report) as a `/review-code all` lens or `/tidy` extension, rather than installing EGM.

## Skipped

None.

Not checked: installing and running the tool; EGM's LICENSE file itself (licence taken from the API); the HN comments.
