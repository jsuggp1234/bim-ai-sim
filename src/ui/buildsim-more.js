// 기초 이후 세부 공종의 시공 장면 (buildsim.js의 frame()이 부른다).
// 가설 울타리·방음벽 · 지하 방수층 · 철근 가공·선조립 · 타설 장비 · 철골 접합 · 호이스트·점프 엘리베이터 ·
// 창호·단열·지붕층 · 공조·위생·소방·전기·통신 계통 · 승강로 · 칸막이·바닥·천장·도장 · 조경 · 시운전 점등,
// 그리고 고른 공법의 단면 상세도(층 구성·두께)와 판정 근거 수치를 왼쪽 위 작은 창에 그린다.
import { siteNoise, pumpMPa, uLimit, elevSpeed, HOIST, BOOM_REACH, BARRIER } from '../sim/impact-more.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f1 = (v) => Math.round(v * 10) / 10;
const n2 = (v) => Math.round(v * 100) / 100;
const STEEL_FRAMES = ['hybrid', 'steel', 'src', 'truss', 'module', 'stick'];
const ROOMS = ['part', 'floor', 'ceil', 'paint'], MEPS = ['hvac', 'plumb', 'fire', 'elec', 'ict'];
const PLEN = { central: 0.9, vrf: 0.5, geo: 0.8, radiant: 0.35, district: 0.3, clean: 1.4, crac: 0.6, process: 0.8 };

// 세부 공종이 진행되는 층 수 (그 공종의 공정 창 안에서 아래층부터)
const upTo = (c, k) => (c.K(k) ? Math.min(c.sc.NF, Math.floor(c.P(k) * c.sc.NF + 1e-6)) : 0);
const visF = (c, f) => f.e1 >= c.eMinV - 2 && f.e0 <= c.eMaxV + 2;
// 화면에 보이는 층이 많으면(전체 보기) 몇 층 걸러 그린다. 확대 보기에서는 모든 층
const step = (c, n) => { const vis = (c.eMaxV - c.eMinV) / 3.4; return vis <= 16 ? 1 : Math.max(1, Math.ceil(Math.min(n, vis) / 16)); };

// ---------- 땅 위·지하: 가설 · 조경 · 지중 열교환 ----------
export function drawSite(g, c) {
  const { sc, wpId, T, K, P, at } = c, { G, ids, cond, nb } = sc, pw = G.pw;
  const pl = -Math.min(3, cond.adj / 2);
  // 가설 울타리·방음벽: 착공 준비부터 조경 끝 무렵까지
  if (K('prep')) {
    const pp = P('prep'), lp = K('land') ? P('land') : 0;
    const Hf = { std: 3, sound: 10, modular: 3, mini: 2 }[ids.prep] || 3;
    if (pp > 0 && lp < 0.85) {
      const h = Hf * clamp(pp * 1.4, 0, 1), cls = `fence${ids.prep === 'sound' ? ' snd' : ids.prep === 'mini' ? ' fmesh' : ''}${c.F('prep')}`;
      g.rect(pl - 0.25, 0, pl + 0.25, h, cls); g.rect(pw + 4.6, 0, pw + 5.1, Math.min(h, 3), cls);
      if (ids.prep === 'sound' && h > 2) for (let e = 1; e < h; e += 1.5) g.line(pl - 0.25, e, pl + 0.25, e, 'fence-l');
      if (wpId === 'prep' || wpId === 'land') g.text(pl, h + 0.6, ids.prep === 'sound' ? `방음벽 ${Hf}m` : ids.prep === 'mini' ? '펜스' : `가설 울타리 ${Hf}m`, 'eq-lab', 'middle', -3);
      // 현장 사무실 (도로 쪽, 게이트 뒤)
      const ox = pw + 7.5, nBox = ids.prep === 'modular' ? 3 : ids.prep === 'mini' ? 1 : 2, two = ids.prep === 'modular';
      if (pp > 0.3) for (let i = 0; i < nBox; i++) { const lv = two && i === 2 ? 1 : 0, xi = two && i === 2 ? 0 : i; g.rect(ox + xi * 6.2, lv * 2.7, ox + xi * 6.2 + 6, lv * 2.7 + 2.6, `office${c.F('prep')}`); }
      if (pp > 0.3 && (wpId === 'prep')) g.text(ox + 6, (two ? 5.4 : 2.6) + 0.4, ids.prep === 'modular' ? '모듈러 사무실 · 스마트 게이트' : '현장 사무실', 'eq-lab', 'middle', -3);
      // 세륜 시설
      if (pp > 0.5 && ids.prep !== 'mini') { g.rect(pw + 5.2, -0.5, pw + 7.2, 0.1, `wash${c.F('prep')}`); if (wpId === 'prep' || (P('excav') > 0 && P('excav') < 1)) for (let j = 0; j < 4; j++) g.circ(pw + 5.4 + j * 0.5, 0.4 + ((T * 3 + j * 0.3) % 1) * 0.8, Math.max(1, 0.12 * g.s), 'wdrop'); }
      if (ids.prep === 'sound' && pp > 0.6) { g.line(pl + 1.2, 0, pl + 1.2, Math.min(h, 6), 'eq-c'); g.rect(pl + 0.6, 5.4, pl + 3.4, 7, 'board'); g.text(pl + 2, 6.1, `${siteNoise(cond.adj, 'sound')}dB`, 'board-t', 'middle', 3); }
    }
    // 소음 전파 (굴착·브레이커 → 인접 건물)
    if (wpId === 'prep' && cond.noise !== 'low') {
      const L = siteNoise(cond.adj, ids.prep), src = [pw * 0.35, 1.5], bar = BARRIER[ids.prep] ?? 5;
      for (let i = 0; i < 4; i++) {
        const r = ((T * 0.5 + i / 4) % 1) * (pw * 0.35 - nb.x1 + 4), op = 1 - r / (pw * 0.35 - nb.x1 + 4);
        const cut = r > pw * 0.35 - pl && bar >= 10;
        g.P(`<path class="nwave${cut ? ' cut' : ''}" d="M${g.X(src[0] - r * 0.98).toFixed(1)} ${g.Y(src[1] + r * 0.2).toFixed(1)} A ${(r * g.s).toFixed(1)} ${(r * g.s).toFixed(1)} 0 0 0 ${g.X(src[0] - r * 0.98).toFixed(1)} ${g.Y(src[1] - r * 0.05).toFixed(1)}" opacity="${(op * 0.8).toFixed(2)}"/>`);
      }
      g.text(nb.x1 - 1, nb.h * 0.62, `${L}dB(A)`, L > 65 ? 'bad-t' : 'ok-t', 'end', 3);
      at.noise = [nb.x1 + 1.5, nb.h * 0.6];
    }
  }
  // 지중 열교환 (지열 공조)
  if (K('hvac') && ids.hvac === 'geo' && P('hvac') > 0) {
    const n = 7, dep = Math.min(sc.dv + 40, 150), on = Math.ceil(n * clamp(P('hvac') * 1.6, 0, 1));
    for (let i = 0; i < on; i++) { const x = 2 + (pw - 4) * (i + 0.5) / n; g.line(x, -G.depth - 0.5, x, -dep, `geo-b${c.F('hvac')}`); }
    if (wpId === 'hvac') g.text(pw * 0.5, -Math.min(sc.dv - 4, G.depth + 14), `지중 열교환 보어홀 (150m)`, 'eq-lab', 'middle', 3);
    at.geo = [pw * 0.5, -G.depth - 6];
  }
  // 조경·외부
  if (K('land') && P('land') > 0) drawLand(g, c);
}

function drawLand(g, c) {
  const { sc, wpId, at } = c, { G, ids } = sc, pw = G.pw, lp = c.P('land'), k = ids.land, a = c.F('land');
  const segs = [[0.6, G.bx0 - 0.6], [G.bx1 + 0.6, pw - 0.6]].filter(([s, e]) => e - s > 1.2);
  segs.forEach(([s, e]) => {
    const e1 = s + (e - s) * clamp(lp * 1.2, 0, 1);
    if (k === 'deck' && G.depth > 0.5) { g.rect(s, 0, e1, 1.2, `soil${a}`); g.rect(s, 0, e1, 0.15, `drainb`); }
    else if (k === 'ind') g.rect(s, -0.05, e1, 0.45, `pave heavy${a}`);
    else if (k === 'lid') { g.rect(s, -0.05, e1, 0.25, `pave perm${a}`); }
    else g.rect(s, -0.05, e1, 0.25, `pave${a}`);
    const top = k === 'deck' && G.depth > 0.5 ? 1.2 : 0.25;
    if (k !== 'ind') for (let x = s + 3; x < e1 - 1; x += k === 'deck' ? 5 : 7) { const big = k === 'deck' && ((x * 7) | 0) % 2; g.line(x, top, x, top + (big ? 5 : 3.4), 'trunk'); g.circ(x, top + (big ? 5.6 : 3.8), (big ? 1.9 : 1.4) * g.s, `tree${a}`); }
    if (k === 'lid' && e1 - s > 6) { const m = (s + e1) / 2; g.poly([[m - 2, 0.25], [m - 1, -0.6], [m + 1, -0.6], [m + 2, 0.25]], 'rg'); if (wpId === 'land') g.text(m, -0.6, '빗물 정원', 'eq-lab', 'middle', 10); }
    if (k === 'pre') for (let x = s + 1; x < e1 - 1.4; x += 4.5) g.rect(x, 0.25, x + 1.4, 0.95, 'pcblk');
  });
  if (k === 'deck' && G.depth > 0.5 && wpId === 'land' && segs.length) { const [s, e] = segs[0]; for (let x = s + 1; x < e - 0.5; x += 2.2) g.line(x, 2.6, x, 1.4, 'load-a'); g.text((s + e) / 2, 3.2, '토양 1.2m + 수목 ≈ 25kN/㎡', 'warn-t', 'middle', -2); at.deckload = [(s + e) / 2, 1.6]; }
  if (k === 'ind' && wpId === 'land') { const [s, e] = segs[segs.length - 1] || [0, 0]; if (e > s) g.text((s + e) / 2, 0.45, '중차량 포장', 'eq-lab', 'middle', -4); }
}

