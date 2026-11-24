/**
 * rules.js 測試：第十六章 25 個計分案例 + 第十一章三條測試劇本 + 世界狀態 / 事件抽取。
 *
 * 執行方式：
 *   Node：    npm test   （或 node tests/rules.test.js）
 *   瀏覽器：  在專案根目錄啟動本機伺服器後開啟 /tests/index.html
 *
 * 注意：這裡的角色、事件、地點是測試用的精簡資料，不是正式的 scenarios.js。
 */
import {
  applyMilestoneUpdates,
  applyPerformance,
  applyStatChanges,
  applyWorldStateChanges,
  authorizeRisk,
  authorizeRiskByDice,
  computeScore,
  createInitialState,
  drawEvents,
  FATAL_EARLIEST_ROUND,
  FATAL_TITLE,
  getClearRating,
  getMoralRating,
  getSettlement,
  getTitle,
  normalizeMoralTag,
  parseResponseText,
  pickEventForRound,
  rejectionNotes,
  resolveRound,
  rollLuck,
  SCORE_FAIL_TITLE,
  tallyMoral,
  TAINTED_CLEAR_TITLES,
  titleForScore,
  validateCharacterConfig,
} from '../js/rules.js';

// ─── 迷你測試框架（不需要安裝任何套件） ──────────────────────

