# http-runner

`plugins/opt-in/mcp/http-runner/` and `tools/http-runner/`.

`plugins/opt-in/mcp/http-runner/`: `plugin.json` and the `http-runner` skill for `http-runner` (Rust,
`tools/http-runner/`), a stdio MCP server with two fixed tools. `run` sends one named request of a VS Code REST Client
`.http` file after the named requests it references, and returns the real reply, which it also saves with its secrets
masked in `http-replies/` beside the file (`extract::credential_values` also masks values named like credentials in a
reply to a request that carried a typed or masked value, and a reply with too many values to mask, over 32 MiB or not
masked before the call's deadline is withheld); it takes only a `.http` file.

`generate` writes a starting `.http` file from a local OpenAPI 3 file of at most 8 MiB and never replaces a file. Both
take absolute paths. Built for Windows and Linux x64 only (`crates-build.yml`); the installer downloads it and sets
`binPath`.

The user types each host's login once on a loopback page the server opens (`login_page.rs`); the values live in
`logins.json` in `HTTP_RUNNER_DIR`, else the per-user data folder, never in the project.

Tests run the binary over stdio and the library against a fake carrier (`tests/common/mod.rs`), with a fake browser
(`tests/bin/fake_browser.rs`, a `[[bin]]`). Test-only hooks (debug builds): `HTTP_RUNNER_OPEN` names a program that
opens the login page in place of the system browser, and `HTTP_RUNNER_DEADLINE_MS` replaces the 55 s call deadline. The
Nix package's tests therefore run with `checkType = "debug"`.
