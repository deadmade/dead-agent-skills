// The window's boot script, in jsdom. Runs in flow-cockpit.yml after `npm ci`, not in `npm test`:
//   node --test crates/flow-cockpit/app/shell/boot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { url: 'http://localhost/' });
dom.window.requestIdleCallback = (callback) =>
  setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 1);
globalThis.window = dom.window;
globalThis.document = dom.window.document;

/** What the webview injects with `withGlobalTauri` off: the IPC transport, and no `__TAURI__`. */
const calls = [];
const callbacks = [];
dom.window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'extensions') return { styles: [], disabled: [], looked: [] };
    return cmd === 'projects' || cmd === 'views' ? [] : null;
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
  assert.deepEqual(listened.map(([, args]) => args.event).sort(), ['changed', 'views-changed']);
  assert.ok(listened.every(([, args]) => args.handler > 0 && args.target.kind === 'Any'));
});
