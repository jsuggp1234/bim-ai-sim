// 2D 단면의 주변 맥락 (buildsim.js의 frame()이 부른다): 배경 스카이라인 · 인접 건물 단면(지하 주차·기초·층·창호·상가·옥상 설비) ·
// 이면도로 · 대로 단면(포장층·보도·연석·차선·중앙선·지나가는 차량·보행자·가로수·가로등·신호등·버스 정류장) ·
// 도로 밑 지하 매설물(통신·전력·가스·상수·우수·하수·지역난방, 맨홀) · 게이트·현장 사무실·세륜·신호수·도로 점용 ·
// 흙막이 계측(지중경사계·지하수위계·건물 경사계·균열계·진동계)과 계측 관리 창.
import { vehicleAt, UTIL } from '../sim/street.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f1 = (v) => Math.round(v * 10) / 10;
const px = (v) => v.toFixed(1);

// 사람 (보행자·작업자): 발 위치 (x, e)
export function person(g, x, e, t = 0, cls = 'ped', hat = false) {
  const s = g.s, k = Math.max(0.85, s / 9); // 1.7m 사람이 너무 작아지지 않게
  const H = 1.7 * Math.max(1, 9 / Math.max(s, 1)) * 0.6 + 1.0; // 확대가 낮으면 살짝 크게
  const hh = Math.min(H, 2.4), sw = Math.sin(t * 6) * 0.22 * hh / 1.7;
  const X = g.X(x), Y = g.Y(e), u = (m) => m * s;
  const hip = Y - u(hh * 0.5), sh = Y - u(hh * 0.82), hd = Y - u(hh * 0.92);
  const r = Math.max(1.3, u(hh * 0.075));
  g.P(`<g class="${cls}"><line x1="${px(X)}" y1="${px(hip)}" x2="${px(X - u(sw))}" y2="${px(Y)}"/><line x1="${px(X)}" y1="${px(hip)}" x2="${px(X + u(sw))}" y2="${px(Y)}"/><line x1="${px(X)}" y1="${px(hip)}" x2="${px(X)}" y2="${px(sh)}"/><line x1="${px(X)}" y1="${px(sh + u(0.05))}" x2="${px(X + u(sw * 0.8))}" y2="${px(hip + u(0.1))}"/><circle cx="${px(X)}" cy="${px(hd)}" r="${px(r)}"/>${hat ? `<path class="hat" d="M${px(X - r * 1.25)} ${px(hd - r * 0.15)} A ${px(r * 1.1)} ${px(r * 1.1)} 0 0 1 ${px(X + r * 1.25)} ${px(hd - r * 0.15)} Z"/>` : ''}</g>`);
  void k;
}

// ---------- 배경 스카이라인 (단면 뒤 입면, 흐리게) ----------
export function drawBackdrop(g, c) {
  const { sc, eMaxV } = c, city = sc.city;
  if (!city || c.under && eMaxV < 6) return;
  g.P('<g class="bgsky">');
  city.bg.forEach(b => {
    if (b.x1 < c.xMin - 2 || b.x0 > c.xMax + 2) return;
    if (b.k === 'tank') { const r = (b.x1 - b.x0) / 2, cx = (b.x0 + b.x1) / 2, h = Math.min(b.h, r * 1.6); g.P(`<path class="bg-b" d="M${px(g.X(b.x0))} ${px(g.Y(0))}V${px(g.Y(h))}A${px(r * g.s)} ${px(r * 0.35 * g.s)} 0 0 1 ${px(g.X(b.x1))} ${px(g.Y(h))}V${px(g.Y(0))}Z"/>`); void cx; return; }
    if (b.k === 'stack') { const cx = (b.x0 + b.x1) / 2; g.rect(cx - 1.2, 0, cx + 1.2, b.h * 2.2, 'bg-b'); return; }
    g.rect(b.x0, 0, b.x1, b.h, 'bg-b');
    if (g.s > 2.2) g.rect(b.x0 + 1, 3, b.x1 - 1, b.h - 1.5, 'bg-w');
    if (b.t > 0.6 && b.h > 30) { const cx = b.x0 + (b.x1 - b.x0) * 0.6; g.line(cx, b.h, cx, b.h + 5, 'bg-l'); }
  });
  g.P('</g>');
}

