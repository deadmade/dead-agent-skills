// The binaries the installer downloads or points plugins at: web-mcp, ado-mcp, the flow cockpit and agent-browser.
import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';
import { BUNDLE } from './plugins.ts';
import { RELEASES, newer, semver } from './release.ts';

// tools/installer/assets/agent-browser.json and uv.json.
export interface UpstreamPin {
  upstream?: string;
  sha256?: Record<string, string>;
}

// [binary, needed for (plugin name), NixOS command, Windows command]
// graphify's optional parsers and readers (sql: tree-sitter-sql, pdf, office: docx/xlsx, watch, leiden: clustering).
export const GRAPHIFY_EXTRAS = ['sql', 'pdf', 'office', 'watch', 'leiden'];
export const GRAPHIFY_SPEC = `"graphifyy[${GRAPHIFY_EXTRAS.join(',')}]"`;
// The uv arguments that install or upgrade it; the unquoted spec, as no shell is involved.
export const graphifyToolArgs = () => ['tool', 'install', '--upgrade', `graphifyy[${GRAPHIFY_EXTRAS.join(',')}]`];

const BINARIES = [
  ['rust-analyzer', 'rust-analyzer-lsp', 'nix: rust-analyzer', 'rustup component add rust-analyzer'],
  ['csharp-ls', 'csharp-lsp', 'nix: csharp-ls dotnet-sdk', 'dotnet tool install --global csharp-ls'],
  [
    'typescript-language-server',
    'typescript-lsp',
    'nix: typescript-language-server typescript',
    'npm i -g typescript typescript-language-server',
  ],
  ['pyright-langserver', 'pyright-lsp', 'nix: pyright', 'npm i -g pyright'],
  ['nixd', 'nix-lsp', 'nix: nixd', 'not available on Windows, deselect nix-lsp'],
  ['jq', BUNDLE, 'nix: jq', 'winget install -e --id jqlang.jq'],
  ['python3', BUNDLE, 'nix: python3', 'winget install -e --id Python.Python.3.13'],
  ['uv', 'graphify', 'nix: uv', 'winget install -e --id astral-sh.uv'],
  ['graphify', 'graphify', `uv tool install ${GRAPHIFY_SPEC}`, `uv tool install ${GRAPHIFY_SPEC}`],
  ['ccstatusline', 'ccstatusline', 'nix: ccstatusline', 'npm i -g ccstatusline'],
];

// wanted: plugin names (plus 'ccstatusline' when that toggle is on). onPath(binary) -> bool.
export function missingBinaries(platform: string, wanted: string[], onPath: (binary: string) => boolean) {
  const win = platform === 'win32';
  return BINARIES.filter(([bin, for_]) => wanted.includes(for_) && !onPath(bin)).map(([binary, , nix, windows]) => {
    const cmd = win ? windows : nix;
    return { binary, command: cmd.startsWith('nix: ') ? `add to home.packages: ${cmd.slice(5)}` : cmd };
  });
}

// The binaries releases ship, built per platform by .github/workflows/crates-build.yml (the flow cockpit by
// build-flow-cockpit.yml) and attached to the vX.Y.Z release by release.yml. Keyed by plugin; name: the binary;
// key: the plugin's userConfig key for its path. targets: the BIN_TARGETS keys it is built for, when not all.
// linuxHint: Linux gets it elsewhere, and this says how. folder: the archive holds more than the binary (the flow
// cockpit's default extensions), so it is unpacked whole into a folder of its own.
export interface BinPlugin {
  name: string;
  key: string;
  targets?: string[];
  linuxHint?: (version: string) => string;
  folder?: boolean;
}
export const BIN_PLUGINS: Record<string, BinPlugin> = {
  'web-mcp': { name: 'web-mcp', key: 'binPath' },
  'mcp-azure': { name: 'ado-mcp', key: 'binPath' },
  // It links the system's GTK and WebKit on Linux, so Linux runs it from the flake, pinned to this release.
  'flow-cockpit': {
    name: 'flow-cockpit',
    key: 'appPath',
    targets: ['win32-x64'],
    linuxHint: (version) =>
      `run the app with \`nix run github:deadmade/dead-claude-skills/v${version}#flow-cockpit\`, or add the flake's flow-cockpit package to your system config`,
    folder: true,
  },
};
// Windows and Linux x64 only: no macOS or ARM builds.
const BIN_TARGETS: Record<string, string> = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-musl',
};

