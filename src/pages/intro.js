// 첫 화면: BIM·AI 시뮬레이터의 정체성을 보여 주는 배경(가상 도시가 층마다 지어지고, AI가 훑으며 계산하는 장면) + 시작하기
import * as THREE from 'three';
import { onThemeChange } from '../pipeline.js';

export const title = 'BIM·AI 건설 시뮬레이터';

const STEPS = [
  ['01', '택지 선정', '지도 위 후보지를 같은 기준으로 비교'],
  ['02', '매스 배치', '변수로 동을 배치하고 일조·조망 검토'],
  ['03', '층별 일람표', '동·층·세대 물량을 표로'],
  ['04', '4D 공정', '흙막이부터 준공까지 층별 시뮬레이션'],
  ['05', '5D 예산', '공정에 따라 쌓이는 공사비'],
];

export function mount(root) {
  document.title = 'BIM·AI 건설 시뮬레이터';
  root.innerHTML = `<section class="intro" aria-label="시작 화면">
    <div class="intro-bg" id="i-bg" aria-hidden="true"></div>
    <svg class="intro-lead" id="i-lead" aria-hidden="true"></svg>
    <div class="intro-tags" id="i-tags" aria-hidden="true"></div>
    <div class="intro-hud" aria-hidden="true">
      <span class="label-sm">live model</span>
      <dl id="i-hud"></dl>
      <div class="intro-prog"><i id="i-prog"></i></div>
    </div>
    <div class="intro-copy">
      <span class="label-sm intro-kicker">bim · ai construction simulator</span>
      <h1>Build it <em>before</em><br>you build it.</h1>
      <p>택지를 고르고, 동을 배치하고, 층마다 공정과 예산을 계산합니다.<br>사업 전체를 실제로 짓기 전에 화면 위에서 먼저 지어 봅니다.</p>
      <div class="intro-cta">
        <a class="btn big" href="#/site" id="i-start">시작하기 <span class="ar" aria-hidden="true">→</span></a>
        <span class="note">01 택지 선정부터 05 5D 예산까지, 5단계</span>
      </div>
    </div>
    <ol class="intro-steps">${STEPS.map(([n, t, d], i) => `<li><a href="#/${['site', 'mass', 'schedule', 'process', 'budget'][i]}"><span class="n">${n}</span><b>${t}</b><span>${d}</span></a></li>`).join('')}</ol>
  </section>`;

  const bg = root.querySelector('#i-bg');
  const scene3 = createCity(bg, root.querySelector('#i-tags'), root.querySelector('#i-lead'), root.querySelector('#i-hud'), root.querySelector('#i-prog'));
  const offTheme = onThemeChange(() => scene3 && scene3.theme());
  return () => { offTheme(); if (scene3) scene3.dispose(); };
}

