Source check: 23 confirmed, 2 not supported (corrected below), 0 couldn't open; 7 inferred claims: 4 follow, 3 partly, 0 don't.

**Gaps:** Every web-search engine timed out or was busy, so comparables came from projects I already knew, opened by URL; I may have missed others. The fetch tool can't read JSON, so GitHub API facts came from `curl`. Symposium's common-issues page came back truncated ("38 lines omitted"). Context7 was not queried; docs were fetched directly. MCP spec, Claude Code hooks docs and TanStack Intent's docs site were not opened.

## Tool facts (Symposium)

- What it is: `cargo agents`, a Rust CLI that matches plugins to a workspace's dependency graph and installs skills, hooks and MCP entries into seven agents. [[README](https://github.com/symposium-dev/symposium)]
- Licence: MIT OR Apache-2.0: the README says so and `LICENSE.txt` holds both texts (the source check read the file); the API reports `NOASSERTION`. [[README](https://github.com/symposium-dev/symposium#community)]
- Latest release: `symposium-v0.5.1`, 2026-10-01. Last push 2026-11-09. Failed fact: "134 open issues" (not supported: the count includes pull requests; 99 issues and 35 pull requests are open). [GitHub API]
- Security advisories: none published. [GitHub API `/security-advisories`: empty]
- Needs: `cargo` on PATH (`cargo metadata`), at least one agent; Linux, macOS, Windows. [[README](https://github.com/symposium-dev/symposium#requirements)]

## Comparable implementations

1. **Vercel `skills` `experimental_sync` ([RFC #2323](https://github.com/vercel-labs/skills/issues/2323))**: reads direct `package.json` dependencies, finds `skills/` in each installed package, and symlinks it into `.agents/skills/`. Decisions: link, don't copy, so the skill tracks the package version; fixed five-rule conflict order (a user-installed skill always wins); cleanup removes only links it owns.
2. **TanStack Intent ([README](https://github.com/TanStack/intent))**: library maintainers ship Agent Skills inside their npm packages, "auto-discovered, versioned with your code". The README doesn't show the discovery mechanism.
3. **Ruler ([README](https://github.com/intellectronica/ruler#the-ruler-directory))**: one `.ruler/` directory (Markdown, `ruler.toml`, `skills/`, MCP in TOML) is rendered to ~30 agents' native files. Decisions: `.bak` backups and a gitignore block; concatenates rules and gives every agent the same text; skills copied only to agents with a native skills dir.
4. **rulesync ([README](https://github.com/dyoshikawa/rulesync#supported-tools-and-features))**: `.rulesync/` source, `generate --targets`, plus `import` and `convert` between tools; a feature matrix (rules, mcp, subagents, skills, hooks, permissions) per tool.
5. **Microsoft APM ([README](https://github.com/microsoft/apm#why-apm))**: `apm.yml` declares skills, plugins, hooks and MCP servers; `apm install` deploys them to nine targets; `apm.lock.yaml` pins hashes. Adds install-time Unicode scanning and an org policy file.

## Approaches

**A. Dependency-matched, author-shipped guidance** (Symposium, skills sync, Intent). Libraries carry skills; a client reads the dependency graph and installs what matches.

- Good at: guidance pinned to the installed version. [inferred] Users still confirm or run a sync per project. [source: source check on the Symposium docs and RFC #2323]
- Costs: the ecosystem must adopt it. Symposium keeps a reviewed central repo for crates that won't ship skills. [[authoring](https://symposium.dev/crate-authors/authoring-a-plugin.html#standalone-skills-on-the-recommendations-repo)]
- Bad fit: a hand-curated marketplace with no dependency graph to match. [inferred] Symposium evaluates plugin and hook predicates on every hook dispatch and tells authors to keep them fast. [[predicates](https://symposium.dev/reference/predicates.html#when-predicates-are-evaluated)]

**B. Neutral source, generated per-agent files** (Ruler, rulesync; this repo's harness compiler has the same shape [inferred]). Author once; a build step writes each agent's files.

- Good at: no runtime component; output reviewable in git. [inferred]
- Costs: every agent's format is hand-modelled, and formats move (rulesync's table has deprecated and end-of-life targets). [[rulesync notes](https://github.com/dyoshikawa/rulesync#target-and-deprecation-notes)]
- Bad fit: when the guidance depends on live state. Ruler's generated files are gitignored, so fresh worktrees lack them until `ruler apply` reruns. [[Ruler scenario 2](https://github.com/intellectronica/ruler#scenario-2-working-with-worktrees)]

**C. Manifest plus lockfile package manager** (APM; `skills` CLI). Users declare dependencies; an installer resolves, pins and deploys.

- Good at: reproducible, auditable installs; policy control. [inferred]
- Costs: a new manifest and lockfile for users to learn, and another runtime (APM ships Python and native binaries). [inferred]
- Bad fit: a single-user setup that already has a working installer and release branch. [inferred]

**Standard, not a tool:** Agent Plugins 1.0.0 defines `plugin.json`, `skills/` and `mcp.json` as the portable core, with hooks left to per-client extensions. [[agent-plugins.org](https://agent-plugins.org/)] The ChatGPT desktop app can read a repo-scoped legacy `.claude-plugin/marketplace.json`. [[OpenAI docs](https://developers.openai.com/plugins/build/plugins#how-local-marketplaces-work)]

## Constraints from official docs

- Skill `name`: ≤64 chars, lowercase, hyphens, equals the directory name; `description` ≤1024. [[spec](https://agentskills.io/specification#frontmatter)]
- Claude Code: component paths start with `./` and stay inside the plugin root; unknown top-level keys are stripped, unknown keys in strict objects fail the load; a plugin-root `CLAUDE.md` isn't loaded. [[plugins reference](https://code.claude.com/docs/en/plugins-reference#unrecognized-fields)]
- Codex: plugin-bundled hooks are skipped until the user reviews and trusts them, and plugins with lifecycle hooks can't enter the public directory. [[OpenAI docs](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)]

## Known pitfalls

- A wrong MCP file or entry shape fails silently or breaks the user's whole config (Copilot CLI, OpenCode); Claude Code ignores `mcpServers` in `settings.json`. [[agent details](https://symposium.dev/design/agent-details/index.html#mcp-server-configuration)]
- Event names, tool names and exit-code semantics differ per agent; Antigravity treats `{}` on `PreToolUse` as a denial. [[agent details](https://symposium.dev/design/agent-details/index.html#event-names), [common issues](https://symposium.dev/design/common-issues.html)]
- A source that reads as empty must not trigger cleanup; an unmounted registry would otherwise delete every installed skill. [[common issues](https://symposium.dev/design/common-issues.html#a-source-that-reads-as-empty-is-not-an-empty-source)]
- A failed skill update let stale-cleanup delete the installed copy, and a staging path collision deleted a user directory. [[PR #391](https://github.com/symposium-dev/symposium/pull/391)]
- Claude Code discovers skills before SessionStart hooks finish, so a first-session auto-sync may not be visible. [[issue #344](https://github.com/symposium-dev/symposium/issues/344)]
- Symlinked links dangle before `npm install`. [[RFC #2323](https://github.com/vercel-labs/skills/issues/2323)]
