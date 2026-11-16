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
    rbar(ax, ay, az, bx, by, bz, w, d = w, r = Math.min(w, d) * 0.3) { _D.set(bx - ax, by - ay, bz - az); const L = _D.length(); if (L < 1e-4) return api; _Q.setFromUnitVectors(UP, _D.multiplyScalar(1 / L)); _M.compose(_V.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _Q, _S); return add(new RoundedBoxGeometry(w, L, d, 2, Math.min(r, w / 2 - 1e-3, d / 2 - 1e-3, L / 2 - 1e-3)), _M); },
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

// 격자 붐 (크롤러 크레인 붐·천공기 리더): 네 주재 + 면마다 지그재그, 양 끝은 좁아진다 (x 0 → len, 단면 가운데가 원점)
export function latticeBoomGeo(len, w = 1.3, h = 1.2, taper = true, pitch = 1.3) {
  const s = shape(), c = Math.max(0.08, Math.min(w, h) * 0.1), l = c * 0.55;
  const k = (x) => !taper ? 1 : x < len * 0.12 ? 0.55 + 0.45 * x / (len * 0.12) : x > len * 0.85 ? 1 - 0.55 * (x - len * 0.85) / (len * 0.15) : 1;
  const P = (x, sy, sz) => [x, sy * h / 2 * k(x), sz * w / 2 * k(x)];
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const n = Math.max(2, Math.round(len / pitch)), st = len / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * st, x1 = x0 + st;
    C.forEach(([a, b]) => s.bar(...P(x0, a, b), ...P(x1, a, b), c));
    for (let f = 0; f < 4; f++) { const [a0, b0] = C[f], [a1, b1] = C[(f + 1) % 4]; s.bar(...P(x0, a0, b0), ...P(x1, a1, b1), l); if (i % 2 === 0) s.bar(...P(x0, a0, b0), ...P(x0, a1, b1), l * 0.9); }
  }
  s.box(len - 0.2, len + 0.35, -h * 0.3, h * 0.3, -w * 0.3, w * 0.3); [-1, 1].forEach(z => s.cyl(len + 0.2, 0, z * w * 0.18, h * 0.32, 0.12, 'z', 14)); // 붐 끝 도르래
  return s.done();
}
// 궤도 하부 (한쪽): 둥근 트랙 + 하부 롤러 + 구동 스프로킷 + 아이들러 (길이 L, 폭 tw, 높이 1.0, x 가운데·z 가운데)
export function trackGeo(L, tw = 0.9, H = 1.0) {
  const s = shape();
  s.rbox(-L / 2, L / 2, 0, H, -tw / 2, tw / 2, H * 0.45, 3);
  for (let x = -L / 2 + 0.35; x < L / 2 - 0.2; x += 0.32) { s.box(x - 0.06, x + 0.06, H - 0.02, H + 0.04, -tw / 2, tw / 2); s.box(x - 0.06, x + 0.06, -0.04, 0.02, -tw / 2, tw / 2); } // 슈 (그라우저)
  return s.done();
}
export function trackWheelsGeo(L, tw = 0.9, H = 1.0) {
  const s = shape(), zo = tw / 2 + 0.02;
  [-L / 2 + H * 0.45, L / 2 - H * 0.45].forEach((x, i) => { s.cyl(x, H / 2, zo, H * 0.36, 0.08, 'z', 18); s.cyl(x, H / 2, zo + 0.06, H * 0.14, 0.08, 'z', 10); if (i) for (let t = 0; t < 10; t++) { const a = t * Math.PI / 5; s.box(x + Math.cos(a) * H * 0.36 - 0.05, x + Math.cos(a) * H * 0.36 + 0.05, H / 2 + Math.sin(a) * H * 0.36 - 0.05, H / 2 + Math.sin(a) * H * 0.36 + 0.05, zo - 0.04, zo + 0.04); } });
  for (let x = -L / 2 + H * 0.95; x < L / 2 - H * 0.8; x += 0.62) s.cyl(x, 0.24, zo, 0.16, 0.06, 'z', 12); // 하부 롤러
  s.box(-L / 2 + H * 0.5, L / 2 - H * 0.5, H * 0.42, H * 0.62, zo - 0.01, zo + 0.03); // 트랙 프레임
  return s.done();
}

