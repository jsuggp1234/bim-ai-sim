// 공종별 시공 시뮬레이션 (SVG 단면 · 입면).
// 4D 공정의 실제 일정(대표 블록·대표 동)을 따라 착공 후 τ일의 현장을 그린다: 지층·지하수·인접 건물·도로,
// 고른 공법의 장비와 시공 순서, 그리고 판정 엔진(sim/impact.js)이 찾은 간섭 위치에 번호 표식.
// 아직 고르지 않은 공종은 그리지 않거나 점선(미정)으로만 둔다.
import { sectionGeom, wpWindows, wallMove, anchorLen, craneX, ppv, ppvLimit } from '../sim/impact.js';
import { WP_BY_ID } from '../sim/methods.js';
import { dateAt, ym } from '../sim/process.js';
import { MORE } from '../sim/wps-more.js';
import { drawSite, drawBwp, drawBuilding, drawEnvelope, drawStructDetail, drawPour, drawSystems, detailInset } from './buildsim-more.js';
import { drawBackdrop, drawStreet, drawTraffic, drawNeighbours, drawGate, drawMonitor, monitorInset, person } from './buildsim-ctx.js';
import { streetModel } from '../sim/street.js';

// 화면 크기: 데스크톱 16:9, 휴대폰은 세로형 (frame(opts.narrow)로 바뀐다)
export let VW = 960, VH = 540;
let TOP = 52, NARROW = false;
export const NARROW_VB = [480, 560];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const f1 = (v) => Math.round(v * 10) / 10;
const n2 = (v) => Math.round(v * 100) / 100;
const UNDER = new Set(['survey', 'improve', 'wall', 'support', 'water', 'excav', 'found', 'bwp', 'base']);
export const isUnder = (wp) => UNDER.has(wp);
// 땅 높이에서 보는 공종 (가설 울타리·조경): 건물 꼭대기까지 넣지 않고 지표 부근을 크게
const GROUND = new Set(['prep', 'land']);
// 건물 안을 보는 공종: 외장을 입면 대신 단면(양끝 띠)으로 그려 속이 보이게
const CUT = new Set(['glaz', 'mep', 'hvac', 'plumb', 'fire', 'elec', 'ict', 'elev', 'part', 'floor', 'ceil', 'paint', 'comm', 'insul', 'hoist']);
const codeOf = (id) => (WP_BY_ID[id] ? WP_BY_ID[id].code : '');
let CUR = null; // 지금 그리는 프레임의 맥락 (장비가 차로를 쓰면 그 차로의 통행 차량을 비운다)

// ---------- 장면 ----------
export function makeScene(R, known) {
  const G = sectionGeom(R.gen, R.d);
  const W = wpWindows(R.S, G.main);
  const cond = R.cond, d = R.d, adj = cond.adj;
  const urban = adj < 30;
  const nb = { x1: -adj, x0: -adj - (urban ? 22 : 30), h: urban ? (cond.noise === 'high' ? 34 : 26) : 12, b: urban ? 7 : 1.2, urban };
  const rock = cond.rockDepth, g = cond.ground;
  const dv = Math.max(G.depth * 1.7 + 6, 24, Math.min(rock + 5, G.depth * 2.4 + 10));
  const bot = dv + 90; // 화면 아래 여백까지 지층이 차도록 깊게
  const L = g === 'R' ? [[0, 1.5, 'fill', '매립·표토'], [1.5, Math.max(2, rock), 'wr', '풍화암'], [Math.max(2, rock), bot, 'rock', '경암']]
    : g === 'W' ? [[0, 2, 'fill', '매립·표토'], [2, rock * 0.55, 'soil', '풍화토'], [rock * 0.55, rock, 'wr', '풍화암'], [rock, bot, 'rock', '연암·경암']]
      : g === 'S' ? [[0, 2, 'fill', '매립·표토'], [2, rock * 0.75, 'sand', '충적 모래·자갈'], [rock * 0.75, rock, 'wr', '풍화암'], [rock, bot, 'rock', '기반암']]
        : g === 'C' ? [[0, 2, 'fill', '매립·표토'], [2, Math.min(rock * 0.7, 28), 'clay', '연약 점토'], [Math.min(rock * 0.7, 28), rock, 'sand', '모래·자갈'], [rock, bot, 'rock', '기반암']]
          : [[0, 6, 'fill', '준설 매립토'], [6, Math.min(rock * 0.7, 30), 'clay', '연약 점토'], [Math.min(rock * 0.7, 30), rock, 'sand', '모래·자갈'], [rock, bot, 'rock', '기반암']];
  const strata = L.filter(([a, b]) => b > a);
  const softBot = strata.filter(s => s[2] === 'clay').reduce((m, s) => Math.max(m, s[1]), 0);
  const floors = G.floors.length ? G.floors : [{ e0: 0, e1: G.H }];
  const city = streetModel({ pw: G.pw, adj, noise: cond.noise, ground: g, nb, seed: R.site.id });
  return {
    city,
    R, G, W, cond, d, fx: R.fx, ids: { ...R.fx.ids }, qa: R.fx.qa || [], nb, strata, softBot, dv,
    known: new Set(known), mv: wallMove(R.fx.ids, R.fx, d, cond), floors, NF: floors.length,
    t0: R.S.t0, end: R.S.end, phases: R.S.phases, use: R.u,
    wallTh: { dwall: 1.0, scw: 0.8, cip: 0.6, hpile: 0.35, sheet: 0.3, nail: 0.15, open: 0 }[R.fx.ids.wall] ?? 0.6,
    embed: Math.min(bot - 1, G.depth + Math.max(3, G.depth * 0.45)),
    crX: craneX(G),
  };
}

export function roiFor(sc, wpId) {
  const { G, nb } = sc;
  // 인접 시설이 멀면(비도심) 화면을 다 쓰지 않도록 왼쪽을 자르고, 화면 밖 표시로 거리를 알린다
  const x0 = nb.urban ? nb.x0 - 5 : Math.max(nb.x0 - 5, -45), x1 = G.pw + 34;
  if (UNDER.has(wpId)) return { x0, x1, e0: -sc.dv, e1: Math.max(20, Math.min(nb.h + 3, 28)) };
  if (GROUND.has(wpId)) return { x0, x1, e0: -Math.max(6, Math.min(G.depth + 4, 16)), e1: Math.max(nb.h + 6, 22) };
  const top = Math.max(G.H + Math.max(16, G.H * 0.14), (G.stack || 0) + 8, nb.h + 6);
  return { x0, x1, e0: -(G.depth + 7), e1: top };
}
// 지상 공종: 작업 전선(골조 최상층 · 외장 · 설비)을 따라가는 카메라. 거푸집·타설은 기준층을 크게
const FOLLOW = new Set(['frame', 'form', 'conc', 'lift', 'skin', 'mep', 'plan', 'qa', 'rebar', 'pour', 'steel', 'glaz', 'insul', 'roof', 'hvac', 'plumb', 'fire', 'elec', 'ict', 'part', 'floor', 'ceil', 'paint']);
// 기준층을 크게 (거푸집·철근·타설·지붕) / 방 하나 크기로 (칸막이·바닥·천장·도장: 층 구성과 작업자가 보이게)
const TIGHT = new Set(['form', 'conc', 'rebar', 'pour']);
const ROOM = new Set(['part', 'floor', 'ceil', 'paint']);
// 확대 시점: 몇 개 층 높이(n)를 어디에 맞춰(at) 보여 줄지
//  room: 지금 층 하나 + 위아래 (층 구성·칸막이·작업자) · facade: 오른쪽 외벽 (창호·단열 층)
//  roof: 지붕층 (방수층·옥상 설비) · mep: 코어 주변 5개 층 (배관·덕트·간선, 시작은 지하 기계실)
const ZOOM = {
  part: { n: 3.1, at: 'room' }, floor: { n: 3.1, at: 'room' }, ceil: { n: 3.1, at: 'room' }, paint: { n: 3.1, at: 'room' },
  glaz: { n: 3.4, at: 'facade' }, insul: { n: 3.4, at: 'facade' }, roof: { n: 3.4, at: 'roof' },
  hvac: { n: 5.5, at: 'mep' }, plumb: { n: 5.5, at: 'mep' }, fire: { n: 5.5, at: 'mep' }, elec: { n: 5.5, at: 'mep' }, ict: { n: 5.5, at: 'mep' },
};
export const MEPSUB = new Set(['hvac', 'plumb', 'fire', 'elec', 'ict']);
const FRONT = { skin: 1, glaz: 1, insul: 1, mep: 1, hvac: 1, plumb: 1, fire: 1, elec: 1, ict: 1, part: 1, floor: 1, ceil: 1, paint: 1 };
function frontAt(sc, wpId, t) {
  if (wpId === 'roof') return sc.floors[sc.NF - 1].e1;
  const k = FRONT[wpId] ? wpId : 'frame';
  // 창호·단열은 외장이 붙은 층까지만 (외장보다 앞서 갈 수 없다)
  const pr = wpId === 'glaz' || wpId === 'insul' ? Math.min(prog(sc, k, t), prog(sc, 'skin', t)) : prog(sc, k, t);
  const fl = pr * sc.NF, n = clamp(Math.ceil(fl) - 1, 0, sc.NF - 1);
  return fl <= 0 ? 0 : sc.floors[n].e1;
}
// 기준층 층고 (포디움 제외)
const typFloorH = (sc) => { const G = sc.G, pod = G.podium ? G.podium.h : 0, up = sc.floors.filter(f => f.e0 >= pod - 0.1); return up.length ? Math.max(2.8, Math.min(6, (up[up.length - 1].e1 - up[0].e0) / up.length)) : 4; };
function followRoi(sc, wpId, p, base) {
  const win = winFor(sc, wpId), t = win.s + clamp(p, 0, 1) * (win.e - win.s);
  const top = frontAt(sc, wpId, t), G = sc.G;
  const Z = ZOOM[wpId];
  if (Z) {
    const fh = typFloorH(sc);
    const h = Math.max(Z.at === 'mep' ? 20 : 12, fh * Z.n), w = h * (VW - 28) / (VH - 90), bw = G.bx1 - G.bx0;
    let cx, e0;
    if (Z.at === 'room') { cx = bw < w * 0.9 ? (G.bx0 + G.bx1) / 2 : G.bx0 - w * 0.1 + w / 2; e0 = Math.max(-2, top - h * 0.7); }
    else if (Z.at === 'facade') { cx = G.bx1 - w * 0.62 + w / 2; e0 = Math.max(-2, top - h * 0.7); }
    else if (Z.at === 'roof') { cx = bw < w * 0.8 ? (G.bx0 + G.bx1) / 2 : G.bx1 - w * 0.7 + w / 2; e0 = top - h * 0.5; }
    else { cx = (G.core.x0 + G.core.x1) / 2 + 1; e0 = Math.max(-(G.depth + 3), top - h * 0.7); }
    const r = { x0: cx - w / 2, x1: cx + w / 2, e0, e1: e0 + h };
    const k = clamp(p * 6, 0, 1);
    return lerpRoi(base, r, 1 - Math.pow(1 - k, 3));
  }
  const tight = TIGHT.has(wpId);
  const h = tight ? Math.max(40, Math.min(70, G.H * 0.5)) : Math.max(60, Math.min(90, G.H * 0.45));
  const w = h * (VW - 28) / (VH - 90);
  const cx = tight ? (G.bx0 + G.bx1) / 2 + 6 : clamp((G.bx0 + G.bx1) / 2 + 4, base.x0 + w / 2, Math.max(base.x0 + w / 2, base.x1 - w / 2));
  const e0 = clamp(top - h * (tight ? 0.72 : 0.62), -(G.depth + 7), Math.max(-(G.depth + 7), G.H + 16 - h));
  let r = { x0: cx - w / 2, x1: cx + w / 2, e0, e1: e0 + h };
  // 넓고 낮은 건물(공장·물류)은 기준층 확대 대신 건물 전체 폭 + 펌프·반입구까지
  if (tight && G.bx1 - G.bx0 > w * 0.8) r = { x0: G.bx0 - 20, x1: Math.min(base.x1, G.bx1 + 26), e0: -6, e1: Math.max(top + 14, 24) };
  const k = clamp(p * 6, 0, 1); // 처음엔 전체에서 당겨 들어간다
  return lerpRoi(base, r, 1 - Math.pow(1 - k, 3));
}
// 지하 공종: 대지가 넓고 굴토가 얕으면 단면이 납작해진다 → 흙막이·인접부(좌) 또는 굴착·반출(우)을 확대
const UFOCUS = { wall: 'L', support: 'L', water: 'L', excav: 'R', found: 'L' };
function underRoi(sc, wpId, p, base) {
  const G = sc.G, nb = sc.nb, aw = VW - 28, ah = VH - 90, F = UFOCUS[wpId] || (NARROW ? 'L' : null);
  const s0 = Math.min(aw / (base.x1 - base.x0), ah / (base.e1 - base.e0));
  const want = 130 / Math.max(G.depth, 4);
  if (!F || G.depth * s0 >= 120 || want <= s0 * 1.15) return base;
  const s = Math.min(want, aw / (NARROW ? 50 : 80)), wv = aw / s, hv = ah / s;
  let x0;
  if (F === 'L') x0 = Math.max(base.x0, nb.x1 - Math.max(12, wv * 0.22), -wv * 0.4);
  else if (F === 'R') x0 = Math.min(base.x1 - wv, G.pw * 0.3 - 4);
  else x0 = G.pw / 2 - wv / 2;
  x0 = clamp(x0, base.x0, Math.max(base.x0, base.x1 - wv));
  const nbIn = nb.x1 > x0 + 4; // 인접 건물이 화면에 들어오면 그 높이까지, 아니면 하늘은 조금만
  const top = Math.min(base.e1, -(G.depth + 6) + hv, F === 'L' && nbIn ? nb.h + 4 : F === 'L' ? 10 : 18);
  const r = { x0, x1: x0 + wv, e0: top - hv, e1: top };
  const k = clamp(p * 6, 0, 1);
  return lerpRoi(base, r, 1 - Math.pow(1 - k, 3));
}
// 전체 건물 미니맵 + 지금 카메라 창
function minimap(g, sc, full, roi, fl) {
  const G = sc.G, x = VW - 16 - 64, y = TOP, w = 64, h = NARROW ? 100 : 120;
  const s = Math.min((w - 12) / (G.pw + 10), (h - 18) / (G.H + G.depth + 10));
  const X = (m) => x + 6 + (m + 5) * s, Y = (e) => y + h - 8 - (e + G.depth) * s;
  const top = fl > 0 ? sc.floors[clamp(Math.ceil(fl) - 1, 0, sc.NF - 1)].e1 : 0;
  g.P(`<rect class="inset" x="${x}" y="${y}" width="${w}" height="${h}"/>`);
  g.P(`<rect class="mm-g" x="${X(-5).toFixed(1)}" y="${Y(0).toFixed(1)}" width="${(w - 12).toFixed(1)}" height="${(G.depth * s).toFixed(1)}"/>`);
  g.P(`<rect class="mm-b" x="${X(G.bx0).toFixed(1)}" y="${Y(G.H).toFixed(1)}" width="${((G.bx1 - G.bx0) * s).toFixed(1)}" height="${(G.H * s).toFixed(1)}"/>`);
  if (top > 0) g.P(`<rect class="mm-f" x="${X(G.bx0).toFixed(1)}" y="${Y(top).toFixed(1)}" width="${((G.bx1 - G.bx0) * s).toFixed(1)}" height="${(top * s).toFixed(1)}"/>`);
  const cx0 = clamp(roi.x0, -5, G.pw + 5), cx1 = clamp(roi.x1, -5, G.pw + 5), ce0 = clamp(roi.e0, -G.depth, G.H + 8), ce1 = clamp(roi.e1, -G.depth, G.H + 8);
  g.P(`<rect class="mm-c" x="${X(cx0).toFixed(1)}" y="${Y(ce1).toFixed(1)}" width="${Math.max(2, (cx1 - cx0) * s).toFixed(1)}" height="${Math.max(2, (ce1 - ce0) * s).toFixed(1)}"/>`);
  g.P(`<text class="hud-s" x="${x + w / 2}" y="${y + h + 11}" text-anchor="middle">${Math.round(Math.min(sc.NF, fl))} / ${sc.NF}F</text>`);
  void full;
}
export const lerpRoi = (a, b, t) => ({ x0: lerp(a.x0, b.x0, t), x1: lerp(a.x1, b.x1, t), e0: lerp(a.e0, b.e0, t), e1: lerp(a.e1, b.e1, t) });

