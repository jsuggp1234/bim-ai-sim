// 택지 주변 맥락 고르기: 먼저 바로 쓸 수 있는 맥락(용산은 손으로 정리한 지형, 그 밖은 자동 생성)을 쓰고,
// 실제 지도(OpenStreetMap)를 받으면 바꾼다. 분석에 쓰는 주변 건물 상자도 여기서 한 번만 만든다.
import { proceduralContext, yongsanPreset, clearSite, nearBoxes } from './ctxmodel.js';
import { loadOSM } from './osm.js';

const mem = new Map();
const near = new WeakMap();

export function fallbackFor(plan) {
  const k = 'fb:' + plan.key + ':' + [plan.SITE.u0, plan.SITE.u1, plan.SITE.v0, plan.SITE.v1].map(Math.round).join(',') + ':' + plan.rotDeg;
  if (!mem.has(k)) mem.set(k, clearSite(plan.key === 'yongsan' ? yongsanPreset(plan) : proceduralContext(plan.site, plan), plan));
  return mem.get(k);
}

// 실제 지도. cacheOnly면 브라우저에 저장된 것만 쓴다(홈 화면처럼 기다리지 않을 곳)
export async function osmFor(plan, opts = {}) {
  const s = plan.site;
  const k = 'osm:' + s.lat.toFixed(5) + ',' + s.lng.toFixed(5) + ':' + [plan.SITE.u0, plan.SITE.u1, plan.SITE.v0, plan.SITE.v1].map(Math.round).join(',') + ':' + plan.rotDeg;
  if (mem.has(k)) return mem.get(k);
  const ctx = await loadOSM(s, opts);
  clearSite(ctx, plan);
  mem.set(k, ctx);
  return ctx;
}
export const osmReady = (plan) => {
  const s = plan.site;
  return mem.get('osm:' + s.lat.toFixed(5) + ',' + s.lng.toFixed(5) + ':' + [plan.SITE.u0, plan.SITE.u1, plan.SITE.v0, plan.SITE.v1].map(Math.round).join(',') + ':' + plan.rotDeg) || null;
};

// 일조·조망 분석용 주변 건물 상자 (대지 경계에서 300m 안, 같은 맥락이면 같은 배열)
export function analysisBoxes(ctx, plan) {
  let m = near.get(ctx);
  if (!m) { m = new Map(); near.set(ctx, m); }
  if (!m.has(plan)) m.set(plan, nearBoxes(ctx, plan, 300));
  return m.get(plan);
}
