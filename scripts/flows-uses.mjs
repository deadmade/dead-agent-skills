import { execFileSync } from 'node:child_process';
// Each flows conductor's uses, per harness, come from composeFlows: its SKILL.md's `uses:`, its steps' and its host
// tokens'. From them come flows' dependencies (catalog and plugin.json) and the tree in its README; check-repo fails on
// drift. Run directly to rewrite both.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OVERRIDE, composeFlows, isConductor } from '../tools/harness-compiler/src/flows/compose.ts';
import { TOKENS as CLAUDE_CODE } from '../tools/harness-compiler/src/templates/hosts/claude-code.ts';
import { TOKENS as CODEX } from '../tools/harness-compiler/src/templates/hosts/codex.ts';

export const FLOWS = 'plugins/flows';
// The skill packs flows carries, one synced folder each: no marketplace entry, read by path, never loaded on their own.
export const PACKS = `${FLOWS}/packs`;
export const OFFICIAL = 'claude-plugins-official';
// Claude Code's own skills and agents (security-review, general-purpose): listed, never a dependency.
export const BUILTIN = 'claude-code';
const START = '<!-- uses:start -->';
const END = '<!-- uses:end -->';

// flows' skills, split by frontmatter: conductors carry `disable-model-invocation: true`; the rest (diagrams)
// Claude may load on its own.
const flowsSkills = (root) => {
  const dir = join(root, FLOWS, 'skills');
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && existsSync(join(dir, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort()
    .map((name) => ({ name, conductor: isConductor(readFileSync(join(dir, name, 'SKILL.md'), 'utf8')) }));
};

// The pack names: the folders under PACKS.
export const packs = (root) =>
  existsSync(join(root, PACKS))
    ? readdirSync(join(root, PACKS), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

// uses: composeFlows(…).uses, { conductor: { plugin: [names] } }. Returns problems as strings; whether the text names
// each use is check 7 in the build (checkBuilt).
export function checkUseNames(root, uses) {
  const problems = [];
  const definitions = JSON.parse(readFileSync(join(root, 'plugins/catalog.json'), 'utf8'));
  const packNames = packs(root);
  const skills = flowsSkills(root);
  const dir = join(root, FLOWS, 'skills');
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    if (!existsSync(join(dir, d.name, 'SKILL.md'))) problems.push(`${FLOWS}/skills/${d.name}: no SKILL.md`);
    if (existsSync(join(dir, d.name, 'uses.json')))
      problems.push(`${FLOWS}/skills/${d.name}/uses.json: move it into SKILL.md's uses: frontmatter`);
  }
  for (const [conductor, used] of Object.entries(uses)) {
    const at = `${FLOWS}/skills/${conductor}/SKILL.md`;
    for (const [plugin, names] of Object.entries(used)) {
      // flows' own non-conductor skills (diagrams) are listed under flows; other conductors aren't listed at all.
      if (plugin === 'flows') {
        for (const name of names) {
          const own = skills.find((s) => s.name === name);
          if (!own) problems.push(`${at}: flows has no skill ${name}`);
          else if (own.conductor) problems.push(`${at}: ${name} is a conductor; other conductors aren't listed`);
        }
        continue;
      }
      const pack = packNames.includes(plugin);
      const entry = definitions.find((p) => p.name === plugin);
      if (!pack && !entry && plugin !== BUILTIN && !plugin.endsWith(`@${OFFICIAL}`)) {
        problems.push(`${at}: ${plugin} is not a plugin of this marketplace, a pack, …@${OFFICIAL} or ${BUILTIN}`);
        continue;
      }
      // Only packs and local plugins with skills or agents can be checked offline; MCP servers and mods take tool names.
      const dir = pack
        ? join(root, PACKS, plugin)
        : typeof entry?.source === 'string'
          ? join(root, entry.source)
          : undefined;
      const checkable = dir && ['skills', 'agents', 'workflows'].some((d) => existsSync(join(dir, d)));
      const manifestFile = dir && join(dir, 'plugin.json');
      const mcp =
        manifestFile && existsSync(manifestFile)
          ? Object.keys(JSON.parse(readFileSync(manifestFile, 'utf8')).mcpServers ?? {})
          : [];
      for (const name of names) {
        const found =
          mcp.includes(name) ||
          ['skills/' + name + '/SKILL.md', 'agents/' + name + '.md', 'workflows/' + name + '.js'].some((f) =>
            existsSync(join(dir ?? '', f)),
          );
        if (checkable && !found) problems.push(`${at}: ${plugin} has no skill, agent or workflow ${name}`);
      }
    }
  }
  return problems;
}

// Conductors quote the pack sentence they override: <!-- overrides <pack>/<path in pack>: "<sentence>" -->.
// Returns one problem per marker whose pack file is missing or no longer holds the sentence.
// Bold marks and line wraps in the pack don't matter; the vendored packs/ and agents/ are not scanned.
const MARKER = /<!--\s*overrides\s+(\S+?):\s*"(.*)"\s*-->/;
const flat = (t) => t.replace(/[*_]/g, '').replace(/\s+/g, ' ');
// flows' own .md files and steps/*.toml, the vendored packs/ and agents/ left out.
const conductorDocs = (root, dir = FLOWS) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return rel === PACKS || rel === `${FLOWS}/agents` ? [] : conductorDocs(root, rel);
    return e.name.endsWith('.md') || (dir === `${FLOWS}/steps` && e.name.endsWith('.toml')) ? [rel] : [];
  });
