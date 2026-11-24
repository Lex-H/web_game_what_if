import assert from 'node:assert/strict';
import { THEMES, DEFAULT_THEME, normalizeTheme } from '../js/theme.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
};

test('兩套主題：dark / bright，預設 dark', () => {
  assert.deepEqual(THEMES.map((t) => t.value), ['dark', 'bright']);
  assert.equal(DEFAULT_THEME, 'dark');
});

test('normalizeTheme：未知或舊資料退回預設主題', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('bright'), 'bright');
  for (const bad of [undefined, null, '', 'neon', 'cute', 42]) assert.equal(normalizeTheme(bad), 'dark');
});

console.log(`[theme] 共 ${passed} 項，通過 ${passed} 項，失敗 0 項`);