// ---------- 지하 방수 ----------
export function drawBwp(g, c) {
  const { sc, wpId, at, T } = c, { G, ids, cond } = sc, pw = G.pw, depth = G.depth;
  if (!c.K('bwp') || depth <= 0.5) return;
  const bp = c.P('bwp'), k = ids.bwp, a = c.F('bwp'), th = sc.wallTh;
  if (bp <= 0) return;
  const top = -depth + depth * clamp(bp * 1.15, 0, 1);
  const L = th + 0.12, Rr = pw - th - 0.12;
  if (k === 'sheet') { [[L + 0.1, 'l'], [Rr - 0.1, 'r']].forEach(([x]) => g.line(x, -depth - 0.3, x, top, `wp wp-sheet${a}`)); g.line(L, -depth - 0.4, Rr, -depth - 0.4, `wp wp-sheet${a}`); if (cond.adj < 15 && wpId === 'bwp') { g.text(L + 0.2, -depth * 0.45, '✕ 작업 공간 없음', 'bad-t', 'start', 3); } }
  if (k === 'pre') { [L - 0.05, Rr + 0.05].forEach(x => g.line(x, -depth - 0.3, x, top, `wp wp-pre${a}`)); g.line(L, -depth - 0.35, Rr, -depth - 0.35, `wp wp-pre${a}`); }
  if (k === 'bento') { [L - 0.05, Rr + 0.05].forEach(x => g.line(x, -depth - 0.3, x, top, `wp wp-bento${a}`)); g.line(L, -depth - 0.35, Rr, -depth - 0.35, `wp wp-bento${a}`); }
  if (k === 'cryst') { [L + 0.75, Rr - 0.75].forEach(x => g.line(x, -depth, x, top, `wp wp-cryst${a}`)); [L + 1.3, Rr - 1.3].forEach(x => g.line(x, -depth + 0.3, x, top, 'dbl-w')); g.line(L + 0.9, -depth + 0.15, Rr - 0.9, -depth + 0.15, 'drain'); g.rect(pw * 0.5 - 0.8, -depth - 0.9, pw * 0.5 + 0.8, -depth + 0.1, 'sump'); }
  if (k === 'tank') { const nB = Math.max(1, G.nB); for (let i = 0; i <= nB; i++) { const e = -depth + i * depth / nB; if (e > top) break; [L + 0.4, Rr - 0.4].forEach(x => g.P(`<rect class="wstop${a}" x="${(g.X(x) - 2.5).toFixed(1)}" y="${(g.Y(e) - 2.5).toFixed(1)}" width="5" height="5" transform="rotate(45 ${g.X(x).toFixed(1)} ${g.Y(e).toFixed(1)})"/>`)); } }
  // 수압 (정수압 삼각형) — 지하수면 아래
  const gw = cond.gw;
  if (depth > gw + 0.5 && (wpId === 'bwp' || wpId === 'water')) {
    const head = depth - gw, wmax = Math.min(4, head * 0.25);
    g.poly([[-0.2, -gw], [-0.2, -depth], [-0.2 - wmax, -depth]], 'hydro');
    for (let e = -gw - 1.5; e > -depth; e -= 2) { const w = wmax * (-gw - e) / head; g.line(-0.2 - w, e, -0.4, e, 'flow'); }
    if (wpId === 'bwp') g.text(-0.4 - wmax, -depth + 0.6, `${Math.round(9.81 * head)}kPa`, 'gw-t', 'end', 0);
    const lk = sc.fx.leak ?? 1, ph = (T * 0.8) % 1;
    if (wpId === 'bwp' && lk >= 0.8) g.circ(L + 0.4, -depth * (0.3 + 0.5 * ph), Math.max(1.4, 0.18 * g.s), 'drip');
  }
  at.leak = [L + 0.4, -depth * 0.6];
}

// ---------- 지상: 층마다 쌓이는 세부 공종 ----------
// 공종이 끝난 층 수와 지금 층의 진행률 (0..1)
const workOf = (c, k) => { if (!c.K(k)) return { n: 0, fr: 0 }; const v = c.P(k) * c.sc.NF; const n = Math.min(c.sc.NF, Math.floor(v + 1e-6)); return { n, fr: n >= c.sc.NF ? 0 : v - n }; };
// 실제 두께로 쌓되 확대 화면에서는 얇은 층도 최소 px로 보이게 (아래 → 위). 맨 위 높이(m)를 돌려준다
function stackUp(g, x0, x1, e, L, minPx) {
  const xa = g.X(x0), xb = g.X(x1); let y = g.Y(e);
  if (xb - xa < 0.5) return e;
  L.forEach(([t, cls]) => { const h = Math.max(t * g.s, minPx); if (h < 0.3) return; y -= h; g.P(`<rect class="${cls}" x="${xa.toFixed(1)}" y="${y.toFixed(1)}" width="${(xb - xa).toFixed(1)}" height="${h.toFixed(1)}"/>`); });
  return e + (g.Y(e) - y) / g.s;
}
const FLOOR_L = {
  wet: [[0.03, 'fb-ins'], [0.04, 'fb-foam'], [0.04, 'fb-mort'], [0.01, 'fb-fin']],
  dryondol: [[0.04, 'fb-ins'], [0.03, 'fb-dry'], [0.01, 'fb-fin']],
  oa: [[0.25, 'fb-void'], [0.035, 'fb-oa'], [0.007, 'fb-fin']],
  epoxy: [[0.003, 'fb-epoxy']], polish: [[0.002, 'fb-pol']],
  stone: [[0.04, 'fb-mort'], [0.03, 'fb-stone']], tile: [[0.01, 'fb-mort'], [0.003, 'fb-tile']],
};
const FLOOR_NM = { wet: '습식 온돌 (기포·방통)', dryondol: '건식 온돌 패널', oa: 'OA 이중 바닥', epoxy: '에폭시 도장', polish: '콘크리트 연마', stone: '석재 붙임', tile: '비닐 시트·카펫 타일' };
const PART_NM = { block: '조적 블록', dry: '경량 철골 석고보드', alc: 'ALC 블록', module: '모듈 패널', cleanp: '클린룸 패널' };
const CEIL_NM = { mbar: 'M-bar 석고 천장', tbar: 'T-bar 흡음 텍스', exposed: '노출 천장 (도장)', module: '천장 모듈 (조명 일체)', cleang: '클린룸 FFU 그리드' };
const PAINT_NM = { roller: '롤러 도장', airless: '에어리스 스프레이', robot: '도장 로봇', eco: '친환경 무VOC 도장', paper: '벽지' };

