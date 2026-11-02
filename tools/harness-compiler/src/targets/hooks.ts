// Neutral hooks to a native hooks.json, for any target.
import type { Hook } from '../model.ts';
import { SchemaError } from '../schema/check.ts';
import type { Diagnostic, Target } from './target.ts';

export function selectHooks(
  hooks: Hook[],
  target: Target,
  plugin: string,
): { hooks: Hook[]; diagnostics: Diagnostic[] } {
  const selected: Hook[] = [],
    diagnostics: Diagnostic[] = [];
  for (const hook of hooks) {
    if (target.events[hook.event]) selected.push(hook);
    else {
      const message = `${hook.required ? 'Required' : 'Optional'} hook ${hook.event} is unavailable on ${target.id}`;
      if (hook.required) throw new SchemaError(`${plugin}: ${message}`);
      diagnostics.push({ target: target.id, plugin, message });
    }
  }
  return { hooks: selected, diagnostics };
}

interface Native {
  type: string;
  command?: string;
  args?: string[];
  url?: string;
  if?: string;
  async?: boolean;
  timeout?: number;
}
export function nativeHooks(hooks: Hook[], target: Target, pluginRoot: string): Record<string, object[]> {
  const events: Record<string, { matcher?: string; hooks: Native[] }[]> = {};
  for (const hook of hooks) {
    const mapping = target.events[hook.event]!;
    const common = {
      ...(hook.background ? { async: true } : {}),
      ...(hook.timeoutSeconds ? { timeout: hook.timeoutSeconds } : {}),
    };
    const run = (): Native => {
      if (hook.handler)
        return {
          type: 'command',
          command: `node "${pluginRoot}/hooks/runtime/run.mjs" --harness ${target.id} --event ${hook.event} --handler ${hook.handler}`,
          ...common,
        };
      if (hook.script)
        return {
          type: 'command',
          command: 'node',
          args: [`${pluginRoot}/${hook.script}`, ...(hook.args ?? [])],
          ...common,
        };
      if (hook.command) return { type: 'command', command: hook.command.join(' '), ...common };
      return { type: 'http', url: hook.http!, ...(hook.timeoutSeconds ? { timeout: hook.timeoutSeconds } : {}) };
    };
    let matcher = mapping.matcher;
    let entries: Native[];
    if (hook.tools) {
      const names = hook.tools.map((t) => target.tools[t]);
      matcher = hook.tools.includes('*') ? '*' : names.join('|');
      // A path filter applies per tool: `Write(**/*.md)`.
      entries = hook.paths
        ? names.flatMap((tool) => hook.paths!.map((path) => ({ ...run(), if: `${tool}(${path})` })))
        : [run()];
    } else entries = [run()];
    (events[mapping.event] ??= []).push({ ...(matcher ? { matcher } : {}), hooks: entries });
  }
  return events;
}
