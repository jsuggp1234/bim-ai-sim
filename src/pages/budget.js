// 5단계: 5D 예산 — 층별 물량 × 공종 단가, 4D 공정에 얹은 월별 기성과 누계 S커브
import { P5_DEFAULTS, P5_META } from '../sim/cost.js';
import { dateAt, ym } from '../sim/process.js';
import { SITES, GLOBAL_DEFAULTS, evaluate } from '../stage1/engine.js';
import { store } from '../store.js';
import { pipeline, fmt, won, tip, download, csv } from '../pipeline.js';
import { FLOOR_USES } from '../sim/uses.js';
import { programFor } from '../sim/siting.js';
import { siteById } from '../sim/kr-sites.js';
import { head, escH } from '../ui/sys.js';
import { costBenchHTML } from '../ui/benchcard.js';

export const title = '06 5D 예산';

const M = 30.44, PY = 3.3058;
const GROUPS = [
  { key: 'g1', name: '지반·토공·기초', cats: ['geo', 'earth', 'found'] },
  { key: 'g2', name: '골조', cats: ['base', 'struct'] },
  { key: 'g3', name: '외장', cats: ['skin'] },
  { key: 'g4', name: '설비·승강기·공정 설비', cats: ['mep', 'lift', 'equip'] },
  { key: 'g5', name: '마감', cats: ['fin'] },
  { key: 'g6', name: '조경·외부', cats: ['land'] },
  { key: 'g-ind', name: '간접비·품질 기술', cats: ['indirect', 'qa'] },
  { key: 'g-esc', name: '물가상승', cats: ['esc'] },
];
const DIRECT = GROUPS.slice(0, 6);
const USES = [['res', '아파트', '--res'], ['officetel', '오피스텔', '--officetel'], ['office', '업무', '--office'], ['retail', '상업·로비', '--retail'], ['refuge', '피난안전층', '--refuge'], ['mech', '옥탑·기계', '--mech'],
  ...Object.entries(FLOOR_USES).filter(([k]) => k !== 'admin').map(([k, x]) => [k, x.name, x.tok]), ['parking', '지하층', '--sunk'], ['site', '토공·조경 (대지)', '--g-ind']];
const groupOf = (cat) => GROUPS.find(g => g.cats.includes(cat));
const nice = (v) => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= v) || 10 * p; };

