export function load(path: string): string {
  return path;
}

export const save = (text: string): number => text.length;

export class Store {
  size = 0;
  handler = (key: string): string => key;
  get(key: string): string {
    return key;
  }
}

interface Shape {
  area(): number;
}
