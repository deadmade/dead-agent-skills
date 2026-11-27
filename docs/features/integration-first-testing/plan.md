# Integration-first testing Implementation Plan

<!-- glance -->
```
Plan: Integration-first testing · 10 tasks · ~2780 lines · 88 files
 1  [1 The rule, and real-tool…]
 2  [2 headroom-trim survives … ←1]  [3 The installer's test se… ←1]  [5 web-mcp's harness on re… ←1]
     [10 ado-mcp's capture mode ←1]
 3  [4 The installer end to en… ←3]  [6 web-mcp browser and fet… ←5]
 4  [7 web-mcp search, rows an… ←6]
 5  [8 browser-core and web-mc… ←6,7]
 6  [9 http-runner's login pag… ←5,8]

#   does                                                          files  adds                            size
1   Writes the testing rule into AGENTS.md, gives Node tests on…  7      `realTool` export in `scripts…  ~110
2   A test runs the real SessionStart hook through `claude -p` …  6      `plugins/opt-in/headroom-trim…  ~180
3   Lets the installer run unattended from an answers file and …  9      env `DEAD_SKILLS_TEST_ANSWERS…  ~130
4   Runs the whole installer into temporary homes with the real…  14     `tools/installer/install.real…  ~300
5   Adds a real-browser start to web-mcp's test harness (the fa…  14     env `WEB_MCP_TEST_ENGINES`; `…  ~260
6   Rewrites `tests/browser.rs` to assert what a user sees thro…  5      nothing new                     ~500
7   Rewrites `tests/search.rs`, `tests/rows.rs` and the browser…  6      nothing new                     ~450
8   Moves browser-core's and web-mcp's inline tests from the fa…  14     nothing new                     ~400
9   Opens the login page in real Chrome through agent-browser i…  9      nothing new                     ~250
10  Adds an opt-in capture of masked real answers, so the user …  4      env `ADO_CAPTURE_DIR`           ~200
```
<!-- /glance -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** This repo's suites test against the real processes, CLIs, browser and files, in one suite that gates every
merge in CI, with replay servers only for what CI cannot reach.

**Architecture:** Each real collaborator is found once per language (`scripts/test.mjs` for Node, each crate's
`tests/common/mod.rs` for Rust) and missing tools fail under `--strict`. Product code gains only test-only switches:
debug-build-only env hooks in the Rust servers and, in the installer (which has no debug build), an answers file and a
local release source. Fake-driven tests are rewritten against the real thing and deleted where a real test covers
them; a fake survives only for a behaviour nothing real produces.

**Tech Stack:** Node 26 (`node:test`, `.ts` run directly), Rust workspace (tokio, rmcp, reqwest), agent-browser 0.43.0
with Chrome for Testing, uv (the `tools.json` pin), Claude Code CLI, Codex CLI, GitHub Actions (ubuntu-latest, windows-latest).

**Spec:** [spec.md](spec.md). ADR: [0017](../../adr/0017-tests-use-the-real-thing.md).

## Global Constraints

- Finding a real tool for a test (claude, codex, uv, agent-browser, Chrome): resolved in `scripts/test.mjs` (Node
  suites) and each crate's `tests/common/mod.rs` (Rust); never seen by test bodies or by product code.
- Serving captured engine pages in place of the real engine hosts: resolved where web-mcp builds an engine's base URL
  (one debug-only override, set by `tests/common/mod.rs`); never seen by the engines' parsers, search fusion or fetch.
- Unattended installer runs: resolved where the installer asks (its prompt and screen functions read the answers
  file) and where it picks a release source; never seen by the steps.
- One implementation gets no interface; one caller gets no helper; no option nobody sets.
- browser-core has no `tests/` folder: its `cfg(any(test, feature = "test-support"))` helper in `src/browser.rs`
  stands in for `tests/common/mod.rs`, and its `real_agent_browser()` is the one Rust agent-browser lookup: web-mcp's
  tests call it through their existing `test-support` dev-dependency; http-runner (no browser-core dependency) keeps
  a short copy in its `tests/common/mod.rs`. The lookup: `WEB_MCP_AGENT_BROWSER` if set, else
  `<CLAUDE_CONFIG_DIR or ~/.claude>/bin/agent-browser[.exe]`, else panic `"agent-browser not found: run the installer
  or set WEB_MCP_AGENT_BROWSER"`.
- A gating test downloads only what is pinned and hash-checked (`tools/installer/assets/tools.json`, `uv.lock`), with
  one named exception (ADR 0017, plan review F2): Chrome for Testing, whichever version `agent-browser install`
  fetches; CI caches it. dcg and graphify's CLI (`uv tool install graphifyy`, no version in `tools.json`; serena once
  ADR 0016 merges) are never selected in a test.
- A test whose real tool is missing fails under strict (`realTool`'s `strict` option, default
  `process.env.DEAD_SKILLS_STRICT === '1'`, which `scripts/test.mjs --strict` sets) and is skipped with the tool's
  name otherwise; a Rust test panics with the tool's name and how to get it.
- The slow real Node tests are named `*.real.test.{mjs,ts}` and run only in the `real` suite of `scripts/test.mjs`
  (plan review F1). `npm test` and CI's test.yml run it; the pre-commit hook (`flake.nix` `repo-node`) and the release
  jobs (`release.yml:100`, `scripts/release.mjs:93`) run `repo node` and leave it out. The installer's 84 % coverage
  floor moves from `node` to `real`.
- The Nix packages' checks (built in CI by crates.yml's `nix build`) run no test that starts a browser: `flake.nix`
  skips them by name with `checkFlags` (`--skip`), the reason beside it; crates.yml's rust job is their gate (plan
  review F4). Never a runtime check that returns early and passes.
- Tests never touch the developer's own trim server (port 47811), `~/.claude`, `~/.codex` or `~/.config`: every
  write goes under a temporary root, and every built package a test runs or installs is a temp copy with
  headroom-trim's `47811` rewritten to a free port.
- A fake-driven test is deleted once a real test covers its behaviour; pure-logic tests that fake nothing stay; a
  surviving fake carries a one-line `// fake: <why nothing real can produce this>` beside its use.
- No vendored path is edited. Installer: no runtime npm dependencies, erasable TypeScript only, programs started
  through `system/proc.ts`. Raise the 84 % coverage floor never lower it.
- On Windows run cargo from PowerShell. Run `npm run build:harnesses` / `npm test` one at a time.
- Tasks run one at a time, in number order: several share `scripts/test.mjs`, `scripts/test.test.mjs`, test.yml,
  `flake.nix`, AGENTS.md and ADR 0017. A **Depends on** line says what a task needs, not what may run in parallel.
