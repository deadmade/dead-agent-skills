# Serena replaces graphify Implementation Plan

<!-- glance -->
```
Plan: Serena replaces graphify · 4 tasks · ~490 lines · 60 files
 1  [1 The serena plugin repla…]
 2  [2 The installer installs … ←1]
 3  [3 The Codex installer ste… ←1,2]
 4  [4 Docs say serena ←1,2,3]

#  does                                                          files  adds                            size
1  Deletes the graphify plugin and its sync, adds the serena p…  40     `plugins/shared/serena/plugin…  ~230
2  Makes the Claude Code installer install `serena-agent` with…  9      `installSerena(uv): string | …  ~110
3  On Codex, removes plugins of ours that left the catalog (gr…  5      `RETIRED` and `retired: strin…  ~100
4  Makes README, AGENTS.md, THIRD_PARTY.md, ADR 0012 and .giti…  6      nothing new                     ~50
```
<!-- /glance -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the graphify plugin everywhere it ships and add a `serena` MCP plugin that flows depends on.

**Architecture:** A neutral `plugins/shared/serena/plugin.json` with one stdio MCP server, compiled for Claude Code
(`.mcp.json`) and for Codex (a setup skill and `codex-mcp.json`, both built from plugin.json's args). flows names
serena in its grounding step's `uses`, so its dependencies and README tree are regenerated. The installer installs
`serena-agent` with its own uv on either host, points Claude Code's `serenaPath` and Codex's MCP command at uv's copy,
retires graphify on both hosts and uninstalls `graphifyy`.

**Tech Stack:** Node 24 TypeScript run as-is (erasable syntax only), `node:test`, JSON and TOML plugin sources.

**Spec:** [spec.md](spec.md)

## Global Constraints

- serena's launch flags: resolved in `plugins/shared/serena/plugin.json`; never seen by flows, the compiler's
  templates or the installer, which read them from the built package (`codex-mcp.json`).
- Where the serena command lives: resolved in the installer (`serenaPath` on Claude Code, the `codex mcp add` command
  on Codex); never seen by flows.
- Whether serena is installed: resolved in the installer's uv step (`steps/uv.ts`); never seen by the plugin or flows,
  which fall back to Explore when serena's tools are absent or return nothing.
- One implementation gets no interface; one caller gets no helper; no option nobody sets.
- Args, exactly, both hosts: `start-mcp-server --context ide --project-from-cwd --open-web-dashboard False
  --add-mode no-memories`.
- Install, exactly: `uv tool install --upgrade -p 3.13 serena-agent` (unpinned, ADR 0012).
- Plugin name `serena`; config key `serenaPath`, default `"serena"`; MCP server id `serena`; Codex MCP name
  `dead-agent-skills-serena`; Codex `startup_timeout_sec = 15`.
- flows' dependencies and README uses tree are generated: change `uses`, then run `node scripts/flows-uses.mjs`;
  never hand-edit them.
- Never edit `.claude-plugin/` or `.agents/plugins/` by hand; rebuild with `npm run build:harnesses`.
- Keep Claude-only names out of `plugins/flows/` (`harness-compiler lint`).
- `tools/installer/core/fixtures/installed_plugins.json` is captured output: leave its graphify entry.
- Before each commit: `treefmt <the files you changed>` (never a folder), then `npm run build:harnesses`;
  `scripts/flows-uses.mjs` writes JSON that prettier reformats.
- Every task ends with `npm test` green, since the pre-commit hook runs check-repo and the Node tests.
- Commit messages are one sentence, no co-author lines; stage only the task's paths (`git add -- <paths>`).
- Stack skill: none matches (TypeScript/JSON/Markdown; no Rust, C#, SQL or web page).

## Test seams

- `buildTree(repoRoot, tmp)` from the harness compiler, called on the real repository (as
  `tools/installer/steps/codex.test.ts:16` does): catches what the built packages hold (serena's `.mcp.json`, its
  Codex `codex-mcp.json` and setup skill, graphify gone); misses whether serena starts.
- `tools/installer/core/*.test.ts` (exported pure functions: `pypiSpec`, `toolPath`, `portableSelection`,
  `codexPlan`, `mcpTableLine`): catches the install arguments, selections, the Codex retire rule and the TOML edit;
  misses running uv.
- `applyCodex` in `tools/installer/steps/codex.test.ts` with fake `io`: catches the `codex mcp add` arguments, the
  uv calls and the graphify removal on Codex; misses a real Codex.
- `npm test` (`scripts/check-repo.mjs`: catalog, generated flows deps and tree, lint, validate, versions): catches a
  dangling graphify reference in manifests, catalog, uses or treefmt; misses prose.

## Review Focus

- A failed serena install: the Codex command is not added (Task 3 test, a fake install returning nothing); on Claude
  Code `serenaPath` is set only from a returned path (`install.ts` is an untested script: code review and a manual
  run check it); the close-sessions text is not asserted.
- A machine that had graphify on Codex: the rerun removes the graphify plugin and uninstalls `graphifyy`. Task 3 test
  (fake io); a real Codex rerun is checked by hand at Finish (`plugin remove` after the new marketplace no longer
  lists graphify is unverified).
- A machine that never had graphify, or a foreign plugin installed: no removal, no uninstall call. Task 3 tests
  (`codexPlan` with `'foreign'` installed keeps `remove` as today).
- graphifyy is uninstalled only in the run that retires graphify and only with a uv copy already present (no download
  just to uninstall); a failed or skipped uninstall leaves the manual command and is not retried. Accepted (ADR 0016).
- A repository with no `.git` above the cwd, or a language server still downloading: flows' grounding uses the
  Explore fallback ("available and return results"). Prose in Task 1; no test.
- Both hosts in one run: serena installs once per host step (`--upgrade` is a no-op the second time); accepted.

---

### Task 1: The serena plugin replaces graphify in what ships

**Does:** Deletes the graphify plugin and its sync, adds the serena plugin, makes flows depend on and name serena, and
compiles serena for Claude Code and Codex, with every test that reads the real catalog updated.
**Depends on:** none
**Adds:** `plugins/shared/serena/plugin.json` (config `serenaPath`, MCP server `serena`); `args` in
`codex-mcp.json` (`mcpSettings` returns it when the server has args)
**Size:** ~230

**Files:**

- Create: `plugins/shared/serena/plugin.json`
- Delete: `plugins/shared/graphify/plugin.json`
- Delete: `plugins/shared/graphify/hooks/hooks.json`
- Delete: `plugins/shared/graphify/UPSTREAM`
- Delete: `plugins/shared/graphify/LICENSE`
- Delete: `plugins/shared/graphify/LICENSE-MIT`
- Delete: `plugins/shared/graphify/NOTICE`
- Delete: `plugins/shared/graphify/skills/graphify/SKILL.md`
- Delete: `plugins/shared/graphify/skills/graphify/references/add-watch.md`
- Delete: `plugins/shared/graphify/skills/graphify/references/exports.md`
- Delete: `plugins/shared/graphify/skills/graphify/references/extraction-spec.md`
- Delete: `plugins/shared/graphify/skills/graphify/references/github-and-merge.md`
- Delete: `plugins/shared/graphify/skills/graphify/references/hooks.md`
- Delete: `plugins/shared/graphify/skills/graphify/references/query.md`
- Delete: `plugins/shared/graphify/skills/graphify/references/transcribe.md`
- Delete: `plugins/shared/graphify/skills/graphify/references/update.md`
- Modify: `plugins/catalog.json`
- Modify: `plugins/flows/plugin.json`
- Modify: `plugins/flows/steps/ground-code.toml`
- Modify: `plugins/flows/steps/missing-piece.toml`
- Modify: `plugins/flows/skills/understand/SKILL.md`
- Modify: `plugins/flows/references/resource-index.md`
- Modify: `plugins/flows/README.md`
- Modify: `tools/harness-compiler/src/model.ts`
- Modify: `tools/harness-compiler/src/schema/manifest.ts`
- Modify: `tools/harness-compiler/src/targets/codex.ts`
- Modify: `tools/harness-compiler/src/templates/codex.ts`
- Modify: `tools/harness-compiler/src/templates/hosts/codex.md`
- Modify: `tools/harness-compiler/src/lint-allowlist.json`
- Modify: `tools/harness-compiler/test/build.test.ts`
- Delete: `tools/upstream-sync/src/adapters/graphify.ts`
- Modify: `tools/upstream-sync/src/sources.ts`
- Modify: `tools/upstream-sync/src/application.test.mjs`
- Modify: `tools/installer/core/agents.test.ts`
- Modify: `tools/installer/core/catalog.test.ts`
- Modify: `tools/installer/system/catalog.test.ts`
- Modify: `tools/installer/steps/codex.test.ts`
- Modify: `tools/installer/core/options.ts`
- Modify: `tools/installer/core/plugins.test.ts`
- Modify: `treefmt.toml`

```files
~ tools/harness-compiler/src/templates/codex.ts  serena's Codex setup, from plugin.json's args
    ~ MCP_SETTINGS  adds serena
    ~ INTEGRATIONS  adds serena
    ~ mcpSettings  also returns args
    ~ integrationSetup  serena's codex mcp add command and timeout
    ~ packageReadme  flows README names the serena and web-mcp setup skills, no graphify
~ tools/harness-compiler/src/targets/codex.ts  no graphify, no embeds
    ~ DESCRIPTIONS  graphify entry removed
~ tools/harness-compiler/src/model.ts  embeds field goes
~ tools/harness-compiler/src/schema/manifest.ts  embeds key goes
~ tools/upstream-sync/src/sources.ts  graphify source goes
```

- [ ] **Step 1: Write the failing test** in `build.test.ts`:
      `test('the real tree ships serena and no graphify', …)` calling `buildTree(<repo root>, <tmp dir>)` and
      asserting:
  - `.claude-plugin/serena/.mcp.json` deep-equals `{ mcpServers: { serena: { command: '${user_config.serenaPath}',
    args: [<the args from Global Constraints, split>] } } }`;
  - `.agents/plugins/serena/codex-mcp.json` has those `args`;
  - `.agents/plugins/serena/skills/setup-serena/SKILL.md` contains
    `codex mcp add dead-agent-skills-serena -- serena start-mcp-server --context ide --project-from-cwd --open-web-dashboard False --add-mode no-memories`,
    `startup_timeout_sec = 15` and `uv tool install -p 3.13 serena-agent`;
  - no `graphify` folder under `.claude-plugin/` or `.agents/plugins/`, no `resources.json` in the Codex flows
    package, the Claude flows manifest depends on `serena`, and the Codex flows README has
    `codex plugin add serena@dead-agent-skills` (the Codex manifest carries no dependencies).

- [ ] **Step 2: Run it to verify it fails:** `node --test tools/harness-compiler/test/build.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - `plugins/shared/serena/plugin.json`: `description` (Serena's symbol-level code search and editing over language
    servers, as an MCP server, started in its `ide` context without memories, onboarding or an opened dashboard;
    writes `.serena/project.yml` into each repository it activates; needs the serena CLI, which the installer
    installs with uv), `author` as in `web-mcp`, `config.serenaPath` (`type` string, `title` "serena command",
    `description` "Path to the serena command. Default: serena on PATH.", `default` "serena"),
    `mcpServers.serena` = `{ "command": "${config.serenaPath}", "args": [<args>] }`.
  - `plugins/catalog.json`: graphify entry → `{ "name": "serena", "source": "plugins/shared/serena", "resources": [],
    "dependencies": [], "targets": ["claude-code", "codex"] }`.
  - `plugins/flows/plugin.json`: drop `"embeds"`.
  - `steps/ground-code.toml`: `uses` swaps `"graphify:graphify"` for `"serena:serena"`; the bullet becomes "If
    serena's tools are available and return results, find the symbols the work touches and their references with
    them first (`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`), read-only: no symbol edits while
    grounding."
  - `steps/missing-piece.toml`: row `| serena | symbol lookup | {{explore}} |`, column widths kept.
  - `skills/understand/SKILL.md`: description says "serena's symbol tools when present" for graphify; `uses` swaps
    `graphify:graphify` for `serena:serena`; the Phase 1 `runs:` comment says serena; replace "No graph: offer
    `/graphify` … yes." with one line: without serena, or when it returns nothing, the map comes from `pstack-picks:how`
    alone.
  - `references/resource-index.md`: delete the graphify row.
  - `README.md`: the `/understand` row says serena; then run `node scripts/flows-uses.mjs` (writes flows'
    dependencies in `catalog.json` and `plugin.json`, and the uses tree).
  - Compiler: drop `embeds` from `model.ts`, `schema/manifest.ts` and the loop in `targets/codex.ts` (with
    `resources.json`); drop the graphify description; `templates/codex.ts`: `MCP_SETTINGS` and `INTEGRATIONS` add
    `'serena'`, `mcpSettings` adds `args` when the server has them, `commands.serena` is
    `codex mcp add dead-agent-skills-serena -- serena ${args.join(' ')}`, the setup text adds
    `startup_timeout_sec = 15` for `[mcp_servers.dead-agent-skills-serena]` and the uv install line; the flows README
    names the web-mcp and serena setup skills and drops "graphify resources"; `hosts/codex.md` drops the graphify
    sentence and the resources.json sentence; `lint-allowlist.json` drops graphify.
  - Upstream sync: delete the adapter, the `sources.ts` import and entry; `application.test.mjs:189` fixture entry
    becomes `serena: { source: 'pypi', package: 'serena-agent', version: '0.9.9' }`.
  - Installer tests that read the real catalog: `agents.test.ts:17`, `catalog.test.ts:16,31,32`,
    `system/catalog.test.ts:57`, `steps/codex.test.ts:82,239,259,262` (line 239's list is sorted: `serena` goes between
    `rust-skills` and `shop`) and `plugins.test.ts:36-55,70` (the real opt-ins
    list; `needsToken` reads `.claude-plugin/serena/.claude-plugin/plugin.json` → false) expect `serena` where they
    expected `graphify`. `core/options.ts`: Tools page key `'serena'` for `'graphify'` (`options.test.ts:25` needs
    every real opt-in on a page).
  - `treefmt.toml`: drop `"plugins/shared/graphify/**"`. `git rm -r plugins/shared/graphify`.
- [ ] **Step 4: Run:** `npm run build:harnesses && node --test tools/harness-compiler/test/build.test.ts` → PASS; then
      `npm test` → PASS and `npm run typecheck` → exit 0.
- [ ] **Step 5: Commit:** `git add -- <the Files above>`;
      `git commit -m "Replace the graphify plugin with a serena MCP plugin that flows grounds with."`

### Task 2: The installer installs serena for Claude Code and removes graphify's CLI

**Does:** Makes the Claude Code installer install `serena-agent` with its uv, point `serenaPath` at uv's copy only when
the install worked, and uninstall `graphifyy` when the run retires graphify.
**Depends on:** Task 1
**Adds:** `installSerena(uv): string | undefined` and `uninstallGraphify(uv): void` in `steps/uv.ts` (replace
`installGraphify`); optional `python` field on the pypi tool type (replaces `extras`)
**Size:** ~110

**Files:**

- Modify: `tools/installer/assets/tools.json`
- Modify: `tools/installer/core/tools.ts`
- Modify: `tools/installer/core/tools.test.ts`
- Modify: `tools/installer/core/binaries.ts`
- Modify: `tools/installer/core/binaries.test.ts`
- Modify: `tools/installer/steps/tools.test.ts`
- Modify: `tools/installer/system/proc.test.ts`
- Modify: `tools/installer/steps/uv.ts`
- Modify: `tools/installer/install.ts`

```files
~ tools/installer/core/tools.ts  pypi tools name a Python version
    ~ pypiSpec  package alone; extras gone
~ tools/installer/steps/uv.ts  serena instead of graphify
    - installGraphify  replaced
    + installSerena  installs serena, returns uv's serena path or undefined
    + uninstallGraphify  removes graphifyy when uv lists it
~ tools/installer/core/binaries.ts  no graphify or serena rows
    ~ BINARIES  graphify rows removed
~ tools/installer/install.ts  calls installSerena and uninstallGraphify
```

- [ ] **Step 1: Write the failing tests.**
  - `core/tools.test.ts`: `pypiSpec('serena')` → `'serena-agent'`; `TOOLS.tools.serena` narrowed on `source === 'pypi'` has `python: '3.13'`;
    `toolPath('C:\\Users\\x\\.local\\bin', 'serena', 'win32')` → `'C:\\Users\\x\\.local\\bin\\serena.exe'` and the
    linux form → `/home/x/.local/bin/serena` (the path `installSerena` builds).
  - `core/binaries.test.ts`: delete the graphify test and the graphify case at lines 17-19 (serena under Claude Code
    runs from `serenaPath`, so it gets no PATH row).
  - `proc.test.ts`, `steps/tools.test.ts`: where `graphify` stands for "some plugin of ours" use `serena`.
- [ ] **Step 2: Run:**
      `node --test tools/installer/core/*.test.ts tools/installer/steps/tools.test.ts tools/installer/system/*.test.ts`
      → FAIL on `pypiSpec('serena')`.
- [ ] **Step 3: Implement.**
  - `tools.json`: the `graphify` entry becomes
    `"serena": { "source": "pypi", "package": "serena-agent", "python": "3.13" }`. `core/tools.ts`: `PypiTool` is
    `{ source: 'pypi'; package: string; python?: string }`; `pypiSpec` returns `tool.package`, same throw.
  - `binaries.ts`: remove both graphify rows.
  - `steps/uv.ts`: `OFF` names serena and graphify's cleanup. `installSerena(uv)`:
    `uv tool install --upgrade -p <python> <pypiSpec>` (stdio inherit); on failure push
    `serena: uv tool install failed (…); close Claude Code and Codex sessions that run serena, then rerun the installer, or run: uv tool install -p 3.13 serena-agent`
    and return `undefined`. Else `uv tool dir --bin` (stdout captured and `.trim()`med: it ends in a newline; exit 0
    required), `toolPath(<that>, 'serena', process.platform)`; the Python version comes from `TOOLS.tools.serena`
    narrowed on `source === 'pypi'`; return it when `existsSync`, else push a failure line and return
    `undefined`. `uninstallGraphify(uv)`: `uv tool list` (captured); when a line starts with `graphifyy `, run
    `uv tool uninstall graphifyy` and push `graphify: its CLI (graphifyy) uninstalled` or a failure line with the
    command; nothing when not listed.
  - `install.ts`: `withSerena` (`nameOf(id) === 'serena'`);
    `const graphifyRetired = retired.includes(`graphify@${MARKETPLACE}`)`; the uv branch runs when headroom-trim
    or serena is selected (as today, with serena for graphify); then `if (uv && withSerena)` set `serenaPath` with
    `claude(JSON.stringify({ serenaPath }), 'plugin', 'configure', `serena@${MARKETPLACE}`, '--values-stdin')` when
    `installSerena` returned a path (done line `serena: serenaPath is <path>`, or a failure line naming
    `/plugin configure serena`), as `steps/agent-browser.ts:58` does; when `graphifyRetired`,
    `uninstallGraphify` runs with that uv, or else with `toolPath(BIN_DIR, 'uv', process.platform)` when that file
    exists; with no uv copy it is skipped and a `done` line gives the command (`uv tool uninstall graphifyy`).
- [ ] **Step 4: Run:** the Step 2 command → PASS; `npm run typecheck` → exit 0; `npm test` → PASS.
- [ ] **Step 5: Commit:** `git add -- <the Files above>`;
      `git commit -m "Install serena with the installer's uv and uninstall graphify's CLI."`

### Task 3: The Codex installer step retires graphify and adds serena

**Does:** On Codex, removes plugins of ours that left the catalog (graphify), installs serena with the installer's uv
and adds its MCP server with uv's absolute path, the built args and a 15-second start timeout.
**Depends on:** Task 1, Task 2
**Adds:** `RETIRED` and `retired: string[]` in `codexPlan`'s result; `mcpTableLine(raw, name, line)` in `core/codex.ts`
(`mcpEnvironment` builds its `env_vars` line and calls it); `serena?` and `cleanup?` in `CodexIO`; `args?` in
`readCodexMcp`'s type
**Size:** ~100

**Files:**

- Modify: `tools/installer/core/codex.ts`
- Modify: `tools/installer/core/codex.test.ts`
- Modify: `tools/installer/core/agents.test.ts`
- Modify: `tools/installer/steps/codex.ts`
- Modify: `tools/installer/steps/codex.test.ts`

```files
~ tools/installer/core/codex.ts  Codex retire rule and a generic MCP table line
    ~ codexPlan  removes installed plugins gone from the catalog, reports them as retired
    ~ MCP_COMPONENTS  adds serena
    + mcpTableLine  inserts one key line into a native MCP table
    ~ mcpEnvironment  builds env_vars through mcpTableLine
~ tools/installer/steps/codex.ts  serena install and MCP server
    ~ applyCodex  installs serena, configures it, uninstalls graphifyy
```

- [ ] **Step 1: Write the failing tests.**
  - `core/codex.test.ts`:
    `codexPlan(<definitions without graphify>, ['flows'], ['dead-skills', 'flows', 'graphify', 'web-mcp'], v, prev)`
    → `remove` and `retired` both include `'graphify'`; the existing `'foreign'` cases (`core/codex.test.ts:31`,
    `core/agents.test.ts:36-38`) stay green.
    `mcpTableLine(raw, 'dead-agent-skills-serena', 'startup_timeout_sec = 15')` inserts under the table and leaves the
    table alone when it already sets `startup_timeout_sec` (any value: the user's choice wins); the existing
    `mcpEnvironment` tests, its throw on a different `env_vars` included, stay green.
  - `steps/codex.test.ts`: `fixture()`'s `io` defaults `serena: async () => undefined` and `cleanup: async () => {}`
    (so no test runs real uv), and its fake `mcp add` appends a `[mcp_servers.<name>]` table to `config.toml` for
    every name instead of overwriting the file for mcp-azure only. With serena wanted and `io.serena` returning `/tools/uv-bin/serena`: the `codex mcp add`
    call is
    `['mcp', 'add', 'dead-agent-skills-serena', '--', '/tools/uv-bin/serena', 'start-mcp-server', '--context', 'ide', '--project-from-cwd', '--open-web-dashboard', 'False', '--add-mode', 'no-memories']`,
    and `config.toml` gets `startup_timeout_sec = 15` in that table. `io.serena` returning `undefined` adds no serena server. With
    `graphify` in the fake `codex plugin list` answer (seed it through `fixture()`, which gains an `installed` setter):
    one assertion that `plugin remove graphify@dead-agent-skills` ran, another that `io.cleanup` was called once;
    with no graphify in the plugin list, `io.cleanup` is not called.
- [ ] **Step 2: Run:** `node --test tools/installer/core/codex.test.ts tools/installer/steps/codex.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - `codexPlan`: `RETIRED = ['graphify']` (plugins of ours that left the catalog; a general "not in the catalog" rule
    would also remove foreign plugins); `retired = installed.filter((n) => RETIRED.includes(n))`; `remove` is the
    current list plus `retired`; return `retired` too. `MCP_COMPONENTS` adds `'serena'`; `describe` in
    `steps/codex.ts` labels serena "MCP server (the installer installs it with uv)" instead of the authentication
    note.
  - `mcpTableLine(raw, name, line)`: `mcpEnvironment`'s table lookup and insert, keyed on the line's key, returning
    `raw` when the key is already set; `mcpEnvironment` keeps its own different-value throw, then calls it.
  - `applyCodex`: `CodexIO` gains `serena?: () => Promise<string | undefined>` (default:
    `ensureTool('uv', { binDir: join(base, 'bin'), off: … })`, the Codex step's own folder as ADR 0012's Codex
    exception keeps, then `installSerena(uv)` when uv came back) and `cleanup?: () => Promise<void>` (default: the uv in `join(base,
    'bin')` or `BIN_DIR` when one exists, then `uninstallGraphify(uv)`; none: skipped with a `done` line giving the
    command). `readCodexMcp`'s return type gains `args?: string[]`. When serena is
    wanted: `const path = await (io.serena ?? <default>)()`; when `path`,
    `configure('serena', ['--', path, ...settings('serena').args])`, then `mcpTableLine` writes
    `startup_timeout_sec = 15` into `config.toml` (same symlink guard as Azure). When `plan.retired` includes
    `graphify`: `await (io.cleanup ?? <default>)()`, whether or not serena is wanted.
- [ ] **Step 4: Run:** the Step 2 command → PASS; `npm run typecheck` → exit 0; `npm test` → PASS.
- [ ] **Step 5: Commit:** `git add -- <the Files above>`;
      `git commit -m "Retire graphify and add serena in the Codex installer step."`

### Task 4: Docs say serena

**Does:** Makes README, AGENTS.md, THIRD_PARTY.md, ADR 0012 and .gitignore say what ships now, and adds ADR 0016.
**Depends on:** Task 1, Task 2, Task 3
**Adds:** nothing new
**Size:** ~50

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `THIRD_PARTY.md`
- Modify: `.gitignore`
- Modify: `docs/adr/0012-installer-runs-its-own-copy-of-every-tool.md`
- Create: `docs/adr/0016-serena-replaces-graphify.md`

- [ ] **Step 1: Edit.**
  - `AGENTS.md`: the `plugins/shared/graphify/` bullet becomes `plugins/shared/serena/` (Serena's MCP server in its
    `ide` context, no memories, onboarding or opened dashboard, writes `.serena/` into repos it activates; flows pulls
    it in; the installer installs `serena-agent` with its uv on either host and sets `serenaPath`; ADR 0016). Drop
    graphify from the hand-written `plugin.json` exceptions; drop `embeds` from the neutral `plugin.json` key list.
  - `README.md`: `codex plugin add graphify@…` → `serena@…`; line 59 names serena; mention the `.serena/` side effect
    where serena is described.
  - `THIRD_PARTY.md`: delete the graphify section.
  - `.gitignore`: replace the `graphify-out/` lines with `/.serena/` (comment: serena's per-repository project
    files); keep the old Rust build folder line.
  - ADR 0012: append "graphify was replaced by serena (ADR 0016), installed the same way." to the graphify sentence.
  - ADR 0016: written at Gate 1; staged here.
- [ ] **Step 2: Verify:**
      `git grep -n -i graphify -- plugins README.md AGENTS.md THIRD_PARTY.md tools/harness-compiler/src tools/upstream-sync treefmt.toml .gitignore`
      → no output (graphify stays, on purpose, in `tools/installer` retire and cleanup code and tests, the captured
      fixture, `build.test.ts`'s absence assertions and the ADRs); `npm test` → PASS.
- [ ] **Step 3: Commit:** `git add -- <the Files above>`; `git commit -m "Document serena in place of graphify."`
