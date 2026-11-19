// 매스 배치 엔진 (택지 공통)
// 블록마다 주동 형식(탑상·Y자·판상·ㄱ자·V자·ㄷ자)으로 동을 배치하고, 높이 계획(서측 저층 → 랜드마크, 한강 앞열 제한,
// 동별 높이 리듬)과 인동간격(건축법 시행령 제86조 제3항)을 지키도록 층수를 정한다. 층마다 층고·면적·세대수를 기록한다.
import { makePlan } from './plan.js';
import { resolveSite } from './sites.js';
import { applyGesture } from './gesture.js';

// 현재 계산 중인 대지 계획 (generate가 정한다)
let PL = makePlan(resolveSite(null));
let FRONT = new Set();

export const DEFAULTS = {
  housingTarget: 6000,  // 주거 물량(아파트+오피스텔)
  officetelShare: 30,   // 주거 물량 중 오피스텔 비율(%) — 복합 블록에 배치 (복합 블록이 없으면 0)
  rentalShare: 30,      // 아파트 중 공공임대 비율(%) — 동·층에 섞어 배치(소셜믹스)
  mix59: 30, mix84: 50, mix114: 20, // 아파트 세대 구성(%)
  typology: 'tower',    // 주동 형식: tower | y | slab | l | v | court | mixed
  resZone: 'gc',        // 주거 블록 용도지역: gc 일반상업(법 61조② 적용 제외) | semi 준주거·주거지역(시행령 86조③ 적용)
  sideWin: 0,           // 탑상·Y자형 측면 채광창 (1 있음: 측면도 가목 0.5H 적용, 0 0.5㎡ 미만 창만: 측벽으로 보아 4m)
  resMaxFloors: 55,     // 주거 최고 층수 (스카이라인 정점)
  skylineWest: 70,      // 스카이라인 낮은 끝 높이 비율(%) — 초점(랜드마크·복합 블록)으로 갈수록 100%
  heightVar: 15,        // 같은 열 동별 높이 차(%) — 스카이라인 리듬
  riverFrontMax: 45,    // 수변 앞열 최고 층수
  southRatio: 65,       // 남측 열 높이 / 북측 열 높이(%) — 남저북고
  spacingCoef: 0.5,     // 인동간격 계수(가목, × 마주보는 건물 높이)
  podiumRes: 2,         // 주거 블록 근린생활·커뮤니티 포디움 층수
  intlFar: 1100,        // 국제업무존 평균 용적률(%) — 랜드마크 블록 제외
  landmarkFloors: 100,  // 랜드마크 층수
  mixedFar: 800,        // 업무복합존 용적률(%)
  officeMaxFloors: 70,  // 업무 타워 최고 층수(랜드마크 제외)
  floorEff: 78,         // 주거 기준층 전용률(%)
  hRes: 3.0, hResLobby: 6.0, hPodium: 5.0, hOffice: 4.2, hOfficeLobby: 9.0, hOfficePodium: 5.5,
  hOfficetel: 3.1, hRefuge: 4.5, hMech: 6.0, hB1: 5.0, hPark: 3.6,
  parkRes: 1.2,         // 아파트 세대당 주차
  parkOfficetel: 0.5,   // 오피스텔 호당 주차
  parkOfficePer: 200,   // 업무·상업 ㎡당 1대
};

export const META = {
  housingTarget: { label: '주거 물량 (아파트+오피스텔)', unit: '호', min: 100, max: 30000, step: 50, group: 'plan' },
  officetelShare: { label: '오피스텔 비율', unit: '%', min: 0, max: 60, step: 1, group: 'plan', note: '복합 블록 남측 타워에 배치' },
  rentalShare: { label: '공공임대 비율 (아파트 중)', unit: '%', min: 0, max: 100, step: 1, group: 'plan', note: '소셜믹스: 같은 동에 섞어 배치' },
  mix59: { label: '전용 59㎡ 비율', unit: '%', min: 0, max: 100, step: 1, group: 'res' },
  mix84: { label: '전용 84㎡ 비율', unit: '%', min: 0, max: 100, step: 1, group: 'res' },
  mix114: { label: '전용 114㎡ 비율', unit: '%', min: 0, max: 100, step: 1, group: 'res' },
  podiumRes: { label: '주거 포디움 층수', unit: '층', min: 0, max: 4, step: 1, group: 'res' },
  resMaxFloors: { label: '주거 최고 층수 (정점)', unit: '층', min: 7, max: 80, step: 1, group: 'height' },
  skylineWest: { label: '스카이라인 낮은 끝 비율', unit: '%', min: 30, max: 100, step: 1, group: 'height', note: '대지 끝을 낮추고 랜드마크·복합 블록 쪽으로 높아지는 스카이라인' },
  riverFrontMax: { label: '수변 앞열 최고 층수', unit: '층', min: 5, max: 80, step: 1, group: 'height', note: '수변에 면한 행. 서울 한강변은 2023년 35층 일률 규제 폐지 이후 경관심의로 관리' },
  southRatio: { label: '남측 열 높이 비율', unit: '%', min: 30, max: 100, step: 1, group: 'height', note: '남쪽 열을 낮춰 뒷열의 일조·조망 확보 (남저북고)' },
  heightVar: { label: '동별 높이 차', unit: '%', min: 0, max: 40, step: 1, group: 'height', note: '같은 열 안에서 높고 낮은 동을 번갈아 둠' },
  spacingCoef: { label: '인동간격 계수 (가목)', unit: '×H', min: 0.25, max: 1.2, step: 0.05, group: 'law', note: '시행령 0.5배 이상 범위에서 조례. 준주거에서는 0.5 미만으로 내릴 수 없음' },
  intlFar: { label: '국제업무존 용적률', unit: '%', min: 400, max: 1700, step: 10, group: 'office', note: '용산 발표 계획: 최대 1,700%' },
  landmarkFloors: { label: '랜드마크 층수', unit: '층', min: 50, max: 120, step: 1, group: 'office' },
  mixedFar: { label: '복합 블록 용적률', unit: '%', min: 150, max: 1500, step: 10, group: 'office' },
  officeMaxFloors: { label: '업무 타워 최고 층수', unit: '층', min: 20, max: 90, step: 1, group: 'office' },
  hRes: { label: '주거 기준층 층고', unit: 'm', min: 2.8, max: 3.6, step: 0.05, group: 'h' },
  hResLobby: { label: '주거 1층 로비 층고', unit: 'm', min: 4, max: 9, step: 0.1, group: 'h' },
  hOfficetel: { label: '오피스텔 기준층 층고', unit: 'm', min: 2.8, max: 3.6, step: 0.05, group: 'h' },
  hOffice: { label: '업무 기준층 층고', unit: 'm', min: 3.8, max: 4.8, step: 0.05, group: 'h' },
  hOfficeLobby: { label: '업무 1층 로비 층고', unit: 'm', min: 6, max: 14, step: 0.5, group: 'h' },
  hPodium: { label: '주거 포디움 층고', unit: 'm', min: 4, max: 6.5, step: 0.1, group: 'h' },
  hOfficePodium: { label: '업무 포디움 층고', unit: 'm', min: 4.5, max: 7, step: 0.1, group: 'h' },
  hRefuge: { label: '피난안전층 층고', unit: 'm', min: 2.1, max: 7, step: 0.1, group: 'h', note: '법정 최소 2.1m, 설비 겸용 시 상향' },
  hMech: { label: '옥탑·기계층 층고', unit: 'm', min: 3, max: 15, step: 0.5, group: 'h' },
  hB1: { label: '지하 1층 층고', unit: 'm', min: 3.6, max: 7, step: 0.1, group: 'h' },
  hPark: { label: '지하 주차층 층고', unit: 'm', min: 3.0, max: 4.5, step: 0.05, group: 'h', note: '택배차량 진입 시 유효 2.7m 이상' },
  parkRes: { label: '아파트 세대당 주차', unit: '대', min: 0.5, max: 2, step: 0.05, group: 'park' },
  parkOfficetel: { label: '오피스텔 호당 주차', unit: '대', min: 0.2, max: 1.5, step: 0.05, group: 'park' },
  parkOfficePer: { label: '업무·상업 1대당 면적', unit: '㎡', min: 100, max: 400, step: 10, group: 'park' },
};

export const APT_TYPES = [
  { key: 't114', name: '114㎡', area: 114, aspect: 1.25 },
  { key: 't84', name: '84㎡', area: 84, aspect: 1.3 },
  { key: 't59', name: '59㎡', area: 59, aspect: 2.4 },
];

