// Shared routing for CI. Unknown paths run everything so new components cannot silently lose coverage.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const crates = ['web-mcp', 'ado-mcp', 'flow-cockpit'];
const roots = {
  'web-mcp': ['tools/web-mcp/', 'plugins/shared/web-mcp/'],
  'ado-mcp': ['tools/ado-mcp/', 'plugins/opt-in/mcp/mcp-azure/'],
  'flow-cockpit': ['tools/flow-cockpit/', 'plugins/opt-in/flow-cockpit/'],
};

export function selectChecks(paths, all = false) {
  const selected = new Set();
  let node = all;
  let skills = all;
  const everything = () => {
    node = skills = true;
    crates.forEach((c) => selected.add(c));
  };
  if (all) everything();
  for (const path of paths) {
    const crate = crates.find((c) => roots[c].some((root) => path.startsWith(root)));
    if (crate) {
      selected.add(crate);
      // Manifests also participate in repository/package consistency checks.
      if (path.startsWith('plugins/') || path.endsWith('/Cargo.toml')) node = true;
      if (path.startsWith('plugins/')) skills = true;
      continue;
    }
    if (path.startsWith('docs/')) continue;
    if (
      /^(Cargo\.(toml|lock)|flake\.(nix|lock)|package(-lock)?\.json)$/.test(path) ||
      path.startsWith('.cargo/') ||
      path.startsWith('rust-toolchain') ||
      path.startsWith('.github/workflows/') ||
      path.startsWith('scripts/ci-changes') ||
      path.startsWith('scripts/check_cargo_workspace')
    ) {
      everything();
    } else if (path.startsWith('plugins/') || path.startsWith('tools/harness-compiler/')) {
      node = skills = true;
      // Cockpit tests consume flow templates and the compiler's composed skills.
      if (path.startsWith('plugins/flows/') || path.startsWith('tools/harness-compiler/')) selected.add('flow-cockpit');
    } else if (
      path.startsWith('tools/installer/') ||
      path.startsWith('tools/upstream-sync/') ||
      path.startsWith('scripts/') ||
      path === 'tsconfig.json' ||
      /^[^/]+\.md$/.test(path)
    ) {
      node = true;
    } else if (path === '.github/skill-scanner.yaml') {
      skills = true;
    } else {
      everything();
    }
  }
  const binaries = crates.filter((c) => selected.has(c));
  const packages = binaries.flatMap((c) => (c === 'flow-cockpit' ? ['flow-cockpit-core', c] : [c]));
  return { node, skills, rust: packages.length > 0, binaries, packages };
}

export function changedPaths(eventName, event, git = (args) => execFileSync('git', args, { encoding: 'utf8' })) {
  let range;
  if (eventName === 'pull_request') {
    range = `${event.pull_request.base.sha}...${event.pull_request.head.sha}`;
  } else if (eventName === 'push' && event.before && !/^0+$/.test(event.before)) {
    range = `${event.before}..${event.after}`;
  } else return null; // Manual runs, initial pushes and releases get full coverage.
  // No rename detection: both the deleted and added paths must participate in routing.
  return git(['diff', '--name-only', '--no-renames', '-z', range, '--']).split('\0').filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const paths = process.env.CI_FULL === 'true' ? null : changedPaths(process.env.GITHUB_EVENT_NAME, event);
  const checks = selectChecks(paths ?? [], paths === null);
  console.log(JSON.stringify({ paths, ...checks }, null, 2));
  for (const [name, value] of Object.entries(checks)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${JSON.stringify(value)}\n`);
  }
}
