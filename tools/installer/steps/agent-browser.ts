// web-mcp's `browser` tool drives agent-browser. Our copy of upstream's release binary, pinned in
// tools/installer/assets/tools.json, goes to ~/.claude/bin (steps/tools.ts decides); its browser is then installed.
// installAgentBrowser says whether web-mcp's browser window can open, configureAgentBrowser points web-mcp's
// agentBrowserPath at the copy in use. Every failure is a summary line.
import { homedir } from 'node:os';
import { windowProblem } from '../core/binaries.ts';
import { BIN_DIR, ask, done, failures } from '../context.ts';
import { searchBrowserWorks } from '../system/browser.ts';
import { claude, errCode, startSync, which } from '../system/proc.ts';
import { log } from '../ui/ui.ts';
import { WEB_MCP } from './binaries.ts';
import { ensureTool } from './tools.ts';

export async function installAgentBrowser(binDir = BIN_DIR): Promise<{ path?: string; works: boolean }> {
  const tool = await ensureTool('agent-browser', { binDir });
  if (!tool) {
    windowWorks();
    return { works: false };
  }
  // --with-deps runs sudo, so it is offered only after a download, behind its own prompt (default no).
  const deps =
    tool.changed &&
    process.platform === 'linux' &&
    (await ask('Also install the browser system packages (agent-browser install --with-deps, runs sudo)?', false));
  return useAgentBrowser(tool.path, deps);
}

// Runs `agent-browser install` (the browser download) on the copy in use, every run, so a download that failed before
// is retried. works: web-mcp's browser window can open (windowWorks), whether or not the install succeeded (Helium on
// PATH is enough).
// path: our copy in the bin folder.
function useAgentBrowser(path: string, deps: boolean) {
  const args = deps ? ['install', '--with-deps'] : ['install'];
  log('info', `Running agent-browser ${args.join(' ')}`);
  const run = startSync(path, args, { stdio: 'inherit' });
  if (run.status !== 0)
    failures.push(
      `agent-browser: \`${path} ${args.join(' ')}\` failed (${errCode(run.error) ?? `exit ${run.status}`})`,
    );
  return { path, works: windowWorks() };
}

// Warns when web-mcp's one browser window can't open; returns whether it can.
function windowWorks() {
  const browserRuns = searchBrowserWorks(homedir(), process.platform);
  const problem = windowProblem({
    browserRuns,
    platform: process.platform,
    display: !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY),
    xvfb: !!which('Xvfb'),
  });
  if (problem) log('warn', problem);
  return browserRuns && !problem;
}

// Points web-mcp's agentBrowserPath at the agent-browser in use.
export async function configureAgentBrowser(path: string) {
  const r = await claude(JSON.stringify({ agentBrowserPath: path }), 'plugin', 'configure', WEB_MCP, '--values-stdin');
  if (r.ok) done.push(`web-mcp: agentBrowserPath is ${path}`);
  else
    failures.push(
      `web-mcp: could not set agentBrowserPath (${r.err}); set it to ${path} with /plugin configure web-mcp`,
    );
}
