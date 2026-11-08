import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  graphifyToolArgs,
  missingBinaries,
  newestChromeForTesting,
  upstreamAction,
  agentBrowserAsset,
  upstreamPlan,
  versionIn,
  uvAsset,
  uvPlan,
  windowProblem,
  BIN_PLUGINS,
  binAsset,
  sha256Of,
  sha256Matches,
  binAction,
  binAdvice,
  binPath,
} from './binaries.ts';
import { unavailable } from './options.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8'));

test('missing binaries per OS', () => {
  const none = () => false;
  assert.ok(!missingBinaries('linux', ['dead-skills'], none).some((r) => r.binary === 'nixd'));
  const win = missingBinaries('win32', ['nix-lsp'], none);
  assert.ok(win.some((r) => r.binary === 'nixd' && /deselect/.test(r.command)));
  const nix = missingBinaries('linux', ['nix-lsp', 'graphify'], none);
  assert.ok(nix.some((r) => r.binary === 'nixd' && /nixd/.test(r.command)));
  assert.ok(nix.some((r) => r.binary === 'graphify'));
  assert.deepEqual(
    missingBinaries('linux', ['dead-skills'], () => true),
    [],
  );
});

test('web-mcp downloads the release archive built for this machine', () => {
  const win = binAsset('web-mcp', 'win32', 'x64', '1.2.3')!;
  assert.equal(
    win.url,
    'https://github.com/deadmade/dead-agent-skills/releases/download/v1.2.3/web-mcp-x86_64-pc-windows-msvc.zip',
  );
  assert.equal(win.sha256, `${win.url}.sha256`);
  assert.equal(win.exe, 'web-mcp.exe');
  assert.equal(binAsset('web-mcp', 'linux', 'x64', '1.0.0')!.file, 'web-mcp-x86_64-unknown-linux-musl.tar.gz');
  for (const [platform, arch] of [
    ['linux', 'arm64'],
    ['darwin', 'arm64'],
    ['darwin', 'x64'],
    ['win32', 'arm64'],
  ])
    assert.equal(binAsset('web-mcp', platform, arch, '1.0.0'), undefined, `no build for ${platform}-${arch}`);
  assert.equal(binAsset('web-mcp', 'freebsd', 'x64', '1.0.0'), undefined);
});

test('web-mcp downloads its own archive, and each plugin is configured under its own key', () => {
  const t = {
    'win32-x64': 'x86_64-pc-windows-msvc',
    'linux-x64': 'x86_64-unknown-linux-musl',
  };
  for (const [k, target] of Object.entries(t)) {
    const [platform, arch] = k.split('-');
    for (const name of ['web-mcp', 'ado-mcp']) {
      const a = binAsset(name, platform, arch, '1.2.3')!;
      assert.equal(a.file, `${name}-${target}.${platform === 'win32' ? 'zip' : 'tar.gz'}`);
      assert.equal(a.exe, name + (platform === 'win32' ? '.exe' : ''));
    }
  }
  assert.equal(binAsset('web-mcp', 'linux', 'ia32', '1.0.0'), undefined);
  assert.deepEqual(BIN_PLUGINS['web-mcp'], { name: 'web-mcp', key: 'binPath' });
  const dirs: Record<string, string> = {
    'web-mcp': '.claude-plugin/web-mcp',
    'mcp-azure': '.claude-plugin/mcp-azure',
    'flow-cockpit': '.claude-plugin/flow-cockpit',
  };
  for (const [plugin, { key }] of Object.entries(BIN_PLUGINS))
    assert.ok(json(`${dirs[plugin]}/.claude-plugin/plugin.json`).userConfig[key], `${plugin} has userConfig ${key}`);
  assert.match(unavailable('web-mcp', 'linux', 'ia32', '1.0.0')!, /no web-mcp build for linux-ia32/);
  assert.equal(unavailable('web-mcp', 'linux', 'x64', '1.0.0'), undefined);
  assert.match(unavailable('web-mcp', 'darwin', 'arm64', '1.0.0')!, /no web-mcp build for darwin-arm64/);
});

