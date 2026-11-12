// 단계 사이 계산을 한곳에서: 2단계 배치 → 3단계 물량 → 4단계 공정 → 5단계 예산
import { DEFAULTS as MASS_D, generate } from './sim/massing.js';
import { quantities } from './sim/quantities.js';
import { schedule, P4_DEFAULTS } from './sim/process.js';
import { estimate, P5_DEFAULTS } from './sim/cost.js';
import { store, currentSite } from './store.js';

let memo = {};
export function pipeline(over = {}) {
  const s = store.get();
  const mp = { ...MASS_D, ...(s.mass || {}), ...(over.mass || {}), site: currentSite(s) };
  const pp = { ...P4_DEFAULTS, ...(s.proc || {}), ...(over.proc || {}) };
  const cp = { ...P5_DEFAULTS, ...(s.cost || {}), ...(over.cost || {}) };
  const km = JSON.stringify(mp), kp = JSON.stringify(pp), kc = JSON.stringify(cp);
  if (memo.km !== km) { memo = { km }; memo.gen = generate(mp); memo.Q = quantities(memo.gen); }
  if (memo.kp !== kp) { memo.kp = kp; memo.S = schedule(memo.gen, memo.Q, pp); memo.kc = null; }
  if (memo.kc !== kc) { memo.kc = kc; memo.E = estimate(memo.gen, memo.Q, memo.S, cp); }
  return { mp, pp, cp, gen: memo.gen, Q: memo.Q, S: memo.S, E: memo.E };
}

// 공통 서식
export const fmt = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
// 만원 → 조·억
export const won = (manwon, d) => {
  const eok = manwon / 1e4;
  if (Math.abs(eok) >= 1e4) return fmt(eok / 1e4, d == null ? 2 : d) + '조';
  return fmt(eok, d == null ? 0 : d) + '억';
};
export const download = (name, text, type) => {
  const blob = new Blob([text], { type }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const esc = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const csv = (rows) => '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');

// 떠 있는 툴팁 (차트 공통)
let tipEl = null;
export function tip(html, x, y) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl); }
  if (html == null) { tipEl.hidden = true; return; }
  tipEl.innerHTML = html; tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, x + 14), top = y + 16 + r.height > window.innerHeight ? y - r.height - 12 : y + 16;
  tipEl.style.left = Math.max(8, left) + 'px'; tipEl.style.top = Math.max(8, top) + 'px';
}

// 테마 바뀜 감지
export function onThemeChange(fn) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', fn);
  const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => { mq.removeEventListener('change', fn); mo.disconnect(); };
}
