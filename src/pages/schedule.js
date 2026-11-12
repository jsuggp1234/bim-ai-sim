// 3단계: 동·층별 일람표 (층고·FL·면적·세대) — 공정·예산 산정 물량의 입력
import { USE_LABEL, FORMS } from '../yongsan/massing.js';
import { ZONES } from '../yongsan/plan.js';
import { store } from '../store.js';
import { pipeline, fmt, download, csv, tip } from '../pipeline.js';

export const title = '03 층별 일람표';

const KIND = { apt: '아파트', officetel: '오피스텔', office: '업무', landmark: '랜드마크', podium: '포디움', basement: '지하층' };
const USE_TOKEN = { res: '--res', officetel: '--officetel', office: '--office', retail: '--retail', lobby: '--retail', refuge: '--refuge', mech: '--mech', b1: '--mech', parking: '--ctx' };
const FILTERS = [['all', '전체'], ['apt', '아파트'], ['officetel', '오피스텔'], ['office', '업무·랜드마크'], ['podium', '포디움'], ['basement', '지하층']];
const C30 = Math.cos(Math.PI / 6);

export function mount(root, arg) {
  const S = store.get();
  if (!S.seen3) store.set({ seen3: true });
  const { gen, Q, mp: params } = pipeline();
  const firstApt = gen.bldgs.filter(b => b.kind === 'apt').sort((a, b) => b.storeys - a.storeys)[0];
  const ui = { filter: 'all', q: '', open: new Set(arg ? [arg] : []), sel: gen.bldgs.findIndex(b => b.id === (arg || (firstApt && firstApt.id))) };
  if (ui.sel < 0) ui.sel = 0;
  const $ = (id) => root.querySelector('#' + id);

  root.innerHTML = `
  <div class="page-h">
    <div><span class="label-sm">Stage 03 / 05 · Floor schedule</span><h1>동·층별 일람표</h1>
    <p>2단계 매스 배치안의 모든 동을 층 단위로 펼쳤습니다. 층고, 바닥 레벨(FL), 바닥면적, 세대수, 외벽 면적과 지하 굴토 물량이 4단계 공정과 5단계 예산의 입력이 됩니다. 2단계에서 변수를 바꾸면 이 표도 바뀝니다.</p></div>
    <div class="actions"><a class="btn ghost" href="#/mass">← 02 매스</a><a class="btn" href="#/process">04 4D 공정 <span class="ar">→</span></a></div>
  </div>
  <div class="wrap p-sched">
    <section class="s-sum" aria-label="요약"><div class="sec-title"><span class="n">03.1</span><h2>요약</h2><span class="hint" id="s-from"></span></div><div class="stats" id="s-stats" style="border:1px solid var(--ink);border-top-width:1px"></div></section>
    <section class="s-bar" aria-label="동별 단면 바코드"><div class="sec-title"><span class="n">03.2</span><h2>동별 단면 바코드</h2><span class="hint">막대 하나가 동 하나, 가는 띠 하나가 층 하나입니다. 높이는 실제 층고 축척이고, 0선 아래는 블록 지하층입니다. 동을 누르면 오른쪽 분해도와 아래 표가 그 동으로 바뀝니다.</span></div>
      <div class="panel pad"><div class="mixleg" id="s-bar-leg" style="grid-template-columns:repeat(auto-fit,minmax(104px,max-content));margin-bottom:10px"></div><div class="barcode" id="s-bar"></div></div></section>
    <section class="panel pad s-iso" aria-label="분해 엑소노메트릭"><div class="sec-h"><h2><span class="n">03.3</span>층 구성 분해도</h2><span class="hint" id="s-iso-h"></span></div><div class="iso" id="s-iso"></div></section>
    <section class="panel pad s-use" aria-label="용도별 집계"><div class="sec-h"><h2><span class="n">03.4</span>용도별 집계</h2><span class="hint">지상·지하 전체 층</span></div><div class="tw"><table id="s-use"></table></div></section>
    <section class="panel pad s-list" aria-label="동별 일람">
      <div class="sec-h"><h2><span class="n">03.5</span>동별 일람</h2><span class="hint">행을 누르면 층별 상세가 펼쳐집니다</span></div>
      <div class="filters"><div class="seg" id="s-filter" role="group" aria-label="용도 필터">${FILTERS.map(([k, n]) => `<button type="button" data-f="${k}" aria-pressed="${k === ui.filter}">${n}</button>`).join('')}</div>
        <input type="search" id="s-q" placeholder="동 번호 검색 (예: C1, B4-OT)" aria-label="동 번호 검색"><span class="note" id="s-count"></span></div>
      <div class="tw"><table id="s-list"></table></div>
    </section>
    <section class="panel pad s-base" aria-label="지하층"><div class="sec-h"><h2><span class="n">03.6</span>블록별 지하층·굴토</h2><span class="hint">굴토 깊이 = 지하층 층고 합 + 기초 1.5m</span></div><div class="tw"><table id="s-base"></table></div></section>
    <section class="panel pad s-out" aria-label="내보내기">
      <div class="sec-h"><h2><span class="n">03.7</span>공정·예산으로 넘길 물량</h2><span class="hint">단가를 곱하기 전의 기초 물량</span></div>
      <dl class="kv" id="s-qty"></dl>
      <div class="row" style="margin-top:14px"><button class="btn" type="button" id="s-csv-floor">층별 CSV</button><button class="btn ghost" type="button" id="s-csv-bldg">동별 CSV</button><button class="btn ghost" type="button" id="s-json">전체 JSON</button></div>
      <p class="note" style="margin:8px 0 0">CSV는 엑셀에서 바로 열리도록 UTF-8(BOM)으로 저장합니다. JSON에는 2단계 변수와 1단계에서 넘어온 값이 함께 들어갑니다.</p>
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
      const main = `<tr class="b${open ? ' open' : ''}${gen.bldgs.indexOf(b) === ui.sel ? ' sel' : ''}" data-b="${b.id}" id="row-${b.id}" tabindex="0" aria-expanded="${open}"><td class="mono">${b.id}</td><td>${b.block} · ${ZONES[b.zone].name}</td><td>${KIND[b.kind]}</td>
        <td>${b.kind === 'apt' ? `${b.formName || ''} · ${b.typeName}` : b.typeName || '—'}</td>
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
  $('s-csv-floor').addEventListener('click', () => {
    const rows = [['동', '블록', '존', '동 용도', '층', '층 용도', '층고_m', 'FL_m', '바닥면적_m2', '세대', '외벽면적_m2']];
    gen.bldgs.forEach(b => b.floors.forEach(f => rows.push([b.id, b.block, ZONES[b.zone].name, KIND[b.kind], f.name, USE_LABEL[f.use] || f.use, f.h.toFixed(2), f.y0.toFixed(2), f.area.toFixed(1), f.units, b.kind === 'basement' ? 0 : Q.facadeOf(b, f).toFixed(1)])));
    download('yongsan-floors.csv', csv(rows), 'text/csv;charset=utf-8');
  });
  $('s-csv-bldg').addEventListener('click', () => {
    const rows = [['동', '블록', '존', '용도', '형식', '평형', '지상층', '지하층', '높이_m', '연면적_m2', '세대', '외벽면적_m2', '건축면적_m2']];
    gen.bldgs.forEach(b => rows.push([b.id, b.block, ZONES[b.zone].name, KIND[b.kind], b.formName || '', b.typeName || '', b.kind === 'basement' ? 0 : b.storeys, b.basementLv, b.height.toFixed(1), b.gfa.toFixed(0), b.units, Q.facadeOfBldg(b).toFixed(0), ((b.rect.u1 - b.rect.u0) * (b.rect.v1 - b.rect.v0)).toFixed(1)]));
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

  // ---------- 단면 바코드 ----------
  const useFill = (u) => `var(${USE_TOKEN[u] || '--mech'})`;
  function renderBar() {
    const groups = gen.blocks.map(bl => ({ bl, list: gen.bldgs.map((b, bi) => ({ b, bi })).filter(x => x.b.block === bl.id && x.b.kind !== 'basement').sort((a, c) => a.b.rect.u0 - c.b.rect.u0), base: gen.bldgs.map((b, bi) => ({ b, bi })).find(x => x.b.block === bl.id && x.b.kind === 'basement') }));
    const maxTop = Math.max(...gen.bldgs.filter(b => b.kind !== 'basement').map(b => b.floors[b.floors.length - 1].y1));
    const maxDep = Math.max(0, ...gen.bldgs.filter(b => b.kind === 'basement').map(b => -b.floors[b.floors.length - 1].y0));
    const k = 300 / Math.max(300, maxTop), cw = 11, gap = 3, bgap = 16, L = 44, T = 10;
    const Y0 = T + maxTop * k, H = Y0 + maxDep * k + 30;
    let x = L, s = '';
    for (let y = 0; y <= maxTop; y += 100) s += `<line class="${y ? 'gl' : 'gl0'}" x1="${L - 4}" y1="${(Y0 - y * k).toFixed(1)}" x2="100%" y2="${(Y0 - y * k).toFixed(1)}"/><text x="${L - 8}" y="${(Y0 - y * k + 3).toFixed(1)}" text-anchor="end">${y}</text>`;
    groups.forEach(({ bl, list, base }) => {
      const x0 = x;
      list.forEach(({ b, bi }) => {
        const top = b.floors[b.floors.length - 1].y1;
        let r = `<rect class="hit" x="${x - 1}" y="${(Y0 - top * k - 4).toFixed(1)}" width="${cw + 2}" height="${(top * k + 4).toFixed(1)}" fill="transparent"/>`;
        b.floors.forEach(f => { const w = f.roof ? cw * 0.5 : cw * Math.min(1, f.s || 1); r += `<rect x="${(x + (cw - w) / 2).toFixed(1)}" y="${(Y0 - f.y1 * k).toFixed(2)}" width="${w.toFixed(1)}" height="${Math.max(0.5, f.h * k - 0.45).toFixed(2)}" style="fill:${useFill(f.use)}"/>`; });
        s += `<g class="bc${bi === ui.sel ? ' sel' : ''}" data-bi="${bi}" tabindex="0" role="button" aria-label="${b.id} ${KIND[b.kind]} 지상 ${b.storeys}층">${r}</g>`;
        x += cw + gap;
      });
      const x1 = x - gap;
      if (base) {
        let r = `<rect class="hit" x="${x0}" y="${Y0}" width="${x1 - x0}" height="${(-base.b.floors[base.b.floors.length - 1].y0 * k + 2).toFixed(1)}" fill="transparent"/>`;
        base.b.floors.forEach(f => { r += `<rect x="${x0}" y="${(Y0 - f.y1 * k + 0.5).toFixed(2)}" width="${(x1 - x0).toFixed(1)}" height="${Math.max(0.5, f.h * k - 0.6).toFixed(2)}" style="fill:${f.use === 'parking' ? 'var(--sunk)' : 'var(--mech)'}"/>`; });
        s += `<g class="bc${base.bi === ui.sel ? ' sel' : ''}" data-bi="${base.bi}" tabindex="0" role="button" aria-label="${bl.id} 지하 ${base.b.basementLv}개 층">${r}</g>`;
      }
      s += `<text class="blkl" x="${((x0 + x1) / 2).toFixed(1)}" y="${(H - 6).toFixed(1)}" text-anchor="middle">${bl.id}</text>`;
      x = x1 + bgap;
    });
    const W = x + 4;
    $('s-bar').innerHTML = `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" style="width:100%;min-width:${Math.round(W * 0.8)}px" role="img" aria-label="동별 단면 바코드">${s}</svg>`;
    $('s-bar-leg').innerHTML = [['--res', '아파트'], ['--officetel', '오피스텔'], ['--office', '업무'], ['--retail', '상업·로비'], ['--refuge', '피난안전층'], ['--mech', '옥탑·기계·B1'], ['--sunk', '지하 주차']]
      .map(([c, n]) => `<div><span><i style="background:var(${c});box-shadow:inset 0 0 0 1px var(--line)"></i>${n}</span></div>`).join('');
  }

  // ---------- 분해 엑소노메트릭 ----------
  function renderIso() {
    const b = gen.bldgs[ui.sel];
    const groups = [];
    b.floors.forEach(f => {
      const g = groups[groups.length - 1], s = f.s || 1;
      if (g && !f.roof && !g.roof && g.use === f.use && g.s === s && Math.abs(g.h - f.h) < 1e-6) { g.n++; g.y1 = f.y1; g.last = f.name; g.units += f.units; }
      else groups.push({ use: f.use, s, roof: !!f.roof, h: f.h, n: 1, y0: f.y0, y1: f.y1, first: f.name, last: f.name, units: f.units, area: f.area });
    });
    if (b.kind === 'basement') groups.reverse();
    const parts = b.parts;
    const cu = b.core.u, cv = b.core.v;
    const corners = (q, s) => { const c = Math.cos(q.a || 0), sn = Math.sin(q.a || 0), hw = q.w * s / 2, hd = q.d * s / 2; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [q.cu - cu + x * c - y * sn, q.cv - cv + x * sn + y * c]); };
    let R = 1; parts.forEach(q => corners(q, 1).forEach(([u, v]) => { R = Math.max(R, Math.abs(u - v), Math.abs(u + v)); }));
    const k = 96 / (R * C30), gapZ = 18;
    const disp = groups.map(g => Math.max(7, Math.min(96, (g.y1 - g.y0) * 1.15)));
    const Htot = disp.reduce((a, c) => a + c, 0) + gapZ * (groups.length - 1);
    const ox = 150, planH = R * 0.5 * k, oy = 30 + Htot + planH;
    const P = (u, v, z) => [ox + (u - v) * C30 * k, oy + (u + v) * 0.5 * k - z];
    const pt = (a) => a.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    let s = '', z = 0;
    // 점선 수직선 (기준 평면 모서리)
    const base = parts.flatMap(q => corners(q, 1));
    const rightmost = base.reduce((m, p) => ((p[0] - p[1]) > (m[0] - m[1]) ? p : m), base[0]);
    base.forEach(([u, v]) => { const a = P(u, v, 0), c = P(u, v, Htot); s += `<line class="drop" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${c[0].toFixed(1)}" y2="${c[1].toFixed(1)}"/>`; });
    const tags = [];
    groups.forEach((g, gi) => {
      const z0 = z, z1 = z + disp[gi]; z = z1 + gapZ;
      const fill = useFill(g.use), side = `color-mix(in srgb, ${fill} 72%, var(--ink))`;
      const order = parts.slice().sort((a, c) => (a.cu + a.cv) - (c.cu + c.cv));
      const roofS = g.roof ? Math.sqrt(Math.max(1, g.area)) : 0;
      const list = g.roof ? [{ cu, cv, w: roofS, d: roofS, a: 0 }] : order;
      list.forEach(q => {
        const k4 = corners(q, g.roof ? 1 : g.s);
        for (let i = 0; i < 4; i++) {
          const p = k4[i], n = k4[(i + 1) % 4];
          const nu = n[1] - p[1], nv = -(n[0] - p[0]); // 바깥 법선(시계 방향 가정 무관하게 중심 기준 판정)
          const mid = [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2], cen = k4.reduce((a, c) => [a[0] + c[0] / 4, a[1] + c[1] / 4], [0, 0]);
          const out = (mid[0] - cen[0]) * nu + (mid[1] - cen[1]) * nv > 0 ? 1 : -1;
          if ((nu + nv) * out <= 0) continue;
          s += `<polygon class="slab" points="${pt([P(p[0], p[1], z0), P(n[0], n[1], z0), P(n[0], n[1], z1), P(p[0], p[1], z1)])}" style="fill:${side}"/>`;
        }
        s += `<polygon class="slab" points="${pt(k4.map(([u, v]) => P(u, v, z1)))}" style="fill:${fill}"/>`;
      });
      const m = P(rightmost[0] * (g.roof ? 0.3 : g.s), rightmost[1] * (g.roof ? 0.3 : g.s), (z0 + z1) / 2);
      const name = g.n > 1 ? `${g.first}–${g.last}` : g.first;
      tags.push({ y: m[1], x: m[0], text: `${name} ${USE_LABEL[g.use] || g.use}${g.n > 1 ? ' ×' + g.n : ''}`, sub: `H ${fmt(g.h, 2)}m · FL ${g.y0 >= 0 ? '+' : '−'}${fmt(Math.abs(g.y0), 1)}${g.units ? ' · ' + fmt(g.units) + '세대' : ''}`, acc: g.use === 'refuge' });
    });
    // 라벨: 겹치지 않게 아래에서 위로 간격 유지
    const tx = ox + R * C30 * k + 34;
    let lastY = Infinity;
    tags.forEach(t => { t.ty = Math.min(t.y, lastY - 30); lastY = t.ty; });
    tags.forEach(t => {
      const wTxt = [...t.text].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 10.5 : 6.3), 0) + 12;
      s += `<path class="drop" d="M${t.x.toFixed(1)} ${t.y.toFixed(1)} L${(tx - 8).toFixed(1)} ${t.ty.toFixed(1)} L${tx} ${t.ty.toFixed(1)}"/><circle cx="${t.x.toFixed(1)}" cy="${t.y.toFixed(1)}" r="2" style="fill:var(--ink)"/>`;
      s += `<rect x="${tx}" y="${(t.ty - 9).toFixed(1)}" width="${wTxt.toFixed(0)}" height="15" style="fill:${t.acc ? 'var(--accent)' : 'var(--ink)'}"/><text class="tagt" x="${tx + 6}" y="${(t.ty + 2).toFixed(1)}">${t.text}</text>`;
      s += `<text class="lvl" x="${tx}" y="${(t.ty + 17).toFixed(1)}">${t.sub}</text>`;
    });
    const W = Math.max(480, tx + 230), H = oy + planH + 20;
    $('s-iso').innerHTML = `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" role="img" aria-label="${b.id} 층 구성 분해도">${s}</svg>`;
    $('s-iso-h').textContent = `${b.id} · ${KIND[b.kind]}${b.formName ? ' · ' + b.formName : ''}${b.kind === 'basement' ? ` · 지하 ${b.basementLv}개 층` : ` · 지상 ${b.storeys}층 ${fmt(b.height, 1)}m`}`;
  }
  function selectB(bi, scroll) {
    ui.sel = bi; renderBar(); renderIso();
    const id = gen.bldgs[bi].id; ui.open.add(id); renderList();
    if (scroll) { const r = $('row-' + CSS.escape(id)); if (r) r.scrollIntoView({ block: 'nearest' }); }
  }
  $('s-bar').addEventListener('click', e => { const g = e.target.closest('.bc'); if (g) selectB(+g.dataset.bi, false); });
  $('s-bar').addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const g = e.target.closest('.bc'); if (g) { e.preventDefault(); selectB(+g.dataset.bi, false); } });
  $('s-bar').addEventListener('pointermove', e => {
    const g = e.target.closest('.bc'); if (!g) { tip(null); return; }
    const b = gen.bldgs[+g.dataset.bi];
    tip(`<b>${b.id}</b><span>${KIND[b.kind]}${b.formName ? ' · ' + b.formName : ''}</span><span>${b.kind === 'basement' ? `지하 ${b.basementLv}개 층 · 주차 ${fmt(b.spaces || 0)}대` : `지상 ${b.storeys}층 · ${fmt(b.height, 1)}m · ${fmt(b.gfa)}㎡`}</span>`, e.clientX, e.clientY);
  });
  $('s-bar').addEventListener('pointerleave', () => tip(null));

  // 이벤트
  $('s-filter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; ui.filter = b.dataset.f; $('s-filter').querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderList(); });
  $('s-q').addEventListener('input', e => { ui.q = e.target.value.trim(); renderList(); });
  const toggle = (id) => { const bi = gen.bldgs.findIndex(b => b.id === id); if (ui.open.has(id)) ui.open.delete(id); else ui.open.add(id); if (bi >= 0 && bi !== ui.sel) { ui.sel = bi; renderBar(); renderIso(); } renderList(); const r = $('row-' + CSS.escape(id)); if (r) r.focus(); };
  $('s-list').addEventListener('click', e => { const tr = e.target.closest('tr.b'); if (tr) toggle(tr.dataset.b); });
  $('s-list').addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const tr = e.target.closest('tr.b'); if (tr) { e.preventDefault(); toggle(tr.dataset.b); } });

  renderList(); renderBar(); renderIso();
  if (arg) { const r = root.querySelector('#row-' + CSS.escape(arg)); if (r) setTimeout(() => r.scrollIntoView({ block: 'center' }), 50); }
  return () => tip(null);
}