export function drawBuilding(g, c) {
  const { sc, K, wpId } = c, { G, ids } = sc;
  const x0 = G.bx0, x1 = G.bx1, bw = x1 - x0, NF = sc.NF;
  if (!K('frame') || c.P('frame') <= 0) return;
  const built = Math.min(NF, Math.floor(c.fl));
  const W = { part: workOf(c, 'part'), floor: workOf(c, 'floor'), ceil: workOf(c, 'ceil'), paint: workOf(c, 'paint') };
  const plen = ids.ceil === 'exposed' ? 0 : PLEN[ids.hvac] ?? 0.6;
  const st = step(c, built), zoom = g.s > 12, minPx = zoom ? 1.8 : 0;
  // 지금 진행 중인 층의 범위: 끝난 층은 전체, 진행 층은 앞쪽(x0)부터 진행률만큼
  const ext = (w, i) => (i < w.n ? 1 : i === w.n ? w.fr : 0);
  for (let i = 0; i < built; i++) {
    const f = sc.floors[i]; if (!visF(c, f)) continue;
    const fl0 = i === 0 ? 0.02 : f.e0 + 0.18, slabBot = f.e1 - 0.32, cl = slabBot - plen;
    const few = (i % st) === 0 || i === built - 1;
    const xf = ext(W.floor, i), xc = ext(W.ceil, i), xp = ext(W.part, i), xpa = ext(W.paint, i);
    let ftop = fl0;
    if (xf > 0) ftop = drawFloorBuild(g, c, ids.floor, x0 + 0.3, x0 + 0.3 + (bw - 0.6) * xf, fl0, minPx, zoom);
    if (xc > 0 && few) drawCeil(g, c, ids.ceil, x0 + 0.4, x0 + 0.4 + (bw - 0.8) * xc, cl, slabBot, zoom);
    if (xp > 0 && few) drawPart(g, c, ids.part, x0, x1, Math.max(fl0, ftop) + 0.02, ids.ceil === 'exposed' || !(xc > 0) ? slabBot : cl, i, xp, xpa, zoom);
    // 지금 층의 작업자·장비 (확대 화면에서)
    if (zoom && ROOMS.includes(wpId)) {
      const w = W[wpId];
      if (i === w.n && w.fr > 0) workerAt(g, c, wpId, x0 + 0.3 + (bw - 0.6) * w.fr, Math.max(fl0, ftop), cl, f);
      if (i === Math.min(built - 1, w.n) && few) g.text(x0 + 0.7, Math.min(cl, slabBot) - 0.35, `${i + 1}F ${({ part: PART_NM, floor: FLOOR_NM, ceil: CEIL_NM, paint: PAINT_NM })[wpId][ids[wpId]] || ''}${w.fr > 0 && i === w.n ? ` · ${Math.round(w.fr * 100)}%` : i < w.n ? ' · 완료' : ''}`, 'cy-t acc', 'start', 3);
    }
  }
  const cur = (k) => sc.floors[clamp(W[k].fr > 0 ? W[k].n : W[k].n - 1, 0, Math.max(0, built - 1))];
  if (wpId === 'floor' && built > 0) { const f = cur('floor'); c.at.wetfloor = [x0 + Math.max(1.5, bw * Math.max(0.1, W.floor.fr) * 0.5), f.e0 + 0.6]; }
  if (wpId === 'ceil' && built > 0) { const f = cur('ceil'); c.at.ceilgap = [x0 + Math.min(bw * 0.7, 6), f.e1 - 0.32 - plen / 2]; }
  if (wpId === 'part' && built > 0) { const f = cur('part'); c.at.chase = [x0 + bw / Math.max(2, Math.round(bw / 9)), (f.e0 + f.e1) / 2]; }
  if (wpId === 'paint' && built > 0) { const f = cur('paint'); c.at.paint = [x0 + 2, (f.e0 + f.e1) / 2]; }
}
function drawFloorBuild(g, c, k, xa, xb, e, minPx, zoom) {
  const a = c.F('floor'), L = FLOOR_L[k] || FLOOR_L.tile;
  const top = stackUp(g, xa, xb, e, L, minPx);
  if (a && zoom) g.line(xa, top, xb, top, 'acc-top');
  if (zoom && k === 'wet') for (let x = xa + 0.1; x < xb - 0.05; x += 0.2) g.circ(x, e + 0.07 + 0.02, Math.max(0.8, 0.008 * g.s), 'fb-coil');
  if (k === 'oa' && g.s > 6) for (let x = xa + 0.3; x < xb - 0.2; x += 0.6) g.line(x, e, x, e + 0.25, 'fb-ped');
  if (k === 'polish' && zoom) g.line(xa, e + 0.004, xb, e + 0.004, 'fb-pol' + a);
  return top;
}
function drawCeil(g, c, k, xa, xb, e, slab, zoom) {
  const a = c.F('ceil');
  if (k === 'exposed') { g.line(xa, slab - 0.02, xb, slab - 0.02, `cl-exp${a}`); return; }
  if (zoom) { for (let x = xa + 0.6; x < xb - 0.2; x += 1.2) g.line(x, e + 0.02, x, slab, 'cl-hang'); }
  else if (g.s > 5) for (let x = xa + 0.8; x < xb - 0.4; x += k === 'tbar' || k === 'cleang' ? 1.2 : 2.4) g.line(x, e, x, slab, 'cl-hang');
  if (zoom) {
    const h = Math.max(2, 0.015 * g.s);
    g.P(`<rect class="clb cl-${k}${a}" x="${g.X(xa).toFixed(1)}" y="${g.Y(e).toFixed(1)}" width="${(g.X(xb) - g.X(xa)).toFixed(1)}" height="${h.toFixed(1)}"/>`);
    if (k === 'tbar' || k === 'cleang') for (let x = xa + 0.6; x < xb; x += 0.6) g.P(`<line class="cl-tick" x1="${g.X(x).toFixed(1)}" y1="${g.Y(e).toFixed(1)}" x2="${g.X(x).toFixed(1)}" y2="${(g.Y(e) + h + 2).toFixed(1)}"/>`);
  } else g.line(xa, e, xb, e, `cl cl-${k}${a}`);
  if (k === 'cleang' && g.s > 4) for (let x = xa + 0.4; x < xb - 1.2; x += 2.4) g.rect(x, e, x + 1.2, e + 0.3, `ffu${a}`);
  if ((k === 'module' || k === 'tbar' || k === 'mbar') && zoom) for (let x = xa + 1.5; x < xb - 0.8; x += k === 'module' ? 3 : 2.4) g.P(`<rect class="lamp" x="${g.X(x).toFixed(1)}" y="${(g.Y(e) + 1).toFixed(1)}" width="${(0.6 * g.s).toFixed(1)}" height="${Math.max(2, 0.05 * g.s).toFixed(1)}"/>`);
}
// 칸막이: 단면에 잘린 벽. 확대하면 벽 구성(보드·스터드·블록 줄눈)과 문틀, 도장 면
function drawPart(g, c, k, x0, x1, e0, e1, i, ext, paintExt, zoom) {
  const a = c.F('part'), bw = x1 - x0, n = Math.max(2, Math.round(bw / 9)), front = x0 + bw * ext, pfront = x0 + bw * paintExt;
  for (let j = 1; j < n; j++) {
    const x = x0 + bw * j / n + ((i * 13 + j * 7) % 5 - 2) * 0.3;
    if (x > front) break;
    const real = k === 'block' ? 0.2 : k === 'alc' ? 0.15 : k === 'cleanp' ? 0.1 : 0.12;
    const wpx = zoom ? Math.max(real * g.s, 7) : real * g.s, w = wpx / g.s;
    const painted = x <= pfront && paintExt > 0;
    const door = zoom && j % 3 === 1, eb = door ? e0 + 2.1 : e0;
    const xa = g.X(x - w / 2), ya = g.Y(e1), hh = g.Y(eb) - g.Y(e1);
    if (hh <= 0.5) continue;
    g.P(`<rect class="ptn ptn-${k}${painted ? ' painted' : ''}${a}" x="${xa.toFixed(1)}" y="${ya.toFixed(1)}" width="${wpx.toFixed(1)}" height="${hh.toFixed(1)}"/>`);
    if (zoom) {
      if (k === 'dry') { g.P(`<rect class="ptn-core" x="${(xa + 1.6).toFixed(1)}" y="${(ya + 1).toFixed(1)}" width="${Math.max(0.5, wpx - 3.2).toFixed(1)}" height="${Math.max(0, hh - 2).toFixed(1)}"/>`); for (let e = eb + 0.6; e < e1 - 0.1; e += 0.6) g.P(`<line class="ptn-st" x1="${(xa + wpx / 2).toFixed(1)}" y1="${g.Y(e).toFixed(1)}" x2="${(xa + wpx / 2).toFixed(1)}" y2="${(g.Y(e) - 0.3 * g.s).toFixed(1)}"/>`); }
      if (k === 'block' || k === 'alc') for (let e = eb + (k === 'block' ? 0.2 : 0.6); e < e1; e += k === 'block' ? 0.2 : 0.6) g.P(`<line class="ptn-j" x1="${xa.toFixed(1)}" y1="${g.Y(e).toFixed(1)}" x2="${(xa + wpx).toFixed(1)}" y2="${g.Y(e).toFixed(1)}"/>`);
      if (k === 'module') for (let e = eb + 1.2; e < e1; e += 1.2) g.P(`<line class="ptn-j" x1="${xa.toFixed(1)}" y1="${g.Y(e).toFixed(1)}" x2="${(xa + wpx).toFixed(1)}" y2="${g.Y(e).toFixed(1)}"/>`);
      if (door) { g.line(x - w / 2, e0 + 2.1, x - w / 2, e0, 'door-f'); g.line(x + w / 2, e0 + 2.1, x + w / 2, e0, 'door-f'); g.line(x + w / 2, e0 + 0.02, x + w / 2 + 0.85, e0 + 0.35, 'door-l'); }
    }
  }
}
// 진행 전선의 작업자·장비
function workerAt(g, c, k, x, e, cl, f) {
  const { sc, T } = c, EQ = c.EQ;
  if (k === 'ceil') { // 고소 작업대 위 작업자
    const ph = Math.min(cl - e - 1.9, Math.max(0.6, cl - e - 1.85));
    g.rect(x - 0.6, e + 0.12, x + 0.6, e + 0.42, 'eq acc'); [-0.4, 0.4].forEach(dx => g.circ(x + dx, e + 0.1, Math.max(1.2, 0.08 * g.s), 'eq-w acc'));
    for (let q = 0; q < 3; q++) { const e0 = e + 0.42 + (ph - 0.42) * q / 3, e1 = e + 0.42 + (ph - 0.42) * (q + 1) / 3; g.line(x - 0.45, e0, x + 0.45, e1, 'eq-l acc'); g.line(x + 0.45, e0, x - 0.45, e1, 'eq-l acc'); }
    g.rect(x - 0.7, e + ph, x + 0.7, e + ph + 0.1, 'eq acc'); g.line(x - 0.7, e + ph + 0.1, x - 0.7, e + ph + 1.0, 'eq-c'); g.line(x - 0.7, e + ph + 1.0, x + 0.7, e + ph + 1.0, 'eq-c');
    EQ.worker(g, x + 0.1, e + ph + 0.1, 'acc'); g.line(x + 0.2, e + ph + 1.55, x + 0.6, cl, 'eq-l acc');
    return;
  }
  if (k === 'paint') {
    const kk = sc.ids.paint;
    if (kk === 'robot') { g.rect(x - 0.45, e, x + 0.45, e + 0.9, 'eq acc'); g.line(x, e + 0.9, x, e + 1.6, 'eq-m acc'); g.line(x, e + 1.6, x + 0.6, e + 1.6 + 0.6 * Math.sin(T * 3), 'eq-l acc'); g.text(x, e + 2.4, '도장 로봇', 'eq-lab', 'middle', -2); return; }
    EQ.worker(g, x - 0.3, e, 'acc');
    if (kk === 'airless') g.poly([[x, e + 1.4], [x + 0.9, e + 1.9], [x + 0.9, e + 0.9]], 'sprayc');
    else if (kk === 'paper') g.rect(x + 0.1, e + 0.3, x + 0.2, e + 2.2, 'eq acc');
    else g.line(x - 0.1, e + 1.3, x + 0.3, e + 1.9 + 0.2 * Math.sin(T * 4), 'eq-l acc');
    return;
  }
  if (k === 'part') { EQ.worker(g, x - 0.5, e, 'acc'); g.rect(x - 0.25, e + 0.2, x - 0.15, e + 2.6, 'brd'); return; }
  if (k === 'floor') {
    const kk = sc.ids.floor; EQ.worker(g, x + 0.4, e, 'acc');
    if (kk === 'wet') { g.pl([[x + 0.2, e + 0.15], [x + 2.5, e + 0.2], [x + 4.5, e + 0.15]], 'hose'); g.text(x + 0.4, e + 2.4, '방통 타설', 'eq-lab', 'middle', -2); }
    if (kk === 'polish' || kk === 'epoxy') { g.rect(x + 0.6, e, x + 1.4, e + 0.5, 'eq acc'); g.line(x + 1, e + 0.5, x + 0.5, e + 1.2, 'eq-l acc'); }
  }
  void f;
}

// ---------- 외피: 창호 · 단열 · 지붕 ----------
export function drawEnvelope(g, c) {
  const { sc, K, at } = c, { G, ids, cond, d } = sc, x0 = G.bx0, x1 = G.bx1, NF = sc.NF;
  const sk = Math.min(Math.floor(c.P('skin') * NF), Math.floor(c.fl));
  const nG = Math.min(sk, upTo(c, 'glaz')), nI = Math.min(Math.floor(c.fl), upTo(c, 'insul'));
  const st = step(c, Math.max(nG, nI));
  for (let i = 0; i < Math.max(nG, nI); i++) {
    const f = sc.floors[i]; if (!visF(c, f) || (i % st && i !== nG - 1)) continue;
    if (K('insul') && i < nI) {
      const k = ids.insul, a = c.F('insul');
      if (k === 'outer') { g.rect(x1, f.e0, x1 + 0.22, f.e1, `ins ins-o${a}`); g.rect(x0 - 0.22, f.e0, x0, f.e1, `ins ins-o${a}`); }
      else if (k === 'inner' || k === 'vip') { const w = k === 'vip' ? 0.04 : 0.15; g.rect(x1 - 0.5 - w, f.e0 + 0.2, x1 - 0.5, f.e1 - 0.35, `ins ins-${k}${a}`); g.rect(x0 + 0.5, f.e0 + 0.2, x0 + 0.5 + w, f.e1 - 0.35, `ins ins-${k}${a}`); }
      else if (k === 'spray') { const pts = []; for (let e = f.e0 + 0.2; e < f.e1 - 0.3; e += 0.4) pts.push([x1 - 0.55 - ((e * 7) % 1) * 0.12, e]); g.pl(pts, `ins-sp${a}`); g.rect(x0 + 0.5, f.e0 + 0.2, x0 + 0.66, f.e1 - 0.35, `ins ins-sp2${a}`); }
      else if (k === 'sandwich') g.line(x1 - 0.12, f.e0 + 0.15, x1 - 0.12, f.e1 - 0.15, `ins-core${a}`);
    }
    if (K('glaz') && i < nG && c.g.s > 12) {
      // 확대: 창 한 짝의 단면 (프레임 · 유리 겹 · 하부 스팬드럴)
      const k = ids.glaz, a = c.F('glaz'), sill = f.e0 + 0.9, head = f.e1 - 0.5, n = k === 'tpl' || k === 'pvc' ? 3 : k === 'vac' ? 2 : 2;
      const fx = g.X(x1), fw = Math.max(8, (k === 'pvc' ? 0.12 : 0.08) * g.s), y0 = g.Y(head), y1 = g.Y(sill);
      g.P(`<rect class="gl-fr${k === 'pvc' ? ' pvc' : ''}${a}" x="${(fx - fw / 2).toFixed(1)}" y="${(y0 - 3).toFixed(1)}" width="${fw.toFixed(1)}" height="${(y1 - y0 + 6).toFixed(1)}"/>`);
      for (let q = 0; q < n; q++) { const xx = fx - fw / 2 + 2 + (fw - 4) * (n === 1 ? 0.5 : q / (n - 1)); g.P(`<line class="gl-pane${k === 'vac' && q === 1 ? ' vac' : ''}" x1="${xx.toFixed(1)}" y1="${(y0 + 1).toFixed(1)}" x2="${xx.toFixed(1)}" y2="${(y1 - 1).toFixed(1)}"/>`); }
      if (k === 'bipv') for (let e = sill + 0.1; e < head - 0.3; e += 0.4) g.P(`<rect class="pvcell" x="${(fx - fw / 2 + 1).toFixed(1)}" y="${g.Y(e + 0.3).toFixed(1)}" width="${(fw - 2).toFixed(1)}" height="${(0.25 * g.s).toFixed(1)}"/>`);
      g.rect(x1 - 0.02, f.e0 + 0.18, x1 + 0.1, sill - 0.05, 'spandrel');
    } else if (K('glaz') && i < nG && c.g.s > 3.5) {
      const k = ids.glaz, a = c.F('glaz'), m = 3;
      for (let j = 0; j < m; j++) {
        const e0 = f.e0 + 0.9, e1 = f.e1 - 0.5, xx = x1 + 0.02;
        const lines = k === 'tpl' || k === 'pvc' ? 3 : 2;
        if (j === 0) for (let q = 0; q < lines; q++) g.line(xx + q * 0.07, e0, xx + q * 0.07, e1, `gl-${k}${a}`);
        if (k === 'bipv' && j === 0) for (let e = e0; e < e1; e += 0.5) g.rect(xx, e, xx + 0.14, e + 0.35, 'pvcell');
      }
    }
  }
  if (c.wpId === 'glaz' && nG > 0) { const f = sc.floors[Math.max(0, nG - 1)]; const res = d.res || ['hotel', 'hospital'].includes(d.u.id), lim = uLimit(cond.reg, res); g.text(x1 + 0.6, f.e1 - 0.2, `U ${sc.fx.uval} / 기준 ${lim}`, sc.fx.uval > lim ? 'bad-t' : 'ok-t', 'start', 3); at.uval = [x1 + 0.3, (f.e0 + f.e1) / 2]; at.pv = at.uval; }
  if (c.wpId === 'insul' && nI > 0) { const f = sc.floors[Math.max(0, nI - 1)]; at.fire = [x1 - 0.4, (f.e0 + f.e1) / 2]; at.uval = at.fire; if (ids.insul === 'spray') { const sx = x1 - 0.8, se = f.e0 + 1.2; for (let j = 0; j < 5; j++) { const a2 = j * 1.2 + c.T * 6; g.line(sx, se, sx + Math.cos(a2) * 0.6, se + Math.sin(a2) * 0.6, 'spark'); } } }
  drawRoof(g, c);
}

