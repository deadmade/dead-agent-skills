# Plan review round 1

Three independent native reviewers covered Correctness, Fit and Simpler. Model diversity was unavailable (the pack's named model IDs are not exposed); no check is claimed for that dimension. This was plan/source review, not execution of the proposed implementation. The user approved all six recommendations on 2026-10-31 ("I approve"); they have been applied to plan.md.

| # | Severity | Finding | Evidence | Recommended change | Alternative |
| --- | --- | --- | --- | --- | --- |
| 1 | blocking | Removing managed rules from a pre-prompt snapshot can overwrite edits made during confirmation | installer/steps/codex.ts:241–247 reads and computes before awaiting the prompt; plan Tasks 4/6 do not prohibit repeating that behavior | Reread after confirmation, recompute from current bytes, preserve unrelated edits and abort if the owned block changed; test an edit inside the mock prompt | Abort on any file change and ask again |
| 2 | blocking | Catalog producer/consumer cutover crosses tasks, so Task 1 cannot pass its own tests | installer/core/agents.test.ts:3–4 imports core/codex.ts, which still imports PORTABLE at line 1; loader appears in Task 3 and consumer migration in Task 6 | Add the loader with the neutral catalog and migrate pure decisions to accept definitions in one atomic task, updating all affected consumers/file lists | Keep a generated temporary compatibility export until an explicit later cutover |
| 3 | should-fix | Managed AGENTS.md block may be inactive because AGENTS.override.md wins | [Codex discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md#how-codex-discovers-guidance); Task 4 currently suppresses on block presence alone | Adapter identifies the effective global file; suppress only for an active managed block; cover empty/nonempty override and CODEX_HOME cases | Inject packaged rules on ambiguity and withhold cleanup eligibility |
| 4 | should-fix | Native waiting hooks can overlap and duplicate permission notifications | plugins/default/hooks/hooks.json currently uses Notification(permission_prompt\|elicitation_dialog); [Claude hook reference](https://code.claude.com/docs/en/hooks#permissionrequest) distinguishes immediate requests, delayed notifications and network prompts | Preserve Claude's current delayed permission/elicitation signals and question hook; use Codex's native permission/question signals; specify the full non-overlapping registration table and test it | Change timing and implement explicit deduplication/network fallback, at greater cost |
| 5 | should-fix | Neutral runtime catalog is not explicitly included in the packed installer | package.json files list omits catalog/; plan Task 6 needs it at runtime | Ship catalog/plugins.json, resolve it relative to the installed package root, and test selection from the actual packed layout | Emit the catalog into installer/assets and consume that generated copy |
| 6 | consider | Permanent internal build API wrappers add needless compatibility obligations after caller migration | portable.ts exports are referenced by internal scripts/tests; users install generated files or invoke CLI aliases | Remove internal buildPortable/codexMarketplace wrappers after migrating all callers; preserve public build:codex/check:codex command aliases | Keep wrappers only until an explicit final migration step; retain indefinitely only if an external consumer is found |

Screening: six evidence-backed findings retained; zero dismissed. Findings 2/5 are related build migration concerns but have separate failure cases and fixes. Findings do not require changing the approved product scope or reopening Gate 1. The catalog cutover changes task boundaries and receives a focused re-review after user-approved edits. Minor self-review corrections applied: core/codex.test.ts is a new file, and the affected binary tests live at installer/core/binaries.test.ts, not installer/steps/binaries.test.ts.

User decisions: recommended fixes accepted for findings 1–6, 2026-10-31.

## Focused round 2

Updated plan resubmitted to all three reviewers. All returned no remaining findings:

- Correctness: reread/block revalidation, effective global-source selection, nonoverlapping waiting-event mappings and regression tests are explicit.
- Fit: Task 1 includes the loader, packed catalog, pure signatures and every current PORTABLE consumer in one cutover. Task 3 migrates every existing portable-module importer before deletion. readCatalog(PKG) matches the packaged JSON path and test.
- Simpler: obsolete internal APIs are removed after caller/test migration while public command aliases remain.

No implementation or tests run. Gate 2 final plan approval and execution-method selection remain pending.

Validation already performed: real manifestPath() resolves the proposed generated Claude marketplace source to portable/claude-code/plugins/dead-skills/.claude-plugin/plugin.json; the Fit reviewer exercised current selection imports and inspected packed-file declarations. These establish current coupling, not safety of the unbuilt implementation.
