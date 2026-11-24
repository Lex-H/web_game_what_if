/**
 * UI 渲染與事件綁定（14.1、14.3）。
 *
 * 原則：
 * - 遊戲邏輯全在 engine.js / rules.js；這裡只負責畫面與輸入。
 * - 所有來自劇本 / AI / 玩家的文字都用 textContent（js/dom.js 的 h()）插入，不使用 innerHTML。
 * - 只有 render() 在狀態變動或換頁時重建 DOM；輸入框字數、選單展開等用直接操作 DOM，避免打斷輸入。
 */
import { GameController, optionAction, freeAction, buildShareText, timeLabel, lastRejections, BADGE_LABELS, END_TYPE_LABELS, FREE_ACTION_MAX } from './engine.js';
import { createScriptSource, createUnavailableSource, createDevSource, availableProviders, ERROR_CODES } from './api.js';
import { defaultStorage, loadSettings, saveSettings, loadGame, hasResumableGame } from './state.js';
import {
  SCENARIOS, CHARACTERS, EVENTS, LOCATIONS, HOME_COPY, DISCLAIMER, PRIVACY_NOTICE, RESOURCES, STAT_LABELS,
  supplyLabel, TRANSPORT_LABELS, CONTACT_LABELS, ORDER_LABELS, MILESTONE_STATUS_LABELS, EVENT_TYPE_LABELS,
  validateScenarios, DEFAULT_SCENARIO_ID,
} from './scenarios.js';
import { MAX_ROUNDS } from './rules.js';
import { PLAYABLE_SCRIPTS } from '../data/scripts.js';
import { TEST_SCRIPTS } from '../data/script-tests.js';
import { h, clear } from './dom.js';
import { createTelemetry } from './telemetry.js';
import { renderSettings } from './settings.js';
import { applyTheme } from './theme.js';
import { createRecognizer, isSpeechAvailable, SPEECH_ERROR_MESSAGES } from './speech.js';
import { buildShareCard, renderCardPng, runShareFlow, openModal, trajectoryBlocks, symbolClass, symbolName } from './share.js';

// ─── 啟動與接線 ───────────────────────────────────────────────

const storage = defaultStorage();
const sources = {
  script: createScriptSource(PLAYABLE_SCRIPTS),
  official: createUnavailableSource('official'),
  // 每次呼叫前重新讀取設定，確保 API Key / Model 異動後立即生效
  dev: {
    name: 'dev',
    opening: (...a) => createDevSource(getSettings()).opening(...a),
    round: (...a) => createDevSource(getSettings()).round(...a),
    settle: (...a) => createDevSource(getSettings()).settle(...a),
  },
};
const getSettings = () => loadSettings(storage);

const telemetry = createTelemetry({
  storage,
  getGameId: () => controller.state?.gameId ?? null,
  isDisabled: () => getSettings().devEnabled, // 12.2：開發者模式下不記錄
});
const track = telemetry.track;
const controller = new GameController({ storage, sources, testScripts: TEST_SCRIPTS, onChange: render, telemetry: track });

/** UI 暫態（不寫入 LocalStorage） */
const ui = {
  view: 'home', // home | disclaimer | character | game | result | settings | resume
  scenarioId: DEFAULT_SCENARIO_ID,
  flow: 'dynamic', // 首頁選的玩法：classic（劇本模式）| dynamic（AI 動態模式），預設 dynamic
  disclaimerOk: false,
  randomCharacterId: null,
  busy: false, // 送出行動後到最短等待時間結束之前
  settling: false,
  waitIdx: 0,
  draft: '',
  shownScore: null,
  hudShown: null,
  lastRound: null,
  settlement: null,
  rated: null,
  pngPromise: null,
  hudOpen: false,
  listening: false,
  replayFrom: null,
  pendingCharacterId: null,
  settleError: null,
};
let waitTimer = null;
let recognizer = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (id) => document.getElementById(id);

// ─── 文字與標籤 ───────────────────────────────────────────────

const STYLE_LABELS = { steady: '穩健', intel: '情報', bold: '冒險' };
const RISK_LABELS = { none: '無', minor: '輕微', major: '重大', fatal: '致命' };
const PERF_LABELS = { excellent: '精彩', good: '良好', neutral: '普通', poor: '失誤' };
const MS_ICON = { none: '○', partial: '◐', done: '✓', lost: '✕' };
const MORAL_LABELS = { selfish: '手段自私', ruthless: '手段冷酷' };
const signed = (n) => (n > 0 ? `+${n}` : String(n));

const modeLabel = (s) => {
  if (s.testScriptId) return '劇本模式（測試）';
  if (s.flow === 'dynamic') return 'AI 動態模式';
  return s.mode === 'script' ? '劇本模式' : '劇本模式・AI 推演';
};

function msName(characterId, id) {
  return CHARACTERS[characterId]?.milestones.find((m) => m.id === id)?.name ?? id;
}

const locName = (id) => LOCATIONS[id]?.name ?? id ?? '未知';

/** 10.5 友善提示 */
function errorInfo(err) {
  const code = err?.code ?? 'provider';
  const base = ERROR_CODES[code] ?? '發生未預期的錯誤';
  const table = {
    timeout: { text: '這次推演等太久了，沒有收到回應。你的進度已保存。', retry: true },
    schema: { text: '回應的格式不正確，本回合沒有套用任何變更。', retry: true },
    refusal: { text: '這次的推演被 AI 拒絕了。可以重試，或取消後換個行動。', retry: true },
    provider: { text: '推演服務暫時出了問題。', retry: true },
    network: { text: '網路連線似乎中斷了。', retry: true },
    interrupted: { text: '上次的推演被中斷了，進度已保存。', retry: true },
    auth: { text: 'Grok 與 Gemini 的 API Key 都無法使用，請到設定頁檢查 Key。', retry: false },
    budget: { text: '今日即時推演額度已滿。', retry: false },
    rate_limit: { text: '請求太頻繁或額度已用完，請稍後再試。', retry: true },
    not_available: { text: err?.message || '這個模式尚未開放。', retry: false },
  };
  const info = table[code] ?? { text: '發生未預期的錯誤。', retry: true };
  return { title: base, ...info };
}

// ─── 小元件 ───────────────────────────────────────────────────

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function updateDevBadge() {
  const el = $('dev-badge');
  if (el) el.hidden = !getSettings().devEnabled;
}

const isDev = () => Boolean(getSettings().devEnabled);

