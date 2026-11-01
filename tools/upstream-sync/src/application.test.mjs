import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { apply, artifactDirectory, assertClean, preview, source, sync } from './application.ts';
import { sources } from './sources.ts';
import { execute, createContext } from './system/context.ts';
import { formatOutputs, hasTitle, newSkillIssue, issues, failed, passed } from './github.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'user.name=test',
        '-c',
        'user.email=test@example.com',
        '-C',
        repo,
        ...args,
      ],
      {
        encoding: 'utf8',
        env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
      },
    ).trim();
  git('init', '--quiet');
  git('config', 'uploadpack.allowFilter', 'true');
  const write = (path, text) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  const commit = () => {
    git('add', '-A');
    git('commit', '--quiet', '-m', 'fixture');
  };
  return { dir, repo, git, write, commit };
}

test('all registered sources validate the current tree and all adapters are represented', () => {
  const all = sources(ROOT);
  assert.equal(new Set(all.map((s) => s.name)).size, 16);
  assert.equal(new Set(all.map((s) => s.adapter)).size, 12);
  for (const s of all) {
    for (const p of s.paths) assert.ok(existsSync(join(ROOT, p)), p);
    s.check({ tag: 'v1.2.3' });
    assert.ok(s.bodyFrom === 'adapter' || s.body);
  }
  assert.throws(() => source(ROOT, '../bad'), /unknown source/);
  const uv = source(ROOT, 'uv');
  assert.match(uv.title(uv.check({})), /^Pin uv to \d+\.\d+\.\d+$/);
});