// The release archive of binary `name` (a BIN_PLUGINS name) at `version` for this machine, or undefined where none is built.
export function binAsset(name: string, platform: string, arch: string, version: string) {
  const key = `${platform}-${arch}`;
  const target = BIN_TARGETS[key];
  const plugin = Object.values(BIN_PLUGINS).find((p) => p.name === name);
  if (!target || (plugin?.targets && !plugin.targets.includes(key))) return undefined;
  const file = `${name}-${target}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
  const url = `${RELEASES}/v${version}/${file}`;
  const exe = platform === 'win32' ? `${name}.exe` : name;
  return { file, url, sha256: `${url}.sha256`, exe, folder: plugin?.folder === true };
}

// Where the binary of `pluginName` goes in binDir on `platform`: a folder plugin's in a folder of its own.
export function binPath(binDir: string, pluginName: string, platform: string) {
  const { name, folder } = BIN_PLUGINS[pluginName];
  const p = platform === 'win32' ? win32 : posix;
  const exe = platform === 'win32' ? `${name}.exe` : name;
  return folder ? p.join(binDir, name, exe) : p.join(binDir, exe);
}

// What to do when the binary of `pluginName` couldn't be installed. A folder plugin's failure is most likely its open
// app holding the folder, and a hand-built one lacks what ships beside it, so it gets a rerun instead of a build.
export function binAdvice(pluginName: string) {
  const { name, folder } = BIN_PLUGINS[pluginName];
  return folder
    ? `close ${name} if it is open and run the installer again`
    : `build it from the repository root with \`cargo build --release --locked -p ${name} --bin ${name}\` (output: target/release) and set its path with /plugin configure ${pluginName}`;
}

// The checksum a `sha256sum` line starts with, lowercased; undefined when the text is not one.
export const sha256Of = (text: string) => /^[0-9a-f]{64}(?=\s|$)/i.exec(text.trim())?.[0].toLowerCase();

// Whether bytes hash to want, a lowercase hex sha256 (sha256Of's or a pinned one); never true without want.
export const sha256Matches = (bytes: Buffer, want: string | undefined) =>
  !!want && createHash('sha256').update(bytes).digest('hex') === want;

// What to do about a binary: `skip` (one on PATH is the user's own), `configure` (ours is current, point the plugin at
// it), `download` (none, or an older one), or `unsupported` (no build for this machine).
// installed: the version our copy reports, or undefined when there is none.
export function binAction({
  onPath,
  installed,
  version,
  supported,
}: {
  onPath: boolean;
  installed: string | undefined;
  version: string;
  supported: boolean;
}) {
  if (onPath) return 'skip';
  if (installed === version) return 'configure';
  return supported ? 'download' : 'unsupported';
}

// installed: version from `<tool> --version` or undefined; pinned: the tool's tools/installer/assets pin (agent-browser, uv).
// A newer one stays.
export const upstreamAction = ({ installed, pinned }: { installed: string | undefined; pinned: string }) =>
  !installed ? 'install' : installed === pinned || newer(installed, pinned) ? 'skip' : 'upgrade';

// Which copy of a pinned tool runs (agent-browser for web-mcp): a current one on PATH as is, else ours in ~/.claude/bin,
// downloaded when missing or older than the pin.
export const upstreamPlan = ({
  theirs,
  ours,
  pinned,
}: {
  theirs: string | undefined;
  ours: string | undefined;
  pinned: string;
}) =>
  theirs && upstreamAction({ installed: theirs, pinned }) === 'skip'
    ? { use: 'path' }
    : { use: 'ours', download: upstreamAction({ installed: ours, pinned }) };

