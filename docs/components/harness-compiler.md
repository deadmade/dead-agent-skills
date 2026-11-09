# The harness compiler

`tools/harness-compiler/`. The rules for authoring plugins are in AGENTS.md, under Multiple agents.

`tools/harness-compiler/` is the one tool that turns these sources into `.agents/plugins/` (Codex) and `.claude-plugin/`
plus both marketplaces: `schema/` validates, `load.ts` builds the plugin list, `targets/<id>.ts` is one emitter per
harness (event and tool maps, manifest, MCP, LSP, theme, marketplace, and on Codex the per-conductor invocation policy:
`agents/openai.yaml` with `allow_implicit_invocation: false`, written from `disable-model-invocation: true`),
`transforms/` rewrites shipped Markdown per target (`rules.ts` holds the per-file edits for vendored text), `templates/`
holds all harness-specific prose, `runtime/` is the shared hook runner copied into packages. Adding a harness touches
more than one file: a new `targets/<id>.ts` emitter and a `templates/hosts/<id>.ts` for its wording, at least.

Don't `import` a JSON file in `tools/harness-compiler/src` (compose reads `steps/step.schema.json` with `readFileSync`):
the installer's catalog test compiles the compiler with `tsc --outDir`, which emits the JSON there and breaks the test.

`tools/installer/core/agents.ts` holds host metadata for the installer; `tools/installer/steps/codex.ts` uses Codex's
native plugin and MCP commands, respecting CODEX_HOME.
