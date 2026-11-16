// 현장 사람과 대화 (talk.js): 모든 역할이 공정·계절마다 깨지지 않은 대사를 돌려주고, 같은 사람은 늘 같은 이름·이야기인지 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, talkFor, nameFor, roleOfWorker, roleOfEquipment, phaseGroup } from '../src/ui/talk.js';

const BAD = /NaN|undefined|Infinity|\[object|\{\w+\}/;

test('모든 역할 · 공정 · 계절에서 대사가 온전하다', () => {
  for (const role of Object.keys(ROLES)) for (const wpId of ['excav', 'frame', 'skin', 'hvac', 'paint']) for (const month of [1, 4, 7, 10]) {
    for (const seed of [1, 77, 4242]) {
      const t = talkFor(role, seed, { month, wpId, boss: '홍길동', co: '누리종합건설(주)' });
      assert.equal(t.role, role);
      assert.ok(t.name && t.name.length >= 2, `${role} 이름`);
      assert.ok(t.lines.length >= 4 && t.lines.length <= 8, `${role} 대사 수 ${t.lines.length}`);
      t.lines.forEach(l => { assert.ok(l.length > 4, `${role} 빈 대사`); assert.doesNotMatch(l, BAD, `${role}: ${l}`); });
      assert.doesNotMatch(t.meta, BAD);
      assert.equal(new Set(t.lines).size, t.lines.length, `${role} 같은 대사 반복`);
    }
  }
});

test('같은 사람은 늘 같은 이름과 이야기', () => {
  const a = talkFor('rebar', 123, { month: 5, wpId: 'rebar' }), b = talkFor('rebar', 123, { month: 5, wpId: 'rebar' });
  assert.deepEqual(a, b);
  assert.equal(nameFor('boss', 9).name, nameFor('boss', 9).name);
  const names = new Set(Array.from({ length: 40 }, (_, i) => nameFor('labor', i * 7 + 1).name));
  assert.ok(names.size > 25, '이름이 고루 나온다');
});

test('작업자·장비에서 역할을 고른다', () => {
  assert.equal(roleOfEquipment('백호 0.7㎥'), 'excav');
  assert.equal(roleOfEquipment('덤프트럭 · 토사 반출'), 'dump');
  assert.equal(roleOfEquipment('타워크레인 (T형)'), 'crane');
  assert.equal(roleOfEquipment('수중펌프'), null);
  assert.equal(roleOfWorker({ act: 'signal', kind: 'pour' }), 'signal');
  assert.ok(ROLES[roleOfWorker({ act: 'walk', kind: 'rebar', sd: 5 })]);
  assert.ok(ROLES[roleOfWorker({ act: 'walk' }, 3)]);
  assert.equal(phaseGroup('excav'), 'geo'); assert.equal(phaseGroup('paint'), 'fin');
});
