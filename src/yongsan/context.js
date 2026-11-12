// 광역 맥락(화면을 채우는 배경): 한강 양안·여의도·노량진·흑석·이촌·원효로·마포·서울역·용산공원·남산
// 실제 건물 데이터(OpenStreetMap)를 이 환경에서 받을 수 없어, 알려진 지리를 바탕으로 구역마다 건물 유형과 층수를 정해 절차적으로 만든다.
// 일조·조망 분석에는 쓰지 않는다(분석은 plan.js의 가까운 맥락만 사용).
import { CONTEXT, NAMSAN } from './plan.js';

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 물: 한강 본류, 여의도 샛강과 샛강 하구
export const WATER = [
  { u0: -7000, u1: 7000, v0: 610, v1: 1510 },
  { u0: -7000, u1: -1050, v0: 2760, v1: 2860 },
  { u0: -1200, u1: -1000, v0: 1500, v1: 2860 },
];
export const ISLANDS = [{ name: '노들섬', u0: 380, u1: 820, v0: 1000, v1: 1130 }];
// 공원·녹지
export const PARKS = [
  { name: '용산공원', u0: 1300, u1: 3300, v0: -2650, v1: -700 },
  { name: '국립중앙박물관·용산가족공원', u0: 1250, u1: 2200, v0: -620, v1: 110 },
  { name: '효창공원', u0: -950, u1: -650, v0: -1820, v1: -1560 },
  { name: '여의도공원', u0: -3150, u1: -2930, v0: 1700, v1: 2650 },
  { name: '한강공원 이촌', u0: -3000, u1: 4500, v0: 560, v1: 612 },
  { name: '한강공원 반포·노량진', u0: -900, u1: 5500, v0: 1510, v1: 1560 },
  { name: '한강공원 여의도', u0: -4600, u1: -1250, v0: 1510, v1: 1580 },
];
// 큰길 (지면에 띠로 표시)
export const ROADS = [
  { name: '강변북로', u0: -7000, u1: 7000, v0: 570, v1: 605 },
  { name: '올림픽대로', u0: -7000, u1: 7000, v0: 1515, v1: 1545 },
  { name: '한강로', u0: 680, u1: 722, v0: -3000, v1: 560 },
  { name: '이촌로', u0: -1400, u1: 3300, v0: 222, v1: 240 },
  { name: '원효로', u0: -1700, u1: 680, v0: -560, v1: -530 },
  { name: '노들로', u0: -900, u1: 5500, v0: 1560, v1: 1580 },
  { name: '여의대로', u0: -2930, u1: -2890, v0: 1580, v1: 2760 },
];
// 다리: 중심, 길이(남북), 폭, 기울기(라디안), 상판 높이
export const BRIDGES = [
  { name: '한강대교', cu: 650, cv: 1060, len: 1000, w: 30, a: 0, y: 14 },
  { name: '한강철교', cu: 470, cv: 1060, len: 1000, w: 46, a: 0, y: 12, rail: true },
  { name: '원효대교', cu: -1350, cv: 1060, len: 1020, w: 22, a: -0.18, y: 15 },
  { name: '마포대교', cu: -2950, cv: 1060, len: 1060, w: 26, a: -0.12, y: 15 },
  { name: '동작대교', cu: 2520, cv: 1060, len: 1000, w: 40, a: 0.05, y: 16 },
  { name: '반포대교', cu: 4380, cv: 1060, len: 1000, w: 28, a: 0.08, y: 18 },
];
// 남산: 타원형 언덕(대지 기준 정상 약 252m)과 N서울타워
export const HILL = { cu: NAMSAN[0], cv: NAMSAN[1], ru: 700, rv: 420, rot: -0.25, h: 252 };
export function hillHeight(u, v) {
  const du = u - HILL.cu, dv = v - HILL.cv, c = Math.cos(HILL.rot), s = Math.sin(HILL.rot);
  const x = du * c + dv * s, y = -du * s + dv * c;
  return HILL.h * Math.exp(-((x / HILL.ru) ** 2 + (y / HILL.rv) ** 2));
}

