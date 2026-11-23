# Prior art: shipping Serena in a plugin (Claude Code and Codex)

**Source check (2026-11-23, fresh agent):** 38 claims confirmed (some with nuance), 6 corrected below, 0 couldn't open; uncited lines marked [inferred].

**Gaps:** The docs pages for the dashboard, running and configuration came back as summaries from a fetch tool, not raw text, so exact key names beyond those quoted are unconfirmed. I did not find the per-context list of disabled tools (the tools page and configuration page don't give it). I found no dotfiles or third-party repos configuring Serena. The only plugin-packaged implementation is the official-directory entry. The `claude.com` marketplace listing came up in a search but was not opened. The Serena plugin tree's `.claude-plugin/` contents and the issue threads beyond #2251 and #2270 were not read. Everything is as of 2026-11-23, against the current docs only.

## Recommended launch commands (verbatim from Serena's docs)

Source: [clients page](https://oraios.github.io/serena/02-usage/030_clients.html)

Claude Code (global):

```
claude mcp add --scope user serena -- serena start-mcp-server --context claude-code --project-from-cwd
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.serena]
startup_timeout_sec = 15
command = "serena"
args = ["start-mcp-server", "--project-from-cwd", "--context=codex"]
```

Install and init, from the [README](https://github.com/oraios/serena): `uv tool install -p 3.13 serena-agent`, then `serena init`. `serena setup claude-code` and `serena setup codex` automate the client step ([clients page](https://oraios.github.io/serena/02-usage/030_clients.html)).

## Facts that constrain the design

- **Project choice.** `--project-from-cwd` walks up to the nearest folder with `.serena/project.yml` or `.git`, and is meant for CLI agents such as Claude Code, Gemini and Codex ([running](https://oraios.github.io/serena/02-usage/020_running.html)). The clients page says a global setup requires the LLM to call `activate_project`. The Codex app does not start in the project dir, so it needs "Activate the current dir as project" each session.
- **Contexts.** `claude-code` "disables tools that would duplicate Claude Code's built-in capabilities". `ide`, `claude-code` and `grok` are single-project, and the activation tool is disabled once a project is given. The default is `desktop-app` ([configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)); `ide` is suggested for other terminal clients ([clients](https://oraios.github.io/serena/02-usage/030_clients.html)). The configuration page doesn't list what `codex` disables, but the [README](https://github.com/oraios/serena) says that inside Claude Code or Codex the basic tools (`search_for_pattern`, `replace_content`, `list_dir`/`find_file`, `read_file`, `execute_shell_command`) are "typically disabled by default".
- **Memory and onboarding off.** Mode `no-onboarding` skips onboarding but keeps memory tools. Mode `no-memories` disables all memory tools and the onboarding tools ([configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)). `--mode` replaces the default modes, `--add-mode` adds on top of them ([configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)); either can be passed several times ([running](https://oraios.github.io/serena/02-usage/020_running.html)).
- **Dashboard.** It runs by default and a "Dashboard window" opens on launch (native wrapper, tray manager or default browser, per `web_dashboard_interface`). `--open-web-dashboard False` or `web_dashboard_open_on_launch: False` only stops it opening; turning the dashboard off is a separate setting. With auto-open off, the `open_dashboard` tool is enabled. It is served at port 24282 or higher ([dashboard](https://oraios.github.io/serena/02-usage/060_dashboard.html), [running](https://oraios.github.io/serena/02-usage/020_running.html)). The authors recommend keeping the dashboard enabled.
- **First run.** Language servers download on first project activation. `serena download-ls-dependencies python typescript` pre-fetches them, and downloads are tied to the Serena version ([languages](https://oraios.github.io/serena/01-about/020_programming-languages.html)). The config file is auto-created on first run ([configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)). C# may install .NET 10 ([configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)). Claude Code's `MCP_TIMEOUT` can be raised if startup is slow ([clients](https://oraios.github.io/serena/02-usage/030_clients.html)). `uvx` re-syncs on every new commit, so an install is preferred ([running](https://oraios.github.io/serena/02-usage/020_running.html)).
- **Windows.** No Windows section in the pages opened (the configuration page gives Windows config paths). Pitfalls: a client may not find `serena` even when it is on PATH, so use the full path (any OS) ([clients](https://oraios.github.io/serena/02-usage/030_clients.html)). C# needs `pwsh` on Windows, PowerShell needs it everywhere ([languages](https://oraios.github.io/serena/01-about/020_programming-languages.html)). Issue [#2270](https://github.com/oraios/serena/issues/2270) (closed, fixed Nov 2026) was an `activation_command` stdin hang over stdio.
- **Marketplace objection, verbatim:** "Do not install Serena via an MCP or plugin marketplace! They contain outdated and suboptimal installation commands." ([README](https://github.com/oraios/serena)). It objects to the install commands, not to MCP in general. Evidence: the official directory's `.mcp.json` is `uvx --from git+https://github.com/oraios/serena serena start-mcp-server`, with no context, no `--project-from-cwd` and no pin ([raw file](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/external_plugins/serena/.mcp.json)). That matches the docs' uvx cost note. The link between the two is [inferred].
- **Hooks.** Serena ships `serena-hooks`, wired in by hand: for Claude Code `remind`, `auto-approve`, `activate`, `cleanup` (`.claude/settings.json`; an "alpha feature"); for Codex `activate`, `remind`, `plan-guard`, `reset`, `plan-context`, `cleanup` (`~/.codex/hooks.json`), where the docs recommend the SessionStart hook for regular users since it does the project activation ([clients](https://oraios.github.io/serena/02-usage/030_clients.html)). I found no Serena-shipped Claude plugin [inferred: absence]. Issue [#2251](https://github.com/oraios/serena/issues/2251) (open): `remind` denies Bash and Read calls and counts `grep` pipe filters. [#2293](https://github.com/oraios/serena/issues/2293) and [#2234](https://github.com/oraios/serena/issues/2234) (open, from a search listing only): repeated `initial_instructions` under Codex, and hook guidance.
- **Stale servers.** [#2290](https://github.com/oraios/serena/issues/2290) (language_servers stays empty if you quit early) and [#2250](https://github.com/oraios/serena/issues/2250) (idle shutdown proposed) are open. Titles only.
- **REPL (v2).** `serena_repl` is optional and BETA. With the REPL, `included_apis`/`excluded_apis` replace the tool settings ([tools](https://oraios.github.io/serena/01-about/035_tools.html), [configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)). Optional tools off by default include `open_dashboard`, `delete_lines`, `insert_at_line` and `replace_lines`.

## Approaches

**A. User-scope client config (Serena's own recommendation).** `claude mcp add --scope user ...` or a `config.toml` block, after `uv tool install`. Used by: Serena's docs. Good at: the right context, project from cwd. (The docs' `uv tool install` has no version pin.) Costs: a manual or installer step per client. Bad fit: when the config must travel with a plugin [inferred]. Our installer already does the install half.

**B. Plugin-shipped `mcpServers` with the installed binary.** A plugin entry `serena start-mcp-server --context claude-code --project-from-cwd` (and the Codex equivalent), assuming `serena` is on PATH. Used by: the official directory entry ([raw file](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/external_plugins/serena/.mcp.json)), but with `uvx` and no flags. Good at: one install gives the whole bundle [inferred]. Costs: needs the installer's `uv tool install` first. A missing `serena` fails at startup, and a Windows PATH miss needs a full path [source: clients page]. It also runs against the README's warning, but the warning targets the outdated `uvx` commands [inferred]. Bad fit: users without the installer [inferred].

**C. HTTP-mode server.** `--transport streamable-http --port 9121`, with clients on `http://localhost:9121/mcp`. Good at: one shared language-server warmup [inferred]. Costs: stateful, one active project, so all clients must share it [source: running]. Bad fit: multi-project work [source], and an `mcpServers` URL entry still needs someone to start the server ("you control the server lifecycle yourself" [source: running]).

**D. Optional hooks layer.** `serena-hooks` on top of A or B. Alpha, with open blocking bugs (#2251) [source]. Bad fit for default-on Claude Code nudges replacing graphify's PreToolUse nudges one for one [inferred]; Codex's SessionStart `activate` hook is the one the docs recommend.
