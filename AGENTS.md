# dead-agent-skills

Personal skills, flows and MCP integrations for Claude Code and Codex. The native marketplaces
(`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`) sit beside the generated packages they load (`.claude-plugin/<name>/` and `.agents/plugins/<name>/`).
The marketplaces and packages are gitignored on `main` and committed only on the `release` branch (ADR 0010).
Authored plugins live under `plugins/`, grouped by install layer. The optional npx installer in `tools/installer/` sets up a machine from them. README.md is the user-facing description;
keep it, plugin READMEs and plugin/marketplace `description`s true to what the code does.

The default branch is `main`. Feature branches and PRs target `main`; releases are cut from `main`.

## Layout

- `plugins/` is grouped by how a plugin gets installed. Two plain plugins sit at the top: `default/` (the bundle, dead-skills, on every machine)
  and `flows` (the conductors). Below them are `shared/` (what flows or the dead-skills bundle pulls in) and `opt-in/` (extras
  nothing else depends on; `opt-in/mcp/` holds the MCP configs, `opt-in/implementation/` the language, database and LSP
  plugins). `shared`, `opt-in` and its two subfolders are `GROUPS` folders (`scripts/plugin-dirs.mjs`, which nests them):
  every other folder under them is a plugin and keeps its plugin's name. A plugin sits with whatever pulls it in; web-mcp
  is also offered on its own but lives in `shared/`. Moving a folder doesn't touch installs (they key on the
  plugin `name`); renaming a plugin does.
