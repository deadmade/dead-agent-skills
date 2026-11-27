// The whole installer into temporary homes, with the real claude and codex CLIs and this checkout's freshly built
// binaries served as a local release.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { realTool } from '../../scripts/test.mjs';
import { resolveTool } from './core/tools.ts';
import { start, startSync, which } from './system/proc.ts';

const WIN = process.platform === 'win32';
const ROOT = join(import.meta.dirname, '..', '..');
const VERSION: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const BUILD = 'run cargo build --locked -p web-mcp -p http-runner -p ado-mcp';
const exe = (name: string) => (WIN ? `${name}.exe` : name);

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer()
      .once('error', reject)
      .listen(0, '127.0.0.1', () => {
        const { port } = s.address() as AddressInfo;
        s.close(() => resolve(port));
      });
  });

const files = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));

test('a full install on fresh homes', { timeout: 1_200_000 }, async (t) => {
  const claude = realTool(t, 'claude');
  const codex = realTool(t, 'codex');
  // The debug builds this checkout made; the hint says how to get one.
  const built = (name: string) => {
    const hinted = { skip: (m?: string) => t.skip(`${m}: ${BUILD}`) };
    try {
      return realTool(hinted, name, { candidates: [join(ROOT, 'target', 'debug', exe(name))] });
    } catch (error) {
      throw new Error(`${(error as Error).message}: ${BUILD}`);
    }
  };
  const bins = { 'web-mcp': built('web-mcp'), 'http-runner': built('http-runner'), 'ado-mcp': built('ado-mcp') };
  if (!claude || !codex || Object.values(bins).some((b) => !b)) return;

  const root = mkdtempSync(join(tmpdir(), 'installer-real-'));
  const home = join(root, 'home');
  const config = join(home, '.claude');
  const codexHome = join(home, '.codex');
  const market = join(root, 'marketplace');
  const releases = join(root, 'releases', `v${VERSION}`);
  const hits: Record<string, number> = {};
  const server = httpServer((req, res) => {
    const file = join(root, 'releases', decodeURIComponent(new URL(req.url!, 'http://x').pathname));
    hits[req.url!] = (hits[req.url!] ?? 0) + 1;
    if (!file.startsWith(join(root, 'releases')) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200).end(readFileSync(file));
  });
  let port: number | undefined;
  // Harmless when nothing started: a refused POST, a closed server.
  t.after(async () => {
    if (port)
      await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST', signal: AbortSignal.timeout(1000) }).catch(
        () => {},
      );
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 10 });
    } catch (error) {
      console.error(`could not remove ${root}: ${(error as Error).message}`);
    }
  });

  // The marketplace: a copy of the built tree, its trim server on a port of its own.
  cpSync(join(ROOT, '.claude-plugin'), join(market, '.claude-plugin'), { recursive: true });
  port = await freePort();
  const hooks = join(market, '.claude-plugin', 'headroom-trim', 'hooks', 'hooks.json');
  writeFileSync(hooks, readFileSync(hooks, 'utf8').replaceAll('47811', String(port)));
  for (const f of files(market))
    assert.ok(!readFileSync(f, 'utf8').includes('47811'), `${f} still names the developer's port`);

  // The release: each binary packed as the archive the installer resolves, with its checksum beside it.
  mkdirSync(releases, { recursive: true });
  const tar = WIN ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : which('tar')!;
  for (const [name, bin] of Object.entries(bins)) {
    const asset = resolveTool(name, process.platform, process.arch, VERSION)!;
    const stage = join(root, 'stage', name);
    mkdirSync(stage, { recursive: true });
    cpSync(bin!, join(stage, asset.exe));
    const archive = join(releases, asset.file);
    const packed = startSync(tar, ['-a', '-cf', archive, '-C', stage, asset.exe]);
    assert.equal(packed.status, 0, packed.stderr);
    const bytes = readFileSync(archive);
    if (WIN) assert.equal(bytes.subarray(0, 2).toString(), 'PK', `${asset.file} is no zip`);
    writeFileSync(`${archive}.sha256`, `${createHash('sha256').update(bytes).digest('hex')}  ${asset.file}\n`);
  }
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const releaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // agent-browser keeps its browsers under the home: start from the cached ones, so only what's missing downloads.
  const browsers = join(home, '.agent-browser', 'browsers');
  const cached = join(homedir(), '.agent-browser', 'browsers');
  if (existsSync(cached)) cpSync(cached, browsers, { recursive: true });
  const seeded = existsSync(browsers) ? readdirSync(browsers) : [];

  const answers = join(root, 'answers.json');
  const ids = ['dead-skills', 'web-mcp', 'http-runner', 'mcp-azure', 'headroom-trim'].map(
    (n) => `${n}@dead-claude-skills`,
  );
  writeFileSync(
    answers,
    JSON.stringify({
      chosen: {
        ...Object.fromEntries([...ids, 'web-mcp', 'http-runner', 'mcp-azure'].map((k) => [k, true])),
        ccstatusline: true,
        // Unpinned installs never run in a gating test (ADR 0018); flows, which brings serena, stays unpicked too.
        dcg: false,
        'serena@dead-claude-skills': false,
        serena: false,
        'strip-defaults': false,
        clean: false,
      },
      prompts: {
        Download: true,
        'Also install the browser system packages': false,
        'Write these changes': true,
        'Azure DevOps Server collection URL': 'https://dev.example/tfs/Coll',
        'Azure DevOps personal access token': 'pat-test-value',
      },
      // With `/`: proc.ts' safeArg refuses a backslash in a claude argument.
      marketplace: market.replaceAll('\\', '/'),
      releases: releaseUrl,
    }),
  );

  const env = {
    // Unset, the XDG folders uv and the other tools write to default to under the temp HOME.
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^XDG_\w+_HOME$/.test(k))),
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: config,
    CODEX_HOME: codexHome,
    // Where uv keeps its cache and Pythons on Windows: under the temp home too.
    ...(WIN && { APPDATA: join(home, 'AppData', 'Roaming'), LOCALAPPDATA: join(home, 'AppData', 'Local') }),
    DEAD_SKILLS_TEST_ANSWERS: answers,
  };
  const child = start(
    process.execPath,
    [join(ROOT, 'tools', 'installer', 'install.ts'), '--agents=claude-code,codex'],
    {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let out = '';
  child.stdout!.on('data', (d) => (out += d));
  child.stderr!.on('data', (d) => (out += d));
  const code = await new Promise((resolve, reject) => child.once('error', reject).once('close', resolve));
  t.diagnostic(out);
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /✗/);

  const cli = (file: string, ...args: string[]) => {
    const r = startSync(file, args, { env });
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    return JSON.parse(r.stdout);
  };
  const plugins = cli(claude, 'plugin', 'list', '--json');
  const listed = (Array.isArray(plugins) ? plugins : plugins.installed).map((p: { id: string }) => p.id);
  for (const id of ids) assert.ok(listed.includes(id), `${id} is not installed: ${listed}`);

  const webMcp = startSync(join(config, 'bin', exe('web-mcp')), ['--version']);
  assert.equal(webMcp.stdout.trim(), `web-mcp ${VERSION}`);
  for (const name of Object.keys(bins)) {
    const file = resolveTool(name, process.platform, process.arch, VERSION)!.file;
    assert.ok(hits[`/v${VERSION}/${file}`], `the release server never served ${file}`);
  }

  assert.ok(existsSync(join(config, 'bin', exe('agent-browser'))));
  const chromes = readdirSync(browsers).filter((d) => d.startsWith('chrome-'));
  assert.ok(chromes.length, `no Chrome for Testing in ${browsers}`);
  const fetched = chromes.filter((d) => !seeded.includes(d));
  t.diagnostic(fetched.length ? `downloaded ${fetched.join(', ')}` : `no download, seeded with ${seeded.join(', ')}`);
  assert.ok(existsSync(join(home, '.config', 'ccstatusline', 'settings.json')));
  assert.ok(existsSync(join(config, 'plugins', 'data', 'headroom-trim-dead-claude-skills', 'venv')));

  const codexPlugins = cli(codex, 'plugin', 'list', '--json');
  assert.ok(
    codexPlugins.installed.some((p: { pluginId?: string }) => p.pluginId?.startsWith('web-mcp@')),
    JSON.stringify(codexPlugins),
  );
  const mcps = cli(codex, 'mcp', 'list', '--json');
  assert.ok(
    mcps.some((s: { name: string }) => s.name === 'dead-agent-skills-web-mcp'),
    JSON.stringify(mcps),
  );

  assert.match(readFileSync(join(config, 'settings.json'), 'utf8'), /https:\/\/dev\.example\/tfs\/Coll/);
  assert.match(readFileSync(join(codexHome, 'config.toml'), 'utf8'), /env_vars = \[[^\]]*"ADO_ORG_URL"[^\]]*"ADO_PAT"/);
});
