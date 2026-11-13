// 3D 시공 시뮬레이션 (three.js).
// 2D 단면과 같은 장면(sc)과 같은 시각(τ)을 입체로 그린다. 땅은 z=0에서 반으로 잘라 지층·지하수·흙막이·지하 구조를 단면으로 보이고,
// 지상은 층마다 골조 → 거푸집·철근·타설 → 외장 → 설비 → 마감 → 시운전이 4D 공정 진행대로 쌓인다.
// 지금 고르는 공종은 강조색, 실내 공종을 볼 때는 건물 앞쪽 절반을 잘라 속을 보인다.
// 판정 번호는 2D와 같은 위치(단면 좌표)에 HTML 표식으로 띄운다.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { progAt, focusOf, winFor, CUT_WPS, UNDER_WPS } from './buildsim.js';
import { WP_BY_ID } from '../sim/methods.js';
import { dateAt, ym } from '../sim/process.js';
import { HOIST, elevSpeed } from '../sim/impact-more.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MEPS = ['hvac', 'plumb', 'fire', 'elec', 'ict'], ROOMS = ['part', 'floor', 'ceil', 'paint'];
const DIM_FOR_MEP = new Set([...MEPS, 'mep', 'part', 'paint', 'ceil', 'floor', 'comm', 'insul', 'glaz', 'elev']);
const DIM_FOR_ROOM = new Set([...MEPS, 'mep', 'insul', 'glaz', 'comm']);
const lerp = (a, b, t) => a + (b - a) * t;

export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}

// ---------- 치수 (node에서도 계산되도록 three와 분리) ----------
export function plan3d(sc) {
  const { G, nb } = sc;
  const r = G.main && G.main.rect ? G.main.rect : null;
  const du = r ? r.u1 - r.u0 : G.bw, dv = r ? r.v1 - r.v0 : G.bw;
  const bw = G.bx1 - G.bx0, bd = clamp(Math.max(du, dv, bw), 12, 110);
  const pd = clamp(Math.max(bd + 10, Math.min(G.pw, bd * 1.5)), 30, 160);
  const Z = pd / 2 + 26;
  const xl = Math.min(nb.x0 - 10, -34), xr = G.pw + 44;
  const bays = Math.max(2, Math.round(bw / 8.4)), baysZ = Math.max(2, Math.round(bd / 8.4));
  const colX = Array.from({ length: bays + 1 }, (_, i) => G.bx0 + bw * i / bays);
  const colZ = Array.from({ length: baysZ + 1 }, (_, i) => -bd / 2 + bd * i / baysZ);
  const cz = Math.max(3, bd * 0.16);
  const pod = G.podium ? G.podium.h : 0;
  const fp = sc.floors.map(f => (pod > 0 && f.e1 <= pod + 0.1 ? { x0: 1, x1: G.pw - 1, z0: -pd / 2 + 1, z1: pd / 2 - 1 } : { x0: G.bx0, x1: G.bx1, z0: -bd / 2, z1: bd / 2 }));
  const fh = sc.floors.map(f => f.e1 - f.e0);
  const ok = [bw, bd, pd, Z, xl, xr].every(Number.isFinite) && sc.floors.every(f => Number.isFinite(f.e0) && Number.isFinite(f.e1));
  return { bw, bd, pd, Z, xl, xr, colX, colZ, cz, pod, fp, fh, ok };
}

// ---------- 색 ----------
const COL = {
  fill: 0x9c8462, sand: 0xc9a86a, clay: 0x8f6e4e, soil: 0xa88a5e, wr: 0x7a7f8a, rock: 0x4c4f57,
  conc: 0xa3a3a8, slab: 0xbdbdc2, dark: 0x5f6066, steel: 0x8fa1b5, glass: 0x7fb6e6, water: 0x3d8fd6,
  ins: 0xf2c94c, wp: 0x2b2b2b, wood: 0xc58a4a, gyp: 0xe7e7ea, red: 0xe5484d, orange: 0xffb547, green: 0x3fae6a,
  purple: 0xb28cf2, yellow: 0xffd76a, eq: 0xf0b429, truck: 0xd9d9de, road: 0x34363b, nb: 0x6e737c, rebar: 0xd9822b,
  tree: 0x3fae6a, trunk: 0x8b6f3a, pave: 0x8a8f99, form: 0x9fb3c8, glow: 0xffd76a,
};
const SKIN_C = { unitcw: [COL.glass, 0.32], cw: [COL.glass, 0.32], stick: [COL.glass, 0.32], dsf: [COL.glass, 0.3], pcpanel: [0xb5b2aa, 1], metal: [0x9fb0c2, 1], wet: [0xc9b48c, 1], stone: [0xd8cdb8, 1], gfrc: [0xd9d4c8, 1] };
const WALL_C = { dwall: 0x77777d, scw: 0x8d8a82, cip: 0x86868c, hpile: 0x7d8894, sheet: 0x7d8894, nail: 0x9a9aa0 };
const PILE_C = { phc: 0xb8b8bc, bored: 0x9a9aa0, steel: 0x8fa1b5, micro: 0x8fa1b5, piledraft: 0xa3a3a8 };
const FLOOR_C = { wet: 0xb0aba0, dryondol: COL.wood, oa: 0x8fa1b5, epoxy: COL.green, polish: 0xc9ccd3, stone: 0xd8cdb8, tile: 0x7b8ea6 };
const PART_C = { block: 0x9a9aa0, dry: 0xe7e7ea, alc: 0xc9c4b8, module: 0xb9a77f, cleanp: 0xc9d5e3 };
const ROOF_C = { asphalt: 0x9a9aa0, urethane: COL.green, hybrid: 0x2f8f5a, metal: 0x9fb0c2, green: 0x5a8a3a, pv: 0x253a6e };
const BWP_C = { sheet: 0x2b2b2b, pre: 0x2f7fd0, bento: 0xa67c3d, cryst: 0x8fa1b5, tank: 0xa3a3a8 };

