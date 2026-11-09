// web-mcp and ado-mcp, the binaries of their plugins: our copy goes to ~/.claude/bin (see steps/tools.ts) and the plugin's
// userConfig key points at it.
import { toolOfPlugin } from '../core/tools.ts';
import { MARKETPLACE } from '../core/release.ts';
import { done, failures } from '../context.ts';
import { claude } from '../system/proc.ts';
import { ensureTool } from './tools.ts';

export const WEB_MCP = `web-mcp@${MARKETPLACE}`;
export const MCP_AZURE = `mcp-azure@${MARKETPLACE}`;

// platform, arch: this machine's, passed in by tests.
export async function applyBin(
  pluginName: string,
  plugin: string,
  platform = process.platform,
  arch = process.arch,
  extra: Record<string, string> = {},
) {
  const [name, { key }] = toolOfPlugin(pluginName);
  const path = (await ensureTool(name, { platform, arch }))?.path;
  const values = path ? { ...extra, [key]: path } : extra;
  if (!Object.keys(values).length) return;
  const r = await claude(JSON.stringify(values), 'plugin', 'configure', plugin, '--values-stdin');
  if (r.ok) {
    if (path) done.push(`${pluginName}: ${key} is ${path}`);
    if (Object.keys(extra).length) done.push(`${pluginName}: saved ${Object.keys(extra).join(', ')}`);
  } else if (Object.keys(extra).length)
    failures.push(`${pluginName}: could not save its settings; run /plugin configure ${plugin} in Claude Code`);
  else
    failures.push(
      `${pluginName}: could not set ${key} (${r.err}); set it to ${path} with /plugin configure ${pluginName}`,
    );
}
