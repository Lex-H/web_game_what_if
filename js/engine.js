/**
 * 遊戲流程與狀態轉換（4.5、14.1）。
 *
 * GameController 把「AI 來源（api.js）→ 規則引擎（rules.js）→ 保存（state.js）」串起來。
 * 不讀寫 DOM：app.js 只呼叫這裡的方法，並在 onChange 時重新渲染，Node 也能直接測試。
 *
 * state.flow（玩法，開局後不變）：
 *   classic  劇本模式：劇本節點開場與選項、固定事件池；玩家行動（含自由輸入）有 Key 時送 AI 判定
 *   dynamic  AI 動態模式：AI 產生開場、選項與意外；送出行動前先擲命運骰決定風險上限，並累計道德紀錄
 *
 * state.phase（4.5 的流程狀態，寫入 LocalStorage）：
 *   awaiting_action  等待玩家行動
 *   awaiting_ai      等待 AI 回應（重新整理時視為中斷，進入 error，讓玩家重試）
 *   error            AI 失敗或整份拒絕：重試或取消重選（10.5）；不會偷換成劇本內容
 *   ended            遊戲結束，尚未取得結算評語
 *   settled          結算完成，可分享
 */
import {
  createInitialState,
  drawEvents,
  getSettlement,
  pickEventForRound,
  rejectionNotes,
  resolveRound,
  rollLuck,
  sanitizeOptions,
} from './rules.js';
import { CHARACTERS, DEFAULT_SCENARIO_ID, EVENT_LIST, EVENTS, LOCATIONS, SCENARIOS, fallbackOptions } from './scenarios.js';
import { clearGame, loadGame, randomId, saveGame } from './state.js';
import { SourceError, createTestScriptSource } from './api.js';

export const FREE_ACTION_MAX = 80; // 6.7
/** 7.6：要大於 api.js 的 PROVIDER_TIMEOUT_MS × 2，Grok 逾時後 Gemini 才有時間接手 */
export const AI_TIMEOUT_MS = 50000;

/** 控制字元、零寬字元與雙向文字控制字元（提示注入常用來藏指令） */
const isInvisibleOrControl = (cp) =>
  cp <= 0x1f ||
  (cp >= 0x7f && cp <= 0x9f) ||
  (cp >= 0x200b && cp <= 0x200f) ||
  (cp >= 0x2028 && cp <= 0x202e) ||
  (cp >= 0x2066 && cp <= 0x2069) ||
  cp === 0xfeff;

