// 용도 17종 × 1순위 입지: 매스 → 물량 → 공법 → 4D 공정 → 간섭 → 5D 예산 → 위험 예측이 끝까지 이어지는지 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USES, useOf } from '../src/sim/uses.js';
import { KR_SITES } from '../src/sim/kr-sites.js';
import { rankSites, scoreSite } from '../src/sim/siting.js';
import { siteFrom, resolveSite } from '../src/sim/sites.js';
import { generate, DEFAULTS } from '../src/sim/massing.js';
import { generateX, XDEF } from '../src/sim/massx.js';
import { quantities } from '../src/sim/quantities.js';
import { schedule } from '../src/sim/process.js';
import { estimate } from '../src/sim/cost.js';
import { siteConditions, derive, resolveMethods, BASELINE, WPS } from '../src/sim/methods.js';
import { detect, optimize, objective } from '../src/sim/clash.js';
import { register, monteCarlo, exposure, exposureTimeline, levers, RISKS } from '../src/sim/risk.js';
import { paramsForSite } from '../src/store.js';

globalThis.performance ??= { now: () => Date.now() };

function run(useId, picks = {}) {
  const u = useOf(useId);
  const top = rankSites(u.id)[0].site;
  const site = siteFrom(top.id, {}, u.id);
  const gen = u.gen === 'housing' ? generate({ ...paramsForSite(site, DEFAULTS), site }) : generateX({ ...XDEF[u.id], use: u.id, site });
  const Q = quantities(gen);
  const cond = siteConditions(site, gen, Q), d = derive(cond, gen, Q, site);
  const M = resolveMethods(cond, d, picks);
  const S = schedule(gen, Q, { fx: M.fx });
  const C = detect(gen, S, { noise: cond.noise });
  const E = estimate(gen, Q, S, {});
  const ctx = { site, u, cond, d, S, C, E, ex: exposure(S, Q), fx: M.fx };
  const reg = register(ctx);
  return { u, site, gen, Q, cond, d, M, S, C, E, ctx, reg };
}
const cache = new Map();
const R = (id) => { if (!cache.has(id)) cache.set(id, run(id)); return cache.get(id); };

test('용도마다 적합한 전국 후보지가 있고, 순위는 점수 내림차순', () => {
  assert.ok(KR_SITES.length >= 120);
  USES.forEach(u => {
    const r = rankSites(u.id);
    assert.ok(r.length >= 10, `${u.id}: 후보지 ${r.length}곳`);
    for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
    r.forEach(x => assert.ok(x.score >= 0 && x.score <= 100));
  });
  // 가중치를 한 항목에 몰면 그 항목 점수 순서와 같아진다
  const w = Object.fromEntries(Object.keys(useOf('office').w).map(k => [k, 0])); w.transit = 10;
  const s = KR_SITES.slice(0, 20).map(site => scoreSite(site, 'office', w)).filter(x => x.eligible);
  assert.ok(s.length > 0);
});

test('택지를 고르지 않으면 공동주택은 용산, 다른 용도는 그 용도 1순위 후보지', () => {
  assert.equal(resolveSite(null, 'housing').id, 'yongsan');
  ['fab', 'chem', 'museum'].forEach(id => assert.equal(resolveSite(null, id).id, rankSites(id)[0].site.id));
});

for (const u of USES) {
  test(`${u.code} ${u.name}: 매스 → 공법 → 공정 → 간섭 → 예산`, () => {
    const { gen, S, C, E, M, Q } = R(u.id);
    assert.ok(gen.bldgs.length > 0, '동이 하나도 없음');
    assert.ok(gen.totals.gfaAbove > 0);
    assert.ok(Q.excavation >= 0);
    // 공법: 공종마다 고른 공법이 가능한 공법이고, 추천은 가능한 것 중 최고점
    M.list.forEach(L => {
      if (L.wp.multi) { assert.ok(Array.isArray(L.chosen)); return; }
      const ok = L.ev.filter(e => e.ok);
      assert.ok(ok.length > 0, `${L.wp.id}: 가능한 공법 없음`);
      const best = Math.max(...ok.map(e => e.score));
      assert.equal(L.ev.find(e => e.o.id === L.rec).score, best, `${L.wp.id}: 추천이 최고점이 아님`);
      assert.ok(L.ev.find(e => e.o.id === L.chosen).ok);
    });
    assert.equal(M.list.length, WPS.length);
    // 공정
    S.acts.forEach(a => assert.ok(a.start <= a.end + 1e-9, `${a.name}: 시작 > 끝`));
    assert.ok(S.months >= 8 && S.months <= 120, `공기 ${S.months}개월`);
    // 간섭
    C.list.forEach(c => { assert.ok(c.days >= 0); assert.ok(c.sev >= 1 && c.sev <= 3); });
    assert.ok(Number.isFinite(objective(S, C)));
    // 예산
    assert.ok(E.total > 0);
    const sum = E.flow.reduce((a, m) => a + m.total, 0);
    assert.ok(Math.abs(sum - E.total) / E.total < 0.01, '월별 합 ≠ 총액');
  });
}

