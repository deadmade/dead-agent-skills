# dead-agent-skills

Personal skills, flows and MCP integrations for Claude Code and Codex. The native marketplaces
(`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`) sit beside the checked-in packages they load (`.claude-plugin/<name>/` and `.agents/plugins/<name>/`);
authored plugins live under `plugins/`, grouped by install layer. The optional npx installer in `tools/installer/` sets up a machine from them. README.md is the user-facing description;
keep it, plugin READMEs and plugin/marketplace `description`s true to what the code does.

The default branch is `main`. Feature branches and PRs target `main`; releases are cut from `main`.

## Layout

- `tools/installer/`: TypeScript, by layer. `install.ts` is the entry point and only runs the flow (read state, screens, steps,
  summary); `context.ts` holds the shared paths, version and summary lines; `core/` the pure decisions by topic
  (`settings`, `plugins`, `binaries`, `options`, `release`); `system/` everything that touches the OS (file writes and
  clean-slate backup/delete, processes, downloads); `steps/` one file per thing the installer
  applies; `ui/` the screens; `assets/` the shipped configs and pins. No runtime npm dependencies: Node's standard library
  only (`typescript` and `@types/node` are devDependencies, for `npm run typecheck` and the build). New logic goes into
  `core/` or `system/` with a test next to it, not into `install.ts` or a step. Programs start through `system/proc.ts`
  (`which`, `start`/`startSync`), never by bare name: on Windows that searches the current folder first, and a `.cmd`
  shim needs cmd.exe. Node runs the `.ts` files as they are
  (type stripping; Node 26+, `engines`), so only erasable syntax: no `enum`, `namespace` or parameter properties
  (`erasableSyntaxOnly`), and imports name the `.ts` file. Node won't strip types under `node_modules`, so npx can't run them: `release.yml` packs the installer
  (`npm pack`, whose `prepack` checks native distribution freshness and runs `tsc` and writes `tools/installer/**/*.js`, gitignored) as `installer.tgz` on the release, and
  users run `npx --allow-remote=root <release>/latest/download/installer.tgz` (npm 12 refuses tarball URLs without the
  flag). npx caches by URL and keeps running the first installer it fetched (`--prefer-online` too), so each run reads
  the tag `latest/` redirects to and, when it is newer, hands over to that release's versioned URL (`newerInstaller`).
- `plugins/` is grouped by how a plugin gets installed: `default/` (the bundle, dead-skills, on every machine),
  `flows` (the conductors), both plain plugins at the top, then `shared/` (what flows pulls in) and `opt-in/` (extras
  nothing else depends on; `opt-in/mcp/` holds the MCP configs, `opt-in/implementation/` the language, database and LSP
  plugins). `shared`, `opt-in` and its two subfolders are `GROUPS` folders (`scripts/plugin-dirs.mjs`, which nests them):
  each other folder under them is a plugin and keeps its plugin's name. A plugin sits with whatever pulls it in; tui-review and web-mcp
  are also offered on their own but live in `shared/`. Moving a folder doesn't touch installs (they key on the
  plugin `name`); renaming a plugin does.
- `crates/`: the four Rust crates, `tui-review` (the tui-review plugin's binary, formerly `brv`), `web-mcp` (web-mcp's server), `ado-mcp` (mcp-azure’s server), and
  `flow-cockpit` (the flow cockpit window, a workspace of `core` and `app`). Each keeps its own
  `Cargo.lock`; nothing in the plugins reaches into them at runtime.
- `crates/ado-mcp/`: the mcp-azure server. Its library (`lib.rs`) also backs `timetrack` (`src/bin/timetrack/`), a
  personal TUI (Windows) that times work items: `ADO_ORG_URL`/`ADO_PAT` from the environment, `ado_mcp::mine` lists the
  open items assigned to me across the collection. It also clocks the workday in and out; `TIMETRACK_TARGET` (`h:mm`,
  default 8:00) is the weekday target for the overtime balance, which counts only days with a shift. The log lives in
  `%APPDATA%\timetrack` (`TIMETRACK_DIR` overrides): `log.jsonl`/`running.json` for tickets, `shifts.jsonl`/`shift.json`
  for the clock. `claude.rs` reads Claude Code's session logs (`projects/**/*.jsonl` under `CLAUDE_CONFIG_DIR` or
  `~/.claude`, an undocumented format, so unknown lines are skipped) for a lane under the timeline and Claude time per
  ticket: a branch naming a known ticket id, else the ticket timed then. Not released or installed;
  `cargo install --path crates/ado-mcp --bin timetrack`.