// 구역: 범위, 유형, 회전(도), 밀도
const DISTRICTS = [
  { n: '산천·신계', u0: -1700, u1: -620, v0: -250, v1: 560, t: 'apt', rot: 0, p: 0.8 },
  { n: '원효로·효창', u0: -1700, u1: -150, v0: -1800, v1: -350, t: 'low', rot: -8, p: 0.82 },
  { n: '원효로 1~3가', u0: -150, u1: 680, v0: -1800, v1: -350, t: 'mid', rot: 0, p: 0.8 },
  { n: '공덕·마포', u0: -3100, u1: -1700, v0: -2300, v1: -300, t: 'high', rot: -12, p: 0.72 },
  { n: '마포 강변', u0: -4800, u1: -1700, v0: -300, v1: 560, t: 'apt', rot: -5, p: 0.78 },
  { n: '서강·신수', u0: -6200, u1: -3100, v0: -2600, v1: -300, t: 'low', rot: -14, p: 0.7 },
  { n: '서울역 남측', u0: -1700, u1: 680, v0: -3700, v1: -1800, t: 'mid', rot: 6, p: 0.75 },
  { n: '서울역 업무', u0: -800, u1: 400, v0: -3700, v1: -2900, t: 'office', rot: 6, p: 0.8 },
  { n: '한강로·삼각지', u0: 722, u1: 1300, v0: -2650, v1: -400, t: 'office', rot: 0, p: 0.7 },
  { n: '후암', u0: 600, u1: 1300, v0: -3500, v1: -2650, t: 'low', rot: 10, p: 0.75 },
  { n: '동부이촌동', u0: 740, u1: 3400, v0: 140, v1: 560, t: 'apt', rot: 0, p: 0.85 },
  { n: '서빙고·한남', u0: 3300, u1: 6200, v0: -1800, v1: 560, t: 'apt', rot: 8, p: 0.7 },
  { n: '이태원·해방촌', u0: 1900, u1: 5200, v0: -3900, v1: -2650, t: 'low', rot: 12, p: 0.75 },
  { n: '한남 언덕', u0: 3300, u1: 6200, v0: -2650, v1: -1800, t: 'low', rot: 10, p: 0.7 },
  { n: '여의도 업무', u0: -4600, u1: -1250, v0: 1600, v1: 2740, t: 'yido', rot: -20, p: 0.7 },
  { n: '노량진·본동', u0: -980, u1: 900, v0: 1590, v1: 2900, t: 'mid', rot: 4, p: 0.8 },
  { n: '흑석', u0: 900, u1: 2400, v0: 1590, v1: 2700, t: 'apt', rot: 6, p: 0.78 },
  { n: '동작·반포', u0: 2400, u1: 6200, v0: 1590, v1: 3300, t: 'apt', rot: 0, p: 0.82 },
  { n: '영등포·대방', u0: -4800, u1: -980, v0: 2880, v1: 4300, t: 'mid', rot: -16, p: 0.75 },
  { n: '상도·사당', u0: -980, u1: 6200, v0: 2900, v1: 4600, t: 'low', rot: 2, p: 0.62 },
  { n: '흑석 언덕', u0: 900, u1: 2400, v0: 2700, v1: 2900, t: 'low', rot: 6, p: 0.6 },
];
// 유형별 격자 크기, 평면 크기, 층수
const TYPES = {
  low: { cu: 38, cv: 34, w: [16, 30], d: [12, 24], f: [2, 6], use: 'res' },
  mid: { cu: 52, cv: 46, w: [22, 40], d: [16, 32], f: [4, 15], use: 'com' },
  apt: { cu: 78, cv: 62, w: [42, 66], d: [13, 16], f: [12, 25], use: 'res' },
  high: { cu: 82, cv: 78, w: [26, 44], d: [22, 36], f: [18, 38], use: 'com' },
  office: { cu: 74, cv: 70, w: [26, 48], d: [22, 40], f: [10, 34], use: 'com' },
  yido: { cu: 90, cv: 84, w: [30, 56], d: [26, 44], f: [12, 44], use: 'com' },
};
// 이름 있는 고층 (근사 위치·높이)
const LANDMARKS = [
  { n: '63빌딩', cu: -1330, cv: 1690, w: 62, d: 34, a: -0.35, h: 249 },
  { n: '파크원 A', cu: -2760, cv: 2160, w: 50, d: 44, a: -0.35, h: 333 },
  { n: '파크원 B', cu: -2640, cv: 2250, w: 44, d: 38, a: -0.35, h: 220 },
  { n: 'IFC 서울 1', cu: -2420, cv: 1880, w: 48, d: 40, a: -0.35, h: 284 },
  { n: 'IFC 서울 2', cu: -2340, cv: 1960, w: 40, d: 34, a: -0.35, h: 150 },
  { n: 'IFC 서울 3', cu: -2500, cv: 1980, w: 40, d: 34, a: -0.35, h: 136 },
  { n: 'FKI 타워', cu: -3320, cv: 2000, w: 48, d: 40, a: -0.35, h: 245 },
  { n: '래미안 첼리투스', cu: 980, cv: 380, w: 36, d: 30, a: 0, h: 200 },
  { n: '래미안 첼리투스', cu: 1060, cv: 380, w: 36, d: 30, a: 0, h: 200 },
  { n: '래미안 원베일리', cu: 3400, cv: 1750, w: 40, d: 30, a: 0, h: 112 },
  { n: '래미안 원베일리', cu: 3520, cv: 1700, w: 40, d: 30, a: 0, h: 112 },
  { n: '아크로리버파크', cu: 3000, cv: 1720, w: 40, d: 28, a: 0, h: 120 },
  { n: '서울스퀘어', cu: -250, cv: -3150, w: 90, d: 60, a: 0.1, h: 82 },
  { n: '용산 센트럴파크', cu: 840, cv: -820, w: 40, d: 36, a: 0, h: 150 },
  { n: '아모레퍼시픽 본사', cu: 900, cv: -560, w: 100, d: 100, a: 0, h: 110 },
  { n: '국립중앙박물관', cu: 1700, cv: -260, w: 404, d: 60, a: 0, h: 26 },
  { n: '노량진수산시장', cu: -380, cv: 1650, w: 240, d: 110, a: 0.05, h: 22 },
];

