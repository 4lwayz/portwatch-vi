// node --test scripts/lib/translate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTexts, safe, syncTranslations, geminiChain, geminiFailure, makeGeminiTranslator } from './translate.mjs';

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

test('skips scout templates, keeps safe translations, fills the rest, all languages in one call', async () => {
  const calls = [];
  const translate = async ({ jobs }) => {
    calls.push(jobs.map((j) => j.code));
    return Object.fromEntries(jobs.map((j) => [j.code, Object.fromEntries(j.texts.map((s) => [s, s === 'Runs the exe.' ? '运行 exe。见 bad.example.com' : `译：${s}`]))]));
  };
  const [zh, tw] = await syncTranslations({ data, translate, write: false, log: () => {} });
  assert.deepEqual(calls, [['zh-CN', 'zh-TW']]);
  assert.equal(zh.code, 'zh-CN');
  assert.equal(tw.code, 'zh-TW');
  assert.deepEqual(Object.keys(zh.map), ['Alpha joins the race.', 'Runs the exe.', 'Boots to the menu']);
  assert.equal(zh.map['Alpha joins the race.'], '译：Alpha joins the race.');
  assert.deepEqual(zh.missing, ['Runs the exe.']);
  assert.deepEqual(tw.missing, ['Runs the exe.']);
});

// Gemini: a fake API that answers GET /models and POST :generateContent from a script of replies per model.
const MODELS = [
  { name: 'models/gemini-4-hydrogen', outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash', outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] },
];
const rows = (body, f = (s, code) => `${code}:${s}`) => {
  const items = JSON.parse(/<items>(.*)<\/items>/s.exec(body.contents[0].parts[0].text)[1]);
  const fields = body.generationConfig.responseSchema.items.required.filter((k) => k !== 'id');
  return items.map(({ id, text }) => ({ id, ...Object.fromEntries(fields.map((k) => [k, f(text, k)])) }));
};
const ok = (json) => ({ status: 200, json });
const answer = (body) => ok({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(rows(body)) }] } }] });
const quota = (quotaId, retryDelay) => ({
  status: 429,
  json: { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota', details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
    ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []),
  ] } },
});
function fakeApi(script, models = MODELS) {
  const posts = [];
  const fetch = async (url, opts) => {
    let r;
    if (opts.method === 'GET') r = ok({ models });
    else {
      const model = decodeURIComponent(/models\/([^:]+):generateContent/.exec(url)[1]);
      const body = JSON.parse(opts.body);
      posts.push({ model, body });
      const next = script[model]?.shift();
      r = typeof next === 'function' ? next(body) : next || quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier');
    }
    return { status: r.status, ok: r.status < 300, json: async () => r.json };
  };
  return { fetch, posts };
}
const jobs = [
  { code: 'zh-CN', name: '简体中文', glossary: [['Main menu', '主菜单']], texts: ['Runs the exe.', 'Boots to the menu'] },
  { code: 'zh-TW', name: '繁體中文', glossary: [['Main menu', '主選單']], texts: ['Runs the exe.', 'Only in TW'] },
];
const quiet = () => {};

test('orders models: newest Hydrogen, then Flash from newest to oldest, stable before preview', () => {
  const list = ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-4-hydrogen', 'gemini-3.10-flash', 'gemini-3.8-flash',
    'gemini-3.8-flash-lite', 'gemini-2.5-flash-image', 'gemini-2.5-pro', 'gemini-2.5-flash-preview-09-2025', 'gemini-2.5-flash-preview-tts',
    'gemini-4-argon', 'gemini-flash-latest'].map((id) => ({ name: `models/${id}`, outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] }));
  list.push({ name: 'models/gemini-2.0-flash', outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] });
  assert.deepEqual(geminiChain(list).map((m) => m.id), [
    'gemini-4-hydrogen', 'gemini-3.10-flash', 'gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-preview-09-2025',
  ]);
});

