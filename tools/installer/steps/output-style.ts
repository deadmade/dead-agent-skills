// The concise output style: written when missing, a differing file replaced only after a yes.
import { existsSync, readFileSync } from 'node:fs';
import { asset, done } from '../context.ts';
import { writeAtomic } from '../system/files.ts';

export async function applyOutputStyle(file: string, replace: (question: string) => Promise<boolean>) {
  const shipped = asset('concise-output-style.md');
  if (!existsSync(file)) {
    writeAtomic(file, shipped);
    return done.push(`wrote ${file}`);
  }
  if (readFileSync(file, 'utf8') === shipped) return;
  if (await replace(`${file} differs from the shipped style. Replace it?`)) {
    writeAtomic(file, shipped);
    done.push(`replaced ${file}`);
  } else done.push(`kept your ${file}`);
}