const results = [];
function test(name, fn) {
  try {
    fn();
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

// ─── 測試資料 ─────────────────────────────────────────────────

const CLERK = {
  id: 'clerk',
  milestones: [
    { id: 'm_supplies', weight: 20, recoverable: true, skipPartial: true },
    { id: 'm_contact', weight: 25, recoverable: true, skipPartial: false },
    { id: 'm_transport', weight: 25, recoverable: true, skipPartial: false },
    {
      id: 'm_arrive',
      weight: 30,
      recoverable: false,
      skipPartial: false,
      requires: { partial: { m_transport: 'done' }, done: { m_contact: 'done' } },
    },
  ],
  stats: { calm: 50, intel: 40, execution: 60 },
  supplyCaps: { water: 10, food: 10, medicine: 5, power_bank: 3 },
  timePerRound: [1, 2, 2, 3, 3, 4, 4],
  initialWorld: {
    location: 'loc_store',
    supplies: { water: 1, food: 1, medicine: 0, power_bank: 0, phone_battery: 40 },
    family: { contact: 'none', meeting_point: 'loc_home_clerk' },
    transportation: { mode: 'walk', owned: ['walk'], fuel: 0 },
    information: { confirmed: [], unconfirmed: [] },
    environment: { order: 'tense', notes: [] },
  },
};

const OFFICE = {
  ...CLERK,
  id: 'office',
  milestones: [
    { id: 'm_intel', weight: 20, recoverable: true, skipPartial: true },
    { id: 'm_contact', weight: 25, recoverable: true, skipPartial: false },
    { id: 'm_transport', weight: 25, recoverable: true, skipPartial: false },
    {
      id: 'm_evacuate',
      weight: 30,
      recoverable: false,
      skipPartial: false,
      requires: { partial: { m_transport: 'done' }, done: { m_contact: 'done' } },
    },
  ],
  stats: { calm: 50, intel: 60, execution: 40 },
};

const EVENT_LIST = [
  { id: 'ev_rumor', type: 'info', characters: ['clerk', 'office'], round_range: [1, 3], max_risk: 'minor', can_be_fatal: false },
  { id: 'ev_rush', type: 'supply', characters: ['clerk'], round_range: [1, 3], max_risk: 'major', can_be_fatal: false,
    condition: (world) => world.location === 'loc_store' },
  { id: 'ev_mrt_stop', type: 'transport', characters: ['office'], round_range: [1, 4], max_risk: 'major', can_be_fatal: false },
  { id: 'ev_blackout', type: 'supply', characters: ['clerk', 'office'], round_range: [2, 5], max_risk: 'major', can_be_fatal: false },
  { id: 'ev_neighbor', type: 'social', characters: ['clerk', 'office'], round_range: [3, 6], max_risk: 'minor', can_be_fatal: false },
  { id: 'ev_crowd', type: 'safety', characters: ['clerk', 'office'], round_range: [3, 6], max_risk: 'major', can_be_fatal: true },
  { id: 'ev_checkpoint', type: 'safety', characters: ['clerk', 'office'], round_range: [4, 7], max_risk: 'major', can_be_fatal: true },
];
const EVENTS = Object.fromEntries(EVENT_LIST.map((e) => [e.id, e]));

const LOCATIONS = {
  loc_store: { characters: ['clerk'], power: true, items: ['water', 'food', 'medicine', 'power_bank'],
    neighbors: [{ to: 'loc_street_c', modes: ['walk'] }] },
  loc_street_c: { characters: ['clerk'], items: [],
    neighbors: [
      { to: 'loc_store', modes: ['walk'] },
      { to: 'loc_shelter', modes: ['walk'] },
      { to: 'loc_home_clerk', modes: ['scooter'] },
    ] },
  loc_shelter: { characters: ['clerk'], items: ['water'], neighbors: [{ to: 'loc_street_c', modes: ['walk'] }] },
  loc_home_clerk: { characters: ['clerk'], items: [], neighbors: [{ to: 'loc_street_c', modes: ['walk', 'scooter'] }] },
  loc_office: { characters: ['office'], items: ['water', 'power_bank'], neighbors: [] },
};

const OPTIONS = [
  { text: '先穩住', style: 'steady' },
  { text: '先打聽', style: 'intel' },
  { text: '直接衝', style: 'bold' },
];

/** 產生一份合法的 AI 回應，再用 overrides 覆蓋 */
function resp(overrides = {}) {
  return {
    narrative: '測試敘事'.repeat(25),
    milestone_updates: [],
    performance: 'neutral',
    risk_event: { level: 'none', event_id: null },
    score_reason: '測試理由',
    stat_changes: { calm: 0, intel: 0, execution: 0 },
    world_state_changes: [],
    round_summary: '測試摘要',
    options: OPTIONS,
    ...overrides,
  };
}

const ms = (id, status, reason = '劇情依據') => ({ id, status, reason });
const risk = (level, eventId = null) => ({ level, event_id: eventId });

/** 建立指定狀態的局面（直接覆蓋欄位，方便測單一案例） */
function stateWith(character, patch = {}) {
  const s = createInitialState({ gameId: 'test', character });
  Object.assign(s, patch);
  if (patch.milestones) s.milestones = { ...s.milestones, ...patch.milestones };
  const score = computeScore(s.milestones, character.milestones, s.P, s.R);
  return Object.assign(s, { M: score.M, scoreRaw: score.raw, scoreDisplay: score.display });
}

function play(state, response, character, extra = {}) {
  const result = resolveRound(state, response, {
    round: state.round,
    character,
    locations: LOCATIONS,
    currentEvent: null,
    fallbackOptions: OPTIONS,
    ...extra,
  });
  return result;
}

// ─── 第十六章 16.2：25 個計分與規則案例 ──────────────────────

test('#1 三個里程碑 done、第四個 partial，S_raw = 102 → 顯示 99 並鎖定', () => {
  const s = computeScore(
    { m_supplies: 'done', m_contact: 'done', m_transport: 'done', m_arrive: 'partial' },
    CLERK.milestones, 22, -5,
  );
  eq([s.raw, s.display, s.locked], [102, 99, true]);
});

test('#2 四個里程碑全部 done → 顯示 100、通關、依 P + R 給評級', () => {
  const s = stateWith(CLERK, {
    round: 6,
    milestones: { m_supplies: 'done', m_contact: 'done', m_transport: 'done', m_arrive: 'partial' },
    P: 20, R: -5,
  });
  const r = play(s, resp({ milestone_updates: [ms('m_arrive', 'done')], performance: 'good' }), CLERK);
  eq([r.state.scoreDisplay, r.state.status, r.state.endType, r.record.symbol], [100, 'cleared', 'clear', '🏆']);
  eq(getClearRating(r.state).grade, 'A', '評級');
});

test('#3 S_raw = −25 → 提前失敗（新門檻），稱號「亂世砲灰第一排」', () => {
  const s = stateWith(CLERK, { round: 3, P: -20, R: 0 });
  const r = play(s, resp({ performance: 'poor' }), CLERK);
  eq([r.state.scoreRaw, r.state.status, r.state.endType, r.record.symbol], [-25, 'failed', 'score', '💀']);
  eq(getTitle(r.state), SCORE_FAIL_TITLE);
});

test('#4 S_raw = −24 → 繼續遊戲', () => {
  const s = stateWith(CLERK, { round: 3, P: -19, R: 0 });
  const r = play(s, resp({ performance: 'poor' }), CLERK);
  eq([r.state.scoreRaw, r.state.status, r.state.round], [-24, 'playing', 4]);
});

test('#5 經授權的 fatal，當時分數 84 → 立即失敗，fatal 專屬稱號', () => {
  const s = stateWith(CLERK, {
    round: 6,
    milestones: { m_supplies: 'done', m_contact: 'done', m_transport: 'done' },
    P: 19, R: -5,
  });
  eq(s.scoreDisplay, 84, '前置分數');
  const r = play(s, resp({ performance: 'poor', risk_event: risk('fatal', 'ev_checkpoint') }), CLERK,
    { currentEvent: EVENTS.ev_checkpoint });
  eq([r.state.status, r.state.endType, r.state.scoreDisplay, r.record.symbol], ['failed', 'fatal', 84, '💀']);
  eq(getTitle(r.state), FATAL_TITLE);
});

test('#6 fatal 但本回合無事件 → 降為 minor', () => {
  eq(authorizeRisk(risk('fatal', 'ev_crowd'), null, []).level, 'minor');
});

test('#7 fatal 但事件 can_be_fatal = false、max_risk = major → 降為 major', () => {
  eq(authorizeRisk(risk('fatal', 'ev_blackout'), EVENTS.ev_blackout, []).level, 'major');
});

test('#8 同一 event_id 第二次回傳 major → 最終為 none', () => {
  eq(authorizeRisk(risk('major', 'ev_rush'), EVENTS.ev_rush, ['ev_rush']).level, 'none');
});

test('#9 里程碑 partial → done（權重 25）→ M 從 12 補足到 25', () => {
  const before = computeScore({ m_contact: 'partial' }, CLERK.milestones, 0, 0).M;
  const { milestones } = applyMilestoneUpdates(
    { m_supplies: 'none', m_contact: 'partial', m_transport: 'none', m_arrive: 'none' },
    [ms('m_contact', 'done')], CLERK.milestones, 'none',
  );
  eq([before, computeScore(milestones, CLERK.milestones, 0, 0).M], [12, 25]);
});

test('#10 里程碑 done → lost，本回合有經授權 major → 扣除該里程碑全部分數', () => {
  const s = stateWith(CLERK, { round: 3, milestones: { m_contact: 'done' } });
  const r = play(s, resp({ milestone_updates: [ms('m_contact', 'lost')], risk_event: risk('major', 'ev_blackout') }),
    CLERK, { currentEvent: EVENTS.ev_blackout });
  eq([r.state.milestones.m_contact, r.record.score.before.raw - r.state.M], ['lost', 25]);
  eq(r.state.R, -15, 'R');
});

test('#11 里程碑 done → lost，本回合風險只有 minor → 拒絕', () => {
  const r = applyMilestoneUpdates({ m_contact: 'done' }, [ms('m_contact', 'lost')], CLERK.milestones, 'minor');
  eq([r.milestones.m_contact, r.rejected[0].reason], ['done', 'lost_requires_major_risk']);
});

test('#12 不可跳過的里程碑 none → done → 拒絕', () => {
  const r = applyMilestoneUpdates({ m_contact: 'none' }, [ms('m_contact', 'done')], CLERK.milestones, 'none');
  eq(r.rejected[0].reason, 'cannot_skip_partial');
});

test('#13 不可恢復的里程碑 lost → partial → 拒絕，標記無法通關', () => {
  const start = { m_supplies: 'none', m_contact: 'done', m_transport: 'done', m_arrive: 'lost' };
  const r = applyMilestoneUpdates(start, [ms('m_arrive', 'partial')], CLERK.milestones, 'none');
  eq(r.rejected[0].reason, 'not_recoverable');
  const s = stateWith(CLERK, { round: 4, milestones: start });
  const played = play(s, resp(), CLERK);
  eq(played.state.unwinnable, true, 'unwinnable');
});

test('#14 m_arrive → partial，但 m_transport 不是 done → 拒絕', () => {
  const r = applyMilestoneUpdates({ m_transport: 'partial', m_arrive: 'none' }, [ms('m_arrive', 'partial')],
    CLERK.milestones, 'none');
  eq(r.rejected[0].reason, 'prerequisite_partial');
});

test('#15 同一回合 3 個里程碑前進 → 只接受陣列中前 2 個', () => {
  const r = applyMilestoneUpdates(
    { m_supplies: 'none', m_contact: 'none', m_transport: 'none', m_arrive: 'none' },
    [ms('m_supplies', 'partial'), ms('m_contact', 'partial'), ms('m_transport', 'partial')],
    CLERK.milestones, 'none',
  );
  eq(r.applied.map((a) => a.id), ['m_supplies', 'm_contact']);
  eq(r.rejected[0].reason, 'advance_limit');
});

test('#16 本局第 5 次 excellent → 仍為 excellent（次數無上限）', () => {
  const r = applyPerformance('excellent', { excellent: 4, freeExcellent: 0 }, false);
  eq([r.applied, r.points, r.note], ['excellent', 5, null]);
});

test('#17 自由行動第 3 次 excellent → 仍為 excellent（次數無上限）', () => {
  const r = applyPerformance('excellent', { excellent: 2, freeExcellent: 2 }, true);
  eq([r.applied, r.note], ['excellent', null]);
});

test('#16b computeScore 包含道德罰分：cruel 2 + selfish 1 → Moral = −32，raw 正確', () => {
  const milestones = { m_supplies: 'none', m_contact: 'none', m_transport: 'none', m_arrive: 'none' };
  const r = computeScore(milestones, CLERK.milestones, 15, 0, { cruel: 2, selfish: 1 });
  eq(r.Moral, -32); // cruel 2×(-14)=-28, selfish 1×(-4)=-4
  eq(r.raw, -17);  // 0 + 15 + 0 + (-32)
});

test('#17b authorizeRiskByDice：eventForced=true + AI 給 none → 保底 minor', () => {
  const dice = { riskCeiling: 'major', eventForced: true };
  const r = authorizeRiskByDice({ level: 'none' }, dice);
  eq(r.level, 'minor');
});

test('#18 同一回合重複提交 → 不重複計分', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK });
  const first = play(s, resp({ performance: 'excellent' }), CLERK);
  const again = resolveRound(first.state, resp({ performance: 'excellent' }), {
    round: 1, character: CLERK, locations: LOCATIONS, fallbackOptions: OPTIONS,
  });
  eq([again.duplicate, again.state.P, again.state === first.state], [true, 5, true]);
});

