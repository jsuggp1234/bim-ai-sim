// 3D 주변 가로 (build3d.js에서 부른다): street.js의 가로 모델(sc.city)을 입체로 세운다.
// 대로(보도·연석·차로 표시·중앙선·횡단보도·신호등·가로등·가로수·버스 정류장) · 통행 차량 · 도로 밑 매설물(단면) ·
// 인접 건물(층·창·상가·옥상 설비·지하층) · 이면도로 · 건너편·뒤쪽 블록 건물 · 현장 출입구(게이트·세륜·사무실) · 작업자·보행자.
// 좌표: x는 단면 가로(대지 0 ~ pw), y는 높이, z는 도로 방향(대지 -pd/2 ~ pd/2, 단면은 z=0).
import * as THREE from 'three';
import { buildPeople, crewAt, PED_LOOK } from './crew3d.js';
import { waterSurface } from '../sim/scene/water.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const UT_C = { comm: 0x9b7be0, power: 0xe5484d, gas: 0xf2c94c, water: 0x3d8fd6, storm: 0x5aa6ec, sewer: 0x8b6f3a, heat: 0xe08a3a };
const CAR_C = [0xe7e7ea, 0x2b2d33, 0x9aa3ad, 0x3f5f8f, 0xa33a3a, 0xd9d4c8, 0x5a6b5a];
const VEH = [{ k: 'car', w: 1.8, h: 1.45, L: 4.6, p: 0.44 }, { k: 'suv', w: 1.9, h: 1.75, L: 4.8, p: 0.2 }, { k: 'bus', w: 2.5, h: 3.2, L: 11, p: 0.1 }, { k: 'truck', w: 2.5, h: 3.0, L: 8, p: 0.12 }, { k: 'van', w: 1.9, h: 2.1, L: 5.2, p: 0.14 }];

// 입면 무늬 (4×4칸 한 장, 칸 = 3.2m × 3.4m). map(색)과 rm(초록 = 거칠기, 파랑 = 금속성)을 같은 배치로 그려
// 유리는 매끈하게(하늘이 비친다), 벽은 거칠게. 칸마다 커튼·블라인드·실내 밝기를 조금씩 다르게
function facadeTex(kind, seed) {
  const R = rng(seed), N = 512, S = 128;
  const ca = document.createElement('canvas'), cb = document.createElement('canvas'); ca.width = ca.height = cb.width = cb.height = N;
  const x = ca.getContext('2d'), y = cb.getContext('2d');
  const both = (fs, rough, metal, X, Y, W, H) => { x.fillStyle = fs; x.fillRect(X, Y, W, H); y.fillStyle = `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`; y.fillRect(X, Y, W, H); };
  const glass = (X, Y, W, H, base) => {
    // 유리: 위는 하늘빛, 아래는 실내(커튼·블라인드). 반사는 환경광이 맡는다
    const g = x.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, base[0]); g.addColorStop(1, base[1]);
    x.fillStyle = g; x.fillRect(X, Y, W, H);
    const r = R();
    if (r < 0.3) { x.fillStyle = 'rgba(232,226,210,.55)'; x.fillRect(X, Y, W, H * (0.25 + R() * 0.5)); } // 블라인드
    else if (r < 0.45) { x.fillStyle = 'rgba(214,206,190,.5)'; x.fillRect(X + (R() < 0.5 ? 0 : W * 0.55), Y, W * 0.45, H); } // 커튼
    y.fillStyle = 'rgb(0,28,150)'; y.fillRect(X, Y, W, H);
  };
  const wallC = { office: '#6d7a86', officetel: '#d8d2c6', apt: '#e6e1d6', house: '#a65c43', factory: '#c3c9d1', school: '#d9c8a6' }[kind] || '#cfcfd4';
  both(wallC, kind === 'office' ? 0.4 : 0.9, kind === 'office' || kind === 'factory' ? 0.5 : 0, 0, 0, N, N);
  if (kind === 'house') { // 벽돌 줄눈
    x.fillStyle = 'rgba(255,255,255,.12)'; for (let yy = 0; yy < N; yy += 6) x.fillRect(0, yy, N, 1);
    x.fillStyle = 'rgba(0,0,0,.08)'; for (let yy = 0; yy < N; yy += 12) for (let xx = (yy / 12) % 2 ? 0 : 9; xx < N; xx += 18) x.fillRect(xx, yy, 1, 6);
  }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const X = i * S, Y = j * S;
    if (kind === 'office') {
      // 커튼월: 유리 + 층 경계 스팬드럴 + 멀리언
      glass(X + 4, Y + 4, S - 8, S - 34, ['#5d7891', '#2c3b4a']);
      both('#3a4652', 0.35, 0.6, X, Y + S - 30, S, 30);
      both('#b8c2cc', 0.3, 0.8, X, Y, 4, S); both('#b8c2cc', 0.3, 0.8, X + S / 2 - 2, Y, 4, S - 30); both('#b8c2cc', 0.3, 0.8, X, Y + S - 32, S, 3);
    } else if (kind === 'factory') {
      for (let k = 0; k < S; k += 10) { both('#aeb6c1', 0.5, 0.6, X + k, Y, 4, S); }
      if (j === 0) glass(X + 6, Y + 14, S - 12, 22, ['#7d97ae', '#4b5f72']);
    } else {
      const ww = kind === 'house' ? 52 : kind === 'school' ? 96 : 76, wh = kind === 'house' ? 50 : kind === 'school' ? 58 : 62, ox = X + (S - ww) / 2, oy = Y + 26;
      both('#f0eee8', 0.6, 0.1, ox - 5, oy - 5, ww + 10, wh + 10); // 창틀
      glass(ox, oy, ww, wh, ['#6b8297', '#33414e']);
      both('#e9e7e2', 0.5, 0.2, ox + ww / 2 - 1.5, oy, 3, wh); // 가운데 창살
      if (kind === 'officetel' || kind === 'apt') { both('rgba(0,0,0,.14)', 0.9, 0, X, Y + S - 8, S, 8); both('#cfcbc2', 0.85, 0, X, Y + S - 14, S, 6); } // 층 띠
      if (kind === 'apt' && R() < 0.5) { both('#b9c1c9', 0.4, 0.6, ox - 6, oy + wh - 18, ww + 12, 3); both('#b9c1c9', 0.4, 0.6, ox - 6, oy + wh - 2, ww + 12, 3); } // 난간
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(ox - 5, oy + wh + 5, ww + 10, 3); // 창 밑 그늘
    }
  }
  // 빗물 얼룩 · 오염 (아래로 갈수록)
  const g2 = x.createLinearGradient(0, 0, 0, N); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(40,36,30,.08)'); x.fillStyle = g2; x.fillRect(0, 0, N, N);
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  return { map: mk(ca, true), rm: mk(cb, false) };
}
// 승용차 옆모습 (z 길이 −0.5~0.5, y 높이 0~1)을 폭 방향(x −0.5~0.5)으로 밀어낸 형상
function profileGeo(pts) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.03, bevelSegments: 2, steps: 1 });
  g.translate(0, 0, -0.5); g.rotateY(-Math.PI / 2); g.computeVertexNormals(); return g;
}
const CAR_BODY = [[-0.5, 0.2], [-0.5, 0.5], [-0.44, 0.56], [-0.27, 0.58], [-0.16, 0.9], [0.12, 0.92], [0.27, 0.6], [0.46, 0.55], [0.5, 0.46], [0.5, 0.2]];
const CAR_GLASS = [[-0.255, 0.6], [-0.155, 0.865], [0.115, 0.885], [0.255, 0.62]];
// 나무 수관: 울퉁불퉁한 덩어리 셋
function crownGeo() {
  const parts = [[0, 0.5, 0, 0.5], [0.22, 0.42, 0.12, 0.34], [-0.2, 0.4, -0.14, 0.36], [0.05, 0.72, -0.05, 0.32]].map(([cx, cy, cz, r], k) => {
    const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const n = Math.sin(p.getX(i) * 17.1 + k) * Math.cos(p.getY(i) * 13.7) * Math.sin(p.getZ(i) * 11.3 + k * 2); const s = 1 + n * 0.16; p.setXYZ(i, p.getX(i) * s + cx, p.getY(i) * s + cy, p.getZ(i) * s + cz); }
    return g.index ? g.toNonIndexed() : g;
  });
  const pos = [], nrm = []; parts.forEach(g => { g.computeVertexNormals(); pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); g.dispose(); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.computeBoundingBox(); const bb = g.boundingBox, c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z); g.scale(1 / sz.x, 1 / sz.y, 1 / sz.z); g.computeBoundingSphere(); return g;
}
// 상자 형상: 벽면 UV를 m 단위(칸 4개 = 텍스처 한 장)로
function bldGeo(w, h, d, cw = 3.2, ch = 3.4) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), nz = Math.abs(n.getZ(i)), y = p.getY(i) + h / 2;
    if (nx > 0.5) uv.setXY(i, (p.getZ(i) + d / 2) / (cw * 4), y / (ch * 4));
    else if (nz > 0.5) uv.setXY(i, (p.getX(i) + w / 2) / (cw * 4), y / (ch * 4));
    else uv.setXY(i, 0, 0);
  }
  uv.needsUpdate = true; return g;
}

