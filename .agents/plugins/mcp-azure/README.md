# mcp-azure

Use the native Codex CLI to configure this integration; no project installer is required.

```sh
codex mcp add dead-agent-skills-mcp-azure -- ado-mcp
```

Never paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.

Put the ado-mcp release binary on PATH (or use its absolute path in the command). Set ADO_ORG_URL (the Azure DevOps Server collection URL) and ADO_PAT in the environment that starts Codex. In the native server table [mcp_servers.dead-agent-skills-mcp-azure], add env_vars = ["ADO_ORG_URL", "ADO_PAT", "ADO_PROJECT_DIR"]. ADO_PROJECT_DIR optionally overrides the repository used for project detection. Preserve all unrelated configuration; ask for missing non-secret preferences. Release binaries: https://github.com/deadmade/dead-agent-skills/releases .

The setup skill guides native MCP registration and authentication. Installing this setup plugin alone does not register a global MCP server.
