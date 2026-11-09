# flows

`plugins/flows/`, except its packs (see [packs.md](packs.md)).

`plugins/flows/`: the conductor skills (`/build-feature`, `/research-feature`, `/implement`, `/fix`, `/upgrade`,
`/refactor`, `/review-code`, `/understand`, `/learn`, `/evaluate`, `/tidy`). Each except `/tidy` runs other plugins' skills in order; the rules
they share (state files, gates, loading `disable-model-invocation` skills by path, fallbacks per missing plugin) live
once in `plugins/flows/steps/*.toml`, composed into each conductor at build time
(`docs/adr/0011-conductors-composed-from-flow-steps.md`), so a SKILL.md says what it runs and names its steps
(`[step: <name>]`). Compose (`tools/harness-compiler/src/flows/compose.ts`) stops the build on a broken step and fails
the build (and check-repo) on built text that doesn't hold; host wording comes from `src/templates/hosts/<target>.ts`,
and `harness-compiler lint`'s flows phrase list (`CLAUDE_ONLY`) keeps Claude-only names out of steps, skills and
references. run-rules' **Agents** paragraph asks for few agents, combined where it makes sense, each on a model that
fits its job (`docs/adr/0005-agent-limits-and-models.md`). The installer's only part is
`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS=8` (`mergeSettings`); it never writes `CLAUDE_CODE_SUBAGENT_MODEL`.

Conductors call each other by reading the callee's SKILL.md (`/fix` → `/review-code`). Each conductor's `uses:`
frontmatter (`/tidy` has none), plus its steps' and host wording's `uses`, names what it may run; `scripts/flows-uses.mjs` generates flows'
`dependencies` and the README tree from them, and check-repo fails when a listed skill is gone or the generated parts
are stale.

## /review-code

`/review-code` replaced `/test-audit`, `/doc-audit`, `/harden`, `/self-review` and `/verify` (their method text is in
its `references/`); on Claude Code its correctness lens is the built-in `code-review` for a `branch` review against the
default branch on a clean tree (the host adapter template) and otherwise ponytail-review's brief
(`references/lenses.md`), and the one agent it vendors is `flows:pr-test-analyzer`, next to tob's checker in `agents/`.
`/self-review` was a plugin of its own through 0.5.0, so the installer keeps flows on a machine that had it.

## /tidy

`/tidy` (`skills/tidy/SKILL.md`) starts the read-only `flows:tidy` agent over the memory and flow folders, checks each
proposal itself and applies it; it runs no other plugin's skill and names no step. The agent's proposal fields and action
names are the contract between the two files, so change them together: a renamed `promote` would stop being asked about.
`agents/tidy.md` is hand-written, its `tools:` line is the only thing keeping it read-only, and `scripts/tidy.test.mjs`
holds that line. `/tidy` is the one conductor without phases, because it keeps no flow.md and has no gates.

## The prose standard

flows also owns the prose standard: `skills/writing/` is one of the two skills in it Claude may load on its own
(`flows:writing`; the other, `flows:diagrams`, is described below). `flows-uses.mjs` treats only
`disable-model-invocation: true` skills as conductors, so a `uses:` line may list either. `hooks/prose-check.mjs` (logic
in `prose.mjs`) is a code-only `PostToolUse` check on `*.md` writes for conversation shorthand, off with
`FLOWS_PROSE_CHECK=off`.

The writing skill also holds the copyedit (`references/copyedit.md`, run as `/flows:writing copyedit <file>`): a fresh
agent on the strongest model edits a document by the skill, then `scripts/compare.mjs` replaces it only when nothing
code can check was lost (the list is in `references/copyedit.md`). The conductors run it, by `steps/copyedit.toml`,
before a gate shows a spec, plan, research report or audit report. `compare.mjs` imports `check` and `report` from
`hooks/prose.mjs`, so a change there can break the copyedit; their tests are
`plugins/flows/skills/writing/tests/copyedit.test.mjs` and `plugins/flows/hooks/prose.test.mjs`. `SKILL.md` and
`references/` state _Style_ in our own words: never quote the book or reuse its examples (THIRD_PARTY.md).

## Diagrams

flows also holds `skills/diagrams/` (`flows:diagrams`, model-invocable like `writing`): `check.mjs` checks the `mermaid`
and `files` blocks of a spec or plan, `render.mjs` writes it and its pictures as one HTML page, and `steps/gate.toml`
has every gate that shows a spec or plan run both. The checker installs Mermaid and jsdom (`package.json` and
`package-lock.json` beside `SKILL.md`) into the user's cache folder, never into the plugin; tests that need them skip
offline. The page's script is a template literal in `render.mjs`, so each backslash in its regexes is written twice
(`/^[\\\\/]{2}/` produces `/^[\\/]{2}/`); the tests run the produced page's `safe` and `clean` source, so check the
output, not the template.