function camera(roi, under) {
  const pad = { l: 14, r: 14, t: NARROW ? 66 : 46, b: 44 };
  const w = VW - pad.l - pad.r, h = VH - pad.t - pad.b;
  const s = Math.min(w / (roi.x1 - roi.x0), h / (roi.e1 - roi.e0));
  const ox = pad.l + (w - (roi.x1 - roi.x0) * s) / 2 - roi.x0 * s;
  // 지하: 남는 세로 여백은 대부분 땅속으로 (깊은 지층이 화면 아래까지 찬다)
  const oy = pad.t + (h - (roi.e1 - roi.e0) * s) * (under ? 0.3 : 0.5) + roi.e1 * s;
  return { s, X: (x) => ox + x * s, Y: (e) => oy - e * s, xw: (px) => (px - ox) / s, ew: (py) => (oy - py) / s };
}

// 공종의 재생 창 (일). 겹치는 공정은 단면에서 이야기 순서대로 보이도록 앞 공정이 다음 공정 시작 전에 끝나게 한다
export function winFor(sc, wpId) {
  const W = sc.W, w = W[wpId];
  if (wpId === 'improve' && !w) { const s = W.survey ? W.survey.e : 0; return { s, e: s + 1, skip: true }; }
  if (!w) return { s: 0, e: 1, skip: true };
  return { s: w.s, e: Math.max(w.s + 1, w.e) };
}
export const progAt = (sc, k, t) => prog(sc, k, t);
// 3D 시점: 2D 카메라가 보는 범위(미터)를 그대로 쓴다
export function focusOf(sc, wpId, p) {
  const base = roiFor(sc, wpId);
  if (FOLLOW.has(wpId) && (TIGHT.has(wpId) || ZOOM[wpId] || sc.G.H > 60)) return followRoi(sc, wpId, Math.max(p, 0.2), base);
  if (UNDER.has(wpId)) return underRoi(sc, wpId, Math.max(p, 0.2), base);
  return base;
}
export { CUT as CUT_WPS, UNDER as UNDER_WPS };
function prog(sc, k, t) {
  const W = sc.W;
  let w = W[k];
  if (k === 'wall' && w && W.excav) w = { s: w.s, e: Math.max(w.s + 1, Math.min(w.e, W.excav.s)) };
  if (!w) return k === 'improve' ? 1 : 0;
  if (w.e <= w.s) return t >= w.s ? 1 : 0;
  return clamp((t - w.s) / (w.e - w.s), 0, 1);
}

// ---------- 펜 ----------
function pen(cam, focus) {
  const out = [];
  const X = cam.X, Y = cam.Y, s = cam.s;
  const P = (str) => out.push(str);
  const pts = (arr) => arr.map(([x, e]) => `${X(x).toFixed(1)},${Y(e).toFixed(1)}`).join(' ');
  return {
    out, X, Y, s, P, focus,
    line: (x0, e0, x1, e1, c = '') => P(`<line class="${c}" x1="${X(x0).toFixed(1)}" y1="${Y(e0).toFixed(1)}" x2="${X(x1).toFixed(1)}" y2="${Y(e1).toFixed(1)}"/>`),
    rect: (x0, e0, x1, e1, c = '') => { const a = Math.min(X(x0), X(x1)), b = Math.min(Y(e0), Y(e1)); P(`<rect class="${c}" x="${a.toFixed(1)}" y="${b.toFixed(1)}" width="${Math.abs(X(x1) - X(x0)).toFixed(1)}" height="${Math.abs(Y(e1) - Y(e0)).toFixed(1)}"/>`); },
    poly: (arr, c = '') => P(`<polygon class="${c}" points="${pts(arr)}"/>`),
    pl: (arr, c = '') => P(`<polyline class="${c}" points="${pts(arr)}"/>`),
    circ: (x, e, rpx, c = '') => P(`<circle class="${c}" cx="${X(x).toFixed(1)}" cy="${Y(e).toFixed(1)}" r="${rpx.toFixed(1)}"/>`),
    text: (x, e, t, c = '', anchor = 'start', dy = 0) => P(`<text class="${c}" x="${X(x).toFixed(1)}" y="${(Y(e) + dy).toFixed(1)}" text-anchor="${anchor}">${t}</text>`),
    raw: P,
  };
}

