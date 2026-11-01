// plugins/catalog.json: which plugins exist, where they live and what ships with them. Nothing harness specific.
import { TARGET_IDS, type CatalogEntry } from '../model.ts';
import { SchemaError, isObject, object, only, oneOf, relativePath, relativePaths, string, strings } from './check.ts';

export function parseCatalog(value: unknown): CatalogEntry[] {
  if (!Array.isArray(value)) throw new SchemaError('plugins/catalog.json: expected an array');
  const seen = new Set<string>();
  const entries = value.map((raw, i): CatalogEntry => {
    const where = `plugins/catalog.json[${i}]`;
    const e = object(raw, where);
    only(e, ['name', 'description', 'source', 'resources', 'dependencies', 'targets'], where);
    const name = string(e.name, `${where}.name`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
      throw new SchemaError(`${where}.name: "${name}" is not a plugin name`);
    if (seen.has(name)) throw new SchemaError(`Duplicate plugin name: ${name}`);
    seen.add(name);
    let source: CatalogEntry['source'];
    if (isObject(e.source)) {
      only(e.source, ['source', 'url'], `${where}.source`);
      if (e.source.source !== 'url' || !/^https:\/\/\S+$/.test(String(e.source.url)))
        throw new SchemaError(`${where}.source: expected { source: "url", url: "https://…" }`);
      source = { source: 'url', url: String(e.source.url) };
    } else source = relativePath(e.source, `${where}.source`);
    const targets = strings(e.targets, `${where}.targets`).map((t) => oneOf(t, TARGET_IDS, `${where}.targets`));
    if (!targets.length) throw new SchemaError(`${where}.targets: at least one target`);
    return {
      name,
      ...(e.description !== undefined ? { description: string(e.description, `${where}.description`) } : {}),
      source,
      resources: relativePaths(e.resources, `${where}.resources`),
      dependencies: strings(e.dependencies, `${where}.dependencies`),
      targets,
    };
  });
  for (const e of entries) {
    if (typeof e.source !== 'string' && !e.description)
      throw new SchemaError(`${e.name}: an entry without a plugin directory needs a description`);
    for (const d of e.dependencies) if (!seen.has(d)) throw new SchemaError(`Unknown dependency ${d} for ${e.name}`);
  }
  return entries;
}
