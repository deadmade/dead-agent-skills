import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { selectChecks } from './ci-changes.mjs';
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
