import type { SyncContext, AdapterResult } from '../types.ts';
export function run(ctx: SyncContext): AdapterResult {
  // Bump ctx.argument's entry of tools/installer/assets/tools.json to its repo's newest release, with the sha256 of each
  // platform's file from the release's asset digests. Needs `gh`.
  ctx.syncPin({ manifest: 'tools/installer/assets/tools.json', tool: ctx.argument });
  return ctx.result;
}