// 주동 형식: 층당 세대수, 남향 주개구부 여부
export const FORMS = {
  tower: { name: '탑상형', upf: { t59: 6, t84: 4, t114: 4 }, note: '코어 둘레에 4~6세대. 코너 세대는 두 면 개방' },
  y: { name: 'Y자형', upf: { t59: 6, t84: 3, t114: 3 }, note: '세 날개 끝에 세대를 두어 세 방향 개방. 탑상형보다 남향 비율이 높음' },
  slab: { name: '판상형', upf: { t59: 6, t84: 4, t114: 4 }, note: '남향 일자형 맞통풍. 일조에 유리하지만 동이 길어 뒷열을 가림' },
  l: { name: 'ㄱ자형', upf: { t59: 8, t84: 6, t114: 5 }, note: '남향 동에 동·서향 날개를 붙여 모서리를 감쌈. 두 동을 마주 놓아 남쪽으로 열린 마당을 만듦' },
  v: { name: 'V자형', upf: { t59: 8, t84: 6, t114: 6 }, note: '두 날개를 남쪽으로 25° 벌려 모든 세대가 남동·남서를 봄. 날개 사이로 한강 조망' },
  court: { name: 'ㄷ자형', upf: { t59: 16, t84: 14, t114: 12 }, note: '남쪽이 열린 중정형 중층 블록. 중정 폭 때문에 높이가 제한됨' },
};
export const TYPOLOGIES = {
  tower: { name: '탑상형', rows: ['tower', 'tower'] },
  y: { name: 'Y자형', rows: ['y', 'y'] },
  slab: { name: '판상형', rows: ['slab', 'slab'] },
  l: { name: 'ㄱ자형', rows: ['l', 'l'] },
  v: { name: 'V자형', rows: ['v', 'v'] },
  court: { name: 'ㄷ자 중정형', rows: ['court', 'court'] },
  mixed: { name: '혼합형', rows: ['tower', 'slab'] },
};

const OFFICETEL = { area: 45, upf: 10, aspect: 2.6 };
const SETBACK = 6;      // 획지 경계 건축선 후퇴
const SIDE_GAP = 12;    // 같은 열 동 사이 최소 간격 (소방차 진입·측벽 4m보다 여유)
const PARK_AREA = 33;   // 주차 1대당 지하 면적(차로 포함)
const OFS = 0.3;        // 창 표본점을 벽면 밖으로 띄우는 거리
const DEG = Math.PI / 180;

// 피난안전층 위치 (건축법 시행령 제34조: 초고층 30개 층마다, 준초고층 전체 층수 1/2 층 ±5)
export function refugeLevels(F, heightM) {
  if (F >= 50 || heightM >= 200) { const r = []; for (let l = 30; l < F; l += 30) r.push(l); return r; }
  if (F >= 30 || heightM >= 120) return [Math.round(F / 2)];
  return [];
}

const plateDims = (area, aspect) => { const w = Math.sqrt(area * aspect); return [w, area / w]; };

function stackFloors(spec) {
  // spec: { F, lobbyH, typH, typUse, plate, upf, refugeH, mechH, mechArea, podium: [{h, use}], lobbyUse, scale(lv) }
  const floors = [];
  const estH = spec.lobbyH + (spec.F - 1) * spec.typH;
  const ref = new Set(refugeLevels(spec.F, estH));
  const sc = spec.scale || (() => 1);
  for (let lv = 1; lv <= spec.F; lv++) {
    const s = sc(lv), a = spec.plate * s * s;
    if (lv === 1) floors.push({ lv, name: '1F', use: spec.lobbyUse || 'lobby', h: spec.lobbyH, area: a * 0.85, units: 0, s });
    else if (spec.podium && lv <= spec.podium.length + 1) { const p = spec.podium[lv - 2]; floors.push({ lv, name: lv + 'F', use: p.use, h: p.h, area: a, units: 0, s }); }
    else if (ref.has(lv)) floors.push({ lv, name: lv + 'F', use: 'refuge', h: spec.refugeH, area: a, units: 0, s });
    else floors.push({ lv, name: lv + 'F', use: spec.typUse, h: spec.typH, area: a, units: spec.upf || 0, s });
  }
  floors.push({ lv: spec.F + 1, name: 'PH', use: 'mech', h: spec.mechH, area: spec.mechArea, units: 0, roof: true, s: 1 });
  let y = 0; floors.forEach(f => { f.y0 = y; y += f.h; f.y1 = y; });
  return floors;
}
const unitsOf = fl => fl.reduce((s, f) => s + f.units, 0);
const heightOf = fl => fl.filter(f => !f.roof).reduce((s, f) => s + f.h, 0);
const resFloorsFor = (F, p) => { const est = p.hResLobby + (F - 1) * p.hRes; return F - 1 - refugeLevels(F, est).length; };
function linspace(a, b, n) { if (n <= 0) return []; if (n === 1) return [(a + b) / 2]; return Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)); }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 주거동 높이(옥탑 제외) — stackFloors와 같은 규칙
function heightTable(p, maxF = 130) {
  const H = [0];
  for (let F = 1; F <= maxF; F++) {
    const est = p.hResLobby + (F - 1) * p.hRes, nr = refugeLevels(F, est).length;
    H.push(p.hResLobby + (F - 1 - nr) * p.hRes + nr * p.hRefuge);
  }
  const floorsFor = (Hmax) => { let F = maxF; while (F > 0 && H[F] > Hmax + 1e-6) F--; return F; };
  return { H, floorsFor };
}

// ---------- 형상 ----------
// 부분(part): 대지 좌표 중심 (cu, cv), 길이 w(로컬 x), 깊이 d(로컬 y), 회전 a(라디안, u→v 방향), 면 종류 faces{N,S,E,W}
// 면 종류: win(채광창 있는 벽) · side(측벽) · none(다른 부분과 붙은 면)
function mkPart(cu, cv, w, d, a, faces) {
  const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hd = d / 2;
  const ex = Math.abs(hw * c) + Math.abs(hd * s), ey = Math.abs(hw * s) + Math.abs(hd * c);
  // 외곽 상자(축 정렬) 네 면의 종류: 회전한 부분은 그 방향을 향한 로컬 면들로 정한다
  const nrm = { S: [-s, c], N: [s, -c], E: [c, s], W: [-c, -s] }, dirs = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  const bf = {};
  for (const [k, dv] of Object.entries(dirs)) {
    const ks = Object.keys(nrm).filter(f => nrm[f][0] * dv[0] + nrm[f][1] * dv[1] > 0.7).map(f => faces[f]);
    bf[k] = ks.includes('win') ? 'win' : ks.includes('podium') ? 'podium' : ks.includes('side') ? 'side' : ks.includes('blank') ? 'blank' : 'none';
  }
  return { cu, cv, w, d, a, faces, bf, u0: cu - ex, u1: cu + ex, v0: cv - ey, v1: cv + ey };
}
const boxPart = (u0, u1, v0, v1, faces) => mkPart((u0 + u1) / 2, (v0 + v1) / 2, u1 - u0, v1 - v0, 0, faces);
// 부분의 한 면 위 점(t: 0~1)과 바깥 법선
function facePt(pt, side, t) {
  const c = Math.cos(pt.a), s = Math.sin(pt.a);
  let x, y, nx, ny;
  if (side === 'S') { x = -pt.w / 2 + pt.w * t; y = pt.d / 2 + OFS; nx = 0; ny = 1; }
  else if (side === 'N') { x = -pt.w / 2 + pt.w * t; y = -pt.d / 2 - OFS; nx = 0; ny = -1; }
  else if (side === 'E') { x = pt.w / 2 + OFS; y = -pt.d / 2 + pt.d * t; nx = 1; ny = 0; }
  else { x = -pt.w / 2 - OFS; y = -pt.d / 2 + pt.d * t; nx = -1; ny = 0; }
  return [pt.cu + x * c - y * s, pt.cv + x * s + y * c, nx * c - ny * s, nx * s + ny * c];
}
const ALLWIN = { N: 'win', S: 'win', E: 'win', W: 'win' };
const barDepth = (t) => (t.area <= 60 ? 12 : t.area <= 90 ? 13.5 : 15);

