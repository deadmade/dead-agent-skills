// Small validation helpers; every failure names the file and the field.
export class SchemaError extends Error {}
export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function object(v: unknown, where: string): Record<string, unknown> {
  if (!isObject(v)) throw new SchemaError(`${where}: expected an object`);
  return v;
}
export function only(v: Record<string, unknown>, keys: string[], where: string) {
  for (const key of Object.keys(v)) if (!keys.includes(key)) throw new SchemaError(`${where}: unknown field "${key}"`);
}
export function string(v: unknown, where: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new SchemaError(`${where}: expected a non-empty string`);
  return v;
}
export function strings(v: unknown, where: string): string[] {
  if (!Array.isArray(v)) throw new SchemaError(`${where}: expected an array of strings`);
  return v.map((s, i) => string(s, `${where}[${i}]`));
}
export function oneOf<T extends string>(v: unknown, values: readonly T[], where: string): T {
  if (typeof v !== 'string' || !values.includes(v as T))
    throw new SchemaError(`${where}: expected one of ${values.join(', ')}`);
  return v as T;
}
// A relative path that stays inside its root.
export function relativePath(v: unknown, where: string): string {
  const path = string(v, where);
  if (
    path.includes('\\') ||
    path.includes('\0') ||
    path.includes(':') ||
    path.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw new SchemaError(`${where}: expected a relative path inside the plugin, got "${path}"`);
  return path;
}
export const relativePaths = (v: unknown, where: string) =>
  (Array.isArray(v) ? v : (strings(v, where), [])).map((p, i) => relativePath(p, `${where}[${i}]`));
