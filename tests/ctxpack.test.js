// 사이트에 담아 두는 주변 지도 형식: 담았다 되푼 지도가 원본과 같은 맥락을 만드는지
import test from 'node:test';
import assert from 'node:assert/strict';
import { packElements, unpackElements, unpackBundle, PACK_VER } from '../src/sim/ctxpack.js';
import { parseOSM } from '../src/sim/osm.js';

const LAT = 37.5, LNG = 127.0, site = { id: 't', lat: LAT, lng: LNG, ground: 15 };
const M = 1 / 111000; // 위도 1m
const ll = (x, z) => ({ lat: LAT - z * M, lon: LNG + x * M / Math.cos(LAT * Math.PI / 180) });
const ring = (pts) => [...pts, pts[0]].map(([x, z]) => ll(x, z));
const curve = (n, f) => Array.from({ length: n }, (_, i) => ll(...f(i / (n - 1))));
function sample() {
  const els = [];
  // 건물: 태그 없는 것 · 층수와 이름이 있는 것 · 중정이 있는 것(관계)
  els.push({ type: 'way', id: 101, tags: { building: 'yes' }, geometry: ring([[40, 40], [70, 40], [70, 60], [40, 60]]) });
  els.push({ type: 'way', id: 102, tags: { building: 'apartments', 'building:levels': '25', name: '시험아파트', 'addr:street': '버릴 태그' }, geometry: ring([[-120, 30], [-60, 30], [-60, 45], [-120, 45]]) });
  els.push({ type: 'relation', id: 103, tags: { type: 'multipolygon', building: 'commercial', height: '48' }, members: [
    { type: 'way', role: 'outer', geometry: ring([[100, -100], [180, -100], [180, -40], [100, -40]]) },
    { type: 'way', role: 'inner', geometry: ring([[120, -85], [160, -85], [160, -55], [120, -55]]) }] });
  // 길: 굽은 큰길과 그것을 가로지르는 길 (같은 노드를 함께 쓴다 → 교차점), 다리
  const a = curve(41, (t) => [-400 + 800 * t, -200 + 30 * Math.sin(t * 6)]), an = a.map((_, i) => 1000 + i);
  els.push({ type: 'way', id: 201, tags: { highway: 'primary', name: '시험대로', lanes: '6' }, geometry: a, nodes: an });
  const mid = a[20];
  els.push({ type: 'way', id: 202, tags: { highway: 'secondary', name: '시험로' }, geometry: [ll(0, -500), mid, ll(0, 300)], nodes: [2001, an[20], 2003] });
  els.push({ type: 'way', id: 203, tags: { highway: 'tertiary' }, geometry: [ll(300, -500), a[35], ll(300, 300)], nodes: [2004, an[35], 2006] });
  els.push({ type: 'way', id: 204, tags: { highway: 'residential', bridge: 'yes', layer: '1' }, geometry: [ll(-300, 100), ll(-300, 400)], nodes: [2007, 2008] });
  els.push({ type: 'way', id: 205, tags: { railway: 'rail' }, geometry: curve(30, (t) => [-600 + 1200 * t, 250 + 10 * Math.cos(t * 5)]) });
  // 물(구멍 있는 관계) · 공원 · 봉우리
  els.push({ type: 'relation', id: 301, tags: { natural: 'water', name: '시험강' }, members: [
    { type: 'way', role: 'outer', geometry: curve(30, (t) => [-900 + 1800 * t, 500 + 20 * Math.sin(t * 9)]) },
    { type: 'way', role: 'outer', geometry: [ll(900, 500 + 20 * Math.sin(9)), ll(900, 800), ll(-900, 800), ll(-900, 500)] },
    { type: 'way', role: 'inner', geometry: ring([[-50, 600], [50, 600], [50, 650], [-50, 650]]) }] });
  els.push({ type: 'way', id: 302, tags: { leisure: 'park', name: '시험공원' }, geometry: ring([[200, 100], [420, 100], [420, 260], [200, 260]]) });
  els.push({ type: 'node', id: 401, tags: { natural: 'peak', ele: '420', name: '시험산' }, ...ll(1500, -2500) });
  return els;
}

