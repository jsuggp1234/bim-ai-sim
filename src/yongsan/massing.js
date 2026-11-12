// 용산국제업무지구 매스 배치 엔진
// 블록별로 주거 타워(남저북고·엇배치), 업무·오피스텔 타워, 포디움, 지하층을 만들고 층별 층고·면적·세대수를 기록한다.
import { BLOCKS, ZONES } from './plan.js';

export const DEFAULTS = {
  housingTarget: 6000,  // 국제업무지구 내 주거 물량(아파트+오피스텔)
  officetelShare: 30,   // 주거 물량 중 오피스텔 비율(%) — 업무복합존에 배치
  rentalShare: 30,      // 아파트 중 공공임대 비율(%) — 동·층에 섞어 배치(소셜믹스)
  mix59: 30, mix84: 50, mix114: 20, // 아파트 세대 구성(%)
  resMaxFloors: 55,     // 주거 타워 최고 층수
  southRatio: 65,       // 남측 열 높이 / 북측 열 높이(%) — 남저북고
  spacingCoef: 0.5,     // 인동간격 계수(× 앞 건물 높이), 최소 10m
  podiumRes: 2,         // 주거 블록 근린생활·커뮤니티 포디움 층수
  typology: 'tower',    // 주거동 형식: tower(탑상형) | mixed(북측 탑상·남측 판상) | slab(판상형)
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
  housingTarget: { label: '주거 물량 (아파트+오피스텔)', unit: '호', min: 2000, max: 14000, step: 100, group: 'plan' },
  officetelShare: { label: '오피스텔 비율', unit: '%', min: 0, max: 60, step: 1, group: 'plan', note: '업무복합존 남측 타워에 배치' },
  rentalShare: { label: '공공임대 비율 (아파트 중)', unit: '%', min: 0, max: 60, step: 1, group: 'plan', note: '소셜믹스: 같은 동에 섞어 배치' },
  mix59: { label: '전용 59㎡ 비율', unit: '%', min: 0, max: 100, step: 1, group: 'res' },
  mix84: { label: '전용 84㎡ 비율', unit: '%', min: 0, max: 100, step: 1, group: 'res' },
  mix114: { label: '전용 114㎡ 비율', unit: '%', min: 0, max: 100, step: 1, group: 'res' },
  resMaxFloors: { label: '주거 최고 층수', unit: '층', min: 15, max: 80, step: 1, group: 'res' },
  southRatio: { label: '남측 동 높이 비율', unit: '%', min: 30, max: 100, step: 1, group: 'res', note: '한강 쪽 앞열을 낮춰 뒷열의 일조·조망을 확보' },
  spacingCoef: { label: '인동간격 계수', unit: '×H', min: 0.3, max: 1.2, step: 0.05, group: 'res', note: '서울시 조례 0.5H, 최소 10m' },
  podiumRes: { label: '주거 포디움 층수', unit: '층', min: 0, max: 4, step: 1, group: 'res' },
  intlFar: { label: '국제업무존 용적률', unit: '%', min: 400, max: 1700, step: 10, group: 'office', note: '발표 계획: 최대 1,700%' },
  landmarkFloors: { label: '랜드마크 층수', unit: '층', min: 50, max: 120, step: 1, group: 'office' },
  mixedFar: { label: '업무복합존 용적률', unit: '%', min: 300, max: 1500, step: 10, group: 'office' },
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
  { key: 't114', name: '114㎡', area: 114, upf: 4, aspect: 1.25 },
  { key: 't84', name: '84㎡', area: 84, upf: 4, aspect: 1.3 },
  { key: 't59', name: '59㎡', area: 59, upf: 6, aspect: 2.4 },
];
const OFFICETEL = { area: 45, upf: 10, aspect: 2.6 };
const SETBACK = 6;      // 획지 경계 건축선 후퇴
const SIDE_GAP = 12;    // 같은 열 타워 사이 최소 간격
const PARK_AREA = 33;   // 주차 1대당 지하 면적(차로 포함)

// 피난안전층 위치 (건축법 시행령 제34조: 초고층 30개 층마다, 준초고층 전체 층수 1/2 층 ±5)
export function refugeLevels(F, heightM) {
  if (F >= 50 || heightM >= 200) { const r = []; for (let l = 30; l < F; l += 30) r.push(l); return r; }
  if (F >= 30 || heightM >= 120) return [Math.round(F / 2)];
  return [];
}

