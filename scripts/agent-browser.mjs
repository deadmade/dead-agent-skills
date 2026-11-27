// CI's agent-browser, one script for test.yml and crates.yml: the pin, the browsers' cache key, the download and
// Chrome for Testing. Plain Node and the installer's own modules, because crates.yml runs it without `npm ci`.
//   key             writes `key=<the browsers' cache key>` to GITHUB_OUTPUT
//   download <dir>  downloads the pinned, checksum-checked agent-browser into <dir> and prints its path
//   install <bin>   runs `<bin> install`, which fetches the Chrome for Testing ~/.agent-browser/browsers lacks
import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOOLS, resolveTool } from '../tools/installer/core/tools.ts';
import { downloadBin } from '../tools/installer/system/net.ts';
import { startSync } from '../tools/installer/system/proc.ts';

const [command, path] = process.argv.slice(2);
if (command === 'key') {
  const key = `agent-browser-browsers-${process.env.RUNNER_OS}-${TOOLS.tools['agent-browser'].version}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `key=${key}\n`);
  console.log(key);
} else if (command === 'download' && path) {
  const bin = join(resolve(path), process.platform === 'win32' ? 'agent-browser.exe' : 'agent-browser');
  await downloadBin('agent-browser', resolveTool('agent-browser', process.platform, process.arch, '0.0.0'), bin);
  console.log(bin);
} else if (command === 'install' && path) {
  process.exitCode = startSync(resolve(path), ['install'], { stdio: 'inherit' }).status ?? 1;
} else {
  console.error('usage: node scripts/agent-browser.mjs key | download <dir> | install <bin>');
  process.exitCode = 2;
}
