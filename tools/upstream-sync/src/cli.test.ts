import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from './cli.ts';

test('rejects incomplete and unknown commands', () => {
  for (const args of [[], ['wat'], ['apply'], ['preview', '--json'], ['failed', 'rust']])
    assert.throws(() => parseCommand(args));
});

test('parses selected source and reporting URL', () => {
  assert.deepEqual(parseCommand(['passed', 'rust', 'https://example.com/run']), {
    json: false,
    githubOutput: false,
    ref: undefined,
    command: 'passed',
    args: ['rust', 'https://example.com/run'],
  });
});

test('validates flags, revision overrides and extra arguments', () => {
  const ref = 'a'.repeat(40);
  assert.equal(parseCommand(['preview', 'pstack-picks', '--ref', ref]).ref, ref);
  assert.equal(parseCommand(['apply', '--github-output', 'uv']).githubOutput, true);
  for (const args of [
    ['apply', 'uv', '--ref', ref],
    ['preview', 'pstack-picks', '--ref'],
    ['preview', 'pstack-picks', '--ref', 'main'],
    ['list', '--unknown'],
    ['apply', 'uv', 'extra'],
    ['preview', 'uv', '--github-output'],
    ['failed', 'uv', 'file:///tmp/run'],
  ])
    assert.throws(() => parseCommand(args));
});
