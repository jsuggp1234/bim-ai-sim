import { FLOOR_USES } from './uses.js';
// 5단계 예산(5D): 층별 물량 × 공종별 단가 → 공사비, 4D 공정에 얹어 월별 기성·누계(S커브)
// 단가는 2026년 기준 근사치(만원). 실제 내역서 단가로 바꿔 쓸 수 있도록 모두 변수로 둔다.
//
// 2026.11 주거 단가 보정 (산군 입찰DB의 LH 아파트 건설공사 낙찰 10건, bench.js)
//  · 고양창릉 S-4BL 6공구: 낙찰 2,305억 / 연면적 144,212㎡ = 160만원/㎡ (세대당 2.25억). 건축·토목 도급분만의 금액이다
//  · 전기·통신·소방(분리 발주)과 발주처 지급자재를 합친 전체 공사비는 그 1.4배쯤으로 보았다 (도급분 70% 가정 — 산군 자료가 아닌 가정)
//  · 예전 단가로는 같은 조건의 도급 범위가 271만원/㎡로 실제 추정치(약 228만원/㎡)보다 19% 높았다.
//    흙막이를 지하연속벽 값으로, 기초를 전 면적 두꺼운 매트 값으로, 주거 외장을 커튼월에 가까운 값으로 잡은 탓이라 이 항목들을 낮췄다

export const P5_DEFAULTS = {
  earth: 3.5,        // 터파기·잔토 처리 (만원/㎥)
  retain: 60,        // 흙막이 (만원/㎡ 벽면, CIP·버팀보 기준 — 지하연속벽은 공법 단계에서 배수로 올라간다)
  found: 55,         // 기초 (만원/㎡, 동 아래 매트와 주차장 구간 얇은 기초의 평균)
  structRes: 48,     // 지상 골조 · 주거 (만원/㎡)
  structOffice: 62,  // 지상 골조 · 업무·상업
  structBase: 62,    // 지하 골조
  skinRes: 34,       // 외장 · 주거(창호+도장, 저층부 석재) (만원/㎡ 외벽)
  skinOffice: 120,   // 외장 · 업무 커튼월
  skinLandmark: 165, // 외장 · 랜드마크 고성능 커튼월
  finRes: 58, finOfficetel: 56, finOffice: 40, finRetail: 38, finBase: 12, // 마감 (만원/㎡)
  mepRes: 52, mepOffice: 94, mepBase: 20, // 기계·전기·통신·소방 (만원/㎡)
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
  retain: { label: '흙막이 (CIP·버팀보 기준)', unit: '만원/㎡', min: 30, max: 200, step: 1, g: 'unit', note: '벽면 넓이당. 지하연속벽은 100~130' },
  highRise: { label: '30층 초과 층당 할증', unit: '%', min: 0, max: 2, step: 0.05, g: 'rate' },
  temp: { label: '가설·공통비', unit: '%', min: 3, max: 15, step: 0.5, g: 'rate' },
  overhead: { label: '일반관리비·이윤', unit: '%', min: 5, max: 20, step: 0.5, g: 'rate' },
  contingency: { label: '예비비', unit: '%', min: 0, max: 15, step: 0.5, g: 'rate' },
  escalation: { label: '물가상승률', unit: '%/년', min: 0, max: 8, step: 0.1, g: 'rate', note: '2026년 단가를 공사 시점으로 환산' },
};
export const COST_CATS = [
  { key: 'geo', name: '지반조사·개량·차수', acts: ['survey', 'improve', 'wall'] },
  { key: 'earth', name: '토공·흙막이', acts: ['wall', 'earth'] },
  { key: 'found', name: '기초', acts: ['found'] },
  { key: 'base', name: '지하 골조·마감', acts: ['base'] },
  { key: 'struct', name: '지상 골조', acts: ['struct'] },
  { key: 'skin', name: '외장', acts: ['skin'] },
  { key: 'mep', name: '설비·전기', acts: ['mep'] },
  { key: 'fin', name: '마감', acts: ['fin'] },
  { key: 'lift', name: '승강기', acts: ['comm'] },
  { key: 'equip', name: '공정·특수 설비', acts: ['mep', 'comm'] },
  { key: 'land', name: '조경·외부', acts: ['land'] },
  { key: 'qa', name: '품질·안전 기술', acts: [] },
  { key: 'indirect', name: '가설·간접비', acts: [] },
  { key: 'esc', name: '물가상승', acts: [] },
];

