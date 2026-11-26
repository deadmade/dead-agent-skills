# Naming

What makes a new name bad, and what a naming finding has to show. Plan review's Naming angle, `/review-code`'s naming
lenses (naming-domain, naming-pattern, naming-meaning) and the `/review-code` verifier read this file; no other file
restates its rules.

**Scope.** Every name the change adds or renames: files, types, functions, config keys, flags, private names, locals
and test names included. Names that already existed are out of scope, also when they are bad.

## Kinds

**Domain.** A word the glossary lists under `_Avoid_`, a word that means something else in the glossary or the spec, or
a new domain concept with no glossary term. Check against `GLOSSARY.md` (or the file `GLOSSARY-MAP.md` points at) and
the spec. With no glossary, check against the spec only, and raise "no glossary term" only where a glossary exists. A
finding cites the glossary entry or `_Avoid_` line, or the spec line.

**Pattern.** The name breaks the casing, prefix, suffix or file-naming pattern of its neighbours, or reuses a name that
already means something else in the repo. Search the repo for the names next to it and for the same name used
elsewhere. A finding cites the established or clashing name with its `file:line`.

**Meaning.** The name doesn't say what the thing does: vague (`utils`, `manager`, `handle`, `data`), misleading (it
says one thing, the code does another), or too narrow or too broad for what it holds. Read the code behind the name; in
plan review, the task's steps. A finding cites the `file:line` (or plan step) where the code does what the name hides.

**Plan text** (plan review only). Task headings, the run's slug, and the names the steps use for things. A finding cites
the heading or step and what it misnames.

## Evidence

Every finding cites what its kind names above and proposes one or two better names. Its concrete case is that evidence
plus what a reader gets wrong with the current name: the name says X, the glossary, a neighbour or the code says Y. No
citation, no finding: a name the reviewer merely dislikes is dropped, not downgraded.

## Severity

Naming is never **blocking**. A misleading name (Meaning), an `_Avoid_` word, or a clash with an existing name that
means something else is **should-fix** in plan review and `med`, bucket `fix before merge`, in `/review-code`. Any
other evidenced finding (a pattern mismatch that confuses nobody, a missing glossary term) is **consider** in plan
review and `low`, bucket `worth doing`, in `/review-code`.

## Naming tail

It replaces `/review-code`'s shared tail for the naming lenses, and follows plan review's tail for its Naming angle:

```
Review only the kinds you were given, on names this change adds or renames, private names, locals and test names
included. Each finding: the name, its file:line (or plan task), the kind, the evidence (the glossary line, the
clashing name with its file:line, or the code line that does something else), what a reader gets wrong with the
current name, one or two proposed names, and the severity from naming.md. No evidence, no finding. For naming
findings, where another tail in your prompt differs, this one holds: an evidenced naming finding is not a style nit
and is never blocking. No praise, no summary. "No findings" is a valid answer.
```
