# Report

Two outputs: one screen in chat, and the full table in a file.

## The file

Always write `docs/audits/<YYYY-MM-DD>-review-<scope>.md` from [audit-template.md](audit-template.md): the scope
line, every verified finding in flow-rules **Reports**' table with the template's `bucket` column (most severe first,
`confirmed` or `plausible` in the evidence), the dropped count, and later the `Picks:` and `Fixed <date>:` lines
flow-rules **Reports** names.

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
