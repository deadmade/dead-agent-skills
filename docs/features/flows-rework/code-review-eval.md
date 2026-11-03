# Built-in /code-review against /self-review

Run 2026-11-03 for flows-rework Task 8. Only one earlier run wrote its self-review findings down with `file:line`, so
recall is measured on that one diff; every other run recorded counts only.

## Diff 1: `fix/agent-browser-binary` before its fixes

- Diff: `e564369` against its merge-base `06dc138` (9 files, +135 −62), reviewed as the local branch
  `eval/agent-browser-prefix`.
- `/self-review`'s findings: `docs/features/agent-browser-review-fixes/flow.md` **Findings** (numbered 1–10; 9 was
  "not on this branch", so 8 apply).
- `/code-review high eval/agent-browser-prefix`: one forked agent, 15 tool calls, about 70k tokens, 2 min 13 s. It
  returned 9 candidates as JSON (file, line, summary, failure scenario) and said they were deduplicated but not
  verified.

| self-review finding                                                            | /code-review                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1 `agent-browser install` never retried once the binary is current             | found (its #3)                                            |
| 2/10 second `renameSync` has no rollback; `.old-<pid>` never swept             | found, as two (its #4, #5)                                |
| 3 `downloadBin`'s comment describes only the archive case                      | missed                                                    |
| 4 CLAUDE.md's web-mcp entry ("binary-only crate", "downloads it like web-mcp") | missed (it flagged README and `browser.rs` drift instead) |
| 5 PATH-vs-ours choice untested, against CLAUDE.md's rule                       | found (its #7)                                            |
| 6 `agentBrowserAsset` returns undefined for both a bad platform and a bad pin  | found (its #6)                                            |
| 7 early return leaves a stale `agentBrowserPath`                               | found (its #2)                                            |
| 8 `browser.rs:56` still says `npm install -g`                                  | found (its #10, plus a misleading NixOS comment)          |

New in /code-review, not in self-review's list:

- `claude plugin configure --values-stdin` called twice with one key each may reset `binPath` if the CLI replaces
  instead of merging (plausible; it says nothing in the repo settles it, and I didn't check the CLI).
- `downloadBin`'s new raw-binary mode duplicates `applyCswap`'s download and move-aside code (reuse; real, read at the
  cited lines in its report).
- a local `versionOf` repeats `binVersionAt` (reuse).

## Summary

|                             | /self-review (recorded run)                              | /code-review high                           |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| applicable findings matched | 8 of 8 (baseline)                                        | 6 of 8                                      |
| new findings                | —                                                        | 3 (1 plausible bug, 2 reuse)                |
| agents                      | about 12–16 plus one scorer per issue (SKILL.md Phase 3) | 1                                           |
| report                      | sections Spec, Fix before PR, Consider, Noted, Dismissed | one JSON list, each with a failure scenario |

It missed the two doc-wording findings, which `/review-code`'s docs lens covers anyway. It found every behaviour bug
self-review found, with one agent instead of a dozen, and it adds the reuse angle self-review's bug pass leaves out.

Diff 2 (this branch after Task 7, with the old `/self-review` run fresh) was skipped on the user's call: diff 1
answers the question, and `/code-review` runs on this branch in the final `/review-code` dry run.

## Angles

`/code-review` alone does not cover every `/self-review` angle. Seen in this run: bugs, CLAUDE.md adherence, reuse,
some doc drift. Not seen: git history, earlier PR comments, spec compliance, test gaps, swallowed errors (only
partly), type design, security, the instruction-file audit. `/review-code` takes tests, security, docs and
instruction files in their own lenses.

## Decision (2026-11-03)

The user chose `/code-review` plus two lines: on Claude Code the correctness lens is `/code-review high`, and on
other hosts it is ponytail-review's bug, risk and scale sections plus the regression rule. The correctness brief
adds "swallowed errors and fallbacks that hide a failure", and the lean lens also checks the spec (missing, wrong,
not asked for). Type design and the history and PR-comment angles are dropped on purpose. The vendored code-review
and spec/standards files go; the sync keeps only `pr-test-analyzer`.
