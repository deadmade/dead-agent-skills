import { existsSync, readFileSync } from 'node:fs';
export function fail(message: string): never {
  throw new Error(message);
}
// Every stable vX.Y.Z tag in `git ls-remote --tags` output with its commit (peeled for annotated tags), oldest first.
export function stableTags(lsRemote: string) {
  const tags = new Map<string, { tag: string; version: number[]; sha?: string }>();
  for (const line of lsRemote.split('\n')) {
    const m = /^([0-9a-f]{40})\trefs\/tags\/(v(\d+)\.(\d+)\.(\d+))(\^\{\})?$/.exec(line);
    if (!m) continue;
    const [, sha, tag, ...rest] = m;
    const entry = tags.get(tag) ?? { tag, version: rest.slice(0, 3).map(Number) };
    if (rest[3] || !entry.sha) entry.sha = sha; // the peeled ^{} line wins
    tags.set(tag, entry);
  }
  const cmp = ({ version: a }: { version: number[] }, { version: b }: { version: number[] }) =>
    a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  return [...tags.values()].sort(cmp).map(({ tag, sha }) => ({ tag, sha: sha! }));
}

// `description:` from the first frontmatter block. Handles plain, "double"/'single'-quoted and folded (`>`, `>-`)
// forms; "" when missing, null for any other form (e.g. `|`).
export function frontmatterDescription(text: string) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return '';
  const lines = fm[1].split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith('description:'));
  if (i < 0) return '';
  const v = lines[i].slice('description:'.length).trim();
  if (/^>[-+]?$/.test(v)) {
    const rest = lines.slice(i + 1);
    const n = rest.findIndex((l) => l && !/^\s/.test(l));
    return (n < 0 ? rest : rest.slice(0, n))
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ');
  }
  if (/^[|>]/.test(v)) return null;
  if (/^\s/.test(lines[i + 1] ?? '')) return null; // multi-line plain scalar
  const q = v[0];
  if (q === '"' || q === "'") {
    if (v.length < 2 || !v.endsWith(q)) return null; // multi-line quoted
    if (q === '"' && v.includes('\\')) return null; // escapes aren't unescaped
    return v.slice(1, -1);
  }
  return v;
}

// First sentence of `desc`, cut at the last space before `max` with "…" when still too long.
export function summary(desc: string | null, max = 200) {
  desc ??= '';
  const dot = desc.indexOf('. ');
  const s = dot < 0 ? desc : desc.slice(0, dot + 1);
  return s.length <= max ? s : `${s.slice(0, s.lastIndexOf(' ', max))}…`;
}

// `description:` from a SKILL.md frontmatter, unquoted; "" when missing.
export function description(skillMd: string) {
  return existsSync(skillMd) ? (frontmatterDescription(readFileSync(skillMd, 'utf8')) ?? '') : '';
}

// Insert a `paths:` list before the closing `---` of the first frontmatter block.
// Returns null when there is no frontmatter or `paths:` is already present.
// In a block-scalar description, removes the `**Keywords:** ...` paragraph when the description exceeds the marketplace
// limit of 1024 characters. Text without that paragraph or within the limit is returned as it is.
export function dropKeywords(text: string, max = 1024) {
  const m = /^description: \|\n((?: {2}.*\n|\n)+)/m.exec(text);
  if (!m) return text;
  const value = m[1].replace(/^ {2}/gm, '');
  if (value.length <= max) return text;
  const cut = m[1].replace(/^ {2}\*\*Keywords:\*\*.*\n\n?/m, '');
  return text.replace(m[1], cut);
}

export function addPaths(text: string, globs: string[]) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      lines.splice(i, 0, 'paths:', ...globs.map((g) => `  - "${g}"`));
      return lines.join('\n');
    }
    if (/^paths:/.test(lines[i])) return null;
  }
  return null;
}

// The pin for a GitHub release: the version `tagPattern` captures from its tag and the sha256 digest GitHub lists for
// each of `files` (key -> asset name).
export function pinFrom(
  release: { tag_name: string; assets: { name: string; digest?: string }[] },
  files: Record<string, string>,
  tagPattern: RegExp,
) {
  const upstream = tagPattern.exec(release.tag_name)?.[1];
  if (!upstream) throw new Error(`unexpected tag ${release.tag_name}`);
  const sha256 = Object.fromEntries(
    Object.entries(files).map(([key, file]) => {
      const digest = /^sha256:([0-9a-f]{64})$/.exec(release.assets.find((a) => a.name === file)?.digest ?? '')?.[1];
      if (!digest) throw new Error(`no sha256 digest for ${file}`);
      return [key, digest];
    }),
  );
  return { upstream, sha256 };
}
