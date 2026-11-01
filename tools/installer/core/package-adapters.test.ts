import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGENTS } from './agents.ts';
import type { PluginDefinition, HookDefinition } from './catalog.ts';
import { emitNativePlugin, portableText } from './package-adapters.ts';
const definition: PluginDefinition = {
  name: 'example',
  description: 'Example',
  source: 'plugins/example',
  resources: ['skills'],
  dependencies: [],
  targets: ['claude-code', 'codex'],
  overlays: {},
};
const hooks: HookDefinition[] = [
  'session.started',
  'turn.finished',
  'permission.requested',
  'question.asked',
  'notification.received',
].map((event) => ({
  event: event as HookDefinition['event'],
  handler: event === 'session.started' ? 'rules' : 'notifications',
  required: event === 'session.started',
  background: event !== 'session.started',
  timeoutSeconds: 10,
}));
for (const agent of AGENTS)
  test(`${agent.id} emits nested native command hooks without overlapping notification reasons`, () => {
    const emitted = emitNativePlugin(definition, agent.id, '1.2.3', hooks);
    assert.equal((emitted.manifest as { name: string }).name, 'example');
    const actual = (
      emitted.hooks as {
        hooks: Record<
          string,
          { matcher?: string; hooks: { command: string; type: string; async?: boolean; timeout: number }[] }[]
        >;
      }
    ).hooks;
    let count = 0;
    for (const hook of hooks) {
      const mapping = agent.hooks[hook.event];
      if (!mapping) continue;
      count++;
      const registration = actual[mapping.event].find((r) => r.matcher === mapping.matcher)!;
      const command = registration.hooks[0];
      assert.equal(command.type, 'command');
      assert.equal(command.timeout, 10);
      assert.equal(command.async ?? false, hook.background);
      assert.ok(command.command.includes(`--harness ${agent.id} --event ${hook.event} --handler ${hook.handler}`));
      assert.ok(
        command.command.startsWith('node "${' + (agent.id === 'codex' ? 'CODEX' : 'CLAUDE') + '_PLUGIN_ROOT}/'),
      );
    }
    assert.equal(Object.values(actual).flat().length, count);
  });
test('host text paths resolve from each document including vendored pack roots', () => {
  assert.equal(
    portableText('${CLAUDE_PLUGIN_ROOT}/skills', '/pkg/packs/example/skills/a/SKILL.md', '/pkg'),
    '../../skills',
  );
  assert.equal(
    portableText('${CLAUDE_PLUGIN_ROOT}/library ${CLAUDE_SKILL_DIR} CLAUDE.md', '/pkg/skills/core/SKILL.md', '/pkg'),
    '../../library . AGENTS.md',
  );
});

test('Codex descriptions retain the existing portable capability descriptions', () => {
  const manifest = emitNativePlugin({ ...definition, name: 'graphify' }, 'codex', '1.2.3', []).manifest as {
    description: string;
  };
  assert.equal(
    manifest.description,
    'Graphify skills for querying a codebase knowledge graph. Requires the graphify CLI.',
  );
});

test('shared instruction-file policy preserves both host filenames', () => {
  const policy = 'Check AGENTS.md and CLAUDE.md, and retain them.';
  assert.equal(portableText(policy, '/pkg/rules.md', '/pkg'), policy);
});
