// 4단계 공정(4D): 블록·동·층·공종 단위 공정표
// 블록: 착공·가설 → 흙막이 → 굴토 → 기초 매트 → 지하 골조(층별). 동: 층마다 거푸집·철근 → 타설(골조) → 설비 → 창호·외장 → 내부 마감 → 승강기·시운전 → 준공
// 후속 공종은 골조보다 정해진 층수만큼 뒤따르고(선행 층이 끝나야 그 층 작업 가능), 자기 속도로 한 층씩 올라간다.
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
  mepLagFl: 4,          // 설비는 골조가 이 층수만큼 앞선 뒤 그 층 시작
  facadeLagFl: 8,       // 창호·외장은 골조가 이 층수만큼 앞선 뒤 시작
  finishLagFl: 12,      // 내부 마감은 골조가 이 층수만큼 앞선 뒤 시작
  mepPerFl: 3,          // 설비 한 층 (작업일)
  winPerFl: 2.5,        // 창호·커튼월 한 층
  finPerFl: 4,          // 내부 마감 한 층
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
  mepLagFl: { label: '설비 후행 층수', unit: '층', min: 2, max: 12, step: 1, note: '골조보다 몇 층 아래에서 따라가는지' },
  facadeLagFl: { label: '창호·외장 후행 층수', unit: '층', min: 3, max: 20, step: 1 },
  finishLagFl: { label: '내부 마감 후행 층수', unit: '층', min: 5, max: 30, step: 1 },
  mepPerFl: { label: '설비 한 층', unit: '일', min: 1, max: 8, step: 0.5 },
  winPerFl: { label: '창호·커튼월 한 층', unit: '일', min: 1, max: 8, step: 0.5 },
  finPerFl: { label: '내부 마감 한 층', unit: '일', min: 1.5, max: 10, step: 0.5 },
};

// 층 상태 (3D 색·부재 표시)
export const FLOOR_STATES = [
  { k: 0, name: '미착공' },
  { k: 1, name: '거푸집·철근' },
  { k: 2, name: '골조 타설' },
  { k: 3, name: '설비 배관·덕트' },
  { k: 4, name: '창호·커튼월' },
  { k: 5, name: '내부 마감' },
  { k: 6, name: '준공' },
];
// 공정 세부 단계 (4D 화면 탭)
export const PHASES = [
  { key: 'prep', name: '착공·가설', cats: ['prep'], note: '가설 울타리·현장 사무실·진입로' },
  { key: 'wall', name: '흙막이', cats: ['wall'], note: '지하연속벽(CIP·SCW)으로 굴토 경계를 막음' },
  { key: 'earth', name: '굴토', cats: ['earth'], note: '버팀보를 걸며 단계별로 파 내려감' },
  { key: 'found', name: '기초', cats: ['found'], note: '매트 기초 철근·타설' },
  { key: 'base', name: '지하 골조', cats: ['base'], note: '최하층부터 B1 슬래브까지' },
  { key: 'struct', name: '지상 골조', cats: ['struct'], note: '층마다 거푸집·철근 → 타설. 코어 선행' },
  { key: 'mep', name: '설비', cats: ['mep'], note: '덕트·배관·전기 트레이·입상관' },
  { key: 'skin', name: '창호·외장', cats: ['skin'], note: '창호·커튼월 유닛·발코니 난간' },
  { key: 'fin', name: '내부 마감', cats: ['fin'], note: '경량벽·바닥·천장·도장' },
  { key: 'comm', name: '승강기·시운전', cats: ['comm'], note: '승강기 설치, 설비 시운전, 사용승인' },
  { key: 'land', name: '조경·외부', cats: ['land'], note: '포장·식재·외부 시설' },
];

