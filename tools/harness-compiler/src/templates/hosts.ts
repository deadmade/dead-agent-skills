// The host adapter each distribution of flows carries as references/host.md.
import { readFileSync } from 'node:fs';
import type { TargetId } from '../model.ts';

export const hostReference = (target: TargetId) =>
  readFileSync(new URL(`./hosts/${target}.md`, import.meta.url), 'utf8');
