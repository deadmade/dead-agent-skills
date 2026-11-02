// Reads catalog/ and plugins/ into the typed plugin list every target is compiled from.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin, TargetId } from './model.ts';
import { parseCatalog } from './schema/catalog.ts';
import { SchemaError } from './schema/check.ts';
import { parseHooks, parseManifest } from './schema/manifest.ts';

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new SchemaError(`${file}: ${error.message}`);
  }
};

export function loadPlugins(root: string): Plugin[] {
  const entries = parseCatalog(readJson(join(root, 'plugins/catalog.json')));
  const plugins = entries.map((entry): Plugin => {
    if (typeof entry.source !== 'string')
      return {
        name: entry.name,
        description: entry.description!,
        source: entry.source,
        resources: entry.resources,
        dependencies: entry.dependencies,
        targets: entry.targets,
        hooks: [],
      };
    const dir = join(root, entry.source);
    const file = join(dir, 'plugin.json');
    if (!existsSync(file)) throw new SchemaError(`${entry.name}: missing ${entry.source}/plugin.json`);
    const manifest = parseManifest(readJson(file), entry.name);
    const parsed = manifest.hooks ? parseHooks(readJson(join(dir, manifest.hooks)), entry.name) : { hooks: [] };
    const hooks = parsed.hooks;
    for (const resource of entry.resources)
      if (!existsSync(join(dir, resource))) throw new SchemaError(`Missing package resource ${entry.name}/${resource}`);
    for (const hook of hooks)
      if (hook.script && !existsSync(join(dir, hook.script)))
        throw new SchemaError(`${entry.name}: hook script ${hook.script} does not exist`);
    for (const ext of manifest.extensions)
      for (const sub of [ext.entry, ...ext.copy, ...(ext.types ? [ext.types] : [])])
        if (!existsSync(join(dir, sub))) throw new SchemaError(`${entry.name}: ${sub} does not exist`);
    for (const theme of manifest.themes)
      if (!existsSync(join(dir, theme.palette)))
        throw new SchemaError(`${entry.name}: missing palette ${theme.palette}`);
    return {
      name: entry.name,
      description: manifest.description,
      source: entry.source,
      dir,
      resources: entry.resources,
      dependencies: entry.dependencies,
      targets: entry.targets,
      manifest,
      hooks,
      ...(parsed.description ? { hooksDescription: parsed.description } : {}),
    };
  });
  return plugins;
}

// The plugins one target ships, with dependency closure checked against that target.
export function selectTarget(plugins: Plugin[], target: TargetId): { plugins: Plugin[]; unavailable: Plugin[] } {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (plugin: Plugin) => {
    if (visiting.has(plugin.name)) throw new SchemaError(`Plugin dependency cycle: ${plugin.name}`);
    if (visited.has(plugin.name)) return;
    visiting.add(plugin.name);
    for (const name of internalDependencies(plugin, plugins, undefined)) visit(byName.get(name)!);
    visiting.delete(plugin.name);
    visited.add(plugin.name);
  };
  plugins.forEach(visit);
  const selected = plugins.filter((p) => p.targets.includes(target));
  for (const plugin of selected)
    for (const name of internalDependencies(plugin, plugins, target))
      if (!byName.get(name)!.targets.includes(target))
        throw new SchemaError(`Required dependency ${name} for ${plugin.name} is unavailable on ${target}`);
  return { plugins: selected, unavailable: plugins.filter((p) => !p.targets.includes(target)) };
}

// Dependencies on plugins of this repository: the catalog's, plus manifest entries without a marketplace.
export function internalDependencies(plugin: Plugin, plugins: Plugin[], target: TargetId | undefined): string[] {
  const names = new Set(plugins.map((p) => p.name));
  const extra = (plugin.manifest?.dependencies ?? [])
    .filter((d) => !d.marketplace && (!d.targets || target === undefined || d.targets.includes(target)))
    .map((d) => d.name);
  const all = [...plugin.dependencies, ...extra];
  for (const name of all) if (!names.has(name)) throw new SchemaError(`Unknown dependency ${name} for ${plugin.name}`);
  return [...new Set(all)];
}
