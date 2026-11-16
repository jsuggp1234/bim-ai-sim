// 현장 물류 차량: 덤프트럭 · 레미콘 · 자재 트레일러가 대로에서 와서 게이트로 후진해 들어가 싣고·내리고 앞으로 나간다.
// 차량마다 순서(접근 → 후진 진입 → 상차/하역 → 진출 → 떠남)를 시간 T의 함수로 정해, 한 상차 자리에는 한 대씩만 선다.
// 좌표는 build3d와 같다 (x 단면 가로, z 대로 방향, 대지 0..pw, 대로는 x > pw). 차량 모형의 앞은 로컬 +z.
import * as THREE from 'three';
import { shape } from './kit3d.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 화물: 철근 다발 · 형강 · 거푸집(합판) · 커튼월 유닛 거치대 · PC 판 · 덕트·배관 · 일반 팔레트
const CARGO = {
  rebar: { n: '철근', c: 0x8a4b2a }, steel: { n: '철골 부재', c: 0x6f7f92 }, form: { n: '거푸집 자재', c: 0xb79a6a }, cw: { n: '커튼월 유닛', c: 0x7fa6c2 },
  pc: { n: 'PC 부재', c: 0xb5b2aa }, mep: { n: '덕트·배관', c: 0xc9ced4 }, pallet: { n: '마감 자재', c: 0xd9cfbf }, module: { n: '모듈 유닛', c: 0xd9d4c8 },
};
export const CARGO_KINDS = Object.keys(CARGO);

