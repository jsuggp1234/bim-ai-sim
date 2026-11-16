// 현장 디테일 키트: 레고 같은 상자 하나 대신, 실제 부재(격자 트러스·둥근 모서리 차체·원통 파이프)를
// 한 형상으로 합쳐 만든다 (그리기 호출 1번). 크레인 마스트·지브, 운전실, 훅 블록, 자재 더미 등에 쓴다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const UP = new THREE.Vector3(0, 1, 0);
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _V = new THREE.Vector3(), _S = new THREE.Vector3(1, 1, 1), _D = new THREE.Vector3();

// 형상 모으개: box / rbox(둥근 모서리) / bar(두 점 사이 각재) / tube(두 점 사이 원통) / cyl(축 원통) → done()에서 하나로
export function shape() {
  const parts = [];
  const add = (g, m) => { if (m) g.applyMatrix4(m); const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); if (n.attributes.uv == null) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); parts.push(n); return api; };
  const sz = (a, b) => Math.max(1e-3, Math.abs(b - a));
  const api = {
    box(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(sz(x0, x1), sz(y0, y1), sz(z0, z1)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return add(g); },
    rbox(x0, x1, y0, y1, z0, z1, r = 0.08, seg = 2) { const w = sz(x0, x1), h = sz(y0, y1), d = sz(z0, z1), rr = Math.max(1e-3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)); const g = new RoundedBoxGeometry(w, h, d, seg, rr); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return add(g); },
    bar(ax, ay, az, bx, by, bz, w, d = w) { _D.set(bx - ax, by - ay, bz - az); const L = _D.length(); if (L < 1e-4) return api; _Q.setFromUnitVectors(UP, _D.multiplyScalar(1 / L)); _M.compose(_V.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _Q, _S); return add(new THREE.BoxGeometry(w, L, d), _M); },
    tube(ax, ay, az, bx, by, bz, r, seg = 8, r2 = r, open = false) { _D.set(bx - ax, by - ay, bz - az); const L = _D.length(); if (L < 1e-4) return api; _Q.setFromUnitVectors(UP, _D.multiplyScalar(1 / L)); _M.compose(_V.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _Q, _S); return add(new THREE.CylinderGeometry(r2, r, L, seg, 1, open), _M); },
    cyl(x, y, z, r, h, axis = 'y', seg = 16) { const g = new THREE.CylinderGeometry(r, r, h, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); if (axis === 'z') g.rotateX(Math.PI / 2); g.translate(x, y, z); return add(g); },
    geo(g, m) { return add(g, m); },
    get n() { return parts.length; },
    done() { if (!parts.length) return new THREE.BoxGeometry(1e-3, 1e-3, 1e-3); const g = mergeGeometries(parts, false); parts.forEach(p => p.dispose()); g.computeBoundingBox(); g.computeBoundingSphere(); return g; },
  };
  return api;
}

