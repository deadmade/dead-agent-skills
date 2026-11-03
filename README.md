# dead-agent-skills

<p align="center"><a href="plugins/default/README.md"><img src="plugins/default/assets/mascot-512.png" width="192" alt="Onibi, Night City's mascot: a hooded netrunner in a respirator, her chrome cybereye a glowing eight-point spark"></a></p>

My personal skills, flows and MCP integrations for **Claude Code and Codex**, so every machine (Linux, Windows) gets the same setup. It's
built for me; use it if it fits, but expect it to change without notice.

Both native marketplaces ship in this repository. **The installer is optional.** No build or npm setup is needed to
add either marketplace or install its skills.

**Claude Code** — add the marketplace, then pick plugins:

```text
/plugin marketplace add deadmade/dead-claude-skills
/plugin install dead-skills@dead-claude-skills
/plugin install flows@dead-claude-skills
```

**Codex** — add the same repository using Codex's native marketplace commands:

```sh
codex plugin marketplace add deadmade/dead-claude-skills
codex plugin add flows@dead-agent-skills
codex plugin add dead-skills@dead-agent-skills
codex plugin add graphify@dead-agent-skills
codex plugin add web-mcp@dead-agent-skills
```

The Claude catalog is `.claude-plugin/marketplace.json`; the Codex catalog is `.agents/plugins/marketplace.json`.
They have separate plugin selections and host-specific packages. The repository still has its original GitHub name;
Claude's marketplace/plugin identifiers remain stable for existing users.

Native packages are checked in under `.agents/plugins/` (Codex) and `.claude-plugin/` (Claude Code), including skill packs, reviewer briefs, C# libraries and licenses.
They install directly from the Git marketplace. Codex does not apply Claude's plugin dependency declarations, so
install the companion plugins shown above for flows. Flows also document fallbacks when an integration is missing.
Standalone options include hallmark, Rust, C# and Postgres skills, plus MCP setup plugins for GitHub, Azure and
Atlassian. MCP setup skills provide native `codex mcp add` commands and authentication instructions; installing a
setup skill alone does not configure a global server. No setup skill requires the project installer.

For example, Context7 can be configured directly:

```sh
codex mcp add dead-agent-skills-dead-skills --url https://mcp.context7.com/mcp
```

web-mcp needs its release binary on PATH (or its absolute path in the native MCP command). Browser/search tools also
need agent-browser. The setup skill and package README describe these prerequisites. GitHub uses
`GITHUB_PERSONAL_ACCESS_TOKEN`; Azure uses the ado-mcp release binary with `ADO_ORG_URL` and `ADO_PAT` with a documented environment
allowlist. Atlassian uses native Codex OAuth login. Credentials are not embedded in the marketplace.

Shared startup rules and desktop notifications have packaged adapters for both harnesses. Night City supplies
both native themes. tui-review, md-pane, status lines, LSP plugins and Claude UI mods remain Claude-only extensions. Flows share phases, approval gates and saved state through host adapters. When a
session has no subagents, those steps are skipped and reported as not checked. tui-review is optional and is no
longer a flow dependency.

For automated machine setup, the optional installer manages either or both agents and handles binaries, native MCP
registration and safe migration from existing managed global rules. It accepts `--agents=codex`, `--agents=claude-code`, or both separated by a
comma. Codex installer state lives under `$CODEX_HOME/dead-agent-skills` (default `~/.codex/dead-agent-skills`).
The old executable name remains an alias.

For Claude Code, the default bundle, **[dead-skills](plugins/default/README.md)**, pulls in claude-code-setup, claude-md-management, security-guidance and
claude-security and agent-review, and itself carries Context7, Night City (a
toned-down synthwave theme that everything else here is painted in), desktop notifications when a turn ends or Claude
waits for you, and my global rules. Everything else is opt-in: language
servers, language and database skills (rust, csharp, postgres), integrations (GitHub, [Azure DevOps Server](plugins/opt-in/mcp/mcp-azure/README.md), Atlassian on Codex), skill packs
like hallmark and graphify, and tools such as
[tui-review](plugins/shared/tui-review/README.md), [md-pane](plugins/opt-in/md-pane/README.md) for reading the `.md` files
Claude names in a pane beside the chat, [web-mcp](plugins/shared/web-mcp/README.md) for web search read in one browser window of its own, page fetching,
passive lookups and a browser with an archive of everything it pulled, and
[headroom-trim](plugins/opt-in/headroom-trim/README.md), which shrinks every tool result with headroom's offline compression before Claude reads it.

