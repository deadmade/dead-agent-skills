import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { portCopy, realTool } from '../../../../scripts/test.mjs';
import { start, startSync } from '../../../../tools/installer/system/proc.ts';

const WIN = process.platform === 'win32';
const built = fileURLToPath(new URL('../../../../.claude-plugin/headroom-trim', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    startSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/T', '/F', '/PID', pid], {
      timeout: 10_000,
    });
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
  // Only a server that answered /health makes the logged pids its own: after an early death of uv, Windows may have
  // given a pid to an unrelated process.
  let answered = false;
  // Harmless when nothing started: a refused POST, no kill.
  t.after(async () => {
    await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST', signal: AbortSignal.timeout(1000) }).catch(
      () => {},
    );
    if (answered) for (const [, pid] of read(join(data, 'launcher.log')).matchAll(/ pid (\d+)/g)) killTree(pid);
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 10 });
    } catch {}
  });
  port = await portCopy(built, copy);

  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  // No API key, login or parent Claude Code session reaches the nested claude, so it makes no paid call.
  const own = Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC_|CLAUDE)/i.test(k));
  const child = start(claude, ['-p', 'hi', '--plugin-dir', copy], {
    env: {
      ...Object.fromEntries(own),
      CLAUDE_CONFIG_DIR: home,
      [pathKey]: `${dirname(uv)}${delimiter}${process.env[pathKey]}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let said = '';
  child.stdout.on('data', (d) => (said += d));
  child.stderr.on('data', (d) => (said += d));
  // Its exit code is not asserted: without a login it exits 1, after the hook ran.
  await new Promise((resolve, reject) => child.once('error', reject).once('exit', resolve));

  let h;
  for (const end = Date.now() + 240_000; !(h = await health(port))?.ok && Date.now() < end;) await sleep(500);
  answered = h?.ok === true;
  assert.equal(h?.ok, true, `no answer on /health\nclaude: ${said}\nlauncher.log: ${read(join(data, 'launcher.log'))}`);
  await sleep(5000);
  assert.equal((await health(port))?.ok, true, `the server died after answering\n${read(join(data, 'server.log'))}`);
});
