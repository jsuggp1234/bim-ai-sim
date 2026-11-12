// 전국 후보지 데이터셋: 공공주택지구·신도시·도심 복합·산업단지·석유화학 단지·항만 배후·연구·관광·의료·에너지 부지.
// 좌표·면적·계획 물량은 공개 보도 기준 근사치, 입지 속성(0~100)은 지역 기본값에 부지별 보정을 더한 시뮬레이션 추정값이다.
import { SITES as SEOUL } from '../stage1/engine.js';

// 지역 기본값  t 대중교통 r 도로 p 항만 a 공항 e 전력 w 용수 l 인력 d 수요 v 방문 $ 토지(만원/㎡) g 지반 gw 지하수위(m) f 침수·재해 b 주거 이격 pol 정책
export const REGIONS = {
  SEL: { name: '서울', t: 90, r: 70, p: 20, a: 60, e: 68, w: 70, l: 96, d: 98, v: 82, $: 2500, g: 'S', gw: 6, f: 30, b: 12, pol: 60 },
  ICN: { name: '인천', t: 62, r: 78, p: 88, a: 96, e: 76, w: 70, l: 74, d: 80, v: 60, $: 380, g: 'F', gw: 3, f: 38, b: 40, pol: 65 },
  GGS: { name: '경기 남부', t: 62, r: 82, p: 40, a: 52, e: 70, w: 70, l: 86, d: 84, v: 45, $: 420, g: 'W', gw: 8, f: 18, b: 40, pol: 65 },
  GGN: { name: '경기 북부', t: 52, r: 66, p: 25, a: 48, e: 60, w: 66, l: 64, d: 72, v: 42, $: 260, g: 'W', gw: 8, f: 22, b: 45, pol: 60 },
  GWD: { name: '강원', t: 35, r: 55, p: 40, a: 30, e: 72, w: 82, l: 35, d: 32, v: 72, $: 60, g: 'R', gw: 10, f: 20, b: 75, pol: 58 },
  CBK: { name: '충북', t: 58, r: 76, p: 20, a: 55, e: 72, w: 72, l: 56, d: 46, v: 30, $: 80, g: 'W', gw: 8, f: 15, b: 60, pol: 65 },
  CNM: { name: '충남', t: 45, r: 72, p: 70, a: 30, e: 82, w: 70, l: 52, d: 45, v: 35, $: 60, g: 'W', gw: 6, f: 25, b: 65, pol: 65 },
  SJG: { name: '세종', t: 55, r: 72, p: 15, a: 35, e: 70, w: 75, l: 62, d: 50, v: 42, $: 180, g: 'W', gw: 7, f: 20, b: 45, pol: 75 },
  DJN: { name: '대전', t: 70, r: 70, p: 10, a: 35, e: 70, w: 72, l: 80, d: 68, v: 40, $: 250, g: 'W', gw: 7, f: 18, b: 35, pol: 65 },
  JBK: { name: '전북', t: 40, r: 62, p: 60, a: 30, e: 70, w: 76, l: 40, d: 38, v: 40, $: 40, g: 'S', gw: 4, f: 30, b: 65, pol: 65 },
  JNM: { name: '전남', t: 35, r: 58, p: 80, a: 35, e: 82, w: 76, l: 38, d: 32, v: 55, $: 35, g: 'S', gw: 4, f: 30, b: 70, pol: 65 },
  GWJ: { name: '광주', t: 56, r: 62, p: 20, a: 42, e: 65, w: 65, l: 60, d: 66, v: 42, $: 200, g: 'W', gw: 7, f: 20, b: 35, pol: 60 },
  GBK: { name: '경북', t: 40, r: 65, p: 62, a: 35, e: 76, w: 70, l: 45, d: 38, v: 55, $: 50, g: 'W', gw: 7, f: 22, b: 65, pol: 60 },
  DGU: { name: '대구', t: 62, r: 70, p: 15, a: 50, e: 70, w: 65, l: 62, d: 72, v: 45, $: 280, g: 'W', gw: 7, f: 20, b: 35, pol: 60 },
  USN: { name: '울산', t: 45, r: 72, p: 92, a: 40, e: 88, w: 80, l: 58, d: 55, v: 35, $: 150, g: 'W', gw: 5, f: 25, b: 55, pol: 65 },
  BSN: { name: '부산', t: 66, r: 70, p: 96, a: 62, e: 76, w: 70, l: 68, d: 78, v: 82, $: 450, g: 'S', gw: 4, f: 35, b: 35, pol: 60 },
  GNM: { name: '경남', t: 45, r: 70, p: 75, a: 40, e: 76, w: 72, l: 55, d: 50, v: 45, $: 90, g: 'W', gw: 6, f: 25, b: 60, pol: 60 },
  JJU: { name: '제주', t: 30, r: 40, p: 50, a: 85, e: 55, w: 50, l: 38, d: 45, v: 98, $: 150, g: 'R', gw: 15, f: 25, b: 55, pol: 55 },
};
// 부지 성격별 보정 (값을 더하거나 덮어씀)
export const KINDS = {
  housing: { name: '공공주택지구·신도시', add: { pol: 10, d: 4 } },
  renewal: { name: '노후 신도시 정비', add: { pol: 4, t: 6 } },
  urban: { name: '도심 복합·역세권', add: { t: 10, l: 4, d: 4, b: -10 } },
  research: { name: '연구개발 특구·혁신도시', add: { l: 10, pol: 6 } },
  industrial: { name: '국가·일반 산업단지', add: { e: 10, w: 8, b: 18, pol: 10, t: -8 }, land: 0.35 },
  chem: { name: '석유화학·중화학 단지', add: { e: 14, w: 14, p: 6, b: 30, pol: 10, t: -12 }, land: 0.3 },
  port: { name: '항만 배후단지', add: { p: 8, r: 6, b: 20 }, land: 0.4 },
  airport: { name: '공항 경제권', add: { a: 6, r: 4 } },
  tourism: { name: '관광·복합리조트', add: { v: 15, b: 10 } },
  culture: { name: '문화·공원 부지', add: { v: 10, pol: 8 } },
  medical: { name: '의료 클러스터', add: { pol: 8 } },
  energy: { name: '에너지·발전 단지', add: { e: 16, b: 25, pol: 6 }, land: 0.35 },
  logistics: { name: '물류 거점', add: { r: 12, b: 15 }, land: 0.5 },
};
// 성격 × 용도 적합(0~1). 1 = 계획상 그 용도로 쓰는 부지
export const COMPAT = {
  housing: { housing: 1, mixed: 0.7, retail: 0.55, hospital: 0.55, museum: 0.45, arena: 0.3, office: 0.4, hotel: 0.25, lab: 0.4, logistics: 0.2, water: 0.3, dc: 0.2 },
  renewal: { housing: 1, mixed: 0.85, retail: 0.6, office: 0.5, hospital: 0.55, museum: 0.4, hotel: 0.3, lab: 0.35 },
  urban: { office: 0.95, mixed: 0.95, hotel: 0.85, retail: 0.9, museum: 0.7, arena: 0.6, hospital: 0.7, housing: 0.8, lab: 0.6, dc: 0.35, water: 0.25 },
  research: { lab: 0.95, bio: 0.85, dc: 0.75, office: 0.65, hospital: 0.55, museum: 0.4, housing: 0.5, fab: 0.5, battery: 0.4, mixed: 0.45 },
  industrial: { fab: 0.9, battery: 0.9, bio: 0.75, lab: 0.7, dc: 0.75, logistics: 0.8, chem: 0.5, power: 0.55, water: 0.45, office: 0.3 },
  chem: { chem: 1, power: 1, battery: 0.8, water: 0.7, logistics: 0.6, dc: 0.45, fab: 0.35 },
  port: { logistics: 1, power: 0.8, chem: 0.65, battery: 0.65, dc: 0.55, water: 0.5, hotel: 0.3 },
  airport: { logistics: 1, hotel: 0.85, retail: 0.6, bio: 0.65, dc: 0.6, arena: 0.6, office: 0.5 },
  tourism: { hotel: 1, arena: 0.85, museum: 0.85, retail: 0.8, mixed: 0.5, housing: 0.35, dc: 0.3 },
  culture: { museum: 0.95, arena: 0.8, retail: 0.45, hotel: 0.4, mixed: 0.35 },
  medical: { hospital: 1, lab: 0.8, bio: 0.75, housing: 0.4, mixed: 0.4 },
  energy: { power: 1, dc: 0.9, water: 0.5, battery: 0.6, chem: 0.5, fab: 0.35 },
  logistics: { logistics: 1, dc: 0.6, battery: 0.5, retail: 0.4 },
  utility: { water: 1, power: 0.45, dc: 0.45 },
};
// 계획상 그 용도로 지정·발표된 부지 (적합 1 + 정책 가점)
export const FOCUS = {
  fab: ['gg-yongin-nat', 'gg-skh-yongin', 'gg-pyeongtaek', 'gg-hwaseong-fab', 'gg-giheung', 'gg-icheon', 'cb-techno', 'cn-tangjeong', 'gn-paju-lgd', 'gb-gumi', 'dj-gyochon'],
  battery: ['cb-ochang', 'jb-smg', 'gb-pohang', 'us-hitech'],
  bio: ['ic-songdo-bio', 'cb-osong3', 'gb-andong'],
  dc: ['us-mipo', 'gw-chuncheon-dc', 'jn-solasido', 'gj-ai', 'sj-smart'],
  lab: ['gg-pangyo2', 'gg-pangyo3', 'dj-daedeok', 'sel-magok', 'bs-centum2', 'dg-alpha', 'jn-naju', 'gg-giheung'],
  chem: ['us-onsan', 'jn-yeosu', 'cn-daesan', 'jn-gwangyang'],
  power: ['ic-yeongheung', 'gn-hadong', 'gn-tongyeong', 'cn-boryeong', 'gw-samcheok', 'jb-smg-h2', 'gg-pt-lng'],
  water: ['sel-tancheon', 'sel-jungnang'],
  hospital: ['ic-cheongna-med', 'ic-songdo-ibd', 'gg-brain'],
  museum: ['sel-park', 'sj-museum', 'ic-museum', 'dg-museum', 'bs-north'],
  arena: ['sel-arena', 'sel-jamsil', 'gn-kintex', 'ic-inspire'],
  hotel: ['bs-haeundae', 'jj-jungmun', 'jj-shinhwa', 'jn-gyeongdo', 'gw-gangneung', 'gw-alpensia', 'ic-inspire', 'gb-gyeongju'],
  retail: ['gj-mall', 'sel-jamsil', 'gn-kintex'],
  office: ['sel-seongsu', 'sel-seoulst', 'sel-dmc', 'yongsan', 'sel-sewoon', 'dj-station', 'dg-seodaegu', 'smc'],
  mixed: ['yongsan', 'sel-suseo', 'sel-seoulst', 'smc', 'campkim', 'dg-seodaegu'],
  logistics: ['ic-airport-log', 'gg-anseong-log', 'gg-icheon-log', 'gn-gimpo-log', 'jn-gy-port', 'bs-newport', 'ic-newport', 'gg-pt-port'],
};
const focusOf = new Map();
Object.entries(FOCUS).forEach(([u, ids]) => ids.forEach(id => { if (!focusOf.has(id)) focusOf.set(id, []); focusOf.get(id).push(u); }));
export const GROUND = {
  R: { name: '경암 (얕은 기반암)', bearing: 95, soft: 0, rock: 1, short: '경암' },
  W: { name: '풍화토·풍화암', bearing: 80, soft: 0.1, rock: 0.45, short: '풍화암' },
  S: { name: '충적층 (모래·자갈)', bearing: 62, soft: 0.3, rock: 0.1, short: '충적층' },
  C: { name: '연약 점토 (해성)', bearing: 30, soft: 0.85, rock: 0, short: '연약 점토' },
  F: { name: '매립지 (준설토 + 연약층)', bearing: 35, soft: 0.8, rock: 0, short: '매립지' },
};

