// Native packages are emitted from the neutral catalog and explicit target overlays.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { AGENTS, CODEX_MARKETPLACE, type AgentId } from '../core/agents.ts';
import { selectTarget, selectHooks, type HookDefinition, type CapabilityDiagnostic } from '../core/catalog.ts';
import { emitNativePlugin, portableText } from '../core/package-adapters.ts';
import { renderClaudeTheme, renderCodexTheme, type NightCityPalette } from '../core/themes.ts';
import { readCatalog } from './catalog.ts';

const json = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
const allowed = (path: string) =>
  !path
    .split(/[\\/]/)
    .some(
      (part) =>
        ['node_modules', '.git', '.cache', 'target', 'dist', 'build', 'tests', 'evals'].includes(part) ||
        /(?:\.test\.|\.tsbuildinfo$|^tsconfig(?:\.|$))/.test(part),
    );
const copy = (source: string, destination: string) => {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, filter: (path) => allowed(relative(source, path)) });
};

export function nativeMarketplace(source: string, target: AgentId, prefix: string) {
  const { plugins } = selectTarget(readCatalog(source), target);
  if (target === 'codex')
    return {
      name: CODEX_MARKETPLACE,
      interface: { displayName: 'dead-agent-skills' },
      plugins: plugins.map(({ name }) => ({
        name,
        source: { source: 'local', path: `${prefix}/${name}` },
        policy: { installation: 'AVAILABLE', authentication: 'ON_USE' },
        category: 'Productivity',
      })),
    };
  return {
    $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
    name: 'dead-claude-skills',
    description:
      "deadmade's personal Claude Code setup: own skills plus the third-party plugins used on every machine.",
    metadata: { version: JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version },
    owner: { name: 'deadmade', url: 'https://github.com/deadmade' },
    allowCrossMarketplaceDependenciesOn: ['claude-plugins-official'],
    plugins: plugins.map((entry) => ({
      name: entry.name,
      description: entry.description,
      source: typeof entry.source === 'string' ? `${prefix}/${entry.name}` : entry.source,
      category: ['dead-skills', 'mcp-github', 'mcp-azure', 'atlassian', 'md-pane'].includes(entry.name)
        ? 'productivity'
        : 'development',
    })),
  };
}

