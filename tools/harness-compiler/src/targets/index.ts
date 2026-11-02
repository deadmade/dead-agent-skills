import type { TargetId } from '../model.ts';
import { claudeCode } from './claude-code.ts';
import { codex } from './codex.ts';
import type { Target } from './target.ts';

export const TARGETS: readonly Target[] = [claudeCode, codex];
export const targetById = (id: TargetId) => TARGETS.find((t) => t.id === id)!;
