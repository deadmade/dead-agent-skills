// Codex owns its plugin cache and configuration. The installer edits config.toml directly only for the url MCP servers
// (`codex mcp add --url` starts an OAuth sign-in that fails the add without a browser), the Azure environment allowlist
// and serena's start timeout.
import { createHash } from 'node:crypto';
import { rulesMigration } from '../core/rules-migration.ts';
import { installCodexTheme, readRulesReceipt } from '../system/harness-setup.ts';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { CODEX_MARKETPLACE } from '../core/agents.ts';
import { selectTarget } from '../core/catalog.ts';
import { readCatalog } from '../system/catalog.ts';
import {
  type CodexState,
  MCP_COMPONENTS,
  recoverableContext7,
  codexPlan,
  installedCodex,
  mcpName,
  mcpEnvironment,
  mcpUrlServer,
  mcpTableLine,
} from '../core/codex.ts';
import { resolveTool, toolPath } from '../core/tools.ts';
import { categorize } from '../core/options.ts';
import { BIN_DIR, PKG, VERSION, ask, done, failures, tryJson } from '../context.ts';
import { writeAtomic } from '../system/files.ts';
import { downloadBin } from '../system/net.ts';
import { startSync, which } from '../system/proc.ts';
import { confirm, note, screen } from '../ui/ui.ts';
import { type Data, changeList, initial, move, render } from '../ui/view.ts';
import { installAgentBrowser } from './agent-browser.ts';
import { ensureTool } from './tools.ts';
import { installSerena, uninstallGraphify } from './uv.ts';

export interface CodexIO {
  home?: string;
  source?: string;
  command?: (...args: string[]) => string;
  screen?: typeof screen;
  ask?: typeof ask;
  which?: typeof which;
  // uv's serena path, or undefined when the install failed.
  serena?: () => Promise<string | undefined>;
  // Removes graphify's CLI after the run retired the graphify plugin.
  cleanup?: () => Promise<void>;
}

// The url, args and environment variable names a plugin's Codex package states, generated from its plugin.json.
function readCodexMcp(catalog: string, name: string): { url?: string; args?: string[]; envVars: string[] } {
  return JSON.parse(readFileSync(join(catalog, '.agents/plugins', name, 'codex-mcp.json'), 'utf8'));
}

