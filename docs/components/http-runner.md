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

Tests run the binary over stdio and the library against a fake carrier (`tests/common/mod.rs`). A test whose login page
opens gets it in real Chrome through the real agent-browser (`WEB_MCP_AGENT_BROWSER`, else the installer's copy in
`<CLAUDE_CONFIG_DIR or ~/.claude>/bin`), which fills and submits the form as the user does; requests a browser can't
make (a wrong `Host` or `Origin`, a bad value, an oversized body) go over raw TCP. Such tests take one Chrome at a
time, and the rig starts each agent-browser session on `about:blank` before the page opens in it: a dozen Chromes at
once, or a cold start, can abort the page they are sent to (`net::ERR_ABORTED`, measured). It closes the session when
the test ends. A browser that can't open is agent-browser with a command it doesn't know, which exits with an error. On
Windows the test process points `XDG_RUNTIME_DIR` at a temp folder of its own, so agent-browser's session files stay
out of `~/.agent-browser`; and the browser http-runner starts inherits its stderr there, so a test reading that stderr
to its end closes the browser first.
Test-only hooks (debug builds): `HTTP_RUNNER_OPEN` is the program that opens the login page in place of the system
browser, one line each for the program and its arguments (a path may hold spaces), the address appended last; and
`HTTP_RUNNER_DEADLINE_MS` replaces the 55 s call deadline. The Nix package's tests therefore run with
`checkType = "debug"`, and skip the tests that start agent-browser, whose names begin with `real_` (`--skip real_` in
`checkFlags`): the sandbox has none, so crates.yml's rust job runs them.
