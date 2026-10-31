// Boots the window: hands the view runtime the app's commands and its events, and draws the route the window's address
// names (kept across a reload), else the list. `withGlobalTauri` is off, so there is no `window.__TAURI__`; the
// runtime gets these two functions and a view only ever gets what the runtime builds from them (`data`, `ctx`).
import { invoke } from './vendor/core.js';
import { listen } from './vendor/event.js';
import { createRuntime } from './runtime.js';

const root = document.getElementById('app');
if (!root) throw new Error('index.html has no #app');
createRuntime({ root, invoke, listen }).start();
