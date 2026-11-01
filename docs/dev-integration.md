# Dev integration

Baseline: `origin/main` at `2b703313d258d89e65b3a378897c365cb214e380`.

Local branches and live remote heads were inventoried on 2026-11-01. Deleted remote refs without a local branch are excluded. Source branches, main, the default branch and release settings were preserved. The four current edited source/documentation files were captured on `integration/current-work` (`ad8dafd`); untracked cockpit schemas/permissions and the `result` symlink were generated output and excluded.

## Branch decisions

| Branch                                                       | Source tip     | Decision                                                                                                                           |
| ------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `chore/keep-sessions`                                        | `25d4abf92178` | Contained in main.                                                                                                                 |
| `ci/pin-paper-lookup`                                        | `2f587d7d2584` | Superseded: pinned actions retained in consolidated sync.yml; old workflow removed by #89.                                         |
| `claude-md-refresh`                                          | `74a374f92f69` | Contained in main.                                                                                                                 |
| `claude/affectionate-mayer-7c8lt2`                           | `0ffdc3b35446` | Contained in main.                                                                                                                 |
| `claude/busy-wozniak-13lbs9`                                 | `dde0d582d27c` | Already incorporated: c07ea4e (#69).                                                                                               |
| `claude/compassionate-dirac-3adbnb`                          | `48469e040e78` | Contained in main.                                                                                                                 |
| `claude/compassionate-pascal-hfou7c`                         | `c26b4256d920` | Already incorporated: 4b5000e (#49), moved and reviewed md-pane.                                                                   |
| `claude/epic-tesla-gxf230`                                   | `f952184597bb` | Contained in main.                                                                                                                 |
| `claude/inspiring-archimedes-tlj9gv`                         | `55e22eb4e7d4` | Already incorporated: 88a33eb (#46); band deliberately removed by c2032c1.                                                         |
| `claude/optimistic-archimedes-umk1ie`                        | `d16ae2887c40` | Merged into dev; current architecture preserved where the source predates it.                                                      |
| `deps/update-2026-10`                                        | `a369bca7d129` | Already incorporated: 69d3e26 (#70).                                                                                               |
| `docs/short-readme`                                          | `ea098c0828da` | Contained in main.                                                                                                                 |
| `feat/flow-cockpit`                                          | `50f91d6c302d` | Merged into dev; current architecture preserved where the source predates it.                                                      |
| `feat/flows`                                                 | `4d69e762b91e` | Already incorporated: 6be96be (#48).                                                                                               |
| `feat/harness-independent-plugins`                           | `f3dab0bad064` | Contained in main.                                                                                                                 |
| `feat/language-skills`                                       | `27305103c581` | Contained in main.                                                                                                                 |
| `feat/night-city`                                            | `071650bc5062` | Contained in main.                                                                                                                 |
| `feat/onibi-visits`                                          | `4167c992020f` | Contained in main.                                                                                                                 |
| `feat/papers`                                                | `ddf69b39121b` | Contained in main.                                                                                                                 |
| `feat/postgres-skills`                                       | `8a32d2c37aac` | Contained in main.                                                                                                                 |
| `feat/research-flow`                                         | `66daa0b0bd19` | Contained in main.                                                                                                                 |
| `feat/secret-scan`                                           | `304974cc7a18` | Contained in main.                                                                                                                 |
| `feat/tob-picks`                                             | `c5f037bae113` | Contained in main.                                                                                                                 |
| `feat/turn-notifications`                                    | `27658bb3384a` | Contained in main.                                                                                                                 |
| `feat/web-mcp`                                               | `2948bf019f54` | Already incorporated: 04eec9e (#45).                                                                                               |
| `fix/agent-browser-binary`                                   | `2d70aca0d285` | Already incorporated: 51205c0 (#68).                                                                                               |
| `installer`                                                  | `9cec4a068032` | Contained in main.                                                                                                                 |
| `official-marketplace`                                       | `7f55ff2348fa` | Contained in main.                                                                                                                 |
| `origin/claude/gracious-cori-t5sx7x`                         | `41de608b6bd1` | Merged into dev; current architecture preserved where the source predates it.                                                      |
| `origin/claude/loving-goodall-syqcul`                        | `efa7182ad07b` | Merged into dev; current architecture preserved where the source predates it.                                                      |
| `origin/claude/optimistic-allen-b344jt`                      | `1c51f9dda4a5` | Superseded by #68 binary replacement/retry fixes and current sync guards; persistent passage index and cswap deliberately removed. |
| `origin/claude/pensive-hawking-sogijb`                       | `7a64c1b881dc` | Merged into dev; current architecture preserved where the source predates it.                                                      |
| `origin/claude/upbeat-knuth-5jmuhx`                          | `ec42fabc39ab` | Merged history; retained newer implemented writing specification over this obsolete draft.                                         |
| `origin/dependabot/cargo/crates/tui-review/cargo-55b89e297d` | `48db6b99a9bc` | Merged into dev; current architecture preserved where the source predates it.                                                      |
| `origin/dependabot/github_actions/actions-7313d4f700`        | `4167f3d0f0f5` | Merged into dev; current architecture preserved where the source predates it.                                                      |
| `origin/feat/flow-cockpit`                                   | `50f91d6c302d` | Duplicate tip.                                                                                                                     |
| `origin/release`                                             | `304fe7b70c80` | Excluded: generated release version bump only (0.6.6); dev retains main’s 0.6.0 baseline and creates no release.                   |
| `origin/sync/cswap`                                          | `73587265773d` | Excluded: cswap deliberately removed in #69; do not restore its pin.                                                               |
| `pr-52`                                                      | `e4b3139cb808` | Contained in agent-browser fix history (#52/#68); persistent passage index since removed.                                          |
| `pr-62`                                                      | `569a04f91369` | Patch-equivalent.                                                                                                                  |
| `pr-63`                                                      | `0f40bd95fe21` | Patch-equivalent.                                                                                                                  |
| `refactor/mcp-group`                                         | `00bad9f4faaa` | Already incorporated: a00a627 (#47).                                                                                               |
| `repo-structure`                                             | `3097f1ddcea0` | Already incorporated: 55943a4 (#50).                                                                                               |
| `review-fixes`                                               | `653495e79196` | Contained in main.                                                                                                                 |
| `skill-composition`                                          | `31f5f9cbd3d0` | Already incorporated: 9336fd9 (#72).                                                                                               |
| `worktree-web-search`                                        | `976bb8d313a8` | Already incorporated: 8281c59 (#71).                                                                                               |

## Conflict decisions

- Kept main’s one-window web search, headroom-trim, writing/copyedit behavior, version baseline, and automatic release workflow. Added cockpit and ado-mcp build jobs using the release tag. Timetrack remains a locally built tool, as documented on its source branch.
- Ported Azure DevOps settings from the obsolete JavaScript installer into TypeScript core/steps modules; secrets use stdin and hidden prompts. Preserved plugin settings during clean-slate installation.
- Combined timetrack’s shared Rust library and batch helper with ado-mcp’s newer search, wiki, repo-file tools and raw-response handling. Removed the obsolete default-project test field.
- Moved agent-review to plugins/shared, retained its bundle dependency, and registered its sync in the consolidated sync workflow. Ported conductor review changes without restoring retired standalone flow plugins.
- Kept generated cockpit assets out of the source snapshot. Original working checkout remains untouched.

## Validation

- `npm test`: passed (158 installer tests, 3 platform skips; 206 script/hook tests). Installer line coverage: 82.51%, above the unchanged 79% floor.
- `npm run typecheck`: passed. Added configuration prompt tests, saved-setting preservation coverage, and combined tool manifest checks.
- `cargo test --locked`: passed for ado-mcp (including timetrack), tui-review, web-mcp and flow-cockpit-core. Web-mcp fixture binaries were built first. Existing ignored tests remain ignored.
- Clippy with `--all-targets -- -D warnings`: passed for ado-mcp, tui-review, web-mcp and flow-cockpit-core. Fixed one timetrack assertion flagged by the current Clippy version.
- Cockpit shell/view tests and both TypeScript project checks: passed.
- `nix build .#flow-cockpit --no-link`: passed, including the desktop package’s tests and install checks. Its existing timing-test exclusions remain unchanged.
- Workflow structure/expression checks (actionlint with ShellCheck disabled), Nix syntax and `git diff --check`: passed. Full actionlint reports two informational ShellCheck notes: the imported cockpit packaging script’s fixed-name directory listing, and main’s existing installer-package assertion.
- Windows runtime checks, Azure DevOps live-server smoke tests and Claude engine mod tests were not run locally. No release or tag was created.

## Using dev

`dev` is a normal local branch and will track `origin/dev`. The temporary integration worktree is detached so it does not reserve the branch. Switch with `git switch dev` from your usual checkout. Existing uncommitted edits there remain yours; save or stash them first if Git reports they would be overwritten.
