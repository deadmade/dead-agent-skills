---
uses: pstack-picks:how, pstack-picks:why, graphify:graphify
---

- **Codebase:** pstack `how` on the subsystems the feature touches (fallback: 1–3 Explore agents), and pstack `why`
  when the feature moves an existing concern. Also read the domain docs that
  `<packs>/mattpocock-picks/skills/setup-matt-pocock-skills/domain.md` lists (the glossary and the ADRs).
- If `graphify-out/graph.json` exists, query it for the topic first (graphify's `references/query.md` only), read-only:
  skip its `save-result` and `graphify reflect`. No graph: offer `/graphify` for a large repo (it costs a build), only
  on the user's yes.
