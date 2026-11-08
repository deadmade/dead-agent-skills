// The shapes shared by the loader, the schemas and the target emitters.
export type TargetId = 'claude-code' | 'codex';
export const TARGET_IDS: readonly TargetId[] = ['claude-code', 'codex'];

// Neutral hook events. A target maps the ones it supports to native events and drops the rest.
export const HOOK_EVENTS = [
  'session.started',
  'session.ended',
  'prompt.submitted',
  'turn.finished',
  'subagent.started',
  'subagent.stopped',
  'permission.requested',
  'permission.prompted',
  'question.asked',
  'question.answered',
  'question.failed',
  'notification.received',
  'notification.any',
  'tool.starting',
  'tool.completed',
] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

// Neutral tool names for hook matchers. `*` matches every tool.
export const HOOK_TOOLS = [
  '*',
  'shell',
  'search',
  'file.read',
  'file.find',
  'file.write',
  'file.edit',
  'ask-user',
] as const;
export type HookTool = (typeof HOOK_TOOLS)[number];

export interface Hook {
  event: HookEvent;
  // Exactly one of the four ways to run something.
  handler?: string; // a handler of the packaged hook runtime
  script?: string; // a node script inside the plugin
  command?: string[]; // an executable on PATH and its arguments
  http?: string; // a local endpoint that receives the payload
  args?: string[]; // extra arguments for `script`
  tools?: HookTool[]; // for tool.starting / tool.completed
  paths?: string[]; // glob filters for file.write / file.edit hooks
  required: boolean;
  background: boolean;
  timeoutSeconds?: number;
}

export interface ConfigField {
  type: 'string' | 'boolean';
  title: string;
  description?: string;
  default?: string | boolean;
  sensitive?: boolean;
  required?: boolean;
  env?: string; // environment variable that carries this setting where the harness has no prompt for it
}
export interface McpServer {
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}
export interface LspServer {
  command: string;
  extensionToLanguage: Record<string, string>;
}
export interface Theme {
  name: string; // file stem of the generated theme
  palette: string; // inside the plugin
}
export interface Dependency {
  name: string;
  marketplace?: string;
  targets?: TargetId[];
}
// A UI mod: code written against one harness's runtime. It lives in the plugin like everything else, and a target that
// cannot run it leaves it out and reports that.
export interface UiMod {
  kind: 'ui-mod';
  entry: string; // inside the plugin, loaded by the harness
  copy: string[]; // inside the plugin, shipped with the mod
  types?: string; // inside the plugin, published for editors
}
export type Extension = UiMod;

export interface Manifest {
  description: string;
  author?: { name: string; url?: string; email?: string };
  homepage?: string;
  license?: string;
  keywords?: string[];
  dependencies: Dependency[];
  config: Record<string, ConfigField>;
  mcpServers: Record<string, McpServer>;
  lsp: Record<string, LspServer>;
  hooks?: string;
  extensions: Extension[];
  themes: Theme[];
  instructions?: string; // a Markdown file of standing instructions, inside the plugin
  embeds: string[]; // plugins whose skills a target without dependency installs must carry itself
}

export interface CatalogEntry {
  name: string;
  description?: string; // only for entries without a plugin directory
  source: string | { source: 'url'; url: string };
  resources: string[];
  dependencies: string[];
  targets: TargetId[];
}

export interface Plugin {
  name: string;
  description: string;
  source: CatalogEntry['source'];
  dir?: string; // absolute path of the plugin directory
  resources: string[];
  dependencies: string[];
  targets: TargetId[];
  manifest?: Manifest;
  hooks: Hook[];
  hooksDescription?: string;
}

export interface Diagnostic {
  target: TargetId;
  plugin?: string;
  message: string;
}