- `plugins/default/`: the dead-skills bundle. Its `dependencies` are the core plugins; the bundle itself carries the global rules
  (`rules.md`, a SessionStart hook), Context7 (`mcpServers` in `plugin.json`), Night City and the notifications. night-city, mcp-basic and notify were plugins of
  their own until 0.3.0; the installer retires them, and `mergeSettings` moves a picked theme to its new id
  (`custom:dead-skills:night-city`: a plugin theme's id carries the plugin name). Read `docs/components/night-city.md` before changing Night City or the notifications.
- `plugins/flows/`: the conductor skills (`/build-feature`, `/research-feature`, `/implement`, `/fix`, `/upgrade`,
  `/refactor`, `/review-code`, `/understand`, `/learn`, `/evaluate`, `/tidy`), plus `flows:diagrams`, the only
  skill in it that loads on its own. Each conductor except `/tidy` runs other plugins' skills in order; the rules the conductors share live
  once in `plugins/flows/steps/*.toml`, composed into each conductor at build time. Keep Claude-only names out of flows'
  steps, skills and references (`harness-compiler lint`). Read `docs/components/flows.md` before changing it.
- `plugins/flows/packs/`: the vendored skill packs the conductors run, read by path; nothing there loads on its own.
  Don't hand-edit a pack to get past a failing sync. Where a conductor or step changes a pack's rule, it quotes the
  sentence in an `overrides` marker, and check-repo fails when the sentence is gone. Read `docs/components/packs.md`
  before changing or syncing a pack.
- `plugins/shared/web-mcp/` (Rust, `tools/web/web-mcp/`): a stdio MCP server with `search`, `fetch`, `browser`, `rows` and
  `lookup`, built for Windows and Linux x64 only. Read `docs/components/web-mcp.md` before changing it.
- `plugins/opt-in/mcp/mcp-azure/` (Rust, `tools/ado-mcp/`): a stdio MCP server for one Azure DevOps Server collection and
  PAT. A new write tool goes in `WRITES` in `tools.rs`; a new read tool needs `read_only_hint` and a `READS` entry in
  `tests/mcp.rs`. Read `docs/components/mcp-azure.md` before changing it.
- `plugins/opt-in/mcp/http-runner/` (Rust, `tools/http-runner/`): a stdio MCP server with two fixed tools that runs VS Code
  REST Client `.http` files and returns real replies with their secrets masked. Read `docs/components/http-runner.md`
  before changing it.
- `plugins/opt-in/mcp/mcp-github/`: an MCP server config only.
- `plugins/shared/graphify/`: vendored knowledge-graph skill and `tool.starting` hooks that nudge towards `graphify-out/`, on both
  harnesses. flows pulls it in (on Codex flows also embeds its skills); the installer's Tools page offers it and runs
  `uv tool install` for its CLI.
- `plugins/shared/agent-review/`: vendored skill that checks agent work at three levels, Claude Code only. The dead-skills
  bundle pulls it in.
- `plugins/opt-in/hallmark/`: vendored frontend-design skill, on both harnesses. Nothing pulls it in.
- `plugins/opt-in/shop/`: a text-only skill for buying decisions and price checks on Kleinanzeigen and Geizhals through
  web-mcp's `rows`, on both harnesses. Picking it brings web-mcp.
- `plugins/opt-in/implementation/nix-lsp/`: an LSP config for `nixd` on `.nix` files, Claude Code only; the installer doesn't
  offer it on Windows.
- Atlassian (a `plugins/catalog.json` entry with no folder) is Codex-only (`targets: ["codex"]`): its upstream repo ships most
  skills twice (`skills/` and `skills/v1/`), which the Claude marketplace rejects as duplicate names. Claude Code users
  connect Atlassian through the official connector. It is the only url-sourced entry, deliberately unpinned. Because it is
  Codex-only, it never reaches `shippedVersions`, which reads a pinned url entry's version from its `ref` for the Claude
  marketplace only.
- `plugins/opt-in/headroom-trim/`: trims tool results before Claude reads them, through a uv-run Python server on
  loopback. Every failure leaves Claude the original output. Read `docs/components/headroom-trim.md` before changing it.
- `plugins/opt-in/implementation/`: the vendored language and database plugins (rust-skills, csharp-skills, postgres).
  Their notes are in `docs/components/packs.md`.
- `tools/`: the installer, the harness compiler, upstream-sync and four Rust packages in one root Cargo workspace:
  `web-mcp`, `ado-mcp`, `http-runner` and `browser-core`. The root `Cargo.toml` owns all dependency versions,
  package metadata, Clippy settings and the release profile; members inherit them and select their own features.
  There is one root `Cargo.lock` and `target/`. Use `-p <package>` to build or test one member. Nothing in the
  plugins reaches into the crates at runtime. `scripts/cargo-workspace.mjs` (run by check-repo) rejects local
  dependency versions, nested workspaces and extra lockfiles in CI. Incompatible upstream transitive versions
  may coexist; direct dependency versions must be declared only in `[workspace.dependencies]`.
- `tools/web/browser-core/` (Rust library): the agent-browser driver, the one browser window and the search folder's profile slots, split out of
  `web-mcp`, its only consumer. It names no search or fetch code. Read `docs/components/browser-core.md` before changing it.
- `tools/installer/`: the optional TypeScript installer. `install.ts` only runs the flow; new logic goes into `core/` (pure
  decisions) or `system/` (OS access) with a test next to it. No runtime npm dependencies. Node runs the `.ts` files as
  they are, so code uses only erasable syntax and imports name the `.ts` file. Programs start through `system/proc.ts`, never by
  bare name. Read `docs/components/installer.md` before changing it.
- `tools/upstream-sync/`: private TypeScript workspace for upstream vendoring, run with `npm run sync -- list`, `preview <source>`
  or `apply <source>`. Read `docs/components/packs.md` before changing it.
- `scripts/`: repository validation, releases, flow dependency generation and mascot artwork; upstream syncing lives
  in `tools/upstream-sync/`.

## Vendored content: don't edit

`treefmt.toml`'s `excludes` lists every vendored path (`docs/vendor-a-pack.md` is the checklist for adding one).
`tools/upstream-sync/src/adapters/*.ts` and `sources.ts` copy these paths from upstream (the weekly `sync.yml` opens the PRs),
and every sync overwrites them. To change one, change its sync script's transform, not the vendored files. A sync skips
these hand-written exceptions: `plugin.json` for csharp-skills, rust-skills, postgres, hallmark, graphify and agent-review, and the
`*-skills` plugins' `evals/`. ponytail and superpowers vendor no manifest at all (a pack is a plain resource folder; the compiler never
loads one as a plugin). `tob-picks` is CC BY-SA 4.0; THIRD_PARTY.md has every pack's actual license.
When what's vendored or its license changes, update THIRD_PARTY.md.