export function mount(root) {
  let R = pipeline();
  const $ = (id) => root.querySelector('#' + id);
  let alive = true;
  if (!store.get().cost) store.set({ cost: { ...P5_DEFAULTS } });

  root.innerHTML = head({
    n: 6, key: 'COST', title: '얼마가 들까', status: 'BIM QUANTITY × 4D TIME',
    dim: `${escH(R.site.name)} · ${R.u.name} · 공종 내역 ${fmt(R.E.items.length)}건`,
    desc: 'BIM 물량(층별 바닥면적·외벽·굴토·흙막이·지하층·설비)에 공종 단가와 04단계 공법 계수를 곱해 직접공사비를 만들고, 05단계 공정의 작업 기간에 나눠 얹어 월별 기성과 누계 S커브를 그립니다. 단가는 2026년 기준이며 작업 시점까지 물가상승을 반영합니다.',
    stats: [['총공사비', `<b>${won(R.E.total)}</b>`, 'TOTAL'], ['㎡당', `<b>${fmt(R.E.perM2, 0)}</b>`, '만원 / ㎡'], ['월 최대 기성', `<b>${won(R.E.peak.total)}</b>`, 'PEAK MONTH']],
    actions: `<a class="btn ghost" href="#/process">← 05 4D·간섭</a><a class="btn acc" href="#/risk">07 위험 예측 <span class="ar">→</span></a>`,
  }) + `
  <div class="wrap p5">
    <div class="p5-main">
      <div class="cost-head" id="b-head"></div>
      <section><div class="sec-title"><span class="n">06.1</span><h2>월별 기성</h2><span class="hint">막대 하나가 한 달의 공사비입니다. 막대에 마우스를 올리면 그 달의 공종별 금액이 나옵니다.</span></div>
        <div class="panel pad"><div class="g-leg" id="b-leg1" style="margin:0 0 10px"></div><div class="chart" id="b-bars"></div>
        <div class="chart" id="b-curve" style="margin-top:18px"></div><div class="g-leg" id="b-leg2"></div></div></section>
      <section><div class="sec-title"><span class="n">06.2</span><h2>직접비에서 총공사비까지</h2><span class="hint">공종별 직접비를 쌓은 뒤 가설·관리·설계·예비비와 물가상승을 더합니다.</span></div>
        <div class="panel pad"><div class="wf" id="b-wf"></div></div></section>
      <section><div class="sec-title"><span class="n">06.3</span><h2>블록 × 공종 매트릭스</h2><span class="hint">점 면적이 직접공사비에 비례합니다. 주황 점은 가장 큰 항목입니다.</span></div>
        <div class="panel pad dm" id="b-dm"></div></section>
      <section><div class="sec-title"><span class="n">06.4</span><h2>개략 추정과 비교</h2><span class="hint" id="b-cmp-h"></span></div>
        <div class="cols2"><div class="panel pad"><div class="cmp" id="b-cmp"></div><p class="note" id="b-cmp-note" style="margin:12px 0 0"></p></div>
        <div class="panel pad"><span class="label-sm">용도별 직접비</span><div class="mixbar" id="b-use-bar" style="margin:10px 0" role="img" aria-label="용도별 직접비 구성"></div><div class="mixleg" id="b-use"></div></div></div></section>
      <section><div class="sec-title"><span class="n">06.5</span><h2>실제 낙찰 금액과 비교</h2><span class="hint">산군 입찰DB의 LH 아파트 건설공사 낙찰 금액과 같은 범위(도급분)로 맞춰 견줍니다.</span></div>
        <div class="panel pad" id="b-bench"></div></section>
      <section><div class="sec-title"><span class="n">06.6</span><h2>예산 가정</h2></div><ul class="issues" id="b-assume"></ul></section>
    </div>
    <aside class="panel" id="b-ctl" aria-label="단가와 비율">
      <div class="grp"><div class="sec-h" style="margin:0"><span class="label-sm">Unit rates · 공종 단가</span><button class="chipbtn" id="b-reset" type="button">기본값</button></div></div>
      <div class="grp" id="b-unit"></div>
      <div class="grp"><span class="label-sm">Rates · 비율</span><div id="b-rate"></div></div>
      <div class="grp"><span class="label-sm">Export</span><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"><button class="btn" type="button" id="b-csv-m">월별 기성 CSV</button><button class="btn ghost" type="button" id="b-csv-i">내역 CSV</button><button class="btn ghost" type="button" id="b-json">JSON</button></div></div>
    </aside>
  </div>`;

  // ---------- 1단계 기준 ----------
  // 주거 외 용도·서울 8곳 밖 택지: 02 입지 단계의 개략 추정(연면적 × 용도 단가)과 비교
  const generic = () => R.gen.x || !SITES.find(x => x.id === R.gen.plan.site.id);
  function stage1() {
    const h = store.get().handoff1;
    const sid = R.gen.plan.site.id;
    if (generic()) {
      const kr = siteById(sid), u = R.u;
      const pg = kr ? programFor(kr, u.id) : { cost: R.E.total, gfa: R.E.gfa };
      return { label: '02 입지 개략 추정', cost: pg.cost, gfa: pg.gfa, months: Math.round((u.months[0] + u.months[1]) / 2), unit: u.cost * PY };
    }
    if (h && h.stage1 && h.siteId === sid) {
      const n = h.stage1.next_stage_inputs;
      return { label: `1단계 ${h.presetLabel}`, cost: n.budget.construction_cost_eok * 1e4, gfa: n.quantity.gfa_total_m2, months: n.schedule.construction_months, unit: n.budget.unit_cost_manwon_per_py };
    }
    const s = SITES.find(x => x.id === sid) || SITES.find(x => x.id === 'yongsan'), pr = s.presets[0];
    const e = evaluate(s, { ...s.p, ...pr.p }, GLOBAL_DEFAULTS);
    return { label: `1단계 기본값 (${pr.label})`, cost: e.f.cost.construction, gfa: e.f.gfaTotal, months: e.f.constMonths, unit: GLOBAL_DEFAULTS.constUnit };
  }

  function view() {
    const { E, S, gen } = R;
    const D = (m) => ym(dateAt(S.t0, m * M));
    // 그룹별 월 금액
    const monthly = E.flow.map(f => { const o = {}; Object.entries(f.by).forEach(([c, v]) => { const g = groupOf(c); if (g) o[g.key] = (o[g.key] || 0) + v; }); return { m: f.m, by: o, total: f.total, cum: f.cum }; });
    const gsum = {}; Object.entries(E.byCat).forEach(([c, v]) => { const g = groupOf(c); if (g) gsum[g.key] = (gsum[g.key] || 0) + v; });

    // ---------- 머리 ----------
    const direct = E.direct, ind = E.temp + E.over + E.design + E.cont;
    $('b-head').innerHTML = `<div class="hd1"><span class="k">총공사비 · 물가상승 포함</span><span class="v">${won(E.total)}</span><span class="s">${ym(S.t0)} → ${ym(dateAt(S.t0, S.end))} · ${S.months}개월 · 연면적 ${fmt(E.gfa / 1e4, 1)}만㎡</span></div>
      <div><span class="k">평당 · ㎡당</span><span class="v">${fmt(E.perPy, 0)}<small style="font-size:12px">만원</small></span><span class="s">㎡당 ${fmt(E.perM2, 0)}만원</span></div>
      <div><span class="k">직접비 · 간접비</span><span class="v">${fmt(direct / E.total * 100, 0)}<small style="font-size:12px">%</small></span><span class="s">직접 ${won(direct)} · 간접 ${won(ind)}</span></div>
      <div><span class="k">물가상승 · 최대 월 기성</span><span class="v">${won(E.esc)}</span><span class="s">최대 ${won(E.peak.total)} (${D(E.peak.m)})</span></div>`;

    // ---------- 월별 막대 ----------
    const W = 900, L = 52, Rr = 10, T = 24, H1 = 240, n = monthly.length;
    const max = nice(Math.max(...monthly.map(x => x.total)) / 1e4);
    const bw = (W - L - Rr) / n;
    const X = (i) => L + i * bw;
    const Y = (v) => T + H1 - v / 1e4 / max * H1;
    let s = '';
    for (let k = 0; k <= 4; k++) { const v = max * k / 4, y = T + H1 - H1 * k / 4; s += `<line class="${k ? 'gl' : 'ax'}" x1="${L}" x2="${W - Rr}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 3}" text-anchor="end">${fmt(v)}</text>`; }
    s += `<text x="${L - 46}" y="${T - 12}" class="lbl">억원/월</text>`;
    const yrTicks = [];
    monthly.forEach((mo, i) => {
      let acc = 0;
      GROUPS.forEach(g => { const v = mo.by[g.key] || 0; if (v <= 0) return; const y1 = Y(acc), y0 = Y(acc + v); s += `<rect x="${(X(i) + 1).toFixed(1)}" y="${y0.toFixed(2)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(0, y1 - y0 - 0.6).toFixed(2)}" style="fill:var(--${g.key})"/>`; acc += v; });
      const dt = dateAt(S.t0, mo.m * M); if (dt.getUTCMonth() === 0) yrTicks.push([i, dt.getUTCFullYear()]);
    });
    yrTicks.forEach(([i, y]) => { s += `<line class="ax" x1="${X(i)}" x2="${X(i)}" y1="${T + H1}" y2="${T + H1 + 5}"/><text x="${X(i) + 2}" y="${T + H1 + 16}">${y}</text>`; });
    s += `<text class="dl" x="${(X(E.peak.m) + bw / 2).toFixed(1)}" y="${(Y(E.peak.total) - 6).toFixed(1)}" text-anchor="middle">최대 ${won(E.peak.total)}</text>`;
    s += `<g id="b-cross"></g>`;
    monthly.forEach((mo, i) => { s += `<rect class="hit" data-i="${i}" x="${X(i)}" y="${T}" width="${bw}" height="${H1}"/>`; });
    $('b-bars').innerHTML = `<svg viewBox="0 0 ${W} ${T + H1 + 22}" role="img" aria-label="월별 기성 막대 차트, 공종별로 쌓음">${s}</svg>`;
    $('b-leg1').innerHTML = GROUPS.map(g => `<span><i style="background:var(--${g.key})"></i>${g.name}</span>`).join('');

    // ---------- 누계 S커브 ----------
    const s1 = stage1();
    const H2 = 170, Y2 = (p) => T + H2 - p / 100 * H2;
    let c = '';
    [0, 25, 50, 75, 100].forEach(p => { c += `<line class="${p ? 'gl' : 'ax'}" x1="${L}" x2="${W - Rr}" y1="${Y2(p)}" y2="${Y2(p)}"/><text x="${L - 6}" y="${Y2(p) + 3}" text-anchor="end">${p}%</text>`; });
    const pts = monthly.map((mo, i) => [X(i) + bw, Y2(mo.cum / E.total * 100)]);
    c += `<path class="area" d="M${L} ${Y2(0)} ${pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} L${pts[pts.length - 1][0].toFixed(1)} ${Y2(0)} Z"/>`;
    c += `<path class="curve" d="M${L} ${Y2(0)} ${pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')}"/>`;
    // 1단계 개략: 같은 착공일, 1단계 공사기간에 표준 S커브(3x²−2x³)
    const s1pts = []; for (let i = 0; i <= s1.months; i++) { const x = i / s1.months; s1pts.push([L + i * bw, Y2((3 * x * x - 2 * x * x * x) * 100)]); }
    c += `<path class="curve2" d="${s1pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')}"/>`;
    const half = monthly.findIndex(mo => mo.cum >= E.total / 2);
    if (half >= 0) c += `<circle class="dot" cx="${(X(half) + bw).toFixed(1)}" cy="${Y2(50)}" r="4.5"/><text class="dl" x="${(X(half) + bw + 8).toFixed(1)}" y="${Y2(50) + 14}">50% · ${D(half + 1)}</text>`;
    yrTicks.forEach(([i, y]) => { c += `<line class="ax" x1="${X(i)}" x2="${X(i)}" y1="${T + H2}" y2="${T + H2 + 5}"/><text x="${X(i) + 2}" y="${T + H2 + 16}">${y}</text>`; });
    c += `<text x="${L - 46}" y="${T - 12}" class="lbl">누계 기성률</text><g id="b-cross2"></g>`;
    monthly.forEach((mo, i) => { c += `<rect class="hit" data-i="${i}" x="${X(i)}" y="${T}" width="${bw}" height="${H2}"/>`; });
    $('b-curve').innerHTML = `<svg viewBox="0 0 ${W} ${T + H2 + 22}" role="img" aria-label="누계 기성률 S커브">${c}</svg>`;
    $('b-leg2').innerHTML = `<span><i style="background:var(--ink);height:2px"></i>5단계 상세 (월별 기성 누계 ÷ 총공사비)</span><span><i style="background:repeating-linear-gradient(90deg,var(--accent) 0 5px,transparent 5px 9px);height:2px"></i>${s1.label} · ${s1.months}개월 표준 S커브</span>`;
    const cross = (i) => {
      const x = X(i) + bw / 2;
      root.querySelector('#b-cross').innerHTML = i == null ? '' : `<line class="cross" x1="${x}" x2="${x}" y1="${T}" y2="${T + H1}"/>`;
      root.querySelector('#b-cross2').innerHTML = i == null ? '' : `<line class="cross" x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${T}" y2="${T + H2}"/><circle class="dot" cx="${x + bw / 2}" cy="${Y2(monthly[i].cum / E.total * 100)}" r="4"/>`;
    };
    const onHover = (e) => {
      const r = e.target.closest('.hit'); if (!r) { cross(null); tip(null); return; }
      const i = +r.dataset.i, mo = monthly[i];
      const top = GROUPS.map(g => [g.name, mo.by[g.key] || 0]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
      cross(i);
      tip(`<b>${D(mo.m)} · ${won(mo.total, 0)}</b>${top.map(([nm, v]) => `<span>${nm} ${won(v, 0)}</span>`).join('')}<span>누계 ${won(mo.cum)} · ${fmt(mo.cum / E.total * 100, 1)}%</span>`, e.clientX, e.clientY);
    };
    ['b-bars', 'b-curve'].forEach(id => { $(id).onpointermove = onHover; $(id).onpointerleave = () => { cross(null); tip(null); }; });

    // ---------- 폭포 ----------
    const steps = [...DIRECT.map(g => [g.name, gsum[g.key] || 0, `var(--${g.key})`]), ['가설·공통비', E.temp, 'var(--g-ind)'], ['일반관리비·이윤', E.over, 'var(--g-ind)'], ['설계·감리', E.design, 'var(--g-ind)'], ['예비비', E.cont, 'var(--g-ind)'], ['물가상승', E.esc, 'var(--g-esc)']];
    let acc = 0;
    $('b-wf').innerHTML = steps.map(([nm, v, col]) => { const l = acc / E.total * 100, w = v / E.total * 100; acc += v; return `<div class="r"><span class="nm"><i style="background:${col}"></i>${nm}</span><span class="tr"><i style="left:${l.toFixed(2)}%;width:${Math.max(0.3, w).toFixed(2)}%;background:${col}"></i></span><span class="v">${won(v)}</span></div>`; }).join('')
      + `<div class="r tot"><span class="nm">총공사비</span><span class="tr"><i style="left:0;width:100%;background:var(--ink)"></i></span><span class="v">${won(E.total)}</span></div>`;

    // ---------- 블록 × 공종 매트릭스 ----------
    const blocks = gen.blocks.map(b => b.id);
    const cell = {}; let cmax = 0;
    E.items.forEach(it => { const g = groupOf(it.cat); if (!g) return; const k = it.block + '|' + g.key; cell[k] = (cell[k] || 0) + it.amount; });
    Object.values(cell).forEach(v => { cmax = Math.max(cmax, v); });
    const cw = 78, rh = 26, LL = 64, TT = 30, rT = DIRECT.length;
    const DW = LL + cw * (rT + 1) + 10, DH = TT + rh * blocks.length + 8;
    let d = '';
    DIRECT.forEach((g, j) => { d += `<text class="hd" x="${LL + cw * j + cw / 2}" y="16" text-anchor="middle">${g.name}</text>`; });
    d += `<text class="hd" x="${LL + cw * rT + cw / 2}" y="16" text-anchor="middle">블록 합계</text>`;
    blocks.forEach((id, i) => {
      const y = TT + i * rh + rh / 2; let rs = 0;
      d += `<line class="gl" x1="0" x2="${DW}" y1="${y + rh / 2}" y2="${y + rh / 2}"/><text x="4" y="${y + 4}">${id}</text>`;
      DIRECT.forEach((g, j) => { const v = cell[id + '|' + g.key] || 0; rs += v; if (!v) return; const r = Math.max(1.2, Math.sqrt(v / cmax) * 11); d += `<circle class="${v === cmax ? 'max' : ''}" cx="${LL + cw * j + cw / 2}" cy="${y}" r="${r.toFixed(2)}"><title>${id} · ${g.name} ${won(v)}</title></circle>`; });
      d += `<text class="sum" x="${LL + cw * rT + cw / 2}" y="${y + 4}" text-anchor="middle">${won(rs, 0)}</text>`;
    });
    $('b-dm').innerHTML = `<svg viewBox="0 0 ${DW} ${DH}" style="max-width:${DW * 1.15}px" role="img" aria-label="블록별 공종별 직접공사비 점 매트릭스">${d}</svg>`;

    // ---------- 개략 추정 비교 ----------
    if (generic()) {
      const rows2 = [
        ['평당 공사비', s1.cost / s1.gfa * PY, E.total / E.gfa * PY, '만원 · 연면적(지하 포함)', (v) => fmt(v, 0)],
        ['총 공사비', s1.cost, E.total, '물가상승 포함', (v) => won(v)],
        ['공사기간', s1.months, S.months, '개월', (v) => fmt(v, 0)],
      ];
      $('b-cmp-h').textContent = `${s1.label} → 06 상세 (BIM 물량 × 공법)`;
      $('b-cmp').innerHTML = rows2.map(([nm, a, b, unit, f]) => { const mx = Math.max(a, b); return `<div><span class="label-sm">${nm} · ${unit}</span>
        <div class="r"><span>개략</span><span class="tr"><i style="width:${(a / mx * 100).toFixed(1)}%;background:var(--g-ind)"></i></span><span class="v">${f(a)}</span></div>
        <div class="r"><span>상세</span><span class="tr"><i style="width:${(b / mx * 100).toFixed(1)}%;background:var(--ink)"></i></span><span class="v">${f(b)} <span class="${b > a ? 'neg' : 'pos'}" style="font-size:11px">${b >= a ? '+' : '−'}${fmt(Math.abs(b / a - 1) * 100, 0)}%</span></span></div></div>`; }).join('');
      $('b-cmp-note').textContent = `개략 추정은 시뮬레이션 구역 × 가용 비율 × 용적률 × ${R.u.name} 기준 단가(${fmt(R.u.cost)}만원/㎡)의 한 줄 계산입니다. 상세는 층별 물량·공종 단가·공법 계수·공정 시점 물가상승을 쌓아 올렸습니다.`;
    } else {
    const resIdx = new Set(gen.bldgs.map((b, bi) => (b.kind === 'apt' || b.kind === 'officetel') ? bi : -1).filter(x => x >= 0));
    const suppBlocks = new Set(gen.blocks.filter(b => b.zone === 'supp').map(b => b.id));
    let resDirect = 0, resGfa = 0;
    E.items.forEach(it => { if ((it.bi != null && resIdx.has(it.bi)) || (it.bi == null && suppBlocks.has(it.block))) resDirect += it.amount; });
    gen.bldgs.forEach((b, bi) => { if (resIdx.has(bi) || (b.kind === 'basement' && suppBlocks.has(b.block))) resGfa += b.gfa; });
    const mk26 = (E.total - E.esc) / E.direct;
    const res26 = resDirect * mk26, resPy26 = res26 / resGfa * PY;
    const s1py = s1.cost / s1.gfa * PY;
    const suppEnd = Math.max(...S.blocks.filter(b => b.zone === 'supp').map(b => b.end)), suppStart = Math.min(...S.blocks.filter(b => b.zone === 'supp').map(b => b.start));
    const rows = [
      ['평당 공사비', s1py, resPy26, '만원 · 주거동, 2026년 단가', (v) => fmt(v, 0)],
      ['주거 공사비', s1.cost, res26 * (E.total / (E.total - E.esc)), '물가상승 포함 (5단계)', (v) => won(v)],
      ['주거 공사기간', s1.months, (suppEnd - suppStart) / M, '개월 · 업무지원존 블록', (v) => fmt(v, 0)],
    ];
    $('b-cmp-h').textContent = `${s1.label} → 5단계 상세 (주거 부분만 비교)`;
    $('b-cmp').innerHTML = rows.map(([nm, a, b, unit, f]) => {
      const mx = Math.max(a, b);
      return `<div><span class="label-sm">${nm} · ${unit}</span>
        <div class="r"><span>1단계 개략</span><span class="tr"><i style="width:${(a / mx * 100).toFixed(1)}%;background:var(--g-ind)"></i></span><span class="v">${f(a)}</span></div>
        <div class="r"><span>5단계 상세</span><span class="tr"><i style="width:${(b / mx * 100).toFixed(1)}%;background:var(--ink)"></i></span><span class="v">${f(b)} <span class="${b > a ? 'neg' : 'pos'}" style="font-size:11px">${b >= a ? '+' : '−'}${fmt(Math.abs(b / a - 1) * 100, 0)}%</span></span></div></div>`;
    }).join('');
    $('b-cmp-note').textContent = `1단계는 연면적 × 평당 단가(${fmt(s1.unit)}만원) × 30층 초과 할증의 한 줄 추정입니다. 5단계는 층별 물량과 공종 단가로 쌓아 올리고 공정 시점까지 물가상승을 더했습니다. 전체 사업(업무·랜드마크 포함)은 ${won(E.total)}입니다.`;
    }
    $('b-bench').innerHTML = costBenchHTML(R);
    const uses = USES.map(([k, nm, col]) => [nm, E.byUse[k] + (k === 'retail' ? (E.byUse.lobby || 0) : 0) || 0, col]).filter(x => x[1] > 0);
    const ut = uses.reduce((a, x) => a + x[1], 0);
    $('b-use-bar').innerHTML = uses.map(([nm, v, col]) => `<i style="width:${(v / ut * 100).toFixed(2)}%;background:var(${col})" title="${nm} ${won(v)}"></i>`).join('');
    $('b-use').innerHTML = uses.map(([nm, v, col]) => `<div><span><i style="background:var(${col});box-shadow:inset 0 0 0 1px var(--line)"></i>${nm}</span><span class="num">${won(v)}</span></div>`).join('');
  }

  // ---------- 변수 ----------
  const params = () => ({ ...P5_DEFAULTS, ...(store.get().cost || {}) });
  function ctl(k) {
    const m = P5_META[k], v = params()[k], ch = Math.abs(v - P5_DEFAULTS[k]) > 1e-9 ? ' changed' : '';
    return `<div class="ctl${ch}"><label for="bc-${k}">${m.label}</label><span class="inbox"><input type="number" id="bn-${k}" data-k="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}" aria-label="${m.label} 값"><span class="unit">${m.unit}</span></span>
      <input type="range" id="bc-${k}" data-k="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}">${m.note ? `<span class="hint">${m.note}</span>` : ''}</div>`;
  }
  function renderCtl() {
    $('b-unit').innerHTML = Object.keys(P5_META).filter(k => P5_META[k].g === 'unit').map(ctl).join('');
    $('b-rate').innerHTML = Object.keys(P5_META).filter(k => P5_META[k].g === 'rate').map(ctl).join('');
  }
  let rq = 0;
  $('b-ctl').addEventListener('input', e => {
    const el = e.target, k = el.dataset.k; if (!k) return;
    let v = parseFloat(el.value); if (!isFinite(v)) return;
    const m = P5_META[k]; v = Math.min(m.max, Math.max(m.min, v));
    const twin = el.type === 'range' ? $('bn-' + k) : $('bc-' + k); if (twin) twin.value = v;
    el.closest('.ctl').classList.toggle('changed', Math.abs(v - P5_DEFAULTS[k]) > 1e-9);
    store.set({ cost: { ...params(), [k]: v } });
    if (!rq) rq = requestAnimationFrame(() => { rq = 0; if (alive) { R = pipeline(); view(); } });
  });
  $('b-ctl').addEventListener('click', e => {
    if (e.target.id === 'b-reset') { store.set({ cost: { ...P5_DEFAULTS } }); renderCtl(); R = pipeline(); view(); }
    if (e.target.id === 'b-csv-m') {
      const { E, S } = R;
      const rows = [['월', '연월', ...GROUPS.map(g => g.name + '_만원'), '합계_만원', '누계_만원', '누계_%']];
      E.flow.forEach(f => { const o = {}; Object.entries(f.by).forEach(([c, v]) => { const g = groupOf(c); if (g) o[g.key] = (o[g.key] || 0) + v; }); rows.push([f.m + 1, ym(dateAt(S.t0, f.m * M)), ...GROUPS.map(g => Math.round(o[g.key] || 0)), Math.round(f.total), Math.round(f.cum), (f.cum / E.total * 100).toFixed(2)]); });
      download(`${R.gen.plan.site.id}-5d-cashflow.csv`, csv(rows), 'text/csv;charset=utf-8');
    }
    if (e.target.id === 'b-csv-i') {
      const { E, gen } = R;
      const agg = new Map();
      E.items.forEach(it => { const b = it.bi != null ? gen.bldgs[it.bi].id : it.block + ' (블록)'; const k = `${it.block}|${b}|${it.cat}`; agg.set(k, (agg.get(k) || 0) + it.amount); });
      const rows = [['블록', '동', '공종', '공종 그룹', '직접공사비_만원']];
      [...agg.entries()].forEach(([k, v]) => { const [bl, b, c] = k.split('|'); rows.push([bl, b, c, groupOf(c).name, Math.round(v)]); });
      download(`${R.gen.plan.site.id}-5d-items.csv`, csv(rows), 'text/csv;charset=utf-8');
    }
    if (e.target.id === 'b-json') {
      const { E, S, mp, pp, cp } = R; const r = (v) => Math.round(v);
      const o = { schema: 'bim-sim/stage5-cost@1', generated_at: new Date().toISOString(), unit: '만원', stage2_params: mp, stage4_params: pp, stage5_params: cp,
        totals: { total: r(E.total), direct: r(E.direct), escalation: r(E.esc), temporary: r(E.temp), overhead_profit: r(E.over), design: r(E.design), contingency: r(E.cont), per_m2: r(E.perM2), per_py: r(E.perPy), gfa_m2: r(E.gfa) },
        schedule: { start: ym(S.t0), end: ym(dateAt(S.t0, S.end)), months: S.months },
        by_category: Object.fromEntries(Object.entries(E.byCat).map(([k, v]) => [k, r(v)])), by_block: Object.fromEntries(Object.entries(E.byBlock).map(([k, v]) => [k, r(v)])),
        monthly: E.flow.map(f => ({ month: f.m + 1, ym: ym(dateAt(S.t0, f.m * M)), total: r(f.total), cumulative: r(f.cum) })) };
      download(`${R.gen.plan.site.id}-5d-cost.json`, JSON.stringify(o, null, 2), 'application/json');
    }
  });

  $('b-assume').innerHTML = [
    '단가는 2026년 공사비 보도와 공종별 비중을 바탕으로 잡은 근사값이고(예: 골조 주거 48만원/㎡, 업무 커튼월 120만원/㎡ 외벽), 주거 단가는 LH 아파트 낙찰 금액(산군 입찰DB)에 맞춰 낮췄습니다: 흙막이 110 → 60만원/㎡(CIP 기준), 기초 95 → 55, 지하 골조 72 → 62, 주거 외장 55 → 34, 주거 설비 64 → 52, 터파기 4.5 → 3.5만원/㎥. 실제 내역서 단가로 바꿔 쓸 수 있도록 오른쪽에 변수로 두었습니다.',
    '물량: 골조·마감·설비는 층별 바닥면적, 외장은 층 둘레 × 층고(외벽 면적), 흙막이는 지하 외곽 둘레 × (굴토 깊이 + 3m), 굴토는 지하 바닥면적 ÷ 0.9 × 깊이, 승강기는 동 형식별 대수 × (기본가 + 층당 추가)입니다.',
    '할증: 30층을 넘는 층마다 골조 단가를 층당 할증률만큼 올립니다(랜드마크는 외장에도 적용). 옥상층 골조 1.3배, 피난안전층 1.25배, 기계층 설비 1.8배입니다.',
    '간접비: 가설·공통비는 직접비 비율, 일반관리비·이윤은 (직접비 + 물가상승 + 가설) 비율, 설계·감리는 그 합의 비율이며 30%는 착공 전 첫 달에 지출합니다. 예비비는 마지막에 더합니다.',
    '월별 배분: 각 항목을 4단계 공정의 해당 작업 기간(골조는 그 층의 사이클 기간)에 고르게 나눕니다. 물가상승은 작업 기간 중간 시점까지 연 물가상승률을 복리로 적용합니다.',
    '1단계 비교는 업무지원존(주거) 블록의 아파트·오피스텔 동과 그 블록 지하층만 모은 값입니다. 1단계는 사업 전체를 연면적 × 평당 단가로 한 번에 추정합니다.',
  ].map(x => `<li>${x}</li>`).join('');

  renderCtl();
  view();
  const ro = new ResizeObserver(() => {}); // 차트는 viewBox로 크기를 맞춘다
  return () => { alive = false; if (rq) cancelAnimationFrame(rq); ro.disconnect(); tip(null); };
}