test('binAsset gives the Windows zip for flow-cockpit', () => {
  const win = binAsset('flow-cockpit', 'win32', 'x64', '1.2.3')!;
  assert.equal(
    win.url,
    'https://github.com/deadmade/dead-agent-skills/releases/download/v1.2.3/flow-cockpit-x86_64-pc-windows-msvc.zip',
  );
  assert.equal(win.sha256, `${win.url}.sha256`);
  assert.equal(win.exe, 'flow-cockpit.exe');
  // The zip holds the exe and its default extensions, so it goes into a folder of its own.
  assert.equal(win.folder, true);
  assert.equal(binAsset('web-mcp', 'win32', 'x64', '1.2.3')!.folder, false);
  assert.equal(BIN_PLUGINS['flow-cockpit'].key, 'appPath');
});

test('binAsset has no linux asset for flow-cockpit', () => {
  assert.equal(binAsset('flow-cockpit', 'linux', 'x64', '1.2.3'), undefined);
  assert.equal(binAsset('flow-cockpit', 'win32', 'arm64', '1.2.3'), undefined);
  assert.equal(binAsset('flow-cockpit', 'darwin', 'arm64', '1.2.3'), undefined);
});

test('flow-cockpit has a pinned linux hint', () => {
  const hint = BIN_PLUGINS['flow-cockpit'].linuxHint!('1.2.3');
  assert.match(hint, /nix run github:deadmade\/dead-agent-skills\/v1\.2\.3#flow-cockpit/);
  assert.equal(BIN_PLUGINS['web-mcp'].linuxHint, undefined);
});

// The hint names the flake's package: the output the installer points Linux users at must exist.
test('the flake has the flow-cockpit package the linux hint runs', () => {
  const flake = readFileSync(new URL('../../../flake.nix', import.meta.url), 'utf8');
  assert.match(flake, /^\s+flow-cockpit = pkgs\.rustPlatform\.buildRustPackage/m);
});

// The installer downloads the name crates-build.yml uploads: the same target and the same file name.
test('crates-build.yml packs the zip binAsset downloads', () => {
  const yml = readFileSync(new URL('../../../.github/workflows/crates-build.yml', import.meta.url), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const matrix = yml.split('        platform:\n')[1].split('        exclude:')[0];
  const pack = yml.split('      - name: Package\n')[1].split('      - name: Package cockpit')[0];
  for (const platform of ['win32', 'linux']) {
    const file = binAsset('web-mcp', platform, 'x64', '1.2.3')!.file;
    const [, target, archive] = /^web-mcp-(.+)\.(zip|tar\.gz)$/.exec(file)!;
    assert.ok(matrix.includes(`target: ${target}, archive: ${archive}`), file);
    assert.ok(pack.includes(`"$RUNNER_TEMP/dist/$name.${archive}"`), file);
  }
  assert.match(pack, /name=\$CRATE-\$TARGET/);
  assert.match(pack, /sha256sum "\$f" > "\$f\.sha256"/);
  assert.match(yml, /if: matrix\.crate == 'flow-cockpit'/);
  assert.match(yml, /target: x86_64-pc-windows-msvc/);
  assert.match(yml, /name=flow-cockpit-\$TARGET/);
  assert.match(yml, /"\$RUNNER_TEMP\/dist\/\$name\.zip"/);
  assert.equal('flow-cockpit-x86_64-pc-windows-msvc.zip', binAsset('flow-cockpit', 'win32', 'x64', '1.2.3')!.file);
});

test('binPath: the flow cockpit in a folder of its own, the others loose in bin', () => {
  const win = 'C:\\Users\\u\\.claude\\bin';
  assert.equal(binPath(win, 'flow-cockpit', 'win32'), 'C:\\Users\\u\\.claude\\bin\\flow-cockpit\\flow-cockpit.exe');
  assert.equal(binPath(win, 'web-mcp', 'win32'), 'C:\\Users\\u\\.claude\\bin\\web-mcp.exe');
  assert.equal(binPath('/h/.claude/bin', 'web-mcp', 'linux'), '/h/.claude/bin/web-mcp');
});

// A flow cockpit install that fails is most likely its open window holding the folder; building it by hand doesn't
// bring the default extensions along.
test('binAdvice: rerun for the flow cockpit, build for the others', () => {
  assert.match(binAdvice('flow-cockpit'), /close flow-cockpit if it is open and run the installer again/);
  assert.doesNotMatch(binAdvice('flow-cockpit'), /cargo/);
  assert.match(binAdvice('web-mcp'), /cargo build --release --locked -p web-mcp --bin web-mcp/);
});

test('the binaries report the release version the installer fetches', () => {
  const cargo = readFileSync(new URL('../../../Cargo.toml', import.meta.url), 'utf8');
  assert.equal(/^version = "(.+)"/m.exec(cargo)![1], json('package.json').version);
});

test('checksum lines and what to do about a binary', () => {
  const hex = 'AB'.repeat(32);
  assert.equal(sha256Of(`${hex}  web-mcp-x.tar.gz\n`), hex.toLowerCase());
  assert.equal(sha256Of(`${hex}`), hex.toLowerCase());
  assert.equal(sha256Of('Not Found'), undefined);
  assert.equal(sha256Of(`${hex}ff  x`), undefined);
  // sha256('abc'), the FIPS 180-2 test vector.
  const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  assert.ok(sha256Matches(Buffer.from('abc'), abc));
  assert.ok(!sha256Matches(Buffer.from('abd'), abc));
  assert.ok(!sha256Matches(Buffer.from('abc'), undefined));
  const at = (o: { onPath?: boolean; installed?: string; supported?: boolean }) =>
    binAction({ onPath: false, installed: undefined, version: '0.2.0', supported: true, ...o });
  assert.equal(at({ onPath: true }), 'skip');
  assert.equal(at({ installed: '0.2.0' }), 'configure');
  assert.equal(at({ installed: '0.1.0' }), 'download');
  assert.equal(at({}), 'download');
  assert.equal(at({ supported: false }), 'unsupported');
});

test('agent-browser: install when missing, upgrade when older, keep when equal or newer', () => {
  const pinned = '0.39.1';
  assert.equal(upstreamAction({ installed: undefined, pinned }), 'install');
  assert.equal(upstreamAction({ installed: '0.38.0', pinned }), 'upgrade');
  assert.equal(upstreamAction({ installed: '0.39.1', pinned }), 'skip');
  assert.equal(upstreamAction({ installed: '0.40.0', pinned }), 'skip');
  assert.equal(versionIn('agent-browser 0.39.1\n'), '0.39.1');
  assert.equal(versionIn('uv 0.13.6 (abc 2026-01-01)'), '0.13.6');
  assert.equal(versionIn('nope'), undefined);
});

test('uvPlan: ours wins whenever it exists, else a current PATH uv, else download', () => {
  const pinned = '0.13.6';
  const plan = (oursExists: boolean, ours?: string, theirs?: string) => uvPlan({ oursExists, ours, theirs, pinned });
  assert.deepEqual(plan(true, '0.13.6', '0.14.0'), { use: 'ours', download: 'skip' });
  assert.deepEqual(plan(true, '0.13.6'), { use: 'ours', download: 'skip' });
  assert.deepEqual(plan(true, '0.12.0', '0.14.0'), { use: 'ours', download: 'upgrade' });
  assert.deepEqual(plan(true, undefined, '0.14.0'), { use: 'ours', download: 'upgrade' }, 'ours is there but broken');
  assert.deepEqual(plan(false, undefined, '0.13.6'), { use: 'path' });
  assert.deepEqual(plan(false, undefined, '0.14.0'), { use: 'path' });
  assert.deepEqual(plan(false, undefined, '0.12.0'), { use: 'ours', download: 'install' });
  assert.deepEqual(plan(false), { use: 'ours', download: 'install' });
});

test('agent-browser: the pinned upstream binary, only with a pinned hash', () => {
  const pin = JSON.parse(readFileSync(new URL('../assets/agent-browser.json', import.meta.url), 'utf8'));
  const linux = agentBrowserAsset('linux', 'x64', pin)!;
  assert.equal(
    linux.url,
    `https://github.com/vercel-labs/agent-browser/releases/download/v${pin.upstream}/agent-browser-linux-musl-x64`,
  );
  assert.equal(linux.digest, pin.sha256['linux-x64']);
  assert.equal(agentBrowserAsset('win32', 'x64', pin)!.exe, 'agent-browser.exe');
  assert.equal(agentBrowserAsset('darwin', 'arm64', pin), undefined);
  assert.equal(agentBrowserAsset('linux', 'x64', { ...pin, sha256: {} }), undefined);
  assert.equal(agentBrowserAsset('linux', 'x64', { ...pin, upstream: '1.0; rm' }), undefined);
  assert.ok(!missingBinaries('linux', ['web-mcp'], () => false).some((r) => r.binary === 'agent-browser'));
});

test('uv: the pinned upstream archive, only with a valid pin', () => {
  const pin = { upstream: '0.13.6', sha256: { 'win32-x64': 'a'.repeat(64), 'linux-x64': 'b'.repeat(64) } };
  const base = 'https://github.com/astral-sh/uv/releases/download/0.13.6';
  assert.deepEqual(uvAsset('win32', 'x64', pin), {
    file: 'uv-x86_64-pc-windows-msvc.zip',
    url: `${base}/uv-x86_64-pc-windows-msvc.zip`,
    digest: 'a'.repeat(64),
    exe: 'uv.exe',
  });
  assert.deepEqual(uvAsset('linux', 'x64', pin), {
    file: 'uv-x86_64-unknown-linux-musl.tar.gz',
    url: `${base}/uv-x86_64-unknown-linux-musl.tar.gz`,
    digest: 'b'.repeat(64),
    exe: 'uv-x86_64-unknown-linux-musl/uv',
  });
  assert.equal(uvAsset('darwin', 'arm64', pin), undefined);
  assert.equal(uvAsset('linux', 'x64', { ...pin, upstream: '0.13; rm' }), undefined);
  assert.equal(uvAsset('linux', 'x64', { ...pin, sha256: {} }), undefined);
  assert.ok(!missingBinaries('linux', ['headroom-trim'], () => false).some((r) => r.binary === 'uv'));
  const shipped = JSON.parse(readFileSync(new URL('../assets/uv.json', import.meta.url), 'utf8'));
  assert.ok(uvAsset('win32', 'x64', shipped) && uvAsset('linux', 'x64', shipped));
});

test('agent-browser plan: a current PATH copy wins, else ours, downloaded only when missing or older', () => {
  const pinned = '0.39.1';
  assert.deepEqual(upstreamPlan({ theirs: '0.39.1', ours: undefined, pinned }), { use: 'path' });
  assert.deepEqual(upstreamPlan({ theirs: '0.40.0', ours: '0.38.0', pinned }), { use: 'path' });
  assert.deepEqual(upstreamPlan({ theirs: '0.38.0', ours: '0.39.1', pinned }), { use: 'ours', download: 'skip' });
  assert.deepEqual(upstreamPlan({ theirs: undefined, ours: undefined, pinned }), {
    use: 'ours',
    download: 'install',
  });
  assert.deepEqual(upstreamPlan({ theirs: undefined, ours: '0.38.0', pinned }), {
    use: 'ours',
    download: 'upgrade',
  });
});

test('newestChromeForTesting picks the newest version', () => {
  assert.equal(
    newestChromeForTesting(['chrome-99.0.1.2', 'chrome-156.0.7.1', 'chrome-156.0.10.1', 'notes', 'chrome-1.2.3']),
    'chrome-156.0.10.1',
  );
  assert.equal(newestChromeForTesting(['x', 'chrome-1.2.3']), undefined);
  assert.equal(newestChromeForTesting([]), undefined);
});

test('windowProblem: no browser, no display on Linux, and the cases that are fine', () => {
  const ok = { browserRuns: true, platform: 'linux' as const, display: false, xvfb: false };
  assert.equal(
    windowProblem({ ...ok, browserRuns: false }),
    "web-mcp's browser window can't open: no browser it can use. search, browser and the fetch fallback won't work until you run agent-browser install, or install Helium or Chromium.",
  );
  assert.equal(
    windowProblem(ok),
    "web-mcp's browser window can't open: this Linux has no display and no Xvfb. search, browser and the fetch fallback won't work until you install Xvfb or run Claude Code in a desktop session.",
  );
  assert.equal(windowProblem({ ...ok, display: true }), undefined);
  assert.equal(windowProblem({ ...ok, xvfb: true }), undefined);
  assert.equal(windowProblem({ ...ok, platform: 'win32' }), undefined);
});

test('graphify installs with its extras through uv tool install', () => {
  assert.deepEqual(graphifyToolArgs(), ['tool', 'install', '--upgrade', 'graphifyy[sql,pdf,office,watch,leiden]']);
  const r = missingBinaries('win32', ['graphify'], () => false).find((m) => m.binary === 'graphify');
  assert.equal(r?.command, 'uv tool install "graphifyy[sql,pdf,office,watch,leiden]"');
});
