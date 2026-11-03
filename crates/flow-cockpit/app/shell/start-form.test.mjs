// The start form, in jsdom. Runs in flow-cockpit.yml after `npm ci`, not in `npm test`:
//   node --test crates/flow-cockpit/app/shell/start-form.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// jsdom has no modal dialog: it opens and closes the way the browser's flag does.
dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open');
};

const { mountStartForm } = await import('./start-form.js');

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const PROJECTS = [
  { id: 'alpha', name: 'alpha', roots: ['/w/alpha', '/w/alpha-wt'] },
  { id: 'beta', name: 'beta', roots: ['/w/beta'] },
];
const run = (slug, conductor, phase) => ({ kind: 'FlowRun', slug, conductor, phase });
const ENTRIES = {
  alpha: [
    run('web-mcp-search', 'feature', 'build'),
    run('old-thing', 'feature', 'done'),
    run('cockpit-study', 'research', 'plan'),
    run('rename-all', 'implement', 'build'),
    run('flaky-test', 'fix', 'diagnose'),
    run('bump-deps', 'upgrade', 'build'),
    run('mystery', 'invented', 'build'),
    { kind: 'Loose', id: 's1', first_prompt: 'hello' },
  ],
  beta: [],
};

/**
 * A form over fake `data` and `shell`: `previews` and `starts` record the calls, `navigations` the routes. `startSession`
 * answers with the id it was given unless `startFails` holds a reason.
 */
function mounted(options = {}) {
  const previews = [];
  const starts = [];
  const navigations = [];
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const data = {
    projects: async () => PROJECTS,
    entries: async (project) => ENTRIES[project] ?? [],
    previewCommand: async (input) => {
      previews.push(input);
      return `claude --session-id ${input.session_id} [${input.model ?? ''}|${input.effort ?? ''}|${input.prompt ?? ''}]`;
    },
  };
  const shell = {
    startSession: async (input, cols, rows) => {
      starts.push([input, cols, rows]);
      if (options.startFails) throw options.startFails;
      return input.session_id;
    },
  };
  const form = mountStartForm({
    data,
    shell,
    navigate: (route) => navigations.push(route),
    route: () => options.route ?? { to: 'list' },
    host,
  });
  return { host, form, previews, starts, navigations };
}

const field = (host, name) => host.querySelector(`[name="${name}"]`);
const dialog = (host) => host.querySelector('dialog');
const isOpen = (host) => dialog(host).hasAttribute('open');
const preview = (host) => field(host, 'command').textContent;
const error = (host) => host.querySelector('[role="alert"]');

function type(host, name, value, event = 'input') {
  const el = field(host, name);
  el.value = value;
  el.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
}

async function open(host) {
  host.querySelector('button[data-start-session]').click();
  await settle();
  await settle();
}

async function submit(host) {
  dialog(host).querySelector('form').requestSubmit();
  await settle();
  await settle();
}

test('preview_updates_as_fields_change', async () => {
  const { host, previews } = mounted();
  await open(host);
  assert.match(preview(host), /^claude --session-id /);

  type(host, 'model', 'opus');
  await settle();
  assert.equal(previews.at(-1).model, 'opus');
  assert.match(preview(host), /\[opus\|\|\]/);

  type(host, 'effort', 'high', 'change');
  await settle();
  assert.equal(previews.at(-1).effort, 'high');
  assert.match(preview(host), /\[opus\|high\|\]/);

  type(host, 'prompt', 'fix the bug');
  await settle();
  assert.equal(previews.at(-1).prompt, 'fix the bug');
  assert.match(preview(host), /\[opus\|high\|fix the bug\]/);

  type(host, 'worktree', 'try-it');
  await settle();
  assert.equal(previews.at(-1).new_worktree, 'try-it');
  assert.equal(previews.at(-1).cwd, '/w/alpha');
});

test('continue_prefills_the_flow_command_with_the_skill_name', async () => {
  const { host, previews } = mounted();
  await open(host);
  const slugs = [...field(host, 'run').options].map((o) => o.textContent);
  // Only unfinished runs of a known conductor: not the done run, the loose session or the unknown conductor.
  assert.equal(slugs.length, 1 + 5);
  assert.ok(!slugs.some((s) => s.includes('old-thing') || s.includes('hello') || s.includes('mystery')));

  const picks = {
    'web-mcp-search': '/flows:build-feature web-mcp-search',
    'cockpit-study': '/flows:research-feature cockpit-study',
    'rename-all': '/flows:implement rename-all',
    'flaky-test': '/flows:fix flaky-test',
    'bump-deps': '/flows:upgrade bump-deps',
  };
  for (const [slug, prompt] of Object.entries(picks)) {
    const option = [...field(host, 'run').options].find((o) => o.textContent.includes(slug));
    type(host, 'run', option.value, 'change');
    await settle();
    assert.equal(field(host, 'prompt').value, prompt);
    assert.equal(previews.at(-1).prompt, prompt);
  }
  type(host, 'run', '', 'change');
  await settle();
  assert.equal(field(host, 'prompt').value, '', 'choosing no run takes its prefill back');
});

