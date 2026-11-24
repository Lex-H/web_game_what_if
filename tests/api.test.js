/**
 * api.js 測試（改版1）：Grok 優先、Gemini 備援，以及兩種模式的 prompt 差異。
 * 全部使用假的 fetch，不會真的連網。真實連線請用 tests/live-ai.mjs。
 */
import {
  availableProviders,
  buildRoundUserPrompt,
  buildSettleUserPrompt,
  buildSystemPrompt,
  callAI,
  createDevSource,
  PROVIDERS,
  testConnection,
} from '../js/api.js';
import { createInitialState } from '../js/rules.js';
import { CHARACTERS } from '../js/scenarios.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../js/state.js';

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} 預期 ${b}，實際 ${a}`);
}
function ok(condition, label = '') {
  if (!condition) throw new Error(`${label} 條件不成立`);
}
async function rejects(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('預期失敗，實際成功');
}

// ─── 假的供應商 ───────────────────────────────────────────────

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status });
const grokSays = (content, finish_reason = 'stop') => json({ choices: [{ message: { content }, finish_reason }] });
const geminiSays = (text) => json({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
const hang = (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));

function fakeFetch({ xai, gemini }) {
  const calls = [];
  const f = async (url, init) => {
    const provider = url.includes('x.ai') ? 'xai' : 'gemini';
    calls.push({ provider, url, headers: init.headers, body: JSON.parse(init.body) });
    const handler = provider === 'xai' ? xai : gemini;
    if (!handler) throw new Error(`不該呼叫 ${provider}`);
    return handler(init);
  };
  f.calls = calls;
  return f;
}

const BOTH = normalizeSettings({ keys: { xai: 'xai-key', gemini: 'gem-key' } });
const RESPONSE = { narrative: '好', options: [] };
const clerk = CHARACTERS.clerk;

// ─── 供應商順序與備援 ─────────────────────────────────────────

await test('Grok 成功 → 只呼叫 Grok，請求格式正確', async () => {
  const f = fakeFetch({ xai: () => grokSays(JSON.stringify(RESPONSE)) });
  const r = await callAI(BOTH, { system: 'S', user: 'U', effort: 'low' }, { fetchImpl: f });
  eq([r.provider, r.data, f.calls.length], ['xai', RESPONSE, 1]);
  const c = f.calls[0];
  eq(c.url, 'https://api.x.ai/v1/chat/completions');
  eq(c.headers.Authorization, 'Bearer xai-key');
  eq([c.body.model, c.body.reasoning_effort, c.body.response_format], ['grok-4.7', 'low', { type: 'json_object' }]);
  eq(c.body.messages.map((m) => m.role), ['system', 'user']);
});

await test('Grok 伺服器錯誤 → 改用 Gemini', async () => {
  const f = fakeFetch({ xai: () => json({ error: 'boom' }, 500), gemini: () => geminiSays(JSON.stringify(RESPONSE)) });
  const r = await callAI(BOTH, { system: 'S', user: 'U' }, { fetchImpl: f });
  eq([r.provider, r.failures[0].provider, r.failures[0].code], ['gemini', 'xai', 'provider']);
  ok(f.calls[1].url.includes('/v1beta/models/gemini-3.1-flash-lite:generateContent?key=gem-key'), 'Gemini 網址');
});

await test('Grok 逾時 → 改用 Gemini', async () => {
  const f = fakeFetch({ xai: hang, gemini: () => geminiSays(JSON.stringify(RESPONSE)) });
  const r = await callAI(BOTH, { user: 'U' }, { fetchImpl: f, timeoutMs: 20 });
  eq([r.provider, r.failures[0].code], ['gemini', 'timeout']);
});

await test('Grok 回傳不是 JSON 物件 → 改用 Gemini', async () => {
  const f = fakeFetch({ xai: () => grokSays('抱歉我不能'), gemini: () => geminiSays(JSON.stringify(RESPONSE)) });
  const r = await callAI(BOTH, { user: 'U' }, { fetchImpl: f });
  eq([r.provider, r.failures[0].code], ['gemini', 'schema']);
});

await test('Grok 拒答（content_filter）→ 改用 Gemini', async () => {
  const f = fakeFetch({ xai: () => grokSays('', 'content_filter'), gemini: () => geminiSays(JSON.stringify(RESPONSE)) });
  const r = await callAI(BOTH, { user: 'U' }, { fetchImpl: f });
  eq([r.provider, r.failures[0].code], ['gemini', 'refusal']);
});

await test('兩家都失敗 → 錯誤訊息列出兩家原因', async () => {
  const f = fakeFetch({
    xai: () => new Response('Incorrect API key provided', { status: 400 }),
    gemini: () => json({}, 429),
  });
  const err = await rejects(callAI(BOTH, { user: 'U' }, { fetchImpl: f }));
  eq([err.code, err.failures.map((x) => x.code)], ['rate_limit', ['auth', 'rate_limit']]);
  ok(err.message.includes('Grok') && err.message.includes('Gemini'), '訊息包含兩家');
});

await test('只有 Gemini Key → 不呼叫 Grok；沒有 Key → auth 錯誤', async () => {
  const onlyGemini = normalizeSettings({ keys: { gemini: 'g' } });
  eq(availableProviders(onlyGemini), ['gemini']);
  const f = fakeFetch({ gemini: () => geminiSays(JSON.stringify(RESPONSE)) });
  eq((await callAI(onlyGemini, { user: 'U' }, { fetchImpl: f })).provider, 'gemini');
  const err = await rejects(callAI(normalizeSettings({}), { user: 'U' }, { fetchImpl: f }));
  eq(err.code, 'auth');
});

await test('自訂模型與本機代理', async () => {
  const s = normalizeSettings({ keys: { xai: 'k' }, models: { xai: 'grok-x' }, baseUrl: 'localhost' });
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return grokSays('{}');
  };
  await callAI(s, { user: 'U' }, { fetchImpl: f });
  eq([calls[0].url, calls[0].body.model], ['http://localhost:8787/v1/chat/completions', 'grok-x']);
});

await test('testConnection：一家可用就算 ok，並列出各家結果', async () => {
  const f = fakeFetch({ xai: () => json({}, 401), gemini: () => geminiSays('{"ok":true}') });
  const r = await testConnection(BOTH, { fetchImpl: f });
  eq([r.ok, r.results.map((x) => [x.provider, x.ok])], [true, [['xai', false], ['gemini', true]]]);
  eq((await testConnection(normalizeSettings({}))).ok, false);
});

// ─── 開發者來源 × 兩種模式 ───────────────────────────────────

const classicState = () => createInitialState({ gameId: 't', character: clerk });
const dynamicState = (dice) => ({ ...createInitialState({ gameId: 't', character: clerk, flow: 'dynamic' }), pendingDice: dice });

await test('劇本模式 opening 不呼叫 AI；AI 動態模式由 AI 產生開場與選項', async () => {
  const f = fakeFetch({ xai: () => grokSays(JSON.stringify({ opening: '開場', options: [{ text: 'a', style: 'steady' }] })) });
  const src = createDevSource(BOTH, { fetchImpl: f });
  eq((await rejects(src.opening(classicState()))).code, 'not_available');
  eq(f.calls.length, 0);
  const o = await src.opening(dynamicState());
  eq([o.opening, o.options.length, o._provider], ['開場', 1, 'xai']);
});

await test('round 回應標示 _provider；settle 使用 medium effort', async () => {
  const f = fakeFetch({ xai: () => grokSays(JSON.stringify({ narrative: 'n', personal_comment: 'c', highlight_round: 2 })) });
  const src = createDevSource(BOTH, { fetchImpl: f });
  eq((await src.round(classicState(), { type: 'option', style: 'bold', text: '衝' }, null))._provider, 'xai');
  const s = await src.settle({ ...classicState(), endType: 'normal', endRound: 7 });
  eq([s.personal_comment, s.highlight_round, f.calls[1].body.reasoning_effort], ['c', 2, 'medium']);
});

await test('AI 動態模式 prompt：命運骰、moral_tag、語氣；劇本模式沒有這些', async () => {
  const action = { type: 'free', text: '搶隔壁的水' };
  const dyn = buildRoundUserPrompt(dynamicState({ tier: 'bad', riskCeiling: 'major', eventForced: true }), action, null, clerk);
  ok(dyn.includes('運氣：凶') && dyn.includes('風險上限：major') && dyn.includes('必須發生'), '骰子段落');
  ok(dyn.includes('moral_tag') && !dyn.includes('核心事實'), 'moral_tag / 無事件段落');
  ok(buildSystemPrompt(clerk, 'dynamic').includes('黑色幽默'), '語氣');
  const classic = buildRoundUserPrompt(classicState(), action, null, clerk);
  ok(!classic.includes('moral_tag') && !classic.includes('命運骰') && classic.includes('本回合無事件'), '劇本模式不變');
});

await test('AI 動態模式結算 prompt：手段不乾淨時要求不稱讚', async () => {
  const end = { ...dynamicState(), endType: 'clear', endRound: 6, scoreDisplay: 100 };
  const dirty = buildSettleUserPrompt({ ...end, counters: { cruel: 1 } }, clerk);
  ok(dirty.includes('殘忍 1 次') && dirty.includes('不要稱讚為成功'), '不乾淨');
  const clean = buildSettleUserPrompt({ ...end, counters: {} }, clerk);
  ok(clean.includes('真心誇一句'), '乾淨');
});

// ─── 設定搬移（state.js） ─────────────────────────────────────

await test('舊版設定：apiKey / model 搬進 keys.gemini / models.gemini', async () => {
  const s = normalizeSettings({ provider: 'gemini', apiKey: 'old', model: 'gemini-3.5-flash-lite', voice: false });
  eq([s.keys, s.models.gemini, s.voice, 'apiKey' in s, 'provider' in s], [{ xai: '', gemini: 'old' }, 'gemini-3.5-flash-lite', false, false, false]);
  eq(normalizeSettings({ keys: { gemini: 'old', xai: 'x' }, apiKey: '' }).keys, { xai: 'x', gemini: '' });
  eq([DEFAULT_SETTINGS.theme, DEFAULT_SETTINGS.keys.gemini], ['dark', '']);
  eq(PROVIDERS.xai.defaultModel, 'grok-4.7');
});

// ─── 輸出結果 ─────────────────────────────────────────────────

const failed = results.filter((r) => !r.ok);
const lines = results.map((r) => (r.ok ? `✅ ${r.name}` : `❌ ${r.name}\n   → ${r.error}`));
console.log(lines.join('\n') + `\n[api] 共 ${results.length} 項，通過 ${results.length - failed.length} 項，失敗 ${failed.length} 項`);
if (failed.length) process.exitCode = 1;
