// The one routine that puts a tool's copy in ~/.claude/bin: ours runs, downloaded when it is missing or older than the pin
// and kept when it is equal or newer. A copy elsewhere is never looked at.
import { BIN_DIR, VERSION, ask, done, failures } from '../context.ts';
import { TOOLS, planTool, resolveTool, toolAdvice, toolPath } from '../core/tools.ts';
import { downloadBin } from '../system/net.ts';
import { versionOf } from '../system/proc.ts';
import { progress } from '../ui/ui.ts';

// Everything but `off` is a seam for tests. off: what stays undone when the tool is missing, ending its failure lines.
export type ToolIo = {
  ask?: (q: string, initial: boolean) => Promise<boolean>;
  download?: typeof downloadBin;
  version?: (bin: string) => string | undefined;
  binDir?: string;
  platform?: string;
  arch?: string;
  off?: string;
};

// The path of our copy of `name` once it is current, or undefined with the failure line already in `failures`.
// changed: it was downloaded just now. Only a github tool asks first; a release tool is ours.
export async function ensureTool(
  name: string,
  io: ToolIo = {},
): Promise<{ path: string; changed: boolean } | undefined> {
  const { platform = process.platform, arch = process.arch } = io;
  const tool = TOOLS.tools[name];
  const github = tool.source === 'github';
  const pin = github ? tool.version : VERSION;
  const bin = toolPath(io.binDir ?? BIN_DIR, name, platform);
  const asset = resolveTool(name, platform, arch, VERSION);
  const installed = (io.version ?? versionOf)(bin);
  const fail = (line: string) => {
    failures.push([line, tool.source === 'release' && toolAdvice(name), io.off].filter(Boolean).join('; '));
    return undefined;
  };

  const plan = planTool({ installed, pinned: pin, supported: asset !== undefined });
  if (plan === 'keep') return { path: bin, changed: false };
  if (plan === 'unsupported' || !asset)
    return fail(
      github
        ? `${name}: no pinned build for ${platform}-${arch} in tools/installer/assets/tools.json`
        : `${name}: no release build for ${platform}-${arch}`,
    );
  if (github && !(await (io.ask ?? ask)(`Download ${name} ${pin} (upstream's release binary) to ${bin}?`, true)))
    return fail(`${name}: install skipped by you`);
  const r = await progress(`Downloading ${name} ${pin}`, async () => {
    await (io.download ?? downloadBin)(name, asset, bin);
    return { ok: true };
  });
  if (!r.ok) return fail(`${name} ${pin}: ${r.err}`);
  done.push(`${name}: ${installed ? 'upgraded to' : 'installed'} ${pin} at ${bin}`);
  return { path: bin, changed: true };
}