// 형식별 형상 (로컬 좌표, 원점 = 외곽 상자 중심). 반환: { parts, units(세대별 창 [[u,v,nu,nv]...]), w, d, core, perim, plate, upf }
export function makeForm(form, t, p, { mirror = false, sideWin = true, aspect = null } = {}) {
  const upf = FORMS[form].upf[t.key];
  const plate = upf * t.area / (p.floorEff / 100);
  const sw = sideWin ? 'win' : 'side';
  let parts = [], units = [], perim = 0;
  if (form === 'tower') {
    const [w, d] = plateDims(plate, aspect || t.aspect);
    const P = mkPart(0, 0, w, d, 0, { N: 'win', S: 'win', E: sw, W: sw });
    parts = [P];
    const F = (s, k) => facePt(P, s, k);
    const side = (x) => (sideWin ? [x] : []);
    if (upf === 4) units = [[F('S', 0.25), ...side(F('W', 0.75))], [F('S', 0.75), ...side(F('E', 0.75))], [F('N', 0.75), ...side(F('E', 0.25))], [F('N', 0.25), ...side(F('W', 0.25))]];
    else units = [[F('S', 1 / 6), ...side(F('W', 0.75))], [F('S', 0.5)], [F('S', 5 / 6), ...side(F('E', 0.75))], [F('N', 5 / 6), ...side(F('E', 0.25))], [F('N', 0.5)], [F('N', 1 / 6), ...side(F('W', 0.25))]];
    perim = 2 * (w + d);
  } else if (form === 'y') {
    const ww = t.area <= 60 ? 9.5 : 11, c = 9;
    const lw = (plate - c * c) / (3 * ww) + c / 2;
    const angs = [-90, 30, 150].map(x => x * DEG);
    parts = angs.map(a => mkPart(Math.cos(a) * lw / 2, Math.sin(a) * lw / 2, lw, ww, a, { N: 'win', S: 'win', E: sw, W: 'none' }));
    parts.forEach(P => {
      const F = (s, k) => facePt(P, s, k);
      if (upf === 3) units.push([F('E', 0.5), F('S', 0.8), F('N', 0.8)]);
      else { units.push([F('S', 0.72), F('E', 0.3)]); units.push([F('N', 0.72), F('E', 0.7)]); }
    });
    perim = 3 * (2 * (lw - c / 2) + ww);
  } else if (form === 'slab') {
    const d = barDepth(t), w = plate / d;
    const P = mkPart(0, 0, w, d, 0, { N: 'win', S: 'win', E: 'side', W: 'side' });
    parts = [P];
    for (let k = 0; k < upf; k++) units.push([facePt(P, 'S', (k + 0.5) / upf), facePt(P, 'N', (k + 0.5) / upf)]);
    perim = 2 * (w + d);
  } else if (form === 'l') {
    const d = barDepth(t), fu = plate / d / upf;
    const nh = Math.ceil(upf * 0.6), nv = upf - nh, Ch = nh * fu, Cv = Math.max(d, nv * fu);
    const W = Ch + d / 2, D = d / 2 + Cv;
    let H = { u0: 0, u1: W, v0: 0, v1: d, f: { N: 'win', S: 'win', W: 'side', E: 'win' } };
    let V = { u0: Ch - d / 2, u1: W, v0: d, v1: D, f: { E: 'win', W: 'win', S: 'side', N: 'none' } };
    if (mirror) {
      const m = (r) => ({ u0: W - r.u1, u1: W - r.u0, v0: r.v0, v1: r.v1, f: { ...r.f, E: r.f.W, W: r.f.E } });
      H = m(H); V = m(V);
    }
    const PH = boxPart(H.u0 - W / 2, H.u1 - W / 2, H.v0 - D / 2, H.v1 - D / 2, H.f);
    const PV = boxPart(V.u0 - W / 2, V.u1 - W / 2, V.v0 - D / 2, V.v1 - D / 2, V.f);
    parts = [PH, PV];
    // 가로 동: 날개와 겹치지 않는 구간에 남·북 창
    const span = (W - d) / W, off = mirror ? d / W : 0;
    for (let k = 0; k < nh; k++) { const tt = off + span * (k + 0.5) / nh; units.push([facePt(PH, 'S', tt), facePt(PH, 'N', tt)]); }
    for (let k = 0; k < nv; k++) { const tt = (k + 0.5) / nv; units.push([facePt(PV, 'W', tt), facePt(PV, 'E', tt)]); }
    perim = 2 * (W + D);
  } else if (form === 'v') {
    const d = barDepth(t), phi = 25 * DEG, La = plate / d / 2;
    const nL = Math.ceil(upf / 2), nR = upf - nL;
    const L = La + d / 2, cl = (La - d / 2) / 2;
    const R = mkPart(Math.cos(phi) * cl, Math.sin(phi) * cl, L, d, phi, { N: 'win', S: 'win', E: 'side', W: 'none' });
    const Lw = mkPart(-Math.cos(phi) * cl, Math.sin(phi) * cl, L, d, -phi, { N: 'win', S: 'win', W: 'side', E: 'none' });
    parts = [Lw, R];
    const t0 = d / L;
    for (let k = 0; k < nL; k++) { const tt = 1 - t0 - (1 - t0) * (k + 0.5) / nL; units.push([facePt(Lw, 'S', tt), facePt(Lw, 'N', tt)]); }
    for (let k = 0; k < nR; k++) { const tt = t0 + (1 - t0) * (k + 0.5) / nR; units.push([facePt(R, 'S', tt), facePt(R, 'N', tt)]); }
    perim = 4 * La + 2 * d;
  } else if (form === 'court') {
    const d = barDepth(t), fu = plate / d / upf;
    const nSide = Math.max(1, Math.floor(upf * 0.28)), nTop = upf - 2 * nSide;
    const Ct = nTop * fu, Cs = Math.max(d, nSide * fu), W = Ct + d, D = d / 2 + Cs;
    const PT = boxPart(-W / 2, W / 2, -D / 2, -D / 2 + d, { N: 'win', S: 'win', E: 'side', W: 'side' });
    const PW = boxPart(-W / 2, -W / 2 + d, -D / 2 + d, D / 2, { W: 'win', E: 'win', S: 'side', N: 'none' });
    const PE = boxPart(W / 2 - d, W / 2, -D / 2 + d, D / 2, { E: 'win', W: 'win', S: 'side', N: 'none' });
    parts = [PT, PW, PE];
    for (let k = 0; k < nTop; k++) { const tt = (d + (Ct - d) * (k + 0.5) / nTop) / W; units.push([facePt(PT, 'S', tt), facePt(PT, 'N', tt)]); }
    for (let k = 0; k < nSide; k++) { const tt = (k + 0.5) / nSide; units.push([facePt(PW, 'W', tt), facePt(PW, 'E', tt)]); units.push([facePt(PE, 'E', tt), facePt(PE, 'W', tt)]); }
    perim = 2 * (W + D) + 2 * (Cs - d / 2);
  }
  // 외곽 상자 중심으로 이동
  const u0 = Math.min(...parts.map(q => q.u0)), u1 = Math.max(...parts.map(q => q.u1));
  const v0 = Math.min(...parts.map(q => q.v0)), v1 = Math.max(...parts.map(q => q.v1));
  const du = (u0 + u1) / 2, dv = (v0 + v1) / 2;
  const P2 = parts.map(q => mkPart(q.cu - du, q.cv - dv, q.w, q.d, q.a, q.faces));
  const U2 = units.map(us => us.map(([u, v, nu, nv]) => [u - du, v - dv, nu, nv]));
  // 코어: Y·V는 날개가 만나는 곳, ㄱ·ㄷ은 모서리, 나머지는 중심
  let core = [0, 0];
  if (form === 'y') core = [-du, -dv];
  else if (form === 'v') core = [-du, -dv + d0(t) / 2];
  else if (form === 'l' || form === 'court') { const q = P2[0]; core = [mirror ? q.u0 + barDepth(t) / 2 : q.u1 - barDepth(t) / 2, (q.v0 + q.v1) / 2]; if (form === 'court') core = [(q.u0 + q.u1) / 2, (q.v0 + q.v1) / 2]; }
  return { form, upf, plate, parts: P2, units: U2, w: u1 - u0, d: v1 - v0, core, perim };
}
const d0 = (t) => barDepth(t);

function placeForm(F, uc, vc) {
  return {
    parts: F.parts.map(q => mkPart(q.cu + uc, q.cv + vc, q.w, q.d, q.a, q.faces)),
    units: F.units.map(us => us.map(([u, v, nu, nv]) => [u + uc, v + vc, nu, nv])),
    core: { u: F.core[0] + uc, v: F.core[1] + vc },
  };
}
const rectOf = (parts) => ({ u0: Math.min(...parts.map(q => q.u0)), u1: Math.max(...parts.map(q => q.u1)), v0: Math.min(...parts.map(q => q.v0)), v1: Math.max(...parts.map(q => q.v1)) });

