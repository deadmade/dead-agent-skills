#!/usr/bin/env node
// Throwaway stdio client for the live check: starts the built web-mcp, makes ONE `rows` call and prints the reply.
// Usage: node live-client.mjs <url> [--group N] [--item SELECTOR] [--limit N] [--bin PATH] [--cwd DIR]
// One call is one page load; run it by hand, never in a loop. The page is archived under <cwd>/.web/ (default: cwd).
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const url = argv.shift();
const opt = {};
while (argv.length) {
  const flag = argv.shift();
  opt[flag.replace(/^--/, '')] = argv.shift();
}
if (!url) {
  console.error('usage: node live-client.mjs <url> [--group N] [--item SELECTOR] [--limit N] [--bin PATH] [--cwd DIR]');
  process.exit(2);
}
const bin = resolve(opt.bin ?? new URL('../../../target/debug/web-mcp', import.meta.url).pathname);
const args = { url };
if (opt.group) args.group = Number(opt.group);
if (opt.item) args.item = opt.item;
if (opt.limit) args.limit = Number(opt.limit);

// web-mcp finds agent-browser through WEB_MCP_AGENT_BROWSER (default: PATH); the plugin installs it here.
const env = { ...process.env };
env.WEB_MCP_AGENT_BROWSER ??= `${process.env.HOME}/.claude/bin/agent-browser`;
const child = spawn(bin, [], { cwd: opt.cwd ?? process.cwd(), env, stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let buf = '';
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) pending.get(msg.id)(msg);
  }
});
const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');
const call = (id, method, params) =>
  new Promise((ok) => {
    pending.set(id, ok);
    send({ jsonrpc: '2.0', id, method, params });
  });

const timer = setTimeout(() => {
  console.error('timed out after 150 s');
  child.kill();
  process.exit(1);
}, 150_000);

await call(1, 'initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'live-client', version: '0' },
});
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
const reply = await call(2, 'tools/call', { name: 'rows', arguments: args });
clearTimeout(timer);
if (reply.error) {
  console.log('PROTOCOL ERROR', JSON.stringify(reply.error));
} else {
  const text = reply.result.content.map((c) => c.text ?? '').join('\n');
  console.log(reply.result.isError ? 'TOOL ERROR\n' + text : text);
  console.error(`[reply: ${text.length} characters]`);
}
// Closing stdin lets web-mcp close its own tab and window; kill only if it has not exited after 20 s.
const exited = new Promise((ok) => child.on('exit', ok));
child.stdin.end();
const late = setTimeout(() => child.kill(), 20_000);
await exited;
clearTimeout(late);
