// 실제 지도로 대지 맞추기와 주변 분석.
// 후보지 자료에는 좌표(대략)와 면적만 있고 필지 모양은 없다. 그래서 대지는 같은 면적의 직사각형으로 두되,
// 실제 지도(OpenStreetMap)를 받으면 그 직사각형을 ① 가까운 도로망 방향에 맞춰 돌리고 ② 큰길·철도·물·고층 건물을
// 깔고 앉지 않는 자리로 조금 옮기고 ③ 가로·세로 비를 그 블록에 맞게 고른다 (fitSite).
// 그리고 대지 네 변 바깥에 실제로 무엇이 있는지(건물·도로·철도·물·녹지·빈 땅)와 거리를 잰다 (mapFacts).
// 공법 단계의 인접 건물 거리·소음 조건, 시공 시뮬레이션의 주변이 이 값을 쓴다.
import { inPoly, centroid, ringArea, densify } from './ctxmodel.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const RAD = Math.PI / 180;

// 대지 직사각형 (월드 좌표 → 대지 좌표 변환 포함)
function rectOf(A, asp, rotDeg, off) {
  const W = Math.sqrt(A * asp), D = A / W, R = rotDeg * RAD, c = Math.cos(R), s = Math.sin(R), ox = off[0], oz = off[1];
  return { W, D, toSite: (x, z) => [(x - ox) * c + (z - oz) * s, -(x - ox) * s + (z - oz) * c] };
}

// 가까운 도로망의 주 방향 (0~90° 접어서): 선분 길이 × 등급 × 가까움으로 가중한 방향 히스토그램
export function streetAngle(roads, radius = 450) {
  const bins = new Float64Array(90);
  let total = 0;
  (roads || []).forEach(r => {
    if (r.bridge) return;
    const wk = r.rank >= 6 ? 3 : r.rank >= 5 ? 2 : r.rank >= 3 ? 1 : 0.4;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 4) continue;
      const d = Math.hypot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); if (d > radius) continue;
      let ang = Math.atan2(dz, dx) / RAD; ang = ((ang % 90) + 90) % 90; // 동쪽에서 남쪽으로 잰 각을 0~90으로
      const w = L * wk / (1 + d / 160);
      // 이웃 칸에도 조금 나눠 준다 (±2°)
      for (let k = -2; k <= 2; k++) bins[(((Math.round(ang) + k) % 90) + 90) % 90] += w * (1 - Math.abs(k) / 3);
      total += w;
    }
  });
  if (total < 60) return null;
  let bi = 0; for (let i = 1; i < 90; i++) if (bins[i] > bins[bi]) bi = i;
  // 둘레 칸으로 가중 평균 (원형)
  let sx = 0, sw = 0; for (let k = -3; k <= 3; k++) { const w = bins[(((bi + k) % 90) + 90) % 90]; sx += w * k; sw += w; }
  let ang = bi + (sw ? sx / sw : 0);
  if (ang > 45) ang -= 90; // 대지 장축 기울기 −45~45°
  return { rot: Math.round(ang * 2) / 2, strength: bins[bi] / total };
}

// 대지 자리 점수 (작을수록 좋다)
function scoreAt(M, A, asp, rot, off) {
  const R = rectOf(A, asp, rot, off), hw = R.W / 2, hd = R.D / 2;
  const ins = (x, z, m = 0) => { const [u, v] = R.toSite(x, z); return Math.abs(u) < hw - m && Math.abs(v) < hd - m; };
  let s = 0;
  // 큰길·철도가 대지 안을 지나면 크게, 골목은 조금 (재개발 대지 안의 골목은 없어진다)
  for (const p of M.roadPts) if (ins(p[0], p[1], 2)) s += p[2];
  for (const p of M.railPts) if (ins(p[0], p[1], 0)) s += 14 * p[2];
  // 물 · 고층 건물 · 숲
  for (const p of M.waterPts) if (ins(p[0], p[1], 0)) s += 60;
  for (const p of M.greenPts) if (ins(p[0], p[1], 0)) s += p[2];
  for (const b of M.bld) if (ins(b[0], b[1], 0)) s += b[2];
  // 접도: 대지 변에서 3~30m 안에 차도가 변과 나란히 지나면 좋다 (출입구를 낼 길)
  let front = 0;
  for (const p of M.roadPts) {
    if (p[3] < 3) continue;
    const [u, v] = R.toSite(p[0], p[1]), du = Math.abs(u) - hw, dv = Math.abs(v) - hd;
    if ((du > 1 && du < 30 && Math.abs(v) < hd) || (dv > 1 && dv < 30 && Math.abs(u) < hw)) front += p[4];
  }
  s -= Math.min(260, front * 0.9);
  // 택지 좌표에서 멀어질수록 조금씩 나쁘다
  s += Math.hypot(off[0], off[1]) * 0.9;
  return s;
}

