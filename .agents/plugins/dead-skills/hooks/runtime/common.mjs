// Internal mechanics shared by packaged native adapters.
export function validatePayload(raw) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    typeof raw.hook_event_name !== 'string' ||
    typeof raw.cwd !== 'string' ||
    typeof raw.session_id !== 'string'
  )
    throw new Error('Malformed native hook payload');
  for (const key of ['agent_id', 'last_assistant_message', 'message'])
    if (raw[key] != null && typeof raw[key] !== 'string') throw new Error('Malformed native hook payload');
  if (raw.stop_hook_active !== undefined && typeof raw.stop_hook_active !== 'boolean')
    throw new Error('Malformed native hook payload');
}

export function normalize(event, raw, interactive) {
  const result = {
    kind: event,
    cwd: raw.cwd,
    sessionId: raw.session_id,
    agentId: raw.agent_id,
    continuation: raw.stop_hook_active === true,
    interactive,
    detail: raw.last_assistant_message ?? '',
  };
  if (event === 'question.asked') {
    if (
      raw.tool_input !== undefined &&
      (!raw.tool_input || typeof raw.tool_input !== 'object' || Array.isArray(raw.tool_input))
    )
      throw new Error('Malformed native hook payload');
    if (raw.tool_input?.questions !== undefined && !Array.isArray(raw.tool_input.questions))
      throw new Error('Malformed native hook payload');
    for (const entry of raw.tool_input?.questions ?? []) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry) ||
        (entry.question !== undefined && typeof entry.question !== 'string')
      )
        throw new Error('Malformed native hook payload');
    }
    const question = raw.tool_input?.questions?.[0]?.question;
    if (question !== undefined && typeof question !== 'string') throw new Error('Malformed native hook payload');
    result.detail = question ?? '';
    result.questionReason = result.detail;
  } else if (event === 'permission.requested') {
    result.detail = raw.message ?? (typeof raw.reason === 'string' ? raw.reason : '');
    result.permissionReason = result.detail;
  } else if (event === 'notification.received') result.detail = raw.message ?? '';
  return result;
}

export function encodeContext(text) {
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } };
}
