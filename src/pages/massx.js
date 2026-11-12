// 03 매스 (주거 외 용도): 용도별 생성 규칙으로 획지에 동·설비를 배치한다. 변수를 바꾸면 물량·공정·예산·위험이 이어서 다시 계산된다.
import { XMETA, XDEF, XKEYS, KIND_NAME, floorUseName } from '../sim/massx.js';
import { useOf, FLOOR_USES } from '../sim/uses.js';
import { fallbackFor, osmFor } from '../sim/ctxload.js';
import { createViewer } from '../sim/viewer.js';
import { store } from '../store.js';
import { pipeline, fmt, won, onThemeChange, tip } from '../pipeline.js';
import { head, sub, dot, escH } from '../ui/sys.js';

export const title = '03 매스 배치';
const man = (v) => fmt(v / 1e4, 1) + '만㎡';
const MODES = [['real', '실사'], ['use', '용도'], ['model', '흰 모형']];
const VIEWS = [['axon', 'AXON'], ['bird', '조감'], ['wide', '광역'], ['top', '평면'], ['east', '동측']];

export function mount(root) {
  const S0 = store.get(), use = S0.use, u = useOf(use);
  let params = { ...XDEF[use], ...((S0.massx || {})[use] || {}) };
  const ui = { mode: 'use', pick: null };
  let R = pipeline(), viewer = null, alive = true, ctl = null;
  const site = R.site;
  const $ = (id) => root.querySelector('#' + id);

  root.innerHTML = head({
    n: 3, key: 'MASS', title: '어떻게 배치할까', status: `${u.code} · ${u.en}`,
    dim: `${u.name} · ${escH(site.name)} · 시뮬레이션 구역 ${fmt(site.area / 1e4, 1)}ha${site.phase ? ` (전체 ${fmt(site.fullArea / 1e4, 0)}ha 중 1단계)` : ''}`,
    desc: `용도 생성 규칙이 획지마다 ${u.name}의 주요 동과 지원 시설을 놓습니다. 변수를 바꾸면 3D와 지표가 바로 바뀌고, 다음 단계(공법·4D·5D·위험)가 이 매스로 다시 계산됩니다.`,
    stats: [['<span id="k-kl"></span>', '<b id="k-kv">—</b>', '<span id="k-ku"></span>'], ['지상 연면적', '<b id="k-gfa">—</b>', 'GFA ABOVE'], ['최고 높이', '<b id="k-h">—</b>', 'MAX HEIGHT']],
    actions: `<a class="btn ghost" href="#/site">← 02 입지</a><a class="btn acc" href="#/method">04 공법·재료 <span class="ar">→</span></a>`,
  }) + `
  <section class="ws" aria-label="3D 매스 작업 화면">
    <div class="stage" id="x-stage"></div>
    <div class="ov f-top"><div class="seg" id="x-modes" role="group" aria-label="색 표시">${MODES.map(([k, n]) => `<button type="button" data-mode="${k}" aria-pressed="${k === ui.mode}">${n}</button>`).join('')}</div>
      <div class="seg" id="x-views" role="group" aria-label="시점">${VIEWS.map(([k, n]) => `<button type="button" data-view="${k}" aria-pressed="${k === 'axon'}">${n}</button>`).join('')}</div></div>
    <aside class="float f-l" id="x-fl" aria-label="배치 변수">
      <div class="f-head"><span class="label-sm">Parameters · 배치 변수</span><button type="button" data-fold="x-fl" aria-expanded="true" aria-label="변수 패널 접기">−</button></div>
      <div class="f-body m-ctl"><div class="grp"><div class="sec-h" style="margin-bottom:8px"><span class="label-sm">${u.code} · ${u.name}</span><button class="chipbtn" id="x-reset" type="button">기본값</button></div><div id="x-ctl"></div></div>
        <div class="grp"><span class="label-sm">맥락 지도</span><div class="map-state" id="x-map" role="status"></div></div></div>
    </aside>
    <aside class="float f-r side" id="x-fr" aria-label="배치 결과">
      <div class="f-head"><span class="label-sm">Results · 배치 결과</span><button type="button" data-fold="x-fr" aria-expanded="true" aria-label="결과 패널 접기">−</button></div>
      <div class="f-body" id="x-side"></div>
    </aside>
    <div class="float f-leg" id="x-legend"></div>
    <div class="pickcard" id="x-pick" hidden></div>
  </section>
  <div class="wrap">
    <section class="sx-sec">${sub('03.1', '동·설비 목록', '행에 마우스를 올리면 3D에서 강조합니다.')}
      <div class="panel"><div class="tw"><table id="x-table"></table></div></div></section>
    <section class="sx-sec">${sub('03.2', '용도별 바닥면적', '층 용도마다 연면적 합. 공정 설비·탱크는 설비 바닥(투영) 면적입니다.')}
      <div class="panel pad"><div id="x-uses"></div></div></section>
    <section class="sx-sec">${sub('03.3', '생성 규칙', '이 용도의 배치 원칙')}
      <div class="panel pad"><ul class="issues" id="x-rules"></ul></div></section>
  </div>`;

  function ctlHTML(k) {
    const m = XMETA[k], v = params[k], d = XDEF[use][k];
    return `<div class="ctl${Math.abs(v - d) > 1e-9 ? ' changed' : ''}"><label for="xc-${k}">${m.label}</label>
      <span class="inbox"><input type="number" id="xn-${k}" data-k="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}" aria-label="${m.label} 값"><span class="unit">${m.unit}</span></span>
      <input type="range" id="xc-${k}" data-k="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}">${m.note ? `<span class="hint">${m.note}</span>` : ''}</div>`;
  }
  function renderCtl() { $('x-ctl').innerHTML = XKEYS(use).map(ctlHTML).join(''); }
  function syncCtl() {
    root.querySelectorAll('#x-ctl [data-k]').forEach(el => { const k = el.dataset.k; if (document.activeElement !== el) el.value = params[k]; el.closest('.ctl').classList.toggle('changed', Math.abs(params[k] - XDEF[use][k]) > 1e-9); });
  }

  function recompute() {
    store.set({ massx: { ...(store.get().massx || {}), [use]: params } });
    R = pipeline();
    if (viewer) { viewer.setModel(R.gen); paint(); }
    syncCtl(); renderStats(); renderSide(); renderTable(); renderUses(); renderLegend();
  }
  const usesOf = () => Object.entries(R.gen.totals.byUse).filter(([k, v]) => v > 0 && FLOOR_USES[k]).sort((a, b) => b[1] - a[1]);
  function paint() { if (viewer) viewer.paint(ui.mode, null); }
  function renderStats() {
    const t = R.gen.totals, k = t.kpi;
    $('k-kl').textContent = k.label; $('k-kv').textContent = fmt(k.value); $('k-ku').textContent = k.unit;
    $('k-gfa').textContent = man(t.gfaAbove); $('k-h').textContent = fmt(t.maxH, 0) + 'm';
  }
  function renderSide() {
    const t = R.gen.totals, g = R.gen;
    const kinds = Object.entries(t.byKind).sort((a, b) => b[1] - a[1]);
    const depth = Math.max(0, ...g.bldgs.filter(b => b.kind === 'basement').map(b => b.floors.reduce((s, f) => s + f.h, 0)));
    $('x-side').innerHTML = `<div class="blk"><h3><span>${t.kpi.label}</span><span>${t.kpi.unit}</span></h3><div class="x-big">${fmt(t.kpi.value)}</div></div>
      <div class="blk"><h3><span>규모</span><span>${g.blocks.length}개 블록</span></h3><dl class="kv tight">
        <div><dt>지상 연면적</dt><dd>${fmt(t.gfaAbove)}㎡</dd></div><div><dt>지하 연면적</dt><dd>${fmt(t.gfaBelow)}㎡</dd></div>
        <div><dt>획지 면적</dt><dd>${fmt(t.lotArea)}㎡</dd></div><div><dt>용적률 (획지)</dt><dd>${fmt(t.far, 0)}%</dd></div>
        <div><dt>굴착 깊이</dt><dd>${fmt(depth, 1)}m</dd></div><div><dt>주차</dt><dd>${fmt(t.parking)}대</dd></div></dl></div>
      <div class="blk"><h3><span>동·설비 구성</span><span>${t.towers}개</span></h3><div class="rulelist">${kinds.map(([k, n]) => `<div><span class="r">${n}</span><span>${KIND_NAME[k] || k}</span><span class="c"></span></div>`).join('')}</div></div>
      ${g.warnings.length ? `<div class="blk">${g.warnings.map(w => `<div class="warnbox">${escH(w)}</div>`).join('')}</div>` : ''}`;
  }
  function renderLegend() {
    if (ui.mode !== 'use') { $('x-legend').innerHTML = ''; $('x-legend').hidden = true; return; }
    $('x-legend').hidden = false;
    $('x-legend').innerHTML = usesOf().slice(0, 9).map(([k]) => `<span class="lg"><i style="background:var(${FLOOR_USES[k].tok})"></i>${FLOOR_USES[k].name}</span>`).join('');
  }
  function renderTable() {
    const list = R.gen.bldgs.map((b, bi) => ({ b, bi })).filter(x => x.b.kind !== 'basement');
    const top = list.slice(0, 80);
    $('x-table').innerHTML = `<thead><tr><th class="l">ID</th><th class="l">종류</th><th>블록</th><th>층·단</th><th>높이</th><th>바닥 면적</th><th>연면적</th><th class="l">주 용도</th></tr></thead>
      <tbody>${top.map(({ b, bi }) => { const main = b.floors.filter(f => f.lv > 0).reduce((m, f) => (m[f.use] = (m[f.use] || 0) + f.area, m), {}); const mu = Object.entries(main).sort((a, c) => c[1] - a[1])[0];
        return `<tr data-bi="${bi}"><td class="l mono">${b.id}</td><td class="l">${escH(b.formName || KIND_NAME[b.kind] || b.kind)}</td><td class="mono">${b.block}</td><td>${b.storeys}${b.shape === 'cyl' ? '단' : '층'}</td><td>${fmt(b.height, 1)}m</td><td>${fmt(b.foot)}㎡</td><td>${fmt(b.gfa)}㎡</td><td class="l">${mu ? (floorUseName(mu[0]) || mu[0]) : ''}</td></tr>`; }).join('')}</tbody>
      ${list.length > top.length ? `<tfoot><tr><td colspan="8" class="l note">외 ${list.length - top.length}개 (탱크·탑류 등)</td></tr></tfoot>` : ''}`;
  }
  function renderUses() {
    const L = usesOf(), tot = L.reduce((s, [, v]) => s + v, 0) || 1;
    $('x-uses').innerHTML = `<div class="mixbar" role="img" aria-label="용도별 바닥면적">${L.map(([k, v]) => `<i style="width:${(v / tot * 100).toFixed(2)}%;background:var(${FLOOR_USES[k].tok})" title="${FLOOR_USES[k].name} ${fmt(v)}㎡"></i>`).join('')}</div>
      <div class="mixleg x-ul">${L.map(([k, v]) => `<div><span><i style="background:var(${FLOOR_USES[k].tok})"></i>${FLOOR_USES[k].name}</span><span class="num">${fmt(v)}㎡ · ${fmt(v / tot * 100, 1)}%</span></div>`).join('')}</div>`;
  }
  const RULES = {
    tower: ['기준층 면적과 최고 층수로 타워 수를 정하고, 저층부는 포디움으로 가로를 채웁니다.', '코어는 기준층 중앙, 피난안전층은 30개 층마다 둡니다.', '지하층은 주차·기계실, 굴착 깊이가 흙막이·차수 공법을 결정합니다.'],
    mall: ['대형 판매동 + 중앙 아트리움 + 주차 램프.', '장스팬(12m 안팎) 철골·PC, 층고 6m.'],
    museum: ['전시동·수장고·로비를 나누고, 수장고는 항온항습을 위해 지하·북측에 둡니다.'],
    arena: ['타원형 볼(관람석 단)과 대공간 지붕 트러스, 주변 광장.'],
    hospital: ['진료 포디움 위에 병동 타워, 수술·영상 장비층은 미진동 구조.'],
    campus: ['연구동 여러 동을 중정형으로, 실험동은 층고 4.5m 이상.'],
    fab: ['팹(클린룸)동은 길이 200m 안팎, 클린룸·서브팹·인터스티셜을 층으로 쌓습니다.', 'CUB(중앙 유틸리티)·폐수 처리·변전·가스 탱크를 지원 블록에 배치합니다.', '팹 수 변수만큼 생산 블록, 나머지는 지원 시설과 증설 예정지.'],
    factory: ['생산동 + 원료·완제품 창고 + 유틸리티, 단층 장스팬 PC·철골.'],
    dc: ['데이터홀동 + 전기·변전동 + 비상 발전기 열, 냉각탑은 지붕.'],
    logistics: ['다층 물류센터(램프로 각 층 트럭 접안), 층고 10m 안팎.'],
    plant: ['공정 블록(증류탑·반응기·분해로·파이프랙) → 저장 탱크 블록 → 유틸리티 블록 순서.', '위험물 저장 탱크는 이격 거리를 두고 방유제로 둘러쌉니다.', '플레어 스택은 첫 공정 블록 모서리에 둡니다.'],
  };
  function renderRules() { $('x-rules').innerHTML = (RULES[u.gen] || []).map(x => `<li>${x}</li>`).join(''); }
  function renderPick() {
    const card = $('x-pick');
    if (!ui.pick) { card.hidden = true; return; }
    const b = R.gen.bldgs[ui.pick.bi], f = b.floors[ui.pick.fi];
    card.hidden = false;
    card.innerHTML = `<div class="pk-h"><span class="sx-code-s">${b.id}</span><button type="button" class="chipbtn" id="x-pickx" aria-label="닫기">×</button></div>
      <b>${escH(b.formName || KIND_NAME[b.kind])}</b><span class="note">${b.storeys}${b.shape === 'cyl' ? '단' : '층'} · ${fmt(b.height, 1)}m · 연면적 ${fmt(b.gfa)}㎡</span>
      ${f ? `<span class="note">${f.lv > 0 ? f.lv + (b.shape === 'cyl' ? '단' : '층') : 'B' + -f.lv}: ${floorUseName(f.use) || f.use} · ${fmt(f.area)}㎡ · 층고 ${fmt(f.h, 1)}m</span>` : ''}`;
  }

  // ---------- 맥락 지도 ----------
  let ctx = fallbackFor(R.gen.plan);
  async function loadMap() {
    if (ctl) ctl.abort(); ctl = new AbortController(); const my = ctl;
    $('x-map').textContent = '실제 지도(OpenStreetMap) 불러오는 중…';
    try {
      const c = await osmFor(R.gen.plan, { signal: my.signal, onStep: (m) => { if (my === ctl) $('x-map').textContent = m; } });
      if (!alive || my !== ctl) return;
      if (c) { ctx = c; if (viewer) viewer.setContext(ctx); $('x-map').textContent = '실제 지도 맥락 (OpenStreetMap)'; }
      else $('x-map').textContent = '지도 자료가 없어 자동 생성 맥락을 씁니다.';
    } catch (e) { if (alive && my === ctl) $('x-map').textContent = '지도를 받지 못해 자동 생성 맥락을 씁니다.'; }
  }

  // ---------- 이벤트 ----------
  let q = 0;
  root.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.k; if (!k || !XMETA[k]) return;
    const m = XMETA[k]; let v = +e.target.value; if (!Number.isFinite(v)) return;
    v = Math.min(m.max, Math.max(m.min, v)); params = { ...params, [k]: v };
    const other = root.querySelector(e.target.type === 'range' ? `#xn-${k}` : `#xc-${k}`); if (other) other.value = v;
    if (!q) q = requestAnimationFrame(() => { q = 0; if (alive) recompute(); });
  });
  root.addEventListener('click', (e) => {
    if (e.target.id === 'x-reset') { params = { ...XDEF[use] }; renderCtl(); recompute(); return; }
    if (e.target.id === 'x-pickx') { ui.pick = null; renderPick(); if (viewer) viewer.select(null); return; }
    const md = e.target.closest('[data-mode]'); if (md) { ui.mode = md.dataset.mode; $('x-modes').querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === md))); paint(); renderLegend(); return; }
    const vw = e.target.closest('[data-view]'); if (vw && viewer) { viewer.setView(vw.dataset.view); return; }
    const fd = e.target.closest('[data-fold]'); if (fd) { const p = $(fd.dataset.fold); const open = p.classList.toggle('folded'); fd.setAttribute('aria-expanded', String(!open)); fd.textContent = open ? '+' : '−'; }
  });
  $('x-table').addEventListener('pointerover', (e) => { const tr = e.target.closest('tr[data-bi]'); if (tr && viewer) viewer.select(+tr.dataset.bi); });
  $('x-table').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-bi]'); if (tr && viewer) viewer.focusBuilding(+tr.dataset.bi); });

  viewer = createViewer($('x-stage'), {
    onPick: (bi, fi) => { ui.pick = bi == null ? null : { bi, fi }; renderPick(); },
    onView: (k) => { $('x-views').querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === k))); },
  });
  if (viewer) { viewer.setPlan(R.gen.plan, ctx); viewer.setModel(R.gen); viewer.setView('axon'); paint(); }
  else $('x-stage').insertAdjacentHTML('beforeend', '<div class="ov" style="left:14px;right:14px;top:60px"><div class="warnbox">이 기기에서 WebGL을 쓸 수 없어 3D를 표시하지 못했습니다. 표와 지표는 그대로 쓸 수 있습니다.</div></div>');
  const offTheme = onThemeChange(() => { if (viewer) viewer.applyTheme(); });
  renderCtl(); renderRules(); renderStats(); renderSide(); renderTable(); renderUses(); renderLegend();
  if (store.get().useMap !== false) loadMap(); else $('x-map').textContent = '자동 생성 맥락';
  return () => { alive = false; if (ctl) ctl.abort(); offTheme(); if (viewer) viewer.dispose(); tip(null); };
}
