# Portable spec-compliance procedure

Inputs: target code path, optional spec path, the requirement limit the caller agreed with the user, and any
untrusted-data line the caller gives, which goes into every checker, reviewer and refuter prompt below. Follow the
reporting and evidence rules in `<flow-root>/packs/tob-picks/skills/spec-to-code-compliance/SKILL.md`, except its
Workflow invocation: use this procedure instead. No host-specific JavaScript workflow runtime is required.

If subagents are unavailable, report spec compliance as skipped and return to the conductor. Do not perform
its subagent analyses in the main session.

1. Identify authoritative specification documents and relevant implementation paths. Record unreadable documents
   and contradictions. Extract individually checkable requirements with stable IDs, verbatim quotes and locations.
   Apply the supplied limit and report requirements excluded by it. With no limit and more than about 10
   requirements, ask the user first, with the count and the cost: one checker per requirement and one reviewer of
   uncovered behaviour, on the session's model, plus one refuter per claimed divergence, on the session's model. Where
   you can't ask (a subagent), return the count and cost to your caller instead, and check none.
2. Dispatch the brief in `<flow-root>/agents/spec-compliance-checker.md` on the session's model for each requirement,
   providing its quote, source, relevant code paths and the pack's reporting resources. Ask a separate reviewer, on
   the session's model, to check implementation behavior not covered by the specification. Respect the host's
   concurrency limit.
3. For every claimed divergence, dispatch an independent reviewer on the session's model to try to refute it against
   the actual code and quoted requirement. Keep only evidence-backed findings, and label anything not independently
   verified.
4. Report the alignment matrix, surviving divergences, uncovered behavior and document contradictions. Link code
   and specification evidence. Return findings to the conductor; do not apply fixes or bypass its approval gate.
