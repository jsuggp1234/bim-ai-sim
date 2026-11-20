// 통행 차량 (city3d.js에서 부른다): 차로마다 차가 앞차와 신호를 보고 스스로 가감속한다.
//  - 움직임: 지능형 운전자 모형(IDM). 원하는 속도까지 부드럽게 가속하고, 앞차와의 거리·속도 차로 감속한다.
//    빨간불이면 정지선을 '서 있는 앞차'로 보고 미리 줄여 서고(멈출 수 없는 거리면 그대로 지나간다), 초록불에 앞차부터 차례로 출발한다.
//  - 모양: 승용(세단)·SUV/승합·버스·트럭을 옆모습을 밀어낸 차체 + 좁은 유리 캐빈 + 바퀴 4개 + 전조등·제동등으로 (상자 대신)
//  - 제동등은 감속하거나 서 있을 때 밝아진다
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const CAR_C = [0xe9e9ec, 0x24262b, 0x9aa3ad, 0x3f5f8f, 0x8e2f2f, 0xd9d4c8, 0x56685a, 0xc9cdd3, 0x2d3f55, 0x6b6f77];
const KINDS = [
  { k: 'sedan', w: 1.82, h: 1.45, L: 4.7, p: 0.4, v0: [11, 15] }, { k: 'suv', w: 1.9, h: 1.72, L: 4.75, p: 0.22, v0: [10.5, 14] },
  { k: 'van', w: 1.95, h: 2.0, L: 5.2, p: 0.12, v0: [10, 13] }, { k: 'bus', w: 2.5, h: 3.2, L: 11, p: 0.1, v0: [8.5, 11] }, { k: 'truck', w: 2.45, h: 3.1, L: 8.2, p: 0.16, v0: [8.5, 11.5] },
];
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 옆모습(z: 길이 −0.5..0.5 앞이 +, y: 높이 0..1)을 폭 방향으로 밀어낸 형상. width: 폭 비율
function prism(pts, width = 1, bevel = 0.03) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.5, bevelSegments: 2, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); return g;
}
const join = (gs) => { const g = mergeGeometries(gs.map(x => (x.index ? x.toNonIndexed() : x)), false); gs.forEach(x => x.dispose()); g.computeVertexNormals(); return g; };
// 차체(색) · 유리 형상
function shapes() {
  const S = {};
  // 세단: 낮은 차체(보닛·트렁크) + 좁은 유리 캐빈 + 지붕 판
  S.sedanB = join([prism([[-0.5, 0.2], [-0.5, 0.5], [-0.47, 0.57], [-0.28, 0.6], [0.24, 0.61], [0.44, 0.55], [0.5, 0.45], [0.5, 0.2]]), prism([[-0.17, 0.885], [0.11, 0.905], [0.12, 0.935], [-0.18, 0.915]], 0.8, 0.02)]);
  S.sedanG = prism([[-0.29, 0.59], [-0.175, 0.9], [0.115, 0.92], [0.265, 0.6]], 0.86, 0.02);
  // SUV·승합: 높은 차체 + 뒤가 곧은 캐빈
  S.suvB = join([prism([[-0.5, 0.2], [-0.5, 0.6], [-0.47, 0.64], [0.22, 0.64], [0.44, 0.58], [0.5, 0.46], [0.5, 0.2]]), prism([[-0.44, 0.935], [0.07, 0.945], [0.08, 0.975], [-0.45, 0.965]], 0.82, 0.02)]);
  S.suvG = prism([[-0.48, 0.63], [-0.455, 0.95], [0.075, 0.96], [0.25, 0.63]], 0.88, 0.02);
  // 버스: 둥근 앞뒤 차체 + 창 띠 + 지붕 냉방기
  S.busB = join([prism([[-0.5, 0.1], [-0.5, 0.92], [-0.485, 0.97], [0.47, 0.97], [0.495, 0.9], [0.5, 0.45], [0.5, 0.1]]), prism([[-0.25, 0.97], [-0.25, 1.03], [0.1, 1.03], [0.1, 0.97]], 0.6, 0.02)]);
  S.busG = join([prism([[-0.47, 0.48], [-0.47, 0.82], [0.43, 0.82], [0.43, 0.48]], 1.012, 0.004), prism([[0.44, 0.4], [0.44, 0.84], [0.502, 0.84], [0.506, 0.4]], 0.9, 0.004)]);
  // 트럭 운전실 (적재함은 상자)
  S.cabB = prism([[0.2, 0.1], [0.2, 0.8], [0.24, 0.84], [0.4, 0.84], [0.47, 0.76], [0.5, 0.5], [0.5, 0.1]]);
  S.cabG = join([prism([[0.405, 0.52], [0.405, 0.8], [0.47, 0.745], [0.497, 0.52]], 0.92, 0.004), prism([[0.27, 0.52], [0.27, 0.76], [0.4, 0.76], [0.4, 0.52]], 1.012, 0.004)]);
  return S;
}