// ---------- 타워크레인 ----------
// 마스트 한 마디 (바닥 가운데가 원점, 높이 h): 네 모서리 주재 + 면마다 지그재그 사재 + 이음 가로재
export const MAST_H = 2.6;
export function mastSectionGeo(w = 1.8, h = MAST_H) {
  const s = shape(), a = w / 2, c = 0.15, l = 0.07;
  const C = [[-a, -a], [a, -a], [a, a], [-a, a]];
  C.forEach(([x, z]) => { s.box(x - c / 2, x + c / 2, 0, h, z - c / 2, z + c / 2); s.box(x - c * 0.85, x + c * 0.85, 0, 0.16, z - c * 0.85, z + c * 0.85); });
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = C[i], [x1, z1] = C[(i + 1) % 4];
    s.bar(x0, 0.08, z0, x1, 0.08, z1, l);
    s.bar(x0, 0.08, z0, x1, h / 2, z1, l * 0.85); s.bar(x1, h / 2, z1, x0, h - 0.04, z0, l * 0.85);
  }
  s.bar(-a, 0.08, -a, a, 0.08, a, l * 0.8); // 바닥 수평 가새
  return s.done();
}
// 지브 한 마디 (삼각 단면, 뿌리 쪽 x=0, 아래 주재 y=0): 트롤리 레일 = 아래 두 주재
export const JIB_L = 3;
export function jibSectionGeo(len = JIB_L, w = 1.25, h = 1.4) {
  const s = shape(), b = w / 2, c = 0.12, l = 0.06;
  [-b, b].forEach(z => s.box(0, len, 0, c, z - c / 2, z + c / 2));
  s.box(0, len, h - c * 0.8, h, -c * 0.45, c * 0.45);
  [-b, b].forEach(z => { s.bar(0, c / 2, z, len / 2, h - 0.05, 0, l); s.bar(len / 2, h - 0.05, 0, len, c / 2, z, l); });
  s.bar(0, c / 2, -b, 0, c / 2, b, l); s.bar(0, c / 2, -b, len, c / 2, b, l * 0.8);
  return s.done();
}
// 카운터 지브 한 마디 (−x 쪽으로 이어짐): 평행 주재 + 발판 + 난간
export const CJIB_L = 2.5;
export function cjibSectionGeo(len = CJIB_L, w = 1.9) {
  const s = shape(), b = w / 2, l = 0.06;
  [-b, b].forEach(z => { s.box(-len, 0, 0.25, 0.7, z - 0.08, z + 0.08); s.box(-len, 0, 1.55, 1.6, z - 0.03, z + 0.03); s.box(-0.06, 0, 0.7, 1.6, z - 0.03, z + 0.03); s.box(-len / 2 - 0.03, -len / 2 + 0.03, 0.7, 1.6, z - 0.03, z + 0.03); });
  s.bar(0, 0.3, -b, -len, 0.3, b, l); s.box(-0.05, 0, 0.25, 0.7, -b, b);
  for (let x = -0.15; x > -len; x -= 0.32) s.box(x - 0.04, x, 0.66, 0.7, -b + 0.1, b - 0.1); // 발판 (그레이팅)
  return s.done();
}
// 캣헤드 (정점 탑, 높이 h): 펜던트 바가 꼭대기에 걸린다
export function catHeadGeo(h = 6, w = 1.8) {
  const s = shape(), a = w / 2, t = 0.32, c = 0.14, l = 0.07;
  const B = [[-a, -a], [a, -a], [a, a], [-a, a]], Tp = B.map(([x, z]) => [x * t, z * t]);
  for (let i = 0; i < 4; i++) {
    s.bar(B[i][0], 0, B[i][1], Tp[i][0], h, Tp[i][1], c);
    const j = (i + 1) % 4, m = 0.5, mx = (q) => [B[q][0] + (Tp[q][0] - B[q][0]) * m, h * m, B[q][1] + (Tp[q][1] - B[q][1]) * m];
    const [ax, ay, az] = mx(i), [bx, by, bz] = mx(j);
    s.bar(ax, ay, az, bx, by, bz, l); s.bar(B[i][0], 0.05, B[i][1], bx, by, bz, l * 0.85); s.bar(ax, ay, az, Tp[j][0], h - 0.1, Tp[j][1], l * 0.85);
  }
  s.box(-a * t - 0.1, a * t + 0.1, h - 0.1, h + 0.25, -a * t - 0.1, a * t + 0.1); s.cyl(0, h + 0.35, 0, 0.18, 0.5, 'z', 12);
  return s.done();
}
// 선회부: 마스트 위 회전 테이블 + 링 (y −2.4 ~ 0). 마스트는 그 아래에서 끝난다
export const SLEW_H = 2.4;
export function slewGeo(w = 1.8) {
  const s = shape(), a = w / 2 + 0.15;
  s.rbox(-a, a, -SLEW_H, -SLEW_H + 0.5, -a, a, 0.06); s.cyl(0, -SLEW_H + 0.75, 0, a * 1.05, 0.5, 'y', 24);
  s.rbox(-a - 0.1, a + 0.1, -0.9, 0, -a - 0.1, a + 0.1, 0.06);
  [[-a, -a], [a, -a], [a, a], [-a, a]].forEach(([x, z]) => s.box(x - 0.08, x + 0.08, -SLEW_H + 1, -0.9, z - 0.08, z + 0.08));
  s.bar(-a, -SLEW_H + 1, -a, a, -0.9, -a, 0.07); s.bar(a, -SLEW_H + 1, a, -a, -0.9, a, 0.07);
  return s.done();
}
// 운전실: 둥근 모서리 몸체 + 창틀 (유리는 cabGlassGeo). 지브 뿌리 옆에 매달린다 (+x가 앞)
export function cabGeo() {
  const s = shape();
  s.rbox(0, 2.2, -2.3, 0, 0, 2.0, 0.18, 3);
  s.box(-0.3, 0.05, -0.4, -0.1, 0.2, 1.8); // 받침 브래킷
  return s.done();
}
export function cabGlassGeo() {
  const s = shape();
  s.box(2.19, 2.25, -1.95, -0.3, 0.12, 1.88); // 앞창
  [-0.05, 1.99].forEach(z => s.box(0.25, 2.05, -1.75, -0.45, z, z + 0.07)); // 옆창
  s.box(-0.04, 0.02, -1.7, -0.6, 0.4, 1.6); // 뒷창
  s.box(1.2, 2.05, -2.33, -2.27, 0.25, 1.75); // 바닥창
  return s.done();
}
// 카운터웨이트: 콘크리트 블록 4장 (x 0 ~ 3.6), 들고리 포함
export function counterweightGeo(n = 4) {
  const s = shape(), t = 0.82, g = 0.08;
  for (let i = 0; i < n; i++) { const x0 = i * (t + g); s.rbox(x0, x0 + t, -2.0, 0.3, -1.05, 1.05, 0.05); }
  return s.done();
}
export function cwFrameGeo(n = 4) { // 블록을 거는 강재 틀
  const s = shape(), L = n * 0.9;
  [-1.15, 1.15].forEach(z => { s.box(-0.1, L + 0.05, 0.3, 0.5, z - 0.08, z + 0.08); });
  for (let i = 0; i <= n; i++) s.box(i * 0.9 - 0.05, i * 0.9 + 0.01, 0.3, 0.5, -1.15, 1.15);
  return s.done();
}
// 훅 블록: 도르래 상자 + 고리
export function hookBlockGeo() {
  const s = shape();
  s.rbox(-0.32, 0.32, -0.42, 0, -0.2, 0.2, 0.07); [-0.15, 0.15].forEach(x => s.cyl(x, -0.18, 0, 0.14, 0.44, 'z', 14));
  s.cyl(0, -0.47, 0, 0.07, 0.12, 'y', 10);
  const tor = new THREE.TorusGeometry(0.13, 0.045, 8, 16, Math.PI * 1.5); tor.rotateZ(Math.PI * 0.75); tor.translate(0, -0.66, 0); s.geo(tor);
  return s.done();
}
// 기초 패드 (콘크리트) + 앵커
export function craneBaseGeo(w = 1.8) {
  const s = shape(), a = 3.2;
  s.rbox(-a, a, -0.05, 0.35, -a, a, 0.08);
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, z]) => s.rbox(x * (w / 2) - 0.3, x * (w / 2) + 0.3, 0.35, 0.75, z * (w / 2) - 0.3, z * (w / 2) + 0.3, 0.04));
  return s.done();
}

