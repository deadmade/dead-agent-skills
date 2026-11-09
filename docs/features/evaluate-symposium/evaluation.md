# Symposium: try

It would fill a real gap in crate-matched guidance, but only a sync in this workspace can show whether its plugin sources cover these crates.

- Date: 2026-11-09
- Read: https://github.com/symposium-dev/symposium (release `symposium-v0.5.1`)

## Assumed purpose

Give agents working on `web-mcp` and `ado-mcp` guidance matched to the crates those two servers depend on.

## What it is

`cargo agents`, a Rust CLI that matches plugins to a workspace's dependency graph and installs skills, hooks and MCP entries into seven agents. Crate authors ship the extensions through plugin sources, and a reviewed central repository covers crates that don't.

## Fit here

- Has: `rust-best-practices`, named when a `Cargo.toml` exists (`plugins/flows/references/stack-packs.md:9`; verified), and context7 for library docs (`plugins/default/plugin.json`; verified).
- Gap: nothing outside vendored packs reads the dependency graph (measured by search for `cargo metadata`), and no skill targets a direct dependency such as `rmcp`, `reqwest` or `tantivy` (inferred, from the grounding).
- Where it goes: a per-user install, not a plugin here. Its project hook scope touches one workspace only (verified, README).
- Unknown: whether its sources carry skills for these crates.

## Evidence

- Licence: MIT OR Apache-2.0 ([README](https://github.com/symposium-dev/symposium#community)).
- Latest release: `symposium-v0.5.1`, 2026-10-01 ([API](https://api.github.com/repos/symposium-dev/symposium/releases/latest)).
- Activity: pushed 2026-11-09 ([API](https://api.github.com/repos/symposium-dev/symposium)). Failed: "134 open issues" (99 issues and 35 pull requests).
- Needs to run: `cargo` on `PATH`, one supported agent ([README](https://github.com/symposium-dev/symposium#requirements)).
- Security: 0 published advisories ([API](https://api.github.com/repos/symposium-dev/symposium/security-advisories)). A staging path collision deleted a user directory in a regression test ([#391](https://github.com/symposium-dev/symposium/pull/391)).

Source check: 23 confirmed, 2 not supported, 0 couldn't open.

## Alternatives

- Vercel `skills` `experimental_sync`: the same idea for `package.json`, still an RFC.
- Ruler, rulesync: one source, generated per-agent files, as this repository's compiler does.
- Microsoft APM: a manifest and lockfile package manager.

## Next step

In a throwaway clone, run `cargo agents init` with project hook scope, then `cargo agents sync`. Adopt if it installs at least one skill for a direct dependency that context7 doesn't already answer, and leaves the existing Claude Code plugins alone.

## Skipped

None.

Not checked: installing and running the tool; what its plugin sources hold; its hooks alongside this repository's. The tool was not tried.