- Stack skill: rust-skills `rust-best-practices` for the Rust tasks.

## Review Focus

1. The developer's trim server already listens on 47811: the headroom test and the installer test must use their own
   port and leave 47811 alone (Tasks 2 and 4 assert their copies name no `47811`).
2. An unanswered installer prompt must fail at once with the prompt's text, never hang CI on a TTY read (Task 3 test).
3. Under the test release source the installer must not hand over to the published installer, and must install the
   binaries it was served (Task 4 asserts `web-mcp --version` equals `package.json`'s version and that the served
   archive was fetched).
4. A test's Chrome must be gone after its web-mcp exits, or runners collect Chromes and profiles stay locked (Task 5
   test).
5. The ADO capture never writes the PAT, a real identity or the server's host (Task 10 test).

## Test seams

- `realTool(t, name, { candidates, strict })` in `scripts/test.mjs`, the suites' preconditions and file lists
  (`scripts/test.test.mjs`): catches a missing tool turning into a silent pass and a real test landing in the hook's
  suite; misses nothing it owns.
- The SessionStart hook run by real `claude -p --plugin-dir` on a copied headroom-trim package: catches the hook's
  process handling, uv and the server starting and surviving on both OSes; misses the console window's visibility and
  an interactive session's lifetime.
- `node tools/installer/install.ts` as a CLI with the test answers and release source: catches real `claude`/`codex`
  calls, downloads, unpacking, every file written; misses the interactive key handling of the screen, the published
  `@release` marketplace, the self-update handover, the official marketplace add, dcg and graphify's CLI.
- `tools/installer/core/*` exported functions: pure decisions, kept as they are.
- The `web-mcp` binary over stdio (`tests/*.rs`, `CARGO_BIN_EXE_web-mcp`) with real agent-browser and Chrome against
  the fixture server: catches browser driving, extraction and engine parsing on captured pages, faults made for real;
  misses live engine changes and the engines' real https hosts (Google's consent-host check).
- browser-core's `Browser` and `Window` (inline tests) with the real agent-browser: catches session, window and
  generation handling; misses web-mcp's tool layer.
- The `http-runner` binary over stdio and its `Pages` library API with real Chrome through agent-browser: catches
  opening and submitting the real login form; misses the OS default-browser opener (`rundll32`, `xdg-open`).
- The `ado-mcp` binary over stdio against the replay server, with capture on: catches what capture writes and masks;
  misses the real server's shapes until the user captures them.

---

### Task 1: The rule, and real-tool lookup for Node tests

**Does:** Writes the testing rule into AGENTS.md, gives Node tests one way to find a real tool that fails under strict
and skips otherwise, and adds the `real` suite that holds the slow real tests and the installer's coverage floor.
**Depends on:** none
**Adds:** `realTool` export in `scripts/test.mjs`; suite `real`; env `DEAD_SKILLS_STRICT`
**Size:** ~110

**Files:**

- Modify: `AGENTS.md`
- Modify: `scripts/test.mjs`
- Create: `scripts/test.d.mts`
- Modify: `scripts/test.test.mjs`
- Modify: `.github/workflows/test.yml`
- Modify: `docs/components/ci.md`
- Create: `docs/adr/0017-tests-use-the-real-thing.md`
- Modify: `GLOSSARY.md`

```files
~ scripts/test.mjs  real-tool lookup, the strict flag for children, the real suite
    + realTool  first existing candidate or the tool on PATH, else fail or skip
    ~ suiteFiles  node leaves out *.real.test.*, real lists them
    ~ main  sets DEAD_SKILLS_STRICT under --strict
```

- [ ] **Step 1: Write the failing tests** in `scripts/test.test.mjs`:
      `realTool returns the path of a tool on PATH` (`realTool(t, 'node')` equals `which('node')`);
      `realTool prefers an existing candidate` (`realTool(t, 'nope', { candidates: [process.execPath] })` returns it);
      `realTool skips a missing tool without strict` (`{ strict: false }`: a fake `t` whose `skip` records a message
      containing `no-such-tool-xyz`, and the call returns `undefined`);
      `realTool throws for a missing tool under strict` (`{ strict: true }` throws `/no-such-tool-xyz not found/`);
      `the real suite holds the real tests and the coverage floor` (a temp root with a `treefmt.toml` holding an empty
      `excludes = [` … `]` list, `plugins/x/a.real.test.mjs` and `plugins/x/b.test.mjs`: `suiteFiles(root).real`
      holds only the first, `.node` only the second; the real suite's command carries `--test-coverage-lines=84` and
      the node suite's does not); `without repo, the real suite builds the native trees first` (like the existing
      `without repo, the door builds the native trees before mods`, `scripts/test.test.mjs:229`).
- [ ] **Step 2: Run** `node --test scripts/test.test.mjs`. Expected: the six fail.
- [ ] **Step 3: Implement** in `scripts/test.mjs`:
      `export function realTool(t, name, { candidates = [], strict = process.env.DEAD_SKILLS_STRICT === '1' } = {})`:
      the first candidate that exists, else `which(name)` from `system/proc.ts`, else throw
      `` `${name} not found` `` under strict or `t.skip(...)` and return `undefined`. `scripts/test.d.mts` declares it
      for `.ts` importers (TS7016 measured without it). `GLOBS.real` = `plugins/**/*.real.test.mjs` and
      `tools/**/*.real.test.ts`; `GLOBS.node` excludes `**/*.real.test.*`. The coverage flags move off the node
      command; the `real` suite runs the real files plus `tools/installer/**/*.test.ts` under them (the installer's
      fast tests run in both suites: seconds, and the hook keeps them). Until a real file exists the suite still runs
      the installer tests. `needsTrees` (`scripts/test.mjs:~207`) includes `real`, since the installer's `core/` tests
      and both real tests read the built trees. USAGE names `real`. `main` sets `process.env.DEAD_SKILLS_STRICT = '1'` when `strict`.
- [ ] **Step 4: Run** `node --test scripts/test.test.mjs` and `node scripts/test.mjs real`. Expected: PASS, the floor
      met as before.
- [ ] **Step 5:** test.yml runs `--strict repo node mods python real`. `ci.md`: which suites the hook, the release
      jobs and test.yml run. AGENTS.md "Checks": one paragraph stating the rule (ADR 0017's first paragraph in two
      sentences, the `realTool` / `real_agent_browser` lookups, `DEAD_SKILLS_STRICT`, the `real` suite and who runs
      it), and the coverage-floor sentence names the `real` suite. ADR 0017: Consequences name the `real` suite, the
      Chrome exception (F2) and the Nix skip (F4).
