// 사업지 BIM 3D (대지 좌표: u 장축, v 남쪽, y 위). 사이트 그룹 안에서 쓴다.
// 층·부분마다 공정 상태(0 미착공 · 1 거푸집·철근 · 2 골조 · 3 설비 · 4 창호·커튼월 · 5 내부 마감 · 6 준공)에 맞춰 부재를 보인다.
//  - 골조: 슬래브, 기둥(업무·오피스텔·포디움) 또는 벽식 내력벽(아파트), 코어(초고층·업무동은 코어 선행)
//  - 거푸집: 갱폼(주황)과 데크 합판, 설비: 덕트·스프링클러·급수관·케이블 트레이와 입상관
//  - 외피: 층·창 무늬 셰이더(커튼월·발코니 통창·창·쇼윈도·루버), 발코니 슬래브와 유리 난간, 파라펫, 옥상 설비
//  - 블록: 가설 울타리·현장 사무실, 흙막이(CIP 두부 정리 보)와 천공기, 굴토(지면에 구멍) + 버팀보·띠장 + 굴착기,
//          기초 매트, 지하층 슬래브·기둥, 조경 수목, 타워크레인(격자 마스트·지브·카운터웨이트)과 외부 승강기
import * as THREE from 'three';
import { facadeMaterial, PAT, surf } from './facade.js';
import { Buf, strip, frames, quad, dashMaterial, treeGeometry, repaintTree } from './context3d.js';

const unitBox = () => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; };
// 옆면만 있는 상자 (갱폼·울타리 같은 얇은 껍질)
function sidesBox() {
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  const idx = g.index.array, keep = [];
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z (각 6개 인덱스)
  for (let f = 0; f < 6; f++) if (f !== 2 && f !== 3) for (let k = 0; k < 6; k++) keep.push(idx[f * 6 + k]);
  g.setIndex(keep);
  return g;
}
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const USE_PAT = { res: PAT.res, officetel: PAT.punched, office: PAT.curtain, retail: PAT.store, lobby: PAT.store, refuge: PAT.louvre, mech: PAT.louvre };
const KIND_WALL = { apt: 'wRes', officetel: 'wCom', office: 'wTower', landmark: 'wTower', podium: 'wCom' };

