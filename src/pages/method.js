// 04 공법·재료: 공종 37개(6개 묶음)를 지반조사(L01)부터 순서대로 하나씩 고르고 확정한다. 확정해야 다음 공종이 열린다.
// 고를 때마다 그 공법으로 시공 장면을 4D 공정 일정대로 재생하고(ui/buildsim.js),
// 그 선택이 만드는 이점·문제점·간섭(sim/impact.js)과 공기·공사비 변화를 함께 보여 준다.
import { WPS, PRIO, PRIO_DEFAULT, COND_META, GROUPS, baseOpt } from '../sim/methods.js';
import { PHASES, ym, dateAt } from '../sim/process.js';
import { GROUND } from '../sim/kr-sites.js';
import { pipeline, fmt, won, setMethodState, setOptState, tip, projKey } from '../pipeline.js';
import { store } from '../store.js';
import { head, sub, dot, hbar, escH } from '../ui/sys.js';
import { wpImpact, delta, vsBaseline, sectionGeom, wpLabel, optName } from '../sim/impact.js';
import { makeScene, frame, roiFor, lerpRoi, winFor } from '../ui/buildsim.js';

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

export function mount(root) {
  let R = pipeline();
  let done = getDone();
  const ui = { cur: Math.min(done, N - 1), grp: null, p: 0, T: 0, playing: false, speed: 1, roi: null, roiFrom: null, roiT: 1, raf: 0, last: 0, vis: true, view: '2d', at: null, atT: 0 };
  let v3 = null, v3Loading = false; // 3D 뷰 (three.js는 처음 3D를 누를 때 불러온다)
  try { if (localStorage.getItem('bim.simView') === '3d') ui.view = '3d'; } catch { /* 저장소 없음 */ }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 휴대폰 폭에서는 세로형 화면으로 다시 그린다
  const mqN = window.matchMedia('(max-width: 560px)'), onMq = () => draw();
  const $ = (id) => root.querySelector('#' + id);
  let alive = true, scene = null, G = sectionGeom(R.gen, R.d), imp = null, marks = [];

  root.innerHTML = head({
    n: 4, key: 'METHOD', title: '어떻게 지을까', status: 'BUILD SIMULATOR ONLINE',
    dim: `${escH(R.site.name)} · ${R.u.name} · ${N}개 공종 · ${WPS.reduce((s, w) => s + w.opts.length, 0)}개 공법·기술`,
    desc: '가설·지반부터 골조·외피·설비·마감·준공까지 37개 공종을 차례로 하나씩 고르고 확정합니다. 확정해야 다음 공종이 열리고, 묶음 단위로 AI 추천을 한 번에 확정할 수도 있습니다. 고를 때마다 그 공법으로 현장을 4D 공정 일정대로 2D 단면·3D로 재생하고, 그 선택이 만드는 이점·문제점·간섭(앞뒤 공종 · 인접 건물 · 공정)과 공기·공사비 변화를 함께 보여 줍니다.',
    stats: [['확정', '<b id="k-done">—</b>', '<span id="k-done2"></span>'], ['공기', '<b id="k-mo">—</b>', '<span id="k-mo2"></span>'], ['공사비', '<b id="k-cost">—</b>', '<span id="k-cost2"></span>']],
    actions: `<a class="btn ghost" href="#/mass">← 03 매스</a><a class="btn acc" id="go-next" href="#/process">05 4D·간섭 <span class="ar">→</span></a>`,
  }) + `
  <div class="wrap">
    <section class="sx-sec" aria-label="현장 조건과 우선순위">
      ${sub('04.1', '현장 조건 · 우선순위', '입지에서 가져온 값입니다. 바꾸면 추천과 판정이 다시 계산됩니다.', '<button type="button" class="chipbtn" id="c-reset">조건 되돌리기</button>')}
      <div class="me-cond">
        <div class="panel pad" id="cond"></div>
        <div class="panel pad" id="prio"></div>
      </div>
    </section>
    <section class="sx-sec" aria-label="공종별 시공 시뮬레이션" id="wz-sec">
      ${sub('04.2', '공종별 시공 시뮬레이션', '하나씩 고르고 확정하세요. 그림 속 번호는 아래 간섭·문제점 목록과 같습니다.', '<button type="button" class="chipbtn" id="wz-reset">처음부터 다시</button>')}
      <div class="wz-rail" id="rail" role="tablist" aria-label="공종 순서"></div>
      <div class="wz">
        <div class="wz-sim panel">
          <div class="sim-box" id="sim"></div>
          <div class="sim-ctl">
            <button type="button" class="btn acc sm" id="sim-play" aria-label="재생">▶</button>
            <button type="button" class="btn ghost sm" id="sim-re" aria-label="처음부터 재생">↺</button>
            <input type="range" id="sim-p" min="0" max="1000" value="0" aria-label="시공 진행">
            <button type="button" class="chipbtn" id="sim-sp" aria-label="재생 속도">1×</button>
            <div class="seg sim-view" role="group" aria-label="보기 방식"><button type="button" data-view="2d" aria-pressed="true">2D 단면</button><button type="button" data-view="3d" aria-pressed="false">3D</button></div>
          </div>
          <div class="sim-cap" id="sim-cap" aria-live="polite"></div>
          <ol class="sim-steps" id="sim-steps"></ol>
        </div>
        <div class="wz-side panel" id="side"></div>
      </div>
      <div class="wz-imp" id="imp"></div>
    </section>
    <section class="sx-sec" aria-label="결정 기록">
      ${sub('04.3', '결정 기록', '확정한 공종과 그 선택의 간섭·효과. 행을 누르면 그 공종으로 돌아갑니다.')}
      <div class="panel" id="log"></div>
    </section>
    <section class="sx-sec" aria-label="전통 공법 대비 효과">
      ${sub('04.4', '전통 공법 대비 효과', '같은 매스를 전통 공법 묶음(SPT·CIP·버팀보·PHC·외방수 시트·순타·RC 라멘·재래식 거푸집·현장 철근·붐 펌프·습식 외장·중앙 공조·조적·습식 온돌·롤러 도장·단독 시운전·CPM 등, 용도에 맞는 관행 공법)으로 지었을 때와 비교합니다.')}
      <div class="me-fx"><div class="panel pad" id="fx-kpi"></div><div class="panel pad" id="fx-ph"></div></div>
    </section>
  </div>`;

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
    const open = ui.grp != null ? GR.find(g => g.k === ui.grp) || grpOf(ui.cur) : grpOf(ui.cur);
    const tabs = GR.map(g => {
      const n = g.b - g.a, dn = Math.max(0, Math.min(n, done - g.a)), st = dn >= n ? 'done' : g.a <= done ? 'next' : 'lock';
      return `<li><button type="button" class="rg ${st}${g === open ? ' on' : ''}" data-grp="${g.k}" aria-expanded="${g === open}" ${st === 'lock' ? 'aria-disabled="true"' : ''}>
        <span class="rg-c">${WPS[g.a].code}–${WPS[g.b - 1].code}</span><span class="rg-n">${g.name}</span><span class="rg-s">${dn} / ${n}</span><i class="rg-bar" aria-hidden="true"><i style="width:${(dn / n * 100).toFixed(1)}%"></i></i></button></li>`;
    }).join('');
    const chips = R.M.list.slice(open.a, open.b).map((L, j) => {
      const i = open.a + j, st = i < done ? 'done' : i === done ? 'next' : 'lock';
      return `<li><button type="button" role="tab" class="rl ${st}${i === ui.cur ? ' on' : ''}" data-wp="${i}" aria-selected="${i === ui.cur}" ${st === 'lock' ? 'aria-disabled="true"' : ''} title="${st === 'lock' ? `앞 공종(${Lof(done) ? Lof(done).wp.code : ''})을 먼저 확정하세요` : escH(L.wp.name + ' · ' + chosenName(L))}">
        <span class="rl-c">${L.wp.code}</span><span class="rl-n">${L.wp.name}</span><span class="rl-s">${st === 'done' ? escH(chosenName(L)) : st === 'next' ? '고를 차례' : '잠김'}</span><i class="rl-m" aria-hidden="true"></i></button></li>`;
    }).join('');
    $('rail').innerHTML = `<ol class="rg-tabs" aria-label="공종 묶음">${tabs}</ol><div class="rl-g" role="tablist" aria-label="${open.name} 공종"><ol>${chips}</ol></div>`;
    if (window.innerWidth < 900) { const on = $('rail').querySelector('.rl.on'), tg = $('rail').querySelector('.rg.on'); if (tg) tg.scrollIntoView({ block: 'nearest', inline: 'center' }); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' }); }
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
      <h3 class="in-t">${wp.name}</h3><p class="in-d">${wp.desc}</p>
      <div class="wz-opts" role="${multi ? 'group' : 'radiogroup'}" aria-label="${wp.name} 공법">${ev.map(e => {
        const o = e.o, on = isOn(o.id), rec = recSet.includes(o.id), base = !multi && baseOpt(L) === o.id;
        return `<button type="button" class="wo${on ? ' on' : ''}${e.ok ? '' : ' no'}" data-opt="${o.id}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${on}" ${e.ok ? '' : 'aria-disabled="true"'}>
          <span class="wo-h"><i class="wo-r" aria-hidden="true"></i><span class="wo-n">${escH(o.name)}</span>${o.tag ? `<span class="o-tag ${o.tag === 'AI' ? 'ai' : ''}">${o.tag}</span>` : ''}${rec ? '<span class="o-rec">AI 추천</span>' : ''}${base ? '<span class="o-tag">전통</span>' : ''}<span class="wo-sc">${e.ok ? e.score.toFixed(1) : '—'}</span></span>
          ${e.ok ? `<span class="wo-bar">${hbar(best ? e.score / best : 0, on ? 'acc' : '')}</span><span class="wo-d" data-d="${o.id}">${on && !multi ? '지금 선택' : '<span class="mute">계산 중…</span>'}</span>` : `<span class="o-no">불가 · ${escH(e.why)}</span>`}
        </button>`;
      }).join('')}</div>
      <div class="wz-go">
        <button type="button" class="btn ${st === 'next' ? 'acc' : 'ghost'} big" id="wz-go">${goLabel}</button>
        ${st === 'next' && bulkN() > 1 ? `<button type="button" class="btn ghost" id="wz-grp">${grpOf(ui.cur).name} 묶음 남은 ${bulkN()}개 AI 추천대로 확정</button>` : ''}
        ${st === 'next' && N - done > bulkN() ? `<button type="button" class="chipbtn" id="wz-all">남은 ${N - done}개 공종 모두 AI 추천대로 확정</button>` : ''}
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
    if (L.wp.multi) return L.chosen.length ? L.chosen.map(id => { const o = L.wp.opts.find(x => x.id === id); return { t: o.name.split(' (')[0], d: (o.how || []).join(' → ') }; }) : [{ t: '품질·안전 기술 없음', d: '' }];
    const o = L.wp.opts.find(x => x.id === L.chosen);
    return (o.how || [o.name]).map(h => ({ t: h }));
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
    if (ui.view === '3d' && v3) {
      // 판정 표식 위치는 2D 장면이 계산한 단면 좌표를 그대로 쓴다 (0.3초마다)
      const now = performance.now();
      if (!ui.at || now - ui.atT > 300) { try { ui.at = frame(scene, L.wp.id, ui.p, ui.T, roi, [], { narrow: mqN.matches }).at; } catch { ui.at = {}; } ui.atT = now; }
      try { v3.update({ sc: scene, wpId: L.wp.id, p: ui.p, T: ui.T, marks, at: ui.at }); }
      catch (e) { console.error(e); setView('2d', '3D 장면을 그리지 못해 2D 단면으로 돌아왔습니다.'); return; }
    } else if (ui.view !== '3d') {
      let out;
      try { out = frame(scene, L.wp.id, ui.p, ui.T, roi, marks, { paused: !ui.playing && ui.p > 0 && ui.p < 1, narrow: mqN.matches }); }
      catch (e) { console.error(e); $('sim').innerHTML = `<div class="empty">시뮬레이션을 그리지 못했습니다: ${escH(e.message)}</div>`; return; }
      $('sim').innerHTML = out.svg;
    }
    const S = stepsOf(), k = Math.min(S.length - 1, Math.floor(ui.p * S.length * 0.999));
    $('sim-cap').innerHTML = `<span class="sc-n">${String(k + 1).padStart(2, '0')} / ${String(S.length).padStart(2, '0')}</span><b>${escH(S[k].t)}</b>${S[k].d ? `<span>${escH(S[k].d)}</span>` : ''}`;
    $('sim-steps').querySelectorAll('li').forEach((li, i) => li.className = i === k ? 'on' : i < k ? 'done' : '');
    const sl = $('sim-p'); if (document.activeElement !== sl) sl.value = Math.round(ui.p * 1000);
  }
  function renderSteps() {
    const S = stepsOf();
    $('sim-steps').innerHTML = S.map((s, i) => `<li><button type="button" data-step="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${escH(s.t)}</button></li>`).join('');
  }
  const dur = () => Math.max(7, Math.min(16, stepsOf().length * 2.4)) / ui.speed;
  function loop(ts) {
    ui.raf = 0;
    if (!alive) return;
    const dt = ui.last ? Math.min(0.1, (ts - ui.last) / 1000) : 0; ui.last = ts;
    let need = false;
    if (ui.vis && !document.hidden) {
      ui.T += dt;
      if (ui.playing) { ui.p = Math.min(1, ui.p + dt / dur()); if (ui.p >= 1) { ui.playing = false; paintPlay(); } need = true; }
      if (ui.roiT < 1) { ui.roiT = Math.min(1, ui.roiT + dt / 0.7); need = true; }
      if (!reduce) need = true; // 장비·진동 같은 주변 움직임
      if (ui.view === '3d' && v3) need = true; // 회전·확대 감쇠
    }
    if (need) draw();
    if (ui.playing || ui.roiT < 1 || (!reduce && ui.vis) || (ui.view === '3d' && v3 && ui.vis)) ui.raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!ui.raf && alive) { ui.last = 0; ui.raf = requestAnimationFrame(loop); } };
  function paintPlay() { const b = $('sim-play'); b.textContent = ui.playing ? '❚❚' : '▶'; b.setAttribute('aria-label', ui.playing ? '일시정지' : '재생'); }
  // 2D 단면 ↔ 3D
  function paintView() { root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === ui.view))); $('sim').classList.toggle('is3d', ui.view === '3d'); }
  async function setView(v, msg) {
    if (v === '3d' && !v3) {
      if (v3Loading) return;
      v3Loading = true; ui.view = '3d'; paintView();
      $('sim').innerHTML = '<div class="empty">3D 장면을 불러오는 중…</div>';
      try {
        const mod = await import('../ui/build3d.js');
        if (!alive) return;
        if (!mod.webglOK()) throw new Error('이 기기·브라우저에서 WebGL을 쓸 수 없습니다');
        if (ui.view !== '3d') return;
        $('sim').innerHTML = '';
        v3 = mod.createSim3D($('sim'));
      } catch (e) { console.warn(e); v3Loading = false; v3 = null; ui.view = '2d'; paintView(); flash(`3D를 열 수 없어 2D 단면으로 보여 줍니다. (${e.message})`); draw(); return; }
      v3Loading = false;
    }
    if (v === '2d' && v3) { v3.dispose(); v3 = null; }
    ui.view = v; ui.at = null; paintView();
    try { localStorage.setItem('bim.simView', v); } catch { /* 저장소 없음 */ }
    if (msg) flash(msg);
    draw(); kick();
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
    const vb = e.target.closest('[data-view]'); if (vb) { if (vb.dataset.view !== ui.view || (vb.dataset.view === '3d' && !v3)) setView(vb.dataset.view); return; }
    if (e.target.closest('#sim-sp')) { ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 0.5 : 1; $('sim-sp').textContent = (ui.speed === 0.5 ? '½' : ui.speed) + '×'; return; }
    const stp = e.target.closest('[data-step]'); if (stp) { const n = stepsOf().length; ui.p = Math.min(0.999, (+stp.dataset.step + 0.02) / n); ui.playing = false; paintPlay(); draw(); return; }
    const sd = e.target.closest('.stage-done.locked .sd-r'); if (sd) { e.preventDefault(); showWp(done); $('wz-sec').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const gn = e.target.closest('#go-next.locked'); if (gn) { e.preventDefault(); showWp(Math.min(done, N - 1)); $('wz-sec').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  root.addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-goto]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); } });
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
  if (ui.view === '3d') { ui.view = '2d'; setView('3d'); }
  setTimeout(gate, 0);
  return () => { alive = false; if (v3) { v3.dispose(); v3 = null; } if (ui.raf) cancelAnimationFrame(ui.raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); mqN.removeEventListener('change', onMq); tip(null); };
}
