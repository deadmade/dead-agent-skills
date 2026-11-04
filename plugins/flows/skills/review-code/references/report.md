# Report

Two outputs: one screen in chat, and the full table in a file.

## The file

Always write `docs/audits/<YYYY-MM-DD>-review-<scope>.md` from [audit-template.md](audit-template.md): the scope
line, every verified finding in flow-rules **Reports**' table with the template's `bucket` column (most severe first,
`confirmed` or `plausible` in the evidence), the dropped count, and later the `Picks:` and `Fixed <date>:` lines
flow-rules **Reports** names.

- **Audits:** `/review-code` writes `docs/audits/<YYYY-MM-DD>-review-<scope>.md`: the scope line, the findings
  table, the user's pick per finding, and what was fixed. Older reports there carry the names of the conductors it
  replaced (`test-audit`, `doc-audit`, `harden`).

## Reports (audits)

One ranked table, most severe first:

| #   | severity     | where       | finding      | evidence                   | fix (recommended) |
| --- | ------------ | ----------- | ------------ | -------------------------- | ----------------- |
| 1   | high/med/low | `file:line` | one sentence | the command, quote or test | what to do        |

Every finding has evidence produced in this run: a command and its output, a quote with its line, a failing test.
Nothing from memory. Then the user picks by number (`1,3`, `all fix` for every Fix before merge item, `all`, `none`). Fix only those, then re-run the check
that found each one and show it passes. Record picks and results in the report file as `Picks: <finding numbers> |
none`, then one line `Fixed <date>: <number>` per pick once its check passes.

## The screen

```
<scope line>
Verdict: <ready | N to fix before merge | blocked: <why>>
Lenses: <run>; skipped <lens> (<why>), …

Fix before merge
1 · <file:line> · <what breaks, when> · <fix>
…

Worth doing
6 · <file:line> · <what breaks, when> · <fix>
…

Waiting on you
a · <decision> — <your recommendation>
…

<n> more (low) in docs/audits/<file>. Not checked: <what wasn't, and any risk you must know>.
```

- **Fix before merge**: at most 5, the findings that ship something wrong. **Worth doing**: at most 5 more. Numbers
  run on across both and match the file's table, so a pick by number works from either.
- **Waiting on you**: every decision the user owes, each answerable from the reply alone (the decision, the options
  in a few words, your pick): the build's **Rulings**, its **Deviations** and their decisions, new `shortcut:` lines,
  and the **Parking lot** (checks.md **Decide** lists where each comes from). Lettered, so they don't clash with
  finding numbers.
- The last line is flow-rules **ponytail at chosen steps**' footer.
- Copyedit the file per flow-rules before the gate; the screen is short enough to go as written.