export function buildPackages(source: string, output: string): { diagnostics: CapabilityDiagnostic[] } {
  const definitions = readCatalog(source);
  const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version;
  const diagnostics: CapabilityDiagnostic[] = [];
  // Complete capability and resource validation before touching output.
  const plans = AGENTS.map(({ id: target }) => {
    const selection = selectTarget(definitions, target);
    diagnostics.push(...selection.diagnostics);
    const entries = selection.plugins.map((entry) => {
      const src = typeof entry.source === 'string' ? join(source, entry.source) : undefined;
      const manifest = target === 'codex' ? '.codex-plugin/plugin.json' : '.claude-plugin/plugin.json';
      const resources = [...entry.resources, ...(entry.overlays[target] ?? [])];
      if (
        src &&
        resources.some((resource) => manifest === resource || manifest.startsWith(resource + '/')) &&
        existsSync(join(src, manifest))
      ) {
        const overlay = JSON.parse(readFileSync(join(src, manifest), 'utf8'));
        if (overlay.name !== undefined && overlay.name !== entry.name)
          throw new Error(`Conflicting native overlay identity for ${target}/${entry.name}: ${overlay.name}`);
      }
      let hooks: HookDefinition[] = [];
      if (src && entry.hooks) {
        const value: unknown = JSON.parse(readFileSync(join(src, entry.hooks), 'utf8'));
        if (
          !Array.isArray(value) ||
          !value.every(
            (h) =>
              h &&
              typeof h === 'object' &&
              [
                'session.started',
                'turn.finished',
                'permission.requested',
                'question.asked',
                'notification.received',
              ].includes(h.event) &&
              typeof h.handler === 'string' &&
              /^[a-z][a-z-]*$/.test(h.handler) &&
              typeof h.required === 'boolean' &&
              typeof h.background === 'boolean' &&
              Number.isFinite(h.timeoutSeconds) &&
              h.timeoutSeconds > 0,
          )
        )
          throw new Error(`Invalid hooks for ${entry.name}`);
        hooks = value;
      }
      const selected = selectHooks(hooks, target);
      diagnostics.push(...selected.diagnostics.map((d) => ({ ...d, plugin: entry.name })));
      if (src)
        for (const resource of [...entry.resources, ...(entry.overlays[target] ?? [])])
          if (!existsSync(join(src, resource))) throw new Error(`Missing package resource ${entry.name}/${resource}`);
      if (src && entry.name === 'dead-skills')
        for (const resource of [
          'hooks/runtime/common.mjs',
          'hooks/runtime/claude-code.mjs',
          'hooks/runtime/codex.mjs',
          'hooks/runtime/run.mjs',
          'hooks/lib.mjs',
          'hooks/rules.mjs',
          'rules.md',
          'icon.png',
          'themes/palette.json',
          'skills/setup-night-city/SKILL.md',
        ])
          if (!existsSync(join(src, resource))) throw new Error(`Missing package resource ${entry.name}/${resource}`);
      const palette: NightCityPalette | undefined =
        src && entry.name === 'dead-skills'
          ? JSON.parse(readFileSync(join(src, 'themes/palette.json'), 'utf8'))
          : undefined;
      if (palette) {
        renderClaudeTheme(palette);
        renderCodexTheme(palette);
      }
      return { entry, src, hooks: selected.hooks, palette };
    });
    return { target, entries };
  });
  for (const { target, entries } of plans) {
    const targetRoot = target === 'codex' ? output : join(output, 'claude-code');
    for (const { entry, src, hooks, palette } of entries) {
      if (!src && target === 'claude-code') continue;
      const dest = join(targetRoot, 'plugins', entry.name);
      mkdirSync(dest, { recursive: true });
      if (src) {
        for (const resource of [...entry.resources, ...(entry.overlays[target] ?? [])])
          copy(join(src, resource), join(dest, resource));
        for (const file of readdirSync(src))
          if (/^(LICENSE|NOTICE|UPSTREAM|COPYING|THIRD_PARTY)/.test(file)) copy(join(src, file), join(dest, file));
      }
      if (entry.name === 'dead-skills' && src) {
        for (const file of ['common.mjs', 'claude-code.mjs', 'codex.mjs', 'run.mjs'])
          copy(join(src, 'hooks/runtime', file), join(dest, 'hooks/runtime', file));
        copy(join(src, 'hooks/rules.mjs'), join(dest, 'hooks/rules.mjs'));
        json(join(dest, 'hooks/runtime/package.json'), { version });
        copy(join(src, 'hooks/lib.mjs'), join(dest, 'hooks/lib.mjs'));
        copy(join(src, 'rules.md'), join(dest, 'rules.md'));
        copy(join(src, 'skills/setup-night-city'), join(dest, 'skills/setup-night-city'));
        mkdirSync(join(dest, 'themes'), { recursive: true });
        if (target === 'claude-code') json(join(dest, 'themes/night-city.json'), renderClaudeTheme(palette!));
        else writeFileSync(join(dest, 'themes/night-city.tmTheme'), renderCodexTheme(palette!));
        copy(join(src, 'icon.png'), join(dest, 'icon.png'));
        if (target === 'codex') {
          mkdirSync(join(dest, 'skills/project-rules'), { recursive: true });
          writeFileSync(
            join(dest, 'skills/project-rules/SKILL.md'),
            '---\nname: project-rules\ndescription: Personal coding conventions for projects using dead-agent-skills.\n---\n\n' +
              readFileSync(join(src, 'rules.md'), 'utf8'),
          );
        }
      }
      if (target === 'codex' && entry.name === 'flows') {
        const graphify = definitions.find((p) => p.name === 'graphify');
        if (graphify && typeof graphify.source === 'string') {
          const graphRoot = join(source, graphify.source);
          copy(join(graphRoot, 'skills'), join(dest, 'resources/graphify/skills'));
          for (const file of ['LICENSE', 'NOTICE', 'UPSTREAM'])
            if (existsSync(join(graphRoot, file))) copy(join(graphRoot, file), join(dest, 'resources/graphify', file));
          json(join(dest, 'resources.json'), { graphify: './resources/graphify/skills/graphify/SKILL.md' });
        }
      }
      if (target === 'codex' && ['web-mcp', 'mcp-github', 'mcp-azure', 'atlassian'].includes(entry.name)) {
        const skill = join(dest, 'skills', `setup-${entry.name}`);
        mkdirSync(skill, { recursive: true });
        writeFileSync(
          join(skill, 'SKILL.md'),
          `---\nname: setup-${entry.name}\ndescription: Set up the ${entry.name} integration installed by dead-agent-skills.\n---\n\n${integrationSetup(entry.name)}\n`,
        );
      }
      if (target === 'codex') {
        if (['flows', 'dead-skills', 'web-mcp', 'mcp-github', 'mcp-azure', 'atlassian'].includes(entry.name))
          writeFileSync(join(dest, 'README.md'), packageReadme(entry.name));
        for (const file of readdirSync(dest, { recursive: true, encoding: 'utf8' }))
          if (file.endsWith('.md')) {
            const path = join(dest, file);
            writeFileSync(path, portableText(readFileSync(path, 'utf8'), path, dest));
          }
      }
      const emitted = emitNativePlugin(entry, target, version, hooks);
      const manifestPath = join(dest, target === 'codex' ? '.codex-plugin/plugin.json' : '.claude-plugin/plugin.json');
      const overlay = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
      json(manifestPath, {
        ...overlay,
        ...emitted.manifest,
        ...(target === 'codex' && existsSync(join(dest, 'skills')) ? { skills: './skills/' } : {}),
      });
      if (emitted.hooks) {
        const original =
          src && target === 'claude-code' && existsSync(join(src, 'hooks/hooks.json'))
            ? JSON.parse(readFileSync(join(src, 'hooks/hooks.json'), 'utf8'))
            : {};
        // Shared declarations replace legacy native startup/notify hooks; native modules remain native.
        json(join(dest, 'hooks/hooks.json'), {
          ...(original.modules ? { modules: original.modules } : {}),
          ...emitted.hooks,
        });
      }
    }
    json(
      join(targetRoot, target === 'codex' ? '.agents/plugins/marketplace.json' : '.claude-plugin/marketplace.json'),
      nativeMarketplace(source, target, './plugins'),
    );
  }
  for (const file of ['installer/assets/azure-mcp.mjs', 'THIRD_PARTY.md'])
    if (existsSync(join(source, file))) copy(join(source, file), join(output, basename(file)));
  for (const entry of readdirSync(output, { recursive: true, withFileTypes: true }))
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name),
        bytes = readFileSync(path),
        text = bytes.toString('utf8');
      if (!text.includes('\0') && Buffer.from(text).equals(bytes) && text.includes('\r\n'))
        writeFileSync(path, text.replaceAll('\r\n', '\n'));
    }
  return { diagnostics };
}
function integrationSetup(name: string) {
  const commands: Record<string, string> = {
    'web-mcp': 'codex mcp add dead-agent-skills-web-mcp -- web-mcp',
    'mcp-github':
      'codex mcp add dead-agent-skills-mcp-github --url https://api.githubcopilot.com/mcp --bearer-token-env-var GITHUB_PERSONAL_ACCESS_TOKEN',
    'mcp-azure': 'codex mcp add dead-agent-skills-mcp-azure -- npx -y @tiberriver256/mcp-server-azure-devops@0.1.47',
    atlassian: 'codex mcp add dead-agent-skills-atlassian --url https://mcp.atlassian.com/v1/mcp',
  };
  let setup = `Use the native Codex CLI to configure this integration; no project installer is required.\n\n\`\`\`sh\n${commands[name]}\n\`\`\`\n\nNever paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.`;
  if (name === 'web-mcp')
    setup +=
      '\n\nPut the web-mcp release binary on PATH (or use its absolute path in the command). Install agent-browser separately for browser/search tools; fetch and lookup do not require it. Release binaries: https://github.com/deadmade/dead-claude-skills/releases .';
  if (name === 'mcp-github')
    setup +=
      '\n\nSet GITHUB_PERSONAL_ACCESS_TOKEN in the environment that starts Codex, then restart Codex. Do not put the token in the manifest.';
  if (name === 'mcp-azure')
    setup +=
      '\n\nSet AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT in the environment that starts Codex. In the native server table [mcp_servers.dead-agent-skills-mcp-azure], add env_vars = ["AZURE_DEVOPS_ORG_URL", "AZURE_DEVOPS_PAT", "AZURE_DEVOPS_DEFAULT_PROJECT", "AZURE_DEVOPS_API_VERSION"]. Set [mcp_servers.dead-agent-skills-mcp-azure.env] AZURE_DEVOPS_AUTH_METHOD = "pat" and DOTENV_CONFIG_QUIET = "true". Optional project and API-version variables use the service defaults when unset. Preserve all unrelated configuration; ask for missing non-secret preferences. Node and npx must be installed.';
  if (name === 'atlassian')
    setup +=
      '\n\nComplete OAuth with codex mcp login dead-agent-skills-atlassian. Authentication is a separate user action.';
  return setup;
}

