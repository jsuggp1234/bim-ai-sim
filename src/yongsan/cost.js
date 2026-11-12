// 5단계 예산(5D): 층별 물량 × 공종별 단가 → 공사비, 4D 공정에 얹어 월별 기성·누계(S커브)
// 단가는 2026년 기준 근사치(만원). 실제 내역서 단가로 바꿔 쓸 수 있도록 모두 변수로 둔다.

export const P5_DEFAULTS = {
  earth: 4.5,        // 터파기·잔토 처리 (만원/㎥)
  retain: 110,       // 흙막이 지하연속벽 (만원/㎡ 벽면)
  found: 95,         // 기초 매트 (만원/㎡)
  structRes: 48,     // 지상 골조 · 주거 (만원/㎡)
  structOffice: 62,  // 지상 골조 · 업무·상업
  structBase: 72,    // 지하 골조
  skinRes: 55,       // 외장 · 주거(창호+석재/도장) (만원/㎡ 외벽)
  skinOffice: 120,   // 외장 · 업무 커튼월
  skinLandmark: 165, // 외장 · 랜드마크 고성능 커튼월
  finRes: 62, finOfficetel: 58, finOffice: 40, finRetail: 38, finBase: 12, // 마감 (만원/㎡)
  mepRes: 64, mepOffice: 94, mepBase: 24, // 기계·전기·통신·소방 (만원/㎡)
  liftBase: 1.2,     // 승강기 1대 기본 (억원)
  liftPerFl: 0.025,  // 승강기 층당 추가 (억원)
  landscape: 18,     // 조경·외부 (만원/㎡ 외부 면적)
  highRise: 0.6,     // 30층 초과 층당 할증 (%) — 1단계와 같은 가정
  temp: 7,           // 가설·공통 (% 직접비)
  overhead: 11,      // 일반관리비+이윤 (%)
  design: 4,         // 설계·감리 (%)
  contingency: 5,    // 예비비 (%)
  escalation: 3.5,   // 물가상승 (%/년, 2026년 단가 기준)
};
export const P5_META = {
  structRes: { label: '주거 골조', unit: '만원/㎡', min: 30, max: 90, step: 1, g: 'unit' },
  structOffice: { label: '업무 골조', unit: '만원/㎡', min: 40, max: 120, step: 1, g: 'unit' },
  skinRes: { label: '주거 외장', unit: '만원/㎡', min: 30, max: 120, step: 1, g: 'unit', note: '외벽 면적당' },
  skinOffice: { label: '업무 커튼월', unit: '만원/㎡', min: 70, max: 220, step: 1, g: 'unit' },
  finRes: { label: '주거 마감', unit: '만원/㎡', min: 30, max: 120, step: 1, g: 'unit' },
  mepRes: { label: '주거 설비·전기', unit: '만원/㎡', min: 30, max: 120, step: 1, g: 'unit' },
  mepOffice: { label: '업무 설비·전기', unit: '만원/㎡', min: 50, max: 160, step: 1, g: 'unit' },
  retain: { label: '흙막이 (지하연속벽)', unit: '만원/㎡', min: 50, max: 200, step: 1, g: 'unit' },
  highRise: { label: '30층 초과 층당 할증', unit: '%', min: 0, max: 2, step: 0.05, g: 'rate' },
  temp: { label: '가설·공통비', unit: '%', min: 3, max: 15, step: 0.5, g: 'rate' },
  overhead: { label: '일반관리비·이윤', unit: '%', min: 5, max: 20, step: 0.5, g: 'rate' },
  contingency: { label: '예비비', unit: '%', min: 0, max: 15, step: 0.5, g: 'rate' },
  escalation: { label: '물가상승률', unit: '%/년', min: 0, max: 8, step: 0.1, g: 'rate', note: '2026년 단가를 공사 시점으로 환산' },
};
export const COST_CATS = [
  { key: 'earth', name: '토공·흙막이', acts: ['wall', 'earth'] },
  { key: 'found', name: '기초', acts: ['found'] },
  { key: 'base', name: '지하 골조·마감', acts: ['base'] },
  { key: 'struct', name: '지상 골조', acts: ['struct'] },
  { key: 'skin', name: '외장', acts: ['skin'] },
  { key: 'mep', name: '설비·전기', acts: ['mep'] },
  { key: 'fin', name: '마감', acts: ['fin'] },
  { key: 'lift', name: '승강기', acts: ['comm'] },
  { key: 'land', name: '조경·외부', acts: ['land'] },
  { key: 'indirect', name: '가설·간접비', acts: [] },
  { key: 'esc', name: '물가상승', acts: [] },
];

