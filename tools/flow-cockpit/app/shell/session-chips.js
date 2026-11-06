// The Session tab's chips: what the output pane can show for a session, built from data already read. The main
// session, each subagent and each backgrounded command is one chip. Pure functions: nothing here reads or draws.

/**
 * @typedef {import('../../bindings/Activity').Activity} Activity
 * @typedef {import('../../bindings/BackgroundTask').BackgroundTask} BackgroundTask
 * @typedef {import('../../bindings/Text').Text} Text
 * @typedef {import('../../bindings/ToolCall').ToolCall} ToolCall
 * `id` is the agent's own id for an `agent` chip (what `Text.agent` and `ToolCall.agent` carry), `MAIN` for the main
 * session, and the task's id after `BACKGROUND` for a command. `lastActivity` is an RFC 3339 time, '' for none.
 * @typedef {{ id: string, label: string, kind: 'main' | 'agent' | 'background', lastActivity: string }} Chip
 */

export const MAIN = 'main';
export const BACKGROUND = 'background:';

/** An RFC 3339 time as milliseconds; one that doesn't parse is older than any that does. @param {string | null} iso */
const time = (iso) => {
  const ms = Date.parse(iso ?? '');
  return Number.isNaN(ms) ? -Infinity : ms;
};

/** The later of two times. @param {string | null} a @param {string | null} b @returns {string} */
const later = (a, b) => (time(b) > time(a) ? /** @type {string} */ (b) : (a ?? ''));

/** The task a background chip stands for. @param {Chip} chip */
export const taskOf = (chip) => chip.id.slice(BACKGROUND.length);

/**
 * The main chip for what has no agent, a chip per subagent, a chip per background command, in that order.
 * @param {Activity} activity @param {BackgroundTask[]} backgroundTasks @returns {Chip[]}
 */
export function buildChips(activity, backgroundTasks) {
  /** The newest time seen per agent id (null for the main session). @type {Map<string | null, string>} */
  const newest = new Map();
  for (const turn of activity.turns) {
    for (const item of [turn.prompt, ...turn.replies, ...turn.tools]) {
      if (item) newest.set(item.agent, later(newest.get(item.agent) ?? '', item.at));
    }
  }
  return [
    { id: MAIN, label: 'Main session', kind: 'main', lastActivity: newest.get(null) ?? '' },
    ...activity.agents.map((a) => ({
      id: a.id,
      label: a.description ?? a.kind ?? 'A subagent',
      kind: /** @type {const} */ ('agent'),
      lastActivity: later(later(newest.get(a.id) ?? '', a.started), a.ended),
    })),
    ...backgroundTasks.map((t) => ({
      id: BACKGROUND + t.id,
      label: `Background ${t.id}`,
      kind: /** @type {const} */ ('background'),
      lastActivity: t.started,
    })),
  ];
}

/** The id of the chip with the newest activity; the first of equals, so the main chip wins a tie. @param {Chip[]} chips */
export function followLatest(chips) {
  let best = chips[0];
  for (const chip of chips) if (time(chip.lastActivity) > time(best.lastActivity)) best = chip;
  return best?.id ?? MAIN;
}

/**
 * What the chip's agent said and called in the turns read, in time order (the main chip's, what has no agent). A
 * background command has no activity of this kind.
 * @param {Activity} activity @param {Chip} chip @returns {{ text: Text[], tools: ToolCall[] }}
 */
export function filterActivity(activity, chip) {
  if (chip.kind === 'background') return { text: [], tools: [] };
  const agent = chip.kind === 'main' ? null : chip.id;
  /** @type {Text[]} */
  const text = [];
  /** @type {ToolCall[]} */
  const tools = [];
  for (const turn of activity.turns) {
    if (turn.prompt && turn.prompt.agent === agent) text.push(turn.prompt);
    text.push(...turn.replies.filter((r) => r.agent === agent));
    tools.push(...turn.tools.filter((c) => c.agent === agent));
  }
  return { text, tools };
}
