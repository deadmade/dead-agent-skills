import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { glance, run } from '../scripts/glance.mjs';

const task = (id, title, depends, { does = `does ${id}`, files = ['a.js'], adds = 'nothing new', size = '~10' } = {}) =>
  [
    `### Task ${id}: ${title}`,
    '',
    `**Does:** ${does}`,
    depends === undefined ? null : `**Depends on:** ${depends}`,
    '**Files:**',
    ...files.map((f) => `- Modify: \`${f}\``),
    adds === null ? null : `**Adds:** ${adds}`,
    size === null ? null : `**Size:** ${size}`,
    '',
    '- [ ] a step',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');

const plan = (...tasks) => ['# Demo Implementation Plan', '', 'Intro.', '', '## Stage', '', ...tasks].join('\n');

const block = (text) => {
  const out = glance(text);
  return out.slice(out.indexOf('<!-- glance -->'), out.indexOf('<!-- /glance -->'));
};

test('layers', () => {
  const b = block(
    plan(task(1, 'a', 'none'), task(2, 'b', 'Task 1'), task(3, 'c', 'Task 1'), task(4, 'd', 'Task 2, Task 3')),
  );
  assert.match(b, /^ 1 {2}\[1 a\]$/m);
  assert.match(b, /^ 2 {2}\[2 b ←1\] {2}\[3 c ←1\]$/m);
  assert.match(b, /^ 3 {2}\[4 d ←2,3\]$/m);
});

test('depends forms the cockpit accepts', () => {
  const b = block(
    plan(
      task(1, 'a', 'none'),
      task(2, 'b', 'Tasks 1 and 3'),
      task(3, 'c', "Task 1 (the Session tab's layout)"),
      task(4, 'd', 'Task 8c, Task 3'),
      task('8c', 'e', 'Task 1'),
    ),
  );
  assert.match(b, /\[2 b ←1,3\]/);
  assert.match(b, /\[3 c ←1\]/);
  assert.match(b, /\[4 d ←3,8c\]/);
});

test('a wrapped Depends line, as in cockpit-harness/plan.md:214-215', () => {
  const t5 = [
    '### Task 5: wrapped',
    '',
    '**Does:** something',
    '**Depends on:** Task 1 (the pinned `portable-pty` version, the resize call, the `claude`-on-`PATH` resolution, the',
    'kill mechanism — `findings.md`\'s "What changes in Tasks 2-14"), Task 2 (`LaunchSpec`, the argv builders)',
    '**Files:** none',
    '**Size:** ~1',
    '',
  ].join('\n');
  const b = block(plan(task(1, 'a', 'none'), task(2, 'b', 'none'), t5));
  assert.match(b, /\[5 wrapped ←1,2\]/);
});

test('labels are cut to 24 characters and wide layers wrap', () => {
  const long = 'a title that runs on for far too long';
  const b = block(plan(...Array.from({ length: 6 }, (_, i) => task(i + 1, `${long} ${i}`, 'none'))));
  assert.match(b, /\[1 a title that runs on fo…\]/);
  for (const line of b.split('\n')) assert.ok(line.length <= 110, `too wide: ${line}`);
  assert.match(b, /^ {5}\[/m);
});

test('table', () => {
  const b = block(
    plan(
      task(1, 'a', 'none', { does: 'x'.repeat(80), files: ['a.js', 'b.js'], adds: 'type Foo', size: '~60' }),
      task(2, 'b', 'Task 1', { adds: null, size: null }),
    ),
  );
  assert.match(b, new RegExp(`^1 +${'x'.repeat(59)}… +2 +type Foo +~60$`, 'm'));
  assert.match(b, /^2 +does 2 +1 +\? +\?$/m);
});

test('a Files list after a blank line, as prettier writes it, still counts', () => {
  const t = [
    '### Task 1: a',
    '',
    '**Does:** x',
    '**Depends on:** none',
    '**Files:**',
    '',
    '- Create: `a`',
    '- Modify: `b`',
    '  (wrapped)',
    '',
    '- [ ] **Step 1**',
    '- [ ] Step 2',
    '',
  ].join('\n');
  assert.match(block(plan(t)), /^1 +x +2 +\? +\?$/m);
});

test('header', () => {
  const b = block(
    plan(task(1, 'a', 'none', { files: ['a', 'b'], size: '~60' }), task(2, 'b', 'Task 1', { size: '~5' })),
  );
  assert.match(b, /^Plan: Demo · 2 tasks · ~65 lines · 3 files$/m);
  const unknown = block(plan(task(1, 'a', 'none', { size: null })));
  assert.match(unknown, /^Plan: Demo · 1 tasks · size unknown · 1 files$/m);
});

test('a Size that is not ~N throws naming the task', () => {
  assert.throws(() => glance(plan(task(1, 'a', 'none', { size: '120 changed' }))), /Task 1: \*\*Size:\*\* is not ~N/);
});

test('replace keeps everything outside the markers', () => {
  const first = glance(plan(task(1, 'a', 'none')));
  const edited = first.replace('Intro.', 'Intro, edited.') + '\ntrailing\n';
  const again = glance(edited.replace('[1 a]', '[stale]'));
  assert.equal(again, edited);
  assert.equal((again.match(/<!-- glance -->/g) ?? []).length, 1);
});

test('without markers the block goes right after the first heading', () => {
  const text = plan(task(1, 'a', 'none'));
  const out = glance(text);
  assert.ok(out.startsWith('# Demo Implementation Plan\n\n<!-- glance -->\n```\n'));
  assert.ok(out.endsWith(text.slice('# Demo Implementation Plan\n'.length)));
});

test('a missing Depends line throws naming the task', () => {
  assert.throws(() => glance(plan(task(1, 'a', 'none'), task(2, 'b', 'Task 1'), task(3, 'c'))), {
    message: 'Task 3: no **Depends on:** line',
  });
});

test('a cycle throws naming its tasks', () => {
  assert.throws(() => glance(plan(task(1, 'a', 'Task 2'), task(2, 'b', 'Task 1'))), /cycle: Task 1, Task 2/);
});

test('an unknown dependency throws', () => {
  assert.throws(() => glance(plan(task(1, 'a', 'Task 9'))), /Task 1 depends on Task 9, which the plan doesn't have/);
});

test('lettered tasks sort after their number', () => {
  const b = block(plan(task('8b', 'late', 'none'), task(8, 'early', 'none'), task(9, 'next', 'none')));
  assert.match(b, /\[8 early\] {2}\[8b late\] {2}\[9 next\]/);
});

test('run writes the file and returns the block, or the error with code 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glance-'));
  const good = join(dir, 'plan.md');
  writeFileSync(good, plan(task(1, 'a', 'none')));
  const ok = run(good);
  assert.equal(ok.code, 0);
  assert.match(ok.out, /^<!-- glance -->/);
  assert.match(readFileSync(good, 'utf8'), /\[1 a\]/);
  const bad = join(dir, 'bad.md');
  writeFileSync(bad, plan(task(1, 'a')));
  assert.deepEqual(run(bad), { code: 1, out: 'Task 1: no **Depends on:** line' });
  assert.equal(readFileSync(bad, 'utf8'), plan(task(1, 'a')));
});

