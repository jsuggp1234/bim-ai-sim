// ===== 1단계 엔진: 후보지 데이터 + 매스 배치 + 사업성 계산 (순수 함수) =====
const PY = 3.3058; // 1평 = 3.3058㎡

// 공통 가정값. src: 'source'는 기사 근거가 있는 값, 'est'는 추정값
const GLOBAL_DEFAULTS = {
  capDiscount: 25,   // 분양가상한제 할인율(시세 대비, %) — 추정
  constUnit: 1000,   // 공사비 (만원/3.3㎡, 지상+지하 연면적) — 기사: 목동 재건축 평당 1,000만원 시대
  rentalBuy: 1400,   // 임대주택 매입가 (만원/3.3㎡ 공급면적) — 추정
  nonResPrice: 3000, // 비주거(업무·상업) 매각가 (만원/3.3㎡ 연면적) — 추정
  sitePrep: 25,      // 택지 조성비 (만원/㎡, 총면적) — 추정
  rate: 5.5,         // PF 금리 (%) — 추정
  parkRatio: 1.0,    // 세대당 주차대수
  netEff: 72,        // 전용률: 전용면적 / 지상연면적 (%)
  spacing: 0.5,      // 동간거리 계수 (× 건물 높이)
};

const GLOBAL_META = {
  capDiscount: { label: '분양가상한제 할인율', unit: '%', min: 0, max: 50, step: 1, src: 'est', note: '공공택지는 분양가상한제 대상. 시세 대비 할인 폭' },
  constUnit:   { label: '공사비', unit: '만원/3.3㎡', min: 600, max: 1800, step: 10, src: 'source', note: '연면적 기준. 2026년 목동 재건축 평당 1,000만원, 여의도 광장 1,590만원 보도' },
  rentalBuy:   { label: '임대주택 매입가', unit: '만원/3.3㎡', min: 500, max: 4000, step: 50, src: 'est', note: '공공임대·장기전세를 LH·SH가 사들이는 단가(공급면적)' },
  nonResPrice: { label: '비주거 매각가', unit: '만원/3.3㎡', min: 1000, max: 8000, step: 50, src: 'est', note: '업무·상업 연면적 기준' },
  rate:        { label: 'PF 금리', unit: '%', min: 2, max: 10, step: 0.1, src: 'est', note: '토지비 전 기간, 공사비 공사기간의 절반에 적용' },
  spacing:     { label: '동간거리 계수', unit: '×H', min: 0.2, max: 1.0, step: 0.05, src: 'est', note: '남북 방향 동 사이 거리 = 계수 × 건물 높이 (최소 12m)' },
  parkRatio:   { label: '세대당 주차', unit: '대', min: 0.3, max: 1.6, step: 0.05, src: 'est', note: '지하 1대당 35㎡로 지하 연면적 산정' },
};

const SITE_META = {
  netRatio:    { label: '가용 택지비율', unit: '%', min: 10, max: 100, step: 1, note: '총면적 중 주택·복합 블록(도로·공원·학교 제외)' },
  far:         { label: '계획 용적률', unit: '%', min: 50, max: 1700, step: 5, note: '가용 택지 기준 지상 연면적 / 대지' },
  bcrMax:      { label: '건폐율 한도', unit: '%', min: 10, max: 60, step: 1, note: '동 배치에 쓸 수 있는 최대 건축면적 비율' },
  maxFloors:   { label: '최고 층수', unit: '층', min: 3, max: 80, step: 1, note: '경관·고도 제한' },
  avgUnit:     { label: '평균 전용면적', unit: '㎡', min: 20, max: 135, step: 1, note: '세대 평균' },
  rentalShare: { label: '임대 비율', unit: '%', min: 0, max: 100, step: 1, note: '공공임대·장기전세 비중' },
  resShare:    { label: '주거 비율', unit: '%', min: 20, max: 100, step: 1, note: '지상 연면적 중 주거. 나머지는 업무·상업' },
  marketPrice: { label: '주변 신축 시세', unit: '만원/3.3㎡', min: 1500, max: 15000, step: 50, note: '공급면적 기준 추정 시세' },
  landPrice:   { label: '토지 단가', unit: '만원/㎡', min: 50, max: 10000, step: 10, note: '보상·매입 단가(총면적 기준) 추정' },
};

