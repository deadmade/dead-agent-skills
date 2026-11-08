// Compiles the neutral sources into one output tree plus the two repository marketplaces.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checkBuilt, composeFlows } from '../flows/compose.ts';
import { loadPlugins, selectTarget } from '../load.ts';
import type { Diagnostic, Hook } from '../model.ts';
import { selectHooks } from '../targets/hooks.ts';
import { TARGETS } from '../targets/index.ts';
import { TOKENS as CLAUDE_CODE_TOKENS } from '../templates/hosts/claude-code.ts';
import { TOKENS as CODEX_TOKENS } from '../templates/hosts/codex.ts';
import { transformMarkdown } from '../transforms/text.ts';
import type { Palette } from '../transforms/themes.ts';
import { renderClaudeTheme, renderCodexTheme } from '../transforms/themes.ts';
import { copy, json } from './fs.ts';

const RUNTIME = join(import.meta.dirname, '../runtime');
const RUNTIME_FILES = ['common.mjs', 'claude-code.mjs', 'codex.mjs', 'run.mjs'];
const TOKENS = { 'claude-code': CLAUDE_CODE_TOKENS, codex: CODEX_TOKENS };

export interface Build {
  diagnostics: Diagnostic[];
  // What checkBuilt finds in the built flows, as `[target] file:line: what`.
  problems: string[];
  // Each flows conductor's rules-plus-Start tokens, keyed `<target>/<conductor>`.
  estimates: Record<string, number>;
}
// Writes the generated trees of both targets and the repository marketplaces into <output>, laid out like the repository.
export function buildTree(root: string, output: string): Build {
  const plugins = loadPlugins(root);
  const { version, repository }: { version: string; repository: string } = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );
  const built: Build = { diagnostics: [], problems: [], estimates: {} };
  const { diagnostics } = built;
  const palettes = new Map<string, Palette>();
  for (const plugin of plugins)
    for (const theme of plugin.manifest?.themes ?? []) {
      const palette: Palette = JSON.parse(readFileSync(join(plugin.dir!, theme.palette), 'utf8'));
      renderClaudeTheme(palette);
      renderCodexTheme(palette);
      palettes.set(theme.name, palette);
    }
  // Resolve and validate every target before touching the output.
  const plans = TARGETS.map((target) => {
    const selection = selectTarget(plugins, target.id);
    diagnostics.push(
      ...selection.unavailable.map((p) => ({
        target: target.id,
        plugin: p.name,
        message: `${p.name} is unavailable on ${target.id}`,
      })),
    );
    const entries = selection.plugins.map((plugin) => {
      const selected = selectHooks(plugin.hooks, target, plugin.name);
      diagnostics.push(...selected.diagnostics);
      for (const ext of plugin.manifest?.extensions ?? [])
        if (!target.supportsUiMod(ext))
          diagnostics.push({
            target: target.id,
            plugin: plugin.name,
            message: `${ext.kind} ${ext.entry} runs only on harnesses with a UI engine; left out of the ${target.label} package`,
          });
      return { plugin, hooks: selected.hooks };
    });
    return { target, entries };
  });
  for (const { target, entries } of plans) {
    for (const { plugin, hooks } of entries) {
      if (!plugin.dir && target.id === 'claude-code') continue;
      const dest = join(output, target.pluginsDir, plugin.name);
      mkdirSync(dest, { recursive: true });
      if (plugin.dir) {
        for (const resource of plugin.resources) copy(join(plugin.dir, resource), join(dest, resource));
        for (const file of readdirSync(plugin.dir))
          if (/^(LICENSE|NOTICE|UPSTREAM|COPYING|THIRD_PARTY)/.test(file))
            copy(join(plugin.dir, file), join(dest, file));
      }
      // A hook script ships with its sibling modules.
      if (plugin.dir)
        for (const dir of new Set(hooks.filter((h: Hook) => h.script).map((h) => dirname(h.script!))))
          copy(join(plugin.dir, dir), join(dest, dir));
      if (plugin.manifest?.hooks) rmSync(join(dest, plugin.manifest.hooks), { force: true });
      if (hooks.some((h: Hook) => h.handler)) {
        for (const file of RUNTIME_FILES) copy(join(RUNTIME, file), join(dest, 'hooks/runtime', file));
        json(join(dest, 'hooks/runtime/package.json'), { version });
      }
      target.emit({
        root,
        repository,
        version,
        plugin,
        plugins: entries.map((e) => e.plugin),
        all: plugins,
        dest,
        hooks,
        palettes,
      });
      const composed = plugin.name === 'flows' && plugin.dir ? composeFlows(plugin.dir, TOKENS[target.id]) : undefined;
      for (const [file, text] of composed?.files ?? []) writeFileSync(join(dest, file), text);
      for (const file of readdirSync(dest, { recursive: true, encoding: 'utf8' }))
        if (file.endsWith('.md')) {
          const path = join(dest, file);
          writeFileSync(path, transformMarkdown(target.id, readFileSync(path, 'utf8'), path, dest));
        }
      if (composed) {
        const found = checkBuilt(dest, target.id, composed);
        built.problems.push(...found.problems);
        for (const [conductor, tokens] of Object.entries(found.estimates))
          built.estimates[`${target.id}/${conductor}`] = tokens;
      }
    }
    json(
      join(output, target.marketplaceFile),
      target.marketplace(
        entries.map((e) => e.plugin),
        version,
        target.marketplacePrefix,
      ),
    );
  }
  for (const entry of readdirSync(output, { recursive: true, withFileTypes: true }))
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name),
        bytes = readFileSync(path),
        text = bytes.toString('utf8');
      if (!text.includes('\0') && Buffer.from(text).equals(bytes) && text.includes('\r\n'))
        writeFileSync(path, text.replaceAll('\r\n', '\n'));
    }
  return built;
}
