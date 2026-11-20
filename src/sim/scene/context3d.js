// 주변 맥락 3D: 지면(녹지·수면을 그린 텍스처 + 산 지형), 도로(보도·차도·차선·횡단보도·정지선·가로수),
// 다리(상판·교각·난간), 철도(자갈·레일), 수변 호안선, 건물(층·창 무늬 외벽, 지붕, 옥탑, 윤곽선), 공원 수목.
// 맥락 모델은 월드 좌표(x 동쪽, z 남쪽, 대지 중심 원점). ctxmodel.js 참고.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { facadeMaterial, PAT, surf } from './facade.js';
import { animateWater, shoreMask } from './water.js';
import { groundDetail } from './noise.js';
import { terrainFn, inPoly, centroid, rng, hashStr, densify, ROAD_CLASS } from '../ctxmodel.js';

const E = 3600; // 지면 텍스처 범위(±m)

// ---------- 작은 도구 ----------
export class Buf {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.idx = []; this.ext = {}; this.n = 0; }
  v(x, y, z, nx, ny, nz, c) { this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.col.push(c.r, c.g, c.b); return this.n++; }
  a(name, ...vals) { (this.ext[name] || (this.ext[name] = [])).push(...vals); }
  tri(a, b, c) { this.idx.push(a, b, c); }
  geo(extSizes = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    for (const [k, s] of Object.entries(extSizes)) g.setAttribute(k, new THREE.Float32BufferAttribute(this.ext[k] || [], s));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
const lineGeo = (pos) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g; };
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// 선의 각 점에서 왼쪽 법선(진행 방향 기준 +90°, 월드 xz)과 누적 거리
export function frames(pts) {
  const n = pts.length, nx = new Float32Array(n), nz = new Float32Array(n), s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    // 꺾인 곳은 마이터 길이 보정(최대 2배)
    let k = 1;
    if (i > 0 && i < n - 1) {
      const ux = pts[i][0] - pts[i - 1][0], uz = pts[i][1] - pts[i - 1][1], lu = Math.hypot(ux, uz) || 1;
      const cosHalf = Math.abs((ux / lu) * dx + (uz / lu) * dz);
      k = Math.min(2, 1 / Math.max(0.5, cosHalf));
    }
    nx[i] = -dz * k; nz[i] = dx * k;
  }
  return { nx, nz, s };
}

// 평평한 띠: 선 pts를 따라 [o0, o1] 오프셋 구간. yf(x, z, i) 높이
export function strip(B, pts, F, o0, o1, yf, color, dash = null) {
  let prevL = -1, prevR = -1;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const lx = x + F.nx[i] * o1, lz = z + F.nz[i] * o1, rx = x + F.nx[i] * o0, rz = z + F.nz[i] * o0;
    const L = B.v(lx, yf(lx, lz, i), lz, 0, 1, 0, color), R = B.v(rx, yf(rx, rz, i), rz, 0, 1, 0, color);
    if (dash) { B.a('aDash', F.s[i], dash[0], dash[1]); B.a('aDash', F.s[i], dash[0], dash[1]); }
    if (i) { B.tri(prevL, L, prevR); B.tri(prevR, L, R); }
    prevL = L; prevR = R;
  }
}
// 사각형 하나(월드 네 점, 반시계로 위에서 볼 때 위를 향하게 맞춤)
export function quad(B, p, y, color, dashS = [0, 0, 0, 0], dash = [0, 1]) {
  const ids = p.map(([x, z], k) => { const id = B.v(x, y, z, 0, 1, 0, color); B.a('aDash', dashS[k], dash[0], dash[1]); return id; });
  const cy = (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]);
  if (cy >= 0) { B.tri(ids[0], ids[1], ids[2]); B.tri(ids[0], ids[2], ids[3]); }
  else { B.tri(ids[0], ids[2], ids[1]); B.tri(ids[0], ids[3], ids[2]); }
}

// 차선 무늬(점선) 재질: aDash = (거리, 주기, 칠한 비율)
export function dashMaterial(extra = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, ...extra });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec3 aDash;\nvarying vec3 vDash;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDash = aDash;');
    sh.fragmentShader = 'varying vec3 vDash;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vDash.y > 0.0 && fract(vDash.x / vDash.y) > vDash.z) discard;');
  };
  m.customProgramCacheKey = () => 'dash';
  return m;
}

// 교차점 찾기 (지도에 교차점 정보가 없을 때): 선분 교차를 격자로 빠르게
export function findCrossings(roads) {
  const segs = [], cell = 80, grid = new Map();
  roads.forEach((r, ri) => {
    if (r.bridge || (r.rank || 0) < 2) return;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], id = segs.length;
      segs.push({ a, b, ri, i, r });
      const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const z0 = Math.floor(Math.min(a[1], b[1]) / cell), z1 = Math.floor(Math.max(a[1], b[1]) / cell);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx * 100003 + gz; const l = grid.get(k); if (l) l.push(id); else grid.set(k, [id]); }
    }
  });
  const found = new Map();
  grid.forEach(list => {
    for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      const A = segs[list[p]], C = segs[list[q]];
      if (A.ri === C.ri) continue;
      const d1x = A.b[0] - A.a[0], d1z = A.b[1] - A.a[1], d2x = C.b[0] - C.a[0], d2z = C.b[1] - C.a[1];
      const den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-6) continue;
      const ex = C.a[0] - A.a[0], ez = C.a[1] - A.a[1];
      const t = (ex * d2z - ez * d2x) / den, u = (ex * d1z - ez * d1x) / den;
      if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) continue;
      const x = A.a[0] + d1x * t, z = A.a[1] + d1z * t, key = Math.round(x / 4) + ':' + Math.round(z / 4);
      let X = found.get(key); if (!X) { X = { x, z, arms: [] }; found.set(key, X); }
      [[A, t], [C, u]].forEach(([S, tt]) => {
        const L = Math.hypot(S.b[0] - S.a[0], S.b[1] - S.a[1]) || 1, dx = (S.b[0] - S.a[0]) / L, dz = (S.b[1] - S.a[1]) / L;
        const atStart = tt < 0.01 && S.i === 1, atEnd = tt > 0.99 && S.i === S.r.pts.length - 1;
        const add = (sx, sz) => { if (!X.arms.some(a => a.dx * sx + a.dz * sz > 0.95)) X.arms.push({ dx: sx, dz: sz, w: S.r.w, rank: S.r.rank || 3, len: 60, bridge: false }); };
        if (!atStart) add(-dx, -dz);
        if (!atEnd) add(dx, dz);
      });
    }
  });
  return [...found.values()].filter(c => c.arms.length >= 3);
}

// 가장 긴 변 방향의 외접 직사각형 (월드)
function obb(ring) {
  let best = 0, ang = 0;
  for (let k = 0; k < ring.length; k++) { const p = ring[k], q = ring[(k + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L > best) { best = L; ang = Math.atan2(q[1] - p[1], q[0] - p[0]); } }
  const c = Math.cos(ang), s = Math.sin(ang), [cx, cz] = centroid(ring);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  ring.forEach(([x, z]) => { const lx = (x - cx) * c + (z - cz) * s, ly = -(x - cx) * s + (z - cz) * c; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); y0 = Math.min(y0, ly); y1 = Math.max(y1, ly); });
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return { x: cx + mx * c - my * s, z: cz + mx * s + my * c, w: x1 - x0, d: y1 - y0, a: ang };
}

const KIND_PAT = { res: PAT.res, house: PAT.house, com: PAT.punched, tower: PAT.curtain, ind: PAT.ind, civic: PAT.punched };
const KIND_FH = { res: 2.9, house: 3.0, com: 3.8, tower: 4.0, ind: 6.0, civic: 3.9 };
const KIND_COL = { res: 'wRes', house: 'wHouse', com: 'wCom', tower: 'wTower', ind: 'wInd', civic: 'wCivic' };

// 나무 한 그루 (줄기 + 두 덩이 수관), 정점색. 높이 1 기준. 수관은 아래쪽을 어둡게 해 그늘진 잎처럼
export function treeGeometry(P) { const g = speciesGeometry('zelkova'); repaintTree(g, P); return g; }
export function repaintTree(g, P) {
  const c = g.attributes.color, s = g.userData.split, sh = g.userData.shade;
  for (let i = 0; i < c.count; i++) { const k = i < s ? P.trunk : P.crown, f = sh ? sh[i] : 1; c.setXYZ(i, k.r * f, k.g * f, k.b * f); }
  c.needsUpdate = true;
}

