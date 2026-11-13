// 공법·재료 확장: 기초 이후 모든 공정을 세부 공종으로 나눈다.
// 가설 · 지하 방수 · 철근 · 타설·양생 · 철골 · 수직 운송 · 창호·유리 · 단열 · 지붕 · 공조 · 위생 · 소방 · 전기 · 통신 · 승강기 · 칸막이 · 바닥 · 천장 · 도장 · 조경 · 시운전
// 형식은 methods.js의 공종과 같다: b 기준 점수, fx 공정·예산 효과, how 시공 순서, rule(c, d, o, sel) → [[보정, 이유]] 또는 { no }
const O = (id, name, b, extra = {}) => ({ id, name, b, ...extra });
const COLD = ['GWD', 'GGN', 'CBK'];
const RES = ['housing', 'mixed'];
const LIVE = ['housing', 'mixed', 'hotel', 'hospital'];
const CLEAN = ['fab', 'bio', 'battery'];
const PLANT = ['chem', 'power', 'water'];
const IND = ['fab', 'battery', 'bio', 'dc', 'logistics', 'chem', 'power', 'water'];
const STEEL_FRAMES = ['hybrid', 'steel', 'src', 'truss', 'module', 'stick'];
const only = (o, list, u, why) => (o.uses && !o.uses.includes(u) ? { no: why } : null);

