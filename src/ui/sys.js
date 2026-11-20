// 시스템 화면 부품: 섹션 코드 라벨 · 상태 점 · 단계 머리 · 필터 탭 · 용도 글리프 (알고리즘으로 그리는 기호)
export const STEP_TOTAL = 7;
const pad2 = (n) => String(n).padStart(2, '0');
const escH = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export { escH };

// // 04.00 SEC_METHOD [04 / 07]
export const code = (n, key, sub = 0) => `<span class="sx-code"><span class="sl">//</span> ${pad2(n)}.${pad2(sub)} SEC_${key} <b>[${pad2(n)} / ${pad2(STEP_TOTAL)}]</b></span>`;
export const dot = (text, tone = 'acc') => `<span class="sx-dot ${tone}"><i></i>${text}</span>`;

// 단계 머리: 지금 할 일 한 줄 · 제목 · 한 줄 요약 · 버튼 · 숫자 3개. 긴 설명은 '이 단계 설명'을 눌러야 펼쳐진다 (첫 화면에는 핵심만)
// n·key·status는 예전 코드 라벨용 값이라 받기만 하고 그리지 않는다
export function head({ title, dim, desc, stats = [], actions = '' }) {
  return `<header class="sx-head">
    <div class="sx-head-l">
      <div class="sx-guide" data-guide hidden></div>
      <h1 class="sx-title">${title}<span class="pd">.</span></h1>
      ${dim ? `<p class="sx-dim">${dim}</p>` : ''}
      ${desc ? moreDesc(desc) : ''}
      ${actions ? `<div class="sx-act">${actions}</div>` : ''}
    </div>
    ${stats.length ? `<dl class="sx-stats" id="sx-stats">${stats.map(statCell).join('')}</dl>` : ''}
  </header>`;
}
// 접어 둔 단계 설명
export const moreDesc = (desc, id = '') => `<details class="sx-more"><summary>이 단계 설명</summary><p class="sx-desc"${id ? ` id="${id}"` : ''}>${desc}</p></details>`;
export const statCell = ([k, v, s, tone]) => `<div class="${tone || ''}"><dt>${k}</dt><dd>${v}</dd>${s ? `<span>${s}</span>` : ''}</div>`;

// 필터 탭: [{k, name, n}], 지금 값
export const tabs = (list, cur, attr = 'data-tab', label = '필터') => `<div class="sx-tabs" role="tablist" aria-label="${label}">${list.map(t => `<button type="button" role="tab" ${attr}="${t.k}" aria-selected="${t.k === cur}">${t.name}<span class="c">(${t.n})</span></button>`).join('')}</div>`;

// 소제목: 03.2 이름 — 설명
export const sub = (n, title, hint = '', right = '') => `<div class="sx-sub"><span class="sx-sn">${n}</span><h2>${title}</h2>${hint ? `<span class="hint">${hint}</span>` : ''}${right ? `<span class="r">${right}</span>` : ''}</div>`;

// 가로 막대 (값 0~1)
export const hbar = (v, tone = '') => `<span class="sx-hbar ${tone}"><i style="width:${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%"></i></span>`;

