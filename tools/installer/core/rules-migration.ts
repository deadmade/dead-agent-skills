import { createHash } from 'node:crypto';

interface Fingerprint {
  packageVersion: string;
  rulesHash: string;
  adapterHash: string;
}
interface Options {
  raw: string;
  receipt: unknown;
  expected: Fingerprint;
  userVerified: boolean;
  confirmedBlockHash?: string;
}
// Callers must pass freshly reread bytes after confirmation and independently guard path/source identity.
export function rulesMigration({ raw, receipt, expected, userVerified, confirmedBlockHash }: Options): {
  action: 'keep' | 'offer-removal' | 'remove';
  next: string;
} {
  const keep = { action: 'keep' as const, next: raw };
  if (!receipt || typeof receipt !== 'object') return keep;
  const r = receipt as Record<string, unknown>;
  if (
    !['packageVersion', 'rulesHash', 'adapterHash'].every((key) => r[key] === expected[key as keyof Fingerprint]) ||
    r.cleanupEligible !== true ||
    r.managedBlockPresent !== true ||
    !['agents', 'override'].includes(String(r.source))
  )
    return keep;
  const start = '<!-- dead-agent-skills:start -->',
    end = '<!-- dead-agent-skills:end -->';
  const a = raw.indexOf(start),
    b = raw.indexOf(end);
  if (a < 0 || b < a || raw.indexOf(start, a + 1) >= 0 || raw.indexOf(end, b + 1) >= 0) return keep;
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  if (hash(raw.slice(a + start.length, b).trim()) !== expected.rulesHash) return keep;
  if (!userVerified) return { action: 'offer-removal', next: raw };
  if (hash(raw.slice(a, b + end.length)) !== confirmedBlockHash) return keep;
  return { action: 'remove', next: raw.slice(0, a) + raw.slice(b + end.length) };
}