test('preview excludes dirty files, includes binary/add/delete changes and removes worktree', (t) => {
  const f = fixture(t);
  const dest = 'plugins/opt-in/implementation/rust-skills';
  f.write(`${dest}/old`, 'committed\n');
  f.write('unrelated', 'before\n');
  f.commit();
  f.write(`${dest}/old`, 'local dirty\n');
  f.write('unrelated', 'local\n');
  f.write('untracked', 'keep\n');
  const before = f.git('status', '--porcelain');
  const diff = preview(
    f.repo,
    'rust-skills',
    undefined,
    execute,
    () => {},
    (root, spec) => {
      assert.equal(readFileSync(join(root, dest, 'old'), 'utf8'), 'committed\n');
      rmSync(join(root, dest, 'old'));
      writeFileSync(join(root, dest, 'new'), 'new\n');
      writeFileSync(join(root, dest, 'binary'), Buffer.from([0, 1, 2]));
      return { title: 'Preview', result: { newSkills: [] } };
    },
  );
  assert.match(diff, /deleted file/);
  assert.match(diff, /new file/);
  assert.match(diff, /GIT binary patch/);
  assert.equal(f.git('status', '--porcelain'), before);
  assert.equal(f.git('worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
  assert.throws(
    () =>
      preview(
        f.repo,
        'rust-skills',
        undefined,
        execute,
        () => {},
        () => {
          throw new Error('adapter failed');
        },
      ),
    /adapter failed/,
  );
  assert.equal(f.git('worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
});

test('apply cleanliness checks include staged and untracked destination files, preserve unrelated changes', (t) => {
  const f = fixture(t);
  f.write('dest/a', 'a');
  f.write('other', 'a');
  f.commit();
  f.write('other', 'dirty');
  assertClean(f.repo, ['dest']);
  f.write('dest/new', 'new');
  assert.throws(() => assertClean(f.repo, ['dest']), /local changes/);
  f.git('add', 'dest/new');
  assert.throws(() => assertClean(f.repo, ['dest']), /local changes/);
});

test('Rust adapter copies and rewrites from a local upstream and is idempotent', (t) => {
  const upstream = fixture(t);
  upstream.write('skills/rust-best-practices/SKILL.md', '---\nname: rust-best-practices\n---\nbody\n');
  upstream.write('LICENSE', 'MIT');
  upstream.commit();
  const target = fixture(t);
  const dest = 'plugins/opt-in/implementation/rust-skills';
  target.write('.claude-plugin/marketplace.json', '{}');
  target.write(`${dest}/.claude-plugin/plugin.json`, '{}');
  target.write(`${dest}/UPSTREAM`, 'old\n');
  target.commit();
  const runner = (program, args, cwd) =>
    execute(
      program,
      args.map((a) => (a === 'https://github.com/apollographql/skills.git' ? upstream.repo : a)),
      cwd,
    );
  const result = sync(
    target.repo,
    source(target.repo, 'rust-skills'),
    join(target.dir, 'temp'),
    undefined,
    runner,
    () => {},
  );
  assert.match(readFileSync(join(target.repo, dest, 'skills/rust-best-practices/SKILL.md'), 'utf8'), /^paths:/m);
  assert.equal(result.result.revisions[0].sha, upstream.git('rev-parse', 'HEAD'));
  target.commit();
  sync(target.repo, source(target.repo, 'rust-skills'), join(target.dir, 'temp2'), undefined, runner, () => {});
  assert.equal(target.git('status', '--porcelain'), '');
  upstream.write('unrelated', 'new upstream commit');
  upstream.commit();
  sync(target.repo, source(target.repo, 'rust-skills'), join(target.dir, 'temp3'), undefined, runner, () => {});
  assert.equal(target.git('status', '--porcelain'), '');
});

test('pin adapter returns structured results and missing digests fail', (t) => {
  const f = fixture(t);
  f.write('installer/assets/uv.json', '{}');
  f.commit();
  const runner = (program) => {
    assert.equal(program, 'gh');
    return JSON.stringify({
      tag_name: '1.2.3',
      assets: [
        { name: 'uv-x86_64-pc-windows-msvc.zip', digest: `sha256:${'a'.repeat(64)}` },
        { name: 'uv-x86_64-unknown-linux-musl.tar.gz', digest: `sha256:${'b'.repeat(64)}` },
      ],
    });
  };
  const result = sync(f.repo, source(f.repo, 'uv'), f.dir, undefined, runner, () => {});
  assert.equal(result.title, 'Pin uv to 1.2.3');
  assert.equal(result.result.values.tag, '1.2.3');
  assert.throws(
    () =>
      createContext(f.repo, f.dir, '', undefined, () => JSON.stringify({ tag_name: '1.2.3', assets: [] })).syncPin({
        repo: 'x',
        out: 'x',
        files: { x: 'x' },
        tagPattern: /^(.*)$/,
      }),
    /digest/,
  );
});

test('GitHub output handles multiline fields and new skill policy retains source links', () => {
  const out = formatOutputs({ title: 'Sync x', paths: 'a\nb' });
  assert.match(out, /^title=Sync x\npaths<<(EOF_[\w-]+)\na\nb\n\1\n$/);
  assert.equal(hasTitle('a: pr\na: pr-two', 'a: pr'), true);
  assert.equal(hasTitle('a: pr-two', 'a: pr'), false);
  const issue = newSkillIssue(source(ROOT, 'mattpocock-picks').newSkills, 'engineering/pr', '');
  assert.equal(issue.title, 'New upstream skill in mattpocock/skills: pr');
  assert.match(issue.body, /tree\/main\/skills\/engineering\/pr/);
  assert.match(issue.body, /no description/);
});

test('GitHub issue operations deduplicate and successful reports close failures', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-results-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const previous = process.env.RUNNER_TEMP;
  process.env.RUNNER_TEMP = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = previous;
  });
  const artifact = artifactDirectory('mattpocock-picks');
  mkdirSync(artifact, { recursive: true });
  writeFileSync(
    join(artifact, 'result.json'),
    JSON.stringify({
      source: 'mattpocock-picks',
      result: { newSkills: [{ name: 'engineering/pr', description: 'desc' }] },
    }),
  );
  const calls = [];
  const gh = (...args) => {
    calls.push(args);
    return 'New upstream skill in mattpocock/skills: pr';
  };
  issues(gh, 'mattpocock-picks', source(ROOT, 'mattpocock-picks').newSkills);
  assert.equal(calls.length, 1);
  const missing = (...args) => {
    calls.push(args);
    if (args[1] === 'create') assert.match(readFileSync(args.at(-1), 'utf8'), /desc/);
    return '';
  };
  issues(missing, 'mattpocock-picks', source(ROOT, 'mattpocock-picks').newSkills);
  assert.equal(calls.at(-1)[1], 'create');
  const reports = (...args) => {
    calls.push(args);
    return args[1] === 'list' ? '[{"number":42,"title":"Sync uv failing"}]' : '';
  };
  failed(reports, 'uv', 'https://example.com/run');
  assert.equal(calls.at(-1)[1], 'comment');
  passed(reports, 'uv', 'https://example.com/run');
  assert.equal(calls.at(-1)[1], 'close');
  // A failed apply must invalidate earlier results before the destination check.
  const f = fixture(t);
  f.write('installer/assets/uv.json', '{}');
  f.commit();
  f.write('installer/assets/uv.json', 'dirty');
  const uvdir = artifactDirectory('uv');
  mkdirSync(uvdir, { recursive: true });
  writeFileSync(join(uvdir, 'result.json'), '{}');
  assert.throws(() => apply(f.repo, 'uv'), /local changes/);
  assert.equal(existsSync(join(uvdir, 'result.json')), false);
});

test('Postgres adapter records both local upstream revisions and preserves NOTICE', (t) => {
  const neon = fixture(t),
    pg = fixture(t),
    target = fixture(t);
  const a = 'postgres-best-practices',
    b = 'postgres-database-migration';
  for (const [f, name] of [
    [neon, a],
    [pg, b],
  ]) {
    f.write(`skills/${name}/SKILL.md`, `---\nname: ${name}\n---\nbody\n`);
    f.write('LICENSE', 'MIT');
    if (f === pg) f.write('NOTICE', 'notice');
    f.commit();
  }
  const dest = 'plugins/opt-in/implementation/postgres';
  target.write('.claude-plugin/marketplace.json', '{}');
  target.write(`${dest}/.claude-plugin/plugin.json`, '{}');
  for (const name of [a, b]) target.write(`${dest}/skills/${name}/UPSTREAM`, 'old\n');
  target.commit();
  const runner = (program, args, cwd) =>
    execute(
      program,
      args.map((a) =>
        a === 'https://github.com/neondatabase/postgres-skills.git'
          ? neon.repo
          : a === 'https://github.com/timescale/pg-aiguide.git'
            ? pg.repo
            : a,
      ),
      cwd,
    );
  const result = sync(
    target.repo,
    source(target.repo, 'postgres'),
    join(target.dir, 'temp'),
    undefined,
    runner,
    () => {},
  );
  assert.equal(result.result.revisions.length, 2);
  assert.match(result.title, /neon .*pg-aiguide/);
  assert.equal(readFileSync(join(target.repo, dest, `skills/${b}/NOTICE`), 'utf8'), 'notice');
});

test('release adapter vendors a local stable tag, preserves repo version and reports upstream notes', (t) => {
  const upstream = fixture(t),
    target = fixture(t);
  upstream.write('.claude-plugin/plugin.json', JSON.stringify({ name: 'superpowers', version: '1.2.3' }));
  upstream.write('hooks/session-start', 'hook\n');
  upstream.write('skills/using-superpowers/SKILL.md', 'skill\n');
  upstream.write('LICENSE', 'MIT');
  upstream.commit();
  upstream.git('tag', 'v1.2.3');
  const dest = 'plugins/flows/packs/superpowers';
  target.write('package.json', '{"version":"0.6.0"}');
  target.write('.claude-plugin/marketplace.json', '{}');
  target.write(`${dest}/UPSTREAM`, 'old\n');
  target.commit();
  const runner = (program, args, cwd) =>
    program === 'gh'
      ? 'Upstream notes'
      : execute(
          program,
          args.map((a) => (a === 'https://github.com/obra/superpowers.git' ? upstream.repo : a)),
          cwd,
        );
  const result = sync(
    target.repo,
    source(target.repo, 'superpowers'),
    join(target.dir, 'temp'),
    undefined,
    runner,
    () => {},
  );
  assert.equal(result.title, 'Sync superpowers to v1.2.3');
  assert.match(result.body, /Upstream notes/);
  assert.equal(
    JSON.parse(readFileSync(join(target.repo, dest, '.claude-plugin/plugin.json'), 'utf8')).version,
    '0.6.0',
  );
  assert.equal(readFileSync(join(target.repo, dest, 'hooks/session-start'), 'utf8'), 'hook\n');
});
