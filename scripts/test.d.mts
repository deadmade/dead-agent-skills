export function realTool(
  t: { skip(message?: string): void },
  name: string,
  options?: { candidates?: string[]; strict?: boolean },
): string | undefined;
