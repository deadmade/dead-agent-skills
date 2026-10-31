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
import { mountCloseConfirm } from './close-confirm.js';
import { createRuntime } from './runtime.js';
import { mountSessionPane } from './session-pane.js';
import { mountStartForm } from './start-form.js';

/**
 * @typedef {import('./api').ShellApi & {
 *   resumeSession(id: string, cols: number, rows: number): Promise<string>,
 *   sendInput(id: string, bytes: number[]): Promise<void>,
 *   resizeSession(id: string, cols: number, rows: number): Promise<void>,
 *   subscribeSession(id: string, onChunk: (bytes: ArrayLike<number>) => void): Promise<void>,
 *   hostedSessions(): Promise<string[]>,
 *   scrollback(id: string): Promise<ArrayBuffer>,
 *   confirmClose(): Promise<void>,
 * }} Shell
 * @typedef {import('./session-pane.js').SessionPaneApi} SessionPaneApi
 * @typedef {(cols: number, rows: number, onOutput: Channel<ArrayLike<number>>) => Promise<string>} Launch
 */

/**
 * The sessions running in this app, for the whole window's life: the backend's list at boot (a reload comes back to
 * sessions that kept running), then what this window starts or resumes. A session that exits stays in it: its tab keeps
 * showing its pane, with what it printed and its "session ended" line, until a reload reads the backend's list again,
 * which no longer has it. This window has no way yet to dismiss or resume an ended session in place. Switching project
 * never touches it.
 * @type {Set<string>}
 */
const hosted = new Set();

/**
 * Hosted sessions are tried on Linux only so far: on Windows the app neither starts nor resumes one.
 * `navigator.platform` is `Win32` in WebView2; the user agent names Windows too.
 */
const hosting = !/^win/i.test(window.navigator.platform ?? '') && !/\bWindows\b/.test(window.navigator.userAgent ?? '');

/** The ids with a terminal pane in this window, however it was mounted. @type {Set<string>} */
const withPane = new Set();

/**
 * A launch's output goes straight into its own pane, mounted before the launch. @type {Map<string, Promise<{
 *   onChunk: (bytes: ArrayLike<number>) => void, size: [number, number] | null, live: boolean }>>}
 */
const launching = new Map();

/**
 * Runs `launch` with the pane's own channel as its output, the pane mounted first, so Claude Code's first bytes (its
 * startup queries to the terminal among them) reach a terminal that answers them: no channel goes unread. Nothing has
 * run yet, so there is no backlog for the pane to prime from. The pane stays hidden until the session's tab places it.
 * One that fails keeps its pane for another try with the same id.
 * @param {string} id @param {number} cols @param {number} rows @param {Launch} launch
 */
async function launchInto(id, cols, rows, launch) {
  let ready = launching.get(id);
  if (!ready) {
    if (withPane.has(id)) throw new Error(`session ${id} already has a terminal in this window`);
    /** @type {{ onChunk: (bytes: ArrayLike<number>) => void, size: [number, number] | null, live: boolean }} */
    const feed = { onChunk: () => {}, size: null, live: false };
    /** @type {(value: typeof feed) => void} */
    let resolve = () => {};
    ready = new Promise((r) => (resolve = r));
    const { element } = mountSessionPane(id, {
      ...paneApi,
      scrollback: async () => new ArrayBuffer(0),
      subscribe: (_, onChunk) => {
        feed.onChunk = onChunk;
        resolve(feed);
      },
      // Until the session runs, a size is kept for the launch to open its terminal at.
      resize: (pane, c, r) => {
        feed.size = [c, r];
        return feed.live ? paneApi.resize(pane, c, r) : undefined;
      },
    });
    element.style.display = 'none';
    withPane.add(id);
    launching.set(id, ready);
  }
  const feed = await ready;
  const [c, r] = feed.size ?? [cols, rows];
  const launched = await launch(c, r, new Channel(feed.onChunk));
  feed.live = true;
  hosted.add(launched);
  return launched;
}

const shell = Object.freeze(
  /** @type {Shell} */ ({
    startSession: (input, cols, rows) =>
      launchInto(input.session_id, cols, rows, (c, r, onOutput) =>
        invoke('start_session', { input, cols: c, rows: r, onOutput }),
      ),
    // The folder isn't asked for: the app knows where each session ran, and says so when it doesn't.
    resumeSession: (id, cols, rows) =>
      launchInto(id, cols, rows, (c, r, onOutput) => invoke('resume_session', { id, cols: c, rows: r, onOutput })),
    sendInput: (id, bytes) => invoke('send_input', { id, bytes }),
    resizeSession: (id, cols, rows) => invoke('resize_session', { id, cols, rows }),
    subscribeSession: (id, onChunk) => invoke('subscribe_session', { id, onOutput: new Channel(onChunk) }),
    hostedSessions: () => invoke('hosted_sessions'),
    // The bytes the session has printed so far: raw terminal output, so it is the shell's and never a view's.
    scrollback: (id) => invoke('scrollback', { id }),
    // "Close anyway": the app stops every session and closes the window. This closes the window, so it is the shell's.
    confirmClose: () => invoke('confirm_close'),
  }),
);

const root = document.getElementById('app');
if (!root) throw new Error('index.html has no #app');

/** What a terminal pane is given: the shell's commands for the session, and its buffered output. @type {SessionPaneApi} */
const paneApi = {
  // Keystrokes as UTF-8; xterm's binary reports (old mouse modes) byte for byte.
  write: (id, data) =>
    shell.sendInput(id, Array.from(typeof data === 'string' ? new TextEncoder().encode(data) : data)),
  resize: shell.resizeSession,
  subscribe: shell.subscribeSession,
  scrollback: shell.scrollback,
  onExit: (id, done) =>
    listen('session-exited', (event) => {
      if (event.payload?.id === id) done(event.payload.code ?? null);
    }),
};

const runtime = createRuntime({
  root,
  invoke,
  listen,
  hosted,
  mountPane: (id) => {
    withPane.add(id);
    return mountSessionPane(id, paneApi).element;
  },
  // The terminal pane isn't there yet to measure: its fit sends the real size as soon as it mounts.
  ...(hosting ? { resume: async (/** @type {string} */ id) => void (await shell.resumeSession(id, 80, 24)) } : {}),
});

// Listening first: a close the app holds back waits for this dialog, so a window that couldn't show it would not close.
try {
  await mountCloseConfirm({ shell, listen });
} catch (err) {
  console.error('flow-cockpit: the close confirmation:', err);
}

try {
  for (const id of (await shell.hostedSessions()) ?? []) hosted.add(id);
} catch (err) {
  console.error('flow-cockpit: the running sessions:', err);
}
if (hosting) mountStartForm({ data: runtime.data, shell, navigate: runtime.navigate, route: runtime.route });
else {
  const note = document.createElement('p');
  note.className = 'start-session unavailable';
  note.setAttribute('role', 'note');
  note.textContent = 'Starting and resuming sessions isn’t available on Windows yet.';
  document.body.append(note);
}
runtime.start();