test('#19 world op：水 2 瓶時 remove 100 → 拒絕該項，其餘照常套用', () => {
  const world = { ...CLERK.initialWorld, supplies: { ...CLERK.initialWorld.supplies, water: 2 } };
  const r = applyWorldStateChanges(world, [
    { op: 'remove', path: 'supplies.water', value: 100 },
    { op: 'add', path: 'supplies.food', value: 1 },
  ], { supplyCaps: CLERK.supplyCaps, locations: LOCATIONS, characterId: 'clerk' });
  eq([r.world.supplies.water, r.world.supplies.food, r.rejected[0].reason], [2, 2, 'below_zero']);
});

test('#20 world op：add 目前地點沒有的物品 → 拒絕', () => {
  const world = { ...CLERK.initialWorld, location: 'loc_street_c' };
  const r = applyWorldStateChanges(world, [{ op: 'add', path: 'supplies.water', value: 1 }],
    { supplyCaps: CLERK.supplyCaps, locations: LOCATIONS, characterId: 'clerk' });
  eq(r.rejected[0].reason, 'item_not_available');
});

test('#21 risk level 為 "critical" → 整份拒絕，狀態不變', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK });
  const r = play(s, resp({ risk_event: risk('critical') }), CLERK);
  eq([r.ok, r.error, r.state === s], [false, 'schema', true]);
});

