# Serena replaces graphify

flows' grounding asks where a symbol is defined, who calls it and what uses it. graphify answered those from a
knowledge graph built per repository, and nudged towards it with `tool.starting` hooks. cartobench, the user's own
deterministic benchmark (no model in the loop, a SCIP-derived answer key, 15 repositories in five languages), ranked
graphify below plain rg (rating 975 against rg's 1000) and `graphify query`, the command graphify's skill uses, near
last (708, 4 % median quality). Serena, an MCP server over language servers, ranked first (1119, 100 % median
quality, 233 median tokens; report of 2026-11-22).

So the `serena` plugin takes graphify's place: flows depends on it, and the grounding step uses its symbol tools when
they are present, else the Explore fallback. It ships as an MCP server in `plugin.json`, not as a vendored skill, and
runs as `serena start-mcp-server --context ide --project-from-cwd --enable-web-dashboard False --open-web-dashboard False --add-mode
no-memories` on both hosts. The installer installs `serena-agent` with its own uv (ADR 0008), unpinned as graphify
was (ADR 0012), points `serenaPath` at that copy, and uninstalls the old `graphifyy` tool.

## Considered options

- **Keep graphify, add serena.** Rejected: two code-mapping tools for the same questions, and the one that loses to
  rg would still nudge every read.
- **Serena as an opt-in MCP only.** Rejected: flows, whose grounding asks exactly the benchmark's questions, would
  never use it.
- **User-scope `claude mcp add`**, Serena's own recipe. Rejected: it lives outside the marketplace, so nothing
  updates or removes it, and Codex users without the installer get nothing.
- **Serena's memories and onboarding on.** Rejected: a fourth memory store beside AGENTS.md, `docs/` and Claude's
  memory, and an onboarding pass that fills a session in every new repository. The benchmark arm ran without them.
- **Serena's `claude-code` context.** Rejected: its prompt makes the built-in Read and Edit "FORBIDDEN" in every
  session; `ide` excludes the same duplicate tools with a mild prompt.
- **Serena's hooks.** Not taken: alpha for Claude Code, and `--project-from-cwd` does Codex's activation.

## Consequences

- Serena writes `.serena/project.yml`, `project.local.yml` and `.gitignore` into each repository it activates.
- Serena's first start in a repository downloads and starts its language servers, slower than graphify's hooks.
- `--project-from-cwd` starts those language servers in every repository a session opens, and some run the
  repository's build code (rust-analyzer runs `build.rs` and proc macros), so opening a repository with flows runs more
  of it than graphify did.
- A serena the user added themselves runs beside this one: two sets of tools and language servers.
- Without the installer (a marketplace install), serena's CLI must be installed by hand, or every session reports a
  failed serena server.
- Serena is GPL-3.0-or-later; it is installed on the machine, not vendored, so nothing here redistributes it.
- `graphifyy` is uninstalled once, in the installer run that retires the graphify plugin and only with a uv copy
  already present; a skipped or failed uninstall leaves the command in the summary and is not retried.
- graphify's vendored files, its weekly sync and its `graphify-out/` folder are gone; old feature and audit notes
  that mention it are history.
