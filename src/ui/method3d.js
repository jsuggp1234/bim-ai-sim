// 공법별 3D 장면: 공법마다 장비·부재·시공 순서를 다르게 그려, 같은 공종이라도 방법의 차이가 한눈에 보이게 한다.
// build3d.js가 공통 장면(땅·골조·외장·크레인)을 만든 뒤 buildMethods()를 부르고, 매 프레임 frame(S)로
// 공통 부재를 숨기거나 덮어쓴 다음 공법 고유의 장비·부재·이름표를 더한다.
import * as THREE from 'three';
import { keepTriplanar } from './simtex.js';
import { waterSurface } from '../sim/scene/water.js';
import { shape, mastSectionGeo, jibSectionGeo, cjibSectionGeo, catHeadGeo, slewGeo, cabGeo, cabGlassGeo, counterweightGeo, cwFrameGeo, hookBlockGeo, craneBaseGeo, hoistMastGeo, hoistCarGeo, hoistMeshGeo, meshTex, latticeBoomGeo, trackGeo, trackWheelsGeo, bucketGeo, clamHalfGeo, moundGeo, MAST_H, JIB_L, CJIB_L, SLEW_H, HMAST_H } from './kit3d.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (x) => x - Math.floor(x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hsh = (i, k = 0) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
const yawOf = (tx, tz) => Math.atan2(-tz, tx); // 로컬 +x를 (tx, tz) 방향으로
const EQC = 0xf0b429;

// ---------- 무늬 ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const latticeTex = () => canvasTex(64, 64, (x) => { x.clearRect(0, 0, 64, 64); x.strokeStyle = '#fff'; x.lineWidth = 9; x.strokeRect(0, 0, 64, 64); x.lineWidth = 5; x.beginPath(); x.moveTo(0, 64); x.lineTo(64, 0); x.stroke(); });
const plankTex = () => canvasTex(64, 64, (x) => { const c = ['#b98a52', '#a77942', '#c39560', '#ad7f48', '#b48650', '#9f733f']; for (let i = 0; i < 6; i++) { x.fillStyle = c[i]; x.fillRect(0, i * 64 / 6, 64, 64 / 6); } x.fillStyle = '#4b331b'; for (let i = 0; i < 6; i++) x.fillRect(0, i * 64 / 6, 64, 1.8); });
const stripeTex = () => canvasTex(64, 64, (x) => { x.fillStyle = '#eceff3'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#e5484d'; x.lineWidth = 9; for (let k = -64; k < 128; k += 32) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 64, 64); x.stroke(); } });
const corrTex = () => canvasTex(64, 8, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#7f8792' : '#c3c9d0'; x.fillRect(i * 8, 0, 8, 8); } });
const gridT = (color, n, lw, bg) => canvasTex(64, 64, (x) => { x.clearRect(0, 0, 64, 64); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, 64, 64); } x.strokeStyle = color; x.lineWidth = lw; for (let i = 0; i <= n; i++) { const p = i * 64 / n; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 64); x.moveTo(0, p); x.lineTo(64, p); x.stroke(); } });

