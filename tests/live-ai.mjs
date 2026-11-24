/**
 * 真實 AI 連線測試（會花一點點 API 費用，不包含在 npm test）。
 *
 * PowerShell：
 *   $env:XAI_API_KEY="xai-..."; $env:GEMINI_API_KEY="AIza..."; npm run test:live
 * 只測 Gemini 備援：不要設定 XAI_API_KEY 即可。
 *
 * 依序：測試連線 → 劇本模式一回合 → AI 動態模式開場 + 一回合 + 結算。
 */
import { createDevSource, testConnection, PROVIDER_TIMEOUT_MS } from '../js/api.js';
import { createInitialState, rollLuck, validateResponseSchema, resolveRound } from '../js/rules.js';
import { CHARACTERS, LOCATIONS, fallbackOptions } from '../js/scenarios.js';
import { normalizeSettings } from '../js/state.js';

const settings = normalizeSettings({
  keys: { xai: process.env.XAI_API_KEY ?? '', gemini: process.env.GEMINI_API_KEY ?? '' },
  models: { xai: process.env.XAI_MODEL ?? '', gemini: process.env.GEMINI_MODEL ?? '' },
});

if (!settings.keys.xai && !settings.keys.gemini) {
  console.log('請先設定環境變數 XAI_API_KEY 及／或 GEMINI_API_KEY，例如（PowerShell）：');
  console.log('  $env:XAI_API_KEY="xai-..."; npm run test:live');
  process.exit(1);
}

const character = CHARACTERS.clerk;
const source = createDevSource(settings);
let failed = 0;

async function step(title, fn) {
  const t0 = Date.now();
  try {
    const out = await fn();
    console.log(`✅ ${title}（${Date.now() - t0} ms）`);
    if (out) console.log(`   ${out}`);
    return true;
  } catch (err) {
    failed += 1;
    console.log(`❌ ${title}（${Date.now() - t0} ms）\n   → [${err.code ?? 'error'}] ${err.message}`);
    return false;
  }
}

const short = (s, n = 70) => (String(s ?? '').length > n ? `${String(s).slice(0, n)}…` : String(s ?? ''));
const checkSchema = (resp) => {
  const v = validateResponseSchema(resp);
  if (!v.ok) throw Object.assign(new Error(`格式不合格：${v.errors.join(', ')}`), { code: 'schema' });
  return v.warnings.length ? `（警告：${v.warnings.join(', ')}）` : '';
};

console.log(`供應商順序：${settings.keys.xai ? 'Grok' : ''}${settings.keys.xai && settings.keys.gemini ? ' → ' : ''}${settings.keys.gemini ? 'Gemini' : ''}`);
console.log(`單一供應商逾時：${PROVIDER_TIMEOUT_MS / 1000} 秒\n`);

await step('測試連線', async () => {
  const r = await testConnection(settings);
  const detail = r.results.map((x) => `${x.provider}: ${x.ok ? `OK ${x.latencyMs}ms` : `失敗 ${x.error}`}`).join('｜');
  if (!r.ok) throw new Error(detail);
  return detail;
});

const classic = createInitialState({ gameId: 'live', character });
await step('劇本模式：一回合（嚴肅語氣，事件池規則）', async () => {
  const resp = await source.round(classic, { type: 'option', style: 'intel', text: '先打開收音機確認外面發生什麼事' }, null);
  const warn = checkSchema(resp);
  return `[${resp._provider}] ${short(resp.narrative)} ${warn}`;
});

const dynamic = createInitialState({ gameId: 'live', character, flow: 'dynamic' });
let opening;
await step('AI 動態模式：開場', async () => {
  opening = await source.opening(dynamic);
  if (!opening.opening || opening.options.length !== 3) throw new Error(`開場或選項不完整：${JSON.stringify(opening).slice(0, 120)}`);
  return `[${opening._provider}] ${short(opening.opening)}\n   選項：${opening.options.map((o) => `${o.style}「${o.text}」`).join(' ')}`;
});

const dice = rollLuck(Math.random, { round: 1 });
const withDice = { ...dynamic, pendingDice: { ...dice, tier: 'bad', riskCeiling: 'major', eventForced: true } };
let after = dynamic;
await step('AI 動態模式：一回合（強制「凶」骰，做缺德的事）', async () => {
  const resp = await source.round(withDice, { type: 'free', text: '趁亂把店裡最後一箱水藏起來，騙排隊的老太太說賣完了' }, null);
  const warn = checkSchema(resp);
  const r = resolveRound(dynamic, resp, {
    round: 1, character, locations: LOCATIONS, fallbackOptions: fallbackOptions('clerk', 1), flow: 'dynamic', dice: withDice.pendingDice,
  });
  if (!r.ok) throw new Error(`resolveRound 失敗：${r.error}`);
  after = r.state;
  return `[${resp._provider}] moral_tag=${resp.moral_tag} 風險 ${r.record.risk.proposed}→${r.record.risk.level} ${warn}\n   ${short(resp.narrative, 120)}`;
});

await step('AI 動態模式：結算評語', async () => {
  const s = await source.settle({ ...after, endType: 'clear', endRound: 1, scoreDisplay: 100, counters: { ...after.counters, cruel: 1 } });
  if (!s.personal_comment) throw new Error('評語為空');
  return `[${s._provider}] ${s.personal_comment}`;
});

console.log(failed ? `\n${failed} 項失敗` : '\n全部通過');
if (failed) process.exitCode = 1;
