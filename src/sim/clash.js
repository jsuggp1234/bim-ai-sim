// 공정 간섭 검토: 4D 공정(시간) × BIM 배치(공간)를 겹쳐 충돌을 찾고, 탐색 알고리즘으로 착공 시차·크레인 운용·후속 공종 간격을 최적화한다.
//  - 크레인: 동시에 도는 타워크레인 작업 반경이 겹치는 기간 (마스트가 상대 반경 안이면 높이 차로도 못 피함)
//  - 인접 굴착: 붙어 있는 블록을 같은 때 파는 기간 (지반 변위·지하수·장비 동선 중첩)
//  - 공종 적층: 같은 층에서 설비·창호가 겹치거나, 타설 중인 층 바로 아래에서 설비가 일하는 기간
//  - 물류: 블록 게이트·진입 도로의 하루 차량(덤프·레미콘·자재) 처리 한도 초과
//  - 소음: 주거 인접 현장에서 소음 작업(흙막이·굴착)이 여러 블록에서 동시에 도는 기간
import { schedule } from './process.js';

export const CLASH_TYPES = {
  crane: { name: '크레인 반경 간섭', en: 'CRANE', w: 1, note: '동시에 도는 크레인의 작업 반경이 겹치는 기간' },
  excav: { name: '인접 동시 굴착', en: 'EXCAV', w: 0.8, note: '붙어 있는 블록을 같은 때 파는 기간 (변위·지하수·장비 동선)' },
  stack: { name: '공종 적층', en: 'STACK', w: 0.3, note: '같은 층·바로 아래층에서 다른 공종이 겹쳐 일하는 기간' },
  truck: { name: '물류 차량 초과', en: 'LOGISTICS', w: 1.2, note: '게이트·진입 도로 하루 차량 처리 한도를 넘는 날' },
  noise: { name: '소음 작업 중첩', en: 'NOISE', w: 0.4, note: '주거 인접 현장에서 흙막이·굴착이 여러 블록 동시' },
};
const GATE_CAP = 300;      // 게이트 하나의 하루 차량 (대): 시간당 30~40대 × 9시간
const ROAD_CAP = 900;      // 진입 도로 하루 차량 (대) × √블록 수
const MOBILE = new Set(['crawler', 'mobile', 'ringer']);
const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function detect(gen, S, opt = {}) {
  const stagger = opt.stagger ?? false, noiseHigh = opt.noise === 'high';
  const list = [];
  const R = S.fx.craneR || 60;
  // ---------- 크레인 ----------
  // 타워형(고정 마스트): 상대 마스트가 내 반경 안이면 높이 차로도 피하기 어려운 '중대' 간섭
  // 이동식(크롤러·링거): 마스트가 없어 인양 구역 중첩만 본다 (인양 계획으로 풀 수 있는 '경미' 간섭)
  const mobile = MOBILE.has(S.fx.craneKind);
  const cr = [...S.blds.values()].filter(r => S.craneOK(r)).map(r => {
    const b = gen.bldgs[r.bi];
    const rr = Math.max(R * 0.6, Math.min(R, Math.sqrt(b.plate) * 0.75 + 12));
    return { r, b, u: b.core.u, v: b.core.v, R: rr, s: r.structStart - 20, e: r.structEnd + 15, h: b.height };
  });
  for (let i = 0; i < cr.length; i++) for (let j = i + 1; j < cr.length; j++) {
    const A = cr[i], B = cr[j];
    const days = ov(A.s, A.e, B.s, B.e); if (days < 1) continue;
    const d = Math.hypot(A.u - B.u, A.v - B.v);
    const reach = mobile ? (A.R + B.R) * 0.55 : A.R + B.R;
    if (d >= reach) continue;
    const hard = !mobile && d < Math.max(A.R, B.R) * 0.92;
    const mit = !hard && stagger;
    list.push({ type: 'crane', a: A.b.id, b: B.b.id, block: A.b.block, start: Math.max(A.s, B.s), end: Math.min(A.e, B.e), days, sev: hard ? 3 : mobile ? 1 : 2, mit,
      msg: mobile ? `${A.b.id} ↔ ${B.b.id} 크레인 인양 구역 겹침 (간격 ${Math.round(d)}m)` : `${A.b.id} ↔ ${B.b.id} 크레인 반경 겹침 (마스트 거리 ${Math.round(d)}m, 반경 ${Math.round(A.R)}·${Math.round(B.R)}m)`,
      fix: hard ? '두 동 골조 착수 시차를 벌리거나 한 대를 러핑 크레인으로' : mobile ? '인양 시간대 분리 (일일 인양 계획)' : '지브 높이 차 6m 이상 + 충돌 방지 장치' });
  }
  // ---------- 인접 동시 굴착 ----------
  const earth = S.acts.filter(a => a.cat === 'earth');
  const lotOf = (id) => { const L = gen.plan.blockById.get(id); return L ? L.lot : null; };
  for (let i = 0; i < earth.length; i++) for (let j = i + 1; j < earth.length; j++) {
    const A = earth[i], B = earth[j];
    const days = ov(A.start, A.end, B.start, B.end); if (days < 3) continue;
    const LA = lotOf(A.block), LB = lotOf(B.block); if (!LA || !LB) continue;
    const gap = Math.max(LA.u0 - LB.u1, LB.u0 - LA.u1, LA.v0 - LB.v1, LB.v0 - LA.v1, 0);
    if (gap > 45) continue;
    list.push({ type: 'excav', a: A.block, b: B.block, block: A.block, start: Math.max(A.start, B.start), end: Math.min(A.end, B.end), days, sev: gap < 25 ? 3 : 2, mit: false,
      msg: `${A.block}·${B.block} 블록 동시 굴착 (획지 간격 ${Math.round(gap)}m)`, fix: '한 블록 굴착을 다른 블록 기초 타설 뒤로 미루기' });
  }
  // ---------- 공종 적층 ----------
  S.blds.forEach(r => {
    if (r.F < 6) return;
    let same = 0, below = 0, floors = 0;
    for (let i = 0; i < r.F; i++) {
      const o = ov(r.tMep[i][0], r.tMep[i][1], r.tWin[i][0], r.tWin[i][1]);
      if (o > 0.5) { same += o; floors++; }
      const up = r.fEnd[Math.min(r.F - 1, i + 2)];
      if (r.tMep[i][0] < up) below += Math.min(up - r.tMep[i][0], r.tMep[i][1] - r.tMep[i][0]);
    }
    const days = same + below * 0.5;
    if (days < 4) return;
    list.push({ type: 'stack', a: r.id, b: null, block: r.block, start: r.mepS, end: r.finS, days, sev: below > same ? 2 : 1, mit: false, floors,
      msg: `${r.id} 같은 층 설비·창호 겹침 ${floors}개 층${below > 1 ? ', 타설층 바로 아래 설비 작업' : ''}`, fix: '설비·창호 후행 층수를 1~2층 늘리거나 택트 구역 분할' });
  });
  // ---------- 물류 (하루 차량) ----------
  // 굴착 덤프(10㎥/대, 부풀음 1.25) · 매트 타설 레미콘(6㎥/대, 하루 pourCap까지) · 층 타설 · 자재 반입
  const D = Math.ceil(S.end) + 2;
  const blocks = S.blocks.map(b => b.id);
  const dem = new Map(blocks.map(id => [id, new Float32Array(D)]));
  const addSpan = (arr, s, e, perDay) => { for (let t = Math.max(0, Math.floor(s)); t < Math.min(D, Math.ceil(e)); t++) arr[t] += perDay; };
  const addDay = (arr, t, n) => { t = Math.floor(t); if (t >= 0 && t < D) arr[t] += n; };
  const pourCap = S.p.pourCap || 2500;
  const baseOf = (id) => gen.bldgs.find(x => x.block === id && x.kind === 'basement');
  S.acts.forEach(a => {
    const arr = dem.get(a.block); if (!arr) return;
    const len = Math.max(1, a.end - a.start);
    if (a.cat === 'earth') { const bs = baseOf(a.block); const vol = bs ? bs.plate * bs.floors.reduce((s, f) => s + f.h, 0) * 1.25 : 3000; addSpan(arr, a.start, a.end, vol / 10 / len); }
    else if (a.cat === 'found') {
      const n = a.pourDays || 0;
      if (n) { const w = (a.end - a.start) * 0.6, step = w / n; for (let k = 0; k < n; k++) addDay(arr, a.end - w + k * step, Math.min(pourCap, a.matVol - k * pourCap) / 6); }
      addSpan(arr, a.start, a.end, 8);
    }
    else if (a.cat === 'base') { const bs = baseOf(a.block); addSpan(arr, a.start, a.end, bs ? Math.min(160, bs.plate * 0.5 * (bs.basementLv || 1) / 6 / len * 3) : 10); }
    else if (a.cat === 'struct') addSpan(arr, a.start, a.end, 6);
    else if (a.cat === 'skin' || a.cat === 'mep') addSpan(arr, a.start, a.end, 3);
    else if (a.cat === 'fin') addSpan(arr, a.start, a.end, 3);
    else if (a.cat === 'wall') addSpan(arr, a.start, a.end, 14);
  });
  // 층 타설: 층 사이클 마지막 날들에 콘크리트 (철골조는 데크 슬래브만)
  const steelish = ['steel', 'hybrid', 'src', 'pc'].includes(S.fx.frame);
  S.blds.forEach(r => {
    const arr = dem.get(r.block); if (!arr) return;
    const b = gen.bldgs[r.bi];
    r.floors.forEach((fi, i) => {
      const f = b.floors[fi];
      const vol = f.area * (steelish || b.shape === 'rack' ? 0.16 : 0.38);
      const n = Math.max(1, Math.ceil(vol / pourCap));
      for (let k = 0; k < n; k++) addDay(arr, r.fEnd[i] - 1 - k, Math.min(pourCap, vol - k * pourCap) / 6);
    });
  });
  const gates = new Map(blocks.map(id => { const L = gen.plan.blockById.get(id); const A = L && L.lot ? (L.lot.u1 - L.lot.u0) * (L.lot.v1 - L.lot.v0) : 20000; return [id, Math.max(1, Math.round(Math.sqrt(A / 25000)))]; }));
  // 한도를 넘는 날들을 한 건으로 묶는다 (7일 안에 다시 넘으면 같은 건)
  const runs = (arr, cap) => {
    const out = []; let cur = null;
    for (let t = 0; t < D; t++) {
      if (arr[t] > cap) {
        if (cur && t - cur.last <= 7) { cur.last = t; cur.n++; cur.peak = Math.max(cur.peak, arr[t]); }
        else { cur = { s: t, last: t, n: 1, peak: arr[t] }; out.push(cur); }
      }
    }
    return out;
  };
  const site = new Float32Array(D);
  dem.forEach((arr, id) => {
    for (let t = 0; t < D; t++) site[t] += arr[t];
    const cap = GATE_CAP * gates.get(id);
    runs(arr, cap).forEach(r => list.push({ type: 'truck', a: id, b: null, block: id, start: r.s, end: r.last + 1, days: r.n, sev: r.peak > cap * 1.6 ? 3 : 2, mit: false, peak: Math.round(r.peak), cap,
      msg: `${id} 게이트 하루 최대 ${Math.round(r.peak)}대, 한도 초과 ${r.n}일 (게이트 ${gates.get(id)}곳 · ${cap}대/일)`, fix: '매트 타설 하루 물량을 줄여 분할, 굴착 반출을 다른 블록과 엇갈리게' }));
  });
  const roadCap = Math.round(ROAD_CAP * Math.max(1, Math.sqrt(blocks.length)));
  runs(site, roadCap).forEach(r => list.push({ type: 'truck', a: '진입 도로', b: null, block: '*', start: r.s, end: r.last + 1, days: r.n, sev: r.peak > roadCap * 1.3 ? 3 : 2, mit: false, peak: Math.round(r.peak), cap: roadCap,
    msg: `진입 도로 하루 최대 ${Math.round(r.peak)}대, 한도 초과 ${r.n}일 (${roadCap}대/일)`, fix: '블록 착공 시차 조정, 공사용 임시 진입로 추가' }));
  // ---------- 소음 ----------
  if (noiseHigh) {
    const noisy = S.acts.filter(a => a.cat === 'wall' || a.cat === 'earth');
    const cnt = new Uint8Array(D);
    const seen = new Map();
    noisy.forEach(a => { const k = a.block; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(a); });
    seen.forEach(arr => { const s = Math.min(...arr.map(a => a.start)), e = Math.max(...arr.map(a => a.end)); for (let t = Math.max(0, Math.floor(s)); t < Math.min(D, e); t++) cnt[t]++; });
    let run = null;
    const nMax = Math.max(3, Math.round(Math.sqrt(blocks.length)));
    for (let t = 0; t < D; t++) { const over = cnt[t] >= nMax; if (over && !run) run = { s: t, n: cnt[t] }; if (over && run) run.n = Math.max(run.n, cnt[t]); if ((!over || t === D - 1) && run) { const days = t - run.s; if (days >= 5) list.push({ type: 'noise', a: '주변 주거', b: null, block: '*', start: run.s, end: t, days, sev: 2, mit: false, n: run.n, msg: `흙막이·굴착 ${run.n}개 블록 동시 (주거 인접)`, fix: '소음 작업 블록 수를 2개 이하로, 저소음 공법' }); run = null; } }
  }
  return summarize(list, S, D, site, dem);
}