// ---------- 높이 계획 ----------
// 대지 끝(sw) → 초점(랜드마크·복합 블록, 1.0)으로 선형 상승
export function skylineAt(u, p) {
  const f = PL.focalU, span = Math.max(f - PL.SITE.u0, PL.SITE.u1 - f, 1);
  const sw = p.skylineWest / 100, k = clamp(1 - Math.abs(u - f) / span, 0, 1);
  return sw + (1 - sw) * k;
}

// ---------- 인동간격 ----------
// 두 부분이 마주보는 관계: 축(NS/EW), 거리, 북(서)쪽 부분의 면, 남(동)쪽 부분의 면
function facing(A, B) {
  const uo = Math.min(A.u1, B.u1) - Math.max(A.u0, B.u0), vo = Math.min(A.v1, B.v1) - Math.max(A.v0, B.v0);
  if (uo > 0.5 && vo <= 0) {
    if (A.v1 <= B.v0) return { axis: 'NS', gap: B.v0 - A.v1, P: A, Q: B, fP: A.bf.S, fQ: B.bf.N, swap: false };
    return { axis: 'NS', gap: A.v0 - B.v1, P: B, Q: A, fP: B.bf.S, fQ: A.bf.N, swap: true };
  }
  if (vo > 0.5 && uo <= 0) {
    if (A.u1 <= B.u0) return { axis: 'EW', gap: B.u0 - A.u1, P: A, Q: B, fP: A.bf.E, fQ: B.bf.W, swap: false };
    return { axis: 'EW', gap: A.u0 - B.u1, P: B, Q: A, fP: B.bf.E, fQ: A.bf.W, swap: true };
  }
  return null;
}
// 마주보는 두 동의 축이 남동~남서 사이인지 (나목 적용 조건)
function axisSouthward(P, Q) {
  const [x, z] = PL.toWorld(Q.cu - P.cu, Q.cv - P.cv);
  return z > 0 && Math.abs(Math.atan2(x, z)) <= 45 * DEG + 1e-9;
}
// 요구 거리와 그 거리를 정하는 건물: 반환 [{rule, req, limits: 'P'|'Q'|null}]
function rulesFor(f, HP, HQ, coef, mainSP) {
  const { fP, fQ, axis } = f, out = [];
  if (fP === 'none' || fQ === 'none') return out;
  if (fP === 'podium' || fQ === 'podium') {
    const Hp = fP === 'podium' ? HP : HQ;
    if ((fP === 'podium' ? fQ : fP) === 'win') out.push({ rule: '다목', req: Math.max(1.0 * Hp, coef * Hp), limits: null });
    return out;
  }
  if (axis === 'NS' && fP === 'win' && mainSP && HQ < HP - 1e-6 && f.south) {
    out.push({ rule: '나목', req: Math.max(10, coef * HQ), limits: 'Q' });
    return out;
  }
  if (fP === 'win') out.push({ rule: '가목', req: coef * HQ, limits: 'Q' });
  if (fQ === 'win') out.push({ rule: '가목', req: coef * HP, limits: 'P' });
  if (fP === 'side' && fQ === 'side') out.push({ rule: '마목', req: 4, limits: null });
  else if ((fP === 'side' && fQ === 'blank') || (fP === 'blank' && fQ === 'side')) out.push({ rule: '라목', req: 8, limits: null });
  return out;
}

// 블록 안 동(모듈) 사이의 마주봄 관계를 미리 계산
function pairsOf(mods) {
  const pairs = [];
  for (let i = 0; i < mods.length; i++) for (let j = i; j < mods.length; j++) {
    const A = mods[i], B = mods[j];
    A.parts.forEach((pa, ia) => B.parts.forEach((pb, ib) => {
      if (i === j && ib <= ia) return;
      const f = facing(pa, pb);
      if (!f) return;
      if (i === j && f.gap < 1) return; // 같은 동의 붙은 부분
      f.iP = f.swap ? j : i; f.iQ = f.swap ? i : j;
      f.south = f.axis === 'NS' && axisSouthward(f.P, f.Q);
      pairs.push(f);
    }));
  }
  return pairs;
}

// 층수를 인동간격에 맞춰 낮춘다 (높이는 줄기만 하므로 끝난다)
function enforce(mods, pairs, ht, coef, minF = 3) {
  let bad = false;
  for (let it = 0; it < 40; it++) {
    let changed = false;
    for (const f of pairs) {
      const P = mods[f.iP], Q = mods[f.iQ];
      const rs = rulesFor(f, ht.H[P.F], ht.H[Q.F], coef, true);
      for (const r of rs) {
        if (f.gap + 1e-6 >= r.req) continue;
        if (!r.limits) { bad = true; continue; }
        const M = r.limits === 'P' ? P : Q;
        const Fm = ht.floorsFor(f.gap / coef);
        if (r.rule === '나목' && f.gap < 10) { bad = true; continue; }
        if (M.F > Fm) { M.F = Math.max(minF - 1, Fm); changed = true; if (Fm < minF) bad = true; }
      }
    }
    if (!changed) break;
  }
  return !bad;
}

// 1호: 채광창 면에서 인접 대지경계선(도로·공원 건너편이면 중심선)까지 거리의 4배(준주거) 이하
function boundaryLines(block) {
  const L = block.lot, others = PL.BLOCKS.filter(b => b.id !== block.id).map(b => b.lot)
    .concat(PL.CONTEXT.map(c => ({ u0: c.u0, u1: c.u1, v0: c.v0, v1: c.v1 })));
  const near = (dir) => {
    let best = null;
    for (const o of others) {
      if (dir === 'S' && o.v0 >= L.v1 && Math.min(o.u1, L.u1) > Math.max(o.u0, L.u0)) best = best == null ? o.v0 : Math.min(best, o.v0);
      if (dir === 'N' && o.v1 <= L.v0 && Math.min(o.u1, L.u1) > Math.max(o.u0, L.u0)) best = best == null ? o.v1 : Math.max(best, o.v1);
      if (dir === 'E' && o.u0 >= L.u1 && Math.min(o.v1, L.v1) > Math.max(o.v0, L.v0)) best = best == null ? o.u0 : Math.min(best, o.u0);
      if (dir === 'W' && o.u1 <= L.u0 && Math.min(o.v1, L.v1) > Math.max(o.v0, L.v0)) best = best == null ? o.u1 : Math.max(best, o.u1);
    }
    return best;
  };
  const s = near('S'), n = near('N'), e = near('E'), w = near('W');
  return { S: s == null ? L.v1 + 30 : (L.v1 + s) / 2, N: n == null ? L.v0 - 30 : (L.v0 + n) / 2, E: e == null ? L.u1 + 30 : (L.u1 + e) / 2, W: w == null ? L.u0 - 30 : (L.u0 + w) / 2 };
}
function rule1Dist(parts, lines) {
  let D = Infinity;
  parts.forEach(q => {
    if (q.bf.S === 'win') D = Math.min(D, lines.S - q.v1);
    if (q.bf.N === 'win') D = Math.min(D, q.v0 - lines.N);
    if (q.bf.E === 'win') D = Math.min(D, lines.E - q.u1);
    if (q.bf.W === 'win') D = Math.min(D, q.u0 - lines.W);
  });
  return D;
}

