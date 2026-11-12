// 공법·재료 시나리오: 공종(작업 패키지)마다 여러 공법을 현장 조건으로 평가해 추천하고, 고른 공법이 공정(4D)·예산(5D)·위험에 주는 효과를 낸다.
// 기준 점수(0~100: 높을수록 유리)는 국내 시공 사례를 바탕으로 한 상대 비교값이다. 현장 조건 규칙이 점수를 더하고 빼며 그 이유를 남긴다.
import { GROUND } from './kr-sites.js';
import { useOf } from './uses.js';

export const PRIO = { time: { name: '공기', en: 'TIME' }, cost: { name: '비용', en: 'COST' }, quality: { name: '품질', en: 'QUALITY' }, safety: { name: '안전', en: 'SAFETY' }, env: { name: '환경', en: 'ENV' } };
export const PRIO_DEFAULT = { time: 25, cost: 25, quality: 20, safety: 20, env: 10 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 현장 조건: 택지 속성 + 매스(지하 깊이·높이·용도)에서 만들고, 사용자가 고칠 수 있다
export const COND_META = {
  ground: { label: '지반', opts: Object.entries(GROUND).map(([k, g]) => [k, g.name]) },
  gw: { label: '지하수위', unit: 'GL−m', min: 0.5, max: 25, step: 0.5, note: '지표에서 지하수면까지 깊이. 얕을수록 차수·부력 대책 필요' },
  adj: { label: '인접 건물 거리', unit: 'm', min: 2, max: 200, step: 1, note: '흙막이 변형·진동·지중 앵커 침범을 좌우' },
  noise: { label: '소음·진동 규제', opts: [['low', '완화 (산단·외곽)'], ['mid', '보통'], ['high', '엄격 (주거·학교 인접)']] },
  rockDepth: { label: '기반암 깊이', unit: 'GL−m', min: 2, max: 60, step: 1, note: '이보다 깊이 파면 암반 굴착' },
};
export function siteConditions(site, gen, Q) {
  const a = site.a || { g: 'W', gw: 7, d: 60, b: 40 };
  const g = a.g || 'W';
  const urban = (site.kinds || []).some(k => ['urban', 'renewal'].includes(k)) || site.reg === 'SEL';
  const adj = urban ? 12 : (site.kinds || []).some(k => ['industrial', 'chem', 'port', 'energy', 'logistics'].includes(k)) ? 80 : 35;
  const noise = (a.b ?? 40) < 30 ? 'high' : (a.b ?? 40) > 65 ? 'low' : 'mid';
  const rockDepth = g === 'R' ? 4 : g === 'W' ? 14 : g === 'S' ? 28 : 45;
  return { ground: g, gw: a.gw ?? 7, adj, noise, rockDepth };
}
// 매스·조건에서 파생되는 값
export function derive(cond, gen, Q, site) {
  const depth = Q.maxDepth || 0;
  const u = useOf(gen.use || site.use || 'housing');
  const G = GROUND[cond.ground] || GROUND.W;
  const maxH = gen.totals.maxH;
  const foot = gen.blocks.reduce((s, b) => s + (b.area || 0) * (b.bcr || 0) / 100, 0);
  const lotW = Math.min(...gen.blocks.map(b => { const L = gen.plan.blockById.get(b.id); return L ? Math.min(L.lot.u1 - L.lot.u0, L.lot.v1 - L.lot.v0) : 100; }));
  return {
    depth, u, G, maxH, foot, lotW, soft: G.soft, rock: G.rock,
    belowGW: Math.max(0, depth - cond.gw),        // 지하수면 아래로 파는 깊이
    rockCut: Math.max(0, depth - cond.rockDepth), // 암반 굴착 깊이
    tall: maxH >= 120, superTall: maxH >= 200,
    heavy: ['fab', 'chem', 'power', 'dc', 'battery', 'logistics'].includes(u.id), vib: ['fab', 'dc', 'hospital', 'bio'].includes(u.id),
    plant: u.gen === 'plant', ind: ['fab', 'factory', 'dc', 'logistics', 'plant'].includes(u.gen), res: u.gen === 'housing',
    cyl: gen.bldgs.some(b => b.shape === 'cyl'), area: gen.totals.lotArea,
  };
}

// ---------- 작업 패키지와 공법 ----------
// b: 기준 점수 {time, cost, quality, safety, env}, fx: 공정·예산 효과, how: 시공 순서, rule(c, d) → [[점수 보정 {}, 이유], …] 또는 { no: 사유 }
const O = (id, name, b, extra = {}) => ({ id, name, b, ...extra });
export const WPS = [
  {
    id: 'survey', code: 'L01', name: '지반조사', en: 'SITE INVESTIGATION', phase: 'survey',
    desc: '시추·시험으로 지층과 지하수를 파악해 흙막이·기초 설계의 불확실성을 줄입니다.',
    opts: [
      O('spt', '표준관입시험 시추 (SPT)', { time: 72, cost: 82, quality: 55, safety: 70, env: 80 }, { fx: { surveyDays: 35, unc: 1.0 }, how: ['시추 위치 50m 격자 배치', '회전 수세식 시추 + 표준관입시험 1.5m 간격', '시료 채취 → 실내 시험 (함수비·입도·전단강도)', '지층 단면도·설계 정수 산정'] }),
      O('geo', '시추 + 물리탐사 (전기비저항·탄성파)', { time: 64, cost: 70, quality: 74, safety: 72, env: 82 }, { fx: { surveyDays: 45, unc: 0.8 }, how: ['전기비저항 탐사 측선 배치 (연약대·공동 탐지)', '탄성파 굴절 탐사로 기반암 선 추정', '이상대 위주 시추 보강', '시추·탐사 결합 지층 모델'] }),
      O('cpt', '시추 + 콘관입시험 (CPTu)', { time: 66, cost: 72, quality: 70, safety: 72, env: 82 }, { fx: { surveyDays: 42, unc: 0.85 }, how: ['콘관입 연속 측정 (선단저항·간극수압)', '연약 점토 층 두께·압밀 특성 산정', '시추로 대표 시료 확인'] }),
      O('ai', 'AI 3D 지반 모델 (시추·탐사·기존 자료 학습)', { time: 62, cost: 64, quality: 90, safety: 78, env: 84 }, { fx: { surveyDays: 50, unc: 0.55 }, tag: 'AI', how: ['국토 지반정보·인근 시추 수천 공 수집', '물리탐사 + 신규 시추 (모델이 정보량 큰 위치를 추천)', '머신러닝 보간으로 3D 지층·지하수 모델 생성', '불확실성 지도 → 추가 시추 위치 재추천', 'BIM 모델과 결합해 흙막이·기초 설계에 직결'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (o.id === 'cpt' && d.soft > 0.5) r.push([{ quality: 18 }, '연약 점토는 콘관입이 층 두께·압밀 특성을 연속으로 잡아냅니다']);
      if (o.id === 'geo' && (c.ground === 'W' || c.ground === 'R')) r.push([{ quality: 10 }, '풍화암·암반 경계(기반암 선)를 탐사로 넓게 잡을 수 있습니다']);
      if (o.id === 'ai' && d.area > 200000) r.push([{ quality: 6, time: 6 }, `부지가 ${Math.round(d.area / 1e4)}ha로 넓어 시추만으로는 공백이 큽니다`]);
      if (o.id === 'spt' && (d.depth > 15 || d.heavy)) r.push([{ quality: -12 }, '깊은 굴착·중량 시설에는 시추 간격이 성깁니다']);
      if (o.id === 'spt' && d.area < 40000 && d.depth < 12) r.push([{ time: 10, cost: 10 }, '작은 부지·얕은 굴착은 표준 시추로 충분합니다']);
      if (o.id === 'ai' && d.area < 40000) r.push([{ cost: -18 }, '소규모 부지에는 모델 구축비가 과합니다']);
      return r;
    },
  },
  {
    id: 'improve', code: 'L02', name: '지반 개량', en: 'GROUND IMPROVEMENT', phase: 'improve',
    desc: '연약 지반·매립지에서 침하와 지지력 부족을 미리 해결합니다.',
    opts: [
      O('none', '개량 없음', { time: 95, cost: 95, quality: 60, safety: 65, env: 90 }, { fx: { improveDays: 0, improveCost: 0 }, how: ['지반 개량 없이 말뚝 기초로 하중 전달'] }),
      O('pbd', 'PBD + 선행재하 (압밀 촉진)', { time: 30, cost: 82, quality: 72, safety: 75, env: 70 }, { fx: { improveDays: 210, improveCost: 4 }, how: ['샌드매트 포설', '플라스틱 배수재(PBD) 1.2m 간격 타입', '성토로 선행 재하 → 압밀 계측', '목표 압밀도 90% 도달 후 재하토 제거'] }),
      O('scp', 'SCP 모래다짐말뚝', { time: 62, cost: 62, quality: 78, safety: 72, env: 62 }, { fx: { improveDays: 100, improveCost: 9 }, how: ['케이싱 관입 → 모래 투입·다짐', '복합 지반 형성 (치환율 30~70%)', '재하 시험으로 지지력 확인'] }),
      O('dcm', 'DCM 심층혼합처리', { time: 78, cost: 42, quality: 90, safety: 78, env: 55 }, { fx: { improveDays: 70, improveCost: 15 }, how: ['교반 날개로 시멘트 슬러리 주입·혼합', '개량체 기둥 격자 형성', '코어 채취로 일축압축강도 확인'] }),
      O('vac', '진공압밀', { time: 50, cost: 70, quality: 78, safety: 80, env: 80 }, { fx: { improveDays: 140, improveCost: 7 }, how: ['수평 배수재 + 기밀 시트 덮기', '진공 펌프로 −80kPa 재하', '침하 계측하며 압밀'] }),
    ],
    rule(c, d, o) {
      if (d.soft < 0.5) return o.id === 'none' ? [[{ quality: 25, safety: 15 }, '연약층이 없어 개량이 필요 없습니다']] : { no: '연약층이 없는 지반' };
      const r = [];
      if (o.id === 'none') r.push([{ quality: -35, safety: -25 }, '연약층을 그대로 두면 부등침하·측방유동 위험이 큽니다']);
      if (o.id === 'pbd' && d.ind) r.push([{ cost: 8 }, '넓은 산업 부지는 선행재하가 가장 경제적입니다']);
      if (o.id === 'dcm' && c.adj < 20) r.push([{ safety: 10 }, '인접 구조물이 가까워 침하를 거의 만들지 않는 고결 공법이 안전합니다']);
      return r;
    },
  },
  {
    id: 'wall', code: 'L03', name: '흙막이 벽체', en: 'EARTH RETENTION', phase: 'wall',
    desc: '굴착면이 무너지지 않도록 지하 외곽에 벽을 먼저 세웁니다. 차수성·강성·소음이 공법마다 다릅니다.',
    opts: [
      O('hpile', 'H-Pile + 토류판', { time: 82, cost: 88, quality: 55, safety: 58, env: 60 }, { fx: { wallRate: 230, retain: 0.55, watertight: 0, stiff: 0.4 }, how: ['오거 천공 후 H형강 1.8m 간격 근입', '굴착하며 토류판(나무 판) 끼움', '띠장·버팀 설치', '되메우기 후 H형강 인발'] }),
      O('sheet', '강널말뚝 (Sheet Pile)', { time: 86, cost: 80, quality: 62, safety: 64, env: 55 }, { fx: { wallRate: 260, retain: 0.65, watertight: 0.7, stiff: 0.45 }, how: ['진동 해머로 U형 강널 맞물림 관입', '이음부 차수', '굴착·버팀', '공사 후 인발 재사용'] }),
      O('cip', 'CIP (현장타설 콘크리트 말뚝)', { time: 66, cost: 70, quality: 74, safety: 76, env: 72 }, { fx: { wallRate: 150, retain: 0.85, watertight: 0.3, stiff: 0.75 }, how: ['오거로 Ø500 천공', '철근망 + H형강 근입, 콘크리트 타설', '말뚝 사이 LW 그라우팅 차수', '두부 정리 후 캡 빔 타설'] }),
      O('scw', 'SCW (소일시멘트 벽)', { time: 70, cost: 72, quality: 78, safety: 78, env: 74 }, { fx: { wallRate: 170, retain: 0.8, watertight: 0.9, stiff: 0.65 }, how: ['3축 오거로 흙과 시멘트 밀크 교반', '겹침 시공으로 연속 차수벽', 'H형강 응력재 삽입', '캡 빔 타설'] }),
      O('dwall', '지하연속벽 (D-Wall, 영구벽 겸용)', { time: 50, cost: 40, quality: 94, safety: 92, env: 80 }, { fx: { wallRate: 95, retain: 1.45, watertight: 1, stiff: 1, permanent: 1 }, how: ['가이드월 설치', '안정액(벤토나이트) 채우며 하이드로밀 굴착 2.8m 패널', '철근망 일괄 인양·삽입', '트레미 콘크리트 타설, 이음 장치로 차수', '지하 외벽으로 영구 사용'] }),
      O('open', '사면 개착 (Open Cut)', { time: 92, cost: 96, quality: 60, safety: 55, env: 66 }, { fx: { wallRate: 600, retain: 0.12, watertight: 0, stiff: 0.2, open: 1 }, how: ['1:1~1:1.5 경사로 단계 굴착', '사면 보호 (숏크리트·시트)', '배수로 설치'] }),
      O('nail', '소일네일링', { time: 76, cost: 84, quality: 64, safety: 62, env: 76 }, { fx: { wallRate: 200, retain: 0.5, watertight: 0, stiff: 0.5 }, how: ['1.5m씩 단계 굴착', '천공 후 네일(철근) 삽입·그라우팅', '와이어메시 + 숏크리트 면 보호'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (d.depth <= 0.5) return o.id === 'open' ? [[{ quality: 20 }, '지하층이 없어 얕은 기초 터파기만 합니다']] : { no: '지하 굴착이 없음' };
      if (o.id === 'open') {
        if (d.depth > 7) return { no: `굴착 깊이 ${d.depth.toFixed(0)}m는 사면 개착 한계(약 7m)를 넘습니다` };
        if (c.adj < 25) return { no: '인접 건물이 가까워 사면을 둘 공간이 없습니다' };
        r.push([{ time: 8, cost: 8 }, '얕고 여유 있는 부지라 벽체 없이 경사 굴착이 가장 빠릅니다']);
      }
      if (o.id === 'nail') {
        if (d.depth > 14) return { no: '14m 넘는 굴착은 네일 변형이 커집니다' };
        if (d.belowGW > 0.5) r.push([{ safety: -30, quality: -20 }, '지하수면 아래 굴착에서는 네일 면이 무너질 위험이 큽니다']);
        if (d.soft > 0.5) return { no: '연약 지반에는 네일 정착력이 부족합니다' };
      }
      if (o.id === 'hpile') {
        if (d.belowGW > 1) r.push([{ safety: -28, quality: -20 }, `지하수면 아래로 ${d.belowGW.toFixed(0)}m 파야 해 토류판 틈으로 물과 흙이 샙니다 (차수 별도 필요)`]);
        if (c.adj < 15) r.push([{ safety: -15 }, '인접 건물이 가까워 벽체 변형으로 인한 침하가 우려됩니다']);
        if (d.depth > 18) r.push([{ safety: -12 }, '18m 넘는 굴착에는 강성이 부족합니다']);
        if (d.rock > 0.5 && d.belowGW < 1) r.push([{ time: 6, cost: 6 }, '지하수가 낮은 암반 지반에서는 가장 경제적인 표준 공법입니다']);
      }
      if (o.id === 'sheet') {
        if (d.rock > 0.4 || c.rockDepth < d.depth) r.push([{ time: -30, quality: -25 }, '암반에는 강널이 박히지 않습니다']);
        if (d.depth > 12) r.push([{ safety: -18 }, '12m 넘는 깊이에는 강성이 부족합니다']);
        if (c.noise === 'high' || c.adj < 15) r.push([{ env: -20, safety: -8 }, '진동 해머 소음·진동이 인접 주거에 민원을 만듭니다']);
        if (d.soft > 0.5 && d.depth <= 12) r.push([{ time: 10, cost: 6 }, '연약 지반·얕은 굴착에 빠르고 차수도 됩니다']);
      }
      if (o.id === 'cip') {
        if (d.belowGW > 2) r.push([{ quality: -8 }, '말뚝 사이 차수 그라우팅을 따로 해야 합니다']);
        if (d.depth > 22) r.push([{ safety: -10 }, '22m 넘는 굴착은 벽체 연속성이 떨어집니다']);
        if (c.ground === 'W') r.push([{ quality: 6 }, '풍화토·풍화암 지반에서 시공성이 좋습니다']);
      }
      if (o.id === 'scw') {
        if (c.rockDepth < d.depth) r.push([{ time: -22, quality: -12 }, '암반 구간은 교반이 안 돼 하부 근입이 어렵습니다']);
        if (d.depth > 20) r.push([{ safety: -12 }, '20m 넘는 굴착에서는 SCW 강성이 부족해 변형이 커집니다']);
        if (d.belowGW > 1 || d.soft > 0.3) r.push([{ quality: 12, safety: 10 }, '흙과 시멘트를 섞은 연속벽이라 지하수를 잘 막습니다']);
        if (d.depth > 28) r.push([{ safety: -12 }, '28m 넘는 굴착에는 강성이 부족합니다']);
      }
      if (o.id === 'dwall') {
        if (d.depth >= 20) r.push([{ safety: 10, quality: 6 }, `깊이 ${d.depth.toFixed(0)}m 굴착에 강성·차수 모두 확실합니다`]);
        if (c.adj < 15) r.push([{ safety: 10 }, '인접 건물이 가까워 변형이 가장 작은 벽이 필요합니다']);
        if (d.depth < 12) r.push([{ cost: -20, time: -10 }, '얕은 굴착에는 과한 공법입니다']);
        if (d.belowGW > 6) r.push([{ quality: 8 }, '깊은 지하수 아래 굴착의 차수 성능이 가장 좋습니다']);
      }
      return r;
    },
  },
  {
    id: 'support', code: 'L04', name: '흙막이 지보', en: 'SUPPORT SYSTEM', phase: 'earth',
    desc: '흙막이 벽이 안쪽으로 밀려들지 않게 받칩니다. 굴착 속도와 지하·지상 동시 시공 여부를 결정합니다.',
    opts: [
      O('strut', '버팀보 (Strut)', { time: 62, cost: 74, quality: 76, safety: 80, env: 76 }, { fx: { excav: 0.85, baseCyc: 1.0 }, how: ['굴착 단계마다 띠장 + H형강 버팀보 설치', '중간 말뚝(파일)로 좌굴 방지', '프리로딩으로 변형 억제', '지하층 타설하며 역순 해체'] }),
      O('anchor', '어스앵커', { time: 82, cost: 70, quality: 72, safety: 70, env: 70 }, { fx: { excav: 1.25, baseCyc: 0.92 }, how: ['벽체를 관통해 경사 천공', '강연선 삽입·그라우팅, 정착 지반 형성', '긴장·정착 → 다음 단 굴착', '공사 후 제거식 앵커 해체'] }),
      O('raker', '레이커 (경사 버팀)', { time: 70, cost: 76, quality: 70, safety: 72, env: 76 }, { fx: { excav: 1.05, baseCyc: 0.98 }, how: ['중앙부 먼저 굴착·기초 타설 (아일랜드)', '기초에서 벽으로 경사 버팀 설치', '주변부 굴착 후 지하층 완성'] }),
      O('topdown', '역타 (Top-down: 지하 슬래브로 지지)', { time: 88, cost: 52, quality: 80, safety: 86, env: 82 }, { fx: { excav: 0.7, baseCyc: 1.25, overlap: 1 }, how: ['기둥 위치에 철골 기둥(PRD) 선시공', '지상 1층 슬래브 타설 → 작업 개구부', '슬래브 아래로 굴착하며 B1·B2… 슬래브를 차례로 타설', '지하 굴착과 동시에 지상 골조 상승', '최하층 기초 매트로 마감'] }),
      O('sps', 'SPS (영구 철골 버팀)', { time: 84, cost: 64, quality: 84, safety: 84, env: 80 }, { fx: { excav: 0.95, baseCyc: 0.85, overlap: 0.6 }, how: ['철골 보를 임시 버팀으로 쓰고 그대로 영구 구조로', '해체 공정이 없어 지하 공기 단축', '데크 슬래브로 층 완성'] }),
      O('self', '자립식 (지보 없음)', { time: 95, cost: 95, quality: 60, safety: 50, env: 80 }, { fx: { excav: 1.4, baseCyc: 1.0 }, how: ['벽체 근입만으로 버팀 (캔틸레버)'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      if (d.depth <= 0.5) return o.id === 'self' ? [[{ quality: 20, safety: 30 }, '지하층이 없습니다']] : { no: '지하 굴착이 없음' };
      if (sel.wall === 'open') return o.id === 'self' ? [[{ safety: 30 }, '사면 개착은 지보가 필요 없습니다']] : { no: '사면 개착에는 지보가 필요 없음' };
      if (o.id === 'self' && d.depth > 5) return { no: '5m 넘는 굴착은 자립 불가' };
      if (o.id === 'anchor') {
        if (c.adj < 15) r.push([{ safety: -20, cost: -10 }, '앵커가 인접 대지 지중으로 들어가 동의·민원 문제가 생깁니다']);
        if (d.soft > 0.5) r.push([{ safety: -30 }, '연약 점토에는 정착력이 나오지 않습니다']);
        if (d.lotW > 120) r.push([{ time: 10 }, `블록 폭 ${Math.round(d.lotW)}m로 넓어 버팀보 없이 장비가 자유롭게 움직입니다`]);
      }
      if (o.id === 'strut' && d.lotW > 120) r.push([{ cost: -12, safety: -8 }, `블록 폭 ${Math.round(d.lotW)}m에는 버팀보가 너무 길어 좌굴 위험이 커집니다`]);
      if (o.id === 'strut' && d.lotW <= 80) r.push([{ safety: 6 }, '좁은 굴착에서는 버팀보가 가장 확실합니다']);
      if (o.id === 'topdown') {
        if (d.depth >= 18) r.push([{ time: 12, safety: 6 }, `지하 ${d.depth.toFixed(0)}m 깊은 굴착은 슬래브 지지가 가장 안정적이고 지상과 동시 시공해 공기를 줄입니다`]);
        if (c.adj < 15) r.push([{ safety: 10 }, '도심 협소 부지에서 변형·소음이 가장 작습니다']);
        if (d.depth < 10) r.push([{ cost: -18, time: -15 }, '얕은 지하에는 역타의 복잡성이 득보다 큽니다']);
        if (sel.wall && !['dwall', 'cip', 'scw'].includes(sel.wall)) r.push([{ safety: -15 }, '역타에는 영구벽 수준의 강성 벽체(지하연속벽·CIP·SCW)가 필요합니다']);
      }
      if (o.id === 'sps' && d.depth >= 12) r.push([{ time: 8 }, '버팀보 해체 공정을 없애 지하 공기를 줄입니다']);
      if (o.id === 'raker' && d.lotW > 140 && d.depth < 15) r.push([{ time: 8, cost: 6 }, '넓고 얕은 굴착은 중앙 아일랜드 + 레이커가 경제적입니다']);
      return r;
    },
  },
  {
    id: 'water', code: 'L05', name: '차수·배수', en: 'GROUNDWATER CONTROL', phase: 'wall',
    desc: '굴착 중 지하수 유입을 막고, 완공 후 부력·누수를 관리합니다.',
    opts: [
      O('none', '별도 대책 없음', { time: 95, cost: 96, quality: 70, safety: 70, env: 90 }, { fx: { waterCost: 0, waterDays: 0 }, how: ['집수정 배수만 운영'] }),
      O('grout', '차수 그라우팅 (LW·SGR)', { time: 74, cost: 76, quality: 74, safety: 76, env: 70 }, { fx: { waterCost: 6, waterDays: 25 }, how: ['벽체 배면 1열·2열 천공', '물유리계 약액 주입', '투수 시험으로 차수 확인'] }),
      O('jsp', '고압분사 (JSP·RJP) 차수', { time: 68, cost: 64, quality: 86, safety: 82, env: 66 }, { fx: { waterCost: 11, waterDays: 35 }, how: ['초고압 분사로 원주형 고결체 형성', '벽체 이음부·하부 근입부 보강', '코어로 개량체 확인'] }),
      O('dewater', '디워터링 (Deep Well)', { time: 82, cost: 80, quality: 70, safety: 60, env: 52 }, { fx: { waterCost: 5, waterDays: 15 }, how: ['굴착 주변 깊은 우물 설치', '양수로 지하수위를 굴착 바닥 아래로', '주변 침하 계측 (지하수위 저하 영향)'] }),
      O('drain', '영구배수 (드레인 매트 + 상시 배수)', { time: 80, cost: 74, quality: 80, safety: 78, env: 64 }, { fx: { waterCost: 7, waterDays: 20, foundSave: 0.12 }, how: ['기초 아래 드레인 매트·유공관', '집수정 → 상시 펌핑', '부력이 줄어 기초 두께 절감'] }),
      O('anchor', '부력 앵커 (영구 앵커)', { time: 70, cost: 66, quality: 86, safety: 84, env: 80 }, { fx: { waterCost: 10, waterDays: 30 }, how: ['기초 아래 암반까지 앵커 천공', '인장재 정착으로 부력 저항', '유지관리 없는 수동 저항'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      if (d.belowGW < 0.5) return o.id === 'none' ? [[{ quality: 20, safety: 15 }, `지하수면(GL−${c.gw}m)이 굴착 바닥보다 깊습니다`]] : { no: '지하수면 위 굴착' };
      const wt = (WPS[2].opts.find(x => x.id === sel.wall) || { fx: {} }).fx.watertight ?? 0.5;
      if (o.id === 'none') r.push([{ safety: -40 * (1 - wt), quality: -30 * (1 - wt) }, wt >= 0.9 ? '벽체가 차수벽이라 굴착 중 유입은 적습니다' : `지하수면 아래 ${d.belowGW.toFixed(0)}m를 차수 없이 파면 유입·보일링 위험이 큽니다`]);
      if (o.id === 'dewater') { if (c.adj < 25) r.push([{ safety: -25, env: -10 }, '지하수위를 낮추면 인접 건물이 침하합니다']); else r.push([{ cost: 6 }, '주변 건물이 멀어 양수가 가장 단순합니다']); }
      if ((o.id === 'grout' || o.id === 'jsp') && wt < 0.5) r.push([{ quality: 12, safety: 10 }, '투수성 벽체(H-Pile·CIP)의 틈을 막아야 합니다']);
      if ((o.id === 'grout' || o.id === 'jsp') && wt >= 0.9) r.push([{ cost: -15 }, '벽체가 이미 차수벽이라 중복입니다']);
      if (o.id === 'drain' && d.belowGW > 4) r.push([{ cost: 8, time: 4 }, `부력(수두 ${d.belowGW.toFixed(0)}m)을 줄여 기초 두께를 아낍니다`]);
      if (o.id === 'anchor' && d.belowGW > 8) r.push([{ quality: 8 }, '큰 부력에 운영비 없이 저항합니다']);
      if (o.id === 'anchor' && d.rock < 0.3) r.push([{ quality: -12 }, '정착할 암반이 깊습니다']);
      return r;
    },
  },
  {
    id: 'excav', code: 'L06', name: '굴착', en: 'EXCAVATION', phase: 'earth',
    desc: '토사는 굴삭기로, 암반은 발파 또는 무진동 파쇄로 파냅니다.',
    opts: [
      O('normal', '토사 굴착 (백호·클램쉘)', { time: 78, cost: 86, quality: 76, safety: 74, env: 72 }, { fx: { rockRate: 0.45 }, how: ['단계별(2~3m) 굴착', '클램쉘로 깊은 구간 양중', '덤프 반출 (세륜 시설)'] }),
      O('blast', '제어 발파', { time: 90, cost: 80, quality: 70, safety: 58, env: 40 }, { fx: { rockRate: 1.0 }, how: ['시험 발파로 진동 상수 산정', '천공·장약 (지발 뇌관)', '방호 매트 덮고 발파', '진동·소음 계측'] }),
      O('splitter', '무진동 암파쇄 (유압 할암)', { time: 46, cost: 58, quality: 78, safety: 82, env: 86 }, { fx: { rockRate: 0.5 }, how: ['대구경 천공', '유압 할암기로 균열 유도', '브레이커로 2차 파쇄'] }),
      O('mix', '혼합 (상부 토사 + 하부 미진동 발파)', { time: 80, cost: 76, quality: 76, safety: 72, env: 64 }, { fx: { rockRate: 0.8 }, how: ['토사층 백호 굴착', '암반층 미진동 발파 + 할암 병행', '진동 기준 구역별 적용'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (d.depth <= 0.5) return o.id === 'normal' ? [[{ quality: 15 }, '얕은 터파기만 있습니다']] : { no: '암반 굴착 없음' };
      if (d.rockCut < 0.5) {
        if (o.id === 'normal') r.push([{ time: 12, cost: 8 }, `기반암(GL−${c.rockDepth}m)이 굴착 바닥보다 깊어 토사만 팝니다`]);
        else return { no: '암반 굴착이 없음' };
        return r;
      }
      if (o.id === 'normal') r.push([{ time: -35, cost: -20 }, `암반 ${d.rockCut.toFixed(0)}m를 브레이커로만 깨면 매우 느립니다`]);
      if (o.id === 'blast') { if (c.noise === 'high' || c.adj < 20) r.push([{ safety: -25, env: -25 }, '인접 건물·주거가 가까워 발파 진동 허용치(0.3cm/s 수준)를 맞추기 어렵습니다']); else r.push([{ time: 8 }, '주변이 열려 있어 발파가 가장 빠릅니다']); }
      if (o.id === 'splitter' && (c.noise === 'high' || d.vib)) r.push([{ safety: 10, env: 8 }, '진동이 거의 없어 도심·정밀 시설 옆에서 씁니다']);
      if (o.id === 'mix' && c.noise !== 'low') r.push([{ time: 6, env: 6 }, '구역별로 진동 기준을 나눠 속도와 민원을 절충합니다']);
      return r;
    },
  },
  {
    id: 'found', code: 'L07', name: '기초', en: 'FOUNDATION', phase: 'found',
    desc: '건물 하중을 지지층으로 전달합니다. 지반·하중·진동 기준이 선택을 좌우합니다.',
    opts: [
      O('mat', '직접기초 (전면 매트)', { time: 86, cost: 88, quality: 72, safety: 80, env: 80 }, { fx: { foundDays: 0.85, found: 0.8 }, how: ['버림 콘크리트·방수', '하부근·상부근 배근 (매트 2~4m)', '저발열 콘크리트 분할 타설', '수화열 온도 계측·양생'] }),
      O('phc', 'PHC 파일 + 매트', { time: 74, cost: 76, quality: 74, safety: 76, env: 64 }, { fx: { foundDays: 1.1, found: 1.0 }, how: ['SDA·디젤 해머로 PHC 말뚝 시공', '재하 시험 (동재하·정재하)', '두부 정리 → 매트 타설'] }),
      O('bored', '현장타설말뚝 (RCD·대구경)', { time: 52, cost: 52, quality: 92, safety: 82, env: 72 }, { fx: { foundDays: 1.45, found: 1.55 }, how: ['케이싱 설치 → RCD 굴착 (암반 소켓)', '철근망 삽입·트레미 타설', '양방향 재하 시험', '매트로 연결'] }),
      O('piledraft', '파일 래프트 (Piled Raft)', { time: 68, cost: 66, quality: 88, safety: 84, env: 72 }, { fx: { foundDays: 1.25, found: 1.25 }, how: ['매트와 말뚝이 하중을 나눠 받도록 설계', '말뚝 수를 침하 제어용으로 최적화', '매트 타설'] }),
      O('steel', '강관 말뚝 (깊은 연약층)', { time: 72, cost: 60, quality: 84, safety: 78, env: 62 }, { fx: { foundDays: 1.2, found: 1.35 }, how: ['대구경 강관 항타 (지지층 근입)', '두부 보강', '매트·파일캡 타설'] }),
      O('micro', '마이크로파일', { time: 60, cost: 62, quality: 70, safety: 80, env: 84 }, { fx: { foundDays: 1.3, found: 1.2 }, how: ['소구경 천공·강봉 삽입', '그라우팅', '좁은 공간·기존 구조물 옆 시공'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const heavyH = d.superTall ? 3 : d.tall ? 2 : d.heavy ? 1.5 : 0;
      if (o.id === 'mat') {
        if (d.soft > 0.5) return { no: '연약 지반에는 직접기초를 둘 수 없음' };
        if (c.ground === 'R' || (c.rockDepth <= d.depth + 2)) r.push([{ time: 10, cost: 10, quality: 10 }, '굴착 바닥이 암반에 닿아 말뚝 없이 지지됩니다']);
        else if (heavyH >= 2) r.push([{ safety: -25, quality: -20 }, `높이 ${Math.round(d.maxH)}m 건물 하중을 토사 위 매트만으로는 받기 어렵습니다`]);
        if (d.vib) r.push([{ quality: 6 }, '두꺼운 매트가 진동을 잘 잡습니다']);
      }
      if (o.id === 'phc') {
        if (heavyH >= 2) r.push([{ quality: -18, safety: -10 }, '초고층 하중에는 PHC 지지력이 부족합니다']);
        if (c.rockDepth > 35) r.push([{ quality: -10 }, '지지층이 깊어 이음이 많아집니다']);
        if (c.noise === 'high') r.push([{ env: -15 }, '항타 소음 민원 (SDA 공법으로 줄여야 함)']);
        if (!d.tall && d.soft < 0.5 && c.ground !== 'R') r.push([{ cost: 8, time: 6 }, '중층 건물·보통 지반의 표준 해법입니다']);
      }
      if (o.id === 'bored' && heavyH >= 2) r.push([{ quality: 10, safety: 10 }, '초고층·중량 설비 하중을 암반 소켓으로 확실히 받습니다']);
      if (o.id === 'bored' && !d.tall && !d.heavy) r.push([{ cost: -18 }, '하중에 비해 과한 공법입니다']);
      if (o.id === 'piledraft' && d.tall && c.ground !== 'R') r.push([{ cost: 10, quality: 6 }, '초고층의 부등침하를 줄이며 말뚝 수를 최적화합니다']);
      if (o.id === 'steel' && d.soft > 0.5) r.push([{ time: 10, quality: 8 }, `깊은 연약층(기반암 GL−${c.rockDepth}m)을 관통해 지지층에 닿습니다`]);
      if (o.id === 'steel' && d.soft < 0.3) r.push([{ cost: -12 }, '연약층이 없어 강관이 과합니다']);
      if (o.id === 'micro' && d.foot > 20000) r.push([{ time: -20, cost: -15 }, '넓은 바닥에는 시공 수량이 지나치게 많습니다']);
      return r;
    },
  },
  {
    id: 'base', code: 'L08', name: '지하 골조 순서', en: 'SUBSTRUCTURE SEQUENCE', phase: 'base',
    desc: '지하층을 아래에서 위로 올릴지(순타), 위에서 아래로 내려갈지(역타), 둘을 동시에 할지 정합니다.',
    opts: [
      O('bottomup', '순타 (Bottom-up)', { time: 62, cost: 84, quality: 80, safety: 78, env: 76 }, { fx: { overlapB: 0 }, how: ['최하층까지 굴착 완료', '기초 매트 → B(n) → … → B1 슬래브 순서로 타설', '지상 골조 착수'] }),
      O('topdown', '역타 (Top-down)', { time: 86, cost: 56, quality: 76, safety: 84, env: 82 }, { fx: { overlapB: 1 }, how: ['1층 슬래브 먼저', '지하는 아래로, 지상은 위로 동시 진행', '최하층 매트로 마감'] }),
      O('updown', '업다운 (Up-Up 동시)', { time: 94, cost: 48, quality: 74, safety: 76, env: 80 }, { fx: { overlapB: 1.2 }, how: ['역타 + 지상 골조 선행 상승을 극대화', '철골 기둥(PRD) 하중 범위 안에서 지상 층수 제한', '지하 완료 후 기둥 콘크리트 피복'] }),
      O('semi', '부분 역타 (코어만 선행)', { time: 76, cost: 70, quality: 78, safety: 80, env: 80 }, { fx: { overlapB: 0.5 }, how: ['코어 구간만 선굴착·선시공', '코어 위로 지상 골조 일부 선행', '나머지 순타'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      if (d.depth <= 0.5) return o.id === 'bottomup' ? [[{ quality: 15 }, '지하층이 없습니다']] : { no: '지하층 없음' };
      if (sel.support === 'topdown' && o.id === 'bottomup') return { no: '역타 지보(슬래브 지지)를 골랐으므로 순타 불가' };
      if (sel.support !== 'topdown' && (o.id === 'topdown' || o.id === 'updown')) return { no: '역타·업다운은 지보를 역타(슬래브 지지)로 골라야 함' };
      if (sel.support === 'topdown' && o.id === 'semi') return { no: '전면 역타 지보에는 부분 역타가 맞지 않음' };
      if (o.id === 'updown' && d.tall) r.push([{ time: 8 }, '초고층 지상 골조를 지하와 겹쳐 올려 전체 공기를 크게 줄입니다']);
      if (o.id === 'semi' && d.tall && d.depth >= 12) r.push([{ time: 8 }, '코어 선행으로 타워 공정을 앞당깁니다']);
      if (o.id !== 'bottomup' && d.ind) r.push([{ cost: -10 }, '저층 산업 시설은 지상 공기가 짧아 겹침 이득이 작습니다']);
      return r;
    },
  },
  {
    id: 'frame', code: 'L09', name: '지상 골조 시스템', en: 'STRUCTURAL SYSTEM', phase: 'struct',
    desc: '건물 뼈대의 재료와 형식. 사이클 공기·스팬·탄소 배출이 달라집니다.',
    opts: [
      O('rcwall', 'RC 벽식 구조', { time: 72, cost: 84, quality: 70, safety: 76, env: 58 }, { fx: { cyc: 1.0, st: 1.0, co2: 1.0 }, uses: ['housing', 'mixed', 'hotel'], how: ['벽과 슬래브를 한 번에 타설', '알루미늄 폼으로 층당 5~7일 사이클', '설비 배관 슬래브 매립'] }),
      O('rcframe', 'RC 라멘 (기둥·보)', { time: 66, cost: 80, quality: 78, safety: 76, env: 58 }, { fx: { cyc: 1.08, st: 1.05, co2: 1.02 }, how: ['기둥 → 보·슬래브 타설', '가변형 평면 (리모델링 쉬움)', '층당 7~9일'] }),
      O('hybrid', 'RC 코어 + 철골 (초고층·업무)', { time: 84, cost: 62, quality: 86, safety: 80, env: 66 }, { fx: { cyc: 0.85, st: 1.18, co2: 0.95 }, uses: ['office', 'hotel', 'mixed', 'housing', 'hospital'], how: ['코어를 자동상승 거폼으로 3~5개 층 선행', '외곽 철골 기둥·보 세우기', '데크플레이트 + 슬래브 타설', '아웃리거·벨트 트러스로 횡력 저항'] }),
      O('src', 'SRC (철골철근콘크리트)', { time: 58, cost: 60, quality: 88, safety: 80, env: 60 }, { fx: { cyc: 1.15, st: 1.25, co2: 1.08 }, how: ['철골 기둥 세우고 둘레 철근', '거푸집 + 콘크리트 피복', '대형 하중·장스팬'] }),
      O('steel', '철골 (S조) + 데크', { time: 88, cost: 66, quality: 82, safety: 74, env: 70 }, { fx: { cyc: 0.75, st: 1.15, co2: 0.92 }, how: ['공장 제작 기둥·보 반입', '고력볼트·현장 용접', '데크플레이트 깔고 슬래브', '내화 뿜칠'] }),
      O('pc', 'PC (프리캐스트 기둥·보·슬래브)', { time: 90, cost: 72, quality: 86, safety: 82, env: 72 }, { fx: { cyc: 0.62, st: 1.06, co2: 0.88 }, uses: ['logistics', 'battery', 'bio', 'dc', 'fab', 'retail', 'lab', 'housing', 'hospital'], how: ['공장 양생 부재 운반 (JIT)', '크레인 조립 → 접합부 그라우팅', '토핑 콘크리트', '현장 거푸집 거의 없음'] }),
      O('modular', '모듈러 (OSC)', { time: 96, cost: 58, quality: 84, safety: 88, env: 80 }, { fx: { cyc: 0.45, st: 1.22, co2: 0.8, finSave: 0.4 }, uses: ['housing', 'hotel', 'hospital'], how: ['공장에서 마감·설비까지 끝낸 모듈 생산', '현장에서 기초·코어와 병행', '하루 10~20개 모듈 적층', '접합·외장 마무리'] }),
      O('truss', '철골 트러스 + PC (장스팬 산업)', { time: 86, cost: 70, quality: 84, safety: 78, env: 72 }, { fx: { cyc: 0.7, st: 1.0, co2: 0.9 }, uses: ['fab', 'battery', 'bio', 'dc', 'logistics', 'arena', 'retail', 'museum', 'power'], how: ['PC 기둥·와플 슬래브(팹 진동 제어)', '지붕 철골 트러스 지상 조립 → 일괄 인양', '클린룸 천장 그리드', '방진 구역 분리'] }),
      O('module', '플랜트 모듈화 (대형 모듈)', { time: 92, cost: 66, quality: 88, safety: 86, env: 74 }, { fx: { cyc: 0.6, st: 1.12, co2: 0.9 }, uses: ['chem', 'power', 'water'], how: ['해외·국내 야드에서 파이프랙·설비 모듈 제작', '해상·육상 운송 (SPMT)', '대형 크레인 일괄 설치', '모듈 간 배관 연결 (타이인)'] }),
      O('stick', '현장 조립 (Stick-built)', { time: 52, cost: 80, quality: 72, safety: 66, env: 66 }, { fx: { cyc: 1.25, st: 0.95, co2: 1.0 }, uses: ['chem', 'power', 'water'], how: ['부재를 현장으로 반입해 하나씩 조립', '배관 현장 용접', '인력 집중 투입'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      if (o.uses && !o.uses.includes(u)) return { no: `${d.u.name}에는 쓰지 않는 형식` };
      if (d.plant && !['module', 'stick', 'steel'].includes(o.id)) return { no: '플랜트 구조물은 철골·모듈 계열' };
      if (o.id === 'rcwall' && d.res && !d.superTall) r.push([{ cost: 10, time: 4 }, '국내 공동주택 표준. 층간소음·결로 대응 경험이 많습니다']);
      if (o.id === 'rcwall' && d.superTall) r.push([{ safety: -15 }, '200m 넘는 높이에는 벽식만으로 횡력 대응이 어렵습니다']);
      if (o.id === 'hybrid' && d.tall) r.push([{ time: 10, quality: 6 }, `높이 ${Math.round(d.maxH)}m: 코어 선행 + 철골 외곽이 가장 빠르고 가볍습니다`]);
      if (o.id === 'hybrid' && !d.tall && d.res) r.push([{ cost: -15 }, '중층 주거에는 과합니다']);
      if (o.id === 'modular' && d.maxH > 60) r.push([{ safety: -14, cost: -10 }, '60m 넘는 모듈러는 코어·횡력 보강 비용이 큽니다']);
      if (o.id === 'modular' && d.maxH <= 60) r.push([{ time: 6 }, '공장 생산과 현장 기초를 병행해 공기를 30~50% 줄입니다']);
      if (o.id === 'truss' && d.vib) r.push([{ quality: 10 }, '와플 슬래브·방진 기초로 진동 기준(VC-D)을 맞춥니다']);
      if (o.id === 'pc' && d.ind) r.push([{ time: 6, cost: 6 }, '반복 장스팬 산업 시설에서 PC가 가장 빠릅니다']);
      if (o.id === 'module' && d.plant) r.push([{ safety: 8, time: 6 }, '현장 고소 작업과 인력 피크를 야드로 옮깁니다']);
      if (o.id === 'steel' && (d.res || d.u.id === 'hotel' || d.u.id === 'hospital')) r.push([{ quality: -10 }, '객실·병실·주거의 층간 소음·진동 대응이 불리합니다']);
      if (o.id === 'pc' && d.res) r.push([{ cost: -14, quality: -4 }, '국내 PC 공동주택은 접합부 누수·층간소음 검증 단계이고 생산 공장 수급이 제약입니다']);
      if (o.id === 'pc' && d.u.id === 'hospital') r.push([{ quality: -8 }, '의료 설비 개구부·변경이 잦아 PC 부재가 불리합니다']);
      return r;
    },
  },
  {
    id: 'form', code: 'L10', name: '거푸집', en: 'FORMWORK', phase: 'struct',
    desc: '콘크리트 형틀. 층당 사이클 일수와 안전(추락)에 직접 영향을 줍니다.',
    opts: [
      O('conv', '재래식 합판 거푸집', { time: 50, cost: 82, quality: 60, safety: 58, env: 50 }, { fx: { formCyc: 1.15 }, how: ['합판·각재로 매 층 짜고 해체', '숙련 인력 의존'] }),
      O('alform', '알루미늄 폼 (벽식)', { time: 82, cost: 76, quality: 80, safety: 74, env: 78 }, { fx: { formCyc: 0.9 }, uses: ['rcwall', 'rcframe', 'modular'], how: ['벽·슬래브 일체 알루미늄 패널', '층당 300회 이상 전용', '5~6일 사이클'] }),
      O('gang', '갱폼 (외벽 대형 패널)', { time: 78, cost: 74, quality: 76, safety: 80, env: 74 }, { fx: { formCyc: 0.95 }, uses: ['rcwall', 'rcframe', 'src'], how: ['외벽 대형 거푸집 + 작업 발판 일체', '크레인으로 한 층씩 인양', '추락 방지 안전 난간 일체'] }),
      O('acs', '자동상승 시스템폼 (ACS·RCS)', { time: 90, cost: 58, quality: 86, safety: 90, env: 80 }, { fx: { formCyc: 0.8, coreAhead: 1 }, uses: ['hybrid', 'src', 'rcframe'], how: ['코어 벽 거푸집 + 작업대가 유압 잭으로 스스로 상승', '크레인 없이 3~4일 사이클', '코어를 슬래브보다 3~5개 층 선행'] }),
      O('slip', '슬립폼 (연속 타설)', { time: 94, cost: 66, quality: 78, safety: 82, env: 80 }, { fx: { formCyc: 0.55 }, uses: ['module', 'stick', 'steel', 'truss'], how: ['거푸집을 하루 3~5m 연속 상승', '연돌·사일로·코어에 적합', '24시간 연속 타설 체계'] }),
      O('deck', '데크플레이트', { time: 86, cost: 78, quality: 80, safety: 80, env: 76 }, { fx: { formCyc: 0.82 }, uses: ['hybrid', 'steel', 'src', 'truss'], how: ['철골 보 위 골강판 깔기', '지주 없이 철근·타설', '하부 층과 동시 작업'] }),
      O('pcf', 'PC·모듈 공장 생산', { time: 92, cost: 70, quality: 88, safety: 86, env: 82 }, { fx: { formCyc: 0.7 }, uses: ['pc', 'modular', 'truss', 'module'], how: ['현장 거푸집 최소화', '접합부만 현장 타설'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      if (o.uses && sel.frame && !o.uses.includes(sel.frame)) return { no: '고른 골조 시스템과 맞지 않음' };
      if (o.id === 'acs' && d.tall) r.push([{ time: 10, safety: 6 }, '고층 코어 선행에 가장 빠르고 안전합니다']);
      if (o.id === 'acs' && d.maxH < 60) r.push([{ cost: -18 }, '저층에는 장비 비용이 회수되지 않습니다']);
      if (o.id === 'alform' && d.res) r.push([{ cost: 6 }, '반복 평면 공동주택에서 전용 횟수로 단가가 낮아집니다']);
      if (o.id === 'slip' && d.cyl) r.push([{ time: 8 }, '연돌·탑류 원통 구조물을 끊김 없이 올립니다']);
      if (o.id === 'conv' && (d.tall || d.res)) r.push([{ time: -10 }, '반복 층이 많아 재래식은 느립니다']);
      return r;
    },
  },
  {
    id: 'conc', code: 'L11', name: '콘크리트·재료', en: 'CONCRETE & MATERIAL', phase: 'struct',
    desc: '콘크리트 배합 전략. 강도·수화열·탄소·동절기 양생에 영향을 줍니다.',
    opts: [
      O('normal', '일반 강도 (24~35MPa)', { time: 76, cost: 88, quality: 70, safety: 76, env: 56 }, { fx: { concCost: 1.0, winterAdj: 1.0, co2c: 1.0 }, how: ['레미콘 표준 배합', '동절기 보온 양생'] }),
      O('high', '고강도 (60~80MPa)', { time: 74, cost: 70, quality: 88, safety: 80, env: 60 }, { fx: { concCost: 1.12, winterAdj: 0.95, co2c: 1.05 }, how: ['실리카퓸·고성능 감수제', '기둥 단면 축소 (전용면적 증가)', '고압 펌프 압송 (300m+)'] }),
      O('lowheat', '저발열 (매스 콘크리트)', { time: 70, cost: 80, quality: 84, safety: 80, env: 66 }, { fx: { concCost: 1.04, winterAdj: 1.05, co2c: 0.9, massFound: 1 }, how: ['저열 시멘트·플라이애시', '두꺼운 매트·벽 균열 억제', '온도 센서로 양생 관리'] }),
      O('scc', '고유동 자기충전 (SCC)', { time: 82, cost: 72, quality: 86, safety: 80, env: 62 }, { fx: { concCost: 1.1, winterAdj: 1.0, co2c: 1.02 }, how: ['다짐 없이 철근 사이 충전', '과밀 배근부·SRC 피복'] }),
      O('lowc', '저탄소 (고로슬래그·순환 골재)', { time: 64, cost: 80, quality: 76, safety: 76, env: 92 }, { fx: { concCost: 1.02, winterAdj: 1.15, co2c: 0.7 }, how: ['시멘트 40~60% 고로슬래그 치환', '초기 강도가 늦어 거푸집 존치 기간 관리', '탄소 배출 약 30% 감소'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (o.id === 'high' && d.tall) r.push([{ quality: 8, cost: 8 }, '초고층 하부 기둥 단면을 줄여 면적을 얻습니다']);
      if (o.id === 'high' && !d.tall) r.push([{ cost: -12 }, '저층에는 강도가 남습니다']);
      if (o.id === 'lowheat' && (d.depth >= 12 || d.tall || d.heavy)) r.push([{ quality: 10 }, '두꺼운 기초 매트의 수화열 균열을 막습니다']);
      if (o.id === 'lowc' && ['GWD', 'GGN', 'CBK'].includes(c.reg)) r.push([{ time: -8 }, '추운 지역이라 동절기 초기 강도 확보가 늦습니다']);
      if (o.id === 'lowc') r.push([{ env: 4 }, '탄소 배출 약 30% 감소 (녹색건축 인증 가점)']);
      return r;
    },
  },
  {
    id: 'lift', code: 'L12', name: '양중', en: 'LIFTING', phase: 'struct',
    desc: '자재를 들어 올리는 장비. 크레인 대수·작업 반경이 공정 간섭을 좌우합니다.',
    opts: [
      O('tower', '타워크레인 (T형)', { time: 80, cost: 80, quality: 74, safety: 70, env: 74 }, { fx: { craneR: 60, liftCyc: 1.0 }, how: ['기초·마스트 설치', '건물과 함께 텔레스코핑 상승', '지브 반경 50~70m'] }),
      O('luffing', '러핑 크레인 (협소 도심)', { time: 74, cost: 70, quality: 76, safety: 80, env: 78 }, { fx: { craneR: 45, liftCyc: 1.05 }, how: ['지브를 세워 선회 반경 축소', '인접 대지·도로 상공 침범 최소', '고층 내부 클라이밍'] }),
      O('crawler', '대형 크롤러 크레인', { time: 82, cost: 72, quality: 78, safety: 76, env: 70 }, { fx: { craneR: 80, liftCyc: 0.9 }, how: ['600~1,350t급 크롤러', '장스팬 트러스·탑류 일괄 인양', '지반 보강 (매트)'] }),
      O('mobile', '이동식 크레인 + 호이스트', { time: 74, cost: 86, quality: 70, safety: 72, env: 76 }, { fx: { craneR: 30, liftCyc: 1.1 }, how: ['저층 건물 이동식 크레인', '자재 호이스트 병행'] }),
      O('ringer', '초대형 링거 크레인 (모듈 일괄)', { time: 88, cost: 52, quality: 84, safety: 80, env: 72 }, { fx: { craneR: 110, liftCyc: 0.8 }, how: ['3,000t급 링거 크레인 조립', '대형 모듈·반응기 일괄 설치', '인양 계획 BIM 시뮬레이션'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (o.id === 'luffing' && c.adj < 20) r.push([{ safety: 12 }, '인접 대지 상공 침범(선회 간섭)을 피합니다']);
      if (o.id === 'tower' && d.tall) r.push([{ time: 6 }, '고층 타워의 표준 양중 장비입니다']);
      if ((o.id === 'crawler' || o.id === 'ringer') && !(d.plant || d.ind)) r.push([{ cost: -18 }, '건축물에는 과한 장비입니다']);
      if (o.id === 'ringer' && d.plant) r.push([{ time: 10, safety: 6 }, '탑·반응기를 모듈째 세워 고소 작업을 줄입니다']);
      if (o.id === 'crawler' && d.ind) r.push([{ time: 6 }, '장스팬 지붕 트러스를 지상 조립 후 일괄 인양합니다']);
      if (o.id === 'mobile' && d.maxH > 40) return { no: '40m 넘는 건물에는 부적합' };
      return r;
    },
  },
  {
    id: 'skin', code: 'L13', name: '외장', en: 'ENVELOPE', phase: 'skin',
    desc: '외벽 시스템. 층당 시공 속도와 기밀·단열 품질이 다릅니다.',
    opts: [
      O('unitcw', '유닛 커튼월', { time: 88, cost: 58, quality: 88, safety: 84, env: 72 }, { fx: { skinCyc: 0.75, skin: 1.2 }, how: ['공장에서 유리·프레임 유닛 조립', '층별 앵커에 크레인·모노레일로 걸기', '외부 비계 없이 내부에서 시공'] }),
      O('stickcw', '스틱 커튼월', { time: 62, cost: 74, quality: 74, safety: 70, env: 70 }, { fx: { skinCyc: 1.1, skin: 1.0 }, how: ['멀리언·트랜섬 현장 조립', '유리 끼우기·실링', '외부 작업대 필요'] }),
      O('pcpanel', 'PC 외벽 패널', { time: 80, cost: 72, quality: 82, safety: 80, env: 74 }, { fx: { skinCyc: 0.85, skin: 0.95 }, how: ['창호 일체 PC 패널 공장 생산', '크레인으로 설치·접합 실링'] }),
      O('metal', '금속 샌드위치 패널', { time: 90, cost: 84, quality: 72, safety: 78, env: 70 }, { fx: { skinCyc: 0.7, skin: 0.7 }, how: ['단열 일체 금속 패널', '산업 시설 장스팬 벽·지붕', '빠른 외피 폐쇄 → 내부 공정 착수'] }),
      O('wet', '창호 + 석재·도장 (습식)', { time: 56, cost: 86, quality: 66, safety: 66, env: 64 }, { fx: { skinCyc: 1.15, skin: 0.85 }, how: ['창호 설치', '외단열 + 마감(석재·도장)', '갱폼 해체 후 외부 작업'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (o.id === 'unitcw' && d.tall) r.push([{ time: 10 }, '고층 외부 작업 없이 층마다 빠르게 닫습니다']);
      if (o.id === 'unitcw' && d.res) r.push([{ cost: -10 }, '주거에는 단가가 높고 환기창 대응이 필요합니다']);
      if (o.id === 'metal' && !d.ind) r.push([{ quality: -18 }, '건축물 외관·내구성 기준에 못 미칩니다']);
      if (o.id === 'metal' && d.ind) r.push([{ time: 6, cost: 6 }, '대형 산업 시설 외피의 표준입니다']);
      if (o.id === 'wet' && d.res) r.push([{ cost: 6 }, '공동주택 표준 마감입니다']);
      if (o.id === 'wet' && d.tall) r.push([{ safety: -12 }, '고층 외부 습식 작업은 추락 위험이 큽니다']);
      return r;
    },
  },
  {
    id: 'mep', code: 'L14', name: '설비 시공', en: 'MEP DELIVERY', phase: 'mep',
    desc: '기계·전기·배관을 현장에서 할지, 공장에서 모듈로 만들지 정합니다.',
    opts: [
      O('conv', '재래식 현장 시공', { time: 58, cost: 84, quality: 64, safety: 64, env: 62 }, { fx: { mepCyc: 1.1, mepC: 1.0 }, how: ['현장 측정·절단·용접', '공종별 순차 투입'] }),
      O('prefab', '프리팹 MEP 모듈 (멀티 트레이드 랙)', { time: 86, cost: 70, quality: 86, safety: 82, env: 78 }, { fx: { mepCyc: 0.75, mepC: 1.06 }, how: ['덕트·배관·트레이를 한 랙에 공장 조립', '층마다 랙 인양·연결', '현장 인력 30~40% 절감'] }),
      O('spool', 'BIM 기반 스풀 제작', { time: 78, cost: 76, quality: 84, safety: 76, env: 74 }, { fx: { mepCyc: 0.85, mepC: 1.02 }, how: ['BIM에서 배관 스풀도 자동 생성', '공장 가공·번호 부여', '현장 조립만'] }),
      O('hookup', '훅업 전문 공정 (공정 배관)', { time: 74, cost: 60, quality: 90, safety: 78, env: 72 }, { fx: { mepCyc: 0.9, mepC: 1.12 }, how: ['장비 반입 후 초순수·가스·배기 연결', '클린 배관 (오비탈 용접)', '누설·순도 시험'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (o.id === 'hookup' && !['fab', 'bio', 'chem', 'battery', 'power'].includes(d.u.id)) return { no: '공정 설비가 있는 시설 전용' };
      if (o.id === 'hookup') r.push([{ quality: 8, time: 6 }, '공정 장비 연결 품질이 가동 일정을 좌우합니다']);
      if (o.id === 'prefab' && (d.tall || d.ind)) r.push([{ time: 6 }, '반복 층·대형 설비 구간에서 효과가 큽니다']);
      return r;
    },
  },
  {
    id: 'plan', code: 'L15', name: '공정관리 기법', en: 'SCHEDULING', phase: null,
    desc: '공정표를 어떻게 짜고 관리하는가. 공종 간섭을 미리 찾고 푸는 능력이 다릅니다.',
    opts: [
      O('cpm', 'CPM (주공정법)', { time: 60, cost: 88, quality: 62, safety: 66, env: 70 }, { fx: { lagCut: 0, detect: 0.45, solve: 0, varCut: 0 }, how: ['작업·선후행 네트워크', '주공정(여유 0) 관리', '월간 진도 갱신'] }),
      O('lob', 'LOB (Line of Balance)', { time: 70, cost: 84, quality: 68, safety: 70, env: 70 }, { fx: { lagCut: 1, detect: 0.6, solve: 0.2, varCut: 0.05 }, how: ['반복 층 작업을 생산 속도 선으로', '공종 간 버퍼 층수 관리', '속도 차로 생기는 충돌 예측'] }),
      O('takt', '택트 공정 (Takt Planning)', { time: 80, cost: 80, quality: 74, safety: 74, env: 72 }, { fx: { lagCut: 2, detect: 0.65, solve: 0.3, varCut: 0.1 }, how: ['공간을 같은 작업량 구역으로 나눔', '모든 공종이 같은 박자(택트)로 이동', '작업 대기·적층 최소화'] }),
      O('lps', 'Last Planner System (협업 계획)', { time: 74, cost: 82, quality: 78, safety: 78, env: 72 }, { fx: { lagCut: 1, detect: 0.7, solve: 0.3, varCut: 0.18 }, how: ['마스터 → 단계 → 6주 선행 → 주간 계획', '제약 조건 사전 제거', '계획 이행률(PPC) 관리'] }),
      O('bim4d', '4D BIM 시뮬레이션', { time: 82, cost: 76, quality: 84, safety: 84, env: 74 }, { fx: { lagCut: 1, detect: 0.88, solve: 0.45, varCut: 0.15 }, tag: 'BIM', how: ['BIM 부재에 공정 연결', '3D로 시공 순서 재생', '크레인·동선·가설 간섭 시각 검토'] }),
      O('ai', 'AI 공정 최적화 (4D BIM + 탐색 알고리즘)', { time: 92, cost: 72, quality: 86, safety: 86, env: 76 }, { fx: { lagCut: 2, detect: 1, solve: 1, varCut: 0.25 }, tag: 'AI', how: ['4D BIM 모델에서 공종·자원·공간 제약 자동 추출', '크레인 반경·동시 굴착·트럭 피크·공종 적층 충돌 탐지', '착공 순서·시차·크레인 높이를 탐색 알고리즘으로 최적화', '최적안을 4D로 검증, 진척 데이터로 매주 재최적화'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if ((o.id === 'ai' || o.id === 'bim4d') && d.area > 150000) r.push([{ time: 6, safety: 4 }, `블록이 많은 ${Math.round(d.area / 1e4)}ha 사업이라 동시 작업 충돌이 많습니다`]);
      if ((o.id === 'ai' || o.id === 'bim4d') && d.area < 40000) r.push([{ cost: -16 }, '건물이 적은 소규모 현장에는 모델 구축·운영비가 과합니다']);
      if ((o.id === 'lob' || o.id === 'takt') && (d.res || d.tall)) r.push([{ time: 6 }, '반복 층이 많아 생산 속도 균형이 잘 맞습니다']);
      return r;
    },
  },
  {
    id: 'qa', code: 'L16', name: '품질·안전 관리 기술', en: 'QA / SAFETY TECH', phase: null, multi: true,
    desc: '여럿을 함께 고를 수 있습니다. 위험 예측 단계에서 해당 위험의 발생 확률을 낮춥니다.',
    opts: [
      O('iot', '콘크리트 IoT 강도 센서 (성숙도법)', { time: 84, cost: 82, quality: 86, safety: 80, env: 76 }, { fx: { cycCut: 0.06, qcost: 0.15 }, how: ['타설 시 무선 온도 센서 매립', '성숙도법으로 실시간 강도 추정', '거푸집 해체·인장 시점 최적화'] }),
      O('scan', '3D 레이저 스캔 (Scan-to-BIM)', { time: 76, cost: 78, quality: 90, safety: 76, env: 76 }, { fx: { rework: 0.3, qcost: 0.2 }, how: ['층마다 지상 스캐너·SLAM 스캔', '설계 BIM과 편차 비교 (±10mm)', '오차 구간 즉시 재시공 지시'] }),
      O('drone', '드론 사진측량', { time: 80, cost: 86, quality: 78, safety: 82, env: 80 }, { fx: { qcost: 0.08 }, how: ['주 1회 자동 비행', '정사영상·3D 메시 → 토공량 계산', '진척률 자동 산정'] }),
      O('clash', 'BIM 간섭검토 (Clash Detection)', { time: 82, cost: 84, quality: 88, safety: 78, env: 78 }, { fx: { rework: 0.35, qcost: 0.12 }, how: ['구조·건축·MEP 통합 모델', '하드·소프트 간섭 자동 탐지', '시공 전 조정 회의 (BIM 코디네이션)'] }),
      O('vision', 'AI 비전 (CCTV 안전·결함 탐지)', { time: 78, cost: 78, quality: 80, safety: 92, env: 76 }, { fx: { qcost: 0.18 }, tag: 'AI', how: ['현장 CCTV 영상 실시간 분석', '안전모·고리 미착용, 위험 구역 진입 탐지', '균열·누수 결함 자동 분류'] }),
      O('twin', '디지털 트윈 모니터링', { time: 80, cost: 66, quality: 88, safety: 88, env: 80 }, { fx: { qcost: 0.35 }, tag: 'AI', how: ['흙막이 변위·지하수·진동 계측 연동', '모델 예측과 실측 비교 → 이상 조기 경보', '공정·자원 실시간 대시보드'] }),
      O('rfid', 'RFID·QR 자재 추적', { time: 80, cost: 84, quality: 76, safety: 74, env: 78 }, { fx: { qcost: 0.08 }, how: ['자재·모듈에 태그', '반입·설치 위치 자동 기록', '적기 반입(JIT)으로 야적 공간 절감'] }),
      O('wear', '스마트 안전 장비 (웨어러블·근접 경보)', { time: 78, cost: 84, quality: 70, safety: 92, env: 78 }, { fx: { qcost: 0.1 }, how: ['작업자 위치·생체 신호', '중장비·크레인 근접 경보', '밀폐 공간 가스 감지'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (o.id === 'twin' && (d.depth >= 15 || c.adj < 15)) r.push([{ safety: 8 }, '깊은 굴착·근접 시공의 변위를 실시간으로 잡습니다']);
      if (o.id === 'drone' && d.area > 200000) r.push([{ quality: 8 }, '넓은 부지 토공·진척 관리에 효과가 큽니다']);
      if (o.id === 'scan' && (d.ind || d.tall)) r.push([{ quality: 6 }, '정밀 설비·커튼월 앵커 오차 관리에 필요합니다']);
      if (o.id === 'clash' && (d.ind || d.u.id === 'hospital')) r.push([{ quality: 8 }, '설비 밀도가 높아 간섭 재시공 비용이 큽니다']);
      return r;
    },
  },
];
export const WP_BY_ID = Object.fromEntries(WPS.map(w => [w.id, w]));

// 기준선 (전통 공법 묶음) — 효과 비교용
export const BASELINE = { survey: 'spt', improve: 'none', wall: 'cip', support: 'strut', water: 'grout', excav: 'normal', found: 'phc', base: 'bottomup', frame: 'rcframe', form: 'conv', conc: 'normal', lift: 'tower', skin: 'wet', mep: 'conv', plan: 'cpm', qa: [] };

// 한 공종의 공법 평가 (sel: 지금까지 고른 다른 공종)
function evalWP(wp, cond, d, prio, sel) {
  const sw = Object.values(prio).reduce((a, b) => a + b, 0) || 1;
  return wp.opts.map(o => {
    const res = wp.rule(cond, d, o, sel) || [];
    if (res.no) return { o, ok: false, why: res.no, score: 0, adj: o.b, reasons: [] };
    const adj = { ...o.b };
    const reasons = [];
    res.forEach(([delta, why]) => { Object.entries(delta).forEach(([k, v]) => { adj[k] = clamp(adj[k] + v, 0, 100); }); reasons.push({ why, delta }); });
    const score = Object.keys(PRIO).reduce((s, k) => s + adj[k] * (prio[k] || 0), 0) / sw;
    return { o, ok: true, adj, score: Math.round(score * 10) / 10, reasons };
  });
}

// 전체 평가: 공종 순서대로 (앞 공종 선택이 뒤 공종 규칙에 쓰인다)
export function resolveMethods(cond, d, picks = {}, prio = PRIO_DEFAULT) {
  const sel = {}, out = [];
  WPS.forEach(wp => {
    const ev = evalWP(wp, cond, d, prio, sel);
    const okList = ev.filter(e => e.ok).sort((a, b) => b.score - a.score);
    let rec, chosen;
    if (wp.multi) {
      // 품질·안전 기술: 점수 상위 3개 추천
      rec = okList.slice(0, 3).map(e => e.o.id);
      chosen = Array.isArray(picks[wp.id]) ? picks[wp.id].filter(id => ev.find(e => e.o.id === id && e.ok)) : rec;
      sel[wp.id] = chosen;
    } else {
      rec = okList.length ? okList[0].o.id : wp.opts[0].id;
      const p = picks[wp.id];
      chosen = p && ev.find(e => e.o.id === p && e.ok) ? p : rec;
      sel[wp.id] = chosen;
    }
    const user = wp.multi ? Array.isArray(picks[wp.id]) : !!(picks[wp.id] && picks[wp.id] === chosen && chosen !== rec);
    const invalid = !wp.multi && picks[wp.id] && !ev.find(e => e.o.id === picks[wp.id] && e.ok);
    out.push({ wp, ev, rec, chosen, user, invalid: invalid ? picks[wp.id] : null });
  });
  return { list: out, sel, fx: effects(out, d), prio };
}

// 고른 공법 → 공정·예산·위험 효과
export function effects(list, d) {
  const pick = (id) => { const r = list.find(x => x.wp.id === id); if (!r) return null; const c = r.chosen; return Array.isArray(c) ? c.map(k => r.wp.opts.find(o => o.id === k)) : r.wp.opts.find(o => o.id === c); };
  const fx = {};
  const s = pick('survey'), im = pick('improve'), w = pick('wall'), sp = pick('support'), wa = pick('water'), ex = pick('excav'), fo = pick('found'), ba = pick('base'),
    fr = pick('frame'), fm = pick('form'), co = pick('conc'), li = pick('lift'), sk = pick('skin'), me = pick('mep'), pl = pick('plan'), qa = pick('qa') || [];
  fx.surveyDays = s.fx.surveyDays; fx.unc = s.fx.unc;
  fx.improveDays = im.fx.improveDays; fx.improveCost = im.fx.improveCost;
  fx.wallRate = w.fx.wallRate; fx.retainK = w.fx.retain; fx.watertight = w.fx.watertight; fx.stiff = w.fx.stiff; fx.open = !!w.fx.open; fx.permanent = !!w.fx.permanent;
  fx.excavK = sp.fx.excav * (1 - 0.55 * (1 - ex.fx.rockRate) * Math.min(1, d.rockCut / Math.max(1, d.depth)));
  fx.baseCycK = sp.fx.baseCyc;
  fx.overlap = Math.max(sp.fx.overlap || 0, ba.fx.overlapB || 0);
  fx.waterDays = wa.fx.waterDays; fx.waterCost = wa.fx.waterCost; fx.foundSave = wa.fx.foundSave || 0;
  fx.foundDaysK = fo.fx.foundDays; fx.foundK = fo.fx.found * (1 - fx.foundSave);
  const qaCyc = qa.reduce((a, o) => a + (o.fx.cycCut || 0), 0);
  fx.structCycK = fr.fx.cyc * fm.fx.formCyc * (li.fx.liftCyc || 1) * (1 - qaCyc);
  fx.structCostK = fr.fx.st; fx.co2K = fr.fx.co2 * co.fx.co2c; fx.finSave = fr.fx.finSave || 0;
  fx.coreAhead = !!fm.fx.coreAhead; fx.frame = fr.id; fx.wallId = w.id; fx.foundId = fo.id; fx.skinId = sk.id;
  fx.ids = Object.fromEntries(list.filter(x => !x.wp.multi).map(x => [x.wp.id, x.chosen]));
  fx.concCostK = co.fx.concCost; fx.winterK = co.fx.winterAdj;
  fx.craneR = li.fx.craneR; fx.craneKind = li.id;
  fx.skinCycK = sk.fx.skinCyc; fx.skinK = sk.fx.skin;
  fx.mepCycK = me.fx.mepCyc; fx.mepK = me.fx.mepC;
  fx.lagCut = pl.fx.lagCut; fx.detect = pl.fx.detect; fx.solve = pl.fx.solve; fx.varCut = pl.fx.varCut; fx.plan = pl.id;
  fx.rework = qa.reduce((a, o) => a + (o.fx.rework || 0), 0);
  fx.qaCostPct = qa.reduce((a, o) => a + (o.fx.qcost || 0), 0); // % of direct
  fx.qa = qa.map(o => o.id);
  // 종합 지수 (선택한 공법들의 품질·안전·환경 평균, 0~100)
  const ch = list.filter(x => !x.wp.multi).map(x => x.ev.find(e => e.o.id === x.chosen)).filter(e => e && e.ok);
  const avg = (k) => ch.reduce((a, e) => a + e.adj[k], 0) / Math.max(1, ch.length);
  const qaBoost = (k) => qa.reduce((a, o) => a + Math.max(0, o.b[k] - 75) * 0.12, 0);
  fx.index = { quality: Math.round(Math.min(100, avg('quality') + qaBoost('quality'))), safety: Math.round(Math.min(100, avg('safety') + qaBoost('safety'))), env: Math.round(avg('env')), time: Math.round(avg('time')), cost: Math.round(avg('cost')) };
  return fx;
}
// 기준선 효과 (비교용)
export function baselineFx(cond, d) {
  const r = resolveMethods(cond, d, BASELINE, PRIO_DEFAULT);
  return r.fx;
}