- [ ] **Step 6: Commit** `git add -- AGENTS.md GLOSSARY.md docs/adr/0017-tests-use-the-real-thing.md docs/components/ci.md scripts/test.mjs scripts/test.d.mts scripts/test.test.mjs .github/workflows/test.yml`
      with message "Write the real-test rule, add realTool and the real suite."

### Task 2: headroom-trim survives the hook on Windows, proven through real Claude Code

**Does:** A test runs the real SessionStart hook through `claude -p` and checks the trim server outlives it; the
launcher then starts the server detached on Windows through `uv run --gui-script` so it survives with no console.
**Depends on:** Task 1
**Adds:** `plugins/opt-in/headroom-trim/hooks/session.real.test.mjs`
**Size:** ~180

**Files:**

- Create: `plugins/opt-in/headroom-trim/hooks/session.real.test.mjs`
- Modify: `plugins/opt-in/headroom-trim/hooks/launcher.mjs`
- Modify: `plugins/opt-in/headroom-trim/hooks/launcher.test.mjs`
- Modify: `docs/components/headroom-trim.md`
- Modify: `plugins/opt-in/headroom-trim/README.md`
- Modify: `.github/workflows/test.yml`

```files
~ plugins/opt-in/headroom-trim/hooks/launcher.mjs  detached on every platform, pythonw on Windows
    ~ main  detached: true everywhere
    ~ startArgs  --gui-script on win32
~ plugins/opt-in/headroom-trim/hooks/launcher.test.mjs  injected-spawn tests of main go
```

- [ ] **Step 1: Write the failing test** `session.real.test.mjs`, test `the trim server outlives the SessionStart
      hook`: `realTool(t, 'claude')` and `realTool(t, 'uv', { candidates: [<CLAUDE_CONFIG_DIR or ~/.claude>/bin/uv[.exe]] })`
      (uv is not on PATH on this machine, measured); copy the built `.claude-plugin/headroom-trim` to a temp dir;
      replace `47811` in its `hooks/hooks.json` (launch arg and hook URL) with a free port and assert the copy no
      longer contains `47811`; run `claude -p hi --plugin-dir <copy>` with `CLAUDE_CONFIG_DIR=<temp>`, stdin closed,
      PATH holding uv's folder; don't assert claude's exit code (it exits 1 without a login, probed on 2.1.322); after
      claude exits, poll `http://127.0.0.1:<port>/health` (every 500 ms, up to 240 s, the first run builds the venv)
      until it answers `{ok: true}`; wait 5 s and assert it still answers. An `after` hook `POST`s `/shutdown`; if
      `/health` never answered, it kills the process tree of the uv pid that `launcher.log` records (in
      `CLAUDE_PLUGIN_DATA`, under `--plugin-dir` `<CLAUDE_CONFIG_DIR>/plugins/data/headroom-trim-inline`, probed;
      `taskkill /T /F /PID` on Windows through `system/proc.ts`, so pythonw goes too). Per-test `timeout: 300_000`.
- [ ] **Step 2: Run** `node --test plugins/opt-in/headroom-trim/hooks/session.real.test.mjs` on Windows (after
      `npm run build:harnesses`). Expected: FAIL, no answer on `/health` (the server died with the hook). On Linux
      it may pass already; record both under **Tasks** in flow.md. Run it once more with CI's pinned Claude Code
      (`npx -y @anthropic-ai/claude-code@<test.yml's pin>`): if that version runs no SessionStart hook under `-p`,
      bump test.yml's pin to the version measured here and say so in the commit message.
