# Installer: one tool manifest

Draft 2026-11-09, grilled round 1. Choices I made without you are marked **my call**.

## Problem

The installer provisions tools from several ecosystems, and each ecosystem has its own shape in code. To add or bump a
tool, you have to know which shape it has:

- Our Rust binaries (web-mcp, ado-mcp): `BIN_PLUGINS`, `BIN_TARGETS` and `binAsset` in
  `tools/installer/core/binaries.ts`; the hash comes from a `.sha256` file beside the release asset.
- uv and agent-browser: two near-identical pin files (`assets/uv.json`, `assets/agent-browser.json`), two file tables
  (`UV_FILES`, `AGENT_BROWSER_FILES`), two asset functions (`uvAsset`, `agentBrowserAsset`), and two upstream-sync
  adapters that import those tables from the installer (`tools/upstream-sync/src/adapters/pins.ts`).
- graphify: a hard-coded `uv tool install --upgrade` with no pin (`steps/uv.ts`).
- Three different "which copy runs" rules: `binAction`, `upstreamPlan` and `uvPlan`. The user installs these tools only
  through the installer, so the differences between the rules protect no one.

The installer already has one routine that downloads and verifies a file: `downloadBin` (`system/net.ts`). What the
tools don't share is how each one is described and how the installer decides what to do with it.

## Goal

One manifest, `tools/installer/assets/tools.json`, describes every tool the installer provisions, and one engine reads
it. Steps and plugins ask for a tool by name and get back a path.

## Approaches (picked: A)

- **A, one manifest and one engine** (picked). It adds no new dependency and can ship in slices.
- **B, mise as the bundler.** Rejected, for three reasons: mise.lock covers tools, not app dependencies, so headroom
  still needs `uv sync`; on NixOS, mise compiles tools from source by default until 2027.8.0; and plugins' `binPath`
  would move.
- **C, merge only the uv and agent-browser pins.** The smallest version, and A's first slice.
- **D, pixi as the bundler.** Rejected for now: it is a full migration that needs a packaging pipeline for our
  binaries, and it fixes CI and dev setup more than it fixes the installer. It stays possible later.

Prior art: [prior-art.md](prior-art.md).

## Seam

- `core/tools.ts` resolves each tool's source (kind, version, per-platform file, sha256, which copy runs) from
  `assets/tools.json`. The steps for web-mcp, mcp-azure, headroom-trim and graphify never see it, and neither do
  plugins.

## Design

**Manifest.** The manifest is JSON (**my call**), because the sync adapters already edit JSON and `readJson` exists. It
has one entry per tool; the field names below are a sketch:

```json
{
  "targets": { "win32-x64": "x86_64-pc-windows-msvc", "linux-x64": "x86_64-unknown-linux-musl" },
  "tools": {
    "uv": {
      "source": "github", "repo": "astral-sh/uv", "tagPrefix": "", "version": "0.13.6",
      "files": { "linux-x64": { "file": "uv-x86_64-unknown-linux-musl.tar.gz", "inner": "…/uv", "sha256": "…" } }
    },
    "agent-browser": { "source": "github", "repo": "vercel-labs/agent-browser", "tagPrefix": "v", "raw": true, "…": "…" },
    "web-mcp": { "source": "release", "plugin": "web-mcp", "key": "binPath" },
    "graphify": { "source": "pypi", "package": "graphifyy", "extras": "sql,pdf,office,watch,leiden" }
  }
}
```

- `source: "release"`: our own build for the installer's version. Its hash can't be committed, because it doesn't
  exist until CI has built the tag, so the hash comes from the `.sha256` file beside the asset.
- `source: "github"`: upstream's release, with its version and sha256 pinned in the entry.
- `source: "pypi"`: `uv tool install --upgrade`, unpinned as today (decided). headroom-trim's `uv sync --locked` is not
  an entry; it keeps reading its own `uv.lock`.
- **One rule for which copy runs** (decided; ADR 0012): the installer runs our copy in `~/.claude/bin`. It downloads
  that copy when it is missing or older than the pin (for `release`, the pin is the installer's version), keeps it when
  it is equal or newer, and ignores a copy on PATH. As today, it prompts before a download only for `github` entries,
  which are third-party binaries (**my call**).

**Engine.** `core/tools.ts` is pure: `resolveTool(name, platform, arch, version)` returns the asset or `undefined` where
there is none, and `planTool(...)` returns keep, download or unsupported. `steps/tools.ts` asks, downloads through
`downloadBin` and returns the path. `steps/binaries.ts`, `steps/agent-browser.ts` and `steps/uv.ts` shrink to what is
specific to their plugin (userConfig keys, the browser install, `uv sync`, the tiktoken fetch).

**Sync.** Sync stays one PR per tool (decided), with the two literal sources in `sources.ts` (`uv`, `agent-browser`)
kept. The `pins` adapter reads the file names and tag prefix from the manifest instead of importing tables from the
installer, and writes the bumped version and hashes back into the manifest. `pypi` and `release` entries are not synced.

## Out of scope

- Rewriting Python or JS in Rust, moving to pixi or mise, and any change to CI builds, the flake or Dependabot.
- dcg's own installer script, and the printed `npm i -g …` hints for LSPs and ccstatusline (`BINARIES`).
- headroom-trim's launcher, server and `uv sync`.
- Any other change a user can see. The paths (`~/.claude/bin`) and the userConfig keys stay. The accepted changes (plan
  review): one summary-line format, a declined download is a failure line for every tool, the agent-browser sudo prompt
  comes after the download, and one wording for the download prompt.

## Settled in the grill

1. graphify stays unpinned; its entry names only the package and extras.
2. Sync stays one PR per tool, with the two literal sources kept (plan review: generating them pays off only with a
   third tool).
3. The three copy rules become one (ADR 0012). Two consequences still need confirming at Gate 1. The installer no
   longer uses a copy on PATH, such as a NixOS user's own packaged build. And it points `binPath` and
   `agentBrowserPath` at its own copy on every run, so it replaces a binary you built and set by hand with
   `/plugin configure`.
4. Plan review: the manifest holds no arrays (lists are comma-separated strings), github tools store a `tagPrefix` and
   derive their url and tag pattern, and one shared `targets` map replaces a map per release tool. The Codex step keeps
   its PATH-first lookup (ADR 0012). The two sync sources stay literal.

## Risks

- The installer's coverage floor (`--test-coverage-lines`) may be raised but never lowered, and deleting tested code
  can move the ratio.
- `binaries.test.ts` has 64 references to the functions being replaced; those tests move, they are not deleted.
- AGENTS.md (8 mentions), ADR 0008, THIRD_PARTY.md and the web-mcp and mcp-azure READMEs name the old files.
