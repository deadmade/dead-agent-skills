# web-mcp

Use the native Codex CLI to configure this integration; no project installer is required.

```sh
codex mcp add dead-agent-skills-web-mcp -- web-mcp
```

Never paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.

Put the web-mcp release binary on PATH (or use its absolute path in the command). Install agent-browser separately for browser/search tools; fetch uses it for browser fallback; lookup works without it. Release binaries: https://github.com/deadmade/dead-claude-skills/releases .

The setup skill guides native MCP registration and authentication. Installing this setup plugin alone does not register a global MCP server.
