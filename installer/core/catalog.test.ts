import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCatalog } from '../system/catalog.ts';
import { portableSelection, selectTarget, selectHooks, type HookDefinition } from './catalog.ts';
import { AGENTS } from './agents.ts';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const root = resolve(import.meta.dirname, '../..');
const definitions = () => readCatalog(root);
test('neutral catalog preserves names, default and dependency closure without native-only plugins', () => {
  const all = definitions();
  assert.equal(all.length, 17);
  assert.deepEqual(
    selectTarget(all, 'codex').plugins.map((p) => p.name),
    [
      'dead-skills',
      'flows',
      'graphify',
      'hallmark',
      'rust-skills',
      'csharp-skills',
      'postgres',
      'web-mcp',
      'mcp-github',
      'mcp-azure',
      'atlassian',
    ],
  );
  assert.equal(selectTarget(all, 'claude-code').plugins.length, 17);
  assert.deepEqual(portableSelection(all, []), ['dead-skills']);
  assert.deepEqual(portableSelection(all, ['flows']), ['dead-skills', 'flows', 'graphify', 'web-mcp']);
  assert.deepEqual(portableSelection(all, ['flows', 'flows']), ['dead-skills', 'flows', 'graphify', 'web-mcp']);
  assert.throws(() => portableSelection(all, ['tui-review']), /Unknown portable/);
  assert.throws(() => portableSelection(all, ['unknown']), /Unknown portable/);
});
test('dependency validation rejects unknown references, cycles and duplicate identities', () => {
  const base = definitions()[0];
  for (const entries of [
    [{ ...base, dependencies: ['unknown'] }],
    [{ ...base, dependencies: [base.name] }],
    [base, { ...base }],
    [
      { ...base, dependencies: ['other'] },
      { ...base, name: 'other', dependencies: [base.name] },
    ],
  ])
    assert.throws(() => selectTarget(entries, 'codex'), /dependency|cycle|Duplicate/i);
});
test('shared hooks require real capabilities and report optional observations', () => {
  const hook: HookDefinition = {
    event: 'notification.received',
    handler: 'notifications',
    required: false,
    background: true,
    timeoutSeconds: 10,
  };
  const optional = selectHooks([hook], 'codex');
  assert.deepEqual(optional.hooks, []);
  assert.equal(optional.diagnostics.length, 1);
  assert.equal(optional.diagnostics[0].event, 'notification.received');
  assert.throws(() => selectHooks([{ ...hook, required: true }], 'codex'), /required.*notification.received/i);
  assert.deepEqual(selectHooks([hook], 'claude-code').hooks, [hook]);
  for (const event of ['session.started', 'turn.finished', 'permission.requested', 'question.asked'] as const)
    assert.equal(selectHooks([{ ...hook, event, required: true }], 'codex').hooks.length, 1);
});
test('native observation mappings remain independent and anchored', () => {
  const claude = AGENTS.find((a) => a.id === 'claude-code')!.hooks;
  const codex = AGENTS.find((a) => a.id === 'codex')!.hooks;
  assert.deepEqual(claude['permission.requested'], { event: 'Notification', matcher: '^permission_prompt$' });
  assert.deepEqual(claude['question.asked'], { event: 'PreToolUse', matcher: '^AskUserQuestion$' });
  assert.deepEqual(claude['notification.received'], { event: 'Notification', matcher: '^elicitation_dialog$' });
  assert.deepEqual(codex['permission.requested'], { event: 'PermissionRequest' });
  assert.deepEqual(codex['question.asked'], { event: 'PreToolUse', matcher: '^request_user_input$' });
  assert.equal(codex['notification.received'], undefined);
});

test('plugin-owned hooks declare required lifecycle and optional observations', () => {
  const entry = definitions().find((p) => p.name === 'dead-skills')!;
  const hooks: HookDefinition[] = JSON.parse(readFileSync(resolve(root, entry.source as string, entry.hooks!), 'utf8'));
  assert.deepEqual(
    hooks.map((h) => [h.event, h.required]),
    [
      ['session.started', true],
      ['turn.finished', true],
      ['permission.requested', false],
      ['question.asked', false],
      ['notification.received', false],
    ],
  );
  assert.equal(selectHooks(hooks, 'codex').diagnostics.length, 1);
  assert.equal(selectHooks(hooks, 'claude-code').diagnostics.length, 0);
  assert.ok(hooks.every((h) => h.handler && h.timeoutSeconds > 0 && typeof h.background === 'boolean'));
  const external = definitions().find((p) => p.name === 'atlassian')!;
  assert.deepEqual(external.source, { source: 'url', url: 'https://github.com/atlassian/atlassian-mcp-server.git' });
  assert.deepEqual(definitions().find((p) => p.name === 'flows')!.overlays['claude-code'], [
    '.claude-plugin/plugin.json',
    'hooks',
  ]);
});

test('target selection rejects a dependency unavailable on that target', () => {
  const base = definitions()[0];
  assert.throws(
    () =>
      selectTarget(
        [
          { ...base, dependencies: ['native'] },
          { ...base, name: 'native', targets: ['claude-code'] },
        ],
        'codex',
      ),
    /dependency.*native.*codex/i,
  );
});

test('native engine modules and configuration remain explicit Claude overlays', () => {
  const all = definitions();
  for (const [name, paths] of [
    [
      'dead-skills',
      ['hooks/register.tsx', 'hooks/background.ts', 'hooks/words.ts', 'themes', 'assets', 'icon.png', '.mcp.json'],
    ],
    ['tui-review', ['hooks']],
    ['md-pane', ['hooks']],
    ['nix-lsp', ['.lsp.json']],
    ['web-mcp', ['.mcp.json']],
    ['mcp-github', ['.mcp.json']],
    ['mcp-azure', ['.mcp.json']],
  ] as const) {
    const entry = all.find((p) => p.name === name)!;
    for (const path of paths) assert.ok(entry.overlays['claude-code']!.includes(path), `${name}: ${path}`);
    assert.equal(entry.overlays.codex, undefined);
  }
});
