A run's folder is `docs/features/<slug>/`, found in the repository root or a worktree under `.worktrees/*/`,
`worktrees/*/` or `.claude/worktrees/*/`. Where several copies of a flow.md exist, the newest is the run's. Never
create a flow.md over an existing one.

- **With an argument, an existing run's slug** (`docs/features/<arg>/flow.md` exists in one of those places): read
  the newest copy.
  - A `flow:` other than this conductor's → say which conductor it belongs to and stop.
  - `phase: done` → say it's done and ask what to do.
  - When the newest copy is in a worktree, work in that worktree (the host worktree tool, or run commands with that
    worktree as their working directory) and write that copy. If the switch is refused (the host cannot switch its
    working directory), say so and ask the user to start the session in that worktree.
  - Then resume it, as below.
- **With an argument, anything else:** derive a kebab-case slug (`checkout-webhooks`; a scoped package name is
  flattened, `@types/node` → `types-node`), create `docs/features/<slug>/flow.md` from the template this conductor
  names, then Phase 1. If a run with the derived slug exists in one of those places, ask before choosing another.
- **Without one:** find the flow.md files in those places whose `phase:` isn't `done` and whose `flow:` is this
  conductor's (other values belong to other conductors). One: resume it. Several: ask which. None: ask for the input.
- **Resume:** read flow.md and the artifacts it links. When the run has its own branch and its base has moved
  (`git merge-base --is-ancestor <base> HEAD` fails), say so and offer a rebase or a merge first, with a
  recommendation. Then continue at its `phase:`.
- **Abandon:** the user may abandon an open run: set `phase: done` and `now: abandoned: <why>`, and stop.
