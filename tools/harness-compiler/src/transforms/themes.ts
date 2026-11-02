// Native theme formats are adapters over one semantic Night City palette.
export interface NightCityPalette {
  name: string;
  colors: Record<string, string>;
  claude: Record<string, string>;
}
function color(palette: NightCityPalette, role: string): string {
  const value = palette.colors[role];
  if (!/^#[\da-f]{6}$/i.test(value ?? '')) throw new Error(`Invalid or missing theme color: ${role}`);
  return value;
}
export function renderClaudeTheme(palette: NightCityPalette): object {
  return {
    name: palette.name,
    base: 'dark',
    overrides: Object.fromEntries(Object.entries(palette.claude).map(([key, role]) => [key, color(palette, role)])),
  };
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!,
  );
export function renderCodexTheme(palette: NightCityPalette): string {
  const settings = (roles: Record<string, string>) =>
    '<dict>' +
    Object.entries(roles)
      .map(([key, role]) => `<key>${escape(key)}</key><string>${escape(color(palette, role))}</string>`)
      .join('') +
    '</dict>';
  const scopes: [string, Record<string, string>][] = [
    ['codex.accent', { foreground: 'pink' }],
    ['comment, punctuation.definition.comment', { foreground: 'muted' }],
    ['keyword, storage, markup.heading', { foreground: 'purple' }],
    ['string, punctuation.definition.string', { foreground: 'green' }],
    ['entity.name.function, support.function', { foreground: 'cyan' }],
    ['entity.name.type, support.type, support.class', { foreground: 'blue' }],
    ['constant, constant.numeric', { foreground: 'orange' }],
    ['variable.parameter', { foreground: 'amber' }],
    ['punctuation, keyword.operator', { foreground: 'foreground' }],
    ['markup.inserted', { foreground: 'green', background: 'diffAdded' }],
    ['markup.deleted', { foreground: 'red', background: 'diffRemoved' }],
    ['markup.changed', { foreground: 'amber' }],
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n<dict>\n' +
    `<key>name</key><string>${escape(palette.name)}</string>\n<key>settings</key>\n<array>\n` +
    `<dict><key>settings</key>${settings({ background: 'background', foreground: 'foreground', selection: 'selection' })}</dict>\n` +
    scopes
      .map(
        ([scope, roles]) =>
          `<dict><key>scope</key><string>${escape(scope)}</string><key>settings</key>${settings(roles)}</dict>\n`,
      )
      .join('') +
    '</array>\n</dict>\n</plist>\n'
  );
}
export type Palette = NightCityPalette;