// ---------- 주거 블록 ----------
function housingBlock(block, unitsByType, p, warnings, ht) {
  const L = block.lot, uS = L.u0 + SETBACK, uE = L.u1 - SETBACK, vN = L.v0 + SETBACK, vS = L.v1 - SETBACK;
  const usableW = uE - uS;
  const [formN, formS] = TYPOLOGIES[p.typology].rows;
  const coef = p.resZone === 'semi' ? Math.max(0.5, p.spacingCoef) : p.spacingCoef;
  const sideWin = !!p.sideWin;
  const lines = p.resZone === 'semi' ? boundaryLines(block) : null;
  const types = APT_TYPES.filter(t => unitsByType[t.key] > 0).map(t => {
    // 기본형과 폭을 줄인 정방형(한 열에 동을 하나 더 넣을 때)
    const N = makeForm(formN, t, p, { sideWin }), S = makeForm(formS, t, p, { sideWin });
    const ca = t.key === 't59' ? 1.4 : 1.0, Nc = makeForm(formN, t, p, { sideWin, aspect: ca }), Sc = makeForm(formS, t, p, { sideWin, aspect: ca });
    return { ...t, N, S, Nc, Sc, target: unitsByType[t.key] };
  });
  const total = types.reduce((s, t) => s + t.target, 0);
  if (!total) return [];
  const sum = a => a.reduce((x, y) => x + y, 0);
  const wts = types.map(t => t.target / ((t.N.upf + t.S.upf) / 2));
  const rowW = (list, row) => sum(list.map(t => t[row].w)) + SIDE_GAP * Math.max(0, list.length - 1);
  const riverFront = FRONT.has(block.id);

  // 한 열에 동을 고르게 분산 (실제 폭 기준)
  const place = (list, row) => {
    if (list.length === 1) return [(uS + uE) / 2];
    const w = list.map(t => t[row].w), g = (usableW - sum(w)) / (list.length - 1);
    let u = uS; return w.map(x => { const c = u + x / 2; u += x + g; return c; });
  };
  function layout(north, south, kN, kS) {
    let uN = place(north, kN), uSo = south.length ? place(south, kS) : [];
    const nN = north.length, nS = south.length, pointy = (f) => f === 'tower' || f === 'y';
    if (nS === nN && nN >= 2 && pointy(formN) && pointy(formS)) {
      const wm = Math.max(...north.map(t => t[kN].w), ...south.map(t => t[kS].w));
      const a = uS + wm / 2, b = uE - wm / 2, pitch = (b - a) / (nN - 0.5);
      if (pitch - wm >= SIDE_GAP) { uN = north.map((_, i) => a + i * pitch); uSo = south.map((_, i) => a + pitch / 2 + i * pitch); }
    } else if (nS === nN - 1 && nS >= 1 && pointy(formN) && pointy(formS)) {
      uSo = south.map((_, i) => (uN[i] + uN[i + 1]) / 2);
    }
    const mods = [];
    const mk = (t, row, uc, i, n) => {
      const mirror = (row === 'N' ? formN : formS) === 'l' && n > 1 && i % 2 === 0;
      const F = mirror ? makeForm(row === 'N' ? formN : formS, t, p, { sideWin, mirror: true }) : t[row === 'N' ? kN : kS];
      const vc = row === 'N' ? vN + F.d / 2 : vS - F.d / 2;
      const pl = placeForm(F, uc, vc);
      // 높이 계수: 스카이라인(서→동) × 열(남저북고) × 동별 리듬
      const rhythm = (i + (row === 'S' ? 1 : 0)) % 2 === 0 ? 1 : 1 - p.heightVar / 100;
      const fct = skylineAt(uc, p) * (row === 'S' ? p.southRatio / 100 : 1) * rhythm;
      let cap = p.resMaxFloors;
      if (row === 'S' && riverFront) cap = Math.min(cap, p.riverFrontMax);
      if (lines) { const D = rule1Dist(pl.parts, lines); cap = Math.min(cap, ht.floorsFor(4 * D)); }
      return { t, row, i, form: F.form, upf: F.upf, plate: F.plate, perim: F.perim, ...pl, fct, cap, F: 5, mainS: true };
    };
    north.forEach((t, i) => mods.push(mk(t, 'N', uN[i], i, nN)));
    south.forEach((t, i) => mods.push(mk(t, 'S', uSo[i], i, nS)));
    return mods;
  }
  const unitsAt = (mods) => sum(mods.map(m => m.upf * resFloorsFor(m.F, p)));
  function solve(mods, pairs, B) {
    mods.forEach(m => { m.F = Math.max(5, Math.min(m.cap, Math.round(B * m.fct))); });
    const ok = enforce(mods, pairs, ht, coef);
    return { ok, u: unitsAt(mods) };
  }

  const nList = [];
  for (let n = types.length; n <= 12; n++) nList.push(n);
  for (let n = types.length - 1; n >= 1; n--) nList.push(n);
  let best = null;
  for (const n of nList) {
    let act = types.map((_, i) => i);
    if (n < types.length) act = act.sort((a, b) => wts[b] - wts[a]).slice(0, n);
    const ws = sum(act.map(i => wts[i]));
    const cnt = types.map(() => 0);
    act.forEach(i => { cnt[i] = Math.max(1, Math.round(n * wts[i] / ws)); });
    while (sum(cnt) > n) { let k = -1; cnt.forEach((c, i) => { if (c > 1 && (k < 0 || c > cnt[k])) k = i; }); if (k < 0) break; cnt[k]--; }
    while (sum(cnt) < n) { let k = act[0]; act.forEach(i => { if (wts[i] / cnt[i] > wts[k] / cnt[k]) k = i; }); cnt[k]++; }
    const towers = []; types.forEach((t, i) => { for (let k = 0; k < cnt[i]; k++) towers.push(t); });
    towers.sort((a, b) => b.area - a.area); // 큰 평형을 북측(뒷열, 고층)으로
    const half = Math.ceil(n / 2), splits = [];
    for (let k = half; k <= n; k++) splits.push(k);
    for (let k = half - 1; k >= 1; k--) splits.push(k);
    for (const nN of splits) {
      const north = towers.slice(0, nN), south = towers.slice(nN);
      const kN = rowW(north, 'N') <= usableW ? 'N' : rowW(north, 'Nc') <= usableW ? 'Nc' : null;
      const kS = !south.length || rowW(south, 'S') <= usableW ? 'S' : rowW(south, 'Sc') <= usableW ? 'Sc' : null;
      if (!kN || !kS) continue;
      if (south.length) {
        const dN = Math.max(...north.map(t => t[kN].d)), dS = Math.max(...south.map(t => t[kS].d));
        if ((vS - dS) - (vN + dN) < 10) continue;
      }
      const mods = layout(north, south, kN, kS);
      const pairs = pairsOf(mods);
      // 최고 B에서 가능한지 먼저 확인
      const top = solve(mods, pairs, p.resMaxFloors);
      if (!top.ok) continue;
      const cand = { n, north, south, mods, pairs, merged: n < types.length };
      if (top.u >= total) {
        let lo = 5, hi = p.resMaxFloors;
        for (let k = 0; k < 18 && hi - lo > 0.25; k++) { const mid = (lo + hi) / 2; if (solve(mods, pairs, mid).u >= total) hi = mid; else lo = mid; }
        solve(mods, pairs, hi);
        best = { ...cand, u: unitsAt(mods), ok: true };
        break;
      }
      if (!best || top.u > best.u) best = { ...cand, u: top.u, B: p.resMaxFloors };
    }
    if (best && best.ok) break;
  }
  if (!best) { warnings.push(`${block.id}: 획지가 좁아 주거동을 배치하지 못했습니다`); return []; }
  if (!best.ok) solve(best.mods, best.pairs, best.B);
  const mods = best.mods;
  if (best.u < total) warnings.push(`${block.id}: 목표 ${total}세대 중 ${best.u}세대만 배치 (높이 계획·인동간격 제약)`);
  if (best.merged) warnings.push(`${block.id}: 획지 폭이 좁아 일부 평형을 다른 동에 통합 (${mods.map(m => m.t.name).filter((x, i, a) => a.indexOf(x) === i).join('·')}만 배치)`);

  // 목표 초과분은 남측 열·낮은 동부터 층수를 낮춘다 (일조·조망에 유리). 인동간격은 층을 낮춰도 유지된다
  let excess = best.u - Math.min(total, best.u);
  const order = mods.slice().sort((a, b) => (a.row === b.row ? a.F - b.F : a.row === 'S' ? -1 : 1));
  for (const m of order) {
    while (excess >= m.upf && m.F > 5) { const before = resFloorsFor(m.F, p); m.F--; excess -= (before - resFloorsFor(m.F, p)) * m.upf; }
  }
  const out = [];
  const idx = { N: 0, S: 0 };
  mods.forEach(m => {
    const floors = stackFloors({ F: m.F, lobbyH: p.hResLobby, typH: p.hRes, typUse: 'res', plate: m.plate, upf: m.upf, refugeH: p.hRefuge, mechH: p.hMech, mechArea: Math.min(m.plate * 0.3, 260) });
    out.push({ id: `${block.id}-${m.row}${++idx[m.row]}`, block: block.id, zone: block.zone, kind: 'apt', type: m.t.key, typeName: m.t.name, upf: m.upf, row: m.row,
      form: m.form, formName: FORMS[m.form].name, parts: m.parts, rect: rectOf(m.parts), core: m.core, layout: m.units, perim: m.perim, plate: m.plate, floors });
  });

  // 포디움(근린생활·커뮤니티 = 복리시설): 두 열 사이 띠. 주거동 창에서 포디움 높이의 1배 이상 (다목)
  const nS = mods.filter(m => m.row === 'S').length;
  if (p.podiumRes > 0 && nS > 0) {
    const hp = p.podiumRes * p.hPodium, clear = Math.max(12, hp);
    const nEdge = Math.max(...mods.filter(m => m.row === 'N').map(m => rectOf(m.parts).v1));
    const sEdge = Math.min(...mods.filter(m => m.row === 'S').map(m => rectOf(m.parts).v0));
    const v0 = nEdge + clear, v1 = sEdge - clear;
    if (v1 - v0 >= 10) {
      const d = Math.min(26, v1 - v0), vc = (v0 + v1) / 2, w = usableW * 0.82;
      const fl = []; let y = 0;
      for (let lv = 1; lv <= p.podiumRes; lv++) { fl.push({ lv, name: lv + 'F', use: 'retail', h: p.hPodium, area: w * d, units: 0, y0: y, y1: y + p.hPodium, s: 1 }); y += p.hPodium; }
      const part = boxPart((uS + uE) / 2 - w / 2, (uS + uE) / 2 + w / 2, vc - d / 2, vc + d / 2, { N: 'podium', S: 'podium', E: 'podium', W: 'podium' });
      out.push({ id: `${block.id}-P`, block: block.id, zone: block.zone, kind: 'podium', parts: [part], rect: rectOf([part]), core: { u: part.cu, v: part.cv }, perim: 2 * (w + d), plate: w * d, floors: fl });
    }
  }
  return out;
}

