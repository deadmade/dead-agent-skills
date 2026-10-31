// Boots the window: hands the view runtime the app's commands and its events, and draws the route the window's address
// names (kept across a reload), else the list. `withGlobalTauri` is off, so there is no `window.__TAURI__`; the
// webview's IPC transport is read here once, and a view only ever gets what the runtime builds from it (`data`, `ctx`).
import { createRuntime } from './runtime.js';

const ipc = /** @type {any} */ (window).__TAURI_INTERNALS__;
const root = document.getElementById('app');
if (!root) throw new Error('index.html has no #app');

/** @type {import('./runtime.js').Invoke} */
const invoke = (cmd, args) => ipc.invoke(cmd, args);
/** @type {import('./runtime.js').Listen} */
const listen = (event, handler) =>
  ipc.invoke('plugin:event|listen', { event, target: { kind: 'Any' }, handler: ipc.transformCallback(handler) });

createRuntime({ root, invoke, listen }).start();
