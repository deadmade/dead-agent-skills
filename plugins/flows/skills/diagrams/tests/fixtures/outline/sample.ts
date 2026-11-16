export function load(path: string): string {
  return path;
}

export const save = (text: string): number => text.length;

export class Store {
  get(key: string): string {
    return key;
  }
}

interface Shape {
  area(): number;
}
