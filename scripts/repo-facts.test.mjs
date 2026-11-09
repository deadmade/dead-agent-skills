import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { selectChecks } from './ci-changes.mjs';
import { packs } from './flows-uses.mjs';
import { workspacePackages } from './release.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

test('ci-changes routes every Rust package in Cargo.toml', () => {
  assert.deepEqual(
    [...selectChecks([], true).packages].sort(),
    [...workspacePackages()].sort(),
    'Cargo.toml members and scripts/ci-changes.mjs name different Rust packages',
  );
});

test('CI takes its Node version from package.json', () => {
  for (const name of readdirSync(new URL('../.github/workflows/', import.meta.url))) {
    if (!/\.ya?ml$/.test(name)) continue;
    const workflow = read(`.github/workflows/${name}`);
    assert.doesNotMatch(workflow, /\bnode-version:/, name);
    const steps = workflow.split(/(?=^      - )/m);
    for (const step of steps.filter((step) => /uses: actions\/setup-node@/.test(step))) {
      assert.match(step, /^          node-version-file: package\.json$/m, name);
    }
  }
});

test('flake and devEngines agree on the Node major', () => {
  const flake = read('flake.nix');
  const pkg = JSON.parse(read('package.json'));
  const version = pkg.devEngines?.runtime?.version;
  assert.match(version ?? '', /^\^\d+$/);
  const majors = [...flake.matchAll(/\bnodejs_(\d+)\b/g)];
  assert.ok(majors.length > 0);
  for (const [, major] of majors) assert.equal(`^${major}`, version);
  assert.doesNotMatch(flake, /\bpkgs\.nodejs\b|\binherit\s*\(pkgs\)[^;]*\bnodejs\b/);
});

test('hand-typed Night City colours are in the palette', () => {
  const palettePath = 'plugins/default/themes/palette.json';
  const allowed = new Set(Object.values(JSON.parse(read(palettePath)).colors));
  const viewPath = 'tools/installer/ui/view.ts';
  const nightCity = read(viewPath).match(/const NIGHT_CITY = \{([\s\S]*?)\n\};/);
  assert.ok(nightCity, `NIGHT_CITY missing from ${viewPath}`);
  const copies = [
    [
      viewPath,
      [...nightCity[1].matchAll(/\[(\d+),\s*(\d+),\s*(\d+)\]/g)].map(
        ([, ...rgb]) => '#' + rgb.map((n) => Number(n).toString(16).padStart(2, '0')).join(''),
      ),
    ],
  ];
  const deviations = [];
  for (const [path, colors] of copies) {
    assert.ok(colors.length > 0, `No colours found in ${path}`);
    for (const color of colors) {
      if (!allowed.has(color.toUpperCase())) deviations.push(`${color} in ${path} is absent from ${palettePath}`);
    }
  }
  assert.deepEqual(deviations, []);
});

test('run-rules names exactly the packs that exist', () => {
  const names = read('plugins/flows/steps/run-rules.toml').match(/^- \*\*Packs\*\* \(([^)]+)\)/m);
  assert.ok(names, 'run-rules must list its packs');
  assert.deepEqual(
    names[1]
      .split(',')
      .map((name) => name.trim())
      .sort(),
    packs(fileURLToPath(new URL('../', import.meta.url))),
  );
});

test('no file still names the old repository slug', () => {
  let paths;
  try {
    paths = execFileSync(
      'git',
      [
        'grep',
        '-l',
        'deadmade/dead-claude-skills',
        '--',
        '.',
        ...[
          'docs/features',
          'docs/adr',
          'docs/audits',
          'docs/solutions',
          'tools/installer/core/release.test.ts',
          'scripts/repo-facts.test.mjs',
        ].map((path) => `:(exclude)${path}`),
      ],
      { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' },
    );
  } catch (error) {
    if (error.status === 1) return;
    throw error;
  }
  assert.fail(`${paths.trim()} still names the old repository; use package.json's repository`);
});