// 후보지 8곳. 수치 출처는 sources, 'est' 표시는 추정값
const SITES = [
  {
    id: 'seoripul1', name: '서리풀1지구', gu: '서초구', dong: '원지·신원·염곡·내곡동', lat: 37.458, lng: 127.050,
    area: 2018074, plannedUnits: 18000, start: 2028, aspect: 1.6,
    status: '2026.2.2 공공주택지구 지정. 그린벨트 해제 택지, 2028년 착공 목표',
    land: '개발제한구역 해제 · 공공주택지구',
    p: { netRatio: 35, far: 200, bcrMax: 15, maxFloors: 35, avgUnit: 59, rentalShare: 55, resShare: 100, marketPrice: 6000, landPrice: 200 },
    loc: { score: 75, note: '신분당선 청계산입구·양재시민의숲역 생활권, 강남 업무지구 접근 양호 (거리 추정)' },
    risk: { score: 55, issues: [
      '주민대책위, 보상·이주 대책 부족 이유로 공급계획 전면 재검토 요구',
      '서울시 계획: 서리풀 1·2지구 2만 가구 중 55%(1만1천 가구) 장기전세 미리내집. 대책위는 임대 비중 약 80% 우려',
      '그린벨트 해제에 대한 환경 훼손 비판',
    ] },
    presets: [
      { key: 'plan', label: '발표안 (1만8천 호)', p: { far: 200, rentalShare: 55 } },
      { key: 'rent80', label: '임대 80% 우려안', p: { far: 200, rentalShare: 80 } },
      { key: 'private', label: '분양 최대화', p: { far: 250, rentalShare: 15, maxFloors: 35 } },
    ],
    sources: [
      { t: '데일리안, 서리풀 공공주택 주민 갈등 계속', url: 'https://www.dailian.co.kr/news/view/1669726/', d: '2026' },
      { t: '헤럴드경제, 서리풀2지구 2028년 12월까지 2000호 착공', url: 'https://biz.heraldcorp.com/article/10768566', d: '2026.6' },
    ],
  },
  {
    id: 'seoripul2', name: '서리풀2지구', gu: '서초구', dong: '우면동', lat: 37.465, lng: 127.021,
    area: 193259, plannedUnits: 2000, start: 2028, aspect: 1.4,
    status: '2026.6.11 공공주택지구 지정. 2028년 12월까지 2천 호 착공 목표',
    land: '개발제한구역 해제 · 공공주택지구',
    p: { netRatio: 45, far: 180, bcrMax: 15, maxFloors: 25, avgUnit: 59, rentalShare: 55, resShare: 100, marketPrice: 6500, landPrice: 250 },
    loc: { score: 65, note: '양재시민의숲역 약 1.5km, 버스 의존 (거리 추정)' },
    risk: { score: 45, issues: [
      '주민들이 국토부의 지구지정 처분 취소 행정소송 제기',
      '우면동 성당과 식유촌·송동마을 존치 요구, 서울시청 앞 침묵시위',
    ] },
    presets: [
      { key: 'plan', label: '발표안 (2천 호)', p: { netRatio: 45, far: 180, rentalShare: 55 } },
      { key: 'keep', label: '마을·성당 존치 가정', p: { netRatio: 36, far: 180, rentalShare: 55 } },
      { key: 'private', label: '분양 최대화', p: { netRatio: 45, far: 230, rentalShare: 15 } },
    ],
    sources: [
      { t: '데일리안, 서리풀 공공주택 주민 갈등 계속', url: 'https://www.dailian.co.kr/news/view/1669726/', d: '2026' },
      { t: '헤럴드경제, 서리풀2지구 2028년 12월까지 2000호 착공', url: 'https://biz.heraldcorp.com/article/10768566', d: '2026.6' },
    ],
  },
  {
    id: 'taereung', name: '태릉CC', gu: '노원구', dong: '공릉동', lat: 37.625, lng: 127.100,
    area: 875000, plannedUnits: 6800, start: 2029, aspect: 1.3,
    status: '2026.8.18 국무회의, 그린벨트 해제총량 예외 의결. 2029년 9월 우선구역 착공 목표',
    land: '군 골프장 · 개발제한구역 · 조선왕릉(세계유산) 인접',
    p: { netRatio: 30, far: 170, bcrMax: 15, maxFloors: 15, avgUnit: 49, rentalShare: 50, resShare: 100, marketPrice: 3800, landPrice: 150 },
    loc: { score: 50, note: '6·7호선 태릉입구·화랑대역 약 1~1.5km, 교통난 우려 (거리 추정)' },
    risk: { score: 35, issues: [
      '태릉·강릉(세계유산) 영향평가 필요. 2023 LH 용역은 높이 11.5~26.5m(6~8층) 권고',
      '6,800호 기준 시각 영향 "심각(-5)" 평가 지점 다수',
      '녹지 훼손·교통난 우려, 2021년 1만 호 계획에서 축소된 이력',
    ] },
    presets: [
      { key: 'plan', label: '발표안 (6,800호 중층)', p: { maxFloors: 15, far: 170 } },
      { key: 'heritage', label: '세계유산 권고 8층', p: { maxFloors: 8, far: 170 } },
      { key: 'private', label: '분양 최대화', p: { maxFloors: 25, far: 200, rentalShare: 15, avgUnit: 74 } },
    ],
    sources: [
      { t: '파이낸셜뉴스, 태릉골프장 6800가구 그린벨트 총량규제 예외 확정', url: 'https://www.fnnews.com/news/202608181402105354', d: '2026.8.18' },
      { t: '헤럴드경제, 태릉CC 3000세대 vs 6800세대 문화유산평가', url: 'https://www.heraldk.com/article/2026021622000021307', d: '2026.2' },
      { t: '데일리안, 용산·태릉·과천 등 공공부지 공급 방안', url: 'https://www.dailian.co.kr/news/view/1603980/', d: '2026.1.29' },
    ],
  },
  {
    id: 'yongsan', name: '용산국제업무지구', gu: '용산구', dong: '한강로3가 (옛 용산정비창)', lat: 37.527, lng: 126.966,
    area: 495000, plannedUnits: 6000, start: 2028, aspect: 1.7, landBasis: 'net',
    status: '주택 물량 갈등: 서울시 6천 호 vs 정부 1만 호 (절충 8천 호 거론)',
    land: '도시개발구역 · 도시혁신구역(일부 용적률 최대 1,700%) · 토지비는 주거용지만 반영',
    p: { netRatio: 20, far: 600, bcrMax: 40, maxFloors: 55, avgUnit: 74, rentalShare: 30, resShare: 100, marketPrice: 8000, landPrice: 3000 },
    loc: { score: 95, note: '용산역(1호선·경의중앙·KTX)·신용산역 직결 (거리 추정)' },
    risk: { score: 40, issues: [
      '국토부 1만 호 vs 서울시 6천 호. 서울시는 8천 호가 최대라고 밝힘',
      '서울시의회: 4천 호 증가 시 교통·학교·상하수도 부담, "고밀 베드타운" 우려 (2026.11.4)',
      '용산공원 부지 주택 전환 특별법 개정안 3건 발의 (2026.8·10)',
    ] },
    presets: [
      { key: 'seoul', label: '서울시안 6천 호', p: { netRatio: 20, far: 600 } },
      { key: 'mid', label: '절충안 8천 호', p: { netRatio: 27, far: 600 } },
      { key: 'gov', label: '정부안 1만 호', p: { netRatio: 34, far: 600 } },
    ],
    sources: [
      { t: '서울신문, 오천진 시의원 "6000호 원안 사수"', url: 'https://go.seoul.co.kr/news/newsView.php?id=20261105500183', d: '2026.11.5' },
      { t: '머니투데이, 용산 캠프킴·국제업무지구 공급 어디까지', url: 'https://www.mt.co.kr/estate/2026/08/04/2026080413555876709', d: '2026.8.4' },
      { t: '서울신문, 용산국제업무지구 밑그림 공개 (면적 49만5천㎡)', url: 'https://m.go.seoul.co.kr/news/2024/11/28/20241128500195', d: '2024.11.28' },
    ],
  },
  {
    id: 'campkim', name: '캠프킴 부지', gu: '용산구', dong: '한강로1가', lat: 37.5345, lng: 126.9735,
    area: 48339, plannedUnits: 2500, start: 2029, aspect: 1.5,
    status: '1·29 대책으로 1,400호 → 2,500호 상향. 2029년 착공 목표',
    land: '반환 미군기지 · 자연녹지 → 복합시설조성지구 전환 예정',
    p: { netRatio: 60, far: 560, bcrMax: 40, maxFloors: 50, avgUnit: 49, rentalShare: 50, resShare: 100, marketPrice: 7500, landPrice: 1500 },
    loc: { score: 90, note: '삼각지역(4·6호선) 도보권 (거리 추정)' },
    risk: { score: 45, issues: [
      '용산공원 조성 특별법 개정안 국회 본회의 미통과 (복합시설조성지구 설계기준 완화 조항)',
      '토양오염 정화, 국방부→LH 이관 협의 필요',
      '고밀 공공주택 품질 우려("닭장 아파트" 논란)',
    ] },
    presets: [
      { key: 'old', label: '기존안 1,400호', p: { far: 315 } },
      { key: 'plan', label: '1·29안 2,500호', p: { far: 560 } },
    ],
    sources: [
      { t: '머니투데이, 용산 캠프킴·국제업무지구 공급 어디까지', url: 'https://www.mt.co.kr/estate/2026/08/04/2026080413555876709', d: '2026.8.4' },
      { t: '헤럴드경제, 금싸라기 용산 캠프킴 (면적 48,339㎡)', url: 'https://www.heraldk.com/article/2026011000000003962', d: '2026.1.10' },
    ],
  },
  {
    id: 'smc', name: '서울의료원 남측부지', gu: '강남구', dong: '삼성동', lat: 37.5125, lng: 127.0615,
    area: 11000, plannedUnits: 518, start: 2028, aspect: 1.3,
    status: '1·29 대책. 청년 공공주택 518호 + 업무시설 복합, 2028년 착공 목표',
    land: 'LH 보유 공공부지 · 업무 복합',
    p: { netRatio: 100, far: 400, bcrMax: 50, maxFloors: 30, avgUnit: 30, rentalShare: 100, resShare: 50, marketPrice: 9000, landPrice: 6000 },
    loc: { score: 95, note: '삼성역(2호선)·봉은사역(9호선) 인접' },
    risk: { score: 75, issues: [
      '소규모 단일 필지, 예비타당성조사 면제 대상',
      '강남 한복판 청년 임대 공급에 대한 지역 반응은 확인 필요',
    ] },
    presets: [
      { key: 'plan', label: '발표안 518호', p: { far: 400, resShare: 50, rentalShare: 100 } },
      { key: 'private', label: '분양 최대화', p: { far: 400, resShare: 60, rentalShare: 20, avgUnit: 49 } },
    ],
    sources: [
      { t: '뉴스핌, 1·29 공급대책 서울의료원·경찰기마대 등 도심 유휴부지', url: 'https://www.newspim.com/news/view/20260129000345', d: '2026.1.29' },
    ],
  },
  {
    id: 'horse', name: '옛 경찰기마대 부지', gu: '성동구', dong: '성수동2가', lat: 37.541, lng: 127.055,
    area: 5586, plannedUnits: 260, start: 2030, aspect: 1.2,
    status: '1·29 대책. 청년·신혼 260호, 2030년 착공 목표',
    land: '경찰 부지 (2024.2 기마대 운영 종료, 임시 사용 중)',
    p: { netRatio: 100, far: 300, bcrMax: 50, maxFloors: 25, avgUnit: 49, rentalShare: 100, resShare: 100, marketPrice: 8000, landPrice: 4000 },
    loc: { score: 85, note: '성수 업무권역, 2호선 생활권 (거리 추정)' },
    risk: { score: 70, issues: [
      '경찰이 건물을 임시 사용 중, 철거 후 착공',
      '소규모 필지라 동 배치 자유도 낮음',
    ] },
    presets: [
      { key: 'plan', label: '발표안 260호', p: { far: 300, rentalShare: 100 } },
      { key: 'private', label: '분양 최대화', p: { far: 400, rentalShare: 20, avgUnit: 59 } },
    ],
    sources: [
      { t: '뉴스핌, 1·29 공급대책 서울의료원·경찰기마대 등 도심 유휴부지', url: 'https://www.newspim.com/news/view/20260129000345', d: '2026.1.29' },
    ],
  },
  {
    id: 'guryong', name: '구룡마을 (B2·M블록)', gu: '강남구', dong: '개포동', lat: 37.478, lng: 127.063,
    area: 65619, plannedUnits: 2120, start: 2027, aspect: 2.0,
    status: '2026.7.21 공공주택 통합심의 조건부 통과. 2027년 착공, 2031년 준공 목표',
    land: '도시개발구역 (2016 지정) · 무허가 판자촌',
    p: { netRatio: 100, far: 210, bcrMax: 25, maxFloors: 28, avgUnit: 49, rentalShare: 99, resShare: 100, marketPrice: 8500, landPrice: 1000 },
    loc: { score: 70, note: '구룡역·양재 생활권 약 1km (거리 추정)' },
    risk: { score: 60, issues: [
      '1,107세대 중 163세대 미이주. SH가 253세대에 명도소송 제기(2026.3)',
      '2026.1 대형 화재로 4·6지구 소실',
      '구역 전체 약 3,739호 중 이 블록은 공공주택 2,120세대 (분양 20세대)',
    ] },
    presets: [
      { key: 'plan', label: '발표안 2,120세대', p: { far: 210, maxFloors: 28, rentalShare: 99 } },
      { key: 'private', label: '분양 최대화', p: { far: 250, maxFloors: 35, rentalShare: 20, avgUnit: 74 } },
    ],
    sources: [
      { t: '서울신문, 구룡마을에 공공주택 2120세대', url: 'https://m.go.seoul.co.kr/news/2026/07/22/20260722500256', d: '2026.7.22' },
      { t: 'MTN, 내년 착공 목표 구룡마을 재개발 주민들 "절대 안 떠나"', url: 'https://news.mtn.co.kr/news-detail/2026080415521946726', d: '2026.8.4' },
    ],
  },
];

