// 택지 정의: 1단계 후보지 8곳 + 직접 입력. 2~5단계는 모두 이 값에서 시작한다.
// 지형 지물(수변·산·랜드마크)은 대지 중심 기준 월드 좌표(x 동쪽 +, z 남쪽 +, m)로 둔다. 위경도 차이에서 환산한 근사값.
import { SITES } from '../stage1/engine.js';
import { siteById, KR_SITES } from './kr-sites.js';
import { useOf, isHousingGen } from './uses.js';
import { rankSites } from './siting.js';

const M_LAT = 110574;
const mLng = (lat) => 111320 * Math.cos(lat * Math.PI / 180);
// 위경도 → 대지 중심 기준 월드 좌표
export const llToXZ = (lat0, lng0, lat, lng) => [(lng - lng0) * mLng(lat0), -(lat - lat0) * M_LAT];
export const xzToLL = (lat0, lng0, x, z) => [lat0 - z / M_LAT, lng0 + x / mLng(lat0)];

const NAMSAN_TOWER = { name: '남산서울타워', lat: 37.5512, lng: 126.9882, h: 480 };
const line = (x0, z0, x1, z1, n = 31) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), z0 + (z1 - z0) * i / (n - 1)]);

// 후보지별 형상·지형 정보 (rot: 대지 장축이 동쪽에서 남쪽으로 기운 각도, fabric: 지도 없을 때 주변 시가지 성격)
const GEO = {
  yongsan: { rot: 20, fabric: 'yongsan', zoning: 'gc',
    water: { name: '한강', pts: null }, peak: NAMSAN_TOWER, ground: 10 },
  campkim: { rot: -8, fabric: 'mid', zoning: 'semi',
    water: { name: '한강', pts: line(-1500, 1700, 1500, 1640) }, peak: NAMSAN_TOWER, ground: 15 },
  seoripul1: { rot: -18, fabric: 'green', zoning: 'semi',
    water: { name: '양재천', pts: line(-1600, -2150, 1600, -2050) }, peak: { name: '청계산 매봉', lat: 37.4307, lng: 127.0474, h: 582 }, ground: 40 },
  seoripul2: { rot: -10, fabric: 'green', zoning: 'semi',
    water: { name: '양재천', pts: line(700, -1050, 2700, -1450) }, peak: { name: '우면산', lat: 37.4735, lng: 127.0090, h: 293 }, ground: 40 },
  taereung: { rot: 0, fabric: 'apt', zoning: 'semi',
    water: { name: '중랑천', pts: line(-2650, -1600, -2600, 1600) }, peak: { name: '불암산', lat: 37.6613, lng: 127.0997, h: 508 }, ground: 40 },
  smc: { rot: -22, fabric: 'high', zoning: 'semi',
    water: { name: '한강', pts: line(-1600, -1300, 1600, -1150) }, peak: { name: '롯데월드타워', lat: 37.5126, lng: 127.1025, h: 555 }, ground: 15 },
  horse: { rot: -10, fabric: 'mixed', zoning: 'semi',
    water: { name: '한강', pts: line(-1500, 1250, 1500, 1350) }, peak: NAMSAN_TOWER, ground: 15 },
  guryong: { rot: -25, fabric: 'green', zoning: 'semi',
    water: { name: '양재천', pts: line(-1600, -700, 1600, -620) }, peak: { name: '구룡산', lat: 37.4672, lng: 127.0583, h: 306 }, ground: 50 },
};

export const FABRICS = {
  yongsan: '용산 (한강변 고밀)', high: '고층 업무·주상복합', mixed: '중층 혼합(준공업·상업)', mid: '중층 주거·상업', apt: '아파트 단지', green: '녹지·저층 주거',
};

const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
const FABRIC_OF = { urban: 'high', renewal: 'apt', research: 'mid', medical: 'mid', culture: 'mid' };
// 전국 후보지 → 설명자 (용도마다 시뮬레이션 면적 상한: 큰 지구는 1단계 구역)
function krBase(kr, u) {
  const simArea = Math.min(kr.area, u.sim);
  const k = simArea / kr.area;
  const mixed = u.id === 'mixed';
  const fabric = kr.kinds.map(x => FABRIC_OF[x]).find(Boolean) || (kr.reg === 'SEL' ? 'mid' : 'green');
  const avgUnit = kr.avgUnit || (mixed ? 74 : 59);
  const netRatio = kr.netRatio || (mixed ? 50 : 45);
  let units = kr.units ? Math.round(kr.units * k) : null;
  const far = kr.far || (units ? Math.round(Math.min(420, Math.max(140, units * avgUnit / 0.72 / (simArea * netRatio / 100) * 100))) : (mixed ? 600 : 220));
  if (!units) units = Math.round(simArea * netRatio / 100 * far / 100 * (mixed ? 0.55 : 1) * 0.72 / avgUnit);
  return {
    id: kr.id, name: kr.name, gu: kr.city, dong: '', lat: kr.lat, lng: kr.lng, area: simArea, fullArea: kr.area, phase: simArea < kr.area - 1,
    aspect: kr.aspect || 1.3 + hash(kr.id) * 0.45, units, netRatio, far, maxFloors: kr.maxFloors || (mixed ? 55 : kr.reg === 'SEL' ? 35 : 30), avgUnit,
    rentalShare: kr.rentalShare ?? 35, resShare: mixed ? (u.resShare || 55) : (kr.resShare ?? 100), rot: Math.round((hash(kr.id + 'r') - 0.5) * 28),
    fabric, zoning: 'semi', ground: 15, region: kr.region, reg: kr.reg, kinds: kr.kinds, a: kr.a,
  };
}

