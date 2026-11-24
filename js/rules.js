/**
 * What If — 遊戲規則引擎（rules.js）
 *
 * 對應《開發文檔》：
 *   第三章 計分系統、第四章 狀態機、第五章 世界狀態驗證、
 *   6.3 事件抽取、7.5 AI 回應格式、第八章 稱號 / 評級 / 軌跡。
 *
 * 設計原則：
 *   - 全部是純函式：不讀寫 DOM、不呼叫網路、不使用全域變數。
 *     前端與 Cloudflare Worker 共用同一份檔案（見 10.6、14.1）。
 *   - 不修改傳入的物件，一律回傳新物件。
 *   - AI 的建議只會被「拒絕」或「降級」，絕不會被升級。
 */

export const RULES_VERSION = '2.2.0';

// ─── 常數（數字來源見文件章節） ────────────────────────────────

export const MAX_ROUNDS = 7; // 第六章
export const FAIL_SCORE = -25; // 3.4：S_raw ≤ −25 提前失敗
export const UNFINISHED_SCORE_CAP = 99; // 3.4：未全部完成時顯示上限
export const CLEAR_SCORE = 100;
export const MORAL_PENALTY_CRUEL = -14; // 每次 cruel 行為的分數代價
export const MORAL_PENALTY_SELFISH = -4; // 每次 selfish 行為的分數代價
export const MAX_ADVANCES_PER_ROUND = 2; // 4.1：每回合最多 2 個里程碑前進
export const STAT_DELTA_LIMIT = 2; // 7.5：stat_changes 範圍 −2～+2
export const STAT_STEP = 5; // 8.2：前端乘以 5
export const STAT_MIN = 0;
export const STAT_MAX = 100;
export const SUPPLY_ADD_LIMIT_PER_ROUND = 3; // 5.3：單回合單品項最多 +3
export const UNCONFIRMED_MAX = 8; // 5.3
export const NOTES_MAX = 5; // 5.3
export const SHORT_TEXT_MAX = 30; // 5.3：傳聞與備註 30 字內
export const OPTION_TEXT_MAX = 40; // 6.6：選項 40 字內
export const NARRATIVE_MIN = 60; // 7.5
export const NARRATIVE_MAX = 220; // 7.5
export const SCORE_REASON_MAX = 40; // 7.5
export const ROUND_SUMMARY_MAX = 30; // 7.5

export const PERFORMANCE_POINTS = Object.freeze({ excellent: 5, good: 2, neutral: 0, poor: -5 });
export const RISK_LEVELS = Object.freeze(['none', 'minor', 'major', 'fatal']);
export const RISK_POINTS = Object.freeze({ none: 0, minor: -5, major: -15, fatal: 0 });
export const MILESTONE_STATUSES = Object.freeze(['none', 'partial', 'done', 'lost']);
export const OPTION_STYLES = Object.freeze(['steady', 'intel', 'bold']);
export const EVENT_TYPES = Object.freeze(['info', 'supply', 'transport', 'social', 'safety']);
export const CONTACT_LEVELS = Object.freeze(['none', 'contacted', 'confirmed']);
export const ORDER_LEVELS = Object.freeze(['normal', 'tense', 'chaotic']);
export const TRANSPORT_MODES = Object.freeze(['walk', 'scooter', 'mrt', 'bus', 'car', 'convoy', 'helicopter']);
export const STAT_KEYS = Object.freeze(['calm', 'intel', 'execution']);

/** 需要燃料的交通方式，以及燃料存放的位置 */
export const FUEL_SOURCE = Object.freeze({
  scooter: 'transportation', // transportation.fuel（0～100）
  car: 'transportation',
  convoy: 'supplies', // supplies.fuel（副總統）
  helicopter: 'supplies',
});

/** 4.4 回合軌跡符號 */
export const SYMBOLS = Object.freeze({
  clear: '🏆',
  fail: '💀',
  danger: '🔴',
  progress: '🟢',
  neutral: '🟡',
});

/** 4.3 回合結果：continue 進入下一回合；其餘為結局類型 */
export const OUTCOMES = Object.freeze(['continue', 'clear', 'fatal', 'score', 'normal']);

/** 8.1 稱號 */
export const FATAL_TITLE = '倒在黎明前的孤勇者';
export const SCORE_FAIL_TITLE = '亂世砲灰第一排';
export const SCORE_TITLES = Object.freeze([
  { min: 100, title: '時代劇本的終極破局者' },
  { min: 90, title: '只差半步封神的傳奇玩家' },
  { min: 80, title: '逆風翻盤的局勢操盤手' },
  { min: 70, title: '風暴裡的冷靜算計師' },
  { min: 60, title: '擦邊球倖存者' },
  { min: 40, title: '倒在終點線前的悲劇主角' },
  { min: 0, title: '亂世砲灰第一排' },
]);

// ─── 小工具 ────────────────────────────────────────────────────

const riskRank = (level) => RISK_LEVELS.indexOf(level);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
/** 以字元（而非 UTF-16 code unit）計算長度，中文與 emoji 都算 1 */
export const textLength = (s) => [...String(s)].length;
const clone = (v) => structuredClone(v);
const grantsOf = (ctx) => ctx?.currentEvent?.grants ?? {};

// ─── 3.1～3.4 計分 ────────────────────────────────────────────

/** 單一里程碑得分：partial 為權重 ÷ 2 無條件捨去 */
export function milestoneScore(weight, status) {
  if (status === 'done') return weight;
  if (status === 'partial') return Math.floor(weight / 2);
  return 0;
}

/** M：四個里程碑當下狀態的分數總和（每回合重算，不累加） */
export function computeMilestoneScore(milestones, defs) {
  return defs.reduce((sum, def) => sum + milestoneScore(def.weight, milestones[def.id]), 0);
}

export function allMilestonesDone(milestones, defs) {
  return defs.every((def) => milestones[def.id] === 'done');
}

