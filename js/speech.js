/**
 * 語音輸入（6.8）。語音只是輔助功能：不支援、或在 LINE / Instagram / Facebook
 * 內建瀏覽器時一律隱藏按鈕。辨識結果只填入文字框，玩家確認後才送出。
 *
 * 對外介面是 createRecognizer()，回傳 Recognizer：
 *   { start({ onResult(text), onError(code), onEnd() }), stop() }
 * 未來要換成雲端 STT 時，只要提供另一個同介面的工廠函式並註冊（setRecognizerFactory）。
 * 錯誤碼：'denied'（麥克風權限遭拒）、'no_speech'、'unsupported'、'error'。
 */

export const IN_APP_BROWSER_PATTERN = /Line\/|Instagram|FBAN|FBAV/i;

export function isInAppBrowser(ua = globalThis.navigator?.userAgent ?? '') {
  return IN_APP_BROWSER_PATTERN.test(ua);
}

function nativeCtor() {
  return globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null;
}

/** 是否應顯示語音按鈕 */
export function isSpeechAvailable() {
  if (isInAppBrowser()) return false;
  if (customFactory) return true;
  return Boolean(nativeCtor());
}

/** 瀏覽器內建（Web Speech API）的辨識器 */
export function createWebSpeechRecognizer() {
  const Ctor = nativeCtor();
  if (!Ctor) return null;
  let rec = null;
  return {
    start({ onResult = () => {}, onError = () => {}, onEnd = () => {} } = {}) {
      rec = new Ctor();
      rec.lang = 'zh-TW';
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let gotResult = false;
      rec.onresult = (e) => {
        const text = Array.from(e.results ?? [])
          .map((r) => r[0]?.transcript ?? '')
          .join('')
          .trim();
        if (text) {
          gotResult = true;
          onResult(text);
        }
      };
      rec.onerror = (e) => {
        const code = e?.error;
        if (code === 'not-allowed' || code === 'service-not-allowed') onError('denied');
        else if (code === 'no-speech') onError('no_speech');
        else onError('error');
      };
      rec.onend = () => onEnd({ gotResult });
      try {
        rec.start();
      } catch {
        onError('error');
        onEnd({ gotResult: false });
      }
    },
    stop() {
      try {
        rec?.stop();
      } catch {
        /* 已停止 */
      }
    },
  };
}

let customFactory = null;

/** 預留：註冊雲端 STT 等替代實作（回傳同樣介面的物件） */
export function setRecognizerFactory(factory) {
  customFactory = factory;
}

/** 建立辨識器；不可用時回傳 null */
export function createRecognizer() {
  if (isInAppBrowser()) return null;
  return customFactory ? customFactory() : createWebSpeechRecognizer();
}

export const SPEECH_ERROR_MESSAGES = Object.freeze({
  denied: '無法使用麥克風（權限遭拒），請改用文字輸入。',
  no_speech: '沒有聽到聲音，請再試一次或改用文字輸入。',
  unsupported: '這個瀏覽器不支援語音輸入，請改用文字輸入。',
  error: '語音辨識失敗，請再試一次或改用文字輸入。',
});
