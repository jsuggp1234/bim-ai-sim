// 작업 상세 카드: 모든 공법의 모든 단계가 작업 유형으로 갈리고, 확대 장면·정보가 깨지지 않고 그려지는지 확인한다.
// 주변 도로 모델(street.js)이 대지 폭·인접 거리마다 겹치지 않는 단면을 돌려주는지도 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WPS } from '../src/sim/methods.js';
import { classify, workFig, workInfo, WORK_TYPES, ARCH } from '../src/ui/workstep.js';
import { streetModel, vehicleAt } from '../src/sim/street.js';

const BAD = /NaN|undefined|Infinity|\[object/;

test('작업 유형마다 장면과 설명이 있다', () => {
  for (const a of Object.keys(ARCH)) {
    assert.ok(WORK_TYPES.includes(a), `${a} 장면 없음`);
    const A = ARCH[a];
    assert.ok(A.n && A.eq.length && A.crew > 0 && A.qc.length && A.safe, `${a} 설명 빠짐`);
  }
});

test('모든 장면이 진행률·시간마다 올바른 SVG를 그린다', () => {
  for (const a of WORK_TYPES) for (const q of [0, 0.21, 0.5, 0.83, 1]) for (const T of [0, 2.9]) {
    const s = workFig(a, q, T, { text: '' });
    assert.ok(s.startsWith('<svg class="wv"') && s.endsWith('</svg>'), `${a} q=${q}`);
    assert.ok(!BAD.test(s), `${a} q=${q} T=${T}: ${(s.match(/.{30}(NaN|undefined|Infinity).{10}/) || [''])[0]}`);
  }
});

test('공법 단계 문장 전부가 작업 유형으로 갈리고 카드가 그려진다', () => {
  let n = 0;
  const seen = new Set();
  for (const w of WPS) for (const o of w.opts) {
    const how = o.how || [o.name];
    how.forEach((h, k) => {
      const a = classify(w.id, o.id, h);
      assert.ok(ARCH[a], `${w.id}/${o.id} "${h}" → ${a}`);
      seen.add(a);
      const inf = workInfo({ wpId: w.id, optId: o.id, text: h, k, n: how.length, days: 3.4 });
      assert.equal(inf.a, a);
      assert.ok(!BAD.test(inf.html), `${w.id}/${o.id} 정보 카드`);
      const svg = workFig(a, 0.6, 1.1, { text: h, wpId: w.id, optId: o.id });
      assert.ok(!BAD.test(svg), `${w.id}/${o.id} "${h}" 장면`);
      n++;
    });
  }
  assert.ok(n > 600, `단계 ${n}개`);
  assert.ok(seen.size >= 55, `쓰인 작업 유형 ${seen.size}개`);
});

test('대표 단계는 맞는 작업 유형으로 간다', () => {
  const cases = [
    ['survey', 'spt', '회전 수세식 시추 + 표준관입시험 1.5m 간격', 'spt'],
    ['wall', 'dwall', '트레미 콘크리트 타설, 이음 장치로 차수', 'tremie'],
    ['support', 'anchor', '긴장·정착 → 다음 단 굴착', 'anchor'],
    ['found', 'phc', 'SDA·디젤 해머로 PHC 말뚝 시공', 'pile'],
    ['hoist', 'fast', '고속 인버터 호이스트 2~4기', 'hoist'],
    ['plumb', 'upw', 'PVDF·스테인리스 EP 배관 오비탈 용접', 'pipe'],
    ['roof', 'pv', '모듈·인버터 설치', 'pv'],
    ['excav', 'blast', '천공·장약 (지발 뇌관)', 'blast'],
  ];
  for (const [w, o, t, a] of cases) assert.equal(classify(w, o, t), a, t);
});

test('도로 단면: 구간이 겹치지 않고 차로·보도·매설물이 있다', () => {
  for (const pw of [18, 32, 60]) for (const adj of [4, 12, 30, 80]) {
    const c = streetModel({ pw, adj, noise: 'mid', ground: { gw: 6 }, nb: { x0: -adj - 14, x1: -adj, h: 30, fl: 9, b: 2 }, seed: `t${pw}-${adj}` });
    assert.ok(['urban', 'suburb', 'ind'].includes(c.kind));
    assert.ok(c.lanes.length >= 2);
    assert.ok(c.fence > pw && c.sw[0] >= c.fence && c.sw[1] <= c.curb && c.curb <= c.lanes[0].x0, `pw=${pw} adj=${adj}`);
    for (let i = 1; i < c.lanes.length; i++) assert.ok(c.lanes[i].x0 >= c.lanes[i - 1].x1 - 1e-6, '차로 겹침');
    assert.ok(c.utils.length >= 4 && c.utils.every(u => Number.isFinite(u.x) && u.d > 0));
    assert.ok(c.nb && Number.isFinite(c.nb.top));
    for (const L of c.lanes) for (let i = 0; i < 3; i++) {
      const v = vehicleAt(L, i, 12.3, 7);
      if (v) assert.ok(Number.isFinite(v.op) && v.op >= 0 && v.op <= 1);
    }
  }
});