export function checkOverrides(root) {
  const problems = [];
  for (const file of conductorDocs(root)) {
    readFileSync(join(root, file), 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        const at = `${file}:${i + 1}`;
        const m = MARKER.exec(line);
        if (!m) {
          if (OVERRIDE.test(line)) problems.push(`${at}: an overrides marker that cannot be read: ${line.trim()}`);
          return;
        }
        const target = join(root, PACKS, m[1]);
        if (!existsSync(target) || !statSync(target).isFile())
          return problems.push(`${at}: overrides ${m[1]}, which is not a file`);
        if (!flat(readFileSync(target, 'utf8')).includes(flat(m[2])))
          problems.push(`${at}: ${m[1]} no longer contains "${m[2]}"`);
      });
  }
  return problems;
}

// The shapes glance and the gates rely on: each part of flow.md, plans and audit reports must stay in the templates and
// the conductor text that make a run write them.
const TEMPLATE_FILES = [
  `${FLOWS}/skills/build-feature/references/flow-template.md`,
  `${FLOWS}/skills/research-feature/references/research-template.md`,
  `${FLOWS}/references/build-template.md`,
];
const AUDIT_FILE = `${FLOWS}/skills/review-code/references/audit-template.md`;
const GATE_STEP = `${FLOWS}/steps/gate.toml`;
const DEVIATIONS_STEP = `${FLOWS}/steps/deviations.toml`;
const PLAN_STEP = `${FLOWS}/steps/plan-shape.toml`;
const GATE_LINE = '- Gate <n>, <what>:';
export function checkShapes(root) {
  const problems = [];
  const need = (file, parts) => {
    const text = readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n');
    for (const [what, has] of parts)
      if (!(typeof has === 'string' ? text.includes(has) : has.test(text))) problems.push(`${file}: lacks ${what}`);
  };
  for (const file of TEMPLATE_FILES)
    need(file, [
      ['`now:` after `phase:` in the frontmatter', /\nphase: [^\n]*\nnow: /],
      [`the gate line shape \`${GATE_LINE}\``, GATE_LINE],
      ['`Picked:`', 'Picked:'],
      // A research run builds nothing, so its template has no Deviations.
      ...(file.includes('research') ? [] : [['`Status:`', 'Status: open']]),
    ]);
  need(DEVIATIONS_STEP, [
    ['the `Waiting for you` rule', 'Waiting for you'],
    ['`Status: decided`', 'Status: decided'],
  ]);
  need(GATE_STEP, [[`the gate line shape \`${GATE_LINE}\``, GATE_LINE]]);
  need(PLAN_STEP, [
    ['`**Does:**`', '**Does:**'],
    ['`**Depends on:**`', '**Depends on:**'],
  ]);
  need(AUDIT_FILE, [
    ['`Picks:`', 'Picks:'],
    ['`Fixed <date>`', 'Fixed <date>'],
  ]);
  return problems;
}