const plateDims = (area, aspect) => { const w = Math.sqrt(area * aspect); return [w, area / w]; };

function stackFloors(spec) {
  // spec: { F, lobbyH, typH, typUse, plate, upf, refugeH, mechH, mechArea, podium: [{h, use, area}] , lobbyUse }
  const floors = [];
  const estH = spec.lobbyH + (spec.F - 1) * spec.typH;
  const ref = new Set(refugeLevels(spec.F, estH));
  for (let lv = 1; lv <= spec.F; lv++) {
    if (lv === 1) floors.push({ lv, name: '1F', use: spec.lobbyUse || 'lobby', h: spec.lobbyH, area: spec.plate * 0.85, units: 0 });
    else if (spec.podium && lv <= spec.podium.length + 1) { const p = spec.podium[lv - 2]; floors.push({ lv, name: lv + 'F', use: p.use, h: p.h, area: spec.plate, units: 0 }); }
    else if (ref.has(lv)) floors.push({ lv, name: lv + 'F', use: 'refuge', h: spec.refugeH, area: spec.plate, units: 0 });
    else floors.push({ lv, name: lv + 'F', use: spec.typUse, h: spec.typH, area: spec.plate, units: spec.upf || 0 });
  }
  floors.push({ lv: spec.F + 1, name: 'PH', use: 'mech', h: spec.mechH, area: spec.mechArea, units: 0, roof: true });
  let y = 0; floors.forEach(f => { f.y0 = y; y += f.h; f.y1 = y; });
  return floors;
}
const unitsOf = fl => fl.reduce((s, f) => s + f.units, 0);
const heightOf = fl => fl.filter(f => !f.roof).reduce((s, f) => s + f.h, 0);
const resFloorsFor = (F, p, typH) => { const est = p.hResLobby + (F - 1) * typH; return F - 1 - refugeLevels(F, est).length; };

function linspace(a, b, n) { if (n <= 0) return []; if (n === 1) return [(a + b) / 2]; return Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)); }

