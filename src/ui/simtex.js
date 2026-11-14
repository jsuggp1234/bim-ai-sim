// 3D 시공 시뮬레이션의 재료 질감: 콘크리트(거푸집 줄눈·폼타이 구멍), 흙(알갱이·자갈), 아스팔트(골재), 보도블록, 철재, 합판, 쇄석.
// 캔버스에 한 번 그려 모든 장면이 같이 쓴다. 상자 크기가 제각각이라 UV 대신 월드 좌표로 세 방향에서 투영(triplanar)해 붙인다.
// 질감은 밝기 지도(흰색 근처)라 재질 색과 곱해진다.
import * as THREE from 'three';

const TX = new Map();
let ANISO = 8;
// 비등방 필터 세기 (소프트웨어 렌더러는 1)
export function simTexAniso(n) { ANISO = n; TX.forEach(t => { if (t.anisotropy !== n) { t.anisotropy = n; t.needsUpdate = true; } }); }

// 이어 붙여도 이음매가 없는 값 노이즈 (period 칸마다 반복)
function vnoise(seed, period) {
  const h = (i, j) => {
    i = ((i % period) + period) % period; j = ((j % period) + period) % period;
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  return (u, v) => {
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
}
// 여러 겹 노이즈: base칸 → 2배씩 잘게. 0~1
function fbm(seed, base, oct = 4) {
  const ns = Array.from({ length: oct }, (_, k) => vnoise(seed + k * 97, base << k));
  return (x, y, N) => { let s = 0, a = 0.5, t = 0; for (let k = 0; k < oct; k++) { s += ns[k](x / N * (base << k), y / N * (base << k)) * a; t += a; a *= 0.5; } return s / t; };
}
function hash2(x, y, s) { let n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }

function paint(N, fn) {
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data;
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const [r, g, b] = fn(px, py), k = (py * N + px) * 4;
    d[k] = Math.max(0, Math.min(255, r * 255)); d[k + 1] = Math.max(0, Math.min(255, g * 255)); d[k + 2] = Math.max(0, Math.min(255, b * 255)); d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return { c, x };
}
const grey = (v) => [v, v, v];

// 질감 종류: [캔버스 크기, 한 장이 덮는 길이(m), 그리는 함수]
const KINDS = {
  // 노출 콘크리트: 유로폼 1.2 × 2.4m 줄눈, 0.6m 폼타이 구멍, 판마다 다른 얼룩
  conc: [512, 4.8, (N) => {
    const f = fbm(11, 6), f2 = fbm(29, 24, 3);
    const { c, x } = paint(N, (px, py) => {
      const pi = Math.floor(px / 128), pj = Math.floor(py / 256), tone = (hash2(pi, pj, 5) - 0.5) * 0.06;
      let v = 0.9 + (f(px, py, N) - 0.5) * 0.16 + (f2(px, py, N) - 0.5) * 0.08 + tone + (hash2(px, py, 1) - 0.5) * 0.035;
      if (px % 128 < 2 || py % 256 < 2) v *= 0.8;
      return [v, v * 0.995, v * 0.985];
    });
    x.fillStyle = 'rgba(40,40,40,.55)';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.beginPath(); x.arc(32 + i * 64, 32 + j * 64, 2.6, 0, Math.PI * 2); x.fill(); }
    return c;
  }],
  // 흙: 굵고 잔 알갱이 + 자갈
  soil: [256, 3, (N) => {
    const f = fbm(41, 4), f2 = fbm(43, 32, 2);
    const { c, x } = paint(N, (px, py) => { const v = 0.84 + (f(px, py, N) - 0.5) * 0.22 + (f2(px, py, N) - 0.5) * 0.1 + (hash2(px, py, 3) - 0.5) * 0.08; return [v, v * 0.98, v * 0.95]; });
    for (let i = 0; i < 260; i++) { const r = 0.8 + hash2(i, 1, 7) * 2.6, px = hash2(i, 2, 7) * N, py = hash2(i, 3, 7) * N, l = hash2(i, 4, 7) > 0.5 ? 255 : 70; x.fillStyle = `rgba(${l},${l},${l},${0.12 + hash2(i, 5, 7) * 0.2})`; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); }
    return c;
  }],
  // 아스팔트: 검은 결합재 속 밝은 골재 + 바퀴 자국 얼룩
  asph: [512, 6, (N) => {
    const f = fbm(51, 3), f2 = fbm(53, 48, 2);
    return paint(N, (px, py) => { const g = hash2(px, py, 9), spk = g > 0.93 ? 0.18 : g < 0.05 ? -0.12 : 0; const v = 0.86 + (f(px, py, N) - 0.5) * 0.14 + (f2(px, py, N) - 0.5) * 0.08 + spk; return grey(v); }).c;
  }],
  // 보도블록 0.3m (줄눈 + 블록마다 다른 색)
  paver: [512, 2.4, (N) => {
    const f = fbm(61, 8);
    return paint(N, (px, py) => {
      const i = Math.floor(px / 64), j = Math.floor(py / 64), t = (hash2(i, j, 13) - 0.5) * 0.1, gx = px % 64, gy = py % 64;
      let v = 0.93 + t + (f(px, py, N) - 0.5) * 0.08 + (hash2(px, py, 2) - 0.5) * 0.04;
      if (gx < 2 || gy < 2) v *= 0.72; else if (gx > 61 || gy > 61) v *= 0.92;
      return [v, v * 0.99, v * 0.97];
    }).c;
  }],
  // 철재: 압연 결 + 얼룩
  steel: [256, 2, (N) => {
    const f = fbm(71, 4), lines = vnoise(73, 128);
    return paint(N, (px, py) => grey(0.9 + (f(px, py, N) - 0.5) * 0.12 + (lines(px / N * 2, py / N * 128) - 0.5) * 0.05)).c;
  }],
  // 합판 거푸집: 나뭇결 + 판 이음
  ply: [512, 2.4, (N) => {
    const f = fbm(81, 4), w = vnoise(83, 8);
    return paint(N, (px, py) => {
      const warp = w(px / N * 8, py / N * 8) * 30, gr = Math.sin((py + warp) * 0.35) * 0.5 + 0.5;
      let v = 0.9 + (gr - 0.5) * 0.07 + (f(px, py, N) - 0.5) * 0.1;
      if (px % 256 < 2 || py % 256 < 2) v *= 0.75;
      return [v, v * 0.97, v * 0.92];
    }).c;
  }],
  // 쇄석·현장 바닥: 촘촘한 여러 색 알갱이
  gravel: [256, 2, (N) => {
    const f = fbm(91, 4);
    return paint(N, (px, py) => { const g = hash2(px >> 1, py >> 1, 17), v = 0.8 + (g - 0.5) * 0.3 + (f(px, py, N) - 0.5) * 0.16; return [v, v * 0.98, v * 0.95]; }).c;
  }],
};