// ---------- 장비 글리프 (미터 단위, 지면 기준점) ----------
const EQ = {
  tracks(g, x, e, w, c) { g.rect(x - w / 2, e, x + w / 2, e + 0.9, `eq-t ${c}`); },
  excavator(g, x, e, dir, sw, c = '') {
    EQ.tracks(g, x, e, 4.8, c);
    g.rect(x - 1.9, e + 0.9, x + 1.5, e + 2.5, `eq ${c}`); g.rect(x - 0.4 * dir - 0.7, e + 2.5, x - 0.4 * dir + 0.7, e + 3.6, `eq ${c}`);
    const a = Math.sin(sw), ex = x + dir * 3.8, ee = e + 3.6 + a * 0.7, bx = x + dir * (5.8 + Math.cos(sw) * 0.5), be = e + 0.4 + a * 1.6;
    g.pl([[x + dir * 0.9, e + 2.3], [ex, ee], [bx, be]], `eq-l ${c}`);
    g.poly([[bx, be], [bx + dir * 0.9, be - 0.2], [bx + dir * 0.4, be - 0.9]], `eq ${c}`);
  },
  truck(g, x, e, dir, load, c = '') {
    g.rect(x - 3.4, e + 0.9, x + 1.6, e + 2.8, `eq ${c}`); g.rect(x + (dir > 0 ? 1.8 : -5.4), e + 0.9, x + (dir > 0 ? 3.6 : -3.6), e + 2.6, `eq ${c}`);
    if (load) g.poly([[x - 3.2, e + 2.8], [x - 1, e + 3.6], [x + 1.4, e + 2.8]], 'eq-load');
    [-2.4, 0.4, 2.8].forEach(k => g.circ(x + k * dir, e + 0.55, Math.max(1.5, 0.55 * g.s), `eq-w ${c}`));
  },
  rig(g, x, e, mast, toE, c = '', label = '') {
    EQ.tracks(g, x, e, 4.2, c); g.rect(x - 1.6, e + 0.9, x + 1.4, e + 2.6, `eq ${c}`);
    g.line(x, e + 2.6, x, e + mast, `eq-m ${c}`); g.line(x - 1.4, e + 2.2, x, e + mast * 0.75, `eq-l ${c}`);
    g.rect(x - 0.5, e + mast - 0.2, x + 0.5, e + mast + 0.6, `eq ${c}`);
    if (toE != null) g.line(x, e + mast, x, toE, `eq-c ${c}`);
    if (label) g.text(x, e + mast + 1.4, label, 'eq-lab', 'middle', -4);
  },
  crawler(g, x, e, ang, len, hookE, c = '', label = '', dir = 1) {
    if (CUR && e > -0.5) CUR.occupy(x - 3, x + 3);
    EQ.tracks(g, x, e, 6, c); g.rect(x - 2.2, e + 0.9, x + 2.2, e + 3, `eq ${c}`);
    const tx = x + dir * Math.cos(ang) * len, te = e + 2.4 + Math.sin(ang) * len;
    g.line(x + dir * 0.8, e + 2.4, tx, te, `eq-m ${c}`); g.line(x - dir * 0.6, e + 2.6, tx, te, `eq-l ${c}`);
    if (hookE != null) { g.line(tx, te, tx, hookE, `eq-c ${c}`); }
    if (label) g.text(tx, te + 1.5, label, 'eq-lab', 'middle', -4);
    return { tx, te };
  },
  tower(g, x, eb, H, R, cR, slew, tf, hookE, c = '', ghost = false, label = '') {
    const k = ghost ? ' ghost' : '';
    const w = 1.0;
    g.line(x - w, eb, x - w, H, `eq-m ${c}${k}`); g.line(x + w, eb, x + w, H, `eq-m ${c}${k}`);
    if (!ghost) for (let e = eb; e < H - 2; e += 3) g.line(x - w, e, x + w, e + 3, `eq-l ${c}`);
    const vis = R * Math.cos(slew), cv = -cR * Math.cos(slew);
    g.line(x, H, x, H + 5, `eq-m ${c}${k}`);
    g.line(x + cv, H, x + vis, H, `eq-m ${c}${k}`); g.line(x, H + 5, x + vis * 0.55, H, `eq-l ${c}${k}`); g.line(x, H + 5, x + cv * 0.9, H, `eq-l ${c}${k}`);
    if (!ghost) { g.rect(x + cv - Math.sign(cv || -1) * 0.2 - 1.2, H - 2.4, x + cv + 1.2, H, `eq ${c}`); g.rect(x - 1.2, H - 2.6, x + 1.2, H - 0.4, `eq ${c}`); }
    const hx = x + vis * tf;
    if (hookE != null && !ghost) { g.line(hx, H, hx, hookE, `eq-c ${c}`); g.rect(hx - 1.4, hookE - 1.6, hx + 1.4, hookE, `eq-load`); }
    if (label) g.text(x, H + 6.5, label, `eq-lab${k}`, 'middle', -4);
    return { hx, tip: x + vis };
  },
  luffing(g, x, eb, H, R, ang, hookE, c = '', label = '') {
    const w = 1.0;
    g.line(x - w, eb, x - w, H, `eq-m ${c}`); g.line(x + w, eb, x + w, H, `eq-m ${c}`);
    for (let e = eb; e < H - 2; e += 3) g.line(x - w, e, x + w, e + 3, `eq-l ${c}`);
    const L = R / Math.cos(0.35), tx = x + Math.cos(ang) * L, te = H + Math.sin(ang) * L;
    g.line(x, H, tx, te, `eq-m ${c}`); g.line(x, H + 4, tx, te, `eq-l ${c}`); g.rect(x - 4, H - 2, x - 1, H + 1, `eq ${c}`);
    if (hookE != null) { g.line(tx, te, tx, hookE, `eq-c ${c}`); g.rect(tx - 1.2, hookE - 1.4, tx + 1.2, hookE, 'eq-load'); }
    if (label) g.text(x, H + 7, label, 'eq-lab', 'middle', -4);
    return { tx, te };
  },
  pump(g, x, e, to, c = '') {
    if (CUR && e > -0.5) CUR.occupy(x - 4, x + 4.4);
    // 아웃리거
    [-3.4, 3.6].forEach(k => { g.line(x + k, e + 1.2, x + k + Math.sign(k) * 1.2, e + 0.15, `eq-l ${c}`); g.rect(x + k + Math.sign(k) * 1.2 - 0.35, e, x + k + Math.sign(k) * 1.2 + 0.35, e + 0.15, `eq ${c}`); });
    g.rect(x - 4, e + 0.9, x + 2.4, e + 2.8, `eq ${c}`); g.rect(x + 2.6, e + 0.9, x + 4.4, e + 2.6, `eq ${c}`);
    [-3, 0, 3.4].forEach(k => g.circ(x + k, e + 0.55, Math.max(1.5, 0.55 * g.s), `eq-w ${c}`));
    const bx = x - 1, be = e + 3, dx = to[0] - bx, de = to[1] - be, L = Math.hypot(dx, de);
    if (L < 52) { const mx = bx + dx * 0.45, me = be + de * 0.45 + Math.min(14, L * 0.35); g.pl([[bx, be], [mx, me], [to[0], to[1] + 2], [to[0], to[1]]], `eq-m ${c}`); }
    else g.pl([[bx, be], [bx + Math.sign(dx) * 6, be + 8]], `eq-m ${c}`);
  },
  // 레미콘 (펌프카 옆 차로에 선 모습: 앞모습 + 뒤로 보이는 드럼)
  mixer(g, x, e, T, c = '', j = 0) {
    if (CUR && CUR.laneX) { const lx = CUR.laneX(2 + j); if (lx == null || CUR.occupied.has(2 + j)) return; x = lx; CUR.occupy(x - 1.3, x + 1.3); }
    const w = 2.5;
    g.P(`<ellipse class="eq drum ${c}" cx="${g.X(x).toFixed(1)}" cy="${g.Y(e + 2.75).toFixed(1)}" rx="${(1.15 * g.s).toFixed(1)}" ry="${(1.15 * g.s).toFixed(1)}"/>`);
    const k = (T * 0.9) % 1; for (let q = 0; q < 2; q++) { const a = (k + q / 2) * Math.PI * 2; g.line(x + Math.cos(a) * 0.3, e + 2.75 + Math.sin(a) * 0.3, x + Math.cos(a) * 1.05, e + 2.75 + Math.sin(a) * 1.05, 'eq-l'); }
    g.rect(x - w / 2, e + 0.4, x + w / 2, e + 2.5, `eq ${c}`); g.rect(x - w * 0.4, e + 1.3, x + w * 0.4, e + 2.3, 'veh-g');
    [-1, 1].forEach(q => g.rect(x + q * (w / 2 - 0.22) - 0.14, e, x + q * (w / 2 - 0.22) + 0.14, e + 0.5, `eq-w ${c}`));
    if (g.s >= 5) g.text(x, e + 4.1, '레미콘', 'eq-lab', 'middle', -2);
  },
  worker(g, x, e, c = '') { g.circ(x, e + 1.75, Math.max(1.4, 0.22 * g.s), `wk ${c}`); g.line(x, e + 1.5, x, e + 0.6, `wk-l ${c}`); g.line(x, e + 0.6, x - 0.3, e, `wk-l ${c}`); g.line(x, e + 0.6, x + 0.3, e, `wk-l ${c}`); },
};