// 외장 재료 무늬 (한 칸 = 모듈 폭 × 한 층). cell: 한 칸의 폭(m)
export function skinTex(type) {
  const mk = (draw, cell) => { const t = canvasTex(128, 128, draw); t.userData.cell = cell; return t; };
  if (type === 'unitcw') return mk((x) => { x.fillStyle = '#a3b9cf'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#f4f7fa'; x.fillRect(0, 0, 8, 128); x.fillRect(0, 0, 128, 6); x.fillRect(0, 90, 128, 5); x.fillStyle = '#c9d6e3'; x.fillRect(8, 6, 120, 6); }, 1.5);
  if (type === 'stickcw') return mk((x) => { x.fillStyle = '#a3b9cf'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#eef2f6'; x.fillRect(0, 0, 4, 128); x.fillRect(62, 0, 4, 128); x.fillRect(0, 36, 128, 3); x.fillRect(0, 100, 128, 3); x.fillRect(0, 0, 128, 3); }, 1.5);
  if (type === 'pcpanel') return mk((x) => { x.fillStyle = '#d3cfc6'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(90,85,75,${0.05 + 0.08 * hsh(i, 3)})`; x.fillRect(128 * hsh(i, 1), 128 * hsh(i, 2), 2, 2); } x.fillStyle = '#ece9e2'; x.fillRect(20, 26, 88, 66); x.fillStyle = '#3f4a57'; x.fillRect(25, 31, 78, 56); x.fillStyle = '#6f7a86'; x.fillRect(62, 31, 3, 56); x.fillStyle = '#77736b'; x.fillRect(0, 0, 3, 128); x.fillRect(0, 0, 128, 3); }, 3);
  if (type === 'metal') return mk((x) => { x.fillStyle = '#c3ccd6'; x.fillRect(0, 0, 128, 128); for (let y = 6; y < 128; y += 16) { x.fillStyle = '#e6ebf0'; x.fillRect(0, y, 128, 3); x.fillStyle = '#8e99a6'; x.fillRect(0, y + 3, 128, 2); } x.fillStyle = '#6f7a86'; x.fillRect(0, 0, 4, 128); }, 3);
  if (type === 'wet') return mk((x) => { x.fillStyle = '#e1d6c1'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#b4a68d'; for (let r = 0; r < 4; r++) { x.fillRect(0, r * 32, 128, 2); const o = r % 2 ? 32 : 0; for (let c2 = o; c2 < 128; c2 += 64) x.fillRect(c2, r * 32, 2, 32); } x.fillStyle = '#f1ece2'; x.fillRect(34, 30, 60, 62); x.fillStyle = '#3a4552'; x.fillRect(38, 34, 52, 54); }, 3);
  return null;
}
function roofTex(type) {
  if (type === 'asphalt' || type === 'hybrid') return canvasTex(64, 64, (x) => { x.fillStyle = type === 'hybrid' ? '#2f8f5a' : '#5d5f66'; x.fillRect(0, 0, 64, 64); x.fillStyle = type === 'hybrid' ? '#277a4c' : '#46484e'; x.fillRect(0, 0, 64, 6); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(0, 6, 64, 1); });
  if (type === 'metal') return canvasTex(64, 64, (x) => { x.fillStyle = '#a9b6c4'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#e3e8ee'; x.fillRect(0, 0, 5, 64); x.fillStyle = '#7d8896'; x.fillRect(5, 0, 2, 64); });
  if (type === 'urethane') return canvasTex(64, 64, (x) => { x.fillStyle = '#3fae6a'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.04 + 0.06 * hsh(i, 5)})`; x.beginPath(); x.arc(64 * hsh(i, 6), 64 * hsh(i, 7), 3 + 4 * hsh(i, 8), 0, 7); x.fill(); } });
  return null;
}

function wedgeGeo() { // 직각 삼각기둥: (0,0) (0,−1) (1,−1) 단면, z 0→1
  const A = [0, 0, 0], B = [0, -1, 0], C = [1, -1, 0], A2 = [0, 0, 1], B2 = [0, -1, 1], C2 = [1, -1, 1];
  const t = [A, C, B, A2, B2, C2, A, B, B2, A, B2, A2, B, C, C2, B, C2, B2, A, A2, C2, A, C2, C];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(t.flat(), 3)); g.computeVertexNormals(); return g;
}

// 공법별 이름표 (현재 공종의 공법만)
const SIG = {
  survey: { spt: 'SPT 시추 · 63.5kg 해머 76cm 낙하 → N값', geo: '시추 + 물리탐사 · 전극 배열 → 비저항 단면', cpt: 'CPTu 콘 연속 압입 → 연속 지층 곡선', ai: 'AI 3D 지반 모델 · 드론 스캔 + 시추 학습' },
  improve: { pbd: 'PBD 배수재 1.5m 격자 + 선행재하 성토', vac: '진공압밀 · 기밀 시트 −80kPa', scp: 'SCP 모래다짐말뚝 · 진동 케이싱', dcm: 'DCM 심층혼합 · 2축 교반 Ø1.6m' },
  wall: { hpile: 'H형강 1.8m 간격 + 토류판 (굴착하며 끼움)', sheet: '강널말뚝 · 진동 해머 연속 압입 (소음·진동)', cip: 'CIP Ø500 현장타설 말뚝 열 + 캡빔', scw: 'SCW 3축 오거 소일시멘트 벽 + H형강', dwall: '지하연속벽 · 2.8m 패널 · 안정액 굴착 → 콘크리트', open: '사면 개착 1:1.2 · 비닐 보호 + 마대', nail: '소일네일 · 1.5m씩 굴착 → 천공·네일·숏크리트' },
  support: { strut: '버팀보 H형강 · 띠장 + 잭 선행하중 + 중간말뚝', anchor: '어스앵커 · 굴착 안이 비어 작업이 넓음', raker: '레이커 경사 버팀 + 킥커 블록 · 가장자리 흙 남김', topdown: '역타 · 지하 슬래브가 버팀 · 개구부로 반출', sps: 'SPS 영구 철골 버팀 · 지하 보 격자가 그대로 구조체', self: '자립식 · 지보 없이 벽만으로 버팀' },
  water: { none: '차수 대책 없음', grout: '차수 그라우팅 · 벽 뒤 주입 구근', jsp: '고압분사 JSP Ø1.8m 차수 기둥 커튼', dewater: '디워터링 · 딥웰 양수 → 지하수위 강하', drain: '영구배수 · 드레인 매트 + 집수정', anchor: '부력 앵커 · 매트 아래 영구 앵커' },
  excav: { normal: '백호 굴착 + 클램셸 반출', blast: '제어 발파 · 천공 → 장약 → 방폭 매트', splitter: '무진동 유압 할암 · 천공 후 쪼갬', mix: '상부 토사 굴착 + 하부 미진동 발파' },
  found: { mat: '전면 매트 · 상·하부 철근망 + 대량 타설', phc: 'PHC 파일 항타 · 격자 배치 · 6m마다 이음', bored: 'RCD 대구경 Ø1.5m · 케이싱 + 철근망 + 트레미', piledraft: '파일 래프트 · 말뚝 + 두꺼운 매트가 함께 지지', steel: '강관 말뚝 · 깊은 연약층까지 항타 · 용접 이음', micro: '마이크로파일 Ø250 · 소형 천공기로 촘촘히' },
  bwp: { sheet: '외방수 시트 · 겹침 이음', pre: '선부착 HDPE 시트 · 타설 전에 붙임', bento: '벤토나이트 매트 · 물을 만나면 부풀어 막음', cryst: '결정성 침투 + 이중벽 배수층', tank: '수밀 콘크리트 · 이음마다 지수판' },
  base: { bottomup: '순타 · 아래 층부터 올리며 버팀 해체', topdown: '역타 · 지하 슬래브를 위에서 아래로', updown: '업다운 · 지하는 내려가고 지상은 동시에 올라감', semi: '부분 역타 · 코어 먼저' },
  frame: { rcwall: 'RC 벽식 · 내력벽 + 슬래브 (보 없음)', rcframe: 'RC 라멘 · 기둥 + 보 격자', hybrid: 'RC 코어 선행 + 철골 외주부', src: 'SRC · 철골 먼저 → 철근·콘크리트로 감쌈', steel: '철골 S조 · 기둥·보 3개 층 선행 + 데크', pc: 'PC · 공장 제작 기둥·보·슬래브 조립', modular: '모듈러 · 공장 완성 유닛을 쌓음', truss: '장스팬 철골 트러스 + PC', module: '플랜트 대형 모듈 일괄 인양', stick: '현장 조립 철골 · 가새 보강' },
  form: { conv: '합판 거푸집 + 동바리 1.2m 격자 (2개 층 존치)', alform: '알루미늄 폼 · 벽·슬래브 일체 타설', gang: '갱폼 · 외벽 대형 패널 + 3단 작업 발판', acs: '자동상승 ACS · 코어 선행 + 외곽 보호 스크린', slip: '슬립폼 · 요크·잭 로드로 쉬지 않고 상승', deck: '데크플레이트 · 동바리 없음', pcf: '거푸집 없음 · 공장 생산 부재 조립' },
  rebar: { site: '현장 가공장 · 절단·절곡', shop: '공장 가공 철근 반입 (BIM 태그)', cage: '선조립 철근 케이지 인양', coupler: '기계식 커플러 이음 · SD600', mesh: '용접 철망 · 트러스 데크' },
  pour: { boom: '붐 펌프카 + 습윤 양생', cpb: '고정 배관 + 분배 붐 (층 위 설치)', highp: '초고압 펌프 · 수직 압송', bucket: '크레인 버킷 타설', winter: '보온 천막 + 열풍기 · 5℃ 이상 유지', multi: '펌프카 3대 동시 · 대량 연속 타설' },
  steel: { bolt: '고력볼트 접합 + 뿜칠 내화피복', weld: '현장 용접 + 내화도료', robot: '로봇 용접 + 레이저 자동 계측', block: '대블록 지상 조립 → 일괄 인양' },
  lift: { tower: 'T형 타워크레인 · 360° 선회', luffing: '러핑 크레인 · 지브를 세워 대지 안에서 선회', crawler: '크롤러 크레인 · 차로 점용', mobile: '이동식 크레인 · 아웃리거 전개', ringer: '링거 크레인 · 링 베이스 초대형 인양' },
  hoist: { rack: '랙·피니언 호이스트 · 층마다 벽 연결', fast: '고속 호이스트 2기 · 분속 100m', jump: '점프 엘리베이터 · 코어 안 영구 승강기', lift: '자재 리프트 + 가설 계단' },
  skin: { unitcw: '유닛 커튼월 · 공장 완성 유닛을 모노레일로 끼움', stickcw: '스틱 커튼월 · 멀리언 → 트랜섬 → 유리 (곤돌라)', pcpanel: 'PC 외벽 패널 · 크레인 인양 부착', metal: '금속 샌드위치 패널 · 고소작업차', wet: '습식 · 비계 + 분진망 · 위층부터 아래로' },
  roof: { asphalt: '개량 아스팔트 시트 · 토치 융착', urethane: '우레탄 도막 · 노출형', hybrid: '시트 + 도막 복합 방수', metal: '금속 지붕 · 스탠딩 심', green: '옥상 녹화 · 방근층 + 토양', pv: '태양광 가대 + 방수' },
};

export function buildMethods(X) {
  const { root, mat, clipM, inst, mesh, box, setBox, ibox, BOX, CYL, CONE, sc, D, clipList, R } = X;
  const { G, ids, cond } = sc;
  const pw = G.pw, depth = Math.max(0, G.depth || 0), pd = D.pd, bd = D.bd, NF = sc.NF;
  const th = Math.max(sc.wallTh, 0.3), emb = sc.embed;
  const own = { tex: [], mats: [], geos: [] };
  const C3 = new THREE.Color(), M4 = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), E = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0), DIR = new THREE.Vector3();
  const tex = (t) => { own.tex.push(t); return t; };
  const geo = (g) => { own.geos.push(g); return g; };
  const LT = tex(latticeTex());
  function latM(color, rx, ry) { const t = tex(LT.clone()); t.needsUpdate = true; t.repeat.set(rx, ry); const m = new THREE.MeshStandardMaterial({ color, map: t, alphaTest: 0.45, side: THREE.DoubleSide, metalness: 0.35, roughness: 0.5 }); own.mats.push(m); return m; }
  function texM(t, o = {}) { const op = o.op ?? 1; const m = new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff, map: t, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0.05, transparent: op < 1, opacity: op, depthWrite: op >= 1, side: o.side ?? THREE.FrontSide, alphaTest: o.alphaTest ?? 0 }); if (o.clip) { m.clippingPlanes = []; clipList.push(m); } own.mats.push(m); return m; }

  // 인스턴스 풀: 매 프레임 0부터 채운다
  const pools = [], eqs = [];
  function pool(g, m, cap, wp, tinted) {
    const im = inst(g, m, cap, wp);
    if (tinted) for (let i = 0; i < Math.max(1, cap); i++) im.setColorAt(i, C3.set(0xffffff));
    const P = { im, n: 0, cap: Math.max(1, cap) };
    P.put = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { if (P.n >= P.cap) return -1; V.set(x, y, z); S3.set(sx, sy, sz); Q.setFromEuler(E.set(rx, ry, rz)); M4.compose(V, Q, S3); im.setMatrixAt(P.n, M4); return P.n++; };
    P.box = (x0, x1, y0, y1, z0, z1, ry = 0) => P.put((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.max(1e-3, Math.abs(x1 - x0)), Math.max(1e-3, Math.abs(y1 - y0)), Math.max(1e-3, Math.abs(z1 - z0)), 0, ry, 0);
    P.ob = (cx, cy, cz, sx, sy, sz, ry = 0) => P.put(cx, cy, cz, Math.max(1e-3, sx), Math.max(1e-3, sy), Math.max(1e-3, sz), 0, ry, 0);
    P.seg = (ax, ay, az, bx, by, bz, w, d = w) => { if (P.n >= P.cap) return -1; DIR.set(bx - ax, by - ay, bz - az); const L = DIR.length(); if (L < 1e-4) return -1; DIR.multiplyScalar(1 / L); Q.setFromUnitVectors(UP, DIR); V.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); S3.set(w, L, d); M4.compose(V, Q, S3); im.setMatrixAt(P.n, M4); return P.n++; };
    P.cyl = (x, z, y0, y1, r) => P.box(x - r, x + r, Math.min(y0, y1), Math.max(y0, y1), z - r, z + r);
    P.tint = (i, hex) => { if (i >= 0 && im.instanceColor) im.setColorAt(i, C3.set(hex)); return i; };
    pools.push(P); return P;
  }
  const grp = (parent = root) => { const o = new THREE.Group(); o.visible = false; parent.add(o); eqs.push(o); return o; };
  const pbox = (g, m, wp, x0, x1, y0, y1, z0, z1) => box(m, wp, x0, x1, y0, y1, z0, z1, g);
  const pcyl = (g, m, wp, x, y, z, r, h, ax = 'y') => { const o = mesh(CYL, m, wp, g); o.position.set(x, y, z); o.scale.set(2 * r, h, 2 * r); if (ax === 'z') o.rotation.x = Math.PI / 2; else if (ax === 'x') o.rotation.z = Math.PI / 2; return o; };
  const segO = (o, ax, ay, az, bx, by, bz, w, d = w) => { DIR.set(bx - ax, by - ay, bz - az); const L = Math.max(0.01, DIR.length()); DIR.multiplyScalar(1 / L); o.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); o.quaternion.setFromUnitVectors(UP, DIR); o.scale.set(w, L, d); return o; };
  const link = (g, m, wp, ...a) => segO(mesh(BOX, m, wp, g), ...a);
  // 둥근 모서리 상자 (장비 차체·운전실·궤도): 각진 레고 상자 대신
  const rb = (g, m, wp, x0, x1, y0, y1, z0, z1, r = 0.14) => { const o = mesh(geo(shape().rbox(x0, x1, y0, y1, z0, z1, r, 2).done()), m, wp, g); return o; };
  // 장비 이름표: 자리를 잡은 장비(userData.eq)는 그 위에 이름을 띄운다
  const tagsNow = new Map();
  const place = (g, x, y, z, yaw = 0) => { g.visible = true; g.position.set(x, y, z); g.rotation.set(0, yaw, 0); if (g.userData.eq) tagsNow.set(g, [x, y + g.userData.eqH, z]); };

  // 재질
  const EQ = mat(EQC, { metal: 0.3, rough: 0.5 }), DARK = mat(0x2b2c30, { rough: 0.9 }), DARK2 = mat(0x4a4c52, { metal: 0.3, rough: 0.6 });
  const GLASS = mat(0x9cc8ee, { metal: 0.4, rough: 0.15 }), WHITE = mat(0xe9eaed, { metal: 0.2 }), ROPE = mat(0x1c1c1e);
  const STEEL = mat(0x7f93a8, { metal: 0.55, rough: 0.45 }), CONC = mat(0xa3a3a8), CONC_L = mat(0xc9c9cd);
  const HUB = mat(0xb9bec6, { metal: 0.6, rough: 0.35 }), CHROME = mat(0xd9dde2, { metal: 0.7, rough: 0.25 }), BEACON = mat(0xffa31a, { em: 0.6 }), HOSE = mat(0x1f2124, { rough: 0.6 });
  const ORANGE = mat(0xff8a3d, { metal: 0.2 }), REDM = mat(0xe5484d), WOODM = mat(0xc58a4a);
  const TINT = mat(0xfffffe), TINTC = clipM(0xfffffd), TINTS = clipM(0xfffffc, { metal: 0.5, rough: 0.45 });
  const FLASH = mat(0xffb547, { em: 1.4 }), DUST = mat(0xb9b2a5, { op: 0.4 }), RING = mat(0xff6b3d, { op: 0.55, em: 0.5 });
  const topSoil = sc.strata.length ? sc.strata[0][2] : 'soil';
  const SOILC = { fill: 0x9c8462, sand: 0xc9a86a, clay: 0x8f6e4e, soil: 0xa88a5e, wr: 0x7a7f8a, rock: 0x4c4f57 };
  const soilM = new THREE.MeshStandardMaterial({ color: SOILC[topSoil] ?? 0xa88a5e, roughness: 0.95, side: THREE.DoubleSide }); own.mats.push(soilM);

  const DRUM = geo(new THREE.LatheGeometry([[0.05, -2.4], [0.7, -2.2], [1.15, -1.3], [1.2, 0], [1.05, 1.2], [0.55, 2.2], [0.35, 2.45], [0.05, 2.5]].map(([r, y]) => new THREE.Vector2(r, y)), 24));
  const WEDGE = geo(wedgeGeo()), SPH = geo(new THREE.SphereGeometry(0.5, 10, 7)), TOR = geo(new THREE.TorusGeometry(1, 0.035, 6, 48).rotateX(Math.PI / 2));

  // ---------- 공통 장비 ----------
  // 궤도: 둥근 트랙 + 슈 + 바깥 휠(구동 스프로킷·아이들러·하부 롤러) + 가운데 차체·선회 링 (길이별 형상 공유)
  const trkC = new Map();
  function tracks(g, L, W) {
    const k = L.toFixed(2); let c = trkC.get(k); if (!c) { c = [geo(trackGeo(L, 0.9, 1.0)), geo(trackWheelsGeo(L, 0.9, 1.0))]; trkC.set(k, c); }
    [-1, 1].forEach(s => { const z = s * (W / 2 - 0.45); mesh(c[0], DARK, null, g).position.z = z; const w = mesh(c[1], DARK2, null, g); w.position.z = z; if (s < 0) w.rotation.y = Math.PI; });
    rb(g, DARK2, null, -L / 2 + 0.9, L / 2 - 0.9, 0.5, 1.12, -W / 2 + 0.85, W / 2 - 0.85, 0.12);
    pcyl(g, DARK, null, 0, 1.12, 0, Math.min(1.15, W / 2 - 0.45), 0.1);
  }
  function house(g, wp, x0, x1, y0, W, col = EQ) {
    rb(g, col, wp, x0, x1, y0, y0 + 1.5, -W / 2, W / 2, 0.2);
    rb(g, DARK2, null, x0 - 0.7, x0 + 0.3, y0, y0 + 1.35, -W / 2, W / 2, 0.35); // 카운터웨이트
    rb(g, GLASS, null, x1 - 1.15, x1, y0 + 1.45, y0 + 2.7, W / 2 - 1.15, W / 2, 0.1); // 운전실
    rb(g, col, wp, x1 - 1.22, x1 + 0.05, y0 + 2.62, y0 + 2.82, W / 2 - 1.22, W / 2 + 0.05, 0.08);
    pbox(g, DARK, null, x1 - 1.2, x1 - 1.1, y0 + 1.5, y0 + 2.65, W / 2 - 1.2, W / 2 + 0.02); pbox(g, DARK, null, x1 - 0.06, x1 + 0.02, y0 + 1.5, y0 + 2.65, W / 2 - 0.08, W / 2 + 0.02);
    for (let k = 0; k < 6; k++) { const y = y0 + 0.3 + k * 0.16; pbox(g, DARK, null, x0 + 0.5, x0 + 1.9, y, y + 0.07, -W / 2 - 0.03, -W / 2 + 0.02); } // 엔진 루버
    [x0 + 0.35, (x0 + x1) / 2 - 0.4, x1 - 1.5].forEach(x => pbox(g, DARK, null, x - 0.03, x + 0.03, y0 + 1.5, y0 + 2.35, -W / 2 + 0.06, -W / 2 + 0.12)); // 난간
    pbox(g, DARK, null, x0 + 0.35, x1 - 1.5, y0 + 2.3, y0 + 2.36, -W / 2 + 0.06, -W / 2 + 0.12); pbox(g, DARK, null, x0 + 0.35, x1 - 1.5, y0 + 1.9, y0 + 1.94, -W / 2 + 0.06, -W / 2 + 0.12);
    pcyl(g, DARK2, null, x0 + 1.1, y0 + 1.85, -W / 4, 0.08, 0.75); pcyl(g, DARK, null, x0 + 1.1, y0 + 2.24, -W / 4, 0.1, 0.05); // 배기관
    pcyl(g, BEACON, null, x1 - 0.6, y0 + 2.92, W / 2 - 0.6, 0.09, 0.17); // 경광등
    pbox(g, DARK2, null, x1 - 0.5, x1 + 0.15, y0 - 0.05, y0 + 0.05, W / 2 - 0.1, W / 2 + 0.25); // 발판
  }
  // 리더식 천공·항타기: 기계 앞 리더(격자) + 작업 도구가 리더를 따라 오르내림. 도구 끝(tool.y)이 천공 깊이
  function leaderRig(H, kind, wp, col = EQC) {
    const g = grp(); tracks(g, 5, 3.4); house(g, wp, -2.4, 0.9, 1.15, 2.8, mat(col, { metal: 0.3, rough: 0.5 }));
    const lx = 1.8, cm = mat(col, { metal: 0.3, rough: 0.5 }), ld = mesh(geo(latticeBoomGeo(H - 0.6, 0.9, 0.9, false, 1.0)), cm, wp, g); ld.rotation.z = Math.PI / 2; ld.position.set(lx, 0.6, 0);
    [-0.32, 0.32].forEach(z => link(g, cm, wp, -0.8, 2.7, z, lx - 0.4, H * 0.62, z * 0.5, 0.2)); // 백스테이 (2줄)
    link(g, cm, wp, 0.6, 1.4, 0, lx - 0.4, 2.6, 0, 0.22); pbox(g, DARK2, null, lx - 0.55, lx + 0.55, 0.45, 0.75, -0.6, 0.6); // 하부 받침
    link(g, ROPE, null, lx + 0.5, H + 0.5, 0.2, -0.9, 2.9, 0.2, 0.05); // 권상 와이어
    pbox(g, DARK2, null, lx - 0.6, lx + 1.4, H, H + 0.7, -0.5, 0.5); // 정상 활차
    const tool = new THREE.Group(); tool.position.set(lx + 0.9, 0, 0); g.add(tool);
    const La = Math.max(4, H - 2.5);
    if (kind === 'auger' || kind === 'triple' || kind === 'twin') {
      const zs = kind === 'triple' ? [-0.6, 0, 0.6] : kind === 'twin' ? [-0.55, 0.55] : [0];
      zs.forEach(z => { pcyl(tool, DARK2, null, 0, La / 2, z, kind === 'twin' ? 0.35 : 0.26, La); for (let y = 0.4; y < La; y += 0.7) pcyl(tool, STEEL, null, 0, y, z, kind === 'twin' ? 0.62 : 0.42, 0.07); });
      pbox(tool, mat(col, { metal: 0.3, rough: 0.5 }), wp, -0.6, 0.6, La, La + 1.4, -0.4 - Math.abs(zs[0]), 0.4 + Math.abs(zs[0])); // 구동부
    } else if (kind === 'hammer') { pbox(tool, DARK2, null, -0.6, 0.6, 0, 2.8, -0.6, 0.6); pbox(tool, mat(col, { metal: 0.3, rough: 0.5 }), wp, -0.65, 0.65, 2.0, 2.4, -0.65, 0.65); }
    else if (kind === 'casing') { pcyl(tool, STEEL, null, 0, La / 2, 0, 0.42, La); pbox(tool, DARK2, null, -0.9, 0.9, La, La + 1.6, -0.9, 0.9); }
    else if (kind === 'mandrel') { pbox(tool, STEEL, null, -0.1, 0.1, 0, La, -0.06, 0.06); pbox(tool, DARK2, null, -0.5, 0.5, La, La + 1.1, -0.5, 0.5); }
    else { pcyl(tool, STEEL, null, 0, La / 2, 0, 0.11, La); pbox(tool, DARK2, null, -0.4, 0.4, La, La + 0.9, -0.4, 0.4); }
    return { g, tool, H, La, reach: lx + 0.9 };
  }
  // 크롤러 크레인: 격자 붐 + 펜던트 + 권상줄 끝에 부속 장치(att)
  function crawlerCrane(len, wp, ang = 1.2) {
    const g = grp(); tracks(g, 6.6, 4.8); const turn = new THREE.Group(); g.add(turn);
    house(turn, wp, -3.2, 1.6, 1.15, 3.6);
    for (let k = 0; k < 4; k++) rb(turn, DARK2, null, -4.5, -3.05, 1.2 + k * 0.62, 1.76 + k * 0.62, -1.75, 1.75, 0.1); // 카운터웨이트 판
    const bp = new THREE.Group(); bp.position.set(1.6, 2.2, 0); bp.rotation.z = ang; turn.add(bp);
    mesh(geo(latticeBoomGeo(len, 1.4, 1.2)), EQ, wp, bp);
    pcyl(bp, DARK2, null, 0, 0, 0, 0.22, 1.6, 'z'); // 붐 풋 핀
    const ax = -1.8, ay = 6.8; // A 프레임 꼭지
    [-1, 1].forEach(z => { link(turn, EQ, wp, -2.7, 2.6, z * 1.2, ax, ay, z * 0.5, 0.24); link(turn, EQ, wp, -0.2, 2.6, z * 1.0, ax, ay, z * 0.5, 0.2); });
    pcyl(turn, DARK2, null, ax, ay, 0, 0.32, 1.3, 'z');
    const tip = new THREE.Vector3(1.6 + Math.cos(ang) * len, 2.2 + Math.sin(ang) * len, 0);
    [-0.45, 0.45].forEach(z => link(turn, ROPE, null, ax, ay, z, tip.x - Math.cos(ang) * 0.3, tip.y - Math.sin(ang) * 0.3, z * 0.6, 0.06)); // 펜던트
    link(turn, ROPE, null, -1.0, 2.9, 0, ax + 0.3, ay - 0.4, 0, 0.05); // 붐 기복 와이어
    const line = mesh(BOX, ROPE, null, turn), att = new THREE.Group(); turn.add(att);
    return { g, turn, att, tip, hang(y) { att.position.set(tip.x, y, 0); segO(line, tip.x, tip.y, 0, tip.x, y + 0.2, 0, 0.06); } };
  }
  // 굴착기: 차체 위 상부(선회) + 붐 → 암 → 버킷(또는 브레이커·할암기) 관절
  // 굴착기 형상 (크기 s마다 한 번): 상부 차체 · 운전실 · 바나나 붐 · 암 · 실린더 · 버킷
  const exC = new Map();
  function exGeo(s) {
    const k = s.toFixed(2); if (exC.has(k)) return exC.get(k);
    const body = shape().rbox(-1.9 * s, 1.4 * s, 1.15 * s, 2.55 * s, -1.4 * s, 1.4 * s, 0.22 * s)
      .rbox(0.36 * s, 1.44 * s, 2.5 * s, 3.74 * s, 0.34 * s, 1.42 * s, 0.1 * s) // 운전실 몸체
      .rbox(0.32 * s, 1.48 * s, 3.68 * s, 3.84 * s, 0.3 * s, 1.46 * s, 0.06 * s) // 지붕
      .rbox(-1.75 * s, -0.2 * s, 2.5 * s, 2.72 * s, -1.3 * s, -0.25 * s, 0.08 * s) // 엔진 덮개
      .done();
    const dark = shape().rbox(-2.45 * s, -1.5 * s, 1.15 * s, 2.45 * s, -1.4 * s, 1.4 * s, 0.4 * s); // 카운터웨이트
    for (let i = 0; i < 7; i++) { const x = (-1.65 + i * 0.2) * s; dark.box(x, x + 0.1 * s, 1.45 * s, 2.35 * s, -1.43 * s, -1.38 * s); } // 루버
    [[-1.6, -1.25], [-0.6, -1.25], [0.25, -1.25]].forEach(([x, z]) => dark.box(x * s - 0.03, x * s + 0.03, 2.72 * s, 3.3 * s, z * s - 0.03, z * s + 0.03)); // 난간 기둥
    dark.box(-1.6 * s, 0.25 * s, 3.27 * s, 3.33 * s, -1.28 * s, -1.22 * s).box(-1.6 * s, 0.25 * s, 3.0 * s, 3.04 * s, -1.28 * s, -1.22 * s);
    dark.box(1.42 * s, 1.47 * s, 1.6 * s, 2.5 * s, 1.0 * s, 1.36 * s); // 발판
    dark.tube(1.42 * s, 3.3 * s, 1.46 * s, 1.75 * s, 3.45 * s, 1.75 * s, 0.025 * s).box(1.7 * s, 1.8 * s, 3.3 * s, 3.62 * s, 1.68 * s, 1.82 * s); // 사이드 미러
    dark.tube(-0.9 * s, 2.6 * s, -0.9 * s, -0.9 * s, 3.35 * s, -0.9 * s, 0.07 * s); // 배기관
    for (let i = 0; i < 4; i++) dark.box((0.36 + i * 0.36) * s, (0.4 + i * 0.36) * s, 3.84 * s, 3.92 * s, 0.32 * s, 1.44 * s); // 낙하물 보호대
    const glass = shape().box(1.43 * s, 1.46 * s, 2.72 * s, 3.6 * s, 0.44 * s, 1.32 * s).box(0.48 * s, 1.34 * s, 2.72 * s, 3.6 * s, 1.41 * s, 1.44 * s).box(0.48 * s, 1.34 * s, 2.98 * s, 3.6 * s, 0.32 * s, 0.35 * s).box(0.34 * s, 0.37 * s, 3.0 * s, 3.6 * s, 0.46 * s, 1.3 * s).done();
    // 바나나 붐 (꺾인 두 토막 + 무릎) + 붐 실린더 2 + 암 실린더 + 유압 호스
    const boom = shape().rbar(0, 0, 0, 2.6 * s, 0.62 * s, 0, 0.74 * s, 0.56 * s).rbar(2.6 * s, 0.62 * s, 0, 5.4 * s, 0, 0, 0.6 * s, 0.5 * s).rbox(2.25 * s, 2.95 * s, 0.22 * s, 1.0 * s, -0.29 * s, 0.29 * s, 0.12 * s)
      .cyl(0, 0, 0, 0.2 * s, 0.7 * s, 'z', 12).cyl(5.4 * s, 0, 0, 0.17 * s, 0.62 * s, 'z', 12).done();
    const cylB = shape(), rod = shape(), hose = shape();
    [-0.36, 0.36].forEach(z => { cylB.tube(0.25 * s, -0.75 * s, z * s, 1.75 * s, -0.25 * s, z * s, 0.12 * s, 10); rod.tube(1.75 * s, -0.25 * s, z * s, 2.55 * s, 0.1 * s, z * s, 0.065 * s, 8); });
    cylB.tube(2.05 * s, 1.18 * s, 0, 3.9 * s, 0.98 * s, 0, 0.12 * s, 10); rod.tube(3.9 * s, 0.98 * s, 0, 5.15 * s, 0.6 * s, 0, 0.065 * s, 8);
    [-0.12, 0.12].forEach(z => { hose.tube(0.4 * s, 0.42 * s, z * s, 2.6 * s, 1.0 * s, z * s, 0.03 * s, 5).tube(2.6 * s, 1.0 * s, z * s, 5.1 * s, 0.42 * s, z * s, 0.03 * s, 5); });
    // 암 (뒤 꼬리 포함) + 버킷 실린더 + 링크
    const stick = shape().rbar(-0.75 * s, 0.28 * s, 0, 3.3 * s, 0, 0, 0.5 * s, 0.42 * s).cyl(3.3 * s, 0, 0, 0.13 * s, 0.5 * s, 'z', 10).done();
    const cylS = shape().tube(-0.6 * s, 0.74 * s, 0, 1.9 * s, 0.56 * s, 0, 0.11 * s, 10), rodS = shape().tube(1.9 * s, 0.56 * s, 0, 2.85 * s, 0.46 * s, 0, 0.06 * s, 8);
    [-0.2, 0.2].forEach(z => { cylS.bar(2.85 * s, 0.46 * s, z * s, 3.42 * s, 0.12 * s, z * s, 0.08 * s, 0.05 * s).bar(2.85 * s, 0.46 * s, z * s, 2.98 * s, 0.05 * s, z * s, 0.08 * s, 0.05 * s); }); // 버킷 링크
    const out = { body, dark: dark.done(), glass, boom, cylB: cylB.done(), rod: rod.done(), hose: hose.done(), stick, cylS: cylS.done(), rodS: rodS.done(), bucket: bucketGeo(1.24 * s, 0.6 * s) };
    Object.values(out).forEach(geo); exC.set(k, out); return out;
  }
  function excavator(tool = 'bucket', s = 1) {
    const g = grp(); tracks(g, 4.6 * s, 3.2 * s);
    const turn = new THREE.Group(), X = exGeo(s); g.add(turn);
    mesh(X.body, EQ, 'excav', turn); mesh(X.dark, DARK2, null, turn); mesh(X.glass, GLASS, null, turn);
    pcyl(turn, BEACON, null, 1.0 * s, 4.0 * s, 0.9 * s, 0.08 * s, 0.16 * s); // 경광등
    const boom = new THREE.Group(); boom.position.set(1.3 * s, 2.1 * s, -0.45 * s); turn.add(boom);
    mesh(X.boom, EQ, 'excav', boom); mesh(X.cylB, DARK2, null, boom); mesh(X.rod, CHROME, null, boom); mesh(X.hose, HOSE, null, boom);
    const stick = new THREE.Group(); stick.position.set(5.4 * s, 0, 0); boom.add(stick);
    mesh(X.stick, EQ, 'excav', stick); mesh(X.cylS, DARK2, null, stick); mesh(X.rodS, CHROME, null, stick);
    const tl = new THREE.Group(); tl.position.set(3.3 * s, 0, 0); stick.add(tl);
    if (tool === 'breaker') { rb(tl, DARK2, null, -0.3 * s, 0.3 * s, -1.6 * s, 0, -0.3 * s, 0.3 * s, 0.06 * s); pcyl(tl, CHROME, null, 0, -1.85 * s, 0, 0.09 * s, 0.6 * s); const c = mesh(CONE, DARK, null, tl); c.position.set(0, -2.2 * s, 0); c.scale.set(0.18 * s, 0.3 * s, 0.18 * s); c.rotation.z = Math.PI; }
    else if (tool === 'split') { rb(tl, DARK2, null, -0.25 * s, 0.25 * s, -1.4 * s, 0, -0.45 * s, 0.45 * s, 0.06 * s); pbox(tl, STEEL, null, -0.08 * s, 0.08 * s, -2.2 * s, -1.4 * s, -0.2 * s, 0.2 * s); }
    else mesh(X.bucket, DARK2, null, tl);
    // 동작: 파기 → 들어 올림 → 선회 → 비움
    g.userData.pose = (ph, swing = 1.5) => {
      const dig = ph < 0.35 ? ph / 0.35 : 1, up = sstep(0.35, 0.5, ph) * (1 - sstep(0.85, 1, ph)), dump = sstep(0.62, 0.72, ph) * (1 - sstep(0.8, 0.88, ph));
      turn.rotation.y = swing * sstep(0.45, 0.62, ph) * (1 - sstep(0.85, 1, ph));
      boom.rotation.z = lerp(0.3, 0.75, up) - 0.12 * dig; // 버킷이 바닥을 긁을 만큼만 내려간다 stick.rotation.z = lerp(-0.85, -1.95, dig * (1 - up * 0.4)); tl.rotation.z = lerp(0.15, -1.2, dig) + 1.45 * dump;
    };
    g.userData.hammer = (T) => { turn.rotation.y = 0; boom.rotation.z = 0.2; stick.rotation.z = -1.2 + 0.03 * Math.sin(T * 30); tl.rotation.z = -0.02; };
    return g;
  }
  function truckBody(g, len, col = WHITE, cabC = 0xd9822b, nr = 0) { // 트럭 차대 (로컬 z가 앞), nr: 뒤 차축 수 (0이면 길이로)
    pbox(g, DARK2, null, -1.1, 1.1, 0.55, 1.05, -len / 2, len / 2 - 0.2);
    rb(g, mat(cabC), null, -1.25, 1.25, 0.9, 3.0, len / 2 - 2.0, len / 2, 0.22); rb(g, GLASS, null, -1.12, 1.12, 1.95, 2.8, len / 2 - 0.12, len / 2 + 0.04, 0.06); pbox(g, DARK, null, -1.2, 1.2, 1.0, 1.35, len / 2 - 0.05, len / 2 + 0.08); [-1, 1].forEach(k => pbox(g, DARK, null, k * 1.27 - 0.03, k * 1.27 + 0.03, 1.95, 2.7, len / 2 - 1.7, len / 2 - 0.5));
    const wheel = (x, z) => { pcyl(g, DARK, null, x, 0.55, z, 0.55, 0.45, 'x'); pcyl(g, HUB, null, x + Math.sign(x) * 0.2, 0.55, z, 0.28, 0.08, 'x'); };
    if (nr) for (let k = 0; k < nr; k++) [-1.15, 1.15].forEach(x => wheel(x, -len / 2 + 1.5 + k * 1.4));
    else for (let z = -len / 2 + 1.2; z < len / 2 - 2.5; z += 1.5) [-1.15, 1.15].forEach(x => wheel(x, z));
    wheel(-1.15, len / 2 - 1.1); wheel(1.15, len / 2 - 1.1);
    void col;
  }
  function pumpTruck() { // 붐 펌프카: 아웃리거 4개 + 선회대 (붐은 월드 좌표로 따로)
    const g = grp(); truckBody(g, 11); pbox(g, WHITE, 'pour', -1.2, 1.2, 1.05, 2.4, -5.4, 3.4);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { link(g, EQ, 'pour', sx * 1.1, 1.7, sz * 3.2, sx * 4.2, 0.35, sz * 4.4, 0.32); pbox(g, DARK2, null, sx * 4.2 - 0.5, sx * 4.2 + 0.5, 0, 0.18, sz * 4.4 - 0.5, sz * 4.4 + 0.5); });
    pcyl(g, EQ, 'pour', 0, 2.8, -2.6, 0.8, 0.9); pcyl(g, DARK2, null, 0, 2.3, -2.6, 1.0, 0.25); // 선회대
    rb(g, WHITE, 'pour', -1.15, 1.15, 1.05, 2.0, -5.5, -4.0, 0.12); pcyl(g, DARK2, null, 0, 1.85, -5.2, 0.55, 0.9); // 호퍼 · 압송 실린더
    [-1, 1].forEach(k => { pcyl(g, CHROME, null, k * 0.9, 1.2, -0.8, 0.25, 1.2, 'z'); pbox(g, DARK, null, k * 1.25 - 0.02, k * 1.3, 1.1, 2.3, -3.6, 1.8); }); // 탱크 · 측면 공구함
    const segs = [0.75, 0.62, 0.5, 0.4].map(() => mesh(BSEG, EQ, 'pour')), hose = mesh(BOX, ROPE, null);
    const pins = [0, 1, 2].map(() => mesh(CYL, DARK2, null)), rams = [0, 1, 2].map(() => mesh(CYL, CHROME, null)), barrels = [0, 1, 2].map(() => mesh(CYL, DARK2, null));
    const bg = grp(); [...segs, hose, ...pins, ...rams, ...barrels].forEach(s => bg.add(s));
    return { g, bg, segs, hose, pins, rams, barrels, W: [0.75, 0.62, 0.5, 0.4] };
  }
  // 붐 한 토막 (길이 축 y, −0.5..0.5): 둥근 사각 단면 + 옆 콘크리트 배관 (길이로만 늘려 쓴다)
  const BSEG = (() => {
    const sh = new THREE.Shape(), a = 0.5, r = 0.16; sh.moveTo(-a + r, -a); sh.lineTo(a - r, -a); sh.quadraticCurveTo(a, -a, a, -a + r); sh.lineTo(a, a - r); sh.quadraticCurveTo(a, a, a - r, a); sh.lineTo(-a + r, a); sh.quadraticCurveTo(-a, a, -a, a - r); sh.lineTo(-a, -a + r); sh.quadraticCurveTo(-a, -a, -a + r, -a);
    return geo(shape().geo(new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 3 }).rotateX(-Math.PI / 2).translate(0, -0.5, 0)).geo(new THREE.CylinderGeometry(0.11, 0.11, 1, 8).translate(0, 0, 0.68)).done());
  })();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function aimBoom(pt, base, tgt, reach = 58) { // 4단 붐을 목표점 위로 접어 뻗는다
    _a.copy(tgt).sub(base); const far = _a.length() > reach; if (far) _a.setLength(reach); const t = _b.copy(base).add(_a);
    const H = Math.max(t.y + 7, base.y + 9), p1 = [base.x + _a.x * 0.28, H + 3, base.z + _a.z * 0.28], p2 = [base.x + _a.x * 0.66, H + 1.5, base.z + _a.z * 0.66], p3 = [t.x, t.y + 3.6, t.z];
    const P0 = [base.x, base.y, base.z], pts = [P0, p1, p2, p3]; pt.segs.forEach((s, i) => segO(s, ...pts[i], ...(pts[i + 1] || [t.x, t.y + 0.6, t.z]), pt.W[i]));
    segO(pt.segs[3], ...p3, t.x, t.y + 1.2, t.z, 0.4); segO(pt.hose, t.x, t.y + 1.2, t.z, t.x, t.y + 0.15, t.z, 0.18);
    // 관절 핀 + 접이 실린더 (실린더 몸통 + 크롬 로드)
    const hl = Math.hypot(_a.x, _a.z) || 1, nx = -_a.z / hl, nz = _a.x / hl, ends = [P0, p1, p2, p3, [t.x, t.y + 1.2, t.z]];
    for (let j = 0; j < 3; j++) {
      const p = ends[j + 1], w = pt.W[j] * 0.75; segO(pt.pins[j], p[0] - nx * w, p[1], p[2] - nz * w, p[0] + nx * w, p[1], p[2] + nz * w, pt.W[j] * 0.9);
      const A = ends[j].map((v, k) => lerp(v, p[k], 0.6) + (k === 1 ? pt.W[j] * 0.85 : 0)), B = p.map((v, k) => lerp(v, ends[j + 2][k], 0.2) + (k === 1 ? pt.W[j + 1] * 0.8 : 0)), M = A.map((v, k) => lerp(v, B[k], 0.55));
      segO(pt.barrels[j], ...A, ...M, pt.W[j] * 0.36); segO(pt.rams[j], ...M, ...B, pt.W[j] * 0.18);
    }
    pt.bg.visible = true; return far;
  }
  function mixerTruck() {
    const g = grp(); truckBody(g, 8.6);
    const dg = new THREE.Group(); dg.position.set(0, 2.6, -0.8); dg.rotation.x = -(Math.PI / 2 - 0.2); g.add(dg);
    const dm = texM(tex(stripeTex()), { metal: 0.3, rough: 0.45 }); dm.map.repeat.set(2, 1);
    const drum = mesh(DRUM, dm, null, dg); // 달걀꼴 드럼 (나선 띠, 돈다) — 좁은 입구가 뒤 위
    pbox(g, mat(0x8a8f99, { metal: 0.4 }), null, -1.1, 1.1, 1.05, 1.6, -3.4, 1.5); [-1, 1].forEach(k => pbox(g, DARK2, null, k * 0.95 - 0.08, k * 0.95 + 0.08, 1.5, 2.3, -3.2, -2.9)); // 받침 · 뒤 롤러대
    rb(g, mat(0xd9822b), null, -0.4, 0.4, 2.7, 3.5, -4.25, -3.6, 0.06); pbox(g, mat(0x8a8f99, { metal: 0.4 }), null, -0.25, 0.25, 1.75, 1.9, -5.6, -4.1); // 호퍼 · 슈트
    pcyl(g, mat(0x2f7fd0, { metal: 0.3 }), null, 0, 1.75, 1.75, 0.5, 1.0, 'x'); // 물탱크
    for (let y = 1.2; y < 3.6; y += 0.3) pbox(g, DARK2, null, 0.95, 1.2, y, y + 0.04, -3.9, -3.85); [0.95, 1.2].forEach(x => pbox(g, DARK2, null, x - 0.02, x + 0.02, 1.1, 3.7, -3.9, -3.85)); // 사다리
    g.userData.drum = drum; return g;
  }
  // 터 안 덤프트럭 (경사로로 내려와 굴착기 옆에서 상차): 적재함 + 늑골 + 흙더미 (load 0..1)
  function dumpTruck() {
    const g = grp(); truckBody(g, 9.2, WHITE, 0xd9822b, 2); const BM = mat(0xd9822b, { metal: 0.35, rough: 0.5 });
    rb(g, BM, null, -1.25, 1.25, 1.2, 1.42, -4.5, 2.3, 0.05);
    [-1, 1].forEach(k => { rb(g, BM, null, k * 1.2 - 0.07, k * 1.2 + 0.07, 1.3, 2.75, -4.5, 2.3, 0.04); for (let z = -4.1; z < 2.2; z += 1.05) pbox(g, DARK2, null, k * 1.27 - 0.04, k * 1.27 + 0.04, 1.42, 2.7, z - 0.06, z + 0.06); pbox(g, DARK2, null, k * 1.27 - 0.05, k * 1.27 + 0.05, 2.62, 2.76, -4.5, 2.3); });
    rb(g, BM, null, -1.27, 1.27, 1.3, 3.15, 2.2, 2.42, 0.04); rb(g, BM, null, -1.27, 1.27, 3.05, 3.15, 2.3, 3.3, 0.03); pbox(g, BM, null, -1.27, 1.27, 1.3, 2.72, -4.62, -4.48); // 앞판 · 보호판 · 뒷문
    [-1, 1].forEach(k => { pbox(g, DARK, null, k * 1.0 - 0.02, k * 1.3, 1.12, 1.2, -3.9, -0.9); pcyl(g, CHROME, null, k * 0.85, 1.0, 1.7, 0.28, 0.9, 'z'); }); // 흙받이 · 연료통
    pcyl(g, DARK, null, -1.05, 3.1, 2.55, 0.07, 1.4); // 배기관
    const heap = mesh(geo(moundGeo(5)), mat(SOILC[stAt(depth * 0.5)] ?? 0xa88a5e, { tex: 'soil', rough: 1 }), null, g); heap.position.set(0, 1.42, -1.1);
    g.userData.load = (f) => { heap.visible = f > 0.04; heap.scale.set(1.1, 0.25 + 1.35 * f, 3.1); };
    return g;
  }
  const latMs = [];
  function swapLattice(o, color, rx, ry) { if (!o) return null; const m = latM(color, rx, ry); o.material = m; o.userData.base = m; latMs.push([o, m]); return m; }

  // ================= 지반조사 =================
  const SV = ids.survey;
  const RHO = { fill: 0x6fc0d8, clay: 0x2f6fd6, soil: 0x5fb0d0, sand: 0x8fd16a, wr: 0xf2c94c, rock: 0xe5484d };
  const stAt = (m) => (sc.strata.find(s => m >= s[0] && m < s[1]) || sc.strata[sc.strata.length - 1] || [0, 0, 'soil'])[2];
  const tomo = []; // 단면 칸: 물리탐사(비저항 색) · AI 모델(지층 색 + 경계 불확실성)
  if (SV === 'geo' || SV === 'ai') { const yb = Math.min(sc.dv - 1, 36), W1 = new THREE.Color(0xffffff); for (let x = -12; x < pw + 12; x += 2.5) for (let m = 0; m < yb; m += 1.5) { const st = stAt(m + 0.75), nearB = sc.strata.some(q => Math.abs(q[0] - (m + 0.75)) < 1.4 && q[0] > 0); tomo.push({ x, m, g: new THREE.Color(RHO[st] ?? 0x5fb0d0).lerp(W1, 0.15 * hsh(x * 7 + m, 2)), a: new THREE.Color(SOILC[st] ?? 0xa88a5e).lerp(new THREE.Color(nearB ? 0xffffff : 0x5fe0ff), nearB ? 0.45 : 0.18) }); } }
  const svTick = pool(BOX, mat(0xffffff, { em: 0.35 }), 140, 'survey');
  const svProf = pool(BOX, mat(0xff8a3d, { em: 0.5 }), 360, 'survey');
  const svTomo = (SV === 'geo' || SV === 'ai') ? pool(BOX, mat(0xfffffb, { op: 0.6 }), 1100, 'survey', true) : null;
  const svDots = SV === 'ai' ? pool(BOX, mat(0x5fe0ff, { em: 0.8 }), 1400, 'survey') : null;
  const svStake = SV === 'geo' ? pool(BOX, mat(0xff8a3d, { em: 0.2 }), 200, 'survey') : null;
  const svRing = pool(TOR, RING, 4, 'survey');
  let tripod = null, cptT = null, drone = null, geoBox = null;
  if (SV === 'cpt') {
    cptT = grp(); truckBody(cptT, 8.5, WHITE, 0x2f7fd0); cptT.rotation.y = Math.PI / 2;
    pbox(cptT, WHITE, 'survey', -1.25, 1.25, 1.05, 3.4, -4.0, 2.2); pbox(cptT, mat(0x2f7fd0), null, -1.27, 1.27, 1.9, 2.3, -4.0, 2.2);
    [-0.6, 0.6].forEach(x => pbox(cptT, DARK2, null, x - 0.12, x + 0.12, 3.4, 6.2, -1.1, -0.9)); pbox(cptT, DARK2, null, -0.8, 0.8, 5.9, 6.4, -1.2, -0.8);
    cptT.userData.rod = link(cptT, STEEL, null, 0, 6, -1, 0, -1, -1, 0.07);
  } else {
    tripod = grp();
    [[1.5, 0.9], [-1.5, 0.9], [0, -1.7]].forEach(([x, z]) => link(tripod, EQ, 'survey', x, 0, z, 0, 7.4, 0, 0.14));
    pbox(tripod, DARK2, null, -0.45, 0.45, 7.2, 7.8, -0.45, 0.45); link(tripod, STEEL, null, 0, 7.3, 0, 0, -0.5, 0, 0.06);
    pbox(tripod, EQ, 'survey', 1.4, 2.6, 0, 1.0, -0.9, 0.1); pcyl(tripod, DARK2, null, 2.0, 1.25, -0.4, 0.3, 0.5, 'z');
    tripod.userData.ham = pbox(tripod, DARK2, null, -0.22, 0.22, 0, 0.7, -0.22, 0.22);
    const cb = new THREE.Group(); cb.position.set(2.6, 0, -2.8); tripod.add(cb);
    sc.strata.slice(0, 5).forEach(([, , k], i) => { pbox(cb, WOODM, null, 0, 1.5, i * 0.18, i * 0.18 + 0.14, 0, 0.7); for (let j = 0; j < 3; j++) pbox(cb, mat(SOILC[k] ?? 0xa88a5e), null, 0.1, 1.4, i * 0.18 + 0.1, i * 0.18 + 0.19, 0.08 + j * 0.2, 0.2 + j * 0.2); });
  }
  if (SV === 'geo') { geoBox = grp(); pbox(geoBox, mat(0x2f7fd0), 'survey', 0, 1.4, 0, 0.9, -0.5, 0.5); pbox(geoBox, mat(0x9fe0ff, { em: 0.8 }), null, 0.2, 1.2, 0.5, 0.85, 0.5, 0.52); }
  if (SV === 'ai') {
    drone = grp(); pbox(drone, DARK2, 'survey', -0.5, 0.5, -0.15, 0.2, -0.5, 0.5);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => { link(drone, DARK, null, 0, 0, 0, a * 1.1, 0.05, b * 1.1, 0.09); pcyl(drone, mat(0xd9d9de, { op: 0.6 }), null, a * 1.1, 0.12, b * 1.1, 0.55, 0.03); });
    pbox(drone, mat(0x5fe0ff, { em: 1 }), null, -0.15, 0.15, -0.4, -0.15, -0.15, 0.15);
    drone.userData.cone = mesh(CONE, mat(0x5fe0ff, { op: 0.13 }), null, drone);
  }

  // ================= 지반 개량 =================
  const IM = ids.improve && ids.improve !== 'none' ? ids.improve : null;
  let imSp = IM === 'scp' ? 2.2 : IM === 'dcm' ? 2.4 : IM === 'vac' ? 2.0 : 1.5;
  let imPts = [];
  const mkImp = () => { imPts = []; const zs = []; for (let z = -0.6; z > -pd / 2 + 0.8; z -= imSp) zs.push(z); zs.forEach((z, r) => { const row = []; for (let x = -4; x <= pw + 4; x += imSp) row.push(x); (r % 2 ? row.reverse() : row).forEach(x => imPts.push([x, z])); }); };
  if (IM) { mkImp(); while (imPts.length > 1500) { imSp *= 1.15; mkImp(); } }
  const imCol = IM ? pool(CYL, mat(IM === 'scp' ? 0xd8c08a : IM === 'dcm' ? 0xb7b2a6 : 0xf2f2f2, { em: IM === 'pbd' || IM === 'vac' ? 0.15 : 0 }), imPts.length + 4, 'improve') : null;
  const imTop = IM ? pool(IM === 'pbd' || IM === 'vac' ? BOX : CYL, mat(IM === 'dcm' ? 0x9a958a : IM === 'scp' ? 0xe0cc98 : 0xffffff, { em: 0.2 }), imPts.length + 4, 'improve') : null;
  const imBulb = IM === 'scp' ? pool(CYL, mat(0xe0cc98), 400, 'improve') : null;
  const imMisc = IM ? pool(BOX, TINT, 40, 'improve', true) : null;
  const imRig = IM ? leaderRig(Math.min(26, Math.max(12, Math.max(sc.softBot, Math.min(sc.dv - 2, depth + 6)) + 3)), IM === 'dcm' ? 'twin' : IM === 'scp' ? 'casing' : 'mandrel', 'improve') : null;
  let imPlant = null;
  if (IM === 'dcm') { imPlant = grp(); [0, 3.4].forEach(z => { pcyl(imPlant, WHITE, 'improve', 1.6, 6, z, 1.4, 9); const c = mesh(CONE, WHITE, null, imPlant); c.position.set(1.6, 0.9, z); c.scale.set(2.8, 1.8, 2.8); c.rotation.z = Math.PI; }); pbox(imPlant, mat(0x2f7fd0), 'improve', 0, 3.2, 0, 2.6, 5.2, 8.6); }
  if (IM === 'vac') { imPlant = grp(); [0, 1].forEach(i => { pbox(imPlant, mat(0x2f7fd0), 'improve', 0, 2.2, 0, 1.6, i * 2.4, i * 2.4 + 1.6); pcyl(imPlant, DARK2, null, 1.1, 2.0, i * 2.4 + 0.8, 0.25, 0.8); }); }

  // ================= 흙막이 =================
  const WL = ids.wall, wallReal = depth > 0.5 && WL !== 'open';
  const LA = pd / 2 - th / 2, LB = Math.max(1, pw - th), Ltot = 2 * LA + LB;
  const pathAt = (s) => { // 왼쪽 앞 → 왼쪽 뒤 → 뒤 → 오른쪽 뒤 → 오른쪽 앞. [x, z, tx, tz, nx, nz] (n = 굴착 쪽)
    if (s < LA) return [th / 2, -s, 0, -1, 1, 0];
    if (s < LA + LB) { const u = s - LA; return [th / 2 + u, -pd / 2 + th / 2, 1, 0, 0, 1]; }
    const u = Math.min(LA, s - LA - LB); return [pw - th / 2, -pd / 2 + th / 2 + u, 0, 1, -1, 0];
  };
  const wSp = { hpile: 1.8, sheet: 1.0, cip: 0.55, scw: 0.45, dwall: 2.8 }[WL] || 1.8;
  const wEl = []; if (wallReal && WL !== 'nail') for (let s = wSp / 2; s < Ltot; s += wSp) wEl.push(s);
  const wOrd = WL === 'dwall' ? [...wEl.map((_, i) => i).filter(i => i % 2 === 0), ...wEl.map((_, i) => i).filter(i => i % 2 === 1)] : wEl.map((_, i) => i);
  const wallMat = { hpile: STEEL, sheet: mat(0x56677a, { metal: 0.6, rough: 0.4 }), cip: mat(0x8e8e94), scw: mat(0x9b9282, { rough: 0.95 }), dwall: mat(0x86868c), nail: mat(0x9a9aa0, { rough: 1 }) }[WL] || CONC;
  const wCap = WL === 'hpile' ? wEl.length * 3 + 6 : WL === 'sheet' ? wEl.length * 4 + 8 : WL === 'scw' ? wEl.length + 6 : wEl.length + 6;
  const wP = wallReal ? pool(WL === 'cip' || WL === 'scw' ? CYL : BOX, wallMat, Math.max(8, wCap), 'wall') : null;
  const wP2 = wallReal ? pool(BOX, WL === 'dwall' ? mat(0x55565b) : WL === 'scw' ? STEEL : CONC_L, WL === 'scw' ? Math.ceil(wEl.length / 2) * 3 + 8 : wEl.length + 20, 'wall') : null;
  const capP = wallReal && ['cip', 'scw', 'dwall'].includes(WL) ? pool(BOX, CONC_L, 10, 'wall') : null; // 캡빔 · 가이드월 // H형강 삽입 · 이음 · 가이드월 · 캡빔
  const lagM = texM(tex(plankTex()), { rough: 0.9 });
  const lagP = WL === 'hpile' && wallReal ? pool(BOX, lagM, Math.min(2400, (wEl.length + 2) * Math.ceil(depth / 1.5 + 1)), 'wall') : null;
  const slurM = mat(0x8a6a3c, { op: 0.72 }), slurP = WL === 'dwall' ? pool(BOX, slurM, 2, 'wall') : null; if (slurP) slurP.im.userData.noMirror = true;
  const nailHead = WL === 'nail' && depth > 0.5 ? pool(BOX, mat(0xd9d9de, { metal: 0.5 }), Math.min(2000, Math.ceil(Ltot / 1.5 + 2) * Math.ceil(depth / 1.5 + 1)), 'wall') : null;
  const nailBar = WL === 'nail' && depth > 0.5 ? pool(BOX, mat(0xd9822b, { em: 0.15 }), 80, 'wall') : null;
  const openW = WL === 'open' && depth > 0.5 ? pool(WEDGE, soilM, 3, null) : null;
  const openT = WL === 'open' && depth > 0.5 ? pool(BOX, mat(0x4f7fb0, { op: 0.8 }), 3, 'wall') : null;
  const openB = WL === 'open' && depth > 0.5 ? pool(BOX, mat(0xd8cfa8), 420, 'wall') : null;
  const wRing = pool(TOR, RING, 4, 'wall'); wRing.im.userData.noMirror = true;
  let wRig = null, wCrane = null, wPlant = null, nailRig = null;
  if (wallReal) {
    if (WL === 'sheet' || WL === 'dwall') {
      wCrane = crawlerCrane(WL === 'dwall' ? 24 : 20, 'wall', 1.22);
      if (WL === 'sheet') { pbox(wCrane.att, DARK2, null, -0.55, 0.55, -2.4, 0, -0.7, 0.7); pbox(wCrane.att, EQ, 'wall', -0.6, 0.6, -0.8, -0.3, -0.75, 0.75); pbox(wCrane.att, DARK, null, -0.2, 0.2, -3.0, -2.4, -0.35, 0.35); }
      else { pbox(wCrane.att, DARK2, null, -th / 2, th / 2, -7, 0, -1.35, 1.35); pbox(wCrane.att, EQ, 'wall', -th / 2 - 0.05, th / 2 + 0.05, -1.2, -0.4, -1.4, 1.4); [-0.68, 0.68].forEach(z => pcyl(wCrane.att, mat(0x9a9aa0, { metal: 0.6 }), null, 0, -7.2, z, 0.66, th * 0.9, 'x')); wCrane.att.userData.pipe = true; }
      if (WL === 'dwall') { wPlant = grp(); [0, 3.2].forEach(z => pcyl(wPlant, mat(0x2f7fd0), 'wall', 1.3, 3.2, z, 1.2, 6.4)); pbox(wPlant, WHITE, 'wall', 0, 3.4, 0, 3.2, 5, 10); pbox(wPlant, mat(0x8a6a3c), null, 0.3, 3.1, 3.2, 3.5, 5.3, 9.7); }
    } else if (WL !== 'nail') wRig = leaderRig(Math.min(24, Math.max(14, emb + 4)), WL === 'scw' ? 'triple' : 'auger', 'wall');
    else { nailRig = grp(); tracks(nailRig, 3.6, 2.4); pbox(nailRig, EQ, 'wall', -1.4, 0.6, 1.1, 2.2, -1, 1); nailRig.userData.mast = link(nailRig, EQ, 'wall', 0.4, 2.0, 0, 3.4, 1.6, 0, 0.3); link(nailRig, STEEL, null, 2.2, 1.7, 0, 4.2, 1.2, 0, 0.08); }
  }

  // ================= 지보 =================
  const SP = ids.support;
  const supOn0 = depth > 0.5 && WL !== 'open' && SP !== 'self';
  const lvN = R.lv.length, szN = R.strutZ.length;
  const supP = supOn0 ? pool(BOX, mat(SP === 'sps' ? 0x7f93a8 : 0xcf6a3a, { metal: 0.45, rough: 0.5 }), SP === 'sps' ? 900 : 120 + lvN * (szN * 3 + 40) + Math.ceil(Ltot / 2) * lvN * 2, 'support') : null;
  const supJ = supOn0 ? pool(BOX, mat(0xffd23a, { em: 0.15 }), lvN * (szN + 4 + Math.ceil(Ltot / 2)) + 30, 'support') : null;
  const ancT = SP === 'anchor' && supOn0 ? pool(BOX, mat(0xfffff8, { metal: 0.5 }), lvN * 4 + 4, 'support', true) : null;
  const ancG = SP === 'anchor' && supOn0 ? pool(CYL, mat(0xb0aba0), lvN * 2 + 2, 'support') : null;
  const kpP = (SP === 'topdown' || ids.base === 'topdown' || ids.base === 'updown') && depth > 0.5 ? pool(BOX, mat(0x6f8296, { metal: 0.5 }), 5 * Math.max(1, szN) * 3 + 6, 'support') : null;
  const kickP = SP === 'raker' && supOn0 ? pool(BOX, CONC, szN * 2 + 2, 'support') : null;
  const bermW = SP === 'raker' && supOn0 ? pool(WEDGE, soilM, 2, null) : null;
  const bermB = SP === 'raker' && supOn0 ? pool(BOX, soilM, 2, null) : null;
  let ancRig = null; if (SP === 'anchor' && supOn0) { ancRig = grp(); tracks(ancRig, 3.8, 2.4); pbox(ancRig, EQ, 'support', -1.5, 0.7, 1.1, 2.3, -1, 1); link(ancRig, EQ, 'support', 0.2, 2.0, 0, 4.4, 0.6, 0, 0.32); link(ancRig, STEEL, null, 3.0, 1.1, 0, 5.4, 0.2, 0, 0.09); }

  // ================= 차수 =================
  const WA = ids.water;
  const grP = (WA === 'grout' || WA === 'jsp') && depth > 0.5 ? pool(WA === 'jsp' ? CYL : SPH, mat(WA === 'jsp' ? 0xb7c8d8 : 0x9fc6e8, { op: 0.85 }), WA === 'jsp' ? 240 : 900, 'water') : null;
  const wellP = WA === 'dewater' && depth > 0.5 ? pool(CYL, mat(0x2f7fd0, { metal: 0.3 }), 80, 'water') : null;
  const pipeP = pool(CYL, mat(0x5f6066, { metal: 0.5 }), 220, null);
  const drainP = WA === 'drain' ? pool(BOX, mat(0x2b2b2b), 4, 'water') : null;
  const upAnc = WA === 'anchor' ? pool(BOX, mat(0xd9822b, { metal: 0.4 }), 260, 'water') : null;
  const wtM = new THREE.MeshStandardMaterial({ color: 0x3d8fd6, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, roughness: 0.3 }); own.mats.push(wtM);
  const wtGeo = geo(new THREE.PlaneGeometry(1, 1, 48, 10).rotateX(-Math.PI / 2)); const wtable = new THREE.Mesh(wtGeo, wtM); wtable.visible = false; root.add(wtable);
  const wtBase = Float32Array.from(wtGeo.attributes.position.array);
  const PITW = waterSurface(0x5b6f62, { opacity: 0.86, scale: 1 / 4, ns: 0.45 }); own.mats.push(PITW); // 굴착 바닥에 고인 흙탕물
  const waterIn = pool(BOX, PITW, 2, 'water'); waterIn.im.userData.noMirror = true;

  // ================= 굴착 =================
  const EX = ids.excav;
  const ex1 = depth > 0.5 ? excavator('bucket') : null, ex2 = depth > 0.5 && (SP === 'topdown' || pw > 44) ? excavator('bucket', 0.9) : null;
  const ex3 = depth > 0.5 && (EX === 'splitter' || EX === 'normal') ? excavator(EX === 'splitter' ? 'split' : 'breaker', 0.95) : null;
  let clam = null; if (depth > 7 || (SP === 'topdown' && depth > 2)) {
    clam = crawlerCrane(22, 'excav', 1.22);
    rb(clam.att, DARK2, null, -0.55, 0.55, -0.5, 0.7, -0.38, 0.38, 0.08); pcyl(clam.att, DARK, null, 0, 0.75, 0, 0.3, 0.3, 'z'); // 머리 블록 · 도르래
    clam.att.userData.halves = [-1, 1].map(sg => { const h = mesh(geo(clamHalfGeo(sg)), DARK2, null, clam.att); h.position.y = -0.5; h.userData.s = sg; return h; });
  }
  let drill = null; if (EX === 'blast' || EX === 'mix') {
    drill = grp(); tracks(drill, 4, 2.6); const RD = mat(0xe5484d, { metal: 0.3, rough: 0.5 });
    rb(drill, RD, 'excav', -1.7, 0.6, 1.1, 2.3, -1.15, 1.15, 0.18); rb(drill, GLASS, null, -0.35, 0.65, 2.3, 3.3, 0.15, 1.15, 0.08); rb(drill, RD, 'excav', -0.4, 0.7, 3.25, 3.4, 0.1, 1.2, 0.05);
    rb(drill, DARK2, null, -1.7, -0.9, 2.3, 3.0, -1.1, 0.0, 0.1); pcyl(drill, DARK, null, -1.3, 3.2, -0.6, 0.06, 0.5); // 집진기 · 배기
    const a = Math.atan2(7.5, 1.2), mg = new THREE.Group(); mg.position.set(1.2, 1.0, 0); mg.rotation.z = a; drill.add(mg);
    mesh(geo(latticeBoomGeo(7.6, 0.5, 0.42, false, 0.8)), RD, 'excav', mg); pcyl(mg, STEEL, null, 3.8, -0.33, 0, 0.06, 7.4, 'x'); rb(mg, DARK2, null, 5.2, 6.1, -0.45, 0.25, -0.3, 0.3, 0.06); // 마스트 · 로드 · 착암기
    link(drill, RD, 'excav', 0.2, 2.0, 0, 1.6, 4.2, 0, 0.22); link(drill, HOSE, null, -1.3, 2.6, 0.2, 1.4, 6.5, 0.2, 0.06); // 붐 · 호스
  }
  const blastP = EX === 'blast' || EX === 'mix' ? pool(CYL, TINT, 30, 'excav', true) : null;
  const matsP = EX === 'blast' || EX === 'mix' ? pool(BOX, mat(0x34353a, { rough: 1 }), 12, 'excav') : null;
  const flashP = pool(SPH, FLASH, 2, 'excav'), dustP = pool(SPH, DUST, 3, 'excav');
  const rockP = EX === 'splitter' || EX === 'normal' ? pool(BOX, mat(0x55585f, { rough: 1 }), 14, 'excav') : null;
  const holeP = pool(CYL, mat(0x1c1c1e), 30, 'excav');
  // 굴착 바닥 디테일 (뒤쪽 절반): 바퀴·궤도 자국 진흙 · 흙더미 · 물웅덩이 · 집수정 + 수중펌프 + 배수 호스 · 진입 경사로 · 측량 말뚝
  const pitD = depth > 0.5, PX0 = th, PX1 = pw - th, PZ0 = -pd / 2 + th, PZ1 = 0, PW = PX1 - PX0, PDz = PZ1 - PZ0;
  const rampOn0 = pitD && !clam && pd > 30 && pw > 24 && (WL === 'open' || !supOn0 || SP === 'anchor');
  let mudPl = null;
  if (pitD && PW > 4 && PDz > 4) {
    const mt = tex(canvasTex(1024, 512, (x, w, h) => {
      const kx = w / PW, kz = h / PDz, k = (kx + kz) / 2, X = (m) => (m - PX0) * kx, Z = (m) => (m - PZ0) * kz;
      x.clearRect(0, 0, w, h);
      for (let i = 0; i < 34; i++) { const cx = w * hsh(i, 21), cz = h * hsh(i, 22), r = (1.5 + 5 * hsh(i, 23)) * k; const gr = x.createRadialGradient(cx, cz, 0, cx, cz, r); gr.addColorStop(0, `rgba(36,29,21,${0.25 + 0.25 * hsh(i, 25)})`); gr.addColorStop(1, 'rgba(36,29,21,0)'); x.fillStyle = gr; x.fillRect(cx - r, cz - r, 2 * r, 2 * r); } // 젖은 얼룩
      const path = (p, off) => { x.beginPath(); const [a, b, c] = p, nx = -(c[1] - a[1]), nz = c[0] - a[0], L = Math.hypot(nx, nz) || 1, ox = nx / L * off, oz = nz / L * off; x.moveTo(X(a[0] + ox), Z(a[1] + oz)); x.quadraticCurveTo(X(b[0] + ox), Z(b[1] + oz), X(c[0] + ox), Z(c[1] + oz)); };
      const band = (p, gauge, tw, dash, a1, a2) => [-1, 1].forEach(sg => { path(p, sg * gauge / 2); x.setLineDash([]); x.lineWidth = tw * k; x.strokeStyle = `rgba(42,34,25,${a1})`; x.stroke(); x.setLineDash([dash[0] * k, dash[1] * k]); x.lineWidth = tw * k * 0.9; x.strokeStyle = `rgba(24,19,14,${a2})`; x.stroke(); });
      const rp = (i, j) => [PX0 + 3 + (PW - 6) * hsh(i, j), PZ0 + 3 + (PDz - 5) * hsh(i, j + 1)];
      for (let i = 0; i < 9; i++) band([rp(i, 30), rp(i, 32), rp(i, 34)], 2.6, 0.6, [0.12, 0.16], 0.3, 0.32); // 궤도 자국
      if (rampOn0) for (let i = 0; i < 4; i++) band([[PX1 - 4, PZ0 + 3 + i * 0.6], rp(i, 40), rp(i, 42)], 2.0, 0.42, [0.08, 0.1], 0.28, 0.24); // 덤프 바퀴 자국
      x.setLineDash([]); x.lineCap = 'round';
      for (let i = 0; i < 16; i++) { const [cx, cz] = rp(i, 50), a = hsh(i, 52) * 6.28, L = 1.5 + 3 * hsh(i, 53); for (let t = 0; t < 5; t++) { const o = (t - 2) * 0.24, px = -Math.sin(a) * o, pz = Math.cos(a) * o; x.beginPath(); x.moveTo(X(cx + px), Z(cz + pz)); x.lineTo(X(cx + px + Math.cos(a) * L), Z(cz + pz + Math.sin(a) * L)); x.lineWidth = 0.07 * k; x.strokeStyle = 'rgba(28,22,16,0.4)'; x.stroke(); } } // 버킷 이빨 자국
    }));
    const mm = new THREE.MeshStandardMaterial({ map: mt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, roughness: 0.7, metalness: 0 }); own.mats.push(mm);
    mudPl = new THREE.Mesh(geo(new THREE.PlaneGeometry(PW, PDz).rotateX(-Math.PI / 2)), mm); mudPl.position.set((PX0 + PX1) / 2, 0, (PZ0 + PZ1) / 2); mudPl.visible = false; mudPl.renderOrder = 1; root.add(mudPl);
  }
  const spoilP = pitD ? pool(geo(moundGeo(3)), mat(0xffffff, { tex: 'soil', rough: 1 }), 8, null, true) : null;
  const pudP = pitD ? pool(geo(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2)), PITW, 6, null) : null;
  const PUD = pitD ? [[PX0 + 3.6, PZ0 + 3.4, 1.3], ...[0, 1, 2, 3].map(i => [PX0 + 6 + (PW - 12) * hsh(i, 61), PZ0 + 5 + Math.max(0, PDz - 9) * hsh(i, 62), 0.9 + 1.6 * hsh(i, 63)])] : [];
  const sumpOn0 = pitD && WL !== 'open' && PW > 10 && PDz > 8;
  const sumpC = sumpOn0 ? pool(BOX, CONC, 5, null) : null, sumpW = sumpOn0 ? pool(BOX, PITW, 1, null) : null, hoseP = sumpOn0 ? pool(CYL, mat(0x2f7fd0, { rough: 0.5 }), 10, null) : null;
  let pumpG = null; if (sumpOn0) { pumpG = grp(); pcyl(pumpG, mat(0x2f7fd0, { metal: 0.4, rough: 0.4 }), null, 0, 0.32, 0, 0.2, 0.62); pcyl(pumpG, DARK2, null, 0, 0.68, 0, 0.16, 0.12); link(pumpG, STEEL, null, -0.16, 0.7, 0, 0.16, 0.7, 0, 0.03); [-0.16, 0.16].forEach(x => link(pumpG, STEEL, null, x, 0.62, 0, x, 0.72, 0, 0.03)); link(pumpG, HOSE, null, 0, 0.7, 0, -0.9, 0.9, 0.6, 0.03); }
  const rampP = rampOn0 ? pool(WEDGE, mat(SOILC[topSoil] ?? 0xa88a5e, { tex: 'soil', rough: 1 }), 1, null) : null;
  const dumpT = rampOn0 && pd > 34 ? dumpTruck() : null;
  const railP = pitD ? pool(BOX, mat(0xf2c94c, { rough: 0.5, metal: 0.3 }), 80, null) : null, postP = pitD ? pool(BOX, DARK2, 420, null) : null; // 터 둘레 안전 난간
  const stakeP = pitD ? pool(BOX, WOODM, 10, null) : null, tapeP = pitD ? pool(BOX, mat(0xff4fa0, { em: 0.15 }), 10, null) : null;

  // ================= 기초 =================
  const FD = ids.found, piled = FD !== 'mat';
  let pSp = { phc: 3, steel: 3, bored: 6, micro: 1.6, piledraft: 4.5 }[FD] || 3;
  let piles = [];
  const mkPiles = () => { piles = []; const xs = []; for (let x = 2.5; x <= pw - 2.5 + 1e-6; x += pSp) xs.push(x); const zs = []; for (let z = -0.9; z >= -pd / 2 + th + 1.2; z -= pSp) zs.push(z); zs.forEach((z, r) => (r % 2 ? [...xs].reverse() : xs).forEach(x => piles.push([x, z]))); };
  if (piled) { mkPiles(); while (piles.length > 520) { pSp *= 1.15; mkPiles(); } }
  const pileR = { phc: 0.25, steel: 0.3, bored: 0.75, micro: 0.13, piledraft: 0.4 }[FD] || 0.3;
  const pileM = { phc: mat(0xc6c6ca), steel: mat(0x6f8296, { metal: 0.6, rough: 0.4 }), bored: mat(0x9a9aa0), micro: mat(0x8fa1b5, { metal: 0.5 }), piledraft: mat(0xa3a3a8) }[FD] || CONC;
  const plP = piled ? pool(CYL, pileM, piles.length + 4, 'found') : null;
  const plJ = piled && (FD === 'phc' || FD === 'steel') ? pool(CYL, mat(FD === 'phc' ? 0x55565b : 0xd9d9de, { metal: 0.5 }), Math.min(1600, piles.length * 4 + 8), 'found') : null;
  const plCase = FD === 'bored' ? pool(CYL, mat(0x5a6b7d, { metal: 0.6 }), 3, 'found') : null; if (plCase) plCase.im.userData.noMirror = true;
  const cageM = mat(0xd9822b, { wire: true }), plCage = FD === 'bored' ? pool(CYL, cageM, piles.length + 4, 'found') : null;
  const fRing = pool(TOR, RING, 4, 'found'); fRing.im.userData.noMirror = true;
  let fRig = null, rcd = null;
  if (piled) {
    if (FD === 'bored') { rcd = grp(); pbox(rcd, DARK2, 'found', -1.6, 1.6, 0, 1.4, -1.6, 1.6); pbox(rcd, EQ, 'found', -1.7, 1.7, 1.4, 1.9, -1.7, 1.7); rcd.userData.kelly = pcyl(rcd, STEEL, null, 0, 5, 0, 0.22, 7); pbox(rcd, EQ, 'found', -2.6, -1.6, 0, 4.6, -0.5, 0.5); pbox(rcd, EQ, 'found', -2.6, 0.4, 4.4, 4.9, -0.5, 0.5); fRig = crawlerCrane(20, 'found', 1.28); }
    else fRig = leaderRig(FD === 'micro' ? 8 : 20, FD === 'micro' ? 'drill' : 'hammer', 'found', FD === 'micro' ? 0x3fae6a : EQC);
  }
  const rebT = tex(gridT('#e07b2a', 8, 4)), rebM = texM(rebT, { op: 0.95, side: THREE.DoubleSide, alphaTest: 0.3 }); rebM.transparent = true; rebM.depthWrite = false;
  const matRb = [0, 1].map(() => { const o = new THREE.Mesh(geo(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), rebM); o.visible = false; root.add(o); return o; });
  const chairP = pool(BOX, mat(0xd9822b), 260, 'found');
  const leanP = pool(BOX, mat(0x8a8a90), 1, 'found');

  // ================= 지하 방수 · 지하 골조 =================
  const BW = ids.bwp, bwSeam = pool(BOX, mat({ sheet: 0x111111, pre: 0x7fb6e6, bento: 0x6e4e24, cryst: 0x6f7a86, tank: 0xff8a3d }[BW] ?? 0x111111, { em: BW === 'tank' ? 0.3 : 0 }), 520, 'bwp');
  const bwIn = BW === 'cryst' ? pool(BOX, mat(0xc9c9cd, { op: 0.92 }), 4, 'bwp') : null;
  const baseX = pool(BOX, CONC, 40, 'base');

  // ================= 지상 골조 =================
  const FT = ids.frame;
  const xsF = D.colsX, zsF = D.colsZ;
  const maxX = Math.max(2, ...xsF.map(a => a.length)), nZ = Math.max(2, ...zsF.map(a => a.length)), perF = maxX * nZ + maxX + nZ;
  const steelSk = ['steel', 'hybrid', 'stick', 'src', 'module'].includes(FT);
  const ahead = { steel: 3, stick: 2, hybrid: 2, src: 2, module: 0 }[FT] || 0;
  const stP = pool(BOX, TINTS, steelSk || FT === 'truss' ? Math.min(30000, NF * (perF + 30) + 6 * perF * 3 + 400) : 400, 'frame', true);
  const rcP = pool(BOX, clipM(0x9c9ca2), FT === 'rcwall' ? NF * (maxX * 7 + 8) + 20 : ['rcframe', 'src'].includes(FT) ? NF * (maxX + nZ) + 20 : 20, 'frame');
  const pcP = pool(BOX, clipM(0xd2cdc3), FT === 'pc' ? NF * (maxX + nZ) * 2 + 400 : 20, 'frame');
  const nMods = Math.max(2, Math.round((G.bx1 - G.bx0) / 3.6));
  const modP = FT === 'modular' || FT === 'module' ? pool(BOX, TINTC, NF * (nMods * 2 + 2) + 20, 'frame', true) : null;
  const pipeR = FT === 'module' ? pool(CYL, TINTC, NF * maxX * 3 + 12, 'frame', true) : null;
  // 플랜트 모듈 안의 설비 (세운 용기·누운 드럼) / 현장 조립 철골의 부재 적치장
  const eqP = FT === 'module' ? pool(CYL, TINTC, NF * maxX * (nZ + 1) + 24, 'frame', true) : null;
  const layP = FT === 'stick' || FT === 'module' ? pool(BOX, TINTS, 120, 'frame', true) : null;
  // 플랜트 철골은 콘크리트 슬래브 대신 그레이팅 바닥 (속이 비쳐 설비·배관이 보인다)
  const gratM = FT === 'stick' || FT === 'module' ? texM(tex((() => { const t = gridT('#c9ced6', 5, 2); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((G.bx1 - G.bx0) / 3, (bd || 20) / 3); return t; })()), { alphaTest: 0.5, metal: 0.4, rough: 0.5, side: THREE.DoubleSide, clip: true }) : null;
  const gratP = gratM ? pool(BOX, gratM, NF + 2, 'frame') : null;
  const deckM = texM(tex(corrTex()), { metal: 0.5, rough: 0.5, clip: true, side: THREE.DoubleSide }); deckM.map.repeat.set((G.bx1 - G.bx0) / 2.4, 1);
  const deckP = pool(BOX, deckM, 8, 'frame');
  const seamP = pool(BOX, clipM(0x4a4c52), FT === 'pc' ? 400 : 10, 'frame');

  // ================= 거푸집 · 철근 · 타설 · 철골 접합 =================
  const FM = ids.form;
  const woodP = pool(BOX, clipM(0xc58a4a), FM === 'conv' ? 900 : 10, 'form');
  const shoreP = pool(BOX, clipM(0xd7dbe0, { metal: 0.5 }), FM === 'conv' || FM === 'alform' ? 1600 : 10, 'form');
  const alP = pool(BOX, clipM(0xc8ccd2, { metal: 0.6, rough: 0.35 }), FM === 'alform' ? NF * 0 + maxX * 6 + 240 : 10, 'form');
  const gangP = pool(BOX, clipM(0x6f7782, { metal: 0.5 }), FM === 'gang' ? 80 : 4, 'form');
  const ribP = pool(BOX, clipM(0xff8a3d), FM === 'gang' ? 420 : 4, 'form');
  const platP = pool(BOX, clipM(0xd9a23a, { metal: 0.3 }), FM === 'gang' || FM === 'acs' || FM === 'slip' ? 140 : 4, 'form');
  const scrM = clipM(0x6d859e, { op: 0.9, tex: 'panel', metal: 0.4, rough: 0.5 }), scrP = pool(BOX, scrM, FM === 'acs' ? 12 : 4, 'form');
  const yokeP = pool(BOX, clipM(0x3a3b40, { metal: 0.5 }), FM === 'slip' || FM === 'acs' ? 220 : 4, 'form');
  const rodP = pool(BOX, clipM(0xd9822b), 420, 'rebar');
  const cplP = pool(CYL, clipM(0x9aa3ad, { metal: 0.6 }), ids.rebar === 'coupler' ? 300 : 4, 'rebar');
  const yardP = pool(BOX, TINT, 120, 'rebar', true);
  const cageYard = ids.rebar === 'cage' ? pool(CYL, cageM, 8, 'rebar') : null;
  const filmP = pool(BOX, clipM(ids.pour === 'winter' ? 0xf2f4f7 : 0x5fd0e6, { op: ids.pour === 'winter' ? 0.55 : 0.35 }), 6, 'pour');
  const heatP = pool(BOX, clipM(0xff5a3d, { em: 0.9 }), ids.pour === 'winter' ? 24 : 2, 'pour');
  const cpbP = pool(BOX, mat(0xd9822b, { metal: 0.3 }), 8, 'pour');
  const pumps = [0, 1, 2].map(() => pumpTruck()), mixers = [0, 1, 2, 3].map(() => mixerTruck());
  // 펌프카는 레미콘이 오는 차로 방향을 마주 보게 세운다 (뒤 호퍼에 레미콘이 후진해 붙는다)
  const LNS = sc.city.lanes, PNOSE = -(LNS[LNS.length > 1 ? 1 : 0] || { dir: -1 }).dir, PYAW = PNOSE > 0 ? 0 : Math.PI;
  let stat = null; if (ids.pour === 'cpb' || ids.pour === 'highp') { stat = grp(); [0, 1].forEach(i => { const z0 = i * 3.4; pbox(stat, mat(ids.pour === 'highp' ? 0xe5484d : 0xd9822b), 'pour', -1.1, 1.1, 0.4, 2.4, z0, z0 + 2.9); pbox(stat, DARK2, null, -1.15, 1.15, 0, 0.45, z0 + 0.1, z0 + 2.8); const h = mesh(CONE, DARK2, null, stat); h.position.set(0, 2.9, z0 + 0.6); h.scale.set(1.4, 1, 1.4); h.rotation.z = Math.PI; }); }
  const wldP = pool(BOX, TINTC, 160, 'steel', true);
  const lasP = pool(BOX, mat(0xff2a2a, { em: 1.6 }), 8, 'steel');
  let blockYard = null; if (ids.steel === 'block') blockYard = pool(BOX, STEEL, 120, 'steel');

  // ================= 양중 (크레인 · 호이스트) =================
  const LF = ids.lift;
  if (R.mast) { swapLattice(R.mast, EQC, 1, 10); swapLattice(R.jib, EQC, 10, 1); swapLattice(R.cjib, EQC, 4, 1); swapLattice(R.apex, EQC, 1, 4); }
  if (R.hMast) swapLattice(R.hMast, 0x9a9aa0, 1, 10);
  const crx = R.crane, slew = R.slew;
  const crExtra = new THREE.Group(); crx.add(crExtra); // 하부 (크롤러·트럭·링)
  const slX = new THREE.Group(); slew.add(slX); // 선회부에 붙는 것 (펜던트·트롤리·A프레임·텔레스코픽)
  if (LF === 'crawler') { tracks(crExtra, 9, 6.2); pbox(crExtra, EQ, 'lift', -3, 3, 1.15, 3.0, -2.4, 2.4); }
  if (LF === 'mobile') { const tg = new THREE.Group(); tg.rotation.y = Math.PI / 2; crExtra.add(tg); truckBody(tg, 13, WHITE, 0xf0b429); pbox(tg, EQ, 'lift', -1.3, 1.3, 1.05, 2.0, -6.3, 4.3); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { pbox(tg, EQ, 'lift', sx > 0 ? 1.2 : -4.6, sx > 0 ? 4.6 : -1.2, 0.9, 1.4, sz * 4.2 - 0.3, sz * 4.2 + 0.3); pbox(tg, DARK2, null, sx * 4.4 - 0.6, sx * 4.4 + 0.6, 0, 0.9, sz * 4.2 - 0.6, sz * 4.2 + 0.6); }); }
  if (LF === 'ringer') { const rg = mesh(geo(new THREE.TorusGeometry(13, 0.9, 8, 48).rotateX(Math.PI / 2)), DARK2, 'lift', crExtra); rg.position.y = 0.9; for (let k = 0; k < 10; k++) { const a = Math.PI * (0.7 + 0.06 * k); pbox(crExtra, mat(0x77777d), null, Math.cos(a) * 13 - 1.4, Math.cos(a) * 13 + 1.4, 1.8, 5.5, Math.sin(a) * 13 - 1.4, Math.sin(a) * 13 + 1.4); } pbox(crExtra, EQ, 'lift', -4, 4, 0, 3.2, -4, 4); }
  const tele = LF === 'mobile' ? [1.25, 1.05, 0.85, 0.68].map(w => { const o = mesh(BOX, EQ, 'lift', slX); o.userData.w = w; return o; }) : [];
  const pend = [0, 1, 2].map(() => mesh(BOX, ROPE, null, slX));
  const trol = mesh(BOX, DARK2, null, slX), aF = [0, 1].map(() => mesh(BOX, EQ, 'lift', slX));
  const tieP = pool(BOX, mat(EQC, { metal: 0.3, rough: 0.5 }), 40, 'lift');
  const hoistX = pool(BOX, mat(0x9a9aa0, { metal: 0.4 }), 260, 'hoist');
  // 훅에 매다는 짐: 공종·공법마다 다르다
  const hookG = new THREE.Group(); slew.add(hookG);
  const hk = {}; const hkAdd = (k, fn) => { const g = new THREE.Group(); g.visible = false; hookG.add(g); fn(g); hk[k] = g; };
  hkAdd('pallet', g => { pbox(g, mat(0x8fa1b5, { metal: 0.4 }), null, -1.4, 1.4, -2.6, -1.0, -1, 1); pbox(g, mat(0xd9822b), null, -1.45, 1.45, -1.8, -1.6, -1.05, 1.05); });
  hkAdd('beam', g => { [[-4, -2.95, -2.85], [-4, -3.65, -3.55]].forEach(([a, y0, y1]) => pbox(g, STEEL, null, a, -a, y0, y1, -0.18, 0.18)); pbox(g, STEEL, null, -4, 4, -3.6, -2.9, -0.03, 0.03); });
  hkAdd('pmod', g => { const S2 = mat(0x8fa1b5, { metal: 0.5 }); [[-4.5, -1.8], [4.5, -1.8], [-4.5, 1.8], [4.5, 1.8]].forEach(([x, z]) => pbox(g, S2, null, x - 0.2, x + 0.2, -7.6, -1.4, z - 0.2, z + 0.2)); [-7.6, -4.5, -1.6].forEach(y => { pbox(g, S2, null, -4.5, 4.5, y - 0.2, y, -1.9, -1.7); pbox(g, S2, null, -4.5, 4.5, y - 0.2, y, 1.7, 1.9); }); link(g, S2, null, -4.5, -7.4, -1.8, 4.5, -1.6, -1.8, 0.15); [[0x3d8fd6, -0.6], [0xd9822b, 0.3], [0x3fae6a, 1.0]].forEach(([c, z]) => { const o = pcyl(g, mat(c, { metal: 0.3 }), null, 0, -3.2, z, 0.22, 9.4, 'x'); void o; }); pcyl(g, mat(0xd9dce0, { metal: 0.5 }), null, -2, -4.6, 0, 1.0, 5.0); });
  hkAdd('pc', g => { pbox(g, mat(0xd2cdc3), null, -3.6, 3.6, -3.4, -2.6, -0.6, 0.6); });
  hkAdd('module', g => { pbox(g, mat(0xe9e6df), null, -5, 5, -4.6, -1.4, -1.8, 1.8); pbox(g, GLASS, null, 5.0, 5.05, -4.0, -2.0, -1.2, 1.2); pbox(g, DARK2, null, -5.05, 5.05, -1.45, -1.35, -1.85, 1.85); });
  hkAdd('gang', g => { pbox(g, mat(0x6f7782, { metal: 0.5 }), null, -3, 3, -8.5, -1.2, -0.12, 0.12); for (let x = -2.6; x <= 2.6; x += 1.04) pbox(g, ORANGE, null, x - 0.05, x + 0.05, -8.5, -1.2, 0.12, 0.25); [-6.4, -3.6].forEach(y => pbox(g, mat(0xd9a23a), null, -3, 3, y - 0.06, y, 0.25, 1.2)); });
  hkAdd('cage', g => { const o = mesh(CYL, cageM, null, g); o.position.set(0, -4.4, 0); o.scale.set(1.0, 6, 1.0); });
  hkAdd('bucket', g => { const c = mesh(CONE, mat(0x8d8d93, { metal: 0.4 }), null, g); c.position.set(0, -2.6, 0); c.scale.set(2.2, 1.8, 2.2); c.rotation.z = Math.PI; pcyl(g, mat(0x8d8d93, { metal: 0.4 }), null, 0, -1.4, 0, 1.1, 0.8); pcyl(g, DARK, null, 0, -3.6, 0, 0.18, 0.3); });
  hkAdd('unit', g => { pbox(g, mat(0x9cc8ee, { op: 0.6 }), null, -0.75, 0.75, -5.6, -1.4, -0.08, 0.08); pbox(g, WHITE, null, -0.8, 0.8, -1.6, -1.4, -0.1, 0.1); pbox(g, WHITE, null, -0.8, -0.72, -5.6, -1.4, -0.1, 0.1); pbox(g, WHITE, null, 0.72, 0.8, -5.6, -1.4, -0.1, 0.1); });
  hkAdd('panel', g => { pbox(g, mat(0xd3cfc6), null, -1.5, 1.5, -5.4, -1.4, -0.12, 0.12); pbox(g, mat(0x3f4a57), null, -0.95, 0.95, -4.4, -2.2, 0.12, 0.14); });
  hkAdd('mpanel', g => { pbox(g, mat(0xc3ccd6, { metal: 0.5 }), null, -0.5, 0.5, -8.2, -1.4, -0.06, 0.06); });
  hkAdd('block', g => { const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8, 7, 8)), new THREE.LineBasicMaterial({ color: 0x8fa1b5 })); e.position.y = -5.3; g.add(e); own.geos.push(e.geometry); own.mats.push(e.material); for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) pbox(g, STEEL, null, x - 0.25, x + 0.25, -8.8, -1.8, z - 0.25, z + 0.25); [-1.8, -5.3, -8.8].forEach(y => { pbox(g, STEEL, null, -4, 4, y - 0.2, y + 0.2, -4.2, -3.8); pbox(g, STEEL, null, -4, 4, y - 0.2, y + 0.2, 3.8, 4.2); }); });
  const slings = [0, 1, 2, 3].map(() => mesh(BOX, ROPE, null, hookG)); const hookBlk = pbox(hookG, DARK2, null, -0.3, 0.3, -0.6, 0, -0.3, 0.3);
  hookBlk.visible = false; const hookB = mesh(geo(hookBlockGeo()), DARK2, null, hookG);
  // 실제 격자 트러스 크레인 (격자 무늬 상자 대신): 마스트 마디를 쌓고 지브·카운터 지브 마디를 잇는다
  const CR = R.mast ? (() => {
    const jibG = new THREE.Group(); slew.add(jibG); const cwG = new THREE.Group(); slew.add(cwG);
    const o = {
      mastI: inst(geo(mastSectionGeo()), EQ, 200, 'lift', crx), jibG, jibI: inst(geo(jibSectionGeo()), EQ, 90, 'lift', jibG), cjI: inst(geo(cjibSectionGeo()), EQ, 16, 'lift', slew),
      head: mesh(geo(catHeadGeo()), EQ, 'lift', slew), slw: mesh(geo(slewGeo()), EQ, 'lift', slew),
      cabM: mesh(geo(cabGeo()), mat(0xdfe2e6, { metal: 0.3, rough: 0.4 }), null, slew), cabG: mesh(geo(cabGlassGeo()), mat(0x2a3a48, { metal: 0.6, rough: 0.08 }), null, slew),
      cwG, base: mesh(geo(craneBaseGeo()), CONC, null, crx),
    };
    mesh(geo(counterweightGeo()), CONC_L, null, cwG); mesh(geo(cwFrameGeo()), DARK2, null, cwG);
    return o;
  })() : null;
  const HO = R.hMast ? (() => {
    const netM = texM(tex(meshTex('#c9ced6', 8, 2)), { metal: 0.4, rough: 0.5, side: THREE.DoubleSide, alphaTest: 0.4 });
    return { mI: inst(geo(hoistMastGeo()), mat(0x9a9aa0, { metal: 0.45, rough: 0.5 }), 260, 'hoist'), cars: [R.hCar, R.hCar2].map(c => { const g = new THREE.Group(); root.add(g); mesh(geo(hoistCarGeo()), mat(EQC, { metal: 0.3, rough: 0.5 }), 'hoist', g); mesh(geo(hoistMeshGeo()), netM, null, g); return { c, g }; }) };
  })() : null;
  const runI = (im, n, cap, fn) => { const k = Math.min(cap, Math.max(0, n)); for (let i = 0; i < k; i++) { fn(i); im.setMatrixAt(i, M4); } im.count = k; im.instanceMatrix.needsUpdate = true; };
  const slingTo = { pallet: [[-1.3, -1.0, -0.9], [1.3, -1.0, 0.9]], beam: [[-2.8, -2.85, 0], [2.8, -2.85, 0]], pc: [[-2.6, -2.6, 0], [2.6, -2.6, 0]], module: [[-4.6, -1.35, -1.6], [4.6, -1.35, -1.6], [-4.6, -1.35, 1.6], [4.6, -1.35, 1.6]], gang: [[-2.4, -1.2, 0], [2.4, -1.2, 0]], cage: [[0, -1.4, 0]], bucket: [[-0.9, -1.0, 0], [0.9, -1.0, 0]], unit: [[-0.5, -1.4, 0], [0.5, -1.4, 0]], panel: [[-1.2, -1.4, 0], [1.2, -1.4, 0]], mpanel: [[0, -1.4, 0]], block: [[-3.8, -1.8, -3.8], [3.8, -1.8, -3.8], [-3.8, -1.8, 3.8], [3.8, -1.8, 3.8]] };

  // ================= 외장 · 지붕 =================
  const SK = ids.skin;
  const sTex = skinTex(SK); if (sTex) tex(sTex);
  const unitM = sTex ? texM(sTex.clone(), { color: R.skinGlassy ? 0x7fb6e6 : 0xffffff, op: R.skinGlassy ? 0.42 : 1, clip: true, side: THREE.DoubleSide, rough: R.skinGlassy ? 0.15 : 0.8, metal: R.skinGlassy ? 0.3 : 0.05 }) : null;
  if (unitM) { unitM.map.needsUpdate = true; unitM.map.repeat.set(1, 1); own.tex.push(unitM.map); }
  const unitP = unitM ? pool(BOX, unitM, 260, 'skin') : null;
  const spandP = SK === 'unitcw' || SK === 'stickcw' ? pool(BOX, clipM(0x3b4048, { metal: 0.3 }), NF * 4 + 8, 'skin') : null;
  const mullP = pool(BOX, clipM(0xc0c6cc, { metal: 0.6 }), SK === 'stickcw' ? 520 : 60, 'skin');
  // 비계 부재 수는 건물 높이에 비례한다 (31m 한 단에 약 1,300개)
  const scafN = Math.max(1, Math.ceil((sc.G.H || 30) / 31));
  const scafP = SK === 'wet' ? pool(BOX, clipM(0xb9bec5, { metal: 0.5 }), Math.min(14000, 2600 + scafN * 1400), 'skin') : null, scafPl = SK === 'wet' ? pool(BOX, clipM(0xd9a23a, { metal: 0.3, rough: 0.6 }), Math.min(3600, 700 + scafN * 260), 'skin') : null;
  const meshNet = SK === 'wet' ? pool(BOX, clipM(0x3fae6a, { op: 0.32 }), Math.min(96, (scafN + 6) * 4), 'skin') : null;
  let gondola = null, mewp = null;
  if (SK === 'stickcw' || SK === 'unitcw') { gondola = grp(); pbox(gondola, WHITE, 'skin', -3, 3, 0, 0.25, -0.45, 0.45); pbox(gondola, EQ, 'skin', -3, 3, 1.0, 1.08, -0.47, 0.47); [-3, 3].forEach(x => pbox(gondola, EQ, 'skin', x - 0.05, x + 0.05, 0, 1.08, -0.47, 0.47)); gondola.userData.c = [0, 1].map(() => mesh(BOX, ROPE, null)); gondola.userData.c.forEach(c => { c.visible = false; }); }
  // 굴절식 고소작업대 (붐 리프트): 차대 · 큰 바퀴 넷 · 선회체 · 카운터웨이트 · 주 붐(바깥 + 뽑혀 나오는 안쪽 단) · 지브 · 난간 달린 작업대
  if (SK === 'metal') {
    mewp = grp();
    rb(mewp, EQ, 'skin', -1.1, 1.1, 0.5, 1.12, -2.5, 2.5, 0.12);
    [-1.7, 1.7].forEach(z => [-1.18, 1.18].forEach(x => { pcyl(mewp, DARK, null, x, 0.52, z, 0.52, 0.42, 'x'); pcyl(mewp, HUB, null, x + Math.sign(x) * 0.215, 0.52, z, 0.22, 0.03, 'x'); }));
    pcyl(mewp, DARK2, null, 0, 1.22, 0.4, 0.85, 0.2);
    rb(mewp, EQ, 'skin', -0.95, 0.95, 1.32, 2.15, -0.5, 2.3, 0.12); pbox(mewp, DARK2, null, -1.0, 1.0, 1.32, 1.95, 2.3, 2.85); pbox(mewp, DARK, null, -0.96, -0.9, 1.5, 2.0, 0.2, 1.6);
    mewp.userData.a = [mesh(BOX, EQ, 'skin', mewp), mesh(BOX, WHITE, 'skin', mewp), mesh(BOX, EQ, 'skin', mewp)];
    mewp.userData.ram = [mesh(CYL, DARK2, null, mewp), mesh(CYL, CHROME, null, mewp)];
    const bk = new THREE.Group(); mewp.add(bk); mewp.userData.bk = bk;
    pbox(bk, DARK2, 'skin', -1.0, 1.0, 0, 0.06, -0.45, 0.45); pbox(bk, ORANGE, 'skin', -1.0, 1.0, 0.06, 0.2, -0.47, -0.45); pbox(bk, ORANGE, 'skin', -1.0, 1.0, 0.06, 0.2, 0.45, 0.47);
    [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45], [0, -0.45], [0, 0.45]].forEach(([x, z]) => pbox(bk, ORANGE, 'skin', x - 0.025, x + 0.025, 0, 1.1, z - 0.025, z + 0.025));
    [0.58, 1.1].forEach(y => { [-0.45, 0.45].forEach(z => pbox(bk, ORANGE, 'skin', -1.0, 1.0, y - 0.025, y + 0.025, z - 0.025, z + 0.025)); [-1, 1].forEach(x => pbox(bk, ORANGE, 'skin', x - 0.025, x + 0.025, y - 0.025, y + 0.025, -0.45, 0.45)); });
    pbox(bk, DARK, null, 0.45, 0.85, 0.85, 1.15, 0.3, 0.46); // 조작반
  }
  const RF = ids.roof, rTex = roofTex(RF);
  if (rTex && R.roofL) { tex(rTex); const m = texM(rTex, { clip: true, metal: RF === 'metal' ? 0.5 : 0.05, rough: RF === 'urethane' ? 0.35 : 0.8 }); R.roofL.material = m; R.roofL.userData.base = m; }
  const roofX = pool(CYL, DARK2, 12, 'roof'), torch = pool(CONE, mat(0xff8a3d, { em: 1.2 }), 2, 'roof');

  // ---------- 땅 투시 (흙을 반투명으로: 벽체·말뚝·개량체가 땅속에서 보이게) ----------
  const ghostOf = new Map();
  const ghostM = (m, op) => { const k = m.uuid + op; if (!ghostOf.has(k)) { const g = keepTriplanar(m, m.clone()); g.transparent = true; g.opacity = op; g.depthWrite = false; own.mats.push(g); ghostOf.set(k, g); } return ghostOf.get(k); };
  function xray(mode) { R.strata.forEach(L => L.pieces.forEach((o, i) => { const want = mode === 2 ? ghostM(L.m, 0.42) : mode === 1 && i === 3 ? ghostM(L.m, 0.13) : L.m; if (o.material !== want) o.material = want; })); }

  // ================= 장비 이름 =================
  const nm = (o, n, h) => { const g = o && (o.isObject3D ? o : o.g); if (g && g.isObject3D) { g.userData.eq = n; g.userData.eqH = h; } };
  nm(ex1, '백호 0.7㎥', 6.5); nm(ex2, '백호 0.6㎥', 6); nm(ex3, EX === 'splitter' ? '유압 할암기' : '브레이커 백호', 6);
  nm(clam, '크람쉘 · 크롤러 크레인', 26); nm(drill, '크롤러 드릴', 10);
  nm(wCrane, WL === 'dwall' ? '굴착 그래브 · 크롤러 크레인' : '진동 해머 · 크롤러 크레인', 24); if (wRig) nm(wRig, WL === 'scw' ? '3축 오거 (SCW)' : '어스오거 천공기', wRig.H + 2);
  nm(nailRig, '네일 천공기', 5); nm(ancRig, '앵커 천공기', 5);
  if (imRig) nm(imRig, IM === 'dcm' ? '심층혼합 처리기' : IM === 'scp' ? 'SCP 타설기' : 'PBD 타입기', imRig.H + 2); nm(imPlant, IM === 'dcm' ? '시멘트 사일로 · 배합 플랜트' : '진공 펌프', 11);
  if (fRig) nm(fRig, FD === 'bored' ? '크롤러 크레인 (철근망 인양)' : FD === 'micro' ? '마이크로파일 천공기' : '항타기 (유압 해머)', FD === 'bored' ? 22 : (fRig.H || 18) + 2); nm(rcd, 'RCD 굴착기', 9);
  pumps.forEach(p => nm(p, '붐 펌프카', 6)); mixers.forEach(m => nm(m, '레미콘', 4.8));
  nm(cptT, 'CPT 관입 차량', 5); nm(tripod, '시추기', 8); nm(geoBox, '물리탐사 장비', 3); nm(drone, '드론 측량', 2); nm(stat, ids.pour === 'highp' ? '초고압 콘크리트 펌프' : '고정식 콘크리트 펌프', 4.5);
  nm(gondola, '곤돌라', 3); nm(mewp, '고소 작업대', 4);
  // 작업구대 (복공판): 순타 깊은 굴착에서 게이트 옆 흙막이 안쪽 위에 깔아 크람쉘·덤프가 올라선다
  const DECK = { x0: pw - 12, x1: pw, z0: pd / 2 - 16, z1: pd / 2, cx: pw - 3.6, cz: pd / 2 - 13 };
  const deckOn0 = !!clam && SP !== 'topdown' && pw > 20;
  const wdP = deckOn0 ? pool(BOX, mat(0x7d8288, { metal: 0.45, rough: 0.55, tex: 'steel' }), 4, 'excav') : null, deckJ = deckOn0 ? pool(BOX, DARK2, 40, 'excav') : null;
  const deckB = deckOn0 ? pool(BOX, mat(0x5f6b78, { metal: 0.5, rough: 0.5 }), 60, 'excav') : null, deckR = deckOn0 ? pool(BOX, mat(0xffd23a, { em: 0.12 }), 24, 'excav') : null;
  [wdP, deckJ, deckB, deckR].forEach(q => { if (q) q.im.userData.noMirror = true; });

  // ================= 매 프레임 =================
  function frame(S) {
    pools.forEach(P => { P.n = 0; }); eqs.forEach(g => { g.visible = false; }); tagsNow.clear();
    const dyn = [], { wpId, T, K, P } = S, io = S.io || { hot: [], tags: [], bays: {} };
    const lab = (k, x, y, z, txt) => { if (k !== wpId) return; const t = txt || (SIG[k] && SIG[k][ids[k]]); if (t && !dyn.some(d => d.t === t)) dyn.push({ t, p: [x, y, z], cls: 'm' }); };
    const dug = S.dug, under = S.underV;
    const steelCol = (i) => (i < S.nF - 3 && K('steel') ? (ids.steel === 'bolt' ? 0xe2dfd5 : ids.steel === 'weld' || ids.steel === 'robot' ? 0xc4cad2 : 0x7f93a8) : 0x7f93a8);
    // 투시: 땅속 공법을 보는 공종에서만
    const xm = (wpId === 'wall' && wallReal && dug < depth - 0.5) || (wpId === 'improve' && IM) || (wpId === 'found' && piled) ? 1 : wpId === 'water' && ['grout', 'jsp', 'dewater', 'anchor'].includes(WA) && depth > 0.5 ? 2 : 0;
    xray(xm);

    // ---------- 지반조사 ----------
    R.rigI.count = 0;
    if (K('survey') && wpId === 'survey') {
      const sp = P('survey'), bores = R.bores, target = Math.min(sc.dv - 2, Math.max(depth * 1.6, cond.rockDepth + 3));
      let act = -1, actDe = 0;
      bores.forEach((bx, i) => {
        const lp = clamp(sp * bores.length - i, 0, 1); if (lp <= 0) return; const de = target * clamp(lp * 1.15, 0, 1);
        if (SV !== 'cpt') for (let m = 1.5; m < de; m += 1.5) svTick.box(bx - 0.5, bx + 0.5, -m - 0.06, -m + 0.06, 0.32, 0.42);
        if (SV === 'cpt' || SV === 'ai') { let px = null, py = 0; for (let m = 0; m < de; m += 0.5) { const q = { fill: 0.5, sand: 1.5, clay: 0.25, soil: 0.7, wr: 2.3, rock: 3.2 }[stAt(m)] ?? 0.7; const x = bx + 0.7 + q * 1.3 + 0.35 * Math.sin(m * 1.7 + i) * Math.sin(m * 0.37 + i); if (px !== null) svProf.seg(px, -py, 0.4, x, -m, 0.4, 0.11, 0.05); px = x; py = m; } }
        if (lp < 1 && act < 0) { act = i; actDe = de; }
      });
      const ax = act >= 0 ? bores[act] : bores[bores.length - 1];
      if (SV === 'cpt') { place(cptT, ax + 1, 0, -1.3, Math.PI / 2); const rd = cptT.userData.rod; segO(rd, 0, 6, -1, 0, -Math.max(0.5, actDe), -1, 0.08); lab('survey', ax + 2, 7.5, -1.3); }
      else if (act >= 0 || SV !== 'ai') {
        place(tripod, ax, 0, -1.2); const ph = frac(T * 0.8), h = ph < 0.7 ? ph / 0.7 : ph < 0.78 ? 1 - (ph - 0.7) / 0.08 : 0; tripod.userData.ham.position.y = 0.9 + 1.6 * h;
        if (SV === 'spt') lab('survey', ax + 1.8, 8.4, -1.2);
      }
      if (SV === 'geo') {
        const k = clamp((sp - 0.15) / 0.6, 0, 1), x0 = -12, x1 = pw + 12;
        for (let x = x0; x <= x1; x += 2) { svStake.box(x - 0.05, x + 0.05, -0.3, 0.55, -0.85, -0.75); }
        svStake.box(x0, x1, 0.06, 0.12, -0.82, -0.78); place(geoBox, x0 - 2, 0, -0.8);
        const lim = x0 + (x1 - x0) * k; tomo.forEach(c => { if (c.x > lim) return; const i = svTomo.box(c.x, c.x + 2.5, -c.m - 1.5, -c.m, 0.05, 0.09); if (i >= 0) svTomo.im.setColorAt(i, c.g); });
        if (sp > 0.15 && sp < 0.95) for (let j = 0; j < 3; j++) { const r = 1 + frac(T * 0.12 + j / 3) * 26; svRing.put(pw / 2, 0.12, -pd / 4, r, 1, r); }
        lab('survey', pw * 0.5, 3.5, 0.3);
      }
      if (SV === 'ai') {
        const rows = 5, u = clamp(sp * 1.15, 0, 1) * rows, r = Math.min(rows - 1, Math.floor(u)), a = u - r, dir = r % 2 ? -1 : 1, xa = -8, xb = pw + 8, z0 = -pd / 2 + 2, z1 = -1;
        const dx = dir > 0 ? lerp(xa, xb, a) : lerp(xb, xa, a), dz = lerp(z0, z1, (r + 0.5) / rows), dy = 26 + 0.4 * Math.sin(T * 2);
        if (sp < 0.98) { place(drone, dx, dy, dz); const cn = drone.userData.cone; cn.position.set(0, -dy / 2, 0); cn.scale.set(9, dy, 9); }
        for (let x = xa; x <= xb; x += 2) for (let z = z0; z <= z1; z += 2) { const rr = Math.floor((z - z0) / ((z1 - z0) / rows)), done2 = rr < r || (rr === r && (dir > 0 ? x <= dx : x >= dx)); if (done2) svDots.box(x - 0.1, x + 0.1, 0.08, 0.26, z - 0.1, z + 0.1); }
        if (sp > 0.45) { const lim = -12 + (pw + 24) * clamp((sp - 0.45) / 0.4, 0, 1); tomo.forEach(c => { if (c.x > lim) return; const i = svTomo.box(c.x, c.x + 2.5, -c.m - 1.5, -c.m, 0.05, 0.09); if (i >= 0) svTomo.im.setColorAt(i, c.a); }); }
        lab('survey', pw * 0.5, 30, -pd / 4);
      }
      if (SV === 'cpt' && act < 0) lab('survey', bores[0] + 2, 4, -1.3);
    }

    // ---------- 지반 개량 ----------
    R.impI.count = 0;
    // 땅속 개량체·차수 구근·말뚝은 지상 공종에서는 땅에 덮여 안 보이므로 그리지 않는다 (물류·공장처럼 넓은 현장에서 수십만 면)
    if (IM && K('improve') && P('improve') > 0 && S.underV) {
      const ip = P('improve'), bot = Math.max(sc.softBot, Math.min(sc.dv - 2, depth + 6)), on = ip * 1.25 * imPts.length, rr = IM === 'dcm' ? 0.8 : IM === 'scp' ? 0.36 : 0.06;
      imPts.forEach(([x, z], j) => {
        const lp = clamp(on - j, 0, 1); if (lp <= 0) return;
        const inPit = dug > 0.5 && x > 0 && x < pw, top = inPit ? -dug : IM === 'pbd' || IM === 'vac' ? 0.35 : -0.05;
        const b = -bot * lp; if (top - b < 0.1) return;
        if (IM === 'pbd' || IM === 'vac') imCol.box(x - 0.06, x + 0.06, b, top, z - 0.03, z + 0.03); else imCol.cyl(x, z, b, top, rr);
        if (!inPit && lp >= 1) { if (IM === 'pbd' || IM === 'vac') imTop.box(x - 0.08, x + 0.08, 0, 0.45, z - 0.05, z + 0.05); else imTop.cyl(x, z, -0.02, 0.1, rr * 1.35); }
        if (IM === 'scp' && (z > -1.5 || lp < 1)) for (let m = 1; m < bot * lp; m += 1.2) imBulb.cyl(x, z, -m - 0.25, -m + 0.25, 0.5);
      });
      const nx = Math.min(imPts.length - 1, Math.floor(on));
      if (wpId === 'improve' && on < imPts.length) { const [x, z] = imPts[nx], lp = frac(on); place(imRig.g, x - imRig.reach, 0, z, 0); io.hot.push({ k: 'rig', x, y: 0, z }); imRig.tool.position.y = lerp(imRig.H - imRig.La, -bot, Math.sin(Math.PI * lp)); lab('improve', x, imRig.H + 2.5, z); }
      if ((IM === 'pbd' || IM === 'vac') && ip > 0.12 && !(dug > 0.5)) { imMisc.tint(imMisc.box(-5, pw + 5, 0, 0.5, -pd / 2 + 0.5, -0.2), 0xd8c08a); }
      if (IM === 'pbd' && ip > 0.4 && P('wall') <= 0) { const hh = 5 * clamp((ip - 0.4) / 0.3, 0, 1) * (ip > 0.9 ? (1 - ip) * 10 : 1); for (let k = 0; k < 3; k++) imMisc.tint(imMisc.box(-3 + k * 3, pw + 3 - k * 3, 0.5 + hh * k / 3, 0.5 + hh * (k + 1) / 3, -pd / 2 + 1 + k * 2.5, -0.4), [0xb4935f, 0xa8875a, 0x9c7d52][k]); if (hh > 0.5) lab('improve', pw / 2, hh + 3, -pd / 4, '선행재하 성토 · 압밀 침하 기다림'); }
      if (IM === 'vac' && ip > 0.3 && P('wall') <= 0) { imMisc.tint(imMisc.box(-6, pw + 6, 0.5, 0.58, -pd / 2, 0), 0x2d4a3a); for (let z = -pd / 2 + 4; z < 0; z += 8) imMisc.tint(imMisc.box(-5, pw + 5, 0.58, 0.8, z - 0.15, z + 0.15), 0x2f7fd0); place(imPlant, -9, 0, -pd / 4); }
      if (IM === 'dcm' && wpId === 'improve') place(imPlant, pw + 1, 0, -pd / 2 + 2);
    }

    // ---------- 흙막이 ----------
    R.walls.forEach(w => { w.visible = false; });
    const wallOn = K('wall') && depth > 0.5 && P('wall') > 0, wallP = P('wall');
    if (wallOn && wallReal && WL !== 'nail') {
      const n = wEl.length, prog = wallP * n * 1.02, topY = WL === 'sheet' ? 0.6 : WL === 'hpile' ? 0.5 : 0.25, Lp = emb + topY;
      let act = -1;
      for (let j = 0; j < n; j++) {
        const lp = clamp(prog - j, 0, 1); if (lp <= 0) { if (act < 0) act = j; break; }
        if (lp < 1 && act < 0) act = j;
        const ei = wOrd[j], s = wEl[ei], [x, z, tx, tz, nx, nz] = pathAt(s), yaw = yawOf(tx, tz);
        if (WL === 'hpile') { const top = topY + emb * (1 - lp), bb = top - Lp, c = (top + bb) / 2, h = 0.35; [-1, 1].forEach(sg => wP.ob(x + nx * sg * h / 2, c, z + nz * sg * h / 2, h, Lp, 0.04, yaw)); wP.ob(x, c, z, 0.035, Lp, h, yaw); }
        else if (WL === 'sheet') { const top = topY + emb * (1 - lp), c = top - Lp / 2, pts = [[0, -0.17], [0.3, -0.17], [0.5, 0.17], [0.8, 0.17], [1.0, -0.17]]; for (let k = 0; k < 4; k++) { const [u0, o0] = pts[k], [u1, o1] = pts[k + 1], ua = u0 - 0.5, ub = u1 - 0.5, ax = x + tx * ua + nx * o0, az = z + tz * ua + nz * o0, bx = x + tx * ub + nx * o1, bz = z + tz * ub + nz * o1; wP.ob((ax + bx) / 2, c, (az + bz) / 2, Math.hypot(bx - ax, bz - az) + 0.02, Lp, 0.05, yawOf(bx - ax, bz - az)); } }
        else if (WL === 'cip' || WL === 'scw') { if (lp < 0.5) continue; const r = WL === 'cip' ? 0.25 : 0.29, top = lerp(-emb, topY, (lp - 0.5) * 2); wP.cyl(x, z, -emb, top, r); if (WL === 'scw' && ei % 2 === 0 && lp >= 1) { const h = 0.3, c = (0.9 - emb + 1) / 2, L2 = 0.9 + emb - 1; [-1, 1].forEach(sg => wP2.ob(x + nx * sg * h / 2, c, z + nz * sg * h / 2, h, L2, 0.03, yaw)); wP2.ob(x, c, z, 0.03, L2, h, yaw); } }
        else if (WL === 'dwall') { if (lp < 0.7) continue; const top = lerp(-emb, topY, (lp - 0.7) / 0.3); wP.ob(x, (top - emb) / 2, z, wSp - 0.06, top + emb, th, yaw); if (lp >= 1 && dug > 0.3) wP2.ob(x + tx * wSp / 2 + nx * (th / 2 + 0.01), -dug / 2, z + tz * wSp / 2 + nz * (th / 2 + 0.01), 0.08, dug, 0.03, yaw); }
      }
      // 시공 장비 (지금 시공하는 자리): 오거·진동 해머·하이드로밀
      if (wpId === 'wall' && act >= 0 && act < n) {
        const ei = wOrd[act], [x, z, tx, tz, nx, nz] = pathAt(wEl[ei]), lp = clamp(prog - act, 0, 1), fx = -nx, fz = -nz, yaw = yawOf(fx, fz);
        const batch = frac(wallP * Math.max(8, Math.min(26, Math.round(Ltot / 6))));
        if (wRig) { place(wRig.g, x - fx * wRig.reach, 0, z - fz * wRig.reach, yaw); io.hot.push({ k: 'rig', x, y: 0, z }); wRig.tool.position.y = lerp(wRig.H - wRig.La, -emb, Math.sin(Math.PI * batch)); }
        if (wCrane) { const R2 = wCrane.tip.x; place(wCrane.g, x - fx * R2, 0, z - fz * R2, yaw); io.hot.push({ k: 'rig', x, y: 0, z }); wCrane.turn.rotation.y = 0;
          if (WL === 'sheet') { wCrane.hang(topY + emb * (1 - lp) + 3.0); for (let k = 0; k < 3; k++) { const r = 1 + frac(T * 0.22 + k / 3) * 22; wRing.put(x, 0.15, z, r, 1, r); } }
          else { const de = Math.min(emb, emb * lp / 0.7); wCrane.hang(lp < 0.7 ? 0.4 - de + 7.2 : 6); slurP.ob(x, (0.1 - de) / 2, z, wSp - 0.1, de + 0.1, th, yawOf(tx, tz)); }
        }
        lab('wall', x + nx * 6, 16, z + nz * 2);
      } else if (wpId === 'wall') lab('wall', pw * 0.5, 4, -pd / 2 + 2);
      if (WL === 'hpile' && dug > 0.2) { // 토류판: 말뚝 사이에 굴착 깊이만큼
        for (let j = 0; j + 1 < n; j++) { if (prog - j - 1 < 1) break; const s = wEl[j] + wSp / 2, [x, z, tx, tz, nx, nz] = pathAt(s); const yaw = yawOf(tx, tz); for (let y = 0; y > -dug; y -= 1.5) { const y0 = Math.max(-dug, y - 1.5); lagP.ob(x - nx * 0.11, (y + y0) / 2, z - nz * 0.11, wSp - 0.38, y - y0, 0.07, yaw); } }
      }
      if (wallP >= 1 && capP) { const w2 = th + 0.5, h2 = 0.9; capP.box(-0.25, w2 - 0.25, 0, h2, -pd / 2, 0); capP.box(pw - w2 + 0.25, pw + 0.25, 0, h2, -pd / 2, 0); capP.box(-0.25, pw + 0.25, 0, h2, -pd / 2 - 0.25, -pd / 2 + w2 - 0.25); }
      if (WL === 'dwall' && wallP < 1) { [-1, 1].forEach(sg => { const o = sg * (th / 2 + 0.18); capP.box(th / 2 + o - 0.15, th / 2 + o + 0.15, -1.2, 0.15, -pd / 2, 0); capP.box(pw - th / 2 + o - 0.15, pw - th / 2 + o + 0.15, -1.2, 0.15, -pd / 2, 0); capP.box(0, pw, -1.2, 0.15, -pd / 2 + th / 2 + o - 0.15, -pd / 2 + th / 2 + o + 0.15); }); if (wpId === 'wall' && wallP < 1) place(wPlant, pw + 0.8, 0, -pd / 2 + 2); }
    }
    if (wallOn && WL === 'nail' && depth > 0.5) {
      const dn = Math.max(dug, wpId === 'wall' ? Math.min(depth, 1.5) * clamp(wallP * 2, 0, 1) : 0);
      if (dn > 0.2) {
        wP.box(0, th, -dn, 0.2, -pd / 2, 0); wP.box(pw - th, pw, -dn, 0.2, -pd / 2, 0); wP.box(0, pw, -dn, 0.2, -pd / 2, -pd / 2 + th); // 숏크리트 면
        for (let m = 1.0; m < dn; m += 1.5) for (let s = 0.75; s < Ltot; s += 1.5) { const [x, z, tx, tz, nx, nz] = pathAt(s); nailHead.ob(x + nx * (th / 2 + 0.04), -m, z + nz * (th / 2 + 0.04), 0.34, 0.34, 0.07, yawOf(tx, tz)); }
        const Ln = 0.6 * depth + 3, a = 0.18; for (let m = 1.0; m < dn; m += 1.5) { nailBar.seg(th, -m, 0.22, th - Ln * Math.cos(a), -m - Ln * Math.sin(a), 0.22, 0.09); nailBar.seg(pw - th, -m, 0.22, pw - th + Ln * Math.cos(a), -m - Ln * Math.sin(a), 0.22, 0.09); }
        if ((wpId === 'wall' || wpId === 'excav' || wpId === 'support') && dn < depth - 0.3) { place(nailRig, th + 2.4, -dn, -pd / 4, Math.PI); io.hot.push({ k: 'rig', x: th + 2.4, y: -dn, z: -pd / 4 }); }
      }
      if (wpId === 'wall' || wpId === 'excav') lab('wall', th + 3, 4, -pd / 4);
    }
    if (WL === 'open' && depth > 0.5) {
      const dd = dug > 0.3 ? dug : 0, sl = Math.min(1.2 * Math.max(dd, 0.01), pw * 0.3);
      if (dd > 0.3) {
        openW.put(0, 0, -pd / 2, sl, dd, pd / 2); openW.put(pw, 0, -pd / 2, -sl, dd, pd / 2); openW.put(pw, 0, -pd / 2, sl, dd, pw, 0, -Math.PI / 2, 0);
        openT.seg(0, 0.04, -pd / 4, sl, -dd + 0.04, -pd / 4, 0.05, pd / 2); openT.seg(pw, 0.04, -pd / 4, pw - sl, -dd + 0.04, -pd / 4, 0.05, pd / 2); openT.seg(pw / 2, 0.04, -pd / 2, pw / 2, -dd + 0.04, -pd / 2 + sl, pw, 0.05);
        for (let z = -pd / 2 + sl; z < 0; z += 0.75) { openB.box(sl, sl + 0.5, -dd, -dd + 0.32, z, z + 0.65); openB.box(pw - sl - 0.5, pw - sl, -dd, -dd + 0.32, z, z + 0.65); }
        for (let x = sl; x < pw - sl; x += 0.75) openB.box(x, x + 0.65, -dd, -dd + 0.32, -pd / 2 + sl, -pd / 2 + sl + 0.5);
      }
      if (wpId === 'wall') { const sl2 = Math.min(1.2 * depth, pw * 0.3); openT.seg(0, 0.06, 0.3, sl2, -depth, 0.3, 0.12, 0.05); lab('wall', sl2 + 2, 3, -pd / 4); }
      else if (wpId === 'excav' && dd > 0.3) lab('wall', sl + 2, -dd / 2, -pd / 4);
    }

    // ---------- 지보 ----------
    R.strutI.count = 0; R.ancI.count = 0;
    if (supOn0 && K('support')) {
      const lv = R.lv, sz = R.strutZ, ru = S.removeUpTo, x0 = th + 0.5, x1 = pw - th - 0.5, zb = -pd / 2 + th + 0.5;
      const IX = (Pp, a, b, y, z, h = 0.45, w = 0.42) => { Pp.box(a, b, y + h / 2 - 0.05, y + h / 2, z - w / 2, z + w / 2); Pp.box(a, b, y - h / 2, y - h / 2 + 0.05, z - w / 2, z + w / 2); Pp.box(a, b, y - h / 2, y + h / 2, z - 0.03, z + 0.03); };
      const IZ = (Pp, a, b, y, x, h = 0.45, w = 0.42) => { Pp.box(x - w / 2, x + w / 2, y + h / 2 - 0.05, y + h / 2, a, b); Pp.box(x - w / 2, x + w / 2, y - h / 2, y - h / 2 + 0.05, a, b); Pp.box(x - 0.03, x + 0.03, y - h / 2, y + h / 2, a, b); };
      const IC = (Pp, x, z, y0, y1, h = 0.36) => { Pp.box(x - h / 2, x + h / 2, y0, y1, z - h / 2, z - h / 2 + 0.04); Pp.box(x - h / 2, x + h / 2, y0, y1, z + h / 2 - 0.04, z + h / 2); Pp.box(x - 0.025, x + 0.025, y0, y1, z - h / 2, z + h / 2); };
      if (SP === 'strut') {
        lv.forEach(m => { if (dug < m + 0.4 || ru <= m) return; const y = -m; IZ(supP, zb, 0, y, th + 0.25); IZ(supP, zb, 0, y, pw - th - 0.25); IX(supP, th, pw - th, y, -pd / 2 + th + 0.25); sz.forEach(z => { IX(supP, x0 + 0.6, x1, y, z); supJ.box(x0, x0 + 0.6, y - 0.22, y + 0.22, z - 0.28, z + 0.28); }); supP.seg(x0, y, zb + 4.5, x0 + 4.5, y, zb, 0.4, 0.4); supP.seg(x1, y, zb + 4.5, x1 - 4.5, y, zb, 0.4, 0.4); });
        if (dug > 2 && ru > 1) { const posts = pw > 40 ? [pw / 3, pw * 2 / 3] : [pw / 2]; posts.forEach(x => sz.forEach(z => IC(supP, x, z, -Math.min(emb, depth + 4), 0.6))); }
        if (dug > 1.9) lab('support', pw * 0.5, -1.0, sz[0] ?? -pd / 4);
      } else if (SP === 'sps') {
        const levels = [0.8]; const nB = Math.max(1, G.nB), bsh = depth / nB; for (let i = 1; i < nB; i++) levels.push(i * bsh); if (nB === 1) levels.push(depth / 2);
        levels.forEach(m => { if (dug < m + 0.4) return; const y = -m; for (let z = -pd / 2 + th + 3; z < -0.5; z += 6) IX(supP, th, pw - th, y, z, 0.5, 0.3); for (let x = th + 3; x < pw - th; x += 6) IZ(supP, -pd / 2 + th, 0, y, x, 0.5, 0.3); });
        if (dug > 1) for (let x = th + 6; x < pw - th - 2; x += 12) for (let z = -pd / 2 + th + 6; z < -1; z += 12) IC(supP, x, z, -depth, 0.5, 0.45);
        if (dug > 1.2) lab('support', pw * 0.5, -0.4, -pd / 4);
      } else if (SP === 'anchor') {
        const La = Math.max(10, depth * 0.9 + 6), a = Math.PI / 9;
        lv.forEach(m => { if (dug < m + 0.4) return; const y = -m; IZ(supP, zb, 0, y, th + 0.25); IZ(supP, zb, 0, y, pw - th - 0.25); IX(supP, th, pw - th, y, -pd / 2 + th + 0.25);
          for (let s = 1; s < Ltot; s += 2.0) { const [x, z, tx, tz, nx, nz] = pathAt(s); supJ.ob(x + nx * (th / 2 + 0.52), y, z + nz * (th / 2 + 0.52), 0.5, 0.5, 0.12, yawOf(tx, tz)); supP.seg(x + nx * (th / 2 + 0.5), y, z + nz * (th / 2 + 0.5), x + nx * (th / 2 + 0.85), y + 0.12, z + nz * (th / 2 + 0.85), 0.14); }
          [[th, -1], [pw - th, 1]].forEach(([x, s2]) => { const bx = x + s2 * (La - 8) * Math.cos(a), be = -m - (La - 8) * Math.sin(a), tx2 = x + s2 * La * Math.cos(a), te = -m - La * Math.sin(a), bad = s2 < 0 && tx2 < sc.nb.x1; ancT.tint(ancT.seg(x, -m, 0.24, bx, be, 0.24, 0.1), bad ? 0xe5484d : 0xd9d9de); ancG.seg(bx, be, 0.24, tx2, te, 0.24, 0.5); if (bad && m === lv[0]) lab('support', tx2 + 2, te, 0.4, '앵커가 인접 대지 아래로 들어감'); });
        });
        if (dug > 0.5 && dug < depth - 0.2 && (wpId === 'support' || wpId === 'excav')) place(ancRig, th + 2.6, -dug, -pd / 4, Math.PI); io.hot.push({ k: 'rig', x: th + 2.6, y: -dug, z: -pd / 4 });
        if (dug > 1.9) lab('support', pw * 0.5, -dug + 3, -pd / 4);
      } else if (SP === 'raker') {
        const m = lv[0] ?? 1.5, bw = Math.min(depth * 0.9, pw * 0.22);
        if (dug > 2 && S.earthP < 0.85 && S.foundP < 0.5) { bermB.box(th, th + bw * 0.4, -dug, 0, -pd / 2 + th, 0); bermB.box(pw - th - bw * 0.4, pw - th, -dug, 0, -pd / 2 + th, 0); bermW.put(th + bw * 0.4, 0, -pd / 2 + th, bw * 0.6, dug, pd / 2 - th); bermW.put(pw - th - bw * 0.4, 0, -pd / 2 + th, -bw * 0.6, dug, pd / 2 - th); }
        if (dug >= Math.max(m + 0.4, depth * 0.6) && S.foundP < 0.6) { const yk = -Math.max(dug, depth * 0.6); IZ(supP, zb, 0, -m, th + 0.25); IZ(supP, zb, 0, -m, pw - th - 0.25); sz.forEach(z => [[x0, 1], [x1, -1]].forEach(([x, s2]) => { const fx2 = x + s2 * Math.min(depth * 0.9, pw * 0.25); supP.seg(x, -m, z, fx2, yk + 0.6, z, 0.42, 0.42); kickP.box(fx2 - 1.2, fx2 + 1.2, yk, yk + 0.9, z - 0.8, z + 0.8); supJ.box(x, x + s2 * 0.6, -m - 0.22, -m + 0.22, z - 0.25, z + 0.25); })); }
        if (dug > 1.9) lab('support', pw * 0.5, -dug + 2.5, -pd / 4);
      } else if (SP === 'topdown') {
        if (S.earthP > 0 || S.baseP > 0) { const lx = pw * 0.12, oz = -pd / 4; [[lx - 2.2, lx + 2.2, oz - 2.2, oz - 2.1], [lx - 2.2, lx + 2.2, oz + 2.1, oz + 2.2], [lx - 2.2, lx - 2.1, oz - 2.2, oz + 2.2], [lx + 2.1, lx + 2.2, oz - 2.2, oz + 2.2]].forEach(([a, b, c, d]) => supJ.box(a, b, 0.25, 1.35, c, d)); if (wpId === 'support' || wpId === 'excav') lab('support', lx + 3, 3.5, oz); }
      }
    }
    if (kpP && (S.topdown || ids.base === 'topdown' || ids.base === 'updown') && (S.earthP > 0 || S.baseP > 0 || (wpId === 'support' && SP === 'topdown'))) { for (let i = 1; i < 6; i++) R.strutZ.forEach(z => { const x = pw * i / 6, y0 = -Math.min(emb + 3, sc.dv - 1); kpP.box(x - 0.2, x + 0.2, y0, 0.25, z - 0.2, z - 0.16); kpP.box(x - 0.2, x + 0.2, y0, 0.25, z + 0.16, z + 0.2); kpP.box(x - 0.02, x + 0.02, y0, 0.25, z - 0.2, z + 0.2); }); }

    // ---------- 차수 ----------
    wtable.visible = false;
    const waterOn = K('water') && depth > 0.5 && cond.gw < sc.dv;
    if (waterOn) {
      const Ww = sc.W.wall, Wx = sc.W.excav, wp2 = Ww && Wx ? clamp((S.tau - Ww.s) / Math.max(1, Wx.s - Ww.s), 0, 1) : 1, gw = cond.gw;
      if (grP && S.underV) { const e0 = -Math.max(0, gw - 1), e1 = -Math.min(sc.dv - 1, emb + 3), n = Math.floor(wp2 * 1.2 * 12), lines = [];
        for (let z = -0.6; z > -pd / 2 - 1; z -= 1.6) { lines.push([-1.3, z]); lines.push([pw + 1.3, z]); } for (let x = -1.3; x < pw + 1.3; x += 1.6) lines.push([x, -pd / 2 - 1.3]);
        const per = WA === 'jsp' ? 1 : Math.max(1, Math.floor(grP.cap / Math.max(1, lines.length))), nl = Math.min(lines.length, Math.ceil(lines.length * clamp(wp2 * 1.2, 0, 1)));
        for (let li = 0; li < nl; li++) { const [x, z] = lines[li]; if (WA === 'jsp') grP.cyl(x, z, e1, e0, 0.9); else for (let i = 0; i < Math.min(per, n); i++) { const e = lerp(e0, e1, (i + 0.5) / per); grP.put(x, e, z, 1.7, 1.5, 1.7); } }
        if (wpId === 'water') lab('water', -2, -gw - 2, 0.4);
      }
      if (wellP) { const ws = []; for (let z = -3; z > -pd / 2; z -= 12) { ws.push([-3.2, z]); ws.push([pw + 3.2, z]); } for (let x = 6; x < pw - 2; x += 14) ws.push([x, -pd / 2 - 3.2]);
        const nw = Math.ceil(ws.length * clamp(wp2 * 1.3, 0, 1)), bot = -Math.min(sc.dv - 1, depth + 6);
        ws.slice(0, nw).forEach(([x, z]) => { wellP.cyl(x, z, bot, 0.9, 0.28); wellP.cyl(x, z, 0.9, 1.6, 0.5); pipeP.seg(x, 1.4, z, x < 0 ? -3.2 : x > pw ? pw + 3.2 : x, 1.4, x < 0 || x > pw ? z : -pd / 2 - 3.2, 0.16); });
        if (nw > 0) { pipeP.seg(-3.2, 1.4, -3, -3.2, 1.4, -pd / 2 - 3.2, 0.24); pipeP.seg(-3.2, 1.4, -pd / 2 - 3.2, pw + 3.2, 1.4, -pd / 2 - 3.2, 0.24); pipeP.seg(pw + 3.2, 1.4, -pd / 2 - 3.2, pw + 3.2, 1.4, -3, 0.24); }
      }
      // 지하수위 면 (뒤쪽 절반): 디워터링이면 양수정 쪽으로 내려간 곡면
      if (wpId === 'water' || wpId === 'excav') {
        const dh = WA === 'dewater' && S.earthP > 0 ? (Math.max(0, depth - gw) + 1.5) * clamp(S.earthP * 1.5, 0, 1) : WA === 'dewater' ? 1.2 * wp2 : 0, R0 = 40 + 15 * dh;
        const x0 = D.xl, x1 = D.xr, z0 = -D.Z, pa = wtGeo.attributes.position;
        for (let i = 0; i < pa.count; i++) { const u = wtBase[i * 3] + 0.5, v = wtBase[i * 3 + 2] + 0.5, x = lerp(x0, x1, u), z = lerp(z0, 0, v), r = x < 0 ? -x : x > pw ? x - pw : 0, rz = z < -pd / 2 ? -pd / 2 - z : 0, rr = Math.hypot(r, rz); let y = -gw - dh * Math.max(0, 1 - rr / R0) ** 1.6; const inPit = x > th && x < pw - th && z > -pd / 2 + th; if (inPit && (WA !== 'none' || (sc.fx.watertight ?? 0.5) >= 0.9)) y = Math.min(y, -Math.max(gw, dug + 0.5)); pa.setXYZ(i, x, y, z); }
        pa.needsUpdate = true; wtGeo.computeVertexNormals(); wtable.visible = true;
      }
      if (WA === 'none' && (sc.fx.watertight ?? 0.5) < 0.9 && dug > gw) { const lvl = Math.min(2.5, (dug - gw) * 0.3) * clamp(S.earthP * 1.5, 0, 1); waterIn.box(th, pw - th, -dug, -dug + Math.max(0.05, lvl), -pd / 2 + th, -0.1); if (wpId === 'water' || wpId === 'excav') lab('water', pw / 2, -dug + lvl + 1.2, -pd / 4, '물 유입 · 보일링 위험'); }
      if (WA === 'drain' && S.foundP > 0.2) { const b = -depth - 0.4; drainP.box(1, pw - 1, b - 0.08, b + 0.08, -pd / 2 + 1, -0.3); drainP.box(pw * 0.5 - 1.2, pw * 0.5 + 1.2, -depth - 2.2, -depth - 0.4, -pd / 4 - 1.2, -pd / 4 + 1.2); if (wpId === 'water' || wpId === 'found') lab('water', pw * 0.5, -depth - 3, -pd / 4); }
      if (WA === 'anchor' && (S.foundP > 0.1 || wpId === 'water')) { const b = S.baseE, L2 = Math.min(10, sc.dv - depth - 1); for (let x = 5; x < pw - 4; x += 4.5) for (let z = -2; z > -pd / 2 + th + 1; z -= 4.5) { upAnc.box(x - 0.06, x + 0.06, b - L2, b, z - 0.06, z + 0.06); upAnc.box(x - 0.3, x + 0.3, b, b + 0.12, z - 0.3, z + 0.3); } if (wpId === 'water' || wpId === 'found') lab('water', pw * 0.5, b - L2 / 2, 0.4); }
      if (wpId === 'water' && (WA === 'dewater' || WA === 'none')) lab('water', pw + 4, 3, -pd / 4);
    } else if (wpId === 'water') lab('water', pw / 2, -2, -pd / 4, cond.gw >= sc.dv ? '지하수위가 깊어 차수 불필요' : undefined);

    // ---------- 굴착 ----------
    R.exc.visible = false;
    const exOn = dug > 0.3 && S.earthP < 1 && ['support', 'excav', 'water', 'wall'].includes(wpId), rockNow = dug > cond.rockDepth && K('excav');
    if (exOn && ex1) {
      const sl = WL === 'open' ? Math.min(1.2 * dug, pw * 0.3) : 0, xa = th + 3 + sl, xb = pw - th - 3 - sl;
      const e1x = clamp(lerp(xa, xb, 0.42 + 0.16 * Math.sin(T * 0.06)), xa, xb); place(ex1, e1x, -dug, -pd / 4 - 1, Math.PI); ex1.userData.pose(frac(T * 0.16), 1.6); io.hot.push({ k: 'ex', x: e1x, y: -dug, z: -pd / 4 - 1 });
      if (ex2) { place(ex2, clamp(pw * 0.75, xa, xb), -dug, -pd / 3 - 1, 0); ex2.userData.pose(frac(T * 0.16 + 0.5), -1.5); io.hot.push({ k: 'ex', x: clamp(pw * 0.75, xa, xb), y: -dug, z: -pd / 3 - 1 }); }
      // 상차: 경사로가 있으면 덤프트럭이 터 안으로 내려와 굴착기가 선회해 싣는다 (5번 퍼 담으면 가득), 아니면 흙더미에 쌓는다
      const dz1 = Math.min(-pd / 4 - 1 + 7.8, -1.6), kd = clamp(dug / 3, 0.35, 1), fc = C3.set(SOILC[stAt(Math.max(0, dug - 0.5))] ?? 0xa88a5e).multiplyScalar(0.78).getHex(); // 막 판 흙은 젖어 조금 어둡다
      const pileAt = (x, z, k, m = 1) => { if (!spoilP) return; const r = (2.3 + 0.9 * hsh(k, 31)) * kd * m; spoilP.tint(spoilP.put(x, -dug, z, r, (1.3 + 0.7 * hsh(k, 32)) * kd * m, r * (0.75 + 0.2 * hsh(k, 34)), 0, hsh(k, 33) * 6.28, 0), fc); };
      if (dumpT && S.earthP < 0.98) { place(dumpT, e1x + 1.05, -dug, dz1, Math.PI / 2); dumpT.userData.load(frac(T * 0.032)); if (wpId === 'excav') io.tags.push({ t: '덤프트럭 · 터 안 상차', p: [e1x + 1, -dug + 4.2, dz1], cls: 'eq dim' }); }
      else pileAt(e1x, dz1, 0);
      if (ex2) pileAt(clamp(pw * 0.75, xa, xb) + 0.3, Math.min(-pd / 3 - 1 + 7.8, -1.6), 1);
      if (clam && dug > (SP === 'topdown' ? 2 : 7)) {
        const td = SP === 'topdown', R2 = clam.tip.x, y0 = td ? 0.25 : 0.2, cx = td ? pw * 0.12 + R2 : deckOn0 ? DECK.cx : pw - 6.5 + R2, cz = td ? -pd / 4 : deckOn0 ? DECK.cz : -pd / 4;
        place(clam.g, cx, y0, cz, Math.PI);
        // 24초 순환: 내려가며 벌림 → 바닥에서 오므려 퍼 담음 → 올림 → 90° 선회 → 덤프 위에서 벌려 비움 → 되돌아옴
        const ph = frac(T / 24), yb = -dug + 1.4, yt = 5.2;
        const yy = ph < 0.2 ? lerp(yt, yb, sstep(0, 0.2, ph)) : ph < 0.3 ? yb : ph < 0.42 ? lerp(yb, yt, sstep(0.3, 0.42, ph)) : ph < 0.94 ? yt : yt;
        const sw = deckOn0 || td ? sstep(0.42, 0.56, ph) * (1 - sstep(0.8, 0.94, ph)) : 0; clam.turn.rotation.y = sw * Math.PI / 2;
        clam.hang(yy - y0);
        const open = ph < 0.2 ? 1 : ph < 0.3 ? 1 - sstep(0.2, 0.28, ph) : ph > 0.6 && ph < 0.76 ? sstep(0.6, 0.66, ph) : 0;
        clam.att.userData.halves.forEach(h => { h.rotation.x = -h.userData.s * 0.55 * open; });
        if (deckOn0 || td) io.bays.haul = { x: cx + 1.1, z: cz + R2, hx: 1, hz: 0, inside: true };
        io.hot.push({ k: 'clam', x: cx - R2 + 3, y: -dug, z: cz + 2 }); pileAt(clamp(cx - R2, PX0 + 3, PX1 - 3), cz, 2, 1.15);
        if (wpId === 'excav' && ph > 0.6 && ph < 0.76) for (let k = 0; k < 3; k++) dustP.put(cx + 0.3 * k, yt - 1 - k * 0.7, cz + R2, 1.2 + k * 0.4, 0.9, 1.2 + k * 0.4);
      }
      if (deckOn0 && !io.bays.haul && dug > 1) io.bays.haul = { x: DECK.cx + 1.1, z: pd / 2 - 3.3, hx: 1, hz: 0, inside: true };
      if (rockNow && (EX === 'blast' || EX === 'mix')) {
        const bx = pw * (EX === 'mix' ? 0.7 : 0.5), bz = -pd / 4 - 6, ph = frac(T * 0.08);
        place(drill, bx - 7, -dug, bz + 1, 0);
        for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const k = blastP.cyl(bx - 3 + i * 1.5, bz - 2 + j * 1.5, -dug - 0.02, -dug + 0.08, 0.12); blastP.tint(k, ph > 0.3 ? 0xff8a3d : 0x1c1c1e); }
        if (ph > 0.55) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) matsP.box(bx - 4 + i * 2.7, bx - 1.4 + i * 2.7, -dug + 0.1, -dug + 0.24, bz - 2.6 + j * 1.9, bz - 0.8 + j * 1.9);
        if (ph < 0.08 && wpId === 'excav') { const s2 = (EX === 'mix' ? 3 : 6) * (0.4 + ph * 10); flashP.put(bx, -dug + 1, bz, s2, s2 * 0.7, s2); }
        if (ph < 0.3 && wpId === 'excav') { const s3 = (EX === 'mix' ? 5 : 10) * (0.3 + ph * 3); dustP.put(bx, -dug + s3 * 0.35, bz, s3, s3 * 0.8, s3); }
        if (ph < 0.4 && wpId === 'excav') for (let k = 0; k < 2; k++) { const r = 2 + frac(ph * 2.5 + k / 2) * 45; wRing.put(bx, 0.2, bz, r, 1, r); }
        lab('excav', bx, -dug + 6, bz);
      } else if (rockNow && EX === 'splitter' && ex3) {
        const bx = pw * 0.55, bz = -pd / 4 - 5; place(ex3, bx - 7, -dug, bz, 0); ex3.userData.hammer(T * 0.3);
        for (let i = 0; i < 7; i++) { const a = hsh(i, 4) * 6.28, r = 1.5 + hsh(i, 5) * 3; rockP.put(bx + Math.cos(a) * r, -dug + 0.5, bz + Math.sin(a) * r, 1.3 + hsh(i, 6), 0.9 + 0.6 * hsh(i, 7), 1.1 + hsh(i, 8), hsh(i, 9) * 0.4, a, hsh(i, 10) * 0.3); }
        for (let i = 0; i < 8; i++) holeP.cyl(bx - 3 + i * 0.8, bz + 4, -dug - 0.02, -dug + 0.06, 0.09);
        lab('excav', bx, -dug + 5, bz);
      } else if (rockNow && EX === 'normal' && ex3) { const bx = pw * 0.55, bz = -pd / 4 - 5; place(ex3, bx - 7, -dug, bz, 0); ex3.userData.hammer(T); for (let i = 0; i < 5; i++) rockP.put(bx - 2 + hsh(i, 1) * 4, -dug + 0.3, bz - 1 + hsh(i, 2) * 3, 0.7, 0.5, 0.6, 0, hsh(i, 3) * 3, 0); lab('excav', bx, -dug + 5, bz, '브레이커 암반 파쇄 · 소음·저속'); }
      else if (wpId === 'excav') lab('excav', e1x, -dug + 7, -pd / 4 - 1, (EX === 'blast' || EX === 'splitter') && !rockNow ? `${SIG.excav[EX]} (GL−${Math.round(cond.rockDepth)}m 암반부터)` : undefined);
    }

    // ---------- 굴착 바닥 디테일 (터가 열려 있는 동안) ----------
    const pitOpen = pitD && dug > 0.6 && (S.foundP || 0) < 0.05 && !xm;
    if (mudPl) { mudPl.visible = pitOpen; mudPl.position.y = -dug + 0.03; }
    if (pitOpen) {
      const pk = clamp(dug / 3, 0.35, 1);
      PUD.forEach(([x, z, r], i) => pudP.put(x, -dug + 0.045, z, r * pk, 1, r * (0.55 + 0.3 * hsh(i, 64)) * pk, 0, hsh(i, 41) * 3, 0));
      if (sumpOn0 && dug > 1.5) { // 집수정: 콘크리트 테두리 + 고인 물 + 수중펌프 + 벽을 타고 넘는 배수 호스
        const sx = PX0 + 2.0, sz = PZ0 + 2.0, y = -dug, hx = PX0 + (supOn0 ? 0.6 : 0.18);
        sumpC.box(sx - 0.9, sx + 0.9, y, y + 0.18, sz - 0.9, sz - 0.7); sumpC.box(sx - 0.9, sx + 0.9, y, y + 0.18, sz + 0.7, sz + 0.9); sumpC.box(sx - 0.9, sx - 0.7, y, y + 0.18, sz - 0.7, sz + 0.7); sumpC.box(sx + 0.7, sx + 0.9, y, y + 0.18, sz - 0.7, sz + 0.7);
        sumpW.box(sx - 0.7, sx + 0.7, y + 0.01, y + 0.1, sz - 0.7, sz + 0.7);
        place(pumpG, sx, y - 0.25, sz, 0.4);
        const hp = [[sx - 0.35, y + 0.55, sz + 0.25], [sx - 1.0, y + 0.22, sz + 0.75], [hx, y + 0.22, sz + 1.1], [hx, y + 1.2, sz + 1.2], [hx, -0.4, sz + 1.2], [hx, 0.55, sz + 1.2], [-0.6, 0.6, sz + 1.2], [-1.3, 0.1, sz + 1.4]];
        for (let i = 0; i + 1 < hp.length; i++) hoseP.seg(...hp[i], ...hp[i + 1], 0.11);
        if (wpId === 'excav' || wpId === 'water') io.tags.push({ t: '집수정 · 수중펌프 배수', p: [sx, y + 2.2, sz], cls: 'eq dim' });
      }
      if (rampP && S.earthP < 0.98) { const Lr = clamp(dug * 5, 3, PW * 0.45); rampP.put(PX1, 0, PZ0 + 6, Lr, dug, 6, 0, Math.PI, 0); }
      if (stakeP && dug > 1) for (let i = 0; i < 6; i++) { const x = PX0 + 4 + (PW - 8) * hsh(i, 71), z = PZ0 + 3 + Math.max(0, PDz - 6) * hsh(i, 72); stakeP.box(x - 0.03, x + 0.03, -dug, -dug + 0.75, z - 0.03, z + 0.03); tapeP.box(x - 0.035, x + 0.035, -dug + 0.6, -dug + 0.72, z - 0.035, z + 0.035); }
    }

    // 터 둘레 안전 난간 (기둥 2.5m · 상부·중간 난간 · 발끝막이): 작업구대와 경사로 입구는 비운다
    if (railP && dug > 0.6 && (S.baseP || 0) < 0.95 && !S.topdown) {
      const ins = WL === 'open' ? 0.4 : th * 0.5, a0 = ins, a1 = pw - ins, b0 = -pd / 2 + ins, b1 = pd / 2 - ins, sk = [];
      if (deckOn0) sk.push([DECK.x0, DECK.x1, DECK.z0, DECK.z1]); if (rampP && S.earthP < 0.98) sk.push([pw - 2, pw + 2, PZ0 - 0.5, PZ0 + 6.5]);
      const inSk = (x, z) => sk.some(q => x > q[0] - 0.4 && x < q[1] + 0.4 && z > q[2] - 0.4 && z < q[3] + 0.4);
      const piece = (p, q) => { if (!p || (p[0] === q[0] && p[1] === q[1])) return; const xa = Math.min(p[0], q[0]) - 0.03, xb = Math.max(p[0], q[0]) + 0.03, za = Math.min(p[1], q[1]) - 0.03, zb = Math.max(p[1], q[1]) + 0.03; railP.box(xa, xb, 1.08, 1.14, za, zb); railP.box(xa, xb, 0.56, 0.61, za, zb); railP.box(xa, xb, 0, 0.15, za + (zb - za > 1 ? 0.01 : 0), zb); };
      const run = (ax, az, bx, bz) => { const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.5)); let st = null, last = null; for (let i = 0; i <= n; i++) { const x = lerp(ax, bx, i / n), z = lerp(az, bz, i / n); if (inSk(x, z)) { piece(st, last); st = last = null; continue; } postP.box(x - 0.04, x + 0.04, 0, 1.2, z - 0.04, z + 0.04); if (!st) st = [x, z]; last = [x, z]; } piece(st, last); };
      run(a0, b0, a1, b0); run(a0, b0, a0, b1); run(a1, b0, a1, b1); run(a0, b1, a1, b1);
    }

    // 작업구대 (복공판 + 주형보 + 받침보 + 기둥 + 난간)
    if (deckOn0 && dug > 1 && S.earthP < 1) {
      const { x0, x1, z0, z1 } = DECK;
      wdP.box(x0, x1, 0.05, 0.25, z0, z1);
      for (let x = x0 + 2; x < x1 - 0.5; x += 2) deckJ.box(x - 0.03, x + 0.03, 0.25, 0.27, z0, z1);
      for (let z = z0 + 3; z < z1 - 0.5; z += 3) deckJ.box(x0, x1, 0.25, 0.27, z - 0.03, z + 0.03);
      for (let x = x0 + 0.6; x < x1; x += 2.8) deckB.box(x - 0.18, x + 0.18, -0.7, 0.05, z0, z1);
      for (let z = z0 + 1; z < z1; z += 4) deckB.box(x0, x1, -1.3, -0.7, z - 0.2, z + 0.2);
      for (let x = x0 + 1; x < x1 - 0.5; x += 5.5) for (let z = z0 + 1; z < z1; z += 8) deckB.box(x - 0.2, x + 0.2, -dug - 0.4, -1.3, z - 0.2, z + 0.2);
      [[0.62, 0.05], [1.15, 0.06]].forEach(([y, t]) => { deckR.box(x0, x0 + 0.06, 0.25 + y, 0.25 + y + t, z0, z1); deckR.box(x0, x1 - 4, 0.25 + y, 0.25 + y + t, z0, z0 + 0.06); });
      for (let z = z0; z <= z1; z += 2) deckR.box(x0, x0 + 0.06, 0.25, 1.45, z - 0.03, z + 0.03);
      if (wpId === 'excav') io.tags.push({ t: '작업구대 (복공판)', p: [x0 + 2, 1.8, z0 + 2], cls: 'eq dim' });
    }

    // ---------- 기초 ----------
    R.rig.visible = false; R.pileI.count = 0;
    const foundOn = K('found') && P('found') > 0, foundP = P('found'), baseE = S.baseE, thick = S.thick, plen = S.plen;
    if (foundOn) {
      if (piled) {
        const pileP = clamp(foundP / 0.6, 0, 1), n = piles.length, prog = pileP * n;
        let act = -1;
        for (let j = 0; j < n && S.underV; j++) {
          const lp = clamp(prog - j, 0, 1); if (lp <= 0) { if (act < 0) act = j; break; } if (lp < 1 && act < 0) act = j;
          const [x, z] = piles[j], head = baseE + (FD === 'bored' ? 0.3 : 0.6);
          if (FD === 'phc' || FD === 'steel' || FD === 'piledraft' || FD === 'micro') { const top = head + (FD === 'micro' ? 0 : plen * (1 - lp)), bot = FD === 'micro' ? head - plen * lp : top - plen - (head - baseE); plP.cyl(x, z, bot, top, pileR); if (plJ && (z > -2 || n < 260)) for (let m = 6; m < top - bot - 0.5; m += 6) plJ.cyl(x, z, top - m - 0.08, top - m + 0.08, pileR + 0.03); }
          else if (FD === 'bored') { if (lp < 0.55) { plCase.cyl(x, z, baseE - 0.2, baseE + 1.5, 0.85); continue; } const top = lerp(baseE - plen, head, (lp - 0.55) / 0.45); plP.cyl(x, z, baseE - plen, top, pileR); if (lp >= 1 && foundP < 0.75) plCage.cyl(x, z, head, head + 1.3, pileR - 0.1); if (lp < 1) plCase.cyl(x, z, baseE - 0.2, baseE + 1.5, 0.85); }
        }
        if (wpId === 'found' && act >= 0 && act < n) {
          const [x, z] = piles[act], lp = clamp(prog - act, 0, 1);
          if (FD === 'bored') { place(rcd, x, baseE + 1.5, z, 0); io.hot.push({ k: 'rig', x, y: baseE, z }); rcd.userData.kelly.rotation.y = T * 2; rcd.userData.kelly.position.y = 5 - 3 * Math.sin(Math.PI * clamp(lp / 0.55, 0, 1)); const R2 = fRig.tip.x; place(fRig.g, x + 2.5, baseE, z + R2, Math.PI / 2); fRig.hang(lp > 0.45 && lp < 0.6 ? 7 : 12); }
          else { place(fRig.g, x, baseE, z + fRig.reach, Math.PI / 2); io.hot.push({ k: 'rig', x, y: baseE, z }); const top = (FD === 'micro' ? 0.6 : 0.6 + plen * (1 - lp)); fRig.tool.position.y = FD === 'micro' ? lerp(fRig.H - fRig.La, -plen, Math.sin(Math.PI * lp)) : top; if (FD !== 'micro' && (cond.noise !== 'low' || FD === 'steel')) for (let k = 0; k < 3; k++) { const r = 1 + frac(T * 0.25 + k / 3) * 20; fRing.put(x, baseE + 0.3, z, r, 1, r); } }
          lab('found', x, baseE + 22, z);
        } else if (wpId === 'found') lab('found', pw * 0.5, baseE + thick + 3, -pd / 4);
      }
      // 버림 · 철근망 · 철근 받침 · 매트 타설
      const rp = piled ? clamp((foundP - 0.45) / 0.2, 0, 1) : clamp((foundP - 0.08) / 0.52, 0, 1), matP = S.matP;
      if (foundP > (piled ? 0.4 : 0.03)) leanP.box(1, pw - 1, baseE - 0.12, baseE + 0.02, -pd / 2 + 1, 0);
      if (rp > 0 && matP < 1) {
        const W2 = pw - 2, a1 = clamp(rp * 2, 0, 1), a2 = clamp(rp * 2 - 1, 0, 1), zc = (-pd / 2 + 1) / 2, L2 = pd / 2 - 1;
        const set = (o, a, y) => { o.visible = a > 0.02 && y > baseE + thick * matP; if (!o.visible) return; o.position.set(1 + W2 * a / 2, y, zc); o.scale.set(W2 * a, 1, L2); };
        set(matRb[0], a1, baseE + 0.25); set(matRb[1], a2, baseE + thick - 0.15); rebT.repeat.set(W2 / 1.5, L2 / 1.5);
        if (a2 > 0) for (let x = 2; x < 1 + W2 * a2; x += 3) for (let z = -1.5; z > -pd / 2 + 2; z -= 3) chairP.box(x - 0.04, x + 0.04, baseE + 0.25, baseE + thick - 0.15, z - 0.04, z + 0.04);
        if (wpId === 'found' && !piled) lab('found', 1 + W2 * Math.max(a1, 0.3) * 0.6, baseE + thick + 2, -pd / 4);
      } else matRb.forEach(o => { o.visible = false; });
      if (matP > 0 && matP < 1 && (wpId === 'found' || wpId === 'pour')) {
        const np = ids.pour === 'multi' ? 3 : 2, zc0 = -pd / 4;
        for (let i = 0; i < np; i++) { const pt = pumps[i], z = zc0 + (i - (np - 1) / 2) * 13; place(pt.g, S.PX, 0.1, z, PYAW); if (i === 0) io.bays.pump = { x: S.PX, z, nose: PNOSE }; const tx = 2 + (pw - 4) * clamp(0.15 + 0.7 * matP + (i - 1) * 0.08, 0.05, 0.95); { const hz = new THREE.Vector3(tx, baseE + thick * matP + 0.4, z + 3 * Math.sin(T * 0.2 + i)); aimBoom(pt, new THREE.Vector3(S.PX, 3.3, z - 2.6 * PNOSE), hz); io.hot.push({ k: 'hose', x: hz.x, y: hz.y - 0.1, z: hz.z }); } }
        lab('found', pw * 0.5, baseE + thick + 3, -pd / 4, ids.pour === 'multi' ? '매트 대량 타설 · 펌프카 3대 동시' : '매트 타설 · 펌프카 2대');
      }
    } else matRb.forEach(o => { o.visible = false; });

    // ---------- 지하 방수 ----------
    if (K('bwp') && depth > 0.5 && P('bwp') > 0) {
      const top = -depth + depth * clamp(P('bwp') * 1.15, 0, 1), Lx = th + 0.1, Rx = pw - th - 0.1, zB = -pd / 2 + th + 0.1, h = top + depth + 0.3;
      if (BW === 'sheet' || BW === 'bento') for (let y = -depth + 1; y < top; y += BW === 'bento' ? 1.2 : 1.0) { bwSeam.box(Lx + 0.18, Lx + 0.22, y - 0.04, y + 0.04, zB, 0); bwSeam.box(Rx - 0.22, Rx - 0.18, y - 0.04, y + 0.04, zB, 0); bwSeam.box(Lx, Rx, y - 0.04, y + 0.04, zB + 0.18, zB + 0.22); }
      if (BW === 'pre' || BW === 'bento' || BW === 'sheet') { const st2 = BW === 'pre' ? 1.8 : BW === 'bento' ? 1.2 : 4; for (let z = zB + st2; z < 0; z += st2) { bwSeam.box(Lx + 0.18, Lx + 0.23, -depth - 0.3, top, z - 0.05, z + 0.05); bwSeam.box(Rx - 0.23, Rx - 0.18, -depth - 0.3, top, z - 0.05, z + 0.05); } for (let x = Lx + st2; x < Rx; x += st2) bwSeam.box(x - 0.05, x + 0.05, -depth - 0.3, top, zB + 0.18, zB + 0.23); }
      if (BW === 'tank') { const nB = Math.max(1, G.nB), bsh = depth / nB; for (let i = 0; i <= nB; i++) { const y = -depth + i * bsh; if (y > top) break; bwSeam.box(Lx + 0.18, Lx + 0.26, y - 0.1, y + 0.1, zB, 0); bwSeam.box(Rx - 0.26, Rx - 0.18, y - 0.1, y + 0.1, zB, 0); bwSeam.box(Lx, Rx, y - 0.1, y + 0.1, zB + 0.18, zB + 0.26); } }
      if (BW === 'cryst' && bwIn) { const o = 0.75; bwIn.box(Lx + o, Lx + o + 0.2, -depth, top, zB + o, 0); bwIn.box(Rx - o - 0.2, Rx - o, -depth, top, zB + o, 0); bwIn.box(Lx + o, Rx - o, -depth, top, zB + o, zB + o + 0.2); bwSeam.box(Lx + 0.2, Lx + o, -depth - 0.05, -depth + 0.15, zB, 0); bwSeam.box(Rx - o, Rx - 0.2, -depth - 0.05, -depth + 0.15, zB, 0); }
      void h; if (wpId === 'bwp') lab('bwp', pw * 0.5, top + 1.5, -pd / 4);
    }
    // ---------- 지하 골조 순서 ----------
    if (K('base') && depth > 0.5 && (S.baseP > 0 || S.earthP > 0)) {
      const nB = Math.max(1, G.nB), bsh = depth / nB, bp = S.baseP, tw = th + 0.35;
      if (!S.topdown && (ids.base === 'topdown' || ids.base === 'updown')) for (let i = 0; i < nB; i++) { if (dug < i * bsh + 0.6 && bp <= 0) break; if (i > 0 && dug < i * bsh + 0.6) break; const e = -i * bsh; baseX.box(i === 0 ? -0.4 : tw, i === 0 ? pw + 0.4 : pw - tw, e - 0.35, e + 0.25, -pd / 2 + tw, 0); }
      if (ids.base === 'semi' && bp > 0 && bp < 0.6) { const cx0 = G.core.x0, cx1 = G.core.x1, cz = D.cz, tp = -depth + depth * clamp(bp * 2.2, 0, 1); [[cx0, cx0 + 0.4, -cz, 0], [cx1 - 0.4, cx1, -cz, 0], [cx0, cx1, -cz, -cz + 0.4]].forEach(([a, b, c, d]) => baseX.box(a, b, -depth, tp, c, d)); }
      if (wpId === 'base') lab('base', pw * 0.5, ids.base === 'bottomup' ? -depth + depth * Math.min(1, bp) + 1.2 : 1.5, -pd / 4);
    }

    // ---------- 지상 골조 ----------
    const nF = S.nF, active = S.active, f = S.f, fp = S.fp, fr = S.fr, stage = S.stage;
    const frameOn = K('frame') && S.structP > 0;
    const nSt = frameOn ? (S.structP >= 1 ? NF : Math.min(NF, nF + (active ? 1 + ahead : 0))) : 0;
    if (frameOn) {
      if (steelSk && FT !== 'src') R.colI.count = 0;
      if (FT === 'rcwall' || FT === 'modular') R.colI.count = 0;
      if (FT === 'modular') R.slabI.count = 0;
      if (gratP) { R.slabI.count = 0; R.pourBox.visible = false; for (let i = 0; i < Math.min(NF, nSt); i++) { if (i === nSt - 1 && active && fr < 0.6) break; const fl2 = sc.floors[i], p2 = D.fp[i]; gratP.box(p2.x0, p2.x1, fl2.e1 - 0.36, fl2.e1 - 0.3, p2.z0, p2.z1); } }
      const IXs = (a, b, y, z, h, w, col) => { [stP.box(a, b, y + h / 2 - 0.05, y + h / 2, z - w / 2, z + w / 2), stP.box(a, b, y - h / 2, y - h / 2 + 0.05, z - w / 2, z + w / 2), stP.box(a, b, y - h / 2, y + h / 2, z - 0.025, z + 0.025)].forEach(i => stP.tint(i, col)); };
      const IZs = (a, b, y, x, h, w, col) => { [stP.box(x - w / 2, x + w / 2, y + h / 2 - 0.05, y + h / 2, a, b), stP.box(x - w / 2, x + w / 2, y - h / 2, y - h / 2 + 0.05, a, b), stP.box(x - 0.025, x + 0.025, y - h / 2, y + h / 2, a, b)].forEach(i => stP.tint(i, col)); };
      const ICs = (x, z, y0, y1, h, col) => { [stP.box(x - h / 2, x + h / 2, y0, y1, z - h / 2, z - h / 2 + 0.05), stP.box(x - h / 2, x + h / 2, y0, y1, z + h / 2 - 0.05, z + h / 2), stP.box(x - 0.03, x + 0.03, y0, y1, z - h / 2, z + h / 2)].forEach(i => stP.tint(i, col)); };
      if (steelSk) {
        const from = FT === 'src' ? nF : 0;
        for (let i = from; i < nSt; i++) {
          const fl2 = sc.floors[i], p2 = D.fp[i], zs = zsF[i], up = i >= nSt - 4, col = steelCol(i), yb = fl2.e1 - 0.32 - 0.32;
          let xs = xsF[i], xEnd = p2.x1, beams = true, braces = true;
          // 지금 올리는 층: 플랜트 모듈은 한 칸(베이)씩 통째로, 현장 조립은 기둥 → 보 → 가새 순서로 한 부재씩
          const top1 = active && i === nSt - 1 && i >= nF;
          if (top1 && FT === 'module') { const nb = Math.min(xs.length - 1, Math.floor(fr * 1.1 * (xs.length - 1))); if (nb < 1) continue; xs = xs.slice(0, nb + 1); if (nb < xsF[i].length - 1) xEnd = xs[xs.length - 1]; }
          if (top1 && FT === 'stick') { const nc = Math.ceil(clamp(fr / 0.45, 0, 1) * xs.length); if (nc < 1) continue; xs = xs.slice(0, nc); beams = fr > 0.3; braces = fr > 0.7; if (fr < 0.55) xEnd = Math.max(p2.x0 + 0.5, xs[xs.length - 1]); }
          xs.forEach(x => zs.forEach(z => { if (up) ICs(x, z, fl2.e0 + 0.18, fl2.e1 - 0.32, 0.5, col); else stP.tint(stP.box(x - 0.25, x + 0.25, fl2.e0 + 0.18, fl2.e1 - 0.32, z - 0.25, z + 0.25), col); }));
          if (beams) zs.forEach(z => { if (up) IXs(p2.x0, xEnd, yb, z, 0.6, 0.3, col); else stP.tint(stP.box(p2.x0, xEnd, yb - 0.3, yb + 0.3, z - 0.15, z + 0.15), col); });
          if (beams) xs.forEach(x => { if (up) IZs(p2.z0, p2.z1, yb, x, 0.6, 0.3, col); else stP.tint(stP.box(x - 0.15, x + 0.15, yb - 0.3, yb + 0.3, p2.z0, p2.z1), col); });
          if (FT === 'module' && eqP) for (let j = 0; j + 1 < xs.length; j++) { const xc = (xs[j] + xs[j + 1]) / 2, zc = (p2.z0 + p2.z1) / 2, hh = fl2.e1 - fl2.e0; const zq = zs.length > 2 ? zs.slice(0, -1).map((z, k) => (z + zs[k + 1]) / 2) : [zc]; zq.forEach((zz, k) => { if ((i + j + k) % 2 === 0) eqP.tint(eqP.cyl(xc, zz, fl2.e0 + 0.3, fl2.e0 + 0.3 + hh * 0.85, Math.min(1.8, (xs[j + 1] - xs[j]) * 0.22)), 0xeeeef0); else eqP.tint(eqP.seg(xs[j] + 0.8, fl2.e0 + 1.4, zz, xs[j + 1] - 0.8, fl2.e0 + 1.4, zz, 2.2), 0x4f8fd0); }); }
          if (braces && (FT === 'stick' || FT === 'steel' || FT === 'module')) { const bays = FT === 'module' ? xs.length - 1 : Math.min(2, xs.length - 1); for (let j = 0; j < bays; j++) { const xa = FT === 'module' ? xs[j] : j === 0 ? xs[0] : xs[xs.length - 2], xb = FT === 'module' ? xs[j + 1] : j === 0 ? xs[1] : xs[xs.length - 1]; [p2.z0, p2.z1].forEach(z => { stP.tint(stP.seg(xa, fl2.e0 + 0.3, z, xb, fl2.e1 - 0.5, z, 0.18, 0.18), col); stP.tint(stP.seg(xb, fl2.e0 + 0.3, z, xa, fl2.e1 - 0.5, z, 0.18, 0.18), col); }); } }
          if (FT === 'module' && pipeR) [0x3d8fd6, 0xd9822b, 0x3fae6a].forEach((c, k) => { const y = fl2.e1 - 1.6 - k * 0.6, z = (p2.z0 + p2.z1) / 2 + (k - 1) * 0.8; pipeR.tint(pipeR.seg(p2.x0 - 0.5, y, z, xEnd + 0.5, y, z, 0.42 - k * 0.08), c); });
          if (i >= nF && i < nSt - 1 && FT !== 'module' && FT !== 'stick') deckP.box(p2.x0, p2.x1, fl2.e1 - 0.32, fl2.e1 - 0.26, p2.z0, p2.z1);
        }
      }
      if (FT === 'rcframe' || FT === 'src' || FT === 'pc') {
        const PP = FT === 'pc' ? pcP : rcP;
        for (let i = 0; i < nF; i++) { const fl2 = sc.floors[i], p2 = D.fp[i], y1 = fl2.e1 - 0.32, y0 = y1 - 0.55; zsF[i].forEach(z => PP.box(p2.x0, p2.x1, y0, y1, z - 0.22, z + 0.22)); xsF[i].forEach(x => PP.box(x - 0.22, x + 0.22, y0, y1, p2.z0, p2.z1)); }
      }
      if (FT === 'rcwall') {
        const upto = nF + (active && stage >= 2 ? 1 : 0);
        for (let i = 0; i < Math.min(NF, upto); i++) { const fl2 = sc.floors[i], p2 = D.fp[i], xs = xsF[i], y0 = fl2.e0 + 0.18, y1 = fl2.e1 - 0.32;
          xs.forEach(x => rcP.box(x - 0.13, x + 0.13, y0, y1, p2.z0, p2.z1));
          for (let j = 0; j + 1 < xs.length; j++) { const a = xs[j], b = xs[j + 1], w = b - a; [p2.z0, p2.z1].forEach(z => { rcP.box(a, a + w * 0.28, y0, y1, z - 0.13, z + 0.13); rcP.box(b - w * 0.28, b, y0, y1, z - 0.13, z + 0.13); rcP.box(a + w * 0.28, b - w * 0.28, y0, y0 + 0.95, z - 0.13, z + 0.13); }); }
        }
      }
      if (FT === 'pc') {
        for (let i = Math.max(0, nF - 2); i < nF; i++) { const fl2 = sc.floors[i], p2 = D.fp[i]; for (let x = p2.x0 + 1.2; x < p2.x1 - 0.1; x += 1.2) seamP.box(x - 0.02, x + 0.02, fl2.e1 + 0.18, fl2.e1 + 0.2, p2.z0, p2.z1); xsF[i].forEach(x => zsF[i].forEach(z => seamP.box(x - 0.46, x + 0.46, fl2.e0 + 0.18, fl2.e0 + 0.34, z - 0.46, z + 0.46))); }
        if (active) { if (fr > 0.04) xsF[nF].forEach(x => zsF[nF].forEach(z => pcP.box(x - 0.4, x + 0.4, f.e0 + 0.18, f.e1 - 0.32, z - 0.4, z + 0.4))); const pf = clamp((fr - 0.12) / 0.5, 0, 1); for (let x = fp.x0; x < fp.x0 + (fp.x1 - fp.x0) * pf - 0.5; x += 1.2) pcP.box(x + 0.02, Math.min(fp.x1, x + 1.18), f.e1 - 0.32, f.e1 - 0.02, fp.z0, fp.z1); }
      }
      if (FT === 'modular' || FT === 'module') {
        const mods = (i, cnt) => { const fl2 = sc.floors[i], p2 = D.fp[i], w = (p2.x1 - p2.x0) / nMods, zc = (p2.z0 + p2.z1) / 2, rows = FT === 'module' ? [[p2.z0, p2.z1]] : [[p2.z0, zc - 0.6], [zc + 0.6, p2.z1]]; let k = 0; for (let r = 0; r < rows.length; r++) for (let j = 0; j < nMods; j++) { if (k++ >= cnt) return; const [za, zb] = rows[r], c = FT === 'module' ? 0x8fa1b5 : (j + r + i) % 3 === 0 ? 0xdcd8cf : 0xe9e6df; if (FT === 'module') { const xa = p2.x0 + j * w; modP.tint(modP.box(xa + 0.1, xa + w - 0.1, fl2.e0 + 0.2, fl2.e0 + 0.35, za + 0.2, zb - 0.2), 0x9aa3ad); continue; } modP.tint(modP.box(p2.x0 + j * w + 0.05, p2.x0 + (j + 1) * w - 0.05, fl2.e0 + 0.06, fl2.e1 - 0.06, za + 0.05, zb - 0.05), c); } if (FT === 'modular') modP.tint(modP.box(p2.x0, p2.x1, fl2.e0, fl2.e0 + 0.2, zc - 0.6, zc + 0.6), 0xb9b9bd); };
        for (let i = 0; i < nF; i++) mods(i, 1e9);
        if (active) mods(nF, Math.floor(fr * (FT === 'module' ? nMods : nMods * 2)));
      }
      if (FT === 'truss' && nF > 0) {
        const i = nF - 1, fl2 = sc.floors[i], p2 = D.fp[i], yt = fl2.e1 - 0.45, yb2 = fl2.e1 - 2.7, col = 0x7f93a8;
        zsF[i].forEach(z => { stP.tint(stP.box(p2.x0, p2.x1, yt - 0.12, yt + 0.12, z - 0.15, z + 0.15), col); stP.tint(stP.box(p2.x0 + 1.5, p2.x1 - 1.5, yb2 - 0.1, yb2 + 0.1, z - 0.12, z + 0.12), col); for (let x = p2.x0 + 1.5, k = 0; x < p2.x1 - 1.5; x += 3, k++) { stP.tint(stP.box(x - 0.06, x + 0.06, yb2, yt, z - 0.06, z + 0.06), col); stP.tint(stP.seg(x, k % 2 ? yt : yb2, z, Math.min(p2.x1 - 1.5, x + 3), k % 2 ? yb2 : yt, z, 0.12, 0.12), col); } });
        for (let x = p2.x0 + 1.5; x < p2.x1; x += 3) stP.tint(stP.box(x - 0.08, x + 0.08, yt + 0.12, yt + 0.3, p2.z0, p2.z1), 0x9fb0c2);
      }
      // 야드: 현장 조립은 프라이머 칠한 부재 더미, 플랜트 모듈은 다음 모듈을 실은 다축 트레일러(SPMT)
      if (layP && active && S.structP < 1) {
        // 빈 땅 고르기: 건물 왼쪽 → 앞 → 오른쪽 순서 (길이 방향 ax: 'x' 또는 'z')
        const lx = G.bx0 - 3, fz = pd / 2 - bd / 2 - 2, rx = pw - G.bx1 - 3;
        const Y = lx >= 6 ? [G.bx0 - 2 - Math.min(10, lx - 1), G.bx0 - 2, -Math.min(bd / 2, 7), Math.min(bd / 2, 7)] : fz >= 6 ? [G.bx0 + 2, G.bx0 + 14, bd / 2 + 2, bd / 2 + 2 + Math.min(10, fz - 1)] : rx >= 6 ? [G.bx1 + 2, G.bx1 + 2 + Math.min(10, rx - 1), -Math.min(bd / 2, 7), Math.min(bd / 2, 7)] : null;
        if (Y) {
          const alongX = Y[1] - Y[0] >= Y[3] - Y[2], L0 = alongX ? Y[0] : Y[2], L1 = alongX ? Y[1] : Y[3], W0 = alongX ? Y[2] : Y[0], W1 = alongX ? Y[3] : Y[1];
          const B = (l0, l1, y0, y1, w0, w1, c) => layP.tint(alongX ? layP.box(l0, l1, y0, y1, w0, w1) : layP.box(w0, w1, y0, y1, l0, l1), c);
          if (FT === 'stick') {
            const len = Math.min(9, L1 - L0 - 0.5);
            for (let k = 0; k < 3; k++) { const wa = W0 + 0.5 + k * 2.8; if (wa + 2 > W1) break; for (let r = 0; r < 4 - (k === 2 ? 1 : 0); r++) for (let c = 0; c < 3; c++) B(L0, L0 + len, 0.25 + r * 0.5, 0.67 + r * 0.5, wa + c * 0.65, wa + c * 0.65 + 0.3, k === 1 ? 0x7f93a8 : 0xb5543c); [L0 + 1, L0 + len - 1].forEach(l => B(l - 0.15, l + 0.15, 0, 0.25, wa - 0.2, wa + 2.1, 0x8a6a45)); }
          } else if (FT === 'module') {
            const len = Math.min(11, L1 - L0 - 0.5), W = Math.min(4.4, W1 - W0 - 0.5), wc = (W0 + W1) / 2, w0 = wc - W / 2, w1 = wc + W / 2;
            B(L0, L0 + len, 0.7, 1.05, w0, w1, 0x3a3b40);
            for (let l = L0 + 0.6; l < L0 + len - 0.3; l += 1.1) [w0 + 0.4, w1 - 0.4].forEach(w => B(l - 0.35, l + 0.35, 0, 0.7, w - 0.3, w + 0.3, 0x1c1c1e));
            const m0 = 1.05, m1 = m0 + 6;
            [[L0 + 0.6, w0 + 0.3], [L0 + len - 0.6, w0 + 0.3], [L0 + 0.6, w1 - 0.3], [L0 + len - 0.6, w1 - 0.3]].forEach(([l, w]) => B(l - 0.18, l + 0.18, m0, m1, w - 0.18, w + 0.18, 0x8fa1b5));
            [m0 + 0.2, m0 + 3, m1].forEach(y => [w0 + 0.3, w1 - 0.3].forEach(w => B(L0 + 0.6, L0 + len - 0.6, y - 0.2, y, w - 0.15, w + 0.15, 0x8fa1b5)));
            const vc = L0 + len * 0.3; if (eqP) eqP.tint(alongX ? eqP.cyl(vc, wc, m0 + 0.3, m1 - 0.4, Math.min(1.3, W / 2 - 0.4)) : eqP.cyl(wc, vc, m0 + 0.3, m1 - 0.4, Math.min(1.3, W / 2 - 0.4)), 0xe8e8ea);
            if (pipeR) [0x3d8fd6, 0xd9822b].forEach((c, k) => { const y = m1 - 1.2 - k * 0.6, w = wc + 1 - k * 0.6; pipeR.tint(alongX ? pipeR.seg(L0 + 0.4, y, w, L0 + len - 0.4, y, w, 0.36) : pipeR.seg(w, y, L0 + 0.4, w, y, L0 + len - 0.4, 0.36), c); });
          }
        }
      }
      if (wpId === 'frame') { const yl = (active ? f.e1 : sc.floors[Math.max(0, nF - 1)].e1) + 4; lab('frame', (G.bx0 + G.bx1) / 2, yl, -bd / 4); }
    }

    // ---------- 거푸집 (지금 층) ----------
    R.formBox.visible = false; R.acs.visible = false; R.shoreI.count = 0;
    const formOn = active && K('form');
    if (formOn) {
      const y0 = f.e0 + 0.18, ys = f.e1 - 0.32, xs = xsF[nF], zs = zsF[nF];
      const fk = S.formK == null ? 1 : S.formK, Wf = fp.x1 - fp.x0, xS = fp.x0 + Wf * clamp(fk * 1.25, 0, 1), xD = fp.x0 + Wf * clamp(fk * 1.25 - 0.22, 0, 1);
      if (FM === 'conv') {
        // 한쪽 끝에서부터: 동바리·멍에가 먼저 서고(xS), 그 뒤를 장선·합판이 따라 깔린다(xD). 기둥 거푸집은 처음부터 선다
        if (stage < 3) { if (xD > fp.x0 + 0.3) { woodP.box(fp.x0, xD, ys - 0.05, ys, fp.z0, fp.z1); for (let z = fp.z0 + 0.6; z < fp.z1; z += 1.2) woodP.box(fp.x0, xD, ys - 0.2, ys - 0.05, z - 0.05, z + 0.05); } for (let x = fp.x0 + 0.6; x < xS; x += 1.2) for (let z = fp.z0 + 0.6; z < fp.z1; z += 1.2) shoreP.box(x - 0.04, x + 0.04, y0, ys - 0.2, z - 0.04, z + 0.04); if (xS > fp.x0 + 0.3) for (let z = fp.z0 + 0.6; z < fp.z1; z += 2.4) shoreP.box(fp.x0, xS, (y0 + ys) / 2 - 0.03, (y0 + ys) / 2 + 0.03, z - 0.03, z + 0.03); if (stage < 2 && FT !== 'rcwall') xs.forEach(x => zs.forEach(z => woodP.box(x - 0.5, x + 0.5, y0, ys - 0.2, z - 0.5, z + 0.5))); }
        for (let k = 1; k <= 2; k++) { const i = nF - k; if (i < 0) break; const f2 = sc.floors[i], p2 = D.fp[i]; for (let x = p2.x0 + 1.2; x < p2.x1; x += 2.4) for (let z = p2.z0 + 1.2; z < p2.z1; z += 2.4) shoreP.box(x - 0.04, x + 0.04, f2.e0 + 0.18, f2.e1 - 0.32, z - 0.04, z + 0.04); }
      } else if (FM === 'alform') {
        if (stage < 3) { if (xD > fp.x0 + 0.3) alP.box(fp.x0, xD, ys - 0.06, ys, fp.z0, fp.z1); for (let x = fp.x0 + 1.2; x < xD; x += 1.2) alP.box(x - 0.03, x + 0.03, ys - 0.1, ys - 0.06, fp.z0, fp.z1); if (stage < 2) { if (FT === 'rcwall') { xs.forEach(x => alP.box(x - 0.24, x + 0.24, y0, ys - 0.06, fp.z0, fp.z1)); [fp.z0, fp.z1].forEach(z => alP.box(fp.x0, fp.x1, y0, ys - 0.06, z - 0.24, z + 0.24)); } else xs.forEach(x => zs.forEach(z => alP.box(x - 0.55, x + 0.55, y0, ys - 0.06, z - 0.55, z + 0.55))); } for (let x = fp.x0 + 0.9; x < xS; x += 1.8) for (let z = fp.z0 + 0.9; z < fp.z1; z += 1.8) shoreP.box(x - 0.04, x + 0.04, y0, ys - 0.06, z - 0.04, z + 0.04); }
        if (nF > 0) { const f2 = sc.floors[nF - 1], p2 = D.fp[nF - 1]; for (let x = p2.x0 + 1.8; x < p2.x1; x += 3.6) for (let z = p2.z0 + 1.8; z < p2.z1; z += 3.6) shoreP.box(x - 0.04, x + 0.04, f2.e0 + 0.18, f2.e1 - 0.32, z - 0.04, z + 0.04); }
      } else if (FM === 'gang') {
        // 갱폼은 아래층에서 크레인으로 한 층 끌어올린다 (단계 처음 30%)
        const up = nF > 0 ? (f.e1 - f.e0) * (1 - S.sm(fk / 0.3)) : 0, yA = f.e0 - 0.6 - up, yB = f.e1 + 1.1 - up, o = 0.42, gap = wpId === 'form' ? 1 : -1; let pi = 0;
        const side = (a, b, fix, alongX, out) => { for (let u = a; u < b - 0.5; u += 6) { const u1 = Math.min(b, u + 5.9); if (pi++ === gap) continue; if (alongX) gangP.box(u, u1, yA, yB, fix - 0.11, fix + 0.11); else gangP.box(fix - 0.11, fix + 0.11, yA, yB, u, u1); for (let r = u + 0.5; r < u1; r += 1.0) alongX ? ribP.box(r - 0.05, r + 0.05, yA, yB, fix + out * 0.11, fix + out * 0.24) : ribP.box(fix + out * 0.11, fix + out * 0.24, yA, yB, r - 0.05, r + 0.05); } [f.e1 + 0.95 - up, f.e0 + 0.25 - up, f.e0 - 2.6 - up].forEach(y => { if (alongX) { platP.box(a - 1.4, b + 1.4, y - 0.06, y, Math.min(fix + out * 0.24, fix + out * 1.4), Math.max(fix + out * 0.24, fix + out * 1.4)); platP.box(a - 1.4, b + 1.4, y + 1.0, y + 1.06, fix + out * 1.38, fix + out * 1.44); } else { platP.box(Math.min(fix + out * 0.24, fix + out * 1.4), Math.max(fix + out * 0.24, fix + out * 1.4), y - 0.06, y, a, b); platP.box(fix + out * 1.38, fix + out * 1.44, y + 1.0, y + 1.06, a, b); } }); };
        side(fp.x0, fp.x1, fp.z0 - o, true, -1); side(fp.x0, fp.x1, fp.z1 + o, true, 1); side(fp.z0, fp.z1, fp.x0 - o, false, -1); side(fp.z0, fp.z1, fp.x1 + o, false, 1);
      } else if (FM === 'slip' && !S.hasCore) {
        // 코어가 없는 골조(철골·트러스·플랜트): 양 끝 계단·승강기 샤프트를 슬립폼으로 밤낮 없이 쉬지 않고 올린다
        const ct = Math.min(G.H + 1, f.e0 + (f.e1 - f.e0) * fr + 5), cz = Math.max(1.5, Math.min(3.2, (fp.z1 - fp.z0) / 2 - 1)), t3 = 0.35;
        const ring = (a, b, y, t = 0.12, m2 = 1.8) => { platP.box(a - m2, b + m2, y - t, y, -cz - m2, -cz); platP.box(a - m2, b + m2, y - t, y, cz, cz + m2); platP.box(a - m2, a, y - t, y, -cz, cz); platP.box(b, b + m2, y - t, y, -cz, cz); };
        [[fp.x0 + 1.5, fp.x0 + 7.5], [fp.x1 - 7.5, fp.x1 - 1.5]].forEach(([a, b]) => {
          rcP.box(a, a + t3, 0, ct, -cz, cz); rcP.box(b - t3, b, 0, ct, -cz, cz); rcP.box(a, b, 0, ct, -cz, -cz + t3); rcP.box(a, b, 0, ct, cz - t3, cz);
          ring(a, b, ct + 0.3, 0.25); ring(a, b, ct - 2.4); ring(a, b, ct - 4.4);
          for (let x = a; x <= b + 0.01; x += 2) [-cz, cz].forEach(z => { yokeP.box(x - 0.08, x + 0.08, ct - 1.2, ct + 1.6, z - 0.63, z - 0.47); yokeP.box(x - 0.08, x + 0.08, ct - 1.2, ct + 1.6, z + 0.47, z + 0.63); yokeP.box(x - 0.1, x + 0.1, ct + 1.5, ct + 1.8, z - 0.65, z + 0.65); rodP.box(x - 0.03, x + 0.03, ct + 1.8, ct + 5.4, z - 0.03, z + 0.03); });
        });
        if (wpId === 'form') lab('form', fp.x1 - 4.5, ct + 6.5, 0);
      } else if ((FM === 'acs' || FM === 'slip') && S.hasCore) {
        const cx0 = S.cx0, cx1 = S.cx1, cz = S.cz, m2 = 2.2;
        let ct = S.ctop; if (FM === 'slip') { const cn = S.cn; ct = S.ctop + (cn < NF ? D.fh[cn] * fr : 0); R.core.forEach((w, i) => { const t3 = 0.4; if (i === 0) setBox(w, cx0, cx0 + t3, 0, ct, -cz, cz); if (i === 1) setBox(w, cx1 - t3, cx1, 0, ct, -cz, cz); if (i === 2) setBox(w, cx0, cx1, 0, ct, -cz, -cz + t3); if (i === 3) setBox(w, cx0, cx1, 0, ct, cz - t3, cz); }); }
        const ring = (y, t = 0.12) => { platP.box(cx0 - m2, cx1 + m2, y - t, y, -cz - m2, -cz); platP.box(cx0 - m2, cx1 + m2, y - t, y, cz, cz + m2); platP.box(cx0 - m2, cx0, y - t, y, -cz, cz); platP.box(cx1, cx1 + m2, y - t, y, -cz, cz); };
        if (FM === 'acs') {
          [1.6, -1.5, -4.6, -7.7].forEach(dy => ring(ct + dy));
          scrP.box(cx0 - m2, cx1 + m2, ct - 8.6, ct + 2.6, -cz - m2 - 0.05, -cz - m2); scrP.box(cx0 - m2, cx1 + m2, ct - 8.6, ct + 2.6, cz + m2, cz + m2 + 0.05); scrP.box(cx0 - m2 - 0.05, cx0 - m2, ct - 8.6, ct + 2.6, -cz - m2, cz + m2); scrP.box(cx1 + m2, cx1 + m2 + 0.05, ct - 8.6, ct + 2.6, -cz - m2, cz + m2);
          [[cx0 - 0.15, -cz * 0.5], [cx0 - 0.15, cz * 0.5], [cx1 + 0.15, -cz * 0.5], [cx1 + 0.15, cz * 0.5]].forEach(([x, z]) => { yokeP.box(x - 0.12, x + 0.12, ct - 9.5, ct + 1.2, z - 0.15, z + 0.15); yokeP.box(x - 0.3, x + 0.3, ct - 3.6, ct - 2.6 + 0.6 * Math.sin(T * 0.4), z - 0.3, z + 0.3); });
          const fh = f.e1 - f.e0, o = 0.7; scrP.box(fp.x0 - o, fp.x1 + o, f.e0 - fh, f.e1 + 2, fp.z0 - o - 0.05, fp.z0 - o); scrP.box(fp.x0 - o, fp.x1 + o, f.e0 - fh, f.e1 + 2, fp.z1 + o, fp.z1 + o + 0.05); scrP.box(fp.x0 - o - 0.05, fp.x0 - o, f.e0 - fh, f.e1 + 2, fp.z0 - o, fp.z1 + o); scrP.box(fp.x1 + o, fp.x1 + o + 0.05, f.e0 - fh, f.e1 + 2, fp.z0 - o, fp.z1 + o);
          if (wpId === 'form') lab('form', cx1 + 3, ct + 4, 0);
        } else {
          ring(ct + 0.3, 0.25); ring(ct - 2.4); ring(ct - 4.4);
          const per = []; for (let x = cx0; x <= cx1; x += 2.5) { per.push([x, -cz]); per.push([x, cz]); } for (let z = -cz + 2.5; z < cz; z += 2.5) { per.push([cx0, z]); per.push([cx1, z]); }
          per.forEach(([x, z]) => { const nx2 = x === cx0 ? 1 : x === cx1 ? -1 : 0, nz2 = nx2 ? 0 : z < 0 ? 1 : -1, a = 0.55; yokeP.box(x - nx2 * a - 0.08, x - nx2 * a + 0.08, ct - 1.2, ct + 1.6, z - nz2 * a - 0.08, z - nz2 * a + 0.08); yokeP.box(x + nx2 * a - 0.08, x + nx2 * a + 0.08, ct - 1.2, ct + 1.6, z + nz2 * a - 0.08, z + nz2 * a + 0.08); yokeP.box(Math.min(x - nx2 * a, x + nx2 * a) - 0.1, Math.max(x - nx2 * a, x + nx2 * a) + 0.1, ct + 1.5, ct + 1.8, Math.min(z - nz2 * a, z + nz2 * a) - 0.1, Math.max(z - nz2 * a, z + nz2 * a) + 0.1); rodP.box(x - 0.03, x + 0.03, ct + 1.8, ct + 5.4, z - 0.03, z + 0.03); });
          if (wpId === 'form') lab('form', cx1 + 3, ct + 6, 0);
        }
      } else if (FM === 'deck' && stage < 3) { if (xD > fp.x0 + 0.3) deckP.box(fp.x0, Math.min(fp.x1, xD + Wf * 0.1), ys - 0.06, ys, fp.z0, fp.z1); [[fp.x0, fp.x1, fp.z0 - 0.02, fp.z0], [fp.x0, fp.x1, fp.z1, fp.z1 + 0.02], [fp.x0 - 0.02, fp.x0, fp.z0, fp.z1], [fp.x1, fp.x1 + 0.02, fp.z0, fp.z1]].forEach(([a, b, c, d]) => shoreP.box(a, b, ys, ys + 0.5, c, d)); }
      if (wpId === 'form' && FM !== 'acs' && FM !== 'slip') lab('form', (fp.x0 + fp.x1) / 2, f.e1 + (FM === 'gang' ? 3.5 : 3), fp.z0 - 1);
    }

    // ---------- 철근 (지금 층) ----------
    if (active && K('rebar') && stage >= 1 && stage < 3) {
      const xs = xsF[nF], zs = zsF[nF], RB = ids.rebar;
      if (FT !== 'rcwall' && FT !== 'modular') xs.forEach(x => zs.forEach(z => [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach(([a, b]) => { rodP.box(x + a - 0.025, x + a + 0.025, f.e1, f.e1 + 1.5, z + b - 0.025, z + b + 0.025); if (RB === 'coupler') cplP.cyl(x + a, z + b, f.e1 + 0.45, f.e1 + 0.62, 0.06); })));
      else xs.forEach(x => { for (let z = fp.z0 + 0.5; z < fp.z1; z += 1.0) rodP.box(x - 0.025, x + 0.025, f.e1, f.e1 + 1.3, z - 0.025, z + 0.025); });
      if (RB === 'mesh' && R.rebarTex) { R.rebarTex.repeat.multiplyScalar(3); for (let x = fp.x0 + 2.4; x < fp.x1; x += 2.4) rodP.box(x - 0.04, x + 0.04, f.e1 + 0.06, f.e1 + 0.1, fp.z0, fp.z1); }
      if (wpId === 'rebar') {
        const yx = pw + 0.8, yz = -pd / 2 + 2;
        if (RB === 'site') { yardP.tint(yardP.box(yx, yx + 1.4, 0, 1.1, yz, yz + 1.6), 0x2f7fd0); for (let k = 0; k < 14; k++) yardP.tint(yardP.box(yx + (k % 7) * 0.45, yx + (k % 7) * 0.45 + 0.08, 0.2 + Math.floor(k / 7) * 0.3, 0.28 + Math.floor(k / 7) * 0.3, yz + 2.2, yz + 11), 0xd9822b); }
        if (RB === 'shop') for (let k = 0; k < 6; k++) { const i = yardP.box(yx + (k % 3) * 1.2, yx + (k % 3) * 1.2 + 1.0, Math.floor(k / 3) * 0.55, Math.floor(k / 3) * 0.55 + 0.5, yz + 1, yz + 5 + k % 2 * 2); yardP.tint(i, 0xd9822b); yardP.tint(yardP.box(yx + (k % 3) * 1.2 + 0.3, yx + (k % 3) * 1.2 + 0.7, Math.floor(k / 3) * 0.55 + 0.5, Math.floor(k / 3) * 0.55 + 0.52, yz + 1.2, yz + 1.6), [0x3fae6a, 0x2f7fd0, 0xffd23a][k % 3]); }
        if (RB === 'cage' && cageYard) for (let k = 0; k < 3; k++) cageYard.seg(yx + 0.8 + k * 1.2, 0.6, yz + 1, yx + 0.8 + k * 1.2, 0.6, yz + 7, 1.0);
        lab('rebar', (fp.x0 + fp.x1) / 2, f.e1 + 3, fp.z0 - 1);
      }
    }

    // ---------- 타설 ----------
    R.pump.visible = false; R.mixers.forEach(m => { m.visible = false; });
    const pourVis = S.pourNow || (wpId === 'pour' && active), PR = ids.pour;
    if (pourVis && active) {
      // 호스 끝: 지금 치는 띠를 따라가며 좌우로 조금씩 흔든다. 처음에는 붐을 접은 자리(펌프 위)에서 펴 온다
      const q = S.pourPt, pf = q ? clamp(q.u, 0.02, 1) : 0.5;
      const tgt = q ? new THREE.Vector3(q.x + q.ws * 0.32 * Math.sin(T * 0.9), f.e1 + 0.3, clamp(q.z + 0.6 * Math.sin(T * 0.37), fp.z0 + 0.5, fp.z1 - 0.5)) : new THREE.Vector3(fp.x0 + (fp.x1 - fp.x0) * 0.5, f.e1 + 0.3, (fp.z0 + fp.z1) / 2);
      if (q && q.setup < 1) tgt.lerpVectors(new THREE.Vector3(Math.min(S.PX - 4, fp.x1 - 1), Math.max(f.e1 + 7, 13), -bd / 4), tgt.clone(), q.setup);
      if (S.cutNow) tgt.z = Math.min(tgt.z, -1);
      if (PR === 'boom' || PR === 'winter' || PR === 'multi') {
        const np = PR === 'multi' ? 3 : 1; let far = false;
        for (let i = 0; i < np; i++) { const pt = pumps[i], z = -bd / 4 + (i - (np - 1) / 2) * 14; place(pt.g, S.PX, 0.1, z, PYAW); if (i === 0) io.bays.pump = { x: S.PX, z, nose: PNOSE }; const t2 = tgt.clone(); if (np > 1) t2.x = fp.x0 + (fp.x1 - fp.x0) * clamp(pf + (i - 1) * 0.22, 0.05, 0.95); far = aimBoom(pt, new THREE.Vector3(S.PX, 3.3, z - 2.6 * PNOSE), t2) || far; io.hot.push({ k: 'hose', x: t2.x, y: f.e1 + 0.2, z: t2.z }); }
        if (far && wpId === 'pour') lab('pour', S.PX, 50, -bd / 4, `붐 도달 58m 초과 · ${Math.round(f.e1)}m는 고정 배관 필요`);
        else if (wpId === 'pour') lab('pour', S.PX, Math.min(f.e1 + 12, 60), -bd / 4);
      } else if (PR === 'cpb' || PR === 'highp') {
        // 고정식 펌프는 바깥 차로(점용)에 두고, 레미콘이 뒤 호퍼에 후진해 붙는다 (펌프 뒤끝이 레미콘 쪽)
        const sx = S.PX, sz = -bd / 4 - 6, hz = sz - PNOSE * 6.6; place(stat, sx, 0.1, sz, PNOSE < 0 ? 0 : Math.PI); io.bays.pump = { x: sx, z: hz + PNOSE * 5.6, nose: PNOSE };
        const rx = G.bx1 + 0.45, rz = -bd / 4, wd = PR === 'highp' ? 0.34 : 0.22;
        pipeP.seg(sx, 1.6, sz + 1.5, rx, 1.6, rz, wd); pipeP.seg(rx, 1.6, rz, rx, f.e1 + 0.6, rz, wd); pipeP.seg(rx, f.e1 + 0.6, rz, S.cx1 + 2.5, f.e1 + 0.6, rz, wd * 0.9);
        if (PR === 'highp') for (let y = 30; y < f.e1; y += 36) cpbP.box(rx - 0.5, rx + 0.5, y, y + 1.2, rz - 0.5, rz + 0.5);
        const mx = S.cx1 + 2.5, my = f.e1 + 0.2, a1 = T * 0.25, L1 = Math.min(10, (fp.x1 - fp.x0) * 0.35), L2 = L1 * 0.8, a2 = a1 + 1.4 + 0.5 * Math.sin(T * 0.4);
        cpbP.box(mx - 0.3, mx + 0.3, my, my + 3.2, rz - 0.3, rz + 0.3); const p1 = [mx + Math.cos(a1) * L1, my + 3.4, rz + Math.sin(a1) * L1 * 0.6], p2 = [p1[0] + Math.cos(a2) * L2, my + 3.2, p1[2] + Math.sin(a2) * L2 * 0.6];
        cpbP.seg(mx, my + 3.3, rz, ...p1, 0.35); cpbP.seg(...p1, ...p2, 0.3); pipeP.seg(p2[0], p2[1], p2[2], p2[0], my + 0.3, p2[2], 0.16);
        if (wpId === 'pour') lab('pour', rx + 2, Math.min(f.e1 * 0.5, 40), rz, PR === 'highp' ? `초고압 펌프 · 수직 압송 ${Math.round(f.e1)}m` : undefined);
      } else if (PR === 'bucket') { place(mixers[0], sc.crX + 6, 0.1, -bd / 2 - 9, Math.PI / 2); mixers[0].userData.drum.rotation.y = T * 1.6; if (wpId === 'pour') lab('pour', (fp.x0 + fp.x1) / 2, f.e1 + 6, fp.z0 - 2); }
      if (PR === 'winter') { filmP.box(fp.x0 - 0.4, fp.x1 + 0.4, f.e1 + 0.2, f.e1 + 2.8, fp.z0 - 0.4, S.cutNow ? 0 : fp.z1 + 0.4); for (let x = fp.x0 + 3; x < fp.x1 - 1; x += 7) heatP.box(x - 0.4, x + 0.4, f.e0 + 0.18, f.e0 + 1.0, fp.z0 + 2, fp.z0 + 2.6); }
    }
    // 양생 막은 타설·콘크리트 공종을 볼 때만 (다른 공종에서는 층 전체를 덮어 골조를 가린다)
    if (active && stage === 3 && (wpId === 'pour' || wpId === 'conc')) { if (PR === 'winter') filmP.box(fp.x0 - 0.4, fp.x1 + 0.4, f.e1 + 0.2, f.e1 + 2.8, fp.z0 - 0.4, S.cutNow ? 0 : fp.z1 + 0.4); else { const ck = clamp(((S.cureK == null ? 1 : S.cureK) - 0.3) / 0.35, 0, 1); if (ck > 0.01) filmP.box(fp.x0, fp.x0 + (fp.x1 - fp.x0) * ck, f.e1 + 0.19, f.e1 + 0.23, fp.z0, S.cutNow ? 0 : fp.z1); } }

    // ---------- 철골 접합 ----------
    if (K('steel') && steelSk && ids.steel !== 'none' && active) {
      const top = nSt - 1, fl2 = sc.floors[top], xs = xsF[top], zs = zsF[top];
      if (ids.steel === 'bolt') xs.forEach(x => zs.forEach(z => wldP.tint(wldP.box(x - 0.34, x + 0.34, fl2.e0 + 1.0, fl2.e0 + 1.5, z - 0.34, z + 0.34), 0x4a4c52)));
      if (ids.steel === 'weld') xs.forEach((x, j) => zs.forEach((z, k) => { if ((j + k) % 2) return; wldP.tint(wldP.box(x - 0.8, x + 0.8, fl2.e0 + 0.4, fl2.e0 + 2.2, z - 0.8, z + 0.8), 0x2b2c30); }));
      if (ids.steel === 'robot') { xs.forEach((x, j) => zs.forEach((z, k) => { if ((j + k) % 3) return; const a = T * 0.8 + j; wldP.tint(wldP.box(x + Math.cos(a) * 0.55 - 0.18, x + Math.cos(a) * 0.55 + 0.18, fl2.e0 + 1.0, fl2.e0 + 1.4, z + Math.sin(a) * 0.55 - 0.18, z + Math.sin(a) * 0.55 + 0.18), 0xff8a3d); wldP.tint(wldP.box(x - 0.6, x + 0.6, fl2.e0 + 0.95, fl2.e0 + 1.0, z - 0.6, z + 0.6), 0x3a3b40); })); const ts = [fp.x0 + 2, f.e1 + 1.4, fp.z0 + 2]; [[xs[0], zs[zs.length - 1]], [xs[xs.length - 1], zs[zs.length - 1]], [xs[xs.length - 1], zs[0]]].forEach(([x, z]) => lasP.seg(...ts, x, fl2.e1, z, 0.03)); }
      if (ids.steel === 'block' && blockYard) { const bx = G.bx0 + 1, bz = bd / 2 + 1.5, n2 = Math.floor(frac(S.structP * NF / 3) * 12); for (let k = 0; k < Math.min(12, n2); k++) { const x = bx + (k % 4) * 2.6, h = 3.4 * (1 + Math.floor(k / 4)); blockYard.box(x - 0.2, x + 0.2, 0, Math.min(h, 7), bz, bz + 0.4); blockYard.box(bx, bx + 7.8, Math.min(h, 7) - 0.2, Math.min(h, 7), bz, bz + 0.4); } }
      if (wpId === 'steel') lab('steel', (fp.x0 + fp.x1) / 2, fl2.e1 + 3, fp.z0 - 1);
    }

    // ---------- 양중 ----------
    hookG.visible = false; R.hookLoad.visible = false;
    pend.forEach(o => { o.visible = false; }); trol.visible = false; aF.forEach(o => { o.visible = false; }); tele.forEach(o => { o.visible = false; });
    crExtra.visible = R.crane.visible;
    if (R.crane.visible) {
      const tower = LF === 'tower' || LF === 'luffing', mobileLike = !tower;
      latMs.forEach(([o, m]) => { if (o === R.mast) m.map.repeat.set(1, Math.max(1, o.scale.y / 2)); else if (o === R.apex) m.map.repeat.set(1, Math.max(1, o.scale.y / 1.5)); else m.map.repeat.set(Math.max(1, o.scale.x / 1.6), 1); });
      R.mast.visible = tower; R.mastS.visible = tower;
      const jb = R.jib, L = jb.scale.x, ang = jb.rotation.z, tipX = Math.cos(ang) * L, tipY = Math.sin(ang) * L + 0.6;
      if (LF === 'ringer') jb.scale.set(L, 2.4, 2.4); if (LF === 'mobile') { jb.visible = false; tele.forEach((o, i) => { o.visible = true; const a = i * L / 4 - (i ? 0.6 : 0), b = (i + 1) * L / 4, w = o.userData.w; o.position.set(Math.cos(ang) * (a + b) / 2, Math.sin(ang) * (a + b) / 2 + 0.6, 0); o.rotation.set(0, 0, ang); o.scale.set(b - a, w, w); }); } else jb.visible = true;
      const hx = R.hookLoad.position.x, hy = R.hookLoad.position.y + 0.8;
      if (LF === 'tower') { pend[0].visible = pend[1].visible = true; segO(pend[0], 0, 6, 0, L * 0.6, 1.2, 0, 0.07); segO(pend[1], 0, 6, 0, -R.cjib.scale.x * 0.95, 1.1, 0, 0.07); trol.visible = true; setBox(trol, hx - 0.8, hx + 0.8, -0.15, 0.25, -0.75, 0.75); }
      if (LF === 'luffing') { aF.forEach((o, i) => { o.visible = true; segO(o, -2.2, 0.5, i ? 0.9 : -0.9, -0.8, 7.5, 0, 0.3); }); pend[0].visible = true; segO(pend[0], -0.8, 7.5, 0, tipX, tipY, 0, 0.08); }
      if (mobileLike && LF !== 'mobile') { pend[0].visible = true; segO(pend[0], -3.5, 7.5, 0, tipX, tipY, 0, 0.08); aF[0].visible = true; segO(aF[0], -4.2, 1.2, 0, -3.5, 7.5, 0, 0.4); }
      // 타워크레인 벽 지지 (약 30m마다)
      if (tower && S.top > 30) { const cxp = R.crane.position.x, czp = R.crane.position.z, zf = -bd / 2; for (let y = 28; y < Math.min(S.top - 4, R.mast.scale.y - 12); y += 30) [-0.9, 0.9].forEach(o => tieP.seg(cxp + o, y, czp + 0.9, cxp + o * 3.2, y, zf, 0.22)); }
      // 훅의 짐
      let load = 'pallet';
      if (S.structP > 0 && S.structP < 1) load = ['steel', 'hybrid', 'stick', 'src', 'truss'].includes(FT) ? 'beam' : FT === 'pc' ? 'pc' : FT === 'modular' ? 'module' : FT === 'module' ? 'pmod' : 'pallet';
      if (wpId === 'form' && FM === 'gang') load = 'gang';
      if (wpId === 'rebar' && ids.rebar === 'cage') load = 'cage';
      if (pourVis && PR === 'bucket') load = 'bucket';
      if (wpId === 'steel' && ids.steel === 'block') load = 'block';
      if ((wpId === 'skin' || (S.skinP > 0 && S.skinP < 1 && !(S.structP > 0 && S.structP < 1))) && ['unitcw', 'pcpanel', 'metal'].includes(SK)) load = SK === 'unitcw' ? 'unit' : SK === 'pcpanel' ? 'panel' : 'mpanel';
      hookG.visible = true; hookG.position.set(hx, hy, 0); Object.entries(hk).forEach(([k, g]) => { g.visible = k === load; });
      const st2 = slingTo[load] || []; slings.forEach((s, i) => { s.visible = i < st2.length; if (s.visible) segO(s, 0, -0.55, 0, ...st2[i], 0.04); }); hookBlk.visible = true;
      if (wpId === 'lift') lab('lift', R.crane.position.x, Math.min(S.Hc + 6, 120), R.crane.position.z);
    }
    // 격자 크레인: 상자 마스트·지브는 숨기고 마디를 쌓는다
    if (CR) {
      const on = R.crane.visible, tw = LF === 'tower' || LF === 'luffing', latJ = on && LF !== 'mobile';
      CR.mastI.visible = CR.slw.visible = CR.base.visible = CR.cwG.visible = on && tw; CR.cjI.visible = on && tw; CR.head.visible = on && LF === 'tower'; CR.jibG.visible = latJ; CR.cabM.visible = CR.cabG.visible = on;
      if (on) {
        R.cab.visible = false; hookBlk.visible = false; hookB.visible = hookG.visible;
        if (tw) {
          R.mast.visible = R.mastS.visible = R.apex.visible = R.cjib.visible = R.cwt.visible = false;
          const mh = Math.max(0, R.slew.position.y - SLEW_H), n = Math.ceil(mh / MAST_H - 1e-3);
          runI(CR.mastI, n, 200, i => { const y = i * MAST_H; M4.compose(V.set(0, y, 0), Q.identity(), S3.set(1, Math.max(0.05, Math.min(1, (mh - y) / MAST_H)), 1)); });
          const Lc = R.cjib.scale.x, nc = Math.ceil(Lc / CJIB_L - 1e-3);
          runI(CR.cjI, nc, 16, i => { M4.compose(V.set(-i * CJIB_L, 0, 0), Q.identity(), S3.set(Math.max(0.05, Math.min(1, (Lc - i * CJIB_L) / CJIB_L)), 1, 1)); });
          CR.cwG.position.set(-Lc + 0.25, 0.15, 0);
          CR.cabM.position.set(0.3, -0.1, 1.2); CR.cabG.position.copy(CR.cabM.position);
        } else { CR.cabM.position.set(0.6, -0.4, 1.2); CR.cabG.position.copy(CR.cabM.position); }
        if (latJ) {
          const jb = R.jib, L = jb.scale.x, k = LF === 'ringer' ? 1.9 : tw ? 1 : 1.3, sl = JIB_L * k, n = Math.ceil(L / sl - 1e-3);
          jb.visible = false; CR.jibG.position.set(0, tw ? 0 : 0.6 - 0.7 * k, 0); CR.jibG.rotation.set(0, 0, jb.rotation.z);
          runI(CR.jibI, n, 90, i => { M4.compose(V.set(i * sl, 0, 0), Q.identity(), S3.set(k * Math.max(0.05, Math.min(1, (L - i * sl) / sl)), k, k)); });
        }
      }
    }
    // 호이스트 벽 지지 · 계단탑
    if (HO) {
      const on = R.hMast.visible, hm = R.hMast;
      HO.mI.visible = on; HO.cars.forEach(({ c, g }) => { g.visible = on && c.visible; if (g.visible) { c.visible = false; g.position.set(c.position.x, c.position.y - c.scale.y / 2, c.position.z); g.scale.set(c.scale.x / 2, c.scale.y / 2.65, c.scale.z / 3); } });
      if (on) { hm.visible = false; const H = hm.scale.y, sx = hm.scale.x / 0.65, n = Math.ceil(H / HMAST_H - 1e-3); runI(HO.mI, n, 260, i => { const y = i * HMAST_H; M4.compose(V.set(hm.position.x, y, hm.position.z), Q.identity(), S3.set(sx, Math.max(0.05, Math.min(1, (H - y) / HMAST_H)), Math.min(sx, 1.6))); }); }
    }
    if (S.hOn && S.htop > 3) {
      const k = ids.hoist, mx = G.bx1 + 0.8, fz = 0;
      if (R.hMast.material.map) R.hMast.material.map.repeat.set(1, Math.max(1, S.htop / 1.6));
      if (k !== 'jump') for (let i = 2; i < Math.min(nF, NF); i += 3) { const y = sc.floors[i].e1 - 0.3; hoistX.box(G.bx1, mx, y - 0.1, y + 0.1, fz - 0.3, fz - 0.1); hoistX.box(G.bx1, mx, y - 0.1, y + 0.1, fz + 0.1, fz + 0.3); hoistX.box(mx + 0.8, mx + 3.0, sc.floors[i].e0 + 0.05, sc.floors[i].e0 + 0.15, -1.6, -1.5); }
      if (k === 'lift') { const sx = mx + 3.4; for (let y = 0; y < S.htop; y += 2) { hoistX.box(sx, sx + 3, y, y + 0.06, -1.5, 1.5); hoistX.seg(sx + 0.2, y, -1.2, sx + 2.8, y + 2, 1.2, 0.12, 0.8); } [[sx, -1.5], [sx + 3, -1.5], [sx, 1.5], [sx + 3, 1.5]].forEach(([x, z]) => hoistX.box(x - 0.05, x + 0.05, 0, S.htop, z - 0.05, z + 0.05)); }
      if (wpId === 'hoist') lab('hoist', mx + 4, Math.min(S.htop + 3, 60), 0);
    }

    // ---------- 외장 ----------
    const nS = S.nS, skinOn = K('skin') && S.skinP > 0;
    if (skinOn && SK === 'wet') { // 습식: 위층부터 아래로 — 공통 외장(아래부터)을 위에서부터로 다시 배치
      const t3 = 0.12; let c2 = 0;
      for (let k = 0; k < nS; k++) { const i = nF - 1 - k; if (i < 0) break; const f2 = sc.floors[i], p2 = D.fp[i]; ibox(R.skinX, c2 * 2, p2.x0 - 0.2, p2.x1 + 0.2, f2.e0, f2.e1, p2.z1, p2.z1 + t3); ibox(R.skinX, c2 * 2 + 1, p2.x0 - 0.2, p2.x1 + 0.2, f2.e0, f2.e1, p2.z0 - t3, p2.z0); ibox(R.skinZ, c2 * 2, p2.x0 - t3, p2.x0, f2.e0, f2.e1, p2.z0, p2.z1); ibox(R.skinZ, c2 * 2 + 1, p2.x1, p2.x1 + t3, f2.e0, f2.e1, p2.z0, p2.z1); c2++; }
      R.skinX.count = R.skinZ.count = c2 * 2; R.skinX.instanceMatrix.needsUpdate = R.skinZ.instanceMatrix.needsUpdate = true;
    }
    if ((skinOn || wpId === 'skin') && nF > 0) {
      const top = sc.floors[nF - 1].e1, p0 = D.fp[Math.max(0, nF - 1)];
      if (spandP) for (let i = 0; i < nS; i++) { const f2 = sc.floors[i], p2 = D.fp[i], hb = SK === 'unitcw' ? 0.9 : 0.5, y0 = f2.e1 - 0.45, o = 0.17; spandP.box(p2.x0 - 0.2, p2.x1 + 0.2, y0, y0 + hb, p2.z1 + 0.02, p2.z1 + o); spandP.box(p2.x0 - 0.2, p2.x1 + 0.2, y0, y0 + hb, p2.z0 - o, p2.z0 - 0.02); spandP.box(p2.x0 - o, p2.x0 - 0.02, y0, y0 + hb, p2.z0, p2.z1); spandP.box(p2.x1 + 0.02, p2.x1 + o, y0, y0 + hb, p2.z0, p2.z1); }
      const partial = SK !== 'wet' && nS < nF && S.skinP < 1 && unitP;
      if (partial) { // 지금 붙이는 층: 유닛이 한 장씩 늘어난다
        const i = nS, f2 = sc.floors[i], p2 = D.fp[i], cw = sTex.userData.cell, fk = frac(S.skinP * NF), per = [];
        for (let x = p2.x0; x < p2.x1 - 0.1; x += cw) per.push([x, Math.min(p2.x1, x + cw), 'z1']); for (let z = p2.z1; z > p2.z0 + 0.1; z -= cw) per.push([Math.max(p2.z0, z - cw), z, 'x1']); for (let x = p2.x1; x > p2.x0 + 0.1; x -= cw) per.push([Math.max(p2.x0, x - cw), x, 'z0']); for (let z = p2.z0; z < p2.z1 - 0.1; z += cw) per.push([z, Math.min(p2.z1, z + cw), 'x0']);
        const nU = Math.floor(fk * per.length); let last = null;
        for (let k = 0; k < Math.min(nU, unitP.cap); k++) { const [a, b, sd] = per[k]; if (sd === 'z1') unitP.box(a + 0.01, b - 0.01, f2.e0, f2.e1, p2.z1, p2.z1 + 0.12); else if (sd === 'z0') unitP.box(a + 0.01, b - 0.01, f2.e0, f2.e1, p2.z0 - 0.12, p2.z0); else if (sd === 'x1') unitP.box(p2.x1, p2.x1 + 0.12, f2.e0, f2.e1, a + 0.01, b - 0.01); else unitP.box(p2.x0 - 0.12, p2.x0, f2.e0, f2.e1, a + 0.01, b - 0.01); last = per[k]; }
        if (SK === 'unitcw' && wpId === 'skin') { const ry = Math.min(top + 1.2, f2.e1 + 4 * (f2.e1 - f2.e0)), o = 1.1; mullP.box(p2.x0 - o, p2.x1 + o, ry, ry + 0.25, p2.z1 + o - 0.1, p2.z1 + o + 0.1); mullP.box(p2.x1 + o - 0.1, p2.x1 + o + 0.1, ry, ry + 0.25, p2.z0 - o, p2.z1 + o); const hxp = last && last[2] === 'z1' ? (last[0] + last[1]) / 2 + 1.5 : p2.x0 + 2; mullP.box(hxp - 0.4, hxp + 0.4, ry - 0.6, ry, p2.z1 + o - 0.3, p2.z1 + o + 0.3); mullP.box(hxp - 0.02, hxp + 0.02, f2.e1 + 0.2, ry - 0.6, p2.z1 + o - 0.02, p2.z1 + o + 0.02); unitP.box(hxp - 0.75, hxp + 0.75, f2.e0 + 0.3, f2.e1 + 0.2, p2.z1 + o - 0.08, p2.z1 + o + 0.08); }
        if (SK === 'stickcw') { for (let k = 1; k <= 2; k++) { const j = i + k; if (j >= nF) break; const f3 = sc.floors[j], p3 = D.fp[j]; for (let x = p3.x0; x <= p3.x1 + 1e-6; x += 1.5) { mullP.box(x - 0.04, x + 0.04, f3.e0, f3.e1, p3.z1 + 0.02, p3.z1 + 0.17); mullP.box(x - 0.04, x + 0.04, f3.e0, f3.e1, p3.z0 - 0.17, p3.z0 - 0.02); } for (let z = p3.z0; z <= p3.z1 + 1e-6; z += 1.5) { mullP.box(p3.x1 + 0.02, p3.x1 + 0.17, f3.e0, f3.e1, z - 0.04, z + 0.04); mullP.box(p3.x0 - 0.17, p3.x0 - 0.02, f3.e0, f3.e1, z - 0.04, z + 0.04); } if (k === 1) { [f3.e0 + 0.9, f3.e1 - 0.5].forEach(y => { mullP.box(p3.x0, p3.x1, y - 0.04, y + 0.04, p3.z1 + 0.02, p3.z1 + 0.17); mullP.box(p3.x1 + 0.02, p3.x1 + 0.17, y - 0.04, y + 0.04, p3.z0, p3.z1); }); } }
          const gx = last && last[2] === 'z1' ? clamp((last[0] + last[1]) / 2, p2.x0 + 3, p2.x1 - 3) : (p2.x0 + p2.x1) / 2; place(gondola, gx, f2.e0 + 0.4, p2.z1 + 0.9, 0); gondola.userData.c.forEach((c, k) => { c.visible = true; segO(c, gx + (k ? 2.8 : -2.8), f2.e0 + 1.5, p2.z1 + 0.9, gx + (k ? 2.8 : -2.8), top + 1.5, p2.z1 + 0.9, 0.04); }); mullP.box(gx - 3.2, gx + 3.2, top + 1.2, top + 1.5, p2.z1 + 0.2, p2.z1 + 1.2); }
        else if (gondola) gondola.userData.c.forEach(c => { c.visible = false; });
        if (SK === 'metal' && mewp) {
          // 작업대를 지금 붙이는 패널 앞에 댄다: 선회체 힌지 → 주 붐(안쪽 단이 뽑혀 나온다) → 지브 → 작업대
          const bx = last && last[2] === 'z1' ? (last[0] + last[1]) / 2 : p2.x0 + 3, bz = p2.z1 + 6.5, hy = f2.e0 + 0.6; place(mewp, bx, 0, bz, 0);
          const [a1, a2, a3] = mewp.userData.a, tz = -(bz - p2.z1) + 0.75, ty = hy + 0.6 * (0.5 + 0.5 * Math.sin(T * 0.35)), ey = Math.max(3.4, ty + 1.3), ez = tz + 2.1, hz = 1.5, hyy = 2.1;
          segO(a1, 0, hyy, hz, 0, lerp(hyy, ey, 0.62), lerp(hz, ez, 0.62), 0.46); segO(a2, 0, lerp(hyy, ey, 0.5), lerp(hz, ez, 0.5), 0, ey, ez, 0.34); segO(a3, 0, ey, ez, 0, ty + 0.55, tz + 0.6, 0.2);
          const [rb1, rb2] = mewp.userData.ram, mx = lerp(hyy, ey, 0.3), mz = lerp(hz, ez, 0.3); segO(rb1, 0, 1.9, 0.2, 0, lerp(1.9, mx, 0.55), lerp(0.2, mz, 0.55), 0.2); segO(rb2, 0, lerp(1.9, mx, 0.55), lerp(0.2, mz, 0.55), 0, mx, mz, 0.11);
          mewp.userData.bk.position.set(0, ty, tz);
        }
      } else if (gondola) gondola.userData.c.forEach(c => { c.visible = false; });
      if (SK === 'wet' && scafP && S.skinP < 1 && skinOn) {
        // 시스템 비계: 마감이 위층부터 내려오므로 끝난 위층은 이미 해체했고, 지금 마감하는 층 아래로만 서 있다.
        // 한 단은 31m 이하(그보다 높으면 구조 검토 대상) → 위 단은 H형강 브래킷(까치발)으로 받치고, 평면이 줄어드는 곳은 아래층 지붕 위에 세운다.
        // 단마다: 안·밖 두 줄 수직재 + 밑받침 + 층마다 띠장 · 작업 발판 · 발끝막이 · 2단 난간 + 벽 이음 + 가새 + 계단탑 + 분진망
        const IN = 0.35, OUT = 1.25, t = 0.028, LIFT = 1.9, iW = Math.max(0, nF - 1 - nS);
        const same = (a, b) => Math.abs(a.x0 - b.x0) + Math.abs(a.x1 - b.x1) + Math.abs(a.z0 - b.z0) + Math.abs(a.z1 - b.z1) < 0.2;
        // 변 좌표 → 상자: u(변 방향) a~b, 벽에서 바깥으로 f0~f1, 높이 y0~y1
        const Bx = (P, ax, v, sg, a, b, f0, f1, y0, y1) => { const q0 = v + sg * f0, q1 = v + sg * f1; return ax ? P.box(a, b, y0, y1, Math.min(q0, q1), Math.max(q0, q1)) : P.box(Math.min(q0, q1), Math.max(q0, q1), y0, y1, a, b); };
        const stages = [];
        for (let i1 = iW; i1 >= 0;) { let i0 = i1; while (i0 > 0 && same(D.fp[i0 - 1], D.fp[i1]) && sc.floors[i1].e1 - sc.floors[i0 - 1].e0 <= 31) i0--; stages.push({ y0: i0 === 0 ? 0 : sc.floors[i0].e0, y1: sc.floors[i1].e1 + (i1 === iW ? 1.5 : 0), p: D.fp[i1], hung: i0 > 0 && same(D.fp[i0 - 1], D.fp[i1]) }); i1 = i0 - 1; }
        stages.forEach(({ y0: yB, y1: H, p: p2, hung }, sti) => {
          const zEnd = S.cutNow ? 0 : p2.z1;
          const sides = [[true, p2.z0, -1, p2.x0 - OUT, p2.x1 + OUT], [false, p2.x0, -1, p2.z0 - OUT, S.cutNow ? 0 : zEnd + OUT], [false, p2.x1, 1, p2.z0 - OUT, S.cutNow ? 0 : zEnd + OUT]]; if (!S.cutNow) sides.push([true, p2.z1, 1, p2.x0 - OUT, p2.x1 + OUT]);
          const lifts = []; for (let y = yB + LIFT; y < H - 0.4; y += LIFT) lifts.push(y);
          const bays = sides.map(([ax, v, sg, u0, u1]) => { const n = Math.max(1, Math.round((u1 - u0) / 1.83)); return { n, st: (u1 - u0) / n }; });
          sides.forEach(([ax, v, sg, u0, u1], si) => {
            const { n, st } = bays[si];
            for (let k = 0; k <= n; k++) { const u = u0 + k * st; [IN, OUT].forEach(f => { Bx(scafP, ax, v, sg, u - t, u + t, f - t, f + t, yB + 0.1, H); if (!hung) Bx(scafP, ax, v, sg, u - 0.09, u + 0.09, f - 0.09, f + 0.09, yB, yB + 0.035); }); }
            // 브래킷: 슬래브에 물린 H형강이 밖으로 내밀고 그 밑을 사재가 받친다 (두 칸마다)
            if (hung) { Bx(scafP, ax, v, sg, u0, u1, IN - 0.05, IN + 0.05, yB - 0.02, yB + 0.1); Bx(scafP, ax, v, sg, u0, u1, OUT - 0.05, OUT + 0.05, yB - 0.02, yB + 0.1);
              for (let k = 0; k <= n; k += 2) { const u = u0 + k * st, q0 = v + sg * 0.02, q1 = v + sg * (OUT + 0.12); Bx(scafP, ax, v, sg, u - 0.06, u + 0.06, -0.3, OUT + 0.15, yB - 0.2, yB - 0.02); if (ax) scafP.seg(u, yB - 1.5, q0, u, yB - 0.2, q1, 0.08); else scafP.seg(q0, yB - 1.5, u, q1, yB - 0.2, u, 0.08); } }
            lifts.forEach(y => {
              Bx(scafP, ax, v, sg, u0, u1, IN - t, IN + t, y - t, y + t); Bx(scafP, ax, v, sg, u0, u1, OUT - t, OUT + t, y - t, y + t);
              [0.55, 1.05].forEach(h => Bx(scafP, ax, v, sg, u0, u1, OUT - t, OUT + t, y + h - 0.02, y + h + 0.02));
              Bx(scafPl, ax, v, sg, u0, u1, IN + 0.03, OUT - 0.03, y + 0.03, y + 0.075); Bx(scafPl, ax, v, sg, u0, u1, OUT - 0.035, OUT - 0.01, y + 0.075, y + 0.22);
            });
          });
          // 벽 이음 (두 층·세 칸마다) → 가새 (바깥면, 네 칸마다 지그재그). 수가 넘치면 아래 단의 것부터 생략된다
          sides.forEach(([ax, v, sg, u0], si) => { const { n, st } = bays[si]; lifts.forEach((y, li) => { if (li % 2) return; for (let k = 1; k < n; k += 3) Bx(scafP, ax, v, sg, u0 + k * st - t, u0 + k * st + t, 0, IN, y - 0.3 - t, y - 0.3 + t); }); });
          sides.forEach(([ax, v, sg, u0], si) => {
            const { n, st } = bays[si], q = v + sg * (OUT + 0.035);
            for (let li = 0; li < lifts.length; li++) for (let k = li % 4; k < n; k += 4) { const ua = u0 + k * st, ub = ua + st, ya = li ? lifts[li - 1] : yB + 0.1, yb = lifts[li], fl2 = li % 2 === 0; const a = fl2 ? ua : ub, b = fl2 ? ub : ua; if (ax) scafP.seg(a, ya, q, b, yb, q, 0.045); else scafP.seg(q, ya, a, q, yb, b, 0.045); }
          });
          // 계단탑: 뒤쪽 변 한쪽 끝 밖에 붙인다 (층마다 지그재그 계단 + 참)
          { const sx0 = p2.x1 + OUT - 3.9, sx1 = p2.x1 + OUT - 0.3, zA = p2.z0 - OUT - 1.25, zB = p2.z0 - OUT - 0.1;
            [sx0, sx1].forEach(x => scafP.box(x - t, x + t, yB + 0.1, H, zA - t, zA + t));
            lifts.forEach((y, li) => { const y0 = li ? lifts[li - 1] : yB + 0.15, up = li % 2 === 0, a = up ? sx0 + 0.5 : sx1 - 0.5, b = up ? sx1 - 0.5 : sx0 + 0.5; scafPl.seg(a, y0 + 0.05, (zA + zB) / 2, b, y + 0.05, (zA + zB) / 2, 0.06, 0.75); scafPl.box(up ? sx1 - 0.6 : sx0, up ? sx1 : sx0 + 0.6, y + 0.03, y + 0.075, zA, zB); scafP.seg(a, y0 + 1.0, zA, b, y + 1.0, zA, 0.04); });
          }
          // 분진망: 단마다 네 면 (맨 위 단은 난간 위까지)
          const o = OUT, a = p2.x0 - o, b = p2.x1 + o, c = p2.z0 - o, d = S.cutNow ? 0 : p2.z1 + o, nT = H + (sti === 0 ? 0.1 : 0);
          const m2 = 0.12; meshNet.box(a - m2, b + m2, yB, nT, c - m2 - 0.02, c - m2); if (!S.cutNow) meshNet.box(a - m2, b + m2, yB, nT, d + m2, d + m2 + 0.02); meshNet.box(a - m2 - 0.02, a - m2, yB, nT, c - m2, d + m2); meshNet.box(b + m2, b + m2 + 0.02, yB, nT, c - m2, d + m2);
        });
      }
      if (wpId === 'skin') { const i = Math.min(nS, nF - 1), f2 = sc.floors[Math.max(0, SK === 'wet' ? nF - 1 - nS : i)]; lab('skin', (p0.x0 + p0.x1) / 2, (f2 ? f2.e1 : top) + 4, p0.z1 + 2); }
    }

    // ---------- 지붕 ----------
    if (R.roofL.visible && R.roofL.material.map) R.roofL.material.map.repeat.set(Math.max(1, R.roofL.scale.x / (RF === 'metal' ? 0.6 : 1.0)), Math.max(1, R.roofL.scale.z / 6));
    if (wpId === 'roof' && S.done && S.rp > 0 && S.rp < 1) {
      const rf = S.rfp, x = rf.x0 + 0.2 + (rf.x1 - rf.x0 - 0.4) * clamp(S.rp * 1.1, 0, 1), y = S.rtop + 0.4;
      if (RF === 'asphalt' || RF === 'hybrid') { roofX.seg(x + 0.5, y + 0.2, rf.z0 + 1, x + 0.5, y + 0.2, rf.z0 + 2.2, 0.45); torch.put(x + 0.1, y + 0.1, rf.z0 + 3, 0.25, 0.6, 0.25, 0, 0, -Math.PI / 2 - 0.4); for (let k = 0; k < 3; k++) roofX.seg(rf.x1 - 2, y + 0.25 + k * 0.48, rf.z1 - 2.5, rf.x1 - 2, y + 0.25 + k * 0.48, rf.z1 - 1.3, 0.45); }
      lab('roof', (rf.x0 + rf.x1) / 2, S.rtop + 4, rf.z0);
    }

    pools.forEach(Pp => { Pp.im.count = Math.min(Pp.n, Pp.im.instanceMatrix.count); Pp.im.instanceMatrix.needsUpdate = true; if (Pp.im.instanceColor) Pp.im.instanceColor.needsUpdate = true; });
    tagsNow.forEach((p, g) => { if (g.visible) io.tags.push({ t: g.userData.eq, p, cls: 'eq' }); });
    if (typeof window !== 'undefined' && window.__S3DEBUG) window.__s3eq = [...tagsNow].filter(([g]) => g.visible).map(([g, p]) => ({ n: g.userData.eq, p: p.map(v => +v.toFixed(1)) }));
    return dyn;
  }

  return {
    frame,
    dispose() { own.tex.forEach(t => t.dispose()); own.geos.forEach(g => g.dispose()); own.mats.forEach(m => { const i = clipList.indexOf(m); if (i >= 0) clipList.splice(i, 1); m.dispose(); }); wtable.geometry.dispose(); },
  };
}
