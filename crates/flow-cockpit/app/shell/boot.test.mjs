// The window's boot script, in jsdom. Runs in flow-cockpit.yml after `npm ci`, not in `npm test`:
//   node --test crates/flow-cockpit/app/shell/boot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { url: 'http://localhost/' });
dom.window.requestIdleCallback = (callback) =>
  setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 1);
globalThis.window = dom.window;
// jsdom has no modal dialog: it opens the way the browser's flag does.
dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open');
};
globalThis.document = dom.window.document;

/** What the webview injects with `withGlobalTauri` off: the IPC transport, and no `__TAURI__`. */
const calls = [];
const callbacks = [];
dom.window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'extensions') return { styles: [], disabled: [], looked: [] };
    if (cmd === 'projects') return [{ id: 'p1', name: 'alpha', roots: ['/w/alpha'] }];
    if (cmd === 'preview_command') return `claude --session-id ${args.input.session_id}`;
    if (cmd === 'start_session') return args.input.session_id;
    return cmd === 'views' || cmd === 'entries' ? [] : null;
  },
  transformCallback: (callback) => callbacks.push(callback),
};

test('window_tauri_is_not_global', async () => {
  await import('./boot.js');
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(dom.window.__TAURI__, undefined);
  assert.ok(
    calls.some(([cmd]) => cmd === 'projects' || cmd === 'views'),
    'boot reached the app through its own invoke',
  );
  const listened = calls.filter(([cmd]) => cmd === 'plugin:event|listen');
  assert.deepEqual(listened.map(([, args]) => args.event).sort(), ['changed', 'close-requested', 'views-changed']);
  assert.ok(listened.every(([, args]) => args.handler > 0 && args.target.kind === 'Any'));
});

test('boot_mounts_the_start_form_outside_the_app_and_starts_through_a_channel', async () => {
  const button = document.querySelector('button[data-start-session]');
  assert.ok(button, 'the shell draws a Start session button');
  assert.ok(!document.getElementById('app').contains(button), 'it sits outside #app, where a redraw never reaches it');

  button.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  document.querySelector('dialog form').requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const started = calls.filter(([cmd]) => cmd === 'start_session');
  assert.equal(started.length, 1);
  const [, args] = started[0];
  assert.deepEqual([args.cols, args.rows], [80, 24]);
  assert.equal(args.input.cwd, '/w/alpha');
  assert.match(args.onOutput.toJSON(), /^__CHANNEL__:\d+$/, 'start_session gets a Channel for its on_output');
  const previewed = calls.filter(([cmd]) => cmd === 'preview_command').map(([, a]) => a.input.session_id);
  assert.ok(previewed.length && previewed.every((id) => id === args.input.session_id));
});