// 벽 색: 종류마다 실제 도시에서 흔한 색 몇 가지 (낮 팔레트 기준 비율로 곱해 다른 테마에서도 같은 관계)
const KIND_REF = { res: 0xd6d0c3, house: 0xb48d76, com: 0xb6b9bc, tower: 0x8e9eab, ind: 0xc3c0b9, civic: 0xcbbfa6 };
const KIND_PAL = {
  res: [0xd6d0c3, 0xe4ddd0, 0xcfc9bd, 0xece8df, 0xd9cbb8, 0xc9c4bd, 0xdcc7b4, 0xb9b3a8, 0xe8e2d2, 0xc7b8a6],
  house: [0xb48d76, 0xa35f47, 0xc9a27e, 0xe3ddd0, 0x8a7a6c, 0xd1b89c, 0x7f5a4a, 0xbfb3a3],
  com: [0xb6b9bc, 0xc9c3b5, 0x9ea6ad, 0x7f858a, 0xd8d4cc, 0xa99b8a, 0xc2c7cc, 0x8f8a82],
  tower: [0x8e9eab, 0x7b8f9e, 0x9aa8b0, 0x6f7f8a, 0xa7b5bd, 0x5f7484, 0xb4bcc0],
  ind: [0xc3c0b9, 0xa9b8c6, 0xd6d6d2, 0x9fb3a2, 0xc9b9a0, 0xb5b5b0],
  civic: [0xcbbfa6, 0xb07a5e, 0xd5cfc2, 0xa9a59c, 0xc4a98a],
};
const ROOF_TILE = [0x4f565e, 0x3f5a73, 0x7a4a3a, 0x5d6b5a, 0x8a5a44, 0x6b6b6b, 0x5a4a44];
const _rc = new THREE.Color(), _pc = new THREE.Color();
function wallColor(Pn, kind, R) {
  const pal = KIND_PAL[kind] || KIND_PAL.com, ref = _rc.setHex(KIND_REF[kind] || KIND_REF.com), pick = _pc.setHex(pal[Math.floor(R() * pal.length) % pal.length]), b = 0.95 + R() * 0.08;
  const base = Pn[KIND_COL[kind] || 'wCom'];
  return new THREE.Color(Math.min(1, base.r * pick.r / ref.r * b), Math.min(1, base.g * pick.g / ref.g * b), Math.min(1, base.b * pick.b / ref.b * b));
}
// 모임지붕 (주택): 외접 상자 위에 처마를 내밀고 용마루를 긴 쪽으로. B에 정점을 넣는다
function hipRoof(B, o, y, hr, e, c) {
  const W = o.w / 2 + e, D = o.d / 2 + e, ca = Math.cos(o.a), sa = Math.sin(o.a);
  const P = (lx, ly, lz) => [o.x + lx * ca - lz * sa, y + ly, o.z + lx * sa + lz * ca];
  let faces;
  if (o.w >= o.d) { const r = Math.max(0, o.w / 2 - o.d / 2); const A = P(-W, 0, -D), Bq = P(W, 0, -D), C = P(W, 0, D), Dd = P(-W, 0, D), R1 = P(-r, hr, 0), R2 = P(r, hr, 0); faces = [[Dd, C, R2, R1], [Bq, A, R1, R2], [A, Dd, R1], [C, Bq, R2]]; }
  else { const r = Math.max(0, o.d / 2 - o.w / 2); const A = P(-W, 0, -D), Bq = P(W, 0, -D), C = P(W, 0, D), Dd = P(-W, 0, D), R1 = P(0, hr, -r), R2 = P(0, hr, r); faces = [[A, Dd, R2, R1], [C, Bq, R1, R2], [Bq, A, R1], [Dd, C, R2]]; }
  faces.forEach(f => {
    const [a, b, cc] = f, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const flip = ny < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const ids = f.map(p => B.v(p[0], p[1], p[2], nx, ny, nz, c));
    const tri = (i, j, k) => (flip ? B.tri(ids[i], ids[k], ids[j]) : B.tri(ids[i], ids[j], ids[k]));
    tri(0, 1, 2); if (f.length === 4) tri(0, 2, 3);
  });
}

