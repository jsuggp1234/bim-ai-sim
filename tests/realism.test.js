// 현실감 개선 검증: 시간 렌즈(한 층 자세히 + 반복 층 빨리 감기) · 차량 추종 · 걸음 · 매스 배치 방식
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { useOf } from '../src/sim/uses.js';
import { rankSites } from '../src/sim/siting.js';
import { siteFrom } from '../src/sim/sites.js';
import { DEFAULTS, generate, LAYOUTS } from '../src/sim/massing.js';
import { XDEF, generateX } from '../src/sim/massx.js';
import { quantities } from '../src/sim/quantities.js';
import { paramsForSite } from '../src/store.js';
import { siteConditions, derive, resolveMethods, WPS } from '../src/sim/methods.js';
import { schedule, P4_DEFAULTS } from '../src/sim/process.js';
import { makeScene, winFor, lensFor, lensAt, tauAt, stepAt, stepToP, stageOf } from '../src/ui/buildsim.js';
import { buildTraffic } from '../src/ui/traffic3d.js';
import { _gait } from '../src/ui/crew3d.js';

globalThis.performance ??= { now: () => Date.now() };
function scene(id) {
  const u = useOf(id), site = siteFrom(rankSites(id)[0].site.id, {}, id);
  const mp = u.gen === 'housing' ? { ...paramsForSite(site, DEFAULTS), site } : { ...XDEF[id], use: id, site };
  const gen = u.gen === 'housing' ? generate(mp) : generateX(mp);
  const Q = quantities(gen), cond = siteConditions(site, gen, Q), d = derive(cond, gen, Q, site);
  const M = resolveMethods(cond, d, {}), S = schedule(gen, Q, { ...P4_DEFAULTS, fx: M.fx });
  return makeScene({ use: id, u, site, gen, Q, cond, d, M, fx: M.fx, S }, WPS.map(w => w.id));
}

test('시간 렌즈: 재생 위치 → 날짜가 창 안에서 단조 증가하고 처음·끝이 창과 맞는다', () => {
  ['office', 'housing', 'logistics'].forEach(id => {
    const sc = scene(id);
    WPS.forEach(w => {
      const win = winFor(sc, w.id); if (win.skip) return;
      let prev = -Infinity;
      for (let i = 0; i <= 200; i++) { const t = tauAt(sc, w.id, i / 200); assert.ok(t >= prev - 1e-9, `${id}/${w.id}: p=${i / 200}에서 날짜가 뒤로 감`); prev = t; }
      assert.ok(Math.abs(tauAt(sc, w.id, 0) - win.s) < 1e-6 && Math.abs(tauAt(sc, w.id, 1) - win.e) < 1e-6, `${id}/${w.id}: 창의 처음·끝`);
    });
  });
});

test('시간 렌즈: 고층 골조 공종은 한 층의 그 단계를 재생의 절반 넘게 보이고 나머지 층은 빨리 감는다', () => {
  const sc = scene('office');
  assert.ok(sc.NF >= 20);
  const want = { form: 0, rebar: 1, pour: 2 };
  ['frame', 'form', 'rebar', 'pour', 'conc', 'steel', 'lift'].forEach(wp => {
    const L = lensFor(sc, wp);
    assert.ok(L, `${wp}: 렌즈가 있어야 한다`);
    assert.ok(L.d1 - L.d0 >= 0.5, `${wp}: 자세히 구간 ${(L.d1 - L.d0).toFixed(2)}`);
    const ff = L.segs.find(s => s.kind === 'ff');
    assert.ok(ff && ff.p1 === 1, `${wp}: 빨리 감기 구간이 끝에 있다`);
    // 자세히 구간의 한가운데는 그 공종의 단계
    const mid = lensAt(sc, wp, (L.d0 + L.d1) / 2);
    assert.equal(mid.kind, 'detail');
    if (wp in want) assert.equal(stageOf(mid.fr), want[wp], `${wp}: 자세히 구간이 그 단계를 보인다`);
    // 자세히 구간에서 하루가 재생의 몇 %인지: 빨리 감기보다 5배 이상 느리다
    const dDet = (L.d1 - L.d0) / L.days, dFf = (ff.p1 - ff.p0) / (ff.t1 - ff.t0);
    assert.ok(dDet > dFf * 5, `${wp}: 자세히 ${dDet.toFixed(4)} vs 빨리 ${dFf.toFixed(4)}`);
  });
  // 타설: 자세히 구간에서 타설 단계(0.6~0.78)가 재생의 40% 넘게
  const L = lensFor(sc, 'pour'); let n = 0;
  for (let i = 0; i <= 1000; i++) { const a = lensAt(sc, 'pour', i / 1000); if (a.kind === 'detail' && stageOf(a.fr) === 2) n++; }
  assert.ok(n / 1000 > 0.4, `타설 단계 비율 ${n / 1000}`);
  // 단계 눈금은 자세히 구간 안에만
  const n4 = 4; assert.equal(stepAt(sc, 'pour', L.d0 - 0.001, n4).k, 0); assert.equal(stepAt(sc, 'pour', 1, n4).k, n4 - 1);
  for (let k = 0; k < n4; k++) { const p = stepToP(sc, 'pour', k, n4); assert.ok(p >= L.d0 && p <= L.d1); assert.equal(stepAt(sc, 'pour', p, n4).k, k); }
});

