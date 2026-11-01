# Upstream sync

Private TypeScript workspace for upstream vendoring, using Node 26 and its built-in test runner.
Run commands from the repository root:

```sh
npm run sync -- list
npm run sync -- list --json
npm run sync -- preview rust-skills
npm run sync -- apply rust-skills
npm run sync -- preview pstack-picks --ref <40-character-commit>
npm test --workspace=@dead-claude-skills/upstream-sync
npm run typecheck
```

Preview fetches upstream data and runs the adapter and its checks in a detached temporary
worktree at committed HEAD. It prints a diff including additions, deletions and binary
changes, excludes uncommitted changes, and removes the worktree on completion or failure.
It never publishes issues or pull requests.

Apply refuses staged, modified or untracked files inside the selected source's destinations;
unrelated edits are preserved. It does not commit, push or automatically roll back a failed
transformation. A successful apply saves `result.json` and `body.md` under
`$RUNNER_TEMP/sync/<source>` (the OS temporary directory when unset). Starting a new apply
invalidates previous artifacts. `--github-output` appends PR metadata to `$GITHUB_OUTPUT`.

`issues <source>` reads a successful apply result and reports newly discovered skills.
`failed <source> <run-url>` opens or updates a failure issue; `passed <source> <run-url>`
closes it. These explicit commands use authenticated `gh`; the weekly workflow invokes
them and separately creates PRs through its existing action. Local apply and preview do
not publish anything. Git is required for syncs; pin and release adapters also read GitHub
through `gh`.

The source registry owns destination paths, result checks and PR text. Adapters are
importable `run(context)` functions returning structured revisions, reports and discovered
skills. The context owns subprocess access and temporary upstream clones. Existing
ownership stamps keep their historical script names to avoid changing vendored content
solely because this tool moved.

The workspace shares the root npm lockfile and development dependencies. It has no runtime
npm dependencies or compilation step and is excluded from the installer package.
