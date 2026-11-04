---
uses: mattpocock-picks:codebase-design, pstack-picks:principle-redesign-from-first-principles, pstack-picks:principle-boundary-discipline
---

- **Seams.** Read mattpocock `codebase-design` and pstack `principle-redesign-from-first-principles` and
  `principle-boundary-discipline`. For each cross-cutting concern the work adds (who the caller is, a tenant, a
  permission, a setting), name the seam where it is resolved and the modules that never see it. Redesign picks the
  seam; boundary discipline keeps the policy there. Its "propagate" covers the seam's types and docs, never a
  parameter carried through modules that don't decide on it.
  <!-- overrides pstack-picks/skills/principle-redesign-from-first-principles/SKILL.md: "Propagate the change through every reference: types, docs, examples, rationale sections" -->
- Each answer goes into the spec as one line: `<concern>: resolved in <module>; never seen by <modules>`.
