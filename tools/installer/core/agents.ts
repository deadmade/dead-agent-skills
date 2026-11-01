// Host metadata and native event capabilities. Plugin definitions live in catalog/plugins.json.
import type { HookDefinition } from './catalog.ts';

export type AgentId = 'claude-code' | 'codex';
export interface AgentAdapter {
  id: AgentId;
  label: string;
  binary: string;
  configEnv: string;
  configDir: string;
  hooks: Partial<Record<HookDefinition['event'], { event: string; matcher?: string }>>;
}
export const AGENTS: AgentAdapter[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    binary: 'claude',
    configEnv: 'CLAUDE_CONFIG_DIR',
    configDir: '.claude',
    hooks: {
      'session.started': { event: 'SessionStart' },
      'turn.finished': { event: 'Stop' },
      'permission.requested': { event: 'Notification', matcher: '^permission_prompt$' },
      'question.asked': { event: 'PreToolUse', matcher: '^AskUserQuestion$' },
      'notification.received': { event: 'Notification', matcher: '^elicitation_dialog$' },
    },
  },
  {
    id: 'codex',
    label: 'Codex',
    binary: 'codex',
    configEnv: 'CODEX_HOME',
    configDir: '.codex',
    hooks: {
      'session.started': { event: 'SessionStart' },
      'turn.finished': { event: 'Stop' },
      'permission.requested': { event: 'PermissionRequest' },
      'question.asked': { event: 'PreToolUse', matcher: '^request_user_input$' },
    },
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