// ---------- 주거 블록 ----------
function housingBlock(block, unitsByType, p, warnings) {
  const L = block.lot, uS = L.u0 + SETBACK, uE = L.u1 - SETBACK, vN = L.v0 + SETBACK, vS = L.v1 - SETBACK;
  const usableW = uE - uS;
  const formN = p.typology === 'slab' ? 'slab' : 'tower', formS = p.typology === 'tower' ? 'tower' : 'slab';
  const dimsOf = (plate, t, form) => { if (form === 'slab') { const d = t.area <= 60 ? 12 : 13.5; return [plate / d, d]; } return plateDims(plate, t.aspect); };
  const types = APT_TYPES.filter(t => unitsByType[t.key] > 0).map(t => {
    const plate = t.upf * t.area / (p.floorEff / 100);
    const [wN, dN] = dimsOf(plate, t, formN), [wS, dS] = dimsOf(plate, t, formS);
    return { ...t, plate, N: { w: wN, d: dN, form: formN }, S: { w: wS, d: dS, form: formS }, target: unitsByType[t.key] };
  });
  const total = types.reduce((s, t) => s + t.target, 0);
  if (!total) return [];
  const wts = types.map(t => t.target / t.upf);
  const rowW = (list, row) => list.reduce((s, t) => s + t[row].w, 0) + SIDE_GAP * Math.max(0, list.length - 1);
  const sum = a => a.reduce((x, y) => x + y, 0);
  // 동 수 후보: 모든 평형을 유지하는 경우를 먼저, 안 되면 평형을 통합
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
    // 북·남 열 분할: 균형 분할을 우선, 폭이 넘치면 조정
    const half = Math.ceil(n / 2), splits = [];
    for (let k = half; k <= n; k++) splits.push(k);
    for (let k = half - 1; k >= 1; k--) splits.push(k);
    for (const nN of splits) {
      const north = towers.slice(0, nN), south = towers.slice(nN);
      if (rowW(north, 'N') > usableW || rowW(south, 'S') > usableW) continue;
      const dN = Math.max(...north.map(t => t.N.d)), dS = south.length ? Math.max(...south.map(t => t.S.d)) : 0;
      const gap = (vS - dS) - (vN + dN);
      // 남측 열 최대 높이: 인동간격 gap ≥ max(10, coef × H_s)
      let FsCap = p.resMaxFloors;
      if (south.length) {
        if (gap < 10) continue;
        FsCap = Math.max(0, Math.floor((gap / p.spacingCoef - p.hResLobby) / p.hRes) + 1);
        if (FsCap < 5) continue;
      }
      let found = null;
      for (let Fn = 6; Fn <= p.resMaxFloors; Fn++) {
        const Fs = Math.min(FsCap, Math.max(5, Math.round(Fn * p.southRatio / 100)), p.resMaxFloors);
        const u = sum(north.map(t => t.upf * resFloorsFor(Fn, p, p.hRes))) + sum(south.map(t => t.upf * resFloorsFor(Fs, p, p.hRes)));
        if (u >= total) { found = { Fn, Fs, u }; break; }
      }
      const cand = { n, north, south, dN, dS, gap, FsCap, merged: n < types.length };
      if (found) { best = { ...cand, found, ok: true }; break; }
      const FsMax = Math.min(FsCap, Math.max(5, Math.round(p.resMaxFloors * p.southRatio / 100)));
      const uMax = sum(north.map(t => t.upf * resFloorsFor(p.resMaxFloors, p, p.hRes))) + sum(south.map(t => t.upf * resFloorsFor(FsMax, p, p.hRes)));
      if (!best || uMax > best.found.u) best = { ...cand, found: { Fn: p.resMaxFloors, Fs: FsMax, u: uMax } };
    }
    if (best && best.ok) break;
  }
  if (!best) { warnings.push(`${block.id}: 획지가 좁아 주거동을 배치하지 못했습니다`); return []; }
  const { north, south, found } = best;
  if (found.u < total) warnings.push(`${block.id}: 목표 ${total}세대 중 ${found.u}세대만 배치 (최고 ${p.resMaxFloors}층·인동간격 제약)`);
  if (best.merged) warnings.push(`${block.id}: 획지 폭이 좁아 일부 평형을 다른 동에 통합 (${north.concat(south).map(t => t.name).filter((x, i, a) => a.indexOf(x) === i).join('·')}만 배치)`);

  // 위에서부터 세대를 채우되, 마지막 동들은 목표에 맞춰 층수를 줄인다
  const out = [];
  let remain = Math.min(total, found.u);
  const mk = (t, F, uc, vc, row, idx) => {
    const dm = t[row];
    const floors = stackFloors({ F, lobbyH: p.hResLobby, typH: p.hRes, typUse: 'res', plate: t.plate, upf: t.upf, refugeH: p.hRefuge, mechH: p.hMech, mechArea: t.plate * 0.3 });
    return { id: `${block.id}-${row}${idx + 1}`, block: block.id, zone: block.zone, kind: 'apt', type: t.key, typeName: t.name, upf: t.upf, row, form: dm.form,
      rect: { u0: uc - dm.w / 2, u1: uc + dm.w / 2, v0: vc - dm.d / 2, v1: vc + dm.d / 2 }, floors };
  };
  const nN = north.length, nS = south.length;
  // 한 열에 동을 고르게 분산 (실제 폭 기준)
  const place = (list, row) => {
    if (list.length === 1) return [(uS + uE) / 2];
    const w = list.map(t => t[row].w), g = (usableW - sum(w)) / (list.length - 1);
    let u = uS; return w.map(x => { const c = u + x / 2; u += x + g; return c; });
  };
  let uNorth = place(north, 'N'), uSouth = nS ? place(south, 'S') : [];
  // 탑상형 동수가 같으면 엇배치(남측 열을 반 칸 밀어 뒷열의 조망·일조 확보)
  if (nS === nN && nN >= 2 && formN === 'tower' && formS === 'tower') {
    const wm = Math.max(...north.map(t => t.N.w), ...south.map(t => t.S.w));
    const a = uS + wm / 2, b = uE - wm / 2, pitch = (b - a) / (nN - 0.5);
    if (pitch - wm >= SIDE_GAP) { uNorth = north.map((_, i) => a + i * pitch); uSouth = south.map((_, i) => a + pitch / 2 + i * pitch); }
  } else if (nS === nN - 1 && nS >= 1 && formN === 'tower' && formS === 'tower') {
    uSouth = south.map((_, i) => (uNorth[i] + uNorth[i + 1]) / 2);
  }
  const specs = [
    ...north.map((t, i) => ({ t, F: found.Fn, uc: uNorth[i], vc: vN + t.N.d / 2, row: 'N', i })),
    ...south.map((t, i) => ({ t, F: found.Fs, uc: uSouth[i], vc: vS - t.S.d / 2, row: 'S', i })),
  ];
  // 목표 초과분은 남측 열부터 층수를 낮춰 맞춘다 (일조·조망에 유리)
  let excess = found.u - remain;
  for (const s of specs.slice().reverse()) {
    while (excess >= s.t.upf && s.F > 5) { const before = resFloorsFor(s.F, p, p.hRes); s.F--; excess -= (before - resFloorsFor(s.F, p, p.hRes)) * s.t.upf; }
  }
  specs.forEach(s => out.push(mk(s.t, s.F, s.uc, s.vc, s.row, s.i)));

  // 포디움(근린생활·커뮤니티): 두 열 사이 띠, 인동간격과 무관한 저층
  if (p.podiumRes > 0 && nS > 0) {
    const v0 = vN + best.dN + 12, v1 = vS - best.dS - 12;
    if (v1 - v0 >= 10) {
      const d = Math.min(26, v1 - v0), vc = (v0 + v1) / 2, w = usableW * 0.82;
      const fl = []; let y = 0;
      for (let lv = 1; lv <= p.podiumRes; lv++) { fl.push({ lv, name: lv + 'F', use: 'retail', h: p.hPodium, area: w * d, units: 0, y0: y, y1: y + p.hPodium }); y += p.hPodium; }
      out.push({ id: `${block.id}-P`, block: block.id, zone: block.zone, kind: 'podium', rect: { u0: (uS + uE) / 2 - w / 2, u1: (uS + uE) / 2 + w / 2, v0: vc - d / 2, v1: vc + d / 2 }, floors: fl });
    }
  }
  return out;
}

