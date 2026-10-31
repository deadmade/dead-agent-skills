// The window's boot script, in jsdom. Runs in flow-cockpit.yml after `npm ci`, not in `npm test`:
//   node --test crates/flow-cockpit/app/shell/boot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

const PAGE = '<!doctype html><html><body><main id="app"></main><div id="terminals"></div></body></html>';

/** What a window needs for the real xterm.js and the start form's dialog, which jsdom lacks. @param {import('jsdom').DOMWindow} win */
function windowLike(win) {
  win.requestIdleCallback = (callback) => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 1);
  // jsdom has no modal dialog: it opens the way the browser's flag does.
  win.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  win.HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
  win.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  win.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Quiet: jsdom says it has no canvas when xterm.js looks for one.
const dom = new JSDOM(PAGE, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  virtualConsole: new VirtualConsole(),
});
windowLike(dom.window);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.ResizeObserver = dom.window.ResizeObserver;
// Node's own `navigator` is a getter-only global.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(done, what) {
  for (let i = 0; i < 200; i++) {
    if (done()) return;
    await settle(5);
  }
  assert.fail(`timed out waiting for ${what}`);
}
const text = (bytes) => new TextDecoder().decode(new Uint8Array(bytes));

/** What the webview injects with `withGlobalTauri` off: the IPC transport, and no `__TAURI__`. */
const calls = [];
const callbacks = [];
/** Says, for one `start_session` call, what the app does: throws, or sends output into the channel it was given. */
let starting = null;
dom.window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'extensions') return { styles: [], disabled: [], looked: [] };
    if (cmd === 'projects') return [{ id: 'p1', name: 'alpha', roots: ['/w/alpha'] }];
    if (cmd === 'preview_command') return `claude --session-id ${args.input.session_id}`;
    if (cmd === 'start_session') {
      await starting?.(args);
      return args.input.session_id;
    }
    return cmd === 'views' || cmd === 'entries' ? [] : null;
  },
  transformCallback: (callback) => callbacks.push(callback),
};
/** Sends `bytes` into a channel the window made, as the app's raw channel messages arrive: an ArrayBuffer. */
const send = (channel, index, bytes) =>
  callbacks[channel.id - 1]({ index, message: new TextEncoder().encode(bytes).buffer });

test('window_tauri_is_not_global', async () => {
  await import('./boot.js');
  await settle();

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
  await settle();
  document.querySelector('dialog form').requestSubmit();
  await settle();

  const started = calls.filter(([cmd]) => cmd === 'start_session');
  assert.equal(started.length, 1);
  const [, args] = started[0];
  assert.deepEqual([args.cols, args.rows], [80, 24]);
  assert.equal(args.input.cwd, '/w/alpha');
  assert.match(args.onOutput.toJSON(), /^__CHANNEL__:\d+$/, 'start_session gets a Channel for its on_output');
  const previewed = calls.filter(([cmd]) => cmd === 'preview_command').map(([, a]) => a.input.session_id);
  assert.ok(previewed.length && previewed.every((id) => id === args.input.session_id));
});

test('a_fresh_start_streams_into_its_mounted_pane_from_the_first_byte', async () => {
  const before = calls.length;
  /** Whether the session's pane was in the window when each launch was asked for. */
  const paneAtLaunch = [];
  let attempt = 0;
  starting = (args) => {
    const id = args.input.session_id;
    paneAtLaunch.push(Boolean(document.querySelector(`#terminals [data-session-id="${id}"]`)));
    if (++attempt === 1) throw new Error('claude not found');
    // What the app does at once: the session's first output (Claude Code asks for the terminal's attributes as it
    // starts) goes into the channel before the command returns.
    send(args.onOutput, 0, 'starting\x1b[c');
  };
  try {
    document.querySelector('button[data-start-session]').click();
    await settle();
    const form = document.querySelector('dialog form');
    form.requestSubmit();
    await until(() => document.querySelector('dialog [role="alert"]:not([hidden])'), 'the failure');
    // The same id, tried again: the same pane, and this time a session behind it.
    form.requestSubmit();
    await until(() => calls.slice(before).some(([cmd]) => cmd === 'send_input'), "the pane's answer");
  } finally {
    starting = null;
  }

  const mine = calls.slice(before);
  const launches = mine.filter(([cmd]) => cmd === 'start_session');
  assert.equal(launches.length, 2);
  const id = launches[0][1].input.session_id;
  assert.equal(launches[1][1].input.session_id, id, 'a retry keeps the id the preview showed');
  assert.deepEqual(paneAtLaunch, [true, true], 'the pane is mounted before the session starts');
  assert.equal(document.querySelectorAll(`#terminals [data-session-id="${id}"]`).length, 1, 'one pane for the id');
  assert.ok(
    !mine.some(([cmd, a]) => (cmd === 'subscribe_session' || cmd === 'scrollback') && a.id === id),
    'nothing re-reads what the launch already streams',
  );
  // xterm answered the startup query itself, into the session: nothing was dropped or left unread.
  const [, input] = mine.find(([cmd]) => cmd === 'send_input');
  assert.equal(input.id, id);
  assert.match(text(input.bytes), /^\x1b\[\?\d+(;\d+)*c$/);
  const pane = document.querySelector(`#terminals [data-session-id="${id}"]`);
  assert.equal(pane.style.display, 'none', "out of sight until the session's tab places it");
});

test('windows_offers_no_start_or_resume', async () => {
  // A Windows window, on a session this app doesn't run: no Start session button, no Resume, and a note in their place.
  const SESSION_ID = '00000000-0000-4000-8000-0000000000b1';
  const own = new JSDOM(PAGE, {
    url: `http://localhost/#/session/p1/${SESSION_ID}`,
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  windowLike(own.window);
  Object.defineProperty(own.window.navigator, 'platform', { value: 'Win32' });
  const asked = [];
  own.window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      asked.push([cmd, args]);
      if (cmd === 'extensions') return { styles: [], disabled: [], looked: [] };
      if (cmd === 'projects') return [{ id: 'p1', name: 'alpha', roots: ['/w/alpha'] }];
      if (cmd === 'views') return [{ id: 'session', source: 'Builtin', replaced: false }];
      if (cmd === 'view_source')
        return 'export default { id: "session", slot: "session", render: () => document.createElement("p") };';
      return cmd === 'hosted_sessions' || cmd === 'entries' ? [] : null;
    },
    transformCallback: () => 1,
  };
  const shared = [globalThis.window, globalThis.document];
  globalThis.window = own.window;
  globalThis.document = own.window.document;
  try {
    await import('./boot.js?windows');
    await until(() => own.window.document.querySelector('#app section.view'), 'the session screen');
    const doc = own.window.document;
    assert.equal(doc.querySelector('[data-start-session]'), null, 'no Start session button');
    assert.equal(doc.querySelector('[data-resume]'), null, 'no Resume button');
    const note = doc.querySelector('.start-session[role="note"]');
    assert.match(note?.textContent ?? '', /isn’t available on Windows yet/);
    assert.ok(!doc.getElementById('app').contains(note), 'where the Start session button would be');
    assert.ok(!asked.some(([cmd]) => cmd === 'start_session' || cmd === 'resume_session'));
  } finally {
    [globalThis.window, globalThis.document] = shared;
  }
});
