# Conductors are composed from flow steps at build time

The flows conductors repeated the same rules in several places (start and resume, deviations, gates, finishing,
the builder brief), and the repeats drifted: one conductor had a fix that another lacked. The shared rules file,
`flow-rules.md`, was a second file every agent had to read, and after a compaction Claude Code keeps only a skill's
first 5,000 tokens, so rules held in another file could drop out of view.

A rule a conductor follows is now written once, as a flow step in `plugins/flows/steps/<name>.toml`. A conductor's
SKILL.md is ordinary prose with `## Phase` headings and `[step: name]` lines. The harness compiler's compose pass
copies each step in word for word, resolves host tokens (`{{ask-user}}`, `{{model:strongest}}`, …) from
`templates/hosts/<target>.ts`, draws the phase table from the headings, and checks the result. Every built conductor
is self-contained: an agent reads one file. `flow-rules.md` and the per-skill `uses.json` files are deleted; uses are
computed from the steps and the host token maps. A step reads the same in every conductor, with no slots or
parameters; a conductor writes its own text around the steps it uses.

## Considered options

- **Keep one shared rules file the conductors point to.** Rejected: a second file to read, and it falls outside the
  part of a skill that survives compaction.
- **Structure as data** (phases and steps declared in YAML or JSON, rendered to Markdown). Rejected for conductors:
  a conductor is mostly its own prose with steps between paragraphs. Accepted for steps, see the amendment.
- **Steps with free-text slots or parameters.** Rejected: the one case that needed them (/implement planning from a
  ticket) went away when /implement stopped planning.
- **Agent-first output with an Always/Do split and a trace command; checks-first `[phase:]` lines with a kinds
  registry.** Rejected in the design panel (`docs/features/flows-compose/designs.md`) as more compiler and more format
  for the same result.

## Consequences

- The source SKILL.md files under `plugins/flows/skills/` are no longer what agents read; the generated
  `.claude-plugin/` and `.agents/plugins/` trees are. Reviewing a rule change means reading the built conductors.
- `grep -rF "<sentence>" plugins/flows` finds the one source of any rule.
- A new conductor is cheap: prose plus `[step:]` lines. A change to a step changes every conductor that uses it.
- Build checks fail on an unknown step or token, an unmet `requires`, a section a step writes that the template lacks,
  a path that doesn't resolve per harness, and rules plus Start past the compaction budget.

## Amendment, 2026-11-04: steps are TOML

After the first steps were built as Markdown with `key: value` frontmatter, the user asked for a structured format
that is "easier to combine to one proper markdown file and is easier to create and validate than just text". Two
panels built three real steps and /fix in each candidate. JSON put prose in escaped strings; XML and Markdoc changed
the conductors and most of the plan; YAML indented every prose line. TOML kept the text byte for byte in a `'''`
block, gave typed keys with an editor schema, and built the same skills. Steps are now `steps/<name>.toml`, parsed by
`smol-toml` (pinned exactly, no dependencies of its own); conductors stay SKILL.md. Membership of the run rules
(`in = "every-conductor"`), unknown
keys and near-miss `[step:` lines are checked; those checks would have worked on Markdown too, so the format itself
buys editor completion and typed values, at the cost of the compiler's first runtime dependency: every job that runs
the build installs packages first.

Conductors stay skills, not Workflows: a Workflow can't take user input mid-run, and the conductors have gates. This was
recorded during the `skill-composition` feature and not re-tested.
