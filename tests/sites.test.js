// 택지를 바꿔도 2~5단계가 모두 돌아가는지, 지도 해석과 세부 공정이 맞는지 검사
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS as MASS_D, generate } from '../src/sim/massing.js';
import { quantities } from '../src/sim/quantities.js';
import { schedule, PHASES } from '../src/sim/process.js';
import { estimate } from '../src/sim/cost.js';
import { SITE_IDS, resolveSite, xzToLL } from '../src/sim/sites.js';
import { paramsForSite } from '../src/store.js';
import { fallbackFor } from '../src/sim/ctxload.js';
import { inPoly } from '../src/sim/ctxmodel.js';
import { parseOSM, assembleCoast } from '../src/sim/osm.js';
import { findCrossings } from '../src/sim/scene/context3d.js';

const run = (sel) => {
  const site = resolveSite(sel);
  const gen = generate({ ...paramsForSite(site, MASS_D), site });
  const Q = quantities(gen), S = schedule(gen, Q, {}), E = estimate(gen, Q, S, {});
  return { site, gen, S, E };
};

for (const id of [...SITE_IDS, 'custom']) {
  test(`택지 ${id}: 배치 → 공정 → 예산이 이어지고 주변 건물이 대지를 비운다`, () => {
    const { site, gen, S, E } = run({ id });
    assert.equal(gen.plan.site.id, site.id);
    assert.ok(gen.bldgs.length > 0 && gen.totals.units > 0, `${gen.bldgs.length}동 ${gen.totals.units}호`);
    assert.ok(S.end > 0 && E.total > 0);
    const ctx = fallbackFor(gen.plan);
    assert.ok(ctx.buildings.length > 50, `주변 건물 ${ctx.buildings.length}`);
    // 대지 경계 안에는 주변 건물이 남지 않는다 (네 모서리 안쪽 점으로 확인)
    const P = gen.plan, c = P.toWorld((P.SITE.u0 + P.SITE.u1) / 2, (P.SITE.v0 + P.SITE.v1) / 2);
    assert.ok(!ctx.buildings.some(b => inPoly(c[0], c[1], b.ring)), '대지 한가운데에 주변 건물');
  });
}

test('직접 입력한 택지: 면적·최고 층수가 배치에 반영된다', () => {
  const small = run({ id: 'custom', area: 60000, maxFloors: 15 });
  const big = run({ id: 'custom', area: 200000, maxFloors: 40 });
  assert.ok(Math.max(...small.gen.bldgs.map(b => b.storeys)) <= 16);
  assert.ok(big.gen.totals.units > small.gen.totals.units);
});

test('세부 공정: 단계 순서와 정점 시각', () => {
  const { S } = run({ id: 'yongsan' });
  assert.deepEqual(S.phases.map(p => p.key), PHASES.map(p => p.key));
  for (const p of S.phases) if (p.n) assert.ok(p.start <= p.peak && p.peak <= p.end, p.key);
  const at = (k) => S.phases.find(p => p.key === k).start;
  assert.ok(at('wall') <= at('earth') && at('earth') <= at('found') && at('found') <= at('struct'));
  // 한 층은 거푸집 → 골조 → 설비 → 창호 → 마감 → 준공 순서로만 바뀐다
  for (const [bi, r] of [...S.blds].slice(0, 6)) {
    for (const fi of r.floors.filter((_, i) => i % 5 === 0)) {
      let prev = 0;
      for (let t = 0; t <= S.end + 5; t += 15) { const s = S.stateAt(t)(bi, fi); assert.ok(s >= prev, `${bi}/${fi} ${prev}→${s}`); prev = s; }
      assert.equal(prev, 6);
    }
  }
});