// ---------- 용도 글리프: 생성기 종류마다 다른 규칙으로 격자·원·선을 그린다 ----------
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
export function glyph(u, size = 72) {
  const r = (k) => hash(u.id + k);
  const S = 64, out = [];
  const L = (x1, y1, x2, y2, c = 'g-l') => out.push(`<line class="${c}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  const R = (x, y, w, h, c = 'g-f') => out.push(`<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}"/>`);
  const C = (x, y, rr, c = 'g-f') => out.push(`<circle class="${c}" cx="${x}" cy="${y}" r="${rr}"/>`);
  // 바탕 점 격자
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) out.push(`<circle class="g-d" cx="${4 + i * 8}" cy="${4 + j * 8}" r=".6"/>`);
  switch (u.gen) {
    case 'housing': { const n = u.id === 'mixed' ? 5 : 6; for (let i = 0; i < n; i++) { const h = 14 + Math.round(r(i) * 30) + (u.id === 'mixed' && i === 2 ? 14 : 0); R(6 + i * 9.4, S - 6 - h, 6, h, i === 2 && u.id === 'mixed' ? 'g-a' : 'g-f'); } break; }
    case 'tower': { const h = u.kind === 'hotel' ? 44 : 52; R(22, S - 6 - h, 20, h); for (let y = S - 10; y > S - 6 - h; y -= 4) L(22, y, 42, y, 'g-k'); R(10, S - 18, 44, 12, 'g-o'); R(28, S - 6 - h - 4, 8, 4, 'g-a'); break; }
    case 'mall': { R(6, 30, 52, 28); for (let i = 0; i < 6; i++) R(9 + i * 8.4, 50, 5.4, 8, 'g-k'); C(32, 30, 10, 'g-a'); break; }
    case 'museum': { R(8, 34, 48, 24); R(16, 22, 32, 12, 'g-o'); for (let i = 0; i < 7; i++) L(10 + i * 7, 34, 10 + i * 7, 58, 'g-k'); R(30, 14, 4, 8, 'g-a'); break; }
    case 'arena': { out.push(`<ellipse class="g-f" cx="32" cy="38" rx="26" ry="18"/>`); out.push(`<ellipse class="g-o" cx="32" cy="38" rx="16" ry="10"/>`); out.push(`<ellipse class="g-a" cx="32" cy="38" rx="6" ry="3.6"/>`); break; }
    case 'hospital': { R(8, 40, 48, 18, 'g-o'); R(14, 12, 14, 28); R(36, 18, 14, 22); R(28, 22, 8, 3, 'g-a'); R(30.5, 19.5, 3, 8, 'g-a'); break; }
    case 'campus': { for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) R(7 + i * 18, 14 + j * 22, 14, 16, (i + j) % 3 ? 'g-f' : 'g-o'); L(4, 33, 60, 33, 'g-a'); break; }
    case 'fab': { R(6, 22, 36, 34); for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) R(8 + i * 5.6, 25 + j * 7.6, 3.6, 5.4, 'g-k'); R(44, 34, 14, 22, 'g-o'); C(51, 26, 4, 'g-a'); C(51, 16, 3, 'g-o'); break; }
    case 'factory': { R(6, 26, 52, 30); for (let i = 0; i < 6; i++) out.push(`<path class="g-o" d="M${6 + i * 8.7} 26 l4.3 -6 l4.3 6z"/>`); R(46, 12, 5, 14, 'g-a'); break; }
    case 'dc': { R(8, 14, 48, 42); for (let i = 0; i < 4; i++) for (let j = 0; j < 9; j++) R(11 + i * 11.4, 17 + j * 4.3, 9, 2.6, 'g-k'); for (let i = 0; i < 4; i++) C(14 + i * 12, 9, 2.4, 'g-a'); break; }
    case 'logistics': { R(4, 20, 56, 36); for (let i = 0; i < 9; i++) R(6 + i * 6.1, 50, 4, 6, 'g-k'); out.push(`<path class="g-a" d="M4 20 L18 12 L60 12 L60 20"/>`); break; }
    case 'plant': {
      if (u.id === 'water') { for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) R(6 + i * 18, 14 + j * 20, 15, 16, 'g-o'); C(50, 52, 8); C(30, 52, 6, 'g-a'); }
      else if (u.id === 'power') { R(6, 30, 26, 26); R(36, 22, 12, 34, 'g-o'); R(52, 8, 5, 48, 'g-a'); C(18, 18, 7, 'g-o'); }
      else { for (let i = 0; i < 3; i++) R(8 + i * 8, 14 + i * 4, 5, 42 - i * 4, i === 1 ? 'g-a' : 'g-f'); L(4, 40, 60, 40, 'g-k'); L(4, 44, 60, 44, 'g-k'); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) C(42 + i * 12, 22 + j * 14, 5.2, 'g-o'); R(58, 4, 2.4, 22, 'g-a'); }
      break;
    }
    default: R(12, 12, 40, 40);
  }
  return `<svg class="sx-glyph" viewBox="0 0 ${S} ${S}" width="${size}" height="${size}" aria-hidden="true">${out.join('')}</svg>`;
}

// 숫자 올라가기 (처음 보일 때 한 번)
export function countUp(el, to, { d = 0, ms = 900, fmt = (v) => v.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }) } = {}) {
  if (!el) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (now) => { const u = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - u, 3); el.textContent = fmt(to * e); if (u < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
