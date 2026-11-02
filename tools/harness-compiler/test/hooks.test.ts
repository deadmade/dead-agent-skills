import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Hook } from '../src/model.ts';
import { nativeHooks, selectHooks } from '../src/targets/hooks.ts';
import { TARGETS, targetById } from '../src/targets/index.ts';

const hook = (over: Partial<Hook>): Hook => ({
  event: 'session.started',
  required: false,
  background: false,
  handler: 'rules',
  ...over,
});
const claude = targetById('claude-code'),
  codex = targetById('codex');

test('a required hook the target lacks fails the build, an optional one is reported', () => {
  assert.throws(
    () => selectHooks([hook({ event: 'notification.received', required: true })], codex, 'p'),
    /Required hook/,
  );
  const r = selectHooks([hook({ event: 'notification.received' })], codex, 'p');
  assert.deepEqual(r.hooks, []);
  assert.equal(r.diagnostics.length, 1);
});
test('runtime handlers get the harness, event and plugin root of the target', () => {
  const c = nativeHooks([hook({ background: true, timeoutSeconds: 10 })], claude, '${CLAUDE_PLUGIN_ROOT}');
  assert.deepEqual(c, {
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command:
              'node "${CLAUDE_PLUGIN_ROOT}/hooks/runtime/run.mjs" --harness claude-code --event session.started --handler rules',
            async: true,
            timeout: 10,
          },
        ],
      },
    ],
  });
  assert.match(
    JSON.stringify(nativeHooks([hook({})], codex, '${CODEX_PLUGIN_ROOT}')),
    /CODEX_PLUGIN_ROOT.*--harness codex/,
  );
});
test('tool hooks map neutral tool names and path filters per tool', () => {
  const h = hook({
    event: 'tool.completed',
    handler: undefined,
    script: 'hooks/p.mjs',
    tools: ['file.write', 'file.edit'],
    paths: ['**/*.md'],
  });
  const r = nativeHooks([h], claude, 'ROOT') as any;
  assert.equal(r.PostToolUse[0].matcher, 'Write|Edit');
  assert.deepEqual(
    r.PostToolUse[0].hooks.map((x: any) => x.if),
    ['Write(**/*.md)', 'Edit(**/*.md)'],
  );
  assert.equal(
    (
      nativeHooks(
        [hook({ event: 'tool.completed', handler: undefined, http: 'http://x', tools: ['*'] })],
        claude,
        'R',
      ) as any
    ).PostToolUse[0].matcher,
    '*',
  );
});
test('every target maps each tool and the shared events agree on names', () => {
  for (const t of TARGETS)
    for (const tool of ['*', 'shell', 'file.write', 'ask-user'] as const) assert.ok(t.tools[tool], `${t.id} ${tool}`);
  assert.equal(claude.events['question.asked']!.matcher, '^AskUserQuestion$');
  assert.equal(codex.events['question.asked']!.matcher, '^request_user_input$');
});