function summarize(list, S, D, site, dem) {
  const byType = {};
  Object.keys(CLASH_TYPES).forEach(k => { byType[k] = { n: 0, days: 0, hard: 0, mit: 0 }; });
  let score = 0;
  list.forEach(c => {
    const T = byType[c.type]; T.n++; T.days += c.days; if (c.sev >= 3) T.hard++; if (c.mit) T.mit++;
    c.cost = CLASH_TYPES[c.type].w * c.days * (c.mit ? 0.04 : c.sev >= 3 ? 1 : c.sev === 2 ? 0.3 : 0.12);
    score += c.cost;
  });
  // 월별 활성 충돌 수
  const M = 30.44, NM = Math.ceil(D / M);
  const monthly = new Array(NM).fill(0).map(() => ({}));
  list.forEach(c => { for (let m = Math.floor(c.start / M); m <= Math.min(NM - 1, Math.floor(c.end / M)); m++) monthly[m][c.type] = (monthly[m][c.type] || 0) + 1; });
  const truckMonthly = new Array(NM).fill(0);
  for (let t = 0; t < D; t++) { const m = Math.floor(t / M); truckMonthly[m] = Math.max(truckMonthly[m], site[t]); }
  list.sort((a, b) => b.sev - a.sev || b.days - a.days);
  return { list, byType, score: Math.round(score), monthly, truckMonthly, n: list.length, nHard: list.filter(c => c.sev >= 3 && !c.mit).length };
}

