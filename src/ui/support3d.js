// 발 디딤 면: 장면의 상자(인스턴스 포함)를 평면 격자에 담아 두고, 사람 발밑에서 실제로 디딜 수 있는 가장 높은 윗면을 찾는다.
// 사람 자리는 공정 계산(층 높이·굴착 깊이)으로 정하는데, 그 순간 그려진 면(거푸집 데크·철근·타설 면·굴착 바닥·지붕)과
// 몇 cm~몇 m 어긋나면 떠 보이거나 묻혀 보인다. 그래서 그리기 직전에 발 높이를 그려진 면에 맞춘다.
//  - 아래로 down(16m, 층고 높은 물류·화학·PC 공장 층까지) 안의 가장 높은 윗면으로 내리고, 발보다 up(0.3m) 높은 턱은 딛고 올라선다
//  - 흙·슬래브처럼 넓은 덩어리 속에 묻혀 있으면 그 덩어리 위로 올린다 (최대 rise)
//  - 사람·반투명(망·유령 상자)·색을 안 쓰는 마스크는 디딤 면이 아니다
//  - 기울어진 상자(경사로·비스듬한 붐·호스·계단 옆판)는 둘레 상자가 실제보다 높으니, 그 자리의 실제 윗면 높이를 직선-상자 교차로 구한다
import * as THREE from 'three';

