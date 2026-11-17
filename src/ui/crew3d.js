// 3D 작업자·보행자: 관절이 있는 사람 모형을 인스턴스로 한꺼번에 그린다.
// 몸: 엉덩이 · 허벅지 · 정강이 · 안전화 · 상체(형광 조끼, 반사띠) · 위팔 · 아래팔 · 목장갑 · 머리 · 안전모. 손에 든 도구·자재는 따로.
// 동작마다 관절 각도를 시간에 따라 바꾼다: 걷기 · 어깨에 메고 나르기 · 앞에 들고 나르기 · 철근 결속 · 망치질 · 진동 다짐 · 고르기 · 삽질 ·
// 흙손 마감 · 용접(불꽃) · 볼트 조임 · 천장 드릴 · 롤러 도장 · 패널 세우기 · 인양물 유도 · 신호 · 측량 · 점검 · 호스 잡기 · 뿜칠.
// crewPlan(): 작업 유형마다 동작을 나눠 맡기고, 작업 자리를 옮겨 다니거나(걸어서) 자재를 날라 오는 하루 일과를 시간 T의 함수로 만든다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hsh = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

// 치수 (m)
const HIP = 0.93, THIGH = 0.44, SHIN = 0.45, UARM = 0.3, FARM = 0.27, SH_X = 0.205, SH_Y = 0.5, HIP_X = 0.095;

// 옷·장비 색
const VESTS = [0xff7a1a, 0xc9f22e, 0xff7a1a, 0xffa31a, 0xc9f22e];
const SHIRTS = [0x2c3a55, 0x55606e, 0x3d4f6b, 0x6b6f75, 0x24324a];
const PANTS = [0x2a3346, 0x5d5848, 0x3a3f47, 0x2a3346, 0x4a4f58];
export const HATS = { work: 0xffd23a, boss: 0xf4f4f0, elec: 0x2f7fd0, sig: 0xe5484d, safe: 0x3fae6a };
export { VESTS, SHIRTS, PANTS, SKIN };
const SKIN = [0xc89a78, 0xb98a68, 0xd3a888, 0xa87a5a];
const CLOTH = [0x3f5f8f, 0x8a8f99, 0xa33a3a, 0x2b2d33, 0xd9d4c8, 0x6b7a5a, 0x7a5a8f];
const HAIR = [0x1d1b1a, 0x2b2522, 0x3a2f28, 0x15151a];

// 반사띠가 있는 조끼 (흰 바탕 = 인스턴스 색이 곱해진다)
function vestTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 22, 64, 6); g.fillRect(0, 38, 64, 6);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 58, 64, 6); // 허리 (셔츠)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- 동작 (관절 각도) ----------
// o: { hip 엉덩이 높이, tp 상체 숙임(+앞), ty 상체 비틀기, hp 머리 숙임(+아래), L/R 팔 [어깨 앞으로 들기, 벌리기, 팔꿈치 굽힘], lL/rL 다리 [엉덩관절 앞으로, 무릎 굽힘] }
function base() { return { hip: HIP, tp: 0.02, ty: 0, hp: 0, L: [0.05, 0.06, 0.15], R: [0.05, 0.06, 0.15], lL: [0, 0.04], rL: [0, 0.04], tool: null, sw: 0 }; }
function gait(o, ph, amp = 1) {
  const s = Math.sin(ph), c = Math.cos(ph);
  o.lL = [0.42 * s * amp, 0.08 + 0.85 * Math.max(0, c) ** 1.4 * amp];
  o.rL = [-0.42 * s * amp, 0.08 + 0.85 * Math.max(0, -c) ** 1.4 * amp];
  o.hip = HIP - 0.03 * Math.abs(s) * amp;
  o.L = [-0.38 * s * amp + 0.05, 0.08, 0.25]; o.R = [0.38 * s * amp + 0.05, 0.08, 0.25];
}
function crouch(o, h) { const a = Math.acos(clamp((h - 0.06) / (THIGH + SHIN), 0, 1)); o.lL = [a, 2 * a]; o.rL = [a * 0.9, 1.9 * a]; o.hip = h; }
function kneel(o) { o.lL = [1.45, 1.5]; o.rL = [0.12, 1.6]; o.hip = 0.52; }
const sq = (t, f) => 0.5 + 0.5 * Math.sin(t * f);
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
// o ← o2(앞 동작)와 o(지금 동작) 사이, k: 0 = 앞 동작, 1 = 지금 동작
function blendPose(o, o2, k) {
  const e = ease(k), L = (a, b) => b + (a - b) * e;
  ['hip', 'tp', 'ty', 'hp', 'sw'].forEach(n => { o[n] = L(o[n], o2[n]); });
  ['L', 'R', 'lL', 'rL'].forEach(n => { o[n] = o[n].map((v, i) => L(v, o2[n][i])); });
  if (e < 0.5) o.tool = o2.tool;
}