export function buildTraffic({ inst, mat, lanes, ZC, zx, seed = 1 }) {
  const R = rng(seed), per = 4, nV = lanes.length * per, S = shapes();
  const BOX = new THREE.BoxGeometry(1, 1, 1), WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16).rotateZ(Math.PI / 2);
  const geos = [...Object.values(S), BOX, WHEEL];
  const paint = () => mat(0xffffff, { metal: 0.5, rough: 0.32 }), glassM = mat(0x1b2530, { metal: 0.3, rough: 0.14 });
  const M = {
    sedanB: inst(S.sedanB, paint(), nV, null), sedanG: inst(S.sedanG, glassM, nV, null), suvB: inst(S.suvB, paint(), nV, null), suvG: inst(S.suvG, glassM, nV, null),
    busB: inst(S.busB, paint(), nV, null), busG: inst(S.busG, glassM, nV, null), cabB: inst(S.cabB, paint(), nV, null), cabG: inst(S.cabG, glassM, nV, null),
    cargo: inst(BOX, mat(0xffffff, { metal: 0.2, rough: 0.6 }), nV * 2, null), wheel: inst(WHEEL, mat(0x17171a, { rough: 0.75 }), nV * 6, null),
    head: inst(BOX, mat(0xfff4d2, { em: 1.3 }), nV * 2, null), tail: inst(BOX, mat(0x8e1a14, { em: 0.25 }), nV * 2, null), brake: inst(BOX, mat(0xff3b30, { em: 1.7 }), nV * 2, null),
  };
  const all = Object.values(M);
  const span = 2 * ZC;
  // 차량 상태: s(차 가운데의 차로 위 위치 0..span), v(속도 m/s)
  const vehs = [];
  lanes.forEach((L, li) => {
    for (let j = 0; j < per; j++) {
      let r = R(), kd = KINDS[0]; for (const x of KINDS) { r -= x.p; if (r <= 0) { kd = x; break; } }
      const v0 = kd.v0[0] + R() * (kd.v0[1] - kd.v0[0]);
      vehs.push({ li, kd, s: ((j + 0.15 + R() * 0.5) / per) * span, v: v0 * 0.9, v0, a: 0, run: false, th: 1.1 + R() * 0.6, amax: (kd.L > 7 ? 0.9 : 1.5) * (0.85 + R() * 0.3),
        c: new THREE.Color(kd.k === 'bus' ? [0x2f7a52, 0x2c5f9e, 0xd9d4c8][Math.floor(R() * 3)] : kd.k === 'truck' ? [0x2c5f9e, 0xe5e5e8, 0x9a3a2f, 0x3a3d44][Math.floor(R() * 4)] : CAR_C[Math.floor(R() * CAR_C.length)]) });
    }
  });
  const byLane = lanes.map((_, li) => vehs.filter(v => v.li === li));
  // 정지선 (앞범퍼가 설 자리, 차로 위 위치)
  const lineS = (dir) => (dir > 0 ? zx - 4.6 + ZC : ZC - (zx + 4.6));
  const B_COMF = 2.2, S0 = 2.2;
  function step(dt, carGo) {
    byLane.forEach((arr, li) => {
      const dir = lanes[li].dir, ls = lineS(dir);
      arr.sort((a, b) => a.s - b.s);
      const n = arr.length;
      for (let i = 0; i < n; i++) {
        const V = arr[i], lead = arr[(i + 1) % n];
        // 앞차와의 간격 (고리처럼 이어진 차로: 맨 앞차의 앞차는 맨 뒤차)
        let gap = Infinity, dv = 0;
        if (n > 1) { let d = lead.s - V.s; if (d <= 0) d += span; gap = d - (lead.kd.L + V.kd.L) / 2; dv = V.v - lead.v; }
        // 신호: 앞범퍼가 정지선 앞에 있을 때만 본다. 멈출 수 없는 거리에서 노란불이 되면 그대로 지난다
        const front = V.s + V.kd.L / 2, toLine = ls - front;
        if (carGo || toLine < -0.5) V.run = false;
        else if (!V.run && toLine >= -0.5) {
          if (toLine < V.v * V.v / (2 * 3.0) - 1 && V.v > 3) V.run = true; // 급제동해야 서는 거리면 그대로 통과
          else if (toLine < gap) { gap = Math.max(0.05, toLine); dv = V.v; }
        }
        const sStar = S0 + Math.max(0, V.v * V.th + V.v * dv / (2 * Math.sqrt(V.amax * B_COMF)));
        let a = V.amax * (1 - Math.pow(V.v / V.v0, 4) - (gap === Infinity ? 0 : (sStar / Math.max(0.3, gap)) ** 2));
        a = clamp(a, -6, V.amax);
        V.a += (a - V.a) * Math.min(1, dt * 6); // 가속도 변화를 조금 늦춰 덜컥거리지 않게
        V.v = Math.max(0, V.v + V.a * dt);
        if (V.v < 0.03 && V.a <= 0) V.v = 0;
        V.ds = V.v * dt;
      }
      // 겹침 방지: 앞차를 넘어가지 않는다
      for (let i = 0; i < n; i++) { const V = arr[i], lead = arr[(i + 1) % n]; if (n > 1) { let d = lead.s - V.s; if (d <= 0) d += span; const room = d - (lead.kd.L + V.kd.L) / 2 - 0.6; if (V.ds > room) { V.ds = Math.max(0, room); V.v = Math.min(V.v, lead.v); } } }
      for (const V of arr) { V.s += V.ds; if (V.s >= span) V.s -= span; }
    });
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
  const cnt = {};
  const put = (key, x, y, z, sx, sy, sz, yaw, col) => { const im = M[key], i = cnt[key] = (cnt[key] || 0) + 1; if (i > im.instanceMatrix.count) return; _q.setFromEuler(_e.set(0, yaw, 0)); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); im.setMatrixAt(i - 1, _m); if (col) im.setColorAt(i - 1, col); };
  const WHITE = new THREE.Color(0xf1f1f3);
  let lastT = null;
  // st: { T, occ:Set, busy:Set, carGo }
  function frame({ T, occ, busy, carGo }) {
    // 시간 진행: 화면이 느려도 물리는 0.05초 단위로 나눠 계산한다. 시간이 뒤로 가거나 크게 뛰면 한 박자만
    let dt = lastT == null ? 0 : T - lastT; lastT = T;
    if (!(dt > 0)) dt = 0; if (dt > 1.5) dt = 0.05;
    for (let left = Math.min(dt, 0.6); left > 1e-4; left -= 0.05) step(Math.min(0.05, left), carGo);
    for (const k in M) cnt[k] = 0;
    for (const V of vehs) {
      if (occ.has(V.li) || busy.has(V.li)) continue;
      const L = lanes[V.li], dir = L.dir, z = dir > 0 ? -ZC + V.s : ZC - V.s;
      if (ZC - Math.abs(z) < 0.4) continue; // 끝에서 드나든다
      const x = (L.x0 + L.x1) / 2, { w, h, L: len, k } = V.kd, yaw = dir > 0 ? 0 : Math.PI;
      // 제동·가속 때 차체가 앞뒤로 조금 숙는다 (피치는 생략하고 높이만)
      if (k === 'bus') { put('busB', x, 0, z, w, h, len, yaw, V.c); put('busG', x, 0, z, w, h, len, yaw); }
      else if (k === 'truck') {
        put('cabB', x, 0, z, w, h * 0.86, len, yaw, V.c); put('cabG', x, 0, z, w, h * 0.86, len, yaw);
        // 적재함(탑) + 차대
        put('cargo', x, 0.95 + (h - 0.95) / 2, z - dir * len * 0.16, w, h - 0.95, len * 0.66, 0, WHITE);
        put('cargo', x, 0.72, z - dir * len * 0.02, w * 0.7, 0.34, len * 0.94, 0, _c.setRGB(0.12, 0.12, 0.13));
      } else if (k === 'sedan') { put('sedanB', x, 0, z, w, h, len, yaw, V.c); put('sedanG', x, 0, z, w, h, len, yaw); }
      else { put('suvB', x, 0, z, w, h, len, yaw, V.c); put('suvG', x, 0, z, w, h, len, yaw); }
      // 바퀴: 네 귀 (대형차는 뒤 두 축)
      const big = len > 7, wd = big ? 0.98 : 0.66, ww = big ? 0.3 : 0.22, ax = big ? [len / 2 - 1.5, -len / 2 + 2.6, ...(k === 'truck' ? [-len / 2 + 1.5] : [])] : [len / 2 - 0.88, -len / 2 + 0.9];
      for (const a of ax) for (const sd of [-1, 1]) put('wheel', x + sd * (w / 2 - ww / 2 + 0.03), wd / 2, z + dir * a, ww, wd, wd, 0);
      // 전조등 · 제동등 (감속하거나 서 있으면 밝게)
      const brake = V.a < -0.5 || V.v < 0.4, ly = big ? 0.95 : h * 0.46, lw = big ? 0.34 : 0.3;
      for (const sd of [-1, 1]) {
        put('head', x + sd * (w / 2 - lw / 2 - 0.1), ly, z + dir * (len / 2 - 0.01), lw, 0.13, 0.06, 0);
        put(brake ? 'brake' : 'tail', x + sd * (w / 2 - lw / 2 - 0.08), ly + 0.06, z - dir * (len / 2 - 0.01), lw, big ? 0.22 : 0.12, 0.06, 0);
      }
    }
    for (const k in M) { const im = M[k]; im.count = Math.min(cnt[k], im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  return { frame, geos, meshes: all, vehs };
}