export const CATS = [
  { key: 'prep', name: '착공·가설', color: '--c-prep' },
  { key: 'wall', name: '흙막이', color: '--c-earth' },
  { key: 'earth', name: '굴토', color: '--c-earth' },
  { key: 'found', name: '기초', color: '--c-found' },
  { key: 'base', name: '지하 골조', color: '--c-struct' },
  { key: 'struct', name: '지상 골조', color: '--c-struct' },
  { key: 'skin', name: '창호·외장', color: '--c-skin' },
  { key: 'mep', name: '설비·전기', color: '--c-mep' },
  { key: 'fin', name: '내부 마감', color: '--c-fin' },
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
  const zoneOrder = p.order === 'intl' ? ['intl', 'mixed', 'supp'] : ['supp', 'mixed', 'intl'];
  const blocks = gen.blocks.filter(b => gen.bldgs.some(x => x.block === b.id && x.kind !== 'basement'));
  const startOf = new Map();
  let zi = 0;
  zoneOrder.forEach(z => {
    const list = blocks.filter(b => b.zone === z).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    if (!list.length) return;
    list.forEach((b, i) => startOf.set(b.id, Math.round(((p.order === 'together' ? 0 : zi * p.phaseGap) + i * p.blockGap) * M)));
    zi++;
  });
  const acts = [], blds = new Map(), bsum = [], bstate = new Map();
  const add = (a) => { acts.push(a); return a; };
  blocks.forEach(bl => {
    const s0 = startOf.get(bl.id);
    const base = Q.basements.find(x => x.block === bl.id);
    const prep = add({ block: bl.id, cat: 'prep', name: '착공·가설 (울타리·현장 사무실)', start: s0, end: C.after(s0, 18) });
    const wall = add({ block: bl.id, cat: 'wall', name: '흙막이 (지하연속벽)', start: prep.end, end: C.after(prep.end, base ? base.retainWall / p.wallRate : 20) });
    const eS = C.after(prep.end, (wall.end - prep.end) * 0.45 / 1.3);
    const earth = add({ block: bl.id, cat: 'earth', name: '굴토·버팀보·잔토 반출', start: eS, end: Math.max(wall.end, C.after(eS, base ? base.volume / p.excavRate : 20)) });
    const found = add({ block: bl.id, cat: 'found', name: '기초 매트 (철근·타설)', start: earth.end, end: C.after(earth.end, 25 + (base ? base.foot / 900 : 0)) });
    const nB = base ? base.levels : 2;
    const baseFl = []; { let t = found.end; for (let k = 0; k < nB; k++) { t = C.after(t, p.cycleBase); baseFl.push(t); } }
    const bstr = add({ block: bl.id, cat: 'base', name: `지하 골조 B${nB}~B1`, start: found.end, end: baseFl[baseFl.length - 1] || found.end });
    let blockEnd = bstr.end;
    const towers = gen.bldgs.map((b, bi) => ({ b, bi })).filter(x => x.b.block === bl.id && x.b.kind !== 'basement')
      .sort((a, b) => (a.b.kind === 'podium') - (b.b.kind === 'podium') || b.b.storeys - a.b.storeys);
    towers.forEach(({ b, bi }, k) => {
      const st = C.after(bstr.end, k * 6); // 크레인 설치 간격
      const fl = b.floors.filter(f => f.lv > 0);
      const F = fl.length;
      const fEnd = [], fForm = [];
      let t = st;
      fl.forEach(f => { const c = cycleOf(b, f, p); fForm.push(C.after(t, c * 0.6)); t = C.after(t, c); fEnd.push(t); });
      const sEnd = t;
      const at = (i) => fEnd[Math.max(0, Math.min(F - 1, i))];
      // 후속 공종: 층 i는 골조가 i+lag층을 마친 뒤, 바로 아래층을 마친 뒤 시작
      const follow = (lag, per, extraStart = 0) => {
        const out = []; let prev = -Infinity;
        for (let i = 0; i < F; i++) {
          const ready = b.kind === 'podium' ? C.after(sEnd, extraStart) : C.after(at(i + Math.min(lag, F - 1)), extraStart);
          const s1 = Math.max(ready, prev);
          prev = C.after(s1, per * (fl[i].roof ? 1.5 : 1));
          out.push([s1, prev]);
        }
        return out;
      };
      const tMep = follow(p.mepLagFl, p.mepPerFl);
      const tWin = follow(p.facadeLagFl, p.winPerFl);
      const tFin = follow(p.finishLagFl, p.finPerFl, 10).map(([a, e], i) => { const s1 = Math.max(a, tWin[i][1], tMep[i][1]); return [s1, Math.max(e, C.after(s1, p.finPerFl))]; });
      for (let i = 1; i < F; i++) if (tFin[i][1] < tFin[i - 1][1]) tFin[i][1] = tFin[i - 1][1];
      const mepS = tMep[0][0], mepE = Math.max(tMep[F - 1][1], C.after(sEnd, 40));
      const skinS = tWin[0][0], skinE = Math.max(tWin[F - 1][1], C.after(sEnd, 30));
      const finS = tFin[0][0], finE = Math.max(tFin[F - 1][1], C.after(sEnd, 60));
      const commE = C.after(finE, b.kind === 'landmark' ? 110 : b.kind === 'podium' ? 40 : 70);
      const rec = { bi, id: b.id, block: bl.id, kind: b.kind, structStart: st, structEnd: sEnd, fEnd, fForm, tMep, tWin, tFin,
        floors: fl.map(f => b.floors.indexOf(f)), skinS, skinE, mepS, mepE, finS, finE, commS: finE, commE, F };
      blds.set(bi, rec);
      add({ block: bl.id, bi, bldg: b.id, cat: 'struct', name: `${b.id} 골조 ${F}층`, start: st, end: sEnd });
      add({ block: bl.id, bi, bldg: b.id, cat: 'mep', name: `${b.id} 설비·전기`, start: mepS, end: mepE });
      add({ block: bl.id, bi, bldg: b.id, cat: 'skin', name: `${b.id} 창호·외장`, start: skinS, end: skinE });
      add({ block: bl.id, bi, bldg: b.id, cat: 'fin', name: `${b.id} 내부 마감`, start: finS, end: finE });
      add({ block: bl.id, bi, bldg: b.id, cat: 'comm', name: `${b.id} 승강기·시운전·사용승인`, start: finE, end: commE });
      blockEnd = Math.max(blockEnd, commE);
    });
    const land = add({ block: bl.id, cat: 'land', name: '조경·외부 공사', start: Math.max(bstr.end, blockEnd - 200), end: blockEnd });
    bstate.set(bl.id, { prep, wall, earth, found, bstr, baseFl, land, nB });
    bsum.push({ id: bl.id, zone: bl.zone, start: s0, baseEnd: bstr.end, topping: Math.max(...towers.map(x => blds.get(x.bi).structEnd)), end: Math.max(blockEnd, land.end), towers: towers.length });
  });
  const end = Math.max(...acts.map(a => a.end));
  // 날짜 t의 층 상태: 0 미착공 · 1 거푸집·철근 · 2 골조 · 3 설비 · 4 창호·외장 · 5 내부 마감 · 6 준공
  function floorState(r, i, t) {
    const fs = i ? r.fEnd[i - 1] : r.structStart;
    if (t < fs) return 0;
    if (t >= r.commE) return 6;
    if (t < r.fEnd[i]) return 1;
    if (t >= r.tFin[i][0]) return 5;
    if (t >= r.tWin[i][0]) return 4;
    if (t >= r.tMep[i][0]) return 3;
    return 2;
  }
  function stateAt(t) {
    return (bi, fi) => {
      const r = blds.get(bi); if (!r) return 0;
      const i = r.floors.indexOf(fi); if (i < 0) return 0;
      return floorState(r, i, t);
    };
  }
  // 블록(지하·외부) 상태
  const frac = (a, t) => Math.max(0, Math.min(1, (t - a.start) / Math.max(1, a.end - a.start)));
  function blockStateAt(t) {
    const out = new Map();
    bstate.forEach((s, id) => {
      out.set(id, {
        fence: t >= s.prep.start && t < s.land.end, prep: frac(s.prep, t), wall: frac(s.wall, t), earth: frac(s.earth, t), found: frac(s.found, t),
        baseDone: s.baseFl.filter(x => x <= t).length, baseNow: t >= s.found.end && t < s.bstr.end, nB: s.nB, land: frac(s.land, t), started: t >= s.prep.start, done: t >= s.land.end,
      });
    });
    return out;
  }
  function cranesAt(t) {
    const out = [];
    blds.forEach(r => {
      if (r.kind === 'podium' || t < r.structStart - 20 || t > r.structEnd + 15) return;
      const b = gen.bldgs[r.bi];
      let h = 0; r.fEnd.forEach((fe, i) => { if (fe <= t) h = b.floors[r.floors[i]].y1; });
      out.push({ u: b.core.u, v: b.core.v, h: Math.max(h, 8), a: (r.bi * 1.7) % (Math.PI * 2), bi: r.bi });
    });
    return out;
  }
  // 진행률: 공종별 완료 층 비율
  function progressAt(t) {
    let total = 0; const done = { struct: 0, mep: 0, skin: 0, fin: 0 };
    blds.forEach(r => {
      total += r.F;
      for (let i = 0; i < r.F; i++) {
        if (r.fEnd[i] <= t) done.struct++;
        if (r.tMep[i][1] <= t) done.mep++;
        if (r.tWin[i][1] <= t) done.skin++;
        if (r.tFin[i][1] <= t) done.fin++;
      }
    });
    const active = acts.filter(a => a.start <= t && t < a.end);
    const k = (x) => (total ? x / total : 0);
    return { struct: k(done.struct), mep: k(done.mep), skin: k(done.skin), fin: k(done.fin), active };
  }
  // 세부 단계별 기간과 대표 시점(동시에 가장 많이 진행되는 날)
  const phases = PHASES.map(ph => {
    const list = acts.filter(a => ph.cats.includes(a.cat));
    if (!list.length) return { ...ph, start: 0, end: 0, peak: 0, n: 0 };
    const s1 = Math.min(...list.map(a => a.start)), e1 = Math.max(...list.map(a => a.end));
    // 가장 많이 겹치는 구간들 가운데 한가운데 날 (작업이 하나뿐이면 그 작업의 중간)
    const samp = [];
    for (let d = s1; d < e1; d += Math.max(2, (e1 - s1) / 160)) samp.push([d, list.filter(a => a.start <= d && d < a.end).length]);
    const best = Math.max(...samp.map(x => x[1])), top = samp.filter(x => x[1] === best);
    const peak = top.length ? top[Math.floor(top.length / 2)][0] : s1;
    return { ...ph, start: s1, end: e1, peak: Math.round(peak), n: list.length };
  });
  return { p, t0, acts, blds, blocks: bsum, end, months: Math.ceil(end / M), stateAt, blockStateAt, cranesAt, progressAt, phases, cal: C };
}
