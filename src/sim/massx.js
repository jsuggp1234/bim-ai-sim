// 비주거 용도 매스 생성기: 오피스·호텔·복합몰·박물관·아레나·병원·R&D 캠퍼스·반도체 팹·이차전지·바이오·데이터센터·물류·석유화학·발전·수처리
// 결과는 공동주택 생성기(massing.js)와 같은 모양(gen: plan·bldgs·blocks·totals)이라 물량·공정·예산·3D가 그대로 이어진다.
// 획지는 plan.js 블록 격자를 쓰고(용도마다 블록 크기 다름), 블록마다 용도별 배치 틀(상대 좌표)을 연면적 목표에 맞춰 늘이거나 줄인다.
import { makePlan } from './plan.js';
import { refugeLevels } from './massing.js';
import { useOf, FLOOR_USES } from './uses.js';

const SB = 8;                 // 획지 안쪽 후퇴
const PARK_AREA = 33;         // 주차 1대당 지하 면적
const ALL = { N: 'win', S: 'win', E: 'win', W: 'win' };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 용도별 블록 크기 [폭, 깊이] (m)
const CELL = { tower: null, mall: [220, 200], museum: [220, 190], arena: [260, 220], hospital: [200, 180], campus: [220, 190],
  fab: [480, 380], factory: [420, 320], dc: [260, 200], logistics: [300, 220], plant: [420, 330] };
const CELL_BY_KIND = { bio: [300, 240], power: [380, 300], water: [320, 260] };

// 변수 (용도별 기본값은 XDEF, 슬라이더 정의는 XMETA)
export const XMETA = {
  far: { label: '용적률', unit: '%', min: 20, max: 1500, step: 10, note: '가용 획지 기준 지상 연면적 비율' },
  maxFloors: { label: '최고 층수', unit: '층', min: 3, max: 110, step: 1 },
  plate: { label: '기준층 면적', unit: '㎡', min: 800, max: 3500, step: 50 },
  hTyp: { label: '기준층 층고', unit: 'm', min: 3, max: 6, step: 0.05 },
  podium: { label: '포디움 층수', unit: '층', min: 0, max: 8, step: 1 },
  basement: { label: '지하 층수', unit: '층', min: 0, max: 8, step: 1, note: '굴착 깊이·흙막이·공기에 바로 영향' },
  lines: { label: '팹(생산동) 수', unit: '동', min: 1, max: 6, step: 1, note: '나머지 블록은 지원 시설·증설 예정지' },
  clean: { label: '클린룸 층고', unit: 'm', min: 6, max: 16, step: 0.5 },
  levels: { label: '물류 층수', unit: '층', min: 1, max: 7, step: 1, note: '램프로 각 층 트럭 접안' },
  trains: { label: '공정 블록 수', unit: '개', min: 1, max: 6, step: 1, note: '공정 → 저장 → 유틸리티 순으로 블록 배정' },
  tower: { label: '최고 탑 높이', unit: 'm', min: 40, max: 130, step: 1, note: '증류탑·흡수탑 (샤힌 프로필렌 타워 118m)' },
  seats: { label: '아레나 지름', unit: 'm', min: 90, max: 200, step: 5 },
  scale: { label: '시설 규모', unit: '%', min: 40, max: 160, step: 5, note: '배치 틀 면적 배율 (연면적 목표)' },
};
export const XDEF = {
  office: { far: 800, maxFloors: 55, plate: 2100, hTyp: 4.2, podium: 4, basement: 6 },
  hotel: { far: 500, maxFloors: 45, plate: 1500, hTyp: 3.5, podium: 4, basement: 4 },
  retail: { far: 300, maxFloors: 7, hTyp: 6, basement: 3 },
  museum: { far: 80, maxFloors: 4, scale: 100, basement: 2 },
  arena: { far: 120, seats: 150, basement: 2 },
  hospital: { far: 300, maxFloors: 20, plate: 1600, hTyp: 3.9, podium: 5, basement: 3 },
  lab: { far: 200, maxFloors: 10, hTyp: 4.5, basement: 2 },
  fab: { far: 120, lines: 3, clean: 11, basement: 1, scale: 100 },
  battery: { far: 90, scale: 100, basement: 1 },
  bio: { far: 120, scale: 100, basement: 1 },
  dc: { far: 160, maxFloors: 5, scale: 100, basement: 1 },
  logistics: { far: 200, levels: 4, basement: 1 },
  chem: { far: 40, trains: 2, tower: 100, basement: 1 },
  power: { far: 40, trains: 2, basement: 1 },
  water: { far: 30, scale: 100, basement: 2 },
};
export const XKEYS = (useId) => Object.keys(XDEF[useId] || {});

