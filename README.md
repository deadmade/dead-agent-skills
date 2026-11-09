# dead-agent-skills

<p align="center"><a href="plugins/default/README.md"><img src="plugins/default/assets/mascot-512.png" width="192" alt="Onibi, Night City's mascot: a hooded netrunner in a respirator, her chrome cybereye a glowing eight-point spark"></a></p>

My personal skills, flows and MCP integrations for **Claude Code and Codex**, so every machine (Linux, Windows) gets the same setup. It's
built for me; use it if it fits, but expect it to change without notice.

Both native marketplaces ship on this repository's `release` branch, which every release moves forward. **The
installer is optional.** No build or npm setup is needed to add either marketplace or install its skills; `main`
holds only the sources, so name the branch.

**Claude Code** — add the marketplace, then pick plugins:

```text
/plugin marketplace add deadmade/dead-agent-skills@release
/plugin install dead-skills@dead-claude-skills
/plugin install flows@dead-claude-skills
```

**Codex** — add the same repository using Codex's native marketplace commands:

```sh
codex plugin marketplace add deadmade/dead-agent-skills --ref release
codex plugin add flows@dead-agent-skills
codex plugin add dead-skills@dead-agent-skills
codex plugin add graphify@dead-agent-skills
codex plugin add web-mcp@dead-agent-skills
```

On that branch the Claude catalog is `.claude-plugin/marketplace.json`; the Codex catalog is `.agents/plugins/marketplace.json`.
They have separate plugin selections and host-specific packages. The repository moved to this GitHub name, but
Claude's marketplace/plugin identifiers remain stable for existing users.

The native packages live under `.agents/plugins/` (Codex) and `.claude-plugin/` (Claude Code), including skill packs, reviewer briefs, C# libraries and licenses.
They install directly from the Git marketplace. Codex does not apply Claude's plugin dependency declarations, so
install the companion plugins shown above for flows. Flows also document fallbacks when an integration is missing.
Standalone options include hallmark, shop (price checks on Kleinanzeigen and Geizhals through web-mcp), Rust, C# and Postgres skills, plus MCP setup plugins for GitHub, Azure and
Atlassian. MCP setup skills provide native `codex mcp add` commands and authentication instructions; installing a
setup skill alone does not configure a global server. No setup skill requires the project installer.

Each MCP setup skill and package README carries the exact `codex mcp add` command, the release binary it needs and
the environment variables to set, so no setup is spelled out here. Credentials are not embedded in the marketplace.

Shared startup rules and desktop notifications have packaged adapters for both harnesses. Night City supplies
both native themes. md-pane, status lines, LSP plugins and Claude UI mods remain Claude-only extensions. Flows share phases, approval gates and saved state through host adapters. Without
subagents the main session does delegated work (searching, exploring) itself; independent checks are skipped and
recorded as not checked.

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
[md-pane](plugins/opt-in/md-pane/README.md) for reading the `.md` files
Claude names in a pane beside the chat, [web-mcp](plugins/shared/web-mcp/README.md) for web search read in one browser window of its own, page fetching, a page's repeating items as numbered rows,
passive lookups and a browser with an archive of everything it pulled, and
[headroom-trim](plugins/opt-in/headroom-trim/README.md), which shrinks every tool result with headroom's offline compression before Claude reads it.

The opt-in [flows](plugins/flows/README.md) plugin ties the rest together: conductor skills (`/build-feature`,
`/fix`, `/review-code`, `/learn` and more) that run the other plugins' skills in order,
most with approval gates. Build and research flows keep a flow.md to resume from; /review-code keeps an audit file.
They keep the number of agents small, ultracode included, and run each on a model suited to its job rather than the one you picked. Picking flows installs every plugin its conductors use.
flows also sets the house standard for prose. A `writing` skill states Williams and Bizup's _Style_ in our own words.
A code-only check on each Write or Edit of a Markdown file flags conversation shorthand such as `Q11` or `round 2`
(`FLOWS_PROSE_CHECK=off` turns it off). Before a gate, a fresh editor agent on the strongest model the host
offers copyedits the spec, plan or report by the skill; when code finds something lost, the gate shows the unedited document and what was lost.
flows also carries the skill packs they read by path from `plugins/flows/packs/` (superpowers, ponytail, paper-lookup,
Cloudflare's security-audit and the mattpocock, pstack and Trail of Bits picks). The packs are not plugins: nothing in them loads on its own, so
their skills, hooks and ponytail's band stay out of your sessions outside the conductors, and the installer removes
old installs of them.

    npx --allow-remote=root https://github.com/deadmade/dead-agent-skills/releases/latest/download/installer.tgz

The installer (Node standard library only, written in TypeScript and attached to each release built to JS) shows one page per category where you pick what to install, remove or
update, then applies only the changes. It points the marketplace at the `release` branch, which follows the newest
release, so Claude Code updates the plugins on its own (rerun the installer for new web-mcp binaries), and
it always denies Claude reading `.env` files and credential dirs and keeps session transcripts (Claude Code deletes them after 30 days unless `cleanupPeriodDays` is set). It
lets at most 8 workflow agents run at once (`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`, unless you set your own) and
compacts the context at 350K tokens (`autoCompactWindow`, unless you set your own; it only matters on 1M-context models). It also switches Claude Code to a short, answer-first `concise` output style (`outputStyle`, unless you chose one; the style file goes to `~/.claude/output-styles/`). Optional toggles add ccstatusline
and dcg; the danger zone can strip all foreign plugins or reset `~/.claude` to a clean slate (after a backup).
Contributor steps — versioning and releases, the Rust workspace, authoring plugins and building both harness
packages — are in [AGENTS.md](AGENTS.md), which this file doesn't repeat.

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
