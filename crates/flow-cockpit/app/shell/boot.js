// Boots the window: hands the view runtime the app's commands and its events, and draws the route the window's address
// names (kept across a reload), else the list. `withGlobalTauri` is off, so there is no `window.__TAURI__`; the
// runtime gets these two functions and a view only ever gets what the runtime builds from them (`data`, `ctx`).
//
// `shell` is what only the window's own chrome may call: the commands that start, type into and stop a process. It is
// built here from the same `invoke` and goes to the chrome below, never into `createRuntime`, so it can't reach a
// view's `ctx`. The runtime gets the one thing it needs of the terminals: `mountPane`, which makes a hosted session's
// pane from `shell`, and `hosted`, the ids of the sessions this window can show one for.
import { Channel, invoke } from './vendor/core.js';
import { listen } from './vendor/event.js';
import { createRuntime } from './runtime.js';
import { mountSessionPane } from './session-pane.js';
import { mountStartForm } from './start-form.js';

/**
 * @typedef {import('./api').ShellApi & {
 *   resumeSession(cwd: string, id: string, cols: number, rows: number): Promise<string>,
 *   sendInput(id: string, bytes: number[]): Promise<void>,
 *   resizeSession(id: string, cols: number, rows: number): Promise<void>,
 *   subscribeSession(id: string, onChunk: (bytes: ArrayLike<number>) => void): Promise<void>,
 *   hostedSessions(): Promise<string[]>,
 *   scrollback(id: string): Promise<ArrayBuffer>,
 * }} Shell
 */

/**
 * The sessions running in this app, for the whole window's life: the backend's list at boot (a reload comes back to
 * sessions that kept running), then what this window starts or resumes, less what exits. Switching project never
 * touches it.
 * @type {Set<string>}
 */
const hosted = new Set();

const shell = Object.freeze(
  /** @type {Shell} */ ({
    // `start_session` and `resume_session` need a channel for their output; the terminal pane subscribes with its own,
    // so this one stays unread.
    startSession: async (input, cols, rows) => {
      const id = await invoke('start_session', { input, cols, rows, onOutput: new Channel() });
      hosted.add(id);
      return id;
    },
    resumeSession: async (cwd, id, cols, rows) => {
      const resumed = await invoke('resume_session', { cwd, id, cols, rows, onOutput: new Channel() });
      hosted.add(resumed);
      return resumed;
    },
    sendInput: (id, bytes) => invoke('send_input', { id, bytes }),
    resizeSession: (id, cols, rows) => invoke('resize_session', { id, cols, rows }),
    subscribeSession: (id, onChunk) => invoke('subscribe_session', { id, onOutput: new Channel(onChunk) }),
    hostedSessions: () => invoke('hosted_sessions'),
    // The bytes the session has printed so far: raw terminal output, so it is the shell's and never a view's.
    scrollback: (id) => invoke('scrollback', { id }),
  }),
);

const root = document.getElementById('app');
if (!root) throw new Error('index.html has no #app');

/** What a terminal pane is given: the shell's commands for the session, and its buffered output. */
const paneApi = {
  write: (/** @type {string} */ id, /** @type {string} */ text) =>
    shell.sendInput(id, Array.from(new TextEncoder().encode(text))),
  resize: shell.resizeSession,
  subscribe: shell.subscribeSession,
  scrollback: shell.scrollback,
  onExit: (/** @type {string} */ id, /** @type {(code: number | null) => void} */ done) =>
    listen('session-exited', (event) => {
      if (event.payload?.id === id) done(event.payload.code ?? null);
    }),
};

const runtime = createRuntime({
  root,
  invoke,
  listen,
  hosted,
  mountPane: (id) => mountSessionPane(id, paneApi).element,
});

try {
  for (const id of (await shell.hostedSessions()) ?? []) hosted.add(id);
} catch (err) {
  console.error('flow-cockpit: the running sessions:', err);
}
mountStartForm({ data: runtime.data, shell, navigate: runtime.navigate, route: runtime.route });
runtime.start();