// ---------- 부품 ----------
function part(u0, u1, v0, v1, a = 0) {
  return { cu: (u0 + u1) / 2, cv: (v0 + v1) / 2, w: u1 - u0, d: v1 - v0, a, faces: ALL, u0, u1, v0, v1 };
}
// 층 쌓기: spec = [{ use, h, n, k(면적 비율) , units }], plate = 바닥 면적
function stack(spec, plate, { roof = null } = {}) {
  const fl = []; let lv = 1;
  spec.forEach(s => { for (let i = 0; i < (s.n || 1); i++) { fl.push({ lv, name: lv + 'F', use: s.use, h: s.h, area: plate * (s.k ?? 1), units: s.units || 0, s: s.s || 1 }); lv++; } });
  if (roof) fl.push({ lv, name: 'PH', use: 'mech', h: roof.h, area: roof.area, units: 0, roof: true, s: 1 });
  let y = 0; fl.forEach(f => { f.y0 = y; y += f.h; f.y1 = y; });
  return fl;
}
// 탑·탱크처럼 둥근 설비: 높이를 단(tier)으로 나눠 층처럼 다룬다 (공정 4D에서 한 단씩 세운다)
function tiers(use, H, dia, tierH = 6) {
  const n = Math.max(1, Math.round(H / tierH)), h = H / n, a = Math.PI * dia * dia / 4;
  return stack([{ use, h, n }], a);
}
let SEQ = 0;
function B(blk, kind, rect, floors, o = {}) {
  const prt = o.parts || [part(rect.u0, rect.u1, rect.v0, rect.v1, o.a || 0)];
  const w = rect.u1 - rect.u0, d = rect.v1 - rect.v0;
  const cyl = o.shape === 'cyl';
  return {
    id: `${blk.id}-${o.tag || kind.slice(0, 2).toUpperCase()}${++SEQ}`, block: blk.id, zone: blk.zone, kind, rect: { ...rect }, parts: prt,
    core: o.core || { u: (rect.u0 + rect.u1) / 2, v: (rect.v0 + rect.v1) / 2 }, perim: cyl ? Math.PI * w : 2 * (w + d), plate: cyl ? Math.PI * w * w / 4 : w * d,
    floors, shape: o.shape || 'box', span: o.span || null, coreDims: o.coreDims || null, form: kind, formName: o.name || KIND_NAME[kind] || kind, label: o.label || null,
  };
}
export const KIND_NAME = {
  office: '업무 타워', hotel: '호텔 타워', podium: '포디움', mall: '판매동', atrium: '아트리움', gallery: '전시동', store: '수장고동', admin: '관리·지원동',
  lobby: '로비동', arena: '아레나 볼', ward: '병동 타워', clinic: '진료 포디움', lab: '연구동', fab: '팹 (클린룸동)', cub: '중앙 유틸리티(CUB)',
  wwt: '폐수 처리', tank: '저장 탱크', elec: '변전·전기동', prod: '생산동', whs: '자동화 창고', ramp: '램프', dhall: '데이터홀동', gen: '비상 발전기',
  column: '증류탑·반응기', rack: '파이프랙', furnace: '분해로', comp: '압축기동', stack: '연돌·플레어', turbine: '터빈동', hrsg: '배열회수보일러', cool: '냉각탑',
  basin: '처리 수조', digester: '소화조', gmp: 'GMP 생산동', basement: '지하층',
};
// 획지 안쪽 사각형에서 비율 좌표 → 실제 좌표 (k: 면적 배율, 중심 기준)
function fr(L, x0, x1, y0, y1, k = 1) {
  const W = L.u1 - L.u0, D = L.v1 - L.v0;
  const cu = L.u0 + W * (x0 + x1) / 2, cv = L.v0 + D * (y0 + y1) / 2, w = W * (x1 - x0) * Math.sqrt(k), d = D * (y1 - y0) * Math.sqrt(k);
  return { u0: cu - w / 2, u1: cu + w / 2, v0: cv - d / 2, v1: cv + d / 2 };
}
const area = (r) => (r.u1 - r.u0) * (r.v1 - r.v0);
const inner = (lot, s = SB) => ({ u0: lot.u0 + s, u1: lot.u1 - s, v0: lot.v0 + s, v1: lot.v1 - s });

