// Builds each flows conductor from its `[step: name]` lines and host tokens, and refuses a broken one (spec §1–§4).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { TargetId } from '../model.ts';

export type Uses = Record<string, string[]>;
export type HostTokens = Record<string, { text: string; uses?: Uses }>;
export interface Composed {
  files: Map<string, string>;
  uses: Record<string, Uses>;
}
export interface Checked {
  problems: string[];
  warnings: string[];
  estimates: Record<string, number>;
}
export class ComposeError extends Error {
  file: string;
  line: number;
  constructor(file: string, line: number, what: string) {
    super(`${file}:${line}: ${what}`);
    this.file = file;
    this.line = line;
  }
}

export const CLAUDE_ONLY: RegExp[] = [
  /AskUserQuestion/,
  /WebSearch/,
  /WebFetch/,
  /subagent_type/,
  /Monitor/,
  /Explore agent/,
  /the Skill tool/,
  /\b(haiku|sonnet|opus|fable)\b/i,
];
// Skill names that are also plain words, so only `plugin:name` or a pack path counts as naming them.
export const SHORT_NAMES: string[] = ['how', 'why', 'fetch', 'teach'];

const STEP = /^\[step: ([^\]]+)\]$/;
const OVERRIDE = /^\s*<!--\s*overrides\s.*-->\s*$/;
const PHASE = /^## Phase (\d+): (.+)$/;
const ROW = /^<!--\s*runs:\s*(.*?)\s*·\s*output:\s*(.*?)\s*-->$/;
const TOKEN = /\{\{([\w:-]+)\}\}/g;

const read = (file: string) => readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const list = (value = '') =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

type Keys = Map<string, { value: string; line: number }>;
// `key: value` lines between `---` fences at the top of the file; `end` is the index of the first body line.
function frontmatter(lines: string[]): { keys: Keys; end: number } {
  const keys: Keys = new Map();
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (close < 0) return { keys, end: 0 };
  for (let i = 1; i < close; i++) {
    const m = /^([\w-]+):\s*(.*)$/.exec(lines[i]);
    if (m) keys.set(m[1], { value: m[2], line: i + 1 });
  }
  return { keys, end: close + 1 };
}

