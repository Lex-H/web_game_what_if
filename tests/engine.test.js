/**
 * engine.test.js：遊戲流程整合測試（第二階段驗收）。
 *
 * - 三條測試劇本走完整流程（GameController → rules.js → LocalStorage），
 *   每回合 [M, P, R, S_raw, S_display, 符號] 必須與第十一章表格完全一致。
 * - 正式 scenarios.js 自我檢查、重新整理還原、AI 失敗改用劇本、自由行動清理、戰績文字。
 *
 * 執行：npm test（或 node tests/engine.test.js）
 */
import { createScriptSource, createUnavailableSource, matchStyle } from '../js/api.js';
import { buildShareText, freeAction, GameController, optionAction, sanitizeFreeAction } from '../js/engine.js';
import { FATAL_TITLE, SCORE_FAIL_TITLE } from '../js/rules.js';
import { CHARACTERS, validateScenarios } from '../js/scenarios.js';
import { memoryStorage } from '../js/state.js';
import { TEST_SCRIPTS } from '../data/script-tests.js';

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

/** 測試用的極簡可玩劇本：每回合都 neutral，只用來驗證「改用劇本」的流程 */
function tinyScript(characterId) {
  const options = [
    { text: '穩健', style: 'steady' },
    { text: '情報', style: 'intel' },
    { text: '冒險', style: 'bold' },
  ];
  const result = {
    narrative: '劇本備援回應。'.repeat(10),
    milestone_updates: [],
    performance: 'neutral',
    score_reason: '劇本備援',
    stat_changes: { calm: 0, intel: 0, execution: 0 },
    world_state_changes: [],
    round_summary: '劇本備援',
  };
  return {
    characterId,
    nodes: Array.from({ length: 7 }, (_, i) => ({
      opening: `劇本第 ${i + 1} 回合`,
      options,
      results: { steady: result, intel: result, bold: result },
    })),
    events: {},
    comments: { clear: [{ personal_comment: '劇本評語', highlight_action: '劇本行動' }] },
  };
}

