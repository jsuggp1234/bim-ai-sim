// 용도 카탈로그: 무엇을 지을지 정하면 입지 기준(가중치)·규모·생성기·공사비·공기 기준이 함께 정해진다.
// 단가·공기는 2026년 국내 공사 사례를 바탕으로 한 시뮬레이션용 근사치(만원/㎡, 개월)다. 공정 장비·의료 장비 같은 설비 구입비는 넣지 않았다.

// 입지 평가 항목 (후보지 속성 → 0~100)
export const CRITERIA = {
  transit: { name: '대중교통', en: 'TRANSIT', note: '철도역·광역버스 접근' },
  road: { name: '광역 도로', en: 'ROAD', note: '고속도로 IC·간선도로 접근, 화물 동선' },
  port: { name: '항만', en: 'PORT', note: '수출입 항만과 원료 하역' },
  air: { name: '공항', en: 'AIR', note: '국제공항 접근 (인력·고부가 화물)' },
  power: { name: '전력', en: 'POWER', note: '변전소·송전선로 여유, 대용량 인입 가능성' },
  water: { name: '용수', en: 'WATER', note: '공업용수·냉각수 공급 여력' },
  labor: { name: '인재·인력', en: 'TALENT', note: '전문 인력 풀과 통근권' },
  demand: { name: '배후 수요', en: 'DEMAND', note: '배후 인구와 이용 수요' },
  tour: { name: '방문 수요', en: 'VISITOR', note: '관광·방문객 흐름' },
  landc: { name: '토지비', en: 'LAND COST', note: '토지 단가가 낮을수록 높은 점수' },
  ground: { name: '지반', en: 'GROUND', note: '지지층 깊이·연약층·지하수 (용도별 민감도 반영)' },
  safety: { name: '재해 안전', en: 'HAZARD', note: '침수·지진·해일 위험이 낮을수록 높은 점수' },
  buffer: { name: '주거 이격', en: 'BUFFER', note: '주거지와 떨어져 있을수록 높은 점수 (위험물·소음 시설)' },
  scale: { name: '부지 규모', en: 'SCALE', note: '용도에 필요한 면적을 담을 수 있는지' },
  policy: { name: '정책·인허가', en: 'POLICY', note: '지구 지정·특화단지·인허가 진척' },
};
export const CRIT_KEYS = Object.keys(CRITERIA);

export const USE_CATS = [
  { k: 'live', name: '주거·복합', en: 'LIVING' },
  { k: 'city', name: '업무·상업·숙박', en: 'URBAN' },
  { k: 'civic', name: '문화·의료', en: 'CIVIC' },
  { k: 'tech', name: '첨단 산업', en: 'ADVANCED MFG' },
  { k: 'infra', name: '데이터·물류', en: 'INFRA' },
  { k: 'plant', name: '플랜트', en: 'PLANT' },
];

