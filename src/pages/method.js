// 04 공법·재료: 공종 37개(6개 묶음)를 지반조사(L01)부터 순서대로 하나씩 고르고 확정한다. 확정해야 다음 공종이 열린다.
// 화면은 시뮬레이터 작업대: 가운데 3D 시공 장면(전체 화면), 왼쪽 공종 목록, 오른쪽 공법 고르기, 아래 재생 막대.
// 2D 단면·작업 상세·간섭·공정 단계·현장 조건·결정 기록·전통 대비는 장면 왼쪽 아이콘으로 여는 창이다.
// 고를 때마다 그 공법으로 시공 장면을 4D 공정 일정대로 재생하고(ui/build3d.js · ui/buildsim.js),
// 그 선택이 만드는 이점·문제점·간섭(sim/impact.js)과 공기·공사비 변화를 함께 보여 준다.
import { WPS, PRIO, PRIO_DEFAULT, COND_META, GROUPS, baseOpt } from '../sim/methods.js';
import { PHASES, ym, dateAt } from '../sim/process.js';
import { GROUND } from '../sim/kr-sites.js';
import { pipeline, fmt, won, setMethodState, setOptState, tip, projKey } from '../pipeline.js';
import { store } from '../store.js';
import { dot, hbar, escH } from '../ui/sys.js';
import { wpImpact, delta, vsBaseline, sectionGeom, wpLabel, optName } from '../sim/impact.js';
import { makeScene, frame, roiFor, lerpRoi, winFor } from '../ui/buildsim.js';
import { workFig, workInfo, classify } from '../ui/workstep.js';

// 받침 있으면 '이', 없으면 '가'
const josaIGa = (w) => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '이' : '가'; };

export const title = '04 공법·재료';
const PRESETS = [
  ['balance', '균형', PRIO_DEFAULT],
  ['time', '공기 우선', { time: 45, cost: 15, quality: 15, safety: 15, env: 10 }],
  ['cost', '비용 우선', { time: 15, cost: 45, quality: 15, safety: 15, env: 10 }],
  ['safe', '품질·안전 우선', { time: 15, cost: 15, quality: 30, safety: 30, env: 10 }],
  ['env', '친환경', { time: 15, cost: 20, quality: 15, safety: 15, env: 35 }],
];
const N = WPS.length;
// 묶음: 확정 순서에서 각 묶음이 차지하는 구간 [a, b)
const GR = GROUPS.map(g => ({ ...g, a: WPS.findIndex(w => w.id === g.ids[0]), b: WPS.findIndex(w => w.id === g.ids[g.ids.length - 1]) + 1 }));
const grpOf = (i) => GR.find(g => i >= g.a && i < g.b) || GR[0];

// 확정 진행: 용도@택지마다 따로 (공법 계산 열쇠와 분리해 다시 계산하지 않는다)
const getDone = () => Math.max(0, Math.min(N, ((store.get().mdone || {})[projKey()]) || 0));
const setDone = (n) => { const s = store.get(); store.set({ mdone: { ...(s.mdone || {}), [projKey(s)]: Math.max(0, Math.min(N, n)) } }); };
export const methodDone = getDone;

const sgn = (v, f = (x) => x) => (v > 0 ? '+' : v < 0 ? '−' : '±') + f(Math.abs(v));
const dDays = (v) => (Math.abs(v) < 1 ? '공기 ±0' : `공기 ${sgn(Math.round(v))}일`);
const dCost = (v) => (Math.abs(v) < 5000 ? '비용 ±0' : `비용 ${sgn(v, won)}`);
const tone = (v, goodIfNeg = true) => (Math.abs(v) < 1e-9 ? '' : (v < 0) === goodIfNeg ? 'pos' : 'neg');
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';