test('시간 렌즈: 층을 되풀이하지 않는 공종·저층 건물은 고르게 재생한다', () => {
  const sc = scene('office');
  ['survey', 'excav', 'found', 'roof', 'land'].forEach(wp => assert.equal(lensFor(sc, wp), null, wp));
  const a = lensAt(sc, 'excav', 0.5), w = winFor(sc, 'excav');
  assert.equal(a.kind, 'lin'); assert.ok(Math.abs(a.tau - (w.s + w.e) / 2) < 1e-6);
});

test('차량: 앞차를 넘지 않고, 빨간불에 정지선 앞에서 서고, 초록불에 다시 출발한다', () => {
  const inst = (g, m, n) => { const o = new THREE.InstancedMesh(g, m, n); o.count = 0; return o; }, mat = (c) => new THREE.MeshStandardMaterial({ color: c });
  const lanes = [{ x0: 0, x1: 3.3, dir: 1 }, { x0: 3.3, x1: 6.6, dir: 1 }, { x0: 6.6, x1: 9.9, dir: -1 }, { x0: 9.9, x1: 13.2, dir: -1 }];
  const ZC = 120, zx = 60, tr = buildTraffic({ inst, mat, lanes, ZC, zx, seed: 7 });
  let minGap = Infinity, minA = 0, stopped = 0, moved = 0, crossedRed = 0;
  const lineS = (dir) => (dir > 0 ? zx - 4.6 + ZC : ZC - (zx + 4.6));
  for (let T = 0; T < 150; T += 1 / 30) {
    const carGo = (T % 30) / 30 < 0.6;
    const before = tr.vehs.map(v => v.s);
    tr.frame({ T, occ: new Set(), busy: new Set(), carGo });
    lanes.forEach((L, li) => {
      const arr = tr.vehs.filter(v => v.li === li).sort((a, b) => a.s - b.s);
      arr.forEach((V, i) => { const F = arr[(i + 1) % arr.length]; let d = F.s - V.s; if (d <= 0) d += 2 * ZC; minGap = Math.min(minGap, d - (F.kd.L + V.kd.L) / 2); minA = Math.min(minA, V.a); });
    });
    tr.vehs.forEach((V, i) => {
      if (V.v < 0.05) stopped++; else moved++;
      // 빨간불이 켜진 지 4초가 지난 뒤에 정지선을 넘는 차가 없어야 한다
      const ls = lineS(lanes[V.li].dir), f0 = before[i] + V.kd.L / 2, f1 = V.s + V.kd.L / 2;
      if (!carGo && (T % 30) > 22 && f0 < ls && f1 >= ls) crossedRed++;
    });
  }
  assert.ok(minGap > 0.3, `차 사이 최소 간격 ${minGap.toFixed(2)}m`);
  assert.ok(minA >= -6.01, `최대 감속 ${minA.toFixed(2)}`);
  assert.ok(stopped > 200 && moved > stopped, `서 있는 순간 ${stopped}, 움직이는 순간 ${moved}`);
  assert.equal(crossedRed, 0, '빨간불에 정지선을 넘은 차');
});

