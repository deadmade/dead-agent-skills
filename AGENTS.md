# dead-agent-skills

Personal skills, flows and MCP integrations for Claude Code and Codex. The native marketplaces
(`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`) sit beside the generated packages they load (`.claude-plugin/<name>/` and `.agents/plugins/<name>/`),
gitignored on `main` and committed only on the `release` branch (ADR 0010);
authored plugins live under `plugins/`, grouped by install layer. The optional npx installer in `tools/installer/` sets up a machine from them. README.md is the user-facing description;
keep it, plugin READMEs and plugin/marketplace `description`s true to what the code does.

The default branch is `main`. Feature branches and PRs target `main`; releases are cut from `main`.

## Layout

- `tools/installer/`: TypeScript, by layer. `install.ts` is the entry point and only runs the flow (read state, screens, steps,
  summary); `context.ts` holds the shared paths, version and summary lines; `core/` the pure decisions by topic
  (`settings`, `plugins`, `binaries`, `options`, `release`, `tools`: pins and what to download); `system/` everything that touches the OS (file writes and
  clean-slate backup/delete, processes, downloads); `steps/` one file per thing the installer
  applies; `ui/` the screens; `assets/` the shipped configs and `tools.json`, the manifest of every tool the installer downloads (`core/tools.ts` resolves it; bump a pin with `npm run sync -- apply uv|agent-browser`, one at a time and committed in between, as both write `tools.json`). No runtime npm dependencies: Node's standard library
  only (`typescript` and `@types/node` are devDependencies, for `npm run typecheck` and the build). New logic goes into
  `core/` or `system/` with a test next to it, not into `install.ts` or a step. `core/release.ts` reading `package.json`
  and `core/tools.ts` reading `assets/tools.json` at load time are the two exceptions, needed to make each the single owner
  of the repository slug and of the tool pins. Programs start through `system/proc.ts`
  (`which`, `start`/`startSync`), never by bare name: on Windows that searches the current folder first, and a `.cmd`
  shim needs cmd.exe. Node runs the `.ts` files as they are
  (type stripping; Node 26+, `engines`), so only erasable syntax: no `enum`, `namespace` or parameter properties
  (`erasableSyntaxOnly`), and imports name the `.ts` file. Node won't strip types under `node_modules`, so npx can't run them: `release.yml` packs the installer
  (`npm pack`, whose `prepack` builds the native distributions and runs `tsc` and writes `tools/installer/**/*.js`, gitignored) as `installer.tgz` on the release, and
  users run `npx --allow-remote=root <release>/latest/download/installer.tgz` (npm 12 refuses tarball URLs without the
  flag). npx caches by URL and keeps running the first installer it fetched (`--prefer-online` too), so each run reads
  the tag `latest/` redirects to and, when it is newer, hands over to that release's versioned URL (`newerInstaller`).
- `plugins/` is grouped by how a plugin gets installed: `default/` (the bundle, dead-skills, on every machine),
  `flows` (the conductors), both plain plugins at the top, then `shared/` (what flows pulls in) and `opt-in/` (extras
  nothing else depends on; `opt-in/mcp/` holds the MCP configs, `opt-in/implementation/` the language, database and LSP
  plugins). `shared`, `opt-in` and its two subfolders are `GROUPS` folders (`scripts/plugin-dirs.mjs`, which nests them):
  each other folder under them is a plugin and keeps its plugin's name. A plugin sits with whatever pulls it in; web-mcp
  is also offered on its own but lives in `shared/`. Moving a folder doesn't touch installs (they key on the
  plugin `name`); renaming a plugin does.
- `tools/`: two Rust packages in one root Cargo workspace: `web-mcp`
  and `ado-mcp`. The root `Cargo.toml` owns all dependency versions,
  package metadata, Clippy settings and the release profile; members inherit them and select their own features.
  There is one root `Cargo.lock` and `target/`. Use `-p <package>` to build or test one member. Nothing in the
  plugins reaches into the crates at runtime. `scripts/check_cargo_workspace.py` (Python 3.11+) rejects local
  dependency versions, nested workspaces and extra lockfiles in CI. Incompatible upstream transitive versions
  may coexist; direct dependency versions must be declared only in `[workspace.dependencies]`.
