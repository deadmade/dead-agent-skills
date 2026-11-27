# Prior art: multi-source recent-web/social research for agents

Source check (fresh agent, 84 claims): 70 confirmed, 2 not supported, 0 couldn't open; 5 cite nothing (marked [uncited]). Licence, release and activity re-measured against the GitHub API on 2026-11-25.

Gaps: Reddit's developer-help page returned HTTP 403, so Reddit rate limits are not cited (only its Data API Terms). Every web-search engine timed out, so the outside mention comes from HN's Algolia API. X rate limits were not read, only pricing. OSV's query API needs POST, so I used curl (PyPI "last30days" returned `{}`) plus osv.dev's list page.

## Approaches

**A. Skill plus local engine, host model as planner and judge (last30days).**
[uncited] SKILL.md routes the agent to a Python engine. The agent writes a JSON plan, the engine fans out to per-source adapters, scores and clusters, the agent synthesizes. Good at: engagement-ranked social evidence, per-source degradation. Costs: many keys, cookies and third-party CLIs. Bad fit: a repo with no Python runtime or no logged-in-session scraping [inferred].
- The engine exits 2 if an agent-hosted run has no plan ([CONFIGURATION.md, "Agent-hosted runs must pass --plan"](https://github.com/mvanhorn/last30days-skill/blob/main/CONFIGURATION.md)).
- Keyless sources first; paid and cookie sources opt-in ([README, "Bring your own keys"](https://github.com/mvanhorn/last30days-skill)).
- An `.mcpb` bundle wraps the same engine and needs host Python 3.12+ ([README, "Claude Desktop"](https://github.com/mvanhorn/last30days-skill)).

**B. Channel router with ordered fallback tools (Agent-Reach).**
`agent-reach <channel> <action>`; each action has an ordered tool list tried until one works. Good at: replacing a broken upstream tool without changing agent usage. Costs: many third-party tools; logged-in channels copy a browser session. Bad fit: needing scoring or a brief [inferred]. ("Costs: many third-party tools" [uncited].)
- Per-action "preferred plus fallback" lists, channels tiered default/optional/experimental ([README, design section and platform table](https://github.com/Panniantong/Agent-Reach)).
- Read-only, dedicated browser, burner account advised ([README, security section](https://github.com/Panniantong/Agent-Reach)).

**C. Planner/executor research agent over search APIs (GPT Researcher, Open Deep Research).**
Planner makes questions, parallel executors scrape, a filter keeps useful passages, a writer cites. Good at: general web depth, citations, pluggable retrievers and MCP. Costs: LLM spend; no engagement signal [uncited]. Bad fit: content behind logins [inferred].
- [GPT Researcher README, "Architecture", "Deep Research"](https://github.com/assafelovic/gpt-researcher): `RETRIEVER=tavily,mcp`; deep mode about $1.30 and 7-12 minutes; context filter falls back to local BM25 without a key.
- [Open Deep Research README, "Search API"](https://github.com/langchain-ai/open_deep_research): Tavily default, MCP support, separate models for summarize, research, compress, write.

**D. Orchestrator with parallel subagents (Anthropic Research).**
Lead agent spawns subagents with separate contexts. Good at: breadth-first questions. Costs: tokens. Bad fit: small lookups [inferred].
- [Anthropic engineering post](https://www.anthropic.com/engineering/multi-agent-research-system): 90.2% over single-agent Opus 4 on its internal eval; token use explained 80% of BrowseComp variance; subagents need objective, output format, tool guidance and boundaries; effort rules go in the prompt; synchronous execution blocks on the slowest subagent; early agents preferred SEO content farms.

## Official docs that constrain the design

- [Agent Skills spec](https://agentskills.io/specification): `name` max 64 chars, matches directory; `description` max 1024; keep SKILL.md under 500 lines, references one level deep.
- [Reddit Data API Terms](https://redditinc.com/policies/data-api-terms): 2.8 no masking user agent or OAuth identity; 2.9 Reddit sets limits; 3.1 commercial use needs a separate agreement; 2.4 and 3.2 no AI-training use without rightsholder permission. Whether keyless scraping is covered is not stated.
- [X API pricing](https://docs.x.com/x-api/getting-started/pricing): pay-per-use, post reads $0.005 per resource, 3 million reads per cycle cap.
- [HN Algolia API](https://hn.algolia.com/api): `search_by_date` with `created_at_i` filters; 10,000 requests/hour per IP.
- [Polymarket rate limits](https://docs.polymarket.com/api-reference/rate-limits.md): Gamma `/public-search` 350 req/10s; throttled, not rejected.
- [GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api): 60/hour unauthenticated, 5,000 with a token; honor `retry-after`.

## Pitfalls

- macOS 27 locks browser profiles, so cookie-based X silently drops ([#1193](https://github.com/mvanhorn/last30days-skill/issues/1193)).
- One Grok call took 150-170 s against a 90 s budget and returned 0 posts ([#1626](https://github.com/mvanhorn/last30days-skill/issues/1626)).
- A generic key such as `GOOGLE_API_KEY` silently sends topic and snippets to that provider ([#1566](https://github.com/mvanhorn/last30days-skill/issues/1566); [SECURITY.md, "Hosted reasoning models"](https://github.com/mvanhorn/last30days-skill/blob/main/SECURITY.md)).
- Install scanners flagged it High Risk ([#565](https://github.com/mvanhorn/last30days-skill/issues/565)); ChatGPT Work rejected it ([#1351](https://github.com/mvanhorn/last30days-skill/issues/1351)).
- The project says logged-in Reddit use "may breach Reddit's terms" ([CONFIGURATION.md, "Logged-in Reddit session"](https://github.com/mvanhorn/last30days-skill/blob/main/CONFIGURATION.md)).

## Fit [inferred]

No comparable project is Rust or Node-only (confirmed). C and D sit closest to `/research-feature` [uncited]; web-mcp already covers keyless web and papers [uncited here; verified in the grounding: plugins/shared/web-mcp/README.md:6-12]. An approach-A engine would add Python and cookie costs.

## Tool facts (last30days-skill)

- What it is: an agent skill that researches a topic across Reddit, X, YouTube, HN, Polymarket and the web, then synthesizes a summary [source: [repo API](https://api.github.com/repos/mvanhorn/last30days-skill)].
- Licence: MIT [source: [repo API](https://api.github.com/repos/mvanhorn/last30days-skill)].
- Latest release: v4.6.0, 2026-11-22 [source: [releases/latest](https://api.github.com/repos/mvanhorn/last30days-skill/releases/latest)].
- Activity: pushed 2026-11-25; 74,944 stars; 25 open issues [source: [repo API](https://api.github.com/repos/mvanhorn/last30days-skill)].
- Needs: Python 3.12+, Node (vendored X client), yt-dlp; optional keys and cookies per source; Reddit, HN, Polymarket and GitHub work keyless [source: [README](https://github.com/mvanhorn/last30days-skill)].
- Advisories: none in its own list [source: [security-advisories](https://api.github.com/repos/mvanhorn/last30days-skill/security-advisories)]; OSV: no results [source: [osv.dev](https://osv.dev/list?q=last30days)]. A miss may only mean OSV indexes no package for it [inferred; the page does not say so].
- Policy: only the latest release gets fixes [source: [SECURITY.md](https://github.com/mvanhorn/last30days-skill/blob/main/SECURITY.md)].
- Outside mention: an HN submission linking a lumify.ai announcement post (not opened) [source: [HN Algolia search](https://hn.algolia.com/api/v1/search?query=last30days-skill&tags=story)].
