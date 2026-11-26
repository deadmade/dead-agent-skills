import { validatePayload, normalize } from './common.mjs';
export { encodeContext } from './common.mjs';

// Native matching and interactivity remain at the harness boundary.
export function decode(event, raw, env) {
  validatePayload(raw);
  const matches = {
    'session.started': raw.hook_event_name === 'SessionStart',
    'turn.finished': raw.hook_event_name === 'Stop',
    'question.asked': raw.hook_event_name === 'PreToolUse' && raw.tool_name === 'request_user_input',
    'permission.requested': raw.hook_event_name === 'PermissionRequest',
    'notification.received': false,
  };
  if (!matches[event]) return null;
  return normalize(event, raw, true);
}

// Codex loads the first nonempty file in this order within the resolved home.
export function effectiveGlobalInstructions({ override, agents }) {
  if (override?.trim()) return { source: 'override', text: override };
  if (agents?.trim()) return { source: 'agents', text: agents };
  return { source: 'none', text: '' };
}
