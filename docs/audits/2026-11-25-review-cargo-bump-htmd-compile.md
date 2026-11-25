# Review: cargo-bump-htmd-compile

branch: dependabot/cargo/cargo-814dff296c ← main (405ed2b9), 3 files (Cargo.toml, Cargo.lock, tools/web/web-mcp/src/extract.rs), 1 commit + 1 uncommitted line

Called inline by `/fix` (docs/features/cargo-bump-htmd-compile/flow.md); execution ran natively, no per-task reviews.
Intent: the cause and `Picked:` line in that flow.md.

Checks (measured, 2026-11-25, HEAD 5ea2d0c4 + the extract.rs line): `cargo test --workspace --locked`,
`cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo fmt --all -- --check`,
`cargo +1.97 check --workspace --all-targets --locked`, `node scripts/cargo-workspace.mjs`: all exit 0.

Lenses: combined (small diff), one opus agent: correctness (neutral brief: uncommitted work, so no built-in
code-review), lean, tests, security, risk. Skipped: docs (no doc changed), naming-\* (no names added or renamed).

## Findings

| #   | severity | where                                                       | finding                                                                                                                                                                                                                                              | evidence                                                                                                                                                                                                                                                                                | fix (recommended)                                                                 | bucket      |
| --- | -------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| 1   | low      | `Cargo.toml:22`                                             | web-mcp now compiles dom_query twice: 0.29.0 via the `dom_smoothie =0.19.0` pin and 0.30.0 directly. That costs build time and binary size, not output.                                                                                              | confirmed: Cargo.lock:1064/1081 hold both versions, :1101 dom_smoothie → 0.29.0, :4634 web-mcp → 0.30.0                                                                                                                                                                                 | none now; drops once a dom_smoothie release moves to dom_query 0.30 (Parking lot) | worth doing |
| 2   | low      | `tools/ado-mcp/src/tools.rs:298` (and web-mcp, http-runner) | With rmcp 3.11, `resources/list`, `prompts/list` and `completion/complete` sent to these tools-only servers return JSON-RPC -32601 instead of an empty list. That follows the spec, but a client that probes those methods regardless gets an error. | confirmed for rmcp (3.10.0 server.rs:489/496/505 returned the default; 3.11.0 :495-523 returns `method_not_found` unless the capability is advertised), and for ado-mcp (`enable_tools()` only, no overrides); plausible for web-mcp/http-runner (macro-generated `get_info`, not read) | none, unless a host shows the error                                               | worth doing |

Dropped: 0.

Picks: none

- Gate 2, review-code: report: 2026-11-25

## Tasks

## Rulings

## Parking lot

## Deviations

## Skipped

- Nix package build: no Nix on this machine (see the flow.md).
- Advisory database check (cargo-audit) on the new versions: not run, not a documented check here.
- Both accepted by the user at the /fix Decide gate, 2026-11-25.

## Run verdict
