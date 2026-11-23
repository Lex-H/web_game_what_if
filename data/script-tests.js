/**
 * 三條測試劇本（開發文檔 11.3～11.5）。
 *
 * - 固定事件排程，不隨機抽取（11.2）。
 * - 每回合的回應與玩家選哪個選項無關：不論點哪個選項，數值都必須與表格一致。
 * - expect 為表格的 [M, P, R, S_raw, S_display, 符號]；engine.test.js 與
 *   開發者模式的「劇本比對」會逐回合檢查。
 */

const OPTIONS = [
  { text: '穩健：先穩住局面再說', style: 'steady' },
  { text: '情報：先打聽清楚狀況', style: 'intel' },
  { text: '冒險：直接採取行動', style: 'bold' },
];

const ms = (id, status, reason = '測試劇本依據') => ({ id, status, reason });
const risk = (level, eventId = null) => ({ level, event_id: eventId });

/** 測試劇本的回應：只填會影響數值的欄位，其餘用固定值 */
function response(round, fields) {
  return {
    narrative: `【測試劇本】第 ${round} 回合。這是固定的測試敘事，用來驗證計分引擎、里程碑狀態機與回合軌跡是否與開發文檔第十一章的表格完全一致。`,
    milestone_updates: [],
    performance: 'neutral',
    risk_event: risk('none'),
    score_reason: '測試劇本固定數值',
    stat_changes: { calm: 0, intel: 0, execution: 0 },
    world_state_changes: [],
    round_summary: `測試第 ${round} 回合`,
    options: OPTIONS,
    ...fields,
  };
}

function build(def) {
  return {
    ...def,
    rounds: def.rounds.map((r, i) => ({
      opening: `【測試劇本】第 ${i + 1} 回合開始。${r.note ?? ''}`,
      options: OPTIONS,
      response: response(i + 1, r.response),
      expect: r.expect,
    })),
  };
}

export const TEST_SCRIPTS = Object.freeze({
  test_clear: build({
    id: 'test_clear',
    title: '通關測試劇本（超商夜班店員，11.3）',
    characterId: 'clerk',
    schedule: [
      { eventId: 'ev_rush', round: 3, status: 'pending' },
      { eventId: 'ev_neighbor', round: 5, status: 'pending' },
    ],
    expectedEnd: { endType: 'clear', endRound: 7, grade: 'A', trajectory: '🟢🟢🔴🟢🟢🟢🏆' },
    rounds: [
      { response: { milestone_updates: [ms('m_supplies', 'partial')], performance: 'good' },
        expect: [10, 2, 0, 12, 12, '🟢'] },
      { response: { milestone_updates: [ms('m_supplies', 'done'), ms('m_contact', 'partial')], performance: 'excellent' },
        expect: [32, 7, 0, 39, 39, '🟢'] },
      { note: '搶購人潮湧入。', response: { performance: 'neutral', risk_event: risk('minor', 'ev_rush') },
        expect: [32, 7, -5, 34, 34, '🔴'] },
      { response: { milestone_updates: [ms('m_contact', 'done'), ms('m_transport', 'partial')], performance: 'excellent' },
        expect: [57, 12, -5, 64, 64, '🟢'] },
      { note: '有人請求分享物資，你選擇分享。',
        response: { milestone_updates: [ms('m_transport', 'done')], performance: 'excellent' },
        expect: [70, 17, -5, 82, 82, '🟢'] },
      { response: { milestone_updates: [ms('m_arrive', 'partial')], performance: 'excellent' },
        expect: [85, 22, -5, 102, 99, '🟢'] },
      { response: { milestone_updates: [ms('m_arrive', 'done')], performance: 'good' },
        expect: [100, 24, -5, 119, 100, '🏆'] },
    ],
  }),

  test_fail_score: build({
    id: 'test_fail_score',
    title: '失敗測試劇本 A：分數失敗（一般上班族，11.4）',
    characterId: 'office',
    schedule: [
      { eventId: 'ev_rumor', round: 1, status: 'pending' },
      { eventId: 'ev_mrt_stop', round: 2, status: 'pending' },
      { eventId: 'ev_blackout', round: 3, status: 'pending' },
    ],
    expectedEnd: { endType: 'score', endRound: 3, title: '亂世砲灰第一排', trajectory: '🔴🔴💀' },
    rounds: [
      { note: '群組消息互相矛盾。', response: { performance: 'poor', risk_event: risk('minor', 'ev_rumor') },
        expect: [0, -5, -5, -10, -10, '🔴'] },
      { note: '捷運與公車停駛。',
        response: { milestone_updates: [ms('m_intel', 'partial')], performance: 'poor', risk_event: risk('major', 'ev_mrt_stop') },
        expect: [10, -10, -20, -20, -20, '🔴'] },
      { note: '區域停電。',
        response: { milestone_updates: [ms('m_intel', 'lost')], performance: 'poor', risk_event: risk('major', 'ev_blackout') },
        expect: [0, -15, -35, -50, -50, '💀'] },
    ],
  }),

  test_fail_fatal: build({
    id: 'test_fail_fatal',
    title: '失敗測試劇本 B：fatal（超商夜班店員，11.5）',
    characterId: 'clerk',
    schedule: [
      { eventId: 'ev_rush', round: 3, status: 'pending' },
      { eventId: 'ev_checkpoint', round: 6, status: 'pending' },
    ],
    expectedEnd: { endType: 'fatal', endRound: 6, score: 84, title: '倒在黎明前的孤勇者', trajectory: '🟢🟢🟡🟢🟢💀' },
    rounds: [
      { response: { milestone_updates: [ms('m_supplies', 'done')], performance: 'excellent' },
        expect: [20, 5, 0, 25, 25, '🟢'] },
      { response: { milestone_updates: [ms('m_contact', 'partial')], performance: 'good' },
        expect: [32, 7, 0, 39, 39, '🟢'] },
      { note: '搶購人潮湧入。',
        response: { milestone_updates: [ms('m_contact', 'done')], performance: 'good', risk_event: risk('minor', 'ev_rush') },
        expect: [45, 9, -5, 49, 49, '🟡'] },
      { response: { milestone_updates: [ms('m_transport', 'partial')], performance: 'excellent' },
        expect: [57, 14, -5, 66, 66, '🟢'] },
      { response: { milestone_updates: [ms('m_transport', 'done')], performance: 'excellent' },
        expect: [70, 19, -5, 84, 84, '🟢'] },
      { note: '前方道路出現管制點。（請選「冒險」以符合表格情境；任何選項結果都相同）',
        response: { performance: 'poor', risk_event: risk('fatal', 'ev_checkpoint') },
        expect: [70, 19, -5, 84, 84, '💀'] },
    ],
  }),
});

export const TEST_SCRIPT_COMMENTS = Object.freeze({
  personal_comment: '測試劇本結算：數值比對用的固定評語',
  highlight_round: 1,
  highlight_action: '測試劇本固定的關鍵行動',
});