function animateNumber(el, from, to, ms = 700) {
  if (from === to || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = String(to);
    return;
  }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = String(Math.round(from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function statBar(label, value, initial) {
  const diff = value - initial;
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-name', text: label }),
    h('span', { class: 'bar' }, h('span', { class: 'bar-fill', style: { width: `${Math.max(0, Math.min(100, value))}%` } })),
    h('span', { class: 'stat-v', text: diff === 0 ? String(value) : `${value}（${signed(diff)}）` }),
  );
}

function msList(state, { status = null } = {}) {
  const ch = CHARACTERS[state.characterId];
  return h('ul', { class: 'ms-list' }, ...ch.milestones.map((def) => {
    const st = (status ?? state.milestones)[def.id] ?? 'none';
    return h('li', { class: `ms-item st-${st}` },
      h('span', { class: 'ms-icon', 'aria-hidden': 'true', text: MS_ICON[st] }),
      h('span', { class: 'ms-name', text: def.name }),
      h('span', { class: 'ms-status', text: MILESTONE_STATUS_LABELS[st] }),
    );
  }));
}

// ─── 氛圍等待畫面（7.6） ──────────────────────────────────────

const WAIT_LINES = {
  civilian: [
    '收音機雜訊……沙沙……',
    '手機訊號搜尋中…',
    '〔廣播〕……請民眾保持冷靜，等待進一步通知……',
    '訊號時有時無，正在重新連線…',
    '〔廣播〕……請勿轉傳未經證實的消息……',
    '省點電，螢幕亮度已調到最低…',
  ],
  vp: [
    '加密線路同步中…',
    '正在掃描可用頻段……',
    '〔截獲〕……不明訊號，來源無法辨識……',
    '衛星線路不穩定，重新校準中…',
    '〔通訊兵〕……報告，線路尚未接通……',
    '干擾強度上升，切換備用頻道…',
  ],
  settle: ['正在整理這一局的紀錄…', '回顧每一個關鍵時刻…', '寫下你的評語…'],
  // AI 動態模式：詼諧黑色幽默，只調侃荒謬的處境，不拿傷亡開玩笑
  civilian_dynamic: [
    '收音機：「請保持冷靜。」你：（保持中）',
    '手機顯示 1 格訊號，然後 0 格，然後 1 格…',
    '鄰居群組又有人轉傳「內部消息」…',
    '命運正在翻你的簿子，請稍候…',
    '你的冷靜正在載入，目前 87%…',
    '省電模式已開啟，樂觀模式尚未支援…',
  ],
  vp_dynamic: [
    '幕僚正在把壞消息改寫成「挑戰」…',
    '加密線路同步中（希望只有我方在聽）…',
    '各方「高度關切」正在排隊等你回電…',
    '命運正在翻你的簿子，請稍候…',
    '通訊兵：「報告，線路……還是沒通。」',
    '正在起草一份誰都不想簽的聲明…',
  ],
  settle_dynamic: ['正在清點你這一局做過的好事與壞事…', '把你的每個決定攤開來對帳…', '評語正在醞釀，請先做好心理準備…'],
};

function renderWaiting(kind, dynamic = false) {
  const lines = (dynamic ? WAIT_LINES[`${kind}_dynamic`] : null) ?? WAIT_LINES[kind] ?? WAIT_LINES.civilian;
  const line = h('p', { class: 'wait-line', role: 'status', 'aria-live': 'polite', text: lines[ui.waitIdx % lines.length] });
  clearInterval(waitTimer);
  waitTimer = setInterval(() => {
    ui.waitIdx += 1;
    line.textContent = lines[ui.waitIdx % lines.length];
  }, 1700);
  return h('section', { class: 'card wait' },
    h('div', { class: 'wait-bars', 'aria-hidden': 'true' }, ...Array.from({ length: 12 }, (_, i) => h('span', { style: { animationDelay: `${(i * 0.11).toFixed(2)}s` } }))),
    line,
  );
}

// ─── 首頁 ─────────────────────────────────────────────────────

const MODES = Object.freeze([
  { flow: 'dynamic', title: 'AI 動態模式', desc: '每回合的劇情與選項由 AI 即時生成，帶點黑色幽默，還有你看不見的運氣。手段再髒也能過關，但代價會算在你頭上。需要設定 API Key。' },
  { flow: 'classic', title: '劇本模式', desc: '經典版本：手寫劇情與固定事件，語氣嚴肅。有設定 API Key 時，自由輸入的行動會交給 AI 判定。' },
]);

const isOnline = () => navigator.onLine !== false;

/** 開始遊戲前的檢查；通過回傳 null，不通過回傳要告訴玩家的說明 */
function modeBlocker(flow) {
  const settings = getSettings();
  const offlineOk = flow === 'classic' && settings.testScriptId; // 強制 Mock 測試劇本不會連網
  if (!isOnline() && !offlineOk) {
    return { title: '目前沒有網路連線', body: '兩種模式開始前都需要連上網路：劇本模式的自由輸入與評語、AI 動態模式的全部內容都會呼叫 AI。請連上網路後再開始。' };
  }
  if (flow === 'dynamic' && !availableProviders(settings).length) {
    return { title: 'AI 動態模式需要 API Key', body: '這個模式的劇情由 AI 即時生成，請先到設定頁填入 Grok 或 Gemini 的 API Key。', toSettings: true };
  }
  return null;
}

function guardMode(flow) {
  const blocker = modeBlocker(flow);
  if (!blocker) return true;
  openModal({
    title: blocker.title,
    body: h('p', { text: blocker.body }),
    actions: [
      ...(blocker.toSettings ? [{ label: '前往設定', primary: true, onClick: ({ close }) => { close(); go('settings'); } }] : []),
      { label: '知道了', primary: !blocker.toSettings, onClick: ({ close }) => close() },
    ],
  });
  return false;
}

function renderHome() {
  const openScenarios = SCENARIOS.filter((s) => s.open);
  const online = isOnline();
  const modeCards = MODES.map((m) => h('button', {
    type: 'button',
    class: `mode-card${m.flow === ui.flow ? ' selected' : ''}`,
    aria: { pressed: String(m.flow === ui.flow) },
    onclick: () => { ui.flow = m.flow; render(); },
  },
    h('span', { class: 'mode-title', text: m.title }),
    h('span', { class: 'mode-desc', text: m.desc }),
  ));
  const cards = SCENARIOS.map((sc) => {
    const selected = sc.open && sc.id === ui.scenarioId;
    return h('button', {
      type: 'button',
      class: `scenario-card${sc.open ? '' : ' locked'}${selected ? ' selected' : ''}`,
      aria: sc.open ? { pressed: String(selected) } : { disabled: 'true' },
      onclick: () => {
        if (sc.open) {
          ui.scenarioId = sc.id;
          render();
        } else {
          track('scenario_preview_click', { scenario_id: sc.id });
          toast(HOME_COPY.locked);
        }
      },
    },
      h('span', { class: 'scenario-title', text: sc.title }),
      h('span', { class: `scenario-tag${sc.open ? ' open' : ''}`, text: sc.open ? '已開放' : HOME_COPY.locked }),
    );
  });

  return h('div', { class: 'view home' },
    h('div', { class: 'top-actions' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '設定', onclick: () => go('settings') })),
    h('header', { class: 'brand' },
      h('img', { class: 'logo', src: 'assets/logo.svg', alt: HOME_COPY.brand, width: 240, height: 80 }),
      h('h1', { class: 'hero-title', text: HOME_COPY.title }),
      h('p', { class: 'hero-sub', text: HOME_COPY.subtitle }),
      h('p', { class: 'hero-intro', text: HOME_COPY.intro }),
    ),
    online ? null : h('p', { class: 'warning', role: 'alert', text: '目前沒有偵測到網路連線，請連上網路後再開始遊戲。' }),
    h('p', { class: 'section-label', text: '選擇玩法' }),
    h('section', { class: 'mode-list', aria: { label: '遊戲模式' } }, ...modeCards),
    h('p', { class: 'section-label', text: '選擇情境' }),
    h('section', { class: 'scenario-list', aria: { label: '情境' } }, ...cards),
    h('div', { class: 'cta' },
      h('button', { type: 'button', class: 'btn btn-primary btn-lg', text: HOME_COPY.start, disabled: !online && !getSettings().testScriptId, onclick: () => { ui.randomCharacterId = null; startFlow(); } }),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-lg',
        text: HOME_COPY.random,
        disabled: !online && !getSettings().testScriptId,
        onclick: () => {
          // 只從已開放情境抽，再隨機抽角色
          const sc = openScenarios[Math.floor(Math.random() * openScenarios.length)];
          ui.scenarioId = sc.id;
          ui.randomCharacterId = sc.characters[Math.floor(Math.random() * sc.characters.length)];
          startFlow();
        },
      }),
    ),
    h('footer', { class: 'privacy' }, h('p', { class: 'muted small', text: PRIVACY_NOTICE })),
  );
}

