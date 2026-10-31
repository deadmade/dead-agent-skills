// The terminal pane, in jsdom with the real xterm.js. Runs in flow-cockpit.yml after `npm ci`, not in `npm test`:
//   node --test crates/flow-cockpit/app/shell/session-pane.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><main id="app"></main><div id="terminals"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;
window.matchMedia ??= () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});
// jsdom lays nothing out: every element measures 10 by 20 px, which is what gives xterm a cell size to fit by.
// xterm measures a cell from 32 characters' offsetWidth and the offsetHeight.
Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get: () => 320, configurable: true });
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get: () => 20, configurable: true });
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { x: 0, y: 0, top: 0, left: 0, right: 10, bottom: 20, width: 10, height: 20, toJSON() {} };
};
/** The observers the pane made, so a test can say its host resized. */
const observers = [];
window.ResizeObserver = class {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    this.live = true;
    observers.push(this);
  }
  observe(target) {
    this.targets.add(target);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.live = false;
    this.targets.clear();
  }
};
globalThis.window = window;
globalThis.document = window.document;
globalThis.ResizeObserver = window.ResizeObserver;
// Node's own `navigator` is a getter-only global.
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });

const { mountSessionPane } = await import('./session-pane.js');

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const bytes = (text) => [...new TextEncoder().encode(text)];
/** What the pane has drawn, from xterm's own DOM renderer. */
const screen = (pane) => pane.element.querySelector('.xterm-rows')?.textContent ?? '';

/**
 * A fake `api` over one session. `scrollbackText` is what the ring buffer holds; `subscribe` replays it and then
 * turns live, like `subscribe_session`. `emit` is the live output; `sent`, `sizes` and `subscribed` record the calls.
 */
function fakeApi(scrollbackText = '') {
  const replay = new Uint8Array(bytes(scrollbackText));
  const sent = [];
  const sizes = [];
  const subscribed = [];
  let chunk = () => {};
  const api = {
    write: (id, data) => sent.push([id, data]),
    resize: (id, cols, rows) => sizes.push([id, cols, rows]),
    subscribe: async (id, onChunk) => {
      subscribed.push(id);
      chunk = onChunk;
      if (replay.length) onChunk([...replay]);
    },
    onExit: () => () => {},
    scrollback: async () => replay.buffer.slice(0),
  };
  return { api, sent, sizes, subscribed, emit: (text) => chunk(bytes(text)), emitBytes: (b) => chunk(b) };
}

let ids = 0;
const freshId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

/** Gives the pane a size the fit addon can measure: xterm reads its parent's computed width and height. */
function size(pane, width, height) {
  pane.element.style.width = `${width}px`;
  pane.element.style.height = `${height}px`;
}
const resized = () => observers.at(-1).callback([], observers.at(-1));

test('fit_triggers_resize', async () => {
  const { api, sizes } = fakeApi();
  const id = freshId();
  const pane = mountSessionPane(id, api);
  await settle();
  size(pane, 800, 400);
  const before = sizes.length;
  resized();
  await settle();
  assert.ok(sizes.length > before, 'a container resize reaches api.resize');
  assert.deepEqual(sizes.at(-1).slice(0, 1), [id]);
  const [cols, rows] = sizes.at(-1).slice(1);
  assert.ok(cols >= 70 && cols <= 80 && rows === 20, `fits to the new size, got ${cols}x${rows}`);

  size(pane, 400, 200);
  resized();
  await settle();
  const [narrow, short] = sizes.at(-1).slice(1);
  assert.ok(narrow < cols && short < rows, `and again to a smaller one, got ${narrow}x${short}`);
});

test('scrollback_primes_the_terminal_before_live_output', async () => {
  const { api, subscribed, emit } = fakeApi('old one\r\nold two\r\n');
  const order = [];
  const scrollback = api.scrollback;
  api.scrollback = async (id) => {
    order.push('scrollback');
    return scrollback(id);
  };
  const subscribe = api.subscribe;
  api.subscribe = (id, onChunk) => {
    order.push('subscribe');
    return subscribe(id, onChunk);
  };
  const pane = mountSessionPane(freshId(), api);
  await settle();
  emit('live three');
  await settle();

  assert.deepEqual(order, ['scrollback', 'subscribe'], 'scrollback is read first and the stream subscribed once');
  assert.equal(subscribed.length, 1);
  const text = screen(pane);
  assert.ok(text.includes('old one') && text.includes('old two') && text.includes('live three'), text);
  assert.ok(text.indexOf('old two') < text.indexOf('live three'), 'replay first, then live');
});