/** 6.7：移除控制字元與多餘空白，最多 80 字（以字元計） */
export function sanitizeFreeAction(text) {
  const cleaned = [...String(text ?? '')]
    .map((ch) => (isInvisibleOrControl(ch.codePointAt(0)) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return [...cleaned].slice(0, FREE_ACTION_MAX).join('');
}

export function optionAction(option, index) {
  return { type: 'option', index, style: option.style, text: option.text };
}

export function freeAction(text) {
  const clean = sanitizeFreeAction(text);
  return clean ? { type: 'free', text: clean } : null;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new SourceError('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const toError = (e) =>
  e instanceof SourceError ? { code: e.code, message: e.message } : { code: 'provider', message: String(e?.message ?? e) };

export class GameController {
  /**
   * @param {object} opts
   * @param {Storage} opts.storage
   * @param {{script:object, official:object, dev:object}} opts.sources 由 api.js 建立
   * @param {Object<string, object>} [opts.testScripts] data/script-tests.js 的 TEST_SCRIPTS
   * @param {(state:object|null)=>void} [opts.onChange] 每次狀態寫入後呼叫
   * @param {(name:string, fields:object)=>void} [opts.telemetry]
   * @param {()=>number} [opts.rng]
   * @param {()=>number} [opts.now]
   * @param {number} [opts.timeoutMs]
   */
  constructor({ storage, sources, testScripts = {}, onChange = () => {}, telemetry = () => {}, rng = Math.random, now = Date.now, timeoutMs = AI_TIMEOUT_MS }) {
    Object.assign(this, { storage, sources, testScripts, onChange, telemetry, rng, now, timeoutMs });
    this.state = null;
    this._testSource = null;
  }

  // ─── 保存 / 還原 ───────────────────────────────────────────

  /** 讀取尚未結算的上一局；等待 AI 時被重新整理 → 進入 error，保留待送出的行動 */
  restore() {
    const s = loadGame(this.storage);
    if (!s || s.settled) return null;
    if (s.phase === 'awaiting_ai') {
      s.phase = 'error';
      s.lastError = { code: 'interrupted', message: '上次的推演被中斷了' };
    }
    this.state = s;
    this._testSource = null;
    this.#save();
    return s;
  }

  abandon() {
    clearGame(this.storage);
    this.state = null;
    this._testSource = null;
    this.onChange(null);
  }

  #save() {
    saveGame(this.storage, this.state);
    this.onChange(this.state);
  }

  // ─── 查詢 ─────────────────────────────────────────────────

  get character() {
    return this.state ? CHARACTERS[this.state.characterId] : null;
  }

  get currentEvent() {
    return this.state?.currentEventId ? EVENTS[this.state.currentEventId] : null;
  }

  get lastRecord() {
    return this.state?.history?.at(-1) ?? null;
  }

  #sourceFor(mode) {
    const s = this.state;
    if (s?.testScriptId) {
      this._testSource ??= createTestScriptSource(this.testScripts[s.testScriptId]);
      return this._testSource;
    }
    return this.sources[mode] ?? this.sources.script;
  }

  // ─── 開局（1.2 第 1 步） ───────────────────────────────────

  /**
   * @param {{characterId?:string, scenarioId?:string, mode?:string, flow?:'classic'|'dynamic', testScriptId?:string}} params
   *   mode：AI 來源（script / dev / official）
   *   testScriptId：「強制 Mock 劇本」，只用於 classic，角色與事件排程由測試劇本決定
   * dynamic 的開場由 AI 產生；失敗時這局不成立，丟出 SourceError 讓畫面說明原因
   */
  async start({ characterId, scenarioId = DEFAULT_SCENARIO_ID, mode = 'script', flow = 'classic', testScriptId = '' } = {}) {
    const dynamic = flow === 'dynamic';
    const testScript = !dynamic && testScriptId ? this.testScripts[testScriptId] : null;
    if (!dynamic && testScriptId && !testScript) throw new Error(`unknown test script: ${testScriptId}`);
    const charId = testScript?.characterId ?? characterId;
    const character = CHARACTERS[charId];
    if (!character) throw new Error(`unknown character: ${charId}`);
    const scenario = SCENARIOS.find((s) => s.id === scenarioId && s.open);
    if (!scenario) throw new Error(`scenario not open: ${scenarioId}`);

    const schedule = dynamic ? [] : testScript ? testScript.schedule : drawEvents(EVENT_LIST, charId, this.rng);
    const base = createInitialState({ gameId: `g_${randomId(this.rng)}`, character, scenarioId, schedule, flow });
    this._testSource = null;
    this.state = {
      ...base,
      mode: testScript ? 'script' : mode,
      testScriptId: testScript ? testScriptId : '',
      phase: 'awaiting_action',
      scene: null,
      currentEventId: null,
      pendingAction: null,
      pendingDice: null,
      lastError: null,
      eventLog: [],
      aiErrors: 0,
      startedAt: this.now(),
      settlement: null,
      settled: false,
    };
    this.telemetry('game_start', { character_id: charId, mode: this.state.mode });
    try {
      await this.#prepareRound();
    } catch (e) {
      this.abandon();
      throw e instanceof SourceError ? e : new SourceError('provider', String(e?.message ?? e));
    }
    return this.state;
  }

  async #prepareRound() {
    return this.state.flow === 'dynamic' ? this.#prepareDynamicRound() : this.#prepareClassicRound();
  }

  /** AI 動態模式：第 1 回合由 AI 產生開場與選項；之後沿用上一回合 AI 給的選項，上一回合的結果就是開場 */
  async #prepareDynamicRound() {
    const s = this.state;
    const fallback = fallbackOptions(s.characterId, s.round);
    let opening = '';
    let options = this.lastRecord?.options?.options;
    if (s.history.length === 0) {
      const res = await withTimeout(this.#sourceFor(s.mode).opening(s, null), this.timeoutMs);
      opening = String(res?.opening ?? '');
      options = sanitizeOptions(res?.options, fallback).options;
    }
    s.currentEventId = null;
    s.scene = {
      round: s.round,
      opening,
      event: null,
      eventIntro: null,
      options: options?.length === 3 ? options : fallback,
    };
    s.phase = 'awaiting_action';
    s.pendingAction = null;
    s.lastError = null;
    this.#save();
  }

  /** 劇本模式：抽出本回合事件、準備開場與三個選項（1.2 第 2 步） */
  async #prepareClassicRound() {
    const s = this.state;
    const pick = pickEventForRound(s.schedule, s.round, { world: s.world, milestones: s.milestones }, EVENTS);
    s.schedule = pick.schedule;
    s.currentEventId = pick.event?.id ?? null;
    s.eventLog.push(...pick.notes.map((note) => ({ round: s.round, note })));
    const event = pick.event;

    let opening = null;
    for (const source of [this.#sourceFor(s.mode), this.sources.script]) {
      try {
        opening = await source.opening(s, event);
        break;
      } catch {
        /* 官方 / 開發者來源沒有開場時改用劇本節點 */
      }
    }
    const fromLast = this.lastRecord?.options?.options;
    s.scene = {
      round: s.round,
      opening: opening?.opening ?? '',
      event: event ? { id: event.id, title: event.title, type: event.type } : null,
      eventIntro: event ? opening?.eventIntro ?? `${event.title}：${event.core_facts}` : null,
      options: fromLast?.length === 3 ? fromLast : opening?.options ?? fallbackOptions(s.characterId, s.round),
    };
    s.phase = 'awaiting_action';
    s.pendingAction = null;
    s.lastError = null;
    this.#save();
  }

  // ─── 玩家行動 → AI 推演 → 驗證計分（1.2 第 3～6 步） ──────

  /**
   * @param {{type:'option', index:number, style:string, text:string} | {type:'free', text:string}} action
   */
  async act(action) {
    const s = this.state;
    if (!s || !['awaiting_action', 'error'].includes(s.phase)) return { ok: false, error: 'not_ready' };
    if (!action) return { ok: false, error: 'empty_action' };
    if (action.type === 'free') {
      const clean = sanitizeFreeAction(action.text);
      if (!clean) return { ok: false, error: 'empty_action' };
      action = { type: 'free', text: clean };
    }

    const dynamic = s.flow === 'dynamic';
    // 送出請求前先寫入 LocalStorage（10.5），並鎖定輸入（3.6）。
    // 命運骰每回合只擲一次：重試、取消重選、重新整理都沿用同一個結果，不能靠重來洗運氣。
    s.pendingAction = action;
    if (dynamic) s.pendingDice ??= rollLuck(this.rng, { round: s.round });
    s.phase = 'awaiting_ai';
    s.lastError = null;
    this.#save();

    const source = this.#sourceFor(s.mode);
    const event = this.currentEvent;
    const t0 = this.now();
    let response;
    try {
      response = await withTimeout(source.round(s, action, event), this.timeoutMs);
    } catch (e) {
      return this.#fail(toError(e));
    }

    const round = s.round;
    const result = resolveRound(s, response, {
      round,
      character: this.character,
      locations: LOCATIONS,
      currentEvent: event,
      isFreeAction: action.type === 'free',
      fallbackOptions: fallbackOptions(s.characterId, round + 1),
      flow: s.flow,
      dice: s.pendingDice,
    });
    if (result.duplicate) return { ok: true, duplicate: true, record: result.record };
    if (!result.ok) {
      return this.#fail({
        code: result.error === 'schema' ? 'schema' : result.error,
        message: '回應格式不正確，本回合沒有套用任何變更',
        details: result.errors,
      });
    }

    const next = result.state;
    const record = next.history.at(-1);
    Object.assign(record, {
      action: { type: action.type, style: action.style ?? response._style ?? null, text: action.text },
      source: source.name,
      elapsedMs: this.now() - t0,
      check: this.#checkTestScript(record),
    });
    Object.assign(next, { pendingAction: null, pendingDice: null, lastError: null });
    this.state = next;

    this.telemetry('round_complete', {
      round,
      action_type: action.type,
      symbol: record.symbol,
      ai_ms: record.elapsedMs,
      used_script: !['official', 'dev'].includes(source.name),
      rejected: record.milestones.rejected.length + record.world.rejected.length,
    });

    if (next.status === 'playing') {
      await this.#prepareRound();
    } else {
      next.phase = 'ended';
      next.scene = null;
      this.#save();
      this.telemetry('game_end', {
        end_type: next.endType,
        rounds: next.endRound,
        score: next.scoreDisplay,
        grade: getSettlement(next).rating?.grade ?? null,
        duration_ms: this.now() - next.startedAt,
      });
    }
    return { ok: true, record };
  }

  #fail(error) {
    const s = this.state;
    s.phase = 'error';
    s.lastError = error;
    s.aiErrors += 1;
    this.#save();
    this.telemetry('ai_error', { type: error.code });
    return { ok: false, error: error.code, message: error.message };
  }

  /** 錯誤後重試同一個行動（10.5：不自動重試，由玩家選擇） */
  retry() {
    return this.act(this.state?.pendingAction);
  }

  /** 錯誤後放棄這次行動，回到選擇畫面（命運骰保留，見 act） */
  cancelPending() {
    if (this.state?.phase !== 'error') return;
    this.state.phase = 'awaiting_action';
    this.state.pendingAction = null;
    this.state.lastError = null;
    this.#save();
  }

  /** 開發者模式：測試劇本逐回合比對第十一章表格 */
  #checkTestScript(record) {
    const ts = this.state.testScriptId ? this.testScripts[this.state.testScriptId] : null;
    const expected = ts?.rounds[record.round - 1]?.expect;
    if (!expected) return null;
    const a = record.score.after;
    const actual = [a.M, a.P, a.R, a.raw, a.display, record.symbol];
    return { expected, actual, pass: JSON.stringify(expected) === JSON.stringify(actual) };
  }

  // ─── 結算（1.2 第 7 步、7.7） ──────────────────────────────

  /**
   * 劇本模式：AI 評語失敗 → 改用劇本評語，不阻擋分享（7.7）。
   * AI 動態模式：失敗回傳 null 並記在 state.lastError，由玩家決定重試或放棄，不用罐頭評語頂替。
   */
  async settle() {
    const s = this.state;
    if (!s || !['ended', 'settled'].includes(s.phase)) return null;
    if (s.settlement) return s.settlement;

    let comment = null;
    let commentSource = 'script';
    let error = null;
    const source = this.#sourceFor(s.mode);
    try {
      comment = await withTimeout(source.settle(s), this.timeoutMs);
      commentSource = source.name;
    } catch (e) {
      error = toError(e);
    }
    if (!comment?.personal_comment) {
      if (s.flow === 'dynamic') {
        s.lastError = error ?? { code: 'schema', message: 'AI 評語為空' };
        this.#save();
        this.telemetry('ai_error', { type: s.lastError.code });
        return null;
      }
      comment = await this.sources.script.settle(s);
      commentSource = 'script';
    }
    s.lastError = null;
    s.settlement = { ...getSettlement(s), comment, commentSource };
    s.phase = 'settled';
    s.settled = true;
    this.#save();
    return s.settlement;
  }
}

