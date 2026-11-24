# headroom-trim

`plugins/opt-in/headroom-trim/`.

`plugins/opt-in/headroom-trim/`: trims tool results before Claude reads them. `server/` is a uv project (Python 3.13,
`headroom-ai` pinned in `pyproject.toml` and `uv.lock`, no ML extras); `server.py` blocks every non-loopback socket
(`guard.py`) and sets telemetry off before importing headroom, and writes everything (venv, log, headroom's workspace,
`TIKTOKEN_CACHE_DIR`) under the plugin data dir, never `~` (only uv's own download cache and managed Python live in uv's
folders); `PYTHONDONTWRITEBYTECODE=1` keeps `__pycache__` out of the install folder.

A SessionStart launcher (`hooks/launcher.mjs`) finds uv (`<CONFIG>/bin`, then an absolute PATH entry; never a bare
name), starts `uv run --locked` detached, so the server outlives the hook (on Windows a hook's non-detached child dies
with it), with cwd = the data dir, output to `server.log`, and without the session's `UV_*`, `PYTHON*` and
`VIRTUAL_ENV` (the installer drops them too, `trimServerEnv`), and returns within about 300 ms, or about 1.3 s when it
replaces a server. On Windows it runs `uv run --gui-script`, so python runs as `pythonw.exe` and opens no console
window.

`/health` reports the server's identity (a hash of `uv.lock`, `pyproject.toml` and `server/*.py`) and plugin version; a
launcher replaces a server of another identity unless that server's version is newer.

A PostToolUse `http` hook posts to 127.0.0.1:47811; that port is written only in `hooks/hooks.json` and the installer
reads it from there (`hookPort`), to stop the server before `uv sync` and before uninstalling the plugin. Every failure
leaves Claude the original output.

The installer keeps the pinned uv (`tools/installer/assets/tools.json`, bumped by `npm run sync -- apply uv`) in
`~/.claude/bin`: ours always runs and is downloaded when missing or older than the pin, since the launcher looks there
first; a uv on PATH is ignored (`ensureTool` in `steps/tools.ts`). It then runs `uv sync --locked` and fetches
tiktoken's vocabulary (`steps/uv.ts`). Why uv and not a bundled Python: `docs/adr/0008-python-through-installer-uv.md`.
Dependabot's `uv` entry keeps `uv.lock` current.

## Checks

headroom-trim server: `uv run --locked python -m unittest discover -s tests` in `plugins/opt-in/headroom-trim/server`,
with `UV_PROJECT_ENVIRONMENT` set to a folder outside the repo (the default `.venv` lands in the tree). One test fills a
tiktoken cache over the network.

`hooks/session.real.test.mjs` (the `real` suite) runs the real SessionStart hook through `claude -p --plugin-dir` on a
temp copy of the built package, its port rewritten to a free one, with a temporary `CLAUDE_CONFIG_DIR`, and checks the
server still answers `/health` after claude exits. It needs `claude` and uv (`<CONFIG>/bin` or PATH); run
`npm run build:harnesses` first. The first run builds the venv (up to a few minutes).