// ---------- 배경 장면 ----------
function css(n, d) { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || d; }
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function createCity(host, tagBox, leadSvg, hud, prog) {
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch (e) { canvas.remove(); host.classList.add('nogl'); return null; }
  const small = window.innerWidth < 760;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 6000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9dadc, 1.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e8, 2.6);
  sun.position.set(-260, 520, 340); sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 10, far: 1600 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  scene.add(sun);

  // ---- 도시 배치: 3×3 블록, 블록마다 2~4동 (탑상·판상) ----
  const R = rng(20261113);
  const FH = 3.2, BLK = 150, ROAD = 26;
  const B = [];
  for (let bi = 0; bi < 3; bi++) for (let bj = 0; bj < 3; bj++) {
    const cx = (bi - 1) * (BLK + ROAD), cz = (bj - 1) * (BLK + ROAD);
    const center = bi === 1 && bj === 1;
    const kinds = center ? ['tower', 'tower', 'tower'] : R() < 0.5 ? ['slab', 'slab', 'tower'] : ['tower', 'tower', 'slab', 'tower'];
    const slots = [[-36, -36], [36, -36], [-36, 36], [36, 36]];
    kinds.forEach((k, i) => {
      const [ox, oz] = slots[i];
      const w = k === 'slab' ? 58 + R() * 14 : 24 + R() * 8, d = k === 'slab' ? 15 : 24 + R() * 6;
      const floors = Math.round(center ? 38 + R() * 22 : k === 'slab' ? 12 + R() * 10 : 20 + R() * 18);
      B.push({ x: cx + ox * (k === 'slab' ? 0.55 : 1), z: cz + oz, w, d, floors, rot: k === 'slab' ? 0 : (R() - 0.5) * 0.0, block: bi * 3 + bj });
    });
  }
  // 착공 순서: 가운데 블록부터 바깥으로
  B.forEach((b) => { b.start = Math.hypot(b.x, b.z) / 260 * 9 + R() * 3; b.dur = 10 + b.floors * 0.22; });
  const TOTAL = B.reduce((a, b) => a + b.floors, 0);

  // ---- 바닥: 흰 대지 + 가는 격자 (멀수록 흐려짐) ----
  // 바닥은 톤 매핑 없이 종이색 그대로, 그림자만 따로 얹는다 (흰 모형 사진처럼)
  const groundMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), groundMat);
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const blockMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const blocks = new THREE.Group(); scene.add(blocks);
  for (let bi = 0; bi < 3; bi++) for (let bj = 0; bj < 3; bj++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(BLK, BLK), blockMat);
    m.rotation.x = -Math.PI / 2; m.position.set((bi - 1) * (BLK + ROAD), 0.02, (bj - 1) * (BLK + ROAD)); blocks.add(m);
  }
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.16 });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = 0.08; shadowPlane.receiveShadow = true; scene.add(shadowPlane);
  const gridMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true });
  const grid = new THREE.LineSegments(new THREE.BufferGeometry(), gridMat); grid.position.y = 0.05; scene.add(grid);
  function buildGrid(bgC, lineC) {
    const pos = [], col = [], S = 1400, step = 22;
    const put = (x0, z0, x1, z1) => {
      pos.push(x0, 0, z0, x1, 0, z1);
      [[x0, z0], [x1, z1]].forEach(([x, z]) => { const k = Math.max(0, 1 - Math.hypot(x, z) / 900); const c = bgC.clone().lerp(lineC, k * k); col.push(c.r, c.g, c.b); });
    };
    for (let v = -S; v <= S; v += step) for (let u = -S; u < S; u += step) { put(u, v, u + step, v); put(v, u, v, u + step); }
    grid.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    grid.geometry = g;
  }
  // 대지 경계 (점선)
  const siteLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => new THREE.Vector3(a * 252, 0.8, c * 252))),
    new THREE.LineDashedMaterial({ dashSize: 6, gapSize: 5 }));
  siteLine.computeLineDistances(); scene.add(siteLine);

  // ---- 계획 모델: 동마다 층 윤곽(BIM 와이어프레임) ----
  const wirePos = [];
  B.forEach((b) => {
    const hx = b.w / 2, hz = b.d / 2, H = b.floors * FH;
    const C = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, c]) => [b.x + a, b.z + c]);
    const ring = (y) => { for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) % 4]; wirePos.push(p[0], y, p[1], q[0], y, q[1]); } };
    for (let f = 0; f < b.floors; f += 3) ring(f * FH);
    ring(H);
    C.forEach(([x, z]) => wirePos.push(x, 0, z, x, H, z));
  });
  const wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePos, 3));
  const wireMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false });
  const wire = new THREE.LineSegments(wireGeo, wireMat); scene.add(wire);

  // ---- 지어진 층: 인스턴스 (층 하나 = 상자 하나) ----
  const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0, 0.5, 0);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0 });
  const floors = new THREE.InstancedMesh(unit, floorMat, TOTAL);
  floors.castShadow = true; floors.receiveShadow = true; floors.frustumCulled = false;
  floors.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 3).fill(1), 3);
  scene.add(floors);
  // 층 사이 띠 (유리 띠처럼 보이게 어두운 선)
  const bandMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1, depthWrite: false });
  const bands = new THREE.InstancedMesh(unit, bandMat, TOTAL); bands.frustumCulled = false; scene.add(bands);
  // 공사 중인 층: 거푸집(주황) 판
  const formMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const forms = new THREE.InstancedMesh(unit, formMat, B.length); forms.frustumCulled = false; forms.castShadow = true; scene.add(forms);
  // 타워 크레인 (선)
  const craneMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
  const cranes = B.map((b) => {
    const g = new THREE.Group();
    const L = (pts) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p))), craneMat);
    g.add(L([[0, 0, 0], [0, 1, 0]]), L([[1.6, 0, 0], [1.6, 1, 0]]));
    const jib = L([[-14, 1, 0.8], [46, 1, 0.8]]); g.add(jib);
    g.add(L([[0, 1, 0.8], [0.8, 1.06, 0.8], [1.6, 1, 0.8]]));
    g.position.set(b.x + b.w / 2 + 5, 0, b.z - b.d / 2 - 3);
    g.userData = { b }; g.visible = false; scene.add(g); return g;
  });

  // ---- AI 훑기: 수평 스캔 면 + 일조 표본점 ----
  const scanMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.028, depthWrite: false, side: THREE.DoubleSide });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), scanMat); scan.rotation.x = -Math.PI / 2; scene.add(scan);
  const scanEdge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => new THREE.Vector3(a * 260, 0, c * 260))), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 }));
  scene.add(scanEdge);
  // 표본점: 외벽 남·서면에 층마다
  const P = [];
  B.forEach((b, bi) => {
    for (let f = 1; f < b.floors; f += 2) {
      const n = Math.max(2, Math.round(b.w / 9));
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n - 0.5;
        P.push({ bi, f, x: b.x + u * b.w, y: f * FH + FH * 0.5, z: b.z + b.d / 2 + 0.6, v: Math.min(1, Math.max(0, 0.25 + f / b.floors * 0.7 + (R() - 0.5) * 0.4)) });
      }
    }
  });
  const ptGeo = new THREE.BufferGeometry();
  ptGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(P.length * 3), 3));
  ptGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(P.length * 3), 3));
  const ptMat = new THREE.PointsMaterial({ size: small ? 2 : 2.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const pts = new THREE.Points(ptGeo, ptMat); scene.add(pts);

  // ---- 주석(태그): 3D 지점에 붙는 HTML ----
  const centerTowers = B.map((b, i) => [b, i]).filter(([b]) => b.block === 4).map(([, i]) => i);
  const TAGS = [
    { el: null, kind: 'build', bi: centerTowers[0] },
    { el: null, kind: 'sun', bi: centerTowers[2] ?? 0 },
    { el: null, kind: 'cost' },
    { el: null, kind: 'plan', bi: B.findIndex(b => b.block === 0) },
  ];
  TAGS.forEach(t => { t.el = document.createElement('div'); t.el.className = 'itag'; tagBox.appendChild(t.el); });

  // ---- 테마 ----
  const col = {};
  function theme() {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const C = (n, d) => new THREE.Color(css(n, d));
    col.bg = C('--paper', '#ffffff'); col.ink = C('--ink', '#0b0b0c'); col.muted = C('--muted', '#7c7c82'); col.line = C('--line', '#e4e4e7');
    col.acc = C('--accent', '#eb6834'); col.lo = C('--heat-lo', '#f0f0f1'); col.hi = C('--heat-hi', '#0c6f68');
    col.model = dark ? new THREE.Color('#2a2b2e') : new THREE.Color('#ffffff');
    col.fresh = dark ? new THREE.Color('#55565a') : new THREE.Color('#c9c9c6');
    col.dark = dark;
    scene.background = col.bg.clone();
    groundMat.color.copy(col.bg); blockMat.color.copy(col.bg.clone().lerp(col.ink, dark ? 0.045 : 0.022));
    shadowMat.opacity = dark ? 0.45 : 0.14;
    buildGrid(col.bg, col.bg.clone().lerp(col.ink, dark ? 0.16 : 0.1));
    siteLine.material.color.copy(col.acc);
    wireMat.color.copy(col.ink); wireMat.opacity = dark ? 0.26 : 0.22;
    formMat.color.copy(col.acc).lerp(col.bg, dark ? 0.1 : 0.18); craneMat.color.copy(dark ? col.muted : col.ink);
    scanMat.color.copy(col.acc); scanEdge.material.color.copy(col.acc);
    bandMat.color.set(dark ? 0x000000 : 0x1c2a33); bandMat.opacity = dark ? 0.5 : 0.16;
    hemi.intensity = dark ? 0.9 : 1.6; hemi.groundColor.set(dark ? 0x0c0c0e : 0xd9dadc);
    sun.intensity = dark ? 1.2 : 2.6;
    renderer.toneMappingExposure = dark ? 1.0 : 1.04;
    need = true;
  }

  // ---- 시간 흐름: 짓기 → 머물기 → 되감기 ----
  const BUILD = Math.max(...B.map(b => b.start + b.dur)) + 1, HOLD = 6, REW = 3.2, CYCLE = BUILD + HOLD + REW;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), c3 = new THREE.Color();
  let need = true, alive = true, t0 = performance.now(), last = 0, visible = true;
  const builtAt = (b, t) => {
    // t: 장면 시각 → 그 동에 지어진 층 수 (소수: 공사 중인 층의 진행)
    if (t < BUILD + HOLD) return Math.max(0, Math.min(b.floors, (t - b.start) / b.dur * b.floors));
    const r = (t - BUILD - HOLD) / REW; return b.floors * Math.max(0, 1 - r * 1.15);
  };
  function step(t) {
    let i = 0, built = 0, active = 0;
    const rew = t > BUILD + HOLD;
    B.forEach((b, bi) => {
      const n = builtAt(b, t), full = Math.floor(n), frac = n - full;
      built += Math.min(n, b.floors);
      for (let f = 0; f < b.floors; f++) {
        const on = f < full;
        if (on) {
          s3.set(b.w, FH * 0.985, b.d); p3.set(b.x, f * FH, b.z);
          const age = full - f; // 방금 친 층은 콘크리트 색, 몇 층 지나면 마감색
          c3.copy(col.fresh).lerp(col.model, Math.min(1, Math.max(0, (age - 2) / 4)));
        } else { s3.set(0, 0, 0); p3.set(0, -50, 0); c3.copy(col.model); }
        m4.compose(p3, q, s3); floors.setMatrixAt(i, m4); floors.setColorAt(i, c3);
        if (on && f > 0) { s3.set(b.w + 0.25, 0.5, b.d + 0.25); p3.set(b.x, f * FH - 0.25, b.z); } else { s3.set(0, 0, 0); p3.set(0, -50, 0); }
        m4.compose(p3, q, s3); bands.setMatrixAt(i, m4);
        i++;
      }
      // 거푸집: 공사 중인 층
      const building = !rew && full < b.floors && n > 0;
      if (building) { active++; s3.set(b.w + 1.2, FH * Math.max(0.15, frac), b.d + 1.2); p3.set(b.x, full * FH, b.z); } else { s3.set(0, 0, 0); p3.set(0, -50, 0); }
      m4.compose(p3, q, s3); forms.setMatrixAt(bi, m4);
      const cr = cranes[bi]; cr.visible = building && b.floors > 30;
      if (cr.visible) cr.scale.set(1, full * FH + 22, 1);
    });
    floors.instanceMatrix.needsUpdate = true; floors.instanceColor.needsUpdate = true; bands.instanceMatrix.needsUpdate = true; forms.instanceMatrix.needsUpdate = true;
    // 표본점: 지어진 층에만
    const pa = ptGeo.attributes.position.array, ca = ptGeo.attributes.color.array;
    P.forEach((p, k) => {
      const ok = builtAt(B[p.bi], t) > p.f + 3;
      pa[k * 3] = p.x; pa[k * 3 + 1] = ok ? p.y : -100; pa[k * 3 + 2] = p.z;
      c3.copy(col.lo).lerp(col.hi, p.v); if (!col.dark) c3.lerp(col.hi, 0.25);
      ca[k * 3] = c3.r; ca[k * 3 + 1] = c3.g; ca[k * 3 + 2] = c3.b;
    });
    ptGeo.attributes.position.needsUpdate = true; ptGeo.attributes.color.needsUpdate = true;
    // 스캔 면: 짓는 동안 도시 위아래를 천천히 훑는다
    const hMax = Math.max(...B.map(b => builtAt(b, t))) * FH;
    const sy = rew ? hMax : (0.5 - 0.5 * Math.cos(t * 0.55)) * Math.max(20, hMax);
    scan.position.y = sy; scanEdge.position.y = sy;
    return { built, active, sy };
  }

  // HUD + 태그
  const fmt = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  const v3 = new THREE.Vector3();
  function project(x, y, z, w, h) { v3.set(x, y, z).project(cam); return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h, v3.z < 1]; }
  let lastHud = 0;
  function overlay(t, st, w, h, now) {
    const months = t / BUILD * 42;
    const ratio = st.built / TOTAL;
    if (now - lastHud > 220) {
      lastHud = now;
      hud.innerHTML = `<dt>buildings</dt><dd>${B.length}</dd><dt>floors</dt><dd>${fmt(st.built)} / ${fmt(TOTAL)}</dd><dt>schedule</dt><dd>t + ${fmt(Math.min(42, months), 1)} mo</dd><dt>cost</dt><dd>₩ ${fmt(ratio * 1.84, 2)} 조</dd>`;
      prog.style.width = (ratio * 100).toFixed(1) + '%';
    }
    const lines = [];
    TAGS.forEach((tg) => {
      let x, y, z, text = '';
      if (tg.kind === 'build') {
        const b = B[tg.bi], n = builtAt(b, t); x = b.x - b.w / 2; y = Math.max(1, Math.floor(n)) * FH; z = b.z + b.d / 2;
        const done = n >= b.floors;
        text = done ? `<b>${b.floors}F</b> 골조 완료` : `<b>L${Math.max(1, Math.ceil(n))}</b> 슬래브 타설 · ${fmt((n % 1) * 100)}%`;
      } else if (tg.kind === 'sun') {
        const b = B[tg.bi], n = builtAt(b, t); x = b.x + b.w / 2; y = Math.max(2, n) * FH; z = b.z;
        const hrs = 2.4 + Math.min(1, n / b.floors) * 2.1;
        text = `일조 <b>${Math.floor(hrs)}h ${String(Math.round((hrs % 1) * 60)).padStart(2, '0')}m</b> · 동지 기준 충족`;
      } else if (tg.kind === 'cost') {
        x = 252; y = 0; z = 252; text = `5D 누적 <b>₩${fmt(ratio * 1.84, 2)}조</b>`;
      } else {
        const b = B[Math.max(0, tg.bi)]; x = b.x - b.w / 2; y = Math.max(1, builtAt(b, t)) * FH; z = b.z - b.d / 2;
        text = `AI 배치안 <b>#${(Math.floor(t / 3) % 24) + 1}</b> · 인동간격 적합`;
      }
      const [sx, sy, ok] = project(x, y, z, w, h);
      const dx = tg.kind === 'cost' ? 30 : tg.kind === 'plan' ? -40 : 44, dy = tg.kind === 'sun' ? -18 : -54;
      const lx = sx + dx, ly = sy + dy;
      const inside = ok && sx > 8 && sx < w - 8 && sy > 8 && sy < h - 8;
      tg.el.style.opacity = inside ? 1 : 0;
      const tw = tg.el.offsetWidth;
      let tx = dx < 0 ? lx - tw : lx;
      if (tx + tw > w - 12) tx = lx - tw - 8;
      tg.el.style.transform = `translate(${Math.max(8, tx).toFixed(1)}px, ${(ly - 10).toFixed(1)}px)`;
      if (tg.text !== text) { tg.el.innerHTML = text; tg.text = text; }
      if (inside) lines.push(`<path d="M${sx.toFixed(1)},${sy.toFixed(1)}L${lx.toFixed(1)},${ly.toFixed(1)}"/><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.2"/>`);
    });
    leadSvg.innerHTML = lines.join('');
  }

  // ---- 그리기 ----
  function frame(now) {
    if (!alive) return;
    requestAnimationFrame(frame);
    if (!visible) return;
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    if (now - last < 1000 / 40 && !need) return; // 40fps면 충분
    last = now; need = false;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
    const el = (now - t0) / 1000;
    const t = reduce ? BUILD * 0.72 : el % CYCLE;
    // 카메라: 등각에 가까운 평행 투영, 천천히 돈다
    const az = -0.72 + (reduce ? 0 : el * 0.035), wide = w / h;
    const half = (wide > 1.25 ? 300 : 380) * (w < 760 ? 1.15 : 1);
    cam.left = -half * wide; cam.right = half * wide; cam.top = half; cam.bottom = -half;
    // 화면 오른쪽으로 도시를 비켜 놓아 왼쪽 글과 겹치지 않게
    const shift = wide > 1.25 ? half * wide * 0.28 : 0;
    cam.position.set(Math.sin(az) * 1400, 1080, Math.cos(az) * 1400);
    cam.lookAt(0, 40, 0);
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    cam.position.addScaledVector(right, -shift);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const st = step(t);
    renderer.render(scene, cam);
    overlay(t, st, w, h, now);
  }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }); io.observe(host);
  const onVis = () => { visible = !document.hidden; }; document.addEventListener('visibilitychange', onVis);
  theme();
  requestAnimationFrame(frame);

  return {
    theme,
    dispose() {
      alive = false; io.disconnect(); document.removeEventListener('visibilitychange', onVis);
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