export function createSupport(scene, { cell = 2, down = 16, up = 0.3, rise = 12 } = {}) {
  let grid = new Map(), big = [], key = null, age = 0;
  const m = new THREE.Matrix4(), w = new THREE.Matrix4(), inv = new THREE.Matrix4(), bb = new THREE.Box3();
  const ok = (o) => {
    if (o.userData.noMirror || o.userData.noSupport || o.userData.sky) return false;
    const mt = o.material; if (!mt || Array.isArray(mt)) return false;
    if (o.userData.support) return true; // 반투명으로 보여도 실제로는 땅 (지하 공종에서 앞쪽 흙)
    if (mt.colorWrite === false || mt.wireframe || mt.side === THREE.BackSide) return false;
    // 지금 공종이 아니라서 흐리게 보이는 부재(원래 재질이 불투명)는 실제로 있는 면이다. 망·유리·물처럼 원래 투명한 것만 뺀다
    const src = o.userData.src, base = o.userData.base || (src && src.userData.base) || mt;
    if (base.transparent && (base.opacity ?? 1) < 0.7) return false;
    return true;
  };
  const vis = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const ck = (i, j) => i * 73856093 ^ j * 19349663;
  // M: 월드 행렬, lb: 형상의 지역 상자. 위 방향(y축)이 기울었으면 역행렬을 붙여 둔다
  function put(b, M, lb) {
    const x0 = b.min.x, x1 = b.max.x, z0 = b.min.z, z1 = b.max.z;
    if (!(x1 > x0 - 1e-6 && z1 > z0 - 1e-6) || !Number.isFinite(x0 + x1 + z0 + z1 + b.min.y + b.max.y)) return;
    const r = [x0, x1, b.min.y, b.max.y, z0, z1];
    const e = M.elements, ly = Math.hypot(e[4], e[5], e[6]);
    if (ly > 1e-9 && Math.abs(e[5]) / ly < 0.999) { const d = Math.abs(M.determinant()); if (!(d > 1e-12)) return; r.inv = inv.copy(M).invert().elements.slice(); r.lb = [lb.min.x, lb.min.y, lb.min.z, lb.max.x, lb.max.y, lb.max.z]; }
    const i0 = Math.floor(x0 / cell), i1 = Math.floor(x1 / cell), j0 = Math.floor(z0 / cell), j1 = Math.floor(z1 / cell);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) { big.push(r); return; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = ck(i, j); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(r); }
  }
  function rebuild() {
    grid = new Map(); big = [];
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!o.isMesh || !ok(o) || !vis(o)) return;
      const g = o.geometry; if (!g || !g.attributes.position) return;
      // 상자·원기둥·평판만: 지형(높낮이 있는 큰 판)이나 여러 조각을 합친 모양은 둘레 상자가 실제 면과 달라 쓰지 않는다
      const simple = g.type === 'BoxGeometry' || g.type === 'CylinderGeometry' || (g.type === 'PlaneGeometry' && g.attributes.position.count <= 4) || g.userData.support;
      if (!simple) return;
      if (!g.boundingBox) g.computeBoundingBox();
      if (o.isInstancedMesh) {
        const a = o.instanceMatrix.array, n = Math.min(o.count, o.instanceMatrix.count);
        for (let i = 0; i < n; i++) { m.fromArray(a, i * 16); w.multiplyMatrices(o.matrixWorld, m); bb.copy(g.boundingBox).applyMatrix4(w); put(bb, w, g.boundingBox); }
      } else { bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld); put(bb, o.matrixWorld, g.boundingBox); }
    });
  }
  // 상태 열쇠가 바뀌거나 일정 프레임이 지나면 다시 담는다
  function frame(k, every = 40) { if (k !== key || ++age >= every) { key = k; age = 0; rebuild(); } }
  const inXZ = (r, x, z) => x >= r[0] - 1e-3 && x <= r[1] + 1e-3 && z >= r[4] - 1e-3 && z <= r[5] + 1e-3;
  function list(x, z) { const a = grid.get(ck(Math.floor(x / cell), Math.floor(z / cell))) || []; return a.concat(big); }
  // (x, z)를 지나는 연직선이 닿는 그 상자의 가장 높은 점 (못 닿으면 null). 기울지 않은 상자는 둘레 상자 윗면
  function topOf(r, x, z) {
    if (!r.inv) return r[3];
    const e = r.inv, b = r.lb, Y = r[3] + 1;
    const o = [e[0] * x + e[4] * Y + e[8] * z + e[12], e[1] * x + e[5] * Y + e[9] * z + e[13], e[2] * x + e[6] * Y + e[10] * z + e[14]];
    const d = [-e[4], -e[5], -e[6]]; // 월드 (0,−1,0) 방향을 지역으로 (t는 월드 거리)
    let t0 = -Infinity, t1 = Infinity;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (o[k] < b[k] || o[k] > b[k + 3]) return null; continue; }
      let a1 = (b[k] - o[k]) / d[k], a2 = (b[k + 3] - o[k]) / d[k]; if (a1 > a2) { const q = a1; a1 = a2; a2 = q; }
      if (a1 > t0) t0 = a1; if (a2 < t1) t1 = a2;
    }
    if (!(t0 <= t1) || t1 < 0) return null;
    return Y - Math.max(t0, 0);
  }
  // 발 높이 y를 디딤 면에 맞춘 값 (못 찾으면 null)
  function at(x, z, y) {
    const L = list(x, z).filter(r => inXZ(r, x, z));
    // 디딜 상자가 없으면 지표(지형은 상자가 아니라 담지 않았다): 지표 근처이거나, 지상에서 down 안쪽으로 떠 있으면 지표로 내린다
    // (예: 아직 1층 바닥이 없는데 그 높이에 선 철골·PC 조립 반 → 지상 조립 마당)
    const flat = y > -0.6 && y <= down ? 0 : null;
    if (!L.length) return flat;
    // 땅속(지표 아래)에서 넓은 덩어리(흙·슬래브) 속에 묻혔으면 그 위로. 지상에서는 턱(up)만 딛고 오른다
    let cur = y;
    for (let it = 0; it < 6 && cur < -0.3; it++) {
      let top = null;
      for (const r of L) { if (r.inv) continue; const fp = (r[1] - r[0]) * (r[5] - r[4]); if (fp >= 150 && r[3] - r[2] < 70 && r[2] <= cur + 0.3 && r[3] > cur + up && r[3] - y <= rise) top = Math.max(top ?? -Infinity, r[3]); }
      if (top == null) break; cur = top;
    }
    let best = null;
    // 지표 근처에 선 사람은 3m 넘게 떨어뜨리지 않는다 (지형 위를 걷는 사람이 그 밑 지하층·터파기 바닥으로 빠지지 않게)
    const dn = Math.abs(y) < 0.6 ? 3 : down;
    for (const r of L) { const t = topOf(r, x, z); if (t == null) continue; if (t <= cur + up && t >= cur - dn && (best == null || t > best)) best = t; }
    return best ?? flat;
  }
  return { frame, at, rebuild, get size() { return grid.size + big.length; } };
}