test('#22 AI 逾時（沒有回應）→ 狀態保留', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK });
  const r = play(s, null, CLERK);
  eq([r.ok, r.state === s, s.round], [false, true, 1]);
});

test('#23 ΔS_raw > 0 且風險 minor → 軌跡 🟡', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK });
  const r = play(s, resp({ performance: 'excellent', risk_event: risk('minor') }), CLERK);
  eq([r.record.score.deltaRaw, r.record.symbol], [0, '🟡']);
  const s2 = createInitialState({ gameId: 'test', character: CLERK });
  const r2 = play(s2, resp({ milestone_updates: [ms('m_supplies', 'partial')], risk_event: risk('minor') }), CLERK);
  eq([r2.record.score.deltaRaw, r2.record.symbol], [5, '🟡']);
});

test('#24 第 7 回合結束，S_display = −10 → 一般結算，以 0 分判定稱號', () => {
  const s = stateWith(CLERK, { round: 7, P: -10, R: 0 });
  const r = play(s, resp(), CLERK);
  eq([r.state.status, r.state.endType, r.state.scoreDisplay], ['ended', 'normal', -10]);
  eq(getTitle(r.state), titleForScore(0));
});

test('#25 stat_changes 回傳 +5 → 截斷為 +2（即 +10），能力值仍限 0～100', () => {
  const r = applyStatChanges({ calm: 95, intel: 40, execution: 60 }, { calm: 5, intel: -5, execution: 1.7 });
  eq(r.applied, { calm: 2, intel: -2, execution: 1 });
  eq(r.stats, { calm: 100, intel: 30, execution: 65 });
});

// ─── 第十一章：三條測試劇本逐回合比對 ────────────────────────

/** 逐回合執行劇本，並比對每回合的 M、P、R、S_raw、顯示分數與符號 */
function runScript(character, steps) {
  let state = createInitialState({ gameId: 'script', character });
  steps.forEach((step, i) => {
    const r = play(state, resp(step.response), character, {
      currentEvent: step.event ? EVENTS[step.event] : null,
    });
    ok(r.ok, `第 ${i + 1} 回合應該成功（${r.error}）`);
    const a = r.record.score.after;
    eq([a.M, a.P, a.R, a.raw, a.display, r.record.symbol], step.expect, `第 ${i + 1} 回合 [M,P,R,raw,顯示,符號]`);
    state = r.state;
  });
  return state;
}