function drawRoof(g, c) {
  const { sc, at, T } = c, { G, ids } = sc, x0 = G.bx0, x1 = G.bx1, NF = sc.NF;
  if (c.fl < NF) return;
  const top = sc.floors[NF - 1].e1, bw = x1 - x0;
  // 옥상 설비 (공조 선택에 따라)
  if (c.K('hvac') && c.P('hvac') > 0.2) {
    const a = c.F('hvac'), k = ids.hvac;
    if (['central', 'process', 'crac', 'clean'].includes(k)) { const n = Math.max(1, Math.round(bw / 22)); for (let i = 0; i < n; i++) { const x = x0 + bw * (0.55 + 0.35 * i / Math.max(1, n)); g.rect(x, top + 0.4, x + 3.2, top + 3.6, `ct${a}`); g.P(`<ellipse class="fan" cx="${g.X(x + 1.6).toFixed(1)}" cy="${g.Y(top + 3.6).toFixed(1)}" rx="${(1.2 * g.s).toFixed(1)}" ry="${(0.25 * g.s).toFixed(1)}"/>`); } g.text(x0 + bw * 0.7, top + 4.6, k === 'clean' ? 'MAU·냉각탑' : '냉각탑', 'eq-lab', 'middle', -2); at.roofplant = [x0 + bw * 0.7, top + 2]; }
    if (k === 'vrf') { const n = Math.max(2, Math.round(bw / 4)); for (let i = 0; i < n; i++) { const x = x0 + bw * (0.5 + 0.45 * i / n); g.rect(x, top + 0.4, x + 1.2, top + 2, `odu${a}`); g.circ(x + 0.6, top + 1.4, 0.35 * g.s, 'fan'); } at.roofplant = [x0 + bw * 0.7, top + 1.2]; at.vrf = at.roofplant; }
  }
  // 파라펫 (지붕 가장자리 난간벽)
  if (c.g.s > 8) [[x0, x0 + 0.2], [x1 - 0.2, x1]].forEach(([p0, p1]) => g.rect(p0, top + 0.18, p1, top + 1.2, 'parapet'));
  if (!c.K('roof')) return;
  const rp = c.P('roof'), k = ids.roof, a = c.F('roof');
  if (rp <= 0) return;
  const zoom = g.s > 12, xs = x0 + 0.2, xe = xs + (bw - 0.4) * clamp(rp * 1.1, 0, 1);
  const RL = {
    asphalt: [[0.15, 'rf-ins'], [0.004, 'rf-sheet'], [0.002, 'rf-prot'], [0.08, 'rf-conc']],
    urethane: [[0.15, 'rf-ins'], [0.003, 'rf-ure']],
    hybrid: [[0.15, 'rf-ins'], [0.003, 'rf-sheet'], [0.002, 'rf-ure']],
    metal: [[0.15, 'rf-ins']],
    green: [[0.15, 'rf-ins'], [0.003, 'rf-sheet'], [0.025, 'rf-drain'], [0.3, 'soil']],
    pv: [[0.15, 'rf-ins'], [0.004, 'rf-sheet']],
  }[k] || [];
  const rt = stackUp(g, xs, xe, top + 0.18, RL, zoom ? 2 : 0);
  if (a && zoom) g.line(xs, rt, xe, rt, 'acc-top');
  if (k === 'metal') { const pts = []; for (let x = xs; x <= xe; x += 0.5) pts.push([x, rt + 0.1 + (Math.round((x - xs) / 0.5) % 2) * 0.18]); g.pl(pts, `rf-metal${a}`); }
  if (k === 'green') { for (let x = xs + 1.5; x < xe - 0.5; x += 3) { g.line(x, rt, x, rt + 1.2, 'trunk'); g.circ(x, rt + 1.4, 0.8 * g.s, `tree${a}`); } if (c.wpId === 'roof') { for (let x = xs + 1; x < xe; x += 2.5) g.line(x, rt + 3, x, rt + 2, 'load-a'); g.text((xs + xe) / 2, rt + 3.5, '포화 하중 ≈ 3.5kN/㎡', 'warn-t', 'middle', -2); } at.load = [(x0 + x1) / 2, rt + 0.3]; }
  if (k === 'pv') { for (let x = xs + 0.6; x < xe - 1.6; x += 2.2) { g.line(x + 0.2, rt, x + 0.2, rt + 0.4, 'eq-c'); g.line(x + 1.4, rt, x + 1.4, rt + 1.0, 'eq-c'); g.line(x, rt + 0.35, x + 1.6, rt + 1.1, `pv${a}`); } at.pv = [(x0 + x1) / 2, rt + 0.8]; }
  // 시공 전선: 진행 중이면 작업자와 재료
  if (c.wpId === 'roof' && rp > 0 && rp < 0.9 && zoom) {
    c.EQ.worker(g, xe + 0.3, rt, 'acc');
    if (k === 'urethane' || k === 'hybrid') g.line(xe + 0.5, rt + 1.2, xe + 1.1, rt + 0.1, 'eq-l acc');
    if (k === 'asphalt' || k === 'hybrid') g.P(`<circle class="eq acc" cx="${g.X(xe + 1.4).toFixed(1)}" cy="${g.Y(rt + 0.3).toFixed(1)}" r="${(0.3 * g.s).toFixed(1)}"/>`);
  }
  if (c.wpId === 'roof') { g.text(x0 - 0.6, top + 0.3, `지붕 ${({ asphalt: '아스팔트 시트+누름 콘크리트', urethane: '우레탄 도막', hybrid: '복합 방수', metal: '금속 지붕', green: '옥상 녹화', pv: '태양광 지붕' })[k]}`, 'cy-t acc', 'end', 3); if (k !== 'green') at.load = at.load || [(x0 + x1) / 2, top + 0.5]; }
  void T;
}

// ---------- 골조 단계 세부: 철근 · 타설 · 철골 · 수직 운송 ----------
export function drawStructDetail(g, c) {
  const { sc, wpId, T, at, K } = c, { G, ids } = sc, x0 = G.bx0, x1 = G.bx1, bw = x1 - x0, pw = G.pw, NF = sc.NF;
  const n = Math.min(NF - 1, Math.floor(c.fl)), f = sc.floors[n], active = c.fl > 0 && c.fl < NF;
  // 철근: 가공장 · 반입 · 선조립
  if (K('rebar') && active && (wpId === 'rebar' || wpId === 'frame' || wpId === 'form' || wpId === 'conc' || wpId === 'pour')) {
    const k = ids.rebar, a = c.F('rebar');
    if (k === 'site') { g.rect(pw + 8, 0, pw + 20, 0.25, `yard${a}`); for (let j = 0; j < 5; j++) g.line(pw + 8.5, 0.3 + j * 0.18, pw + 19.5, 0.3 + j * 0.18, 'rebar'); g.rect(pw + 14, 0.3, pw + 15.6, 1.4, `eq${a}`); if (wpId === 'rebar') g.text(pw + 14, 1.9, '현장 가공장 (절단·절곡)', 'eq-lab', 'middle', -2); at.yard = [pw + 14, 1]; }
    if (k === 'shop' || k === 'coupler' || k === 'mesh') { const tx = pw + 24 - ((T * 2) % 8); c.EQ.truck(g, tx, 0, -1, false, a.trim()); for (let j = 0; j < 3; j++) g.line(tx - 3.2, 2.9 + j * 0.2, tx + 1.4, 2.9 + j * 0.2, 'rebar'); if (wpId === 'rebar') g.text(tx, 4, k === 'mesh' ? '용접 철망 반입' : '공장 가공 철근 반입', 'eq-lab', 'middle', -2); }
    if (k === 'cage' && wpId === 'rebar') { const hx = x0 + bw * 0.3, he = f.e1 + 2 + 2 * (0.5 + 0.5 * Math.sin(T * 0.8)); g.line(hx, he + 3.4, hx, f.e1 + 14, 'eq-c'); g.rect(hx - 0.4, he, hx + 0.4, he + 3.4, `cage${a}`); for (let e = he + 0.4; e < he + 3.4; e += 0.5) g.line(hx - 0.4, e, hx + 0.4, e, 'rebar'); g.text(hx + 0.8, he + 2, '기둥 케이지 인양', 'eq-lab', 'start', 3); at.crane = [hx, he + 3.4]; }
    if (k === 'coupler' && wpId === 'rebar' && c.g.s > 3) { const bays = Math.max(2, Math.round(bw / 8.4)); for (let j = 0; j <= bays; j++) g.rect(x0 + bw * j / bays - 0.12, f.e0 + 1.1, x0 + bw * j / bays + 0.12, f.e0 + 1.4, `cpl${a}`); g.text(x1 + 1, f.e0 + 1.2, '기계식 이음', 'eq-lab', 'start', 3); }
    if (k === 'mesh' && wpId === 'rebar' && c.g.s > 3) { const pts = []; for (let x = x0; x <= x1; x += 0.4) pts.push([x, f.e1 - 0.15 + (Math.round((x - x0) / 0.4) % 2) * 0.08]); g.pl(pts, `mesh${a}`); }
  }
  // 철골 접합
  if (K('steel') && STEEL_FRAMES.includes(ids.frame) && ids.steel !== 'none' && active) {
    const k = ids.steel, a = c.F('steel'), bays = Math.max(2, Math.round(bw / 8.4)), e = f.e0 + 1.2;
    for (let j = 0; j <= bays; j += Math.max(1, Math.floor(bays / 4))) {
      const x = x0 + bw * j / bays;
      if (k === 'weld' || k === 'robot') { if ((T * 4 + j) % 1 < 0.6) for (let q = 0; q < 4; q++) { const an = q * 1.6 + T * 9; g.line(x, e, x + Math.cos(an) * 0.5, e + Math.sin(an) * 0.5, 'spark'); } }
      if (k === 'bolt' && c.g.s > 4) for (let q = 0; q < 3; q++) g.circ(x + 0.3, e - 0.2 + q * 0.2, Math.max(0.8, 0.06 * g.s), 'bolt');
      if (k === 'robot' && j === 0) { g.rect(x - 0.9, e - 0.4, x - 0.25, e + 0.4, `eq${a}`); if (wpId === 'steel') g.text(x - 1, e + 0.8, '용접 로봇', 'eq-lab', 'end', 0); }
    }
    if (k === 'block' && wpId === 'steel') { const he = f.e1 + 3 + 3 * (0.5 + 0.5 * Math.sin(T * 0.5)); g.rect(x0 + bw * 0.15, he, x0 + bw * 0.6, he + 2, `blk${a}`); for (let j = 0; j < 6; j++) g.line(x0 + bw * (0.15 + 0.075 * j), he, x0 + bw * (0.15 + 0.075 * (j + 1)), he + 2, `brace${a}`); g.line(x0 + bw * 0.375, he + 2, x0 + bw * 0.375, he + 9, 'eq-c'); g.text(x0 + bw * 0.62, he + 1, '대블록 일괄 인양', 'eq-lab', 'start', 3); at.crane = [x0 + bw * 0.375, he + 2]; }
    if (n > 3 && wpId === 'steel') { const fp = sc.floors[n - 3]; g.rect(x0 + 0.2, fp.e0 + 0.3, x0 + bw * 0.4, fp.e1 - 0.3, 'fireproof'); g.text(x0 + bw * 0.2, fp.e1 - 0.6, '내화 뿜칠', 'eq-lab', 'middle', 3); }
    at.weld = [x0 + 0.1, e];
  }
  // 수직 운송: 호이스트 · 점프 엘리베이터
  if (K('hoist') && c.P('hoist') > 0 && c.fl > 2) {
    const k = ids.hoist, a = c.F('hoist'), hs = HOIST[k] || HOIST.rack;
    const hp = c.P('hoist'), finDone = c.P('fin') >= 0.98;
    const top = sc.floors[Math.min(NF, Math.max(1, Math.floor(c.fl))) - 1].e1 + (k === 'jump' ? 0 : 3);
    const cyc = (T * hs.v / 60 / Math.max(10, top)) % 2, ce = (cyc < 1 ? cyc : 2 - cyc) * Math.max(0, top - 3);
    if ((k === 'rack' || k === 'fast') && !finDone) {
      const mx = x1 + 0.8;
      g.rect(mx, 0, mx + 0.6, top, `hmast${a}`); for (let e = 1; e < top; e += 1.5) g.line(mx, e, mx + 0.6, e + 1.5, 'eq-l');
      g.rect(mx + 0.6, ce, mx + 2.2, ce + 2.6, `hcar${a}`); if (k === 'fast') { const ce2 = Math.max(0, top - 3 - ce); g.rect(mx - 1.6, ce2, mx, ce2 + 2.6, `hcar${a}`); }
      if (wpId === 'hoist') { g.text(mx + 2.6, ce + 1.4, `${hs.cap}명 · 분속 ${hs.v}m`, 'eq-lab', 'start', 3); [x1 + 0.02].forEach(x => g.rect(x - 0.05, 0, x + 0.05, top - 3, 'gap')); }
      at.hoist = [mx + 0.3, top * 0.5];
    }
    if (k === 'jump') { const cx0 = G.core.x0 + 0.3, cx1 = cx0 + 1.8; g.rect(cx0, 0, cx1, top, `shaft${a}`); g.rect(cx0 + 0.2, ce, cx1 - 0.2, ce + 2.4, `hcar${a}`); g.rect(cx0 - 0.2, top - 0.6, cx1 + 0.2, top, `jplat${a}`); if (wpId === 'hoist') g.text(cx1 + 0.5, top - 0.3, '점프 플랫폼 (기계실이 층을 따라 상승)', 'eq-lab', 'start', 3); at.hoist = [cx0 + 0.9, top * 0.6]; }
    if (k === 'lift') { const mx = x1 + 0.8, tp = Math.min(top, 40); g.rect(mx, 0, mx + 0.4, tp, `hmast${a}`); g.rect(mx + 0.4, ce * tp / Math.max(1, top), mx + 1.6, ce * tp / Math.max(1, top) + 1.2, `hcar${a}`); at.hoist = [mx, tp / 2]; }
    void hp;
  }
}