function startFlow() {
  if (!guardMode(ui.flow)) return;
  if (!ui.disclaimerOk) return go('disclaimer');
  return ui.randomCharacterId ? startGame(ui.randomCharacterId) : go('character');
}

// ─── 遊戲聲明（13.2） ─────────────────────────────────────────

function renderDisclaimer() {
  return h('div', { class: 'view' },
    h('section', { class: 'card' },
      h('h2', { class: 'card-title', text: '遊戲聲明' }),
      h('p', { class: 'disclaimer', text: DISCLAIMER }),
      h('div', { class: 'cta' },
        h('button', {
          type: 'button',
          class: 'btn btn-primary btn-lg',
          text: '我了解了，繼續',
          onclick: () => {
            ui.disclaimerOk = true;
            startFlow();
          },
        }),
        h('button', { type: 'button', class: 'btn btn-ghost', text: '返回', onclick: () => go('home') }),
      ),
    ),
  );
}

// ─── 選角 ─────────────────────────────────────────────────────

function renderCharacterSelect() {
  const scenario = SCENARIOS.find((s) => s.id === ui.scenarioId);
  const settings = getSettings();
  const forced = settings.testScriptId ? TEST_SCRIPTS[settings.testScriptId] : null;
  return h('div', { class: 'view' },
    h('div', { class: 'page-head' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '返回', onclick: () => go('home') }),
      h('h1', { class: 'page-title', text: '選擇你的身份' }),
    ),
    h('p', { class: 'muted', text: `《${scenario.title}》` }),
    ui.flow === 'dynamic' ? h('p', { class: 'muted small', text: 'AI 動態模式：每回合的劇情與選項由 AI 即時生成，結果帶有你看不見的運氣成分。' }) : null,
    forced && ui.flow === 'classic' ? h('p', { class: 'warning', text: `測試功能：已強制使用測試劇本「${forced.title ?? settings.testScriptId}」，角色與事件排程由測試劇本決定。` }) : null,
    ...scenario.characters.map((id) => {
      const c = CHARACTERS[id];
      return h('article', { class: 'card char-card' },
        h('h2', { class: 'card-title', text: c.name }),
        h('p', { class: 'char-goal' }, h('b', { text: '目標　' }), c.goal),
        h('p', {}, h('b', { class: 'good', text: '優勢　' }), c.advantage),
        h('p', {}, h('b', { class: 'bad', text: '挑戰　' }), c.challenge),
        h('div', { class: 'stats' }, ...Object.keys(STAT_LABELS).map((k) => statBar(STAT_LABELS[k], c.stats[k], c.stats[k]))),
        h('p', { class: 'start-label', text: c.startLabel }),
        h('button', { type: 'button', class: 'btn btn-primary', text: `扮演「${c.name}」`, onclick: () => startGame(id) }),
      );
    }),
  );
}

// ─── 遊戲主畫面（14.3） ───────────────────────────────────────

function hudData(s) {
  return {
    round: Math.min(s.round, MAX_ROUNDS),
    time: timeLabel(s),
    milestones: { ...s.milestones },
    score: s.scoreDisplay,
    locked: s.locked,
    unwinnable: s.unwinnable,
  };
}

function renderHud(s) {
  const ch = CHARACTERS[s.characterId];
  const data = ui.busy ? ui.hudShown ?? hudData(s) : hudData(s);
  if (!ui.busy) ui.hudShown = data;
  const from = ui.shownScore ?? data.score;
  const to = data.score;
  const delta = to - from;
  ui.shownScore = to;

  const scoreEl = h('span', { class: 'hud-score-num', text: String(from) });
  animateNumber(scoreEl, from, to);
  const progress = h('div', { class: 'progress', role: 'progressbar', aria: { valuemin: '0', valuemax: '100', valuenow: String(Math.max(0, to)), label: '目標進度' } },
    h('div', { class: 'progress-fill', style: { width: `${Math.max(0, Math.min(100, to))}%` } }));

  const dropdown = h('div', { class: `hud-ms-detail${ui.hudOpen ? ' open' : ''}` }, msList({ ...s, milestones: data.milestones }));
  const msRow = h('button', {
    type: 'button',
    class: 'hud-ms',
    aria: { label: '里程碑狀態（點一下展開）', expanded: String(ui.hudOpen) },
    onclick: () => {
      ui.hudOpen = !ui.hudOpen;
      dropdown.classList.toggle('open', ui.hudOpen);
    },
  }, ...ch.milestones.map((def, i) => {
    const st = data.milestones[def.id] ?? 'none';
    return h('span', { class: `ms-chip st-${st}`, title: `${def.name}：${MILESTONE_STATUS_LABELS[st]}` },
      h('span', { class: 'ms-icon', 'aria-hidden': 'true', text: MS_ICON[st] }), h('span', { class: 'ms-num', text: String(i + 1) }));
  }));

  return h('header', { class: 'hud' },
    h('div', { class: 'hud-top' },
      h('p', { class: 'hud-goal', text: `目標：${ch.goal}` }),
      h('span', { class: `mode-badge${s.mode === 'script' ? '' : ' live'}`, text: modeLabel(s) }),
    ),
    h('div', { class: 'hud-mid' },
      h('div', { class: 'hud-score' },
        scoreEl, h('span', { class: 'hud-score-max', text: '/100' }),
        delta !== 0 && !ui.busy ? h('span', { class: `delta ${delta > 0 ? 'pos' : 'neg'}`, text: signed(delta) }) : null,
      ),
      h('div', { class: 'hud-meta' },
        h('span', { class: 'hud-round', text: `回合 ${data.round}/${MAX_ROUNDS}` }),
        h('span', { class: 'hud-time', text: data.time }),
      ),
    ),
    progress,
    msRow,
    dropdown,
    data.locked ? h('p', { class: 'hud-note lock', text: '鎖定 99，完成最後目標即可通關' }) : null,
    data.unwinnable ? h('p', { class: 'hud-note lost', text: '目標已無法完整達成' }) : null,
  );
}