// 원본 지도(대지를 비우기 전) → { rot, aspect, off, moved, facts } 또는 null (지도에 맞출 근거가 없을 때)
export function fitSite(raw, site, opts = {}) {
  if (!raw || raw.source !== 'osm') return null;
  const A = site.area, asp0 = Math.max(1, site.aspect || 1.5);
  if (!(A > 100)) return null;
  const reach = Math.sqrt(A) * 0.9 + 260;
  const near = (p) => Math.hypot(p[0], p[1]) < reach;
  // 표본점으로 미리 풀어 둔다
  const M = { roadPts: [], railPts: [], waterPts: [], greenPts: [], bld: [] };
  (raw.roads || []).forEach(r => {
    if (r.bridge) return;
    const cost = r.rank >= 6 ? 9 : r.rank === 5 ? 4.5 : r.rank >= 3 ? 0.8 : 0.25; // m당 벌점 (표본 간격 8m)
    const pts = densify(r.pts, 8);
    for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (near(p)) M.roadPts.push([p[0], p[1], cost * 8, r.rank, 8]); }
  });
  (raw.rails || []).forEach(r => { if (r.bridge) return; densify(r.pts, 8).forEach(p => { if (near(p)) M.railPts.push([p[0], p[1], 8]); }); });
  const grid = (ring, step, out, val) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    ring.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
    x0 = Math.max(x0, -reach); x1 = Math.min(x1, reach); z0 = Math.max(z0, -reach); z1 = Math.min(z1, reach);
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) for (let z = Math.ceil(z0 / step) * step; z <= z1; z += step) if (inPoly(x, z, ring)) out.push([x, z, val]);
  };
  (raw.water || []).forEach(w => grid(w.outer, 14, M.waterPts, 1));
  (raw.green || []).forEach(g => grid(g.outer, 18, M.greenPts, g.kind === 'park' || g.kind === 'golf' ? 6 : g.kind === 'forest' ? 3 : 1.2));
  (raw.buildings || []).forEach(b => {
    const c = centroid(b.ring); if (!near(c)) return;
    const a = Math.abs(ringArea(b.ring)), k = b.h >= 60 ? 9 : b.h >= 30 ? 4 : b.h >= 15 ? 1.2 : 0.35; // 고층일수록 헐고 짓기 어렵다
    M.bld.push([c[0], c[1], Math.min(900, a * k / 40)]);
  });
  if (M.roadPts.length + M.bld.length < 6) return null; // 주변에 지도 정보가 거의 없으면 그대로 둔다
  const sa = streetAngle(raw.roads, reach);
  const rot0 = clamp(site.rot || 0, -45, 45);
  const rots = sa && sa.strength > 0.035 ? [sa.rot] : [rot0];
  const asps = opts.keepAspect ? [asp0] : [...new Set([asp0, 1, 1.25, 1.5, 1.8, 2.2].map(a => Math.round(a * 100) / 100))];
  const span = Math.min(170, Math.sqrt(A) * 0.5 + 60), step = Math.max(12, span / 7);
  let best = null;
  for (const rot of rots) for (const asp of asps) {
    for (let dx = -span; dx <= span + 0.1; dx += step) for (let dz = -span; dz <= span + 0.1; dz += step) {
      const sc = scoreAt(M, A, asp, rot, [dx, dz]) + Math.abs(asp - asp0) * 14;
      if (!best || sc < best.sc) best = { sc, rot, asp, off: [dx, dz] };
    }
  }
  // 제자리 점수와 비슷하면(12% 또는 25점 이내) 옮기지 않는다
  const stay = scoreAt(M, A, best.asp, best.rot, [0, 0]) + Math.abs(best.asp - asp0) * 14;
  if (stay - best.sc < Math.max(25, Math.abs(stay) * 0.12)) best = { sc: stay, rot: best.rot, asp: best.asp, off: [0, 0] };
  else {
    // 고른 자리 둘레를 한 번 더 촘촘히
    const o0 = best.off;
    for (let dx = -step; dx <= step + 0.1; dx += step / 3) for (let dz = -step; dz <= step + 0.1; dz += step / 3) {
      const off = [o0[0] + dx, o0[1] + dz], sc = scoreAt(M, A, best.asp, best.rot, off) + Math.abs(best.asp - asp0) * 14;
      if (sc < best.sc) best = { ...best, sc, off };
    }
  }
  const off = [Math.round(best.off[0]), Math.round(best.off[1])];
  return { rot: best.rot, aspect: best.asp, off, moved: Math.round(Math.hypot(off[0], off[1])), byRoads: !!(sa && sa.strength > 0.035), score: Math.round(best.sc) };
}

