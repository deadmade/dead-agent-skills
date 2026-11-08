import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { copy, json, text } from '../emit/fs.ts';
import { renderCodexTheme } from '../transforms/themes.ts';
import { INTEGRATIONS, READMES, packageReadme, setupSkill } from '../templates/codex.ts';
import { codexThemeSetup, projectRulesSkill } from '../templates/skills.ts';
import { nativeHooks } from './hooks.ts';
import type { Target } from './target.ts';

const ROOT = '${CODEX_PLUGIN_ROOT}';
// Codex listings say what the plugin does there.
const DESCRIPTIONS: Record<string, string> = {
  'dead-skills': 'Shared coding conventions, desktop notifications and Context7 setup for Codex.',
  graphify: 'Graphify skills for querying a codebase knowledge graph. Requires the graphify CLI.',
  flows:
    'Portable conductor skills with approval gates and resumable flow documents. Install the companion plugins listed in README.md from the same marketplace.',
};

export const codex: Target = {
  id: 'codex',
  label: 'Codex',
  pluginsDir: '.agents/plugins',
  marketplaceFile: '.agents/plugins/marketplace.json',
  marketplacePrefix: './.agents/plugins',
  manifestFile: '.codex-plugin/plugin.json',
  events: {
    'session.started': { event: 'SessionStart' },
    'turn.finished': { event: 'Stop' },
    'permission.requested': { event: 'PermissionRequest' },
    'question.asked': { event: 'PreToolUse', matcher: '^request_user_input$' },
  },
  tools: {
    '*': '*',
    shell: 'Bash',
    search: 'Bash',
    'file.read': 'Read',
    'file.find': 'Glob',
    'file.write': 'Write',
    'file.edit': 'Edit',
    'ask-user': 'request_user_input',
  },
  supportsUiMod: () => false,
  emit(context) {
    const { plugin, dest, root, hooks, all } = context;
    const m = plugin.manifest;
    const description = (DESCRIPTIONS[plugin.name] ?? plugin.description).replaceAll('for Claude', 'for coding agents');
    for (const theme of m?.themes ?? []) {
      text(join(dest, 'themes', `${theme.name}.tmTheme`), renderCodexTheme(context.palettes.get(theme.name)!));
      text(join(dest, 'skills', `setup-${theme.name}`, 'SKILL.md'), codexThemeSetup(theme.name));
    }
    if (m?.instructions)
      text(
        join(dest, 'skills/project-rules/SKILL.md'),
        projectRulesSkill(readFileSync(join(plugin.dir!, m.instructions), 'utf8')),
      );
    for (const name of m?.embeds ?? []) {
      const embedded = all.find((p) => p.name === name);
      if (!embedded?.dir) continue;
      copy(join(embedded.dir, 'skills'), join(dest, `resources/${name}/skills`));
      for (const file of ['LICENSE', 'NOTICE', 'UPSTREAM'])
        if (existsSync(join(embedded.dir, file))) copy(join(embedded.dir, file), join(dest, `resources/${name}`, file));
      json(join(dest, 'resources.json'), { [name]: `./resources/${name}/skills/${name}/SKILL.md` });
    }
    if (INTEGRATIONS.includes(plugin.name))
      text(join(dest, 'skills', `setup-${plugin.name}`, 'SKILL.md'), setupSkill(context));
    if (READMES.includes(plugin.name)) text(join(dest, 'README.md'), packageReadme(context));
    if (plugin.name === 'flows') {
      // A conductor runs only when the user calls it, the form the packs' own openai.yaml files ship.
      for (const skill of readdirSync(join(plugin.dir!, 'skills'))) {
        const file = join(plugin.dir!, 'skills', skill, 'SKILL.md');
        const head = existsSync(file) ? (readFileSync(file, 'utf8').split(/^---\s*$/m)[1] ?? '') : '';
        if (/^disable-model-invocation: true\s*$/m.test(head))
          text(join(dest, 'skills', skill, 'agents/openai.yaml'), 'policy:\n  allow_implicit_invocation: false\n');
      }
    }
    const events = nativeHooks(hooks, codex, ROOT);
    if (Object.keys(events).length) json(join(dest, m?.hooks ?? 'hooks/hooks.json'), { hooks: events });
    json(join(dest, this.manifestFile), {
      name: plugin.name,
      version: context.version,
      description,
      interface: { displayName: plugin.name, shortDescription: description.slice(0, 100) },
      ...(existsSync(join(dest, 'skills')) ? { skills: './skills/' } : {}),
    });
  },
  marketplace(plugins, _version, prefix) {
    return {
      name: 'dead-agent-skills',
      interface: { displayName: 'dead-agent-skills' },
      plugins: plugins.map(({ name }) => ({
        name,
        source: { source: 'local', path: `${prefix}/${name}` },
        policy: { installation: 'AVAILABLE', authentication: 'ON_USE' },
        category: 'Productivity',
      })),
    };
  },
};