const SPEEDS = [0.5, 1, 2, 4, 8];
const AMB = 0.4; // 주변 움직임(장비·차량·사람) 속도 배율: 실제보다 느긋하게
const spLabel = (v) => (v === 0.5 ? '½' : v) + '×';
// 아이콘 메뉴: [키, 이름, 설명, SVG 경로]
const POPS = [
  ['2d', '2D 단면', '단면으로 보기 (지층·흙막이·층 구성)', '<path d="M3 16h18M3 12h18M3 8h18"/><path d="M7 4v16M17 4v16" opacity=".5"/>'],
  ['work', '작업 상세', '지금 단계 확대 장면 · 장비 · 인원 · 관리 항목', '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5 21 21M8.5 11h5M11 8.5v5"/>'],
  ['imp', '간섭·이점', '간섭 · 문제점 · 이점 · 전통 공법 대비', '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17v.5"/>'],
  ['steps', '공정 단계', '이 공법의 시공 순서', '<path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10"/>'],
  ['cond', '현장 조건', '지반·지하수·인접 거리 · 우선순위', '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'],
  ['log', '결정 기록', '확정한 공종과 공정 창', '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>'],
  ['fx', '전통 대비', '전통 공법 묶음과 지표·기간 비교', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
];
const ICON = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export function mount(root) {
  let R = pipeline();
  let done = getDone();
  const ui = { cur: Math.min(done, N - 1), grp: null, p: 0, T: 0, playing: false, speed: 1, roi: null, roiFrom: null, roiT: 1, raf: 0, last: 0, vis: true, at: null, atT: 0, pop: null, pip: false, big2d: false };
  let v3 = null, v3Loading = false, main2d = false, v3Err = ''; // 3D가 기본 (WebGL이 없으면 2D 단면이 가운데로)
  try { const sp = +localStorage.getItem('bim.simSpeed2'); if (SPEEDS.includes(sp)) ui.speed = sp; const pp = localStorage.getItem('bim.simPop'); if (POPS.some(x => x[0] === pp) && pp !== '2d') ui.pop = pp; ui.pip = localStorage.getItem('bim.simPip') === '1'; } catch { /* 저장소 없음 */ }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 휴대폰 폭에서는 세로형 화면으로 다시 그린다
  const mqN = window.matchMedia('(max-width: 560px)'), onMq = () => draw();
  const $ = (id) => root.querySelector('#' + id);
  let alive = true, scene = null, G = sectionGeom(R.gen, R.d), imp = null, marks = [];

  const nOpt = WPS.reduce((s2, w) => s2 + w.opts.length, 0);
  const popBody = {
    '2d': '',
    work: '<div class="sim-work" id="sim-work"><div class="sw-fig" id="sw-fig"></div><div class="sw-info" id="sw-info" aria-live="polite"></div></div>',
    imp: '<div class="wz-imp" id="imp"></div>',
    steps: '<ol class="sim-steps" id="sim-steps"></ol>',
    cond: '<div class="pop-acts"><button type="button" class="chipbtn" id="c-reset">조건 되돌리기</button><button type="button" class="chipbtn" id="wz-reset">공종 확정 처음부터 다시</button></div><div id="cond"></div><div id="prio"></div>',
    log: '<p class="pop-n">확정한 공종과 그 선택의 공정 창. 행을 누르면 그 공종으로 돌아갑니다.</p><div id="log"></div>',
    fx: `<p class="pop-n">같은 매스를 전통 공법 묶음(SPT·CIP·버팀보·PHC·외방수 시트·순타·RC 라멘·재래식 거푸집·현장 철근·붐 펌프·습식 외장·중앙 공조 등 용도에 맞는 관행 공법)으로 지었을 때와 비교합니다.</p><div id="fx-kpi"></div><div id="fx-ph"></div>`,
  };
  root.innerHTML = `
  <section class="sws" id="wz-sec" aria-label="공법·재료 시공 시뮬레이터">
    <header class="sws-top">
      <a class="sws-back" href="#/mass" title="03 매스로" aria-label="03 매스로">←</a>
      <div class="sws-t"><span class="sws-code">04 · METHOD ${dot('BUILD SIMULATOR', 'acc')}</span><h1>어떻게 지을까<span class="pd">.</span></h1><span class="sws-dim">${escH(R.site.name)} · ${R.u.name} · ${N}개 공종 · ${nOpt}개 공법</span></div>
      <nav class="sws-strip" id="strip" aria-label="공종 진행 (누르면 그 공종으로)"></nav>
      <dl class="sws-k">
        <div><dt>확정</dt><dd id="k-done">—</dd><span id="k-done2"></span></div>
        <div><dt>공기</dt><dd id="k-mo">—</dd><span id="k-mo2"></span></div>
        <div><dt>공사비</dt><dd id="k-cost">—</dd><span id="k-cost2"></span></div>
      </dl>
      <a class="btn acc sm" id="go-next" href="#/process">05 4D·간섭 <span class="ar">→</span></a>
    </header>
    <aside class="sws-nav" aria-label="공종 순서">
      <div class="sws-ph"><b>공종</b><span class="hint">지반조사부터 차례로 확정</span><button type="button" class="sws-tog" data-tog="nav" aria-label="공종 목록 접기" title="접기">‹</button></div>
      <div class="sws-rail" id="rail"></div>
    </aside>
    <div class="sws-stage">
      <div class="sim-box" id="sim"></div>
      <nav class="sws-dock" aria-label="세부 보기">
        ${POPS.map(([k, n, d, ic]) => `<button type="button" class="sws-ic" data-pop="${k}" aria-pressed="false" title="${d}">${ICON(ic)}<span>${n}</span><i class="sws-badge" data-badge="${k}" hidden></i></button>`).join('')}
        <span class="sws-sep" aria-hidden="true"></span>
        <button type="button" class="sws-ic" id="sws-fs" title="전체 화면 (Esc로 나가기)">${ICON('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}<span>전체 화면</span></button>
        <button type="button" class="sws-ic sws-open" data-tog="nav" title="공종 목록 펴기">${ICON('<path d="M4 6h16M4 12h16M4 18h16"/>')}<span>공종</span></button>
        <button type="button" class="sws-ic sws-open" data-tog="side" title="공법 선택 펴기">${ICON('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>')}<span>공법</span></button>
      </nav>
      <div class="sws-pop" id="pop" hidden role="dialog" aria-labelledby="pop-t">
        <div class="sws-ph"><b id="pop-t"></b><span class="hint" id="pop-d"></span><button type="button" class="sws-tog" id="pop-x" aria-label="닫기" title="닫기">×</button></div>
        <div class="pop-b">${POPS.filter(x => x[0] !== '2d').map(([k]) => `<div class="pop-p" data-pp="${k}" hidden>${popBody[k]}</div>`).join('')}</div>
      </div>
      <div class="sws-pip" id="pip" hidden>
        <div class="sws-ph"><b>2D 단면</b><span class="hint">3D와 같은 시각 · 그림 속 번호 = 간섭·문제점</span><button type="button" class="sws-tog" id="pip-big" aria-label="2D 크게 보기" title="크게 / 작게">⤢</button><button type="button" class="sws-tog" id="pip-x" aria-label="2D 단면 닫기" title="닫기">×</button></div>
        <div class="sim2d" id="sim2d"></div>
      </div>
      <div class="sws-bar">
        <button type="button" class="btn acc sm" id="sim-play" aria-label="재생">▶</button>
        <button type="button" class="btn ghost sm" id="sim-re" aria-label="처음부터 재생" title="처음부터">↺</button>
        <div class="sws-tl"><div class="sim-cap" id="sim-cap" aria-live="polite"></div><div class="sws-track"><input type="range" id="sim-p" min="0" max="1000" value="0" aria-label="시공 진행"><div class="sws-ticks" id="sim-ticks" aria-hidden="true"></div></div></div>
        <div class="seg sws-sp" role="group" aria-label="재생 속도">${SPEEDS.map(v => `<button type="button" data-sp="${v}" aria-pressed="${v === ui.speed}">${spLabel(v)}</button>`).join('')}</div>
      </div>
    </div>
    <aside class="sws-side" aria-label="공법 고르기">
      <div class="sws-ph"><b>공법 선택</b><span class="hint">누르면 바로 재생</span><button type="button" class="sws-tog" data-tog="side" aria-label="공법 선택 접기" title="접기">›</button></div>
      <div class="wz-side" id="side"></div>
    </aside>
  </section>`;
  const ws = $('wz-sec');
  try { if (localStorage.getItem('bim.simNav') !== '1') ws.classList.add('no-nav'); if (localStorage.getItem('bim.simSide') === '0') ws.classList.add('no-side'); } catch { /* 저장소 없음 */ }

  // ---------- 조건 · 우선순위 ----------
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

  // ---------- 공종 레일 ----------
  const Lof = (i) => R.M.list[i];
  const chosenName = (L) => (L.wp.multi ? (L.chosen.length ? `${L.chosen.length}개 기술` : '없음') : optName(L.wp.id, L.chosen));
  function renderRail() {
    // 왼쪽 목록: 묶음 6개를 펼침 목록으로, 지금 묶음 안에 공종 칩 (휴대폰 폭에서는 가로로 넘긴다)
    const open = ui.grp != null ? GR.find(g => g.k === ui.grp) || grpOf(ui.cur) : grpOf(ui.cur);
    const html = GR.map(g => {
      const n = g.b - g.a, dn = Math.max(0, Math.min(n, done - g.a)), st = dn >= n ? 'done' : g.a <= done ? 'next' : 'lock';
      const head = `<button type="button" class="rg ${st}${g === open ? ' on' : ''}" data-grp="${g.k}" aria-expanded="${g === open}" ${st === 'lock' ? 'aria-disabled="true"' : ''}>
        <span class="rg-c">${WPS[g.a].code}–${WPS[g.b - 1].code}</span><span class="rg-n">${g.name}</span><span class="rg-s">${dn} / ${n}</span><i class="rg-bar" aria-hidden="true"><i style="width:${(dn / n * 100).toFixed(1)}%"></i></i></button>`;
      const chips = g !== open ? '' : `<ol class="rl-list" role="tablist" aria-label="${g.name} 공종">${R.M.list.slice(g.a, g.b).map((L, j) => {
        const i = g.a + j, st2 = i < done ? 'done' : i === done ? 'next' : 'lock';
        return `<li><button type="button" role="tab" class="rl ${st2}${i === ui.cur ? ' on' : ''}" data-wp="${i}" aria-selected="${i === ui.cur}" ${st2 === 'lock' ? 'aria-disabled="true"' : ''} title="${st2 === 'lock' ? `앞 공종(${Lof(done) ? Lof(done).wp.code : ''})을 먼저 확정하세요` : escH(L.wp.name + ' · ' + chosenName(L))}">
          <span class="rl-c">${L.wp.code}</span><span class="rl-n">${L.wp.name}</span><span class="rl-s">${st2 === 'done' ? escH(chosenName(L)) : st2 === 'next' ? '고를 차례' : '잠김'}</span><i class="rl-m" aria-hidden="true"></i></button></li>`;
      }).join('')}</ol>`;
      return `<li class="rg-li${g === open ? ' open' : ''}">${head}${chips}</li>`;
    }).join('');
    $('rail').innerHTML = `<ol class="rg-tabs" aria-label="공종 묶음">${html}</ol>`;
    // 머리글 진행 막대: 공종 ${N}개를 묶음별로 한 칸씩 (확정 · 지금 고를 차례 · 잠김), 누르면 그 공종으로
    const cg = grpOf(ui.cur);
    $('strip').innerHTML = `<div class="st-h"><b>${Math.min(done, N)} / ${N}</b><span>공종 확정</span><em>${escH(cg.name)} · ${Lof(ui.cur).wp.code} ${escH(Lof(ui.cur).wp.name)}</em></div>
      <div class="st-segs">${GR.map(g => `<span class="st-g${g === cg ? ' on' : ''}" title="${escH(g.name)}">${R.M.list.slice(g.a, g.b).map((L, j) => { const i = g.a + j, st2 = i < done ? 'done' : i === done ? 'next' : 'lock'; return `<button type="button" class="st-s ${st2}${i === ui.cur ? ' cur' : ''}" data-wp="${i}" title="${L.wp.code} ${escH(L.wp.name)} · ${st2 === 'done' ? escH(chosenName(L)) : st2 === 'next' ? '지금 고를 차례' : '앞 공종을 먼저 확정'}" aria-label="${L.wp.code} ${escH(L.wp.name)}"></button>`; }).join('')}</span>`).join('')}</div>`;
    const on = $('rail').querySelector('.rl.on');
    if (on) { const box = $('rail'), r1 = on.getBoundingClientRect(), r0 = box.getBoundingClientRect(); if (r1.top < r0.top || r1.bottom > r0.bottom) box.scrollTop += r1.top - r0.top - box.clientHeight / 3; if (r1.left < r0.left || r1.right > r0.right) box.scrollLeft += r1.left - r0.left - (box.clientWidth - r1.width) / 2; }
  }

  // ---------- 오른쪽: 공법 고르기 ----------
  let dTok = 0;
  const dCache = new Map();
  const dKey = (wp, o) => `${projKey()}|${JSON.stringify(R.ms)}|${wp}|${o}`;
  function renderSide() {
    const L = Lof(ui.cur), wp = L.wp, multi = !!wp.multi;
    const ev = [...L.ev].sort((a, b) => (b.ok - a.ok) || b.score - a.score);
    const best = ev[0] && ev[0].score;
    const isOn = (id) => (multi ? L.chosen.includes(id) : L.chosen === id);
    const recSet = multi ? L.rec : [L.rec];
    const st = ui.cur < done ? 'done' : 'next';
    const last = ui.cur === N - 1;
    const goLabel = st === 'next' ? (last ? `${wp.code} 확정 · 모든 공종 완료` : `${wp.code} 확정하고 다음 공종 <span class="ar">→</span>`) : (done >= N ? (last ? '05 4D·간섭으로 <span class="ar">→</span>' : '다음 공종 보기 <span class="ar">→</span>') : (ui.cur + 1 < done ? '다음 공종 보기 <span class="ar">→</span>' : `고를 차례인 ${Lof(done).wp.code}로 <span class="ar">→</span>`));
    $('side').innerHTML = `<div class="ws-h"><span class="sx-code-s">${wp.code} · ${wp.en}</span>${dot(st === 'done' ? 'CONFIRMED' : 'SELECTING', st === 'done' ? 'mute' : 'acc')}</div>
      <h3 class="in-t">${wp.name}</h3>
      <div class="ws-do"><span class="n">${st === 'done' ? '✓' : '1'}</span><span>${st === 'done' ? '확정한 공종 · 다른 공법을 눌러 비교해 볼 수 있어요' : multi ? '쓸 기술을 고르세요 (여러 개 가능)' : `공법 ${ev.filter(e => e.ok).length}개 중 하나를 고르세요 · 누르면 바로 시공 장면이 바뀝니다`}</span></div>
      <details class="in-dd"><summary>이 공종은?</summary><p class="in-d">${wp.desc}</p></details>
      <div class="wz-opts" role="${multi ? 'group' : 'radiogroup'}" aria-label="${wp.name} 공법">${ev.map(e => {
        const o = e.o, on = isOn(o.id), rec = recSet.includes(o.id), base = !multi && baseOpt(L) === o.id;
        return `<button type="button" class="wo${on ? ' on' : ''}${e.ok ? '' : ' no'}" data-opt="${o.id}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${on}" ${e.ok ? '' : 'aria-disabled="true"'}>
          <span class="wo-h"><i class="wo-r" aria-hidden="true"></i><span class="wo-n">${escH(o.name)}</span>${o.tag ? `<span class="o-tag ${o.tag === 'AI' ? 'ai' : ''}">${o.tag}</span>` : ''}${rec ? '<span class="o-rec">AI 추천</span>' : ''}${base ? '<span class="o-tag">전통</span>' : ''}<span class="wo-sc">${e.ok ? e.score.toFixed(1) : '—'}</span></span>
          ${e.ok ? `<span class="wo-bar">${hbar(best ? e.score / best : 0, on ? 'acc' : '')}</span><span class="wo-d" data-d="${o.id}">${on && !multi ? '지금 선택' : '<span class="mute">계산 중…</span>'}</span>` : `<span class="o-no">불가 · ${escH(e.why)}</span>`}
        </button>`;
      }).join('')}</div>
      <div class="wz-go">
        <button type="button" class="btn ${st === 'next' ? 'acc' : 'ghost'} big" id="wz-go">${goLabel}</button>
        ${st === 'next' && (bulkN() > 1 || N - done > bulkN()) ? `<div class="wz-quick"><span>빠르게</span>${bulkN() > 1 ? `<button type="button" class="chipbtn" id="wz-grp">이 묶음 ${bulkN()}개 AI 추천대로</button>` : ''}${N - done > bulkN() ? `<button type="button" class="chipbtn" id="wz-all">남은 ${N - done}개 모두 AI 추천대로</button>` : ''}</div>` : ''}
        <span class="note">${st === 'next' ? (last ? '확정하면 05 4D·간섭 단계가 열립니다.' : `확정하면 ${Lof(ui.cur + 1).wp.code} ${Lof(ui.cur + 1).wp.name}${josaIGa(Lof(ui.cur + 1).wp.name)} 열립니다.`) : '이미 확정한 공종입니다. 바꾸면 뒤 공종 판정이 다시 계산됩니다.'}</span>
      </div>`;
    fillDeltas();
  }
  // 공법마다 공기·공사비 변화 (지금 선택 대비) — 한 번에 하나씩 계산해 화면을 막지 않는다
  function fillDeltas() {
    const my = ++dTok, L = Lof(ui.cur), wpId = L.wp.id;
    const todo = L.ev.filter(e => e.ok && (L.wp.multi || e.o.id !== L.chosen)).map(e => e.o.id);
    const put = (o, v) => { const el = $('side') && $('side').querySelector(`[data-d="${o}"]`); if (!el) return; el.innerHTML = `<span class="${tone(v.days)}">${dDays(v.days)}</span><span class="${tone(v.cost)}">${dCost(v.cost)}</span>${v.s ? `<span class="${tone(-v.s)}">안전 ${sgn(v.s)}</span>` : ''}`; };
    const step = () => {
      if (!alive || my !== dTok) return;
      const o = todo.shift(); if (!o) return;
      const k = dKey(wpId, o);
      if (!dCache.has(k)) { try { dCache.set(k, delta(R, wpId, o)); } catch (e) { console.warn(e); dCache.set(k, { days: 0, cost: 0, s: 0 }); } }
      put(o, dCache.get(k));
      setTimeout(step, 0);
    };
    todo.filter(o => dCache.has(dKey(wpId, o))).forEach(o => put(o, dCache.get(dKey(wpId, o))));
    setTimeout(step, 30);
  }

  // ---------- 아래: 이점 · 문제점 · 간섭 ----------
  let bTok = 0;
  const bCache = new Map();
  function renderImpact() {
    const L = Lof(ui.cur), wpId = L.wp.id;
    try { imp = wpImpact(R, wpId, G); } catch (e) { console.warn(e); imp = { pros: [], cons: [], clashes: [], risks: [] }; }
    // 그림 표식 번호: 간섭 → 위치가 있는 문제점
    marks = [];
    let n = 0;
    imp.clashes.forEach(x => { x.n = ++n; if (x.mark) marks.push({ n: x.n, mark: x.mark, sev: x.sev }); });
    imp.cons.forEach(x => { if (x.mark) { x.n = ++n; marks.push({ n: x.n, mark: x.mark, sev: x.sev }); } });
    const inv = R.M.list.filter(x => x.invalid).map(x => `${x.wp.code} ${x.wp.name}`);
    const fixBtn = (f) => {
      if (!f) return '';
      const fi = WPS.findIndex(w => w.id === f.wp);
      if (fi === ui.cur) return `<button type="button" class="chipbtn fix" data-fix="${f.wp}:${f.opt}">${escH(f.label)}</button>`;
      if (fi < ui.cur && fi <= done) return `<button type="button" class="chipbtn fix" data-goto="${fi}">${WPS[fi].code}로 돌아가 바꾸기</button>`;
      return `<span class="fix-later">${WPS[fi].code}에서 고려: ${escH(f.label)}</span>`;
    };
    const item = (x, k) => `<li class="ii ${k} s${x.sev || 1}">${x.n ? `<span class="ii-n">${CIRC[x.n - 1] || x.n}</span>` : `<span class="ii-n dot"></span>`}<div><b>${escH(x.t)}</b>${x.with ? `<em>↔ ${escH(x.with)}</em>` : ''}${x.d ? `<p>${escH(x.d)}</p>` : ''}${fixBtn(x.fix)}</div></li>`;
    const col = (k, ttl, en, arr, empty) => `<div class="ic ${k}"><div class="ic-h"><span class="ic-t">${ttl}</span><span class="ic-en">${en}</span><b>${arr.length}</b></div>${arr.length ? `<ol>${arr.map(x => item(x, k)).join('')}</ol>` : `<p class="ic-e">${empty}</p>`}</div>`;
    const bd = root.querySelector('[data-badge="imp"]'); if (bd) { const nI = imp.clashes.length + imp.cons.length; bd.hidden = !nI; bd.textContent = nI; bd.classList.toggle('hi', imp.clashes.some(x => (x.sev || 1) >= 2) || imp.cons.some(x => (x.sev || 1) >= 2)); }
    $('imp').innerHTML = `<div class="ik" id="ik">${kpiCells(null)}</div>
      ${inv.length ? `<p class="ib">앞 공종을 바꿔서 ${escH(inv.join(', '))}의 선택이 불가능해져 AI 추천으로 바뀌었습니다.</p>` : ''}
      <div class="icols">${col('clash', '간섭', 'CLASH', imp.clashes, '앞뒤 공종·인접 건물·공정과 부딪히는 곳이 없습니다.')}${col('con', '문제점', 'ISSUES', imp.cons, '눈에 띄는 문제점이 없습니다.')}${col('pro', '이점', 'BENEFITS', imp.pros, '—')}</div>`;
    // 전통 공법 대비 (느린 계산은 뒤로)
    const my = ++bTok, k = `${projKey()}|${JSON.stringify(R.ms)}|${wpId}`;
    const put = (v) => { const el = $('ik'); if (el) el.innerHTML = kpiCells(v); };
    if (bCache.has(k)) put(bCache.get(k));
    else setTimeout(() => { if (!alive || my !== bTok) return; let v; try { v = vsBaseline(R, wpId); } catch (e) { console.warn(e); v = null; } bCache.set(k, v); put(v); }, 60);
  }
  function kpiCells(v) {
    const L = Lof(ui.cur), wpId = L.wp.id, bo = baseOpt(L);
    const lab = L.wp.multi ? '기술 없이 했을 때 대비' : v && v.same ? '전통 공법과 같은 선택' : v && v.na ? `전통 공법(${optName(wpId, bo)})은 이 현장에서 불가` : `전통 공법(${escH(optName(wpId, bo))}) 대비`;
    const cell = (k, val, cls) => `<div><dt>${k}</dt><dd class="${cls}">${val}</dd></div>`;
    const W = winFor(scene || makeScene(R, []), wpId);
    return `<span class="ik-l">${lab}</span><dl>${v ? [
      cell('총 공기', Math.abs(v.days) < 1 ? '±0일' : `${sgn(v.days)}일`, tone(v.days)),
      cell('공사비', Math.abs(v.cost) < 5000 ? '±0' : sgn(v.cost, won), tone(v.cost)),
      cell('품질 지수', sgn(v.q), tone(-v.q)),
      cell('안전 지수', sgn(v.s), tone(-v.s)),
    ].join('') : cell('계산 중', '…', '')}${cell('이 공종 기간', W.skip ? '—' : `${Math.round(W.e - W.s)}일`, '')}</dl>`;
  }

  // ---------- 시뮬레이션 ----------
  const known = () => WPS.slice(0, Math.max(done, ui.cur + 1)).map(w => w.id);
  function rebuildScene() { scene = makeScene(R, known()); }
  function stepsOf() {
    const L = Lof(ui.cur);
    if (L.wp.multi) return L.chosen.length ? L.chosen.map(id => { const o = L.wp.opts.find(x => x.id === id); return { t: o.name.split(' (')[0], d: (o.how || []).join(' → '), opt: id, w: (o.how || [o.name])[0] }; }) : [{ t: '품질·안전 기술 없음', d: '', opt: '' }];
    const o = L.wp.opts.find(x => x.id === L.chosen);
    return (o.how || [o.name]).map(h => ({ t: h, opt: o.id }));
  }
  function setRoi(instant) {
    const target = roiFor(scene, Lof(ui.cur).wp.id);
    if (instant || !ui.roi || reduce) { ui.roi = target; ui.roiFrom = target; ui.roiT = 1; return; }
    ui.roiFrom = { ...ui.roi }; ui.roiTo = target; ui.roiT = 0;
  }
  function draw() {
    if (!scene) return;
    const L = Lof(ui.cur);
    const roi = ui.roiT < 1 ? lerpRoi(ui.roiFrom, ui.roiTo, 1 - Math.pow(1 - ui.roiT, 3)) : (ui.roiTo || ui.roi);
    ui.roi = roi;
    // 2D 단면: 가운데(3D를 못 쓸 때) 또는 아이콘으로 연 작은 창
    const pip2 = ui.pip && !main2d, want2d = main2d || pip2;
    if (want2d) {
      let out;
      try { out = frame(scene, L.wp.id, ui.p, ui.T, roi, marks, { paused: !ui.playing && ui.p > 0 && ui.p < 1, narrow: main2d ? mqN.matches : false }); }
      catch (e) { console.error(e); (main2d ? $('sim') : $('sim2d')).innerHTML = `<div class="empty">단면을 그리지 못했습니다: ${escH(e.message)}</div>`; out = null; }
      if (out) { (main2d ? $('sim') : $('sim2d')).innerHTML = out.svg; ui.at = out.at; ui.atT = performance.now(); }
    }
    if (v3 && !main2d) {
      // 판정 표식 위치는 2D 장면이 계산한 단면 좌표를 그대로 쓴다 (2D 창이 닫혀 있으면 0.3초마다)
      const now = performance.now();
      if (!want2d && (!ui.at || now - ui.atT > 300)) { try { ui.at = frame(scene, L.wp.id, ui.p, ui.T, roi, [], { narrow: false }).at; } catch { ui.at = {}; } ui.atT = now; }
      const S3 = stepsOf(), k3 = Math.min(S3.length - 1, Math.floor(ui.p * S3.length * 0.999)), s3 = S3[k3];
      const step = s3 && s3.opt !== '' ? { wp: L.wp.id, a: classify(L.wp.id, s3.opt, s3.w || s3.t), k: k3, n: S3.length } : null;
      try { v3.update({ sc: scene, wpId: L.wp.id, p: ui.p, T: ui.T, marks, at: ui.at, step }); }
      catch (e) { if (v3Err !== e.message) { v3Err = e.message; console.error(e); } } // 한 장면이 실패해도 3D를 끄지 않는다 (2D 단면은 아이콘으로 열 때만)
    }
    const S = stepsOf(), k = Math.min(S.length - 1, Math.floor(ui.p * S.length * 0.999));
    $('sim-cap').innerHTML = `<span class="sc-n">${String(k + 1).padStart(2, '0')} / ${String(S.length).padStart(2, '0')}</span><b>${escH(S[k].t)}</b>${S[k].d ? `<span>${escH(S[k].d)}</span>` : ''}`;
    $('sim-steps').querySelectorAll('li').forEach((li, i) => li.className = i === k ? 'on' : i < k ? 'done' : '');
    $('sim-ticks').querySelectorAll('i').forEach((t, i) => t.classList.toggle('on', i <= k));
    if (ui.pop === 'work') drawWork(L, S, k);
    const sl = $('sim-p'); if (document.activeElement !== sl) sl.value = Math.round(ui.p * 1000);
  }
  // 작업 상세: 지금 단계의 확대 장면 (단계 안 진행률 q로 움직인다) + 장비·인원·관리 항목
  let wKey = '', wArch = 'generic';
  function drawWork(L, S, k) {
    const n = S.length, s = S[k], key = `${L.wp.id}|${s.opt}|${k}|${n}`;
    if (key !== wKey) {
      wKey = key;
      const W = winFor(scene, L.wp.id), days = W.skip ? 0 : (W.e - W.s) / n;
      const info = workInfo({ wpId: L.wp.id, optId: s.opt, text: s.w || s.t, k, n, days });
      wArch = info.a; $('sw-info').innerHTML = info.html;
    }
    // 멈춘 첫 화면은 단계 중간 모습을, 재생 중에는 단계 안 진행률을 그린다
    const q = !ui.playing && ui.p === 0 ? 0.55 : Math.min(1, Math.max(0, ui.p * n - k));
    $('sw-fig').innerHTML = workFig(wArch, q, reduce ? 0 : ui.T, { text: s.w || s.t, wpId: L.wp.id, optId: s.opt });
  }
  function renderSteps() {
    const S = stepsOf();
    $('sim-steps').innerHTML = S.map((s, i) => `<li><button type="button" data-step="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${escH(s.t)}</button></li>`).join('');
    $('sim-ticks').innerHTML = S.map((s, i) => `<i style="left:${(i / S.length * 100).toFixed(2)}%;width:${(100 / S.length).toFixed(2)}%" title="${escH(s.t)}"></i>`).join('');
    wKey = '';
  }
  // 한 단계에 약 50초 (1× 기준) — 공종 하나가 2분 30초~5분에 걸쳐 천천히 재생된다 (8×면 20~40초)
  const dur = () => Math.max(150, Math.min(300, stepsOf().length * 50)) / ui.speed;
  function loop(ts) {
    ui.raf = 0;
    if (!alive) return;
    const dt = ui.last ? Math.min(0.1, (ts - ui.last) / 1000) : 0; ui.last = ts;
    let need = false;
    if (ui.vis && !document.hidden) {
      ui.T += dt * AMB; // 장비·차량·사람의 움직임은 실제보다 느긋하게
      if (ui.playing) { ui.p = Math.min(1, ui.p + dt / dur()); if (ui.p >= 1) { ui.playing = false; paintPlay(); } need = true; }
      if (ui.roiT < 1) { ui.roiT = Math.min(1, ui.roiT + dt / 0.7); need = true; }
      if (!reduce) need = true; // 장비·진동 같은 주변 움직임
      if (v3) need = true; // 회전·확대 감쇠
    }
    if (need) draw();
    if (ui.playing || ui.roiT < 1 || (!reduce && ui.vis) || (v3 && ui.vis)) ui.raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!ui.raf && alive) { ui.last = 0; ui.raf = requestAnimationFrame(loop); } };
  function paintPlay() { const b = $('sim-play'); b.textContent = ui.playing ? '❚❚' : '▶'; b.setAttribute('aria-label', ui.playing ? '일시정지' : '재생'); }
  // 가운데 장면: 3D (WebGL이 없으면 2D 단면) · 아이콘 창
  function paintView() {
    $('sim').classList.toggle('is3d', !main2d);
    ws.classList.toggle('main2d', main2d);
    $('pip').hidden = !(ui.pip && !main2d); $('pip').classList.toggle('big', ui.big2d);
    root.querySelectorAll('[data-pop]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pop === '2d' ? (ui.pip || main2d) : b.dataset.pop === ui.pop)));
    const P = POPS.find(x => x[0] === ui.pop);
    $('pop').hidden = !P;
    if (P) { $('pop-t').textContent = P[1]; $('pop-d').textContent = P[2]; root.querySelectorAll('[data-pp]').forEach(el => { el.hidden = el.dataset.pp !== ui.pop; }); }
  }
  function setPop(k) {
    if (k === '2d') { if (main2d) return; ui.pip = !ui.pip; if (!ui.pip) $('sim2d').innerHTML = ''; try { localStorage.setItem('bim.simPip', ui.pip ? '1' : '0'); } catch { /* 저장소 없음 */ } }
    else { ui.pop = ui.pop === k ? null : k; try { localStorage.setItem('bim.simPop', ui.pop || ''); } catch { /* 저장소 없음 */ } if (ui.pop === 'work') wKey = ''; }
    paintView(); draw(); kick();
  }
  async function init3D() {
    if (v3 || v3Loading) return;
    v3Loading = true;
    $('sim').innerHTML = '<div class="empty">3D 장면을 불러오는 중…</div>';
    try {
      const mod = await import('../ui/build3d.js');
      if (!alive) return;
      if (!mod.webglOK()) throw new Error('이 기기·브라우저에서 WebGL을 쓸 수 없습니다');
      $('sim').innerHTML = '';
      v3 = mod.createSim3D($('sim'), { plan: R.gen.plan, gen: R.gen, useMap: store.get().useMap !== false });
      main2d = false;
    } catch (e) { console.warn(e); v3 = null; main2d = true; flash(`3D를 열 수 없어 2D 단면으로 보여 줍니다. (${e.message})`); }
    v3Loading = false;
    paintView(); draw(); kick();
  }
  function play(from0) {
    if (reduce) { ui.p = 1; ui.playing = false; draw(); paintPlay(); return; }
    if (from0 || ui.p >= 1) ui.p = 0;
    ui.playing = true; paintPlay(); kick();
  }

  // ---------- 기록 · 효과 · 머리 ----------
  function renderLog() {
    const rows = R.M.list.slice(0, done);
    $('log').innerHTML = rows.length ? `<div class="tw"><table class="lg-t"><thead><tr><th>공종</th><th>고른 공법</th><th>추천</th><th>점수</th><th>공정 창</th></tr></thead><tbody>${rows.map((L, i) => {
      const isRec = L.wp.multi ? !L.user : L.chosen === L.rec;
      const ev = L.wp.multi ? null : L.ev.find(e => e.o.id === L.chosen);
      const W = winFor(scene, L.wp.id);
      return `<tr data-goto="${i}" tabindex="0"><th><span class="lg-c">${L.wp.code}</span>${L.wp.name}</th><td>${escH(L.wp.multi ? (L.chosen.map(id => optName('qa', id)).join(' · ') || '없음') : optName(L.wp.id, L.chosen))}</td><td>${isRec ? '<span class="o-rec">그대로</span>' : '<span class="o-tag">직접 고름</span>'}</td><td class="num">${ev ? ev.score.toFixed(1) : '—'}</td><td class="num">${W.skip ? '—' : `D+${Math.round(W.s)} ~ ${Math.round(W.e)} · ${ym(dateAt(R.S.t0, W.s))}`}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<p class="pad note">아직 확정한 공종이 없습니다. L01 지반조사부터 고르세요.</p>';
  }
  function renderFx() {
    const B = R.base(), S = R.S, E = R.E, fx = R.fx, f0 = B.M.fx;
    const dm = S.months - B.S.months, dc = E.total - B.E.total;
    $('k-done').textContent = `${done} / ${N}`; $('k-done2').textContent = done >= N ? '모든 공종 확정' : `다음: ${Lof(done).wp.code} ${Lof(done).wp.name}`;
    $('k-mo').textContent = S.months + '개월'; $('k-mo2').textContent = `전통 ${B.S.months}개월 (${dm > 0 ? '+' : ''}${dm})`;
    $('k-cost').textContent = won(E.total); $('k-cost2').textContent = `전통 대비 ${dc > 0 ? '+' : '−'}${won(Math.abs(dc))}`;
    const kp = [
      ['총 공기', `${S.months}개월`, `${B.S.months}개월`, -dm / Math.max(1, B.S.months)],
      ['공사비', won(E.total), won(B.E.total), -dc / B.E.total],
      ['품질 지수', fx.index.quality, f0.index.quality, (fx.index.quality - f0.index.quality) / 100],
      ['안전 지수', fx.index.safety, f0.index.safety, (fx.index.safety - f0.index.safety) / 100],
      ['환경 지수', fx.index.env, f0.index.env, (fx.index.env - f0.index.env) / 100],
      ['탄소 (골조 지수)', fmt((fx.co2K || 1) * 100, 0), fmt((f0.co2K || 1) * 100, 0), -((fx.co2K || 1) - (f0.co2K || 1))],
      ['간섭 (미해결)', R.C.list.filter(c => !c.mit).length + '건', B.C.list.length + '건', (B.C.list.length - R.C.list.filter(c => !c.mit).length) / Math.max(1, B.C.list.length)],
    ];
    $('fx-kpi').innerHTML = `<div class="sec-h"><h2>지표 비교</h2><span class="hint">선택 / 전통${done < N ? ` · 미확정 ${N - done}개 공종은 AI 추천으로 계산` : ''}</span></div>
      <table class="fx-t"><tbody>${kp.map(([k, a, b, g]) => `<tr><th>${k}</th><td class="a">${a}</td><td class="b">${b}</td><td class="${g > 0.004 ? 'pos' : g < -0.004 ? 'neg' : ''}">${g > 0.004 ? '▲ 개선' : g < -0.004 ? '▼ 불리' : '—'}</td></tr>`).join('')}</tbody></table>`;
    const ph = PHASES.map(p => ({ p, a: S.phases.find(x => x.key === p.key), b: B.S.phases.find(x => x.key === p.key) })).filter(x => (x.a && x.a.n) || (x.b && x.b.n));
    const end = Math.max(S.end, B.S.end), X = (dd) => (dd / end * 100).toFixed(2);
    $('fx-ph').innerHTML = `<div class="sec-h"><h2>단계별 기간</h2><span class="hint">위 = 선택 공법 · 아래 = 전통 · 착공 ${ym(S.t0)}</span></div>
      <div class="fx-gantt">${ph.map(({ p, a, b }) => `<div class="fg-r"><span class="fg-n">${p.name}</span><span class="fg-t">
        ${a && a.n ? `<i class="sel" style="left:${X(a.start)}%;width:${X(a.end - a.start)}%" data-tip="${p.name} · 선택 ${ym(dateAt(S.t0, a.start))}–${ym(dateAt(S.t0, a.end))}"></i>` : ''}
        ${b && b.n ? `<i class="base" style="left:${X(b.start)}%;width:${X(b.end - b.start)}%" data-tip="${p.name} · 전통 ${ym(dateAt(B.S.t0, b.start))}–${ym(dateAt(B.S.t0, b.end))}"></i>` : ''}</span></div>`).join('')}
        <div class="fg-ax">${Array.from({ length: Math.floor(end / 365) + 1 }, (_, y) => `<span style="left:${X(y * 365)}%">${y}년</span>`).join('')}</div></div>`;
  }
  // 다음 단계 잠금 (머리 버튼 · 단계 마침 패널)
  function gate() {
    const locked = done < N;
    const a = $('go-next');
    if (a) { a.classList.toggle('locked', locked); a.setAttribute('aria-disabled', String(locked)); a.title = locked ? `공종 ${N}개를 모두 확정하면 열립니다 (${done}/${N})` : ''; }
    const sd = root.querySelector('.stage-done');
    if (sd) {
      sd.classList.toggle('locked', locked);
      const r = sd.querySelector('.sd-r');
      if (r) {
        if (locked) { r.dataset.href = r.dataset.href || r.getAttribute('href'); r.removeAttribute('href'); r.setAttribute('aria-disabled', 'true'); const go = r.querySelector('.sd-go'); if (go) go.innerHTML = `${done} / ${N} 공종 확정 · 남은 공종을 확정하세요`; }
        else { if (r.dataset.href) r.setAttribute('href', r.dataset.href); r.removeAttribute('aria-disabled'); const go = r.querySelector('.sd-go'); if (go) go.innerHTML = '다음 단계로 <span class="ar" aria-hidden="true">→</span>'; }
      }
      const t = sd.querySelector('.sd-t'); if (t) t.textContent = locked ? `공종 ${done} / ${N} 확정.` : '공법·재료 단계 완료.';
    }
  }

  // ---------- 묶음 ----------
  function showWp(i, { autoplay = true } = {}) {
    ui.cur = Math.max(0, Math.min(N - 1, i)); ui.grp = null;
    rebuildScene(); setRoi(false);
    renderRail(); renderSide(); renderImpact(); renderSteps();
    ui.p = 0; draw();
    if (autoplay) play(true); else { ui.playing = false; paintPlay(); }
    kick();
  }
  function renderAll(src) {
    if (src !== 'cond') renderCond(); else syncCond();
    if (src !== 'prio') renderPrio(); else syncPrio();
    G = sectionGeom(R.gen, R.d);
    rebuildScene(); if (!ui.roi) setRoi(true);
    renderRail(); renderSide(); renderImpact(); renderSteps(); renderLog(); renderFx(); gate();
    draw();
  }
  function update(patch, src, replay = true) {
    setMethodState(patch); setOptState(null); R = pipeline();
    renderAll(src);
    if (replay) play(true);
  }
  function confirm() {
    if (ui.cur === done) {
      done = Math.min(N, done + 1); setDone(done);
      renderLog(); renderFx(); gate();
      if (done >= N) { renderRail(); renderSide(); flash('모든 공종을 확정했습니다. 05 4D·간섭 단계가 열렸습니다.'); return; }
      showWp(done);
    } else if (done >= N && ui.cur === N - 1) location.hash = '#/process';
    else showWp(Math.min(done, ui.cur + 1));
  }
  // 묶음 일괄 확정: 지금 고른 것(직접 고른 공법은 그대로, 나머지는 AI 추천)으로 묶음 끝까지 확정
  function bulkN() { return grpOf(done).b - done; }
  function confirmTo(n) {
    done = Math.max(done, Math.min(N, n)); setDone(done); ui.grp = null;
    renderLog(); renderFx(); gate();
    if (done >= N) { ui.cur = N - 1; renderRail(); renderSide(); renderImpact(); flash('모든 공종을 확정했습니다. 05 4D·간섭 단계가 열렸습니다.'); return; }
    showWp(done);
  }
  function flash(msg) { const el = document.createElement('p'); el.className = 'wz-flash'; el.setAttribute('role', 'status'); el.textContent = msg; $('side').appendChild(el); }

  // ---------- 이벤트 ----------
  root.addEventListener('click', (e) => {
    const rl = e.target.closest('[data-wp]');
    if (rl) { const i = +rl.dataset.wp; if (i > done) { rl.classList.add('shake'); setTimeout(() => rl.classList.remove('shake'), 400); return; } showWp(i); return; }
    const op = e.target.closest('[data-opt]');
    if (op) {
      if (op.getAttribute('aria-disabled') === 'true') return;
      const L = Lof(ui.cur), picks = { ...(R.ms.picks || {}) };
      if (L.wp.multi) { const cur = new Set(L.chosen); if (cur.has(op.dataset.opt)) cur.delete(op.dataset.opt); else cur.add(op.dataset.opt); picks[L.wp.id] = [...cur]; }
      else { if (op.dataset.opt === L.chosen) { play(true); return; } picks[L.wp.id] = op.dataset.opt === L.rec ? undefined : op.dataset.opt; }
      if (picks[L.wp.id] === undefined) delete picks[L.wp.id];
      update({ picks }); return;
    }
    const fx = e.target.closest('[data-fix]');
    if (fx) { const [w, o] = fx.dataset.fix.split(':'); const L = R.M.list.find(x => x.wp.id === w); const picks = { ...(R.ms.picks || {}) }; if (L.wp.multi) picks[w] = [...new Set([...L.chosen, o])]; else picks[w] = o === L.rec ? undefined : o; if (picks[w] === undefined) delete picks[w]; update({ picks }); return; }
    const gt = e.target.closest('[data-goto]'); if (gt) { showWp(+gt.dataset.goto); $('wz-sec').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); return; }
    if (e.target.closest('#wz-go')) { confirm(); return; }
    if (e.target.closest('#wz-grp')) { confirmTo(grpOf(done).b); return; }
    if (e.target.closest('#wz-all')) { confirmTo(N); return; }
    const gb = e.target.closest('[data-grp]');
    if (gb) { if (gb.getAttribute('aria-disabled') === 'true') { gb.classList.add('shake'); setTimeout(() => gb.classList.remove('shake'), 400); return; } ui.grp = gb.dataset.grp; renderRail(); return; }
    const pr = e.target.closest('[data-preset]'); if (pr) { update({ prio: { ...PRESETS.find(x => x[0] === pr.dataset.preset)[2] } }, null, false); return; }
    if (e.target.id === 'wz-reset') { done = 0; setDone(0); update({ picks: {} }, null, false); showWp(0); return; }
    if (e.target.id === 'c-reset') { update({ cond: {} }, null, false); return; }
    if (e.target.closest('#sim-play')) { if (ui.playing) { ui.playing = false; paintPlay(); draw(); } else play(false); return; }
    if (e.target.closest('#sim-re')) { play(true); return; }
    const pb = e.target.closest('[data-pop]'); if (pb) { setPop(pb.dataset.pop); return; }
    if (e.target.closest('#pop-x')) { setPop(ui.pop); return; }
    if (e.target.closest('#pip-x')) { setPop('2d'); return; }
    if (e.target.closest('#pip-big')) { ui.big2d = !ui.big2d; paintView(); draw(); return; }
    const tg = e.target.closest('[data-tog]'); if (tg) { const k = tg.dataset.tog, cls = k === 'nav' ? 'no-nav' : 'no-side'; ws.classList.toggle(cls); try { localStorage.setItem(k === 'nav' ? 'bim.simNav' : 'bim.simSide', ws.classList.contains(cls) ? '0' : '1'); } catch { /* 저장소 없음 */ } return; }
    if (e.target.closest('#sws-fs')) { if (document.fullscreenElement) document.exitFullscreen?.(); else ws.requestFullscreen?.().catch(() => {}); return; }
    const spb = e.target.closest('[data-sp]'); if (spb) { ui.speed = +spb.dataset.sp; root.querySelectorAll('[data-sp]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.sp === ui.speed))); try { localStorage.setItem('bim.simSpeed2', String(ui.speed)); } catch { /* 저장소 없음 */ } return; }
    const stp = e.target.closest('[data-step]'); if (stp) { const n = stepsOf().length; ui.p = Math.min(0.999, (+stp.dataset.step + 0.02) / n); ui.playing = false; paintPlay(); draw(); return; }
    const sd = e.target.closest('.stage-done.locked .sd-r'); if (sd) { e.preventDefault(); showWp(done); $('wz-sec').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const gn = e.target.closest('#go-next.locked'); if (gn) { e.preventDefault(); showWp(Math.min(done, N - 1)); $('wz-sec').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  root.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-goto]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); return; }
    if (e.key === 'Escape' && ui.pop && !document.fullscreenElement) { setPop(ui.pop); }
  });
  const onFs = () => { ws.classList.toggle('fs', document.fullscreenElement === ws); };
  document.addEventListener('fullscreenchange', onFs);
  let q = 0, pend = null;
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'sim-p') { ui.p = +t.value / 1000; ui.playing = false; paintPlay(); draw(); return; }
    if (t.dataset.c) { const k = t.dataset.c, v = COND_META[k].opts ? t.value : +t.value; pend = { cond: { ...(R.ms.cond || {}), ...(pend && pend.cond), [k]: v } }; }
    else if (t.dataset.p) { pend = { prio: { ...R.prio, ...(pend && pend.prio), [t.dataset.p]: +t.value } }; }
    else return;
    const src = t.dataset.c ? 'cond' : 'prio';
    if (t.dataset.c && t.type === 'range') { const o = t.closest('.ctl').querySelector('input[type=number]'); if (o) o.value = t.value; }
    if (t.dataset.c && t.type === 'number') { const o = t.closest('.ctl').querySelector('input[type=range]'); if (o) o.value = t.value; }
    if (!q) q = requestAnimationFrame(() => { q = 0; if (!alive || !pend) return; const p = pend; pend = null; update(p, src, false); });
  });
  root.addEventListener('change', (e) => { const t = e.target; if (t.tagName === 'SELECT' && t.dataset.c) update({ cond: { ...(R.ms.cond || {}), [t.dataset.c]: t.value } }, null, false); });
  $('fx-ph').addEventListener('pointermove', (e) => { const i = e.target.closest('[data-tip]'); tip(i ? i.dataset.tip : null, e.clientX, e.clientY); });
  $('fx-ph').addEventListener('pointerleave', () => tip(null));
  const io = new IntersectionObserver((en) => { ui.vis = en.some(x => x.isIntersecting); if (ui.vis) kick(); }, { threshold: 0.05 });
  io.observe($('sim'));
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);
  mqN.addEventListener('change', onMq);

  renderAll();
  paintView();
  showWp(ui.cur, { autoplay: !reduce });
  init3D();
  setTimeout(gate, 0);
  return () => { alive = false; if (v3) { v3.dispose(); v3 = null; } if (ui.raf) cancelAnimationFrame(ui.raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); document.removeEventListener('fullscreenchange', onFs); mqN.removeEventListener('change', onMq); tip(null); };
}
