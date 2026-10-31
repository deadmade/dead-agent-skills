// A hosted session's terminal: shell chrome, not a view. One xterm.js `Terminal` per session id lives in a `<div>`
// under `#terminals`, outside `#app`, so the view runtime's redraws never reach it. The pane touches neither `data` nor
// `shell`: it calls the `api` it is given, which the shell builds from `shell.sendInput`, `shell.resizeSession`,
// `shell.subscribeSession` and `data.scrollback`.
//
// Nothing here reads or rewrites the bytes: every chunk, replayed or live, goes to `term.write` as it came, and what
// xterm answers goes to `api.write` as it is.
import { Terminal } from './vendor/xterm.mjs';
import { FitAddon } from './vendor/addon-fit.mjs';

/**
 * What the shell gives the pane for one session.
 * @typedef {object} SessionPaneApi
 * @property {(id: string, data: string) => unknown} write keystrokes, and xterm's own answers to the session's queries
 * @property {(id: string, cols: number, rows: number) => unknown} resize
 * @property {(id: string, onChunk: (bytes: ArrayLike<number>) => void) => unknown} subscribe replays the session's
 *   buffered output into `onChunk`, then streams what it prints; as many bytes of replay as `scrollback` returns
 * @property {(id: string, onExit: (code: number | null) => void) => unknown} [onExit] says when the process has ended
 * @property {(id: string) => Promise<ArrayBuffer | ArrayLike<number>>} scrollback the buffered output, read-only
 */

/**
 * Box-drawing and the symbols the cockpit's own output uses (`⎿`, `☐`), which bare `monospace` falls back from to a
 * face where they look like letters.
 */
const FONT = [
  '"JetBrains Mono"',
  '"DejaVu Sans Mono"',
  '"Cascadia Mono"',
  '"Noto Sans Mono"',
  '"Symbols Nerd Font Mono"',
  '"Noto Sans Symbols 2"',
  '"Segoe UI Symbol"',
  'Menlo',
  'Consolas',
  '"Liberation Mono"',
  'monospace',
].join(', ');

/**
 * @typedef {object} Pane
 * @property {string} id
 * @property {HTMLElement} element
 * @property {Terminal} term
 * @property {FitAddon} fit
 * @property {SessionPaneApi | null} api the api of the mount that is live, null once it is disposed
 * @property {number} remaining bytes of the subscribed stream still to come before it is live
 * @property {boolean} primed whether xterm has parsed the whole replay: only then does its output go to the session
 * @property {[number, number] | null} sized the last size sent to the session
 * @property {Promise<void> | null} started
 * @property {(() => void) | null} detach
 */

/** Panes by session id, for the window's lifetime: a session's terminal is made once. @type {Map<string, Pane>} */
const panes = new Map();

/** @param {unknown} err */
const reason = (err) => (err instanceof Error ? err.message : String(err));

/**
 * Calls the api without letting its failure out, whether it throws or returns a promise that rejects.
 * @param {string} what @param {() => unknown} call
 */
function attempt(what, call) {
  try {
    const result = call();
    if (result instanceof Promise) result.catch((err) => console.error(`session pane: ${what}: ${reason(err)}`));
  } catch (err) {
    console.error(`session pane: ${what}: ${reason(err)}`);
  }
}

/**
 * Writes to the terminal, which refuses once it is disposed.
 * @param {Pane} pane @param {string | Uint8Array} data @param {() => void} [done]
 */
function put(pane, data, done) {
  try {
    pane.term.write(data, done);
  } catch (err) {
    console.error(`session pane: write: ${reason(err)}`);
  }
}

/** A line of the pane's own, in the terminal. @param {Pane} pane @param {string} message */
const say = (pane, message) => put(pane, `\r\n\x1b[2m[${message}]\x1b[0m\r\n`);

/**
 * One chunk of the subscribed stream. The first `remaining` bytes are the replay of what `scrollback` returned; the
 * write that ends it is the one whose callback says xterm has parsed it, and so has made all the answers it will make
 * to the old queries. A chunk that holds the end of the replay and the start of live output is written in two, which
 * xterm joins without a seam (it holds a split multi-byte character across writes itself).
 * @param {Pane} pane @param {ArrayLike<number>} chunk
 */
