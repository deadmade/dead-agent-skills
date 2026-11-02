// plugins/<name>/plugin.json: the neutral manifest every harness manifest is generated from.
import {
  HOOK_EVENTS,
  HOOK_TOOLS,
  TARGET_IDS,
  type ConfigField,
  type Dependency,
  type Extension,
  type Hook,
  type LspServer,
  type Manifest,
  type McpServer,
} from '../model.ts';
import { SchemaError, isObject, object, only, oneOf, relativePath, relativePaths, string, strings } from './check.ts';

const FIELDS = [
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'dependencies',
  'config',
  'mcpServers',
  'lsp',
  'hooks',
  'extensions',
  'themes',
  'instructions',
  'embeds',
];
const targets = (v: unknown, where: string) => strings(v, where).map((t) => oneOf(t, TARGET_IDS, where));

export function parseManifest(value: unknown, name: string): Manifest {
  const where = `${name}/plugin.json`;
  const m = object(value, where);
  only(m, FIELDS, where);
  let author: Manifest['author'];
  if (m.author !== undefined) {
    const a = object(m.author, `${where}.author`);
    only(a, ['name', 'url', 'email'], `${where}.author`);
    author = {
      name: string(a.name, `${where}.author.name`),
      ...(a.url ? { url: string(a.url, `${where}.author.url`) } : {}),
      ...(a.email ? { email: string(a.email, `${where}.author.email`) } : {}),
    };
  }
  const dependencies = (m.dependencies === undefined ? [] : (m.dependencies as unknown[])).map((d, i): Dependency => {
    const w = `${where}.dependencies[${i}]`;
    if (typeof d === 'string') return { name: string(d, w) };
    const o = object(d, w);
    only(o, ['name', 'marketplace', 'targets'], w);
    return {
      name: string(o.name, `${w}.name`),
      ...(o.marketplace ? { marketplace: string(o.marketplace, w) } : {}),
      ...(o.targets ? { targets: targets(o.targets, `${w}.targets`) } : {}),
    };
  });
  const config = Object.fromEntries(
    Object.entries(m.config === undefined ? {} : object(m.config, `${where}.config`)).map(
      ([key, raw]): [string, ConfigField] => {
        const w = `${where}.config.${key}`;
        const o = object(raw, w);
        only(o, ['type', 'title', 'description', 'default', 'sensitive', 'required', 'env'], w);
        return [
          key,
          {
            type: oneOf(o.type, ['string', 'boolean'], `${w}.type`),
            title: string(o.title, `${w}.title`),
            ...(o.description !== undefined ? { description: string(o.description, w) } : {}),
            ...(o.default !== undefined ? { default: o.default as string | boolean } : {}),
            ...(o.sensitive ? { sensitive: true } : {}),
            ...(o.required ? { required: true } : {}),
            ...(o.env ? { env: string(o.env, w) } : {}),
          },
        ];
      },
    ),
  );
  const mcpServers = Object.fromEntries(
    Object.entries(m.mcpServers === undefined ? {} : object(m.mcpServers, `${where}.mcpServers`)).map(
      ([key, raw]): [string, McpServer] => {
        const w = `${where}.mcpServers.${key}`;
        const o = object(raw, w);
        only(o, ['command', 'args', 'url', 'headers', 'env'], w);
        if ((o.command === undefined) === (o.url === undefined))
          throw new SchemaError(`${w}: give exactly one of command and url`);
        const record = (v: unknown, f: string) =>
          v === undefined
            ? undefined
            : Object.fromEntries(
                Object.entries(object(v, `${w}.${f}`)).map(([k, s]) => [k, string(s, `${w}.${f}.${k}`)]),
              );
        return [
          key,
          {
            ...(o.command ? { command: string(o.command, w) } : {}),
            ...(o.args ? { args: strings(o.args, w) } : {}),
            ...(o.url ? { url: string(o.url, w) } : {}),
            ...(o.headers ? { headers: record(o.headers, 'headers')! } : {}),
            ...(o.env ? { env: record(o.env, 'env')! } : {}),
          },
        ];
      },
    ),
  );
  const lsp = Object.fromEntries(
    Object.entries(m.lsp === undefined ? {} : object(m.lsp, `${where}.lsp`)).map(([key, raw]): [string, LspServer] => {
      const w = `${where}.lsp.${key}`;
      const o = object(raw, w);
      only(o, ['command', 'extensionToLanguage'], w);
      return [
        key,
        {
          command: string(o.command, w),
          extensionToLanguage: Object.fromEntries(
            Object.entries(object(o.extensionToLanguage, w)).map(([k, v]) => [k, string(v, w)]),
          ),
        },
      ];
    }),
  );
  const extensions = (m.extensions === undefined ? [] : (m.extensions as unknown[])).map((raw, i): Extension => {
    const w = `${where}.extensions[${i}]`;
    const o = object(raw, w);
    only(o, ['kind', 'entry', 'copy', 'types'], w);
    oneOf(o.kind, ['ui-mod'], `${w}.kind`);
    return {
      kind: 'ui-mod',
      entry: relativePath(o.entry, `${w}.entry`),
      copy: relativePaths(o.copy, `${w}.copy`),
      ...(o.types ? { types: relativePath(o.types, `${w}.types`) } : {}),
    };
  });
  if (m.dependencies !== undefined && !Array.isArray(m.dependencies))
    throw new SchemaError(`${where}.dependencies: expected an array`);
  return {
    description: string(m.description, `${where}.description`),
    ...(author ? { author } : {}),
    ...(m.homepage ? { homepage: string(m.homepage, where) } : {}),
    ...(m.repository ? { repository: string(m.repository, where) } : {}),
    ...(m.license ? { license: string(m.license, where) } : {}),
    ...(m.keywords ? { keywords: strings(m.keywords, where) } : {}),
    dependencies,
    config,
    mcpServers,
    lsp,
    ...(m.hooks ? { hooks: relativePath(m.hooks, `${where}.hooks`) } : {}),
    extensions,
    themes: (m.themes === undefined ? [] : (m.themes as unknown[])).map((raw, i) => {
      const w = `${where}.themes[${i}]`;
      const o = object(raw, w);
      only(o, ['name', 'palette'], w);
      return { name: string(o.name, `${w}.name`), palette: relativePath(o.palette, `${w}.palette`) };
    }),
    ...(m.instructions ? { instructions: relativePath(m.instructions, `${where}.instructions`) } : {}),
    embeds: m.embeds === undefined ? [] : strings(m.embeds, `${where}.embeds`),
  };
}