// ---------- 업무·오피스텔 블록 ----------
function officeTowerSpecs(gfa, plateArea, maxF, p) {
  // 필요 층수 → 최고 층수 이하가 되도록 타워 수 증가
  for (let n = 1; n <= 4; n++) {
    const per = gfa / n;
    let F = 1 + Math.ceil(per / plateArea);
    F += refugeLevels(F, 9 + F * p.hOffice).length;
    if (F <= maxF || n === 4) return { n, F: Math.max(3, F) };
  }
}
function officeBlock(block, p, opts, warnings) {
  const L = block.lot, uS = L.u0 + SETBACK, uE = L.u1 - SETBACK, vN = L.v0 + SETBACK, vS = L.v1 - SETBACK;
  const W = uE - uS, D = vS - vN, out = [];
  const gfaTotal = block.area * opts.far / 100;
  // 포디움: 저층 상업·로비
  const podFl = opts.landmark ? 5 : 4;
  const podW = W * 0.86, podD = Math.min(D * 0.55, 70);
  // 타워 입면과 같은 면이 겹치지 않도록 남측 경계에서 1m 안쪽
  const podRect = { u0: (uS + uE) / 2 - podW / 2, u1: (uS + uE) / 2 + podW / 2, v0: vS - podD, v1: vS - 1 };
  let gfaUsed = 0;
  const towerRects = [];
  // 오피스텔 타워(남측, 한강 방향)
  if (opts.officetelUnits > 0) {
    const plate = OFFICETEL.upf * OFFICETEL.area / (p.floorEff / 100);
    let n = 1, F;
    for (; n <= 3; n++) { F = 1 + Math.ceil(opts.officetelUnits / n / OFFICETEL.upf); F += refugeLevels(F, p.hResLobby + F * p.hOfficetel).length; if (F <= Math.max(p.resMaxFloors, 30)) break; }
    n = Math.min(n, 3);
    if (F > Math.max(p.resMaxFloors, 30) && n === 3) warnings.push(`${block.id}: 오피스텔 ${opts.officetelUnits}호를 담으려면 ${F}층 타워 3개가 필요`);
    // 여러 동이면 측면 간격 12m를 지키도록 평면을 정방형 쪽으로 조정
    const wMax = (W - (n - 1) * SIDE_GAP) / n;
    const aspect = Math.max(0.8, Math.min(OFFICETEL.aspect, wMax * wMax / plate));
    const [w, d] = plateDims(plate, aspect);
    const us = linspace(uS + w / 2, uE - w / 2, n);
    let left = opts.officetelUnits;
    us.forEach((uc, i) => {
      const need = Math.ceil(left / (n - i));
      let Fi = 1 + Math.ceil(need / OFFICETEL.upf); Fi += refugeLevels(Fi, p.hResLobby + Fi * p.hOfficetel).length;
      const fl = stackFloors({ F: Fi, lobbyH: p.hResLobby, typH: p.hOfficetel, typUse: 'officetel', plate, upf: OFFICETEL.upf, refugeH: p.hRefuge, mechH: p.hMech, mechArea: plate * 0.3 });
      // 마지막 층 호수 보정
      let u = unitsOf(fl); for (let k = fl.length - 2; k >= 0 && u > need; k--) { if (fl[k].use === 'officetel') { const cut = Math.min(fl[k].units, u - need); fl[k].units -= cut; u -= cut; } }
      left -= u;
      const rect = { u0: uc - w / 2, u1: uc + w / 2, v0: vS - d, v1: vS };
      out.push({ id: `${block.id}-OT${i + 1}`, block: block.id, zone: block.zone, kind: 'officetel', upf: OFFICETEL.upf, typeName: '오피스텔 45㎡', row: 'S', rect, floors: fl });
      towerRects.push(rect); gfaUsed += fl.reduce((s, f) => s + f.area, 0);
    });
  }
  // 랜드마크 또는 업무 타워(북측)
  const podArea = podW * podD * podFl;
  if (opts.landmark) {
    const plate = 3000; const [w, d] = [60, 50];
    const fl = stackFloors({ F: p.landmarkFloors, lobbyH: p.hOfficeLobby, typH: p.hOffice, typUse: 'office', plate, refugeH: p.hRefuge, mechH: 14, mechArea: plate * 0.5,
      podium: Array.from({ length: podFl - 1 }, () => ({ h: p.hOfficePodium, use: 'retail' })) });
    const uc = (uS + uE) / 2, vc = vN + D * 0.45;
    const rect = { u0: uc - w / 2, u1: uc + w / 2, v0: vc - d / 2, v1: vc + d / 2 };
    out.push({ id: `${block.id}-LM`, block: block.id, zone: block.zone, kind: 'landmark', rect, floors: fl });
    towerRects.push(rect); gfaUsed += fl.reduce((s, f) => s + f.area, 0);
  } else {
    const officeGfa = Math.max(0, gfaTotal - gfaUsed - podArea);
    if (officeGfa > 2000) {
      const plateArea = opts.zone === 'intl' ? 2200 : 1800;
      const { n, F } = officeTowerSpecs(officeGfa, plateArea, p.officeMaxFloors, p);
      if (F > p.officeMaxFloors) warnings.push(`${block.id}: 업무 연면적을 ${p.officeMaxFloors}층 이하로 담지 못해 ${F}층 타워가 필요`);
      const [w, d] = plateDims(plateArea, 1.15);
      const us = linspace(uS + w / 2, uE - w / 2, n);
      us.forEach((uc, i) => {
        const fl = stackFloors({ F, lobbyH: p.hOfficeLobby, typH: p.hOffice, typUse: 'office', plate: plateArea, refugeH: p.hRefuge, mechH: p.hMech * 1.5, mechArea: plateArea * 0.4,
          podium: Array.from({ length: Math.min(podFl - 1, F - 2) }, () => ({ h: p.hOfficePodium, use: 'retail' })) });
        const rect = { u0: uc - w / 2, u1: uc + w / 2, v0: vN, v1: vN + d };
        out.push({ id: `${block.id}-T${i + 1}`, block: block.id, zone: block.zone, kind: 'office', rect, floors: fl });
        towerRects.push(rect);
      });
    }
  }
  // 포디움 (포디움과 겹치는 타워 바닥면적 제외)
  const ov = r => Math.max(0, Math.min(r.u1, podRect.u1) - Math.max(r.u0, podRect.u0)) * Math.max(0, Math.min(r.v1, podRect.v1) - Math.max(r.v0, podRect.v0));
  const podNet = Math.max(0, (podRect.u1 - podRect.u0) * (podRect.v1 - podRect.v0) - towerRects.reduce((a, r) => a + ov(r), 0));
  const fl = []; let y = 0;
  for (let lv = 1; lv <= podFl; lv++) { const h = lv === 1 ? p.hOfficePodium + 1 : p.hOfficePodium; fl.push({ lv, name: lv + 'F', use: 'retail', h, area: podNet, units: 0, y0: y, y1: y + h }); y += h; }
  out.push({ id: `${block.id}-P`, block: block.id, zone: block.zone, kind: 'podium', rect: podRect, floors: fl });
  return out;
}

