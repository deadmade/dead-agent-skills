import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const config = JSON.parse(readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));
const byEvent = (event) => config.hooks.filter((h) => h.event === event);

test('session start runs the launcher with the port', () => {
  const entries = byEvent('session.started');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].script, 'hooks/launch.mjs');
  assert.deepEqual(entries[0].args, ['47811']);
});

test('every tool result is posted to the trim server on the same port, 5 s', () => {
  const entries = byEvent('tool.completed');
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].tools, ['*']);
  assert.equal(entries[0].http, 'http://127.0.0.1:47811/hook');
  assert.equal(entries[0].timeoutSeconds, 5);
});

test('every script hooks.json runs exists', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const scripts = config.hooks.map((h) => h.script).filter(Boolean);
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.ok(existsSync(root + script), script);
});
