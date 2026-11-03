// The start form: shell chrome, not a view. A "Start session" button the shell mounts outside `#app` (so a redraw never
// reaches it) opens a dialog with a project, a folder, an optional new worktree, a model, an effort and a first prompt,
// and shows the exact `claude` command as the app builds it. Starting calls `shell.startSession`, which only the shell's
// own chrome holds: a view has `data` and nothing that starts a process.
//
// One session id is generated when the form is made and again whenever it resets (after a start or a cancel). Every
// preview and the start carry that same id, so the command shown is the command that runs.

/**
 * @typedef {import('./api').DataApi} DataApi
 * @typedef {import('./api').ShellApi} ShellApi
 * @typedef {import('./api').Route} Route
 * @typedef {import('../../bindings/Project').Project} Project
 * @typedef {import('../../bindings/FlowRunSummary').FlowRunSummary} FlowRunSummary
 * @typedef {import('../../bindings/LaunchSpecInput').LaunchSpecInput} LaunchSpecInput
 */

/** A flow's `flow:` value (what `FlowRunSummary.conductor` holds) to the skill that conducts it. */
const FLOW_SKILL = Object.freeze({
  feature: 'build-feature',
  research: 'research-feature',
  implement: 'implement',
  fix: 'fix',
  upgrade: 'upgrade',
});
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** The terminal pane isn't there yet to measure: its fit sends the real size as soon as it mounts. */
const PANE = Object.freeze({ cols: 80, rows: 24 });

/** @param {unknown} err */
const reason = (err) => (err instanceof Error ? err.message : String(err));

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [className] @param {...(Node | string)} kids
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, className = '', ...kids) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...kids);
  return node;
}

/** A control under its visible label, which names it for a screen reader too. @param {string} label @param {HTMLElement} control */
const labelled = (label, control) => el('label', 'field', label, control);

/** @param {string} name @param {...(Node | string)} kids */
function select(name, ...kids) {
  const node = el('select', '', ...kids);
  node.name = name;
  return node;
}

/** @param {string} value @param {string} text */
const option = (value, text) => Object.assign(el('option', '', text), { value });

/** @param {string} name @param {string} placeholder */
function text(name, placeholder) {
  const node = el('input');
  node.type = 'text';
  node.name = name;
  node.placeholder = placeholder;
  node.autocomplete = 'off';
  return node;
}

/** @param {FlowRunSummary & { kind: string }} run */
const continuePrompt = (run) =>
  `/flows:${FLOW_SKILL[/** @type {keyof typeof FLOW_SKILL} */ (run.conductor)]} ${run.slug}`;

/**
 * Mounts the button and its dialog into `host`.
 * @param {{ data: DataApi, shell: ShellApi, navigate: (to: Route) => void, route: () => Route, host?: HTMLElement }} app
 *   `data` for the projects, their runs and the preview; `shell` for the start; `route` for the project the window is on.
 */