interface Step {
  file: string;
  keys: Keys;
  body: string[];
  start: number;
}
// Checks 1 and 4 on a step's own text, run only when a file uses the step.
function loadStep(pluginDir: string, name: string): Step | undefined {
  const file = `steps/${name}.md`;
  if (!existsSync(join(pluginDir, file))) return undefined;
  const lines = read(join(pluginDir, file)).replace(/\n$/, '').split('\n');
  const { keys, end } = frontmatter(lines);
  const body = lines.slice(end);
  body.forEach((line, i) => {
    const fail = (what: string) => {
      throw new ComposeError(file, end + i + 1, `step ${name} ${what}`);
    };
    if (line.startsWith('[step:')) fail('holds a [step:] line; steps do not nest');
    if (/^#{1,2} /.test(line)) fail("has a # or ## heading; it sits under the flow's own heading");
    if (line.includes('<skill-dir>')) fail('names <skill-dir>; steps write paths through <flow-root>');
  });
  const needs = keys.get('needs');
  if (needs?.value === 'subagents' && !body.some((line) => line.startsWith('Without subagents:')))
    throw new ComposeError(file, needs.line, `step ${name} needs subagents but has no "Without subagents:" line`);
  return { file, keys, body, start: end };
}

const markdown = (pluginDir: string, top: string) =>
  existsSync(join(pluginDir, top))
    ? readdirSync(join(pluginDir, top), { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => relative(pluginDir, join(e.parentPath, e.name)).split(sep).join('/'))
    : [];

export function composeFlows(pluginDir: string, tokens: HostTokens): Composed {
  const steps = new Map<string, Step | undefined>();
  const files = new Map<string, string>();
  const found: Record<string, Record<string, Set<string>>> = {};
  for (const rel of [...markdown(pluginDir, 'skills'), ...markdown(pluginDir, 'references')].sort()) {
    const lines = read(join(pluginDir, rel)).split('\n');
    const { keys, end } = frontmatter(lines);
    // A file under skills/<flow>/ takes its templates and its place in the uses from that flow's SKILL.md.
    const flow = rel.startsWith('skills/') ? rel.split('/')[1] : undefined;
    const skill = flow && join(pluginDir, 'skills', flow, 'SKILL.md');
    const flowKeys: Keys = skill && existsSync(skill) ? frontmatter(read(skill).split('\n')).keys : new Map();
    const conductor = flowKeys.get('disable-model-invocation')?.value === 'true' ? flow : undefined;
    const fileUses: Uses[] = [];

    const dropped = new Set([keys.get('uses')?.line, keys.get('template')?.line].flatMap((n) => (n ? [n - 1] : [])));
    const usesPhases = lines.slice(end).includes('[step: phases]');
    const phases: { n: string; name: string; runs: string; output: string; gate: boolean }[] = [];
    let current: (typeof phases)[number] | undefined;
    for (let i = end; i < lines.length; i++) {
      const heading = PHASE.exec(lines[i]);
      if (heading) {
        if (usesPhases && /\s/.test(heading[2]))
          throw new ComposeError(rel, i + 1, `phase name "${heading[2]}" is more than one word`);
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        const row = ROW.exec(lines[j] ?? '');
        // The blank lines between the heading and its comment go with the comment.
        if (row) for (let k = i + 1; k <= j; k++) dropped.add(k);
        current = { n: heading[1], name: heading[2], runs: row?.[1] ?? '', output: row?.[2] ?? '', gate: false };
        phases.push(current);
      } else if (lines[i].startsWith('## ')) current = undefined;
      else if (lines[i] === '[step: gate]' && current) current.gate = true;
    }
    let gates = 0;
    const table = [
      '| Phase | Runs | Output |',
      '| --- | --- | --- |',
      ...phases.map((p) => {
        const output = [p.output, p.gate && `**Gate ${++gates}**`].filter(Boolean).join('. ');
        return `| ${p.n} ${p.name} | ${p.runs} | ${output} |`;
      }),
      '',
      `phases: ${[...phases.map((p) => p.name.toLowerCase()), 'done'].join(' | ')}`,
    ];

    const resolve = (line: string, file: string, at: number) =>
      line.replace(TOKEN, (_, key: string) => {
        const token = tokens[key];
        if (!token) throw new ComposeError(file, at, `unknown token {{${key}}}`);
        if (token.uses) fileUses.push(token.uses);
        return token.text.replaceAll('\r\n', '\n');
      });
    const used = new Map<string, number>();
    const out: string[] = [];
    lines.forEach((line, i) => {
      if (dropped.has(i) || OVERRIDE.test(line)) return;
      const name = i >= end ? STEP.exec(line)?.[1] : undefined;
      if (!name) return out.push(resolve(line, rel, i + 1));
      const builtIn = name === 'phases' || name === 'host';
      const step = builtIn ? undefined : (steps.get(name) ?? loadStep(pluginDir, name));
      if (!builtIn && !step) throw new ComposeError(rel, i + 1, `unknown step ${name}`);
      if (step) steps.set(name, step);
      if (used.has(name) && step?.keys.get('repeat')?.value !== 'true')
        throw new ComposeError(rel, i + 1, `step ${name} is used twice; only a step with repeat: true may be`);
      used.set(name, i + 1);
      if (name === 'phases') out.push(...table);
      // The host step is the adapter token's text.
      else if (name === 'host') out.push(resolve('{{adapter}}', rel, i + 1));
      else
        step!.body.forEach((text, k) => {
          if (!OVERRIDE.test(text)) out.push(resolve(text, step!.file, step!.start + k + 1));
        });
    });

    const templates = list(flowKeys.get('template')?.value);
    for (const [name, at] of used) {
      const step = steps.get(name);
      if (!step) continue;
      for (const needed of list(step.keys.get('requires')?.value))
        if (!used.has(needed))
          throw new ComposeError(rel, at, `step ${name} requires step ${needed}, which ${rel} lacks`);
      const writes = list(step.keys.get('writes')?.value);
      if (writes.length && !templates.length)
        throw new ComposeError(
          rel,
          at,
          `step ${name} writes ${writes.join(', ')}, but ${flow ?? rel} names no template:`,
        );
      for (const template of writes.length ? templates : []) {
        if (!existsSync(join(pluginDir, template)))
          throw new ComposeError(rel, at, `step ${name} writes into ${template}, which does not exist`);
        const sections = read(join(pluginDir, template))
          .split('\n')
          .filter((l) => l.startsWith('## '))
          .map((l) => l.slice(3).trim());
        for (const section of writes)
          if (!sections.includes(section))
            throw new ComposeError(rel, at, `step ${name} writes ## ${section}, which ${template} lacks`);
      }
      fileUses.push(parseUses(step.keys, step.file));
    }
    fileUses.push(parseUses(keys, rel));

    files.set(rel, out.join('\n'));
    if (!conductor) continue;
    const merged = (found[conductor] ??= {});
    for (const entry of fileUses)
      for (const [owner, names] of Object.entries(entry)) for (const n of names) (merged[owner] ??= new Set()).add(n);
  }
  const uses = Object.fromEntries(
    Object.entries(found).map(([conductor, merged]) => [
      conductor,
      Object.fromEntries(
        Object.keys(merged)
          .sort()
          .map((owner) => [owner, [...merged[owner]].sort()]),
      ),
    ]),
  );
  return { files, uses };
}

// `uses: plugin:name, …`, split at the first colon (a plugin may carry `@marketplace`).
function parseUses(keys: Keys, file: string): Uses {
  const uses: Uses = {};
  const entry = keys.get('uses');
  for (const item of list(entry?.value)) {
    const at = item.indexOf(':');
    if (at < 1) throw new ComposeError(file, entry!.line, `uses entry "${item}" is not plugin:name`);
    (uses[item.slice(0, at)] ??= []).push(item.slice(at + 1));
  }
  return uses;
}

const BUDGET = 4500;
const NODE = /\bnode\s+["`]?([^\s"`]+\.[cm]?js)\b/g;
const LINK = /\]\(([^)\s#]*references\/[^)\s#]+)/g;
const PACK = /(?:<packs>|<flow-root>\/packs)\/([^\s/`'"()[\]]+)\/skills\/([^\s/`'"()[\]]+)/g;

// Checks 6, 7 and 8 and the Codex phrase check on the composed files as built; check 6, check 7's short-name and
// pack-path rules and the phrases warn until Task 18.
export function checkBuilt(dest: string, target: TargetId, composed: Composed): Checked {
  const checked: Checked = { problems: [], warnings: [], estimates: {} };
  for (const rel of composed.files.keys()) {
    const text = read(join(dest, rel));
    const lines = text.split('\n');
    const flow = rel.startsWith('skills/') ? rel.split('/')[1] : undefined;
    // <flow-root> is the built plugin folder and <skill-dir> the file's own skill folder; undefined for neither.
    const placed = (path: string) =>
      path.startsWith('<flow-root>/')
        ? join(dest, path.slice('<flow-root>/'.length))
        : path.startsWith('<skill-dir>/') && flow
          ? join(dest, 'skills', flow, path.slice('<skill-dir>/'.length))
          : undefined;
    lines.forEach((line, i) => {
      const warn = (what: string) => checked.warnings.push(`[${target}] ${rel}:${i + 1}: ${what}`);
      for (const [, script] of line.matchAll(NODE)) {
        const path = placed(script);
        if (!path) warn(`node ${script} is not a <flow-root> or <skill-dir> path`);
        else if (!existsSync(path)) warn(`node ${script} does not resolve in the built tree`);
      }
      for (const [, link] of line.matchAll(LINK))
        if (!/^\w+:/.test(link) && !existsSync(placed(link) ?? join(dest, rel, '..', link)))
          warn(`link ${link} does not resolve in the built tree`);
      const phrases = target === 'codex' ? CLAUDE_ONLY.flatMap((p) => p.exec(line)?.[0] ?? []) : [];
      if (phrases.length) warn(`names Claude-only ${phrases.join(', ')}`);
    });
    if (
      !/^skills\/[^/]+\/SKILL\.md$/.test(rel) ||
      frontmatter(lines).keys.get('disable-model-invocation')?.value !== 'true'
    )
      continue;
    const phase = text.search(/^## Phase/m);
    const start = phase < 0 ? text : text.slice(0, phase);
    const tokens = Math.ceil(Buffer.byteLength(start) / 4);
    checked.estimates[flow!] = tokens;
    if (tokens > BUDGET)
      checked.problems.push(
        `[${target}] ${rel}:${start.split('\n').length}: rules plus Start are ~${tokens} tokens, over the ${BUDGET} budget`,
      );

    // Check 7: the conductor's uses against its SKILL.md and the references it links.
    const uses = composed.uses[flow!];
    const linked = [...text.matchAll(LINK)]
      .filter(([, link]) => !/^\w+:/.test(link))
      .map(([, link]) =>
        relative(dest, placed(link) ?? join(dest, rel, '..', link))
          .split(sep)
          .join('/'),
      );
    const texts = [rel, ...new Set(linked)]
      .filter((file) => existsSync(join(dest, file)))
      .map((file) => ({ file, lines: read(join(dest, file)).split('\n') }));
    const paths = new Set<string>();
    for (const { file, lines } of texts)
      lines.forEach((line, i) => {
        for (const [, pack, raw] of line.matchAll(PACK)) {
          const name = raw.replace(/[.,;:]+$/, '');
          if (/[<>…*]/.test(pack + name)) continue;
          paths.add(`${pack}:${name}`);
          if (!uses[pack]?.includes(name))
            checked.warnings.push(
              `[${target}] ${file}:${i + 1}: names <packs>/${pack}/skills/${name}, but ${pack}:${name} is not in ${flow}'s uses`,
            );
        }
      });
    const all = texts.map(({ lines }) => lines.join('\n')).join('\n');
    for (const [owner, names] of Object.entries(uses))
      for (const name of names) {
        const id = `${owner}:${name}`;
        const short = SHORT_NAMES.includes(name);
        if (short ? all.includes(id) || paths.has(id) : all.includes(name)) continue;
        const word = short ? new RegExp(`\\b${name}\\b`) : undefined;
        const bare = word
          ? texts.flatMap(({ file, lines }) =>
              lines.flatMap((line, i) => (word.test(line) ? [`${file}:${i + 1}`] : [])),
            )
          : [];
        if (bare.length)
          checked.warnings.push(
            `[${target}] ${bare[0]}: uses ${id} but names it only as the bare word "${name}"; write ${id} or its pack path`,
          );
        else checked.problems.push(`[${target}] ${rel}:1: uses ${id}, which neither it nor a reference it links names`);
      }
  }
  return checked;
}
