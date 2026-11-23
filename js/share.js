/**
 * 分享卡與分享流程（8.4、8.5）。
 *
 * - buildShareCard()：產生 1080×1920（9:16）暗色卡片 DOM。軌跡用 CSS 色塊，不用 emoji；
 *   只用系統字型；不使用外部圖片。樣式在 style.css 的 .sc- 前綴。
 * - renderCardPng()：用 html2canvas（window.html2canvas，vendor 自行託管）匯出 1080×1920 PNG。
 * - runShareFlow()：原生分享 → 內建瀏覽器彈窗 → 下載 + 複製 → 剪貼簿失敗顯示可全選文字框。
 *   html2canvas 不存在或匯出失敗時降級成只提供複製文字。
 *
 * 本檔頂層不存取 document / window，載入時不會碰 DOM。
 */
import { h } from './dom.js';
import { SYMBOLS } from './rules.js';
import { CHARACTERS, SCENARIOS, STAT_LABELS, MILESTONE_STATUS_LABELS } from './scenarios.js';
import { BADGE_LABELS, END_TYPE_LABELS } from './engine.js';
import { isInAppBrowser } from './speech.js';

export { isInAppBrowser };

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

const SYMBOL_CLASS = new Map([
  [SYMBOLS.clear, 'sym-clear'],
  [SYMBOLS.fail, 'sym-fail'],
  [SYMBOLS.danger, 'sym-danger'],
  [SYMBOLS.progress, 'sym-progress'],
  [SYMBOLS.neutral, 'sym-neutral'],
]);
const SYMBOL_NAME = new Map([
  [SYMBOLS.clear, '通關'],
  [SYMBOLS.fail, '失敗'],
  [SYMBOLS.danger, '受挫'],
  [SYMBOLS.progress, '推進'],
  [SYMBOLS.neutral, '持平'],
]);

export const symbolClass = (sym) => SYMBOL_CLASS.get(sym) ?? 'sym-neutral';
export const symbolName = (sym) => SYMBOL_NAME.get(sym) ?? '';

/** 回合軌跡：每回合一個 CSS 色塊（色塊內放回合數字，色盲也能靠位置與文字辨識） */
export function trajectoryBlocks(trajectory, { total = 7, className = 'traj' } = {}) {
  const items = Array.isArray(trajectory) ? trajectory : [...String(trajectory ?? '')];
  const blocks = items.map((sym, i) =>
    h('span', { class: `traj-block ${symbolClass(sym)}`, title: `第 ${i + 1} 回合：${symbolName(sym)}`, text: String(i + 1) }),
  );
  for (let i = items.length; i < total; i += 1) blocks.push(h('span', { class: 'traj-block sym-empty', text: String(i + 1) }));
  return h('div', { class: className, role: 'img', aria: { label: `回合軌跡：${items.map(symbolName).join('、')}` } }, blocks);
}

