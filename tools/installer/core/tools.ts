// The tools the installer provisions, described in assets/tools.json, and what to do about each on this machine.
import { readFileSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import { RELEASES, newer, semver } from './release.ts';

// Our own build for the installer's version, built per platform by .github/workflows/crates-build.yml and attached to the
// vX.Y.Z release by release.yml. plugin: the plugin that uses it; key: that plugin's userConfig key for its path.
interface ReleaseTool {
  source: 'release';
  plugin: string;
  key: string;
}
// An upstream GitHub release, pinned by version and sha256 (kept current by tools/upstream-sync). raw: the file is the
// binary, not an archive; inner: the binary's path in the archive.
interface GithubTool {
  source: 'github';
  repo: string;
  tagPrefix: string;
  version: string;
  raw?: boolean;
  files: Record<string, { file: string; inner?: string; sha256: string }>;
}
// A Python package that `uv tool install --upgrade` installs, unpinned. extras: comma-separated.
interface PypiTool {
  source: 'pypi';
  package: string;
  extras: string;
}
export type Tool = ReleaseTool | GithubTool | PypiTool;

// What to download for a tool on this machine. sha256: the URL of the checksum file beside a release asset; digest: a
// pinned hex hash. exe: the binary's path in the archive, or its file name when raw.
export interface Asset {
  file: string;
  url: string;
  exe: string;
  sha256?: string;
  digest?: string;
  raw?: boolean;
}

// Windows and Linux x64 only: no macOS or ARM builds.
export const TOOLS: { targets: Record<string, string>; tools: Record<string, Tool> } = JSON.parse(
  readFileSync(new URL('../assets/tools.json', import.meta.url), 'utf8'),
);

const exeName = (name: string, platform: string) => (platform === 'win32' ? `${name}.exe` : name);

// The archive (or raw binary) of tool `name` for this machine, or undefined where there is none: no build for the
// platform, an unpinned hash or a version that is not x.y.z. version: the installer's, which only `release` tools use.
export function resolveTool(
  name: string,
  platform: string,
  arch: string,
  version: string,
  tools = TOOLS,
): Asset | undefined {
  const key = `${platform}-${arch}`;
  const tool = tools.tools[name];
  if (tool?.source === 'release') {
    const target = tools.targets[key];
    if (!target) return undefined;
    const file = `${name}-${target}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
    const url = `${RELEASES}/v${version}/${file}`;
    return { file, url, sha256: `${url}.sha256`, exe: exeName(name, platform) };
  }
  if (tool?.source === 'github') {
    const entry = tool.files[key];
    if (!entry || !semver(tool.version) || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) return undefined;
    const url = `https://github.com/${tool.repo}/releases/download/${tool.tagPrefix}${tool.version}/${entry.file}`;
    return {
      file: entry.file,
      url,
      digest: entry.sha256,
      exe: entry.inner ?? exeName(name, platform),
      ...(tool.raw && { raw: true }),
    };
  }
  return undefined;
}

// What to do about the copy in ~/.claude/bin: `keep` it when it is equal or newer than the pin, `download` it when it is
// missing or older, or `unsupported` when that is needed but no build exists for this machine.
// installed: the version our copy reports, or undefined when there is none.
export function planTool({
  installed,
  pinned,
  supported,
}: {
  installed: string | undefined;
  pinned: string;
  supported: boolean;
}) {
  if (installed === pinned || newer(installed, pinned)) return 'keep';
  return supported ? 'download' : 'unsupported';
}

// Where tool `name` goes in binDir on `platform`: loose, never at the archive's inner path.
export const toolPath = (binDir: string, name: string, platform: string) =>
  platform === 'win32' ? win32.join(binDir, exeName(name, platform)) : posix.join(binDir, name);

const releaseTool = (name: string) => {
  const tool = TOOLS.tools[name];
  if (tool?.source !== 'release') throw new Error(`${name} is not a release tool`);
  return tool;
};

// What to do when the release tool `name` couldn't be installed.
export const toolAdvice = (name: string) =>
  `build it from the repository root with \`cargo build --release --locked -p ${name} --bin ${name}\` (output: target/release) and set its path with /plugin configure ${releaseTool(name).plugin}`;

// The release tool `plugin` uses, as [name, entry].
export function toolOfPlugin(plugin: string): [string, ReleaseTool] {
  const found = Object.entries(TOOLS.tools).find(([, t]) => t.source === 'release' && t.plugin === plugin);
  if (!found) throw new Error(`no release tool for plugin ${plugin}`);
  return found as [string, ReleaseTool];
}

// The argument `uv tool install` takes for the pypi tool `name`, unquoted as no shell is involved.
export function pypiSpec(name: string) {
  const tool = TOOLS.tools[name];
  if (tool?.source !== 'pypi') throw new Error(`${name} is not a pypi tool`);
  return `${tool.package}[${tool.extras}]`;
}