test('session_id_is_generated_once_and_reused_for_preview_and_start', async () => {
  const { host, previews, starts } = mounted();
  await open(host);
  type(host, 'model', 'opus');
  type(host, 'prompt', 'go');
  await settle();
  await submit(host);

  const ids = [...previews.map((p) => p.session_id), starts[0][0].session_id];
  assert.ok(ids.length >= 3);
  assert.match(ids[0], UUID);
  assert.deepEqual([...new Set(ids)], [ids[0]], 'the preview and the launch name one id');

  // A new form after a start is a new session: it has an id of its own.
  await open(host);
  assert.notEqual(previews.at(-1).session_id, ids[0]);
});

test('a_cancelled_form_starts_afresh_with_a_new_id', async () => {
  const { host, previews, starts } = mounted();
  await open(host);
  type(host, 'model', 'opus');
  await settle();
  const first = previews.at(-1).session_id;
  host.querySelector('button[data-cancel]').click();
  assert.equal(isOpen(host), false);
  assert.equal(starts.length, 0);

  await open(host);
  assert.equal(field(host, 'model').value, '');
  assert.notEqual(previews.at(-1).session_id, first);
});

test('start_calls_start_session_with_the_built_spec', async () => {
  const { host, previews, starts, navigations } = mounted();
  await open(host);
  type(host, 'folder', '/w/alpha-wt', 'change');
  type(host, 'worktree', 'feat-x');
  type(host, 'model', 'opus');
  type(host, 'effort', 'max', 'change');
  type(host, 'prompt', '-leading dash');
  await settle();
  await submit(host);

  assert.equal(starts.length, 1);
  const [input, cols, rows] = starts[0];
  assert.deepEqual(input, {
    cwd: '/w/alpha-wt',
    new_worktree: 'feat-x',
    model: 'opus',
    effort: 'max',
    prompt: '-leading dash',
    session_id: previews.at(-1).session_id,
  });
  assert.deepEqual([cols, rows], [80, 24]);
  assert.deepEqual(navigations, [{ to: 'session', project: 'alpha', id: input.session_id }]);
  assert.equal(isOpen(host), false);
});

test('empty_fields_are_sent_as_nothing', async () => {
  const { host, starts } = mounted();
  await open(host);
  type(host, 'model', '  ');
  await settle();
  await submit(host);
  const [input] = starts[0];
  assert.deepEqual(
    [input.new_worktree, input.model, input.effort, input.prompt],
    [null, null, null, null],
    'a blank field adds no flag',
  );
});

test('the_form_follows_the_route_and_the_project_picked', async () => {
  const { host, previews, navigations } = mounted({ route: { to: 'list', project: 'beta' } });
  await open(host);
  assert.equal(field(host, 'project').value, 'beta');
  assert.deepEqual(
    [...field(host, 'folder').options].map((o) => o.value),
    ['/w/beta'],
  );
  type(host, 'project', 'alpha', 'change');
  await settle();
  await settle();
  assert.deepEqual(
    [...field(host, 'folder').options].map((o) => o.value),
    ['/w/alpha', '/w/alpha-wt'],
  );
  assert.equal(previews.at(-1).cwd, '/w/alpha');
  await submit(host);
  assert.equal(navigations[0].project, 'alpha');
});

test('missing_binary_shows_a_launch_error', async () => {
  const { host, starts, navigations } = mounted({ startFails: 'claude not found' });
  await open(host);
  await submit(host);

  assert.equal(starts.length, 1);
  assert.ok(error(host), 'the failure has a visible place');
  assert.equal(error(host).hidden, false);
  assert.match(error(host).textContent, /claude not found/);
  assert.equal(isOpen(host), true, 'the form stays open for another try');
  assert.deepEqual(navigations, []);
  assert.equal(host.querySelector('button[type="submit"]').disabled, false);

  // The same session id is tried again, so the preview still names the command that runs.
  await submit(host);
  assert.equal(starts[1][0].session_id, starts[0][0].session_id);
});

test('a_preview_that_fails_says_so', async () => {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  mountStartForm({
    data: {
      projects: async () => PROJECTS,
      entries: async () => [],
      previewCommand: async () => {
        throw 'not a session id';
      },
    },
    shell: { startSession: async () => '' },
    navigate: () => {},
    route: () => ({ to: 'list' }),
    host,
  });
  await open(host);
  assert.match(error(host).textContent, /not a session id/);
});
