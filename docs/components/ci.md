# CI, releases and the repository rulesets

`.github/workflows/` and the repository's GitHub settings.

CI: `changes.yml` uses `scripts/ci-changes.mjs` to route checks from the complete Git diff (PR merge base or push range,
including deleted and renamed paths). `test.yml` runs Node/plugin checks and skill scanning when their inputs change;
its two OS matrix jobs retain their required check names even when their steps skip. A detection failure fails those
jobs. `crates.yml` tests selected Rust packages together on Linux and Windows, builds each one's tests alone (so
feature unification can't hide a missing feature) without running them twice, lints them together,
checks their minimum Rust version and Nix packages. Root Cargo, Nix and npm dependencies, CI changes and unknown paths
select all checks; docs/ changes select none. Manual runs select everything. `crates-build.yml` builds only selected
binaries on PRs, but release calls always build the complete matrix because each version ships all binaries. Keep
routing and its tests current when adding consumers.

`scripts/test.mjs` is the one list of Node suites. `test.yml` runs `--strict repo node mods python real`; the pre-commit
hook (`repo-node` in `flake.nix`) and the release jobs (`release.yml`, `scripts/release.mjs`) run `repo node` only. The
`real` suite holds the slow `*.real.test.{mjs,ts}` tests (which `node` leaves out) and the installer's tests under the
84 % line-coverage floor. `--strict` also sets `DEAD_SKILLS_STRICT`, which makes a test fail, not skip, when its real tool is missing.

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
ours that the manifest no longer lists. The release notes start at the release before this one (`--notes-start-tag`,
from `gh release list`): patch tags sit off main, and without a start tag GitHub's notes started at v0.6.0, the last
tag on main, and listed everything since.
