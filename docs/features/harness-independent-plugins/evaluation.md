# Existing harness abstractions: evaluation

Evaluated 2026-10-31 during brainstorming. This is an evaluation, not an approved design or implementation plan.

## Requirements

Claude Code and Codex terminal CLIs; fresh conversations with shared plugins, rules and resumable flow documents; plugin-owned hooks; harness-specific extensions where needed; Night City in both; native Linux and Windows operation; both marketplaces usable from a fresh clone. Preserve the existing uncommitted work and vendored sources.

## Verdict

Do not adopt these projects wholesale. AgentPlugins has the closest abstraction but compatibility defects would make adoption a repair/fork commitment. agent-harness-plugins provides the best practical packaging precedent. Mentu provides a useful event-normalization pattern, but its implementation is policy-specific and its Codex mapping needs updating.

| Candidate | Inspected revision | Fit | Maintenance consequence |
| --- | --- | --- | --- |
| AgentPlugins | `f3d9c439680d26d4316c1ed214ae9a82a2127a2a` | Shared contract, compiler, native adapters and capability diagnostics | Native emitters and runtime wrappers need repairs; broader framework and dependencies |
| agent-harness-plugins | `5205fada80635f7d9dd4a1967c94a256e60a99cb` | Shared scripts with explicit native hook registrations; generated checked-in Codex packages | Borrow the pattern; repository-specific Bash generator and macOS notifier are unsuitable dependencies |
| Mentu Policy Harness | `6d9c4f575e819538b70cbd0451a6b86d6e85b438` | Decode native events, evaluate shared policy, encode responses | Governance concepts, fail-open policy and user-level installation add unrelated obligations |

## AgentPlugins: adoption blockers

