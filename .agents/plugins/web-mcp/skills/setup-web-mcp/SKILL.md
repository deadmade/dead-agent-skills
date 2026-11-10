---
name: setup-web-mcp
description: Set up the web-mcp integration installed by dead-agent-skills.
---

Use the native Codex CLI to configure this integration; no project installer is required.

```sh
codex mcp add dead-agent-skills-web-mcp -- web-mcp
```

Never paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.

Put the web-mcp release binary on PATH (or use its absolute path in the command). Install agent-browser separately for browser/search/rows tools; fetch uses it for browser fallback; lookup works without it. Release binaries: https://github.com/deadmade/dead-agent-skills/releases .
