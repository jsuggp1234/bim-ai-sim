// 일조·조망 분석 (순수 함수, 웹 워커에서 실행)
// 일조: 동지 진태양시 08~16시 10분 간격. 기준 = 09~15시 연속 2시간 이상 또는 08~16시 합계 4시간 이상
import { dirToSite, RIVER_TARGETS, NAMSAN, CONTEXT } from './plan.js';

export const LAT = 37.53;
const STEP_MIN = 10;

export function sunWorld(declDeg, solarHour, latDeg = LAT) {
  const d = declDeg * Math.PI / 180, f = latDeg * Math.PI / 180, H = (solarHour - 12) * 15 * Math.PI / 180;
  const E = -Math.cos(d) * Math.sin(H);
  const N = Math.cos(f) * Math.sin(d) - Math.sin(f) * Math.cos(d) * Math.cos(H);
  const U = Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H);
  return [E, U, -N]; // x 동, y 위, z 남
}
export function sunAltAz(declDeg, solarHour) {
  const [x, y, z] = sunWorld(declDeg, solarHour);
  const alt = Math.asin(y), az = (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360; // 북에서 시계방향
  return { alt: alt * 180 / Math.PI, az };
}

// boxes: Float64Array [cu, cv, hw, hd, cos, sin, y0, y1]*n — 수평으로 회전한 상자(OBB)
const BS = 8;
function hitAny(boxes, n, ou, ov, oy, du, dv, dy, tMax, minTop) {
  for (let i = 0; i < n; i++) {
    const k = i * BS;
    if (boxes[k + 7] <= minTop) continue;
    const c = boxes[k + 4], s = boxes[k + 5], hw = boxes[k + 2], hd = boxes[k + 3];
    const px = ou - boxes[k], pz = ov - boxes[k + 1];
    const lx = px * c + pz * s, lz = -px * s + pz * c, dx = du * c + dv * s, dz = -du * s + dv * c;
    let t0 = 1e-3, t1 = tMax, a, b, tmp;
    if (Math.abs(dx) < 1e-12) { if (lx < -hw || lx > hw) continue; }
    else { a = (-hw - lx) / dx; b = (hw - lx) / dx; if (a > b) { tmp = a; a = b; b = tmp; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
    if (Math.abs(dz) < 1e-12) { if (lz < -hd || lz > hd) continue; }
    else { a = (-hd - lz) / dz; b = (hd - lz) / dz; if (a > b) { tmp = a; a = b; b = tmp; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
    if (Math.abs(dy) < 1e-12) { if (oy < boxes[k + 6] || oy > boxes[k + 7]) continue; }
    else { a = (boxes[k + 6] - oy) / dy; b = (boxes[k + 7] - oy) / dy; if (a > b) { tmp = a; a = b; b = tmp; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
    return true;
  }
  return false;
}

// 상자 목록: {cu,cv,w,d,a,y0,y1} 또는 축 정렬 {u0,u1,v0,v1,y0,y1}
function packBoxes(list) {
  const arr = new Float64Array(list.length * BS);
  list.forEach((b, i) => {
    if (b.cu != null) arr.set([b.cu, b.cv, b.w / 2, b.d / 2, Math.cos(b.a || 0), Math.sin(b.a || 0), b.y0, b.y1], i * BS);
    else arr.set([(b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2, (b.u1 - b.u0) / 2, (b.v1 - b.v0) / 2, 1, 0, b.y0, b.y1], i * BS);
  });
  return arr;
}

export function sunSteps(decl) {
  const steps = [];
  for (let m = 8 * 60; m <= 16 * 60; m += STEP_MIN) {
    const h = m / 60, w = sunWorld(decl, h);
    steps.push({ h, s: dirToSite(w), inCore: h >= 9 - 1e-9 && h <= 15 + 1e-9 });
  }
  return steps;
}

// 한 점(여러 창면)에 대한 일조
function sunAt(faces, y, steps, boxes, n) {
  let total = 0, run = 0, best = 0;
  for (const st of steps) {
    const [su, sy, sv] = st.s;
    let lit = false;
    if (sy > 0.01) {
      for (const f of faces) {
        if (su * f[2] + sv * f[3] <= 0.02) continue; // 창 앞쪽에 해가 있어야 함
        if (!hitAny(boxes, n, f[0], f[1], y, su, sv, sy, 1e5, y)) { lit = true; break; }
      }
    }
    if (lit) { total++; if (st.inCore) { run++; if (run > best) best = run; } } else if (st.inCore) run = 0;
  }
  return { total: total * STEP_MIN, cont: best * STEP_MIN };
}

function viewAt(faces, y, boxes, n) {
  let river = 0, cand = 0, namsan = false;
  for (const f of faces) {
    for (const t of RIVER_TARGETS) {
      const du = t[0] - f[0], dv = t[1] - f[1], dy = t[2] - y, L = Math.hypot(du, dv, dy), Lh = Math.hypot(du, dv);
      if ((du * f[2] + dv * f[3]) / Lh < 0.5) continue; // 창 정면 ±60°
      cand++;
      if (!hitAny(boxes, n, f[0], f[1], y, du / L, dv / L, dy / L, L, -1)) river++;
    }
    if (!namsan) {
      const du = NAMSAN[0] - f[0], dv = NAMSAN[1] - f[1], dy = NAMSAN[2] - y, L = Math.hypot(du, dv, dy), Lh = Math.hypot(du, dv);
      if ((du * f[2] + dv * f[3]) / Lh > 0.34 && !hitAny(boxes, n, f[0], f[1], y, du / L, dv / L, dy / L, L, -1)) namsan = true;
    }
  }
  return { river, cand, namsan };
}

// units: [{faces:[[u,v,nu,nv],...], y}]  ctxSamples: [{faces, y, bid}]
export function analyze({ projectBoxes, units, ctxSamples, decl = -23.44 }) {
  const ctxBoxes = CONTEXT.map(c => ({ u0: c.u0, u1: c.u1, v0: c.v0, v1: c.v1, y0: 0, y1: c.y1 }));
  const all = packBoxes([...projectBoxes, ...ctxBoxes]);
  const nAll = projectBoxes.length + ctxBoxes.length;
  const onlyCtx = packBoxes(ctxBoxes);
  const steps = sunSteps(decl);
  const n = units.length;
  const total = new Uint16Array(n), cont = new Uint16Array(n), river = new Uint8Array(n), riverCand = new Uint8Array(n), namsan = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const u = units[i];
    const s = sunAt(u.faces, u.y, steps, all, nAll);
    total[i] = s.total; cont[i] = s.cont;
    const v = viewAt(u.faces, u.y, all, nAll);
    river[i] = Math.min(255, v.river); riverCand[i] = Math.min(255, v.cand); namsan[i] = v.namsan ? 1 : 0;
  }
  // 주변 주거 일조 영향: 사업 전(주변 건물만) vs 사업 후
  const ctx = ctxSamples.map(c => {
    const before = sunAt(c.faces, c.y, steps, onlyCtx, ctxBoxes.length);
    const after = sunAt(c.faces, c.y, steps, all, nAll);
    return { bid: c.bid, before, after };
  });
  return { total, cont, river, riverCand, namsan, ctx };
}

export const meets = (total, cont) => cont >= 120 || total >= 240;

// ---------- 표본점 생성 ----------
// 주거동 세대별 창면: 4호 = 네 모서리, 6호 = 모서리 4 + 남·북 중앙, 오피스텔 10호 = 남4·북4·동1·서1
export function unitSamples(bldgs) {
  const units = [];
  const o = 0.3;
  bldgs.forEach((b, bi) => {
    if (b.kind !== 'apt' && b.kind !== 'officetel') return;
    let layout = b.layout;
    if (!layout) {
      const { u0, u1, v0, v1 } = b.rect, w = u1 - u0, d = v1 - v0;
      const S = (fu) => [u0 + w * fu, v1 + o, 0, 1], N = (fu) => [u0 + w * fu, v0 - o, 0, -1];
      const E = (fv) => [u1 + o, v0 + d * fv, 1, 0], W = (fv) => [u0 - o, v0 + d * fv, -1, 0];
      layout = [[S(1 / 8)], [S(3 / 8)], [S(5 / 8)], [S(7 / 8)], [N(1 / 8)], [N(3 / 8)], [N(5 / 8)], [N(7 / 8)], [E(0.5)], [W(0.5)]];
    }
    b.floors.forEach((f, fi) => {
      if (!f.units) return;
      for (let k = 0; k < f.units && k < layout.length; k++) units.push({ b: bi, f: fi, k, y: f.y0 + 1.2, faces: layout[k] });
    });
  });
  return units;
}

// 주변 주거 건물의 남측 창면(3층 간격, 폭 방향 3점)
export function contextSamples() {
  const out = [];
  CONTEXT.forEach((c, ci) => {
    if (c.use !== 'res') return;
    for (let fl = 1; fl <= c.floors; fl += 3) {
      const y = (fl - 1) * 2.9 + 1.2;
      [0.2, 0.5, 0.8].forEach(fu => out.push({ bid: ci, y, faces: [[c.u0 + (c.u1 - c.u0) * fu, c.v1 + 0.3, 0, 1]] }));
    }
  });
  return out;
}

// 사업지 상자: 동의 부분마다, 층 축소율(s)이 같은 구간별로 나눈다. 옥탑은 코어 위 정사각형
export function buildingBoxes(b) {
  const out = [];
  if (b.kind === 'basement') return out;
  const fl = b.floors.filter(f => !f.roof);
  let i = 0;
  while (i < fl.length) {
    let j = i; while (j + 1 < fl.length && (fl[j + 1].s || 1) === (fl[i].s || 1)) j++;
    const s = fl[i].s || 1;
    b.parts.forEach(q => out.push({ cu: q.cu, cv: q.cv, w: q.w * s, d: q.d * s, a: q.a, y0: fl[i].y0, y1: fl[j].y1 }));
    i = j + 1;
  }
  const ph = b.floors.find(f => f.roof);
  if (ph && ph.area > 0) { const e = Math.sqrt(ph.area); out.push({ cu: b.core.u, cv: b.core.v, w: e, d: e, a: 0, y0: ph.y0, y1: ph.y1 }); }
  return out;
}
export function projectBoxes(gen) {
  const list = [];
  gen.bldgs.forEach(b => list.push(...buildingBoxes(b)));
  gen.sky.forEach(s => list.push({ u0: s.u0, u1: s.u1, v0: s.vc - 4, v1: s.vc + 4, y0: s.y0, y1: s.y1 }));
  return list;
}