// gen: 매스 생성기 / sim: 한 번에 시뮬레이션할 최대 면적(㎡, 큰 지구는 1단계 구역으로) / area: [최소, 적정] 부지 면적
// cost: 건축 공사비 기준 단가(만원/㎡ 연면적) / months: 대표 공기 / far: 기본 용적률(%) / net: 가용 부지 비율(%)
export const USES = [
  {
    id: 'housing', code: 'U-01', cat: 'live', name: '공동주택', en: 'RESIDENTIAL', gen: 'housing',
    desc: '아파트·오피스텔 단지. 주동 형식과 인동간격, 일조·조망이 배치를 결정합니다.',
    sim: 1600000, area: [30000, 150000], far: 250, net: 45, cost: 265, months: [34, 48],
    struct: 'RC 벽식 · 알루미늄폼', kpi: '세대',
    needs: ['일조·조망 확보 (건축법 시행령 86조)', '세대당 주차 1.0~1.2대', '학교·공원 등 기반시설 부담'],
    w: { transit: 20, demand: 18, labor: 5, landc: 14, ground: 5, safety: 6, scale: 14, policy: 18 },
  },
  {
    id: 'mixed', code: 'U-02', cat: 'live', name: '복합개발 (MXD)', en: 'MIXED-USE', gen: 'housing', resShare: 55,
    desc: '업무·상업·주거를 한 지구에 섞는 역세권 복합개발. 랜드마크 타워와 주거 블록을 함께 둡니다.',
    sim: 900000, area: [40000, 200000], far: 600, net: 50, cost: 330, months: [42, 60],
    struct: 'RC 코어 + 철골·SRC', kpi: '세대 + 업무 연면적',
    needs: ['환승 거점 연결', '저층부 가로 활성화', '초고층 피난안전층'],
    w: { transit: 26, demand: 18, labor: 12, landc: 8, scale: 10, policy: 16, ground: 5, safety: 5 },
  },
  {
    id: 'office', code: 'U-03', cat: 'city', name: '업무시설 (오피스)', en: 'OFFICE', gen: 'tower', kind: 'office',
    desc: '프라임 오피스 타워. 기준층 2,000㎡ 안팎, 코어 중심 평면과 커튼월 외피.',
    sim: 300000, area: [8000, 30000], far: 800, net: 55, cost: 395, months: [36, 54],
    struct: 'RC 코어 + 철골 (데크플레이트)', kpi: '업무 연면적',
    needs: ['역세권 도보 5분', '기준층 층고 4.2m 이상', '대형 임차인 수요'],
    w: { transit: 30, labor: 24, demand: 10, air: 5, landc: 8, scale: 6, policy: 12, ground: 5 },
  },
  {
    id: 'retail', code: 'U-04', cat: 'city', name: '상업시설 (복합몰)', en: 'RETAIL MALL', gen: 'mall',
    desc: '대형 복합쇼핑몰. 넓은 저층 판매동과 아트리움, 대규모 주차.',
    sim: 300000, area: [30000, 90000], far: 300, net: 70, cost: 335, months: [30, 40],
    struct: '철골 · 장스팬 트러스 + 데크', kpi: '판매 연면적',
    needs: ['광역 상권 100만 명 이상', '도로 진출입·교통영향평가', '주차 2~3천 대'],
    w: { demand: 30, transit: 18, road: 16, tour: 10, landc: 10, scale: 10, policy: 6 },
  },
  {
    id: 'hotel', code: 'U-05', cat: 'city', name: '호텔·리조트', en: 'HOSPITALITY', gen: 'tower', kind: 'hotel',
    desc: '5성급 호텔과 MICE·리조트. 포디움 위 객실 타워, 연회장 장스팬.',
    sim: 300000, area: [10000, 60000], far: 500, net: 50, cost: 480, months: [36, 48],
    struct: 'RC 벽식(객실) + 철골 포디움', kpi: '객실',
    needs: ['관광 수요·공항 접근', '연회장 무주 공간', '객실 차음·전망'],
    w: { tour: 30, air: 14, transit: 14, demand: 10, landc: 10, scale: 6, policy: 6, safety: 10 },
  },
  {
    id: 'museum', code: 'U-06', cat: 'civic', name: '박물관·미술관', en: 'MUSEUM', gen: 'museum',
    desc: '전시동·수장고·교육동이 마당을 둘러싸는 저층 문화시설. 항온항습과 장스팬이 핵심.',
    sim: 200000, area: [15000, 60000], far: 80, net: 60, cost: 560, months: [30, 42],
    struct: 'RC + 철골 장스팬 · 노출 콘크리트', kpi: '전시 면적',
    needs: ['항온항습 수장고', '대형 작품 반입 동선', '방문객 접근성'],
    w: { tour: 24, transit: 20, demand: 20, policy: 16, scale: 10, safety: 10 },
  },
  {
    id: 'arena', code: 'U-07', cat: 'civic', name: '공연장·아레나', en: 'ARENA', gen: 'arena',
    desc: '1~2만 석 실내 아레나. 지붕 장스팬 트러스와 관람석 PC 단, 대규모 피난 동선.',
    sim: 250000, area: [40000, 100000], far: 120, net: 60, cost: 620, months: [36, 48],
    struct: '철골 대공간 트러스 + PC 관람석', kpi: '좌석',
    needs: ['대중교통 수송력', '피난·군중 동선', '음향·진동 차단'],
    w: { demand: 24, transit: 26, road: 10, tour: 14, scale: 16, policy: 10 },
  },
  {
    id: 'hospital', code: 'U-08', cat: 'civic', name: '종합병원', en: 'HOSPITAL', gen: 'hospital',
    desc: '진료·수술 포디움 위에 병동 타워. 감염 관리 동선과 설비 비중이 큽니다.',
    sim: 200000, area: [30000, 90000], far: 300, net: 60, cost: 610, months: [42, 56],
    struct: 'RC 라멘 · 면진 검토', kpi: '병상',
    needs: ['응급 진입로', '의료가스·비상전원', '진동에 민감한 영상 장비'],
    w: { demand: 30, transit: 18, road: 14, labor: 10, scale: 10, policy: 12, safety: 6 },
  },
  {
    id: 'lab', code: 'U-09', cat: 'tech', name: 'R&D 캠퍼스', en: 'R&D CAMPUS', gen: 'campus',
    desc: '연구동·실험동·지원동이 모인 캠퍼스. 실험실 배기와 진동 기준을 맞춥니다.',
    sim: 400000, area: [30000, 150000], far: 200, net: 55, cost: 430, months: [30, 42],
    struct: 'RC 라멘 · 실험동 철골', kpi: '연구 연면적',
    needs: ['연구 인력 통근권', '실험 배기·폐수', '공항·KTX 접근'],
    w: { labor: 34, transit: 14, power: 10, policy: 14, landc: 10, scale: 10, air: 8 },
  },
  {
    id: 'fab', code: 'U-10', cat: 'tech', name: '반도체 팹', en: 'SEMICONDUCTOR FAB', gen: 'fab',
    desc: '클린룸 팹동·CUB(중앙 유틸리티)·폐수·가스 시설. 전력·용수·진동이 입지를 결정합니다.',
    sim: 1200000, area: [400000, 1500000], far: 120, net: 60, cost: 920, months: [24, 36],
    struct: 'PC + 철골 트러스 · 와플 슬래브', kpi: '클린룸 면적',
    needs: ['전력 수 GW (변전소 신설)', '초순수 용수 하루 수십만 톤', '진동 VC-D 이하 지반', '클린룸 ISO 5'],
    w: { power: 22, water: 20, ground: 15, labor: 14, road: 8, safety: 6, scale: 10, policy: 5 },
  },
  {
    id: 'battery', code: 'U-11', cat: 'tech', name: '이차전지 공장', en: 'BATTERY GIGAFACTORY', gen: 'factory', kind: 'battery',
    desc: '전극·조립·화성 공정이 이어지는 긴 생산동. 드라이룸 제습과 화재 안전이 핵심.',
    sim: 900000, area: [200000, 600000], far: 90, net: 60, cost: 310, months: [20, 30],
    struct: 'PC 기둥·보 + 철골 지붕', kpi: '생산능력 GWh',
    needs: ['드라이룸 이슬점 −40℃', '전력·용수', '원료 수입 항만'],
    w: { power: 18, water: 10, port: 10, road: 12, labor: 10, landc: 15, policy: 15, scale: 10 },
  },
  {
    id: 'bio', code: 'U-12', cat: 'tech', name: '바이오의약 공장', en: 'BIOPHARMA GMP', gen: 'factory', kind: 'bio',
    desc: '세포배양 GMP 생산동과 QC 연구동. 청정도와 밸리데이션 일정이 공기를 좌우합니다.',
    sim: 500000, area: [80000, 300000], far: 120, net: 55, cost: 760, months: [30, 40],
    struct: 'RC 라멘 · 철골 플랜트 구조', kpi: '배양 용량 kL',
    needs: ['GMP 청정 구역', '정제수·폐수', '공항 접근 (원료·제품)'],
    w: { labor: 24, water: 14, power: 10, air: 12, policy: 15, safety: 10, scale: 10, transit: 5 },
  },
  {
    id: 'dc', code: 'U-13', cat: 'infra', name: '데이터센터', en: 'DATA CENTER', gen: 'dc',
    desc: 'AI 데이터홀·변전 설비·냉각. 수전 용량(MW)과 냉각 방식이 사업을 결정합니다.',
    sim: 300000, area: [20000, 120000], far: 160, net: 60, cost: 880, months: [24, 36],
    struct: '철골 + PC · 고하중 바닥', kpi: 'IT 용량 MW',
    needs: ['수전 100MW 이상', '냉각수·외기', '이중화 광케이블'],
    w: { power: 34, water: 10, labor: 5, safety: 15, landc: 14, ground: 5, policy: 12, scale: 5 },
  },
  {
    id: 'logistics', code: 'U-14', cat: 'infra', name: '물류센터', en: 'LOGISTICS', gen: 'logistics',
    desc: '램프로 각 층에 트럭이 오르는 다층 물류센터. 저온·상온 혼합.',
    sim: 400000, area: [30000, 150000], far: 200, net: 65, cost: 205, months: [18, 26],
    struct: 'PC 기둥·보 · 장스팬', kpi: '보관 연면적',
    needs: ['고속도로 IC 5km 안', '24시간 운영 민원', '층고 10m 내외'],
    w: { road: 30, port: 14, air: 8, demand: 16, landc: 16, scale: 16 },
  },
  {
    id: 'chem', code: 'U-15', cat: 'plant', name: '석유화학 플랜트', en: 'PETROCHEMICAL', gen: 'plant', kind: 'chem',
    desc: '분해로·증류탑·저장탱크·파이프랙으로 이뤄진 공정 플랜트. 모듈화와 중량물 설치가 핵심.',
    sim: 900000, area: [300000, 1200000], far: 40, net: 70, cost: 1150, months: [36, 48],
    struct: '철골 구조물 · 모듈 · 말뚝 기초', kpi: '연산 능력 (만t)',
    needs: ['원료 부두', '주거지 이격', '대용량 냉각수', '방폭·소방'],
    w: { port: 25, buffer: 20, water: 14, power: 10, policy: 16, scale: 10, ground: 5 },
  },
  {
    id: 'power', code: 'U-16', cat: 'plant', name: '발전 (LNG·수소)', en: 'POWER PLANT', gen: 'plant', kind: 'power',
    desc: '가스터빈·배열회수보일러(HRSG)·연돌·변전소. 석탄 발전소 대체와 수소 혼소를 상정합니다.',
    sim: 500000, area: [150000, 500000], far: 40, net: 65, cost: 1050, months: [30, 40],
    struct: '철골 터빈동 · RC 기초 · 연돌', kpi: '발전 용량 MW',
    needs: ['송전 계통 연결', '냉각수', '연료 공급 배관·부두', '주거지 이격'],
    w: { power: 20, water: 18, port: 14, buffer: 20, policy: 16, scale: 12 },
  },
  {
    id: 'water', code: 'U-17', cat: 'plant', name: '수처리 시설', en: 'WATER TREATMENT', gen: 'plant', kind: 'water',
    desc: '하수 처리장 지하화·정수장. 수조 구조물과 상부 공원화.',
    sim: 400000, area: [80000, 300000], far: 30, net: 70, cost: 520, months: [36, 54],
    struct: 'RC 수조 · 지하 구조 · 상부 공원', kpi: '처리 용량 (만t/일)',
    needs: ['배수 구역 중심', '악취 차단', '지하수·부력'],
    w: { demand: 28, buffer: 14, ground: 10, policy: 20, scale: 12, safety: 16 },
  },
];
export const USE_BY_ID = Object.fromEntries(USES.map(u => [u.id, u]));
export const useOf = (id) => USE_BY_ID[id] || USE_BY_ID.housing;
export const isHousingGen = (u) => useOf(typeof u === 'string' ? u : u && u.id).gen === 'housing';

