# GitHub release notes keep getting longer: every release lists all PRs since v0.6.0

- **Seen:** 2026-11-24, GitHub releases v0.6.1 to v0.6.61: each body ended `**Full Changelog**: …/compare/v0.6.0...v0.6.6x`
  and grew with every release (11,647 characters at v0.6.54, 12,680 at v0.6.61).
- **Cause:** `release.yml`'s publish ran `gh release create --generate-notes` without a start tag. Patch tags are cut on
  detached commits off main (`npm run release -- patch --detach`), so no patch tag is an ancestor of the next one, and
  GitHub's notes started at v0.6.0, the last release tagged on main (`git merge-base --is-ancestor`: v0.6.0 is an
  ancestor of v0.6.61, v0.6.60 isn't). GitHub doesn't document how it picks the start; this is what it did.
- **Fix:** publish passes `--notes-start-tag`, the release before this one from `gh release list` (releases, not tags,
  so a tag a failed run left without a release keeps its PRs in the next notes). Fix-flow
  `docs/features/release-notes-keep-growing/`.
- **Spot it next time:** a release body's "Full Changelog" compare should name the previous release; the compare API
  (`/compare/<a>...<b>`, `total_commits`) shows the range a body covers.
