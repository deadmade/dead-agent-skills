# Prior art: composing agent skills from shared pieces

**Source check (2026-11-04, fresh agent on another model):** 44 confirmed, 3 not supported, 0 couldn't open. The three
are corrected below (POML's output, Claude-only imports, POML's "checked parameters"); four inferences that didn't
follow from their sources are relabelled.

**Gaps.** Not fetched: Prompty, Fabric, DSPy and LangChain docs (DSPy only via a blog post), Cursor `.mdc`, Continue, Copilot prompt files, Mustache/Handlebars/MDX, Codex plugin docs. The Codex skills URL redirected to `learn.chatgpt.com`. I found no project that builds multi-phase workflow skills from a shared step library; rule syncers and spec-kit come closest.

## Comparable implementations

| Project                                                                                       | Source format                                                         | Reuse                                                                                                                            | Per-agent output                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ruler](https://github.com/intellectronica/ruler#the-ruler-directory)                         | Plain `.md` in `.ruler/` plus `ruler.toml`                            | Joins the files in order and puts a `<!-- Source: path -->` marker before each                                                   | Writes the same text to every agent's file. [Skills are copied unchanged](https://github.com/intellectronica/ruler#skills-support-experimental)                            |
| [rulesync](https://rulesync.dyoshikawa.com/reference/file-formats#rulesync-skills-skill-md)   | `.rulesync/skills/*/SKILL.md` with frontmatter sections for each tool | None for the skill body. [Symlinks are followed](https://rulesync.dyoshikawa.com/reference/file-formats#symlinks) to share files | Maps frontmatter per tool (for example, writes Codex's `agents/openai.yaml` policy). Supporting files are copied byte for byte                                             |
| [spec-kit presets](https://github.github.io/spec-kit/presets/api.html#composition-strategies) | Markdown command/template files plus `preset.yml`                     | Priority layers. Each layer can `replace`, `prepend`, `append` or `wrap` (wrap uses a `{CORE_TEMPLATE}` placeholder)             | The composed command is [materialized for the active integration](https://github.github.io/spec-kit/presets/overview.html#how-presets-take-effect)                         |
| [POML](https://microsoft.github.io/poml/latest/language/template/#include-files)              | Tag markup (`<poml>`, `<p>`, `<let>`)                                 | `<include src>` with `for`/`if`, `<let>` variables                                                                               | Not documented on the cited page                                                                                                                                           |
| [Claude Code CLAUDE.md](https://code.claude.com/docs/en/memory#import-additional-files)       | Markdown                                                              | `@path` imports, expanded at load time, at most 4 hops deep                                                                      | Loaded into the session (Codex expands `@path` in AGENTS.md too). Imports [don't reduce context cost](https://code.claude.com/docs/en/memory#write-effective-instructions) |

## What the target harnesses expect

- **Agent Skills spec** ([spec](https://agentskills.io/specification#progressive-disclosure)): `name` (≤64 chars, matches the folder) and `description` (≤1024 chars) are required. Recommended limits are under 500 lines and under 5,000 tokens. Files in `references/` load on demand and should be [one level deep](https://agentskills.io/specification#file-references).
- **Claude Code** ([frontmatter](https://code.claude.com/docs/en/skills#frontmatter-reference)): adds `when_to_use`, `disable-model-invocation`, `context: fork` and others. The description listing is cut at 1,536 chars. Compaction keeps only the [first 5,000 tokens](https://code.claude.com/docs/en/skills#skill-content-lifecycle). claude.ai uploads [reject non-spec fields](https://code.claude.com/docs/en/skills#using-skill-frontmatter-outside-claude-code).
- **Codex** ([skills](https://learn.chatgpt.com/docs/build-skills)): reads `.agents/skills`. `agents/openai.yaml` sets `allow_implicit_invocation`. The skill list gets 2% of context by default, and descriptions are shortened first. [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) files are joined from the root down, with a 32 KiB cap.

## Approaches

**1. Markdown fragments, joined or copied**

- _Shape:_ hand-written `.md` pieces that are joined or copied into each target.
- _Who:_ ruler, rulesync, Claude `@imports`.
- _Good at:_ the output is still prose a person wrote, and the source can be traced. Ruler adds source markers [source](https://github.com/intellectronica/ruler#the-ruler-directory).
- _Costs:_ whole files only, with no slots inside a step. Ruler's FAQ says every agent gets the same rules; agent-specific text has to go in headed sections [source](https://github.com/intellectronica/ruler#faq).
- _Bad fit:_ steps that need wording per conductor, such as a different gate in each phase [inferred].

**2. Layered templates with placeholders**

- _Shape:_ a base file plus layers that wrap it or add text before or after it, resolved at build time.
- _Who:_ spec-kit.
- _Good at:_ changing a shared base without forking it [source](https://github.github.io/spec-kit/presets/overview.html).
- _Costs:_ a composed command can come from several files, so you need `specify artifact info` to see where text came from [source](https://github.github.io/spec-kit/presets/overview.html#faq). Generated files must not be hand-edited [source](https://github.github.io/spec-kit/integrations/index.html#working-in-a-team).
- _Bad fit:_ a few conductors with one owner, where the layer machinery outweighs the drift it prevents [inferred].

**3. Markup or code DSL that renders Markdown**

- _Shape:_ steps as typed data or components (TS/JSX, POML), rendered to `.md`.
- _Who:_ POML. DSPy goes further and generates the prompt.
- _Good at:_ loops, conditions and variables [source](https://microsoft.github.io/poml/latest/language/template/) (attributes are type-cast, not checked).
- _Costs:_ the final prompt is hidden behind the abstraction. One author argues that you should be able to read the final prompt and drop the framework if it adds nothing [blog post](https://hamel.dev/blog/posts/prompt/#motivation-minimize-accidental-complexity).
- _Bad fit:_ output that must read as hand-written guidance a reviewer approves word by word [inferred; doesn't follow
  from the sources: a build-time renderer that commits its output shows the final prompt].

**4. Keep hand-written Markdown, lint for consistency**

- _Shape:_ each SKILL.md stays authored; a checker requires shared rules or steps to appear and match.
- _Who:_ Claude `/doctor prompt-audit` flags conflicting instructions [source](https://code.claude.com/docs/en/memory#audit-your-instruction-files). `skills-ref validate` checks frontmatter [source](https://agentskills.io/specification#validation).
- _Good at:_ no gap between source and output, and the text is fully reviewable [inferred].
- _Costs:_ fixes still need manual edits in every file, and the lint has to encode what "same" means [inferred].
- _Bad fit:_ shared steps that change often [inferred].

## Pitfalls

- **Drift between source and output.** Ruler's suggested CI step re-runs `apply` and fails on any git diff [source](https://github.com/intellectronica/ruler#scenario-2-working-with-worktrees). Our `check:harnesses` already does this [inferred].
- **Tracing a sentence back to its source.** Ruler uses inline markers. Spec-kit needs a separate inventory command [source](https://github.github.io/spec-kit/presets/overview.html#faq). Claude strips HTML block comments from CLAUDE.md [source](https://code.claude.com/docs/en/memory#how-claude-md-files-load), but the skills page doesn't say it does this for SKILL.md, so markers in a skill may cost tokens [inferred].
- **Output that reads worse.** Anthropic asks for one term per concept throughout a skill [source](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#use-consistent-terminology). When instructions contradict each other, Claude may pick one arbitrarily [source](https://code.claude.com/docs/en/memory#write-effective-instructions). Fragments written apart are likely to mix terms [inferred].
- **Growth and over-abstraction.** Composition may add text [inferred, not shown], while the targets recommend size
  limits (hard limits are the 1,536-char description, 5,000 tokens kept per skill after compaction with a shared
  25,000-token budget, and the 32 KiB AGENTS.md default) and Anthropic says "Concise is key" [source](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#concise-is-key). Put the rules that must survive compaction first [source](https://code.claude.com/docs/en/skills#claude-stops-following-a-skill).
- **Moving shared steps into `references/`.** Claude may only partly read files that are linked from other referenced files [source](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#avoid-deeply-nested-references). Files linked directly from SKILL.md are read fully; only nested chains are risky. Inline steps that are critical,
  because compaction keeps only a skill's first 5,000 tokens [source](https://code.claude.com/docs/en/skills#skill-content-lifecycle), and link only optional detail one level deep [inferred].