test('11.3 通關測試劇本（店員）：99 分鎖定後第 7 回合通關', () => {
  const state = runScript(CLERK, [
    { response: { milestone_updates: [ms('m_supplies', 'partial')], performance: 'good' },
      expect: [10, 2, 0, 12, 12, '🟢'] },
    { response: { milestone_updates: [ms('m_supplies', 'done'), ms('m_contact', 'partial')], performance: 'excellent' },
      expect: [32, 7, 0, 39, 39, '🟢'] },
    { event: 'ev_rush', response: { performance: 'neutral', risk_event: risk('minor', 'ev_rush') },
      expect: [32, 7, -5, 34, 34, '🔴'] },
    { response: { milestone_updates: [ms('m_contact', 'done'), ms('m_transport', 'partial')], performance: 'excellent' },
      expect: [57, 12, -5, 64, 64, '🟢'] },
    { event: 'ev_neighbor', response: { milestone_updates: [ms('m_transport', 'done')], performance: 'excellent' },
      expect: [70, 17, -5, 82, 82, '🟢'] },
    { response: { milestone_updates: [ms('m_arrive', 'partial')], performance: 'excellent' },
      expect: [85, 22, -5, 102, 99, '🟢'] },
    { response: { milestone_updates: [ms('m_arrive', 'done')], performance: 'good' },
      expect: [100, 24, -5, 119, 100, '🏆'] },
  ]);
  eq([state.endType, state.endRound, state.counters.excellent], ['clear', 7, 4]);
  eq(getClearRating(state), { grade: 'A', total: 19, badges: [] });
  eq(state.trajectory.join(''), '🟢🟢🔴🟢🟢🟢🏆');
});

test('11.4 失敗測試劇本 A（上班族）：分數 ≤ −30 提前失敗', () => {
  const state = runScript(OFFICE, [
    { event: 'ev_rumor', response: { performance: 'poor', risk_event: risk('minor', 'ev_rumor') },
      expect: [0, -5, -5, -10, -10, '🔴'] },
    { event: 'ev_mrt_stop', response: { milestone_updates: [ms('m_intel', 'partial')], performance: 'poor',
      risk_event: risk('major', 'ev_mrt_stop') },
      expect: [10, -10, -20, -20, -20, '🔴'] },
    { event: 'ev_blackout', response: { milestone_updates: [ms('m_intel', 'lost')], performance: 'poor',
      risk_event: risk('major', 'ev_blackout') },
      expect: [0, -15, -35, -50, -50, '💀'] },
  ]);
  eq([state.endType, state.endRound], ['score', 3]);
  eq(getTitle(state), SCORE_FAIL_TITLE);
});

test('11.5 失敗測試劇本 B（店員）：84 分時 fatal，稱號不看分數', () => {
  const state = runScript(CLERK, [
    { response: { milestone_updates: [ms('m_supplies', 'done')], performance: 'excellent' },
      expect: [20, 5, 0, 25, 25, '🟢'] },
    { response: { milestone_updates: [ms('m_contact', 'partial')], performance: 'good' },
      expect: [32, 7, 0, 39, 39, '🟢'] },
    { event: 'ev_rush', response: { milestone_updates: [ms('m_contact', 'done')], performance: 'good',
      risk_event: risk('minor', 'ev_rush') },
      expect: [45, 9, -5, 49, 49, '🟡'] },
    { response: { milestone_updates: [ms('m_transport', 'partial')], performance: 'excellent' },
      expect: [57, 14, -5, 66, 66, '🟢'] },
    { response: { milestone_updates: [ms('m_transport', 'done')], performance: 'excellent' },
      expect: [70, 19, -5, 84, 84, '🟢'] },
    { event: 'ev_checkpoint', response: { performance: 'poor', risk_event: risk('fatal', 'ev_checkpoint') },
      expect: [70, 19, -5, 84, 84, '💀'] },
  ]);
  eq([state.endType, state.endRound, state.scoreDisplay], ['fatal', 6, 84]);
  eq(getTitle(state), FATAL_TITLE);
});

// ─── 其他規則 ─────────────────────────────────────────────────

test('軌跡：有 major 風險時，即使分數上升也是 🔴', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK });
  const r = play(s, resp({
    milestone_updates: [ms('m_supplies', 'partial'), ms('m_contact', 'partial')],
    performance: 'excellent',
    risk_event: risk('major', 'ev_rush'),
  }), CLERK, { currentEvent: EVENTS.ev_rush });
  eq([r.record.score.deltaRaw, r.record.symbol], [12, '🔴']);
});

test('風險：無事件的回合最高只有 minor', () => {
  eq(authorizeRisk(risk('major'), null, []).level, 'minor');
});

test('風險：事件 max_risk 為 minor 時，major 降為 minor', () => {
  eq(authorizeRisk(risk('major', 'ev_rumor'), EVENTS.ev_rumor, []).level, 'minor');
});

test('里程碑：done → lost 沒有 reason → 拒絕', () => {
  const r = applyMilestoneUpdates({ m_contact: 'done' }, [{ id: 'm_contact', status: 'lost', reason: ' ' }],
    CLERK.milestones, 'major');
  eq(r.rejected[0].reason, 'lost_requires_reason');
});

test('里程碑：不存在的 id 與非法狀態 → 拒絕', () => {
  const r = applyMilestoneUpdates({}, [ms('m_fake', 'done'), ms('m_contact', 'finished')], CLERK.milestones, 'none');
  eq(r.rejected.map((x) => x.reason), ['unknown_id', 'invalid_status']);
});