// ---------- 건물 단면 (인접·건너편 공통) ----------
// face: 대지를 향한 입면 (1이면 x1 쪽, −1이면 x0 쪽). sdy: 침하 표시 (m, 과장)
function cutBld(g, c, b, face, sdy = 0, T = 0) {
  if (b.x1 < c.xMin - 3 || b.x0 > c.xMax + 3) return;
  const s = g.s, x0 = b.x0, x1 = b.x1, W = b.wall || 0.3, E = (e) => e - sdy;
  const vis = (e0, e1) => e1 >= c.eMinV - 1 && e0 <= c.eMaxV + 1;
  const fx = face > 0 ? x1 : x0, out = face;
  // 지하층 · 기초
  if (b.nbB > 0) {
    if (vis(-b.b - 16, 0)) {
      g.rect(x0, E(-b.b), x1, E(0), 'cb-in');
      g.rect(x0, E(-b.b), x0 + 0.4, E(0), 'cb-cut'); g.rect(x1 - 0.4, E(-b.b), x1, E(0), 'cb-cut');
      b.bfl.forEach((f) => {
        g.rect(x0, E(f.e1 - 0.3), x1, E(f.e1), 'cb-cut');
        for (let x = x0 + 8; x < x1 - 1; x += 8) g.rect(x - 0.3, E(f.e0), x + 0.3, E(f.e1 - 0.3), 'cb-col');
        if (s >= 3.2) for (let x = x0 + 1.2, j = 0; x < x1 - 5; x += 5.6, j++) if ((j + Math.round(f.e0)) % 3 !== 1) carSide(g, x + 2.3, E(f.e0), (j % 2) ? 1 : -1, `pk v${(j * 3 + Math.round(-f.e0)) % 6}`);
      });
      const th = b.found === 'mat' ? 1.1 : 0.9;
      g.rect(x0 - 0.3, E(-b.b - th), x1 + 0.3, E(-b.b), 'cb-cut');
      if (b.found === 'pile') for (let x = x0 + 1.4; x < x1 - 0.8; x += 3.6) g.rect(x - 0.22, E(-b.b - th - 13), x + 0.22, E(-b.b - th), 'cb-pile');
      if (s >= 4.5) {
        g.text((x0 + x1) / 2, E(b.bfl[0].e0 + 0.5), `B${b.nbB} 주차장`, 'cb-t', 'middle', -2);
        g.text((x0 + x1) / 2, E(-b.b - th), b.found === 'pile' ? '말뚝 기초' : '매트 기초', 'cb-t', 'middle', 10);
      }
    }
  } else if (vis(-2, 0)) {
    [x0, x1 - 0.9].forEach(x => g.rect(x - 0.3, E(-1.4), x + 1.2, E(-0.9), 'cb-cut'));
    g.rect(x0, E(-0.3), x1, E(0), 'cb-cut');
  }
  // 지상층
  const fac = b.kind === 'factory';
  b.fl.forEach((f, i) => {
    if (!vis(f.e0, f.e1)) return;
    g.rect(x0 + W, E(f.e0), x1 - W, E(f.e1 - 0.25), 'cb-in');
    if (fac) {
      // 철골 공장: 기둥 · 높은 창 띠 · 천장 크레인
      for (let x = x0; x <= x1 + 0.1; x += Math.max(6, (x1 - x0) / 4)) g.rect(x - 0.25, E(f.e0), x + 0.25, E(f.e1 - 0.6), 'cb-col');
      if (s >= 2.5) { g.rect(x0 + W, E(f.e1 - 2.4), x1 - W, E(f.e1 - 2.1), 'cb-crane'); g.rect(x0 + (x1 - x0) * (0.3 + 0.2 * Math.sin(T * 0.2)), E(f.e1 - 3.2), x0 + (x1 - x0) * (0.3 + 0.2 * Math.sin(T * 0.2)) + 1.2, E(f.e1 - 2.4), 'cb-crane'); }
      [x0, x1 - 0.18].forEach(x => { g.rect(x, E(f.e0), x + 0.18, E(f.e1), 'cb-pan'); g.rect(x - 0.02, E(f.e1 - 4), x + 0.2, E(f.e1 - 2.8), 'cb-glr'); });
      if (s >= 3) { g.rect(x0 + 3, E(f.e0), x0 + 5.2, E(f.e0 + 2.4), 'cb-bw'); for (let x = x0 + 8; x < x1 - 4; x += 7) g.rect(x, E(f.e0), x + 2.4, E(f.e0 + 1.6), 'cb-box'); }
      return;
    }
    // 뒤 벽 창 (잘린 면 너머로 보이는 창)
    const bay = b.kind === 'office' ? 2.4 : 3.4;
    if (s >= 2.6 && !(i === 0 && b.shop)) for (let x = x0 + W + 0.9; x < x1 - W - 1.2; x += bay) g.rect(x, E(f.e0 + (b.kind === 'office' ? 0.4 : 0.9)), x + bay * 0.62, E(f.e1 - 0.65), 'cb-bw');
    g.rect(x0, E(f.e1 - 0.25), x1, E(f.e1), 'cb-cut');
    // 외벽 (창 개구부 · 유리)
    [[x0, -1], [x1 - W, 1]].forEach(([wx, sd]) => {
      const shopHere = i === 0 && b.shop && sd === face;
      if (b.kind === 'office' || shopHere) {
        g.rect(wx, E(f.e1 - 0.75), wx + W, E(f.e1 - 0.25), 'cb-cut');
        g.rect(wx + W * 0.35, E(f.e0 + 0.05), wx + W * 0.65, E(f.e1 - 0.75), 'cb-glr');
      } else {
        const sill = b.kind === 'school' ? 0.8 : 0.9;
        g.rect(wx, E(f.e0), wx + W, E(f.e0 + sill), 'cb-cut'); g.rect(wx, E(f.e1 - 0.6), wx + W, E(f.e1 - 0.25), 'cb-cut');
        g.rect(wx + W * 0.35, E(f.e0 + sill), wx + W * 0.65, E(f.e1 - 0.6), 'cb-glr');
      }
    });
    // 실내: 조명 · 가구 · 사람 (확대했을 때)
    if (s >= 5) {
      for (let x = x0 + 2.2; x < x1 - 1.5; x += 4.2) g.rect(x, E(f.e1 - 0.42), x + 0.9, E(f.e1 - 0.3), 'cb-lamp');
      const seed = (i * 7 + Math.round(x0)) % 5;
      if (b.kind === 'office' || b.kind === 'mixed') for (let x = x0 + 2 + seed * 0.3; x < x1 - 2; x += 4.2) { g.rect(x, E(f.e0 + 0.72), x + 1.6, E(f.e0 + 0.78), 'cb-fur'); g.line(x + 0.2, E(f.e0), x + 0.2, E(f.e0 + 0.72), 'cb-furl'); g.line(x + 1.4, E(f.e0), x + 1.4, E(f.e0 + 0.72), 'cb-furl'); }
      else if (b.kind === 'officetel' || b.kind === 'house') { const x = x0 + 2 + seed; g.rect(x, E(f.e0), x + 2, E(f.e0 + 0.45), 'cb-fur'); g.rect(x1 - 4 - seed * 0.4, E(f.e0), x1 - 3.4 - seed * 0.4, E(f.e0 + 1.9), 'cb-fur'); }
      else if (b.kind === 'school') for (let x = x0 + 2; x < x1 - 2; x += 1.6) g.rect(x, E(f.e0 + 0.68), x + 0.9, E(f.e0 + 0.74), 'cb-fur');
      if (s >= 6 && (i + seed) % 2 === 0 && !(i === 0 && b.shop)) person(g, x0 + (x1 - x0) * (0.3 + 0.08 * seed) + Math.sin(T * 0.2 + i) * 1.2, E(f.e0), T * 0.3 + i, 'cb-p');
    }
    // 발코니
    if (b.balcony && i > 0) { const bx = fx + out * 1.3; g.rect(Math.min(fx, bx), E(f.e0 - 0.18), Math.max(fx, bx), E(f.e0 + 0.02), 'cb-cut'); g.line(bx, E(f.e0), bx, E(f.e0 + 1.15), 'cb-rail'); if (s >= 6) g.line(fx, E(f.e0 + 1.1), bx, E(f.e0 + 1.1), 'cb-rail'); }
  });
  // 1층 상가: 차양 · 간판
  if (b.shop && vis(0, 6)) {
    const f = b.fl[0], e = f.e1 - 1.0;
    g.poly([[fx, E(e)], [fx + out * 1.6, E(e - 0.45)], [fx + out * 1.6, E(e - 0.6)], [fx, E(e - 0.25)]], 'cb-awn');
    g.rect(fx + out * 0.02, E(f.e1 - 0.75), fx + out * 0.32, E(f.e1 - 0.3), 'cb-sign');
    if (s >= 4.2) g.text(fx + out * 0.6, E(f.e1 - 0.55), b.shopName, 'cb-st', out > 0 ? 'start' : 'end', 3);
    if (s >= 5) person(g, fx + out * 2.2, E(0.15), T * 0.4, 'ped');
  }
  // 지붕: 파라펫 · 탑옥 · 물탱크 · 실외기 · 안테나 (공장은 트러스·경사 지붕)
  const top = b.top;
  if (!vis(top - 1, top + 8)) return;
  if (fac) {
    const pts = []; const n = Math.max(4, Math.round((x1 - x0) / 3));
    for (let j = 0; j <= n; j++) pts.push([x0 + (x1 - x0) * j / n, E(top - (j % 2 ? 0 : 1.4))]);
    g.pl(pts, 'cb-truss'); g.line(x0, E(top - 1.4), x1, E(top - 1.4), 'cb-truss');
    g.poly([[x0 - 0.4, E(top)], [(x0 + x1) / 2, E(top + (x1 - x0) * 0.06)], [x1 + 0.4, E(top)]], 'cb-roof');
    return;
  }
  g.rect(x0, E(top), x0 + W, E(top + 1.0), 'cb-cut'); g.rect(x1 - W, E(top), x1, E(top + 1.0), 'cb-cut');
  if (b.pent) { const p0 = x0 + (x1 - x0) * 0.38, p1 = p0 + Math.min(8, (x1 - x0) * 0.3); g.rect(p0, E(top), p1, E(top + 3), 'cb-pent'); g.rect(p0 - 0.1, E(top + 3), p1 + 0.1, E(top + 3.25), 'cb-cut'); if (s >= 4) g.rect(p1 - 1.4, E(top), p1 - 0.5, E(top + 2.1), 'cb-bw'); }
  if (b.tank) { const t0 = x0 + (x1 - x0) * 0.12, t1 = t0 + 2.6; [t0 + 0.3, t1 - 0.3].forEach(x => g.line(x, E(top), x, E(top + 0.9), 'cb-leg')); g.rect(t0, E(top + 0.9), t1, E(top + 3.0), 'cb-tank'); if (s >= 6) for (let x = t0 + 0.65; x < t1; x += 0.65) g.line(x, E(top + 0.9), x, E(top + 3.0), 'cb-furl'); }
  for (let j = 0; j < (b.odu || 0); j++) { const x = x1 - 1.6 - j * 1.25; if (x < x0 + 4) break; g.rect(x - 0.5, E(top), x + 0.5, E(top + 0.85), 'cb-odu'); if (s >= 7) g.circ(x, E(top + 0.45), 0.3 * s, 'cb-fan'); }
  if ((x1 - x0) > 12 && b.pent) { const ax = x0 + (x1 - x0) * 0.42; g.line(ax, E(top + 3.25), ax, E(top + 7.5), 'cb-leg'); g.line(ax - 0.6, E(top + 6.6), ax + 0.6, E(top + 6.6), 'cb-leg'); }
}

