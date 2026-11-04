# Hardening pass (`all`)

What makes the code fragile? Moved from the former harden conductor; the security lens and the full-scan pass
(`claude-security`) cover the general security sweep.

## Passes

One message, in parallel, each given the scope:

- **Security domains:** cloudflare `security-audit`'s domain files, in its guidance mode (never its six-phase audit,
  output directory or ledger). From `<packs>/security-audit/skills/security-audit/`, read each domain file's
  **When to use this file** and pick those whose boundary the scope has: a source fact (an MCP server, a release
  workflow, a D-Bus call), not a dependency name. None picked: skip this pass and say so.
  - One `general-purpose` hunter per picked file, given the scope and that file's **Core discipline**, attack-class
    sections, **Universal moves** and **Validation rules**, verbatim. It hunts that file's classes only (the security
    lens covers injection, access control, memory safety and crypto), reads source and runs no target code, and
    returns each candidate with its source trace from entry point to sink, the boundary it crosses, and the result.
  - Each candidate then goes to a fresh `general-purpose` verifier that did not hunt it, given the
    **Candidate-verifier prompt** from `VALIDATION-AND-REPORTING.md` and the `confirmed`, `needs_validation` and
    `rejected` branches of `report-schema.json`. Rejected candidates are dropped.
- **Sharp edges:** tob `sharp-edges` on the scope's public APIs, config schemas and defaults: what is easy to misuse.
- **Bloat:** ponytail `ponytail-audit`: dead code, needless abstraction, what to delete.
- **Architecture:** mattpocock `improve-codebase-architecture`, report part only (its grilling runs later, on a
  pick), with pstack `principle-boundary-discipline` as a lens: a concern carried through many modules instead of
  resolved at one boundary is a finding.

## Report

Merged into the audit file's table with the lenses' findings. A security-domains `confirmed` record takes its own
severity (`critical` and `informational` stay as written). Its `needs_validation` records have no severity and no fix
to pick: list them under the table as **Needs validation**, each with its blocker and validation plan.

## Fix (per pick)

A fix that changes behaviour gets a failing test first (superpowers `test-driven-development`); a deletion shows the
suite still passes. An architecture pick runs `improve-codebase-architecture`'s grilling on it (mattpocock
`grilling`, read by path), which may turn it into a `/build-feature` or `/implement` instead: offer that. Re-run the
pass that found each fixed finding.

The pick is the contract: the files its finding names are its **Files** list. A fix that needs more stops: flow-rules
**Deviations** (the fifth stop, the brief clause, the files check, Rulings), with **Deviations**, **Tasks** and
**Rulings** kept in the audit file when there is no flow.md.
