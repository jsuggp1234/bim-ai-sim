// 4단계 공정(4D): 블록·동·층 단위 공정표
// 블록마다 가설 → 흙막이 → 굴토 → 기초 → 지하 골조, 동마다 지상 골조(층별 사이클) → 외장 → 설비·전기 → 마감 → 승강기·시운전 → 준공
// 작업일 달력: 월~금 1일, 토 0.5일, 일 0일. 장마(7월)·동절기(12~2월)에는 작업 효율을 낮춘다.

export const P4_DEFAULTS = {
  start: '2028-03',     // 건축 착공 (기반시설 2025.11 착공, 2027년 말 분양 목표 → 건축 착공 가정)
  order: 'supp',        // 착공 순서: supp(주거 먼저) | intl(랜드마크 먼저) | together(동시)
  phaseGap: 6,          // 존 사이 착공 간격(개월)
  blockGap: 1,          // 같은 존 블록 사이 착공 간격(개월)
  cycleRes: 6,          // 주거 기준층 골조 사이클(작업일)
  cycleOfficetel: 6,
  cycleOffice: 7,
  cycleLandmark: 5,     // 초고층 코어 선행 자동상승 거푸집
  cycleSpecial: 12,     // 1층·포디움·피난안전층·옥탑
  cycleBase: 22,        // 지하 1개 층 골조
  excavRate: 3500,      // 블록당 하루 굴토량(㎥)
  wallRate: 160,        // 흙막이 하루 시공 면적(㎡)
  winterLoss: 25,       // 동절기 작업 손실(%)
  rainLoss: 20,         // 장마 작업 손실(%)
  facadeLagFl: 8,       // 외장은 골조가 이 층수만큼 앞선 뒤 시작
  finishLagFl: 12,      // 마감은 골조가 이 층수만큼 앞선 뒤 시작
};
export const P4_META = {
  phaseGap: { label: '존 사이 착공 간격', unit: '개월', min: 0, max: 24, step: 1 },
  blockGap: { label: '블록 사이 착공 간격', unit: '개월', min: 0, max: 6, step: 0.5 },
  cycleRes: { label: '주거 기준층 사이클', unit: '일', min: 4, max: 10, step: 0.5, note: '알폼·갱폼 기준 5~7일' },
  cycleOffice: { label: '업무 기준층 사이클', unit: '일', min: 4, max: 12, step: 0.5 },
  cycleLandmark: { label: '랜드마크 기준층 사이클', unit: '일', min: 3, max: 10, step: 0.5, note: '코어 선행 자동상승 거푸집' },
  cycleBase: { label: '지하 1개 층 골조', unit: '일', min: 12, max: 40, step: 1 },
  excavRate: { label: '블록당 하루 굴토량', unit: '㎥', min: 1000, max: 8000, step: 100 },
  winterLoss: { label: '동절기 작업 손실', unit: '%', min: 0, max: 60, step: 1, note: '12~2월' },
  rainLoss: { label: '장마 작업 손실', unit: '%', min: 0, max: 60, step: 1, note: '7월' },
};

export const CATS = [
  { key: 'prep', name: '착공·가설', color: '--c-prep' },
  { key: 'wall', name: '흙막이', color: '--c-earth' },
  { key: 'earth', name: '굴토', color: '--c-earth' },
  { key: 'found', name: '기초', color: '--c-found' },
  { key: 'base', name: '지하 골조', color: '--c-struct' },
  { key: 'struct', name: '지상 골조', color: '--c-struct' },
  { key: 'skin', name: '외장', color: '--c-skin' },
  { key: 'mep', name: '설비·전기', color: '--c-mep' },
  { key: 'fin', name: '마감', color: '--c-fin' },
  { key: 'comm', name: '승강기·시운전·준공', color: '--c-comm' },
  { key: 'land', name: '조경·외부', color: '--c-land' },
];

