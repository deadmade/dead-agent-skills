// headroom-trim's trim server is a uv project. Our copy in ~/.claude/bin (where the plugin's launcher looks first) is kept
// at the version pinned in tools/installer/assets/uv.json; with none there, a PATH uv at or above the pin is used. Then the
// server's environment and tiktoken's vocabulary are built into the plugin's data folder, so the first session starts
// at once. Asks before a download; every failure is a summary line.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPHIFY_EXTRAS, GRAPHIFY_SPEC, type UpstreamPin, graphifyToolArgs, uvAsset, uvPlan } from '../core/binaries.ts';
import {
  pluginDataDir,
  pluginInstallPath,
  trimServerCommands,
  trimServerEnv,
  trimServerPort,
} from '../core/plugins.ts';
import { MARKETPLACE } from '../core/release.ts';
import { ASSETS, CONFIG, WIN, ask, done, failures, readJson, tryJson } from '../context.ts';
import { downloadBin, stopLocalServer } from '../system/net.ts';
import { errCode, startSync, versionOf, which } from '../system/proc.ts';
import { log, progress } from '../ui/ui.ts';
import { BIN_DIR } from './binaries.ts';

export const HEADROOM_TRIM = `headroom-trim@${MARKETPLACE}`;
const OFF = 'headroom-trim and graphify stay as they are until uv is installed';

// The uv path in use, or undefined (a summary line says why).
export async function installUv(): Promise<string | undefined> {
  const pin: UpstreamPin = readJson(join(ASSETS, 'uv.json'));
  const pinned = pin.upstream ?? '';
  const key = `${process.platform}-${process.arch}`;
  const asset = uvAsset(process.platform, process.arch, pin);
  if (!asset) {
    failures.push(`uv: no pinned build for ${key} in tools/installer/assets/uv.json; ${OFF}`);
    return undefined;
  }
  const bin = join(BIN_DIR, WIN ? 'uv.exe' : 'uv');
  const theirs = which('uv');
  const plan = uvPlan({
    oursExists: existsSync(bin),
    ours: versionOf(bin),
    theirs: theirs && versionOf(theirs),
    pinned,
  });
  if (plan.use === 'path') {
    done.push(`uv: using the one on PATH (${theirs})`);
    return theirs;
  }
  if (plan.download === 'skip') return bin;
  const what = plan.download === 'install' ? 'Download' : 'Upgrade';
  if (!(await ask(`${what} uv ${pinned} (Astral's release binary) to ${bin} for headroom-trim and graphify?`, true))) {
    failures.push(`uv: install skipped by you; ${OFF}`);
    return undefined;
  }
  const r = await progress(`Downloading uv ${pinned}`, async () => {
    await downloadBin('uv', asset, bin);
    return { ok: true };
  });
  if (!r.ok) {
    failures.push(`uv ${pinned}: ${r.err}; ${OFF}`);
    return undefined;
  }
  done.push(`uv: ${plan.download === 'install' ? 'installed' : 'upgraded to'} ${pinned} at ${bin}`);
  return bin;
}

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
  const r = startSync(uv, graphifyToolArgs(), { stdio: 'inherit' });
  if (r.status !== 0) {
    failures.push(
      `graphify: uv tool install failed (${errCode(r.error) ?? `exit ${r.status}`}); run it yourself: uv tool install ${GRAPHIFY_SPEC}`,
    );
    return;
  }
  done.push(`graphify: installed with the ${GRAPHIFY_EXTRAS.join(', ')} extras`);
}
