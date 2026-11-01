// Collect settings before installing plugins that need a PAT.
import {
  SELF_CONFIGURED,
  configPrompts,
  configValues,
  configureSupported,
  selfConfigure,
  afterPrompts,
} from '../core/config.ts';
import { BIN_PLUGINS } from '../core/binaries.ts';
import { manifestPath, nameOf, type Marketplace } from '../core/plugins.ts';
import { PKG, must, tryJson, failures } from '../context.ts';
import { join } from 'node:path';
import { claude } from '../system/proc.ts';
import { line, log, secret } from '../ui/ui.ts';
const defaults = { claude, line, secret, log };
export async function collectConfig(
  wantedIds: string[],
  installedIds: string[],
  manifest: Marketplace,
  services = defaults,
) {
  const { claude, line, secret, log } = services;
  const selfConfigured = (id: string) => SELF_CONFIGURED.includes(nameOf(id));
  const selfValues: Record<string, Record<string, string>> = {};
  const selfHandoff: string[] = [];
  const supported = wantedIds.some(selfConfigured) && configureSupported((await claude(undefined, '--version')).out);
  for (const id of wantedIds.filter(selfConfigured)) {
    const installed = installedIds.includes(id);
    const shown = installed && supported ? await claude(undefined, 'plugin', 'configure', id, '--json') : undefined;
    let configuredKeys: string[] = [];
    try {
      if (shown?.ok) configuredKeys = JSON.parse(shown.out).configured ?? [];
    } catch {
      /* an older Claude Code: everything is asked again */
    }
    const userConfig = tryJson(join(PKG, manifestPath(manifest, id)!))?.userConfig ?? {};
    const requiredKeys = Object.keys(userConfig).filter((k) => userConfig[k].required === true);
    const step = selfConfigure({ installed, configuredKeys, requiredKeys, supported });
    if (step === 'handoff') selfHandoff.push(id);
    if (step !== 'prompt') continue;
    log('info', `${nameOf(id)} settings:`);
    const prompts = configPrompts(userConfig, BIN_PLUGINS[nameOf(id)].key, configuredKeys);
    const answers: Record<string, string | null> = {};
    for (const p of prompts) {
      log('info', `  ${p.description}`);
      const message = `${p.title}${p.saved ? ' (saved, Enter keeps)' : ''}:`;
      answers[p.key] = must(await (p.secret ? secret(message) : line(message)));
    }
    const { values, missing } = configValues(prompts, answers);
    const after = afterPrompts({ name: nameOf(id), id, installed, missing });
    if (after.handoff) selfHandoff.push(id);
    else selfValues[id] = values;
    if (after.unset) failures.push(after.unset);
  }
  const selected = wantedIds.filter((id) => !selfHandoff.includes(id));
  return { selected, selfValues, selfHandoff };
}