test('--check prints the block and writes nothing, with the same exit codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glance-check-'));
  const cli = join(import.meta.dirname, '..', 'scripts', 'glance.mjs');
  const good = join(dir, 'plan.md');
  writeFileSync(good, plan(task(1, 'a', 'none')));
  const before = readFileSync(good);
  const ok = spawnSync(process.execPath, [cli, '--check', good], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^<!-- glance -->\n```\nPlan: Demo · 1 tasks/);
  assert.deepEqual(readFileSync(good), before);
  const bad = join(dir, 'bad.md');
  writeFileSync(bad, plan(task(1, 'a', 'none'), task(2, 'b')));
  const no = spawnSync(process.execPath, [cli, '--check', bad], { encoding: 'utf8' });
  assert.equal(no.status, 1);
  assert.equal(no.stdout, 'Task 2: no **Depends on:** line\n');
});

test('markers count only on lines of their own', () => {
  const text = plan(task(1, 'a', 'none')).replace('Intro.', 'Intro mentions `<!-- glance -->…<!-- /glance -->` here.');
  const out = glance(text);
  assert.ok(out.includes('Intro mentions `<!-- glance -->…<!-- /glance -->` here.'));
  assert.ok(out.startsWith('# Demo Implementation Plan\n\n<!-- glance -->\n```\n'));
});