// 점 ↔ 선분 거리
const segD = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9, t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / L2, 0, 1); return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t); };
const SIDE_KO = { N: '북', E: '동', S: '남', W: '서' };

// 대지 네 변 바깥의 실제 상황. ctx: 대지를 비운 지도 맥락, plan: 대지 계획
// 반환: { source, sides: [{ side, dir, kind, d, name, h, w }], adj, adjH, adjSide, road: { name, w, d, side }, rail, water, nB, maxH, open }
export function mapFacts(ctx, plan) {
  if (!ctx || ctx.source !== 'osm') return null;
  const S = plan.SITE, hw = (S.u1 - S.u0) / 2, hd = (S.v1 - S.v0) / 2, cu = (S.u0 + S.u1) / 2, cv = (S.v0 + S.v1) / 2;
  const T = (p) => { const [u, v] = plan.toSite(p[0], p[1]); return [u - cu, v - cv]; };
  // 변: 대지 좌표의 −v(북쪽에 가까운 변), +u, +v, −u. 실제 방위는 대지 기울기를 더해 정한다
  const rot = plan.rotDeg || 0;
  const dirs = [{ k: 'v-', ang: -90 + rot }, { k: 'u+', ang: 0 + rot }, { k: 'v+', ang: 90 + rot }, { k: 'u-', ang: 180 + rot }];
  const compass = (ang) => { const a = ((ang % 360) + 360) % 360; return a >= 315 || a < 45 ? 'E' : a < 135 ? 'S' : a < 225 ? 'W' : 'N'; };
  // 변 바깥 거리: 그 변의 폭 안(양끝 6m 여유)에서 바깥으로 얼마나 떨어졌나. 변 범위 밖이면 null
  // slack: 변 양끝 여유. 건물은 +6m(모서리에 걸친 건물도 센다), 길은 −3m(옆 변을 따라가는 길이 모서리 너머로 이 변에 잡히지 않게)
  const out = (k, u, v, slack = 6) => {
    if (k === 'u+' || k === 'u-') { if (Math.abs(v) > hd + slack) return null; const d = (k === 'u+' ? u : -u) - hw; return d >= -3 ? Math.max(0, d) : null; }
    if (Math.abs(u) > hw + slack) return null; const d = (k === 'v+' ? v : -v) - hd; return d >= -3 ? Math.max(0, d) : null;
  };
  const REACH = 150;
  const sides = dirs.map(dd => ({ side: dd.k, dir: compass(dd.ang), bld: null, road: null, rail: null, water: null, green: null }));
  const take = (slot, key, d, extra) => { if (d == null || d > REACH) return; if (!slot[key] || d < slot[key].d) slot[key] = { d, ...extra }; };
  let nB = 0, maxH = 0;
  (ctx.buildings || []).forEach(b => {
    const pts = b.ring.map(T);
    let near = Infinity; pts.forEach(([u, v]) => { near = Math.min(near, Math.hypot(Math.max(0, Math.abs(u) - hw), Math.max(0, Math.abs(v) - hd))); });
    if (near > 300) return;
    if (near < 120 && b.h >= 6) { nB++; maxH = Math.max(maxH, b.h); }
    if (b.h < 4) return;
    const edge = densify(pts.concat([pts[0]]), 6); // 큰 건물은 꼭짓점이 변 범위 밖에 있어도 벽이 변 앞을 지난다
    sides.forEach(sd => { let m = null; edge.forEach(([u, v]) => { const d = out(sd.side, u, v); if (d != null && (m == null || d < m)) m = d; }); take(sd, 'bld', m, { h: Math.round(b.h), levels: b.levels || Math.round(b.h / 3.3), name: b.name || '', btype: b.kind }); });
  });
  const line = (list, key, extra) => (list || []).forEach(r => {
    if (r.bridge) return;
    const pts = densify(r.pts.map(T), 6), half = (r.w || 4) / 2 + (r.sw || 0);
    sides.forEach(sd => { let m = null; pts.forEach(([u, v]) => { const d = out(sd.side, u, v, -3); if (d != null) { const e = Math.max(0, d - half); if (m == null || e < m) m = e; } }); take(sd, key, m, extra(r)); });
  });
  line((ctx.roads || []).filter(r => r.rank >= 3), 'road', (r) => ({ w: Math.round(r.w + 2 * (r.sw || 0)), lanes: r.lanes, name: r.name || '', rank: r.rank }));
  line(ctx.rails, 'rail', () => ({ w: 6 }));
  const area = (list, key, extra) => (list || []).forEach(g => {
    const pts = densify(g.outer.concat([g.outer[0]]).map(T), 8);
    sides.forEach(sd => { let m = null; pts.forEach(([u, v]) => { const d = out(sd.side, u, v); if (d != null && (m == null || d < m)) m = d; }); take(sd, key, m, extra(g)); });
  });
  area(ctx.water, 'water', (g) => ({ name: g.name || '' }));
  area((ctx.green || []).filter(g => g.kind !== 'pitch'), 'green', (g) => ({ name: g.name || '', kind2: g.kind }));
  // 변마다 가장 가까운 것 하나로 요약
  const KIND_KO = { bld: '건물', road: '도로', rail: '철도', water: '물', green: '녹지' };
  const rows = sides.map(sd => {
    const cands = ['road', 'rail', 'water', 'bld', 'green'].filter(k => sd[k]).map(k => ({ kind: k, ...sd[k] })).sort((a, b) => a.d - b.d);
    const first = cands[0] || null;
    return { side: sd.side, dir: sd.dir, dirKo: SIDE_KO[sd.dir], first, bld: sd.bld, road: sd.road, rail: sd.rail, water: sd.water, green: sd.green, open: !sd.bld || sd.bld.d > 60 };
  });
  const blds = rows.filter(r => r.bld).sort((a, b) => a.bld.d - b.bld.d);
  const roads = rows.filter(r => r.road).sort((a, b) => (b.road.rank - a.road.rank) || (a.road.d - b.road.d));
  const railR = rows.filter(r => r.rail).sort((a, b) => a.rail.d - b.rail.d)[0] || null;
  const waterR = rows.filter(r => r.water).sort((a, b) => a.water.d - b.water.d)[0] || null;
  return {
    source: 'osm', partial: !!ctx.partial, rows,
    adj: blds.length ? Math.round(clamp(blds[0].bld.d, 2, 150)) : null, adjH: blds.length ? blds[0].bld.h : null, adjSide: blds.length ? blds[0].dirKo : null, adjSideKey: blds.length ? blds[0].side : null,
    road: roads.length ? { ...roads[0].road, d: Math.round(roads[0].road.d), side: roads[0].dirKo, sideKey: roads[0].side } : null,
    rail: railR ? { d: Math.round(railR.rail.d), side: railR.dirKo } : null,
    water: waterR ? { d: Math.round(waterR.water.d), side: waterR.dirKo, name: waterR.water.name } : null,
    nB, maxH: Math.round(maxH), openSides: rows.filter(r => r.open).length, KIND_KO,
  };
}