// plugins/<name>/hooks/hooks.json: { "hooks": [ … ] } in neutral events.
export function parseHooks(value: unknown, name: string): { description?: string; hooks: Hook[] } {
  const where = `${name} hooks`;
  const file = object(value, where);
  only(file, ['description', 'hooks'], where);
  const list = file.hooks;
  if (!Array.isArray(list)) throw new SchemaError(`${where}: expected a hooks array`);
  const hooks = list.map((raw, i): Hook => {
    const w = `${where}[${i}]`;
    const h = object(raw, w);
    only(
      h,
      [
        'event',
        'handler',
        'script',
        'command',
        'http',
        'args',
        'tools',
        'paths',
        'required',
        'background',
        'timeoutSeconds',
      ],
      w,
    );
    const ways = ['handler', 'script', 'command', 'http'].filter((k) => h[k] !== undefined);
    if (ways.length !== 1) throw new SchemaError(`${w}: give exactly one of handler, script, command, http`);
    if (h.handler !== undefined && !/^[a-z][a-z-]*$/.test(string(h.handler, w)))
      throw new SchemaError(`${w}.handler: invalid handler id`);
    if (h.timeoutSeconds !== undefined && !(typeof h.timeoutSeconds === 'number' && h.timeoutSeconds > 0))
      throw new SchemaError(`${w}.timeoutSeconds: expected a positive number`);
    for (const flag of ['required', 'background'])
      if (h[flag] !== undefined && typeof h[flag] !== 'boolean')
        throw new SchemaError(`${w}.${flag}: expected a boolean`);
    const event = oneOf(h.event, HOOK_EVENTS, `${w}.event`);
    if (h.tools !== undefined && !['tool.starting', 'tool.completed'].includes(event))
      throw new SchemaError(`${w}.tools: only tool.* events take tools`);
    return {
      event,
      ...(h.handler ? { handler: h.handler as string } : {}),
      ...(h.script ? { script: relativePath(h.script, `${w}.script`) } : {}),
      ...(h.command ? { command: strings(h.command, `${w}.command`) } : {}),
      ...(h.http ? { http: string(h.http, `${w}.http`) } : {}),
      ...(h.args ? { args: strings(h.args, `${w}.args`) } : {}),
      ...(h.tools ? { tools: strings(h.tools, `${w}.tools`).map((t) => oneOf(t, HOOK_TOOLS, `${w}.tools`)) } : {}),
      ...(h.paths ? { paths: strings(h.paths, `${w}.paths`) } : {}),
      required: h.required === true,
      background: h.background === true,
      ...(h.timeoutSeconds !== undefined ? { timeoutSeconds: h.timeoutSeconds as number } : {}),
    };
  });
  return { ...(file.description ? { description: string(file.description, `${where}.description`) } : {}), hooks };
}
export { isObject };