- `plugins/default/`: the dead-skills bundle. Its `dependencies` are the core plugins; itself it carries the global rules
  (`rules.md`, a SessionStart hook), Context7 (`.mcp.json`), Night City and the notifications. night-city, mcp-basic and notify were plugins of
  their own until 0.3.0; the installer retires them, and `mergeSettings` moves a picked theme to its new id
  (`custom:dead-skills:night-city`: a plugin theme's id carries the plugin name).
- Night City (`plugins/default/`): a theme (`themes/night-city.json`) plus a mod (`hooks/`). It is the house
  look: tui-review's `hooks/theme.ts`, notify's wording and the installer's `paint` (`ui/view.ts`) use its palette, with no
  stock fallback. Claude Code hardcodes syntax colours per base theme (Monokai for dark), so the installer always turns
  highlighting off. It also sets `CLAUDE_CODE_TMUX_TRUECOLOR=1`: inside tmux Claude
  Code otherwise draws in 256 colours and the theme's indigos turn grey.
  The ccstatusline toggle writes `tools/installer/assets/ccstatusline-night-city.json` (`ccstatusline.json`, the old stock config, is
  kept only so the installer recognises and replaces it):
  Powerline (needs a Nerd Font), and since Powerline mode draws a gradient in its first colour only, the ナイトシティ
  sign is one widget per glyph. Nothing draws above the prompt now: ponytail's band is vendored but never loads, and the flows band and
  Onibi's visits were removed in commit c2032c1, "Vendor ponytail v5 and make its band the only one
  above the prompt (#66)" (revert it to bring them back; its CLAUDE.md and README edits will conflict). Its mascot PNGs (`assets/`) are generated by `scripts/draw-mascot.mjs`; never edit them by
  hand.
- `plugins/opt-in/mcp/mcp-github/`: an MCP server config only.
- `plugins/flows/`: the conductor skills (`/build-feature`, `/research-feature`, `/implement`, `/fix`, `/upgrade`,
  `/refactor`, `/review-code`, `/understand`, `/learn`). Each runs other plugins' skills in order;
  the rules they share (state files, gates, loading `disable-model-invocation` skills by path, fallbacks per missing
  plugin) live once in `plugins/flows/steps/*.toml`, composed into each conductor at build time (ADR 0009), so a
  SKILL.md says what it runs and names its steps (`[step: <name>]`). Compose (`tools/harness-compiler/src/flows/compose.ts`)
  stops the build on a broken step and fails `check:harnesses` on built text that doesn't hold; host wording comes from
  `src/templates/hosts/<target>.ts`, and `harness-compiler lint`'s flows phrase list (`CLAUDE_ONLY`) keeps Claude-only
  names out of steps, skills and references. run-rules' **Agents** paragraph asks for few agents, combined where it
  makes sense, each on a model that fits its job (ADR 0005). The installer's only part is
  `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS=8` (`mergeSettings`); it never writes `CLAUDE_CODE_SUBAGENT_MODEL`.
  Conductors call each other by reading the callee's SKILL.md (`/fix` → `/review-code`). Each
  conductor's `uses:` frontmatter, plus its steps' and host wording's `uses`, lists what it runs;
  `scripts/flows-uses.mjs` generates flows' `dependencies` and the README tree from them, and check-repo fails when a
  listed skill is gone or the generated parts are stale. `/review-code`
  replaced `/test-audit`, `/doc-audit`, `/harden`, `/self-review` and `/verify` (their method text is in its
  `references/`); on Claude Code its correctness lens is the built-in `code-review` (the host adapter template), and
  the one agent it vendors is `flows:pr-test-analyzer`, next to tob's checker in `agents/`. `/self-review` was a plugin
  of its own until 0.5.0, so the installer keeps flows on a machine that had it.
  flows also owns the prose standard: `skills/writing/` is the one skill in it Claude may load on its own
  (`flows:writing`). `flows-uses.mjs` treats only `disable-model-invocation: true` skills as conductors, so a
  `uses:` line may list `flows:writing`. `hooks/prose-check.mjs` (logic in `prose.mjs`) is a code-only `PostToolUse`
  check on `*.md` writes for conversation shorthand, off with `FLOWS_PROSE_CHECK=off`. The writing skill also holds the copyedit
  (`references/copyedit.md`, run as `/flows:writing copyedit <file>`): a fresh agent on the strongest model edits a
  document by the skill, then `scripts/compare.mjs` replaces it only when nothing code can check was lost (the list is
  in `references/copyedit.md`). The conductors run it, by `steps/copyedit.toml`, before a gate shows a spec, plan, research report or audit report. `compare.mjs`
  imports `check` and `report` from `hooks/prose.mjs`, so a change there can break the copyedit; their tests are
  `plugins/flows/skills/writing/tests/copyedit.test.mjs` and `plugins/flows/hooks/prose.test.mjs`. `SKILL.md` and `references/` state _Style_ in
  our own words: never quote the book or reuse its examples (THIRD_PARTY.md).
- `plugins/shared/tui-review/`: a Claude Code mod (TypeScript, `hooks/`) driving the Rust binary `tui-review` (`crates/tui-review/`). The two
  share a binary cache format (`crates/tui-review/src/format.rs` ↔ `hooks/chunks.ts`) and a stdout line protocol; change both sides
  together.
- `plugins/shared/web-mcp/`: a stdio MCP server (Rust, `crates/web-mcp/`) with `search`, `fetch`, `browser` and `lookup`, built for Windows and Linux
  x64 only, like tui-review's binary (`crates-build.yml`, `BIN_TARGETS` in `core/binaries.ts`; no macOS or ARM builds); the installer downloads it and sets `binPath`. Everything it pulls lands in
  `$CLAUDE_PROJECT_DIR/.web/` before Claude sees it. Ranking is BM25 only: the H4 experiment (`examples/h4.rs`, `h4`
  feature) showed embeddings don't help, so none ship. `browser` drives `agent-browser` (upstream's Rust CLI), pinned with its
  release binaries' sha256 in `tools/installer/assets/agent-browser.json` (bumped by `npm run sync -- apply agent-browser`, which imports
  `AGENT_BROWSER_FILES` from `core/binaries.ts`). Unless a current one is on PATH, the installer keeps its own copy in
  `~/.claude/bin` (upstream's raw binary, checked against the pinned hash, downloaded when missing or older than the
  pin); either way it sets `agentBrowserPath` to the one in use (`upstreamPlan` in `core/binaries.ts`). Test-only hooks: `WEB_MCP_TEST_PUBLIC_IP`
  (debug builds or the `test-hooks` feature) treats a comma-separated list of IPs as public; `WEB_MCP_FALLBACK_MS` shortens the fetch browser fallback's deadline, `WEB_MCP_PAPERS_MS` each paper source's (8 s), `WEB_MCP_LOOKUP_MS` each lookup source's.
  `search` reads Google, Bing, DuckDuckGo and Brave (papers: Google Scholar and Semantic Scholar too) as tabs of one browser window per server (ADR 0007, `window.rs`): an owner session `web-mcp-<pid>-window` launches it on the first call that needs a browser and keeps it until exit; every engine, `browser` session and fetch fallback attaches as a tab (`--cdp <owner's cdp url> --pin-tab`, `attach.json`, idle 3600 s). Attached session names carry a generation `g<n>`, bumped when the owner reports a new cdp url (it relaunches a dead Chrome itself); a window closed by hand comes back through `tab_gone` → `tab new`. Browser first found of `WEB_MCP_CHROME`, Chrome for Testing from `agent-browser install`, `helium`, `chromium`; never branded Chrome. Under `WEB_MCP_SEARCH_DIR` (default the data dir, no temp fallback) each server holds the first free profile slot `profiles/<n>/` (its consent marks too); rests stay machine-wide. agent-browser's attach behaviour (`tab_gone`, `close` without a daemon, a dead Chrome's error) is recorded in `docs/features/web-mcp-one-window/findings.md`, the engine and daemon timings in `docs/features/web-mcp-search/findings.md`; tests drive a fake agent-browser (`tests/bin/fake_agent_browser.rs`, a `[[bin]]`, so `cargo build --bins` before the unit tests), which changes with any agent-browser answer web-mcp reads. I still don't care about cookies (downloaded on first use, not vendored; THIRD_PARTY.md) loads for every engine, Bing included. On Windows web-mcp puts itself in a kill-on-close job, so Chrome dies with it. `browser` and the fetch fallback need what search needs; the installer warns when the window can't open (no usable browser, or Linux without a display and Xvfb) and then counts web-mcp unhealthy. A blocked engine rests 30 min. No passage index: ranking is BM25 over each search's own pages. Engine parsers test against captured result pages in `crates/web-mcp/tests/fixtures/engines/`; Google's and Semantic Scholar's aren't captured yet, so their tests are `#[ignore]`d until they are.
