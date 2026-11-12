// 4D 공정·5D 예산 엔진 검사
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../src/yongsan/massing.js';
import { quantities } from '../src/yongsan/quantities.js';
import { schedule } from '../src/yongsan/process.js';
import { estimate } from '../src/yongsan/cost.js';

const gen = generate({});
const Q = quantities(gen);
const S = schedule(gen, Q, {});
const E = estimate(gen, Q, S, {});

test('공정: 모든 작업은 시작 ≤ 끝이고 공기는 3~10년', () => {
  for (const a of S.acts) assert.ok(a.end >= a.start, `${a.block} ${a.name}`);
  assert.ok(S.months >= 36 && S.months <= 120, `${S.months}개월`);
  for (const r of S.blds.values()) for (let i = 1; i < r.fEnd.length; i++) assert.ok(r.fEnd[i] >= r.fEnd[i - 1]);
});

test('공정: 층 상태는 시간이 지나면 되돌아가지 않는다', () => {
  const bi = [...S.blds.keys()][0], r = S.blds.get(bi);
  let prev = 0;
  for (let t = 0; t <= S.end + 10; t += 20) { const st = S.stateAt(t)(bi, r.floors[0]); assert.ok(st >= prev); prev = st; }
  assert.equal(prev, 3);
});

test('예산: 월별 기성 합계 = 총공사비, 평당 공사비가 상식 범위', () => {
  const sum = E.flow.reduce((s, f) => s + f.total, 0);
  assert.ok(Math.abs(sum - E.total) / E.total < 1e-6, `${sum} vs ${E.total}`);
  assert.ok(E.perPy > 600 && E.perPy < 2500, `평당 ${E.perPy}`);
  assert.ok(E.esc > 0 && E.direct < E.total);
});

test('예산: 물가상승률을 올리면 총액이 늘어난다', () => {
  const E2 = estimate(gen, Q, S, { escalation: 6 });
  assert.ok(E2.total > E.total);
});