// 타설 장비 (drawCycle이 부른다: 지금 층에 콘크리트를 넣는 순간)
export function drawPour(g, c, f, target) {
  const { sc, wpId, T, at } = c, { G, ids } = sc, a = wpId === 'pour' || wpId === 'conc' ? 'acc' : '', k = ids.pour, pw = G.pw;
  const H = f.e1;
  if (k === 'boom' || k === 'multi') {
    const n = k === 'multi' ? 2 : 1;
    for (let i = 0; i < n; i++) { const reachable = H <= BOOM_REACH; c.EQ.pump(g, pw + 12 + i * 9, 0, reachable ? [target[0] - i * 4, target[1]] : [pw + 2, BOOM_REACH], a); }
    if (H > BOOM_REACH) { g.line(pw - 2, BOOM_REACH, pw + 18, BOOM_REACH, 'reach bad'); g.text(pw + 18, BOOM_REACH, `붐 도달 ${BOOM_REACH}m`, 'bad-t', 'end', -3); }
  } else if (k === 'bucket') {
    const be = lerpT(1, H + 2, T); g.line(target[0], be + 1.6, target[0], H + 12, 'eq-c'); g.poly([[target[0] - 0.8, be + 1.6], [target[0] + 0.8, be + 1.6], [target[0] + 0.3, be], [target[0] - 0.3, be]], `eq ${a}`); g.text(target[0] + 1, be + 1, '버킷', 'eq-lab', 'start', 3);
  } else {
    const px = G.core.x1 + 0.4;
    g.line(px, 0, px, H, `pipe ${a}`); g.rect(pw + 9, 0, pw + 15, 2, `eq ${a}`); g.line(pw + 9, 1, px, 1, `pipe ${a}`);
    // 분배기(CPB) 붐: 슬래브 위에서 회전
    const ang = Math.sin(T * 0.6) * 0.8, L = Math.min(14, (G.bx1 - G.bx0) * 0.45);
    g.line(px, H + 0.4, px, H + 2.4, `eq-m ${a}`); g.line(px, H + 2.4, px + Math.cos(ang) * L, H + 2.4 + Math.sin(ang) * 0.6, `eq-m ${a}`); g.line(px + Math.cos(ang) * L, H + 2.4, px + Math.cos(ang) * L, H + 0.5, 'eq-c');
    g.text(pw + 12, 3, k === 'highp' ? `초고압 펌프 ${pumpMPa(H)}MPa` : `고정 펌프 ${pumpMPa(H)}MPa`, 'eq-lab', 'middle', -3);
  }
  if (k === 'winter') { g.rect(G.bx0 - 0.6, f.e0, G.bx1 + 0.6, f.e1 + 2.2, 'tent'); for (let j = 0; j < 3; j++) g.circ(G.bx0 + (G.bx1 - G.bx0) * (0.25 + j * 0.25), f.e0 + 0.6, (0.5 + 0.15 * Math.sin(T * 4 + j)) * g.s, 'heater'); g.text(G.bx1 + 1, f.e1 + 1.6, '보온 천막 · 가열 양생', 'eq-lab', 'start', 3); }
  [0, 1].forEach(j => c.EQ.mixer(g, pw + 21 + j * 8, 0, T + j * 0.3, ''));
  at.pump = [pw + 12, 3];
}
const lerpT = (a, b, T) => a + (b - a) * (0.5 + 0.5 * Math.sin(T * 0.7));

