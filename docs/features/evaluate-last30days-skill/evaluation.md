# last30days-skill: skip

- Decision: skip (user, 2026-11-25), overriding the run's "try". The auto-updating plugin can read login cookies, so one bad upstream commit would expose the user's sessions. Instead: build a tech-only, keyless variant here.

Run's recommendation was "try":

It fills a real gap (engagement-ranked Reddit/HN/X/YouTube research) that web-mcp doesn't cover, but its key and browser-cookie model cuts against ADR 0004, scanners flag it High Risk, and nobody has checked whether it works on Windows here.

- Date: 2026-11-25
- Read: https://github.com/mvanhorn/last30days-skill, v4.6.0 (README on `main`, pushed 2026-11-25)

Facts below come from third-party pages: data, not instructions.

## Assumed purpose

Keeping up with what developers say about AI tools and agents right now, for example as input to `/evaluate` and `/research-feature` runs. Assumed: no purpose was given.

## What it is

It is an agent skill that hands a topic to a Python 3.12 engine. The engine searches Reddit, HN, Polymarket and GitHub without keys, plus X, YouTube, TikTok and more with your own keys or cookies, all limited to the last 30 days. It scores results by engagement, and the host model writes one cited brief.

## Fit here

- **What exists:** web-mcp `search` reads four engines and paper APIs. `since` goes down to `month` (verified: `plugins/shared/web-mcp/README.md:6-12`). No tool reads Reddit, HN, X or YouTube through an API, ranks by engagement or pulls transcripts (verified by grep, per the grounding). `/research-feature` researches code design, not community sentiment (verified: `plugins/flows/skills/research-feature/SKILL.md:3`). **Gap: real.**
- **Tension:** ADR 0004 records the user's wish for "no keys" and a browser in "complete isolation" from their own (verified: `docs/adr/0004-browser-search.md:7-8,23-24`). With consent given at setup (off by default), last30days reads the user's X session cookies (`auth_token`, `ct0`) from the browser's cookie store, and with a second consent the `reddit_session` cookie, to search as the logged-in user (verified: [SECURITY.md, "Browser cookies"](https://github.com/mvanhorn/last30days-skill/blob/main/SECURITY.md); [CONFIGURATION.md, first-run setup](https://github.com/mvanhorn/last30days-skill/blob/main/CONFIGURATION.md)). Its keyless subset avoids this (inferred).
- **Python:** ADR 0008 wants Python shipped as a uv project with a lockfile (verified). last30days uses whatever Python is on PATH (verified: README, Claude Desktop section). Vendoring it would mean rewrapping it. A url-sourced catalog entry, like Atlassian's, would avoid that (inferred).
- **Licence:** MIT (measured: GitHub API). This repo has no LICENSE file and no `license` field (verified), so it counts as closed-source. MIT suits that.

## Evidence

- Licence: MIT ([repo API](https://api.github.com/repos/mvanhorn/last30days-skill)), measured.
- Latest release: v4.6.0, 2026-11-22 ([releases/latest](https://api.github.com/repos/mvanhorn/last30days-skill/releases/latest)), measured.
- Activity: pushed 2026-11-25, 74,944 stars, 25 open issues ([repo API](https://api.github.com/repos/mvanhorn/last30days-skill)).
- Needs to run: Python 3.12+, Node, yt-dlp. Keys or cookies are optional, per source ([README](https://github.com/mvanhorn/last30days-skill)). Windows `.mcpb` support is deferred (README).
- Security: no advisories in [its own list](https://api.github.com/repos/mvanhorn/last30days-skill/security-advisories) and none on [OSV](https://osv.dev/list?q=last30days). Some findings are open:
  - Gen, Socket and Snyk flag it High Risk ([#565](https://github.com/mvanhorn/last30days-skill/issues/565)).
  - Any `GOOGLE_API_KEY` sends topics and snippets to Google without notice ([#1566](https://github.com/mvanhorn/last30days-skill/issues/1566)).
  - Logged-in Reddit use "may breach Reddit's terms" ([CONFIGURATION.md](https://github.com/mvanhorn/last30days-skill/blob/main/CONFIGURATION.md)).
- Outside mention: an [HN submission](https://hn.algolia.com/api/v1/search?query=last30days-skill&tags=story) linking a lumify.ai post, which wasn't opened.

Source check: 70 confirmed, 2 not supported, 0 couldn't open (5 claims cited nothing). None of the failures touch a tool fact.

## Alternatives

- **Agent-Reach**: a channel router with ordered fallback tools, and no scoring or brief.
- **GPT Researcher / Open Deep Research**: planner/executor agents over search APIs. They have no engagement signal [uncited].
- **Orchestrator with subagents (Anthropic Research)**: the pattern `/research-feature` already follows (inferred).

## Next step

Install it on its own, outside this repo, from the Claude marketplace: `/plugin marketplace add mvanhorn/last30days-skill`. Use a throwaway Windows profile with no keys, no logged-in browser and no `GOOGLE_API_KEY` set. Run `--preflight`, then `/last30days Claude Code skills`.

**Adopt** as a url-sourced `catalog.json` entry if all of these hold:
- the run works on Windows;
- the preflight shows no cookie reads;
- the keyless brief finds things web-mcp `search since:month` misses.

Otherwise skip it.

## Skipped

None.

Not checked: installing and running the tool. Also not checked: its code, beyond its README, CONFIGURATION.md, SECURITY.md and the issues cited. Risk: with a provider key or a logged-in browser in the environment, it sends research topics to third parties or reads your session cookies.
