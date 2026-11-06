import * as claude from './claude-code.mjs';
import * as codex from './codex.mjs';
import { readFileSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { startupRules } from '../rules.mjs';
import { main } from '../lib.mjs';

const adapters = { 'claude-code': claude, codex };
const handlers = { notifications: main, rules: startupRules };
const markers = { start: '<!-- dead-agent-skills:start -->', end: '<!-- dead-agent-skills:end -->' };
const hash = (text) => createHash('sha256').update(text).digest('hex');
const readOptional = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
};
function runRules(harness, adapter) {
  const rules = readFileSync(new URL('../../rules.md', import.meta.url), 'utf8');
  const home = resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
  let global = { source: 'none', text: '' };
  if (harness === 'codex') {
    try {
      global = adapter.effectiveGlobalInstructions({
        override: readOptional(join(home, 'AGENTS.override.md')),
        agents: readOptional(join(home, 'AGENTS.md')),
      });
    } catch (error) {
      console.error(`rules: ambiguous instruction source: ${error.message}`);
      global = { source: 'ambiguous', text: '' };
    }
  }
  let result = { context: rules, managedBlockPresent: false };
  try {
    result = startupRules({ rules, globalInstructions: global.text, markers });
  } catch (error) {
    console.error(`rules: ${error.message}`);
  }
  if (global.text.includes(markers.start) && !result.managedBlockPresent)
    console.error('rules: managed block differs or is malformed; cleanup withheld');
  if (result.context) process.stdout.write(JSON.stringify(adapter.encodeContext(result.context)) + '\n');
  if (harness !== 'codex') return;
  const receipt = {
    packageVersion: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version,
    rulesHash: hash(rules.trim()),
    adapterHash: hash(readFileSync(new URL('./codex.mjs', import.meta.url))),
    source: global.source,
    managedBlockPresent: result.managedBlockPresent,
    cleanupEligible: ['agents', 'override'].includes(global.source) && result.managedBlockPresent,
  };
  const directory = join(home, 'dead-agent-skills');
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `rules-hook.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temporary, join(directory, 'rules-hook.json'));
  } finally {
    rmSync(temporary, { force: true });
  }
}
try {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--harness' || args[2] !== '--event' || args[4] !== '--handler')
    throw new Error('Expected --harness <id> --event <event> --handler <id>');
  if (!Object.hasOwn(adapters, args[1])) throw new Error('Unknown harness');
  if (!Object.hasOwn(handlers, args[5])) throw new Error('Unknown handler');
  if (
    !['session.started', 'turn.finished', 'permission.requested', 'question.asked', 'notification.received'].includes(
      args[3],
    )
  )
    throw new Error('Unknown shared event');
  let stdin = '';
  for await (const chunk of process.stdin) stdin += chunk;
  const input = adapters[args[1]].decode(args[3], JSON.parse(stdin), process.env);
  if (input?.kind === 'session.started' && args[5] === 'rules') runRules(args[1], adapters[args[1]]);
  else if (input && input.kind !== 'session.started' && args[5] === 'notifications')
    await handlers[args[5]]({ input, env: process.env, platform: process.platform });
} catch (error) {
  console.error(`hook: ${error.message}`);
  process.exitCode = 1;
}
