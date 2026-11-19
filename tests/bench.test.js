// 실제 현장(산군 현장DB·입찰DB) 대비 검증: 실제와 비슷한 조건을 넣었을 때 공기·연면적·원가가 실제 범위에 드는지
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = {}; globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => delete mem[k] };
const { store, paramsForSite, currentSite } = await import('../src/store.js');
const { DEFAULTS: MD } = await import('../src/sim/massing.js');
const { isHousingGen } = await import('../src/sim/uses.js');
const { pipeline } = await import('../src/pipeline.js');
const { REAL_SITES, BENCH_GROUPS, benchFor, planSpan, stats, verdict, COST_REF, GFA_PER_UNIT, LH_AWARDS, PUBLIC_REF, contractOf } = await import('../src/sim/bench.js');
const { soft, weatherLoss, P4_DEFAULTS, schedule } = await import('../src/sim/process.js');

const C = (name, lat, lng, area, o = {}) => ({ id: 'custom', name, lat, lng, area, aspect: 1.3, ...o });
const S4 = C('S-4BL 유사', 37.6523, 126.8712, 58340, { units: 1024, maxFloors: 29, avgUnit: 66, far: 190, netRatio: 100 });
function run(use, site, mx, proc) {
  store.set({ use, site, mass: null, massx: mx ? { [use]: mx } : {}, methods: {}, opt: {}, proc: proc || null, cost: null, useMap: false });
  if (isHousingGen(use)) { const p = paramsForSite(currentSite(store.get()), MD); delete p.site; store.set({ mass: p }); }
  const R = pipeline(), B = R.base();
  return { R, B, rec: planSpan(R.S, R.gen), base: planSpan(B.S, R.gen) };
}
const within = (v, ref, tol, msg) => assert.ok(Math.abs(v - ref) / ref <= tol, `${msg}: ${v.toFixed(1)} vs 실제 ${ref.toFixed(1)} (허용 ±${tol * 100}%)`);

test('실제 현장 자료: 58건, 묶음마다 공기가 날짜에서 계산된다', () => {
  assert.equal(REAL_SITES.length, 58);
  for (const g of Object.keys(BENCH_GROUPS)) assert.ok(REAL_SITES.some(r => r.g === g), g);
  REAL_SITES.forEach(r => { assert.ok(r.months > 12 && r.months < 60, r.name); assert.ok(r.gfa > 1e4, r.name); });
  const h = stats(REAL_SITES.filter(r => r.g === 'housing').map(r => r.months));
  assert.ok(h.med > 32 && h.med < 42);
  assert.equal(LH_AWARDS.length, 10);
  assert.ok(Math.abs(COST_REF.perM2 - 159.8) < 0.5 && Math.abs(COST_REF.perUnit - 2.25) < 0.01);
});

test('아파트 단지(고양창릉 S-4BL과 비슷한 조건): 공기가 실제 범위에 든다', () => {
  const x = run('housing', S4);
  const b = benchFor('housing', x.rec.gfa);
  assert.ok(b.st.n >= 8);
  // 전통 공법 기준선은 실제 중앙값 근처, 추천 공법은 실제 빠른 쪽 끝 근처 (가장 빠른 현장보다 10% 넘게 짧지 않다)
  within(x.base.months, b.st.med, 0.1, '기준선 공기');
  assert.ok(x.rec.months >= b.st.min * 0.9 && x.rec.months <= b.st.q3, `추천 공법 공기 ${x.rec.months.toFixed(1)} (실제 ${b.st.min.toFixed(1)}~${b.st.q3.toFixed(1)})`);
  assert.ok(x.rec.months < x.base.months);
  assert.ok(['fast', 'quick', 'mid'].includes(verdict(x.rec.months, b.st).k));
});

test('공공 발주(주 5일): 전통 공법 기준선이 LH 계약 공기와 8% 안에서 맞는다', () => {
  const x = run('housing', S4, null, { owner: 'public' });
  within(x.base.months, PUBLIC_REF[0].months, 0.08, '공공 기준선 공기');
  const y = run('housing', S4);
  assert.ok(x.base.months / y.base.months > 1.15 && x.base.months / y.base.months < 1.3);
});