// 변 요약 한 줄 (화면용)
export function sideText(r) {
  if (!r.first) return '150m 안에 아무것도 없음 (빈 땅)';
  const f = r.first, d = f.d < 1 ? '맞닿음' : `${Math.round(f.d)}m`;
  if (f.kind === 'road') return `도로 ${f.name ? `'${f.name}' ` : ''}폭 약 ${f.w}m · ${d}`;
  if (f.kind === 'rail') return `철도 · ${d}`;
  if (f.kind === 'water') return `${f.name || '물'} · ${d}`;
  if (f.kind === 'green') return `${f.name || (f.kind2 === 'forest' ? '숲' : '녹지')} · ${d}`;
  return `건물 ${f.name ? `'${f.name}' ` : ''}${f.levels}층(약 ${f.h}m) · ${d}`;
}

// 지도에서 읽은 값으로 현장 조건 기본값 보정 (인접 건물 거리 · 소음 민감도)
export function condFromFacts(cond0, facts) {
  if (!facts) return cond0;
  const out = { ...cond0, fromMap: true };
  // 150m 안에 건물이 없으면 트인 땅 (인접 건물 없음)
  if (facts.adj != null) { out.adj = facts.adj; out.adjH = facts.adjH || null; out.adjSide = facts.adjSide || null; out.adjOpen = false; }
  else { out.adj = 120; out.adjH = 0; out.adjOpen = true; }
  // 가까이 건물이 많고 붙어 있으면 소음·진동에 민감
  if (facts.nB >= 25 && (facts.adj ?? 99) < 20) out.noise = 'high'; else if (facts.nB <= 4) out.noise = 'low';
  if (facts.rail && facts.rail.d < 40) out.rail = facts.rail.d;
  if (facts.road) { out.roadW = facts.road.w; out.roadName = facts.road.name || ''; out.roadD = facts.road.d; }
  out.nearB = facts.nB; out.nearH = facts.maxH;
  return out;
}