// 블록 지하층: 주차 수요로 층수 산정
function basement(block, bldgs, p) {
  const L = block.lot;
  const foot = (L.u1 - L.u0 - 2 * SETBACK) * (L.v1 - L.v0 - 2 * SETBACK) * 0.9;
  let spaces = 0;
  bldgs.forEach(b => b.floors.forEach(f => {
    if (f.use === 'res') spaces += f.units * p.parkRes * (b.type === 't59' ? 0.85 : b.type === 't114' ? 1.25 : 1);
    else if (f.use === 'officetel') spaces += f.units * p.parkOfficetel;
    else if (f.use === 'office' || f.use === 'retail') spaces += f.area / p.parkOfficePer;
  }));
  spaces = Math.ceil(spaces);
  const parkLv = Math.max(2, Math.ceil(spaces * PARK_AREA / foot));
  const floors = [{ lv: -1, name: 'B1', use: 'b1', h: p.hB1, area: foot, units: 0 }];
  for (let i = 0; i < parkLv; i++) floors.push({ lv: -2 - i, name: 'B' + (2 + i), use: 'parking', h: p.hPark, area: foot, units: 0 });
  let y = 0; floors.forEach(f => { f.y1 = y; y -= f.h; f.y0 = y; });
  const s = SETBACK;
  return { id: `${block.id}-B`, block: block.id, zone: block.zone, kind: 'basement', spaces,
    rect: { u0: L.u0 + s, u1: L.u1 - s, v0: L.v0 + s, v1: L.v1 - s }, floors };
}

