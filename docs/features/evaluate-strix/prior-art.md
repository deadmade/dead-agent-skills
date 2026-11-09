Source check: 29 confirmed, 5 not supported (corrected below), 0 couldn't open; 4 inferred claims: 1 follows, 3 partly, 0 don't.

Gaps: context7 was not queried; docs were read through web fetch. Docker, LiteLLM and Caido docs were not opened. `web-mcp:fetch` refuses JSON, so GitHub API facts came from `gh api` (same endpoints). Strix's source was not read, only its docs, AGENTS.md and issues.

**Tool facts** (Strix)

- Licence Apache-2.0; created 2025-08-05; last push 2026-11-09; 74,608 stars, 585 open issues [source: `gh api repos/usestrix/strix`].
- Latest release v1.7.0, 2026-10-05; before it v1.6.2 (2026-09-05) [source: `gh api .../releases`].
- Published security advisories: none (empty list). Open issue [#1214](https://github.com/usestrix/strix/issues/1214) reports a mount bypass on `--resume` [source: `gh api .../security-advisories`].
- Needs Docker running, a LiteLLM-format model and key; Python 3.12+ with uv to build from source; default sandbox image `ghcr.io/usestrix/strix-sandbox:1.4.0` [source: [README](https://github.com/usestrix/strix), [AGENTS.md](https://github.com/usestrix/strix/blob/main/AGENTS.md), [configuration](https://docs.strix.ai/advanced/configuration.md)].
- Telemetry is on unless `STRIX_TELEMETRY=0` [source: configuration].
- What it is: autonomous multi-agent pentester; targets: local dir, repo, URL, domain/IP, or OpenAPI/Postman file plus base URL; paid Cloud and Enterprise tiers run the same engine [source: README, [CLI](https://docs.strix.ai/usage/cli.md)].

## Comparable implementations

**1. Strix** — Docker (Kali) sandbox with Caido proxy, Playwright, nmap, nuclei, sqlmap, opengrep and more; agents are a graph [source: [README](https://github.com/usestrix/strix)], each loading up to 5 Markdown "skills" into its system prompt [source: [sandbox](https://docs.strix.ai/tools/sandbox.md), [skills](https://docs.strix.ai/advanced/skills.md)]. Output is files: `vulnerabilities/*.md`, `vulnerabilities.json`, `findings.sarif`, `run.json`; headless exit codes 0/1/2, `--fail-on`, `--max-budget`, `--max-turns` [source: AGENTS.md, CLI]. Decisions: PoC validation inside the sandbox [source: README]; budget cap checked after each reply, so spend can overshoot [source: CLI]. Nine consumer skills (`npx skills add usestrix/strix`) drive the CLI from a coding agent [source: [coding agents](https://docs.strix.ai/integrations/coding-agents.md)].

**2. Shannon (Keygraph)** — source-aware pipeline: recon and code analysis, reconciliation into an exploit queue, exploit agents, discard what can't be demonstrated ("no exploit, no report"). Repo mounted read-only into an ephemeral worker container; resumable workspaces; SARIF by default; CI gates count only `status: exploited` [source: [README](https://github.com/KeygraphHQ/shannon)]. AGPL-3.0; latest release v3.5.0 (2026-10-27) [source: `gh api repos/KeygraphHQ/shannon`].

**3. PentestGPT** — fixed-stage pipeline (recon → exploit → walkthrough, or discovery → vulnerabilities → report) that drives the Claude Code or Codex CLI as its backend; sessions persist and resume; MIT [source: [README](https://github.com/GreyDGL/PentestGPT)]. The coding agent is its engine.

**4. anthropics/claude-code-security-review** — Claude analyses a PR diff, then a separate false-positive filter (`findings_filter.py`) runs, and the result is posted as PR comments; a `/security-review` slash command offers "the same security analysis capabilities" and can be copied into `.claude/commands/` and edited; MIT [source: [README](https://github.com/anthropics/claude-code-security-review)].

**5. Trail of Bits skills** — a Claude Code/Codex marketplace of Markdown review methods: `fp-check` (mandatory false-positive gates), `differential-review`, `insecure-defaults` (a refuting verifier per candidate), `static-analysis` (CodeQL, Semgrep, SARIF); CC BY-SA 4.0 [source: [README](https://github.com/trailofbits/skills)].

## Approaches

**A. Sandboxed exploit-validating engine (Strix, Shannon, PentestGPT).** An external runtime runs agents in a container against a live target and writes reports plus SARIF to disk; findings count only if exploited. Good at: few false positives, CI gating, reproducible artifacts. Costs: Docker, long runs (Shannon 1–1.5 h, Strix deep 1–4 h [source: Shannon README; [scan modes](https://docs.strix.ai/usage/scan-modes.md)]), LLM spend, attacks that mutate the target. Bad fit: production targets [source: [Shannon safety](https://github.com/KeygraphHQ/shannon/blob/main/docs/safety.md)]; hosts without Docker [inferred]. Shannon covers only injection, XSS, SSRF and authn/authz [source: same page].

**B. Diff-scoped single-pass review (claude-code-security-review).** A prompt, a filter and a PR comment; nothing to host. Good at: cheap, per-PR, no infrastructure. Costs: findings are never exploited [inferred]. Bad fit: untrusted PRs, since the README says it is not hardened against prompt injection [source].

**C. Methods as skills (Trail of Bits, Strix's own consumer skills).** Markdown the host agent follows, optionally calling local tools. Good at: fits a plugin marketplace; no runtime of its own. Costs: relies on the host model and permissions; no isolation [inferred]. Bad fit: dynamic exploitation [inferred].

## Docs that constrain use

- Strix `--target` for a local dir mounts it live and writable: the agent edits real files (commit first) [source: [CLI](https://docs.strix.ai/usage/cli.md)].- Local models: Strix needs native structured `tool_calls`; models under ~30B often emit malformed ones [source: [local models](https://docs.strix.ai/llm-providers/local.md)].
- Providers apply cyber safeguards that can interrupt a scan mid-run; Strix's README lists access programs for Claude and GPT models [source: Strix README; Shannon README].
- Agent Skills: `name` ≤ 64 chars matching the directory, `description` ≤ 1024, `allowed-tools` experimental [source: [spec](https://agentskills.io/specification)].
- SARIF 2.1.0: `version` is `"2.1.0"`; `results` is an empty array for no findings, `null` only if the tool failed to start or begin its analysis [source: [OASIS §3.13, §3.14.23](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)].

## Known pitfalls

- Prompt injection: tools that read source can be steered by hostile repo content; Shannon says not to scan untrusted codebases [source: Shannon safety]. [#1214](https://github.com/usestrix/strix/issues/1214) (open, one reporter's account, unverified by us) describes `--resume` trusting a writable `run.json` to choose host bind mounts.
- `--max-budget` is best-effort [source: CLI]; an open issue titled "`--max-budget` is a no-op with litellm_proxy models" exists ([#1007](https://github.com/usestrix/strix/issues/1007), title only).
- Exit 0 isn't proof of a clean target: check `run.json` `status` and cost first [source: AGENTS.md].
