import { existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import type { Plugin, UiMod } from '../model.ts';
import { copy, json, text } from '../emit/fs.ts';
import { internalDependencies } from '../load.ts';
import { renderClaudeTheme } from '../transforms/themes.ts';
import { claudeThemeSetup } from '../templates/skills.ts';
import { nativeHooks } from './hooks.ts';
import type { EmitContext, Target } from './target.ts';

const ROOT = '${CLAUDE_PLUGIN_ROOT}';
// Neutral substitutions in MCP definitions and settings.
const substitute = (value: string) =>
  value.replaceAll('${config.', '${user_config.').replaceAll('${project.dir}', '${CLAUDE_PROJECT_DIR}');

function mcp(plugin: Plugin) {
  const servers = Object.fromEntries(
    Object.entries(plugin.manifest!.mcpServers).map(([id, s]) => [
      id,
      {
        ...(s.url ? { type: 'http', url: s.url } : {}),
        ...(s.command ? { command: substitute(s.command) } : {}),
        ...(s.args ? { args: s.args.map(substitute) } : {}),
        ...(s.headers
          ? { headers: Object.fromEntries(Object.entries(s.headers).map(([k, v]) => [k, substitute(v)])) }
          : {}),
        ...(s.env ? { env: Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, substitute(v)])) } : {}),
      },
    ]),
  );
  return { mcpServers: servers };
}

function manifest(context: EmitContext, mods: UiMod[]) {
  const { plugin, version } = context;
  const m = plugin.manifest!;
  const dependencies = [
    ...m.dependencies
      .filter((d) => !d.targets || d.targets.includes('claude-code'))
      .map((d) => (d.marketplace ? `${d.name}@${d.marketplace}` : d.name)),
    ...internalDependencies(plugin, context.all, 'claude-code'),
  ];
  return {
    name: plugin.name,
    version,
    description: plugin.description,
    ...(m.author ? { author: m.author } : {}),
    ...(m.homepage ? { homepage: m.homepage } : {}),
    repository: `https://github.com/${context.repository}`,
    ...(m.license ? { license: m.license } : {}),
    ...(m.keywords ? { keywords: m.keywords } : {}),
    ...(dependencies.length ? { dependencies: [...new Set(dependencies)] } : {}),
    ...(Object.keys(m.config).length ? { userConfig: m.config } : {}),
    ...(existsSync(join(context.dest, 'skills')) ? { skills: './skills/' } : {}),
  };
}

export const claudeCode: Target = {
  id: 'claude-code',
  label: 'Claude Code',
  pluginsDir: '.claude-plugin',
  marketplaceFile: '.claude-plugin/marketplace.json',
  marketplacePrefix: './.claude-plugin',
  manifestFile: '.claude-plugin/plugin.json',
  events: {
    'session.started': { event: 'SessionStart' },
    'session.ended': { event: 'SessionEnd' },
    'prompt.submitted': { event: 'UserPromptSubmit' },
    'turn.finished': { event: 'Stop' },
    'subagent.started': { event: 'SubagentStart' },
    'subagent.stopped': { event: 'SubagentStop' },
    'permission.requested': { event: 'Notification', matcher: '^permission_prompt$' },
    'permission.prompted': { event: 'PermissionRequest' },
    'question.asked': { event: 'PreToolUse', matcher: '^AskUserQuestion$' },
    'question.answered': { event: 'PostToolUse', matcher: 'AskUserQuestion' },
    'question.failed': { event: 'PostToolUseFailure', matcher: 'AskUserQuestion' },
    'notification.received': { event: 'Notification', matcher: '^elicitation_dialog$' },
    'notification.any': { event: 'Notification' },
    'tool.starting': { event: 'PreToolUse' },
    'tool.completed': { event: 'PostToolUse' },
  },
  tools: {
    '*': '*',
    shell: 'Bash',
    search: 'Grep',
    'file.read': 'Read',
    'file.find': 'Glob',
    'file.write': 'Write',
    'file.edit': 'Edit',
    'ask-user': 'AskUserQuestion',
  },
  supportsUiMod: () => true,
  emit(context) {
    const { plugin, dest, hooks } = context;
    const m = plugin.manifest!;
    const mods = m.extensions.filter((e) => this.supportsUiMod(e));
    for (const mod of mods)
      for (const sub of [...mod.copy, ...(mod.types ? [mod.types] : [])]) copy(join(plugin.dir!, sub), join(dest, sub));
    const events = nativeHooks(hooks, claudeCode, ROOT);
    const hooksFile = m.hooks ?? 'hooks/hooks.json';
    const modules = mods.map((mod) => './' + posix.relative(dirname(hooksFile), mod.entry));
    if (Object.keys(events).length || modules.length)
      json(join(dest, hooksFile), {
        ...(plugin.hooksDescription ? { description: plugin.hooksDescription } : {}),
        ...(modules.length ? { modules } : {}),
        ...(Object.keys(events).length ? { hooks: events } : {}),
      });
    if (Object.keys(m.mcpServers).length) json(join(dest, '.mcp.json'), mcp(plugin));
    if (Object.keys(m.lsp).length) json(join(dest, '.lsp.json'), m.lsp);
    for (const theme of m.themes) {
      json(join(dest, 'themes', `${theme.name}.json`), renderClaudeTheme(context.palettes.get(theme.name)!));
      text(join(dest, 'skills', `setup-${theme.name}`, 'SKILL.md'), claudeThemeSetup(theme.name));
    }
    json(join(dest, this.manifestFile), manifest(context, mods));
  },
  marketplace(plugins, version, prefix) {
    return {
      $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
      name: 'dead-claude-skills',
      description:
        "deadmade's personal Claude Code setup: own skills plus the third-party plugins used on every machine.",
      metadata: { version },
      owner: { name: 'deadmade', url: 'https://github.com/deadmade' },
      allowCrossMarketplaceDependenciesOn: ['claude-plugins-official'],
      plugins: plugins.map((p) => ({
        name: p.name,
        description: p.description,
        source: typeof p.source === 'string' ? `${prefix}/${p.name}` : p.source,
        category: ['dead-skills', 'mcp-github', 'mcp-azure', 'atlassian', 'md-pane'].includes(p.name)
          ? 'productivity'
          : 'development',
      })),
    };
  },
};
