# Installer: one tool manifest Implementation Plan

<!-- glance -->
```
Plan: Installer: one tool manifest · 6 tasks · ~1500 lines · 33 files
 1  [1 Manifest and the pure c…]
 2  [2 One engine, used by uv … ←1]  [5 Sync reads and bumps th… ←1]
 3  [3 agent-browser through t… ←2]  [4 Our release binaries th… ←2]
 4  [6 Delete the old tables a… ←3,4,5]

#  does                                                          files  adds                            size
1  Describes every tool in one JSON file and answers, without …  3      `assets/tools.json` (entries …  ~370
2  Adds the single routine that asks, downloads and returns th…  8      `steps/tools.ts` exports `ens…  ~260
3  Makes the agent-browser step use the engine instead of its …  2      nothing new                     ~110
4  Moves web-mcp and ado-mcp, and everything that looked them …  5      nothing new                     ~150
5  Points the weekly sync's two pin sources at `tools.json` an…  5      nothing new                     ~170
6  Removes the pin files, tables and functions the manifest re…  10     nothing new                     ~440
```
<!-- /glance -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tool the installer provisions is one entry in `tools/installer/assets/tools.json`, installed by one engine that applies one "which copy runs" rule.

**Architecture:** `core/tools.ts` reads the manifest and answers pure questions: which asset this machine needs, and what to do about the copy on disk. `ensureTool` in `steps/tools.ts` asks, downloads through the existing `downloadBin` and returns the path. The uv, agent-browser and release-binary steps shrink to what is specific to their plugin. The weekly sync reads and bumps manifest entries instead of importing tables from the installer.

**Tech Stack:** TypeScript on Node 26 (type stripping, stdlib only), `node:test`; the upstream-sync workspace (TypeScript, `node:test` `.mjs` tests).

**Spec:** [spec.md](spec.md), [ADR 0012](../../adr/0012-installer-runs-its-own-copy-of-every-tool.md)

## Global Constraints

- `core/tools.ts` resolves each tool's source (kind, version, per-platform file, sha256, which copy runs) from `assets/tools.json`. The steps for web-mcp, mcp-azure, headroom-trim and graphify never see it, and neither do plugins.
- Add no interface for a single implementation, no helper for a single caller, and no option nobody sets.
- Use Node's standard library only, and only erasable TypeScript syntax (no `enum`, `namespace` or parameter properties). Imports name the `.ts` file. Programs start through `system/proc.ts`, never by bare name.
- One rule decides which copy runs: ours in `~/.claude/bin`, downloaded when it is missing or older than the pin, and kept when it is equal or newer. A copy on PATH is ignored, and nothing in `steps/tools.ts` reads PATH. The prompt before a download appears only for `github` tools.
- graphify stays unpinned (`uv tool install --upgrade`). Sync stays one PR per tool and keeps its two literal sources, and `pypi` entries are never synced.
- `tools.json` holds no arrays (lists are comma-separated strings). As a result, `JSON.stringify(x, null, 2) + '\n'` is byte-identical to prettier's output, and a sync bump touches only its own lines.
- Visible behaviour is otherwise unchanged: the same paths (`~/.claude/bin`) and the same userConfig keys (`binPath`, `agentBrowserPath`). We accept these changes:
  - one summary-line format (`<name>: installed <version> at <path>` / `upgraded to <version> at <path>`);
  - a declined download is a failure line for every tool;
  - the agent-browser `--with-deps` sudo prompt comes after the download;
  - one wording for the download prompt.
- The installer's coverage floor (`--test-coverage-lines=79` in `package.json`) is raised, never lowered. Run `treefmt` on changed files (never on a folder), not `nix fmt`.
- The only CI edit is to the two pack checks in `.github/workflows/test.yml`, which name the old pin files.
- Out of scope: dcg, the `BINARIES` hint table for LSPs and ccstatusline, headroom-trim's launcher, server and `uv sync`, CI builds, the flake, Dependabot, and the vendored JS.
- The Codex step (`steps/codex.ts`) keeps its own PATH-first `find` and its versioned `bin/<version>/` folder; only its asset lookup moves to `resolveTool`, as ADR 0012 says.
- Each commit message is one sentence with no co-author line. Stage only the task's own paths.

## Test seams

- `core/tools.ts` exports, tested through `core/tools.test.ts`, catch a wrong asset, hash or platform, a wrong plan, and drift between the manifest and the workflows, flake and plugin files that name the same things. They miss real downloads and the OS.
- `ensureTool` in `steps/tools.ts`, with `ask`, `download` and `version` injected, catches the prompt, the download decision and the failure lines. It misses the real network, unpacking and the OS.
- `unavailable` in `core/options.ts`, tested through `core/options.test.ts`, catches the platform messages. `applyBin` in `steps/binaries.ts` has no test of its own (main deleted `steps/binaries.test.ts`); the `ensureTool` tests and the typecheck cover it. Both miss downloads.
- `sources()` and `sync()` in `tools/upstream-sync`, tested through `application.test.mjs` (an existing seam), catch what a bump writes to `tools.json`. They miss GitHub.

## Review Focus

- A manifest entry lacks the sha256 for one platform: that platform resolves to no asset, never to a download without a check (Task 1).
- Our copy is newer than the pin because the installer was rolled back: it is kept, never downgraded (Task 1).
- uv lands at `<binDir>/uv(.exe)`, not at its archive's inner path, because headroom-trim's launcher looks there (Task 1).
- Only a PATH copy exists: the installer still downloads its own and points settings at it (Task 2).
- The user declines the prompt for a `github` tool: there is no download, settings stay untouched, and there is one failure line (Task 2).
- Syncing one tool leaves every other entry in `tools.json` byte-identical, and the shipped file survives a stringify round trip unchanged (Task 5).

---

### Task 1: Manifest and the pure core

**Does:** Describes every tool in one JSON file and answers, without touching the disk, which asset a machine needs and what to do about the copy it has.
**Depends on:** none
**Adds:** `assets/tools.json` (entries `web-mcp`, `ado-mcp`, `agent-browser`, `uv`, `graphify`); `core/tools.ts` exports `TOOLS`, `Tool`, `Asset`, `resolveTool`, `planTool`, `toolPath`, `toolAdvice`, `toolOfPlugin`, `pypiSpec`
**Size:** ~370

**Files:**
- Create: `tools/installer/assets/tools.json`
- Create: `tools/installer/core/tools.ts`
- Test: `tools/installer/core/tools.test.ts`

**Interfaces:**
- Produces the following, which later tasks use exactly. Only `resolveTool` takes the manifest, as a last optional parameter `tools = TOOLS`, for tests.
  - Manifest: `{ "targets": { "win32-x64": "x86_64-pc-windows-msvc", "linux-x64": "x86_64-unknown-linux-musl" }, "tools": { <name>: Tool } }`.
  - `type Tool = ReleaseTool | GithubTool | PypiTool`, discriminated by `source`.
    - `release`: `plugin`, `key`. Every platform in `targets` has a build.
    - `github`: `repo`, `tagPrefix` (`""` or `"v"`), `version`, `raw?`, `files: Record<string, { file: string; inner?: string; sha256: string }>`. Its url is `https://github.com/<repo>/releases/download/<tagPrefix><version>/<file>` and its tag pattern is `^<tagPrefix>(\d+\.\d+\.\d+)$`.
    - `pypi`: `package`, `extras` (a comma-separated string).
  - `Asset = { file: string; url: string; exe: string; sha256?: string; digest?: string; raw?: boolean }`, the one definition (`system/net.ts` imports it in Task 2).
  - `resolveTool(name: string, platform: string, arch: string, version: string, tools = TOOLS): Asset | undefined`. `version` is the installer's, and only `release` uses it.
  - `planTool(o: { installed: string | undefined; pinned: string; supported: boolean }): 'keep' | 'download' | 'unsupported'`.
  - `toolPath(binDir: string, name: string, platform: string): string`: `<binDir>/<name>(.exe)`, never the archive's inner path.
  - `toolAdvice(name): string`, `toolOfPlugin(plugin: string): [string, ReleaseTool]`, `pypiSpec(name): string` (`graphifyy[sql,pdf,office,watch,leiden]`, unquoted).