// ---------- 수종 ----------
// 높이 1 기준 한 그루 (줄기 + 수관 덩어리, 정점색). 수종마다 수관 모양·잎 색·줄기 색이 다르다.
// zelkova 느티나무(넓게 퍼진 둥근 수관) · plane 버즘나무(크고 둥근) · ginkgo 은행나무(좁은 원뿔형, 연두) · cherry 벚나무(낮고 넓은 우산형) ·
// pine 소나무(굽은 붉은 줄기, 납작한 잎 뭉치 여럿, 짙은 청록) · conifer 메타세쿼이아·전나무(좁고 높은 원뿔) · shrub 관목(낮은 덤불)
export const TREE_SPECIES = {
  zelkova: { tint: [1.0, 1.0, 1.0], bark: [1, 1, 1] },
  plane: { tint: [1.08, 1.07, 0.92], bark: [1.35, 1.3, 1.15] },
  ginkgo: { tint: [1.24, 1.2, 0.74], bark: [0.92, 0.86, 0.84] },
  cherry: { tint: [0.93, 0.97, 0.9], bark: [0.72, 0.6, 0.6] },
  pine: { tint: [0.7, 0.84, 0.86], bark: [1.4, 0.82, 0.66] },
  conifer: { tint: [0.9, 1.08, 0.82], bark: [1.05, 0.8, 0.7] },
  shrub: { tint: [0.84, 1.04, 0.78], bark: [1, 1, 1] },
};
function lump(r, cx, cy, cz, sx = 1, sy = 1, sz = 1, det = 1, seed = 0) {
  const g = new THREE.IcosahedronGeometry(r, det), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.11 * Math.sin(x * 23.1 + seed * 3.7) * Math.cos(y * 19.7 - seed) + 0.06 * Math.sin(z * 31.3 + seed * 1.3);
    p.setXYZ(i, x * n * sx + cx, y * n * sy + cy, z * n * sz + cz);
  }
  return g;
}
function trunkSeg(x0, y0, z0, x1, y1, z1, r0, r1, seg = 6) {
  const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0), g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, true);
  g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
  g.applyQuaternion(q); g.translate(x0, y0, z0); return g;
}
// lod 1: 가까이 보는 나무 (둘레 잎 덩이까지 한 번 더 쪼갬) · lod 0: 멀리 숲·공원에 수천 그루 심는 나무 (삼각형 절반)
function speciesGeometry(id, lod = 1) {
  const T = [], C = [];
  const ring = (n, rad, y, r, sy = 1, a0 = 0) => { for (let k = 0; k < n; k++) { const a = a0 + k / n * Math.PI * 2; C.push(lump(r, Math.cos(a) * rad, y + 0.03 * Math.sin(k * 2.3), Math.sin(a) * rad, 1, sy, 1, lod ? 1 : 0, k + n)); } };
  if (id === 'zelkova') {
    T.push(trunkSeg(0, 0, 0, 0, 0.3, 0, 0.05, 0.04), trunkSeg(0, 0.28, 0, 0.12, 0.55, 0.05, 0.035, 0.02), trunkSeg(0, 0.28, 0, -0.1, 0.56, -0.07, 0.033, 0.02), trunkSeg(0, 0.28, 0, 0.02, 0.6, -0.1, 0.03, 0.02));
    C.push(lump(0.34, 0, 0.7, 0, 1.3, 0.72, 1.3, 1, 1), lump(0.2, 0.06, 0.88, -0.03, 1, 0.9, 1, 0, 2)); ring(4, 0.3, 0.6, 0.22, 0.85, 0.4);
  } else if (id === 'plane') {
    T.push(trunkSeg(0, 0, 0, 0.02, 0.4, 0, 0.055, 0.04), trunkSeg(0.02, 0.38, 0, 0.12, 0.62, 0.06, 0.03, 0.02), trunkSeg(0.02, 0.38, 0, -0.1, 0.6, -0.05, 0.03, 0.02));
    C.push(lump(0.36, 0, 0.68, 0, 1.1, 0.95, 1.1, 1, 3), lump(0.22, 0, 0.9, 0, 1, 0.8, 1, 0, 4)); ring(3, 0.27, 0.56, 0.21, 0.9, 1.1);
  } else if (id === 'ginkgo') {
    T.push(trunkSeg(0, 0, 0, 0, 0.62, 0, 0.04, 0.022));
    C.push(lump(0.19, 0, 0.4, 0, 1, 1.1, 1, 1, 5), lump(0.18, 0.02, 0.57, 0.01, 0.95, 1.1, 0.95, 1, 6), lump(0.15, -0.01, 0.73, 0, 0.9, 1.15, 0.9, 0, 7), lump(0.1, 0, 0.88, 0, 0.9, 1.2, 0.9, 0, 8), lump(0.11, 0.1, 0.5, -0.06, 1, 1, 1, 0, 9), lump(0.1, -0.09, 0.62, 0.07, 1, 1, 1, 0, 10));
  } else if (id === 'cherry') {
    T.push(trunkSeg(0, 0, 0, 0.03, 0.26, 0, 0.055, 0.045), trunkSeg(0.03, 0.25, 0, 0.22, 0.48, 0.08, 0.035, 0.02), trunkSeg(0.03, 0.25, 0, -0.2, 0.47, -0.06, 0.035, 0.02), trunkSeg(0.03, 0.25, 0, 0, 0.5, -0.2, 0.03, 0.02));
    C.push(lump(0.4, 0, 0.6, 0, 1.4, 0.5, 1.4, 1, 11), lump(0.24, 0.05, 0.74, 0.02, 1.2, 0.6, 1.2, 0, 12)); ring(5, 0.4, 0.52, 0.2, 0.7, 0.3);
  } else if (id === 'pine') {
    T.push(trunkSeg(0, 0, 0, 0.06, 0.32, 0.02, 0.045, 0.036), trunkSeg(0.06, 0.32, 0.02, -0.02, 0.62, -0.02, 0.036, 0.026), trunkSeg(-0.02, 0.62, -0.02, 0.05, 0.84, 0.03, 0.026, 0.015), trunkSeg(0.06, 0.4, 0.02, 0.22, 0.58, -0.1, 0.02, 0.01), trunkSeg(-0.01, 0.58, -0.02, -0.2, 0.7, 0.08, 0.018, 0.01));
    C.push(lump(0.21, 0.07, 0.86, 0.02, 1.3, 0.45, 1.2, 1, 13), lump(0.19, -0.18, 0.72, 0.09, 1.25, 0.42, 1.15, 1, 14), lump(0.18, 0.24, 0.62, -0.11, 1.2, 0.42, 1.2, 0, 15), lump(0.15, 0.02, 0.98, -0.03, 1.2, 0.45, 1.1, 0, 16), lump(0.13, -0.04, 0.58, -0.18, 1.2, 0.4, 1.1, 0, 17));
  } else if (id === 'conifer') {
    T.push(trunkSeg(0, 0, 0, 0, 0.3, 0, 0.035, 0.03));
    const cone = new THREE.ConeGeometry(0.17, 0.86, 8, 4); cone.translate(0, 0.57, 0);
    const p = cone.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), n = 1 + 0.12 * Math.sin(y * 60 + p.getX(i) * 20) * (y < 0.98 ? 1 : 0); p.setXYZ(i, p.getX(i) * n, y, p.getZ(i) * n); }
    C.push(cone);
  } else {
    C.push(lump(0.42, 0, 0.36, 0, 1.25, 0.82, 1.15, 1, 18), lump(0.3, 0.32, 0.28, 0.12, 1, 0.8, 1, 0, 19), lump(0.28, -0.3, 0.27, -0.1, 1, 0.8, 1, 0, 20));
  }
  const parts = [...T, ...C].map(x => { if (x.attributes.uv) x.deleteAttribute('uv'); return x.index ? x.toNonIndexed() : x; });
  const g = mergeGeometries(parts); parts.forEach(x => x.dispose());
  const split = T.reduce((n, x) => n + (x.index ? x.index.count : x.attributes.position.count), 0);
  g.computeBoundingBox(); const bb = g.boundingBox, h = bb.max.y || 1; g.scale(1 / h, 1 / h, 1 / h);
  const n = g.attributes.position.count, shade = new Float32Array(n);
  let c0 = Infinity; for (let i = split; i < n; i++) c0 = Math.min(c0, g.attributes.position.getY(i));
  // 수관은 각진 덩어리로 보이지 않게 부드럽게 음영한다: 덩어리마다의 둥근 법선에 수관 가운데에서 바깥으로 나가는 법선을 섞고(한 덩어리의 숲처럼),
  // 잎 색은 위(볕 드는 쪽)는 밝게 · 아래와 속은 어둡게 · 군데군데 얼룩지게 한다
  const pos = g.attributes.position, nor = g.attributes.normal;
  let cx = 0, cy = 0, cz = 0; for (let i = split; i < n; i++) { cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); } const nc = Math.max(1, n - split); cx /= nc; cy /= nc; cz /= nc;
  const hard = id === 'conifer';
  if (!nor || hard) g.computeVertexNormals();
  for (let i = 0; i < n; i++) {
    if (i < split) { shade[i] = 1; continue; }
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let nx = g.attributes.normal.getX(i), ny = g.attributes.normal.getY(i), nz = g.attributes.normal.getZ(i);
    if (!hard) { const dx = x - cx, dy = y - cy, dz = z - cz, dl = Math.hypot(dx, dy, dz) || 1; nx = 0.6 * nx + 0.4 * dx / dl; ny = 0.6 * ny + 0.4 * dy / dl + 0.12; nz = 0.6 * nz + 0.4 * dz / dl; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; g.attributes.normal.setXYZ(i, nx, ny, nz); }
    const hk = Math.min(1, Math.max(0, (y - c0) / Math.max(0.1, 1 - c0)));
    const patch = Math.sin(x * 9.1 + 1.3) * Math.sin(z * 8.3 + 0.7) + 0.6 * Math.sin(y * 13.7 + x * 5.1);
    shade[i] = (0.66 + 0.42 * hk) * (0.86 + 0.14 * Math.min(1, Math.max(0, ny + 0.75))) * (1 + 0.07 * patch);
  }
  if (split > 0 && !hard) { // 줄기는 면마다 법선 (각진 나무껍질 느낌은 그대로)
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), cb = new THREE.Vector3();
    for (let i = 0; i + 2 < split; i += 3) { a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2); cb.subVectors(c, b); ab.subVectors(a, b); cb.cross(ab).normalize(); for (let k = 0; k < 3; k++) g.attributes.normal.setXYZ(i + k, cb.x, cb.y, cb.z); }
  }
  g.attributes.normal.needsUpdate = true;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.userData.split = split; g.userData.shade = shade; g.userData.sp = id;
  return g;
}
// 수종별 형상 (정점색은 P의 줄기·잎 색 × 수종 색)
export function speciesGeometries(P, lod = 1) {
  const out = {};
  Object.keys(TREE_SPECIES).forEach(id => { out[id] = speciesGeometry(id, lod); repaintSpecies(out[id], P); });
  return out;
}
export function repaintSpecies(g, P) {
  const c = g.attributes.color, s = g.userData.split, sh = g.userData.shade, S = TREE_SPECIES[g.userData.sp] || TREE_SPECIES.zelkova;
  for (let i = 0; i < c.count; i++) { const k = i < s ? P.trunk : P.crown, t = i < s ? S.bark : S.tint, f = sh ? sh[i] : 1; c.setXYZ(i, k.r * t[0] * f, k.g * t[1] * f, k.b * t[2] * f); }
  c.needsUpdate = true;
}
// 가로수 수종 (길 하나에 한 수종: 한국 가로수는 은행나무·벚나무·느티나무·버즘나무가 많다)
export const STREET_SP = [['ginkgo', 0.36, 8, 11], ['zelkova', 0.28, 8, 12], ['cherry', 0.18, 6, 8], ['plane', 0.18, 9, 13]];
// 공원·숲 수종 섞기 [수종, 비율, 최소·최대 높이]
const PARK_SP = [['zelkova', 0.22, 7, 12], ['cherry', 0.14, 5, 8], ['pine', 0.2, 6, 11], ['conifer', 0.1, 10, 18], ['plane', 0.08, 9, 14], ['ginkgo', 0.06, 8, 12], ['shrub', 0.2, 1.2, 2.2]];
const FOREST_SP = [['pine', 0.46, 8, 14], ['zelkova', 0.26, 8, 14], ['conifer', 0.12, 12, 20], ['cherry', 0.06, 6, 9], ['shrub', 0.1, 1.5, 2.6]];
export function pickSpecies(list, r) { let t = r * list.reduce((s, x) => s + x[1], 0); for (const x of list) { t -= x[1]; if (t <= 0) return x; } return list[list.length - 1]; }

// 물결 법선 지도: 여러 방향 사인파를 더한 높이장 → 법선 (타일링)
function rippleNormal(n = 256) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), H = new Float32Array(n * n);
  const waves = [[3, 1, 0.5], [1, 4, 0.35], [-5, 2, 0.22], [7, -3, 0.15], [2, 9, 0.1], [-11, -6, 0.06]];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let h = 0; waves.forEach(([a, b, k], i) => { h += k * Math.sin(((a * x + b * y) / n) * Math.PI * 2 + i * 1.7); }); H[y * n + x] = h;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const hx = H[y * n + (x + 1) % n] - H[y * n + (x - 1 + n) % n], hy = H[((y + 1) % n) * n + x] - H[((y - 1 + n) % n) * n + x];
    const l = Math.hypot(hx * 6, hy * 6, 1), i = (y * n + x) * 4;
    img.data[i] = (-hx * 6 / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-hy * 6 / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 46, 1 / 46);
  return t;
}
// 녹지 질감: 밝고 어두운 점을 흩뿌린 작은 타일
function grainPattern(g2, n = 96) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), R = rng(7);
  for (let i = 0; i < n * n * 0.18; i++) { const d = R() < 0.5; g.fillStyle = d ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'; g.fillRect(Math.floor(R() * n), Math.floor(R() * n), 1 + (R() < 0.3 ? 1 : 0), 1); }
  return g2.createPattern(c, 'repeat');
}

