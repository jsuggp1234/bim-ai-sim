// 처음 화면: 큐레이션 장면(가운데 실시간 3D + 양옆 장면 사진) → 결과 인덱스(필터·개수·격자/목록) → 단계 줄 → 데이터 흐름
import { createViewer } from '../sim/viewer.js';
import { pipeline, fmt, won, onThemeChange } from '../pipeline.js';
import { dateAt, ym } from '../sim/process.js';
import { TYPOLOGIES } from '../sim/massing.js';
import { SITE_IDS } from '../sim/sites.js';
import { osmFor, osmReady } from '../sim/ctxload.js';
import { store } from '../store.js';

export const title = '처음';

const STAGES = { '01': '택지 선정', '02': '매스 배치', '03': '층별 일람표', '04': '4D 공정', '05': '5D 예산' };
const TYPES = { img: '장면', num: '수치', fig: '도해' };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- 작은 등각 도해 ----------
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
const P = (x, y, z, ox, oy, k) => [ox + (x - y) * C30 * k, oy + (x + y) * S30 * k - z * k];
const pts = (a) => a.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
function isoBox(x, y, w, d, h, o, cls = 'fig-fill') {
  const { ox, oy, k } = o;
  const q = (a, b, c) => P(a, b, c, ox, oy, k);
  const top = [q(x, y, h), q(x + w, y, h), q(x + w, y + d, h), q(x, y + d, h)];
  const left = [q(x, y + d, 0), q(x + w, y + d, 0), q(x + w, y + d, h), q(x, y + d, h)];
  const right = [q(x + w, y, 0), q(x + w, y + d, 0), q(x + w, y + d, h), q(x + w, y, h)];
  return `<polygon class="${cls}" points="${pts(right)}" style="fill:color-mix(in srgb, var(--card) 80%, var(--ink))"/><polygon class="${cls}" points="${pts(left)}"/><polygon class="${cls}" points="${pts(top)}"/>`;
}
function figSite(n) {
  const dots = [[40, 52, 5], [62, 88, 4], [88, 40, 6], [110, 72, 5], [134, 50, 4], [148, 98, 6], [72, 116, 4], [168, 64, 4]].slice(0, Math.max(3, n));
  return `<svg viewBox="0 0 200 150" aria-hidden="true">
    <path d="M10 108 C 50 90, 80 128, 120 104 S 180 84, 196 96" style="fill:none;stroke:var(--s-water);stroke-width:6"/>
    ${dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" class="fig-fill"/>`).join('')}
    <circle cx="110" cy="72" r="5" class="fig-acc"/><circle cx="110" cy="72" r="15" class="fig-acc-l"/>
    <text class="fig-t" x="10" y="20">${n} sites · score</text></svg>`;
}
function figMass() {
  const o = { ox: 96, oy: 66, k: 1.05 };
  const bx = [[-40, -40, 14, 14, 30], [-20, -40, 14, 14, 44], [0, -40, 14, 14, 36], [-40, -14, 14, 14, 22], [-20, -14, 14, 14, 30], [22, -38, 18, 18, 52], [6, -12, 14, 14, 26], [28, -10, 14, 14, 70]];
  const order = bx.slice().sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  const ground = [P(-50, -50, 0, o.ox, o.oy, o.k), P(52, -50, 0, o.ox, o.oy, o.k), P(52, 12, 0, o.ox, o.oy, o.k), P(-50, 12, 0, o.ox, o.oy, o.k)];
  return `<svg viewBox="0 0 200 150" aria-hidden="true"><polygon points="${pts(ground)}" class="fig-mute"/>
    ${order.map(b => isoBox(...b, o)).join('')}<text class="fig-t" x="10" y="146">height plan</text></svg>`;
}
function figStack() {
  const o = { ox: 92, oy: 128, k: 1 };
  let s = '';
  [0, 16, 32, 48, 64, 80].forEach((z, i) => {
    const zz = 12 + z, ref = i === 3;
    const q = (x, y) => P(x, y, zz, o.ox, o.oy, o.k);
    s += `<polygon points="${pts([q(-30, -30), q(30, -30), q(30, 10), q(-30, 10)])}" class="fig-fill" ${ref ? 'style="fill:var(--accent)"' : ''}/>`;
    const a = q(-30, 10);
    s += `<text class="fig-t" x="${(a[0] - 6).toFixed(1)}" y="${(a[1] + 3).toFixed(1)}" text-anchor="end">L${String(i + 1).padStart(2, '0')}</text>`;
  });
  [[30, -30], [30, 10], [-30, 10]].forEach(([x, y]) => { const a = P(x, y, 92, o.ox, o.oy, o.k), b = P(x, y, 12, o.ox, o.oy, o.k); s += `<line class="fig-dash" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`; });
  return `<svg viewBox="0 0 200 150" aria-hidden="true">${s}<text class="fig-t" x="150" y="140">fl · h · ㎡</text></svg>`;
}
// 실제 공정 단계로 그린 막대 공정표
function figGantt(S) {
  const ph = S.phases.filter(p => p.n);
  const X = (d) => 14 + d / S.end * 176;
  let s = '';
  for (let y = 0; y * 365 <= S.end; y++) s += `<line x1="${X(y * 365).toFixed(1)}" y1="14" x2="${X(y * 365).toFixed(1)}" y2="134" style="stroke:var(--hair)"/>`;
  const rh = Math.min(11, 116 / ph.length);
  ph.forEach((p, i) => {
    const y = 18 + i * rh;
    s += `<rect x="${X(p.start).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(2, X(p.end) - X(p.start)).toFixed(1)}" height="${(rh * 0.62).toFixed(1)}" rx="1.5" style="fill:${p.key === 'struct' ? 'var(--accent)' : 'var(--ink)'};opacity:${p.key === 'struct' ? 1 : 0.78}"/>`;
  });
  return `<svg viewBox="0 0 200 150" aria-hidden="true">${s}<text class="fig-t" x="14" y="146">${ym(S.t0)} — ${ym(dateAt(S.t0, S.end))}</text></svg>`;
}
// 실제 월별 기성으로 그린 S커브
function figCurve(E) {
  const f = E.flow, n = f.length, max = Math.max(...f.map(x => x.total)), tot = f[n - 1].cum || 1;
  const X = (i) => 14 + i / Math.max(1, n - 1) * 176, bw = Math.max(1, 172 / n - 1);
  let s = '';
  f.forEach((x, i) => { const h = x.total / max * 42; s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${(130 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" style="fill:var(--sunk)"/>`; });
  const path = f.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${(130 - x.cum / tot * 104).toFixed(1)}`).join(' ');
  const pk = f.indexOf(E.peak);
  s += `<path d="${path}" style="fill:none;stroke:var(--ink);stroke-width:1.6"/><circle cx="${X(pk).toFixed(1)}" cy="${(130 - E.peak.cum / tot * 104).toFixed(1)}" r="3" style="fill:var(--accent)"/>`;
  return `<svg viewBox="0 0 200 150" aria-hidden="true"><line x1="12" y1="130" x2="192" y2="130" style="stroke:var(--ink)"/>${s}<text class="fig-t" x="14" y="20">s-curve · 기성 누계</text></svg>`;
}

// ---------- 데이터 흐름 매트릭스 ----------
// 0 없음 · 1 만듦 · 2 받아 씀 · 3 자동 계산(분석)
const FLOW = [
  ['후보지 점수·사업성', [1, 0, 0, 0, 2]],
  ['세대수·평형·임대 비율', [1, 2, 0, 0, 0]],
  ['블록·동 배치, 주동 형식', [0, 1, 2, 2, 2]],
  ['인동간격 법규 검토', [0, 3, 0, 0, 0]],
  ['일조·조망·주변 영향', [0, 3, 0, 0, 0]],
  ['층고·FL·바닥면적', [0, 1, 2, 2, 2]],
  ['외벽·굴토·흙막이 물량', [0, 0, 3, 2, 2]],
  ['층별 골조 사이클·공기', [0, 0, 0, 1, 2]],
  ['4D 층 상태·크레인', [0, 0, 0, 3, 0]],
  ['월별 기성·S커브', [0, 0, 0, 0, 3]],
  ['1단계 개략 공사비', [1, 0, 0, 0, 2]],
];
function matrixSVG() {
  const L = 190, cw = 92, rh = 26, top = 34, W = L + cw * 5 + 20, H = top + rh * FLOW.length + 10;
  const cx = (i) => L + cw * i + cw / 2;
  let s = '';
  ['01 택지', '02 매스', '03 일람표', '04 공정', '05 예산'].forEach((t, i) => { s += `<text class="hd" x="${cx(i)}" y="16" text-anchor="middle">${t}</text>`; s += `<line class="gl" x1="${cx(i)}" y1="24" x2="${cx(i)}" y2="${H - 6}"/>`; });
  FLOW.forEach(([name, v], r) => {
    const y = top + r * rh + rh / 2;
    s += `<line class="gl" x1="0" y1="${y + rh / 2}" x2="${W}" y2="${y + rh / 2}"/>`;
    s += `<text class="rowl" x="0" y="${y + 4}">${name}</text>`;
    const on = v.map((x, i) => [x, i]).filter(([x]) => x);
    if (on.length > 1) s += `<line class="ln" x1="${cx(on[0][1])}" y1="${y}" x2="${cx(on[on.length - 1][1])}" y2="${y}"/>`;
    on.forEach(([x, i]) => { s += `<circle class="${x === 1 ? 'pr' : x === 2 ? 'cs' : 'ai'}" cx="${cx(i)}" cy="${y}" r="${x === 2 ? 4.5 : 5.5}"><title>${name} · ${['', '만듦', '받아 씀', '자동 계산'][x]}</title></circle>`; });
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="max-width:${Math.round(W * 1.2)}px" role="img" aria-label="단계별 데이터 흐름: 어느 단계가 값을 만들고 어느 단계가 받아 쓰는지">${s}</svg>`;
}

