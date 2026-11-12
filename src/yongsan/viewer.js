// 용산 3D 뷰어 — 흰 모형 + 검은 선의 엑소노메트릭 다이어그램 표현
// 층 단위 인스턴스 메시(회전한 부분 포함), 광역 맥락, 동지 그림자, 점선 지시선 라벨, 선택, 4D 공정 진행 표시
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ROT_DEG, SITE, BANDS, CONTEXT, BLOCKS, NAMSAN, toWorld } from './plan.js';
import { farContext, WATER, ISLANDS, PARKS, ROADS, BRIDGES, HILL, hillHeight } from './context.js';
import { sunWorld } from './analysis.js';

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888888';
const USE_TOKEN = { res: '--res', officetel: '--officetel', office: '--office', retail: '--retail', lobby: '--retail', refuge: '--refuge', mech: '--mech' };
const SVGNS = 'http://www.w3.org/2000/svg';

export function createViewer(stage, { onPick, onView, hero = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', '용산국제업무지구 3D 매스. 드래그로 회전, 오른쪽 드래그로 이동, 휠로 확대, 건물을 누르면 정보 표시');
  stage.prepend(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); }
  catch (e) { canvas.remove(); return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 4200, 13000);
  const persp = new THREE.PerspectiveCamera(32, 1.6, 5, 40000);
  const ortho = new THREE.OrthographicCamera(-1000, 1000, 600, -600, -20000, 40000);
  let camera = persp;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.1;
  controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 40; controls.maxDistance = 14000;
  controls.minZoom = 0.15; controls.maxZoom = 12;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = 0.35;

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d8d2, 1.55 * Math.PI); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.15 * Math.PI);
  sun.castShadow = true;
  const ms = Math.min(4096, renderer.capabilities.maxTextureSize || 2048);
  sun.shadow.mapSize.set(ms, ms);
  Object.assign(sun.shadow.camera, { left: -1700, right: 1700, top: 1700, bottom: -1700, near: 10, far: 12000 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.9;
  scene.add(sun); scene.add(sun.target);

  const lam = (tok, extra = {}) => new THREE.MeshLambertMaterial({ color: new THREE.Color(css(tok)), ...extra });
  const M = { ground: lam('--ground'), water: lam('--water'), park: lam('--park'), road: lam('--road'), rail: lam('--rail'), lot: lam('--site'), hill: lam('--hill'), bridge: lam('--model') };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), M.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const site = new THREE.Group(); site.rotation.y = -ROT_DEG * Math.PI / 180; scene.add(site);
  const flat = (r, y, m) => {
    const g = new THREE.PlaneGeometry(r.u1 - r.u0, r.v1 - r.v0); g.rotateX(-Math.PI / 2);
    const o = new THREE.Mesh(g, m); o.position.set((r.u0 + r.u1) / 2, y, (r.v0 + r.v1) / 2); o.receiveShadow = true; site.add(o); return o;
  };
  WATER.forEach(r => flat(r, 0.1, M.water));
  ISLANDS.forEach(r => flat(r, 0.6, M.park));
  PARKS.forEach(r => flat(r, 0.15, M.park));
  ROADS.forEach(r => flat(r, 0.2, M.road));
  BANDS.forEach(b => flat(b, b.kind === 'park' ? 0.3 : 0.22, M[b.kind]));
  BLOCKS.forEach(b => flat(b.lot, 0.25, M.lot));

  // 선 재질
  const lineMat = (tok, op, extra = {}) => new THREE.LineBasicMaterial({ color: new THREE.Color(css(tok)), transparent: true, opacity: op, ...extra });
  const L = {
    site: new THREE.LineDashedMaterial({ color: new THREE.Color(css('--accent')), dashSize: 14, gapSize: 9, transparent: true, opacity: 0.95 }),
    lot: lineMat('--edge', 0.35), edge: lineMat('--edge', 0.9), floor: lineMat('--edge', 0.22), ctx: lineMat('--edge', 0.55), far: lineMat('--edge', 0.28),
    grid: lineMat('--edge', 0.07), sel: lineMat('--accent', 1, { depthTest: false }), crane: lineMat('--accent', 0.95),
  };
  const rectPts = (r, y) => [new THREE.Vector3(r.u0, y, r.v0), new THREE.Vector3(r.u1, y, r.v0), new THREE.Vector3(r.u1, y, r.v1), new THREE.Vector3(r.u0, y, r.v1)];
  const siteLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rectPts(SITE, 0.8)), L.site); siteLine.computeLineDistances(); site.add(siteLine);
  BLOCKS.forEach(b => site.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rectPts(b.lot, 0.6)), L.lot)));
  const lineGeo = (pos) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g; };
  // 100m 격자 (도면 느낌)
  {
    const pos = [], E = 3000;
    for (let x = -E; x <= E; x += 100) { pos.push(x, 0.05, -E, x, 0.05, E); pos.push(-E, 0.05, x, E, 0.05, x); }
    site.add(new THREE.LineSegments(lineGeo(pos), L.grid));
  }

  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  const setInst = (mesh, i, cu, cv, y0, w, h, d, a) => {
    tmpQ.setFromAxisAngle(yAxis, -(a || 0)); tmpS.set(w, h, d); tmpP.set(cu, y0, cv);
    tmpM.compose(tmpP, tmpQ, tmpS); mesh.setMatrixAt(i, tmpM);
  };
  // 부분의 네 모서리 (대지 좌표)
  const corners = (cu, cv, w, d, a) => {
    const c = Math.cos(a || 0), s = Math.sin(a || 0), hw = w / 2, hd = d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [cu + x * c - y * s, cv + x * s + y * c]);
  };
  // 상자 윤곽선: 위(·아래) 테두리 + 세로 모서리
  function boxEdges(pos, cu, cv, w, d, a, y0, y1, bottom = true) {
    const k = corners(cu, cv, w, d, a);
    for (let i = 0; i < 4; i++) {
      const p = k[i], q = k[(i + 1) % 4];
      pos.push(p[0], y1, p[1], q[0], y1, q[1]);
      if (bottom) pos.push(p[0], y0, p[1], q[0], y0, q[1]);
      pos.push(p[0], y0, p[1], p[0], y1, p[1]);
    }
  }

  // ---------- 가까운 맥락 (분석 대상) ----------
  const modelMat = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
  const ctxMesh = new THREE.InstancedMesh(box, modelMat(), CONTEXT.length);
  { const pos = [];
    CONTEXT.forEach((c, i) => {
      const cu = (c.u0 + c.u1) / 2, cv = (c.v0 + c.v1) / 2;
      setInst(ctxMesh, i, cu, cv, 0, c.u1 - c.u0, c.y1, c.v1 - c.v0, 0); ctxMesh.setColorAt(i, tmpC.set(0xffffff));
      boxEdges(pos, cu, cv, c.u1 - c.u0, c.v1 - c.v0, 0, 0, c.y1, false);
    });
    ctxMesh.castShadow = true; ctxMesh.receiveShadow = true; site.add(ctxMesh);
    site.add(new THREE.LineSegments(lineGeo(pos), L.ctx));
  }
  // ---------- 광역 맥락 ----------
  const FAR = farContext();
  const farMesh = new THREE.InstancedMesh(box, modelMat(), FAR.bldgs.length);
  { const pos = [];
    FAR.bldgs.forEach((b, i) => {
      setInst(farMesh, i, b.cu, b.cv, 0, b.w, b.h, b.d, b.a); farMesh.setColorAt(i, tmpC.set(0xffffff));
      boxEdges(pos, b.cu, b.cv, b.w, b.d, b.a, 0, b.h, false);
    });
    farMesh.castShadow = true; farMesh.receiveShadow = true; site.add(farMesh);
    site.add(new THREE.LineSegments(lineGeo(pos), L.far));
  }
  // 나무: 흰 원뿔
  const cone = new THREE.ConeGeometry(0.5, 1, 6); cone.translate(0, 0.5, 0);
  const treeMat = lam('--tree');
  const trees = new THREE.InstancedMesh(cone, treeMat, FAR.trees.length + 400);
  let nt = 0;
  FAR.trees.forEach(([u, v, h, y0]) => { setInst(trees, nt++, u, v, y0 || 0, h * 0.62, h, h * 0.62, 0); });
  { const P = BANDS.find(b => b.kind === 'park'); for (let u = P.u0 + 10; u < P.u1 - 10; u += 16) for (const v of [P.v0 + 10, P.v1 - 10]) { if (nt < FAR.trees.length + 400) setInst(trees, nt++, u, v, 0, 5, 9, 5, 0); } }
  trees.count = nt; trees.castShadow = true; site.add(trees);
  // 남산 언덕 + 등고선 + N서울타워
  {
    const g = new THREE.PlaneGeometry(HILL.ru * 4.2, HILL.rv * 4.2, 90, 60); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) + HILL.cu, v = p.getZ(i) + HILL.cv; p.setY(i, Math.max(0, hillHeight(u, v) - 0.5)); }
    g.computeVertexNormals();
    const hill = new THREE.Mesh(g, M.hill); hill.position.set(HILL.cu, 0, HILL.cv); hill.receiveShadow = true; hill.castShadow = true; site.add(hill);
    const pos = [];
    for (let hgt = 25; hgt < HILL.h; hgt += 25) {
      const r = Math.sqrt(-Math.log(hgt / HILL.h)), N = 96, c = Math.cos(HILL.rot), s = Math.sin(HILL.rot);
      const pt = (t) => { const x = Math.cos(t) * r * HILL.ru, y = Math.sin(t) * r * HILL.rv; return [HILL.cu + x * c - y * s, HILL.cv + x * s + y * c]; };
      for (let k = 0; k < N; k++) { const a = pt(k / N * Math.PI * 2), b = pt((k + 1) / N * Math.PI * 2); pos.push(a[0], hgt + 0.6, a[1], b[0], hgt + 0.6, b[1]); }
    }
    site.add(new THREE.LineSegments(lineGeo(pos), L.far));
    const tower = new THREE.Group(), m = modelMat();
    const mastH = NAMSAN[2] - HILL.h - 140;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 140, 12), m); shaft.position.y = 70;
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(15, 12, 22, 16), m); pod.position.y = 120;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.5, mastH, 8), m); mast.position.y = 140 + mastH / 2;
    [shaft, pod, mast].forEach(x => { x.castShadow = true; tower.add(x); });
    tower.position.set(NAMSAN[0], HILL.h - 2, NAMSAN[1]); site.add(tower);
  }
  // 다리
  {
    const br = new THREE.InstancedMesh(box, M.bridge, BRIDGES.length), pos = [];
    BRIDGES.forEach((b, k) => {
      setInst(br, k, b.cu, b.cv, b.y - 2.5, b.w, 2.5, b.len, b.a);
      boxEdges(pos, b.cu, b.cv, b.w, b.len, b.a, b.y - 2.5, b.y, true);
      const n = Math.round(b.len / 90), c = Math.cos(b.a), s = Math.sin(b.a);
      for (let i = 1; i < n; i++) {
        const t = -b.len / 2 + b.len * i / n, pu = b.cu - t * s, pv = b.cv + t * c;
        pos.push(pu - b.w / 2 * c, 0.1, pv - b.w / 2 * s, pu - b.w / 2 * c, b.y - 2.5, pv - b.w / 2 * s, pu + b.w / 2 * c, 0.1, pv + b.w / 2 * s, pu + b.w / 2 * c, b.y - 2.5, pv + b.w / 2 * s);
      }
      if (b.rail) for (let i = 0; i < 4; i++) { const off = -b.w / 2 + b.w * (i + 0.5) / 4; pos.push(b.cu + off * c + b.len / 2 * s, b.y + 5, b.cv + off * s - b.len / 2 * c, b.cu + off * c - b.len / 2 * s, b.y + 5, b.cv + off * s + b.len / 2 * c); }
    });
    br.castShadow = true; br.receiveShadow = true; site.add(br);
    site.add(new THREE.LineSegments(lineGeo(pos), L.ctx));
  }

  // ---------- 사업지 매스 ----------
  let floorsMesh = null, edgeLines = null, floorLines = null, skyMesh = null, index = [], gen = null, progress = null, craneLines = null;
  const floorMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const selBox = new THREE.LineSegments(lineGeo([]), L.sel); selBox.visible = false; selBox.renderOrder = 10; site.add(selBox);

  // 층 → 상자들 (부분마다, 옥탑은 코어 위 정사각형)
  function floorBoxes(b, f) {
    const s = f.s || 1;
    if (f.roof) { const e = Math.sqrt(Math.max(1, f.area)); return [{ cu: b.core.u, cv: b.core.v, w: e, d: e, a: 0 }]; }
    return b.parts.map(q => ({ cu: q.cu, cv: q.cv, w: q.w * s, d: q.d * s, a: q.a }));
  }
  // 윤곽선(검정) + 층선(옅은 회색)
  function buildEdges(visible) {
    const pos = [], fpos = [];
    gen.bldgs.forEach((b, bi) => {
      if (b.kind === 'basement') return;
      const fl = b.floors;
      fl.forEach((f, fi) => {
        if (f.lv <= 0 || (visible && !visible(bi, fi))) return;
        const prev = fl[fi - 1], next = fl[fi + 1];
        const same = (o) => o && o.lv > 0 && !o.roof && !f.roof && (o.s || 1) === (f.s || 1);
        const sameAsPrev = same(prev);
        const sameAsNext = same(next) && (!visible || visible(bi, fi + 1));
        floorBoxes(b, f).forEach(x => {
          const k = corners(x.cu, x.cv, x.w, x.d, x.a);
          for (let i = 0; i < 4; i++) {
            const p = k[i], q = k[(i + 1) % 4];
            pos.push(p[0], f.y0, p[1], p[0], f.y1, p[1]);
            if (!sameAsNext) pos.push(p[0], f.y1, p[1], q[0], f.y1, q[1]);
            if (!sameAsPrev) pos.push(p[0], f.y0, p[1], q[0], f.y0, q[1]);
            else fpos.push(p[0], f.y0, p[1], q[0], f.y0, q[1]);
          }
        });
      });
    });
    if (edgeLines) { site.remove(edgeLines); edgeLines.geometry.dispose(); }
    if (floorLines) { site.remove(floorLines); floorLines.geometry.dispose(); }
    edgeLines = new THREE.LineSegments(lineGeo(pos), L.edge); site.add(edgeLines);
    floorLines = new THREE.LineSegments(lineGeo(fpos), L.floor); site.add(floorLines);
  }

  function setModel(g) {
    gen = g; progress = null;
    if (floorsMesh) { site.remove(floorsMesh); floorsMesh.dispose(); }
    if (skyMesh) { site.remove(skyMesh); skyMesh.dispose(); skyMesh = null; }
    clearCranes();
    index = [];
    g.bldgs.forEach((b, bi) => { if (b.kind === 'basement') return; b.floors.forEach((f, fi) => { if (f.lv > 0) floorBoxes(b, f).forEach((x, pi) => index.push([bi, fi, pi])); }); });
    floorsMesh = new THREE.InstancedMesh(box, floorMat, Math.max(1, index.length));
    placeFloors();
    floorsMesh.castShadow = true; floorsMesh.receiveShadow = true;
    site.add(floorsMesh);
    buildEdges(null);
    if (g.sky.length) {
      skyMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), g.sky.length);
      g.sky.forEach((s, i) => setInst(skyMesh, i, (s.u0 + s.u1) / 2, s.vc, s.y0, s.u1 - s.u0, s.y1 - s.y0, 8, 0));
      skyMesh.castShadow = true; site.add(skyMesh);
    }
    selBox.visible = false; selected = null; selLabel.hidden = true;
    placeLandmarkLabel();
    dirty = true;
  }
  function placeFloors() {
    index.forEach(([bi, fi, pi], i) => {
      const b = gen.bldgs[bi], f = b.floors[fi], x = floorBoxes(b, f)[pi];
      const vis = !progress || progress(bi, fi) > 0;
      if (vis) setInst(floorsMesh, i, x.cu, x.cv, f.y0, x.w, f.h, x.d, x.a);
      else setInst(floorsMesh, i, x.cu, x.cv, -50, 0.001, 0.001, 0.001, 0);
    });
    floorsMesh.count = index.length;
    floorsMesh.instanceMatrix.needsUpdate = true;
    floorsMesh.computeBoundingSphere();
  }

  // ---------- 색칠 ----------
  let mode = 'use', agg = null, selected = null;
  function paint(m, a) {
    mode = m; agg = a;
    if (!floorsMesh || !gen) return;
    const C = {}; Object.entries(USE_TOKEN).forEach(([k, t]) => { C[k] = new THREE.Color(css(t)); });
    const white = new THREE.Color(css('--model')), na = new THREE.Color(css('--model-na'));
    const lo = new THREE.Color(css('--heat-lo')), hi = new THREE.Color(css('--heat-hi'));
    const hiLite = new THREE.Color(css('--accent'));
    const P = { struct: new THREE.Color(css('--p-struct')), skin: new THREE.Color(css('--p-skin')) };
    index.forEach(([bi, fi], i) => {
      const b = gen.bldgs[bi], f = b.floors[fi];
      if (progress) { const st = progress(bi, fi); tmpC.copy(st >= 3 ? (C[f.use] || white) : st === 2 ? P.skin : P.struct); }
      else if (mode === 'model' || mode === 'ctx') tmpC.copy(white);
      else if (mode === 'use' || !agg) tmpC.copy(C[f.use] || white);
      else {
        const a2 = agg.floor.get(bi * 1000 + fi);
        if (!a2 || !a2.n) tmpC.copy(na);
        else { const v = mode === 'sun' ? a2.sun / a2.n : mode === 'river' ? a2.river / a2.n : a2.namsan / a2.n; tmpC.lerpColors(lo, hi, v); }
      }
      if (bi === selected && !progress) tmpC.lerp(hiLite, 0.5);
      floorsMesh.setColorAt(i, tmpC);
    });
    floorsMesh.instanceColor.needsUpdate = true;
    CONTEXT.forEach((c, i) => {
      tmpC.copy(white);
      if (mode === 'ctx' && agg && agg.ctx) { const x = agg.ctx.get(i); if (x && x.n) tmpC.lerpColors(lo, hi, x.lost / x.n); }
      ctxMesh.setColorAt(i, tmpC);
    });
    ctxMesh.instanceColor.needsUpdate = true;
    dirty = true;
  }

  // ---------- 4D 공정 ----------
  // fn(bi, fi) → 0 미착공(숨김) · 1 골조 · 2 외장 · 3 완료. cranes: [{u, v, h, a}]
  function setProgress(fn, cranes) {
    progress = fn || null;
    if (!gen) return;
    placeFloors();
    buildEdges(progress ? (bi, fi) => progress(bi, fi) > 0 : null);
    if (skyMesh) skyMesh.visible = !progress;
    clearCranes();
    if (cranes && cranes.length) {
      const pos = [];
      cranes.forEach(({ u, v, h, a = 0.6 }) => {
        const top = h + 18, jib = 62, cj = 18, c = Math.cos(a), s = Math.sin(a);
        pos.push(u - 1.2, 0, v, u - 1.2, top, v, u + 1.2, 0, v, u + 1.2, top, v);
        for (let y = 0; y + 6 <= top; y += 6) pos.push(u - 1.2, y, v, u + 1.2, y + 6, v);
        pos.push(u - cj * c, top, v - cj * s, u + jib * c, top, v + jib * s);
        pos.push(u, top + 10, v, u + jib * c, top, v + jib * s, u, top + 10, v, u - cj * c, top, v - cj * s, u, top, v, u, top + 10, v);
        pos.push(u + jib * 0.72 * c, top, v + jib * 0.72 * s, u + jib * 0.72 * c, Math.max(2, h + 3), v + jib * 0.72 * s);
      });
      craneLines = new THREE.LineSegments(lineGeo(pos), L.crane); site.add(craneLines);
    }
    paint(mode, agg);
  }
  function clearCranes() { if (craneLines) { site.remove(craneLines); craneLines.geometry.dispose(); craneLines = null; } }

  // ---------- 해 ----------
  function setSun(decl, hour) {
    const w = sunWorld(decl, hour);
    const up = w[1] > 0;
    sun.position.set(w[0] * 5000, Math.max(w[1], 0.02) * 5000, w[2] * 5000);
    sun.target.position.set(0, 0, 0);
    sun.intensity = (up ? 1.15 : 0) * Math.PI;
    hemi.intensity = (up ? 1.55 : 1.9) * Math.PI;
    dirty = true;
    return w;
  }

  // ---------- 시점 ----------
  const W = (u, v, y) => { const [x, z] = toWorld(u, v); return new THREE.Vector3(x, y, z); };
  const VIEWS = {
    axon: { cam: 'ortho', p: () => new THREE.Vector3(-2000, 1900, 2400), t: () => new THREE.Vector3(60, 60, 60), half: 760 },
    hero: { cam: 'ortho', p: () => new THREE.Vector3(-2240, 1840, 2210), t: () => new THREE.Vector3(-180, 0, -130), half: 600 },
    bird: { cam: 'persp', p: () => new THREE.Vector3(-1450, 1200, 2450), t: () => new THREE.Vector3(140, 40, -160) },
    wide: { cam: 'persp', p: () => new THREE.Vector3(-3100, 2900, 5200), t: () => new THREE.Vector3(200, 0, -500) },
    top: { cam: 'ortho', p: () => new THREE.Vector3(0, 6000, 1), t: () => new THREE.Vector3(0, 0, 0), half: 900 },
    river: { cam: 'persp', p: () => W(-120, 1080, 28), t: () => W(40, 0, 140) },
    east: { cam: 'persp', p: () => W(1350, 60, 160), t: () => W(0, 0, 90) },
    namsan: { cam: 'persp', p: () => W(NAMSAN[0], NAMSAN[1], NAMSAN[2]), t: () => W(-60, 40, 30) },
  };
  let orthoHalf = 760, viewKind = 'bird';
  function useCamera(kind) {
    const next = kind === 'ortho' ? ortho : persp;
    if (next === camera) return;
    camera = next; controls.object = camera;
  }
  function setView(kind) {
    const V = VIEWS[kind] || VIEWS.bird;
    useCamera(V.cam);
    if (V.cam === 'ortho') { orthoHalf = V.half; ortho.zoom = 1; }
    camera.position.copy(V.p()); controls.target.copy(V.t());
    camera.updateProjectionMatrix(); controls.update(); dirty = true;
    viewKind = kind;
    if (onView) onView(kind);
  }
  function focusBlock(id) {
    const b = BLOCKS.find(x => x.id === id); if (!b) return;
    const cu = (b.lot.u0 + b.lot.u1) / 2, cv = (b.lot.v0 + b.lot.v1) / 2;
    if (camera === ortho) { const d = camera.position.clone().sub(controls.target); controls.target.copy(W(cu, cv, 40)); camera.position.copy(controls.target).add(d); ortho.zoom = 2.6; ortho.updateProjectionMatrix(); }
    else { controls.target.copy(W(cu, cv, 40)); camera.position.copy(W(cu - 300, cv + 460, 360)); }
    controls.update(); dirty = true;
  }

  // ---------- 라벨 (점선 지시선) ----------
  const labelBox = document.createElement('div'); labelBox.className = 'labels'; stage.appendChild(labelBox);
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'leaders'); labelBox.appendChild(svg);
  const labels = [];
  // cls: place(지명) · far(먼 지명) · water(수면) · tag(검은 상자) · blk(블록 번호)
  const addLabel = (text, pos, cls = 'place', dx = 0, dy = -34) => {
    const el = document.createElement('span'); el.textContent = text; el.className = 'lb ' + cls; labelBox.appendChild(el);
    const line = document.createElementNS(SVGNS, 'path'); line.setAttribute('class', 'ld'); svg.appendChild(line);
    const dot = document.createElementNS(SVGNS, 'circle'); dot.setAttribute('r', '2.2'); dot.setAttribute('class', 'dt'); svg.appendChild(dot);
    const Lb = { el, line, dot, pos, cls, dx, dy }; labels.push(Lb); return Lb;
  };
  if (!hero) {
    addLabel('HAN RIVER · 한강', W(0, 1060, 0), 'water', 0, 0);
    addLabel('용산역', W(720, -60, 45), 'place', 26, -40);
    addLabel('서부이촌동', W(-260, 320, 50), 'place', -30, -30);
    addLabel('동부이촌동', W(1500, 380, 50), 'far', 0, -30);
    addLabel('용산전자상가', W(240, -430, 35), 'place', 0, -30);
    addLabel('철도·차량기지', W(-760, -280, 6), 'place', -20, -26);
    addLabel('여의도', W(-2600, 2100, 300), 'far', 0, -36);
    addLabel('노량진', W(-100, 2000, 60), 'far', 0, -30);
    addLabel('흑석동', W(1600, 2100, 70), 'far', 0, -30);
    addLabel('용산공원', W(2300, -1600, 10), 'far', 0, -20);
    addLabel('남산 N서울타워', W(NAMSAN[0], NAMSAN[1], NAMSAN[2]), 'far', 0, -30);
    addLabel('한강대교', W(650, 1350, 16), 'far', 24, -24);
    addLabel('원효대교', W(-1350, 1350, 16), 'far', -24, -24);
    addLabel('마포·공덕', W(-2400, -1200, 100), 'far', 0, -30);
  } else {
    addLabel('남산', W(NAMSAN[0], NAMSAN[1], NAMSAN[2]), 'far', 0, -26);
    addLabel('한강', W(0, 1060, 0), 'water', 0, 0);
    addLabel('여의도', W(-2600, 2100, 300), 'far', 0, -30);
  }
  if (!hero) BLOCKS.forEach(b => addLabel(b.id, W((b.lot.u0 + b.lot.u1) / 2, (b.lot.v0 + b.lot.v1) / 2, 1), 'blk', 0, 0));
  const lmLabel = addLabel('LANDMARK', new THREE.Vector3(), 'tag', 46, -60);
  const selLabel = addLabel('', new THREE.Vector3(), 'tag sel', -60, -70); selLabel.hidden = true;
  function placeLandmarkLabel() {
    const lm = gen && gen.bldgs.find(b => b.kind === 'landmark');
    lmLabel.hidden = !lm;
    if (lm) { lmLabel.pos.copy(W(lm.core.u, lm.core.v, lm.height)); lmLabel.el.textContent = `LANDMARK · ${lm.storeys}F · ${Math.round(lm.height)}m`; }
  }
  const v3 = new THREE.Vector3();
  const hide = (Lb) => { Lb.el.style.display = 'none'; Lb.line.style.display = 'none'; Lb.dot.style.display = 'none'; };
  function updateLabels(w, h) {
    const topView = controls.getPolarAngle() < 0.75;
    labels.forEach(Lb => {
      if (Lb.hidden || (Lb.cls === 'blk' && !topView) || (progress && (Lb.cls === 'far' || Lb === lmLabel))) return hide(Lb);
      v3.copy(Lb.pos).project(camera);
      if (v3.z > 1 || v3.x < -0.98 || v3.x > 0.98 || v3.y < -0.98 || v3.y > 0.96) return hide(Lb);
      const ax = (v3.x + 1) / 2 * w, ay = (1 - v3.y) / 2 * h;
      const lx = ax + Lb.dx, ly = ay + Lb.dy;
      if (ly < 8 || lx < 4 || lx > w - 4) return hide(Lb);
      Lb.el.style.display = '';
      const tx = Lb.dx < -4 ? '-100%' : Lb.dx > 4 ? '0%' : '-50%', ty = Lb.dy === 0 ? '-50%' : '-100%';
      Lb.el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(${tx}, ${ty})`;
      const lead = Lb.dx !== 0 || Lb.dy !== 0;
      Lb.line.style.display = lead ? '' : 'none'; Lb.dot.style.display = lead ? '' : 'none';
      if (lead) { Lb.line.setAttribute('d', `M${ax.toFixed(1)},${ay.toFixed(1)} L${lx.toFixed(1)},${ly.toFixed(1)}`); Lb.dot.setAttribute('cx', ax.toFixed(1)); Lb.dot.setAttribute('cy', ay.toFixed(1)); }
    });
  }

  // 나침반 · 축척
  const compass = document.createElement('div'); compass.className = 'compass'; compass.setAttribute('aria-hidden', 'true');
  compass.innerHTML = `<svg viewBox="-22 -22 44 44"><circle r="17" class="cr"></circle><g><path d="M0 -15 L4 3 L0 0 L-4 3 Z" class="nd"></path><text y="-19" text-anchor="middle">N</text></g></svg>`;
  const compassG = compass.querySelector('g');
  const scaleBar = document.createElement('div'); scaleBar.className = 'scalebar'; scaleBar.setAttribute('aria-hidden', 'true');
  if (!hero) { stage.appendChild(compass); stage.appendChild(scaleBar); }

  // ---------- 선택 ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; if (hero) controls.autoRotate = false; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    if (!floorsMesh || hero) return;
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(floorsMesh, false)[0];
    if (hit && hit.instanceId != null) { const [bi, fi] = index[hit.instanceId]; select(bi); if (onPick) onPick(bi, fi); }
    else { select(null); if (onPick) onPick(null); }
  });
  function select(bi) {
    selected = bi == null ? null : bi;
    paint(mode, agg);
    if (bi == null || !gen) { selBox.visible = false; selLabel.hidden = true; dirty = true; return; }
    const b = gen.bldgs[bi], pos = [];
    b.parts.forEach(q => boxEdges(pos, q.cu, q.cv, q.w + 3, q.d + 3, q.a, 0, b.height + 1.5, true));
    selBox.geometry.dispose(); selBox.geometry = lineGeo(pos); selBox.visible = true;
    selLabel.hidden = false; selLabel.pos.copy(W(b.core.u, b.core.v, b.height));
    selLabel.el.textContent = `${b.id} · ${b.storeys}F · ${Math.round(b.height)}m`;
    dirty = true;
  }

  // ---------- 테마 ----------
  function applyTheme() {
    const bg = new THREE.Color(css('--scene'));
    scene.background = bg; scene.fog.color.copy(bg);
    M.ground.color.set(css('--ground')); M.water.color.set(css('--water')); M.park.color.set(css('--park'));
    M.rail.color.set(css('--rail')); M.road.color.set(css('--road')); M.lot.color.set(css('--site')); M.hill.color.set(css('--hill')); M.bridge.color.set(css('--model'));
    treeMat.color.set(css('--tree'));
    const model = new THREE.Color(css('--model'));
    [ctxMesh, farMesh].forEach(m => { for (let i = 0; i < m.count; i++) m.setColorAt(i, model); m.instanceColor.needsUpdate = true; });
    L.site.color.set(css('--accent')); L.sel.color.set(css('--accent')); L.crane.color.set(css('--accent'));
    ['lot', 'edge', 'floor', 'ctx', 'far', 'grid'].forEach(k => L[k].color.set(css('--edge')));
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    hemi.color.set(dark ? 0x9aa3b0 : 0xffffff); hemi.groundColor.set(dark ? 0x2a2e34 : 0xd8d8d2);
    paint(mode, agg);
  }

  // ---------- 그리기 ----------
  let dirty = true, alive = true;
  controls.addEventListener('change', () => { dirty = true; });
  const ro = new ResizeObserver(() => { dirty = true; }); ro.observe(stage);
  function frame() {
    if (!alive) return;
    const moved = controls.update();
    if (dirty || moved || controls.autoRotate) {
      dirty = false;
      const w = stage.clientWidth, h = stage.clientHeight;
      if (w && h) {
        const pr = renderer.getPixelRatio();
        if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
        const asp = w / h;
        persp.aspect = asp; persp.updateProjectionMatrix();
        ortho.left = -orthoHalf * asp; ortho.right = orthoHalf * asp; ortho.top = orthoHalf; ortho.bottom = -orthoHalf; ortho.updateProjectionMatrix();
        renderer.render(scene, camera);
        updateLabels(w, h);
        compassG.setAttribute('transform', `rotate(${(controls.getAzimuthalAngle() * 180 / Math.PI).toFixed(1)})`);
        if (camera === ortho) {
          const mpp = (2 * orthoHalf / ortho.zoom) / h;
          const nice = [25, 50, 100, 200, 250, 500, 1000, 2000].find(x => x / mpp >= 60) || 2000;
          scaleBar.style.display = ''; scaleBar.innerHTML = `<i style="width:${(nice / mpp).toFixed(0)}px"></i><span>${nice >= 1000 ? nice / 1000 + ' km' : nice + ' m'}</span>`;
        } else scaleBar.style.display = 'none';
      }
    }
    requestAnimationFrame(frame);
  }
  applyTheme();
  setView(hero ? (window.innerWidth > 900 ? 'hero' : 'axon') : 'axon');
  if (hero) controls.autoRotate = true;
  requestAnimationFrame(frame);

  function dispose() {
    alive = false; ro.disconnect(); controls.dispose();
    renderer.dispose(); renderer.forceContextLoss();
    labelBox.remove(); compass.remove(); scaleBar.remove(); canvas.remove();
  }
  return {
    setModel, paint, setSun, setView, focusBlock, select, applyTheme, setProgress, dispose,
    setAutoRotate: (v) => { controls.autoRotate = !!v; dirty = true; },
    snapshot: () => canvas.toDataURL('image/png'), get view() { return viewKind; },
  };
}