const clip = (text, max) => {
  const chars = [...String(text ?? '')];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

const STATUS_CLASS = { none: 'st-none', partial: 'st-partial', done: 'st-done', lost: 'st-lost' };

/** 8.4：9:16 分享卡。data = { state, settlement, url } */
export function buildShareCard({ state, settlement, url = '' }) {
  const scenario = SCENARIOS.find((s) => s.id === state.scenarioId);
  const character = CHARACTERS[state.characterId];
  const cleared = state.endType === 'clear';
  const badges = (settlement.rating?.badges ?? []).map((b) => BADGE_LABELS[b] ?? b);
  const comment = settlement.comment ?? {};
  const roundText = cleared
    ? `第 ${state.endRound} 回合達成`
    : state.endType === 'normal'
      ? `撐到第 ${state.endRound} 回合`
      : `在第 ${state.endRound} 回合出局`;

  return h(
    'div',
    { class: 'sc', id: 'share-card' },
    h('div', { class: 'sc-top' },
      h('div', { class: 'sc-brand', text: 'What If' }),
      h('div', { class: 'sc-scenario', text: `《${scenario?.title ?? ''}》` }),
      h('div', { class: 'sc-char' }, h('b', { text: character.name }), h('span', { text: `　目標：${character.goal}` })),
    ),
    h('div', { class: 'sc-score-wrap' },
      h('div', { class: 'sc-score' }, h('span', { class: 'sc-score-num', text: String(settlement.score) }), h('span', { class: 'sc-score-max', text: '/100' })),
      h('div', { class: 'sc-title', text: `「${settlement.title}」` }),
      h('div', { class: 'sc-meta' },
        h('span', { class: 'sc-chip', text: `${END_TYPE_LABELS[state.endType] ?? ''}・${roundText}` }),
        cleared && settlement.rating ? h('span', { class: 'sc-chip sc-grade', text: `評級 ${settlement.rating.grade}` }) : null,
        ...badges.map((b) => h('span', { class: 'sc-chip sc-badge', text: b })),
      ),
    ),
    h('div', { class: 'sc-block' },
      h('div', { class: 'sc-h', text: '里程碑' }),
      ...character.milestones.map((def) => {
        const st = settlement.milestones?.[def.id] ?? state.milestones[def.id];
        return h('div', { class: 'sc-ms' },
          h('span', { class: `sc-dot ${STATUS_CLASS[st] ?? 'st-none'}` }),
          h('span', { class: 'sc-ms-name', text: def.name }),
          h('span', { class: `sc-ms-st ${STATUS_CLASS[st] ?? ''}`, text: MILESTONE_STATUS_LABELS[st] ?? st }),
        );
      }),
    ),
    h('div', { class: 'sc-block' },
      h('div', { class: 'sc-h', text: '能力' }),
      ...Object.keys(STAT_LABELS).map((key) => {
        const v = settlement.stats?.[key] ?? state.stats[key];
        return h('div', { class: 'sc-stat' },
          h('span', { class: 'sc-stat-name', text: STAT_LABELS[key] }),
          h('span', { class: 'sc-bar' }, h('span', { class: 'sc-bar-fill', style: { width: `${Math.max(0, Math.min(100, v))}%` } })),
          h('span', { class: 'sc-stat-v', text: String(v) }),
        );
      }),
    ),
    h('div', { class: 'sc-comment' },
      h('div', { class: 'sc-quote', text: clip(comment.personal_comment, 110) }),
      comment.highlight_action
        ? h('div', { class: 'sc-highlight', text: `關鍵行動（第 ${comment.highlight_round ?? '?'} 回合）：${clip(comment.highlight_action, 40)}` })
        : null,
    ),
    h('div', { class: 'sc-block' },
      h('div', { class: 'sc-h', text: '回合軌跡' }),
      trajectoryBlocks(state.trajectory, { className: 'sc-traj traj' }),
    ),
    h('div', { class: 'sc-foot', text: url ? `不服來戰　${url}` : '不服來戰' }),
  );
}

// ─── 匯出 PNG ─────────────────────────────────────────────────

export const html2canvasAvailable = () => typeof globalThis.html2canvas === 'function';

/** 匯出固定 1080×1920 的 PNG Blob；失敗時丟出錯誤（呼叫端降級為複製文字） */
export async function renderCardPng(card) {
  if (!html2canvasAvailable()) throw new Error('html2canvas_missing');
  const host = h('div', { class: 'share-host', id: 'share-host' }, card);
  document.body.append(host);
  try {
    await document.fonts?.ready; // 8.4：字型載入完成後才截圖
    const canvas = await globalThis.html2canvas(card, {
      scale: 1,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      windowWidth: CARD_WIDTH,
      windowHeight: CARD_HEIGHT,
      scrollX: 0,
      scrollY: -window.scrollY,
      backgroundColor: '#0d1117',
      useCORS: false,
      allowTaint: false,
      logging: false,
      onclone: (doc) => {
        const clonedHost = doc.getElementById('share-host');
        if (clonedHost) clonedHost.style.left = '0px';
      },
    });
    let out = canvas;
    if (canvas.width !== CARD_WIDTH || canvas.height !== CARD_HEIGHT) {
      out = document.createElement('canvas');
      out.width = CARD_WIDTH;
      out.height = CARD_HEIGHT;
      out.getContext('2d').drawImage(canvas, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    }
    const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('toBlob_failed');
    return blob;
  } finally {
    host.remove();
  }
}

// ─── 複製 / 下載 / 彈窗 ───────────────────────────────────────

/** 複製文字；成功回傳 true */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 改試舊式作法 */
  }
  try {
    const ta = h('textarea', { value: text, readOnly: true, style: { position: 'fixed', top: '-1000px', opacity: '0' } });
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return Boolean(ok);
  } catch {
    return false;
  }
}