function recordChecks(state) {
  return state.history.filter((r) => r.check).map((r) => ({ round: r.round, ...r.check }));
}

/** 3.5：開發者才看得到的拒絕 / 降級細節，以及測試劇本逐回合比對 */
function renderDevBox(state, record, { withNext = true } = {}) {
  if (!record) return null;
  const rows = [];
  const add = (label, value, bad = false) => rows.push(h('li', { class: bad ? 'dev-bad' : '' }, h('b', { text: `${label}：` }), value));

  add('來源', `${record.source ?? '?'}・${record.elapsedMs ?? 0} ms・${record.action?.type === 'free' ? '自由行動' : '選項'}`);
  const ms = record.milestones?.rejected ?? [];
  add('里程碑被拒絕', ms.length ? ms.map((r) => `${r.update?.id ?? '?'}→${r.update?.status ?? '?'}（${r.reason}）`).join('；') : '無', ms.length > 0);
  const wr = record.world?.rejected ?? [];
  add('世界狀態被拒絕', wr.length ? wr.map((r) => `${r.op?.op ?? '?'} ${r.op?.path ?? '?'} ${JSON.stringify(r.op?.value ?? null)}（${r.reason}）`).join('；') : '無', wr.length > 0);
  add('風險', record.risk?.downgraded
    ? `提議 ${record.risk.proposed} → 生效 ${record.risk.level}（降級；${(record.risk.notes ?? []).join('、')}）`
    : `${record.risk?.level ?? 'none'}（未降級）`, Boolean(record.risk?.downgraded));
  add('表現', record.performance?.downgraded
    ? `提議 ${record.performance.proposed} → 生效 ${record.performance.applied}（降級；${record.performance.note ?? ''}）`
    : `${record.performance?.applied ?? '-'}（未降級）`, Boolean(record.performance?.downgraded));
  add('選項備援', record.options?.usedFallback ? '是（AI 選項不合法，已改用備援選項）' : '否', Boolean(record.options?.usedFallback));
  if (withNext) {
    const notes = lastRejections(state);
    add('下回合會告知 AI 未生效', notes.length ? notes.join('；') : '無');
  }
  if (record.check) {
    const c = record.check;
    rows.push(h('li', { class: c.pass ? 'dev-ok' : 'dev-bad' },
      h('b', { text: `${c.pass ? '✅' : '❌'} 測試劇本比對：` }),
      h('div', { class: 'mono', text: `預期 [M,P,R,S_raw,顯示,符號] = ${JSON.stringify(c.expected)}` }),
      h('div', { class: 'mono', text: `實際 [M,P,R,S_raw,顯示,符號] = ${JSON.stringify(c.actual)}` }),
    ));
  }
  return h('details', { class: 'dev-box', open: true },
    h('summary', { text: `開發者細節（第 ${record.round} 回合）` }), h('ul', {}, ...rows));
}

function renderCheckSummary(state) {
  if (!state.testScriptId) return null;
  const checks = recordChecks(state);
  const total = TEST_SCRIPTS[state.testScriptId]?.rounds?.length ?? checks.length;
  const pass = checks.filter((c) => c.pass).length;
  const finished = state.status !== 'playing';
  const allOk = checks.length > 0 && pass === checks.length;
  const verdict = !finished
    ? `進行中：已比對 ${checks.length} 回合，${pass} 回合一致`
    : checks.length === 0
      ? '沒有可比對的回合'
      : allOk
        ? `✅ 全部一致（${pass}/${checks.length} 回合）`
        : `❌ 有不一致（${pass}/${checks.length} 回合一致）`;
  return h('section', { class: `card dev-box ${finished ? (allOk ? 'dev-ok' : 'dev-bad') : ''}` },
    h('h3', { class: 'card-title', text: `測試劇本比對：${TEST_SCRIPTS[state.testScriptId]?.title ?? state.testScriptId}` }),
    h('p', { class: 'dev-verdict', text: verdict }),
    h('table', { class: 'dev-table' },
      h('thead', {}, h('tr', {}, ...['回合', '結果', '預期 [M,P,R,S_raw,顯示,符號]', '實際'].map((t) => h('th', { text: t })))),
      h('tbody', {}, ...checks.map((c) => h('tr', { class: c.pass ? '' : 'dev-bad' },
        h('td', { text: String(c.round) }), h('td', { text: c.pass ? '✅' : '❌' }),
        h('td', { class: 'mono', text: JSON.stringify(c.expected) }), h('td', { class: 'mono', text: JSON.stringify(c.actual) }),
      ))),
    ),
    finished && checks.length < total ? h('p', { class: 'muted small', text: `測試劇本共 ${total} 回合，實際比對 ${checks.length} 回合（提前結束）。` }) : null,
  );
}

function renderLastResult(s) {
  const r = controller.lastRecord;
  if (!r) return null;
  const ch = CHARACTERS[s.characterId];
  const changes = (r.milestones?.applied ?? []).map((m) =>
    h('li', {}, h('b', { text: msName(s.characterId, m.id) }), `：${MILESTONE_STATUS_LABELS[m.from]} → ${MILESTONE_STATUS_LABELS[m.to]}`));
  const d = r.score?.deltaDisplay ?? 0;
  const risk = r.risk?.level ?? 'none';
  return h('section', { class: 'card result-card' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title', text: `第 ${r.round} 回合結果` }),
      h('span', { class: `traj-block ${symbolClass(r.symbol)}`, title: symbolName(r.symbol), text: symbolName(r.symbol) }),
      h('span', { class: `delta-chip ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}`, text: `${signed(d)} 分` }),
    ),
    r.action?.text ? h('p', { class: 'you-did' }, h('b', { text: `你的行動（${STYLE_LABELS[r.action.style] ?? '自由行動'}）　` }), r.action.text) : null,
    h('p', { class: 'narrative', text: r.narrative }),
    r.scoreReason ? h('p', { class: 'score-reason', text: `計分原因：${r.scoreReason}` }) : null,
    changes.length ? h('ul', { class: 'changes' }, ...changes) : null,
    h('p', { class: 'muted small', text: `表現：${PERF_LABELS[r.performance?.applied] ?? '-'}（${signed(r.performance?.points ?? 0)}）　風險：${RISK_LABELS[risk]}${r.frozen ? '（本回合變更未套用）' : ''}　${ch.name}` }),
    isDev() ? renderDevBox(s, r) : null,
  );
}

