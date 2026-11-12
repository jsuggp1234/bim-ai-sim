// 4단계: 4D 공정 — 블록·동·층 단위 공정표를 3D로 재생하고 간트 격자로 보여 준다
import { createViewer } from '../sim/viewer.js';
import { P4_DEFAULTS, P4_META, CATS, PHASES, FLOOR_STATES, dateAt, ym } from '../sim/process.js';
import { osmFor, osmReady } from '../sim/ctxload.js';
import { store } from '../store.js';
import { pipeline, fmt, won, tip, download, csv, onThemeChange, setOptState } from '../pipeline.js';
import { CLASH_TYPES, optimize, describeMoves } from '../sim/clash.js';
import { head, sub, dot, escH } from '../ui/sys.js';

export const title = '05 4D·간섭';

const M = 30.44;
const LANES = [
  { key: 'g1', name: '지반·토공·흙막이·기초', cats: ['improve', 'prep', 'wall', 'earth', 'found'] },
  { key: 'g2', name: '골조 (지하·지상)', cats: ['base', 'struct'] },
  { key: 'g3', name: '외장', cats: ['skin'] },
  { key: 'g4', name: '설비·전기·승강기', cats: ['mep', 'comm'] },
  { key: 'g5', name: '마감·조경', cats: ['fin', 'land'] },
];
const ORDER = [['supp', '주거 먼저'], ['intl', '랜드마크·업무 먼저'], ['together', '동시 착공']];
// 3D에서 공정 상태를 나타내는 색 (scene/palette.js의 --s-* 토큰)
const STATE_SW = { 1: '--s-form', 2: '--s-concrete', 3: '--s-duct', 4: '--s-film', 5: '--s-interior', 6: '--s-w-res' };
const FOCUS_OF = { struct: 'struct', base: 'struct', mep: 'mep', skin: 'skin', fin: 'fin' };
const SPEEDS = [[45, '×1'], [110, '×2'], [240, '×4']];
const CAT_NAME = Object.fromEntries(CATS.map(c => [c.key, c.name]));