function packageReadme(name: string) {
  if (name === 'flows')
    return '# Codex flows\n\nInstall directly from this marketplace:\n\n```sh\ncodex plugin add flows@dead-agent-skills\ncodex plugin add dead-skills@dead-agent-skills\ncodex plugin add graphify@dead-agent-skills\ncodex plugin add web-mcp@dead-agent-skills\n```\n\nCodex does not install Claude dependency declarations. Companion integrations are optional at runtime: see references/flow-rules.md for fallbacks, and run the web-mcp setup skill to configure its server. Packs, reviewer briefs and graphify resources are bundled. No installer or build is required.\n';
  if (name === 'dead-skills')
    return '# Shared coding rules, Night City and Context7\n\nRun the setup-night-city skill to copy the packaged native theme safely and select it with /theme. No installer is required.\n\nThe trusted startup hook supplies shared coding rules. Review and trust hooks in Codex, then verify a fresh session before removing any installer-managed global rules block. Existing user instructions are preserved. The project-rules skill also carries the conventions. Context7 can be configured without an installer:\n\n```sh\ncodex mcp add dead-agent-skills-dead-skills --url https://mcp.context7.com/mcp\n```\n';
  return `# ${name}\n\n${integrationSetup(name)}\n\nThe setup skill guides native MCP registration and authentication. Installing this setup plugin alone does not register a global MCP server.\n`;
}
