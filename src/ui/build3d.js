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
import { buildCity } from './city3d.js';
import { buildMethods, skinTex } from './method3d.js';
import { createLook, softwareGL } from '../sim/scene/look.js';
import { readPalette } from '../sim/scene/palette.js';
import { FACADE_U } from '../sim/scene/facade.js';
import { simTex, simTexAniso, triplanar, keepTriplanar } from './simtex.js';
import { buildSimContext } from './simctx.js';
import { crewPlan, crewAt, CREW_KINDS } from './crew3d.js';
import { buildFleet } from './fleet3d.js';
import { buildYard } from './yard3d.js';
import { ARCH } from './workstep.js';
import { fallbackFor, osmFor, osmReady } from '../sim/ctxload.js';
import { OSM_ATTRIB } from '../sim/osm.js';
import { tickWater } from '../sim/scene/water.js';
import { buildSiteLife, COMPANY } from './sitelife3d.js';
import { talkFor, roleOfWorker, roleOfEquipment } from './talk.js';
import { createSupport } from './support3d.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MEPS = ['hvac', 'plumb', 'fire', 'elec', 'ict'], ROOMS = ['part', 'floor', 'ceil', 'paint'];
const DIM_FOR_MEP = new Set([...MEPS, 'mep', 'part', 'paint', 'ceil', 'floor', 'comm', 'insul', 'glaz', 'elev']);
const DIM_FOR_ROOM = new Set([...MEPS, 'mep', 'insul', 'glaz', 'comm']);
const lerp = (a, b, t) => a + (b - a) * t;

// 자재 트레일러가 싣고 오는 것 (공종·작업 유형마다)
function DLV(wpId, a) {
  if (a === 'rebar' || wpId === 'rebar') return 'rebar';
  if (a === 'form' || wpId === 'form') return 'form';
  if (a === 'steel' || wpId === 'steel') return 'steel';
  if (a === 'precast') return 'pc';
  if (wpId === 'frame' || wpId === 'lift') return a === 'steel' ? 'steel' : 'rebar';
  if (wpId === 'skin' || wpId === 'glaz' || a === 'curtain') return 'cw';
  if (['hvac', 'plumb', 'fire', 'elec', 'ict', 'mep'].includes(wpId)) return 'mep';
  if (['part', 'ceil', 'floor', 'paint', 'insul', 'roof', 'hoist', 'elev'].includes(wpId)) return 'pallet';
  // 땅속 공사·가설: 흙막이 H형강·버팀보 · 기초 철근 · 방수 자재 · 지반 개량 시멘트 · 가설 펜스·비계
  if (wpId === 'wall' || wpId === 'support') return 'hbeam';
  if (wpId === 'found' || wpId === 'base') return a === 'form' ? 'form' : 'rebar';
  if (wpId === 'water' || wpId === 'bwp') return 'wp';
  if (wpId === 'improve') return 'cement';
  if (wpId === 'prep') return 'temp';
  return null;
}
export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}

// ---------- 치수 (node에서도 계산되도록 three와 분리) ----------
export function plan3d(sc) {
  const { G, nb } = sc;
  const r = G.main && G.main.rect ? G.main.rect : null;
  const du = G.env ? G.env.long : r ? r.u1 - r.u0 : G.bw, dv = G.env ? G.env.long : r ? r.v1 - r.v0 : G.bw;
  const bw = G.bx1 - G.bx0, bd = clamp(Math.max(du, dv, bw), 12, 110);
  const pd = clamp(Math.max(bd + 10, Math.min(G.pw, bd * 1.5)), 30, 160);
  const Z = pd / 2 + 26;
  const xl = Math.min(nb.x0 - 10, -34), xr = G.pw + 44;
  const bays = Math.max(2, Math.round(bw / 8.4)), baysZ = Math.max(2, Math.round(bd / 8.4));
  const colX = Array.from({ length: bays + 1 }, (_, i) => G.bx0 + bw * i / bays);
  const colZ = Array.from({ length: baysZ + 1 }, (_, i) => -bd / 2 + bd * i / baysZ);
  const cz = Math.max(3, bd * 0.16);
  const pod = G.podium ? G.podium.h : 0;
  // 층 판: 포디움 층은 대지 가득, 제스처가 있으면 층마다 외곽 안의 비율 사각형
  const fp = sc.floors.map(f => (pod > 0 && f.e1 <= pod + 0.1 ? { x0: 1, x1: G.pw - 1, z0: -pd / 2 + 1, z1: pd / 2 - 1 }
    : f.fr ? { x0: G.bx0 + bw * f.fr.x0, x1: G.bx0 + bw * f.fr.x1, z0: -bd / 2 + bd * f.fr.z0, z1: -bd / 2 + bd * f.fr.z1 } : { x0: G.bx0, x1: G.bx1, z0: -bd / 2, z1: bd / 2 }));
  const fh = sc.floors.map(f => f.e1 - f.e0);
  // 층별 기둥 줄: 판이 기준(외곽)과 다르면 그 판에 맞춰 다시 나눈다
  const lin = (a, b, n) => Array.from({ length: n + 1 }, (_, j) => a + (b - a) * j / n);
  const grid = (a, b, base) => (Math.abs(a - base[0]) < 0.5 && Math.abs(b - base[base.length - 1]) < 0.5 ? base : lin(a, b, Math.max(2, Math.round((b - a) / 8.4))));
  const isPod = sc.floors.map(f => pod > 0 && f.e1 <= pod + 0.1);
  const colsX = fp.map((q, i) => (isPod[i] ? lin(q.x0, q.x1, Math.max(3, Math.round((q.x1 - q.x0) / 8.4))) : grid(q.x0, q.x1, colX)));
  const colsZ = fp.map((q, i) => (isPod[i] ? colZ : grid(q.z0, q.z1, colZ)));
  const ok = [bw, bd, pd, Z, xl, xr].every(Number.isFinite) && sc.floors.every(f => Number.isFinite(f.e0) && Number.isFinite(f.e1));
  return { bw, bd, pd, Z, xl, xr, colX, colZ, colsX, colsZ, cz, pod, fp, fh, ok };
}

