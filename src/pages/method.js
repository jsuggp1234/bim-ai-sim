// 04 공법·재료: 16개 공종마다 공법·재료·공정관리·품질관리 기술을 현장 조건으로 평가해 추천하고, 사용자가 자유롭게 바꾼다.
// 고른 공법은 4D 공정·5D 예산·위험 예측에 그대로 이어진다. 지하 시공 단면으로 지반조사 → 흙막이 → 굴착 → 기초 순서를 본다.
import { WPS, PRIO, PRIO_DEFAULT, COND_META } from '../sim/methods.js';
import { PHASES, ym, dateAt } from '../sim/process.js';
import { GROUND } from '../sim/kr-sites.js';
import { store } from '../store.js';
import { pipeline, fmt, won, setMethodState, setOptState, tip } from '../pipeline.js';
import { head, sub, dot, hbar, escH } from '../ui/sys.js';
import { sectionSVG } from '../ui/section.js';

export const title = '04 공법·재료';
const PRESETS = [
  ['balance', '균형', PRIO_DEFAULT],
  ['time', '공기 우선', { time: 45, cost: 15, quality: 15, safety: 15, env: 10 }],
  ['cost', '비용 우선', { time: 15, cost: 45, quality: 15, safety: 15, env: 10 }],
  ['safe', '품질·안전 우선', { time: 15, cost: 15, quality: 30, safety: 30, env: 10 }],
  ['env', '친환경', { time: 15, cost: 20, quality: 15, safety: 15, env: 35 }],
];
const BASE_IDS = ['survey', 'improve', 'wall', 'support', 'water', 'excav', 'found', 'base'];

