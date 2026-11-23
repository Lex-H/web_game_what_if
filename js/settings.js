/**
 * 設定頁（9.2～9.6）。
 *
 * - 一般設定：語音開關。
 * - 「開發者」區塊只在網址帶 ?dev=1 時顯示（由呼叫端傳入 isDevUrl）。
 * - API Key 預設隱藏；Console 一律只印 maskKey() 後的 Key；Key 只存在 LocalStorage 的設定中，
 *   不會進入遊戲紀錄或遙測。
 * - Base URL 只能從白名單下拉選擇（9.3），不開放任意輸入。
 *
 * 本檔頂層不存取 DOM；DOM 只在 renderSettings() 內建立。
 */
import { h, clear } from './dom.js';
import { loadSettings, saveSettings, maskKey } from './state.js';
import { testConnection } from './api.js';

export const SECURITY_WARNING =
  'API Key 僅儲存在目前瀏覽器的本地儲存空間。請勿在共用或不可信任的裝置上使用。此方式不等同於安全的密碼保管庫。';

export const AI_MODE_OPTIONS = Object.freeze([
  { value: 'official', label: '官方（即時 AI 推演，第四階段開放）' },
  { value: 'dev', label: '開發者（使用自己的 API Key，第三階段開放）' },
  { value: 'script', label: '劇本（Mock）' },
]);
export const PROVIDER_OPTIONS = Object.freeze([{ value: 'gemini', label: 'Google Gemini' }]);
export const MODEL_OPTIONS = Object.freeze([
  { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite（最便宜）' },
  { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite（最新穩定版）' },
]);
/** 9.3：白名單。value 存進設定，實際網址由此表對應 */
export const BASE_URLS = Object.freeze({
  official: { label: '官方端點（Google Gemini）', url: 'https://generativelanguage.googleapis.com' },
  localhost: { label: 'http://localhost:8787（本機代理）', url: 'http://localhost:8787' },
});

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), control, hint ? h('span', { class: 'field-hint', text: hint }) : null);
}

function select(options, value, props = {}) {
  const el = h('select', { class: 'input', ...props }, ...options.map((o) => h('option', { value: o.value, text: o.label })));
  el.value = value;
  if (el.value !== value) el.selectedIndex = 0;
  return el;
}

/**
 * @param {HTMLElement} root 要渲染到的容器
 * @param {object} ctx
 * @param {Storage} ctx.storage
 * @param {boolean} ctx.isDevUrl 網址是否帶 ?dev=1
 * @param {Object<string,{title?:string}>} ctx.testScripts TEST_SCRIPTS
 * @param {(settings:object)=>void} [ctx.onSaved] 儲存後通知（更新 DEV 標記等）
 * @param {()=>void} ctx.onBack
 * @param {(msg:string)=>void} [ctx.toast]
 */
