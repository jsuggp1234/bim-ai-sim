// 실제 지도(Overpass 응답)를 작게 담고 되푸는 형식. 사이트에 미리 담아 두는 후보지 주변 지도(public/ctx/<id>.json)에 쓴다.
// 되푼 결과는 Overpass 응답과 같은 모양이라 parseOSM이 그대로 읽는다.
// 좌표: 택지 중심에서의 차이를 1e-6도(약 0.1m) 정수로, 앞 점과의 차이만 적는다. 태그는 해석에 쓰는 것만 남긴다.
export const PACK_VER = 1;
const TAGS = ['building', 'building:levels', 'height', 'name', 'name:ko', 'highway', 'service', 'oneway', 'junction', 'lanes', 'width', 'bridge', 'tunnel', 'covered', 'layer', 'area',
  'railway', 'natural', 'waterway', 'leisure', 'landuse', 'ele'];
const Q = 1e6;

// 꺾은선 단순화 (Douglas–Peucker). pts [[a, o], ...] 정수 좌표, tol 같은 단위. keep: 꼭 남길 점 번호 집합
function simplify(pts, tol, keep) {
  const n = pts.length; if (n <= 2 || !(tol > 0)) return pts.map((_, i) => i);
  const use = new Uint8Array(n); use[0] = use[n - 1] = 1; if (keep) keep.forEach(i => { use[i] = 1; });
  const stack = []; let prev = 0;
  for (let i = 1; i < n; i++) if (use[i]) { stack.push([prev, i]); prev = i; }
  while (stack.length) {
    const [a, b] = stack.pop(); if (b - a < 2) continue;
    const ax = pts[a][1], ay = pts[a][0], bx = pts[b][1], by = pts[b][0], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][1] - ax, py = pts[i][0] - ay;
      let d;
      if (L2 === 0) d = Math.hypot(px, py);
      else { const t = Math.max(0, Math.min(1, (px * dx + py * dy) / L2)); d = Math.hypot(px - t * dx, py - t * dy); }
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { use[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (use[i]) out.push(i);
  return out;
}

// elements: Overpass 응답의 elements. tol: 단순화 허용 오차(m) { line, area, bldg }
export function packElements(elements, lat0, lng0, tol = {}) {
  const T = { line: 0.5, area: 1.5, bldg: 0.12, ...tol };
  const kLng = Math.cos(lat0 * Math.PI / 180); // 경도 1e-6도는 위도보다 짧다 → 오차 계산은 위도 단위(0.111m)로 맞춘다
  const U = 0.111; // 1e-6도(위도) ≈ 0.111m
  const tagsOf = (t) => { const o = {}; for (const k of TAGS) if (t[k] != null && t[k] !== '') o[k] = String(t[k]); return o; };
  // 차도 노드가 둘 이상의 길에 쓰이면 교차점 → 단순화해도 남긴다
  const useN = new Map();
  for (const el of elements) if (el.type === 'way' && el.tags && el.tags.highway && el.nodes) el.nodes.forEach(id => useN.set(id, (useN.get(id) || 0) + 1));
  const nodeMap = new Map(); let nn = 0;
  const nid = (id) => { let k = nodeMap.get(id); if (k == null) { k = nn++; nodeMap.set(id, k); } return k; };
  const quant = (g) => g.map(p => (p ? [Math.round((p.lat - lat0) * Q), Math.round((p.lon - lng0) * Q)] : null));
  const enc = (pts) => { const out = []; let pa = 0, po = 0; for (const [a, o] of pts) { out.push(a - pa, o - po); pa = a; po = o; } return out; };
  const forTol = (pts) => pts.map(([a, o]) => [a, o * kLng]);
  const out = [];
  for (const el of elements) {
    const t = el.tags || {};
    if (el.type === 'node') { if (el.lat == null) continue; out.push(['n', el.id, tagsOf(t), [Math.round((el.lat - lat0) * Q), Math.round((el.lon - lng0) * Q)]]); continue; }
    if (el.type === 'way') {
      if (!el.geometry) continue;
      const q0 = quant(el.geometry), ok = q0.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
      if (ok.length < 2) continue;
      const pts = ok.map(i => q0[i]);
      const isB = t.building && t.building !== 'no', isRoad = !!t.highway && !!el.nodes && el.nodes.length === el.geometry.length;
      const keep = isRoad ? ok.map((i, k) => (useN.get(el.nodes[i]) > 1 ? k : -1)).filter(k => k >= 0) : null;
      const idx = simplify(forTol(pts), (isB ? T.bldg : (t.highway || t.railway || t.waterway === 'stream' || t.waterway === 'canal') ? T.line : T.area) / U, keep);
      const g = enc(idx.map(k => pts[k])), tg = tagsOf(t);
      if (isB && tg.building === 'yes' && Object.keys(tg).length === 1) { out.push(['b', el.id, g]); continue; }
      const row = ['w', el.id, tg, g];
      if (isRoad) row.push(idx.map(k => nid(el.nodes[ok[k]])));
      out.push(row);
      continue;
    }
    if (el.type === 'relation') {
      const isB = t.building && t.building !== 'no';
      const mem = (el.members || []).filter(m => m.type === 'way' && m.geometry).map(m => {
        const pts = quant(m.geometry).filter(Boolean); if (pts.length < 2) return null;
        const idx = simplify(forTol(pts), (isB ? T.bldg : T.area) / U, null);
        return [m.role === 'inner' ? 1 : 0, enc(idx.map(k => pts[k]))];
      }).filter(Boolean);
      if (mem.length) out.push(['r', el.id, tagsOf(t), mem]);
    }
  }
  return out;
}

// 되풀기 → Overpass 응답 elements 모양 (geometry: [{ lat, lon }], nodes, members)
export function unpackElements(rows, lat0, lng0) {
  const dec = (g) => { const out = []; let a = 0, o = 0; for (let i = 0; i + 1 < g.length; i += 2) { a += g[i]; o += g[i + 1]; out.push({ lat: lat0 + a / Q, lon: lng0 + o / Q }); } return out; };
  const out = [];
  for (const r of rows || []) {
    const k = r[0];
    if (k === 'b') out.push({ type: 'way', id: r[1], tags: { building: 'yes' }, geometry: dec(r[2]) });
    else if (k === 'w') { const el = { type: 'way', id: r[1], tags: r[2] || {}, geometry: dec(r[3]) }; if (r[4]) el.nodes = r[4]; out.push(el); }
    else if (k === 'r') out.push({ type: 'relation', id: r[1], tags: r[2] || {}, members: (r[3] || []).map(([inner, g]) => ({ type: 'way', role: inner ? 'inner' : 'outer', geometry: dec(g) })) });
    else if (k === 'n') out.push({ type: 'node', id: r[1], tags: r[2] || {}, lat: lat0 + r[3][0] / Q, lon: lng0 + r[3][1] / Q });
  }
  return out;
}

// 담아 둔 지도 파일 한 개 → { feat: { elements }, bldg: { elements }, at }
export function unpackBundle(j) {
  if (!j || j.v !== PACK_VER || !isFinite(j.lat) || !isFinite(j.lng)) return null;
  return { feat: { elements: unpackElements(j.feat, j.lat, j.lng) }, bldg: { elements: unpackElements(j.bldg, j.lat, j.lng) }, at: j.at || '', lat: j.lat, lng: j.lng };
}