/** 不可恢復的里程碑已 lost → 本局無法通關（4.1） */
export function isUnwinnable(milestones, defs) {
  return defs.some((def) => milestones[def.id] === 'lost' && !def.recoverable);
}

/**
 * S_raw = M + P + R + Moral；S_display 在全部完成時為 100，否則最高 99（3.4）。
 * 負分照實保留，稱號判定時才以 0 計算。
 * counters 含 cruel / selfish 計數，計算道德代價（AI 動態模式才有，classic 傳空物件）。
 */
export function computeScore(milestones, defs, P, R, counters = {}) {
  const M = computeMilestoneScore(milestones, defs);
  const Moral = (counters.cruel ?? 0) * MORAL_PENALTY_CRUEL
              + (counters.selfish ?? 0) * MORAL_PENALTY_SELFISH;
  const raw = M + P + R + Moral;
  const cleared = allMilestonesDone(milestones, defs);
  const display = cleared ? CLEAR_SCORE : Math.min(raw, UNFINISHED_SCORE_CAP);
  return { M, P, R, Moral, raw, display, cleared, locked: !cleared && raw > UNFINISHED_SCORE_CAP };
}

// ─── 4.2 風險授權與降級 ───────────────────────────────────────

/**
 * 依 4.2 由上而下判定，只降級不升級。
 * @param {{level:string, event_id?:string|null}} risk AI 建議
 * @param {object|null} currentEvent 本回合事件（無事件為 null）
 * @param {string[]} chargedEvents 本局已扣過分的事件 id
 * @returns {{proposed:string, level:string, eventId:string|null, downgraded:boolean, notes:string[]}}
 *   eventId 只有在風險實際綁定本回合事件時才有值，呼叫端用它更新 chargedEvents。
 */
export function authorizeRisk(risk, currentEvent, chargedEvents = []) {
  const proposed = RISK_LEVELS.includes(risk?.level) ? risk.level : 'none';
  const eventId = risk?.event_id ?? null;
  const bound = Boolean(currentEvent) && eventId === currentEvent.id;
  const charged = new Set(chargedEvents);
  const notes = [];
  let level = proposed;

  if (level === 'fatal') {
    if (bound && currentEvent.can_be_fatal === true) {
      return { proposed, level, eventId, downgraded: false, notes };
    }
    // 降為該事件允許的最高等級；沒有綁定事件時最高只有 minor（6.3）
    const cap = bound ? currentEvent.max_risk : 'minor';
    level = riskRank(cap) >= riskRank('major') ? 'major' : cap;
    notes.push(bound ? 'fatal_not_allowed_by_event' : 'fatal_without_event');
  }

  if (level === 'major') {
    const allowed = bound && riskRank(currentEvent.max_risk) >= riskRank('major') && !charged.has(eventId);
    if (!allowed) {
      level = 'minor';
      if (!bound) notes.push('major_without_event');
      else if (charged.has(eventId)) notes.push('event_already_charged');
      else notes.push('major_not_allowed_by_event');
    }
  }

  if (level === 'minor' && eventId && charged.has(eventId)) {
    level = 'none';
    notes.push('event_already_charged');
  }

  if (level === 'minor' && bound && riskRank(currentEvent.max_risk) < riskRank('minor')) {
    level = 'none';
    notes.push('minor_not_allowed_by_event');
  }

  return {
    proposed,
    level,
    eventId: level !== 'none' && bound ? eventId : null,
    downgraded: level !== proposed,
    notes,
  };
}

// ─── 改版1 §3.1 命運骰（AI 動態模式） ────────────────────────

export const FLOWS = Object.freeze(['classic', 'dynamic']);

/** roll 落在 [前一級 max, max) 即為該級；玩家看不到任何數值 */
export const LUCK_TIERS = Object.freeze([
  { id: 'disaster', max: 0.05, riskCeiling: 'fatal', eventForced: true },
  { id: 'bad', max: 0.2, riskCeiling: 'major', eventForced: true },
  { id: 'neutral', max: 0.75, riskCeiling: 'minor', eventForced: false },
  { id: 'good', max: 0.95, riskCeiling: 'none', eventForced: false },
  { id: 'great', max: 1, riskCeiling: 'none', eventForced: false },
]);

/** 前兩回合就暴斃太不公平：disaster 在此之前封頂為 major */
export const FATAL_EARLIEST_ROUND = 3;

export function rollLuck(rng = Math.random, { round = 1 } = {}) {
  const roll = rng();
  const tier = LUCK_TIERS.find((t) => roll < t.max) ?? LUCK_TIERS.at(-1);
  const riskCeiling = tier.riskCeiling === 'fatal' && round < FATAL_EARLIEST_ROUND ? 'major' : tier.riskCeiling;
  return { roll, tier: tier.id, riskCeiling, eventForced: tier.eventForced };
}

/** 骰子決定本回合風險上限，AI 的建議只降不升；eventForced=true 時保底 minor */
export function authorizeRiskByDice(risk, dice) {
  const proposed = RISK_LEVELS.includes(risk?.level) ? risk.level : 'none';
  const ceiling = RISK_LEVELS.includes(dice?.riskCeiling) ? dice.riskCeiling : 'minor';
  const over = riskRank(proposed) > riskRank(ceiling);
  let level = over ? ceiling : proposed;
  // eventForced=true 時引擎強制至少 minor，AI 給 none 一律升為 minor
  if (dice?.eventForced && riskRank(level) < riskRank('minor')) level = 'minor';
  return { proposed, level, eventId: null, downgraded: over, notes: over ? ['over_dice_ceiling'] : [] };
}

// ─── 改版1 §3.2 道德後果（AI 動態模式） ──────────────────────

export const MORAL_TAGS = Object.freeze(['none', 'selfish', 'cruel']);
export const SELFISH_THRESHOLD = 2;
export const CRUEL_THRESHOLD = 1;