// ---------- 용도별 배치 ----------
// 타워형 (오피스·호텔): 남측 포디움 + 북측 타워 1~3동
function towerLot(blk, L, gfaLot, p, u, warn) {
  const out = [], W = L.u1 - L.u0, D = L.v1 - L.v0, hotel = u.kind === 'hotel';
  const podFl = Math.max(0, p.podium);
  const podR = { u0: L.u0 + W * 0.05, u1: L.u1 - W * 0.05, v0: L.v1 - Math.min(D * 0.48, 62), v1: L.v1 };
  const podUse = hotel ? 'banquet' : 'retail';
  const tw = Math.sqrt(p.plate * 1.2), td = p.plate / tw;
  let n = clamp(Math.round(W / (tw + 30)), 1, 3);
  const podGfa = podFl ? area(podR) * 0.8 * podFl : 0;
  const towerGfa = Math.max(p.plate * 6, gfaLot - podGfa);
  const typUse = hotel ? 'hotel' : 'office';
  let F = Math.ceil(towerGfa / n / p.plate) + 1;
  while (F > p.maxFloors && n < 3 && (n + 1) * (tw + 24) <= W) { n++; F = Math.ceil(towerGfa / n / p.plate) + 1; }
  if (F > p.maxFloors) { warn.push(`${blk.id}: 목표 연면적을 ${p.maxFloors}층 안에 담지 못해 용적률이 낮아짐`); F = p.maxFloors; }
  F = Math.max(F, podFl + 4);
  const est = 9 + F * p.hTyp, ref = new Set(refugeLevels(F, est));
  const spec = [{ use: 'lobby', h: hotel ? 7 : 9 }];
  for (let lv = 2; lv <= F; lv++) {
    if (ref.has(lv)) spec.push({ use: 'refuge', h: 4.5 });
    else if (hotel && lv <= 3) spec.push({ use: 'banquet', h: 6.5 });
    else spec.push({ use: typUse, h: p.hTyp, units: hotel ? Math.round(p.plate * 0.66 / 36) : 0 });
  }
  const taper = (lv) => (F >= 45 && lv > F * 0.7 ? 0.9 : 1);
  const us = n === 1 ? [(L.u0 + L.u1) / 2] : Array.from({ length: n }, (_, i) => L.u0 + tw / 2 + 6 + (W - tw - 12) * i / (n - 1));
  us.forEach((uc, i) => {
    const r = { u0: uc - tw / 2, u1: uc + tw / 2, v0: L.v0 + 6, v1: L.v0 + 6 + td };
    const fl = stack(spec.map((s, k) => ({ ...s, s: taper(k + 1) })), p.plate, { roof: { h: 7, area: p.plate * 0.35 } });
    out.push(B(blk, hotel ? 'hotel' : 'office', r, fl, { tag: 'T', coreDims: [Math.max(10, tw * 0.38), Math.max(10, td * 0.4)] }));
  });
  if (podFl) {
    const towersInPod = out.reduce((s, b) => s + Math.max(0, Math.min(b.rect.v1, podR.v1) - Math.max(b.rect.v0, podR.v0)) * (b.rect.u1 - b.rect.u0), 0);
    const pa = Math.max(0, area(podR) - towersInPod);
    out.push(B(blk, 'podium', podR, stack([{ use: 'lobby', h: 6.5 }, { use: podUse, h: 6, n: podFl - 1 }], pa), { tag: 'P', span: 10, coreDims: [0, 0] }));
  }
  return out;
}
// 복합몰: 동·서 판매동 + 가운데 아트리움 + 옥상 주차
function mallLot(blk, L, gfaLot, p) {
  const W = L.u1 - L.u0, D = L.v1 - L.v0;
  const fpTarget = gfaLot / clamp(p.maxFloors, 2, 8);
  const k = clamp(fpTarget / (W * D * 0.78), 0.35, 1);
  const r = fr(L, 0.03, 0.97, 0.08, 0.92, k);
  const gap = Math.min(26, (r.u1 - r.u0) * 0.12), mid = (r.u0 + r.u1) / 2;
  const F = clamp(p.maxFloors, 2, 8);
  const spec = [{ use: 'retail', h: 7 }, { use: 'retail', h: p.hTyp, n: Math.max(0, F - 3) }, { use: 'hall', h: 8 }, { use: 'parking', h: 4.5 }];
  const west = { u0: r.u0, u1: mid - gap / 2, v0: r.v0, v1: r.v1 }, east = { u0: mid + gap / 2, u1: r.u1, v0: r.v0, v1: r.v1 };
  const Ht = spec.reduce((s, x) => s + x.h * (x.n ?? 1), 0) - 4.5;
  return [
    B(blk, 'mall', west, stack(spec, area(west)), { tag: 'W', span: 11, coreDims: [0, 0] }),
    B(blk, 'mall', east, stack(spec, area(east)), { tag: 'E', span: 11, coreDims: [0, 0] }),
    B(blk, 'atrium', { u0: mid - gap / 2, u1: mid + gap / 2, v0: r.v0 + 6, v1: r.v1 - 6 }, stack([{ use: 'lobby', h: Ht }], gap * (r.v1 - r.v0 - 12)), { tag: 'A', coreDims: [0, 0], span: 12 }),
  ];
}
// 박물관: 마당을 둘러싼 전시동·수장고·교육동·로비 (살짝 비튼 배치)
function museumLot(blk, L, gfaLot, p) {
  const tpl = [
    ['gallery', 0.04, 0.54, 0.08, 0.5, 0.10, [{ use: 'gallery', h: 7.5, n: 2 }, { use: 'gallery', h: 6 }]],
    ['store', 0.6, 0.96, 0.08, 0.4, -0.05, [{ use: 'store', h: 6, n: 2 }]],
    ['admin', 0.6, 0.94, 0.56, 0.92, 0, [{ use: 'admin', h: 4.5, n: 3 }]],
    ['lobby', 0.16, 0.58, 0.6, 0.84, 0.04, [{ use: 'lobby', h: 9 }]],
  ];
  const W = L.u1 - L.u0, D = L.v1 - L.v0;
  const tplGfa = tpl.reduce((s, t) => s + W * (t[2] - t[1]) * D * (t[4] - t[3]) * t[6].reduce((a, x) => a + (x.n || 1), 0), 0);
  const k = clamp(gfaLot / tplGfa * (p.scale || 100) / 100, 0.3, 1.1);
  return tpl.map(([kind, x0, x1, y0, y1, a, spec]) => {
    const r = fr(L, x0, x1, y0, y1, k);
    return B(blk, kind, r, stack(spec, area(r) * (kind === 'gallery' ? 0.92 : 1)), { tag: kind[0].toUpperCase(), a, span: kind === 'gallery' ? 18 : 9, coreDims: [0, 0] });
  });
}
// 아레나: 원통 볼 + 남측 F&B 포디움
function arenaLot(blk, L, gfaLot, p) {
  const W = L.u1 - L.u0, D = L.v1 - L.v0;
  const dia = Math.min(p.seats || 150, W * 0.8, D * 0.72);
  const cu = (L.u0 + L.u1) / 2, cv = L.v0 + D * 0.42;
  const r = { u0: cu - dia / 2, u1: cu + dia / 2, v0: cv - dia / 2, v1: cv + dia / 2 };
  const A = Math.PI * dia * dia / 4;
  const bowl = stack([{ use: 'lobby', h: 8 }, { use: 'hall', h: 10, n: 2 }, { use: 'hall', h: 13, s: 0.94 }], A);
  bowl.forEach(f => { if (f.use === 'hall') f.units = Math.round(A * f.s * f.s / 3.2); });
  const pod = { u0: L.u0 + W * 0.12, u1: L.u1 - W * 0.12, v0: L.v1 - D * 0.16, v1: L.v1 - 2 };
  return [
    B(blk, 'arena', r, bowl, { shape: 'cyl', tag: 'A', coreDims: [0, 0] }),
    B(blk, 'podium', pod, stack([{ use: 'retail', h: 6, n: 2 }], area(pod)), { tag: 'P', span: 9, coreDims: [0, 0] }),
  ];
}
// 종합병원: 진료 포디움(남) + 병동 타워 2동(북, 판상)
function hospitalLot(blk, L, gfaLot, p) {
  const W = L.u1 - L.u0, D = L.v1 - L.v0, out = [];
  const podFl = clamp(p.podium, 2, 7);
  const pod = { u0: L.u0 + W * 0.04, u1: L.u1 - W * 0.04, v0: L.v0 + D * 0.42, v1: L.v1 - D * 0.04 };
  const podGfa = area(pod) * podFl;
  const tw = Math.sqrt(p.plate * 2.6), td = p.plate / tw;
  const n = W > 2 * tw + 30 ? 2 : 1;
  const wardGfa = Math.max(p.plate * 6, gfaLot - podGfa);
  const wardFl = clamp(Math.ceil(wardGfa / n / p.plate), 4, Math.max(4, p.maxFloors - podFl));
  const us = n === 1 ? [(L.u0 + L.u1) / 2] : [L.u0 + W * 0.27, L.u1 - W * 0.27];
  us.forEach((uc) => {
    const r = { u0: uc - tw / 2, u1: uc + tw / 2, v0: L.v0 + D * 0.06, v1: L.v0 + D * 0.06 + td };
    const fl = stack([{ use: 'lobby', h: 6 }, { use: 'clinic', h: 4.8, n: podFl - 1 }, { use: 'ward', h: p.hTyp, n: wardFl, units: Math.round(p.plate * 0.6 / 26) }], p.plate, { roof: { h: 6, area: p.plate * 0.3 } });
    out.push(B(blk, 'ward', r, fl, { tag: 'W', coreDims: [tw * 0.2, td * 0.5] }));
  });
  out.push(B(blk, 'clinic', pod, stack([{ use: 'lobby', h: 6 }, { use: 'clinic', h: 4.8, n: podFl - 1 }], area(pod)), { tag: 'C', span: 8.4, coreDims: [0, 0] }));
  return out;
}
// R&D 캠퍼스: 남북 두 줄 연구동 + 가운데 지원동
function campusLot(blk, L, gfaLot, p) {
  const tpl = [[0.04, 0.46, 0.06, 0.24], [0.54, 0.96, 0.06, 0.24], [0.04, 0.46, 0.74, 0.92], [0.54, 0.96, 0.74, 0.92]];
  const W = L.u1 - L.u0, D = L.v1 - L.v0;
  const foot = tpl.reduce((s, t) => s + W * (t[1] - t[0]) * D * (t[3] - t[2]), 0);
  const F = clamp(Math.round(gfaLot * 0.9 / foot), 2, p.maxFloors);
  const out = tpl.map(([x0, x1, y0, y1], i) => {
    const r = fr(L, x0, x1, y0, y1);
    return B(blk, 'lab', r, stack([{ use: 'lobby', h: 6 }, { use: 'lab', h: p.hTyp, n: F - 1 }], area(r), { roof: { h: 5, area: area(r) * 0.25 } }), { tag: 'L', span: 9, coreDims: [10, 8] });
  });
  const c = fr(L, 0.36, 0.64, 0.38, 0.6);
  out.push(B(blk, 'admin', c, stack([{ use: 'lobby', h: 7 }, { use: 'admin', h: 4.2, n: 3 }], area(c)), { tag: 'C', span: 9, coreDims: [8, 8] }));
  return out;
}
// 반도체 팹: 팹동(4개 층) + CUB + 사무동 + 폐수 + 가스 야드 + 변전
function fabLot(blk, L, p, kind) {
  const k = clamp((p.scale || 100) / 100, 0.5, 1.15);
  if (kind === 'support') {
    const r1 = fr(L, 0.05, 0.6, 0.08, 0.4, k), r2 = fr(L, 0.66, 0.95, 0.08, 0.6, k), r3 = fr(L, 0.05, 0.45, 0.55, 0.9, k);
    return [
      B(blk, 'admin', r1, stack([{ use: 'lobby', h: 6 }, { use: 'admin', h: 4.2, n: 7 }], area(r1)), { tag: 'O', span: 9, coreDims: [14, 10] }),
      B(blk, 'whs', r2, stack([{ use: 'whs', h: 10, n: 3 }], area(r2)), { tag: 'S', span: 12, coreDims: [0, 0] }),
      B(blk, 'admin', r3, stack([{ use: 'parking', h: 3.4, n: 5 }], area(r3)), { tag: 'G', name: '주차동', span: 8.4, coreDims: [0, 0] }),
    ];
  }
  const fab = fr(L, 0.03, 0.68, 0.05, 0.6, k);
  const out = [B(blk, 'fab', fab, stack([{ use: 'subfab', h: 8 }, { use: 'subfab', h: 7 }, { use: 'fab', h: p.clean || 11 }, { use: 'mech', h: 7 }], area(fab)), { tag: 'FAB', span: 12, coreDims: [0, 0] })];
  const cub = fr(L, 0.72, 0.97, 0.05, 0.44, k);
  out.push(B(blk, 'cub', cub, stack([{ use: 'cub', h: 10, n: 3 }], area(cub)), { tag: 'CUB', span: 10, coreDims: [0, 0] }));
  const off = fr(L, 0.72, 0.97, 0.5, 0.6, k);
  out.push(B(blk, 'admin', off, stack([{ use: 'lobby', h: 6 }, { use: 'admin', h: 4.2, n: 7 }], area(off)), { tag: 'O', span: 9, coreDims: [12, 8] }));
  const wwt = fr(L, 0.03, 0.3, 0.7, 0.96, k);
  out.push(B(blk, 'wwt', wwt, stack([{ use: 'basin', h: 8 }], area(wwt)), { tag: 'WW', span: 12, coreDims: [0, 0] }));
  const sub = fr(L, 0.66, 0.9, 0.7, 0.95, k);
  out.push(B(blk, 'elec', sub, stack([{ use: 'elec', h: 9, n: 2 }], area(sub)), { tag: 'SS', span: 10, coreDims: [0, 0] }));
  // 가스·케미컬 탱크 2×4
  const g = fr(L, 0.35, 0.62, 0.7, 0.96, 1), gw = g.u1 - g.u0, gd = g.v1 - g.v0, dia = Math.min(9, gw / 5, gd / 3);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    const cu = g.u0 + gw * (i + 0.5) / 4, cv = g.v0 + gd * (j + 0.5) / 2;
    out.push(B(blk, 'tank', { u0: cu - dia / 2, u1: cu + dia / 2, v0: cv - dia / 2, v1: cv + dia / 2 }, tiers('tank', 16, dia, 4), { shape: 'cyl', tag: 'GT', coreDims: [0, 0] }));
  }
  return out;
}
// 이차전지·바이오 공장
function factoryLot(blk, L, p, u) {
  const k = clamp((p.scale || 100) / 100, 0.5, 1.15), out = [];
  const box = (kind, x0, x1, y0, y1, spec, tag, span = 12) => { const r = fr(L, x0, x1, y0, y1, k); out.push(B(blk, kind, r, stack(spec, area(r)), { tag, span, coreDims: [0, 0] })); };
  if (u.kind === 'bio') {
    box('gmp', 0.04, 0.6, 0.06, 0.55, [{ use: 'gmp', h: 7 }, { use: 'gmp', h: 6, n: 3 }], 'GMP', 9);
    box('lab', 0.66, 0.96, 0.06, 0.3, [{ use: 'lobby', h: 5 }, { use: 'lab', h: 4.5, n: 4 }], 'QC', 9);
    box('cub', 0.66, 0.96, 0.36, 0.55, [{ use: 'cub', h: 9, n: 2 }], 'U');
    box('whs', 0.04, 0.4, 0.64, 0.95, [{ use: 'whs', h: 12, n: 2 }], 'S');
    box('wwt', 0.46, 0.64, 0.64, 0.95, [{ use: 'basin', h: 7 }], 'WW');
    const g = fr(L, 0.7, 0.96, 0.64, 0.95), dia = Math.min(7, (g.u1 - g.u0) / 4);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const cu = g.u0 + (g.u1 - g.u0) * (i + 0.5) / 3, cv = g.v0 + (g.v1 - g.v0) * (j + 0.5) / 2; out.push(B(blk, 'tank', { u0: cu - dia / 2, u1: cu + dia / 2, v0: cv - dia / 2, v1: cv + dia / 2 }, tiers('tank', 14, dia, 4.5), { shape: 'cyl', tag: 'TK', coreDims: [0, 0] })); }
    return out;
  }
  box('prod', 0.03, 0.97, 0.05, 0.34, [{ use: 'prod', h: 12, n: 2 }], 'EL');
  box('prod', 0.03, 0.97, 0.4, 0.66, [{ use: 'prod', h: 10, n: 2 }], 'AS');
  box('prod', 0.03, 0.54, 0.72, 0.96, [{ use: 'prod', h: 7, n: 3 }], 'FM');
  box('whs', 0.6, 0.8, 0.72, 0.96, [{ use: 'whs', h: 12, n: 2 }], 'S');
  box('cub', 0.84, 0.97, 0.72, 0.96, [{ use: 'cub', h: 9, n: 2 }], 'U');
  return out;
}
// 데이터센터: 데이터홀 2동 + 변전 + 냉동기동 + 발전기 줄 + 연료 탱크 + 관리동
function dcLot(blk, L, p) {
  const k = clamp((p.scale || 100) / 100, 0.5, 1.15), out = [];
  const F = clamp(p.maxFloors, 2, 8);
  [[0.04, 0.47], [0.53, 0.96]].forEach(([x0, x1], i) => {
    const r = fr(L, x0, x1, 0.05, 0.54, k);
    out.push(B(blk, 'dhall', r, stack([{ use: 'elec', h: 7 }, { use: 'dhall', h: 6, n: F - 1 }], area(r), { roof: { h: 6, area: area(r) * 0.55 } }), { tag: 'DH', span: 12, coreDims: [0, 0] }));
  });
  const sub = fr(L, 0.04, 0.36, 0.62, 0.95, k); out.push(B(blk, 'elec', sub, stack([{ use: 'elec', h: 10, n: 2 }], area(sub)), { tag: 'SS', span: 10, coreDims: [0, 0] }));
  const ch = fr(L, 0.42, 0.66, 0.62, 0.95, k); out.push(B(blk, 'cub', ch, stack([{ use: 'cub', h: 9, n: 2 }], area(ch)), { tag: 'CH', span: 10, coreDims: [0, 0] }));
  const g = fr(L, 0.71, 0.96, 0.62, 0.78);
  for (let i = 0; i < 6; i++) { const u0 = g.u0 + (g.u1 - g.u0) * i / 6 + 1; out.push(B(blk, 'gen', { u0, u1: u0 + (g.u1 - g.u0) / 6 - 2, v0: g.v0, v1: g.v1 }, stack([{ use: 'elec', h: 5 }], (g.u1 - g.u0) / 6 * (g.v1 - g.v0)), { tag: 'G', coreDims: [0, 0] })); }
  const t = fr(L, 0.71, 0.96, 0.82, 0.96), dia = Math.min(6, (t.u1 - t.u0) / 4.5);
  for (let i = 0; i < 4; i++) { const cu = t.u0 + (t.u1 - t.u0) * (i + 0.5) / 4, cv = (t.v0 + t.v1) / 2; out.push(B(blk, 'tank', { u0: cu - dia / 2, u1: cu + dia / 2, v0: cv - dia / 2, v1: cv + dia / 2 }, tiers('tank', 7, dia, 3.5), { shape: 'cyl', tag: 'FT', coreDims: [0, 0] })); }
  return out;
}
// 물류센터: 다층 창고 + 램프동 + 사무동
function logisticsLot(blk, L, gfaLot, p) {
  const F = clamp(p.levels, 1, 7);
  const r = fr(L, 0.03, 0.84, 0.08, 0.8), ramp = fr(L, 0.86, 0.98, 0.08, 0.8), off = fr(L, 0.03, 0.32, 0.84, 0.98);
  return [
    B(blk, 'whs', r, stack([{ use: 'whs', h: 11 }, { use: 'whs', h: 10, n: F - 1 }], area(r)), { tag: 'W', span: 11, coreDims: [0, 0] }),
    B(blk, 'ramp', ramp, stack([{ use: 'ramp', h: 11 }, { use: 'ramp', h: 10, n: F - 1 }], area(ramp) * 0.7), { tag: 'R', span: 12, coreDims: [0, 0] }),
    B(blk, 'admin', off, stack([{ use: 'lobby', h: 5 }, { use: 'admin', h: 4, n: 3 }], area(off)), { tag: 'O', span: 8, coreDims: [8, 6] }),
  ];
}
// 석유화학: 공정 블록(분해로·탑·반응기·랙·압축기·제어실) / 저장 블록(탱크) / 유틸리티 블록
function chemLot(blk, L, p, role, first) {
  const out = [], W = L.u1 - L.u0, D = L.v1 - L.v0;
  if (role === 'proc') {
    const fu = fr(L, 0.04, 0.6, 0.05, 0.2); out.push(B(blk, 'furnace', fu, stack([{ use: 'process', h: 9, n: 3 }], area(fu)), { tag: 'FU', span: 9, coreDims: [0, 0] }));
    const cp = fr(L, 0.65, 0.96, 0.05, 0.22); out.push(B(blk, 'comp', cp, stack([{ use: 'process', h: 12, n: 2 }], area(cp)), { tag: 'CP', span: 12, coreDims: [0, 0] }));
    const rk = fr(L, 0.03, 0.97, 0.27, 0.33); out.push(B(blk, 'rack', rk, stack([{ use: 'rack', h: 6, n: 3 }], area(rk)), { shape: 'rack', tag: 'PR', coreDims: [0, 0] }));
    const Hs = [0.6, 0.85, 1, 0.5, 0.72, 0.42].map(x => x * (p.tower || 100));
    Hs.forEach((H, i) => {
      const dia = 6 + (i % 3) * 1.5, cu = L.u0 + W * (0.08 + i * 0.12), cv = L.v0 + D * 0.42;
      out.push(B(blk, 'column', { u0: cu - dia / 2, u1: cu + dia / 2, v0: cv - dia / 2, v1: cv + dia / 2 }, tiers('process', H, dia, 8), { shape: 'cyl', tag: 'C', coreDims: [0, 0] }));
    });
    for (let i = 0; i < 4; i++) { const dia = 5, cu = L.u0 + W * (0.1 + i * 0.12), cv = L.v0 + D * 0.58; out.push(B(blk, 'column', { u0: cu - dia / 2, u1: cu + dia / 2, v0: cv - dia / 2, v1: cv + dia / 2 }, tiers('process', 24, dia, 6), { shape: 'cyl', tag: 'R', name: '반응기·드럼', coreDims: [0, 0] })); }
    const cr = fr(L, 0.72, 0.96, 0.74, 0.95); out.push(B(blk, 'admin', cr, stack([{ use: 'admin', h: 5, n: 2 }], area(cr)), { tag: 'CR', name: '중앙 제어실', span: 8, coreDims: [0, 0] }));
    if (first) { const cu = L.u1 - 14, cv = L.v1 - 14; out.push(B(blk, 'stack', { u0: cu - 1.6, u1: cu + 1.6, v0: cv - 1.6, v1: cv + 1.6 }, tiers('stack', 110, 3.2, 10), { shape: 'cyl', tag: 'FL', name: '플레어 스택', coreDims: [0, 0] })); }
    return out;
  }
  if (role === 'tank') {
    const dia = clamp(Math.min(W, D) / 4.2, 18, 42), gap = dia * 0.55;
    const nx = Math.max(1, Math.floor((W + gap) / (dia + gap))), ny = Math.max(1, Math.floor((D + gap) / (dia + gap)));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const cu = L.u0 + (W - (nx * dia + (nx - 1) * gap)) / 2 + dia / 2 + i * (dia + gap), cv = L.v0 + (D - (ny * dia + (ny - 1) * gap)) / 2 + dia / 2 + j * (dia + gap);
      const sphere = (i + j) % 4 === 3, d2 = sphere ? dia * 0.55 : dia;
      out.push(B(blk, 'tank', { u0: cu - d2 / 2, u1: cu + d2 / 2, v0: cv - d2 / 2, v1: cv + d2 / 2 }, tiers('tank', sphere ? d2 : 20, d2, 5), { shape: 'cyl', tag: 'TK', name: sphere ? 'LPG 구형 탱크' : '원유·제품 탱크', coreDims: [0, 0] }));
    }
    return out;
  }
  const tb = fr(L, 0.04, 0.42, 0.06, 0.32); out.push(B(blk, 'turbine', tb, stack([{ use: 'turbine', h: 12, n: 2 }], area(tb)), { tag: 'ST', name: '스팀·발전동', span: 12, coreDims: [0, 0] }));
  for (let i = 0; i < 2; i++) { const r = fr(L, 0.48 + i * 0.13, 0.58 + i * 0.13, 0.06, 0.3); out.push(B(blk, 'hrsg', r, stack([{ use: 'hrsg', h: 8, n: 4 }], area(r)), { tag: 'BL', name: '보일러', span: 8, coreDims: [0, 0] })); }
  const ct = fr(L, 0.04, 0.6, 0.44, 0.58); out.push(B(blk, 'cool', ct, stack([{ use: 'cub', h: 16 }], area(ct)), { tag: 'CT', span: 12, coreDims: [0, 0] }));
  const ww = fr(L, 0.04, 0.5, 0.68, 0.96); out.push(B(blk, 'wwt', ww, stack([{ use: 'basin', h: 7 }], area(ww)), { tag: 'WW', span: 12, coreDims: [0, 0] }));
  const ad = fr(L, 0.62, 0.95, 0.7, 0.95); out.push(B(blk, 'admin', ad, stack([{ use: 'admin', h: 4.5, n: 3 }], area(ad)), { tag: 'AD', span: 8, coreDims: [8, 6] }));
  return out;
}
// 발전: 터빈동 + HRSG 2기 + 연돌 + 변전 + 냉각탑 + 수소 탱크
function powerLot(blk, L, p, first) {
  const out = [], W = L.u1 - L.u0, D = L.v1 - L.v0;
  const tb = fr(L, 0.06, 0.52, 0.08, 0.3); out.push(B(blk, 'turbine', tb, stack([{ use: 'turbine', h: 11, n: 3 }], area(tb)), { tag: 'TB', span: 12, coreDims: [0, 0] }));
  [0, 1].forEach(i => {
    const r = fr(L, 0.08 + i * 0.22, 0.24 + i * 0.22, 0.38, 0.56); out.push(B(blk, 'hrsg', r, stack([{ use: 'hrsg', h: 8, n: 5 }], area(r)), { tag: 'HR', span: 8, coreDims: [0, 0] }));
    const cu = (r.u0 + r.u1) / 2, cv = r.v1 + 12, dia = 8;
    out.push(B(blk, 'stack', { u0: cu - dia / 2, u1: cu + dia / 2, v0: cv - dia / 2, v1: cv + dia / 2 }, tiers('stack', 80, dia, 8), { shape: 'cyl', tag: 'ST', name: '연돌', coreDims: [0, 0] }));
  });
  const sw = fr(L, 0.6, 0.95, 0.08, 0.4); out.push(B(blk, 'elec', sw, stack([{ use: 'elec', h: 12 }], area(sw)), { tag: 'SW', name: '변전·개폐소', span: 12, coreDims: [0, 0] }));
  const ct = fr(L, 0.06, 0.6, 0.76, 0.95); out.push(B(blk, 'cool', ct, stack([{ use: 'cub', h: 18 }], area(ct)), { tag: 'CT', span: 12, coreDims: [0, 0] }));
  const ad = fr(L, 0.66, 0.95, 0.8, 0.95); out.push(B(blk, 'admin', ad, stack([{ use: 'admin', h: 4.5, n: 3 }], area(ad)), { tag: 'AD', span: 8, coreDims: [8, 6] }));
  const t = fr(L, 0.64, 0.96, 0.5, 0.72), dia = Math.min(15, (t.u1 - t.u0) / 3.6);
  for (let i = 0; i < 3; i++) { const cu = t.u0 + (t.u1 - t.u0) * (i + 0.5) / 3, cv = (t.v0 + t.v1) / 2; out.push(B(blk, 'tank', { u0: cu - dia / 2, u1: cu + dia / 2, v0: cv - dia / 2, v1: cv + dia / 2 }, tiers('tank', dia, dia, 5), { shape: 'cyl', tag: 'H2', name: '수소·연료 탱크', coreDims: [0, 0] })); }
  return out;
}
// 수처리 (지하화): 지하 2개 층 수조 + 지상 관리동 + 소화조, 상부는 공원
function waterLot(blk, L, p) {
  const out = [];
  const ad = fr(L, 0.05, 0.32, 0.06, 0.24); out.push(B(blk, 'admin', ad, stack([{ use: 'lobby', h: 5 }, { use: 'admin', h: 4.5, n: 2 }], area(ad)), { tag: 'AD', span: 8, coreDims: [8, 6] }));
  const t = fr(L, 0.62, 0.96, 0.06, 0.4), dia = Math.min(22, (t.u1 - t.u0) / 2.4);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const cu = t.u0 + (t.u1 - t.u0) * (i + 0.5) / 2, cv = t.v0 + (t.v1 - t.v0) * (j + 0.5) / 2; out.push(B(blk, 'digester', { u0: cu - dia / 2, u1: cu + dia / 2, v0: cv - dia / 2, v1: cv + dia / 2 }, tiers('tank', 24, dia, 6), { shape: 'cyl', tag: 'DG', coreDims: [0, 0] })); }
  return out;
}

