// 대지·블록 계획: 택지 설명자(sites.js) → 블록 격자·존·조망 대상
// 좌표계: 대지 좌표 (u, v, y) — u는 대지 장축(동쪽 +), v는 단축(남쪽 +), y는 높이(m)
// 월드 좌표 (x, y, z) — x 동쪽, z 남쪽. 대지 장축은 동쪽에서 남쪽으로 rot도 기울어 있다.
import { siteFrom, DEFAULT_SITE_ID } from './sites.js';

function frame(rotDeg) {
  const R = rotDeg * Math.PI / 180, COS = Math.cos(R), SIN = Math.sin(R);
  return {
    rotDeg, cos: COS, sin: SIN,
    toWorld: (u, v) => [u * COS - v * SIN, u * SIN + v * COS],
    toSite: (x, z) => [x * COS + z * SIN, -x * SIN + z * COS],
    dirToSite: ([x, y, z]) => [x * COS + z * SIN, y, -x * SIN + z * COS],
  };
}

// 셀 → 획지: 존별 목표 면적에 맞춰 셀을 균일하게 안쪽으로 줄인다 (나머지는 보도·공개공지·녹지)
function shrinkTo(cells, target) {
  const sum = cells.reduce((s, c) => s + c.cellArea, 0);
  const scale = Math.min(1, target / sum);
  cells.forEach(c => {
    const w = c.cell.u1 - c.cell.u0, d = c.cell.v1 - c.cell.v0, t = c.cellArea * scale;
    const a = 4, b = -2 * (w + d), cc = w * d - t;
    const m = Math.max(0, (-b - Math.sqrt(Math.max(0, b * b - 4 * a * cc))) / (2 * a));
    c.lot = { u0: c.cell.u0 + m, u1: c.cell.u1 - m, v0: c.cell.v0 + m, v1: c.cell.v1 - m };
    c.area = (c.lot.u1 - c.lot.u0) * (c.lot.v1 - c.lot.v0);
    c.margin = m;
  });
}