export function mountStartForm({ data, shell, navigate, route, host = document.body }) {
  let sessionId = crypto.randomUUID();
  /** @type {Project[]} */
  let projects = [];
  /** @type {(FlowRunSummary & { kind: string })[]} */
  let runs = [];
  /** What choosing a run wrote into the prompt, so choosing none takes back only that. */
  let prefilled = '';
  /** The newest preview asked for: an older answer that comes later is dropped. */
  let previews = 0;
  let starting = false;

  const project = select('project');
  const folder = select('folder');
  const worktree = text('worktree', 'None: run in the folder itself');
  const run = select('run');
  const model = text('model', 'Claude Code’s default');
  const effort = select('effort', option('', 'Default'), ...EFFORTS.map((e) => option(e, e)));
  const prompt = el('textarea');
  prompt.name = 'prompt';
  prompt.rows = 4;
  const command = el('output', 'command');
  command.name = 'command';
  const problem = el('p', 'error');
  problem.setAttribute('role', 'alert');
  problem.hidden = true;
  const start = el('button', '', 'Start');
  start.type = 'submit';
  const cancel = el('button', '', 'Cancel');
  cancel.type = 'button';
  cancel.dataset.cancel = '';

  const title = el('h2', '', 'Start a session');
  title.id = 'start-form-title';
  const form = el(
    'form',
    'start-form',
    title,
    labelled('Project', project),
    labelled('Folder', folder),
    labelled('New worktree', worktree),
    labelled('Continue from a run', run),
    labelled('Model', model),
    labelled('Effort', effort),
    labelled('First prompt', prompt),
    el('p', 'quiet', 'The command that will run:'),
    command,
    problem,
    el('div', 'actions', start, cancel),
  );
  form.method = 'dialog';
  const dialog = el('dialog', 'start-dialog', form);
  dialog.setAttribute('aria-labelledby', title.id);
  const trigger = el('button', 'start-session', 'Start session');
  trigger.type = 'button';
  trigger.dataset.startSession = '';
  host.append(trigger, dialog);

  /** @param {string} message */
  function say(message) {
    problem.textContent = message;
    problem.hidden = !message;
  }

  /** The fields as the app takes them: a blank one adds no flag. @returns {LaunchSpecInput} */
  function input() {
    /** @param {string} value */
    const given = (value) => value.trim() || null;
    return {
      cwd: folder.value,
      new_worktree: given(worktree.value),
      model: given(model.value),
      effort: given(effort.value),
      prompt: given(prompt.value),
      session_id: sessionId,
    };
  }

  async function preview() {
    const mine = ++previews;
    start.disabled = !folder.value || starting;
    if (!folder.value) {
      command.textContent = '';
      return;
    }
    try {
      const shown = await data.previewCommand(input());
      if (mine !== previews) return;
      command.textContent = shown;
    } catch (err) {
      if (mine !== previews) return;
      command.textContent = '';
      say(reason(err));
    }
  }

  /** Any edit is a fresh start for the message, which the next failure writes again. */
  function edited() {
    say('');
    return preview();
  }

  /** The folders and the unfinished runs of the picked project. */
  async function pick() {
    const at = projects.find((p) => p.id === project.value);
    folder.replaceChildren(...(at?.roots ?? []).map((root) => option(root, root)));
    runs = [];
    if (at) {
      try {
        /** @type {import('../../bindings/Entry').Entry[]} */
        const entries = (await data.entries(at.id)) ?? [];
        runs = entries.flatMap((e) =>
          e.kind === 'FlowRun' && e.phase !== 'done' && Object.hasOwn(FLOW_SKILL, e.conductor) ? [e] : [],
        );
      } catch {
        // The runs only fill in a prompt: without them the form still starts a session.
      }
    }
    run.replaceChildren(option('', 'None'), ...runs.map((r, i) => option(String(i), `${r.slug} (${r.conductor})`)));
    await preview();
  }

  async function load() {
    try {
      projects = (await data.projects()) ?? [];
    } catch (err) {
      projects = [];
      say(`The projects couldn't be read: ${reason(err)}`);
    }
    const at = route();
    const wanted = 'project' in at ? at.project : undefined;
    project.replaceChildren(...projects.map((p) => option(p.id, p.name)));
    project.value = projects.some((p) => p.id === wanted) ? (wanted ?? '') : (projects[0]?.id ?? '');
    await pick();
  }

  /** A new form: its own session id, and the fields as they were first drawn. */
  function reset() {
    sessionId = crypto.randomUUID();
    previews++;
    for (const field of [worktree, model, effort, prompt, run]) field.value = '';
    prefilled = '';
    say('');
  }

  async function open() {
    dialog.showModal();
    await load();
  }

  /** @param {boolean} close whether the dialog is still open */
  function finish(close) {
    if (close) dialog.close();
    reset();
  }

  trigger.addEventListener('click', open);
  cancel.addEventListener('click', () => finish(true));
  // Escape closes the dialog itself.
  dialog.addEventListener('cancel', () => finish(false));
  for (const field of [folder, worktree, model, effort, prompt]) {
    field.addEventListener(
      field instanceof window.HTMLInputElement || field instanceof window.HTMLTextAreaElement ? 'input' : 'change',
      edited,
    );
  }
  project.addEventListener('change', () => {
    say('');
    return pick();
  });
  run.addEventListener('change', () => {
    const chosen = run.value ? runs[Number(run.value)] : undefined;
    const next = chosen ? continuePrompt(chosen) : '';
    if (chosen || prompt.value === prefilled) prompt.value = next;
    prefilled = next;
    return edited();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (starting || !folder.value) return;
    starting = true;
    start.disabled = true;
    say('');
    const at = project.value;
    try {
      const id = await shell.startSession(input(), PANE.cols, PANE.rows);
      finish(true);
      navigate({ to: 'session', project: at, id });
    } catch (err) {
      say(`The session didn't start: ${reason(err)}`);
    } finally {
      starting = false;
      start.disabled = !folder.value;
    }
  });

  return { open, trigger, dialog };
}