// 완만한 기복: 실제 땅처럼 수백 m 단위로 오르내리는 굴곡 (±3~5m). 사업지 둘레 25m 안은 평평하게(가로 모형과 이어지게),
// 물가(강·바다·개천)와 지면 끝은 0으로. base: 산 지형
function vn2(seed) {
  const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  return (u, v) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv), a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1); return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv; };
}
export function relief(base, ctx, plan, off = false) {
  if (off || typeof document === 'undefined' || !plan || !plan.SITE) return base;
  const S = plan.SITE, n1 = vn2(17), n2 = vn2(29), n3 = vn2(43);
  // 물 가림판: 물·개천을 칠하고 흐리게 한 작은 지도 (1 = 물가)
  const M = 192, K2 = M / (2 * E), cv = document.createElement('canvas'); cv.width = cv.height = M;
  // 읽어 오는 캔버스는 CPU에 둔다 (GPU 캔버스는 읽을 때 3D 그리기가 끝나기를 기다려 지도를 바꿀 때 화면이 오래 멈춘다)
  const g = cv.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, M, M); g.filter = 'blur(3px)'; g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
  (ctx.water || []).forEach(w => { g.beginPath(); w.outer.forEach(([x, z], i) => (i ? g.lineTo((x + E) * K2, (z + E) * K2) : g.moveTo((x + E) * K2, (z + E) * K2))); g.closePath(); g.fill(); g.lineWidth = 4; g.stroke(); });
  (ctx.streams || []).forEach(st => { g.beginPath(); st.pts.forEach(([x, z], i) => (i ? g.lineTo((x + E) * K2, (z + E) * K2) : g.moveTo((x + E) * K2, (z + E) * K2))); g.lineWidth = 5; g.stroke(); });
  let wm = null; try { wm = g.getImageData(0, 0, M, M).data; } catch (e) { wm = null; }
  const wAt = (x, z) => {
    if (!wm) return 0;
    const u = clamp01((x + E) * K2 - 0.5, M - 1.001), v = clamp01((z + E) * K2 - 0.5, M - 1.001), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const at = (a, b) => wm[(b * M + a) * 4] / 255;
    return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
  };
  const fn = (x, z) => {
    const h0 = base(x, z);
    const [u, v] = plan.toSite(x, z), du = Math.max(0, u - S.u1, S.u0 - u), dv = Math.max(0, v - S.v1, S.v0 - v), dd = Math.hypot(du, dv);
    if (dd < 25) return h0;
    const edge = smooth((E - 120 - Math.max(Math.abs(x), Math.abs(z))) / 500);
    const k = smooth((dd - 25) / 280) * edge * (1 - Math.min(1, wAt(x, z) * 1.6)); if (k <= 0) return h0;
    const r = 6.5 * (n1(x / 640, z / 640) - 0.42) + 2.6 * (n2(x / 230 + 3.1, z / 230 - 7.7) - 0.5) + 0.9 * (n3(x / 110, z / 110) - 0.5);
    return h0 + r * k * (1 + Math.min(1, dd / 1500) * 0.6);
  };
  fn.rolling = true;
  return fn;
}
const clamp01 = (v, hi) => Math.max(0, Math.min(hi, v));

