// OpenStreetMap(Overpass API)에서 택지 주변 실제 지도를 받아 맥락 모델로 바꾼다.
// 브라우저에서 바로 요청한다(CORS 허용). 한 번 받은 지도는 브라우저(IndexedDB)에 저장해 다시 쓴다.
// 지도 데이터 © OpenStreetMap contributors (ODbL)
import { emptyCtx, ROAD_CLASS, rng, hashStr, centroid, ringArea, inPoly } from './ctxmodel.js';
import { llToXZ } from './sites.js';

export const OSM_ATTRIB = '지도 © OpenStreetMap contributors';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const VER = 'v2';

export function queries(lat, lng, R = {}) {
  const r = { bldg: 1000, major: 2300, minor: 1200, area: 2700, rail: 2300, peak: 8000, ...R };
  const A = (rad) => `(around:${rad},${lat.toFixed(6)},${lng.toFixed(6)})`;
  const feat = `[out:json][timeout:90];(
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]${A(r.major)};
way["highway"~"^(unclassified|residential|living_street|pedestrian|service)$"]${A(r.minor)};
way["railway"~"^(rail|light_rail|subway)$"]${A(r.rail)};
way["natural"="water"]${A(r.area)};relation["natural"="water"]${A(r.area)};
way["waterway"="riverbank"]${A(r.area)};relation["waterway"="riverbank"]${A(r.area)};
way["waterway"~"^(stream|canal)$"]${A(r.area)};
way["leisure"~"^(park|garden|golf_course|pitch|playground)$"]${A(r.area)};relation["leisure"~"^(park|golf_course)$"]${A(r.area)};
way["landuse"~"^(forest|grass|recreation_ground|meadow|cemetery|village_green)$"]${A(r.area)};relation["landuse"~"^(forest|grass)$"]${A(r.area)};
way["natural"~"^(wood|scrub|grassland)$"]${A(r.area)};relation["natural"="wood"]${A(r.area)};
node["natural"="peak"]${A(r.peak)};
);out geom qt;`;
  const bldg = `[out:json][timeout:90];(way["building"]${A(r.bldg)};relation["building"]${A(r.bldg)};);out geom qt;`;
  return { feat, bldg };
}

// ---------- 저장소 ----------
function idb() {
  return new Promise((res, rej) => {
    try {
      const rq = indexedDB.open('bim-sim-osm', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('q');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    } catch (e) { rej(e); }
  });
}
async function cacheGet(key) {
  try { const db = await idb(); return await new Promise((res) => { const t = db.transaction('q').objectStore('q').get(key); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); }); }
  catch (e) { return null; }
}
async function cachePut(key, val) {
  try { const db = await idb(); await new Promise((res) => { const t = db.transaction('q', 'readwrite'); t.objectStore('q').put(val, key); t.oncomplete = res; t.onerror = res; }); }
  catch (e) { /* 저장 실패는 무시 */ }
}

async function overpass(q, signal) {
  let lastErr = null;
  for (const url of ENDPOINTS) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 95000);
      if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
      const j = await r.json();
      if (!j || !Array.isArray(j.elements)) { lastErr = new Error('형식 오류'); continue; }
      return j;
    } catch (e) { lastErr = e; if (signal && signal.aborted) throw e; }
  }
  throw lastErr || new Error('지도 서버에 연결하지 못했습니다');
}

// 지도 받기: onStep(단계 문구)로 진행 표시. 실패하면 예외
export async function loadOSM(site, { onStep, signal, cacheOnly = false } = {}) {
  const { feat, bldg } = queries(site.lat, site.lng);
  const key = (k) => `${VER}:${site.lat.toFixed(5)},${site.lng.toFixed(5)}:${k}`;
  let jf = await cacheGet(key('feat')), jb = await cacheGet(key('bldg'));
  const cached = !!(jf && jb);
  if (cacheOnly && !cached) throw new Error('저장된 지도 없음');
  if (!jf) { onStep && onStep('도로·하천·녹지 받는 중'); jf = await overpass(feat, signal); cachePut(key('feat'), jf); }
  if (!jb) { onStep && onStep('건물 받는 중'); jb = await overpass(bldg, signal); cachePut(key('bldg'), jb); }
  onStep && onStep('3D로 바꾸는 중');
  const ctx = parseOSM([...(jf.elements || []), ...(jb.elements || [])], site);
  ctx.cached = cached;
  return ctx;
}