// Every `<packs>/…` or `${CLAUDE_PLUGIN_ROOT}/packs/…` path a conductor names must exist. A path ends at whitespace,
// a backtick, a quote or a bracket; one with a placeholder (`<pack>`, `…`, `*`) is skipped.
// shortcut: bare names (`references/x.md`) and paths broken across a line aren't seen; name the full pack path instead.
const PACK_PATH = /(?:\$\{CLAUDE_PLUGIN_ROOT\}\/packs|<flow-root>\/packs|<packs>)\/([^\s`'"()[\]]+)/g;
export function checkPackPaths(root) {
  const problems = [];
  for (const file of conductorDocs(root)) {
    readFileSync(join(root, file), 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const [, raw] of line.matchAll(PACK_PATH)) {
          const path = raw.replace(/[.,;:]+$/, '');
          if (/[<>…*]/.test(path) || existsSync(join(root, PACKS, path))) continue;
          problems.push(`${file}:${i + 1}: <packs>/${path} does not exist`);
        }
      });
  }
  return problems;
}

// What flows depends on now: its catalog entry's plugins of this repository plus the external plugins of its
// neutral plugin.json, as `name` or `name@marketplace`, sorted.
export function currentDeps(root) {
  const catalog = JSON.parse(readFileSync(join(root, 'plugins/catalog.json'), 'utf8'));
  const internal = catalog.find((p) => p.name === 'flows')?.dependencies ?? [];
  const manifest = JSON.parse(readFileSync(join(root, FLOWS, 'plugin.json'), 'utf8'));
  const external = (manifest.dependencies ?? []).filter((d) => d.marketplace).map((d) => `${d.name}@${d.marketplace}`);
  return [...new Set([...internal, ...external])].sort();
}

// Rewrites flows' dependencies from the conductors: official plugins into plugin.json, the rest into the catalog.
export function writeDeps(root, expected) {
  const external = expected
    .filter((d) => d.includes('@'))
    .map((d) => ({ name: d.split('@')[0], marketplace: d.split('@')[1] }));
  const manifestPath = join(root, FLOWS, 'plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // Claude-only extras (no marketplace) stay as the author wrote them.
  manifest.dependencies = [...external, ...(manifest.dependencies ?? []).filter((d) => !d.marketplace)];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const catalogPath = join(root, 'plugins/catalog.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const flows = catalog.find((p) => p.name === 'flows');
  flows.dependencies = expected.filter((d) => !d.includes('@'));
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
}

// all: Claude Code's composeFlows(…).uses, the harness whose plugin.json and catalog carry the dependencies.
// packNames: packs(root); flows carries those and its own skills, so they are never a dependency.
export const expectedDeps = (all, packNames) =>
  [...new Set(Object.values(all).flatMap((uses) => Object.keys(uses ?? {})))]
    .filter((p) => p !== BUILTIN && p !== 'flows' && !packNames.includes(p))
    .sort();

// byHost: { harness: composeFlows(…).uses }. Draws every harness's uses at once; a name only some harnesses use is
// followed by those harnesses, as `Monitor (claude-code)`.
export function renderTree(byHost) {
  const hosts = Object.entries(byHost);
  const union = (pick) => [...new Set(hosts.flatMap(([, all]) => pick(all) ?? []))];
  const blocks = union(Object.keys).map((conductor) => {
    const rows = union((all) => Object.keys(all[conductor] ?? {}));
    return [
      conductor,
      ...rows.map((p, i) => {
        const names = union((all) => all[conductor]?.[p]).map((n) => {
          const by = hosts.filter(([, all]) => all[conductor]?.[p]?.includes(n)).map(([host]) => host);
          return by.length < hosts.length ? `${n} (${by.join(', ')})` : n;
        });
        return `${i === rows.length - 1 ? '└' : '├'} ${p}: ${names.join(', ')}`;
      }),
    ];
  });
  return [
    '```text',
    ...blocks
      .map((b) => b.join('\n'))
      .join('\n\n')
      .split('\n'),
    '```',
  ].join('\n');
}

// The README with its uses block replaced, or undefined when the markers are missing.
export function withTree(readme, tree) {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) return undefined;
  return `${readme.slice(0, a + START.length)}\n\n${tree}\n\n${readme.slice(b)}`;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const root = join(import.meta.dirname, '..');
  const byHost = {
    'claude-code': composeFlows(join(root, FLOWS), CLAUDE_CODE).uses,
    codex: composeFlows(join(root, FLOWS), CODEX).uses,
  };
  writeDeps(root, expectedDeps(byHost['claude-code'], packs(root)));
  const readmePath = join(root, FLOWS, 'README.md');
  const readme = withTree(readFileSync(readmePath, 'utf8'), renderTree(byHost));
  if (!readme) throw new Error(`${readmePath}: no ${START} … ${END} block`);
  writeFileSync(readmePath, readme);
  execFileSync(process.execPath, [join(root, 'tools/harness-compiler/src/cli.ts'), 'build'], { stdio: 'inherit' });
}
