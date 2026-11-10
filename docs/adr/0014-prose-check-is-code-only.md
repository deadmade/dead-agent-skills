# The prose check is code only and looks only for conversation shorthand

Superseded on 2026-11-10: the prose check, the copyedit and the writing skill were removed
(`docs/features/refactor-writing/`).

`plugins/flows/hooks/prose-check.mjs` checks `*.md` writes for conversation shorthand. It uses no linter and no model.
We measured the alternatives first, on one sample spec with model judges:

- Harper 3.0.0, Vale 3.25.1, LanguageTool 6.6 and proselint 0.16.0 reached 0 to 2.8% precision.
- A parser prototype on spaCy reached 47%.
- A Haiku checker with the rules reached 86%, but 27 of its 31 recalled problems were shorthand. As a write-time hook, it
  found 6 problems in about 7,800 words, too few to be worth its cost.

No editor can repair conversation shorthand afterwards, because none of them was in the conversation: Opus kept the
labels and added a legend, and Sonnet's replacements read to the judges as lost meaning. The writer has to fix shorthand
while it still has the context, which is when a code check at write time runs.

The copyedit uses a plain prompt plus the `writing` skill: an editor fed spaCy candidates only matched a plain Opus
prompt, and needed a 1.7 GB environment on every flows user's machine.

These results come from one or two documents and model judges (the `writing-style` feature record, in git history).
Re-check them if a linter or a model hook is proposed again.
