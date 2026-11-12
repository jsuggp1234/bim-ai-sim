// 주변 맥락 모델 (월드 좌표: x 동쪽, z 남쪽, 대지 중심이 원점, m)
// 지도(OpenStreetMap)를 받으면 osm.js가 같은 형식으로 채우고, 받지 못하면 여기서 절차적으로 만든다.
//
// { source, buildings:[{ring:[[x,z]..], h, base, kind, name, levels}], roads:[{pts, w, lanes, kind, name, oneway, bridge, sw}],
//   rails:[{pts, bridge}], water:[{outer, holes, name}], streams:[{pts, w, name}], green:[{outer, holes, kind, name}],
//   peaks:[{x, z, h, r, name}], labels:[{x, y, z, text, cls}], nodes: Map 교차점 → [{dx,dz,w}] }

import * as YS from './context.js';

export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export const emptyCtx = (source) => ({ source, buildings: [], roads: [], rails: [], water: [], streams: [], green: [], peaks: [], labels: [] });

// 도로 등급 → 차로·폭
export const ROAD_CLASS = {
  motorway: { lanes: 3, lw: 3.6, sw: 0, rank: 9 }, trunk: { lanes: 3, lw: 3.5, sw: 0, rank: 8 },
  primary: { lanes: 4, lw: 3.3, sw: 4, rank: 7 }, secondary: { lanes: 4, lw: 3.25, sw: 3.5, rank: 6 }, tertiary: { lanes: 2, lw: 3.2, sw: 3, rank: 5 },
  unclassified: { lanes: 2, lw: 3, sw: 2, rank: 4 }, residential: { lanes: 2, lw: 3, sw: 2, rank: 3 }, living_street: { lanes: 1, lw: 4, sw: 1.5, rank: 2 },
  service: { lanes: 1, lw: 3.5, sw: 0, rank: 1 }, pedestrian: { lanes: 1, lw: 5, sw: 0, rank: 1 },
  link: { lanes: 1, lw: 3.5, sw: 0, rank: 6 },
};

// 점이 다각형 안에 있는지
export function inPoly(x, z, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
// 선을 양쪽으로 offset한 띠 다각형
export function bandPoly(pts, half) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
    L.push([pts[i][0] - dz * half, pts[i][1] + dx * half]); R.push([pts[i][0] + dz * half, pts[i][1] - dx * half]);
  }
  return L.concat(R.reverse());
}
const rectRing = (toWorld, u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => toWorld(u, v));
const obbRing = (toWorld, cu, cv, w, d, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => toWorld(cu + x * c - y * s, cv + x * s + y * c));
};

// ---------- 절차적 맥락 ----------
const FAB = {
  // 블록 채우기 규칙: 유형 비율과 층수 범위
  high: [['tower', 0.45], ['com', 0.35], ['apt', 0.2]],
  mixed: [['com', 0.35], ['ind', 0.3], ['apt', 0.2], ['house', 0.15]],
  mid: [['com', 0.35], ['apt', 0.3], ['house', 0.35]],
  apt: [['apt', 0.75], ['com', 0.15], ['house', 0.1]],
  green: [['field', 0.5], ['house', 0.35], ['apt', 0.15]],
  yongsan: [['apt', 0.4], ['com', 0.35], ['house', 0.25]],
};
function pick(R, list) { let x = R(), s = 0; for (const [k, p] of list) { s += p; if (x <= s) return k; } return list[list.length - 1][0]; }