const M = 30.44;
const isRes = (u) => u === 'res' || u === 'officetel';
function liftCount(b) {
  if (b.kind === 'landmark') return 40;
  if (b.kind === 'podium') return 4;
  if (b.kind === 'office') return Math.max(6, Math.ceil(b.gfa / 6500));
  if (b.kind === 'officetel') return Math.max(4, Math.ceil(b.storeys / 12));
  // 아파트: 코어당 2대(층당 4세대 기준) + 고층 비상용
  return Math.max(2, Math.ceil((b.upf || 4) / 2)) + (b.storeys > 30 ? 1 : 0);
}

export function estimate(gen, Q, S, pIn) {
  const p = { ...P5_DEFAULTS, ...pIn };
  const items = []; // {cat, block, bi, use, amount(만원), act: {block, bi, cat} 또는 floor 시점}
  const push = (cat, amount, ref) => { if (amount > 0) items.push({ cat, amount, ...ref }); };
  // 블록: 토공·흙막이·기초·지하
  Q.basements.forEach(bs => {
    push('earth', bs.volume * p.earth + bs.retainWall * p.retain, { block: bs.block, acts: ['wall', 'earth'] });
    push('found', bs.foot * p.found, { block: bs.block, acts: ['found'] });
    push('base', bs.area * (p.structBase + p.finBase + p.mepBase), { block: bs.block, acts: ['base'], use: 'parking' });
  });
  // 동·층
  gen.bldgs.forEach((b, bi) => {
    if (b.kind === 'basement') return;
    const hr = 1 + p.highRise / 100 * Math.max(0, b.storeys - 30);
    const skinU = b.kind === 'landmark' ? p.skinLandmark : (b.kind === 'office' || b.kind === 'podium') ? p.skinOffice : b.kind === 'officetel' ? (p.skinRes + p.skinOffice) / 2 : p.skinRes;
    b.floors.forEach((f, fi) => {
      if (f.lv <= 0) return;
      const res = isRes(f.use) || (b.kind === 'apt' || b.kind === 'officetel');
      const st = (res ? p.structRes : p.structOffice) * (f.roof ? 1.3 : f.use === 'refuge' ? 1.25 : 1);
      push('struct', f.area * st * hr, { block: b.block, bi, fi, use: f.use });
      push('skin', Q.facadeOf(b, f) * skinU * (b.kind === 'landmark' ? hr : 1), { block: b.block, bi, acts: ['skin'], use: f.use });
      const fin = f.use === 'res' ? p.finRes : f.use === 'officetel' ? p.finOfficetel : f.use === 'office' ? p.finOffice : f.use === 'mech' ? p.finBase : p.finRetail;
      push('fin', f.area * fin, { block: b.block, bi, acts: ['fin'], use: f.use });
      push('mep', f.area * (res ? p.mepRes : p.mepOffice) * (f.use === 'mech' ? 1.8 : 1), { block: b.block, bi, acts: ['mep'], use: f.use });
    });
    push('lift', liftCount(b) * (p.liftBase + p.liftPerFl * b.storeys) * 1e4, { block: b.block, bi, acts: ['comm'], use: b.kind === 'apt' ? 'res' : b.kind === 'officetel' ? 'officetel' : 'office' });
  });
  gen.blocks.forEach(bl => {
    const ext = Math.max(0, bl.area - gen.bldgs.filter(x => x.block === bl.id && x.kind !== 'basement').reduce((s, x) => s + x.foot, 0));
    push('land', ext * p.landscape, { block: bl.id, acts: ['land'] });
  });
  const direct = items.reduce((s, x) => s + x.amount, 0);

  // ---------- 월별 배분 ----------
  const months = S.months + 2;
  const monthly = Array.from({ length: months }, () => ({}));
  const actIndex = new Map();
  S.acts.forEach(a => { const k = `${a.block}|${a.bi == null ? '' : a.bi}|${a.cat}`; actIndex.set(k, a); });
  const spread = (amount, s, e, cat) => {
    const m0 = s / M, m1 = Math.max(m0 + 0.05, e / M);
    for (let m = Math.floor(m0); m < Math.ceil(m1) && m < months; m++) {
      const ov = Math.min(m + 1, m1) - Math.max(m, m0);
      if (ov > 0) monthly[m][cat] = (monthly[m][cat] || 0) + amount * ov / (m1 - m0);
    }
  };
  const escAt = (day) => Math.pow(1 + p.escalation / 100, (S.t0.getUTCFullYear() + S.t0.getUTCMonth() / 12 + day / 365.25) - 2026);
  let esc = 0;
  items.forEach(it => {
    let s, e;
    if (it.cat === 'struct') {
      const r = S.blds.get(it.bi); const i = r ? r.floors.indexOf(it.fi) : -1;
      if (r && i >= 0) { s = i ? r.fEnd[i - 1] : r.structStart; e = r.fEnd[i]; }
    } else {
      const acts = it.acts.map(c => actIndex.get(`${it.block}|${it.bi == null ? '' : it.bi}|${c}`)).filter(Boolean);
      if (acts.length) { s = Math.min(...acts.map(a => a.start)); e = Math.max(...acts.map(a => a.end)); }
    }
    if (s == null) { s = 0; e = S.end; }
    const x = escAt((s + e) / 2);
    esc += it.amount * (x - 1);
    spread(it.amount, s, e, it.cat);
    spread(it.amount * (x - 1), s, e, 'esc');
  });
  // 간접비: 가설·공통은 직접비에 비례, 관리비·이윤·예비비도 비례, 설계·감리는 30%를 착공 전(0월)에
  const temp = direct * p.temp / 100;
  const sub = direct + esc + temp;
  const over = sub * p.overhead / 100;
  const design = (sub + over) * p.design / 100;
  const cont = (sub + over + design) * p.contingency / 100;
  const indirect = temp + over + design * 0.7 + cont;
  const base = direct + esc;
  monthly.forEach(mo => {
    const d = Object.values(mo).reduce((s, v) => s + v, 0);
    mo.indirect = (mo.indirect || 0) + indirect * d / (base || 1);
  });
  monthly[0].indirect = (monthly[0].indirect || 0) + design * 0.3;
  let cum = 0;
  const flow = monthly.map((mo, m) => {
    const total = Object.values(mo).reduce((s, v) => s + v, 0); cum += total;
    return { m, by: mo, total, cum };
  });
  while (flow.length > 1 && flow[flow.length - 1].total < 1) flow.pop();
  const total = direct + esc + temp + over + design + cont;
  // 집계
  const byCat = {}; items.forEach(x => { byCat[x.cat] = (byCat[x.cat] || 0) + x.amount; });
  byCat.indirect = temp + over + design + cont; byCat.esc = esc;
  const byBlock = {}; items.forEach(x => { byBlock[x.block] = (byBlock[x.block] || 0) + x.amount; });
  const byBldg = new Map(); items.forEach(x => { if (x.bi != null) byBldg.set(x.bi, (byBldg.get(x.bi) || 0) + x.amount); });
  const byUse = {}; items.forEach(x => { const u = x.use || 'site'; byUse[u] = (byUse[u] || 0) + x.amount; });
  const gfa = gen.totals.gfaAbove + gen.totals.gfaBelow;
  const markup = total / (direct || 1);
  return { p, items, direct, esc, temp, over, design, cont, total, markup, flow, byCat, byBlock, byBldg, byUse, gfa, perM2: total / gfa, perPy: total / gfa * 3.3058,
    peak: flow.reduce((a, b) => (b.total > a.total ? b : a), flow[0]) };
}
