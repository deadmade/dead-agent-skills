import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const config = JSON.parse(readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));

test('hooks.json runs the code check after a write or edit of Markdown and no model', () => {
  assert.ok(!JSON.stringify(config).includes('"prompt"'));
  assert.equal(config.hooks.length, 1);
  const [hook] = config.hooks;
  assert.equal(hook.event, 'tool.completed');
  assert.deepEqual(hook.tools, ['file.write', 'file.edit']);
  assert.deepEqual(hook.paths, ['**/*.md']);
  assert.equal(hook.script, 'hooks/prose-check.mjs');
  assert.match(config.description, /FLOWS_PROSE_CHECK=off turns it off\.$/);
});

test('every script hooks.json runs exists', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const scripts = config.hooks.map((h) => h.script).filter(Boolean);
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.ok(existsSync(root + script), script);
});
