// The test seam: an answers file that lets the installer run unattended (docs/components/installer.md). Read on every
// call, not once, because tests set and unset the variable within one process.
import { readFileSync } from 'node:fs';

export type Answers = {
  chosen: Record<string, boolean>;
  prompts: Record<string, boolean | string>;
  marketplace?: string;
  releases?: string;
};

export function testAnswers(): Answers | undefined {
  const path = process.env.DEAD_SKILLS_TEST_ANSWERS;
  if (!path) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`bad answers file ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
