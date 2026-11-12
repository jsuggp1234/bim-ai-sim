// 입지 평가: 후보지 속성 × 용도 가중치 → 적합도. 항목 점수(0~100)와 가중 기여, 강점·약점 문장을 함께 돌려준다.
import { USES, useOf, CRITERIA, CRIT_KEYS } from './uses.js';
import { KR_SITES, COMPAT, GROUND } from './kr-sites.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// 지반 민감 용도: 진동·중량물 (팹·데이터센터·병원 영상장비·플랜트)
const VIB = new Set(['fab', 'dc', 'hospital', 'chem', 'power', 'bio']);
// 깊은 지하층을 두는 용도: 지하수위가 높을수록 불리
const DEEP = new Set(['housing', 'mixed', 'office', 'retail', 'hotel', 'hospital', 'water', 'arena']);

export function critValue(site, use, k) {
  const a = site.a, u = useOf(use);
  switch (k) {
    case 'transit': return a.t;
    case 'road': return a.r;
    case 'port': return a.p;
    case 'air': return a.a;
    case 'power': return a.e;
    case 'water': return a.w;
    case 'labor': return a.l;
    case 'demand': return a.d;
    case 'tour': return a.v;
    case 'landc': return clamp(Math.round(100 * (1 - Math.log10(Math.max(a.$, 30) / 30) / 2.3)), 0, 100);
    case 'ground': {
      const G = GROUND[a.g] || GROUND.W;
      let s = G.bearing;
      if (VIB.has(u.id)) s = s * 1.05 - G.soft * 25;
      if (DEEP.has(u.id)) s -= clamp((7 - a.gw) * 4, 0, 24);
      return clamp(Math.round(s), 0, 100);
    }
    case 'safety': return clamp(100 - a.f, 0, 100);
    case 'buffer': return a.b;
    case 'scale': {
      const [mn, ideal] = u.area;
      if (site.area >= ideal) return 100;
      if (site.area <= mn * 0.5) return 0;
      return clamp(Math.round(100 * (site.area - mn * 0.5) / (ideal - mn * 0.5)), 0, 100);
    }
    case 'policy': return a.pol;
    default: return 50;
  }
}
export function compatOf(site, use) {
  if (site.focus && site.focus.includes(use)) return 1;
  return Math.max(0, ...site.kinds.map(k => (COMPAT[k] && COMPAT[k][use]) || 0));
}

// 한 후보지의 용도별 적합도. weights를 주면 그 가중치(사용자 조정)를 쓴다
export function scoreSite(site, useId, weights) {
  const u = useOf(useId), w = weights || u.w;
  const parts = {};
  let sw = 0, acc = 0;
  CRIT_KEYS.forEach(k => {
    const wk = w[k] || 0; if (!wk) return;
    const v = critValue(site, u.id, k);
    parts[k] = { v, w: wk };
    sw += wk; acc += wk * v;
  });
  const base = sw ? acc / sw : 0;
  const compat = compatOf(site, u.id);
  const focus = !!(site.focus && site.focus.includes(u.id));
  // 점수 폭을 넓혀(평균 근처 62점 기준) 후보 사이 차이가 보이게 한 뒤, 부지 성격 적합도와 지정 여부를 곱·더한다
  const spread = clamp(52 + (base - 64) * 1.55, 3, 97);
  const score = Math.round(clamp(spread * (0.55 + 0.45 * compat) + (focus ? 4 : 0), 1, 98));
  const eligible = compat >= 0.5 && (parts.scale ? parts.scale.v >= 20 : true);
  // 강점·약점: 가중 기여가 큰 항목 중 점수 높은 것 / 낮은 것
  const ranked = Object.entries(parts).map(([k, p]) => ({ k, ...p, c: p.w * (p.v - base) }));
  const strong = ranked.filter(x => x.v >= 70).sort((a, b) => b.w * b.v - a.w * a.v).slice(0, 3);
  const weak = ranked.filter(x => x.v < 55).sort((a, b) => b.w * (100 - b.v) - a.w * (100 - a.v)).slice(0, 2);
  return { site, use: u.id, score, base: Math.round(base), compat, focus, parts, eligible, strong, weak };
}

// 용도에 맞는 후보지 목록 (적합도 순)
export function rankSites(useId, { weights, region = null, sites = KR_SITES } = {}) {
  return sites.map(s => scoreSite(s, useId, weights))
    .filter(r => r.eligible && (!region || r.site.reg === region))
    .sort((a, b) => b.score - a.score);
}
// 용도마다 갈 수 있는 후보지 수
export function eligibleCount(useId) { return KR_SITES.reduce((n, s) => n + (scoreSite(s, useId).eligible ? 1 : 0), 0); }

// 한 줄 이유 (강점 → 약점)
export function reasonLine(r) {
  const s = r.strong.map(x => `${CRITERIA[x.k].name} ${x.v}`).join(' · ');
  const w = r.weak.map(x => `${CRITERIA[x.k].name} ${x.v}`).join(' · ');
  return [s && `강점 ${s}`, w && `약점 ${w}`].filter(Boolean).join(' / ');
}

// 이 용도로 이 부지에 지을 규모 (1단계 구역 시뮬레이션 면적 포함)
export function programFor(site, useId) {
  const u = useOf(useId);
  const simArea = Math.min(site.area, u.sim);
  const net = site.netRatio && u.gen === 'housing' ? site.netRatio : u.net;
  const far = u.gen === 'housing' && site.far ? site.far : u.far;
  const gfa = simArea * net / 100 * far / 100;
  let units = null;
  if (u.gen === 'housing') {
    const avg = site.avgUnit || (u.id === 'mixed' ? 74 : 59);
    const res = u.id === 'mixed' ? (u.resShare || 55) / 100 : (site.resShare ?? 100) / 100;
    units = site.units && u.id === 'housing' ? Math.round(site.units * simArea / site.area) : Math.round(gfa * res * 0.72 / avg);
  }
  const cost = gfa * 1.25 * u.cost; // 지하 포함 대략 (만원)
  return { simArea, phase: simArea < site.area, net, far, gfa, units, cost, months: u.months };
}
export { USES };