const SRC = {
  h129: { t: '뉴시스 · 1·29 수도권 공급 대책 (도심 유휴부지)', url: 'https://www.newsis.com/view/NISX20260129_0003494980', d: '2026.01' },
  h2108: { t: '머니투데이방송 · 3차 신규 공공택지 (의왕군포안산·화성진안 등)', url: 'https://news.mtn.co.kr/news-detail/2021083009133350428', d: '2021.08' },
  h2311: { t: '국토교통부 보도 · 신규 택지 5곳 (구리토평2·오산세교3·용인이동 등)', url: 'https://kbthink.com/main/real-estate/government-policy/molit-press/molit-press-231115.html', d: '2023.11' },
  h3g: { t: '데일리안 · 3기 신도시 공급 일정', url: 'https://www.dailian.co.kr/news/view/1603980/', d: '2024' },
  h3g2: { t: '더팩트 · 3기 신도시·공공택지 현황', url: 'https://news.tf.co.kr/read/ogmeta/2113457.htm', d: '2024' },
  yongin: { t: 'CEO스코어데일리 · 용인 국가산단 지정 (728만㎡)', url: 'https://ceoscoredaily.com/page/view/2024122614093582664', d: '2024.12' },
  yongin2: { t: 'CEO스코어데일리 · 삼성 용인 1기 팹 2029년 조기 가동', url: 'https://www.ceoscoredaily.com/page/view/2026071316364968459', d: '2026.07' },
  yongin3: { t: '머니투데이방송 · 용인 반도체 국가산단 1공구 조성공사', url: 'https://news.mtn.co.kr/news-detail/2026092316331768920/share-modal', d: '2026.09' },
  skh: { t: 'SBS Biz · SK하이닉스 용인 1기 팹 착공, 2027년 5월 준공 예정', url: 'https://biz.sbs.co.kr/amp/article/20000219638', d: '2025.02' },
  ulsdc: { t: '아시아경제 · SK·AWS 울산 100MW AI 데이터센터', url: 'https://www.asiae.co.kr/en/article/2025061515511823958', d: '2025.06' },
  shaheen: { t: '데일리안 · 에쓰오일 샤힌 프로젝트 가동 초읽기', url: 'https://www.dailian.co.kr/news/view/1661581/', d: '2026' },
  shaheen2: { t: '세계일보 · 샤힌 공정률 85%, 2026년 하반기 가동', url: 'https://www.segye.com/newsView/20251023516150', d: '2025.10' },
  smg: { t: '서울신문 · 새만금 이차전지 허브 (427만 평)', url: 'https://m.go.seoul.co.kr/news/2023/06/14/20230614014001', d: '2023.06' },
};