export function mount(root) {
  let R = pipeline();
  const ui = { layer: 'wall', step: 0, play: 0 };
  const $ = (id) => root.querySelector('#' + id);
  let alive = true;

  root.innerHTML = head({
    n: 4, key: 'METHOD', title: '어떻게 지을까', status: 'AI RECOMMENDER ONLINE',
    dim: `${escH(R.site.name)} · ${R.u.name} · ${WPS.length}개 공종 · ${WPS.reduce((s, w) => s + w.opts.length, 0)}개 공법·기술`,
    desc: '현장 조건(지반·지하수·인접 건물·소음 규제·기반암)과 매스(굴착 깊이·높이·용도)로 공종마다 공법을 평가합니다. 점수가 가장 높은 공법을 추천하고 그 이유를 보여 주며, 어떤 공법이든 직접 고를 수 있습니다. 고른 공법은 4D 공정·5D 예산·위험 예측에 이어집니다.',
    stats: [['공기', '<b id="k-mo">—</b>', '<span id="k-mo2"></span>'], ['공사비', '<b id="k-cost">—</b>', '<span id="k-cost2"></span>'], ['품질 · 안전', '<b id="k-qs">—</b>', 'INDEX / 100']],
    actions: `<a class="btn ghost" href="#/mass">← 03 매스</a><a class="btn acc" href="#/process">05 4D·간섭 <span class="ar">→</span></a>`,
  }) + `
  <div class="wrap">
    <section class="sx-sec" aria-label="현장 조건과 우선순위">
      ${sub('04.1', '현장 조건 · 우선순위', '입지에서 가져온 값입니다. 바꾸면 추천이 다시 계산됩니다.', '<button type="button" class="chipbtn" id="c-reset">조건 되돌리기</button>')}
      <div class="me-cond">
        <div class="panel pad" id="cond"></div>
        <div class="panel pad" id="prio"></div>
      </div>
    </section>
    <section class="sx-sec" aria-label="공종별 공법">
      ${sub('04.2', '공종 레이어', '레이어를 누르면 그 공종의 공법 비교가 열립니다. 점 색: 빨강 = AI 추천 그대로 · 흰색 = 직접 고름.', '<button type="button" class="chipbtn" id="p-reset">모두 추천으로</button>')}
      <div class="me-stack">
        <ol class="layers" id="layers" role="tablist" aria-label="공종"></ol>
        <div class="inspector panel" id="insp" role="tabpanel"></div>
      </div>
    </section>
    <section class="sx-sec" aria-label="지하 시공 단면">
      ${sub('04.3', '지하 시공 시뮬레이션', '고른 지반조사·흙막이·지보·차수·기초 공법으로 그린 단면. 단계를 넘기거나 재생해 보세요.')}
      <div class="panel me-xs"><div id="xs"></div>
        <div class="xs-ctl"><button type="button" class="btn acc sm" id="xs-play">▶ 재생</button><input type="range" id="xs-step" min="0" max="10" value="0" aria-label="시공 단계"><span class="xs-cap" id="xs-cap"></span></div>
        <ol class="xs-steps" id="xs-steps"></ol></div>
    </section>
    <section class="sx-sec" aria-label="전통 공법 대비 효과">
      ${sub('04.4', '전통 공법 대비 효과', '같은 매스를 전통 공법 묶음(SPT·CIP·버팀보·PHC·순타·RC 라멘·재래식 거푸집·습식 외장·CPM)으로 지었을 때와 비교합니다.')}
      <div class="me-fx"><div class="panel pad" id="fx-kpi"></div><div class="panel pad" id="fx-ph"></div></div>
    </section>
  </div>`;

  // ---------- 조건 ----------
  function renderCond() {
    const c = R.cond, c0 = R.cond0, d = R.d;
    const row = (k) => {
      const m = COND_META[k], ch = c[k] !== c0[k] ? ' changed' : '';
      if (m.opts) return `<div class="ctl${ch}"><label for="c-${k}">${m.label}</label><select id="c-${k}" data-c="${k}">${m.opts.map(([v, n]) => `<option value="${v}" ${String(c[k]) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
      return `<div class="ctl${ch}"><label for="c-${k}">${m.label}</label><span class="inbox"><input type="number" data-c="${k}" value="${c[k]}" min="${m.min}" max="${m.max}" step="${m.step}" aria-label="${m.label}"><span class="unit">${m.unit}</span></span>
        <input type="range" id="c-${k}" data-c="${k}" value="${c[k]}" min="${m.min}" max="${m.max}" step="${m.step}">${m.note ? `<span class="hint">${m.note}</span>` : ''}</div>`;
    };
    $('cond').innerHTML = `<div class="sec-h"><h2>현장 조건</h2><span class="hint">${GROUND[c.ground].name}</span></div>
      <div class="me-cgrid">${Object.keys(COND_META).map(row).join('')}</div>
      <div class="me-derived">${[['굴착 깊이', fmt(d.depth, 1) + 'm'], ['지하수면 아래', fmt(d.belowGW, 1) + 'm'], ['암반 굴착', fmt(d.rockCut, 1) + 'm'], ['최고 높이', fmt(d.maxH, 0) + 'm'], ['부지', fmt(d.area / 1e4, 1) + 'ha'], ['최소 획지 폭', fmt(d.lotW, 0) + 'm']].map(([k, v]) => `<span><em>${k}</em><b>${v}</b></span>`).join('')}</div>`;
  }
  function renderPrio() {
    const p = R.prio, tot = Object.values(p).reduce((a, b) => a + b, 0) || 1;
    const pr = PRESETS.find(([, , v]) => Object.keys(PRIO).every(k => v[k] === p[k]));
    $('prio').innerHTML = `<div class="sec-h"><h2>우선순위</h2><span class="hint">공법 점수 = 5개 기준 점수의 가중 평균</span></div>
      <div class="presets">${PRESETS.map(([k, n]) => `<button type="button" class="chipbtn" data-preset="${k}" aria-pressed="${pr && pr[0] === k}">${n}</button>`).join('')}</div>
      <div class="me-prio">${Object.entries(PRIO).map(([k, m]) => `<div class="ctl"><label for="pr-${k}">${m.name}<em>${m.en}</em></label><input type="range" id="pr-${k}" data-p="${k}" min="0" max="60" step="1" value="${p[k]}"><span class="v">${Math.round(p[k] / tot * 100)}%</span></div>`).join('')}</div>`;
  }

  // ---------- 레이어 스택 ----------
  const chosenName = (L) => (L.wp.multi ? (L.chosen.length ? L.chosen.map(id => L.wp.opts.find(o => o.id === id).name.split(' (')[0]).join(' · ') : '없음') : L.wp.opts.find(o => o.id === L.chosen).name);
  function renderLayers() {
    $('layers').innerHTML = R.M.list.map(L => {
      const isRec = L.wp.multi ? !L.user : L.chosen === L.rec;
      return `<li><button type="button" role="tab" data-layer="${L.wp.id}" aria-selected="${ui.layer === L.wp.id}">
        <span class="ly-code">${L.wp.code}</span><span class="ly-t"><b>${L.wp.name}</b><small>${escH(chosenName(L))}</small></span>
        <span class="ly-st ${isRec ? 'rec' : 'usr'}" title="${isRec ? 'AI 추천' : '직접 고름'}"></span></button></li>`;
    }).join('');
  }
  const bars5 = (adj) => `<span class="b5">${Object.keys(PRIO).map(k => `<span title="${PRIO[k].name} ${adj[k]}"><em>${PRIO[k].name}</em>${hbar(adj[k] / 100)}<b>${adj[k]}</b></span>`).join('')}</span>`;
  function renderInspector() {
    const L = R.M.list.find(x => x.wp.id === ui.layer) || R.M.list[0];
    const wp = L.wp;
    const ev = [...L.ev].sort((a, b) => (b.ok - a.ok) || b.score - a.score);
    const best = ev[0] && ev[0].score;
    const multi = !!wp.multi;
    const isOn = (id) => (multi ? L.chosen.includes(id) : L.chosen === id);
    const recSet = multi ? L.rec : [L.rec];
    const cur = multi ? null : wp.opts.find(o => o.id === L.chosen);
    $('insp').innerHTML = `<div class="in-h"><span class="sx-code-s">${wp.code} · ${wp.en}</span>${dot(multi ? `${L.chosen.length} SELECTED` : L.chosen === L.rec ? 'AI RECOMMENDED' : 'USER OVERRIDE', multi || L.chosen === L.rec ? 'acc' : 'mute')}</div>
      <h3 class="in-t">${wp.name}</h3><p class="in-d">${wp.desc}</p>
      <div class="opts" role="${multi ? 'group' : 'radiogroup'}" aria-label="${wp.name} 공법">${ev.map(e => {
        const o = e.o, on = isOn(o.id), rec = recSet.includes(o.id);
        return `<button type="button" class="opt${on ? ' on' : ''}${e.ok ? '' : ' no'}" data-opt="${o.id}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${on}" ${e.ok ? '' : 'aria-disabled="true"'}>
          <span class="o-h"><span class="o-n">${escH(o.name)}</span>${o.tag ? `<span class="o-tag ${o.tag === 'AI' ? 'ai' : ''}">${o.tag}</span>` : ''}${rec ? '<span class="o-rec">추천</span>' : ''}<span class="o-sc">${e.ok ? e.score.toFixed(1) : '—'}</span></span>
          ${e.ok ? `<span class="o-bar">${hbar(best ? e.score / best : 0, on ? 'acc' : '')}</span>${bars5(e.adj)}` : `<span class="o-no">불가 · ${escH(e.why)}</span>`}
          ${e.reasons && e.reasons.length ? `<span class="o-why">${e.reasons.map(r => { const s = Object.values(r.delta).reduce((a, b) => a + b, 0); return `<span class="${s >= 0 ? 'pos' : 'neg'}">${s >= 0 ? '+' : '−'} ${escH(r.why)}</span>`; }).join('')}</span>` : ''}
        </button>`;
      }).join('')}</div>
      ${cur && cur.how ? `<div class="in-how"><span class="label-sm">${escH(cur.name)} · 시공 순서</span><ol>${cur.how.map(h => `<li>${escH(h)}</li>`).join('')}</ol></div>` : ''}
      ${multi && L.chosen.length ? `<div class="in-how"><span class="label-sm">고른 기술 · 운영 방법</span><ol>${L.chosen.map(id => { const o = wp.opts.find(x => x.id === id); return `<li><b>${escH(o.name)}</b> — ${escH(o.how.join(' → '))}</li>`; }).join('')}</ol></div>` : ''}`;
  }

  // ---------- 단면 ----------
  const nB = () => Math.max(1, ...R.gen.bldgs.filter(b => b.kind === 'basement').map(b => b.basementLv || b.floors.length), 1);
  function renderSection() {
    const ids = R.fx.ids;
    const { svg, steps, cur } = sectionSVG(ids, R.d, R.cond, nB(), ui.step);
    $('xs').innerHTML = svg;
    const sl = $('xs-step'); sl.max = steps.length - 1; if (ui.step > steps.length - 1) ui.step = steps.length - 1; sl.value = ui.step;
    $('xs-cap').innerHTML = `<b>${escH(cur.t)}</b> ${escH(cur.d || '')}`;
    $('xs-steps').innerHTML = steps.map((s, i) => `<li class="${i === ui.step ? 'on' : i < ui.step ? 'done' : ''}"><button type="button" data-step="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${escH(s.t)}</button></li>`).join('');
  }
  function play() {
    if (ui.play) { clearInterval(ui.play); ui.play = 0; $('xs-play').textContent = '▶ 재생'; return; }
    const n = +$('xs-step').max;
    if (ui.step >= n) ui.step = 0;
    $('xs-play').textContent = '❚❚ 정지';
    ui.play = setInterval(() => { if (!alive) return; ui.step++; if (ui.step > n) { ui.step = n; play(); return; } renderSection(); }, 900);
  }

  // ---------- 효과 ----------
  function renderFx() {
    const B = R.base(), S = R.S, E = R.E, fx = R.fx, f0 = B.M.fx;
    const dm = S.months - B.S.months, dc = E.total - B.E.total;
    $('k-mo').textContent = S.months + '개월'; $('k-mo2').textContent = `전통 ${B.S.months}개월 (${dm > 0 ? '+' : ''}${dm})`;
    $('k-cost').textContent = won(E.total); $('k-cost2').textContent = `전통 대비 ${dc > 0 ? '+' : '−'}${won(Math.abs(dc))}`;
    $('k-qs').textContent = `${fx.index.quality} · ${fx.index.safety}`;
    const kp = [
      ['총 공기', `${S.months}개월`, `${B.S.months}개월`, -dm / Math.max(1, B.S.months)],
      ['공사비', won(E.total), won(B.E.total), -dc / B.E.total],
      ['품질 지수', fx.index.quality, f0.index.quality, (fx.index.quality - f0.index.quality) / 100],
      ['안전 지수', fx.index.safety, f0.index.safety, (fx.index.safety - f0.index.safety) / 100],
      ['환경 지수', fx.index.env, f0.index.env, (fx.index.env - f0.index.env) / 100],
      ['탄소 (골조 지수)', fmt((fx.co2K || 1) * 100, 0), fmt((f0.co2K || 1) * 100, 0), -((fx.co2K || 1) - (f0.co2K || 1))],
      ['간섭 (미해결)', R.C.list.filter(c => !c.mit).length + '건', B.C.list.length + '건', (B.C.list.length - R.C.list.filter(c => !c.mit).length) / Math.max(1, B.C.list.length)],
    ];
    $('fx-kpi').innerHTML = `<div class="sec-h"><h2>지표 비교</h2><span class="hint">선택 / 전통</span></div>
      <table class="fx-t"><tbody>${kp.map(([k, a, b, g]) => `<tr><th>${k}</th><td class="a">${a}</td><td class="b">${b}</td><td class="${g > 0.004 ? 'pos' : g < -0.004 ? 'neg' : ''}">${g > 0.004 ? '▲ 개선' : g < -0.004 ? '▼ 불리' : '—'}</td></tr>`).join('')}</tbody></table>`;
    // 단계별 기간 (선택 vs 전통)
    const ph = PHASES.map(p => ({ p, a: S.phases.find(x => x.key === p.key), b: B.S.phases.find(x => x.key === p.key) })).filter(x => (x.a && x.a.n) || (x.b && x.b.n));
    const end = Math.max(S.end, B.S.end), X = (d) => (d / end * 100).toFixed(2);
    $('fx-ph').innerHTML = `<div class="sec-h"><h2>단계별 기간</h2><span class="hint">위 = 선택 공법 · 아래 = 전통 · 착공 ${ym(S.t0)}</span></div>
      <div class="fx-gantt">${ph.map(({ p, a, b }) => `<div class="fg-r"><span class="fg-n">${p.name}</span><span class="fg-t">
        ${a && a.n ? `<i class="sel" style="left:${X(a.start)}%;width:${X(a.end - a.start)}%" data-tip="${p.name} · 선택 ${ym(dateAt(S.t0, a.start))}–${ym(dateAt(S.t0, a.end))}"></i>` : ''}
        ${b && b.n ? `<i class="base" style="left:${X(b.start)}%;width:${X(b.end - b.start)}%" data-tip="${p.name} · 전통 ${ym(dateAt(B.S.t0, b.start))}–${ym(dateAt(B.S.t0, b.end))}"></i>` : ''}</span></div>`).join('')}
        <div class="fg-ax">${Array.from({ length: Math.floor(end / 365) + 1 }, (_, y) => `<span style="left:${X(y * 365)}%">${y}년</span>`).join('')}</div></div>`;
  }

  function renderAll(src) {
    if (src !== 'cond') renderCond(); else syncCond();
    if (src !== 'prio') renderPrio(); else syncPrio();
    renderLayers(); renderInspector(); renderSection(); renderFx();
  }
  // 슬라이더를 끄는 중에는 그 패널을 다시 그리지 않고 값만 맞춘다
  function syncCond() {
    const c = R.cond, c0 = R.cond0, d = R.d;
    $('cond').querySelectorAll('[data-c]').forEach(el => { const k = el.dataset.c; if (document.activeElement !== el) el.value = c[k]; el.closest('.ctl').classList.toggle('changed', c[k] !== c0[k]); });
    const v = [fmt(d.depth, 1) + 'm', fmt(d.belowGW, 1) + 'm', fmt(d.rockCut, 1) + 'm', fmt(d.maxH, 0) + 'm', fmt(d.area / 1e4, 1) + 'ha', fmt(d.lotW, 0) + 'm'];
    $('cond').querySelectorAll('.me-derived b').forEach((b, i) => { b.textContent = v[i]; });
  }
  function syncPrio() {
    const p = R.prio, tot = Object.values(p).reduce((a, b) => a + b, 0) || 1;
    $('prio').querySelectorAll('[data-p]').forEach(el => { el.parentElement.querySelector('.v').textContent = Math.round(p[el.dataset.p] / tot * 100) + '%'; });
    const pr = PRESETS.find(([, , v]) => Object.keys(PRIO).every(k => v[k] === p[k]));
    $('prio').querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(!!pr && pr[0] === b.dataset.preset)));
  }
  function update(patch, src) { setMethodState(patch); setOptState(null); R = pipeline(); renderAll(src); }

  // ---------- 이벤트 ----------
  root.addEventListener('click', (e) => {
    const ly = e.target.closest('[data-layer]'); if (ly) { ui.layer = ly.dataset.layer; renderLayers(); renderInspector(); if (BASE_IDS.includes(ui.layer)) { /* 단면은 그대로 */ } return; }
    const op = e.target.closest('[data-opt]');
    if (op) {
      if (op.getAttribute('aria-disabled') === 'true') return;
      const L = R.M.list.find(x => x.wp.id === ui.layer), picks = { ...(R.ms.picks || {}) };
      if (L.wp.multi) { const cur = new Set(L.chosen); if (cur.has(op.dataset.opt)) cur.delete(op.dataset.opt); else cur.add(op.dataset.opt); picks[L.wp.id] = [...cur]; }
      else picks[L.wp.id] = op.dataset.opt === L.rec ? undefined : op.dataset.opt;
      if (picks[L.wp.id] === undefined) delete picks[L.wp.id];
      update({ picks }); return;
    }
    const pr = e.target.closest('[data-preset]'); if (pr) { update({ prio: { ...PRESETS.find(x => x[0] === pr.dataset.preset)[2] } }); return; }
    if (e.target.id === 'p-reset') { update({ picks: {} }); return; }
    if (e.target.id === 'c-reset') { update({ cond: {} }); return; }
    if (e.target.id === 'xs-play') { play(); return; }
    const stp = e.target.closest('[data-step]'); if (stp) { ui.step = +stp.dataset.step; renderSection(); }
  });
  let q = 0, pend = null;
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'xs-step') { ui.step = +t.value; renderSection(); return; }
    if (t.dataset.c) { const k = t.dataset.c, v = COND_META[k].opts ? t.value : +t.value; pend = { cond: { ...(R.ms.cond || {}), ...(pend && pend.cond), [k]: v } }; }
    else if (t.dataset.p) { pend = { prio: { ...R.prio, ...(pend && pend.prio), [t.dataset.p]: +t.value } }; }
    else return;
    const src = t.dataset.c ? 'cond' : 'prio';
    if (t.dataset.c && t.type === 'range') { const o = t.closest('.ctl').querySelector('input[type=number]'); if (o) o.value = t.value; }
    if (t.dataset.c && t.type === 'number') { const o = t.closest('.ctl').querySelector('input[type=range]'); if (o) o.value = t.value; }
    if (!q) q = requestAnimationFrame(() => { q = 0; if (!alive || !pend) return; const p = pend; pend = null; update(p, src); });
  });
  root.addEventListener('change', (e) => { const t = e.target; if (t.tagName === 'SELECT' && t.dataset.c) update({ cond: { ...(R.ms.cond || {}), [t.dataset.c]: t.value } }); });
  $('fx-ph').addEventListener('pointermove', (e) => { const i = e.target.closest('[data-tip]'); tip(i ? i.dataset.tip : null, e.clientX, e.clientY); });
  $('fx-ph').addEventListener('pointerleave', () => tip(null));

  renderAll();
  return () => { alive = false; if (ui.play) clearInterval(ui.play); tip(null); };
}