export function proceduralContext(site, plan, opts = {}) {
  const ctx = emptyCtx('procedural');
  const R = rng(hashStr(site.id + ':' + (site.lat || 0).toFixed(3)));
  const { toWorld } = plan, S = plan.SITE;
  const RAD = opts.radius || 2100;
  const fabric = FAB[site.fabric] || FAB.mid;
  const water = site.features && site.features.water;
  const peak = site.features && site.features.peak;
  // 수면·녹지 띠
  const waterPolys = [];
  if (water && water.pts && water.pts.length > 1) {
    const big = water.name === '한강';
    const poly = bandPoly(water.pts.map(p => [p[0] * 1.6 - (water.pts[Math.floor(water.pts.length / 2)][0]) * 0.6, p[1]]), big ? 450 : 22);
    ctx.water.push({ outer: poly, holes: [], name: water.name });
    waterPolys.push(poly);
    const bank = bandPoly(water.pts.map(p => [p[0] * 1.6 - (water.pts[Math.floor(water.pts.length / 2)][0]) * 0.6, p[1]]), big ? 520 : 70);
    ctx.green.push({ outer: bank, holes: [], kind: 'park', name: big ? '한강공원' : water.name + ' 둔치' });
    waterPolys.push(bank);
    const mid = water.pts[Math.floor(water.pts.length / 2)];
    ctx.labels.push({ x: mid[0], y: 0, z: mid[1], text: water.name, cls: 'water' });
  }
  if (peak && Math.hypot(peak.x, peak.z) < 9000) {
    const r = Math.max(380, peak.h * 2.4);
    ctx.peaks.push({ x: peak.x, z: peak.z, h: peak.h, r, name: peak.name });
    const ring = Array.from({ length: 48 }, (_, i) => [peak.x + Math.cos(i / 48 * Math.PI * 2) * r * 1.5, peak.z + Math.sin(i / 48 * Math.PI * 2) * r * 1.5]);
    ctx.green.push({ outer: ring, holes: [], kind: 'forest', name: peak.name });
    waterPolys.push(ring);
    ctx.labels.push({ x: peak.x, y: peak.h, z: peak.z, text: peak.name, cls: 'far' });
  }
  const blocked = (x, z, m = 0) => waterPolys.some(p => inPoly(x, z, p)) || (Math.abs(plan.toSite(x, z)[0]) < (S.u1 - S.u0) / 2 + 30 + m && Math.abs(plan.toSite(x, z)[1]) < (S.v1 - S.v0) / 2 + 30 + m);
  // 도로 격자 (대지 좌표에서 만들고 월드로)
  const uLines = [], vLines = [];
  const ART = 650, LOC = 150;
  for (let u = S.u0 - 22; u > -RAD; u -= LOC) uLines.push([u, Math.abs(u - (S.u0 - 22)) % ART < 1 ? 'primary' : 'residential']);
  for (let u = S.u1 + 22; u < RAD; u += LOC) uLines.push([u, Math.abs(u - (S.u1 + 22)) % ART < 1 ? 'primary' : 'residential']);
  for (let v = S.v0 - 22; v > -RAD; v -= LOC * 0.85) vLines.push([v, Math.abs(v - (S.v0 - 22)) % (ART * 0.85) < 1 ? 'secondary' : 'residential']);
  for (let v = S.v1 + 22; v < RAD; v += LOC * 0.85) vLines.push([v, Math.abs(v - (S.v1 + 22)) % (ART * 0.85) < 1 ? 'secondary' : 'residential']);
  const segRoad = (a, b, kind) => {
    // 수면 위 구간은 잘라 낸다 (큰 길은 다리로)
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 40));
    let cur = [];
    for (let i = 0; i <= n; i++) {
      const u = a[0] + (b[0] - a[0]) * i / n, v = a[1] + (b[1] - a[1]) * i / n;
      const [x, z] = toWorld(u, v);
      const wet = waterPolys.slice(0, water ? 1 : 0).some(p => inPoly(x, z, p));
      if (wet && kind === 'residential') { if (cur.length > 1) push(cur, kind, false); cur = []; continue; }
      cur.push([x, z, wet]);
    }
    if (cur.length > 1) push(cur, kind, false);
  };
  const push = (pts, kind, bridge) => {
    const C = ROAD_CLASS[kind];
    // 다리 구간 나누기
    let run = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][2] !== pts[i - 1][2] && run.length) { run.push(pts[i]); ctx.roads.push({ pts: run.map(p => [p[0], p[1]]), w: C.lanes * C.lw, lanes: C.lanes, kind, sw: C.sw, bridge: !!run[1][2] }); run = [pts[i]]; }
      else run.push(pts[i]);
    }
    if (run.length > 1) ctx.roads.push({ pts: run.map(p => [p[0], p[1]]), w: C.lanes * C.lw, lanes: C.lanes, kind, sw: C.sw, bridge: !!run[run.length - 1][2] && !!run[0][2] });
  };
  uLines.forEach(([u, k]) => { if (Math.abs(u) < RAD * (k === 'residential' ? 0.8 : 1)) segRoad([u, -RAD], [u, RAD], k); });
  vLines.forEach(([v, k]) => { if (Math.abs(v) < RAD * (k === 'residential' ? 0.8 : 1)) segRoad([-RAD, v], [RAD, v], k); });
  // 대지 둘레 길 (대지 안은 비움)
  // 블록 채우기
  const us = [-RAD, ...uLines.map(x => x[0]), S.u0 - 22, S.u1 + 22, RAD].sort((a, b) => a - b);
  const vs = [-RAD, ...vLines.map(x => x[0]), S.v0 - 22, S.v1 + 22, RAD].sort((a, b) => a - b);
  for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
    const u0 = us[i] + 14, u1 = us[i + 1] - 14, v0 = vs[j] + 14, v1 = vs[j + 1] - 14;
    if (u1 - u0 < 30 || v1 - v0 < 30) continue;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const [cx, cz] = toWorld(cu, cv);
    const dist = Math.hypot(cx, cz);
    if (dist > RAD * 0.92) continue;
    if (cu > S.u0 - 40 && cu < S.u1 + 40 && cv > S.v0 - 40 && cv < S.v1 + 40) continue;
    const t = pick(R, fabric);
    const coarse = dist > 1300;
    if (t === 'field') { ctx.green.push({ outer: rectRing(toWorld, u0, u1, v0, v1), holes: [], kind: R() < 0.5 ? 'forest' : 'grass' }); continue; }
    if (t === 'apt') {
      const rows = Math.max(1, Math.floor((v1 - v0) / 46));
      for (let r = 0; r < rows; r++) {
        const vv = v0 + (r + 0.5) * (v1 - v0) / rows;
        const n = Math.max(1, Math.floor((u1 - u0) / 68));
        for (let k = 0; k < n; k++) {
          const uu = u0 + (k + 0.5) * (u1 - u0) / n, w = Math.min(58, (u1 - u0) / n - 10), d = 13 + R() * 3;
          const [x, z] = toWorld(uu, vv); if (blocked(x, z)) continue;
          const fl = Math.round(12 + R() * 13);
          ctx.buildings.push({ ring: obbRing(toWorld, uu, vv, w, d, 0), h: fl * 2.9, base: 0, kind: 'res', levels: fl });
        }
      }
    } else if (t === 'tower') {
      const n = Math.max(1, Math.floor((u1 - u0) / 55)), m = Math.max(1, Math.floor((v1 - v0) / 55));
      for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) {
        if (R() < 0.25) continue;
        const uu = u0 + (a + 0.5) * (u1 - u0) / n, vv = v0 + (b + 0.5) * (v1 - v0) / m, w = 24 + R() * 18, d = 22 + R() * 14;
        const [x, z] = toWorld(uu, vv); if (blocked(x, z)) continue;
        const fl = Math.round(14 + Math.pow(R(), 1.5) * 30);
        ctx.buildings.push({ ring: obbRing(toWorld, uu, vv, w, d, 0), h: fl * 4, base: 0, kind: 'com', levels: fl });
      }
    } else {
      // 작은 필지: 격자로 나눠 저층·중층
      const g = t === 'house' ? (coarse ? 30 : 24) : t === 'ind' ? 46 : 36;
      for (let uu = u0 + g / 2; uu < u1; uu += g) for (let vv = v0 + g / 2; vv < v1; vv += g) {
        if (R() < (t === 'house' ? 0.18 : 0.3)) continue;
        const w = g * (0.55 + R() * 0.3), d = g * (0.5 + R() * 0.32);
        const [x, z] = toWorld(uu, vv); if (blocked(x, z)) continue;
        const fl = t === 'house' ? Math.round(2 + R() * 3) : t === 'ind' ? Math.round(1 + R() * 3) : Math.round(4 + Math.pow(R(), 1.3) * 11);
        ctx.buildings.push({ ring: obbRing(toWorld, uu, vv, w, d, 0), h: fl * (t === 'house' ? 3 : 3.8), base: 0, kind: t === 'house' ? 'house' : t === 'ind' ? 'ind' : 'com', levels: fl });
      }
    }
  }
  return ctx;
}

