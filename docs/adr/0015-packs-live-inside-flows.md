# The skill packs live inside flows

The packs ship in `plugins/flows/packs/` and aren't marketplace plugins; conductors read their skills by path
(`<flow-root>/packs`). The principle behind this is that the conductors are the only thing that activates a leaf skill:
not the user typing it, and not Claude picking it from the listing. Skills with similar names that do different jobs are
then fine, as long as a conductor decides which runs when.

An installer copy into the plugin data folder was approved first and then dropped:

- `${CLAUDE_PLUGIN_DATA}` isn't substituted in files read by path.
- The copy's source would be the clone at the released tag.
- Nothing would notice a stale copy.
- The copy needed staging code.

Claude Code's plugin docs (read 2026-10-23) load only a plugin's root `skills/`, `agents/` and `hooks/hooks.json`, so
nothing under `packs/` loads on its own. The record is the `skill-composition` feature, in git history.