const M = 30.44;
const isRes = (u) => u === 'res' || u === 'officetel';
function liftCount(b) {
  if (b.shape === 'cyl' || ['rack', 'gen', 'tank', 'column', 'stack', 'wwt', 'cool', 'basin'].includes(b.kind)) return 0;
  if (b.storeys <= 1) return 0;
  if (['hotel', 'ward', 'lab', 'clinic', 'admin', 'mall', 'whs', 'dhall', 'fab', 'cub', 'prod', 'gmp', 'gallery', 'arena'].includes(b.kind)) return Math.max(2, Math.ceil(b.gfa / 9000));
  if (b.kind === 'landmark') return 40;
  if (b.kind === 'podium') return 4;
  if (b.kind === 'office') return Math.max(6, Math.ceil(b.gfa / 6500));
  if (b.kind === 'officetel') return Math.max(4, Math.ceil(b.storeys / 12));
  // 아파트: 코어당 2대(층당 4세대 기준) + 고층 비상용
  return Math.max(2, Math.ceil((b.upf || 4) / 2)) + (b.storeys > 30 ? 1 : 0);
}

// 공법 효과가 없을 때 (전통 공법)
const MFX0 = { retainK: 0.85, foundK: 1.0, structCostK: 1.05, concCostK: 1, skinK: 0.85, mepK: 1, finSave: 0, improveCost: 0, waterCost: 6, qaCostPct: 0, unc: 1, surveyDays: 35,
  bwpK: 1, finK: 1, roofK: 1, liftK: 1, landC: 1, prepK: 1 };
