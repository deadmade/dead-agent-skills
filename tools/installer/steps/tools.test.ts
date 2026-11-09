import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, done, failures } from '../context.ts';
import { TOOLS, toolAdvice, toolPath } from '../core/tools.ts';
import { ensureTool, type ToolIo } from './tools.ts';

const pinned = (TOOLS.tools.uv as { version: string }).version;
const binDir = '/bin-dir';
const uvPath = toolPath(binDir, 'uv', 'linux');

beforeEach(() => {
  done.length = 0;
  failures.length = 0;
});

// Records the prompts and downloads; our copy in binDir reports `ours`, any other copy 99.0.0.
function io(ours: string | undefined, answer = true) {
  const asked: string[] = [];
  const downloaded: string[] = [];
  const fake: ToolIo = {
    ask: async (q) => (asked.push(q), answer),
    download: async (name, _asset, bin) => void downloaded.push(`${name} ${bin}`),
    version: (bin) => (bin.startsWith(binDir) ? ours : '99.0.0'),
    binDir,
    platform: 'linux',
    arch: 'x64',
  };
  return { asked, downloaded, fake };
}

test('a github tool that is missing: asks once, downloads, returns the path with changed true', async () => {
  const t = io(undefined);
  assert.deepEqual(await ensureTool('uv', t.fake), { path: uvPath, changed: true });
  assert.deepEqual(t.asked, [`Download uv ${pinned} (upstream's release binary) to ${uvPath}?`]);
  assert.deepEqual(t.downloaded, [`uv ${uvPath}`]);
  assert.deepEqual(done, [`uv: installed ${pinned} at ${uvPath}`]);
  assert.deepEqual(failures, []);
});

test('a github tool older than the pin is upgraded', async () => {
  const t = io('0.0.1');
  assert.equal((await ensureTool('uv', t.fake))?.changed, true);
  assert.deepEqual(done, [`uv: upgraded to ${pinned} at ${uvPath}`]);
});

test('a declined prompt: no download, undefined, one failure line ending in io.off', async () => {
  const t = io(undefined, false);
  assert.equal(await ensureTool('uv', { ...t.fake, off: 'graphify stays as it is' }), undefined);
  assert.deepEqual(t.downloaded, []);
  assert.deepEqual(failures, ['uv: install skipped by you; graphify stays as it is']);
});

test('ours at or above the pin: no prompt, no download, changed false', async () => {
  for (const ours of [pinned, '99.0.0']) {
    const t = io(ours);
    assert.deepEqual(await ensureTool('uv', t.fake), { path: uvPath, changed: false });
    assert.deepEqual([t.asked, t.downloaded, done, failures], [[], [], [], []]);
  }
});

test('ours missing downloads whatever else is installed elsewhere', async () => {
  const t = io(undefined); // version() reports 99.0.0 for every path but ours
  assert.equal((await ensureTool('uv', t.fake))?.changed, true);
  assert.equal(t.downloaded.length, 1);
});

test('a release tool downloads without asking', async () => {
  const t = io(undefined);
  t.fake.ask = async () => assert.fail('a release tool is not asked about');
  const path = toolPath(binDir, 'web-mcp', 'linux');
  assert.deepEqual(await ensureTool('web-mcp', t.fake), { path, changed: true });
  assert.deepEqual(t.downloaded, [`web-mcp ${path}`]);
  assert.deepEqual(done, [`web-mcp: installed ${VERSION} at ${path}`]);
});

test('no build for this platform: undefined and one failure line', async () => {
  const t = io(undefined);
  const darwin = { ...t.fake, platform: 'darwin', arch: 'arm64', off: 'stays off' };
  assert.equal(await ensureTool('uv', darwin), undefined);
  assert.equal(await ensureTool('web-mcp', darwin), undefined);
  assert.deepEqual(failures, [
    'uv: no pinned build for darwin-arm64 in tools/installer/assets/tools.json; stays off',
    `web-mcp: no release build for darwin-arm64; ${toolAdvice('web-mcp')}; stays off`,
  ]);
  assert.deepEqual([t.asked, t.downloaded], [[], []]);
});

test('a failed download is one failure line', async () => {
  const t = io(undefined);
  t.fake.download = async () => {
    throw new Error('checksum mismatch');
  };
  assert.equal(await ensureTool('uv', { ...t.fake, off: 'stays off' }), undefined);
  assert.deepEqual(failures, [`uv ${pinned}: checksum mismatch; stays off`]);
});
