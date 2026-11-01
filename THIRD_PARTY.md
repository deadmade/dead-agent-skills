# Third-party content

## Hallmark

`plugins/opt-in/hallmark/skills/hallmark/` is vendored from [nutlope/hallmark](https://github.com/nutlope/hallmark)
(MIT License, Copyright (c) 2026 Hallmark contributors; full text in `skills/hallmark/LICENSE`).
It is synced by `tools/upstream-sync/src/adapters/hallmark.ts` (weekly via GitHub Actions), which prefixes the frontmatter `description`
with "WEB FRONTEND ONLY" and ships only the skill: upstream's installers, its settings.json lint hook, Together AI image
generation (`comp.md`, `imagegen.mjs`), the theme-picture renderer, its dev checks and fixtures and the Codex adapter are
deleted, along with the sentences that point at them. The synced upstream commit is in `skills/hallmark/UPSTREAM`.
`scripts/photos.json` indexes Wikimedia Commons photos (CC0, public domain, CC BY or CC BY-SA, each with its author and
licence); none are vendored, and the skill credits each one a page uses.

## paper-lookup

`plugins/flows/packs/paper-lookup/skills/paper-lookup/` is vendored from the paper-lookup skill of
[K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) (MIT License, Copyright (c)
2025 K-Dense Inc.; full text in `skills/paper-lookup/LICENSE.md`). It is synced by `tools/upstream-sync/src/adapters/paper-lookup.ts`
(weekly via GitHub Actions), which trims it for computer science: the reference files for PubMed, PMC, Europe PMC,
bioRxiv, medRxiv, PubTator3, BioStudies, ROR and Figshare are deleted along with SKILL.md table rows naming them, a
note under the title covers leftover mentions, the frontmatter `description` is replaced, and the "Citing Scientific
Agent Skills" section is removed.
The synced upstream commit is in `skills/paper-lookup/UPSTREAM`.

## security-audit

`plugins/flows/packs/security-audit/skills/security-audit/` is vendored unchanged from
[cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (MIT License, Copyright (c)
2025-2026 Cloudflare, Inc.; full text in `plugins/flows/packs/security-audit/LICENSE`) by
`tools/upstream-sync/src/adapters/simple.ts` (weekly via GitHub Actions). `/harden` reads its domain files and candidate-verifier
prompt by path. The synced upstream commit is in `plugins/flows/packs/security-audit/UPSTREAM`.

## MCP servers (dead-skills, mcp-github)

- **Context7**: hosted service by Upstash (https://context7.com), used over HTTP; nothing vendored.
- **GitHub MCP server**: hosted by GitHub (https://github.com/github/github-mcp-server), used over HTTP; nothing vendored.

## mattpocock-picks

`plugins/flows/packs/mattpocock-picks/skills/` vendors a picked set of skills from [mattpocock/skills](https://github.com/mattpocock/skills)
(MIT License, Copyright (c) 2026 Matt Pocock; full text in `plugins/flows/packs/mattpocock-picks/LICENSE`), unmodified
apart from flattening `engineering/` and `productivity/` into one folder. Synced by `tools/upstream-sync/src/adapters/mattpocock.ts`
(weekly via GitHub Actions); the synced upstream commit is in `plugins/flows/packs/mattpocock-picks/UPSTREAM`.

## pstack-picks

`plugins/flows/packs/pstack-picks/` vendors a picked set of skills and the `comment-sicko` agent from
[pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT License, Copyright (c) 2026 Lauren Tan;
full text in `plugins/flows/packs/pstack-picks/LICENSE`). Modified mechanically for Claude Code by
`tools/upstream-sync/src/adapters/pstack.ts` (tool names, subagent types, model names, paths, and an added port note
under each file's frontmatter). Not vendored: pstack's `unslop` and `technical-writing`, which flows' own `writing` skill
replaces; the sync rewrites the references to them to point at it. The synced upstream commit is in
`plugins/flows/packs/pstack-picks/UPSTREAM`.

## tob-picks

`plugins/flows/packs/tob-picks/` vendors four skills (property-based-testing, spec-to-code-compliance, sharp-edges,
mutation-testing), the `spec-compliance-checker` and `sharp-edges-analyzer` agents and the `spec-compliance` workflow
from [trailofbits/skills](https://github.com/trailofbits/skills) (Creative Commons Attribution-ShareAlike 4.0,
Copyright Trail of Bits; full text in `plugins/flows/packs/tob-picks/LICENSE`). The vendored files stay under CC BY-SA 4.0.
Modified by `tools/upstream-sync/src/adapters/tob.ts`: each upstream plugin's skill, agents and workflow are merged into one plugin,
the Codex-only `agents/openai.yaml` and its icon are dropped, the `spec-to-code-compliance:` namespace is renamed to
`tob-picks:`, the workflow's typed dispatch is pointed at `flows:spec-compliance-checker`, and `FsCheck|CsCheck` is
added to property-based-testing's library detection command. The `spec-compliance-checker` agent is also copied to
`plugins/flows/agents/spec-compliance-checker.md` (same CC BY-SA 4.0), because a pack's agents don't load. Synced weekly via
GitHub Actions; the synced upstream commit is in `plugins/flows/packs/tob-picks/UPSTREAM`.

## rust-skills

`plugins/opt-in/implementation/rust-skills/` vendors the rust-best-practices skill from
[apollographql/skills](https://github.com/apollographql/skills) (MIT License; `plugins/opt-in/implementation/rust-skills/LICENSE`).
Modified by `tools/upstream-sync/src/adapters/simple.ts`: a `paths:` block (`**/*.rs`, `**/Cargo.toml`, `**/Cargo.lock`) is added to
SKILL.md's frontmatter. Synced weekly via GitHub Actions (`sync.yml`); the synced upstream commit is in
`plugins/opt-in/implementation/rust-skills/UPSTREAM`.

## csharp-skills

`plugins/opt-in/implementation/csharp-skills/` vendors the skills of [dotnet/skills](https://github.com/dotnet/skills) (MIT License,
Copyright (c) .NET Foundation and Contributors; `plugins/opt-in/implementation/csharp-skills/LICENSE`). Modified by
`tools/upstream-sync/src/adapters/csharp.ts`: upstream's skills are copied to `library/`, and six generated router skills in `skills/` (core,
testing, build, web, data, desktop) index them; the four skills upstream marks `disable-model-invocation: true` are
left out of the indexes. csharp-expert gets a note that its specialists are already installed in csharp-skills, its
install, restart and update blocks are rewritten, and it gets a fixed index summary. Upstream's agents, binlog MCP
server, bundled LSP and dotnet-experimental plugin are not vendored, so neither is the troubleshoot-binlog-mcp skill, and
the binlog skills' MCP workflows are cut down to their text-log replay ones. Synced weekly via GitHub Actions
(`sync.yml`), whose PR body lists added, removed, skipped and unmapped skills and agent mentions; the
synced upstream commit is in `plugins/opt-in/implementation/csharp-skills/UPSTREAM`.

## postgres

`plugins/opt-in/implementation/postgres/skills/` vendors two skills. Each folder carries its upstream's license and an `UPSTREAM`
file with the synced commit:

- `postgres-best-practices/` from [neondatabase/postgres-skills](https://github.com/neondatabase/postgres-skills)
  (Apache License 2.0; `LICENSE` in the folder).
- `postgres-database-migration/` from [timescale/pg-aiguide](https://github.com/timescale/pg-aiguide) (Apache License
  2.0; `LICENSE` and `NOTICE` in the folder).

Modified by `tools/upstream-sync/src/adapters/simple.ts`: a `paths:` block (`**/*.sql`, `**/migrations/**`, `**/migrate/**`,
`**/*.prisma`, `**/alembic/**`) is added to each SKILL.md's frontmatter. Synced weekly via GitHub Actions
(`sync.yml`).

## graphify

`plugins/shared/graphify/skills/graphify/` vendors the Claude Code skill (`graphify/skill.md`) and its `references/`
from [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) (Apache License 2.0, Copyright 2026
Safi Shamsi and the Graphify contributors; `LICENSE`, `LICENSE-MIT` and `NOTICE` in `plugins/shared/graphify/`),
unmodified. `plugins/shared/graphify/hooks/hooks.json` reproduces the hooks upstream's installer writes and calls the
separately installed `graphifyy` CLI. Synced by `tools/upstream-sync/src/adapters/graphify.ts` (weekly via GitHub Actions); the
synced upstream commit is in `plugins/shared/graphify/UPSTREAM`.

## self-review

flows' `/self-review` (`plugins/flows/skills/self-review/`) vendors review passes from two upstreams, synced by
`tools/upstream-sync/src/adapters/self-review.ts` (weekly via GitHub Actions; the synced commits are in
`plugins/flows/skills/self-review/UPSTREAM`, the license files and `NOTICE` sit next to it):
[anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)'s code-review command
(`references/upstream/code-review.md`) and five pr-review-toolkit agents (`plugins/flows/agents/`: silent-failure-hunter,
pr-test-analyzer, type-design-analyzer, comment-analyzer, code-simplifier; Apache License 2.0, Copyright Anthropic,
PBC; `LICENSE`), with the agents'
`description:` rewritten, and [mattpocock/skills](https://github.com/mattpocock/skills)'s engineering code-review
skill (MIT License, Copyright Matt Pocock; `LICENSE-MIT`), unmodified apart from a source comment.

## writing (flows)

flows' `writing` skill (`plugins/flows/skills/writing/SKILL.md`) states the density test of
[technical-writing-density](https://github.com/mlwelles/technical-writing-density) (MIT License, Copyright (c) 2026
Michael Welles) in its own words and links to it; nothing is copied. The rest of the skill is our own wording of
Williams and Bizup's _Style: Lessons in Clarity and Grace_ (12th edition, Pearson, 2016): `SKILL.md` and one reference
per lesson and appendix in `references/`, written as procedures in our own words with invented software examples. They
quote no passage and use none of the book's examples; a script checked them for word runs shared with the book, and
what remains is terms of art and fixed lists (coordinating conjunctions, "the first seven or eight words").

## ponytail

`plugins/flows/packs/ponytail/` is vendored from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT
License, Copyright (c) 2026 DietrichGebert; full text in `LICENSE`): the Claude Code plugin's `.claude-plugin/plugin.json`,
`hooks/` (without the other hosts' hook configs) and `skills/`, at upstream's newest stable release. It is synced by
`tools/upstream-sync/src/adapters/release.ts` (weekly via GitHub Actions); the only local change is `plugin.json`'s `version`. The synced
upstream commit is in `UPSTREAM`.

## superpowers

`plugins/flows/packs/superpowers/` is vendored from [obra/superpowers](https://github.com/obra/superpowers) (MIT License,
Copyright (c) 2025 Jesse Vincent; full text in `LICENSE`): the Claude Code plugin's `.claude-plugin/plugin.json`,
`hooks/` (without Cursor's hook config) and `skills/`, at upstream's newest stable release. It is synced by
`tools/upstream-sync/src/adapters/release.ts` (weekly via GitHub Actions); the only local change is `plugin.json`'s `version`. The
synced upstream commit is in `UPSTREAM`.

## web-mcp

- **I still don't care about cookies**: GPL-3.0, https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies. web-mcp
  downloads the pinned v1.1.9 zip at runtime (sha256-checked) and loads it into its browser window; not vendored.

## headroom-trim

Nothing is vendored. The installer downloads [uv](https://github.com/astral-sh/uv) (MIT or Apache-2.0, at its
option) at the version pinned in `installer/assets/uv.json` (sha256-checked), and uv installs
[headroom-ai](https://github.com/headroomlabs-ai/headroom) (Apache-2.0) at the version and hashes pinned in
`plugins/opt-in/headroom-trim/server/uv.lock`, into the plugin's data folder on the user's machine.

## flow-cockpit

`crates/flow-cockpit/app/shell/vendor/` holds the libraries the views' building blocks and the boot script use, copied unchanged
from their npm tarballs (each tarball checked against the registry's `dist.integrity`), each with its license next to it:

- **marked** 18.1.2: MIT, https://github.com/markedjs/marked (`lib/marked.esm.js`, and `lib/marked.d.ts` as
  `marked.esm.d.ts`; `LICENSE-marked`). Tarball `sha512-DfOnvLAQ6WYeWxWO1u4RyFOeqyHup6dks5PPqnoFiooU7ipRvidO/2j8plhAHIiZg574E9ZlzSjUiPMLAzFkgg==`.
- **DOMPurify** 3.4.17: Apache-2.0 or MPL-2.0, https://github.com/cure53/DOMPurify (`dist/purify.es.mjs`,
  `dist/purify.es.d.mts`; `LICENSE-dompurify`, `LICENSE-dompurify-MPL`). Tarball
  `sha512-B/pSlYVHQ58kqISD/yDjuJ1yfzI34m1gF4lAod2bwSRhiN4K5Cl3H8Af7hqB2PmTL911tdEudnnXn5FnhRoz0w==`.
- **mermaid** 12.2.0: MIT, https://github.com/mermaid-js/mermaid (`dist/mermaid.min.js`; `LICENSE-mermaid`). Tarball
  `sha512-w7nr/SFrLO7BaVTs3dQTvYSV6nYSBj0Yy9DjBhsIJtAcHqRzXSq4Pg32ujHZ/AdWsAMNEvvhbm5dt9E2tOiHzw==`.
  `mermaid.min.js` is a bundle: it also carries mermaid's dependencies, each under its own license. Its license
  banners name DOMPurify 3.4.12 (Apache-2.0 or MPL-2.0), lodash-es (MIT, through dagre-d3-es) and cytoscape (MIT).
  The rest, from mermaid 12.2.0's `package.json` with the licenses the registry gives for the versions it allows:
  elkjs (EPL-2.0), chevrotain (Apache-2.0), d3 (ISC), d3-sankey (BSD-3-Clause), and MIT for @braintree/sanitize-url,
  @iconify/utils, @mermaid-js/parser, @upsetjs/venn.js, cytoscape-cose-bilkent, cytoscape-fcose, dagre-d3-es, dayjs,
  es-toolkit, katex, khroma, marked, roughjs, stylis, ts-dedent and uuid.
- **@tauri-apps/api** 2.12.4 (npm `latest`): Apache-2.0 or MIT, https://github.com/tauri-apps/tauri (`core.js`, `core.d.ts`,
  `event.js`, `event.d.ts` and `external/tslib/tslib.es6.js`, which `core.js` imports; `LICENSE-tauri-apps-api` is its
  MIT text, `LICENSE-tauri-apps-api-Apache` its Apache-2.0 one). `boot.js` imports `invoke` and `listen` from it, so
  the window needs no `withGlobalTauri`. `tslib.es6.js` is Microsoft's tslib (0BSD, its notice is the file's own
  header). Tarball `sha512-pVmfis+4zT8H0Qhp3xPZx9Ju7kpzvA6rr/PSJPyuwfvucTQ8sVt61NYU9KMkK703UFlYadFmjKA4HhybOtN0gg==`
  (sha256 `ea354409df3dcc473395111a5f6bf0031c8444cf827604515169aa3af5e9357a`).
- **@xterm/xterm** 6.0.0 and **@xterm/addon-fit** 0.11.0 (npm `latest`): MIT, https://github.com/xtermjs/xterm.js
  (`xterm.mjs` and `xterm.css` from `lib/` and `css/`, `addon-fit.mjs` from `lib/`, all unmodified; `LICENSE-xterm` is
  xterm's own MIT text, and the addon's differs only in its copyright line, "Copyright (c) 2019, The xterm.js
  authors"). `xterm.d.mts` and `addon-fit.d.mts` are the packages' `typings/*.d.ts` without their
  `declare module '...'` wrapper, and the addon's import of `@xterm/xterm` pointed at `./xterm.mjs`, so `tsc` types
  `session-pane.js`'s imports. Both modules are plain ES modules with no imports. `session-pane.js` draws a hosted
  session's terminal with them, and `index.html` links `xterm.css`. Tarballs `xterm-xterm-6.0.0.tgz` (sha256
  `908e66e04af6c8dc6b00dd3b54de088e2e81e5ed866284fd6c2fb3c2d1c7a3f6`) and `xterm-addon-fit-0.11.0.tgz` (sha256
  `26003b4517a132b64e4ff228fd88a5fda3fff5e606c76093f6dcff772e9ecec0`).

## Night City (dead-skills)

The palette of `plugins/default/themes/night-city.json` is derived from the Cyberpunk Neon theme
(`plugins/theme-gallery/themes/cyberpunk.json`) of [livlign/ccthemes](https://github.com/livlign/ccthemes) (MIT
License, Copyright its authors), with changed and added colors. Nothing is vendored or synced.

## agent-review

`plugins/shared/agent-review/skills/agent-review/` is vendored from [captivus/agent-review](https://github.com/captivus/agent-review)
(MIT License, Copyright (c) 2026 Corey Gallon; full text in `plugins/shared/agent-review/LICENSE`). It is synced by
`tools/upstream-sync/src/adapters/agent-review.ts` (weekly via GitHub Actions; the synced commit is in `plugins/shared/agent-review/UPSTREAM`).
The only local changes are in `SKILL.md`'s frontmatter (`disable-model-invocation: true` added, `effort` removed), one
sentence pointing at the dead-skills `rules.md` instead of the upstream README, `references/tool-notes.md` without its
install section (it describes the unmodified skill) and `SKILL.md`'s link to it no longer naming install options, and a
source comment in each Markdown file. The self-audit lines in `plugins/default/rules.md` and the review steps in
self-review and feature-flow are adapted from its method.

## Re-listed plugins

The marketplace entry for Atlassian only points at its upstream repository; no code is vendored here. Anthropic's
plugins (code-review, claude-code-setup, claude-md-management, security-guidance,
claude-security, skill-creator, hookify and the LSPs) aren't listed here at all: they install from Anthropic's
`claude-plugins-official` marketplace. Each is covered by its own upstream license.
