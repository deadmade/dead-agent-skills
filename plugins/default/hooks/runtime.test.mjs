import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as claude from './runtime/claude-code.mjs';
import * as codex from './runtime/codex.mjs';
import { normalize } from './runtime/common.mjs';

const adapters = { 'claude-code': claude, codex };
for (const [id, adapter] of Object.entries(adapters)) {
  const fixtures = JSON.parse(readFileSync(new URL(`./fixtures/${id}.json`, import.meta.url)));
  test(`${id} fixture observation table is exact and non-overlapping`, () => {
    const events = [
      'session.started',
      'turn.finished',
      'permission.requested',
      'question.asked',
      'notification.received',
    ];
    for (const { raw, kind } of fixtures) {
      const matches = events.map((e) => adapter.decode(e, raw, {})).filter(Boolean);
      assert.equal(matches.length, kind ? 1 : 0);
      if (kind) assert.equal(matches[0].kind, kind);
    }
  });
  test(`${id} continuation, subagent and context envelope`, () => {
    const raw = {
      hook_event_name: 'Stop',
      cwd: '/project',
      session_id: 's',
      stop_hook_active: true,
      agent_id: 'child',
    };
    assert.deepEqual(adapter.decode('turn.finished', raw, {}), {
      kind: 'turn.finished',
      cwd: '/project',
      sessionId: 's',
      agentId: 'child',
      continuation: true,
      interactive: true,
      detail: '',
    });
    assert.deepEqual(adapter.encodeContext('rules\ntext'), {
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'rules\ntext' },
    });
    for (const bad of [
      null,
      [],
      {},
      { hook_event_name: 'Stop', cwd: 123 },
      { hook_event_name: 'Stop', cwd: '/p', session_id: 's', stop_hook_active: 'false' },
    ])
      assert.throws(() => adapter.decode('turn.finished', bad, {}), /payload/);
    assert.equal(adapter.decode('turn.finished', { hook_event_name: 'Unknown', cwd: '/p', session_id: 's' }, {}), null);
  });
}

test('Claude adapter owns headless environment detection', () => {
  for (const ep of ['sdk-cli', 'sdk-ts', 'sdk-py'])
    assert.equal(
      claude.decode(
        'turn.finished',
        { hook_event_name: 'Stop', cwd: '/p', session_id: 's' },
        { CLAUDE_CODE_ENTRYPOINT: ep },
      ).interactive,
      false,
    );
});

test('runner uses fixed dispatch, diagnostics only on stderr, and works with spaces from unrelated cwd', () => {
  const root = mkdtempSync(join(tmpdir(), 'hook package '));
  cpSync(new URL('./', import.meta.url), root, { recursive: true });
  const run = (args, input) =>
    spawnSync(process.execPath, [join(root, 'runtime/run.mjs'), ...args], {
      cwd: tmpdir(),
      input,
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
      timeout: 10000,
    });
  const args = ['--harness', 'codex', '--event', 'turn.finished', '--handler', 'notifications'];
  for (const input of ['not json', '{}']) {
    const r = run(args, input);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /hook:/);
  }
  const quiet = run(
    args,
    JSON.stringify({ hook_event_name: 'Stop', cwd: '/p', session_id: 's', stop_hook_active: true }),
  );
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(quiet.stdout, '');
  assert.equal(quiet.stderr, '');
  for (const id of ['../../evil.mjs']) {
    const r = run([...args.slice(0, -1), id], '{}');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /handler/);
    assert.equal(r.stdout, '');
  }
  const missing = spawnSync(join(root, 'missing-node'), [join(root, 'runtime/run.mjs')]);
  assert.equal(missing.error.code, 'ENOENT');
});

test('shared launch expectations keep notification hooks advisory and bounded', () => {
  const hooks = JSON.parse(readFileSync(new URL('./shared.json', import.meta.url)));
  for (const hook of hooks.filter((h) => h.handler === 'notifications')) {
    assert.equal(hook.background, true);
    assert.equal(hook.timeoutSeconds, 10);
  }
});

test('malformed observed tool and notification payloads fail at the native boundary', () => {
  const common = { cwd: '/p', session_id: 's' };
  assert.throws(
    () =>
      claude.decode(
        'question.asked',
        { ...common, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: [] },
        {},
      ),
    /payload/,
  );
  assert.throws(
    () =>
      codex.decode(
        'question.asked',
        { ...common, hook_event_name: 'PreToolUse', tool_name: 'request_user_input', tool_input: { questions: 'bad' } },
        {},
      ),
    /payload/,
  );
  assert.throws(
    () =>
      claude.decode(
        'permission.requested',
        { ...common, hook_event_name: 'Notification', notification_type: 'permission_prompt', message: [] },
        {},
      ),
    /payload/,
  );
});

