# Strix: skip

Its value is attacking a live target, and this repository has no network service to attack, while its source review is already covered.

- Date: 2026-11-09
- Read: https://github.com/usestrix/strix (release v1.7.0)
- Name resolved: searched "Strix open source tool GitHub"; picked `usestrix/strix`, the open-source tool with most results. Rejected: Strix Advanced Tools (`strix-tool.github.io`), a set of desktop privacy utilities.

## Assumed purpose

Test `web-mcp`, `ado-mcp` and the trim server for exploitable vulnerabilities, beyond what source review finds.

## What it is

An autonomous multi-agent pentester that works in a Docker sandbox against a local directory, repository, URL, domain or API contract. Agents validate findings with proofs of concept and write reports and SARIF to disk.

## Fit here

- Has: the source-first `security-audit` pack, `/review-code`'s security lens (`plugins/flows/skills/review-code/references/lenses.md:12`; verified), `claude-security` and the built-in `security-review` (visible in the session), and the skill scanner (`package.json:14`; verified).
- Targets: both Rust servers speak stdio, and the trim server binds to `127.0.0.1` (`plugins/opt-in/headroom-trim/server/server.py:108`; verified). So little is reachable (inferred).
- Against: no Docker file here (measured by search). A local target is mounted live and writable, and the vendored pack forbids live probing (`plugins/flows/packs/security-audit/skills/security-audit/SKILL.md:42`; verified).

## Evidence

- Licence: Apache-2.0 ([API](https://api.github.com/repos/usestrix/strix)).
- Latest release: v1.7.0, 2026-10-05 ([API](https://api.github.com/repos/usestrix/strix/releases/latest)).
- Activity: pushed 2026-11-09 ([API](https://api.github.com/repos/usestrix/strix)).
- Needs to run: Docker, an LLM model and usually a key ([README](https://github.com/usestrix/strix)); telemetry on by default ([configuration](https://docs.strix.ai/advanced/configuration.md)).
- Security: 0 published advisories ([API](https://api.github.com/repos/usestrix/strix/security-advisories)). One unverified open report: `--resume` trusts a writable `run.json` for bind mounts ([#1214](https://github.com/usestrix/strix/issues/1214)).

Source check: 29 confirmed, 5 not supported, 0 couldn't open.

## Alternatives

- Shannon: the same exploit-validating shape; AGPL-3.0.
- PentestGPT: drives Claude Code or Codex through fixed stages.
- `claude-code-security-review`: a PR diff, a filter and comments.
- Trail of Bits skills: review methods as Markdown; `sharp-edges` is already vendored here.

## Next step

Skip it here. The answer changes for a project with a running web application or API you own and may test: then it is a try, on a staging target.

## Skipped

None.

Not checked: installing and running the tool; its source, only docs and issues. The tool was not tried. Run it only against systems you own or may test.
