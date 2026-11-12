// 파사드 셰이더: PBR(Standard) 재질에 층·창·커튼월·발코니 무늬를 그린다 (텍스처 없이 미터 단위 좌표로 계산).
// 유리 부분은 거칠기를 낮추고 금속성을 조금 주어 하늘이 비친다.
// 멀리서 보면 무늬가 평균색으로 자연스럽게 바뀌어 깜빡임(모아레)이 없다.
import * as THREE from 'three';

// 무늬 번호
export const PAT = { none: 0, res: 1, curtain: 2, store: 3, punched: 4, louvre: 5, house: 6, ind: 7 };

// 모든 파사드 재질이 함께 쓰는 값 (테마가 바뀌면 여기만 고친다)
export const FACADE_U = {
  uGlass: { value: new THREE.Color(0x8fa3ae) },
  uFilm: { value: new THREE.Color(0x8fc7c0) },
  uInterior: { value: new THREE.Color(0xf1ead9) },
  uLit: { value: new THREE.Color(0xffcf8a) },
  uNight: { value: 0 },
  uFrame: { value: new THREE.Color(0x4a4d50) },
};

const GLSL = /* glsl */`
uniform vec3 uGlass; uniform vec3 uFilm; uniform vec3 uInterior; uniform vec3 uLit; uniform float uNight; uniform vec3 uFrame;
float fbox(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
float fh21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// m: 파사드 좌표(m, x 가로 · y 높이), pat 무늬, fh 층고, sd 건물 난수, fw 화소당 m
// 반환 x 유리, y 불 켜짐, z 슬래브·띠, w 스팬드럴(불투명 유리)
vec4 facadeMask(vec2 m, float pat, float fh, float sd, vec2 fw) {
  if (pat < 0.5) return vec4(0.0);
  float fl = floor(m.y / fh); float y = m.y - fl * fh;
  float bay = 3.0, g = 0.0, band = 0.0, spd = 0.0, avg = 0.4, bavg = 0.1;
  float wx = fw.x * 0.75 + 0.015, wy = fw.y * 0.75 + 0.015;
  if (pat < 1.5) {            // 공동주택: 발코니 통창 + 세대 경계벽 + 슬래브 띠
    bay = 2.9; float u = mod(m.x, bay);
    float pier = 1.0 - fbox(mod(m.x + 0.3, bay * 4.0), 0.0, 0.6, wx);
    g = fbox(u, 0.12, bay - 0.12, wx) * fbox(y, 0.34, fh - 0.3, wy) * pier;
    band = 1.0 - fbox(y, 0.24, fh + 1.0, wy); avg = 0.56; bavg = 0.08;
  } else if (pat < 2.5) {     // 커튼월: 1.5m 멀리언, 바닥 쪽 스팬드럴
    bay = 1.5; float u = mod(m.x, bay);
    float mull = fbox(u, 0.05, bay - 0.05, wx);
    g = mull * fbox(y, 0.95, fh - 0.1, wy); spd = mull * fbox(y, 0.1, 0.95, wy);
    band = 1.0 - fbox(y, 0.1, fh + 1.0, wy); avg = 0.66; bavg = 0.04;
  } else if (pat < 3.5) {     // 상가 쇼윈도 + 간판 띠
    bay = 3.0; float u = mod(m.x, bay);
    g = fbox(u, 0.08, bay - 0.08, wx) * fbox(y, 0.15, fh - 1.05, wy);
    band = 1.0 - fbox(y, 0.0, fh - 0.95, wy); avg = 0.6; bavg = 0.2;
  } else if (pat < 4.5) {     // 창 (오피스텔·상업)
    bay = 2.4; float u = mod(m.x, bay);
    g = fbox(u, 0.38, 2.02, wx) * fbox(y, 0.9, fh - 0.42, wy);
    band = 1.0 - fbox(y, 0.22, fh + 1.0, wy); avg = 0.33; bavg = 0.07;
  } else if (pat < 5.5) {     // 루버 (기계실·피난층)
    bay = 1.0; band = fbox(fract(m.y / 0.42), 0.0, 0.45, wy / 0.42); avg = 0.0; bavg = 0.45;
  } else if (pat < 6.5) {     // 저층 주택
    bay = 3.6; float u = mod(m.x, bay);
    g = fbox(u, 1.0, 2.5, wx) * fbox(y, 1.0, fh - 0.55, wy); band = 0.0; avg = 0.17; bavg = 0.0;
  } else {                    // 공장·창고: 높은 띠창
    bay = 6.0; float u = mod(m.x, bay);
    g = fbox(u, 0.3, bay - 0.3, wx) * fbox(y, fh - 1.8, fh - 0.7, wy); avg = 0.15; bavg = 0.0;
  }
  float k = clamp(1.6 - max(fw.x / bay, fw.y / fh) * 3.2, 0.0, 1.0);
  float lit = step(0.56, fh21(vec2(floor(m.x / bay), fl) + sd * 17.13));
  return vec4(mix(avg, g, k), mix(0.16, lit, k), mix(bavg, band, k), mix(avg * 0.25, spd, k));
}
`;