test('걸음: 딛고 있는 발이 거의 미끄러지지 않고 골반이 4~7cm 오르내린다', () => {
  const TH = 0.44, SH = 0.45;
  let mn = Infinity, mx = -Infinity, hmin = 9, hmax = 0;
  for (let i = 0; i <= 60; i++) {
    const u = i / 100, ph = (u - 0.3) * 2 * Math.PI, o = _gait(ph);
    const foot = ph / 4.6 + TH * Math.sin(o.lL[0]) + SH * Math.sin(o.lL[0] - o.lL[1]);
    mn = Math.min(mn, foot); mx = Math.max(mx, foot); hmin = Math.min(hmin, o.hip); hmax = Math.max(hmax, o.hip);
  }
  assert.ok(mx - mn < 0.15, `디딤 발 이동 ${(mx - mn).toFixed(3)}m`);
  assert.ok(hmax - hmin > 0.03 && hmax - hmin < 0.08, `골반 오르내림 ${(hmax - hmin).toFixed(3)}m`);
  // 한 주기 동안 관절이 튀지 않는다
  let prev = _gait(0), jump = 0;
  for (let i = 1; i <= 400; i++) { const o = _gait(i / 400 * 2 * Math.PI); jump = Math.max(jump, Math.abs(o.lL[0] - prev.lL[0]), Math.abs(o.lL[1] - prev.lL[1]), Math.abs(o.hip - prev.hip) * 5); prev = o; }
  assert.ok(jump < 0.06, `관절 각 최대 변화 ${jump.toFixed(3)}`);
});

test('매스 배치 방식: 여덟 가지 모두 동을 놓고, 자동은 두 열보다 세대를 덜 채우지 않는다', () => {
  const units = (g) => g.bldgs.filter(b => b.kind === 'apt').reduce((s, b) => s + b.floors.reduce((a, f) => a + (f.units || 0), 0), 0);
  const site = siteFrom(rankSites('housing')[0].site.id, {}, 'housing'), base = { ...paramsForSite(site, DEFAULTS), site };
  const sig = new Set();
  Object.keys(LAYOUTS).forEach(lay => {
    ['tower', 'slab'].forEach(ty => {
      const g = generate({ ...base, layout: lay, typology: ty }), apt = g.bldgs.filter(b => b.kind === 'apt');
      assert.ok(apt.length >= 2, `${lay}/${ty}: 주거동 ${apt.length}`);
      apt.forEach(b => b.parts.forEach(q => assert.ok(Number.isFinite(q.u0 + q.u1 + q.v0 + q.v1 + q.a), `${lay}/${ty}: 좌표`)));
      sig.add(apt.map(b => `${Math.round(b.core.u)},${Math.round(b.core.v)},${b.parts[0].a.toFixed(2)}`).join('|'));
    });
  });
  assert.ok(sig.size >= 10, `서로 다른 배치 ${sig.size}가지`);
  ['slab', 'l', 'tower'].forEach(ty => {
    const a = units(generate({ ...base, layout: 'auto', typology: ty })), r = units(generate({ ...base, layout: 'rows', typology: ty }));
    assert.ok(a >= r, `${ty}: 자동 ${a} ≥ 두 열 ${r}`);
  });
  // 둘레 배치: 동·서 변의 동은 90° 돌아 있다
  const ring = generate({ ...base, layout: 'ring', typology: 'slab' }).bldgs.filter(b => b.kind === 'apt');
  assert.ok(ring.some(b => Math.abs(Math.abs(b.parts[0].a) - Math.PI / 2) < 0.01), '둘레 배치에 돌려 세운 동이 있다');
  // 사선: 모든 동이 같은 각
  const dg = generate({ ...base, layout: 'diag', typology: 'slab', rot: 20 }).bldgs.filter(b => b.kind === 'apt');
  assert.ok(dg.every(b => Math.abs(b.parts[0].a - 20 * Math.PI / 180) < 0.01), '사선 배치 각');
});