// ---------- 본체 ----------
export function buildContext(ctx, plan, P, opts = {}) {
  const lite = !!opts.lite;
  const group = new THREE.Group(); group.name = 'context';
  const S = plan.SITE;
  const terrain = relief(terrainFn(ctx.peaks, plan), ctx, plan, opts.flat);
  ctx.roads.forEach(r => { const C = ROAD_CLASS[r.kind] || ROAD_CLASS.residential; if (r.rank == null) r.rank = C.rank; if (!r.lanes) r.lanes = C.lanes; if (r.sw == null) r.sw = C.sw; });
  const insideSite = (x, z, m = 0) => { const [u, v] = plan.toSite(x, z); return u > S.u0 - m && u < S.u1 + m && v > S.v0 - m && v < S.v1 + m; };
  const R0 = Math.max(S.u1 - S.u0, S.v1 - S.v0) / 2;
  const markR = (lite ? 900 : 1700) + R0, treeR = (lite ? 650 : 1250) + R0, edgeR = (lite ? 1100 : 1900) + R0, parkR = (lite ? 900 : 1600) + R0;
  const mats = {}, geos = [], textures = [];
  const keep = (o) => { if (o.geometry) geos.push(o.geometry); return o; };
  const waterRings = ctx.water.map(w => w.outer);
  const inWater = (x, z) => ctx.water.some(w => inPoly(x, z, w.outer) && !w.holes.some(h => inPoly(x, z, h)));

  // 건물 격자 (나무가 건물 안에 서지 않게)
  const bgrid = new Map(), BC = 50;
  const bbox = ctx.buildings.map((b, i) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    b.ring.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
    for (let gx = Math.floor(x0 / BC); gx <= Math.floor(x1 / BC); gx++) for (let gz = Math.floor(z0 / BC); gz <= Math.floor(z1 / BC); gz++) { const k = gx * 100003 + gz; const l = bgrid.get(k); if (l) l.push(i); else bgrid.set(k, [i]); }
    return [x0, x1, z0, z1];
  });
  const inBuilding = (x, z, pad = 1.5) => {
    const l = bgrid.get(Math.floor(x / BC) * 100003 + Math.floor(z / BC)); if (!l) return false;
    for (const i of l) { const bb = bbox[i]; if (x < bb[0] - pad || x > bb[1] + pad || z < bb[2] - pad || z > bb[3] + pad) continue; if (inPoly(x, z, ctx.buildings[i].ring)) return true; }
    return false;
  };

  // ===== 지면: 녹지·수면·개천을 그린 텍스처 + 산 지형 =====
  const maxTex = opts.maxTex || 4096;
  const N = lite ? Math.min(2048, maxTex) : Math.min(4096, maxTex);
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g2 = cv.getContext('2d');
  const K = N / (2 * E), tx = (x) => (x + E) * K;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = opts.aniso || 4; textures.push(tex);
  const hex = (c) => '#' + c.getHexString();
  function paintGround(Pp) {
    g2.fillStyle = hex(Pp.ground); g2.fillRect(0, 0, N, N);
    const path = (rings) => { g2.beginPath(); rings.forEach(r => { r.forEach(([x, z], i) => (i ? g2.lineTo(tx(x), tx(z)) : g2.moveTo(tx(x), tx(z)))); g2.closePath(); }); };
    const GK = { park: Pp.park, garden: Pp.park, forest: Pp.forest, grass: Pp.grass, golf: Pp.grass, pitch: Pp.pitch };
    // 큰 것부터 (작은 공원이 숲 위에 보이게)
    const grain = grainPattern(g2);
    [...ctx.green].sort((a, b) => b.outer.length - a.outer.length).forEach(gr => { path([gr.outer, ...(gr.holes || [])]); g2.fillStyle = hex(GK[gr.kind] || Pp.grass); g2.fill('evenodd'); g2.fillStyle = grain; g2.fill('evenodd'); });
    ctx.water.forEach(w => {
      path([w.outer, ...(w.holes || [])]);
      g2.fillStyle = hex(Pp.water); g2.fill('evenodd');
      g2.lineWidth = Math.max(1.5, 7 * K); g2.strokeStyle = hex(Pp.bank); g2.stroke();
    });
    g2.lineCap = 'round'; g2.lineJoin = 'round';
    ctx.streams.forEach(s => {
      g2.beginPath(); s.pts.forEach(([x, z], i) => (i ? g2.lineTo(tx(x), tx(z)) : g2.moveTo(tx(x), tx(z))));
      g2.strokeStyle = hex(Pp.park); g2.lineWidth = Math.max(2, (s.w + 14) * K); g2.stroke();
      g2.strokeStyle = hex(Pp.water); g2.lineWidth = Math.max(1.2, s.w * K); g2.stroke();
    });
    // 사업지 바탕
    const c4 = [[S.u0, S.v0], [S.u1, S.v0], [S.u1, S.v1], [S.u0, S.v1]].map(([u, v]) => plan.toWorld(u, v));
    path([c4]); g2.fillStyle = hex(Pp.site); g2.fill();
    tex.needsUpdate = true;
  }
  paintGround(P);
  const hasHills = ctx.peaks.length > 0 || !!terrain.rolling;
  const tg = new THREE.PlaneGeometry(2 * E, 2 * E, hasHills ? (lite ? 120 : 200) : 1, hasHills ? (lite ? 120 : 200) : 1); tg.rotateX(-Math.PI / 2);
  if (hasHills) { const p = tg.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, terrain(p.getX(i), p.getZ(i))); tg.computeVertexNormals(); }
  mats.ground = groundDetail(surf({ map: tex }, 1), 0.2, 0.05);
  const ground = keep(new THREE.Mesh(tg, mats.ground)); ground.receiveShadow = true; ground.name = 'ground'; group.add(ground);
  mats.outer = surf({ color: P.ground.clone() }, 1);
  const og = new THREE.RingGeometry(E * 0.999, 40000, 8, 1); og.rotateX(-Math.PI / 2); og.rotateY(Math.PI / 8);
  const outer = keep(new THREE.Mesh(og, mats.outer)); outer.position.y = -0.05; outer.receiveShadow = true; group.add(outer);

  // ===== 수면: 하늘을 비추는 물 (잔물결 법선 지도) =====
  let water = null;
  if (ctx.water.length) {
    const shapes = ctx.water.map(w => {
      const sh = new THREE.Shape(w.outer.map(([x, z]) => new THREE.Vector2(x, -z)));
      (w.holes || []).forEach(h => sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
      return sh;
    });
    const wg = new THREE.ShapeGeometry(shapes); wg.rotateX(-Math.PI / 2);
    const ripple = rippleNormal(); textures.push(ripple);
    mats.water = surf({ color: P.water.clone(), normalMap: ripple, normalScale: new THREE.Vector2(0.22, 0.22) }, 0.1, 0.02);
    // 흐르는 물결 + 물가(얕은 물빛 · 바다 거품). 강은 흐름 방향 없이 느리게, 바다는 조금 빠르게
    const sm = shoreMask(ctx.water, lite ? 1200 : 1600, lite ? 512 : 768); if (sm) textures.push(sm.tex);
    animateWater(mats.water, { shore: sm, flow: ctx.water.some(w => w.sea) ? [0.014, 0.008] : [0.009, 0.005] });
    water = keep(new THREE.Mesh(wg, mats.water)); water.position.y = 0.12; water.receiveShadow = true; water.name = 'water'; group.add(water);
  }

  // 산 등고선 (20m 간격)
  const lines = { contour: [], shore: [], rail: [], railing: [], bedge: [] };
  ctx.peaks.forEach(pk => {
    for (let h = 20; h < pk.h; h += 20) {
      const r = pk.r * Math.sqrt(-Math.log(h / pk.h)), n = Math.max(48, Math.round(r / 18));
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const a = k / n * Math.PI * 2, x = pk.x + Math.cos(a) * r, z = pk.z + Math.sin(a) * r, y = terrain(x, z);
        const ok = Math.abs(y - h) < 6 && Math.abs(x) < E && Math.abs(z) < E;
        if (prev && ok) lines.contour.push(prev[0], prev[1] + 0.6, prev[2], x, y + 0.6, z);
        prev = ok ? [x, y, z] : null;
      }
    }
  });
  // 호안선
  ctx.water.forEach(w => [w.outer, ...(w.holes || [])].forEach(r => {
    for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; if (Math.hypot(p[0], p[1]) > 3200) continue; lines.shore.push(p[0], 0.35, p[1], q[0], 0.35, q[1]); }
  }));

  // ===== 도로 =====
  const crossings = (ctx.crossings && ctx.crossings.length ? ctx.crossings : findCrossings(ctx.roads)).filter(c => !insideSite(c.x, c.z, 6));
  const cgrid = new Map(), CC = 60;
  crossings.forEach(c => {
    c.trim = Math.max(...c.arms.map(a => a.w / 2)) + 1.5;
    const k = Math.floor(c.x / CC) * 100003 + Math.floor(c.z / CC); const l = cgrid.get(k); if (l) l.push(c); else cgrid.set(k, [c]);
  });
  const nearCross = (x, z, extra = 0) => {
    const gx = Math.floor(x / CC), gz = Math.floor(z / CC);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = cgrid.get((gx + a) * 100003 + gz + b); if (!l) continue; for (const c of l) if (Math.hypot(x - c.x, z - c.z) < c.trim + extra) return c; }
    return null;
  };
  const BW = new Buf(), BA = new Buf(), BM = new Buf(), BD = new Buf();
  const piers = [], streetTrees = [];
  // 다리 묶음: 끝점을 공유하는 다리끼리 한 줄로, 수면 위면 높게
  const bridges = ctx.roads.filter(r => r.bridge).map(r => ({ r, kind: 'road' })).concat(ctx.rails.filter(r => r.bridge).map(r => ({ r, kind: 'rail' })));
  {
    const key = (p) => Math.round(p[0]) + ':' + Math.round(p[1]);
    const ends = new Map();
    bridges.forEach((b, i) => { [b.r.pts[0], b.r.pts[b.r.pts.length - 1]].forEach(p => { const k = key(p); const l = ends.get(k); if (l) l.push(i); else ends.set(k, [i]); }); });
    const par = bridges.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    ends.forEach(l => { for (let k = 1; k < l.length; k++) par[find(l[k])] = find(l[0]); });
    const chains = new Map();
    bridges.forEach((b, i) => { const c = find(i); if (!chains.has(c)) chains.set(c, { wet: false, free: [] }); const C = chains.get(c); b.chain = C;
      if (!C.wet) C.wet = b.r.pts.some((p, k) => k % 3 === 1 && inWater(p[0], p[1])) || inWater(...b.r.pts[Math.floor(b.r.pts.length / 2)]); });
    ends.forEach((l, k) => { if (l.length === 1) { const b = bridges[l[0]]; const [x, z] = k.split(':').map(Number); b.chain.free.push([x, z]); } });
    chains.forEach(C => { C.H = C.wet ? 13 : 7; C.ramp = C.wet ? 90 : 55; });
  }
  const bridgeY = (b) => (x, z) => {
    const C = b.chain; let d = Infinity; C.free.forEach(([fx, fz]) => { d = Math.min(d, Math.hypot(x - fx, z - fz)); });
    if (!C.free.length) d = C.ramp;
    return terrain(x, z) * (1 - smooth(d / C.ramp)) + C.H * smooth(d / C.ramp);
  };

  const W = { white: P.mark, yellow: P.markY };
  function roadMarkings(r, pts, F, yBase, onBridge) {
    const w = r.w, lanes = Math.max(1, r.lanes || 1), lw = w / lanes;
    const yM = (x, z, i) => yBase(x, z, i) + 0.06;
    const lines = [];
    const two = !r.oneway;
    if (r.rank >= 2 && w >= 5.5) {
      if (two) {
        if (r.rank >= 5) { lines.push([-0.2, 0.15, 'yellow', null], [0.2, 0.15, 'yellow', null]); }
        else if (w >= 6.5) lines.push([0, 0.15, 'yellow', null]);
        const nd = Math.floor(lanes / 2);
        for (let k = 1; k < nd; k++) { lines.push([k * lw, 0.15, 'white', [8, 0.375]], [-k * lw, 0.15, 'white', [8, 0.375]]); }
      } else for (let k = 1; k < lanes; k++) lines.push([-w / 2 + k * lw, 0.15, 'white', [8, 0.375]]);
      if (r.rank >= 6) lines.push([w / 2 - 0.4, 0.15, 'white', null], [-w / 2 + 0.4, 0.15, 'white', null]);
    }
    if (!lines.length) return;
    // 교차점 근처에서 끊는다
    const runs = []; let cur = [];
    pts.forEach((p, i) => { if (!onBridge && nearCross(p[0], p[1], 1)) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(i); });
    if (cur.length > 1) runs.push(cur);
    runs.forEach(run => {
      const sub = run.map(i => pts[i]), Fs = { nx: run.map(i => F.nx[i]), nz: run.map(i => F.nz[i]), s: run.map(i => F.s[i]) };
      lines.forEach(([o, wd, c, dash]) => strip(BM, sub, Fs, o - wd / 2, o + wd / 2, (x, z, k) => yM(x, z, run[k]), W[c], dash || [0, 1]));
    });
  }

  ctx.roads.forEach((r, ri) => {
    if (r.pts.length < 2) return;
    const rank = r.rank || 3, sw = r.sw || 0;
    const stSp = pickSpecies(STREET_SP, (hashStr('st' + (r.id || ri) + ':' + (r.name || '')) % 1000) / 1000);
    const b = r.bridge ? bridges.find(x => x.r === r) : null;
    const near = r.pts.some(p => Math.hypot(p[0], p[1]) < markR);
    const pts = hasHills || b ? densify(r.pts, 20) : r.pts;
    const F = frames(pts);
    const dp = near ? densify(r.pts, 6) : null, DF = dp ? frames(dp) : null;
    const ground = b ? bridgeY(b) : (x, z) => terrain(x, z);
    const yWalk = (x, z) => ground(x, z) + 0.12 + rank * 0.002;
    const yAsph = (x, z) => ground(x, z) + 0.2 + rank * 0.003;
    const hw = r.w / 2;
    if (sw > 0) { strip(BW, pts, F, -hw - sw, hw + sw, yWalk, P.walk); }
    strip(BA, pts, F, -hw, hw, yAsph, P.asphalt);
    if (near) roadMarkings(r, dp, DF, yAsph, !!b);
    if (b) bridgeBody(pts, F, hw + sw + 0.3, ground, r.w);
    // 가로수
    if (!b && rank >= 3 && rank <= 7 && sw >= 1.5 && near) {
      for (let i = 0; i < dp.length; i++) {
        if (i % 2) continue;
        const [x, z] = dp[i]; if (Math.hypot(x, z) > treeR) continue;
        [1, -1].forEach(sd => {
          const o = sd * (hw + sw * 0.62), tx2 = x + DF.nx[i] * o, tz = z + DF.nz[i] * o;
          if (nearCross(tx2, tz, 7) || insideSite(tx2, tz, 2) || inBuilding(tx2, tz, 0.8) || inWater(tx2, tz)) return;
          streetTrees.push([tx2, terrain(tx2, tz) + 0.12, tz, stSp[2] + (hashStr(i + ':' + sd + ':' + Math.round(x)) % 100) / 100 * (stSp[3] - stSp[2]), stSp[0]]);
        });
      }
    }
  });
  // 철도: 자갈 띠 + 레일 두 줄
  ctx.rails.forEach(r => {
    if (r.pts.length < 2) return;
    const b = r.bridge ? bridges.find(x => x.r === r) : null;
    const pts = densify(r.pts, b || hasHills ? 14 : 60), F = frames(pts);
    const ground = b ? bridgeY(b) : (x, z) => terrain(x, z);
    const half = (r.w || 3.6) / 2;
    strip(BW, pts, F, -half, half, (x, z) => ground(x, z) + 0.15, P.ballast);
    for (let i = 1; i < pts.length; i++) [-0.72, 0.72].forEach(o => {
      const a = [pts[i - 1][0] + F.nx[i - 1] * o, pts[i - 1][1] + F.nz[i - 1] * o], c = [pts[i][0] + F.nx[i] * o, pts[i][1] + F.nz[i] * o];
      lines.rail.push(a[0], ground(a[0], a[1]) + 0.45, a[1], c[0], ground(c[0], c[1]) + 0.45, c[1]);
    });
    if (b) bridgeBody(pts, F, half + 0.8, ground, half * 2);
  });

  // 다리 상판 옆면·바닥, 교각, 난간
  function bridgeBody(pts, F, half, yf, w) {
    const T = 1.9, c = P.bridge;
    for (const sd of [1, -1]) {
      let pa = -1, pb = -1;
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i][0] + F.nx[i] * half * sd, z = pts[i][1] + F.nz[i] * half * sd, y = yf(pts[i][0], pts[i][1]);
        const nx = F.nx[i] * sd, nz = F.nz[i] * sd, L = Math.hypot(nx, nz) || 1;
        const top = BD.v(x, y + 0.45, z, nx / L, 0, nz / L, c), bot = BD.v(x, y - T, z, nx / L, 0, nz / L, c);
        if (i) { if (sd > 0) { BD.tri(pa, pb, top); BD.tri(pb, bot, top); } else { BD.tri(pa, top, pb); BD.tri(pb, top, bot); } }
        pa = top; pb = bot;
        if (i) { const px = pts[i - 1][0] + F.nx[i - 1] * half * sd, pz = pts[i - 1][1] + F.nz[i - 1] * half * sd; lines.railing.push(px, yf(pts[i - 1][0], pts[i - 1][1]) + 1.3, pz, x, y + 1.3, z); }
      }
    }
    // 바닥
    let pl = -1, pr = -1;
    for (let i = 0; i < pts.length; i++) {
      const y = yf(pts[i][0], pts[i][1]) - T;
      const L = BD.v(pts[i][0] + F.nx[i] * half, y, pts[i][1] + F.nz[i] * half, 0, -1, 0, c), R = BD.v(pts[i][0] - F.nx[i] * half, y, pts[i][1] - F.nz[i] * half, 0, -1, 0, c);
      if (i) { BD.tri(pl, pr, L); BD.tri(pr, R, L); }
      pl = L; pr = R;
    }
    // 교각: 50m마다, 상판이 충분히 높은 곳
    let next = 25;
    for (let i = 1; i < pts.length; i++) {
      if (F.s[i] < next) continue; next = F.s[i] + 50;
      const [x, z] = pts[i], y = yf(x, z) - T, g = terrain(x, z);
      if (y - g < 3) continue;
      piers.push([x, g - 1, z, y - g + 1, Math.max(4, w * 0.62), Math.atan2(F.nz[i], F.nx[i])]);
    }
  }

  // 횡단보도 · 정지선
  crossings.forEach(c => {
    if (Math.hypot(c.x, c.z) > markR) return;
    const y = terrain(c.x, c.z) + 0.29;
    c.arms.forEach(a => {
      if (a.rank < 3 || a.rank > 7 || a.len < 10 || a.w < 5.5) return;
      const d0 = c.trim + 0.6, d1 = d0 + 4, px = -a.dz, pz = a.dx, hw = a.w / 2;
      const P4 = [[d0, -hw], [d1, -hw], [d1, hw], [d0, hw]].map(([d, o]) => [c.x + a.dx * d + px * o, c.z + a.dz * d + pz * o]);
      quad(BM, P4, y, W.white, [-hw, -hw, hw, hw], [0.9, 0.5]);
      const qx = a.dz, qz = -a.dx, e0 = d1 + 1.2, e1 = e0 + 0.45;
      const S4 = [[e0, 0], [e1, 0], [e1, hw - 0.3], [e0, hw - 0.3]].map(([d, o]) => [c.x + a.dx * d + qx * o, c.z + a.dz * d + qz * o]);
      quad(BM, S4, y, W.white);
    });
  });
  mats.walk = groundDetail(surf({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, 0.95), 0.08, 0.015);
  mats.asph = groundDetail(surf({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -5 }, 0.88), 0.12, 0.01);
  mats.mark = dashMaterial({ polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -9 });
  mats.deck = surf({ vertexColors: true }, 0.85);
  const walkM = keep(new THREE.Mesh(BW.geo(), mats.walk)); walkM.receiveShadow = true; group.add(walkM);
  const asphM = keep(new THREE.Mesh(BA.geo(), mats.asph)); asphM.receiveShadow = true; group.add(asphM);
  const markM = keep(new THREE.Mesh(BM.geo({ aDash: 3 }), mats.mark)); markM.receiveShadow = true; group.add(markM);
  const deckM = keep(new THREE.Mesh(BD.geo(), mats.deck)); deckM.castShadow = true; deckM.receiveShadow = true; group.add(deckM);
  const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0, 0.5, 0); geos.push(unit);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const put = (mesh, i, x, y, z, w, h, d, a) => { q4.setFromAxisAngle(Y, -a); s3.set(w, h, d); p3.set(x, y, z); m4.compose(p3, q4, s3); mesh.setMatrixAt(i, m4); };
  mats.pier = surf({ color: P.bridge.clone() }, 0.85);
  if (piers.length) {
    const pm = new THREE.InstancedMesh(unit, mats.pier, piers.length);
    piers.forEach(([x, y, z, h, w, a], i) => put(pm, i, x, y, z, w, h, 2.4, a));
    pm.castShadow = true; group.add(pm);
  }

  // ===== 건물 =====
  const BWall = new Buf(), BRoof = new Buf(), ranges = [], roofBoxes = [], specials = [], roofTanks = [], roofUnits = [];
  const TANK_C = [0x8fb3cf, 0xd9cdb5, 0xe8e8e4, 0x6f9fc8, 0xc9c2b0];
  const edges = [];
  const tmpC = new THREE.Color();
  ctx.buildings.forEach((b, bi) => {
    const ring = b.ring; if (!ring || ring.length < 3) { ranges.push(null); return; }
    const [cx, cz] = centroid(ring);
    let base = b.onHill ? terrain(cx, cz) : Infinity;
    if (!b.onHill) ring.forEach(([x, z]) => { base = Math.min(base, terrain(x, z)); });
    if (!isFinite(base)) base = 0;
    if (b.onHill) { specials.push({ x: cx, z: cz, y: base, h: b.h, name: b.name }); ranges.push(null); return; }
    const R = rng(hashStr('b' + (b.id || bi)));
    const kind = KIND_COL[b.kind] ? b.kind : 'com';
    const wallC = wallColor(P, kind, R);
    const roofC = P.roof.clone().multiplyScalar(0.93 + R() * 0.07);
    const lv = Math.max(1, b.levels || Math.round(b.h / KIND_FH[kind]));
    const fh = Math.max(2.6, Math.min(6.5, b.h / lv));
    const pat = b.h < 4 ? 0 : KIND_PAT[kind];
    const seed = R();
    const y0 = base - 0.3, y1 = base + b.h;
    const w0 = BWall.n, r0 = BRoof.n;
    const rings = [ring, ...(b.holes || [])];
    const far = Math.hypot(cx, cz) > edgeR;
    rings.forEach((rg, ri) => {
      // 바깥 고리는 반시계, 구멍은 시계 방향으로 (바깥 법선)
      let A = 0; for (let i = 0; i < rg.length; i++) { const p = rg[i], q = rg[(i + 1) % rg.length]; A += p[0] * q[1] - q[0] * p[1]; }
      const r2 = (ri === 0) === (A > 0) ? rg : [...rg].reverse();
      let s = 0;
      for (let i = 0; i < r2.length; i++) {
        const p = r2[i], q = r2[(i + 1) % r2.length];
        const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz); if (L < 0.05) continue;
        const nx = dz / L, nz = -dx / L;
        const a = BWall.v(p[0], y0, p[1], nx, 0, nz, wallC), bq = BWall.v(q[0], y0, q[1], nx, 0, nz, wallC), c = BWall.v(q[0], y1, q[1], nx, 0, nz, wallC), d = BWall.v(p[0], y1, p[1], nx, 0, nz, wallC);
        BWall.a('aFm', s, -0.3, 1, s + L, -0.3, 1, s + L, b.h, 1, s, b.h, 1);
        BWall.a('aFac', pat, fh, 6, seed, pat, fh, 6, seed, pat, fh, 6, seed, pat, fh, 6, seed);
        BWall.tri(a, c, bq); BWall.tri(a, d, c);
        s += L;
        if (!far) {
          edges.push(p[0], y1, p[1], q[0], y1, q[1]);
          const o = r2[(i + r2.length - 1) % r2.length], ux = p[0] - o[0], uz = p[1] - o[1], lu = Math.hypot(ux, uz) || 1;
          if (Math.abs((ux * dx + uz * dz) / (lu * L)) < 0.9) edges.push(p[0], base, p[1], p[0], y1, p[1]);
        }
      }
    });
    // 지붕
    try {
      const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
      const holes = (b.holes || []).map(h => h.map(([x, z]) => new THREE.Vector2(x, z)));
      const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
      const all = [...contour, ...holes.flat()];
      const ids = all.map(v => BRoof.v(v.x, y1, v.y, 0, 1, 0, roofC));
      faces.forEach(([i, j, k]) => {
        const A = all[i], Bv = all[j], C = all[k];
        const ny = (Bv.y - A.y) * (C.x - A.x) - (Bv.x - A.x) * (C.y - A.y);
        if (ny >= 0) BRoof.tri(ids[i], ids[j], ids[k]); else BRoof.tri(ids[i], ids[k], ids[j]);
      });
    } catch (e) { /* 꼬인 다각형은 지붕 생략 */ }
    // 주택은 절반 넘게 모임지붕(기와·강판색), 낮은 공동주택(빌라)·주택 옥상에는 물탱크
    const rFlat = BRoof.n - r0, Rp = rng(hashStr('r' + (b.id || bi)));
    let pC = null;
    if (!far && kind === 'house' && b.h < 13 && Rp() < 0.62) { const o = obb(ring); if (o.w * o.d < 520 && o.w > 3 && o.d > 3) { pC = new THREE.Color(ROOF_TILE[Math.floor(Rp() * ROOF_TILE.length)]).multiplyScalar(0.9 + Rp() * 0.15); hipRoof(BRoof, o, y1, Math.min(o.w, o.d) * (0.24 + Rp() * 0.14), 0.45, pC); } }
    if (!far && !pC && (kind === 'res' || kind === 'house') && b.h < 24 && Rp() < 0.55) { const o = obb(ring); if (o.w * o.d > 40) { const r = 0.7 + Rp() * 0.35; roofTanks.push([o.x + Math.cos(o.a) * o.w * 0.22, y1, o.z + Math.sin(o.a) * o.w * 0.22, r, 1.3 + Rp() * 0.6, TANK_C[Math.floor(Rp() * TANK_C.length)]]); } }
    if (!far && (kind === 'com' || kind === 'tower' || kind === 'civic') && b.h > 9) { const o = obb(ring); if (o.w * o.d > 120) { const n = 2 + Math.floor(Rp() * 5), ca = Math.cos(o.a), sa = Math.sin(o.a); for (let k = 0; k < n; k++) { const lx = -o.w * 0.3 + (k % 3) * 1.4, lz = o.d * 0.22 + Math.floor(k / 3) * 1.3; roofUnits.push([o.x + lx * ca - lz * sa, y1, o.z + lx * sa + lz * ca, 1.0, 0.95, 0.75, o.a]); } if (b.h > 30 && Rp() < 0.5) roofTanks.push([o.x - ca * o.w * 0.25, y1, o.z - sa * o.w * 0.25, 1.6, 2.6, 0xd2d4d6]); } }
    ranges.push([w0, BWall.n - w0, r0, rFlat, wallC, roofC, r0 + rFlat, BRoof.n - r0 - rFlat, pC]);
    // 옥탑
    if (b.h > 7 && !far) {
      const o = obb(ring); if (o.w * o.d < 90) return;
      const rc = roofC.clone().multiplyScalar(0.92);
      if (kind === 'res') {
        const n = o.w > 55 ? 2 : 1;
        for (let k = 0; k < n; k++) { const off = n > 1 ? (k ? 1 : -1) * o.w / 4 : 0; roofBoxes.push([o.x + Math.cos(o.a) * off, y1, o.z + Math.sin(o.a) * off, Math.min(7, o.w * 0.15), 3.2, Math.min(o.d * 0.55, 6), o.a, rc]); }
      } else if (kind === 'house') roofBoxes.push([o.x, y1, o.z, Math.min(3.4, o.w * 0.3), 2.6, Math.min(3, o.d * 0.4), o.a, rc]);
      else {
        roofBoxes.push([o.x, y1, o.z, o.w * 0.34, 3.6, o.d * 0.34, o.a, rc]);
        if (o.w > 24 && o.d > 18) roofBoxes.push([o.x + Math.cos(o.a) * o.w * 0.3, y1, o.z + Math.sin(o.a) * o.w * 0.3, 4.2, 2.6, 4.2, o.a, rc]);
      }
    }
  });
  mats.wall = facadeMaterial({ vertexColors: true }, { instanced: false });
  mats.roof = surf({ vertexColors: true }, 0.82);
  const wallG = BWall.geo({ aFm: 3, aFac: 4 }), roofG = BRoof.geo();
  const walls = keep(new THREE.Mesh(wallG, mats.wall)); walls.castShadow = true; walls.receiveShadow = true; walls.name = 'ctx-walls'; group.add(walls);
  const roofs = keep(new THREE.Mesh(roofG, mats.roof)); roofs.castShadow = true; roofs.receiveShadow = true; group.add(roofs);
  mats.rbox = surf({ color: 0xffffff }, 0.7);
  if (roofBoxes.length) {
    const rb = new THREE.InstancedMesh(unit, mats.rbox, roofBoxes.length);
    roofBoxes.forEach(([x, y, z, w, h, d, a, c], i) => { put(rb, i, x, y, z, w, h, d, a); rb.setColorAt(i, c); });
    rb.castShadow = true; rb.receiveShadow = true; group.add(rb);
  }
  // 옥상 물탱크 · 실외기
  if (roofTanks.length) {
    const tg2 = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); tg2.translate(0, 0.5, 0); geos.push(tg2);
    const tm = new THREE.InstancedMesh(tg2, mats.rbox, roofTanks.length);
    roofTanks.forEach(([x, y, z, r, h, c], i) => { put(tm, i, x, y, z, 2 * r, h, 2 * r, 0); tm.setColorAt(i, tmpC.setHex(c)); });
    tm.castShadow = true; tm.receiveShadow = true; group.add(tm);
  }
  if (roofUnits.length) {
    const um = new THREE.InstancedMesh(unit, mats.rbox, roofUnits.length);
    roofUnits.forEach(([x, y, z, w, h, d, a], i) => { put(um, i, x, y, z, w, h, d, a); um.setColorAt(i, tmpC.setHex(0xdcdcd8)); });
    um.castShadow = true; group.add(um);
  }
  // 전망 탑 (남산 N서울타워 같은 산 위 탑)
  specials.forEach(sp => {
    const tw = new THREE.Group(), m = mats.pier;
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(5, 7.5, 135, 14), m); sh.position.y = 67.5;
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(15, 12, 24, 18), m); pod.position.y = 122;
    const mastH = Math.max(40, sp.h - 140);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, mastH, 8), m); mast.position.y = 136 + mastH / 2;
    [sh, pod, mast].forEach(x => { x.castShadow = true; geos.push(x.geometry); tw.add(x); });
    tw.position.set(sp.x, sp.y - 2, sp.z); group.add(tw);
  });

  // ===== 수목: 가로수 + 공원·숲 =====
  const trees = [...streetTrees];
  const cap = lite ? 4500 : 16000;
  const parks = ctx.green.filter(g => /^(park|forest|garden|golf)$/.test(g.kind)).map(g => ({ g, c: centroid(g.outer) })).filter(x => Math.hypot(x.c[0], x.c[1]) < parkR)
    .sort((a, b) => Math.hypot(a.c[0], a.c[1]) - Math.hypot(b.c[0], b.c[1]));
  parks.forEach(({ g }) => {
    if (trees.length >= cap) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    g.outer.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
    const R = rng(hashStr('g' + Math.round(x0) + ':' + Math.round(z0)));
    const area = (x1 - x0) * (z1 - z0), dens = g.kind === 'forest' ? 70 : g.kind === 'golf' ? 900 : 160;
    const want = Math.min(g.kind === 'forest' ? 1400 : 700, Math.round(area / dens));
    for (let t = 0, got = 0; t < want * 3 && got < want && trees.length < cap; t++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (!inPoly(x, z, g.outer) || (g.holes || []).some(h => inPoly(x, z, h)) || insideSite(x, z, 3) || inWater(x, z) || inBuilding(x, z)) continue;
      const sp = pickSpecies(g.kind === 'forest' ? FOREST_SP : PARK_SP, R());
      trees.push([x, terrain(x, z), z, sp[2] + R() * (sp[3] - sp[2]), sp[0]]); got++;
    }
  });
  // 수종마다 InstancedMesh 하나. 그루마다 키·폭·방향·잎 색(밝기와 색조)을 조금씩 다르게
  // 대지에서 가까운 나무(320m 안)만 촘촘한 형상, 먼 숲·공원은 가벼운 형상 (그루 수가 많아 삼각형 수를 반으로 줄인다)
  const spG = speciesGeometries(P), spLo = speciesGeometries(P, 0), NEAR_T = 320; [...Object.values(spG), ...Object.values(spLo)].forEach(g => geos.push(g));
  mats.tree = surf({ vertexColors: true }, 0.95);
  const treeMeshes = []; let nTrees = 0;
  { const bySp = {}; trees.slice(0, cap).forEach(t => { const k = (spG[t[4]] ? t[4] : 'zelkova') + (Math.hypot(t[0], t[2]) < NEAR_T ? '' : '~'); (bySp[k] || (bySp[k] = [])).push(t); });
    Object.entries(bySp).forEach(([k, list]) => {
      const lo = k.endsWith('~'), im = new THREE.InstancedMesh(lo ? spLo[k.slice(0, -1)] : spG[k], mats.tree, list.length);
      list.forEach(([x, y, z, h], i) => {
        const r1 = ((x * 13.1 + z * 7.7) % 1 + 1) % 1, r2 = ((x * 3.7 - z * 11.3) % 1 + 1) % 1, r3 = ((x * 5.9 + z * 2.3) % 1 + 1) % 1, wf = 0.82 + r2 * 0.38;
        put(im, i, x, y, z, h * wf, h, h * (0.86 + r3 * 0.3), (x * 7.3 + z) % 6.28);
        const b = 0.84 + r1 * 0.28; im.setColorAt(i, tmpC.setRGB(b * (1 + (r2 - 0.5) * 0.08), b * (1 + (r3 - 0.5) * 0.06), b * (1 - (r2 - 0.5) * 0.1)));
      });
      im.castShadow = true; im.receiveShadow = true; im.name = 'trees-' + k; group.add(im); treeMeshes.push(im); nTrees += list.length;
    }); }

  // ===== 선 =====
  mats.edge = new THREE.LineBasicMaterial({ color: P.edge.clone(), transparent: true, opacity: 0.16 });
  mats.contour = new THREE.LineBasicMaterial({ color: P.edge.clone(), transparent: true, opacity: 0.12 });
  mats.shore = new THREE.LineBasicMaterial({ color: P.edge.clone(), transparent: true, opacity: 0.28 });
  mats.rail = new THREE.LineBasicMaterial({ color: P.rail.clone() });
  mats.railing = new THREE.LineBasicMaterial({ color: P.edge.clone(), transparent: true, opacity: 0.35 });
  const addLines = (arr, m) => { if (arr.length) group.add(keep(new THREE.LineSegments(lineGeo(arr), m))); };
  addLines(edges, mats.edge); addLines(lines.contour, mats.contour); addLines(lines.shore, mats.shore); addLines(lines.rail, mats.rail); addLines(lines.railing, mats.railing);

  // 라벨
  const labels = (ctx.labels || []).map(l => ({ ...l, y: (l.y || 0) + terrain(l.x, l.z) }));

  // ---------- 바꾸기 ----------
  function flat(Pn) {
    const k = Pn.flat ?? 1;
    ['ground', 'walk', 'asph', 'mark', 'deck'].forEach(n => mats[n].color.setScalar(k));
    mats.outer.color.copy(Pn.ground).multiplyScalar(k);
  }
  flat(P);
  function update(Pn) {
    P = Pn;
    paintGround(Pn);
    mats.pier.color.copy(Pn.bridge); flat(Pn);
    if (mats.water) mats.water.color.copy(Pn.water);
    ['edge', 'contour', 'shore', 'railing'].forEach(k => mats[k].color.copy(Pn.edge));
    mats.rail.color.copy(Pn.rail);
    recolor(walkM.geometry, Pn.walk); recolor(asphM.geometry, Pn.asphalt); recolor(deckM.geometry, Pn.bridge);
    // 차선: 노랑/흰 구분 유지
    const mc = markM.geometry.attributes.color;
    for (let i = 0; i < mc.count; i++) { const yel = mc.getX(i) > mc.getZ(i) + 0.15; const c = yel ? Pn.markY : Pn.mark; mc.setXYZ(i, c.r, c.g, c.b); }
    mc.needsUpdate = true;
    // 건물: 종류별 색을 비율로 바꿈
    ctx.buildings.forEach((b, i) => {
      const r = ranges[i]; if (!r) return;
      const kind = KIND_COL[b.kind] ? b.kind : 'com';
      const R = rng(hashStr('b' + (b.id || i)));
      r[4] = wallColor(Pn, kind, R); r[5] = Pn.roof.clone().multiplyScalar(0.93 + R() * 0.07);
    });
    setHeat(heatFn);
    [...Object.values(spG), ...Object.values(spLo)].forEach(g => repaintSpecies(g, Pn));
  }
  function recolor(g, c) { const a = g.attributes.color; for (let i = 0; i < a.count; i++) a.setXYZ(i, c.r, c.g, c.b); a.needsUpdate = true; }
  let heatFn = null;
  // fn(i) → THREE.Color | null (null이면 원래 색)
  function setHeat(fn) {
    heatFn = fn;
    const wc = wallG.attributes.color, rc = roofG.attributes.color;
    ranges.forEach((r, i) => {
      if (!r) return;
      const h = fn ? fn(i) : null;
      const cw = h || r[4], cr = h || r[5];
      for (let k = r[0]; k < r[0] + r[1]; k++) wc.setXYZ(k, cw.r, cw.g, cw.b);
      for (let k = r[2]; k < r[2] + r[3]; k++) rc.setXYZ(k, cr.r, cr.g, cr.b);
      if (r[7]) { const cp = h || r[8] || r[5]; for (let k = r[6]; k < r[6] + r[7]; k++) rc.setXYZ(k, cp.r, cp.g, cp.b); }
    });
    wc.needsUpdate = true; rc.needsUpdate = true;
  }
  function dispose() {
    geos.forEach(g => g.dispose()); textures.forEach(t => t.dispose());
    Object.values(mats).forEach(m => m.dispose());
    group.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
  }
  // 바닥을 뚫는 구멍(굴토)에서 지면을 감출 수 있게
  const stencilMats = [mats.ground, mats.outer];
  return { group, terrain, labels, update, setHeat, dispose, stencilMats, walls,
    stats: { buildings: ctx.buildings.length, roads: ctx.roads.length, trees: nTrees, species: new Set(treeMeshes.map(m => m.name.replace('~', ''))).size, crossings: crossings.length, source: ctx.source } };
}