export function mount(root) {
  const R = pipeline();
  const { gen, S, E, mp, Q } = R;
  const t = gen.totals, plan = gen.plan, site = plan.site;
  const h1 = store.get().handoff1;
  const lm = gen.bldgs.find(b => b.kind === 'landmark');
  const tallest = gen.bldgs.reduce((a, b) => (b.height > a.height ? b : a), gen.bldgs[0]);
  const top = lm || tallest;
  const law = gen.violations.filter(v => v.scope === 'law').length;
  const floorsAbove = gen.bldgs.reduce((s, b) => s + b.floors.filter(f => f.lv > 0).length, 0);
  const stage1Cost = h1 && h1.stage1 && h1.siteId === site.id ? h1.stage1.next_stage_inputs.budget.construction_cost_eok * 1e4 : null;
  const water = plan.views.water ? plan.views.water.name : null;
  let maxCranes = 0; for (let d = 0; d <= S.end; d += 20) maxCranes = Math.max(maxCranes, S.cranesAt(d).length);

  // 공정 단계의 정점 시각과 그때 가장 먼저 일하는 블록
  const PH = {};
  S.phases.forEach(ph => {
    if (!ph.n) return;
    const a = S.acts.filter(x => ph.cats.includes(x.cat) && x.start <= ph.peak && ph.peak < x.end)[0];
    PH[ph.key] = { t: ph.peak, block: a ? a.block : plan.BLOCKS[0].id, name: ph.name, date: ym(dateAt(S.t0, ph.peak)) };
  });
  const ph = (k, alt) => PH[k] || PH[alt] || { t: Math.round(S.end * 0.4), block: plan.BLOCKS[0].id, name: '', date: '' };
  const buildAt = (d) => ({ floor: S.stateAt(d), cranes: S.cranesAt(d), block: S.blockStateAt(d), focus: null });
  // 날짜 d에 그 상태(1 거푸집 · 3 설비 · 4 창호)인 층이 가장 많은 동을 가까이서 겨눈다
  function aim(d, want, fallback) {
    const st = S.stateAt(d); let best = null;
    S.blds.forEach((r, bi) => {
      const b = gen.bldgs[bi]; if (!b || b.kind === 'podium') return;
      const fl = r.floors.filter(fi => st(bi, fi) === want);
      if (!fl.length) return;
      const score = fl.length + Math.min(8, b.height / 20);
      if (!best || score > best.score) best = { score, bi, fl };
    });
    if (!best) return fallback;
    const b = gen.bldgs[best.bi], fs = best.fl.map(fi => b.floors[fi]);
    const y = want === 1 ? fs[fs.length - 1].y1 - 2 : (fs[0].y0 + fs[fs.length - 1].y1) / 2;
    const span = Math.max(...b.parts.map(p => Math.max(p.w, p.d)));
    return { u: b.core.u, v: b.core.v, y, d: want === 3 ? span * 0.95 + 28 : span * 1.45 + 55, dir: want === 1 ? [-0.5, 0.62, 0.62] : [-0.55, 0.3, 0.78] };
  }

  // 장면 사진 (실시간 3D에서 한 번씩 찍는다)
  const SHOTS = [
    { id: 'top', view: 'top', w: 720, h: 560, cap: '배치 · 위에서', st: '02' },
    { id: 'street', view: 'street', w: 640, h: 800, cap: '가로에서 본 단지', st: '02' },
    { id: 'earth', view: 'blk:' + ph('earth').block, at: ph('earth').t, w: 720, h: 600, cap: `흙막이·굴토 · ${ph('earth').date}`, st: '04' },
    { id: 'found', view: 'blk:' + ph('base', 'found').block, at: ph('base', 'found').t, w: 640, h: 760, cap: `지하 골조 · ${ph('base', 'found').date}`, st: '04' },
    { id: 'struct', view: aim(ph('struct').t, 1, 'blk:' + ph('struct').block), at: ph('struct').t, w: 720, h: 880, cap: `지상 골조 · ${ph('struct').date}`, st: '04' },
    { id: 'mep', view: aim(ph('mep').t, 3, 'blk:' + ph('mep').block), at: ph('mep').t, w: 720, h: 560, cap: `설비 배관·덕트 · ${ph('mep').date}`, st: '04' },
    { id: 'skin', view: aim(ph('skin').t, 4, 'bird'), at: ph('skin').t, w: 720, h: 600, cap: `창호·커튼월 · ${ph('skin').date}`, st: '04' },
    { id: 'far', view: 'river', w: 720, h: 900, cap: water ? `${water} 쪽에서` : '먼 곳에서', st: '02' },
  ];
  const shotById = Object.fromEntries(SHOTS.map(s => [s.id, s]));

  // 큐레이션 장면: 가운데는 실시간 3D, 양옆은 장면 사진
  const SCENES = [
    { h: `${esc(site.name)},<br><em>택지</em>에서 예산까지`, by: ['01 택지 선정', '#/site'], note: `${fmt(t.units)}호 · ${t.towers}개 동`, at: null, a: 'top', c: 'street' },
    { h: '흙막이를 세우고<br><em>파 내려갑니다</em>', by: ['04 4D 공정 · 굴토', '#/process'], note: ph('earth').date, at: ph('earth').t, a: 'earth', c: 'found' },
    { h: '층마다 거푸집,<br><em>골조</em>가 오릅니다', by: ['04 4D 공정 · 지상 골조', '#/process'], note: ph('struct').date, at: ph('struct').t, a: 'struct', c: 'mep' },
    { h: '창호가 닫히고<br><em>외피</em>가 완성됩니다', by: ['04 4D 공정 · 창호·외장', '#/process'], note: ph('skin').date, at: ph('skin').t, a: 'skin', c: 'far' },
    { h: '물량이 그대로<br><em>예산</em>이 됩니다', by: ['05 5D 예산', '#/budget'], note: won(E.total), at: null, a: 'far', c: 'top' },
  ];

  // 결과 인덱스 항목
  const ITEMS = [
    { st: '01', ty: 'num', t: '비교한 후보지', big: SITE_IDS.length, unit: '곳', sub: '사업성·입지·추진 안정성을 같은 기준으로', href: '#/site' },
    { st: '01', ty: 'fig', t: '택지 점수', m: '5개 가중치', svg: figSite(SITE_IDS.length), href: '#/site' },
    { st: '01', ty: 'num', t: '고른 택지', big: fmt(site.area / 1e4, 1), unit: '만㎡', sub: site.name, href: '#/site' },
    { st: '02', ty: 'img', shot: 'top', t: '동 배치', m: `${t.towers}개 동`, href: '#/mass' },
    { st: '02', ty: 'num', t: '세대수', big: fmt(t.units), unit: '호', sub: TYPOLOGIES[mp.typology] ? TYPOLOGIES[mp.typology].name : '', href: '#/mass' },
    { st: '02', ty: 'img', shot: 'street', t: '가로에서 본 단지', m: '눈높이 1.7m', href: '#/mass' },
    { st: '02', ty: 'num', t: '가장 높은 동', big: top.storeys, unit: '층', sub: `${fmt(top.height, 0)}m · ${top.id}`, href: '#/mass' },
    { st: '02', ty: 'fig', t: '높이 계획', m: '인동간격 검토', svg: figMass(), href: '#/mass' },
    { st: '02', ty: 'img', shot: 'far', t: water ? `${water} 쪽에서` : '먼 곳에서', m: '조망', href: '#/mass' },
    { st: '02', ty: 'num', t: '인동간격 부족', big: law, unit: '건', sub: '건축법 시행령 제86조', href: '#/mass' },
    { st: '03', ty: 'num', t: '연면적', big: fmt((t.gfaAbove + t.gfaBelow) / 1e4, 1), unit: '만㎡', sub: `지상 ${fmt(floorsAbove)}개 층`, href: '#/schedule' },
    { st: '03', ty: 'fig', t: '층별 일람표', m: 'FL·층고·면적', svg: figStack(), href: '#/schedule' },
    { st: '03', ty: 'num', t: '굴토량', big: fmt(Q.excavation / 1e4, 0), unit: '만㎥', sub: `외벽 ${fmt(Q.facade / 1e4, 1)}만㎡`, href: '#/schedule' },
    { st: '04', ty: 'img', shot: 'earth', t: '흙막이·굴토', m: ph('earth').date, href: '#/process' },
    { st: '04', ty: 'num', t: '총 공기', big: S.months, unit: '개월', sub: `${ym(S.t0)} → ${ym(dateAt(S.t0, S.end))}`, href: '#/process' },
    { st: '04', ty: 'img', shot: 'found', t: '지하 골조', m: ph('base', 'found').date, href: '#/process' },
    { st: '04', ty: 'img', shot: 'struct', t: '지상 골조', m: ph('struct').date, href: '#/process' },
    { st: '04', ty: 'fig', t: '공정표', m: `${S.phases.filter(p => p.n).length}개 단계`, svg: figGantt(S), href: '#/process' },
    { st: '04', ty: 'img', shot: 'mep', t: '설비 배관·덕트', m: ph('mep').date, href: '#/process' },
    { st: '04', ty: 'num', t: '동시 타워크레인', big: maxCranes, unit: '대', sub: '가장 많을 때', href: '#/process' },
    { st: '04', ty: 'img', shot: 'skin', t: '창호·커튼월', m: ph('skin').date, href: '#/process' },
    { st: '05', ty: 'num', t: '총공사비', big: won(E.total), unit: '', sub: stage1Cost ? `1단계 개략 대비 ${E.total >= stage1Cost ? '+' : '−'}${fmt(Math.abs(E.total / stage1Cost - 1) * 100, 0)}%` : '물가상승 포함', href: '#/budget' },
    { st: '05', ty: 'fig', t: 'S커브', m: '월별 기성 누계', svg: figCurve(E), href: '#/budget' },
    { st: '05', ty: 'num', t: '평당 공사비', big: fmt(E.perPy, 0), unit: '만원', sub: `㎡당 ${fmt(E.perM2, 0)}만원`, href: '#/budget' },
    { st: '05', ty: 'num', t: '최대 월 기성', big: won(E.peak.total), unit: '', sub: ym(dateAt(S.t0, E.peak.m * 30.44)), href: '#/budget' },
  ];
  ITEMS.forEach((x, i) => { x.no = String(i + 1).padStart(2, '0'); x.m = x.m || (x.ty === 'num' ? `${x.big}${x.unit}` : ''); });

  const imgSlot = (id) => { const s = shotById[id]; return `<div class="ph" data-shot="${id}" style="aspect-ratio:${s.w}/${s.h}"></div>`; };
  const card = (x) => {
    let im;
    if (x.ty === 'img') im = imgSlot(x.shot);
    else if (x.ty === 'fig') im = x.svg;
    else im = `<span class="label-sm">${x.t}</span><span class="big">${x.big}<small>${x.unit}</small></span><span class="sub">${esc(x.sub)}</span>`;
    return `<a class="el ${x.ty === 'num' ? 'statc' : x.ty === 'fig' ? 'svgc' : 'imgc'}" href="${x.href}" data-i="${x.no}" data-st="${x.st}" data-ty="${x.ty}">
      <div class="im">${im}<span class="open">${x.st} ${STAGES[x.st]} 열기</span></div>
      <div class="cap"><b>${esc(x.t)}</b><span>${esc(x.m)}</span></div></a>`;
  };
  const row = (x) => `<a href="${x.href}" data-i="${x.no}" data-st="${x.st}" data-ty="${x.ty}"><span>${x.no}</span><b>${esc(x.t)}</b><span class="c3">${x.st} ${STAGES[x.st]}</span><span class="c4">${TYPES[x.ty]}</span><span class="yr">${esc(x.m)}</span></a>`;
  const count = (k, v) => ITEMS.filter(x => x[k] === v).length;

  const node = (st, href, fig, h, p, li) => `<article class="node"><a class="fig" href="${href}" aria-hidden="true" tabindex="-1">${fig}</a>
    <div class="nh"><h3>${h}<sup>${st}</sup></h3></div><p>${p}</p>
    <ul>${li.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('')}</ul><a class="chipbtn more" href="${href}">열기 <span aria-hidden="true">→</span></a></article>`;

  const marq = [['세대', `${fmt(t.units)}호`], ['동', `${t.towers}개`], ['최고', `${top.storeys}층 ${fmt(top.height, 0)}m`], ['연면적', `${fmt((t.gfaAbove + t.gfaBelow) / 1e4, 1)}만㎡`], ['굴토', `${fmt(Q.excavation / 1e4, 0)}만㎥`], ['공기', `${S.months}개월`], ['크레인', `최대 ${maxCranes}대`], ['총공사비', won(E.total)], ['평당', `${fmt(E.perPy, 0)}만원`]]
    .map(([a, b]) => `<span><em>${a}</em>${b}</span>`).join('');

  root.innerHTML = `
  <section class="start" aria-label="큐레이션 장면">
    <div class="start-meta">
      <span id="h-scene">scene 01 / 0${SCENES.length}</span>
      <span class="dots" role="tablist" aria-label="장면 고르기">${SCENES.map((_, i) => `<button type="button" role="tab" aria-label="장면 ${i + 1}" aria-current="${i === 0}" data-s="${i}"></button>`).join('')}</span>
      <span class="ctrl"><button type="button" id="h-pause">pause</button><button type="button" id="h-next">next →</button></span>
    </div>
    <div class="collage">
      <figure class="cl cl-a"><img alt=""><img alt=""><figcaption></figcaption></figure>
      <figure class="cl cl-b"><div class="stage" id="h-stage"></div><figcaption id="h-live">live 3d · ${esc(site.name)}</figcaption></figure>
      <figure class="cl cl-c"><img alt=""><img alt=""><figcaption></figcaption></figure>
    </div>
    <h1 class="start-h" id="h-h">${SCENES[0].h}</h1>
    <p class="curated" id="h-by"></p>
    <div class="start-cta"><a class="btn" href="#/site">택지 고르기 <span class="ar">→</span></a><a class="btn ghost" href="#/process">4D 공정 재생</a></div>
  </section>

  <section class="find" aria-label="결과 인덱스">
    <div class="find-h">
      <h2><em id="ix-em">모든</em> 결과를 한 곳에서</h2>
      <label class="search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="M11 11l4 4"/></svg><input id="ix-q" type="search" placeholder="세대수, 골조, 공사비…" aria-label="결과 찾기"><kbd>/</kbd></label>
    </div>
    <div class="ix-bar">
      <div class="grp2" role="group" aria-label="단계"><span class="lbl">stage</span>
        <button type="button" data-f="st" data-v="" aria-pressed="true">전체<sup>${ITEMS.length}</sup></button>
        ${Object.entries(STAGES).map(([k, v]) => `<button type="button" data-f="st" data-v="${k}" aria-pressed="false">${v}<sup>${count('st', k)}</sup></button>`).join('')}
      </div>
      <div class="grp2" role="group" aria-label="종류"><span class="lbl">type</span>
        <button type="button" data-f="ty" data-v="" aria-pressed="true">전체<sup>${ITEMS.length}</sup></button>
        ${Object.entries(TYPES).map(([k, v]) => `<button type="button" data-f="ty" data-v="${k}" aria-pressed="false">${v}<sup>${count('ty', k)}</sup></button>`).join('')}
      </div>
      <div class="right">
        <div class="grp2" role="group" aria-label="보기"><button type="button" data-lay="grid" aria-pressed="true">grid</button><button type="button" data-lay="list" aria-pressed="false">list</button></div>
        <div class="grp2" role="group" aria-label="크기" id="ix-size"><button type="button" data-sz="lg" aria-pressed="false">larger</button><button type="button" data-sz="" aria-pressed="true">default</button><button type="button" data-sz="sm" aria-pressed="false">smaller</button></div>
      </div>
    </div>
    <div class="ix-count" id="ix-count" aria-live="polite"></div>
    <div class="masonry" id="ix-grid">${ITEMS.map(card).join('')}</div>
    <div class="ix-list" id="ix-list" hidden>${ITEMS.map(row).join('')}</div>
    <div class="ix-prev" id="ix-prev" aria-hidden="true"></div>
  </section>

  <div class="marq" aria-hidden="true"><div class="tr">${marq}${marq}</div></div>

  <div class="wrap">
    <div class="sec">
      <div class="sec-title"><span class="n">pipeline</span><h2>다섯 단계, 하나의 모델</h2><span class="hint">각 단계는 앞 단계가 넘긴 값으로 시작합니다. 한 단계의 변수를 바꾸면 뒤 단계가 모두 다시 계산됩니다.</span></div>
      <div class="rail">
        ${node('01', '#/site', figSite(SITE_IDS.length), '택지 선정', `서울 택지 ${SITE_IDS.length}곳을 같은 기준으로 비교하거나, 위치와 면적을 직접 넣어 새 택지를 만듭니다.`, [['고른 택지', esc(site.name)], ['면적', `${fmt(site.area / 1e4, 1)}만㎡`]])}
        ${node('02', '#/mass', figMass(), '매스 배치', '주동 형식과 높이 계획으로 동을 놓고, 인동간격 법규와 동지 일조·조망을 세대마다 계산합니다.', [['세대', `${fmt(t.units)}호`], ['동', `${t.towers}개`], ['인동간격 부족', `${law}건`]])}
        ${node('03', '#/schedule', figStack(), '층별 일람표', '모든 동을 층 단위로 펼쳐 층고·FL·바닥면적·외벽과 지하 굴토 물량을 정리합니다.', [['연면적', `${fmt((t.gfaAbove + t.gfaBelow) / 1e4, 1)}만㎡`], ['굴토', `${fmt(Q.excavation / 1e4, 0)}만㎥`]])}
        ${node('04', '#/process', figGantt(S), '4D 공정', '가설·흙막이·굴토·기초·지하 골조·지상 골조·설비·창호·내부 마감·준공을 층 단위로 3D 재생합니다.', [['공기', `${S.months}개월`], ['준공', ym(dateAt(S.t0, S.end))]])}
        ${node('05', '#/budget', figCurve(E), '5D 예산', '층별 물량에 공종 단가를 곱해 공정에 얹고, 월별 기성과 누계 S커브, 물가상승을 계산합니다.', [['총공사비', won(E.total)], ['평당', `${fmt(E.perPy, 0)}만원`]])}
      </div>
    </div>

    <div class="sec">
      <div class="sec-title"><span class="n">data flow</span><h2>어느 단계가 무엇을 만들고 쓰는가</h2><span class="hint">검은 점은 그 단계가 만드는 값, 빈 점은 받아 쓰는 값, 주황 점은 모델이 자동으로 계산하는 분석입니다.</span></div>
      <div class="matrix">${matrixSVG()}
        <div class="matrix-leg"><span><i class="f"></i>만듦</span><span><i></i>받아 씀</span><span><i class="a"></i>자동 계산 (법규 검토·광선 추적·공정 상태·현금흐름)</span></div></div>
    </div>

    <div class="sec">
      <div class="sec-title"><span class="n">method</span><h2>계산 방식</h2></div>
      <div class="method">
        <div><span class="label-sm">rule-based massing</span><h3>법규를 지키는 배치</h3><p>건축법 시행령 제86조 제3항의 인동간격과 용도지역별 높이 한도를 반영합니다. 높이 계획을 먼저 정하고 간격이 모자라면 층수를 낮춥니다.</p></div>
        <div><span class="label-sm">ray casting</span><h3>세대별 일조·조망</h3><p>모든 세대의 창에서 동지 08~16시 태양, 가까운 수변, 산·랜드마크를 향해 광선을 쏘아 주변 건물과 단지 안 동의 가림을 판정합니다. 주변 건물은 실제 지도(OpenStreetMap)에서 가져옵니다.</p></div>
        <div><span class="label-sm">quantity-driven 4d·5d</span><h3>물량에서 공정·예산으로</h3><p>층별 바닥면적·외벽·굴토량으로 공종별 작업 기간과 공사비를 계산합니다. 작업일 달력(주말·동절기·장마)과 단가, 연 물가상승률을 변수로 둡니다.</p></div>
      </div>
    </div>
  </div>

  <section class="closing" aria-label="시작하기">
    <h2>다른 <em>택지</em>로<br>처음부터 다시</h2>
    <p class="note">택지를 바꾸면 주변 지도, 배치, 일람표, 공정, 예산이 모두 그 택지로 다시 계산됩니다.</p>
    <div class="start-cta"><a class="btn" href="#/site">01 택지 선정 <span class="ar">→</span></a><a class="btn ghost" href="#/mass">02 매스 배치</a></div>
  </section>`;

  const $ = (id) => root.querySelector('#' + id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };

  // ---------- 실시간 3D ----------
  let viewer = null, off = () => {}, alive = true;
  viewer = createViewer($('h-stage'), { hero: true });
  if (viewer) {
    viewer.setPlan(plan, osmReady(plan) || undefined);
    viewer.setModel(gen); viewer.paint('use', null); viewer.setSun(-10, 14.5);
    off = onThemeChange(() => { viewer.applyTheme(); });
    if (reduce) viewer.setAutoRotate(false);
    // 전에 받아 둔 지도가 있으면 쓴다 (처음 화면에서는 새로 받지 않는다)
    if (!osmReady(plan) && store.get().useMap !== false) osmFor(plan, { cacheOnly: true }).then(c => { if (alive && viewer) { viewer.setContext(c); shots.clear(); later(shootAll, 400); } }).catch(() => {});
  } else $('h-live').textContent = '3D를 표시할 수 없는 환경입니다';

  // ---------- 장면 사진 ----------
  const shots = new Map();
  let shooting = false;
  function shootAll() {
    if (!viewer || !alive || shooting) return;
    shooting = true;
    const queue = SHOTS.filter(s => !shots.has(s.id));
    const step = () => {
      if (!alive) return;
      const s = queue.shift();
      if (!s) { shooting = false; return; }
      const url = viewer.capture(typeof s.view !== 'string' || viewer.viewOk(s.view) ? s.view : 'east', { w: s.w, h: s.h, build: s.at != null ? buildAt(s.at) : (scene.at != null ? { floor: null, block: null, cranes: null } : null) });
      if (url) { shots.set(s.id, url); fill(s.id); }
      later(step, 90);
    };
    step();
  }
  function fill(id) {
    const url = shots.get(id), s = shotById[id];
    root.querySelectorAll(`.ph[data-shot="${id}"]`).forEach(el => { el.innerHTML = `<img src="${url}" alt="${esc(s.cap)}" loading="lazy">`; el.classList.add('ok'); });
    paintSides();
  }

  // ---------- 장면 넘기기 ----------
  let si = 0, scene = SCENES[0], paused = reduce, timer = null;
  function sideImg(fig, id) {
    const s = shotById[id], url = shots.get(id);
    fig.querySelector('figcaption').textContent = s.cap;
    if (!url) return;
    const imgs = fig.querySelectorAll('img'), on = fig.querySelector('img.on');
    if (on && on.dataset.id === id) return;
    const nx = on === imgs[0] ? imgs[1] : imgs[0];
    const swap = () => { nx.classList.add('on'); if (on) on.classList.remove('on'); };
    nx.dataset.id = id; nx.alt = s.cap;
    if (nx.src === url && nx.complete) swap(); else { nx.onload = swap; nx.src = url; }
  }
  function paintSides() { sideImg(root.querySelector('.cl-a'), scene.a); sideImg(root.querySelector('.cl-c'), scene.c); }
  function show(i, instant = false) {
    si = (i + SCENES.length) % SCENES.length; scene = SCENES[si];
    $('h-scene').textContent = `scene 0${si + 1} / 0${SCENES.length}`;
    root.querySelectorAll('.dots [data-s]').forEach(b => b.setAttribute('aria-current', String(+b.dataset.s === si)));
    const h = $('h-h'), by = $('h-by');
    const apply = () => {
      h.innerHTML = scene.h;
      by.innerHTML = `curated by <a href="${scene.by[1]}">${scene.by[0]}</a> · ${esc(scene.note)}`;
      h.classList.remove('fade'); by.classList.remove('fade');
    };
    if (instant) apply(); else { h.classList.add('fade'); by.classList.add('fade'); later(apply, 380); }
    if (viewer) viewer.setBuild(scene.at != null ? buildAt(scene.at) : { floor: null, block: null, cranes: null, focus: null });
    paintSides();
    schedule();
  }
  function schedule() { if (timer) { clearTimeout(timer); timers.delete(timer); } timer = paused ? null : later(() => show(si + 1), 7000); }
  root.querySelector('.dots').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) show(+b.dataset.s); });
  $('h-next').addEventListener('click', () => show(si + 1));
  $('h-pause').addEventListener('click', (e) => { paused = !paused; e.currentTarget.textContent = paused ? 'play' : 'pause'; schedule(); });
  $('h-pause').textContent = paused ? 'play' : 'pause';
  show(0, true);
  if (viewer) later(shootAll, 700);

  // ---------- 인덱스: 필터·검색·보기 ----------
  const F = { st: '', ty: '', q: '', lay: 'grid', sz: '' };
  function applyIx() {
    const q = F.q.trim().toLowerCase();
    let n = 0;
    const ok = ITEMS.map(x => {
      const hit = (!F.st || x.st === F.st) && (!F.ty || x.ty === F.ty) && (!q || `${x.t} ${x.m} ${x.sub || ''} ${STAGES[x.st]} ${TYPES[x.ty]}`.toLowerCase().includes(q));
      if (hit) n++; return hit;
    });
    root.querySelectorAll('#ix-grid .el, #ix-list a').forEach(el => { el.hidden = !ok[+el.dataset.i - 1]; });
    $('ix-count').textContent = `${ITEMS.length}개 중 ${n}개`;
    const em = $('ix-em'), label = F.st ? STAGES[F.st] : F.ty ? TYPES[F.ty] : '모든';
    if (em.textContent !== label) { em.style.opacity = 0; later(() => { em.textContent = label; em.style.opacity = ''; }, 160); }
    $('ix-grid').className = 'masonry' + (F.sz ? ' ' + F.sz : '');
    $('ix-grid').hidden = F.lay !== 'grid'; $('ix-list').hidden = F.lay !== 'list';
    $('ix-size').hidden = F.lay !== 'grid';
  }
  root.querySelector('.ix-bar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const grp = b.parentElement;
    if (b.dataset.f) F[b.dataset.f] = b.dataset.v;
    else if (b.dataset.lay) F.lay = b.dataset.lay;
    else if (b.dataset.sz != null) F.sz = b.dataset.sz;
    grp.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    applyIx();
  });
  $('ix-q').addEventListener('input', e => { F.q = e.target.value; applyIx(); });
  const onKey = (e) => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('ix-q').focus(); } };
  document.addEventListener('keydown', onKey);
  applyIx();

  // 목록 보기: 줄 위에 마우스를 올리면 미리보기
  const prev = $('ix-prev');
  $('ix-list').addEventListener('pointermove', e => {
    const a = e.target.closest('a[data-i]');
    if (!a || e.pointerType !== 'mouse') { prev.classList.remove('on'); return; }
    const x = ITEMS[+a.dataset.i - 1];
    if (prev.dataset.i !== x.no) {
      prev.dataset.i = x.no;
      prev.innerHTML = x.ty === 'img' ? (shots.get(x.shot) ? `<img src="${shots.get(x.shot)}" alt="">` : '') : x.ty === 'fig' ? x.svg : `<div class="pv-num"><span class="label-sm">${x.t}</span><b>${x.big}<small>${x.unit}</small></b></div>`;
    }
    const w = 280, xx = Math.min(innerWidth - w - 16, e.clientX + 24), yy = Math.min(innerHeight - 240, e.clientY + 18);
    prev.style.left = xx + 'px'; prev.style.top = yy + 'px';
    prev.classList.toggle('on', !!prev.innerHTML);
  });
  $('ix-list').addEventListener('pointerleave', () => prev.classList.remove('on'));

  return () => {
    alive = false; off(); timers.forEach(clearTimeout); document.removeEventListener('keydown', onKey);
    if (viewer) viewer.dispose();
  };
}
