// Boots the window: hands the view runtime the app's commands and its events, and draws the route the window's address
// names (kept across a reload), else the list. `withGlobalTauri` is off, so there is no `window.__TAURI__`; the
// runtime gets these two functions and a view only ever gets what the runtime builds from them (`data`, `ctx`).
//
// `shell` is what only the window's own chrome may call: the commands that start, type into and stop a process. It is
// built here from the same `invoke` and goes to the chrome below, never into `createRuntime`, so it can't reach a
// view's `ctx`.
import { Channel, invoke } from './vendor/core.js';
import { listen } from './vendor/event.js';
import { createRuntime } from './runtime.js';
import { mountStartForm } from './start-form.js';

const shell = Object.freeze(
  /** @type {import('./api').ShellApi} */ ({
    // `start_session` needs a channel for its output; the terminal pane subscribes with its own, so this one stays unread.
    startSession: (input, cols, rows) => invoke('start_session', { input, cols, rows, onOutput: new Channel() }),
  }),
);

const root = document.getElementById('app');
if (!root) throw new Error('index.html has no #app');
const runtime = createRuntime({ root, invoke, listen });
mountStartForm({ data: runtime.data, shell, navigate: runtime.navigate, route: runtime.route });
runtime.start();