- [ ] **Step 1: Write the manifest.** Copy values verbatim from `assets/uv.json`, `assets/agent-browser.json`, `UV_FILES`, `AGENT_BROWSER_FILES`, `BIN_PLUGINS`, `BIN_TARGETS` and `GRAPHIFY_EXTRAS` (`core/binaries.ts`). `web-mcp` gets plugin `web-mcp` and key `binPath`; `ado-mcp` gets plugin `mcp-azure` and key `binPath`. `uv` has `tagPrefix: ""`; `agent-browser` has `tagPrefix: "v"` and `raw: true`. Leave the old files in place until Task 6.
- [ ] **Step 2: Write the failing tests** in `core/tools.test.ts`, ported from `core/binaries.test.ts`. The assertions use the exact strings and hashes the old tests do.
  - `release tool: the archive built for this machine, hash from the .sha256 beside it` (web-mcp on linux-x64 and win32-x64, a tar.gz and a zip).
  - `release tool: no asset where no build exists` (web-mcp on darwin-arm64, on linux-ia32 and on freebsd-x64 gives `undefined`).
  - `github tool: the pinned archive, url derived from repo, prefix and version, only with a sha256 for the platform` (uv and agent-browser on both platforms; a clone of the manifest with one hash removed, or with a non-semver `version`, gives `undefined`; agent-browser is `raw`, and uv carries `inner`).
  - `planTool: missing or older downloads, equal or newer keeps, no build is unsupported` (installed `undefined`, `0.1.0`, the pin and `99.0.0`, with `supported` true and false).
  - `toolPath: uv lands at <binDir>/uv` (Review Focus), plus `toolAdvice`, `toolOfPlugin('mcp-azure')` returning `['ado-mcp', …]`, and `pypiSpec('graphify')`.
  - The three contract tests of `core/binaries.test.ts`, rewritten against the manifest: `crates-build.yml packs the archive names resolveTool builds`; `each release tool's plugin.json declares its userConfig key`; `the binaries report the release version the installer fetches` (the Cargo workspace version equals `package.json`'s).
  - `the shipped manifest is complete`: every `github` entry has a semver `version` and a 64-hex sha256 for every platform in `files`, and `JSON.stringify(JSON.parse(raw), null, 2) + '\n'` equals the file.
- [ ] **Step 3: Run** `node --test tools/installer/core/tools.test.ts`; expect FAIL (module not found).
- [ ] **Step 4: Implement `core/tools.ts`.** Read `TOOLS` with `readFileSync(new URL('../assets/tools.json', import.meta.url))`; `core/release.ts` already reads a file at import. Build `release` URLs from `RELEASES` in `core/release.ts` (`${RELEASES}/v${version}/${name}-${target}.${zip|tar.gz}`), and have `planTool` compare with `newer` from `core/release.ts`. Move the logic of `binAsset`, `binPath`, `binAdvice`, `uvAsset`, `agentBrowserAsset`, `upstreamAction`, `uvPlan`, `upstreamPlan` and `binAction` here without changing their results; the one exception is `planTool`'s single rule.
- [ ] **Step 5: Run** `node --test tools/installer/core/tools.test.ts`; expect PASS.
- [ ] **Step 6: Commit** `git add -- tools/installer/assets/tools.json tools/installer/core/tools.ts tools/installer/core/tools.test.ts` with `Add the tool manifest and its pure resolver.`

### Task 2: One engine, used by uv and graphify

**Does:** Adds the single routine that asks, downloads and returns the path of a tool's copy in `~/.claude/bin`, and moves the uv and graphify installs onto it.
**Depends on:** Task 1
**Adds:** `steps/tools.ts` exports `ensureTool`, `ToolIo`; `BIN_DIR` moves to `context.ts`
**Size:** ~260

**Files:**
- Create: `tools/installer/steps/tools.ts`
- Modify: `tools/installer/steps/uv.ts`
- Modify: `tools/installer/steps/binaries.ts`
- Modify: `tools/installer/steps/agent-browser.ts`
- Modify: `tools/installer/core/binaries.ts`
- Modify: `tools/installer/context.ts`
- Modify: `tools/installer/system/net.ts`
- Test: `tools/installer/steps/tools.test.ts`

**Interfaces:**
- Consumes: `resolveTool`, `planTool`, `toolPath`, `toolAdvice`, `pypiSpec`, `Asset` (Task 1); `downloadBin` (`system/net.ts`); `versionOf` (`system/proc.ts`); `ask`, `done`, `failures`, `VERSION` (`context.ts`).
- Produces:
  - `BIN_DIR`, exported from `context.ts`. `steps/binaries.ts` re-exports nothing, so every importer changes.
  - `Asset` in `system/net.ts` becomes `import type { Asset } from '../core/tools.ts'`, re-exported.
  - `ToolIo = { ask?: (q: string, initial: boolean) => Promise<boolean>; download?: typeof downloadBin; version?: (bin: string) => string | undefined; binDir?: string; platform?: string; arch?: string; off?: string }`.
  - `ensureTool(name: string, io?: ToolIo): Promise<{ path: string; changed: boolean } | undefined>`. When it returns `undefined`, the failure line is already in `failures`, with `io.off` appended when set.

- [ ] **Step 1: Write the failing tests** in `steps/tools.test.ts`, injecting every `io` field and clearing `done` and `failures` before each test:
  - `a github tool that is missing: asks once, downloads, returns the path with changed true`.
  - `a declined prompt: no download, undefined, one failure line ending in io.off` (Review Focus).
  - `ours at or above the pin: no prompt, no download, changed false`, and `ours missing downloads whatever else is installed elsewhere` (Review Focus: `io.version` is undefined for our path).
  - `a release tool downloads without asking`.
  - `no build for this platform: undefined and one failure line` (for a release tool, the line names `toolAdvice`).
- [ ] **Step 2: Run** `node --test tools/installer/steps/tools.test.ts`; expect FAIL.
- [ ] **Step 3: Implement `ensureTool`** in `steps/tools.ts`. It resolves the asset and runs `planTool` on `io.version(toolPath(...))` (default `versionOf`) against the pin: a `github` tool's `version`, or the installer's `VERSION` for `release`. It asks only for `github` tools (`Download <name> <version> (upstream's release binary) to <bin>?`), downloads via `io.download ?? downloadBin`, and pushes `<name>: installed|upgraded to <version> at <path>`. Move `BIN_DIR` and change its importers; `steps/agent-browser.ts` takes it from `context.ts` in this task, so the tree builds at this commit.
- [ ] **Step 4: Move uv and graphify.** `installUv()` in `steps/uv.ts` becomes `(await ensureTool('uv', { off: OFF }))?.path`; remove its PATH-uv branch. `installGraphify` builds its `uv tool install --upgrade <pypiSpec('graphify')>` arguments and its done line (the extras) from the manifest. Its failure hint and the `BINARIES` hint in `core/binaries.ts` keep the quoted form `"${pypiSpec('graphify')}"`.
- [ ] **Step 5: Run** `node --test tools/installer/steps/tools.test.ts tools/installer/core/tools.test.ts`, `npm run typecheck`, and `rg -n "which|PATH" tools/installer/steps/tools.ts` (expect no output from `rg`); expect PASS.
- [ ] **Step 6: Commit** `git add -- tools/installer/steps/tools.ts tools/installer/steps/tools.test.ts tools/installer/steps/uv.ts tools/installer/steps/binaries.ts tools/installer/steps/agent-browser.ts tools/installer/core/binaries.ts tools/installer/context.ts tools/installer/system/net.ts` with `Install uv and graphify through one tool engine.`

### Task 3: agent-browser through the engine

**Does:** Makes the agent-browser step use the engine instead of its own plan and download code.
**Depends on:** Task 2
**Adds:** nothing new
**Size:** ~110

**Files:**
- Modify: `tools/installer/steps/agent-browser.ts`
- Test: `tools/installer/steps/tools.test.ts`

**Interfaces:**
- Consumes: `ensureTool(name, io)` (Task 2) with `io.binDir` (the Codex step passes `join(base, 'bin')`).
- Produces: `installAgentBrowser(binDir = BIN_DIR): Promise<{ path?: string; works: boolean }>`, unchanged.

- [ ] **Step 1: Write the failing test** in `steps/tools.test.ts`: `ensureTool('agent-browser', { binDir })` passes a `raw` asset to `download` and targets `<binDir>/agent-browser(.exe)`.
- [ ] **Step 2: Run** it. Expect FAIL only if the engine drops `raw`; otherwise the test passes at once, and this step is a check.
- [ ] **Step 3: Rewrite `installAgentBrowser`** on `ensureTool`. Drop `which('agent-browser')` and the PATH branch. On Linux, after the engine reports `changed`, ask `Also install the browser system packages (agent-browser install --with-deps, runs sudo)?`. Keep `useAgentBrowser`, `windowWorks` and `configureAgentBrowser`.
- [ ] **Step 4: Run** `node --test "tools/installer/**/*.test.ts"` and `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `git add -- tools/installer/steps/agent-browser.ts tools/installer/steps/tools.test.ts` with `Install agent-browser through the tool engine.`

### Task 4: Our release binaries through the engine

**Does:** Moves web-mcp and ado-mcp, and everything that looked them up in the old tables, onto the manifest.
**Depends on:** Task 2
**Adds:** nothing new
**Size:** ~150

**Files:**
- Modify: `tools/installer/steps/binaries.ts`
- Modify: `tools/installer/core/options.ts`
- Modify: `tools/installer/steps/config.ts`
- Modify: `tools/installer/steps/codex.ts`
- Test: `tools/installer/core/options.test.ts`

**Interfaces:**
- Consumes: `ensureTool` (Task 2); `toolOfPlugin`, `resolveTool`, `toolPath` (Task 1).
- Produces: `applyBin(pluginName, plugin, platform, arch, extra)` and `unavailable(key, platform, arch, version)` both keep their signatures.

- [ ] **Step 1: Move the `unavailable` assertions** (the three in `core/binaries.test.ts`, "no web-mcp build for linux-ia32" and its two neighbours) into `core/options.test.ts` as `unavailable names the missing build`, and add one for `headroom-trim` on `freebsd-x64` ("no uv build for freebsd-x64").
- [ ] **Step 2: Run** `node --test tools/installer/core/options.test.ts`; expect PASS already. This task changes no behaviour, so the tests are the regression guard for the rewrite.
- [ ] **Step 3: Rewrite `applyBin`** on `ensureTool(toolOfPlugin(pluginName)[0])`. Keep the `claude plugin configure --values-stdin` call and its failure texts; the failure advice comes from `toolAdvice`. Delete `binVersionAt`, its `existsSync` and `spawnSync` imports, and the `onPath` import if nothing else uses it. `unavailable` uses `resolveTool`, and `headroom-trim`'s check uses `resolveTool('uv', …)`. `steps/config.ts` takes the key from `toolOfPlugin(nameOf(id))[1].key`. `steps/codex.ts` replaces its three `binAsset` calls with `resolveTool` and changes nothing else.
- [ ] **Step 4: Run** `node --test "tools/installer/**/*.test.ts"` and `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `git add -- tools/installer/steps/binaries.ts tools/installer/core/options.ts tools/installer/steps/config.ts tools/installer/steps/codex.ts tools/installer/core/options.test.ts` with `Install our release binaries through the tool engine.`

### Task 5: Sync reads and bumps the manifest

**Does:** Points the weekly sync's two pin sources at `tools.json` and makes each bump rewrite only its own entry.
**Depends on:** Task 1
**Adds:** nothing new
**Size:** ~170

**Files:**
- Modify: `tools/upstream-sync/src/sources.ts`
- Modify: `tools/upstream-sync/src/adapters/pins.ts`
- Modify: `tools/upstream-sync/src/system/context.ts`
- Modify: `tools/upstream-sync/src/types.ts`
- Test: `tools/upstream-sync/src/application.test.mjs`

**Interfaces:**
- Consumes: the `github` entries of `tools/installer/assets/tools.json` (Task 1), read as JSON, not imported from the installer.
- Produces: `PinOptions = { manifest: string; tool: string }` for `syncPin`, replacing `repo`, `files`, `out` and `tagPattern`. The `uv` and `agent-browser` sources keep their names and titles (`Pin uv to <version>`), with `paths: ['tools/installer/assets/tools.json']`.

- [ ] **Step 1: Write the failing tests** in `application.test.mjs`, replacing the two `uv.json` fixtures with a `tools.json` that holds `github` entries for `uv` and `agent-browser`:
  - `a pin bump writes the new version and hashes into one entry and leaves every other byte unchanged` (Review Focus), titled `Pin uv to 1.2.3`.
  - `a missing digest still fails` (the existing assertion, in the new shape).
  - The other fixtures need no manifest: `source(root, name)` must not read it for non-pin sources.
- [ ] **Step 2: Run** `npm test --workspace=@dead-claude-skills/upstream-sync`; expect FAIL.
- [ ] **Step 3: Implement.** `syncPin({ manifest, tool })` reads the entry's `repo`, `tagPrefix` and `files[*].file`, builds the tag pattern and calls `pinFrom`. It then rewrites only that entry's `version` and each `files[key].sha256` (parse, edit, `JSON.stringify(…, null, 2) + '\n'`). `pins.ts` calls it for `ctx.argument`. In `sources.ts` the two literal entries change three things and nothing else: their `paths`, their `check` (which reads `tools.json` and asserts a 64-hex sha256 per platform) and the file name in their PR bodies (`Bumps tools/installer/assets/tools.json …`).
- [ ] **Step 4: Run** `npm test --workspace=@dead-claude-skills/upstream-sync` and `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `git add -- tools/upstream-sync/src` with `Sync tool pins into the manifest.`

### Task 6: Delete the old tables and update the docs

**Does:** Removes the pin files, tables and functions the manifest replaced, and corrects every file that named them.
**Depends on:** Task 3, Task 4, Task 5
**Adds:** nothing new
**Size:** ~440

**Files:**
- Delete: `tools/installer/assets/uv.json`
- Delete: `tools/installer/assets/agent-browser.json`
- Modify: `tools/installer/core/binaries.ts`
- Modify: `tools/installer/core/binaries.test.ts`
- Modify: `.github/workflows/test.yml`
- Modify: `AGENTS.md`
- Modify: `THIRD_PARTY.md`
- Modify: `docs/adr/0008-python-through-installer-uv.md`
- Modify: `docs/adr/0012-installer-runs-its-own-copy-of-every-tool.md`
- Modify: `plugins/shared/web-mcp/README.md`

**Interfaces:**
- Consumes: nothing from earlier tasks, except that they removed every use of the old names.
- Produces: `core/binaries.ts` keeps `missingBinaries`, `sha256Of`, `sha256Matches`, `versionIn`, `windowProblem` and `newestChromeForTesting`. `GRAPHIFY_*` are gone, because the hint uses `pypiSpec`.

- [ ] **Step 1: Prove nothing uses the old names:** `rg -n "BIN_PLUGINS|BIN_TARGETS|binAsset|binPath\(|binAdvice|binAction|AGENT_BROWSER_FILES|UV_FILES|uvAsset|uvPlan|upstreamPlan|upstreamAction|agentBrowserAsset|UpstreamPin|GRAPHIFY_(EXTRAS|SPEC)|graphifyToolArgs|assets/(uv|agent-browser)\.json" tools/installer tools/upstream-sync .github AGENTS.md THIRD_PARTY.md docs/adr plugins/shared/web-mcp/README.md --glob '!*.js' --glob '!tools/installer/core/binaries*'`; expect matches only in documents and `test.yml`. (The `agent-browser.json` in `tools/web-mcp` is a different file: agent-browser's own per-slot config.)
- [ ] **Step 2: Delete** the two JSON files and the replaced exports in `core/binaries.ts`. Delete their tests in `core/binaries.test.ts`, whose cases now live in `core/tools.test.ts` (including the four contract tests), and keep the tests for the functions that stay.
- [ ] **Step 3: Update `.github/workflows/test.yml`:** the two `grep -qx` lines for the pin files become one line for `package/tools/installer/assets/tools.json`.
- [ ] **Step 4: Update the documents.**
  - `AGENTS.md`: the installer Layout line for `assets/` ("the shipped configs and pins"), the web-mcp paragraph's `BIN_TARGETS` in `core/binaries.ts` (line 108), the headroom-trim paragraph (lines 193-195: the uv pin and `uvPlan`), and the Dependabot paragraph's "`assets/*.json` pins" (line 234); add a line saying tools come from `assets/tools.json` and `npm run sync -- apply uv|agent-browser`.
  - `THIRD_PARTY.md` line 156, ADR 0008 lines 8-9 and `plugins/shared/web-mcp/README.md` lines 109-111 name `tools.json` and no longer say a PATH copy is used.
  - ADR 0012's decision paragraph says "except the Codex step, below", and its Consequences gain "The Codex step keeps its own PATH-first lookup and versioned folder; only its asset lookup uses the manifest."
- [ ] **Step 5: Run the whole suite:** `npm run build:harnesses && npm test` and `npm run typecheck`. Expect PASS with the coverage floor held, and raise `--test-coverage-lines` in `package.json` if coverage rose.
- [ ] **Step 6: Commit** `git add -- tools/installer/assets tools/installer/core/binaries.ts tools/installer/core/binaries.test.ts .github/workflows/test.yml AGENTS.md THIRD_PARTY.md docs/adr/0008-python-through-installer-uv.md docs/adr/0012-installer-runs-its-own-copy-of-every-tool.md plugins/shared/web-mcp/README.md` with `Remove the old pin files and tables the tool manifest replaced.`
