// 용산국제업무지구 대지·블록·주변 맥락 모델
// 좌표계: 대지 좌표 (u, v, y) — u는 대지 장축(동쪽 +), v는 단축(남쪽·한강 방향 +), y는 높이(m)
// 월드 좌표 (x, y, z) — x 동쪽, z 남쪽. 대지 장축은 동쪽에서 남쪽으로 ROT_DEG만큼 기울어 있다(한강과 평행).

export const ROT_DEG = 20;
const R = (ROT_DEG * Math.PI) / 180;
export const COS = Math.cos(R);
export const SIN = Math.sin(R);

export const toWorld = (u, v) => [u * COS - v * SIN, u * SIN + v * COS];
export const toSite = (x, z) => [x * COS + z * SIN, -x * SIN + z * COS];
// 월드 방향벡터(동·위·남) → 대지 좌표 방향
export const dirToSite = ([x, y, z]) => [x * COS + z * SIN, y, -x * SIN + z * COS];

// 대지: 495,000㎡ (1,150m × 430m 직사각형으로 단순화)
export const SITE = { u0: -575, u1: 575, v0: -215, v1: 215, area: 495000 };

// 발표 존 면적 (아시아경제 2025.11.16)
export const ZONES = {
  intl:  { key: 'intl',  name: '국제업무존', area: 82938, color: '--office' },
  mixed: { key: 'mixed', name: '업무복합존', area: 81036, color: '--officetel' },
  supp:  { key: 'supp',  name: '업무지원존(주거)', area: 93723, color: '--res' },
};

// 블록 격자: 북측 열 v∈[-195,-40], 남측 열 v∈[40,195], 가운데 v∈[-40,40]는 선형 공원
const COLS = [[-555, -445], [-420, -310], [-285, -175], [-150, -40], [-15, 95], [120, 230], [255, 365], [390, 555]];
const ROWS = { N: [-195, -40], S: [40, 195] };
// 블록 배정 (이 모델의 임의 배치·번호. 실제 획지 번호와 다름)
const ASSIGN = [
  ['C1', 'supp', 'S', 0], ['C2', 'supp', 'S', 1], ['C3', 'supp', 'S', 2], ['C4', 'supp', 'S', 3], ['C5', 'supp', 'N', 0], ['C6', 'supp', 'N', 1],
  ['B1', 'mixed', 'N', 2], ['B2', 'mixed', 'N', 3], ['B3', 'mixed', 'N', 4], ['B4', 'mixed', 'S', 4], ['B5', 'mixed', 'S', 5], ['B6', 'mixed', 'S', 6],
  ['A1', 'intl', 'N', 7], ['A2', 'intl', 'N', 6], ['A3', 'intl', 'N', 5], ['A4', 'intl', 'S', 7],
];

function buildBlocks() {
  const cells = ASSIGN.map(([id, zone, row, ci]) => {
    const [u0, u1] = COLS[ci], [v0, v1] = ROWS[row];
    return { id, zone, row, cell: { u0, u1, v0, v1 }, cellArea: (u1 - u0) * (v1 - v0) };
  });
  // 존별 발표 면적에 맞춰 각 셀을 균일하게 안쪽으로 줄여 획지를 만든다 (나머지는 공개공지·녹지)
  for (const zk of Object.keys(ZONES)) {
    const zc = cells.filter(c => c.zone === zk);
    const sum = zc.reduce((s, c) => s + c.cellArea, 0);
    const scale = Math.min(1, ZONES[zk].area / sum);
    zc.forEach(c => {
      const w = c.cell.u1 - c.cell.u0, d = c.cell.v1 - c.cell.v0, target = c.cellArea * scale;
      // (w-2m)(d-2m) = target  →  m
      const a = 4, b = -2 * (w + d), cc = w * d - target;
      const m = (-b - Math.sqrt(b * b - 4 * a * cc)) / (2 * a);
      c.lot = { u0: c.cell.u0 + m, u1: c.cell.u1 - m, v0: c.cell.v0 + m, v1: c.cell.v1 - m };
      c.area = (c.lot.u1 - c.lot.u0) * (c.lot.v1 - c.lot.v0);
      c.margin = m;
    });
  }
  return cells;
}
export const BLOCKS = buildBlocks();

