// 실제 지도로 대지 맞추기(fitSite) · 대지 둘레 실측(mapFacts) · 대지 위치 보정(plan.off)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOSM } from '../src/sim/osm.js';
import { clearSite, inPoly, centroid } from '../src/sim/ctxmodel.js';
import { fitSite, mapFacts, streetAngle, condFromFacts } from '../src/sim/sitefit.js';
import { makePlan } from '../src/sim/plan.js';
import { siteFrom } from '../src/sim/sites.js';
import { makeGrid } from './helpers/osmgrid.js';

const base = { ...siteFrom('custom', { lat: 37.55, lng: 127.02, area: 40000, aspect: 1.5, rot: -9 }, 'housing') };
const rawOf = (th, o) => parseOSM(makeGrid(base.lat, base.lng, th, o).elements, base);
const inside = (plan, raw) => (raw.buildings || []).filter(b => { const [u, v] = plan.toSite(...centroid(b.ring)); const S = plan.SITE; return u > S.u0 + 2 && u < S.u1 - 2 && v > S.v0 + 2 && v < S.v1 - 2; }).length;

test('도로망 방향: 23° 기운 격자에서 23° 안팎을 찾는다', () => {
  const raw = rawOf(23);
  const sa = streetAngle(raw.roads, 450);
  assert.ok(sa && Math.abs(sa.rot - 23) <= 1.5, `rot ${sa && sa.rot}`);
  const sb = streetAngle(rawOf(-31).roads, 450);
  assert.ok(sb && Math.abs(sb.rot + 31) <= 1.5, `rot ${sb && sb.rot}`);
});

test('대지 맞춤: 도로 방향으로 돌리고, 건물을 깔고 앉지 않는 빈 터로 옮긴다', () => {
  const raw = rawOf(23, { emptyW: 3, emptyD: 3, offI: 0, offJ: 0 });
  const p0 = makePlan(base), n0 = inside(p0, raw);
  const f = fitSite(raw, base);
  assert.ok(f, '맞춤 결과가 있어야 한다');
  assert.ok(Math.abs(f.rot - 23) <= 1.5 && f.byRoads, `rot ${f.rot}`);
  const p1 = makePlan({ ...base, rot: f.rot, aspect: f.aspect, off: f.off });
  const n1 = inside(p1, raw);
  assert.ok(n0 >= 8, `맞추기 전에는 건물을 여럿 깔고 앉는다 (${n0})`);
  assert.ok(n1 <= 2, `맞춘 뒤에는 거의 없다 (${n1}, 이동 ${f.moved}m)`);
  assert.ok(f.moved <= 200);
});

test('대지 위치 보정: toWorld/toSite가 off만큼 옮겨지고 서로 역이다', () => {
  const p = makePlan({ ...base, rot: 17, off: [40, -25] });
  const o = p.toWorld(0, 0); assert.ok(Math.abs(o[0] - 40) < 1e-9 && Math.abs(o[1] + 25) < 1e-9);
  const w = p.toWorld(33, -12), s = p.toSite(w[0], w[1]);
  assert.ok(Math.abs(s[0] - 33) < 1e-9 && Math.abs(s[1] + 12) < 1e-9);
  assert.notEqual(makePlan({ ...base, rot: 17, off: [40, -25] }) === makePlan({ ...base, rot: 17 }), true);
});

test('대지 둘레 실측: 네 변마다 가장 가까운 것, 대로 쪽 변은 도로가 먼저', () => {
  const raw = rawOf(23, { emptyW: 3, emptyD: 3, offI: 0, offJ: 0 });
  const f = fitSite(raw, base), plan = makePlan({ ...base, rot: f.rot, aspect: f.aspect, off: f.off });
  const ctx = clearSite({ ...raw }, plan);
  // 대지 안에는 건물이 남지 않는다
  assert.equal(inside(plan, ctx), 0);
  const F = mapFacts(ctx, plan);
  assert.equal(F.rows.length, 4);
  assert.ok(F.road && F.road.rank >= 5 && F.road.name === '시험대로', JSON.stringify(F.road));
  assert.ok(F.adj != null && F.adj < 60, `가장 가까운 건물 ${F.adj}`);
  assert.ok(F.nB > 10);
  const c = condFromFacts({ adj: 12, noise: 'mid' }, F);
  assert.equal(c.adj, F.adj); assert.equal(c.fromMap, true);
});

test('빈 들판: 건물이 없으면 트인 땅으로 본다', () => {
  const raw = parseOSM([{ type: 'way', id: 1, nodes: [], geometry: [{ lat: base.lat + 0.004, lon: base.lng - 0.01 }, { lat: base.lat + 0.004, lon: base.lng + 0.01 }], tags: { highway: 'secondary' } }], base);
  const plan = makePlan(base), F = mapFacts(clearSite({ ...raw }, plan), plan);
  assert.equal(F.adj, null); assert.equal(F.openSides, 4);
  const c = condFromFacts({ adj: 12, noise: 'high' }, F);
  assert.equal(c.adjOpen, true); assert.equal(c.noise, 'low'); assert.ok(c.adj >= 100);
  void inPoly;
});