// 블록 지하층: 주차 또는 용도별 지하 시설
function basementOf(blk, L, bldgs, p, u, gen) {
  const n = p.basement | 0; if (n <= 0) return null;
  // 산업·플랜트: 주 건물 바닥 아래만 얕게 (피트·공동구), 수처리: 획지 대부분을 깊게
  let rect = { u0: L.u0 + 2, u1: L.u1 - 2, v0: L.v0 + 2, v1: L.v1 - 2 };
  const main = bldgs.filter(b => b.shape === 'box' && ['fab', 'prod', 'gmp', 'dhall', 'whs', 'furnace', 'turbine'].includes(b.kind)).sort((a, b) => b.plate - a.plate)[0];
  if (main && u.gen !== 'logistics') rect = { ...main.rect };
  const foot = (rect.u1 - rect.u0) * (rect.v1 - rect.v0) * (u.id === 'water' ? 0.92 : 0.9);
  let spaces = 0;
  bldgs.forEach(b => b.floors.forEach(f => { if (f.lv > 0) spaces += f.area / (u.id === 'hotel' ? 260 : u.id === 'retail' ? 120 : u.id === 'hospital' ? 140 : ['office', 'lab'].includes(u.id) ? 200 : 600); }));
  spaces = Math.ceil(spaces);
  const floors = [];
  const ind = ['fab', 'factory', 'dc', 'logistics', 'plant'].includes(gen) && u.id !== 'water';
  for (let i = 0; i < n; i++) {
    let use = i === 0 ? 'b1' : 'parking', h = i === 0 ? 5 : 3.6;
    if (u.id === 'water') { use = 'basin'; h = 8; }
    else if (ind) { use = 'mech'; h = i === 0 ? 5 : 4; }
    else if (u.id === 'museum' && i === 0) { use = 'store'; h = 6; }
    else if (u.id === 'hospital' && i === 0) { use = 'clinic'; h = 5.5; }
    floors.push({ lv: -1 - i, name: 'B' + (1 + i), use, h, area: foot, units: 0, s: 1 });
  }
  let y = 0; floors.forEach(f => { f.y1 = y; y -= f.h; f.y0 = y; });
  const cyl = false;
  return { id: `${blk.id}-B`, block: blk.id, zone: blk.zone, kind: 'basement', spaces: ind || u.id === 'water' ? 0 : spaces, rect, parts: [part(rect.u0, rect.u1, rect.v0, rect.v1)], shape: 'box',
    core: { u: (rect.u0 + rect.u1) / 2, v: (rect.v0 + rect.v1) / 2 }, perim: 2 * (rect.u1 - rect.u0 + rect.v1 - rect.v0), plate: foot, floors, cyl };
}

