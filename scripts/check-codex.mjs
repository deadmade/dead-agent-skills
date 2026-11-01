// Compatibility entry point; all native distributions share one freshness check.
export { checkHarnesses as checkCodex } from './check-harnesses.mjs';
import { checkHarnesses } from './check-harnesses.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const problems = checkHarnesses(resolve(import.meta.dirname, '..'));
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('Native repository marketplaces and packages are current.');
}