// 외피 색 섞기 (fragment): diffuseColor를 바꾸고 야간 불빛을 더한다
const MIX = /* glsl */`
  float facGlass = 0.0;
  {
    vec4 FM = facadeMask(vFm.xy, vFac.x, vFac.y, vFac.w, fwidth(vFm.xy));
    FM *= vFm.z;
    float st = vFac.z;                         // 상태: 4 필름 · 5 내부 마감 · 6 준공
    vec3 base = diffuseColor.rgb;
    float rnd = fh21(floor(vFm.xy / vec2(2.9, max(vFac.y, 2.5))) + vFac.w * 3.7);
    vec3 glass = uGlass * (0.86 + 0.26 * rnd);
    glass = mix(glass, base * 0.75 + uGlass * 0.25, 0.28);
    if (st > 3.5 && st < 4.5) glass = uFilm * (0.9 + 0.15 * rnd);
    if (st > 4.5 && st < 5.5) glass = mix(glass, uInterior, 0.45);
    vec3 wall = mix(base, base * 0.8 + uFrame * 0.08, FM.z);
    vec3 col = mix(wall, glass, clamp(FM.x, 0.0, 1.0));
    col = mix(col, glass * 0.62 + base * 0.12, clamp(FM.w, 0.0, 1.0));
    diffuseColor.rgb = col;
    // 유리: 매끈하고 하늘을 비춘다 (커튼월은 더 강하게). 벽은 무광 도장
    float gl = clamp(FM.x + FM.w * 0.6, 0.0, 1.0);
    float cw = step(1.5, vFac.x) * step(vFac.x, 2.5);
    facGlass = gl;
    roughnessFactor = mix(roughnessFactor, 0.14, gl);
    metalnessFactor = mix(metalnessFactor, mix(0.32, 0.55, cw), gl);
    roughnessFactor = mix(roughnessFactor, 0.6, clamp(FM.z, 0.0, 1.0) * (1.0 - gl));
    float on = uNight * FM.y * FM.x * step(4.5, st);
    totalEmissiveRadiance += uLit * on * 0.34;
  }
`;

// 램버트 재질에 파사드 무늬를 입힌다.
// instanced=true: 상자(가로·세로·깊이 = 인스턴스 크기) 한 개가 한 층. iFac = (무늬, 상태, 창 있는 면 비트, 난수)
//                  면 비트: 남(+z)=1, 북(-z)=2, 동(+x)=4, 서(-x)=8. 위·아래 면은 무늬 없음
// instanced=false: 정점 속성 aFm = (가로 m, 높이 m, 무늬 켬 0/1), aFac = (무늬, 층고, 상태, 난수)
export function facadeMaterial(params = {}, { instanced = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0, ...params });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FACADE_U);
    const vDecl = instanced
      ? 'attribute vec4 iFac;\nvarying vec3 vFm;\nvarying vec4 vFac;\n'
      : 'attribute vec3 aFm;\nattribute vec4 aFac;\nvarying vec3 vFm;\nvarying vec4 vFac;\n';
    const vBody = instanced ? /* glsl */`
      {
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        float face = 0.0, fu = 0.0;
        if (abs(normal.y) > 0.5) { face = 0.0; }
        else if (abs(normal.z) > 0.5) { fu = (normal.z > 0.0 ? position.x + 0.5 : 0.5 - position.x) * sc.x; face = normal.z > 0.0 ? 1.0 : 2.0; }
        else { fu = (normal.x > 0.0 ? 0.5 - position.z : position.z + 0.5) * sc.z; face = normal.x > 0.0 ? 4.0 : 8.0; }
        float has = face > 0.5 ? mod(floor(iFac.z / face), 2.0) : 0.0;
        vFm = vec3(fu, position.y * sc.y, has);
        vFac = vec4(iFac.x, sc.y, iFac.y, iFac.w);
      }
    ` : /* glsl */`
      vFm = aFm; vFac = vec4(aFac.x, aFac.y, aFac.z, aFac.w);
    `;
    sh.vertexShader = vDecl + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vBody);
    sh.fragmentShader = 'varying vec3 vFm;\nvarying vec4 vFac;\n' + GLSL + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + MIX)
      // 유리는 하늘 반사를 더 강하게 (환경광 전체를 키우면 벽까지 밝아지므로 유리 반사만)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( RE_IndirectSpecular )\nradiance *= mix(1.0, 2.6, facGlass);\n#endif');
  };
  mat.extensions = { derivatives: true };
  mat.customProgramCacheKey = () => 'facade-' + (instanced ? 'i' : 'v');
  return mat;
}

// 단순 색 + 그림자용 재질
export const lambert = (color, extra = {}) => surf({ color: new THREE.Color(color), ...extra });
// 무늬 없는 PBR 재질 (거칠기 기본 0.9, 비금속)
export const surf = (params = {}, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ roughness, metalness, ...params });
