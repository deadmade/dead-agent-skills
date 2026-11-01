# Documentation audit, 2026-11-01

Scope: working tree against f3dab0b, using `.superpowers/sdd/plan-harness-independent-plugins/whole-branch-review.diff`. Generated distributions and vendored inputs were excluded from authored findings. Feature working documents were excluded from public-document review. This is a read-only review apart from this report; no fixes were applied.

| #   | Severity | Where                      | Finding                                                                                                                                 | Evidence produced in this review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Recommended fix                                                                                                                                                                                                 |
| --- | -------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | low      | `catalog/plugins.json:113` | The shared Azure description tells Codex users to configure with Claude's `/plugin configure`.                                          | The catalog description says `configure with /plugin configure`; `tools/installer/core/package-adapters.ts:38` preserves that description for Azure, and the generated Codex manifest retains it. The generated setup skill instead correctly gives `codex mcp add dead-agent-skills-mcp-azure -- npx -y @tiberriver256/mcp-server-azure-devops@0.1.47` and native environment configuration.                                                                                                                                                                            | Make the neutral description host independent or supply a Codex description in the package adapter, then regenerate. Do not edit the generated manifest.                                                        |
| 2   | low      | `README.md:97`             | The authoring guide promises optional unsupported-event diagnostics without explaining that build/check commands silently discard them. | `node --input-type=module -e 'import {selectHooks} from "./tools/installer/core/catalog.ts"; import {readFileSync} from "node:fs"; console.log(JSON.stringify(selectHooks(JSON.parse(readFileSync("plugins/default/hooks/shared.json","utf8")),"codex").diagnostics));'` returned `[{"target":"codex","event":"notification.received","message":"Optional hook notification.received is unavailable on codex"}]`. `tools/installer/system/packages.ts:217` returns diagnostics; `scripts/build-harnesses.mjs:9` and `scripts/check-harnesses.mjs:23` ignore that return. | Prefer printing returned diagnostics in the build command, preserving the intended contributor feedback. Alternatively qualify the docs as an API-only diagnostic. This overlaps Task 7's reported review item. |

User picks: pending coordinator review. Fixed: none.

## Documents and claims reviewed

- Root README: native installation, identifiers, companions, prerequisites, ownership, migration, authoring commands and honest validation limits.
- `plugins/default/README.md`, setup-night-city skill and fixture README: shared startup/notifications, native theme boundaries, provenance and pending native checks.
- Flows README, shared rules, host adapters, resource index, spec-compliance instructions and changed conductor descriptions: resource lookup, host tools, skipped subagents, gates and state.
- `AGENTS.md` and `CLAUDE.md`: authored catalog, generated ownership, build/check commands and adapter boundaries compared with changed code. No additional substantive instruction contradiction established. The async statement in AGENTS is within the notifications paragraph; synchronous startup rules are correctly declared separately in shared.json.
- `docs/vendor-a-pack.md`, GLOSSARY and ADR 0005: authoring references and vocabulary were read. Existing cockpit decision material was preserved, not treated as delivered functionality of this branch.
- Authored catalog and changed package/plugin descriptions: compared host claims with package emission. The Azure description issue above is authored at the catalog/adapter seam.
- Changed prose received the technical-writing and unslop review. No additional consequential prose finding was established.

## Mechanics and evidence

A Python read-only scan selected 30 changed authored Markdown files from the supplied diff, excluding feature working documents and generated outputs, then resolved Markdown local-link paths against each containing file. Result: `Scoped markdown files: 30 local link paths checked: 40 missing: []`. This checks paths, not all anchors or every inline code path.

Source inspection confirmed package.json provides build:harnesses, check:harnesses, compatibility aliases, prepack freshness/compilation and Node >=26; release, sync-lib and flows-uses call the combined builder. The authored catalog, target capability table, adapters, shared declarations and runtime/installer migration code support the main public ownership and safety claims.

External references fetched successfully on 2026-11-01 using web open:

- [Official Codex CLI customization](https://learn.chatgpt.com/docs/cli-customization).
- [Official Codex hooks](https://learn.chatgpt.com/docs/hooks).
- [Claude hooks reference](https://code.claude.com/docs/en/hooks).
- [ccthemes upstream](https://github.com/livlign/ccthemes).

No redirect-to-unrelated-page or unavailable result was observed for these four URLs. This was not an exhaustive crawl of external references.

The coordinator's Task 7 report records passed build/check:harnesses, npm test, typecheck, pack dry-run, Claude mod tests, isolated native package smoke and final focused tests. Those are inherited evidence, not rerun or independently claimed as passed by this audit. No full suites, installer, release, push or native profile changes were run here.

## Not checked

Authenticated native hook trust/execution, complete live lifecycle captures, missing-Node interpretation, native theme visuals and Windows acceptance remain pending as the public README explicitly states. Documentation-derived fixtures do not establish live native behavior. No exhaustive anchor checker or external-link crawl was run. Independent claim-checker subagents were not dispatched because the coordinator owns the review seats; this report is a scoped document/source comparison, not a claim of those separate checks passing.