const inRect = (u, v, r, m = 0) => u > r.u0 - m && u < r.u1 + m && v > r.v0 - m && v < r.v1 + m;
const NEAR = CONTEXT.map(c => ({ u0: c.u0, u1: c.u1, v0: c.v0, v1: c.v1 }));
const BLOCKED = [
  { u0: -640, u1: 640, v0: -260, v1: 260 },           // 사업지
  { u0: -1400, u1: 660, v0: -335, v1: -225 },         // 철도·차량기지
  { u0: 300, u1: 900, v0: -360, v1: -200 },           // 용산역 선로
];

let cache = null;
export function farContext() {
  if (cache) return cache;
  const out = [];
  const R = rng(20261112);
  const ok = (u, v, w, d) => {
    const m = Math.max(w, d) / 2 + 6;
    if (WATER.some(r => inRect(u, v, r, m))) return false;
    if (ISLANDS.some(r => inRect(u, v, r, m))) return false;
    if (PARKS.some(r => inRect(u, v, r, 4))) return false;
    if (ROADS.some(r => inRect(u, v, r, m))) return false;
    if (BLOCKED.some(r => inRect(u, v, r, m))) return false;
    if (NEAR.some(r => inRect(u, v, r, m + 10))) return false;
    if (hillHeight(u, v) > 12) return false;
    if (LANDMARKS.some(L => Math.abs(u - L.cu) < (L.w + w) / 2 + 12 && Math.abs(v - L.cv) < (L.d + d) / 2 + 12)) return false;
    return true;
  };
  for (const D of DISTRICTS) {
    const T = TYPES[D.t], a = D.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const cu = (D.u0 + D.u1) / 2, cv = (D.v0 + D.v1) / 2;
    const dist = Math.hypot(cu, cv);
    const k = 1 + Math.max(0, dist - 1500) / 3200; // 멀수록 굵은 입자
    const gu = T.cu * k, gv = T.cv * k;
    const hu = (D.u1 - D.u0) / 2 + 300, hv = (D.v1 - D.v0) / 2 + 300;
    for (let x = -hu; x < hu; x += gu) for (let y = -hv; y < hv; y += gv) {
      if (R() > D.p) continue;
      const lx = x + gu / 2 + (R() - 0.5) * gu * 0.18, ly = y + gv / 2 + (R() - 0.5) * gv * 0.18;
      const u = cu + lx * c - ly * s, v = cv + lx * s + ly * c;
      if (!inRect(u, v, D)) continue;
      const w = (T.w[0] + R() * (T.w[1] - T.w[0])) * Math.min(1.5, k), d = (T.d[0] + R() * (T.d[1] - T.d[0])) * (D.t === 'apt' ? 1 : Math.min(1.5, k));
      if (w > gu - 6 || d > gv - 6) continue;
      if (!ok(u, v, w, d)) continue;
      let fl = Math.round(T.f[0] + Math.pow(R(), 1.6) * (T.f[1] - T.f[0]));
      if (D.t === 'yido' && R() < 0.12) fl += 14;
      const h = fl * (T.use === 'res' ? 2.9 : 3.8);
      out.push({ cu: u, cv: v, w, d, a, h, use: T.use, d0: D.n });
    }
  }
  LANDMARKS.forEach(L => out.push({ cu: L.cu, cv: L.cv, w: L.w, d: L.d, a: L.a, h: L.h, use: 'com', name: L.n }));
  // 공원 나무 (흰 원뿔)
  const trees = [];
  const TR = rng(77);
  PARKS.forEach(P => {
    const area = (P.u1 - P.u0) * (P.v1 - P.v0), n = Math.min(1600, Math.round(area / (P.name.startsWith('한강') ? 900 : 1500)));
    for (let i = 0; i < n; i++) {
      const u = P.u0 + TR() * (P.u1 - P.u0), v = P.v0 + TR() * (P.v1 - P.v0);
      if (PARKS === null) continue;
      if (ROADS.some(r => inRect(u, v, r, 2))) continue;
      trees.push([u, v, 7 + TR() * 9]);
    }
  });
  // 남산 숲
  for (let i = 0; i < 2600; i++) {
    const ang = TR() * Math.PI * 2, r = Math.sqrt(TR());
    const u = HILL.cu + Math.cos(ang) * r * HILL.ru * 1.5, v = HILL.cv + Math.sin(ang) * r * HILL.rv * 1.5;
    const h0 = hillHeight(u, v); if (h0 < 8) continue;
    trees.push([u, v, 8 + TR() * 8, h0]);
  }
  cache = { bldgs: out, trees };
  return cache;
}