function take(pane, chunk) {
  let data = new Uint8Array(chunk);
  if (data.length && pane.remaining > 0) {
    const replay = data.subarray(0, pane.remaining);
    pane.remaining -= replay.length;
    data = data.subarray(replay.length);
    put(pane, replay, pane.remaining === 0 ? () => (pane.primed = true) : undefined);
  }
  if (data.length) put(pane, data);
}

/**
 * Reads the scrollback for its length, then subscribes once; everything else follows from the stream.
 * @param {Pane} pane @param {SessionPaneApi} api
 */
async function start(pane, api) {
  let length;
  try {
    const buffered = await api.scrollback(pane.id);
    length = 'byteLength' in buffered ? buffered.byteLength : buffered.length;
  } catch (err) {
    // Without the length there is no telling where the replay ends, so the pane stays read-only rather than guess.
    say(pane, `the session's output couldn't be read: ${reason(err)}`);
    return;
  }
  pane.remaining = length;
  pane.primed = length === 0;
  try {
    await api.subscribe(pane.id, (chunk) => take(pane, chunk));
  } catch (err) {
    say(pane, `the session's output couldn't be followed: ${reason(err)}`);
  }
}

/** @param {string} id @param {SessionPaneApi} api @returns {Pane} */
function create(id, api) {
  const host = document.getElementById('terminals');
  if (!host) throw new Error('the window has no #terminals to hold a session pane');
  const element = document.createElement('div');
  element.className = 'session-pane';
  element.dataset.sessionId = id;
  host.append(element);

  const term = new Terminal({ fontFamily: FONT, fontSize: 14, cursorBlink: true, scrollback: 10000 });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(element);

  /** @type {Pane} */
  const pane = {
    id,
    element,
    term,
    fit,
    api: null,
    remaining: 0,
    primed: false,
    sized: null,
    started: null,
    detach: null,
  };
  panes.set(id, pane);
  pane.started = start(pane, api);
  attempt('exit', () =>
    api.onExit?.(id, (code) => say(pane, code === null ? 'the session ended' : `the session ended with code ${code}`)),
  );
  return pane;
}

/** Tells the session the terminal's size, once per size. @param {Pane} pane */
function send(pane) {
  const { api, term } = pane;
  if (!api || (pane.sized && pane.sized[0] === term.cols && pane.sized[1] === term.rows)) return;
  pane.sized = [term.cols, term.rows];
  attempt('resize', () => api.resize(pane.id, term.cols, term.rows));
}

/**
 * Fits the terminal to its host, unless the host has no size (hidden), which would fit it to a sliver.
 * @param {Pane} pane
 */
function refit(pane) {
  const { width, height } = pane.element.getBoundingClientRect();
  if (!width || !height) return;
  try {
    pane.fit.fit();
  } catch (err) {
    console.error(`session pane: fit: ${reason(err)}`);
  }
  send(pane);
}

/** @param {Pane} pane @param {SessionPaneApi} api @returns {() => void} what lets go of this mount's listeners */
function attach(pane, api) {
  pane.detach?.();
  pane.api = api;
  const input = pane.term.onData((data) => {
    if (pane.primed) attempt('input', () => api.write(pane.id, data));
  });
  const size = pane.term.onResize(() => send(pane));
  const observer = new ResizeObserver(() => refit(pane));
  observer.observe(pane.element);
  const detach = () => {
    input.dispose();
    size.dispose();
    observer.disconnect();
    pane.api = null;
    pane.detach = null;
  };
  pane.detach = detach;
  refit(pane);
  return detach;
}

/**
 * Mounts the terminal of one session, or finds it again: the id keeps its element and what it has drawn, and a second
 * mount only reattaches the keyboard and the size. The stream is subscribed once, for the pane's life.
 * @param {string} sessionId @param {SessionPaneApi} api
 * @returns {{ element: HTMLElement, dispose: () => void }} `dispose` lets go of the listeners and never removes the
 *   element: the session is still running behind it, and the shell shows and hides it.
 */
export function mountSessionPane(sessionId, api) {
  const pane = panes.get(sessionId) ?? create(sessionId, api);
  const detach = attach(pane, api);
  return { element: pane.element, dispose: () => pane.detach === detach && detach() };
}