const ACT = {
  stand(o, t) { const w = Math.sin(t * 0.23); o.ty = 0.12 * Math.sin(t * 0.3); o.tp = 0.02 + 0.012 * Math.sin(t * 1.3); o.lL = [0.04 * w, 0.05 + 0.04 * Math.max(0, -w)]; o.rL = [-0.04 * w, 0.05 + 0.04 * Math.max(0, w)]; o.L = [0.06, 0.08, 0.2]; o.R = [0.06, 0.08, 0.2]; },
  walk(o, t, ph) { gait(o, ph); o.ty = 0.07 * Math.sin(ph); o.tp = 0.05; o.hp = -0.04 + 0.02 * Math.cos(2 * ph); },
  // 숨 돌리기: 허리를 펴고 손을 허리에 얹은 채 둘러본다 (일하다 잠깐씩)
  breathe(o, t) { o.tp = -0.07; o.hp = -0.12 + 0.06 * Math.sin(t * 0.7); o.ty = 0.32 * Math.sin(t * 0.45); o.L = [0.28, 0.62, 1.75]; o.R = [0.28, 0.62, 1.75]; o.lL = [0.05, 0.06]; o.rL = [-0.04, 0.05]; },
  carry_sh(o, t, ph) { gait(o, ph, 0.85); o.R = [1.05, 0.12, 2.35]; o.L[0] *= 0.6; o.tool = 'bar'; },
  carry_fr(o, t, ph) { gait(o, ph, 0.7); o.L = [0.95, 0.05, 0.75]; o.R = [0.95, 0.05, 0.75]; o.tp = 0.06; o.tool = 'box'; },
  carry_pn(o, t, ph) { gait(o, ph, 0.7); o.L = [0.5, 0.25, 0.9]; o.R = [0.5, 0.25, 0.9]; o.tool = 'panel'; },
  pick(o, t) { crouch(o, 0.62); o.tp = 0.85; o.hp = -0.4; o.L = [1.55, 0.1, 0.2]; o.R = [1.5, 0.1, 0.25]; },
  tie(o, t) { crouch(o, 0.6); o.tp = 0.95; o.hp = -0.45; const w = Math.sin(t * 9); o.L = [1.3, 0.12, 0.35]; o.R = [1.25 + 0.06 * w, 0.05, 0.45 + 0.25 * w]; o.tool = 'pliers'; },
  hammer(o, t) { o.tp = 0.32; o.hp = 0.1; const k = sq(t, 7); o.L = [1.15, 0.05, 0.55]; o.R = [0.95 + 1.05 * k, 0.02, 1.0 - 0.4 * k]; o.lL = [0.18, 0.12]; o.rL = [-0.1, 0.06]; o.tool = 'hammer'; },
  nail_low(o, t) { crouch(o, 0.6); o.tp = 0.75; o.hp = -0.3; const k = sq(t, 7); o.L = [1.35, 0.05, 0.3]; o.R = [1.05 + 0.8 * k, 0.02, 0.95 - 0.35 * k]; o.tool = 'hammer'; },
  vibrate(o, t) { const b = Math.sin(t * 1.1); o.tp = 0.22 + 0.06 * b; o.L = [0.75 + 0.12 * b, 0.05, 1.0]; o.R = [0.65 + 0.12 * b, 0.05, 1.1]; o.lL = [0.15, 0.15]; o.rL = [-0.12, 0.08]; o.tool = 'vib'; o.sw = b; },
  rake(o, t) { const k = Math.sin(t * 2.4); o.tp = 0.42 + 0.1 * k; o.hp = -0.2; o.L = [0.95 + 0.35 * k, 0.05, 0.35]; o.R = [0.7 + 0.35 * k, 0.05, 0.4]; o.lL = [0.32, 0.25]; o.rL = [-0.22, 0.12]; o.tool = 'rake'; o.sw = k; },
  shovel(o, t) { const k = Math.sin(t * 1.8); o.tp = 0.55 + 0.2 * k; o.hp = -0.3; o.L = [1.0 + 0.3 * k, 0.05, 0.5]; o.R = [0.7 + 0.3 * k, 0.05, 0.6]; o.lL = [0.35 + 0.1 * k, 0.4]; o.rL = [-0.2, 0.25]; o.hip = HIP - 0.08; o.tool = 'shovel'; o.sw = k; },
  trowel(o, t) { kneel(o); o.tp = 0.55; o.hp = -0.4; const k = Math.sin(t * 2.2); o.L = [1.05, 0.25, 0.5]; o.R = [1.35, 0.15 + 0.45 * k, 0.25]; o.ty = 0.15 * k; o.tool = 'trowel'; o.sw = k; },
  trowel_w(o, t) { const k = Math.sin(t * 2.2); o.tp = 0.04; o.L = [0.4, 0.1, 1.2]; o.R = [1.45 + 0.35 * k, 0.1 + 0.25 * Math.cos(t * 2.2), 0.35]; o.tool = 'trowel_w'; },
  weld(o, t) { crouch(o, 0.58); o.tp = 0.7; o.hp = -0.2; o.L = [1.35, 0.15, 0.9]; o.R = [1.45, 0.05, 0.75]; o.tool = 'torch'; },
  bolt(o, t) { const j = 0.03 * Math.sin(t * 45); o.tp = -0.05; o.hp = -0.55; o.L = [1.95 + j, 0.05, 0.85]; o.R = [2.05 + j, 0.02, 0.75]; o.tool = 'wrench'; },
  drill_up(o, t) { const j = 0.025 * Math.sin(t * 50); o.tp = -0.06; o.hp = -0.7; o.L = [2.65 + j, 0.05, 0.35]; o.R = [2.75 + j, 0.02, 0.3]; o.lL = [0.12, 0.06]; o.rL = [-0.08, 0.04]; o.tool = 'drill_up'; },
  drill_w(o, t) { const j = 0.025 * Math.sin(t * 50); o.tp = 0.05; o.L = [1.4 + j, 0.1, 0.7]; o.R = [1.45 + j, 0.05, 0.55]; o.tool = 'drill_w'; },
  roller(o, t) { const k = sq(t, 2.1); o.tp = 0.04; o.hp = -0.3 * k; o.L = [0.9 + 0.5 * k, 0.05, 0.9]; o.R = [1.1 + 1.2 * k, 0.02, 0.55 - 0.3 * k]; o.tool = 'roller'; o.sw = k; },
  panel(o, t) { o.tp = 0.05; o.L = [1.35, 0.2, 0.55]; o.R = [1.35, 0.2, 0.55]; o.lL = [0.1, 0.08]; o.rL = [-0.08, 0.06]; o.tool = 'panel_up'; },
  guide(o, t) { const k = Math.sin(t * 0.7); o.tp = -0.02; o.hp = -0.6; o.L = [1.35 + 0.15 * k, 0.1, 0.25]; o.R = [1.1 + 0.15 * k, 0.1, 0.3]; o.ty = 0.2 * k; o.tool = 'rope'; },
  signal(o, t) { const k = Math.sin(t * 3); o.hp = -0.15; o.R = [2.9, 0.1, 0.1]; o.L = [1.3 + 0.5 * k, 0.9 + 0.3 * k, 0.2]; o.tool = 'baton'; },
  survey(o, t) { o.tp = 0.28; o.hp = 0.25; o.L = [1.25, 0.15, 1.35]; o.R = [0.3, 0.1, 0.5]; o.tool = 'tripod'; },
  inspect(o, t) { o.tp = 0.08; o.hp = 0.3 + 0.25 * Math.sin(t * 0.45); o.ty = 0.3 * Math.sin(t * 0.3); o.L = [1.0, 0.05, 1.45]; o.R = [0.95, -0.05, 1.6]; o.tool = 'board'; },
  hose(o, t) { const k = Math.sin(t * 0.6); o.tp = 0.28; o.hp = -0.35; o.L = [0.85 + 0.1 * k, 0.05, 0.55]; o.R = [0.7 + 0.1 * k, 0.05, 0.65]; o.lL = [0.25, 0.2]; o.rL = [-0.15, 0.1]; o.tool = 'hose'; o.sw = k; },
  spray(o, t) { const k = Math.sin(t * 1.5); o.tp = 0.1; o.L = [1.05, 0.1, 0.6]; o.R = [1.1, 0.02, 0.45]; o.ty = 0.35 * k; o.tool = 'nozzle'; },
  // 사람끼리: 말하기(손짓) · 듣기(고개 끄덕임) · 팔짱 · 가리키기 · 통화 · 걸으며 통화
  talk(o, t) { const a = Math.sin(t * 2.1), b = Math.sin(t * 3.3 + 1); o.ty = 0.12 * Math.sin(t * 0.8); o.hp = 0.04 * Math.sin(t * 2.7); o.R = [0.55 + 0.25 * a, 0.18, 1.25 + 0.35 * b]; o.L = [0.25 + 0.12 * Math.max(0, -a), 0.12, 0.5 + 0.3 * Math.max(0, b)]; },
  listen(o, t) { o.hp = 0.1 + 0.07 * Math.max(0, Math.sin(t * 1.3)); o.ty = 0.05 * Math.sin(t * 0.4); o.L = [0.32, 0.02, 0.95]; o.R = [0.32, 0.02, 0.95]; },
  arms(o, t) { o.tp = -0.03; o.hp = 0.04 * Math.sin(t * 0.6); o.L = [0.62, -0.05, 1.75]; o.R = [0.55, -0.05, 1.8]; o.lL = [0.06, 0.04]; o.rL = [-0.06, 0.04]; },
  point(o, t) { const k = Math.sin(t * 0.9); o.ty = 0.25 + 0.1 * k; o.R = [1.45 + 0.1 * k, 0.25, 0.08]; o.L = [0.85, 0.05, 1.3]; o.tool = 'board'; },
  phone(o, t) { o.hp = 0.12 + 0.05 * Math.sin(t * 0.7); o.ty = 0.15 * Math.sin(t * 0.35); o.R = [0.42, 0.42, 2.45]; o.L = [0.2, 0.08, 0.5 + 0.2 * Math.sin(t * 1.7)]; o.tool = 'phone'; },
  phone_w(o, t, ph) { gait(o, ph, 0.6); o.R = [0.42, 0.42, 2.45]; o.hp = 0.1; o.tool = 'phone'; },
  // TBM: 체조(팔 올리기 → 옆으로 벌리기 → 허리 돌리기 → 무릎 굽히기, 2초씩) · 안전 구호(주먹 들기)
  stretch(o, t) {
    const st = Math.floor(t / 2) % 4, k = 0.5 - 0.5 * Math.cos((t % 2) / 2 * Math.PI * 2);
    if (st === 0) { o.L = [0.2 + 2.7 * k, 0.15, 0.1]; o.R = [0.2 + 2.7 * k, 0.15, 0.1]; o.hp = -0.25 * k; }
    else if (st === 1) { o.L = [0.15, 0.2 + 1.35 * k, 0.05]; o.R = [0.15, 0.2 + 1.35 * k, 0.05]; }
    else if (st === 2) { o.L = [0.2, 1.4, 0.1]; o.R = [0.2, 1.4, 0.1]; o.ty = 0.7 * Math.sin((t % 2) / 2 * Math.PI * 2); }
    else { crouch(o, HIP - 0.3 * k); o.L = [0.2 + 1.3 * k, 0.05, 0.1]; o.R = [0.2 + 1.3 * k, 0.05, 0.1]; o.tp = 0.15 * k; }
  },
  cheer(o, t) { const k = Math.max(0, Math.sin(t * 5.2)); o.hp = -0.15; o.R = [2.55 + 0.35 * k, 0.12, 0.35 + 0.35 * (1 - k)]; o.L = [0.15, 0.08, 0.3]; },
  // 쉬기: 의자에 앉기 · 앉아서 물 마시기 · 앉아서 쉬기(고개 숙이고 팔을 무릎에)
  sit(o, t) { o.hip = 0.47; o.lL = [1.5, 1.5]; o.rL = [1.45, 1.42]; o.tp = 0.08; o.hp = 0.05 * Math.sin(t * 0.5); o.L = [0.75, 0.12, 0.85]; o.R = [0.75, 0.12, 0.85]; },
  drink(o, t) { const k = Math.max(0, Math.sin(t * 0.6)); o.hip = 0.47; o.lL = [1.5, 1.5]; o.rL = [1.45, 1.42]; o.tp = 0.05; o.hp = -0.35 * k; o.L = [0.7, 0.12, 0.9]; o.R = [0.6 + 0.65 * k, 0.15, 1.2 + 0.9 * k]; o.tool = 'cup'; },
  rest(o, t) { o.hip = 0.47; o.lL = [1.45, 1.55]; o.rL = [1.4, 1.5]; o.tp = 0.45; o.hp = 0.35 + 0.05 * Math.sin(t * 0.3); o.L = [0.9, 0.2, 1.1]; o.R = [0.9, 0.2, 1.1]; },
};
export const ACTS = Object.keys(ACT);