// ---------- 3D 뷰 ----------
export function createSim3D(host, opts = {}) {
  const css = getComputedStyle(host);
  const cv = (k, d) => (css.getPropertyValue(k) || '').trim() || d;
  const ACC = new THREE.Color(cv('--accent', '#ff4d5e'));
  const BG = new THREE.Color(cv('--paper', '#0b0c0e'));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BG, 1);
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const wrap = document.createElement('div'); wrap.className = 's3';
  wrap.innerHTML = `<div class="s3-hud"><span class="s3-c"></span><b class="s3-t"></b></div><div class="s3-hud r"><span class="s3-d"></span><b class="s3-day"></b></div>
    <div class="s3-lbs"></div><div class="s3-mks"></div><div class="s3-help">드래그 회전 · 휠/두 손가락 확대 · 우클릭 이동</div><button type="button" class="chipbtn s3-fit">시점 맞춤</button>`;
  wrap.prepend(renderer.domElement);
  host.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 600, 1400);
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.5, 4000);
  const ctl = new OrbitControls(cam, renderer.domElement);
  ctl.enableDamping = true; ctl.dampingFactor = 0.09; ctl.maxPolarAngle = Math.PI * 0.495; ctl.minDistance = 8; ctl.maxDistance = 1600; ctl.screenSpacePanning = true;
  scene.add(new THREE.HemisphereLight(0xf2f4ff, 0x40362a, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.8, 1.6, 1.1); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.45); fill.position.set(-1.2, 0.6, -0.8); scene.add(fill);

  let userMoved = false, follow = { t: new THREE.Vector3(), has: false }, lastWp = null, built = null, disposed = false;
  ctl.addEventListener('start', () => { userMoved = true; });
  $('.s3-fit').addEventListener('click', () => { userMoved = false; lastWp = null; });

  // 공유 형상·재질
  const BOX = new THREE.BoxGeometry(1, 1, 1); BOX.translate(0, 0, 0);
  const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const CONE = new THREE.ConeGeometry(0.5, 1, 8);
  const mats = new Map(), accMats = new Map(), all = [];
  const clipZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.02); // z ≤ 0 만 남김
  const clipList = [];
  function mat(color, o = {}) {
    const key = `${color}|${o.op ?? 1}|${o.em ?? 0}|${o.clip ? 1 : 0}|${o.wire ? 1 : 0}`;
    if (mats.has(key)) return mats.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.82, metalness: o.metal ?? 0.05, transparent: (o.op ?? 1) < 1, opacity: o.op ?? 1, depthWrite: (o.op ?? 1) >= 1, emissive: o.em ? new THREE.Color(color) : new THREE.Color(0), emissiveIntensity: o.em || 0, wireframe: !!o.wire, side: (o.op ?? 1) < 1 ? THREE.DoubleSide : THREE.FrontSide });
    if (o.clip) { m.clippingPlanes = []; clipList.push(m); }
    mats.set(key, m); return m;
  }
  const dimMats = new Map();
  function dimOf(m) {
    if (dimMats.has(m)) return dimMats.get(m);
    const a = m.clone(); a.transparent = true; a.opacity = Math.min(m.opacity, 0.14); a.depthWrite = false; if (m.clippingPlanes) { a.clippingPlanes = m.clippingPlanes; clipList.push(a); }
    dimMats.set(m, a); return a;
  }
  function accOf(m) {
    if (accMats.has(m)) return accMats.get(m);
    const a = m.clone(); a.color = m.color.clone().lerp(ACC, 0.6); a.emissive = ACC.clone(); a.emissiveIntensity = 0.12; if (m.clippingPlanes) { a.clippingPlanes = m.clippingPlanes; clipList.push(a); }
    accMats.set(m, a); return a;
  }
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const setBox = (o, x0, x1, y0, y1, z0, z1) => { o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); o.scale.set(Math.max(1e-3, Math.abs(x1 - x0)), Math.max(1e-3, Math.abs(y1 - y0)), Math.max(1e-3, Math.abs(z1 - z0))); };
  const ibox = (im, i, x0, x1, y0, y1, z0, z1, rx = 0, rz = 0) => { if (i >= im.instanceMatrix.count) return; _p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); _s.set(Math.max(1e-3, Math.abs(x1 - x0)), Math.max(1e-3, Math.abs(y1 - y0)), Math.max(1e-3, Math.abs(z1 - z0))); _q.setFromEuler(_e.set(rx, 0, rz)); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); };

  // ---------- 장면 짓기 (sc가 바뀔 때만) ----------
  function build(sc) {
    if (built) { scene.remove(built.root); built.dispose(); }
    const D = plan3d(sc), { G, nb, cond, ids } = sc, NF = sc.NF;
    const root = new THREE.Group(); scene.add(root);
    const owned = []; // 이 장면이 만든 InstancedMesh (dispose용)
    const byWp = new Map();
    const tag = (o, wp) => { o.userData.wp = wp; o.userData.base = o.material; if (!byWp.has(wp)) byWp.set(wp, []); byWp.get(wp).push(o); return o; };
    const mesh = (geo, m, wp, parent = root) => { const o = new THREE.Mesh(geo, m); parent.add(o); if (wp) tag(o, wp); return o; };
    const box = (m, wp, x0, x1, y0, y1, z0, z1, parent) => { const o = mesh(BOX, m, wp, parent); setBox(o, x0, x1, y0, y1, z0, z1); return o; };
    const inst = (geo, m, n, wp, parent = root) => { const o = new THREE.InstancedMesh(geo, m, Math.max(1, n)); o.count = 0; o.frustumCulled = false; (parent || root).add(o); owned.push(o); if (wp) tag(o, wp); return o; };
    const pw = G.pw, depth = G.depth, pd = D.pd, Z = D.Z, bd = D.bd;

    // --- 땅: 뒤쪽 절반만 (z ≤ 0). 구덩이 자리는 굴착 깊이만큼 비운다 ---
    const ground = new THREE.Group(); root.add(ground);
    const strata = sc.strata.filter(([a]) => a < sc.dv).map(([a, b, k]) => ({ a, b: Math.min(b, sc.dv), m: mat(COL[k] ?? COL.soil, { rough: 0.95 }), pieces: [] }));
    strata.forEach(L => { for (let i = 0; i < 4; i++) L.pieces.push(mesh(BOX, L.m, null, ground)); });
    // 지층 경계선 (단면 앞면)
    const bnd = inst(BOX, mat(0xe7e2d6, { em: 0.25 }), strata.length, null);
    strata.slice(1).forEach((L, i) => ibox(bnd, i, D.xl, D.xr, -L.a - 0.08, -L.a + 0.08, 0, 0.12)); bnd.count = Math.max(0, strata.length - 1);
    // 앞쪽 절반: 얇은 지표면만 (대지 밖)
    const surfM = mat(0x6f6455, { rough: 1 });
    const front = [box(surfM, null, D.xl, 0, -0.5, 0, 0, Z, ground), box(surfM, null, pw, D.xr, -0.5, 0, 0, Z, ground), box(surfM, null, 0, pw, -0.5, 0, pd / 2, Z, ground)];
    const pitLid = box(surfM, null, 0, pw, -0.5, 0, 0, pd / 2, ground);
    // 지하수위: 단면에 파란 띠
    const gwM = mat(COL.water, { em: 0.4 });
    const gwLine = box(gwM, null, D.xl, D.xr, -cond.gw - 0.12, -cond.gw + 0.12, 0, 0.25, ground);
    // 도로·인접 건물
    box(mat(COL.road, { rough: 0.9 }), null, pw + 7, pw + 31, 0, 0.12, -Z, Z);
    const lane = inst(BOX, mat(0xe7e7ea, { em: 0.2 }), 24, null); for (let i = 0; i < 24; i++) ibox(lane, i, pw + 18.8, pw + 19.2, 0.12, 0.16, -Z + i * (2 * Z / 24), -Z + i * (2 * Z / 24) + 3); lane.count = 24;
    const nbM = mat(COL.nb, { rough: 0.7 });
    box(nbM, null, nb.x0, nb.x1, -nb.b, nb.h, -pd / 2 + 2, pd / 2 - 8);
    const nbWin = inst(BOX, mat(0x9fc4e6, { em: 0.25 }), 80, null); { let n = 0; for (let e = 2; e < nb.h - 1 && n < 80; e += 3.2) for (let j = 0; j < 4 && n < 80; j++) ibox(nbWin, n++, nb.x0 + 2 + j * (nb.x1 - nb.x0 - 4) / 4, nb.x0 + 1 + (j + 1) * (nb.x1 - nb.x0 - 4) / 4, e, e + 1.4, pd / 2 - 8.05, pd / 2 - 7.9); nbWin.count = n; }

    // --- 지반조사·개량 (단면 앞면에 한 줄) ---
    const bores = []; { const n = ids.survey === 'ai' ? 5 : ids.survey === 'spt' ? 3 : 4; for (let i = 0; i < n; i++) bores.push(-2 + (pw + 4) * (i + 0.5) / n); }
    const boreM = mat(0xe7e7ea, { em: 0.3 });
    const boreI = inst(CYL, boreM, bores.length, 'survey');
    const rigI = inst(BOX, mat(COL.eq, { metal: 0.3 }), bores.length * 2, 'survey');
    const impM = mat(0xb0aba0, { op: 0.85 }), impXs = []; for (let x = -4; x <= pw + 4; x += ids.improve === 'dcm' ? 5 : 3) impXs.push(x);
    const impI = inst(CYL, impM, impXs.length, 'improve');

    // --- 흙막이 (뒤쪽 절반: 좌·우·뒤) ---
    const th = Math.max(sc.wallTh, 0.3);
    const wallM = mat(WALL_C[ids.wall] ?? 0x86868c, { metal: ids.wall === 'hpile' || ids.wall === 'sheet' ? 0.4 : 0.05 });
    const walls = [0, 1, 2].map(() => mesh(BOX, wallM, 'wall'));
    const capM = mat(0x77777d);
    // 지보: 버팀보·띠장 (층마다), 어스앵커 (단면 앞면), 역타 슬래브
    const lv = []; if (depth > 0.5) for (let m = 1.5; m < depth - 1; m += 3.5) lv.push(m);
    const strutZ = []; for (let z = -pd / 2 + 4; z < -2; z += 8) strutZ.push(z);
    const supM = mat(ids.support === 'sps' ? 0x9fb3c8 : 0xcf6a3a, { metal: 0.45, rough: 0.5 });
    const strutI = inst(BOX, supM, lv.length * (strutZ.length + 3), 'support');
    const ancI = inst(CYL, mat(0xd9d9de, { metal: 0.5 }), lv.length * 2, 'support');
    const tdSlab = inst(BOX, mat(COL.slab), Math.max(1, G.nB) + 1, 'support');
    // 굴착 장비
    const exM = mat(COL.eq, { metal: 0.3, rough: 0.5 });
    const exc = new THREE.Group(); root.add(exc);
    const exBody = mesh(BOX, exM, 'excav', exc); exBody.scale.set(3.4, 1.8, 2.6); exBody.position.y = 1.8;
    const exTrack = mesh(BOX, mat(0x3a3a3f), null, exc); exTrack.scale.set(4.6, 0.9, 3); exTrack.position.y = 0.45;
    const exArm = mesh(BOX, exM, 'excav', exc); exArm.scale.set(4.2, 0.45, 0.45);
    const exArm2 = mesh(BOX, exM, 'excav', exc); exArm2.scale.set(3, 0.4, 0.4);
    const trucks = []; for (let i = 0; i < 4; i++) { const t = new THREE.Group(); root.add(t); const b = mesh(BOX, mat(COL.truck, { metal: 0.3 }), null, t); b.scale.set(2.4, 2, 5.2); b.position.set(0, 1.6, -0.8); const cab = mesh(BOX, mat(0xd9822b), null, t); cab.scale.set(2.4, 2.2, 1.8); cab.position.set(0, 1.7, 2.6); const ld = mesh(BOX, mat(0x8a7a64), null, t); ld.scale.set(2.2, 0.6, 4.8); ld.position.set(0, 2.9, -0.8); t.userData.load = ld; trucks.push(t); }

    // --- 기초: 말뚝 (단면 앞면 한 줄 + 뒤쪽 절반 격자) · 매트 ---
    const plen = Math.max(5, Math.min(sc.dv - depth - 2, Math.max(cond.rockDepth - depth + 2, 9)));
    const pileXs = []; { const n = ids.found === 'micro' ? 16 : ids.found === 'piledraft' ? 6 : ids.found === 'bored' ? 7 : 10; for (let i = 0; i < n; i++) pileXs.push(3 + (pw - 6) * i / (n - 1)); }
    const pileW = ids.found === 'bored' ? 1.5 : ids.found === 'micro' ? 0.3 : ids.found === 'steel' ? 0.6 : 0.6;
    const pileI = inst(CYL, mat(PILE_C[ids.found] ?? 0xb8b8bc), pileXs.length, 'found');
    const thick = sc.d.superTall ? 3.5 : sc.d.tall ? 2.6 : sc.d.heavy ? 2 : 1.4;
    const matM = mat(0x8d8d93);
    const matSlab = mesh(BOX, matM, 'found');
    const rig = new THREE.Group(); root.add(rig); { const m2 = mat(COL.eq, { metal: 0.3 }); const b2 = mesh(BOX, m2, 'found', rig); b2.scale.set(3, 2, 3); b2.position.y = 1.4; const ms = mesh(BOX, m2, 'found', rig); ms.scale.set(0.5, 18, 0.5); ms.position.set(0.8, 11, 0); rig.userData.mast = ms; }

    // --- 지하 방수 · 지하 골조 (뒤쪽 절반) ---
    const bwpM = mat(BWP_C[ids.bwp] ?? 0x2b2b2b, { rough: 0.6 });
    const bwpI = inst(BOX, bwpM, 4, 'bwp');
    const nB = Math.max(1, G.nB), bsh = depth / nB;
    const bslab = inst(BOX, mat(COL.slab), nB + 1, 'base');
    const bwallI = inst(BOX, mat(COL.conc), 3, 'base');
    const bcolI = inst(BOX, mat(COL.conc), 7 * Math.max(2, strutZ.length), 'base');

    // --- 지상 골조 (층마다) ---
    const clipM = (c, o = {}) => mat(c, { ...o, clip: true });
    const slabI = inst(BOX, clipM(COL.slab), NF, 'frame');
    const steelF = ['steel', 'hybrid', 'stick', 'truss', 'module'].includes(ids.frame);
    const colPer = D.fp.map(f => (f.x1 - f.x0 > (G.bx1 - G.bx0) + 1 ? Math.max(3, Math.round((f.x1 - f.x0) / 8.4)) + 1 : D.colX.length) * D.colZ.length);
    const colOff = [0]; colPer.forEach((n, i) => colOff.push(colOff[i] + n));
    const colI = inst(BOX, clipM(steelF ? COL.steel : COL.conc, { metal: steelF ? 0.5 : 0.05 }), colOff[NF], 'frame');
    sc.floors.forEach((f, i) => {
      const fp = D.fp[i], nx = Math.max(3, Math.round((fp.x1 - fp.x0) / 8.4)), xs = fp.x1 - fp.x0 > (G.bx1 - G.bx0) + 1 ? Array.from({ length: nx + 1 }, (_, j) => fp.x0 + (fp.x1 - fp.x0) * j / nx) : D.colX;
      const zs = D.colZ.map(z => clamp(z, fp.z0, fp.z1));
      let k = colOff[i]; const w = steelF ? 0.5 : 0.8;
      xs.forEach(x => zs.forEach(z => ibox(colI, k++, x - w / 2, x + w / 2, f.e0 + 0.18, f.e1 - 0.32, z - w / 2, z + w / 2)));
      ibox(slabI, i, fp.x0, fp.x1, f.e1 - 0.32, f.e1 + 0.18, fp.z0, fp.z1);
    });
    // 코어 (속이 빈 네 벽)
    const coreM = clipM(0x8d8d93);
    const core = [0, 1, 2, 3].map(() => mesh(BOX, coreM, 'frame'));
    // 미정 골조: 외곽선
    const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(BOX), new THREE.LineBasicMaterial({ color: 0x9a9aa0, transparent: true, opacity: 0.55 }));
    setBox(ghost, G.bx0, G.bx1, 0, G.H, -bd / 2, bd / 2); root.add(ghost);
    // 거푸집·철근·타설 (지금 층)
    const formM = clipM(COL.form, { op: 0.45 }), formBox = mesh(BOX, formM, 'form');
    const acs = mesh(BOX, clipM(COL.orange, { op: 0.7 }), 'form');
    const shoreI = inst(BOX, clipM(0xffb547), 120, 'form');
    const rebarTex = gridTex('#d9822b', 8); rebarTex.wrapS = rebarTex.wrapT = THREE.RepeatWrapping; rebarTex.repeat.set((G.bx1 - G.bx0) / 1.2, bd / 1.2);
    const rebarM = new THREE.MeshBasicMaterial({ map: rebarTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [] }); clipList.push(rebarM);
    const rebarP = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), rebarM); root.add(rebarP); tag(rebarP, 'rebar');
    const pourM = clipM(0x8d8d93), pourBox = mesh(BOX, pourM, 'pour');
    const cageI = inst(BOX, clipM(COL.rebar), 6, 'rebar');
    // 철골 용접 불꽃
    const sparkI = inst(BOX, mat(0xffb547, { em: 1.2 }), 40, 'steel');
    // 펌프카 (붐) · 믹서
    const pump = new THREE.Group(); root.add(pump);
    { const pm = mat(0xe7e7ea, { metal: 0.3 }); const b2 = mesh(BOX, pm, 'pour', pump); b2.scale.set(2.5, 2.4, 9); b2.position.y = 1.6; }
    const boom = [0, 1, 2].map(() => mesh(BOX, mat(COL.eq, { metal: 0.3 }), 'pour', pump));
    const mixers = [0, 1].map(() => { const t = new THREE.Group(); root.add(t); const d = mesh(CYL, mat(0xe7e7ea, { metal: 0.3 }), null, t); d.scale.set(2.2, 4.6, 2.2); d.rotation.x = Math.PI / 2 - 0.25; d.position.set(0, 2.6, -0.6); const cb = mesh(BOX, mat(0xd9822b), null, t); cb.scale.set(2.3, 2.1, 1.7); cb.position.set(0, 1.6, 3); return t; });

    // --- 타워크레인 ---
    const crane = new THREE.Group(); root.add(crane);
    const crM = mat(COL.eq, { metal: 0.35, rough: 0.5 });
    const mast = mesh(BOX, mat(COL.eq, { wire: true }), 'lift', crane); const mastS = mesh(BOX, crM, 'lift', crane);
    const slew = new THREE.Group(); crane.add(slew);
    const jib = mesh(BOX, crM, 'lift', slew), cjib = mesh(BOX, crM, 'lift', slew), cwt = mesh(BOX, mat(0x77777d), null, slew), cab = mesh(BOX, mat(0xe7e7ea), null, slew), apex = mesh(BOX, crM, 'lift', slew);
    const hookL = mesh(BOX, mat(0x222222), null, slew), hookLoad = mesh(BOX, mat(0x8fa1b5, { metal: 0.4 }), null, slew);
    const crGhost = new THREE.LineSegments(new THREE.EdgesGeometry(BOX), new THREE.LineBasicMaterial({ color: 0x9a9aa0, transparent: true, opacity: 0.45 })); root.add(crGhost);

    // --- 호이스트 · 승강기 ---
    const hMast = mesh(BOX, mat(0x77777d, { wire: true }), 'hoist'), hCar = mesh(BOX, mat(COL.eq, { metal: 0.2 }), 'hoist'), hCar2 = mesh(BOX, mat(COL.eq, { metal: 0.2 }), 'hoist');
    const elevI = inst(BOX, clipM(0xe7e7ea, { metal: 0.4 }), 4, 'elev');

    // --- 외장 (층마다: 앞뒤 · 양옆) ---
    const [skC, skOp] = SKIN_C[ids.skin] || [COL.glass, 0.35];
    const glassy = skOp < 1;
    const texX = glassy ? gridTex('#d6e4f2', 4, 0.9) : gridTex('#6b6b70', 2, 0.6), texZ = texX.clone();
    const fH = D.fh.length ? D.fh.reduce((a, b) => a + b, 0) / D.fh.length : 4;
    [texX, texZ].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; });
    texX.repeat.set((G.bx1 - G.bx0) / (glassy ? 1.5 : 3), 1); texZ.repeat.set(bd / (glassy ? 1.5 : 3), 1);
    const skinMat = (tex) => { const m = new THREE.MeshStandardMaterial({ color: skC, map: tex, transparent: glassy, opacity: skOp, depthWrite: !glassy, roughness: glassy ? 0.15 : 0.8, metalness: glassy ? 0.3 : 0.05, side: THREE.DoubleSide, clippingPlanes: [] }); clipList.push(m); return m; };
    const skinX = inst(BOX, skinMat(texX), NF * 2, 'skin'), skinZ = inst(BOX, skinMat(texZ), NF * 2, 'skin');
    // 창호·단열 (외장 안쪽 띠): 창호는 외장 띠 위에 테두리, 단열은 노란 층
    const glazI = inst(BOX, clipM(0xe7e7ea, { metal: 0.4 }), NF * 4, 'glaz');
    const insI = inst(BOX, clipM(COL.ins), NF * 2, 'insul');
    // 지붕
    const roofL = mesh(BOX, clipM(ROOF_C[ids.roof] ?? 0x9a9aa0), 'roof');
    const parI = inst(BOX, clipM(COL.conc), 4, 'roof');
    const pvI = inst(BOX, mat(0x253a6e, { metal: 0.6, rough: 0.3 }), 60, 'roof');
    const ctI = inst(CYL, mat(0xd9d9de, { metal: 0.3 }), 8, 'hvac');
    const oduI = inst(BOX, mat(0xd9d9de, { metal: 0.3 }), 24, 'hvac');
    const rtreeI = inst(CONE, mat(COL.tree), 30, 'roof');

    // --- 설비 (층마다, 코어 주변) ---
    const z0 = -bd / 2, rz = (f) => z0 + bd * f;
    const sys = {
      hvac: { c: COL.green, w: 1.4, h: 0.6, y: 0.55, z: 0.3 }, plumb: { c: COL.water, w: 0.35, h: 0.35, y: 0.8, z: 0.4 },
      fire: { c: COL.red, w: 0.2, h: 0.2, y: 0.42, z: 0.46 }, elec: { c: COL.orange, w: 0.8, h: 0.15, y: 0.66, z: 0.22 }, ict: { c: COL.purple, w: 0.5, h: 0.12, y: 0.74, z: 0.14 },
    };
    const sysI = {}, riser = {};
    Object.entries(sys).forEach(([k, s]) => {
      sysI[k] = inst(BOX, clipM(s.c, { em: 0.15 }), NF * (k === 'hvac' ? 3 + D.colX.length * 2 : 3), k);
      riser[k] = mesh(BOX, clipM(s.c, { em: 0.2 }), k);
    });
    const sprI = inst(BOX, clipM(COL.red, { em: 0.3 }), NF * 24, 'fire');
    const plantI = inst(BOX, mat(0xd9d9de, { metal: 0.25 }), 8, 'mep');
    const geoI = inst(CYL, mat(COL.water, { em: 0.3 }), 8, 'hvac');
    // 마감: 바닥 · 천장 · 칸막이 · 시운전 점등
    const finFloorI = inst(BOX, clipM(FLOOR_C[ids.floor] ?? 0x7b8ea6), NF, 'floor');
    const ceilI = inst(BOX, clipM(0xe7e7ea), NF, 'ceil');
    const nPart = Math.max(2, Math.round((G.bx1 - G.bx0) / 9)) - 1;
    const partI = inst(BOX, clipM(PART_C[ids.part] ?? 0xe7e7ea), NF * nPart * 2, 'part');
    const paintI = inst(BOX, clipM(0xe9d38a, { em: 0.2 }), NF * nPart * 2, 'paint');
    const litI = inst(BOX, clipM(COL.glow, { op: 0.35, em: 1.2 }), NF, 'comm');

    // --- 가설 · 조경 ---
    const pl = -Math.min(3, cond.adj / 2);
    const fenceM = mat(ids.prep === 'sound' ? 0x4f7fb0 : 0x5f6066, { rough: 0.7, op: ids.prep === 'sound' ? 0.55 : 1 });
    const fence = [0, 1, 2, 3].map(() => mesh(BOX, fenceM, 'prep'));
    const offI = inst(BOX, mat(0xe7e7ea), 3, 'prep');
    const treeI = inst(CONE, mat(COL.tree), 60, 'land'), trunkI = inst(CYL, mat(COL.trunk), 60, 'land');
    const paveI = inst(BOX, mat(COL.pave), 4, 'land');

    // ---------- 시각별 갱신 ----------
    function frameAt(st) {
      const { wpId, tau, T } = st;
      const K = (k) => sc.known.has(k), P = (k) => progAt(sc, k, tau);
      const surveyP = P('survey'), impP = P('improve'), wallP = P('wall'), earthP = P('excav'), foundP = P('found'), baseP = P('base');
      const structP = P('frame'), skinP = P('skin');
      const topdown = K('support') && ids.support === 'topdown';
      const dug = depth > 0.5 ? depth * earthP : 0;
      // 땅
      strata.forEach(L => {
        const [l, r, b, u] = L.pieces;
        setBox(l, D.xl, 0, -L.b, -L.a, -Z, 0); setBox(r, pw, D.xr, -L.b, -L.a, -Z, 0); setBox(b, 0, pw, -L.b, -L.a, -Z, -pd / 2);
        const yTop = Math.min(-L.a, -dug); u.visible = yTop > -L.b + 0.01; if (u.visible) setBox(u, 0, pw, -L.b, yTop, -pd / 2, 0);
      });
      // 지하 공종: 앞쪽 지표를 걷어 단면(지층·흙막이·말뚝)을 정면으로 보인다
      const underV = UNDER_WPS.has(wpId);
      front.forEach(o => { o.visible = !underV; });
      pitLid.visible = dug < 0.6 && !underV;
      gwLine.visible = cond.gw < sc.dv;
      // 조사
      const target = Math.min(sc.dv - 2, Math.max(depth * 1.6, cond.rockDepth + 3));
      let nb2 = 0, nr = 0;
      if (K('survey') && (wpId === 'survey' || surveyP < 1)) bores.forEach((bx, i) => { const lp = clamp(surveyP * bores.length - i, 0, 1); if (lp <= 0) return; const de = target * clamp(lp * 1.15, 0, 1); ibox(boreI, nb2++, bx - 0.12, bx + 0.12, -de, 0, 0.1, 0.34); if (lp < 1 && (wpId === 'survey')) { ibox(rigI, nr++, bx - 1.6, bx + 1.6, 0, 1.6, -1.5, 1.5); ibox(rigI, nr++, bx - 0.2, bx + 0.2, 1.6, 10, -0.2, 0.2); } });
      boreI.count = nb2; rigI.count = nr; boreI.instanceMatrix.needsUpdate = true; rigI.instanceMatrix.needsUpdate = true;
      // 개량
      let ni = 0;
      if (K('improve') && ids.improve && ids.improve !== 'none' && impP > 0) { const bot = Math.max(sc.softBot, Math.min(sc.dv - 2, depth + 6)), on = Math.floor(impP * 1.25 * impXs.length); impXs.forEach((x, i) => { if (i > on) return; const w = ids.improve === 'dcm' ? 1.6 : 0.35; ibox(impI, ni++, x - w / 2, x + w / 2, -bot, -Math.max(0.6, dug > 0.5 && x > 0 && x < pw ? dug : 0.6), 0.1, 0.1 + w); }); }
      impI.count = ni; impI.instanceMatrix.needsUpdate = true;
      // 흙막이
      const wallOn = K('wall') && ids.wall !== 'open' && depth > 0.5 && wallP > 0;
      walls.forEach((w, i) => { w.visible = wallOn; if (!wallOn) return; const lp = clamp(wallP * 3 - i * 0.5, 0, 1), eb = -sc.embed * lp; if (i === 0) setBox(w, 0, th, eb, 0.4, -pd / 2, 0); if (i === 1) setBox(w, pw - th, pw, eb, 0.4, -pd / 2, 0); if (i === 2) setBox(w, 0, pw, eb, 0.4, -pd / 2, -pd / 2 + th); });
      // 지보
      let ns = 0, na = 0, nt = 0;
      const removeUpTo = !topdown && K('base') && ids.base === 'bottomup' ? depth * (1 - baseP) : depth + 9;
      if (K('support') && depth > 0.5 && ids.wall !== 'open' && ids.support !== 'self') {
        const k = ids.support;
        lv.forEach((m) => {
          if (dug < m + 0.4) return;
          if ((k === 'strut' || k === 'sps') && !(k === 'strut' && removeUpTo <= m)) {
            strutZ.forEach(z => ibox(strutI, ns++, th, pw - th, -m - 0.35, -m + 0.35, z - 0.35, z + 0.35));
            ibox(strutI, ns++, th, th + 0.6, -m - 0.45, -m + 0.45, -pd / 2, 0); ibox(strutI, ns++, pw - th - 0.6, pw - th, -m - 0.45, -m + 0.45, -pd / 2, 0);
          }
          if (k === 'anchor') [[th, -1], [pw - th, 1]].forEach(([x, s2]) => { const L = Math.max(10, depth * 0.9 + 6), a = Math.PI / 9; _p.set(x + s2 * L / 2 * Math.cos(a), -m - L / 2 * Math.sin(a), 0.3); _q.setFromEuler(_e.set(0, 0, Math.PI / 2 + s2 * a)); _s.set(0.35, L, 0.35); _m.compose(_p, _q, _s); ancI.setMatrixAt(na++, _m); });
          if (k === 'raker') ibox(strutI, ns++, th, th + Math.min(depth * 0.9, pw * 0.25), -m - 0.3, -m + 0.3, -pd / 4 - 0.3, -pd / 4 + 0.3, 0, -0.6);
        });
        if (k === 'topdown') { if (earthP > 0 || baseP > 0) ibox(tdSlab, nt++, -0.4, pw + 0.4, -0.35, 0.25, -pd / 2, 0); for (let i = 1; i < nB; i++) if (dug >= i * bsh + 0.6) ibox(tdSlab, nt++, th, pw - th, -i * bsh - 0.35, -i * bsh + 0.25, -pd / 2, 0); }
      }
      strutI.count = ns; ancI.count = na; tdSlab.count = nt; [strutI, ancI, tdSlab].forEach(o => { o.instanceMatrix.needsUpdate = true; });
      // 굴착 장비 · 덤프
      exc.visible = dug > 0.3 && earthP < 1 && ['support', 'excav', 'water', 'wall'].includes(wpId);
      if (exc.visible) { const ex = pw * (0.3 + 0.35 * (0.5 + 0.5 * Math.sin(T * 0.4))); exc.position.set(ex, -dug, -pd / 4); exc.rotation.y = Math.sin(T * 0.4) > 0 ? 0 : Math.PI; const sw = Math.sin(T * 3); exArm.position.set(2.6, 3 + sw * 0.5, 0); exArm.rotation.z = 0.5 + sw * 0.2; exArm2.position.set(4.6, 1.6 + sw * 0.4, 0); exArm2.rotation.z = -1.1 + sw * 0.2; }
      const trOn = (earthP > 0 && earthP < 1) || (wpId === 'excav');
      trucks.forEach((t, i) => { t.visible = trOn; if (!trOn) return; const ph = (T * 0.05 + i / trucks.length) % 1; t.position.set(pw + 13 + (i % 2) * 6, 0.12, -Z + ph * 2 * Z); t.rotation.y = i % 2 ? Math.PI : 0; t.userData.load.visible = !(i % 2); });
      // 기초
      let np = 0;
      if (K('found') && foundP > 0 && ids.found !== 'mat') { const pileP = clamp(foundP / 0.6, 0, 1), base = -Math.max(depth, 1.2); pileXs.forEach((x, i) => { const lp = clamp(pileP * pileXs.length - i, 0, 1); if (lp <= 0) return; ibox(pileI, np++, x - pileW / 2, x + pileW / 2, base - plen * lp, base, 0.05, 0.05 + pileW); }); }
      pileI.count = np; pileI.instanceMatrix.needsUpdate = true;
      const matP = K('found') ? clamp((foundP - 0.6) / 0.4, 0, 1) : 0, baseE = -Math.max(depth, 1.2);
      matSlab.visible = matP > 0; if (matP > 0) setBox(matSlab, 1, pw - 1, baseE, baseE + thick * matP, -pd / 2 + 1, 0);
      rig.visible = K('found') && foundP > 0 && foundP < 0.6 && wpId === 'found'; if (rig.visible) { const i = Math.floor(clamp(foundP / 0.6, 0, 0.999) * pileXs.length); rig.position.set(pileXs[i] - 2.4, baseE, -4); }
      // 지하 방수
      let nw = 0;
      if (K('bwp') && depth > 0.5 && P('bwp') > 0) { const top = -depth + depth * clamp(P('bwp') * 1.15, 0, 1), L = th + 0.1, Rr = pw - th - 0.1, t2 = 0.18; ibox(bwpI, nw++, L, L + t2, -depth - 0.3, top, -pd / 2 + th, 0); ibox(bwpI, nw++, Rr - t2, Rr, -depth - 0.3, top, -pd / 2 + th, 0); ibox(bwpI, nw++, L, Rr, -depth - 0.3, top, -pd / 2 + th, -pd / 2 + th + t2); ibox(bwpI, nw++, L, Rr, -depth - 0.5, -depth - 0.3, -pd / 2 + th, 0); }
      bwpI.count = nw; bwpI.instanceMatrix.needsUpdate = true;
      // 지하 골조
      let nbs = 0, nbw = 0, nbc = 0;
      if (K('base') && depth > 0.5 && baseP > 0) {
        const up = topdown ? nB : baseP * nB, top = topdown ? -depth + depth * baseP : -depth + Math.min(depth, up * bsh), tw = th + 0.35;
        if (!topdown) for (let i = 1; i <= nB; i++) { if (up < i - 0.95) break; const e = -depth + i * bsh; ibox(bslab, nbs++, tw, pw - tw, e - 0.35, e + 0.25, -pd / 2 + tw, 0); }
        else ibox(bslab, nbs++, tw, pw - tw, -depth + 1.15, -depth + 1.75, -pd / 2 + tw, 0);
        ibox(bwallI, nbw++, tw, tw + 0.6, -depth, top, -pd / 2 + tw, 0); ibox(bwallI, nbw++, pw - tw - 0.6, pw - tw, -depth, top, -pd / 2 + tw, 0); ibox(bwallI, nbw++, tw, pw - tw, -depth, top, -pd / 2 + tw, -pd / 2 + tw + 0.6);
        for (let i = 1; i < 7; i++) strutZ.forEach(z => ibox(bcolI, nbc++, pw * i / 7 - 0.4, pw * i / 7 + 0.4, -depth + 0.3, top, z - 0.4, z + 0.4));
      }
      bslab.count = nbs; bwallI.count = nbw; bcolI.count = Math.min(nbc, bcolI.instanceMatrix.count); [bslab, bwallI, bcolI].forEach(o => { o.instanceMatrix.needsUpdate = true; });

      // 지상 골조
      const fl = structP * NF, nF = K('frame') ? Math.min(NF, Math.floor(fl)) : 0;
      slabI.count = nF; colI.count = colOff[nF];
      ghost.visible = !K('frame') && !UNDER_WPS.has(wpId);
      const coreAhead = K('form') && sc.fx.coreAhead ? 4 : (ids.frame === 'hybrid' && K('frame') ? 3 : 0);
      const cn = Math.min(NF, nF + (structP > 0 ? coreAhead : 0)), ctop = K('frame') && cn > 0 ? sc.floors[cn - 1].e1 : 0;
      const hasCore = ctop > 0 && !['truss', 'module', 'stick', 'steel'].includes(ids.frame), cx0 = G.core.x0, cx1 = G.core.x1, cz = D.cz;
      core.forEach((w, i) => { w.visible = hasCore; if (!hasCore) return; const t3 = 0.4; if (i === 0) setBox(w, cx0, cx0 + t3, 0, ctop, -cz, cz); if (i === 1) setBox(w, cx1 - t3, cx1, 0, ctop, -cz, cz); if (i === 2) setBox(w, cx0, cx1, 0, ctop, -cz, -cz + t3); if (i === 3) setBox(w, cx0, cx1, 0, ctop, cz - t3, cz); });
      // 현재 층 사이클
      const active = K('frame') && structP > 0 && structP < 1 && nF < NF;
      const f = active ? sc.floors[nF] : null, fr = fl - nF, stage = fr < 0.35 ? 0 : fr < 0.6 ? 1 : fr < 0.78 ? 2 : 3, fp = active ? D.fp[nF] : null;
      formBox.visible = active && K('form') && stage < 3 && ids.form !== 'pcf';
      if (formBox.visible) setBox(formBox, fp.x0 - 0.3, fp.x1 + 0.3, f.e0 + 0.2, f.e1 + 0.2, fp.z0 - 0.3, fp.z1 + 0.3);
      acs.visible = active && K('form') && (ids.form === 'acs' || ids.form === 'slip') && hasCore;
      if (acs.visible) setBox(acs, cx0 - 1.4, cx1 + 1.4, ctop - 6, ctop + 1.5, -cz - 1.4, cz + 1.4);
      let nsh = 0;
      if (active && K('form') && ids.form === 'conv') for (let x = fp.x0 + 1; x < fp.x1 && nsh < 120; x += Math.max(2, (fp.x1 - fp.x0) / 10)) for (let z = fp.z0 + 1; z < fp.z1 && nsh < 120; z += Math.max(2, (fp.z1 - fp.z0) / 10)) ibox(shoreI, nsh++, x - 0.06, x + 0.06, f.e0 + 0.2, f.e1 - 0.32, z - 0.06, z + 0.06);
      shoreI.count = nsh; shoreI.instanceMatrix.needsUpdate = true;
      rebarP.visible = active && stage >= 1 && stage < 3 && ids.form !== 'pcf';
      if (rebarP.visible) { rebarP.position.set((fp.x0 + fp.x1) / 2, f.e1 + 0.05, (fp.z0 + fp.z1) / 2); rebarP.scale.set(fp.x1 - fp.x0, 1, fp.z1 - fp.z0); rebarTex.repeat.set((fp.x1 - fp.x0) / 1.2, (fp.z1 - fp.z0) / 1.2); }
      pourBox.visible = active && stage >= 2;
      if (pourBox.visible) { const pf = stage === 2 ? clamp((fr - 0.6) / 0.18, 0.02, 1) : 1; setBox(pourBox, fp.x0, fp.x0 + (fp.x1 - fp.x0) * pf, f.e1 - 0.32, f.e1 + 0.2, fp.z0, fp.z1); }
      let ncg = 0; if (active && K('rebar') && ids.rebar === 'cage' && (wpId === 'rebar')) { const hx = fp.x0 + (fp.x1 - fp.x0) * 0.3, he = f.e1 + 2 + 2 * (0.5 + 0.5 * Math.sin(T * 0.8)); ibox(cageI, ncg++, hx - 0.4, hx + 0.4, he, he + 3.4, -0.4, 0.4); }
      cageI.count = ncg; cageI.instanceMatrix.needsUpdate = true;
      // 철골 불꽃
      let nsp = 0;
      if (active && K('steel') && steelF && ids.steel !== 'none' && (ids.steel === 'weld' || ids.steel === 'robot')) D.colX.forEach((x, j) => { if ((T * 4 + j) % 1 > 0.6) return; for (let q = 0; q < 4 && nsp < 40; q++) { const an = q * 1.6 + T * 9; ibox(sparkI, nsp++, x + Math.cos(an) * 0.4 - 0.05, x + Math.cos(an) * 0.4 + 0.05, f.e0 + 1.2 + Math.sin(an) * 0.4 - 0.05, f.e0 + 1.2 + Math.sin(an) * 0.4 + 0.05, -bd / 2 - 0.1, -bd / 2 + 0.1); } });
      sparkI.count = nsp; sparkI.instanceMatrix.needsUpdate = true;
      // 펌프카
      const pourNow = active && stage === 2 && (K('conc') || K('pour'));
      pump.visible = pourNow || (wpId === 'pour' && active);
      if (pump.visible) {
        pump.position.set(pw + 12, 0.12, -bd / 4);
        const tx = fp.x0 + (fp.x1 - fp.x0) * 0.5 - (pw + 12), ty = f.e1 + 1, H = f.e1, reach = ids.pour === 'boom' || ids.pour === 'multi' ? 58 : 0;
        const ok = reach && H <= reach, b1 = boom[0], b2 = boom[1], b3 = boom[2];
        if (ok || !reach) {
          const midY = Math.max(ty + 6, 12), mx = tx * 0.45;
          seg(b1, 0, 3, -3, mx, midY, 0); seg(b2, mx, midY, 0, tx, ty + 3, 0); seg(b3, tx, ty + 3, 0, tx, ty, 0);
          if (!reach) { const cxl = G.core.x1 + 0.4 - (pw + 12), an = Math.sin(T * 0.6) * 0.8, Lb = Math.min(14, (G.bx1 - G.bx0) * 0.45); seg(b1, -1, 1, bd / 4, cxl, 1, bd / 4); seg(b2, cxl, 1, bd / 4, cxl, H + 1, bd / 4); seg(b3, cxl, H + 2.4, bd / 4, cxl + Math.cos(an) * Lb, H + 2.4, bd / 4 + Math.sin(an) * Lb); }
        } else { seg(b1, 0, 3, 0, -6, reach, 0); seg(b2, -6, reach, 0, -10, reach - 4, 0); seg(b3, -10, reach - 4, 0, -10, reach - 6, 0); }
      }
      mixers.forEach((m, i) => { m.visible = pourNow; if (pourNow) m.position.set(pw + 20 + i * 4, 0.12, -bd / 4 + 10 + i * 9); });

      // 크레인
      const needCrane = (structP > 0 && structP < 1) || wpId === 'lift' || (skinP > 0 && skinP < 1 && ['unitcw', 'pcpanel', 'metal'].includes(ids.skin));
      const showCrane = needCrane && !UNDER_WPS.has(wpId);
      const n2 = Math.min(NF, Math.ceil(fl)), top = n2 > 0 ? sc.floors[n2 - 1].e1 : 0, Hc = Math.max(top + 14, 24), R = sc.fx.craneR || 60;
      crane.visible = showCrane && K('lift'); crGhost.visible = showCrane && !K('lift');
      if (crGhost.visible) setBox(crGhost, sc.crX - 1, sc.crX + 1, 0, Hc, -bd / 2 - 6, -bd / 2 - 4);
      if (crane.visible) {
        const k = ids.lift, cxp = k === 'crawler' || k === 'ringer' || k === 'mobile' ? pw + 14 : sc.crX, czp = k === 'crawler' || k === 'ringer' || k === 'mobile' ? 0 : -bd / 2 - 5;
        crane.position.set(cxp, 0, czp);
        const tower = k === 'tower' || k === 'luffing';
        setBox(mast, -1, 1, 0, tower ? Hc : 3, -1, 1); setBox(mastS, -1.05, 1.05, 0, 1.2, -1.05, 1.05);
        slew.position.set(0, tower ? Hc : 3, 0);
        const sl = k === 'tower' ? T * 0.45 : Math.sin(T * 0.3) * 0.9 + 2.2;
        slew.rotation.y = sl;
        const L = k === 'tower' ? R : k === 'luffing' ? R * 0.75 : Math.max(top + 20, 60);
        const ang = k === 'tower' ? 0 : k === 'luffing' ? 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(T * 0.5)) : 1.1 + 0.08 * Math.sin(T * 0.4);
        jib.position.set(Math.cos(ang) * L / 2, Math.sin(ang) * L / 2 + 0.6, 0); jib.rotation.z = ang; jib.scale.set(L, 1.2, 1.2);
        cjib.visible = tower; cwt.visible = tower; apex.visible = k === 'tower'; cab.visible = true;
        setBox(cjib, -R * 0.3, 0, 0.1, 1.1, -0.6, 0.6); setBox(cwt, -R * 0.3, -R * 0.3 + 4, -1.6, 0.4, -1, 1); setBox(cab, 0.6, 2.6, -2.6, -0.4, -1.1, 1.1); setBox(apex, -0.5, 0.5, 0, 6, -0.5, 0.5);
        const tipX = Math.cos(ang) * L, tipY = Math.sin(ang) * L + 0.6, hx = k === 'tower' ? L * (0.55 + 0.25 * Math.sin(T * 0.9)) : tipX;
        const hookY = lerp(1, top + 3, 0.5 + 0.5 * Math.sin(T * 0.7)) - slew.position.y;
        const hy0 = k === 'tower' ? 0 : tipY;
        setBox(hookL, hx - 0.06, hx + 0.06, hookY + 1.6, hy0, -0.06, 0.06); setBox(hookLoad, hx - 1.4, hx + 1.4, hookY, hookY + 1.6, -1, 1);
      }
      // 호이스트 · 점프
      const hOn = K('hoist') && P('hoist') > 0 && fl > 2 && P('fin') < 0.98;
      [hMast, hCar, hCar2].forEach(o => { o.visible = hOn; });
      if (hOn) {
        const k = ids.hoist, hs = HOIST[k] || HOIST.rack, htop = sc.floors[Math.min(NF, Math.max(1, Math.floor(fl))) - 1].e1 + (k === 'jump' ? 0 : 3);
        const cyc = (T * hs.v / 60 / Math.max(10, htop)) % 2, ce = (cyc < 1 ? cyc : 2 - cyc) * Math.max(0, htop - 3);
        if (k === 'jump') { setBox(hMast, cx0 + 0.3, cx0 + 2.1, 0, htop, -1, 1); setBox(hCar, cx0 + 0.5, cx0 + 1.9, ce, ce + 2.4, -0.8, 0.8); hCar2.visible = false; }
        else { const mx = G.bx1 + 0.8; setBox(hMast, mx, mx + 0.8, 0, htop, -0.4, 0.4); setBox(hCar, mx + 0.8, mx + 2.8, ce, ce + 2.6, -1.5, 1.5); hCar2.visible = k === 'fast'; if (k === 'fast') { const c2 = Math.max(0, htop - 3 - ce); setBox(hCar2, mx + 0.8, mx + 2.8, c2, c2 + 2.6, 1.7, 4.7); } }
      }
      // 승강기
      let ne = 0;
      if (K('elev') && P('elev') >= 0.6 && nF > 0) { const v = elevSpeed(ids.elev, G.H), etop = sc.floors[nF - 1].e1, sh = ids.elev === 'freight' ? 1 : 2, cw = (cx1 - cx0 - 0.8) / sh; for (let s = 0; s < sh; s++) { const cyc = ((T + s * 0.7) * v / Math.max(12, etop)) % 2, e = (cyc < 1 ? cyc : 2 - cyc) * Math.max(0, etop - 3); ibox(elevI, ne++, cx0 + 0.4 + s * cw + 0.1, cx0 + 0.4 + (s + 1) * cw - 0.1, e, e + (ids.elev === 'dd' ? 5.4 : 2.6), -1.2, 1.2); } }
      elevI.count = ne; elevI.instanceMatrix.needsUpdate = true;

      // 외장 · 창호 · 단열
      const nS = K('skin') ? Math.min(Math.floor(skinP * NF), nF) : 0;
      for (let i = 0; i < nS; i++) { const f2 = sc.floors[i], p2 = D.fp[i], t3 = 0.12; ibox(skinX, i * 2, p2.x0 - 0.2, p2.x1 + 0.2, f2.e0, f2.e1, p2.z1, p2.z1 + t3); ibox(skinX, i * 2 + 1, p2.x0 - 0.2, p2.x1 + 0.2, f2.e0, f2.e1, p2.z0 - t3, p2.z0); ibox(skinZ, i * 2, p2.x0 - t3, p2.x0, f2.e0, f2.e1, p2.z0, p2.z1); ibox(skinZ, i * 2 + 1, p2.x1, p2.x1 + t3, f2.e0, f2.e1, p2.z0, p2.z1); }
      skinX.count = skinZ.count = nS * 2; skinX.instanceMatrix.needsUpdate = skinZ.instanceMatrix.needsUpdate = true;
      const nG = K('glaz') ? Math.min(nS, Math.floor(P('glaz') * NF)) : 0; let ng = 0;
      for (let i = 0; i < nG; i++) { const f2 = sc.floors[i], p2 = D.fp[i]; ibox(glazI, ng++, p2.x0 - 0.25, p2.x1 + 0.25, f2.e0 + 0.85, f2.e0 + 0.95, p2.z1 + 0.05, p2.z1 + 0.2); ibox(glazI, ng++, p2.x0 - 0.25, p2.x1 + 0.25, f2.e1 - 0.55, f2.e1 - 0.45, p2.z1 + 0.05, p2.z1 + 0.2); ibox(glazI, ng++, p2.x1 + 0.05, p2.x1 + 0.2, f2.e0 + 0.85, f2.e0 + 0.95, p2.z0, p2.z1); ibox(glazI, ng++, p2.x1 + 0.05, p2.x1 + 0.2, f2.e1 - 0.55, f2.e1 - 0.45, p2.z0, p2.z1); }
      glazI.count = ng; glazI.instanceMatrix.needsUpdate = true;
      const nI = K('insul') ? Math.min(nF, Math.floor(P('insul') * NF)) : 0; let nn = 0;
      // 단열: 외단열·뿜칠은 층 전체 높이, 커튼월·패널은 슬래브 끝 스팬드럴 띠
      const fullH = ids.insul === 'outer' || ids.insul === 'spray' || !glassy;
      for (let i = 0; i < nI; i++) { const f2 = sc.floors[i], p2 = D.fp[i], out = ids.insul === 'outer'; const o2 = out ? 0.14 : -0.45; const ya = fullH ? f2.e0 + 0.2 : f2.e1 - 0.6, yb = fullH ? f2.e1 - 0.35 : f2.e1 + 0.5; ibox(insI, nn++, p2.x1 + o2, p2.x1 + o2 + 0.18, ya, yb, p2.z0 + 0.3, p2.z1 - 0.3); ibox(insI, nn++, p2.x0 - o2 - 0.18, p2.x0 - o2, ya, yb, p2.z0 + 0.3, p2.z1 - 0.3); }
      insI.count = nn; insI.instanceMatrix.needsUpdate = true;
      // 지붕
      const done = nF >= NF && NF > 0, rtop = done ? sc.floors[NF - 1].e1 : 0, rp = K('roof') ? P('roof') : 0, rfp = D.fp[NF - 1] || { x0: G.bx0, x1: G.bx1, z0: -bd / 2, z1: bd / 2 };
      roofL.visible = done && rp > 0; if (roofL.visible) setBox(roofL, rfp.x0 + 0.2, rfp.x0 + 0.2 + (rfp.x1 - rfp.x0 - 0.4) * clamp(rp * 1.1, 0, 1), rtop + 0.18, rtop + (ids.roof === 'green' ? 0.6 : 0.34), rfp.z0 + 0.2, rfp.z1 - 0.2);
      let npr = 0; if (done) { ibox(parI, npr++, rfp.x0, rfp.x0 + 0.25, rtop, rtop + 1.2, rfp.z0, rfp.z1); ibox(parI, npr++, rfp.x1 - 0.25, rfp.x1, rtop, rtop + 1.2, rfp.z0, rfp.z1); ibox(parI, npr++, rfp.x0, rfp.x1, rtop, rtop + 1.2, rfp.z0, rfp.z0 + 0.25); ibox(parI, npr++, rfp.x0, rfp.x1, rtop, rtop + 1.2, rfp.z1 - 0.25, rfp.z1); }
      parI.count = npr; parI.instanceMatrix.needsUpdate = true;
      let npv = 0; if (done && ids.roof === 'pv' && rp > 0.3) for (let x = rfp.x0 + 1.5; x < rfp.x0 + (rfp.x1 - rfp.x0) * rp - 2 && npv < 60; x += 2.4) for (let z = rfp.z0 + 2; z < rfp.z1 - 2 && npv < 60; z += 4) ibox(pvI, npv++, x, x + 1.8, rtop + 0.6, rtop + 0.7, z, z + 3, 0, 0.35);
      pvI.count = npv; pvI.instanceMatrix.needsUpdate = true;
      let nrt = 0; if (done && ids.roof === 'green' && rp > 0.3) for (let x = rfp.x0 + 2; x < rfp.x0 + (rfp.x1 - rfp.x0) * rp - 1 && nrt < 30; x += 3.5) for (let z = rfp.z0 + 2; z < rfp.z1 - 2 && nrt < 30; z += 5) ibox(rtreeI, nrt++, x - 0.8, x + 0.8, rtop + 0.6, rtop + 2.6, z - 0.8, z + 0.8);
      rtreeI.count = nrt; rtreeI.instanceMatrix.needsUpdate = true;
      let nct = 0, nod = 0; const hv = ids.hvac;
      if (done && K('hvac') && P('hvac') > 0.2) { const cxr = rfp.x0 + (rfp.x1 - rfp.x0) * 0.62; if (['central', 'process', 'crac', 'clean'].includes(hv)) for (let j = 0; j < 4; j++) ibox(ctI, nct++, cxr + (j % 2) * 4.2, cxr + (j % 2) * 4.2 + 3.6, rtop + 0.4, rtop + 4.2, -bd * 0.2 + Math.floor(j / 2) * 4.4, -bd * 0.2 + Math.floor(j / 2) * 4.4 + 3.6); if (hv === 'vrf') for (let j = 0; j < 24; j++) ibox(oduI, nod++, cxr + (j % 6) * 1.6, cxr + (j % 6) * 1.6 + 1.2, rtop + 0.4, rtop + 2, -bd * 0.3 + Math.floor(j / 6) * 1.6, -bd * 0.3 + Math.floor(j / 6) * 1.6 + 0.9); }
      ctI.count = nct; oduI.count = nod; ctI.instanceMatrix.needsUpdate = oduI.instanceMatrix.needsUpdate = true;

      // 설비
      const plantE = depth > 0.5 ? -depth + 0.4 : 0.1;
      Object.entries(sys).forEach(([k, s]) => {
        const im = sysI[k]; let n = 0;
        const nk = K(k) ? Math.min(nF, Math.floor(P(k) * NF + 1e-6)) : 0;
        for (let i = 0; i < nk; i++) { const f2 = sc.floors[i], p2 = D.fp[i], y = f2.e1 - 0.32 - s.y, z = rz(s.z); if (k === 'hvac' && (hv === 'district' || hv === 'radiant')) { const yy = hv === 'district' ? f2.e0 + 0.2 : f2.e1 - 0.4; ibox(im, n++, p2.x0 + 0.6, p2.x1 - 0.6, yy, yy + 0.06, p2.z0 + 0.6, p2.z1 - 0.6); continue; } if (k === 'fire' && ids.fire === 'gas') { ibox(im, n++, p2.x1 - 3, p2.x1 - 1.6, f2.e0 + 0.2, f2.e0 + 1.6, z - 0.7, z + 0.7); continue; } ibox(im, n++, p2.x0 + 1, p2.x1 - 1, y - s.h / 2, y + s.h / 2, z - s.w / 2, z + s.w / 2);
          if (k === 'hvac' && hv !== 'vrf' && hv !== 'radiant') { ibox(im, n++, p2.x0 + 1, p2.x1 - 1, y - s.h / 2, y + s.h / 2, rz(0.7) - s.w / 2, rz(0.7) + s.w / 2); for (let j = 0; j < D.colX.length - 1 && p2.x1 - p2.x0 < (G.bx1 - G.bx0) + 1; j++) { const xb = (D.colX[j] + D.colX[j + 1]) / 2; ibox(im, n++, xb - 0.3, xb + 0.3, y - 0.18, y + 0.18, p2.z0 + 0.8, z); } }
          if (k === 'hvac' && hv === 'vrf') for (let j = 0; j < D.colX.length - 1; j++) { const xb = (D.colX[j] + D.colX[j + 1]) / 2; ibox(im, n++, xb - 0.5, xb + 0.5, y - 0.15, y + 0.15, rz(0.15), rz(0.15) + 1); } }
        im.count = n; im.instanceMatrix.needsUpdate = true;
        const r2 = riser[k]; r2.visible = nk > 0; if (nk > 0) { const xr = { hvac: cx1 + 0.4, plumb: cx0 - 0.5, fire: cx1 + 1.2, elec: cx0 + 0.9, ict: cx0 + 1.5 }[k], w2 = k === 'hvac' ? 1.2 : 0.4; setBox(r2, xr - w2 / 2, xr + w2 / 2, plantE, sc.floors[nk - 1].e1 - 0.4, cz - w2, cz); }
      });
      let nspr = 0; if (K('fire') && ids.fire !== 'gas') { const nk = Math.min(nF, Math.floor(P('fire') * NF + 1e-6)); for (let i = 0; i < nk && nspr < sprI.instanceMatrix.count; i++) { const f2 = sc.floors[i], p2 = D.fp[i]; for (let x = p2.x0 + 2; x < p2.x1 - 1 && nspr < NF * 24; x += 3.2) ibox(sprI, nspr++, x - 0.04, x + 0.04, f2.e1 - 0.32 - 0.6, f2.e1 - 0.32 - 0.42, rz(0.5) - 0.04, rz(0.5) + 0.04); } }
      sprI.count = Math.min(nspr, sprI.instanceMatrix.count); sprI.instanceMatrix.needsUpdate = true;
      let npl = 0; if (K('mep') && P('mep') > 0) { const pe = plantE; ibox(plantI, npl++, cx1 + 1, cx1 + 5, pe, pe + 2.2, -bd * 0.3, -bd * 0.3 + 3); ibox(plantI, npl++, cx0 - 6, cx0 - 3.6, pe, pe + 2, -bd * 0.3, -bd * 0.3 + 2.4); ibox(plantI, npl++, cx0 - 4.2, cx0 - 1.2, pe, pe + 2, -bd * 0.1, -bd * 0.1 + 3); }
      plantI.count = npl; plantI.instanceMatrix.needsUpdate = true;
      let ngo = 0; if (K('hvac') && hv === 'geo' && P('hvac') > 0) for (let i = 0; i < Math.ceil(7 * clamp(P('hvac') * 1.6, 0, 1)); i++) { const x = 2 + (pw - 4) * (i + 0.5) / 7; ibox(geoI, ngo++, x - 0.15, x + 0.15, -Math.min(sc.dv - 1, 150), -depth - 0.5, 0.1, 0.4); }
      geoI.count = ngo; geoI.instanceMatrix.needsUpdate = true;
      // 마감
      const nk = (k) => (K(k) ? Math.min(nF, Math.floor(P(k) * NF + 1e-6)) : 0);
      const nFl = nk('floor'), nCe = nk('ceil'), nPa = nk('part'), nPt = nk('paint');
      for (let i = 0; i < nFl; i++) { const f2 = sc.floors[i], p2 = D.fp[i], tt = ids.floor === 'oa' ? 0.3 : ids.floor === 'wet' || ids.floor === 'dryondol' ? 0.12 : 0.03; ibox(finFloorI, i, p2.x0 + 0.3, p2.x1 - 0.3, f2.e0 + 0.18, f2.e0 + 0.18 + tt, p2.z0 + 0.3, p2.z1 - 0.3); }
      finFloorI.count = nFl; finFloorI.instanceMatrix.needsUpdate = true;
      const plen2 = ids.ceil === 'exposed' ? 0 : ({ central: 0.9, vrf: 0.5, geo: 0.8, radiant: 0.35, district: 0.3, clean: 1.4, crac: 0.6, process: 0.8 })[hv] ?? 0.6;
      for (let i = 0; i < nCe; i++) { const f2 = sc.floors[i], p2 = D.fp[i], y = f2.e1 - 0.32 - plen2; ibox(ceilI, i, p2.x0 + 0.4, p2.x1 - 0.4, y - 0.03, y, p2.z0 + 0.4, p2.z1 - 0.4); }
      ceilI.count = ids.ceil === 'exposed' ? 0 : nCe; ceilI.instanceMatrix.needsUpdate = true;
      let npa = 0, npt = 0;
      for (let i = 0; i < nPa; i++) { const f2 = sc.floors[i], p2 = D.fp[i], bwp = p2.x1 - p2.x0, w2 = ids.part === 'block' ? 0.2 : 0.12; for (let j = 1; j <= nPart; j++) { const x = p2.x0 + bwp * j / (nPart + 1); [[p2.z0 + 0.5, rz(0.42)], [rz(0.58), p2.z1 - 0.5]].forEach(([za, zb]) => { ibox(partI, npa++, x - w2 / 2, x + w2 / 2, f2.e0 + 0.2, f2.e1 - 0.32 - (ids.ceil === 'exposed' ? 0 : plen2), za, zb); if (i < nPt) ibox(paintI, npt++, x - w2 / 2 - 0.02, x + w2 / 2 + 0.02, f2.e0 + 0.25, f2.e1 - 0.4 - (ids.ceil === 'exposed' ? 0 : plen2), za + 0.05, zb - 0.05); }); } }
      partI.count = npa; paintI.count = npt; partI.instanceMatrix.needsUpdate = paintI.instanceMatrix.needsUpdate = true;
      const lit = K('comm') ? Math.floor(clamp(P('comm') * 1.15, 0, 1) * nF) : 0;
      for (let i = 0; i < lit; i++) { const f2 = sc.floors[i], p2 = D.fp[i]; ibox(litI, i, p2.x0 + 0.5, p2.x1 - 0.5, f2.e0 + 0.3, f2.e1 - 0.5, p2.z0 + 0.5, p2.z1 - 0.5); }
      litI.count = lit; litI.instanceMatrix.needsUpdate = true;
      // 가설 울타리 · 사무실
      const prepOn = K('prep') && P('prep') > 0 && (K('land') ? P('land') : 0) < 0.85;
      const Hf = ({ std: 3, sound: 10, modular: 3, mini: 2 })[ids.prep] || 3, hfx = Hf * clamp(P('prep') * 1.4, 0, 1);
      fence.forEach((o, i) => { o.visible = prepOn && !(underV && (i === 2 || i === 3)); if (!o.visible) return; const za = -pd / 2 - 3, zb = pd / 2 + 3; if (i === 0) setBox(o, pl - 0.15, pl + 0.15, 0, hfx, za, zb); if (i === 1) setBox(o, pl, pw + 5, 0, hfx, za - 0.15, za + 0.15); if (i === 2) setBox(o, pl, pw + 5, 0, Math.min(hfx, 3), zb - 0.15, zb + 0.15); if (i === 3) setBox(o, pw + 4.85, pw + 5.15, 0, Math.min(hfx, 3), za, zb - 10); });
      let nof = 0; if (prepOn && P('prep') > 0.3) { const nBox = ids.prep === 'modular' ? 3 : ids.prep === 'mini' ? 1 : 2; for (let i = 0; i < nBox; i++) ibox(offI, nof++, pw + 7.5 + (i === 2 ? 0 : 0), pw + 13.5, (i === 2 ? 2.7 : 0) + 0.12, (i === 2 ? 5.3 : 2.6) + 0.12, pd / 2 - 2 - (i % 2) * 3.2, pd / 2 - (i % 2) * 3.2 + 0.6); }
      offI.count = nof; offI.instanceMatrix.needsUpdate = true;
      // 조경
      let ntr = 0, npv2 = 0;
      if (K('land') && P('land') > 0) {
        const lp = clamp(P('land') * 1.2, 0, 1), k = ids.land;
        [[0.6, G.bx0 - 0.6], [G.bx1 + 0.6, pw - 0.6]].filter(([s, e]) => e - s > 1.2).forEach(([s, e]) => { ibox(paveI, npv2++, s, s + (e - s) * lp, 0, k === 'ind' ? 0.45 : k === 'deck' ? 1.2 : 0.25, -pd / 2 + 1, pd / 2 - 1); if (k !== 'ind') for (let x = s + 3; x < s + (e - s) * lp - 1 && ntr < 60; x += 6) for (let z = -pd / 2 + 4; z < pd / 2 - 3 && ntr < 60; z += 9) { const yb = k === 'deck' ? 1.2 : 0.25; ibox(trunkI, ntr, x - 0.15, x + 0.15, yb, yb + 2.4, z - 0.15, z + 0.15); ibox(treeI, ntr++, x - 1.4, x + 1.4, yb + 1.6, yb + 5.4, z - 1.4, z + 1.4); } });
      }
      treeI.count = trunkI.count = ntr; paveI.count = npv2; [treeI, trunkI, paveI].forEach(o => { o.instanceMatrix.needsUpdate = true; });

      // 강조: 지금 공종의 재질을 강조색으로
      // 설비 공종을 볼 때는 다른 설비·마감을, 실내 마감을 볼 때는 설비를 흐리게 (2D와 같은 규칙)
      const dimSet = MEPS.includes(wpId) ? DIM_FOR_MEP : ROOMS.includes(wpId) ? DIM_FOR_ROOM : null;
      byWp.forEach((list, wp) => { const on = wp === wpId || (wpId === 'mep' && sys[wp]) || (wpId === 'conc' && (wp === 'pour')); const dm = !on && dimSet && dimSet.has(wp); list.forEach(o => { const m = on ? accOf(o.userData.base) : dm ? dimOf(o.userData.base) : o.userData.base; if (o.material !== m) o.material = m; }); });
      // 실내 공종: 건물 앞쪽 절반을 잘라 속을 보인다
      const cut = CUT_WPS.has(wpId);
      clipList.forEach(m => { const want = cut ? 1 : 0; if (m.clippingPlanes.length !== want) { m.clippingPlanes = cut ? [clipZ] : []; m.needsUpdate = true; } });
      return { top: Math.max(top, ctop) };
    }

    function seg(o, x0, y0, z0, x1, y1, z1) {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.max(0.01, Math.hypot(dx, dy, dz));
      o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); o.scale.set(0.5, L, 0.5);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
    }

    // 단면 이름표 (지하 공종에서만): 지층 · 지하수위
    const labels = [];
    sc.strata.forEach(([a, b, , nm]) => { if (a < sc.dv - 2) labels.push({ t: nm, p: [D.xl + 4, -(a + Math.min(b, sc.dv)) / 2, 0.2], under: true }); });
    if (cond.gw < sc.dv) labels.push({ t: `▽ 지하수위 GL−${cond.gw}m`, p: [pw + 3, -cond.gw + 0.6, 0.3], under: true, cls: 'gw' });
    labels.push({ t: nb.urban ? '인접 건물' : '인접 시설', p: [(nb.x0 + nb.x1) / 2, nb.h + 2, pd / 2 - 8], under: false });
    labels.push({ t: '도로', p: [pw + 19, 0.6, D.Z - 6], under: false });
    return {
      sc, D, root, frameAt, labels,
      dispose() { const mine = new Set([rebarM]); root.traverse(o => { if (o.isMesh && o.material && (o.material.map === texX || o.material.map === texZ)) mine.add(o.material); }); for (let i = clipList.length - 1; i >= 0; i--) if (mine.has(clipList[i])) clipList.splice(i, 1); owned.forEach(o => o.dispose()); ghost.geometry.dispose(); ghost.material.dispose(); crGhost.geometry.dispose(); crGhost.material.dispose(); rebarP.geometry.dispose(); rebarTex.dispose(); rebarM.dispose(); texX.dispose(); texZ.dispose(); root.traverse(o => { if (o.isMesh && o.material && o.material.map && (o.material.map === texX || o.material.map === texZ)) o.material.dispose(); }); },
    };
  }

  // ---------- 매 프레임 ----------
  let mkHtml = '', lbHtml = '', atCache = {}, size = [0, 0];
  function resize() {
    const r = host.getBoundingClientRect(), w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (w === size[0] && h === size[1]) return;
    size = [w, h]; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  function update(st) {
    if (disposed) return;
    resize();
    const { sc, wpId, p, T, marks = [], at } = st;
    if (!built || built.sc !== sc) { built = build(sc); lastWp = null; }
    const win = winFor(sc, wpId), tau = win.s + clamp(p, 0, 1) * (win.e - win.s);
    built.frameAt({ wpId, tau, T });
    // 시점: 2D 카메라가 보는 범위를 따라간다
    const roi = focusOf(sc, wpId, p), cx = (roi.x0 + roi.x1) / 2, ce = (roi.e0 + roi.e1) / 2, span = Math.max(roi.x1 - roi.x0, (roi.e1 - roi.e0) * cam.aspect);
    const under = UNDER_WPS.has(wpId);
    const tgt = new THREE.Vector3(cx, ce, under ? 0 : 0);
    if (lastWp !== wpId) {
      lastWp = wpId; userMoved = false;
      const cutV = CUT_WPS.has(wpId), far = MEPS.includes(wpId) ? 1.7 : ROOMS.includes(wpId) ? 1.35 : 1.05;
      const dist = clamp(span / (2 * Math.tan(cam.fov * Math.PI / 360)) / cam.aspect * far, 20, 1400);
      const dir = new THREE.Vector3(under ? 0.42 : cutV ? 0.38 : 0.62, under ? 0.2 : cutV ? 0.3 : 0.42, 1).normalize();
      follow.t.copy(tgt); follow.has = true;
      if (!st.instant && ctl.target.lengthSq() > 0) { follow.anim = { t0: performance.now(), from: { p: cam.position.clone(), t: ctl.target.clone() }, to: { p: tgt.clone().addScaledVector(dir, dist), t: tgt.clone() } }; }
      else { ctl.target.copy(tgt); cam.position.copy(tgt.clone().addScaledVector(dir, dist)); }
    } else if (!userMoved) {
      const d = tgt.clone().sub(ctl.target).multiplyScalar(0.08); ctl.target.add(d); cam.position.add(d);
    }
    if (follow.anim) { const k = clamp((performance.now() - follow.anim.t0) / 700, 0, 1), e = 1 - Math.pow(1 - k, 3); cam.position.lerpVectors(follow.anim.from.p, follow.anim.to.p, e); ctl.target.lerpVectors(follow.anim.from.t, follow.anim.to.t, e); if (k >= 1) follow.anim = null; }
    ctl.update();
    renderer.render(scene, cam);
    // HUD
    const wp = WP_BY_ID[wpId], o = wp.multi ? `${sc.qa.length}개 기술` : (wp.opts.find(x => x.id === sc.ids[wpId]) || { name: '' }).name;
    $('.s3-c').textContent = `// SIM_${wp.code} · 3D`; $('.s3-t').textContent = o;
    $('.s3-d').textContent = `D+${Math.round(tau)} · ${ym(dateAt(sc.t0, tau))}`; $('.s3-day').textContent = win.skip ? '해당 공정 없음' : `${Math.round(win.e - win.s)}일 중 ${Math.round(clamp(p, 0, 1) * (win.e - win.s))}일째`;
    // 판정 표식: 단면 좌표(x, e)를 단면(z=0) 위에 띄운다
    if (at) atCache = at;
    const box = $('.s3-mks'), w = size[0], h = size[1];
    const html = marks.map(m => { const pos = atCache[m.mark]; if (!pos) return ''; const v = new THREE.Vector3(pos[0], pos[1], 0.5).project(cam); if (v.z > 1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) return ''; return `<i class="s3-mk s${m.sev}" style="left:${((v.x + 1) / 2 * w).toFixed(0)}px;top:${((1 - v.y) / 2 * h).toFixed(0)}px">${m.n}</i>`; }).join('');
    if (mkHtml !== html) { box.innerHTML = html; mkHtml = html; }
    const lh = built.labels.filter(l => !l.under || UNDER_WPS.has(wpId)).map(l => { const v = new THREE.Vector3(...l.p).project(cam); if (v.z > 1 || v.x < -0.98 || v.x > 0.98 || v.y < -0.95 || v.y > 0.9) return ''; return `<i class="s3-lb${l.cls ? ' ' + l.cls : ''}" style="left:${((v.x + 1) / 2 * w).toFixed(0)}px;top:${((1 - v.y) / 2 * h).toFixed(0)}px">${l.t}</i>`; }).join('');
    if (lbHtml !== lh) { $('.s3-lbs').innerHTML = lh; lbHtml = lh; }
  }
  function dispose() {
    disposed = true;
    if (built) { scene.remove(built.root); built.dispose(); built = null; }
    mats.forEach(m => m.dispose()); accMats.forEach(m => m.dispose()); dimMats.forEach(m => m.dispose());
    [BOX, CYL, CONE].forEach(g => g.dispose());
    ctl.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); wrap.remove();
  }
  return { update, resize, dispose, el: wrap, canvas: renderer.domElement };
}

// 격자 무늬 (철근 배근 · 커튼월 멀리언)
function gridTex(color, lw = 6, alpha = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.clearRect(0, 0, 64, 64); x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = lw;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 0); x.moveTo(0, 0); x.lineTo(0, 64); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