- `tools/ado-mcp/`: the mcp-azure server (`plugins/opt-in/mcp/mcp-azure/`, below).
- `plugins/default/`: the dead-skills bundle. Its `dependencies` are the core plugins; itself it carries the global rules
  (`rules.md`, a SessionStart hook), Context7 (`.mcp.json`), Night City and the notifications. night-city, mcp-basic and notify were plugins of
  their own until 0.3.0; the installer retires them, and `mergeSettings` moves a picked theme to its new id
  (`custom:dead-skills:night-city`: a plugin theme's id carries the plugin name).
- Night City (`plugins/default/`): a theme (`themes/palette.json`) plus a mod (`hooks/`). It is the house
  look: notify's wording and the installer's `paint` (`ui/view.ts`) use its palette, with no
  stock fallback. Claude Code hardcodes syntax colours per base theme (Monokai for dark), so the installer always turns
  highlighting off. It also sets `CLAUDE_CODE_TMUX_TRUECOLOR=1`: inside tmux Claude
  Code otherwise draws in 256 colours and the theme's indigos turn grey.
  The installer always sets `outputStyle: "concise"` unless the user chose a style, and `steps/output-style.ts` writes
  `tools/installer/assets/concise-output-style.md` to `~/.claude/output-styles/concise.md` (after a clean slate's delete, a
  differing file only replaced on a yes). It is part of the Claude Code setup only; the Codex step does not touch it.
  The ccstatusline toggle writes `tools/installer/assets/ccstatusline-night-city.json` (`ccstatusline.json`, the old stock config, is
  kept only so the installer recognises and replaces it):
  Powerline (needs a Nerd Font), and since Powerline mode draws a gradient in its first colour only, the ナイトシティ
  sign is one widget per glyph. Nothing draws above the prompt now: ponytail's band is vendored but never loads, and the flows band and
  Onibi's visits were removed in commit c2032c1, "Vendor ponytail v5 and make its band the only one
  above the prompt (#66)" (revert it to bring them back; its CLAUDE.md and README edits will conflict). Its mascot PNGs (`assets/`) are generated by `scripts/draw-mascot.mjs`; never edit them by
  hand.
- `plugins/opt-in/mcp/mcp-github/`: an MCP server config only.
- `plugins/flows/`: the conductor skills (`/build-feature`, `/research-feature`, `/implement`, `/fix`, `/upgrade`,
  `/refactor`, `/review-code`, `/understand`, `/learn`, `/evaluate`). Each runs other plugins' skills in order;
  the rules they share (state files, gates, loading `disable-model-invocation` skills by path, fallbacks per missing
  plugin) live once in `plugins/flows/steps/*.toml`, composed into each conductor at build time (`docs/adr/0009-conductors-composed-from-flow-steps.md`), so a
  SKILL.md says what it runs and names its steps (`[step: <name>]`). Compose (`tools/harness-compiler/src/flows/compose.ts`)
  stops the build on a broken step and fails the build (and check-repo) on built text that doesn't hold; host wording comes from
  `src/templates/hosts/<target>.ts`, and `harness-compiler lint`'s flows phrase list (`CLAUDE_ONLY`) keeps Claude-only
  names out of steps, skills and references. run-rules' **Agents** paragraph asks for few agents, combined where it
  makes sense, each on a model that fits its job (`docs/adr/0005-agent-limits-and-models.md`). The installer's only part is
  `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS=8` (`mergeSettings`); it never writes `CLAUDE_CODE_SUBAGENT_MODEL`.
  Conductors call each other by reading the callee's SKILL.md (`/fix` → `/review-code`). Each
  conductor's `uses:` frontmatter, plus its steps' and host wording's `uses`, names what it may run;
  `scripts/flows-uses.mjs` generates flows' `dependencies` and the README tree from them, and check-repo fails when a
  listed skill is gone or the generated parts are stale. `/review-code`
  replaced `/test-audit`, `/doc-audit`, `/harden`, `/self-review` and `/verify` (their method text is in its
  `references/`); on Claude Code its correctness lens is the built-in `code-review` (the host adapter template), and
  the one agent it vendors is `flows:pr-test-analyzer`, next to tob's checker in `agents/`. `/self-review` was a plugin
  of its own until 0.5.0, so the installer keeps flows on a machine that had it.
  flows also owns the prose standard: `skills/writing/` is one of the two skills in it Claude may load on its own
  (`flows:writing`; the other, `flows:diagrams`, is described below). `flows-uses.mjs` treats only
  `disable-model-invocation: true` skills as conductors, so a `uses:` line may list either. `hooks/prose-check.mjs` (logic in `prose.mjs`) is a code-only `PostToolUse`
  check on `*.md` writes for conversation shorthand, off with `FLOWS_PROSE_CHECK=off`. The writing skill also holds the copyedit
  (`references/copyedit.md`, run as `/flows:writing copyedit <file>`): a fresh agent on the strongest model edits a
  document by the skill, then `scripts/compare.mjs` replaces it only when nothing code can check was lost (the list is
  in `references/copyedit.md`). The conductors run it, by `steps/copyedit.toml`, before a gate shows a spec, plan, research report or audit report. `compare.mjs`
  imports `check` and `report` from `hooks/prose.mjs`, so a change there can break the copyedit; their tests are
  `plugins/flows/skills/writing/tests/copyedit.test.mjs` and `plugins/flows/hooks/prose.test.mjs`. `SKILL.md` and `references/` state _Style_ in
  our own words: never quote the book or reuse its examples (THIRD_PARTY.md).
  flows also holds `skills/diagrams/` (`flows:diagrams`, model-invocable like `writing`): `check.mjs` checks the `mermaid`
  and `files` blocks of a spec or plan, `render.mjs` writes it and its pictures as one HTML page, and `steps/gate.toml`
  has every gate that shows a spec or plan run both. The checker installs Mermaid and jsdom (`package.json` and
  `package-lock.json` beside `SKILL.md`) into the user's cache folder, never into the plugin; tests that need them skip
  offline. The page's script is a template literal in `render.mjs`, so each backslash in its regexes is written twice
  (`/^[\\\\/]{2}/` produces `/^[\\/]{2}/`); the tests run the produced page's `safe` and `clean` source, so check the
  output, not the template.
- `plugins/shared/web-mcp/`: a stdio MCP server (Rust, `tools/web-mcp/`) with `search`, `fetch`, `browser`, `rows` and `lookup`,
  built for Windows and Linux x64 only (`crates-build.yml`, `targets` in `assets/tools.json`; no macOS or ARM builds); the
  installer downloads it and sets `binPath`. Ranking is BM25 only: the H4 experiment (`examples/h4.rs`, `h4` feature)
  showed embeddings don't lift recall over BM25 on BEIR, so none ship. One browser window per server, every engine,
  `browser` session and fetch fallback attached to it as a tab (`docs/adr/0007-one-browser-window.md`); its daemon and tab-raising behaviour is
  recorded in `docs/features/web-mcp-one-window/findings.md`, the engine and daemon timings in
  `docs/features/web-mcp-search/findings.md`, and specific bugs in `docs/solutions/` (Google's `/goto` links, a hidden
  tab's `click`/`press`, agent-browser's install and a Windows Chrome quirk).
  `rows` opens its pages as a tab of that window too, holds a 1 s gap per host, and its group detection is tested on
  captured pages in `tests/fixtures/rows/` (`docs/adr/0012-rows-tool-and-shop-skill.md`). Its tree walk is bounded by
  a visit budget that charges text by bytes, because a hostile page can hide a huge text node under thousands of
  nested parents (`docs/solutions/rows-walk-budget-counts-bytes-not-nodes.md`).
  Contributor rules: tests drive a fake agent-browser (`tests/bin/fake_agent_browser.rs`, a `[[bin]]`;
  `cargo build --locked -p web-mcp --bin fake-agent-browser` before the unit tests), which changes with any
  agent-browser answer web-mcp reads and doesn't model every upstream quirk
  (`docs/solutions/click-and-press-reach-nothing-in-a-hidden-tab.md`). Test-only hooks (debug builds or the
  `test-hooks` feature): the fake's `$FAKE_AB_PAGES` folder serves a result page for an engine host and, for any other
  host, `<last path segment of the URL>.html`; `WEB_MCP_TEST_PUBLIC_IP` treats a comma-separated list of IPs as public; `WEB_MCP_FALLBACK_MS`,
  `WEB_MCP_PAPERS_MS` and `WEB_MCP_LOOKUP_MS` shorten the fetch fallback's, each paper source's and each lookup
  source's deadline. Env knobs: `WEB_MCP_CHROME` picks the browser binary; `WEB_MCP_SEARCH_DIR` picks where profile
  slots live (no temp fallback). `fetch` runs with `allow_private: true` (`tools.rs`, for the user's own localhost
  sites), so a conductor that follows links from untrusted pages, as /evaluate does, has only a text rule on the URL:
  a hostname resolving to a private address, or a redirect to one, gets through.
- `plugins/flows/packs/`: the skill packs the conductors run, one folder per upstream, each written by its
  `tools/upstream-sync/src/adapters/*.ts`. They are not marketplace plugins and nothing there loads on its own (Claude Code scans only a
  plugin's root `skills/`, `agents/` and `hooks/hooks.json`); conductors read a pack's skills by path
  (`${CLAUDE_PLUGIN_ROOT}/packs`), and the installer retires old installs of them and checks none remains
  (`stillInstalled`). The folder list is the source of truth, not this file. pstack-picks leaves out pstack's
  `technical-writing` and `unslop` (flows' `writing` replaces them, and the sync rewrites the lines that named them);
  `npm run sync -- apply pstack-picks --ref <hash>` syncs one commit, given as a full 40-character hash, instead of upstream's default
  branch; its entry in `tools/upstream-sync/src/sources.ts` checks the number of vendored skills (16), so change that count
  whenever you change `SKILLS`. When upstream's text gets past the rewrites, the sync's `GUARD` fails its weekly `sync.yml` job
  until a PR adapts them; don't hand-edit the pack to get past it. tob's spec checker ships as flows' own agent,
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

- `plugins/opt-in/mcp/mcp-azure/`: `.mcp.json` and settings for `ado-mcp` (Rust, `tools/ado-mcp/`), a stdio MCP server
  for one Azure DevOps Server collection and PAT: `pr_*`, `wi_*`, `pipeline_*`, `repo_list` and `project_list` (both
  in `pipeline.rs`; no default project: outside an Azure DevOps clone the model passes `project`, but `search`
  without one searches the whole collection), `search` (`search.rs`), `repo_file` (`file.rs`) and `wiki`
  (`wiki.rs`), built for Windows and Linux x64 only (`crates-build.yml`). The installer asks for its settings itself
  (`SELF_CONFIGURED` in `core/config.ts`), downloads the binary and saves both, `binPath` included, in one
  `claude plugin configure --values-stdin` call.
  - Calls go through Microsoft's `azure_devops_rust_api` (`=0.39.1`, sending `api-version=7.1-preview`) on our own
    reqwest client via `.transport()`. Its features include `search`, `wiki` and `test`, never `test_results` (its
    default host is the Services-only `vstmr`). Pins are exact (`rmcp`, `reqwest`, `azure_core` too), and `reqwest`
    must stay the one azure_core uses (`Cargo.lock` holds one `reqwest` entry). The crate compiles in aws-lc-rs (C
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
  The installer keeps the pinned uv (`tools/installer/assets/tools.json`, bumped by `npm run sync -- apply uv`) in `~/.claude/bin`:
  ours always runs and is downloaded when missing or older than the pin, since the launcher looks there first; a uv on
  PATH is ignored (`ensureTool` in `steps/tools.ts`). It then runs `uv sync --locked`
  and fetches tiktoken's vocabulary (`steps/uv.ts`). Why uv and not a bundled Python: `docs/adr/0008-python-through-installer-uv.md`. Dependabot's `uv`
  entry keeps `uv.lock` current.
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
  A failed `apply` can leave its destination half-written, which breaks the build for the next source in that checkout.
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

`treefmt.toml`'s `excludes` lists every vendored path (`docs/vendor-a-pack.md` is the checklist for adding one). These are
copied from upstream by `tools/upstream-sync/src/adapters/*.ts` and `sources.ts` (the weekly `sync.yml` opens the PRs)
and overwritten on every sync; to change one, change its sync script's transform, not the vendored files. Hand-written
exceptions a sync still skips: `plugin.json` for pstack-picks and the `*-skills` and postgres packs (and their
`evals/`). ponytail and superpowers vendor no manifest at all (a pack is a plain resource folder; the compiler never
loads one as a plugin). `tob-picks` is CC BY-SA 4.0; THIRD_PARTY.md has every pack's actual license.
When what's vendored or its license changes, update THIRD_PARTY.md.

## Dependency updates

Dependabot (`.github/dependabot.yml`, weekly, one grouped PR per entry) keeps GitHub Actions, the root npm packages, the root `Cargo.lock` (workspace dependency versions included), the headroom-trim `uv.lock` and the diagrams skill's `package-lock.json` current. The root Cargo entry ignores `reqwest` and `azure_core` on purpose: they move only together with `azure_devops_rust_api` (see the ado-mcp notes above). Bumped by hand, because Dependabot can't read them: the Nix inputs (`flake.lock`), the `cisco-ai-skill-scanner` pin in the `scan-skills` script, and the Mermaid and marked versions the diagrams page loads from a CDN (constants in `plugins/flows/skills/diagrams/scripts/render.mjs`). The installer's `assets/tools.json` pins and the vendored packs have their own weekly `sync.yml`.

## Versions and releases

Everything ships as one version: `package.json` and `package-lock.json`, the root `Cargo.toml` workspace version
and both local package entries in `Cargo.lock`. The build stamps this version into the marketplaces and generated
plugin manifests. README.md's installer command carries no version (it names `latest/`); `newerInstaller` is how a
stale cached run of it hands over to a newer release.
`check-repo.mjs` fails on drift. Never bump by hand. A merge to `main` that touches `plugins/`, `tools/` or shared
build inputs (the allowlist in `release.yml`) releases a patch on its own: `release.yml` runs `npm run release -- patch --detach`, which commits the
bump off `main` and tags it, so `main`'s `package.json` lags behind the tags and the next version counts from the
highest `vX.Y.Z` tag (`nextVersion` in `scripts/release.mjs`; fetch tags before a local release). CI, root docs,
audit notes and analysis artifacts alone do not release; Markdown inside plugins still counts as shipped content.
A release you choose:

    npm run release -- minor      # on main, clean tree; bumps, runs npm test, commits and tags
    git push --follow-tags origin main

Either way the merge's run packs the installer (`installer.tgz`), builds web-mcp and ado-mcp from the tag and
publishes the GitHub release npx and the installer download from, then moves the `release` branch to it (never back):
the tag plus one `Distribution vX.Y.Z` commit holding the native distributions that `publish` built (the job that holds
the write token runs no `npm ci`, so it gets them as the `native` artifact). Tags carry sources only.
The installer points the marketplace at that branch (`RELEASE_BRANCH`, `core/release.ts`), so Claude Code's
marketplace auto-update brings plugin updates without a rerun; the binaries still come from the installer (ADR 0006). Removing a plugin from the marketplace is enough to retire it: the installer uninstalls installed
plugins of ours that the manifest no longer lists.

## Checks

- A fresh clone runs `npm ci` before committing: check-repo and the compiler, which the pre-commit hook runs, import `smol-toml`.
- `npm test` is the one list of what runs (`package.json`'s `test` script): `scripts/check-repo.mjs`, then all
  `tools/installer/**/*.test.ts` under a line-coverage floor, then the harness-compiler's and upstream-sync's own test
  suites (each its own `npm test --workspace=...`, so a test file only one of them runs still runs), then
  `scripts/*.test.mjs`, `plugins/flows/skills/{writing,build-feature,diagrams}/tests/*.test.mjs`, `plugins/default/hooks/*.test.mjs`,
  `plugins/flows/hooks/*.test.mjs` and `plugins/opt-in/headroom-trim/hooks/*.test.mjs` (`claude plugin validate`, inside `check-repo.mjs`, is skipped when
  `claude` isn't on PATH). The installer tests run with a line-coverage floor
  (`--test-coverage-lines` in `package.json` and `flake.nix`; raise it, never lower it), and `tools/installer/modules.test.ts`
  loads every module so none hides from it. `system/` tests use the real OS: Windows-only cases skip elsewhere. Parsers of what other tools write test against captured output in `core/fixtures/`,
  not shapes we assume. A test for a bug not fixed yet is marked `todo`, so it shows failing without blocking.
- `npm ci` once, then `npm run typecheck`, also one list: `tsc --noEmit` over `tools/installer/` (sources and tests,
  strict), then the harness-compiler's and upstream-sync's own `typecheck`.
- Rust, from the root: `cargo build --locked -p web-mcp --bin fake-agent-browser`, then
  `cargo test --workspace --locked`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, and
  `cargo fmt --all -- --check`. Use `-p web-mcp` or another member instead of `--workspace`
  for independent checks. Run `python3 scripts/check_cargo_workspace.py` and
  `python3 -m unittest discover -s scripts -p 'check_cargo_workspace_test.py'` for the workspace policy.
- On Windows, run cargo from PowerShell, not Git Bash: Git Bash's `/usr/bin/link` shadows MSVC's `link.exe`, so
  linking fails.
- Don't share `CARGO_TARGET_DIR` between worktrees: a test binary keeps the `CARGO_MANIFEST_DIR` of the worktree that
  built it, and web-mcp's integration tests start whichever server binary was built last.
- ado-mcp: `cargo test --locked -p ado-mcp` from the root. CI lints with latest stable Rust and separately checks
  the workspace with its declared `rust-version` (1.97). A test that times concurrency makes one fast call
  first and bounds the slow one against it (`view_concurrent` in `tests/pr.rs`, `tests/wi.rs`): under the full
  parallel run on Windows, process start and git subprocesses outweigh a fixed wall-clock bound.
- headroom-trim server: `uv run --locked python -m unittest discover -s tests` in `plugins/opt-in/headroom-trim/server`,
  with `UV_PROJECT_ENVIRONMENT` set to a folder outside the repo (the default `.venv` lands in the tree). One test fills a
  tiktoken cache over the network.
- mod tests: `claude plugin test .` in `plugins/default` and `plugins/opt-in/md-pane`.
  `tsc -p .` there needs the engine's typings in `.claude-plugin/types/` (gitignored; the engine
  writes them when it loads the mod).
- The quote check: `npm test` (check-repo) fails when a sentence an `overrides` marker quotes is gone from its pack.
  Run it after a pack sync and fix the marker or the conductor text in the same PR. It sees only quoted sentences, so also
  read a superpowers sync's `brainstorming` diff against `build-feature`: v7.0.2 added a chat approval that would bypass its Gate 1, and no quote covered it.
- `nix develop` (or direnv) gives the toolchain and installs the pre-commit hooks (treefmt, merge conflicts, JSON,
  check-repo, installer and scripts tests, end-of-file; vendored paths excluded). Enter it from the repo root only:
  started in a subfolder, its hook setup treats that folder as the repo and uninstalls the pre-commit hook. The hook config is generated, so a commit touching `plugins/flows/packs/` or
  `plugins/flows/agents/` needs `nix develop` re-entered once to pick up their excludes.
  A new worktree has no `.pre-commit-config.yaml` (it is generated and untracked), so its first commit fails until
  `nix develop` runs in that worktree. treefmt's hook fails on any file it changes: run `treefmt` on the files you
  changed (never a folder: it reformats files you didn't touch), then `npm run build:harnesses`, then stage.
- `nix fmt` formats everything per `treefmt.toml` (alejandra, prettier for js/ts/json/md/yaml, rustfmt, taplo for TOML).
  Formatter options live in `treefmt.toml`; flow steps use `#:schema ./step.schema.json` for editor validation.
- `npm run scan-skills` (needs `pipx`): Cisco's skill-scanner, pinned in `package.json`, over every skill under `plugins/`
  and the composed flows conductors in `.claude-plugin/flows/skills/`; it fails on a high or critical finding. A
  finding judged benign gets a scoped suppression with its reason in `.github/skill-scanner.yaml`. `sync.yml` runs it before opening each sync PR.

CI: `changes.yml` uses `scripts/ci-changes.mjs` to route checks from the complete Git diff (PR merge base or push
range, including deleted and renamed paths). `test.yml` runs Node/plugin checks and skill scanning when their inputs
change; its two OS matrix jobs retain their required check names even when their steps skip. A detection failure fails
those jobs. `crates.yml` tests and lints selected Rust packages together and independently on Linux and Windows,
checks their minimum Rust version and Nix packages.
Root Cargo, Nix and npm dependencies, CI changes and unknown paths select all checks; docs/ changes select none.
Manual runs select everything. `crates-build.yml` builds only selected binaries on PRs, but release calls always build
the complete matrix because each version ships all binaries. Keep routing and its tests current when adding consumers.

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
is one emitter per harness (event and tool maps, manifest, MCP, LSP, theme, marketplace, and on Codex the
per-conductor invocation policy: `agents/openai.yaml` with `allow_implicit_invocation: false`, written from
`disable-model-invocation: true`), `transforms/` rewrites shipped Markdown per target (`rules.ts` holds the per-file edits for vendored text), `templates/` holds all harness-specific
prose, `runtime/` is the shared hook runner copied into packages. Adding a harness touches more than one file: a new
`targets/<id>.ts` emitter and a `templates/hosts/<id>.ts` for its wording, at least.
Commands: `npm run build:harnesses` (`harness-compiler build`, which exits 1 on a built-text problem after writing),
`harness-compiler validate` and `lint` (fails when `plugins/` carries harness-specific files or wording outside
`src/lint-allowlist.json`). Author → build → review generated output → commit the sources only.
Shared handlers must not learn native event or manifest shapes. Required unsupported hooks fail the build; optional ones
are reported and omitted. Never edit `.claude-plugin/` or `.agents/plugins/` by hand.
Don't `import` a JSON file in `tools/harness-compiler/src` (compose reads `steps/step.schema.json` with `readFileSync`):
the installer's catalog test compiles the compiler with `tsc --outDir`, which emits the JSON there and breaks the test.
`tools/installer/core/agents.ts` holds host metadata for the installer; `tools/installer/steps/codex.ts` uses Codex's
native plugin and MCP commands, respecting CODEX_HOME.
Keep Claude marketplace IDs and the legacy executable alias stable even though the GitHub repository has moved to a
new slug: `package.json`'s `repository` is its one owner (see Versions and releases).
Flow behavior is shared; each built conductor carries its host's wording through the `{{adapter}}` and other tokens in
`tools/harness-compiler/src/templates/hosts/`.
Without subagents the main session does delegated work (searching, exploring) itself; independent checks are skipped and
recorded as not checked, never replaced by a review in the main session or claimed as passed.

`.agents/plugins/` and `.claude-plugin/` are gitignored build output (ADR 0010): change sources and rebuild rather
than editing them. Both native marketplaces work directly from the `release` branch (`@release`, `--ref release`),
without the installer or a build; a `main` checkout has them only after a build. check-repo builds them first, so
`npm test` and the pre-commit hook always read a fresh tree; run `npm run build:harnesses` yourself before a single
test file that reads them (the installer's `core/*.test.ts`), before
`node tools/installer/install.ts`, and after checking out an older commit that still tracked them (git deletes them
on the way back). Sync PRs and release commits carry sources only.