/** 通關但手段不乾淨：分數照算，稱號不美化 */
export const TAINTED_CLEAR_TITLES = Object.freeze({
  selfish: '活下來了，但最好別問怎麼活下來的',
  ruthless: '踩著別人的肩膀笑著抵達終點',
});

export const normalizeMoralTag = (tag) => (MORAL_TAGS.includes(tag) ? tag : 'none');

export function tallyMoral(counters, tag) {
  const t = normalizeMoralTag(tag);
  if (t === 'none') return { ...counters };
  const key = t === 'cruel' ? 'cruel' : 'selfish';
  return { ...counters, [key]: (counters?.[key] ?? 0) + 1 };
}

/** @returns {'clean'|'selfish'|'ruthless'} */
export function getMoralRating(counters) {
  if ((counters?.cruel ?? 0) >= CRUEL_THRESHOLD) return 'ruthless';
  if ((counters?.selfish ?? 0) >= SELFISH_THRESHOLD) return 'selfish';
  return 'clean';
}

// ─── 4.1 里程碑狀態轉移 ───────────────────────────────────────

function prerequisitesMet(def, stage, milestones) {
  const required = def.requires?.[stage];
  if (!required) return true;
  return Object.entries(required).every(([id, status]) => milestones[id] === status);
}

/**
 * 檢查單一轉移是否合法。前置條件以「回合開始時」的里程碑狀態判斷，
 * 避免同一回合內連鎖完成（例如同回合 m_transport → done 又讓 m_arrive → partial）。
 * @returns {{ok:true, advance:boolean} | {ok:false, reason:string}}
 */
export function checkMilestoneTransition(def, from, to, milestonesAtStart, riskLevel, reason) {
  if (!MILESTONE_STATUSES.includes(to)) return { ok: false, reason: 'invalid_status' };

  if (to === 'lost') {
    if (from === 'lost') return { ok: false, reason: 'already_lost' };
    if (riskRank(riskLevel) < riskRank('major')) return { ok: false, reason: 'lost_requires_major_risk' };
    if (!isNonEmptyString(reason)) return { ok: false, reason: 'lost_requires_reason' };
    return { ok: true, advance: false };
  }

  if (to === 'none') return { ok: false, reason: 'cannot_regress' };

  if (to === 'partial') {
    if (from === 'done') return { ok: false, reason: 'cannot_regress' };
    if (from === 'lost' && !def.recoverable) return { ok: false, reason: 'not_recoverable' };
    if (!prerequisitesMet(def, 'partial', milestonesAtStart)) return { ok: false, reason: 'prerequisite_partial' };
    return { ok: true, advance: true };
  }

  // to === 'done'
  if (from === 'lost') return { ok: false, reason: 'lost_must_recover_first' };
  if (from === 'none') {
    if (!def.skipPartial) return { ok: false, reason: 'cannot_skip_partial' };
    if (!prerequisitesMet(def, 'partial', milestonesAtStart)) return { ok: false, reason: 'prerequisite_partial' };
  }
  if (!prerequisitesMet(def, 'done', milestonesAtStart)) return { ok: false, reason: 'prerequisite_done' };
  return { ok: true, advance: true };
}

/**
 * 套用 AI 的 milestone_updates，逐項驗證（4.1）。
 * 狀態沒有變化的項目直接忽略，不算拒絕。
 */
export function applyMilestoneUpdates(milestonesAtStart, updates, defs, riskLevel) {
  const defById = Object.fromEntries(defs.map((def) => [def.id, def]));
  const milestones = { ...milestonesAtStart };
  const applied = [];
  const rejected = [];
  const touched = new Set();
  let advances = 0;

  (Array.isArray(updates) ? updates : []).forEach((update, index) => {
    const reject = (reason) => rejected.push({ index, update, reason });
    if (!update || typeof update !== 'object') return reject('malformed');
    const def = defById[update.id];
    if (!def) return reject('unknown_id');
    if (!MILESTONE_STATUSES.includes(update.status)) return reject('invalid_status');
    if (touched.has(update.id)) return reject('already_changed_this_round');

    const from = milestonesAtStart[update.id];
    const to = update.status;
    if (from === to) return undefined;

    const check = checkMilestoneTransition(def, from, to, milestonesAtStart, riskLevel, update.reason);
    if (!check.ok) return reject(check.reason);
    if (check.advance && advances >= MAX_ADVANCES_PER_ROUND) return reject('advance_limit');

    if (check.advance) advances += 1;
    touched.add(update.id);
    milestones[update.id] = to;
    applied.push({ id: update.id, from, to, reason: update.reason ?? '' });
    return undefined;
  });

  return { milestones, applied, rejected };
}

// ─── 3.2 表現分 ───────────────────────────────────────────────

/** 套用表現評價；excellent 次數無上限（3.2） */
export function applyPerformance(proposed, counters, isFreeAction = false) {
  const next = { excellent: 0, freeExcellent: 0, ...counters };
  let applied = proposed;
  let note = null;

  if (proposed === 'excellent') {
    next.excellent += 1;
    if (isFreeAction) next.freeExcellent += 1;
  }

  return {
    proposed,
    applied,
    points: PERFORMANCE_POINTS[applied],
    downgraded: applied !== proposed,
    note,
    counters: next,
  };
}

// ─── 8.2 能力值 ───────────────────────────────────────────────

/** AI 回傳 −2～+2，超出截斷；前端乘以 5 後套用，能力值限 0～100 */
export function applyStatChanges(stats, changes) {
  const next = { ...stats };
  const applied = {};
  const clamped = [];

  for (const key of STAT_KEYS) {
    const raw = changes?.[key];
    const step = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    const bounded = clamp(step, -STAT_DELTA_LIMIT, STAT_DELTA_LIMIT);
    if (raw !== undefined && (!Number.isFinite(raw) || bounded !== raw)) clamped.push(key);
    applied[key] = bounded;
    next[key] = clamp((next[key] ?? 0) + bounded * STAT_STEP, STAT_MIN, STAT_MAX);
  }

  return { stats: next, applied, clamped };
}