// ---------- 호이스트 ----------
// 랙 마스트 한 마디 (가운데 원점, 0.65 × 0.65, 높이 1.5): 주재 4 + 사재 + 앞면 랙
export const HMAST_H = 1.5;
export function hoistMastGeo(w = 0.65, h = HMAST_H) {
  const s = shape(), a = w / 2, c = 0.07, l = 0.035;
  const C = [[-a, -a], [a, -a], [a, a], [-a, a]];
  C.forEach(([x, z]) => s.box(x - c / 2, x + c / 2, 0, h, z - c / 2, z + c / 2));
  for (let i = 0; i < 4; i++) { const [x0, z0] = C[i], [x1, z1] = C[(i + 1) % 4]; s.bar(x0, 0.03, z0, x1, 0.03, z1, l); s.bar(x0, 0.03, z0, x1, h - 0.03, z1, l); }
  s.box(a + 0.02, a + 0.09, 0, h, -0.06, 0.06); // 랙
  return s.done();
}
// 호이스트 운반구: 철망 칸 + 지붕 + 문 (가운데 원점, 2 × 2.6 × 3, 바닥 y=0)
export function hoistCarGeo() {
  const s = shape();
  s.rbox(-1, 1, 0, 0.25, -1.5, 1.5, 0.04); s.rbox(-1.02, 1.02, 2.45, 2.65, -1.52, 1.52, 0.04);
  [[-1, -1.5], [1, -1.5], [1, 1.5], [-1, 1.5]].forEach(([x, z]) => s.box(x - 0.06, x + 0.06, 0.2, 2.5, z - 0.06, z + 0.06));
  [-1.5, 1.5].forEach(z => { s.box(-1, 1, 1.15, 1.22, z - 0.04, z + 0.04); }); s.box(-1.04, -0.96, 1.15, 1.22, -1.5, 1.5);
  s.rbox(0.95, 1.25, 0.6, 2.2, -0.6, 0.6, 0.05); // 구동부
  return s.done();
}
export function hoistMeshGeo() { // 철망 면 (반투명 재질로)
  const s = shape();
  [-1.5, 1.5].forEach(z => s.box(-0.98, 0.98, 0.25, 2.45, z - 0.01, z + 0.01)); s.box(-1.0, -0.98, 0.25, 2.45, -1.48, 1.48);
  return s.done();
}

// ---------- 질감 ----------
// 철망·안전망·그레이팅 같은 성긴 격자 (투명 바탕)
export function meshTex(color = '#2f6f4f', cell = 8, lw = 1.5, bg = null) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, 64, 64); }
  x.strokeStyle = color; x.lineWidth = lw;
  for (let i = 0; i <= 64; i += cell) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t;
}
