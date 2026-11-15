// 움직이는 물: 잔물결 법선 지도를 세 방향·세 크기로 흘려 겹치고(물결이 흐른다),
// 해안 가까이는 얕은 물빛, 바다 물가에는 밀려오는 흰 물거품, 먼 물은 짙게.
// 시각은 모든 물 재질이 한 값(WATER_T)을 같이 본다 → 렌더 루프에서 tickWater()만 부르면 된다.
import * as THREE from 'three';

export const WATER_T = { value: 0 };
const T0 = typeof performance !== 'undefined' ? performance.now() : 0;
export function tickWater(t) { WATER_T.value = t != null ? t : ((typeof performance !== 'undefined' ? performance.now() : 0) - T0) / 1000; }

// 물가 지도: R = 바다 물가 거품(물가에서 가까울수록 1), G = 얕은 물(모든 수면, 물가에서 ~80m까지)
// ctx 좌표(x, z)의 ±H 범위를 n×n 칸으로. polys: [{outer, holes, sea}]
export function shoreMask(polys, H = 1600, n = 768) {
  if (typeof document === 'undefined' || !polys.length) return null;
  const K = n / (2 * H), tx = (v) => (v + H) * K;
  const draw = (list) => {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, n, n); g.fillStyle = '#fff';
    list.forEach(w => { g.beginPath(); [w.outer, ...(w.holes || [])].forEach(r => { r.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tx(z)) : g.moveTo(tx(x), tx(z)))); g.closePath(); }); g.fill('evenodd'); });
    const d = g.getImageData(0, 0, n, n).data, out = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) out[i] = d[i * 4] / 255;
    return out;
  };
  const W = draw(polys), any = W.some(v => v > 0.5); if (!any) return null;
  const S = polys.some(w => w.sea) ? draw(polys.filter(w => w.sea)) : null;
  const land = W.map(v => 1 - v);
  const near = blur(land, n, Math.max(2, Math.round(10 * K))), far = blur(land, n, Math.max(4, Math.round(70 * K)));
  const px = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    px[i * 4] = S ? Math.min(255, S[i] * near[i] * 2.2 * 255) : 0;
    px[i * 4 + 1] = Math.min(255, W[i] * far[i] * 2.2 * 255);
    px[i * 4 + 2] = W[i] * 255; px[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(px, n, n, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return { tex: t, H };
}
// 상자 흐림 3번 ≈ 가우스 (가로·세로 분리)
function blur(src, n, r) {
  let a = Float32Array.from(src), b = new Float32Array(n * n);
  for (let it = 0; it < 3; it++) {
    for (let y = 0; y < n; y++) { let s = 0; const o = y * n; for (let x = -r; x <= r; x++) s += a[o + Math.min(n - 1, Math.max(0, x))]; for (let x = 0; x < n; x++) { b[o + x] = s / (2 * r + 1); s += a[o + Math.min(n - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < n; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(n - 1, Math.max(0, y)) * n + x]; for (let y = 0; y < n; y++) { a[y * n + x] = s / (2 * r + 1); s += b[Math.min(n - 1, y + r + 1) * n + x] - b[Math.max(0, y - r) * n + x]; } }
  }
  return a;
}

// MeshStandardMaterial(법선 지도 있는)을 움직이는 물로. o: { shore: shoreMask() 결과, flow: [u,v] 흐름(타일/초), still: 고인 물 }
export function animateWater(mat, o = {}) {
  const sm = o.shore || null, fl = o.flow || [0.011, 0.006], k = o.still ? 0.35 : 1, UV = o.world ? `(vWW * ${o.world.toFixed(5)})` : 'vNormalMapUv';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWT = WATER_T;
    sh.uniforms.uFlow = { value: new THREE.Vector2(fl[0] * k, fl[1] * k) };
    if (sm) { sh.uniforms.uShore = { value: sm.tex }; sh.uniforms.uShoreH = { value: sm.H }; }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWP;\nvarying vec2 vWW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWP = position.xz;
{ vec4 ww = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  ww = instanceMatrix * ww;
#endif
  vWW = ( modelMatrix * ww ).xz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vWP;
varying vec2 vWW;
uniform float uWT;
uniform vec2 uFlow;
${sm ? 'uniform sampler2D uShore;\nuniform float uShoreH;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float wFoam = 0.0;
${sm ? `{
  vec2 su = (vWP + uShoreH) / (2.0 * uShoreH);
  float inb = step(0.0, su.x) * step(su.x, 1.0) * step(0.0, su.y) * step(su.y, 1.0);
  vec4 sm = texture2D(uShore, su) * inb;
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.72, diffuseColor.rgb * 1.18 + vec3(0.0, 0.045, 0.035), sm.g);
  float wave = 0.5 + 0.5 * sin(sm.r * 16.0 - uWT * 1.4 + sin(vWP.x * 0.05) * 1.3 + vWP.y * 0.013);
  wFoam = smoothstep(0.25, 0.95, sm.r) * (0.45 + 0.55 * wave) + smoothstep(0.85, 1.0, sm.r) * 0.4;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.96), clamp(wFoam, 0.0, 1.0) * 0.8);
}` : ''}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, clamp(wFoam, 0.0, 1.0));')
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 mapN = normalize(
  ( texture2D( normalMap, ${UV} + uWT * uFlow ).xyz * 2.0 - 1.0 ) +
  ( texture2D( normalMap, ${UV} * 1.73 + vec2( 0.37, 0.11 ) - uWT * uFlow.yx * vec2( 0.4, 1.9 ) ).xyz * 2.0 - 1.0 ) * 0.75 +
  ( texture2D( normalMap, ${UV} * 0.27 + vec2( 0.61, 0.23 ) + uWT * uFlow * 0.22 ).xyz * 2.0 - 1.0 ) * 0.6 );`);
  };
  mat.customProgramCacheKey = () => `water${sm ? 'S' : ''}${o.world || ''}`;
  mat.needsUpdate = true;
  return mat;
}

// 잔물결 법선 지도 (여러 방향 사인파 높이장 → 법선, 이음매 없이 반복). 한 번 만들어 같이 쓴다
let RIP = null;
export function rippleTexture() {
  if (RIP || typeof document === 'undefined') return RIP;
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), H = new Float32Array(n * n);
  const waves = [[3, 1, 0.5], [1, 4, 0.35], [-5, 2, 0.22], [7, -3, 0.15], [2, 9, 0.1], [-11, -6, 0.06]];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let h = 0; waves.forEach(([a, b, k], i) => { h += k * Math.sin(((a * x + b * y) / n) * Math.PI * 2 + i * 1.7); }); H[y * n + x] = h; }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const hx = H[y * n + (x + 1) % n] - H[y * n + (x - 1 + n) % n], hy = H[((y + 1) % n) * n + x] - H[((y - 1 + n) % n) * n + x];
    const l = Math.hypot(hx * 6, hy * 6, 1), i = (y * n + x) * 4;
    img.data[i] = (-hx * 6 / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-hy * 6 / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  RIP = new THREE.CanvasTexture(c); RIP.wrapS = RIP.wrapT = THREE.RepeatWrapping;
  return RIP;
}
// 현장의 작은 물(세륜 수조·침전조·고인 물): 월드 좌표로 물결을 깔아 상자·판 어디에 써도 같은 크기
export function waterSurface(color = 0x3f6f86, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.12, metalness: 0.05, normalMap: rippleTexture(), normalScale: new THREE.Vector2(o.ns ?? 0.35, o.ns ?? 0.35), transparent: o.opacity != null, opacity: o.opacity ?? 1, depthWrite: o.opacity == null });
  return animateWater(m, { world: o.scale || 1 / 6, still: o.still !== false, flow: o.flow });
}
