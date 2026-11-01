import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS } from '../core/agents.ts';
import { selectTarget, type PluginDefinition } from '../core/catalog.ts';

// The installed loader reads only shipped data, never authored plugin directories.
export function readCatalog(root: string): PluginDefinition[] {
  const value: unknown = JSON.parse(readFileSync(join(root, 'catalog/plugins.json'), 'utf8'));
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
  const path = (v: unknown): v is string =>
    typeof v === 'string' &&
    !!v &&
    !v.includes('\\') &&
    !v.includes('\0') &&
    !v.includes(':') &&
    v.split('/').every((part) => !!part && part !== '.' && part !== '..');
  const paths = (v: unknown) => strings(v) && v.every(path);
  const target = (v: string) => AGENTS.some((a) => a.id === v);
  if (!Array.isArray(value)) throw new Error('Invalid plugin catalog: expected an array');
  for (const entry of value) {
    if (
      !object(entry) ||
      typeof entry.name !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) ||
      typeof entry.description !== 'string' ||
      !entry.description.trim() ||
      !(
        path(entry.source) ||
        (object(entry.source) &&
          entry.source.source === 'url' &&
          typeof entry.source.url === 'string' &&
          /^https:\/\/[^\s]+$/.test(entry.source.url) &&
          Object.keys(entry.source).every((key) => ['source', 'url'].includes(key)))
      ) ||
      !paths(entry.resources) ||
      !strings(entry.dependencies) ||
      !strings(entry.targets) ||
      !entry.targets.length ||
      !entry.targets.every(target) ||
      !object(entry.overlays) ||
      !Object.entries(entry.overlays).every(([host, files]) => target(host) && paths(files)) ||
      (entry.hooks !== undefined && !path(entry.hooks))
    )
      throw new Error('Invalid plugin catalog definition');
  }
  const definitions = value as PluginDefinition[];
  // Validate all references and both target dependency closures before returning data.
  for (const { id } of AGENTS) selectTarget(definitions, id);
  return definitions;
}
