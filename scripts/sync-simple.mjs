import { ROOT, addPaths, fail, finish, git, sparseClone } from './sync-lib.mjs';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (process.argv[2] === 'rust') {
  // Vendor apollographql/skills' rust-best-practices skill into its own plugin, adding `paths:` frontmatter (Claude Code currently ignores it for plugin skills; kept for when it does not).
  // Idempotent: re-running against the same upstream commit produces no diff.

  const UPSTREAM_URL = 'https://github.com/apollographql/skills.git';
  const GLOBS = ['**/*.rs', '**/Cargo.toml', '**/Cargo.lock'];

  const PLUGIN = join(ROOT, 'plugins', 'opt-in', 'implementation', 'rust-skills');
  const DEST = join(PLUGIN, 'skills', 'rust-best-practices');

  const up = sparseClone(UPSTREAM_URL, ['skills/rust-best-practices']);
  const SRC = join(up, 'skills', 'rust-best-practices');
  if (!existsSync(join(SRC, 'SKILL.md'))) fail('upstream skills/rust-best-practices/SKILL.md not found');

  rmSync(join(PLUGIN, 'skills'), { recursive: true, force: true });
  mkdirSync(DEST, { recursive: true });
  cpSync(SRC, DEST, { recursive: true });
  cpSync(join(up, 'LICENSE'), join(PLUGIN, 'LICENSE'));

  const out = addPaths(readFileSync(join(DEST, 'SKILL.md'), 'utf8'), GLOBS);
  if (out === null) fail('unexpected SKILL.md frontmatter upstream (no --- block, or paths: already present)');
  writeFileSync(join(DEST, 'SKILL.md'), out);

  finish('rust-skills', git('-C', up, 'rev-parse', 'HEAD'), join(PLUGIN, 'UPSTREAM'), PLUGIN);
}

if (process.argv[2] === 'security-audit') {
  // Vendor cloudflare/security-audit-skill's security-audit skill, unchanged, into plugins/flows/packs/security-audit/.
  // /harden reads its domain files ("When to use this file") and its candidate-verifier prompt by path.
  // Idempotent: re-running against the same upstream commit produces no diff.

  const UPSTREAM_URL = 'https://github.com/cloudflare/security-audit-skill.git';
  const PLUGIN = join(ROOT, 'plugins', 'flows', 'packs', 'security-audit');
  const DEST = join(PLUGIN, 'skills', 'security-audit');

  const up = sparseClone(UPSTREAM_URL, ['skills/security-audit']);
  const src = join(up, 'skills', 'security-audit');
  if (!existsSync(join(src, 'SKILL.md')))
    fail('upstream skills/security-audit/SKILL.md not found (renamed or removed?)');

  rmSync(DEST, { recursive: true, force: true });
  cpSync(src, DEST, { recursive: true });
  cpSync(join(up, 'LICENSE'), join(PLUGIN, 'LICENSE'));

  finish('security-audit', git('-C', up, 'rev-parse', 'HEAD'), join(PLUGIN, 'UPSTREAM'), PLUGIN);
}

if (process.argv[2] === 'postgres') {
  // Vendor two upstream Postgres skills into the postgres database plugin: Neon's postgres-best-practices
  // and Timescale pg-aiguide's postgres-database-migration. Each skill folder carries its upstream's LICENSE (and NOTICE)
  // and its own UPSTREAM, since the two come from different repos. Each SKILL.md gets `paths:` frontmatter (Claude Code
  // currently ignores it for plugin skills; kept for when it does not).
  // Idempotent: re-running against the same upstream commits produces no diff.

  const GLOBS = ['**/*.sql', '**/migrations/**', '**/migrate/**', '**/*.prisma', '**/alembic/**'];

  const SKILLS = join(ROOT, 'plugins', 'opt-in', 'implementation', 'postgres', 'skills');

  const UPSTREAMS = [
    {
      url: 'https://github.com/neondatabase/postgres-skills.git',
      path: 'skills/postgres-best-practices',
      name: 'postgres-best-practices',
      extra: [],
    },
    {
      url: 'https://github.com/timescale/pg-aiguide.git',
      path: 'skills/postgres-database-migration',
      name: 'postgres-database-migration',
      extra: ['NOTICE'],
    },
  ];

  for (const { url, path, name, extra } of UPSTREAMS) {
    const up = sparseClone(url, [path]);
    const src = join(up, path);
    if (!existsSync(join(src, 'SKILL.md'))) fail(`${url}: ${path}/SKILL.md not found`);
    // A copied symlink would point outside the plugin once installed.
    for (const f of readdirSync(src, { recursive: true })) {
      if (lstatSync(join(src, f)).isSymbolicLink()) fail(`${url}: ${path}/${f} is a symlink`);
    }

    const dest = join(SKILLS, name);
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    for (const f of ['LICENSE', ...extra]) {
      if (!existsSync(join(up, f))) fail(`${url}: ${f} not found at the repo root`);
      cpSync(join(up, f), join(dest, f));
    }

    const out = addPaths(readFileSync(join(dest, 'SKILL.md'), 'utf8'), GLOBS);
    if (out === null) fail(`${url}: unexpected SKILL.md frontmatter (no --- block, or paths: already present)`);
    writeFileSync(join(dest, 'SKILL.md'), out);

    finish(name, git('-C', up, 'rev-parse', 'HEAD'), join(dest, 'UPSTREAM'), dest);
  }
}