// 층 용도별 기준: 이름, 3D 외피 무늬, 색 토큰, 공사 단가(만원/㎡ 바닥 — st 골조, mp 설비, fn 마감, eq 공정·특수 설비), 외장 단가(만원/㎡ 외벽), 골조 사이클(작업일/층)
// 공동주택 계열(res·officetel·office·retail·lobby·refuge·mech·b1·parking)은 기존 5단계 변수를 그대로 쓴다.
export const FLOOR_USES = {
  hotel: { name: '호텔 객실', tok: '--u-hotel', pat: 'punched', st: 56, mp: 110, fn: 120, sk: 95, cyc: 7 },
  banquet: { name: '연회·MICE', tok: '--u-banquet', pat: 'curtain', st: 85, mp: 120, fn: 110, sk: 140, cyc: 14 },
  ward: { name: '병동', tok: '--u-ward', pat: 'punched', st: 58, mp: 150, fn: 95, sk: 85, cyc: 8 },
  clinic: { name: '진료·수술', tok: '--u-clinic', pat: 'curtain', st: 72, mp: 260, fn: 120, sk: 110, cyc: 12, eq: 60 },
  gallery: { name: '전시', tok: '--u-gallery', pat: 'store', st: 95, mp: 150, fn: 160, sk: 180, cyc: 16 },
  store: { name: '수장고', tok: '--u-store', pat: 'none', st: 80, mp: 170, fn: 70, sk: 90, cyc: 14 },
  hall: { name: '공연·관람석', tok: '--u-hall', pat: 'louvre', st: 160, mp: 140, fn: 120, sk: 160, cyc: 22 },
  lab: { name: '연구·실험', tok: '--u-lab', pat: 'curtain', st: 64, mp: 170, fn: 80, sk: 120, cyc: 9 },
  fab: { name: '클린룸', tok: '--u-fab', pat: 'ind', st: 180, mp: 420, fn: 160, sk: 70, cyc: 18, eq: 220 },
  subfab: { name: '서브팹', tok: '--u-subfab', pat: 'ind', st: 140, mp: 260, fn: 30, sk: 60, cyc: 16 },
  cub: { name: '중앙 유틸리티(CUB)', tok: '--u-cub', pat: 'louvre', st: 95, mp: 380, fn: 20, sk: 60, cyc: 14, eq: 120 },
  prod: { name: '생산', tok: '--u-prod', pat: 'ind', st: 70, mp: 130, fn: 35, sk: 48, cyc: 12, eq: 40 },
  gmp: { name: 'GMP 청정 생산', tok: '--u-gmp', pat: 'ind', st: 85, mp: 330, fn: 150, sk: 70, cyc: 12, eq: 140 },
  whs: { name: '창고·보관', tok: '--u-whs', pat: 'ind', st: 52, mp: 40, fn: 12, sk: 40, cyc: 11 },
  ramp: { name: '램프·차로', tok: '--u-ramp', pat: 'none', st: 70, mp: 10, fn: 8, sk: 20, cyc: 10 },
  dhall: { name: '데이터홀', tok: '--u-dhall', pat: 'ind', st: 95, mp: 520, fn: 40, sk: 70, cyc: 12, eq: 180 },
  elec: { name: '전기·변전', tok: '--u-elec', pat: 'louvre', st: 80, mp: 380, fn: 20, sk: 60, cyc: 12, eq: 160 },
  process: { name: '공정 설비', tok: '--u-process', pat: 'none', st: 140, mp: 220, fn: 0, sk: 45, cyc: 10, eq: 900 },
  tank: { name: '저장 탱크', tok: '--u-tank', pat: 'none', st: 90, mp: 40, fn: 0, sk: 30, cyc: 9, eq: 260 },
  rack: { name: '파이프랙', tok: '--u-rack', pat: 'none', st: 120, mp: 380, fn: 0, sk: 0, cyc: 8, eq: 120 },
  stack: { name: '연돌·플레어', tok: '--u-stack', pat: 'none', st: 160, mp: 30, fn: 0, sk: 40, cyc: 6, eq: 80 },
  turbine: { name: '터빈·발전동', tok: '--u-turbine', pat: 'louvre', st: 160, mp: 300, fn: 20, sk: 70, cyc: 16, eq: 1600 },
  hrsg: { name: '배열회수보일러', tok: '--u-hrsg', pat: 'none', st: 180, mp: 120, fn: 0, sk: 40, cyc: 10, eq: 1200 },
  basin: { name: '처리 수조', tok: '--u-basin', pat: 'none', st: 150, mp: 160, fn: 15, sk: 20, cyc: 20, eq: 110 },
  admin: { name: '관리·사무', tok: '--office', pat: 'curtain', st: 60, mp: 95, fn: 60, sk: 110, cyc: 8 },
};
export const isPlantUse = (u) => ['process', 'tank', 'rack', 'stack', 'hrsg'].includes(u);