// ---------- 전체 ----------
export function generate(pIn) {
  const p = { ...DEFAULTS, ...pIn };
  const warnings = [];
  const mixSum = (p.mix59 + p.mix84 + p.mix114) || 1;
  const officetelTotal = Math.round(p.housingTarget * p.officetelShare / 100);
  const aptTotal = p.housingTarget - officetelTotal;
  const supp = BLOCKS.filter(b => b.zone === 'supp'), mixed = BLOCKS.filter(b => b.zone === 'mixed');
  const suppArea = supp.reduce((s, b) => s + b.area, 0);
  const bldgs = [];
  // 아파트: 블록 면적 비례 배분, 유형 비율 적용
  let leftApt = aptTotal;
  supp.forEach((b, i) => {
    const share = i === supp.length - 1 ? leftApt : Math.round(aptTotal * b.area / suppArea);
    leftApt -= share;
    const byType = { t59: Math.round(share * p.mix59 / mixSum), t84: Math.round(share * p.mix84 / mixSum) };
    byType.t114 = Math.max(0, share - byType.t59 - byType.t84);
    bldgs.push(...housingBlock(b, byType, p, warnings));
  });
  let leftOt = officetelTotal;
  mixed.forEach((b, i) => {
    const share = i === mixed.length - 1 ? leftOt : Math.round(officetelTotal / mixed.length);
    leftOt -= share;
    bldgs.push(...officeBlock(b, p, { far: p.mixedFar, officetelUnits: share, zone: 'mixed' }, warnings));
  });
  BLOCKS.filter(b => b.zone === 'intl').forEach(b => {
    bldgs.push(...officeBlock(b, p, { far: p.intlFar, officetelUnits: 0, landmark: b.id === 'A1', zone: 'intl' }, warnings));
  });
  // 지하층
  BLOCKS.forEach(b => { const inb = bldgs.filter(x => x.block === b.id); if (inb.length) bldgs.push(basement(b, inb, p)); });

  // 집계
  bldgs.forEach(b => {
    b.height = b.kind === 'basement' ? 0 : heightOf(b.floors);
    b.top = b.floors[b.floors.length - 1].y1;
    b.gfa = b.floors.reduce((s, f) => s + f.area, 0);
    b.units = unitsOf(b.floors);
    b.storeys = b.floors.filter(f => f.lv > 0 && !f.roof).length;
    b.basementLv = b.kind === 'basement' ? b.floors.length : 0;
  });
  const blocks = BLOCKS.map(bl => {
    const inb = bldgs.filter(x => x.block === bl.id && x.kind !== 'basement');
    const gfaAbove = inb.reduce((s, b) => s + b.floors.filter(f => f.lv > 0).reduce((a, f) => a + f.area, 0), 0);
    const foot = inb.reduce((s, b) => s + (b.rect.u1 - b.rect.u0) * (b.rect.v1 - b.rect.v0), 0);
    const base = bldgs.find(x => x.block === bl.id && x.kind === 'basement');
    return { id: bl.id, zone: bl.zone, area: bl.area, gfaAbove, far: gfaAbove / bl.area * 100, bcr: Math.min(100, foot / bl.area * 100),
      units: inb.reduce((s, b) => s + b.units, 0), maxFloors: Math.max(0, ...inb.map(b => b.storeys)), maxH: Math.max(0, ...inb.map(b => b.height)),
      parking: base ? base.spaces : 0, basementLv: base ? base.basementLv : 0, gfaBelow: base ? base.gfa : 0 };
  });
  // 스카이트레일: 업무복합 북측 업무 타워를 45층 높이에서 연결 (계획 개념)
  const sky = [];
  const st = bldgs.filter(b => b.kind === 'office' && b.zone === 'mixed' && b.storeys >= 46).sort((a, b) => a.rect.u0 - b.rect.u0);
  for (let i = 0; i + 1 < st.length; i++) {
    const a = st[i], c = st[i + 1]; const f = a.floors.find(x => x.lv === 45);
    if (!f) continue;
    sky.push({ u0: a.rect.u1, u1: c.rect.u0, vc: (a.rect.v0 + a.rect.v1) / 2, y0: f.y0, y1: f.y0 + 6 });
  }
  const totals = summarize(bldgs, blocks, p);
  const violations = spacingCheck(bldgs, p);
  return { p, bldgs, blocks, totals, warnings, violations, sky };
}

