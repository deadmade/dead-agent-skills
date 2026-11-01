import { lstatSync, readFileSync, mkdirSync, writeFileSync, linkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function stat(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
export function readRulesReceipt(home: string): unknown {
  try {
    const directory = join(home, 'dead-agent-skills');
    const file = join(directory, 'rules-hook.json');
    if (!stat(directory)?.isDirectory() || !stat(file)?.isFile()) return undefined;
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}
export function installCodexTheme(home: string, source: string): { installed: boolean; conflict: boolean } {
  const directory = join(home, 'themes');
  const file = join(directory, 'night-city.tmTheme');
  const parent = stat(directory);
  if (parent && !parent.isDirectory()) return { installed: false, conflict: true };
  const current = stat(file);
  const text = readFileSync(source);
  if (current) return { installed: false, conflict: !current.isFile() || !readFileSync(file).equals(text) };
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `.night-city-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, text, { flag: 'wx' });
    try {
      // Linking publishes the complete file atomically and refuses an existing destination.
      linkSync(temporary, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const concurrent = stat(file);
      return { installed: false, conflict: !concurrent?.isFile() || !readFileSync(file).equals(text) };
    }
  } finally {
    rmSync(temporary, { force: true });
  }
  return { installed: true, conflict: false };
}
