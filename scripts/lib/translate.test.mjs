// node --test scripts/lib/translate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTexts, safe, syncTranslations, geminiChain, geminiFailure, makeGeminiTranslator, redact } from './translate.mjs';

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

// Gemini: a fake API that answers GET /models and POST :streamGenerateContent (as server-sent events) from a script of
// replies per model.
const MODELS = [
  { name: 'models/gemini-4-hydrogen', outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash', outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] },
];
const rows = (body, f = (s, code) => `${code}:${s}`) => {
  const items = JSON.parse(/<items>(.*)<\/items>/s.exec(body.contents[0].parts[0].text)[1]);
  const fields = body.generationConfig.responseSchema.items.required.filter((k) => k !== 'id');
  return items.map(({ id, text }) => ({ id, ...Object.fromEntries(fields.map((k) => [k, f(text, k)])) }));
};
const sse = (...chunks) => ({ status: 200, sse: chunks });
// The answer arrives in two chunks after a thought part, which must not end up in the JSON.
const answer = (body) => {
  const t = JSON.stringify(rows(body));
  const half = Math.floor(t.length / 2);
  return sse(
    { candidates: [{ content: { parts: [{ text: 'Thinking about terms…', thought: true }, { text: t.slice(0, half) }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: t.slice(half) }] } }] },
  );
};
const busy = { status: 503, json: { error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } } };
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
    if (opts.method === 'GET') r = { status: 200, json: { models } };
    else {
      assert.match(url, /:streamGenerateContent\?alt=sse$/);
      const model = decodeURIComponent(/models\/([^:]+):/.exec(url)[1]);
      const body = JSON.parse(opts.body);
      posts.push({ model, body });
      const next = script[model]?.shift();
      r = typeof next === 'function' ? next(body) : next || quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier');
    }
    if (r.sse) return new Response(r.sse.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
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

test('gives a busy model one more try after a pause, then moves on', async () => {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  const once = fakeApi({ 'gemini-4-hydrogen': [busy, answer] });
  const out = await makeGeminiTranslator({ apiKey: 'k', fetch: once.fetch, sleep })({ jobs, log: quiet });
  assert.deepEqual(once.posts.map((p) => p.model), ['gemini-4-hydrogen', 'gemini-4-hydrogen']);
  assert.equal(Object.keys(out['zh-TW']).length, 2);

  const twice = fakeApi({ 'gemini-4-hydrogen': [busy, busy], 'gemini-3.8-flash': [answer] });
  await makeGeminiTranslator({ apiKey: 'k', fetch: twice.fetch, sleep })({ jobs, log: quiet });
  assert.deepEqual(twice.posts.map((p) => p.model), ['gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-3.8-flash']);
  assert.deepEqual(waits, [20000, 20000]);
});

test('sends thinkingLevel medium to Gemini 3 and later, a budget to 2.5, never both', async () => {
  const { fetch, posts } = fakeApi({ 'gemini-4-hydrogen': [], 'gemini-2.5-flash': [answer] },
    ['gemini-4-hydrogen', 'gemini-2.5-flash'].map((id) => ({ name: `models/${id}`, outputTokenLimit: 65536 })));
  await makeGeminiTranslator({ apiKey: 'k', fetch })({ jobs, log: quiet });
  assert.deepEqual(posts.map((p) => p.body.generationConfig.thinkingConfig), [{ thinkingLevel: 'medium' }, { thinkingBudget: 2048 }]);
});

test('retries without the thinking setting when a model rejects it', async () => {
  const bad = { status: 400, json: { error: { status: 'INVALID_ARGUMENT', message: 'thinking_level is not supported' } } };
  const { fetch, posts } = fakeApi({ 'gemini-4-hydrogen': [bad, answer] });
  await makeGeminiTranslator({ apiKey: 'k', fetch })({ jobs, log: quiet });
  assert.ok(posts[0].body.generationConfig.thinkingConfig);
  assert.equal(posts[1].body.generationConfig.thinkingConfig, undefined);
});

test('retries a cut-off reply, and stops after three quota-using requests', async () => {
  const cut = sse({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '[{"id":0,' }] } }] });
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

const KEY = 'AIzaSyTEST_not_a_real_key_0123456789abc';

test('scrubs keys and project numbers from log text', () => {
  assert.equal(redact(`bad key ${KEY} for projects/123456789012`, KEY), 'bad key [key] for projects/[id]');
  assert.equal(redact('GET /v1beta/models?key=AIzaSyOTHER_key_abcdefghijklmnop&pageSize=1'), 'GET /v1beta/models?key=[key]&pageSize=1');
  assert.equal(redact('consumer project_number:987654321098 over quota'), 'consumer project_number:[id] over quota');
  assert.equal(redact('331 translations for 331 texts'), '331 translations for 331 texts');
});

test('the key and the project never reach the log, even when an error message carries them', async () => {
  const leaky = { status: 500, json: { error: { status: 'INTERNAL', message: `Internal error for key ${KEY} in projects/123456789012` } } };
  const { fetch, posts } = fakeApi({ 'gemini-4-hydrogen': [leaky], 'gemini-3.8-flash': [answer] });
  const logs = [];
  await makeGeminiTranslator({ apiKey: KEY, fetch })({ jobs, log: (s) => logs.push(s) });
  assert.equal(posts.length, 2);
  const all = logs.join('\n');
  assert.ok(!all.includes(KEY) && !all.includes('AIza') && !all.includes('123456789012'), all);
  assert.match(all, /\[key\]/);
  assert.match(all, /Gemini: 1 of at most 3 quota-using requests this run/);
});

test('the key goes in a header, never in a URL', async () => {
  const seen = [];
  const { fetch: inner } = fakeApi({ 'gemini-4-hydrogen': [answer] });
  const fetch = (url, opts) => { seen.push({ url, key: opts.headers['x-goog-api-key'] }); return inner(url, opts); };
  await makeGeminiTranslator({ apiKey: KEY, fetch })({ jobs, log: quiet });
  assert.ok(seen.length >= 2);
  for (const s of seen) {
    assert.ok(s.url.startsWith('https://generativelanguage.googleapis.com/'));
    assert.ok(!s.url.includes(KEY));
    assert.equal(s.key, KEY);
  }
});

test('GEMINI_MODELS skips entries that aren\'t gemini model ids without echoing them', async () => {
  const { fetch, posts } = fakeApi({ 'gemini-3.8-flash': [answer] });
  const logs = [];
  await makeGeminiTranslator({ apiKey: KEY, fetch, models: `${KEY}, ../../evil, gemini-3.8-flash` })({ jobs, log: (s) => logs.push(s) });
  assert.deepEqual(posts.map((p) => p.model), ['gemini-3.8-flash']);
  assert.ok(logs.some((s) => /ignored 2 entries/.test(s)));
  assert.ok(!logs.join('\n').includes(KEY) && !logs.join('\n').includes('evil'));
});

test('GEMINI_MODELS replaces the automatic order', async () => {
  const { fetch, posts } = fakeApi({ 'gemini-3.8-flash': [answer] });
  await makeGeminiTranslator({ apiKey: 'k', fetch, models: 'gemini-3.8-flash, gemini-4-hydrogen' })({ jobs, log: quiet });
  assert.deepEqual(posts.map((p) => p.model), ['gemini-3.8-flash']);
});