// ---------- 용산: 손으로 정리한 지형(한강·다리·여의도·남산 등)을 같은 형식으로 ----------
export function yongsanPreset(plan) {
  const C = YS;
  const ctx = emptyCtx('preset');
  const { toWorld } = plan;
  C.WATER.forEach(r => ctx.water.push({ outer: rectRing(toWorld, r.u0, r.u1, r.v0, r.v1), holes: [], name: '한강' }));
  C.ISLANDS.forEach(r => ctx.green.push({ outer: rectRing(toWorld, r.u0, r.u1, r.v0, r.v1), holes: [], kind: 'park', name: r.name }));
  C.PARKS.forEach(r => ctx.green.push({ outer: rectRing(toWorld, r.u0, r.u1, r.v0, r.v1), holes: [], kind: r.name.startsWith('한강') ? 'grass' : 'park', name: r.name }));
  const roadKind = (n) => (/강변북로|올림픽대로/.test(n) ? 'motorway' : 'primary');
  C.ROADS.forEach(r => {
    const horiz = (r.u1 - r.u0) >= (r.v1 - r.v0);
    const w = horiz ? r.v1 - r.v0 : r.u1 - r.u0;
    const pts = horiz ? [toWorld(r.u0, (r.v0 + r.v1) / 2), toWorld(r.u1, (r.v0 + r.v1) / 2)] : [toWorld((r.u0 + r.u1) / 2, r.v0), toWorld((r.u0 + r.u1) / 2, r.v1)];
    const k = roadKind(r.name), Cl = ROAD_CLASS[k];
    ctx.roads.push({ pts, w: Math.min(w, 34), lanes: Math.max(2, Math.round(Math.min(w, 34) / 3.4)), kind: k, sw: Cl.sw, name: r.name });
  });
  plan.BANDS.filter(b => b.kind === 'road').forEach(r => ctx.roads.push({ pts: [toWorld(r.u0, (r.v0 + r.v1) / 2), toWorld(r.u1, (r.v0 + r.v1) / 2)], w: r.v1 - r.v0, lanes: 4, kind: 'secondary', sw: 3.5, name: r.name }));
  plan.BANDS.filter(b => b.kind === 'rail').forEach(r => { for (let k = 0; k < 8; k++) { const v = r.v0 + 8 + k * (r.v1 - r.v0 - 16) / 7; ctx.rails.push({ pts: [toWorld(r.u0, v), toWorld(r.u1, v)] }); } });
  C.BRIDGES.forEach(b => {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const p0 = toWorld(b.cu + (b.len / 2) * s, b.cv - (b.len / 2) * c), p1 = toWorld(b.cu - (b.len / 2) * s, b.cv + (b.len / 2) * c);
    if (b.rail) ctx.rails.push({ pts: [p0, p1], bridge: true, w: b.w });
    else ctx.roads.push({ pts: [p0, p1], w: b.w - 4, lanes: Math.max(4, Math.round((b.w - 4) / 3.4)), kind: 'primary', sw: 2, bridge: true, name: b.name });
  });
  const F = C.farContext();
  F.bldgs.forEach(b => ctx.buildings.push({ ring: obbRing(toWorld, b.cu, b.cv, b.w, b.d, b.a), h: b.h, base: 0, kind: b.use === 'res' ? (b.h > 20 ? 'res' : 'house') : (b.h > 90 ? 'tower' : 'com'), name: b.name, levels: Math.round(b.h / (b.use === 'res' ? 2.9 : 3.8)) }));
  plan.CONTEXT.forEach(c => ctx.buildings.push({ ring: rectRing(toWorld, c.u0, c.u1, c.v0, c.v1), h: c.y1, base: 0, kind: c.use === 'res' ? (c.floors > 6 ? 'res' : 'house') : 'com', name: c.name, levels: c.floors }));
  ctx.peaks.push({ x: toWorld(C.HILL.cu, C.HILL.cv)[0], z: toWorld(C.HILL.cu, C.HILL.cv)[1], h: C.HILL.h, r: C.HILL.ru, name: '남산' });
  const tw = toWorld(plan.views.peak.pt[0], plan.views.peak.pt[1]);
  ctx.buildings.push({ ring: obbRing((u, v) => [u, v], tw[0], tw[1], 14, 14, 0), h: 236, base: 0, kind: 'tower', name: 'N서울타워', levels: 1, onHill: true });
  const L = (u, v, y, text, cls) => { const [x, z] = toWorld(u, v); ctx.labels.push({ x, y, z, text, cls }); };
  L(0, 1060, 0, '한강', 'water'); L(720, -60, 45, '용산역', 'place'); L(-260, 320, 50, '서부이촌동', 'place'); L(1500, 380, 50, '동부이촌동', 'far');
  L(240, -430, 35, '용산전자상가', 'place'); L(-760, -280, 6, '철도·차량기지', 'place'); L(-2600, 2100, 300, '여의도', 'far'); L(-100, 2000, 60, '노량진', 'far');
  L(1600, 2100, 70, '흑석동', 'far'); L(2300, -1600, 10, '용산공원', 'far'); L(plan.views.peak.pt[0], plan.views.peak.pt[1], plan.views.peak.pt[2], '남산 N서울타워', 'far');
  L(650, 1350, 16, '한강대교', 'far'); L(-1350, 1350, 16, '원효대교', 'far'); L(-2400, -1200, 100, '마포·공덕', 'far');
  return ctx;
}