export function renderSettings(root, { storage, isDevUrl, testScripts = {}, onSaved = () => {}, onBack, toast = () => {} }) {
  clear(root);
  const settings = loadSettings(storage);

  const persist = (patch, note) => {
    const saved = saveSettings(storage, { ...loadSettings(storage), ...patch });
    // 9.5：Console 只顯示遮罩後的 Key
    console.debug('[settings] saved', { ...saved, apiKey: maskKey(saved.apiKey) });
    onSaved(saved);
    if (note) toast(note);
    return saved;
  };

  // ─── 一般設定 ──
  const voice = h('input', { type: 'checkbox', checked: settings.voice !== false, id: 'set-voice' });
  voice.addEventListener('change', () => persist({ voice: voice.checked }, voice.checked ? '已開啟語音輸入' : '已關閉語音輸入'));
  const general = h('section', { class: 'card' },
    h('h2', { class: 'card-title', text: '一般設定' }),
    h('label', { class: 'switch-row', for: 'set-voice' }, voice, h('span', { text: '顯示語音輸入按鈕（僅在瀏覽器支援時出現）' })),
  );

  const parts = [
    h('div', { class: 'page-head' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '返回', onclick: onBack }),
      h('h1', { class: 'page-title', text: '設定' }),
    ),
    general,
  ];

  // ─── 開發者區塊（9.2：只有 ?dev=1 才顯示） ──
  if (isDevUrl) {
    const mode = select(AI_MODE_OPTIONS, settings.aiMode);
    const provider = select(PROVIDER_OPTIONS, settings.provider, { disabled: PROVIDER_OPTIONS.length === 1 });
    const keyInput = h('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      placeholder: settings.apiKey ? `已儲存：${maskKey(settings.apiKey)}（留空表示不變更）` : '貼上你的 API Key',
    });
    const showKey = h('button', {
      type: 'button',
      class: 'btn btn-ghost btn-sm',
      text: '顯示',
      onclick: () => {
        const hidden = keyInput.type === 'password';
        keyInput.type = hidden ? 'text' : 'password';
        showKey.textContent = hidden ? '隱藏' : '顯示';
      },
    });
    const clearKey = h('button', {
      type: 'button',
      class: 'btn btn-danger btn-sm',
      text: '清除 Key',
      onclick: () => {
        keyInput.value = '';
        persist({ apiKey: '' }, '已清除 API Key');
        keyInput.placeholder = '貼上你的 API Key';
      },
    });
    const model = select(MODEL_OPTIONS, settings.model);
    const base = select(Object.entries(BASE_URLS).map(([value, v]) => ({ value, label: v.label })), settings.baseUrl);
    const mock = select(
      [{ value: '', label: '無（不強制）' }, ...Object.entries(testScripts).map(([value, s]) => ({ value, label: s.title ?? value }))],
      settings.testScriptId,
    );
    const devEnabled = h('input', { type: 'checkbox', checked: Boolean(settings.devEnabled), id: 'set-dev' });
    const testResult = h('p', { class: 'muted', role: 'status', text: '' });

    const dev = h('section', { class: 'card card-dev' },
      h('h2', { class: 'card-title', text: '開發者' }),
      h('p', { class: 'warning', role: 'note', text: SECURITY_WARNING }),
      field('AI 模式', mode),
      field('API Provider', provider, 'MVP 固定為 Google Gemini'),
      field('API Key', h('div', { class: 'row' }, keyInput, showKey), '預設隱藏；只儲存在這個瀏覽器，不會寫入遊戲紀錄或遙測。'),
      h('div', { class: 'row' }, clearKey),
      field('Model', model),
      field('API Base URL', base, '只能從白名單選擇，不開放任意網址。'),
      h('div', { class: 'row' },
        h('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: '測試連線',
          onclick: async (e) => {
            e.target.disabled = true;
            testResult.textContent = '連線中…';
            const s = loadSettings(storage);
            const r = await testConnection(s);
            testResult.textContent = r.ok
              ? `連線成功（${r.latencyMs} ms）`
              : `失敗：${r.error}`;
            e.target.disabled = false;
          },
        }),
      ),
      testResult,
      field('強制 Mock 劇本', mock, '選了之後開局角色與事件排程由測試劇本決定，並顯示逐回合比對。'),
      h('label', { class: 'switch-row', for: 'set-dev' }, devEnabled, h('span', { text: '啟用開發者模式（開啟後畫面角落顯示 DEV，且不送出遙測）' })),
      h('button', {
        type: 'button',
        class: 'btn btn-primary',
        text: '儲存設定',
        onclick: () => {
          const patch = {
            aiMode: mode.value,
            provider: provider.value,
            model: model.value,
            baseUrl: base.value,
            testScriptId: mock.value,
            devEnabled: devEnabled.checked,
          };
          if (keyInput.value.trim()) patch.apiKey = keyInput.value.trim();
          const saved = persist(patch, '已儲存設定');
          keyInput.value = '';
          keyInput.type = 'password';
          showKey.textContent = '顯示';
          keyInput.placeholder = saved.apiKey ? `已儲存：${maskKey(saved.apiKey)}（留空表示不變更）` : '貼上你的 API Key';
        },
      }),
    );
    parts.push(dev);
  }

  root.append(...parts);
}
