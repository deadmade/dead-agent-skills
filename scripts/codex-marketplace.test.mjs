import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { selectTarget } from '../installer/core/catalog.ts';
import { readCatalog } from '../installer/system/catalog.ts';
import { checkCodex } from './check-codex.mjs';
import { buildPackages, nativeMarketplace } from '../installer/system/packages.ts';

test('repository checks reject missing, stale and unexpected Codex distribution files', () => {
  const root = mkdtempSync(join(tmpdir(), 'marketplace-drift-'));
  const source = resolve(import.meta.dirname, '..');
  try {
    for (const path of [
      'package.json',
      'installer/assets/azure-mcp.mjs',
      'THIRD_PARTY.md',
      'plugins/default/rules.md',
      'catalog/plugins.json',
    ]) {
      const dest = join(root, path);
      mkdirSync(join(dest, '..'), { recursive: true });
      cpSync(join(source, path), dest);
    }
    // Copy only distribution inputs, never ignored build trees or node_modules from a developer checkout.
    for (const entry of readCatalog(source).filter((p) => typeof p.source === 'string')) {
      const src = join(source, entry.source),
        dest = join(root, entry.source);
      mkdirSync(join(dest, '.claude-plugin'), { recursive: true });
      cpSync(join(src, '.claude-plugin/plugin.json'), join(dest, '.claude-plugin/plugin.json'));
      for (const resource of [...entry.resources, ...(entry.overlays['claude-code'] ?? [])])
        cpSync(join(src, resource), join(dest, resource), { recursive: true });
      for (const name of readdirSync(src).filter((name) => /^(LICENSE|NOTICE|UPSTREAM|COPYING|THIRD_PARTY)/.test(name)))
        cpSync(join(src, name), join(dest, name), { recursive: true });
    }
    for (const path of [
      'skills/setup-night-city',
      'hooks/runtime',
      'hooks/lib.mjs',
      'hooks/rules.mjs',
      'hooks/shared.json',
      'hooks/hooks.json',
      'icon.png',
    ])
      cpSync(join(source, 'plugins/default', path), join(root, 'plugins/default', path), { recursive: true });
    buildPackages(root, join(root, 'portable'));
    mkdirSync(join(root, '.agents/plugins'), { recursive: true });
    writeFileSync(
      join(root, '.agents/plugins/marketplace.json'),
      JSON.stringify(nativeMarketplace(root, 'codex', './portable/plugins')),
    );
    mkdirSync(join(root, '.claude-plugin'), { recursive: true });
    writeFileSync(
      join(root, '.claude-plugin/marketplace.json'),
      JSON.stringify(nativeMarketplace(root, 'claude-code', './portable/claude-code/plugins')),
    );
    assert.deepEqual(checkCodex(root), []);
    writeFileSync(join(root, 'portable/plugins/flows/README.md'), 'stale');
    writeFileSync(join(root, 'portable/unexpected.txt'), 'extra');
    writeFileSync(join(root, 'portable/claude-code/plugins/dead-skills/hooks/hooks.json'), '{}');
    writeFileSync(join(root, '.claude-plugin/marketplace.json'), '{}');
    rmSync(join(root, 'portable/plugins/postgres/.codex-plugin/plugin.json'));
    writeFileSync(join(root, '.agents/plugins/marketplace.json'), '{}');
    const problems = checkCodex(root).join('\n');
    assert.match(problems, /flows\/README.md/);
    assert.match(problems, /claude-code\/plugins\/dead-skills\/hooks/);
    assert.match(problems, /\.claude-plugin\/marketplace.json/);
    assert.match(problems, /unexpected.txt/);
    assert.match(problems, /postgres\/\.codex-plugin\/plugin.json/);
    assert.match(problems, /\.agents\/plugins\/marketplace.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