function renderScene(s) {
  const sc = s.scene;
  if (!sc) return null;
  const ev = sc.event ? EVENTS[sc.event.id] : null;
  return h('section', { class: 'scene' },
    h('h2', { class: 'round-title', text: `第 ${sc.round} 回合` }),
    sc.event
      ? h('div', { class: 'card event-card' },
        h('div', { class: 'event-head' },
          h('span', { class: 'event-tag', text: EVENT_TYPE_LABELS[ev?.type ?? sc.event.type] ?? '事件' }),
          h('b', { text: sc.event.title })),
        h('p', { text: sc.eventIntro }))
      : null,
    h('p', { class: 'opening', text: sc.opening }),
  );
}

function renderOptions(s) {
  const locked = ui.busy || s.phase !== 'awaiting_action';
  return h('section', { class: 'options', aria: { label: '選擇行動' } },
    ...s.scene.options.map((opt, i) =>
      h('button', {
        type: 'button',
        class: `option style-${opt.style}`,
        disabled: locked,
        onclick: () => submit(() => controller.act(optionAction(opt, i))),
      },
        h('span', { class: 'option-tag', text: STYLE_LABELS[opt.style] ?? opt.style }),
        h('span', { class: 'option-text', text: opt.text }),
      )),
  );
}

function renderFreeAction(s) {
  const locked = ui.busy || s.phase !== 'awaiting_action';
  const input = h('textarea', {
    class: 'input free-input',
    rows: 3,
    placeholder: '或者，寫下你自己的行動（最多 80 字）',
    disabled: locked,
    'aria-label': '自由行動',
    value: ui.draft,
  });
  const counter = h('span', { class: 'counter', text: `${[...ui.draft].length}/${FREE_ACTION_MAX}` });
  const updateCounter = () => {
    let chars = [...input.value];
    if (chars.length > FREE_ACTION_MAX) {
      input.value = chars.slice(0, FREE_ACTION_MAX).join('');
      chars = [...input.value];
    }
    ui.draft = input.value;
    counter.textContent = `${chars.length}/${FREE_ACTION_MAX}`;
    counter.classList.toggle('full', chars.length >= FREE_ACTION_MAX);
  };
  input.addEventListener('input', updateCounter);

  const actions = [];
  if (getSettings().voice !== false && isSpeechAvailable()) {
    const mic = h('button', { type: 'button', class: 'btn btn-ghost mic', disabled: locked, text: '語音輸入' });
    mic.addEventListener('click', () => {
      if (ui.listening) {
        recognizer?.stop();
        return;
      }
      recognizer = createRecognizer();
      if (!recognizer) return;
      ui.listening = true;
      mic.textContent = '聆聽中…（再按一次停止）';
      mic.classList.add('active');
      recognizer.start({
        onResult: (text) => {
          input.value = input.value.trim() ? `${input.value.trim()} ${text}` : text;
          updateCounter();
          toast('已填入文字框，確認後再送出');
        },
        onError: (code) => toast(SPEECH_ERROR_MESSAGES[code] ?? SPEECH_ERROR_MESSAGES.error),
        onEnd: () => {
          ui.listening = false;
          mic.textContent = '語音輸入';
          mic.classList.remove('active');
        },
      });
    });
    actions.push(mic);
  }
  actions.push(h('button', {
    type: 'button',
    class: 'btn btn-primary',
    disabled: locked,
    text: '送出自由行動',
    onclick: () => {
      const action = freeAction(input.value);
      if (!action) return toast('請先輸入你的行動');
      // 送出前確認（玩家確認後才送出，包含語音結果）
      openModal({
        title: '確定送出這個行動？',
        body: h('p', { class: 'confirm-text', text: action.text }),
        actions: [
          { label: '確認送出', primary: true, onClick: ({ close }) => { close(); submit(() => controller.act(action)); } },
          { label: '回去修改', onClick: ({ close }) => close() },
        ],
      });
    },
  }));

  return h('section', { class: 'card free' },
    h('label', { class: 'field-label' }, '自由行動'), input,
    h('div', { class: 'free-foot' }, counter, h('div', { class: 'row' }, ...actions)),
  );
}

function abandonButton() {
  return h('button', {
    type: 'button',
    class: 'btn btn-danger',
    text: '放棄本局',
    onclick: () => openModal({
      title: '確定放棄這一局？',
      body: h('p', { text: '這一局的進度會被刪除，回到首頁。' }),
      actions: [
        { label: '放棄本局', primary: true, onClick: ({ close }) => { close(); ui.settleError = null; controller.abandon(); go('home'); } },
        { label: '繼續這一局', onClick: ({ close }) => close() },
      ],
    }),
  });
}

/** AI 動態模式的結算評語失敗：不用罐頭評語頂替，讓玩家重試或放棄 */
function renderSettleError(s) {
  const info = errorInfo(ui.settleError);
  return h('section', { class: 'card error-card', role: 'alert' },
    h('h2', { class: 'card-title', text: `結算評語失敗：${info.title}` }),
    h('p', { text: info.text }),
    isDev() ? h('p', { class: 'mono small', text: `[dev] code=${ui.settleError.code} message=${ui.settleError.message}` }) : null,
    h('div', { class: 'cta' },
      h('button', { type: 'button', class: 'btn btn-primary', text: '重試結算', onclick: () => { ui.settleError = null; runSettle(); } }),
      abandonButton(),
    ),
  );
}

function renderErrorPanel(s) {
  const info = errorInfo(s.lastError);
  const pending = s.pendingAction;
  return h('section', { class: 'card error-card', role: 'alert' },
    h('h2', { class: 'card-title', text: info.title }),
    h('p', { text: info.text }),
    pending?.text ? h('p', { class: 'muted small', text: `待送出的行動：${pending.text}` }) : null,
    isDev() && s.lastError ? h('p', { class: 'mono small', text: `[dev] code=${s.lastError.code} message=${s.lastError.message}` }) : null,
    h('div', { class: 'cta' },
      info.retry && pending ? h('button', { type: 'button', class: 'btn btn-primary', text: '重試', onclick: () => submit(() => controller.retry()) }) : null,
      h('button', { type: 'button', class: 'btn btn-ghost', text: '取消，換個行動', onclick: () => controller.cancelPending() }),
      abandonButton(),
    ),
  );
}

