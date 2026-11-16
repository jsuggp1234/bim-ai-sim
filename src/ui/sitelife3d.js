// 현장 사람들: 현장 앞 가설 사무소 단지와 그곳의 하루 (build3d.js에서 부른다).
// 2층 컨테이너 현장사무소(소장실·공무팀·안전팀·감리단, 외부 철제 계단·복도·난간·실외기·간판·현수막) · 근로자 휴게실(차양막·벤치·정수기·얼음 상자·선풍기) ·
// TBM 마당(안전 게시판) · 국기 게양대(태극기·회사기·안전기) · 직원 차량 · 그물 울타리 · 현장 출입구의 공사 안내판(현장소장 이름).
// 사람: 아침 TBM(모이기 → 위험 요인 공유 → 체조 → 안전 구호 → 작업 투입)을 110초 주기로 되풀이하고,
// 현장소장·감리원은 사무소 앞에서 이야기하고, 공무는 2층 복도에서 통화하며, 휴게실에서는 앉아 쉬고 물을 마시며 이야기를 나눈다.
// 모든 사람은 누르면 대화할 수 있도록 pid(사람 번호)·role(역할)·seed를 단다 (talk.js).
// 좌표는 build3d와 같다 (x 단면 가로, z 대로 방향, 대지 0..pw × -pd/2..pd/2, 대로는 x > pw). 단지는 대지 앞(z > pd/2) 대로 쪽에 놓는다.
import * as THREE from 'three';
import { HATS, VESTS, SHIRTS, PANTS, SKIN } from './crew3d.js';
import { nameFor, phaseGroup } from './talk.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hsh = (a, b = 0) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
const strHash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; };
export const COMPANY = '누리종합건설(주)';
const FONT = "'Pretendard', 'Pretendard Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const RISK = {
  geo: ['굴착 장비 협착·충돌', '흙막이 변위·붕괴', '지하 매설물 손상'], struct: ['개구부·단부 추락', '거푸집 동바리 붕괴', '인양물 낙하'],
  skin: ['외부 고소작업 추락', '강풍 시 인양 중지', '낙하물'], mep: ['감전 (활선 확인)', '고소작업대 전도', '용접 불티 화재'], fin: ['분진·유기용제', '화재 (화기 감시)', '자재 운반 중 넘어짐'],
};
// TBM에 모이는 사람들의 직종 (공정마다)
const TBR = { geo: ['labor', 'signal', 'form', 'rebar', 'survey', 'foreign', 'labor', 'weld'], struct: ['form', 'rebar', 'pour', 'foreign', 'signal', 'steel', 'weld', 'labor'], skin: ['steel', 'weld', 'finish', 'labor', 'foreign', 'signal'], mep: ['mep', 'elec', 'weld', 'labor', 'foreign'], fin: ['finish', 'paint', 'labor', 'foreign', 'elec'] };
const WORK = { geo: '터파기·흙막이·토사 반출', struct: '거푸집·철근·콘크리트 타설', skin: '외벽 패널·창호 설치', mep: '배관·덕트·전기 배선', fin: '내장·바닥·도장 마감' };

