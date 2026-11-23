# The installer

`tools/installer/`.

`tools/installer/`: TypeScript, by layer. `install.ts` is the entry point and only runs the flow (read state, screens,
steps, summary); `context.ts` holds the shared paths, version and summary lines; `core/` the pure decisions by topic
(`settings`, `plugins`, `binaries`, `options`, `config`, `catalog`, `agents`, `codex`, `rules-migration`, `release`,
`tools`: pins and what to download); `system/` everything that touches the OS (file writes and clean-slate
backup/delete, processes, downloads); `steps/` one file per thing the installer applies; `ui/` the screens; `assets/`
the shipped configs and `tools.json`, the manifest of every tool the installer downloads itself (dcg comes from its own
upstream install script, `dcgCommand` in `core/options.ts`; `core/tools.ts` resolves the manifest; bump a pin with
`npm run sync -- apply uv|agent-browser`, one at a time and committed in between, as both write `tools.json`).

No runtime npm dependencies: Node's standard library only (`typescript` and `@types/node` are devDependencies, for
`npm run typecheck` and the build). New logic goes into `core/` or `system/` with a test next to it, not into
`install.ts` or a step. `core/release.ts` reading `package.json` and `core/tools.ts` reading `assets/tools.json` at load
time are the two exceptions, needed to make each the single owner of the repository slug and of the tool pins.

The uv step (`steps/uv.ts`) also installs serena: `uv tool install --upgrade -p 3.13 serena-agent` with the
installer's own uv, then `uv tool dir --bin` gives the command's path, which becomes serena's `serenaPath` on Claude Code
(`claude plugin configure --values-stdin`) and the `codex mcp add dead-agent-skills-serena` command on Codex, where
`startup_timeout_sec = 15` goes into that server's `config.toml` table (`mcpTableLine` in `core/codex.ts`). A failed
install leaves the path unset and adds no Codex server. The run that retires graphify (Claude Code: `retiredPlugins`;
Codex: `RETIRED` in `core/codex.ts`) uninstalls `graphifyy` with a uv copy already present, never one downloaded just
for that (`uninstallGraphify`); ADR 0016.

Programs start through `system/proc.ts` (`which`, `start`/`startSync`), never by bare name: on Windows that searches the
current folder first, and a `.cmd` shim needs cmd.exe. The one exception is `system/net.ts`'s `tar` (System32's on
Windows, elsewhere `which` with a bare `tar` as the fallback).

Node runs the `.ts` files as they are (type stripping; Node 26+, `engines`), so only erasable syntax: no `enum`,
`namespace` or parameter properties (`erasableSyntaxOnly`), and imports name the `.ts` file.

Node won't strip types under `node_modules`, so npx can't run them: `release.yml` packs the installer (`npm pack`, whose
`prepack` builds the native distributions and runs `tsc` and writes `tools/installer/**/*.js`, gitignored) as
`installer.tgz` on the release, and users run `npx --allow-remote=root <release>/latest/download/installer.tgz` (npm 12
refuses tarball URLs without the flag). npx caches by URL and keeps running the first installer it fetched
(`--prefer-online` too), so each run reads the tag `latest/` redirects to and, when it is newer, hands over to that
release's versioned URL (`newerInstaller`).
