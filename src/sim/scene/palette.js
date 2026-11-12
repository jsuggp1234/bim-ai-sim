// 3D 장면 색: CSS 변수(라이트·다크)를 읽어 three 색으로. 변수가 없으면 기본값
import * as THREE from 'three';
import { FLOOR_USES } from '../uses.js';

const DEF = {
  scene: '#f4f5f6', skyTop: '#c9dbea', skyHor: '#f4f6f8', ground: '#e9e6e0', asphalt: '#cac8c4', walk: '#dedad3', curb: '#bdb9b2', mark: '#ffffff', markY: '#e3b341',
  water: '#b7cad1', bank: '#d3cfc7', park: '#d2dbc4', forest: '#bccab0', grass: '#dbe2cf', pitch: '#c9d9b6', sand: '#e6dcc6',
  wRes: '#f3f1ed', wCom: '#e9e6e1', wHouse: '#e6ded2', wTower: '#dfe4e7', wInd: '#dfdcd6', wCivic: '#ebe2d3', roof: '#f6f5f2',
  glass: '#8ea2ad', film: '#8cc6be', interior: '#f1e9d6', lit: '#ffcf8a', frame: '#4a4d50',
  crown: '#a7bb96', trunk: '#8a7865', concrete: '#cbc8c2', form: '#e98a3c', ply: '#d7b27c', duct: '#b8bdc1', pipeR: '#cf4637', pipeB: '#3d7bc4', tray: '#ddb03a',
  soil: '#b69b7c', pitWall: '#a9a59d', steel: '#55626e', crane: '#efb12a', fence: '#f1f0ec', fenceBand: '#2f6f5e', container: '#dfe5ea',
  site: '#f1efea', lot: '#ecebe6', edge: '#2a2825', ballast: '#c5bfb5', rail: '#6b6660', bridge: '#d9d6d0',
};
const VAR = (k) => '--s-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

export function readPalette() {
  const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const P = {};
  for (const [k, d] of Object.entries(DEF)) {
    const v = cs ? cs.getPropertyValue(VAR(k)).trim() : '';
    P[k] = new THREE.Color(v || d);
  }
  const tok = (n, d) => { const v = cs ? cs.getPropertyValue(n).trim() : ''; return new THREE.Color(v || d); };
  P.accent = tok('--accent', '#eb6834');
  P.use = {
    res: tok('--res', '#1f9e95'), officetel: tok('--officetel', '#8fcfc7'), office: tok('--office', '#2a78d6'), retail: tok('--retail', '#d6d2c6'),
    lobby: tok('--retail', '#d6d2c6'), refuge: tok('--refuge', '#eb6834'), mech: tok('--mech', '#57554f'),
  };
  Object.entries(FLOOR_USES).forEach(([k, x]) => { if (!P.use[k]) P.use[k] = tok(x.tok, '#9a9aa0'); });
  P.model = tok('--model', '#ffffff'); P.na = tok('--model-na', '#e7e4df');
  P.heatLo = tok('--heat-lo', '#efede7'); P.heatHi = tok('--heat-hi', '#0c6f68');
  P.dark = isDark();
  // 수평면(땅·물·도로) 밝기 보정. 톤 매핑이 하이라이트를 눌러 주므로 이제는 거의 그대로 쓴다
  P.flat = 1;
  return P;
}
export function isDark() {
  if (typeof document === 'undefined') return false;
  const t = document.documentElement.dataset.theme;
  return t !== 'light';
}