test('tells a daily quota from a per-minute one', () => {
  assert.equal(geminiFailure(429, quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier').json).kind, 'quota');
  assert.deepEqual(geminiFailure(429, quota('GenerateContentInputTokensPerModelPerMinute-FreeTier', '37s').json), { kind: 'minute', retryMs: 37000, message: 'quota' });
  assert.equal(geminiFailure(400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }).kind, 'auth');
  assert.equal(geminiFailure(400, { error: { status: 'FAILED_PRECONDITION', message: 'User location is not supported' } }).kind, 'fatal');
});

test('sends every language and text in one request, and falls back when a model is out of quota', async () => {
  const { fetch, posts } = fakeApi({ 'gemini-4-hydrogen': [], 'gemini-3.8-flash': [answer] });
  const translate = makeGeminiTranslator({ apiKey: 'k', fetch });
  const out = await translate({ jobs, log: quiet });
  assert.deepEqual(posts.map((p) => p.model), ['gemini-4-hydrogen', 'gemini-3.8-flash']);
  const sent = JSON.parse(/<items>(.*)<\/items>/s.exec(posts[1].body.contents[0].parts[0].text)[1]).map((i) => i.text);
  assert.deepEqual(sent, ['Runs the exe.', 'Boots to the menu', 'Only in TW']);
  assert.deepEqual(out['zh-CN'], { 'Runs the exe.': 'zh_CN:Runs the exe.', 'Boots to the menu': 'zh_CN:Boots to the menu' });
  assert.deepEqual(out['zh-TW'], { 'Runs the exe.': 'zh_TW:Runs the exe.', 'Only in TW': 'zh_TW:Only in TW' });
  assert.match(posts[1].body.systemInstruction.parts[0].text, /"主選單"/);
});

test('waits out a per-minute limit once, on the same model', async () => {
  const waits = [];
  const { fetch, posts } = fakeApi({ 'gemini-4-hydrogen': [quota('GenerateContentInputTokensPerModelPerMinute-FreeTier', '20s'), answer] });
  const out = await makeGeminiTranslator({ apiKey: 'k', fetch, sleep: async (ms) => { waits.push(ms); } })({ jobs, log: quiet });
  assert.deepEqual(waits, [20000]);
  assert.deepEqual(posts.map((p) => p.model), ['gemini-4-hydrogen', 'gemini-4-hydrogen']);
  assert.equal(Object.keys(out['zh-CN']).length, 2);
});

test('retries without the thinking setting when a model rejects it', async () => {
  const bad = { status: 400, json: { error: { status: 'INVALID_ARGUMENT', message: 'thinking_level is not supported' } } };
  const { fetch, posts } = fakeApi({ 'gemini-4-hydrogen': [bad, answer] });
  await makeGeminiTranslator({ apiKey: 'k', fetch })({ jobs, log: quiet });
  assert.ok(posts[0].body.generationConfig.thinkingConfig);
  assert.equal(posts[1].body.generationConfig.thinkingConfig, undefined);
});

test('retries a cut-off reply, and stops after three quota-using requests', async () => {
  const cut = ok({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '[{"id":0,' }] } }] });
  const { fetch, posts } = fakeApi({ 'gemini-4-hydrogen': [cut, cut, cut, answer] });
  const logs = [];
  const out = await makeGeminiTranslator({ apiKey: 'k', fetch })({ jobs, log: (s) => logs.push(s) });
  assert.equal(posts.length, 3);
  assert.deepEqual(out, { 'zh-CN': {}, 'zh-TW': {} });
  assert.ok(logs.some((s) => /3 texts wait for the next run/.test(s)));
});

test('a rejected key stops the run', async () => {
  const fetch = async () => ({ status: 400, ok: false, json: async () => ({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }) });
  await assert.rejects(makeGeminiTranslator({ apiKey: 'k', fetch })({ jobs, log: quiet }), /GEMINI_API_KEY was rejected/);
});

test('GEMINI_MODELS replaces the automatic order', async () => {
  const { fetch, posts } = fakeApi({ 'gemini-3.8-flash': [answer] });
  await makeGeminiTranslator({ apiKey: 'k', fetch, models: 'gemini-3.8-flash, gemini-4-hydrogen' })({ jobs, log: quiet });
  assert.deepEqual(posts.map((p) => p.model), ['gemini-3.8-flash']);
});
