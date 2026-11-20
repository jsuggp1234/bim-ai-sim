// 3D 뷰어: 어느 택지든 그 택지의 계획(plan)과 주변 맥락(ctx)으로 장면을 만든다.
// 맥락(도로·강·다리·건물·수목)은 scene/context3d.js, 사업지 BIM(부재·공정 상태)은 scene/bim3d.js.
// 시점은 택지 크기에 맞춰 잡고, 조망 시점(수변·산)은 그 택지의 조망 대상을 쓴다.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { sunWorld } from './analysis.js';
import { buildContext } from './scene/context3d.js';
import { createBim } from './scene/bim3d.js';
import { FACADE_U } from './scene/facade.js';
import { readPalette, isDark } from './scene/palette.js';
import { createLook } from './scene/look.js';
import { fallbackFor, analysisBoxes } from './ctxload.js';
import { OSM_ATTRIB } from './osm.js';
import { tickWater } from './scene/water.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const SUN_I = 4.6, MOON_I = 0.45;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// dayToggle: 검정 화면에서도 낮 장면을 기본으로 보여 주고, 장면 위 단추로 밤 장면과 바꾼다 (매스 단계)
export function createViewer(stage, { onPick, onView, hero = false, lite = false, dayToggle = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', '사업지 3D 모델. 드래그로 회전, 오른쪽 드래그로 이동, 휠로 확대, 건물을 누르면 정보 표시');
  stage.prepend(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, stencil: true }); }
  catch (e) { canvas.remove(); return null; }
  const LITE = lite || hero || window.innerWidth < 700;
  renderer.setPixelRatio(Math.min(LITE ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // 하늘·환경광·안개·톤 매핑·오클루전은 look이 맡는다
  const look = createLook(renderer, scene, { lite: LITE });
  const persp = new THREE.PerspectiveCamera(32, 1.6, 2, 40000);
  const ortho = new THREE.OrthographicCamera(-1000, 1000, 600, -600, -20000, 40000);
  let camera = persp;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.1;
  controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 12; controls.maxDistance = 14000;
  controls.minZoom = 0.15; controls.maxZoom = 40;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = 0.35;

  // 확산광은 하늘을 구운 환경광이 맡고, 반구광은 밤(어두운 화면)에만 약하게 보탠다
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d8d2, 0); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e6, SUN_I);
  sun.castShadow = true;
  const ms = Math.min(LITE ? 2048 : 4096, renderer.capabilities.maxTextureSize || 2048);
  sun.shadow.mapSize.set(ms, ms);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8;
  scene.add(sun); scene.add(sun.target);

  const NIGHT_KEY = 'bim.sceneNight';
  let dayScene = false;
  if (dayToggle) { try { dayScene = localStorage.getItem(NIGHT_KEY) !== '1'; } catch (e) { dayScene = true; } }
  // 낮 장면은 밝은 화면의 장면 색 그대로 (검정 화면일 때만 의미가 있다)
  const palNow = () => (dayScene && isDark() ? readPalette({ light: true }) : readPalette());
  let P = palNow();
  const site = new THREE.Group(); site.name = 'site'; scene.add(site);
  const bim = createBim(site, P, { lite: LITE });
  let plan = null, ctx = null, ctx3d = null, gen = null;
  const stale = [];
  let mode = 'use', agg = null, selected = null, build = null, xray = false;

  // ---------- 장면 ----------
  function setPlan(pl, c) {
    const changed = pl !== plan;
    plan = pl;
    site.rotation.y = -plan.rotDeg * Math.PI / 180; site.position.set(plan.off ? plan.off[0] : 0, 0, plan.off ? plan.off[1] : 0);
    const R0 = Math.hypot(plan.SITE.u1 - plan.SITE.u0, plan.SITE.v1 - plan.SITE.v0) / 2;
    const half = Math.max(1100, R0 + 800);
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 10, far: 14000 });
    sun.shadow.camera.updateProjectionMatrix();
    setContext(c || fallbackFor(plan));
    if (changed) { buildLabels(); if (viewKind) setView(viewKind); }
  }
  function setContext(c) {
    if (!plan) return;
    // 옛 맥락은 새 맥락을 한 번 그린 뒤에 지운다: 같은 셰이더를 계속 쓰게 해서 맥락을 바꿀 때마다 다시 컴파일하지 않는다
    if (ctx3d) { scene.remove(ctx3d.group); stale.push(ctx3d); ctx3d = null; }
    ctx = c;
    ctx3d = buildContext(ctx, plan, P, { lite: LITE, maxTex: renderer.capabilities.maxTextureSize, aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
    ctx3d.stencilMats.forEach(m => Object.assign(m, { stencilWrite: true, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: 1, stencilWriteMask: 0 }));
    scene.add(ctx3d.group);
    attrib.hidden = ctx.source !== 'osm';
    buildLabels();
    paintCtx();
    dirty = true;
  }
  function setModel(g) {
    gen = g;
    if (g.plan && g.plan !== plan) setPlan(g.plan);
    bim.setModel(g, plan);
    applyBuild();
    selected = null; selLabel.hidden = true; selBox.visible = false;
    placeLandmarkLabel();
    paint(mode, agg);
  }

  // ---------- 색 ----------
  function paint(m, a) {
    mode = m; agg = a;
    if (!gen) return;
    const prog = !!(build && build.floor);
    // 실사: 계획 건물만 재료 색을 입힌다 (주거 아이보리 패널 · 저층부 석재 · 업무 밝은 회청 · 기계실 짙은 회색). 주변은 흰 모형 그대로
    let pjDef = null;
    if (prog || m === 'real') bim.paint((bi, fi, e) => {
      if (!e || !e.x) return null; // 탱크·탑·돔은 제 색 그대로
      const b = gen.bldgs[bi], f = b && b.floors[fi]; if (!f) return null; if (e.x.roof || f.roof) return P.pjMech;
      const u = f.use;
      if (u === 'mech' || u === 'refuge') return P.pjMech;
      if (u === 'retail' || u === 'lobby' || b.kind === 'podium' || (u === 'res' && fi < 2)) return P.pjBase;
      if (u === 'res' || u === 'officetel') return P.pjRes;
      if (u === 'office' || b.kind === 'landmark' || b.kind === 'office') return P.pjOffice;
      return pjDef || (pjDef = P.wCom.clone().lerp(P.pjRes, 0.5)); // 그 밖의 용도: 주변보다 조금 따뜻한 패널
    });
    else if (m === 'model' || m === 'ctx') bim.paint(() => P.model);
    else if (m === 'use' || !agg) {
      // 용도 색을 외벽 바탕색과 섞어 모형처럼 (창 무늬가 보이게)
      const tone = {}; Object.entries(P.use).forEach(([k, c]) => { tone[k] = c.clone().lerp(P.wRes, 0.28); });
      bim.paint((bi, fi) => { const f = gen.bldgs[bi].floors[fi]; return f.roof ? P.duct : (tone[f.use] || P.model); });
    }
    else bim.paint((bi, fi) => {
      const a2 = agg.floor.get(bi * 1000 + fi);
      if (!a2 || !a2.n) return P.na;
      const v = m === 'sun' ? a2.sun / a2.n : m === 'river' ? a2.river / a2.n : a2.namsan / a2.n;
      return new THREE.Color().lerpColors(P.heatLo, P.heatHi, v);
    });
    paintCtx();
    dirty = true;
  }
  function paintCtx() {
    if (!ctx3d) return;
    if (mode === 'ctx' && agg && agg.ctx && ctx && plan) {
      const boxes = analysisBoxes(ctx, plan), byRef = new Map();
      boxes.forEach((b, i) => { const x = agg.ctx.get(i); if (x && x.n) byRef.set(b.ref, x.lost / x.n); });
      ctx3d.setHeat((i) => (byRef.has(i) ? new THREE.Color().lerpColors(P.heatLo, P.heatHi, byRef.get(i)) : null));
    } else ctx3d.setHeat(null);
  }

  // ---------- 4D 공정 ----------
  // b = { floor: (bi, fi) → 0~6, block: Map, cranes: [], focus: 'struct'|'mep'|'skin'|'fin'|null }
  function setBuild(b) { build = b && b.floor ? b : null; applyBuild(); paint(mode, agg); }
  function applyBuild() { if (gen) bim.setState({ ...(build || {}), xray }); hideSel(); dirty = true; }
  // 예전 호출 방식 호환: setProgress(stateFn, cranes, blockState)
  const setProgress = (fn, cranes, block, focus) => setBuild(fn ? { floor: fn, cranes, block, focus } : null);
  function setXray(v) { xray = !!v; applyBuild(); paint(mode, agg); }

  // ---------- 해 ----------
  let lastSun = [-10, 14];
  function setSun(decl, hour) {
    lastSun = [decl, hour];
    const w = sunWorld(decl, hour, plan ? plan.lat : undefined);
    const up = w[1] > 0;
    sun.position.set(w[0] * 6000, Math.max(w[1], 0.02) * 6000, w[2] * 6000);
    sun.target.position.set(0, 0, 0);
    sunDir.set(w[0], Math.max(w[1], 0.02), w[2]).normalize(); sunUp = up;
    lightLevels();
    scheduleSky();
    dirty = true;
    return w;
  }

  // ---------- 시점 ----------
  const W = (u, v, y) => { const [x, z] = plan.toWorld(u, v); return new THREE.Vector3(x, y, z); };
  const R0 = () => (plan ? Math.hypot(plan.SITE.u1 - plan.SITE.u0, plan.SITE.v1 - plan.SITE.v0) / 2 : 600);
  const dir = (x, y, z, d) => new THREE.Vector3(x, y, z).normalize().multiplyScalar(d);
  const VIEWS = {
    axon: { rel: true, cam: 'ortho', p: () => dir(-0.52, 0.52, 0.68, 4200), t: () => new THREE.Vector3(0, 40, 0), half: () => R0() * 1.05 + 160 },
    hero: { rel: true, cam: 'ortho', p: () => dir(-0.62, 0.5, 0.6, 4200), t: () => new THREE.Vector3(0, 0, 0), half: () => R0() * 0.86 + 90 },
    bird: { rel: true, cam: 'persp', p: () => dir(-0.45, 0.42, 0.79, R0() * 2.6 + 650), t: () => new THREE.Vector3(0, 30, 0) },
    wide: { rel: true, cam: 'persp', p: () => dir(-0.45, 0.48, 0.75, R0() * 4.5 + 2600), t: () => new THREE.Vector3(0, 0, 0) },
    top: { rel: true, cam: 'ortho', p: () => new THREE.Vector3(0, 6000, 1), t: () => new THREE.Vector3(0, 0, 0), half: () => R0() * 0.95 + 120 },
    river: { cam: 'persp', ok: () => !!(plan && plan.views.water), p: () => { const t = nearestWater(); return W(t[0], t[1], 28); }, t: () => W(0, 0, 120) },
    east: { cam: 'persp', p: () => W(plan.SITE.u1 + 650, 40, 160), t: () => W(0, 0, 90) },
    namsan: { cam: 'persp', ok: () => !!(plan && plan.views.peak), p: () => { const pt = plan.views.peak.pt; return W(pt[0], pt[1], pt[2]); }, t: () => W(0, 0, 60) },
    street: { cam: 'persp', p: () => W(plan.SITE.u0 + (plan.SITE.u1 - plan.SITE.u0) * 0.22, plan.SITE.v1 + Math.min(140, 40 + R0() * 0.2), 1.7), t: () => W(plan.SITE.u0 + (plan.SITE.u1 - plan.SITE.u0) * 0.5, 0, 45) },
  };
  function nearestWater() {
    const T = plan.views.water.targets; let best = T[0], bd = Infinity;
    T.forEach(t => { const d = Math.hypot(t[0], t[1]); if (d < bd) { bd = d; best = t; } });
    // 수면 쪽 기슭에서 사업지를 본다
    const k = Math.max(0, (bd - 60) / bd); return [best[0] * k, best[1] * k];
  }
  let orthoHalf = 760, viewKind = null;
  function useCamera(kind) { const next = kind === 'ortho' ? ortho : persp; if (next === camera) return; camera = next; controls.object = camera; }
  function setView(kind) {
    if (!plan) { viewKind = kind; return; }
    let V = VIEWS[kind] || VIEWS.bird;
    if (V.ok && !V.ok()) { kind = 'bird'; V = VIEWS.bird; }
    useCamera(V.cam);
    if (V.cam === 'ortho') { orthoHalf = V.half(); ortho.zoom = 1; }
    camera.position.copy(V.p()); controls.target.copy(V.t());
    // 대지가 택지 좌표에서 벗어나 있으면(지도에 맞춘 대지) 대지 중심을 본다
    if (V.rel && plan.off) { camera.position.x += plan.off[0]; camera.position.z += plan.off[1]; controls.target.x += plan.off[0]; controls.target.z += plan.off[1]; }
    camera.updateProjectionMatrix(); controls.update(); dirty = true;
    viewKind = kind;
    if (onView) onView(kind);
  }
  function focusBlock(id) {
    const b = plan && plan.blockById.get(id); if (!b) return;
    const cu = (b.lot.u0 + b.lot.u1) / 2, cv = (b.lot.v0 + b.lot.v1) / 2;
    const s = Math.max(b.lot.u1 - b.lot.u0, b.lot.v1 - b.lot.v0, 60);
    // 지금 보는 방향은 두고, 블록 크기에 맞춰 다가간다
    const d = camera.position.clone().sub(controls.target).normalize();
    if (d.y < 0.42) { d.y = 0.42; d.normalize(); }
    controls.target.copy(W(cu, cv, 8));
    if (camera === ortho) { camera.position.copy(controls.target).addScaledVector(d, 4200); ortho.zoom = Math.max(1.4, orthoHalf / (s * 0.62 + 30)); ortho.updateProjectionMatrix(); }
    else camera.position.copy(controls.target).addScaledVector(d, s * 1.35 + 90);
    controls.update(); dirty = true;
  }
  // 한 동에 바짝 다가가 부재를 본다
  function focusBuilding(bi) {
    const b = gen && gen.bldgs[bi]; if (!b) return;
    const h = Math.max(30, b.height);
    useCamera('persp');
    controls.target.copy(W(b.core.u, b.core.v, h * 0.55));
    camera.position.copy(W(b.core.u - h * 0.7 - 40, b.core.v + h * 0.95 + 60, h * 0.75 + 20));
    controls.update(); dirty = true;
  }

  // ---------- 라벨 ----------
  const labelBox = document.createElement('div'); labelBox.className = 'labels'; stage.appendChild(labelBox);
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'leaders'); labelBox.appendChild(svg);
  let labels = [];
  const addLabel = (text, pos, cls = 'place', dx = 0, dy = -34, keepIt = false) => {
    const el = document.createElement('span'); el.textContent = text; el.className = 'lb ' + cls; labelBox.appendChild(el);
    const line = document.createElementNS(SVGNS, 'path'); line.setAttribute('class', 'ld'); svg.appendChild(line);
    const dot = document.createElementNS(SVGNS, 'circle'); dot.setAttribute('r', '2.2'); dot.setAttribute('class', 'dt'); svg.appendChild(dot);
    const Lb = { el, line, dot, pos, cls, dx, dy, keep: keepIt }; labels.push(Lb); return Lb;
  };
  const lmLabel = addLabel('LANDMARK', new THREE.Vector3(), 'tag', 46, -60, true);
  const selLabel = addLabel('', new THREE.Vector3(), 'tag sel', -60, -70, true); selLabel.hidden = true;
  function buildLabels() {
    labels.filter(l => !l.keep).forEach(l => { l.el.remove(); l.line.remove(); l.dot.remove(); });
    labels = labels.filter(l => l.keep);
    if (!plan || !ctx3d) return;
    const seen = new Set();
    const list = ctx3d.labels.filter(l => { if (seen.has(l.text)) return false; seen.add(l.text); return true; });
    (hero ? list.filter(l => l.cls === 'water' || /산|타워/.test(l.text)).slice(0, 4) : list.slice(0, 22))
      .forEach(l => addLabel(l.text, new THREE.Vector3(l.x, l.y, l.z), l.cls, 0, l.cls === 'water' ? 0 : -30));
    if (!hero) plan.BLOCKS.forEach(b => addLabel(b.id, W((b.lot.u0 + b.lot.u1) / 2, (b.lot.v0 + b.lot.v1) / 2, 1), 'blk', 0, 0));
    if (!hero) (plan.publics || []).forEach(p => addLabel(p.kind === 'school' ? '학교' : '공원', W((p.rect.u0 + p.rect.u1) / 2, (p.rect.v0 + p.rect.v1) / 2, 2), 'blk pub', 0, 0));
  }
  function placeLandmarkLabel() {
    const lm = gen && (gen.bldgs.find(b => b.kind === 'landmark') || null);
    lmLabel.hidden = !lm;
    if (lm) { lmLabel.pos.copy(W(lm.core.u, lm.core.v, lm.height)); lmLabel.el.textContent = `LANDMARK · ${lm.storeys}F · ${Math.round(lm.height)}m`; }
  }
  const v3 = new THREE.Vector3();
  const hide = (Lb) => { Lb.el.style.display = 'none'; Lb.line.style.display = 'none'; Lb.dot.style.display = 'none'; };
  function updateLabels(w, h) {
    const topView = controls.getPolarAngle() < 0.75;
    labels.forEach(Lb => {
      if (Lb.hidden || (Lb.cls.startsWith('blk') && !topView) || (build && (Lb.cls === 'far' || Lb === lmLabel))) return hide(Lb);
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

  // 나침반 · 축척 · 지도 출처
  const compass = document.createElement('div'); compass.className = 'compass'; compass.setAttribute('aria-hidden', 'true');
  compass.innerHTML = `<svg viewBox="-22 -22 44 44"><circle r="17" class="cr"></circle><g><path d="M0 -15 L4 3 L0 0 L-4 3 Z" class="nd"></path><text y="-19" text-anchor="middle">N</text></g></svg>`;
  const compassG = compass.querySelector('g');
  let sceneBtn = null;
  if (dayToggle) {
    sceneBtn = document.createElement('button'); sceneBtn.type = 'button'; sceneBtn.className = 'scene-tgl'; sceneBtn.title = '3D 장면을 낮·밤으로 바꿉니다';
    sceneBtn.addEventListener('click', () => { dayScene = !dayScene; try { if (dayScene) localStorage.removeItem(NIGHT_KEY); else localStorage.setItem(NIGHT_KEY, '1'); } catch (e) { /* 무시 */ } applyTheme(); dirty = true; });
    stage.appendChild(sceneBtn);
  }
  const scaleBar = document.createElement('div'); scaleBar.className = 'scalebar'; scaleBar.setAttribute('aria-hidden', 'true');
  const attrib = document.createElement('a'); attrib.className = 'map-attrib'; attrib.href = 'https://www.openstreetmap.org/copyright'; attrib.target = '_blank'; attrib.rel = 'noopener'; attrib.textContent = OSM_ATTRIB; attrib.hidden = true;
  stage.appendChild(attrib);
  if (!hero) { stage.appendChild(compass); stage.appendChild(scaleBar); }

  // ---------- 선택 ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
  const selBox = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat); selBox.visible = false; selBox.renderOrder = 10; site.add(selBox);
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; if (hero) controls.autoRotate = false; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    if (!gen || hero) return;
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = bim.pick(ray);
    if (hit) { select(hit[0]); if (onPick) onPick(hit[0], hit[1]); }
    else { select(null); if (onPick) onPick(null); }
  });
  function hideSel() { if (selected == null) return; select(selected); }
  function select(bi) {
    selected = bi == null ? null : bi;
    bim.select(selected);
    if (selected == null || !gen) { selBox.visible = false; selLabel.hidden = true; dirty = true; return; }
    const b = gen.bldgs[selected], pos = [];
    b.parts.forEach(x => bim.boxEdges(pos, x.cu, x.cv, x.w + 3, x.d + 3, x.a, 0, b.height + 1.5, true));
    selBox.geometry.dispose(); selBox.geometry = new THREE.BufferGeometry(); selBox.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    selBox.visible = true;
    selLabel.hidden = false; selLabel.pos.copy(W(b.core.u, b.core.v, b.height));
    selLabel.el.textContent = `${b.id} · ${b.storeys}F · ${Math.round(b.height)}m`;
    dirty = true;
  }

  // ---------- 테마 ----------
  const sunDir = new THREE.Vector3(-0.4, 0.6, 0.5).normalize();
  let sunUp = true, skyT = 0;
  // 밝은 화면은 낮(해 + 하늘빛), 어두운 화면은 밤(푸른 달빛 + 창 불빛)
  function lightLevels() {
    if (P.dark) { sun.intensity = MOON_I; sun.color.set(0x9fb4d8); hemi.intensity = 0.55; }
    else { sun.intensity = sunUp ? SUN_I : 0; sun.color.set(0xfff4e6); hemi.intensity = sunUp ? 0 : 0.4; }
  }
  function scheduleSky() {
    clearTimeout(skyT);
    skyT = setTimeout(() => { look.applyTheme(P, sunDir, sunUp); dirty = true; }, 90);
  }
  function applyTheme() {
    P = palNow();
    const dayIn = dayScene && isDark();
    stage.classList.toggle('day', dayIn); if (stage.parentElement) stage.parentElement.classList.toggle('scene-day', dayIn);
    if (sceneBtn) { sceneBtn.hidden = !isDark(); sceneBtn.textContent = dayScene ? '☾ 밤 장면으로' : '☀ 낮 장면으로'; sceneBtn.setAttribute('aria-pressed', String(!dayScene)); }
    scene.background = null;
    look.applyTheme(P, sunDir, sunUp);
    lightLevels();
    FACADE_U.uGlass.value.copy(P.glass); FACADE_U.uGlassP.value.copy(P.pjGlass); FACADE_U.uFilm.value.copy(P.film); FACADE_U.uInterior.value.copy(P.interior);
    FACADE_U.uLit.value.copy(P.lit); FACADE_U.uFrame.value.copy(P.frame); FACADE_U.uNight.value = P.dark ? 1 : 0;
    hemi.color.set(P.dark ? 0x6f7f99 : 0xdfe9f2); hemi.groundColor.set(P.dark ? 0x1a1d22 : 0xcfcac2);
    lineMat.color.copy(P.accent);
    if (ctx3d) ctx3d.update(P);
    bim.update(P);
    paint(mode, agg);
  }

  // ---------- 그리기 ----------
  let dirty = true, alive = true;
  controls.addEventListener('change', () => { dirty = true; });
  const ro = new ResizeObserver(() => { dirty = true; }); ro.observe(stage);
  function draw() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
    look.setSize(w, h, pr);
    renderAt(w / h);
    updateLabels(w, h);
    compassG.setAttribute('transform', `rotate(${(controls.getAzimuthalAngle() * 180 / Math.PI).toFixed(1)})`);
    if (camera === ortho) {
      const mpp = (2 * orthoHalf / ortho.zoom) / h;
      const nice = [10, 25, 50, 100, 200, 250, 500, 1000, 2000].find(x => x / mpp >= 60) || 2000;
      scaleBar.style.display = ''; scaleBar.innerHTML = `<i style="width:${(nice / mpp).toFixed(0)}px"></i><span>${nice >= 1000 ? nice / 1000 + ' km' : nice + ' m'}</span>`;
    } else scaleBar.style.display = 'none';
  }
  function renderAt(asp) {
    const dist = camera.position.distanceTo(controls.target);
    persp.near = Math.max(0.5, Math.min(25, dist / 250)); persp.aspect = asp; persp.updateProjectionMatrix();
    ortho.left = -orthoHalf * asp; ortho.right = orthoHalf * asp; ortho.top = orthoHalf; ortho.bottom = -orthoHalf; ortho.updateProjectionMatrix();
    tickWater(); look.render(camera);
    if (stale.length) { stale.forEach(o => o.dispose()); stale.length = 0; }
  }
  function frame() {
    if (!alive) return;
    const moved = controls.update();
    if (dirty || moved || controls.autoRotate) { dirty = false; draw(); }
    requestAnimationFrame(frame);
  }
  // 다른 시점·공정 상태를 그림 한 장으로 (화면의 시점과 상태는 그대로 돌려놓는다)
  function capture(kind, { w = 720, h = 540, build = null, type = 'image/jpeg', q = 0.86 } = {}) {
    if (!plan) return null;
    const keep = { cam: camera, p: camera.position.clone(), t: controls.target.clone(), z: ortho.zoom, half: orthoHalf, view: viewKind, st: bim.state, ar: controls.autoRotate };
    const fire = onView; onView = null;
    try {
      if (build) bim.setState({ ...keep.st, ...build });
      const bk = typeof kind === 'string' && kind.startsWith('blk:') ? plan.blockById.get(kind.slice(4)) : null;
      if (bk) {
        // 블록 하나를 가까이 (공사 장면용)
        const cu = (bk.lot.u0 + bk.lot.u1) / 2, cv = (bk.lot.v0 + bk.lot.v1) / 2, s = Math.max(bk.lot.u1 - bk.lot.u0, bk.lot.v1 - bk.lot.v0, 60);
        useCamera('persp');
        controls.target.copy(W(cu, cv, 10));
        camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(-0.5, 0.58, 0.64).normalize(), s * 1.25 + 70);
        camera.updateProjectionMatrix(); controls.update();
      } else if (kind && typeof kind === 'object') {
        // 한 지점(대지 좌표 u, v, 높이 y)을 거리 d에서
        useCamera('persp');
        controls.target.copy(W(kind.u, kind.v, kind.y));
        camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(...(kind.dir || [-0.55, 0.42, 0.72])).normalize(), kind.d);
        camera.updateProjectionMatrix(); controls.update();
      } else setView(kind);
      const pr = renderer.getPixelRatio();
      renderer.setPixelRatio(1); renderer.setSize(w, h, false); look.setSize(w, h, 1);
      renderAt(w / h);
      const url = canvas.toDataURL(type, q);
      renderer.setPixelRatio(pr);
      return url;
    } catch (e) { return null; }
    finally {
      onView = fire;
      if (build) bim.setState(keep.st);
      useCamera(keep.cam === ortho ? 'ortho' : 'persp');
      orthoHalf = keep.half; ortho.zoom = keep.z; camera.position.copy(keep.p); controls.target.copy(keep.t); viewKind = keep.view;
      camera.updateProjectionMatrix(); controls.update();
      draw(); dirty = true;
    }
  }
  applyTheme();
  viewKind = hero ? (window.innerWidth > 900 ? 'hero' : 'axon') : 'axon';
  if (hero) controls.autoRotate = true;
  requestAnimationFrame(frame);

  function dispose() {
    alive = false; ro.disconnect(); controls.dispose(); clearTimeout(skyT);
    look.dispose();
    if (ctx3d) ctx3d.dispose();
    stale.forEach(o => o.dispose()); stale.length = 0;
    bim.dispose();
    renderer.dispose(); renderer.forceContextLoss();
    labelBox.remove(); compass.remove(); scaleBar.remove(); attrib.remove(); canvas.remove(); if (sceneBtn) sceneBtn.remove();
    stage.classList.remove('day'); if (stage.parentElement) stage.parentElement.classList.remove('scene-day');
  }
  return {
    setPlan, setContext, setModel, paint, setSun, setView, focusBlock, focusBuilding, select, applyTheme, setProgress, setBuild, setXray, dispose,
    setAutoRotate: (v) => { controls.autoRotate = !!v; dirty = true; },
    snapshot: () => canvas.toDataURL('image/png'), capture,
    get view() { return viewKind; }, get context() { return ctx; }, get plan() { return plan; },
    get stats() { return ctx3d ? ctx3d.stats : null; },
    viewOk: (k) => !VIEWS[k] || !VIEWS[k].ok || VIEWS[k].ok(),
    redraw: () => { dirty = true; },
    get sun() { return lastSun; },
  };
}
