import type { AgentId } from './agents.ts';

export interface PluginDefinition {
  name: string;
  description?: string;
  source: string | { source: 'url'; url: string };
  resources: string[];
  dependencies: string[];
  targets: AgentId[];
}
export interface CapabilityDiagnostic {
  target: AgentId;
  plugin?: string;
  message: string;
}

export function selectTarget(
  definitions: PluginDefinition[],
  target: AgentId,
): { plugins: PluginDefinition[]; diagnostics: CapabilityDiagnostic[] } {
  const byName = new Map<string, PluginDefinition>();
  for (const entry of definitions) {
    if (byName.has(entry.name)) throw new Error(`Duplicate plugin name: ${entry.name}`);
    byName.set(entry.name, entry);
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (entry: PluginDefinition) => {
    if (visiting.has(entry.name)) throw new Error(`Plugin dependency cycle: ${entry.name}`);
    if (visited.has(entry.name)) return;
    visiting.add(entry.name);
    for (const name of entry.dependencies) {
      const dependency = byName.get(name);
      if (!dependency) throw new Error(`Unknown dependency ${name} for ${entry.name}`);
      visit(dependency);
    }
    visiting.delete(entry.name);
    visited.add(entry.name);
  };
  definitions.forEach(visit);
  const plugins = definitions.filter((p) => p.targets.includes(target));
  for (const entry of plugins) {
    for (const name of entry.dependencies)
      if (!byName.get(name)!.targets.includes(target))
        throw new Error(`Required dependency ${name} for ${entry.name} is unavailable on ${target}`);
  }
  return {
    plugins,
    diagnostics: definitions
      .filter((p) => !p.targets.includes(target))
      .map((p) => ({
        target,
        plugin: p.name,
        message: `${p.name} is unavailable on ${target}`,
      })),
  };
}

export function portableSelection(definitions: PluginDefinition[], selected: string[]): string[] {
  const { plugins } = selectTarget(definitions, 'codex');
  const result = new Set(['dead-skills', ...selected]);
  for (const name of result) {
    const entry = plugins.find((p) => p.name === name);
    if (!entry) throw new Error(`Unknown portable component: ${name}`);
    entry.dependencies.forEach((dep) => result.add(dep));
  }
  return [...result];
}