// ---------- 그리기 ----------
// marks: [{ n, mark, sev }] — 판정 표식 번호. 반환: { svg, tau, date }
export function frame(sc, wpId, p, T, roi, marks = [], opts = {}) {
  NARROW = !!opts.narrow; [VW, VH] = NARROW ? NARROW_VB : [960, 540]; TOP = NARROW ? 70 : 52;
  const full = roi;
  if (!opts.noFollow && FOLLOW.has(wpId) && (TIGHT.has(wpId) || ZOOM[wpId] || sc.G.H > 60 || NARROW)) roi = followRoi(sc, wpId, p, roi);
  else if (!opts.noFollow && UNDER.has(wpId)) roi = underRoi(sc, wpId, p, roi);
  const cam = camera(roi, UNDER.has(wpId));
  const g = pen(cam, wpId);
  const { G, nb, cond, ids, d } = sc;
  const win = winFor(sc, wpId);
  const tau = win.s + clamp(p, 0, 1) * (win.e - win.s);
  const K = (wp) => sc.known.has(wp);
  const F = (wp) => (wp === wpId ? ' acc' : '');
  const at = {}; // 표식 위치 (미터)
  const xMin = cam.xw(0), xMax = cam.xw(VW), eMaxV = cam.ew(0), eMinV = cam.ew(VH);
  // 진행률
  const P = (k) => prog(sc, k, tau);
  const surveyP = P('survey'), impP = P('improve'), wallP = P('wall'), earthP = P('excav'), foundP = P('found'), baseP = P('base'), structP = P('frame'), skinP = P('skin'), mepP = P('mep');
  const depth = G.depth, pw = G.pw, open = ids.wall === 'open' && K('wall');
  const topdown = K('support') && ids.support === 'topdown';
  const dug = depth > 0.5 ? depth * (topdown ? earthP : earthP) : 0;
  const gw = cond.gw;
  const xl = xMin - 2, xr = xMax + 2;

  // 정의
  g.P(`<defs>
    <pattern id="bp-sand" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" class="pt"/><circle cx="6" cy="6" r=".7" class="pt"/></pattern>
    <pattern id="bp-clay" width="14" height="6" patternUnits="userSpaceOnUse"><path d="M1 3h7" class="pt-l"/></pattern>
    <pattern id="bp-rock" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" class="pt-l"/></pattern>
    <pattern id="bp-wr" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L10 0" class="pt-l" stroke-dasharray="2 3"/></pattern>
    <pattern id="bp-fill" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M2 3l2 2M6 6l1 -2" class="pt-l"/></pattern>
    <pattern id="bp-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V5" class="pt-h"/></pattern>
    <pattern id="bp-win" width="7" height="9" patternUnits="userSpaceOnUse"><rect x="1.5" y="2" width="3.4" height="4.2" class="pt-win"/></pattern>
  </defs>`);
  // 세부 공종 그리기 맥락 (buildsim-more.js · buildsim-ctx.js)
  const city = sc.city;
  const laneX = (i) => { const L = city && city.lanes[i]; return L ? (L.x0 + L.x1) / 2 : null; };
  const occ = new Set();
  const occupy = (a, b) => { if (!city) return; city.lanes.forEach((L, i) => { if (b > L.x0 + 0.4 && a < L.x1 - 0.4) occ.add(i); }); };
  const c = { sc, wpId, tau, T, P, K, F, at, eMinV, eMaxV, fl: structP * sc.NF, EQ, g, TOP, VW, VH, NARROW, xMin, xMax, under: UNDER.has(wpId), urbanLeft: city && city.kind === 'urban', occupied: occ, occupy, laneX,
    trucks: dug > 0.3 && earthP < 1 && ['support', 'excav', 'water'].includes(wpId) };
  CUR = c;
  drawBackdrop(g, c);

  // ---- 지층 ----
  sc.strata.forEach(([a, b, k, nm]) => {
    if (-a < eMinV) return;
    g.rect(xl, -a, xr, -Math.min(b, -eMinV + 2), `st st-${k}`);
    g.rect(xl, -a, xr, -Math.min(b, -eMinV + 2), `stp`); g.out[g.out.length - 1] = g.out[g.out.length - 1].replace('class="stp"', `class="stp" fill="url(#bp-${k === 'soil' ? 'fill' : k})"`);
    const va = Math.max(a, 0.5), vb = Math.min(b, -cam.ew(VH - 44)); // 화면 아래 시간축 띠 위까지
    if ((vb - va) * cam.s >= 16) g.text(xMax - 8 / cam.s, -(va + vb) / 2, nm, 'st-lab', 'end', 3.5);
  });
  // 조사 전 미지 지반 (안개)
  if (surveyP < 1 || wpId === 'survey') {
    const bores = boreXs(sc), unc = sc.fx.unc ?? 1;
    const reach = (ids.survey === 'ai' ? 60 : ids.survey === 'geo' ? 42 : 18) * (K('survey') ? 1 : 0.6);
    const step = 3;
    for (let x = Math.floor(xl / step) * step; x < xr; x += step) {
      let rv = 0;
      bores.forEach((bx, i) => { const lp = clamp(surveyP * bores.length - i, 0, 1); rv = Math.max(rv, lp * Math.exp(-Math.abs(x + step / 2 - bx) / reach)); });
      if (ids.survey === 'ai' || ids.survey === 'geo') rv = Math.max(rv, clamp(surveyP * 1.4 - 0.2, 0, 1) * 0.8);
      const op = 0.88 * (1 - rv);
      if (op > 0.03) g.P(`<rect class="fog" x="${g.X(x).toFixed(1)}" y="${g.Y(0).toFixed(1)}" width="${(step * cam.s + 0.6).toFixed(1)}" height="${(g.Y(eMinV) - g.Y(0)).toFixed(1)}" opacity="${op.toFixed(2)}"/>`);
    }
    if (surveyP < 0.15) g.text((xl + xr) / 2, -Math.min(sc.dv * 0.45, 14), '미조사 지반 ?', 'fog-t', 'middle');
    // 경계 불확실성 띠
    if (surveyP > 0.3) sc.strata.slice(1).forEach(([a]) => { if (-a < eMinV) return; const bw = (1.6 * unc) * (1 - surveyP * 0.5); g.line(xl, -a + bw, xr, -a + bw, 'unc'); g.line(xl, -a - bw, xr, -a - bw, 'unc'); });
    if (surveyP > 0.9) at.unknown = [pw * 0.5, -(cond.rockDepth)];
  }
  // 지하수위 (양수 중이면 강하 곡선)
  const dwOn = K('water') && ids.water === 'dewater' && d.belowGW > 0.5 && earthP > 0;
  if (gw < -eMinV) {
    if (dwOn) {
      const dh = (d.belowGW + 1.5) * clamp(earthP * 1.5, 0, 1), R0 = 40 + 15 * dh;
      const pts = []; for (let x = xl; x <= xr; x += 2) { const r = x < 0 ? -x : x > pw ? x - pw : 0; pts.push([x, -gw - dh * Math.max(0, 1 - r / R0) ** 1.6]); }
      g.pl(pts, 'gw'); g.line(xl, -gw, xr, -gw, 'gw0');
      at.drawdown = [nb.x1 - 4, -gw - dh * Math.max(0, 1 - (-nb.x1 + 4) / R0) ** 1.6];
    } else g.line(xl, -gw, xr, -gw, 'gw');
    g.text(Math.max(cam.xw(VW * 0.62), 2), -gw, `▽ 지하수위 GL−${gw}m`, 'gw-t', 'start', -4);
  }
  // 지표
  g.line(xl, 0, 0 - (open ? depth * 1.2 : 0), 0, 'gl'); g.line(pw + (open ? depth * 1.2 : 0), 0, xr, 0, 'gl');

  // ---- 도로 · 인접 건물 · 대지 경계 ----
  const settleNow = sc.mv.total > 0 && K('wall') ? sc.mv.settle * clamp(earthP * 1.2, 0, 1) + (dwOn ? sc.mv.dewater * earthP : 0) : 0;
  const sdy = settleNow * 0.025; // 과장 표시 (1mm → 2.5cm)
  drawStreet(g, c);
  drawNeighbours(g, c, sdy);
  {
    const x0 = nb.x0, x1 = nb.x1, h = nb.h, b = nb.b, nbName = city ? `인접 건물 · ${city.nb.name}` : nb.urban ? '인접 건물' : '인접 시설';
    g.text(Math.min(x1 - 6, Math.max((x0 + x1) / 2, cam.xw(70))), Math.min(h + 3 - sdy, cam.ew(NARROW ? 66 : 48)), nbName, 'nb-t', 'middle', 0);
    if (g.X(x1) < 12) g.P(`<text class="nb-pt" x="20" y="${(g.Y(0) - 8).toFixed(1)}">← ${nb.urban ? '인접 건물' : '인접 시설'} ${Math.round(-x1)}m</text>`);
    if (settleNow > 0.3) {
      const pts = []; for (let x = x0 - 6; x <= 0; x += 1) pts.push([x, -b - 1.2 - sdy * Math.max(0, 1 - (-x) / (sc.mv.zone || 20)) * 2.2]);
      g.pl(pts, 'settle'); g.text((x0 + x1) / 2, -b - 2.6, `침하 ${f1(settleNow)}mm`, settleNow > sc.mv.allow * 0.6 ? 'bad-t' : 'warn-t', 'middle', 10);
      at.settle = [(x0 + x1) / 2, -b - 1.5];
    }
    const pl = -Math.min(3, cond.adj / 2);
    g.line(pl, h * 0.5, pl, -sc.dv, 'pline'); g.text(pl, h * 0.5 + 1, '대지 경계', 'pline-t', 'middle', -3);
    // 도로 이름
    if (city) { const rx = Math.min((city.road[0] + city.road[1]) / 2, cam.xw(VW - 30)); g.text(rx, -1.05, `${city.kind === 'urban' ? '왕복 4차로' : city.kind === 'ind' ? '산업 도로 4차로' : '왕복 2차로'} · 폭 ${f1(city.road[1] - city.road[0])}m`, 'road-t', 'middle', 4); }
    at.road = [laneX(1) ?? pw + 19, 2]; at.gate = [city ? city.gate : pw + 5, 3.6]; at.truck = [pw + 12, 4.6];
  }
  drawGate(g, c);
  drawSite(g, c);
  // 플랜트 맥락 (연돌·탱크)
  if (G.stack && !isUnder(wpId)) { const sx = pw + 22; g.rect(sx - 1.6, 0, sx + 1.6, G.stack, 'ctx'); g.text(sx, G.stack + 1, '연돌', 'ctx-t', 'middle', -4); }

  // ---- 지반조사 ----
  if (K('survey') && (wpId === 'survey' || surveyP < 1)) {
    const bores = boreXs(sc), target = Math.min(sc.dv - 2, Math.max(depth * 1.6, cond.rockDepth + 3));
    bores.forEach((bx, i) => {
      const lp = clamp(surveyP * bores.length - i, 0, 1); if (lp <= 0) return;
      const de = target * clamp(lp * 1.15, 0, 1);
      g.line(bx, 0, bx, -de, `bore${F('survey')}`);
      for (let m = 1.5; m < de; m += 1.5) g.line(bx - 0.5, -m, bx + 0.5, -m, 'spt');
      if (ids.survey === 'cpt' || ids.survey === 'ai') { const pts = []; for (let m = 0; m < de; m += 0.5) pts.push([bx + 1 + 1.6 * (0.5 + 0.5 * Math.sin(m * 1.7 + i) * Math.sin(m * 0.37)) + (sc.strata.find(s => m >= s[0] && m < s[1]) || [, , 'soil'])[2].length * 0.15, -m]); g.pl(pts, 'cpt'); }
      if (lp < 1) EQ.rig(g, bx - 1.8, 0, 9, -de, F('survey').trim(), ids.survey === 'cpt' ? 'CPTu' : '시추기');
    });
    if ((ids.survey === 'geo' || ids.survey === 'ai') && surveyP > 0.2) {
      const k = clamp((surveyP - 0.2) / 0.5, 0, 1);
      for (let x = -nb.x1 * 0 - 10; x <= pw + 10; x += 4) g.poly([[x - 0.6, 0], [x + 0.6, 0], [x, 1.1]], 'geo-p');
      const r = (T * 18) % 30; for (let j = 0; j < 3; j++) { const rr = (r + j * 10) % 30; g.P(`<path class="wave" d="M${g.X(pw * 0.5 - rr).toFixed(1)} ${g.Y(0).toFixed(1)} A ${(rr * cam.s).toFixed(1)} ${(rr * cam.s).toFixed(1)} 0 0 0 ${g.X(pw * 0.5 + rr).toFixed(1)} ${g.Y(0).toFixed(1)}" opacity="${(0.7 * (1 - rr / 30) * k).toFixed(2)}"/>`); }
    }
    if (ids.survey === 'ai' && surveyP > 0.55) g.text(pw * 0.5, -Math.min(sc.dv - 3, depth + 4), 'AI 3D 지층 모델 · 불확실성 지도', 'ai-t', 'middle');
  }

  // ---- 지반 개량 ----
  if (K('improve') && ids.improve && ids.improve !== 'none' && impP > 0) {
    const bot = Math.max(sc.softBot, Math.min(sc.dv - 2, depth + 6)), k = ids.improve, c = F('improve');
    const xs = []; for (let x = -4; x <= pw + 4; x += k === 'dcm' ? 5 : 3) xs.push(x);
    const nOn = Math.floor(impP * 1.25 * xs.length);
    xs.forEach((x, i) => {
      if (i > nOn) return;
      if (dug > 0.5 && x > 0 && x < pw && k === 'dcm') { g.rect(x - 0.8, -Math.max(dug, 1), x + 0.8, -bot, `imp${c}`); return; }
      if (k === 'dcm') g.rect(x - 0.8, -0.8, x + 0.8, -bot, `imp${c}`);
      else if (k === 'scp') { for (let m = 1; m < bot; m += 1.2) g.circ(x, -m, Math.max(1, 0.35 * cam.s), `imp-d${c}`); }
      else g.line(x, -0.5, x, -bot, `imp-l${c}`);
    });
    if (nOn < xs.length && wpId === 'improve') { const x = xs[Math.min(xs.length - 1, nOn)]; EQ.rig(g, x - 2, 0, 12, -bot * clamp((impP * 1.25 * xs.length - nOn), 0, 1), c.trim(), { pbd: 'PBD 타입기', scp: 'SCP 케이싱', dcm: 'DCM 교반기', vac: '배수재' }[k]); }
    if ((k === 'pbd') && impP > 0.4 && wallP <= 0) { const hh = 5 * clamp((impP - 0.4) / 0.3, 0, 1) * (impP > 0.9 ? (1 - impP) * 10 : 1); g.poly([[-6, 0], [-1, hh], [pw + 1, hh], [pw + 6, 0]], `surch${c}`); g.text(pw / 2, hh + 1, '선행재하 성토', 'eq-lab', 'middle', -3); at.surcharge = [pw / 2, hh * 0.6]; }
    if (k === 'vac' && impP > 0.3 && wallP <= 0) { g.line(-6, 0.3, pw + 6, 0.3, `sheet${c}`); g.text(pw / 2, 1.4, '기밀 시트 · 진공 −80kPa', 'eq-lab', 'middle', -3); }
    if (impP > 0.5 && (k === 'pbd' || k === 'vac')) { const st = 0.6 * clamp((impP - 0.5) * 2, 0, 1); g.text(pw + 2, -st - 1, `압밀 침하 ${Math.round(st * 1000)}mm`, 'warn-t', 'start'); }
    if (k === 'dcm' && dug > 0.5) at.dcm = [pw * 0.3, -Math.min(dug, depth) * 0.6];
  }
  if (wpId === 'improve' && (!ids.improve || ids.improve === 'none')) g.text(pw / 2, -Math.min(sc.dv * 0.4, 10), d.soft < 0.5 ? '연약층 없음 · 지반 개량 생략' : '지반 개량 없음 (연약층 그대로)', d.soft < 0.5 ? 'ok-t' : 'bad-t', 'middle');
  if (wpId === 'improve' && ids.improve === 'none' && d.soft >= 0.5) at.settle = at.settle || [pw / 2, -2];

  // ---- 굴착 (구덩이) ----
  if (dug > 0.05) {
    if (open) { const sl = dug * 1.2; g.poly([[-sl, 0], [0, -dug], [pw, -dug], [pw + sl, 0]], 'pit'); g.pl([[-sl, 0], [0, -dug]], 'slope'); g.pl([[pw, -dug], [pw + sl, 0]], 'slope'); at.slope = [-sl * 0.5, -dug * 0.5]; }
    else g.rect(sc.wallTh, 0, pw - sc.wallTh, -dug, 'pit');
    // 섬(레이커 중앙 굴착 순서): 레이커면 가장자리를 나중에
    if (K('support') && ids.support === 'raker' && foundP < 0.5 && dug > 2) { const bw = Math.min(depth * 0.9, pw * 0.22); g.poly([[sc.wallTh, 0], [sc.wallTh + bw * 0.4, 0], [sc.wallTh + bw, -dug], [sc.wallTh, -dug]], 'berm'); g.poly([[pw - sc.wallTh, 0], [pw - sc.wallTh - bw * 0.4, 0], [pw - sc.wallTh - bw, -dug], [pw - sc.wallTh, -dug]], 'berm'); }
  }
  // 터파기 표시 (현재 깊이)
  if (dug > 0.5 && dug < depth - 0.2 && (wpId === 'support' || wpId === 'excav' || wpId === 'water')) { g.line(-2, -dug, pw + 2, -dug, 'now'); g.text(pw - 3, -dug, `GL−${f1(dug)}m`, 'now-t', 'end', -4); }

  // ---- 흙막이 벽 ----
  if (K('wall') && !open && depth > 0.5 && wallP > 0) {
    const c = F('wall'), th = Math.max(sc.wallTh, 0.3), emb = sc.embed, k = ids.wall;
    [[0, 0], [pw - th, 1]].forEach(([x, side]) => {
      const lp = clamp(wallP * 2 - side, 0, 1); if (lp <= 0) return;
      const eb = -emb * lp;
      if (k === 'hpile') { g.rect(x, 0.3, x + th, eb, `wall w-h${c}`); if (dug > 0) for (let m = 0.8; m < dug; m += 0.8) g.line(x + (side ? 0 : th), -m, x + (side ? 0 : th) + (side ? -0.2 : 0.2), -m, 'lag'); }
      else if (k === 'sheet') { const pts = []; for (let m = 0.3; m > eb; m -= 0.6) pts.push([x + th * (Math.round(-m / 0.6) % 2), m]); g.pl(pts, `wall-z${c}`); }
      else if (k === 'nail') { /* 굴착하며 */ }
      else g.rect(x, 0.3, x + th, eb, `wall w-${k}${c}`);
      // 시공 장비
      if (lp > 0 && lp < 1 && wpId === 'wall') {
        if (k === 'dwall') { g.rect(x - 0.2, 0, x + th + 0.2, eb, 'slurry'); EQ.crawler(g, x + (side ? -8 : 9), 0, 1.25, 20, eb + 2, c.trim(), '하이드로밀', side ? 1 : -1); g.rect(x - 0.1, eb + 2.4, x + th + 0.1, eb, 'cutter'); }
        else if (k === 'sheet') { EQ.crawler(g, x + (side ? -7 : 8), 0, 1.3, 15, 1, c.trim(), '진동 해머', side ? 1 : -1); at.vibro = [x, 2]; }
        else EQ.rig(g, x + (side ? -2.2 : 2.6), 0, 15, eb, c.trim(), { cip: '오거 (CIP)', scw: '3축 오거 (SCW)', hpile: '오거 · H형강' }[k] || '');
      }
    });
    if (k === 'sheet' && (cond.noise === 'high' || cond.adj < 15) && wallP < 1) { const r = (T * 14) % 18; for (let j = 0; j < 3; j++) { const rr = (r + j * 6) % 18 + 1; g.P(`<circle class="vib" cx="${g.X(0).toFixed(1)}" cy="${g.Y(-2).toFixed(1)}" r="${(rr * cam.s).toFixed(1)}" opacity="${(1 - rr / 19).toFixed(2)}"/>`); } at.vibro = at.vibro || [-3, 1]; }
    if (wallP >= 1 && ['cip', 'scw', 'dwall'].includes(k)) { g.rect(-0.2, 0.8, th + 0.4, 0, 'cap'); g.rect(pw - th - 0.4, 0.8, pw + 0.2, 0, 'cap'); }
    at.wall = [th / 2, -Math.min(depth, 6)];
    if (d.belowGW > 0.5) at.leak = [th, -Math.max(gw + 1, Math.min(dug || depth, depth) - 1)];
  }
  // 소일네일 (굴착하며)
  if (K('wall') && ids.wall === 'nail' && dug > 0.5) [[0, -1], [pw, 1]].forEach(([x, s2]) => { for (let m = 1.2; m < dug; m += 1.5) g.line(x, -m, x - s2 * (0.6 * depth + 3), -m - 2, 'nail'); g.line(x, 0, x, -dug, 'wall-z'); });
  if (wpId === 'wall' && open) { const sl = depth * 1.2; g.pl([[-sl, 0], [0, -depth], [pw, -depth], [pw + sl, 0]], 'plan-l'); g.text(pw / 2, -depth - 1.5, `사면 1:1.2 계획선 · 폭 ${f1(sl)}m`, 'eq-lab', 'middle', 4); }

  // ---- 차수 ----
  if (K('water') && depth > 0.5 && d.belowGW > 0.5) {
    const c = F('water'), k = ids.water, Ww = sc.W.wall, Wx = sc.W.excav;
    const wp = Ww && Wx ? clamp((tau - Ww.s) / Math.max(1, Wx.s - Ww.s), 0, 1) : 1;
    if (k === 'grout' || k === 'jsp') {
      const e0 = -Math.max(0, gw - 1), e1 = -Math.min(sc.dv - 1, sc.embed + 3), n = Math.floor(wp * 1.2 * 12);
      [[-1.4, 0], [pw + 1.4, 1]].forEach(([x]) => { for (let i = 0; i < Math.min(12, n); i++) { const e = lerp(e0, e1, (i + 0.5) / 12); k === 'jsp' ? g.rect(x - 0.9, e + (e1 - e0) / 24, x + 0.9, e - (e1 - e0) / 24, `grout${c}`) : g.circ(x, e, Math.max(2, 0.9 * cam.s), `grout${c}`); } });
    }
    if (k === 'dewater') [[-5, 0], [-1.6, 0], [pw + 1.6, 1], [pw + 5, 1]].forEach(([x], i) => { if (wp * 4 < i + 0.5) return; g.line(x, 0.8, x, -Math.min(sc.dv - 1, depth + 6), `well${c}`); g.circ(x, 1.2, 3, `well-p${c}`); });
    if (k === 'drain' && foundP > 0.2) { g.line(1, -depth - 0.4, pw - 1, -depth - 0.4, `drain${c}`); g.rect(pw * 0.5 - 1, -depth - 0.2, pw * 0.5 + 1, -depth - 1.6, `sump${c}`); g.text(pw * 0.5, -depth - 2, '영구배수 집수정', 'eq-lab', 'middle', 9); }
    // 유입 (차수 없음 · 투수성 벽)
    const wt = sc.fx.watertight ?? 0.5;
    if (k === 'none' && wt < 0.9 && dug > gw) {
      const lvl = Math.min(2.5, (dug - gw) * 0.3) * clamp(earthP * 1.5, 0, 1);
      g.rect(sc.wallTh, -dug, pw - sc.wallTh, -dug + lvl, 'water-in');
      for (let m = gw + 0.8; m < dug; m += 2) { const ph = (T * 1.4 + m) % 1; g.line(sc.wallTh + ph * 2, -m, sc.wallTh + ph * 2 + 1.2, -m - 0.4, 'flow'); g.line(pw - sc.wallTh - ph * 2, -m, pw - sc.wallTh - ph * 2 - 1.2, -m - 0.4, 'flow'); }
      g.text(pw / 2, -dug + lvl + 0.6, '유입 · 보일링 위험', 'bad-t', 'middle', -4); at.leak = [sc.wallTh + 1, -(gw + dug) / 2];
    }
    if ((k === 'none' || k === 'drain') && wt >= 0.9 && dug > gw && wpId === 'water') g.text(pw / 2, -dug + 1.2, '연속 차수벽 · 내부 건조', 'ok-t', 'middle', -4);
  }

  // ---- 지보 ----
  const lv = []; if (depth > 0.5) for (let m = 1.5; m < depth - 1; m += 3.5) lv.push(m);
  const removeUpTo = !topdown && K('base') && ids.base === 'bottomup' ? depth * (1 - baseP) : depth + 9; // 순타: 아래 바닥이 올라오면 그 위 버팀 해체
  if (K('support') && !open && depth > 0.5 && ids.support !== 'self') {
    const c = F('support'), k = ids.support, th = sc.wallTh;
    lv.forEach((m, i) => {
      if (dug < m + 0.4) return;
      if (k === 'strut' || k === 'sps') {
        if (k === 'strut' && m > removeUpTo + 0.5 && baseP > 0) return;
        if (k === 'strut' && removeUpTo <= m) return;
        g.line(th, -m, pw - th, -m, `strut${c}`); g.line(th, -m + 0.35, th + 0.25, -m - 0.35, 'wale'); g.line(pw - th, -m + 0.35, pw - th - 0.25, -m - 0.35, 'wale');
        if (k === 'sps') g.line(th, -m - 0.5, pw - th, -m - 0.5, `strut${c}`);
        if (i === 0) at.strut = [pw * 0.5, -m];
      }
      if (k === 'anchor') {
        const L = anchorLen(depth), a = Math.PI / 9;
        [[th, -1], [pw - th, 1]].forEach(([x, s2]) => {
          const tx = x + s2 * L * Math.cos(a), te = -m - L * Math.sin(a), bx = x + s2 * (L - 8) * Math.cos(a), be = -m - (L - 8) * Math.sin(a);
          const into = s2 < 0 && tx < nb.x1;
          g.line(x, -m, bx, be, `anc${c}${into ? ' bad' : ''}`); g.line(bx, be, tx, te, `anc-b${c}${into ? ' bad' : ''}`);
          if (into && !at.anchor) at.anchor = [Math.max(tx, nb.x0 + 2), te];
        });
      }
      if (k === 'raker' && i === 0 && foundP < 0.6) [[th, 1], [pw - th, -1]].forEach(([x, s2]) => { const fx2 = x + s2 * Math.min(depth * 0.9, pw * 0.25); g.line(x, -m, fx2, -Math.max(dug, depth * 0.6), `strut${c}`); g.rect(fx2 - 1.2, -Math.max(dug, depth * 0.6), fx2 + 1.2, -Math.max(dug, depth * 0.6) - 0.8, `kb${c}`); at.raker = [fx2, -depth * 0.6]; });
      if (k === 'topdown') { /* 슬래브로 */ }
    });
    if (k === 'strut' && pw > 40 && dug > 2 && removeUpTo > 1) [pw / 3, pw * 2 / 3].forEach(x => g.line(x, 0.5, x, -Math.min(sc.embed, depth + 4), `post${c}`));
    if (k === 'topdown') {
      const nB = Math.max(1, G.nB), sh = depth / nB;
      if (earthP > 0 || baseP > 0) g.rect(-0.4, 0.25, pw + 0.4, -0.35, `slab${c}`);
      for (let i = 1; i < nB; i++) if (dug >= i * sh + 0.6) g.rect(th, -i * sh + 0.25, pw - th, -i * sh - 0.35, `slab${c}`);
      const kpOn = earthP > 0 || (sc.W.excav && tau >= sc.W.excav.s - 25);
      if (kpOn) for (let i = 1; i < 6; i++) { const x = pw * i / 6; g.line(x, 0, x, -Math.min(sc.embed + 3, sc.dv - 1), `kp${c}`); }
      if (earthP > 0 && earthP < 1) { const lx = pw * 0.12; g.rect(lx - 2, 0.3, lx + 2, -0.4, 'opening'); g.text(lx, 0.6, '반출 개구부', 'eq-lab', 'middle', -4); }
    }
  }

  // ---- 굴착 장비 ----
  if (dug > 0.3 && earthP < 1 && ['support', 'excav', 'water'].includes(wpId)) {
    const c = F('excav'), k = K('excav') ? ids.excav : 'normal', rockNow = dug > cond.rockDepth;
    const ex = pw * (0.3 + 0.35 * (0.5 + 0.5 * Math.sin(T * 0.4)));
    EQ.excavator(g, ex, -dug, Math.sin(T * 0.4) > 0 ? 1 : -1, T * 3, K('excav') ? c.trim() : 'ghost');
    if (topdown && dug > 4) EQ.excavator(g, pw * 0.75, -dug, -1, T * 3 + 1, K('excav') ? c.trim() : 'ghost');
    if (dug > 7) EQ.crawler(g, pw * 0.9, 0, 1.15, 14, -dug + 2 + Math.abs(Math.sin(T)) * Math.min(dug - 3, 12), K('excav') ? c.trim() : 'ghost', '클램셸', -1);
    if (rockNow && K('excav')) {
      if (k === 'blast' || k === 'mix') {
        const ph = (T * 0.5) % 1, bx = pw * (k === 'mix' ? 0.7 : 0.5), lim = ppvLimit(cond.noise), v = ppv(cond.adj + 3) * (k === 'mix' ? 0.3 : 1);
        if (ph < 0.12) g.P(`<circle class="flash" cx="${g.X(bx).toFixed(1)}" cy="${g.Y(-dug).toFixed(1)}" r="${(10 + ph * 80).toFixed(1)}"/>`);
        const rMax = Math.hypot(bx - nb.x1, dug) + 2;
        for (let j = 0; j < 2; j++) { const rr = ((ph + j / 2) % 1) * rMax; g.P(`<circle class="vib${v > lim ? ' bad' : ''}" cx="${g.X(bx).toFixed(1)}" cy="${g.Y(-dug).toFixed(1)}" r="${(rr * cam.s).toFixed(1)}" opacity="${(0.4 * (1 - rr / rMax)).toFixed(2)}"/>`); }
        g.text(Math.min(nb.x1 - 2, Math.max((nb.x0 + nb.x1) / 2, cam.xw(78))), Math.min(nb.h, cam.ew(TOP + 4)), `진동 ${n2(v)}cm/s · 허용 ${lim}`, v > lim ? 'bad-t' : 'ok-t', 'middle', 30);
        at.blast = [nb.x1 - 2, nb.h * 0.35];
      }
      if (k === 'splitter') { const bx = pw * 0.55; g.rect(bx - 1.2, -dug, bx + 1.2, -dug + 1.6, `eq${c}`); g.line(bx, -dug + 1.6, bx + 1.2, -dug + 3.2, `eq-m${c}`); for (let j = 0; j < 4; j++) g.pl([[bx - 4 + j * 2.4, -dug], [bx - 3.4 + j * 2.4, -dug - 0.9], [bx - 4.2 + j * 2.4, -dug - 1.8]], 'crack'); g.text(bx, -dug + 4.2, '유압 할암', 'eq-lab', 'middle', -2); }
      if (k === 'normal') { g.text(pw * 0.5, -dug + 3.5, '브레이커 암반 파쇄 · 저속', 'warn-t', 'middle'); }
    }
    // 덤프: 상차 → 세륜 → 게이트 → 차로로 나가며 회전 (단면 밖으로)
    const nT = 2; for (let j = 0; j < nT; j++) { const ph = ((T * 0.06 + j / nT) % 1), x = pw - 2 + ph * 17, op = ph > 0.72 ? (1 - ph) / 0.28 : ph < 0.08 ? ph / 0.08 : 1; g.P(`<g opacity="${op.toFixed(2)}">`); EQ.truck(g, x, 0, 1, true, ''); g.P('</g>'); if (x > pw + 8) CUR.occupy(x - 3.4, x + 3.6); }
  }

  // ---- 기초 ----
  if (K('found') && depth >= 0 && foundP > 0) {
    const c = F('found'), k = ids.found, base = -Math.max(depth, 1.2);
    const pile = k !== 'mat';
    const thick = d.superTall ? 3.5 : d.tall ? 2.6 : d.heavy ? 2 : 1.4;
    const plen = Math.max(5, Math.min(sc.dv - depth - 2, Math.max(cond.rockDepth - depth + 2, 9)));
    const n = k === 'micro' ? 16 : k === 'piledraft' ? 6 : k === 'bored' ? 7 : 10;
    const pileP = clamp(foundP / 0.6, 0, 1), matP = clamp((foundP - 0.6) / 0.4, 0, 1);
    if (pile) for (let i = 0; i < n; i++) {
      const x = 3 + (pw - 6) * i / (n - 1), lp = clamp(pileP * n - i, 0, 1); if (lp <= 0) continue;
      const w = k === 'bored' ? 1.5 : k === 'micro' ? 0.25 : k === 'steel' ? 0.6 : 0.5;
      g.rect(x - w / 2, base, x + w / 2, base - plen * lp, `pile p-${k}${c}`);
      if (k === 'phc') for (let m = 6; m < plen * lp; m += 6) g.line(x - 0.6, base - m, x + 0.6, base - m, 'joint');
      if (lp < 1 && wpId === 'found') EQ.rig(g, x - 2.4, base, k === 'bored' ? 12 : 16, base - plen * lp, c.trim(), { phc: '항타기', bored: 'RCD', steel: '강관 항타', micro: '마이크로파일', piledraft: '항타·RCD' }[k] || '');
    }
    if (k === 'phc' && pileP < 1 && pileP > 0 && cond.noise !== 'low' && wpId === 'found') { const r = (T * 22) % 20; g.P(`<circle class="vib" cx="${g.X(pw * pileP).toFixed(1)}" cy="${g.Y(base + 8).toFixed(1)}" r="${(r * cam.s).toFixed(1)}" opacity="${(1 - r / 20).toFixed(2)}"/>`); at.noise = [nb.x1 + 3, nb.h * 0.6]; }
    if (matP > 0) {
      g.rect(1, base, pw - 1, base + thick * matP, `mat${c}`);
      g.text(pw * 0.5, base + thick + 0.6, `매트 ${f1(thick)}m${ids.conc === 'lowheat' && K('conc') ? ' · 저발열' : ''}`, 'eq-lab', 'middle', -3);
      if (matP < 1 && wpId === 'found') EQ.pump(g, pw + 12, 0, [pw * (0.2 + 0.6 * matP), base + thick * matP + 1], c.trim());
    }
    if (ids.water === 'anchor' && K('water')) for (let i = 0; i < 6; i++) { const x = 6 + (pw - 12) * (i + 0.5) / 6; g.line(x, base, x, base - Math.min(10, sc.dv - depth - 1), 'anc-v'); }
    at.banchor = [pw * 0.5, base - 3];
  }

  // ---- 지하 골조 ----
  if (K('base') && depth > 0.5 && baseP > 0) {
    const c = F('base'), nB = Math.max(1, G.nB), sh = depth / nB, th = sc.wallTh;
    if (!topdown) {
      const up = baseP * nB; // 아래에서 위로
      for (let i = 1; i <= nB; i++) { if (up < i - 0.95) break; const e = -depth + i * sh; g.rect(i === nB ? -0.4 : th, e + 0.25, i === nB ? pw + 0.4 : pw - th, e - 0.35, `slab${c}`); }
      const top = -depth + Math.min(depth, up * sh);
      [th + 0.2, pw - th - 0.8].forEach(x => g.rect(x, -depth, x + 0.6, top, `bwall${c}`));
      for (let i = 1; i < 7; i++) g.line(pw * i / 7, -depth + 2, pw * i / 7, top, `col${c}`);
    } else {
      [th + 0.2, pw - th - 0.8].forEach(x => g.rect(x, -depth, x + 0.6, -depth + depth * baseP, `bwall${c}`));
      g.rect(th, -depth + 0.25 + 1.5, pw - th, -depth - 0.35 + 1.5, `slab${c}`);
    }
  }
  drawBwp(g, c);

  // ---- 지상 골조 ----
  const st = sc.W.frame, nf0 = sc.NF;
  const coreAhead = K('form') && sc.fx.coreAhead ? 4 : (ids.frame === 'hybrid' && K('frame') ? 3 : 0);
  const fl = structP * nf0;
  if (K('frame') && structP > 0) drawFrame(g, sc, fl, coreAhead, F('frame'), at, wpId, T);
  else if (!K('frame') && (UNDER.has(wpId) ? false : true) && wpId !== 'frame') ghostBuilding(g, sc);
  // ---- 실내: 바닥 구성 · 천장 · 칸막이 · 도장 ----
  drawBuilding(g, c);
  // ---- 외장 (실내 공종은 단면으로) ----
  if (K('skin') && skinP > 0) drawSkin(g, sc, skinP * nf0, fl, F('skin'), at, wpId, CUT.has(wpId));
  drawEnvelope(g, c);
  // ---- 설비 ----
  const dimSys = MEPSUB.has(wpId) || ROOM.has(wpId);
  if (dimSys) g.P('<g class="dim">');
  if (K('mep') && mepP > 0) drawMep(g, sc, mepP * nf0, F('mep'), at, T);
  if (dimSys) g.P('</g>');
  drawSystems(g, c);
  // ---- 거푸집·타설 사이클 (현재 층) ----
  if (K('frame') && structP > 0 && structP < 1) drawCycle(g, sc, fl, coreAhead, wpId, at, T, c);
  drawStructDetail(g, c);
  // ---- 양중 ----
  const needCrane = (structP > 0 && structP < 1) || (wpId === 'lift') || (skinP > 0 && skinP < 1 && ['unitcw', 'pcpanel', 'metal'].includes(ids.skin));
  if (needCrane && !UNDER.has(wpId)) drawCrane(g, sc, fl, K('lift'), F('lift'), at, T, wpId);

  // ---- 공정관리 · 품질 기술 ----
  if (wpId === 'plan') drawPlan(g, sc, tau, at);
  if (wpId === 'qa') drawQA(g, sc, fl, at, T, true);

  // 계측 (지하 공종) · 지나가는 차량·보행자
  const mon = drawMonitor(g, c, settleNow, earthP, dwOn);
  drawTraffic(g, c);
  // 인접 대지 경계 (상공 투영): 지상 공종에서 크레인 선회 간섭을 읽기 쉽게
  if (!UNDER.has(wpId)) { g.line(nb.x1, 0, nb.x1, Math.max(G.H + 20, eMaxV), 'nb-proj'); g.text(nb.x1 - 0.5, Math.min(eMaxV - 4 / cam.s * 14, G.H + 14), '인접 대지 ←', 'nb-pt', 'end', 0); }
  // HUD 띠: ROI 밖으로 넘친 형상이 제목·시간축과 겹치지 않게
  g.P(`<rect class="hud-bg" x="0" y="0" width="${VW}" height="${NARROW ? 64 : 44}"/><rect class="hud-bg" x="0" y="${VH - 40}" width="${VW}" height="40"/>`);
  if (roi !== full && !UNDER.has(wpId) && !GROUND.has(wpId)) minimap(g, sc, full, roi, fl);
  if (MORE[wpId]) detailInset(g, c);
  else if (mon && wpId !== 'conc') monitorInset(g, c, mon);
  // ---- 판정 표식 ----
  const fall = [[pw * 0.5, sc.G.H * 0.5]];
  marks.forEach((m, i) => {
    const pos = at[m.mark]; if (!pos) return;
    const x = g.X(pos[0]), y = g.Y(pos[1]); if (x < 6 || x > VW - 6 || y < 30 || y > VH - 30) return;
    const r = 8 + 3 * ((T * 1.2 + i * 0.3) % 1);
    g.P(`<g class="mk s${m.sev}"><circle class="mk-r" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 4).toFixed(1)}" opacity="${(1 - ((T * 1.2 + i * 0.3) % 1)).toFixed(2)}"/><circle class="mk-c" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8.5"/><text x="${x.toFixed(1)}" y="${(y + 3.4).toFixed(1)}" text-anchor="middle">${m.n}</text></g>`);
  });
  void fall;

  // ---- HUD ----
  const dt = dateAt(sc.t0, tau);
  const wp = WP_BY_ID[wpId];
  const o = wp.multi ? (sc.qa.length ? `${sc.qa.length}개 기술` : '기술 없음') : (wp.opts.find(x => x.id === ids[wpId]) || { name: '' }).name;
  g.P(`<text class="hud-c" x="16" y="22">// SIM_${wp.code}${NARROW ? '' : ` · ${wp.en}`}</text><text class="hud-t" x="16" y="38">${esc(o)}</text>`);
  const dayT = win.skip ? '해당 공정 없음' : `${Math.round(win.e - win.s)}일 중 ${Math.round(clamp(p, 0, 1) * (win.e - win.s))}일째`;
  g.P(`<text class="hud-c" x="${VW - 16}" y="22" text-anchor="end">D+${Math.round(tau)} · ${ym(dt)}</text>`);
  g.P(NARROW ? `<text class="hud-c" x="16" y="56">${dayT}</text>` : `<text class="hud-t" x="${VW - 16}" y="38" text-anchor="end">${dayT}</text>`);
  // 아래 시간 축: 전체 공기 중 이 공종의 창
  const tx0 = 16, tx1 = VW - 16, ty = VH - 16, TX = (t) => tx0 + (tx1 - tx0) * clamp(t / sc.end, 0, 1);
  g.P(`<line class="tl-b" x1="${tx0}" y1="${ty}" x2="${tx1}" y2="${ty}"/>`);
  sc.phases.filter(x => x.n).forEach((x, i) => g.P(`<line class="tl-p" x1="${TX(x.start).toFixed(1)}" y1="${ty - 6 - (i % 3) * 3}" x2="${TX(x.end).toFixed(1)}" y2="${ty - 6 - (i % 3) * 3}"/>`));
  g.P(`<rect class="tl-w" x="${TX(win.s).toFixed(1)}" y="${ty - 3}" width="${Math.max(2, TX(win.e) - TX(win.s)).toFixed(1)}" height="6"/><line class="tl-c" x1="${TX(tau).toFixed(1)}" y1="${ty - 14}" x2="${TX(tau).toFixed(1)}" y2="${ty + 5}"/>`);
  g.P(`<text class="hud-s" x="${tx0}" y="${ty - 18}">착공 ${ym(sc.t0)}</text><text class="hud-s" x="${tx1}" y="${ty - 18}" text-anchor="end">준공 ${ym(dateAt(sc.t0, sc.end))} · ${sc.R.S.months}개월</text>`);
  if (opts.paused) g.P(`<text class="hud-s" x="${VW / 2}" y="${ty - 18}" text-anchor="middle">일시정지</text>`);

  return { at, svg: `<svg viewBox="0 0 ${VW} ${VH}" class="bsim" role="img" aria-label="${esc(wp.name)} 시공 시뮬레이션: ${esc(o)}, 착공 후 ${Math.round(tau)}일">${g.out.join('')}</svg>`, tau, date: dt };
}
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function boreXs(sc) {
  const pw = sc.G.pw, id = sc.ids.survey;
  const n = id === 'ai' ? 5 : id === 'spt' ? 3 : 4;
  return Array.from({ length: n }, (_, i) => -2 + (pw + 4) * (i + 0.5) / n);
}

