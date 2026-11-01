---
name: setup-atlassian
description: Set up the atlassian integration installed by dead-agent-skills.
---

Use the native Codex CLI to configure this integration; no project installer is required.

```sh
codex mcp add dead-agent-skills-atlassian --url https://mcp.atlassian.com/v1/mcp
```

Never paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.

Complete OAuth with codex mcp login dead-agent-skills-atlassian. Authentication is a separate user action.
