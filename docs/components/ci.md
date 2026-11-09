# CI, releases and the repository rulesets

`.github/workflows/` and the repository's GitHub settings.

CI: `changes.yml` uses `scripts/ci-changes.mjs` to route checks from the complete Git diff (PR merge base or push range,
including deleted and renamed paths). `test.yml` runs Node/plugin checks and skill scanning when their inputs change;
its two OS matrix jobs retain their required check names even when their steps skip. A detection failure fails those
jobs. `crates.yml` tests selected Rust packages together and independently on Linux and Windows, lints them together,
checks their minimum Rust version and Nix packages. Root Cargo, Nix and npm dependencies, CI changes and unknown paths
select all checks; docs/ changes select none. Manual runs select everything. `crates-build.yml` builds only selected
binaries on PRs, but release calls always build the complete matrix because each version ships all binaries. Keep
routing and its tests current when adding consumers.

The repo's rulesets live in its GitHub settings (Settings → Rules), not in the repo: main takes squash or rebase PRs
once `test.yml`'s three jobs pass (admins bypass it, which `npm run release` pushed to main needs), and only admins move
or delete a `v*` tag. Creating one stays open, since `release.yml` tags each merge with the workflow's token, but
releases only come from a push to main: `release.yml` has no tag trigger, so a tag pushed any other way publishes
nothing. Renaming a `test.yml` job or matrix entry changes its check name: update the main ruleset's required checks.

`sync.yml` opens its PRs with the workflow's own token, which starts no other workflow, so `test.yml` doesn't run on a
sync PR: each job runs check-repo and, except for the two pin bumps, the skill scan itself, and their PRs are merged
past the main ruleset's required checks with the admin bypass.

## How a release is built

Whichever way a release starts, the merge's run packs the installer (`installer.tgz`), builds web-mcp, ado-mcp and http-runner from the tag
and publishes the GitHub release npx and the installer download from, then moves the `release` branch to it (never
back): the tag plus one `Distribution vX.Y.Z` commit holding the native distributions that `publish` built
(`release-branch`, whose checkout keeps the write token, runs no `npm ci`, so it gets them as the `native` artifact).
Tags carry sources only. The installer points the marketplace at that branch (`RELEASE_BRANCH`, `core/release.ts`), so
Claude Code's marketplace auto-update brings plugin updates without a rerun; the binaries still come from the installer
(ADR 0006). Removing a plugin from the marketplace is enough to retire it: the installer uninstalls installed plugins of
ours that the manifest no longer lists.