export function buildSiteLife(X) {
  const { root, mat, BOX, sc, D, city } = X;
  const G = sc.G, pw = G.pw, pd = D.pd, C = sc.city;
  const grp = new THREE.Group(); grp.name = 'site-life'; root.add(grp);
  const own = { geos: [], mats: [], tex: [] };
  const seed = strHash((sc.R && sc.R.site && (sc.R.site.id || sc.R.site.name)) || 'site') + strHash(sc.use && sc.use.name);
  const siteName = (sc.R && sc.R.site && sc.R.site.name) || '';
  const project = `${siteName ? siteName + ' ' : ''}${(sc.use && sc.use.name) || '건축물'} 신축공사`;
  const names = { boss: nameFor('boss', seed + 1).name, safety: nameFor('safety', seed + 2).name, gamri: nameFor('gamri', seed + 3).name, gongmu: nameFor('gongmu', seed + 4).name, engineer: nameFor('engineer', seed + 5).name };

  // ---------- 그리기 도구 ----------
  const UP = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3();
  const bx = (m, x0, x1, y0, y1, z0, z1) => { const o = new THREE.Mesh(BOX, m); o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); o.scale.set(Math.max(1e-3, Math.abs(x1 - x0)), Math.max(1e-3, Math.abs(y1 - y0)), Math.max(1e-3, Math.abs(z1 - z0))); grp.add(o); return o; };
  const beam = (m, a, b, w, d) => { const o = new THREE.Mesh(BOX, m), dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1e-3; o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); o.scale.set(w, L, d); o.quaternion.setFromUnitVectors(UP, V.set(dx / L, dy / L, dz / L)); grp.add(o); return o; };
  const geo = (g) => { own.geos.push(g); return g; };
  const CYL = geo(new THREE.CylinderGeometry(0.5, 0.5, 1, 14));
  const cyl = (m, x, y0, y1, z, r) => { const o = new THREE.Mesh(CYL, m); o.position.set(x, (y0 + y1) / 2, z); o.scale.set(2 * r, y1 - y0, 2 * r); grp.add(o); return o; };
  function textTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; own.tex.push(t); return t;
  }
  const PL = geo(new THREE.PlaneGeometry(1, 1));
  function sign(tex, w, h, x, y, z, ry = 0, o = {}) {
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? 0.6, metalness: 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide, emissive: o.em ? new THREE.Color(0xffffff) : new THREE.Color(0), emissiveMap: o.em ? tex : null, emissiveIntensity: o.em || 0 });
    own.mats.push(m); const p = new THREE.Mesh(PL, m); p.position.set(x, y, z); p.rotation.y = ry; p.scale.set(w, h, 1); grp.add(p); return p;
  }
  const font = (g, px, wt = 700) => { g.font = `${wt} ${px}px ${FONT}`; };
  const fitText = (g, s, x, y, maxW, px, wt = 700) => { let k = px; font(g, k, wt); while (k > 8 && g.measureText(s).width > maxW) { k -= 1; font(g, k, wt); } g.fillText(s, x, y); };

  // ---------- 자리 ----------
  const gx = city.gate.x, gz0 = city.gate.z0, gz1 = city.gate.z1;
  const X0 = (C.yard ? C.yard[1] : pw + 4.85) - 0.25, Z0 = pd / 2 + 3.6, Z1 = Z0 + clamp(D.Z - pd / 2 - 4.5, 13, 22);
  const WX = clamp(X0 - 0.5, 16, 44), XL = X0 - WX;
  const CW = 6.0, CD = 2.9, CH = 2.6;
  const nC = clamp(Math.floor((WX - 14) / 6.1), 2, 4);
  const OX1 = X0 - 2.3, OX0 = OX1 - nC * CW, OZ0 = Z0 + 0.6, OZ1 = OZ0 + CD;
  const restOn = OX0 - 1.4 - CW > XL + 0.8, RX1 = OX0 - 1.4, RX0 = RX1 - CW;
  const TBX = OX0 + nC * CW * 0.5 + (nC > 2 ? -1.5 : 0), TBZ = OZ1 + 2.0; // TBM 게시판 자리
  const life = { box: [XL, X0, Z0, Z1], center: [(XL + X0) / 2, 1.5, (Z0 + Z1) / 2], office: [OX0, OX1, OZ0, OZ1] };

  // ---------- 재질 ----------
  const WHITE = mat(0xe9e7e1, { tex: 'panel', rough: 0.55, metal: 0.25 }), IVORY = mat(0xe3dccb, { tex: 'panel', rough: 0.55, metal: 0.25 }), REST = mat(0xd4e3d2, { tex: 'panel', rough: 0.55, metal: 0.2 });
  const FRAME = mat(0x4a5058, { metal: 0.5, rough: 0.45 }), GLASS = mat(0x6d8ca3, { metal: 0.55, rough: 0.12 }), ALU = mat(0xc9ccd1, { metal: 0.7, rough: 0.35 }), DOOR = mat(0x5f6670, { metal: 0.4, rough: 0.5 });
  const STEEL = mat(0x55606b, { metal: 0.6, rough: 0.45 }), RAIL = mat(0xf2c94c, { em: 0.08, metal: 0.3 }), ODU = mat(0xdcdcd8, { metal: 0.3, rough: 0.5 }), GRILL = mat(0x2b2e33, { rough: 0.6 });
  const CONC = mat(0xb5b2aa, { tex: 'conc' }), PAVE = mat(0x8e8a82, { tex: 'asph' }), WOOD = mat(0x9b7a52, { rough: 0.8 }), TARP = mat(0x2f7f6a, { op: 0.88, rough: 0.8 }), BLUE = mat(0x2f6fb5, { rough: 0.5 }), NET = mat(0x3fae6a, { op: 0.32 }), POST = mat(0x8a9099, { metal: 0.5 });

  // 바닥: 사무소 콘크리트 기초 · TBM 마당 포장
  bx(CONC, OX0 - 0.4, X0 - 0.3, 0, 0.08, OZ0 - 0.3, OZ1 + 1.4);
  if (restOn) bx(CONC, RX0 - 0.3, RX1 + 0.3, 0, 0.08, OZ0 - 0.3, OZ1 + 3.9);
  bx(PAVE, XL + 0.6, X0 - 0.3, 0, 0.05, OZ1 + 1.4, Z1 - 0.6);

  // ---------- 컨테이너 한 칸 (앞이 +z) ----------
  function container(x0, y0, body, o = {}) {
    const x1 = x0 + CW, y1 = y0 + CH, z0 = OZ0, z1 = o.z1 ?? OZ1;
    bx(body, x0 + 0.04, x1 - 0.04, y0 + 0.12, y1 - 0.1, z0 + 0.04, z1 - 0.04);
    // 모서리 기둥 · 위아래 테
    [[x0, z0], [x1 - 0.14, z0], [x0, z1 - 0.14], [x1 - 0.14, z1 - 0.14]].forEach(([x, z]) => bx(FRAME, x, x + 0.14, y0, y1, z, z + 0.14));
    bx(FRAME, x0, x1, y0, y0 + 0.14, z1 - 0.12, z1 + 0.01); bx(FRAME, x0, x1, y1 - 0.12, y1, z1 - 0.12, z1 + 0.01);
    bx(FRAME, x0, x1, y1 - 0.06, y1 + 0.03, z0, z1); // 지붕
    // 문 (왼쪽) · 창 둘 (가운데·오른쪽)
    const dx = x0 + 0.55; if (o.door !== false) { bx(DOOR, dx, dx + 0.9, y0 + 0.14, y0 + 2.18, z1 - 0.01, z1 + 0.03); bx(GLASS, dx + 0.2, dx + 0.7, y0 + 1.45, y0 + 1.95, z1 + 0.03, z1 + 0.045); bx(ALU, dx + 0.72, dx + 0.82, y0 + 1.0, y0 + 1.06, z1 + 0.03, z1 + 0.09); }
    [x0 + 2.2, x0 + 4.1].forEach(wx => { bx(ALU, wx - 0.06, wx + 1.36, y0 + 0.94, y0 + 2.06, z1 - 0.01, z1 + 0.04); bx(GLASS, wx, wx + 1.3, y0 + 1.0, y0 + 2.0, z1 + 0.04, z1 + 0.055); bx(ALU, wx + 0.63, wx + 0.67, y0 + 1.0, y0 + 2.0, z1 + 0.05, z1 + 0.07); });
    // 뒤창 하나
    bx(ALU, x0 + 2.4, x0 + 3.6, y0 + 1.1, y0 + 1.9, z0 - 0.03, z0 + 0.01);
    return { x0, x1, y0, y1, door: [dx + 0.45, y0, z1] };
  }
  const plateTex = (s, bg = '#1f3a5f') => textTex(256, 64, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, s, w / 2, h / 2 + 2, w - 16, 34); });
  const LOW = ['소장실', '공무팀', '회의실', '공사팀'], UPP = ['안전보건팀', '감리단', 'BIM·설계팀', '자재 창고'];
  const doors = [];
  for (let i = 0; i < nC; i++) {
    const c = container(OX0 + i * CW, 0.08, i % 2 ? IVORY : WHITE); doors.push(c.door);
    sign(plateTex(LOW[i] || '사무실'), 0.62, 0.16, c.door[0], c.y0 + 2.36, c.door[2] + 0.05);
    const u = container(OX0 + i * CW, 0.08 + CH + 0.04, i % 2 ? WHITE : IVORY);
    sign(plateTex(UPP[i] || '사무실', UPP[i] === '안전보건팀' ? '#2e7d4f' : '#1f3a5f'), 0.62, 0.16, u.door[0], u.y0 + 2.36, u.door[2] + 0.05);
    // 실외기: 아래층은 땅에, 위층은 복도 끝 벽에
    bx(ODU, OX0 + i * CW + 1.55, OX0 + i * CW + 2.1, 0.08, 0.66, OZ1 + 0.05, OZ1 + 0.38); bx(GRILL, OX0 + i * CW + 1.6, OX0 + i * CW + 1.92, 0.2, 0.52, OZ1 + 0.38, OZ1 + 0.4);
  }
  const yU = 0.08 + CH + 0.04; // 2층 바닥
  // 2층 복도 (앞으로 1.1m) · 기둥 · 난간 · 계단 (오른쪽 끝)
  const WZ1 = OZ1 + 1.1, SX0 = X0 - 2.1, SX1 = X0 - 0.9, SZ1 = WZ1 + 4.2;
  bx(STEEL, OX0, SX1, yU - 0.1, yU, OZ1, WZ1); bx(mat(0x7a828c, { tex: 'steel', metal: 0.5 }), OX0, SX1, yU, yU + 0.02, OZ1, WZ1);
  for (let x = OX0 + 0.1; x <= SX1; x += 3) beam(STEEL, [x, 0.08, WZ1 - 0.08], [x, yU - 0.1, WZ1 - 0.08], 0.1, 0.1);
  [yU + 0.55, yU + 1.05].forEach(y => bx(RAIL, OX0, SX0, y - 0.025, y + 0.025, WZ1 - 0.05, WZ1));
  bx(RAIL, OX0, OX0 + 0.05, yU, yU + 1.05, OZ1, WZ1);
  for (let x = OX0; x <= SX0 + 0.01; x += 1.5) bx(RAIL, x, x + 0.04, yU, yU + 1.05, WZ1 - 0.05, WZ1);
  // 계단: 옆판 둘 · 디딤판 · 손잡이
  [SX0, SX1 - 0.08].forEach(x => { beam(STEEL, [x + 0.04, 0.08, SZ1], [x + 0.04, yU, WZ1], 0.08, 0.25); beam(RAIL, [x + 0.04, 1.0, SZ1], [x + 0.04, yU + 1.0, WZ1], 0.05, 0.05); bx(RAIL, x + 0.02, x + 0.06, 0.08, 1.0, SZ1 - 0.04, SZ1); });
  for (let k = 1; k < 15; k++) { const f = k / 15, z = SZ1 + (WZ1 - SZ1) * f, y = 0.08 + (yU - 0.08) * f; bx(mat(0x6b737d, { tex: 'steel', metal: 0.5 }), SX0 + 0.08, SX1 - 0.08, y - 0.03, y, z - 0.14, z + 0.14); }
  bx(STEEL, SX0, SX1, yU - 0.1, yU, WZ1 - 1.0, WZ1); // 계단참
  // 현장사무소 간판 (지붕 위 앞쪽)
  const yTop = yU + CH;
  const bannerT = textTex(2048, 220, (g, w, h) => {
    g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f4e8c'; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
    // 녹십자
    g.fillStyle = '#2e9e5b'; g.fillRect(60, 70, 100, 30); g.fillRect(95, 35, 30, 100);
    g.fillStyle = '#1f4e8c'; g.textBaseline = 'middle'; g.textAlign = 'left'; fitText(g, COMPANY, 200, 82, 700, 64, 800);
    g.fillStyle = '#26282b'; fitText(g, `${project} 현장사무소`, 200, 158, 1180, 52, 700);
    g.textAlign = 'right'; g.fillStyle = '#c62f3a'; fitText(g, '안전제일 · 품질제일', w - 50, 110, 560, 64, 800);
  });
  const bw = nC * CW - 0.6; bx(FRAME, OX0 + 0.3, OX0 + 0.3 + bw, yTop + 0.02, yTop + 1.18, OZ1 - 0.3, OZ1 - 0.22);
  sign(bannerT, bw - 0.1, 1.06, OX0 + 0.3 + bw / 2, yTop + 0.6, OZ1 - 0.215);
  // 복도 난간 현수막
  const flagT = textTex(1536, 128, (g, w, h) => { g.fillStyle = '#fffdf2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c62f3a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#c62f3a'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, '안전은 모두의 약속 · 무재해 목표 달성!', w / 2, h / 2 + 3, w - 80, 66, 800); });
  const fw = Math.min(nC * CW - 2, 14); sign(flagT, fw, fw / 12, (OX0 + SX0) / 2, yU + 0.62, WZ1 + 0.02);

  // ---------- 근로자 휴게실 ----------
  const benches = [];
  if (restOn) {
    const c = container(RX0, 0.08, REST);
    sign(textTex(512, 96, (g, w, h) => { g.fillStyle = '#2e7d4f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, '근로자 휴게실', w / 2, h / 2 + 3, w - 30, 56, 800); }), 1.8, 0.34, (RX0 + RX1) / 2, c.y1 + 0.32, OZ1 + 0.02);
    bx(FRAME, RX0 + 0.2, RX1 - 0.2, c.y1 + 0.12, c.y1 + 0.52, OZ1 - 0.02, OZ1);
    // 차양막: 기둥 넷 + 기운 천
    const cz = OZ1 + 3.6;
    [RX0 + 0.1, RX1 - 0.1].forEach(x => { cyl(POST, x, 0.08, 2.5, cz, 0.05); });
    beam(TARP, [RX0 + 0.05, 2.62, OZ1 + 0.05], [RX0 + 0.05, 2.45, cz + 0.1], 0.04, 0.04);
    { const m = TARP, o = new THREE.Mesh(BOX, m); o.position.set((RX0 + RX1) / 2, 2.55, (OZ1 + cz) / 2); o.scale.set(RX1 - RX0, 0.03, cz - OZ1 + 0.2); o.rotation.x = Math.atan2(0.17, cz - OZ1); grp.add(o); }
    // 벤치 둘 (앞을 보고 앉는다)
    [OZ1 + 1.2, OZ1 + 2.55].forEach(z => { bx(WOOD, RX0 + 0.6, RX0 + 3.4, 0.42, 0.47, z - 0.2, z + 0.2); [RX0 + 0.8, RX0 + 3.2].forEach(x => bx(STEEL, x - 0.04, x + 0.04, 0.08, 0.42, z - 0.17, z + 0.17)); benches.push([RX0 + 1.2, z], [RX0 + 2.0, z], [RX0 + 2.8, z]); });
    // 정수기 · 얼음 상자 · 선풍기 · 쓰레기통
    bx(mat(0xf2f2ef), RX1 - 1.0, RX1 - 0.6, 0.08, 1.2, OZ1 + 0.15, OZ1 + 0.55); cyl(mat(0x7fb8e0, { op: 0.75 }), RX1 - 0.8, 1.2, 1.6, OZ1 + 0.35, 0.15);
    bx(BLUE, RX0 + 3.7, RX0 + 4.5, 0.08, 0.55, OZ1 + 0.3, OZ1 + 0.75); bx(mat(0xf2f2ef), RX0 + 3.68, RX0 + 4.52, 0.55, 0.62, OZ1 + 0.28, OZ1 + 0.77);
    cyl(STEEL, RX1 - 1.6, 0.08, 1.25, OZ1 + 2.9, 0.03); { const f = cyl(mat(0xe8e8e4), RX1 - 1.6, 1.15, 1.6, OZ1 + 2.9, 0.22); f.rotation.x = Math.PI / 2; f.scale.set(0.44, 0.06, 0.44); f.position.y = 1.36; }
    cyl(mat(0x3d6b4f), RX1 - 0.4, 0.08, 0.8, OZ1 + 3.3, 0.25);
  }
  // ---------- TBM 마당: 안전 게시판 ----------
  // 게시판은 공정이 바뀌면 다시 그린다 (오늘 작업 · 위험 요인)
  const tbmC = document.createElement('canvas'); tbmC.width = 1024; tbmC.height = 600;
  const tbmT = new THREE.CanvasTexture(tbmC); tbmT.colorSpace = THREE.SRGBColorSpace; tbmT.anisotropy = 4; own.tex.push(tbmT);
  let tbmPg = null;
  function drawTbm(pg) {
    if (tbmPg === pg) return; tbmPg = pg;
    const g = tbmC.getContext('2d'), w = 1024, h = 600;
    g.fillStyle = '#f9f8f3'; g.fillRect(0, 0, w, h); g.fillStyle = '#2e7d4f'; g.fillRect(0, 0, w, 110);
    g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left'; fitText(g, 'TBM  작업 전 안전점검 회의', 40, 58, w - 80, 56, 800);
    const rows = [['오늘 작업', WORK[pg]], ['위험 요인', RISK[pg].join(' · ')], ['안전 대책', '안전대 고리 체결 · 신호수 배치 · 작업 반경 통제'], ['건강 확인', '혈압·음주 확인 · 폭염 시 물·그늘·휴식']];
    g.strokeStyle = '#26282b'; g.lineWidth = 3;
    rows.forEach(([a, b], i) => { const y = 140 + i * 108; g.strokeRect(30, y, w - 60, 96); g.fillStyle = '#e7efe9'; g.fillRect(32, y + 2, 200, 92); g.fillStyle = '#26282b'; fitText(g, a, 50, y + 50, 170, 38, 800); fitText(g, b, 255, y + 50, w - 320, 36, 600); });
    tbmT.needsUpdate = true;
  }
  drawTbm('struct');
  bx(FRAME, TBX - 1.4, TBX + 1.4, 0.9, 2.55, TBZ - 0.06, TBZ); [TBX - 1.3, TBX + 1.3].forEach(x => bx(STEEL, x - 0.04, x + 0.04, 0.05, 2.55, TBZ - 0.08, TBZ - 0.02));
  sign(tbmT, 2.7, 1.58, TBX, 1.72, TBZ + 0.005);
  // ---------- 국기 게양대 (태극기 · 회사기 · 안전기) ----------
  const flagsT = [
    textTex(300, 200, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.save(); g.translate(w / 2, h / 2); g.rotate(Math.atan2(2, 3)); const r = 50;
      g.fillStyle = '#cd2e3a'; g.beginPath(); g.arc(0, 0, r, Math.PI, 0); g.fill(); g.fillStyle = '#0047a0'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI); g.fill();
      g.fillStyle = '#cd2e3a'; g.beginPath(); g.arc(-r / 2, 0, r / 2, 0, Math.PI); g.fill(); g.fillStyle = '#0047a0'; g.beginPath(); g.arc(r / 2, 0, r / 2, Math.PI, Math.PI * 2); g.fill();
      g.restore(); g.fillStyle = '#111';
      const tri = (cx, cy, ang, pat) => { g.save(); g.translate(cx, cy); g.rotate(ang); pat.forEach((solid, k) => { const y = -14 + k * 11; if (solid) g.fillRect(-25, y, 50, 7); else { g.fillRect(-25, y, 22, 7); g.fillRect(3, y, 22, 7); } }); g.restore(); };
      const a = Math.atan2(2, 3);
      tri(62, 42, a + Math.PI / 2, [1, 1, 1]); tri(w - 62, h - 42, a + Math.PI / 2, [0, 0, 0]); tri(w - 62, 42, -a + Math.PI / 2, [0, 1, 0]); tri(62, h - 42, -a + Math.PI / 2, [1, 0, 1]);
    }),
    textTex(300, 200, (g, w, h) => { g.fillStyle = '#1f4e8c'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.arc(80, 100, 36, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1f4e8c'; g.beginPath(); g.arc(92, 92, 26, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.textBaseline = 'middle'; fitText(g, '누리', 130, 102, 150, 64, 800); }),
    textTex(300, 200, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#2e9e5b'; g.fillRect(w / 2 - 22, 30, 44, 140); g.fillRect(w / 2 - 70, h / 2 - 22, 140, 44); }),
  ];
  const flags = [];
  const FZ = Z1 - 1.0;
  flagsT.forEach((t, k) => {
    const fx = OX0 + 0.8 + k * 1.7; cyl(ALU, fx, 0, 7.6, FZ, 0.045); cyl(mat(0xd9b44a, { metal: 0.6 }), fx, 7.6, 7.75, FZ, 0.07);
    const piv = new THREE.Group(); piv.position.set(fx, 6.85, FZ); grp.add(piv);
    const m = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.75 }); own.mats.push(m);
    const f = new THREE.Mesh(PL, m); f.scale.set(1.35, 0.9, 1); f.position.x = 0.7; piv.add(f); flags.push(piv);
  });
  // ---------- 직원 차량 · 1톤 트럭 ----------
  const carC = [0xe7e7ea, 0x2b2d33, 0x9aa3ad, 0x3f4a5f];
  const PZ = Z1 - 3.2;
  for (let k = 0, x = XL + 2.2; k < 4 && x < X0 - 9; x += 2.9) {
    if (x > OX0 - 0.6 && x < OX0 + 5.2) continue; // 게양대 앞은 비운다
    const tr = k === 3, c = tr ? 0x2f6fb5 : carC[k % carC.length]; k++;
    if (tr) { bx(mat(c, { metal: 0.35, rough: 0.4 }), x - 0.85, x + 0.85, 0.35, 1.95, PZ + 1.05, PZ + 2.3); bx(GLASS, x - 0.8, x + 0.8, 1.25, 1.85, PZ + 2.3, PZ + 2.33); bx(mat(0xb9bcc0, { metal: 0.5 }), x - 0.85, x + 0.85, 0.55, 0.95, PZ - 2.0, PZ + 1.0); }
    else { bx(mat(c, { metal: 0.45, rough: 0.35 }), x - 0.9, x + 0.9, 0.3, 1.0, PZ - 2.25, PZ + 2.25); bx(GLASS, x - 0.8, x + 0.8, 1.0, 1.45, PZ - 1.0, PZ + 1.2); }
    [[-0.9, PZ - 1.5], [0.9, PZ - 1.5], [-0.9, PZ + 1.5], [0.9, PZ + 1.5]].forEach(([dx, z]) => bx(mat(0x1b1b1e), x + dx - 0.12, x + dx + 0.12, 0, 0.62, z - 0.31, z + 0.31));
  }
  // ---------- 그물 울타리 (왼쪽 · 앞쪽, 대로 쪽 입구는 비운다) ----------
  const fence = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 2.5)); for (let i = 0; i <= n; i++) { const f = i / n; cyl(POST, x0 + (x1 - x0) * f, 0, 1.8, z0 + (z1 - z0) * f, 0.035); } beam(POST, [x0, 1.78, z0], [x1, 1.78, z1], 0.04, 0.04); const o = beam(NET, [(x0 + x1) / 2, 0.15, (z0 + z1) / 2], [(x0 + x1) / 2, 1.75, (z0 + z1) / 2], 0.01, 1); o.scale.set(Math.abs(x1 - x0) < 0.1 ? 0.01 : L, 1.6, Math.abs(x1 - x0) < 0.1 ? L : 0.01); o.quaternion.identity(); };
  fence(XL, Z0, XL, Z1); fence(XL, Z1, X0 - 7.5, Z1); fence(X0 - 0.1, Z0 + 6.5, X0 - 0.1, Z1 - 0.1);

  // ---------- 현장 출입구: 공사 안내판(현장소장 이름) · 게이트 위 안전 간판 ----------
  const dt0 = sc.t0 instanceof Date ? sc.t0 : new Date(sc.t0 || Date.now()), months = (sc.R && sc.R.S && sc.R.S.months) || Math.round((sc.end || 900) / 30.4);
  const ymS = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  const dEnd = new Date(dt0.getTime()); dEnd.setMonth(dEnd.getMonth() + months);
  const infoT = textTex(900, 640, (g, w, h) => {
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f4e8c'; g.fillRect(0, 0, w, 96);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, '건 축 공 사 안 내', w / 2, 50, w - 60, 54, 800);
    const rows = [['공 사 명', project], ['건 축 주', '누리개발(주)'], ['설 계 자', '해솔건축사사무소'], ['감 리 자', `바른감리(주) · 책임감리원 ${names.gamri}`], ['시 공 자', COMPANY], ['현장소장', names.boss], ['공사기간', `${ymS(dt0)} ~ ${ymS(dEnd)} (${months}개월)`], ['안전 관리', `안전관리자 ${names.safety}`]];
    g.textAlign = 'left'; g.strokeStyle = '#9aa0a8'; g.lineWidth = 2;
    rows.forEach(([a, b], i) => { const y = 112 + i * 64; g.strokeRect(20, y, w - 40, 60); g.fillStyle = i === 5 ? '#fff4d6' : '#eef1f5'; g.fillRect(22, y + 2, 190, 56); g.fillStyle = '#26282b'; fitText(g, a, 40, y + 32, 160, 30, 800); g.fillStyle = i === 5 ? '#c62f3a' : '#26282b'; fitText(g, b, 232, y + 32, w - 280, 30, i === 5 ? 800 : 600); });
  });
  const ix = gx + 0.3 + 0.01, iz = gz0 - 5;
  bx(FRAME, ix - 0.04, ix, 0.9, 3.0, iz - 1.55, iz + 1.55); sign(infoT, 2.95, 2.0, ix + 0.005, 1.95, iz, Math.PI / 2);
  [iz - 1.5, iz + 1.5].forEach(z => bx(STEEL, ix - 0.05, ix + 0.03, 0, 0.95, z - 0.04, z + 0.04));
  const gateT = textTex(1024, 128, (g, w, h) => { g.fillStyle = '#f2c94c'; g.fillRect(0, 0, w, h); g.fillStyle = '#26282b'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, `안전제일  ·  ${COMPANY}  ·  ${project}`, w / 2, h / 2 + 3, w - 40, 60, 800); });
  sign(gateT, gz1 - gz0 - 2, 0.78, gx + 0.13, 4.0, (gz0 + gz1) / 2, Math.PI / 2);

  const statics = [];
  grp.traverse(o => { if (o.isMesh) statics.push(o); });

  // ---------- 사람 ----------
  const TB = { n: 0, spots: [] };
  const lkOf = (sd, o = {}) => ({ vest: VESTS[sd % VESTS.length], shirt: SHIRTS[(sd >> 1) % SHIRTS.length], pants: PANTS[(sd >> 2) % PANTS.length], skin: SKIN[sd % SKIN.length], hat: HATS.work, ...o });
  const LK = {
    boss: { vest: 0x1f3a5f, shirt: 0x2b2d33, pants: 0x2a2e36, skin: SKIN[1], hat: HATS.boss },
    safety: { vest: 0x2e9e5b, shirt: 0x2c3a55, pants: 0x2a3346, skin: SKIN[2], hat: HATS.boss },
    gamri: { vest: 0x2f6fb5, shirt: 0x55606e, pants: 0x3a3f47, skin: SKIN[0], hat: HATS.boss },
    gongmu: { vest: 0x1f3a5f, shirt: 0xe7e7ea, pants: 0x2a2e36, skin: SKIN[2], hat: HATS.boss },
    engineer: { vest: 0x1f3a5f, shirt: 0x3d4f6b, pants: 0x2a3346, skin: SKIN[2], hat: HATS.boss },
  };
  // 걸어서 옮기기: 경로(점 목록)를 따라 거리 s만큼
  const along = (pts, s) => {
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s <= L || i === pts.length - 1) { const f = clamp(s / (L || 1), 0, 1); return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), done: s > L && i === pts.length - 1 }; } s -= L; }
    const q = pts[pts.length - 1]; return { x: q[0], z: q[1], yaw: 0, done: true };
  };
  const plen = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  // 게이트로 가는 길 (단지 대로 쪽 입구 → 보도 → 게이트 안)
  const toGate = [[X0 - 0.6, Z0 + 3.2], [X0 + 0.7, Z0 + 2.6], [gx + 0.7, Z0 + 0.4], [gx + 0.7, gz1 - 1.6], [gx - 2.2, gz1 - 2.6]];
  const CYC = 110;
  // st: { T, on, crewN, wpId, dlv(자재 반입 중), month }
  function frame(st) {
    const { T } = st;
    grp.visible = !!st.on;
    flags.forEach((f, k) => { f.rotation.y = 0.35 + 0.22 * Math.sin(T * 1.1 + k * 1.7); f.children[0].scale.x = 1.35 * (0.93 + 0.07 * Math.sin(T * 3.1 + k)); });
    const people = [], labels = [];
    if (!st.on) return { people, labels, life };
    const u = ((T % CYC) + CYC) % CYC;
    // TBM 인원: 작업조 규모에 맞춰 10~16명, 3~4줄
    const n = clamp(Math.round(st.crewN || 12), 8, 16), perRow = Math.min(6, Math.ceil(n / 3));
    if (TB.n !== n) { TB.n = n; TB.spots = []; for (let i = 0; i < n; i++) { const r = Math.floor(i / perRow), c = i % perRow, nr = Math.min(perRow, n - r * perRow); TB.spots.push([TBX + (c - (nr - 1) / 2) * 0.95 + (r % 2) * 0.2, TBZ + 2.4 + r * 1.0]); } }
    const ph = u < 18 ? 'gather' : u < 62 ? 'brief' : u < 82 ? 'stretch' : u < 90 ? 'cheer' : u < 108 ? 'go' : 'gone';
    const pg = phaseGroup(st.wpId || ''); drawTbm(pg);
    TB.spots.forEach(([sx, sz], i) => {
      const sd = seed * 7 + i * 13 + 11, tr = TBR[pg] || TBR.struct, role = i === 0 ? 'engineer' : tr[Math.floor(hsh(sd, 9) * tr.length)], lk = i === 0 ? LK.engineer : lkOf(sd, { hat: role === 'elec' || role === 'mep' ? HATS.elec : role === 'signal' ? HATS.sig : HATS.work });
      const route = [[sx, sz], [sx + (X0 - 0.6 - sx) * 0.5, Math.max(sz, TBZ + 1.0)], ...toGate];
      const L = plen(route), spd = 1.25 + hsh(sd, 1) * 0.3, delay = hsh(sd, 2) * 3;
      let x = sx, z = sz, yaw = Math.PI, act = 'listen', pph = 0;
      if (ph === 'gather') { const s = L - Math.max(0, u - delay) * spd * 1.4 - 0.001; if (s > L - 0.05) return; const p = along(route, Math.max(0, s)); x = p.x; z = p.z; yaw = p.yaw + Math.PI; act = s > 0.05 ? 'walk' : 'listen'; pph = u * spd * 4.6; }
      else if (ph === 'brief') act = (i * 7 + Math.floor(u / 9)) % 11 === 0 ? 'arms' : 'listen';
      else if (ph === 'stretch') act = 'stretch';
      else if (ph === 'cheer') act = 'cheer';
      else if (ph === 'go') { const s = Math.max(0, u - 90 - delay * 0.6) * spd * 1.4; const p = along(route, s); if (p.done) return; x = p.x; z = p.z; yaw = p.yaw; act = s > 0 ? 'walk' : 'listen'; pph = s * 4.6; }
      else return;
      people.push({ x, y: 0.08, z, yaw, act, t: T + i * 0.37, ph: pph, lk, pid: 'tbm' + i, role, seed: sd, kind: null });
    });
    // TBM 진행 (안전관리자)
    const lead = { x: TBX - 0.2, z: TBZ + 0.9 };
    const lAct = ph === 'brief' ? (Math.floor(u / 7) % 3 === 2 ? 'point' : 'talk') : ph === 'stretch' ? 'stretch' : ph === 'cheer' ? 'cheer' : 'listen';
    people.push({ x: lead.x, y: 0.08, z: lead.z, yaw: 0, act: ph === 'gone' || ph === 'gather' ? 'point' : lAct, t: T, ph: 0, lk: LK.safety, pid: 'safety', role: 'safety', seed: seed + 2 });
    // 현장소장 · 감리원: TBM 동안 옆에, 그 밖에는 사무소 앞에서 이야기
    const door = doors[0] || [OX0 + 1, 0, OZ1];
    const atTbm = ph === 'brief' || ph === 'stretch' || ph === 'cheer';
    const bA = [TBX + 2.2, TBZ + 1.2], bB = [door[0] + 0.4, OZ1 + 1.0], gA = [TBX + 3.2, TBZ + 1.3], gB = [door[0] + 1.5, OZ1 + 1.15];
    const tw = (from, to, k) => [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
    const mv = u < 18 ? clamp((u - 12) / 6, 0, 1) : u >= 90 && u < 96 ? 1 - clamp((u - 90) / 6, 0, 1) : atTbm ? 1 : 0; // 0 = 사무소 앞, 1 = TBM 옆
    const walking = (u >= 12 && u < 18) || (u >= 90 && u < 96);
    const bP = tw(bB, bA, mv), gP = tw(gB, gA, mv), talkTurn = Math.floor(u / 6) % 2;
    people.push({ x: bP[0], y: 0.08, z: bP[1], yaw: walking ? Math.atan2(bA[0] - bB[0], bA[1] - bB[1]) + (u < 18 ? 0 : Math.PI) : atTbm ? 0.35 : Math.PI / 2, act: walking ? 'walk' : atTbm ? (ph === 'brief' ? 'arms' : ph) : talkTurn ? 'talk' : 'listen', t: T + 1.3, ph: u * 4.6, lk: LK.boss, pid: 'boss', role: 'boss', seed: seed + 1 });
    people.push({ x: gP[0], y: 0.08, z: gP[1], yaw: walking ? Math.atan2(gA[0] - gB[0], gA[1] - gB[1]) + (u < 18 ? 0 : Math.PI) : atTbm ? 0.2 : -Math.PI / 2, act: walking ? 'walk' : atTbm ? 'listen' : talkTurn ? 'listen' : 'talk', t: T + 2.1, ph: u * 4.6 + 1, lk: LK.gamri, pid: 'gamri', role: 'gamri', seed: seed + 3 });
    // 공무 대리: 2층 복도에서 통화하며 왔다 갔다
    { const a = OX0 + 1.5, b = SX0 - 0.6, L = Math.max(1, b - a), P = 2 * (L / 0.7) + 10, v = (T * 1 + 7) % P; let x, yaw, act;
      if (v < 5) { x = a; yaw = 0; act = 'phone'; } else if (v < 5 + L / 0.7) { x = a + (v - 5) * 0.7; yaw = Math.PI / 2; act = 'phone_w'; } else if (v < 10 + L / 0.7) { x = b; yaw = 0; act = 'phone'; } else { x = b - (v - 10 - L / 0.7) * 0.7; yaw = -Math.PI / 2; act = 'phone_w'; }
      people.push({ x, y: yU + 0.02, z: OZ1 + 0.6, yaw, act, t: T, ph: v * 3.2, lk: LK.gongmu, pid: 'gongmu', role: 'gongmu', seed: seed + 4 }); }
    // 휴게실: 앉아 쉬는 사람 · 물 마시는 사람 · 통화 · 정수기 옆에서 이야기
    if (restOn) {
      const R0 = [['sit', 'form'], ['drink', 'foreign'], ['rest', 'rebar'], ['sit', 'labor']];
      [0, 2, 4, 5].forEach((bi, k) => { const b = benches[bi]; if (!b) return; const sd = seed * 3 + k * 29 + 5; people.push({ x: b[0], y: 0.08, z: b[1] + 0.05, yaw: 0, act: R0[k][0], t: T + k * 2.3, ph: 0, lk: lkOf(sd), pid: 'rest' + k, role: R0[k][1], seed: sd }); });
      const ca = [RX1 - 1.3, OZ1 + 1.4], cb = [RX1 - 0.4, OZ1 + 1.9], turn = Math.floor((T + 3) / 7) % 2;
      people.push({ x: ca[0], y: 0.08, z: ca[1], yaw: Math.atan2(cb[0] - ca[0], cb[1] - ca[1]), act: turn ? 'talk' : 'listen', t: T + 0.7, ph: 0, lk: lkOf(seed + 91), pid: 'chatA', role: 'pour', seed: seed + 91 });
      people.push({ x: cb[0], y: 0.08, z: cb[1], yaw: Math.atan2(ca[0] - cb[0], ca[1] - cb[1]), act: turn ? 'listen' : 'talk', t: T + 1.9, ph: 0, lk: { ...lkOf(seed + 97), cup: 0xffffff }, pid: 'chatB', role: 'foreman', seed: seed + 97 });
    }
    // 자재 반입 중: 게이트 안에서 공사 기사와 화물차 기사가 하역을 의논
    if (st.dlv) {
      const a = [gx - 2.6, gz0 - 3.8], b = [gx - 1.5, gz0 - 4.5];
      people.push({ x: a[0], y: 0.08, z: a[1], yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), act: 'inspect', t: T, ph: 0, lk: LK.engineer, pid: 'eng2', role: 'engineer', seed: seed + 5 });
      people.push({ x: b[0], y: 0.08, z: b[1], yaw: Math.atan2(a[0] - b[0], a[1] - b[1]), act: 'talk', t: T + 0.4, ph: 0, lk: { vest: 0xc9f22e, shirt: 0x6b6f75, pants: 0x3a3f47, skin: SKIN[3], hat: HATS.work }, pid: 'driver', role: 'trailer', seed: seed + 61 });
    }
    // 이름표
    labels.push({ t: `현장사무소 · 현장소장 ${names.boss}`, p: [OX0 + nC * CW * 0.5, yTop + 1.9, OZ1], cls: 'eq who', pick: 'boss', role: 'boss', seed: seed + 1, near: 260 });
    const tbmTxt = { gather: 'TBM · 모이는 중', brief: `TBM · 오늘 위험 요인 공유 (${RISK[pg][Math.floor(u / 17) % 3]})`, stretch: 'TBM · 체조', cheer: "TBM · 안전 구호 '무재해 좋아! 좋아! 좋아!'", go: '작업 투입', gone: '' }[ph];
    if (tbmTxt) labels.push({ t: `${tbmTxt} · ${n}명`, p: [TBX, 3.3, TBZ + 2.6], cls: 'eq crew', near: 120 });
    if (restOn) labels.push({ t: '근로자 휴게실', p: [(RX0 + RX1) / 2, 3.6, OZ1 + 1.5], cls: 'eq dim', near: 100 });
    return { people, labels, life, work: WORK[pg] };
  }
  return {
    frame, life, names, project, group: grp,
    dispose() { root.remove(grp); own.geos.forEach(g => g.dispose()); own.mats.forEach(m => m.dispose()); own.tex.forEach(t => t.dispose()); statics.length = 0; },
  };
}
