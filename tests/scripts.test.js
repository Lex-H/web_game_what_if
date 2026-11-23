/**
 * scripts.test.js：三個角色的可玩劇本（11.2、11.6）檢查。
 *
 * - 格式：7 個節點 × 3 選項（三種風格各一、40 字內），每個結果都通過 7.5 驗證且沒有長度警告。
 * - 事件：每個角色可能遇到的事件都有 intro 與三種風格的風險，且不超過事件上限。
 * - 評語：每種結局至少 3 則（11.2）。
 * - 窮舉：每個角色 × 多組事件排程 × 全部 3^7 條選項路徑，都不會出現整份拒絕；
 *   每個角色都至少有一條路徑能通關，也能玩出不同結局（11.6）。
 *
 * 執行：npm test（或 node tests/scripts.test.js）
 */
import {
  drawEvents,
  createInitialState,
  OPTION_STYLES,
  OPTION_TEXT_MAX,
  pickEventForRound,
  resolveRound,
  RISK_LEVELS,
  textLength,
  validateResponseSchema,
} from '../js/rules.js';
import { CHARACTERS, EVENT_LIST, EVENTS, LOCATIONS, fallbackOptions } from '../js/scenarios.js';
import { createScriptSource } from '../js/api.js';
import { PLAYABLE_SCRIPTS } from '../data/scripts.js';

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}
function ok(condition, label = '') {
  if (!condition) throw new Error(label);
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENDINGS = ['clear', 'fatal', 'score', 'normal'];
const rank = (l) => RISK_LEVELS.indexOf(l);

for (const [charId, character] of Object.entries(CHARACTERS)) {
  const script = PLAYABLE_SCRIPTS[charId];

  await test(`${charId}：劇本存在且角色正確`, () => {
    ok(script, '找不到劇本');
    ok(script.characterId === charId, 'characterId 不符');
    ok(Array.isArray(script.nodes) && script.nodes.length === 7, '必須剛好 7 個節點');
  });
  if (!script) continue;

  await test(`${charId}：每個節點 3 個選項、三種風格各一、40 字內`, () => {
    script.nodes.forEach((node, i) => {
      ok(typeof node.opening === 'string' && textLength(node.opening) >= 20, `第 ${i + 1} 節點 opening 太短`);
      ok(node.options?.length === 3, `第 ${i + 1} 節點選項數`);
      ok(OPTION_STYLES.every((st) => node.options.filter((o) => o.style === st).length === 1), `第 ${i + 1} 節點風格`);
      for (const o of node.options) ok(textLength(o.text) <= OPTION_TEXT_MAX, `第 ${i + 1} 節點選項過長：${o.text}`);
    });
  });

  await test(`${charId}：每個結果都通過 7.5 驗證，沒有長度警告`, () => {
    script.nodes.forEach((node, i) => {
      for (const style of OPTION_STYLES) {
        const r = node.results?.[style];
        ok(r, `第 ${i + 1} 節點缺少 ${style} 結果`);
        const v = validateResponseSchema({ ...r, risk_event: r.risk_event ?? { level: 'none', event_id: null }, options: node.options });
        ok(v.ok, `第 ${i + 1} 節點 ${style}：${v.errors.join(',')}`);
        ok(v.warnings.length === 0, `第 ${i + 1} 節點 ${style}：${v.warnings.join(',')}（narrative ${textLength(r.narrative)} 字）`);
        for (const k of ['calm', 'intel', 'execution']) {
          const d = r.stat_changes?.[k];
          ok(Number.isInteger(d) && d >= -2 && d <= 2, `第 ${i + 1} 節點 ${style} stat_changes.${k}`);
        }
        const ids = character.milestones.map((m) => m.id);
        for (const u of r.milestone_updates) ok(ids.includes(u.id) && u.reason, `第 ${i + 1} 節點 ${style} 里程碑 ${u.id}`);
        if (r.risk_event) ok(!r.risk_event.event_id, `第 ${i + 1} 節點 ${style}：event_id 由引擎填入，劇本不要寫`);
      }
    });
  });

  await test(`${charId}：可能遇到的事件都有 intro 與三種風格的風險，且不超過上限`, () => {
    for (const ev of EVENT_LIST.filter((e) => e.characters.includes(charId))) {
      const es = script.events?.[ev.id];
      ok(es && textLength(es.intro ?? '') >= 15, `${ev.id} 缺少 intro`);
      for (const style of OPTION_STYLES) {
        const level = es.risk?.[style];
        ok(RISK_LEVELS.includes(level), `${ev.id}.${style} 風險不合法`);
        if (level === 'fatal') ok(ev.can_be_fatal, `${ev.id} 不可致命`);
        else ok(rank(level) <= rank(ev.max_risk), `${ev.id}.${style} 超過 max_risk`);
      }
    }
  });

  await test(`${charId}：每種結局至少 3 則評語（11.2）`, () => {
    for (const end of ENDINGS) {
      const list = script.comments?.[end] ?? [];
      ok(list.length >= 3, `${end} 只有 ${list.length} 則`);
      for (const c of list) ok(textLength(c.personal_comment) <= 30, `${end} 評語超過 30 字：${c.personal_comment}`);
    }
  });

  await test(`${charId}：窮舉 3^7 條路徑 × 12 組事件排程，無整份拒絕且結局多樣`, async () => {
    const source = createScriptSource(PLAYABLE_SCRIPTS);
    const endings = Object.fromEntries(ENDINGS.map((e) => [e, 0]));
    let games = 0;
    let rejectedWorld = 0;
    let appliedWorld = 0;
    let rejectedMs = 0;
    const rejectReasons = {};

    for (let seed = 1; seed <= 12; seed += 1) {
      const schedule = drawEvents(EVENT_LIST, charId, seeded(seed));
      const start = createInitialState({ gameId: 't', character, schedule });
      // 深度優先窮舉：每回合三選一
      const stack = [start];
      while (stack.length) {
        const s = stack.pop();
        const pick = pickEventForRound(s.schedule, s.round, { world: s.world, milestones: s.milestones }, EVENTS);
        const base = { ...s, schedule: pick.schedule };
        for (const style of OPTION_STYLES) {
          const response = await source.round(base, { type: 'option', style }, pick.event);
          const r = resolveRound(base, response, {
            round: base.round, character, locations: LOCATIONS, currentEvent: pick.event,
            fallbackOptions: fallbackOptions(charId, base.round + 1),
          });
          ok(r.ok, `seed ${seed} 第 ${base.round} 回合 ${style}：${r.error} ${r.errors ?? ''}`);
          rejectedWorld += r.record.world.rejected.length;
          appliedWorld += r.record.world.applied.length;
          rejectedMs += r.record.milestones.rejected.length;
          for (const x of r.record.world.rejected) {
            const key = `${x.op.op} ${x.op.path}:${x.reason}`;
            rejectReasons[key] = (rejectReasons[key] ?? 0) + 1;
          }
          if (r.state.status === 'playing') stack.push(r.state);
          else {
            games += 1;
            endings[r.state.endType] += 1;
          }
        }
      }
    }
    const rate = appliedWorld + rejectedWorld ? rejectedWorld / (appliedWorld + rejectedWorld) : 0;
    const top = Object.entries(rejectReasons).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k}×${n}`).join('；');
    console.log(`   [${charId}] ${games} 局：${ENDINGS.map((e) => `${e} ${endings[e]}`).join('、')}；世界狀態拒絕率 ${(rate * 100).toFixed(1)}%；里程碑拒絕 ${rejectedMs}${top ? `；最常被拒：${top}` : ''}`);
    ok(endings.clear > 0, '沒有任何路徑能通關');
    ok(endings.normal > 0, '沒有任何路徑撐到第 7 回合一般結算');
    ok(endings.fatal + endings.score > 0, '沒有任何路徑會失敗');
    ok(rate < 0.25, `世界狀態操作拒絕率 ${(rate * 100).toFixed(1)}% 過高（需 < 25%）`);
  });
}

const failed = results.filter((r) => !r.ok);
const lines = results.map((r) => (r.ok ? `✅ ${r.name}` : `❌ ${r.name}\n   → ${r.error}`));
const summary = `\n[scripts] 共 ${results.length} 項，通過 ${results.length - failed.length} 項，失敗 ${failed.length} 項`;
if (typeof document !== 'undefined') {
  const out = document.getElementById('out-scripts') ?? document.getElementById('out');
  out.textContent = lines.join('\n') + summary;
} else {
  console.log(lines.join('\n') + summary);
  if (failed.length && typeof process !== 'undefined') process.exitCode = 1;
}

export { results };
