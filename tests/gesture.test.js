// 매스 형태 제스처: 연면적 유지 · 코어가 판 안 · 시공 시뮬레이션 층 판이 외곽 안
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GESTURES, gestureAt, applyGesture, floorParts, specOf, parseSpec } from '../src/sim/gesture.js';
import { generateX } from '../src/sim/massx.js';
import { generate } from '../src/sim/massing.js';
import { sectionGeom } from '../src/sim/impact.js';
import { resolveSite } from '../src/sim/sites.js';

const site = resolveSite(null);
const ids = GESTURES.map(g => g.id);

test('제스처는 기준층 연면적·층수를 유지하고 코어를 판 안에 둔다', () => {
  const base = generateX({ use: 'office', site });
  const tw = (g) => g.bldgs.filter(b => b.kind === 'office');
  for (const gesture of ids) {
    const g = generateX({ use: 'office', site, gesture, gAmt: 80, gStep: 5 });
    assert.equal(tw(g).length, tw(base).length, gesture);
    tw(g).forEach((b, i) => {
      const b0 = tw(base)[i];
      assert.equal(b.storeys, b0.storeys, `${gesture} 층수`);
      const r = Math.abs(b.gfa - b0.gfa) / b0.gfa;
      assert.ok(r < 0.12, `${gesture} 연면적 차 ${(r * 100).toFixed(1)}%`);
      const [cw, cd] = b.coreDims;
      b.floors.filter(f => f.g && !f.roof).forEach(f => {
        floorParts(b, f).forEach(q => {
          if (Math.abs(q.a) > 1e-6) return; // 회전 판은 생략
          assert.ok(q.cu - q.w / 2 <= b.core.u - cw / 2 + 1e-6 && q.cu + q.w / 2 >= b.core.u + cw / 2 - 1e-6, `${gesture} ${f.lv}층 코어 u`);
          assert.ok(q.cv - q.d / 2 <= b.core.v - cd / 2 + 1e-6 && q.cv + q.d / 2 >= b.core.v + cd / 2 - 1e-6, `${gesture} ${f.lv}층 코어 v`);
        });
      });
    });
  }
});

test('제스처가 시공 시뮬레이션 층 판(비율 사각형)으로 이어진다', () => {
  for (const gesture of ['setback', 'cantilever', 'shift', 'terrace', 'lean']) {
    const g = generateX({ use: 'office', site, gesture, gAmt: 70 });
    const G = sectionGeom(g, { depth: 20 });
    const fr = G.floors.filter(f => f.fr).map(f => f.fr);
    assert.ok(fr.length > 10, gesture);
    fr.forEach(x => { assert.ok(x.x0 >= -1e-6 && x.x1 <= 1 + 1e-6 && x.z0 >= -1e-6 && x.z1 <= 1 + 1e-6 && x.x1 > x.x0 && x.z1 > x.z0, `${gesture} ${JSON.stringify(x)}`); });
    const distinct = new Set(fr.map(x => x.x0.toFixed(2) + x.z0.toFixed(2) + x.x1.toFixed(2) + x.z1.toFixed(2)));
    assert.ok(distinct.size > 1, `${gesture}: 층 판이 모두 같음`);
  }
});

test('공동주택 주동에도 제스처가 붙고 법정 인동간격 판정은 그대로다', () => {
  const g = generate({ site, gesture: 'twist', gAmt: 60 });
  const apts = g.bldgs.filter(b => b.kind === 'apt');
  assert.ok(apts.length > 0 && apts.every(b => b.gesture === 'twist'));
  assert.ok(apts[0].floors.some(f => f.g && Math.abs(f.g.rot) > 0.3));
  assert.equal(g.violations.filter(v => v.scope === 'law').length, 0);
});

test('설계안 JSON을 내보내고 다시 불러오면 같은 형태가 된다', () => {
  const g = generateX({ use: 'office', site, gesture: 'setback', gAmt: 60, gStep: 6 });
  const b = g.bldgs.find(x => x.kind === 'office');
  const spec = specOf(b, { gesture: 'setback', gAmt: 60, gStep: 6 });
  assert.equal(spec.format, 'bim-ai-sim/mass-gesture@1');
  const list = parseSpec(JSON.stringify(spec));
  assert.equal(list.length, spec.floors.length);
  const g2 = generateX({ use: 'office', site, gesture: 'custom', gCustom: list });
  const b2 = g2.bldgs.find(x => x.kind === 'office');
  const top = b2.floors.filter(f => !f.roof).slice(-1)[0], top0 = b.floors.filter(f => !f.roof).slice(-1)[0];
  assert.ok(Math.abs(top.g.sx - top0.g.sx) < 0.01, `${top.g.sx} vs ${top0.g.sx}`);
  assert.equal(parseSpec('not json'), null);
});

test('제스처 값의 범위', () => {
  for (const id of ids) for (let k = 0; k < 40; k++) {
    const v = gestureAt(id, k / 39, k, 1, 4, k);
    assert.ok([v.sx, v.sz, v.ox, v.oz, v.rot].every(Number.isFinite), id);
    assert.ok(v.sx > 0.3 && v.sz > 0.3, id);
  }
});
