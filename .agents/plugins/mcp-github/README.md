# mcp-github

Use the native Codex CLI to configure this integration; no project installer is required.

```sh
codex mcp add dead-agent-skills-mcp-github --url https://api.githubcopilot.com/mcp --bearer-token-env-var GITHUB_PERSONAL_ACCESS_TOKEN
```

Never paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.

Set GITHUB_PERSONAL_ACCESS_TOKEN in the environment that starts Codex, then restart Codex. Do not put the token in the manifest.

The setup skill guides native MCP registration and authentication. Installing this setup plugin alone does not register a global MCP server.
