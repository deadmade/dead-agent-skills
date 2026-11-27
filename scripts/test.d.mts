export function realTool(
  t: { skip(message?: string): void },
  name: string,
  options?: { candidates?: string[]; strict?: boolean },
): string | undefined;
export const BUILD: string;
export function debugBuild(root: string, name: string): string;
export function freePort(): Promise<number>;
export function portCopy(from: string, to: string): Promise<number>;