test('native Windows process launch requires Windows validation', { skip: process.platform !== 'win32' }, () => {
  const r = spawnSync(process.execPath, ['--version'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^v/);
});

for (const [id, adapter] of Object.entries(adapters)) {
  test(`${id} validates every present question entry and runner rejects malformed observations`, () => {
    const base = {
      cwd: '/p',
      session_id: 's',
      hook_event_name: 'PreToolUse',
      tool_name: id === 'claude-code' ? 'AskUserQuestion' : 'request_user_input',
    };
    for (const entry of [42, null, [], { question: 42 }, { question: null }]) {
      const raw = { ...base, tool_input: { questions: [{ question: 'Valid first question' }, entry] } };
      assert.throws(() => adapter.decode('question.asked', raw, {}), /payload/);
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('./runtime/run.mjs', import.meta.url)),
          '--harness',
          id,
          '--event',
          'question.asked',
          '--handler',
          'notifications',
        ],
        { input: JSON.stringify(raw), encoding: 'utf8', env: { ...process.env, PATH: '' }, timeout: 10000 },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /hook:.*payload/);
      assert.equal(result.stdout, '');
    }
    for (const tool_input of [undefined, {}, { questions: [] }, { questions: [{}] }]) {
      assert.equal(adapter.decode('question.asked', { ...base, tool_input }, {}).detail, '');
    }
  });
}

test('shared normalization preserves explicit reasons and quiet lifecycle fields', () => {
  const raw = {
    cwd: '/p',
    session_id: 's',
    agent_id: 'child',
    stop_hook_active: true,
    message: 'Network approval requested',
  };
  const result = normalize('permission.requested', raw, false);
  assert.deepEqual(result, {
    kind: 'permission.requested',
    cwd: '/p',
    sessionId: 's',
    agentId: 'child',
    continuation: true,
    interactive: false,
    detail: 'Network approval requested',
    permissionReason: 'Network approval requested',
  });
  assert.throws(() => normalize('question.asked', { ...raw, tool_input: { questions: [null] } }, true), /payload/);
});

test('startup runner injects packaged rules, tracks active source, and writes receipts only after decode', async () => {
  const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'rules package '));
  cpSync(new URL('../', import.meta.url), root, { recursive: true });
  writeFileSync(join(root, 'hooks/runtime/package.json'), JSON.stringify({ version: 'test' }));
  const home = join(root, 'custom home');
  mkdirSync(home);
  const receipt = join(home, 'dead-agent-skills/rules-hook.json');
  const run = (input = JSON.stringify({ hook_event_name: 'SessionStart', cwd: '/p', session_id: 's' })) =>
    spawnSync(
      process.execPath,
      [join(root, 'hooks/runtime/run.mjs'), '--harness', 'codex', '--event', 'session.started', '--handler', 'rules'],
      { input, encoding: 'utf8', env: { ...process.env, CODEX_HOME: home }, timeout: 10000 },
    );
  assert.equal(run('{}').status, 1);
  assert.equal(existsSync(receipt), false);
  let r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /Commit messages/);
  let state = JSON.parse(readFileSync(receipt));
  const oldAdapterHash = state.adapterHash;
  writeFileSync(
    join(root, 'hooks/runtime/codex.mjs'),
    readFileSync(join(root, 'hooks/runtime/codex.mjs'), 'utf8') + '\n// updated adapter\n',
  );
  r = run();
  assert.notEqual(JSON.parse(readFileSync(receipt)).adapterHash, oldAdapterHash);
  assert.equal(state.source, 'none');
  assert.equal(state.managedBlockPresent, false);
  const rules = readFileSync(join(root, 'rules.md'), 'utf8');
  const block = `<!-- dead-agent-skills:start -->\n${rules.trim()}\n<!-- dead-agent-skills:end -->`;
  writeFileSync(join(home, 'AGENTS.md'), block);
  r = run();
  assert.equal(r.stdout, '');
  state = JSON.parse(readFileSync(receipt));
  assert.equal(state.managedBlockPresent, true);
  assert.equal(state.cleanupEligible, true);
  writeFileSync(join(home, 'AGENTS.override.md'), 'override');
  r = run();
  assert.match(r.stdout, /Commit messages/);
  assert.equal(JSON.parse(readFileSync(receipt)).source, 'override');
  writeFileSync(join(home, 'AGENTS.override.md'), ' \n');
  r = run();
  assert.equal(r.stdout, '');
  for (const content of [
    '<!-- dead-agent-skills:start -->',
    block.replace('Commit messages', 'Altered messages'),
    block + block,
  ]) {
    writeFileSync(join(home, 'AGENTS.md'), content);
    r = run();
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Commit messages/);
    assert.match(r.stderr, /rules/);
    assert.equal(JSON.parse(readFileSync(receipt)).cleanupEligible, false);
    assert.equal(readFileSync(join(home, 'AGENTS.md'), 'utf8'), content);
  }
  // Ambiguous discovery (a directory instead of the native file) cannot suppress context.
  const { rmSync } = await import('node:fs');
  rmSync(join(home, 'AGENTS.override.md'));
  mkdirSync(join(home, 'AGENTS.override.md'));
  r = run();
  assert.match(r.stdout, /Commit messages/);
  assert.equal(JSON.parse(readFileSync(receipt)).source, 'ambiguous');
  rmSync(join(home, 'dead-agent-skills'), { recursive: true });
  mkdirSync(receipt, { recursive: true });
  r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Commit messages/);
  assert.equal(existsSync(join(home, 'dead-agent-skills/rules-hook.json/packageVersion')), false);
});
