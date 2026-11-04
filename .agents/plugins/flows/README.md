# Codex flows

Install directly from this marketplace:

```sh
codex plugin add flows@dead-agent-skills
codex plugin add dead-skills@dead-agent-skills
codex plugin add graphify@dead-agent-skills
codex plugin add web-mcp@dead-agent-skills
```

Codex does not install Claude dependency declarations. Companion integrations are optional at runtime: each conductor names its fallback for a missing one. Run the web-mcp setup skill to configure its server. Packs, reviewer briefs and graphify resources are bundled. No installer or build is required.