// [id, 이름, 지역, 시군구, 위도, 경도, 면적㎡, 성격(|로 여럿), 현황, 속성 보정, 추가 정보]
const ROWS = [
  // ---------- 서울 (1단계 후보지 8곳은 engine.js 자료를 그대로 쓴다) ----------
  ['sel-dmc', '상암 DMC 랜드마크 부지', 'SEL', '마포구 상암동', 37.5785, 126.8865, 37262, 'urban', '랜드마크 용지 재공모 추진', { g: 'F', gw: 3, t: 78 }, { far: 1000, maxFloors: 100 }],
  ['sel-magok', '마곡 MICE 복합단지', 'SEL', '강서구 마곡동', 37.5655, 126.8275, 82724, 'urban|research', '마곡지구 CP4 복합개발', { g: 'S', gw: 3, a: 85 }, { far: 400 }],
  ['sel-seoulst', '서울역 북부 역세권', 'SEL', '중구 봉래동', 37.5585, 126.9705, 29093, 'urban', '컨벤션·업무·호텔 복합개발', { t: 99, g: 'W', gw: 10 }, { far: 1000, maxFloors: 40 }],
  ['sel-suseo', '수서역세권 공공주택·업무', 'SEL', '강남구 수서동', 37.4875, 127.1035, 386000, 'urban|housing', 'SRT·GTX-A 환승 거점 개발', { t: 95, $: 1800 }, { units: 2500 }],
  ['sel-sewoon', '세운 재정비촉진지구', 'SEL', '종로구·중구', 37.5675, 126.9945, 43900, 'urban|renewal', '종묘~남산 녹지축 고밀 복합', { t: 96, g: 'W', gw: 9, v: 92 }, { far: 1500, maxFloors: 40 }],
  ['sel-seongsu', '성수 삼표레미콘 부지', 'SEL', '성동구 성수동1가', 37.5435, 127.0415, 28804, 'urban', '레미콘 공장 철거 후 업무 랜드마크', { g: 'S', gw: 4, f: 40 }, { far: 1000, maxFloors: 70 }],
  ['sel-jamsil', '잠실 스포츠·MICE', 'SEL', '송파구 잠실동', 37.5155, 127.0735, 350000, 'urban|culture', '종합운동장 일대 돔구장·MICE 복합', { g: 'S', gw: 4, f: 40, v: 95 }, {}],
  ['sel-arena', '창동 서울아레나', 'SEL', '도봉구 창동', 37.6545, 127.0485, 50308, 'culture|urban', '1만8천 석 K-팝 공연장', { $: 900 }, {}],
  ['sel-park', '용산공원 문화시설 부지', 'SEL', '용산구 용산동', 37.5305, 126.9805, 120000, 'culture', '반환 미군기지 국가공원 문화시설', { v: 95, pol: 80, g: 'W', gw: 9 }, {}],
  ['sel-ddm', '동대문 옛 국방연구원', 'SEL', '동대문구 청량리동', 37.5935, 127.0465, 60000, 'housing', '1·29 대책 1,500호', { $: 1200 }, { units: 1500, src: 'h129' }],
  ['sel-ep', '은평 옛 행정연구원', 'SEL', '은평구 불광동', 37.6185, 126.9315, 55000, 'housing', '1·29 대책 1,300호', { $: 900 }, { units: 1300, src: 'h129' }],
  ['sel-gangseo', '강서 군부지', 'SEL', '강서구 공항동', 37.5605, 126.8095, 40000, 'housing', '1·29 대책 918호', { $: 900, a: 92 }, { units: 918, src: 'h129' }],
  ['sel-doksan', '금천 독산 공군부대', 'SEL', '금천구 독산동', 37.4655, 126.9045, 120000, 'housing', '1·29 대책 2,900호, 2030 착공', { $: 900 }, { units: 2900, src: 'h129' }],
  ['sel-dobong', '도봉 옛 교육연구시설', 'SEL', '도봉구 창동', 37.6595, 127.0405, 45000, 'housing', '1·29 대책 1,171호', { $: 700 }, { units: 1171, src: 'h129' }],
  ['sel-tancheon', '탄천 물재생센터 지하화', 'SEL', '강남구 대치동', 37.4945, 127.0735, 300000, 'utility|urban', '처리장 지하화 · 상부 공원·복합', { g: 'S', gw: 3, f: 45, b: 20 }, {}],
  ['sel-jungnang', '중랑 물재생센터 현대화', 'SEL', '성동구 용답동', 37.5605, 127.0545, 400000, 'utility', '지하화·현대화 단계 사업', { g: 'S', gw: 3, f: 45, b: 25 }, {}],
  // ---------- 경기 남부 ----------
  ['gg-yongin-nat', '용인 반도체 국가산단', 'GGS', '용인시 처인구 이동·남사읍', 37.1335, 127.2055, 7280000, 'industrial', '2024.12 지정. 삼성 팹 6기, 1기 팹 2029 가동 목표', { e: 70, w: 64, g: 'W', gw: 6, pol: 92 }, { src: ['yongin', 'yongin2', 'yongin3'] }],
  ['gg-skh-yongin', 'SK하이닉스 용인 클러스터', 'GGS', '용인시 처인구 원삼면', 37.1745, 127.3215, 4150000, 'industrial', '2025.2 1기 팹 착공, 2027.5 준공 목표', { e: 74, w: 70, g: 'W', gw: 7, pol: 92 }, { src: 'skh' }],
  ['gg-pyeongtaek', '평택 고덕 반도체 캠퍼스', 'GGS', '평택시 고덕면', 37.0215, 127.0475, 2890000, 'industrial', 'P1~P4 가동·증설, P5 건설', { e: 88, w: 76, p: 70, g: 'W', gw: 5, pol: 85 }, {}],
  ['gg-hwaseong-fab', '화성 반도체 캠퍼스 일대', 'GGS', '화성시 반월동', 37.2125, 127.0645, 1500000, 'industrial|research', '기존 팹·연구단지 고도화', { e: 84, l: 92, g: 'W' }, {}],
  ['gg-giheung', '기흥 차세대 연구단지', 'GGS', '용인시 기흥구 농서동', 37.2335, 127.0735, 109000, 'research|industrial', '반도체 R&D 단지 (NRD-K)', { e: 85, l: 94 }, {}],
  ['gg-icheon', '이천 SK하이닉스 본사', 'GGS', '이천시 부발읍', 37.2575, 127.4875, 700000, 'industrial', 'M16 등 메모리 팹 단지', { e: 82, w: 74 }, {}],
  ['gg-pangyo2', '판교 제2테크노밸리', 'GGS', '성남시 수정구 시흥동', 37.4165, 127.0985, 430000, 'research|urban', 'ICT·바이오 연구 업무 단지', { l: 98, t: 72, $: 1200 }, {}],
  ['gg-pangyo3', '판교 제3테크노밸리 (금토)', 'GGS', '성남시 수정구 금토동', 37.4275, 127.0835, 583000, 'research', '도시첨단산단 조성 중', { l: 96, $: 900 }, {}],
  ['gg-geumto2', '성남 금토2·여수2', 'GGS', '성남시 수정구', 37.4235, 127.1275, 674000, 'housing', '1·29 대책 6,300호 (금토2 3,800 + 여수2 2,500)', { $: 800 }, { units: 6300, src: 'h129' }],
  ['gg-gwacheon-rc', '과천 경마장·방첩사', 'GGS', '과천시 주암동', 37.4435, 127.0185, 1100000, 'housing|culture', '1·29 대책 9,800호, 2030 착공', { $: 900, t: 72 }, { units: 9800, src: 'h129' }],
  ['gg-gwacheon', '과천 과천지구', 'GGS', '과천시 과천동', 37.4455, 127.0045, 1690000, 'housing', '3기 신도시급 공공주택지구 1만 호', { $: 800 }, { units: 10000, src: 'h3g2' }],
  ['gg-gyosan', '하남 교산', 'GGS', '하남시 천현·교산동', 37.5195, 127.2195, 6860000, 'housing', '3기 신도시 3만3천 호', { $: 500 }, { units: 33000, src: 'h3g' }],
  ['gg-gmsh', '광명시흥', 'GGS', '광명시·시흥시', 37.4295, 126.8425, 12710000, 'housing', '3기 신도시 6만7천 호', { $: 400 }, { units: 67000, src: 'h3g' }],
  ['gg-uiwang3', '의왕군포안산', 'GGS', '의왕·군포·안산', 37.3395, 126.9455, 5860000, 'housing', '2021.8 지정 4만1천 호', { $: 380 }, { units: 41000, src: 'h2108' }],
  ['gg-jinan', '화성진안', 'GGS', '화성시 진안동', 37.2195, 127.0335, 4520000, 'housing', '2021.8 지정 2만9천 호, 반도체 배후', { $: 330 }, { units: 29000, src: 'h2108' }],
  ['gg-bongdam3', '화성봉담3', 'GGS', '화성시 봉담읍', 37.2035, 126.9545, 2290000, 'housing', '2021.8 지정 1만7천 호', { $: 280 }, { units: 17000, src: 'h2108' }],
  ['gg-sekyo3', '오산세교3', 'GGS', '오산시 세교동', 37.1745, 127.0595, 4310000, 'housing', '2023.11 지정 3만1천 호', { $: 260 }, { units: 31000, src: 'h2311' }],
  ['gg-yongin-idong', '용인이동 공공주택', 'GGS', '용인시 처인구 이동읍', 37.1625, 127.1915, 2280000, 'housing', '2023.11 지정 1만6천 호, 국가산단 배후', { $: 220 }, { units: 16000, src: 'h2311' }],
  ['gg-jije', '평택 지제역세권', 'GGS', '평택시 지제동', 37.0195, 127.0705, 4530000, 'housing|urban', '역세권 3만3천 호', { t: 72, $: 260 }, { units: 33000, src: 'h3g2' }],
  ['gg-brain', '평택 브레인시티', 'GGS', '평택시 도일동', 37.0355, 127.1065, 4820000, 'research|medical|housing', '대학·병원 유치 도시개발', { $: 200 }, {}],
  ['gg-jangsang', '안산 장상', 'GGS', '안산시 상록구 장상동', 37.3285, 126.8615, 2210000, 'housing', '3기 신도시급 1만4천 호', { $: 330 }, { units: 14100, src: 'h3g2' }],
  ['gg-jang-hyeon', '시흥 장현', 'GGS', '시흥시 장현동', 37.3735, 126.8015, 2940000, 'housing', '공공주택지구 1만8천 호', { $: 300 }, { units: 18700, src: 'h3g2' }],
  ['gg-gocheon', '의왕 고천', 'GGS', '의왕시 고천동', 37.3555, 126.9655, 543000, 'housing', '공공주택지구 4,600호', { $: 400 }, { units: 4600, src: 'h3g2' }],
  ['gg-ojeon', '의왕 오전왕곡', 'GGS', '의왕시 오전·왕곡동', 37.3605, 126.9795, 1870000, 'housing', '공공주택지구 1만4천 호', { $: 380 }, { units: 14000 }],
  ['gg-gwangmyung-ps', '광명경찰서 부지', 'GGS', '광명시 철산동', 37.4785, 126.8665, 15000, 'housing', '1·29 대책 550호', { $: 1100, t: 82 }, { units: 550, src: 'h129' }],
  ['gg-hanam-sj', '하남 신장 유휴부지', 'GGS', '하남시 신장동', 37.5425, 127.2075, 12000, 'housing', '1·29 대책 300호', { $: 900 }, { units: 300, src: 'h129' }],
  ['gg-suwon-post', '수원 우편집중국', 'GGS', '수원시 권선구', 37.2595, 126.9925, 25000, 'housing|urban', '1·29 대책 936호', { $: 900, t: 75 }, { units: 936, src: 'h129' }],
  ['gg-bundang', '분당 선도지구 (재건축)', 'GGS', '성남시 분당구', 37.3825, 127.1195, 600000, 'renewal', '1기 신도시 재정비 선도지구', { $: 1800, t: 80 }, { units: 10900 }],
  ['gg-pyeongchon', '평촌 선도지구', 'GGS', '안양시 동안구', 37.3915, 126.9635, 300000, 'renewal', '1기 신도시 재정비', { $: 1300, t: 78 }, { units: 5460 }],
  ['gg-sanbon', '산본 선도지구', 'GGS', '군포시 산본동', 37.3605, 126.9325, 250000, 'renewal', '1기 신도시 재정비', { $: 1000, t: 74 }, { units: 4620 }],
  ['gg-anseong-log', '안성 중부 물류 거점', 'GGS', '안성시 원곡면', 37.0185, 127.1625, 400000, 'logistics', '경부·평택제천 고속도로 교차', { r: 94 }, {}],
  ['gg-icheon-log', '이천 마장 물류단지', 'GGS', '이천시 마장면', 37.2525, 127.3615, 300000, 'logistics', '중부·제2영동 고속도로 교차', { r: 92 }, {}],
  ['gg-pt-port', '평택항 배후단지', 'GGS', '평택시 포승읍', 36.9695, 126.8435, 1400000, 'port|logistics|industrial', '평택·당진항 2종 배후단지', { p: 90, g: 'F', gw: 2 }, {}],
  ['gg-banwol', '반월·시화 국가산단', 'GGS', '안산시 단원구', 37.3095, 126.7595, 1000000, 'industrial|port', '노후 산단 고도화 · 첨단 전환', { g: 'F', gw: 2, f: 40 }, {}],
  ['gg-pt-lng', '평택 LNG 기지 인근', 'GGS', '평택시 포승읍', 36.9795, 126.8135, 300000, 'energy|port', '가스 공급 거점 · 발전 부지', { g: 'F', gw: 2 }, {}],
  // ---------- 경기 북부 ----------
  ['gn-wangsuk1', '남양주 왕숙1', 'GGN', '남양주시 진접·진건', 37.6365, 127.1785, 10290000, 'housing', '3기 신도시 5만2천여 호', { $: 280 }, { units: 52400, src: 'h3g' }],
  ['gn-wangsuk2', '남양주 왕숙2', 'GGN', '남양주시 일패·이패동', 37.6035, 127.1995, 2390000, 'housing', '3기 신도시 1만4천여 호', { $: 260 }, { units: 14500, src: 'h3g' }],
  ['gn-changneung', '고양 창릉', 'GGN', '고양시 덕양구', 37.6385, 126.8775, 7890000, 'housing', '3기 신도시 3만5천여 호', { $: 330 }, { units: 35500, src: 'h3g' }],
  ['gn-daegok', '고양 대곡역세권', 'GGN', '고양시 덕양구 대장동', 37.6315, 126.8115, 1990000, 'housing|urban', 'GTX-A 환승 역세권 9,400호', { t: 78, $: 300 }, { units: 9400 }],
  ['gn-ndu', '고양 옛 국방대 부지', 'GGN', '고양시 덕양구', 37.6585, 126.8795, 100000, 'housing', '1·29 대책 2,570호', { $: 400 }, { units: 2570, src: 'h129' }],
  ['gn-yongyeon', '의정부 용현', 'GGN', '의정부시 용현동', 37.7305, 127.0835, 810000, 'housing', '공공주택지구 7천 호', { $: 220 }, { units: 7000 }],
  ['gn-jangheung', '양주 장흥', 'GGN', '양주시 장흥면', 37.7205, 126.9705, 650000, 'housing', '2021.8 지정 4천여 호', { $: 150 }, { units: 4000, src: 'h2108' }],
  ['gn-jingeon', '남양주 진건', 'GGN', '남양주시 진건읍', 37.6235, 127.1495, 920000, 'housing', '2021.8 지정 7천 호', { $: 250 }, { units: 7000, src: 'h2108' }],
  ['gn-nyj-army', '남양주 군부대 부지', 'GGN', '남양주시 별내동', 37.6525, 127.1205, 250000, 'housing', '1·29 대책 4,180호', { $: 300 }, { units: 4180, src: 'h129' }],
  ['gn-toepyeong2', '구리 토평2', 'GGN', '구리시 토평동', 37.5845, 127.1525, 2920000, 'housing', '2023.11 지정 1만8천5백 호, 한강변', { $: 380, f: 40, g: 'S', gw: 3 }, { units: 18500, src: 'h2311' }],
  ['gn-gyomun', '구리 교문', 'GGN', '구리시 교문동', 37.5995, 127.1335, 200000, 'housing', '2021.8 지정 2천 호', { $: 400 }, { units: 2000, src: 'h2108' }],
  ['gn-ilsan', '일산 선도지구 (재건축)', 'GGN', '고양시 일산동구', 37.6735, 126.7745, 400000, 'renewal', '1기 신도시 재정비 선도지구', { $: 700, t: 70 }, { units: 8900 }],
  ['gn-kintex', '고양 킨텍스·한류월드', 'GGN', '고양시 일산서구 대화동', 37.6695, 126.7455, 300000, 'culture|tourism|urban', 'MICE·공연 복합 부지', { v: 78, g: 'S', gw: 3 }, {}],
  ['gn-paju-lgd', '파주 디스플레이 산단', 'GGN', '파주시 월롱면', 37.8115, 126.7935, 1700000, 'industrial', '디스플레이 팹 단지', { e: 84, w: 78, l: 60 }, {}],
  ['gn-gimpo-hg2', '김포 한강2 콤팩트시티', 'GGN', '김포시 양촌·마산동', 37.6325, 126.6615, 7310000, 'housing', '공공주택 4만6천 호', { $: 250, g: 'S', gw: 3 }, { units: 46000 }],
  ['gn-gimpo-log', '김포 고촌 물류단지', 'GGN', '김포시 고촌읍', 37.6015, 126.7635, 200000, 'logistics|airport', '수도권 서부 도심 물류', { r: 92, a: 90, g: 'S', gw: 3 }, {}],
  // ---------- 인천 ----------
  ['ic-gyeyang', '인천 계양', 'ICN', '계양구 귤현·동양동', 37.5525, 126.7335, 3330000, 'housing', '3기 신도시 1만7천 호, 첫 입주', { $: 300 }, { units: 17000, src: 'h3g' }],
  ['ic-bucheon-dj', '부천 대장', 'ICN', '부천시 대장동', 37.5395, 126.7815, 3450000, 'housing', '3기 신도시 1만9천 호', { $: 330, g: 'S' }, { units: 19300, src: 'h3g' }],
  ['ic-guwol2', '인천 구월2', 'ICN', '남동구 구월동', 37.4335, 126.7255, 2200000, 'housing', '2021.8 지정 1만8천 호', { $: 280, g: 'W', gw: 6 }, { units: 18000, src: 'h2108' }],
  ['ic-songdo-bio', '송도 바이오 클러스터 (11공구)', 'ICN', '연수구 송도동', 37.3695, 126.6115, 1500000, 'research|industrial', '바이오의약 생산·연구 클러스터', { l: 76, pol: 85 }, {}],
  ['ic-songdo-ibd', '송도 국제업무지구', 'ICN', '연수구 송도동', 37.3915, 126.6385, 600000, 'urban|medical', '업무·국제병원·호텔 복합', { t: 66 }, {}],
  ['ic-cheongna-med', '청라 의료복합타운', 'ICN', '서구 청라동', 37.5345, 126.6455, 260000, 'medical', '종합병원·연구 복합', { pol: 75 }, {}],
  ['ic-museum', '인천 뮤지엄파크', 'ICN', '미추홀구 학익동', 37.4425, 126.6725, 100000, 'culture', '시립미술관·박물관 복합', { g: 'W', gw: 6, v: 68 }, {}],
  ['ic-inspire', '영종 복합리조트 (IR)', 'ICN', '중구 운서동', 37.4655, 126.3895, 1000000, 'tourism|airport', '아레나·호텔·카지노 리조트', { v: 85 }, {}],
  ['ic-airport-log', '인천공항 물류단지', 'ICN', '중구 운서동', 37.4555, 126.4605, 900000, 'airport|logistics', '공항 자유무역지역 물류', { a: 99 }, {}],
  ['ic-newport', '인천 신항 배후단지', 'ICN', '연수구 송도동', 37.3455, 126.6125, 2100000, 'port|logistics', '컨테이너 신항 배후 물류', { p: 95 }, {}],
  ['ic-yeongheung', '영흥 발전 부지', 'ICN', '옹진군 영흥면', 37.2385, 126.4335, 400000, 'energy', '석탄 → LNG 전환 대체 발전', { b: 85, t: 15 }, {}],
  // ---------- 강원 ----------
  ['gw-chuncheon-dc', '춘천 수열에너지 데이터센터 단지', 'GWD', '춘천시 동면', 37.9195, 127.7735, 300000, 'energy|research', '소양강댐 심층수 냉각 데이터센터 클러스터', { w: 95, e: 82, pol: 80 }, {}],
  ['gw-wonju', '원주 부론 국가산단', 'GWD', '원주시 부론면', 37.2125, 127.7565, 1200000, 'industrial|medical', '의료기기·첨단산업 국가산단', { l: 45 }, {}],
  ['gw-samcheok', '삼척 수소·LNG 거점', 'GWD', '삼척시 원덕읍', 37.1985, 129.3215, 500000, 'energy|port', 'LNG 생산기지 · 수소 특화', { p: 80 }, {}],
  ['gw-donghae', '동해 북평 국가산단', 'GWD', '동해시 구호동', 37.4735, 129.1455, 900000, 'industrial|port|energy', '수소·청정에너지 특화', { p: 82 }, {}],
  ['gw-gangneung', '강릉 경포 관광지', 'GWD', '강릉시 강문동', 37.7955, 128.9055, 120000, 'tourism', '해변 리조트·호텔', { v: 92, t: 55 }, {}],
  ['gw-alpensia', '평창 알펜시아', 'GWD', '평창군 대관령면', 37.6575, 128.6735, 4900000, 'tourism', '올림픽 리조트 재정비', { v: 82 }, {}],
  // ---------- 충청·세종·대전 ----------
  ['cb-ochang', '청주 오창 (이차전지 특화단지)', 'CBK', '청주시 청원구 오창읍', 36.7195, 127.4335, 1500000, 'industrial', '이차전지 셀·소재 특화단지', { e: 82, pol: 88 }, {}],
  ['cb-osong3', '오송 제3생명과학 국가산단', 'CBK', '청주시 흥덕구 오송읍', 36.6395, 127.3015, 6760000, 'industrial|research', 'K-바이오 스퀘어 · 바이오 국가산단', { l: 66, t: 76, pol: 85 }, {}],
  ['cb-techno', '청주 테크노폴리스', 'CBK', '청주시 흥덕구', 36.6245, 127.3925, 1800000, 'industrial', '메모리 팹 (M15X) 일대', { e: 84, w: 80 }, {}],
  ['cb-bunpyeong2', '청주 분평2', 'CBK', '청주시 서원구', 36.6005, 127.4805, 1000000, 'housing', '2023.11 지정 9천 호', { $: 120 }, { units: 9000, src: 'h2311' }],
  ['cn-tangjeong', '아산 탕정 디스플레이 단지', 'CNM', '아산시 탕정면', 36.7905, 127.0615, 2100000, 'industrial', 'OLED 팹 단지', { e: 86, l: 62 }, {}],
  ['cn-daesan', '서산 대산 석유화학단지', 'CNM', '서산시 대산읍', 36.9915, 126.3665, 3000000, 'chem|port', '3대 석유화학 단지', { p: 90, b: 92 }, {}],
  ['cn-seokmun', '당진 석문 국가산단', 'CNM', '당진시 석문면', 37.0285, 126.5505, 12000000, 'industrial|energy|port', '해안 국가산단 · 수소', { g: 'F', gw: 2, p: 84 }, {}],
  ['cn-boryeong', '보령 LNG·수소 거점', 'CNM', '보령시 오천면', 36.3955, 126.5055, 500000, 'energy|port', 'LNG 터미널 · 수소 생산', { p: 82 }, {}],
  ['sj-museum', '세종 국립박물관단지', 'SJG', '세종시 세종동', 36.5045, 127.2545, 190000, 'culture', '국립박물관 5관 단계 건립', { v: 66, pol: 90 }, {}],
  ['sj-capital', '세종 행정수도 (집무실·의사당)', 'SJG', '세종시 세종동', 36.5155, 127.2595, 630000, 'urban|culture', '국회 세종의사당·대통령 세종집무실', { pol: 95 }, {}],
  ['sj-jochiwon', '세종 조치원', 'SJG', '세종시 조치원읍', 36.6045, 127.2905, 2000000, 'housing', '2021.8 지정 7천 호', { $: 90 }, { units: 7000, src: 'h2108' }],
  ['sj-yeongi', '세종 연기', 'SJG', '세종시 연기면', 36.5605, 127.2705, 1500000, 'housing', '2021.8 지정 5천 호', { $: 90 }, { units: 5000, src: 'h2108' }],
  ['sj-smart', '세종 스마트그린 산단', 'SJG', '세종시 연서면', 36.6085, 127.2265, 2700000, 'industrial|research', '국가산단 · 데이터센터 수요', { e: 80 }, {}],
  ['dj-daedeok', '대덕 연구개발특구', 'DJN', '대전시 유성구', 36.3745, 127.3605, 400000, 'research', '정부출연연·첨단 연구 집적', { l: 96, pol: 82 }, {}],
  ['dj-gyochon', '대전 교촌 나노·반도체 국가산단', 'DJN', '대전시 유성구 교촌동', 36.2905, 127.3375, 5300000, 'industrial|research', '나노·반도체 국가산단 후보지', { pol: 78 }, {}],
  ['dj-jukdong2', '대전 죽동2', 'DJN', '대전시 유성구 죽동', 36.3735, 127.3365, 900000, 'housing', '2021.8 지정 7천 호', { $: 200 }, { units: 7000, src: 'h2108' }],
  ['dj-station', '대전역세권 복합2구역', 'DJN', '대전시 동구', 36.3325, 127.4365, 100000, 'urban', 'KTX 역세권 업무·주거 복합', { t: 92 }, {}],
  // ---------- 호남 ----------
  ['jb-smg', '새만금 국가산단 (이차전지)', 'JBK', '군산시·김제시', 35.8395, 126.6205, 18500000, 'industrial|port|energy', '이차전지 특화단지 · RE100', { g: 'F', gw: 1.5, f: 45, e: 80, pol: 88 }, { src: 'smg' }],
  ['jb-smg-h2', '새만금 그린수소 단지', 'JBK', '군산시 새만금', 35.8005, 126.5505, 2000000, 'energy|port', '재생에너지 연계 수소 생산', { g: 'F', gw: 1.5, f: 50 }, {}],
  ['jb-jeonju', '전주 탄소 국가산단', 'JBK', '전주시 덕진구', 35.8835, 127.0835, 650000, 'industrial', '탄소소재 국가산단', {}, {}],
  ['jn-yeosu', '여수 국가산단', 'JNM', '여수시 삼일·화치동', 34.8285, 127.6685, 5000000, 'chem|port', '국내 최대 석유화학 단지', { p: 95, b: 85 }, {}],
  ['jn-gwangyang', '광양 국가산단', 'JNM', '광양시 금호동', 34.9215, 127.7355, 3000000, 'chem|port|industrial', '제철·이차전지 소재', { p: 95, g: 'F', gw: 2 }, {}],
  ['jn-gy-port', '광양항 배후단지', 'JNM', '광양시 도이동', 34.9065, 127.6835, 1500000, 'port|logistics', '컨테이너 항만 배후 물류', { p: 92, g: 'F', gw: 2 }, {}],
  ['jn-solasido', '해남 솔라시도 데이터센터 파크', 'JNM', '해남군 산이면', 34.7095, 126.4535, 2000000, 'energy|tourism', '재생에너지 기반 데이터센터 단지', { e: 92, pol: 82 }, {}],
  ['jn-naju', '나주 에너지밸리 (혁신도시)', 'JNM', '나주시 빛가람동', 35.0185, 126.7895, 1000000, 'research|energy', '전력 공기업·에너지 연구', { l: 58, e: 92 }, {}],
  ['jn-gyeongdo', '여수 경도 해양관광단지', 'JNM', '여수시 경호동', 34.7065, 127.7285, 2100000, 'tourism', '해양 리조트·호텔', { v: 90 }, {}],
  ['gj-ai', '광주 첨단3지구 (AI 집적단지)', 'GWJ', '광주시 북구', 35.2335, 126.8605, 1600000, 'research|industrial', 'AI 데이터센터·실증 단지', { e: 78, pol: 80 }, {}],
  ['gj-mall', '광주 옛 방직공장 복합몰', 'GWJ', '광주시 북구 임동', 35.1655, 126.8965, 290000, 'urban', '복합쇼핑몰·주거 복합 개발', { t: 66, d: 76 }, {}],
  ['gj-sanjeong', '광주 산정', 'GWJ', '광주시 광산구', 35.1505, 126.7705, 1680000, 'housing', '공공주택지구 1만3천 호', { $: 140 }, { units: 13000 }],
  ['gj-eodeung', '광주 어등산 관광단지', 'GWJ', '광주시 광산구', 35.1855, 126.7655, 2700000, 'tourism', '관광·호텔 복합', { v: 55 }, {}],
  // ---------- 영남 ----------
  ['bs-north', '부산 북항 재개발', 'BSN', '부산 동구·중구', 35.1135, 129.0455, 1530000, 'urban|tourism|culture', '오페라하우스·업무·호텔 수변 개발', { t: 78, v: 92, g: 'F', gw: 2, f: 45 }, {}],
  ['bs-edc', '부산 에코델타시티', 'BSN', '부산 강서구', 35.1175, 128.9105, 11880000, 'housing|research', '스마트시티 3만 호', { g: 'C', gw: 1.5, f: 50, $: 250 }, { units: 30000 }],
  ['bs-daejeo', '부산 대저', 'BSN', '부산 강서구 대저동', 35.2035, 128.9705, 2430000, 'housing', '공공주택지구 1만8천 호', { g: 'C', gw: 2, f: 45, $: 200 }, { units: 18000 }],
  ['bs-newport', '부산항 신항 배후단지 (웅동)', 'GNM', '창원시 진해구 웅동', 35.0945, 128.7905, 2500000, 'port|logistics', '국내 최대 컨테이너 항만 배후', { p: 99, g: 'F', gw: 1.5 }, {}],
  ['bs-haeundae', '해운대 관광리조트', 'BSN', '부산 해운대구 중동', 35.1615, 129.1655, 65000, 'tourism|urban', '해변 초고층 호텔·레지던스', { v: 98, g: 'R', gw: 8 }, {}],
  ['bs-centum2', '부산 센텀2 도시첨단산단', 'BSN', '부산 해운대구 반여동', 35.2015, 129.1225, 1910000, 'research|industrial', 'ICT·첨단 산업단지', { l: 70 }, {}],
  ['us-onsan', '울산 온산 국가산단 (샤힌 일대)', 'USN', '울주군 온산읍', 35.4315, 129.3335, 4000000, 'chem|port', '샤힌 프로젝트 (에틸렌 180만t) 2026 하반기 가동', { p: 96, b: 88 }, { src: ['shaheen', 'shaheen2'] }],
  ['us-mipo', '울산 미포 국가산단 (AI 데이터센터)', 'USN', '울산 남구 황성동', 35.4985, 129.3555, 360000, 'industrial|energy|port', 'SK·AWS 100MW AI 데이터센터', { e: 94, pol: 86 }, { src: 'ulsdc' }],
  ['us-sunbawi', '울산 선바위', 'USN', '울주군 범서읍', 35.5655, 129.2335, 1820000, 'housing', '공공주택지구 1만5천 호', { $: 150 }, { units: 15000 }],
  ['us-hitech', '울산 하이테크밸리 (이차전지)', 'USN', '울주군 삼남읍', 35.5295, 129.1305, 1200000, 'industrial', '이차전지 특화단지', { pol: 85 }, {}],
  ['dg-alpha', '대구 수성알파시티', 'DGU', '대구 수성구 대흥동', 35.8345, 128.6955, 1180000, 'research|industrial', 'ICT·SW 융합 산업단지', { l: 66 }, {}],
  ['dg-seodaegu', '서대구 역세권', 'DGU', '대구 서구 이현동', 35.8815, 128.5395, 900000, 'urban', 'KTX 역세권 복합 개발', { t: 78 }, {}],
  ['dg-museum', '대구 옛 경북도청 문화부지', 'DGU', '대구 북구 산격동', 35.8925, 128.6005, 140000, 'culture', '국립근대미술관·뮤지컬 콤플렉스 후보', { v: 60, pol: 82 }, {}],
  ['gb-pohang', '포항 블루밸리 (이차전지)', 'GBK', '포항시 남구 동해면', 36.0185, 129.4535, 6080000, 'industrial|port', '이차전지 특화단지 국가산단', { p: 85, pol: 88, f: 18 }, {}],
  ['gb-gumi', '구미 국가산단 5단지', 'GBK', '구미시 산동읍', 36.1365, 128.4305, 9300000, 'industrial', '반도체·방산 특화', { e: 82, w: 82 }, {}],
  ['gb-andong', '안동 바이오 산단', 'GBK', '안동시 풍산읍', 36.5795, 128.5545, 800000, 'industrial|research', '백신·바이오 특화', { l: 40 }, {}],
  ['gb-gyeongju', '경주 보문 관광단지', 'GBK', '경주시 신평동', 35.8425, 129.2785, 8000000, 'tourism|culture', '역사·관광 리조트', { v: 92, f: 20 }, {}],
  ['gn-changwon', '창원 국가산단 (원전·방산)', 'GNM', '창원시 성산구', 35.2085, 128.6545, 2000000, 'industrial|port', '기계·원전·방산 고도화', { e: 84 }, {}],
  ['gn-hadong', '하동 발전 부지', 'GNM', '하동군 금성면', 34.9665, 127.8115, 500000, 'energy|port', '석탄 → LNG 전환 대체 발전', { b: 85 }, {}],
  ['gn-tongyeong', '통영 LNG 생산기지 일대', 'GNM', '통영시 광도면', 34.8615, 128.4795, 400000, 'energy|port', 'LNG 인수기지 · 발전', { p: 88 }, {}],
  // ---------- 제주 ----------
  ['jj-jungmun', '제주 중문 관광단지', 'JJU', '서귀포시 중문동', 33.2485, 126.4125, 3560000, 'tourism', '해안 리조트·호텔·MICE', {}, {}],
  ['jj-hwabuk2', '제주 화북2', 'JJU', '제주시 화북동', 33.5185, 126.5695, 600000, 'housing', '2023.11 지정 5,500호', { $: 120 }, { units: 5500, src: 'h2311' }],
  ['jj-shinhwa', '제주 신화역사공원', 'JJU', '서귀포시 안덕면', 33.3055, 126.3175, 3990000, 'tourism', '복합리조트', {}, {}],
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// 1단계 서울 후보지 8곳을 같은 형식으로
const SEOUL_EXTRA = {
  yongsan: { kinds: 'urban|housing', o: { g: 'S', gw: 4, t: 96, f: 38 } },
  campkim: { kinds: 'housing|urban', o: { g: 'S', gw: 5, t: 94 } },
  seoripul1: { kinds: 'housing', o: { g: 'W', gw: 7, t: 72, $: 200 } },
  seoripul2: { kinds: 'housing', o: { g: 'W', gw: 7, t: 66, $: 250 } },
  taereung: { kinds: 'housing', o: { g: 'W', gw: 9, t: 68, $: 150 } },
  smc: { kinds: 'urban|housing', o: { g: 'S', gw: 6, t: 95, $: 6000 } },
  horse: { kinds: 'housing', o: { g: 'S', gw: 4, t: 86, $: 4000 } },
  guryong: { kinds: 'housing', o: { g: 'W', gw: 8, t: 74, $: 1000 } },
};
function seoulRows() {
  return SEOUL.map(s => {
    const x = SEOUL_EXTRA[s.id] || { kinds: 'housing', o: {} };
    return [s.id, s.name, 'SEL', `${s.gu} ${s.dong}`.trim(), s.lat, s.lng, s.area, x.kinds, s.status, x.o,
      { units: s.plannedUnits, far: s.p.far, maxFloors: s.p.maxFloors, avgUnit: s.p.avgUnit, rentalShare: s.p.rentalShare, resShare: s.p.resShare, netRatio: s.p.netRatio, start: s.start, srcList: s.sources, stage1: true, aspect: s.aspect }];
  });
}

function build(row) {
  const [id, name, reg, city, lat, lng, area, kinds, status, o = {}, x = {}] = row;
  const R = REGIONS[reg];
  const ks = kinds.split('|');
  const a = { t: R.t, r: R.r, p: R.p, a: R.a, e: R.e, w: R.w, l: R.l, d: R.d, v: R.v, $: R.$, g: R.g, gw: R.gw, f: R.f, b: R.b, pol: R.pol };
  ks.forEach(k => { const K = KINDS[k]; if (!K) return; Object.entries(K.add || {}).forEach(([kk, dv]) => { a[kk] = (a[kk] ?? 50) + dv; }); });
  const land = Math.min(...ks.map(k => (KINDS[k] && KINDS[k].land) || 1));
  a.$ = Math.round(a.$ * land);
  Object.assign(a, o);
  ['t', 'r', 'p', 'a', 'e', 'w', 'l', 'd', 'v', 'f', 'b', 'pol'].forEach(k => { a[k] = clamp(Math.round(a[k]), 0, 100); });
  const srcKeys = x.src ? [].concat(x.src) : [];
  const sources = [...(x.srcList || []), ...srcKeys.map(k => SRC[k]).filter(Boolean)];
  return { id, name, reg, region: R.name, city, lat, lng, area, kinds: ks, status, a, units: x.units || null, far: x.far || null, maxFloors: x.maxFloors || null,
    avgUnit: x.avgUnit || null, rentalShare: x.rentalShare ?? null, resShare: x.resShare ?? null, netRatio: x.netRatio || null, start: x.start || null, aspect: x.aspect || null,
    stage1: !!x.stage1, sources, focus: focusOf.get(id) || [] };
}

export const KR_SITES = [...seoulRows(), ...ROWS].map(build);
export const KR_BY_ID = new Map(KR_SITES.map(s => [s.id, s]));
export const siteById = (id) => KR_BY_ID.get(id) || null;
export const REGION_ORDER = Object.keys(REGIONS);