const DAY = 86400000;
export function parseYM(s) { const [y, m] = String(s).split('-').map(Number); return new Date(Date.UTC(y || 2028, (m || 1) - 1, 1)); }
export const dateAt = (t0, d) => new Date(t0.getTime() + d * DAY);
export const ym = (dt) => `${dt.getUTCFullYear()}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;

// 작업일 누적표: cap[d] = 착공일부터 d일 전날까지의 작업일
function calendar(t0, p, days = 365 * 16) {
  const cap = new Float64Array(days + 1);
  for (let d = 0; d < days; d++) {
    const dt = new Date(t0.getTime() + d * DAY), wd = dt.getUTCDay(), mo = dt.getUTCMonth();
    let w = wd === 0 ? 0 : wd === 6 ? 0.5 : 1;
    if (mo === 11 || mo === 0 || mo === 1) w *= 1 - p.winterLoss / 100;
    if (mo === 6) w *= 1 - p.rainLoss / 100;
    cap[d + 1] = cap[d] + w;
  }
  // 시작일 s(달력일)에서 작업일 W를 마친 달력일
  const after = (s, W) => {
    if (W <= 0) return s;
    const goal = cap[Math.min(days, Math.max(0, Math.floor(s)))] + W;
    let lo = Math.floor(s), hi = days;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cap[m] >= goal) hi = m; else lo = m + 1; }
    return lo;
  };
  return { after, days };
}

const cycleOf = (b, f, p) => {
  if (f.roof) return p.cycleSpecial * 1.5;
  if (f.lv === 1 || f.use === 'refuge' || f.use === 'retail' || f.use === 'lobby') return p.cycleSpecial;
  if (b.kind === 'landmark') return p.cycleLandmark;
  if (f.use === 'res') return p.cycleRes;
  if (f.use === 'officetel') return p.cycleOfficetel;
  return p.cycleOffice;
};

export function schedule(gen, Q, pIn) {
  const p = { ...P4_DEFAULTS, ...pIn };
  const t0 = parseYM(p.start);
  const C = calendar(t0, p);
  const M = 30.44;
  // 블록 착공 순서
  const zoneOrder = p.order === 'intl' ? ['intl', 'mixed', 'supp'] : p.order === 'together' ? ['supp', 'mixed', 'intl'] : ['supp', 'mixed', 'intl'];
  const blocks = gen.blocks.filter(b => gen.bldgs.some(x => x.block === b.id && x.kind !== 'basement'));
  const startOf = new Map();
  zoneOrder.forEach((z, zi) => {
    const list = blocks.filter(b => b.zone === z).sort((a, b) => a.id.localeCompare(b.id));
    list.forEach((b, i) => startOf.set(b.id, Math.round(((p.order === 'together' ? 0 : zi * p.phaseGap) + i * p.blockGap) * M)));
  });
  const acts = [], blds = new Map(), bsum = [];
  const add = (a) => { acts.push(a); return a; };
  blocks.forEach(bl => {
    const s0 = startOf.get(bl.id);
    const base = Q.basements.find(x => x.block === bl.id);
    const prep = add({ block: bl.id, cat: 'prep', name: '착공·가설', start: s0, end: C.after(s0, 18) });
    const wall = add({ block: bl.id, cat: 'wall', name: '흙막이 (지하연속벽)', start: prep.end, end: C.after(prep.end, base ? base.retainWall / p.wallRate : 20) });
    const eS = C.after(prep.end, (wall.end - prep.end) * 0.45 / 1.3);
    const earth = add({ block: bl.id, cat: 'earth', name: '굴토·잔토 반출', start: eS, end: Math.max(wall.end, C.after(eS, base ? base.volume / p.excavRate : 20)) });
    const found = add({ block: bl.id, cat: 'found', name: '기초 매트', start: earth.end, end: C.after(earth.end, 25 + (base ? base.foot / 900 : 0)) });
    const bstr = add({ block: bl.id, cat: 'base', name: `지하 골조 B${base ? base.levels : 0}~B1`, start: found.end, end: C.after(found.end, (base ? base.levels : 2) * p.cycleBase) });
    let blockEnd = bstr.end;
    const towers = gen.bldgs.map((b, bi) => ({ b, bi })).filter(x => x.b.block === bl.id && x.b.kind !== 'basement')
      .sort((a, b) => (a.b.kind === 'podium') - (b.b.kind === 'podium') || b.b.storeys - a.b.storeys);
    towers.forEach(({ b, bi }, k) => {
      const st = C.after(bstr.end, k * 6); // 크레인 설치 간격
      const fl = b.floors.filter(f => f.lv > 0);
      const fEnd = [];
      let t = st;
      fl.forEach(f => { t = C.after(t, cycleOf(b, f, p)); fEnd.push(t); });
      const sEnd = t, F = fl.length;
      const at = (i) => fEnd[Math.max(0, Math.min(F - 1, i))];
      const lagF = Math.min(F - 1, p.facadeLagFl), lagM = Math.min(F - 1, p.finishLagFl);
      const skinS = b.kind === 'podium' ? sEnd : at(lagF - 1);
      const skinE = Math.max(C.after(sEnd, 35), C.after(skinS, F * 2.2));
      const mepS = at(Math.min(F - 1, 4)), mepE = C.after(sEnd, 85);
      const finS = b.kind === 'podium' ? C.after(sEnd, 20) : C.after(at(lagM - 1), 20), finE = Math.max(C.after(sEnd, 130), C.after(finS, F * 2.6));
      const commE = C.after(finE, b.kind === 'landmark' ? 110 : 70);
      const rec = { bi, id: b.id, block: bl.id, kind: b.kind, structStart: st, structEnd: sEnd, fEnd, floors: fl.map(f => b.floors.indexOf(f)), skinS, skinE, mepS, mepE, finS, finE, commS: finE, commE, F };
      blds.set(bi, rec);
      add({ block: bl.id, bi, bldg: b.id, cat: 'struct', name: `${b.id} 골조 ${F}층`, start: st, end: sEnd });
      add({ block: bl.id, bi, bldg: b.id, cat: 'skin', name: `${b.id} 외장`, start: skinS, end: skinE });
      add({ block: bl.id, bi, bldg: b.id, cat: 'mep', name: `${b.id} 설비·전기`, start: mepS, end: mepE });
      add({ block: bl.id, bi, bldg: b.id, cat: 'fin', name: `${b.id} 마감`, start: finS, end: finE });
      add({ block: bl.id, bi, bldg: b.id, cat: 'comm', name: `${b.id} 승강기·시운전·사용승인`, start: finE, end: commE });
      blockEnd = Math.max(blockEnd, commE);
    });
    const land = add({ block: bl.id, cat: 'land', name: '조경·외부 공사', start: Math.max(bstr.end, blockEnd - 200), end: blockEnd });
    bsum.push({ id: bl.id, zone: bl.zone, start: s0, baseEnd: bstr.end, topping: Math.max(...towers.map(x => blds.get(x.bi).structEnd)), end: Math.max(blockEnd, land.end), towers: towers.length });
  });
  const end = Math.max(...acts.map(a => a.end));
  // 날짜 t의 층 상태 (0 미착공 · 1 골조 · 2 외장 · 3 완료)
  function stateAt(t) {
    return (bi, fi) => {
      const r = blds.get(bi); if (!r) return 0;
      const i = r.floors.indexOf(fi); if (i < 0) return 0;
      const fe = r.fEnd[i], fs = i ? r.fEnd[i - 1] : r.structStart;
      if (t < fs) return 0;
      const k = (i + 0.5) / r.F;
      const skinAt = r.skinS + (r.skinE - r.skinS) * k, finAt = r.finS + (r.finE - r.finS) * k;
      if (t < Math.max(fe, skinAt)) return 1;
      if (t < Math.max(fe, finAt)) return 2;
      return 3;
    };
  }
  function cranesAt(t) {
    const out = [];
    blds.forEach(r => {
      if (r.kind === 'podium' || t < r.structStart - 20 || t > r.structEnd + 15) return;
      const b = gen.bldgs[r.bi];
      let h = 0; r.fEnd.forEach((fe, i) => { if (fe <= t) h = b.floors[r.floors[i]].y1; });
      out.push({ u: b.core.u, v: b.core.v, h: Math.max(h, 8), a: (r.bi * 1.7) % (Math.PI * 2) });
    });
    return out;
  }
  // 진행률: 층·동 단위
  function progressAt(t) {
    let total = 0, doneS = 0;
    blds.forEach(r => { total += r.F; r.fEnd.forEach(fe => { if (fe <= t) doneS++; }); });
    const active = acts.filter(a => a.start <= t && t < a.end);
    return { struct: total ? doneS / total : 0, active };
  }
  return { p, t0, acts, blds, blocks: bsum, end, months: Math.ceil(end / M), stateAt, cranesAt, progressAt, cal: C };
}