// 주차 차량 (옆모습, 바닥 e)
function carSide(g, x, e, dir, cls) {
  const L = 4.5, H = 1.45;
  g.P(`<path class="${cls}" d="M${px(g.X(x - L / 2))} ${px(g.Y(e + 0.3))}V${px(g.Y(e + 0.85))}L${px(g.X(x - L * 0.3 * dir))} ${px(g.Y(e + 0.95))}L${px(g.X(x - L * 0.18 * dir))} ${px(g.Y(e + H))}H${px(g.X(x + L * 0.2 * dir))}L${px(g.X(x + L * 0.34 * dir))} ${px(g.Y(e + 0.92))}L${px(g.X(x + L / 2))} ${px(g.Y(e + 0.8))}V${px(g.Y(e + 0.3))}Z"/>`);
  [-1, 1].forEach(k => g.circ(x + k * L * 0.3, e + 0.32, Math.max(1, 0.32 * g.s), 'veh-w'));
}

// 차량 앞·뒤 모습 (단면을 지나가는 차)
function vehicle(g, v) {
  const { x, w, h } = v, s = g.s, X = (m) => px(g.X(m)), Y = (m) => px(g.Y(m));
  const front = v.dir < 0; // 이쪽으로 오는 차: 전조등, 멀어지는 차: 미등
  g.P(`<g class="veh" opacity="${v.op.toFixed(2)}">`);
  if (v.k === 'bike') {
    g.rect(x - 0.06, 0, x + 0.06, 0.62, 'veh-w'); g.line(x - 0.36, 0.95, x + 0.36, 0.95, 'veh-l');
    g.rect(x - 0.22, 0.95, x + 0.22, 1.5, `veh v${v.col}`); g.circ(x, 1.68, Math.max(1.4, 0.17 * s), `veh v${v.col}`); g.circ(x, 0.8, Math.max(1, 0.06 * s), front ? 'veh-hl' : 'veh-tl');
    g.P('</g>'); return;
  }
  const tall = v.k === 'bus' || v.k === 'truck';
  const eb = tall ? 0.38 : 0.3, ew = tall ? h * 0.5 : eb + h * 0.4;
  if (tall) {
    if (v.k === 'truck') g.rect(x - w / 2 - 0.04, h * 0.7, x + w / 2 + 0.04, h, `veh box`);
    g.P(`<rect class="veh v${v.k === 'bus' ? 'bus' : v.col}" x="${X(x - w / 2)}" y="${Y(v.k === 'truck' ? h * 0.74 : h)}" width="${px(w * s)}" height="${px(((v.k === 'truck' ? h * 0.74 : h) - eb) * s)}" rx="${px(Math.min(4, 0.18 * s))}"/>`);
    const wt = v.k === 'truck' ? h * 0.72 : h * 0.9;
    g.rect(x - w * 0.42, ew, x + w * 0.42, wt, 'veh-g');
    if (v.k === 'bus') { g.rect(x - w * 0.36, h * 0.91, x + w * 0.36, h * 0.97, 'veh-led'); if (s >= 9) g.text(x, h * 0.94, '7016', 'veh-ledt', 'middle', 2.5); }
  } else {
    g.P(`<rect class="veh v${v.col}" x="${X(x - w / 2)}" y="${Y(ew)}" width="${px(w * s)}" height="${px((ew - eb) * s)}" rx="${px(Math.min(3, 0.14 * s))}"/>`);
    g.poly([[x - w * 0.45, ew], [x - w * 0.36, h], [x + w * 0.36, h], [x + w * 0.45, ew]], `veh v${v.col}`);
    g.poly([[x - w * 0.38, ew + 0.04], [x - w * 0.31, h - 0.08], [x + w * 0.31, h - 0.08], [x + w * 0.38, ew + 0.04]], 'veh-g');
    if (s >= 5) { g.rect(x - w * 0.56, ew - 0.02, x - w * 0.47, ew + 0.12, `veh v${v.col}`); g.rect(x + w * 0.47, ew - 0.02, x + w * 0.56, ew + 0.12, `veh v${v.col}`); }
  }
  [-1, 1].forEach(k => g.rect(x + k * (w / 2 - 0.22) - 0.13, 0, x + k * (w / 2 - 0.22) + 0.13, eb + 0.08, 'veh-w'));
  [-1, 1].forEach(k => g.circ(x + k * w * 0.34, eb + (tall ? 0.35 : 0.22), Math.max(1, 0.09 * s), front ? 'veh-hl' : 'veh-tl'));
  if (s >= 7 && !tall) g.rect(x - w * 0.14, eb + 0.08, x + w * 0.14, eb + 0.2, 'veh-plate');
  g.P('</g>');
}

