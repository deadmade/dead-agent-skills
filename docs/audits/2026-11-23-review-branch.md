# Review: branch serena-replaces-graphify

branch: serena-replaces-graphify ← main, 58 files, +480 −2254, 5 commits (merge-base 5a756b2, head dd2560b); called
inline from /build-feature (`docs/features/serena-replaces-graphify/flow.md`).

Lenses: correctness (neutral ponytail brief: the tree has untracked run notes, so the built-in review didn't apply),
lean, tests, docs, security, risk; one fresh verifier. Checks: the caller's latest run on dd2560b (`npm test`: repo and
mods passed; node failed only the 5 EPERM symlink tests that fail identically on the merge-base; typecheck exit 0).

## Findings

| #   | severity | where                                                                          | finding                                                                                                                                                                                | evidence                                                                                                                                                | fix (recommended)                                                                                              | bucket      |
| --- | -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | med      | `README.md:15-17`, `plugins/catalog.json:13`                                   | Installing flows from the marketplace without the installer brings serena with `serenaPath` = `serena`; with no uv tool, every session shows a failed MCP server, and nothing says so. | confirmed: catalog makes serena a flows dependency; `${config.serenaPath}` defaults to `serena`; README has no line                                     | One README line: flows needs `uv tool install -p 3.13 serena-agent` (or the installer)                         | worth doing |
| 2   | med      | `plugins/shared/serena/plugin.json` (`--project-from-cwd`), ADR 0016           | Opening any repo with flows starts serena's language servers there, which can run the repo's build code (rust-analyzer: `build.rs`, proc macros); undocumented.                        | plausible: `.serena/` writes are documented (ADR 0016), the language-server start is not; serena's source not read                                      | One ADR 0016 consequence line and a phrase in the plugin description                                           | worth doing |
| 3   | low      | `plugins/shared/serena/plugin.json` `serenaPath` default                       | On Windows a bare `serena` may resolve to a binary planted in the repo, where the installer never set an absolute path.                                                                | plausible: `tools/installer/system/proc.ts:20-21` notes cwd-first lookup; Claude Code's MCP spawn not checked; web-mcp's `binPath` has the same pattern | Document it (both plugins), or an empty default                                                                | worth doing |
| 4   | low      | `plugins/flows/steps/ground-code.toml:5`, `skills/understand/SKILL.md:6`       | `uses: serena:serena` renders `├ serena: serena` in the flows README trees, a skill serena doesn't ship.                                                                               | confirmed: `plugins/flows/README.md:43…140`                                                                                                             | `uses` names its tools: `serena:find_symbol`, `serena:find_referencing_symbols`, `serena:get_symbols_overview` | worth doing |
| 5   | low      | `tools/installer/install.ts:331-336`, `tools/installer/steps/codex.ts:311-323` | graphify's CLI cleanup is written twice; a change to it can reach one host only.                                                                                                       | confirmed: both find a uv, call `uninstallGraphify`, else push a done line                                                                              | `uninstallGraphify(candidates)` picks the first existing uv and pushes the line itself                         | worth doing |
| 6   | low      | `tools/installer/steps/codex.ts:209`                                           | No test pins that a non-retired plugin's failed removal still throws; widening the catch would pass every test.                                                                        | confirmed: `if (!plan.retired.includes(name)) throw error;`, no rejects test                                                                            | One test: a failing `plugin remove postgres@…` makes `applyCodex` reject                                       | worth doing |
| 7   | low      | `tools/installer/steps/codex.test.ts:56,190,224`                               | The default cleanup (no uv download just to uninstall graphifyy) never runs in a test.                                                                                                 | confirmed: every test replaces `io.cleanup`                                                                                                             | One test running the default with no uv present, expecting the done line                                       | worth doing |
| 8   | low      | `tools/installer/steps/uv.ts:93`                                               | The `uv tool list` parse has no test against captured output (AGENTS.md: parsers of other tools' output test against `core/fixtures/`).                                                | confirmed: no fixture, no test references `uninstallGraphify`                                                                                           | Move the match to `core/`, test it on a captured `uv tool list`                                                | worth doing |
| 9   | low      | `tools/installer/core/tools.test.ts:91`                                        | The test's name claims `installSerena`'s behaviour but checks only the tools.json constant and `toolPath`.                                                                             | confirmed: lines 91-97                                                                                                                                  | Rename to what it checks                                                                                       | worth doing |
| 10  | low      | ADR 0016 / README                                                              | Users who added serena themselves get a second server (two sets of tools and language servers).                                                                                        | plausible: different ids; misbehaviour not shown                                                                                                        | Mention it                                                                                                     | worth doing |
| 11  | low      | `docs/components/installer.md`                                                 | The installer page says nothing about serena's uv install, `serenaPath`, the Codex `mcp add` and timeout, or graphifyy's removal.                                                      | confirmed: neither installer.md nor headroom-trim.md mentions them (graphify was never documented there either)                                         | A short paragraph on the uv step                                                                               | worth doing |

Dropped: 8 (pinning serena-agent, the dashboard, a symlinked Codex config.toml throwing, the Windows upgrade lock, and
`pypiSpec` are decided in the spec, plan or ADRs; ADR 0012's sentence, README's opt-in list and AGENTS.md's "both
harnesses" read as accurate).

- Gate 3, review-code: report approved 2026-11-23

Picks: 1, 2, 4, 5, 6, 9, 10, 11

Fixed 2026-11-23: 1
Fixed 2026-11-23: 2
Fixed 2026-11-23: 4
Fixed 2026-11-23: 5
Fixed 2026-11-23: 6
Fixed 2026-11-23: 9
Fixed 2026-11-23: 10
Fixed 2026-11-23: 11

Fix check (fresh agent, 2026-11-23): all eight PASS. After the fixes, `npm test`: repo and mods passed, node only
the 5 tracked EPERM failures; typecheck exit 0.

## Tasks

Fix 1, 2, 4, 5, 6, 9, 10, 11: base dd2560b (uncommitted until Decide), files clean (the files the findings name, plus
`plugins/flows/README.md`, generated from `uses`).

## Rulings

## Parking lot

- 3 `plugins/shared/serena/plugin.json`, `plugins/shared/web-mcp/plugin.json`: bare default commands on Windows (not picked).
- 7 `tools/installer/steps/codex.test.ts`: a test of the default graphify cleanup with no uv present (not picked).
- 8 `tools/installer/steps/uv.ts`: the `uv tool list` match in `core/` with a captured fixture (not picked).

## Deviations

## Skipped

- pstack `interrogate`: not run (the user said lenses only).

## Run verdict

Done (2026-11-23). Picks fixed and checked; 3, 7, 8 left as follow-ups. Not checked: a real Codex rerun, the
MCP server's cwd under Claude Code, serena starting.
