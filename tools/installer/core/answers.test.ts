import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testAnswers } from './answers.ts';

const file = (text: string) => {
  const path = join(mkdtempSync(join(tmpdir(), 'answers-')), 'answers.json');
  writeFileSync(path, text);
  return path;
};

test('testAnswers reads the file the variable names', () => {
  const answers = { chosen: { a: true }, prompts: { 'Write these': true }, marketplace: '/m', releases: 'http://r' };
  process.env.DEAD_SKILLS_TEST_ANSWERS = file(JSON.stringify(answers));
  try {
    assert.deepEqual(testAnswers(), answers);
  } finally {
    delete process.env.DEAD_SKILLS_TEST_ANSWERS;
  }
  assert.equal(testAnswers(), undefined);
});

test('a malformed answers file throws its path', () => {
  const path = file('{nope');
  process.env.DEAD_SKILLS_TEST_ANSWERS = path;
  try {
    assert.throws(
      () => testAnswers(),
      (e: Error) => e.message.includes(path),
    );
  } finally {
    delete process.env.DEAD_SKILLS_TEST_ANSWERS;
  }
});