// ---------- 업무·오피스텔 블록 ----------
function officeTowerSpecs(gfa, plateArea, maxF, p) {
  for (let n = 1; n <= 4; n++) {
    const per = gfa / n;
    let F = 1 + Math.ceil(per / plateArea);
    F += refugeLevels(F, 9 + F * p.hOffice).length;
    if (F <= maxF || n === 4) return { n, F: Math.max(3, F) };
  }
}
function rectBldg(base, rect, extra = {}) {
  const part = boxPart(rect.u0, rect.u1, rect.v0, rect.v1, ALLWIN);
  return { ...base, parts: [part], rect: { ...rect }, core: { u: part.cu, v: part.cv }, perim: 2 * (rect.u1 - rect.u0 + rect.v1 - rect.v0), plate: (rect.u1 - rect.u0) * (rect.v1 - rect.v0), ...extra };
}
function officeBlock(block, p, opts, warnings) {
  const L = block.lot, uS = L.u0 + SETBACK, uE = L.u1 - SETBACK, vN = L.v0 + SETBACK, vS = L.v1 - SETBACK;
  const W = uE - uS, D = vS - vN, out = [];
  const gfaTotal = block.area * opts.far / 100;
  const g = skylineAt((uS + uE) / 2, p);
  const podFl = opts.landmark ? 5 : 4;
  const podW = W * 0.86, podD = Math.min(D * 0.55, 70);
  const podRect = { u0: (uS + uE) / 2 - podW / 2, u1: (uS + uE) / 2 + podW / 2, v0: vS - podD, v1: vS - 1 };
  let gfaUsed = 0;
  const towerRects = [];
  const base = { block: block.id, zone: block.zone };
  // 오피스텔 타워(남측, 한강 방향)
  if (opts.officetelUnits > 0) {
    const plate = OFFICETEL.upf * OFFICETEL.area / (p.floorEff / 100);
    let cap = Math.round(Math.max(p.resMaxFloors, 30) * g);
    if (FRONT.has(block.id)) cap = Math.min(cap, Math.max(p.riverFrontMax, 12));
    let n = 1, F;
    for (; n <= 3; n++) { F = 1 + Math.ceil(opts.officetelUnits / n / OFFICETEL.upf); F += refugeLevels(F, p.hResLobby + F * p.hOfficetel).length; if (F <= cap) break; }
    n = Math.min(n, 3);
    if (F > cap && n === 3) warnings.push(`${block.id}: 오피스텔 ${opts.officetelUnits}호를 담으려면 ${F}층 타워 3개가 필요 (높이 계획상 ${cap}층)`);
    const wMax = (W - (n - 1) * SIDE_GAP) / n;
    const aspect = Math.max(0.8, Math.min(OFFICETEL.aspect, wMax * wMax / plate));
    const [w, d] = plateDims(plate, aspect);
    const us = linspace(uS + w / 2, uE - w / 2, n);
    let left = opts.officetelUnits;
    us.forEach((uc, i) => {
      const need = Math.ceil(left / (n - i));
      let Fi = 1 + Math.ceil(need / OFFICETEL.upf); Fi += refugeLevels(Fi, p.hResLobby + Fi * p.hOfficetel).length;
      const fl = stackFloors({ F: Fi, lobbyH: p.hResLobby, typH: p.hOfficetel, typUse: 'officetel', plate, upf: OFFICETEL.upf, refugeH: p.hRefuge, mechH: p.hMech, mechArea: plate * 0.3 });
      let u = unitsOf(fl); for (let k = fl.length - 2; k >= 0 && u > need; k--) { if (fl[k].use === 'officetel') { const cut = Math.min(fl[k].units, u - need); fl[k].units -= cut; u -= cut; } }
      left -= u;
      const rect = { u0: uc - w / 2, u1: uc + w / 2, v0: vS - d, v1: vS };
      out.push(rectBldg({ ...base, id: `${block.id}-OT${i + 1}`, kind: 'officetel', upf: OFFICETEL.upf, typeName: '오피스텔 45㎡', row: 'S', form: 'tower', formName: '탑상형' }, rect, { floors: fl, plate }));
      towerRects.push(rect); gfaUsed += fl.reduce((s, f) => s + f.area, 0);
    });
  }
  const podArea = podW * podD * podFl;
  if (opts.landmark) {
    const plate = 3000; const [w, d] = [60, 50];
    const F = p.landmarkFloors;
    // 세 단으로 좁아지는 실루엣 (하부 100%, 중부 88%, 상부 72%)
    const scale = (lv) => (lv <= Math.round(F * 0.42) ? 1 : lv <= Math.round(F * 0.75) ? 0.88 : 0.72);
    const fl = stackFloors({ F, lobbyH: p.hOfficeLobby, typH: p.hOffice, typUse: 'office', plate, refugeH: p.hRefuge, mechH: 14, mechArea: plate * 0.35, scale,
      podium: Array.from({ length: podFl - 1 }, () => ({ h: p.hOfficePodium, use: 'retail' })) });
    const uc = (uS + uE) / 2, vc = vN + D * 0.45;
    const rect = { u0: uc - w / 2, u1: uc + w / 2, v0: vc - d / 2, v1: vc + d / 2 };
    out.push(rectBldg({ ...base, id: `${block.id}-LM`, kind: 'landmark', form: 'tower', formName: '초고층' }, rect, { floors: fl, plate }));
    towerRects.push(rect); gfaUsed += fl.reduce((s, f) => s + f.area, 0);
  } else {
    const officeGfa = Math.max(0, gfaTotal - gfaUsed - podArea);
    if (officeGfa > 2000) {
      const plateArea = opts.zone === 'intl' ? 2200 : 1800;
      const maxF = Math.max(20, Math.round(p.officeMaxFloors * g));
      const { n, F } = officeTowerSpecs(officeGfa, plateArea, maxF, p);
      if (F > maxF) warnings.push(`${block.id}: 업무 연면적을 높이 계획(${maxF}층) 안에 담지 못해 ${F}층 타워가 필요`);
      const [w, d] = plateDims(plateArea, 1.15);
      const us = linspace(uS + w / 2, uE - w / 2, n);
      us.forEach((uc, i) => {
        const fl = stackFloors({ F, lobbyH: p.hOfficeLobby, typH: p.hOffice, typUse: 'office', plate: plateArea, refugeH: p.hRefuge, mechH: p.hMech * 1.5, mechArea: plateArea * 0.4,
          podium: Array.from({ length: Math.min(podFl - 1, F - 2) }, () => ({ h: p.hOfficePodium, use: 'retail' })) });
        const rect = { u0: uc - w / 2, u1: uc + w / 2, v0: vN, v1: vN + d };
        out.push(rectBldg({ ...base, id: `${block.id}-T${i + 1}`, kind: 'office', form: 'tower', formName: '업무 타워' }, rect, { floors: fl, plate: plateArea }));
        towerRects.push(rect);
      });
    }
  }
  const ov = r => Math.max(0, Math.min(r.u1, podRect.u1) - Math.max(r.u0, podRect.u0)) * Math.max(0, Math.min(r.v1, podRect.v1) - Math.max(r.v0, podRect.v0));
  const podNet = Math.max(0, (podRect.u1 - podRect.u0) * (podRect.v1 - podRect.v0) - towerRects.reduce((a, r) => a + ov(r), 0));
  const fl = []; let y = 0;
  for (let lv = 1; lv <= podFl; lv++) { const h = lv === 1 ? p.hOfficePodium + 1 : p.hOfficePodium; fl.push({ lv, name: lv + 'F', use: 'retail', h, area: podNet, units: 0, y0: y, y1: y + h, s: 1 }); y += h; }
  out.push(rectBldg({ ...base, id: `${block.id}-P`, kind: 'podium' }, podRect, { floors: fl, plate: podNet }));
  return out;
}