// 아직 고르지 않은 골조: 점선 외곽만
function ghostBuilding(g, sc) {
  const { G } = sc;
  g.rect(G.bx0, 0, G.bx1, G.H, 'ghost-b');
  g.text((G.bx0 + G.bx1) / 2, G.H + 1, `골조 미정 (${codeOf('frame')})`, 'eq-lab ghost', 'middle', -3);
}

function drawFrame(g, sc, fl, coreAhead, c, at, wpId, T) {
  const { G, ids } = sc;
  const k = ids.frame, NF = sc.NF;
  const n = Math.min(NF, Math.floor(fl)), x0 = G.bx0, x1 = G.bx1, bw = x1 - x0;
  const top = n > 0 ? sc.floors[n - 1].e1 : 0;
  const pod = G.podium ? G.podium.h : 0;
  const bays = Math.max(2, Math.round(bw / 8.4));
  const colX = Array.from({ length: bays + 1 }, (_, i) => x0 + bw * i / bays);
  // 포디움: 지하 폭 전체
  if (pod > 0) {
    const pn = sc.floors.filter(f => f.e1 <= pod + 0.1 && sc.floors.indexOf(f) < n);
    pn.forEach(f => { g.rect(1, f.e1 + 0.2, G.pw - 1, f.e1 - 0.3, `slab${c}`); });
    const pt = pn.length ? pn[pn.length - 1].e1 : 0;
    if (pt > 0) for (let i = 0; i <= 8; i++) g.line(1 + (G.pw - 2) * i / 8, 0, 1 + (G.pw - 2) * i / 8, pt, `col${c}`);
  }
  // 코어
  const cn = Math.min(NF, n + coreAhead), ctop = cn > 0 ? sc.floors[cn - 1].e1 : 0;
  if (ctop > 0 && !['truss', 'module', 'stick', 'steel'].includes(k)) { g.rect(G.core.x0, 0, G.core.x1, ctop, `core${c}`); g.rect(G.core.x0, 0, G.core.x1, ctop, 'hatch'); }
  for (let i = 0; i < n; i++) {
    const f = sc.floors[i];
    if (k === 'modular') { const m = Math.max(2, Math.round(bw / 6)); for (let j = 0; j < m; j++) g.rect(x0 + bw * j / m + 0.25, f.e0 + 0.15, x0 + bw * (j + 1) / m - 0.25, f.e1 - 0.1, `mod${c}`); continue; }
    if (k === 'module') { const m = Math.max(2, Math.round(bw / 12)); for (let j = 0; j < m; j++) g.rect(x0 + bw * j / m + 0.6, f.e0 + 0.3, x0 + bw * (j + 1) / m - 0.6, f.e1 - 0.3, `mod${c}`); continue; }
    g.rect(x0, f.e1 + 0.18, x1, f.e1 - 0.32, `slab${c}`);
    if (k === 'rcwall') { g.rect(x0, f.e0, x0 + 0.5, f.e1, `wallp${c}`); g.rect(x1 - 0.5, f.e0, x1, f.e1, `wallp${c}`); for (let j = 1; j < bays; j++) if (j % 2) g.rect(colX[j] - 0.15, f.e0, colX[j] + 0.15, f.e1, `wallp${c}`); }
    else if (g.s > 12) colX.forEach(x => { const st2 = k === 'steel' || k === 'hybrid' || k === 'stick', w = st2 ? 0.25 : k === 'src' ? 0.5 : 0.4; g.rect(x - w, f.e0 + 0.18, x + w, f.e1 - 0.32, `colr${st2 ? ' steel' : ''}${c}`); });
    else colX.forEach(x => g.line(x, f.e0, x, f.e1, `col${k === 'src' ? ' thick' : ''}${k === 'steel' || k === 'hybrid' || k === 'stick' ? ' steel' : ''}${c}`));
    if ((k === 'steel' || (k === 'hybrid' && i % 10 === 9)) && i % 3 === 1) { g.line(colX[0], f.e0, colX[1], f.e1, `brace${c}`); g.line(colX[0], f.e1, colX[1], f.e0, `brace${c}`); }
    if (k === 'pc' && i % 1 === 0) colX.forEach(x => g.line(x - 0.5, f.e0 + 0.6, x + 0.5, f.e0 + 0.6, 'joint'));
  }
  if (k === 'truss' && n >= sc.NF) { const e = top; const pts = []; for (let j = 0; j <= 16; j++) pts.push([x0 + bw * j / 16, e + (j % 2 ? 2.2 : 0)]); g.pl(pts, `truss${c}`); g.line(x0, e + 2.2, x1, e + 2.2, `truss${c}`); }
  at.crane = [x0 + bw * 0.5, top + 3];
  at.shore = [x0 + bw * 0.3, Math.max(0, top - 4)];
  at.mep = [x0 + bw * 0.6, Math.max(2, top * 0.5)];
  if (n > 0) g.text(x1 + 1.2, top, `${n}F`, 'fl-t', 'start', 3);
}

