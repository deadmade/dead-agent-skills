import { AGENT_BROWSER_FILES } from '../installer/core/binaries.ts';
import { UV_FILES } from '../installer/core/binaries.ts';
import { syncPin } from './sync-lib.mjs';
if (process.argv[2] === 'agent-browser') {
  // Pin installer/assets/agent-browser.json to vercel-labs/agent-browser's newest release, with its Windows and Linux
  // binaries' sha256 from the release's asset digests. Needs `gh` and a Node that strips types (it imports the installer).

  syncPin({
    repo: 'vercel-labs/agent-browser',
    files: AGENT_BROWSER_FILES,
    out: 'installer/assets/agent-browser.json',
    tagPattern: /^v(\d+\.\d+\.\d+)$/,
  });
}

if (process.argv[2] === 'uv') {
  // Pin installer/assets/uv.json to astral-sh/uv's newest release, with its Windows and Linux archives' sha256 from the
  // release's asset digests. Needs `gh` and a Node that strips types (it imports the installer).

  syncPin({
    repo: 'astral-sh/uv',
    files: Object.fromEntries(Object.entries(UV_FILES).map(([key, { file }]) => [key, file])),
    out: 'installer/assets/uv.json',
    tagPattern: /^(\d+\.\d+\.\d+)$/,
  });
}