test('a Depends line that names no task throws', () => {
  for (const value of ['Tasks 1-2', 'the parser task', '`Task 1`'])
    assert.throws(() => glance(plan(task(1, 'a', 'none'), task(2, 'b', value))), {
      message: `Task 2: **Depends on:** names no task ("${value}")`,
    });
});

test('CRLF plans parse like LF ones and keep their line endings', () => {
  const lf = plan(task(1, 'a', 'none'), task(2, 'b', 'Task 1'));
  assert.equal(glance(lf.replace(/\n/g, '\r\n')), glance(lf).replace(/\n/g, '\r\n'));
});

test('a plan with no task headings throws', () => {
  assert.throws(() => glance('# Demo\n\n## Task 1: a\n\n**Depends on:** none\n'), /no `### Task <n>:` headings/);
});

test('headings and fields inside fences and comments are not read', () => {
  const t = [
    '### Task 1: a',
    '',
    '**Does:** x',
    '**Depends on:** none',
    '**Files:**',
    '- Create: `a`',
    '',
    '```markdown',
    '## Usage',
    '### Task 7: fixture',
    '```',
    '<!-- ### Task 2: old -->',
    '**Size:** ~10',
    '',
  ].join('\n');
  const b = block(plan(t));
  assert.match(b, /^Plan: Demo · 1 tasks · ~10 lines · 1 files$/m);
  assert.doesNotMatch(b, /\[7 |\[2 /);
});

test('a `<!--` in prose or left open is text, as plan.rs reads it', () => {
  const t1 = task(1, 'a', 'none', { does: 'mentions `<!--` and never closes it' });
  const t3 = task(3, 'c', 'Task 2').replace('- [ ] a step', '<!-- a note -->\n- [ ] a step');
  assert.match(block(plan(t1, task(2, 'b', 'Task 1'), t3)), /^Plan: Demo · 3 tasks/m);
});

test('a Files list wrapped over lines counts every path', () => {
  const t = [
    '### Task 1: a',
    '',
    '**Does:** x',
    '**Depends on:** none',
    '**Files:** Create `a.rs`, `b.rs`,',
    'modify `c.rs` and `d.rs`',
    '**Size:** ~1',
    '',
  ].join('\n');
  assert.match(block(plan(t)), /^1 +x +4 +\? +~1$/m);
});

test('a Size like ~1.5k or ~1,200 throws', () => {
  for (const size of ['~1.5k', '~1,200', '~40-60'])
    assert.throws(() => glance(plan(task(1, 'a', 'none', { size }))), /Task 1: \*\*Size:\*\* is not ~N/);
  assert.match(block(plan(task(1, 'a', 'none', { size: '~12 lines' }))), /~12 lines · /);
});

test('an inline Files list counts its paths', () => {
  const t = [
    '### Task 1: a',
    '',
    '**Does:** x',
    '**Depends on:** none',
    '**Files:** Create `a.rs`, `b.rs` and `c.rs`',
    '**Size:** ~1',
    '',
  ].join('\n');
  assert.match(block(plan(t)), /^1 +x +3 +\? +~1$/m);
});

test('the CLI runs through a symlinked folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'glance-cli-'));
  symlinkSync(join(import.meta.dirname, '..', 'scripts'), join(dir, 'scripts'));
  const file = join(dir, 'plan.md');
  writeFileSync(file, plan(task(1, 'a', 'none')));
  const res = spawnSync(process.execPath, [join(dir, 'scripts', 'glance.mjs'), file], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^<!-- glance -->/);
});
