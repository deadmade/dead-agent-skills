// Codex's wording for the tokens flows' neutral text writes (spec §3).
import { readFileSync } from 'node:fs';
import type { HostTokens } from '../../flows/compose.ts';

const adapter = readFileSync(new URL('./codex.md', import.meta.url), 'utf8')
  .replaceAll('\r\n', '\n')
  .replace(/^# .*\n+/, '')
  .trimEnd();
const model = { text: "the session's model" };

export const TOKENS: HostTokens = {
  'ask-user': { text: 'the host user-question tool, or ask in chat' },
  explore: { text: 'read-only subagents' },
  'web-search': { text: '`web-mcp:search`, else the host web search', uses: { 'web-mcp': ['search'] } },
  'web-fetch': { text: '`web-mcp:fetch`, else the host web fetch', uses: { 'web-mcp': ['fetch'] } },
  'model:fast': model,
  'model:standard': model,
  'model:strongest': model,
  'model:other': model,
  'watch-checks': { text: 'run `gh pr checks <pr>` every minute until none is pending' },
  'user-runs': { text: 'ask the user to run it and paste the output' },
  adapter: { text: adapter },
};
