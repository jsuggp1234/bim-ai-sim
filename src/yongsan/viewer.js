// 용산 매스 3D 뷰어: 층 단위 인스턴스 메시, 동지 그림자, 주변 맥락, 라벨, 선택
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ROT_DEG, SITE, RIVER, BANDS, CONTEXT, BLOCKS, NAMSAN, toWorld } from './plan.js';
import { sunWorld } from './analysis.js';

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888888';
const USE_TOKEN = { res: '--res', officetel: '--officetel', office: '--office', retail: '--retail', lobby: '--retail', refuge: '--refuge', mech: '--mech' };

export function createViewer(stage, { onPick, onView } = {}) {
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
  const camera = new THREE.PerspectiveCamera(34, 1.6, 5, 40000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 40; controls.maxDistance = 9000;
  controls.screenSpacePanning = false;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556655, 0.6 * Math.PI); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.95 * Math.PI);
  sun.castShadow = true;
  const ms = Math.min(4096, renderer.capabilities.maxTextureSize || 2048);
  sun.shadow.mapSize.set(ms, ms);
  Object.assign(sun.shadow.camera, { left: -1500, right: 1500, top: 1500, bottom: -1500, near: 10, far: 9000 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8;
  scene.add(sun); scene.add(sun.target);

  const mat = (tok) => new THREE.MeshLambertMaterial({ color: new THREE.Color(css(tok)) });
  const M = { ground: mat('--ground'), water: mat('--water'), park: mat('--park'), rail: mat('--rail'), road: mat('--road'), lot: mat('--site') };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), M.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const site = new THREE.Group(); site.rotation.y = -ROT_DEG * Math.PI / 180; scene.add(site);
  const flat = (r, y, m) => {
    const g = new THREE.PlaneGeometry(r.u1 - r.u0, r.v1 - r.v0); g.rotateX(-Math.PI / 2);
    const o = new THREE.Mesh(g, m); o.position.set((r.u0 + r.u1) / 2, y, (r.v0 + r.v1) / 2); o.receiveShadow = true; site.add(o); return o;
  };
  flat(RIVER, 0.12, M.water);
  BANDS.forEach(b => flat(b, b.kind === 'park' ? 0.3 : 0.2, M[b.kind]));
  BLOCKS.forEach(b => flat(b.lot, 0.25, M.lot));
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--accent')), transparent: true, opacity: 0.8 });
  const rectPts = (r, y) => [new THREE.Vector3(r.u0, y, r.v0), new THREE.Vector3(r.u1, y, r.v0), new THREE.Vector3(r.u1, y, r.v1), new THREE.Vector3(r.u0, y, r.v1)];
  const siteLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rectPts(SITE, 0.6)), lineMat); site.add(siteLine);
  const lotLineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--muted')), transparent: true, opacity: 0.45 });
  BLOCKS.forEach(b => site.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rectPts(b.lot, 0.5)), lotLineMat)));

  // 공통 상자 (바닥이 원점)
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();

  // 주변 건물
  const ctxMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), CONTEXT.length);
  CONTEXT.forEach((c, i) => {
    tmpM.makeScale(c.u1 - c.u0, c.y1, c.v1 - c.v0); tmpM.setPosition((c.u0 + c.u1) / 2, 0, (c.v0 + c.v1) / 2);
    ctxMesh.setMatrixAt(i, tmpM); ctxMesh.setColorAt(i, tmpC.set(0xffffff));
  });
  ctxMesh.castShadow = true; ctxMesh.receiveShadow = true; site.add(ctxMesh);
  const ctxEdges = edgesFor(CONTEXT.map(c => ({ u0: c.u0, u1: c.u1, v0: c.v0, v1: c.v1, h: c.y1 })));
  const ctxEdgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--muted')), transparent: true, opacity: 0.35 });
  site.add(new THREE.LineSegments(ctxEdges, ctxEdgeMat));

  // 사업지 매스
  let floorsMesh = null, edgeLines = null, skyMesh = null, index = [], gen = null;
  const floorMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--ink')), transparent: true, opacity: 0.28 });
  const selMat = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--accent')), depthTest: false, transparent: true });
  const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(box), selMat); selBox.visible = false; selBox.renderOrder = 10; site.add(selBox);

  function edgesFor(list) {
    const pos = [];
    list.forEach(r => {
      const c = [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
      for (let i = 0; i < 4; i++) {
        const a = c[i], b = c[(i + 1) % 4];
        pos.push(a[0], 0, a[1], b[0], 0, b[1], a[0], r.h, a[1], b[0], r.h, b[1], a[0], 0, a[1], a[0], r.h, a[1]);
      }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
  }

  function setModel(g) {
    gen = g;
    if (floorsMesh) { site.remove(floorsMesh); floorsMesh.dispose(); }
    if (edgeLines) { site.remove(edgeLines); edgeLines.geometry.dispose(); }
    if (skyMesh) { site.remove(skyMesh); skyMesh.dispose(); }
    index = [];
    g.bldgs.forEach((b, bi) => { if (b.kind === 'basement') return; b.floors.forEach((f, fi) => { if (f.lv > 0) index.push([bi, fi]); }); });
    floorsMesh = new THREE.InstancedMesh(box, floorMat, Math.max(1, index.length));
    index.forEach(([bi, fi], i) => {
      const b = g.bldgs[bi], f = b.floors[fi], r = b.rect;
      let w = r.u1 - r.u0, d = r.v1 - r.v0;
      if (f.roof) { const s = Math.min(1, Math.max(0.35, Math.sqrt(f.area / (w * d)))); w *= s; d *= s; }
      tmpM.makeScale(w, f.h, d); tmpM.setPosition((r.u0 + r.u1) / 2, f.y0, (r.v0 + r.v1) / 2);
      floorsMesh.setMatrixAt(i, tmpM); floorsMesh.setColorAt(i, tmpC.set(0xffffff));
    });
    floorsMesh.count = index.length;
    floorsMesh.castShadow = true; floorsMesh.receiveShadow = true;
    site.add(floorsMesh);
    edgeLines = new THREE.LineSegments(edgesFor(g.bldgs.filter(b => b.kind !== 'basement').map(b => ({ ...b.rect, h: b.height }))), edgeMat);
    site.add(edgeLines);
    if (g.sky.length) {
      skyMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: new THREE.Color(css('--office')) }), g.sky.length);
      g.sky.forEach((s, i) => { tmpM.makeScale(s.u1 - s.u0, s.y1 - s.y0, 8); tmpM.setPosition((s.u0 + s.u1) / 2, s.y0, s.vc); skyMesh.setMatrixAt(i, tmpM); });
      skyMesh.castShadow = true; site.add(skyMesh);
    }
    selBox.visible = false; selected = null;
    placeLandmarkLabel();
    dirty = true;
  }

  // ---------- 색칠 ----------
  let mode = 'use', agg = null, selected = null;
  function paint(m, a) {
    mode = m; agg = a;
    if (!floorsMesh || !gen) return;
    const C = {}; Object.entries(USE_TOKEN).forEach(([k, t]) => { C[k] = new THREE.Color(css(t)); });
    const neutral = new THREE.Color(css('--ctx'));
    const lo = new THREE.Color(css('--heat-lo')), hi = new THREE.Color(css('--heat-hi'));
    const dark = new THREE.Color(0x000000), hiLite = new THREE.Color(css('--accent'));
    index.forEach(([bi, fi], i) => {
      const b = gen.bldgs[bi], f = b.floors[fi];
      if (mode === 'use' || mode === 'ctx' || !agg) {
        if (mode === 'ctx') tmpC.copy(neutral);
        else { tmpC.copy(C[f.use] || neutral); if (f.lv % 2 === 0 && (f.use === 'res' || f.use === 'officetel' || f.use === 'office')) tmpC.lerp(dark, 0.07); }
      } else {
        const a2 = agg.floor.get(bi * 1000 + fi);
        if (!a2 || !a2.n) tmpC.copy(neutral);
        else { const v = mode === 'sun' ? a2.sun / a2.n : mode === 'river' ? a2.river / a2.n : a2.namsan / a2.n; tmpC.lerpColors(lo, hi, v); }
      }
      if (bi === selected) tmpC.lerp(hiLite, 0.45);
      floorsMesh.setColorAt(i, tmpC);
    });
    floorsMesh.instanceColor.needsUpdate = true;
    // 주변 건물: 영향 모드에서만 색 구분
    const base = new THREE.Color(css('--ctx'));
    CONTEXT.forEach((c, i) => {
      tmpC.copy(base);
      if (mode === 'ctx' && agg && agg.ctx) {
        const x = agg.ctx.get(i);
        if (x && x.n) tmpC.lerpColors(lo, hi, x.lost / x.n);
      }
      ctxMesh.setColorAt(i, tmpC);
    });
    ctxMesh.instanceColor.needsUpdate = true;
    dirty = true;
  }

  // ---------- 해 ----------
  function setSun(decl, hour) {
    const w = sunWorld(decl, hour);
    const up = w[1] > 0;
    sun.position.set(w[0] * 4000, Math.max(w[1], 0.02) * 4000, w[2] * 4000);
    sun.target.position.set(0, 0, 0);
    sun.intensity = (up ? 0.95 : 0) * Math.PI;
    hemi.intensity = (up ? 0.6 : 0.85) * Math.PI;
    dirty = true;
    return w;
  }

  // ---------- 시점 ----------
  const W = (u, v, y) => { const [x, z] = toWorld(u, v); return new THREE.Vector3(x, y, z); };
  const VIEWS = {
    bird: () => [new THREE.Vector3(-820, 980, 1520), new THREE.Vector3(30, 30, 40)],
    top: () => [new THREE.Vector3(0, 2700, 1), new THREE.Vector3(0, 0, 0)],
    river: () => [W(-120, 1080, 28), W(40, 0, 140)],
    east: () => [W(1350, 60, 160), W(0, 0, 90)],
    namsan: () => [W(NAMSAN[0], NAMSAN[1], NAMSAN[2]), W(-60, 40, 30)],
  };
  function setView(kind) {
    const [p, t] = (VIEWS[kind] || VIEWS.bird)();
    camera.position.copy(p); controls.target.copy(t); controls.update(); dirty = true;
    if (onView) onView(kind);
  }
  function focusBlock(id) {
    const b = BLOCKS.find(x => x.id === id); if (!b) return;
    const cu = (b.lot.u0 + b.lot.u1) / 2, cv = (b.lot.v0 + b.lot.v1) / 2;
    controls.target.copy(W(cu, cv, 40)); camera.position.copy(W(cu - 260, cv + 420, 330)); controls.update(); dirty = true;
  }

  // ---------- 라벨 ----------
  const labelBox = document.createElement('div'); labelBox.className = 'labels'; stage.appendChild(labelBox);
  const labels = [];
  const addLabel = (text, pos, cls = '') => { const el = document.createElement('span'); el.textContent = text; if (cls) el.className = cls; labelBox.appendChild(el); const L = { el, pos, cls }; labels.push(L); return L; };
  const nsDir = new THREE.Vector2(NAMSAN[0], NAMSAN[1]).normalize();
  addLabel('한 강', W(0, 1000, 0), 'water');
  addLabel('용산역', W(720, -60, 45));
  addLabel('서부이촌동', W(-260, 320, 50));
  addLabel('이촌동', W(120, 480, 60));
  addLabel('용산전자상가', W(240, -430, 35));
  addLabel('신용산 주상복합', W(1050, 30, 140));
  addLabel('철도·차량기지', W(-700, -280, 6));
  addLabel('↗ 남산 (약 3.6km)', W(nsDir.x * 1100, nsDir.y * 1100, 40));
  const blockLabels = BLOCKS.map(b => addLabel(b.id, W((b.lot.u0 + b.lot.u1) / 2, (b.lot.v0 + b.lot.v1) / 2, 1), 'blk'));
  const lmLabel = addLabel('랜드마크', new THREE.Vector3());
  function placeLandmarkLabel() {
    const lm = gen && gen.bldgs.find(b => b.kind === 'landmark');
    lmLabel.hidden = !lm;
    if (lm) lmLabel.pos.copy(W((lm.rect.u0 + lm.rect.u1) / 2, (lm.rect.v0 + lm.rect.v1) / 2, lm.top + 8));
  }
  const v3 = new THREE.Vector3();
  function updateLabels(w, h) {
    const topView = controls.getPolarAngle() < 0.75;
    labels.forEach(L => {
      const show = !L.hidden && (L.cls !== 'blk' || topView);
      if (!show) { L.el.style.display = 'none'; return; }
      v3.copy(L.pos).project(camera);
      if (v3.z > 1 || v3.x < -0.92 || v3.x > 0.92 || v3.y < -0.95 || v3.y > 0.9) { L.el.style.display = 'none'; return; }
      const px = (v3.x + 1) / 2 * w, py = (1 - v3.y) / 2 * h;
      if (py < 58) { L.el.style.display = 'none'; return; } // 위쪽 시점 버튼과 겹치지 않게
      L.el.style.display = '';
      L.el.style.left = px.toFixed(1) + 'px';
      L.el.style.top = py.toFixed(1) + 'px';
    });
  }

  // 나침반
  const compass = document.createElement('div'); compass.className = 'compass'; compass.setAttribute('aria-hidden', 'true');
  compass.title = '북쪽 방향';
  compass.innerHTML = `<svg viewBox="-15 -15 30 30"><g><path d="M0 -13 L4.2 0 L-4.2 0 Z" style="fill:var(--bad)"></path><path d="M0 13 L4.2 0 L-4.2 0 Z" style="fill:var(--muted)"></path><circle r="1.6" style="fill:var(--panel)"></circle></g></svg>`;
  stage.appendChild(compass);
  const compassG = compass.querySelector('g');

  // ---------- 선택 ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    if (!floorsMesh) return;
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
    if (bi == null || !gen) { selBox.visible = false; dirty = true; return; }
    const b = gen.bldgs[bi], r = b.rect, pad = 1.5;
    selBox.scale.set(r.u1 - r.u0 + pad * 2, b.top + pad, r.v1 - r.v0 + pad * 2);
    selBox.position.set((r.u0 + r.u1) / 2, 0, (r.v0 + r.v1) / 2);
    selBox.visible = true; dirty = true;
  }

  // ---------- 테마 ----------
  function applyTheme() {
    scene.background = new THREE.Color(css('--sky'));
    M.ground.color.set(css('--ground')); M.water.color.set(css('--water')); M.park.color.set(css('--park'));
    M.rail.color.set(css('--rail')); M.road.color.set(css('--road')); M.lot.color.set(css('--site'));
    lineMat.color.set(css('--accent')); lotLineMat.color.set(css('--muted')); edgeMat.color.set(css('--ink'));
    ctxEdgeMat.color.set(css('--muted')); selMat.color.set(css('--accent'));
    compass.style.color = css('--ink');
    if (skyMesh) skyMesh.material.color.set(css('--office'));
    paint(mode, agg);
  }

  // ---------- 그리기 ----------
  let dirty = true, alive = true;
  controls.addEventListener('change', () => { dirty = true; });
  const ro = new ResizeObserver(() => { dirty = true; }); ro.observe(stage);
  function frame() {
    if (!alive) return;
    const moved = controls.update();
    if (dirty || moved) {
      dirty = false;
      const w = stage.clientWidth, h = stage.clientHeight;
      if (w && h) {
        const pr = renderer.getPixelRatio();
        if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        updateLabels(w, h);
        compassG.setAttribute('transform', `rotate(${(controls.getAzimuthalAngle() * 180 / Math.PI).toFixed(1)})`);
      }
    }
    requestAnimationFrame(frame);
  }
  applyTheme();
  setView('bird');
  requestAnimationFrame(frame);

  function dispose() {
    alive = false; ro.disconnect(); controls.dispose();
    renderer.dispose(); renderer.forceContextLoss();
    labelBox.remove(); compass.remove(); canvas.remove();
  }
  return { setModel, paint, setSun, setView, focusBlock, select, applyTheme, dispose, snapshot: () => canvas.toDataURL('image/png') };
}