export async function applyCodex(io: CodexIO = {}) {
  const definitions = readCatalog(PKG);
  const { plugins } = selectTarget(definitions, 'codex');
  const find = io.which ?? which;
  const show = io.screen ?? screen;
  const question = io.ask ?? ask;
  const executable = find('codex');
  if (!executable) {
    failures.push('Codex: install the Codex CLI and put it on PATH');
    return;
  }
  const home = resolve(io.home || process.env.CODEX_HOME || join(homedir(), '.codex'));
  mkdirSync(home, { recursive: true });
  const base = join(home, 'dead-agent-skills');
  const stateFile = join(base, 'state.json');
  const previous = tryJson<CodexState>(stateFile);
  if (
    previous &&
    (!Array.isArray(previous.selected) || !Array.isArray(previous.mcp) || typeof previous.version !== 'string')
  )
    throw new Error('Invalid Codex installer state; left unchanged');
  if (existsSync(base) && lstatSync(base).isSymbolicLink()) throw new Error(`${base} is a symlink; left unchanged`);
  const run =
    io.command ??
    ((...args: string[]) => {
      const result = startSync(executable, args, {
        env: { ...process.env, CODEX_HOME: home },
        ...(args[0] === 'mcp' && args[1] === 'add' ? { stdio: 'inherit' as const } : {}),
      });
      if (result.status !== 0)
        throw new Error(result.stderr?.trim() || result.error?.message || `codex ${args.slice(0, 2).join(' ')} failed`);
      return result.stdout;
    });
  const installed = installedCodex(JSON.parse(run('plugin', 'list', '--json')));
  const current = Object.fromEntries(
    plugins.filter((p) => p.name !== 'dead-skills').map((p) => [p.name, installed.includes(p.name)]),
  );
  const keys = Object.keys(current);
  const hidden = keys.filter(
    (k) =>
      ['web-mcp', 'mcp-azure', 'http-runner'].includes(k) &&
      !resolveTool(k === 'mcp-azure' ? 'ado-mcp' : k, process.platform, process.arch, VERSION) &&
      !find(k === 'mcp-azure' ? 'ado-mcp' : k),
  );
  const dependents = (dependency: string) =>
    plugins.filter((p) => p.dependencies.includes(dependency)).map((p) => p.name);
  const data: Data = {
    version: VERSION,
    platform: `Codex · ${process.platform}-${process.arch}`,
    pages: categorize(keys.filter((k) => !hidden.includes(k) || current[k])),
    current,
    versions: Object.fromEntries(keys.filter((k) => current[k]).map((k) => [k, previous?.version ?? '?'])),
    disabled: {},
    tokens: [],
    deps: Object.fromEntries(
      plugins
        .filter((p) => p.dependencies.length)
        .map((p) => [p.name, p.dependencies.filter((n) => n !== 'dead-skills')]),
    ),
    describe: (key) => ({
      label: key,
      detail:
        key === 'serena'
          ? 'MCP server (the installer installs it with uv)'
          : MCP_COMPONENTS.includes(key)
            ? 'MCP integration (authentication may need setup)'
            : 'Portable skills and resources',
    }),
    updates:
      previous?.version !== VERSION
        ? keys.filter((k) => current[k]).map((id) => ({ id, from: previous?.version, to: VERSION }))
        : [],
    core: 'Codex: shared rules + Context7, always installed; Claude UI features stay on Claude Code',
    hidden: hidden
      .filter((k) => !current[k])
      .map((key) => ({
        key,
        why: `no release binary on this platform${dependents(key).length ? `; ${dependents(key).join(', ')} requires ${key}` : ''}`,
      })),
  };
  // A plugin that depends on a hidden one must not silently bypass platform restrictions.
  const blocked = hidden.flatMap((k) => dependents(k)).filter((k) => !current[k]);
  if (blocked.length)
    data.pages = data.pages
      .map((p) => ({ ...p, keys: p.keys.filter((k) => !blocked.includes(k)) }))
      .filter((p) => p.keys.length);
  let state = initial({ ...current });
  for (;;) {
    state = await show(state, { move: (s, k) => move(s, k, data), render: (s, o) => render(s, data, o) });
    if (state.result === 'apply') break;
    if (
      state.result === 'ask-quit' &&
      (await confirm(`Quit Codex without applying ${changeList(state, data).count} changes?`, false)) === false
    ) {
      state = { ...state, result: undefined };
      continue;
    }
    done.push('Codex: cancelled before applying changes');
    return;
  }
  const plan = codexPlan(
    definitions,
    keys.filter((k) => state.chosen[k]),
    installed,
    VERSION,
    previous,
  );
  const source = io.source ?? PKG;
  if (!existsSync(join(source, '.agents/plugins/marketplace.json')))
    throw new Error('Codex packages are missing; run npm run build:harnesses from the checkout');
  const catalog = join(base, `marketplace-${VERSION}`);
  if (existsSync(catalog) && lstatSync(catalog).isSymbolicLink())
    throw new Error(`${catalog} is a symlink; left unchanged`);
  cpSync(join(source, '.agents'), join(catalog, '.agents'), { recursive: true });
  run('plugin', 'marketplace', 'add', catalog);
  const settings = (name: string) => readCodexMcp(catalog, name);
  const context7 = settings('dead-skills').url!;

  const mcp = [...(previous?.mcp ?? [])];
  const existingMcp = JSON.parse(run('mcp', 'list', '--json'));
  if (!Array.isArray(existingMcp)) throw new Error('Unrecognized codex mcp list JSON');
  // Its own symlink and managed-elsewhere check, for each direct edit. what: what to add by hand there.
  const config = join(home, 'config.toml');
  const editConfig = (what: string, change: (raw: string) => string) => {
    if (existsSync(config) && lstatSync(config).isSymbolicLink())
      throw new Error(`Codex config.toml is a symlink; add ${what} where it is managed`);
    const raw = existsSync(config) ? readFileSync(config, 'utf8') : '';
    const next = change(raw);
    if (next !== raw) writeAtomic(config, next);
  };
  // server: the stdio command line `codex mcp add` takes, or a url server, which is written directly.
  const configure = (component: string, server: string[] | { url: string; bearerTokenEnvVar?: string }) => {
    const name = mcpName(component);
    const existing = existingMcp.find((s: any) => s.name === name);
    if (existing && !mcp.includes(component)) {
      if (component === 'dead-skills' && recoverableContext7(existing, context7)) {
        mcp.push(component);
        save();
        return;
      }
      throw new Error(`MCP name ${name} already exists outside this install; left unchanged`);
    }
    if (Array.isArray(server)) run('mcp', 'add', name, ...server);
    else editConfig(`the ${name} server`, (raw) => mcpUrlServer(raw, name, server.url, server.bearerTokenEnvVar));
    if (!mcp.includes(component)) mcp.push(component);
    save();
  };
  const applied = new Set(installed);
  const save = (complete = false) =>
    writeAtomic(
      stateFile,
      JSON.stringify(
        { version: complete ? VERSION : (previous?.version ?? ''), selected: [...applied], mcp },
        null,
        2,
      ) + '\n',
    );
  for (const name of plan.remove) {
    try {
      run('plugin', 'remove', `${name}@${CODEX_MARKETPLACE}`, '--json');
    } catch (error) {
      // The new marketplace no longer lists a retired plugin; its removal must not block the rest of the step.
      if (!plan.retired.includes(name)) throw error;
      failures.push(
        `Codex: could not remove ${name} (${(error as Error).message}); run: codex plugin remove ${name}@${CODEX_MARKETPLACE}`,
      );
      continue;
    }
    applied.delete(name);
    save();
  }
  for (const name of [...mcp]) {
    if (!plan.wanted.includes(name)) {
      run('mcp', 'remove', mcpName(name));
      mcp.splice(mcp.indexOf(name), 1);
      save();
    }
  }
  for (const name of plan.install) {
    run('plugin', 'add', `${name}@${CODEX_MARKETPLACE}`, '--json');
    applied.add(name);
    // Do not mark the release current until every requested operation succeeds.
    save();
  }
  configure('dead-skills', { url: context7 });
  if (plan.wanted.includes('web-mcp')) {
    let binary = find('web-mcp');
    if (!binary) {
      const asset = resolveTool('web-mcp', process.platform, process.arch, VERSION);
      if (!asset) throw new Error('No web-mcp release for this platform');
      binary = join(base, 'bin', VERSION, asset.exe);
      if (!existsSync(binary)) await downloadBin('web-mcp', asset, binary);
    }
    // With no pinned agent-browser build here, keep the one on PATH, as web-mcp itself falls back to it.
    const browser = resolveTool('agent-browser', process.platform, process.arch, VERSION)
      ? await installAgentBrowser(join(base, 'bin'))
      : { path: find('agent-browser'), works: !!find('agent-browser') };
    configure('web-mcp', [...(browser.path ? ['--env', `WEB_MCP_AGENT_BROWSER=${browser.path}`] : []), '--', binary]);
    if (!browser.works)
      note('Codex web-mcp', [
        'Search browser is unavailable; search needs browser setup. Fetch and lookup can still work.',
      ]);
  }
  if (plan.wanted.includes('http-runner')) {
    let binary = find('http-runner');
    if (!binary) {
      const asset = resolveTool('http-runner', process.platform, process.arch, VERSION);
      if (!asset) throw new Error('No http-runner release for this platform');
      binary = join(base, 'bin', VERSION, asset.exe);
      if (!existsSync(binary)) await downloadBin('http-runner', asset, binary);
    }
    configure('http-runner', ['--', binary]);
  }
  if (plan.wanted.includes('mcp-github')) {
    configure('mcp-github', { url: settings('mcp-github').url!, bearerTokenEnvVar: 'GITHUB_PERSONAL_ACCESS_TOKEN' });
    note('Codex GitHub authentication', ['Set GITHUB_PERSONAL_ACCESS_TOKEN in the environment that starts Codex.']);
  }
  if (plan.wanted.includes('atlassian')) {
    configure('atlassian', { url: 'https://mcp.atlassian.com/v1/mcp' });
    note('Codex Atlassian authentication', [`Run codex mcp login ${mcpName('atlassian')} to sign in.`]);
  }
  if (plan.wanted.includes('mcp-azure')) {
    let binary = find('ado-mcp');
    if (!binary) {
      const asset = resolveTool('ado-mcp', process.platform, process.arch, VERSION);
      if (!asset) throw new Error('No ado-mcp release for this platform');
      binary = join(base, 'bin', VERSION, asset.exe);
      if (!existsSync(binary)) await downloadBin('ado-mcp', asset, binary);
    }
    configure('mcp-azure', ['--', binary]);
    const { envVars } = settings('mcp-azure');
    editConfig('Azure env_vars', (raw) => mcpEnvironment(raw, mcpName('mcp-azure'), envVars));
    note('Codex Azure authentication', [
      `Set ${envVars.join(', ')} in the environment that starts Codex; the setup-mcp-azure skill says which are optional.`,
    ]);
  }
  if (plan.wanted.includes('serena')) {
    const path = await (
      io.serena ??
      (async () => {
        const uv = await ensureTool('uv', { binDir: join(base, 'bin'), off: 'serena is not added to Codex' });
        return uv && installSerena(uv.path);
      })
    )();
    if (path) {
      configure('serena', ['--', path, ...(settings('serena').args ?? [])]);
      editConfig("serena's startup_timeout_sec", (raw) =>
        mcpTableLine(raw, mcpName('serena'), 'startup_timeout_sec = 15'),
      );
    }
  }
  if (plan.retired.includes('graphify'))
    await (
      io.cleanup ??
      (async () =>
        uninstallGraphify([
          toolPath(join(base, 'bin'), 'uv', process.platform),
          toolPath(BIN_DIR, 'uv', process.platform),
        ]))
    )();
  const packaged = join(catalog, '.agents/plugins/dead-skills');
  const theme = installCodexTheme(home, join(packaged, 'themes/night-city.tmTheme'));
  note('Codex Night City', [
    theme.conflict
      ? 'Existing theme is managed elsewhere or differs; preserved. Use /setup-night-city to review it.'
      : 'Run /theme and select Night City; the native picker saves your selection.',
  ]);
  note('Codex shared rules', [
    'Restart Codex and review/trust the dead-skills startup hooks in the native plugin UI.',
    'Verify shared rules in a new session before removing any legacy managed block.',
    'If this CLI cannot review/run packaged SessionStart hooks, update Codex; existing rules remain in place.',
  ]);
  const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
  const fingerprint = () => ({
    packageVersion: JSON.parse(readFileSync(join(packaged, 'hooks/runtime/package.json'), 'utf8')).version as string,
    rulesHash: hash(readFileSync(join(packaged, 'rules.md'), 'utf8').trim()),
    adapterHash: hash(readFileSync(join(packaged, 'hooks/runtime/codex.mjs'))),
  });
  // Fail closed for symlinks, directories, or unreadable discovery, including a shadowing override.
  const instructions = () => {
    for (const [source, name] of [
      ['override', 'AGENTS.override.md'],
      ['agents', 'AGENTS.md'],
    ] as const) {
      const file = join(home, name);
      let stat;
      try {
        stat = lstatSync(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        return undefined;
      }
      if (!stat.isFile()) return undefined;
      const raw = readFileSync(file, 'utf8');
      if (raw.trim()) return { source, file, raw, dev: stat.dev, ino: stat.ino };
    }
    return undefined;
  };
  const before = instructions();
  const expected = fingerprint();
  const receipt = readRulesReceipt(home);
  if (
    before &&
    (receipt as { source?: unknown } | undefined)?.source === before.source &&
    rulesMigration({ raw: before.raw, receipt, expected, userVerified: false }).action === 'offer-removal'
  ) {
    const block = before.raw.match(/<!-- dead-agent-skills:start -->[\s\S]*?<!-- dead-agent-skills:end -->/)![0];
    if (
      await question(
        'Have you reviewed/trusted the startup hooks and explicitly verified shared rules in a new Codex session? Remove the legacy managed block?',
        false,
      )
    ) {
      const current = instructions();
      const fresh = fingerprint();
      const freshReceipt = readRulesReceipt(home);
      if (
        current &&
        (freshReceipt as { source?: unknown } | undefined)?.source === current.source &&
        current.source === before.source &&
        current.file === before.file &&
        current.dev === before.dev &&
        current.ino === before.ino &&
        JSON.stringify(fresh) === JSON.stringify(expected)
      ) {
        const decision = rulesMigration({
          raw: current.raw,
          receipt: freshReceipt,
          expected: fresh,
          userVerified: true,
          confirmedBlockHash: hash(block),
        });
        if (decision.action === 'remove') writeAtomic(current.file, decision.next);
      }
    }
  }
  save(true);
  done.push(`Codex: ${plan.wanted.join(', ')} configured at v${VERSION}; restart Codex to load changes`);
}