- `plugins/flows/packs/`: the skill packs the conductors run, one folder per upstream, each written by its
  `tools/upstream-sync/src/adapters/*.ts`. They are not marketplace plugins and nothing there loads on its own (Claude Code scans only a
  plugin's root `skills/`, `agents/` and `hooks/hooks.json`); conductors read a pack's skills by path
  (`${CLAUDE_PLUGIN_ROOT}/packs`), and the installer retires old installs of them and checks none remains
  (`stillInstalled`). The folder list is the source of truth, not this file. pstack-picks leaves out pstack's
  `technical-writing` and `unslop` (flows' `writing` replaces them, and the sync rewrites the lines that named them);
  `npm run sync -- apply pstack-picks --ref <hash>` syncs one commit, given as a full 40-character hash, instead of upstream's default
  branch; its entry in `tools/upstream-sync/src/sources.ts` checks the number of vendored skills (16), so change that count
  whenever you change `SKILLS`. pstack-picks' `UPSTREAM`
  stays at `519d36a` on purpose: upstream's newer commits fail the sync's `GUARD`, so its weekly `sync.yml` job
  (no `--ref`) fails until a PR adapts the rewrites; don't hand-edit the pack to get past it. tob's spec checker ships as flows' own agent,
  `plugins/flows/agents/spec-compliance-checker.md` (vendored by the `tob` sync adapter), because a pack's agents don't load.
  Where a conductor or step changes a pack's rule, or pastes a section of one, it quotes each sentence in an
  `<!-- overrides <pack>/<path>: "..." -->` marker in flows' own `.md` and `steps/*.toml` files (the build strips
  them); `checkOverrides` (`scripts/flows-uses.mjs`, run by check-repo and by every pack
  sync before its PR) fails when the quoted sentence is gone. `docs/vendor-a-pack.md` is the checklist for a new pack.
- `plugins/flows/packs/ponytail/`, `plugins/flows/packs/superpowers/`: vendored unchanged from upstream's newest stable release
  (`npm run sync -- apply <name>`, ADR 0002): ponytail's skills and its
  SessionStart/SubagentStart/UserPromptSubmit hooks and band mod (the hooks and band don't load); superpowers' skills and SessionStart hook (its
  `run-hook.cmd` and `session-start` stay LF via `.gitattributes`). Other hosts' adapters are left out. The sync PR
  carries upstream's release notes, and the sync fails on a `plugin.json` component or default folder it doesn't know.

- `plugins/opt-in/mcp/mcp-azure/`: `.mcp.json` and settings for `ado-mcp` (Rust, `crates/ado-mcp/`), a stdio MCP server
  for one Azure DevOps Server collection and PAT: `pr_*`, `wi_*`, `pipeline_*`, `repo_list` and `project_list` (both
  in `pipeline.rs`; no default project: outside an Azure DevOps clone the model passes `project`, but `search`
  without one searches the whole collection), `search` (`search.rs`), `repo_file` (`file.rs`) and `wiki`
  (`wiki.rs`), built for Windows and Linux x64 only (`crates-build.yml`). The installer asks for its settings itself
  (`SELF_CONFIGURED` in `core/config.ts`), downloads the binary and saves both, `binPath` included, in one
  `claude plugin configure --values-stdin` call.
  - Calls go through Microsoft's `azure_devops_rust_api` (`=0.39.1`, sending `api-version=7.1-preview`) on our own
    reqwest client via `.transport()`. Its features include `search`, `wiki` and `test`, never `test_results` (its
    default host is the Services-only `vstmr`). Pins are exact (`rmcp`, `reqwest`, `azure_core` too), and `reqwest`
    must stay the one azure_core uses (`cargo tree -d -i reqwest` shows one). The crate compiles in aws-lc-rs (C
    code). Its repo was archived on 2026-10-26, so no fix comes from upstream: a model the server's answer doesn't fit is read
    from the raw body into our own struct (`api::json`; `Batch` and `RawComments` in `wi.rs`, `Props` beside the
    crate model in `pr.rs`).
  - The crate's enums are closed (D8 in `docs/features/ado-mcp/flow.md`): one value it doesn't know in a `search`,
    `wiki` or test answer fails that whole answer. Fixtures can't show it, so `docs/features/ado-mcp/smoke.md` checks
    live answers; the fix is the D1 fallback.
  - Where the crate falls short a call is sent or read by hand (`pr_list status=all`, `pr_threads`, the work-item
    batch, work-item comments, build log text, `pipeline_cancel`, `/vsts/info`, `connectionData`, `repo_file`'s items
    GET); why each is in `docs/features/ado-mcp/flow.md` (D1-D5, D7), and for `repo_file` in `file.rs` (the crate
    puts `path` into the URL twice). `pr_update` has no draft flag and `pr_complete` sends no `lastMergeSourceCommit`,
    because the crate's model carries neither.
  - The PAT goes only to `ADO_ORG_URL`: crate calls pass the `Guard` policy, hand-sent ones `Api::url`'s check
    (`api.rs`), and redirects aren't followed.
  - Writes carry `anthropic/requiresUserInteraction` through `WRITES` in `tools.rs`; a new write tool goes there.
    A new read tool needs `annotations(read_only_hint = true)` and a `READS` entry in `tests/mcp.rs`, which also catches a mistyped `WRITES` name that `tools.rs` would skip silently.
  - Tests run the binary over stdio against a fake server (`tests/common/mod.rs`) serving `tests/fixtures/`.
    `tests/fixtures.rs` maps each fixture to the crate model its route returns, so every fixture must fit that model;
    fixtures no crate model reads are listed apart, in `HAND_WRITTEN`. Fitting the model doesn't prove the server's
    shape: build fixtures from real answers or the Server docs' samples (the comments fixture carried a `url` the
    server leaves out of mentions, D7). The fixtures' ids (`p1`) aren't GUIDs, so a test that a reply prints no GUID
    needs a GUID-shaped id in its fixture, or a leak passes unseen.
    Test-only hook: `ADO_TIMEOUT_MS` (debug builds) replaces the 60 s request timeout.
- `plugins/opt-in/md-pane/`: a mod. Pure path logic in `hooks/paths.ts`; `register.tsx` redraws replies that name an existing
  `.md` file as its own `Markdown` (only a plugin-drawn `Markdown` with `onLinkPress` receives plain link clicks, and
  only in the fullscreen terminal) and shows the clicked file in a pane, refreshed by a 1 s stat while open.
- `plugins/opt-in/headroom-trim/`: trims tool results before Claude reads them. `server/` is a uv project (Python 3.13,
  `headroom-ai` pinned in `pyproject.toml` and `uv.lock`, no ML extras); `server.py` blocks every non-loopback socket
  (`guard.py`) and sets telemetry off before importing headroom, and writes everything (venv, log, headroom's workspace,
  `TIKTOKEN_CACHE_DIR`) under the plugin data dir, never `~` (only uv's own download cache and managed Python live in
  uv's folders); `PYTHONDONTWRITEBYTECODE=1` keeps `__pycache__` out of the install folder. A SessionStart launcher
  (`hooks/launcher.mjs`) finds uv (`<CONFIG>/bin`, then an absolute PATH entry; never a bare name), starts `uv run
--locked` detached with cwd = the data dir, output to `server.log`, and without the session's `UV_*`, `PYTHON*` and
  `VIRTUAL_ENV` (the installer drops them too, `trimServerEnv`), and returns within about 300 ms. `/health` reports the
  server's identity (a hash of `uv.lock`, `pyproject.toml` and `server/*.py`) and plugin version; a launcher replaces a
  server of another identity unless that server's version is newer. A PostToolUse `http` hook posts to 127.0.0.1:47811;
  that port is written only in `hooks/hooks.json` and the installer reads it from there (`hookPort`), to stop the server
  before `uv sync` and before uninstalling the plugin. Every failure leaves Claude the original output.
  The installer keeps the pinned uv (`tools/installer/assets/uv.json`, bumped by `npm run sync -- apply uv`) in `~/.claude/bin`:
  once ours exists it always wins and is upgraded when older than the pin, since the launcher looks there first; a
  current uv on PATH is used only while ours is absent (`uvPlan` in `core/binaries.ts`). It then runs `uv sync --locked`
  and fetches tiktoken's vocabulary (`steps/uv.ts`). Why uv and not a bundled Python: `docs/adr/0008-python-through-installer-uv.md`. Dependabot's `uv`
  entry keeps `uv.lock` current.
- The flow cockpit (`docs/features/flow-observability/`): a Tauri window over flow runs, audits and Claude sessions, in
  `crates/flow-cockpit/`, that can also start, resume and host real `claude` sessions in terminals of its own
  (`docs/features/cockpit-harness/`; Linux only so far, the Windows build offers neither Start nor Resume), plus the `plugins/opt-in/flow-cockpit/` plugin, which carries only the `views` skill (Claude
  writes extensions into the user's extensions folder, running the app from its `appPath` userConfig) and the capture
  hooks. The installer offers it on Linux x64 and Windows x64 (`BIN_PLUGINS` in `core/binaries.ts`): on Linux it only
  prints the flake's `nix run` command pinned to its release (`linuxHint`); on Windows it downloads
  `crates-build.yml`'s zip (`flow-cockpit.exe` plus the default extensions) whole into
  `~/.claude/bin/flow-cockpit/`, replacing an older folder whole, and sets `appPath`. The workspace: `core/` parses flow.md, plan.md, audit
  reports, build logs and transcripts into a typed model and indexes projects, runs and sessions; `app/` is the window
  (read-only commands for the views; the session-control commands in `app/src/pty.rs`, which spawn each hosted
  `claude` in its own PTY, stream its bytes untouched and stop it with SIGHUP before any SIGKILL, for the shell's own
  chrome only; a 2 s poll that also rereads `config.toml`, extension loading, `--print-types`,
  `--print-paths`). `app/shell/` holds the view runtime, the building blocks, `tokens.css` and the shell's own chrome (start form,
  terminal panes, chips, run bar, close confirmation), which alone gets the `shell` object of session controls that no
  view's `ctx` has (JavaScript with JSDoc,
  checked by `tsc --checkJs` against `api.d.ts`, which views import as the bare module `flow-cockpit`);
  `extensions/<name>/` the four default extensions (a folder of view `.ts` files and an optional `style.css`, loaded
  from disk, not compiled in), with their jsdom tests and fixtures in `extensions/tests/` and their `tsconfig.json`
  beside them; `bindings/` the generated `.d.ts` of every type the views see (one `#[ignore]`d `export_bindings` test
  per crate writes them; `bindings_are_current` fails when they are stale). Linux gets the app from the flake's
  `flow-cockpit` package, since it links the system's GTK and WebKit; it installs every `extensions/` folder but
  `tests/` at `share/flow-cockpit/extensions/` and checks that tree, and that copies of the defaults type-check against
  `--print-types`. The app finds the defaults at `$FLOW_COCKPIT_EXTENSIONS` (a dev override: point it at `crates/flow-cockpit/extensions` to see edits live), else
  `<exe dir>/../share/flow-cockpit/extensions`, else `<exe dir>/extensions`. Our code writes nothing (the webview
  engine keeps its own small folder, `~/.local/share/dev.deadmade.flow-cockpit/`, `%LOCALAPPDATA%` on Windows), and it
  reads the user's extensions and `config.toml` (`disabled`, `hidden`, `trusted`) from `~/.config/flow-cockpit/` (`%APPDATA%\flow-cockpit\` on Windows).
- Notifications (`plugins/default/`, formerly the notify plugin): `hooks.json` entries (Stop, Notification, PreToolUse
  on AskUserQuestion) running one stdlib Node script, `hooks/notify.mjs`, async. Logic and tests in `hooks/lib.mjs`; Linux
  talks D-Bus via `busctl`, Windows runs an inline PowerShell WinRT toast, focus comes from tmux. The installer always
  sets `preferredNotifChannel: "notifications_disabled"`.
- `plugins/opt-in/implementation/rust-skills/`, `plugins/opt-in/implementation/csharp-skills/`: vendored (`tools/upstream-sync/src/adapters/simple.ts`, `tools/upstream-sync/src/adapters/csharp.ts`). `paths:` frontmatter doesn't
  gate plugin skills in Claude Code (checked on 2.1.272 and 2.1.296), so csharp-skills exposes six router skills over an
  unscanned `library/`, with upstream's binlog MCP workflows cut (the server isn't vendored); the router reads library files via the installer's `Read(~/.claude/plugins/**)` rule (without
  the installer users get a permission prompt).