// ---------- 설비 계통 · 승강기 · 시운전 ----------
export function drawSystems(g, c) {
  const { sc, wpId, T, at, K } = c, { G, ids, d } = sc, x0 = G.bx0, x1 = G.bx1, bw = x1 - x0, NF = sc.NF, depth = G.depth;
  if (!K('frame') || c.P('frame') <= 0) return;
  const built = Math.min(NF, Math.floor(c.fl));
  const base = depth > 0.5 ? -depth + 0.4 : 0.1;
  const plantY = depth > 0.5 ? -depth + 0.4 : 0.1, plantX = G.core.x1 + 1;
  // 다른 설비 공종이나 실내 마감을 볼 때는 흐리게
  let dimmed = false;
  const dim = (k) => { const on = (MEPS.includes(wpId) && wpId !== k) || ROOMS.includes(wpId); if (on !== dimmed) { g.P(on ? '<g class="dim">' : '</g>'); dimmed = on; } };
  // 공조
  dim('hvac');
  if (K('hvac') && c.P('hvac') > 0) {
    const k = ids.hvac, a = c.F('hvac'), n = Math.min(built, upTo(c, 'hvac')), st = step(c, n);
    g.line(G.core.x1 + 0.3, base, G.core.x1 + 0.3, n > 0 ? sc.floors[n - 1].e1 - 0.4 : base, `shaft-d${a}`);
    for (let i = 0; i < n; i += st) {
      const f = sc.floors[i]; if (!visF(c, f)) continue;
      const e = f.e1 - 0.55;
      if (k === 'vrf') { g.line(x0 + 1, e + 0.1, x1 - 1, e + 0.1, `refl${a}`); for (let x = x0 + 3; x < x1 - 2; x += 6) g.rect(x, e - 0.25, x + 1, e + 0.05, `idu${a}`); }
      else if (k === 'radiant') { const pts = []; for (let x = x0 + 0.5; x < x1 - 0.5; x += 0.6) pts.push([x, f.e1 - 0.12 + (Math.round((x - x0) / 0.6) % 2) * 0.06]); g.pl(pts, `rad${a}`); }
      else if (k === 'district') { const pts = []; for (let x = x0 + 0.5; x < x1 - 0.5; x += 0.5) pts.push([x, f.e0 + 0.12 + (Math.round((x - x0) / 0.5) % 2) * 0.04]); g.pl(pts, `rad dh${a}`); }
      else if (k === 'clean') { for (let x = x0 + 0.8; x < x1 - 1; x += 2.4) g.rect(x, e - 0.1, x + 1.2, e + 0.2, `ffu${a}`); }
      else if (k === 'crac') { g.rect(x0 + 0.6, f.e0 + 0.3, x0 + 1.6, f.e0 + 2, `crac${a}`); g.rect(x1 - 1.6, f.e0 + 0.3, x1 - 0.6, f.e0 + 2, `crac${a}`); for (let x = x0 + 3; x < x1 - 3; x += 2.4) g.rect(x, f.e0 + 0.35, x + 0.8, f.e0 + 2.1, 'rackit'); }
      else { g.rect(x0 + 1, e - 0.18, x1 - 1, e + 0.18, `ductb${a}`); if (c.g.s > 4) for (let x = x0 + 3; x < x1 - 2; x += 4) g.line(x, e - 0.18, x, e - 0.35, 'diff'); }
    }
    if (['central', 'geo', 'process', 'clean', 'crac'].includes(k)) { g.rect(plantX, plantY, plantX + 4, plantY + 2.2, `plant${a}`); g.circ(plantX + 1.2, plantY + 1.1, 0.7 * g.s, 'fan'); if (wpId === 'hvac') g.text(plantX + 2, plantY + 2.6, k === 'geo' ? '히트펌프' : k === 'process' ? '공정 냉각수' : '냉동기·보일러', 'eq-lab', 'middle', -2); }
    if (k === 'district') { g.rect(plantX, plantY, plantX + 2.4, plantY + 1.8, `plant${a}`); g.line(G.pw + 7, -1.2, plantX + 2.4, -1.2, 'heatp'); if (wpId === 'hvac') g.text(plantX + 1.2, plantY + 2.2, '지역난방 열교환기', 'eq-lab', 'middle', -2); }
    at.duct = [x0 + bw * 0.5, n > 0 ? sc.floors[Math.max(0, n - 1)].e1 - 0.55 : 2];
    if (k === 'vrf' && !at.vrf) at.vrf = [G.core.x1 + 0.3, Math.max(2, (n > 0 ? sc.floors[n - 1].e1 : 0) * 0.5)];
  }
  // 위생
  dim('plumb');
  if (K('plumb') && c.P('plumb') > 0) {
    const k = ids.plumb, a = c.F('plumb'), n = Math.min(built, upTo(c, 'plumb'));
    const rx = G.core.x0 - 0.3, topE = n > 0 ? sc.floors[n - 1].e1 - 0.4 : base;
    g.line(rx, base, rx, topE, `wriser${a}`);
    g.rect(rx - 4.2, plantY, rx - 1.2, plantY + 2, `tank${a}`); if (wpId === 'plumb') g.text(rx - 2.7, plantY + 2.4, k === 'upw' ? '초순수 설비' : k === 'reuse' ? '빗물·중수 저류조' : '저수조·부스터', 'eq-lab', 'middle', -2);
    if (k === 'zone') { const zs = Math.ceil(G.H / 70); for (let z = 1; z < zs; z++) { const e = G.H * z / zs; if (e < topE) { g.rect(rx - 2.4, e - 1, rx - 0.4, e + 0.4, `tank${a}`); g.text(rx - 2.6, e, `급수 ${z + 1}구역`, 'eq-lab', 'end', 3); } } }
    if (k === 'pod') { const st = step(c, n); for (let i = 0; i < n; i += st) { const f = sc.floors[i]; if (!visF(c, f)) continue; for (let x = x0 + 2; x < x1 - 3; x += Math.max(6, bw / 4)) g.rect(x, f.e0 + 0.2, x + 2.2, f.e0 + 2.5, `pod${a}`); } at.pod = [x0 + 3, (sc.floors[Math.max(0, n - 1)].e0) + 1.4]; }
    if (k === 'upw') g.line(rx - 0.3, base, rx - 0.3, topE, `wriser upw${a}`);
    if (wpId === 'plumb') { const p = f1(0.0098 * Math.min(G.H, k === 'zone' ? 70 : G.H)); g.text(rx - 0.4, base + 3.5, `최하층 ${p}MPa`, p > 0.7 ? 'bad-t' : 'ok-t', 'end', 3); at.press = [rx, base + 3]; }
  }
  // 소방
  dim('fire');
  if (K('fire') && c.P('fire') > 0) {
    const k = ids.fire, a = c.F('fire'), n = Math.min(built, upTo(c, 'fire')), st = step(c, n);
    for (let i = 0; i < n; i += st) {
      const f = sc.floors[i]; if (!visF(c, f)) continue;
      const e = f.e1 - 0.42;
      if (k === 'gas') { g.rect(x1 - 3, f.e0 + 0.2, x1 - 1.6, f.e0 + 1.6, `gascyl${a}`); continue; }
      g.line(x0 + 0.8, e, x1 - 0.8, e, `spr${a}`);
      if (c.g.s > 3) for (let x = x0 + 1.6; x < x1 - 1; x += 3) g.line(x, e, x, e - 0.18, `sprh${a}`);
      if (k === 'smart' && c.g.s > 3 && i % 2 === 0) g.circ(x0 + bw * 0.5, e + 0.1, Math.max(1.2, 0.1 * g.s), `sens${a}`);
    }
    g.rect(G.core.x1 + 5.4, plantY, G.core.x1 + 7.2, plantY + 1.6, `fpump${a}`);
    if (wpId === 'fire') g.text(G.core.x1 + 6.3, plantY + 2, k === 'gas' ? '약제 저장실' : k === 'deluge' ? '포 소화 설비' : '소화 펌프', 'eq-lab', 'middle', -2);
    at.sprk = [x0 + bw * 0.35, n > 0 ? sc.floors[Math.max(0, n - 1)].e1 - 0.45 : 2];
  }
  // 전기
  dim('elec');
  if (K('elec') && c.P('elec') > 0) {
    const k = ids.elec, a = c.F('elec'), n = Math.min(built, upTo(c, 'elec'));
    const ex = G.core.x0 + 0.9, topE = n > 0 ? sc.floors[n - 1].e1 - 0.4 : base;
    if (k === 'bus') g.line(ex, base, ex, topE, `bus${a}`); else { [0, 0.18, 0.36].forEach(dx => g.line(ex + dx, base, ex + dx, topE, `cable${a}`)); }
    const sx = G.core.x0 - 6;
    g.rect(sx, plantY, sx + 2.4, plantY + 2, `xfmr${a}`); if (k === 'dual') { g.rect(sx - 2.6, plantY, sx - 0.2, plantY + 2, `xfmr${a}`); g.rect(sx + 2.6, plantY, sx + 4.4, plantY + 1.4, `ups${a}`); }
    if (k === 'renew') { g.rect(sx + 2.6, plantY, sx + 4.6, plantY + 1.4, `ess${a}`); }
    if (wpId === 'elec') g.text(sx + 1.2, plantY + 2.4, k === 'dual' ? '이중 수전·UPS' : k === 'renew' ? '수전·ESS' : '수변전실', 'eq-lab', 'middle', -2);
    at.xfmr = [sx + 1.2, plantY + 1];
  }
  // 통신·자동제어
  dim('ict');
  if (K('ict') && c.P('ict') > 0) {
    const k = ids.ict, a = c.F('ict'), n = Math.min(built, upTo(c, 'ict')), st = Math.max(1, step(c, n) * (k === 'basic' ? 3 : 1));
    g.line(G.core.x0 + 1.4, base, G.core.x0 + 1.4, n > 0 ? sc.floors[n - 1].e1 - 0.4 : base, `ictl${a}`);
    if (k !== 'basic') for (let i = 0; i < n; i += st) { const f = sc.floors[i]; if (!visF(c, f)) continue; for (let x = x0 + 2; x < x1 - 1; x += k === 'iot' || k === 'twin' ? 4 : 8) g.circ(x, f.e0 + 1.6, Math.max(1, 0.08 * g.s), `iot${a}`); }
    if (k === 'twin' && wpId === 'ict') { const fi = Math.max(0, n - 1); const f = sc.floors[fi]; for (let j = 0; j < 3; j++) { const r = ((T * 0.8 + j / 3) % 1) * 3; g.circ(x0 + bw * 0.5, f.e0 + 1.6, r * g.s, 'iot-r'); } }
  }
  dim('-');
  if (dimmed) { g.P('</g>'); dimmed = false; }
  // 승강기
  if (K('elev') && c.P('elev') > 0) drawElev(g, c, built);
  // 시운전: 층이 켜지고 시험
  if (K('comm') && c.P('comm') > 0) {
    const k = ids.comm, a = c.F('comm'), cp = c.P('comm'), st = step(c, built);
    const lit = Math.floor(clamp(cp * 1.15, 0, 1) * built);
    for (let i = 0; i < lit; i += st) { const f = sc.floors[i]; if (!visF(c, f)) continue; g.rect(x0 + 0.6, f.e0 + 0.3, x1 - 0.6, f.e1 - 0.5, `lit${k === 'phased' && i < lit * 0.5 ? ' occ' : ''}${a}`); }
    if (wpId === 'comm' && lit > 0) {
      const f = sc.floors[Math.max(0, lit - 1)];
      g.text(x1 + 1, f.e1 - 0.4, { std: '단독 시운전', tab: 'TAB 풍량·수량 조정', digital: 'BEMS 데이터 검증', phased: '구역별 사용승인', perf: '청정도·성능 시험' }[k] || '시운전', 'cy-t acc', 'start', 3);
      if (k === 'perf') { for (let j = 0; j < 8; j++) { const x = x0 + ((j * 37 + T * 3) % bw), e = f.e0 + 0.6 + ((j * 13) % 10) / 10 * (f.e1 - f.e0 - 1.2); g.circ(x, e, Math.max(0.8, 0.04 * g.s), 'ptcl'); } }
      if (k === 'phased') { const fo = sc.floors[Math.max(0, Math.floor(lit * 0.25))]; c.EQ.worker(g, x0 + bw * 0.4, fo.e0 + 0.2, ''); c.EQ.worker(g, x0 + bw * 0.55, fo.e0 + 0.2, ''); }
      at.comm = [x0 + bw * 0.5, (f.e0 + f.e1) / 2];
    }
  }
  void d;
}

function drawElev(g, c, built) {
  const { sc, wpId, T, at } = c, { G, ids } = sc, k = ids.elev, a = c.F('elev');
  const ep = c.P('elev'), n = Math.max(1, Math.min(built, Math.ceil(ep * built))), top = sc.floors[n - 1].e1;
  const cw = (G.core.x1 - G.core.x0) - 0.6, shafts = k === 'freight' ? 1 : 2;
  const v = elevSpeed(k, G.H);
  for (let s = 0; s < shafts; s++) {
    const sx0 = G.core.x0 + 0.3 + s * cw / shafts + 0.1, sx1 = sx0 + cw / shafts - 0.2;
    g.rect(sx0, G.depth > 0.5 ? -G.depth + 1 : 0, sx1, top, `hway${a}`);
    if (ep >= 0.6) {
      const cyc = ((T + s * 0.7) * v / Math.max(12, top)) % 2, e = (cyc < 1 ? cyc : 2 - cyc) * Math.max(0, top - 3);
      g.rect(sx0 + 0.15, e, sx1 - 0.15, e + (k === 'dd' ? 5.4 : 2.6), `ecar${a}`);
      if (k === 'dd') g.line(sx0 + 0.15, e + 2.7, sx1 - 0.15, e + 2.7, 'eq-l');
    } else g.line((sx0 + sx1) / 2, 0, (sx0 + sx1) / 2, top, 'rail');
  }
  if (k === 'rope' && built >= sc.NF) g.rect(G.core.x0, top + 0.2, G.core.x1, top + 3, `mroom${a}`);
  if (wpId === 'elev') { g.text(G.core.x1 + 0.6, Math.min(top, G.H) - 1, `${k === 'rope' ? '로프식' : k === 'mrl' ? 'MRL' : k === 'dd' ? '더블데크' : k === 'dest' ? '행선층 예약' : '화물용'} ${v}m/s`, 'cy-t acc', 'start', 3); if (k === 'dest') { g.rect(G.core.x1 + 0.6, 0.2, G.core.x1 + 1, 1.6, 'eq acc'); g.text(G.core.x1 + 1.2, 1.4, '행선층 키패드', 'eq-lab', 'start', 3); } }
  at.elev = [(G.core.x0 + G.core.x1) / 2, top * 0.5];
}

