- **With an argument, an existing run's slug** (`docs/features/<arg>/flow.md` exists in the repository root or a
  worktree under `.worktrees/*/` or `.claude/worktrees/*/`): read the newest copy. A `flow:` other than `feature` (or
  missing) → say which conductor it belongs to and stop. `phase: done` → say it's done and ask what to do. When the
  newest copy is in a worktree, work in that worktree (the host worktree tool, or run commands with that worktree as their working directory) and write that copy; if the
  switch is refused (the host cannot switch its working directory), say so and
  ask the user to start the session in that worktree. Then continue at its phase, as "Without one" does. Never create
  a flow.md over an existing one.
- **With an argument, anything else:** derive a kebab-case slug (`checkout-webhooks`), create
  `docs/features/<slug>/flow.md` from [references/flow-template.md](references/flow-template.md), then Phase 1. If
  the derived slug exists, ask before choosing another.
- **Without one:** find `docs/features/*/flow.md` files whose `phase:` isn't `done` and whose `flow:` is `feature` or
  missing (other values belong to other conductors). One: read it and the artifacts
  it links, then continue at its phase. Several: ask which. None: ask what to build.