// ─── 6.6 三選一 ───────────────────────────────────────────────

/** 恰好 3 個、三種風格各一、每個 40 字內；不符時改用備援選項 */
export function sanitizeOptions(options, fallbackOptions = []) {
  const valid =
    Array.isArray(options) &&
    options.length === 3 &&
    options.every(
      (o) =>
        o &&
        isNonEmptyString(o.text) &&
        textLength(o.text.trim()) <= OPTION_TEXT_MAX &&
        OPTION_STYLES.includes(o.style),
    ) &&
    new Set(options.map((o) => o.style)).size === 3;

  if (valid) {
    return { options: options.map((o) => ({ text: o.text.trim(), style: o.style })), usedFallback: false };
  }
  return { options: clone(fallbackOptions), usedFallback: true };
}

// ─── 第五章 世界狀態差異操作 ──────────────────────────────────

function nextNumber(current, op) {
  if (!Number.isInteger(op.value) || op.value < 0) return { error: 'invalid_value' };
  if (op.op === 'add') return { value: current + op.value };
  if (op.op === 'remove') return { value: current - op.value };
  return { value: op.value };
}

function opSupply(w, item, op, ctx, roundState) {
  const caps = ctx.supplyCaps ?? {};
  if (!item || !Object.hasOwn(caps, item)) return 'unknown_item';
  const current = w.supplies?.[item] ?? 0;
  const n = nextNumber(current, op);
  if (n.error) return n.error;
  if (n.value < 0) return 'below_zero';
  if (n.value > caps[item]) return 'over_cap';

  const delta = n.value - current;
  if (delta > 0) {
    const here = ctx.locations?.[w.location];
    const available = (here?.items ?? []).includes(item) || (grantsOf(ctx).supplies ?? []).includes(item);
    if (!available) return 'item_not_available';
    const added = (roundState.added[item] ?? 0) + delta;
    if (added > SUPPLY_ADD_LIMIT_PER_ROUND) return 'add_limit';
    roundState.added[item] = added;
  }

  w.supplies = { ...w.supplies, [item]: n.value };
  if (item === 'power_bank' && delta < 0) roundState.consumedPowerBank = true;
  return null;
}

/** 手機電量只能下降，除非同回合先消耗行動電源，或地點有電力 */
function opBattery(w, op, ctx, roundState) {
  const current = w.supplies?.phone_battery ?? 0;
  const n = nextNumber(current, op);
  if (n.error) return n.error;
  if (n.value < 0 || n.value > 100) return 'out_of_range';
  if (n.value > current) {
    const here = ctx.locations?.[w.location];
    if (!roundState.consumedPowerBank && !here?.power) return 'battery_cannot_increase';
  }
  w.supplies = { ...w.supplies, phone_battery: n.value };
  return null;
}

function opLocation(w, op, ctx) {
  if (op.op !== 'set') return 'invalid_op';
  const locations = ctx.locations ?? {};
  if (typeof op.value !== 'string' || !locations[op.value]) return 'unknown_location';
  const target = locations[op.value];
  if (Array.isArray(target.characters) && ctx.characterId && !target.characters.includes(ctx.characterId)) {
    return 'location_not_for_character';
  }
  if (op.value === w.location) return null;

  const edge = (locations[w.location]?.neighbors ?? []).find((e) => e.to === op.value);
  if (!edge) return 'not_adjacent';
  if ((edge.blockedBy ?? []).some((id) => (ctx.knownEvents ?? []).includes(id))) return 'route_blocked';

  if (!edge.modes.includes('walk')) {
    const mode = w.transportation?.mode;
    if (!edge.modes.includes(mode)) return 'transport_not_allowed';
    const fuelSource = FUEL_SOURCE[mode];
    if (fuelSource === 'transportation' && !((w.transportation?.fuel ?? 0) > 0)) return 'no_fuel';
    if (fuelSource === 'supplies' && !((w.supplies?.fuel ?? 0) > 0)) return 'no_fuel';
  }

  w.location = op.value;
  return null;
}

function opContact(w, op, ctx) {
  if (op.op !== 'set') return 'invalid_op';
  const nextIndex = CONTACT_LEVELS.indexOf(op.value);
  if (nextIndex < 0) return 'invalid_value';
  const currentIndex = CONTACT_LEVELS.indexOf(w.family?.contact ?? 'none');
  const regressAllowed = ['info', 'social'].includes(ctx.currentEvent?.type);
  if (nextIndex < currentIndex && !regressAllowed) return 'contact_cannot_regress';
  w.family = { ...w.family, contact: op.value };
  return null;
}

function opMeetingPoint(w, op, ctx) {
  if (op.op !== 'set') return 'invalid_op';
  if (typeof op.value !== 'string' || !ctx.locations?.[op.value]) return 'unknown_location';
  w.family = { ...w.family, meeting_point: op.value };
  return null;
}

function opTransportMode(w, op, ctx) {
  if (op.op !== 'set') return 'invalid_op';
  if (!TRANSPORT_MODES.includes(op.value)) return 'invalid_value';
  const owned = w.transportation?.owned ?? ['walk'];
  const here = ctx.locations?.[w.location];
  const obtainable =
    (here?.transport ?? []).includes(op.value) || (grantsOf(ctx).transport ?? []).includes(op.value);
  if (op.value !== 'walk' && !owned.includes(op.value) && !obtainable) return 'transport_not_available';
  const nextOwned = owned.includes(op.value) ? owned : [...owned, op.value];
  w.transportation = { ...w.transportation, mode: op.value, owned: nextOwned };
  return null;
}