function makeController({ storage = memoryStorage(), official = createUnavailableSource('official') } = {}) {
  const scripts = Object.fromEntries(Object.keys(CHARACTERS).map((id) => [id, tinyScript(id)]));
  const events = [];
  const controller = new GameController({
    storage,
    sources: { script: createScriptSource(scripts), official, dev: createUnavailableSource('dev') },
    testScripts: TEST_SCRIPTS,
    telemetry: (name, fields) => events.push({ name, fields }),
    rng: seeded(42),
  });
  return { controller, storage, events };
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

async function playTestScript(id, pickIndex = 0) {
  const { controller, events } = makeController();
  await controller.start({ testScriptId: id });
  const checks = [];
  while (controller.state.phase === 'awaiting_action') {
    const options = controller.state.scene.options;
    const r = await controller.act(optionAction(options[pickIndex], pickIndex));
    ok(r.ok, `第 ${controller.state.round} 回合送出`);
    checks.push(r.record.check);
  }
  return { controller, checks, events };
}

// ─── 設定檔 ───────────────────────────────────────────────────

await test('scenarios.js 自我檢查通過（2.2）', () => {
  eq(validateScenarios(), []);
});

// ─── 第十一章：三條測試劇本走完整流程 ──────────────────────────

for (const [id, ts] of Object.entries(TEST_SCRIPTS)) {
  for (const pickIndex of [0, 1, 2]) {
    await test(`${ts.title}：選第 ${pickIndex + 1} 個選項，每回合數值與表格一致`, async () => {
      const { controller, checks } = await playTestScript(id, pickIndex);
      eq(checks.length, ts.rounds.length, '回合數');
      checks.forEach((c, i) => eq(c.actual, c.expected, `第 ${i + 1} 回合 [M,P,R,raw,顯示,符號]`));
      const s = controller.state;
      eq([s.endType, s.endRound, s.trajectory.join('')], [ts.expectedEnd.endType, ts.expectedEnd.endRound, ts.expectedEnd.trajectory], '結局');
      const st = await controller.settle();
      if (ts.expectedEnd.grade) eq(st.rating.grade, ts.expectedEnd.grade, '評級');
      if (ts.expectedEnd.title) eq(st.title, ts.expectedEnd.title, '稱號');
      if (ts.expectedEnd.score) eq(st.score, ts.expectedEnd.score, '顯示分數');
      eq(s.phase, 'settled');
    });
  }
}

await test('11.4 結局稱號為「亂世砲灰第一排」、11.5 為 fatal 專屬稱號', async () => {
  const a = await playTestScript('test_fail_score');
  eq((await a.controller.settle()).title, SCORE_FAIL_TITLE);
  const b = await playTestScript('test_fail_fatal', 2);
  eq((await b.controller.settle()).title, FATAL_TITLE);
});

// ─── 戰績文字（8.5） ─────────────────────────────────────────

await test('8.5 通關戰績文字格式', async () => {
  const { controller } = await playTestScript('test_clear');
  await controller.settle();
  const text = buildShareText(controller.state, { url: 'https://example.test' });
  eq(text.split('\n'), [
    '【What If 生存推演】',
    '我在《明天，臺灣被攻佔》',
    '挑戰「取得必要物資，並與家人會合」',
    '最終得分 100/100｜評級 A',
    '（第 7 回合達成）！',
    '',
    '軌跡：🟢🟢🔴🟢🟢🟢🏆',
    '稱號：「時代劇本的終極破局者」',
    '',
    '不服來戰：https://example.test',
  ]);
});

await test('8.5 未通關戰績文字：在第 N 回合出局', async () => {
  const { controller } = await playTestScript('test_fail_fatal');
  await controller.settle();
  const lines = buildShareText(controller.state).split('\n');
  eq([lines[3], lines[4]], ['最終得分 84/100', '在第 6 回合出局']);
});

// ─── 保存與還原（4.5、14.2、10.5） ─────────────────────────────

await test('重新整理後從同一回合繼續，不重複計分（3.6）', async () => {
  const storage = memoryStorage();
  const first = makeController({ storage }).controller;
  await first.start({ testScriptId: 'test_clear' });
  await first.act(optionAction(first.state.scene.options[0], 0));
  await first.act(optionAction(first.state.scene.options[0], 0));
  const before = first.state;

  const second = makeController({ storage }).controller;
  const restored = second.restore();
  eq([restored.round, restored.scoreDisplay, restored.phase], [3, 39, 'awaiting_action']);
  eq(restored.gameId, before.gameId);
  const r = await second.act(optionAction(second.state.scene.options[0], 0));
  eq(r.record.check.pass, true, '第 3 回合比對');
});

await test('等待 AI 時重新整理 → 進入錯誤狀態，保留待送出的行動', async () => {
  const storage = memoryStorage();
  const { controller } = makeController({ storage });
  await controller.start({ characterId: 'clerk', mode: 'script' });
  controller.state.phase = 'awaiting_ai';
  controller.state.pendingAction = { type: 'free', text: '打聽消息' };
  storage.setItem('whatif.game.v1', JSON.stringify(controller.state));

  const again = makeController({ storage }).controller;
  const s = again.restore();
  eq([s.phase, s.lastError.code, s.pendingAction.text], ['error', 'interrupted', '打聽消息']);
  const r = await again.retry();
  ok(r.ok, '重試成功');
  eq(again.state.round, 2);
});

await test('官方模式尚未開放：錯誤後狀態不變，可改用劇本完成本回合（10.5、11.1）', async () => {
  const { controller, events } = makeController();
  await controller.start({ characterId: 'office', mode: 'official' });
  ok(controller.state.scene.opening.includes('劇本第 1 回合'), '開場改用劇本節點');
  const before = JSON.stringify({ ...controller.state, phase: null, pendingAction: null, lastError: null });

  const r = await controller.act(optionAction(controller.state.scene.options[1], 1));
  eq([r.ok, r.error, controller.state.phase], [false, 'not_available', 'error']);
  eq(JSON.stringify({ ...controller.state, phase: null, pendingAction: null, lastError: null, aiErrors: 0 }),
    JSON.stringify({ ...JSON.parse(before), aiErrors: 0 }), '分數與世界狀態不變');
  ok(events.some((e) => e.name === 'ai_error'), '送出 ai_error 遙測');

  const r2 = await controller.useScriptThisRound();
  ok(r2.ok, '改用劇本');
  eq([controller.state.round, r2.record.source], [2, 'script']);
});

await test('AI 逾時 → error（timeout），狀態保留', async () => {
  const slow = { name: 'official', opening: async () => ({ opening: '', options: null }), round: () => new Promise(() => {}), settle: async () => null };
  const { controller } = makeController({ official: slow });
  controller.timeoutMs = 20;
  await controller.start({ characterId: 'clerk', mode: 'official' });
  const r = await controller.act(optionAction(controller.state.scene.options[0], 0));
  eq([r.error, controller.state.phase, controller.state.round, controller.state.scoreRaw], ['timeout', 'error', 1, 0]);
});

await test('整份拒絕（risk level 為 "critical"）→ 不套用任何內容（7.5、#21）', async () => {
  const bad = {
    name: 'official',
    opening: async () => ({ opening: '', options: null }),
    round: async () => ({ ...TEST_SCRIPTS.test_clear.rounds[0].response, risk_event: { level: 'critical', event_id: null } }),
    settle: async () => null,
  };
  const { controller } = makeController({ official: bad });
  await controller.start({ characterId: 'clerk', mode: 'official' });
  const r = await controller.act(optionAction(controller.state.scene.options[0], 0));
  eq([r.error, controller.state.round, controller.state.milestones.m_supplies], ['schema', 1, 'none']);
});

await test('結算評語失敗時改用劇本評語（7.7）', async () => {
  const { controller } = makeController();
  await controller.start({ characterId: 'clerk', mode: 'official' });
  for (let i = 0; i < 7 && controller.state.phase !== 'ended'; i += 1) {
    if (controller.state.phase === 'awaiting_action') await controller.act(optionAction(controller.state.scene.options[0], 0));
    if (controller.state.phase === 'error') await controller.useScriptThisRound();
  }
  const st = await controller.settle();
  eq([st.endType, st.commentSource], ['normal', 'script']);
  ok(st.comment.personal_comment, '有評語');
});

// ─── 自由行動（6.7、11.2） ─────────────────────────────────────

await test('自由行動：移除控制字元與多餘空白，最多 80 字', () => {
  eq(sanitizeFreeAction(`  我${String.fromCharCode(0)}要${String.fromCharCode(10, 10)}  打聽${String.fromCharCode(9)}消息  `), '我 要 打聽 消息');
  eq([...sanitizeFreeAction('字'.repeat(120))].length, 80);
  eq(freeAction('   '), null);
});

await test('自由行動關鍵字對應風格；比對不到時視為穩健（11.2）', () => {
  eq(matchStyle('先去打聽一下消息'), 'intel');
  eq(matchStyle('直接衝過去'), 'bold');
  eq(matchStyle('坐下來喝口水'), 'steady');
});

await test('自由行動 excellent 由引擎計數（3.2）', async () => {
  const { controller } = await playTestScript('test_clear');
  eq(controller.state.counters.freeExcellent, 0);
});

// ─── 輸出 ─────────────────────────────────────────────────────

const failed = results.filter((r) => !r.ok);
const lines = results.map((r) => (r.ok ? `✅ ${r.name}` : `❌ ${r.name}\n   → ${r.error}`));
const summary = `\n[engine] 共 ${results.length} 項，通過 ${results.length - failed.length} 項，失敗 ${failed.length} 項`;
if (typeof document !== 'undefined') {
  const out = document.getElementById('out-engine') ?? document.getElementById('out');
  out.textContent = lines.join('\n') + summary;
} else {
  console.log(lines.join('\n') + summary);
  if (failed.length && typeof process !== 'undefined') process.exitCode = 1;
}

export { results };
