// 위험 예측: BIM 물량 · 4D 공정 · 현장 조건 · 고른 공법 · 남은 간섭을 묶어 위험 등록부(발생 가능성 P × 영향 I)를 만들고,
// 몬테카를로 시뮬레이션으로 공기·공사비의 확률 분포(P10~P90)를 낸다.
//  - 고유 위험: 전통 공법(기준선)일 때의 P·I
//  - 잔여 위험: 고른 공법·품질 기술·AI 공정 최적화를 반영한 P·I
//  - 영향: 발생하면 주공정에 걸리는 지연(일, 삼각분포) · 추가 비용(직접비 대비 %, 삼각분포)
import { baselineFx } from './methods.js';

export const RISK_CATS = {
  geo: { name: '지반·토목', en: 'GEO', tok: '--g1' },
  safe: { name: '안전', en: 'SAFETY', tok: '--g5' },
  time: { name: '공정', en: 'SCHEDULE', tok: '--g2' },
  cost: { name: '비용', en: 'COST', tok: '--g3' },
  qual: { name: '품질', en: 'QUALITY', tok: '--g4' },
  ext: { name: '외부·인허가', en: 'EXTERNAL', tok: '--g6' },
};
export const RISK_CAT_KEYS = Object.keys(RISK_CATS);
// P 등급 → 공사 기간 중 발생 확률
const PROB = [0, 0.04, 0.1, 0.22, 0.4, 0.6];
export const probOf = (p) => { const k = Math.max(1, Math.min(5, p)), i = Math.floor(k), f = k - i; return i >= 5 ? PROB[5] : PROB[i] + (PROB[i + 1] - PROB[i]) * f; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const has = (fx, q) => (fx.qa || []).includes(q);
const id = (fx, wp) => (fx.ids || {})[wp];
export const LEVEL = (s) => (s >= 15 ? { k: 'crit', name: '매우 높음' } : s >= 10 ? { k: 'high', name: '높음' } : s >= 5 ? { k: 'mid', name: '보통' } : { k: 'low', name: '낮음' });

// 동해안 지진·해안 태풍·매장 문화재 가능성이 큰 지역
const QUAKE = { GBK: 1.2, USN: 1.0, BSN: 0.5, DGU: 0.4, GNM: 0.3 };
const COAST = { JJU: 1.6, BSN: 1.3, JNM: 1.2, GNM: 1.0, USN: 0.9, ICN: 0.8, CNM: 0.6, JBK: 0.6, GBK: 0.6, GWD: 0.5 };
const HERITAGE = { SEL: 1.0, GBK: 1.1, CNM: 0.6, JBK: 0.6, GWJ: 0.3, DGU: 0.3, GGN: 0.3 };

// 위험 정의. f(ctx, fx) → null(해당 없음) | { p, i, why[], mit[], days:[최소,최빈,최대], cost:[%…], crit }
// ctx: { site, u, cond, d, S, C, E, ex } — ex: 공정에서 뽑은 노출 지표
export const RISKS = [
  {
    id: 'RSK-01', cat: 'geo', name: '예상과 다른 지층·암반선', en: 'GROUND UNCERTAINTY', when: ['survey', 'wall', 'earth', 'found'],
    levers: [['survey', 'ai'], ['survey', 'geo'], ['survey', 'cpt']],
    f(c, fx) {
      const { d, cond } = c;
      const why = [`지반 ${d.G.short} · 굴착 ${d.depth.toFixed(0)}m`];
      let p = 1.4 + 2 * d.soft + (d.depth > 15 ? 0.9 : d.depth > 6 ? 0.4 : 0) + (cond.ground === 'R' || d.rockCut > 0 ? 0.5 : 0) + (d.area > 200000 ? 0.5 : 0);
      const mit = [];
      if (fx.unc < 1) mit.push(`지반조사 불확실성 ${Math.round((1 - fx.unc) * 100)}% 감소`);
      p *= 0.55 + 0.45 * fx.unc;
      const i = clamp(2 + d.depth / 12 + (d.heavy ? 0.6 : 0), 1, 5);
      const k = clamp(d.depth / 15, 0.5, 2);
      return { p, i, why, mit, days: [10 * k, 30 * k, 90 * k], cost: [0.2, 0.6, 1.8], crit: 0.85 };
    },
  },
  {
    id: 'RSK-02', cat: 'geo', name: '지하수 유입·차수 실패', en: 'GROUNDWATER INFLOW', when: ['wall', 'earth', 'found', 'base'],
    levers: [['wall', 'dwall'], ['wall', 'scw'], ['water', 'jsp'], ['qa', 'twin']],
    f(c, fx) {
      const { d, cond } = c;
      if (d.belowGW <= 0.5) return null;
      const why = [`지하수면 GL−${cond.gw}m 아래로 ${d.belowGW.toFixed(1)}m 굴착`];
      if (d.soft > 0.3) why.push('투수성 큰 연약·충적층');
      const mit = [];
      let p = 1.2 + d.belowGW / 4 + d.soft * 1.5;
      const wt = fx.watertight ?? 0.3;
      p -= wt * 2.2; if (wt >= 0.9) mit.push('연속 차수벽 (D-Wall·SCW)');
      if (id(fx, 'water') === 'jsp' || id(fx, 'water') === 'grout') { p -= 0.4; mit.push('차수 그라우팅'); }
      if (has(fx, 'twin')) { p -= 0.5; mit.push('디지털 트윈: 지하수위 실시간 계측'); }
      const i = clamp(2 + d.belowGW / 6 + (cond.adj < 15 ? 1 : 0), 1, 5);
      return { p, i, why, mit, days: [7, 25, 70], cost: [0.1, 0.4, 1.2], crit: 0.8 };
    },
  },
  {
    id: 'RSK-03', cat: 'geo', name: '인접 건물·도로 침하 (흙막이 변위)', en: 'ADJACENT SETTLEMENT', when: ['wall', 'earth', 'found', 'base'],
    levers: [['wall', 'dwall'], ['support', 'topdown'], ['qa', 'twin']],
    f(c, fx) {
      const { d, cond } = c;
      if (d.depth < 5 || cond.adj > 80) return null;
      const why = [`인접 건물 ${cond.adj}m · 굴착 ${d.depth.toFixed(0)}m`];
      const mit = [];
      let p = 1 + (d.depth / 10) * (1 - (fx.stiff ?? 0.75) * 0.6) + (cond.adj < 15 ? 1.2 : cond.adj < 30 ? 0.5 : 0) + d.soft;
      if ((fx.stiff ?? 0) >= 0.95) mit.push('강성 큰 흙막이 벽');
      if ((fx.overlap || 0) > 0) { p -= 0.4; mit.push('역타: 지하 슬래브가 버팀 역할'); }
      if (has(fx, 'twin')) { p -= 0.8; mit.push('디지털 트윈: 변위 예측 vs 실측 조기 경보'); }
      const i = cond.adj < 15 ? 4.5 : cond.adj < 40 ? 3.5 : 2.5;
      return { p, i, why, mit, days: [10, 35, 120], cost: [0.3, 1, 3], crit: 0.9 };
    },
  },
  {
    id: 'RSK-04', cat: 'safe', name: '흙막이 붕괴·토사 붕락', en: 'EXCAVATION COLLAPSE', when: ['wall', 'earth'],
    levers: [['wall', 'dwall'], ['qa', 'twin'], ['qa', 'wear']],
    f(c, fx) {
      const { d } = c;
      if (d.depth < 3) return null;
      const why = [`굴착 ${d.depth.toFixed(0)}m`, d.soft > 0.5 ? '연약 지반' : null].filter(Boolean);
      const mit = [];
      let p = 0.8 + d.depth / 12 + d.soft * 1.5 - (fx.stiff ?? 0.75) + (fx.open ? 0.5 : 0);
      if (has(fx, 'twin')) { p -= 0.8; mit.push('디지털 트윈 계측 경보'); }
      if (has(fx, 'wear')) { p -= 0.3; mit.push('웨어러블 위험 구역 경보'); }
      if (has(fx, 'vision')) { p -= 0.3; mit.push('AI 비전 위험 구역 진입 탐지'); }
      return { p, i: 5, why, mit, days: [20, 60, 180], cost: [0.5, 1.5, 4], crit: 1 };
    },
  },
  {
    id: 'RSK-05', cat: 'ext', name: '암반 발파 진동·소음 민원', en: 'BLASTING COMPLAINTS', when: ['earth'],
    levers: [['excav', 'splitter'], ['excav', 'mix']],
    f(c, fx) {
      const { d, cond } = c;
      if (d.rockCut <= 0.5) return null;
      const why = [`암반 굴착 ${d.rockCut.toFixed(1)}m`, `소음 규제 ${cond.noise === 'high' ? '엄격' : cond.noise === 'mid' ? '보통' : '완화'}`];
      const mit = [];
      let p = 1 + d.rockCut / 5 + (cond.noise === 'high' ? 1.5 : cond.noise === 'mid' ? 0.7 : 0);
      const ex = id(fx, 'excav');
      if (ex === 'splitter') { p -= 1.8; mit.push('무진동 암파쇄'); } else if (ex === 'mix') { p -= 0.8; mit.push('미진동 발파 혼합'); }
      return { p, i: clamp(2.5 + (cond.adj < 15 ? 1 : 0), 1, 5), why, mit, days: [10, 30, 90], cost: [0.1, 0.3, 0.8], crit: 0.7 };
    },
  },
  {
    id: 'RSK-06', cat: 'safe', name: '고소작업 추락', en: 'FALL FROM HEIGHT', when: ['struct', 'skin'],
    levers: [['form', 'acs'], ['skin', 'unitcw'], ['hoist', 'jump'], ['qa', 'vision'], ['qa', 'wear']],
    f(c, fx) {
      const { d } = c;
      const why = [`최고 높이 ${Math.round(d.maxH)}m`];
      const mit = [];
      let p = 1.5 + Math.min(2, d.maxH / 80);
      const sk = id(fx, 'skin'), fm = id(fx, 'form');
      if (sk === 'wet') { p += 0.6; why.push('습식 외장: 외부 비계 작업'); }
      if (sk === 'unitcw' || sk === 'pcpanel') { p -= 0.4; mit.push('외장 유닛을 안쪽에서 설치'); }
      if (fm === 'acs' || fm === 'gang') { p -= 0.5; mit.push('작업대 일체형 거푸집 (안전 난간)'); }
      if (id(fx, 'frame') === 'modular' || id(fx, 'frame') === 'pc') { p -= 0.4; mit.push('공장 제작으로 고소 작업 감소'); }
      if (id(fx, 'insul') === 'outer' && d.maxH > 40) { p += 0.3; why.push('외단열 미장: 외부 달비계 작업'); }
      if (id(fx, 'hoist') === 'jump') { p -= 0.25; mit.push('점프 엘리베이터: 외부 호이스트 개구부 감소'); }
      if (id(fx, 'steel') === 'block') { p -= 0.2; mit.push('대블록 지상 조립: 고소 접합 감소'); }
      if (has(fx, 'vision')) { p -= 0.6; mit.push('AI 비전: 안전고리 미체결 탐지'); }
      if (has(fx, 'wear')) { p -= 0.3; mit.push('웨어러블 추락 감지'); }
      return { p, i: 5, why, mit, days: [7, 20, 60], cost: [0.05, 0.2, 0.6], crit: 0.6 };
    },
  },
  {
    id: 'RSK-07', cat: 'safe', name: '크레인 충돌·전도', en: 'CRANE COLLISION', when: ['struct'],
    levers: [['plan', 'ai'], ['lift', 'luffing'], ['qa', 'wear']],
    f(c, fx) {
      const { d, C } = c;
      const cr = C ? C.byType.crane : { n: 0, hard: 0, mit: 0 };
      const open = cr.n - cr.mit;
      const why = [`크레인 간섭 ${cr.n}건 (중대 ${cr.hard}, 해소 ${cr.mit})`];
      if (d.superTall) why.push('초고층 강풍');
      const mit = [];
      let p = 1 + cr.hard * 0.5 + Math.min(1.5, open * 0.06) + (d.superTall ? 1 : d.tall ? 0.5 : 0);
      if (cr.mit) mit.push(`AI 최적화: 크레인 높이·인양 시간 분리 ${cr.mit}건`);
      if (fx.craneKind === 'luffing') { p -= 0.3; mit.push('러핑 크레인: 선회 반경 축소'); }
      if (has(fx, 'wear')) { p -= 0.4; mit.push('근접 경보 장치'); }
      return { p, i: 5, why, mit, days: [10, 30, 90], cost: [0.1, 0.4, 1.2], crit: 0.8 };
    },
  },
  {
    id: 'RSK-08', cat: 'safe', name: '공사 중 화재', en: 'FIRE DURING WORKS', when: ['fin', 'mep', 'comm'],
    levers: [['insul', 'sandwich'], ['insul', 'inner'], ['steel', 'robot'], ['qa', 'vision'], ['qa', 'twin']],
    f(c, fx) {
      const { u } = c;
      const hot = ['logistics', 'battery', 'chem', 'dc', 'power'].includes(u.id);
      const why = [hot ? '가연성 단열재·대공간·용접 작업 많은 용도' : '마감·설비 단계 용접·절단 작업'];
      const mit = [];
      let p = 1.2 + (hot ? 1.2 : 0) + (id(fx, 'skin') === 'metal' ? 0.4 : 0);
      if (id(fx, 'insul') === 'spray') { p += 0.9; why.push('우레탄 뿜칠 단열 + 용접·절단 화기 (물류창고 화재 유형)'); }
      if (id(fx, 'steel') === 'weld') { p += 0.3; why.push('철골 현장 용접 불티'); }
      if (id(fx, 'steel') === 'robot') { p -= 0.15; mit.push('로봇 용접: 불티 차폐·작업 시간 단축'); }
      if (id(fx, 'elec') === 'renew') { p += 0.3; why.push('ESS 배터리 반입·충전 시험'); }
      if (id(fx, 'paint') === 'eco') { p -= 0.1; mit.push('무VOC 도료: 가연성 증기 감소'); }
      if (has(fx, 'vision')) { p -= 0.6; mit.push('AI 비전: 연기·불꽃 조기 탐지'); }
      if (has(fx, 'twin')) { p -= 0.3; mit.push('화기 작업 실시간 관리'); }
      return { p, i: 4.5, why, mit, days: [15, 45, 150], cost: [0.3, 1.2, 5], crit: 0.9 };
    },
  },
  {
    id: 'RSK-09', cat: 'safe', name: '중장비 협착·충돌', en: 'PLANT & VEHICLE', when: ['earth', 'found', 'struct'],
    levers: [['qa', 'wear'], ['qa', 'vision'], ['plan', 'ai']],
    f(c, fx) {
      const { C, ex } = c;
      const tr = C ? C.byType.truck : { n: 0, days: 0 };
      const nb = Math.max(1, c.S.blocks.length);
      const why = [`토공 ${Math.round(ex.excav / 1e4)}만㎥`, `게이트·도로 차량 한도 초과 ${Math.round(tr.days)}일 (${nb}개 블록)`];
      const mit = [];
      let p = 1 + Math.min(1.6, tr.days / nb / 12) + Math.min(1.1, ex.excav / nb / 1.5e5);
      if ((C && C.byType.truck.n) === 0) mit.push('물류 피크 없음 (게이트 한도 이내)');
      if (has(fx, 'wear')) { p -= 0.8; mit.push('웨어러블 근접 경보'); }
      if (has(fx, 'vision')) { p -= 0.5; mit.push('AI 비전: 장비 주변 사람 탐지'); }
      return { p, i: 4.5, why, mit, days: [5, 15, 45], cost: [0.05, 0.15, 0.5], crit: 0.5 };
    },
  },
  {
    id: 'RSK-10', cat: 'time', name: '장마철 토공·기초 지연', en: 'MONSOON EARTHWORKS', when: ['earth', 'found'],
    levers: [['plan', 'ai'], ['qa', 'drone']],
    f(c, fx) {
      const { ex, d } = c;
      if (ex.monsoon < 0.05) return null;
      const why = [`토공 기간의 ${Math.round(ex.monsoon * 100)}%가 6월 말~8월`];
      const mit = [];
      let p = 1 + 4.2 * ex.monsoon;
      if (has(fx, 'drone')) { p -= 0.3; mit.push('드론 토공량·배수 상태 주간 점검'); }
      return { p, i: clamp(2 + d.soft * 1.5 + d.depth / 25, 1, 5), why, mit, days: [5, 15, 40], cost: [0.05, 0.15, 0.4], crit: 0.9 };
    },
  },
  {
    id: 'RSK-11', cat: 'qual', name: '동절기 콘크리트 강도 부족', en: 'WINTER CONCRETING', when: ['struct', 'base'],
    levers: [['conc', 'high'], ['pour', 'winter'], ['qa', 'iot']],
    f(c, fx) {
      const { ex } = c;
      if (ex.winter < 0.05) return null;
      const why = [`골조 기간의 ${Math.round(ex.winter * 100)}%가 12~2월`];
      const mit = [];
      let p = 1 + 4.5 * ex.winter * (fx.winterK || 1);
      if ((fx.winterK || 1) < 1) mit.push(id(fx, 'pour') === 'winter' ? '보온·가열 양생 체계 (한중 콘크리트)' : '조강·고강도 배합 (한중 대응)');
      if (has(fx, 'iot')) { p -= 0.8; mit.push('IoT 강도 센서: 해체 시점 실측'); }
      return { p, i: 3, why, mit, days: [5, 15, 45], cost: [0.1, 0.3, 1], crit: 0.7 };
    },
  },
  {
    id: 'RSK-12', cat: 'time', name: '현장에서 드러나는 공종 간섭 (재시공)', en: 'FIELD CLASH REWORK', when: ['struct', 'mep', 'skin', 'fin'],
    levers: [['plan', 'ai'], ['plan', 'bim4d'], ['qa', 'clash'], ['qa', 'scan']],
    f(c, fx) {
      const { C, d } = c;
      const open = C ? C.list.filter(x => !x.mit).length : 20;
      const det = fx.detect ?? 0.45;
      const miss = open * (1 - det);
      const why = [`미해결 간섭 ${open}건 중 착공 전 미발견 ${Math.round(miss)}건 (탐지율 ${Math.round(det * 100)}%)`];
      const mit = [];
      if (det >= 0.88) mit.push(`4D BIM 간섭 탐지 ${Math.round(det * 100)}%`);
      let p = 1.2 + Math.log2(1 + miss) / 1.4 + (d.ind ? 0.5 : 0);
      const rw = fx.rework || 0;
      if (rw) { p -= rw * 2.5; mit.push(`${has(fx, 'clash') ? 'BIM 간섭검토' : ''}${has(fx, 'clash') && has(fx, 'scan') ? ' + ' : ''}${has(fx, 'scan') ? '레이저 스캔 편차 검측' : ''}`); }
      return { p, i: clamp(3 + (d.ind ? 1 : 0), 1, 5), why, mit, days: [5, 20, 60], cost: [0.2, 0.8, 2.5], crit: 0.7 };
    },
  },
  {
    id: 'RSK-13', cat: 'time', name: '핵심 장비·자재 납기 지연', en: 'LONG-LEAD SUPPLY', when: ['struct', 'skin', 'mep', 'comm'],
    levers: [['qa', 'rfid'], ['plan', 'ai']],
    f(c, fx) {
      const { u, d } = c;
      const crit = ['fab', 'dc', 'chem', 'power', 'battery', 'bio', 'hospital', 'water'].includes(u.id);
      if (!crit && !d.tall) return null;
      const why = [crit ? '변압기·칠러·공정 장비 등 장납기 품목' : '커튼월·엘리베이터 장납기'];
      const mit = [];
      let p = 2 + (['fab', 'dc', 'power', 'chem'].includes(u.id) ? 1.5 : 0.5);
      if (has(fx, 'rfid')) { p -= 0.4; mit.push('RFID 자재 추적·적기 반입'); }
      if (fx.plan === 'ai' || fx.plan === 'bim4d') { p -= 0.3; mit.push('4D 모델로 반입 시점 역산 선발주'); }
      return { p, i: crit ? 4 : 3, why, mit, days: [15, 45, 120], cost: [0.2, 0.6, 2], crit: 0.75 };
    },
  },
  {
    id: 'RSK-14', cat: 'time', name: '생산성 변동·공정 지연 연쇄', en: 'PRODUCTIVITY VARIANCE', when: ['struct', 'mep', 'skin', 'fin'],
    levers: [['plan', 'ai'], ['plan', 'lps'], ['plan', 'takt']],
    f(c, fx) {
      const { S } = c;
      const why = [`공기 ${S.months}개월 · 작업 ${S.acts.length}개`];
      const mit = [];
      let p = 2.4 + (S.months > 48 ? 1 : S.months > 30 ? 0.5 : 0) - (fx.varCut || 0) * 5;
      if (fx.varCut) mit.push(`${{ lob: 'LOB', takt: '택트', lps: 'Last Planner', bim4d: '4D BIM', ai: 'AI 재최적화' }[fx.plan] || '공정 기법'}: 변동 ${Math.round(fx.varCut * 100)}% 감소`);
      return { p, i: 3, why, mit, days: [10, 30, 80], cost: [0.1, 0.3, 0.8], crit: 1 };
    },
  },
  {
    id: 'RSK-15', cat: 'time', name: '숙련 인력 수급 부족', en: 'LABOUR SHORTAGE', when: ['struct', 'fin'],
    levers: [['frame', 'pc'], ['frame', 'modular'], ['mep', 'prefab'], ['rebar', 'cage'], ['part', 'module'], ['plumb', 'pod'], ['paint', 'robot']],
    f(c, fx) {
      const { site, d } = c;
      const l = (site.a && site.a.l) ?? 60;
      const why = [`지역 인력 지표 ${l}`, d.area > 500000 ? '초대형 현장 (최대 수천 명)' : null].filter(Boolean);
      const mit = [];
      let p = 1 + (100 - l) / 25 + (d.area > 500000 ? 0.8 : 0);
      const fr = id(fx, 'frame');
      if (fr === 'modular' || fr === 'pc' || fr === 'module') { p -= 0.9; mit.push('공장 제작 (OSC)으로 현장 인력 감소'); }
      if (id(fx, 'mep') === 'prefab' || id(fx, 'mep') === 'spool') { p -= 0.4; mit.push('설비 프리팹'); }
      const osc = [['rebar', ['cage', 'mesh'], '선조립 철근'], ['part', ['module', 'dry'], '건식·프리팹 칸막이'], ['plumb', ['pod'], '욕실 유닛'], ['paint', ['robot'], '도장 로봇'], ['floor', ['dryondol'], '건식 온돌']].filter(([w, os]) => os.includes(id(fx, w)));
      if (osc.length) { p -= Math.min(0.7, osc.length * 0.18); mit.push(osc.map(x => x[2]).join('·')); }
      if (id(fx, 'part') === 'block' || id(fx, 'floor') === 'wet') { p += 0.3; why.push('습식 조적·방통 숙련공 의존'); }
      return { p, i: 3, why, mit, days: [10, 30, 90], cost: [0.2, 0.6, 1.5], crit: 0.6 };
    },
  },
  {
    id: 'RSK-16', cat: 'cost', name: '자재 가격 급등 (철근·철골·레미콘)', en: 'MATERIAL ESCALATION', when: ['found', 'base', 'struct'],
    levers: [['plan', 'ai']],
    f(c, fx) {
      const { S } = c;
      const steel = ['steel', 'hybrid', 'src', 'truss'].includes(id(fx, 'frame'));
      const why = [`공기 ${S.months}개월`, steel ? '철골 비중 큼' : '철근·레미콘 비중 큼'];
      const mit = [];
      let p = 2 + S.months / 24;
      if (fx.plan === 'ai' || fx.plan === 'bim4d') { p -= 0.3; mit.push('BIM 물량으로 주요 자재 선발주'); }
      return { p, i: clamp(3 + (steel ? 0.5 : 0), 1, 5), why, mit, days: [0, 0, 5], cost: [1, 3, 7], crit: 0 };
    },
  },
  {
    id: 'RSK-17', cat: 'cost', name: '설계 변경·물량 증가', en: 'DESIGN CHANGE', when: ['base', 'struct', 'mep'],
    levers: [['qa', 'clash'], ['plan', 'bim4d'], ['qa', 'scan']],
    f(c, fx) {
      const { d } = c;
      const why = [d.ind ? '설비·공정 변경 잦은 산업 시설' : '발주처·인허가 변경'];
      const mit = [];
      let p = 2.6 + (d.ind ? 0.5 : 0);
      if (has(fx, 'clash')) { p -= 0.6; mit.push('통합 BIM 조정 회의'); }
      if (fx.plan === 'ai' || fx.plan === 'bim4d') { p -= 0.4; mit.push('변경 영향 4D 즉시 산정'); }
      if (has(fx, 'scan')) { p -= 0.2; mit.push('현황 스캔 기반 변경 검토'); }
      return { p, i: 3, why, mit, days: [0, 10, 40], cost: [0.5, 2, 5], crit: 0.5 };
    },
  },
  {
    id: 'RSK-18', cat: 'qual', name: '시공 결함·하자 (누수·균열)', en: 'DEFECTS', when: ['struct', 'skin', 'fin'],
    levers: [['bwp', 'pre'], ['roof', 'hybrid'], ['qa', 'scan'], ['qa', 'vision'], ['qa', 'iot']],
    f(c, fx) {
      const { u, d } = c;
      const q = (fx.index && fx.index.quality) || 70;
      const why = [`공법 품질 지수 ${q}`];
      const mit = [];
      let p = 1 + (100 - q) / 12 - (fx.rework || 0) * 2;
      if (fx.rework) mit.push('편차 검측·간섭검토로 재시공 감소');
      if (d && d.depth > 0.5 && fx.leak != null) { p += (fx.leak - 0.7) * 1.6; if (fx.leak <= 0.6) mit.push('구체 일체 방수 (지하 누수 경로 차단)'); else if (fx.leak >= 0.85) why.push('지하 외벽 방수 이음·내방수 의존'); }
      if (id(fx, 'roof') === 'urethane' && d && d.tall) { p += 0.3; why.push('고층 노출 도막 방수'); }
      if (id(fx, 'floor') === 'wet') { p += 0.2; why.push('습식 방통 균열·들뜸'); }
      if (has(fx, 'vision')) { p -= 0.4; mit.push('AI 비전 균열·누수 자동 분류'); }
      return { p, i: ['housing', 'mixed', 'hospital'].includes(u.id) ? 3.5 : 3, why, mit, days: [0, 10, 30], cost: [0.2, 0.8, 2], crit: 0.3 };
    },
  },
  {
    id: 'RSK-19', cat: 'qual', name: '진동·청정도 기준 미달 (정밀 시설)', en: 'PRECISION CRITERIA', when: ['struct', 'mep', 'comm'],
    levers: [['comm', 'perf'], ['qa', 'scan'], ['qa', 'twin'], ['found', 'bored']],
    f(c, fx) {
      const { u, d } = c;
      if (!['fab', 'bio', 'dc', 'hospital', 'lab'].includes(u.id)) return null;
      const why = [`${u.name}: 미진동·청정도·정밀 설비 기준`, d.soft > 0.3 ? '연약 지반 진동 증폭' : null].filter(Boolean);
      const mit = [];
      let p = 2.4 + d.soft * 1.5;
      if (has(fx, 'scan')) { p -= 0.5; mit.push('레이저 스캔 평탄도 검측'); }
      if (has(fx, 'twin')) { p -= 0.4; mit.push('진동·온습도 디지털 트윈'); }
      if (['bored', 'piledraft', 'steel'].includes(fx.foundId)) { p -= 0.3; mit.push('강성 큰 말뚝 기초'); }
      if (['clean', 'crac'].includes(id(fx, 'hvac'))) { p -= 0.3; mit.push('전용 공조 (청정도·항온항습)'); }
      if (id(fx, 'comm') === 'perf') { p -= 0.4; mit.push('성능 검증 시운전'); }
      return { p, i: u.id === 'fab' ? 5 : 4, why, mit, days: [10, 40, 120], cost: [0.3, 1, 3], crit: 0.9 };
    },
  },
  {
    id: 'RSK-20', cat: 'time', name: '시운전·성능시험 지연', en: 'COMMISSIONING', when: ['comm'],
    levers: [['comm', 'perf'], ['comm', 'digital'], ['qa', 'twin'], ['mep', 'hookup']],
    f(c, fx) {
      const { u } = c;
      if (!['fab', 'dc', 'chem', 'power', 'water', 'battery', 'bio', 'hospital'].includes(u.id)) return null;
      const why = ['설비 연동·성능 보증 시험 단계'];
      const mit = [];
      let p = 2.5 + (u.gen === 'plant' ? 0.5 : 0);
      if (has(fx, 'twin')) { p -= 0.5; mit.push('가상 시운전 (디지털 트윈)'); }
      if (id(fx, 'mep') === 'hookup') { p -= 0.3; mit.push('훅업 전문 공정'); }
      const cm = id(fx, 'comm');
      if (cm === 'perf') { p -= 0.6; mit.push('성능 검증 시운전 계획'); } else if (cm === 'digital') { p -= 0.4; mit.push('디지털 커미셔닝 (BEMS 데이터 검증)'); } else if (cm === 'tab') { p -= 0.25; mit.push('TAB·통합 시운전'); } else if (cm === 'std') { p += 0.3; why.push('공종별 단독 시운전만 계획'); }
      if (id(fx, 'elec') === 'dual') { p -= 0.15; mit.push('이중 수전: 정전 시험 중단 감소'); }
      return { p, i: 4, why, mit, days: [15, 45, 150], cost: [0.2, 0.6, 2], crit: 1 };
    },
  },
  {
    id: 'RSK-21', cat: 'ext', name: '인허가·민원 지연', en: 'PERMITS & COMPLAINTS', when: ['survey', 'prep', 'wall', 'earth'],
    levers: [['prep', 'sound'], ['excav', 'splitter'], ['plan', 'bim4d']],
    f(c, fx) {
      const { site, cond, u } = c;
      const pol = (site.a && site.a.pol) ?? 65;
      const why = [`정책·인허가 지표 ${pol}`, cond.noise === 'high' ? '주거·학교 인접' : null, site.status ? `추진 단계: ${site.status}` : null].filter(Boolean);
      const mit = [];
      let p = 1 + (100 - pol) / 30 + (cond.noise === 'high' ? 1 : 0) + (u.gen === 'plant' ? 0.5 : 0);
      if (fx.plan === 'bim4d' || fx.plan === 'ai') { p -= 0.3; mit.push('4D 시뮬레이션으로 주민 설명·심의 대응'); }
      if ((fx.noiseCut || 0) >= 8 && cond.noise !== 'low') { p -= 0.6; mit.push('고차단 방음벽·소음 전광판 공개'); } else if (id(fx, 'prep') === 'std' && cond.noise === 'high') { p += 0.3; why.push('3m 가설 울타리만으로 소음·분진 대응'); }
      return { p, i: 3, why, mit, days: [15, 45, 150], cost: [0.1, 0.3, 1], crit: 1 };
    },
  },
  {
    id: 'RSK-22', cat: 'ext', name: '매장 문화재 발견', en: 'ARCHAEOLOGY', when: ['earth'],
    levers: [['survey', 'geo'], ['survey', 'ai']],
    f(c, fx) {
      const { site, d } = c;
      const h = HERITAGE[site.reg] || 0;
      const old = (site.kinds || []).some(k => ['renewal', 'urban', 'culture'].includes(k));
      if (!h && !old) return null;
      if (d.depth < 2) return null;
      const why = [h ? `${site.region || site.reg} 매장 문화재 분포` : '구도심 재개발', `굴착 ${d.depth.toFixed(0)}m`];
      const mit = [];
      let p = 1 + h * 1.5 + (old ? 0.6 : 0);
      if (fx.unc <= 0.8) { p -= 0.3; mit.push('물리탐사로 이상체 사전 확인'); }
      return { p, i: 3.5, why, mit, days: [30, 90, 300], cost: [0.1, 0.4, 1.2], crit: 1 };
    },
  },
  {
    id: 'RSK-23', cat: 'ext', name: '태풍·강풍·해일', en: 'TYPHOON & WIND', when: ['struct', 'skin'],
    levers: [['skin', 'unitcw'], ['plan', 'ai']],
    f(c, fx) {
      const { site, d } = c;
      const k = COAST[site.reg] || 0;
      const sea = (site.kinds || []).some(x => ['port', 'energy', 'chem'].includes(x));
      if (!k && !sea && !d.superTall) return null;
      const why = [k ? `${site.region || site.reg} 태풍 경로` : null, sea ? '해안 부지' : null, d.tall ? `높이 ${Math.round(d.maxH)}m 강풍` : null].filter(Boolean);
      const mit = [];
      let p = 1.2 + k + (sea ? 0.6 : 0) + (d.superTall ? 0.8 : 0);
      if (fx.plan === 'ai') { p -= 0.2; mit.push('기상 예보 연동 재최적화'); }
      return { p, i: clamp(3 + (d.tall ? 1 : 0), 1, 5), why, mit, days: [5, 15, 45], cost: [0.05, 0.2, 0.8], crit: 0.8 };
    },
  },
  {
    id: 'RSK-24', cat: 'ext', name: '지진 (동남권)', en: 'SEISMIC EVENT', when: ['found', 'struct'],
    levers: [['qa', 'twin']],
    f(c, fx) {
      const { site, d } = c;
      const k = QUAKE[site.reg] || 0;
      if (!k) return null;
      const why = [`${site.region || site.reg}: 경주(2016)·포항(2017) 지진 영향권`];
      const mit = [];
      let p = 1 + k;
      if (has(fx, 'twin')) { p -= 0.2; mit.push('계측 기반 피해 즉시 판정'); }
      return { p, i: clamp(3.5 + (d.vib ? 0.8 : 0), 1, 5), why, mit, days: [10, 30, 120], cost: [0.1, 0.5, 2], crit: 0.9 };
    },
  },
];
export const RISK_BY_ID = Object.fromEntries(RISKS.map(r => [r.id, r]));

// 공정에서 위험 노출 지표 추출: 장마(6/20~8/31) 토공 비율, 동절기(12~2월) 골조 비율, 토공량
export function exposure(S, Q) {
  const t0 = S.t0.getTime(), DAY = 864e5;
  const frac = (cats, test) => {
    let tot = 0, hit = 0;
    S.acts.filter(a => cats.includes(a.cat)).forEach(a => {
      for (let t = Math.floor(a.start); t < a.end; t += 3) { tot++; const dt = new Date(t0 + t * DAY); if (test(dt.getUTCMonth() + 1, dt.getUTCDate())) hit++; }
    });
    return tot ? hit / tot : 0;
  };
  return {
    monsoon: frac(['earth', 'found'], (m, dd) => (m === 6 && dd >= 20) || m === 7 || m === 8),
    winter: frac(['struct', 'base'], (m) => m === 12 || m <= 2),
    excav: Q.excavation || 0,
  };
}

// 위험 등록부: 고유(기준선 공법) vs 잔여(고른 공법)
export function register(ctx) {
  const fx0 = ctx.fx0 || baselineFx(ctx.cond, ctx.d);
  const out = [];
  RISKS.forEach(R => {
    const r = R.f(ctx, ctx.fx); if (!r) return;
    const r0 = R.f({ ...ctx, C: ctx.C0 || ctx.C }, fx0) || r;
    const p = clamp(r.p, 1, 5), i = clamp(r.i, 1, 5), p0 = clamp(Math.max(r0.p, r.p), 1, 5), i0 = clamp(Math.max(r0.i, r.i), 1, 5);
    out.push({ ...R, why: r.why, mit: r.mit.filter(Boolean), days: r.days, cost: r.cost, crit: r.crit,
      p, i, s: p * i, p0, i0, s0: p0 * i0, prob: probOf(p), prob0: probOf(p0) });
  });
  out.sort((a, b) => b.s - a.s);
  return out;
}

// 결정적 난수 (같은 입력이면 같은 결과)
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const tri = (u, a, m, b) => { if (b <= a) return a; const f = (m - a) / (b - a); return u < f ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m)); };