test('주변 지도 담기: 되푼 지도가 원본과 같은 건물·길·물·녹지·교차점을 만든다', () => {
  const els = sample(), packed = packElements(els, LAT, LNG), back = unpackElements(JSON.parse(JSON.stringify(packed)), LAT, LNG);
  const A = parseOSM(els, site), B = parseOSM(back, site);
  assert.equal(B.buildings.length, A.buildings.length);
  A.buildings.forEach((b, i) => {
    const c = B.buildings[i];
    assert.equal(c.ring.length, b.ring.length); assert.equal(c.kind, b.kind); assert.equal(c.levels, b.levels); assert.equal(c.name, b.name); assert.equal(c.holes.length, b.holes.length);
    assert.ok(Math.abs(c.h - b.h) < 1e-9, 'height');
    b.ring.forEach((p, k) => assert.ok(Math.hypot(p[0] - c.ring[k][0], p[1] - c.ring[k][1]) < 0.25, `bldg ${i} pt ${k}`));
  });
  assert.equal(B.roads.length, A.roads.length);
  A.roads.forEach((r, i) => { const s = B.roads[i]; assert.equal(s.name, r.name); assert.equal(s.kind, r.kind); assert.equal(s.lanes, r.lanes); assert.equal(s.bridge, r.bridge); assert.ok(s.pts.length <= r.pts.length && s.pts.length >= 2);
    // 단순화한 길은 원래 길에서 0.7m 안에 있다
    const dist = (p, q, w) => { const dx = w[0] - q[0], dz = w[1] - q[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dz) / L2)); return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dz); };
    r.pts.forEach(p => { let m = Infinity; for (let k = 0; k + 1 < s.pts.length; k++) m = Math.min(m, dist(p, s.pts[k], s.pts[k + 1])); assert.ok(m < 0.7, `road ${i} off by ${m.toFixed(2)}m`); });
  });
  assert.equal(B.crossings.length, A.crossings.length); assert.ok(A.crossings.length >= 2);
  A.crossings.forEach((x, i) => assert.ok(Math.hypot(x.x - B.crossings[i].x, x.z - B.crossings[i].z) < 0.25));
  assert.equal(B.rails.length, A.rails.length); assert.equal(B.water.length, A.water.length); assert.equal(B.water[0].holes.length, 1); assert.equal(B.green.length, A.green.length);
  assert.equal(B.peaks.length, 1); assert.ok(Math.abs(B.peaks[0].h - A.peaks[0].h) < 1e-9);
  assert.deepEqual(B.labels.map(l => l.text).sort(), A.labels.map(l => l.text).sort());
});

test('주변 지도 담기: 해석에 쓰지 않는 태그는 버리고, 굽은 길은 점을 줄이며, 원본보다 훨씬 작다', () => {
  const els = sample(), packed = packElements(els, LAT, LNG), s0 = JSON.stringify(els).length, s1 = JSON.stringify(packed).length;
  assert.ok(s1 < s0 * 0.35, `${s1} / ${s0}`);
  assert.ok(!JSON.stringify(packed).includes('버릴 태그'));
  const plain = packed.find(r => r[1] === 101); assert.equal(plain[0], 'b'); assert.equal(plain.length, 3);
  const road = packed.find(r => r[1] === 201); assert.ok(road[3].length / 2 < 41 && road[3].length / 2 >= 3); assert.equal(road[4].length, road[3].length / 2);
  // 묶음 파일 모양
  const b = unpackBundle({ v: PACK_VER, id: 't', lat: LAT, lng: LNG, at: '2026-11-20', feat: packed.filter(r => r[0] !== 'b'), bldg: packed.filter(r => r[0] === 'b') });
  assert.equal(b.bldg.elements.length, 1); assert.ok(b.feat.elements.length >= 8); assert.equal(b.at, '2026-11-20');
  assert.equal(unpackBundle({ v: 99 }), null); assert.equal(unpackBundle(null), null);
});

// ---------- 사이트에 담아 둔 지도 (public/ctx) ----------
import { readFileSync, existsSync } from 'node:fs';
import { SITE_IDS, ALL_SITE_IDS, siteFrom } from '../src/sim/sites.js';
const CTX = new URL('../public/ctx/', import.meta.url);

test('담아 둔 지도: 후보지마다 파일이 있고 좌표가 지금 후보지 좌표와 같다', () => {
  assert.ok(existsSync(new URL('index.json', CTX)), 'public/ctx/index.json 없음 (scripts/fetch-ctx.mjs)');
  const idx = JSON.parse(readFileSync(new URL('index.json', CTX), 'utf8'));
  assert.equal(idx.v, PACK_VER);
  const ids = [...new Set([...SITE_IDS, ...ALL_SITE_IDS])];
  const missing = ids.filter(id => !idx.ids.includes(id));
  assert.ok(missing.length <= ids.length * 0.05, `담기지 않은 후보지 ${missing.length}곳: ${missing.slice(0, 8).join(', ')}`);
  for (const id of idx.ids) {
    const s = siteFrom(id, {}, 'housing'), j = JSON.parse(readFileSync(new URL(id + '.json', CTX), 'utf8'));
    assert.ok(s, `후보지 목록에 없는 지도 ${id}`);
    assert.ok(Math.abs(j.lat - s.lat) < 2e-4 && Math.abs(j.lng - s.lng) < 2e-4, `${id}: 지도 좌표(${j.lat}, ${j.lng})가 후보지 좌표(${s.lat}, ${s.lng})와 다르다. 지도를 다시 뽑아야 한다`);
  }
});

test('담아 둔 지도: 용산은 실제 건물·도로·한강·철도가 들어 있다', () => {
  const s = siteFrom('yongsan', {}, 'housing'), b = unpackBundle(JSON.parse(readFileSync(new URL('yongsan.json', CTX), 'utf8')));
  const c = parseOSM([...b.feat.elements, ...b.bldg.elements], s);
  assert.equal(c.source, 'osm');
  assert.ok(c.buildings.length > 300 && c.roads.length > 200 && c.rails.length > 10, `건물 ${c.buildings.length} 도로 ${c.roads.length} 철도 ${c.rails.length}`);
  assert.ok(c.water.some(w => /한강/.test(w.name || '')) || c.water.length > 3, '한강이 없다');
  assert.ok(Math.max(...c.buildings.map(x => x.h)) > 80, '고층 건물 높이가 없다');
});
