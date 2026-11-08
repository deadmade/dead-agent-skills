import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CODEX_MARKETPLACE } from './agents.ts';
import { MARKETPLACE, marketplaceArg, installerUrl, newerInstaller, pinMarketplace } from './release.ts';
import { type Settings } from './settings.ts';

const repository = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).repository;
const M = 'dead-claude-skills';

test('installer marketplace names match their generated owners', () => {
  for (const [path, name] of [
    ['.claude-plugin/marketplace.json', MARKETPLACE],
    ['.agents/plugins/marketplace.json', CODEX_MARKETPLACE],
  ]) {
    const marketplace = JSON.parse(
      readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    );
    assert.equal(name, marketplace.name, path);
  }
});

test('the marketplace follows its release branch; the installer comes from its own release', () => {
  assert.equal(marketplaceArg(), `${repository}@release`);
  assert.equal(installerUrl('1.2.3'), `https://github.com/${repository}/releases/download/v1.2.3/installer.tgz`);
  assert.equal(newerInstaller(installerUrl('1.10.0'), '1.9.9'), '1.10.0');
  for (const location of [installerUrl('1.2.3'), installerUrl('1.2.2'), null, 'https://example.com/v9.0.0/x.tgz'])
    assert.equal(newerInstaller(location, '1.2.3'), undefined);
  const pinned = { source: 'github', repo: repository, ref: 'release' };
  for (const source of [
    { source: 'github', repo: 'deadmade/dead-claude-skills' },
    { source: 'github', repo: 'deadmade/dead-claude-skills', ref: 'v1.2.3' },
  ]) {
    const before: Settings = { model: 'x', extraKnownMarketplaces: { [M]: { source, autoUpdate: true } } };
    const out = pinMarketplace(before);
    assert.deepEqual(out.extraKnownMarketplaces![M], { source: pinned, autoUpdate: true });
    assert.equal(out.model, 'x');
    assert.deepEqual(before.extraKnownMarketplaces![M].source, source);
    // Unchanged settings come back as the same object, so nothing is written.
    assert.equal(pinMarketplace(out), out);
  }
  // No entry yet: the add writes it.
  const none = { model: 'x' };
  assert.equal(pinMarketplace(none), none);
});

test('an installed old repository moves to the package owner and keeps entry settings', () => {
  const repository = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).repository;
  const before = {
    extraKnownMarketplaces: {
      [M]: { source: { source: 'github', repo: 'deadmade/dead-claude-skills', ref: 'release' }, autoUpdate: true },
    },
    model: 'x',
  };
  const out = pinMarketplace(before);
  assert.equal(out.extraKnownMarketplaces![M].source!.repo, repository);
  assert.equal(out.extraKnownMarketplaces![M].autoUpdate, true);
  assert.equal(out.model, 'x');
});
