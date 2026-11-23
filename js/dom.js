/**
 * 極小的 DOM 建立工具。所有文字一律走 textContent / createTextNode，
 * 不使用 innerHTML，避免劇本、AI 或玩家文字造成 XSS。
 * 只在函式被呼叫時才碰 document，模組頂層不存取 DOM。
 */

/**
 * h('div', { class: 'a', onclick: fn, aria: {label:'x'}, data: {k:'v'}, style: {color:'red'} }, child, ...)
 * 子節點可為字串、數字、Node、陣列（會攤平）、null / false（略過）。
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'aria') for (const [k, v] of Object.entries(value)) el.setAttribute(`aria-${k}`, v);
    else if (key === 'data') for (const [k, v] of Object.entries(value)) el.dataset[k] = v;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key in el && typeof value !== 'object') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