export const MORE = {
  // ---------------- 가설 ----------------
  prep: {
    id: 'prep', name: '가설·착공 계획', en: 'SITE SETUP',
    desc: '가설 울타리·현장 사무실·세륜·가설 전력과 민원 대책. 착공 속도와 소음·분진 민원을 좌우합니다.',
    opts: [
      O('std', '표준 가설 (강판 울타리·컨테이너 사무실)', { time: 80, cost: 88, quality: 66, safety: 68, env: 58 }, { fx: { prepDays: 18, prepK: 1, noiseCut: 0 }, how: ['EGI 강판 가설 울타리 (높이 3m)', '컨테이너 현장 사무실·식당·휴게실', '세륜 시설 · 가설 전기 인입', '진입로 포장 · 출입 게이트'] }),
      O('sound', '고차단 방음벽 + 분진 실시간 감시', { time: 74, cost: 72, quality: 72, safety: 74, env: 86 }, { fx: { prepDays: 25, prepK: 1.25, noiseCut: 8 }, how: ['8~12m 흡음형 방음벽', '살수·미스트 분사 + 미세먼지 측정기', '소음·진동 전광판으로 주민에게 공개', '2단 세륜 · 차량 바퀴 세척'] }),
      O('modular', '모듈러 가설 + 스마트 출입 게이트', { time: 80, cost: 72, quality: 74, safety: 80, env: 74 }, { fx: { prepDays: 14, prepK: 1.15, noiseCut: 3 }, how: ['적층 모듈러 사무실·휴게실 (2~3층)', '안면 인식 출입 게이트 · 근로자 이력 관리', '가설 전력 수전 + 태양광 보조', '자재 야적장 구획·표지'] }),
      O('mini', '최소 가설 (외곽 산업 부지)', { time: 90, cost: 94, quality: 60, safety: 64, env: 60 }, { fx: { prepDays: 10, prepK: 0.8, noiseCut: 0 }, how: ['외곽 펜스·출입 통제만', '공용 사무 구역 활용', '가설 도로·야적장을 넓게'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (o.id === 'mini') {
        if (c.adj < 30 || c.noise !== 'low') return { no: '도심·주거 인접 현장에는 최소 가설을 쓸 수 없음' };
        if (d.ind) r.push([{ time: 6, cost: 6 }, '넓은 산업 부지에서 가설을 줄여 착공을 앞당깁니다']);
      }
      if (o.id === 'sound') {
        if (c.noise === 'high' || c.adj < 20) r.push([{ env: 12, safety: 6, time: 8 }, '주거·학교가 가까워 소음·분진 민원으로 공사가 멈추는 일을 줄입니다']);
        if (c.noise === 'low') r.push([{ cost: -14 }, '소음 규제가 완화된 지역이라 과합니다']);
      }
      if (o.id === 'std' && c.noise === 'high') r.push([{ env: -15 }, '3m 울타리로는 고층 주거로 퍼지는 소음·분진을 막지 못합니다']);
      if (o.id === 'modular' && (d.area > 100000 || d.tall)) r.push([{ quality: 4, safety: 6 }, '인원이 많은 대형 현장에서 출입·인력 관리 효과가 큽니다']);
      return r;
    },
  },
  // ---------------- 지하 방수 ----------------
  bwp: {
    id: 'bwp', name: '지하 방수', en: 'BELOW-GRADE WATERPROOFING',
    desc: '지하 외벽·기초의 누수를 막습니다. 흙막이와 외벽이 붙는 방식(합벽·영구벽)과 지하수위가 선택을 좌우합니다.',
    opts: [
      O('sheet', '외방수 시트 (개량 아스팔트·합성고분자)', { time: 66, cost: 82, quality: 72, safety: 74, env: 66 }, { fx: { bwpK: 1, bwpCyc: 1.06, leak: 1 }, how: ['외벽 바깥 작업 공간(약 1m) 확보', '프라이머 → 시트 부착 (겹침 100mm)', '보호재·배수판 → 되메우기'] }),
      O('pre', '선부착 HDPE 시트 (합벽 Pre-applied)', { time: 78, cost: 70, quality: 86, safety: 78, env: 72 }, { fx: { bwpK: 1.2, bwpCyc: 1, leak: 0.55 }, how: ['흙막이 벽·버림 콘크리트에 HDPE 시트 선부착', '시트 위로 철근·콘크리트 타설 → 구체와 일체 접착', '이음부 테이프 · 지수판'] }),
      O('bento', '벤토나이트 매트 (자기 치유)', { time: 76, cost: 74, quality: 78, safety: 78, env: 80 }, { fx: { bwpK: 1.1, bwpCyc: 1, leak: 0.7 }, how: ['흙막이 면에 벤토나이트 매트 고정', '물을 만나면 팽창해 틈을 메움', '기초 하부·외벽 연속 시공'] }),
      O('cryst', '결정성 침투 + 이중벽 배수 (내방수)', { time: 72, cost: 76, quality: 70, safety: 80, env: 74 }, { fx: { bwpK: 1.05, bwpCyc: 1.08, leak: 0.85 }, how: ['구체 콘크리트 면에 결정성 방수재', '내부 이중벽 + 배수판 → 집수정', '샌 물을 모아서 배수'] }),
      O('tank', '수밀 콘크리트 (화이트 탱크)', { time: 80, cost: 72, quality: 82, safety: 80, env: 76 }, { fx: { bwpK: 1.15, bwpCyc: 1.04, leak: 0.6 }, how: ['수밀 배합 + 균열 제어 철근', '지수판·팽창 지수재로 이음부 처리', '구체 자체로 방수'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      if (d.depth <= 0.5) return o.id === 'sheet' ? [[{ quality: 10 }, '지하층이 없어 기초 방습 정도만 필요합니다']] : { no: '지하층 없음' };
      if (o.id === 'sheet') {
        if (sel.wall === 'dwall') return { no: '지하연속벽을 영구 외벽으로 쓰면 바깥에 시트를 붙일 수 없음' };
        if (c.adj < 15) r.push([{ time: -15, quality: -12 }, '인접 건물이 가까워 외벽 바깥 작업 공간이 부족합니다 (합벽 시공)']);
        if (sel.wall === 'open') r.push([{ quality: 8, time: 6 }, '사면 개착이라 외벽 바깥에서 시트를 붙이기 쉽습니다']);
      }
      if (o.id === 'pre') {
        if (d.belowGW > 2) r.push([{ quality: 10, safety: 4 }, `지하수면 아래 ${d.belowGW.toFixed(0)}m: 구체와 일체로 붙어 시트 뒤 물길이 생기지 않습니다`]);
        if (sel.wall === 'open') r.push([{ cost: -10 }, '사면 개착이면 바깥 시트가 더 경제적입니다']);
        if (c.adj < 15) r.push([{ time: 6 }, '흙막이에 붙여 치는 합벽 시공에 맞습니다']);
      }
      if (o.id === 'bento' && c.ground === 'F') r.push([{ quality: -18 }, '해안 매립지의 염분이 벤토나이트 팽창을 떨어뜨립니다']);
      if (o.id === 'cryst') {
        if (d.belowGW > 4) r.push([{ quality: -12 }, '높은 수압에서 내방수만으로는 상시 배수 부담이 큽니다']);
        if (sel.water === 'drain') r.push([{ quality: 8 }, '영구 배수와 함께 쓰면 내부 배수 체계가 이어집니다']);
      }
      if (o.id === 'tank' && d.depth >= 12) r.push([{ quality: 6 }, '깊은 지하에서 구체 자체 방수로 시트 이음부를 없앱니다']);
      if ((o.id === 'pre' || o.id === 'tank') && sel.wall === 'dwall') r.push([{ quality: 6 }, '영구벽(D-Wall)과 내부 구체 이음을 함께 관리합니다']);
      return r;
    },
  },
  // ---------------- 철근 ----------------
  rebar: {
    id: 'rebar', name: '철근 가공·조립', en: 'REINFORCEMENT',
    desc: '철근을 어디서 가공하고 어떻게 조립하는가. 골조 사이클, 현장 인력, 고소 결속 작업이 달라집니다.',
    opts: [
      O('site', '현장 가공·조립', { time: 56, cost: 84, quality: 62, safety: 64, env: 60 }, { fx: { rebCyc: 1.1, rebK: 1 }, how: ['현장 가공장에서 절단·절곡', '층마다 한 가닥씩 배근·결속', '겹침 이음 (철근량 증가)'] }),
      O('shop', '공장 가공 (Cut & Bend, BIM 연동)', { time: 72, cost: 80, quality: 76, safety: 72, env: 72 }, { fx: { rebCyc: 1, rebK: 1 }, how: ['BIM 배근도 → 공장 자동 절단·절곡', '부재별 묶음·태그로 적기 반입 (JIT)', '현장은 조립만', '스크랩 3% 이하'] }),
      O('cage', '선조립 철근 (기둥·벽 케이지)', { time: 80, cost: 70, quality: 80, safety: 78, env: 74 }, { fx: { rebCyc: 0.88, rebK: 1.04 }, how: ['지상 조립장에서 기둥·벽 철근 케이지 조립', '크레인으로 일괄 세우기', '커플러로 아래층 철근과 연결', '고소 결속 작업 감소'] }),
      O('coupler', '고강도 철근(SD600) + 기계식 이음', { time: 76, cost: 76, quality: 84, safety: 74, env: 78 }, { fx: { rebCyc: 0.95, rebK: 0.97 }, how: ['SD600 고강도 철근으로 철근량 15~20% 절감', '나사·압착 커플러로 겹침 이음 제거', '과밀 배근 해소 → 타설 품질 향상'] }),
      O('mesh', '용접 철망·철근 트러스 데크 (슬래브)', { time: 78, cost: 76, quality: 76, safety: 76, env: 74 }, { fx: { rebCyc: 0.92, rebK: 1 }, how: ['슬래브 하부근을 공장 용접 철망으로', '철근 트러스 일체형 데크', '슬래브 배근 시간 40% 단축'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      if (['module', 'stick'].includes(sel.frame) && o.id !== 'shop') return { no: '플랜트 철골·모듈 구조는 기초·바닥 철근만 공장 가공' };
      if (o.id === 'site') {
        if (d.tall || d.res) r.push([{ time: -10, safety: -6 }, '반복 층이 많아 현장 가공은 인력·야적 공간이 많이 듭니다']);
        if (c.adj < 15) r.push([{ time: -6 }, '도심 협소 부지라 가공장을 둘 공간이 부족합니다']);
      }
      if (o.id === 'cage') {
        if (d.tall) r.push([{ time: 8 }, '반복 층이 많아 선조립 효과가 큽니다']);
        if (['pc', 'modular'].includes(sel.frame)) r.push([{ cost: -10 }, 'PC·모듈러는 철근 대부분이 공장에 있어 효과가 작습니다']);
        if (sel.frame === 'rcwall') r.push([{ cost: -8 }, '벽식 구조의 얇은 벽은 케이지로 묶을 이득이 작습니다']);
      }
      if (o.id === 'coupler') {
        if (d.tall) r.push([{ quality: 6 }, '초고층 하부 기둥·코어의 과밀 배근을 풉니다']);
        else r.push([{ cost: -8 }, '중저층에는 커플러 단가가 부담입니다']);
      }
      if (o.id === 'mesh' && sel.form !== 'deck') r.push([{ time: -10 }, '데크플레이트가 아니면 철망 효과가 줄어듭니다']);
      if (o.id === 'mesh' && sel.form === 'deck') r.push([{ time: 6 }, '데크 위 슬래브 배근을 공장 철망으로 대신합니다']);
      if (o.id === 'shop' && d.area > 60000) r.push([{ cost: 4 }, '물량이 커 공장 가공 단가가 내려갑니다']);
      return r;
    },
  },
  // ---------------- 타설·양생 ----------------
  pour: {
    id: 'pour', name: '타설·양생', en: 'PLACING & CURING',
    desc: '콘크리트를 어떻게 올려 붓고 굳히는가. 고층 압송 한계, 하루 타설량, 동절기 품질이 달라집니다.',
    opts: [
      O('boom', '붐 펌프카 타설 + 습윤 양생', { time: 80, cost: 86, quality: 72, safety: 72, env: 68 }, { fx: { pourCyc: 1, pourCap: 1 }, how: ['붐 펌프카 배치 (도달 높이 약 60m)', '레미콘 연속 공급', '진동기 다짐 → 살수·피막 습윤 양생'] }),
      O('cpb', '고정 배관 + 분배기 (CPB)', { time: 84, cost: 78, quality: 78, safety: 80, env: 74 }, { fx: { pourCyc: 0.94, pourCap: 1 }, how: ['정치식 펌프 + 수직 배관', '작업층 CPB(콘크리트 분배 붐)로 타설', '골조와 함께 CPB 상승'] }),
      O('highp', '초고압 펌프 + 수직 압송 (300m+)', { time: 82, cost: 66, quality: 82, safety: 80, env: 72 }, { fx: { pourCyc: 0.95, pourCap: 0.95 }, how: ['초고압 펌프 (토출압 35MPa 이상)', '고강도·고유동 배합 실물 압송 시험', '배관 마모·막힘 관리', '층별 CPB 분배'] }),
      O('bucket', '크레인 버킷 타설', { time: 58, cost: 82, quality: 66, safety: 66, env: 76 }, { fx: { pourCyc: 1.12, pourCap: 0.5 }, how: ['크레인이 버킷을 왕복', '소량·국부 타설 (기둥·코어)', '크레인 점유 시간 증가'] }),
      O('winter', '보온·가열 양생 체계 (동절기)', { time: 76, cost: 72, quality: 84, safety: 76, env: 60 }, { fx: { pourCyc: 0.97, pourCap: 1, winterCut: 0.35 }, how: ['타설층 단열 덮개 + 열풍기 가열 양생', '적산 온도로 거푸집 해체 시점 판단', '동절기에도 사이클 유지'] }),
      O('multi', '다중 펌프 대량 연속 타설 (매트)', { time: 86, cost: 74, quality: 80, safety: 74, env: 64 }, { fx: { pourCyc: 1, pourCap: 1.8 }, how: ['펌프카 4~8대 동시 배치', '레미콘 공장 2~3곳 분산 공급', '매트 기초를 이음 없이 한 번에 (콜드조인트 없음)'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (o.id === 'boom') {
        if (d.maxH > 70) r.push([{ time: -20, quality: -8 }, `높이 ${Math.round(d.maxH)}m: 붐 도달 범위(약 60m)를 넘어 상층은 다른 방식이 필요합니다`]);
        else if (!d.heavy) r.push([{ cost: 6 }, '중저층 표준 방식입니다']);
      }
      if (o.id === 'cpb') {
        if (d.maxH >= 60) r.push([{ time: 8 }, '고층에서 펌프카 없이 매 층 타설합니다']);
        if (d.maxH < 30) r.push([{ cost: -14 }, '저층에는 설치비가 과합니다']);
      }
      if (o.id === 'highp') {
        if (d.maxH < 150) r.push([{ cost: -20 }, '150m 미만에는 초고압 장비가 과합니다']);
        if (d.superTall) r.push([{ time: 10, quality: 8 }, `높이 ${Math.round(d.maxH)}m 꼭대기까지 한 번에 압송합니다`]);
      }
      if (o.id === 'bucket') {
        if (d.maxH > 60 || d.area > 60000) r.push([{ time: -12 }, '크레인이 다른 양중과 겹쳐 사이클이 늘어납니다']);
        else r.push([{ cost: 6 }, '소량 타설에 적합합니다']);
      }
      if (o.id === 'winter' && COLD.includes(c.reg)) r.push([{ time: 8, quality: 6 }, '추운 지역이라 동절기 공정 손실과 초기 동해를 줄입니다']);
      if (o.id === 'multi') {
        if (d.depth >= 10 || d.heavy || d.tall) r.push([{ quality: 8 }, '두꺼운 매트를 이음 없이 한 번에 칩니다']);
        if (c.adj < 15) r.push([{ safety: -8, env: -6 }, '도심 도로에 펌프카·레미콘 대기열이 몰립니다']);
      }
      return r;
    },
  },
  // ---------------- 철골 ----------------
  steel: {
    id: 'steel', name: '철골 세우기·접합', en: 'STEEL ERECTION',
    desc: '철골 부재를 세우고 잇는 방식과 내화 피복. 철골이 들어가는 골조에서만 고릅니다.',
    opts: [
      O('none', '철골 없음 (해당 없음)', { time: 90, cost: 90, quality: 70, safety: 75, env: 75 }, { fx: { steelCyc: 1, steelK: 1 }, how: ['RC·PC 골조라 철골 접합 공정이 없습니다'] }),
      O('bolt', '고력볼트 현장 접합 + 뿜칠 내화', { time: 78, cost: 80, quality: 76, safety: 72, env: 66 }, { fx: { steelCyc: 1, steelK: 1 }, how: ['기둥 2~3개 층을 1절로 세우기', '가볼트 → 수직도 정렬 → 고력볼트 본조임', '데크 깔기', '뿜칠 내화피복 (분진 차단 막)'] }),
      O('weld', '현장 용접 + 내화도료', { time: 66, cost: 74, quality: 80, safety: 64, env: 64 }, { fx: { steelCyc: 1.08, steelK: 1.02 }, how: ['기둥 이음 현장 CO₂ 용접', '초음파 탐상(UT) 전수 검사', '박막형 내화도료 (노출 철골)'] }),
      O('robot', '로봇 용접 + 자동 계측', { time: 80, cost: 68, quality: 90, safety: 80, env: 70 }, { fx: { steelCyc: 0.94, steelK: 1.04 }, tag: 'AI', how: ['레일 주행 용접 로봇으로 기둥 이음', '토털스테이션 자동 계측으로 수직도 관리', '용접 품질 데이터 자동 기록'] }),
      O('block', '대블록 지상 조립 → 일괄 인양', { time: 86, cost: 70, quality: 82, safety: 84, env: 70 }, { fx: { steelCyc: 0.85, steelK: 1.03 }, how: ['지상에서 보·기둥·데크를 대블록으로 조립', '대형 크레인으로 일괄 인양', '고소 접합 개소 약 50% 감소'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      const has = STEEL_FRAMES.includes(sel.frame);
      if (!has) return o.id === 'none' ? [[{ quality: 10 }, '고른 골조에 철골 부재가 없습니다']] : { no: '고른 골조에 철골이 없음' };
      if (o.id === 'none') return { no: '철골이 들어가는 골조라 접합 방식을 골라야 함' };
      if (o.id === 'weld' && d.tall) r.push([{ time: -8, safety: -6 }, '고층 현장 용접은 바람·고소 작업으로 느리고 위험합니다']);
      if (o.id === 'robot') { if (d.tall) r.push([{ quality: 6, time: 6 }, '반복 기둥 이음이 많아 로봇 용접 효과가 큽니다']); else r.push([{ cost: -14 }, '이음 수가 적어 장비비가 회수되지 않습니다']); }
      if (o.id === 'block') {
        if (d.ind || ['truss', 'module'].includes(sel.frame)) r.push([{ time: 8 }, '장스팬 지붕·모듈을 지상에서 조립해 한 번에 올립니다']);
        if (c.adj < 15) r.push([{ safety: -10 }, '협소 부지라 지상 조립장 공간이 부족합니다']);
      }
      if (o.id === 'bolt' && c.noise === 'high') r.push([{ env: 6 }, '현장 용접·불티가 적어 도심에 맞습니다']);
      return r;
    },
  },
  // ---------------- 수직 운송 ----------------
  hoist: {
    id: 'hoist', name: '수직 운송 (호이스트)', en: 'VERTICAL TRANSPORT',
    desc: '사람과 마감 자재를 층으로 나르는 방식. 고층에서 마감·설비 속도와 외장 마감 시점을 좌우합니다.',
    opts: [
      O('rack', '공사용 호이스트 (랙·피니언)', { time: 72, cost: 84, quality: 70, safety: 72, env: 74 }, { fx: { hoistK: 1 }, how: ['건물 외부 마스트 + 2단 케이지', '층마다 출입 데크', '마감 후 해체 → 외벽 보수'] }),
      O('fast', '고속 호이스트 (분속 100m, 2기 이상)', { time: 84, cost: 72, quality: 72, safety: 78, env: 74 }, { fx: { hoistK: 0.9 }, how: ['고속 인버터 호이스트 2~4기', '출퇴근 피크 인원 분산 운행', '자재는 예약 운행 (야간 양중)'] }),
      O('jump', '점프 엘리베이터 (영구 승강기 조기 사용)', { time: 88, cost: 70, quality: 78, safety: 84, env: 80 }, { fx: { hoistK: 0.82, liftEarly: 1 }, how: ['코어 승강로에 영구 승강기를 먼저 설치', '골조 상승에 맞춰 기계 플랫폼 점프', '외부 호이스트 조기 해체 → 외장 마감'] }),
      O('lift', '자재 리프트 + 계단 (저층)', { time: 70, cost: 92, quality: 66, safety: 66, env: 78 }, { fx: { hoistK: 1.05 }, how: ['간이 자재 리프트', '인력은 계단 이동', '저층·소규모 전용'] }),
    ],
    rule(c, d, o) {
      const r = [];
      if (o.id === 'lift') { if (d.maxH > 40) return { no: '40m 넘는 건물에는 인력·자재 수직 운송이 부족함' }; r.push([{ cost: 6 }, '저층이라 간이 리프트로 충분합니다']); }
      if (o.id === 'rack' && d.superTall) r.push([{ time: -14 }, '초고층에서 저속 호이스트는 출퇴근·자재 대기열이 깁니다']);
      if (o.id === 'fast') { if (d.tall) r.push([{ time: 8 }, '고층 인원·자재 대기 시간을 줄입니다']); if (d.maxH < 50) r.push([{ cost: -14 }, '저층에는 과합니다']); }
      if (o.id === 'jump') {
        if (d.plant) return { no: '플랜트 구조물에는 승강 코어가 없음' };
        if (d.maxH < 60) return { no: '60m 미만 건물은 승강기 조기 사용 이득이 작음' };
        if (!d.tall) r.push([{ cost: -16 }, '고층이 아니면 효과가 작습니다']);
        if (d.superTall) r.push([{ time: 10, safety: 6 }, '외부 호이스트 의존을 줄이고 외장을 일찍 닫습니다']);
      }
      return r;
    },
  },
  // ---------------- 창호·유리 ----------------
  glaz: {
    id: 'glaz', name: '창호·유리', en: 'GLAZING & WINDOWS',
    desc: '유리와 창호 사양. 단열·결로·일사 차단 성능과 냉난방 부하, 공사비가 달라집니다.',
    opts: [
      O('dbl', '복층 Low-E 유리 + 단열 알루미늄 창호', { time: 82, cost: 86, quality: 70, safety: 76, env: 62 }, { fx: { glazK: 1, uval: 1.4 }, how: ['알루미늄 단열 바 프레임', '로이(Low-E) 복층 유리 24mm', '실리콘 실링 · 기밀 테이프'] }),
      O('tpl', '삼중 Low-E 유리 (패시브 수준)', { time: 74, cost: 70, quality: 84, safety: 76, env: 84 }, { fx: { glazK: 1.18, uval: 0.9 }, how: ['삼중 유리 + 아르곤 가스', '단열 간봉 (웜엣지)', '열교 차단 프레임'] }),
      O('vac', '진공 복층 유리', { time: 74, cost: 60, quality: 88, safety: 76, env: 86 }, { fx: { glazK: 1.3, uval: 0.7 }, how: ['0.2mm 진공층으로 대류·전도 차단', '얇고 가벼워 표준 프레임 사용', '결로 방지 성능 최고'] }),
      O('bipv', 'BIPV 태양광 일체형 유리', { time: 66, cost: 52, quality: 78, safety: 74, env: 92 }, { fx: { glazK: 1.45, uval: 1.2, pv: 1 }, how: ['스팬드럴·차양부에 태양광 셀 유리', '배선 → 인버터 → 건물 전력 계통 연계', '발전량 모니터링'] }),
      O('pvc', 'PVC 시스템 창호 + 삼중 유리 (주거)', { time: 80, cost: 80, quality: 80, safety: 78, env: 80 }, { fx: { glazK: 1, uval: 1 }, uses: LIVE, how: ['PVC 다중 챔버 프레임', '삼중 유리 + 틸트 앤 턴 하드웨어', '발코니 확장 창 · 이중창'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      const nn = only(o, null, d.u.id, '주거·숙박·병원용 창호'); if (nn) return nn;
      const cw = ['unitcw', 'stickcw'].includes(sel.skin);
      if (o.id === 'pvc' && cw) return { no: '커튼월 외장에는 PVC 창호를 쓰지 않음' };
      if (sel.skin === 'metal') { if (o.id === 'dbl') r.push([{ cost: 6 }, '산업 시설은 창 면적이 작아 표준 사양으로 충분합니다']); else r.push([{ cost: -10 }, '창 면적이 작은 산업 외피에는 과한 사양입니다']); }
      if (o.id === 'tpl' && d.res) r.push([{ quality: 6, env: 4 }, '공동주택 창호 열관류율 기준을 넉넉히 맞춥니다']);
      if (o.id === 'bipv') { if (cw && d.tall) r.push([{ env: 6 }, '넓은 커튼월 면적으로 발전량이 큽니다']); if (d.res) r.push([{ cost: -10 }, '주거 입면은 창이 작아 발전 면적이 부족합니다']); }
      if (o.id === 'dbl' && COLD.includes(c.reg)) r.push([{ quality: -8 }, '추운 지역이라 결로·열손실이 큽니다']);
      if (o.id === 'vac' && d.tall) r.push([{ cost: -6 }, '대형 판유리 공급이 제한적입니다']);
      return r;
    },
  },
  // ---------------- 단열 ----------------
  insul: {
    id: 'insul', name: '단열', en: 'INSULATION',
    desc: '단열재의 위치와 종류. 열교·결로, 외장재 화재 안전(불연)이 달라집니다.',
    opts: [
      O('inner', '내단열 (단열재 + 석고보드)', { time: 78, cost: 88, quality: 62, safety: 70, env: 62 }, { fx: { insK: 1 }, how: ['구체 안쪽에 단열재 부착', '석고보드 마감', '슬래브 끝 열교 보강'] }),
      O('outer', '외단열 미장 (ETICS, 불연 미네랄울)', { time: 64, cost: 76, quality: 82, safety: 74, env: 82 }, { fx: { insK: 1.12 }, how: ['구체 바깥 미네랄울 단열재 앵커 고정', '메시 + 베이스 코트 → 마감 미장', '열교 없는 연속 단열'] }),
      O('vip', '진공 단열재 (VIP)', { time: 72, cost: 58, quality: 86, safety: 76, env: 84 }, { fx: { insK: 1.35 }, how: ['두께 1/5의 고성능 진공 패널', '손상 방지 보호층', '얇은 벽으로 전용 면적 확보'] }),
      O('sandwich', '외피 일체 단열 (패널·유닛 속)', { time: 86, cost: 80, quality: 78, safety: 78, env: 74 }, { fx: { insK: 0.9 }, how: ['커튼월 스팬드럴·샌드위치 패널 속 단열', '외피 설치와 동시에 단열 완료', '별도 단열 공정 없음'] }),
      O('spray', '우레탄 폼 뿜칠 (내부)', { time: 82, cost: 80, quality: 72, safety: 62, env: 66 }, { fx: { insK: 1 }, how: ['우레탄 폼 현장 뿜칠', '틈새 없는 기밀 단열', '시공 중 화기 엄금'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      const panel = ['unitcw', 'pcpanel', 'metal'].includes(sel.skin), cw = ['unitcw', 'stickcw', 'metal'].includes(sel.skin);
      if (o.id === 'sandwich') { if (!panel) return { no: '일체 단열은 유닛 커튼월·PC 패널·샌드위치 패널 외장에서만' }; r.push([{ time: 6 }, '외피 공정 하나로 단열까지 끝냅니다']); }
      if (o.id === 'outer') {
        if (cw) return { no: '커튼월·금속 패널 외장에는 외단열 미장을 쓰지 않음' };
        if (d.maxH > 60) r.push([{ safety: -10 }, '고층 외단열은 외부 작업과 화재 확산 관리가 까다롭습니다 (불연재 필수)']);
        if (d.res) r.push([{ quality: 6 }, '공동주택 결로·열교 하자를 크게 줄입니다']);
      }
      if (o.id === 'inner' && d.res) r.push([{ cost: 6 }, '국내 공동주택 표준입니다']);
      if (o.id === 'inner' && panel) r.push([{ cost: -8 }, '패널 외피에 내단열을 더하면 중복입니다']);
      if (o.id === 'spray') { r.push([{ safety: -6 }, '용접·화기 작업과 겹치면 화재 위험이 큽니다 (물류창고 화재 사례)']); if (d.ind) r.push([{ time: 6 }, '넓은 산업 시설 내부를 빠르게 단열합니다']); }
      if (o.id === 'vip' && !d.res && !d.tall) r.push([{ cost: -6 }, '두께 절감 이득이 작은 건물입니다']);
      return r;
    },
  },
  // ---------------- 지붕 ----------------
  roof: {
    id: 'roof', name: '지붕·옥상 방수', en: 'ROOFING',
    desc: '옥상·지붕 방수와 마감. 누수 하자, 옥상 설비 하중, 녹화·태양광 여부가 달라집니다.',
    opts: [
      O('asphalt', '개량 아스팔트 시트 + 보호 콘크리트', { time: 68, cost: 82, quality: 76, safety: 74, env: 64 }, { fx: { roofDays: 25, roofK: 1 }, how: ['바탕 정리 → 프라이머', '개량 아스팔트 시트 2겹 토치 시공', '단열재 → 보호 누름 콘크리트'] }),
      O('urethane', '우레탄 도막 (노출형)', { time: 80, cost: 88, quality: 62, safety: 72, env: 58 }, { fx: { roofDays: 15, roofK: 0.8 }, how: ['우레탄 2~3mm 도포', 'UV 보호 상도', '정기 재도장 필요'] }),
      O('hybrid', '복합 방수 (시트 + 도막)', { time: 72, cost: 76, quality: 84, safety: 76, env: 66 }, { fx: { roofDays: 22, roofK: 1.1 }, how: ['자착식 시트 하층', '도막 상층으로 이음부 일체화', '설비 기초·드레인 주위 보강'] }),
      O('metal', '금속 지붕 (단열 일체, 장스팬)', { time: 86, cost: 80, quality: 78, safety: 72, env: 70 }, { fx: { roofDays: 20, roofK: 1 }, how: ['퍼린 위 단열 일체 금속 지붕 (클립·심 체결)', '천창·배연창 일체', '빗물 홈통·낙수 처리'] }),
      O('green', '옥상 녹화 + 방근 방수', { time: 60, cost: 64, quality: 82, safety: 76, env: 92 }, { fx: { roofDays: 40, roofK: 1.5 }, how: ['방근 시트 + 보호층', '배수판 · 여과 부직포', '경량 토양 + 식재', '구조 하중 검토 (물 포화 하중)'] }),
      O('pv', '태양광 지붕 (방수 + PV 가대)', { time: 66, cost: 66, quality: 78, safety: 72, env: 90 }, { fx: { roofDays: 30, roofK: 1.35, pv: 1 }, how: ['복합 방수 위 가대 기초 (관통부 최소화)', '모듈·인버터 설치', '계통 연계'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id, big = d.ind || ['arena', 'museum', 'retail'].includes(u);
      if (o.id === 'metal') { if (!big) return { no: '장스팬 산업·대공간 시설 전용' }; r.push([{ time: 6, cost: 6 }, '넓은 지붕을 빠르게 닫아 내부 공정을 앞당깁니다']); }
      if (o.id === 'green') { if (d.ind) r.push([{ cost: -14 }, '설비가 많은 넓은 산업 지붕에는 녹화가 맞지 않습니다']); if (c.adj < 20) r.push([{ env: 4 }, '도심 열섬·빗물 유출을 줄입니다 (녹색건축 가점)']); }
      if (o.id === 'pv') { if (big) r.push([{ env: 8, cost: 6 }, '넓은 지붕이라 발전량이 큽니다 (RE100 대응)']); if (d.tall && !big) r.push([{ cost: -8 }, '탑상형 옥상은 설비가 많아 패널 면적이 작습니다']); }
      if (o.id === 'urethane' && d.tall) r.push([{ quality: -10 }, '고층 옥상 노출 방수는 자외선·풍압으로 하자가 잦습니다']);
      if (o.id === 'asphalt' && d.res) r.push([{ cost: 4 }, '공동주택 표준입니다']);
      if (o.id === 'hybrid' && (d.tall || d.ind)) r.push([{ quality: 6 }, '설비 기초 관통부가 많은 옥상에 강합니다']);
      if (big && ['asphalt', 'urethane'].includes(o.id)) r.push([{ time: -8 }, '넓은 지붕을 습식으로 덮으면 느립니다']);
      return r;
    },
  },
  // ---------------- 공조·냉난방 ----------------
  hvac: {
    id: 'hvac', name: '공조·냉난방', en: 'HVAC',
    desc: '열원과 공조 방식. 설비 공기, 기계실 면적, 에너지 비용, 옥상 장비 양중이 달라집니다.',
    opts: [
      O('central', '중앙식 (냉동기·보일러 + AHU 덕트)', { time: 66, cost: 74, quality: 82, safety: 76, env: 66 }, { fx: { hvacCyc: 1.08, hvacK: 1.05 }, how: ['지하 기계실 냉동기·보일러·축열조', '공조기(AHU) + 주 덕트 입상', '층별 VAV 박스·취출구', '자동제어 연동 → TAB'] }),
      O('vrf', '개별식 시스템 냉난방 (VRF·EHP)', { time: 80, cost: 80, quality: 70, safety: 76, env: 68 }, { fx: { hvacCyc: 0.9, hvacK: 0.92 }, how: ['옥상·층별 실외기', '냉매 배관 + 천장 카세트 실내기', '전열 교환 환기 유닛 별도'] }),
      O('geo', '지열 히트펌프 + 축열', { time: 56, cost: 58, quality: 82, safety: 76, env: 92 }, { fx: { hvacCyc: 1.12, hvacK: 1.2 }, how: ['지중 열교환 보어홀 (깊이 150m, 다수)', '수열원 히트펌프', '신재생 에너지 의무 비율 충족'] }),
      O('radiant', '복사 냉난방 + 외기 전담 공조 (DOAS)', { time: 66, cost: 64, quality: 88, safety: 76, env: 86 }, { fx: { hvacCyc: 1.05, hvacK: 1.12 }, how: ['슬래브·천장 복사 패널 (냉온수)', '외기 전담 공조기로 환기·제습', '쾌적성·에너지 효율 최고'] }),
      O('district', '지역난방 + 바닥 난방 (주거)', { time: 80, cost: 84, quality: 78, safety: 80, env: 78 }, { fx: { hvacCyc: 0.95, hvacK: 0.9 }, uses: RES, how: ['지역난방 열교환기 (기계실)', '세대 온수 분배기 + 바닥 난방 코일', '세대 환기 장치 (전열 교환)'] }),
      O('clean', '클린룸 공조 (FFU + MAU)', { time: 60, cost: 50, quality: 92, safety: 78, env: 60 }, { fx: { hvacCyc: 1.2, hvacK: 1.6 }, uses: CLEAN, how: ['외조기(MAU)로 온습도 정밀 제어', '천장 FFU 그리드 + HEPA·ULPA 필터', '청정 구역 단계별 차압 제어', '청정도 인증 시험'] }),
      O('crac', '항온항습 + 프리쿨링 (데이터센터)', { time: 66, cost: 56, quality: 90, safety: 80, env: 72 }, { fx: { hvacCyc: 1.12, hvacK: 1.5 }, uses: ['dc'], how: ['서버실 항온항습기 + 열·냉 복도 분리', '외기 냉방(프리쿨링)으로 PUE 개선', '냉각수 이중화 (N+1)'] }),
      O('process', '공정 냉각수 + 국소 배기 (플랜트)', { time: 70, cost: 66, quality: 84, safety: 80, env: 70 }, { fx: { hvacCyc: 1.05, hvacK: 1.2 }, uses: PLANT, how: ['냉각탑·공정 냉각수 계통', '방폭 국소 배기 · 가압 제어실', '유해 가스 감지 연동'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      const nn = only(o, null, u, '이 용도에는 쓰지 않는 공조 방식'); if (nn) return nn;
      if (CLEAN.includes(u) && !['clean', 'central'].includes(o.id)) return { no: '청정 공정 시설에는 맞지 않음' };
      if (u === 'dc' && !['crac', 'central'].includes(o.id)) return { no: '데이터센터 서버실에는 맞지 않음' };
      if (PLANT.includes(u) && !['process', 'central'].includes(o.id)) return { no: '플랜트에는 공정 냉각·방폭 배기가 필요함' };
      if (PLANT.includes(u) && o.id === 'central') r.push([{ quality: -12 }, '방폭·유해 가스 배기가 없는 일반 공조는 관리동 전용입니다']);
      if (o.id === 'process') r.push([{ quality: 10, safety: 6 }, '공정 발열 냉각과 유해 가스 국소 배기를 함께 처리합니다']);
      if (o.id === 'central' && (CLEAN.includes(u) || u === 'dc')) r.push([{ quality: -25 }, '일반 공조로는 공정 청정도·서버 발열을 맞추지 못합니다 (사무 구역용)']);
      if (o.id === 'clean') r.push([{ quality: 10 }, '공정 청정도(ISO 등급)를 맞추는 유일한 방식입니다']);
      if (o.id === 'crac') r.push([{ quality: 10 }, '서버 발열을 24시간 이중화해 처리합니다']);
      if (o.id === 'district') r.push([{ cost: 8, time: 4 }, '공동주택 표준 (지역난방 공급 지역)']);
      if (o.id === 'vrf') { if (d.tall) r.push([{ quality: -8 }, '초고층은 냉매 배관 길이·실외기 공간 제약이 큽니다']); else if (['office', 'retail', 'hotel'].includes(u)) r.push([{ time: 6 }, '구역별 개별 운전·빠른 설치가 장점입니다']); }
      if (o.id === 'vrf' && ['hospital', 'museum', 'arena', 'lab'].includes(u)) r.push([{ quality: -12 }, '병원·전시·대공간·실험실의 환기량·정밀 온습도를 맞추기 어렵습니다']);
      if (o.id === 'central' && (d.tall || ['hospital', 'arena', 'museum', 'retail'].includes(u))) r.push([{ quality: 10, safety: 4 }, '초고층·대공간·병원의 대용량·정밀 공조에 유리합니다']);
      if (o.id === 'geo') { if (d.area < 10000) r.push([{ cost: -10, time: -6 }, '부지가 좁아 보어홀 수가 부족합니다']); if (c.ground === 'R') r.push([{ time: -8, cost: -6 }, '암반 천공 비용이 큽니다']); if (['museum', 'hospital', 'lab'].includes(u)) r.push([{ env: 4 }, '공공·대형 건축 신재생 의무 비율 대응']); }
      if (o.id === 'radiant' && ['office', 'museum', 'lab'].includes(u)) r.push([{ quality: 4 }, '외피 성능이 좋은 업무·전시 공간에 쾌적합니다']);
      if (o.id === 'radiant' && d.res) r.push([{ cost: -8 }, '주거에는 바닥 난방이 이미 복사 방식입니다']);
      return r;
    },
  },
  // ---------------- 급배수·위생 ----------------
  plumb: {
    id: 'plumb', name: '급배수·위생', en: 'PLUMBING',
    desc: '급수·배수·위생 배관 방식. 층간 배수 소음, 고층 수압, 물 절약, 공정 용수가 달라집니다.',
    opts: [
      O('booster', '부스터 펌프 직결 급수 + 일반 배관', { time: 80, cost: 84, quality: 70, safety: 76, env: 70 }, { fx: { plumbCyc: 1, plumbK: 1 }, how: ['지하 저수조 + 부스터 펌프 가압', '스테인리스 급수 입상관', '주철·PVC 배수 입상관'] }),
      O('zone', '중간 수조 · 감압 구역 분할 (초고층)', { time: 70, cost: 70, quality: 86, safety: 78, env: 72 }, { fx: { plumbCyc: 1.06, plumbK: 1.1 }, how: ['피난층 중간 수조로 수압 구역 분할', '감압 밸브로 층별 수압 균일', '배수 입상관 오프셋·통기 보강'] }),
      O('quiet', '층상 배관 + 저소음 배수 (주거)', { time: 72, cost: 74, quality: 86, safety: 78, env: 76 }, { fx: { plumbCyc: 1.04, plumbK: 1.08 }, uses: LIVE, how: ['아래층 천장을 지나지 않는 층상 배관', '이중관·흡음 배수관', '욕실 바닥 높이 조정'] }),
      O('pod', '욕실 유닛 (UBR·Pod) + 헤더 배관', { time: 90, cost: 72, quality: 84, safety: 82, env: 78 }, { fx: { plumbCyc: 0.82, plumbK: 1.06, finCut: 0.08 }, uses: LIVE, how: ['공장에서 완성한 욕실 유닛 반입', '헤더 분기 급수 (가교 PE관)', '현장은 연결부만 시공'] }),
      O('reuse', '빗물·중수 재이용 + 절수 설비', { time: 68, cost: 68, quality: 78, safety: 76, env: 92 }, { fx: { plumbCyc: 1.06, plumbK: 1.12 }, how: ['빗물 저류조 · 여과 → 조경·화장실 세정수', '절수형 위생기구', '물 사용량 계측'] }),
      O('upw', '초순수·공정 배관 (팹·바이오)', { time: 60, cost: 52, quality: 92, safety: 76, env: 66 }, { fx: { plumbCyc: 1.15, plumbK: 1.5 }, uses: CLEAN, how: ['초순수(UPW) 생산 설비', 'PVDF·스테인리스 EP 배관 오비탈 용접', '공정 배수 분리·중화 처리'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      const nn = only(o, null, u, '이 용도에는 쓰지 않는 배관 방식'); if (nn) return nn;
      if (o.id === 'zone') { if (d.maxH < 80) return { no: '80m 미만 건물은 수압 구역 분할이 필요 없음' }; if (d.superTall) r.push([{ quality: 10, safety: 4 }, '초고층 하층의 과도한 수압·수격을 막습니다']); }
      if (o.id === 'booster' && d.maxH > 70) r.push([{ quality: d.superTall ? -18 : -12 }, `높이 ${Math.round(d.maxH)}m를 한 구역으로 급수하면 하층 수압이 0.7MPa를 넘어 감압 밸브가 층마다 필요합니다`]);
      if (o.id === 'zone' && d.tall) r.push([{ quality: 6 }, '구역마다 수압을 맞춰 수격·소음을 줄입니다']);
      if (o.id === 'quiet' && d.res) r.push([{ quality: 8, env: 4 }, '공동주택 배수 소음 민원(층간 소음)을 줄입니다']);
      if (o.id === 'pod' && (d.res || u === 'hotel')) r.push([{ time: 6 }, '반복 욕실이 많아 공장 생산 효과가 큽니다']);
      if (o.id === 'upw') r.push([{ quality: 14, safety: 4 }, '공정 용수 순도가 수율을 좌우합니다']);
      if (CLEAN.includes(u) && o.id !== 'upw') r.push([{ quality: -35, time: -6 }, '공정 용수(초순수)가 필요한 시설입니다 (생활 급수만으로는 부족)']);
      if (o.id === 'reuse' && (d.area > 50000 || ['museum', 'lab', 'hospital'].includes(u))) r.push([{ env: 4 }, '넓은 부지 빗물 저류로 물순환·홍수를 줄입니다']);
      return r;
    },
  },
  // ---------------- 소방 ----------------
  fire: {
    id: 'fire', name: '소방', en: 'FIRE PROTECTION',
    desc: '소화·경보·제연 설비 방식. 공간 용도(전산실·클린룸·주거·플랜트)와 높이가 선택을 좌우합니다.',
    opts: [
      O('wet', '습식 스프링클러 + 자동화재탐지', { time: 82, cost: 86, quality: 74, safety: 78, env: 76 }, { fx: { fireCyc: 1, fireK: 1 }, how: ['층별 가지 배관 + 헤드', '알람 밸브 · 소화 펌프', '감지기·수신기 연동'] }),
      O('preaction', '준비작동식 (오작동·동결 방지)', { time: 72, cost: 74, quality: 84, safety: 82, env: 76 }, { fx: { fireCyc: 1.06, fireK: 1.12 }, how: ['평소 배관은 비워 둠 (압축 공기)', '감지기 교차 동작 시 급수', '전산·전기실·동결 우려 구역'] }),
      O('gas', '가스계 소화 (청정 소화약제)', { time: 70, cost: 62, quality: 88, safety: 80, env: 62 }, { fx: { fireCyc: 1.08, fireK: 1.25 }, how: ['전산실·전기실·클린룸 구획', '청정 소화약제 용기 · 분사 헤드', '실 기밀 시험 (Door Fan Test)'] }),
      O('mist', '미분무수 소화', { time: 70, cost: 66, quality: 86, safety: 84, env: 84 }, { fx: { fireCyc: 1.05, fireK: 1.18 }, how: ['고압 미세 물입자로 냉각·질식', '배관 지름이 작아 천장 공간 절약', '수손 피해 최소 (전시·문화재)'] }),
      O('smart', '스마트 소방 (IoT 감지 + 제연 통합)', { time: 76, cost: 70, quality: 86, safety: 92, env: 78 }, { fx: { fireCyc: 1.04, fireK: 1.15 }, tag: 'AI', how: ['주소형 감지기 + 영상 화재 감지', '가압 제연·배연 자동 연동', '피난 유도 동적 표시', '시나리오 통합 시험'] }),
      O('deluge', '일제살수 · 포 소화 (플랜트·탱크)', { time: 72, cost: 66, quality: 86, safety: 86, env: 66 }, { fx: { fireCyc: 1.08, fireK: 1.3 }, uses: PLANT, how: ['탱크·공정 구역 일제살수 헤드', '포 소화 약제 설비', '가스 누설·화염 감지 연동'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      const nn = only(o, null, u, '플랜트 전용 소화 방식'); if (nn) return nn;
      if (PLANT.includes(u) && o.id !== 'deluge') r.push([{ safety: ['smart', 'preaction'].includes(o.id) ? -10 : -18 }, '가연성 공정 화재에는 일제살수·포 소화가 필요합니다']);
      if (o.id === 'deluge') r.push([{ safety: 10, quality: 8 }, '탱크·반응기 화재를 넓게 덮어 확산을 막습니다']);
      if (['dc', 'fab'].includes(u) && o.id === 'smart') r.push([{ quality: -20 }, '스마트 소방도 물 스프링클러라 전산·클린룸 장비 피해가 큽니다']);
      if (o.id === 'gas') { if (['dc', 'fab', 'bio', 'museum'].includes(u)) r.push([{ quality: 14, safety: 8 }, '물 피해를 막아야 하는 전산·클린룸·수장고가 있습니다']); if (d.res) r.push([{ cost: -18 }, '주거에는 과합니다']); }
      if (o.id === 'mist' && ['museum', 'hospital', 'hotel'].includes(u)) r.push([{ quality: 6 }, '수손 피해를 줄여야 하는 공간이 많습니다']);
      if (o.id === 'wet' && u === 'museum') r.push([{ quality: -12 }, '수장고·전시실이 물에 젖으면 소장품 피해가 큽니다']);
      if (o.id === 'smart' && (d.tall || ['hospital', 'arena', 'retail'].includes(u))) r.push([{ safety: 8 }, '초고층·다중 이용 시설 피난 안전을 높입니다']);
      if (o.id === 'wet') { if (['dc', 'fab'].includes(u)) r.push([{ quality: -20, safety: -8 }, '전산·클린룸에 물이 뿌려지면 장비 피해가 큽니다']); if (d.res) r.push([{ cost: 6 }, '공동주택 표준입니다']); }
      if (o.id === 'preaction' && (u === 'logistics' || COLD.includes(c.reg))) r.push([{ quality: 6 }, '동결 우려 구역(주차장·물류 창고)에 맞습니다']);
      return r;
    },
  },
  // ---------------- 전기 ----------------
  elec: {
    id: 'elec', name: '전기·수변전', en: 'POWER',
    desc: '수전·변전과 간선 방식. 정전 대비(이중화)와 신재생·ESS 연계, 간선 공기가 달라집니다.',
    opts: [
      O('std', '표준 수변전 (단일 수전) + 케이블 간선', { time: 80, cost: 86, quality: 70, safety: 74, env: 66 }, { fx: { elecCyc: 1, elecK: 1 }, how: ['22.9kV 수전 → 몰드 변압기', '케이블 트레이 간선 입상', '층 분전반 → 조명·전열'] }),
      O('bus', '버스덕트 간선 (고층·대용량)', { time: 84, cost: 76, quality: 82, safety: 80, env: 70 }, { fx: { elecCyc: 0.92, elecK: 1.06 }, how: ['공장 제작 버스덕트를 샤프트에 수직 설치', '층별 플러그인 분기', '케이블 포설 공정 대폭 단축'] }),
      O('dual', '이중 수전 + UPS·비상발전 이중화', { time: 66, cost: 54, quality: 92, safety: 84, env: 62 }, { fx: { elecCyc: 1.12, elecK: 1.45 }, how: ['서로 다른 변전소 2회선 수전', 'UPS + 비상 발전기 N+1', '무정전 절체 시험'] }),
      O('renew', '태양광 + ESS 연계 (제로에너지)', { time: 70, cost: 64, quality: 80, safety: 72, env: 92 }, { fx: { elecCyc: 1.06, elecK: 1.15 }, how: ['지붕·입면 태양광 + 인버터', 'ESS (화재 안전 구획)', 'BEMS 수요 관리 · 제로에너지 인증'] }),
      O('smart', '스마트 배전 (IoT 차단기·DC 조명)', { time: 76, cost: 70, quality: 84, safety: 82, env: 80 }, { fx: { elecCyc: 0.98, elecK: 1.1 }, how: ['IoT 차단기·전력량계로 회로별 감시', 'LED 조명 DC 배전', '고장 예측 알림'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      const u = d.u.id, critical = ['dc', 'fab', 'hospital', 'bio'].includes(u);
      if (o.id === 'dual') { if (critical) r.push([{ quality: 10, safety: 6 }, '정전이 곧 막대한 손실·생명 위험인 시설입니다 (무정전 필수)']); else r.push([{ cost: -16 }, '일반 시설에는 과합니다']); }
      if (o.id === 'std' && d.res) r.push([{ cost: 6 }, '공동주택 표준 (세대 분전반·케이블 간선)']);
      if (o.id === 'std' && critical) r.push([{ quality: -25, safety: -10 }, '단일 수전은 정전 시 공정·의료 중단 위험이 큽니다']);
      if (o.id === 'bus') { if (d.tall || d.ind) r.push([{ time: 6 }, '대용량 간선을 빠르게 올립니다']); else r.push([{ cost: -10 }, '용량이 작아 케이블 간선이 경제적입니다']); }
      if (o.id === 'renew') { if (sel.roof === 'pv' || sel.glaz === 'bipv') r.push([{ quality: 6, time: 4 }, '태양광 지붕·BIPV와 계통 연계를 함께 설계합니다']); r.push([{ safety: -6 }, 'ESS 배터리실 화재 안전 구획·감시가 필요합니다']); }
      if (o.id === 'smart' && ['office', 'lab', 'retail'].includes(u)) r.push([{ env: 4 }, '회로별 사용량으로 운영 에너지를 줄입니다']);
      return r;
    },
  },
  // ---------------- 통신·스마트 빌딩 ----------------
  ict: {
    id: 'ict', name: '통신·자동제어', en: 'ICT & BAS',
    desc: '통신·보안·빌딩 자동제어. 운영 단계 에너지와 관리 인력이 달라집니다.',
    opts: [
      O('basic', '기본 약전 (통신·CCTV·방송)', { time: 84, cost: 88, quality: 66, safety: 72, env: 64 }, { fx: { ictK: 1 }, how: ['구내 통신 배관·배선 (UTP·광)', 'CCTV·출입 통제', '방송·주차 관제'] }),
      O('ibs', '통합 빌딩 자동제어 (IBS·BAS)', { time: 74, cost: 76, quality: 82, safety: 80, env: 80 }, { fx: { ictK: 1.15 }, how: ['공조·조명·전력·방재 통합 제어 서버', '광 백본 통합 배선', '중앙 관제실'] }),
      O('iot', 'IoT 센서망 + BEMS (에너지 관리)', { time: 72, cost: 72, quality: 84, safety: 80, env: 90 }, { fx: { ictK: 1.2 }, how: ['재실·온습도·CO₂ 무선 센서', 'BEMS로 에너지 사용 분석·제어', '제로에너지·녹색건축 인증'] }),
      O('twin', '운영 디지털 트윈 (BIM-FM 연동)', { time: 68, cost: 64, quality: 90, safety: 84, env: 86 }, { fx: { ictK: 1.28 }, tag: 'AI', how: ['준공 BIM에 장비 속성·유지관리 정보 연결', 'IoT 데이터 실시간 반영', '고장 예측 정비 (AI)'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      if (o.id === 'basic') { if (d.res) r.push([{ cost: 6 }, '공동주택 표준 (홈네트워크 포함)']); if (['office', 'dc', 'hospital', 'lab'].includes(u)) r.push([{ quality: -10 }, '운영비 절감·관리 자동화 기회를 놓칩니다']); }
      if (o.id === 'twin') { if (d.area < 20000 && !d.tall) r.push([{ cost: -12 }, '소규모 건물에는 구축비가 큽니다']); if (['dc', 'fab', 'hospital'].includes(u)) r.push([{ quality: 8 }, '24시간 운영 설비의 고장을 미리 잡습니다']); }
      if (o.id === 'iot' && ['office', 'lab', 'museum', 'retail'].includes(u)) r.push([{ env: 4 }, '넓은 공용 공간의 에너지를 재실 기반으로 줄입니다']);
      if (o.id === 'ibs' && (d.tall || ['hospital', 'arena'].includes(u))) r.push([{ quality: 6 }, '대형 시설 설비를 한 곳에서 통합 관제합니다']);
      return r;
    },
  },
  // ---------------- 승강기 ----------------
  elev: {
    id: 'elev', name: '승강기', en: 'ELEVATORS',
    desc: '승강기 형식과 군관리. 고층 수송 능력, 기계실 공간, 준공 일정이 달라집니다.',
    opts: [
      O('rope', '로프식 (기계실형)', { time: 72, cost: 84, quality: 76, safety: 80, env: 70 }, { fx: { elevDays: 1, liftK: 1 }, how: ['옥탑 기계실 + 권상기', '레일·도어 설치 → 로프 걸기', '안전 검사 (사용 전 검사)'] }),
      O('mrl', '기계실 없는 승강기 (MRL)', { time: 82, cost: 82, quality: 78, safety: 80, env: 78 }, { fx: { elevDays: 0.9, liftK: 0.98 }, how: ['승강로 안 소형 권상기', '옥탑 기계실 생략 (높이·공사비 절감)', '저·중층 (약 150m 이하)'] }),
      O('dd', '초고속·더블데크 (초고층)', { time: 66, cost: 52, quality: 90, safety: 82, env: 72 }, { fx: { elevDays: 1.25, liftK: 1.6 }, how: ['분속 600m 이상 / 2개 층 동시 운행', '스카이 로비 환승 체계', '진동·기압 제어'] }),
      O('dest', '행선층 예약 군관리 (AI 배차)', { time: 76, cost: 74, quality: 86, safety: 80, env: 80 }, { fx: { elevDays: 1.05, liftK: 1.12 }, tag: 'AI', how: ['로비 키패드로 행선층 입력', 'AI가 같은 방향 승객을 묶어 배차', '대기 시간 약 30% 감소'] }),
      O('freight', '대형 화물용 + 카리프트 (물류·산업)', { time: 78, cost: 78, quality: 78, safety: 78, env: 74 }, { fx: { elevDays: 1, liftK: 1.2 }, how: ['5~10t 화물 승강기', '차량용 램프·카리프트', '도크 레벨러 연동'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      if (d.plant) return o.id === 'freight' ? [[{ quality: 6 }, '플랜트는 점검·화물용 승강기만 둡니다']] : { no: '플랜트 구조물에는 승객용 승강기가 없음' };
      if (o.id === 'mrl') { if (d.maxH > 150) return { no: '150m 넘는 승강 행정은 MRL 범위를 넘음' }; if (d.res) r.push([{ cost: 6, time: 4 }, '공동주택 표준 추세 (옥탑 축소)']); }
      if (o.id === 'dd') { if (d.maxH < 150) return { no: '초고층(150m 이상) 전용' }; r.push([{ quality: 10, time: 6 }, '초고층 수송 능력을 확보합니다']); }
      if (o.id === 'dest') { if (u === 'office' && d.tall) r.push([{ quality: 8 }, '출근 피크 대기 시간을 크게 줄입니다']); if (d.res) r.push([{ cost: -10 }, '주거에는 효과가 작습니다']); }
      if (o.id === 'freight') { if (d.res) return { no: '주거에는 화물용이 주 승강기가 아님' }; if (['logistics', 'fab', 'battery', 'bio', 'dc', 'retail', 'hospital'].includes(u)) r.push([{ quality: 8 }, '대형 자재·장비·병상 수송이 필요한 시설입니다']); }
      if (o.id === 'rope' && d.maxH > 150) r.push([{ quality: -6 }, '초고층 수송 능력이 부족합니다']);
      return r;
    },
  },
  // ---------------- 칸막이 ----------------
  part: {
    id: 'part', name: '칸막이·내벽', en: 'PARTITIONS',
    desc: '내부 벽체 방식. 마감 사이클, 습식 양생 대기, 차음·내화가 달라집니다.',
    opts: [
      O('block', '조적 (시멘트 벽돌·블록) + 미장', { time: 52, cost: 86, quality: 66, safety: 66, env: 58 }, { fx: { partCyc: 1.15, partK: 1 }, how: ['쌓기 → 양생', '미장 → 건조 (2~3주)', '습식 공정으로 후속 공정 대기'] }),
      O('dry', '경량철골 건식벽 (석고보드)', { time: 84, cost: 80, quality: 78, safety: 78, env: 76 }, { fx: { partCyc: 0.88, partK: 1 }, how: ['스터드·러너 설치', '흡음재 충전 + 석고보드 2겹', '줄눈 처리 → 바로 도장'] }),
      O('alc', 'ALC 블록·패널', { time: 74, cost: 78, quality: 76, safety: 76, env: 78 }, { fx: { partCyc: 0.95, partK: 1.02 }, how: ['경량 기포 콘크리트 접착 쌓기', '단열·내화 성능', '얇은 미장'] }),
      O('module', '프리팹 벽 패널·욕실 모듈', { time: 90, cost: 68, quality: 84, safety: 84, env: 80 }, { fx: { partCyc: 0.78, partK: 1.08 }, how: ['공장 생산 벽 패널·화장실 모듈', '층마다 반입 → 고정·연결', '현장 공정 30~50% 단축'] }),
      O('cleanp', '클린룸 패널 (정전기 방지)', { time: 74, cost: 58, quality: 92, safety: 80, env: 72 }, { fx: { partCyc: 1, partK: 1.4 }, uses: CLEAN, how: ['정전기 방지 샌드위치 패널 벽', '실링·기밀 시공', '청정도 등급별 구획'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      const nn = only(o, null, u, '청정 공정 시설 전용'); if (nn) return nn;
      if (d.plant && !['dry', 'alc'].includes(o.id)) return { no: '플랜트 부속 건물은 건식·ALC 벽' };
      if (CLEAN.includes(u) && o.id !== 'cleanp') r.push([{ quality: -22 }, '청정 구역 벽은 클린룸 패널이 필요합니다 (사무 구역용)']);
      if (o.id === 'cleanp') r.push([{ quality: 12 }, '청정도 등급별로 기밀하게 구획합니다']);
      if (o.id === 'block') { if (d.tall) r.push([{ time: -10 }, '고층에서 습식 조적은 양중·양생 대기로 느립니다']); if (d.res) r.push([{ cost: 4 }, '공동주택 비내력 벽의 표준입니다']); }
      if (o.id === 'dry' && (d.tall || ['office', 'hotel', 'hospital'].includes(u))) r.push([{ time: 6 }, '양생 없이 바로 다음 공정으로 넘어갑니다']);
      if (o.id === 'module' && !(d.res || ['hotel', 'hospital', 'office'].includes(u))) r.push([{ cost: -8 }, '반복 실이 적어 공장 생산 이득이 작습니다']);
      if (o.id === 'alc' && d.res) r.push([{ quality: 4 }, '세대 내 벽 단열·차음이 좋아집니다']);
      return r;
    },
  },
  // ---------------- 바닥 ----------------
  floor: {
    id: 'floor', name: '바닥', en: 'FLOORING',
    desc: '바닥 구성. 층간 소음, 습식 양생 기간, 바닥 밑 배선 자유도가 달라집니다.',
    opts: [
      O('wet', '습식 온돌 (기포 콘크리트 + 방통)', { time: 54, cost: 86, quality: 70, safety: 72, env: 62 }, { fx: { floorCyc: 1.15, floorK: 1 }, uses: LIVE, how: ['완충재 → 기포 콘크리트', '난방 코일 → 방통 모르타르', '양생·건조 3주 → 마루·타일'] }),
      O('dryondol', '건식 온돌 패널 + 고성능 완충재', { time: 82, cost: 74, quality: 82, safety: 78, env: 78 }, { fx: { floorCyc: 0.9, floorK: 1.08 }, uses: LIVE, how: ['고밀도 완충재 (바닥 충격음 1등급 목표)', '건식 난방 패널 깔기', '바로 마감재 시공 (양생 없음)'] }),
      O('oa', '액세스 플로어 (OA·이중 바닥)', { time: 84, cost: 72, quality: 84, safety: 80, env: 76 }, { fx: { floorCyc: 0.9, floorK: 1.15 }, uses: ['office', 'dc', 'lab', 'hospital', 'mixed', 'retail'], how: ['받침대 + 패널 (높이 100~600mm)', '바닥 밑 배선·공조', '레이아웃 변경 자유'] }),
      O('epoxy', '에폭시·대전 방지 바닥 (산업)', { time: 80, cost: 82, quality: 78, safety: 78, env: 66 }, { fx: { floorCyc: 0.95, floorK: 1 }, uses: [...IND, 'lab', 'arena'], how: ['연마 → 프라이머 → 에폭시 도포', '정전기 방지·내화학', '평탄도 관리 (물류 FF·FL)'] }),
      O('polish', '콘크리트 연마 (노출 바닥)', { time: 82, cost: 84, quality: 70, safety: 78, env: 80 }, { fx: { floorCyc: 0.85, floorK: 0.9 }, uses: [...IND, 'retail', 'museum', 'arena', 'office', 'lab'], how: ['타설 시 표면 강화제', '다단계 연마·광택', '별도 마감재 없음'] }),
      O('tile', '비닐 시트·카펫 타일 (건식 접착)', { time: 84, cost: 80, quality: 76, safety: 78, env: 70 }, { fx: { floorCyc: 0.85, floorK: 0.95 }, uses: ['hotel', 'hospital', 'office', 'mixed', 'lab', 'museum'], how: ['바닥 레벨링 (셀프 레벨링 모르타르)', '병실·복도: 이음 용접 비닐 시트 (위생)', '객실·사무: 카펫 타일 접착', '걸레받이·이음 마감'] }),
      O('stone', '석재·타일 습식 (로비·상업)', { time: 60, cost: 66, quality: 84, safety: 74, env: 64 }, { fx: { floorCyc: 1.1, floorK: 1.25 }, uses: ['retail', 'hotel', 'museum', 'office', 'mixed', 'arena', 'hospital'], how: ['붙임 모르타르 + 석재·타일', '줄눈·양생', '고급 공용부 마감'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      const nn = only(o, null, u, '이 용도에는 쓰지 않는 바닥'); if (nn) return nn;
      if (d.plant && !['epoxy', 'polish'].includes(o.id)) return { no: '플랜트는 산업 바닥만' };
      if (o.id === 'wet' && d.res) r.push([{ cost: 6 }, '공동주택 표준 (시공 실적이 가장 많음)']);
      if (o.id === 'dryondol' && d.res) r.push([{ quality: 8, time: 4 }, '바닥 충격음 사후 확인제(2022~) 기준을 맞추기 쉽습니다']);
      if (o.id === 'oa' && ['dc', 'office'].includes(u)) r.push([{ quality: 6 }, '배선·공조 변경이 잦은 공간에 필수입니다']);
      if (o.id === 'epoxy' && d.ind) r.push([{ quality: 6 }, '정전기·화학·지게차 하중을 견딥니다']);
      if (o.id === 'polish' && ['logistics', 'retail', 'museum'].includes(u)) r.push([{ time: 4 }, '넓은 바닥을 마감재 없이 끝냅니다']);
      if (o.id === 'polish' && d.res) r.push([{ quality: -18 }, '주거 바닥 난방·차음에 맞지 않습니다']);
      if (o.id === 'stone' && ['hotel', 'retail', 'museum'].includes(u)) r.push([{ quality: 6 }, '공용부 품격과 내구성이 필요합니다']);
      if (o.id === 'tile' && u === 'hospital') r.push([{ quality: 8 }, '이음을 용접한 비닐 시트로 병실·복도 위생을 지킵니다']);
      if (o.id === 'tile' && u === 'hotel') r.push([{ quality: 6 }, '객실 흡음·보행감이 좋습니다']);
      if (o.id === 'polish' && CLEAN.includes(u)) r.push([{ quality: -20 }, '연마 바닥은 분진·정전기 관리가 안 됩니다']);
      if (o.id === 'epoxy' && CLEAN.includes(u)) r.push([{ quality: 8 }, '대전 방지 에폭시로 정전기·분진을 막습니다']);
      return r;
    },
  },
  // ---------------- 천장 ----------------
  ceil: {
    id: 'ceil', name: '천장', en: 'CEILINGS',
    desc: '천장 형식. 천장 속 설비 공간, 점검성, 마감 속도, 층고가 달라집니다.',
    opts: [
      O('mbar', 'M-bar 석고 천장', { time: 72, cost: 86, quality: 74, safety: 74, env: 70 }, { fx: { ceilCyc: 1, ceilK: 1 }, how: ['행어볼트·캐링 채널', 'M-bar + 석고보드', '퍼티·도장'] }),
      O('tbar', 'T-bar 흡음 텍스 (점검형)', { time: 82, cost: 84, quality: 76, safety: 78, env: 72 }, { fx: { ceilCyc: 0.92, ceilK: 0.95 }, how: ['T-bar 그리드', '흡음 텍스 얹기', '천장 속 설비 점검 쉬움'] }),
      O('exposed', '노출 천장 (설비 정렬 + 도장)', { time: 88, cost: 90, quality: 68, safety: 76, env: 74 }, { fx: { ceilCyc: 0.8, ceilK: 0.8 }, how: ['배관·덕트를 보이게 정렬 시공', '흑색 도장 / 흡음 뿜칠', '층고 확보'] }),
      O('module', '프리팹 천장 모듈 (조명·설비 일체)', { time: 86, cost: 72, quality: 84, safety: 84, env: 78 }, { fx: { ceilCyc: 0.82, ceilK: 1.1 }, how: ['조명·스프링클러·취출구 일체 패널', '리프트로 들어 올려 고정', '고소 작업 감소'] }),
      O('cleang', '클린룸 그리드 천장 (FFU)', { time: 70, cost: 56, quality: 92, safety: 80, env: 72 }, { fx: { ceilCyc: 1.1, ceilK: 1.5 }, uses: CLEAN, how: ['T-그리드 (젤 실 기밀)', 'FFU·조명 얹기', '청정도 시험'] }),
    ],
    rule(c, d, o, sel) {
      const r = [];
      const u = d.u.id;
      const nn = only(o, null, u, '청정 공정 시설 전용'); if (nn) return nn;
      if (d.plant && !['exposed', 'tbar'].includes(o.id)) return { no: '플랜트는 노출·점검형 천장만' };
      if (o.id === 'exposed') { if (d.res || u === 'hotel' || u === 'hospital') return { no: '주거·객실·병실에는 노출 천장을 쓰지 않음' }; if (sel.mep === 'prefab') r.push([{ quality: 6 }, '공장 랙이라 보이는 설비가 깔끔하게 정렬됩니다']); if (['office', 'retail', 'museum', 'logistics', 'lab'].includes(u)) r.push([{ env: 4 }, '층고를 확보하고 마감재를 줄입니다']); }
      if (o.id === 'mbar' && d.res) r.push([{ cost: 6 }, '공동주택 표준입니다']);
      if (o.id === 'module' && (d.tall || ['office', 'hospital'].includes(u))) r.push([{ time: 6 }, '반복 층·병실 천장을 공장 모듈로 빠르게 닫습니다']);
      if (CLEAN.includes(u) && o.id === 'exposed') return { no: '청정 구역에는 노출 천장을 쓸 수 없음' };
      if (CLEAN.includes(u) && o.id !== 'cleang') r.push([{ quality: -35, time: -6 }, '청정 구역 천장은 FFU 그리드가 필요합니다 (사무 구역용)']);
      if (o.id === 'cleang') r.push([{ quality: 14 }, 'FFU와 필터를 기밀하게 얹어 청정도를 맞춥니다']);
      return r;
    },
  },
  // ---------------- 도장·마감 ----------------
  paint: {
    id: 'paint', name: '도장·마감', en: 'FINISHES',
    desc: '도장·벽 마감 작업 방식. 마감 속도, 실내 공기질(VOC), 재작업이 달라집니다.',
    opts: [
      O('roller', '수성 롤러 도장 (표준)', { time: 64, cost: 88, quality: 70, safety: 76, env: 70 }, { fx: { paintCyc: 1.05, paintK: 1 }, how: ['퍼티 → 샌딩 → 하도 → 상도 2회', '층별 순차'] }),
      O('airless', '에어리스 스프레이', { time: 82, cost: 84, quality: 74, safety: 70, env: 62 }, { fx: { paintCyc: 0.9, paintK: 0.98 }, how: ['고압 스프레이로 넓은 면 빠르게', '보양(마스킹) 철저', '분진·비산 관리'] }),
      O('robot', '도장·퍼티 로봇', { time: 80, cost: 68, quality: 80, safety: 82, env: 76 }, { fx: { paintCyc: 0.86, paintK: 1.04 }, tag: 'AI', how: ['BIM 경로로 자율 주행 도장', '야간 무인 작업', '도막 두께 자동 기록'] }),
      O('eco', '친환경 마감 (무VOC + 베이크아웃)', { time: 66, cost: 76, quality: 84, safety: 80, env: 92 }, { fx: { paintCyc: 1.08, paintK: 1.08 }, how: ['무VOC 수성 도료·접착제', '입주 전 베이크아웃 (실내 공기질)', '실내 공기질 측정·인증'] }),
      O('paper', '벽지 마감 (주거·숙박)', { time: 76, cost: 82, quality: 76, safety: 78, env: 70 }, { fx: { paintCyc: 0.95, paintK: 1 }, uses: LIVE, how: ['초배 → 정배 (실크·합지)', '몰딩·걸레받이', '세대 마감 점검표'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      const nn = only(o, null, u, '주거·숙박 전용'); if (nn) return nn;
      if (o.id === 'robot') { if (d.tall || (d.res && d.area > 80000)) r.push([{ time: 6 }, '반복 층·세대가 많아 로봇 효과가 큽니다']); else r.push([{ cost: -12 }, '반복 면적이 적어 장비비가 회수되지 않습니다']); }
      if (o.id === 'eco' && (LIVE.includes(u) || u === 'lab')) r.push([{ quality: 6, env: 4 }, '새집증후군·병원 실내 공기질 관리에 필요합니다']);
      if (o.id === 'paper' && d.res) r.push([{ cost: 6 }, '공동주택 표준입니다']);
      if (o.id === 'airless' && d.ind) r.push([{ time: 6 }, '넓은 산업 시설 벽·천장을 빠르게 칠합니다']);
      return r;
    },
  },
  // ---------------- 조경·외부 ----------------
  land: {
    id: 'land', name: '조경·외부', en: 'LANDSCAPE & SITE',
    desc: '외부 포장·식재·빗물 관리. 준공 직전 공기, 홍수 저감·열섬이 달라집니다.',
    opts: [
      O('std', '일반 포장 + 식재', { time: 78, cost: 86, quality: 68, safety: 76, env: 60 }, { fx: { landK: 1, landC: 1 }, how: ['보도블록·아스팔트 포장', '교목·관목 식재', '우수관 연결'] }),
      O('lid', '저영향 개발 (투수 포장·빗물 정원)', { time: 68, cost: 72, quality: 80, safety: 76, env: 90 }, { fx: { landK: 1.12, landC: 1.2 }, how: ['투수성 포장', '빗물 정원·식생 수로', '저류 침투 시설 (홍수 저감)'] }),
      O('deck', '인공 지반 녹화 (지하 주차장 상부)', { time: 64, cost: 66, quality: 82, safety: 76, env: 86 }, { fx: { landK: 1.15, landC: 1.3 }, uses: ['housing', 'mixed', 'office', 'hotel', 'retail', 'hospital', 'museum'], how: ['방근·방수 보호층', '배수판 + 경량 토양', '대형 수목 하중 보강'] }),
      O('pre', '프리캐스트 외부 시설 + 선행 조경', { time: 84, cost: 70, quality: 74, safety: 78, env: 70 }, { fx: { landK: 0.85, landC: 1.08 }, how: ['옹벽·측구·계단 PC 부재', '골조 끝난 구역부터 선행 조경', '준공 직전 공정 집중 완화'] }),
      O('ind', '산업 단지 외부 (중량 포장·방류 관리)', { time: 82, cost: 84, quality: 76, safety: 78, env: 64 }, { fx: { landK: 1, landC: 1.1 }, uses: IND, how: ['중차량 콘크리트 포장', '방류 수질 관리 시설', '완충 녹지'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const nn = only(o, null, d.u.id, '이 용도에는 쓰지 않는 외부 공사'); if (nn) return nn;
      if (o.id === 'deck') { if (d.depth <= 0.5) return { no: '지하 주차장 상부(인공 지반)가 없음' }; r.push([{ env: 4 }, '지하 주차장 위에 녹지를 만들어 녹지율을 채웁니다']); if (d.res) r.push([{ quality: 8, cost: 8, time: 4 }, '차 없는 단지 지상 공원은 공동주택 표준입니다']); }
      if (o.id === 'lid' && d.area > 50000) r.push([{ env: 6 }, '넓은 부지의 빗물 유출을 줄입니다 (물순환 인증)']);
      if (o.id === 'ind' && d.ind) r.push([{ quality: 6, cost: 4 }, '중차량·방류 기준을 맞춥니다']);
      if (o.id === 'std' && d.ind) r.push([{ quality: -8 }, '중차량 하중·방류 기준에 부족합니다']);
      if (o.id === 'pre' && d.area > 80000) r.push([{ time: 6 }, '블록이 많아 선행 조경으로 준공 직전 병목을 줄입니다']);
      return r;
    },
  },
  // ---------------- 시운전·준공 ----------------
  comm: {
    id: 'comm', name: '시운전·준공', en: 'COMMISSIONING',
    desc: '설비 시운전과 준공 검사 방식. 준공 지연 위험과 운영 초기 하자가 달라집니다.',
    opts: [
      O('std', '공종별 단독 시운전 + 준공 검사', { time: 66, cost: 88, quality: 62, safety: 72, env: 66 }, { fx: { commK: 1 }, how: ['설비별 단독 운전', '소방·승강기·전기 사용 전 검사', '사용승인 신청'] }),
      O('tab', 'TAB + 통합 시운전 (Commissioning)', { time: 74, cost: 78, quality: 84, safety: 80, env: 80 }, { fx: { commK: 1.05 }, how: ['풍량·수량 측정·조정 (TAB)', '공조·전기·방재 연동 시나리오 시험', '운영자 교육·인수인계'] }),
      O('digital', '디지털 커미셔닝 (BIM + BEMS 데이터)', { time: 78, cost: 66, quality: 86, safety: 80, env: 82 }, { fx: { commK: 0.88 }, tag: 'BIM', how: ['BIM 장비 정보로 시험 점검표 자동 생성', '센서 데이터로 성능 자동 검증', '하자 목록 실시간 추적'] }),
      O('phased', '구역별 단계 준공 (부분 사용승인)', { time: 88, cost: 76, quality: 74, safety: 74, env: 72 }, { fx: { commK: 0.8 }, how: ['끝난 구역부터 순차 시운전·임시 사용승인', '잔여 공사와 입주 동선 분리', '조기 운영 수익'] }),
      O('perf', '성능 검증 시운전 (공정 설비·클린룸)', { time: 60, cost: 60, quality: 92, safety: 80, env: 72 }, { fx: { commK: 1.15 }, uses: IND, how: ['청정도·진동·전력 품질 인증 시험', '장비 반입 → 훅업 → 단위·통합 성능 시험', '수율·가동률 램프업'] }),
    ],
    rule(c, d, o) {
      const r = [];
      const u = d.u.id;
      const nn = only(o, null, u, '공정 설비가 있는 시설 전용'); if (nn) return nn;
      if (d.ind && o.id === 'std') r.push([{ quality: -18 }, '공정 설비를 성능 검증 없이 가동하면 수율·안전 문제가 큽니다']);
      const proc = [...CLEAN, ...PLANT, 'dc'].includes(u);
      if (o.id === 'perf') r.push(proc ? [{ quality: 16, safety: 6 }, '청정도·전력·공정 성능을 가동 전에 보증합니다'] : [{ quality: 4 }, '가동 전에 설비 성능을 보증합니다']);
      if (proc && o.id !== 'perf') r.push([{ quality: -25, time: -8 }, '공정 설비 성능 시험을 따로 해야 해 가동이 늦어집니다']);
      if (o.id === 'phased') { if (d.area > 100000) r.push([{ time: 6 }, '블록이 많아 단계 준공으로 운영을 앞당깁니다']); if (u === 'hospital') r.push([{ safety: -10 }, '병원 부분 개원은 감염·소음 관리가 어렵습니다']); }
      if (o.id === 'digital' && (d.tall || d.area > 80000 || d.ind)) r.push([{ quality: 6 }, '장비 수가 많아 데이터 기반 검증 효과가 큽니다']);
      if (o.id === 'tab' && ['hospital', 'lab', 'museum'].includes(u)) r.push([{ quality: 6 }, '실별 공조 성능 기준이 엄격한 시설입니다']);
      return r;
    },
  },
};

// 공종 순서와 묶음 (확정 순서 = 이 순서)
export const ORDER = ['survey', 'improve', 'prep', 'wall', 'support', 'water', 'excav', 'found', 'bwp', 'base',
  'frame', 'form', 'rebar', 'conc', 'pour', 'steel', 'lift', 'hoist',
  'skin', 'glaz', 'insul', 'roof',
  'mep', 'hvac', 'plumb', 'fire', 'elec', 'ict', 'elev',
  'part', 'floor', 'ceil', 'paint', 'land', 'comm',
  'plan', 'qa'];
export const GROUPS = [
  { k: 'geo', name: '가설·지반·지하', en: 'SITE · SUBSTRUCTURE', ids: ORDER.slice(0, 10) },
  { k: 'struct', name: '골조', en: 'STRUCTURE', ids: ORDER.slice(10, 18) },
  { k: 'skin', name: '외피', en: 'ENVELOPE', ids: ORDER.slice(18, 22) },
  { k: 'mep', name: '설비', en: 'MEP', ids: ORDER.slice(22, 29) },
  { k: 'fin', name: '마감·준공', en: 'FINISHES · HANDOVER', ids: ORDER.slice(29, 35) },
  { k: 'mgmt', name: '관리 기술', en: 'MANAGEMENT', ids: ORDER.slice(35) },
];
// 전통 공법 (기준선): 용도에 따라 첫 번째로 쓸 수 있는 것을 고른다
export const TRAD = {
  // 용도 전용 공법(uses 제한)을 앞에 두어, 특수 시설은 그 시설의 관행 공법이 기준선이 된다
  prep: ['std', 'mini'], bwp: ['sheet', 'cryst'], rebar: ['site', 'shop'], pour: ['boom', 'bucket'], steel: ['bolt', 'none'], hoist: ['rack', 'lift'],
  glaz: ['dbl'], insul: ['inner', 'sandwich'], roof: ['asphalt', 'metal'],
  hvac: ['clean', 'crac', 'process', 'district', 'central'], plumb: ['upw', 'booster'], fire: ['deluge', 'wet'], elec: ['std'], ict: ['basic'], elev: ['rope', 'freight'],
  part: ['cleanp', 'block', 'dry'], floor: ['wet', 'epoxy', 'stone', 'polish'], ceil: ['cleang', 'mbar', 'tbar'], paint: ['roller'], land: ['ind', 'std'], comm: ['perf', 'std'],
};
