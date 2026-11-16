// 현장 야적장: 건물 둘레 빈 땅에 실제 현장처럼 자재 더미·가설물을 놓는다.
// 각목·합판 더미, 철근 다발, 비계 파이프, H형강, 블록·벽돌·시멘트 팔레트, 거푸집 패널, 모래·자갈 더미,
// 케이블 드럼, 자재 컨테이너, 폐기물 함, 간이 화장실, 조명탑, 라바콘·물통 바리케이드.
// 공정에 따라 보이는 것이 바뀐다 (골조 때 철근·거푸집, 마감 때 블록·시멘트, 설비 때 파이프·드럼).
import * as THREE from 'three';
import { shape } from './kit3d.js';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- 자재 프리팹 (바닥 가운데가 원점, +x가 긴 방향) ----------
const P = {
  dunnage(s, L, W, n = 3) { for (let i = 0; i < n; i++) { const x = -L / 2 + 0.4 + i * (L - 0.8) / Math.max(1, n - 1); s.box(x - 0.06, x + 0.06, 0, 0.1, -W / 2 - 0.1, W / 2 + 0.1); } return s; },
  timber(r) { // 각목 더미: 층마다 각목 + 받침목
    const s = shape(), L = 4, k = 9, w = 0.1;
    for (let lv = 0; lv < 6; lv++) { const y0 = 0.1 + lv * 0.13; for (let i = 0; i < k; i++) { const z = -0.55 + i * 0.137, d = (r() - 0.5) * 0.12; s.box(-L / 2 + d, L / 2 + d, y0, y0 + w, z - w / 2, z + w / 2); } }
    return s;
  },
  ply() { // 합판 더미
    const s = shape(); for (let i = 0; i < 14; i++) { const y = 0.1 + i * 0.024, o = (i % 3 - 1) * 0.02; s.box(-1.22 + o, 1.22 + o, y, y + 0.02, -0.61 - o, 0.61 - o); } return s;
  },
  rebar() { // 철근 다발 3묶음 (받침목 위)
    const s = shape(), L = 9; P.dunnage(s, L, 1.4, 4);
    [-0.5, 0, 0.5].forEach((zc, b) => { const pts = []; for (let q = 0; q < 3; q++) for (let w = 0; w < 4 - (q % 2); w++) pts.push([zc - 0.15 + w * 0.1 + (q % 2) * 0.05, 0.13 + q * 0.085]); pts.forEach(([z, y]) => s.cyl(0, y, z, 0.032, L - b * 0.4, 'x', 6)); });
    return s;
  },
  ties(s, L) { [-L / 3, 0, L / 3].forEach(x => s.box(x - 0.03, x + 0.03, 0.09, 0.38, -0.72, 0.72)); return s; },
  pipes() { // 비계·배관 파이프 (피라미드)
    const s = shape(), L = 6; P.dunnage(s, L, 1.2, 3);
    for (let q = 0; q < 4; q++) for (let i = 0; i < 6 - q; i++) s.cyl(0, 0.16 + q * 0.087, -0.25 * (5 - q) / 2 + i * 0.25, 0.05, L, 'x', 10);
    return s;
  },
  hbeam() { // H형강 2단
    const s = shape(), L = 8; P.dunnage(s, L, 1.6, 3);
    for (let lv = 0; lv < 2; lv++) { const y = 0.1 + lv * 0.42; [-0.55, 0, 0.55].forEach(z => { s.box(-L / 2, L / 2, y, y + 0.018, z - 0.15, z + 0.15); s.box(-L / 2, L / 2, y + 0.3, y + 0.318, z - 0.15, z + 0.15); s.box(-L / 2, L / 2, y + 0.018, y + 0.3, z - 0.009, z + 0.009); }); if (!lv) [-2.5, 2.5].forEach(x => s.box(x - 0.06, x + 0.06, y + 0.318, y + 0.42, -0.8, 0.8)); }
    return s;
  },
  pallet(s) { for (let i = 0; i < 7; i++) { const z = -0.5 + i * 0.167; s.box(-0.6, 0.6, 0.11, 0.14, z - 0.05, z + 0.05); } [-0.5, 0, 0.5].forEach(x => s.box(x - 0.05, x + 0.05, 0, 0.11, -0.55, 0.55)); return s; },
  blocks(bw = 0.39, bh = 0.19, bd = 0.19, rows = 5) { // 블록 팔레트 (팔레트는 따로)
    const s = shape(); for (let y = 0; y < rows; y++) for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) { const x = -0.6 + bw / 2 + i * 0.4, z = -0.5 + bd / 2 + j * 0.205, y0 = 0.15 + y * (bh + 0.005); s.box(x - bw / 2 + 0.003, x + bw / 2 - 0.003, y0, y0 + bh, z - bd / 2 + 0.003, z + bd / 2 - 0.003); }
    return s;
  },
  bags() { const s = shape(); for (let y = 0; y < 6; y++) for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) { const rot = y % 2, x = rot ? -0.3 + i * 0.6 : -0.4 + j * 0.4, z = rot ? -0.35 + j * 0.35 : -0.3 + i * 0.6; if (!rot && j > 2) continue; const y0 = 0.15 + y * 0.13; rot ? s.rbox(x - 0.29, x + 0.29, y0, y0 + 0.12, z - 0.17, z + 0.17, 0.05) : s.rbox(x - 0.19, x + 0.19, y0, y0 + 0.12, z - 0.29, z + 0.29, 0.05); } return s; },
  panels() { // 거푸집 패널 (노란 틀) 더미
    const s = shape(); for (let i = 0; i < 12; i++) { const y = 0.12 + i * 0.09; s.box(-1.35, 1.35, y, y + 0.08, -0.3, 0.3); } P.dunnage(s, 2.7, 0.6, 2); return s;
  },
  panelFace() { const s = shape(); for (let i = 0; i < 12; i++) { const y = 0.12 + i * 0.09; s.box(-1.3, 1.3, y + 0.081, y + 0.084, -0.26, 0.26); } return s; },
  pile(r, sx = 3.2, sy = 1.3, sz = 2.6) { // 모래·자갈 더미: 반구를 납작하게 + 울퉁불퉁
    const g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position;
    void r; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), n = 1 + (y > 0.05 ? 0.07 * Math.sin(5 * a + 3 * y) + 0.05 * Math.sin(11 * a + 1.3) : 0); p.setXYZ(i, x * sx * n, Math.pow(Math.max(0, y), 1.35) * sy * n, z * sz * n); }
    g.computeVertexNormals(); const s = shape(); s.geo(g); return s;
  },
  drum() { const s = shape(); [-0.42, 0.42].forEach(z => s.cyl(0, 0.85, z, 0.85, 0.06, 'z', 24)); s.cyl(0, 0.85, 0, 0.3, 0.8, 'z', 12); return s; },
  drumCable() { const s = shape(); s.cyl(0, 0.85, 0, 0.66, 0.78, 'z', 24); return s; },
  container() { // 20피트 자재 컨테이너: 골판 벽
    const s = shape(), L = 6.06, W = 2.44, H = 2.59; s.box(-L / 2, L / 2, 0.08, H, -W / 2, W / 2);
    for (let x = -L / 2 + 0.2; x < L / 2 - 0.1; x += 0.28) [-1, 1].forEach(k => s.box(x - 0.07, x + 0.07, 0.2, H - 0.12, k * W / 2 - 0.035, k * W / 2 + 0.035));
    [-1, 1].forEach(k => s.box(k * L / 2 - 0.08, k * L / 2 + 0.08, 0, H + 0.02, -W / 2 - 0.05, W / 2 + 0.05));
    s.box(-L / 2, L / 2, H - 0.08, H + 0.02, -W / 2 - 0.05, W / 2 + 0.05); s.box(-L / 2, L / 2, 0, 0.12, -W / 2 - 0.05, W / 2 + 0.05);
    [-0.4, 0.4].forEach(z => s.box(L / 2 + 0.08, L / 2 + 0.11, 0.3, H - 0.3, z - 0.03, z + 0.03)); // 문 잠금대
    return s;
  },
  toilet() { const s = shape(); s.rbox(-0.58, 0.58, 0.08, 2.25, -0.6, 0.6, 0.06); s.box(-0.62, 0.62, 0, 0.1, -0.64, 0.64); return s; },
  toiletRoof() { const s = shape(); s.rbox(-0.66, 0.66, 2.2, 2.42, -0.68, 0.68, 0.08); s.cyl(-0.4, 2.55, -0.4, 0.05, 0.35, 'y', 8); s.box(0.585, 0.6, 0.3, 2.05, -0.5, 0.5); return s; },
  lightTower() { // 조명탑: 트레일러 + 마스트 + 등 4개
    const s = shape(); s.rbox(-1.3, 1.3, 0.35, 1.35, -0.7, 0.7, 0.08); [-0.9, 0.9].forEach(x => s.cyl(x, 0.33, 0, 0.33, 0.25, 'z', 14)); s.box(1.3, 2.4, 0.5, 0.6, -0.04, 0.04);
    [[-1.1, -1], [-1.1, 1], [1.1, -1], [1.1, 1]].forEach(([x, z]) => { s.bar(x * 0.9, 0.6, z * 0.55, x * 1.1, 0.05, z * 1.6, 0.08); s.box(x * 1.1 - 0.15, x * 1.1 + 0.15, 0, 0.05, z * 1.6 - 0.15, z * 1.6 + 0.15); });
    s.tube(0, 1.35, 0, 0, 8.4, 0, 0.09, 10, 0.07); s.box(-0.9, 0.9, 8.3, 8.4, -0.06, 0.06); return s;
  },
  lamps() { const s = shape(); [-0.7, -0.24, 0.24, 0.7].forEach(x => s.rbox(x - 0.2, x + 0.2, 8.4, 8.8, -0.06, 0.14, 0.04)); return s; },
  skip() { // 폐기물 함 (경사진 양 끝)
    const s = shape(), g = new THREE.BufferGeometry(), L0 = 2.2, L1 = 3.4, W = 1.8, H = 1.4;
    const v = [[-L0 / 2, 0, -W / 2], [L0 / 2, 0, -W / 2], [L0 / 2, 0, W / 2], [-L0 / 2, 0, W / 2], [-L1 / 2, H, -W / 2], [L1 / 2, H, -W / 2], [L1 / 2, H, W / 2], [-L1 / 2, H, W / 2]];
    const f = [[0, 1, 2], [0, 2, 3], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0], [5, 4, 0], [1, 5, 0], [6, 5, 1], [2, 6, 1], [7, 6, 2], [3, 7, 2], [4, 7, 3], [0, 4, 3]];
    const pos = []; f.forEach(t => t.forEach(i => pos.push(...v[i]))); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); g.translate(0, 0.12, 0); s.geo(g);
    [-0.9, 0.9].forEach(x => s.box(x - 0.08, x + 0.08, 0, 0.14, -W / 2, W / 2)); return s;
  },
  debris(r) { const s = shape(); for (let i = 0; i < 9; i++) { const x = (r() - 0.5) * 2.2, z = (r() - 0.5) * 1.3, w = 0.2 + r() * 0.5; s.box(x - w / 2, x + w / 2, 0.9 + r() * 0.3, 1.15 + r() * 0.35, z - 0.1, z + 0.1 + r() * 0.3); } return s; },
  cone() { const s = shape(); s.box(-0.2, 0.2, 0, 0.04, -0.2, 0.2); s.tube(0, 0.04, 0, 0, 0.72, 0, 0.15, 12, 0.025); return s; },
  coneBand() { const s = shape(); s.tube(0, 0.36, 0, 0, 0.52, 0, 0.098, 12, 0.074); return s; },
  barrier() { const s = shape(); s.rbox(-0.9, 0.9, 0, 0.8, -0.22, 0.22, 0.08); s.rbox(-0.75, 0.75, 0.75, 0.95, -0.12, 0.12, 0.06); return s; },
};