- [Native emitters](https://github.com/sigilco/agentplugins/blob/f3d9c439680d26d4316c1ed214ae9a82a2127a2a/packages/adapter-codex/src/index.ts#L186) emit flat event/command hook entries rather than the documented nested event-keyed hook configuration. Codex MCP generation uses `servers`, and generated skills lack YAML metadata. These are source/schema mismatches, not failures reproduced in a live harness.
- [Inline dispatcher](https://github.com/sigilco/agentplugins/blob/f3d9c439680d26d4316c1ed214ae9a82a2127a2a/packages/compile/src/hook-wrapper.ts#L207) selects by `AGENTPLUGINS_HOOK_ID`; generated invocation does not set it. The error path exits successfully. [Contract test](https://github.com/sigilco/agentplugins/blob/f3d9c439680d26d4316c1ed214ae9a82a2127a2a/packages/core/__tests__/adapter-contract.test.ts#L453) does not establish that dispatch works.
- No shared async/timeout contract was found. Command handlers pass through without a normalized runtime interface. Thus shared packaging does not by itself supply the requested hook API.
- [Store](https://github.com/sigilco/agentplugins/blob/f3d9c439680d26d4316c1ed214ae9a82a2127a2a/packages/store/src/store.ts#L135) uses fixed user paths and its own installation/link ownership. [Core dependencies](https://github.com/sigilco/agentplugins/blob/f3d9c439680d26d4316c1ed214ae9a82a2127a2a/packages/core/package.json) include a wider compiler/pipeline/store stack and Zod, conflicting with the installer's current no-runtime-dependency convention unless architecture changes.
- [CI](https://github.com/sigilco/agentplugins/blob/f3d9c439680d26d4316c1ed214ae9a82a2127a2a/.github/workflows/ci.yml) does not establish native Windows behavior. Claude inline generation uses Bash. No Codex theme emitter was found.

## agent-harness-plugins: useful precedent

The [Claude declaration](https://github.com/cboone/agent-harness-plugins/blob/5205fada80635f7d9dd4a1967c94a256e60a99cb/plugins/notify/hooks/hooks.json) and [Codex declaration](https://github.com/cboone/agent-harness-plugins/blob/5205fada80635f7d9dd4a1967c94a256e60a99cb/plugins/notify/hooks/codex.hooks.json) invoke [one notification script](https://github.com/cboone/agent-harness-plugins/blob/5205fada80635f7d9dd4a1967c94a256e60a99cb/plugins/notify/scripts/notify) with explicit harness/event arguments. Its Codex hooks cover Stop, prompt submission and request_user_input; Claude also uses Notification. No claim of equal lifecycle coverage is warranted.

The [build generator](https://github.com/cboone/agent-harness-plugins/blob/5205fada80635f7d9dd4a1967c94a256e60a99cb/bin/build-codex-marketplace) creates committed native distributions, matching our fresh-clone constraint. This is a project pattern, not an importable SDK. Its Bash/jq tooling and macOS alerter notification implementation do not replace our Windows/Linux Node implementation. Shared script logic still consumes harness-specific fields, so we should normalize them at the entry point rather than copy that coupling.

Inspected tests include generated-marketplace fixtures and committed-output drift checks. No runtime tests were run.

## Mentu: useful seam, unsuitable runtime

Its [Codex adapter](https://github.com/mentu-ai/mentu-hooks/blob/6d9c4f575e819538b70cbd0451a6b86d6e85b438/mentu_policy/adapters/codex.py) mixes legacy runtime event names with lifecycle events, falls back to prompt_submit for unknown events and uses generic decision output. This needs event-specific validation against the current native contract before reuse.

Its [shim](https://github.com/mentu-ai/mentu-hooks/blob/6d9c4f575e819538b70cbd0451a6b86d6e85b438/mentu_policy/adapters/shim.py) deliberately allows on failure; this is its policy, not a neutral default for all plugins. Its [installer](https://github.com/mentu-ai/mentu-hooks/blob/6d9c4f575e819538b70cbd0451a6b86d6e85b438/scripts/install-agent-hooks.sh) uses Bash and fixed user config paths. No native Windows installation or plugin-marketplace abstraction was established. Python runtime code is stdlib-only, but importing governance/context/capture concepts would add unrelated maintenance.

Inspected golden adapter and isolated installer tests do not prove current native compatibility. No tests were executed.

## Native capabilities and Night City

[Codex hook documentation](https://learn.chatgpt.com/docs/hooks) establishes lifecycle hooks, plugin trust, async handlers and event-specific outputs. Notification is not in its documented event list. PermissionRequest is available; it is not equivalent to every Claude notification. Hook scripts must exist locally, and installation does not automatically trust them. [Packaging reference](https://developers.openai.com/plugins/build/plugins).

[CLI customization](https://learn.chatgpt.com/docs/cli-customization) supports custom `.tmTheme` files under CODEX_HOME/themes. Installed binary reports `codex-cli 0.166.0`. Matching [release source](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/tui/src/style.rs#L80) additionally reads a `codex.accent` theme scope, while other styles depend on terminal colors or built-in behavior. This supports investigating a Night City port but does not prove complete parity with Claude's theme overrides, spinner words or UI mods. None of the evaluated projects supplies this translation. Actual visual verification remains required.

## Approaches to choose between

1. **Adopt and repair AgentPlugins (large effort):** externally defined contract, but responsibility for compatibility fixes, integration and downstream testing. Not recommended now.
2. **Small local contract and two native adapters (medium effort, recommended):** build on existing packaging; plugins retain scripts and hook declarations; normalize only the shared events/features we actually use. Resolve native payloads/responses at runtime entry points and native manifests at package generation. Notification wording/OS delivery, rules content, MCP implementations and flow policy never see harness-native wire formats. Theme translation has its own adapter seam over a shared palette. Keep explicit native extensions.
3. **Native hook files plus shared scripts (smallest, small-to-medium effort):** follow agent-harness-plugins; minimal infrastructure but duplicate declarations and plugin authors must keep native differences aligned. Viable if the shared hook set stays very small.

User selected the small local contract/adapters with build-time native package generation and committed outputs on 2026-10-31. Ordinary packaged adapter modules process live events; pre-commit/CI check freshness. See flow.md for the recorded choice. Exact Night City visual acceptance remains open. This selects an approach, not a final spec or plan.

## Validation limits

Shallow clones, pinned revision identification, source/test inspection, official documentation comparison and local CLI version/help only. No upstream scripts, dependencies, tests, live plugin installation, Windows execution, hook dispatch or visual theme checks were performed. Product files were not changed. This evaluation cannot claim compatibility passed.