export function mount(root) {
  let R = pipeline();
  const ui = { t: Math.round(R.S.end * 0.42), playing: false, speed: 110, view: 'axon', phase: null, xray: false, pick: null };
  const site = R.gen.plan.site, plan = R.gen.plan;
  const $ = (id) => root.querySelector('#' + id);
  let viewer = null, alive = true;

  const housing = !R.gen.x;
  root.innerHTML = head({
    n: 5, key: 'PROCESS', title: '언제, 어떤 순서로', status: 'BIM × 4D LINKED',
    dim: `${escH(site.name)} · ${R.u.name} · ${R.gen.blocks.length}개 블록 · 작업 ${fmt(R.S.acts.length)}건`,
    desc: `지반조사부터 시운전·준공까지 블록·동·층 단위 공정을 BIM 매스에 연결해 3D로 재생합니다. 04단계에서 고른 공법이 사이클·기간을 바꾸고, 크레인 반경·인접 굴착·공종 적층·차량·소음 간섭을 자동으로 찾아 AI가 착공 순서와 시차를 최적화합니다.`,
    stats: [['총 공기', '<b id="k-mo">—</b>', '<span id="k-mo2">MONTHS</span>'], ['간섭 (미해결)', '<b id="k-cl">—</b>', '<span id="k-cl2"></span>'], ['착공 전 탐지율', '<b id="k-det">—</b>', '<span id="k-det2"></span>']],
    actions: `<a class="btn ghost" href="#/method">← 04 공법</a><a class="btn acc" href="#/budget">06 5D 예산 <span class="ar">→</span></a>`,
  }) + `
  <section class="ws proc" id="p-ws" aria-label="4D 공정 작업 화면">
    <div class="stage" id="p-stage"></div>
    <div class="ov f-top"><div class="clock" id="p-clock" aria-live="polite"></div>
      <div class="vgroup"><div class="seg" id="p-views" role="group" aria-label="시점">${[['axon', 'AXON'], ['bird', '조감'], ['top', '평면'], ['street', '가로'], ...(plan.views.water ? [['river', plan.views.water.name]] : [])].map(([k, n]) => `<button type="button" data-view="${k}" aria-pressed="${k === ui.view}">${n}</button>`).join('')}</div>
        <button type="button" class="chipbtn" id="p-xray" aria-pressed="false" title="외피를 투명하게 해 골조·설비를 봅니다">투시</button></div></div>
    <div class="ov f-phase"><div class="phases" id="p-phases" role="group" aria-label="세부 공정 단계"></div><div class="ph-note" id="p-phnote"></div></div>
    <aside class="float f-r" id="p-fr" aria-label="블록별 진행">
      <div class="f-head"><span class="label-sm">Blocks · 블록별 진행</span><button type="button" data-fold="p-fr" aria-expanded="true" aria-label="블록 패널 접기">−</button></div>
      <div class="f-body"><div class="bl-list" id="p-blocks"></div></div>
    </aside>
    <div class="float f-leg" id="p-leg">
      ${FLOOR_STATES.filter(x => x.k > 0).map(x => `<span class="lg"><i style="background:var(${STATE_SW[x.k]})"></i>${x.name}</span>`).join('')}
      <span class="lg"><i style="background:var(--s-soil)"></i>굴토·흙막이</span>
      <span class="lg"><i style="background:var(--s-crane)"></i>타워크레인</span>
    </div>
    <div class="pickcard" id="p-pick" hidden></div>
    <div class="float tl" id="p-tl">
      <button class="play" type="button" id="p-play" aria-label="재생">▶</button>
      <div class="track"><input type="range" id="p-t" min="0" step="1" aria-label="공정 날짜"><svg id="p-track" aria-hidden="true"></svg></div>
      <div class="seg spd" id="p-spd" role="group" aria-label="재생 속도">${SPEEDS.map(([v, n]) => `<button type="button" data-spd="${v}" aria-pressed="${v === ui.speed}">${n}</button>`).join('')}</div>
      <span class="note" id="p-tlnote"></span>
    </div>
  </section>
  <div class="statband"><div class="stats" id="p-stats"></div></div>
  <div class="wrap">
    <section class="sx-sec" id="clash" aria-label="공정 간섭 검토">
      ${sub('05.1', '공정 간섭 검토 · AI 최적화', '4D 공정(시간)과 BIM 배치(공간)를 겹쳐 충돌을 찾습니다. 항목을 누르면 그 시점·위치로 이동합니다.')}
      <div class="cl-types" id="cl-types"></div>
      <div class="cl-grid">
        <div class="panel pad"><div class="sec-h"><h2>월별 간섭</h2><span class="hint" id="cl-mhint"></span></div><div id="cl-month"></div></div>
        <div class="panel pad cl-opt" id="cl-opt"></div>
      </div>
      <div class="panel"><div class="tw"><table class="cl-list" id="cl-list"></table></div></div>
    </section>
    <div class="sec">
      <div class="sec-title"><span class="n">05.2</span><h2>블록별 공정 간트</h2><span class="hint">월 단위 격자. 블록마다 다섯 줄이 공종 그룹이고, 주황 마름모는 상량(골조 완료), 검은 마름모는 준공입니다. 막대에 마우스를 올리면 기간이 나옵니다.</span></div>
      <div class="gantt" id="p-gantt"></div>
      <div class="g-leg" id="p-gleg"></div>
    </div>
    <div class="sec p4">
      <div><div class="sec-title"><span class="n">05.3</span><h2>마일스톤</h2><span class="hint">상량 = 블록의 마지막 동 골조 완료</span></div>
        <div class="panel"><div class="tw"><table class="ms-table" id="p-ms"></table></div></div>
        <div class="row" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn ghost" type="button" id="p-csv">공정표 CSV</button></div></div>
      <div><div class="sec-title"><span class="n">05.4</span><h2>공정 변수</h2></div>
        <div class="panel" id="p-ctl">
          <div class="grp"><div class="ctl"><label for="p-start">건축 착공</label><span class="inbox"><input type="month" id="p-start" min="2026-01" max="2035-12"></span></div>
            <span class="label-sm" style="display:block;margin:8px 0 6px">착공 순서</span><div class="seg" id="p-order" role="group" aria-label="착공 순서"></div></div>
          <div class="grp" id="p-sliders"></div>
          <div class="grp"><button class="chipbtn" type="button" id="p-reset">기본값</button></div>
        </div></div>
    </div>
    <div class="sec">
      <div class="sec-title"><span class="n">05.5</span><h2>공정 가정</h2></div>
      <ul class="issues" id="p-assume"></ul>
    </div>
  </div>`;

  // ---------- 계산된 값 ----------
  let S, gen, E, maxCranes = 0, milestones = [];
  function derive() {
    ({ S, gen, E } = R);
    maxCranes = 0;
    for (let t = 0; t <= S.end; t += 15) maxCranes = Math.max(maxCranes, S.cranesAt(t).length);
    const lm = [...S.blds.values()].find(r => r.kind === 'landmark') || [...S.blds.values()].sort((a, b) => b.F - a.F)[0];
    milestones = S.blocks.map(b => ({ ...b, months: (b.end - b.start) / M }));
    return lm;
  }
  let lmRec = derive();
  const D = (d) => ym(dateAt(S.t0, d));

  // ---------- 통계 ----------
  function renderStats() {
    const towers = [...S.blds.values()].filter(r => r.kind !== 'podium');
    const floors = towers.reduce((s, r) => s + r.F, 0);
    const cyc = towers.reduce((s, r) => s + (r.structEnd - r.structStart), 0) / Math.max(1, floors);
    const cells = [
      ['지반조사 착수', D(0), housing ? ORDER.find(o => o[0] === S.p.order)[1] : `${R.fx.ids.survey === 'ai' ? 'AI 3D 지반 모델' : '시추 조사'} ${fmt(S.survey.end)}일`, ''],
      ['전체 준공', D(S.end), `${S.blocks.length}개 블록`, ''],
      ['총 공기', `${S.months}개월`, `${fmt(S.end / 365.25, 1)}년`, 'acc'],
      housing && S.blocks.some(b => b.zone === 'supp') ? ['주거 첫 준공', D(Math.min(...S.blocks.filter(b => b.zone === 'supp').map(b => b.end))), '주거 블록', ''] : ['첫 블록 준공', D(Math.min(...S.blocks.map(b => b.end))), S.blocks.slice().sort((a, b) => a.end - b.end)[0].id, ''],
      [lmRec && lmRec.kind === 'landmark' ? '랜드마크 상량' : '최고층 동 상량', lmRec ? D(lmRec.structEnd) : '—', lmRec ? `${lmRec.id} · 골조 ${fmt((lmRec.structEnd - lmRec.structStart) / M, 0)}개월 · ${lmRec.F}개 층` : '', ''],
      ['지상 골조', fmt(floors) + '개 층', `평균 ${fmt(cyc, 1)}일/층 (달력일)`, ''],
      ['동시 크레인 최대', maxCranes + '대', '골조 공사 중인 동', ''],
      ['최대 월 기성', won(E.peak.total), `${D(E.peak.m * M)} · 5D 예산`, ''],
    ];
    $('p-stats').innerHTML = cells.map(([k, v, s, c]) => `<div class="stat"><span class="k">${k}</span><span class="v ${c}">${v}</span><span class="s">${s}</span></div>`).join('');
  }

  // ---------- 시계·블록·타임라인 ----------
  function phaseOf(id, t) {
    const b = S.blocks.find(x => x.id === id);
    if (t < b.start) return { name: '착공 전', k: 0 };
    if (t >= b.end) return { name: '준공', k: 1 };
    const act = S.acts.filter(a => a.block === id && a.start <= t && t < a.end).sort((a, c) => c.start - a.start)[0];
    return { name: act ? CAT_NAME[act.cat] : '공정 사이', k: (t - b.start) / (b.end - b.start) };
  }
  function renderClock() {
    const t = ui.t, dt = dateAt(S.t0, t);
    const pr = S.progressAt(t);
    const mi = Math.min(E.flow.length - 1, Math.floor(t / M));
    const cumPct = E.flow[mi] ? (E.flow[mi].cum - (E.flow[mi].total * (1 - (t / M - mi)))) / E.total * 100 : 0;
    $('p-clock').innerHTML = `<span class="m">Construction day ${fmt(t)} · 착공 후 ${fmt(t / M, 0)}개월</span><span class="d">${dt.getUTCFullYear()}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}.${String(dt.getUTCDate()).padStart(2, '0')}</span>
      <span class="p"><span>골조 <b>${fmt(pr.struct * 100, 0)}%</b></span><span>설비 <b>${fmt(pr.mep * 100, 0)}%</b></span><span>외장 <b>${fmt(pr.skin * 100, 0)}%</b></span><span>마감 <b>${fmt(pr.fin * 100, 0)}%</b></span><span>기성 <b>${fmt(Math.max(0, cumPct), 0)}%</b></span></span>`;
    renderPhases();
  }
  function renderBlocks() {
    $('p-blocks').innerHTML = S.blocks.map(b => {
      const ph = phaseOf(b.id, ui.t), w = Math.max(0, Math.min(1, ph.k)) * 100;
      return `<button type="button" class="bl-row${ui.t < b.start ? ' idle' : ''}" data-block="${b.id}"><span class="id">${b.id}</span><span class="ph"><span>${ph.name}</span><b>${fmt(w, 0)}%</b></span>
        <span class="bar"><i class="${ui.t < b.end && ui.t >= b.start ? 'a' : ''}" style="width:${w.toFixed(1)}%"></i></span><span class="dates"><span>${D(b.start)}</span><span>상량 ${D(b.topping)}</span><span>${D(b.end)}</span></span></button>`;
    }).join('');
  }
  function renderTrack() {
    const svg = $('p-track'), w = svg.clientWidth || 600, h = 34;
    const X = (d) => d / S.end * w;
    let s = `<rect class="rest" x="0" y="13" width="${w}" height="4"/><rect class="done" x="0" y="13" width="${X(ui.t).toFixed(1)}" height="4"/>`;
    const y0 = S.t0.getUTCFullYear();
    for (let y = y0 + 1; ; y++) { const d = (Date.UTC(y, 0, 1) - S.t0.getTime()) / 86400000; if (d > S.end) break; s += `<line class="tk" x1="${X(d).toFixed(1)}" x2="${X(d).toFixed(1)}" y1="9" y2="21"/><text x="${X(d).toFixed(1)}" y="32" text-anchor="middle">${y}</text>`; }
    S.blocks.forEach(b => { s += `<rect class="ms" x="${(X(b.end) - 2).toFixed(1)}" y="4" width="4" height="4" transform="rotate(45 ${X(b.end).toFixed(1)} 6)"/>`; });
    s += `<circle class="head" cx="${X(ui.t).toFixed(1)}" cy="15" r="7"/>`;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = s;
    $('p-tlnote').textContent = `${D(0)} 착공 → ${D(S.end)} 준공 · 마름모는 블록 준공 · ←→ 키로 한 달씩 이동`;
  }
  let lastPush = 0, pendingPush = false;
  function push3D(force) {
    if (!viewer) return;
    const now = performance.now();
    if (!force && now - lastPush < 90) { pendingPush = true; return; }
    lastPush = now; pendingPush = false;
    viewer.setBuild({ floor: S.stateAt(ui.t), cranes: S.cranesAt(ui.t), block: S.blockStateAt(ui.t), focus: ui.phase ? FOCUS_OF[ui.phase] || null : null });
    if (ui.pick != null) renderPick();
  }
  function setT(t, force) {
    ui.t = Math.max(0, Math.min(S.end, Math.round(t)));
    $('p-t').value = ui.t;
    $('p-t').setAttribute('aria-valuetext', D(ui.t));
    renderClock(); renderBlocks(); renderTrack(); renderGanttNow();
    push3D(force);
  }

  // ---------- 간트 ----------
  const CW = 15, LW = 132, LH = 5, LG = 1.5, RH = 42, HD = 40;
  function renderGantt() {
    const NM = Math.ceil(S.end / M) + 1, W = LW + NM * CW + 10, H = HD + S.blocks.length * RH + 6;
    const X = (d) => LW + d / M * CW;
    let s = '';
    const y0 = S.t0.getUTCFullYear(), m0 = S.t0.getUTCMonth();
    for (let i = 0; i < NM; i++) {
      const mo = (m0 + i) % 12, x = LW + i * CW;
      if (mo === 0 || i === 0) s += `<line class="yrl" x1="${x}" x2="${x}" y1="6" y2="${H}"/><text class="yr" x="${x + 3}" y="16">${y0 + Math.floor((m0 + i) / 12)}</text>`;
      s += `<text class="mo" x="${x + CW / 2}" y="32" text-anchor="middle">${mo + 1}</text>`;
      // 분기마다 가는 세로선 (달마다 칸을 그리면 표가 무거워진다)
      if (i && mo % 3 === 0 && mo !== 0) s += `<line class="qtl" x1="${x}" x2="${x}" y1="${HD}" y2="${H}"/>`;
    }
    S.blocks.forEach((b, r) => {
      const y = HD + r * RH;
      s += `<line class="rowsep" x1="0" x2="${W}" y1="${y}" y2="${y}"/>`;
      if (r % 2) s += `<rect class="zebra" x="${LW}" y="${y}" width="${W - LW}" height="${RH}"/>`;
      s += `<text class="rowl" x="6" y="${y + 18}">${b.id}</text><text class="rows" x="6" y="${y + 31}">${gen.zones[b.zone].name.replace('(주거)', '')} · ${b.towers}동</text>`;
      LANES.forEach((L, li) => {
        const acts = S.acts.filter(a => a.block === b.id && L.cats.includes(a.cat));
        if (!acts.length) return;
        const a0 = Math.min(...acts.map(a => a.start)), a1 = Math.max(...acts.map(a => a.end));
        const ly = y + 7 + li * (LH + LG);
        const col = L.key === 'g5' ? 'var(--g5)' : `var(--${L.key})`;
        s += `<rect class="bar" data-tip="${b.id}|${L.name}|${a0}|${a1}" x="${X(a0).toFixed(1)}" y="${ly.toFixed(1)}" width="${Math.max(2, X(a1) - X(a0)).toFixed(1)}" height="${LH}" rx="2.5" style="fill:${col}"/>`;
        if (L.key === 'g5') { const land = acts.filter(a => a.cat === 'land'); land.forEach(a => { s += `<rect class="bar" data-tip="${b.id}|조경·외부|${a.start}|${a.end}" x="${X(a.start).toFixed(1)}" y="${ly.toFixed(1)}" width="${Math.max(2, X(a.end) - X(a.start)).toFixed(1)}" height="${LH}" style="fill:var(--g6)"/>`; }); }
      });
      const dia = (d, cls, label) => `<rect class="ms ${cls}" data-tip="${b.id}|${label}|${d}|${d}" x="${(X(d) - 4).toFixed(1)}" y="${(y + RH / 2 - 4).toFixed(1)}" width="8" height="8" transform="rotate(45 ${X(d).toFixed(1)} ${(y + RH / 2).toFixed(1)})"/>`;
      s += dia(b.topping, 'tp', '상량 (골조 완료)') + dia(b.end, '', '준공');
    });
    s += `<g id="p-now"></g>`;
    $('p-gantt').innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="블록별 공정 간트 차트">${s}</svg>`;
    $('p-gleg').innerHTML = LANES.map(L => `<span><i style="background:var(--${L.key})"></i>${L.name}</span>`).join('') + `<span><i style="background:var(--g6)"></i>조경·외부</span><span><i class="dia a"></i>상량</span><span><i class="dia"></i>준공</span><span><i style="width:2px;height:12px;background:var(--accent)"></i>현재 시점</span>`;
    renderGanttNow();
  }
  function renderGanttNow() {
    const g = root.querySelector('#p-now'); if (!g) return;
    const x = LW + ui.t / M * CW, H = HD + S.blocks.length * RH + 6;
    g.innerHTML = `<line class="now" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="20" y2="${H}"/><rect x="${(x - 30).toFixed(1)}" y="${HD - 3}" width="60" height="0"/>`;
  }
  $('p-gantt').addEventListener('pointermove', e => {
    const el = e.target.closest('[data-tip]'); if (!el) { tip(null); return; }
    const [id, nm, a, b] = el.dataset.tip.split('|'); const s0 = +a, s1 = +b;
    tip(`<b>${id} · ${nm}</b><span>${s0 === s1 ? D(s0) : `${D(s0)} → ${D(s1)} · ${fmt((s1 - s0) / M, 1)}개월`}</span>`, e.clientX, e.clientY);
  });
  $('p-gantt').addEventListener('pointerleave', () => tip(null));
  $('p-gantt').addEventListener('click', e => { const svg = e.target.closest('svg'); if (!svg) return; const r = svg.getBoundingClientRect(); const x = e.clientX - r.left; if (x > LW) setT((x - LW) / CW * M, true); });

  // ---------- 마일스톤 ----------
  function renderMilestones() {
    $('p-ms').innerHTML = `<thead><tr><th>블록</th><th>존</th><th>착공</th><th>지하 골조 완료</th><th>상량</th><th>준공</th><th>공기</th><th>동수</th></tr></thead><tbody>
      ${milestones.map(b => `<tr><td>${b.id}</td><td style="text-align:right;font-family:var(--f-body)">${gen.zones[b.zone].name.replace('(주거)', '')}</td><td>${D(b.start)}</td><td>${D(b.baseEnd)}</td><td>${D(b.topping)}</td><td>${D(b.end)}</td><td>${fmt(b.months, 0)}개월</td><td>${b.towers}</td></tr>`).join('')}</tbody>`;
  }

  // ---------- 변수 ----------
  const params = () => ({ ...P4_DEFAULTS, ...(store.get().proc || {}) });
  function renderCtl() {
    const p = params();
    $('p-start').value = p.start;
    $('p-order').innerHTML = housing ? ORDER.map(([k, n]) => `<button type="button" data-order="${k}" aria-pressed="${p.order === k}">${n}</button>`).join('') : `<span class="note">${R.u.name}: 생성기가 정한 순서 (${(R.gen.zoneOrder || []).map(z => (R.gen.zones[z] || { name: z }).name).join(' → ')})</span>`;
    $('p-sliders').innerHTML = Object.entries(P4_META).map(([k, m]) => {
      const v = p[k], ch = Math.abs(v - P4_DEFAULTS[k]) > 1e-9 ? ' changed' : '';
      return `<div class="ctl${ch}"><label for="pc-${k}">${m.label}</label><span class="inbox"><input type="number" id="pn-${k}" data-k="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}" aria-label="${m.label} 값"><span class="unit">${m.unit}</span></span>
        <input type="range" id="pc-${k}" data-k="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}">${m.note ? `<span class="hint">${m.note}</span>` : ''}</div>`;
    }).join('');
  }
  let rq = 0;
  function update(patch) {
    const p = { ...params(), ...patch };
    store.set({ proc: p });
    if (rq) return;
    rq = requestAnimationFrame(() => {
      rq = 0; if (!alive) return;
      const ratio = ui.t / S.end;
      R = pipeline(); lmRec = derive();
      $('p-t').max = S.end;
      renderStats(); renderGantt(); renderMilestones(); renderClash(); syncCtl();
      setT(ratio * S.end, true);
    });
  }
  function syncCtl() {
    const p = params();
    root.querySelectorAll('#p-sliders [data-k]').forEach(el => { if (document.activeElement !== el) el.value = p[el.dataset.k]; el.closest('.ctl').classList.toggle('changed', Math.abs(p[el.dataset.k] - P4_DEFAULTS[el.dataset.k]) > 1e-9); });
    $('p-order').querySelectorAll('[data-order]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.order === p.order)));
  }
  $('p-ctl').addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'p-start') { if (/^\d{4}-\d{2}$/.test(el.value)) update({ start: el.value }); return; }
    const k = el.dataset.k; if (!k) return;
    let v = parseFloat(el.value); if (!isFinite(v)) return;
    const m = P4_META[k]; v = Math.min(m.max, Math.max(m.min, v));
    const twin = el.type === 'range' ? $('pn-' + k) : $('pc-' + k); if (twin) twin.value = v;
    update({ [k]: v });
  });
  $('p-ctl').addEventListener('click', e => {
    const o = e.target.closest('[data-order]'); if (o) update({ order: o.dataset.order });
    if (e.target.id === 'p-reset') { store.set({ proc: { ...P4_DEFAULTS } }); renderCtl(); update({}); }
  });

  // ---------- 재생 ----------
  let playRaf = 0, lastTs = 0;
  function tick(ts) {
    if (!ui.playing || !alive) return;
    const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
    let t = ui.t + dt * ui.speed;
    if (t >= S.end) { t = S.end; setPlaying(false); }
    setT(t);
    playRaf = requestAnimationFrame(tick);
  }
  function setPlaying(on) {
    ui.playing = on; $('p-play').textContent = on ? '❚❚' : '▶'; $('p-play').setAttribute('aria-label', on ? '일시정지' : '재생');
    cancelAnimationFrame(playRaf); lastTs = 0;
    if (on) { if (ui.t >= S.end) setT(0, true); playRaf = requestAnimationFrame(tick); }
    else push3D(true);
  }
  $('p-play').addEventListener('click', () => setPlaying(!ui.playing));
  $('p-t').addEventListener('input', e => { setPlaying(false); setT(+e.target.value); });
  $('p-t').addEventListener('change', () => push3D(true));
  $('p-t').addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setT(ui.t + (e.key === 'ArrowRight' ? M : -M), true); } });
  $('p-spd').addEventListener('click', e => { const b = e.target.closest('[data-spd]'); if (!b) return; ui.speed = +b.dataset.spd; $('p-spd').querySelectorAll('[data-spd]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  $('p-blocks').addEventListener('click', e => { const b = e.target.closest('[data-block]'); if (b && viewer) viewer.focusBlock(b.dataset.block); });
  $('p-views').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b && viewer) viewer.setView(b.dataset.view); });
  root.querySelectorAll('[data-fold]').forEach(btn => btn.addEventListener('click', () => {
    const panel = $(btn.dataset.fold), off = !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', off); btn.textContent = off ? '+' : '−'; btn.setAttribute('aria-expanded', String(!off));
    $('p-ws').classList.toggle('r-off', off);
    renderTrack();
  }));
  $('p-csv').addEventListener('click', () => {
    const rows = [['블록', '동', '공종', '작업', '시작', '끝', '기간_일']];
    S.acts.forEach(a => rows.push([a.block, a.bldg || '', CAT_NAME[a.cat], a.name, dateAt(S.t0, a.start).toISOString().slice(0, 10), dateAt(S.t0, a.end).toISOString().slice(0, 10), Math.round(a.end - a.start)]));
    download(`${site.id}-4d-schedule.csv`, csv(rows), 'text/csv;charset=utf-8');
  });

  $('p-assume').innerHTML = [
    '작업일 달력: 월~금 1일, 토요일 0.5일, 일요일 0일. 12~2월은 동절기 손실률, 7월은 장마 손실률만큼 하루 작업량을 줄입니다.',
    '블록 공정: 착공·가설 18작업일 → 지하연속벽(흙막이 면적 ÷ 하루 시공 면적) → 굴토(굴토량 ÷ 하루 굴토량, 흙막이 45% 진행 시 시작) → 기초 매트 → 지하 골조(지하 층수 × 층당 일수). 물량은 3단계 일람표 값입니다.',
    '동 공정: 지하 골조가 끝나면 블록 안 동마다 6작업일 간격으로 크레인을 세우고 층마다 골조 사이클을 반복합니다. 1층·포디움·피난안전층·옥탑은 특수층 사이클(12일, 옥탑 1.5배)입니다.',
    '외장은 골조가 지정 층수만큼 앞선 뒤, 마감은 지정 층수 + 20일 뒤 시작합니다. 승강기 설치·시운전·사용승인은 마감 후 70일(랜드마크 110일)입니다. 조경은 블록 준공 200일 전부터입니다.',
    site.id === 'yongsan' ? '착공 시점: 기반시설은 2025년 11월 착공, 주택 분양 목표는 2027년 말로 보도되었습니다. 건축 착공은 2028년 3월을 기본으로 가정했습니다. 착공 순서와 존 사이 간격으로 여러 시나리오를 비교할 수 있습니다.'
      : `착공 시점은 ${site.name}의 사업 일정과 관계없이 2028년 3월을 기본으로 둡니다. 위 착공 칸에서 바꿀 수 있습니다.`,
    '3D 부재: 거푸집·철근 단계는 주황 갱폼과 데크 합판, 타설이 끝난 층은 콘크리트 슬래브와 기둥(아파트는 벽식 내력벽), 설비 단계는 덕트·스프링클러·급수관·케이블 트레이, 창호 단계는 보호 필름이 붙은 유리와 발코니 난간, 내부 마감 단계는 실내가 비치는 유리, 준공한 층은 완성 외피로 그립니다. 초고층·업무동은 코어가 3개 층 먼저 올라갑니다.',
    '지하: 흙막이(CIP) 두부 보가 둘레를 따라 진행되고, 굴토가 시작되면 지면에 구멍이 뚫려 버팀보·띠장과 굴착기가 보입니다. 기초 매트는 한쪽부터 타설하고, 지하층 슬래브가 아래부터 올라오면 그 높이의 버팀보를 걷어 냅니다. 크레인은 골조 공사 중인 동마다 1대, 외부 승강기와 함께 그립니다.',
  ].map(x => `<li>${x}</li>`).join('');

  // ---------- 세부 공정 단계 ----------
  function renderPhases() {
    const t = ui.t;
    $('p-phases').innerHTML = S.phases.filter(ph => ph.n).map(ph => {
      const on = t >= ph.start && t < ph.end, done = t >= ph.end;
      return `<button type="button" data-phase="${ph.key}" aria-pressed="${ui.phase === ph.key}" class="${on ? 'on' : done ? 'done' : ''}" title="${D(ph.start)} → ${D(ph.end)}">${ph.name}</button>`;
    }).join('');
    const ph = ui.phase && S.phases.find(x => x.key === ui.phase);
    $('p-phnote').innerHTML = ph ? `<b>${ph.name}</b> ${ph.note} · ${D(ph.start)} → ${D(ph.end)} · 작업 ${fmt(ph.n)}건` : '';
  }
  $('p-phases').addEventListener('click', e => {
    const b = e.target.closest('[data-phase]'); if (!b) return;
    const k = b.dataset.phase;
    if (ui.phase === k) { ui.phase = null; setT(ui.t, true); return; }
    ui.phase = k;
    const ph = S.phases.find(x => x.key === k);
    setPlaying(false);
    setT(ph.peak, true);
    // 지하 공정은 가장 먼저 그 단계에 들어간 블록으로 다가간다
    if (viewer && ['prep', 'wall', 'earth', 'found', 'base'].includes(k)) {
      const a = S.acts.filter(x => ph.cats.includes(x.cat) && x.start <= ph.peak && ph.peak < x.end)[0];
      if (a) viewer.focusBlock(a.block);
    }
  });
  $('p-xray').addEventListener('click', e => { ui.xray = !ui.xray; e.currentTarget.setAttribute('aria-pressed', String(ui.xray)); if (viewer) viewer.setXray(ui.xray); });
  function renderPick() {
    const card = $('p-pick');
    if (ui.pick == null) { card.hidden = true; return; }
    const b = gen.bldgs[ui.pick], r = S.blds.get(ui.pick);
    if (!b || !r) { card.hidden = true; return; }
    const st = S.stateAt(ui.t), cnt = [0, 0, 0, 0, 0, 0, 0];
    r.floors.forEach(fi => cnt[st(ui.pick, fi)]++);
    card.innerHTML = `<div class="t"><b>${b.id}</b><span class="note">${b.storeys}층 · ${fmt(b.height, 0)}m</span><button class="x" type="button" aria-label="닫기" id="p-pickx">×</button></div>
      <dl>${FLOOR_STATES.filter(x => cnt[x.k]).map(x => `<dt><i class="sw" style="background:var(${STATE_SW[x.k] || '--line'})"></i>${x.name}</dt><dd>${cnt[x.k]}개 층</dd>`).join('')}
      <dt>골조</dt><dd>${D(r.structStart)} → ${D(r.structEnd)}</dd><dt>준공</dt><dd>${D(r.commE)}</dd></dl>
      <button class="chipbtn go" type="button" id="p-near">이 동 가까이 보기</button>`;
    card.hidden = false;
    $('p-pickx').addEventListener('click', () => { ui.pick = null; card.hidden = true; if (viewer) viewer.select(null); });
    $('p-near').addEventListener('click', () => { if (viewer) viewer.focusBuilding(ui.pick); });
  }

  // ---------- 간섭 검토 · AI 최적화 ----------
  const SEV = { 3: '중대', 2: '주의', 1: '경미' };
  let optRun = null;
  function renderClash() {
    const C = R.C, fx = R.fx, open = C.list.filter(c => !c.mit), hard = open.filter(c => c.sev >= 3).length;
    $('k-mo').textContent = S.months + '개월'; $('k-mo2').textContent = R.opt ? 'AI OPTIMIZED' : 'MONTHS';
    $('k-cl').textContent = open.length + '건'; $('k-cl2').textContent = `중대 ${hard} · 해소 ${C.list.length - open.length}`;
    $('k-det').textContent = Math.round((fx.detect || 0) * 100) + '%'; $('k-det2').textContent = ({ cpm: 'CPM', lob: 'LOB', takt: '택트', lps: 'LAST PLANNER', bim4d: '4D BIM', ai: 'AI + 4D BIM' })[fx.plan] || '';
    $('cl-types').innerHTML = Object.entries(CLASH_TYPES).map(([k, T]) => { const b = C.byType[k]; return `<div class="cl-t ${b.n - b.mit ? '' : 'z'}"><span class="sx-code-s">${T.en}</span><b>${T.name}</b><span class="n">${b.n - b.mit}<small>건</small></span><span class="note">${b.hard ? `중대 ${b.hard} · ` : ''}${b.mit ? `해소 ${b.mit} · ` : ''}${fmt(b.days)}일</span><span class="hint">${T.note}</span></div>`; }).join('');
    // 월별 띠
    const NM = Math.max(C.monthly.length, S.months), cw = Math.max(6, Math.min(18, 880 / NM)), keys = Object.keys(CLASH_TYPES), rh = 16, lw = 96;
    const mx = Math.max(1, ...C.monthly.flatMap(m => keys.map(k => m[k] || 0)));
    let svg = '';
    keys.forEach((k, r) => { svg += `<text class="rl" x="0" y="${r * rh + 12}">${CLASH_TYPES[k].name}</text>`; for (let m = 0; m < NM; m++) { const v = (C.monthly[m] || {})[k] || 0; svg += `<rect class="hc${v ? '' : ' e'}" data-m="${m}" data-tip="${CLASH_TYPES[k].name} · ${D(m * M)} · ${v}건" x="${lw + m * cw}" y="${r * rh}" width="${cw - 1.5}" height="${rh - 2}" style="--h:${(v / mx).toFixed(2)}"/>`; } });
    const y0 = S.t0.getUTCFullYear(), m0 = S.t0.getUTCMonth();
    for (let m = 0; m < NM; m++) if ((m0 + m) % 12 === 0) svg += `<text class="yr" x="${lw + m * cw}" y="${keys.length * rh + 12}">${y0 + Math.floor((m0 + m) / 12)}</text>`;
    svg += `<line class="now" x1="${lw + ui.t / M * cw}" x2="${lw + ui.t / M * cw}" y1="0" y2="${keys.length * rh}"/>`;
    $('cl-month').innerHTML = `<svg viewBox="0 0 ${lw + NM * cw} ${keys.length * rh + 16}" class="cl-heat" role="img" aria-label="월별 간섭 수">${svg}</svg>`;
    $('cl-mhint').textContent = `칸 = 한 달 · 진할수록 그 달 진행 중인 간섭이 많음`;
    // 목록
    const top = C.list.slice(0, 16);
    $('cl-list').innerHTML = `<thead><tr><th></th><th class="l">유형</th><th class="l">내용</th><th>기간</th><th>일수</th><th class="l">대책</th></tr></thead><tbody>${top.map((c, i) => `<tr data-ci="${i}" class="${c.mit ? 'mit' : ''}"><td><span class="sev s${c.sev}" title="${SEV[c.sev]}"></span></td><td class="l"><b>${CLASH_TYPES[c.type].name}</b><small>${c.mit ? '해소 (AI 계획)' : SEV[c.sev]}</small></td><td class="l">${escH(c.msg)}</td><td class="mono">${D(c.start)}–${D(c.end)}</td><td>${fmt(c.days)}</td><td class="l note">${escH(c.fix)}</td></tr>`).join('') || '<tr><td colspan="6" class="l note">간섭이 없습니다.</td></tr>'}</tbody>${C.list.length > top.length ? `<tfoot><tr><td colspan="6" class="l note">외 ${C.list.length - top.length}건</td></tr></tfoot>` : ''}`;
    renderOpt();
  }
  function convSVG(h, w = 420, hh = 120) {
    if (!h || h.length < 2) return '';
    const fs = h.map(x => x.f), lo = Math.min(...fs), hi = Math.max(...fs), X = (i) => (i / (h.length - 1) * (w - 8) + 4).toFixed(1), Y = (v) => (hh - 6 - (v - lo) / Math.max(1e-6, hi - lo) * (hh - 14)).toFixed(1);
    return `<svg class="conv" viewBox="0 0 ${w} ${hh}" role="img" aria-label="최적화 수렴 곡선">${h.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.f)}" r="1.6" class="pt"/>`).join('')}<polyline class="best" points="${h.map((x, i) => `${X(i)},${Y(x.best)}`).join(' ')}"/></svg>`;
  }
  function metr(S1, C1) { const open = C1.list.filter(c => !c.mit); return { months: S1.months, n: open.length, hard: open.filter(c => c.sev >= 3).length, score: C1.score }; }
  function renderOpt() {
    const fx = R.fx, its = Math.round(14 + 90 * (fx.solve || 0));
    const planName = ({ cpm: 'CPM', lob: 'LOB', takt: '택트', lps: 'Last Planner', bim4d: '4D BIM', ai: 'AI 공정 최적화' })[fx.plan] || fx.plan;
    let html = `<div class="sec-h"><h2>AI 공정 최적화</h2>${dot(optRun && optRun.running ? 'SEARCHING' : R.opt ? 'APPLIED' : 'READY', optRun && optRun.running ? 'acc blink' : R.opt ? 'acc' : 'mute')}</div>
      <p class="note">모의 담금질(simulated annealing)로 블록 착공 시차·동 착수 간격·후속 공종 간격·매트 분할 타설·크레인 높이 계획을 바꿔 가며 <b>공기 + 간섭 비용</b>을 줄입니다. 공정관리 기법 <b>${planName}</b> → 탐색 ${its}회${(fx.solve || 0) < 0.45 ? ' (04 공법의 L15에서 4D BIM·AI를 고르면 더 깊이 탐색합니다)' : ''}.</p>`;
    if (optRun && optRun.running) {
      html += `<div class="opt-run"><span class="mono">${optRun.i} / ${optRun.iters}</span>${conv(optRun.history)}</div>`;
    } else if (optRun && optRun.done) {
      const a = optRun.before, b = optRun.after;
      html += `${conv(optRun.history)}<table class="fx-t"><thead><tr><th></th><th>현재</th><th>최적안</th></tr></thead><tbody>
        <tr><th>총 공기</th><td>${a.months}개월</td><td class="${b.months < a.months ? 'pos' : b.months > a.months ? 'neg' : ''}">${b.months}개월</td></tr>
        <tr><th>미해결 간섭</th><td>${a.n}건</td><td class="${b.n < a.n ? 'pos' : ''}">${b.n}건</td></tr>
        <tr><th>중대 간섭</th><td>${a.hard}건</td><td class="${b.hard < a.hard ? 'pos' : ''}">${b.hard}건</td></tr>
        <tr><th>간섭 비용</th><td>${fmt(a.score)}</td><td class="${b.score < a.score ? 'pos' : ''}">${fmt(b.score)}</td></tr></tbody></table>
        <ul class="moves">${optRun.moves.map(m => `<li><b>${escH(m.t)}</b><span>${escH(m.d)}</span></li>`).join('') || '<li>지금 계획이 이미 최적에 가깝습니다.</li>'}</ul>
        <div class="row"><button type="button" class="btn acc" id="opt-apply">최적안 적용 <span class="ar">→</span></button><button type="button" class="btn ghost" id="opt-run">다시 탐색</button></div>`;
    } else if (R.opt) {
      const a = R.opt.before, b = R.opt.after;
      html += `${conv(R.opt.history || [])}<div class="okbox">AI 최적안을 적용했습니다: 공기 ${a.months} → ${b.months}개월, 미해결 간섭 ${a.n} → ${b.n}건 (중대 ${a.hard} → ${b.hard}). 5D 예산·위험 예측도 이 공정으로 계산합니다.</div>
        <ul class="moves">${(R.opt.moves || []).map(m => `<li><b>${escH(m.t)}</b><span>${escH(m.d)}</span></li>`).join('')}</ul>
        <div class="row"><button type="button" class="btn ghost" id="opt-undo">적용 취소</button><button type="button" class="btn ghost" id="opt-run">다시 탐색</button></div>`;
    } else html += `<button type="button" class="btn acc wide" id="opt-run">AI 최적화 실행 <span class="ar">→</span></button>`;
    $('cl-opt').innerHTML = html;
  }
  const conv = (h) => convSVG(h);
  function runOpt() {
    if (optRun && optRun.running) return;
    if (R.opt) { setOptState(null); R = pipeline(); }
    const base = pipeline({ noOpt: true });
    optRun = { running: true, i: 0, iters: 0, history: [] };
    renderOpt();
    optimize(base.gen, base.Q, base.pp, { solve: base.fx.solve || 0, noise: base.cond.noise, onStep: ({ i, iters, history }) => { if (!alive) return; optRun.i = i; optRun.iters = iters; optRun.history = history; renderOpt(); } })
      .then(O => {
        if (!alive) return;
        const hist = O.history.filter((_, i) => i % Math.max(1, Math.floor(O.history.length / 120)) === 0);
        optRun = { running: false, done: true, O, history: hist, before: metr(O.before.S, O.before.C), after: metr(O.after.S, O.after.C), moves: describeMoves(O, base.gen) };
        renderOpt();
      });
  }
  function applyOpt() {
    if (!optRun || !optRun.done) return;
    setOptState({ x: optRun.O.after.x, before: optRun.before, after: optRun.after, moves: optRun.moves, history: optRun.history, at: Date.now() });
    optRun = null; refreshAll();
  }
  function refreshAll() {
    const ratio = ui.t / S.end;
    R = pipeline(); lmRec = derive(); $('p-t').max = S.end;
    renderStats(); renderGantt(); renderMilestones(); renderClash();
    setT(ratio * S.end, true);
  }
  $('clash').addEventListener('click', (e) => {
    if (e.target.closest('#opt-run')) { runOpt(); return; }
    if (e.target.closest('#opt-apply')) { applyOpt(); return; }
    if (e.target.closest('#opt-undo')) { setOptState(null); optRun = null; refreshAll(); return; }
    const tr = e.target.closest('tr[data-ci]');
    if (tr) {
      const c = R.C.list[+tr.dataset.ci]; setPlaying(false); setT((c.start + c.end) / 2, true);
      if (viewer) { const bi = gen.bldgs.findIndex(b => b.id === c.a); if (bi >= 0) { viewer.focusBuilding(bi); viewer.select(bi); } else if (c.block && c.block !== '*') viewer.focusBlock(c.block); }
      $('p-ws').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
    }
    const hc = e.target.closest('[data-m]'); if (hc) { setPlaying(false); setT(+hc.dataset.m * M + M / 2, true); }
  });
  $('cl-month').addEventListener('pointermove', (e) => { const el = e.target.closest('[data-tip]'); tip(el ? el.dataset.tip : null, e.clientX, e.clientY); });
  $('cl-month').addEventListener('pointerleave', () => tip(null));

  // ---------- 3D ----------
  viewer = createViewer($('p-stage'), {
    onView: (k) => { ui.view = k; $('p-views').querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === k))); },
    onPick: (bi) => { ui.pick = bi; renderPick(); },
  });
  if (viewer) {
    viewer.setPlan(plan, osmReady(plan) || undefined);
    viewer.setModel(gen); viewer.paint('use', null); viewer.setSun(-5, 14);
    if (store.get().useMap !== false && !osmReady(plan)) osmFor(plan).then(c => { if (alive && viewer) viewer.setContext(c); }).catch(() => {});
  }
  else $('p-stage').insertAdjacentHTML('beforeend', '<div class="ov" style="left:14px;right:14px;top:140px"><div class="warnbox">이 기기에서 WebGL을 쓸 수 없어 3D를 표시하지 못했습니다. 간트와 표는 그대로 쓸 수 있습니다.</div></div>');
  const offTheme = onThemeChange(() => { if (viewer) viewer.applyTheme(); renderTrack(); });
  const ro = new ResizeObserver(() => renderTrack()); ro.observe($('p-tl'));
  const flush = setInterval(() => { if (pendingPush) push3D(true); }, 150);

  $('p-t').max = S.end;
  renderCtl(); renderStats(); renderGantt(); renderMilestones(); renderClash();
  setT(ui.t, true);
  if (!store.get().proc) store.set({ proc: params() });

  return () => {
    alive = false; cancelAnimationFrame(playRaf); if (rq) cancelAnimationFrame(rq); clearInterval(flush);
    ro.disconnect(); offTheme(); tip(null);
    if (viewer) viewer.dispose();
  };
}