function opFuel(w, op, ctx) {
  const current = w.transportation?.fuel ?? 0;
  const n = nextNumber(current, op);
  if (n.error) return n.error;
  if (n.value < 0 || n.value > 100) return 'out_of_range';
  if (n.value > current && !grantsOf(ctx).fuel) return 'fuel_cannot_increase';
  w.transportation = { ...w.transportation, fuel: n.value };
  return null;
}

function opConfirmed(w, op, ctx) {
  if (!isNonEmptyString(op.value)) return 'invalid_value';
  const confirmed = w.information?.confirmed ?? [];
  const unconfirmed = w.information?.unconfirmed ?? [];

  if (op.op === 'add') {
    const obtained = unconfirmed.includes(op.value) || (grantsOf(ctx).information ?? []).includes(op.value);
    if (!obtained) return 'information_not_obtained';
    w.information = {
      confirmed: confirmed.includes(op.value) ? confirmed : [...confirmed, op.value],
      unconfirmed: unconfirmed.filter((v) => v !== op.value),
    };
    return null;
  }
  if (op.op === 'remove') {
    if (!confirmed.includes(op.value)) return 'not_found';
    w.information = { confirmed: confirmed.filter((v) => v !== op.value), unconfirmed };
    return null;
  }
  return 'invalid_op';
}

function opUnconfirmed(w, op) {
  if (!isNonEmptyString(op.value)) return 'invalid_value';
  const confirmed = w.information?.confirmed ?? [];
  const unconfirmed = w.information?.unconfirmed ?? [];

  if (op.op === 'add') {
    if (textLength(op.value) > SHORT_TEXT_MAX) return 'text_too_long';
    w.information = { confirmed, unconfirmed: [...unconfirmed, op.value].slice(-UNCONFIRMED_MAX) };
    return null;
  }
  if (op.op === 'remove') {
    if (!unconfirmed.includes(op.value)) return 'not_found';
    w.information = { confirmed, unconfirmed: unconfirmed.filter((v) => v !== op.value) };
    return null;
  }
  return 'invalid_op';
}

function opOrder(w, op) {
  if (op.op !== 'set') return 'invalid_op';
  if (!ORDER_LEVELS.includes(op.value)) return 'invalid_value';
  w.environment = { ...w.environment, order: op.value };
  return null;
}

function opNotes(w, op) {
  if (op.op !== 'add') return 'invalid_op';
  if (!isNonEmptyString(op.value)) return 'invalid_value';
  if (textLength(op.value) > SHORT_TEXT_MAX) return 'text_too_long';
  const notes = w.environment?.notes ?? [];
  w.environment = { ...w.environment, notes: [...notes, op.value].slice(-NOTES_MAX) };
  return null;
}

/** 套用單一操作；合法時修改 draft 並回傳 null，不合法時不修改並回傳原因 */
function applyWorldOp(draft, op, ctx, roundState) {
  if (!op || typeof op !== 'object') return 'malformed';
  if (!['add', 'remove', 'set'].includes(op.op)) return 'invalid_op';
  if (typeof op.path !== 'string') return 'invalid_path';

  const parts = op.path.split('.');
  if (parts.length > 2) return 'unknown_path';
  const [root, key] = parts;

  switch (root) {
    case 'supplies':
      return key === 'phone_battery' ? opBattery(draft, op, ctx, roundState) : opSupply(draft, key, op, ctx, roundState);
    case 'location':
      return key === undefined ? opLocation(draft, op, ctx) : 'unknown_path';
    case 'family':
      if (key === 'contact') return opContact(draft, op, ctx);
      if (key === 'meeting_point') return opMeetingPoint(draft, op, ctx);
      return 'unknown_path';
    case 'transportation':
      if (key === 'mode') return opTransportMode(draft, op, ctx);
      if (key === 'fuel') return opFuel(draft, op, ctx);
      return 'unknown_path';
    case 'information':
      if (key === 'confirmed') return opConfirmed(draft, op, ctx);
      if (key === 'unconfirmed') return opUnconfirmed(draft, op);
      return 'unknown_path';
    case 'environment':
      if (key === 'order') return opOrder(draft, op);
      if (key === 'notes') return opNotes(draft, op);
      return 'unknown_path';
    default:
      return 'unknown_path';
  }
}

/**
 * 依序套用 world_state_changes，逐項驗證（5.3）。操作有先後關係：
 * 例如先 remove 行動電源，同回合才能讓手機電量上升；先 set 交通方式，才能用它移動。
 * @param {object} world 回合開始時的世界狀態
 * @param {Array} ops AI 回傳的差異操作
 * @param {{supplyCaps:object, locations:object, currentEvent?:object, characterId?:string, knownEvents?:string[]}} ctx
 */
export function applyWorldStateChanges(world, ops, ctx = {}) {
  const draft = clone(world);
  const applied = [];
  const rejected = [];
  const roundState = { added: {}, consumedPowerBank: false };

  (Array.isArray(ops) ? ops : []).forEach((op, index) => {
    const reason = applyWorldOp(draft, op, ctx, roundState);
    if (reason) rejected.push({ index, op, reason });
    else applied.push({ index, op });
  });

  return { world: draft, applied, rejected };
}

// ─── 7.5 AI 回應格式驗證 ──────────────────────────────────────