function tree(g, x, h, r, e0 = 0.15, cls = 'st-tree') {
  g.rect(x - 0.6, e0 - 0.02, x + 0.6, e0 + 0.03, 'grate');
  g.line(x, e0, x, h * 0.48, 'st-trunk'); g.line(x, h * 0.4, x - r * 0.35, h * 0.6, 'st-trunk'); g.line(x, h * 0.42, x + r * 0.32, h * 0.62, 'st-trunk');
  g.P(`<ellipse class="${cls}" cx="${px(g.X(x))}" cy="${px(g.Y(h * 0.68))}" rx="${px(r * g.s)}" ry="${px(h * 0.3 * g.s)}"/>`);
  if (g.s >= 6) g.circ(x, -0.55, 0.65 * g.s, 'rootb');
}
function lamp(g, x, h, arm, dir) {
  g.rect(x - 0.12, 0, x + 0.12, h, 'pole'); g.pl([[x, h - 0.3], [x + dir * arm * 0.6, h + 0.25], [x + dir * arm, h + 0.2]], 'pole-l');
  g.rect(x + dir * arm - 0.35, h - 0.02, x + dir * arm + 0.35, h + 0.2, 'lamp-h');
  if (g.s >= 4) g.poly([[x + dir * arm - 0.3, h], [x + dir * arm + 0.3, h], [x + dir * arm + 1.6, h - 3.2], [x + dir * arm - 1.6, h - 3.2]], 'lamp-c');
}
function signal(g, sig, T) {
  const { x, h, arm } = sig, ph = (T / 14) % 1, on = ph < 0.45 ? 2 : ph < 0.55 ? 1 : 0;
  g.rect(x - 0.15, 0, x + 0.15, h, 'pole'); g.line(x, h - 0.2, x - arm, h - 0.2, 'pole-l');
  const hx = x - arm * 0.75; g.rect(hx - 1.15, h - 0.65, hx + 1.15, h + 0.05, 'sig-b');
  ['sig-r', 'sig-y', 'sig-g'].forEach((cl, j) => g.circ(hx - 0.72 + j * 0.72, h - 0.3, Math.max(1.2, 0.2 * g.s), cl + (j === 2 - on ? ' on' : '')));
  g.rect(x + 0.15, 2.4, x + 0.75, 3.4, 'sig-b'); g.circ(x + 0.45, 3.1, Math.max(1, 0.16 * g.s), ph < 0.45 ? 'sig-r on' : 'sig-g on');
}

