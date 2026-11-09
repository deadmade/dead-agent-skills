// The binaries the installer can only ask the user to install, and the checksum and version helpers its downloads use.
import { createHash } from 'node:crypto';
import { BUNDLE } from './plugins.ts';
import { pypiSpec } from './tools.ts';

// [binary, needed for (plugin name), NixOS command, Windows command]
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
  ['graphify', 'graphify', `uv tool install "${pypiSpec('graphify')}"`, `uv tool install "${pypiSpec('graphify')}"`],
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

// The checksum a `sha256sum` line starts with, lowercased; undefined when the text is not one.
export const sha256Of = (text: string) => /^[0-9a-f]{64}(?=\s|$)/i.exec(text.trim())?.[0].toLowerCase();

// Whether bytes hash to want, a lowercase hex sha256 (sha256Of's or a pinned one); never true without want.
export const sha256Matches = (bytes: Buffer, want: string | undefined) =>
  !!want && createHash('sha256').update(bytes).digest('hex') === want;

// Why web-mcp's one browser window can't open on this machine, or undefined. search, browser, rows and the fetch fallback all need it.
export function windowProblem(o: {
  browserRuns: boolean;
  platform: NodeJS.Platform;
  display: boolean;
  xvfb: boolean;
}): string | undefined {
  if (!o.browserRuns)
    return "web-mcp's browser window can't open: no browser it can use. search, browser, rows and the fetch fallback won't work until you run agent-browser install, or install Helium or Chromium.";
  if (o.platform === 'linux' && !o.display && !o.xvfb)
    return "web-mcp's browser window can't open: this Linux has no display and no Xvfb. search, browser, rows and the fetch fallback won't work until you install Xvfb or run Claude Code in a desktop session.";
  return undefined;
}

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