// ─── 顯示用輔助函式（純函式，UI 與分享共用） ─────────────────

/** 遊戲內時間：超過 48 小時改以天計（vp 的回合跨度較長） */
export function timeLabel(state) {
  const c = CHARACTERS[state.characterId];
  const h = state.currentTime;
  const clock = (((c.startHour + h) % 24) + 24) % 24;
  const since = h >= 48 ? `第 ${Math.floor(h / 24) + 1} 天` : `事件後 ${h} 小時`;
  return `${since}・${String(clock).padStart(2, '0')}:00`;
}

/** 下一回合 AI 上下文用（5.3）：上回合未生效的變更 */
export function lastRejections(state) {
  return rejectionNotes(state?.history?.at(-1));
}

/** 8.5 戰績文字（分享文字使用 emoji） */
export function buildShareText(state, { url = '' } = {}) {
  const scenario = SCENARIOS.find((s) => s.id === state.scenarioId);
  const character = CHARACTERS[state.characterId];
  const st = state.settlement ?? getSettlement(state);
  const lines = ['【What If 生存推演】', `我在《${scenario?.title ?? ''}》`, `挑戰「${character.goal}」`];
  if (state.endType === 'clear') {
    lines.push(`最終得分 100/100｜評級 ${st.rating?.grade ?? '-'}`, `（第 ${state.endRound} 回合達成）！`);
  } else if (state.endType === 'normal') {
    lines.push(`最終得分 ${state.scoreDisplay}/100（撐到第 ${state.endRound} 回合）`);
  } else {
    lines.push(`最終得分 ${state.scoreDisplay}/100`, `在第 ${state.endRound} 回合出局`);
  }
  lines.push('', `軌跡：${state.trajectory.join('')}`, `稱號：「${st.title}」`, '', `不服來戰：${url}`);
  return lines.join('\n');
}

export const BADGE_LABELS = Object.freeze({ no_damage: '無傷通關', speedrun: '速通' });
export const END_TYPE_LABELS = Object.freeze({ clear: '通關', fatal: '倒下', score: '出局', normal: '撐到最後' });