function drawCycle(g, sc, fl, coreAhead, wpId, at, T, ctx) {
  const { G, ids } = sc, n = Math.floor(fl), fr = fl - n;
  if (n >= sc.NF) return;
  const f = sc.floors[n], x0 = G.bx0, x1 = G.bx1, bw = x1 - x0, c = wpId === 'form' || wpId === 'conc' || wpId === 'rebar' || wpId === 'pour' ? ' acc' : '';
  const k = ids.form, known = sc.known.has('form');
  const stage = fr < 0.35 ? 0 : fr < 0.6 ? 1 : fr < 0.78 ? 2 : 3;
  // 거푸집
  if (known) {
    if (k === 'conv') { for (let j = 0; j <= 10; j++) for (let lvl = 0; lvl < 3 && n - lvl >= 0; lvl++) { const ff = sc.floors[n - lvl]; g.line(x0 + bw * j / 10, ff.e0 + 0.2, x0 + bw * j / 10, ff.e1 - 0.3, `shore${lvl ? ' re' : ''}${c}`); } }
    if (k === 'alform') g.rect(x0 + 0.3, f.e0 + 0.2, x1 - 0.3, f.e1 - 0.2, `form-al${c}`);
    if (k === 'gang') [x0 - 0.8, x1 + 0.2].forEach(x => g.rect(x, f.e0 - 1, x + 0.6, f.e1 + 1.6, `form-g${c}`));
    if (k === 'acs' && G.core) { const ce = sc.floors[Math.min(sc.NF - 1, n + coreAhead)].e1; g.rect(G.core.x0 - 1.4, ce - 7, G.core.x1 + 1.4, ce + 1.5, `acs${c}`); for (let j = 0; j < 3; j++) g.line(G.core.x0 - 1.4, ce - 7 + j * 2.6, G.core.x1 + 1.4, ce - 7 + j * 2.6, `acs-l${c}`); g.text(G.core.x1 + 2, ce, 'ACS 자동상승', 'eq-lab', 'start', 3); }
    if (k === 'slip') { const ce = f.e1 + 1; g.rect(G.core.x0 - 0.8, ce - 1.4, G.core.x1 + 0.8, ce + 0.6, `form-g${c}`); for (let j = 0; j < 3; j++) g.line(G.core.x0 + (G.core.x1 - G.core.x0) * (j + 0.5) / 3, ce, G.core.x0 + (G.core.x1 - G.core.x0) * (j + 0.5) / 3, ce + 3, `eq-c${c}`); }
    if (k === 'deck') { const pts = []; for (let x = x0; x <= x1; x += 0.8) pts.push([x, f.e1 - 0.3 - ((Math.round((x - x0) / 0.8)) % 2) * 0.25]); g.pl(pts, `deck${c}`); }
    if (k === 'pcf') {
      // 공장 제작 PC: 기둥 세우기 → 보 거치 → 중공 슬래브(HCS) 깔기 → 접합부 토핑
      const nc = Math.max(3, Math.round(bw / 8)), xs = Array.from({ length: nc + 1 }, (_, j) => x0 + bw * j / nc);
      const colN = Math.ceil(xs.length * clamp(fr / 0.35, 0, 1)), beamN = Math.floor(nc * clamp((fr - 0.35) / 0.25, 0, 1)), plankP = clamp((fr - 0.6) / 0.18, 0, 1);
      xs.slice(0, colN).forEach(x => g.rect(x - 0.35, f.e0 + 0.1, x + 0.35, f.e1 - 0.6, `pc-m${c}`));
      for (let j = 0; j < beamN; j++) g.rect(xs[j] + 0.35, f.e1 - 1.1, xs[j + 1] - 0.35, f.e1 - 0.4, `pc-m${c}`);
      for (let x = x0; x < x0 + bw * plankP - 1.1; x += 1.2) g.rect(x + 0.05, f.e1 - 0.4, x + 1.15, f.e1, `pc-m${c}`);
    }
  }
  const pc = k === 'pcf' && known;
  // 철근 → 타설 → 양생 (PC는 접합부 토핑만 현장 타설)
  if (stage >= 1 && !pc) for (let x = x0 + 0.6; x < x1; x += 1.2) g.line(x, f.e1 - 0.25, x + 0.6, f.e1 - 0.25, `rebar`);
  if (stage >= 2 && !pc) { const pf = stage === 2 ? (fr - 0.6) / 0.18 : 1; g.rect(x0, f.e1 + 0.18, x0 + bw * pf, f.e1 - 0.32, `pour${c}`); }
  if (stage >= 3 && pc) g.rect(x0, f.e1 + 0.12, x0 + bw * clamp((fr - 0.78) / 0.15, 0, 1), f.e1, `pour${c}`);
  const lab = (pc ? ['PC 기둥 세우기', 'PC 보 거치', 'HCS 슬래브 깔기', '접합부 토핑'] : ['거푸집', '철근 배근', '타설', '양생 · 탈형'])[stage];
  g.text(x0 - 1, f.e1, `${n + 1}F ${lab}`, `cy-t${c}`, 'end', 3);
  // 펌프 (타설 공법을 고른 뒤에는 그 장비로)
  if (sc.known.has('pour') && (stage === (pc ? 3 : 2) || wpId === 'pour')) drawPour(g, ctx, f, [x0 + bw * 0.5, f.e1 + 0.5]);
  else if (sc.known.has('conc') && stage === (pc ? 3 : 2)) {
    const target = [x0 + bw * 0.5, f.e1 + 0.5];
    if (f.e1 < 46) EQ.pump(g, G.pw + 12, 0, target, wpId === 'conc' ? 'acc' : '');
    else { g.line(G.core.x1 + 0.4, 0, G.core.x1 + 0.4, f.e1, `pipe${c}`); g.rect(G.pw + 9, 0, G.pw + 15, 2, `eq${c}`); g.line(G.pw + 9, 1, G.core.x1 + 0.4, 1, `pipe${c}`); g.line(G.core.x1 + 0.4, f.e1 + 1, x0 + bw * 0.25, f.e1 + 3, `eq-m${c}`); g.text(G.pw + 12, 3, '고압 펌프', 'eq-lab', 'middle', -3); }
    at.pump = [G.pw + 12, 3];
    [0, 1].forEach(j => EQ.mixer(g, G.pw + 21 + j * 8, 0, T + j * 0.3, '', j));
  }
  if (wpId === 'conc') concInset(g, sc, T);
  at.shore = [x0 + bw * 0.3, Math.max(1, f.e0 - 2)];
}

