---
name: setup-mcp-azure
description: Set up the mcp-azure integration installed by dead-agent-skills.
---

Use the native Codex CLI to configure this integration; no project installer is required.

```sh
codex mcp add dead-agent-skills-mcp-azure -- npx -y @tiberriver256/mcp-server-azure-devops@0.1.47
```

Never paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.

Set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT in the environment that starts Codex. In the native server table [mcp_servers.dead-agent-skills-mcp-azure], add env_vars = ["AZURE_DEVOPS_ORG_URL", "AZURE_DEVOPS_PAT", "AZURE_DEVOPS_DEFAULT_PROJECT", "AZURE_DEVOPS_API_VERSION"]. Set [mcp_servers.dead-agent-skills-mcp-azure.env] AZURE_DEVOPS_AUTH_METHOD = "pat" and DOTENV_CONFIG_QUIET = "true". Optional project and API-version variables use the service defaults when unset. Preserve all unrelated configuration; ask for missing non-secret preferences. Node and npx must be installed.
