// Build and validate first; replace only the owned generated trees and catalogs.
import { mkdirSync, mkdtempSync, renameSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildPackages, nativeMarketplace } from '../tools/installer/system/packages.ts';
import { renderClaudeTheme } from '../tools/installer/core/themes.ts';
const root = join(import.meta.dirname, '..');
const staging = mkdtempSync(join(root, '.native-build-'));
try {
  const { diagnostics } = buildPackages(root, join(staging, 'portable'));
  for (const diagnostic of diagnostics)
    console.log(
      `[${[diagnostic.target, diagnostic.plugin, diagnostic.event].filter(Boolean).join('/')}] ${diagnostic.message}`,
    );
  const theme = renderClaudeTheme(JSON.parse(readFileSync(join(root, 'plugins/default/themes/palette.json'), 'utf8')));
  writeFileSync(join(root, 'plugins/default/themes/night-city.json'), JSON.stringify(theme, null, 2) + '\n');
  for (const [target, file, prefix] of [
    ['codex', '.agents/plugins/marketplace.json', './portable/plugins'],
    ['claude-code', '.claude-plugin/marketplace.json', './portable/claude-code/plugins'],
  ]) {
    const dest = join(staging, file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(nativeMarketplace(root, target, prefix), null, 2) + '\n');
  }
  rmSync(join(root, 'portable'), { recursive: true, force: true });
  renameSync(join(staging, 'portable'), join(root, 'portable'));
  for (const file of ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json']) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    renameSync(join(staging, file), join(root, file));
  }
  console.log('Updated both native distributions and repository marketplaces.');
} finally {
  rmSync(staging, { recursive: true, force: true });
}