export function buildYard(X) {
  const { root, sc, D } = X, G = sc.G, pw = G.pw, pd = D.pd, bd = D.bd;
  const geos = [], mats = [], R0 = rng(((pw * 131) ^ (pd * 7)) >>> 0 || 7);
  const yard = new THREE.Group(); yard.visible = false; root.add(yard);
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0.05, emissive: o.em ? new THREE.Color(c) : new THREE.Color(0), emissiveIntensity: o.em || 0 }); mats.push(m); return m; };
  const WOOD = M(0xb98a55, { rough: 0.85 }), WOODD = M(0x8a6a44, { rough: 0.9 }), PLY = M(0xd2b07a, { rough: 0.85 }), RUST = M(0x6e4a36, { metal: 0.35, rough: 0.75 }), GALV = M(0xb3b8bf, { metal: 0.6, rough: 0.35 });
  const STL = M(0x5c6672, { metal: 0.55, rough: 0.5 }), BLOCK = M(0xb5b1a8, { rough: 0.95 }), BRICK = M(0xa4553a, { rough: 0.9 }), BAG = M(0xe6dfcd, { rough: 0.95 }), YEL = M(0xf0b429, { metal: 0.2, rough: 0.55 });
  const FACE = M(0x8c6a3f, { rough: 0.7 }), SAND = M(0xc9ab79, { rough: 1 }), GRAV = M(0x8e8b86, { rough: 1 }), DRUM = M(0x9a6b3f, { rough: 0.8 }), CABLE = M(0x1f2124, { rough: 0.6 });
  const BLUE = M(0x2d6fb7, { rough: 0.6 }), WHITE = M(0xeef0f2, { rough: 0.6 }), DARK = M(0x34373c, { metal: 0.3, rough: 0.6 }), LAMP = M(0xfff4d6, { em: 0.5, rough: 0.3 });
  const ORNG = M(0xff6a1a, { rough: 0.6 }), SKIPC = M(0x3e7d4f, { metal: 0.3, rough: 0.6 }), DEB = M(0x7d756b, { rough: 1 });
  const CONT = [0x2f5f8f, 0x8f3a2f, 0x3f6f4a, 0xb5651d].map(c => M(c, { metal: 0.35, rough: 0.55 }));

  // 종류마다: [형상, 재질] 부품들을 같은 행렬로 인스턴스
  const kinds = {};
  const K = (name, parts, cap, win) => { const ims = parts.map(([s, m]) => { const g = s.done(); geos.push(g); const im = new THREE.InstancedMesh(g, m, cap); im.count = 0; im.frustumCulled = false; yard.add(im); return im; }); kinds[name] = { ims, cap, n: 0, win, size: null }; return kinds[name]; };
  const r = R0;
  K('timber', [[P.timber(r), WOOD], [P.dunnage(shape(), 4, 1.2, 3), WOODD]], 6, [0, 0.95]);
  K('ply', [[P.ply(), PLY], [P.dunnage(shape(), 2.4, 1.2, 3), WOODD]], 4, [0, 0.9]);
  K('rebar', [[P.rebar(), RUST], [P.ties(shape(), 9), DARK]], 5, [0, 0.85]);
  K('pipes', [[P.pipes(), GALV]], 4, [0.2, 1.4]);
  K('hbeam', [[P.hbeam(), STL]], 4, [0, 0.8]);
  K('blocks', [[P.blocks(), BLOCK], [P.pallet(shape()), WOOD]], 8, [0.5, 1.6]);
  K('bricks', [[P.blocks(0.19, 0.057, 0.09, 12), BRICK], [P.pallet(shape()), WOOD]], 6, [0.6, 1.6]);
  K('bags', [[P.bags(), BAG], [P.pallet(shape()), WOOD]], 6, [0.3, 1.6]);
  K('panels', [[P.panels(), YEL], [P.panelFace(), FACE]], 6, [0, 0.9]);
  K('sand', [[P.pile(r), SAND]], 2, [0, 1.6]);
  K('gravel', [[P.pile(r, 2.6, 1.0, 2.2), GRAV]], 2, [0, 1.6]);
  K('drum', [[P.drum(), DRUM], [P.drumCable(), CABLE]], 4, [0.5, 1.6]);
  CONT.forEach((m, i) => K('cont' + i, [[P.container(), m]], 2, [0, 1.6]));
  K('toilet', [[P.toilet(), BLUE], [P.toiletRoof(), WHITE]], 4, [0, 1.6]);
  K('light', [[P.lightTower(), YEL], [P.lamps(), LAMP]], 3, [0, 1.6]);
  K('skip', [[P.skip(), SKIPC], [P.debris(r), DEB]], 2, [0.1, 1.6]);
  K('cone', [[P.cone(), ORNG], [P.coneBand(), WHITE]], 40, [0, 1.6]);
  K('barrier', [[P.barrier(), ORNG]], 16, [0, 1.6]);
  K('barrierW', [[P.barrier(), WHITE]], 16, [0, 1.6]);

  // ---------- 자리 잡기: 땅에 닿는 저층부 바깥의 띠 (뒤·왼쪽 = 큰 것, 앞 = 낮은 것) ----------
  const low = D.fp.filter((q, i) => sc.floors[i] && sc.floors[i].e0 < 6);
  const ex0 = Math.min(G.bx0, ...low.map(q => q.x0)), ex1 = Math.max(G.bx1, ...low.map(q => q.x1)), ez0 = Math.min(-bd / 2, ...low.map(q => q.z0)), ez1 = Math.max(bd / 2, ...low.map(q => q.z1));
  const crane = ['tower', 'luffing'].includes(sc.ids.lift) ? [sc.crX, -bd / 2 - 5] : null;
  const blocked = (x0, x1, z0, z1) => {
    if (x0 < 1 || x1 > pw - 1 || z0 < -pd / 2 + 1 || z1 > pd / 2 - 1) return true;
    if (x1 > ex0 - 0.8 && x0 < ex1 + 0.8 && z1 > ez0 - 0.8 && z0 < ez1 + 0.8) return true; // 건물
    if (crane && x1 > crane[0] - 4.5 && x0 < crane[0] + 4.5 && z1 > crane[1] - 4.5 && z0 < crane[1] + 4.5) return true; // 크레인 기초
    if (x1 > G.bx1 - 0.5 && x0 < G.bx1 + 6 && z1 > -3 && z0 < 6) return true; // 호이스트
    if (x1 > pw - 15) return true; // 게이트·하역·진입 동선 (도로 쪽)
    return placed.some(([a, b, c, d]) => x1 > a && x0 < b && z1 > c && z0 < d);
  };
  const placed = [];
  // 띠: [x0, x1, z0, z1, 긴 방향]
  const strips = [
    [1, pw - 15, -pd / 2 + 1, ez0 - 0.8, 'x', 'back'],
    [1, ex0 - 0.8, -pd / 2 + 1, pd / 2 - 1, 'z', 'left'],
    [1, pw - 15, ez1 + 0.8, pd / 2 - 1, 'x', 'front'],
  ].filter(q => q[1] - q[0] > 2.4 && q[3] - q[2] > 2.4);
  const FOOT = { timber: [4.3, 1.5], ply: [2.6, 1.4], rebar: [9.4, 1.8], pipes: [6.3, 1.5], hbeam: [8.3, 1.9], blocks: [1.4, 1.3], bricks: [1.4, 1.3], bags: [1.4, 1.3], panels: [2.9, 0.9], sand: [6.8, 5.6], gravel: [5.6, 4.8], drum: [1.9, 1.2], cont0: [6.3, 2.7], cont1: [6.3, 2.7], cont2: [6.3, 2.7], cont3: [6.3, 2.7], toilet: [1.5, 1.5], light: [3.2, 3.6], skip: [3.6, 2.1] };
  const tall = new Set(['cont0', 'cont1', 'cont2', 'cont3', 'toilet', 'light', 'skip', 'sand', 'gravel']);
  const steel = ['steel', 'hybrid', 'stick', 'truss', 'module', 'src'].includes(sc.ids.frame);
  const order = ['cont0', 'toilet', 'toilet', 'rebar', 'timber', 'panels', steel ? 'hbeam' : 'rebar', 'sand', 'blocks', 'blocks', 'bags', 'pipes', 'ply', 'drum', 'light', 'skip', 'bricks', 'bricks', 'timber', 'gravel', 'cont1', 'panels', 'drum', steel ? 'hbeam' : 'timber', 'blocks', 'bags', 'pipes', 'cont2', 'ply', 'light', 'cont3', 'bricks'];
  const items = [];
  const tryPut = (kind, strip) => {
    const [sx0, sx1, sz0, sz1, ax, side] = strip, [fl, fw] = FOOT[kind];
    if (side === 'front' && tall.has(kind)) return false;
    const along = ax === 'x', hx = (along ? fl : fw) / 2, hz = (along ? fw : fl) / 2, yaw = along ? 0 : Math.PI / 2;
    // 펜스 쪽부터 두 줄 (앞 띠는 앞 펜스 쪽)
    const rows = along ? (side === 'front' ? [sz1 - hz - 0.2, sz1 - 3 * hz - 1.4] : [sz0 + hz + 0.2, sz0 + 3 * hz + 1.4]) : [sx0 + hx + 0.2, sx0 + 3 * hx + 1.4];
    for (const c of rows) {
      const a0 = (along ? sx0 + hx : sz0 + hz) + 0.3, a1 = along ? sx1 - hx : sz1 - hz;
      for (let u = a0; u <= a1; u += 0.7) {
        const x = along ? u : c, z = along ? c : u;
        if (x - hx < sx0 || x + hx > sx1 || z - hz < sz0 || z + hz > sz1) continue;
        const bx0 = x - hx - 0.35, bx1 = x + hx + 0.35, bz0 = z - hz - 0.35, bz1 = z + hz + 0.35;
        if (blocked(bx0, bx1, bz0, bz1)) continue;
        placed.push([bx0, bx1, bz0, bz1]); items.push({ kind, x, z, yaw: yaw + (R0() < 0.5 ? 0 : Math.PI) + (R0() - 0.5) * 0.06 }); return true;
      }
    }
    return false;
  };
  order.forEach((k, i) => { for (let t = 0; t < strips.length; t++) if (tryPut(k, strips[(i + t) % strips.length])) break; });
  // 물통 바리케이드 (건물 앞 보행 통로 경계) · 라바콘 (크레인 기초 둘레, 바리케이드 끝)
  const lineOf = (x0, z0, x1, z1, step, fn) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / step); for (let i = 0; i <= n; i++) fn(x0 + (x1 - x0) * i / Math.max(1, n), z0 + (z1 - z0) * i / Math.max(1, n), Math.atan2(-(z1 - z0), x1 - x0), i, n); };
  if (ez1 + 3 < pd / 2 - 1) lineOf(Math.max(2, ex0), ez1 + 1.6, Math.min(pw - 16, ex1), ez1 + 1.6, 1.85, (x, z, a, i, n) => { if (blocked(x - 0.9, x + 0.9, z - 0.25, z + 0.25)) return; items.push({ kind: i % 2 ? 'barrierW' : 'barrier', x, z, yaw: a }); if (i === 0 || i === n) items.push({ kind: 'cone', x: x + (i ? 1.4 : -1.4), z, yaw: 0 }); });
  if (crane) [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => items.push({ kind: 'cone', x: crane[0] + a * 3.9, z: crane[1] + b * 3.9, yaw: 0 }));
  // 인스턴스 행렬 (한 번만): 지금 보일 것만 세어 앞쪽으로 모은다
  const Mx = new THREE.Matrix4(), Qq = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), YA = new THREE.Vector3(0, 1, 0);
  let lastKey = '';
  function frame(st) {
    const on = !!st.on; yard.visible = on; if (!on) return;
    const ph = st.phase; // 0 골조 시작 ~ 1 골조 끝 ~ 1.6 마감 끝
    const key = items.map(it => (ph >= kinds[it.kind].win[0] && ph <= kinds[it.kind].win[1]) ? 1 : 0).join('');
    if (key === lastKey) return; lastKey = key;
    Object.values(kinds).forEach(k => { k.n = 0; });
    items.forEach(it => { const k = kinds[it.kind]; if (!(ph >= k.win[0] && ph <= k.win[1]) || k.n >= k.cap) return; Qq.setFromAxisAngle(YA, it.yaw); Mx.compose(V.set(it.x, 0.02, it.z), Qq, S1); k.ims.forEach(im => im.setMatrixAt(k.n, Mx)); k.n++; });
    Object.values(kinds).forEach(k => k.ims.forEach(im => { im.count = k.n; im.instanceMatrix.needsUpdate = true; }));
  }
  return { frame, group: yard, count: items.length, dispose() { geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); } };
}