export function createBim(site, P0, { lite = false } = {}) {
  let P = P0;
  const root = new THREE.Group(); root.name = 'bim'; site.add(root);
  const base = new THREE.Group(); base.name = 'site-base'; site.add(base);
  const box = unitBox(), sbox = sidesBox();
  const pitGeo = new THREE.BoxGeometry(1, 1, 1); pitGeo.translate(0, -0.5, 0);
  const treeG = treeGeometry(P);

  // ---------- 재질 ----------
  const STENCIL_TEST = { stencilWrite: true, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: 1, stencilWriteMask: 0, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };
  const M = {
    env: facadeMaterial({ color: 0xffffff }, { instanced: true }),
    envX: facadeMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }, { instanced: true }),
    solid: surf({ color: 0xffffff }, 0.78),
    form: surf({ color: 0xffffff, transparent: true, opacity: 0.92, side: THREE.DoubleSide }, 0.62),
    glass: surf({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }, 0.08, 0.3),
    pit: surf({ vertexColors: true, side: THREE.BackSide }, 1),
    mask: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp }),
    lot: surf({ color: 0xffffff, ...STENCIL_TEST, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, 0.95),
    tree: surf({ vertexColors: true, flatShading: true }, 0.95),
    crane: new THREE.LineBasicMaterial({ color: 0xffffff }),
    ghost: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }),
    edge: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 }),
    walk: surf({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, 0.95),
    asph: surf({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -5 }, 0.88),
    mark: dashMaterial({ polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -9 }),
    green: surf({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 }, 1),
    site: new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 14, gapSize: 9, transparent: true, opacity: 0.95 }),
  };

  // ---------- 늘어나는 인스턴스 메시 ----------
  const pools = {};
  function pool(key, geo, mat, { shadow = true, receive = true, order = 0, parent = root } = {}) {
    pools[key] = { geo, mat, mesh: null, cap: 0, shadow, receive, order, parent };
  }
  pool('env', box, M.env);
  pool('solid', box, M.solid);
  pool('form', sbox, M.form, { shadow: true });
  pool('glass', box, M.glass, { shadow: false, receive: false });
  pool('pit', pitGeo, M.pit, { shadow: false });
  pool('mask', box, M.mask, { shadow: false, receive: false, order: -10 });
  pool('lot', box, M.lot, { shadow: false, parent: base });
  pool('tree', treeG, M.tree);
  function ensure(key, n) {
    const p = pools[key];
    if (p.mesh && p.cap >= n) { p.mesh.count = n; p.mesh.visible = n > 0; return p.mesh; }
    if (p.mesh) { p.parent.remove(p.mesh); p.mesh.dispose(); if (p.mesh.geometry !== p.geo) p.mesh.geometry.dispose(); }
    p.cap = Math.max(16, Math.ceil(n * 1.3));
    const m = new THREE.InstancedMesh(p.geo, p.mat, p.cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = p.shadow; m.receiveShadow = p.receive; m.renderOrder = p.order; m.frustumCulled = false;
    m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor.array.fill(1); // 색을 안 쓰는 풀(흙막이 등)이 검게 나오지 않게
    if (key === 'env') { m.geometry = p.geo.clone(); m.geometry.setAttribute('iFac', new THREE.InstancedBufferAttribute(new Float32Array(p.cap * 4), 4)); m.geometry.attributes.iFac.setUsage(THREE.DynamicDrawUsage); }
    m.count = n; m.visible = n > 0;
    p.mesh = m; p.parent.add(m);
    return m;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qp = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const Yax = new THREE.Vector3(0, 1, 0), Xax = new THREE.Vector3(1, 0, 0);
  // 상자: 중심 (u, v), 바닥 y, 크기 (w 로컬x, h, d 로컬z), 회전 a(u→v), pitch(로컬 x축 기울기)
  function setBox(mesh, i, u, y, v, w, h, d, a = 0, pitch = 0) {
    q.setFromAxisAngle(Yax, -a); if (pitch) { qp.setFromAxisAngle(Xax, pitch); q.multiply(qp); }
    sc.set(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3)); ps.set(u, y, v); m4.compose(ps, q, sc); mesh.setMatrixAt(i, m4);
  }
  const loc = (cu, cv, a, lx, lz) => { const c = Math.cos(a), s = Math.sin(a); return [cu + lx * c - lz * s, cv + lx * s + lz * c]; };

  // ---------- 모델 ----------
  let gen = null, plan = null, bState = null;
  let ghost = null, edgeLines = null, craneLines = null;
  const lineGeo = (pos) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g; };
  function floorBoxes(b, f) {
    const s = f.s || 1;
    if (f.roof) { const e = Math.sqrt(Math.max(1, f.area)); return [{ cu: b.core.u, cv: b.core.v, w: e, d: e, a: b.parts[0].a || 0, roof: true, faces: null }]; }
    return b.parts.map(q2 => ({ cu: q2.cu, cv: q2.cv, w: q2.w * s, d: q2.d * s, a: q2.a || 0, faces: q2.faces }));
  }
  const faceMask = (b, x) => {
    if (!x.faces) return 15;
    let m = 0; const bit = { S: 1, N: 2, E: 4, W: 8 };
    for (const k of ['S', 'N', 'E', 'W']) { const f = x.faces[k]; if (f === 'win' || (b.kind !== 'apt' && f && f !== 'none')) m |= bit[k]; }
    return m;
  };
  function coreDims(b) {
    const p0 = b.parts[0];
    if (b.kind === 'apt') return [6.5, 8.5];
    if (b.kind === 'officetel') return [Math.min(12, p0.w * 0.4), Math.min(9, p0.d * 0.45)];
    if (b.kind === 'podium') return [0, 0];
    return [Math.max(10, p0.w * 0.38), Math.max(10, p0.d * 0.4)];
  }
  // 조경 수목 자리: 대지 격자 중 건물 밖
  let lotTrees = new Map();
  function prepTrees() {
    lotTrees = new Map();
    plan.BLOCKS.forEach((bl, k) => {
      const parts = gen.bldgs.filter(b => b.block === bl.id && b.kind !== 'basement').flatMap(b => b.parts);
      const L = bl.lot, out = [], step = lite ? 13 : 9.5;
      for (let u = L.u0 + 4; u < L.u1 - 3; u += step) for (let v = L.v0 + 4; v < L.v1 - 3; v += step) {
        const ju = u + (hash(u * 3.1 + v + k) - 0.5) * step * 0.7, jv = v + (hash(v * 1.7 - u + k) - 0.5) * step * 0.7;
        if (parts.some(pp => { const c = Math.cos(pp.a || 0), s = Math.sin(pp.a || 0), du = ju - pp.cu, dv = jv - pp.cv; return Math.abs(du * c + dv * s) < pp.w / 2 + 4 && Math.abs(-du * s + dv * c) < pp.d / 2 + 4; })) continue;
        out.push([ju, jv, 6 + hash(ju + jv) * 5]);
      }
      // 앞쪽(남쪽) 나무부터 심는 순서
      out.sort((a, b) => b[1] - a[1]);
      lotTrees.set(bl.id, out.slice(0, 420));
    });
  }

  function setModel(g, pl) {
    gen = g; plan = pl || g.plan;
    prepTrees();
    buildBase();
    // 계획 윤곽(유령선): 공정 화면에서 아직 안 지은 부분을 옅게
    const pos = [];
    gen.bldgs.forEach(b => {
      if (b.kind === 'basement') return;
      b.parts.forEach(x => { const H = b.height; boxEdges(pos, x.cu, x.cv, x.w, x.d, x.a || 0, 0, H, false); });
    });
    if (ghost) { root.remove(ghost); ghost.geometry.dispose(); }
    ghost = new THREE.LineSegments(lineGeo(pos), M.ghost); ghost.visible = false; root.add(ghost);
    setState(state);
  }
  function corners(cu, cv, w, d, a) {
    const c = Math.cos(a || 0), s = Math.sin(a || 0), hw = w / 2, hd = d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [cu + x * c - y * s, cv + x * s + y * c]);
  }
  function boxEdges(pos, cu, cv, w, d, a, y0, y1, bottom = true) {
    const k = corners(cu, cv, w, d, a);
    for (let i = 0; i < 4; i++) {
      const p = k[i], r = k[(i + 1) % 4];
      pos.push(p[0], y1, p[1], r[0], y1, r[1]);
      if (bottom) pos.push(p[0], y0, p[1], r[0], y0, r[1]);
      pos.push(p[0], y0, p[1], p[0], y1, p[1]);
    }
  }

  // ---------- 대지 바닥: 획지·단지 내 도로·공원·학교·대지 경계 ----------
  let baseObjs = [];
  function buildBase() {
    baseObjs.forEach(o => { base.remove(o); if (o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    baseObjs = [];
    const add = (o) => { base.add(o); baseObjs.push(o); return o; };
    const BW = new Buf(), BA = new Buf(), BM = new Buf(), BG = new Buf();
    const yW = () => 0.14, yA = () => 0.22, yM = () => 0.28;
    // 단지 내 도로: 직사각형(대지 좌표) → 중심선 띠
    const roadRects = [...(plan.roads || []), ...(plan.BANDS || []).filter(b => b.kind === 'road')];
    roadRects.forEach(r => {
      const horiz = (r.u1 - r.u0) >= (r.v1 - r.v0);
      const w = horiz ? r.v1 - r.v0 : r.u1 - r.u0;
      const pts = horiz ? [[r.u0, (r.v0 + r.v1) / 2], [r.u1, (r.v0 + r.v1) / 2]] : [[(r.u0 + r.u1) / 2, r.v0], [(r.u0 + r.u1) / 2, r.v1]];
      const F = frames(pts), sw = Math.min(4, w * 0.18), cw = w - 2 * sw;
      strip(BW, pts, F, -w / 2, w / 2, yW, P.walk);
      strip(BA, pts, F, -cw / 2, cw / 2, yA, P.asphalt);
      const lanes = Math.max(2, Math.round(cw / 3.3));
      strip(BM, pts, F, -0.08, 0.08, yM, P.markY, [0, 1]);
      if (lanes >= 4) [-1, 1].forEach(sd => strip(BM, pts, F, sd * cw / 4 - 0.07, sd * cw / 4 + 0.07, yM, P.mark, [8, 0.375]));
      // 양 끝 횡단보도
      const L = horiz ? r.u1 - r.u0 : r.v1 - r.v0;
      [3, L - 7].forEach(t => {
        const P4 = horiz ? [[r.u0 + t, (r.v0 + r.v1) / 2 - cw / 2], [r.u0 + t + 4, (r.v0 + r.v1) / 2 - cw / 2], [r.u0 + t + 4, (r.v0 + r.v1) / 2 + cw / 2], [r.u0 + t, (r.v0 + r.v1) / 2 + cw / 2]]
          : [[(r.u0 + r.u1) / 2 - cw / 2, r.v0 + t], [(r.u0 + r.u1) / 2 + cw / 2, r.v0 + t], [(r.u0 + r.u1) / 2 + cw / 2, r.v0 + t + 4], [(r.u0 + r.u1) / 2 - cw / 2, r.v0 + t + 4]];
        const sArr = horiz ? [-cw / 2, -cw / 2, cw / 2, cw / 2] : [-cw / 2, cw / 2, cw / 2, -cw / 2];
        quad(BM, P4, 0.3, P.mark, sArr, [0.9, 0.5]);
      });
    });
    // 녹지: 선형 공원·공원·학교 운동장
    const greenRect = (r, c) => quad(BG, [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]], 0.12, c);
    const parkTrees = [];
    const fillTrees = (r, step, seed) => { for (let u = r.u0 + 5; u < r.u1 - 4; u += step) for (let v = r.v0 + 5; v < r.v1 - 4; v += step) { const ju = u + (hash(u + seed) - 0.5) * step * 0.8, jv = v + (hash(v - seed) - 0.5) * step * 0.8; parkTrees.push([ju, jv, 6 + hash(ju * jv) * 6]); } };
    (plan.BANDS || []).filter(b => b.kind === 'park').forEach((b, i) => { greenRect(b, P.park); fillTrees(b, lite ? 16 : 11, i); });
    (plan.BANDS || []).filter(b => b.kind === 'rail').forEach(b => greenRect(b, P.ballast));
    const pubB = [];
    (plan.publics || []).forEach((p2, i) => {
      const r = p2.rect;
      if (p2.kind === 'park') { greenRect(r, P.park); fillTrees(r, lite ? 15 : 10, i + 7); return; }
      // 학교: 운동장(트랙) + ㄱ자 4층 교사
      greenRect(r, P.site);
      const fu0 = r.u0 + (r.u1 - r.u0) * 0.42, fr = { u0: fu0, u1: r.u1 - 8, v0: r.v0 + 8, v1: r.v1 - 8 };
      greenRect(fr, P.sand); greenRect({ u0: fr.u0 + 9, u1: fr.u1 - 9, v0: fr.v0 + 9, v1: fr.v1 - 9 }, P.pitch);
      const bw = (r.u1 - r.u0) * 0.32;
      pubB.push([r.u0 + 8 + bw / 2, (r.v0 + r.v1) / 2 - (r.v1 - r.v0) * 0.28, bw, 15, 4], [r.u0 + 8 + 7.5, (r.v0 + r.v1) / 2 + 6, 15, (r.v1 - r.v0) * 0.45, 4]);
      fillTrees({ u0: r.u0, u1: fu0 - 4, v0: r.v1 - 18, v1: r.v1 }, 9, i + 3);
    });
    if (BW.n) add(new THREE.Mesh(BW.geo(), M.walk)).receiveShadow = true;
    if (BA.n) add(new THREE.Mesh(BA.geo(), M.asph)).receiveShadow = true;
    if (BM.n) add(new THREE.Mesh(BM.geo({ aDash: 3 }), M.mark)).receiveShadow = true;
    if (BG.n) add(new THREE.Mesh(BG.geo(), M.green)).receiveShadow = true;
    // 레일 (용산 철도 띠)
    const rl = [];
    (plan.BANDS || []).filter(b => b.kind === 'rail').forEach(b => { for (let k = 0; k < 8; k++) { const v = b.v0 + 8 + k * (b.v1 - b.v0 - 16) / 7; [-0.72, 0.72].forEach(o => rl.push(b.u0, 0.4, v + o, b.u1, 0.4, v + o)); } });
    if (rl.length) add(new THREE.LineSegments(lineGeo(rl), new THREE.LineBasicMaterial({ color: P.rail })));
    if (parkTrees.length) {
      const tm = new THREE.InstancedMesh(treeG, M.tree, parkTrees.length);
      parkTrees.forEach(([u, v, h], i) => { setBox(tm, i, u, 0.12, v, h, h, h, u); tm.setColorAt(i, new THREE.Color().setScalar(0.9 + hash(u) * 0.18)); });
      tm.castShadow = true; tm.receiveShadow = true; add(tm);
    }
    if (pubB.length) {
      const pm = new THREE.InstancedMesh(box, M.env, pubB.length);
      const iF = new Float32Array(pubB.length * 4);
      pm.geometry = box.clone(); pm.geometry.setAttribute('iFac', new THREE.InstancedBufferAttribute(iF, 4));
      pubB.forEach(([u, v, w, d, fl], i) => { setBox(pm, i, u, 0, v, w, fl * 3.8, d, 0); pm.setColorAt(i, P.wCivic); iF.set([PAT.punched, 6, 15, hash(i)], i * 4); });
      pm.castShadow = true; pm.receiveShadow = true; add(pm);
    }
    // 대지 경계 점선
    const S = plan.SITE, ring = [[S.u0, S.v0], [S.u1, S.v0], [S.u1, S.v1], [S.u0, S.v1]].map(([u, v]) => new THREE.Vector3(u, 0.9, v));
    const sl = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring), M.site); sl.computeLineDistances(); add(sl);
  }

  // ---------- 상태 그리기 ----------
  let state = { floor: null, block: null, cranes: null, xray: false, focus: null };
  let envItems = [], solidIdx = [];
  const C = new THREE.Color();
  function setState(st = {}) {
    state = { floor: null, block: null, cranes: null, xray: false, focus: null, ...st };
    if (!gen) return;
    const prog = !!state.floor;
    const fs = state.floor || (() => 6);
    const env = [], solid = [], form = [], glass = [], pit = [], mask = [], lots = [], trees = [];
    const sIdx = [];
    const xray = state.xray;
    // 고체 부재 하나: [u, y, v, w, h, d, a, color, pitch]
    const S = (u, y, v, w, h, d, a, c, pick = null, pitch = 0) => { solid.push([u, y, v, w, h, d, a, c, pitch]); sIdx.push(pick); };
    const tint = (c, on) => (state.focus && !on && !xray ? c.clone().lerp(P.ground, 0.55) : c);
    const F = state.focus;
    gen.bldgs.forEach((b, bi) => {
      if (b.kind === 'basement') return;
      const fl = b.floors;
      const stOf = fl.map((f, fi) => (f.lv > 0 ? fs(bi, fi) : 0));
      const seed = hash(bi + 1);
      let topStruct = -1, topAny = -1, topMep = -1;
      fl.forEach((f, fi) => { const s2 = stOf[fi]; if (s2 >= 2) topStruct = fi; if (s2 >= 1) topAny = fi; if (s2 >= 3) topMep = fi; });
      if (topAny < 0) return;
      const p0 = b.parts[0], a0 = p0.a || 0;
      const [cw, cd] = coreDims(b);
      const coreAhead = (b.kind === 'landmark' || b.kind === 'office') && prog && stOf.some(s2 => s2 === 1) ? 3 : 0;
      const coreTopFi = Math.min(fl.length - 1, topAny + coreAhead);
      const coreTop = fl[coreTopFi].roof ? fl[coreTopFi].y0 : fl[coreTopFi].y1;
      if (cw > 0 && (prog || xray)) S(b.core.u, 0, b.core.v, cw, coreTop, cd, a0, tint(P.concrete, F === 'struct'));
      if (coreAhead && cw > 0) form.push([b.core.u, Math.max(0, coreTop - fl[coreTopFi].h - 0.5), b.core.v, cw + 0.8, fl[coreTopFi].h + 1.4, cd + 0.8, a0, P.form]);
      // 입상관(설비 샤프트)
      if (topMep >= 0 && (prog || xray)) {
        const yT = fl[topMep].y1, [ru, rv] = loc(b.core.u, b.core.v, a0, cw / 2 + 0.8, 0);
        S(ru, 0, rv, 0.35, yT, 0.35, a0, tint(P.pipeR, F === 'mep')); const [r2u, r2v] = loc(b.core.u, b.core.v, a0, cw / 2 + 1.4, 0.6);
        S(r2u, 0, r2v, 0.35, yT, 0.35, a0, tint(P.pipeB, F === 'mep')); const [r3u, r3v] = loc(b.core.u, b.core.v, a0, cw / 2 + 1.1, -1.2);
        S(r3u, 0, r3v, 1.2, yT, 0.8, a0, tint(P.duct, F === 'mep'));
      }
      fl.forEach((f, fi) => {
        const s2 = stOf[fi]; if (s2 <= 0 || f.lv <= 0) return;
        const boxes = floorBoxes(b, f);
        const showEnv = s2 >= 4;
        const open = !showEnv || xray;
        boxes.forEach((x, pi) => {
          const a = x.a;
          if (showEnv) env.push({ bi, fi, pi, x, f, s2, pat: f.roof ? PAT.louvre : (USE_PAT[f.use] ?? PAT.punched), mask: faceMask(b, x), seed });
          if (x.roof) { if (open && s2 >= 2) S(x.cu, f.y0, x.cv, x.w, f.h, x.d, a, P.concrete, [bi, fi]); return; }
          const slabT = 0.32;
          // 거푸집·철근 단계: 데크 합판 + 갱폼
          if (s2 === 1) {
            S(x.cu, f.y1 - slabT, x.cv, x.w, 0.08, x.d, a, tint(P.ply, F === 'struct'), [bi, fi]);
            form.push([x.cu, f.y0 - 0.6, x.cv, x.w + 0.9, f.h + 1.6, x.d + 0.9, a, tint(P.form, F === 'struct')]);
          }
          if (s2 >= 2 && open && (prog || xray)) S(x.cu, f.y1 - slabT, x.cv, x.w, slabT, x.d, a, tint(P.concrete, F === 'struct'), [bi, fi]);
          // 기둥 / 벽식 내력벽
          const vis = s2 === 1 ? true : (s2 >= 2 && open && (prog || xray));
          if (vis) {
            const h = f.h - slabT, colC = s2 === 1 ? tint(P.steel, F === 'struct') : tint(P.concrete, F === 'struct');
            if (b.kind === 'apt') {
              const n = Math.max(1, Math.round(x.w / 8.2));
              for (let k = 0; k <= n; k++) { const lx = -x.w / 2 + x.w * k / n; const [u, v] = loc(x.cu, x.cv, a, Math.max(-x.w / 2 + 0.1, Math.min(x.w / 2 - 0.1, lx)), 0); S(u, f.y0, v, 0.22, h, x.d - 0.4, a, colC); }
              const [u2, v2] = loc(x.cu, x.cv, a, 0, -x.d * 0.12); S(u2, f.y0, v2, x.w - 0.4, h, 0.2, a, colC);
            } else {
              const sp = b.kind === 'landmark' ? 9 : 8.4, cs = b.kind === 'landmark' ? 1.3 : b.kind === 'office' ? 1.0 : 0.8;
              const nx = Math.max(1, Math.round(x.w / sp)), nz = Math.max(1, Math.round(x.d / sp));
              for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
                const lx = -x.w / 2 + cs / 2 + (x.w - cs) * i / nx, lz = -x.d / 2 + cs / 2 + (x.d - cs) * j / nz;
                const inner = i > 0 && i < nx && j > 0 && j < nz;
                if (inner && Math.abs(lx) < cw / 2 + 2 && Math.abs(lz) < cd / 2 + 2) continue;
                const [u, v] = loc(x.cu, x.cv, a, lx, lz); S(u, f.y0, v, cs, h, cs, a, colC);
              }
            }
          }
          // 설비 배관·덕트
          if ((s2 === 3 && open) || (xray && s2 >= 3 && s2 <= 5)) {
            const yc = f.y1 - slabT, on = F === 'mep';
            const run = (lz, y, ww, hh, c) => { const [u, v] = loc(x.cu, x.cv, a, 0, lz); S(u, y - hh, v, x.w * 0.86, hh, ww, a, tint(c, on)); };
            run(-x.d * 0.16, yc - 0.15, 0.9, 0.55, P.duct);
            run(x.d * 0.2, yc - 0.12, 0.16, 0.16, P.pipeR);
            run(x.d * 0.27, yc - 0.35, 0.14, 0.14, P.pipeB);
            run(-x.d * 0.33, yc - 0.2, 0.5, 0.1, P.tray);
            const nb = Math.max(1, Math.floor(x.w / 7.5));
            for (let k = 0; k < nb; k++) { const lx = -x.w * 0.4 + x.w * 0.8 * (k + 0.5) / nb; const [u, v] = loc(x.cu, x.cv, a, lx, -x.d * 0.16 + x.d * 0.2); S(u, yc - 0.6, v, 0.45, 0.35, x.d * 0.4, a, tint(P.duct, on)); }
          }
          // 발코니 (아파트 주거층, 남측 창면)
          if (showEnv && b.kind === 'apt' && f.use === 'res' && x.faces && x.faces.S === 'win') {
            const [u, v] = loc(x.cu, x.cv, a, 0, x.d / 2 + 0.7);
            S(u, f.y0 - 0.05, v, x.w * 0.94, 0.2, 1.4, a, P.wRes, [bi, fi]);
            const [gu, gv] = loc(x.cu, x.cv, a, 0, x.d / 2 + 1.36);
            glass.push([gu, f.y0 + 0.15, gv, x.w * 0.94, 1.05, 0.05, a]);
          }
          // 파라펫: 그 부분의 맨 위층
          const nx2 = fl[fi + 1];
          if (showEnv && (!nx2 || nx2.roof || (nx2.s || 1) !== (f.s || 1))) {
            const t = 0.25, hh = 1.2, wc = P[KIND_WALL[b.kind] || 'wCom'];
            [[0, -x.d / 2 + t / 2, x.w, t], [0, x.d / 2 - t / 2, x.w, t], [-x.w / 2 + t / 2, 0, t, x.d], [x.w / 2 - t / 2, 0, t, x.d]].forEach(([lx, lz, ww, dd]) => { const [u, v] = loc(x.cu, x.cv, a, lx, lz); S(u, f.y1, v, ww, hh, dd, a, wc); });
            // 옥상 설비 (준공 후)
            if (s2 >= 6 && b.kind !== 'apt' && pi === 0) {
              [[-0.3, -0.25], [0.3, -0.25], [0.3, 0.25]].forEach(([fx, fz], k) => { if (k === 2 && x.w < 30) return; const [u, v] = loc(x.cu, x.cv, a, fx * x.w, fz * x.d); S(u, f.y1, v, 4.2, 3.2, 4.2, a, P.duct); });
            }
          }
        });
      });
    });
    // ---------- 블록: 가설·흙막이·굴토·기초·지하 골조·조경 ----------
    const BS = state.block;
    plan.BLOCKS.forEach(bl => {
      const bs = BS ? BS.get(bl.id) : null;
      const L = bl.lot;
      const started = bs ? bs.started : true, done = bs ? bs.done : true;
      lots.push([L, done ? P.lot : started ? P.soil.clone().lerp(P.lot, 0.45) : P.site]);
      const landF = bs ? bs.land : 1;
      const tl = lotTrees.get(bl.id) || [];
      const nT = Math.round(tl.length * landF);
      for (let k = 0; k < nT; k++) trees.push(tl[k]);
      if (!bs) return;
      const bb = gen.bldgs.find(x => x.block === bl.id && x.kind === 'basement');
      // 가설 울타리 + 현장 사무실
      if (bs.fence) {
        const t = 0.15, h = 2.6, cx = (L.u0 + L.u1) / 2, cz = (L.v0 + L.v1) / 2, W = L.u1 - L.u0, D = L.v1 - L.v0;
        [[cx, L.v0, W, t], [cx, L.v1, W, t], [L.u0, cz, t, D], [L.u1, cz, t, D]].forEach(([u, v, w, d]) => { S(u, 0, v, w, h, d, 0, P.fence); S(u, h - 0.45, v, w + 0.02, 0.45, d + 0.02, 0, P.fenceBand); });
        if (!done) {
          const u0 = L.u0 + 9, v0 = L.v0 + 5;
          [[0, 0], [6.4, 0], [3.2, 2.7]].forEach(([du, lv], k) => S(u0 + du + 3, lv, v0 + 1.25, 6, 2.6, 2.45, 0, k === 2 ? P.container.clone().multiplyScalar(0.93) : P.container));
        }
      }
      if (!bb) return;
      const R = bb.rect, cu = (R.u0 + R.u1) / 2, cv = (R.v0 + R.v1) / 2, W = R.u1 - R.u0, D = R.v1 - R.v0;
      const hs = bb.floors.map(f => f.h), depth = hs.reduce((s2, h) => s2 + h, 0), mat = 1.6, Dp = depth + mat;
      const nB = hs.length;
      // 아래에서부터 각 지하층의 바닥·천장 높이
      const levels = []; { let y = -depth; for (let k = nB - 1; k >= 0; k--) { levels.push([y, y + hs[k]]); y += hs[k]; } }
      const built = Math.min(bs.baseDone, nB);
      const closed = built >= nB;
      const builtTop = built ? levels[built - 1][1] : -depth;
      // 흙막이 두부 정리 보 + 천공기
      if (bs.wall > 0 && !closed) {
        const per = 2 * (W + D); let left = bs.wall * per;
        const edgesR = [[R.u0, R.v0, 1, 0, W], [R.u1, R.v0, 0, 1, D], [R.u1, R.v1, -1, 0, W], [R.u0, R.v1, 0, -1, D]];
        let rig = null;
        for (const [u, v, du, dv, len] of edgesR) {
          if (left <= 0) break;
          const l = Math.min(len, left); left -= l;
          S(u + du * l / 2, -0.5, v + dv * l / 2, du ? l : 1.0, 1.4, dv ? l : 1.0, 0, P.concrete);
          rig = [u + du * l, v + dv * l];
        }
        if (bs.wall < 1 && rig) { S(rig[0] + 3, 0, rig[1] + 3, 4.5, 2.4, 3, 0, P.steel); S(rig[0] + 2, 2.4, rig[1] + 3, 1.1, 24, 1.1, 0, P.crane); }
      }
      if (closed) {
        // 지하 완료: 지하층 기둥·슬래브는 땅 밑에 둔다(투시 모드에서만)
        if (xray) levels.forEach(([y0, y1]) => S(cu, y1 - 0.4, cv, W, 0.4, D, 0, P.concrete));
        return;
      }
      const dig = bs.earth * Dp;
      if (dig > 0.2) {
        mask.push([cu, 0.02, cv, W, 0.3, D]);
        pit.push([cu, 0.3, cv, W, dig + 0.3, D]);
        // 버팀보·띠장: 아직 지하 구조가 올라오지 않은 높이에만
        const step = 3.6;
        for (let yl = -2.4; yl > -Dp + 2.2; yl -= step) {
          if (dig < -yl + 0.8 || yl < builtTop + 0.5) continue;
          const alongU = W >= D, span = alongU ? D : W, len = alongU ? W : D, n = Math.max(1, Math.floor(len / 6.5));
          for (let k = 1; k < n; k++) {
            const t = -len / 2 + len * k / n;
            if (alongU) S(cu + t, yl, cv, 0.45, 0.45, span - 1.2, 0, P.steel); else S(cu, yl, cv + t, span - 1.2, 0.45, 0.45, 0, P.steel);
          }
          S(cu, yl - 0.1, R.v0 + 0.6, W - 1.2, 0.6, 0.5, 0, P.steel); S(cu, yl - 0.1, R.v1 - 0.6, W - 1.2, 0.6, 0.5, 0, P.steel);
          S(R.u0 + 0.6, yl - 0.1, cv, 0.5, 0.6, D - 1.2, 0, P.steel); S(R.u1 - 0.6, yl - 0.1, cv, 0.5, 0.6, D - 1.2, 0, P.steel);
        }
        // 굴착기와 덤프트럭
        if (bs.earth < 1) {
          [[-0.22, 0.1, 0.6], [0.2, -0.15, 2.4]].forEach(([fu, fv, rot]) => {
            const u = cu + fu * W, v = cv + fv * D, y = -dig;
            S(u, y, v, 3.4, 0.9, 4.6, rot, P.steel); S(u, y + 0.9, v, 3, 1.5, 3.4, rot, P.crane);
            const [bu, bv] = loc(u, v, rot, 0, -3.2); S(bu, y + 1.6, bv, 0.6, 0.6, 6, rot, P.crane, null, -0.55);
          });
          [[R.u1 + 7, cv], [R.u1 + 7, cv + 12]].forEach(([u, v]) => { S(u, 0.3, v, 2.5, 2.8, 7.5, 0, P.container); S(u, 0.3, v - 4.4, 2.5, 2.4, 1.8, 0, P.fenceBand); });
        }
      }
      // 기초 매트 (타설 진행만큼)
      if (bs.found > 0) S(R.u0 + W * bs.found / 2, -Dp, cv, W * bs.found, mat, D, 0, P.concrete);
      // 지하층: 아래층부터 슬래브 + 기둥
      for (let k = 0; k < built; k++) {
        const [y0, y1] = levels[k];
        S(cu, y1 - 0.4, cv, W, 0.4, D, 0, P.concrete);
        const nx = Math.max(1, Math.round(W / 8.4)), nz = Math.max(1, Math.round(D / 8.4));
        if (nx * nz < 400) for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) S(R.u0 + 0.5 + (W - 1) * i / nx, y0, R.v0 + 0.5 + (D - 1) * j / nz, 0.8, y1 - y0 - 0.4, 0.8, 0, P.concrete);
      }
    });

    // ---------- 버퍼에 쓰기 ----------
    const em = ensure('env', env.length), iFac = em.geometry.attributes.iFac;
    env.forEach((e, i) => {
      const x = e.x; setBox(em, i, x.cu, e.f.y0, x.cv, x.w, e.f.h, x.d, x.a);
      iFac.setXYZW(i, e.pat, e.s2, e.mask, e.seed);
    });
    iFac.needsUpdate = true; em.instanceMatrix.needsUpdate = true;
    em.material = xray ? M.envX : M.env; em.castShadow = !xray;
    envItems = env;
    const sm = ensure('solid', solid.length);
    solid.forEach(([u, y, v, w, h, d, a, c, pitch], i) => { setBox(sm, i, u, y, v, w, h, d, a, pitch); sm.setColorAt(i, c); });
    sm.instanceMatrix.needsUpdate = true; if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
    solidIdx = sIdx;
    const fm = ensure('form', form.length);
    form.forEach(([u, y, v, w, h, d, a, c], i) => { setBox(fm, i, u, y, v, w, h, d, a); fm.setColorAt(i, c); });
    fm.instanceMatrix.needsUpdate = true; if (fm.instanceColor) fm.instanceColor.needsUpdate = true;
    const gm = ensure('glass', glass.length);
    glass.forEach(([u, y, v, w, h, d, a], i) => { setBox(gm, i, u, y, v, w, h, d, a); gm.setColorAt(i, P.glass); });
    gm.instanceMatrix.needsUpdate = true; if (gm.instanceColor) gm.instanceColor.needsUpdate = true;
    const pm = ensure('pit', pit.length);
    pit.forEach(([u, y, v, w, h, d], i) => setBox(pm, i, u, y, v, w, h, d, 0));
    pm.instanceMatrix.needsUpdate = true;
    const mm = ensure('mask', mask.length);
    mask.forEach(([u, y, v, w, h, d], i) => setBox(mm, i, u, y, v, w, h, d, 0));
    mm.instanceMatrix.needsUpdate = true;
    const lm = ensure('lot', lots.length);
    lots.forEach(([L, c], i) => { setBox(lm, i, (L.u0 + L.u1) / 2, 0.02, (L.v0 + L.v1) / 2, L.u1 - L.u0, 0.12, L.v1 - L.v0, 0); lm.setColorAt(i, c); });
    lm.instanceMatrix.needsUpdate = true; if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
    const tm = ensure('tree', trees.length);
    trees.forEach(([u, v, h], i) => { setBox(tm, i, u, 0.14, v, h, h, h, u * 3.1); tm.setColorAt(i, C.setScalar(0.88 + hash(u * v) * 0.2)); });
    tm.instanceMatrix.needsUpdate = true; if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
    // 외피 윤곽선 (같은 크기 층이 이어진 구간마다 상자 하나)
    const pos = [];
    const runs = new Map();
    env.forEach(e => { if (e.x.roof) return; const k = e.bi * 100 + e.pi; const r = runs.get(k); if (r && r.fi === e.fi - 1 && r.s === (e.f.s || 1)) { r.y1 = e.f.y1; r.fi = e.fi; } else { if (r) boxEdges(pos, r.x.cu, r.x.cv, r.x.w, r.x.d, r.x.a, r.y0, r.y1, true); runs.set(k, { x: e.x, y0: e.f.y0, y1: e.f.y1, fi: e.fi, s: e.f.s || 1 }); } });
    runs.forEach(r => boxEdges(pos, r.x.cu, r.x.cv, r.x.w, r.x.d, r.x.a, r.y0, r.y1, true));
    if (edgeLines) { root.remove(edgeLines); edgeLines.geometry.dispose(); }
    edgeLines = new THREE.LineSegments(lineGeo(pos), M.edge); root.add(edgeLines);
    if (ghost) ghost.visible = prog;
    drawCranes(state.cranes, state.floor);
    paintEnv();
  }

  // ---------- 타워크레인 + 외부 승강기 ----------
  let craneSolid = null;
  function drawCranes(list, fs) {
    if (craneLines) { root.remove(craneLines); craneLines.geometry.dispose(); craneLines = null; }
    if (craneSolid) { root.remove(craneSolid); craneSolid.dispose(); craneSolid = null; }
    if (!list || !list.length || !gen) return;
    const pos = [], parts = [];
    const L = (a, b) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    list.forEach(({ u, v, h, a = 0.6, bi }) => {
      const b = bi != null ? gen.bldgs[bi] : null;
      const top = h + 16, m = 1.0, sec = 3;
      // 마스트 격자
      const cs = [[-m, -m], [m, -m], [m, m], [-m, m]].map(([x, z]) => [u + x, v + z]);
      cs.forEach(c => L([c[0], 0, c[1]], [c[0], top, c[1]]));
      for (let y = 0; y + sec <= top; y += sec) for (let i = 0; i < 4; i++) { const p = cs[i], r = cs[(i + 1) % 4]; L([p[0], y, p[1]], [r[0], y + sec, r[1]]); L([p[0], y + sec, p[1]], [r[0], y + sec, r[1]]); }
      const c = Math.cos(a), s = Math.sin(a), jib = 62, cj = 19, apex = top + 10;
      const J = (t, y, off = 0) => [u + c * t - s * off, y, v + s * t + c * off];
      // 지브(삼각 격자)와 카운터 지브
      for (const off of [-0.9, 0.9]) L(J(-cj, top, off), J(jib, top, off));
      L(J(0, top + 2.2), J(jib, top + 1.2));
      for (let t = 0; t < jib; t += 3) { L(J(t, top, -0.9), J(t + 3, top + 2.2 - t / jib, 0)); L(J(t, top, 0.9), J(t + 3, top + 2.2 - t / jib, 0)); L(J(t, top, -0.9), J(t, top, 0.9)); }
      for (let t = -cj; t < 0; t += 3) L(J(t, top, -0.9), J(t + 3, top, 0.9));
      // 탑헤드와 펜던트
      L([u, top, v], [u, apex, v]); L([u, apex, v], J(jib * 0.66, top + 1.8)); L([u, apex, v], J(-cj, top));
      // 트롤리와 훅
      const tr = jib * 0.55; L(J(tr, top), J(tr, Math.max(3, h + 4)));
      parts.push([...J(-cj + 3.5, top - 3.2), 4.5, 3.2, 3, a, P.concrete]);  // 카운터웨이트
      parts.push([...J(1.6, top - 2.6, 1.6), 1.8, 2.2, 2, a, P.container]);  // 운전실
      parts.push([u, top - 1.4, v, 2.8, 1.4, 2.8, a, P.crane]);            // 선회 장치
      parts.push([...J(tr, Math.max(3, h + 3)), 0.9, 1.3, 0.9, a, P.crane]); // 훅 블록
      // 외부 승강기 (마스트 + 운반구)
      if (b && b.parts[0]) {
        const p0 = b.parts[0], [hu, hv] = loc(p0.cu, p0.cv, p0.a || 0, p0.w * 0.3, p0.d / 2 + 1.6);
        parts.push([hu, 0, hv, 0.9, Math.max(3, h - 3), 0.9, p0.a || 0, P.steel]);
        parts.push([hu + 0.2, Math.max(0, h * 0.42), hv + 0.8, 1.6, 2.6, 1.6, p0.a || 0, P.container]);
      }
    });
    craneLines = new THREE.LineSegments(lineGeo(pos), M.crane); root.add(craneLines);
    craneSolid = new THREE.InstancedMesh(box, M.solid, parts.length);
    parts.forEach(([u, y, v, w, h, d, a, c], i) => { setBox(craneSolid, i, u, y, v, w, h, d, a); craneSolid.setColorAt(i, c); });
    craneSolid.castShadow = true; root.add(craneSolid);
  }

  // ---------- 외피 색 ----------
  let colorFn = null, selected = null;
  // fn(bi, fi, item) → THREE.Color (없으면 동 종류별 외벽색)
  function paint(fn, sel) { colorFn = fn; selected = sel ?? selected; paintEnv(); }
  function paintEnv() {
    const p = pools.env; if (!p.mesh || !gen) return;
    envItems.forEach((e, i) => {
      const b = gen.bldgs[e.bi];
      if (colorFn) { const c = colorFn(e.bi, e.fi, e); C.copy(c || P[KIND_WALL[b.kind] || 'wCom']); }
      else C.copy(e.x.roof ? P.duct : P[KIND_WALL[b.kind] || 'wCom']);
      if (state.focus === 'skin' && e.s2 === 4) C.lerp(P.accent, 0.45);
      if (state.focus === 'fin' && e.s2 === 5) C.lerp(P.accent, 0.45);
      if (state.focus && !(state.focus === 'skin' && e.s2 === 4) && !(state.focus === 'fin' && e.s2 === 5)) C.lerp(P.ground, 0.35);
      if (selected != null && e.bi === selected) C.lerp(P.accent, 0.4);
      p.mesh.setColorAt(i, C);
    });
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
  }
  function select(bi) { selected = bi; paintEnv(); }

  // ---------- 고르기 ----------
  function pick(ray) {
    const hits = [];
    if (pools.env.mesh && pools.env.mesh.count) hits.push(...ray.intersectObject(pools.env.mesh, false).map(h => ({ d: h.distance, r: envItems[h.instanceId] ? [envItems[h.instanceId].bi, envItems[h.instanceId].fi] : null })));
    if (pools.solid.mesh && pools.solid.mesh.count) hits.push(...ray.intersectObject(pools.solid.mesh, false).map(h => ({ d: h.distance, r: solidIdx[h.instanceId] })));
    hits.sort((a, b) => a.d - b.d);
    const h = hits.find(x => x.r);
    return h ? h.r : null;
  }

  // ---------- 테마 ----------
  function update(Pn) {
    P = Pn;
    M.crane.color.copy(P.crane); M.ghost.color.copy(P.edge); M.edge.color.copy(P.edge); M.site.color.copy(P.accent);
    ['walk', 'asph', 'mark', 'green', 'lot'].forEach(n => M[n].color.setScalar(P.flat ?? 1));
    repaintTree(treeG, P);
    const pc = pitGeo.attributes.color || new THREE.Float32BufferAttribute(new Float32Array(pitGeo.attributes.position.count * 3), 3);
    // 면 순서 +x,-x,+y,-y,+z,-z (각 4정점): 바닥(-y)은 흙, 나머지는 흙막이 벽
    for (let i = 0; i < pc.count; i++) { const f = Math.floor(i / 4), c = f === 3 ? P.soil : P.pitWall; pc.setXYZ(i, c.r, c.g, c.b); }
    pitGeo.setAttribute('color', pc); pc.needsUpdate = true;
    if (gen) { buildBase(); setState(state); }
  }
  update(P);

  function dispose() {
    Object.values(pools).forEach(p => { if (p.mesh) { p.parent.remove(p.mesh); p.mesh.dispose(); if (p.mesh.geometry !== p.geo) p.mesh.geometry.dispose(); } });
    [box, sbox, pitGeo, treeG].forEach(g => g.dispose());
    Object.values(M).forEach(m => m.dispose());
    baseObjs.forEach(o => { if (o.geometry) o.geometry.dispose(); });
    if (craneSolid) craneSolid.dispose();
    site.remove(root); site.remove(base);
  }
  return { setModel, setState, paint, select, pick, update, dispose, get state() { return state; }, get envCount() { return envItems.length; }, floorBoxes, boxEdges, stencilMats: [M.lot] };
}
