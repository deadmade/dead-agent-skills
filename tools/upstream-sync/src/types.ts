export interface Revision {
  label: string;
  sha: string;
}
export interface NewSkill {
  name: string;
  description: string;
}
export interface AdapterResult {
  revisions: Revision[];
  newSkills: NewSkill[];
  report: string[];
  values: Record<string, string>;
  body?: string;
}
export interface CloneOptions {
  noCone?: boolean;
  ref?: string;
  depth?: number;
}
export interface PinOptions {
  repo: string;
  files: Record<string, string>;
  out: string;
  tagPattern: RegExp;
}
export interface SyncContext {
  ROOT: string;
  argument: string;
  ref?: string;
  result: AdapterResult;
  git: (...args: string[]) => string;
  gh: (...args: string[]) => string;
  log: (message: string) => void;
  report: (message: string) => void;
  tempDir: () => string;
  sparseClone: (url: string, patterns: string[], options?: CloneOptions) => string;
  finish: (label: string, sha: string, upstreamFile: string, dirs: string | string[]) => void;
  reportNew: (entries: string[][]) => void;
  syncPin: (options: PinOptions) => void;
}
export type Adapter = (context: SyncContext) => AdapterResult;
export interface NewSkillPolicy {
  title: (name: string) => string;
  lead: (skill: string) => string;
  source: (skill: string) => string;
  script: string;
  include: (skill: string) => string;
  overlap: string;
  after?: string;
}
export interface Source {
  name: string;
  adapter: Adapter;
  argument?: string;
  paths: string[];
  scan?: boolean;
  bodyFrom?: 'report' | 'adapter';
  check: (values: Record<string, string>) => Record<string, string>;
  title: (values: Record<string, string>) => string;
  body?: (values: Record<string, string>, report?: string) => string;
  commitMessage?: (values: Record<string, string>) => string;
  newSkills?: NewSkillPolicy;
}
