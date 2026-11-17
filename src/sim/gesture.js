// 매스 제스처: 기준층을 그대로 쌓는 상자에서 벗어나, 층마다 판의 크기·위치·회전을 바꿔 건축적 형태를 만든다.
// 층(floor)마다 g = { sx, sz, ox, oz, rot } 를 붙인다.
//   sx·sz: 기준 판 대비 u(동서)·v(남북) 방향 배율, ox·oz: 판 중심 이동(기준 판 폭·깊이 대비 비율), rot: 회전(rad, u→v)
// 3D 매스(bim3d), 일조 상자(analysis), 물량(quantities), 시공 시뮬레이션(impact.sectionGeom → build3d.plan3d)이 모두 이 값을 읽는다.
// 실제 설계안 연동: specOf()로 내보낸 JSON(층별 판 크기·위치·회전)을 그대로 불러오면 '불러온 설계안(custom)' 형태로 같은 경로를 탄다.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const GESTURES = [
  { id: 'box', name: '박스', en: 'EXTRUSION', note: '기준층을 그대로 쌓은 정형 타워. 거푸집 반복이 가장 쉽습니다.' },
  { id: 'setback', name: '셋백', en: 'SETBACK', note: '리듬 층수마다 사방으로 한 번씩 물러나는 계단형 (1916 뉴욕 조닝형).', step: true },
  { id: 'taper', name: '테이퍼', en: 'TAPER', note: '위로 갈수록 가늘어져 풍하중과 그림자를 줄이는 형태.' },
  { id: 'terrace', name: '테라스', en: 'TERRACE', note: '남쪽 면이 리듬 층수마다 물러나 계단식 옥외 테라스가 생깁니다.', step: true },
  { id: 'shift', name: '엇갈린 적층', en: 'STACKED SHIFT', note: '층 묶음이 서로 어긋나게 쌓여 처마·테라스·그늘을 만듭니다.', step: true },
  { id: 'cantilever', name: '캔틸레버', en: 'CANTILEVER', note: '상부가 한쪽으로 크게 내밀어진 형태. 전이층·트러스가 필요합니다.' },
  { id: 'lean', name: '기울기', en: 'LEAN', note: '층마다 조금씩 밀려 전체가 비스듬히 기운 형태.' },
  { id: 'waist', name: '허리', en: 'HOURGLASS', note: '가운데가 잘록하고 위아래가 넓은 모래시계형.' },
  { id: 'bulge', name: '배흘림', en: 'ENTASIS', note: '가운데가 불룩하고 위아래가 좁은 시가형.' },
  { id: 'twist', name: '트위스트', en: 'TWIST', note: '층마다 조금씩 회전해 비틀린 타워. 층마다 기둥 위치가 달라집니다.' },
  { id: 'mix', name: '혼합', en: 'MIXED', note: '동마다 다른 제스처를 섞어 배치해 스카이라인에 변화를 줍니다.' },
];
export const GESTURE_BY_ID = Object.fromEntries(GESTURES.map(g => [g.id, g]));
export const GDEF = { gesture: 'box', gAmt: 50, gStep: 6 };
export const GMETA = {
  gAmt: { label: '제스처 강도', unit: '%', min: 0, max: 100, step: 5 },
  gStep: { label: '리듬 (층 묶음)', unit: '층', min: 2, max: 20, step: 1, note: '셋백·테라스·엇갈린 적층이 바뀌는 간격' },
};
const MIX = ['taper', 'setback', 'twist', 'shift', 'bulge', 'terrace', 'cantilever', 'waist', 'lean'];
const ID = { sx: 1, sz: 1, ox: 0, oz: 0, rot: 0 };

// 한 층의 제스처 값 (보정 전). t: 0(제스처 시작층)~1(최상층), k: 시작층부터 몇 번째 층, seed: 동 번호
export function gestureAt(id, t, k, amt, step, seed = 0) {
  const A = clamp(amt, 0, 1), st = Math.max(1, step | 0), tier = Math.floor(k / st);
  switch (id) {
    case 'setback': { const s = Math.max(0.42, 1 - A * 0.16 * tier); return { ...ID, sx: s, sz: s }; }
    case 'taper': { const s = 1 + A * 0.36 * (0.5 - t) * 2; return { ...ID, sx: s, sz: s }; }
    case 'terrace': { const sz = Math.max(0.38, 1 - A * 0.13 * tier); return { ...ID, sz, oz: -(1 - sz) / 2 }; }
    case 'shift': {
      const P = [[0, 0], [1, 0], [1, 1], [0, 1]], p = P[(tier + seed) % 4];
      return { ...ID, ox: (p[0] - 0.5) * A * 0.7, oz: (p[1] - 0.5) * A * 0.5 };
    }
    case 'cantilever': return t >= 0.62 ? { ...ID, ox: A * 0.5 } : { ...ID };
    case 'lean': return { ...ID, ox: A * 0.62 * t };
    case 'waist': { const s = 1 - A * 0.42 * Math.sin(Math.PI * t); return { ...ID, sx: s, sz: s }; }
    case 'bulge': { const s = 1 + A * 0.44 * (Math.sin(Math.PI * t) - 0.5); return { ...ID, sx: s, sz: s }; }
    case 'twist': return { ...ID, rot: (seed % 2 ? -1 : 1) * A * Math.PI * t };
    default: return { ...ID };
  }
}

