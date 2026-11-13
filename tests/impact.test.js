// 04 공법·재료 단계별 확정: 공종별 판정(간섭·문제점·이점)과 시공 시뮬레이션 그래픽이 용도마다 끝까지 그려지는지 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useOf } from '../src/sim/uses.js';
import { rankSites } from '../src/sim/siting.js';
import { siteFrom } from '../src/sim/sites.js';
import { generate, DEFAULTS } from '../src/sim/massing.js';
import { generateX, XDEF } from '../src/sim/massx.js';
import { quantities } from '../src/sim/quantities.js';
import { paramsForSite } from '../src/store.js';
import { siteConditions, derive, resolveMethods, PRIO_DEFAULT, WPS } from '../src/sim/methods.js';
import { schedule, P4_DEFAULTS } from '../src/sim/process.js';
import { estimate, P5_DEFAULTS } from '../src/sim/cost.js';
import { detect } from '../src/sim/clash.js';
import { wpImpact, vsBaseline, delta, sectionGeom, wpWindows, wallMove, ppv, ppvLimit, pileNoise, anchorLen, WP_ORDER } from '../src/sim/impact.js';
import { makeScene, frame, roiFor, winFor } from '../src/ui/buildsim.js';

globalThis.performance ??= { now: () => Date.now() };

// pipeline()과 같은 모양의 결과 (브라우저 저장소 없이)
function mk(id, picks = {}) {
  const u = useOf(id), site = siteFrom(rankSites(id)[0].site.id, {}, id);
  const mp = u.gen === 'housing' ? { ...paramsForSite(site, DEFAULTS), site } : { ...XDEF[id], use: id, site };
  const gen = u.gen === 'housing' ? generate(mp) : generateX(mp);
  const Q = quantities(gen), cond = siteConditions(site, gen, Q), d = derive(cond, gen, Q, site);
  const M = resolveMethods(cond, d, picks), pp0 = { ...P4_DEFAULTS, fx: M.fx };
  const S = schedule(gen, Q, pp0), C = detect(gen, S, { noise: cond.noise }), E = estimate(gen, Q, S, P5_DEFAULTS);
  return { use: id, u, site, mp, gen, Q, cond, d, M, fx: M.fx, S, C, E, prio: PRIO_DEFAULT, cp: P5_DEFAULTS, pp0, ms: { picks } };
}
const USES_T = ['office', 'housing', 'fab', 'chem', 'museum', 'logistics', 'hotel'];
const cache = new Map();
const R = (id) => { if (!cache.has(id)) cache.set(id, mk(id)); return cache.get(id); };
const WP_IDS = new Set(WPS.map(w => w.id));
const OPT_OK = (wp, opt) => WPS.find(w => w.id === wp)?.opts.some(o => o.id === opt);

test('확정 순서는 지반조사부터 16개 공종 전부', () => {
  assert.equal(WP_ORDER.length, 16);
  assert.equal(WP_ORDER[0], 'survey');
  assert.equal(WP_ORDER[1], 'improve');
  assert.deepEqual(new Set(WP_ORDER), WP_IDS);
});

test('용도마다 단면 형상과 공종 재생 창이 유효하다', () => {
  USES_T.forEach(id => {
    const r = R(id), G = sectionGeom(r.gen, r.d), W = wpWindows(r.S, G.main);
    assert.ok(G.pw > 0 && G.bx1 > G.bx0 && G.H > 0 && G.depth >= 0, id);
    assert.ok(G.floors.length > 0, id);
    WP_IDS.forEach(wp => {
      const w = W[wp];
      if (wp === 'improve' && w == null) return; // 개량이 필요 없거나 '개량 없음'이면 공정이 없다
      assert.ok(w && Number.isFinite(w.s) && Number.isFinite(w.e) && w.e >= w.s, `${id} ${wp}`);
    });
  });
});

test('공종별 판정: 간섭·문제점·이점 항목이 형식을 지키고, 고칠 공법이 실제 선택지다', () => {
  USES_T.forEach(id => {
    const r = R(id), G = sectionGeom(r.gen, r.d);
    WP_IDS.forEach(wp => {
      const I = wpImpact(r, wp, G);
      const all = [...I.pros, ...I.cons, ...I.clashes];
      assert.ok(all.length > 0, `${id} ${wp}: 판정이 비어 있음`);
      all.forEach(x => {
        assert.ok(['pro', 'con', 'clash'].includes(x.kind), `${id} ${wp} kind`);
        assert.ok(typeof x.t === 'string' && x.t.length > 0 && !/NaN|undefined/.test(x.t + (x.d || '')), `${id} ${wp}: ${x.t}`);
        if (x.kind !== 'pro') assert.ok(x.sev >= 1 && x.sev <= 3, `${id} ${wp} sev`);
        if (x.fix) assert.ok(WP_IDS.has(x.fix.wp) && OPT_OK(x.fix.wp, x.fix.opt), `${id} ${wp} fix ${x.fix.wp}:${x.fix.opt}`);
      });
    });
  });
});

