# Codex flows

Install directly from this marketplace:

```sh
codex plugin add flows@dead-agent-skills
codex plugin add dead-skills@dead-agent-skills
codex plugin add serena@dead-agent-skills
codex plugin add web-mcp@dead-agent-skills
```

Codex does not install Claude dependency declarations. Companion integrations are optional at runtime: each conductor names its fallback for a missing one. Run the web-mcp and serena setup skills to configure their servers. Packs and reviewer briefs are bundled. No installer or build is required.