// ---------- 그리기 ----------
// X: { root, inst } (build3d의 인스턴스 생성기), cap: 최대 인원
export function buildPeople(X, cap = 140) {
  const { root } = X;
  const own = { geos: [], mats: [], tex: [] };
  const G = (g) => { own.geos.push(g); return g; };
  const M = (o) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o }); own.mats.push(m); return m; };
  const limb = G(new THREE.CylinderGeometry(0.5, 0.42, 1, 7).translate(0, -0.5, 0));
  const blk = G(new THREE.BoxGeometry(1, 1, 1));
  const torsoG = G(new THREE.CylinderGeometry(0.5, 0.42, 1, 9).translate(0, 0.5, 0));
  const headG = G(new THREE.SphereGeometry(0.5, 12, 9));
  const hatG = G((() => { const a = new THREE.SphereGeometry(0.5, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); const b = new THREE.CylinderGeometry(0.62, 0.64, 0.05, 16).translate(0, 0.02, 0.06); const r = new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6).rotateZ(Math.PI / 2).scale(1, 1, 7).translate(0, 0.46, 0); const m = mergeGeometries([a, b, r].map(g => g.index ? g.toNonIndexed() : g)); [a, b, r].forEach(g => g.dispose()); return m; })());
  const sparkG = G(new THREE.OctahedronGeometry(0.5, 0));
  const vt = vestTex(); own.tex.push(vt);
  const mk = (g, m, n) => { const o = new THREE.InstancedMesh(g, m, n); o.count = 0; o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; o.userData.noMirror = true; root.add(o); return o; };
  const W = { pants: mk(limb, M({ color: 0xffffff }), cap * 4), hips: mk(torsoG, M({ color: 0xffffff }), cap), cap2: mk(headG, M({ color: 0xffffff, map: vt }), cap * 2), belt: mk(torsoG, M({ color: 0x3a2e24, roughness: 0.6 }), cap), boot: mk(blk, M({ color: 0x2e2620, roughness: 0.7 }), cap * 2), torso: mk(torsoG, M({ color: 0xffffff, map: vt }), cap), arm: mk(limb, M({ color: 0xffffff }), cap * 4), hand: mk(blk, M({ color: 0xffffff }), cap * 2), head: mk(headG, M({ color: 0xffffff, roughness: 0.7 }), cap), hat: mk(hatG, M({ color: 0xffffff, roughness: 0.35, metalness: 0.05 }), cap), tool: mk(blk, M({ color: 0xffffff, roughness: 0.6, metalness: 0.2 }), cap * 4) };
  const spark = mk(sparkG, M({ color: 0xffd38a, emissive: 0xffb547, emissiveIntensity: 2.2 }), 90); spark.castShadow = false;
  const all = [...Object.values(W), spark];
  const C = new THREE.Color();
  // 색 버퍼를 미리 (첫 렌더 전에 instanceColor가 있어야 셰이더가 맞다)
  Object.values(W).forEach(im => { if (im === W.boot || im === W.belt) return; for (let i = 0; i < im.instanceMatrix.count; i++) im.setColorAt(i, C.set(0xffffff)); });
  const n = {}; const reset = () => { Object.keys(W).forEach(k => { n[k] = 0; }); n.spark = 0; };
  reset();
  // 행렬 도구
  const mR = new THREE.Matrix4(), mT = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mS = new THREE.Matrix4(), tmp = new THREE.Matrix4(), tmp2 = new THREE.Matrix4();
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0), D = new THREE.Vector3();
  const rot = (m, x, y, z, order = 'XYZ') => m.makeRotationFromEuler(E.set(x, y, z, order));
  // 부모 행렬 p에서 (ox,oy,oz)로 옮기고 (rx,ry,rz) 돌린 관절 행렬을 out에
  const joint = (out, p, ox, oy, oz, rx = 0, ry = 0, rz = 0, order = 'XYZ') => { mT.makeTranslation(ox, oy, oz); rot(mR, rx, ry, rz, order); return out.multiplyMatrices(p, mT).multiply(mR); };
  const put = (im, k, m, sx, sy, sz, col) => { const i = n[k]; if (i >= im.instanceMatrix.count) return -1; mS.makeScale(sx, sy, sz); tmp.multiplyMatrices(m, mS); im.setMatrixAt(i, tmp); if (col != null && im.instanceColor) im.setColorAt(i, C.set(col)); n[k] = i + 1; return i; };
  // 두 점 사이 막대 (도구)
  const seg = (a, b, w, d, col) => { const i = n.tool; if (i >= W.tool.instanceMatrix.count) return; D.subVectors(b, a); const L = D.length(); if (L < 1e-4) return; D.multiplyScalar(1 / L); Q.setFromUnitVectors(UP, D); V.addVectors(a, b).multiplyScalar(0.5); S.set(w, L, d); tmp.compose(V, Q, S); W.tool.setMatrixAt(i, tmp); W.tool.setColorAt(i, C.set(col)); n.tool = i + 1; };
  const obox = (m, x, y, z, sx, sy, sz, col) => { mT.makeTranslation(x, y, z); tmp2.multiplyMatrices(m, mT); put(W.tool, 'tool', tmp2, sx, sy, sz, col); };
  // 수평으로 놓인 상자 (도구·자재): 중심 (x,y,z), 방향 yaw, 크기
  const hbox = (x, y, z, yaw, sx, sy, sz, col) => { tmp2.makeRotationY(yaw).setPosition(x, y, z); put(W.tool, 'tool', tmp2, sx, sy, sz, col); };
  const torsoM = new THREE.Matrix4(), rootM = new THREE.Matrix4(), shL = new THREE.Matrix4(), shR = new THREE.Matrix4(), elL = new THREE.Matrix4(), elR = new THREE.Matrix4(), hdM = new THREE.Matrix4(), hl = new THREE.Matrix4(), kn = new THREE.Matrix4();
  const hand = (out, el) => out.setFromMatrixPosition(tmp.multiplyMatrices(el, mT.makeTranslation(0, -FARM - 0.04, 0)));
  const HL = new THREE.Vector3(), HR = new THREE.Vector3(), F = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();

  // 한 사람: x, y(발 높이), z, yaw(앞이 +z), act, t(동작 시각), ph(걸음 위상), lk(옷 색 등)
  // 시저 리프트: 바닥 y에서 발판 높이 L까지 (앞이 +z인 로컬 좌표를 yaw로 돌려 놓는다)
  const LC = 0x2f6fb5, LR = 0xf2b51c, P1 = new THREE.Vector3(), P2 = new THREE.Vector3();
  const lp = (out, x, y, z, yaw, lx, ly, lz) => out.set(x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y + ly, z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
  function scissor(x, y, z, yaw, L) {
    hbox(x, y + 0.28, z, yaw, 0.82, 0.34, 1.85, LC);
    [-0.6, 0.6].forEach(lz => [-0.42, 0.42].forEach(lx => { lp(P1, x, y, z, yaw, lx, 0.15, lz); hbox(P1.x, P1.y, P1.z, yaw, 0.1, 0.3, 0.3, 0x222222); }));
    const y0 = 0.46, y1 = L - 0.12, nL = Math.max(1, Math.round((y1 - y0) / 0.75)), dh = (y1 - y0) / nL;
    [-0.33, 0.33].forEach(lx => { for (let i = 0; i < nL; i++) { seg(lp(P1, x, y, z, yaw, lx, y0 + i * dh, -0.72), lp(P2, x, y, z, yaw, lx, y0 + (i + 1) * dh, 0.72), 0.05, 0.07, LR); seg(lp(P1, x, y, z, yaw, lx, y0 + i * dh, 0.72), lp(P2, x, y, z, yaw, lx, y0 + (i + 1) * dh, -0.72), 0.05, 0.07, LR); } });
    hbox(x, y + L - 0.06, z, yaw, 0.86, 0.12, 1.95, LC);
    [[-0.4, -0.9], [0.4, -0.9], [0.4, 0.9], [-0.4, 0.9]].forEach(([lx, lz], k, arr) => { const [mx, mz] = arr[(k + 1) % 4]; seg(lp(P1, x, y, z, yaw, lx, L, lz), lp(P2, x, y, z, yaw, lx, L + 1.05, lz), 0.035, 0.035, LR); seg(lp(P1, x, y, z, yaw, lx, L + 1.05, lz), lp(P2, x, y, z, yaw, mx, L + 1.05, mz), 0.035, 0.035, LR); });
  }
  function add(x, y, z, yaw, act, t, ph, lk = {}) {
    if (n.torso >= cap) return;
    // 리프트를 탄 사람: 옮길 때는 낮춰 몰고, 자리에서는 올려 천장 작업
    if (lk.lift > 0.3 && (act === 'drill_up' || act === 'walk')) { const L = act === 'walk' ? 0.62 : lk.lift; scissor(x, y, z, yaw, L); y += L; if (act === 'walk') act = 'stand'; }
    const o = base(); (ACT[act] || ACT.stand)(o, t, ph || 0);
    // 동작 바꿈: 앞 동작에서 지금 동작으로 관절을 부드럽게 옮긴다 (lk.prev, lk.bl 0→1)
    if (lk.prev && lk.prev !== act && lk.bl != null && lk.bl < 1) { const o2 = base(); (ACT[lk.prev] || ACT.stand)(o2, t, lk.pph || 0); blendPose(o, o2, lk.bl); }
    rootM.makeRotationY(yaw).setPosition(x, y, z);
    F.set(Math.sin(yaw), 0, Math.cos(yaw));
    const ped = !!lk.ped;
    const pants = lk.pants ?? (ped ? 0x2b2d33 : 0x2a3346), shirt = lk.shirt ?? (ped ? lk.cloth : 0x2c3a55), vest = ped ? lk.cloth : (lk.vest ?? 0xff7a1a);
    // 엉덩이 · 다리
    joint(hl, rootM, 0, o.hip, 0);
    joint(mA, hl, 0, -0.1, 0); put(W.hips, 'hips', mA, 0.34, 0.17, 0.23, pants);
    [[o.lL, HIP_X], [o.rL, -HIP_X]].forEach(([lg, sx]) => {
      joint(mA, hl, sx, 0, 0, -lg[0]); put(W.pants, 'pants', mA, 0.17, THIGH, 0.19, pants);
      joint(kn, mA, 0, -THIGH, 0, lg[1]); put(W.pants, 'pants', kn, 0.135, SHIN, 0.15, pants);
      joint(mB, kn, 0, -SHIN, 0.045, lg[1] - lg[0] > 1.2 ? 0 : -(lg[1] - lg[0])); put(W.boot, 'boot', mB, 0.13, 0.11, 0.28);
    });
    // 상체 · 머리
    joint(torsoM, hl, 0, 0.04, 0, o.tp, o.ty, 0, 'YXZ');
    put(W.torso, 'torso', torsoM, 0.4, 0.56, 0.25, vest);
    if (!ped) { joint(mA, torsoM, 0, 0.0, 0); put(W.belt, 'belt', mA, 0.41, 0.07, 0.26); } // 공구 벨트
    joint(mA, torsoM, SH_X - 0.02, SH_Y - 0.01, 0); put(W.cap2, 'cap2', mA, 0.15, 0.13, 0.17, ped ? shirt : vest); // 둥근 어깨
    joint(mA, torsoM, -SH_X + 0.02, SH_Y - 0.01, 0); put(W.cap2, 'cap2', mA, 0.15, 0.13, 0.17, ped ? shirt : vest);
    joint(hdM, torsoM, 0, 0.6, 0.01, o.hp); joint(mA, hdM, 0, 0.12, 0);
    put(W.head, 'head', mA, 0.2, 0.235, 0.215, lk.skin ?? 0xc89a78);
    if (lk.hat !== false) { joint(mB, hdM, 0, 0.165, 0.005); put(W.hat, 'hat', mB, ped ? 0.215 : 0.27, ped ? 0.14 : 0.21, ped ? 0.215 : 0.29, lk.hat ?? HATS.work); }
    // 팔 (어깨 → 팔꿈치 → 손)
    joint(shL, torsoM, SH_X, SH_Y, 0, -o.L[0], 0, o.L[1]); put(W.arm, 'arm', shL, 0.115, UARM, 0.12, shirt);
    joint(elL, shL, 0, -UARM, 0, -o.L[2]); put(W.arm, 'arm', elL, 0.1, FARM, 0.105, shirt);
    joint(shR, torsoM, -SH_X, SH_Y, 0, -o.R[0], 0, -o.R[1]); put(W.arm, 'arm', shR, 0.115, UARM, 0.12, shirt);
    joint(elR, shR, 0, -UARM, 0, -o.R[2]); put(W.arm, 'arm', elR, 0.1, FARM, 0.105, shirt);
    joint(mA, elL, 0, -FARM - 0.05, 0); put(W.hand, 'hand', mA, 0.085, 0.11, 0.095, ped ? (lk.skin ?? 0xc89a78) : 0xd9d6cc);
    joint(mA, elR, 0, -FARM - 0.05, 0); put(W.hand, 'hand', mA, 0.085, 0.11, 0.095, ped ? (lk.skin ?? 0xc89a78) : 0xd9d6cc);
    if (!o.tool) return;
    hand(HL, elL); hand(HR, elR);
    const fy = y + 0.02, c2 = (u) => B.copy(HL).add(HR).multiplyScalar(0.5).addScaledVector(F, u);
    switch (o.tool) {
      case 'bar': { joint(mA, torsoM, -0.16, 0.6, 0); A.setFromMatrixPosition(mA); const L = lk.len || 4.2; seg(V2.copy(A).addScaledVector(F, -L * 0.45), B.copy(A).addScaledVector(F, L * 0.55), lk.thick || 0.12, lk.thick || 0.1, lk.item ?? 0xa0522d); break; }
      case 'box': c2(0.12); hbox(B.x, B.y - 0.05, B.z, yaw, lk.w || 0.6, lk.h || 0.32, lk.d || 0.4, lk.item ?? 0xc58a4a); break;
      case 'panel': c2(0.05); hbox(B.x, B.y + 0.25, B.z, yaw + Math.PI / 2, lk.w || 1.8, lk.h || 0.9, 0.04, lk.item ?? 0xc9a36a); break;
      case 'panel_up': c2(0.12); hbox(B.x, B.y + 0.15, B.z, yaw, lk.w || 1.2, lk.h || 2.2, 0.05, lk.item ?? 0xe7e7ea); break;
      case 'pliers': obox(elR, 0, -FARM - 0.1, 0.03, 0.03, 0.12, 0.03, 0xd9822b); break;
      case 'hammer': obox(elR, 0, -FARM - 0.08, 0.1, 0.035, 0.035, 0.3, 0x6b4a2b); obox(elR, 0, -FARM - 0.08, 0.26, 0.05, 0.12, 0.05, 0x3a3a3f); break;
      case 'vib': { A.copy(HR).add(HL).multiplyScalar(0.5); seg(A, B.set(A.x, fy - 0.35, A.z).addScaledVector(F, 0.15), 0.05, 0.05, 0x2b2b2b); seg(V2.copy(A).addScaledVector(F, -0.2), A, 0.06, 0.06, 0xe7c34a); break; }
      case 'rake': case 'shovel': { A.copy(HR).add(HL).multiplyScalar(0.5); const tip = B.copy(A).addScaledVector(F, 1.0 + 0.25 * o.sw); tip.y = fy + 0.06; seg(V2.copy(A).addScaledVector(F, -0.25).setY(A.y + 0.12), tip, 0.04, 0.04, 0x8a6a45); hbox(tip.x, tip.y + 0.02, tip.z, yaw, o.tool === 'rake' ? 0.55 : 0.25, 0.06, o.tool === 'rake' ? 0.06 : 0.3, 0x5c5f66); break; }
      case 'trowel': hbox(HR.x, fy + 0.04, HR.z, yaw + 0.4 * o.sw, 0.14, 0.015, 0.32, 0xb8c2cc); break;
      case 'trowel_w': obox(elR, 0, -FARM - 0.1, 0.05, 0.3, 0.12, 0.015, 0xb8c2cc); break;
      case 'torch': { obox(elR, 0, -FARM - 0.12, 0.06, 0.04, 0.2, 0.04, 0x3a3a3f); A.copy(HR).addScaledVector(F, 0.25); A.y = Math.max(fy + 0.05, A.y - 0.15); for (let k = 0; k < 5 && n.spark < spark.instanceMatrix.count; k++) { const r = hsh(Math.floor(t * 20) + k * 7, k), s = 0.03 + 0.05 * hsh(Math.floor(t * 20) * 3 + k, 2); tmp.makeTranslation(A.x + (r - 0.5) * 0.5, A.y - hsh(k, Math.floor(t * 20)) * 0.4, A.z + (hsh(k * 3, Math.floor(t * 20)) - 0.5) * 0.5); mS.makeScale(s, s, s); tmp.multiply(mS); spark.setMatrixAt(n.spark++, tmp); } break; }
      case 'wrench': A.copy(HR).add(HL).multiplyScalar(0.5).addScaledVector(F, 0.1); hbox(A.x, A.y + 0.08, A.z, yaw, 0.12, 0.22, 0.26, 0x2f7fd0); break;
      case 'drill_up': { A.copy(HR).add(HL).multiplyScalar(0.5); seg(A, B.copy(A).setY(A.y + 0.32), 0.1, 0.22, 0xe5484d); seg(B.copy(A).setY(A.y + 0.32), V2.copy(A).setY(A.y + 0.55), 0.015, 0.015, 0x9aa3ad); break; }
      case 'drill_w': { A.copy(HR).add(HL).multiplyScalar(0.5); seg(A, B.copy(A).addScaledVector(F, 0.3), 0.1, 0.18, 0xe5484d); break; }
      case 'roller': { A.copy(HR); B.copy(A).addScaledVector(F, 0.45).setY(A.y + 0.9 + 0.5 * o.sw); seg(A, B, 0.03, 0.03, 0xd9d9de); hbox(B.x, B.y + 0.05, B.z, yaw, 0.26, 0.07, 0.07, 0xf2efe6); break; }
      case 'rope': { A.copy(HL); seg(A, B.copy(A).addScaledVector(F, 0.6).setY(A.y + 2.6), 0.018, 0.018, 0xe5d36a); break; }
      case 'baton': obox(elR, 0, -FARM - 0.22, 0.02, 0.04, 0.32, 0.04, 0xff5a1f); break;
      case 'tripod': { const P0 = B.set(x, y, z).addScaledVector(F, 0.55), top = A.set(P0.x, y + 1.35, P0.z); for (let k = 0; k < 3; k++) { const a = yaw + k * 2.094; seg(top, V2.set(P0.x + Math.sin(a) * 0.38, y, P0.z + Math.cos(a) * 0.38), 0.03, 0.03, 0xd9b44a); } hbox(top.x, top.y + 0.12, top.z, yaw, 0.16, 0.22, 0.18, 0xf2c94c); break; }
      case 'board': obox(elL, 0, -FARM - 0.08, 0.04, 0.24, 0.02, 0.32, 0x8a6a45); break;
      case 'hose': { A.copy(HR).add(HL).multiplyScalar(0.5); seg(V2.copy(A).addScaledVector(F, -0.6).setY(A.y + 0.5), A, 0.13, 0.13, 0x1c1c1e); seg(A, B.copy(A).addScaledVector(F, 0.5 + 0.15 * o.sw).setY(fy + 0.25), 0.12, 0.12, 0x1c1c1e); break; }
      case 'nozzle': { A.copy(HR); seg(A, B.copy(A).addScaledVector(F, 0.5), 0.04, 0.04, 0x9aa3ad); break; }
      case 'phone': obox(elR, 0, -FARM - 0.06, 0.03, 0.02, 0.15, 0.075, 0x1d1d22); break;
      case 'cup': obox(elR, 0, -FARM - 0.08, 0.05, 0.075, 0.12, 0.075, lk.cup ?? 0x7fb8e0); break;
      default: break;
    }
  }
  function begin() { reset(); }
  function end() {
    Object.entries(W).forEach(([k, im]) => { im.count = Math.min(n[k], im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    spark.count = n.spark; spark.instanceMatrix.needsUpdate = true;
  }
  return { add, begin, end, meshes: all, dispose() { all.forEach(o => { root.remove(o); o.dispose(); }); own.geos.forEach(g => g.dispose()); own.mats.forEach(m => m.dispose()); own.tex.forEach(t => t.dispose()); } };
}

// ---------- 작업조 계획 ----------
// 작업 유형(workstep.js classify) → 동작 나누기: [동작, 비율, 나르는 자재(있으면 자재 자리와 작업 자리를 오간다)]
const IT = { rebar: { item: 0x8a4b2a, len: 5.5, thick: 0.13 }, pipe: { item: 0x9aa3ad, len: 4, thick: 0.11 }, duct: { item: 0xc9ced4, len: 2.4, thick: 0.35 }, plank: { item: 0xc58a4a, len: 3.6, thick: 0.08 }, cable: { item: 0x2b2b2b, len: 3, thick: 0.08 },
  form: { item: 0xb79a6a, w: 0.6, h: 1.2 }, board: { item: 0xe7e7ea, w: 1.2, h: 2.4 }, glass: { item: 0x7fa6c2, w: 1.2, h: 2.2 }, box: { item: 0xc58a4a }, bag: { item: 0xe0d8c8, w: 0.45, h: 0.18, d: 0.7 }, module: { item: 0x5a6b8a } };
const MIX = {
  rebar: [['tie', 6], ['carry_sh', 2, 'rebar'], ['inspect', 1]],
  form: [['hammer', 3], ['nail_low', 2], ['carry_pn', 2, 'form'], ['inspect', 1]],
  pour: [['rake', 3], ['vibrate', 3], ['trowel', 2], ['inspect', 1]],
  cure: [['spray', 2], ['walk', 1], ['inspect', 1]],
  mixdesign: [['inspect', 2], ['pick', 1]],
  steel: [['bolt', 3], ['weld', 2], ['guide', 2], ['inspect', 1]],
  precast: [['guide', 3], ['bolt', 2], ['signal', 1], ['inspect', 1]],
  lift: [['guide', 3], ['signal', 2], ['inspect', 1]],
  hoist: [['carry_fr', 3, 'box'], ['walk', 1], ['signal', 1]],
  curtain: [['panel', 2], ['bolt', 2], ['guide', 2], ['inspect', 1]],
  glass: [['panel', 3], ['drill_w', 2], ['carry_pn', 1, 'glass']],
  seal: [['drill_w', 3], ['inspect', 1]],
  insul: [['spray', 2], ['panel', 2], ['carry_fr', 1, 'box']],
  waterproof: [['trowel', 3], ['roller', 1], ['carry_fr', 1, 'bag'], ['inspect', 1]],
  pv: [['carry_pn', 2, 'glass'], ['nail_low', 2], ['inspect', 1]],
  duct: [['drill_up', 3], ['carry_sh', 2, 'duct'], ['inspect', 1]],
  pipe: [['drill_up', 2], ['weld', 1], ['carry_sh', 2, 'pipe'], ['inspect', 1]],
  sprinkler: [['drill_up', 3], ['carry_sh', 1, 'pipe'], ['inspect', 1]],
  detect: [['drill_up', 2], ['inspect', 2]],
  cable: [['carry_sh', 2, 'cable'], ['drill_up', 2], ['pick', 1], ['inspect', 1]],
  ict: [['drill_up', 2], ['pick', 1], ['inspect', 1]],
  elev: [['drill_w', 2], ['bolt', 1], ['inspect', 1]],
  plant: [['carry_fr', 3, 'box'], ['bolt', 2], ['signal', 1]],
  wall: [['panel', 2], ['drill_w', 2], ['carry_pn', 2, 'board'], ['inspect', 1]],
  plaster: [['trowel_w', 4], ['carry_fr', 1, 'bag']],
  ceiling: [['drill_up', 4], ['carry_pn', 1, 'board'], ['inspect', 1]],
  floor: [['trowel', 3], ['rake', 2], ['carry_fr', 1, 'bag']],
  paint: [['roller', 4], ['trowel_w', 1], ['inspect', 1]],
  landscape: [['shovel', 3], ['carry_fr', 2, 'box'], ['rake', 1], ['inspect', 1]],
  temp: [['hammer', 2], ['carry_sh', 2, 'plank'], ['signal', 1]],
  commission: [['inspect', 4], ['walk', 1]], inspect: [['inspect', 3], ['walk', 1]], plan: [['inspect', 2], ['walk', 1]],
  drone: [['survey', 1], ['inspect', 2]], sensor: [['drill_w', 1], ['inspect', 2]], data: [['inspect', 2]],
  spt: [['signal', 1], ['pick', 1], ['inspect', 1]], cpt: [['inspect', 2]], geo: [['survey', 2], ['pick', 1]], lab: [['inspect', 2]], bore: [['signal', 1], ['pick', 1], ['inspect', 1]],
  drain: [['signal', 1], ['guide', 1], ['inspect', 1]], surcharge: [['signal', 2], ['inspect', 1]], compact: [['signal', 1], ['guide', 1], ['inspect', 1]], mix: [['signal', 1], ['inspect', 1], ['hose', 1]], loadtest: [['inspect', 2], ['survey', 1]],
  pile: [['signal', 1], ['guide', 2], ['weld', 1], ['inspect', 1]], bored: [['signal', 1], ['hose', 1], ['guide', 1], ['inspect', 1]], cage: [['guide', 3], ['signal', 1], ['weld', 1]], tremie: [['hose', 2], ['signal', 1], ['inspect', 1]],
  lagging: [['hammer', 2], ['carry_sh', 2, 'plank'], ['shovel', 1]], anchor: [['hose', 1], ['signal', 1], ['inspect', 1]], strut: [['bolt', 2], ['guide', 2], ['weld', 1], ['signal', 1]], slope: [['spray', 2], ['shovel', 1]],
  grout: [['hose', 2], ['inspect', 1]], dewater: [['hose', 1], ['inspect', 1]], blast: [['pick', 2], ['signal', 1], ['inspect', 1]], split: [['signal', 1], ['shovel', 1]],
  clam: [['signal', 2], ['shovel', 2]], haul: [['signal', 2], ['shovel', 1]], dig: [['shovel', 3], ['signal', 1], ['survey', 1]],
  generic: [['carry_fr', 2, 'box'], ['walk', 1], ['inspect', 1], ['hammer', 1]],
};
export const CREW_KINDS = Object.keys(MIX);
const STATIC_ACTS = new Set(['signal', 'survey', 'guide']);

// 걷기 한 구간: 0.5초 동안 속도를 올리고 마지막 0.5초에 줄인다 (발이 미끄러지지 않게 걸음 위상은 실제 간 거리로)
const ACC_T = 0.5;
const legTime = (L, v) => (L <= 0 ? 0 : L / v + ACC_T);
function legDist(t, T, L) {
  if (T <= 0 || L <= 0) return L;
  const v = L / (T - ACC_T), a = ACC_T;
  if (t <= 0) return 0; if (t >= T) return L;
  if (t < a) return v * t * t / (2 * a);
  if (t > T - a) { const r = T - t; return L - v * r * r / (2 * a); }
  return v * a / 2 + v * (t - a);
}
// 몸 돌리기: from → to 를 k(0→1)에 따라 짧은 쪽으로
function turnTo(from, to, k) { let d = to - from; d = Math.atan2(Math.sin(d), Math.cos(d)); return from + d * ease(clamp(k, 0, 1)); }

// 작업조 하나: kind, n명, 영역 a {x0,x1,z0,z1,y}, 시간 T, seed, o { stock: [x,z] 자재 자리, face: [x,z] 바라볼 곳, lk 색 덮어쓰기 }
// 돌려주는 것: [{ x, y, z, yaw, act, t, ph, lk }]
export function crewPlan(kind, n, a, T, seed = 0, o = {}) {
  const mix = MIX[kind] || MIX.generic, tot = mix.reduce((s, m) => s + m[1], 0), out = [];
  const W = a.x1 - a.x0, Dz = a.z1 - a.z0; if (!(W > 0.6 && Dz > 0.6) || n <= 0) return out;
  const m = Math.min(0.8, W * 0.1, Dz * 0.1), X = (f) => a.x0 + m + (W - 2 * m) * f, Zf = (f) => a.z0 + m + (Dz - 2 * m) * f;
  const stock = o.stock || [X(0.06), Zf(0.06)];
  for (let i = 0; i < n; i++) {
    // 비율대로 나눠 맡긴다 (앞 사람부터 순서대로)
    let r = ((i + 0.5) / n) * tot, mi = 0; while (mi < mix.length - 1 && r > mix[mi][1]) { r -= mix[mi][1]; mi++; }
    const [act, , itemK] = mix[mi], sd = seed * 31 + i * 7 + 3, lk = { vest: VESTS[(sd >> 1) % VESTS.length], shirt: SHIRTS[sd % SHIRTS.length], pants: PANTS[(sd >> 2) % PANTS.length], skin: SKIN[sd % SKIN.length], hat: act === 'inspect' ? HATS.boss : act === 'signal' ? HATS.sig : (kind === 'cable' || kind === 'detect' || kind === 'ict') ? HATS.elec : HATS.work, ...(o.lk || {}) };
    if (act === 'signal') lk.vest = 0xff5a1f;
    if (itemK) Object.assign(lk, IT[itemK] || {});
    if (act === 'drill_up' && o.lift > 0.3) lk.lift = o.lift; // 천장 작업: 시저 리프트 위에서
    const off = hsh(sd, 9) * 200, spd = 0.85 + 0.25 * hsh(sd, 4), tk = 0.88 + 0.24 * hsh(sd, 8); // tk: 사람마다 손놀림 빠르기
    if (itemK) {
      // 나르는 사람: 자재 자리 ↔ 작업 자리. 출발·도착에서 천천히, 돌아설 때는 몸을 돌리며, 집기·내려놓기와 걷기는 자세를 이어 바꾼다
      const B = [X(0.15 + 0.7 * hsh(sd, 1)), Zf(0.15 + 0.7 * hsh(sd, 2))], A = [clamp(stock[0] + (hsh(sd, 5) - 0.5) * 2.5, a.x0 + m, a.x1 - m), clamp(stock[1] + (hsh(sd, 6) - 0.5) * 2.5, a.z0 + m, a.z1 - m)];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]), tw = legTime(L, spd), P = 4 + tw + 3.5 + tw, u = (T + off) % P;
      const yAB = Math.atan2(B[0] - A[0], B[1] - A[1]), yBA = Math.atan2(A[0] - B[0], A[1] - B[1]), yPick = yAB + Math.PI * 0.5;
      let x, z, yaw, ac, ph = 0, prev = null, bl = 1, pph = 0;
      if (u < 4) { x = A[0]; z = A[1]; yaw = turnTo(yBA, yPick, u / 0.7); ac = 'pick'; prev = 'walk'; bl = u / 0.45; pph = L * 4.6; }
      else if (u < 4 + tw) { const d = legDist(u - 4, tw, L), f = L > 0 ? d / L : 1; x = A[0] + (B[0] - A[0]) * f; z = A[1] + (B[1] - A[1]) * f; yaw = turnTo(yPick, yAB, (u - 4) / 0.6); ac = act; ph = d * 4.6; prev = 'pick'; bl = (u - 4) / 0.45; }
      else if (u < 7.5 + tw) { x = B[0]; z = B[1]; yaw = yAB; ac = 'pick'; prev = act; bl = (u - 4 - tw) / 0.45; pph = L * 4.6; }
      else { const d = legDist(u - 7.5 - tw, tw, L), f = L > 0 ? d / L : 1; x = B[0] + (A[0] - B[0]) * f; z = B[1] + (A[1] - B[1]) * f; yaw = turnTo(yAB, yBA, (u - 7.5 - tw) / 0.8); ac = 'walk'; ph = d * 4.6; prev = 'pick'; bl = (u - 7.5 - tw) / 0.45; }
      out.push({ x, y: a.y, z, yaw, act: ac, t: (T + off) * tk, ph, lk: { ...lk, prev, bl, pph }, kind, sd });
      continue;
    }
    // 제자리 작업: 자리 셋을 돌며 일하고, 다음 자리로 걸어간다 (신호·측량·유도는 한자리)
    const spots = [0, 1, 2].map(k => [X(0.1 + 0.8 * hsh(sd, 11 + k)), Zf(0.1 + 0.8 * hsh(sd, 21 + k))]);
    if (STATIC_ACTS.has(act) || o.still) spots.length = 1;
    const dw = 14 + 10 * hsh(sd, 31), dists = spots.map((p, k) => { const q = spots[(k + 1) % spots.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); }), legs = dists.map(d => legTime(d, spd));
    const P = spots.length * dw + (spots.length > 1 ? legs.reduce((s, v) => s + v, 0) : 0), u = (T + off) % P;
    const faceAt = (k) => { const p = spots[k], f = o.face; return f ? Math.atan2(f[0] - p[0], f[1] - p[1]) : hsh(sd, 41 + k) * 6.283; };
    const legYaw = (k) => { const p = spots[k], q = spots[(k + 1) % spots.length]; return Math.atan2(q[0] - p[0], q[1] - p[1]); };
    // 일하는 동안 한두 번 허리를 펴고 숨을 돌린다 (사람마다 다른 때)
    const still = STATIC_ACTS.has(act), br0 = dw * (0.35 + 0.3 * hsh(sd, 51)), brL = 2.2 + 1.6 * hsh(sd, 52);
    let acc = 0, done = false;
    for (let k = 0; k < spots.length && !done; k++) {
      const p = spots[k], q = spots[(k + 1) % spots.length], multi = spots.length > 1;
      if (u < acc + dw) {
        const v = u - acc, inBr = !still && v >= br0 && v < br0 + brL;
        let ac = inBr ? 'breathe' : act, prev = null, bl = 1;
        if (inBr) { prev = act; bl = (v - br0) / 0.5; } else if (!still && v >= br0 + brL && v < br0 + brL + 0.5) { prev = 'breathe'; bl = (v - br0 - brL) / 0.5; } else if (multi && v < 0.5) { prev = 'walk'; bl = v / 0.5; }
        const yaw = multi ? turnTo(legYaw((k + spots.length - 1) % spots.length), faceAt(k), v / 0.7) : faceAt(k);
        out.push({ x: p[0], y: a.y, z: p[1], yaw, act: ac, t: (T + off) * tk, ph: 0, lk: prev ? { ...lk, prev, bl, pph: 0 } : lk, kind, sd }); done = true; break;
      }
      acc += dw;
      if (multi && u < acc + legs[k]) { const v = u - acc, d = legDist(v, legs[k], dists[k]), f = dists[k] > 0 ? d / dists[k] : 1; out.push({ x: p[0] + (q[0] - p[0]) * f, y: a.y, z: p[1] + (q[1] - p[1]) * f, yaw: turnTo(faceAt(k), legYaw(k), v / 0.7), act: 'walk', t: (T + off) * tk, ph: d * 4.6, lk: { ...lk, prev: act, bl: v / 0.45, pph: 0 }, kind, sd }); done = true; break; }
      acc += multi ? legs[k] : 0;
    }
    if (!done) out.push({ x: spots[0][0], y: a.y, z: spots[0][1], yaw: faceAt(0), act, t: (T + off) * tk, ph: 0, lk, kind, sd });
  }
  return out;
}
// 한 사람을 지정한 자리에 (신호수·호스 잡이·유도원 등): face 쪽을 본다
export function crewAt(act, x, y, z, face, T, seed = 0, lk = {}) {
  const sd = seed * 13 + 5;
  return { x, y, z, sd, yaw: face ? Math.atan2(face[0] - x, face[1] - z) : 0, act, t: T + hsh(sd, 3) * 50, ph: 0, lk: { vest: act === 'signal' ? 0xff5a1f : VESTS[sd % VESTS.length], shirt: SHIRTS[sd % SHIRTS.length], pants: PANTS[(sd >> 1) % PANTS.length], skin: SKIN[sd % SKIN.length], hat: act === 'signal' ? HATS.sig : act === 'inspect' ? HATS.boss : HATS.work, ...lk } };
}
export const PED_LOOK = (i) => ({ ped: true, cloth: CLOTH[i % CLOTH.length], pants: [0x2b2d33, 0x3f4a5f, 0x5d5848, 0x1f2024][i % 4], skin: SKIN[i % SKIN.length], hat: HAIR[i % HAIR.length] });
