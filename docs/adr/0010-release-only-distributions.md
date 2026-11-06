# The native distributions are built for releases, not kept on main

`tools/harness-compiler/` generates `.claude-plugin/` (the Claude marketplace and packages) and `.agents/plugins/`
(the Codex marketplace and packages). Until now both were checked into `main`: about 1,770 files, 15 MB each.
Every source change had to carry its regenerated copy, and check-repo failed when the copy was stale. Nobody installs
`main`'s copy. `main` keeps the last version cut by hand, the installer adds the marketplace from the `release` branch,
and Codex gets the copy inside `installer.tgz`.

`main` now ignores both trees. Whatever reads them builds them first:

- check-repo, which `npm test`, the pre-commit hook and `sync.yml` run first;
- `prepack`;
- the CI jobs that test inside them.

The harness compiler loses its `check` command. `build` now exits 1 when the composed flows text has a problem, and
check-repo reports the same problems. A release builds them once, in `release.yml`'s `publish` job, through
`npm pack`'s `prepack`. The `release-branch` job then:

1. takes that build as an artifact;
2. commits it as `Distribution vX.Y.Z` on top of the tag;
3. force-pushes that commit to `release`, as it already did.

This supersedes AGENTS.md's "Both native marketplaces must work directly from a fresh clone".

## Considered options

- **Commit the trees inside the tagged release commit** (`release.mjs` force-adds them). Rejected: a release cut by
  hand is committed on `main`, so the trees would land there. Every release would also have to detach.
- **Build in the `release-branch` job.** Rejected: the compiler imports `smol-toml`, so the job would need `npm ci`,
  and that job holds the write token.

## Consequences

- A hand-added marketplace must name the branch: `/plugin marketplace add deadmade/dead-claude-skills@release`,
  `codex plugin marketplace add deadmade/dead-claude-skills --ref release`. A marketplace added without a ref follows
  `main` and finds no catalog. Rerunning the installer moves it to `release` (`pinMarketplace`).
- A pin to a `vX.Y.Z` tag gets sources only, with no packages.
- A local Codex marketplace pointed at a checkout works only after `npm run build:harnesses`. Checking out an older
  commit that still tracked the trees deletes them on the way back to `main`.
- Sync PRs and PR diffs show only source changes. Reviewing the built text means building locally.
