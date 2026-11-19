// 단계 사이에 넘기는 값과 각 단계의 설정을 한곳에 보관한다 (브라우저 저장소)
import { resolveSite } from './sim/sites.js';
import { fitSite } from './sim/sitefit.js';
const KEY = 'bim-sim-pipeline-v1';
const listeners = new Set();
const blank = () => ({ use: 'housing', handoff1: null, site: null, useMap: true, useFit: true, siteFit: {}, siteFacts: {}, mass: null, massFrom: null, massx: {}, methods: {}, mdone: {}, opt: {}, siteW: {}, proc: null, cost: null, risk: null, seen3: false });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return { ...blank(), ...s };
  } catch (e) { /* 저장소를 쓸 수 없으면 기본값 */ }
  return blank();
}
let state = load();

export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 저장 실패는 무시 */ }
    listeners.forEach(f => f(state));
  },
  subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 1단계 평균 전용면적 → 2단계 평형 구성(59·84·114㎡). 오피스텔(45㎡) 비중을 빼고 아파트 평균을 맞춘다
export function mixForAverage(avgUnit, officetelShare) {
  const s = officetelShare / 100;
  const t = clamp(s < 1 ? (avgUnit - s * 45) / (1 - s) : 84, 59, 114);
  let m59, m84, m114;
  if (t <= 71.5) { m114 = 0; m59 = (8400 - 100 * t) / 25; m84 = 100 - m59; }
  else if (t < 99) { m84 = 50; m59 = (9900 - 100 * t) / 55; m114 = 50 - m59; }
  else { m59 = 0; m114 = (100 * t - 8400) / 30; m84 = 100 - m114; }
  const r = [m59, m84, m114].map(v => Math.round(clamp(v, 0, 100)));
  r[1] = 100 - r[0] - r[2];
  return { mix59: r[0], mix84: r[1], mix114: r[2], aptAvg: t };
}

// 1단계 결과 → 2단계 변수 (택지 성격: 최고 층수·용도지역·비주거 비율을 함께 넘긴다)
export function massParamsFromStage1(h, defaults) {
  const housingTarget = clamp(Math.round(h.units / 50) * 50, 100, 30000);
  const yongsan = !h.siteId || h.siteId === 'yongsan';
  const officetelShare = yongsan ? defaults.officetelShare : (h.resShare != null && h.resShare < 100 ? 30 : 0);
  const mix = mixForAverage(h.avgUnit, officetelShare);
  const out = { ...defaults, housingTarget, officetelShare, mix59: mix.mix59, mix84: mix.mix84, mix114: mix.mix114, rentalShare: clamp(Math.round(h.rentalShare), 0, 100) };
  if (!yongsan && h.maxFloors) {
    const mf = clamp(Math.round(h.maxFloors), 7, 130);
    Object.assign(out, { resMaxFloors: mf, riverFrontMax: clamp(Math.round(mf * 0.75), 5, mf), skylineWest: 80, typology: mf <= 15 ? 'slab' : 'tower', podiumRes: mf <= 15 ? 1 : 2 });
    if (h.zoning) out.resZone = h.zoning;
  }
  return out;
}

// 지금 고른 택지 (선택이 없으면 1단계에서 넘긴 택지, 그것도 없으면 용산)
// baseSite: 후보지 자료 그대로(좌표·면적, 임의 방향). currentSite: 실제 지도에 맞춘 자리(siteFit)가 있으면 그것을 얹은 것
export function baseSite(s = state) {
  const sel = s.site || (s.handoff1 && s.handoff1.siteId ? { id: s.handoff1.siteId } : null);
  return resolveSite(sel, s.use || 'housing');
}
export const fitKey = (site) => `${(+site.lat).toFixed(5)},${(+site.lng).toFixed(5)}|${Math.round(site.area)}`;
// 손으로 그린 용산 계획과, 방향·비례를 직접 넣은 택지는 맞추지 않는다
const fitable = (site) => !(site.id === 'yongsan' && !site.generic) && !site.manual;
export function applyFit(site, s = state) {
  if (!site || s.useFit === false || !fitable(site)) return site;
  const f = (s.siteFit || {})[fitKey(site)];
  if (!f || !Array.isArray(f.off)) return site;
  return { ...site, rot: f.rot, aspect: f.aspect, off: f.off, fit: f, rot0: site.rot, aspect0: site.aspect };
}
export const currentSite = (s = state) => applyFit(baseSite(s), s);
// 지도 원본이 오면 대지를 한 번 맞춘다. 대지 자리가 바뀌었으면 true
export function fitFromMap(raw) {
  const s = state, base = baseSite(s);
  if (!raw || raw.source !== 'osm' || s.useFit === false || !fitable(base)) return false;
  const k = fitKey(base);
  if ((s.siteFit || {})[k]) return false;
  let f = null;
  try { f = fitSite(raw, base); } catch (e) { f = null; }
  if (!f) return false;
  const all = { ...(s.siteFit || {}) }, keys = Object.keys(all);
  if (keys.length > 40) keys.slice(0, keys.length - 40).forEach(x => delete all[x]);
  all[k] = { rot: f.rot, aspect: f.aspect, off: f.off, moved: f.moved, byRoads: f.byRoads, partial: !!raw.partial };
  store.set({ siteFit: all });
  return true;
}
// 지도에서 읽은 대지 둘레 상황(가장 가까운 건물·도로·철도 …)을 저장해 뒤 단계가 쓴다
export function saveFacts(site, facts) {
  if (!site || !facts) return false;
  const s = state, k = fitKey(site), prev = (s.siteFacts || {})[k];
  const rec = { adj: facts.adj, adjH: facts.adjH, adjSide: facts.adjSide, nB: facts.nB, maxH: facts.maxH, openSides: facts.openSides, rail: facts.rail, road: facts.road, water: facts.water, partial: facts.partial,
    rows: facts.rows.map(r => ({ dir: r.dirKo, open: r.open, bld: r.bld ? { d: Math.round(r.bld.d), h: r.bld.h } : null, road: r.road ? { d: Math.round(r.road.d), w: r.road.w, name: r.road.name, rank: r.road.rank } : null })) };
  if (prev && JSON.stringify(prev) === JSON.stringify(rec)) return false;
  const all = { ...(s.siteFacts || {}) }, keys = Object.keys(all);
  if (keys.length > 40) keys.slice(0, keys.length - 40).forEach(x => delete all[x]);
  all[k] = rec;
  store.set({ siteFacts: all });
  return true;
}
export const factsFor = (site, s = state) => (site && (s.siteFacts || {})[fitKey(site)]) || null;
export const currentUse = (s = state) => s.use || 'housing';
// 택지 기본값으로 시작하는 2단계 변수
export function paramsForSite(site, defaults) {
  if (site.id === 'yongsan') return { ...defaults };
  return massParamsFromStage1({ siteId: site.id, units: site.units, avgUnit: site.avgUnit, rentalShare: site.rentalShare, maxFloors: site.maxFloors, zoning: site.zoning, resShare: site.resShare }, defaults);
}
