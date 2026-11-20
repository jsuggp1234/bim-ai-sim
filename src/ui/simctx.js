// 공법 시뮬레이터의 넓은 주변 맥락: 입지(택지)의 실제 지도(OpenStreetMap: 건물·도로·철도·물·녹지·산)를
// 시뮬레이션 좌표(x 단면 가로, z 대로 방향, 대표 동 중심이 (건물 가운데, 0))로 옮겨, 현장 둘레의 가로 모형(city3d) 바깥을 채운다.
// 같은 매스 배치의 다른 동은 '계획 동'(반투명 볼륨)으로 제자리에 세운다.
// 지도가 아직 없으면(받는 중·끔·실패) 주변을 지어내지 않고 빈 땅으로 둔다 (ctxload.js).
import * as THREE from 'three';
import { buildContext } from '../sim/scene/context3d.js';
import { inPoly, densify } from '../sim/ctxmodel.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// 실제 좌표(월드: x 동, z 남, 택지 중심 원점) → 시뮬레이션 좌표 변환
// G: sectionGeom, roadX: 가로 모형 대로 중심의 x
export function simFrame(plan, ctx, G, roadX) {
  const r = G.main.rect, cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
  const c = plan.toWorld(cu, cv), o = plan.toWorld(0, 0);
  const uAx = (() => { const p = plan.toWorld(1, 0); return [p[0] - o[0], p[1] - o[1]]; })(), vAx = (() => { const p = plan.toWorld(0, 1); return [p[0] - o[0], p[1] - o[1]]; })();
  // 단면(x)은 건물의 짧은 변 방향
  let ex = (r.u1 - r.u0) <= (r.v1 - r.v0) ? uAx : vAx;
  // +x는 가장 가까운 큰길 쪽: 그 축과 거의 직각으로 지나는 큰길 중 가장 가까운 것
  let best = null;
  (ctx.roads || []).forEach(rd => {
    const big = (rd.rank != null ? rd.rank <= 2 : false) || (rd.w || 0) >= 14;
    if (!big || rd.bridge) return;
    for (let i = 1; i < rd.pts.length; i++) {
      const a = rd.pts[i - 1], b = rd.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; if (L2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / L2)), px = a[0] + dx * t, pz = a[1] + dz * t;
      const d = Math.hypot(px - c[0], pz - c[1]), L = Math.sqrt(L2), par = Math.abs((dx * ex[0] + dz * ex[1]) / L);
      if (par > 0.55 || d > 260) continue; // 단면 방향과 나란한 길은 대로가 아니다
      if (!best || d < best.d) best = { d, p: [px, pz], w: rd.w || 20 };
    }
  });
  if (best && dot([best.p[0] - c[0], best.p[1] - c[1]], ex) < 0) ex = [-ex[0], -ex[1]];
  const ez = [-ex[1], ex[0]];
  const bxc = (G.bx0 + G.bx1) / 2;
  // 실제 대로 중심을 가로 모형의 대로에 맞춘다 (차이가 크면 그대로 둔다: 모형 가로는 실제 길과 다를 수 있다)
  let shift = 0;
  if (best && roadX != null) { const real = bxc + dot([best.p[0] - c[0], best.p[1] - c[1]], ex); if (Math.abs(roadX - real) < 45) shift = roadX - real; }
  const to = (p) => { const d = [p[0] - c[0], p[1] - c[1]]; return [bxc + shift + dot(d, ex), dot(d, ez)]; };
  return { to, ex, ez, c, bxc, shift, road: best };
}

// 지도 → 시뮬레이션 좌표 사본. zone: 가로 모형이 차지하는 직사각형(여기 안의 지형지물은 지운다), xMid만큼 옮겨 원점 근처로
function transformCtx(ctx, F, zone, xMid) {
  const T = (p) => { const q = F.to(p); return [q[0] - xMid, q[1]]; };
  const zx0 = zone.x0 - xMid, zx1 = zone.x1 - xMid, inZ = (x, z, m = 0) => x > zx0 - m && x < zx1 + m && z > zone.z0 - m && z < zone.z1 + m;
  const ringT = (ring) => ring.map(T);
  const hitsZone = (ring) => ring.some(([x, z]) => inZ(x, z, 4)) || [[zx0, zone.z0], [zx1, zone.z0], [zx1, zone.z1], [zx0, zone.z1]].some(([x, z]) => inPoly(x, z, ring));
  const buildings = [];
  (ctx.buildings || []).forEach(b => { if (!b.ring || b.ring.length < 3) return; const ring = ringT(b.ring); if (hitsZone(ring)) return; buildings.push({ ...b, ring, holes: (b.holes || []).map(ringT) }); });
  const cut = (list) => {
    const out = [];
    (list || []).forEach(r => {
      const pts = densify(r.pts.map(T), 20); let cur = [];
      pts.forEach(p => { if (inZ(p[0], p[1], 1)) { if (cur.length > 1) out.push({ ...r, pts: cur }); cur = []; } else cur.push(p); });
      if (cur.length > 1) out.push({ ...r, pts: cur });
    });
    return out;
  };
  const poly = (list) => (list || []).map(g => ({ ...g, outer: ringT(g.outer), holes: (g.holes || []).map(ringT) }));
  return {
    source: ctx.source,
    buildings,
    roads: cut(ctx.roads),
    rails: cut(ctx.rails), streams: cut(ctx.streams),
    water: poly(ctx.water), green: poly(ctx.green),
    peaks: (ctx.peaks || []).map(p => { const [x, z] = T([p.x, p.z]); return { ...p, x, z }; }),
    labels: (ctx.labels || []).map(l => { const [x, z] = T([l.x, l.z]); return { ...l, x, z }; }),
    crossings: [],
  };
}

