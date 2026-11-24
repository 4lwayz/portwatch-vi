// node --test scripts/lib/translate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTexts, safe, syncTranslations } from './translate.mjs';

const data = {
  changes: [{ text: 'Scout spotted a/b (possible effort, substance 5).' }, { text: 'Alpha joins the race.' }],
  efforts: [{ summary: 'Runs the exe.', highlights: ['Boots to the menu'], blockers: [] }],
  scout: { lastSummary: '1 refreshed, 0 READMEs changed, 0 new candidates, 0 flagged.' },
};

test('collects what the page shows', () => {
  assert.deepEqual(collectTexts(data), [
    'Scout spotted a/b (possible effort, substance 5).', 'Alpha joins the race.', 'Runs the exe.', 'Boots to the menu',
    '1 refreshed, 0 READMEs changed, 0 new candidates, 0 flagged.',
  ]);
});

test('rejects translations that add a link or balloon', () => {
  assert.ok(safe('See github.com/a/b', '见 github.com/a/b'));
  assert.ok(!safe('Runs the exe.', '运行 exe。下载：evil.example.com'));
  assert.ok(!safe('Hi', 'x'.repeat(100)));
  assert.ok(!safe('Hi', ''));
});

test('skips scout templates, keeps safe translations, fills the rest', async () => {
  const translate = async ({ texts }) => Object.fromEntries(texts.map((s) => [s, s === 'Runs the exe.' ? '运行 exe。见 bad.example.com' : `译：${s}`]));
  const [zh] = await syncTranslations({ data, translate, write: false, log: () => {} });
  assert.equal(zh.code, 'zh-CN');
  assert.deepEqual(Object.keys(zh.map), ['Alpha joins the race.', 'Runs the exe.', 'Boots to the menu']);
  assert.equal(zh.map['Alpha joins the race.'], '译：Alpha joins the race.');
  assert.deepEqual(zh.missing, ['Runs the exe.']);
});