function concInset(g, sc, T) {
  const k = sc.ids.conc;
  const x = 16, y = TOP, w = NARROW ? 180 : 200, h = 78;
  g.P(`<rect class="inset" x="${x}" y="${y}" width="${w}" height="${h}"/><text class="hud-s" x="${x + 8}" y="${y + 14}">강도 발현 (28일) · 선택 vs 일반</text>`);
  const fc = { normal: 30, high: 70, lowheat: 33, scc: 40, lowc: 30 }[k] || 30, rate = { normal: 1, high: 1.2, lowheat: 0.7, scc: 1, lowc: 0.65 }[k] || 1;
  const curve = (f, r) => Array.from({ length: 29 }, (_, t) => [x + 10 + (w - 20) * t / 28, y + h - 10 - (h - 30) * (f / 75) * (t / (t + 4 / r))]);
  const pp = (arr) => arr.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  g.P(`<polyline class="in-b" points="${pp(curve(30, 1))}"/><polyline class="in-a" points="${pp(curve(fc, rate))}"/>`);
  if (k === 'lowheat') g.P(`<text class="hud-s" x="${x + w - 8}" y="${y + h - 14}" text-anchor="end">수화열 최고 −10℃</text>`);
  if (k === 'lowc') g.P(`<text class="hud-s" x="${x + w - 8}" y="${y + h - 14}" text-anchor="end">CO₂ −30% · 초기 강도 느림</text>`);
  if (k === 'high') g.P(`<text class="hud-s" x="${x + w - 8}" y="${y + h - 14}" text-anchor="end">${fc}MPa</text>`);
  void T;
}