// 동 하나에 제스처 적용. from: 제스처를 시작하는 층(lv, 포디움 위), keepArea: 평균 바닥면적을 기준층과 같게 맞춤
// custom: 불러온 설계안의 층별 값 [{sx,sz,ox,oz,rot}] (아래층부터)
export function applyGesture(b, p, { from = 1, seed = 0, keepArea = true, coreDims = null } = {}) {
  let id = p.gesture || 'box';
  if (id === 'mix') id = MIX[seed % MIX.length];
  const custom = id === 'custom' && Array.isArray(p.gCustom) && p.gCustom.length ? p.gCustom : null;
  if (id === 'box' || (id === 'custom' && !custom) || !GESTURE_BY_ID[id] && !custom) return b;
  const fl = b.floors.filter(f => f.lv >= from && !f.roof);
  if (fl.length < 2) return b;
  const amt = (p.gAmt ?? GDEF.gAmt) / 100 * (p.gesture === 'mix' ? 0.75 + (seed % 3) * 0.15 : 1), step = p.gStep ?? GDEF.gStep;
  const n = fl.length;
  const raw = fl.map((f, k) => {
    if (custom) { const c = custom[Math.min(custom.length - 1, Math.floor(k * custom.length / n))] || {}; return { sx: +c.sx || 1, sz: +c.sz || 1, ox: +c.ox || 0, oz: +c.oz || 0, rot: +c.rot || 0 }; }
    return gestureAt(id, n > 1 ? k / (n - 1) : 0, k, amt, step, seed);
  });
  // 평균 바닥면적 보정: 목표 연면적·층수가 그대로 유지되게
  if (keepArea && !custom) {
    const mean = raw.reduce((s, g) => s + g.sx * g.sz, 0) / n;
    if (mean > 0.05 && Math.abs(mean - 1) > 1e-3) { const k = 1 / Math.sqrt(mean); raw.forEach(g => { g.sx *= k; g.sz *= k; }); }
  }
  // 코어가 늘 판 안에 있도록 (코어는 기초에서 옥상까지 곧게 선다)
  const W = b.rect.u1 - b.rect.u0, D = b.rect.v1 - b.rect.v0;
  const [cw, cd] = coreDims || b.coreDims || [Math.max(10, W * 0.38), Math.max(10, D * 0.4)];
  const hu = Math.min(0.45, (cw || 0) / W / 2 + 0.04), hv = Math.min(0.45, (cd || 0) / D / 2 + 0.04);
  raw.forEach(g => {
    g.sx = clamp(g.sx, 2 * hu, 1.8); g.sz = clamp(g.sz, 2 * hv, 1.8);
    g.ox = clamp(g.ox, -(g.sx / 2 - hu), g.sx / 2 - hu); g.oz = clamp(g.oz, -(g.sz / 2 - hv), g.sz / 2 - hv);
  });
  fl.forEach((f, k) => { const g = raw[k]; f.g = g; f.area *= g.sx * g.sz; });
  // 옥탑은 최상층을 따라 움직인다
  const top = raw[n - 1], ph = b.floors.find(f => f.roof);
  if (ph) ph.g = { sx: 1, sz: 1, ox: top.ox, oz: top.oz, rot: top.rot };
  b.gesture = id; b.gestureName = custom ? '불러온 설계안' : GESTURE_BY_ID[id].name;
  return b;
}

