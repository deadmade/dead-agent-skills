// What install.real.test.ts can't reach: a declined download, a download that fails and a platform with no build.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VERSION, done, failures } from '../context.ts';
import { toolAdvice } from '../core/tools.ts';
import { ensureTool } from './tools.ts';

const io = { binDir: '/bin-dir', platform: 'linux', arch: 'x64' };

beforeEach(() => {
  done.length = 0;
  failures.length = 0;
});

test('a release tool whose download throws: undefined and one failure line with the build advice', async () => {
  // fake: a real release download fails only when the network or the release does, which no test can arrange.
  const download = async () => {
    throw new Error('network down');
  };
  assert.equal(await ensureTool('web-mcp', { ...io, download }), undefined);
  assert.deepEqual(failures, [`web-mcp ${VERSION}: network down; ${toolAdvice('web-mcp')}`]);
  assert.deepEqual(done, []);
});

test('a github tool whose download prompt is declined: no download, undefined and one failure line', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tools-decline-'));
  const answers = join(dir, 'answers.json');
  writeFileSync(answers, JSON.stringify({ chosen: {}, prompts: { 'Download uv': false } }));
  process.env.DEAD_SKILLS_TEST_ANSWERS = answers;
  t.after(() => {
    delete process.env.DEAD_SKILLS_TEST_ANSWERS;
    rmSync(dir, { recursive: true, force: true });
  });
  const download = async () => assert.fail('downloaded after the prompt was declined');
  assert.equal(await ensureTool('uv', { ...io, binDir: dir, download }), undefined);
  assert.deepEqual(failures, ['uv: install skipped by you']);
  assert.deepEqual(done, []);
});

test('no build for this platform: undefined and one failure line', async () => {
  // fake: Windows and Linux runners can't be darwin.
  const darwin = { ...io, platform: 'darwin', arch: 'arm64', off: 'stays off' };
  assert.equal(await ensureTool('uv', darwin), undefined);
  assert.equal(await ensureTool('web-mcp', darwin), undefined);
  assert.deepEqual(failures, [
    'uv: no pinned build for darwin-arm64 in tools/installer/assets/tools.json; stays off',
    `web-mcp: no release build for darwin-arm64; ${toolAdvice('web-mcp')}; stays off`,
  ]);
});