// ---------- 색 ----------
const COL = {
  fill: 0x9c8462, sand: 0xc9a86a, clay: 0x8f6e4e, soil: 0xa88a5e, wr: 0x7a7f8a, rock: 0x4c4f57,
  conc: 0xbab8b1, slab: 0xc9c7c1, dark: 0x6a6b6e, steel: 0x8fa1b5, glass: 0x5f88a8, water: 0x3d8fd6,
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
  const LITE = window.innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.5 : 2));
  renderer.setClearColor(BG, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const wrap = document.createElement('div'); wrap.className = 's3';
  wrap.innerHTML = `<div class="s3-hud"><span class="s3-c"></span><b class="s3-t"></b></div><div class="s3-hud r"><span class="s3-d"></span><b class="s3-day"></b></div><div class="s3-now" hidden></div>
    <div class="s3-lbs"></div><div class="s3-mks"></div><div class="s3-help">드래그 회전 · 휠/두 손가락 확대 · 우클릭 이동 · 사람을 누르면 이야기를 들어요</div><div class="s3-attr" hidden></div><div class="seg s3-vw" role="group" aria-label="3D 시점"><button type="button" data-v3="all" aria-pressed="true">전체 보기</button><button type="button" data-v3="focus" aria-pressed="false">작업 부위</button><button type="button" data-v3="life" aria-pressed="false">현장 사람들</button></div>
    <div class="s3-talk" role="dialog" aria-label="현장 사람과 대화" hidden><div class="s3-tk-h"><i class="s3-tk-av" aria-hidden="true"></i><div class="s3-tk-who"><b class="s3-tk-n"></b><span class="s3-tk-m"></span></div><button type="button" class="s3-tk-x" aria-label="대화 닫기">×</button></div><p class="s3-tk-l" aria-live="polite"></p><div class="s3-tk-f"><span class="s3-tk-i"></span><button type="button" class="s3-tk-p">‹ 이전</button><button type="button" class="s3-tk-nx">다음 ›</button></div></div>`;
  wrap.prepend(renderer.domElement);
  host.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const scene = new THREE.Scene();
  if (window.__S3DEBUG) {
    window.__s3scene = scene; // 점검용 (평소에는 꺼져 있음)
    // 발밑 점검: 사람마다 발 아래로 광선을 쏴 디딘 면과의 틈(gap)을 잰다. 떠 있으면 gap > 0, 묻히면 < 0
    window.__s3probe = (x, y, z) => { // 한 점 아래로 모든 면 (걸러내기 없이)
      scene.updateMatrixWorld(true); const rc = new THREE.Raycaster(new THREE.Vector3(x, y + 1.4, z), new THREE.Vector3(0, -1, 0), 0, 40); const all = []; scene.traverse(q => { if (q.isMesh || q.isInstancedMesh) { all.push(q); if (q.isInstancedMesh) q.boundingSphere = null; } });
      return rc.intersectObjects(all, false).slice(0, 12).map(h => { let v = true; for (let q = h.object; q; q = q.parent) if (!q.visible) v = false; const m = h.object.material || {}; return { y: +h.point.y.toFixed(2), wp: h.object.userData.wp || h.object.name || h.object.type, id: h.instanceId, vis: v, tr: !!m.transparent, op: m.opacity, cw: m.colorWrite, side: m.side, nm: !!h.object.userData.noMirror }; });
    };
    window.__s3float = () => {
      scene.updateMatrixWorld(true); const rc = new THREE.Raycaster(), dn = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
      const vis = (x) => { for (let q = x; q; q = q.parent) if (!q.visible) return false; return true; };
      const meshes = []; scene.traverse(x => { if (x.isInstancedMesh) x.boundingSphere = null; if (!(x.isMesh || x.isInstancedMesh) || x.userData.noMirror || !vis(x)) return; const m = x.material; const src = x.userData.src, base = x.userData.base || (src && src.userData.base) || m; if (!m || m.colorWrite === false || (!x.userData.support && base.transparent && base.opacity < 0.7) || x.isSky || x.userData.sky) return; if (x.isInstancedMesh && x.count === 0) return; meshes.push(x); });
      return (window.__s3work || []).map(w => {
        o.set(w.x, w.y + 1.4, w.z); rc.set(o, dn); rc.far = 6;
        let hs = rc.intersectObjects(meshes, false);
        // 앞쪽 절반(z>0)의 흙은 거울 복제라 광선이 안 맞는다: 뒤쪽 원본을 -z에서 잰다
        if (w.z > 0) { o.set(w.x, w.y + 1.4, -w.z); rc.set(o, dn); hs = hs.concat(rc.intersectObjects(meshes.filter(q => q.userData.twin), false)).sort((a, b) => b.point.y - a.point.y); }
        const h = hs.find(q => q.point.y <= w.y + 0.25);
        return { act: w.act, kind: w.kind || w.role || null, x: +w.x.toFixed(1), y: +w.y.toFixed(2), z: +w.z.toFixed(1), gap: h ? +(w.y - h.point.y).toFixed(2) : null, obj: h ? (h.object.userData.wp || h.object.name || (h.object.parent && h.object.parent.name) || h.object.type) + (h.object.isInstancedMesh ? "#" + h.instanceId : "") : null, lift: !!(w.lk && w.lk.lift) };
      });
    };
  }
  // 실사 장면: 하늘 돔 · 하늘을 구운 환경광(유리·금속 반사) · 대기 원근 · ACES 톤 매핑 · (GPU면) 앰비언트 오클루전
  // 공법 시뮬레이터는 화면 테마와 상관없이 늘 맑은 낮
  const look = createLook(renderer, scene, { lite: LITE });
  const P = readPalette({ day: true });
  // 실사 톤: 하얀 모형 대신 실제 도시의 색 (콘크리트·석재·벽돌·유리·아스팔트·녹지)
  Object.entries({
    ground: '#a9a698', site: '#a99e89', lot: '#a7a397', asphalt: '#5c5e62', walk: '#b8b3a8', curb: '#c9c5bc', mark: '#eeede8', markY: '#e0b03a',
    water: '#58788a', bank: '#b3aea3', skyTop: '#6e98c9', skyHor: '#d9e3ea', park: '#86a067', forest: '#5f7d4c', grass: '#98ad78', pitch: '#76a052', sand: '#cfc3a4',
    wRes: '#d6d0c3', wCom: '#b6b9bc', wHouse: '#b48d76', wTower: '#8e9eab', wInd: '#c3c0b9', wCivic: '#cbbfa6', roof: '#9d9b96',
    glass: '#4d6473', film: '#5f8f8a', interior: '#b9b09c', frame: '#4a4e53', crown: '#5c7a45', trunk: '#6a5847', edge: '#26282b',
    bridge: '#b7b5b0', ballast: '#8d887e', rail: '#55524d',
  }).forEach(([k, v]) => { if (P[k]) P[k].set(v); });
  FACADE_U.uGlass.value.copy(P.glass); FACADE_U.uFilm.value.copy(P.film); FACADE_U.uInterior.value.copy(P.interior); FACADE_U.uLit.value.copy(P.lit); FACADE_U.uFrame.value.copy(P.frame); FACADE_U.uNight.value = 0;
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.6, 12000);
  if (window.__S3DEBUG) { window.__s3cam = cam; window.__s3r = renderer; }
  const ctl = new OrbitControls(cam, renderer.domElement); if (window.__S3DEBUG) { window.__s3ctl = ctl; window.__s3render = () => { ctl.update(); look.render(cam); }; }
  ctl.enableDamping = true; ctl.dampingFactor = 0.09; ctl.maxPolarAngle = Math.PI * 0.495; ctl.minDistance = 8; ctl.maxDistance = 3200; ctl.screenSpacePanning = true;
  // 해: 대로 쪽 앞에서 비스듬히 (보이는 면이 밝고, 그림자는 뒤·왼쪽으로)
  const sunDir = new THREE.Vector3(0.62, 0.78, 0.42).normalize();
  const hemi = new THREE.HemisphereLight(0xeef3ff, 0x8a7d6a, 0.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1e0, 3.4); sun.castShadow = true;
  // 그래픽 가속이 없는(소프트웨어) 렌더러는 그림자 지도를 작게
  const SOFT = softwareGL(renderer);
  if (SOFT) renderer.setPixelRatio(1);
  simTexAniso(SOFT ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy() || 4));
  { const ms = Math.min(SOFT ? 1024 : LITE ? 2048 : 4096, renderer.capabilities.maxTextureSize || 2048); sun.shadow.mapSize.set(ms, ms); }
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.35;
  scene.add(sun); scene.add(sun.target);
  look.applyTheme(P, sunDir, true);
  function fitSun(D, G) {
    // 그림자 상자: 현장 가까이(가로·인접 블록)만. 먼 주변 맥락은 그림자 없이
    const cx = G.pw / 2, half = Math.max(160, (D.xr - D.xl) / 2 + 70, D.Z + 70, G.H * 0.9);
    sun.target.position.set(cx, 0, 0); sun.position.copy(sunDir).multiplyScalar(900).add(sun.target.position);
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 10, far: 2200 });
    sun.shadow.camera.updateProjectionMatrix(); sun.target.updateMatrixWorld();
  }

  let userMoved = false, follow = { t: new THREE.Vector3(), has: false }, lastWp = null, built = null, disposed = false;
  // 장면 일부(장비·차량·사람 등)가 그리다 실패해도 3D는 끄지 않는다: 그 부분만 건너뛰고 같은 오류는 한 번만 알린다
  const seenErr = new Set(); let badSc = null;
  const report = (where, e) => { const k = where + '|' + (e && e.message); if (seenErr.has(k)) return; seenErr.add(k); console.error(`[3D] ${where}:`, e); if (window.__S3DEBUG) (window.__s3errs || (window.__s3errs = [])).push({ where, msg: String(e && e.message), stack: String(e && e.stack).split('\n').slice(0, 6).join(' | ') }); };
  const safe = (where, fn, fb) => { try { return fn(); } catch (e) { report(where, e); return fb; } };
  // 넓은 주변 맥락: 먼저 자동 생성(바로), 실제 지도(OpenStreetMap)를 받으면 바꾼다
  const plan = opts.plan || (opts.gen && opts.gen.plan) || null, gen = opts.gen || null;
  let ctxSrc = null, ctxObj = null, ctxKey = '', ctxN = 0;
  const ctxId = new WeakMap(), idOf = (c) => { if (!ctxId.has(c)) ctxId.set(c, ++ctxN); return ctxId.get(c); };
  if (plan) { try { ctxSrc = fallbackFor(plan); } catch (e) { ctxSrc = null; } }
  const ctxAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (plan && opts.useMap !== false) {
    const ready = osmReady(plan);
    (ready ? Promise.resolve(ready) : osmFor(plan, { signal: ctxAbort && ctxAbort.signal })).then(c => { if (disposed || !c) return; ctxSrc = c; ensureContext(); }).catch(() => { /* 지도 실패: 자동 생성 맥락 그대로 */ });
  }
  function ensureContext() {
    if (!built || !ctxSrc || !plan || disposed) return;
    const { sc, D } = built, G = sc.G, zone = built.city.zone, C = sc.city;
    const roadX = C && C.road ? (C.road[0] + C.road[1]) / 2 : null;
    const key = [idOf(ctxSrc), G.pw, G.bx0, G.bx1, D.xl, D.xr, D.Z, zone.x0, zone.x1, zone.z0, zone.z1, roadX, G.main && G.main.id].join('|');
    if (key === ctxKey && ctxObj) { built.city.ground.forEach(o => { o.visible = false; }); return; }
    if (ctxObj) { scene.remove(ctxObj.group); ctxObj.dispose(); ctxObj = null; }
    try {
      ctxObj = buildSimContext(ctxSrc, { plan, gen, G, roadX, zone, near: { x0: D.xl, x1: D.xr, z0: -D.Z, z1: D.Z }, P, lite: LITE, renderer });
      ctxObj.group.traverse(o => { if (o.isMesh && o !== ctxObj.mask) { o.receiveShadow = true; } });
      scene.add(ctxObj.group); ctxKey = key;
      built.city.ground.forEach(o => { o.visible = false; });
      const at = $('.s3-attr'); at.hidden = ctxSrc.source !== 'osm'; at.textContent = OSM_ATTRIB;
      if (window.__S3DEBUG) { window.__s3ctx = ctxObj.stats; window.__s3ctxSrc = ctxSrc; window.__s3ctxObj = ctxObj; }
    } catch (e) { console.warn('주변 맥락', e); ctxObj = null; built.city.ground.forEach(o => { o.visible = true; }); }
  }
  ctl.addEventListener('start', () => { userMoved = true; });
  // 시점: 전체 보기(기본, 현장·건물 전체를 고정 시점으로) · 작업 부위(작업 전선을 따라감) · 현장 사람들(현장사무소·휴게실·TBM 마당). 다시 누르면 시점을 되돌린다
  let viewMode = 'all';
  try { const v = localStorage.getItem('bim.sim3dView'); if (v === 'focus' || v === 'life') viewMode = v; } catch { /* 저장소 없음 */ }
  const paintVw = () => wrap.querySelectorAll('[data-v3]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v3 === viewMode)));
  paintVw();
  wrap.querySelectorAll('[data-v3]').forEach(b => b.addEventListener('click', () => { viewMode = b.dataset.v3; userMoved = false; lastWp = null; paintVw(); try { localStorage.setItem('bim.sim3dView', viewMode); } catch { /* 저장소 없음 */ } }));

  // 공유 형상·재질
  const BOX = new THREE.BoxGeometry(1, 1, 1); BOX.translate(0, 0, 0);
  const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const CONE = new THREE.ConeGeometry(0.5, 1, 8);
  const mats = new Map(), accMats = new Map(), all = [];
  const clipList = [];
  // o.tex: 질감 (conc 콘크리트 · soil 흙 · asph 아스팔트 · paver 보도블록 · steel 철재 · ply 합판 · gravel 쇄석)
  // o.clip: 지상 건물 부재 (지하 공종을 볼 때 흐리게 한다. 예전 이름 그대로)
  function mat(color, o = {}) {
    const key = `${color}|${o.op ?? 1}|${o.em ?? 0}|${o.clip ? 1 : 0}|${o.wire ? 1 : 0}|${o.tex || ''}|${o.rough ?? ''}|${o.metal ?? ''}|${o.env ?? ''}`;
    if (mats.has(key)) return mats.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.82, metalness: o.metal ?? 0.05, transparent: (o.op ?? 1) < 1, opacity: o.op ?? 1, depthWrite: (o.op ?? 1) >= 1, emissive: o.em ? new THREE.Color(color) : new THREE.Color(0), emissiveIntensity: o.em || 0, wireframe: !!o.wire, side: (o.op ?? 1) < 1 ? THREE.DoubleSide : THREE.FrontSide });
    if (o.tex) { const t = simTex(o.tex); if (t) { m.map = t; triplanar(m); } }
    if (o.env != null) m.envMapIntensity = o.env;
    if (o.clip) { m.clippingPlanes = []; clipList.push(m); m.userData.above = true; }
    mats.set(key, m); return m;
  }
  const dimMats = new Map(), ghostMats = new Map();
  function dimOf(m) {
    if (dimMats.has(m)) return dimMats.get(m);
    const a = keepTriplanar(m, m.clone()); a.transparent = true; a.opacity = Math.min(m.opacity, 0.14); a.depthWrite = false; a.side = THREE.DoubleSide;
    dimMats.set(m, a); return a;
  }
  // 반투명 (앞쪽 땅·흙막이 · 실내 공종 때 외장): op 불투명도
  function ghostOf(m, op) {
    const k = ghostMats.get(m) || new Map(); ghostMats.set(m, k);
    if (k.has(op)) return k.get(op);
    const a = keepTriplanar(m, m.clone()); a.transparent = true; a.opacity = Math.min(m.opacity, op); a.depthWrite = false; a.side = THREE.DoubleSide; a.userData.ghost = true;
    k.set(op, a); return a;
  }
  function accOf(m) {
    if (accMats.has(m)) return accMats.get(m);
    const a = keepTriplanar(m, m.clone()); if (a.color) a.color = m.color.clone().lerp(ACC, 0.07);
    if (a.emissive) { a.emissive = ACC.clone(); a.emissiveIntensity = 0.035; } // 발광이 없는 재질(MeshBasic: 철근 배근 판)에 emissive를 붙이면 그릴 때 오류가 난다
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

    // --- 땅: 현장 둘레 흙 덩어리. 단면으로 자르지 않는다 ---
    // 뒤쪽 절반(z ≤ 0)을 만들고 앞쪽 절반은 거울 복제(twin)로 채운다. 지하 공종을 볼 때는 앞쪽 흙·지표를 반투명하게 해 땅속을 보인다
    const mirror = new THREE.Group(); mirror.scale.z = -1; mirror.name = 'front-half'; root.add(mirror);
    const twins = [];
    // front: 지하 공종을 볼 때 앞쪽 복제본의 불투명도 (null이면 그대로)
    const twin = (o, front = null) => {
      if (!o || o.userData.twin) return o;
      const t = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, o.material, 1) : new THREE.Mesh(o.geometry, o.material);
      if (o.isInstancedMesh) { t.instanceMatrix = o.instanceMatrix; t.instanceColor = o.instanceColor; t.frustumCulled = false; t.count = 0; }
      t.userData.src = o; t.userData.front = front; t.userData.support = !!o.userData.support || !(o.material && o.material.transparent && (o.material.opacity ?? 1) < 0.7); // 지하 공종에서 반투명으로 보여도 디딤 면 o.userData.twin = t; mirror.add(t); twins.push(t); return t;
    };
    const ground = new THREE.Group(); root.add(ground);
    const SURF = 0.5; // 지표 (쇄석·포장) 두께
    const strata = sc.strata.filter(([a, b]) => a < sc.dv && Math.min(b, sc.dv) > SURF + 0.05).map(([a, b, k]) => ({ a: Math.max(a, SURF), b: Math.min(b, sc.dv), m: mat(COL[k] ?? COL.soil, { rough: 0.95, tex: 'soil' }), pieces: [] }));
    strata.forEach(L => { for (let i = 0; i < 4; i++) { const o = mesh(BOX, L.m, null, ground); o.userData.support = true; L.pieces.push(o); twin(o, 0.2); } });
    // 지층 경계선: 흙 덩어리 바깥 네 면에 (지하 공종에서 지층 두께가 읽히게)
    const bndM = mat(0xf2ede2, { em: 0.35 }), bnd = inst(BOX, bndM, Math.max(1, strata.length) * 4, null);
    { let n = 0; strata.slice(1).forEach(L => { const y = -L.a; ibox(bnd, n++, D.xl, D.xr, y - 0.07, y + 0.07, -Z - 0.03, -Z + 0.05); ibox(bnd, n++, D.xl, D.xr, y - 0.07, y + 0.07, Z - 0.05, Z + 0.03); ibox(bnd, n++, D.xl - 0.03, D.xl + 0.05, y - 0.07, y + 0.07, -Z, Z); ibox(bnd, n++, D.xr - 0.05, D.xr + 0.03, y - 0.07, y + 0.07, -Z, Z); }); bnd.count = n; }
    // 지표 (쇄석 포장): 대지 둘레 띠 + 굴착 전 대지 덮개
    const surfM = mat(0xa39883, { rough: 1, tex: 'gravel' });
    const front = [box(surfM, null, D.xl, 0, -SURF, 0, -Z, 0, ground), box(surfM, null, pw, D.xr, -SURF, 0, -Z, 0, ground), box(surfM, null, 0, pw, -SURF, 0, -Z, -pd / 2, ground)];
    front.forEach(o => { o.userData.support = true; twin(o, 0.22); });
    const pitLid = box(surfM, null, 0, pw, -SURF, 0, -pd / 2, 0, ground); pitLid.userData.support = true; twin(pitLid, 0.22);
    // 지하수위: 흙 속에 얇은 물 막 + 바깥 네 면에 파란 선 (지하 공종에서만)
    const gwM = mat(COL.water, { op: 0.28, em: 0.25 }), gwEdge = mat(COL.water, { em: 0.6 });
    const gwY = -cond.gw;
    const gwPl = [box(gwM, null, D.xl, 0, gwY - 0.05, gwY + 0.05, -Z, 0, ground), box(gwM, null, pw, D.xr, gwY - 0.05, gwY + 0.05, -Z, 0, ground), box(gwM, null, 0, pw, gwY - 0.05, gwY + 0.05, -Z, -pd / 2, ground)];
    gwPl.forEach(o => twin(o));
    const gwLine = inst(BOX, gwEdge, 4, null);
    ibox(gwLine, 0, D.xl, D.xr, gwY - 0.1, gwY + 0.1, -Z - 0.04, -Z + 0.06); ibox(gwLine, 1, D.xl, D.xr, gwY - 0.1, gwY + 0.1, Z - 0.06, Z + 0.04); ibox(gwLine, 2, D.xl - 0.04, D.xl + 0.06, gwY - 0.1, gwY + 0.1, -Z, Z); ibox(gwLine, 3, D.xr - 0.06, D.xr + 0.04, gwY - 0.1, gwY + 0.1, -Z, Z); gwLine.count = 4;
    // 주변 가로: 대로·보도·건너편 블록·이면도로·인접 건물·통행 차량·매설물·출입구 (city3d.js)
    const city = buildCity({ root, mat, inst, ibox, box, mesh, BOX, CYL, CONE, sc, D, _p, _q, _s, _e, _m });
    const lanes = sc.city.lanes, laneX = (i) => city.laneX(Math.min(i, lanes.length - 1)) ?? pw + 12;
    const fleet = buildFleet({ root, sc, D, city });
    const PX = laneX(0), MX = lanes.length > 1 ? laneX(1) : PX + 3.4, CRX = lanes.length > 1 ? (lanes[0].x0 + lanes[1].x1) / 2 : PX;
    const crane2 = ['crawler', 'ringer', 'mobile'].includes(ids.lift);
    // 안전 난간 · 추락 방지망 · 낙하물 방지망 · 자재 적치 (지금 짓는 층)
    const railI = inst(BOX, mat(0xffd23a, { em: 0.15 }), 220, null);
    const netM = mat(0x3fae6a, { op: 0.16 }), nets = [0, 1, 2, 3].map(() => mesh(BOX, netM, null));
    // 시스템 비계 (재래식·알루미늄 거푸집, 철골): 강관 수직재·수평재·가새 + 주황 작업 발판
    const scafI = inst(BOX, mat(0xb4bac2, { metal: 0.6, rough: 0.4 }), 1600, null), plankI = inst(BOX, mat(0xd9893a, { rough: 0.75 }), 200, null);
    const fanI = inst(BOX, mat(0x8fa1b5, { op: 0.55 }), 16, null);
    const stockI = inst(BOX, mat(0xffffff), 8, null);
    [0xd9822b, 0xd9822b, 0x9fb3c8, 0x9fb3c8, 0xc58a4a, 0xc58a4a, 0x8fa1b5, 0x8fa1b5].forEach((c, i) => stockI.setColorAt(i, new THREE.Color(c)));

    // --- 지반조사·개량 (단면 앞면에 한 줄) ---
    const bores = []; { const n = ids.survey === 'ai' ? 5 : ids.survey === 'spt' ? 3 : 4; for (let i = 0; i < n; i++) bores.push(-2 + (pw + 4) * (i + 0.5) / n); }
    const boreM = mat(0xe7e7ea, { em: 0.3 });
    const boreI = inst(CYL, boreM, bores.length, 'survey');
    const rigI = inst(BOX, mat(COL.eq, { metal: 0.3 }), bores.length * 2, 'survey');
    const impM = mat(0xb0aba0, { op: 0.85 }), impXs = []; for (let x = -4; x <= pw + 4; x += ids.improve === 'dcm' ? 5 : 3) impXs.push(x);
    const impI = inst(CYL, impM, impXs.length, 'improve');

    // --- 흙막이 (뒤쪽 절반: 좌·우·뒤) ---
    const th = Math.max(sc.wallTh, 0.3);
    const wallM = mat(WALL_C[ids.wall] ?? 0x86868c, { metal: ids.wall === 'hpile' || ids.wall === 'sheet' ? 0.4 : 0.05, tex: ids.wall === 'hpile' || ids.wall === 'sheet' ? 'steel' : 'conc' });
    const walls = [0, 1, 2].map(() => mesh(BOX, wallM, 'wall'));
    const capM = mat(0x9a9993, { tex: 'conc' });
    // 지보: 버팀보·띠장 (층마다), 어스앵커 (단면 앞면), 역타 슬래브
    const lv = []; if (depth > 0.5) for (let m = 1.5; m < depth - 1; m += 3.5) lv.push(m);
    const strutZ = []; for (let z = -pd / 2 + 4; z < -2; z += 8) strutZ.push(z);
    const supM = mat(ids.support === 'sps' ? 0x9fb3c8 : 0xcf6a3a, { metal: 0.45, rough: 0.5, tex: 'steel' });
    const strutI = inst(BOX, supM, lv.length * (strutZ.length + 3), 'support');
    const ancI = inst(CYL, mat(0xd9d9de, { metal: 0.5 }), lv.length * 2, 'support');
    const tdSlab = inst(BOX, mat(COL.slab, { tex: 'conc' }), Math.max(1, G.nB) + 1, 'support');
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
    const pileI = inst(CYL, mat(PILE_C[ids.found] ?? 0xb8b8bc, { tex: ids.found === 'steel' || ids.found === 'micro' ? 'steel' : 'conc', metal: ids.found === 'steel' || ids.found === 'micro' ? 0.45 : 0.05 }), pileXs.length * 7, 'found');
    const thick = sc.d.superTall ? 3.5 : sc.d.tall ? 2.6 : sc.d.heavy ? 2 : 1.4;
    const matM = mat(0xaaa8a2, { tex: 'conc' });
    const matSlab = mesh(BOX, matM, 'found');
    const rig = new THREE.Group(); root.add(rig); { const m2 = mat(COL.eq, { metal: 0.3 }); const b2 = mesh(BOX, m2, 'found', rig); b2.scale.set(3, 2, 3); b2.position.y = 1.4; const ms = mesh(BOX, m2, 'found', rig); ms.scale.set(0.5, 18, 0.5); ms.position.set(0.8, 11, 0); rig.userData.mast = ms; }

    // --- 지하 방수 · 지하 골조 (뒤쪽 절반) ---
    const bwpM = mat(BWP_C[ids.bwp] ?? 0x2b2b2b, { rough: 0.6 });
    const bwpI = inst(BOX, bwpM, 4, 'bwp');
    const nB = Math.max(1, G.nB), bsh = depth / nB;
    const bslab = inst(BOX, mat(COL.slab, { tex: 'conc' }), nB + 1, 'base');
    const bwallI = inst(BOX, mat(COL.conc, { tex: 'conc' }), 3, 'base');
    const bcolI = inst(BOX, mat(COL.conc, { tex: 'conc' }), 7 * Math.max(2, strutZ.length) * 2, 'base');

    // --- 지상 골조 (층마다) ---
    const clipM = (c, o = {}) => mat(c, { ...o, clip: true });
    const slabI = inst(BOX, clipM(COL.slab, { tex: 'conc' }), NF, 'frame');
    const steelF = ['steel', 'hybrid', 'stick', 'truss', 'module'].includes(ids.frame);
    const colPer = D.fp.map((f, i) => D.colsX[i].length * D.colsZ[i].length);
    const colOff = [0]; colPer.forEach((n, i) => colOff.push(colOff[i] + n));
    const colI = inst(BOX, clipM(steelF ? COL.steel : COL.conc, { metal: steelF ? 0.5 : 0.05, tex: steelF ? 'steel' : 'conc' }), colOff[NF], 'frame');
    const colPos = [];
    sc.floors.forEach((f, i) => {
      const fp = D.fp[i], xs = D.colsX[i], zs = D.colsZ[i];
      let k = colOff[i]; const w = steelF ? 0.5 : 0.8;
      const cp = []; colPos.push(cp); xs.forEach(x => zs.forEach(z => { cp.push([x, z]); ibox(colI, k++, x - w / 2, x + w / 2, f.e0 + 0.18, f.e1 - 0.32, z - w / 2, z + w / 2); }));
      ibox(slabI, i, fp.x0, fp.x1, f.e1 - 0.32, f.e1 + 0.18, fp.z0, fp.z1);
    });
    // 콘크리트 색: 같은 회색 상자가 쌓인 '레고' 느낌을 덜려고 층(타설 묶음)마다 조금씩 다르고, 갓 친 층은 젖어서 어둡다가 마르며 밝아진다
    const pourTint = (() => {
      const hs = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7 + NF * 0.37) * 43758.5453; return v - Math.floor(v); };
      const batch = sc.floors.map((_, i) => ({ l: 0.94 + 0.08 * hs(i, 1), w: (hs(i, 2) - 0.5) * 0.035 }));
      [slabI, colI].forEach(o => { o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.instanceMatrix.count * 3).fill(1), 3); });
      const c = new THREE.Color(); let last = '';
      return (fl, nF) => {
        const k = `${nF}|${Math.round(fl * 8)}`; if (k === last) return; last = k;
        for (let i = 0; i < nF; i++) {
          const age = Math.max(0, fl - (i + 1)), wet = Math.exp(-age / 1.4); // 1 → 갓 친 층, 0 → 다 마른 층
          const L = batch[i].l * (1 - 0.2 * wet), w = batch[i].w;
          c.setRGB(L * (1 + w) * (1 - 0.03 * wet), L, L * (1 - w) * (1 + 0.025 * wet));
          slabI.setColorAt(i, c);
          if (!steelF) { const L2 = L * (0.97 + 0.03 * hs(i, 3)); c.setRGB(L2 * (1 + w), L2, L2 * (1 - w)); for (let k2 = colOff[i]; k2 < colOff[i + 1]; k2++) colI.setColorAt(k2, c); }
        }
        slabI.instanceColor.needsUpdate = true; colI.instanceColor.needsUpdate = true;
      };
    })();
    // 코어 (속이 빈 네 벽)
    const coreM = clipM(0xaeaca5, { tex: 'conc' });
    const core = [0, 1, 2, 3].map(() => mesh(BOX, coreM, 'frame'));
    // 미정 골조: 외곽선
    const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(BOX), new THREE.LineBasicMaterial({ color: 0x9a9aa0, transparent: true, opacity: 0.55 }));
    setBox(ghost, G.bx0, G.bx1, 0, G.H, -bd / 2, bd / 2); root.add(ghost);
    // 거푸집·철근·타설 (지금 층)
    const formM = clipM(COL.form, { op: 0.55, tex: 'ply' }), formBox = mesh(BOX, formM, 'form');
    const acs = mesh(BOX, clipM(0x6d859e, { op: 0.9, tex: 'panel', metal: 0.4, rough: 0.5 }), 'form');
    const shoreI = inst(BOX, clipM(0xffb547), 120, 'form');
    const rebarTex = rebarMatTex(); rebarTex.wrapS = rebarTex.wrapT = THREE.RepeatWrapping; rebarTex.repeat.set((G.bx1 - G.bx0) / 1.2, bd / 1.2);
    const rebarM = new THREE.MeshStandardMaterial({ map: rebarTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.65, metalness: 0.35, clippingPlanes: [] }); clipList.push(rebarM);
    // 기둥 철근 (다음 층으로 이어질 주근이 슬래브 위로 솟는다)
    const starterI = inst(BOX, clipM(0x6e4a36, { metal: 0.35, rough: 0.7 }), 900, 'rebar');
    const rebarP = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), rebarM); root.add(rebarP); tag(rebarP, 'rebar');
    const pourM = clipM(0x8f8e8a, { rough: 0.35, tex: 'conc' }), pourBox = mesh(BOX, pourM, 'pour');
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
    const sTex = skinTex(ids.skin), cellW = sTex ? sTex.userData.cell : glassy ? 1.5 : 3;
    const texX = sTex || (glassy ? gridTex('#d6e4f2', 4, 0.9) : gridTex('#6b6b70', 2, 0.6)), texZ = texX.clone();
    const fH = D.fh.length ? D.fh.reduce((a, b) => a + b, 0) / D.fh.length : 4;
    [texX, texZ].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; });
    texX.repeat.set((G.bx1 - G.bx0) / cellW, 1); texZ.repeat.set(bd / cellW, 1);
    const skinMat = (tex) => { const m = new THREE.MeshStandardMaterial({ color: sTex && !glassy ? 0xffffff : skC, map: tex, transparent: glassy, opacity: glassy ? Math.max(skOp, 0.58) : skOp, depthWrite: !glassy, roughness: glassy ? 0.06 : 0.8, metalness: glassy ? 0.55 : 0.05, envMapIntensity: glassy ? 1.4 : 1, side: THREE.DoubleSide, clippingPlanes: [] }); m.userData.above = true; clipList.push(m); return m; };
    const skinX = inst(BOX, skinMat(texX), NF * 2, 'skin'), skinZ = inst(BOX, skinMat(texZ), NF * 2, 'skin');
    // 창호·단열 (외장 안쪽 띠): 창호는 외장 띠 위에 테두리, 단열은 노란 층
    const glazI = inst(BOX, clipM(0xe7e7ea, { metal: 0.4 }), NF * 4, 'glaz');
    const insI = inst(BOX, clipM(COL.ins), NF * 2, 'insul');
    // 지붕
    const roofL = mesh(BOX, clipM(ROOF_C[ids.roof] ?? 0x9a9aa0), 'roof');
    const parI = inst(BOX, clipM(COL.conc, { tex: 'conc' }), 4, 'roof');
    const pvI = inst(BOX, mat(0x253a6e, { metal: 0.6, rough: 0.3 }), 60, 'roof');
    const ctI = inst(CYL, mat(0xd9d9de, { metal: 0.3 }), 8, 'hvac');
    const oduI = inst(BOX, mat(0xd9d9de, { metal: 0.3 }), 24, 'hvac');
    const rtreeI = inst(CONE, mat(COL.tree), 30, 'roof');

    // --- 설비 (층마다, 코어 주변) ---
    const z0 = -bd / 2, rz = (f) => z0 + bd * f;
    const sys = {
      // 실제 자재 색: 아연도 덕트 · 배관(회청) · 소방 배관(적색 도장) · 전선 트레이(아연도, 살짝 따뜻하게) · 통신 트레이(회보라)
      hvac: { c: 0xb4bcc4, w: 1.4, h: 0.6, y: 0.55, z: 0.3, mt: 0.55 }, plumb: { c: 0x6f8ea6, w: 0.35, h: 0.35, y: 0.8, z: 0.4, mt: 0.3 },
      fire: { c: 0xb5352f, w: 0.2, h: 0.2, y: 0.42, z: 0.46, mt: 0.2 }, elec: { c: 0xb9ad94, w: 0.8, h: 0.15, y: 0.66, z: 0.22, mt: 0.5 }, ict: { c: 0x8e88a6, w: 0.5, h: 0.12, y: 0.74, z: 0.14, mt: 0.35 },
    };
    const sysI = {}, riser = {};
    Object.entries(sys).forEach(([k, s]) => {
      sysI[k] = inst(BOX, clipM(s.c, { em: 0.04, metal: s.mt, rough: 0.5 }), NF * (k === 'hvac' ? 3 + D.colX.length * 2 : 3), k);
      riser[k] = mesh(BOX, clipM(s.c, { em: 0.05, metal: s.mt, rough: 0.5 }), k);
    });
    const sprI = inst(BOX, clipM(0xb5352f, { em: 0.08 }), NF * 24, 'fire');
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
    const treeI = inst(CONE, mat(COL.tree), 60, 'land'), trunkI = inst(CYL, mat(COL.trunk), 60, 'land');
    const paveI = inst(BOX, mat(COL.pave), 4, 'land');

    // 야적장 (자재 더미·가설물): 건물 둘레 빈 땅
    const yard = safe('야적장 만들기', () => buildYard({ root, sc, D }), null);
    // 현장 사람들: 현장 앞 가설 사무소 단지 (2층 현장사무소 · 근로자 휴게실 · TBM 마당 · 국기 · 공사 안내판)와 그곳 사람들의 하루
    const lifeB = safe('현장 사람들 만들기', () => buildSiteLife({ root, mat, BOX, sc, D, city }), null);
    const sup = safe('발 디딤 면', () => createSupport(scene), null);
    // 공법별 장면 (장비·부재·순서): 공통 부재를 숨기거나 덮어쓴다
    const meth = buildMethods({ root, mat, clipM, inst, mesh, box, setBox, ibox, BOX, CYL, CONE, sc, D, clipList, R: { strata, bores, boreI, rigI, impI, walls, strutI, ancI, tdSlab, exc, trucks, pileI, matSlab, rig, bwpI, slabI, colI, core, formBox, acs, shoreI, rebarP, rebarTex, pourBox, cageI, sparkI, pump, boom, mixers, crane, mast, mastS, slew, jib, cjib, cwt, cab, apex, hookL, hookLoad, hMast, hCar, hCar2, skinX, skinZ, roofL, lv, strutZ, skinGlassy: glassy } });

    // 땅속 부재는 앞쪽 절반을 거울 복제로 (흙막이 둘레 전체 · 지보 · 말뚝 · 지하 구조). 시공 장비 묶음(Group)과 한 자리 표시물은 빼고
    // 흙막이·방수·지하 외벽처럼 앞을 가리는 벽은 지하 공종에서 앞쪽을 반투명하게
    const MIRROR_WPS = new Set(['improve', 'wall', 'support', 'water', 'found', 'bwp', 'base']);
    root.children.slice().forEach(o => { if (!(o.isMesh || o.isInstancedMesh) || o.userData.noMirror || !MIRROR_WPS.has(o.userData.wp)) return; twin(o, o.userData.wp === 'wall' || o.userData.wp === 'bwp' || o === bwallI ? 0.3 : null); });
    const SKIN_WPS = new Set(['skin', 'insul']);

    // ---------- 시각별 갱신 ----------
    function frameAt(st) {
      const { wpId, tau, T } = st;
      const K = (k) => sc.known.has(k), P = (k) => progAt(sc, k, tau);
      const lifeV = !!st.life; // '현장 사람들' 시점: 땅속 공종이어도 앞쪽을 반투명하게 하지 않는다
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
      // 지하 공종: 앞쪽 흙·지표는 반투명 (twin의 front 불투명도), 지하수위·지층선을 보인다
      const underV = UNDER_WPS.has(wpId), seeV = underV && !lifeV;
      front.forEach(o => { o.visible = true; });
      pitLid.visible = dug < 0.6;
      const gwOn = underV && cond.gw < sc.dv && cond.gw > SURF;
      gwLine.visible = gwOn; bnd.visible = underV; gwPl.forEach(o => { o.visible = gwOn; });
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
      trucks.forEach(t => { t.visible = false; }); // 덤프는 물류 차량(fleet3d)이 게이트로 드나든다
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
      pourTint(fl, nF);
      // 완성 볼륨 윤곽: 골조 전에는 건물 전체, 골조가 오르는 동안에는 아직 안 올라간 위쪽만 (전체 보기 위쪽 빈 하늘이 '올라갈 자리'로 읽히게)
      ghost.visible = !UNDER_WPS.has(wpId) && (!K('frame') || nF < NF);
      if (ghost.visible) { if (!K('frame') || nF === 0) setBox(ghost, G.bx0, G.bx1, 0, G.H, -bd / 2, bd / 2); else { const q = D.fp[NF - 1] || { x0: G.bx0, x1: G.bx1, z0: -bd / 2, z1: bd / 2 }; setBox(ghost, q.x0, q.x1, sc.floors[nF - 1].e1, G.H, q.z0, q.z1); } }
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
      let nst2 = 0; if (active && stage >= 1 && stage < 3 && ids.form !== 'pcf' && !steelF && colPos[nF] && !['rcwall', 'modular', 'pc'].includes(ids.frame)) for (const [x, z] of colPos[nF]) { for (let q = 0; q < 8 && nst2 < 900; q++) { const a = q * Math.PI / 4 + Math.PI / 8, bx = x + Math.cos(a) * 0.3, bz = z + Math.sin(a) * 0.3; ibox(starterI, nst2++, bx - 0.016, bx + 0.016, f.e1 - 0.3, f.e1 + 1.05 + (q % 2) * 0.12, bz - 0.016, bz + 0.016); } }
      starterI.count = nst2; starterI.instanceMatrix.needsUpdate = true;
      // 철골 불꽃
      let nsp = 0;
      if (active && K('steel') && steelF && ids.steel !== 'none' && (ids.steel === 'weld' || ids.steel === 'robot')) D.colX.forEach((x, j) => { if ((T * 4 + j) % 1 > 0.6) return; for (let q = 0; q < 4 && nsp < 40; q++) { const an = q * 1.6 + T * 9; ibox(sparkI, nsp++, x + Math.cos(an) * 0.4 - 0.05, x + Math.cos(an) * 0.4 + 0.05, f.e0 + 1.2 + Math.sin(an) * 0.4 - 0.05, f.e0 + 1.2 + Math.sin(an) * 0.4 + 0.05, -bd / 2 - 0.1, -bd / 2 + 0.1); } });
      sparkI.count = nsp; sparkI.instanceMatrix.needsUpdate = true;
      // 펌프카
      const pourNow = active && stage === 2 && (K('conc') || K('pour'));
      pump.visible = pourNow || (wpId === 'pour' && active);
      if (pump.visible) {
        pump.position.set(PX, 0.1, -bd / 4);
        const tx = fp.x0 + (fp.x1 - fp.x0) * 0.5 - PX, ty = f.e1 + 1, H = f.e1, reach = ids.pour === 'boom' || ids.pour === 'multi' ? 58 : 0;
        const ok = reach && H <= reach, b1 = boom[0], b2 = boom[1], b3 = boom[2];
        if (ok || !reach) {
          const midY = Math.max(ty + 6, 12), mx = tx * 0.45;
          seg(b1, 0, 3, -3, mx, midY, 0); seg(b2, mx, midY, 0, tx, ty + 3, 0); seg(b3, tx, ty + 3, 0, tx, ty, 0);
          if (!reach) { const cxl = G.core.x1 + 0.4 - PX, an = Math.sin(T * 0.6) * 0.8, Lb = Math.min(14, (G.bx1 - G.bx0) * 0.45); seg(b1, -1, 1, bd / 4, cxl, 1, bd / 4); seg(b2, cxl, 1, bd / 4, cxl, H + 1, bd / 4); seg(b3, cxl, H + 2.4, bd / 4, cxl + Math.cos(an) * Lb, H + 2.4, bd / 4 + Math.sin(an) * Lb); }
        } else { seg(b1, 0, 3, 0, -6, reach, 0); seg(b2, -6, reach, 0, -10, reach - 4, 0); seg(b3, -10, reach - 4, 0, -10, reach - 6, 0); }
      }
      mixers.forEach((m, i) => { m.visible = pourNow; if (pourNow) m.position.set(MX, 0.1, -bd / 4 + 8 + i * 10); });

      // 크레인
      const needCrane = (structP > 0 && structP < 1) || wpId === 'lift' || (skinP > 0 && skinP < 1 && ['unitcw', 'pcpanel', 'metal'].includes(ids.skin));
      const showCrane = needCrane && !UNDER_WPS.has(wpId);
      const n2 = Math.min(NF, Math.ceil(fl)), top = n2 > 0 ? sc.floors[n2 - 1].e1 : 0, Hc = Math.max(top + 14, 24), R = sc.fx.craneR || 60;
      crane.visible = showCrane && K('lift'); crGhost.visible = showCrane && !K('lift');
      if (crGhost.visible) setBox(crGhost, sc.crX - 1, sc.crX + 1, 0, Hc, -bd / 2 - 6, -bd / 2 - 4);
      if (crane.visible) {
        const k = ids.lift, cxp = crane2 ? CRX : sc.crX, czp = k === 'crawler' || k === 'ringer' || k === 'mobile' ? 0 : -bd / 2 - 5;
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
      fence.forEach((o, i) => { o.visible = prepOn && !(seeV && (i === 2 || i === 3)); if (!o.visible) return; const za = -pd / 2 - 3, zb = pd / 2 + 3; if (i === 0) setBox(o, pl - 0.15, pl + 0.15, 0, hfx, za, zb); if (i === 1) setBox(o, pl, pw + 5, 0, hfx, za - 0.15, za + 0.15); if (i === 2) setBox(o, pl, pw + 5, 0, Math.min(hfx, 3), zb - 0.15, zb + 0.15); if (i === 3) setBox(o, pw + 4.85, pw + 5.15, 0, Math.min(hfx, 3), za, zb - 10); });
      city.offices(false, 0); // 예전 대지 옆 컨테이너 대신 현장 앞 사무소 단지 (sitelife3d.js)
      if (yard) safe('야적장', () => yard.frame({ on: structP > 0 && !underV && !(K('land') && P('land') > 0.05) && (depth <= 0.5 || baseP >= 0.999 || (topdown && tdSlab.visible)), // 굴착한 터가 아직 열려 있으면 (지하 골조 전) 땅이 없으니 놓지 않는다
 phase: structP < 1 ? structP : 1 + 0.6 * Math.max(skinP, P('fin')) }));
      if (yard && window.__S3DEBUG) window.__s3yard = { n: yard.count, vis: yard.group.visible, structP, baseP, depth, prep: P('prep'), land: P('land') };
      // 조경
      let ntr = 0, npv2 = 0;
      if (K('land') && P('land') > 0) {
        const lp = clamp(P('land') * 1.2, 0, 1), k = ids.land;
        [[0.6, G.bx0 - 0.6], [G.bx1 + 0.6, pw - 0.6]].filter(([s, e]) => e - s > 1.2).forEach(([s, e]) => { ibox(paveI, npv2++, s, s + (e - s) * lp, 0, k === 'ind' ? 0.45 : k === 'deck' ? 1.2 : 0.25, -pd / 2 + 1, pd / 2 - 1); if (k !== 'ind') for (let x = s + 3; x < s + (e - s) * lp - 1 && ntr < 60; x += 6) for (let z = -pd / 2 + 4; z < pd / 2 - 3 && ntr < 60; z += 9) { const yb = k === 'deck' ? 1.2 : 0.25; ibox(trunkI, ntr, x - 0.15, x + 0.15, yb, yb + 2.4, z - 0.15, z + 0.15); ibox(treeI, ntr++, x - 1.4, x + 1.4, yb + 1.6, yb + 5.4, z - 1.4, z + 1.4); } });
      }
      treeI.count = trunkI.count = ntr; paveI.count = npv2; [treeI, trunkI, paveI].forEach(o => { o.instanceMatrix.needsUpdate = true; });

      // 작업자: 지금 단계의 작업 유형에 맞춘 작업조 (crew3d.js: 관절 모형 · 동작 · 자리 옮기기 · 자재 나르기)
      const work = [];
      const aNow = st.step && st.step.wp === wpId && CREW_KINDS.includes(st.step.a) ? st.step.a : null;
      const crewN = (k, f = 1) => Math.round(clamp(((ARCH[k] || ARCH.generic).crew || 4) * f, 2, 16));
      const crewTags = [];
      const team = (kind, n, x0, x1, y, z0, z1, seed, o) => {
        if (!(x1 - x0 > 1 && z1 - z0 > 1)) return; const ws = crewPlan(kind, n, { x0, x1, y, z0, z1 }, T, seed, o); ws.forEach(w => work.push(w));
        // 작업조 이름표 (멀리서도 무슨 일을 몇 명이 하는지): 사람이 셋 이상인 조만
        if (ws.length >= 3 && ARCH[kind]) crewTags.push({ t: `${ARCH[kind].n} · ${ws.length}명`, p: [ws.reduce((s, w) => s + w.x, 0) / ws.length, y + 2.6, ws.reduce((s, w) => s + w.z, 0) / ws.length], cls: 'eq crew', n: ws.length });
      };
      const FRW = ['frame', 'form', 'rebar', 'conc', 'pour', 'steel', 'lift'];
      const cutNow = CUT_WPS.has(wpId);
      const stageKind = (sg) => (sg === 0 ? (steelF ? 'steel' : 'form') : sg === 1 ? 'rebar' : sg === 2 ? 'pour' : 'cure');
      if (active) {
        const mine = FRW.includes(wpId), kind = mine && aNow ? aNow : stageKind(stage), y = f.e1 + 0.2;
        if (kind === 'pour') { const front = fp.x0 + (fp.x1 - fp.x0) * clamp((fr - 0.6) / 0.18, 0.05, 1); team('pour', crewN('pour', mine ? 1.1 : 0.6), Math.max(fp.x0, front - 7), Math.min(fp.x1, front + 1.5), y, fp.z0, cutNow ? 0 : fp.z1, 0); }
        else team(kind, crewN(kind, mine ? 1.6 : 0.7), fp.x0, fp.x1, y, fp.z0, cutNow ? 0 : fp.z1, 0, { stock: [fp.x1 - 2.5, fp.z0 + 2.5] });
      }
      if (UNDER_WPS.has(wpId)) {
        if (wpId === 'survey' || wpId === 'improve' || (wpId === 'wall' && dug < 0.3)) { const k = aNow || 'inspect'; team(k, crewN(k, 1), 1, pw - 1, 0.02, -pd / 2 + 2, -1, 3); }
        else if (depth > 0.5) { const yU = wpId === 'base' && K('base') ? -depth + Math.min(depth, P('base') * nB * bsh) + 0.25 : matP > 0 ? baseE + thick * matP : -dug; const k = aNow || 'dig'; team(k, crewN(k, 1.3), th + 1.5, pw - th - 1.5, yU + 0.02, -pd / 2 + th + 2, Math.min(pd / 6, 8), 5, { stock: [pw - th - 3, -pd / 2 + th + 3] }); }
      }
      if (cutNow && nF > 0) { const ki = clamp(Math.floor(clamp(P(wpId), 0, 0.999) * nF), 0, nF - 1), p3 = D.fp[ki], k = aNow || 'generic', lift = Math.max(0, (D.fh[ki] || 4) - 0.55 - 2.35); team(k, crewN(k, 1.5), p3.x0 + 1, p3.x1 - 1, sc.floors[ki].e0 + 0.2, p3.z0 + 1, p3.z1 - 1, 9, { stock: [p3.x1 - 3, p3.z0 + 3], lift }); if (ki > 0) team(k, crewN(k, 0.6), p3.x0 + 1, p3.x1 - 1, sc.floors[ki - 1].e0 + 0.2, p3.z0 + 1, p3.z1 - 1, 13, { lift }); }
      if (wpId === 'skin' && nS < nF) { const p3 = D.fp[nS], k = aNow || 'curtain'; team(k, crewN(k, 1.1), p3.x0 + 1, p3.x1 - 1, sc.floors[nS].e0 + 0.2, p3.z1 - 2.2, p3.z1 - 0.6, 17, { face: [(p3.x0 + p3.x1) / 2, p3.z1 + 60] }); }
      if (wpId === 'roof' && done) { const k = aNow || 'waterproof'; team(k, crewN(k, 1.1), rfp.x0 + 1, rfp.x1 - 1, rtop + 0.4, rfp.z0 + 1, rfp.z1 - 1, 21); }
      if (wpId === 'land') { const strips = [[0.6, G.bx0 - 0.6], [G.bx1 + 0.6, pw - 0.6]].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])); team('landscape', 7, strips[0][0], strips[0][1], 0.3, -pd / 2 + 2, pd / 2 - 2, 25); }
      if (wpId === 'prep' || wpId === 'plan' || wpId === 'qa') { const k = aNow || 'inspect'; team(k, 3, pw + 0.5, pw + 4.2, 0.05, -pd / 2 + 2, pd / 2 - 14, 29); }
      let nrl = 0, nfn = 0, nst = 0, nsf = 0, npk = 0;
      if (active) {
        const y = f.e1 + 0.2, a = fp.x0 - 0.15, b = fp.x1 + 0.15, c = fp.z0 - 0.15, d = cutNow ? 0 : fp.z1 + 0.15;
        [[1.1, 0.07], [0.55, 0.05]].forEach(([hh, t]) => { ibox(railI, nrl++, a, b, y + hh, y + hh + t, c, c + 0.05); if (!cutNow) ibox(railI, nrl++, a, b, y + hh, y + hh + t, d - 0.05, d); ibox(railI, nrl++, a, a + 0.05, y + hh, y + hh + t, c, d); ibox(railI, nrl++, b - 0.05, b, y + hh, y + hh + t, c, d); });
        const sx = Math.max(2, (b - a) / 40), sz = Math.max(2, (d - c) / 30);
        for (let x = a; x <= b + 1e-6 && nrl < 214; x += sx) { ibox(railI, nrl++, x - 0.03, x + 0.03, y, y + 1.17, c, c + 0.06); if (!cutNow && nrl < 214) ibox(railI, nrl++, x - 0.03, x + 0.03, y, y + 1.17, d - 0.06, d); }
        for (let z = c; z <= d + 1e-6 && nrl < 218; z += sz) { ibox(railI, nrl++, a, a + 0.06, y, y + 1.17, z - 0.03, z + 0.03); if (nrl < 220) ibox(railI, nrl++, b - 0.06, b, y, y + 1.17, z - 0.03, z + 0.03); }
        // 추락 방지망: 짓는 층 아래 2개 층 바깥
        // 층고가 큰 물류·공장은 바닥에서 꼭대기까지 망이 덮어 골조가 안 보이므로 작업 층 아래 8m까지만
        const y0 = Math.max(sc.floors[Math.max(0, nF - 2)].e0, y - 8), y1 = y + 1.5, o = 0.9;
        nets.forEach((n, i) => { n.visible = !(cutNow && i === 1); if (i === 0) setBox(n, a - o, b + o, y0, y1, c - o - 0.03, c - o); if (i === 1) setBox(n, a - o, b + o, y0, y1, d + o, d + o + 0.03); if (i === 2) setBox(n, a - o - 0.03, a - o, y0, y1, c - o, d + o); if (i === 3) setBox(n, b + o, b + o + 0.03, y0, y1, c - o, d + o); });
        if (['conv', 'alform', 'deck'].includes(ids.form) || (steelF && !['gang', 'acs', 'slip'].includes(ids.form))) {
          const sides = [[0, c, -1], [0, d, 1], [1, a, -1], [1, b, 1]].filter((q, i) => !(cutNow && i === 1)), IN = 0.25, OUT = 0.82, w2 = 0.024;
          const bx = (im, ax, v, sg, u0, u1, f0, f1, ya, yb) => { const p0 = v + sg * f0, p1 = v + sg * f1; return ax ? ibox(im, im === plankI ? npk++ : nsf++, Math.min(p0, p1), Math.max(p0, p1), ya, yb, u0, u1) : ibox(im, im === plankI ? npk++ : nsf++, u0, u1, ya, yb, Math.min(p0, p1), Math.max(p0, p1)); };
          for (const [ax, v, sg] of sides) {
            const u0 = (ax ? c : a) - OUT, u1 = (ax ? d : b) + OUT, L = u1 - u0, nb = Math.max(1, Math.round(L / Math.max(1.8, L / 55))), st = L / nb;
            for (let k = 0; k <= nb && nsf < 1560; k++) { const u = u0 + k * st; [IN, OUT].forEach(f => bx(scafI, ax, v, sg, u - w2, u + w2, f - w2, f + w2, y0, y1)); }
            let lv = 0;
            for (let yy = y0 + 2; yy <= y1 + 0.01 && nsf < 1560; yy += 2, lv++) {
              if (npk < 196) { bx(plankI, ax, v, sg, u0, u1, IN, OUT, yy - 0.05, yy); bx(plankI, ax, v, sg, u0, u1, OUT - 0.03, OUT, yy, yy + 0.15); }
              bx(scafI, ax, v, sg, u0, u1, IN - w2, IN + w2, yy - 0.06, yy - 0.02); [0, 0.5, 1.0].forEach(h => bx(scafI, ax, v, sg, u0, u1, OUT - w2, OUT + w2, yy + h - 0.02 + (h ? 0 : -0.04), yy + h + 0.02));
              const th = Math.atan2(2, st), Ld = Math.hypot(2, st);
              for (let k = lv % 3; k < nb && nsf < 1560; k += 3) { const um = u0 + (k + 0.5) * st, ym = yy - 1, pz = v + sg * OUT, dir = (lv % 2 ? 1 : -1); if (ax) ibox(scafI, nsf++, pz - w2, pz + w2, ym - w2, ym + w2, um - Ld / 2, um + Ld / 2, -th * dir, 0); else ibox(scafI, nsf++, um - Ld / 2, um + Ld / 2, ym - w2, ym + w2, pz - w2, pz + w2, 0, th * dir); }
            }
          }
        }
        // 낙하물 방지망: 10개 층마다 (짓는 층 3개 층 아래부터)
        for (let i = nF - 3; i > 0 && nfn < 16; i -= 10) { const yy = sc.floors[i].e1, p3 = D.fp[i]; ibox(fanI, nfn++, p3.x0 - 0.5, p3.x1 + 0.5, yy - 0.03, yy + 0.03, p3.z0 - 2.7, p3.z0 - 0.2, 0.35, 0); if (!cutNow) ibox(fanI, nfn++, p3.x0 - 0.5, p3.x1 + 0.5, yy - 0.03, yy + 0.03, p3.z1 + 0.2, p3.z1 + 2.7, -0.35, 0); ibox(fanI, nfn++, p3.x0 - 2.7, p3.x0 - 0.2, yy - 0.03, yy + 0.03, p3.z0 - 0.5, cutNow ? 0 : p3.z1 + 0.5, 0, -0.35); ibox(fanI, nfn++, p3.x1 + 0.2, p3.x1 + 2.7, yy - 0.03, yy + 0.03, p3.z0 - 0.5, cutNow ? 0 : p3.z1 + 0.5, 0, 0.35); }
        // 자재 적치 (거푸집·철근 단계)
        if (stage < 2) { const bx = fp.x0 + 1.5, bz = fp.z0 + 1.5; [[0, 6, 0, 0.45, 0, 0.9], [0, 6, 0, 0.35, 1.2, 2.0], [7, 9.4, 0, 0.9, 0, 1.2], [7, 9.4, 0.9, 1.6, 0, 1.2], [10.5, 14, 0, 0.5, 0, 1.0], [10.5, 14, 0.5, 0.9, 0, 1.0]].forEach((q2, i) => { if (bx + q2[1] < fp.x1 - 1) ibox(stockI, nst++, bx + q2[0], bx + q2[1], y + q2[2], y + q2[3], bz + q2[4], bz + q2[5]); }); }
      } else nets.forEach(n => { n.visible = false; });
      railI.count = nrl; fanI.count = nfn; stockI.count = nst; scafI.count = nsf; plankI.count = npk; [railI, fanI, stockI, scafI, plankI].forEach(o => { o.instanceMatrix.needsUpdate = true; });
      const occ = new Set(), busy = new Set();
      if (pump.visible) { occ.add(0); if (pourNow && lanes.length > 1) occ.add(1); }
      if (crane.visible && crane2) { occ.add(0); if (lanes.length > 1) occ.add(1); }
      const io = { hot: [], tags: [], bays: {} };
      const htop = hOn ? sc.floors[Math.min(NF, Math.max(1, Math.floor(fl))) - 1].e1 + (ids.hoist === 'jump' ? 0 : 3) : 0;
      const dyn = safe('공법 장면', () => meth.frame({ wpId, T, tau, K, P, dug, earthP, wallP, foundP, baseP, structP, skinP, topdown, underV, cutNow, nF, fl, fr, stage, active, f, fp, hasCore, ctop, cn, cx0, cx1, cz, top, Hc, nS, done, rtop, rfp, rp, matP, baseE, thick, plen, removeUpTo, pourNow, PX, MX, hOn, htop, io }), []);
      if (io.bays.pump) occ.add(0); // 펌프카가 선 차로
      // 물류: 덤프(상차 자리) · 레미콘(펌프카 호퍼) · 자재 트레일러(하역 자리)
      // 땅속 공사 중에도 덤프가 게이트를 쓰지 않을 때는 흙막이 H형강·기초 철근·방수 자재가 들어온다 (도로 점용 하역)
      const dlvKind = !(underV && trOn) && !pump.visible && !io.bays.pump && P(wpId) > 0 && P(wpId) < 1 ? DLV(wpId, aNow) : null;
      let dlvBay = null; // 저층부(포디움)가 대지를 덮어 안에 설 자리가 없으면 도로 점용 하역
      // 도로 하역 자리: 펌프·레미콘이 바깥 차로를 쓰고 있으면 그 반대쪽 끝으로
      const roadZ = () => { const z = clamp(-bd / 2 - 4, -pd / 2 + 4, pd / 2 - 12), pz = io.bays.pump ? io.bays.pump.z - io.bays.pump.nose * 5.6 : null; return pz == null || Math.abs(z - pz) > 26 ? z : [-pd / 2 + 12, pd / 2 - 12].sort((a, b) => Math.abs(b - pz) - Math.abs(a - pz))[0]; };
      if (dlvKind) { const ex = Math.max(G.bx1, ...D.fp.filter((q, i) => sc.floors[i] && sc.floors[i].e0 < 6).map(q => q.x1)), ws = pw - ex; dlvBay = ws >= 8.6 && !underV ? { x: ex + ws / 2 + 0.6, z: pd / 2 - 10.5, hx: 0, hz: 1, inside: true } : { road: true, z: roadZ() }; }
      const fl3 = safe('물류 차량', () => fleet.frame({ T, haul: trOn ? { bay: io.bays.haul || { road: true, z: pd / 2 - 8 } } : null, mix: io.bays.pump ? { pump: io.bays.pump } : null, dlv: dlvKind ? { bay: dlvBay, kind: dlvKind } : null }), { busy: new Set(), tags: [] });
      fl3.busy.forEach(l => busy.add(l));
      // 장비 둘레 사람: 굴착기·크람쉘 옆 신호수, 펌프카 호스 끝 호스 잡이·진동 다짐, 천공기 옆 신호수·유도원
      io.hot.forEach((h, i) => {
        // 굴착 바닥(땅속)에 선 장비는 신호수를 터파기 안쪽으로 세운다 (바깥쪽이면 흙벽 속에 묻힌다). 지표 장비는 그대로
        const pit = h.y < -0.5, ix = pit && h.x > pw / 2 ? -1 : 1, iz = pit && h.z > 0 ? -1 : 1;
        const inX = (x) => (pit ? clamp(x, 1.8, pw - 1.8) : x), inZ = (z) => (pit ? clamp(z, -pd / 2 + 1.8, pd / 2 - 1.8) : z);
        if (h.k === 'ex' || h.k === 'clam') work.push(crewAt('signal', inX(h.x + 5 * ix), h.y + 0.02, inZ(h.z + 5 * iz), [h.x, h.z], T, 40 + i));
        else if (h.k === 'hose') { [-0.7, 0.7].forEach((o2, j) => work.push(crewAt('hose', h.x + o2, h.y + 0.02, h.z + 1.3, [h.x, h.z - 2], T, 50 + i * 2 + j))); work.push(crewAt('vibrate', h.x - 2.4, h.y + 0.02, h.z + 2.2, [h.x, h.z], T, 60 + i)); }
        else if (h.k === 'rig') { work.push(crewAt('signal', inX(h.x + 5 * ix), h.y + 0.02, inZ(h.z + 5 * iz), [h.x, h.z], T, 70 + i)); work.push(crewAt('guide', inX(h.x - 2.6 * ix), h.y + 0.02, inZ(h.z + 3.2 * iz), [h.x, h.z], T, 80 + i)); }
      });
      // 현장 사람들: 아침 TBM · 사무소 앞 소장·감리 · 2층 복도 통화 · 휴게실 · 자재 반입 의논
      const lifeOn = !!lifeB && (lifeV || (prepOn && P('prep') > 0.3 && !underV));
      const lifeF = lifeB ? safe('현장 사람들', () => lifeB.frame({ T, on: lifeOn, crewN: clamp(work.length, 8, 16), wpId, dlv: !!dlvKind }), null) : null;
      if (lifeF) { lifeF.people.forEach(q => work.push(q)); lifeF.labels.forEach(l => dyn.push(l)); }
      // 발 디딤: 그 순간 그려진 면(거푸집 데크·철근·타설 면·굴착 바닥·지붕·포장) 위에 발을 맞춘다
      if (sup) safe('발 디딤', () => { sup.frame(`${wpId}|${nF}|${active ? stage : -1}|${Math.round(fl * 6)}|${Math.round(dug * 2)}|${Math.round((tau || 0) * 300)}`); const drops = window.__S3DEBUG ? (window.__s3drops = []) : null; work.forEach(w => { if (w.noSnap || w.act === 'sit' || w.act === 'drink' || w.act === 'rest') return; const y2 = sup.at(w.x, w.z, w.y); if (y2 != null && Number.isFinite(y2)) { if (drops && Math.abs(w.y - y2) > 1.5) drops.push({ act: w.act, kind: w.kind || w.role || null, x: +w.x.toFixed(1), z: +w.z.toFixed(1), y0: +w.y.toFixed(2), y: +y2.toFixed(2) }); w.y = y2; } }); }, null);
      const cf = safe('주변 가로·사람', () => city.frame({ T, occ, busy, work, gateBusy: trOn || pourNow || !!dlvKind }), null); if (window.__S3DEBUG) window.__s3work = work;
      // 누르면 대화할 수 있는 사람: 작업자 · 현장 사람들 · 보행자·신호수 (p: 몸 가운데, g: 발 높이)
      const picks = [];
      work.forEach((w, i) => picks.push({ id: w.pid || `w${w.kind || w.act}${w.sd ?? i}`, role: w.role || null, w, i, seed: w.seed ?? w.sd ?? i * 17 + 3, p: [w.x, w.y + 0.9, w.z], g: w.y }));
      if (cf && cf.extra) cf.extra.forEach(e => picks.push({ id: e.id, role: e.role, seed: e.seed, p: [e.x, e.y - 0.3, e.z], g: e.y - 1.15 }));
      // 장비 이름표: 공법 장비 + 물류 차량 + 타워크레인·호이스트
      const eqTags = [...io.tags, ...fl3.tags];
      if (crane.visible && (FRW.includes(wpId) || wpId === 'skin')) eqTags.push({ t: { tower: '타워크레인 (T형)', luffing: '러핑 타워크레인', crawler: '크롤러 크레인', ringer: '링거 크레인', mobile: '이동식 크레인' }[ids.lift] || '크레인', p: [crane.position.x, (ids.lift === 'tower' || ids.lift === 'luffing' ? Hc : 30) + 5, crane.position.z], cls: 'eq' });
      if (hOn && (wpId === 'hoist' || wpId === 'lift')) eqTags.push({ t: '호이스트 (인·화물용)', p: [G.bx1 + 2, htop + 3, 0], cls: 'eq' });
      // 장비 이름표를 누르면 그 장비 기사와 이야기 (굴착기·덤프·펌프카·크레인·천공기·트레일러)
      eqTags.slice(0, 12).forEach((t, k) => { const r = roleOfEquipment(t.t); dyn.push(r ? { ...t, cls: (t.cls || 'eq') + ' who', pick: `eq${k}:${r}`, role: r, seed: 500 + k * 31 + String(t.t).length * 7 } : t); });
      crewTags.sort((a, b) => b.n - a.n).slice(0, 3).forEach(t => dyn.push(t));
      owned.forEach(o => { if (o.count > o.instanceMatrix.count) o.count = o.instanceMatrix.count; }); // 용량을 넘는 인스턴스는 그리지 않는다
      // 강조: 지금 공종의 재질을 강조색으로
      // 설비 공종을 볼 때는 다른 설비·마감을, 실내 마감을 볼 때는 설비를 흐리게 (2D와 같은 규칙)
      const dimSet = MEPS.includes(wpId) ? DIM_FOR_MEP : ROOMS.includes(wpId) ? DIM_FOR_ROOM : null;
      // 단면으로 자르지 않는다: 실내 공종은 외장을 유리처럼 비우고, 역타처럼 지하 공사 중에 지상 골조가 있으면 지상부를 흐리게
      const ghostAbove = underV && top > 0.5;
      byWp.forEach((list, wp) => { const on = wp === wpId || (wpId === 'mep' && sys[wp]) || (wpId === 'conc' && (wp === 'pour')); const dm = !on && dimSet && dimSet.has(wp); list.forEach(o => { const b = o.userData.base; let m = on ? accOf(b) : dm ? dimOf(b) : b; if (!on && ghostAbove && b.userData.above) m = dimOf(b); else if (!on && cutNow && SKIN_WPS.has(wp)) m = ghostOf(b, 0.1); if (o.material !== m) o.material = m; }); });
      // 앞쪽 절반 복제본: 지하 공종에서는 흙·지표·흙막이를 반투명하게. 흙 덩어리 뒤쪽은 공법이 투시를 켰을 때만 흐리게
      // 역타 1층 바닥판: 지하를 보는 공종에서는 반투명 (그 밑 굴착·지하 골조가 보이게)
      if (underV && wpId !== 'support') tdSlab.material = ghostOf(tdSlab.material, 0.22);
      city.surfs.forEach(o => { const b = o.userData.sbase || (o.userData.sbase = o.material), m = seeV ? ghostOf(b, 0.32) : b; if (o.material !== m) o.material = m; });
      twins.forEach(t => {
        const o = t.userData.src; let v = o.visible; for (let q = o.parent; v && q && q !== root; q = q.parent) v = q.visible;
        t.visible = v; if (!v) return;
        if (o.isInstancedMesh) { t.count = o.count; if (t.instanceColor !== o.instanceColor) t.instanceColor = o.instanceColor; }
        else { t.position.copy(o.position); t.quaternion.copy(o.quaternion); t.scale.copy(o.scale); }
        const fm = seeV && t.userData.front != null ? ghostOf(o.material, t.userData.front) : o.material;
        if (t.material !== fm) t.material = fm;
      });
      // 전체 보기 높이: 골조 전에는 완성 볼륨, 골조가 오르는 동안에는 지금 높이 + 크레인 여유까지
      const hTop = Math.max(top, ctop), hView = !K('frame') || hTop >= G.H - 0.5 ? G.H : Math.min(G.H, hTop + Math.max(16, hTop * 0.25));
      return { top: hTop, dyn, hv: hView, picks };
    }

    function seg(o, x0, y0, z0, x1, y1, z1) {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.max(0.01, Math.hypot(dx, dy, dz));
      o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); o.scale.set(0.5, L, 0.5);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
    }

    // 단면 이름표 (지하 공종에서만): 지층 · 지하수위
    const labels = [];
    sc.strata.forEach(([a, b, , nm]) => { if (a < sc.dv - 2) labels.push({ t: nm, p: [D.xl + 4, -(a + Math.min(b, sc.dv)) / 2, Z], under: true }); });
    if (cond.gw < sc.dv) labels.push({ t: `▽ 지하수위 GL−${cond.gw}m`, p: [D.xr - 14, -cond.gw + 0.6, Z], under: true, cls: 'gw' });
    city.labels.forEach(l => labels.push({ under: false, ...l }));
    return {
      sc, D, root, frameAt, labels, city, lifeB,
      dispose() { city.dispose(); meth.dispose(); fleet.dispose(); if (yard) yard.dispose(); if (lifeB) lifeB.dispose(); const mine = new Set([rebarM]); root.traverse(o => { if (o.isMesh && o.material && (o.material.map === texX || o.material.map === texZ)) mine.add(o.material); }); for (let i = clipList.length - 1; i >= 0; i--) if (mine.has(clipList[i])) clipList.splice(i, 1); owned.forEach(o => o.dispose()); ghost.geometry.dispose(); ghost.material.dispose(); crGhost.geometry.dispose(); crGhost.material.dispose(); rebarP.geometry.dispose(); rebarTex.dispose(); rebarM.dispose(); texX.dispose(); texZ.dispose(); root.traverse(o => { if (o.isMesh && o.material && o.material.map && (o.material.map === texX || o.material.map === texZ)) o.material.dispose(); }); },
    };
  }

  // 그림자: 불투명한 면만 그림자를 드리우고, 모든 면이 받는다
  function shadowsOn(root) {
    root.traverse(o => { if (!o.isMesh) return; const m = o.material; o.receiveShadow = true; o.castShadow = !(m && m.transparent && m.opacity < 0.7) && !(m && m.emissiveIntensity > 0.9); });
  }
  // ---------- 사람과 대화 (talk.js) ----------
  // 사람(작업자·현장 사람들·보행자·신호수)을 누르거나, 현장소장·장비 이름표를 누르면 그 사람의 이야기 (실제 현장 사람들의 고충)
  let picks = [], lbPicks = new Map(), talk = null, curTau = 0, curWp = null;
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 40), new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
  selRing.rotation.x = -Math.PI / 2; selRing.renderOrder = 20; selRing.visible = false; scene.add(selRing);
  const tkEl = $('.s3-talk');
  function paintTalk() {
    if (!talk) { tkEl.hidden = true; selRing.visible = false; return; }
    const { tk, k } = talk, n = tk.lines.length;
    tkEl.hidden = false;
    const av = $('.s3-tk-av'); av.textContent = tk.name.slice(0, 1); av.style.background = tk.hat || '#f4f4f0';
    $('.s3-tk-n').textContent = tk.name; $('.s3-tk-m').textContent = tk.meta;
    const l = $('.s3-tk-l'); l.textContent = `“${tk.lines[k]}”`; l.classList.remove('in'); void l.offsetWidth; l.classList.add('in');
    $('.s3-tk-i').textContent = `${k + 1} / ${n}`;
    $('.s3-tk-p').disabled = k === 0; const nx = $('.s3-tk-nx'); nx.textContent = k >= n - 1 ? '고마워요 ✓' : '다음 ›';
  }
  function openTalk(pk) {
    if (!pk || !built) return;
    const role = pk.role || (pk.w ? roleOfWorker(pk.w, pk.i) : 'labor');
    const month = dateAt(built.sc.t0, curTau).getMonth() + 1;
    const tk = talkFor(role, pk.seed, { month, wpId: curWp || '', boss: built.lifeB ? built.lifeB.names.boss : '', co: COMPANY });
    talk = { id: pk.id, tk, k: 0 }; paintTalk();
  }
  const closeTalk = () => { talk = null; paintTalk(); };
  $('.s3-tk-x').addEventListener('click', closeTalk);
  $('.s3-tk-p').addEventListener('click', () => { if (talk && talk.k > 0) { talk.k--; paintTalk(); } });
  $('.s3-tk-nx').addEventListener('click', () => { if (!talk) return; if (talk.k < talk.tk.lines.length - 1) { talk.k++; paintTalk(); } else closeTalk(); });
  const onKey = (e) => { if (!talk) return; if (e.key === 'Escape') closeTalk(); else if (e.key === 'ArrowRight' && document.activeElement && wrap.contains(document.activeElement)) $('.s3-tk-nx').click(); };
  document.addEventListener('keydown', onKey);
  // 화면의 한 점에서 가장 가까운 사람 (몸 높이를 화면에 비춘 크기 안에서)
  const _pv = new THREE.Vector3(), _pt = new THREE.Vector3();
  function pickAt(px, py) {
    const w = size[0], h = size[1]; let best = null, bs = Infinity;
    picks.forEach(pk => {
      _pv.set(pk.p[0], pk.p[1], pk.p[2]).project(cam); if (_pv.z > 1 || _pv.z < -1) return;
      _pt.set(pk.p[0], pk.p[1] + 0.95, pk.p[2]).project(cam);
      const sx = (_pv.x + 1) / 2 * w, sy = (1 - _pv.y) / 2 * h, r = Math.max(13, Math.abs((1 - _pt.y) / 2 * h - sy) * 1.15);
      const d = Math.hypot(px - sx, py - sy) / r; if (d <= 1 && d + _pv.z * 0.05 < bs) { bs = d + _pv.z * 0.05; best = pk; }
    });
    return best;
  }
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || e.button > 0) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved > 6 || dt > 600) return;
    const r = renderer.domElement.getBoundingClientRect(), pk = pickAt(e.clientX - r.left, e.clientY - r.top);
    if (pk) openTalk(pk); else if (talk) closeTalk();
  });
  // 이름표 (현장소장 · 장비): 이름표는 매 프레임 다시 그려지므로 누르는 순간(pointerdown)에 연다
  $('.s3-lbs').addEventListener('pointerdown', (e) => { const el = e.target.closest('[data-pick]'); if (!el) return; e.preventDefault(); e.stopPropagation(); const id = el.dataset.pick, pk = picks.find(q => q.id === id) || lbPicks.get(id); if (pk) openTalk(pk); });
  if (window.__S3DEBUG) window.__s3talk = (id) => { const pk = picks.find(q => q.id === id) || lbPicks.get(id) || (typeof id === 'object' ? id : null); openTalk(pk); return talk && talk.tk; };

  // ---------- 매 프레임 ----------
  let mkHtml = '', lbHtml = '', atCache = {}, size = [0, 0], nowKey = null;
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function resize() {
    const r = host.getBoundingClientRect(), w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (w === size[0] && h === size[1]) return;
    size = [w, h]; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    look.setSize(w, h, renderer.getPixelRatio());
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  function update(st) {
    if (disposed) return;
    resize();
    const { sc, wpId, p, T, marks = [], at } = st;
    if (!built || built.sc !== sc) { if (badSc === sc) return; const nb = safe('장면 만들기', () => build(sc), null); if (!nb) { badSc = sc; built = null; return; } built = nb; lastWp = null; fitSun(built.D, sc.G); shadowsOn(built.root); ensureContext(); if (window.__S3DEBUG) window.__s3dim = { pw: sc.G.pw, pd: built.D.pd, bd: built.D.bd, bx0: sc.G.bx0, bx1: sc.G.bx1, crX: sc.crX, H: sc.G.H, depth: sc.G.depth, lanes: sc.city && sc.city.lanes, yard: sc.city && sc.city.yard }; }
    const win = winFor(sc, wpId), tau = win.s + clamp(p, 0, 1) * (win.e - win.s);
    const fres = safe(`장면 진행 (${wpId})`, () => built.frameAt({ wpId, tau, T, step: st.step, life: viewMode === 'life' }), null);
    curTau = tau; curWp = wpId; picks = fres && fres.picks ? fres.picks : [];
    if (window.__S3DEBUG) window.__s3picks = picks;
    // 대화 중인 사람 발밑 고리 · 머리 위 이름
    const selP = talk ? picks.find(q => q.id === talk.id) : null;
    selRing.visible = !!selP; if (selP) { selRing.position.set(selP.p[0], selP.g + 0.06, selP.p[2]); const s = 1 + 0.08 * Math.sin(T * 5); selRing.scale.set(s, s, s); }
    // 시점: 전체 보기는 현장·건물 전체를 한 화면에 고정, 작업 부위는 2D 카메라가 보는 범위를 따라간다
    const under = UNDER_WPS.has(wpId), cutV = CUT_WPS.has(wpId);
    const now = performance.now(), dt = Math.min(0.25, (now - (follow.tl || now)) / 1000); follow.tl = now;
    if (viewMode === 'life' && built.lifeB) {
      // 현장 사람들: 현장 앞 사무소 단지(사무소 · 휴게실 · TBM 마당)를 앞·대로 쪽에서 비스듬히 내려다본다
      if (lastWp !== wpId) {
        lastWp = wpId; userMoved = false;
        const [x0, x1, z0, z1] = built.lifeB.life.box, c = new THREE.Vector3((x0 + x1) / 2 + 1.5, 1.6, (z0 + z1) / 2 - 1.5);
        const dist = clamp(Math.max(x1 - x0, (z1 - z0) * 1.5) * 0.95 + 6, 26, 62), dir = new THREE.Vector3(0.42, 0.55, 1).normalize(), pos = c.clone().addScaledVector(dir, dist);
        follow.has = true;
        if (!st.instant && ctl.target.lengthSq() > 0) follow.anim = { t0: now, from: { p: cam.position.clone(), t: ctl.target.clone() }, to: { p: pos, t: c } };
        else { ctl.target.copy(c); cam.position.copy(pos); }
      }
    } else if (viewMode === 'all' || viewMode === 'life') {
      // 건물이 올라가는 만큼 천천히 물러나며 지금 있는 것 전부를 화면에 담는다
      const hv = fres && fres.hv != null ? fres.hv : sc.G.H;
      if (lastWp !== wpId) {
        lastWp = wpId; userMoved = false;
        const v = wholeView(sc, built.D, wpId, cam, hv);
        follow.has = true; follow.hv = hv; follow.goal = v;
        if (!st.instant && ctl.target.lengthSq() > 0) follow.anim = { t0: now, from: { p: cam.position.clone(), t: ctl.target.clone() }, to: { p: v.pos, t: v.tgt } };
        else { ctl.target.copy(v.tgt); cam.position.copy(v.pos); }
      } else if (!userMoved && !follow.anim) {
        if (Math.abs(hv - follow.hv) > 0.5) { follow.hv = hv; follow.goal = wholeView(sc, built.D, wpId, cam, hv); }
        const g = follow.goal, k = 1 - Math.exp(-dt / 0.6);
        if (g && k > 0) { cam.position.lerp(g.pos, k); ctl.target.lerp(g.tgt, k); }
      }
    } else {
      const roi = focusOf(sc, wpId, p), cx = (roi.x0 + roi.x1) / 2, ce = (roi.e0 + roi.e1) / 2, span = Math.max(roi.x1 - roi.x0, (roi.e1 - roi.e0) * cam.aspect);
      const tgt = new THREE.Vector3(cx, ce, 0);
      if (lastWp !== wpId) {
        lastWp = wpId; userMoved = false;
        const far = MEPS.includes(wpId) ? 1.7 : ROOMS.includes(wpId) ? 1.35 : 1.05;
        const dist = clamp(span / (2 * Math.tan(cam.fov * Math.PI / 360)) / cam.aspect * far, 20, 1400);
        const dir = new THREE.Vector3(under ? 0.42 : cutV ? 0.38 : 0.62, under ? 0.2 : cutV ? 0.3 : 0.42, 1).normalize();
        follow.t.copy(tgt); follow.has = true;
        if (!st.instant && ctl.target.lengthSq() > 0) { follow.anim = { t0: performance.now(), from: { p: cam.position.clone(), t: ctl.target.clone() }, to: { p: tgt.clone().addScaledVector(dir, dist), t: tgt.clone() } }; }
        else { ctl.target.copy(tgt); cam.position.copy(tgt.clone().addScaledVector(dir, dist)); }
      } else if (!userMoved) {
        const d = tgt.clone().sub(ctl.target).multiplyScalar(0.03); ctl.target.add(d); cam.position.add(d);
      }
    }
    if (follow.anim) { const k = clamp((now - follow.anim.t0) / 1100, 0, 1), e = 1 - Math.pow(1 - k, 3); cam.position.lerpVectors(follow.anim.from.p, follow.anim.to.p, e); ctl.target.lerpVectors(follow.anim.from.t, follow.anim.to.t, e); if (k >= 1) follow.anim = null; }
    ctl.update();
    tickWater(); if (!window.__S3NORENDER) look.render(cam);
    // HUD
    const wp = WP_BY_ID[wpId], o = wp.multi ? `${sc.qa.length}개 기술` : (wp.opts.find(x => x.id === sc.ids[wpId]) || { name: '' }).name;
    $('.s3-c').textContent = `// SIM_${wp.code} · 3D`; $('.s3-t').textContent = o;
    // 지금 작업: 단계의 작업 유형 · 작업조 · 투입 장비 (workstep.js 표준 작업 기준)
    const stp = st.step && st.step.wp === wpId ? st.step : null, nk = stp && !win.skip ? `${stp.a}|${stp.k}|${stp.n}` : '';
    if (nk !== nowKey) { nowKey = nk; const A = stp && ARCH[stp.a], el = $('.s3-now'); el.hidden = !A || !nk; if (A && nk) el.innerHTML = `<b>지금 작업 · ${String(stp.k + 1).padStart(2, '0')}/${String(stp.n).padStart(2, '0')}</b><span>${esc(A.n)}</span><em>작업조 약 ${A.crew}명 · ${A.eq.map(esc).join(' · ')}</em>`; }
    $('.s3-d').textContent = `D+${Math.round(tau)} · ${ym(dateAt(sc.t0, tau))}`; $('.s3-day').textContent = win.skip ? '해당 공정 없음' : `${Math.round(win.e - win.s)}일 중 ${Math.round(clamp(p, 0, 1) * (win.e - win.s))}일째`;
    // 판정 표식: 단면 좌표(x, e)를 단면(z=0) 위에 띄운다
    if (at) atCache = at;
    const box = $('.s3-mks'), w = size[0], h = size[1];
    const html = marks.map(m => { const pos = atCache[m.mark]; if (!pos) return ''; const v = new THREE.Vector3(pos[0], pos[1], 0.5).project(cam); if (v.z > 1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) return ''; return `<i class="s3-mk s${m.sev}" style="left:${((v.x + 1) / 2 * w).toFixed(0)}px;top:${((1 - v.y) / 2 * h).toFixed(0)}px">${m.n}</i>`; }).join('');
    if (mkHtml !== html) { box.innerHTML = html; mkHtml = html; }
    const selL = selP ? [{ t: `💬 ${esc(talk.tk.name)}`, p: [selP.p[0], selP.g + 2.35, selP.p[2]], cls: 'eq sel' }] : [];
    lbPicks = new Map();
    const lh = built.labels.concat(fres && fres.dyn ? fres.dyn : [], selL, ctxObj && !UNDER_WPS.has(wpId) ? ctxObj.labels : []).filter(l => (!l.under || UNDER_WPS.has(wpId)) && !(l.over && UNDER_WPS.has(wpId)) && !(l.near && cam.position.distanceTo(_pv.set(l.p[0], l.p[1], l.p[2])) > l.near)).map(l => { const v = new THREE.Vector3(...l.p).project(cam); if (v.z > 1 || v.x < -0.98 || v.x > 0.98 || v.y < -0.95 || v.y > 0.9) return ''; if (l.pick) lbPicks.set(l.pick, { id: l.pick, role: l.role, seed: l.seed ?? 7 }); return `<i class="s3-lb${l.cls ? ' ' + l.cls : ''}"${l.pick ? ` data-pick="${esc(l.pick)}" title="눌러서 이야기 듣기"` : ''} style="left:${((v.x + 1) / 2 * w).toFixed(0)}px;top:${((1 - v.y) / 2 * h).toFixed(0)}px">${l.t}</i>`; }).join('');
    if (lbHtml !== lh) { $('.s3-lbs').innerHTML = lh; lbHtml = lh; }
  }
  function dispose() {
    disposed = true;
    if (built) { scene.remove(built.root); built.dispose(); built = null; }
    if (ctxAbort) ctxAbort.abort();
    if (ctxObj) { scene.remove(ctxObj.group); ctxObj.dispose(); ctxObj = null; }
    mats.forEach(m => m.dispose()); accMats.forEach(m => m.dispose()); dimMats.forEach(m => m.dispose()); ghostMats.forEach(k => k.forEach(m => m.dispose()));
    [BOX, CYL, CONE].forEach(g => g.dispose());
    document.removeEventListener('keydown', onKey); scene.remove(selRing); selRing.geometry.dispose(); selRing.material.dispose();
    look.dispose(); ctl.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); wrap.remove();
  }
  return { update, resize, dispose, el: wrap, canvas: renderer.domElement };
}

