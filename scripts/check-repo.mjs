// Repo checks for the pre-commit hook: the neutral plugin definitions validate and compile, the generated
// distributions are current, and everything carries package.json's version. Skips `claude plugin validate` when claude
// isn't on PATH (nix flake check sandbox, CI).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check } from '../tools/harness-compiler/src/emit/commands.ts';
import { composeFlows } from '../tools/harness-compiler/src/flows/compose.ts';
import { loadPlugins, selectTarget } from '../tools/harness-compiler/src/load.ts';
import { TARGETS } from '../tools/harness-compiler/src/targets/index.ts';
import { TOKENS as CLAUDE_CODE } from '../tools/harness-compiler/src/templates/hosts/claude-code.ts';
import { TOKENS as CODEX } from '../tools/harness-compiler/src/templates/hosts/codex.ts';
import {
  checkOverrides,
  checkPackPaths,
  checkTemplates,
  checkUseNames,
  currentDeps,
  expectedDeps,
  FLOWS,
  packs,
  renderTree,
  withTree,
} from './flows-uses.mjs';
import { pluginDirs as findPluginDirs } from './plugin-dirs.mjs';

process.chdir(join(import.meta.dirname, '..'));

const MARKETPLACE = '.claude-plugin/marketplace.json';
const problems = [];
const pluginDirs = findPluginDirs();

// --- neutral definitions: catalog, plugin.json and hooks parse, and each target's dependency closure holds ---
let plugins = [];
try {
  plugins = loadPlugins('.');
  for (const target of TARGETS) selectTarget(plugins, target.id);
} catch (error) {
  problems.push(`harness-compiler validate: ${error.message}`);
}
// --- generated distributions and marketplaces are current ---
try {
  problems.push(...check('.').map((p) => (p.startsWith('flows: ') ? p : `${p} (run npm run build:harnesses)`)));
} catch (error) {
  problems.push(`harness-compiler check: ${error.message}`);
}
// Hook point: also run `harness-compiler lint` once that subcommand exists.
if (
  spawnSync(process.execPath, ['tools/harness-compiler/src/cli.ts', 'help'], { encoding: 'utf8' }).stderr.includes(
    'lint',
  )
) {
  const r = spawnSync(process.execPath, ['tools/harness-compiler/src/cli.ts', 'lint'], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`harness-compiler lint failed:\n${r.stdout}${r.stderr}`);
}

// --- claude plugin validate, on what Claude Code actually loads: the generated tree ---
const market = JSON.parse(readFileSync(MARKETPLACE, 'utf8'));
for (const target of ['.', ...market.plugins.filter((p) => typeof p.source === 'string').map((p) => p.source)]) {
  const r = spawnSync('claude', ['plugin', 'validate', target], { encoding: 'utf8' });
  if (r.error?.code === 'ENOENT') {
    console.log('claude not on PATH: skipping claude plugin validate');
    break;
  }
  if (r.status !== 0) problems.push(`claude plugin validate ${target} failed:\n${r.stdout}${r.stderr}`);
}

// --- the Claude marketplace lists exactly the catalog's Claude plugins, and cross-marketplace dependencies are allowed ---
const crossAllowed = market.allowCrossMarketplaceDependenciesOn ?? [];
for (const plugin of plugins) {
  for (const dep of plugin.manifest?.dependencies ?? [])
    if (
      dep.marketplace &&
      (!dep.targets || dep.targets.includes('claude-code')) &&
      !crossAllowed.includes(dep.marketplace)
    )
      problems.push(
        `${plugin.name}: dependency ${dep.name}@${dep.marketplace} needs ${dep.marketplace} in allowCrossMarketplaceDependenciesOn`,
      );
}
const listed = new Set(market.plugins.map((p) => p.name));
for (const plugin of plugins.filter((p) => p.targets.includes('claude-code')))
  if (!listed.has(plugin.name)) problems.push(`${MARKETPLACE}: ${plugin.name} is missing`);
for (const dir of pluginDirs)
  if (!plugins.some((p) => p.source === dir)) problems.push(`${dir} is not listed in plugins/catalog.json`);

// --- flows: each conductor's composed uses per harness, and what is generated from them (scripts/flows-uses.mjs) ---
let uses;
try {
  uses = { 'claude-code': composeFlows(FLOWS, CLAUDE_CODE).uses, codex: composeFlows(FLOWS, CODEX).uses };
} catch (error) {
  problems.push(`flows compose: ${error.message}`);
}
problems.push(
  ...new Set(Object.values(uses ?? {}).flatMap((all) => checkUseNames('.', all))),
  ...checkOverrides('.'),
  ...checkPackPaths('.'),
  ...checkTemplates('.'),
);
const regen = 'run node scripts/flows-uses.mjs';
if (uses && JSON.stringify(currentDeps('.')) !== JSON.stringify(expectedDeps(uses['claude-code'], packs('.'))))
  problems.push(
    `${FLOWS}/plugin.json and plugins/catalog.json: flows dependencies differ from the conductors' uses: ${regen}`,
  );
// A Windows checkout has CRLF; the generated tree is LF.
const flowsReadme = readFileSync(`${FLOWS}/README.md`, 'utf8').replace(/\r\n/g, '\n');
if (uses && withTree(flowsReadme, renderTree(uses)) !== flowsReadme)
  problems.push(`${FLOWS}/README.md: uses tree is stale: ${regen}`);

// --- one version: package.json and its lock, the marketplace metadata.version and each Rust crate
// (scripts/release.mjs). Plugin manifests take the version when they are generated. ---
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
for (const [where, v] of [
  ['version', lock.version],
  ['packages[""].version', lock.packages?.['']?.version],
])
  if (v !== version) problems.push(`package-lock.json: ${where} is ${v}, package.json has ${version}`);
if (market.metadata?.version !== version)
  problems.push(`${MARKETPLACE}: metadata.version is ${market.metadata?.version}, package.json has ${version}`);
const CRATES = [
  { cargo: 'crates/tui-review/Cargo.toml', lock: 'crates/tui-review/Cargo.lock', name: 'tui-review' },
  { cargo: 'crates/web-mcp/Cargo.toml', lock: 'crates/web-mcp/Cargo.lock', name: 'web-mcp' },
  // A workspace: [workspace.package] carries the version; the lock lists each member.
  { cargo: 'crates/flow-cockpit/Cargo.toml', lock: 'crates/flow-cockpit/Cargo.lock', name: 'flow-cockpit-core' },
  { cargo: 'crates/flow-cockpit/Cargo.toml', lock: 'crates/flow-cockpit/Cargo.lock', name: 'flow-cockpit' },
  { cargo: 'crates/ado-mcp/Cargo.toml', lock: 'crates/ado-mcp/Cargo.lock', name: 'ado-mcp' },
];
for (const { cargo, lock, name } of CRATES) {
  const crate = /^version = "(.*)"/m.exec(readFileSync(cargo, 'utf8'))?.[1];
  if (crate !== version) problems.push(`${cargo}: version is ${crate}, package.json has ${version}`);
  const locked = new RegExp(`^name = "${name}"\\r?\\nversion = "(.*)"`, 'm').exec(readFileSync(lock, 'utf8'))?.[1];
  if (locked !== version) problems.push(`${lock}: ${name} is ${locked}, package.json has ${version}`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('✓ repo checks passed');
