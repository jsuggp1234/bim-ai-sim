import { FLOOR_USES } from './uses.js';
// 4단계 공정(4D): 블록·동·층·공종 단위 공정표
// 블록: 착공·가설 → 흙막이 → 굴토 → 기초 매트 → 지하 골조(층별). 동: 층마다 거푸집·철근 → 타설(골조) → 설비 → 창호·외장 → 내부 마감 → 승강기·시운전 → 준공
// 후속 공종은 골조보다 정해진 층수만큼 뒤따르고(선행 층이 끝나야 그 층 작업 가능), 자기 속도로 한 층씩 올라간다.
// 작업일 달력: 월~금 1일, 토 0.5일(민간) 또는 0일(공공 주 5일), 일·공휴일 0일. 장마철(6~9월)·동절기(12~2월)에는 작업 효율을 낮춘다.
//
// 2026.11 실제 준공 현장(산군 현장DB, 착공일→사용승인일)과 맞춰 보정한 점 — 자세한 값은 bench.js
//  · 굴착 속도: 터 넓이(장비 조 수)와 깊이에 따라 달라진다. 예전에는 블록마다 하루 3,500㎥ 고정
//  · 지하 골조: 넓은 층은 구역을 나눠 치므로 한 층이 오래 걸린다. 단지형은 동 자리 지하를 먼저 올리고 주차장 구간이 뒤따른다
//  · 지상 골조: 넓은 층(물류·공장·포디움)은 층 넓이에 따라 길어진다
//  · 공법 효과: 여러 공법의 단축·지연 배수를 그대로 곱하면 실제에 없는 속도(층당 4일)나 느림이 나온다. 겹친 배수는 40%만 반영한다 (soft)
//  · 설비·마감: 한 층에 여러 공종이 차례로 들어가는 기간(리드타임)을 따로 둔다. 예전에는 골조가 끝나고 석 달 안에 마감이 끝났다
//  · 달력: 공휴일, 6·8·9월 비, 발주 방식(민간/공공)