function drawSkin(g, sc, sf, fl, c, at, wpId, cut) {
  const { G, ids } = sc, x0 = G.bx0, x1 = G.bx1, bw = x1 - x0, k = ids.skin;
  const n = Math.min(Math.floor(sf), Math.floor(fl));
  if (cut) {
    // 단면: 외장은 건물 양끝의 얇은 띠 (속이 보이게)
    const th = k === 'wet' ? 0.3 : k === 'unitcw' || k === 'cw' ? 0.25 : 0.2;
    if (n > 0) { const top = sc.floors[n - 1].e1; g.rect(x0 - th, 0, x0, top, `skin sk-${k}${c}`); g.rect(x1, 0, x1 + th, top, `skin sk-${k}${c}`); }
    return;
  }
  for (let i = 0; i < n; i++) {
    const f = sc.floors[i];
    const m = Math.max(2, Math.round(bw / (k === 'unitcw' ? 1.5 : 3)));
    if (k === 'metal') { g.rect(x0, f.e0, x1, f.e1, `skin sk-metal${c}`); continue; }
    if (k === 'wet') { g.rect(x0, f.e0, x1, f.e1, `skin sk-wet${c}`); for (let j = 1; j < 4; j++) g.rect(x0 + bw * j / 4 - 0.8, f.e0 + 0.9, x0 + bw * j / 4 + 0.8, f.e1 - 0.6, 'win'); continue; }
    g.rect(x0, f.e0, x1, f.e1, `skin sk-${k}${c}`);
    for (let j = 1; j < m; j++) g.line(x0 + bw * j / m, f.e0, x0 + bw * j / m, f.e1, 'mull');
  }
  if (k === 'wet' && n < sc.NF && n > 0) { const top = sc.floors[Math.min(sc.NF - 1, n + 1)].e1; g.rect(x0 - 1.2, 0, x0 - 0.4, top, 'scaf'); g.rect(x1 + 0.4, 0, x1 + 1.2, top, 'scaf'); }
  if (k === 'unitcw' && n < sc.NF && n < Math.floor(fl) && wpId === 'skin') { const f = sc.floors[n]; g.rect(x1 + 0.6, f.e0 + 1, x1 + 2.2, f.e1 + 1, 'unit acc'); g.line(x1 + 1.4, f.e1 + 1, x1 + 1.4, Math.min(sc.floors[Math.min(sc.NF - 1, n + 4)].e1, f.e1 + 14), 'eq-c'); g.text(x1 + 3, f.e1, '유닛 인양', 'eq-lab', 'start', 3); at.crane = [x1 + 1.4, f.e1 + 2]; }
  if (n > 0) g.text(x1 + 1.2, sc.floors[n - 1].e1 - 3, `외장 ${n}F`, 'fl-t sk', 'start', 3);
}

function drawMep(g, sc, mf, c, at, T) {
  const { G, ids } = sc, x0 = G.bx0, x1 = G.bx1, bw = x1 - x0, k = ids.mep;
  const n = Math.min(sc.NF, Math.floor(mf));
  if (n <= 0) return;
  const top = sc.floors[n - 1].e1;
  g.line(G.core.x0 + 0.6, -Math.max(0, G.depth - 1), G.core.x0 + 0.6, top, `riser${c}`); g.line(G.core.x1 - 0.6, -Math.max(0, G.depth - 1), G.core.x1 - 0.6, top, `riser r2${c}`);
  for (let i = 0; i < n; i++) {
    const f = sc.floors[i], e = f.e1 - 0.75;
    if (k === 'prefab') { g.rect(x0 + 1, e + 0.35, x1 - 1, e - 0.35, `rack${c}`); for (let j = 1; j < 4; j++) g.line(x0 + bw * j / 4, e + 0.35, x0 + bw * j / 4, e - 0.35, 'mull'); }
    else if (k === 'hookup') { for (let j = 0; j < 4; j++) g.line(x0 + 1, e - j * 0.22, x1 - 1, e - j * 0.22, `duct${c}`); }
    else { g.line(x0 + 1, e, x1 - 1, e, `duct${c}`); g.line(x0 + 1.5, e - 0.4, x1 - 1.5, e - 0.4, `duct d2${c}`); if (k === 'spool') for (let j = 1; j < 5; j++) g.line(x0 + bw * j / 5, e - 0.6, x0 + bw * j / 5, e - 0.2, 'mull'); }
    if (k === 'conv' && i % 4 === 2) { const x = x0 + bw * (0.3 + 0.4 * ((i * 37) % 10) / 10); g.P(`<text class="bad-t" x="${g.X(x).toFixed(1)}" y="${(g.Y(e) + 3).toFixed(1)}" text-anchor="middle">×</text>`); if (!at.mep2) at.mep2 = [x, e]; }
  }
  if (k === 'conv' && at.mep2) at.mep = at.mep2;
  void T;
}

function drawCrane(g, sc, fl, known, c, at, T, wpId) {
  const { G, ids, fx, nb, cond } = sc;
  const n = Math.min(sc.NF, Math.ceil(fl)), top = n > 0 ? sc.floors[n - 1].e1 : 0;
  const R = fx.craneR || 60, cx = sc.crX;
  const H = Math.max(top + 14, 24);
  const loadE = lerp(1, top + 3, 0.5 + 0.5 * Math.sin(T * 0.7));
  if (!known) { EQ.tower(g, cx, 0, H, R, R * 0.3, 0.2, 0.5, null, '', true, `양중 장비 미정 (${codeOf('lift')})`); return; }
  const k = ids.lift;
  if (k === 'tower') {
    const slew = T * 0.45, r = EQ.tower(g, cx, 0, H, R, R * 0.3, slew, 0.55 + 0.25 * Math.sin(T * 0.9), loadE, c.trim(), false, `타워크레인 R=${R}m`);
    const over = cx - R < nb.x1;
    g.line(cx - R, H + 9, cx + R, H + 9, 'reach'); g.text(cx - R, H + 9, '←', 'reach-t', 'middle', 3); g.text(cx + R, H + 9, '→', 'reach-t', 'middle', 3);
    if (over) { g.line(Math.max(cx - R, nb.x0 - 4), H + 9, nb.x1, H + 9, 'reach bad'); at.oversail = [Math.max(cx - R, nb.x0) + 2, H + 9]; }
    if (cx + R > G.pw + 6) at.road = [G.pw + 10, H + 9];
    void r;
  } else if (k === 'luffing') {
    const ang = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(T * 0.5));
    EQ.luffing(g, cx, 0, H, R * 0.7, ang, loadE, c.trim(), `러핑 크레인 R=${R}m`);
    g.line(cx - R * 0.3, H + 10, cx + R, H + 10, 'reach'); g.text(cx + R, H + 10, '→', 'reach-t', 'middle', 3);
  } else if (k === 'crawler' || k === 'ringer') {
    const big = k === 'ringer', x = G.pw + (big ? 16 : 12);
    if (big) g.P(`<ellipse class="eq ${c}" cx="${g.X(x).toFixed(1)}" cy="${g.Y(0.6).toFixed(1)}" rx="${(9 * g.s).toFixed(1)}" ry="${(1.2 * g.s).toFixed(1)}"/>`);
    EQ.crawler(g, x, 0, 1.05 + 0.1 * Math.sin(T * 0.4), Math.max(top + 20, big ? 90 : 60), loadE, c.trim(), big ? '링거 크레인' : '크롤러 크레인', -1);
  } else if (k === 'mobile') {
    EQ.truck(g, G.pw + 14, 0, -1, false, c.trim()); g.line(G.pw + 14, 3, G.pw + 2, Math.max(top + 8, 20), `eq-m ${c}`); if (CUR) CUR.occupy(G.pw + 9, G.pw + 18);
    g.rect(G.bx1 + 0.4, 0, G.bx1 + 1.6, top + 3, `hoist ${c}`); g.rect(G.bx1 + 0.3, loadE, G.bx1 + 1.7, loadE + 2.4, 'eq-load'); g.text(G.bx1 + 2.2, top + 3, '호이스트', 'eq-lab', 'start', 3);
  }
  at.crane = at.crane || [cx, H];
  at.crane2 = [cx, H + 4];
  void cond; void wpId;
}

function drawPlan(g, sc, tau, at) {
  const C = sc.R.C.list, fx = sc.fx, x = NARROW ? 16 : 230, y = TOP, w = NARROW ? VW - 112 : VW - 460, h = 54;
  const det = Math.round(C.length * fx.detect), sol = Math.round(det * fx.solve);
  g.P(`<rect class="inset" x="${x}" y="${y}" width="${w}" height="${h}"/><text class="hud-s" x="${x + 8}" y="${y + 14}">공정 간섭 ${C.length}건 · 사전 발견 ${det} · 해소 ${sol}</text>`);
  const TX = (t) => x + 8 + (w - 16) * clamp(t / sc.end, 0, 1);
  C.forEach((cl, i) => {
    const cx = TX((cl.start + cl.end) / 2), cy = y + 28 + (i % 3) * 7;
    const found = i < det, solved = i < sol, past = (cl.start + cl.end) / 2 <= tau;
    const cls = solved ? 'pl-ok' : found ? 'pl-f' : past ? 'pl-bad' : 'pl-n';
    g.P(`<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${cy}" r="2.6"/>`);
  });
  g.P(`<line class="tl-c" x1="${TX(tau).toFixed(1)}" y1="${y + 20}" x2="${TX(tau).toFixed(1)}" y2="${y + h - 4}"/>`);
  at.plan = [0, 0];
}

function drawQA(g, sc, fl, at, T, focus) {
  const { G, qa } = sc, c = focus ? ' acc' : '';
  const n = Math.min(sc.NF, Math.floor(fl)), top = n > 0 ? sc.floors[n - 1].e1 : 0;
  if (qa.includes('iot')) for (let i = 0; i < n; i += Math.max(1, Math.round(sc.NF / 8))) { const e = sc.floors[i].e1; g.circ(G.bx0 + (G.bx1 - G.bx0) * 0.5, e, 2.4, `iot${c}`); if (((T * 2 + i) % 3) < 1) g.circ(G.bx0 + (G.bx1 - G.bx0) * 0.5, e, 6, 'iot-r'); }
  if (qa.includes('drone')) { const dx = lerp(-10, G.pw + 10, 0.5 + 0.5 * Math.sin(T * 0.3)), de = Math.max(top, 10) + 12 + Math.sin(T * 2) * 0.6; g.line(dx - 2, de, dx + 2, de, `eq-m${c}`); g.circ(dx - 2, de + 0.3, 2, `eq${c}`); g.circ(dx + 2, de + 0.3, 2, `eq${c}`); g.poly([[dx, de], [dx - 6, Math.max(top, 0)], [dx + 6, Math.max(top, 0)]], 'cone'); g.text(dx, de + 1.6, '드론', 'eq-lab', 'middle', -3); }
  if (qa.includes('scan')) { const sx = G.pw + 3; g.line(sx, 0, sx - 0.8, -0.1, 'eq-l'); g.line(sx, 0, sx + 0.8, -0.1, 'eq-l'); g.line(sx, 0, sx, 1.6, `eq-m${c}`); const a = (T * 0.8) % 1; g.line(sx, 1.6, G.bx1, lerp(0, Math.max(top, 6), a), 'ray'); g.line(sx, 1.6, G.bx1, lerp(0, Math.max(top, 6), (a + 0.5) % 1), 'ray'); g.text(sx, 2.2, '3D 스캔', 'eq-lab', 'middle', -3); }
  if (qa.includes('vision')) { const vx = -1, ve = 9; g.line(vx, 0, vx, ve, `eq-m${c}`); g.rect(vx, ve - 0.4, vx + 1.6, ve + 0.4, `eq${c}`); g.poly([[vx + 1.6, ve], [G.pw * 0.6, 0], [G.pw * 0.2, 0]], 'cone'); g.text(vx, ve + 1, 'AI 비전', 'eq-lab', 'middle', -3); }
  if (qa.includes('wear')) [0.2, 0.45, 0.7].forEach((f, i) => { const x = G.bx0 + (G.bx1 - G.bx0) * f, e = n > 2 ? sc.floors[Math.max(0, n - 2)].e1 : 0; EQ.worker(g, x, e, c.trim()); g.circ(x, e + 1, 4 + 2 * ((T + i * 0.3) % 1), 'wear-r'); });
  if (qa.includes('rfid')) [0, 1, 2].forEach(j => { const x = G.pw + 8 + j * 3; g.rect(x - 1, 0, x + 1, 1.2, 'pallet'); g.circ(x, 1.6, 1.6, `iot${c}`); });
  if (qa.includes('twin')) { const x = NARROW ? 16 : VW - 186, y = TOP, w = 170, h = 96; g.P(`<rect class="inset" x="${x}" y="${y}" width="${w}" height="${h}"/><text class="hud-s" x="${x + 8}" y="${y + 14}">디지털 트윈 · 계측 동기화</text>`); const ht = (h - 30) * clamp(fl / sc.NF, 0, 1); g.P(`<rect class="twin" x="${x + 70}" y="${(y + h - 8 - ht).toFixed(1)}" width="30" height="${ht.toFixed(1)}"/><text class="hud-s" x="${x + 8}" y="${y + h - 10}">변위 ${sc.mv.defl}mm</text>`); }
  if (qa.includes('clash')) g.text(G.bx0, Math.max(top, 4) + 2, 'BIM 간섭검토 완료 구간', 'ok-t', 'start', -2);
  at.qa = [G.bx0, top];
}
