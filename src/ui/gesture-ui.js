// 매스 단계 '형태 제스처' 패널: 갤러리(실루엣 아이콘) + 강도·리듬 + 설계안 JSON 불러오기/내보내기
// 공동주택(mass.js)과 비주거(massx.js) 화면이 같이 쓴다.
import { GESTURES, GESTURE_BY_ID, GDEF, GMETA, gestureIcon, parseSpec, specOf } from '../sim/gesture.js';

export function gestureHTML(p) {
  const id = p.gesture || GDEF.gesture, g = GESTURE_BY_ID[id];
  const custom = id === 'custom';
  const ctl = (k) => {
    const m = GMETA[k], v = p[k] ?? GDEF[k];
    return `<div class="ctl${v !== GDEF[k] ? ' changed' : ''}"><label for="gx-${k}">${m.label}</label>
      <span class="inbox"><input type="number" data-gk="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}" aria-label="${m.label} 값"><span class="unit">${m.unit}</span></span>
      <input type="range" id="gx-${k}" data-gk="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}">${m.note ? `<span class="hint">${m.note}</span>` : ''}</div>`;
  };
  const showStep = g && (g.step || id === 'mix');
  return `<div class="gx-grid" role="group" aria-label="형태 제스처">${GESTURES.map(x => `<button type="button" data-gest="${x.id}" aria-pressed="${x.id === id}" title="${x.name} · ${x.en}">${gestureIcon(x.id)}<span>${x.name}</span></button>`).join('')}
      ${custom ? `<button type="button" data-gest="custom" aria-pressed="true" title="불러온 설계안">${customIcon(p.gCustom)}<span>불러온 안</span></button>` : ''}</div>
    <p class="gx-note"><b>${custom ? '불러온 설계안' : g ? `${g.name} <i>${g.en}</i>` : ''}</b> ${custom ? `층별 판 ${p.gCustom.length}개를 그대로 쌓았습니다. 공법·공정·예산·위험이 이 형태로 다시 계산됩니다.` : g ? g.note : ''}</p>
    ${id !== 'box' && !custom ? ctl('gAmt') + (showStep ? ctl('gStep') : '') : ''}
    <div class="gx-io"><button type="button" class="chipbtn" data-gx="import">설계안 불러오기 (JSON)</button><button type="button" class="chipbtn" data-gx="export">현재 형태 내보내기</button><input type="file" accept=".json,application/json" hidden data-gx="file"></div>`;
}
function customIcon(list) {
  const n = Math.min(14, list.length), H = 56, hh = (H - 6) / n, out = [];
  for (let k = 0; k < n; k++) { const c = list[Math.floor(k * list.length / n)]; const w = 18 * c.sx, x = 22 + c.ox * 18 - w / 2, y = H - 3 - (k + 1) * hh; out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(hh - 0.9).toFixed(1)}"/>`); }
  return `<svg viewBox="0 0 44 56" aria-hidden="true">${out.join('')}</svg>`;
}

// host 안의 클릭·입력을 받아 onChange(patch)로 넘긴다. main(): 내보낼 대표 동
export function bindGesture(host, { get, onChange, main }) {
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gest]');
    if (b) { const id = b.dataset.gest; if (id === 'custom' && !get().gCustom) return; onChange({ gesture: id }); return; }
    const io = e.target.closest('[data-gx]'); if (!io) return;
    if (io.dataset.gx === 'import') host.querySelector('[data-gx="file"]').click();
    if (io.dataset.gx === 'export') {
      const m = main(); if (!m) return;
      const blob = new Blob([JSON.stringify(specOf(m, get()), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mass-gesture-${m.id || 'main'}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  });
  host.addEventListener('change', async (e) => {
    if (e.target.dataset.gx !== 'file' || !e.target.files || !e.target.files[0]) return;
    const txt = await e.target.files[0].text(); e.target.value = '';
    const list = parseSpec(txt);
    const note = host.querySelector('.gx-note');
    if (!list) { if (note) note.innerHTML = '<b>불러오지 못했습니다.</b> floors 배열(sx·sz·ox·oz·rot)이 있는 JSON이어야 합니다.'; return; }
    onChange({ gesture: 'custom', gCustom: list });
  });
  host.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.gk; if (!k) return;
    const m = GMETA[k]; let v = +e.target.value; if (!Number.isFinite(v)) return;
    v = Math.min(m.max, Math.max(m.min, v));
    host.querySelectorAll(`[data-gk="${k}"]`).forEach(x => { if (x !== e.target) x.value = v; });
    onChange({ [k]: v }, true);
  });
}