const PRICE_SOURCES = [
  { t: 'SBS Biz, 8월 기준 서울 민간아파트 분양가 평당 6,287만원 (HUG)', url: 'https://biz.sbs.co.kr/amp/article/20000335281', d: '2026.9' },
  { t: '케이잡뉴스, 서울 분양가 평당 6,300만원·공사비 평당 1,600만원', url: 'https://www.kjob.news/news/498516', d: '2026' },
];

// ---------- 매스 배치 ----------
// 남향 판상형 동을 격자로 배치. 층수·건폐율·동간거리(0.5H) 제약으로 실현 용적률을 구함
function planMass(site, p, g) {
  const net = site.area * p.netRatio / 100;
  const W = Math.sqrt(net * site.aspect), D = net / W;
  const setback = Math.min(12, Math.max(4, Math.sqrt(net) * 0.02));
  const gfaTarget = net * p.far / 100;
  const resTarget = gfaTarget * p.resShare / 100;
  const nonResTarget = gfaTarget - resTarget;
  const gfaPerUnit = p.avgUnit / (g.netEff / 100);
  const upf = 4; // 층당 4호
  const plate = upf * gfaPerUnit;
  const depth = p.avgUnit <= 40 ? 15 : 13.5;
  const len = plate / depth;
  const fh = 2.9;
  const nrPlate = 1600, nrW = 40, nrD = 40, nrFh = 4.0; // 비주거 타워
  const gx = 12;

  // 비주거 동 먼저 (필지 동쪽 끝)
  let nonRes = null, usableW = W - 2 * setback;
  if (nonResTarget > 1) {
    const nrFloorsMax = Math.max(3, Math.floor(p.maxFloors * 2.9 / nrFh));
    let nrCount = Math.max(1, Math.ceil(nonResTarget / (nrPlate * nrFloorsMax)));
    const nrFloors = Math.min(nrFloorsMax, Math.ceil(nonResTarget / (nrPlate * nrCount)));
    nonRes = { count: nrCount, floors: nrFloors, w: nrW, d: nrD, h: nrFloors * nrFh, gfa: nrCount * nrFloors * nrPlate };
    usableW = Math.max(len + 1, usableW - (nrW + gx));
  }
  const usableD = D - 2 * setback;
  const bcrArea = net * p.bcrMax / 100 - (nonRes ? nonRes.count * nrW * nrD : 0);

  let best = null;
  for (let fl = 1; fl <= p.maxFloors; fl++) {
    const H = fl * fh;
    const gy = Math.max(12, g.spacing * H);
    const perRow = Math.max(0, Math.floor((usableW + gx) / (len + gx)));
    const rows = Math.max(0, Math.floor((usableD + gy) / (depth + gy)));
    const capByGrid = perRow * rows;
    const capByBcr = Math.floor(bcrArea / (len * depth));
    const cap = Math.min(capByGrid, capByBcr);
    const need = Math.ceil(resTarget / (plate * fl));
    const n = Math.min(cap, need);
    const gfa = Math.min(resTarget, n * plate * fl);
    const cand = { fl, n, gfa, gy, perRow, rows, fits: need <= cap };
    if (cand.fits) { best = cand; break; }
    if (!best || cand.gfa > best.gfa + 1) best = cand;
  }
  const res = best || { fl: 0, n: 0, gfa: 0, gy: 12, perRow: 0, rows: 0, fits: false };
  // 균등 층수로 재조정
  const floors = res.n > 0 ? Math.min(p.maxFloors, Math.ceil(res.gfa / (res.n * plate))) : 0;
  const resGfa = Math.min(resTarget, res.n * plate * floors);
  const units = Math.floor(resGfa / gfaPerUnit);

  // 배치 좌표 (대지 중심 원점, x=동서, z=남북(+z 남쪽))
  const buildings = [];
  if (res.n > 0) {
    const H = floors * fh, gy = Math.max(12, g.spacing * H);
    let rowsUsed = Math.min(res.rows, Math.max(1, Math.round(Math.sqrt(res.n * (usableD / (depth + gy)) / Math.max(1, usableW / (len + gx))))));
    while (rowsUsed < res.rows && Math.ceil(res.n / rowsUsed) > res.perRow) rowsUsed++;
    const perRowUsed = Math.min(res.perRow, Math.ceil(res.n / rowsUsed));
    const x0 = -W / 2 + setback, z0 = -D / 2 + setback;
    const rowPitch = rowsUsed > 1 ? (usableD - depth) / (rowsUsed - 1) : 0;
    let k = 0;
    for (let r = 0; r < rowsUsed && k < res.n; r++) {
      const inRow = Math.min(perRowUsed, res.n - k);
      const colPitch = inRow > 1 ? (usableW - len) / (inRow - 1) : 0;
      for (let c = 0; c < inRow; c++, k++) {
        const cx = inRow > 1 ? x0 + len / 2 + c * colPitch : x0 + usableW / 2;
        const cz = rowsUsed > 1 ? z0 + depth / 2 + r * rowPitch : 0;
        buildings.push({ x: cx, z: cz, w: len, d: depth, h: H, floors, type: 'res' });
      }
    }
    if (nonRes) {
      const nx = W / 2 - setback - nrW / 2;
      const pitch = nonRes.count > 1 ? (usableD - nrD) / (nonRes.count - 1) : 0;
      for (let i = 0; i < nonRes.count; i++) {
        const nz = nonRes.count > 1 ? z0 + nrD / 2 + i * pitch : 0;
        buildings.push({ x: nx, z: nz, w: nrW, d: nrD, h: nonRes.h, floors: nonRes.floors, type: 'nonres' });
      }
    }
  }
  const footprint = buildings.reduce((s, b) => s + b.w * b.d, 0);
  const gfaAbove = resGfa + (nonRes ? nonRes.gfa : 0);
  const warnings = [];
  if (!res.fits) {
    const lack = (1 - resGfa / Math.max(1, resTarget)) * 100;
    warnings.push(`계획 주거 연면적의 ${lack.toFixed(0)}%를 배치하지 못함 (최고 ${p.maxFloors}층, 건폐율 ${p.bcrMax}%, 동간거리 ${g.spacing}H 기준)`);
  }
  return {
    net, W, D, setback, gfaPerUnit, plate, len, depth,
    floors, bldgCount: res.n, nonRes, buildings, units,
    resGfa, gfaAbove, farReal: gfaAbove / net * 100, bcrReal: footprint / net * 100,
    gfaTarget, fits: res.fits, warnings, heightM: floors * fh,
  };
}

