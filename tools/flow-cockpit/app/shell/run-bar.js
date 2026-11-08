// The run bar on a hosted session's Session tab: the flow run the session is linked to, as the phase stepper, a segment
// per plan task, the task in progress and the run's `now:` line. Read-only: it only reads the data the views read.
import { stepper } from './blocks/stepper.js';
import { el } from './dom.js';

/**
 * @typedef {import('../../bindings/AgentInfo').AgentInfo} AgentInfo
 * @typedef {import('../../bindings/FlowRun').FlowRun} FlowRun
 * @typedef {import('../../bindings/Entry').Entry} Entry
 * @typedef {import('./api').DataApi} DataApi
 */

/** An RFC 3339 time as milliseconds; one that doesn't parse is older than any that does. @param {string} iso */
const time = (iso) => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? -Infinity : ms;
};

/**
 * The newest unfinished flow run of the project whose sessions list holds `sessionId`; null for a session no such run
 * lists. A finished run (status `Done`, as the list's drawing ahead reads it) isn't read: a hosted session runs now.
 * @param {DataApi} data @param {string} project @param {string} sessionId @returns {Promise<FlowRun | null>}
 */
export async function findLinkedRun(data, project, sessionId) {
  const listed = (await data.entries(project)) ?? [];
  const runs = listed.flatMap((e) => (e.kind === 'FlowRun' && e.status !== 'Done' ? [e] : []));
  runs.sort((a, b) => time(b.last_activity) - time(a.last_activity));
  for (const { slug } of runs) {
    // A run that can't be read is no match, not a reason to draw no bar.
    const run = await data.flowRun(project, slug).catch(() => null);
    if (run?.sessions.includes(sessionId)) return run;
  }
  return null;
}

/** What each state of a task that is under way is called. @type {Partial<Record<import('../../bindings/TaskState').TaskState, string>>} */
const ACTIVE = { Building: 'being built', Review: 'in review', Waiting: 'waiting on you' };

/** The plan's tasks with their ledger state (`NotStarted` for a task not logged yet). @param {FlowRun} run */
const tasksOf = (run) =>
  (run.plan?.tasks ?? []).map((p) => ({
    plan: p,
    state: run.ledger?.tasks.find((t) => t.id === p.id)?.state ?? 'NotStarted',
  }));

/**
 * The run bar: the shared phase stepper, a segment per plan task, the task in progress and the `now:` line. A part the
 * run has nothing for is left out.
 * @param {FlowRun} run @returns {HTMLElement}
 */
export function renderRunBar(run) {
  const box = el('div', 'run-bar');
  box.setAttribute('aria-label', 'The flow run this session belongs to');
  const { phases, gates, now } = run.flow;
  box.append(
    stepper(
      phases.map((p) => ({
        label: p.name,
        state: p.state,
        ...(p.gate_after === null
          ? {}
          : { gate: { n: p.gate_after, approved: gates.find((g) => g.n === p.gate_after)?.approved ?? null } }),
      })),
    ),
  );
  const tasks = tasksOf(run);
  if (tasks.length) {
    const segs = el('span', 'segs run-bar-tasks');
    const done = tasks.filter((t) => t.state === 'Done').length;
    segs.setAttribute('role', 'img');
    segs.setAttribute('aria-label', `${done} of ${tasks.length} tasks done`);
    for (const { plan, state } of tasks) {
      const seg = el('span', `seg ${state === 'Done' ? 'done' : ACTIVE[state] ? 'current' : ''}`.trim());
      seg.title = `Task ${plan.id}: ${plan.title}`;
      segs.append(seg);
    }
    box.append(segs);
    const active = tasks.find((t) => ACTIVE[t.state]);
    if (active)
      box.append(el('p', 'run-bar-task', `Task ${active.plan.id}: ${active.plan.title}, ${ACTIVE[active.state]}`));
  }
  if (now) box.append(el('p', 'run-bar-now quiet', `now: ${now}`));
  return box;
}

/**
 * The plan task each subagent works on, by agent id: the task its description names (`Task 2b`) when the run's plan
 * has that task. A subagent that names none, or one the plan doesn't have, is left out.
 * @param {FlowRun} run @param {AgentInfo[]} agents @returns {Map<string, string>}
 */
export function taskNumbers(run, agents) {
  const ids = new Map((run.plan?.tasks ?? []).map((t) => [t.id.toLowerCase(), t.id]));
  /** @type {Map<string, string>} */
  const numbers = new Map();
  for (const agent of agents) {
    const named = /\btask\s+(\d+[a-z]?)\b/i.exec(agent.description ?? '')?.[1];
    const id = named === undefined ? undefined : ids.get(named.toLowerCase());
    if (id !== undefined) numbers.set(agent.id, id);
  }
  return numbers;
}
