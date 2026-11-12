// 매스 엔진 기본 검사: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, refugeLevels } from '../src/yongsan/massing.js';
import { analyze, unitSamples, contextSamples, projectBoxes, meets } from '../src/yongsan/analysis.js';
import { mixForAverage } from '../src/store.js';

test('발표안 6,000호를 경고 없이 배치한다', () => {
  const g = generate({});
  assert.ok(g.totals.units >= 6000, `세대 ${g.totals.units}`);
  assert.equal(g.warnings.length, 0, g.warnings.join('\n'));
  assert.equal(g.violations.length, 0);
});

test('세 가지 주동 형식 모두 목표 물량을 채운다', () => {
  for (const typology of ['tower', 'mixed', 'slab']) {
    const g = generate({ typology });
    assert.ok(g.totals.units >= 6000, `${typology}: ${g.totals.units}`);
  }
});

test('피난안전층 규칙 (건축법 시행령 제34조)', () => {
  assert.deepEqual(refugeLevels(100, 430), [30, 60, 90]);
  assert.deepEqual(refugeLevels(40, 130), [20]);
  assert.deepEqual(refugeLevels(25, 80), []);
});

test('층 높이가 끊김 없이 쌓인다', () => {
  const g = generate({});
  for (const b of g.bldgs) {
    if (b.kind === 'basement') continue;
    for (let i = 1; i < b.floors.length; i++) assert.ok(Math.abs(b.floors[i].y0 - b.floors[i - 1].y1) < 1e-9, b.id);
  }
});

test('일조 분석: 동지 기준 판정과 결과 길이', () => {
  assert.equal(meets(240, 0), true);   // 합계 4시간
  assert.equal(meets(130, 120), true); // 연속 2시간
  assert.equal(meets(230, 110), false);
  const g = generate({});
  const units = unitSamples(g.bldgs);
  const r = analyze({ projectBoxes: projectBoxes(g), units, ctxSamples: contextSamples() });
  assert.equal(r.total.length, units.length);
  assert.ok(r.ctx.length > 0);
});

test('1단계 평균 전용면적 → 평형 구성', () => {
  const m = mixForAverage(74, 30);
  assert.equal(m.mix59 + m.mix84 + m.mix114, 100);
  const avgApt = (59 * m.mix59 + 84 * m.mix84 + 114 * m.mix114) / 100;
  assert.ok(Math.abs(avgApt - m.aptAvg) < 1.5, `${avgApt} vs ${m.aptAvg}`);
});