- `plugins/opt-in/implementation/postgres/`: a database plugin. It vendors
  Neon's and Timescale's Postgres skills from two upstreams (`tools/upstream-sync/src/adapters/simple.ts`), so each skill folder carries its
  own LICENSE, NOTICE and UPSTREAM instead of one set at the plugin root.
- `tools/upstream-sync/`: private TypeScript workspace for upstream vendoring, run directly on Node 26.
  `npm run sync -- list` lists sources; `preview <source>` shows changes from committed HEAD in an isolated
  worktree; `apply <source>` updates a clean destination and writes a structured result under the runner temp directory.
  The registry owns source checks and PR metadata; adapters export `run(context)` and have no import-time effects.
  Context supplies the checkout, Git/GitHub access, temporary directories and result collection. Tests use local
  upstreams and fake GitHub responses. Historical generated-file ownership stamps retain their original script names.
- `scripts/`: repository validation, releases, flow dependency generation and mascot artwork; upstream syncing lives
  in `tools/upstream-sync/`.
  Atlassian is Codex-only (`targets: ["codex"]` in `plugins/catalog.json`): its upstream repo ships every skill twice
  (`skills/` and `skills/v1/`), which the Claude marketplace rejects as duplicate names. Claude Code users connect Atlassian
  through the official connector. It is the only url-sourced entry, deliberately unpinned; the installer would read a
  pinned url entry's version from its `ref` (`shippedVersions`).

