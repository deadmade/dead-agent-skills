// Cuts a release: one version for package.json (and its lock) and both crates; the plugin manifests and marketplaces
// are generated from it (tools/harness-compiler). Committed and tagged vX.Y.Z on main. Pushing the tag runs
// .github/workflows/release.yml, which builds the installer, tui-review and web-mcp and publishes the GitHub release. Claude Code only offers plugin
// updates when this version changes. --detach commits off main instead, leaving the branch where it was: release.yml
// does that for the patch it cuts on every merge to main.
// Usage: npm run release -- patch|minor|major|X.Y.Z [--detach]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// The version a release gets: `bump` (patch, minor, major or X.Y.Z) applied to the highest of package.json's version
// and the vX.Y.Z tags. A release cut on every merge to main stamps its commit off main, so main's package.json lags
// behind the tags; counting from the tags keeps the next number past both.
const parse = (v) =>
  /^v?(\d+)\.(\d+)\.(\d+)$/
    .exec(v ?? '')
    ?.slice(1)
    .map(Number);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function nextVersion(current, tags, bump) {
  const base = [current, ...tags].map(parse).filter(Boolean).sort(cmp).at(-1);
  if (!base) return undefined;
  const [major, minor, patch] = base;
  const next =
    { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[bump] ??
    bump;
  return /^\d+\.\d+\.\d+$/.test(next ?? '') ? next : undefined;
}

function main() {
  process.chdir(join(import.meta.dirname, '..'));

  const die = (msg) => {
    console.error(`✗ ${msg}`);
    process.exit(1);
  };
  const git = (...args) => {
    const r = spawnSync('git', args, { encoding: 'utf8' });
    if (r.status !== 0) die(`git ${args.join(' ')} failed:\n${r.stderr}`);
    return r.stdout.trim();
  };
  const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' }).status === 0;

  const args = process.argv.slice(2);
  const detach = args.includes('--detach');
  const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const next = nextVersion(
    current,
    git('tag', '--list', 'v*').split('\n'),
    args.find((a) => a !== '--detach'),
  );
  if (!next) die('usage: npm run release -- patch|minor|major|X.Y.Z [--detach]');

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') die(`releases are cut from main, you are on ${branch}`);
  if (git('status', '--porcelain')) die('working tree is not clean');
  if (git('tag', '--list', `v${next}`)) die(`tag v${next} already exists`);

  // Each file's own version line, edited in place so the rest of the file keeps its formatting. JSON: the top-level
  // (or marketplace metadata) "version"; package-lock.json also its root package's. Each Rust crate: its version, and its
  // entry in Cargo.lock so --locked builds pass.
  const json = /^( {2,4}"version": )"[^"]*"/m;
  const bumps = [
    ['package.json', json],
    ['package-lock.json', json],
    ['package-lock.json', /^( {6}"version": )"[^"]*"/m],
    ...[
      ['crates/tui-review', 'tui-review'],
      ['crates/web-mcp', 'web-mcp'],
      ['crates/flow-cockpit', 'flow-cockpit-core'],
      ['crates/flow-cockpit', 'flow-cockpit'],
      ['crates/ado-mcp', 'ado-mcp'],
    ].flatMap(([dir, name]) => [
      [`${dir}/Cargo.toml`, /^(version = )"[^"]*"/m],
      [`${dir}/Cargo.lock`, new RegExp(`^(name = "${name}"\\r?\\nversion = )"[^"]*"`, 'm')],
    ]),
  ];
  const files = [...new Set([...bumps.map(([f]) => f), '.claude-plugin', '.agents/plugins'])];
  for (const [f, version] of bumps) {
    const text = readFileSync(f, 'utf8');
    if (!version.test(text)) die(`${f} has no version to bump`);
    writeFileSync(f, text.replace(version, `$1"${next}"`));
  }

  if (!run(process.execPath, ['tools/harness-compiler/src/cli.ts', 'build']) || !run('npm', ['test'])) {
    git('checkout', '--', ...files);
    die('checks failed, versions reverted');
  }

  if (detach) git('checkout', '--detach');
  // Releasing the version already on main (the first release) only tags.
  if (git('status', '--porcelain')) git('commit', '-m', `Release v${next}`, '--', ...files);
  git('tag', '-a', `v${next}`, '-m', `v${next}`);
  const push = detach ? `git push origin v${next}` : 'git push --follow-tags origin main';
  console.log(`\n✓ v${current} → v${next}, committed and tagged. Publish with:\n\n    ${push}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
