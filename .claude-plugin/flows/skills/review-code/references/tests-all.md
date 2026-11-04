# Deep tests pass (`all`)

What would the suite miss? Moved from the former test-audit conductor.
[stack-packs.md](../../../references/stack-packs.md) applies (a `*.csproj`: the csharp-skills `testing` router, whose
find-untested-sources, run-tests and test-gap-analysis fit the map, the baseline and the probes).

## Map and baseline

Source files in scope (every non-test, non-vendored source file), each mapped to the tests that exercise it (by
import, name or a coverage run if the repo already has one configured). A source file with no test at all is already
a finding. The tests lens's `flows:pr-test-analyzer` output is an input to the map. The baseline is the latest run
from [checks.md](checks.md) (re-run first if the tree changed since). Don't add tooling (coverage, mutation tools, new
test frameworks) without the user's yes.

## Probes

One message, these agents in parallel, each given the scope, the test map, the baseline and the path of the pack file
it follows:

- **Mutation:** tob `mutation-testing` when its tools (mewt, muton) support the language and are installed; read its
  results with its `workflows/analyzing-results.md`, and drop equivalent mutants (same behaviour) by
  `<packs>/tob-picks/skills/mutation-testing/references/equivalent-mutants.md`. Else the language's own tool if
  already installed (cargo-mutants, Stryker, mutmut, PIT); offer to install one only with the cost (time per run).
  Else by hand: per scoped function, the mutations in superpowers `test-driven-development`'s `writing-good-tests.md`
  (The Mutation Check) and the tests that cover it. Mutants run in a scratch `git worktree` of `git stash create`
  (HEAD when the tree is clean) with the scope's untracked files copied in, never in the user's tree; nothing there
  is committed. A surviving mutant is a weak test.
- **Properties:** tob `property-based-testing`, to find code with only example tests that should have properties:
  encode/decode and serialize/deserialize pairs, parsers, normalizers, validators, comparators and sorting, numeric
  code, state machines. Name the property, don't write it yet.
- **Requirements:** tob `spec-to-code-compliance` with the spec (a `docs/features/*/` spec, CLAUDE.md, README) and the
  tests as the implementation: which stated behaviours no test checks.

`kind` in each finding: missing test, surviving mutant (with the mutant as a diff), property candidate (with the
property), untested requirement. Rank by what a real bug there would cost, not by count:
`<packs>/tob-picks/skills/mutation-testing/references/severity-classification.md` for mutants, mapped onto high, med
and low, with the source scale kept in the evidence.

## Fill (per pick)

Superpowers `test-driven-development`:

1. Write the test. For a surviving mutant, show it fails with the mutant applied (in the scratch worktree) and passes
   on the real code. For a requirement, show it fails when the behaviour is removed. A test that can't fail isn't
   done. That is RED here: a test of existing code passes on it by design.
2. Property candidates: tob `property-based-testing` writes the property with the repo's existing PBT library, or
   proposes one (a new dependency: the user's yes).
3. Delete candidates: delete, and show the mutants the deleted test killed are still killed.

Fill changes tests only. A production edit goes to the user first. A test or property that fails on the real code
stops that pick: classify it by `<packs>/tob-picks/skills/property-based-testing/references/interpreting-failures.md`
(a bug, an ambiguous spec or a wrong test) and ask the user; a bug goes to `/fix`. Then re-run the suite and the
mutation probe on the touched area, and put the before and after survivor counts in the audit file.