// 면 뒤집기 (안쪽 껍질용): 감는 순서와 법선을 반대로
export function flipGeo(g) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  const n = g.attributes.normal; if (n) for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
  return g;
}
// 굴착기 버킷 (힌지가 원점): 등판이 +x 쪽으로 휘어 내려가 아래에서 날 끝 · 이빨이 −x(굴착 방향)를 본다
// 바깥 껍질 + 안쪽 껍질(뒤집음) + 옆판(부채꼴) + 날 + 이빨 5개 + 힌지 귀·핀
export function bucketGeo(w = 1.24, r = 0.6) {
  const s = shape(), cx = 0.42, cy = -0.52, t0 = Math.PI * 0.07, tl = Math.PI * 0.97;
  s.geo(new THREE.CylinderGeometry(r, r, w, 18, 1, false, t0, tl).rotateX(Math.PI / 2).translate(cx, cy, 0));
  s.geo(flipGeo(new THREE.CylinderGeometry(r - 0.05, r - 0.05, w - 0.1, 18, 1, true, t0, tl).rotateX(Math.PI / 2).translate(cx, cy, 0)));
  const ex = cx + r * Math.sin(t0), ey = cy - r * Math.cos(t0), dx = -Math.cos(t0), dy = -Math.sin(t0);
  s.bar(ex, ey, -w / 2, ex, ey, w / 2, 0.09, 0.09); // 날
  for (let k = 0; k < 5; k++) { const z = -w / 2 + 0.12 + k * (w - 0.24) / 4; s.tube(ex, ey, z, ex + dx * 0.26, ey + dy * 0.26 - 0.03, z, 0.065, 5, 0.022); }
  [-1, 1].forEach(k => { s.box(-0.14, 0.5, -0.14, 0.16, k * 0.3 - 0.04, k * 0.3 + 0.04); s.box(cx + r * 0.55, cx + r * 1.02, cy - 0.1, cy + 0.12, k * w / 2 - 0.03, k * w / 2 + 0.03); }); // 힌지 귀 · 옆 보강
  s.cyl(0, 0, 0, 0.075, 0.74, 'z', 10); s.cyl(0.42, 0.06, 0, 0.065, 0.74, 'z', 10); // 핀
  for (let k = 0; k < 2; k++) { const a = t0 + tl * (0.35 + k * 0.3); s.bar(cx + (r + 0.02) * Math.sin(a), cy - (r + 0.02) * Math.cos(a), -w / 2 + 0.1, cx + (r + 0.02) * Math.sin(a), cy - (r + 0.02) * Math.cos(a), w / 2 - 0.1, 0.05, 0.05); } // 마모판
  return s.done();
}
// 클램셸 버킷 반쪽 (힌지 축 = x축, 원점): 아래에서 sgn 쪽 옆으로 휜 1/4 원통 + 부채꼴 옆판 + 이빨 + 위 연결대
export function clamHalfGeo(sgn = 1, R = 1.25, L = 1.7) {
  const s = shape(), t0 = sgn > 0 ? -Math.PI / 2 : Math.PI, tl = Math.PI / 2;
  s.geo(new THREE.CylinderGeometry(R, R, L, 14, 1, false, t0, tl).rotateZ(Math.PI / 2));
  s.geo(flipGeo(new THREE.CylinderGeometry(R - 0.05, R - 0.05, L - 0.1, 14, 1, true, t0, tl).rotateZ(Math.PI / 2)));
  for (let k = 0; k < 4; k++) { const x = -L / 2 + 0.22 + k * (L - 0.44) / 3; s.tube(x, -R + 0.02, sgn * 0.02, x, -R - 0.18, -sgn * 0.06, 0.06, 5, 0.02); }
  [-1, 1].forEach(k => s.bar(k * (L / 2 - 0.12), 0.95, sgn * 0.12, k * (L / 2 - 0.12), 0.02, sgn * R * 0.95, 0.08, 0.08)); // 연결대
  s.cyl(0, 0, 0, 0.09, L + 0.1, 'x', 10);
  return s.done();
}
// 흙·골재 더미: 납작한 반구를 울퉁불퉁하게 (seed마다 모양이 다름, 바닥 y=0, 반지름 1, 높이 1)
export function moundGeo(seed = 1, seg = 22) {
  const g = new THREE.SphereGeometry(1, seg, 9, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const n = 1 + 0.13 * Math.sin(3 * a + seed) + 0.07 * Math.sin(7 * a + 2.3 * seed + 3 * y) + 0.035 * Math.sin(13 * a + 3 * seed);
    p.setXYZ(i, x * n, Math.pow(Math.max(0, y), 1.15) * (1 + 0.16 * Math.sin(5 * a + 1.7 * seed) * (1 - y)), z * n);
  }
  g.computeVertexNormals(); return g;
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
