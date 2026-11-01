// Plugin settings collected by the installer, with secrets passed only on stdin.
import { newer } from './release.ts';
export interface ConfigField { title: string; description: string; sensitive?: boolean; required?: boolean }
export const SELF_CONFIGURED = ['mcp-azure'];

// What to ask for a self-configured plugin, in manifest order; binKey is set by applyBin, not asked.
// configuredKeys: the option names `claude plugin configure <id> --json` lists as `configured`.
export const configPrompts = (userConfig: Record<string, ConfigField>, binKey: string, configuredKeys: string[]) =>
  Object.entries(userConfig)
    .filter(([key]) => key !== binKey)
    .map(([key, c]) => ({
      key,
      title: c.title,
      description: c.description,
      secret: c.sensitive === true,
      required: c.required === true,
      saved: configuredKeys.includes(key),
    }));

// The values to save (an empty answer keeps a saved value) and the required keys still without one.
export function configValues(prompts: ReturnType<typeof configPrompts>, answers: Record<string, string | null>) {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of prompts) {
    const v = (answers[p.key] ?? '').trim();
    if (v) values[p.key] = v;
    else if (p.required && !p.saved) missing.push(p.key);
  }
  return { values, missing };
}

// supported: configureSupported(). Without `configure`, a new plugin gets the handoff note and an installed one is left
// as it is.
export function selfConfigure({ installed, configuredKeys, requiredKeys, supported = true }: { installed: boolean; configuredKeys: string[]; requiredKeys: string[]; supported?: boolean }) {
  if (!supported) return installed ? 'skip' : 'handoff';
  return installed && requiredKeys.every((k) => configuredKeys.includes(k)) ? 'skip' : 'prompt';
}

// After the prompts: a new plugin still without a required value is handed off (nothing installed); an installed one
// keeps what was given, and the summary names its unset keys, never values.
export function afterPrompts({ name, id, installed, missing }: { name: string; id: string; installed: boolean; missing: string[] }) {
  if (!missing.length) return {};
  if (!installed) return { handoff: true };
  return { unset: `${name}: ${missing.join(', ')} not set; run /plugin configure ${id} in Claude Code` };
}

// `claude plugin configure --values-stdin` came in Claude Code 2.1.285. out: what `claude --version` printed.
export function configureSupported(out: string | undefined) {
  const v = /(\d+\.\d+\.\d+)/.exec(out ?? '')?.[1];
  return v !== undefined && !newer('2.1.285', v);
}

// The values go over stdin as JSON, never as arguments: the token must not show up in a process list.
export const configureArgs = (id: string) => ['plugin', 'configure', id, '--values-stdin'];