// 한강: 대지 남측 경계에서 약 400m 떨어진 수면 (근사)
export const RIVER = { v0: 620, v1: 1500, u0: -3200, u1: 3200 };
export const RIVER_TARGETS = Array.from({ length: 31 }, (_, i) => [-1500 + i * 100, 700, 0]);
// 남산서울타워 꼭대기 (해발 약 480m, 대지 기준 약 470m)
export const NAMSAN = [1317, -3401, 470];

// 주변 맥락 (근사). [u, v, w, d, 층수, 용도, 이름]. 층고는 주거 2.9m, 비주거 4.0m로 높이 환산
// 실제 건물 데이터(OpenStreetMap)를 연결하면 이 목록을 대체한다.
const C = [];
const add = (u, v, w, d, fl, use, name) => C.push({ u, v, w, d, fl, use, name });
// 남측: 서부이촌동 (중층 아파트 + 저층 주거)
[[-520, 12], [-420, 12], [-320, 15], [-220, 15], [-120, 13], [-20, 13], [80, 15], [180, 15]].forEach(([u, f]) => add(u, 290, 70, 14, f, 'res', '서부이촌동 아파트'));
[-500, -380, -260, -140, -20, 100, 220].forEach(u => add(u, 380, 80, 55, 4, 'res', '서부이촌동 저층 주거'));
[[-450, 15], [-330, 18], [-210, 20], [-90, 15], [30, 18], [150, 20], [270, 15]].forEach(([u, f]) => add(u, 470, 60, 15, f, 'res', '이촌동 아파트'));
// 동측: 용산역·신용산
add(720, -60, 160, 180, 10, 'com', '용산역·아이파크몰');
add(760, -300, 80, 40, 38, 'com', '드래곤시티(호텔)');
add(890, -10, 38, 30, 39, 'res', '신용산 주상복합 A');
add(955, -55, 38, 30, 39, 'res', '신용산 주상복합 B');
add(930, 120, 40, 30, 40, 'res', '신용산 주상복합 C');
add(995, 70, 40, 30, 40, 'res', '신용산 주상복합 D');
add(1010, -210, 100, 100, 27, 'com', '신용산 업무 빌딩');
add(1150, -90, 40, 35, 43, 'res', '신용산 주상복합 E');
add(1150, 10, 40, 35, 43, 'res', '신용산 주상복합 F');
// 북측: 철도 너머 용산전자상가·원효로
[[0, 7], [160, 8], [320, 7], [470, 6]].forEach(([u, f]) => add(u, -420, 120, 70, f, 'com', '용산전자상가'));
[[-600, 15], [-480, 15], [-360, 12]].forEach(([u, f]) => add(u, -420, 60, 15, f, 'res', '원효로 아파트'));
add(-240, -430, 80, 60, 5, 'res', '원효로 저층 주거');
add(-560, -540, 80, 60, 4, 'res', '원효로 저층 주거');
add(-420, -540, 80, 60, 4, 'res', '원효로 저층 주거');
// 서측: 원효대교 방면
add(-760, 150, 70, 15, 15, 'res', '산천동 아파트');
add(-760, 30, 70, 15, 15, 'res', '산천동 아파트');
add(-800, -120, 80, 60, 5, 'res', '산천동 저층 주거');
add(-720, -290, 60, 40, 12, 'com', '원효로 업무');

export const CONTEXT = C.map((c, i) => ({
  id: 'X' + String(i + 1).padStart(2, '0'), name: c.name, use: c.use, floors: c.fl,
  u0: c.u - c.w / 2, u1: c.u + c.w / 2, v0: c.v - c.d / 2, v1: c.v + c.d / 2, y0: 0, y1: c.fl * (c.use === 'res' ? 2.9 : 4.0),
}));

// 지도 띠: 철도(북측), 강변북로, 이촌로
export const BANDS = [
  { name: '철도(경의중앙선·차량기지)', u0: -1400, u1: 640, v0: -330, v1: -230, kind: 'rail' },
  { name: '이촌로', u0: -1400, u1: 1400, v0: 222, v1: 240, kind: 'road' },
  { name: '강변북로', u0: -3200, u1: 3200, v0: 570, v1: 605, kind: 'road' },
  { name: '선형 공원', u0: -555, u1: 555, v0: -40, v1: 40, kind: 'park' },
];
