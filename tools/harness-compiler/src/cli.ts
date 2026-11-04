#!/usr/bin/env node
// harness-compiler build | check | validate
import { join } from 'node:path';
import { build, check, formatDiagnostic } from './emit/commands.ts';
import { lintPlugins, loadAllowlist } from './lint.ts';
import { loadPlugins, selectTarget } from './load.ts';
import { TARGETS } from './targets/index.ts';

const root = join(import.meta.dirname, '../../..');
const [command = 'build'] = process.argv.slice(2);
try {
  if (command === 'build') {
    const built = build(root);
    for (const d of built.diagnostics) console.log(formatDiagnostic(d));
    for (const [conductor, tokens] of Object.entries(built.estimates))
      console.log(`${conductor}: ~${tokens} tokens of rules plus Start`);
    for (const w of built.warnings) console.log(`warning: ${w}`);
    for (const p of built.problems) console.error(`problem: ${p}`);
    console.log('Updated both native distributions and repository marketplaces.');
  } else if (command === 'check') {
    const problems = check(root);
    if (problems.length) {
      console.error(
        problems.map((p) => (p.startsWith('flows: ') ? p : `${p} (run npm run build:harnesses)`)).join('\n'),
      );
      process.exitCode = 1;
    } else console.log('Native distributions and marketplaces are current.');
  } else if (command === 'validate') {
    const plugins = loadPlugins(root);
    for (const t of TARGETS) selectTarget(plugins, t.id);
    console.log(`${plugins.length} plugins valid.`);
  } else if (command === 'lint') {
    const sources = loadPlugins(root).flatMap((p) => (typeof p.source === 'string' ? [p.source] : []));
    const problems = lintPlugins(root, loadAllowlist(join(import.meta.dirname, 'lint-allowlist.json')), sources);
    if (problems.length) {
      console.error(problems.map((p) => `${p.file}${p.line ? ':' + p.line : ''}: ${p.message}`).join('\n'));
      process.exitCode = 1;
    } else console.log('plugins/ is agent-neutral.');
  } else throw new Error(`Unknown command "${command}". Use build, check, validate or lint.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
