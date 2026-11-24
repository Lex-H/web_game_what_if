/**
 * 設定頁（9.2～9.6）。所有選項一律顯示，分三張卡片：
 *
 * - AI 設定：Grok / Gemini 各自的 API Key 與模型、Base URL、測試連線。AI 一律先用 Grok，失敗才改用 Gemini。
 * - 一般設定：外觀主題（明亮／暗色／輕鬆可愛）、語音開關。
 * - 測試功能：開發者標記（不送遙測）、強制 Mock 測試劇本。
 *
 * API Key 預設隱藏；Console 一律只印 maskKey() 後的 Key；Key 只存在 LocalStorage 的設定中，
 * 不會進入遊戲紀錄或遙測。Base URL 只能從白名單下拉選擇（9.3），不開放任意輸入。
 *
 * 本檔頂層不存取 DOM；DOM 只在 renderSettings() 內建立。
 */
import { h, clear } from './dom.js';
import { loadSettings, saveSettings, maskKey } from './state.js';
import { PROVIDERS, PROVIDER_ORDER, testConnection } from './api.js';
import { THEMES, applyTheme, normalizeTheme } from './theme.js';

export const SECURITY_WARNING =
  'API Key 僅儲存在目前瀏覽器的本地儲存空間。請勿在共用或不可信任的裝置上使用。此方式不等同於安全的密碼保管庫。';

export const GEMINI_MODEL_OPTIONS = Object.freeze([
  { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite（最便宜）' },
  { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite（最新穩定版）' },
]);
/** 9.3：白名單。value 存進設定，實際網址由 api.js 依供應商對應 */
export const BASE_URL_OPTIONS = Object.freeze([
  { value: 'official', label: '官方端點（Grok：api.x.ai／Gemini：generativelanguage.googleapis.com）' },
  { value: 'localhost', label: 'http://localhost:8787（本機代理）' },
]);

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), control, hint ? h('span', { class: 'field-hint', text: hint }) : null);
}

function select(options, value, props = {}) {
  const el = h('select', { class: 'input', ...props }, ...options.map((o) => h('option', { value: o.value, text: o.label })));
  el.value = value;
  if (el.value !== value) el.selectedIndex = 0;
  return el;
}

const keyPlaceholder = (key) => (key ? `已儲存：${maskKey(key)}（留空表示不變更）` : '貼上你的 API Key');
const maskedKeys = (keys) => Object.fromEntries(Object.entries(keys ?? {}).map(([id, k]) => [id, maskKey(k)]));

/**
 * @param {HTMLElement} root 要渲染到的容器
 * @param {object} ctx
 * @param {Storage} ctx.storage
 * @param {Object<string,{title?:string}>} ctx.testScripts TEST_SCRIPTS
 * @param {(settings:object)=>void} [ctx.onSaved] 儲存後通知（更新 DEV 標記等）
 * @param {()=>void} ctx.onBack
 * @param {(msg:string)=>void} [ctx.toast]
 */