// 주변 맥락 만들기. 반환: { group, mask, dispose, stats, labels, key }
// opts: { plan, gen, G, roadX, zone: {x0,x1,z0,z1}, near: {x0,x1,z0,z1}(땅 덩어리, 지면에 구멍), P(팔레트), lite, renderer }
export function buildSimContext(ctx, opts) {
  const { plan, gen, G, roadX, zone, near, P, lite, renderer } = opts;
  const F = simFrame(plan, ctx, G, roadX);
  const xMid = (zone.x0 + zone.x1) / 2;
  const ctxT = transformCtx(ctx, F, zone, xMid);
  const planSim = {
    key: 'sim', rotDeg: 0, cos: 1, sin: 0, site: plan.site, lat: plan.lat,
    SITE: { u0: zone.x0 - xMid, u1: zone.x1 - xMid, v0: zone.z0, v1: zone.z1 },
    toWorld: (u, v) => [u, v], toSite: (x, z) => [x, z],
  };
  const c3 = buildContext(ctxT, planSim, P, { lite, maxTex: renderer.capabilities.maxTextureSize, aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy() || 4) });
  const group = new THREE.Group(); group.name = 'sim-context';
  c3.group.position.x = xMid; group.add(c3.group);
  // 지면에 구멍: 현장 흙 덩어리 위는 지도 지면을 그리지 않는다 (스텐실)
  c3.stencilMats.forEach(m => Object.assign(m, { stencilWrite: true, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: 1, stencilWriteMask: 0xff, stencilFuncMask: 0xff, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp }));
  const maskM = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, side: THREE.DoubleSide });
  const maskG = new THREE.PlaneGeometry(near.x1 - near.x0, near.z1 - near.z0).rotateX(-Math.PI / 2);
  const mask = new THREE.Mesh(maskG, maskM); mask.position.set((near.x0 + near.x1) / 2, 0.02, (near.z0 + near.z1) / 2); mask.renderOrder = -50; mask.userData.noAO = true; group.add(mask);
  // 같은 배치의 다른 동: 반투명 계획 볼륨 + 윤곽
  const planG = new THREE.Group(); planG.name = 'plan-others'; group.add(planG);
  const pm = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6, transparent: true, opacity: 0.5, depthWrite: false });
  const lm = new THREE.LineBasicMaterial({ color: 0x5b5e63, transparent: true, opacity: 0.55 });
  const geos = [];
  let nPlan = 0;
  const main = G.main;
  (gen && gen.bldgs ? gen.bldgs : []).forEach(b => {
    if (b === main || b.kind === 'basement' || !b.rect) return;
    const h = b.height || (b.floors && b.floors.length ? b.floors[b.floors.length - 1].y1 : 0); if (!(h > 2)) return;
    const R = b.rect, cs = [[R.u0, R.v0], [R.u1, R.v0], [R.u1, R.v1], [R.u0, R.v1]].map(([u, v]) => F.to(plan.toWorld(u, v)));
    if (cs.some(([x, z]) => x > zone.x0 - 2 && x < zone.x1 + 2 && z > zone.z0 - 2 && z < zone.z1 + 2)) return;
    const sh = new THREE.Shape(cs.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); geos.push(g);
    const m = new THREE.Mesh(g, pm); m.renderOrder = 2; planG.add(m);
    const eg = new THREE.EdgesGeometry(g, 30); geos.push(eg); planG.add(new THREE.LineSegments(eg, lm));
    nPlan++;
  });
  const labels = c3.labels.filter(l => l.text).map(l => ({ t: l.text, p: [l.x + xMid, (l.y || 0) + 14, l.z], cls: 'ctx' }));
  return {
    group, mask, labels, frame: F,
    stats: { ...c3.stats, plan: nPlan, shift: F.shift },
    dispose() { c3.dispose(); maskG.dispose(); maskM.dispose(); pm.dispose(); lm.dispose(); geos.forEach(g => g.dispose()); },
  };
}
