import { CODEX_MARKETPLACE } from './agents.ts';
import { portableSelection, type PluginDefinition } from './catalog.ts';

export interface CodexState {
  version: string;
  selected: string[];
  mcp: string[];
}
export const MCP_COMPONENTS = [
  'dead-skills',
  'web-mcp',
  'mcp-github',
  'mcp-azure',
  'http-runner',
  'atlassian',
  'serena',
];
// Plugins of ours that left the catalog; a rerun removes them. Anything else not in the catalog is foreign and stays.
const RETIRED = ['graphify'];
export const mcpName = (component: string) => `dead-agent-skills-${component}`;

// Recover a default Context7 entry when an earlier setup lost its ownership receipt.
// Customized connections still require explicit ownership before we can replace them.
export function recoverableContext7(server: any, url: string): boolean {
  const transport = server?.transport;
  return (
    server?.name === mcpName('dead-skills') &&
    server.enabled === true &&
    server.disabled_reason == null &&
    server.startup_timeout_sec == null &&
    server.tool_timeout_sec == null &&
    transport?.type === 'streamable_http' &&
    transport.url === url &&
    Object.entries(transport).every(([key, value]) => ['type', 'url'].includes(key) || value == null)
  );
}

// Never infer that discovery failed means nothing is installed.
export function installedCodex(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as any).installed))
    throw new Error('Unrecognized codex plugin list JSON; update Codex before installing');
  return (value as any).installed.flatMap((p: any) => {
    const id =
      p.id ?? p.pluginId ?? (p.name && `${p.name}@${p.marketplaceName ?? p.marketplace_name ?? p.marketplace}`);
    return typeof id === 'string' && id.endsWith(`@${CODEX_MARKETPLACE}`) ? [id.split('@')[0]] : [];
  });
}

export function codexPlan(
  definitions: PluginDefinition[],
  selected: string[],
  installed: string[],
  version: string,
  previous?: CodexState,
) {
  const wanted = portableSelection(definitions, selected);
  const ours = installed.filter((n) => definitions.some((p) => p.name === n));
  const retired = installed.filter((n) => RETIRED.includes(n));
  return {
    wanted,
    install: wanted.filter((n) => !ours.includes(n) || previous?.version !== version),
    remove: [...ours.filter((n) => !wanted.includes(n)), ...retired],
    retired,
  };
}

export function managedRules(raw: string, rules: string): string {
  const start = '<!-- dead-agent-skills:start -->';
  const end = '<!-- dead-agent-skills:end -->';
  const a = raw.indexOf(start),
    b = raw.indexOf(end);
  if (a < 0 !== b < 0 || (a >= 0 && (b < a || raw.indexOf(start, a + 1) >= 0 || raw.indexOf(end, b + 1) >= 0)))
    throw new Error('Malformed dead-agent-skills instructions block; left unchanged');
  const block = `${start}\n${rules.trim()}\n${end}`;
  return a < 0
    ? `${raw}${raw && !raw.endsWith('\n') ? '\n' : ''}\n${block}\n`
    : raw.slice(0, a) + block + raw.slice(b + end.length);
}

// The lines of native MCP table `name`: all lines, the header index and the table's own lines.
function mcpTable(raw: string, name: string) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Unsafe MCP name');
  const headers = [`[mcp_servers.${name}]`, `[mcp_servers."${name}"]`];
  const lines = raw.split('\n');
  const index = lines.findIndex((line) => headers.includes(line.trim()));
  if (index < 0) throw new Error(`Cannot locate native MCP table ${name}; left unchanged`);
  const end = lines.findIndex((line, i) => i > index && /^\s*\[/.test(line));
  return { lines, index, section: lines.slice(index + 1, end < 0 ? undefined : end) };
}

// Inserts `line` (`key = value`) into the table the native CLI just created; a key already set there wins.
export function mcpTableLine(raw: string, name: string, line: string): string {
  const { lines, index, section } = mcpTable(raw, name);
  const key = line.split('=')[0].trim();
  if (section.some((l) => new RegExp(`^\\s*${key}\\s*=`).test(l))) return raw;
  lines.splice(index + 1, 0, line);
  return lines.join('\n');
}

// The native CLI does not expose env_vars. Insert only this allowlist into the table it just created.
export function mcpEnvironment(raw: string, name: string, variables: string[]): string {
  const { section } = mcpTable(raw, name);
  const value = `env_vars = ${JSON.stringify(variables)}`;
  if (section.some((line) => /^\s*env_vars\s*=/.test(line)) && !section.some((line) => line.trim() === value))
    throw new Error(`Unexpected env_vars in ${name}; left unchanged`);
  return mcpTableLine(raw, name, value);
}