// ---------- 대로 · 이면도로 · 매설물 · 건너편 ----------
export function drawStreet(g, c) {
  const { sc, T } = c, city = sc.city; if (!city) return;
  const s = g.s, lab = c.under || c.wpId === 'prep' || c.wpId === 'land' || s >= 14;
  const R0 = city.road[0], R1 = city.road[1];
  // 포장층 (아스팔트 표층·기층·보조기층·동상방지층)
  const PV = [[0, -0.05, 'pv-1', '표층 50'], [-0.05, -0.12, 'pv-2', '중간층 70'], [-0.12, -0.32, 'pv-3', '기층 200'], [-0.32, -0.62, 'pv-4', '보조기층 300'], [-0.62, -0.92, 'pv-5', '동상방지층 300']];
  PV.forEach(([a, b, k]) => g.rect(R0, a, R1, b, k));
  if (s >= 22 || (lab && s >= 12)) PV.forEach(([a, b, , nm], j) => { if (j < 2 && s < 30) return; g.text(R1 - 0.2, (a + b) / 2, nm, 'pv-t', 'end', 3); });
  // 보도 (블록·모래·기층) + 연석
  [[city.sw[0], city.sw[1]], [city.sw2[0], city.sw2[1]]].forEach(([a, b]) => { if (b - a < 0.3) return; g.rect(a, 0.15, b, 0.09, 'sw-blk'); g.rect(a, 0.09, b, 0.05, 'sw-sand'); g.rect(a, 0.05, b, -0.25, 'pv-3'); if (s >= 14) for (let x = a + 0.2; x < b; x += 0.2) g.line(x, 0.15, x, 0.09, 'sw-j'); });
  g.rect(city.curb - 0.2, -0.3, city.curb, 0.15, 'curb'); g.rect(city.sw2[0], -0.3, city.sw2[0] + 0.2, 0.15, 'curb');
  // 차선 · 중앙선
  g.rect(R0, 0, R1, 0.02, 'asp');
  city.lanes.forEach((L, i) => { if (i > 0 && city.lanes[i - 1].dir === L.dir) g.rect(L.x0 - 0.07, 0, L.x0 + 0.07, 0.03, 'ln-w'); });
  if (city.center) { const [a, b] = city.center; g.rect(a, 0, a + Math.min(0.15, (b - a) / 3), 0.03, 'ln-y'); g.rect(b - Math.min(0.15, (b - a) / 3), 0, b, 0.03, 'ln-y'); }
  // 지하 매설물 + 맨홀
  const lbs = [];
  city.utils.forEach((u) => {
    const cl = UTIL[u.k].c;
    if (u.n) { const nn = u.n, cols = Math.min(nn, 2), rows = Math.ceil(nn / cols), d = Math.max(u.d, 0.1), w = cols * d * 1.4 + 0.12, h = rows * d * 1.4 + 0.12; g.rect(u.x - w / 2, u.e - h / 2, u.x + w / 2, u.e + h / 2, 'ut-enc'); for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) g.circ(u.x - w / 2 + 0.06 + d * 0.7 + q * d * 1.4, u.e - h / 2 + 0.06 + d * 0.7 + r * d * 1.4, Math.max(1, d / 2 * s), `ut ut-${cl}`); }
    else { g.circ(u.x, u.e, Math.max(1.6, u.d / 2 * s), `ut ut-${cl}`); if (u.d >= 0.4 && s >= 6) g.circ(u.x, u.e, Math.max(1, (u.d / 2 - 0.06) * s), 'ut-in'); }
    lbs.push(u);
  });
  if (city.manhole) { const m = city.manhole; g.rect(m.x - 0.5, m.e, m.x - 0.38, 0, 'mh'); g.rect(m.x + 0.38, m.e, m.x + 0.5, 0, 'mh'); g.rect(m.x - 0.36, -0.06, m.x + 0.36, 0.02, 'mh-c'); if (s >= 9) for (let e = -0.5; e > m.e + 0.3; e -= 0.35) g.line(m.x - 0.3, e, m.x - 0.1, e, 'mh-s'); }
  if (lab && s >= 11) {
    // 세 줄로 엇갈려 이름표 (지시선)
    const top = g.Y(-3.6) + 10;
    lbs.slice().sort((a, b) => a.x - b.x).forEach((u, j) => { const row = j % 3, ty = top + row * 11, tx = g.X(u.x); if (tx < 40 || tx > c.VW - 40) return; g.P(`<line class="ut-ld" x1="${px(tx)}" y1="${px(g.Y(u.e - (u.d || 0.1) / 2))}" x2="${px(tx)}" y2="${px(ty - 8)}"/><text class="ut-t" x="${px(tx)}" y="${px(ty)}" text-anchor="middle">${u.name}</text>`); });
  } else if (c.under && g.X((R0 + R1) / 2) < c.VW - 50) g.text((R0 + R1) / 2, -3.6, '도로 밑 매설물', 'ut-t', 'middle', 12);
  // 가로수 · 가로등 · 신호등 · 버스 정류장 · 전신주
  city.trees.forEach(t => tree(g, t.x, t.h, t.r));
  city.lights.forEach(l => lamp(g, l.x, l.h, l.arm, l.dir));
  if (city.signal) signal(g, city.signal, T);
  if (city.busStop) { const b = city.busStop; g.rect(b.x0, 0.15, b.x0 + 0.08, b.h, 'pole'); g.rect(b.x0 - 0.2, b.h, b.x1 + 0.3, b.h + 0.12, 'bus-r'); g.rect(b.x0 + 0.05, 0.6, b.x0 + 0.12, b.h - 0.1, 'bus-p'); g.rect(b.x0 + 0.4, 0.55, b.x1 - 0.2, 0.62, 'cb-fur'); if (s >= 6) g.text((b.x0 + b.x1) / 2, b.h + 0.4, '정류장', 'cb-t', 'middle', -2); if (s >= 5) person(g, b.x0 + 1.2, 0.15, 0, 'ped'); }
  // 건너편 건물
  city.far.forEach(b => cutBld(g, c, b, -1, 0, T));
  if (city.far[0] && s >= 3.5 && city.far[0].x0 < c.xMax - 6) g.text(city.far[0].x0 + 1, city.far[0].top + 1.5, city.far[0].name, 'nb-t', 'start', -2);
  // 이면도로 (인접 건물 쪽)
  const L = city.left;
  if (L.road) {
    const [a, b] = L.road;
    PV.slice(0, 4).forEach(([p, q, k]) => g.rect(a, p, b, q, k));
    g.rect(a, 0, b, 0.02, 'asp');
    if (L.center) { const m = (a + b) / 2; g.rect(m - 0.15, 0, m + 0.15, 0.03, 'ln-y'); }
    if (L.sw) { g.rect(L.sw[0], 0.15, L.sw[1], 0.09, 'sw-blk'); g.rect(L.sw[0], 0.05, L.sw[1], -0.25, 'pv-3'); g.rect(L.sw[1] - 0.2, -0.3, L.sw[1], 0.15, 'curb'); }
    // 이면도로 매설물 (상수·하수) — 왼쪽 앵커가 지나갈 수 있는 자리
    g.circ(a + (b - a) * 0.3, -1.2, Math.max(1.4, 0.075 * s), 'ut ut-water'); g.circ(a + (b - a) * 0.65, -1.9, Math.max(1.6, 0.2 * s), 'ut ut-sewer');
    if (lab && s >= 6) { g.text(a + (b - a) * 0.3, -1.6, '상수 Ø150', 'ut-t', 'middle', 6); g.text(a + (b - a) * 0.65, -2.3, '하수 Ø400', 'ut-t', 'middle', 6); }
    if (L.car) { const v = { k: L.car.k === 'van' ? 'van' : 'car', w: L.car.k === 'van' ? 1.9 : 1.8, h: L.car.k === 'van' ? 2.0 : 1.45, x: L.car.x, dir: 1, op: 1, col: 3 }; vehicle(g, v); }
  }
  if (L.pole) { const p = L.pole; g.rect(p.x - 0.16, 0, p.x + 0.16, p.h, 'pole'); g.line(p.x - 1.1, p.h - 0.6, p.x + 1.1, p.h - 0.6, 'pole-l'); [-0.9, 0, 0.9].forEach(k => g.circ(p.x + k, p.h - 0.45, Math.max(1, 0.08 * s), 'insu')); if (s >= 3) g.rect(p.x + 0.16, p.h - 2.6, p.x + 0.7, p.h - 1.6, 'trf'); }
  if (L.wall != null) { g.rect(L.wall - 0.1, 0, L.wall + 0.1, 1.8, 'cb-cut'); }
  if (L.trees) L.trees.forEach(t => tree(g, t.x, t.h, t.r, 0));
  if (L.green) g.rect(L.green[0], 0, L.green[1], 0.08, 'grass');
}

