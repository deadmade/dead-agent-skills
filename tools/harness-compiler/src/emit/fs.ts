import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

export const json = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
export const text = (file: string, value: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
};
// Build output, tests and per-harness metadata of vendored sources never ship.
const SKIPPED_DIRS = [
  'node_modules',
  '.git',
  '.cache',
  'target',
  'dist',
  'build',
  'tests',
  'evals',
  '.claude-plugin',
  '.codex-plugin',
];
export const shippable = (path: string) => {
  const parts = path.split(/[\\/]/);
  // Vendored skill packs carry their upstream's own hooks; the packs are read as resources, never loaded as plugins.
  if (parts[0] === 'packs' && parts[2] === 'hooks') return false;
  if (parts.some((part, i) => part === 'fixtures' && parts[i - 1] === 'hooks')) return false;
  return !parts.some(
    (part) => SKIPPED_DIRS.includes(part) || /(?:\.test\.|\.tsbuildinfo$|^tsconfig(?:\.|$))/.test(part),
  );
};
export const copy = (source: string, destination: string) => {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, filter: (path) => shippable(relative(source, path)) });
};
