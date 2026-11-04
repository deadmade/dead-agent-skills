// Claude Code's wording for the tokens flows' neutral text writes (spec §3).
import { readFileSync } from 'node:fs';
import type { HostTokens } from '../../flows/compose.ts';

const adapter = readFileSync(new URL('./claude-code.md', import.meta.url), 'utf8')
  .replace(/^# .*\n+/, '')
  .trimEnd();

export const TOKENS: HostTokens = {
  'ask-user': { text: 'the AskUserQuestion tool', uses: { 'claude-code': ['AskUserQuestion'] } },
  explore: { text: 'read-only Explore agents', uses: { 'claude-code': ['Explore'] } },
  'web-search': {
    text: '`web-mcp:search`, else WebSearch',
    uses: { 'web-mcp': ['search'], 'claude-code': ['WebSearch'] },
  },
  'web-fetch': { text: '`web-mcp:fetch`, else WebFetch', uses: { 'web-mcp': ['fetch'], 'claude-code': ['WebFetch'] } },
  'model:fast': { text: 'haiku' },
  'model:standard': { text: 'sonnet' },
  'model:strongest': { text: 'opus' },
  'model:other': { text: 'fable' },
  'watch-checks': { text: '`Monitor` on `gh pr checks <pr> --watch`', uses: { 'claude-code': ['Monitor'] } },
  'user-runs': { text: 'a `! <command>` line to type' },
  adapter: {
    text: adapter,
    uses: {
      'claude-code': ['code-review', 'security-review'],
      'claude-md-management@claude-plugins-official': ['claude-md-improver'],
      'claude-security@claude-plugins-official': ['claude-security'],
    },
  },
};
