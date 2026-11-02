import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DONE, WAITING, shouldNotify, tmuxFocused, message, notifiers, TMUX_ARGV } from './lib.mjs';

const first = (l) => l[0];
const plain = { pick: first };

test('normalized policy skips continuation, child completion and headless events', () => {
  assert.equal(shouldNotify({ continuation: true, interactive: true }), false);
  assert.equal(shouldNotify({ kind: 'turn.finished', agentId: 'a1', interactive: true }), false);
  assert.equal(shouldNotify({ interactive: false }), false);
  assert.equal(shouldNotify({ kind: 'turn.finished', interactive: true }), true);
  for (const kind of ['permission.requested', 'question.asked'])
    assert.equal(shouldNotify({ kind, agentId: 'a1', interactive: true }), true);
});

test('tmux focus needs active pane, active window and a focused client', () => {
  assert.equal(tmuxFocused('11\nattached,UTF-8\nattached,focused'), true);
  assert.equal(tmuxFocused('11\nattached,UTF-8'), false);
  assert.equal(tmuxFocused('01\nfocused'), false);
  assert.equal(tmuxFocused('10\nfocused'), false);
  assert.equal(tmuxFocused(''), false);
  assert.equal(tmuxFocused('11\nunfocused'), false);
});

test('stop message', () => {
  const input = {
    kind: 'turn.finished',
    cwd: '/home/u/dead-claude-skills',
    detail: '\nAll tests pass.\nDetails',
  };
  assert.deepEqual(message(input, plain), { title: 'dead-claude-skills', status: DONE[0], detail: 'All tests pass.' });
});

test('waiting message', () => {
  const input = { kind: 'notification.received', detail: 'Claude needs your permission to use Bash' };
  assert.deepEqual(
    [message(input, plain).status, message(input, plain).detail],
    [WAITING[0], 'Claude needs your permission to use Bash'],
  );
});

test('question message', () => {
  const ask = (tool_input) => ({ kind: 'question.asked', detail: tool_input.questions?.[0]?.question });
  assert.equal(message(ask({ questions: [{ question: 'Which DB?' }] }), plain).detail, 'Which DB?');
  assert.equal(message(ask({}), plain).detail, '');
});

test('night-city wording', () => {
  assert.equal(message({ kind: 'turn.finished' }, plain).status, DONE[0]);
  assert.equal(message({ kind: 'notification.received', detail: 'x' }, plain).status, WAITING[0]);
  assert.equal(message({ kind: 'question.asked', tool_input: {} }, plain).status, WAITING[0]);
});

test('empty answer gives no detail', () => {
  assert.equal(message({ kind: 'turn.finished' }, plain).detail, '');
  assert.equal(message({ kind: 'turn.finished', detail: '\n\n' }, plain).detail, '');
});

test('truncation keeps whole characters', () => {
  const line = (s) => message({ kind: 'turn.finished', detail: s }, plain).detail;
  const long = line('x'.repeat(300));
  assert.equal([...long].length, 120);
  assert.ok(long.endsWith('…'));
  const emoji = line('x'.repeat(118) + '😀'.repeat(10));
  const lone = emoji.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  assert.ok(!/[\uD800-\uDFFF]/.test(lone));
});

test('linux tries busctl then notify-send and escapes markup', () => {
  const [busctl, notifySend, ...rest] = notifiers(
    'linux',
    { title: 'T', status: 'Done', detail: 'a <b> & c' },
    '/p/icon.png',
  );
  assert.deepEqual(rest, []);
  assert.deepEqual(busctl.argv, [
    'busctl',
    '--user',
    'call',
    '--',
    'org.freedesktop.Notifications',
    '/org/freedesktop/Notifications',
    'org.freedesktop.Notifications',
    'Notify',
    'susssasa{sv}i',
    'Onibi',
    '0',
    '/p/icon.png',
    'T',
    '<b>Done</b>\na &lt;b&gt; &amp; c',
    '0',
    '0',
    '-1',
  ]);
  assert.deepEqual(notifySend.argv, [
    'notify-send',
    '-a',
    'Onibi',
    '-i',
    '/p/icon.png',
    '--',
    'T',
    '<b>Done</b>\na &lt;b&gt; &amp; c',
  ]);
});

test('windows passes text by env, never in the script', () => {
  const list = notifiers('win32', { title: '$(x)', status: 'Done', detail: '"; rm <b>' }, 'C:\\Users\\A B\\icon.png');
  assert.equal(list.length, 1);
  const [{ argv, env }] = list;
  assert.deepEqual(argv.slice(0, 6), [
    'powershell',
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle',
    'Hidden',
    '-Command',
  ]);
  assert.ok(!argv.some((a) => a.includes('$(x)') || a.includes('"; rm <b>')));
  assert.equal(env.NOTIFY_TITLE, '$(x)');
  assert.equal(env.NOTIFY_BODY, 'Done\n"; rm <b>');
  assert.equal(env.NOTIFY_ICON, 'C:\\Users\\A B\\icon.png');
  assert.equal(env.PATH, process.env.PATH);
});

test('no detail leaves the status alone', () => {
  const msg = { title: 'T', status: 'Done', detail: '' };
  assert.equal(notifiers('linux', msg, '/i')[0].argv[13], '<b>Done</b>');
  assert.equal(notifiers('win32', msg, '/i')[0].env.NOTIFY_BODY, 'Done');
});

test('a title starting with a dash is never read as an option', () => {
  const msg = { title: '-u', status: 'Done', detail: '' };
  for (const platform of ['linux']) {
    for (const { argv } of notifiers(platform, msg, '/i')) {
      const at = argv.indexOf('-u');
      assert.ok(argv.indexOf('--') !== -1 && argv.indexOf('--') < at, `${argv[0]}: -- before the title`);
    }
  }
});

test('macOS and unknown platforms give nothing', () => {
  for (const platform of ['darwin', 'aix'])
    assert.deepEqual(notifiers(platform, { title: 'T', status: 'S', detail: 'D' }, '/p/icon.png'), []);
});

test('tmux is asked for our pane and every client of its session', () => {
  assert.deepEqual(TMUX_ARGV('%3'), [
    'tmux',
    'display-message',
    '-p',
    '-t',
    '%3',
    '#{pane_active}#{window_active}',
    ';',
    'list-clients',
    '-t',
    '%3',
    '-F',
    '#{client_flags}',
  ]);
});