// 목적 함수: 공기(일) + 가중 충돌 일수
// 충돌 비용 1 = 공기 0.3일로 환산, 기준 공기보다 보름 넘게 늘면 하루당 3배 벌점 (공기를 희생해 충돌만 줄이는 해를 막음)
export const objective = (S, C, end0 = S.end) => S.end + 0.3 * C.score + 3 * Math.max(0, S.end - end0 - 15);

// 최적화: 블록 착공 시차·동 착수 간격·후속 공종 간격을 바꿔 가며 목적 함수를 줄인다 (모의 담금질)
// 비동기로 조금씩 돌며 onStep으로 진행을 알린다. solve(0~1): 공정관리 기법의 탐색 역량 → 반복 횟수
export function optimize(gen, Q, pp, { solve = 1, noise = 'mid', onStep, seed = 7 } = {}) {
  let rnd = seed; const rand = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };
  const iters = Math.round(14 + 90 * solve);
  const blocks = gen.blocks.filter(b => gen.bldgs.some(x => x.block === b.id && x.kind !== 'basement')).map(b => b.id);
  const POUR = [2500, 1800, 1200];
  let end0 = null;
  const evalX = (x) => {
    const S = schedule(gen, Q, { ...pp, offsets: x.offsets, towerGap: x.towerGap, pourCap: POUR[x.pour], mepLagFl: (pp.mepLagFl ?? 4) + x.lagAdd, facadeLagFl: (pp.facadeLagFl ?? 8) + x.lagAdd });
    const C = detect(gen, S, { stagger: x.stagger, noise });
    if (end0 == null) end0 = S.end;
    return { S, C, f: objective(S, C, end0) };
  };
  const x0 = { offsets: Object.fromEntries(blocks.map(id => [id, 0])), towerGap: pp.towerGap ?? null, lagAdd: 0, stagger: false, pour: 0 };
  const r0 = evalX(x0);
  let cur = { x: x0, ...r0 }, best = cur;
  const history = [{ i: 0, f: r0.f, months: r0.S.months, score: r0.C.score, n: r0.C.n, best: r0.f }];
  let i = 0, T = Math.max(10, r0.f * 0.015);
  const gap0 = (x) => x.towerGap ?? 6;
  return new Promise((resolve) => {
    const step = () => {
      const t0 = performance.now();
      while (i < iters && performance.now() - t0 < 24) {
        i++;
        const x = { ...cur.x, offsets: { ...cur.x.offsets } };
        const mv = rand();
        if (i === 1 && solve >= 0.45) x.stagger = true;                         // 크레인 높이 차·인양 시간 분리 계획
        else if (i === 2 && solve >= 0.3) x.pour = 1;                          // 매트 분할 타설
        else if (mv < 0.5 && blocks.length) { const id = blocks[Math.floor(rand() * blocks.length)]; x.offsets[id] = Math.max(-360, Math.min(540, x.offsets[id] + (rand() < 0.5 ? -1 : 1) * (15 + Math.floor(rand() * 4) * 15))); }
        else if (mv < 0.7) x.towerGap = Math.max(2, Math.min(40, gap0(x) + (rand() < 0.5 ? -2 : 3)));
        else if (mv < 0.85) x.lagAdd = Math.max(-1, Math.min(4, x.lagAdd + (rand() < 0.5 ? -1 : 1)));
        else x.pour = Math.max(0, Math.min(2, x.pour + (rand() < 0.5 ? -1 : 1)));
        const r = evalX(x);
        const dF = r.f - cur.f;
        if (dF < 0 || rand() < Math.exp(-dF / T)) cur = { x, ...r };
        if (cur.f < best.f) best = cur;
        T *= 0.955;
        history.push({ i, f: r.f, months: r.S.months, score: r.C.score, n: r.C.n, best: best.f });
      }
      if (onStep) onStep({ i, iters, history, best });
      if (i < iters) setTimeout(step, 0);
      else resolve({ before: { x: x0, ...r0 }, after: best, history, iters, end0, POUR });
    };
    step();
  });
}