// 몬테카를로: 기본 변동(생산성·물량) + 위험 사건. mode 'res'(잔여) | 'raw'(고유)
export function monteCarlo(reg, S, E, fx, { n = 2000, mode = 'res', seed = 20261112 } = {}) {
  const rand = rng(seed + (mode === 'raw' ? 77 : 0));
  const D0 = S.end, C0 = E.total, direct = E.direct;
  const perDay = (E.temp + E.over) / Math.max(1, D0); // 지연 하루당 간접비
  const varCut = mode === 'raw' ? 0 : (fx.varCut || 0);
  const rw = mode === 'raw' ? 0 : (fx.rework || 0);
  const durHi = 1.1 - 0.2 * varCut, costHi = 1.06 - 0.05 * rw;
  const days = new Float64Array(n), cost = new Float64Array(n);
  const contrib = reg.map(() => ({ d: 0, c: 0, hit: 0 }));
  for (let k = 0; k < n; k++) {
    let d = D0 * tri(rand(), 0.95, 0.995, durHi);
    let c = C0 * tri(rand(), 0.975, 1.0, costHi);
    reg.forEach((r, j) => {
      const pr = mode === 'raw' ? r.prob0 : r.prob;
      const u = rand();
      if (u >= pr) { rand(); rand(); return; }
      const sc = mode === 'raw' ? 1 : clamp(r.i / r.i0, 0.4, 1);
      const dd = tri(rand(), r.days[0], r.days[1], r.days[2]) * sc * r.crit;
      const cc = tri(rand(), r.cost[0], r.cost[1], r.cost[2]) / 100 * direct * sc;
      d += dd; c += cc + dd * perDay;
      contrib[j].d += dd; contrib[j].c += cc + dd * perDay; contrib[j].hit++;
    });
    days[k] = d; cost[k] = c;
  }
  const sd = Float64Array.from(days).sort(), sc2 = Float64Array.from(cost).sort();
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const M = 30.44;
  const pct = (arr, f = (x) => x) => ({ p10: f(q(arr, 0.1)), p50: f(q(arr, 0.5)), p80: f(q(arr, 0.8)), p90: f(q(arr, 0.9)), mean: f(arr.reduce((a, b) => a + b, 0) / arr.length), min: f(arr[0]), max: f(arr[arr.length - 1]) });
  const hist = (arr, bins = 28) => {
    const lo = arr[Math.floor(arr.length * 0.002)], hi = arr[Math.floor(arr.length * 0.998) - 1] || arr[arr.length - 1];
    const w = (hi - lo) / bins || 1, h = new Array(bins).fill(0);
    arr.forEach(v => { const b = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w))); h[b]++; });
    return { lo, hi, w, h };
  };
  const onTime = sd.findIndex(v => v > D0); const onBudget = sc2.findIndex(v => v > C0);
  return {
    n, mode, D0, C0,
    days: pct(sd), months: pct(sd, x => x / M), cost: pct(sc2),
    hDays: hist(sd), hCost: hist(sc2), sortedDays: sd, sortedCost: sc2,
    pOnTime: (onTime < 0 ? n : onTime) / n, pOnBudget: (onBudget < 0 ? n : onBudget) / n,
    contrib: contrib.map((x, j) => ({ id: reg[j].id, d: x.d / n, c: x.c / n, hit: x.hit / n })).sort((a, b) => b.d + b.c / perDay / 4 - (a.d + a.c / perDay / 4)),
  };
}