// 층의 실제 판(부분별 상자): 3D·일조·단면이 같이 쓴다
export function floorParts(b, f) {
  const s = f.s || 1, g = f.g;
  if (!g) return b.parts.map(q => ({ cu: q.cu, cv: q.cv, w: q.w * s, d: q.d * s, a: q.a || 0, faces: q.faces }));
  const R = b.rect, cu0 = (R.u0 + R.u1) / 2, cv0 = (R.v0 + R.v1) / 2, W = R.u1 - R.u0, D = R.v1 - R.v0;
  const c = Math.cos(g.rot), sn = Math.sin(g.rot);
  return b.parts.map(q => {
    const du = (q.cu - cu0) * g.sx * s, dv = (q.cv - cv0) * g.sz * s;
    const a = q.a || 0, skew = Math.abs(Math.sin(a)) > 0.1 && Math.abs(Math.cos(a)) > 0.1;
    const kw = skew ? Math.sqrt(g.sx * g.sz) : Math.abs(Math.cos(a)) > 0.5 ? g.sx : g.sz, kd = skew ? kw : Math.abs(Math.cos(a)) > 0.5 ? g.sz : g.sx;
    return { cu: cu0 + du * c - dv * sn + g.ox * W, cv: cv0 + du * sn + dv * c + g.oz * D, w: q.w * s * kw, d: q.d * s * kd, a: a + g.rot, faces: q.faces };
  });
}
// 같은 판이 이어지는 층을 묶는 열쇠
export const formKey = (f) => (f.s || 1).toFixed(4) + (f.g ? `|${f.g.sx.toFixed(3)},${f.g.sz.toFixed(3)},${f.g.ox.toFixed(3)},${f.g.oz.toFixed(3)},${f.g.rot.toFixed(3)}` : '');
// 둘레 배율 (물량용)
export const perimK = (f) => (f.s || 1) * (f.g ? (f.g.sx + f.g.sz) / 2 : 1);
export const widthK = (f) => (f.s || 1) * (f.g ? Math.sqrt(f.g.sx * f.g.sz) : 1);

// 설계안 연동용 사양: 대표 동의 층별 판 (아래층부터). 다시 불러오면 gesture: 'custom', gCustom 으로 쓴다
export function specOf(b, p) {
  const fl = b.floors.filter(f => f.lv > 0 && !f.roof);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return {
    format: 'bim-ai-sim/mass-gesture@1',
    note: '층별 판 배율(sx·sz)·이동(ox·oz, 기준 판 폭·깊이 대비)·회전(rot, rad). 아래층부터. 이 JSON을 다시 불러오면 같은 형태로 시뮬레이션합니다.',
    gesture: b.gesture || p.gesture || 'box', amt: p.gAmt ?? GDEF.gAmt, step: p.gStep ?? GDEF.gStep,
    base: { w: r3(b.rect.u1 - b.rect.u0), d: r3(b.rect.v1 - b.rect.v0) },
    floors: fl.map(f => ({ lv: f.lv, h: r3(f.h), use: f.use, sx: r3(f.g ? f.g.sx : 1), sz: r3(f.g ? f.g.sz : 1), ox: r3(f.g ? f.g.ox : 0), oz: r3(f.g ? f.g.oz : 0), rot: r3(f.g ? f.g.rot : 0) })),
  };
}
// 불러온 JSON → 층별 값 목록 (형식이 맞지 않으면 null)
export function parseSpec(txt) {
  let j; try { j = typeof txt === 'string' ? JSON.parse(txt) : txt; } catch (e) { return null; }
  const fl = j && Array.isArray(j.floors) ? j.floors : Array.isArray(j) ? j : null;
  if (!fl || !fl.length) return null;
  const num = (v, d, a, b) => (Number.isFinite(+v) ? clamp(+v, a, b) : d);
  const out = fl.slice(0, 160).map(f => ({ sx: num(f.sx, 1, 0.2, 2), sz: num(f.sz, 1, 0.2, 2), ox: num(f.ox, 0, -1, 1), oz: num(f.oz, 0, -1, 1), rot: num(f.rot, 0, -Math.PI * 2, Math.PI * 2) }));
  return out;
}

// 갤러리 아이콘: 측면 실루엣(층 띠) — 대표 값으로 그린 작은 SVG
export function gestureIcon(id, { amt = 0.6, step = 4, n = 14 } = {}) {
  const W = 44, H = 56, base = 18, out = [];
  const ids = id === 'mix' ? ['taper', 'shift', 'twist'] : [id];
  ids.forEach((gid, j) => {
    const cx = ids.length > 1 ? 9 + j * 13 : W / 2, bw = ids.length > 1 ? 9 : base, nn = ids.length > 1 ? 8 + j * 3 : n, hh = (H - 6) / n;
    for (let k = 0; k < nn; k++) {
      const g = gid === 'box' ? ID : gestureAt(gid, k / (nn - 1), k, amt, Math.max(2, Math.round(step * nn / 14)), 0);
      const tw = gid === 'twist' ? Math.abs(Math.cos(g.rot)) * 0.7 + 0.3 : 1;
      const w = bw * g.sx * tw, x = cx + g.ox * bw - w / 2, y = H - 3 - (k + 1) * hh;
      out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(hh - 0.9).toFixed(1)}" rx="0.4"/>`);
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${out.join('')}</svg>`;
}
