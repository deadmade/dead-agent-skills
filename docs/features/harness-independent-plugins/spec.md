# Harness-independent plugins

Status: approved by the user on 2026-10-31 ("I approve :)").

## Intent

Maintain plugins once while freely choosing between Claude Code and Codex terminal CLIs. Additional harnesses should be integration work concentrated in an adapter, rather than a rewrite of each plugin. Switching starts a fresh conversation; shared rules, plugin behavior and resumable flow documents remain available.

## Decisions confirmed by the user

- Harness-neutral plugin definitions and shared handlers are the authored source.
- Build native package folders for each harness before committing and check the outputs in. Both marketplaces work from a fresh clone without the installer or a local build.
- Package small adapter modules with the outputs to translate live hook inputs and responses. Keep their implementation as ordinary modules rather than large generated code strings.
- Plugins retain ownership of their hook declarations and feature behavior. The shared integration layer handles native registration and event translation.
- Support explicit harness-specific extensions for capabilities without equivalents.
- Initially support Claude Code and Codex terminal CLIs. Design for adding other harness adapters later, without implementing them now.
- Preserve Night City in both. Match its palette on supported surfaces; reproducing Claude-only spinner words or UI effects in Codex is not required.
- Generate during development/before commit; commit checks and CI check freshness rather than silently rewriting staged files.
- The separate cockpit may replace md-pane and tui-review; this feature does not require equivalent terminal mods in Codex.

## Architecture

An authored plugin definition describes identity, resources, dependencies, shared hooks and optional native extensions. Shared handlers consume feature-relevant normalized inputs. A target adapter validates support and generates native registration, manifests and packaged runtime modules. Native extension resources are included only in their target package.

At execution, the native harness launches the packaged entry point with explicit target/event identity. That entry point decodes the live payload, invokes shared plugin behavior and encodes a supported native result. It does not infer identity from ambiguous compatibility environment variables. There is no persistent interpreter service or custom harness launcher.

Hook registration and execution are distinct. Generation cannot precompute future event data. A completed build includes everything needed to interpret native input when that event later occurs.

### Seams

- Plugin identity/resources/dependencies: resolved in the shared catalog and native package emitters; never seen as native manifest formats by shared plugin handlers.
- Harness event inputs and responses: resolved in packaged harness entry adapters; never seen by shared notification policy, OS notification delivery or rule content.
- Capability availability: resolved in target validation and package generation; never assumed equivalent by shared plugin handlers.
- Native extensions: resolved in target resource selection; never loaded into another harness's package.
- Theme formats: resolved in theme adapters over the shared Night City palette; never encoded separately in shared color definitions.
- Host paths and configuration ownership: resolved in installation and packaged entry boundaries; never embedded as fixed user directories in shared handlers.
- Flow execution tools: resolved in existing host instruction adapters; never made a new tool-name requirement of shared flow policy.

## Initial feature coverage

Accepted by the user on 2026-10-31.

1. Bring the currently supported shared skill/flow and MCP catalog under a common authored definition while retaining existing behavior and identities. Host-owned or external plugin integrations remain declared native dependencies/extensions where needed; do not copy third-party implementations to manufacture parity.
2. Migrate startup rule injection and desktop notification hooks through the new interface as concrete end-to-end examples. Keep existing Linux/Windows notification implementations and focus/suppression behavior.
3. Port Night City colors to supported Codex theme surfaces; preserve Claude's current theme/mod as a native extension. Keep terminal palette changes separate and explicit if required; no silent terminal-wide recoloring.
4. Retain Claude-only integrations such as md-pane, tui-review and LSPs as explicitly scoped native extensions, without removing them or building Codex equivalents.

## Capability semantics

An event name match alone does not establish behavioral equivalence. Define support by feature, native event, input fields, output actions and execution properties such as async and timeout. Do not turn a missing event into an unrelated event or silently drop a control decision.

Unsupported required capabilities fail the target build; explicitly optional capabilities produce a clear diagnostic and are omitted. Native-only plugins/extensions remain visible as target-limited rather than appearing to work on both. The required/optional classification belongs to the plugin definition, with tests for the chosen mappings.