test('里程碑：前置條件以回合開始時為準，不能同回合連鎖', () => {
  const r = applyMilestoneUpdates(
    { m_supplies: 'done', m_contact: 'done', m_transport: 'partial', m_arrive: 'none' },
    [ms('m_transport', 'done'), ms('m_arrive', 'partial')], CLERK.milestones, 'none',
  );
  eq([r.milestones.m_transport, r.milestones.m_arrive], ['done', 'none']);
});

test('世界狀態：步行可到相鄰地點；沒油的機車不能走機車路線', () => {
  const world = { ...CLERK.initialWorld, location: 'loc_street_c' };
  const ctx = { supplyCaps: CLERK.supplyCaps, locations: LOCATIONS, characterId: 'clerk' };
  eq(applyWorldStateChanges(world, [{ op: 'set', path: 'location', value: 'loc_shelter' }], ctx).world.location,
    'loc_shelter');
  const noFuel = { ...world, transportation: { mode: 'scooter', owned: ['walk', 'scooter'], fuel: 0 } };
  eq(applyWorldStateChanges(noFuel, [{ op: 'set', path: 'location', value: 'loc_home_clerk' }], ctx).rejected[0].reason,
    'no_fuel');
  eq(applyWorldStateChanges(world, [{ op: 'set', path: 'location', value: 'loc_office' }], ctx).rejected[0].reason,
    'location_not_for_character');
});

test('世界狀態：手機電量只有先消耗行動電源才能上升', () => {
  const world = { ...CLERK.initialWorld, location: 'loc_street_c',
    supplies: { ...CLERK.initialWorld.supplies, power_bank: 1 } };
  const ctx = { supplyCaps: CLERK.supplyCaps, locations: LOCATIONS, characterId: 'clerk' };
  eq(applyWorldStateChanges(world, [{ op: 'set', path: 'supplies.phone_battery', value: 90 }], ctx)
    .rejected[0].reason, 'battery_cannot_increase');
  const r = applyWorldStateChanges(world, [
    { op: 'remove', path: 'supplies.power_bank', value: 1 },
    { op: 'set', path: 'supplies.phone_battery', value: 90 },
  ], ctx);
  eq([r.world.supplies.power_bank, r.world.supplies.phone_battery, r.rejected.length], [0, 90, 0]);
});

test('世界狀態：單回合單品項最多 +3、不得超過上限', () => {
  const ctx = { supplyCaps: CLERK.supplyCaps, locations: LOCATIONS, characterId: 'clerk' };
  const r = applyWorldStateChanges(CLERK.initialWorld, [
    { op: 'add', path: 'supplies.water', value: 2 },
    { op: 'add', path: 'supplies.water', value: 2 },
  ], ctx);
  eq([r.world.supplies.water, r.rejected[0].reason], [3, 'add_limit']);
});

test('世界狀態：資訊必須先是傳聞才能確認；聯絡狀態不能無故退步', () => {
  const ctx = { supplyCaps: CLERK.supplyCaps, locations: LOCATIONS, characterId: 'clerk' };
  const r = applyWorldStateChanges(CLERK.initialWorld, [
    { op: 'add', path: 'information.confirmed', value: '橋梁封閉' },
    { op: 'add', path: 'information.unconfirmed', value: '橋梁封閉' },
    { op: 'add', path: 'information.confirmed', value: '橋梁封閉' },
  ], ctx);
  eq(r.rejected.map((x) => x.reason), ['information_not_obtained']);
  eq(r.world.information, { confirmed: ['橋梁封閉'], unconfirmed: [] });

  const contacted = { ...CLERK.initialWorld, family: { contact: 'confirmed', meeting_point: 'loc_home_clerk' } };
  eq(applyWorldStateChanges(contacted, [{ op: 'set', path: 'family.contact', value: 'none' }], ctx).rejected[0].reason,
    'contact_cannot_regress');
  eq(applyWorldStateChanges(contacted, [{ op: 'set', path: 'family.contact', value: 'contacted' }],
    { ...ctx, currentEvent: EVENTS.ev_rumor }).world.family.contact, 'contacted');
});

test('世界狀態：白名單以外的路徑一律拒絕', () => {
  const r = applyWorldStateChanges(CLERK.initialWorld, [
    { op: 'set', path: 'milestones.m_arrive', value: 'done' },
    { op: 'set', path: 'scoreRaw', value: 100 },
  ], { supplyCaps: CLERK.supplyCaps, locations: LOCATIONS });
  eq(r.rejected.map((x) => x.reason), ['unknown_path', 'unknown_path']);
});

test('選項不合法時改用備援選項', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK });
  const r = play(s, resp({ options: [{ text: 'A', style: 'steady' }, { text: 'B', style: 'steady' }] }), CLERK);
  eq(r.record.options.usedFallback, true);
});

