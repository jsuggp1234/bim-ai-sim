// 공사 현장 주변 가로 모델: 인접 건물(지하·기초·층·상가) · 이면도로 · 대로(보도·연석·차로·중앙선) · 건너편 건물 ·
// 가로수·가로등·신호등·버스 정류장 · 도로 밑 지하 매설물(통신·전력·가스·상수·우수·하수·지역난방) · 배경 스카이라인.
// 2D 단면(buildsim-ctx.js)과 3D(build3d.js)가 같은 값을 쓴다. 좌표: x는 단면 가로(대지 왼쪽 끝 0, 오른쪽 끝 pw, m), e는 높이(지표 0).
// 도심(인접 거리 15m 이하) · 교외 · 산업 단지 세 가지 가로 유형. 같은 택지면 항상 같은 모습(시드 고정).

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export const SHOPS = ['편의점', '카페', '약국', '은행', '분식', '부동산', '안경', '빵집', '꽃집', '세탁'];
export const UTIL = {
  comm: { name: '통신 관로', c: 'comm' }, power: { name: '전력 관로 22.9kV', c: 'power' }, gas: { name: '도시가스', c: 'gas' },
  water: { name: '상수도', c: 'water' }, storm: { name: '우수관', c: 'storm' }, sewer: { name: '하수관', c: 'sewer' }, heat: { name: '지역난방', c: 'heat' },
  iw: { name: '공업용수', c: 'water' },
};

