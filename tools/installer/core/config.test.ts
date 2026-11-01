import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SELF_CONFIGURED,
  configPrompts,
  configValues,
  selfConfigure,
  configureArgs,
  configureSupported,
  afterPrompts,
} from './config.ts';
const M = 'dead-claude-skills';
const json = (path: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../..', path), 'utf8'));
test('mcp-azure asks for its settings itself, in manifest order, without its binary path', () => {
  assert.deepEqual(SELF_CONFIGURED, ['mcp-azure']);
  const { userConfig } = json('.claude-plugin/mcp-azure/.claude-plugin/plugin.json');
  const prompts = configPrompts(userConfig, 'binPath', ['ado_org_url']);
  assert.deepEqual(
    prompts.map((p) => p.key),
    ['ado_org_url', 'ado_pat'],
  );
  assert.deepEqual(
    prompts.filter((p) => p.secret).map((p) => p.key),
    ['ado_pat'],
  );
  assert.deepEqual(
    prompts.map((p) => [p.key, p.saved, p.required]),
    [
      ['ado_org_url', true, true],
      ['ado_pat', false, true],
    ],
  );
  assert.equal(prompts[0].title, userConfig.ado_org_url.title);
});

test('configValues trims answers, keeps saved values on empty and names what is missing', () => {
  const { userConfig } = json('.claude-plugin/mcp-azure/.claude-plugin/plugin.json');
  const url = 'https://tfs.example/tfs/Coll';
  const unsaved = configPrompts(userConfig, 'binPath', []);
  assert.deepEqual(configValues(unsaved, { ado_org_url: ` ${url} `, ado_pat: '' }), {
    values: { ado_org_url: url },
    missing: ['ado_pat'],
  });
  const saved = configPrompts(userConfig, 'binPath', ['ado_org_url', 'ado_pat']);
  assert.deepEqual(configValues(saved, { ado_org_url: '', ado_pat: '  ' }), {
    values: {},
    missing: [],
  });
  assert.deepEqual(configValues(unsaved, { ado_org_url: url, ado_pat: 'test-pat' }), {
    values: { ado_org_url: url, ado_pat: 'test-pat' },
    missing: [],
  });
});

test('selfConfigure prompts until every required key is saved', () => {
  const requiredKeys = ['ado_org_url', 'ado_pat'];
  const old = { configuredKeys: [], requiredKeys, supported: false };
  assert.equal(selfConfigure({ ...old, installed: false }), 'handoff');
  assert.equal(selfConfigure({ ...old, installed: true }), 'skip');
  assert.equal(selfConfigure({ installed: false, configuredKeys: [], requiredKeys }), 'prompt');
  assert.equal(selfConfigure({ installed: false, configuredKeys: requiredKeys, requiredKeys }), 'prompt');
  assert.equal(selfConfigure({ installed: true, configuredKeys: requiredKeys, requiredKeys }), 'skip');
  assert.equal(selfConfigure({ installed: true, configuredKeys: ['ado_org_url'], requiredKeys }), 'prompt');
});

test('configure needs Claude Code 2.1.285 or newer', () => {
  assert.equal(configureSupported('2.1.302 (Claude Code)'), true);
  assert.equal(configureSupported('2.1.285'), true);
  assert.equal(configureSupported('3.0.0 (Claude Code)'), true);
  assert.equal(configureSupported('2.1.284 (Claude Code)'), false);
  assert.equal(configureSupported('1.9.999'), false);
  assert.equal(configureSupported(''), false);
  assert.equal(configureSupported(undefined), false);
});

test('afterPrompts hands off a new plugin without its token and names unset keys of an installed one', () => {
  const id = `mcp-azure@${M}`;
  assert.deepEqual(afterPrompts({ name: 'mcp-azure', id, installed: false, missing: ['ado_pat'] }), { handoff: true });
  assert.deepEqual(afterPrompts({ name: 'mcp-azure', id, installed: true, missing: ['ado_pat'] }), {
    unset: `mcp-azure: ado_pat not set; run /plugin configure ${id} in Claude Code`,
  });
  assert.deepEqual(afterPrompts({ name: 'mcp-azure', id, installed: false, missing: [] }), {});
  assert.deepEqual(afterPrompts({ name: 'mcp-azure', id, installed: true, missing: [] }), {});
});

test('configureArgs reads the values from stdin, never from its arguments', () => {
  const args = configureArgs(`mcp-azure@${M}`);
  assert.deepEqual(args, ['plugin', 'configure', `mcp-azure@${M}`, '--values-stdin']);
  for (const v of ['test-pat', 'https://tfs.example/tfs/Coll'])
    assert.ok(!args.some((a) => a.includes(v)), `${v} is not an argument`);
});