// ---------- 용산국제업무지구 (발표 존 면적·블록 격자) ----------
function yongsanPlan(site) {
  const F = frame(20);
  const SITE = { u0: -575, u1: 575, v0: -215, v1: 215, area: 495000 };
  const ZONES = {
    intl: { key: 'intl', name: '국제업무존', area: 82938, color: '--office' },
    mixed: { key: 'mixed', name: '업무복합존', area: 81036, color: '--officetel' },
    supp: { key: 'supp', name: '업무지원존(주거)', area: 93723, color: '--res' },
  };
  const COLS = [[-555, -445], [-420, -310], [-285, -175], [-150, -40], [-15, 95], [120, 230], [255, 365], [390, 555]];
  const ROWS = { N: [-195, -40], S: [40, 195] };
  const ASSIGN = [
    ['C1', 'supp', 'S', 0], ['C2', 'supp', 'S', 1], ['C3', 'supp', 'S', 2], ['C4', 'supp', 'S', 3], ['C5', 'supp', 'N', 0], ['C6', 'supp', 'N', 1],
    ['B1', 'mixed', 'N', 2], ['B2', 'mixed', 'N', 3], ['B3', 'mixed', 'N', 4], ['B4', 'mixed', 'S', 4], ['B5', 'mixed', 'S', 5], ['B6', 'mixed', 'S', 6],
    ['A1', 'intl', 'N', 7], ['A2', 'intl', 'N', 6], ['A3', 'intl', 'N', 5], ['A4', 'intl', 'S', 7],
  ];
  const cells = ASSIGN.map(([id, zone, row, ci]) => {
    const [u0, u1] = COLS[ci], [v0, v1] = ROWS[row];
    return { id, zone, row, front: row === 'S', cell: { u0, u1, v0, v1 }, cellArea: (u1 - u0) * (v1 - v0) };
  });
  for (const zk of Object.keys(ZONES)) shrinkTo(cells.filter(c => c.zone === zk), ZONES[zk].area);
  // 주변 맥락 (근사). [u, v, w, d, 층수, 용도, 이름]
  const C = [];
  const add = (u, v, w, d, fl, use, name) => C.push({ u, v, w, d, fl, use, name });
  [[-520, 12], [-420, 12], [-320, 15], [-220, 15], [-120, 13], [-20, 13], [80, 15], [180, 15]].forEach(([u, f]) => add(u, 290, 70, 14, f, 'res', '서부이촌동 아파트'));
  [-500, -380, -260, -140, -20, 100, 220].forEach(u => add(u, 380, 80, 55, 4, 'res', '서부이촌동 저층 주거'));
  [[-450, 15], [-330, 18], [-210, 20], [-90, 15], [30, 18], [150, 20], [270, 15]].forEach(([u, f]) => add(u, 470, 60, 15, f, 'res', '이촌동 아파트'));
  add(720, -60, 160, 180, 10, 'com', '용산역·아이파크몰');
  add(760, -300, 80, 40, 38, 'com', '드래곤시티(호텔)');
  add(890, -10, 38, 30, 39, 'res', '신용산 주상복합 A');
  add(955, -55, 38, 30, 39, 'res', '신용산 주상복합 B');
  add(930, 120, 40, 30, 40, 'res', '신용산 주상복합 C');
  add(995, 70, 40, 30, 40, 'res', '신용산 주상복합 D');
  add(1010, -210, 100, 100, 27, 'com', '신용산 업무 빌딩');
  add(1150, -90, 40, 35, 43, 'res', '신용산 주상복합 E');
  add(1150, 10, 40, 35, 43, 'res', '신용산 주상복합 F');
  [[0, 7], [160, 8], [320, 7], [470, 6]].forEach(([u, f]) => add(u, -420, 120, 70, f, 'com', '용산전자상가'));
  [[-600, 15], [-480, 15], [-360, 12]].forEach(([u, f]) => add(u, -420, 60, 15, f, 'res', '원효로 아파트'));
  add(-240, -430, 80, 60, 5, 'res', '원효로 저층 주거');
  add(-560, -540, 80, 60, 4, 'res', '원효로 저층 주거');
  add(-420, -540, 80, 60, 4, 'res', '원효로 저층 주거');
  add(-760, 150, 70, 15, 15, 'res', '산천동 아파트');
  add(-760, 30, 70, 15, 15, 'res', '산천동 아파트');
  add(-800, -120, 80, 60, 5, 'res', '산천동 저층 주거');
  add(-720, -290, 60, 40, 12, 'com', '원효로 업무');
  const CONTEXT = C.map((c, i) => ({
    id: 'X' + String(i + 1).padStart(2, '0'), name: c.name, use: c.use, floors: c.fl,
    u0: c.u - c.w / 2, u1: c.u + c.w / 2, v0: c.v - c.d / 2, v1: c.v + c.d / 2, y0: 0, y1: c.fl * (c.use === 'res' ? 2.9 : 4.0),
  }));
  const BANDS = [
    { name: '철도(경의중앙선·차량기지)', u0: -1400, u1: 640, v0: -330, v1: -230, kind: 'rail' },
    { name: '이촌로', u0: -1400, u1: 1400, v0: 222, v1: 240, kind: 'road' },
    { name: '강변북로', u0: -3200, u1: 3200, v0: 570, v1: 605, kind: 'road' },
    { name: '선형 공원', u0: -555, u1: 555, v0: -40, v1: 40, kind: 'park' },
  ];
  const a1 = cells.find(b => b.id === 'A1');
  // 남산서울타워 꼭대기 (해발 약 480m, 대지 기준 약 470m), 한강 수면 31점
  return finish({
    key: 'yongsan', site, ...F, SITE, ZONES, BLOCKS: cells, CONTEXT, BANDS, roads: [], publics: [],
    focalU: (a1.lot.u0 + a1.lot.u1) / 2, landmarkBlock: 'A1',
    views: {
      water: { name: '한강', targets: Array.from({ length: 31 }, (_, i) => [-1500 + i * 100, 700, 0]) },
      peak: { name: '남산', pt: [1317, -3401, 470] },
    },
  });
}