- [ ] **Step 3: Implement** in `launcher.mjs`: `detached: true` on every platform (drop the win32 comment's
      reasoning, keep one line on why `--gui-script`); `startArgs` takes `platform` and on `win32` runs
      `uv run --locked --project <dir> --gui-script <server.py> …` (no `python` argument). (pythonw's output to a
      file was measured to arrive; the test doesn't assert `server.log`.)
- [ ] **Step 4: Run** the test on Windows. Expected: PASS. If the server never answers, stop: that is a deviation
      (spec, Decided in the grill, item 2).
- [ ] **Step 5:** In `launcher.test.mjs` delete the tests of `main` that inject `spawn`/`fetch` and whose behaviour
      the new test covers (start, detached and hidden, unref); keep `decide`, `identityOf`, `pluginVersion`,
      `serverEnv`, `findUv`, `startArgs`, `openServerLog`, and any `main` test of a path the real test can't reach
      (replace an outdated server, off switch), each with its `// fake:` line. Update `startArgs`' test for
      `--gui-script`.
- [ ] **Step 6:** `test.yml`: a step reading uv's pin (`node -p "…tools.json…tools.uv.version"`) into an output, and
      `setup-uv` `version:` from it. Docs: `headroom-trim.md` and the README say the server starts detached and, on
      Windows, through `--gui-script`; the Checks section names the new test.
- [ ] **Step 7: Run** `npm test`. Expected: all suites pass, the new test in `real` (compare with the five known
      EPERM symlink failures).
- [ ] **Step 8: Commit** the task's files: "Keep the trim server alive after the hook on Windows and prove it through Claude Code."

### Task 3: The installer's test seam: answers file and local release source

**Does:** Lets the installer run unattended from an answers file and install from a local marketplace and a local
release URL, with an unanswered prompt failing at once.
**Depends on:** Task 1
**Adds:** env `DEAD_SKILLS_TEST_ANSWERS`; `tools/installer/core/answers.ts`
**Size:** ~130

**Files:**

- Create: `tools/installer/core/answers.ts`
- Create: `tools/installer/core/answers.test.ts`
- Modify: `tools/installer/ui/ui.ts`
- Modify: `tools/installer/core/release.ts`
- Modify: `tools/installer/core/release.test.ts`
- Modify: `tools/installer/install.ts`
- Modify: `tools/installer/steps/plugins.ts`
- Modify: `tools/installer/ui/ui.test.ts`
- Modify: `docs/components/installer.md`

```files
+ tools/installer/core/answers.ts  reads DEAD_SKILLS_TEST_ANSWERS on every call
    + testAnswers  the parsed answers file, or undefined
~ tools/installer/ui/ui.ts  prompts answer from the answers file
    ~ screen  applies the file's chosen map and returns result apply
    ~ confirm  answers from the file
    ~ line  answers from the file
    ~ secret  answers from the file
~ tools/installer/core/release.ts  local release source
    ~ marketplaceArg  the answers file's marketplace when set
    ~ marketplaceSource  the matching local-directory source
    + addsOfficialMarketplace  false under a local marketplace
~ tools/installer/install.ts  TTY guard and self-update skipped under the seam
~ tools/installer/steps/plugins.ts  asks core whether to add the official marketplace
tools/installer/ui/ui.ts uses tools/installer/core/answers.ts
tools/installer/core/release.ts uses tools/installer/core/answers.ts
```

- [ ] **Step 1: Write the failing tests.** `core/answers.test.ts`: `testAnswers reads the file the variable
      names` (`{chosen, prompts, marketplace, releases}` round-trips) and `a malformed answers file throws its path`.
      `core/release.test.ts`: `marketplaceArg and addsOfficialMarketplace follow a local marketplace`.
      `ui/ui.test.ts`, each test setting `DEAD_SKILLS_TEST_ANSWERS` itself and deleting it after (the file's keyboard
      tests run without it), against a temp answers file
      `{"chosen": {"a": true}, "prompts": {"Write these": true, "Collection URL": "https://dev.example/tfs/Coll"}}`:
      `screen applies chosen from the answers file` (returns `chosen.a === true`, `result === 'apply'`, reads no key);
      `confirm and line answer by message prefix` (`confirm('Write these changes?')` → `true`;
      `line('Collection URL:')` → the string); `an unanswered prompt throws its message`
      (`confirm('Uninstall them?')` rejects with `/no answer for prompt: Uninstall them\?/`).
- [ ] **Step 2: Run** `node --test tools/installer/core/answers.test.ts tools/installer/core/release.test.ts tools/installer/ui/ui.test.ts`.
      Expected: the six fail.
- [ ] **Step 3: Implement:** `core/answers.ts` `testAnswers()` reads `DEAD_SKILLS_TEST_ANSWERS` on every call, not
      once (tests set and unset it within one process; JSON: `chosen`, `prompts`, optional `marketplace`, optional
      `releases`). It sits in `core/` beside `release.ts`, which already reads `package.json` at load
      (`release.ts:10`), so `core/` gains no import from `system/`. In `ui.ts`, with answers present, `screen`
      returns `{...state, chosen: {...state.chosen, ...chosen}, result: 'apply'}`, and `confirm`, `line`, `secret`
      answer from the first `prompts` key the message starts with, else throw. `core/release.ts`: `RELEASES` is
      `answers.releases` when set (a module constant read at load: the CLI has the variable before it starts, and
      the end-to-end test covers it; no unit test toggles it); `marketplaceArg()` is `answers.marketplace` when set,
      and `marketplaceSource()` the matching local-directory source, so `pinMarketplace` (`release.ts:20-23`, called
      from `steps/settings.ts:55`) pins the entry to the folder that is added (the source shape is inferred: take it
      from the settings a `claude plugin marketplace add <dir>` writes); `addsOfficialMarketplace()`
      is false when `marketplace` is set (the official add is an unpinned network clone). `install.ts`: the TTY guard
      passes with answers present; the self-update check is skipped when `releases` is set. `steps/plugins.ts` adds
      `claude-plugins-official` only when `addsOfficialMarketplace()`; the step reads no test variable.
- [ ] **Step 4: Run** the three test files. Expected: PASS.
- [ ] **Step 5:** `installer.md`: a short section on the test-only variable, its four fields, what each skips, and
      that a user never sets it.
- [ ] **Step 6: Commit** the task's files: "Let the installer run unattended from an answers file and a local release."

### Task 4: The installer end to end with real claude and codex

**Does:** Runs the whole installer into temporary homes with the real CLIs and the freshly built binaries, checks the
result through the CLIs and files, and deletes the step tests it covers.
**Depends on:** Task 3
**Adds:** `tools/installer/install.real.test.ts`
**Size:** ~300

**Files:**

- Create: `tools/installer/install.real.test.ts`
- Modify: `scripts/test.mjs`
- Modify: `scripts/test.test.mjs`
- Delete: `tools/installer/steps/codex.test.ts`
- Delete: `tools/installer/steps/tools.test.ts`
- Delete: `tools/installer/steps/config.test.ts`
- Delete: `tools/installer/steps/output-style.test.ts`
- Modify: `tools/installer/steps/codex.ts`
- Modify: `tools/installer/steps/config.ts`
- Modify: `tools/installer/steps/tools.ts`
- Modify: `tools/installer/modules.test.ts`
- Modify: `.github/workflows/test.yml`
- Modify: `AGENTS.md`
- Modify: `docs/components/installer.md`

- [ ] **Step 0:** This machine has no Codex CLI (checked in review). Install the pin test.yml will use,
      `npm install -g @openai/codex@0.172.0` (the current version on 2026-11-24; the user approves it at Gate 2), and
      check that `codex plugin list --json` and `codex mcp list --json` answer with a fresh `CODEX_HOME` and no login.
      If they need a login, stop: that is a deviation.
- [ ] **Step 1: Write the test** `install.real.test.ts`, test `a full install on fresh homes`:
      `realTool` for `claude`, `codex`, and the three debug binaries (`realTool(t, 'web-mcp', { candidates:
      [target/debug/web-mcp[.exe]] })`, likewise `http-runner` and `ado-mcp`; missing → the same fail/skip with "run
      cargo build -p web-mcp -p http-runner -p ado-mcp"). Marketplace: copy the built `.claude-plugin/` tree into a
      temp root, rewrite headroom-trim's `47811` in the copied `hooks.json` to a free port, assert the copy contains
      no `47811` (`steps/uv.ts`' `stopTrimServer` then reads the free port). Codex installs from the installer's own
      package tree (`steps/codex.ts:165`), which has no headroom-trim (Claude Code only in `catalog.json`).
      Pack each binary as the release archive `resolveTool` names (`<name>-<target>.zip|tar.gz`, exe at the root)
      with bsdtar (`C:\Windows\System32\tar.exe -a -cf` on Windows, through `system/proc.ts`; Git Bash's GNU tar
      writes a tar under a `.zip` name, measured in review), assert each zip starts with `PK`, and write its `.sha256`
      in the format `core/binaries.ts` `sha256Of` reads, under `v<VERSION>/`, served by a `node:http` server on
      127.0.0.1 that counts hits. Temp `HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`. agent-browser
      follows `HOME`/`USERPROFILE` (measured in review), so seed `<temp HOME>/.agent-browser/browsers` with a copy of
      the developer's or CI's cached `~/.agent-browser/browsers` when one exists (the install step then fetches only
      what's missing: inferred, the test logs whether it downloaded).
      Answers file: `chosen` = the bundle, `web-mcp`, `http-runner`, `mcp-azure`, `headroom-trim` (Claude ids and
      Codex names), `ccstatusline: true`, `dcg: false`, `strip-defaults: false`, `clean: false`; `prompts` for every
      prompt the run shows (Download …: true, browser system packages: false, Write these changes: true, the Azure
      URL and PAT: `https://dev.example/tfs/Coll` and `pat-test-value`); `marketplace` = the temp root with `/`;
      `releases` = the local server's URL. Run `node tools/installer/install.ts --agents=claude-code,codex` with
      `DEAD_SKILLS_TEST_ANSWERS` set, stdin closed. Assert: exit 0 and no failure line in the summary;
      `claude plugin list --json` lists the chosen ids; `<config>/bin/web-mcp --version` prints `package.json`'s
      version and the release server saw each archive; `agent-browser` in `<config>/bin` and a Chrome for Testing
      under `<HOME>/.agent-browser/browsers`; `<HOME>/.config/ccstatusline/settings.json` exists; headroom's venv
      exists under the plugin data dir; `codex plugin list --json` and `codex mcp list --json` (with `CODEX_HOME`)
      list web-mcp; the Azure URL is in `<CLAUDE_CONFIG_DIR>/settings.json`, and `<CODEX_HOME>/config.toml`'s
      `env_vars` names the Azure variables (Codex's config holds no URL: plan review R3). One run only.
      Per-test `timeout: 1_200_000`.
- [ ] **Step 2: Run** `cargo build --locked -p web-mcp -p http-runner -p ado-mcp` (PowerShell), then
      `npm run build:harnesses` and `node --test tools/installer/install.real.test.ts`. Expected: PASS, or a real
      installer bug: fix it in its step, root cause once.
- [ ] **Step 3:** Measure first: run the `real` suite's coverage with the four step tests moved aside, and keep
      whatever the 84 % floor needs (never lower it). Then delete the four step tests above as far as the run covers
      their behaviour; a behaviour the run can't
      reach (a codex legacy-block removal, a failed download) keeps its test with a `// fake:` line, in a smaller file.
      Remove the injected-IO fields that only the deleted tests passed: `ToolIo` keeps `binDir`, `platform`, `arch`,
      `off` and `download` (the kept failed-download test passes it) and loses `ask` and `version`; `CodexIO` and
      `steps/config.ts`' `services` lose every field no kept test passes. Name each removed field in flow.md's
      **Tasks** line.
- [ ] **Step 4:** `scripts/test.mjs`: the `real` suite runs two commands. The first runs the real files that need
      only their own tools (the headroom test gates itself through `realTool`), without the floor. The second runs
      the installer tests plus `install.real.test.ts` under the floor, and is NOT RUN with the missing tool's name (a
      failure under `--strict`) when `claude`, `codex` or a debug binary is missing, so a local run neither loses the
      headroom proof nor reports the floor as failed for a skipped end-to-end test (it falls to 73.43 % without it,
      measured). Test both in `scripts/test.test.mjs`.
- [ ] **Step 5: Run** `npm test`. Expected: PASS with the 84 % installer coverage floor met in `real` (child-process
      coverage counts, measured on Node 26.8.1).
- [ ] **Step 6:** `test.yml`: install the Codex CLI at Step 0's pin; `rustup update stable` as crates.yml does (the
      workspace needs 1.97); `cargo build --locked -p web-mcp -p http-runner -p ado-mcp` (with rust-cache,
      `shell: pwsh` so Windows links with MSVC); restore a cache of `~/.agent-browser/browsers` keyed by OS and the
      agent-browser pin, which the test seeds from; all before the tests. Set the job's `timeout-minutes` (30 today)
      from a measured CI run: a cold build, uv's cold cache under the temp HOME (`trimServerEnv` strips `UV_*`,
      `core/plugins.ts:122-125`) and the install add up. AGENTS.md "Dependency updates":
      add the Codex CLI pin to the hand-bumped list. `installer.md`: name the end-to-end test.
- [ ] **Step 7: Commit** the task's files: "Test the installer end to end with the real claude and codex CLIs."

### Task 5: web-mcp's harness on real agent-browser and Chrome, with the engine base override

**Does:** Adds a real-browser start to web-mcp's test harness (the fake stays the default until Task 8), serves
captured engine pages through a debug-only per-engine origin override, captures the missing variants, and installs
agent-browser and Chrome in CI.
**Depends on:** Task 1
**Adds:** env `WEB_MCP_TEST_ENGINES`; `Mcp::start_real` in `tests/common/mod.rs`; `real_agent_browser()` in
browser-core
**Size:** ~260

**Files:**

- Modify: `tools/web/web-mcp/src/engines/mod.rs`
- Modify: `tools/web/web-mcp/tests/common/mod.rs`
- Modify: `tools/web/browser-core/src/browser.rs`
- Create: `tools/web/web-mcp/tests/fixtures/engines/README.md`
- Modify: `tools/web/web-mcp/tests/fixtures/engines/` (adds only the variants Step 1 captures)
- Modify: `tools/web/web-mcp/tests/search.rs`
- Modify: `scripts/test.mjs`
- Modify: `scripts/test.test.mjs`
- Modify: `scripts/ci-changes.mjs`
- Modify: `scripts/ci-changes.test.mjs`
- Modify: `.github/workflows/crates.yml`
- Modify: `flake.nix`
- Modify: `docs/components/web-mcp.md`
- Modify: `docs/adr/0017-tests-use-the-real-thing.md`

```files
~ tools/web/web-mcp/src/engines/mod.rs  engine origins from WEB_MCP_TEST_ENGINES in debug builds
    ~ url  swaps scheme, host and port for the engine's override, keeps the path
~ tools/web/browser-core/src/browser.rs  the one Rust agent-browser lookup
    + real_agent_browser  WEB_MCP_AGENT_BROWSER, else the installer's copy, else panic
~ tools/web/web-mcp/tests/common/mod.rs  real agent-browser and Chrome beside the fake
    + start_real  starts web-mcp on the real agent-browser
tools/web/web-mcp/tests/common/mod.rs uses tools/web/browser-core/src/browser.rs
tools/web/web-mcp/tests/common/mod.rs uses tools/web/web-mcp/src/engines/mod.rs
```

- [ ] **Step 1: Captures** (plan review F3). Real captures already exist in `tests/fixtures/engines/` (the engines'
      inline parser tests read them, `google.rs:1-3`): results for bing, brave, duckduckgo, google and scholar,
      `-none` for bing, duckduckgo, scholar, `google-consent.html`, captcha pages for google, duckduckgo and
      semanticscholar. The real harness serves those. Capture only the missing variants once, on this machine, with
      the release web-mcp (`semanticscholar.html` and `-none`, `brave-none`, `google-none`, and a block page for an
      engine that shows one during the capture), keeping the page web-mcp's
      archive stores (if it doesn't keep the engine page, `agent-browser --session <s> get html` from the same
      session; say which), with the same names (`<engine>-none.html`). Strip nothing but the user's identity or
      locale, if present. `tests/fixtures/engines/README.md` lists each file: captured or hand-shaped, query, date,
      web-mcp version where known. `tests/fixtures/search/` (the fake's `{{STUB}}` templates) stays untouched until
      Task 8. The user reviews new captures before the commit.
- [ ] **Step 2: Write the failing tests** in `tests/search.rs`: `search_through_real_chrome_reads_captured_google`
      — through `Mcp::start_real`, a fixture server for google on `127.0.0.3:<port>` serves
      `engines/google.html` at `/search` (the engine's real path, any query) and answers `/goto` with a 302 to the
      link's target; `search` for the captured query with `engines: ["google"]` returns the captured page's first
      result title. `real_chrome_rows_match_the_parser` — for one capture per engine, the rows through real Chrome
      equal the rows the engine's inline parser test gets for the same file on its real URL (the override moves the
      page's host, and the parsers drop own-host links by `page.host()`, `google.rs:73`, `bing.rs:74`,
      `brave.rs:50`, `duckduckgo.rs:44`); a difference is a deviation, not a test to loosen.
- [ ] **Step 3: Run** `cargo test --locked -p web-mcp --test search search_through_real_chrome` (PowerShell).
      Expected: FAIL (no `start_real`, no override).
- [ ] **Step 4: Implement:** `Engine::url` reads `WEB_MCP_TEST_ENGINES` (`google=http://127.0.0.3:P1,bing=…`) under
      `#[cfg(any(debug_assertions, feature = "test-hooks"))]`, as `WEB_MCP_TEST_PUBLIC_IP` is gated, and swaps only
      scheme, host and port for the listed engine, keeping the path, so `/sorry` (`google.rs:18,81`) and `/goto`
      (`google.rs:56-57`) logic stays real. browser-core: `real_agent_browser()` (the lookup in Global Constraints)
      beside `fake_agent_browser()`. `tests/common/mod.rs`: `Mcp::start_real` uses it; Chrome is not set (`pick`
      finds Chrome for Testing); the extension is a minimal valid manifest written to the temp dir (no download);
      each engine gets its own fixture server on `127.0.0.3`, which `WEB_MCP_TEST_PUBLIC_IP` lists with
      `127.0.0.2` (binding 127.0.0.3 on Windows measured in review); an engine route matches on the path alone (the
      fixture's routes key on path plus query today, `common/mod.rs:111,120`, and Chrome sends `/search?q=…`), and
      Google's server answers `/goto` with a 302 to the `url` parameter. Engine pages are served with
      `Content-Security-Policy: default-src 'self'; script-src 'none'`, so a capture's scripts never run and nothing
      is fetched from an engine host (the captures hold 12–84 `<script>` tags; CDP evaluation is not page script:
      inferred, the test proves it). Chrome-starting tests take one process-wide permit at a time (a `static`
      semaphore) so a run doesn't open one Chrome per thread. `Mcp`'s `Drop` closes web-mcp's stdin, waits up to
      5 s for it to exit (web-mcp closes its browser only on a graceful end, `main.rs:74`), then kills it and any
      Chrome whose `--user-data-dir` is its temp dir, and removes that dir. The captured page's own search form
      submits to its real path on the overridden origin.
- [ ] **Step 5: Run** the tests. Expected: PASS.
- [ ] **Step 6: Write the test** `a_dropped_server_leaves_no_chrome`: after a search through `Mcp::start_real`, drop
      the `Mcp` without `finish()`; no Chrome whose command line holds that test's dir remains (poll up to 5 s), and
      the dir is gone. Run it; expected PASS.
- [ ] **Step 7:** `scripts/test.mjs` rust suite: when agent-browser is missing (neither `WEB_MCP_AGENT_BROWSER` nor
      `<CLAUDE_CONFIG_DIR or ~/.claude>/bin/agent-browser[.exe]`), only web-mcp, browser-core and http-runner are
      NOT RUN `agent-browser not found`, ado-mcp still runs; else pass the found path to cargo; tested in
      `scripts/test.test.mjs`. `ci-changes.mjs`: `tools/installer/assets/tools.json` also selects web-mcp and
      http-runner (their tests run the pinned agent-browser), tested in `ci-changes.test.mjs`. ADR 0017: sync PRs
      that bump the pin are not tested beyond today's checks, as now.
- [ ] **Step 8:** `crates.yml`: download agent-browser at the `tools.json` pin, check its sha256, restore a cache of
      `~/.agent-browser/browsers` keyed by OS and the agent-browser pin, run `agent-browser install` (fetches only
      what's missing: inferred, check the log), set `WEB_MCP_AGENT_BROWSER`; on Linux run the tests under
      `xvfb-run`. If Chrome stops with "No usable sandbox" on ubuntu-latest (Ubuntu 24.04's AppArmor limit on user
      namespaces for a Chrome outside `/opt`: assumed, not checked), add
      `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` before the tests, never `--no-sandbox` in
      product code. `flake.nix`: web-mcp's `checkFlags` skip the tests that start a browser (`--skip` by test name),
      with the reason (F4). `web-mcp.md`: the real harness, the override, the capture README.
- [ ] **Step 9: Commit** the task's files: "Run web-mcp's tests on real agent-browser and Chrome against captured
      engine pages."

### Task 6: web-mcp browser and fetch-fallback tests against the real browser

**Does:** Rewrites `tests/browser.rs` to assert what a user sees through real Chrome, producing closed tabs, a dead
Chrome and slow pages for real.
**Depends on:** Task 5
**Adds:** nothing new
**Size:** ~500

**Files:**

- Modify: `tools/web/web-mcp/tests/browser.rs`
- Modify: `tools/web/web-mcp/tests/fetch.rs` (its browser-fallback tests)
- Modify: `tools/web/web-mcp/tests/common/mod.rs`
- Modify: `tools/web/web-mcp/tests/fixtures/` (pages the rewritten tests load)
- Modify: `flake.nix`

- [ ] **Step 1:** Group the 27 fake-driven tests by behaviour class (opening and reading a page, clicking and
      typing, a closed tab, a dead Chrome, a slow page, a failed open, the archive) and keep one real test per class
      through `Mcp::start_real`, plus a second only where the class has two outcomes a user would tell apart (plan
      review R11). Each asserts on the tool's answer, the page Chrome shows, or the archive written: a closed tab is
      `agent-browser … tab close` on the session; a dead CDP is killing the Chrome process found by its
      `--user-data-dir`; a slow page is a fixture route with `Resp::delay`; a failed open is a refused port. The rest
      are deleted as covered; list them in flow.md's **Tasks** line. A behaviour with no real trigger (screenshot
      failing by session name) is deleted with a line in the commit message, not kept on the fake. The same for
      `tests/fetch.rs`' tests whose fetch falls back to the browser; its plain-HTTP tests stay as they are.
- [ ] **Step 2: Run** `cargo test --locked -p web-mcp --test browser --test fetch` (PowerShell). Expected: PASS, twice in a row
      (no flakes).
- [ ] **Step 3:** `flake.nix`: the web-mcp `checkFlags` skip list names the rewritten browser tests.
- [ ] **Step 4: Commit** `tools/web/web-mcp/tests/` and `flake.nix`: "Test web-mcp's browser tool against real
      Chrome."

### Task 7: web-mcp search, rows and papers tests against the real browser

**Does:** Rewrites `tests/search.rs`, `tests/rows.rs` and the browser half of `tests/papers.rs` to run on real Chrome
against the captured engine pages.
**Depends on:** Task 6 (both edit `tests/common/mod.rs`; run one after the other)
**Adds:** nothing new
**Size:** ~450

**Files:**

- Modify: `tools/web/web-mcp/tests/search.rs`
- Modify: `tools/web/web-mcp/tests/rows.rs`
- Modify: `tools/web/web-mcp/tests/papers.rs`
- Modify: `tools/web/web-mcp/tests/common/mod.rs`
- Modify: `tools/web/web-mcp/tests/fixtures/engines/` (pages for the typing faults; captures stay byte-identical)
- Modify: `flake.nix`

- [ ] **Step 1:** Of the 37 + 22 + 4 fake-driven tests, keep one real test per behaviour class through
      `Mcp::start_real` (an engine's results, none, blocked, consent, slow, offline, a typing fault, a private
      redirect, fusion across engines, rows' extraction and paging, the papers' browser path), delete the rest as
      covered and list them in flow.md's **Tasks** line (plan review R11). Engine-state markers (`.none`, `.blocked`,
      `consent-once`, `.slow`) become fixture routes serving the captured variant pages (consent-once: a `Resp` list);
      `FAKE_AB_DELAY_MS` becomes `Resp::delay`; typing faults become pages (no search box; a form whose submit is
      prevented; a keydown handler that stalls); `.landed` goes (the landed URL is real); `.offline` becomes a closed
      port with the assertion on Chrome's real error text; `redirect-private` becomes a public route answering 302 to
      `127.0.0.1`. The owner-delay test (`window_start_is_outside_the_engine_deadline`) keeps a measured outcome: a
      slow first Chrome start doesn't eat the engine deadline.
- [ ] **Step 2: Run** `cargo test --locked -p web-mcp --test search --test rows --test papers` (PowerShell), twice.
      Expected: PASS both times.
- [ ] **Step 3:** `flake.nix`: the web-mcp skip list names the rewritten search, rows and papers tests.
- [ ] **Step 4: Commit** `tools/web/web-mcp/tests/` and `flake.nix`: "Test web-mcp's search, rows and papers on
      real Chrome."

### Task 8: browser-core and web-mcp inline tests on the real agent-browser; the fake goes

**Does:** Moves browser-core's and web-mcp's inline tests from the fake to the real agent-browser, deletes the fake
binary if nothing uses it, and updates the docs and the test script that built it.
**Depends on:** Task 6, Task 7
**Adds:** nothing new
**Size:** ~400

**Files:**

- Modify: `tools/web/browser-core/src/browser.rs`
- Modify: `tools/web/browser-core/src/window.rs`
- Modify: `tools/web/web-mcp/src/fetch.rs`
- Modify: `tools/web/web-mcp/tests/common/mod.rs`
- Delete: `tools/web/web-mcp/tests/bin/fake_agent_browser.rs`
- Delete: `tools/web/web-mcp/tests/fixtures/search/` (the fake's `{{STUB}}` templates)
- Modify: `tools/web/web-mcp/Cargo.toml`
- Modify: `scripts/test.mjs`
- Modify: `scripts/test.test.mjs`
- Modify: `.github/workflows/crates.yml`
- Modify: `flake.nix`
- Modify: `AGENTS.md`
- Modify: `docs/components/web-mcp.md`
- Modify: `docs/components/browser-core.md`

```files
~ tools/web/browser-core/src/browser.rs  inline tests on the real agent-browser
    - fake_agent_browser  no test starts the fake
~ tools/web/web-mcp/tests/common/mod.rs  no fake left
    ~ start  starts web-mcp with no browser at all
```

- [ ] **Step 1:** The inline tests use `real_agent_browser()` (Task 5) instead of `fake_agent_browser()`.
      `Mcp::start` stops pointing at the fake: it gives web-mcp an agent-browser path that doesn't exist, so the
      tests that open no browser (`fetch.rs`' plain-HTTP tests, `lookup.rs`, `mcp.rs`, the API half of `papers.rs`)
      need no agent-browser, here or in Nix; any of them that turns out to need a browser moves to `start_real`
      (list it in flow.md). The 11 + 4 + 1 inline tests run on it: `wait-fail` / `wait-slow` become an `about:blank` wait on an expression that never turns true;
      `/slow` a local `TcpListener` that never answers; `.gone` a real `tab close`; the generation change a killed
      Chrome. Tests whose only check is the fake's call log or `typedelay` lock ordering are deleted when a web-mcp
      test covers the outcome (parallel searches serialise their typing), else rewritten to that outcome.
- [ ] **Step 2: Run** `cargo test --workspace --locked` (PowerShell), then
      `cargo clippy --workspace --all-targets --locked -- -D warnings` and `cargo fmt --all -- --check`.
      Expected: all pass.
- [ ] **Step 3:** If no test starts `fake-agent-browser` any more, delete it and its `[[bin]]`; remove the
      `cargo build … --bin fake-agent-browser` step from `scripts/test.mjs` and its two assertions in
      `scripts/test.test.mjs`; update AGENTS.md "Checks" (the Rust line), `web-mcp.md` and `browser-core.md`. If one
      survives, it shrinks to the behaviours still used, each with its `// fake:` line, and the docs say why.
      `flake.nix`: the browser-core and web-mcp (`src/fetch.rs`) inline tests that start agent-browser join the skip
      list. `crates.yml`: the comment "The rust suite builds the fake first" (`crates.yml:58`) goes or says what is
      true. Delete
      `tests/fixtures/search/` once nothing reads it.
- [ ] **Step 4: Run** `npm test` and `node scripts/test.mjs --strict rust`. Expected: PASS.
- [ ] **Step 5: Commit** the task's files: "Move browser-core's tests to the real agent-browser and drop the fake."

### Task 9: http-runner's login page in real Chrome

**Does:** Opens the login page in real Chrome through agent-browser in every test, fills and submits the real form,
and deletes `fake-browser`.
**Depends on:** Task 5, Task 8 (both edit `flake.nix`; run after it)
**Adds:** nothing new
**Size:** ~250

**Files:**

- Modify: `tools/http-runner/src/tools.rs`
- Modify: `tools/http-runner/tests/common/mod.rs`
- Modify: `tools/http-runner/tests/login_page.rs`
- Modify: `tools/http-runner/tests/run.rs`
- Modify: `tools/http-runner/tests/mcp.rs`
- Delete: `tools/http-runner/tests/bin/fake_browser.rs`
- Modify: `tools/http-runner/Cargo.toml`
- Modify: `flake.nix`
- Modify: `docs/components/http-runner.md`

```files
~ tools/http-runner/src/tools.rs  HTTP_RUNNER_OPEN carries arguments
    ~ hook  splits the value on newlines into program and arguments
~ tools/http-runner/tests/common/mod.rs  real agent-browser opens, fills and submits
```

- [ ] **Step 1: Write the failing test** in `tests/login_page.rs`: `a_real_browser_submits_the_login_form` —
      `Open::Program([agent-browser, --session, <s>, open])`; the test reads the page's URL with
      `agent-browser --session <s> get url`, fills `#f0-0` with `secret-value`, clicks `button`; the store holds the
      typed value for the host, and the browser shows the page's success answer.
- [ ] **Step 2: Run** `cargo test --locked -p http-runner --test login_page a_real_browser` (PowerShell).
      Expected: FAIL until the rig opens a real browser.
- [ ] **Step 3: Implement:** the debug-only `HTTP_RUNNER_OPEN` value is split on `\n` into the program and its
      arguments (a path may hold spaces, so not on spaces; the hook's comment says so); `tests/common/mod.rs`: a
      short copy of the agent-browser lookup (Global Constraints); `rig_with` and `Mcp::start` open through it,
      `Rig::address` reads `get url`, `submit` fills and clicks through agent-browser, and the rig's `Drop` closes
      its agent-browser session. The "no browser opened" cases use a real program that starts and exits non-zero
      (agent-browser with an unknown command; the test first asserts that exit code is non-zero), not a missing
      path, so the branch that reads the exit status runs.
- [ ] **Step 4:** Move the 14 + 55 + 8 tests to the real rig, one per behaviour class where several assert the same
      outcome (list the deleted ones in flow.md's **Tasks** line); delete `fake_browser.rs` and its `[[bin]]`;
      `flake.nix`: http-runner's `checkFlags` skip the tests that open a browser, with the reason (F4);
      `http-runner.md` names the real browser and the newline split.
- [ ] **Step 5: Run** `cargo test --locked -p http-runner` (PowerShell), twice. Expected: PASS both times.
- [ ] **Step 6: Commit** the task's files: "Open http-runner's login page in real Chrome in its tests."

### Task 10: ado-mcp's capture mode

**Does:** Adds an opt-in capture of masked real answers, so the user can replace the doc-shaped fixtures with captures
from their server.
**Depends on:** Task 1
**Adds:** env `ADO_CAPTURE_DIR`
**Size:** ~200

**Files:**

- Modify: `tools/ado-mcp/src/api.rs`
- Modify: `tools/ado-mcp/tests/api.rs`
- Modify: `docs/components/mcp-azure.md`
- Modify: `docs/features/ado-mcp/smoke.md`

```files
~ tools/ado-mcp/src/api.rs  capture at the two places every answer passes
    ~ send  Guard hands each 2xx answer to capture
    ~ exec  hands each answer to capture
```

- [ ] **Step 1: Write the failing test** in `tests/api.rs`: `capture_writes_masked_answers` — the replay server
      answers `/_apis/connectionData` and a PR with real-shaped identities (an email, `displayName`, `uniqueName`, a
      SID `descriptor`, an `id` GUID that also appears inside `url` and `imageUrl`, `_links` on the server's host)
      and the collection, project and repository names in paths and values; with `ADO_CAPTURE_DIR` set, after the
      calls the folder holds one file per request (`<method>-<path, / as _>-<short hash of the query>.<ext>`), none
      containing the email, the names, the SID, the identity GUID, the collection, project or repository name, the
      PAT or the server's host, and each JSON file still parsing into the same crate model (`tests/fixtures.rs`
      TABLE); emails become `user<n>@example.com`, names `User <n>`, the host `dev.example`, the same identity the
      same `<n>`; a non-JSON answer keeps its extension and is host-masked.
- [ ] **Step 2: Run** `cargo test --locked -p ado-mcp --test api capture` (PowerShell). Expected: FAIL.
- [ ] **Step 3: Implement** in `api.rs`: when `ADO_CAPTURE_DIR` is set (release builds too), `Guard::send`
      (`api.rs:139-170`) and `exec` (`api.rs:393-437`) buffer each answer body and hand it to one capture function,
      and the caller still gets the unmasked body. Masking is two passes: the first collects identity values
      (emails, display and unique names, descriptors, identity ids; the collection from `ADO_ORG_URL`, `config.rs:15-37`;
      project and repository names from the request path and the answer's `project.name` / `repository.name`
      fields), the second replaces them in string values and in the file name's path segments, never in JSON keys
      (a short project name could match a key), then the configured host; other GUIDs stay. The test includes a
      project name that equals a JSON key and checks the keys survive. Only bodies are written, so no header (and no PAT)
      reaches the folder.
- [ ] **Step 4: Run** the test. Expected: PASS. Then `cargo test --locked -p ado-mcp`. Expected: PASS.
- [ ] **Step 5:** `mcp-azure.md`: how to capture (set `ADO_CAPTURE_DIR`, run the smoke checklist, review the files,
      replace the doc-shaped fixtures, keep `tests/fixtures.rs` green); `smoke.md`: the capture step.
- [ ] **Step 6: Commit** the task's files: "Add an opt-in capture of masked Azure DevOps answers."