// 전체 보기 시점: 대지·건물(완성 높이)·인접 건물 일부·대로를 담는 상자를 카메라 방향에서 화면에 꼭 맞춘다
function wholeView(sc, D, wpId, cam, hv = sc.G.H) {
  const G = sc.G, under = UNDER_WPS.has(wpId), cutV = CUT_WPS.has(wpId);
  // 대지 전체 + 건물(완성 높이)을 담는 상자들. 지하 공종은 단면(지층·흙막이·말뚝)과 장비 높이까지
  // 상자 끝의 숫자는 화면 밖으로 조금 나가도 되는 정도 (대지 모서리 끝은 살짝 잘려도 괜찮다)
  const dep = Math.max(G.depth || 0, 0), boxes = [];
  if (under) boxes.push([-10, G.pw + 10, -Math.min(sc.dv - 1, Math.max(dep + 7, dep * 1.35, 12)), 22, -D.pd / 2 - 4, 4, 1]);
  else {
    boxes.push([-6, G.pw + 6, -Math.min(3, dep), 3, -D.pd / 2 - 1, D.pd / 2 + 1, 1.12]);
    // 건물은 층마다 실제 바닥판 크기로 (저층부가 넓고 탑이 좁은 건물에서 빈 하늘이 남지 않게)
    // hv: 담을 높이 (완성 높이 또는 지금 높이 + 여유)
    const fl = sc.floors, n = fl.length, H = Math.min(G.H, hv);
    let lastQ = null;
    fl.forEach((f, i) => { const q = D.fp[i]; if (!q || f.e0 >= H) return; lastQ = q; boxes.push([q.x0 - 2, q.x1 + 2, i === 0 ? 0 : f.e0, Math.min(f.e1, H) + (i === n - 1 ? 6 : 0), q.z0 - 2, q.z1 + 2, 1]); });
    if (!lastQ) boxes.push([G.bx0 - 3, G.bx1 + 3, 0, Math.max(8, H) + 6, -D.bd / 2 - 3, D.bd / 2 + 3, 1]);
    // 양중 공종: 크레인 마스트 꼭대기까지
    if (wpId === 'lift' || wpId === 'hoist') boxes.push([sc.crX - 3, sc.crX + 3, 0, Math.max(H, 24) + 14, -D.bd / 2 - 8, -D.bd / 2 - 2, 1]);
    if (D.pod > 0) boxes.push([0, G.pw, 0, D.pod + 2, -D.pd / 2, D.pd / 2, 1]);
  }
  const lo = [0, 2, 4].map(k => Math.min(...boxes.map(b => b[k]))), hi = [1, 3, 5].map(k => Math.max(...boxes.map(b => b[k])));
  // 지붕은 위에서 내려다봐야 재료 차이가 보인다
  const dir = new THREE.Vector3(under ? 0.45 : cutV ? 0.42 : 0.62, under ? 0.5 : cutV ? 0.34 : wpId === 'roof' ? 0.85 : 0.4, 1).normalize();
  const c = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
  const up0 = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(up0, dir).normalize(), up = new THREE.Vector3().crossVectors(dir, right).normalize();
  const tV = Math.tan(cam.fov * Math.PI / 360), tH = tV * cam.aspect;
  const pts = []; boxes.forEach(b => { for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) pts.push([new THREE.Vector3(x, y, z), b[6]]); });
  // 1차: 원근 없이 어림한 거리 (모든 점이 카메라 앞에 오도록 넉넉하게)
  let dist = 10;
  for (const [q] of pts) {
    const v = q.clone().sub(c), dx = Math.abs(v.dot(right)), dy = Math.abs(v.dot(up)), dz = v.dot(dir);
    dist = Math.max(dist, dz + dx / tH, dz + dy / tV);
  }
  // 2차 원근 보정: 실제 투영 범위를 재서 가운데와 거리를 다시 맞춘다 (가까운 땅은 크게, 먼 꼭대기는 작게 보인다)
  // 위쪽은 HUD(공법명·날짜)가 덮으므로 세로 중심을 조금 내리고, 가로는 화면 폭을 거의 다 쓴다
  const tc = cam.clone(), FX = 0.95, FY = 0.88, YC = -0.04;
  let zMin = Infinity; for (const [q] of pts) zMin = Math.min(zMin, -q.clone().sub(c).dot(dir));
  for (let it = 0; it < 8; it++) {
    tc.position.copy(c).addScaledVector(dir, dist); tc.lookAt(c); tc.updateMatrixWorld(); tc.updateProjectionMatrix();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(([q, s]) => { const v = q.clone().project(tc); x0 = Math.min(x0, v.x / s); x1 = Math.max(x1, v.x / s); y0 = Math.min(y0, v.y / s); y1 = Math.max(y1, v.y / s); });
    const hx = dist * tH, hy = dist * tV;
    c.addScaledVector(right, (x0 + x1) / 2 * hx).addScaledVector(up, ((y0 + y1) / 2 - YC) * hy);
    const k = Math.max((x1 - x0) / 2 / FX, (y1 - y0) / 2 / FY);
    dist = Math.max(dist * clamp(1 + (k - 1) * 0.9, 0.6, 1.6), -zMin + 12);
  }
  return { tgt: c, pos: c.clone().addScaledVector(dir, dist) };
}
// 격자 무늬 (철근 배근 · 커튼월 멀리언)
// 철근 배근 (1.2m 한 칸에 0.3m 간격 네 가닥 × 두 방향): 녹슨 철근 + 결속선, 바탕은 투명
function rebarMatTex() {
  const n = 128, st = n / 4, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'); x.clearRect(0, 0, n, n);
  const bar = (v, horiz, w) => { x.fillStyle = '#4e3224'; horiz ? x.fillRect(0, v - w / 2, n, w) : x.fillRect(v - w / 2, 0, w, n); x.fillStyle = '#9c6a4c'; horiz ? x.fillRect(0, v - w / 2 + 1, n, 1.5) : x.fillRect(v - w / 2 + 1, 0, 1.5, n); };
  for (let i = 0; i < 4; i++) bar(st * i + st / 2, true, 5);
  for (let i = 0; i < 4; i++) bar(st * i + st / 2, false, 5);
  x.fillStyle = '#26282b'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) x.fillRect(st * i + st / 2 - 2.5, st * j + st / 2 - 2.5, 5, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function gridTex(color, lw = 6, alpha = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.clearRect(0, 0, 64, 64); x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = lw;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 0); x.moveTo(0, 0); x.lineTo(0, 64); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