export function estimate(gen, Q, S, pIn) {
  const p = { ...P5_DEFAULTS, ...pIn };
  const m = { ...MFX0, ...(S.fx || {}) };
  const items = []; // {cat, block, bi, use, amount(만원), act: {block, bi, cat} 또는 floor 시점}
  const push = (cat, amount, ref) => { if (amount > 0) items.push({ cat, amount, ...ref }); };
  // 지반조사: 부지 면적·조사 일수 비례
  push('geo', gen.totals.lotArea * 0.25 * (m.surveyDays / 35) * (m.unc < 0.7 ? 1.5 : 1), { block: '*', acts: ['survey'] });
  // 블록: 지반 개량·차수·토공·흙막이·기초·지하
  gen.blocks.forEach(bl => { if (m.improveCost > 0) push('geo', bl.area * m.improveCost, { block: bl.id, acts: ['improve'] }); });
  Q.basements.forEach(bs => {
    if (m.waterCost > 0) push('geo', bs.retainWall * m.waterCost, { block: bs.block, acts: ['wall'] });
    push('earth', bs.volume * p.earth + bs.retainWall * p.retain * m.retainK / 0.85, { block: bs.block, acts: ['wall', 'earth'] });
    push('found', bs.foot * p.found * m.foundK, { block: bs.block, acts: ['found'] });
    push('base', bs.area * (p.structBase * m.concCostK + p.finBase + p.mepBase) * (bs.hB1 >= 7.5 ? 1.6 : 1) * (1 + (m.bwpK - 1) * 0.15), { block: bs.block, acts: ['base'], use: 'parking' });
  });
  // 동·층
  gen.bldgs.forEach((b, bi) => {
    if (b.kind === 'basement') return;
    const hr = 1 + p.highRise / 100 * Math.max(0, b.storeys - 30);
    const skinU = b.kind === 'landmark' ? p.skinLandmark : (b.kind === 'office' || b.kind === 'podium') ? p.skinOffice : b.kind === 'officetel' ? (p.skinRes + p.skinOffice) / 2 : p.skinRes;
    const X0 = b.floors.find(f => FLOOR_USES[f.use]);
    b.floors.forEach((f, fi) => {
      if (f.lv <= 0) return;
      const X = FLOOR_USES[f.use];
      if (X) {
        const cyl = b.shape === 'cyl' || b.shape === 'rack';
        push('struct', f.area * X.st * hr * (cyl ? 1 : m.structCostK / 1.05) * m.concCostK, { block: b.block, bi, fi, use: f.use });
        push('skin', Q.facadeOf(b, f) * X.sk * (cyl ? 1 : m.skinK / 0.85), { block: b.block, bi, acts: ['skin'], use: f.use });
        push('fin', f.area * X.fn * (1 - m.finSave * 0.3) * m.finK, { block: b.block, bi, acts: ['fin'], use: f.use });
        push('mep', f.area * X.mp * m.mepK, { block: b.block, bi, acts: ['mep'], use: f.use });
        if (X.eq) push('equip', f.area * X.eq, { block: b.block, bi, acts: ['mep', 'comm'], use: f.use });
        return;
      }
      const res = isRes(f.use) || (b.kind === 'apt' || b.kind === 'officetel');
      const st = (res ? p.structRes : p.structOffice) * (f.roof ? 1.3 : f.use === 'refuge' ? 1.25 : 1);
      push('struct', f.area * st * hr * m.structCostK / 1.05 * m.concCostK, { block: b.block, bi, fi, use: f.use });
      push('skin', Q.facadeOf(b, f) * (X0 ? 110 : skinU) * (b.kind === 'landmark' ? hr : 1) * m.skinK / 0.85, { block: b.block, bi, acts: ['skin'], use: f.use });
      const fin = f.use === 'res' ? p.finRes : f.use === 'officetel' ? p.finOfficetel : f.use === 'office' ? p.finOffice : f.use === 'mech' ? p.finBase : p.finRetail;
      push('fin', f.area * fin * m.finK, { block: b.block, bi, acts: ['fin'], use: f.use });
      push('mep', f.area * (res ? p.mepRes : p.mepOffice) * (f.use === 'mech' ? 1.8 : 1) * m.mepK, { block: b.block, bi, acts: ['mep'], use: f.use });
    });
    // 지붕 방수·마감 (만원/㎡ 지붕 면적)
    if (b.foot > 0) push('skin', b.foot * 9 * m.roofK, { block: b.block, bi, acts: ['skin'], use: (b.floors.filter(f => f.lv > 0).slice(-2)[0] || {}).use });
    push('lift', liftCount(b) * (p.liftBase + p.liftPerFl * b.storeys) * 1e4 * m.liftK, { block: b.block, bi, acts: ['comm'], use: b.kind === 'apt' ? 'res' : b.kind === 'officetel' ? 'officetel' : 'office' });
  });
  // 품질·안전 기술: 직접비의 일정 비율
  if (m.qaCostPct > 0) { const d0 = items.reduce((s2, x) => s2 + x.amount, 0); push('qa', d0 * m.qaCostPct / 100, { block: '*', acts: [] }); }
  gen.blocks.forEach(bl => {
    const ext = Math.max(0, bl.area - gen.bldgs.filter(x => x.block === bl.id && x.kind !== 'basement').reduce((s, x) => s + x.foot, 0));
    push('land', ext * p.landscape * m.landC, { block: bl.id, acts: ['land'] });
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
    if (s == null) { s = it.block === '*' && S.survey ? S.survey.start : 0; e = it.block === '*' && S.survey ? Math.max(S.survey.end, it.cat === 'qa' ? S.end : S.survey.end) : S.end; }
    const x = escAt((s + e) / 2);
    esc += it.amount * (x - 1);
    spread(it.amount, s, e, it.cat);
    spread(it.amount * (x - 1), s, e, 'esc');
  });
  // 간접비: 가설·공통은 직접비에 비례, 관리비·이윤·예비비도 비례, 설계·감리는 30%를 착공 전(0월)에
  const temp = direct * p.temp / 100 * (1 + (m.prepK - 1) * 0.3);
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