function worldPanel(s) {
  const w = s.world;
  const ch = CHARACTERS[s.characterId];
  const dl = (rows) => h('dl', { class: 'kv' }, ...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', {}, v)]));
  const list = (items) => (items?.length ? h('ul', { class: 'plain' }, ...items.map((t) => h('li', { text: t }))) : '無');
  const supplies = Object.entries(w.supplies ?? {}).map(([k, v]) => `${supplyLabel(s.characterId, k)}：${v}${k === 'phone_battery' ? '%' : ''}`);
  return h('details', { class: 'card panel' },
    h('summary', { text: '目前狀況' }),
    dl([
      ['所在地點', locName(w.location)],
      ['里程碑', msList(s)],
      ['物資', list(supplies)],
      ['家人', `${CONTACT_LABELS[w.family?.contact] ?? '-'}（會合點：${locName(w.family?.meeting_point)}）`],
      ['交通', `${TRANSPORT_LABELS[w.transportation?.mode] ?? '-'}｜持有：${(w.transportation?.owned ?? []).map((m) => TRANSPORT_LABELS[m] ?? m).join('、') || '無'}${w.transportation?.fuel > 0 ? `｜燃料 ${w.transportation.fuel}` : ''}`],
      ['已確認資訊', list(w.information?.confirmed)],
      ['未證實傳聞', list(w.information?.unconfirmed)],
      ['周遭環境', `秩序${ORDER_LABELS[w.environment?.order] ?? '-'}`],
      ['備註', list(w.environment?.notes)],
      ['能力', h('div', { class: 'stats' }, ...Object.keys(STAT_LABELS).map((k) => statBar(STAT_LABELS[k], s.stats[k], ch.stats[k])))],
    ]),
    h('h3', { class: 'panel-sub', text: '回合軌跡紀錄' }),
    historyList(s),
  );
}

function historyList(s) {
  if (!s.history.length) return h('p', { class: 'muted small', text: '還沒有紀錄。' });
  return h('ol', { class: 'history' }, ...s.history.map((r) =>
    h('li', {},
      h('span', { class: `traj-block mini ${symbolClass(r.symbol)}`, title: symbolName(r.symbol), text: String(r.round) }),
      h('span', { class: 'history-text' }, h('b', { text: r.summary || `第 ${r.round} 回合` }), h('span', { class: 'muted small', text: `　${signed(r.score?.deltaDisplay ?? 0)} 分・${r.action?.text ?? ''}` })),
    )));
}

function renderGame() {
  const s = controller.state;
  const kind = (s?.characterId ?? ui.pendingCharacterId) === 'vp' ? 'vp' : 'civilian';
  if (s && ui.settleError && !ui.settling) {
    return h('div', { class: 'view game' }, renderHud(s), h('main', { class: 'content' }, renderSettleError(s)));
  }
  if (!s || ui.busy || ui.settling || s.phase === 'awaiting_ai' || ['ended', 'settled'].includes(s.phase)) {
    if (s && !ui.busy && !ui.settling && ['ended', 'settled'].includes(s.phase)) queueMicrotask(runSettle);
    const ending = s && (ui.settling || ['ended', 'settled'].includes(s.phase));
    const dynamic = (s?.flow ?? ui.flow) === 'dynamic';
    return h('div', { class: 'view game' }, s ? renderHud(s) : null, h('main', { class: 'content' }, renderWaiting(ending ? 'settle' : kind, dynamic)));
  }
  if (ui.lastRound !== s.round) {
    ui.lastRound = s.round;
    window.scrollTo(0, 0);
  }
  const inError = s.phase === 'error';
  return h('div', { class: 'view game' },
    renderHud(s),
    h('main', { class: 'content' },
      renderCheckSummary(s),
      renderLastResult(s),
      renderScene(s),
      inError ? renderErrorPanel(s) : renderOptions(s),
      inError ? null : renderFreeAction(s),
      worldPanel(s),
    ),
  );
}

// ─── 玩家行動（送出後鎖定輸入直到回應完成，3.6） ──────────────

async function submit(runner) {
  const s = controller.state;
  if (ui.busy || !s) return;
  ui.busy = true;
  render();
  const t0 = Date.now();
  let result;
  try {
    result = await runner();
  } catch (e) {
    console.error('[app] act failed', e);
    result = { ok: false };
  }
  // 劇本模式回應是即時的；讓氛圍等待畫面至少出現約 1 秒（7.6）。測試劇本不延遲。
  const minMs = controller.state?.testScriptId ? 0 : 800 + Math.floor(Math.random() * 400);
  const left = minMs - (Date.now() - t0);
  if (left > 0) await sleep(left);
  if (result?.ok) ui.draft = '';
  ui.busy = false;
  render();
}

async function startGame(characterId, { flow = ui.flow } = {}) {
  if (!guardMode(flow)) return;
  ui.flow = flow;
  const settings = getSettings();
  if (ui.replayFrom) {
    // 「換個身份再玩」：選角後才知道是否更換角色（12.1 replay）
    track('replay', { changed_character: ui.replayFrom !== characterId });
    ui.replayFrom = null;
  }
  if (controller.state) controller.abandon();
  ui.pendingCharacterId = characterId;
  ui.draft = '';
  ui.shownScore = 0;
  ui.hudShown = null;
  ui.lastRound = null;
  ui.settlement = null;
  ui.rated = null;
  ui.pngPromise = null;
  ui.waitIdx = 0;
  ui.settleError = null;
  ui.view = 'game';
  ui.busy = true;
  render();
  try {
    await controller.start({
      characterId,
      flow,
      // 有任何一把 Key 就用 AI（Grok 優先、Gemini 備援）；完全沒有 Key 的劇本模式直接用劇本內容
      mode: availableProviders(settings).length ? 'dev' : 'script',
      testScriptId: flow === 'classic' ? settings.testScriptId : '',
    });
  } catch (e) {
    console.error('[app] start failed', e);
    ui.busy = false;
    const info = e?.code ? errorInfo(e) : null;
    openModal({
      title: flow === 'dynamic' ? 'AI 動態模式無法開始' : '無法開始遊戲',
      body: h('div', { class: 'share-modal-body' },
        h('p', { text: info ? `${info.title}：${info.text}` : '請重新整理後再試。' }),
        e?.message ? h('p', { class: 'muted small', text: e.message }) : null,
        h('p', { class: 'muted small', text: '你可以回到首頁重新開始，或改選另一個玩法。' }),
      ),
      actions: [{ label: '回首頁', primary: true, onClick: ({ close }) => close() }],
    });
    go('home');
    return;
  }
  if (!controller.state?.testScriptId) await sleep(700);
  ui.busy = false;
  render();
}

// ─── 結算（8.4） ──────────────────────────────────────────────

async function runSettle() {
  if (ui.settling || ui.settlement) return;
  ui.settling = true;
  ui.waitIdx = 0;
  render();
  const t0 = Date.now();
  let result = null;
  try {
    result = await controller.settle();
  } catch (e) {
    console.error('[app] settle failed', e);
  }
  if (!controller.state?.testScriptId) await sleep(Math.max(0, 1000 - (Date.now() - t0)));
  ui.settling = false;
  if (!result) {
    ui.settleError = controller.state?.lastError ?? { code: 'provider', message: '結算失敗' };
    return render();
  }
  ui.settlement = result;
  ui.view = 'result';
  ui.rated = null;
  render();
  window.scrollTo(0, 0);
  prepareShareImage();
}

const shareUrl = () => `${location.origin}${location.pathname}`;

/** 預先產生分享圖，讓按下分享時還在使用者手勢的有效期內可直接開啟原生分享 */
function prepareShareImage() {
  const s = controller.state;
  if (!s || !ui.settlement) return;
  const settlement = ui.settlement;
  setTimeout(() => {
    if (ui.pngPromise) return;
    const p = renderCardPng(buildShareCard({ state: s, settlement, url: shareUrl() }));
    p.catch((e) => console.warn('[share] 預先產生圖片失敗：', e?.message ?? e));
    ui.pngPromise = p;
  }, 400);
}

function getPng() {
  const s = controller.state;
  if (!ui.pngPromise) {
    const p = renderCardPng(buildShareCard({ state: s, settlement: ui.settlement, url: shareUrl() }));
    p.catch(() => {});
    ui.pngPromise = p;
  }
  return ui.pngPromise;
}

function renderResult() {
  const s = controller.state;
  const st = ui.settlement;
  const ch = CHARACTERS[s.characterId];
  const sc = SCENARIOS.find((x) => x.id === s.scenarioId);
  const comment = st.comment ?? {};
  const last = controller.lastRecord;
  const cleared = s.endType === 'clear';
  const sourceLabel = ['script', 'test'].includes(st.commentSource) ? '劇本評語' : 'AI 評語';
  const taintedLabel = cleared ? MORAL_LABELS[st.moral] : null;

  const rate = (value) => {
    if (ui.rated) return;
    ui.rated = value;
    track('comment_rating', { rating: value, mode: ['script', 'test'].includes(st.commentSource) ? 'script' : 'ai' });
    thumbs.forEach((b) => { b.disabled = true; });
    toast('謝謝你的回饋');
  };
  const thumbs = [
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '讚', 'aria-label': '評語很讚', onclick: () => rate('up') }),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '倒讚', 'aria-label': '評語不太好', onclick: () => rate('down') }),
  ];

  return h('div', { class: 'view result' },
    h('header', { class: 'result-hero card' },
      h('p', { class: 'muted small', text: `《${sc?.title ?? ''}》・${ch.name}` }),
      h('p', { class: 'muted small', text: `目標：${ch.goal}` }),
      h('div', { class: 'big-score' }, h('span', { class: 'big-score-num', text: String(st.score) }), h('span', { class: 'big-score-max', text: '/100' })),
      h('h1', { class: 'result-title', text: `「${st.title}」` }),
      h('div', { class: 'chips' },
        h('span', { class: `chip end-${s.endType}`, text: `${END_TYPE_LABELS[s.endType] ?? ''}・第 ${s.endRound} 回合` }),
        cleared && st.rating ? h('span', { class: 'chip grade', text: `評級 ${st.rating.grade}` }) : null,
        ...(st.rating?.badges ?? []).map((b) => h('span', { class: 'chip badge', text: BADGE_LABELS[b] ?? b })),
        taintedLabel ? h('span', { class: 'chip tainted', text: taintedLabel }) : null,
      ),
      cleared && st.rating ? h('p', { class: 'muted small', text: `評級依表現分與風險分合計（${signed(st.rating.total)}）計算` }) : null,
      taintedLabel ? h('p', { class: 'muted small', text: '通關了，但這個「成功」附帶條件：你是怎麼走到這一步的，也一併記進了結局。' }) : null,
    ),
    last ? h('section', { class: 'card' },
      h('h2', { class: 'card-title', text: `最後一回合（第 ${last.round} 回合）` }),
      h('p', { class: 'narrative', text: last.narrative }),
      last.scoreReason ? h('p', { class: 'score-reason', text: `計分原因：${last.scoreReason}` }) : null,
      isDev() ? renderDevBox(s, last, { withNext: false }) : null) : null,
    h('section', { class: 'card' }, h('h2', { class: 'card-title', text: '里程碑' }), msList(s, { status: st.milestones })),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title', text: '三項能力' }),
      h('div', { class: 'stats' }, ...Object.keys(STAT_LABELS).map((k) => statBar(STAT_LABELS[k], st.stats[k], ch.stats[k])))),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title', text: sourceLabel }),
      h('p', { class: 'narrative', text: comment.personal_comment }),
      comment.highlight_action
        ? h('p', { class: 'highlight' }, h('b', { text: `關鍵行動回顧（第 ${comment.highlight_round ?? '?'} 回合）　` }), comment.highlight_action)
        : null,
      h('div', { class: 'row rate' }, h('span', { class: 'muted small', text: '這段評語如何？' }), ...thumbs)),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title', text: '回合軌跡' }),
      trajectoryBlocks(s.trajectory), historyList(s)),
    isDev() ? renderCheckSummary(s) : null,
    h('section', { class: 'card' },
      h('h2', { class: 'card-title', text: '真實世界可以做的準備' }),
      h('p', { class: 'muted small', text: '以下是官方提供的防災資源，不是遊戲內容。' }),
      h('ul', { class: 'resources' }, ...RESOURCES.map((r) =>
        h('li', {}, h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: r.name }), h('span', { class: 'muted small', text: `　${r.note}` }))))),
    h('div', { class: 'cta sticky-cta' },
      h('button', {
        type: 'button',
        class: 'btn btn-primary btn-lg',
        text: '分享戰績',
        onclick: () => runShareFlow({ getPng, text: buildShareText(s, { url: shareUrl() }), track, toast }),
      }),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-lg',
        text: `再玩一次（${ch.name}）`,
        onclick: () => { track('replay', { changed_character: false }); startGame(s.characterId, { flow: s.flow ?? 'classic' }); },
      }),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost',
        text: '換個身份再玩',
        onclick: () => replayWithOtherCharacter(),
      }),
      h('button', { type: 'button', class: 'btn btn-ghost', text: '回首頁', onclick: () => { controller.abandon(); go('home'); } }),
    ),
  );
}