export const P4_DEFAULTS = {
  start: '2028-03',     // 건축 착공 (기반시설 2025.11 착공, 2027년 말 분양 목표 → 건축 착공 가정)
  order: 'supp',        // 착공 순서: supp(주거 먼저) | intl(랜드마크 먼저) | together(동시)
  phaseGap: 6,          // 존 사이 착공 간격(개월)
  blockGap: 1,          // 같은 존 블록 사이 착공 간격(개월)
  owner: 'private',     // 발주: private 민간(토요일 반일) | public 공공(주 5일·표준 공기 여유)
  sat: 50,              // 토요일 작업 비율(%) — 공공 발주는 0으로 본다
  holiday: 1,           // 공휴일 쉼 (1 쉼, 0 작업)
  cycleRes: 6,          // 주거 기준층 골조 사이클(작업일)
  cycleOfficetel: 6,
  cycleOffice: 7,
  cycleLandmark: 5,     // 초고층 코어 선행 자동상승 거푸집
  cycleSpecial: 12,     // 1층·포디움·피난안전층·옥탑
  cycleBase: 22,        // 지하 1개 층 골조
  excavRate: 3500,      // 블록당 하루 굴토량 상한(㎥) — 실제 속도는 터 넓이·깊이로 정해진다
  wallRate: 160,        // 흙막이 하루 시공 면적(㎡)
  winterLoss: 25,       // 동절기 작업 손실(%)
  rainLoss: 20,         // 장마 작업 손실(%)
  mepLagFl: 4,          // 설비는 골조가 이 층수만큼 앞선 뒤 그 층 시작
  facadeLagFl: 8,       // 창호·외장은 골조가 이 층수만큼 앞선 뒤 시작
  finishLagFl: 12,      // 내부 마감은 골조가 이 층수만큼 앞선 뒤 시작
  mepPerFl: 3,          // 설비 한 층 (작업일)
  winPerFl: 2.5,        // 창호·커튼월 한 층
  finPerFl: 4,          // 내부 마감 한 층 (다음 층으로 넘어가는 간격)
  finLeadK: 100,        // 한 층 마감이 끝나기까지 걸리는 기간 보정(%) — 100이면 용도별 기준값
};
export const P4_META = {
  phaseGap: { label: '존 사이 착공 간격', unit: '개월', min: 0, max: 24, step: 1 },
  blockGap: { label: '블록 사이 착공 간격', unit: '개월', min: 0, max: 6, step: 0.5 },
  cycleRes: { label: '주거 기준층 사이클', unit: '일', min: 4, max: 10, step: 0.5, note: '알폼·갱폼 기준 5~7일' },
  cycleOffice: { label: '업무 기준층 사이클', unit: '일', min: 4, max: 12, step: 0.5 },
  cycleLandmark: { label: '랜드마크 기준층 사이클', unit: '일', min: 3, max: 10, step: 0.5, note: '코어 선행 자동상승 거푸집' },
  cycleBase: { label: '지하 1개 층 골조', unit: '일', min: 12, max: 40, step: 1 },
  excavRate: { label: '블록당 하루 굴토량 상한', unit: '㎥', min: 1000, max: 8000, step: 100, note: '터 2,500㎡마다 굴착 1조(하루 650㎥), 8m보다 깊으면 느려짐' },
  sat: { label: '토요일 작업', unit: '%', min: 0, max: 100, step: 10, note: '민간 50(반일), 공공 주 5일은 0' },
  finLeadK: { label: '층 마감 기간 보정', unit: '%', min: 60, max: 160, step: 5, note: '한 층에 조적·미장·타일·수장·가구가 차례로 들어가 끝나는 기간' },
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
  { key: 'survey', name: '지반조사', cats: ['survey'], note: '시추·탐사로 지층·지하수 확인 (4단계에서 고른 조사 방법)' },
  { key: 'improve', name: '지반 개량', cats: ['improve'], note: '연약층 압밀·고결 (연약 지반에서만)' },
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
  { key: 'survey', name: '지반조사', color: '--c-prep' },
  { key: 'improve', name: '지반 개량', color: '--c-earth' },
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
// 공법 배수를 겹쳐 곱한 값은 40%만 반영 (1에서 벗어난 만큼의 40%). 모듈러처럼 공법 자체가 다른 경우는 호출하는 쪽에서 따로 다룬다.
// 이 비율에서 전통 공법 기준선은 실제 현장의 중앙값, 추천 공법 묶음은 실제 현장의 빠른 쪽 끝에 놓인다 (bench.js로 확인)
export const soft = (k) => 1 + ((k ?? 1) - 1) * 0.4;
// 공법 효과 기본값 (공법 단계를 거치지 않았을 때: 전통 공법 묶음과 같은 값)
export const FX_DEFAULT = { surveyDays: 35, unc: 1, improveDays: 0, wallRate: 150, excavK: 0.85, baseCycK: 1, overlap: 0, waterDays: 25, foundDaysK: 1.1, structCycK: 1.15,
  coreAhead: false, winterK: 1, craneR: 60, skinCycK: 1.15, mepCycK: 1.13, finSave: 0, lagCut: 0,
  prepDays: 18, pourCap: 1, hoistK: 1, finCycK: 1.1, roofDays: 25, commK: 1, landK: 1 };
export function parseYM(s) { const [y, m] = String(s).split('-').map(Number); return new Date(Date.UTC(y || 2028, (m || 1) - 1, 1)); }
export const dateAt = (t0, d) => new Date(t0.getTime() + d * DAY);
export const ym = (dt) => `${dt.getUTCFullYear()}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;

// 작업일 누적표: cap[d] = 착공일부터 d일 전날까지의 작업일
// 공휴일: 양력 고정일 + 설·추석 연휴·부처님오신날은 해마다 달라 평균 시기로 둔다 (한 해 16일)
const HOLIDAYS = new Set(['1-1', '2-5', '2-6', '2-7', '3-1', '5-1', '5-5', '5-15', '6-6', '8-15', '9-24', '9-25', '9-26', '10-3', '10-9', '12-25']);
// 공공 발주 표준 공기 여유: 산군 실적에서 공공 아파트(LH·SH 41.8~43.5개월)가 비슷한 규모 민간(32~36개월)보다 약 1.2~1.3배 길다.
// 주 5일(토요일 없음)로 1.10배, 나머지 1.10배를 작업일 여유로 본다 (전통 공법 기준선 × 1.21 = LH 계약 공기)
export const PUBLIC_K = 1.1;
// 달별 날씨 손실(0~1): 동절기 12~2월, 장마 7월, 그 앞뒤 6·8·9월, 나머지 달은 비 오는 날 4%
export function weatherLoss(mo, p) {
  if (mo === 11 || mo === 0 || mo === 1) return Math.min(0.9, p.winterLoss / 100 * (p.winterK || 1));
  const r = p.rainLoss / 100;
  if (mo === 6) return r;
  if (mo === 7) return r * 0.7;
  if (mo === 5 || mo === 8) return r * 0.4;
  return Math.min(0.04, r);
}
function calendar(t0, p, days = 365 * 20) {
  const cap = new Float64Array(days + 1);
  const pub = p.owner === 'public', sat = pub ? 0 : Math.max(0, Math.min(1, (p.sat ?? 50) / 100)), k = pub ? 1 / PUBLIC_K : 1;
  for (let d = 0; d < days; d++) {
    const dt = new Date(t0.getTime() + d * DAY), wd = dt.getUTCDay(), mo = dt.getUTCMonth();
    let w = wd === 0 ? 0 : wd === 6 ? sat : 1;
    if (p.holiday !== 0 && HOLIDAYS.has((mo + 1) + '-' + dt.getUTCDate())) w = 0;
    w *= (1 - weatherLoss(mo, p)) * k;
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
  // 한 해 평균: 달력 한 주에 작업일이 며칠인지 (화면 설명용)
  const perWeek = (cap[Math.min(days, 3653)] - cap[0]) / (Math.min(days, 3653) / 7);
  return { after, days, perWeek };
}

// 한 층에 설비·마감 공종이 차례로 들어가 끝나기까지 걸리는 작업일(리드타임). 설치 물량이 많은 용도일수록 길다
// 주거: 조적·미장·방수·타일·수장·도배·가구 → 115일, 업무: 85일, 그 밖의 용도는 마감·설비 단가(물량)에서 구한다
export function leadDays(b, fl) {
  const tally = new Map();
  fl.forEach(f => { if (!f.roof) tally.set(f.use, (tally.get(f.use) || 0) + (f.area || 0)); });
  let use = null, best = -1; tally.forEach((a, u) => { if (FLOOR_USES[u] && a > best) { best = a; use = u; } });
  const X = use ? FLOOR_USES[use] : null;
  if (X && best > 0 && (!['admin'].includes(use) || !['apt', 'officetel', 'office', 'landmark', 'podium'].includes(b.kind))) {
    return { fin: Math.max(40, Math.min(190, 35 + 0.42 * (X.fn + X.mp * 0.5 + (X.eq || 0) * 0.12))), mep: Math.max(14, Math.min(80, 12 + 0.12 * X.mp)), use };
  }
  if (b.kind === 'landmark') return { fin: 95, mep: 26, use: 'office' };
  if (b.kind === 'office') return { fin: 85, mep: 24, use: 'office' };
  if (b.kind === 'podium') return { fin: 70, mep: 22, use: 'retail' };
  if (b.kind === 'officetel') return { fin: 110, mep: 20, use: 'officetel' };
  return { fin: 115, mep: 20, use: 'res' };
}

const cycleOf = (b, f, p) => {
  const X = FLOOR_USES[f.use];
  if (X && !['admin'].includes(f.use)) return X.cyc;
  if (f.roof) return p.cycleSpecial * 1.5;
  if (f.lv === 1 || f.use === 'refuge' || f.use === 'retail' || f.use === 'lobby') return p.cycleSpecial;
  if (b.kind === 'landmark') return p.cycleLandmark;
  if (f.use === 'res') return p.cycleRes;
  if (f.use === 'officetel') return p.cycleOfficetel;
  return p.cycleOffice;
};

// 매트 두께(m): 고층·중량 설비가 얹히는 블록일수록 두껍다
function d_matT(gen, blockId) {
  let top = 0, heavy = false;
  gen.bldgs.forEach(b => { if (b.block === blockId && b.kind !== 'basement') { top = Math.max(top, b.storeys || 0); if (['fab', 'dhall', 'turbine', 'tank', 'hrsg'].includes(b.kind)) heavy = true; } });
  return heavy ? 1.8 : top >= 40 ? 2.6 : top >= 20 ? 1.8 : 1.2;
}

export function schedule(gen, Q, pIn) {
  const p = { ...P4_DEFAULTS, ...pIn };
  const fx = { ...FX_DEFAULT, ...(p.fx || {}) };
  p.winterK = fx.winterK;
  const t0 = parseYM(p.start);
  const C = calendar(t0, p);
  const M = 30.44;
  const lag = (v) => Math.max(2, v - (fx.lagCut || 0) * 2);
  // 블록 착공 순서: 주거 생성기는 존(supp·mixed·intl), 다른 용도는 생성기가 정한 순서
  const zoneOrder = gen.zoneOrder ? [...gen.zoneOrder, ...Object.keys(gen.zones || {}).filter(z => !gen.zoneOrder.includes(z))]
    : p.order === 'intl' ? ['intl', 'mixed', 'supp'] : ['supp', 'mixed', 'intl'];
  const blocks = gen.blocks.filter(b => gen.bldgs.some(x => x.block === b.id && x.kind !== 'basement'));
  const acts = [], blds = new Map(), bsum = [], bstate = new Map();
  const add = (a) => { acts.push(a); return a; };
  // 지반조사: 부지 전체 (착공 전 설계 확정 단계와 겹침)
  const survey = add({ block: '*', cat: 'survey', name: '지반조사 (시추·시험·지층 모델)', start: 0, end: Math.round(fx.surveyDays * 1.4) });
  const startOf = new Map();
  let zi = 0;
  zoneOrder.forEach(z => {
    const list = blocks.filter(b => b.zone === z).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    if (!list.length) return;
    list.forEach((b, i) => startOf.set(b.id, Math.max(survey.end, survey.end + Math.round(((p.order === 'together' ? 0 : zi * p.phaseGap) + i * p.blockGap) * M) + Math.round((p.offsets && p.offsets[b.id]) || 0))));
    zi++;
  });
  blocks.forEach(bl => {
    const s0 = startOf.get(bl.id) ?? survey.end;
    const base = Q.basements.find(x => x.block === bl.id);
    let s1 = s0;
    let improve = null;
    if (fx.improveDays > 0) { improve = add({ block: bl.id, cat: 'improve', name: '지반 개량', start: s0, end: s0 + fx.improveDays }); s1 = improve.end; }
    // 착공·가설: 블록이 넓을수록 울타리·부지 정지·가설 도로가 길다
    const prepW = (fx.prepDays || 18) * (1 + Math.min(1.2, (bl.area || 0) / 30000));
    const prep = add({ block: bl.id, cat: 'prep', name: '착공·가설 (울타리·현장 사무실)', start: s1, end: C.after(s1, prepW) });
    const wallW = base ? base.retainWall / fx.wallRate : 20;
    const wall = add({ block: bl.id, cat: 'wall', name: '흙막이·차수', start: prep.end, end: Math.max(C.after(prep.end, wallW), C.after(prep.end, fx.waterDays || 0)) });
    const eS = C.after(prep.end, (wall.end - prep.end) * 0.45 / 1.3);
    // 굴착 속도: 터 2,500㎡마다 굴착 1조(하루 650㎥), 8m보다 깊으면 버팀보 아래 작업·수직 반출로 느려진다
    const pit = base ? base.foot / 0.9 : 0, depth = base ? base.depth : 0;
    const exRate = Math.min(p.excavRate, 650 * Math.max(1, pit / 2500)) * fx.excavK / 0.85 / (1 + Math.max(0, depth - 8) / 22);
    const earth = add({ block: bl.id, cat: 'earth', name: '굴착·지보·잔토 반출', start: eS, end: Math.max(wall.end, C.after(eS, base ? base.volume / exRate : 20)), rate: Math.round(exRate) });
    // 매트 기초: 하루 타설 한도(pourCap, ㎥)로 나눠 치므로 물량이 크면 기초 기간이 늘어난다
    const matVol = base ? base.foot * (d_matT(gen, bl.id)) : 0;
    const pourCap = Math.round((p.pourCap || 2500) * (fx.pourCap || 1)), pourDays = Math.ceil(matVol / pourCap);
    const foundDur = Math.max((30 + (base ? Math.min(45, base.foot / 600) : 0)) * fx.foundDaysK, pourDays * 1.15 + 10);
    const found = add({ block: bl.id, cat: 'found', name: '기초 (말뚝·매트)', start: earth.end, end: C.after(earth.end, foundDur), matVol, pourDays, pourCap });
    const nB = base ? base.levels : 0;
    // 넓은 지하층은 타설 구역을 나눠 차례로 치므로 한 층이 오래 걸린다 (3,000㎡에서 1.35배, 12,000㎡에서 1.7배)
    const baseCyc = p.cycleBase * fx.baseCycK, wideB = base ? 1 + 0.35 * Math.sqrt(base.foot / 3000) : 1;
    const baseFl = []; { let t = found.end; for (let k = 0; k < nB; k++) { t = C.after(t, baseCyc * wideB); baseFl.push(t); } }
    const bstr = add({ block: bl.id, cat: 'base', name: nB ? `지하 골조 B${nB}~B1` : '기초 상부·지중보', start: found.end, end: baseFl[baseFl.length - 1] || C.after(found.end, 12) });
    // 역타·업다운: 지상 골조가 1층 슬래브 직후 시작 (지하와 동시)
    const topStart = C.after(wall.end, 35);
    const ov = Math.min(1, fx.overlap || 0);
    let superStart = nB >= 2 && ov > 0 ? Math.round(Math.max(topStart, bstr.end - ov * (bstr.end - topStart))) : bstr.end;
    let blockEnd = bstr.end;
    const towers = gen.bldgs.map((b, bi) => ({ b, bi })).filter(x => x.b.block === bl.id && x.b.kind !== 'basement')
      .sort((a, b) => (a.b.kind === 'podium') - (b.b.kind === 'podium') || b.b.storeys - a.b.storeys);
    // 단지형(동 바닥 합이 지하 면적의 35% 미만): 동 자리 지하를 먼저 올려 지상 골조를 시작하고, 주차장 구간 지하는 뒤따라 친다
    const twFoot = towers.reduce((s2, x) => s2 + (x.b.foot || 0), 0);
    const split = !!base && nB >= 1 && towers.length >= 2 && twFoot < base.foot * 0.5;
    if (split) superStart = Math.min(superStart, C.after(found.end, nB * baseCyc * 0.9));
    const modular = fx.frame === 'modular';
    // 모듈러는 공법 자체가 달라 배수를 더 반영하되, 골조는 기준의 절반·마감은 60%보다 빨라지지 않는다 (국내 중층 모듈러 실적: 공기 30~35% 단축)
    const kS = modular ? Math.max(0.5, fx.structCycK) : soft(fx.structCycK);
    const kMep = soft(fx.mepCycK), kSkin = soft(fx.skinCycK), kFin = modular ? Math.max(0.6, (1 - fx.finSave) * (fx.finCycK || 1)) : soft((1 - fx.finSave) * (fx.finCycK || 1));
    // 지하 기계·전기실과 주차장 마감은 지하 골조가 끝나야 할 수 있다: 지상 마감·시운전은 그 뒤에 끝난다
    const baseFit = nB ? C.after(bstr.end, 30 + 12 * nB) : 0;
    // 같은 블록 안 건물은 크레인을 나눠 쓰며 차례로 착수 (설비류는 한꺼번에 여러 대)
    const stagger = p.towerGap ?? (towers.length > 8 ? 2 : 6);
    towers.forEach(({ b, bi }, k) => {
      const st = C.after(superStart, (b.shape === 'cyl' || b.kind === 'rack' ? 0 : 18) + k * stagger); // 타워크레인·거푸집 세팅 18일
      const fl = b.floors.filter(f => f.lv > 0);
      const F = fl.length;
      const fEnd = [], fForm = [];
      let t = st;
      // 넓은 층은 구역을 나눠 올리므로 층 넓이의 제곱근에 비례해 길어진다 (3,000㎡까지는 그대로)
      fl.forEach(f => { const c = cycleOf(b, f, p) * kS * Math.max(1, Math.sqrt((f.area || 0) / 3000)); fForm.push(C.after(t, c * 0.6)); t = C.after(t, c); fEnd.push(t); });
      const sEnd = t;
      const at = (i) => fEnd[Math.max(0, Math.min(F - 1, i))];
      // 후속 공종: 층마다 per(작업일) 간격으로 넘어가고, 한 층에서 lead(작업일) 동안 머문다 (여러 층이 동시에 진행)
      const follow = (lagFl, per, extraStart = 0, lead = 0) => {
        const out = []; let prev = -Infinity;
        for (let i = 0; i < F; i++) {
          const ready = b.kind === 'podium' || F <= 3 ? C.after(sEnd, extraStart) : C.after(at(i + Math.min(lagFl, F - 1)), extraStart);
          const s2 = Math.max(ready, prev);
          prev = C.after(s2, per * (fl[i].roof ? 1.5 : 1));
          out.push([s2, Math.max(prev, C.after(s2, lead))]);
        }
        return out;
      };
      const L = leadDays(b, fl);
      const big = (fl[0] && fl[0].area > 6000) ? Math.min(3, Math.sqrt(fl[0].area / 6000)) : 1; // 넓은 층은 한 층 작업이 길다
      const hoistEff = 1 + ((fx.hoistK || 1) - 1) * Math.min(1, F / 20); // 수직 운송: 층이 많을수록 설비·마감 속도에 영향
      const bigL = Math.sqrt(big);
      const mepLead = L.mep * kMep * hoistEff * bigL;
      const tMep = follow(lag(p.mepLagFl), p.mepPerFl * kMep * hoistEff * big, 0, mepLead);
      const tWin = follow(lag(p.facadeLagFl), p.winPerFl * kSkin * big, 0, 8 * kSkin * bigL);
      const finPer = p.finPerFl * kFin * hoistEff * big;
      const finLead = L.fin * (p.finLeadK ?? 100) / 100 * kFin * hoistEff * bigL;
      // 마감은 그 층 창호가 닫히고(비 안 들이침) 설비 배관이 절반쯤 들어간 뒤 시작한다
      let pf = -Infinity;
      const tFin = follow(lag(p.finishLagFl), finPer, 10).map(([a], i) => {
        const s2 = Math.max(a, tWin[i][1], C.after(tMep[i][0], mepLead * 0.5), pf);
        pf = C.after(s2, finPer * (fl[i].roof ? 1.5 : 1));
        return [s2, C.after(s2, Math.max(finPer, finLead))];
      });
      for (let i = 1; i < F; i++) if (tFin[i][1] < tFin[i - 1][1]) tFin[i][1] = tFin[i - 1][1];
      const mepS = tMep[0][0], mepE = Math.max(tMep[F - 1][1], C.after(sEnd, 40));
      // 외벽 마무리(갱폼 해체 뒤 도장·석재·줄눈)와 지붕 방수는 골조가 끝난 뒤: 층이 많을수록 길다
      const skinS = tWin[0][0], skinE = Math.max(tWin[F - 1][1], C.after(sEnd, 30), C.after(sEnd, 12 + (fx.roofDays || 25)), C.after(sEnd, 20 + Math.min(60, F * 1.4)));
      const finS = tFin[0][0], finE = Math.max(tFin[F - 1][1], C.after(sEnd, 60), b.shape === 'cyl' || b.kind === 'rack' ? 0 : baseFit);
      const commDays = b.kind === 'landmark' ? 110 : b.kind === 'podium' ? 40 : ['fab', 'dhall', 'turbine', 'furnace', 'gmp'].includes(b.kind) ? 150 : ['column', 'tank', 'stack', 'rack', 'hrsg'].includes(b.kind) ? 60
        : ['whs', 'ramp', 'dock'].includes(b.kind) ? 30 : ['ward', 'clinic'].includes(b.kind) ? 90 : 80;
      // 시운전·검사는 공법으로 줄여도 절반만, 사용승인 절차(검사 신청~승인 15일)는 줄지 않는다
      const commE = C.after(finE, commDays * soft(fx.commK || 1) + (b.shape === 'cyl' || b.kind === 'rack' ? 0 : 15));
      const rec = { bi, id: b.id, block: bl.id, kind: b.kind, structStart: st, structEnd: sEnd, fEnd, fForm, tMep, tWin, tFin, lead: { fin: Math.round(finLead), mep: Math.round(mepLead), use: L.use },
        floors: fl.map(f => b.floors.indexOf(f)), skinS, skinE, mepS, mepE, finS, finE, commS: finE, commE, F };
      blds.set(bi, rec);
      add({ block: bl.id, bi, bldg: b.id, cat: 'struct', name: `${b.id} 골조 ${F}${b.shape === 'cyl' ? '단' : '층'}`, start: st, end: sEnd });
      add({ block: bl.id, bi, bldg: b.id, cat: 'mep', name: `${b.id} 설비·전기`, start: mepS, end: mepE });
      add({ block: bl.id, bi, bldg: b.id, cat: 'skin', name: `${b.id} ${b.shape === 'cyl' ? '보온·도장' : '창호·외장'}`, start: skinS, end: skinE });
      add({ block: bl.id, bi, bldg: b.id, cat: 'fin', name: `${b.id} ${b.shape === 'cyl' ? '내부 설비·계장' : '내부 마감'}`, start: finS, end: finE });
      add({ block: bl.id, bi, bldg: b.id, cat: 'comm', name: `${b.id} ${['fab', 'dhall', 'turbine', 'furnace', 'gmp', 'column', 'tank', 'stack', 'hrsg'].includes(b.kind) ? '시운전·성능 시험' : '승강기·시운전·사용승인'}`, start: finE, end: commE });
      blockEnd = Math.max(blockEnd, commE);
    });
    const land = add({ block: bl.id, cat: 'land', name: '조경·외부 공사', start: Math.max(bstr.end, blockEnd - 200), end: C.after(blockEnd, Math.max(0, ((fx.landK || 1) - 1) * 120)) });
    bstate.set(bl.id, { prep, wall, earth, found, bstr, baseFl, land, nB, improve, split, superStart });
    bsum.push({ id: bl.id, zone: bl.zone, start: s0, baseEnd: bstr.end, topping: towers.length ? Math.max(...towers.map(x => blds.get(x.bi).structEnd)) : bstr.end, end: Math.max(blockEnd, land.end), towers: towers.length });
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
  const craneOK = (r) => { const b = gen.bldgs[r.bi]; return r.kind !== 'podium' && !(b.shape === 'cyl' && b.parts[0].w < 12) && !['gen', 'rack'].includes(b.kind); };
  function cranesAt(t) {
    const out = [];
    blds.forEach(r => {
      if (!craneOK(r) || t < r.structStart - 20 || t > r.structEnd + 15) return;
      const b = gen.bldgs[r.bi];
      let h = 0; r.fEnd.forEach((fe, i) => { if (fe <= t) h = b.floors[r.floors[i]].y1; });
      out.push({ u: b.core.u, v: b.core.v, h: Math.max(h, 8), a: (r.bi * 1.7) % (Math.PI * 2), bi: r.bi, r: fx.craneR, block: r.block });
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
  return { p, fx, t0, acts, blds, blocks: bsum, bstate, end, months: Math.ceil(end / M), stateAt, blockStateAt, cranesAt, craneOK, progressAt, phases, cal: C, survey };
}
