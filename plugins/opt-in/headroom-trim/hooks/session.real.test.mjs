import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { realTool } from '../../../../scripts/test.mjs';
import { start, startSync } from '../../../../tools/installer/system/proc.ts';

const WIN = process.platform === 'win32';
const built = fileURLToPath(new URL('../../../../.claude-plugin/headroom-trim', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createServer()
      .once('error', reject)
      .listen(0, '127.0.0.1', () => {
        const { port } = s.address();
        s.close(() => resolve(port));
      });
  });

const health = (port) =>
  fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
    .then((r) => r.json())
    .catch(() => undefined);

const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

// The whole tree on Windows, so the python uv started goes too; detached on POSIX, so its group.
const killTree = (pid) => {
  if (WIN)
    startSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/T', '/F', '/PID', pid]);
  else
    try {
      process.kill(-Number(pid), 'SIGKILL');
    } catch {}
};

test('the trim server outlives the SessionStart hook', { timeout: 300_000 }, async (t) => {
  const config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const claude = realTool(t, 'claude');
  const uv = realTool(t, 'uv', { candidates: [join(config, 'bin', WIN ? 'uv.exe' : 'uv')] });
  if (!claude || !uv) return;

  const root = mkdtempSync(join(tmpdir(), 'ht-real-'));
  const copy = join(root, 'headroom-trim');
  const home = join(root, 'config');
  const data = join(home, 'plugins', 'data', 'headroom-trim-inline');
  let port;
  // Harmless when nothing started: a refused POST, a kill of no process.
  t.after(async () => {
    await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST', signal: AbortSignal.timeout(1000) }).catch(
      () => {},
    );
    for (const [, pid] of read(join(data, 'launcher.log')).matchAll(/ pid (\d+)/g)) killTree(pid);
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 10 });
    } catch {}
  });
  cpSync(built, copy, { recursive: true });
  port = await freePort();
  const hooks = join(copy, 'hooks', 'hooks.json');
  writeFileSync(hooks, readFileSync(hooks, 'utf8').replaceAll('47811', String(port)));
  for (const f of readdirSync(copy, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()))
    assert.ok(!read(join(f.parentPath, f.name)).includes('47811'), `${f.name} still names the developer's port`);

  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const child = start(claude, ['-p', 'hi', '--plugin-dir', copy], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: home, [pathKey]: `${dirname(uv)}${delimiter}${process.env[pathKey]}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let said = '';
  child.stdout.on('data', (d) => (said += d));
  child.stderr.on('data', (d) => (said += d));
  // Its exit code is not asserted: without a login it exits 1, after the hook ran.
  await new Promise((resolve, reject) => child.once('error', reject).once('exit', resolve));

  let h;
  for (const end = Date.now() + 240_000; !(h = await health(port))?.ok && Date.now() < end;) await sleep(500);
  assert.equal(h?.ok, true, `no answer on /health\nclaude: ${said}\nlauncher.log: ${read(join(data, 'launcher.log'))}`);
  await sleep(5000);
  assert.equal((await health(port))?.ok, true, `the server died after answering\n${read(join(data, 'server.log'))}`);
});
