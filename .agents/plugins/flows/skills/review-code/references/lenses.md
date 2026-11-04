# Lenses

One agent per lens that runs, each a fresh `general-purpose` agent on the model named, unless the brief names a skill
or agent that runs itself. Every brief ends with the shared tail below.

| Lens        | Runs when                                                                                         | Model               |
| ----------- | ------------------------------------------------------------------------------------------------- | ------------------- |
| correctness | always                                                                                            | the session's model  |
| lean        | always                                                                                            | the session's model |
| tests       | source or tests changed                                                                           | the session's model  |
| docs        | a doc, an instruction file, a manifest description, or a documented command, path or flag changed | the session's model  |
| security    | the diff touches input parsing, auth, the network, files, processes, secrets or dependencies      | the session's model |
| risk        | migrations, a public interface, a wire format, config or a hot path                               | the session's model |

**Small diff** (at most 3 files and about 50 changed lines): agents cost more than they find. One fresh agent on
the session's model runs every lens that applies, one brief after another, and the report's Lenses line says
`combined`. Its lenses see each other's findings, so here independence holds between the author and the reviewer, not
between lenses. Where the adapter's built-in correctness review runs, it runs on its own, outside the combined agent.
The session that wrote the code runs none of them, because an author re-reading its own diff isn't a review.

## Briefs

**correctness.** On a host whose adapter names a built-in code review for this lens, run that when the adapter's
conditions hold (the adapter says how). Otherwise (no built-in, or a tree with uncommitted or untracked files) the
agent follows `<packs>/ponytail/skills/ponytail-review/SKILL.md` sections 1 to 3 with only the **Bug**, **Risk** and
**Scale** items of section 2, and the report's Lenses line says the neutral brief ran, and why. Either way, add:

- swallowed errors and fallbacks that hide a failure (a catch that logs and goes on, a default returned on error, a
  retry that never gives up);
- a finding needs a caller the code supports that reaches it; a helper that fails on input nothing passes it isn't a
  bug;
- nothing reproduced isn't a clean result: say which paths were not exercised;
- a rule in the repo's AGENTS.md or CLAUDE.md that the diff breaks (quote the rule).

**lean.** `<packs>/ponytail/skills/ponytail-review/SKILL.md`, its section 2 **Lean** item only (delete, reuse,
stdlib, yagni, merge, split), and its section 3 rule that a `shortcut:` comment naming its limit is a decision, not a
finding (Decide lists it), plus:

- when a plan exists, each task's `**Adds:**` against the diff: new files, types, exported functions, flags, config
  keys or dependencies no `Adds:` names, and diffs more than twice a task's `**Size:**`;
- the spec, when there is one: requirements missing or wrong, and code the spec didn't ask for.

**tests.** Agent `flows:pr-test-analyzer` on the diff and its tests, plus the tests rule (one test per behaviour,
through the plan's **Test seams**): missing tests for risky new logic, and excessive ones (tests of private helpers, of
the framework, near-duplicates, tests through a seam the plan's **Test seams** doesn't list); a delete candidate is a
finding too.

**docs.** [docs.md](docs.md): the claims and mechanics checks on the docs in scope, plus the host adapter's
instruction-file review, leading with statements the diff made untrue. Prose findings only for docs the diff changed.

**security.** One agent following the adapter's security review, with the diff from Phase 1 in place of a branch diff
a skill builds itself. Where the adapter offers more than one, this lens takes the one-agent review; a many-agent
pipeline (`claude-security`) runs only as the `all` pass full scan.

**risk.** pstack `blast-radius` over the change (callers, data, wire formats, configs), plus:

- a migration: does it lock a busy table, can it be reversed, does a backfill run in batches, does old code still run
  against the new schema during a deploy;
- a public interface or wire format: what an existing caller or stored value now breaks;
- a hot path: work repeated per item or per request, unbounded growth.

### Shared tail

```
Review only from your lens. Each finding: file:line, what breaks and when (the input or situation that leads to the
wrong result), the fix (smallest that works; prefer deleting code), and how sure you are. No case, no finding. No
style taste, no praise, no summary. "No findings" is a valid answer.
```

## `all`

`all` runs the lenses on every tracked file (vendored skipped, as Phase 1 says), then the main session offers these
passes, each with a recommendation and its cost in agents, and runs only those the user says yes to:

| Pass        | Follows                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| tests, deep | [tests-all.md](tests-all.md): mutation testing, property candidates, untested requirements       |
| hardening   | [harden-all.md](harden-all.md): security domains, sharp edges, bloat, architecture               |
| full scan   | `claude-security:claude-security` where the host has it, a scoped scan (its own pipeline, panel) |
| every claim | [docs.md](docs.md) **Every claim**                                                               |