// 택지 설명자: 모든 단계가 쓰는 최소 정보. useId가 공동주택 계열이 아니면 1단계 계획(용산 수작업 계획) 대신 일반 격자를 쓴다
export function siteFrom(id, over = {}, useId = 'housing') {
  const u = useOf(useId);
  const s = SITES.find(x => x.id === id);
  const g = GEO[id] || {};
  const kr = siteById(id);
  if (!s && kr) {
    const d = { ...krBase(kr, u), ...over, use: u.id, generic: !isHousingGen(u) };
    d.features = featuresOf(d, g);
    return d;
  }
  const base = s ? {
    id: s.id, name: s.name, gu: s.gu, dong: s.dong, lat: s.lat, lng: s.lng, area: s.area, aspect: s.aspect || 1.5,
    units: s.plannedUnits, netRatio: s.p.netRatio, far: s.p.far, maxFloors: s.p.maxFloors, avgUnit: s.p.avgUnit,
    rentalShare: s.p.rentalShare, resShare: s.p.resShare, rot: g.rot || 0, fabric: g.fabric || 'mid', zoning: g.zoning || 'semi', ground: g.ground || 15,
  } : { ...CUSTOM_DEFAULT };
  const d = { ...base, ...over, use: u.id };
  if (kr) Object.assign(d, { region: kr.region, reg: kr.reg, kinds: kr.kinds, a: kr.a, fullArea: kr.area });
  if (!isHousingGen(u)) {
    d.generic = true;
    if (d.area > u.sim) { d.fullArea = d.area; d.area = u.sim; d.phase = true; }
  }
  d.features = featuresOf(d, g);
  return d;
}

export const CUSTOM_DEFAULT = {
  id: 'custom', name: '직접 입력한 택지', gu: '', dong: '', lat: 37.5665, lng: 126.978, area: 120000, aspect: 1.5,
  units: 2500, netRatio: 45, far: 250, maxFloors: 35, avgUnit: 59, rentalShare: 30, resShare: 100, rot: 0, fabric: 'mid', zoning: 'semi', ground: 15,
};

// 조망 대상: 수변(표본점 목록)과 산·랜드마크(한 점). 월드 좌표
function featuresOf(d, g) {
  const out = { water: null, peak: null };
  const w = d.water || g.water;
  if (w && w.pts) out.water = { name: w.name, pts: w.pts };
  const pk = d.peak || g.peak;
  if (pk) {
    const [x, z] = pk.lat != null ? llToXZ(d.lat, d.lng, pk.lat, pk.lng) : [pk.x, pk.z];
    out.peak = { name: pk.name, x, z, h: Math.max(30, pk.h - (d.ground || 15)) };
  }
  return out;
}

export const SITE_IDS = SITES.map(s => s.id);
export const ALL_SITE_IDS = KR_SITES.map(s => s.id);
export const DEFAULT_SITE_ID = 'yongsan';
export const siteName = (id) => (siteById(id) || SITES.find(s => s.id === id) || CUSTOM_DEFAULT).name;
// 저장소에 둔 택지 선택(id + 바꾼 값) → 설명자
// 택지를 아직 고르지 않았으면: 공동주택 계열은 용산, 그 밖의 용도는 그 용도 적합도 1순위 후보지
const topFor = new Map();
function defaultSiteFor(useId) {
  if (isHousingGen(useId)) return DEFAULT_SITE_ID;
  if (!topFor.has(useId)) { const r = rankSites(useId); topFor.set(useId, r[0] ? r[0].site.id : DEFAULT_SITE_ID); }
  return topFor.get(useId);
}
export function resolveSite(sel, useId = 'housing') {
  if (!sel) return siteFrom(defaultSiteFor(useId), {}, useId);
  if (sel.id === 'custom') return siteFrom('custom', { ...CUSTOM_DEFAULT, ...sel }, useId);
  if (!siteById(sel.id) && !SITES.find(s => s.id === sel.id)) return siteFrom(defaultSiteFor(useId), {}, useId);
  return siteFrom(sel.id, sel.over || {}, useId);
}
