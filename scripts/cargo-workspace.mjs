// Enforces one Cargo workspace and inherited package and dependency settings. Paths in problems use `/` on every system.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';

export function checkCargoWorkspace(root) {
  const problems = [];
  const { workspace } = parse(readFileSync(join(root, 'Cargo.toml'), 'utf8'));
  const members = new Set(workspace.members.map((member) => `${member}/Cargo.toml`));
  if (!existsSync(join(root, 'Cargo.lock'))) problems.push('missing root Cargo.lock');
  // Do not inspect target directories, which can contain vendored dependency manifests.
  const manifests = (folder) =>
    readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
      if (['target', 'node_modules', '__pycache__'].includes(entry.name)) return [];
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory()) return manifests(path);
      return entry.name === 'Cargo.toml' || entry.name === 'Cargo.lock' ? [path] : [];
    });
  for (const path of manifests('tools')) {
    if (path.endsWith('/Cargo.lock')) {
      problems.push(`${path}: use the root lockfile`);
      continue;
    }
    const data = parse(readFileSync(join(root, path), 'utf8'));
    if ('workspace' in data) problems.push(`${path}: nested workspace`);
    if (!members.has(path)) problems.push(`${path}: not a workspace member`);
    for (const key of ['version', 'edition', 'rust-version', 'license', 'publish']) {
      const v = data.package?.[key];
      if (!(v?.workspace === true && Object.keys(v).length === 1)) problems.push(`${path}: ${key} must be inherited`);
    }
    for (const section of [data, ...Object.values(data.target ?? {})]) {
      for (const kind of ['dependencies', 'build-dependencies', 'dev-dependencies']) {
        for (const [name, dep] of Object.entries(section[kind] ?? {})) {
          if (
            typeof dep !== 'object' ||
            dep.workspace !== true ||
            ['version', 'path', 'git', 'registry'].some((key) => key in dep)
          )
            problems.push(`${path}: ${kind}.${name} must inherit its source and version`);
          if (!Object.hasOwn(workspace.dependencies ?? {}, name))
            problems.push(`${path}: ${name} missing from workspace.dependencies`);
        }
      }
    }
  }
  for (const path of members) if (!existsSync(join(root, path))) problems.push(`${path}: missing member`);
  return problems;
}