Also available: [flow-cockpit](plugins/opt-in/flow-cockpit/README.md), whose skill writes the views of the flow cockpit, a window
over your flow runs, audits and Claude sessions (on Linux the app comes from the flake:
`nix run github:deadmade/dead-claude-skills#flow-cockpit`; on Windows the installer downloads it to
`%USERPROFILE%\.claude\bin\flow-cockpit\`). It also installs hooks that record questions, permission
prompts and agent starts and stops per session into a local capture folder, which only the window reads.

The opt-in [flows](plugins/flows/README.md) plugin ties the rest together: conductor skills (`/build-feature`,
`/fix`, `/review-code`, `/learn` and more) that run the other plugins' skills in order,
with approval gates and a state file to resume from. They keep the number of agents small, ultracode included, and run
each on a model suited to its job rather than the one you picked. Picking flows installs every plugin its conductors use.
flows also sets the house standard for prose. A `writing` skill states Williams and Bizup's _Style_ in our own words.
A code-only check on each Write or Edit of a Markdown file flags conversation shorthand such as `Q11` or `round 2`
(`FLOWS_PROSE_CHECK=off` turns it off). Before a gate, an Opus editor copyedits the spec, plan or report by the skill;
when code finds something lost, the gate shows the unedited document and what was lost.
flows also carries the skill packs they read by path from `plugins/flows/packs/` (superpowers, ponytail, paper-lookup,
Cloudflare's security-audit and the mattpocock, pstack and Trail of Bits picks). The packs are not plugins: nothing in them loads on its own, so
their skills, hooks and ponytail's band stay out of your sessions outside the conductors, and the installer removes
old installs of them.

    npx --allow-remote=root https://github.com/deadmade/dead-claude-skills/releases/latest/download/installer.tgz

The installer (Node standard library only, written in TypeScript and attached to each release built to JS) shows one page per category where you pick what to install, remove or
update, then applies only the changes. It points the marketplace at the `release` branch, which follows the newest
release, so Claude Code updates the plugins on its own (rerun the installer for new tui-review and web-mcp binaries and the flow cockpit's Windows app), and
it always denies Claude reading `.env` files and credential dirs and keeps session transcripts (Claude Code deletes them after 30 days unless `cleanupPeriodDays` is set). It
lets at most 8 workflow agents run at once (`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`, unless you set your own) and
compacts the context at 350K tokens (`autoCompactWindow`, unless you set your own; it only matters on 1M-context models). Optional toggles add ccstatusline
and dcg; the danger zone can strip all foreign plugins or reset `~/.claude` to a clean slate (after a backup).
Everything ships as one version. Every merge to main releases a patch; a bigger step is `npm run release -- minor`
and `git push --follow-tags origin main`. The tag builds the installer and the binaries and publishes the GitHub
release they're downloaded from. From a checkout,
`npm ci` once, then `node tools/installer/install.ts` runs the installer (Node 26 or newer) and `npm run typecheck` checks it.

Author plugins in `plugins/catalog.json` and their source resources under `plugins/`. The catalog declares shared
resources, dependencies, targets and native overlays; hooks use neutral events in each plugin's `hooks/hooks.json`.
Run `npm run build:harnesses`, review both native distributions and root catalog changes, then include them in the
same commit as the source. Never edit `.claude-plugin/` or `.agents/plugins/` by hand.
`npm run check:harnesses` rebuilds in a temporary directory and detects missing, changed and extra outputs without
rewriting your checkout. Vendoring and release scripts
regenerate both targets; CI checks freshness. `npm pack` checks freshness and compiles the optional installer.

Required unsupported capabilities fail generation; optional unsupported events have diagnostics and are omitted.
Native extensions such as Claude engine modules never enter Codex packages. A future harness needs a catalog target,
capability table, package/theme adapter and packaged live-event adapter, with native fixtures and integration tests;
shared feature handlers continue to consume normalized inputs.

Native hooks require Node on PATH. Review native hook trust before enabling them in Codex, then verify startup in a
fresh session. Installation alone does not prove trust. Existing installer-managed instructions stay until a matching
runtime receipt and your explicit verification allow removal of only our block; unrelated instructions remain.
Do not delete the block manually just because a plugin appears installed. Effective `AGENTS.override.md` sources
are respected, and changed blocks or paths are preserved.

Run the packaged `setup-night-city` skill in Codex: it copies the shipped `.tmTheme` under `$CODEX_HOME/themes/`
(default `~/.codex/themes/`) without overwriting a differing file, then guides selection with native `/theme`.
Claude keeps its theme and native UI mod. Codex setup does not change the terminal palette, spinner words or status line.

Validation evidence on Linux: Codex 0.166.0 accepted the native marketplace/package; Claude Code 2.1.316 validated
native manifests. Fixtures are pinned to Claude 2.1.314 and Codex 0.166.0 with per-fixture provenance; most lifecycle
examples are documentation-derived, not captured events. These are tested baselines, not a claim of a verified minimum
version. Authenticated hook trust/execution, missing-Node interpretation, native theme visuals and Windows acceptance
remain pending. See [the feature validation record](docs/features/harness-independent-plugins/flow.md).
