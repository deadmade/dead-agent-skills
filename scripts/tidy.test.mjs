import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = join(import.meta.dirname, '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const frontmatter = (text) => text.split('---\n')[1].split('\n');

test('the agent can only read', () => {
  assert.ok(frontmatter(read('plugins/flows/agents/tidy.md')).includes('tools: Read, Grep, Glob'));
});

test('the command is manual only', () => {
  assert.ok(frontmatter(read('plugins/flows/skills/tidy/SKILL.md')).includes('disable-model-invocation: true'));
});

test('the agent has no memory field', () => {
  assert.ok(!frontmatter(read('plugins/flows/agents/tidy.md')).some((line) => line.startsWith('memory:')));
});
