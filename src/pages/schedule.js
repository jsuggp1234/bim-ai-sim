// 3단계: 동·층별 일람표 (층고·FL·면적·세대) — 예산 산정 물량의 입력
import { DEFAULTS, generate, USE_LABEL } from '../yongsan/massing.js';
import { ZONES } from '../yongsan/plan.js';
import { store } from '../store.js';
import { quantities } from '../yongsan/quantities.js';

export const title = '3단계 층별 일람표';

const fmt = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
const KIND = { apt: '아파트', officetel: '오피스텔', office: '업무', landmark: '랜드마크', podium: '포디움', basement: '지하층' };
const USE_TOKEN = { res: '--res', officetel: '--officetel', office: '--office', retail: '--retail', lobby: '--retail', refuge: '--refuge', mech: '--mech', b1: '--mech', parking: '--ctx' };
const FILTERS = [['all', '전체'], ['apt', '아파트'], ['officetel', '오피스텔'], ['office', '업무·랜드마크'], ['podium', '포디움'], ['basement', '지하층']];

export function mount(root, arg) {
  const S = store.get();
  const params = { ...DEFAULTS, ...(S.mass || {}) };
  const gen = generate(params);
  const Q = quantities(gen);
  const ui = { filter: 'all', q: '', open: new Set(arg ? [arg] : []) };
  const $ = (id) => root.querySelector('#' + id);

  root.innerHTML = `
  <div class="page-h">
    <div><span class="label-sm">3단계 · 물량·일람표</span><h1>용산국제업무지구 동·층별 일람표</h1>
    <p>2단계 매스 배치안의 모든 동을 층 단위로 펼쳤습니다. 층고, 바닥 레벨(FL), 바닥면적, 세대수, 외벽 면적을 예산 산정의 입력으로 내려받을 수 있습니다. 2단계에서 변수를 바꾸면 이 표도 바뀝니다.</p></div>
    <div class="actions"><a class="btn ghost" href="#/mass">← 2단계 매스 배치</a><a class="btn" href="#/next">4·5단계 공정·예산 →</a></div>
  </div>
  <div class="p-sched">
    <section class="panel pad s-sum" aria-label="요약"><div class="sec-h"><h2>요약</h2><span class="hint" id="s-from"></span></div><div class="stats" id="s-stats" style="border:1px solid var(--line);border-radius:var(--r);overflow:hidden"></div></section>
    <section class="panel pad s-use" aria-label="용도별 집계"><div class="sec-h"><h2>용도별 집계</h2><span class="hint">지상·지하 전체 층</span></div><div class="tw"><table id="s-use"></table></div></section>
    <section class="panel pad s-list" aria-label="동별 일람">
      <div class="sec-h"><h2>동별 일람</h2><span class="hint">행을 누르면 층별 상세가 펼쳐집니다</span></div>
      <div class="filters"><div class="seg" id="s-filter" role="group" aria-label="용도 필터">${FILTERS.map(([k, n]) => `<button type="button" data-f="${k}" aria-pressed="${k === ui.filter}">${n}</button>`).join('')}</div>
        <input type="search" id="s-q" placeholder="동 번호 검색 (예: C1, B4-OT)" aria-label="동 번호 검색"><span class="note" id="s-count"></span></div>
      <div class="tw"><table id="s-list"></table></div>
    </section>
    <section class="panel pad s-base" aria-label="지하층"><div class="sec-h"><h2>블록별 지하층·굴토</h2><span class="hint">굴토 깊이 = 지하층 층고 합 + 기초 1.5m</span></div><div class="tw"><table id="s-base"></table></div></section>
    <section class="panel pad s-out" aria-label="내보내기">
      <div class="sec-h"><h2>예산 산정으로 넘길 물량</h2><span class="hint">공사비 단가를 곱하기 전의 기초 물량</span></div>
      <div class="cols2"><dl class="kv" id="s-qty"></dl>
        <div style="display:grid;gap:10px;align-content:start">
          <div class="row"><button class="btn" type="button" id="s-csv-floor">층별 CSV</button><button class="btn ghost" type="button" id="s-csv-bldg">동별 CSV</button><button class="btn ghost" type="button" id="s-json">전체 JSON</button></div>
          <span class="note">CSV는 엑셀에서 바로 열리도록 UTF-8(BOM)으로 저장합니다. JSON에는 2단계 변수와 1단계에서 넘어온 값이 함께 들어갑니다.</span>
        </div></div>
    </section>
  </div>`;

  // 요약
  const h1 = S.handoff1;
  $('s-from').textContent = h1 ? `1단계 ${h1.presetLabel} → 2단계 ${fmt(params.housingTarget)}호 목표` : `2단계 변수 기준 (주거 목표 ${fmt(params.housingTarget)}호)`;
  const t = gen.totals;
  const above = gen.bldgs.filter(b => b.kind !== 'basement');
  const cells = [
    ['동수', `${t.towers}동`, `포디움 ${above.length - t.towers}개 · 지하 ${gen.blocks.filter(b => b.basementLv).length}개 블록`],
    ['층 합계', fmt(Q.floorCount) + '개 층', `지상 ${fmt(Q.floorCountAbove)} · 지하 ${fmt(Q.floorCount - Q.floorCountAbove)}`],
    ['지상 연면적', fmt(t.gfaAbove / 1e4, 1) + '만㎡', `지하 ${fmt(t.gfaBelow / 1e4, 1)}만㎡`],
    ['세대', fmt(t.units), `아파트 ${fmt(t.apt)} · 오피스텔 ${fmt(t.officetel)}`],
    ['외벽 면적', fmt(Q.facade / 1e4, 1) + '만㎡', '창 포함, 지상층 둘레 × 층고'],
    ['굴토량', fmt(Q.excavation / 1e4, 1) + '만㎥', `최대 깊이 ${fmt(Q.maxDepth, 1)}m`],
    ['주차', fmt(t.parking) + '대', '지하 주차장'],
    ['최고 높이', fmt(t.maxH, 0) + 'm', '옥탑 제외'],
  ];
  $('s-stats').innerHTML = cells.map(([k, v, s]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join('');

  // 용도별
  const totalArea = Q.byUse.reduce((s, u) => s + u.area, 0);
  $('s-use').innerHTML = `<thead><tr><th>용도</th><th>층 수</th><th>바닥면적 ㎡</th><th>비율</th><th>평균 층고 m</th><th>세대</th></tr></thead><tbody>
    ${Q.byUse.map(u => `<tr><td><span class="zdot" style="background:var(${USE_TOKEN[u.use] || '--mech'})"></span>${USE_LABEL[u.use] || u.use}</td><td>${fmt(u.floors)}</td><td>${fmt(u.area)}</td>
      <td><span class="hstack" style="width:120px;display:inline-flex" role="img" aria-label="${fmt(u.area / totalArea * 100, 1)}%"><i style="width:${(u.area / totalArea * 100).toFixed(1)}%;background:var(${USE_TOKEN[u.use] || '--mech'})"></i></span> ${fmt(u.area / totalArea * 100, 1)}%</td>
      <td>${fmt(u.avgH, 2)}</td><td>${u.units ? fmt(u.units) : '—'}</td></tr>`).join('')}</tbody>`;

  // 동별
  function typLine(b) {
    const typ = b.floors.find(f => f.use === 'res' || f.use === 'officetel' || f.use === 'office') || b.floors[0];
    return typ;
  }
  function floorTable(b) {
    const rows = b.floors.slice().reverse().map(f => {
      const fa = Q.facadeOf(b, f);
      return `<tr class="${f.use === 'refuge' ? 'refuge' : ''}"><td style="text-align:left">${f.name}</td><td style="text-align:left;font-family:var(--f-body)">${USE_LABEL[f.use] || f.use}</td>
        <td>${fmt(f.h, 2)}</td><td>${f.y0 >= 0 ? '+' : '−'}${fmt(Math.abs(f.y0), 2)}</td><td>${fmt(f.area, 1)}</td><td>${f.units || '—'}</td><td>${b.kind === 'basement' ? '—' : fmt(fa, 0)}</td></tr>`;
    }).join('');
    return `<table><thead><tr><th style="text-align:left">층</th><th style="text-align:left">용도</th><th>층고 m</th><th>FL m</th><th>바닥면적 ㎡</th><th>세대</th><th>외벽 ㎡</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  const match = (b) => {
    if (ui.filter === 'office' && !(b.kind === 'office' || b.kind === 'landmark')) return false;
    if (ui.filter !== 'all' && ui.filter !== 'office' && b.kind !== ui.filter) return false;
    if (ui.q && !b.id.toLowerCase().includes(ui.q.toLowerCase())) return false;
    return true;
  };
  function renderList() {
    const list = gen.bldgs.filter(match);
    $('s-count').textContent = `${list.length}개 동`;
    const head = `<thead><tr><th>동</th><th>블록</th><th>용도</th><th>형식·평형</th><th>지상</th><th>지하</th><th>높이 m</th><th>연면적 ㎡</th><th>세대</th><th>기준층 면적 ㎡</th><th>기준층 층고</th><th>1층 층고</th><th>피난안전층</th></tr></thead>`;
    const body = list.map(b => {
      const typ = typLine(b), ref = b.floors.filter(f => f.use === 'refuge');
      const open = ui.open.has(b.id);
      const main = `<tr class="b${open ? ' open' : ''}" data-b="${b.id}" id="row-${b.id}" tabindex="0" aria-expanded="${open}"><td class="mono">${b.id}</td><td>${b.block} · ${ZONES[b.zone].name}</td><td>${KIND[b.kind]}</td>
        <td>${b.kind === 'apt' ? `${b.form === 'slab' ? '판상' : '탑상'} · ${b.typeName}` : b.typeName || '—'}</td>
        <td>${b.kind === 'basement' ? '—' : b.storeys + '층'}</td><td>${b.kind === 'basement' ? 'B' + b.basementLv : '—'}</td><td>${b.kind === 'basement' ? '−' + fmt(-b.floors[b.floors.length - 1].y0, 1) : fmt(b.height, 1)}</td>
        <td>${fmt(b.gfa)}</td><td>${b.units ? fmt(b.units) : '—'}</td><td>${fmt(typ.area, 0)}</td><td>${fmt(typ.h, 2)}</td><td>${b.kind === 'basement' ? '—' : fmt(b.floors[0].h, 2)}</td>
        <td>${ref.length ? ref.map(f => f.name).join(', ') : '—'}</td></tr>`;
      return main + (open ? `<tr class="fl"><td colspan="13" style="padding:8px 10px 12px 24px">${floorTable(b)}</td></tr>` : '');
    }).join('');
    $('s-list').innerHTML = head + `<tbody>${body}</tbody>`;
  }

  // 지하
  $('s-base').innerHTML = `<thead><tr><th>블록</th><th>지하층</th><th>B1 층고</th><th>주차층 층고</th><th>지하 바닥면적 ㎡</th><th>굴토 깊이 m</th><th>굴토량 ㎥</th><th>주차 대</th></tr></thead><tbody>
    ${Q.basements.map(x => `<tr><td>${x.block}</td><td>B${x.levels}</td><td>${fmt(x.hB1, 1)}</td><td>${fmt(x.hPark, 2)}</td><td>${fmt(x.area)}</td><td>${fmt(x.depth, 1)}</td><td>${fmt(x.volume)}</td><td>${fmt(x.spaces)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>합계</td><td></td><td></td><td></td><td>${fmt(Q.basements.reduce((s, x) => s + x.area, 0))}</td><td></td><td>${fmt(Q.excavation)}</td><td>${fmt(t.parking)}</td></tr></tfoot>`;

  // 물량
  $('s-qty').innerHTML = [
    ['지상 연면적', fmt(t.gfaAbove) + '㎡'], ['지하 연면적', fmt(t.gfaBelow) + '㎡'], ['주거 기준층 면적 합계', fmt(Q.resArea) + '㎡'], ['업무 기준층 면적 합계', fmt(Q.officeArea) + '㎡'],
    ['상업·로비·근생', fmt(Q.retailArea) + '㎡'], ['피난안전층', fmt(Q.refugeArea) + '㎡ (' + Q.refugeCount + '개 층)'], ['외벽 면적 (창 포함)', fmt(Q.facade) + '㎡'], ['지붕 면적', fmt(Q.roof) + '㎡'],
    ['굴토량', fmt(Q.excavation) + '㎥'], ['주차', fmt(t.parking) + '대'], ['세대', fmt(t.units)],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

  // 내려받기
  const download = (name, text, type) => {
    const blob = new Blob([text], { type }); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const esc = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = (rows) => '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
  $('s-csv-floor').addEventListener('click', () => {
    const rows = [['동', '블록', '존', '동 용도', '층', '층 용도', '층고_m', 'FL_m', '바닥면적_m2', '세대', '외벽면적_m2']];
    gen.bldgs.forEach(b => b.floors.forEach(f => rows.push([b.id, b.block, ZONES[b.zone].name, KIND[b.kind], f.name, USE_LABEL[f.use] || f.use, f.h.toFixed(2), f.y0.toFixed(2), f.area.toFixed(1), f.units, b.kind === 'basement' ? 0 : Q.facadeOf(b, f).toFixed(1)])));
    download('yongsan-floors.csv', csv(rows), 'text/csv;charset=utf-8');
  });
  $('s-csv-bldg').addEventListener('click', () => {
    const rows = [['동', '블록', '존', '용도', '형식', '평형', '지상층', '지하층', '높이_m', '연면적_m2', '세대', '외벽면적_m2', '건축면적_m2']];
    gen.bldgs.forEach(b => rows.push([b.id, b.block, ZONES[b.zone].name, KIND[b.kind], b.form || '', b.typeName || '', b.kind === 'basement' ? 0 : b.storeys, b.basementLv, b.height.toFixed(1), b.gfa.toFixed(0), b.units, Q.facadeOfBldg(b).toFixed(0), ((b.rect.u1 - b.rect.u0) * (b.rect.v1 - b.rect.v0)).toFixed(1)]));
    download('yongsan-buildings.csv', csv(rows), 'text/csv;charset=utf-8');
  });
  $('s-json').addEventListener('click', () => {
    const r = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
    const o = {
      schema: 'bim-sim/stage3-schedule@1', generated_at: new Date().toISOString(),
      from_stage1: h1 ? { site: h1.siteName, preset: h1.presetLabel, units: h1.units, avg_unit_m2: h1.avgUnit, rental_share_pct: h1.rentalShare } : null,
      stage2_params: params,
      totals: { units: t.units, apt: t.apt, officetel: t.officetel, rental: t.rental, gfa_above_m2: r(t.gfaAbove, 0), gfa_below_m2: r(t.gfaBelow, 0), far_pct: r(t.far, 1), parking: t.parking, max_height_m: r(t.maxH, 1) },
      quantities: { facade_m2: r(Q.facade, 0), roof_m2: r(Q.roof, 0), excavation_m3: r(Q.excavation, 0), res_area_m2: r(Q.resArea, 0), office_area_m2: r(Q.officeArea, 0), retail_area_m2: r(Q.retailArea, 0), refuge_area_m2: r(Q.refugeArea, 0) },
      blocks: gen.blocks.map(b => ({ id: b.id, zone: b.zone, area_m2: r(b.area, 0), gfa_above_m2: r(b.gfaAbove, 0), far_pct: r(b.far, 1), bcr_pct: r(b.bcr, 1), units: b.units, max_floors: b.maxFloors, basement_levels: b.basementLv, parking: b.parking })),
      buildings: gen.bldgs.map(b => ({ id: b.id, block: b.block, zone: b.zone, kind: b.kind, form: b.form || null, type: b.typeName || null,
        rect_site_m: { u0: r(b.rect.u0), u1: r(b.rect.u1), v0: r(b.rect.v0), v1: r(b.rect.v1) }, height_m: r(b.height), storeys: b.storeys, units: b.units, gfa_m2: r(b.gfa, 0),
        floors: b.floors.map(f => ({ name: f.name, use: f.use, h: r(f.h), fl: r(f.y0), area: r(f.area, 1), units: f.units })) })),
    };
    download('yongsan-schedule.json', JSON.stringify(o, null, 2), 'application/json');
  });

  // 이벤트
  $('s-filter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; ui.filter = b.dataset.f; $('s-filter').querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderList(); });
  $('s-q').addEventListener('input', e => { ui.q = e.target.value.trim(); renderList(); });
  const toggle = (id) => { if (ui.open.has(id)) ui.open.delete(id); else ui.open.add(id); renderList(); const r = $('row-' + CSS.escape(id)); if (r) r.focus(); };
  $('s-list').addEventListener('click', e => { const tr = e.target.closest('tr.b'); if (tr) toggle(tr.dataset.b); });
  $('s-list').addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const tr = e.target.closest('tr.b'); if (tr) { e.preventDefault(); toggle(tr.dataset.b); } });

  renderList();
  if (arg) { const r = root.querySelector('#row-' + CSS.escape(arg)); if (r) setTimeout(() => r.scrollIntoView({ block: 'center' }), 50); }
  return () => {};
}
