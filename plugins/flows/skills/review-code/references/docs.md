# Docs lens

Do the docs tell the truth about the code? Moved from the former doc-audit conductor.

## Scope

The docs are READMEs, `docs/` (not `docs/audits/` or `docs/features/*/` working files), CLAUDE.md and CONTRIBUTING.md
files, the `description` fields of manifests (`package.json`, `plugin.json`, a marketplace, `Cargo.toml`), and CLI
help text and skill descriptions that document behaviour.

- **all:** every such doc, vendored ones skipped (Phase 1).
- **branch:** docs the diff changed, plus docs that name what the diff changed: grep them for each changed file path,
  exported symbol, command, flag, config key and env var. New public surface (a command, option, tool, setting) with
  no doc naming it is itself a finding.

## Claims

Follow tob `spec-to-code-compliance` with the docs as the specification and the scope's code as the implementation.
The lens checks each claim it can hold against the code itself, and starts no agents. The claims it can't hold
(under `all`, or in a long doc) it returns as a list, each with its quote and `file:line`, for the **every claim**
pass below. Per doc, its verdicts become findings:

- **contradicted** (and `partial`): the doc says X, the code does Y. Quote both with `file:line`.
- **unbacked** (`absent`): the doc claims behaviour no code implements.
- **undocumented** (`stronger-than-spec`, and the workflow's reverse sweep): the code does something user-facing no
  doc mentions.
- `undecidable`: the doc is too vague to check; a finding against the doc.

## Every claim

The main session offers this pass, on the claims the lens returned (under `all`, on every scoped doc), and runs it only
on the user's yes:

- tob's spec-compliance checker ships as flows' own agent: `tob-picks:spec-compliance-checker` means
  `flows:spec-compliance-checker`.
  <!-- overrides tob-picks/skills/spec-to-code-compliance/SKILL.md: "For a single requirement, dispatch the `tob-picks:spec-compliance-checker` agent at it." -->
- For tob's spec-compliance workflow, follow [spec-compliance.md](../../../references/spec-compliance.md) with
  the target path, optional spec and limit. It uses native subagents, without a host-specific Workflow runtime.
  <!-- overrides tob-picks/skills/spec-to-code-compliance/SKILL.md: "Run `/tob-picks:spec-compliance <path>`." -->

Its inputs are the scope's code as the target path, the doc as the spec, and the requirement limit agreed at the
offer. The offer states its cost: one checker per requirement and one reviewer of uncovered behaviour, on
{{model:standard}}, plus one refuter per claimed divergence, on {{model:strongest}}. Its findings come back to the main
session and are sorted as **Claims** says.

## Mechanics

In the scoped docs, check what can be checked by running something:

- **Paths and links:** every repo path exists; every relative link and anchor resolves.
- **URLs:** fetch each with {{web-fetch}}; report errors, and redirects to a different page.
- **Commands:** the binary, script, subcommand and flag each exist (`--help`, the script's source, the manifest).
  Run a documented command only when it's read-only or the repo's own check; never one that installs, deletes,
  pushes or publishes.
- **Versions and names:** versions, plugin and package names, env vars and config keys match their source.
- **Plugin manifests:** the host's plugin validator on the plugin folder, when the host provides one.

Under `pr`, the local tree is not the PR's: paths, links, scripts and manifests are checked at the head sha
(`git show <head sha>:<path>`, `git ls-tree <head sha>`), no command from the PR runs, and without a fetched head the
checks that need its files are recorded as not checked.

## Prose

Docs the diff changed, read against `flows:writing`, loaded with the host's skill tool. Findings only, severity low
unless the wording misleads.

## Severity and fixes

Severity by consequence per `<packs>/tob-picks/skills/spec-to-code-compliance/resources/DIVERGENCE_RUBRIC.md`. A fix
changes the doc to match the code. When the code looks like the bug (the doc describes the intended behaviour), say
so: that finding's options are fix the code or fix the doc, and the user picks. A vendored doc's fix goes into its
sync script's transform. After the fixes, re-check the claims and mechanics of the changed docs.