export function summarize(bldgs, blocks, p) {
  const t = { units: 0, apt: 0, officetel: 0, byType: {}, gfaAbove: 0, gfaBelow: 0, parking: 0, byUse: {}, maxH: 0, towers: 0, floorsByUse: {} };
  bldgs.forEach(b => {
    if (b.kind !== 'basement' && b.kind !== 'podium') t.towers++;
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

// 인동간격 검토: 주거동의 창이 마주보는 앞 건물과의 거리
export function spacingCheck(bldgs, p) {
  const out = [];
  const res = bldgs.filter(b => b.kind === 'apt' || b.kind === 'officetel');
  const solid = bldgs.filter(b => b.kind !== 'basement' && b.kind !== 'podium');
  for (const r of res) {
    for (const o of solid) {
      if (o === r) continue;
      const ou = Math.min(r.rect.u1, o.rect.u1) - Math.max(r.rect.u0, o.rect.u0);
      const ov = Math.min(r.rect.v1, o.rect.v1) - Math.max(r.rect.v0, o.rect.v0);
      if (ou > 0 && o.rect.v0 >= r.rect.v1) { // o가 r의 남측(앞)
        const gap = o.rect.v0 - r.rect.v1, req = Math.max(10, p.spacingCoef * Math.min(o.height, r.height));
        if (gap < req - 0.01) out.push({ a: r.id, b: o.id, dir: '남측', gap, req });
      } else if (ou > 0 && o.rect.v1 <= r.rect.v0) { // o가 북측
        const gap = r.rect.v0 - o.rect.v1, req = 10;
        if (gap < req - 0.01) out.push({ a: r.id, b: o.id, dir: '북측', gap, req });
      } else if (ov > 0) { // 측면
        const gap = o.rect.u0 >= r.rect.u1 ? o.rect.u0 - r.rect.u1 : r.rect.u0 - o.rect.u1;
        if (gap >= 0 && gap < 10 - 0.01) out.push({ a: r.id, b: o.id, dir: '측면', gap, req: 10 });
      }
    }
  }
  return out;
}

export const USE_LABEL = { res: '아파트', officetel: '오피스텔', office: '업무', retail: '근린생활·상업', lobby: '로비·커뮤니티', refuge: '피난안전층', mech: '옥탑·기계', b1: '지하1층(근생·설비)', parking: '지하주차장' };