/** 去掉 ```json 圍欄後解析；失敗回傳 null（屬於「整份拒絕」） */
export function parseResponseText(text) {
  if (typeof text !== 'string') return null;
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const value = JSON.parse(stripped);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * 整份拒絕的判定（7.5）。只檢查「缺了就無法套用」的條件；
 * 個別項目的合法性由各 apply 函式處理。長度超出只產生警告。
 */
export function validateResponseSchema(response) {
  const errors = [];
  const warnings = [];
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return { ok: false, errors: ['not_object'], warnings };
  }
  const r = response;

  if (!isNonEmptyString(r.narrative)) errors.push('narrative_missing');
  if (!Array.isArray(r.milestone_updates)) errors.push('milestone_updates_missing');
  if (!Object.hasOwn(PERFORMANCE_POINTS, r.performance)) errors.push('performance_invalid');
  if (!r.risk_event || typeof r.risk_event !== 'object' || !RISK_LEVELS.includes(r.risk_event.level)) {
    errors.push('risk_level_invalid');
  }
  if (typeof r.score_reason !== 'string') errors.push('score_reason_missing');
  if (!r.stat_changes || typeof r.stat_changes !== 'object') errors.push('stat_changes_missing');
  if (!Array.isArray(r.world_state_changes)) errors.push('world_state_changes_missing');
  if (typeof r.round_summary !== 'string') errors.push('round_summary_missing');
  if (!Array.isArray(r.options)) errors.push('options_missing');

  if (isNonEmptyString(r.narrative)) {
    const len = textLength(r.narrative);
    if (len < NARRATIVE_MIN || len > NARRATIVE_MAX) warnings.push('narrative_length');
  }
  if (typeof r.score_reason === 'string' && textLength(r.score_reason) > SCORE_REASON_MAX) {
    warnings.push('score_reason_length');
  }
  if (typeof r.round_summary === 'string' && textLength(r.round_summary) > ROUND_SUMMARY_MAX) {
    warnings.push('round_summary_length');
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ─── 4.3 / 4.4 回合結果與軌跡 ─────────────────────────────────

/** 4.3：依序判定，命中即停 */
export function decideOutcome({ riskLevel, cleared, raw, round }) {
  if (riskLevel === 'fatal') return 'fatal';
  if (cleared) return 'clear';
  if (raw <= FAIL_SCORE) return 'score';
  if (round >= MAX_ROUNDS) return 'normal';
  return 'continue';
}

/** 4.4：每回合一個符號，使用 S_raw 的變化 */
export function trajectorySymbol({ outcome, riskLevel, deltaRaw }) {
  if (outcome === 'clear') return SYMBOLS.clear;
  if (outcome === 'fatal' || outcome === 'score') return SYMBOLS.fail;
  if (riskLevel === 'major') return SYMBOLS.danger;
  if (deltaRaw < 0) return SYMBOLS.danger;
  if (deltaRaw > 0 && riskLevel === 'none') return SYMBOLS.progress;
  return SYMBOLS.neutral;
}

// ─── 遊戲狀態 ─────────────────────────────────────────────────

/**
 * 建立一局的初始狀態。
 * @param {{gameId:string, character:object, scenarioId?:string, schedule?:Array}} params
 *   schedule 為 drawEvents() 的結果（5.1 的 scheduled_events，不傳給 AI）
 */
export function createInitialState({ gameId, character, scenarioId = null, schedule = [], flow = 'classic' }) {
  return {
    rulesVersion: RULES_VERSION,
    gameId,
    scenarioId,
    flow: FLOWS.includes(flow) ? flow : 'classic',
    characterId: character.id,
    status: 'playing', // playing | cleared | failed | ended
    endType: null, // clear | fatal | score | normal
    endRound: null,
    round: 1,
    currentTime: 0,
    milestones: Object.fromEntries(character.milestones.map((def) => [def.id, 'none'])),
    M: 0,
    P: 0,
    R: 0,
    Moral: 0,
    scoreRaw: 0,
    scoreDisplay: 0,
    locked: false,
    unwinnable: false,
    stats: { ...character.stats },
    counters: { excellent: 0, freeExcellent: 0 },
    chargedEvents: [],
    knownEvents: [],
    schedule: clone(schedule),
    world: clone(character.initialWorld ?? {}),
    trajectory: [],
    resolvedRounds: [],
    history: [],
  };
}

/**
 * 結算一個回合：驗證 AI 回應 → 授權風險 → 套用合法變更 → 計分 → 判定結果。
 *
 * @param {object} state 目前遊戲狀態（不會被修改）
 * @param {object|null} response 已解析的 AI 回應（見 parseResponseText）
 * @param {object} ctx
 * @param {number} ctx.round 這份回應所屬的回合，用於重複提交保護（3.6）
 * @param {object} ctx.character 角色設定（milestones、supplyCaps、timePerRound…）
 * @param {object} ctx.locations 地點表
 * @param {object|null} [ctx.currentEvent] 本回合事件
 * @param {boolean} [ctx.isFreeAction] 玩家本回合是否使用自由行動
 * @param {Array} [ctx.fallbackOptions] 選項不合法時的備援選項
 * @param {'classic'|'dynamic'} [ctx.flow] dynamic 時改用命運骰授權風險並累計 moral_tag
 * @param {object} [ctx.dice] rollLuck() 的結果（dynamic 才需要）
 * @returns {{ok:boolean, duplicate?:boolean, error?:string, errors?:string[], state:object, record?:object}}
 */
export function resolveRound(state, response, ctx) {
  const round = ctx?.round ?? state.round;

  // 3.6：同一回合重複提交 → 不重複計分，回傳原紀錄
  if (round < state.round || state.resolvedRounds.includes(round)) {
    return {
      ok: true,
      duplicate: true,
      state,
      record: state.history.find((h) => h.round === round) ?? null,
    };
  }
  if (state.status !== 'playing') return { ok: false, error: 'game_over', state };
  if (round !== state.round) return { ok: false, error: 'round_out_of_order', state };

  const schema = validateResponseSchema(response);
  if (!schema.ok) return { ok: false, error: 'schema', errors: schema.errors, state };

  const { character } = ctx;
  const defs = character.milestones;
  const event = ctx.currentEvent ?? null;
  const next = clone(state);
  const before = { raw: state.scoreRaw, display: state.scoreDisplay };

  const dynamic = ctx.flow === 'dynamic';
  const risk = dynamic
    ? authorizeRiskByDice(response.risk_event, ctx.dice)
    : authorizeRisk(response.risk_event, event, state.chargedEvents);
  if (risk.eventId && !next.chargedEvents.includes(risk.eventId)) next.chargedEvents.push(risk.eventId);
  if (event && !next.knownEvents.includes(event.id)) next.knownEvents.push(event.id);

  const record = {
    round,
    eventId: event?.id ?? null,
    actionType: ctx.isFreeAction ? 'free' : 'option',
    narrative: response.narrative,
    summary: response.round_summary,
    scoreReason: response.score_reason,
    risk,
    warnings: schema.warnings,
    frozen: false,
    milestones: { applied: [], rejected: [] },
    performance: null,
    stats: null,
    world: { applied: [], rejected: [] },
    options: { options: [], usedFallback: false },
  };

  if (risk.level === 'fatal') {
    // 依 11.5 失敗測試劇本 B：fatal 回合不套用本回合的其他變更，分數停在上一回合
    record.frozen = true;
  } else {
    const ms = applyMilestoneUpdates(state.milestones, response.milestone_updates, defs, risk.level);
    next.milestones = ms.milestones;
    record.milestones = { applied: ms.applied, rejected: ms.rejected };

    const perf = applyPerformance(response.performance, state.counters, Boolean(ctx.isFreeAction));
    next.counters = perf.counters;
    next.P += perf.points;
    record.performance = perf;

    next.R += RISK_POINTS[risk.level];

    const stats = applyStatChanges(state.stats, response.stat_changes);
    next.stats = stats.stats;
    record.stats = { applied: stats.applied, clamped: stats.clamped };

    const world = applyWorldStateChanges(state.world, response.world_state_changes, {
      supplyCaps: character.supplyCaps,
      locations: ctx.locations,
      currentEvent: event,
      characterId: character.id,
      knownEvents: next.knownEvents,
    });
    next.world = world.world;
    record.world = { applied: world.applied, rejected: world.rejected };

    record.options = sanitizeOptions(response.options, ctx.fallbackOptions);
  }

  if (dynamic) {
    // 致命回合的惡行一樣算數，所以放在 frozen 判斷之外
    record.dice = ctx.dice ?? null;
    record.moral = normalizeMoralTag(response.moral_tag);
    next.counters = tallyMoral(next.counters, record.moral);
  }

  const after = computeScore(next.milestones, defs, next.P, next.R, next.counters);
  Object.assign(next, {
    M: after.M,
    Moral: after.Moral,
    scoreRaw: after.raw,
    scoreDisplay: after.display,
    locked: after.locked,
    unwinnable: isUnwinnable(next.milestones, defs),
  });

  const outcome = decideOutcome({ riskLevel: risk.level, cleared: after.cleared, raw: after.raw, round });
  const deltaRaw = after.raw - before.raw;
  const symbol = trajectorySymbol({ outcome, riskLevel: risk.level, deltaRaw });

  record.score = {
    before,
    after: { M: after.M, P: after.P, R: after.R, raw: after.raw, display: after.display, locked: after.locked },
    deltaRaw,
    deltaDisplay: after.display - before.display,
  };
  record.symbol = symbol;
  record.outcome = outcome;

  next.resolvedRounds.push(round);
  next.trajectory.push(symbol);
  next.currentTime += character.timePerRound?.[round - 1] ?? 0;
  next.history.push(record);

  if (outcome === 'continue') {
    next.round = round + 1;
  } else {
    next.status = { clear: 'cleared', normal: 'ended' }[outcome] ?? 'failed';
    next.endType = outcome;
    next.endRound = round;
  }

  return { ok: true, duplicate: false, state: next, record };
}

/** 給下一回合 AI 上下文用：「上回合以下變更未生效」（5.3） */
export function rejectionNotes(record) {
  if (!record) return [];
  const notes = [];
  for (const r of record.milestones?.rejected ?? []) {
    notes.push(`里程碑 ${r.update?.id ?? '?'} → ${r.update?.status ?? '?'}（${r.reason}）`);
  }
  for (const r of record.world?.rejected ?? []) {
    notes.push(`${r.op?.op ?? '?'} ${r.op?.path ?? '?'} ${JSON.stringify(r.op?.value ?? null)}（${r.reason}）`);
  }
  if (record.risk?.downgraded) notes.push(`風險 ${record.risk.proposed} 降為 ${record.risk.level}`);
  if (record.performance?.downgraded) notes.push(`表現 ${record.performance.proposed} 降為 ${record.performance.applied}`);
  return notes;
}

// ─── 第八章 結算 ──────────────────────────────────────────────

/** 依分數查常規稱號；負分以 0 計算 */
export function titleForScore(score) {
  const s = Math.max(0, score);
  return SCORE_TITLES.find((t) => s >= t.min).title;
}

/** 8.1：fatal → 專屬稱號；分數失敗 → 亂世砲灰第一排；其他依 S_display */
export function getTitle(state) {
  if (state.endType === 'fatal') return FATAL_TITLE;
  if (state.endType === 'score') return SCORE_FAIL_TITLE;
  const moral = getMoralRating(state.counters);
  if (state.endType === 'clear' && moral !== 'clean') return TAINTED_CLEAR_TITLES[moral];
  return titleForScore(state.scoreDisplay);
}

/** 8.3：只有通關才有評級，依 P + R；額外徽章：無傷、速通 */
export function getClearRating(state) {
  if (state.endType !== 'clear') return null;
  const total = state.P + state.R;
  let grade = 'C';
  if (total >= 20) grade = 'S';
  else if (total >= 10) grade = 'A';
  else if (total >= 0) grade = 'B';
  const badges = [];
  if (state.R === 0) badges.push('no_damage');
  if (state.endRound <= 5) badges.push('speedrun');
  return { grade, total, badges };
}

/** 結算頁與分享卡需要的資料 */
export function getSettlement(state) {
  return {
    endType: state.endType,
    endRound: state.endRound,
    score: state.scoreDisplay,
    title: getTitle(state),
    rating: getClearRating(state),
    moral: getMoralRating(state.counters),
    trajectory: state.trajectory.join(''),
    milestones: { ...state.milestones },
    stats: { ...state.stats },
  };
}

// ─── 6.3 事件抽取 ─────────────────────────────────────────────

function shuffle(list, rng) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 開局抽 2～3 個事件（6.3）：不重複、排在不同回合、至少一個落在第 3～5 回合、
 * 最多一個可致命事件。rng 可注入，測試時用固定種子。
 * @returns {Array<{eventId:string, round:number, status:'pending'}>}
 */
export function drawEvents(pool, characterId, rng = Math.random, { maxAttempts = 500 } = {}) {
  const candidates = pool.filter((e) => e.characters.includes(characterId));
  if (candidates.length < 2) throw new Error('event_pool_too_small');

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const want = Math.min(candidates.length, rng() < 0.5 ? 2 : 3);
    const picked = [];
    let fatalCount = 0;
    for (const ev of shuffle(candidates, rng)) {
      if (picked.length >= want) break;
      if (ev.can_be_fatal && fatalCount >= 1) continue;
      picked.push(ev);
      if (ev.can_be_fatal) fatalCount += 1;
    }
    if (picked.length < 2) continue;

    const used = new Set();
    const schedule = [];
    let failed = false;
    for (const ev of picked) {
      const [lo, hi] = ev.round_range;
      const free = [];
      for (let r = lo; r <= Math.min(hi, MAX_ROUNDS); r += 1) if (!used.has(r)) free.push(r);
      if (free.length === 0) {
        failed = true;
        break;
      }
      const r = free[Math.floor(rng() * free.length)];
      used.add(r);
      schedule.push({ eventId: ev.id, round: r, status: 'pending' });
    }
    if (failed) continue;
    if (!schedule.some((s) => s.round >= 3 && s.round <= 5)) continue;
    return schedule.sort((a, b) => a.round - b.round);
  }
  throw new Error('event_draw_failed');
}

/**
 * 取得本回合要發生的事件（6.3）。condition 不成立時延後一回合；
 * 超出 round_range 或下一回合已有事件時取消。
 * @param {Array} schedule
 * @param {number} round
 * @param {{world:object, milestones:object}} snapshot 給 condition 函式判斷用
 * @param {Object<string, object>} eventsById
 * @returns {{event:object|null, schedule:Array, notes:string[]}}
 */
export function pickEventForRound(schedule, round, snapshot, eventsById) {
  const next = schedule.map((entry) => ({ ...entry }));
  const notes = [];
  const entry = next.find((e) => e.round === round && e.status === 'pending');
  if (!entry) return { event: null, schedule: next, notes };

  const event = eventsById[entry.eventId];
  if (!event) {
    entry.status = 'cancelled';
    notes.push(`${entry.eventId} 不存在，已取消`);
    return { event: null, schedule: next, notes };
  }

  const met = typeof event.condition !== 'function' || event.condition(snapshot.world, snapshot.milestones);
  if (met) {
    entry.status = 'fired';
    return { event, schedule: next, notes };
  }

  const target = round + 1;
  const occupied = next.some((e) => e !== entry && e.round === target && e.status === 'pending');
  if (target <= event.round_range[1] && target <= MAX_ROUNDS && !occupied) {
    entry.round = target;
    notes.push(`${event.id} 條件不成立，延後到第 ${target} 回合`);
  } else {
    entry.status = 'cancelled';
    notes.push(`${event.id} 條件不成立，已取消`);
  }
  return { event: null, schedule: next, notes };
}

// ─── 2.2 設定檔自我檢查 ───────────────────────────────────────

/** 設定檔載入時檢查；回傳錯誤清單，空陣列代表通過 */
export function validateCharacterConfig(character, events = []) {
  const errors = [];
  const ids = character.milestones.map((m) => m.id);

  if (character.milestones.length !== 4) errors.push(`${character.id}: 里程碑必須是 4 個`);
  const total = character.milestones.reduce((sum, m) => sum + m.weight, 0);
  if (total !== 100) errors.push(`${character.id}: 里程碑權重總和為 ${total}，必須是 100`);
  if (new Set(ids).size !== ids.length) errors.push(`${character.id}: 里程碑 id 重複`);

  for (const m of character.milestones) {
    for (const stage of ['partial', 'done']) {
      for (const ref of Object.keys(m.requires?.[stage] ?? {})) {
        if (!ids.includes(ref)) errors.push(`${character.id}.${m.id}: 前置條件引用不存在的 ${ref}`);
      }
    }
  }
  for (const key of STAT_KEYS) {
    const v = character.stats?.[key];
    if (!Number.isFinite(v) || v < STAT_MIN || v > STAT_MAX) errors.push(`${character.id}: 能力值 ${key} 不合法`);
  }
  if (!Array.isArray(character.timePerRound) || character.timePerRound.length !== MAX_ROUNDS) {
    errors.push(`${character.id}: timePerRound 必須有 ${MAX_ROUNDS} 個數字`);
  }

  for (const ev of events.filter((e) => e.characters.includes(character.id))) {
    if (!RISK_LEVELS.includes(ev.max_risk) || ev.max_risk === 'fatal') {
      errors.push(`${ev.id}: max_risk 必須是 none / minor / major`);
    }
    if (typeof ev.can_be_fatal !== 'boolean') errors.push(`${ev.id}: can_be_fatal 必須是布林值`);
    if (!EVENT_TYPES.includes(ev.type)) errors.push(`${ev.id}: type 不合法`);
    const [lo, hi] = ev.round_range ?? [];
    if (!(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && hi <= MAX_ROUNDS && lo <= hi)) {
      errors.push(`${ev.id}: round_range 不合法`);
    }
  }
  return errors;
}