export function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = h('a', { href, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

/** 通用彈窗；actions 的 onClick 會收到 { close }。回傳 { close, el } */
export function openModal({ title, body, actions = [], onClose = () => {} }) {
  const backdrop = h('div', { class: 'modal-backdrop', role: 'dialog', aria: { modal: 'true', label: title } });
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  function close() {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose();
  }
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  const box = h('div', { class: 'modal' },
    h('h3', { class: 'modal-title', text: title }),
    h('div', { class: 'modal-body' }, body),
    h('div', { class: 'modal-actions' }, ...actions.map((a) =>
      h('button', { type: 'button', class: `btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`, text: a.label, onclick: () => a.onClick?.({ close }) }))),
  );
  backdrop.append(box);
  document.body.append(backdrop);
  box.querySelector('button')?.focus();
  return { close, el: backdrop };
}

// ─── 分享流程（8.5） ──────────────────────────────────────────

/**
 * @param {object} opts
 * @param {()=>Promise<Blob>} opts.getPng 取得（預先產生好的）PNG；失敗代表只能複製文字
 * @param {string} opts.text 戰績文字（buildShareText）
 * @param {(name:string, fields:object)=>void} opts.track
 * @param {(msg:string)=>void} [opts.toast]
 * @param {string} [opts.filename]
 */
export async function runShareFlow({ getPng, text, track = () => {}, toast = () => {}, filename = 'what-if-result.png' }) {
  let blob = null;
  try {
    blob = await getPng();
  } catch (e) {
    console.warn('[share] 圖片產生失敗，改為只提供複製文字', e?.message ?? e);
  }

  // 2. Web Share API（圖片 + 文字）
  if (blob) {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        track('share_action', { method: 'native', success: true });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        track('share_action', { method: 'native', success: false }); // 玩家自行取消
        return;
      }
      console.warn('[share] 原生分享失敗，改用備援', e?.name ?? e);
    }
  }

  // 3. 內建瀏覽器：彈窗顯示圖片，長按儲存；4. 其他瀏覽器：下載 PNG
  const inApp = isInAppBrowser();
  let objectUrl = null;
  const body = h('div', { class: 'share-modal-body' });
  if (blob) {
    objectUrl = URL.createObjectURL(blob);
    body.append(h('img', { class: 'share-preview', src: objectUrl, alt: '本局戰績分享圖' }));
    body.append(h('p', { class: 'muted', text: inApp ? '長按圖片儲存，再到聊天或社群貼上。' : '圖片已下載；若沒有自動下載，請長按或點右鍵儲存圖片。' }));
    if (!inApp) {
      try {
        downloadBlob(blob, filename);
        track('share_action', { method: 'image', success: true });
      } catch {
        track('share_action', { method: 'image', success: false });
      }
    } else {
      track('share_action', { method: 'image', success: true });
    }
  } else {
    body.append(h('p', { class: 'muted', text: '目前無法產生分享圖片，請複製戰績文字貼上分享。' }));
  }

  const textarea = h('textarea', { class: 'share-text', readOnly: true, rows: 7, value: text, hidden: true });
  body.append(textarea);

  const doCopy = async () => {
    const ok = await copyText(text);
    track('share_action', { method: 'copy', success: ok });
    if (ok) {
      toast('已複製戰績');
    } else {
      toast('無法自動複製，請手動全選複製');
      textarea.hidden = false;
      textarea.focus();
      textarea.select();
    }
  };

  openModal({
    title: '分享戰績',
    body,
    actions: [
      { label: '複製戰績', primary: true, onClick: doCopy },
      ...(blob && !inApp ? [{ label: '再下載一次', onClick: () => downloadBlob(blob, filename) }] : []),
      { label: '關閉', onClick: ({ close }) => close() },
    ],
    onClose: () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
  });
}