// 블록 역할: 용도별 (예: 플랜트는 공정 → 저장 → 유틸리티 순환)
const ROLE_NAME = { main: '주 시설', sup: '지원 시설', proc: '공정 블록', tank: '저장 블록', util: '유틸리티 블록', future: '증설 예정지' };
const ROLE_PREFIX = { main: 'A', sup: 'S', proc: 'P', tank: 'T', util: 'U', future: 'X' };
function rolesFor(u, n, p) {
  if (u.gen === 'fab') return Array.from({ length: n }, (_, i) => (i < Math.min(p.lines, n - (n > 1 ? 1 : 0)) ? 'main' : i === Math.min(p.lines, n - 1) ? 'sup' : 'future'));
  if (u.gen === 'plant' && u.kind === 'chem') { const cyc = ['proc', 'tank', 'util']; return Array.from({ length: n }, (_, i) => (i < (p.trains || 2) * 3 ? cyc[i % 3] : 'future')); }
  if (u.gen === 'plant' && u.kind === 'power') return Array.from({ length: n }, (_, i) => (i < (p.trains || 2) ? 'main' : 'future'));
  return Array.from({ length: n }, () => 'main');
}

// ---------- 전체 ----------
export function generateX(pIn) {
  const u = useOf(pIn.use);
  const p = { ...(XDEF[u.id] || {}), ...pIn };
  const site = pIn.site;
  const cell = CELL_BY_KIND[u.kind] || CELL[u.gen];
  const base = makePlan({ ...site, cell, netRatio: u.net, resShare: 100, units: 0, use: u.id });
  const warn = [];
  // 블록 역할을 정해 계획을 복제 (캐시된 계획은 건드리지 않음)
  const lotsSorted = [...base.BLOCKS].sort((a, b) => (a.cell.v0 - b.cell.v0) || (a.cell.u0 - b.cell.u0));
  const roles = rolesFor(u, lotsSorted.length, p);
  const cnt = {};
  const BLOCKS = lotsSorted.map((b, i) => { const role = roles[i]; cnt[role] = (cnt[role] || 0) + 1; return { ...b, zone: role, id: ROLE_PREFIX[role] + cnt[role] }; });
  const ZONES = {};
  BLOCKS.forEach(b => { if (!ZONES[b.zone]) ZONES[b.zone] = { key: b.zone, name: (b.zone === 'main' ? u.name + ' ' : '') + ROLE_NAME[b.zone], area: 0, color: '--res' }; ZONES[b.zone].area += b.area; });
  const plan = { ...base, ZONES, BLOCKS, blockById: new Map(BLOCKS.map(b => [b.id, b])), useId: u.id };
  SEQ = 0;
  const bldgs = [];
  let firstProc = true;
  BLOCKS.forEach(blk => {
    const L = inner(blk.lot);
    const gfaLot = blk.area * p.far / 100;
    let list = [];
    switch (u.gen) {
      case 'tower': list = towerLot(blk, L, gfaLot, p, u, warn); break;
      case 'mall': list = mallLot(blk, L, gfaLot, p); break;
      case 'museum': list = museumLot(blk, L, gfaLot, p); break;
      case 'arena': list = arenaLot(blk, L, gfaLot, p); break;
      case 'hospital': list = hospitalLot(blk, L, gfaLot, p); break;
      case 'campus': list = campusLot(blk, L, gfaLot, p); break;
      case 'fab': if (blk.zone !== 'future') list = fabLot(blk, L, p, blk.zone === 'sup' ? 'support' : 'fab'); break;
      case 'factory': list = factoryLot(blk, L, p, u); break;
      case 'dc': list = dcLot(blk, L, p); break;
      case 'logistics': list = logisticsLot(blk, L, gfaLot, p); break;
      case 'plant':
        if (blk.zone === 'future') break;
        if (u.kind === 'chem') { list = chemLot(blk, L, p, blk.zone, blk.zone === 'proc' && firstProc); if (blk.zone === 'proc') firstProc = false; }
        else if (u.kind === 'power') list = powerLot(blk, L, p);
        else list = waterLot(blk, L, p);
        break;
      default: list = towerLot(blk, L, gfaLot, p, u, warn);
    }
    if (!list.length) return;
    bldgs.push(...list);
    const bs = basementOf(blk, L, list, p, u, u.gen);
    if (bs) bldgs.push(bs);
  });
  bldgs.forEach(b => {
    b.height = b.kind === 'basement' ? 0 : b.floors.filter(f => !f.roof).reduce((s, f) => s + f.h, 0);
    b.top = b.floors[b.floors.length - 1].y1;
    b.gfa = b.floors.reduce((s, f) => s + f.area, 0);
    b.units = b.floors.reduce((s, f) => s + f.units, 0);
    b.storeys = b.floors.filter(f => f.lv > 0 && !f.roof).length;
    b.basementLv = b.kind === 'basement' ? b.floors.length : 0;
    b.foot = b.kind === 'basement' ? b.plate : b.parts.reduce((s, q) => s + (b.shape === 'cyl' ? Math.PI * q.w * q.w / 4 : q.w * q.d), 0);
  });
  const blocks = BLOCKS.map(bl => {
    const inb = bldgs.filter(x => x.block === bl.id && x.kind !== 'basement');
    const gfaAbove = inb.reduce((s, b) => s + b.floors.filter(f => f.lv > 0).reduce((a, f) => a + f.area, 0), 0);
    const foot = inb.reduce((s, b) => s + b.foot, 0);
    const bs = bldgs.find(x => x.block === bl.id && x.kind === 'basement');
    return { id: bl.id, zone: bl.zone, area: bl.area, gfaAbove, far: gfaAbove / bl.area * 100, bcr: Math.min(100, foot / bl.area * 100), units: inb.reduce((s, b) => s + b.units, 0),
      maxFloors: Math.max(0, ...inb.map(b => b.storeys)), maxH: Math.max(0, ...inb.map(b => b.height)), parking: bs ? bs.spaces : 0, basementLv: bs ? bs.basementLv : 0, gfaBelow: bs ? bs.gfa : 0, n: inb.length };
  });
  const totals = summarizeX(bldgs, blocks, plan, u);
  const zoneOrder = u.gen === 'plant' && u.kind === 'chem' ? ['util', 'proc', 'tank'] : u.gen === 'fab' ? ['main', 'sup'] : ['main', 'sup'];
  return { p, use: u.id, x: true, plan, zones: plan.ZONES, site: plan.site, bldgs, blocks, totals, warnings: warn, violations: [], sky: [], zoneOrder };
}

