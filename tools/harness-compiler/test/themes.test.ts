import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderClaudeTheme, renderCodexTheme, type NightCityPalette } from '../src/transforms/themes.ts';
const original = {
  name: 'Night City',
  base: 'dark',
  overrides: {
    background: '#1A1626',
    text: '#E6DCF7',
    inactive: '#9A90C2',
    inactiveShimmer: '#BDB4DE',
    subtle: '#4B4370',
    claude: '#F08BB4',
    claudeShimmer: '#F7B6D0',
    permission: '#F5B97A',
    permissionShimmer: '#F9D3A8',
    suggestion: '#7CCFE0',
    remember: '#B79CF0',
    merged: '#B48EF0',
    ide: '#B79CF0',
    promptBorder: '#A98BE6',
    promptBorderShimmer: '#C9B2F2',
    planMode: '#7CCFE0',
    autoAccept: '#8FDDB0',
    bashBorder: '#7CCFE0',
    fastMode: '#F2A36B',
    fastModeShimmer: '#F7C49E',
    success: '#8FDDB0',
    error: '#F2788C',
    warning: '#F5B97A',
    warningShimmer: '#F9D3A8',
    diffAdded: '#1E3631',
    diffRemoved: '#42213A',
    diffAddedWord: '#2D5A4E',
    diffRemovedWord: '#6E3355',
    diffAddedDimmed: '#1C2A2C',
    diffRemovedDimmed: '#2B1C2C',
    userMessageBackground: '#2A2340',
    userMessageBackgroundHover: '#362D52',
    messageActionsBackground: '#362D52',
    selectionBg: '#463A6E',
    bashMessageBackgroundColor: '#1D2840',
    memoryBackgroundColor: '#3A3024',
    rate_limit_fill: '#F08BB4',
    rate_limit_empty: '#362D52',
    red_FOR_SUBAGENTS_ONLY: '#F2788C',
    blue_FOR_SUBAGENTS_ONLY: '#7AA7F0',
    green_FOR_SUBAGENTS_ONLY: '#8FDDB0',
    yellow_FOR_SUBAGENTS_ONLY: '#F5D07A',
    purple_FOR_SUBAGENTS_ONLY: '#B79CF0',
    orange_FOR_SUBAGENTS_ONLY: '#F2A36B',
    pink_FOR_SUBAGENTS_ONLY: '#F08BB4',
    cyan_FOR_SUBAGENTS_ONLY: '#7CCFE0',
    rainbow_red: '#F2788C',
    rainbow_orange: '#F2A36B',
    rainbow_yellow: '#F5D07A',
    rainbow_green: '#8FDDB0',
    rainbow_blue: '#7AA7F0',
    rainbow_indigo: '#9C8CF0',
    rainbow_violet: '#C79AF0',
    rainbow_red_shimmer: '#F7A6B3',
    rainbow_orange_shimmer: '#F7C49E',
    rainbow_yellow_shimmer: '#F9E2A8',
    rainbow_green_shimmer: '#B8EBCD',
    rainbow_blue_shimmer: '#A8C6F6',
    rainbow_indigo_shimmer: '#C0B6F6',
    rainbow_violet_shimmer: '#DDBEF6',
  },
};
const palette: NightCityPalette = JSON.parse(
  readFileSync(new URL('../../../plugins/default/themes/palette.json', import.meta.url), 'utf8'),
);
test('Claude renderer preserves every existing override from semantic palette colors', () => {
  assert.deepEqual(renderClaudeTheme(palette), original);
  for (const value of Object.values(original.overrides))
    assert.ok(Object.values(palette.colors).includes(value as string));
});
test('Codex output is deterministic, escaped XML with native syntax and diff scopes', () => {
  const output = renderCodexTheme(palette);
  assert.equal(output, renderCodexTheme(palette));
  assert.match(output, /<plist version="1.0">/);
  for (const key of ['background', 'foreground', 'selection']) assert.ok(output.includes(`<key>${key}</key>`));
  for (const scope of ['comment', 'keyword', 'string', 'markup.inserted', 'markup.deleted', 'codex.accent'])
    assert.ok(output.includes(scope));
  for (const color of output.match(/#[\da-f]{6}/gi) ?? []) assert.ok(Object.values(palette.colors).includes(color));
  assert.doesNotMatch(output, /claudeShimmer|permissionShimmer|rainbow_/);
  const escaped = renderCodexTheme({ ...palette, name: 'A&B <"Night">\'s' });
  assert.ok(escaped.includes('A&amp;B &lt;&quot;Night&quot;&gt;&apos;s'));
  assert.throws(() => renderCodexTheme({ ...palette, colors: { ...palette.colors, background: 'invalid' } }), /color/i);
  assert.throws(
    () => renderClaudeTheme({ ...palette, claude: { ...palette.claude, background: 'missing' } }),
    /color/i,
  );
});