test('도심 인접 대지: 앵커는 인접 대지 침범, 발파는 진동 허용치 초과로 판정', () => {
  const r = mk('office', { support: 'anchor', excav: 'blast' }), G = sectionGeom(r.gen, r.d);
  assert.ok(r.cond.adj <= 15 && r.cond.noise === 'high');
  const sup = wpImpact(r, 'support', G);
  const anc = sup.clashes.find(x => x.mark === 'anchor');
  assert.ok(anc && anc.sev === 3, '앵커 침범 간섭');
  assert.ok(anchorLen(G.depth) > r.cond.adj, '앵커 길이가 인접 거리보다 길다');
  const exc = wpImpact(r, 'excav', G);
  const bl = exc.clashes.find(x => x.mark === 'blast');
  assert.ok(bl, '발파 진동 간섭');
  assert.ok(ppv(r.cond.adj + 3) > ppvLimit(r.cond.noise));
});

test('공학 추정식: 거리가 멀수록 진동·소음이 줄고, 강성이 큰 벽일수록 변위가 작다', () => {
  assert.ok(ppv(10) > ppv(40) && ppv(40) > ppv(120));
  assert.equal(ppvLimit('high'), 0.3);
  assert.ok(pileNoise(10) > pileNoise(60) && pileNoise(60) > pileNoise(200));
  const r = R('office');
  const soft = wallMove({ ...r.fx.ids, wall: 'hpile', support: 'anchor' }, r.fx, r.d, r.cond);
  const stiff = wallMove({ ...r.fx.ids, wall: 'dwall', support: 'topdown' }, r.fx, r.d, r.cond);
  [soft, stiff].forEach(m => assert.ok(Number.isFinite(m.defl) && Number.isFinite(m.total) && m.total >= 0));
  assert.ok(stiff.defl < soft.defl, `D-wall+역타 ${stiff.defl} < H-pile+앵커 ${soft.defl}`);
});

test('선택지별 공기·비용 차이와 전통 공법 대비가 유한한 숫자', () => {
  ['office', 'housing'].forEach(id => {
    const r = R(id);
    ['wall', 'excav', 'frame', 'lift'].forEach(wp => {
      const b = vsBaseline(r, wp);
      if (!b.na) ['days', 'cost', 'q', 's'].forEach(k => assert.ok(Number.isFinite(b[k]), `${id} ${wp} vsBaseline.${k}`));
      const w = WPS.find(x => x.id === wp);
      w.opts.slice(0, 3).forEach(o => {
        const dl = delta(r, wp, o.id);
        if (dl) ['days', 'cost'].forEach(k => assert.ok(Number.isFinite(dl[k]), `${id} ${wp}:${o.id} delta.${k}`));
      });
    });
  });
});

test('시공 시뮬레이션: 모든 공종 · 진행률 · 화면 폭에서 SVG가 깨지지 않는다', () => {
  USES_T.forEach(id => {
    const r = R(id), sc = makeScene(r, WPS.map(w => w.id));
    WPS.forEach(w => {
      const win = winFor(sc, w.id);
      assert.ok(Number.isFinite(win.s) && Number.isFinite(win.e), `${id} ${w.id} win`);
      [0, 0.37, 1].forEach(p => [false, true].forEach(narrow => {
        const f = frame(sc, w.id, p, 2.1, roiFor(sc, w.id), [{ n: 1, mark: 'truck', sev: 2 }], { narrow });
        assert.ok(f.svg.startsWith('<svg') && f.svg.endsWith('</svg>'), `${id} ${w.id} ${p}`);
        assert.ok(!/NaN|undefined|Infinity/.test(f.svg), `${id} ${w.id} p=${p} narrow=${narrow}: 잘못된 좌표`);
        assert.ok(f.svg.includes(narrow ? 'viewBox="0 0 480 560"' : 'viewBox="0 0 960 540"'));
        assert.ok(Number.isFinite(f.tau) && f.tau >= 0);
      }));
    });
  });
});

test('시뮬레이션은 아직 확정하지 않은 공종을 확정된 것처럼 그리지 않는다', () => {
  const r = R('office');
  const known = makeScene(r, WPS.map(w => w.id)), none = makeScene(r, ['survey']);
  const a = frame(known, 'survey', 0.5, 0, roiFor(known, 'survey')).svg;
  const b = frame(none, 'survey', 0.5, 0, roiFor(none, 'survey')).svg;
  assert.ok(typeof a === 'string' && typeof b === 'string');
  const exA = frame(known, 'excav', 0.6, 0, roiFor(known, 'excav')).svg;
  const exB = frame(makeScene(r, WP_ORDER.slice(0, 5)), 'excav', 0.6, 0, roiFor(known, 'excav')).svg;
  assert.notEqual(exA, exB, '굴착 공법을 아직 고르지 않으면 장비가 다르게(흐리게) 그려져야 한다');
});
