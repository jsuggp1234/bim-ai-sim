// 택지 주변 맥락 고르기: 먼저 바로 쓸 수 있는 맥락(용산은 손으로 정리한 지형, 그 밖은 자동 생성)을 쓰고,
// 실제 지도(OpenStreetMap)를 받으면 바꾼다. 분석에 쓰는 주변 건물 상자도 여기서 한 번만 만든다.
// 지도는 두 번에 나눠 온다: ① 대지 둘레(약 450m, 몇 초) ② 넓은 주변(1~2.7km). ①이 오면 바로 그 지도로 대지를 맞추고(sitefit.js) 주변을 그린다.
import { proceduralContext, yongsanPreset, clearSite, nearBoxes } from './ctxmodel.js';
import { loadOSM } from './osm.js';

const mem = new Map();      // 계획(대지 자리)별로 대지를 비운 맥락
const rawMem = new Map();   // 택지 좌표별 원본 지도 { near, full }
const pending = new Map();
const near = new WeakMap();

const siteKey = (s) => s.lat.toFixed(5) + ',' + s.lng.toFixed(5);
const planKey = (plan) => [plan.SITE.u0, plan.SITE.u1, plan.SITE.v0, plan.SITE.v1].map(Math.round).join(',') + ':' + plan.rotDeg + ':' + (plan.off ? plan.off.map(Math.round).join(',') : '0,0');

export function fallbackFor(plan) {
  const k = 'fb:' + plan.key + ':' + planKey(plan);
  if (!mem.has(k)) mem.set(k, clearSite(plan.key === 'yongsan' ? yongsanPreset(plan) : proceduralContext(plan.site, plan), plan));
  return mem.get(k);
}

// 원본 지도(대지를 비우기 전). opts.onNear(raw): 대지 둘레 지도가 먼저 왔을 때
function rawFor(site, opts = {}) {
  const k = siteKey(site), e = rawMem.get(k) || {};
  if (e.full) return Promise.resolve(e.full);
  if (e.near && opts.onNear) opts.onNear(e.near);
  if (opts.cacheOnly && e.near) return Promise.resolve(e.near);
  // 같은 택지를 여러 화면이 동시에 청하면 한 번만 받는다 (취소 신호가 없는 요청끼리)
  const share = !opts.signal && !opts.cacheOnly;
  if (share && pending.has(k)) { const p = pending.get(k); if (opts.onNear) p.nearCbs.push(opts.onNear); return p.promise; }
  const nearCbs = opts.onNear && !e.near ? [opts.onNear] : [];
  const promise = loadOSM(site, {
    onStep: opts.onStep, signal: opts.signal, cacheOnly: opts.cacheOnly,
    onNear: (n) => { const cur = rawMem.get(k) || {}; if (!cur.near) { cur.near = n; rawMem.set(k, cur); nearCbs.forEach(f => { try { f(n); } catch (err) { /* 화면 쪽 오류는 지도 받기를 막지 않는다 */ } }); } },
  }).then((ctx) => { const cur = rawMem.get(k) || {}; if (ctx.partial) cur.near = cur.near || ctx; else cur.full = ctx; rawMem.set(k, cur); return ctx; })
    .finally(() => { if (pending.get(k) && pending.get(k).promise === promise) pending.delete(k); });
  if (share) pending.set(k, { promise, nearCbs });
  return promise;
}
export const rawReady = (site) => { const e = rawMem.get(siteKey(site)); return e ? (e.full || e.near || null) : null; };

// 실제 지도 (대지 자리는 비움). cacheOnly면 브라우저에 저장된 것만 쓴다(홈 화면처럼 기다리지 않을 곳)
// opts.onNear(ctx, raw): 대지 둘레 지도가 먼저 왔을 때 (ctx는 대지를 비운 것, raw는 원본)
export async function osmFor(plan, opts = {}) {
  const s = plan.site, k = 'osm:' + siteKey(s) + ':' + planKey(plan);
  if (mem.has(k) && !mem.get(k).partial) return mem.get(k);
  const raw = await rawFor(s, { ...opts, onNear: opts.onNear ? (n) => opts.onNear(clearSite({ ...n }, plan), n) : null });
  const ctx = clearSite({ ...raw }, plan);
  mem.set(k, ctx);
  return ctx;
}
export const osmReady = (plan) => {
  const k = 'osm:' + siteKey(plan.site) + ':' + planKey(plan);
  const cur = mem.get(k), raw = rawReady(plan.site);
  if (cur && (!cur.partial || !raw || raw.partial)) return cur;
  // 다른 화면에서 이미 받은 원본(또는 그사이 도착한 넓은 지도)이 있으면 이 계획에 맞게 비워서 쓴다
  if (!raw) return null;
  const ctx = clearSite({ ...raw }, plan); mem.set(k, ctx); return ctx;
};

// 일조·조망 분석용 주변 건물 상자 (대지 경계에서 300m 안, 같은 맥락이면 같은 배열)
export function analysisBoxes(ctx, plan) {
  let m = near.get(ctx);
  if (!m) { m = new Map(); near.set(ctx, m); }
  if (!m.has(plan)) m.set(plan, nearBoxes(ctx, plan, 300));
  return m.get(plan);
}
