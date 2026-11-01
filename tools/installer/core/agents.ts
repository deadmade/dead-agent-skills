// Host metadata. Plugin definitions live in plugins/catalog.json; native event mappings belong to the harness compiler.

export type AgentId = 'claude-code' | 'codex';
export interface AgentAdapter {
  id: AgentId;
  label: string;
  binary: string;
  configEnv: string;
  configDir: string;
}
export const AGENTS: AgentAdapter[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    binary: 'claude',
    configEnv: 'CLAUDE_CONFIG_DIR',
    configDir: '.claude',
  },
  {
    id: 'codex',
    label: 'Codex',
    binary: 'codex',
    configEnv: 'CODEX_HOME',
    configDir: '.codex',
  },
];
export const CODEX_MARKETPLACE = 'dead-agent-skills';
export function selectedAgents(flags: string[]): AgentId[] | undefined {
  const values = flags.filter((f) => f.startsWith('--agents='));
  if (!values.length) return undefined;
  if (values.length !== 1) throw new Error('Use --agents once');
  const names = values[0].slice('--agents='.length).split(',');
  if (!names.length || names.some((n) => !AGENTS.some((a) => a.id === n)))
    throw new Error('Use --agents=claude-code,codex (or either agent alone)');
  return [...new Set(names)] as AgentId[];
}