// Why web-mcp's one browser window can't open on this machine, or undefined. search, browser and the fetch fallback all need it.
export function windowProblem(o: {
  browserRuns: boolean;
  platform: NodeJS.Platform;
  display: boolean;
  xvfb: boolean;
}): string | undefined {
  if (!o.browserRuns)
    return "web-mcp's browser window can't open: no browser it can use. search, browser and the fetch fallback won't work until you run agent-browser install, or install Helium or Chromium.";
  if (o.platform === 'linux' && !o.display && !o.xvfb)
    return "web-mcp's browser window can't open: this Linux has no display and no Xvfb. search, browser and the fetch fallback won't work until you install Xvfb or run Claude Code in a desktop session.";
  return undefined;
}

// agent-browser's own release binaries (statically linked musl on Linux, so NixOS runs it), keyed like BIN_TARGETS.
export const AGENT_BROWSER_FILES: Record<string, string> = {
  'win32-x64': 'agent-browser-win32-x64.exe',
  'linux-x64': 'agent-browser-linux-musl-x64',
};

// The upstream binary for pin (tools/installer/assets/agent-browser.json) on this machine, checked against the pin's sha256, or
// undefined where there is no build or no pinned hash.
export function agentBrowserAsset(platform: string, arch: string, pin: UpstreamPin) {
  const key = `${platform}-${arch}`;
  const [file, digest] = [AGENT_BROWSER_FILES[key], pin.sha256?.[key]];
  if (!file || !semver(pin.upstream) || !/^[0-9a-f]{64}$/.test(digest ?? '')) return undefined;
  const url = `https://github.com/vercel-labs/agent-browser/releases/download/v${pin.upstream}/${file}`;
  return { file, url, digest, raw: true, exe: platform === 'win32' ? 'agent-browser.exe' : 'agent-browser' };
}

// uv's own release archives (musl on Linux, so NixOS runs it), keyed like BIN_TARGETS. inner: the binary's path in the archive.
export const UV_FILES: Record<string, { file: string; inner: string }> = {
  'win32-x64': { file: 'uv-x86_64-pc-windows-msvc.zip', inner: 'uv.exe' },
  'linux-x64': {
    file: 'uv-x86_64-unknown-linux-musl.tar.gz',
    inner: 'uv-x86_64-unknown-linux-musl/uv',
  },
};

// The upstream archive for pin (tools/installer/assets/uv.json) on this machine, checked against the pin's sha256, or
// undefined where there is no build or no pinned hash. exe: the path inside the archive.
export function uvAsset(platform: string, arch: string, pin: UpstreamPin) {
  const key = `${platform}-${arch}`;
  const [entry, digest] = [UV_FILES[key], pin.sha256?.[key]];
  if (!entry || !semver(pin.upstream) || !/^[0-9a-f]{64}$/.test(digest ?? '')) return undefined;
  const url = `https://github.com/astral-sh/uv/releases/download/${pin.upstream}/${entry.file}`;
  return { file: entry.file, url, digest, exe: entry.inner };
}

// Which uv runs: ours in ~/.claude/bin whenever it exists (the plugin's launcher looks there first, so it must stay
// current), else a PATH uv at or above the pin, else a download. ours: its version, undefined when it can't report one.
export const uvPlan = ({
  oursExists,
  ours,
  theirs,
  pinned,
}: {
  oursExists: boolean;
  ours: string | undefined;
  theirs: string | undefined;
  pinned: string;
}) =>
  oursExists
    ? { use: 'ours', download: ours ? upstreamAction({ installed: ours, pinned }) : 'upgrade' }
    : upstreamPlan({ theirs, ours: undefined, pinned });

// `<tool> --version` may print a name prefix ("agent-browser 0.39.1", "uv 0.13.6 (…)"); undefined when no version is in it.
export const versionIn = (out: string | undefined) => /(\d+\.\d+\.\d+)/.exec(out ?? '')?.[1];

// The newest `chrome-<a>.<b>.<c>.<d>` among a browsers folder's entries, compared numerically (upstream sorts the names
// as strings, where chrome-99 beats chrome-156).
export const newestChromeForTesting = (entries: string[]) =>
  entries
    .map((e) => ({ e, v: /^chrome-(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(e)?.slice(1).map(Number) }))
    .filter((x): x is { e: string; v: number[] } => !!x.v)
    .sort((a, b) => a.v.reduce((d, n, i) => d || n - b.v[i]!, 0))
    .at(-1)?.e;