// ---------- 공종 상세도 (왼쪽 위 작은 창) ----------
// 층 구성 단면: L = [[이름, 두께(mm), 클래스]] — 두께는 제곱근 비례로 그려 얇은 층도 보인다
function layers(g, x, y, w, h, title, L, note, orient = 'h') {
  g.P(`<rect class="inset" x="${x}" y="${y}" width="${w}" height="${h}"/><text class="hud-s" x="${x + 8}" y="${y + 14}">${title}</text>`);
  const tot = L.reduce((s, l) => s + Math.sqrt(Math.max(1, l[1])), 0);
  if (orient === 'h') {
    // 위에서 아래로 쌓인 수평 층 (바닥·지붕·천장)
    const bx = x + 8, bw = 46, by = y + 22, bh = h - 30 - (note ? 12 : 0);
    // 막대 높이: 제곱근 비례 + 최소 4px, 전체를 bh에 맞춘다. 이름표는 11px 간격을 지키고 지시선으로 잇는다
    const raw = L.map(([, t]) => Math.max(4, bh * Math.sqrt(Math.max(1, t)) / tot)), sum = raw.reduce((a2, b2) => a2 + b2, 0), kk = bh / sum;
    let yy = by; const mids = [];
    L.forEach(([, , cls], i) => { const hh = raw[i] * kk; g.P(`<rect class="ly ${cls}" x="${bx}" y="${yy.toFixed(1)}" width="${bw}" height="${hh.toFixed(1)}"/>`); mids.push(yy + hh / 2); yy += hh; });
    const ly = []; mids.forEach((m, i) => { ly.push(Math.max(m + 3, i ? ly[i - 1] + 11 : by + 6)); });
    const over = ly.length ? ly[ly.length - 1] - (by + bh + 2) : 0; if (over > 0) for (let i = ly.length - 1; i >= 0; i--) { ly[i] -= over; if (i && ly[i - 1] > ly[i] - 11) ly[i - 1] = ly[i] - 11; }
    L.forEach(([nm, t], i) => { const ty = ly[i]; if (Math.abs(ty - 3 - mids[i]) > 1.5) g.P(`<polyline class="ly-ld" points="${bx + bw},${mids[i].toFixed(1)} ${bx + bw + 4},${(ty - 3).toFixed(1)} ${bx + bw + 6},${(ty - 3).toFixed(1)}"/>`); g.P(`<text class="hud-s ly-t" x="${bx + bw + 8}" y="${ty.toFixed(1)}">${nm}${t > 1 ? ` · ${t >= 1000 ? f1(t / 1000) + 'm' : t + 'mm'}` : ''}</text>`); });
  } else {
    // 왼쪽(바깥)에서 오른쪽(안)으로 이어진 수직 층 (벽·창)
    const bx = x + 8, by = y + 22, bh = h - 30 - (note ? 12 : 0), bw = Math.min(w - 16, 170);
    let xx = bx; const lab = [];
    L.forEach(([nm, t, cls], i) => {
      const ww = Math.max(4, (bw * 0.42) * Math.sqrt(Math.max(1, t)) / tot);
      g.P(`<rect class="ly ${cls}" x="${xx.toFixed(1)}" y="${by}" width="${ww.toFixed(1)}" height="${bh}"/>`);
      lab.push([xx + ww / 2, nm, t, i]); xx += ww;
    });
    const lx = xx + 6;
    lab.forEach(([cx, nm, t, i]) => { const ly = by + 6 + i * Math.min(13, (bh - 4) / Math.max(1, lab.length)); g.P(`<line class="ly-ld" x1="${cx.toFixed(1)}" y1="${ly - 3}" x2="${lx - 2}" y2="${ly - 3}"/><text class="hud-s ly-t" x="${lx}" y="${ly}">${nm}${t > 1 ? ` ${t >= 1000 ? f1(t / 1000) + 'm' : t + 'mm'}` : ''}</text>`); });
  }
  if (note) g.P(`<text class="hud-s ly-n" x="${x + 8}" y="${y + h - 7}">${note}</text>`);
}
// 기준 대비 막대: [[이름, 값, 기준, 단위, 낮을수록 좋음?]]
function gauges(g, x, y, w, title, rows, note) {
  const h = 26 + rows.length * 22 + (note ? 12 : 0);
  g.P(`<rect class="inset" x="${x}" y="${y}" width="${w}" height="${h}"/><text class="hud-s" x="${x + 8}" y="${y + 14}">${title}</text>`);
  rows.forEach(([nm, v, lim, unit, lowGood], i) => {
    const yy = y + 24 + i * 22, bw = w - 16, mx = Math.max(v, lim || 0) * 1.25 || 1;
    const bad = lim != null && (lowGood ? v > lim : v < lim);
    g.P(`<text class="hud-s" x="${x + 8}" y="${yy + 6}">${nm}</text><text class="hud-s ${bad ? 'bad-v' : 'ok-v'}" x="${x + w - 8}" y="${yy + 6}" text-anchor="end">${v}${unit}${lim != null ? ` / ${lim}${unit}` : ''}</text>`);
    g.P(`<rect class="gb" x="${x + 8}" y="${yy + 9}" width="${bw}" height="4"/><rect class="${bad ? 'gv bad' : 'gv'}" x="${x + 8}" y="${yy + 9}" width="${(bw * clamp(v / mx, 0, 1)).toFixed(1)}" height="4"/>`);
    if (lim != null) g.P(`<line class="gl-lim" x1="${(x + 8 + bw * lim / mx).toFixed(1)}" y1="${yy + 7}" x2="${(x + 8 + bw * lim / mx).toFixed(1)}" y2="${yy + 15}"/>`);
  });
  if (note) g.P(`<text class="hud-s ly-n" x="${x + 8}" y="${y + h - 7}">${note}</text>`);
}