// 최적화 결과를 사람이 읽는 조치 목록으로
export function describeMoves(O, gen) {
  const a = O.after.x, out = [];
  if (a.stagger) out.push({ k: 'crane', t: '크레인 높이 차·인양 시간 분리', d: '이웃 크레인 지브 높이를 6m 이상 엇갈리고 충돌 방지 장치 연동 (경미 반경 간섭 해소)' });
  if (a.pour) out.push({ k: 'truck', t: `매트 하루 타설 ${O.POUR[0].toLocaleString()} → ${O.POUR[a.pour].toLocaleString()}㎥`, d: '레미콘 피크를 게이트 한도 아래로 분할 타설' });
  const sh = Object.entries(a.offsets).filter(([, v]) => Math.abs(v) >= 15).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  if (sh.length) out.push({ k: 'excav', t: `블록 착공 시차 ${sh.length}곳 조정`, d: sh.slice(0, 6).map(([id, v]) => `${id} ${v > 0 ? '+' : ''}${Math.round(v / 30.44 * 10) / 10}개월`).join(' · ') + (sh.length > 6 ? ' …' : '') });
  if (a.towerGap != null && a.towerGap !== 6) out.push({ k: 'crane', t: `같은 블록 동 착수 간격 ${a.towerGap}일`, d: a.towerGap > 6 ? '크레인·인력 동시 투입 피크를 낮춤' : '동시 착수로 공기 단축' });
  if (a.lagAdd) out.push({ k: 'stack', t: `후속 공종 간격 ${a.lagAdd > 0 ? '+' : ''}${a.lagAdd}개 층`, d: a.lagAdd > 0 ? '설비·창호가 타설층 바로 아래에서 겹치지 않게' : '여유를 줄여 공기 단축' });
  return out;
}
