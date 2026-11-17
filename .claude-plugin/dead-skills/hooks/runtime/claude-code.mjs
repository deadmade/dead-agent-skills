import { validatePayload, normalize } from './common.mjs';
export { encodeContext } from './common.mjs';

// Native matching and interactivity remain at the harness boundary.
export function decode(event, raw, env) {
  validatePayload(raw);
  const matches = {
    'session.started': raw.hook_event_name === 'SessionStart',
    'turn.finished': raw.hook_event_name === 'Stop',
    'question.asked': raw.hook_event_name === 'PreToolUse' && raw.tool_name === 'AskUserQuestion',
    'permission.requested': raw.hook_event_name === 'Notification' && raw.notification_type === 'permission_prompt',
    'notification.received': raw.hook_event_name === 'Notification' && raw.notification_type === 'elicitation_dialog',
  };
  if (!matches[event]) return null;
  return normalize(event, raw, !env.CLAUDE_CODE_ENTRYPOINT?.startsWith('sdk'));
}
