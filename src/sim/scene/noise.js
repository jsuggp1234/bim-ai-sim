// 셰이더용 값 노이즈 (텍스처 없이): 땅·벽 질감의 반복을 깨는 큰 얼룩과 타일 무늬 섞기에 쓴다.
// nzH 해시 · nzV 부드러운 값 노이즈(0~1) · nzF 세 겹 노이즈(0~1)
export const NOISE_GLSL = /* glsl */`
float nzH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float nzV(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(nzH(i), nzH(i + vec2(1.0, 0.0)), u.x), mix(nzH(i + vec2(0.0, 1.0)), nzH(i + vec2(1.0, 1.0)), u.x), u.y);
}
float nzF(vec2 p) { return nzV(p) * 0.5 + nzV(p * 2.03 + 17.1) * 0.3 + nzV(p * 4.11 + 41.7) * 0.2; }
`;

// 넓은 지면 재질에 월드 좌표 얼룩을 입힌다: 140m 흙·풀빛 얼룩 · 60m·9m 밝기 얼룩 · 1.7m 잔결 (멀면 잔결은 흐려진다)
// k: 밝기 얼룩 세기, hue: 색 얼룩 세기
export function groundDetail(m, k = 0.16, hue = 0.05) {
  const prev = m.onBeforeCompile, k0 = prev && m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uGdK = { value: k }; sh.uniforms.uGdH = { value: hue };
    sh.vertexShader = 'varying vec3 vGdW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGdW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uGdK;\nuniform float uGdH;\nvarying vec3 vGdW;\n' + NOISE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 gp = vGdW.xz;
        #if __VERSION__ >= 300
          float aa = clamp(1.6 - length(fwidth(gp)) * 0.9, 0.0, 1.0);
        #else
          float aa = 0.5;
        #endif
        float d = (nzV(gp / 60.0) - 0.5) + (nzV(gp / 13.0 + 7.0) - 0.5) * 0.6 + (nzV(gp / 2.1 + 3.0) - 0.5) * 0.4 * aa;
        diffuseColor.rgb *= 1.0 + uGdK * d;
        diffuseColor.rgb *= mix(vec3(1.0 + uGdH, 1.0, 1.0 - uGdH * 1.3), vec3(1.0 - uGdH * 0.7, 1.0 + uGdH * 0.35, 1.0 - uGdH * 0.2), smoothstep(0.25, 0.75, nzV(gp / 140.0 + 19.0)));
      }`);
  };
  m.customProgramCacheKey = () => k0 + '|gd' + k + '|' + hue;
  return m;
}