test('가로 모델: 지도에서 읽은 인접 건물 높이·앞 도로 폭이 공법 단계 장면에 반영된다', async () => {
  const { streetModel } = await import('../src/sim/street.js');
  const base = { pw: 60, adj: 12, noise: 'high', ground: 'W', seed: 't' };
  // 도로 폭 → 차로 수 (좁으면 2, 넓으면 6), 값이 없으면 가로 유형대로
  assert.equal(streetModel({ ...base, nb: { x1: -12, x0: -34, h: 34, b: 7, urban: true } }).lanes.length, 4);
  assert.equal(streetModel({ ...base, nb: { x1: -12, x0: -34, h: 34, b: 7, urban: true }, roadW: 8 }).lanes.length, 2);
  const wide = streetModel({ ...base, nb: { x1: -12, x0: -34, h: 34, b: 7, urban: true }, roadW: 40, roadName: '한강대로' });
  assert.equal(wide.lanes.length, 6); assert.equal(wide.roadName, '한강대로');
  assert.ok(wide.lanes.slice(0, 3).every(l => l.dir === -1) && wide.lanes.slice(3).every(l => l.dir === 1));
  assert.ok(wide.utils.every(u => Number.isFinite(u.x)));
  // 실제 높이 → 층수·건물 종류: 60m면 업무·오피스텔 15층 안팎, 6m면 주택 2층
  const tall = streetModel({ ...base, adj: 25, nb: { x1: -25, x0: -47, h: 60, b: 7, urban: true, real: true } }).nb;
  assert.ok(['office', 'officetel', 'mixed'].includes(tall.kind) && tall.fl.length >= 14 && tall.fl.length <= 20, `${tall.kind} ${tall.fl.length}`);
  const low = streetModel({ ...base, nb: { x1: -12, x0: -34, h: 6, b: 1.2, urban: true, real: true } }).nb;
  assert.equal(low.kind, 'house'); assert.equal(low.fl.length, 2);
  // 장면: 지도 값이 있으면 그 높이, 150m 안에 건물이 없으면 낮은 먼 시설
  const R0 = scene('office').R;
  const a = makeScene({ ...R0, cond: { ...R0.cond, fromMap: true, adj: 18, adjH: 52, adjOpen: false, roadW: 30, roadName: '테스트로' } }, []);
  assert.equal(a.nb.h, 52); assert.equal(a.nb.real, true); assert.equal(a.city.lanes.length, 6);
  const b = makeScene({ ...R0, cond: { ...R0.cond, fromMap: true, adj: 120, adjH: 0, adjOpen: true } }, []);
  assert.equal(b.nb.open, true); assert.ok(b.nb.h <= 8 && !b.nb.real);
  const c = makeScene({ ...R0 }, []);
  assert.ok(!c.nb.real && c.city.lanes.length === scene('office').city.lanes.length);
});

test('매스 낮 장면 색: palette.js의 LIGHT가 styles.css 밝은 화면 --s-* 값과 같다', async () => {
  const { readFileSync } = await import('node:fs');
  const { LIGHT, LIGHT_TOK } = await import('../src/sim/scene/palette.js');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const blk = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const vars = Object.fromEntries([...blk.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const res = (v) => { const m = /^var\(--([a-z0-9-]+)\)$/.exec(v); return m ? vars[m[1]] : v; };
  const camel = (k) => k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const sv = Object.entries(vars).filter(([k]) => k.startsWith('s-'));
  assert.ok(sv.length >= 50);
  sv.forEach(([k, v]) => assert.equal(LIGHT[camel(k)], res(v), k));
  Object.entries(LIGHT_TOK).forEach(([k, v]) => assert.equal(v, vars[k.slice(2)], k));
  // 계획 건물 재료 색은 두 테마 모두에 있어야 한다
  const dark = css.slice(css.indexOf(':root:not([data-theme="light"]) {'));
  ['--s-pj-res', '--s-pj-base', '--s-pj-office', '--s-pj-mech', '--s-pj-glass'].forEach(k => { assert.ok(blk.includes(k + ':'), k); assert.ok(dark.includes(k + ':'), k + ' dark'); });
});
