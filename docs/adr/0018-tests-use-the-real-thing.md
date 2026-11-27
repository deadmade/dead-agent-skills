# Tests use the real thing; captures stand in only for what CI can't host

Fakes kept the suites green while the real thing broke: headroom-trim's launcher passed its tests with an injected
`spawn` while, on Windows, its server died the moment the SessionStart hook exited, and web-mcp's fake agent-browser
missed bugs real Chrome showed (`docs/solutions/`). So every test runs the real process, CLI, browser and files, in
one suite that gates every merge in CI on Linux and Windows. Only what CI cannot reach (live search engines, the
user's Azure DevOps Server, a paid carrier API) is answered by a local replay server, and only from captures: real
answers with credentials and identities masked. One exception: http-runner's test carrier answers with replies its
tests shape by hand, because the runner only passes on whatever a carrier sends. A test whose real tool is missing
fails under `--strict`. A fake is kept only for a behaviour nothing real can produce, with its reason beside it.

The real paths need test-only switches in shipped code: debug-build-only environment settings in the Rust servers
(an engine base-URL override, like `WEB_MCP_TEST_PUBLIC_IP`) and, in the installer, which has no debug build, an
answers file and a local release source read only where it asks and where it picks a release.

## Considered options

- **A separate live suite** (real engines, a cloud Azure DevOps org) beside the gating one. Rejected by the user: two
  suites, and search engines block automated clients, so it would go red at random.
- **Fully live in CI.** Rejected: engine blocks, a cloud org isn't the Server 2022.2 the user runs, and Dependabot
  PRs get no secrets.
- **Keep the fakes, add real tests on top.** Rejected: the fakes keep their upkeep and their false confidence.
- **Drive the installer through a pseudo-terminal** instead of an answers file. Rejected: Windows needs ConPTY and a
  dependency, and it would still install the published release, not the code under test.
- **Chrome host rules with a local TLS server** instead of the engine base-URL override. Rejected: per-OS certificate
  flags and a TLS server in the tests, to exercise only the hardcoded host strings.

## Consequences

- Downloads in a gating test are limited to pinned, hash-checked ones; unpinned installs (dcg's script and
  `serena-agent`, ADR 0016) are not run there.
- CI installs the real tools (Claude Code, Codex, uv, agent-browser and Chrome for Testing, Xvfb on Linux) and builds
  the Rust binaries before the installer's test.
- The slow real Node tests are `*.real.test.{mjs,ts}` and run only in the `real` suite of `scripts/test.mjs`, the
  installer's in its `installer` suite, which holds the installer's coverage floor. `npm test` runs both and CI runs
  `real`, plus `installer` when the change reaches what the installer's end-to-end test builds or installs; the
  pre-commit hook and the release jobs run `repo node`.
- One named download exception: Chrome for Testing, whichever version `agent-browser install` fetches; CI caches it.
- A change to the agent-browser pin (`tools/installer/assets/tools.json`) selects the web-mcp and http-runner checks,
  whose tests run it. The weekly sync PRs that bump the pin are not tested beyond today's checks, as now.
- The Nix packages' checks run no test that starts a browser: `flake.nix` skips them by name, and crates.yml's rust job is
  their gate.
- ado-mcp's doc-shaped fixtures are replaced by captures once the user has run its capture mode at work.
