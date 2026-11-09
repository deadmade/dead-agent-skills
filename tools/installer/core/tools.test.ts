import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS, planTool, pypiSpec, resolveTool, toolAdvice, toolOfPlugin, toolPath } from './tools.ts';

const text = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const json = (p: string) => JSON.parse(text(p));

const releaseTools = () => Object.entries(TOOLS.tools).filter(([, t]) => t.source === 'release');

test('release tool: the archive built for this machine, hash from the .sha256 beside it', () => {
  const win = resolveTool('web-mcp', 'win32', 'x64', '1.2.3')!;
  assert.equal(
    win.url,
    'https://github.com/deadmade/dead-agent-skills/releases/download/v1.2.3/web-mcp-x86_64-pc-windows-msvc.zip',
  );
  assert.equal(win.file, 'web-mcp-x86_64-pc-windows-msvc.zip');
  assert.equal(win.sha256, `${win.url}.sha256`);
  assert.equal(win.exe, 'web-mcp.exe');
  const linux = resolveTool('ado-mcp', 'linux', 'x64', '1.0.0')!;
  assert.equal(linux.file, 'ado-mcp-x86_64-unknown-linux-musl.tar.gz');
  assert.equal(linux.exe, 'ado-mcp');
  assert.equal(linux.digest, undefined);
});

test('release tool: no asset where no build exists', () => {
  for (const [platform, arch] of [
    ['darwin', 'arm64'],
    ['linux', 'ia32'],
    ['freebsd', 'x64'],
  ])
    assert.equal(resolveTool('web-mcp', platform, arch, '1.0.0'), undefined, `no build for ${platform}-${arch}`);
});

test('github tool: the pinned archive, url derived from repo, prefix and version, only with a sha256 for the platform', () => {
  const uv = TOOLS.tools.uv as Extract<(typeof TOOLS.tools)[string], { source: 'github' }>;
  const ab = TOOLS.tools['agent-browser'] as typeof uv;
  const uvWin = resolveTool('uv', 'win32', 'x64', '9.9.9')!;
  assert.deepEqual(uvWin, {
    file: 'uv-x86_64-pc-windows-msvc.zip',
    url: `https://github.com/astral-sh/uv/releases/download/${uv.version}/uv-x86_64-pc-windows-msvc.zip`,
    digest: uv.files['win32-x64'].sha256,
    exe: 'uv.exe',
  });
  assert.equal(resolveTool('uv', 'linux', 'x64', '9.9.9')!.exe, 'uv-x86_64-unknown-linux-musl/uv');
  const linux = resolveTool('agent-browser', 'linux', 'x64', '9.9.9')!;
  assert.equal(
    linux.url,
    `https://github.com/vercel-labs/agent-browser/releases/download/v${ab.version}/agent-browser-linux-musl-x64`,
  );
  assert.equal(linux.digest, ab.files['linux-x64'].sha256);
  assert.equal(linux.raw, true);
  assert.equal(resolveTool('agent-browser', 'win32', 'x64', '9.9.9')!.exe, 'agent-browser.exe');
  assert.equal(resolveTool('uv', 'darwin', 'arm64', '9.9.9'), undefined);

  const clone = () => structuredClone(TOOLS);
  const noHash = clone();
  (noHash.tools.uv as typeof uv).files['linux-x64'].sha256 = '';
  assert.equal(resolveTool('uv', 'linux', 'x64', '9.9.9', noHash), undefined);
  const badVersion = clone();
  (badVersion.tools.uv as typeof uv).version = '0.13; rm';
  assert.equal(resolveTool('uv', 'linux', 'x64', '9.9.9', badVersion), undefined);
});

test('planTool: missing or older downloads, equal or newer keeps, no build is unsupported', () => {
  const pinned = '0.39.1';
  const plan = (installed: string | undefined, supported: boolean) => planTool({ installed, pinned, supported });
  assert.equal(plan(undefined, true), 'download');
  assert.equal(plan('0.38.0', true), 'download');
  assert.equal(plan('0.39.1', true), 'keep');
  assert.equal(plan('99.0.0', true), 'keep');
  assert.equal(plan(undefined, false), 'unsupported');
  assert.equal(plan('0.38.0', false), 'unsupported');
  assert.equal(plan('0.39.1', false), 'keep');
  assert.equal(plan('99.0.0', false), 'keep');
});

test('toolPath: uv lands at <binDir>/uv', () => {
  assert.equal(toolPath('/h/.claude/bin', 'uv', 'linux'), '/h/.claude/bin/uv');
  assert.equal(toolPath('C:\\Users\\u\\.claude\\bin', 'uv', 'win32'), 'C:\\Users\\u\\.claude\\bin\\uv.exe');
  assert.equal(toolPath('/h/.claude/bin', 'web-mcp', 'linux'), '/h/.claude/bin/web-mcp');
});

test('toolAdvice, toolOfPlugin and pypiSpec', () => {
  assert.match(toolAdvice('web-mcp'), /cargo build --release --locked -p web-mcp --bin web-mcp/);
  assert.match(toolAdvice('ado-mcp'), /\/plugin configure mcp-azure/);
  assert.deepEqual(toolOfPlugin('mcp-azure'), ['ado-mcp', { source: 'release', plugin: 'mcp-azure', key: 'binPath' }]);
  assert.equal(pypiSpec('graphify'), 'graphifyy[sql,pdf,office,watch,leiden]');
});

// The installer downloads the name crates-build.yml uploads: the same target and the same file name.
test('crates-build.yml packs the archive names resolveTool builds', () => {
  const yml = text('.github/workflows/crates-build.yml').replace(/\r\n/g, '\n');
  const matrix = yml.split('        platform:\n')[1].split('    runs-on:')[0];
  const pack = yml.split('      - name: Package\n')[1];
  for (const [name] of releaseTools())
    for (const platform of ['win32', 'linux']) {
      const file = resolveTool(name, platform, 'x64', '1.2.3')!.file;
      const [, target, archive] = /^.+?-(x86_64-.+)\.(zip|tar\.gz)$/.exec(file)!;
      assert.ok(matrix.includes(`target: ${target}, archive: ${archive}`), file);
      assert.ok(pack.includes(`"$RUNNER_TEMP/dist/$name.${archive}"`), file);
    }
  assert.match(pack, /name=\$CRATE-\$TARGET/);
  assert.match(pack, /sha256sum "\$f" > "\$f\.sha256"/);
});

test("each release tool's plugin.json declares its userConfig key", () => {
  for (const [, t] of releaseTools()) {
    const r = t as { plugin: string; key: string };
    assert.ok(
      json(`.claude-plugin/${r.plugin}/.claude-plugin/plugin.json`).userConfig[r.key],
      `${r.plugin} has userConfig ${r.key}`,
    );
  }
});

test('the binaries report the release version the installer fetches', () => {
  const cargo = text('Cargo.toml');
  assert.equal(/^version = "(.+)"/m.exec(cargo)![1], json('package.json').version);
});

test('the shipped manifest is complete', () => {
  const raw = readFileSync(new URL('../assets/tools.json', import.meta.url), 'utf8');
  assert.equal(JSON.stringify(JSON.parse(raw), null, 2) + '\n', raw);
  const platforms = Object.keys(TOOLS.targets);
  for (const [name, t] of Object.entries(TOOLS.tools))
    if (t.source === 'github') {
      assert.match(t.version, /^\d+\.\d+\.\d+$/, name);
      assert.deepEqual(Object.keys(t.files), platforms, name);
      for (const [key, f] of Object.entries(t.files)) assert.match(f.sha256, /^[0-9a-f]{64}$/, `${name} ${key}`);
    }
});