// ---------- 인접 건물 (침하 표시 포함) ----------
export function drawNeighbours(g, c, sdy) {
  const { sc, T } = c, city = sc.city; if (!city) return;
  if (city.nb2) { const b = city.nb2; if (b.x1 > c.xMin - 2) { g.rect(b.x0, -b.b, b.x1, b.h, 'nb2'); if (g.s > 2.2) g.rect(b.x0 + 1, 3, b.x1 - 1, b.h - 1.5, 'bg-w'); } }
  cutBld(g, c, city.nb, 1, sdy, T);
}

// ---------- 게이트 · 현장 사무실 · 세륜 · 신호수 · 도로 점용 ----------
export function drawGate(g, c) {
  const { sc, T, K, P, wpId } = c, city = sc.city; if (!city) return;
  const { G, ids } = sc, pw = G.pw, open = ids.wall === 'open' && K('wall');
  const prepOn = K('prep') && P('prep') > 0 && (K('land') ? P('land') : 0) < 0.85;
  const gx = city.gate;
  // 게이트: 기둥 + 미닫이 문 (차량 출입 때 열림)
  const busy = (P('excav') > 0 && P('excav') < 1) || c.trucks;
  g.rect(gx - 0.12, 0, gx + 0.12, 3.6, 'gate-p');
  if (prepOn) { const op = busy ? 0.5 + 0.5 * Math.sin(T * 0.6) : 0; g.rect(gx + 0.12, 0.1, gx + 0.12 + 0.25 * (1 - op) + 0.05, 2.8, 'gate-d'); }
  g.text(gx, 3.9, 'GATE', 'gate-t', 'middle', -2);
  // 현장 사무실 (컨테이너, 마구리 면) — 착공 준비 후
  if (prepOn && P('prep') > 0.3 && !open) {
    const n = ids.prep === 'modular' ? 3 : ids.prep === 'mini' ? 1 : 2, x0 = pw + 0.45, w = 2.44, hh = 2.6;
    for (let i = 0; i < n; i++) { const e = i * hh; g.rect(x0, e, x0 + w, e + hh - 0.05, `ofc${c.F('prep')}`); g.rect(x0 + 0.5, e + 1.0, x0 + w - 0.5, e + 2.0, 'ofc-w'); if (g.s >= 6) g.line(x0 + w / 2, e + 1.0, x0 + w / 2, e + 2.0, 'ofc-m'); }
    if (n > 1) { g.pl([[x0 + w, 0], [x0 + w + 1.2, (n - 1) * hh]], 'ofc-st'); g.line(x0 + w + 1.2, (n - 1) * hh, x0 + w, (n - 1) * hh, 'ofc-st'); }
    if (wpId === 'prep' || wpId === 'land') g.text(x0 + w / 2, n * hh + 0.4, ids.prep === 'modular' ? '모듈러 사무실' : '현장 사무실', 'eq-lab', 'middle', -3);
    // 세륜기 (출구 앞)
    if (ids.prep !== 'mini') { g.rect(pw + 3.05, -0.35, pw + 4.65, 0.12, `wash${c.F('prep')}`); [pw + 3.25, pw + 4.45].forEach(x => g.line(x, 0.12, x, 0.6, 'wash-n')); if (busy || wpId === 'prep') for (let j = 0; j < 5; j++) g.circ(pw + 3.3 + j * 0.3, 0.2 + ((T * 3 + j * 0.27) % 1) * 0.5, Math.max(1, 0.06 * g.s), 'wdrop'); if (g.s >= 7) g.text(pw + 3.85, 0.8, '세륜', 'eq-lab', 'middle', -2); }
    // 안내판
    if (g.s >= 4) { g.rect(city.fence - 0.05, 0.9, city.fence + 0.05, 2.4, 'board'); }
  }
}