## Dependency updates

Dependabot (`.github/dependabot.yml`, weekly, one grouped PR per entry) keeps GitHub Actions, the root npm packages, the root `Cargo.lock` (workspace dependency versions included), the headroom-trim `uv.lock` and the diagrams skill's `package-lock.json` current. The root Cargo entry ignores `reqwest` and `azure_core` on purpose: they move only together with `azure_devops_rust_api` (see `docs/components/mcp-azure.md`). These are bumped by hand, because Dependabot can't read them: the Nix inputs (`flake.lock`), the `cisco-ai-skill-scanner` pin in the `scan-skills` script, and the Mermaid and marked versions the diagrams page loads from a CDN (constants in `plugins/flows/skills/diagrams/scripts/render.mjs`). The installer's `assets/tools.json` pins and the vendored packs have their own weekly `sync.yml`.

## Versions and releases

Everything ships as one version, recorded in `package.json` and `package-lock.json`, the root `Cargo.toml` workspace version
and all four local package entries in `Cargo.lock`. The build stamps this version into the marketplaces and generated
plugin manifests. README.md's installer command carries no version (it names `latest/`); `newerInstaller` is how a
stale cached run of it hands over to a newer release.
`check-repo.mjs` fails on drift. Never bump by hand.

A merge to `main` that touches `plugins/`, `tools/` or shared
build inputs (the allowlist in `release.yml`) releases a patch on its own: `release.yml` runs `npm run release -- patch --detach`, which commits the
bump off `main` and tags it. `main`'s `package.json` therefore lags behind the tags, and the next version counts from the
highest `vX.Y.Z` tag (`nextVersion` in `scripts/release.mjs`; fetch tags before a local release). Changes to CI, root docs,
audit notes and analysis artifacts alone do not release; Markdown inside plugins still counts as shipped content.

For a release you choose:

    npm run release -- minor      # on main, clean tree; bumps, runs npm test, commits and tags
    git push --follow-tags origin main

Read `docs/components/ci.md` for how a release is built and published.

## Checks

