// web-mcp, ado-mcp and the flow cockpit, the binaries of their plugins: one on PATH is used as is; otherwise the
// release for this version goes to ~/.claude/bin (the flow cockpit to a folder of its own there, its default extensions
// beside it) and the plugin's userConfig key points at it. Linux gets the flow cockpit from the flake instead.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BIN_PLUGINS, binAction, binAdvice, binAsset, binPath } from '../core/binaries.ts';
import { MARKETPLACE } from '../core/release.ts';
import { CONFIG, VERSION, done, failures } from '../context.ts';
import { downloadBin } from '../system/net.ts';
import { claude, onPath } from '../system/proc.ts';
import { progress } from '../ui/ui.ts';

export const WEB_MCP = `web-mcp@${MARKETPLACE}`;
export const MCP_AZURE = `mcp-azure@${MARKETPLACE}`;
export const FLOW_COCKPIT = `flow-cockpit@${MARKETPLACE}`;
export const BIN_DIR = join(CONFIG, 'bin');

// The version a binary reports (`<name> <version>`), or undefined when there is none or it does not run.
function binVersionAt(name: string, path: string) {
  if (!existsSync(path)) return undefined;
  const r = spawnSync(path, ['--version'], { encoding: 'utf8' });
  return new RegExp(`^${name} (\\S+)`).exec(r.stdout ?? '')?.[1];
}

// platform, arch: this machine's, passed in by tests.
export async function applyBin(
  pluginName: string,
  plugin: string,
  platform = process.platform,
  arch = process.arch,
  extra: Record<string, string> = {},
) {
  const { name, key, linuxHint, folder } = BIN_PLUGINS[pluginName];
  const version = VERSION;
  if (platform === 'linux' && linuxHint) return done.push(`${name}: ${linuxHint(version)}`);
  const asset = binAsset(name, platform, arch, version);
  const bin = binPath(BIN_DIR, pluginName, platform);
  const action = binAction({
    onPath: onPath(name),
    installed: binVersionAt(name, bin),
    version,
    supported: asset !== undefined,
  });
  if (action === 'skip') done.push(`${name}: using the one on PATH`);
  let ours = action === 'configure';
  if (action === 'unsupported')
    failures.push(`${name}: no release build for ${platform}-${arch}${folder ? '' : `; ${binAdvice(pluginName)}`}`);
  if (action === 'download') {
    const r = await progress(`Downloading ${name} ${version}`, async () => {
      await downloadBin(name, asset!, bin);
      return { ok: true };
    });
    ours = r.ok;
    if (!r.ok) failures.push(`${name} ${version}: ${r.err}; ${binAdvice(pluginName)}`);
    else done.push(`installed ${name} ${version} to ${bin}`);
  }
  const values = ours ? { ...extra, [key]: bin } : extra;
  if (!Object.keys(values).length) return;
  const r = await claude(JSON.stringify(values), 'plugin', 'configure', plugin, '--values-stdin');
  if (r.ok) {
    if (values[key]) done.push(`${pluginName}: ${key} is ${bin}`);
    if (Object.keys(extra).length) done.push(`${pluginName}: saved ${Object.keys(extra).join(', ')}`);
  } else if (Object.keys(extra).length)
    failures.push(`${pluginName}: could not save its settings; run /plugin configure ${plugin} in Claude Code`);
  else
    failures.push(
      `${pluginName}: could not set ${key} (${r.err}); set it to ${bin} with /plugin configure ${pluginName}`,
    );
}