test('priming_does_not_send_terminal_replies', async () => {
  // What claude sends at start: DA1 and a focus-state query. Replaying them into a fresh Terminal makes it answer.
  const startup = 'hello\x1b[c\x1b[?1004h\x1b[>4;2m\x1b[?u world\r\n';
  const { api, sent, emit } = fakeApi(startup);
  const pane = mountSessionPane(freshId(), api);
  await settle();
  assert.deepEqual(sent, [], 'nothing the replay made xterm answer reaches the PTY');
  assert.ok(screen(pane).includes('hello'));

  // Past the replay, the same query is live and its answer is wanted: claude asked.
  emit('\x1b[c');
  await settle();
  assert.equal(sent.length, 1, 'a live query is answered');
  assert.match(sent[0][1], /^\x1b\[\?\d/);

  // Typing is forwarded as it is.
  const keys = pane.element.querySelector('textarea');
  keys.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, bubbles: true }));
  keys.dispatchEvent(new window.KeyboardEvent('keypress', { key: 'a', keyCode: 97, charCode: 97, bubbles: true }));
  await settle();
  assert.equal(sent.at(-1)[1], 'a');
});

test('priming_ends_at_the_scrollback_byte_count_even_inside_one_chunk', async () => {
  const startup = 'x\x1b[c';
  const replay = new Uint8Array(bytes(startup));
  const { api, sent } = fakeApi(startup);
  // A stream whose first chunk carries the replay and the first live query together.
  api.subscribe = async (_id, onChunk) => onChunk([...replay, ...bytes('\x1b[c')]);
  mountSessionPane(freshId(), api);
  await settle();
  assert.equal(sent.length, 1, 'only the query past the replay is answered');
});

test('remounting_the_same_session_id_reuses_its_element', async () => {
  const { api, subscribed, emit } = fakeApi('kept line\r\n');
  const id = freshId();
  const first = mountSessionPane(id, api);
  await settle();
  emit('live line');
  await settle();
  first.dispose();
  assert.ok(first.element.isConnected, 'dispose never removes the element');

  const second = mountSessionPane(id, api);
  await settle();
  assert.equal(second.element, first.element);
  assert.equal(document.querySelectorAll(`#terminals > [data-session-id="${id}"]`).length, 1, 'no second pane');
  assert.equal(subscribed.length, 1, 'the stream is subscribed once for the id');
  assert.ok(screen(second).includes('kept line') && screen(second).includes('live line'), 'the scrollback stays');
});

test('the_pane_names_a_font_with_box_drawing_and_symbol_glyphs', async () => {
  const pane = mountSessionPane(freshId(), fakeApi().api);
  await settle();
  const family = [...pane.element.querySelectorAll('style')].map((e) => e.textContent).join('');
  assert.match(family, /JetBrains Mono|DejaVu Sans Mono/);
  assert.match(family, /Symbols|Noto Sans Symbols|Segoe UI Symbol/);
  assert.notEqual(family.trim(), 'monospace');
});

test('dispose_detaches_input_and_resize_but_keeps_the_pane', async () => {
  const { api, sent, sizes } = fakeApi();
  const pane = mountSessionPane(freshId(), api);
  await settle();
  pane.dispose();
  const observer = observers.at(-1);
  assert.equal(observer.live, false, 'the resize observer is disconnected');
  size(pane, 800, 400);
  const before = sizes.length;
  await settle();
  assert.equal(sizes.length, before);
  assert.deepEqual(sent, []);
  assert.ok(pane.element.isConnected);
});

test('a_hidden_pane_is_not_fitted_to_a_sliver', async () => {
  const { api, sizes } = fakeApi();
  const pane = mountSessionPane(freshId(), api);
  await settle();
  const before = sizes.length;
  pane.element.getBoundingClientRect = () => ({ width: 0, height: 0 });
  size(pane, 0, 0);
  resized();
  await settle();
  assert.equal(sizes.length, before, 'no resize while the host has no size');
});

test('a_failing_write_or_resize_does_not_throw', async () => {
  const { api, emit } = fakeApi();
  api.write = () => {
    throw new Error('pty gone');
  };
  api.resize = async () => {
    throw new Error('pty gone');
  };
  const pane = mountSessionPane(freshId(), api);
  await settle();
  size(pane, 800, 400);
  resized();
  emit('\x1b[c');
  await settle();
  assert.ok(pane.element.isConnected);
});
