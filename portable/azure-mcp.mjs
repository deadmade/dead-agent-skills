// Read credentials only at server startup; never store them in generated packages or installer state.
import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
const command = process.argv[2];
if (!command || !isAbsolute(command) || /["%!&|<>^\r\n]/.test(command))
  throw new Error('Expected an absolute npx path');
for (const key of ['AZURE_DEVOPS_ORG_URL', 'AZURE_DEVOPS_PAT']) {
  if (!process.env[key]) {
    process.stderr.write(`Azure MCP requires ${key} in the Codex environment\n`);
    process.exit(1);
  }
}
const args = ['-y', '@tiberriver256/mcp-server-azure-devops@0.1.47'];
const windowsShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
const child = windowsShim
  ? spawn(`"${command}" ${args.join(' ')}`, { shell: true, stdio: 'inherit', env: environment() })
  : spawn(command, args, { stdio: 'inherit', env: environment() });
function environment() {
  return {
    ...process.env,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_API_VERSION: process.env.AZURE_DEVOPS_API_VERSION || '7.0',
    DOTENV_CONFIG_QUIET: 'true',
  };
}
child.on('error', () => {
  process.stderr.write('Could not launch Azure MCP\n');
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