// ---------- 해석 ----------
const num = (s) => { if (s == null) return NaN; const m = String(s).replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const isBridge = (t) => t.bridge && t.bridge !== 'no';
const isTunnel = (t) => (t.tunnel && t.tunnel !== 'no') || t.covered === 'yes' || (num(t.layer) < 0 && !isBridge(t));

// 다각형 조각들을 이어 고리로 (끝점이 같은 조각끼리)
export function assembleRings(segs) {
  const k = (p) => p[0].toFixed(2) + ',' + p[1].toFixed(2);
  const left = segs.filter(s => s.length > 1).map(s => s.slice());
  const rings = [];
  while (left.length) {
    let ring = left.shift();
    let guard = 0;
    while (k(ring[0]) !== k(ring[ring.length - 1]) && guard++ < 5000) {
      const end = k(ring[ring.length - 1]);
      let idx = left.findIndex(s => k(s[0]) === end), rev = false;
      if (idx < 0) { idx = left.findIndex(s => k(s[s.length - 1]) === end); rev = true; }
      if (idx < 0) break;
      const s = left.splice(idx, 1)[0];
      ring = ring.concat((rev ? s.slice().reverse() : s).slice(1));
    }
    if (ring.length >= 4) { if (k(ring[0]) === k(ring[ring.length - 1])) ring.pop(); rings.push(ring); }
  }
  return rings;
}
// 볼록 사각형(축 정렬)으로 다각형 자르기 (Sutherland–Hodgman)
export function clipRing(ring, B) {
  let out = ring;
  const edges = [[(p) => p[0] >= -B, (a, b) => { const t = (-B - a[0]) / (b[0] - a[0]); return [-B, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[0] <= B, (a, b) => { const t = (B - a[0]) / (b[0] - a[0]); return [B, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[1] >= -B, (a, b) => { const t = (-B - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), -B]; }],
    [(p) => p[1] <= B, (a, b) => { const t = (B - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), B]; }]];
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      if (inside(a)) { out.push(a); if (!inside(b)) out.push(cut(a, b)); }
      else if (inside(b)) out.push(cut(a, b));
    }
    if (out.length < 3) return [];
  }
  return out;
}

const BUILD_KIND = (t, levels, h) => {
  const b = t.building;
  if (/^(apartments|dormitory)$/.test(b)) return levels >= 5 || h >= 15 ? 'res' : 'house';
  if (/^(house|detached|semidetached_house|terrace|residential|bungalow|hut|cabin)$/.test(b)) return levels >= 6 || h >= 18 ? 'res' : 'house';
  if (/^(industrial|warehouse|factory|manufacture|shed|garage|garages|hangar|storage_tank)$/.test(b)) return 'ind';
  if (/^(school|university|college|kindergarten|hospital|public|government|civic|church|temple|cathedral|mosque|train_station|transportation|stadium|sports_hall)$/.test(b)) return 'civic';
  if (h >= 90) return 'tower';
  if (/^(commercial|office|retail|hotel|mall|supermarket)$/.test(b)) return 'com';
  return levels >= 5 || h >= 15 ? 'com' : 'house';
};
// 높이 없을 때 추정 (유형·바닥면적, 건물 번호로 흔들기)
function guessLevels(t, area, R) {
  const b = t.building;
  if (/^(apartments)$/.test(b)) return Math.round(12 + R() * 12);
  if (/^(house|detached|semidetached_house|terrace|bungalow|hut|cabin|shed|garage|garages)$/.test(b)) return Math.round(1 + R() * 2);
  if (/^(residential)$/.test(b)) return area > 500 ? Math.round(10 + R() * 12) : Math.round(2 + R() * 3);
  if (/^(industrial|warehouse|factory|manufacture|hangar)$/.test(b)) return Math.round(1 + R() * 3);
  if (/^(school|university|college|kindergarten)$/.test(b)) return Math.round(3 + R() * 2);
  if (/^(church|temple|cathedral)$/.test(b)) return 2;
  if (area < 150) return Math.round(2 + R() * 2);
  if (area < 500) return Math.round(3 + R() * 4);
  if (area < 1500) return Math.round(5 + R() * 7);
  return Math.round(8 + R() * 12);
}
const GREEN_KIND = (t) => (t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub') ? 'forest'
  : t.leisure === 'golf_course' ? 'golf' : (t.leisure === 'park' || t.leisure === 'garden') ? 'park' : t.leisure === 'pitch' || t.leisure === 'playground' ? 'pitch' : 'grass';

export function parseOSM(elements, site) {
  const ctx = emptyCtx('osm');
  const lat0 = site.lat, lng0 = site.lng, ground = site.ground || 15;
  const P = (g) => llToXZ(lat0, lng0, g.lat, g.lon);
  const BOUND = 3600;
  const nodeUse = new Map(); // 교차점 찾기: 차도 노드 사용 횟수
  const roadsTmp = [];
  for (const el of elements) {
    const t = el.tags || {};
    if (el.type === 'node') {
      if (t.natural === 'peak' && t.ele) {
        const ele = num(t.ele), [x, z] = P(el);
        const h = ele - ground;
        if (h > 60) ctx.peaks.push({ x, z, h, r: Math.max(300, h * 2.5), name: t['name:ko'] || t.name || '' });
      }
      continue;
    }
    // 고리(닫힌 선) 또는 조각들
    let rings = null;
    const wayPts = el.type === 'way' && el.geometry ? el.geometry.filter(Boolean).map(P) : null;
    const asArea = () => {
      if (rings) return rings;
      if (el.type === 'way') {
        if (!wayPts || wayPts.length < 4) return (rings = { outer: [], inner: [] });
        const closed = el.nodes ? el.nodes[0] === el.nodes[el.nodes.length - 1] : (Math.hypot(wayPts[0][0] - wayPts[wayPts.length - 1][0], wayPts[0][1] - wayPts[wayPts.length - 1][1]) < 0.05);
        if (!closed) return (rings = { outer: [], inner: [] });
        return (rings = { outer: [wayPts.slice(0, -1)], inner: [] });
      }
      const mem = (el.members || []).filter(m => m.type === 'way' && m.geometry);
      const outer = assembleRings(mem.filter(m => m.role !== 'inner').map(m => m.geometry.filter(Boolean).map(P)));
      const inner = assembleRings(mem.filter(m => m.role === 'inner').map(m => m.geometry.filter(Boolean).map(P)));
      return (rings = { outer, inner });
    };
    if (t.building && t.building !== 'no') {
      const { outer, inner } = asArea();
      outer.forEach(ring => {
        const area = Math.abs(ringArea(ring));
        if (area < 12) return;
        const c = centroid(ring);
        if (Math.hypot(c[0], c[1]) > BOUND) return;
        const R = rng(hashStr(String(el.id)));
        let h = num(t.height), levels = num(t['building:levels']);
        if (!isFinite(levels) && isFinite(h)) levels = Math.max(1, Math.round(h / 3.2));
        if (!isFinite(levels)) levels = guessLevels(t, area, R);
        const kind0 = BUILD_KIND(t, levels, isFinite(h) ? h : 0);
        if (!isFinite(h)) h = levels * (kind0 === 'res' || kind0 === 'house' ? 2.95 : 3.8) + (kind0 === 'house' ? 1.2 : 0.6);
        const kind = BUILD_KIND(t, levels, h);
        const holes = inner.filter(r => inPoly(r[0][0], r[0][1], ring));
        ctx.buildings.push({ ring, holes, h: Math.min(h, 620), base: 0, kind, levels, name: t['name:ko'] || t.name || '', id: el.id });
      });
      continue;
    }
    if (t.highway && el.type === 'way' && wayPts && wayPts.length > 1) {
      if (isTunnel(t) || t.area === 'yes') continue;
      if (t.highway === 'service' && /^(parking_aisle|driveway|drive-through)$/.test(t.service || '')) continue;
      let kind = t.highway.endsWith('_link') ? 'link' : t.highway;
      const C = ROAD_CLASS[kind]; if (!C) continue;
      const oneway = t.oneway === 'yes' || t.oneway === '1' || kind === 'motorway' || t.junction === 'roundabout';
      let lanes = parseInt(t.lanes, 10);
      if (!(lanes > 0)) lanes = oneway && C.lanes >= 4 ? Math.round(C.lanes / 2) : C.lanes;
      let w = num(t.width);
      if (!(w >= 3 && w <= 70)) w = lanes * C.lw;
      const r = { pts: wayPts, w, lanes, kind, oneway, sw: C.sw, bridge: isBridge(t), name: t['name:ko'] || t.name || '', nodes: el.nodes || null, rank: C.rank, layer: num(t.layer) || 0 };
      roadsTmp.push(r);
      if (el.nodes && C.rank >= 2) el.nodes.forEach((id, i) => { const e = nodeUse.get(id) || []; e.push([roadsTmp.length - 1, i]); nodeUse.set(id, e); });
      continue;
    }
    if (t.railway && el.type === 'way' && wayPts && wayPts.length > 1) {
      if (isTunnel(t)) continue;
      ctx.rails.push({ pts: wayPts, bridge: isBridge(t), kind: t.railway });
      continue;
    }
    if ((t.waterway === 'stream' || t.waterway === 'canal') && el.type === 'way' && wayPts && !isTunnel(t)) {
      ctx.streams.push({ pts: wayPts, w: Math.min(30, num(t.width) || (t.waterway === 'canal' ? 10 : 6)), name: t.name || '' });
      continue;
    }
    const isWater = t.natural === 'water' || t.waterway === 'riverbank';
    const isGreen = /^(park|garden|golf_course|pitch|playground)$/.test(t.leisure || '') || /^(forest|grass|recreation_ground|meadow|cemetery|village_green)$/.test(t.landuse || '') || /^(wood|scrub|grassland)$/.test(t.natural || '');
    if (isWater || isGreen) {
      const { outer, inner } = asArea();
      outer.forEach(ring => {
        const cl = clipRing(ring, BOUND); if (cl.length < 3) return;
        const holes = inner.filter(r => inPoly(r[0][0], r[0][1], ring)).map(r => clipRing(r, BOUND)).filter(r => r.length >= 3);
        if (isWater) ctx.water.push({ outer: cl, holes, name: t['name:ko'] || t.name || '' });
        else ctx.green.push({ outer: cl, holes, kind: GREEN_KIND(t), name: t['name:ko'] || t.name || '' });
      });
    }
  }
  // 교차점: 차도 노드가 두 길 이상에서 쓰이면, 각 길의 진행 방향(교차점에서 나가는 방향)을 모은다
  ctx.roads = roadsTmp;
  const xs = [];
  nodeUse.forEach((list) => {
    if (list.length < 2) return;
    const arms = [];
    let pos = null;
    list.forEach(([ri, i]) => {
      const r = roadsTmp[ri]; pos = r.pts[i];
      [i - 1, i + 1].forEach(j => { if (j < 0 || j >= r.pts.length) return; const q = r.pts[j]; const L = Math.hypot(q[0] - pos[0], q[1] - pos[1]) || 1; arms.push({ dx: (q[0] - pos[0]) / L, dz: (q[1] - pos[1]) / L, w: r.w, rank: r.rank, len: L, bridge: r.bridge }); });
    });
    if (arms.length >= 3 && !arms.some(a => a.bridge)) xs.push({ x: pos[0], z: pos[1], arms });
  });
  ctx.crossings = xs;
  labelOSM(ctx);
  return ctx;
}

function labelOSM(ctx) {
  const L = [];
  // 가장 큰 수면 이름
  const named = ctx.water.filter(w => w.name).map(w => ({ w, a: Math.abs(ringArea(w.outer)) })).sort((a, b) => b.a - a.a);
  const seenW = new Set();
  named.slice(0, 4).forEach(({ w }) => {
    if (seenW.has(w.name)) return; seenW.add(w.name);
    const near = w.outer.filter(p => Math.hypot(p[0], p[1]) < 1500);
    const c = near.length > 3 ? centroid(near) : centroid(w.outer);
    if (inPoly(c[0], c[1], w.outer)) L.push({ x: c[0], y: 0, z: c[1], text: w.name, cls: 'water' });
  });
  // 큰 길 이름 (중복 제외, 가까운 순)
  const seen = new Set();
  ctx.roads.filter(r => r.name && r.rank >= 6 && !r.bridge).map(r => { const m = r.pts[Math.floor(r.pts.length / 2)]; return { r, m, d: Math.hypot(m[0], m[1]) }; })
    .sort((a, b) => a.d - b.d).forEach(({ r, m, d }) => { if (seen.has(r.name) || d > 1300 || seen.size >= 6) return; seen.add(r.name); L.push({ x: m[0], y: 2, z: m[1], text: r.name, cls: 'far' }); });
  ctx.roads.filter(r => r.name && r.bridge && r.rank >= 6).forEach(r => { if (seen.has(r.name)) return; seen.add(r.name); const m = r.pts[Math.floor(r.pts.length / 2)]; if (Math.hypot(m[0], m[1]) < 2400) L.push({ x: m[0], y: 12, z: m[1], text: r.name, cls: 'far' }); });
  // 공원·산
  ctx.green.filter(g => g.name && g.kind !== 'pitch').map(g => ({ g, a: Math.abs(ringArea(g.outer)), c: centroid(g.outer) })).filter(x => x.a > 40000 && Math.hypot(x.c[0], x.c[1]) < 1800)
    .sort((a, b) => b.a - a.a).slice(0, 4).forEach(({ g, c }) => L.push({ x: c[0], y: 4, z: c[1], text: g.name, cls: 'far' }));
  ctx.peaks.filter(p => p.name).forEach(p => L.push({ x: p.x, y: p.h, z: p.z, text: p.name, cls: 'far' }));
  ctx.buildings.filter(b => b.name && b.h > 110).sort((a, b) => b.h - a.h).slice(0, 4).forEach(b => { const c = centroid(b.ring); L.push({ x: c[0], y: b.h, z: c[1], text: b.name, cls: 'far' }); });
  ctx.labels = L;
}