export function simTex(kind) {
  if (TX.has(kind)) return TX.get(kind);
  const K = KINDS[kind]; if (!K || typeof document === 'undefined') return null;
  const t = new THREE.CanvasTexture(K[2](K[0]));
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.userData.size = K[1];
  TX.set(kind, t);
  return t;
}

// 월드 좌표 세 방향 투영. 상자를 어떻게 늘려도 질감 크기가 같다 (InstancedMesh도)
export function triplanar(m, size) {
  const s = 1 / (size || (m.map && m.map.userData.size) || 4);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTpS = { value: s };
    sh.vertexShader = 'varying vec3 vTpP;\nvarying vec3 vTpN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      {
        vec4 tpP = vec4(transformed, 1.0);
        vec3 tpN = objectNormal;
        #ifdef USE_INSTANCING
          tpP = instanceMatrix * tpP;
          tpN = mat3(instanceMatrix) * tpN;
        #endif
        vTpP = (modelMatrix * tpP).xyz;
        vTpN = normalize(mat3(modelMatrix) * tpN);
      }`);
    sh.fragmentShader = 'uniform float uTpS;\nvarying vec3 vTpP;\nvarying vec3 vTpN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
        vec3 tpB = pow(abs(vTpN), vec3(4.0)); tpB /= (tpB.x + tpB.y + tpB.z + 1e-5);
        vec3 tpQ = vTpP * uTpS;
        vec4 tpC = texture2D(map, tpQ.zy) * tpB.x + texture2D(map, tpQ.xz) * tpB.y + texture2D(map, tpQ.xy) * tpB.z;
        diffuseColor *= tpC;
      #endif`);
  };
  m.customProgramCacheKey = () => 'tp' + s.toFixed(4);
  m.userData.tp = s;
  return m;
}
// 복제한 재질에도 같은 투영을 (Material.clone은 onBeforeCompile을 옮기지 않는다)
export function keepTriplanar(src, dst) {
  if (src.userData && src.userData.tp) { dst.onBeforeCompile = src.onBeforeCompile; dst.customProgramCacheKey = src.customProgramCacheKey; dst.userData.tp = src.userData.tp; }
  return dst;
}