// 블록 지하층: 주차 수요 + 기계·전기실로 필요한 면적만큼만 판다.
// (예전에는 대지 전체를 B1 + 주차 2개 층 이상으로 잡아 지하 면적이 실제 단지의 두 배쯤 나왔다.
//  실제 준공 단지는 지상·지하를 합친 연면적이 세대당 135~141㎡ 안팎이다 — src/sim/bench.js 참고)
const MECH_SHARE = 0.045; // 기계·전기실·저수조·지하 공용 = 지상 연면적의 4.5%
function basement(block, bldgs, p) {
  const L = block.lot, s = SETBACK;
  const full = { u0: L.u0 + s, u1: L.u1 - s, v0: L.v0 + s, v1: L.v1 - s };
  const fullA = (full.u1 - full.u0) * (full.v1 - full.v0) * 0.9;
  let spaces = 0, above = 0, top = 0;
  bldgs.forEach(b => {
    let n = 0;
    b.floors.forEach(f => {
      if (f.lv > 0) { above += f.area; if (!f.roof) n++; }
      if (f.use === 'res') spaces += f.units * p.parkRes * (b.type === 't59' ? 0.85 : b.type === 't114' ? 1.25 : 1);
      else if (f.use === 'officetel') spaces += f.units * p.parkOfficetel;
      else if (f.use === 'office' || f.use === 'retail') spaces += f.area / p.parkOfficePer;
    });
    top = Math.max(top, n);
  });
  spaces = Math.ceil(spaces);
  const need = spaces * PARK_AREA + Math.max(400, above * MECH_SHARE);
  // 층수: 필요한 면적을 대지 안에서 담을 수 있는 만큼. 고층 동은 기초 묻힘 깊이 때문에 최소 층수가 있다
  const minLv = top >= 40 ? 3 : (top >= 12 || spaces > 150) ? 2 : 1;
  const nLv = Math.max(minLv, Math.ceil(need / fullA));
  const per = Math.min(fullA, need / nLv);
  // 파는 자리: 필요한 면적만큼 줄이되, 동이 선 자리는 모두 덮는다 (동 지하와 주차장이 이어진다)
  const k = Math.sqrt(per / fullA), cu = (full.u0 + full.u1) / 2, cv = (full.v0 + full.v1) / 2, hw = (full.u1 - full.u0) / 2 * k, hd = (full.v1 - full.v0) / 2 * k;
  const rect = { u0: cu - hw, u1: cu + hw, v0: cv - hd, v1: cv + hd };
  bldgs.forEach(b => { const r = b.rect; if (!r) return; rect.u0 = Math.min(rect.u0, r.u0 - 3); rect.u1 = Math.max(rect.u1, r.u1 + 3); rect.v0 = Math.min(rect.v0, r.v0 - 3); rect.v1 = Math.max(rect.v1, r.v1 + 3); });
  rect.u0 = Math.max(rect.u0, full.u0); rect.u1 = Math.min(rect.u1, full.u1); rect.v0 = Math.max(rect.v0, full.v0); rect.v1 = Math.min(rect.v1, full.v1);
  const floors = [{ lv: -1, name: 'B1', use: 'b1', h: p.hB1, area: per, units: 0, s: 1 }];
  for (let i = 1; i < nLv; i++) floors.push({ lv: -1 - i, name: 'B' + (1 + i), use: 'parking', h: p.hPark, area: per, units: 0, s: 1 });
  let y = 0; floors.forEach(f => { f.y1 = y; y -= f.h; f.y0 = y; });
  return { id: `${block.id}-B`, block: block.id, zone: block.zone, kind: 'basement', spaces, rect, parts: [boxPart(rect.u0, rect.u1, rect.v0, rect.v1, ALLWIN)],
    core: { u: (rect.u0 + rect.u1) / 2, v: (rect.v0 + rect.v1) / 2 }, perim: 2 * (rect.u1 - rect.u0 + rect.v1 - rect.v0), plate: per, floors, need };
}

// ---------- 전체 ----------
export function generate(pIn) {
  const p = { ...DEFAULTS, ...pIn };
  if (!TYPOLOGIES[p.typology]) p.typology = 'tower';
  PL = makePlan(p.site || resolveSite(null));
  FRONT = new Set(PL.BLOCKS.filter(b => b.front).map(b => b.id));
  const BLOCKS = PL.BLOCKS;
  const ht = heightTable(p);
  const warnings = [];
  const mixSum = (p.mix59 + p.mix84 + p.mix114) || 1;
  const supp = BLOCKS.filter(b => b.zone === 'supp'), mixed = BLOCKS.filter(b => b.zone === 'mixed');
  const officetelTotal = mixed.length ? Math.round(p.housingTarget * p.officetelShare / 100) : 0;
  const aptTotal = p.housingTarget - officetelTotal;
  // 아파트: 블록 면적 × 높이 계획 계수(스카이라인·한강 앞열)에 비례 배분
  const wOf = (b) => {
    const g = skylineAt((b.lot.u0 + b.lot.u1) / 2, p);
    const front = FRONT.has(b.id) ? Math.min(1, p.riverFrontMax / Math.max(1, p.resMaxFloors * g * p.southRatio / 100)) : 1;
    return b.area * g * (1 + p.southRatio / 100 * front) / 2;
  };
  const wSum = supp.reduce((s, b) => s + wOf(b), 0);
  const bldgs = [];
  let leftApt = aptTotal;
  supp.forEach((b, i) => {
    const share = i === supp.length - 1 ? leftApt : Math.round(aptTotal * wOf(b) / wSum);
    leftApt -= share;
    const byType = { t59: Math.round(share * p.mix59 / mixSum), t84: Math.round(share * p.mix84 / mixSum) };
    byType.t114 = Math.max(0, share - byType.t59 - byType.t84);
    bldgs.push(...housingBlock(b, byType, p, warnings, ht));
  });
  let leftOt = officetelTotal;
  mixed.forEach((b, i) => {
    const share = i === mixed.length - 1 ? leftOt : Math.round(officetelTotal / mixed.length);
    leftOt -= share;
    bldgs.push(...officeBlock(b, p, { far: p.mixedFar, officetelUnits: share, zone: 'mixed' }, warnings));
  });
  BLOCKS.filter(b => b.zone === 'intl').forEach(b => {
    bldgs.push(...officeBlock(b, p, { far: p.intlFar, officetelUnits: 0, landmark: b.id === PL.landmarkBlock, zone: 'intl' }, warnings));
  });
  // 형태 제스처: 주동·업무·오피스텔·랜드마크 타워에 (기준층부터)
  if (p.gesture && p.gesture !== 'box') {
    let seed = 0;
    bldgs.forEach(b => {
      if (!['apt', 'officetel', 'office', 'landmark'].includes(b.kind)) return;
      if (b.kind === 'landmark') b.floors.forEach(f => { if (!f.roof && f.s && f.s !== 1) { f.area /= f.s * f.s; f.s = 1; } });
      const from = (b.floors.find(f => ['res', 'officetel', 'office'].includes(f.use)) || { lv: 2 }).lv;
      const w = b.rect.u1 - b.rect.u0, d = b.rect.v1 - b.rect.v0;
      const cd = b.kind === 'apt' ? [6.5, 8.5] : b.kind === 'officetel' ? [Math.min(12, w * 0.4), Math.min(9, d * 0.45)] : [Math.max(10, w * 0.38), Math.max(10, d * 0.4)];
      applyGesture(b, p, { from, seed: seed++, coreDims: cd });
    });
  }
  BLOCKS.forEach(b => { const inb = bldgs.filter(x => x.block === b.id); if (inb.length) bldgs.push(basement(b, inb, p)); });

  bldgs.forEach(b => {
    b.height = b.kind === 'basement' ? 0 : heightOf(b.floors);
    b.top = b.floors[b.floors.length - 1].y1;
    b.gfa = b.floors.reduce((s, f) => s + f.area, 0);
    b.units = unitsOf(b.floors);
    b.storeys = b.floors.filter(f => f.lv > 0 && !f.roof).length;
    b.basementLv = b.kind === 'basement' ? b.floors.length : 0;
    b.foot = b.kind === 'basement' ? b.plate : b.parts.reduce((s, q) => s + q.w * q.d, 0);
  });
  const blocks = BLOCKS.map(bl => {
    const inb = bldgs.filter(x => x.block === bl.id && x.kind !== 'basement');
    const gfaAbove = inb.reduce((s, b) => s + b.floors.filter(f => f.lv > 0).reduce((a, f) => a + f.area, 0), 0);
    const foot = inb.reduce((s, b) => s + b.foot, 0);
    const base = bldgs.find(x => x.block === bl.id && x.kind === 'basement');
    return { id: bl.id, zone: bl.zone, area: bl.area, gfaAbove, far: gfaAbove / bl.area * 100, bcr: Math.min(100, foot / bl.area * 100),
      units: inb.reduce((s, b) => s + b.units, 0), maxFloors: Math.max(0, ...inb.map(b => b.storeys)), maxH: Math.max(0, ...inb.map(b => b.height)),
      parking: base ? base.spaces : 0, basementLv: base ? base.basementLv : 0, gfaBelow: base ? base.gfa : 0 };
  });
  // 스카이트레일: 업무복합 북측 업무 타워를 45층 높이에서 연결 (발표 계획 개념)
  const sky = [];
  const st = bldgs.filter(b => b.kind === 'office' && b.zone === 'mixed' && b.storeys >= 46).sort((a, b) => a.rect.u0 - b.rect.u0);
  for (let i = 0; i + 1 < st.length; i++) {
    const a = st[i], c = st[i + 1]; const f = a.floors.find(x => x.lv === 45);
    if (!f) continue;
    sky.push({ u0: a.rect.u1, u1: c.rect.u0, vc: (a.rect.v0 + a.rect.v1) / 2, y0: f.y0, y1: f.y0 + 6 });
  }
  const totals = summarize(bldgs, blocks, p);
  const violations = spacingCheck(bldgs, p);
  return { p, plan: PL, zones: PL.ZONES, site: PL.site, bldgs, blocks, totals, warnings, violations, sky };
}

