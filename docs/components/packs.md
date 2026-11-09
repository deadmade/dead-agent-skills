# The skill packs

`plugins/flows/packs/`.

`plugins/flows/packs/`: the skill packs the conductors run, one folder per upstream, each written by its
`tools/upstream-sync/src/adapters/*.ts`. They are not marketplace plugins and nothing there loads on its own (Claude
Code loads components only from a plugin's root, such as `skills/`, `agents/` and `hooks/hooks.json`, never from a
folder like `packs/`); conductors read a pack's skills by path (`<flow-root>/packs`, written `<packs>`), and the
installer retires old installs of them and checks none remains (`stillInstalled`). The folder list is the source of
truth, not this file.

pstack-picks leaves out pstack's `technical-writing` and `unslop` (flows' `writing` replaces them; the sync rewrites the
lines that name `unslop`, and `GUARD` fails on a new mention of either);
`npm run sync -- apply pstack-picks --ref <hash>` syncs one commit, given as a full 40-character hash, instead of
upstream's default branch; its entry in `tools/upstream-sync/src/sources.ts` checks the number of vendored skills (16),
so change that count whenever you change `SKILLS`. When upstream's text gets past the rewrites, the sync's `GUARD` fails
its weekly `sync.yml` job until a PR adapts them; don't hand-edit the pack to get past it.

tob's spec checker ships as flows' own agent, `plugins/flows/agents/spec-compliance-checker.md` (vendored by the `tob`
sync adapter), because a pack's agents don't load.

Where a conductor or step changes a pack's rule, or pastes a section of one, it quotes each sentence in an
`<!-- overrides <pack>/<path>: "..." -->` marker in flows' own `.md` and `steps/*.toml` files (the build strips them);
`checkOverrides` (`scripts/flows-uses.mjs`, run by check-repo and by every pack sync before its PR) fails when the
quoted sentence is gone. `docs/vendor-a-pack.md` is the checklist for a new pack.

## ponytail and superpowers

`plugins/flows/packs/ponytail/`, `plugins/flows/packs/superpowers/`: vendored unchanged from upstream's newest stable
release (`npm run sync -- apply <name>`, ADR 0002): ponytail's skills and its
SessionStart/SubagentStart/UserPromptSubmit hooks and band mod (the hooks and band don't load); superpowers' skills and
SessionStart hook (its `run-hook.cmd` and `session-start` stay LF via `.gitattributes`). Other hosts' adapters are left
out. The sync PR carries upstream's release notes, and the sync fails on a `plugin.json` component or default folder it
doesn't know.

## The quote check

`npm test` (check-repo) fails when a sentence an `overrides` marker quotes is gone from its pack. Run it after a pack
sync and fix the marker or the conductor text in the same PR. It sees only quoted sentences, so also read a superpowers
sync's `brainstorming` diff against `build-feature`: v7.0.2 added a chat approval that would bypass its Gate 1, and no
quote covered it.

## The vendored language and database plugins

`plugins/opt-in/implementation/rust-skills/`, `plugins/opt-in/implementation/csharp-skills/`: vendored
(`tools/upstream-sync/src/adapters/simple.ts`, `tools/upstream-sync/src/adapters/csharp.ts`). `paths:` frontmatter
doesn't gate plugin skills in Claude Code (checked on 2.1.272 and 2.1.296), so csharp-skills exposes six router skills
over an unscanned `library/`, with upstream's binlog MCP workflows cut (the server isn't vendored); the router reads
library files via the installer's `Read(~/.claude/plugins/**)` rule (without the installer users get a permission
prompt).

`plugins/opt-in/implementation/postgres/`: a database plugin. It vendors Neon's and Timescale's Postgres skills from two
upstreams (`tools/upstream-sync/src/adapters/simple.ts`), so each skill folder carries its own LICENSE and UPSTREAM (the
Timescale one a NOTICE too) instead of one set at the plugin root.

## Syncing

`tools/upstream-sync/`: private TypeScript workspace for upstream vendoring, run directly on Node 26.
`npm run sync -- list` lists sources; `preview <source>` shows changes from committed HEAD in an isolated worktree;
`apply <source>` updates a clean destination and writes a structured result under the runner temp directory. A failed
`apply` can leave its destination half-written, which breaks the build for the next source in that checkout. The
registry owns source checks and PR metadata; adapters export `run(context)` and have no import-time effects. Context
supplies the checkout, Git/GitHub access, temporary directories and result collection. Tests use local upstreams and
fake GitHub responses. Historical generated-file ownership stamps retain their original script names.