export function summarizeX(bldgs, blocks, plan, u) {
  const t = { units: 0, apt: 0, officetel: 0, byType: {}, gfaAbove: 0, gfaBelow: 0, parking: 0, byUse: {}, maxH: 0, towers: 0, floorsByUse: {}, byForm: {}, byKind: {}, rental: 0 };
  bldgs.forEach(b => {
    if (b.kind !== 'basement') { t.towers++; t.byKind[b.kind] = (t.byKind[b.kind] || 0) + 1; }
    t.maxH = Math.max(t.maxH, b.height);
    b.floors.forEach(f => {
      if (f.lv > 0) t.gfaAbove += f.area; else t.gfaBelow += f.area;
      t.byUse[f.use] = (t.byUse[f.use] || 0) + f.area;
      t.floorsByUse[f.use] = (t.floorsByUse[f.use] || 0) + 1;
    });
    if (b.kind === 'basement') t.parking += b.spaces;
  });
  const lotArea = Object.values(plan.ZONES).reduce((s, z) => s + z.area, 0);
  t.lotArea = lotArea; t.far = t.gfaAbove / Math.max(1, lotArea) * 100;
  t.zones = Object.values(plan.ZONES).map(z => { const bl = blocks.filter(b => b.zone === z.key); const gfa = bl.reduce((s, b) => s + b.gfaAbove, 0); return { ...z, gfa, far: gfa / Math.max(1, z.area) * 100, units: 0, maxFloors: Math.max(0, ...bl.map(b => b.maxFloors)) }; });
  t.kpi = kpiOf(t, bldgs, u);
  return t;
}
// 용도별 대표 지표
function kpiOf(t, bldgs, u) {
  const A = (k) => t.byUse[k] || 0;
  const units = (k) => bldgs.reduce((s, b) => s + b.floors.filter(f => f.use === k).reduce((a, f) => a + f.units, 0), 0);
  switch (u.id) {
    case 'office': return { label: '업무 연면적', value: A('office'), unit: '㎡' };
    case 'hotel': return { label: '객실', value: units('hotel'), unit: '실' };
    case 'retail': return { label: '판매 면적', value: A('retail') + A('hall'), unit: '㎡' };
    case 'museum': return { label: '전시 면적', value: A('gallery'), unit: '㎡' };
    case 'arena': return { label: '좌석', value: units('hall'), unit: '석' };
    case 'hospital': return { label: '병상', value: units('ward'), unit: '병상' };
    case 'lab': return { label: '연구 면적', value: A('lab'), unit: '㎡' };
    case 'fab': return { label: '클린룸 면적', value: A('fab'), unit: '㎡' };
    case 'battery': return { label: '생산능력 (추정)', value: Math.round(A('prod') / 25000), unit: 'GWh' };
    case 'bio': return { label: '배양 용량 (추정)', value: Math.round(A('gmp') / 1000), unit: 'kL' };
    case 'dc': return { label: 'IT 용량 (추정)', value: Math.round(A('dhall') * 0.5 * 3 / 1000), unit: 'MW' };
    case 'logistics': return { label: '보관 면적', value: A('whs'), unit: '㎡' };
    case 'chem': return { label: '공정 블록', value: bldgs.filter(b => b.kind === 'furnace').length, unit: '계열' };
    case 'power': return { label: '발전 용량 (추정)', value: bldgs.filter(b => b.kind === 'turbine').length * 500, unit: 'MW' };
    case 'water': return { label: '처리 용량 (추정)', value: Math.round(A('basin') / 4000), unit: '만t/일' };
    default: return { label: '연면적', value: t.gfaAbove, unit: '㎡' };
  }
}
export const floorUseName = (k) => (FLOOR_USES[k] ? FLOOR_USES[k].name : null);