export function buildCity(X) {
  const { root, mat, inst, ibox, box, BOX, CYL, CONE, sc, D } = X;
  const C = sc.city, G = sc.G, pw = G.pw, pd = D.pd, Z = D.Z, nb = sc.nb;
  const ZC = Z + 34;
  const geos = [], texs = [], mats2 = [];
  const R = rng(7 + Math.round(pw * 13) + Math.round((sc.cond.adj || 0) * 7));
  const labels = [];
  const lanes = C.lanes, laneX = (i) => (lanes[i] ? (lanes[i].x0 + lanes[i].x1) / 2 : null);

  // ---------- 바닥: 단면 땅 바깥 (앞·뒤·좌·우 띠) ----------
  const farX1 = C.far.length ? C.far[0].x0 + 70 : C.sw2[1] + 60;
  const leftX0 = Math.min(nb.x0, C.nb2 ? C.nb2.x0 : nb.x0) - 40;
  const xL = Math.min(leftX0, D.xl), xR = Math.max(farX1, D.xr);
  // 넓은 주변 맥락(지도)이 있으면 그 지면이 대신한다 (zone 밖은 지도, 안은 이 가로 모형)
  const gM = mat(0x8f877a, { rough: 1, tex: 'gravel' });
  const ground = [box(gM, null, xL, xR, -0.5, -0.01, Z, ZC + 20), box(gM, null, xL, xR, -0.5, -0.01, -ZC - 20, -Z), box(gM, null, xL, D.xl, -0.5, -0.01, -Z, Z), box(gM, null, D.xr, xR, -0.5, -0.01, -Z, Z)];
  const zone = { x0: xL, x1: xR, z0: -ZC - 20, z1: ZC + 20 };

  // ---------- 대로 ----------
  const asp = mat(0x4a4c50, { rough: 0.92, tex: 'asph' }), swM = mat(0xc9c3b8, { rough: 0.85, tex: 'paver' }), curbM = mat(0xd2d0cb, { tex: 'conc' }), white = mat(0xeeeeee, { em: 0.25 }), yel = mat(0xf2c94c, { em: 0.3 });
  const surfs = []; // 지하 공종에서 반투명하게 할 도로·보도 면 (밑의 매설물이 보이게)
  surfs.push(box(asp, null, C.road[0], C.road[1], 0, 0.1, -ZC, ZC));
  surfs.push(box(swM, null, C.sw[0], C.sw[1], 0, 0.18, -ZC, ZC), box(swM, null, C.sw2[0], C.sw2[1], 0, 0.18, -ZC, ZC));
  box(curbM, null, C.curb - 0.18, C.curb, 0, 0.2, -ZC, ZC); box(curbM, null, C.road[1], C.road[1] + 0.18, 0, 0.2, -ZC, ZC);
  // 보도 블록 줄눈 (점자 블록)
  box(mat(0xe0b43c), null, C.sw[1] - 0.6, C.sw[1] - 0.3, 0.18, 0.2, -ZC, ZC);
  // 차선: 같은 방향 사이는 흰 점선, 가운데는 노란 겹선
  const dash = inst(BOX, white, 400, null); let nd = 0;
  for (let i = 1; i < lanes.length; i++) { if (lanes[i].dir !== lanes[i - 1].dir) continue; const x = lanes[i].x0; for (let z = -ZC; z < ZC - 3; z += 9) ibox(dash, nd++, x - 0.08, x + 0.08, 0.1, 0.12, z, z + 3); }
  dash.count = Math.min(nd, dash.instanceMatrix.count);
  const cx = (C.center[0] + C.center[1]) / 2;
  [-0.14, 0.14].forEach(o => box(yel, null, cx + o - 0.06, cx + o + 0.06, 0.1, 0.125, -ZC, ZC));
  // 횡단보도 · 정지선 (대지 앞)
  const zx = Math.min(ZC - 10, pd / 2 + 14);
  const zebra = inst(BOX, white, 40, null); let nz = 0;
  for (let x = C.road[0] + 0.4; x < C.road[1] - 0.5; x += 1.0) ibox(zebra, nz++, x, x + 0.5, 0.1, 0.125, zx - 2.5, zx + 2.5);
  zebra.count = Math.min(nz, zebra.instanceMatrix.count);
  lanes.forEach(L => { const zs = L.dir > 0 ? zx - 4.2 : zx + 4.2; box(white, null, L.x0 + 0.1, L.x1 - 0.1, 0.1, 0.125, zs - 0.2, zs + 0.2); });
  // 맨홀 (하수관 위)
  if (C.manhole) { const mh = inst(CYL, mat(0x55575c, { metal: 0.6 }), 24, null); let nm = 0; for (let z = -ZC + 10; z < ZC; z += 28) ibox(mh, nm++, C.manhole.x - 0.4, C.manhole.x + 0.4, 0.1, 0.13, z - 0.4, z + 0.4); mh.count = Math.min(nm, mh.instanceMatrix.count); }
  // 빗물받이 (연석 옆)
  { const gr = inst(BOX, mat(0x3a3a3f, { metal: 0.5 }), 40, null); let ng = 0; for (let z = -ZC + 6; z < ZC; z += 20) { ibox(gr, ng++, C.curb + 0.05, C.curb + 0.55, 0.1, 0.13, z, z + 0.9); ibox(gr, ng++, C.road[1] - 0.55, C.road[1] - 0.05, 0.1, 0.13, z + 8, z + 8.9); } gr.count = Math.min(ng, gr.instanceMatrix.count); }

  // ---------- 가로수 · 가로등 · 신호등 · 버스 정류장 · 볼라드 ----------
  const trunkM = mat(0x6b5a48, { rough: 0.95 }), leafM = mat(0xffffff, { rough: 0.85 });
  const CROWN = crownGeo(); geos.push(CROWN);
  const LEAF = [0x4d6b3a, 0x5b7a41, 0x46663c, 0x6a8448, 0x55703d].map(c => new THREE.Color(c));
  const NT = 160, treeT = inst(CYL, trunkM, NT, null), treeA = inst(CROWN, leafM, NT, null), pitM = inst(BOX, mat(0x5b4a36, { tex: 'soil' }), NT, null); let nt = 0;
  const tree = (x, z, h, r) => { const k = (Math.abs(Math.round(x * 7.1 + z * 3.3)) % 997) / 997; ibox(treeT, nt, x - 0.15, x + 0.15, 0.18, h * 0.6, z - 0.15, z + 0.15); ibox(treeA, nt, x - r * 1.15, x + r * 1.15, h * 0.42, h * 0.42 + r * 2.1, z - r * 1.15, z + r * 1.15, 0, 0); treeA.setColorAt(nt, LEAF[Math.floor(k * LEAF.length)]); ibox(pitM, nt, x - 0.7, x + 0.7, 0.18, 0.2, z - 0.7, z + 0.7); nt++; };
  C.trees.forEach((t, i) => { for (let z = -ZC + 5 + i * 4; z < ZC - 3; z += 9) { if (i === 0 && Math.abs(z - pd / 2 - 3 + 5) < 7) continue; if (Math.abs(z - zx) < 4) continue; tree(t.x, z, t.h, t.r); } });
  if (C.left.trees) C.left.trees.forEach(t => { for (let z = -ZC + 6; z < ZC; z += 11) tree(t.x, z, t.h, t.r); });
  treeT.count = treeA.count = pitM.count = Math.min(nt, treeT.instanceMatrix.count); if (treeA.instanceColor) treeA.instanceColor.needsUpdate = true;
  const poleM = mat(0x8a8f99, { metal: 0.6, rough: 0.4 }), lampM = mat(0xfff1c8, { em: 1.1 });
  const poleI = inst(CYL, poleM, 60, null), armI = inst(BOX, poleM, 60, null), headI = inst(BOX, lampM, 60, null); let np = 0;
  C.lights.forEach(L => { for (let z = -ZC + 12; z < ZC; z += 26) { ibox(poleI, np, L.x - 0.1, L.x + 0.1, 0.18, L.h, z - 0.1, z + 0.1); ibox(armI, np, Math.min(L.x, L.x + L.dir * L.arm), Math.max(L.x, L.x + L.dir * L.arm), L.h - 0.1, L.h + 0.05, z - 0.06, z + 0.06); const hx = L.x + L.dir * L.arm; ibox(headI, np, hx - 0.45, hx + 0.45, L.h - 0.28, L.h - 0.1, z - 0.22, z + 0.22); np++; } });
  poleI.count = armI.count = headI.count = Math.min(np, headI.instanceMatrix.count);
  // 신호등 (횡단보도 양쪽)
  const sigR = mat(0xff4a4a, { em: 1.4 }), sigG = mat(0x3cd68a, { em: 1.4 }), sigOff = mat(0x2b2b2e);
  const sig = [];
  [[C.sw2[0] + 0.6, -1, zx + 3.2], [C.curb - 0.6, 1, zx - 3.2]].forEach(([x, d, z]) => {
    box(poleM, null, x - 0.12, x + 0.12, 0.18, 6.2, z - 0.12, z + 0.12);
    const arm = Math.min(9, (C.road[1] - C.road[0]) * 0.55);
    box(poleM, null, Math.min(x, x - d * arm), Math.max(x, x - d * arm), 5.9, 6.05, z - 0.08, z + 0.08);
    const hx = x - d * arm * 0.82; box(mat(0x1f2024), null, hx - 0.9, hx + 0.9, 5.4, 5.9, z - 0.2, z + 0.2);
    const lights = [-0.55, 0, 0.55].map((o) => { const m = box(sigOff, null, hx + o - 0.16, hx + o + 0.16, 5.5, 5.82, z + (d > 0 ? -0.24 : 0.2), z + (d > 0 ? -0.2 : 0.24)); return m; });
    // 보행 신호
    box(mat(0x1f2024), null, x - 0.2, x + 0.2, 2.6, 3.4, z - 0.2, z + 0.2);
    sig.push(lights);
  });
  if (C.busStop) {
    const b = C.busStop, z0 = -ZC * 0.45, gl = mat(0x9fc4e6, { op: 0.35 }), fr = mat(0x5f6066, { metal: 0.5 });
    box(fr, null, b.x0, b.x1, b.h, b.h + 0.12, z0, z0 + 6); box(gl, null, b.x1 - 0.06, b.x1, 0.3, b.h, z0, z0 + 6);
    [z0, z0 + 6].forEach(z => box(fr, null, b.x1 - 0.12, b.x1, 0.18, b.h, z - 0.06, z + 0.06));
    box(mat(0x8b6f3a), null, b.x0 + 0.9, b.x1 - 0.2, 0.6, 0.68, z0 + 1, z0 + 5);
    box(mat(0xe7e7ea, { em: 0.5 }), null, b.x0 + 0.3, b.x0 + 0.42, 0.4, 2.4, z0 + 6.4, z0 + 7.2);
    labels.push({ t: '버스 정류장', p: [(b.x0 + b.x1) / 2, b.h + 1.2, z0 + 3], over: true });
  }
  // 볼라드 (보도 끝)
  { const bo = inst(CYL, mat(0x5f6066), 40, null); let n = 0; for (let z = zx - 2.4; z <= zx + 2.4; z += 1.2) { ibox(bo, n++, C.curb - 0.45, C.curb - 0.25, 0.18, 1, z - 0.1, z + 0.1); ibox(bo, n++, C.road[1] + 0.25, C.road[1] + 0.45, 0.18, 1, z - 0.1, z + 0.1); } bo.count = Math.min(n, bo.instanceMatrix.count); }

  // ---------- 도로 밑 매설물 (뒤쪽 절반, 단면에 원으로 보인다) ----------
  const utI = new Map();
  C.utils.forEach(u => { const k = u.k === 'iw' ? 'water' : u.k; const m = mat(UT_C[k] || 0x9a9aa0, { em: 0.35 }); if (!utI.has(m)) utI.set(m, []); utI.get(m).push(u); });
  utI.forEach((list, m) => {
    const n = list.reduce((s, u) => s + (u.n || 1), 0), im = inst(CYL, m, n, null); let k = 0;
    list.forEach(u => { const cnt = u.n || 1; for (let j = 0; j < cnt; j++) { const xo = cnt > 1 ? (j % 2 - 0.5) * u.d * 1.4 : 0, yo = cnt > 2 ? (Math.floor(j / 2) - 0.5) * u.d * 1.4 : 0, r = u.d / 2; X._p.set(u.x + xo, u.e + yo, 0); X._q.setFromEuler(X._e.set(Math.PI / 2, 0, 0)); X._s.set(u.d, 2 * ZC, u.d); X._m.compose(X._p, X._q, X._s); im.setMatrixAt(k++, X._m); void r; } });
    im.count = Math.min(k, im.instanceMatrix.count);
  });
  labels.push({ t: '도로 밑 매설물 (통신·전력·가스·상수·하수)', p: [(C.road[0] + C.road[1]) / 2, -3.6, Z * 0.6], under: true });

  // ---------- 왼쪽: 이면도로 · 담장 · 전신주 ----------
  const Lf = C.left;
  if (Lf.road) {
    surfs.push(box(asp, null, Lf.road[0], Lf.road[1], 0, 0.1, -ZC, ZC));
    if (Lf.center) box(yel, null, (Lf.road[0] + Lf.road[1]) / 2 - 0.08, (Lf.road[0] + Lf.road[1]) / 2 + 0.08, 0.1, 0.125, -ZC, ZC);
    else { const d2 = inst(BOX, white, 80, null); let n = 0; for (let z = -ZC; z < ZC; z += 6) { ibox(d2, n++, Lf.road[0] + 0.15, Lf.road[0] + 0.3, 0.1, 0.12, z, z + 3); } d2.count = Math.min(n, d2.instanceMatrix.count); }
    if (Lf.sw) surfs.push(box(swM, null, Lf.sw[0], Lf.sw[1], 0, 0.18, -ZC, ZC));
    if (Lf.green) box(mat(0x4f7a3e, { rough: 1 }), null, Lf.green[0], Lf.green[1], 0, 0.06, -ZC, ZC);
    labels.push({ t: C.kind === 'urban' ? '이면도로' : '진입 도로', p: [(Lf.road[0] + Lf.road[1]) / 2, 0.6, ZC - 16] });
  }
  if (Lf.wall != null) box(mat(0xb5b0a6), null, Lf.wall - 0.25, Lf.wall, 0, 1.8, -pd / 2 + 2, pd / 2 - 8);
  if (Lf.pole) { const pm = mat(0x9a9590); const pI = inst(CYL, pm, 12, null), cI = inst(BOX, pm, 12, null); let n = 0; for (let z = -ZC + 8; z < ZC; z += 30) { ibox(pI, n, Lf.pole.x - 0.16, Lf.pole.x + 0.16, 0, Lf.pole.h, z - 0.16, z + 0.16); ibox(cI, n, Lf.pole.x - 1.1, Lf.pole.x + 1.1, Lf.pole.h - 0.8, Lf.pole.h - 0.65, z - 0.08, z + 0.08); n++; } pI.count = cI.count = Math.min(n, cI.instanceMatrix.count);
    const wire = mat(0x1f2024); [-0.9, 0, 0.9].forEach(o => box(wire, null, Lf.pole.x + o - 0.02, Lf.pole.x + o + 0.02, Lf.pole.h - 0.62, Lf.pole.h - 0.58, -ZC + 8, ZC - 8)); }
  if (Lf.car) { const x = Lf.car.x; box(mat(0x9aa3ad, { metal: 0.4 }), null, x - 0.9, x + 0.9, 0.35, 1.0, -pd / 4 - 2.3, -pd / 4 + 2.3); box(mat(0x2b3440, { metal: 0.5, rough: 0.3 }), null, x - 0.8, x + 0.8, 1.0, 1.45, -pd / 4 - 1.2, -pd / 4 + 1.2); }

  // ---------- 건물: 인접 · 건너편 · 뒤 블록 ----------
  const TEX = {}; const texOf = (k) => { if (!TEX[k]) { TEX[k] = facadeTex(k, 11 + Object.keys(TEX).length * 31); texs.push(TEX[k].map, TEX[k].rm); } return TEX[k]; };
  const roofM = mat(0x8d8d93, { rough: 0.9 });
  const wallMats = new Map();
  const wallMat = (k, tint) => { const key = k + tint; if (!wallMats.has(key)) { const T = texOf(k); const m = new THREE.MeshStandardMaterial({ map: T.map, roughnessMap: T.rm, metalnessMap: T.rm, color: tint, roughness: 1, metalness: 1, envMapIntensity: 1.1 }); mats2.push(m); wallMats.set(key, m); } return wallMats.get(key); };
  const TINT = [0xffffff, 0xf2eee8, 0xe6eaf0, 0xf7f1e8, 0xe9e6df];
  const roofTop = inst(BOX, mat(0xb5b5ba), 120, null), tankI = inst(CYL, mat(0xc9ccd3, { metal: 0.3 }), 60, null), oduI = inst(BOX, mat(0xd9d9de, { metal: 0.3 }), 160, null);
  const shopG = inst(BOX, mat(0xffe2a8, { em: 0.45, op: 0.85 }), 60, null), awn = inst(BOX, mat(0xffffff), 60, null), sign = inst(BOX, mat(0xffffff, { em: 0.6 }), 60, null);
  const balI = inst(BOX, mat(0xd2d0cb), 400, null);
  let nr = 0, ntk = 0, nod = 0, nsh = 0, nbal = 0;
  const SIGN_C = [0xd0103a, 0x2f7fd0, 0x0f7f61, 0xe0a043, 0x7b5ea6];
  // face: 'x-' | 'x+' | 'z+' (길을 보는 면)
  function bld(x0, x1, z0, z1, h, k, face, o = {}) {
    if (!(x1 - x0 > 1 && z1 - z0 > 1 && h > 2)) return;
    const w = x1 - x0, d = z1 - z0, g = bldGeo(w, h, d); geos.push(g);
    const wm = wallMat(k === 'school' ? 'school' : k, TINT[Math.floor(R() * TINT.length)]);
    const m = new THREE.Mesh(g, [wm, wm, roofM, roofM, wm, wm]); m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); root.add(m);
    // 옥상: 파라펫 · 계단탑 · 물탱크 · 실외기
    if (k !== 'house') { ibox(roofTop, nr++, x0, x1, h, h + 1.0, z0, z0 + 0.25); ibox(roofTop, nr++, x0, x1, h, h + 1.0, z1 - 0.25, z1); ibox(roofTop, nr++, x0, x0 + 0.25, h, h + 1.0, z0, z1); ibox(roofTop, nr++, x1 - 0.25, x1, h, h + 1.0, z0, z1); }
    if (k !== 'factory' && k !== 'house' && w > 6 && d > 6) { const px = x0 + w * 0.3, pz = z0 + d * 0.35; ibox(roofTop, nr++, px, px + Math.min(6, w * 0.3), h, h + 3.2, pz, pz + Math.min(5, d * 0.3)); ibox(tankI, ntk++, x0 + w * 0.68 - 1.2, x0 + w * 0.68 + 1.2, h, h + 2.4, z0 + d * 0.6 - 1.2, z0 + d * 0.6 + 1.2); const no = k === 'office' ? 6 : 3; for (let j = 0; j < no && nod < 160; j++) ibox(oduI, nod++, x0 + w * 0.55 + (j % 3) * 1.3, x0 + w * 0.55 + (j % 3) * 1.3 + 1, h, h + 1.1, z0 + d * 0.22 + Math.floor(j / 3) * 1.4, z0 + d * 0.22 + Math.floor(j / 3) * 1.4 + 0.8); }
    if (k === 'factory') { const sx = x0 + w * 0.8; ibox(tankI, ntk++, sx - 0.5, sx + 0.5, h, h + 9, z0 + d * 0.5 - 0.5, z0 + d * 0.5 + 0.5); }
    if (k === 'house') { ibox(roofTop, nr++, x0 - 0.3, x1 + 0.3, h, h + 0.35, z0 - 0.3, z1 + 0.3); }
    // 1층 상가: 유리 · 차양 · 간판 (길 쪽 면)
    if (o.shop) {
      const e = 0.04, gH = 3.6;
      if (face === 'x-') { ibox(shopG, nsh, x0 - e - 0.05, x0 - e, 0.25, gH, z0 + 0.6, z1 - 0.6); ibox(awn, nsh, x0 - 1.4, x0, gH + 0.1, gH + 0.25, z0 + 0.6, z1 - 0.6, 0, -0.18); ibox(sign, nsh, x0 - 0.18, x0 - 0.05, gH + 0.5, gH + 1.3, z0 + 1, Math.min(z1 - 1, z0 + 1 + 7)); }
      else if (face === 'x+') { ibox(shopG, nsh, x1 + e, x1 + e + 0.05, 0.25, gH, z0 + 0.6, z1 - 0.6); ibox(awn, nsh, x1, x1 + 1.4, gH + 0.1, gH + 0.25, z0 + 0.6, z1 - 0.6, 0, 0.18); ibox(sign, nsh, x1 + 0.05, x1 + 0.18, gH + 0.5, gH + 1.3, z0 + 1, Math.min(z1 - 1, z0 + 8)); }
      else { ibox(shopG, nsh, x0 + 0.6, x1 - 0.6, 0.25, gH, z1 + e, z1 + e + 0.05); ibox(awn, nsh, x0 + 0.6, x1 - 0.6, gH + 0.1, gH + 0.25, z1, z1 + 1.4, -0.18, 0); ibox(sign, nsh, x0 + 1, Math.min(x1 - 1, x0 + 8), gH + 0.5, gH + 1.3, z1 + 0.05, z1 + 0.18); }
      const c = new THREE.Color(SIGN_C[Math.floor(R() * SIGN_C.length)]); awn.setColorAt(nsh, c); sign.setColorAt(nsh, c); nsh++;
    }
    // 오피스텔 발코니 (길 쪽 면, 층마다)
    if (o.balcony && face === 'x+') for (let e = 7.6; e < h - 2 && nbal < 400; e += 3) for (let zz = z0 + 1.5; zz < z1 - 3 && nbal < 400; zz += 6.4) { ibox(balI, nbal++, x1, x1 + 1.3, e, e + 0.15, zz, zz + 4.2); ibox(balI, nbal++, x1 + 1.2, x1 + 1.3, e, e + 1.1, zz, zz + 4.2); }
    return m;
  }
  // 인접 건물 (단면을 자르는 건물): 지하층은 박스로 따로
  const N = C.nb, nbZ0 = -pd / 2 + 2, nbZ1 = pd / 2 - 8;
  const nbKind = N.kind === 'factory' ? 'factory' : N.kind === 'house' ? 'house' : N.kind === 'school' ? 'school' : N.kind === 'office' ? 'office' : 'officetel';
  bld(nb.x0, nb.x1, nbZ0, nbZ1, nb.h, nbKind, 'x+', { shop: N.shop, balcony: N.balcony });
  if (nb.b > 0.5) {
    surfs.push(box(mat(0x8a8780, { tex: 'conc' }), null, nb.x0, nb.x1, -nb.b, 0, nbZ0, nbZ1));
    // 지하층 슬래브 (단면 앞면)
    const bs = inst(BOX, mat(0xbdbdc2), (N.nbB || 1) + 1, null); let n = 0; (N.bfl || []).forEach(f => ibox(bs, n++, nb.x0 + 0.3, nb.x1 - 0.3, f.e0 - 0.15, f.e0 + 0.15, nbZ0 + 0.3, nbZ1 - 0.3)); bs.count = Math.min(n, bs.instanceMatrix.count);
    if (N.found === 'pile') { const pI = inst(CYL, mat(0xb8b8bc), 8, null); let k = 0; for (let x = nb.x0 + 2; x < nb.x1 - 1; x += Math.max(3, (nb.x1 - nb.x0) / 6)) ibox(pI, k++, x - 0.3, x + 0.3, -nb.b - 12, -nb.b, 0.05, 0.6); pI.count = Math.min(k, pI.instanceMatrix.count); }
  }
  labels.push({ t: `인접 건물 · ${N.name}`, p: [(nb.x0 + nb.x1) / 2, nb.h + 3, nbZ1 - 4] });
  if (C.nb2) bld(C.nb2.x0, C.nb2.x1, nbZ0 - 4, nbZ1 + 2, C.nb2.h, 'office', 'z+', {});
  // 인접 건물 줄 (z 방향 앞뒤로 이어짐)
  { const rx1 = nb.x1, items = C.rowL; let z = nbZ1, i = 0; while (z < ZC - 6 && i < 12) { const it = items[i % items.length]; z += it.gap; const z1 = Math.min(ZC, z + it.d); bld(rx1 - Math.min(26, nb.x1 - nb.x0 + 4 * (it.t - 0.5)), rx1, z, z1, it.h, it.k, 'x+', { shop: C.kind === 'urban' && it.t > 0.4 }); z = z1; i++; }
    z = nbZ0; i = 2; while (z > -ZC + 6 && i < 14) { const it = items[i % items.length]; z -= it.gap; const z0 = Math.max(-ZC, z - it.d); bld(rx1 - Math.min(26, nb.x1 - nb.x0 + 4 * (0.5 - it.t)), rx1, z0, z, it.h, it.k, 'x+', { shop: C.kind === 'urban' && it.t < 0.6 }); z = z0; i++; } }
  // 건너편 (대로 너머): 단면 위치(z≈0)에는 2D와 같은 건물
  { const fx0 = C.far.length ? C.far[0].x0 : C.sw2[1] + 1; const f0 = C.far[0];
    const zA = -12, zB = 12;
    if (f0) { bld(f0.x0, f0.x1, zA, zB, f0.h, f0.kind === 'office' ? 'office' : f0.kind, 'x-', { shop: f0.shop }); labels.push({ t: f0.name, p: [(f0.x0 + f0.x1) / 2, f0.h + 3, 0] }); }
    let z = zB, i = 0; while (z < ZC - 4 && i < 12) { const it = C.rowF[i % C.rowF.length]; z += it.gap; const z1 = Math.min(ZC, z + it.w); bld(fx0, fx0 + it.d, z, z1, it.h, it.k, 'x-', { shop: it.shop }); z = z1; i++; }
    z = zA; i = 3; while (z > -ZC + 4 && i < 15) { const it = C.rowF[i % C.rowF.length]; z -= it.gap; const z0 = Math.max(-ZC, z - it.w); bld(fx0, fx0 + it.d, z0, z, it.h, it.k, 'x-', { shop: it.shop }); z = z0; i++; } }
  // 뒤쪽: 대지 뒤 이면도로 + 건너 블록
  { const zb1 = -pd / 2 - 3.6, zb0 = zb1 - 7, xa = (Lf.road ? Lf.road[0] : nb.x1) , xb = C.sw[0];
    box(asp, null, xa, C.road[0], 0, 0.1, zb0, zb1);
    box(swM, null, xa, xb, 0, 0.18, zb0 - 2.4, zb0);
    const d3 = inst(BOX, white, 60, null); let n = 0; for (let x = xa + 1; x < C.road[0] - 3; x += 6) ibox(d3, n++, x, x + 3, 0.1, 0.12, (zb0 + zb1) / 2 - 0.07, (zb0 + zb1) / 2 + 0.07); d3.count = Math.min(n, d3.instanceMatrix.count);
    let x = xa, i = 0; while (x < xb - 6 && i < 12) { const it = C.rowB[i % C.rowB.length]; x += it.gap; const x1 = Math.min(xb - 1, x + it.w); bld(x, x1, zb0 - 2.6 - it.d, zb0 - 2.6, it.h, it.k, 'z+', { shop: it.shop }); x = x1; i++; } }
  roofTop.count = Math.min(nr, roofTop.instanceMatrix.count); tankI.count = Math.min(ntk, tankI.instanceMatrix.count); oduI.count = Math.min(nod, oduI.instanceMatrix.count); shopG.count = awn.count = sign.count = Math.min(nsh, sign.instanceMatrix.count); balI.count = Math.min(nbal, balI.instanceMatrix.count);
  [awn, sign].forEach(o => { if (o.instanceColor) o.instanceColor.needsUpdate = true; });
  labels.push({ t: `대로 · 왕복 ${lanes.length}차로`, p: [(C.road[0] + C.road[1]) / 2, 0.6, ZC - 18] });

  // ---------- 현장 출입구: 게이트 · 세륜 · 경비실 · 사무실 컨테이너 ----------
  const gz1 = pd / 2 + 3, gz0 = gz1 - 10, gx = C.fence;
  const gateM = mat(0x5f6066, { metal: 0.4 }), washM = mat(0x3d4b52);
  [gz0, gz1].forEach(z => box(gateM, null, gx - 0.25, gx + 0.25, 0, 3.6, z - 0.25, z + 0.25));
  box(gateM, null, gx - 0.1, gx + 0.1, 3.3, 3.6, gz0, gz1);
  box(mat(0xf2c94c, { em: 0.2 }), null, gx - 0.12, gx + 0.12, 3.6, 4.4, gz0 + 1, gz1 - 1); // 현장 안내판
  // 세륜기: 콘크리트 턱 + 출렁이는 세척수 + 롤러 + 양옆 분사 노즐(차가 지날 때 바퀴에 물을 뿜는다)
  const wx0 = C.yard[0] + 0.6, wx1 = C.yard[1] - 0.4, wz0 = gz0 + 1.5, wz1 = gz1 - 1.5, washConc = mat(0xa9a7a1, { tex: 'conc' });
  box(washM, null, wx0, wx1, 0, 0.05, wz0, wz1);
  const washW = waterSurface(0x557f8c, { scale: 1 / 2.2, ns: 0.6, still: false, flow: [0.09, 0.05], rough: 0.08 }); mats2.push(washW);
  box(washW, null, wx0, wx1, 0.05, 0.27, wz0, wz1);
  [[wz0 - 0.3, wz0], [wz1, wz1 + 0.3]].forEach(([a, b]) => box(washConc, null, wx0 - 0.25, wx1 + 0.25, 0, 0.32, a, b));
  [[wx0 - 0.25, wx0], [wx1, wx1 + 0.25]].forEach(([a, b]) => box(washConc, null, a, b, 0, 0.5, wz0, wz1));
  const washR = inst(BOX, mat(0x8fa1b5, { metal: 0.5 }), 12, null); { let n = 0; for (let z = gz0 + 2; z < gz1 - 2; z += 1.2) ibox(washR, n++, wx0 + 0.1, wx1 - 0.1, 0.3, 0.4, z, z + 0.3); washR.count = Math.min(n, washR.instanceMatrix.count); }
  const nozM = mat(0x6f7f92, { metal: 0.6 });
  [wx0 - 0.12, wx1 + 0.12].forEach(x => { box(nozM, null, x - 0.05, x + 0.05, 0.5, 1.1, wz0 + 0.2, wz0 + 0.3); box(nozM, null, x - 0.05, x + 0.05, 1.0, 1.1, wz0 + 0.2, wz1 - 0.2); box(nozM, null, x - 0.05, x + 0.05, 0.5, 1.1, wz1 - 0.3, wz1 - 0.2); });
  const sprayM = new THREE.MeshStandardMaterial({ color: 0xe4f1f8, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.3, emissive: 0x9fc6e0, emissiveIntensity: 0.3, side: THREE.DoubleSide }); mats2.push(sprayM);
  const sprayG = new THREE.ConeGeometry(0.32, 1.2, 10, 1, true); geos.push(sprayG);
  const sprayI = inst(sprayG, sprayM, 16, null); sprayI.userData.noMirror = true;
  const _sq = new THREE.Quaternion(), _sp = new THREE.Vector3(), _ss = new THREE.Vector3(), _sm = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
  function washSpray(on, T) {
    let n = 0;
    if (on) [[wx0 - 0.12, 1], [wx1 + 0.12, -1]].forEach(([x, s]) => { for (let z = wz0 + 0.8; z < wz1 - 0.5 && n < 16; z += 1.05) { _dir.set(-s, 0.75, 0).normalize(); _sq.setFromUnitVectors(_up, _dir); const f = 0.85 + 0.2 * Math.sin(T * 23 + z * 3.1); _ss.set(f, f * (0.9 + 0.15 * Math.sin(T * 17 + z)), f); _sp.set(x, 1.0, z).addScaledVector(_dir, -0.6 * _ss.y); _sm.compose(_sp, _sq, _ss); sprayI.setMatrixAt(n++, _sm); } });
    sprayI.count = n; sprayI.instanceMatrix.needsUpdate = true;
  }
  box(mat(0xe7e7ea), null, gx + 0.5, gx + 2.1, 0.18, 2.6, gz0 - 2.4, gz0 - 0.6); // 경비실
  labels.push({ t: '현장 출입구 · 세륜', p: [gx + 1, 4.8, (gz0 + gz1) / 2], over: true });
  // 가설 사무실 (야드 안, 2단 적층)
  const ofc = inst(BOX, mat(0xe7e7ea), 4, null), ofcW = inst(BOX, mat(0x6f9fd0, { em: 0.2 }), 8, null), stair = inst(BOX, mat(0xf2c94c), 2, null);

  // ---------- 통행 차량 ----------
  const nV = lanes.length * 4;
  // 승용차·SUV·승합: 옆모습을 밀어낸 차체 + 유리. 버스·트럭: 상자 차체 + 창 띠
  const CARG = profileGeo(CAR_BODY), CARW = profileGeo(CAR_GLASS); CARW.scale(1.03, 1, 1); geos.push(CARG, CARW);
  CARG.computeBoundingBox(); const cb = CARG.boundingBox;
  const WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14).rotateZ(Math.PI / 2); geos.push(WHEEL);
  const bodyI = inst(BOX, mat(0xffffff, { metal: 0.35, rough: 0.45 }), nV, null), cabI = inst(BOX, mat(0x1d2730, { metal: 0.7, rough: 0.12 }), nV, null), whI = inst(WHEEL, mat(0x1b1b1e, { rough: 0.7 }), nV * 2, null);
  const carI = inst(CARG, mat(0xffffff, { metal: 0.55, rough: 0.3 }), nV, null), carW = inst(CARW, mat(0x1a232c, { metal: 0.8, rough: 0.06 }), nV, null);
  const BUS_C = new THREE.Color(0x2f7a52), TRUCK_C = new THREE.Color(0xdcdcdf);
  const putCar = (im, i, x, z, w, h, L, dir) => { const sx = w / (cb.max.x - cb.min.x), sy = (h - 0.28) / (cb.max.y - cb.min.y), sz = L / (cb.max.z - cb.min.z); X._s.set(sx, sy, sz); X._q.setFromEuler(X._e.set(0, dir > 0 ? 0 : Math.PI, 0)); X._p.set(x, 0.28 - cb.min.y * sy, z); X._m.compose(X._p, X._q, X._s); im.setMatrixAt(i, X._m); };
  const headL = inst(BOX, mat(0xfff6d8, { em: 1.2 }), nV, null), tailL = inst(BOX, mat(0xff3b30, { em: 1.2 }), nV, null);
  const vehs = [];
  lanes.forEach((L, li) => { for (let j = 0; j < 4; j++) { let r = R(), v = VEH[0]; for (const x of VEH) { r -= x.p; if (r <= 0) { v = x; break; } } vehs.push({ li, v, ph: (j + R() * 0.6) / 4, sp: 7 + R() * 5, c: CAR_C[Math.floor(R() * CAR_C.length)] }); } });
  vehs.forEach((V, i) => { const c = new THREE.Color(V.v.k === 'bus' ? 0x2f7a52 : V.v.k === 'truck' ? 0xdcdcdf : V.c); bodyI.setColorAt(i, c); carI.setColorAt(i, c); });
  if (bodyI.instanceColor) bodyI.instanceColor.needsUpdate = true; if (carI.instanceColor) carI.instanceColor.needsUpdate = true;
  // 사람 (작업자 · 보행자): 관절 있는 모형 (crew3d.js)
  const people = buildPeople({ root }, 160);
  // 차로 점용 콘 · 안내판
  const coneI = inst(CONE, mat(0xff7a1a, { em: 0.2 }), 80, null), barI = inst(BOX, mat(0xffffff, { em: 0.3 }), 6, null);

  // ---------- 매 프레임 ----------
  // st: { T, occ:Set(lane index), work:[{x,y,z,...}] (작업자 자리), trucksLane }
  function frame(st) {
    const { T, occ = new Set(), busy = new Set(), work = [], gateBusy = false } = st;
    // 신호: 30초 주기 (차량 녹색 18초)
    const ph = (T % 30) / 30, carGo = ph < 0.6;
    sig.forEach((L) => { L[0].material = carGo ? sigOff : sigR; L[1].material = !carGo && ph < 0.66 ? mat(0xffc23a, { em: 1.4 }) : sigOff; L[2].material = carGo ? sigG : sigOff; });
    // 차량: 점용 차로는 비운다. 횡단보도 앞 정지선에서 빨간불이면 선다
    let nv = 0, nw = 0, nb3 = 0, nc3 = 0;
    vehs.forEach((V) => {
      if (occ.has(V.li) || busy.has(V.li)) return;
      const L = lanes[V.li], dir = L.dir, span = 2 * ZC;
      let s = ((T * V.sp / span + V.ph) % 1) * span; // 진행 거리
      let z = dir > 0 ? -ZC + s : ZC - s;
      const stopZ = dir > 0 ? zx - 4.6 - V.v.L / 2 : zx + 4.6 + V.v.L / 2;
      if (!carGo && (dir > 0 ? z > stopZ - 14 && z < stopZ : z < stopZ + 14 && z > stopZ)) z = stopZ - dir * ((V.ph * 7) % 1) * 9;
      const x = (L.x0 + L.x1) / 2, w = V.v.w, h = V.v.h, Lh = V.v.L / 2, big = V.v.k === 'bus' || V.v.k === 'truck';
      const fade = clamp((ZC - Math.abs(z)) / 6, 0, 1); if (fade <= 0.05) return;
      if (big) { ibox(bodyI, nb3, x - w / 2, x + w / 2, 0.35, h, z - Lh, z + Lh); bodyI.setColorAt(nb3, V.v.k === 'bus' ? BUS_C : TRUCK_C); ibox(cabI, nb3, x - w / 2 - 0.01, x + w / 2 + 0.01, h * 0.55, h * 0.85, z - Lh + 0.4, z + Lh - 0.4); nb3++; }
      else { putCar(carI, nc3, x, z, w, h, V.v.L, dir); putCar(carW, nc3, x, z, w, h, V.v.L, dir); carI.setColorAt(nc3, new THREE.Color(V.c)); nc3++; }
      const fz = z + dir * Lh, bz = z - dir * Lh;
      ibox(headL, nv, x - w / 2 + 0.1, x + w / 2 - 0.1, 0.6, 0.8, fz - 0.03, fz + 0.03); ibox(tailL, nv, x - w / 2 + 0.1, x + w / 2 - 0.1, 0.65, 0.85, bz - 0.03, bz + 0.03);
      const wf = big ? 1.6 : 0.95, wd = big ? 0.9 : 0.64; ibox(whI, nw++, x - w / 2 + 0.02, x + w / 2 - 0.02, 0, wd, z - Lh + wf - wd / 2, z - Lh + wf + wd / 2); ibox(whI, nw++, x - w / 2 + 0.02, x + w / 2 - 0.02, 0, wd, z + Lh - wf - wd / 2, z + Lh - wf + wd / 2);
      nv++;
    });
    headL.count = tailL.count = Math.min(nv, tailL.instanceMatrix.count); whI.count = Math.min(nw, whI.instanceMatrix.count);
    bodyI.count = cabI.count = Math.min(nb3, bodyI.instanceMatrix.count); carI.count = carW.count = Math.min(nc3, carI.instanceMatrix.count);
    [bodyI, cabI, headL, tailL, whI, carI, carW].forEach(o => { o.instanceMatrix.needsUpdate = true; });
    if (bodyI.instanceColor) bodyI.instanceColor.needsUpdate = true; if (carI.instanceColor) carI.instanceColor.needsUpdate = true;
    // 세륜: 차가 드나드는 동안 분사 (지나가는 몇 초씩)
    washSpray(gateBusy && (T % 22) < 9, T);
    // 사람
    people.begin();
    // 보행자 (보도 양쪽, 오가며)
    for (let i = 0; i < 16; i++) { const sw = i % 2 ? C.sw2 : C.sw, dir = i % 4 < 2 ? 1 : -1, sp = 1.2 + (i % 3) * 0.2, s = ((T * sp / (2 * ZC) + i * 0.137) % 1) * 2 * ZC; let z = dir > 0 ? -ZC + s : ZC - s; if (i % 2 === 0 && z > gz0 - 1 && z < gz1 + 1) continue; const x = sw[0] + 0.8 + ((i * 0.37) % 1) * (sw[1] - sw[0] - 1.6); people.add(x, 0.18, z, dir > 0 ? 0 : Math.PI, 'walk', T, (T * sp + i * 3.1) * 4.6, PED_LOOK(i)); }
    // 신호수 (게이트 · 점용 차로)
    const g1 = crewAt(gateBusy ? 'signal' : 'stand', gx + 1.2, 0.18, gz1 + 1.2, [gx + 8, gz1 + 1.2], T, 1); people.add(g1.x, g1.y, g1.z, g1.yaw, g1.act, g1.t, 0, g1.lk);
    if (occ.size) { const xo = Math.min((lanes[Math.max(...occ)].x1) + 0.6, C.road[1] - 0.6); [pd / 2 + 8, -pd / 2 - 8].forEach((zz, k) => { const s2 = crewAt('signal', xo, 0.1, zz, [xo, zz + (k ? -10 : 10)], T, 2 + k); people.add(s2.x, s2.y, s2.z, s2.yaw, s2.act, s2.t, 0, s2.lk); }); }
    // 작업자 (build3d가 넘긴 자리와 동작)
    work.forEach(w => people.add(w.x, w.y, w.z, w.yaw, w.act, w.t, w.ph, w.lk));
    people.end();
    // 점용 차로 표시: 콘 줄 + 화살표 판
    let nc = 0, nb2 = 0;
    if (occ.size) {
      const xe = lanes[Math.max(...occ)].x1 - 0.2, za = -pd / 2 - 14, zb = pd / 2 + 14;
      for (let z = za; z <= zb && nc < 80; z += 3) ibox(coneI, nc++, xe - 0.22, xe + 0.22, 0.1, 0.85, z - 0.22, z + 0.22);
      // 테이퍼 (차로를 비스듬히 막는 콘)
      const x0 = lanes[Math.min(...occ)].x0 + 0.3; for (let k = 0; k < 5 && nc < 80; k++) { const t = k / 4; ibox(coneI, nc++, lerp(x0, xe, t) - 0.22, lerp(x0, xe, t) + 0.22, 0.1, 0.85, zb + 6 - t * 6 - 0.22, zb + 6 - t * 6 + 0.22); ibox(coneI, nc++, lerp(x0, xe, t) - 0.22, lerp(x0, xe, t) + 0.22, 0.1, 0.85, za - 6 + t * 6 - 0.22, za - 6 + t * 6 + 0.22); }
      ibox(barI, nb2++, x0, xe, 0.4, 1.6, zb + 7, zb + 7.15); ibox(barI, nb2++, x0, xe, 0.4, 1.6, za - 7.15, za - 7);
    }
    coneI.count = Math.min(nc, coneI.instanceMatrix.count); barI.count = Math.min(nb2, barI.instanceMatrix.count); coneI.instanceMatrix.needsUpdate = barI.instanceMatrix.needsUpdate = true;
  }
  // 사무실: prep 진행률에 따라
  function offices(on, nBox) {
    let n = 0, nw = 0, ns = 0;
    if (on) {
      const x0 = C.yard[0] + 0.5, x1 = Math.min(C.yard[1] - 0.6, x0 + 2.5);
      const zs = [[gz0 - 9, gz0 - 3], [gz0 - 16, gz0 - 10], [gz0 - 9, gz0 - 3]];
      for (let i = 0; i < Math.min(3, nBox); i++) { const y0 = i === 2 ? 2.7 : 0, [za, zb] = zs[i]; ibox(ofc, n++, x0, x1, y0 + 0.05, y0 + 2.6, za, zb); for (let k = 0; k < 2; k++) ibox(ofcW, nw++, x1 + 0.01, x1 + 0.05, y0 + 1, y0 + 2, za + 0.8 + k * 3, za + 2.2 + k * 3); }
      if (nBox >= 3) ibox(stair, ns++, x1 - 0.1, x1 + 0.9, 0, 2.7, zs[0][1] - 1.2, zs[0][1], 0, 0);
    }
    ofc.count = Math.min(n, ofc.instanceMatrix.count); ofcW.count = Math.min(nw, ofcW.instanceMatrix.count); stair.count = Math.min(ns, stair.instanceMatrix.count); [ofc, ofcW, stair].forEach(o => { o.instanceMatrix.needsUpdate = true; });
  }
  return {
    frame, offices, labels, laneX, ZC, zx, surfs, ground, zone, gate: { x: gx, z0: gz0, z1: gz1 },
    dispose() { people.dispose(); geos.forEach(g => g.dispose()); texs.forEach(t => t.dispose()); mats2.forEach(m => m.dispose()); },
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