export function buildFleet(X) {
  const { root, sc, D, city } = X;
  const own = { geos: [], mats: [], tex: [] };
  const G = (g) => { own.geos.push(g); return g; };
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.25, ...o }); own.mats.push(m); return m; };
  const BOX = G(new THREE.BoxGeometry(1, 1, 1)), WH = G(new THREE.CylinderGeometry(0.5, 0.5, 1, 16).rotateZ(Math.PI / 2)), HUB = G(new THREE.CylinderGeometry(0.5, 0.5, 1, 8).rotateZ(Math.PI / 2));
  const DARK = M(0x24262a, { roughness: 0.8, metalness: 0.1 }), TIRE = M(0x1b1b1d, { roughness: 0.9, metalness: 0 }), RIM = M(0xb9bec4, { metalness: 0.7, roughness: 0.3 }), GLASS = M(0x1d2a35, { metalness: 0.6, roughness: 0.08 });
  const CHROME = M(0xd9dde2, { metalness: 0.85, roughness: 0.2 }), LAMP = M(0xfff6d8, { emissive: 0xfff6d8, emissiveIntensity: 0.6 }), TAIL = M(0xff3b30, { emissive: 0xff3b30, emissiveIntensity: 0.5 });
  const SOIL = M(0x8a7255, { roughness: 1, metalness: 0 }), CONC = M(0x9d9b95, { roughness: 0.9, metalness: 0 });
  const b = (g, m, x0, x1, y0, y1, z0, z1) => { const o = new THREE.Mesh(BOX, m); o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); o.scale.set(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.add(o); return o; };
  const rb = (g, m, x0, x1, y0, y1, z0, z1, r = 0.2) => { const o = new THREE.Mesh(G(shape().rbox(x0, x1, y0, y1, z0, z1, r, 2).done()), m); g.add(o); return o; };
  const wheel = (g, x, z, r = 0.52, w = 0.4, twin = false) => { [x].forEach(xx => { const t = new THREE.Mesh(WH, TIRE); t.position.set(xx, r, z); t.scale.set(twin ? w * 1.7 : w, 2 * r, 2 * r); g.add(t); const h = new THREE.Mesh(HUB, RIM); h.position.set(xx + Math.sign(xx) * (twin ? w * 0.86 : w * 0.52), r, z); h.scale.set(0.04, r * 1.15, r * 1.15); g.add(h); }); };
  // 운전실 (앞이 +z): 앞유리 · 옆창 · 범퍼 · 전조등 · 경광등 · 사이드미러
  function cab(g, z1, col, W = 2.45, H = 3.1, L = 2.1) {
    const cm = M(col, { metalness: 0.35, roughness: 0.4 });
    rb(g, cm, -W / 2, W / 2, 1.05, H, z1 - L, z1, 0.28);
    b(g, GLASS, -W / 2 + 0.12, W / 2 - 0.12, H - 1.05, H - 0.18, z1 - 0.02, z1 + 0.02);
    [-1, 1].forEach(s => { b(g, GLASS, s * W / 2 - 0.02, s * W / 2 + 0.02, H - 1.0, H - 0.2, z1 - L + 0.35, z1 - 0.25); b(g, DARK, s * (W / 2 + 0.05), s * (W / 2 + 0.28), H - 1.1, H - 0.55, z1 - 0.15, z1 - 0.1); b(g, LAMP, s * W / 2 - 0.45 * s - 0.2, s * W / 2 - 0.45 * s + 0.2, 1.25, 1.45, z1, z1 + 0.04); });
    b(g, DARK, -W / 2, W / 2, 0.75, 1.15, z1 - 0.1, z1 + 0.18); b(g, CHROME, -W / 2 + 0.3, W / 2 - 0.3, 1.5, 2.0, z1, z1 + 0.03); rb(g, cm, -W / 2 + 0.05, W / 2 - 0.05, H - 0.1, H + 0.3, z1 - L, z1 - L + 1.0, 0.12);
    const bc = b(g, M(0xffa31a, { emissive: 0xffa31a, emissiveIntensity: 0.2, roughness: 0.3 }), -0.18, 0.18, H + 0.25, H + 0.45, z1 - L + 0.3, z1 - L + 0.6); return bc;
  }
  function chassis(g, z0, z1) { b(g, DARK, -0.55, 0.55, 0.6, 1.05, z0, z1); [-1, 1].forEach(s => b(g, M(0x2f3236), s * 0.55, s * 1.2, 0.75, 1.05, z0 + 1.2, z0 + 2.2)); }
  // 덤프트럭 25t (3축): 적재함 + 흙더미 (load 0..1)
  function dump(col) {
    const g = new THREE.Group(); g.visible = false; root.add(g);
    const L = 9.6; chassis(g, -L / 2, L / 2 - 1.8);
    const bc = cab(g, L / 2, col);
    const bm = M(col, { metalness: 0.4, roughness: 0.45 });
    b(g, bm, -1.25, 1.25, 1.3, 1.45, -L / 2 + 0.2, L / 2 - 2.4); // 바닥
    [-1, 1].forEach(s => b(g, bm, s * 1.18, s * 1.28, 1.3, 2.75, -L / 2 + 0.2, L / 2 - 2.4));
    b(g, bm, -1.28, 1.28, 1.3, 3.05, L / 2 - 2.5, L / 2 - 2.3); b(g, bm, -1.28, 1.28, 1.3, 2.75, -L / 2 + 0.1, -L / 2 + 0.25); // 앞판 · 뒷문
    b(g, bm, -1.28, 1.28, 3.0, 3.1, L / 2 - 2.4, L / 2 - 1.6); // 운전실 보호판
    for (let k = 0; k < 5; k++) b(g, DARK, -1.3, -1.27, 1.45, 2.7, -L / 2 + 1 + k * 1.3, -L / 2 + 1.12 + k * 1.3);
    const heap = new THREE.Mesh(G(new THREE.SphereGeometry(0.5, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2)), SOIL); heap.position.set(0, 1.45, -L / 2 + 3.3); heap.scale.set(2.3, 1, 6.2); g.add(heap);
    wheel(g, -1.05, L / 2 - 1.2); wheel(g, 1.05, L / 2 - 1.2); [-L / 2 + 1.0, -L / 2 + 2.5].forEach(z => { wheel(g, -1.0, z, 0.52, 0.4, true); wheel(g, 1.0, z, 0.52, 0.4, true); });
    [-1, 1].forEach(s => b(g, TAIL, s * 1.0 - 0.15, s * 1.0 + 0.15, 0.95, 1.15, -L / 2 - 0.02, -L / 2));
    // 흙받이 · 연료통 · 옆 보호대 · 배기관 · 적재함 위 덮개 롤
    [-1, 1].forEach(s => { b(g, DARK, s * 0.75, s * 1.32, 1.12, 1.18, -L / 2 + 0.3, -L / 2 + 3.2); b(g, DARK, s * 1.28, s * 1.32, 0.5, 1.12, -L / 2 + 0.3, -L / 2 + 0.36); const t = new THREE.Mesh(WH, CHROME); t.position.set(s * 1.0, 0.85, L / 2 - 2.9); t.scale.set(0.9, 0.55, 0.55); t.rotation.y = Math.PI / 2; g.add(t); b(g, DARK, s * 1.1, s * 1.25, 0.55, 0.62, L / 2 - 4.6, L / 2 - 3.4); });
    b(g, DARK, -1.05, -0.95, 2.6, 3.9, L / 2 - 2.25, L / 2 - 2.15); b(g, M(0x3a3d42), -1.2, 1.2, 2.82, 2.98, L / 2 - 2.55, L / 2 - 2.4);
    g.userData = { L, beacon: bc, set(load) { heap.visible = load > 0.02; heap.scale.y = 0.2 + 2.3 * load; heap.position.y = 1.45; } };
    return g;
  }
  // 레미콘 (6㎥): 달걀꼴 드럼(나선 띠, 돈다) + 뒤 슈트
  function stripe() { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#e9e7e2'; x.fillRect(0, 0, 64, 256); x.fillStyle = '#e5484d'; for (let k = -2; k < 10; k++) { x.beginPath(); x.moveTo(0, k * 32); x.lineTo(64, k * 32 + 40); x.lineTo(64, k * 32 + 52); x.lineTo(0, k * 32 + 12); x.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; own.tex.push(t); return t; }
  const DRUM = G(new THREE.LatheGeometry([[0.05, -2.4], [0.7, -2.2], [1.15, -1.3], [1.2, 0], [1.05, 1.2], [0.55, 2.2], [0.35, 2.45], [0.05, 2.5]].map(([r, y]) => new THREE.Vector2(r, y)), 24));
  const DRUM_M = M(0xffffff, { map: stripe(), metalness: 0.3, roughness: 0.4 });
  function mixer() {
    const g = new THREE.Group(); g.visible = false; root.add(g);
    const L = 8.8; chassis(g, -L / 2, L / 2 - 1.8); const bc = cab(g, L / 2, 0xe9eaed);
    const dg = new THREE.Group(); dg.position.set(0, 2.6, -0.7); dg.rotation.x = -(Math.PI / 2 - 0.2); g.add(dg);
    const drum = new THREE.Mesh(DRUM, DRUM_M); dg.add(drum);
    b(g, M(0x8a8f99), -1.1, 1.1, 1.05, 1.6, -L / 2 + 0.6, L / 2 - 2.3); // 받침
    b(g, M(0xd9822b), -0.35, 0.35, 2.6, 3.4, -L / 2 + 0.1, -L / 2 + 0.7); // 호퍼
    const chute = new THREE.Group(); chute.position.set(0, 1.9, -L / 2 - 0.1); g.add(chute); b(chute, M(0x8a8f99), -0.25, 0.25, -0.1, 0.05, -1.8, 0); const flow = b(chute, CONC, -0.15, 0.15, -1.6, -0.05, -1.75, -1.55);
    b(g, M(0x2f7fd0), -0.6, 0.6, 1.2, 2.2, L / 2 - 2.6, L / 2 - 2.0); // 물탱크
    wheel(g, -1.05, L / 2 - 1.2); wheel(g, 1.05, L / 2 - 1.2); [-L / 2 + 1.1, -L / 2 + 2.5].forEach(z => { wheel(g, -1.0, z, 0.52, 0.4, true); wheel(g, 1.0, z, 0.52, 0.4, true); });
    g.userData = { L, beacon: bc, drum, chute, flow };
    return g;
  }
  // 트랙터 + 평판 트레일러 (13.5m) + 화물
  function trailer() {
    const g = new THREE.Group(); g.visible = false; root.add(g);
    const L = 17.5; chassis(g, L / 2 - 6, L / 2 - 1.8); const bc = cab(g, L / 2, 0x2f5f9f, 2.5, 3.4, 2.4);
    wheel(g, -1.05, L / 2 - 1.3); wheel(g, 1.05, L / 2 - 1.3); [L / 2 - 4.2, L / 2 - 5.5].forEach(z => { wheel(g, -1.0, z, 0.52, 0.4, true); wheel(g, 1.0, z, 0.52, 0.4, true); });
    const deckM = M(0x6b5a48, { roughness: 0.85, metalness: 0.1 });
    b(g, M(0x3a3d42), -1.25, 1.25, 1.15, 1.45, -L / 2, L / 2 - 4.4); b(g, deckM, -1.25, 1.25, 1.45, 1.55, -L / 2, L / 2 - 4.6);
    [-L / 2 + 1.2, -L / 2 + 2.5, -L / 2 + 3.8].forEach(z => { wheel(g, -1.0, z, 0.48, 0.4, true); wheel(g, 1.0, z, 0.48, 0.4, true); });
    [-1, 1].forEach(s => b(g, TAIL, s * 1.0 - 0.15, s * 1.0 + 0.15, 1.15, 1.35, -L / 2 - 0.02, -L / 2));
    const cg = new THREE.Group(); g.add(cg);
    g.userData = { L, beacon: bc, cg, kind: null, items: [] };
    return g;
  }
  // 화물 싣기: 실은 묶음(items)을 앞에서부터 하나씩 비운다
  function loadCargo(t, kind) {
    const U = t.userData; if (U.kind === kind) return; U.kind = kind;
    U.cg.clear(); U.items = [];
    const c = (CARGO[kind] || CARGO.pallet).c, m = M(c, { metalness: kind === 'steel' || kind === 'rebar' ? 0.5 : 0.1, roughness: 0.6 }), z0 = -U.L / 2 + 0.6, z1 = U.L / 2 - 5;
    const grp = () => { const q = new THREE.Group(); U.cg.add(q); U.items.push(q); return q; };
    if (kind === 'rebar' || kind === 'mep') {
      for (let k = 0; k < 4; k++) { const q = grp(); for (let j = 0; j < 3; j++) b(q, m, -1.0 + j * 0.7, -0.5 + j * 0.7, 1.55 + k * 0.32, 1.83 + k * 0.32, z0, z1); }
    } else if (kind === 'steel') {
      for (let k = 0; k < 3; k++) { const q = grp(); for (let j = 0; j < 3; j++) { const x = -0.85 + j * 0.85; b(q, m, x - 0.25, x + 0.25, 1.55 + k * 0.55, 1.6 + k * 0.55, z0, z1); b(q, m, x - 0.03, x + 0.03, 1.6 + k * 0.55, 2.0 + k * 0.55, z0, z1); b(q, m, x - 0.25, x + 0.25, 2.0 + k * 0.55, 2.05 + k * 0.55, z0, z1); } }
    } else if (kind === 'cw' || kind === 'pc') {
      for (let k = 0; k < 4; k++) { const q = grp(), zc = z0 + 1.6 + k * ((z1 - z0 - 3.2) / 3); if (kind === 'cw') { b(q, M(0x8a8f99, { metalness: 0.6 }), -0.9, 0.9, 1.55, 1.7, zc - 1.2, zc + 1.2); [-0.35, 0.35].forEach(x => b(q, m, x - 0.04, x + 0.04, 1.7, 4.1, zc - 1.5, zc + 1.5)); } else b(q, m, -1.2, 1.2, 1.55, 1.95, zc - 1.6, zc + 1.6); }
    } else {
      for (let k = 0; k < 5; k++) { const q = grp(), zc = z0 + 1.1 + k * ((z1 - z0 - 2.2) / 4); b(q, M(0xa58a64), -1.0, 1.0, 1.55, 1.7, zc - 0.7, zc + 0.7); b(q, m, -0.95, 0.95, 1.7, kind === 'form' ? 2.5 : 2.6, zc - 0.65, zc + 0.65); }
    }
  }

  // ---------- 경로 ----------
  const lanes = sc.city.lanes, laneX = (i) => city.laneX(Math.min(i, lanes.length - 1)), ZC = city.ZC, gate = city.gate;
  const curve = (pts) => { const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal', 0.5); c.arcLengthDivisions = 120; return c; };
  // 상차 자리(bay: x,z, 앞 방향 hx,hz)에서 게이트를 지나 차로(li)로 나가는 곡선 (후진 진입은 이 곡선을 거꾸로)
  function outCurve(bay, li) {
    const d = lanes[li].dir, lx = laneX(li), gz = (gate.z0 + gate.z1) / 2, pts = [[bay.x, bay.z], [bay.x + bay.hx * 3, bay.z + bay.hz * 3]];
    const push = (x, z) => { const q = pts[pts.length - 1]; if (x > q[0] + 1) pts.push([x, z]); };
    push(sc.G.pw - 1.2, gz); push(gate.x + 1.0, gz);
    pts.push([sc.city.curb + 0.6, gz + d * 2.5], [lx, gz + d * 9], [lx, gz + d * 16]);
    return { c: curve(pts), d, lx, E: gz + d * 16 };
  }
  // 차량 한 대의 위치·방향: v = 이 차의 주기 안 시각
  const P3 = new THREE.Vector3(), T3 = new THREE.Vector3();
  function onCurve(g, c, u) { c.getPointAt(clamp(u, 0, 1), P3); c.getTangentAt(clamp(u, 0.001, 0.999), T3); g.position.set(P3.x, 0.12, P3.z); g.rotation.set(0, Math.atan2(T3.x, T3.z), 0); }
  function onLane(g, x, z, d) { g.position.set(x, 0.12, z); g.rotation.set(0, d > 0 ? 0 : Math.PI, 0); }

  const pool = { dump: [0xd9822b, 0xe9eaed, 0x2f7fd0].map(dump), mix: [0, 1, 2].map(mixer), trl: [0, 1].map(trailer) };
  const all = [...pool.dump, ...pool.mix, ...pool.trl];
  let cache = { key: '', R: null };
  const blink = (g, on, T) => { const m = g.userData.beacon.material; m.emissiveIntensity = on ? (Math.sin(T * 9) > 0 ? 2.2 : 0.25) : 0.15; };

  // 후진 진입형 순환 (덤프·트레일러): R = { out: outCurve, Lc 곡선 길이 }, W 정차 시간, n 대수
  function cycleRev(list, R, W, n, T, onWait, tag) {
    const d = R.out.d, lx = R.out.lx, ta = (ZC + Math.abs(R.out.E)) / 9, tr = R.Lc / 2.2 + 3, td = R.Lc / 3.2 + 2, te = (ZC - d * R.out.E) / 9 + 1;
    const slot = Math.max(tr + W + td + 4, (ta + tr + W + td + te + 4) / n), P = slot * n, tags = [];
    let busyLane = false;
    list.forEach((g, i) => {
      if (i >= n) { g.visible = false; return; }
      const v = ((T - i * slot) % P + P) % P; let st = 'gone';
      g.visible = true;
      const zS = -d * ZC;
      if (v < ta) { const f = v / ta, s = 1 - (1 - f) * (1 - f); onLane(g, lx, zS + (R.out.E - zS) * s, d); st = 'in'; }
      else if (v < ta + tr) { onCurve(g, R.out.c, 1 - ss(0, 1, (v - ta) / tr)); st = 'rev'; }
      else if (v < ta + tr + W) { onCurve(g, R.out.c, 0); st = 'wait'; onWait(g, (v - ta - tr) / W); }
      else if (v < ta + tr + W + td) { onCurve(g, R.out.c, ss(0, 1, (v - ta - tr - W) / td)); st = 'out'; }
      else if (v < ta + tr + W + td + te) { const f = (v - ta - tr - W - td) / te; onLane(g, lx, R.out.E + (d * ZC - R.out.E) * f * f, d); st = 'leave'; }
      else g.visible = false;
      if (g.visible) { blink(g, st === 'rev' || st === 'wait' || st === 'out', T); busyLane = true; if (st !== 'in' && st !== 'leave') tags.push({ t: tag(g, st), p: [g.position.x, 4.6, g.position.z], cls: 'eq' }); }
      g.userData.state = st;
    });
    return { tags, busy: busyLane };
  }

  // 도로 점용 정차형 (게이트로 들어갈 자리가 없을 때): 바깥 차로(0)를 따라 와서 bay z에 서고, 일을 마치면 그대로 떠난다
  function roadStop(g, z, W, T, onWait, tag, tags) {
    const d = lanes[0].dir, lx = laneX(0), zS = -d * ZC, ta = Math.abs(z - zS) / 8, te = Math.abs(d * ZC - z) / 8, P = ta + W + te + 24;
    const v = ((T % P) + P) % P; let st = 'gone'; g.visible = true;
    if (v < ta) { const f = v / ta; onLane(g, lx, zS + (z - zS) * (1 - (1 - f) * (1 - f)), d); st = 'in'; }
    else if (v < ta + W) { onLane(g, lx, z, d); st = 'wait'; onWait(g, (v - ta) / W); blink(g, true, T); tags.push({ t: tag(st), p: [lx, 4.8, z], cls: 'eq' }); }
    else if (v < ta + W + te) { const f = (v - ta - W) / te; onLane(g, lx, z + (d * ZC - z) * f * f, d); st = 'leave'; }
    else g.visible = false;
    g.userData.state = st;
  }

  // st: { T, haul: { bay } | null, mix: { pump: {x,z,nose} } | null, dlv: { bay, kind } | null }
  function frame(st) {
    const { T } = st, busy = new Set(), tags = [];
    all.forEach(g => { g.visible = false; });
    // 덤프: 상차 자리에서 흙을 받아 반출
    if (st.haul && st.haul.bay && st.haul.bay.road) {
      roadStop(pool.dump[0], st.haul.bay.z, st.haul.W || 40, T + 5, (g, f) => g.userData.set(f), (s2) => s2 === 'wait' ? '덤프트럭 25t · 도로변 상차' : '덤프트럭 · 토사 반출', tags);
      pool.dump.forEach(g => { if (g.userData.state === 'in') g.userData.set(0); else if (g.userData.state === 'leave') g.userData.set(1); });
      busy.add(0);
    } else if (st.haul && st.haul.bay) {
      const bay = st.haul.bay, key = `h|${bay.x.toFixed(1)}|${bay.z.toFixed(1)}|${bay.hx}|${bay.hz}`;
      if (cache.key !== key) { const out = outCurve(bay, 0); cache = { key, R: { out, Lc: out.c.getLength() } }; }
      const r = cycleRev(pool.dump, cache.R, st.haul.W || 34, 3, T, (g, f) => g.userData.set(f), (g, s2) => s2 === 'wait' ? '덤프트럭 25t · 상차 중' : s2 === 'rev' ? '덤프트럭 · 후진 진입' : '덤프트럭 · 토사 반출');
      pool.dump.forEach(g => { if (g.userData.state === 'in' || g.userData.state === 'rev') g.userData.set(0); else if (g.userData.state === 'out' || g.userData.state === 'leave') g.userData.set(1); });
      if (r.busy) busy.add(0); tags.push(...r.tags);
    }
    // 자재 트레일러: 하역 자리에서 크레인이 들어 올린다
    if (st.dlv && st.dlv.bay) {
      const bay = st.dlv.bay, key2 = `d|${(bay.x || 0).toFixed(1)}|${(bay.z || 0).toFixed(1)}|${bay.hx}|${bay.hz}|${bay.road ? 1 : 0}`;
      pool.trl.forEach(t => loadCargo(t, st.dlv.kind));
      const nm = (CARGO[st.dlv.kind] || CARGO.pallet).n;
      if (bay.road) {
        // 도로 점용 하역: 차로를 따라 와서 서고, 비운 뒤 그대로 떠난다
        roadStop(pool.trl[0], bay.z, st.dlv.W || 60, T + 17, (g, f) => { g.userData.items.forEach((q, k) => { q.visible = k >= Math.floor(f * g.userData.items.length * 1.05); }); }, (s2) => s2 === 'wait' ? `트레일러 · ${nm} 하역` : `트레일러 · ${nm}`, tags);
        const s0 = pool.trl[0].userData.state; if (s0 === 'in') pool.trl[0].userData.items.forEach(q => { q.visible = true; }); else if (s0 === 'leave') pool.trl[0].userData.items.forEach(q => { q.visible = false; });
        busy.add(0);
      } else {
        if (cache.key2 !== key2) { const out = outCurve(bay, 0); cache.key2 = key2; cache.R2 = { out, Lc: out.c.getLength() }; }
        const r = cycleRev(pool.trl, cache.R2, st.dlv.W || 60, 2, T + 40, (g, f) => { g.userData.items.forEach((q, k) => { q.visible = k >= Math.floor(f * g.userData.items.length * 1.05); }); }, (g, s2) => s2 === 'wait' ? `트레일러 · ${nm} 하역` : `트레일러 · ${nm}`);
        pool.trl.forEach(g => { const s2 = g.userData.state; if (s2 === 'in' || s2 === 'rev') g.userData.items.forEach(q => { q.visible = true; }); else if (s2 === 'out' || s2 === 'leave') g.userData.items.forEach(q => { q.visible = false; }); });
        if (r.busy) busy.add(0); tags.push(...r.tags);
      }
    }
    // 레미콘: 옆 차로로 와서 펌프카를 지나친 뒤, 후진해 호퍼에 붙어 붓고 떠난다
    if (st.mix && st.mix.pump) {
      const pm = st.mix.pump, ml = lanes.length > 1 ? 1 : 0, pl = 0, d1 = lanes[ml].dir, mx = laneX(ml), px = laneX(pl);
      const hz = pm.z - pm.nose * 5.6, L = pool.mix[0].userData.L, zB = hz - pm.nose * (L / 2 + 0.7), zA = zB + d1 * 12;
      const key3 = `m|${px}|${mx}|${zB.toFixed(1)}`;
      if (cache.key3 !== key3) { cache.key3 = key3; cache.mc = curve([[px, zB], [px, zB + d1 * 3], [(px + mx) / 2, zB + d1 * 7], [mx, zA - d1 * 2], [mx, zA]]); cache.mL = cache.mc.getLength(); }
      const c = cache.mc, W = st.mix.W || 42, ta = (ZC + Math.abs(zA)) / 8, tr = cache.mL / 2 + 2, td = (ZC + Math.abs(zB)) / 8, slot = W + tr + 6, n = 3, P = Math.max(slot * n, ta + tr + W + td + 6);
      pool.mix.forEach((g, i) => {
        const v = ((T - i * (P / n)) % P + P) % P, U = g.userData; g.visible = true; U.drum.rotation.y = T * (v > ta + tr && v < ta + tr + W ? -2.4 : 1.2); U.chute.visible = false; U.flow.visible = false;
        if (v < ta) { const f = v / ta; onLane(g, mx, -d1 * ZC + (zA + d1 * ZC) * (1 - (1 - f) * (1 - f)), d1); }
        else if (v < ta + tr) { onCurve(g, c, 1 - ss(0, 1, (v - ta) / tr)); blink(g, true, T); }
        else if (v < ta + tr + W) { onCurve(g, c, 0); U.chute.visible = true; U.flow.visible = true; U.flow.scale.y = 1.5 + 0.1 * Math.sin(T * 6); blink(g, true, T); tags.push({ t: '레미콘 6㎥ · 펌프 호퍼에 투입', p: [g.position.x, 4.4, g.position.z], cls: 'eq' }); }
        else if (v < ta + tr + W + td) { const f = (v - ta - tr - W) / td, z = zB + (d1 * ZC - zB) * f * f, k = ss(0, 1, Math.abs(z - zB) / 14); onLane(g, px + (mx - px) * k, z, d1); g.rotation.y += (mx - px) * d1 * 0.06 * Math.sin(Math.PI * k); }
        else g.visible = false;
      });
      busy.add(ml);
      // 다음 차 대기 표시 (옆 차로 저 뒤에)
      tags.push({ t: `레미콘 순환 ${n}대 · 대당 약 6㎥`, p: [mx, 5, zA + d1 * 8], cls: 'eq dim' });
    }
    return { busy, tags };
  }
  return {
    frame,
    dispose() { all.forEach(g => root.remove(g)); own.geos.forEach(g => g.dispose()); own.mats.forEach(m => m.dispose()); own.tex.forEach(t => t.dispose()); },
  };
}