function replayWithOtherCharacter() {
  const prev = controller.state?.characterId;
  ui.flow = controller.state?.flow ?? 'classic';
  ui.replayFrom = prev;
  controller.abandon();
  ui.settlement = null;
  go('character');
}

// ─── 繼續上一局 ───────────────────────────────────────────────

function renderResume() {
  const s = controller.state;
  const ch = CHARACTERS[s.characterId];
  return h('div', { class: 'view' },
    h('section', { class: 'card' },
      h('h2', { class: 'card-title', text: '發現上一局還沒結束' }),
      h('p', { text: `${ch.name}・第 ${Math.min(s.round, MAX_ROUNDS)} 回合・目前 ${s.scoreDisplay} 分` }),
      h('div', { class: 'cta' },
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', text: '繼續上一局', onclick: () => { ui.shownScore = s.scoreDisplay; ui.pendingCharacterId = s.characterId; go('game'); } }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-lg', text: '重新開始', onclick: () => { controller.abandon(); go('home'); } }),
      ),
    ),
  );
}

// ─── 設定頁 ───────────────────────────────────────────────────

function renderSettingsView() {
  const root = h('div', { class: 'view settings' });
  renderSettings(root, {
    storage,
    testScripts: TEST_SCRIPTS,
    onSaved: updateDevBadge,
    onBack: () => go('home'),
    toast,
  });
  return root;
}

