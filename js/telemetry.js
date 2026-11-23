/**
 * 匿名遙測（12.1、12.2）。
 *
 * 第二階段沒有後端：事件只留在記憶體佇列並 console.debug；
 * sendEvent() 預留給第四階段的 POST /api/event，目前不會被呼叫。
 *
 * 隱私規則：
 * - 只使用匿名 deviceId 與 game_id。
 * - 每種事件只放行 12.1 表列的欄位（白名單），其他欄位一律丟棄；
 *   因此自由行動文字、API Key 即使被誤傳進來也不會被記錄。
 * - 開發者模式下不記錄，避免污染數據。
 */
import { deviceId } from './state.js';

export const EVENT_FIELDS = Object.freeze({
  scenario_preview_click: ['scenario_id'],
  game_start: ['character_id', 'mode'],
  round_complete: ['round', 'action_type', 'symbol', 'ai_ms', 'used_script', 'rejected', 'free_action_chars'],
  ai_error: ['type'],
  game_end: ['end_type', 'rounds', 'score', 'grade', 'duration_ms'],
  share_action: ['method', 'success'],
  replay: ['changed_character'],
  comment_rating: ['rating', 'mode'],
});

const SHORT_STRING = 32;

/** 只保留白名單欄位，且值必須是短字串、數字或布林 */
export function sanitizeFields(name, fields = {}) {
  const allowed = EVENT_FIELDS[name];
  if (!allowed) return null;
  const out = {};
  for (const key of allowed) {
    const v = fields[key];
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[key] = v;
    else if (typeof v === 'string' && v.length <= SHORT_STRING) out[key] = v;
  }
  return out;
}

/** 預留：第四階段改為 fetch('/api/event', { method: 'POST', body })。第二階段不會被呼叫。 */
export async function sendEvent(endpoint, payload) {
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

/**
 * @param {object} opts
 * @param {Storage} opts.storage 取得匿名裝置 id
 * @param {()=>string|null} opts.getGameId
 * @param {()=>boolean} opts.isDisabled 開發者模式啟用時回傳 true
 * @param {()=>number} [opts.now]
 */
export function createTelemetry({ storage, getGameId = () => null, isDisabled = () => false, now = Date.now }) {
  const queue = [];
  function track(name, fields = {}) {
    if (isDisabled()) return null;
    const clean = sanitizeFields(name, fields);
    if (!clean) return null;
    const event = { name, device_id: deviceId(storage), game_id: getGameId() ?? null, ts: now(), ...clean };
    queue.push(event);
    console.debug('[telemetry]', event);
    return event;
  }
  return { track, queue };
}
