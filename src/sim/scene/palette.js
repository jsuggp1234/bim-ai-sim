// 3D 장면 색: CSS 변수(라이트·다크)를 읽어 three 색으로. 변수가 없으면 기본값
import * as THREE from 'three';
import { FLOOR_USES } from '../uses.js';

const DEF = {
  scene: '#f4f5f6', skyTop: '#c9dbea', skyHor: '#f4f6f8', ground: '#e9e6e0', asphalt: '#cac8c4', walk: '#dedad3', curb: '#bdb9b2', mark: '#ffffff', markY: '#e3b341',
  water: '#b7cad1', bank: '#d3cfc7', park: '#d2dbc4', forest: '#bccab0', grass: '#dbe2cf', pitch: '#c9d9b6', sand: '#e6dcc6',
  wRes: '#f3f1ed', wCom: '#e9e6e1', wHouse: '#e6ded2', wTower: '#dfe4e7', wInd: '#dfdcd6', wCivic: '#ebe2d3', roof: '#f6f5f2',
  pjRes: '#ece2d2', pjBase: '#b8a792', pjOffice: '#d3dce3', pjMech: '#8b9197', pjGlass: '#4f7088',
  glass: '#8ea2ad', film: '#8cc6be', interior: '#f1e9d6', lit: '#ffcf8a', frame: '#4a4d50',
  crown: '#a7bb96', trunk: '#8a7865', concrete: '#cbc8c2', form: '#e98a3c', ply: '#d7b27c', duct: '#b8bdc1', pipeR: '#cf4637', pipeB: '#3d7bc4', tray: '#ddb03a',
  soil: '#b69b7c', pitWall: '#a9a59d', steel: '#55626e', crane: '#efb12a', fence: '#f1f0ec', fenceBand: '#2f6f5e', container: '#dfe5ea',
  site: '#f1efea', lot: '#ecebe6', edge: '#2a2825', ballast: '#c5bfb5', rail: '#6b6660', bridge: '#d9d6d0',
};
// 밝은 화면의 장면 색 (styles.css :root 의 --s-* 값과 같다 — tests/realism.test.js 가 어긋남을 잡는다).
// 검정 화면에서 매스 단계를 낮 장면으로 볼 때 쓴다 (CSS 변수는 검정 화면 값이라 읽을 수 없다)
export const LIGHT = {
  scene: '#f4f5f6', skyTop: '#c9dbea', skyHor: '#f4f6f8', ground: '#e9eaeb', asphalt: '#b9bcc0', walk: '#dcdddf', curb: '#c3c5c8', mark: '#ffffff',
  markY: '#e2b23c', water: '#8fb0c2', bank: '#d2d3d4', park: '#c5d3b3', forest: '#a9bd97', grass: '#d3ddc4', pitch: '#b9d09e', sand: '#e3dccb', wRes: '#f2f2f1',
  wCom: '#e7e8e9', wHouse: '#e6e2dc', wTower: '#dfe4e8', wInd: '#e0e0df', wCivic: '#eae5dc', roof: '#f2f2f2', pjRes: '#ece2d2', pjBase: '#b8a792', pjOffice: '#d3dce3',
  pjMech: '#8b9197', pjGlass: '#4f7088', glass: '#7f97a6', film: '#84c1b9', interior: '#efe8d6', lit: '#ffcf8a', frame: '#45484c', crown: '#8fae79', trunk: '#7a6a59',
  concrete: '#c6c5c1', form: '#e9853a', ply: '#d8b27a', duct: '#b3b9be', pipeR: '#cf4637', pipeB: '#3d7bc4', tray: '#ddb03a', soil: '#ad9273', pitWall: '#a3a29e',
  steel: '#4f5b67', crane: '#f0b323', fence: '#f3f3f2', fenceBand: '#2f6f5e', container: '#dde4ea', site: '#efeff0', lot: '#e9e9ea', edge: '#1f2023', ballast: '#c4c1bc',
  rail: '#66666a', bridge: '#d6d6d8',
};
export const LIGHT_TOK = { '--model': '#ffffff', '--model-na': '#e8e8ea', '--heat-lo': '#f0f0f1', '--heat-hi': '#0c6f68' };
const VAR = (k) => '--s-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

// day: 화면 테마와 상관없이 낮(밝은 화면)의 장면 색 (공법 시뮬레이터는 늘 낮 장면)
// light: 밝은 화면의 장면 색을 그대로 쓴다 (매스 단계 낮 장면). 모형·히트맵 색도 밝은 화면 값으로
export function readPalette({ day = false, light = false } = {}) {
  const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const P = {};
  for (const [k, d] of Object.entries(DEF)) {
    const v = light ? LIGHT[k] : cs && !day ? cs.getPropertyValue(VAR(k)).trim() : '';
    P[k] = new THREE.Color(v || d);
  }
  const tok = (n, d) => { const v = light && LIGHT_TOK[n] ? LIGHT_TOK[n] : cs ? cs.getPropertyValue(n).trim() : ''; return new THREE.Color(v || d); };
  P.accent = tok('--accent', '#eb6834');
  P.use = {
    res: tok('--res', '#1f9e95'), officetel: tok('--officetel', '#8fcfc7'), office: tok('--office', '#2a78d6'), retail: tok('--retail', '#d6d2c6'),
    lobby: tok('--retail', '#d6d2c6'), refuge: tok('--refuge', '#eb6834'), mech: tok('--mech', '#57554f'),
  };
  Object.entries(FLOOR_USES).forEach(([k, x]) => { if (!P.use[k]) P.use[k] = tok(x.tok, '#9a9aa0'); });
  P.model = tok('--model', '#ffffff'); P.na = tok('--model-na', '#e7e4df');
  P.heatLo = tok('--heat-lo', '#efede7'); P.heatHi = tok('--heat-hi', '#0c6f68');
  P.dark = day || light ? false : isDark();
  // 수평면(땅·물·도로) 밝기 보정. 톤 매핑이 하이라이트를 눌러 주므로 이제는 거의 그대로 쓴다
  P.flat = 1;
  return P;
}
export function isDark() {
  if (typeof document === 'undefined') return false;
  const t = document.documentElement.dataset.theme;
  return t !== 'light';
}
