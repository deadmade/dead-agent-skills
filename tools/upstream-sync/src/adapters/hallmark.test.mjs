import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { run, trim } from './hallmark.ts';

test('trim drops the comp step and the edit-time hook from flow.md', () => {
  const flow = `The stamp says \`shape: app screen\`, which sloplint and the edit-time hook read as the app scope.

## Fast mode

Quick.

## Edit-time linting

Run \`install-hook.mjs\`.

## Comp before build (signal 9)

Load \`comp.md\`.

## Harnesses

| Edit-time hook | PostToolUse via \`install-hook.mjs\` | none | none |
| Network | yes | off; \`imagegen.mjs\` needs an explicit ask and an approval | gated |

**The render tier** (\`sloplint --render\`, \`capture.mjs\`, \`picture.mjs\`) needs Node.
`;
  assert.deepEqual(trim('references/flow.md', flow), {
    out: `The stamp says \`shape: app screen\`, which sloplint reads as the app scope.

## Fast mode

Quick.

## Harnesses

| Network | yes | off | gated |

**The render tier** (\`sloplint --render\`, \`capture.mjs\`) needs Node.
`,
    left: [],
  });
});

test('trim renumbers imagery.md once generated stills are gone', () => {
  const imagery = `4. **Photographs**.
5. **Generated stills**, only when \`TOGETHER_API_KEY\` is set (§ 6).
6. **Type at full scale**.

## 6. Generated stills

See \`comp.md\`.

## 7. Never
`;
  assert.deepEqual(trim('references/imagery.md', imagery), {
    out: '4. **Photographs**.\n5. **Type at full scale**.\n\n## 7. Never\n',
    left: [],
  });
});

test('trim reports a mention its edits no longer reach, and leaves "together" alone', () => {
  const { left } = trim('references/craft.md', 'Display and body together.\nNow load `comp.md` first.\n');
  assert.deepEqual(left, [2]);
});

test("run ships the skill's scripts but not upstream's own test files", () => {
  // The skill scanner rates a test's child_process or eval use CRITICAL, and nothing here runs those tests.
  const root = mkdtempSync(join(tmpdir(), 'hallmark-sync-'));
  try {
    const up = join(root, 'upstream');
    const put = (rel, text) => {
      mkdirSync(dirname(join(up, rel)), { recursive: true });
      writeFileSync(join(up, rel), text);
    };
    put('LICENSE', 'license\n');
    put('skills/hallmark/SKILL.md', '---\nname: hallmark\ndescription: "Design pages."\n---\nBody.\n');
    put('skills/hallmark/references/flow.md', '# Flow\n');
    put('skills/hallmark/scripts/photos.json', '[]\n');
    for (const script of ['theme', 'capture', 'sloplint-render']) {
      put(`skills/hallmark/scripts/${script}.mjs`, 'export {};\n');
      put(`skills/hallmark/scripts/${script}.test.mjs`, "import test from 'node:test';\n");
    }
    const ctx = { ROOT: join(root, 'repo'), git: () => 'abc', finish: () => {}, sparseClone: () => up };
    run(ctx);
    const scripts = join(ctx.ROOT, 'plugins', 'opt-in', 'hallmark', 'skills', 'hallmark', 'scripts');
    assert.deepEqual(readdirSync(scripts).sort(), ['capture.mjs', 'photos.json', 'sloplint-render.mjs', 'theme.mjs']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
