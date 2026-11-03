# Lenses

One agent per lens that runs, each a fresh `general-purpose` agent on the model named, unless the brief names a skill
or agent that runs itself. Every brief ends with the shared tail below.

| Lens        | Runs when                                                                                         | Model  |
| ----------- | ------------------------------------------------------------------------------------------------- | ------ |
| correctness | always                                                                                            | sonnet |
| lean        | always                                                                                            | opus   |
| tests       | source or tests changed                                                                           | sonnet |
| docs        | a doc, an instruction file, a manifest description, or a documented command, path or flag changed | sonnet |
| security    | the diff touches input parsing, auth, the network, files, processes, secrets or dependencies      | opus   |
| risk        | migrations, a public interface, a wire format, config or a hot path                               | opus   |

**Small diff** (at most 3 files and about 50 changed lines): agents cost more than they find. Run the lenses yourself,
one after another, each with its brief, and say so; correctness still goes to one fresh agent, because an author
re-reading its own diff isn't a review.

## Briefs

**correctness.** On a host whose adapter names a built-in code review for this lens, run that (the adapter says
how). Otherwise the agent follows `<packs>/ponytail/skills/ponytail-review/SKILL.md` sections 1 to 3 with only the
**Bug**, **Risk** and **Scale** items of section 2. Either way, add:

- swallowed errors and fallbacks that hide a failure (a catch that logs and goes on, a default returned on error, a
  retry that never gives up);
- a finding needs a caller the code supports that reaches it; a helper that fails on input nothing passes it isn't a
  bug;
- nothing reproduced isn't a clean result: say which paths were not exercised.

**lean.** `ponytail-review`'s section 2 **Lean** item only (delete, reuse, stdlib, yagni, merge, split), plus:

- when a plan exists, each task's `**Adds:**` against the diff: new files, types, exported functions, flags, config
  keys or dependencies no `Adds:` names, and diffs more than twice a task's `**Size:**`;
- the spec, when there is one: requirements missing or wrong, and code the spec didn't ask for.

**tests.** Agent `flows:pr-test-analyzer` on the diff and its tests, plus flow-rules' tests rule (one test per
behaviour, at the seam): missing tests for risky new logic, and excessive ones (tests of private helpers, of the
framework, near-duplicates); a delete candidate is a finding too.

**docs.** [docs.md](docs.md): the claims and mechanics checks on the docs in scope, plus the host adapter's
instruction-file review, leading with statements the diff made untrue. Prose findings only for docs the diff changed.

**security.** One agent following the host's `security-review` procedure (the host adapter), with the diff from
Phase 1 in place of the branch diff the skill builds itself. `claude-security` is not run here (it is a many-agent
pipeline): it is an `all` pass.

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

`all` runs the lenses on every tracked file (vendored skipped, flow-rules **Scope**), then offers these passes, each
with a recommendation and its cost in agents, and runs only those the user says yes to:

| Pass        | Follows                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------ |
| tests, deep | [tests-all.md](tests-all.md): mutation testing, property candidates, untested requirements |
| hardening   | [harden-all.md](harden-all.md): security domains, sharp edges, bloat, architecture         |
| full scan   | `claude-security:claude-security`, a scoped codebase scan (its own pipeline and panel)     |
| every claim | [docs.md](docs.md) **Claims** with the tob `spec-compliance` workflow                      |