// ---------- 사업성 ----------
function feasibility(site, p, g, m) {
  const units = m.units;
  const rentalUnits = Math.round(units * p.rentalShare / 100);
  const saleUnits = units - rentalUnits;
  const supplyPy = p.avgUnit * 1.32 / PY;         // 세대당 공급면적(평)
  const salePrice = p.marketPrice * (1 - g.capDiscount / 100); // 만원/평
  const parking = Math.ceil(units * g.parkRatio + (m.nonRes ? m.nonRes.gfa / 100 : 0));
  const gfaBelow = parking * 35;
  const gfaTotal = m.gfaAbove + gfaBelow;
  const hiPremium = Math.max(0, m.floors - 30) * 0.006;

  const rev = {
    sale: saleUnits * supplyPy * salePrice,
    rental: rentalUnits * supplyPy * g.rentalBuy,
    nonRes: m.nonRes ? m.nonRes.gfa / PY * g.nonResPrice : 0,
  };
  const revTotal = rev.sale + rev.rental + rev.nonRes;
  const constMonths = Math.round(24 + m.floors * 0.5);
  const permitMonths = Math.max(6, (site.start - 2026) * 12 - 3);
  const months = permitMonths + constMonths;
  const cost = {
    land: (site.landBasis === 'net' ? m.net : site.area) * p.landPrice,
    sitePrep: p.netRatio < 100 && site.landBasis !== 'net' ? site.area * g.sitePrep : 0,
    construction: gfaTotal / PY * g.constUnit * (1 + hiPremium),
  };
  cost.design = cost.construction * 0.06;
  cost.tax = (cost.land + cost.construction) * 0.04;
  cost.sales = rev.sale * 0.02;
  cost.finance = g.rate / 100 * (cost.land * months / 12 + cost.construction * 0.5 * constMonths / 12);
  const costTotal = Object.values(cost).reduce((a, b) => a + b, 0);
  const profit = revTotal - costTotal;
  // 손익분기 시세: profit(시세)=0 이 되는 주변 시세
  let breakeven = null;
  const k = saleUnits * supplyPy * (1 - g.capDiscount / 100) * 0.98;
  if (k > 0 && saleUnits >= units * 0.05) breakeven = (costTotal - rev.sale * 0.02 - rev.rental - rev.nonRes) / k;
  return {
    units, rentalUnits, saleUnits, supplyPy, salePrice, parking, gfaBelow, gfaTotal,
    rev, revTotal, cost, costTotal, profit, margin: profit / revTotal, roi: profit / costTotal,
    breakeven, months, constMonths, permitMonths,
  };
}