// sc 일부만 받는다 (node 테스트에서도 계산)
export function streetModel({ pw, adj, noise, ground, nb, seed = 'site' }) {
  const R = rng(hashStr(String(seed) + ':' + Math.round(pw) + ':' + adj));
  const kind = adj <= 15 ? 'urban' : adj >= 60 ? 'ind' : 'suburb';
  const soft = ground === 'C' || ground === 'M';
  const pl = -Math.min(3, adj / 2);

  // ---- 인접 건물 (단면을 자른다) ----
  const nbk = kind === 'urban' ? (noise === 'high' ? ['office', 'officetel', 'mixed'][Math.floor(R() * 3)] : ['officetel', 'mixed'][Math.floor(R() * 2)])
    : kind === 'ind' ? 'factory' : ['school', 'house'][Math.floor(R() * 2)];
  const NBK = {
    office: { name: '업무 시설', g: 4.5, f: 3.6 }, officetel: { name: '오피스텔 · 근린 상가', g: 4.2, f: 3.0 }, mixed: { name: '근린 상가 · 사무실', g: 4.2, f: 3.3 },
    school: { name: '학교', g: 3.8, f: 3.6 }, house: { name: '다세대 주택', g: 3.0, f: 2.8 }, factory: { name: '공장 · 창고', g: nb.h - 0.5, f: nb.h },
  }[nbk];
  const nFl = nbk === 'factory' ? 1 : Math.max(2, 1 + Math.floor((nb.h - NBK.g - 1.4) / NBK.f));
  const fl = []; { let e = 0; for (let i = 0; i < nFl; i++) { const h = i === 0 ? NBK.g : NBK.f; fl.push({ e0: e, e1: e + h }); e += h; } }
  const top = fl[fl.length - 1].e1;
  const nbB = nb.b > 3 ? Math.max(1, Math.round(nb.b / 3.4)) : 0;
  const nb0 = {
    ...nb, kind: nbk, name: NBK.name, fl, top, roofH: nb.h, nbB, bfl: Array.from({ length: nbB }, (_, i) => ({ e0: -(i + 1) * nb.b / nbB, e1: -i * nb.b / nbB })),
    found: nbB ? (soft ? 'pile' : 'mat') : 'strip', shop: nbk === 'officetel' || nbk === 'mixed' || (nbk === 'office' && R() < 0.5),
    shopName: SHOPS[Math.floor(R() * SHOPS.length)], balcony: nbk === 'officetel' && R() < 0.6, wall: 0.3,
    pent: nbk !== 'factory' && nbk !== 'house', tank: nbk !== 'factory', odu: nbk === 'office' || nbk === 'mixed' || nbk === 'officetel' ? 3 + Math.floor(R() * 4) : 0,
  };
  // 왼쪽 맞은편(인접 건물 너머) 두 번째 건물
  const nb2w = kind === 'urban' ? 14 + R() * 8 : 18;
  const nb2 = kind === 'urban' ? { x1: nb.x0 - 1.2, x0: nb.x0 - 1.2 - nb2w, h: 18 + Math.round(R() * 30), b: 3.5, kind: 'office' } : null;

  // ---- 왼쪽: 대지 경계 ~ 인접 건물 사이 (이면도로 · 녹지) ----
  const gap = -pl - (-nb.x1);
  const left = {};
  if (kind === 'urban') {
    const roadW = clamp(gap - 2.4, 3, 6);
    left.road = [pl - roadW, pl]; left.lanes = 2; left.center = false;
    left.wall = nb.x1 + 0.6; left.yard = [nb.x1, left.wall];
    left.pole = { x: pl - roadW + 0.4, h: 11 }; // 이면도로 전신주
    left.car = R() < 0.7 ? { x: pl - roadW * 0.3, k: R() < 0.5 ? 'car' : 'van' } : null;
  } else {
    left.road = [pl - 8, pl]; left.lanes = 2; left.center = true;
    left.sw = [pl - 10, pl - 8]; left.wall = nb.x1 + 0.6;
    left.green = [nb.x1 + 1.2, pl - 10.4];
    left.trees = []; for (let x = left.green[0] + 3; x < left.green[1] - 1; x += 5 + R() * 4) left.trees.push({ x, h: 5 + R() * 4, r: 1.6 + R() * 1.4 });
    left.pole = { x: pl - 9, h: 11 };
  }

  // ---- 오른쪽: 대지 → 보도 → 대로 → 건너편 ----
  const sw = [pw + 5.15, pw + 8.6], curb = sw[1];
  const nL = kind === 'suburb' ? 2 : 4, lw = kind === 'ind' ? 3.5 : 3.25, med = nL >= 4 ? 0.5 : 0.3;
  const lanes = []; let x = curb;
  for (let i = 0; i < nL; i++) { if (i === nL / 2) x += med; lanes.push({ x0: x, x1: x + lw, dir: i < nL / 2 ? -1 : 1 }); x += lw; }
  const road = [curb, x], center = [curb + lw * nL / 2, curb + lw * nL / 2 + med];
  const sw2 = [road[1], road[1] + (kind === 'urban' ? 4 : kind === 'suburb' ? 2.6 : 1.5)];
  const far = [];
  if (kind === 'urban') {
    const w = 22 + R() * 10, h = 40 + Math.round(R() * 36);
    far.push(farBld(sw2[1] + 0.9, w, h, 'office', R, 3, soft));
  } else if (kind === 'suburb') {
    far.push(farBld(sw2[1] + 4.5, 12 + R() * 4, 9 + Math.round(R() * 4), 'house', R, 0, soft));
  } else {
    far.push(farBld(sw2[1] + 7, 40, 14, 'factory', R, 0, soft));
  }
  const trees = [{ x: sw[0] + 1.25, h: 6.5 + R() * 2, r: 2.2 + R() * 0.6 }, { x: sw2[0] + (sw2[1] - sw2[0]) * 0.45, h: 6 + R() * 2.5, r: 2 + R() * 0.8 }];
  if (kind === 'ind') trees.length = 1;
  const lights = [{ x: curb - 0.45, h: kind === 'urban' ? 10 : 8, arm: 2.2, dir: 1 }, { x: sw2[0] + 0.45, h: kind === 'urban' ? 10 : 8, arm: 2.2, dir: -1 }];
  const signal = kind === 'urban' ? { x: sw2[0] + 0.9, h: 6.2, arm: Math.min(9, (road[1] - road[0]) * 0.55) } : null;
  const busStop = kind === 'urban' ? { x0: sw2[0] + 1.6, x1: sw2[0] + 3.7, h: 2.6 } : null;

  // ---- 도로 밑 지하 매설물 (관 중심 높이 e, 지름 d) ----
  const L = (i, f = 0.5) => lanes[Math.min(lanes.length - 1, i)].x0 + lw * f;
  const utils = kind === 'urban' ? [
    { k: 'comm', x: sw[0] + 1.0, e: -0.75, d: 0.1, n: 4 }, { k: 'power', x: sw[0] + 2.5, e: -1.15, d: 0.15, n: 4 },
    { k: 'gas', x: L(0, 0.4), e: -1.2, d: 0.2 }, { k: 'water', x: L(1, 0.5), e: -1.55, d: 0.4 },
    { k: 'sewer', x: (center[0] + center[1]) / 2, e: -2.9, d: 1.0 }, { k: 'storm', x: L(2, 0.5), e: -2.25, d: 0.8 },
    { k: 'heat', x: L(3, 0.4), e: -1.85, d: 0.5, n: 2 },
  ] : kind === 'suburb' ? [
    { k: 'comm', x: sw[0] + 1.2, e: -0.7, d: 0.1, n: 2 }, { k: 'gas', x: L(0, 0.5), e: -1.1, d: 0.12 },
    { k: 'water', x: L(1, 0.35), e: -1.3, d: 0.2 }, { k: 'sewer', x: L(1, 0.75), e: -2.2, d: 0.6 },
  ] : [
    { k: 'power', x: sw[0] + 2.0, e: -1.2, d: 0.15, n: 6 }, { k: 'gas', x: L(0, 0.5), e: -1.3, d: 0.3 },
    { k: 'water', x: L(1, 0.4), e: -1.5, d: 0.3 }, { k: 'iw', x: L(2, 0.5), e: -1.8, d: 0.5 }, { k: 'sewer', x: L(3, 0.5), e: -2.6, d: 0.8 },
  ];
  utils.forEach(u => { u.name = UTIL[u.k].name + (u.d >= 0.2 ? ` Ø${Math.round(u.d * 1000)}` : ''); });
  const sew = utils.find(u => u.k === 'sewer');
  const manhole = sew ? { x: sew.x, e: sew.e + sew.d / 2 } : null;
  const overhead = kind !== 'urban'; // 교외·산업: 가공 전선 (전신주)

  // ---- 배경 스카이라인 (단면 뒤쪽 입면, 아주 흐리게) ----
  const bg = [];
  { const span0 = (nb2 ? nb2.x0 : nb.x0) - 40, span1 = pw + 90; let x0 = span0;
    while (x0 < span1) {
      const w = kind === 'ind' ? 18 + R() * 30 : 12 + R() * 22, h = kind === 'urban' ? 25 + Math.pow(R(), 1.4) * 95 : kind === 'suburb' ? 8 + R() * 22 : 8 + R() * 16;
      bg.push({ x0, x1: x0 + w, h, k: kind === 'ind' && R() < 0.3 ? 'tank' : kind === 'ind' && R() < 0.2 ? 'stack' : 'bld', t: R() });
      x0 += w + 2 + R() * 8;
    } }
  // ---- 3D: 대지 뒤 이면도로 건너편 블록 · 대로 건너편 블록 (z 방향으로 늘어선 건물) ----
  const rowL = [], rowB = [], rowF = [];
  for (let i = 0; i < 6; i++) rowF.push({ w: kind === 'ind' ? 34 + R() * 20 : 16 + R() * 16, d: kind === 'ind' ? 30 : 16 + R() * 10, h: kind === 'urban' ? 24 + Math.pow(R(), 1.3) * 70 : kind === 'suburb' ? 7 + R() * 10 : 9 + R() * 8, k: kind === 'urban' ? (R() < 0.5 ? 'office' : 'officetel') : kind === 'suburb' ? 'house' : 'factory', shop: kind === 'urban' && R() < 0.7, gap: 3 + R() * 6, t: R() });
  for (let i = 0; i < 6; i++) rowB.push({ w: kind === 'ind' ? 30 + R() * 20 : 14 + R() * 14, d: 14 + R() * 10, h: kind === 'urban' ? 18 + Math.pow(R(), 1.5) * 60 : kind === 'suburb' ? 7 + R() * 9 : 8 + R() * 7, k: kind === 'urban' ? (R() < 0.6 ? 'officetel' : 'apt') : kind === 'suburb' ? 'house' : 'factory', shop: kind === 'urban' && R() < 0.5, gap: 2 + R() * 5, t: R() });
  for (let i = 0; i < 5; i++) rowL.push({ d: 14 + R() * 12, h: kind === 'urban' ? 16 + Math.pow(R(), 1.4) * 40 : kind === 'suburb' ? 7 + R() * 8 : 8 + R() * 6, gap: 2 + R() * 4, t: R(), k: kind === 'urban' ? 'officetel' : kind === 'suburb' ? 'house' : 'factory' });

  return {
    kind, pl, gap, nb: nb0, nb2, left,
    yard: [pw, pw + 4.85], fence: pw + 4.85, gate: pw + 5, sw, curb, road, lanes, lw, center, med, sw2, far,
    trees, lights, signal, busStop, utils, manhole, overhead, bg, rowF, rowB, rowL,
  };
}

