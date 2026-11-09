# Prior art: one-toolchain installers

Source check (fresh opus agent): 28 confirmed / 2 not supported / 0 couldn't open among the cited claims; all 3 `[source]` claims confirmed. Corrected below: the two unsupported claims, one claim the mise page contradicts, and trade-offs that did not follow. Verified after the check: mise's installing page lists a Windows x64 release binary and its github backend takes a per-platform `checksum` ([installing-mise](https://mise.jdx.dev/installing-mise.html), [github backend](https://mise.jdx.dev/dev-tools/backends/github.html)).

Gaps: bun.com/docs/bundler/executables (404; the Bun compile facts below come from a context7 excerpt of Bun's `docs/compiler/executables.mdx`, not a page I opened); Trunk docs (login wall), devbox and aqua docs (404); search engines timed out, so pitfalls come from GitHub issue threads read through `gh`. I did not research npm 12 `--allow-remote`, `uv sync --locked`, or any project that rewrote a Python library like headroom into Rust. Nothing found for the last: no comparable.

## 1. Pinned fetcher plus one bootstrap tool (today's shape)

Installer downloads sha256-pinned binaries; one tool (uv) owns the minority ecosystem.
Used by: cargo-dist, DotSlash, uv, ruff, rustup, Deno, Bun, Claude Code.
- [cargo-dist installers](https://axodotdev.github.io/cargo-dist/book/installers/index.html): "fetching" installers are thin wrappers that pick a platform archive and need an artifact URL and network. The [shell installer](https://axodotdev.github.io/cargo-dist/book/installers/shell.html) relies on curl/tar and "cannot run any kind of custom install logic".
- [DotSlash](https://dotslash-cli.com/docs/): a per-platform manifest of size, hash and URL, cached after first fetch. Same idea as `assets/uv.json`.
- [Claude Code setup, "Binary integrity"](https://code.claude.com/docs/en/setup#binary-integrity-and-code-signing): a GPG-signed `manifest.json` holds SHA256 per platform; Linux binaries are not individually signed.
- [rustup](https://rust-lang.github.io/rustup/installation/other.html): a `.sha256` file per target; [Ruff](https://docs.astral.sh/ruff/installation/) offers `uv tool install` or a standalone script; [uv](https://docs.astral.sh/uv/getting-started/installation/) offers a standalone script, pip/pipx, WinGet and GitHub Releases.
- Costs: you own the platform matrix, hashes and update bumps (follows from the cargo-dist, DotSlash and Claude Code manifest pages). "No runtime on the user's machine" does not hold here: the installer needs Node 26 and uv fetches Python 3.13. [inferred]
- Constraints: uv's standalone installer enables `uv self update`; `UV_UNMANAGED_INSTALL` disables it ([reference](https://docs.astral.sh/uv/reference/installer/)). uv downloads Python builds automatically unless disabled, and its list of Pythons is frozen per uv release ([python-versions](https://docs.astral.sh/uv/concepts/python-versions/)). `uvx` environments are disposable, cached and isolated from the project ([tools](https://docs.astral.sh/uv/concepts/tools/)), so they do not use `uv.lock`. [inferred]
- Limit: neither mise nor uv gives an offline install (mise: a locked install "is not an offline install", [mise.lock](https://mise.jdx.dev/dev-tools/mise-lock.html)); ADR 0008 records that wheels are fetched at install time. This applies to approach 2 equally.

## 2. Runtime-managed toolchain

One manager provisions Rust, Node, Python and tools from a lockfile.
Used by: mise, pixi, proto, Nix/devbox.
- [mise.lock](https://mise.jdx.dev/dev-tools/mise-lock.html): records URL and checksum per platform for download backends, `mise install --locked` fails without them. For `pypi` it replays a `uv.lock` graph; `cargo` records only the top-level version.
- [mise security](https://mise.jdx.dev/security.html): config that can run code needs trust; without a terminal the command fails, and CI counts as trusted.
- [mise install](https://mise.jdx.dev/installing-mise.html): an npm package `mise` exists, so `npx --yes mise exec ...` works; the script checks `SHASUMS256.txt`.
- [pixi](https://pixi.prefix.dev/latest/): conda-forge plus PyPI through uv, multi-platform lockfile.
- Correction: it is not one lockfile for everything. mise.lock "covers tools, not your application's dependencies, so keep package-lock.json, uv.lock" ([mise.lock](https://mise.jdx.dev/dev-tools/mise-lock.html)). It does give one pin manifest with per-platform URL and checksum for download-backend tools. Cost: a new dependency to bump. [inferred]
- Bad fit when: Windows is required and the manager is Nix, whose manual lists only Linux and macOS ([supported platforms](https://nix.dev/manual/nix/2.34/installation/supported-platforms.html)) [source]. [proto](https://moonrepo.dev/docs/proto/install) wants git, tar, unzip and an administrator PowerShell on Windows [source]. For this repo the extra manager would still call cargo, npm and uv underneath. [inferred]

## 3. Compile the minority code to one executable

Python or JS becomes a single file the installer only verifies.
Used by: Deno, Bun, Node SEA, PyInstaller.
- [Deno compile](https://docs.deno.com/runtime/reference/cli/compile/): embeds the whole `node_modules` unless `--bundle` (experimental); `--self-extracting` is for code that needs real files on disk, such as native addons (under `--bundle`, packages with `.node` addons are embedded); macOS ad-hoc signed, Windows `signtool` by hand.
- Bun compile (context7 excerpt): cross-targets include `bun-windows-x64` and `bun-linux-x64`; `--trim` is experimental. A hello-world was 57 MB in [bun#14546](https://github.com/oven-sh/bun/issues/14546).
- [Node SEA](https://nodejs.org/api/single-executable-applications.html): one embedded script, no file-system `require`, native addons written to a temp file, CI-tested on Windows, macOS arm64 and non-Alpine Linux only, process "subject to change". `--build-sea` cannot take TypeScript ([node#64723](https://github.com/nodejs/node/issues/64723), open). A macOS x64 segfault ([node#65479](https://github.com/nodejs/node/issues/65479)) and a Linux arm64 page-size failure ([node#67048](https://github.com/nodejs/node/issues/67048)) are open.
- [PyInstaller](https://pyinstaller.org/en/stable/operating-mode.html): output is tied to the build OS and Python; onefile unpacks to a temp folder, which breaks on `noexec` /tmp. Hidden imports surface only as runtime ImportError ([when things go wrong](https://pyinstaller.org/en/stable/when-things-go-wrong.html)). Maintainers say AV false positives cannot be predicted ([pyinstaller#847](https://github.com/pyinstaller/pyinstaller/issues/847)).
- Good at: no ecosystem at install time. Costs: a rebuild per dependency bump; a build per target holds for PyInstaller, but Deno and Bun cross-compile. [inferred]
- Bad fit when: the code ships a native extension (headroom) or the dependency bumps weekly. ADR 0008 already rejected it. [inferred]

## 4. Rewrite into one language

No source found for a project rewriting a third-party Python library; comparable: none.
- The Node route for vendored JS is `package.json` plus a bundler copy step, so Dependabot sees npm. [inferred]
- Bad fit when: the library's behaviour (headroom's router protections, per ADR 0008) is the product. [source: ADR 0008]

## Shape to weigh

Approach 1 is the dominant pattern among the tools checked, and your installer already matches it. The open question is only whether to add a manager (2) for lockfile reuse. No source I opened shows approach 2 removing the Rust or npm toolchains from CI. [inferred]