// ─── 路由與 render ────────────────────────────────────────────

function go(view) {
  ui.view = view;
  render();
  window.scrollTo(0, 0);
}

function render() {
  const root = $('app');
  if (!root) return;
  clearInterval(waitTimer);
  updateDevBadge();
  const views = {
    home: renderHome,
    disclaimer: renderDisclaimer,
    character: renderCharacterSelect,
    game: renderGame,
    result: renderResult,
    resume: renderResume,
    settings: renderSettingsView,
  };
  if (ui.view === 'result' && (!controller.state || !ui.settlement)) ui.view = 'home';
  if ((ui.view === 'game' || ui.view === 'resume') && !controller.state && !ui.busy) ui.view = 'home';
  clear(root);
  root.append((views[ui.view] ?? renderHome)());
}

// ─── 啟動 ─────────────────────────────────────────────────────

function showFatal(errors) {
  const root = $('app');
  if (!root) return;
  clear(root);
  root.append(h('section', { class: 'card error-card', role: 'alert' },
    h('h2', { class: 'card-title', text: '設定檔檢查未通過，無法啟動' }),
    h('ul', {}, ...errors.map((e) => h('li', { text: e }))),
  ));
}

function showKeyGate(onContinue) {
  const makeKeyRow = (id, label) => {
    const input = h('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      placeholder: '貼上你的 API Key',
      'data-key-id': id,
    });
    const show = h('button', {
      type: 'button',
      class: 'btn btn-ghost btn-sm',
      text: '顯示',
      onclick: () => {
        const hidden = input.type === 'password';
        input.type = hidden ? 'text' : 'password';
        show.textContent = hidden ? '隱藏' : '顯示';
      },
    });
    return h('label', { class: 'field' },
      h('span', { class: 'field-label', text: `${label} API Key` }),
      h('div', { class: 'row' }, input, show),
    );
  };

  const grokRow = makeKeyRow('xai', 'Grok（xAI）');
  const geminiRow = makeKeyRow('gemini', 'Gemini（Google）');
  const errMsg = h('p', { class: 'muted small', role: 'alert', style: { color: 'var(--color-danger, #c0392b)', display: 'none' } });

  const startBtn = h('button', {
    type: 'button',
    class: 'btn btn-primary',
    text: '開始遊玩',
    onclick: () => {
      const grokVal = grokRow.querySelector('input').value.trim();
      const geminiVal = geminiRow.querySelector('input').value.trim();
      if (!grokVal && !geminiVal) {
        errMsg.textContent = '請至少填入一把 API Key（Grok 或 Gemini）才能開始。';
        errMsg.style.display = '';
        return;
      }
      const current = getSettings();
      const keys = { ...current.keys };
      if (grokVal) keys.xai = grokVal;
      if (geminiVal) keys.gemini = geminiVal;
      saveSettings(storage, { ...current, keys });
      backdrop.remove();
      onContinue();
    },
  });

  const settingsBtn = h('button', {
    type: 'button',
    class: 'btn btn-ghost',
    text: '進入完整設定',
    onclick: () => {
      backdrop.remove();
      // 跳設定頁；儲存 Key 後 onSaved 會觸發，若有 Key 就解鎖
      ui.view = 'settings';
      const origOnSaved = updateDevBadge;
      // 覆寫一次性的 onSaved callback：有 Key 就繼續 boot
      const guardedOnSaved = (saved) => {
        origOnSaved(saved);
        if (availableProviders(saved).length) {
          document.getElementById('key-gate-backdrop')?.remove();
          onContinue();
        }
      };
      render();
      // 把設定頁的 onSaved 換成帶閘門解鎖的版本
      const settingsRoot = document.querySelector('.view.settings');
      if (settingsRoot) {
        renderSettings(settingsRoot, {
          storage,
          testScripts: TEST_SCRIPTS,
          onSaved: guardedOnSaved,
          onBack: () => {
            if (!availableProviders(getSettings()).length) {
              showKeyGate(onContinue);
            } else {
              go('home');
            }
          },
          toast,
        });
      }
    },
  });

  const backdrop = h('div', {
    id: 'key-gate-backdrop',
    class: 'modal-backdrop',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': '輸入 API Key 才能開始遊玩',
  },
    h('div', { class: 'modal card' },
      h('h2', { class: 'card-title', text: '《What If》需要 API Key 才能遊玩' }),
      h('p', { class: 'muted small', text: '本遊戲的劇情由 AI 即時生成，需要 Grok 或 Gemini 的 API Key。兩把都填最穩，只填一把也可以。Key 只存在你的瀏覽器，不會上傳。' }),
      grokRow,
      geminiRow,
      errMsg,
      h('div', { class: 'row' }, startBtn, settingsBtn),
    ),
  );

  document.body.append(backdrop);
  grokRow.querySelector('input').focus();
}

function continueBoot() {
  const errors = validateScenarios(); // 2.2：設定檔有錯就拒絕啟動
  if (errors.length) {
    console.error('[What If] validateScenarios 失敗：', errors);
    showFatal(errors);
    return;
  }
  if (hasResumableGame(storage)) {
    const restored = controller.restore();
    if (restored) {
      ui.pendingCharacterId = restored.characterId;
      ui.shownScore = restored.scoreDisplay;
      // ended：直接進結算；其餘詢問「繼續上一局 / 重新開始」
      ui.view = ['ended', 'settled'].includes(restored.phase) ? 'game' : 'resume';
    }
  } else {
    // restore() 不處理已結算的局，這裡直接載入以便重新整理後仍可看結算與分享
    const saved = loadGame(storage);
    if (saved?.settled && saved.settlement) {
      controller.state = saved;
      ui.settlement = saved.settlement;
      ui.view = 'result';
      prepareShareImage();
    }
  }
  render();
}

function boot() {
  applyTheme(getSettings().theme);
  // 網路狀態改變時，首頁要立刻更新「離線」提示與按鈕
  for (const type of ['online', 'offline']) window.addEventListener(type, () => { if (ui.view === 'home') render(); });
  if (!availableProviders(getSettings()).length) {
    showKeyGate(continueBoot);
    return;
  }
  continueBoot();
}

boot();