test('回應中的分數欄位一律忽略', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK });
  const r = play(s, resp({ score: 100, scoreRaw: 100 }), CLERK);
  eq(r.state.scoreRaw, 0);
});

test('parseResponseText：可去除 ```json 圍欄，壞掉的 JSON 回傳 null', () => {
  eq(parseResponseText('```json\n{"a":1}\n```'), { a: 1 });
  eq(parseResponseText('不是 JSON'), null);
});

test('rejectionNotes：被拒絕的項目會整理成下一回合的提示', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK });
  const r = play(s, resp({ milestone_updates: [ms('m_contact', 'done')] }), CLERK);
  ok(rejectionNotes(r.record).some((n) => n.includes('cannot_skip_partial')));
});

// ─── 6.3 事件抽取 ─────────────────────────────────────────────

/** 固定種子的亂數產生器，讓抽取結果可重現 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('drawEvents：500 個種子都符合 6.3 的所有規則', () => {
  for (const character of ['clerk', 'office']) {
    for (let seed = 1; seed <= 500; seed += 1) {
      const schedule = drawEvents(EVENT_LIST, character, seeded(seed));
      const label = `${character} seed=${seed}`;
      ok(schedule.length >= 2 && schedule.length <= 3, `${label} 數量`);
      ok(new Set(schedule.map((s) => s.eventId)).size === schedule.length, `${label} 不重複`);
      ok(new Set(schedule.map((s) => s.round)).size === schedule.length, `${label} 不同回合`);
      ok(schedule.some((s) => s.round >= 3 && s.round <= 5), `${label} 第 3～5 回合`);
      ok(schedule.filter((s) => EVENTS[s.eventId].can_be_fatal).length <= 1, `${label} 可致命事件`);
      for (const s of schedule) {
        const ev = EVENTS[s.eventId];
        ok(ev.characters.includes(character), `${label} 角色`);
        ok(s.round >= ev.round_range[0] && s.round <= ev.round_range[1], `${label} 回合範圍`);
      }
    }
  }
});

test('pickEventForRound：條件不成立時延後，超出範圍就取消', () => {
  const away = { world: { location: 'loc_street_c' }, milestones: {} };
  let schedule = [{ eventId: 'ev_rush', round: 2, status: 'pending' }];
  let r = pickEventForRound(schedule, 2, away, EVENTS);
  eq([r.event, r.schedule[0].round, r.schedule[0].status], [null, 3, 'pending']);
  r = pickEventForRound(r.schedule, 3, away, EVENTS);
  eq(r.schedule[0].status, 'cancelled');

  schedule = [{ eventId: 'ev_rush', round: 2, status: 'pending' }];
  r = pickEventForRound(schedule, 2, { world: { location: 'loc_store' }, milestones: {} }, EVENTS);
  eq([r.event.id, r.schedule[0].status], ['ev_rush', 'fired']);
});

test('validateCharacterConfig：正確設定通過；權重錯誤會被抓出來', () => {
  eq(validateCharacterConfig(CLERK, EVENT_LIST), []);
  const broken = { ...CLERK, milestones: CLERK.milestones.map((m, i) => (i === 0 ? { ...m, weight: 10 } : m)) };
  ok(validateCharacterConfig(broken, []).some((e) => e.includes('權重總和')));
});

// ─── 改版1：命運骰與道德後果（AI 動態模式） ──────────────────

const fixed = (v) => () => v;
const dice = (riskCeiling) => ({ roll: 0.5, tier: 'test', riskCeiling, eventForced: false });
const DYN = { flow: 'dynamic' };

test('rollLuck：各區間對應正確等級與風險上限', () => {
  const at = (v, round = 5) => rollLuck(fixed(v), { round });
  eq([at(0).tier, at(0).riskCeiling, at(0).eventForced], ['disaster', 'fatal', true]);
  eq([at(0.049).tier, at(0.05).tier], ['disaster', 'bad']);
  eq([at(0.1).riskCeiling, at(0.1).eventForced], ['major', true]);
  eq([at(0.2).tier, at(0.2).riskCeiling, at(0.2).eventForced], ['neutral', 'minor', false]);
  eq([at(0.8).tier, at(0.8).riskCeiling], ['good', 'none']);
  eq([at(0.99).tier, at(0.99).riskCeiling], ['great', 'none']);
});

test('rollLuck：前兩回合 disaster 封頂為 major，第 3 回合起才可能 fatal', () => {
  eq(rollLuck(fixed(0), { round: 1 }).riskCeiling, 'major');
  eq(rollLuck(fixed(0), { round: 2 }).riskCeiling, 'major');
  eq(rollLuck(fixed(0), { round: FATAL_EARLIEST_ROUND }).riskCeiling, 'fatal');
});

test('authorizeRiskByDice：只降不升，未超過上限原樣通過', () => {
  const r1 = authorizeRiskByDice(risk('fatal'), dice('minor'));
  eq([r1.proposed, r1.level, r1.downgraded, r1.notes], ['fatal', 'minor', true, ['over_dice_ceiling']]);
  const r2 = authorizeRiskByDice(risk('none'), dice('fatal'));
  eq([r2.level, r2.downgraded], ['none', false]);
  const r3 = authorizeRiskByDice(risk('major'), dice('major'));
  eq([r3.level, r3.downgraded, r3.eventId], ['major', false, null]);
  eq(authorizeRiskByDice(risk('minor'), dice('none')).level, 'none');
  eq(authorizeRiskByDice(risk('critical'), dice('fatal')).level, 'none');
  eq(authorizeRiskByDice(risk('major'), undefined).level, 'minor');
});

test('resolveRound dynamic：骰子上限取代事件授權（無事件也能 major）', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK, flow: 'dynamic' });
  eq(s.flow, 'dynamic');
  const r = play(s, resp({ risk_event: risk('major') }), CLERK, { ...DYN, dice: dice('major') });
  eq([r.record.risk.level, r.state.R, r.state.chargedEvents], ['major', -15, []]);
  const r2 = play(s, resp({ risk_event: risk('fatal') }), CLERK, { ...DYN, dice: dice('minor') });
  eq([r2.record.risk.level, r2.state.status], ['minor', 'playing']);
});

test('resolveRound classic：同樣的回應仍走事件授權（無事件 major → minor）', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK });
  eq(s.flow, 'classic');
  const r = play(s, resp({ risk_event: risk('major'), moral_tag: 'cruel' }), CLERK, { dice: dice('fatal') });
  eq([r.record.risk.level, r.record.moral, r.state.counters.cruel], ['minor', undefined, undefined]);
});

test('tallyMoral / getMoralRating：門檻判斷，無效標籤視為 none', () => {
  let c = { excellent: 0 };
  c = tallyMoral(c, 'selfish');
  eq([c.selfish, getMoralRating(c)], [1, 'clean']);
  c = tallyMoral(c, 'selfish');
  eq(getMoralRating(c), 'selfish');
  c = tallyMoral(c, 'cruel');
  eq([c.cruel, getMoralRating(c), c.excellent], [1, 'ruthless', 0]);
  eq(tallyMoral({ selfish: 1 }, 'evil!!'), { selfish: 1 });
  eq(normalizeMoralTag(undefined), 'none');
});

test('resolveRound dynamic：moral_tag 累計到 counters，致命回合也照算', () => {
  const s = createInitialState({ gameId: 'test', character: CLERK, flow: 'dynamic' });
  const r = play(s, resp({ moral_tag: 'selfish' }), CLERK, { ...DYN, dice: dice('none') });
  eq([r.record.moral, r.state.counters.selfish], ['selfish', 1]);
  const late = stateWith(CLERK, { flow: 'dynamic', round: 4 });
  const f = play(late, resp({ moral_tag: 'cruel', risk_event: risk('fatal') }), CLERK, { ...DYN, dice: dice('fatal') });
  eq([f.state.endType, f.record.frozen, f.state.counters.cruel], ['fatal', true, 1]);
});

test('通關但手段不乾淨 → 分數仍 100，稱號改用 TAINTED_CLEAR_TITLES', () => {
  const allDone = { m_supplies: 'done', m_contact: 'done', m_transport: 'done', m_arrive: 'done' };
  const base = { endType: 'clear', scoreDisplay: 100, P: 10, R: 0, endRound: 7, trajectory: [], milestones: allDone, stats: {} };
  eq(getTitle({ ...base, counters: {} }), titleForScore(100));
  eq(getTitle({ ...base, counters: { selfish: 2 } }), TAINTED_CLEAR_TITLES.selfish);
  const st = getSettlement({ ...base, counters: { cruel: 1 } });
  eq([st.score, st.title, st.moral], [100, TAINTED_CLEAR_TITLES.ruthless, 'ruthless']);
  eq(getTitle({ ...base, endType: 'fatal', counters: { cruel: 3 } }), FATAL_TITLE);
});

// ─── 輸出結果（Node 與瀏覽器都能用） ─────────────────────────

const failed = results.filter((r) => !r.ok);
const lines = results.map((r) => (r.ok ? `✅ ${r.name}` : `❌ ${r.name}\n   → ${r.error}`));
const summary = `\n共 ${results.length} 項，通過 ${results.length - failed.length} 項，失敗 ${failed.length} 項`;

if (typeof document !== 'undefined') {
  const out = document.getElementById('out');
  out.textContent = lines.join('\n') + summary;
  document.title = failed.length ? `❌ ${failed.length} 項失敗` : '✅ 全部通過';
} else {
  console.log(lines.join('\n') + summary);
  if (failed.length && typeof process !== 'undefined') process.exitCode = 1;
}

export { results };