- In a fresh clone, run `npm ci` before committing, because check-repo and the compiler, which the pre-commit hook runs, import `smol-toml`.
- `npm test` is the one list of what runs (`package.json`'s `test` script; `claude plugin validate`, inside
  `check-repo.mjs`, is skipped when `claude` isn't on PATH). The installer tests run with a line-coverage floor
  (`--test-coverage-lines` in that script; raise it, never lower it), and `tools/installer/modules.test.ts`
  loads every module so none hides from it. `system/` tests use the real OS: Windows-only cases skip elsewhere. Parsers of what other tools write test against captured output in `core/fixtures/`,
  not shapes we assume. A test for a bug not fixed yet is marked `todo`, so it shows failing without blocking.
- Run `npm ci` once, then `npm run typecheck`, which is also one list: `tsc --noEmit` over `tools/installer/` (sources and tests,
  strict), then the harness-compiler's and upstream-sync's own `typecheck`.
- Rust, from the root: `cargo build --locked -p web-mcp --bin fake-agent-browser`, then
  `cargo test --workspace --locked`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, and
  `cargo fmt --all -- --check`. Use `-p web-mcp` or another member instead of `--workspace`
  for independent checks. The workspace policy is `scripts/cargo-workspace.mjs`, tested by `scripts/cargo-workspace.test.mjs`.
  CI lints with latest stable Rust and separately checks the selected packages with the workspace's declared `rust-version` (1.97).
- On Windows, run cargo from PowerShell, not Git Bash: Git Bash's `/usr/bin/link` shadows MSVC's `link.exe`, so
  linking fails.
- Don't share `CARGO_TARGET_DIR` between worktrees: a test binary keeps the `CARGO_MANIFEST_DIR` of the worktree that
  built it, and web-mcp's integration tests start whichever server binary was built last.
- mod tests: after a build, copy `plugins/default/hooks/*.test.*` into `.claude-plugin/dead-skills/hooks/` and run `claude plugin test .`
  there, as `test.yml` does (in `plugins/default` it fails: it holds a neutral manifest). CI doesn't run `tsc -p .` in `plugins/default`. It needs the engine's typings in
  `.claude-plugin/types/` (gitignored), which `claude plugin test` doesn't write.
- `nix develop` (or direnv) gives the toolchain and installs the pre-commit hooks (treefmt, merge conflicts, JSON,
  check-repo, installer and scripts tests, end-of-file; vendored paths excluded). Enter it only from the repo root:
  if it starts in a subfolder, its hook setup treats that folder as the repo and uninstalls the pre-commit hook. The hook config is generated, so a commit touching `plugins/flows/packs/` or
  `plugins/flows/agents/` needs `nix develop` re-entered once to pick up their excludes.
  A new worktree has no `.pre-commit-config.yaml` (it is generated and untracked), so its first commit fails until
  `nix develop` runs in that worktree. treefmt's hook fails on any file it changes: run `treefmt` on the files you
  changed (never a folder: it reformats files you didn't touch), then `npm run build:harnesses`, then stage.
- `nix fmt` formats everything per `treefmt.toml` (alejandra, prettier for js/ts/json/md/yaml, rustfmt, taplo for TOML).
  Formatter options live in `treefmt.toml`; flow steps use `#:schema ./step.schema.json` for editor validation.
- `npm run scan-skills` (needs `pipx`) runs Cisco's skill-scanner, pinned in `package.json`, over every skill under `plugins/`
  and the composed flows conductors in `.claude-plugin/flows/skills/`; it fails on a high or critical finding. A
  finding judged benign gets a scoped suppression with its reason in `.github/skill-scanner.yaml`. `sync.yml` runs it before opening each sync PR except the `uv` and `agent-browser` pin bumps (`scan: false` in `sources.ts`).
- Component checks: the ado-mcp and headroom-trim server tests are in their `docs/components/` pages.

Read `docs/components/ci.md` before changing a workflow, renaming a `test.yml` job or relying on what CI runs.

## Multiple agents

`plugins/` is agent-neutral: no `.claude-plugin`, `.codex-plugin`, `.mcp.json`, native hook files, install instructions
or harness paths. Each local plugin has a neutral `plugin.json` (description, author, dependencies, `config`, `mcpServers`,
`lsp`, `themes`, `extensions`, `instructions`, `embeds`, `hooks`) and, if it has hooks, a neutral `hooks/hooks.json` (events such as `session.started`,
`tool.completed`; tools such as `file.write`). `plugins/catalog.json` lists the plugins, their source, resources,
dependencies and targets. UI mods (TypeScript against Claude's UI engine) stay in their plugin and are declared in `plugin.json` as an
`extensions` entry; a harness that cannot run them gets a build warning and the mod is left out of its package.

`tools/harness-compiler/` is the one tool that turns these sources into `.agents/plugins/` (Codex) and `.claude-plugin/` plus both marketplaces. Read `docs/components/harness-compiler.md` before changing it or adding a harness.
Commands: `npm run build:harnesses` (`harness-compiler build`, which exits 1 on a built-text problem after writing),
`harness-compiler validate` and `lint` (fails when `plugins/` carries harness-specific files or wording outside
`src/lint-allowlist.json`). Author, build, review the generated output, then commit only the sources.
Shared handlers must not learn native event or manifest shapes. Required unsupported hooks fail the build; optional ones
are reported and omitted. Never edit `.claude-plugin/` or `.agents/plugins/` by hand.
Keep Claude marketplace IDs and the legacy executable alias stable even though the GitHub repository has moved to a
new slug: `package.json`'s `repository` owns the slug for the installer and the build; `LOOKUP_UA` in
`tools/web/web-mcp/src/api.rs` and README.md repeat it by hand.
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

## Docs

- `docs/components/`: how one part works and what changing it can break.
- `docs/adr/`: decisions hard to reverse or surprising without context. A new one takes the next free number.
- `docs/solutions/`: solved problems someone may hit again.
- `docs/features/<slug>/`: a conductor run's working files. Once a run is finished and nothing links to its folder, move
  what lasts to one of the folders above and delete the folder; git keeps the history.
- `docs/audits/`: `/review-code` reports.
- `docs/vendor-a-pack.md`: the checklist for adding a vendored pack.
