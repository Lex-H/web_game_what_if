/**
 * 主題切換：在 <html> 設定 data-theme，並讓瀏覽器網址列顏色（theme-color）跟著 --bg 走。
 * 顏色只活在 style.css；本檔頂層不存取 document。
 */
export const THEMES = Object.freeze([
  { value: 'dark', label: '暗色' },
  { value: 'bright', label: '明亮' },
]);

export const DEFAULT_THEME = 'dark';

export const normalizeTheme = (theme) => (THEMES.some((t) => t.value === theme) ? theme : DEFAULT_THEME);

/** 套用主題；回傳實際套用的主題 id */
export function applyTheme(theme) {
  const id = normalizeTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = id;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  return id;
}

/** 讀取目前主題的 CSS 變數值（分享卡匯出需要實際色碼） */
export const themeColor = (name, fallback = '') =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