function evaluate(site, p, g) {
  const m = planMass(site, p, g);
  const f = feasibility(site, p, g, m);
  return { m, f };
}

function sensitivity(site, p, g) {
  const base = evaluate(site, p, g).f.profit;
  const tests = [
    ['주변 시세 ±10%', 'p', 'marketPrice', 0.10],
    ['공사비 ±10%', 'g', 'constUnit', 0.10],
    ['토지 단가 ±20%', 'p', 'landPrice', 0.20],
    ['용적률 ±10%', 'p', 'far', 0.10],
    ['임대 비율 ±10%p', 'p', 'rentalShare', 'pp10'],
    ['PF 금리 ±1%p', 'g', 'rate', 'pp1'],
  ];
  return tests.map(([label, scope, key, d]) => {
    const run = (sign) => {
      const pp = { ...p }, gg = { ...g };
      const tgt = scope === 'p' ? pp : gg;
      if (d === 'pp10') tgt[key] = Math.min(100, Math.max(0, tgt[key] + sign * 10));
      else if (d === 'pp1') tgt[key] = Math.max(0, tgt[key] + sign * 1);
      else tgt[key] = tgt[key] * (1 + sign * d);
      return evaluate(site, pp, gg).f.profit - base;
    };
    return { label, lo: run(-1), hi: run(1) };
  }).sort((a, b) => (Math.abs(b.hi - b.lo)) - (Math.abs(a.hi - a.lo)));
}

function scoreSite(site, ev, w) {
  const roi = ev.f.roi;
  const s = {
    feas: Math.max(0, Math.min(100, (roi + 0.6) * 100)),        // ROI -60%→0, +40%→100
    loc: site.loc.score,
    risk: site.risk.score,
    scale: Math.max(0, Math.min(100, (Math.log10(Math.max(1, ev.f.units)) - 2) / (4.3 - 2) * 100)), // 100세대→0, 2만→100
    speed: Math.max(0, Math.min(100, 100 - (site.start - 2027) * 25)),
  };
  const tw = w.feas + w.loc + w.risk + w.scale + w.speed || 1;
  s.total = (s.feas * w.feas + s.loc * w.loc + s.risk * w.risk + s.scale * w.scale + s.speed * w.speed) / tw;
  return s;
}


export { SITES, GLOBAL_DEFAULTS, GLOBAL_META, SITE_META, PRICE_SOURCES, planMass, feasibility, evaluate, sensitivity, scoreSite, PY };