// 월별 위험 노출: 위험이 걸린 공종이 진행 중인 달에 잔여 P×I를 더한다 (분류별)
export function exposureTimeline(reg, S) {
  const M = 30.44, NM = S.months + 1;
  const rows = RISK_CAT_KEYS.map(k => ({ k, v: new Array(NM).fill(0) }));
  const byCat = Object.fromEntries(rows.map(r => [r.k, r.v]));
  const actM = (cats) => {
    const on = new Array(NM).fill(0);
    S.acts.filter(a => cats.includes(a.cat)).forEach(a => { for (let m = Math.floor(a.start / M); m <= Math.min(NM - 1, Math.floor(a.end / M)); m++) on[m] = 1; });
    return on;
  };
  const cache = new Map();
  reg.forEach(r => {
    const key = r.when.join(','); if (!cache.has(key)) cache.set(key, actM(r.when));
    const on = cache.get(key);
    on.forEach((x, m) => { if (x) byCat[r.cat][m] += r.s; });
  });
  const total = new Array(NM).fill(0).map((_, m) => rows.reduce((s, r) => s + r.v[m], 0));
  const peak = total.reduce((a, v, m) => (v > total[a] ? m : a), 0);
  return { rows, total, peak, NM };
}

// 개선 제안: 상위 위험마다 아직 고르지 않은 공법·기술을 바꿔 보고, 잔여 점수가 얼마나 주는지 계산 (resolve: 공법 재계산 함수)
export function levers(reg, ctx, picks, resolve, top = 6) {
  const out = [];
  reg.slice(0, top).forEach(r => {
    const R = RISK_BY_ID[r.id];
    (R.levers || []).forEach(([wp, opt]) => {
      const cur = picks[wp];
      const now = wp === 'qa' ? (ctx.fx.qa || []) : null;
      if (wp === 'qa' ? now.includes(opt) : (ctx.fx.ids || {})[wp] === opt) return;
      const np = { ...picks, [wp]: wp === 'qa' ? [...(cur || now || []), opt] : opt };
      const res = resolve(np);
      if (!res) return;
      const L = res.list.find(x => x.wp.id === wp);
      if (L && L.invalid) return;
      if (wp !== 'qa' && L && L.chosen !== opt) return;
      const x = R.f(ctx, res.fx); if (!x) return;
      const s2 = clamp(x.p, 1, 5) * clamp(x.i, 1, 5);
      if (s2 < r.s - 0.4) out.push({ risk: r.id, name: r.name, wp, opt, label: L ? (L.wp.opts.find(o => o.id === opt) || {}).name : opt, from: r.s, to: s2 });
    });
  });
  // 같은 공법이 여러 위험을 줄이면 하나로 묶는다
  const by = new Map();
  out.forEach(o => { const k = o.wp + ':' + o.opt; if (!by.has(k)) by.set(k, { wp: o.wp, opt: o.opt, label: o.label, risks: [], gain: 0 }); const g = by.get(k); g.risks.push(o); g.gain += o.from - o.to; });
  return [...by.values()].sort((a, b) => b.gain - a.gain).slice(0, 6);
}
