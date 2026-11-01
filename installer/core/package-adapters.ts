import { dirname, join, relative, sep } from 'node:path';
import { AGENTS, type AgentId } from './agents.ts';
import { selectHooks, type HookDefinition, type PluginDefinition } from './catalog.ts';

export function portableText(text: string, file: string, root: string): string {
  const parts = relative(root, file).split(sep);
  const resourceRoot = parts[0] === 'packs' && parts.length > 2 ? join(root, 'packs', parts[1]) : root;
  const rel = relative(dirname(file), resourceRoot).split(sep).join('/') || '.';
  return (
    text
      .replaceAll('${CLAUDE_PLUGIN_ROOT}', rel)
      .replaceAll('${CLAUDE_SKILL_DIR}', '.')
      // Shared instructions may intentionally name both files. Adapt single-host lines only.
      .split('\n')
      .map((line) => (line.includes('AGENTS.md') ? line : line.replaceAll('CLAUDE.md', 'AGENTS.md')))
      .join('\n')
      .replaceAll('AskUserQuestion', 'the host user-question tool')
      .replaceAll('the Read tool', 'the host file-reading tool')
      .replaceAll('~/.claude/plugins/**/pstack-picks/**/skills/<name>/SKILL.md', `${rel}/skills/<name>/SKILL.md`)
  );
}

export function emitNativePlugin(
  definition: PluginDefinition,
  target: AgentId,
  version: string,
  hooks: HookDefinition[],
): { manifest: object; hooks?: object } {
  const native = AGENTS.find((agent) => agent.id === target)!;
  const events: Record<
    string,
    { matcher?: string; hooks: { type: string; command: string; async?: boolean; timeout: number }[] }[]
  > = {};
  for (const hook of selectHooks(hooks, target).hooks) {
    const mapping = native.hooks[hook.event]!;
    const root = target === 'codex' ? '${CODEX_PLUGIN_ROOT}' : '${CLAUDE_PLUGIN_ROOT}';
    const command = `node "${root}/hooks/runtime/run.mjs" --harness ${target} --event ${hook.event} --handler ${hook.handler}`;
    (events[mapping.event] ??= []).push({
      ...(mapping.matcher ? { matcher: mapping.matcher } : {}),
      hooks: [{ type: 'command', command, ...(hook.background ? { async: true } : {}), timeout: hook.timeoutSeconds }],
    });
  }
  let description = definition.description;
  if (target === 'codex') {
    if (definition.name === 'dead-skills')
      description = 'Shared coding conventions, desktop notifications and Context7 setup for Codex.';
    if (definition.name === 'graphify')
      description = 'Graphify skills for querying a codebase knowledge graph. Requires the graphify CLI.';
    if (definition.name === 'flows')
      description =
        'Portable conductor skills with approval gates and resumable flow documents. Install the companion plugins listed in README.md from the same marketplace.';
    description = description.replaceAll('for Claude', 'for coding agents');
  }
  const manifest = {
    name: definition.name,
    version,
    description,
    ...(definition.resources.includes('skills') ? { skills: './skills/' } : {}),
    ...(target === 'codex'
      ? { interface: { displayName: definition.name, shortDescription: description.slice(0, 100) } }
      : {}),
  };
  return { manifest, ...(Object.keys(events).length ? { hooks: { hooks: events } } : {}) };
}
