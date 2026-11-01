import { main } from './lib.mjs';
import { decode } from './runtime/claude-code.mjs';

try {
  let stdin = '';
  for await (const chunk of process.stdin) stdin += chunk;
  const raw = JSON.parse(stdin);
  for (const event of ['turn.finished', 'permission.requested', 'question.asked', 'notification.received']) {
    const input = decode(event, raw, process.env);
    if (input) { await main({ input, env: process.env, platform: process.platform }); break; }
  }
} catch (error) {
  console.error(`hook: ${error.message}`);
  process.exitCode = 1;
}