test('지도(OSM) 해석: 건물 높이, 도로 차선, 수면, 교차로', () => {
  const site = resolveSite({ id: 'yongsan' });
  const ll = (x, z) => { const [lat, lon] = xzToLL(site.lat, site.lng, x, z); return { lat, lon }; };
  const sq = (x, z, s) => [ll(x, z), ll(x + s, z), ll(x + s, z + s), ll(x, z + s), ll(x, z)];
  const els = [
    { type: 'way', id: 1, tags: { building: 'apartments', 'building:levels': '20' }, nodes: [1, 2, 3, 4, 1], geometry: sq(400, 400, 30) },
    { type: 'way', id: 2, tags: { building: 'yes', height: '42' }, nodes: [5, 6, 7, 8, 5], geometry: sq(-500, 300, 25) },
    { type: 'way', id: 3, tags: { highway: 'primary', lanes: '6', name: '가로' }, nodes: [10, 11, 12], geometry: [ll(-800, 600), ll(0, 600), ll(800, 600)] },
    { type: 'way', id: 4, tags: { highway: 'secondary', name: '세로' }, nodes: [13, 11, 14], geometry: [ll(0, 200), ll(0, 600), ll(0, 1000)] },
    { type: 'way', id: 5, tags: { natural: 'water', name: '한강' }, nodes: [20, 21, 22, 23, 20], geometry: [ll(-2000, 1500), ll(2000, 1500), ll(2000, 2200), ll(-2000, 2200), ll(-2000, 1500)] },
  ];
  const ctx = parseOSM(els, site);
  assert.equal(ctx.buildings.length, 2);
  const apt = ctx.buildings.find(b => b.levels === 20);
  assert.ok(apt && apt.kind === 'res' && Math.abs(apt.h - 20 * 2.95) < 3, JSON.stringify(apt && { h: apt.h, kind: apt.kind }));
  assert.ok(ctx.buildings.some(b => Math.abs(b.h - 42) < 0.01));
  const pr = ctx.roads.find(r => r.name === '가로');
  assert.ok(pr && pr.lanes === 6 && pr.rank >= 5);
  assert.equal(ctx.water.length, 1);
  assert.ok(ctx.labels.some(l => l.text === '한강'));
  assert.ok(ctx.crossings.length >= 1, '공유 노드에서 교차로를 찾는다');
  // 노드 번호가 없는 도로(자동 생성 맥락)는 선분 교차로 찾는다
  const cr = findCrossings([
    { pts: [[-300, 0], [300, 0]], w: 20, rank: 5 },
    { pts: [[0, -300], [0, 300]], w: 14, rank: 4 },
  ]);
  assert.ok(cr.length === 1 && Math.abs(cr[0].x) < 1 && Math.abs(cr[0].z) < 1, JSON.stringify(cr));
});

test('해안선 → 바다 다각형: 왼쪽 육지, 섬은 구멍, 만(灣)', () => {
  const B = 3600;
  const isle = Array.from({ length: 25 }, (_, i) => { const a = i / 24 * Math.PI * 2; return [300 * Math.cos(a), 2000 - 300 * Math.sin(a)]; });
  // 서→동으로 가는 해안선(z = 1200 근처, 두 조각) → 남쪽(z > 1200)이 바다
  const seas = assembleCoast([[[-6000, 1150], [0, 1250]], [[0, 1250], [6000, 1180]], isle], B);
  assert.equal(seas.length, 1);
  const inSea = (x, z) => seas.some(w => inPoly(x, z, w.outer) && !w.holes.some(h => inPoly(x, z, h)));
  assert.ok(!inSea(0, 0) && !inSea(-3000, 1000), '육지');
  assert.ok(inSea(0, 3000) && inSea(-3500, 1500) && inSea(3500, 3500), '바다');
  assert.ok(!inSea(0, 2000) && seas[0].holes.length === 1, '섬');
  // 만: 남쪽 변으로 들어와 북쪽으로 파고들었다가 다시 남쪽 변으로 나간다 (동→서로 돌아 나오므로 안쪽이 바다)
  const bay = assembleCoast([[[1500, 5000], [1500, 0], [-1500, 0], [-1500, 5000]].reverse()], B);
  const inBay = (x, z) => bay.some(w => inPoly(x, z, w.outer));
  assert.equal(bay.length, 1);
  assert.ok(inBay(0, 2000) && !inBay(2500, 2000) && !inBay(0, -1000), JSON.stringify(bay[0].outer));
  // 지도 해석에 붙어 수면으로 들어가고 '바다' 이름표가 생긴다
  const site = resolveSite({ id: 'yongsan' });
  const ll = (x, z) => { const [lat, lon] = xzToLL(site.lat, site.lng, x, z); return { lat, lon }; };
  const ctx = parseOSM([{ type: 'way', id: 9, tags: { natural: 'coastline' }, nodes: [1, 2, 3], geometry: [ll(-6000, 900), ll(0, 950), ll(6000, 900)] }], site);
  assert.ok(ctx.water.length === 1 && ctx.water[0].sea && inPoly(0, 2000, ctx.water[0].outer) && !inPoly(0, 0, ctx.water[0].outer));
  assert.ok(ctx.labels.some(l => l.text === '바다'));
});
