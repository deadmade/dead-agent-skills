# Prior art: naming checks in plan and code review

Source check (2026-11-25, fresh agent, all 9 pages opened, current versions since none is versioned): 15 confirmed, 1 not supported (CodeRabbit `path_instructions`, dropped), 1 location corrected (Google Naming is its own section), 1 can't tell (CodeRabbit built-ins). Inferred claims A8, A11, A12 and P4 rest on this repo's setup, not a cited page; A3 ("objective") is undercut by domain-modeling and relabelled.

Gaps: none of the pages failed to open. Not found: any AI review tool or agent skill that runs a dedicated naming pass, and any source that reviews names in a plan before code exists. The CodeRabbit page I read has no naming check (only a "descriptive test names" example). The Pocock code-review page names no glossary check. No source gives noise data for naming comments, so the pitfalls come from sources on nits in general.

## Sources read

- Google eng-practices, [What to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html): one line in its own Naming section, "Did the developer pick good names for everything?", and a good name is long enough to say what the item does without being hard to read. Style preference alone must not block a CL; if no rule applies, match the surrounding code.
- Google eng-practices, [How to write code review comments](https://google.github.io/eng-practices/review/reviewer/comments.html): label severity ("Nit", "Optional", "Consider", "FYI") so authors know what is mandatory; explain the reason behind a comment.
- [Conventional Comments](https://conventionalcomments.org/): defines `nitpick` as "trivial preference-based requests" that should be non-blocking, plus a `(non-blocking)` decoration.
- Rust API Guidelines, [Checklist](https://rust-lang.github.io/api-guidelines/checklist.html): a Naming section of seven checkable items (C-CASE, C-CONV, C-GETTER, C-ITER, C-ITER-TY, C-FEATURE, C-WORD-ORDER), each phrased as a state to confirm and linked to a detail page. The page does not say who runs it.
- Matt Pocock skills, [repo page](https://github.com/mattpocock/skills): lists `domain-modeling` (challenges terms against the glossary), `grill-with-docs` and `code-review`.
- Pocock, [domain-modeling SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md): "When the user uses a term that conflicts with the existing language in `GLOSSARY.md`, call it out immediately"; for vague terms "propose a precise canonical term". The page does not mention `_Avoid_`; its format file was not shown.
- Pocock, [code-review SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md): two parallel sub-agents, Standards and Spec, kept apart so one cannot mask the other. Names appear only as a "Mysterious Name" smell, a judgement call. No glossary.
- Martin Fowler, [Ubiquitous Language](https://martinfowler.com/bliki/UbiquitousLanguage.html) (the page is a bliki entry): the language should be rigorous because software copes badly with ambiguity, and developers should watch for ambiguity or inconsistency. It does not describe a check procedure.
- [CodeRabbit review instructions](https://docs.coderabbit.ai/guides/review-instructions): its five instruction formats never mention naming; the only naming-like text is a "descriptive test names" example. Whether it has a built-in naming check can't be told from the page.

## Approaches

### A. Naming as a checklist item in an existing angle
Shape: one line ("are the names good, do they match neighbours") inside the code-fit or correctness reviewer's brief. No separate pass.
Used by: Google eng-practices (one item in its Naming section); Pocock code-review (a smell in the Standards axis).
Good at: cheap; no extra reviewer. Matches the sources' habit of keeping naming small.
Costs: easy to skip when the reviewer's attention is on bigger findings [inferred].
Bad fit: plans with many new names [inferred].

### B. Fixed rule list per convention area
Shape: enumerated, checkable naming items, each with an ID and a detail page.
Used by: Rust API Guidelines checklist.
Good at: turns a taste question into a yes/no check; reviewers can cite an ID [source: items are phrased as states to confirm].
Costs: someone must write and maintain the rules; fits a language ecosystem, not a repo that has no stated rules [inferred].
Bad fit: a repo whose conventions live only in its existing code [inferred]. Fall back to "match surrounding code" (Google).

### C. Check against the glossary
Shape: compare each new term with `GLOSSARY.md`; flag conflicts and suggest the canonical term.
Used by: Pocock domain-modeling and grill-with-docs, run while shaping the model, not as a review pass. The code-review skill does not use it.
Good at: concrete, since a finding can cite the entry it conflicts with [inferred]; not mechanical, since domain-modeling ends a conflict with a question to the user ("Which is it?") [source]. Catches synonym drift. Works at plan time, since the check needs only the name [inferred].
Costs: only as good as the glossary; names with no glossary entry get no verdict [inferred]. I found no source that runs this as a review pass, so it is an adaptation.
Bad fit: config keys, flags and file names, which a domain glossary rarely covers [inferred].

### D. Naming as its own reviewer
Shape: a dedicated reviewer or axis for names.
Used by: no source I read. Pocock splits Standards from Spec, not naming from the rest.
Costs: another subagent per review for a small slice of findings [inferred]; and a reviewer whose only job is naming has to find something, which invites nits [inferred].
Bad fit: 2-3 angle workflows [inferred].

## Pitfalls and how guides contain them

- Preference blocking merges: Google says don't block on personal style preference; fall back to surrounding code.
- Noise: Google's severity labels and Conventional Comments' `nitpick` / `(non-blocking)` tell the author which comments to skip.
- No reason given: Google asks reviewers to explain why. For names, that means naming the glossary entry or neighbouring name that a suggestion follows [inferred].
- Cheap to fix at plan time, but a bikeshed there is also cheap to trigger [inferred]. Limit the check to names the plan adds (the "Adds:" line) and report only conflicts with the glossary or a sibling name [inferred].

## Reading for this repo

The sources point to C inside A: take each "Adds:" name, check it against `GLOSSARY.md` (term and `_Avoid_`) and against sibling names, as one item in the fit-with-codebase angle. Mark findings that cite neither as non-blocking nits [inferred from Google, Conventional Comments, Pocock]. No source supports a standalone naming angle.