export function renderSettings(root, { storage, testScripts = {}, onSaved = () => {}, onBack, toast = () => {} }) {
  clear(root);
  const settings = loadSettings(storage);

  const persist = (patch, note) => {
    const saved = saveSettings(storage, { ...loadSettings(storage), ...patch });
    // 9.5：Console 只顯示遮罩後的 Key
    console.debug('[settings] saved', { ...saved, keys: maskedKeys(saved.keys) });
    onSaved(saved);
    if (note) toast(note);
    return saved;
  };

  // ─── AI 設定 ──
  const keyInputs = {};
  const keyRow = (id) => {
    const label = PROVIDERS[id].label;
    const input = h('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      placeholder: keyPlaceholder(settings.keys[id]),
    });
    keyInputs[id] = input;
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
    const clearBtn = h('button', {
      type: 'button',
      class: 'btn btn-danger btn-sm',
      text: '清除',
      onclick: () => {
        input.value = '';
        const current = loadSettings(storage);
        persist({ keys: { ...current.keys, [id]: '' } }, `已清除 ${label} API Key`);
        input.placeholder = keyPlaceholder('');
      },
    });
    return field(`${label} API Key`, h('div', { class: 'row' }, input, show, clearBtn));
  };

  const xaiModel = h('input', {
    class: 'input',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    value: settings.models.xai,
    placeholder: `留空使用預設（${PROVIDERS.xai.defaultModel}）`,
  });
  const geminiModel = select(GEMINI_MODEL_OPTIONS, settings.models.gemini || PROVIDERS.gemini.defaultModel);
  const base = select(BASE_URL_OPTIONS, settings.baseUrl);
  const testResult = h('p', { class: 'muted', role: 'status', style: { whiteSpace: 'pre-line' }, text: '' });

  const ai = h('section', { class: 'card' },
    h('h2', { class: 'card-title', text: 'AI 設定' }),
    h('p', { class: 'muted small', text: '一律先用 Grok，Grok 無法使用時自動改用 Gemini。兩把都填最穩；只填一把也可以。' }),
    h('p', { class: 'warning', role: 'note', text: SECURITY_WARNING }),
    ...PROVIDER_ORDER.map(keyRow),
    field('Grok 模型', xaiModel, '一般不用改；xAI 推出新模型時可在這裡填入模型名稱。'),
    field('Gemini 模型', geminiModel),
    field('API Base URL', base, '只能從白名單選擇，不開放任意網址。'),
    h('div', { class: 'row' },
      h('button', {
        type: 'button',
        class: 'btn btn-primary',
        text: '儲存 AI 設定',
        onclick: () => {
          const current = loadSettings(storage);
          const keys = { ...current.keys };
          for (const [id, input] of Object.entries(keyInputs)) {
            if (input.value.trim()) keys[id] = input.value.trim();
          }
          const saved = persist({
            keys,
            models: { xai: xaiModel.value.trim(), gemini: geminiModel.value },
            baseUrl: base.value,
          }, '已儲存 AI 設定');
          for (const [id, input] of Object.entries(keyInputs)) {
            input.value = '';
            input.type = 'password';
            input.placeholder = keyPlaceholder(saved.keys[id]);
          }
        },
      }),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost',
        text: '測試連線',
        onclick: async (e) => {
          e.target.disabled = true;
          testResult.textContent = '連線中…（測試的是已儲存的設定）';
          const r = await testConnection(loadSettings(storage));
          testResult.textContent = r.results.length
            ? r.results.map((x) => `${PROVIDERS[x.provider].label}：${x.ok ? `成功（${x.latencyMs} ms）` : `失敗－${x.error}`}`).join('\n')
            : `失敗：${r.error}`;
          e.target.disabled = false;
        },
      }),
    ),
    testResult,
  );

  // ─── 一般設定 ──
  const voice = h('input', { type: 'checkbox', checked: settings.voice !== false, id: 'set-voice' });
  voice.addEventListener('change', () => persist({ voice: voice.checked }, voice.checked ? '已開啟語音輸入' : '已關閉語音輸入'));
  const theme = select(THEMES, normalizeTheme(settings.theme));
  theme.addEventListener('change', () => {
    applyTheme(theme.value);
    persist({ theme: theme.value }, '已切換主題');
  });
  const general = h('section', { class: 'card' },
    h('h2', { class: 'card-title', text: '一般設定' }),
    field('外觀主題', theme, '會連同分享戰績的圖片一起套用。'),
    h('label', { class: 'switch-row', for: 'set-voice' }, voice, h('span', { text: '顯示語音輸入按鈕（僅在瀏覽器支援時出現）' })),
  );

  // ─── 測試功能 ──
  const mock = select(
    [{ value: '', label: '無（正常遊玩）' }, ...Object.entries(testScripts).map(([value, s]) => ({ value, label: s.title ?? value }))],
    settings.testScriptId,
  );
  const devEnabled = h('input', { type: 'checkbox', checked: Boolean(settings.devEnabled), id: 'set-dev' });
  const testing = h('section', { class: 'card card-dev' },
    h('h2', { class: 'card-title', text: '測試功能' }),
    h('label', { class: 'switch-row', for: 'set-dev' }, devEnabled, h('span', { text: '顯示開發者細節（畫面角落顯示 DEV、每回合顯示拒絕與降級紀錄，且不送出遙測）' })),
    field('強制 Mock 測試劇本', mock, '只影響劇本模式：選了之後開局角色與事件排程由測試劇本決定，並逐回合比對預期數值。'),
    h('button', {
      type: 'button',
      class: 'btn btn-primary',
      text: '儲存測試設定',
      onclick: () => persist({ testScriptId: mock.value, devEnabled: devEnabled.checked }, '已儲存測試設定'),
    }),
  );

  root.append(
    h('div', { class: 'page-head' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '返回', onclick: onBack }),
      h('h1', { class: 'page-title', text: '設定' }),
    ),
    ai,
    general,
    testing,
  );
}