Codex lifecycle hooks require native trust review; generated packaging must preserve that review. Notification, permission requests and user questions need distinct mappings. No claim is made that the same waiting signals exist across harnesses.

The initial hook interface supports context injection and observational notifications needed by the migrated plugins. A general allow/deny/rewrite/continue interface is deferred until a concrete plugin requires it; extensibility must not imply those actions already work.

## Rules ownership and migration

Plugin startup hooks become the normal source of shared rules. Existing installer-managed global rules remain working until the hooks are trusted and verified. Only then offer removal of our managed block; preserve all unrelated user instructions. During transition, avoid injecting the same shared rules twice. The implementation must exercise both the existing-block and fresh-install paths and must not infer hook trust merely from plugin installation.

## Compatibility and constraints

- Preserve Claude marketplace IDs, plugin names, executable aliases, default release versioning and native config ownership.
- Respect CODEX_HOME and the existing Claude config path mechanisms. Preserve unrelated user configuration.
- Keep the installer free of runtime npm dependencies and follow its erasable TypeScript/module conventions.
- Do not edit vendored inputs or generated output by hand. Use transformations and package generation where adaptation is necessary; preserve upstream attribution.
- Preserve current uncommitted multi-harness work; establish an implementation baseline before attributing changes to this feature.
- Keep generated output deterministic and verify missing, changed and stale generated files. Linux/Windows differences must not produce persistent output drift.
- Test Windows and Linux command/path behavior, including spaces, native Node invocation and missing executables. Do not require Bash for shared runtime hooks.
- Do not add transcript parsing as a prerequisite for shared lifecycle behavior. Native transcripts are not assumed to be a stable cross-harness contract.
- Coordinate interface changes with the separate cockpit flow without implementing that app or a new capture format here.

## Acceptance criteria

- A shared plugin's event declaration and behavior are authored once; target-specific registration is reproducibly generated.
- Both native marketplaces discover and install packages from a fresh clone. Installation needs no build or interpreter service.
- Startup rules and notifications exercise the full registration → native input → shared behavior → native output path for both initial targets, with documented capability differences.
- Tests validate emitted native shapes against captured/authoritative native examples and exercise packaged entry points with representative payloads. Merely checking emitted strings is insufficient.
- Shared rules load once through the selected mechanism; startup injection must not duplicate a managed global rules block.
- Notification tests cover main/subagent completion, continuation suppression, supported waiting signals and existing OS/focus behavior.
- Night City has one authored palette, valid native outputs and a visual checklist per CLI. Unsupported Claude-only UI effects are explicitly scoped, not represented as shared support.
- Generation checks detect stale or extra output. All existing applicable checks continue to pass.
- No unselected third harness or conversation migration is introduced.

## Approaches considered

- Adopt an external framework: evaluated AgentPlugins, agent-harness-plugins and Mentu; none supplies a sufficiently compatible, appropriately scoped dependency. See [evaluation.md](evaluation.md).
- Hand-maintain native hooks per plugin: smallest initial infrastructure, but duplicates maintenance as plugins/harnesses grow; rejected by the user.
- Runtime-only interpreter: flexible but adds runtime parsing and packaging complexity without helping fresh-clone distribution; not selected.
- Selected: generate and commit native packages from shared sources, with small packaged runtime adapters for live events.

## Design decisions

All design questions are settled, subject to approval of this document. On 2026-10-31 the user accepted the proposed initial migration, required/optional capability policy, limited hook control scope and safe rules migration. No planning or implementation is authorized by that decision acceptance alone; the flow's document approval gates still apply.

## Builder check

A fresh reviewer found no additional architectural blocker. It refined rules ownership to require an existing-installation transition (Codex currently writes a managed global AGENTS.md block), and called out the need to distinguish the current observational/context hooks from future control hooks. Both decisions were accepted and folded into this spec; review is not an approval or a runtime check.

## Builder choices

Exact schema syntax, module names and source/distribution folder layout are left to the builder and plan, subject to the seams, native installability, compatibility and validation constraints above. Paths used in discussion are illustrations, not settled migration paths. Minimum supported harness versions must be grounded in actual integration checks before readiness is claimed.
