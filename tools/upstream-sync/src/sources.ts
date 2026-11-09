// Source adapters, destination checks and PR/issue policy for the weekly workflow.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Source } from './types.ts';
import { run as agent_review } from './adapters/agent-review.ts';
import { run as csharp } from './adapters/csharp.ts';
import { run as graphify } from './adapters/graphify.ts';
import { run as hallmark } from './adapters/hallmark.ts';
import { run as mattpocock } from './adapters/mattpocock.ts';
import { run as paper_lookup } from './adapters/paper-lookup.ts';
import { run as pins } from './adapters/pins.ts';
import { run as pstack } from './adapters/pstack.ts';
import { run as release } from './adapters/release.ts';
import { run as self_review } from './adapters/self-review.ts';
import { run as simple } from './adapters/simple.ts';
import { run as tob } from './adapters/tob.ts';
export function sources(ROOT: string): Source[] {
  const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

  function assert(ok: unknown, msg: string): asserts ok {
    if (!ok) throw new Error(msg);
  }

  // Each of `paths` parses as JSON; the marketplace always, since every sync can break it.
  function json(...paths: string[]) {
    for (const p of ['.claude-plugin/marketplace.json', ...paths]) JSON.parse(read(p));
  }

  function exists(path: string, { nonEmpty = false } = {}) {
    assert(existsSync(join(ROOT, path)), `${path} is missing`);
    if (nonEmpty) assert(read(path).length > 0, `${path} is empty`);
  }

  // SKILL.md files exactly one folder below `dir`.
  function skillCount(dir: string) {
    return readdirSync(join(ROOT, dir), { withFileTypes: true }).filter(
      (d) => d.isDirectory() && existsSync(join(ROOT, dir, d.name, 'SKILL.md')),
    ).length;
  }

  function count(what: string, n: number, want: number) {
    assert(n === want, `expected ${want} ${what}, found ${n}`);
  }

  const upstream = (path: string) => read(path).trim();

  const sha7 = (sha: string) => sha.slice(0, 7);
  const CC = '\ncc @deadmade\n';

  // A plain commit-pinned upstream: `<label> to <sha>` and a one-line body naming what was synced from where.
  const commitPr = (label: string, what: string, repo: string): Pick<Source, 'title' | 'body'> => ({
    title: ({ sha }) => `Sync ${label} to ${sha}`,
    body: ({ sha }) =>
      `Automated sync of ${what} from https://github.com/${repo} at\nhttps://github.com/${repo}/commit/${sha}.\n${CC}`,
  });

  const RELEASE = (name: string): Source => ({
    name,
    adapter: release,
    argument: name,
    paths: [`plugins/flows/packs/${name}`],
    bodyFrom: 'adapter',
    check: (out) => {
      json();
      assert(out.tag, 'release adapter reported no tag');
      return { tag: out.tag };
    },
    title: ({ tag }) => `Sync ${name} to ${tag}`,
  });

  return [
    {
      name: 'agent-browser',
      adapter: pins,
      argument: 'agent-browser',
      paths: ['tools/installer/assets/tools.json'],
      scan: false,
      check: () => {
        const { version: tag, files } = JSON.parse(read('tools/installer/assets/tools.json')).tools['agent-browser'];
        assert(Object.keys(files).length > 0, 'tools.json pins no agent-browser files');
        for (const key of Object.keys(files))
          assert(/^[0-9a-f]{64}$/.test(files[key].sha256 ?? ''), `tools.json has no agent-browser sha256 for ${key}`);
        return { tag };
      },
      title: ({ tag }) => `Pin agent-browser to ${tag}`,
      body: ({ tag }) =>
        `Bumps tools/installer/assets/tools.json to https://github.com/vercel-labs/agent-browser/releases/tag/v${tag}\n` +
        `and pins its Windows and Linux binaries' sha256. The installer downloads this version for web-mcp users.\n${CC}`,
    },
    {
      name: 'uv',
      adapter: pins,
      argument: 'uv',
      paths: ['tools/installer/assets/tools.json'],
      scan: false,
      check: () => {
        const { version: tag, files } = JSON.parse(read('tools/installer/assets/tools.json')).tools.uv;
        assert(/^\d+\.\d+\.\d+$/.test(tag), `tools.json pins no semver uv: ${tag}`);
        for (const key of ['win32-x64', 'linux-x64'])
          assert(/^[0-9a-f]{64}$/.test(files?.[key]?.sha256 ?? ''), `tools.json has no uv sha256 for ${key}`);
        return { tag };
      },
      title: ({ tag }) => `Pin uv to ${tag}`,
      body: ({ tag }) =>
        `Bumps tools/installer/assets/tools.json to https://github.com/astral-sh/uv/releases/tag/${tag}\n` +
        `and pins its Windows and Linux archives' sha256. The installer downloads this uv for headroom-trim users.\n${CC}`,
    },
    {
      name: 'csharp-skills',
      adapter: csharp,
      paths: ['plugins/opt-in/implementation/csharp-skills'],
      bodyFrom: 'report',
      check: () => {
        const d = 'plugins/opt-in/implementation/csharp-skills';
        json(`${d}/plugin.json`);
        count('router skills', skillCount(`${d}/skills`), 6);
        const library = skillCount(`${d}/library`);
        assert(library >= 90, `expected at least 90 library skills, found ${library}`);
        return { sha: upstream(`${d}/UPSTREAM`) };
      },
      title: ({ sha }) => `Sync csharp-skills to ${sha}`,
      body: ({ sha }, report) =>
        `Automated sync of https://github.com/dotnet/skills at https://github.com/dotnet/skills/commit/${sha}.\n\n` +
        'Sync report (added/removed skills, plugin parts not vendored, unmapped plugins, mentions of skipped agents):\n\n' +
        '```text\n' +
        report +
        '```\n' +
        CC,
    },
    {
      name: 'graphify',
      adapter: graphify,
      paths: ['plugins/shared/graphify'],
      check: () => {
        const d = 'plugins/shared/graphify';
        json(`${d}/plugin.json`, `${d}/hooks/hooks.json`);
        exists(`${d}/skills/graphify/SKILL.md`);
        const refs = readdirSync(join(ROOT, d, 'skills/graphify/references')).filter((f) => f.endsWith('.md'));
        count('graphify references', refs.length, 8);
        return { sha: upstream(`${d}/UPSTREAM`) };
      },
      ...commitPr('graphify', 'the graphify Claude Code skill', 'Graphify-Labs/graphify'),
    },
    {
      name: 'hallmark',
      adapter: hallmark,
      paths: ['plugins/opt-in/hallmark/skills/hallmark'],
      check: () => {
        const d = 'plugins/opt-in/hallmark';
        json(`${d}/plugin.json`);
        const head = read(`${d}/skills/hallmark/SKILL.md`).split('\n').slice(0, 10);
        assert(
          head.some((l) => l.startsWith('description: "WEB FRONTEND ONLY:')),
          'hallmark SKILL.md lost its WEB FRONTEND ONLY description',
        );
        return { sha: upstream(`${d}/skills/hallmark/UPSTREAM`) };
      },
      ...commitPr('hallmark', '`skills/hallmark`', 'nutlope/hallmark'),
    },
    {
      name: 'mattpocock-picks',
      adapter: mattpocock,
      paths: ['plugins/flows/packs/mattpocock-picks'],
      check: () => {
        const d = 'plugins/flows/packs/mattpocock-picks';
        json();
        count('mattpocock-picks skills', skillCount(`${d}/skills`), 13);
        return { sha: upstream(`${d}/UPSTREAM`) };
      },
      ...commitPr('mattpocock-picks', 'the curated skills', 'mattpocock/skills'),
      newSkills: {
        title: (name: string) => `New upstream skill in mattpocock/skills: ${name}`,
        lead: (skill) => `mattpocock/skills now publishes \`${skill}\`, which is neither vendored nor skipped.`,
        source: (skill) => `https://github.com/mattpocock/skills/tree/main/skills/${skill}`,
        script: 'tools/upstream-sync/src/adapters/mattpocock.ts',
        include: (skill) => `add \`${skill}\` to \`SKILLS\``,
        overlap: 'superpowers',
      },
    },
    {
      name: 'paper-lookup',
      adapter: paper_lookup,
      paths: ['plugins/flows/packs/paper-lookup/skills/paper-lookup'],
      check: () => {
        const d = 'plugins/flows/packs/paper-lookup';
        json();
        exists(`${d}/skills/paper-lookup/SKILL.md`, { nonEmpty: true });
        assert(
          !read(`${d}/skills/paper-lookup/SKILL.md`).includes('Citing Scientific Agent Skills'),
          'paper-lookup SKILL.md still carries the citation section',
        );
        return { sha: upstream(`${d}/skills/paper-lookup/UPSTREAM`) };
      },
      ...commitPr('paper-lookup', '`skills/paper-lookup`', 'K-Dense-AI/scientific-agent-skills'),
    },
    {
      name: 'postgres',
      adapter: simple,
      argument: 'postgres',
      paths: ['plugins/opt-in/implementation/postgres'],
      check: () => {
        const d = 'plugins/opt-in/implementation/postgres';
        json(`${d}/plugin.json`);
        exists(`${d}/skills/postgres-best-practices/SKILL.md`, { nonEmpty: true });
        exists(`${d}/skills/postgres-database-migration/SKILL.md`, { nonEmpty: true });
        return {
          neon: upstream(`${d}/skills/postgres-best-practices/UPSTREAM`),
          pgai: upstream(`${d}/skills/postgres-database-migration/UPSTREAM`),
        };
      },
      title: ({ neon, pgai }) => `Sync postgres to neon ${sha7(neon)}, pg-aiguide ${sha7(pgai)}`,
      body: ({ neon, pgai }) =>
        "Automated sync of the postgres plugin's vendored skills:\n\n" +
        '- `skills/postgres-best-practices` from https://github.com/neondatabase/postgres-skills at\n' +
        `  https://github.com/neondatabase/postgres-skills/commit/${neon}\n` +
        '- `skills/postgres-database-migration` from https://github.com/timescale/pg-aiguide at\n' +
        `  https://github.com/timescale/pg-aiguide/commit/${pgai}\n` +
        CC,
    },
    {
      name: 'pstack-picks',
      adapter: pstack,
      paths: ['plugins/flows/packs/pstack-picks'],
      check: () => {
        const d = 'plugins/flows/packs/pstack-picks';
        json();
        count('pstack-picks skills', skillCount(`${d}/skills`), 16);
        exists(`${d}/agents/comment-sicko.md`);
        return { sha: upstream(`${d}/UPSTREAM`) };
      },
      title: ({ sha }) => `Sync pstack-picks to ${sha}`,
      body: ({ sha }) =>
        'Automated sync of the curated pstack skills from https://github.com/cursor/plugins at\n' +
        `https://github.com/cursor/plugins/commit/${sha}, with the Claude Code\n` +
        'rewrites from `tools/upstream-sync/src/adapters/pstack.ts` applied and the Cursor-ism guard passing.\n' +
        CC,
      newSkills: {
        title: (name: string) => `New upstream skill in cursor/plugins pstack: ${name}`,
        lead: (skill) => `pstack now has \`${skill}\`, which is neither vendored nor skipped.`,
        source: (skill) => `https://github.com/cursor/plugins/tree/main/pstack/skills/${skill}`,
        script: 'tools/upstream-sync/src/adapters/pstack.ts',
        include: (skill) => `add \`${skill}\` to \`SKILLS\``,
        after: 'If the guard reports Cursor-specific text, add a rule to `REWRITES` in the same script.',
        overlap: 'superpowers and mattpocock-picks',
      },
    },
    RELEASE('ponytail'),
    RELEASE('superpowers'),
    {
      name: 'rust-skills',
      adapter: simple,
      argument: 'rust',
      paths: ['plugins/opt-in/implementation/rust-skills'],
      check: () => {
        const d = 'plugins/opt-in/implementation/rust-skills';
        json(`${d}/plugin.json`);
        assert(
          /^paths:/m.test(read(`${d}/skills/rust-best-practices/SKILL.md`)),
          'rust-best-practices SKILL.md has no paths:',
        );
        return { sha: upstream(`${d}/UPSTREAM`) };
      },
      ...commitPr('rust-skills', '`skills/rust-best-practices`', 'apollographql/skills'),
    },
    {
      name: 'security-audit',
      adapter: simple,
      argument: 'security-audit',
      paths: ['plugins/flows/packs/security-audit'],
      check: () => {
        const d = 'plugins/flows/packs/security-audit';
        json();
        exists(`${d}/skills/security-audit/SKILL.md`, { nonEmpty: true });
        return { sha: upstream(`${d}/UPSTREAM`) };
      },
      ...commitPr('security-audit', 'the security-audit skill', 'cloudflare/security-audit-skill'),
    },
    {
      name: 'self-review',
      adapter: self_review,
      paths: ['plugins/flows/skills/review-code', 'plugins/flows/agents'],
      check: () => {
        const s = 'plugins/flows/skills/review-code';
        json('plugins/flows/plugin.json');
        const ours = readdirSync(join(ROOT, 'plugins/flows/agents')).filter(
          (f) => f.endsWith('.md') && read(`plugins/flows/agents/${f}`).includes('by scripts/sync-self-review.mjs.'),
        );
        count('review-code agents', ours.length, 1);
        exists(`${s}/LICENSE`);
        const official = upstream(`${s}/UPSTREAM`);
        assert(official, `${s}/UPSTREAM lacks a commit`);
        return { official };
      },
      commitMessage: ({ official }) => `Sync review-code's agent to claude-plugins-official ${official}`,
      title: () => "Sync review-code's agent",
      body: ({ official }) =>
        'Automated sync of the pr-review-toolkit agent /review-code runs, vendored in plugins/flows/agents:\n' +
        `- https://github.com/anthropics/claude-plugins-official/commit/${official} (pr-test-analyzer)\n` +
        CC,
    },
    {
      name: 'tob-picks',
      adapter: tob,
      paths: ['plugins/flows/packs/tob-picks', 'plugins/flows/agents/spec-compliance-checker.md'],
      check: () => {
        const d = 'plugins/flows/packs/tob-picks';
        json();
        count('tob-picks skills', skillCount(`${d}/skills`), 4);
        return { sha: upstream(`${d}/UPSTREAM`) };
      },
      ...commitPr('tob-picks', 'the curated skills', 'trailofbits/skills'),
      newSkills: {
        title: (name: string) => `New upstream skill in trailofbits/skills: ${name}`,
        lead: (skill) => `trailofbits/skills now publishes \`${skill}\`, which is neither vendored nor skipped.`,
        source: (skill) => `https://github.com/trailofbits/skills/tree/main/plugins/${skill}`,
        script: 'tools/upstream-sync/src/adapters/tob.ts',
        include: (skill) => `add \`${skill}\` to \`SKILLS\` (its agents and workflows to \`AGENTS\`/\`WORKFLOWS\`)`,
        overlap: 'review-code, superpowers and the other picks',
      },
    },
    {
      name: 'agent-review',
      adapter: agent_review,
      paths: ['plugins/shared/agent-review'],
      check: () => {
        const d = 'plugins/shared/agent-review';
        json(`${d}/plugin.json`);
        exists(`${d}/skills/agent-review/SKILL.md`, { nonEmpty: true });
        assert(
          read(`${d}/skills/agent-review/SKILL.md`).includes('disable-model-invocation: true'),
          'agent-review must stay explicitly invoked',
        );
        return { sha: upstream(`${d}/UPSTREAM`) };
      },
      ...commitPr('agent-review', 'the agent-review skill', 'captivus/agent-review'),
    },
  ];
}
