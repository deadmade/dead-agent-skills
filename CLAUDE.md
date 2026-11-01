# dead-agent-skills

Read [AGENTS.md](AGENTS.md) for shared repository guidance.

Claude Code keeps its existing marketplace/plugin identifiers, Night City theme, UI mods, hooks and settings.
Claude engine modules stay in Claude packages. Codex receives shared hooks and a native Night City theme through
its adapters; it must not load Claude engine modules.

Author under `plugins/` and `catalog/`; run `npm run build:harnesses`, review both generated distributions/catalogs,
and include them with source changes. `npm run check:harnesses` checks freshness without rewriting the checkout.