// ---------- 지나가는 차량 · 보행자 · 도로 점용 · 신호수 (장비를 다 그린 뒤: 장비가 쓰는 차로는 비운다) ----------
export function drawTraffic(g, c) {
  const { sc, T } = c, city = sc.city; if (!city) return;
  const s = g.s, occ = c.occupied;
  city.lanes.forEach((L, i) => { if (occ.has(i)) return; const v = vehicleAt(L, i, T, sc.R.site.id); if (v && v.op > 0.02) vehicle(g, v); });
  if (s >= 3) {
    const sw = city.sw, sw2 = city.sw2;
    [[sw, 0], [sw, 1], [sw2, 2], [sw2, 3]].forEach(([r, j]) => { if (r[1] - r[0] < 1.2) return; const ph = ((T * 0.05 + j * 0.37) % 1); const x = r[0] + 0.5 + (r[1] - r[0] - 1) * (j % 2 ? 1 - ph : ph); person(g, x, 0.15, T * 0.9 + j, 'ped'); });
    const L = city.left; if (L.road && c.urbanLeft) { const [a, b] = L.road, ph = (T * 0.04) % 1; person(g, a + 0.6 + (b - a - 1.2) * ph, 0, T * 0.9 + 3, 'ped'); }
  }
  if (occ.size) {
    const L0 = city.lanes[Math.min(...occ)], L1 = city.lanes[Math.max(...occ)];
    for (let x = L0.x0 + 0.4; x < L1.x1; x += 1.6) g.poly([[x - 0.18, 0], [x + 0.18, 0], [x, 0.7]], 'tcone');
    if (s >= 3.5) g.text((L0.x0 + L1.x1) / 2, 5.6, '도로 점용', 'warn-t', 'middle', 0);
  }
  if (c.trucks || occ.size) { const x = city.sw[0] + 1.6; person(g, x, 0.15, 0, 'flag', true); const a = Math.sin(T * 3) * 0.5; g.line(x, 1.55, x + 0.8 * Math.cos(a), 1.55 + 0.8 * Math.sin(a) + 0.4, 'flag-b'); if (s >= 6) g.text(x, 2.7, '신호수', 'eq-lab', 'middle', -2); }
}

