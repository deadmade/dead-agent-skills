# Report

Two outputs: one screen in chat, and the full table in a file.

## The file

Always write `docs/audits/<YYYY-MM-DD>-review-<scope>.md` from [audit-template.md](audit-template.md): the scope
line, the findings table, the user's pick per finding, and what was fixed. Older reports there carry the names of the
conductors it replaced (`test-audit`, `doc-audit`, `harden`).

One ranked table of every verified finding, most severe first. `bucket` is `fix before merge` (it ships something
wrong) or `worth doing`, so `all fix` resolves from the file alone:

| #   | severity     | where       | finding      | evidence                   | fix (recommended) | bucket                         |
| --- | ------------ | ----------- | ------------ | -------------------------- | ----------------- | ------------------------------ |
| 1   | high/med/low | `file:line` | one sentence | the command, quote or test | what to do        | fix before merge / worth doing |

Every finding has evidence produced in this run: a command and its output, a quote with its line, a failing test.
Nothing from memory. The evidence says `confirmed` or `plausible`, and the dropped count follows the table. After
Gate 1 come `Picks: <finding numbers> | none`, then one line `Fixed <date>: <number>` per pick once its check passes.

## The screen

```
<scope line>
Verdict: <ready | N to fix before merge | blocked: <why>>
Lenses: <run, or combined>; skipped <lens> (<why>), …

Fix before merge
1 · <file:line> · <what breaks, when> · <fix>
…

Worth doing
6 · <file:line> · <what breaks, when> · <fix>
…

Waiting on you
a · <decision> — <your recommendation>
…

<n> more worth doing in docs/audits/<file>. Not checked: <what wasn't, and any risk you must know>.
```

- **Fix before merge**: every finding that ships something wrong, however many. **Worth doing**: at most 5 more; the
  last line counts the rest. Numbers run on across both and match the file's table, so a pick by number works from
  either.
- **Waiting on you**: every decision the user owes, each answerable from the reply alone (the decision, the options
  in a few words, your pick): the build's **Rulings**, its **Deviations** and their decisions, new `shortcut:` lines,
  and the **Parking lot** (Decide lists where each comes from). Lettered, so they don't clash with finding numbers.
- The last line ends with the run rules' footer as its "Not checked" part.
- The copyedit (Phase 5) runs on the file before the gate; the screen is short enough to go as written.