// 지도가 없을 때 쓸 맥락
export function fallbackContext(site, plan) {
  if (plan.key === 'yongsan') return yongsanPreset(plan);
  return proceduralContext(site, plan);
}

// 사업지 안에 들어오는 기존 지형지물 제거(대지 + 여유)
export function clearSite(ctx, plan, margin = 4) {
  const S = plan.SITE;
  const inside = (x, z, m = margin) => { const [u, v] = plan.toSite(x, z); return u > S.u0 - m && u < S.u1 + m && v > S.v0 - m && v < S.v1 + m; };
  ctx.buildings = ctx.buildings.filter(b => { const c = centroid(b.ring); return !inside(c[0], c[1]); });
  const cut = (list) => {
    const out = [];
    list.forEach(r => {
      let cur = [];
      for (let i = 0; i < r.pts.length; i++) {
        const p = r.pts[i];
        if (inside(p[0], p[1], -2)) { if (cur.length > 1) out.push({ ...r, pts: cur }); cur = []; }
        else cur.push(p);
      }
      if (cur.length > 1) out.push({ ...r, pts: cur });
    });
    return out;
  };
  // 긴 선분이 대지를 가로지르면 잘게 나눈 뒤 자른다
  const dens = (list) => list.map(r => ({ ...r, pts: densify(r.pts, 25) }));
  ctx.roads = cut(dens(ctx.roads));
  ctx.rails = cut(dens(ctx.rails));
  ctx.streams = cut(dens(ctx.streams));
  return ctx;
}
export function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / step);
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
export function centroid(ring) {
  let x = 0, z = 0; ring.forEach(p => { x += p[0]; z += p[1]; }); return [x / ring.length, z / ring.length];
}
export function ringArea(ring) {
  let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return a / 2;
}
// 지형 높이 (산 정상의 가우스 언덕), 대지 근처는 평탄
export function terrainFn(peaks, plan) {
  if (!peaks || !peaks.length) return () => 0;
  return (x, z) => {
    let h = 0;
    for (const p of peaks) { const d2 = ((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r); if (d2 < 9) h = Math.max(h, p.h * Math.exp(-d2)); }
    if (h > 0 && plan) { const [u, v] = plan.toSite(x, z), S = plan.SITE; const du = Math.max(0, Math.abs(u) - (S.u1 - S.u0) / 2), dv = Math.max(0, Math.abs(v) - (S.v1 - S.v0) / 2); const dd = Math.hypot(du, dv); if (dd < 300) h *= dd / 300; }
    return h < 0.5 ? 0 : h;
  };
}
// 주변 건물 → 분석용 회전 상자(대지 좌표). 대지 경계에서 maxD 안쪽만
export function nearBoxes(ctx, plan, maxD = 450) {
  const S = plan.SITE, out = [];
  ctx.buildings.forEach((b, i) => {
    const pts = b.ring.map(([x, z]) => plan.toSite(x, z));
    const cu = pts.reduce((s, p) => s + p[0], 0) / pts.length, cv = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const du = Math.max(0, Math.abs(cu) - (S.u1 - S.u0) / 2), dv = Math.max(0, Math.abs(cv) - (S.v1 - S.v0) / 2);
    if (Math.hypot(du, dv) > maxD || b.h < 6) return;
    // 가장 긴 변 방향으로 맞춘 외접 상자
    let best = 0, ang = 0;
    for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L > best) { best = L; ang = Math.atan2(q[1] - p[1], q[0] - p[0]); } }
    const c = Math.cos(ang), s = Math.sin(ang);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(([u, v]) => { const lx = (u - cu) * c + (v - cv) * s, ly = -(u - cu) * s + (v - cv) * c; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); y0 = Math.min(y0, ly); y1 = Math.max(y1, ly); });
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    out.push({ cu: cu + mx * c - my * s, cv: cv + mx * s + my * c, w: x1 - x0, d: y1 - y0, a: ang, y1: b.h, use: b.kind === 'res' || b.kind === 'house' ? 'res' : 'com', floors: b.levels || Math.round(b.h / 3), name: b.name || (b.kind === 'res' ? '주변 아파트' : b.kind === 'house' ? '주변 저층 주거' : '주변 건물'), ref: i });
  });
  return out;
}