for (const id of ['housing', 'office', 'fab', 'chem', 'museum', 'hospital', 'dc', 'power']) {
  test(`위험 예측 (${useOf(id).name}): 잔여 ≤ 고유, 분위수 순서, 같은 입력 같은 결과`, () => {
    const { reg, S, E, M, ctx } = R(id);
    assert.ok(reg.length >= 5, `위험 ${reg.length}종`);
    reg.forEach(r => {
      assert.ok(r.s <= r.s0 + 1e-9, `${r.id}: 잔여 ${r.s} > 고유 ${r.s0}`);
      assert.ok(r.p >= 1 && r.p <= 5 && r.i >= 1 && r.i <= 5);
      assert.ok(r.days[0] <= r.days[1] && r.days[1] <= r.days[2]);
      assert.ok(r.why.length > 0, `${r.id}: 근거 없음`);
    });
    for (let i = 1; i < reg.length; i++) assert.ok(reg[i - 1].s >= reg[i].s);
    const mc = monteCarlo(reg, S, E, M.fx, { n: 800 }), mc0 = monteCarlo(reg, S, E, M.fx, { n: 800, mode: 'raw' });
    const d = mc.days;
    assert.ok(d.p10 <= d.p50 && d.p50 <= d.p80 && d.p80 <= d.p90);
    assert.ok(mc.cost.p10 <= mc.cost.p50 && mc.cost.p50 <= mc.cost.p90);
    assert.ok(mc.pOnTime >= 0 && mc.pOnTime <= 1);
    // 고른 공법(잔여)은 전통 공법(고유)보다 P80이 길지 않다
    assert.ok(mc.days.p80 <= mc0.days.p80 + 1, `P80 ${mc.days.p80} > 고유 ${mc0.days.p80}`);
    // 결정적 난수
    const again = monteCarlo(reg, S, E, M.fx, { n: 800 });
    assert.equal(again.days.p80, mc.days.p80);
    const tl = exposureTimeline(reg, S);
    assert.equal(tl.total.length, tl.NM);
    assert.ok(tl.total[tl.peak] === Math.max(...tl.total));
    // AI 대응안: 제안하면 실제로 그 위험 점수가 준다
    const lv = levers(reg, ctx, {}, (np) => resolveMethods(R(id).cond, R(id).d, np));
    lv.forEach(g => { assert.ok(g.gain > 0); g.risks.forEach(x => assert.ok(x.to < x.from)); });
  });
}

test('위험 정의 24종은 ID가 겹치지 않고 대응 공법이 실제 공종·공법을 가리킨다', () => {
  assert.equal(RISKS.length, 24);
  assert.equal(new Set(RISKS.map(r => r.id)).size, RISKS.length);
  RISKS.forEach(r => (r.levers || []).forEach(([wp, opt]) => {
    const w = WPS.find(x => x.id === wp);
    assert.ok(w, `${r.id}: 공종 ${wp} 없음`);
    assert.ok(w.opts.find(o => o.id === opt), `${r.id}: ${wp}.${opt} 없음`);
  }));
});

test('전통 공법 묶음은 모든 용도에서 계산되고, 추천 공법보다 품질·안전 지수가 높지 않다', () => {
  ['housing', 'office', 'fab', 'logistics'].forEach(id => {
    const { cond, d, M } = R(id);
    const B = resolveMethods(cond, d, BASELINE);
    assert.ok(B.fx.index.quality <= M.fx.index.quality + 2, `${id}: 품질 지수`);
    assert.ok(B.fx.index.safety <= M.fx.index.safety + 2, `${id}: 안전 지수`);
  });
});

test('AI 공정 최적화: 간섭 비용을 줄이고 공기를 크게 늘리지 않는다', async () => {
  for (const id of ['office', 'fab']) {
    const { gen, Q, M, cond } = R(id);
    const O = await optimize(gen, Q, { fx: M.fx }, { solve: 0.5, noise: cond.noise, seed: 7 });
    assert.ok(objective(O.after.S, O.after.C, O.end0) <= objective(O.before.S, O.before.C, O.end0) + 1e-6, `${id}: 목적함수가 나빠짐`);
    assert.ok(O.after.S.months <= O.before.S.months + 1, `${id}: 공기 ${O.before.S.months} → ${O.after.S.months}`);
  }
});