## Vendored content: don't edit

These are copied from upstream by `tools/upstream-sync/src/adapters/*.ts` (the weekly `sync.yml` opens the PRs) and overwritten on every
sync: `plugins/shared/agent-review/skills/`, `plugins/shared/agent-review/LICENSE` and `UPSTREAM`, `plugins/opt-in/hallmark/`, `plugins/flows/packs/` (`tob-picks` is CC BY-SA 4.0; pstack-picks' `.claude-plugin/plugin.json` is hand-written), `plugins/flows/agents/`,
`plugins/shared/graphify/skills/`, `plugins/opt-in/implementation/*-skills/{library,skills}/`, `plugins/opt-in/implementation/*-skills/LICENSE` and `UPSTREAM` (their `plugin.json` and `evals/` are hand-written), `plugins/opt-in/implementation/postgres/skills/` (their `plugin.json` is hand-written),
`plugins/flows/skills/review-code/LICENSE` and `UPSTREAM` (the self-review adapter's), and the `plugin.json` version of the ponytail and superpowers packs (set by the sync and bumped by `release.mjs`). To change them, change the sync script's transform.
`crates/flow-cockpit/app/shell/vendor/` (marked, DOMPurify, Mermaid, @tauri-apps/api, @xterm/xterm, @xterm/addon-fit) has no sync script: it is copied unchanged from
the npm tarballs THIRD_PARTY.md names, so a new version replaces the files rather than editing them.
When what's vendored or its license changes, update THIRD_PARTY.md.

## Dependency updates

Dependabot (`.github/dependabot.yml`, weekly, one grouped PR per entry) keeps GitHub Actions, the root npm packages, the `Cargo.lock` and pins of all four crates and the headroom-trim `uv.lock` current. ado-mcp's entry ignores `reqwest` and `azure_core` on purpose: they move only together with `azure_devops_rust_api` (see the ado-mcp notes above). Bumped by hand, because Dependabot can't read them: the Nix inputs (`flake.lock`), the JS vendored in `crates/flow-cockpit/app/shell/vendor/` (see above) and the `cisco-ai-skill-scanner` pin in the `scan-skills` script. The installer's `assets/*.json` pins and the vendored packs have their own weekly `sync.yml`.

## Versions and releases

Everything ships as one version: `package.json` and `package-lock.json`, the marketplace's `metadata.version`, every
plugin's `.claude-plugin/plugin.json`, every crate's `Cargo.toml`/`Cargo.lock` and the installer URL in README.md.
`check-repo.mjs` fails on drift. Never bump by hand. Every merge to `main` that touches more than `docs/` or the root
`*.md` files releases a patch on its own: `release.yml` runs `npm run release -- patch --detach`, which commits the
bump off `main` and tags it, so `main`'s `package.json` lags behind the tags and the next version counts from the
highest `vX.Y.Z` tag (`nextVersion` in `scripts/release.mjs`; fetch tags before a local release). A release you choose:

    npm run release -- minor      # on main, clean tree; bumps, runs npm test, commits and tags
    git push --follow-tags origin main

Either way the merge's run packs the installer (`installer.tgz`), builds tui-review, web-mcp and the flow cockpit's Windows app from the tag and
publishes the GitHub release npx and the installer download from, then moves the `release` branch to it (never back).
The installer points the marketplace at that branch (`RELEASE_BRANCH`, `core/release.ts`), so Claude Code's
marketplace auto-update brings plugin updates without a rerun; the binaries still come from the installer (ADR 0006). Removing a plugin from the marketplace is enough to retire it: the installer uninstalls installed
plugins of ours that the manifest no longer lists.

## Checks

- A fresh clone runs `npm ci` before committing: check-repo and the compiler, which the pre-commit hook runs, import `smol-toml`.
- `npm test`: repo checks plus the upstream-sync workspace tests and all `tools/installer/**/*.test.ts`, `scripts/*.test.mjs`, `plugins/flows/skills/{writing,build-feature}/tests/*.test.mjs`, `plugins/default/hooks/*.test.mjs`, `plugins/flows/hooks/*.test.mjs` and `plugins/opt-in/headroom-trim/hooks/*.test.mjs`
  (`claude plugin validate` is skipped when `claude` isn't on PATH). The installer tests run with a line-coverage floor
  (`--test-coverage-lines` in `package.json` and `flake.nix`; raise it, never lower it), and `tools/installer/modules.test.ts`
  loads every module so none hides from it. `system/` tests use the real OS: Windows-only cases skip elsewhere. Parsers of what other tools write test against captured output in `core/fixtures/`,
  not shapes we assume. A test for a bug not fixed yet is marked `todo`, so it shows failing without blocking.
- `npm ci` once, then `npm run typecheck`: `tsc --noEmit` over `tools/installer/` (sources and tests, strict).
- tui-review: `cargo test` and `cargo clippy --all-targets -- -D warnings` in `crates/tui-review`.
- web-mcp: `cargo test` and `cargo clippy --all-targets -- -D warnings` in `crates/web-mcp`.
- On Windows, run cargo from PowerShell, not Git Bash: Git Bash's `/usr/bin/link` shadows MSVC's `link.exe`, so
  linking fails.
- flow-cockpit: `cargo test` and `cargo clippy --workspace --all-targets -- -D warnings` in `crates/flow-cockpit` (the
  app needs the dev shell's GTK and WebKit); `nix build .#flow-cockpit` builds the package and runs the app's tests
  except the three timing ones its `checkFlags` skip. The views tests (jsdom, after `npm ci`):
  `node --test 'crates/flow-cockpit/app/shell/*.test.mjs' 'crates/flow-cockpit/extensions/tests/*.test.ts'`, then
  `npx tsc -p crates/flow-cockpit/app/shell` and `npx tsc -p crates/flow-cockpit/extensions`. They run only there and in
  `flow-cockpit.yml`, never in `npm test` or the pre-commit hook.
- ado-mcp: `cargo test` and `cargo clippy --all-targets -- -D warnings` in `crates/ado-mcp`. CI uses the latest stable
  Rust, which can carry lints the pinned `rust-version` (1.97) lacks. A test that times concurrency makes one fast call
  first and bounds the slow one against it (`view_concurrent` in `tests/pr.rs`, `tests/wi.rs`): under the full
  parallel run on Windows, process start and git subprocesses outweigh a fixed wall-clock bound.
- tui-review mod tests need a generated fixture first, from `crates/tui-review`:
  `cargo run --release -- gen --out <dir> && node ../../plugins/shared/tui-review/tests/make-fixture.mjs <dir>`, then `claude plugin test .` in
  `plugins/shared/tui-review`.
- headroom-trim server: `uv run --locked python -m unittest discover -s tests` in `plugins/opt-in/headroom-trim/server`,
  with `UV_PROJECT_ENVIRONMENT` set to a folder outside the repo (the default `.venv` lands in the tree). One test fills a
  tiktoken cache over the network.
- mod tests: `claude plugin test .` in `plugins/default` and `plugins/opt-in/md-pane`.
  `tsc -p .` there needs the engine's typings in `.claude-plugin/types/` (gitignored; the engine
  writes them when it loads the mod).
- The quote check: `npm test` (check-repo) fails when a sentence an `overrides` marker quotes is gone from its pack.
  Run it after a pack sync and fix the marker or the conductor text in the same PR.
- `nix develop` (or direnv) gives the toolchain and installs the pre-commit hooks (treefmt, merge conflicts, JSON,
  check-repo, installer and scripts tests, end-of-file; vendored paths excluded). Enter it from the repo root only:
  started in a subfolder, its hook setup treats that folder as the repo and uninstalls the pre-commit hook. The hook config is generated, so a commit touching `plugins/flows/packs/` or
  `plugins/flows/agents/` needs `nix develop` re-entered once to pick up their excludes.
  A new worktree has no `.pre-commit-config.yaml` (it is generated and untracked), so its first commit fails until
  `nix develop` runs in that worktree. treefmt's hook fails on any file it changes: run `treefmt` on the files you
  changed (never a folder: it reformats files you didn't touch), then `npm run build:harnesses`, then stage.
- `nix fmt` formats everything per `treefmt.toml` (alejandra, prettier for js/ts/json/md/yaml, rustfmt).
- `npm run scan-skills` (needs `pipx`): Cisco's skill-scanner, pinned in `package.json`, over every skill under `plugins/`;
  it fails on a high or critical finding. A finding judged benign gets a scoped suppression with its reason in
  `.github/skill-scanner.yaml`. `sync.yml` runs it before opening each sync PR.

CI: `test.yml` (npm test, the installer typecheck and the dead-skills and md-pane mod tests and the headroom-trim server tests, Linux and Windows; the skill scan, Linux) on every PR and push to main; `crates.yml` (clippy and tests,
plus tui-review's budgets, benchmarks and mod tests) for each crate a PR touches; `flow-cockpit.yml` on PRs touching the
flow cockpit's crate, plugin, the flake or the npm manifests (core tests and clippy on Linux and Windows, the app's Windows build, the
views tests and both `tsc -p` checks; on Linux `nix build .#flow-cockpit`; with `CI=true` the core's relative-worktree
test fails instead of skipping on a git older than 2.48); `crates-build.yml` (both binaries) and
`crates-build.yml` (the Windows app's release build and zip, also on PRs touching its crate) on PRs touching them and from `release.yml`; `sync.yml` weekly, one job, PR and set of issues per source registry entry (new upstream
skills, and a "Sync <name> failing" issue it closes on the next green run), and as a dry run (no PR, no issues) on PRs
touching the sync code.

The repo's rulesets live in its GitHub settings (Settings → Rules), not in the repo: main takes squash or rebase PRs
once `test.yml`'s three jobs pass (admins bypass it, which `npm run release` pushed to main needs), and only admins move
or delete a `v*` tag. Creating one stays open, since `release.yml` tags each merge with the workflow's token, but
releases only come from a push to main: `release.yml` has no tag trigger, so a tag pushed any other way publishes
nothing. Renaming a `test.yml` job or matrix entry changes its check name: update the main ruleset's required checks.

`sync.yml` opens its PRs with the workflow's own token, which starts no other workflow, so `test.yml` doesn't
run on a sync PR: each job runs check-repo and the skill scan itself, and their PRs are merged past the main ruleset's
required checks with the admin bypass.

## Multiple agents

`plugins/` is agent-neutral: no `.claude-plugin`, `.codex-plugin`, `.mcp.json`, native hook files, install instructions
or harness paths. Each plugin has a neutral `plugin.json` (description, author, dependencies, `config`, `mcpServers`,
`lsp`, `themes`, `extensions`, `hooks`) and a neutral `hooks/hooks.json` (events such as `session.started`,
`tool.completed`; tools such as `file.write`). `plugins/catalog.json` lists the plugins, their source, resources,
dependencies and targets. UI mods (TypeScript against Claude's UI engine) stay in their plugin and are declared in `plugin.json` as an
`extensions` entry; a harness that cannot run them gets a build warning and the mod is left out of its package.

`tools/harness-compiler/` is the one tool that turns these sources into `.agents/plugins/` (Codex) and
`.claude-plugin/` plus both marketplaces: `schema/` validates, `load.ts` builds the plugin list, `targets/<id>.ts`
is one emitter per harness (event and tool maps, manifest, MCP, LSP, theme, marketplace), `transforms/` rewrites shipped
Markdown per target (`rules.ts` holds the per-file edits for vendored text), `templates/` holds all harness-specific
prose, `runtime/` is the shared hook runner copied into packages. Adding a harness is one new `targets/` file.
Commands: `npm run build:harnesses` (`harness-compiler build`), `npm run check:harnesses` (`check`, no rewriting),
`harness-compiler validate` and `lint` (fails when `plugins/` carries harness-specific files or wording outside
`src/lint-allowlist.json`). Author → build → review generated changes → commit sources and outputs together.
Shared handlers must not learn native event or manifest shapes. Required unsupported hooks fail the build; optional ones
are reported and omitted. Never edit `.claude-plugin/` or `.agents/plugins/` by hand.
`tools/installer/core/agents.ts` holds host metadata for the installer; `tools/installer/steps/codex.ts` uses Codex's
native plugin and MCP commands, respecting CODEX_HOME.
Keep Claude marketplace IDs and the legacy executable alias stable. The GitHub repository still has its old name.
Flow behavior is shared; each built conductor carries its host's wording through the `{{adapter}}` and other tokens in
`tools/harness-compiler/src/templates/hosts/`.
Without subagents the main session does delegated work (searching, exploring) itself; independent checks are skipped and
recorded as not checked, never replaced by a review in the main session or claimed as passed.

Both native marketplaces must work directly from a fresh clone, without the installer or a build.
`.agents/plugins/` and `.claude-plugin/` contain generated, checked-in packages; change sources and regenerate it rather than editing
those copies. Repository checks compare the committed distribution with a fresh build. Sync PRs include the
regenerated distribution, and releases regenerate it after bumping source versions.
