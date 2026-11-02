import type { Diagnostic, Hook, HookEvent, HookTool, Plugin, TargetId, UiMod } from '../model.ts';
import type { Palette } from '../transforms/themes.ts';

export interface NativeEvent {
  event: string;
  matcher?: string;
}
// Everything a target needs to write one plugin.
export interface EmitContext {
  root: string; // repository root
  version: string;
  plugin: Plugin;
  plugins: Plugin[]; // the plugins of this target
  all: Plugin[];
  dest: string; // output directory of this plugin
  hooks: Hook[]; // the hooks this target supports
  palettes: Map<string, Palette>;
}
export interface Target {
  id: TargetId;
  label: string;
  // Where the target's plugins are written inside the output (a repository-shaped tree).
  pluginsDir: string;
  // The marketplace at the repository root, and the path from there to the plugins directory.
  marketplaceFile: string;
  marketplacePrefix: string;
  manifestFile: string;
  events: Partial<Record<HookEvent, NativeEvent>>;
  tools: Record<HookTool, string>;
  supportsUiMod(mod: UiMod): boolean;
  // Files generated for one plugin, after its resources were copied.
  emit(context: EmitContext): void;
  marketplace(plugins: Plugin[], version: string, pluginsPrefix: string): object;
}
export type { Diagnostic };
