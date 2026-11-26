# http-runner

Use the native Codex CLI to configure this integration; no project installer is required.

```sh
codex mcp add dead-agent-skills-http-runner -- http-runner
```

Never paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.

Put the http-runner release binary on PATH (or use its absolute path in the command). The user types each host's login on a page the server opens in their browser, so no credential goes in the environment, the command or the chat. The typed values live in logins.json in the per-user data folder or HTTP_RUNNER_DIR, a host is forgotten by deleting its entry there, and http-replies/ should be reviewed before it is committed. Release binaries: https://github.com/deadmade/dead-agent-skills/releases .

The setup skill guides native MCP registration and authentication. Installing this setup plugin alone does not register a global MCP server.