// ---------- 흙막이 계측 (지하 공종) ----------
const MONITOR = new Set(['wall', 'support', 'water', 'excav', 'found', 'base']);
export function drawMonitor(g, c, settleNow, earthP, dwOn) {
  const { sc, wpId, T, K } = c, { G, nb, cond, mv } = sc, depth = G.depth;
  if (!MONITOR.has(wpId) || !K('wall') || depth <= 0.5) return null;
  const s = g.s, e0 = -Math.min(sc.embed + 2, sc.dv - 2), dk = clamp(earthP * 1.15, 0, 1);
  const defl = (mv.defl || 0) * dk;
  // 지중경사계: 벽 바로 뒤, 벽체 변형 곡선 (과장 ×80)
  const ix = -1.2;
  g.line(ix, 0.4, ix, e0, 'mon-p');
  const pts = []; for (let e = 0; e >= e0; e -= 0.5) { const z = -e / -e0; pts.push([ix + (defl / 1000) * 80 * Math.sin(Math.PI * clamp(z * 1.15, 0, 1)) * (z < 0.87 ? 1 : 0.4), e]); }
  g.pl(pts, 'mon-c');
  g.rect(ix - 0.25, 0.4, ix + 0.25, 0.8, 'mon-b');
  // 지하수위계
  const wx = -2.2, wl = -(cond.gw + (dwOn ? (sc.d.belowGW + 1.5) * clamp(earthP * 1.5, 0, 1) * 0.35 : 0));
  g.line(wx, 0.5, wx, -Math.min(sc.dv - 2, depth + 6), 'mon-w'); if (cond.gw < sc.dv - 2) g.poly([[wx - 0.35, wl + 0.35], [wx + 0.35, wl + 0.35], [wx, wl]], 'mon-wl');
  // 인접 건물: 경사계 · 균열계 · 진동계
  const nx = nb.x1, sdy = settleNow * 0.025;
  g.rect(nx + 0.05, 5 - sdy, nx + 0.6, 5.7 - sdy, 'mon-b'); g.rect(nx + 0.05, 1.6 - sdy, nx + 0.35, 2.2 - sdy, 'mon-b');
  if (wpId === 'excav' || wpId === 'found') { g.rect(nx - 1.4, 0.0 - sdy, nx - 0.6, 0.5 - sdy, 'mon-b'); const r = (T * 2) % 1; g.circ(nx - 1.0, 0.25 - sdy, (0.5 + r * 1.2) * s, 'mon-v'); }
  // 데이터 로거 (무선)
  const lx = c.sc.city ? c.sc.city.pl + 0.6 : -2.6;
  g.rect(lx - 0.35, 1.0, lx + 0.35, 1.7, 'mon-b'); g.line(lx, 1.7, lx, 2.6, 'mon-p'); const rr = (T * 1.5) % 1; g.P(`<circle class="mon-v" cx="${px(g.X(lx))}" cy="${px(g.Y(2.6))}" r="${px(4 + rr * 10)}" opacity="${(1 - rr).toFixed(2)}"/>`);
  if (s >= 5.5) {
    g.text(ix, 0.9, '지중경사계', 'mon-t', 'middle', -4); g.text(wx, -Math.min(sc.dv - 2, depth + 6), '수위계', 'mon-t', 'middle', 11);
    g.text(nx + 0.7, 5.35 - sdy, '경사계', 'mon-t', 'start', 3); g.text(nx + 0.45, 1.9 - sdy, '균열계', 'mon-t', 'start', 3);
  }
  const tilt = settleNow > 0.05 ? Math.round((nb.x1 - nb.x0) * 1000 / settleNow) : 0;
  return { defl: f1(defl), defl0: mv.defl, lim: f1(depth * 1000 / 500 * 1.2), settle: f1(settleNow), allow: mv.allow, tilt, dw: dwOn ? f1(Math.abs(wl + cond.gw)) : 0 };
}

// 계측 관리 창 (왼쪽 위)
export function monitorInset(g, c, m) {
  if (!m) return;
  const { TOP, NARROW } = c, x = 16, y = TOP, w = NARROW ? 200 : 236;
  const rows = [['지중경사 (벽체 변위)', m.defl, m.lim, 'mm'], ['인접 건물 침하', m.settle, m.allow, 'mm']];
  if (m.dw) rows.push(['지하수위 저하', m.dw, null, 'm']);
  const h = 24 + rows.length * 22 + 16;
  g.P(`<rect class="inset" x="${x}" y="${y}" width="${w}" height="${h}"/><text class="hud-s" x="${x + 8}" y="${y + 14}">실시간 계측 · 관리 기준</text>`);
  rows.forEach(([nm, v, lim, u], i) => {
    const yy = y + 30 + i * 22, bw = w - 16, max = Math.max(lim || v || 1, v) * 1.25 || 1, k = clamp(v / max, 0, 1), bad = lim != null && v > lim, warn = lim != null && v > lim * 0.7;
    g.P(`<text class="hud-s" x="${x + 8}" y="${yy}">${nm}</text><text class="hud-s ${bad ? 'bad-v' : warn ? 'warn-v' : 'ok-v'}" x="${x + w - 8}" y="${yy}" text-anchor="end">${v}${u}${lim != null ? ` / ${lim}${u}` : ''}</text>`);
    g.P(`<rect class="gb" x="${x + 8}" y="${yy + 4}" width="${bw}" height="4"/><rect class="gv${bad ? ' bad' : warn ? ' warn' : ''}" x="${x + 8}" y="${yy + 4}" width="${(bw * k).toFixed(1)}" height="4"/>`);
    if (lim != null) { const lx = x + 8 + bw * clamp(lim / max, 0, 1); g.P(`<line class="gl-lim" x1="${lx.toFixed(1)}" y1="${yy + 1}" x2="${lx.toFixed(1)}" y2="${yy + 11}"/>`); }
  });
  g.P(`<text class="hud-s" x="${x + 8}" y="${y + h - 6}">${m.tilt ? `건물 기울기 1/${m.tilt} (기준 1/500)` : '변위 ×80 과장 표시'}</text>`);
}
