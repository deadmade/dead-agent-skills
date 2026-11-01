// The committed distribution is what Git marketplace consumers install. Detect stale or extra artifacts.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPackages, nativeMarketplace } from '../installer/system/packages.ts';

import { renderClaudeTheme } from '../installer/core/themes.ts';

export function checkHarnesses(root) {
  const temp = mkdtempSync(join(tmpdir(), 'harness-marketplace-check-'));
  const problems = [];
  const files = (dir) =>
    existsSync(dir)
      ? readdirSync(dir, { recursive: true, encoding: 'utf8', withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
      : [];
  try {
    buildPackages(root, temp);
    const theme = join(root, 'plugins/default/themes/night-city.json');
    const expectedTheme =
      JSON.stringify(
        renderClaudeTheme(JSON.parse(readFileSync(join(root, 'plugins/default/themes/palette.json'), 'utf8'))),
        null,
        2,
      ) + '\n';
    if (!existsSync(theme) || readFileSync(theme, 'utf8').replaceAll('\r\n', '\n') !== expectedTheme)
      problems.push('plugins/default/themes/night-city.json: stale or missing; run npm run build:harnesses');
    const committed = join(root, 'portable');
    const expected = files(temp);
    for (const file of new Set([...expected, ...files(committed)])) {
      if (
        !existsSync(join(temp, file)) ||
        !existsSync(join(committed, file)) ||
        !readFileSync(join(temp, file)).equals(readFileSync(join(committed, file)))
      )
        problems.push(`portable/${file}: stale or missing; run npm run build:harnesses`);
    }
    for (const [target, file, prefix] of [
      ['codex', '.agents/plugins/marketplace.json', './portable/plugins'],
      ['claude-code', '.claude-plugin/marketplace.json', './portable/claude-code/plugins'],
    ]) {
      const catalog = join(root, file);
      if (
        !existsSync(catalog) ||
        JSON.stringify(JSON.parse(readFileSync(catalog, 'utf8'))) !==
          JSON.stringify(nativeMarketplace(root, target, prefix))
      )
        problems.push(`${file}: stale or missing; run npm run build:harnesses`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const problems = checkHarnesses(resolve(import.meta.dirname, '..'));
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('Native repository marketplaces and packages are current.');
}
