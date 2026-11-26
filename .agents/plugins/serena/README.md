# serena

Use the native Codex CLI to configure this integration; no project installer is required.

```sh
codex mcp add dead-agent-skills-serena -- serena start-mcp-server --context ide --project-from-cwd --enable-web-dashboard False --open-web-dashboard False --add-mode no-memories
```

Never paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.

Install the serena CLI with uv (uv tool install -p 3.13 serena-agent), or use its absolute path in the command. Its first start in a repository downloads language servers, so in the native server table [mcp_servers.dead-agent-skills-serena] add startup_timeout_sec = 15. Serena writes .serena/project.yml into each repository it activates.

The setup skill guides native MCP registration and authentication. Installing this setup plugin alone does not register a global MCP server.