export function detailInset(g, c) {
  const { sc, wpId, TOP, NARROW } = c, { G, ids, cond, d, fx } = sc, k = ids[wpId];
  const x = 16, y = TOP, w = NARROW ? 200 : 236, h = NARROW ? 104 : 116;
  const res = d.res || ['hotel', 'hospital'].includes(d.u.id);
  const H = G.H, typH = sc.floors.length > 2 ? sc.floors[Math.floor(sc.floors.length / 2)].e1 - sc.floors[Math.floor(sc.floors.length / 2)].e0 : 4;
  switch (wpId) {
    case 'prep': { const L = siteNoise(cond.adj, k); gauges(g, x, y, w, '가설 · 인접 건물 소음', [['굴착기 소음 (수음점)', L, 65, 'dB', true], ['방음 감쇠', BARRIER[k] ?? 5, null, 'dB']], `인접 ${cond.adj}m · 90dB(A)@7.5m 음원 가정`); break; }
    case 'bwp': {
      const head = Math.max(0, G.depth - cond.gw);
      const L = { sheet: [['흙', 0, 'ly-soil'], ['보호재·배수판', 20, 'ly-prot'], ['방수 시트', 4, 'ly-wp'], ['외벽 콘크리트', 400, 'ly-conc']], pre: [['흙막이 벽', 600, 'ly-wall'], ['HDPE 시트 (선부착)', 2, 'ly-wp'], ['외벽 콘크리트 (일체)', 400, 'ly-conc']], bento: [['흙막이 벽', 600, 'ly-wall'], ['벤토나이트 매트', 6, 'ly-bento'], ['외벽 콘크리트', 400, 'ly-conc']], cryst: [['흙막이 벽', 600, 'ly-wall'], ['외벽 + 결정성 방수', 400, 'ly-conc'], ['배수층', 50, 'ly-drain'], ['이중벽', 90, 'ly-dbl']], tank: [['흙막이 벽', 600, 'ly-wall'], ['수밀 콘크리트 + 지수판', 450, 'ly-conc']] }[k] || [];
      layers(g, x, y, w, h, `지하 외벽 방수 · ${({ sheet: '외방수 시트', pre: '선부착 시트', bento: '벤토나이트', cryst: '내방수', tank: '화이트 탱크' })[k] || ''}`, L, `수두 ${f1(head)}m · ${Math.round(9.81 * head)}kPa · 누수 지수 ${(fx.leak ?? 1).toFixed(2)}`, 'v'); break;
    }
    case 'rebar': { const t = { site: 5, shop: 1.5, cage: 1.5, coupler: 1.5, mesh: 1.5 }[k] ?? 3; gauges(g, x, y, w, '철근 · 손실·사이클', [['스크랩 손실', t, 3, '%', true], ['층 사이클 계수', n2(fx.rebCyc || 1), 1, '', true]], { site: '현장 절단·절곡', shop: 'BIM 데이터로 공장 절단', cage: '기둥·벽 케이지 선조립', coupler: 'SD600 + 기계식 이음 (겹침 생략)', mesh: '슬래브 용접 철망' }[k]); break; }
    case 'pour': { const P = pumpMPa(H); gauges(g, x, y, w, '타설 · 압송', [['필요 압송 압력', P, k === 'highp' ? 35 : k === 'cpb' ? 13 : 8.5, 'MPa', true], ['대표 동 높이', Math.round(H), k === 'boom' || k === 'multi' ? BOOM_REACH : null, 'm', true]], k === 'winter' ? '보온 천막 + 열풍기, 5℃ 이상 3일 유지' : '압력 ≈ 0.045MPa/m × 높이 + 1.5'); break; }
    case 'steel': {
      if (k === 'none') { gauges(g, x, y, w, '철골', [['철골 부재', 0, null, 't']], '고른 골조에 철골이 없음'); break; }
      layers(g, x, y, w, h, '철골 기둥 이음 상세', k === 'bolt' ? [['스플라이스 판', 25, 'ly-steel'], ['고력볼트 M22', 22, 'ly-bolt'], ['내화 뿜칠', 40, 'ly-fp']] : k === 'block' ? [['지상 조립 블록', 3000, 'ly-steel'], ['인양 러그', 50, 'ly-bolt']] : [['완전 용입 용접', 30, 'ly-weld'], ['초음파 검사', 1, 'ly-ut'], ['내화 도료', 3, 'ly-fp']], k === 'robot' ? '로봇이 기둥 둘레를 일정 속도로 용접' : k === 'weld' ? '현장 용접: 바람막이·예열 필요' : '', 'v'); break;
    }
    case 'hoist': { const hs = HOIST[k] || HOIST.rack, workers = Math.round(Math.min(1500, Math.max(60, G.main.floors ? G.main.floors.filter(f => f.lv > 0).reduce((s, f) => s + f.area, 0) / 220 : 200))); const trip = 2 * H / hs.v + sc.NF * 0.08 + 1.5, tm = hs.cap ? Math.round(workers / (hs.cap * hs.n) * trip) : 0; gauges(g, x, y, w, '수직 운송 · 아침 출근', [['투입 인원 수송 시간', tm, 60, '분', true], ['운행 속도', hs.v, null, 'm/분']], `${hs.n}대 · 1회 ${hs.cap || '자재'}${hs.cap ? '명' : ''}`); break; }
    case 'glaz': { const lim = uLimit(cond.reg, res); const L = { dbl: [['Low-E 유리', 6, 'ly-glass'], ['아르곤 공기층', 12, 'ly-gas'], ['유리', 6, 'ly-glass']], tpl: [['Low-E', 5, 'ly-glass'], ['아르곤', 12, 'ly-gas'], ['유리', 5, 'ly-glass'], ['아르곤', 12, 'ly-gas'], ['Low-E', 5, 'ly-glass']], vac: [['유리', 5, 'ly-glass'], ['진공층', 1, 'ly-vac'], ['Low-E', 5, 'ly-glass']], bipv: [['유리', 6, 'ly-glass'], ['태양전지 셀', 2, 'ly-pv'], ['공기층', 12, 'ly-gas'], ['Low-E', 6, 'ly-glass']], pvc: [['PVC 프레임', 70, 'ly-pvc'], ['삼중 유리', 43, 'ly-glass']] }[k] || []; layers(g, x, y, w, h, `창호 단면 · U ${fx.uval} (기준 ${lim})`, L, `${res ? '주거' : '비주거'} 외기 직접 · 지역 ${cond.reg}`, 'v'); break; }
    case 'insul': { const L = { outer: [['마감 미장', 10, 'ly-fin'], ['미네랄울 (불연)', 200, 'ly-ins'], ['콘크리트 벽', 200, 'ly-conc']], inner: [['콘크리트 벽', 200, 'ly-conc'], ['단열재', 220, 'ly-ins'], ['석고보드', 12, 'ly-gyp']], vip: [['콘크리트 벽', 200, 'ly-conc'], ['진공 단열재', 30, 'ly-vip'], ['석고보드', 12, 'ly-gyp']], sandwich: [['외장 패널', 2, 'ly-steel'], ['단열 코어', 150, 'ly-ins'], ['내부 패널', 2, 'ly-steel']], spray: [['외벽', 200, 'ly-conc'], ['우레탄 폼 뿜칠', 120, 'ly-spray'], ['방화 보드', 12, 'ly-gyp']] }[k] || []; layers(g, x, y, w, h, '외벽 단열 단면 (바깥 → 안)', L, k === 'spray' ? '화기 작업 분리 필수 (RSK-08)' : k === 'outer' && H > 22 ? '22m 초과: 준불연 이상 + 방화띠' : '', 'v'); break; }
    case 'roof': { const L = { asphalt: [['누름 콘크리트', 80, 'ly-conc'], ['보호 시트', 2, 'ly-prot'], ['개량 아스팔트 시트', 4, 'ly-wp'], ['단열재', 150, 'ly-ins'], ['구조 슬래브', 200, 'ly-slab']], urethane: [['우레탄 도막 (노출)', 3, 'ly-ure'], ['단열재', 150, 'ly-ins'], ['구조 슬래브', 200, 'ly-slab']], hybrid: [['우레탄 도막', 2, 'ly-ure'], ['복합 시트', 3, 'ly-wp'], ['단열재', 150, 'ly-ins'], ['구조 슬래브', 200, 'ly-slab']], metal: [['금속 지붕판', 1, 'ly-steel'], ['단열 일체', 150, 'ly-ins'], ['퍼린·트러스', 300, 'ly-steel']], green: [['식재·토양', 300, 'ly-soil'], ['필터·배수판', 25, 'ly-drain'], ['방근 시트', 3, 'ly-wp'], ['단열재', 150, 'ly-ins'], ['구조 슬래브', 250, 'ly-slab']], pv: [['PV 패널·가대', 40, 'ly-pv'], ['방수층', 4, 'ly-wp'], ['단열재', 150, 'ly-ins'], ['구조 슬래브', 200, 'ly-slab']] }[k] || []; layers(g, x, y, w, h + (NARROW ? 0 : 8), '지붕 단면 (위 → 아래)', L, k === 'green' ? '포화 하중 ≈ 3.5kN/㎡ (일반 1.0)' : `골조 완료 후 ${fx.roofDays}일`, 'h'); break; }
    case 'hvac': { const plen = PLEN[k] ?? 0.6; gauges(g, x, y, w, `공조 · ${({ central: '중앙식', vrf: 'VRF', geo: '지열', radiant: '복사+DOAS', district: '지역난방', clean: '클린룸', crac: '항온항습', process: '공정 냉각' })[k] || ''}`, [['천장 속 필요 높이', plen, null, 'm'], ['설비 층 작업 계수', n2(fx.mepCycK || 1), 1.1, '', true]], k === 'vrf' && H > 110 ? '냉매 배관 높이 차 한계 ≈ 110m' : '덕트·배관이 천장고를 좌우'); break; }
    case 'plumb': { const p = f1(0.0098 * (k === 'zone' ? Math.min(H, 70) : H)); gauges(g, x, y, w, '급수 · 최하층 수압', [['정수압', p, 0.7, 'MPa', true], ['급수 구역', k === 'zone' ? Math.ceil(H / 70) : 1, null, '개']], k === 'pod' ? '욕실 유닛: 슬래브 단차 + 반입 개구부' : k === 'upw' ? '초순수: 오비탈 용접 EP관' : '구역당 약 70m'); break; }
    case 'fire': { const gfa = (G.main.floors || []).filter(f => f.lv > 0).reduce((s, f) => s + f.area, 0); gauges(g, x, y, w, `소방 · ${({ wet: '습식', preaction: '준비작동식', gas: '가스계', mist: '미분무', smart: '스마트', deluge: '일제살수' })[k] || ''}`, [['스프링클러 헤드', Math.round(gfa / 10), null, '개'], ['헤드 간격', 3.2, 3.2, 'm', true]], k === 'gas' ? '방호 구역 기밀 + 압력 배출구' : '헤드 1개당 약 10㎡'); break; }
    case 'elec': { const gfa = (G.main.floors || []).filter(f => f.lv > 0).reduce((s, f) => s + f.area, 0), dens = { housing: 45, office: 130, dc: 1600, fab: 1100, hospital: 170 }[d.u.id] || 120; const mva = f1(gfa * dens / 1e6 / 0.7); gauges(g, x, y, w, '수변전 · 간선', [['수전 용량', mva, null, 'MVA'], ['변압기', Math.max(1, Math.ceil(mva / 2.5)), null, '대']], { std: '단일 수전 + 케이블', bus: '버스덕트 간선', dual: '이중 수전 + UPS·발전기', renew: '태양광 + ESS', smart: 'IoT 차단기' }[k]); break; }
    case 'ict': gauges(g, x, y, w, '통신 · 자동제어', [['센서 밀도', k === 'basic' ? 0 : k === 'ibs' ? 1 : 4, null, '개/100㎡']], { basic: '통신·CCTV·방송', ibs: 'BAS 통합 관제', iot: 'IoT + BEMS', twin: 'BIM-FM 운영 트윈' }[k]); break;
    case 'elev': { const v = elevSpeed(k, H); gauges(g, x, y, w, '승강기 · 최상층 도착', [['운행 시간', Math.round(H / v + 8), 60, '초', true], ['정격 속도', v, null, 'm/s']], { rope: '로프식 · 옥상 기계실', mrl: '기계실 없음', dd: '두 층 동시 운행', dest: '행선층 예약 배차', freight: '화물·장비 수송' }[k]); break; }
    case 'part': { const L = { block: [['미장', 18, 'ly-fin'], ['시멘트 블록', 190, 'ly-block'], ['미장', 18, 'ly-fin']], dry: [['석고보드 2겹', 25, 'ly-gyp'], ['스터드 + 흡음재', 65, 'ly-ins'], ['석고보드 2겹', 25, 'ly-gyp']], alc: [['ALC 블록', 150, 'ly-alc'], ['얇은 바름', 3, 'ly-fin']], module: [['공장 패널', 100, 'ly-mod']], cleanp: [['정전기 방지 패널', 50, 'ly-steel']] }[k] || []; layers(g, x, y, w, h, `칸막이 · 벽 1㎡ ${({ block: 220, alc: 90, dry: 45, module: 60, cleanp: 30 })[k] || 60}kg`, L, k === 'block' ? '습식: 배관 매립 시 벽 따내기' : '건식: 양생 없이 다음 공정', 'v'); break; }
    case 'floor': { const L = { wet: [['마루·장판', 10, 'ly-fin'], ['방통 모르타르', 40, 'ly-mort'], ['난방 코일', 15, 'ly-heat'], ['기포 콘크리트', 40, 'ly-foam'], ['완충재', 30, 'ly-ins'], ['구조 슬래브', 210, 'ly-slab']], dryondol: [['마루', 10, 'ly-fin'], ['건식 난방 패널', 30, 'ly-heat'], ['고성능 완충재', 40, 'ly-ins'], ['구조 슬래브', 210, 'ly-slab']], oa: [['카펫 타일', 7, 'ly-fin'], ['OA 패널', 35, 'ly-steel'], ['받침대 (배선 공간)', 250, 'ly-air'], ['구조 슬래브', 210, 'ly-slab']], epoxy: [['에폭시 대전 방지', 3, 'ly-epoxy'], ['프라이머', 1, 'ly-fin'], ['구조 슬래브', 250, 'ly-slab']], polish: [['연마 표면 (강화제)', 2, 'ly-pol'], ['구조 슬래브', 250, 'ly-slab']], tile: [['비닐 시트·카펫', 3, 'ly-fin'], ['셀프 레벨링', 10, 'ly-mort'], ['구조 슬래브', 210, 'ly-slab']], stone: [['석재', 30, 'ly-stone'], ['붙임 모르타르', 40, 'ly-mort'], ['구조 슬래브', 210, 'ly-slab']] }[k] || []; layers(g, x, y, w, h + (NARROW ? 0 : 10), '바닥 단면 (위 → 아래)', L, k === 'wet' ? '방통 양생 약 21일' : k === 'dryondol' ? '바닥 충격음 1등급 목표' : '', 'h'); break; }
    case 'ceil': { const plen = k === 'exposed' ? 0 : PLEN[ids.hvac] ?? 0.6, fin = { oa: 0.3, wet: 0.12, dryondol: 0.08, stone: 0.08 }[ids.floor] || 0.03, clear = f1(typH - 0.25 - plen - fin); layers(g, x, y, w, h + (NARROW ? 0 : 10), `천장고 ${clear}m (층고 ${f1(typH)}m)`, [['구조 슬래브', 250, 'ly-slab'], [`천장 속 (${({ central: '덕트', vrf: '실내기', clean: 'FFU 플레넘', crac: '배관', radiant: '배관' })[ids.hvac] || '설비'})`, Math.round(plen * 1000), 'ly-air'], [({ mbar: 'M-bar 석고', tbar: 'T-bar 텍스', exposed: '노출 (도장)', module: '천장 모듈', cleang: 'FFU 그리드' })[k] || '천장', k === 'exposed' ? 1 : 12, 'ly-gyp'], ['실내 높이', Math.round(clear * 1000), 'ly-room']], clear < (res ? 2.3 : 2.6) ? `기준 ${res ? 2.3 : 2.6}m보다 낮음` : '', 'h'); break; }
    case 'paint': gauges(g, x, y, w, '도장·벽지', [['하루 시공량', { roller: 120, airless: 260, robot: 240, eco: 110, paper: 140 }[k] || 120, null, '㎡/조'], ['VOC', { roller: 30, airless: 50, robot: 30, eco: 0, paper: 10 }[k] ?? 30, null, 'g/L']], { robot: '퍼티·도장 로봇 (일정 두께)', eco: '무VOC + 베이크아웃 3일', airless: '스프레이: 비산 보양', paper: '초배·정배', roller: '수성 롤러' }[k]); break;
    case 'land': { const L = { std: [['보도블록', 60, 'ly-pave'], ['모래·골재', 200, 'ly-sand'], ['원지반', 300, 'ly-soil']], lid: [['투수 블록', 80, 'ly-pave'], ['투수 기층', 300, 'ly-sand'], ['저류층', 300, 'ly-drain'], ['원지반', 300, 'ly-soil']], deck: [['식재 토양', 1200, 'ly-soil'], ['배수판·필터', 30, 'ly-drain'], ['방근 방수', 4, 'ly-wp'], ['B1 지붕 슬래브', 400, 'ly-slab']], pre: [['PC 블록·벤치', 150, 'ly-pave'], ['기층', 200, 'ly-sand']], ind: [['콘크리트 포장', 300, 'ly-conc'], ['보조 기층', 300, 'ly-sand']] }[k] || []; layers(g, x, y, w, h + (NARROW ? 0 : 10), '외부 단면 (위 → 아래)', L, k === 'deck' ? '하중 ≈ 25kN/㎡ → B1 상부 설계' : '', 'h'); break; }
    case 'comm': gauges(g, x, y, w, '시운전 · 준공', [['시운전 기간 계수', n2(fx.commK || 1), 1, '', true]], { std: '공종별 단독 시운전', tab: 'TAB + 통합 시운전', digital: 'BIM + BEMS 데이터 검증', phased: '구역별 부분 사용승인', perf: '청정도·진동·전력 성능 시험' }[k]); break;
    default: break;
  }
}
