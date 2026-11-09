// headroom-trim's trim server is a uv project. Our copy of uv in ~/.claude/bin (where the plugin's launcher looks first) is
// kept at the version pinned in tools/installer/assets/tools.json. Then the server's environment and tiktoken's
// vocabulary are built into the plugin's data folder, so the first session starts at once. Asks before a download; every
// failure is a summary line.
import { join } from 'node:path';
import {
  pluginDataDir,
  pluginInstallPath,
  trimServerCommands,
  trimServerEnv,
  trimServerPort,
} from '../core/plugins.ts';
import { MARKETPLACE } from '../core/release.ts';
import { CONFIG, done, failures, tryJson } from '../context.ts';
import { TOOLS, pypiSpec } from '../core/tools.ts';
import { stopLocalServer } from '../system/net.ts';
import { errCode, startSync } from '../system/proc.ts';
import { log } from '../ui/ui.ts';
import { ensureTool } from './tools.ts';

export const HEADROOM_TRIM = `headroom-trim@${MARKETPLACE}`;
const OFF = 'headroom-trim and graphify stay as they are until uv is installed';

// The uv path in use, or undefined (a summary line says why).
export const installUv = async () => (await ensureTool('uv', { off: OFF }))?.path;

// Asks a running trim server to exit (port from the installed copy's hooks.json); a summary line when it stays up.
export async function stopTrimServer(installed: any, then: string): Promise<void> {
  const port = trimServerPort(installed, HEADROOM_TRIM, tryJson);
  if (port !== undefined && !(await stopLocalServer(port)))
    failures.push(`headroom-trim: the trim server on port ${port} did not stop; ${then}`);
}

// Builds the trim server's environment (uv sync) and fetches tiktoken's vocabulary. A running server is stopped first,
// so the sync can replace its files.
export async function prepareTrimServer(uv: string): Promise<void> {
  const installed = tryJson(join(CONFIG, 'plugins', 'installed_plugins.json'));
  const root = pluginInstallPath(installed, HEADROOM_TRIM);
  if (!root) {
    failures.push(
      "headroom-trim: Claude Code lists no install of it; the first session will build the server's environment",
    );
    return;
  }
  const data = pluginDataDir(CONFIG, HEADROOM_TRIM);
  const cmd = trimServerCommands(root, data);
  const env = trimServerEnv(process.env, cmd.env);
  await stopTrimServer(installed, 'the sync may fail while it runs');
  // stdio 'inherit' is how dcg and agent-browser show their long commands too.
  log('info', 'Building the headroom-trim server environment (uv sync)');
  const sync = startSync(uv, cmd.sync, { env, stdio: 'inherit' });
  if (sync.status !== 0) {
    failures.push(
      `headroom-trim: uv sync failed (${errCode(sync.error) ?? `exit ${sync.status}`}); the first session will retry it`,
    );
    return;
  }
  done.push('headroom-trim: server environment built');
  const fetched = startSync(uv, cmd.tiktoken, { env, stdio: 'inherit' });
  if (fetched.status !== 0)
    failures.push(
      `headroom-trim: token counts are estimated until the installer fetches tiktoken's vocabulary (${errCode(fetched.error) ?? `exit ${fetched.status}`})`,
    );
}

// graphify's CLI, with its optional parsers, as a uv tool run by the installer's uv. Always upgraded, so a rerun picks up
// a new graphifyy; a failure is a summary line.
export function installGraphify(uv: string): void {
  log('info', 'Installing graphify (uv tool install)');
  const r = startSync(uv, ['tool', 'install', '--upgrade', pypiSpec('graphify')], { stdio: 'inherit' });
  if (r.status !== 0) {
    failures.push(
      `graphify: uv tool install failed (${errCode(r.error) ?? `exit ${r.status}`}); run it yourself: uv tool install "${pypiSpec('graphify')}"`,
    );
    return;
  }
  done.push(
    `graphify: installed with the ${(TOOLS.tools.graphify as { extras: string }).extras.replaceAll(',', ', ')} extras`,
  );
}