// ---------- 일반 택지: 직사각형 근사 + 블록 격자 ----------
const ROAD_W = 20, EDGE = 12, SPINE_W = 40;
function genericPlan(site) {
  const F = frame(Math.max(-45, Math.min(45, site.rot || 0)));
  const A = site.area, asp = Math.max(1, site.aspect || 1.5);
  const W = Math.sqrt(A * asp), D = A / W;
  const SITE = { u0: -W / 2, u1: W / 2, v0: -D / 2, v1: D / 2, area: A };
  const tiny = A < 30000;
  const edge = tiny ? 4 : EDGE;
  // 열·행 나누기 (블록 폭 약 110~170m, 깊이 약 150~190m)
  const nc = tiny ? 1 : Math.max(1, Math.round((W - 2 * edge) / 150));
  const spine = !tiny && D >= 420 ? SPINE_W : 0;
  const halves = spine ? 2 : 1;
  const depthAvail = (D - 2 * edge - spine) / halves;
  const nrh = tiny ? 1 : Math.max(1, Math.round(depthAvail / 175));
  const cw = (W - 2 * edge - (nc - 1) * ROAD_W) / nc;
  const rd = (depthAvail - (nrh - 1) * ROAD_W) / nrh;
  const rowsV = [];
  for (let h = 0; h < halves; h++) {
    const vStart = SITE.v0 + edge + h * (depthAvail + spine);
    for (let r = 0; r < nrh; r++) { const v0 = vStart + r * (rd + ROAD_W); rowsV.push([v0, v0 + rd]); }
  }
  const colsU = Array.from({ length: nc }, (_, i) => { const u0 = SITE.u0 + edge + i * (cw + ROAD_W); return [u0, u0 + cw]; });
  const nr = rowsV.length;
  const cells = [];
  rowsV.forEach(([v0, v1], ri) => colsU.forEach(([u0, u1], ci) => {
    cells.push({ ri, ci, row: ri < nr / 2 ? 'N' : 'S', cell: { u0, u1, v0, v1 }, cellArea: (u1 - u0) * (v1 - v0), cu: (u0 + u1) / 2, cv: (v0 + v1) / 2 });
  }));
  // 주택·복합 블록 수: 가용 택지비율(순면적)에 맞춤. 나머지 셀은 공원·학교 (중심에서 시작해 고르게 흩어 놓음)
  const SIDE = tiny ? 2 : 6; // 보도·공개공지
  const lotArea = (c) => Math.max(0, (c.cell.u1 - c.cell.u0 - 2 * SIDE) * (c.cell.v1 - c.cell.v0 - 2 * SIDE));
  const target = A * (site.netRatio || 50) / 100;
  let need = cells.length;
  { let acc = 0; const sorted = cells.map(lotArea).sort((a, b) => b - a); need = 0; for (const a of sorted) { if (acc >= target) break; acc += a; need++; } need = Math.max(1, need); }
  const publics = [];
  const nPub = cells.length - need;
  if (nPub > 0) {
    // 최원점 표본: 대지 중심에 가장 가까운 셀부터, 이미 고른 셀에서 가장 먼 셀 순서
    const picked = [];
    const d2 = (a, b) => (a.cu - b.cu) ** 2 + (a.cv - b.cv) ** 2;
    let first = cells.reduce((best, c) => (best == null || c.cu ** 2 + c.cv ** 2 < best.cu ** 2 + best.cv ** 2 ? c : best), null);
    picked.push(first);
    while (picked.length < nPub) {
      let best = null, bd = -1;
      cells.forEach(c => { if (picked.includes(c)) return; const m = Math.min(...picked.map(p => d2(p, c))); if (m > bd) { bd = m; best = c; } });
      picked.push(best);
    }
    const nSchool = Math.min(Math.floor(picked.length / 2), Math.max(0, Math.round((site.units || 0) / 3500)));
    picked.forEach((c, i) => { c.public = i >= 1 && i <= nSchool ? 'school' : 'park'; publics.push({ id: (c.public === 'school' ? 'S' : 'P') + (i + 1), kind: c.public, rect: { ...c.cell } }); });
  }
  let lots = cells.filter(c => !c.public);
  // 복합(업무·오피스텔) 블록: 주거 비율이 100% 미만이면 대지 동쪽 끝 중앙 행부터
  const nMixed = lots.length > 1 ? Math.round(lots.length * (1 - (site.resShare ?? 100) / 100)) : 0;
  const midV = (SITE.v0 + SITE.v1) / 2;
  lots.sort((a, b) => (b.cu - a.cu) || (Math.abs(a.cv - midV) - Math.abs(b.cv - midV)));
  lots.forEach((c, i) => { c.zone = i < nMixed ? 'mixed' : 'supp'; });
  // 번호: 서→동, 북→남
  lots.sort((a, b) => a.ci - b.ci || a.ri - b.ri);
  let nS = 0, nM = 0;
  lots.forEach(c => { c.id = c.zone === 'mixed' ? 'M' + (++nM) : 'R' + (++nS); });
  // 수변이 대지 남쪽 1.5km 안이면 남측 행이 앞열(높이 제한 적용)
  const water = site.features && site.features.water;
  let frontRow = null;
  if (water && water.pts && water.pts.length) {
    const [cx, cz] = water.pts[Math.floor(water.pts.length / 2)];
    const [, wv] = F.toSite(cx, cz);
    if (Math.abs(wv) < 1800) frontRow = wv > 0 ? 'S' : 'N';
  }
  const lastRow = nr - 1;
  lots.forEach(c => { c.front = frontRow === 'S' ? c.ri === lastRow : frontRow === 'N' ? c.ri === 0 : false; });
  lots.forEach(c => { c.lot = { u0: c.cell.u0 + SIDE, u1: c.cell.u1 - SIDE, v0: c.cell.v0 + SIDE, v1: c.cell.v1 - SIDE }; c.area = lotArea(c); c.margin = SIDE; });
  const ZONES = {};
  const zArea = (z) => lots.filter(c => c.zone === z).reduce((s, c) => s + c.area, 0);
  ZONES.supp = { key: 'supp', name: '주거 블록', area: zArea('supp'), color: '--res' };
  if (nMixed) ZONES.mixed = { key: 'mixed', name: '복합 블록(업무·오피스텔)', area: zArea('mixed'), color: '--officetel' };
  // 내부 도로·선형 공원 (그리기용)
  const roads = [];
  for (let i = 1; i < nc; i++) { const u = colsU[i][0] - ROAD_W / 2; roads.push({ u0: u - ROAD_W / 2, u1: u + ROAD_W / 2, v0: SITE.v0 + edge, v1: SITE.v1 - edge }); }
  for (let i = 1; i < nr; i++) { const a = rowsV[i - 1][1], b = rowsV[i][0]; if (b - a > ROAD_W + 1) continue; roads.push({ u0: SITE.u0 + edge, u1: SITE.u1 - edge, v0: a, v1: b }); }
  const BANDS = [];
  if (spine) BANDS.push({ name: '선형 공원', u0: SITE.u0 + edge, u1: SITE.u1 - edge, v0: rowsV[nrh - 1][1], v1: rowsV[nrh][0], kind: 'park' });
  const mixedLots = lots.filter(c => c.zone === 'mixed');
  const focalU = mixedLots.length ? mixedLots.reduce((s, c) => s + c.cu, 0) / mixedLots.length : SITE.u1 * 0.55;
  // 조망 대상 (월드 → 대지 좌표)
  const views = { water: null, peak: null };
  if (water && water.pts) views.water = { name: water.name, targets: water.pts.map(([x, z]) => { const [u, v] = F.toSite(x, z); return [u, v, 0]; }) };
  const pk = site.features && site.features.peak;
  if (pk) { const [u, v] = F.toSite(pk.x, pk.z); views.peak = { name: pk.name, pt: [u, v, pk.h] }; }
  return finish({ key: site.id, site, ...F, SITE, ZONES, BLOCKS: lots, CONTEXT: [], BANDS, roads, publics, focalU, landmarkBlock: null, views });
}

function finish(pl) {
  pl.lat = pl.site.lat;
  pl.blockById = new Map(pl.BLOCKS.map(b => [b.id, b]));
  return pl;
}

const cache = new Map();
export function makePlan(site) {
  const s = site || siteFrom(DEFAULT_SITE_ID);
  const key = JSON.stringify([s.id, s.area, s.aspect, s.rot, s.netRatio, s.resShare, s.units, s.features]);
  if (cache.has(key)) return cache.get(key);
  const pl = s.id === 'yongsan' && !s.generic ? yongsanPlan(s) : genericPlan(s);
  if (cache.size > 24) cache.clear();
  cache.set(key, pl);
  return pl;
}
export const defaultPlan = () => makePlan(siteFrom(DEFAULT_SITE_ID));
