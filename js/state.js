/**
 * 遊戲狀態與 LocalStorage 保存 / 還原（14.2）。
 *
 * storage 可注入（Node 測試用 memoryStorage），預設使用 window.localStorage。
 * LocalStorage 無法使用時（隱私模式、內建瀏覽器限制）自動退回記憶體，不讓遊戲當掉。
 */

export const KEYS = Object.freeze({
  game: 'whatif.game.v1',
  settings: 'whatif.settings.v1',
  device: 'whatif.device',
});

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

export function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = '__whatif_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStorage();
  }
}

function readJSON(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveGame(storage, state) {
  try {
    storage.setItem(KEYS.game, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage) {
  const state = readJSON(storage, KEYS.game);
  return state && typeof state === 'object' && state.gameId ? state : null;
}

export function clearGame(storage) {
  storage.removeItem(KEYS.game);
}

/** 尚未完成、可以「繼續上一局」的進度 */
export function hasResumableGame(storage) {
  const s = loadGame(storage);
  return Boolean(s && !s.settled);
}

// ─── 設定（9.3、14.2） ────────────────────────────────────────

export const DEFAULT_SETTINGS = Object.freeze({
  // 第二階段只有劇本模式可用；official / dev 在第三、四階段實作
  aiMode: 'script', // official | dev | script
  provider: 'gemini',
  model: 'gemini-3.1-flash-lite',
  baseUrl: 'official', // 白名單 key（9.3），不存任意網址
  apiKey: '',
  devEnabled: false, // 9.2：在開發者區塊手動開啟並儲存後才生效
  testScriptId: '', // 強制 Mock 劇本：test_clear / test_fail_score / test_fail_fatal
  voice: true,
});

export function loadSettings(storage) {
  return { ...DEFAULT_SETTINGS, ...(readJSON(storage, KEYS.settings) ?? {}) };
}

export function saveSettings(storage, settings) {
  const clean = { ...DEFAULT_SETTINGS, ...settings };
  storage.setItem(KEYS.settings, JSON.stringify(clean));
  return clean;
}

/** 9.5：Console 與錯誤訊息只顯示 Key 的前 4 碼與末 4 碼 */
export function maskKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** 12.2：匿名裝置 id */
export function deviceId(storage, rng = Math.random) {
  let id = storage.getItem(KEYS.device);
  if (!id) {
    id = `d_${randomId(rng)}`;
    storage.setItem(KEYS.device, id);
  }
  return id;
}

export function randomId(rng = Math.random) {
  if (rng === Math.random && globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.floor(rng() * 0xffffffff).toString(16).padStart(8, '0')).join('');
}