function farBld(x0, w, h, k, R, nB, soft) {
  const g = k === 'office' ? 5 : k === 'factory' ? h - 0.5 : 3.2, f = k === 'office' ? 3.8 : k === 'factory' ? h : 2.9;
  const n = k === 'factory' ? 1 : Math.max(2, 1 + Math.floor((h - g - 1) / f));
  const fl = []; { let e = 0; for (let i = 0; i < n; i++) { const hh = i === 0 ? g : f; fl.push({ e0: e, e1: e + hh }); e += hh; } }
  const b = nB * 3.4;
  return { x0, x1: x0 + w, h, top: fl[fl.length - 1].e1, fl, kind: k, b, nbB: nB, bfl: Array.from({ length: nB }, (_, i) => ({ e0: -(i + 1) * 3.4, e1: -i * 3.4 })), found: nB ? (soft ? 'pile' : 'mat') : 'strip', shop: k === 'office', shopName: SHOPS[Math.floor(R() * SHOPS.length)], wall: 0.3, pent: k === 'office', tank: k !== 'factory', odu: k === 'office' ? 4 : 0, name: k === 'office' ? '건너편 업무 빌딩' : k === 'factory' ? '건너편 공장' : '건너편 주택' };
}

// 차로마다 지나가는 차량 (단면을 가로지르는 차를 앞·뒤 모습으로): T초에 lane i에 있는 차량
const VEH = [
  { k: 'car', w: 1.8, h: 1.45, p: 0.42 }, { k: 'suv', w: 1.9, h: 1.75, p: 0.2 }, { k: 'bus', w: 2.5, h: 3.2, p: 0.1 },
  { k: 'truck', w: 2.5, h: 3.0, p: 0.12 }, { k: 'van', w: 1.9, h: 2.0, p: 0.1 }, { k: 'bike', w: 0.7, h: 1.4, p: 0.06 },
];
export function vehicleAt(lane, i, T, seed = 0) {
  const per = 4.2 + (i % 3) * 0.9, cyc = Math.floor((T + i * 1.7) / per), ph = ((T + i * 1.7) / per) % 1;
  const R = rng(hashStr(`${seed}:${i}:${cyc}`));
  if (R() < 0.28) return null; // 빈 차로
  let r = R(), v = VEH[0]; for (const x of VEH) { r -= x.p; if (r <= 0) { v = x; break; } }
  const op = ph < 0.15 ? ph / 0.15 : ph > 0.82 ? (1 - ph) / 0.18 : 1;
  const off = (R() - 0.5) * 0.5;
  return { ...v, x: (lane.x0 + lane.x1) / 2 + off, dir: lane.dir, op: clamp(op, 0, 1), col: Math.floor(R() * 6) };
}