export function summarize(bldgs, blocks, p) {
  const t = { units: 0, apt: 0, officetel: 0, byType: {}, gfaAbove: 0, gfaBelow: 0, parking: 0, byUse: {}, maxH: 0, towers: 0, floorsByUse: {}, byForm: {} };
  bldgs.forEach(b => {
    if (b.kind !== 'basement' && b.kind !== 'podium') t.towers++;
    if (b.kind === 'apt') t.byForm[b.form] = (t.byForm[b.form] || 0) + 1;
    t.maxH = Math.max(t.maxH, b.height);
    b.floors.forEach(f => {
      if (f.lv > 0) t.gfaAbove += f.area; else t.gfaBelow += f.area;
      t.byUse[f.use] = (t.byUse[f.use] || 0) + f.area;
      t.floorsByUse[f.use] = (t.floorsByUse[f.use] || 0) + 1;
      if (f.use === 'res') { t.apt += f.units; t.byType[b.type] = (t.byType[b.type] || 0) + f.units; }
      if (f.use === 'officetel') t.officetel += f.units;
    });
    if (b.kind === 'basement') t.parking += b.spaces;
  });
  t.units = t.apt + t.officetel;
  t.rental = Math.round(t.apt * (p.rentalShare || 0) / 100);
  const ZONES = PL.ZONES;
  const zoneArea = Object.values(ZONES).reduce((s, z) => s + z.area, 0);
  t.lotArea = zoneArea;
  t.far = t.gfaAbove / zoneArea * 100;
  t.zones = Object.values(ZONES).map(z => {
    const bl = blocks.filter(b => b.zone === z.key);
    const gfa = bl.reduce((s, b) => s + b.gfaAbove, 0);
    return { ...z, gfa, far: gfa / z.area * 100, units: bl.reduce((s, b) => s + b.units, 0), maxFloors: Math.max(...bl.map(b => b.maxFloors)) };
  });
  return t;
}

// 인동간격 검토 (건축법 시행령 제86조 제3항)
// · 같은 블록(같은 대지) 안 아파트 동 사이: 2호 가·나·다·라·마목. 준주거면 법정 기준, 일반상업이면 법 61조②에서 제외되므로 설계 기준
// · 블록이 다른 동 사이(도로·공원 사이): 3호에 따라 2호 가~다목 미적용 → 설계 권장으로만 표시
// · 준주거: 1호 (채광창 면에서 인접 대지경계선 중심선까지 거리의 4배 이하)
export function spacingCheck(bldgs, p) {
  const coef = p.resZone === 'semi' ? Math.max(0.5, p.spacingCoef) : p.spacingCoef;
  const law = p.resZone === 'semi';
  const out = [];
  const apts = bldgs.filter(b => b.kind === 'apt');
  const solid = bldgs.filter(b => b.kind !== 'basement');
  const H = (b) => b.height;
  for (const r of apts) {
    for (const o of solid) {
      const same = o.block === r.block;
      if (o === r) {
        // 한 동의 부분끼리 마주보는 경우 (ㄷ자 중정 등)
        r.parts.forEach((pa, ia) => r.parts.forEach((pb, ib) => {
          if (ib <= ia) return;
          const f = facing(pa, pb); if (!f || f.gap < 1) return;
          rulesFor(f, H(r), H(r), coef, true).forEach(x => { if (f.gap + 1e-6 < x.req) out.push({ a: r.id, b: r.id, rule: x.rule, gap: f.gap, req: x.req, scope: law ? 'law' : 'design', where: 'self', dir: f.axis === 'NS' ? '남북' : '동서' }); });
        }));
        continue;
      }
      if (o.kind === 'apt' && apts.indexOf(o) < apts.indexOf(r)) continue; // 아파트 쌍은 한 번만
      let worst = null;
      r.parts.forEach(pa => o.parts.forEach(pb => {
        const f = facing(pa, pb); if (!f) return;
        f.south = f.axis === 'NS' && axisSouthward(f.P, f.Q);
        const rIsP = r.parts.includes(f.P);
        const HP = rIsP ? H(r) : H(o), HQ = rIsP ? H(o) : H(r);
        const mainSP = rIsP || o.kind === 'apt';
        // 아파트가 아닌 상대(업무·오피스텔)는 모든 면에 창이 있는 것으로 본다
        if (o.kind === 'podium') { if (rIsP) f.fQ = 'podium'; else f.fP = 'podium'; }
        else if (o.kind !== 'apt') { if (rIsP) f.fQ = 'other'; else f.fP = 'other'; } // 공동주택이 아닌 상대는 아파트 창 쪽만 본다
        rulesFor(f, HP, HQ, coef, mainSP).forEach(x => {
          if (f.gap + 1e-6 >= x.req) return;
          if (!worst || x.req - f.gap > worst.req - worst.gap) worst = { a: r.id, b: o.id, rule: x.rule, gap: f.gap, req: x.req, dir: f.axis === 'NS' ? '남북' : '동서' };
        });
      }));
      if (worst) out.push({ ...worst, scope: same ? (law ? 'law' : 'design') : 'design', where: same ? 'same' : 'cross' });
    }
  }
  if (law) {
    const lineCache = new Map();
    apts.forEach(r => {
      const bl = PL.blockById.get(r.block);
      if (!lineCache.has(bl.id)) lineCache.set(bl.id, boundaryLines(bl));
      const D = rule1Dist(r.parts, lineCache.get(bl.id));
      if (r.height > 4 * D + 1e-6) out.push({ a: r.id, b: '대지경계', rule: '1호', gap: D, req: r.height / 4, scope: 'law', where: 'boundary', dir: '경계' });
    });
  }
  return out;
}

export const USE_LABEL = { res: '아파트', officetel: '오피스텔', office: '업무', retail: '근린생활·상업', lobby: '로비·커뮤니티', refuge: '피난안전층', mech: '옥탑·기계', b1: '지하1층(근생·설비)', parking: '지하주차장' };
export const RULES = {
  '가목': '채광창이 있는 벽면에서 마주보는 건물 높이의 0.5배 이상(조례)',
  '나목': '남쪽 건물이 낮고 북쪽 건물 주개구부가 남향이면 10m 이상이면서 낮은 건물 높이의 0.5배 이상',
  '다목': '부대·복리시설(포디움)과는 그 높이의 1배 이상',
  '라목': '채광창 없는 벽면과 측벽은 8m 이상',
  '마목': '측벽과 측벽은 4m 이상',
  '1호': '채광창 면에서 인접 대지경계선(도로·공원 건너면 중심선)까지 거리의 4배 이하 높이 (준주거)',
};
