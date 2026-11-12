// 장면의 '보이는 방식': 하늘(배경 돔 + 환경광), 대기 원근(안개), 톤 매핑, 앰비언트 오클루전.
// 실사처럼 보이게 하는 장치는 모두 여기 모은다. 휴대폰·첫 화면(lite)에서는 오클루전을 끈다.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// 하늘: 천정·지평선·땅 세 색을 고도에 따라 섞고, 해 쪽을 살짝 밝힌다 (선형 색, 톤 매핑은 렌더러가)
const SKY_V = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_F = /* glsl */`
uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGround; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uScale;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHor, uGround, pow(clamp(-h * 4.0, 0.0, 1.0), 0.7));
  float s = max(dot(d, normalize(uSun)), 0.0);
  c += uSunCol * (pow(s, 8.0) * 0.18 + pow(s, 400.0) * 3.0) * step(0.0, h + 0.02);
  gl_FragColor = vec4(c * uScale, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function softwareGL(renderer) {
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(name));
  } catch (e) { return false; }
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSun: { value: new THREE.Vector3(0.3, 0.6, 0.4) }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uScale: { value: 1 },
    },
    vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
}

export function createLook(renderer, scene, { lite = false } = {}) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 배경 하늘 돔: 카메라를 따라다닌다
  const skyMat = skyMaterial();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
  dome.renderOrder = -1000; dome.frustumCulled = false; dome.scale.setScalar(20000);
  dome.onBeforeRender = (r, s, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
  scene.add(dome);

  // 환경광: 같은 하늘을 PMREM으로 구워 모든 재질의 확산·반사광으로
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envMat = skyMaterial();
  envMat.depthTest = true;
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), envMat));
  let envRT = null;

  // 대기 원근: 원근 시점에서만 (평행 투영은 카메라가 멀리 있어 전부 뿌옇게 되므로 끈다)
  scene.fog = new THREE.FogExp2(0xffffff, 0);
  let fogDensity = 0.00011;

  // 오클루전 (데스크톱 GPU만). 소프트웨어 렌더러(그래픽 가속 없음)에서는 한 장에 몇 초씩 걸려 끈다. 주소에 ?ao=1이면 강제로 켠다
  let composer = null, renderPass = null, gtao = null, out = null, cam = null;
  const forceAO = typeof location !== 'undefined' && /[?&]ao=1/.test(location.search);
  if ((!lite && renderer.capabilities.isWebGL2 && !softwareGL(renderer)) || forceAO) {
    try {
      const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: true, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      renderPass = new RenderPass(scene, new THREE.PerspectiveCamera());
      composer.addPass(renderPass);
      gtao = new GTAOPass(scene, new THREE.PerspectiveCamera(), 2, 2);
      gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.4, thickness: 6, distanceFallOff: 1, scale: 1.05, samples: 16 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      gtao.blendIntensity = 0.85;
      // 오클루전 계산에서 빼는 것: 선·점, 스텐실 마스크, 거의 투명한 면(엑스레이 외피 등), 하늘 돔
      gtao.overrideVisibility = function () {
        const cache = this._visibilityCache;
        this.scene.traverse((o) => {
          cache.set(o, o.visible);
          const m = o.material;
          if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO || o === dome ||
            (m && !Array.isArray(m) && (m.colorWrite === false || (m.transparent && m.opacity < 0.6)))) o.visible = false;
        });
      };
      composer.addPass(gtao);
      out = new OutputPass();
      composer.addPass(out);
    } catch (e) { composer = null; }
  }

  function setCamera(c) {
    if (cam === c) return;
    cam = c;
    scene.fog.density = c.isPerspectiveCamera ? fogDensity : 0;
    if (!composer) return;
    renderPass.camera = c; gtao.camera = c;
    const pc = c.isPerspectiveCamera ? 1 : 0;
    if (gtao.gtaoMaterial.defines.PERSPECTIVE_CAMERA !== pc) {
      gtao.gtaoMaterial.defines.PERSPECTIVE_CAMERA = pc; gtao.gtaoMaterial.needsUpdate = true;
      gtao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA = pc; gtao.depthRenderMaterial.needsUpdate = true;
    }
  }

  // P: 팔레트, sunDir: 해 방향(월드, 정규화), sunUp: 해가 떠 있는지
  function applyTheme(P, sunDir, sunUp = true) {
    const dark = P.dark;
    const top = P.skyTop.clone(), hor = P.skyHor.clone(), gr = P.ground.clone().multiplyScalar(dark ? 0.6 : 0.55);
    [skyMat, envMat].forEach(m => {
      m.uniforms.uTop.value.copy(top); m.uniforms.uHor.value.copy(hor); m.uniforms.uGround.value.copy(gr);
      if (sunDir) m.uniforms.uSun.value.copy(sunDir);
      m.uniforms.uSunCol.value.setRGB(1, 0.94, 0.84).multiplyScalar(sunUp && !dark ? 1 : 0);
    });
    // 환경광 세기: 밝은 화면은 하늘빛, 어두운 화면은 도시 야경의 희미한 빛
    envMat.uniforms.uScale.value = dark ? 2.2 : 0.5;
    skyMat.uniforms.uScale.value = 1;
    scene.fog.color.copy(hor);
    fogDensity = dark ? 0.00016 : 0.00011;
    if (cam) scene.fog.density = cam.isPerspectiveCamera ? fogDensity : 0;
    renderer.toneMappingExposure = dark ? 0.95 : 1.0;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
    if (gtao) gtao.blendIntensity = dark ? 0.7 : 0.85;
  }

  let size = '';
  function setSize(w, h, pr) {
    if (!composer) return;
    const k = w + 'x' + h + '@' + pr;
    if (k === size) return;
    size = k;
    composer.setPixelRatio(Math.min(pr, 1.5)); composer.setSize(w, h);
  }
  function render(c) {
    setCamera(c);
    if (composer) composer.render(); else renderer.render(scene, c);
  }
  function dispose() {
    if (envRT) envRT.dispose(); pmrem.dispose();
    skyMat.dispose(); envMat.dispose(); dome.geometry.dispose();
    if (composer) { gtao.dispose(); composer.dispose(); }
    scene.remove(dome);
  }
  return { applyTheme, setSize, render, setCamera, dispose, get ao() { return !!composer; } };
}
