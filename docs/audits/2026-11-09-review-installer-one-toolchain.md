# Review: installer-one-toolchain

branch: worktree-installer-one-toolchain ← main (1c73c11d), 32 files, +702 −583, 7 commits + uncommitted (two README wording fixes, GLOSSARY.md, the run folder).

Intent: [spec](../features/installer-one-toolchain/spec.md), [plan](../features/installer-one-toolchain/plan.md), [ADR 0012](../adr/0012-installer-runs-its-own-copy-of-every-tool.md). Checks: `npm test` exit 0 (installer 219 run / 216 pass / 3 skipped, line coverage 87.78%, floor 84; harness-compiler 83 / 82 pass / 1 skipped; upstream-sync 227 / 227) and `npm run typecheck` clean, on b4449715 plus the two uncommitted README edits.

## Findings

Verifier: 16 of 17 merged candidates confirmed, none dropped (one candidate's detail was wrong, noted below). Severity is low unless stated. Evidence is `confirmed`.

| #   | severity | where | finding | evidence | fix (recommended) | bucket |
| --- | -------- | ----- | ------- | -------- | ----------------- | ------ |
| 1   | med | `docs/adr/0012-installer-runs-its-own-copy-of-every-tool.md:23` | The NixOS consequence says such a user "must tell the installer to skip it", but the installer has no such switch. | confirmed: `install.ts` `FLAGS` has `--strip-defaults`, `--clean` and the agent selection; deselecting web-mcp puts it in `plan.uninstall`. | Reword to what is true: every run re-points `binPath` at our musl copy; accept it, or set `binPath` again after each run. | fix before merge |
| 2   | med | `tools/installer/steps/tools.ts:38-47`, `steps/agent-browser.ts:15-18`, `steps/codex.ts:214-219` | On a platform with no pinned agent-browser build (e.g. darwin-arm64) and the user's own web-mcp and agent-browser on PATH, the Codex step now pushes a failure on every run (exit 1), drops `WEB_MCP_AGENT_BROWSER` and prints a false "Search browser is unavailable" (web-mcp falls back to PATH, `config.rs:86`). Before, the PATH agent-browser was used silently. Claude Code on such a platform gets `works:false`, so `web-builtins-off` cannot be turned on. | confirmed: verifier read the lines; the spec and ADR name neither effect. | In the Codex step, keep the PATH agent-browser when `resolveTool('agent-browser', …)` is undefined (the Codex exception already exists for web-mcp and ado-mcp); add that to ADR 0012. | fix before merge |
| 3   | low | ADR 0012 Consequences; `tools/installer/steps/uv.ts` (decline message) | Not named anywhere: a declined download is exit 1 even when a usable PATH copy exists; the uv decline text says headroom-trim and graphify wait "until uv is installed" although uv is on PATH. The decline-is-a-failure rule itself was accepted (spec:90). | confirmed | Add both effects to the ADR's Consequences; reword the uv decline line. | worth doing |
| 4   | low | `tools/upstream-sync/src/sources.ts:76,94`, `application.ts:74` | Both pin sources now share `paths: tools.json`, so locally `npm run sync -- apply uv` then `apply agent-browser` fails with "destination paths have local changes" until the first is committed. CI is fine (one job per source). | confirmed | Say "one at a time, commit between" in AGENTS.md next to the sync command. | worth doing |
| 5   | low | `tools/installer/steps/tools.test.ts:61-65` | Test "ours missing downloads whatever else is installed elsewhere" duplicates the first test; the fake's "99.0.0 elsewhere" branch is never read, so the PATH-ignored rule is not guarded. | confirmed | Delete it. | worth doing |
| 6   | low | `tools/installer/steps/tools.test.ts` | No test of a release tool (web-mcp) at VERSION or 99.0.0 (keep, no download), nor of a release tool whose download throws (failure line with `toolAdvice`). A rolled-back installer replacing a newer web-mcp would pass. | confirmed | Add those two tests through `ensureTool`. | worth doing |
| 7   | low | `tools/upstream-sync/src/application.test.mjs:194-217` | The byte-exact bump test syncs only uv; the `v`-prefixed agent-browser entry and its `check` never run. | confirmed | Add a case syncing agent-browser with `tag_name: 'v1.2.3'`. | worth doing |
| 8   | low | `steps/agent-browser.ts:31`, `AGENTS.md:14`, `GLOSSARY.md:96-98`, ADR 0012:8-10 | Docs the diff made stale: the "npm's .cmd shim" comment; the `core/` topic list lacks `tools`; the glossary says the Codex step "looks on PATH first" (not true for agent-browser, which lands in the Codex bin folder) and hard-codes `~/.claude/bin`; ADR 0012 says "every tool" but graphify is never placed in the bin folder. | confirmed | One-line fixes in each place. | worth doing |
| 9   | low | `docs/solutions/agent-browser-install-never-retried.md:8-9` | Says the installer uses "a current one on PATH" and points at `agentBrowserPlan` in `core.mjs`. The pointer was already stale at 1c73c11d; this branch makes the PATH sentence untrue too. | confirmed | Point at `ensureTool`, or mark the note as a record superseded by ADR 0012. | worth doing |
| 10  | low | `tools/installer/system/net.ts:55` | `export type { Asset }` has no importer (the plan asked only that net.ts import it). | confirmed | Delete the line. | worth doing |
| 11  | low | `tools/installer/core/options.ts:117` | Repeats `toolOfPlugin`'s lookup inline because that function throws on no match. | confirmed | Let `toolOfPlugin` return `undefined`; adjust its two callers. | worth doing |
| 12  | low | `tools/upstream-sync/src/application.test.mjs:216` | The `git diff --numstat` `'3\t3\t'` assertion repeats the full-file equality before it. | confirmed | Delete the line. | worth doing |
| 13  | low | `core/tools.ts:85-96` with `steps/tools.ts:40` | `planTool`'s `unsupported` equals `!asset`, decided twice. The plan and spec name three results, so removing it bends an agreed interface. | confirmed | Leave as is unless you want the interface changed. | worth doing |
| 14  | low | `core/tools.ts:102-106` | `releaseTool` helper with one caller; its throw cannot fire. | confirmed | Inline it. | worth doing |
| 15  | low | `tools/upstream-sync/src/sources.ts:79-84,97-102` | The uv and agent-browser `check` closures are near-copies that already differ (semver check vs hard-coded platform keys). `pinFrom` already enforces semver. | confirmed | Optional: one shared `pinCheck`. The spec keeps the sources literal. | worth doing |

Dropped: 0.

Picks: 1-10, 12, 14.

Fixed 2026-11-09: 1-10, 12, 14, in 33eb9f2d (1, 3-10, 12, 14) and 0f65c6c9 (2). A fresh fix-check read all twelve as PASS; its one remark, that the glossary entry "Our copy" still said the Codex step looks on PATH first only for web-mcp and ado-mcp, is corrected. `npm test` exit 0 (installer 221 run / 218 pass / 3 skipped, line coverage 87.77%, floor 84; harness-compiler 82 pass; upstream-sync 227 and 58 pass) and `npm run typecheck` clean, after the fixes.

## Tasks

Fix 1, 3-10, 12, 14: commit 33eb9f2d. Fix 2: commit 0f65c6c9.

## Rulings

- Fix 2's test fakes `process.platform` and `process.arch` with `Object.defineProperty` inside the test, restored in `finally`, because `CodexIO` cannot fake the platform and a new seam would be an Adds deviation.
- 11 (`toolOfPlugin` returning `undefined`), 13 (dropping `planTool`'s `unsupported`) and 15 (one shared `pinCheck`) were not picked: 11 changes a signature, 13 bends the agreed `planTool` interface, 15 merges the two sources the plan keeps literal. All three stay open as low findings.

## Parking lot

## Deviations

## Skipped

- Correctness lens: the built-in `code-review` skill needs a tree with nothing uncommitted or untracked; the run folder, GLOSSARY.md and two README edits are uncommitted, so the neutral brief ran.
- Instruction-file review: `claude-md-improver` not used; the docs lens compared AGENTS.md and the changed docs with the code by hand.
- "Every claim" pass over the docs: not offered; the docs lens returned no unchecked claims.
- Copyedit of this file: not run; it is tables and a few lines, and the copyedit keeps tables as they are.

## Run verdict
