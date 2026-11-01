import { AGENT_BROWSER_FILES } from '../../../../tools/installer/core/binaries.ts';
import { UV_FILES } from '../../../../tools/installer/core/binaries.ts';
import type { SyncContext, AdapterResult } from '../types.ts';
export function run(ctx: SyncContext): AdapterResult {
  const { syncPin } = ctx;
  if (ctx.argument === 'agent-browser') {
    // Pin tools/installer/assets/agent-browser.json to vercel-labs/agent-browser's newest release, with its Windows and Linux
    // binaries' sha256 from the release's asset digests. Needs `gh` and a Node that strips types (it imports the installer).

    syncPin({
      repo: 'vercel-labs/agent-browser',
      files: AGENT_BROWSER_FILES,
      out: 'tools/installer/assets/agent-browser.json',
      tagPattern: /^v(\d+\.\d+\.\d+)$/,
    });
  }

  if (ctx.argument === 'uv') {
    // Pin tools/installer/assets/uv.json to astral-sh/uv's newest release, with its Windows and Linux archives' sha256 from the
    // release's asset digests. Needs `gh` and a Node that strips types (it imports the installer).

    syncPin({
      repo: 'astral-sh/uv',
      files: Object.fromEntries(Object.entries(UV_FILES).map(([key, { file }]) => [key, file])),
      out: 'tools/installer/assets/uv.json',
      tagPattern: /^(\d+\.\d+\.\d+)$/,
    });
  }

  return ctx.result;
}