test('지하 규모: 세대당 연면적(지상+지하)이 실제 단지와 10% 안에서 맞는다', () => {
  const { R } = run('housing', S4), t = R.gen.totals;
  const per = (t.gfaAbove + t.gfaBelow) / t.units, real = GFA_PER_UNIT.reduce((s, r) => s + r.v, 0) / GFA_PER_UNIT.length;
  within(per, real, 0.1, '세대당 연면적');
  // 지하 면적은 주차 수요만큼: 주차 1대에 33㎡ + 기계·전기실
  R.gen.blocks.forEach(b => { if (b.parking) assert.ok(b.gfaBelow / b.parking > 30 && b.gfaBelow / b.parking < 45, `${b.id} 주차 1대당 지하 ${Math.round(b.gfaBelow / b.parking)}㎡`); });
});

test('아파트 원가: 도급 범위 단가가 LH 낙찰 단가(도급분 70% 가정)와 10% 안에서 맞는다', () => {
  const { R, B } = run('housing', S4), g = B.E.gfa;
  within(contractOf(B.E) / g, COST_REF.perM2 / COST_REF.scope, 0.1, '기준선 도급 단가(만원/㎡)');
  within(contractOf(B.E) / R.gen.totals.units / 1e4, COST_REF.perUnit / COST_REF.scope, 0.12, '기준선 세대당 도급액(억)');
  assert.ok(contractOf(R.E) / g < COST_REF.perM2 / COST_REF.scope * 1.15);
});

test('다른 용도: 실제 현장과 같은 대지·층수 조건에서 공기가 12% 안에서 맞는다', () => {
  const cases = [
    ['office', C('을지로3가 6지구', 37.5662, 126.9925, 4156), { far: 986, maxFloors: 17, basement: 7, plate: 2400, podium: 0 }, '을지로3가 6지구 업무시설', 'base'],
    ['dc', C('삼송', 37.65, 126.89, 20455), { far: 268, maxFloors: 5, basement: 2 }, '삼송 IDC', 'base'],
    ['hospital', C('울산', 35.6, 129.2, 32393), { far: 94, maxFloors: 8, basement: 3, podium: 3 }, '근로복지공단 울산병원', 'base'],
    // 물류센터는 실제도 PC 구조라 추천 공법(PC)과 견준다
    ['logistics', C('당목', 36.98, 127.42, 71683), { far: 125, levels: 4, basement: 1 }, '켄달스퀘어 당목 물류센터', 'rec'],
  ];
  for (const [use, site, mx, name, which] of cases) {
    const x = run(use, site, mx), real = REAL_SITES.find(r => r.name === name);
    assert.ok(real, name);
    within(x[which].months, real.months, 0.12, `${name} (${which === 'base' ? '기준선' : '추천 공법'})`);
  }
});

test('공법 배수 완화·달력: 겹친 단축 효과는 40%만, 한 주 작업일은 4.3~4.9일', () => {
  assert.equal(soft(1), 1);
  assert.ok(Math.abs(soft(0.5) - 0.8) < 1e-9 && Math.abs(soft(1.5) - 1.2) < 1e-9);
  assert.ok(weatherLoss(0, P4_DEFAULTS) > weatherLoss(6, P4_DEFAULTS) && weatherLoss(6, P4_DEFAULTS) > weatherLoss(7, P4_DEFAULTS) && weatherLoss(3, P4_DEFAULTS) <= 0.04);
  const { R } = run('housing', S4);
  assert.ok(R.S.cal.perWeek > 4.3 && R.S.cal.perWeek < 4.9, `한 주 작업일 ${R.S.cal.perWeek.toFixed(2)}`);
  const P = schedule(R.gen, R.Q, { ...R.pp, owner: 'public' });
  assert.ok(P.cal.perWeek < R.S.cal.perWeek * 0.85);
  // 마감은 골조가 끝난 뒤에도 몇 달 이어진다 (예전에는 석 달 안에 끝났다)
  const top = [...R.S.blds.values()].sort((a, b) => b.F - a.F)[0];
  assert.ok((top.commE - top.structEnd) / 30.44 > 7, `상량 → 준공 ${((top.commE - top.structEnd) / 30.44).toFixed(1)}개월`);
});
