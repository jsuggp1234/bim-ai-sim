// 07 위험 예측: BIM 물량 · 4D 공정 · 현장 조건 · 고른 공법 · 남은 간섭으로 위험 등록부(P×I)를 만들고,
// 몬테카를로 2,000회로 공기·공사비 확률 분포를 낸다. AI는 위험을 가장 많이 줄이는 공법 교체안을 찾아 제안한다.
import { RISK_CATS, RISK_CAT_KEYS, LEVEL, levers } from '../sim/risk.js';
import { resolveMethods, WP_BY_ID } from '../sim/methods.js';
import { CATS, ym, dateAt } from '../sim/process.js';
import { pipeline, fmt, won, setMethodState, setOptState, optState, tip, download, csv } from '../pipeline.js';
import { head, sub, dot, tabs, escH } from '../ui/sys.js';

export const title = '07 위험 예측';
const MO = 30.44;
const CAT_NAME = Object.fromEntries(CATS.map(c => [c.key, c.name]));
const P_NAME = ['희박', '낮음', '보통', '높음', '매우 높음'];
const I_NAME = ['경미', '작음', '보통', '큼', '심각'];
const pc = (v, d = 0) => fmt(v * 100, d) + '%';
const eok = (manwon, d = 1) => fmt(manwon / 1e4, d) + '억';
const catTok = (k) => `var(${RISK_CATS[k].tok})`;
// 보기 좋은 눈금
function ticks(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  const st = (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p, out = [];
  for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(6));
  return out;
}

export function mount(root) {
  let R = pipeline(), K = R.risk();
  const ui = { cat: 'all', sel: null, prev: null, res: null };
  const $ = (id) => root.querySelector('#' + id);
  let alive = true;

  root.innerHTML = head({
    n: 7, key: 'RISK', title: '무엇이 어긋날 수 있나', status: 'MONTE CARLO · 2,000 RUNS',
    dim: `${escH(R.site.name)} · ${R.u.name} · 위험 ${K.reg.length}종 감지`,
    desc: 'BIM 물량(굴착량·층수·부재), 4D 공정(장마·동절기에 걸린 공종), 현장 조건(지반·지하수·인접 건물·지역), 고른 공법과 남은 공정 간섭을 읽어 위험마다 발생 가능성(P)과 영향(I)을 매깁니다. 위험이 실제로 일어나는 경우를 2,000번 뽑아 공기와 공사비의 확률 분포를 만들고, AI는 위험을 가장 많이 줄이는 공법 교체안을 찾아 제안합니다.',
    stats: [['P80 공기', '<b id="k-p80">—</b>', '<span id="k-p80s"></span>'], ['P80 공사비', '<b id="k-c80">—</b>', '<span id="k-c80s"></span>'], ['계획 공기 내 준공 확률', '<b id="k-on">—</b>', '<span id="k-ons"></span>']],
    actions: `<a class="btn ghost" href="#/budget">← 06 5D 예산</a><button type="button" class="btn ghost" id="rk-csv">위험 등록부 CSV</button><a class="btn acc" href="#lv-sec">AI 대응안 보기 <span class="ar">→</span></a>`,
  }) + `
  <div class="wrap">
    <section class="sx-sec" aria-label="위험 등록부와 매트릭스">
      ${sub('07.1', '위험 매트릭스 · 등록부', '점 = 고른 공법을 반영한 잔여 위험, 흐린 선 끝 = 전통 공법일 때의 고유 위험. 점이나 행을 누르면 근거가 열립니다.')}
      <div class="rk-top">
        <div class="panel pad rk-mx"><div id="mx"></div><div class="rk-lg" id="mx-lg"></div></div>
        <div class="panel pad rk-det" id="det" aria-live="polite"></div>
      </div>
      <div class="rk-reg">
        <div id="rk-tabs"></div>
        <div class="tbl-wrap"><table class="rk-t" id="reg"></table></div>
      </div>
    </section>
    <section class="sx-sec" aria-label="몬테카를로 시뮬레이션">
      ${sub('07.2', '공기 · 공사비 확률', '곡선 = 그 값 안에 끝날 확률. 빨강 = 고른 공법(잔여 위험), 회색 점선 = 전통 공법(고유 위험). 아래 막대 = 2,000회 결과의 분포.')}
      <div class="rk-mc">
        <div class="panel pad"><div class="sec-h"><h2>공기</h2><span class="hint">개월</span></div><div class="rk-cdf" id="cdf-d"></div></div>
        <div class="panel pad"><div class="sec-h"><h2>공사비</h2><span class="hint">억 원</span></div><div class="rk-cdf" id="cdf-c"></div></div>
        <div class="panel pad rk-pt" id="pt"></div>
      </div>
    </section>
    <section class="sx-sec" aria-label="위험별 기여도">
      ${sub('07.3', '위험별 기여도', '시뮬레이션 1회당 평균으로 각 위험이 늘린 공기(왼쪽)와 공사비(오른쪽). 흐린 막대 = 전통 공법일 때.')}
      <div class="panel pad" id="tor"></div>
    </section>
    <section class="sx-sec" aria-label="월별 위험 노출">
      ${sub('07.4', '월별 위험 노출', '그 달에 진행 중인 공종에 걸린 위험 점수(P×I)의 합. 위험이 몰리는 달을 미리 보고 인력·점검을 집중합니다.')}
      <div class="rk-tl"><div class="panel pad"><div id="tl"></div><div class="rk-lg" id="tl-lg"></div></div><div class="panel pad" id="peak"></div></div>
    </section>
    <section class="sx-sec" id="lv-sec" aria-label="AI 대응안">
      ${sub('07.5', 'AI 대응안', '상위 위험마다 아직 고르지 않은 공법·관리 기술로 바꿔 보고, 잔여 위험 점수가 가장 많이 주는 안부터 보여 줍니다. 적용하면 04 공법에 반영되고 공정·예산·위험이 다시 계산됩니다.')}
      <div id="lv-res"></div>
      <div class="lv-grid" id="lv"></div>
    </section>
  </div>`;

  // ---------- 머리 숫자 ----------
  function renderHead() {
    const mc = K.mc, mc0 = K.mc0, S = R.S, E = R.E;
    $('k-p80').textContent = fmt(mc.months.p80, 1) + '개월';
    $('k-p80s').textContent = `계획 ${S.months} · 전통 공법 ${fmt(mc0.months.p80, 1)}`;
    $('k-c80').textContent = won(mc.cost.p80);
    $('k-c80s').textContent = `계획 ${won(E.total)} · +${pc(mc.cost.p80 / E.total - 1, 1)}`;
    $('k-on').textContent = pc(mc.pOnTime);
    $('k-ons').textContent = `전통 공법 ${pc(mc0.pOnTime)} · 예산 내 ${pc(mc.pOnBudget)}`;
  }

  // ---------- P×I 매트릭스 ----------
  const rank = () => Object.fromEntries(K.reg.map((r, i) => [r.id, i + 1]));
  function renderMatrix() {
    const el = $('mx'), w = Math.min(560, el.clientWidth || 480);
    const pad = { l: 58, r: 10, t: 10, b: 46 }, cw = (w - pad.l - pad.r) / 5, H = pad.t + cw * 5 + pad.b;
    const X = (p) => pad.l + (p - 0.5) * cw, Y = (i) => pad.t + (5.5 - i) * cw;
    let s = `<svg class="rk-mxs" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="발생 가능성과 영향 매트릭스">`;
    for (let p = 1; p <= 5; p++) for (let i = 1; i <= 5; i++) s += `<rect class="rk-cell ${LEVEL(p * i).k}" x="${pad.l + (p - 1) * cw + 1}" y="${pad.t + (5 - i) * cw + 1}" width="${cw - 2}" height="${cw - 2}" rx="3"/>`;
    for (let k = 1; k <= 5; k++) {
      s += `<text class="ax" x="${X(k)}" y="${pad.t + cw * 5 + 15}" text-anchor="middle">${k} ${P_NAME[k - 1]}</text>`;
      s += `<text class="ax" x="${pad.l - 6}" y="${Y(k) + 3}" text-anchor="end">${I_NAME[k - 1]} ${k}</text>`;
    }
    s += `<text class="ax t" x="${pad.l + cw * 2.5}" y="${H - 6}" text-anchor="middle">발생 가능성 P →</text>`;
    s += `<text class="ax t" transform="translate(12 ${pad.t + cw * 2.5}) rotate(-90)" text-anchor="middle">영향 I →</text>`;
    // 점 위치: 실제 (P, I) 자리에서 겹치지 않게 조금씩 민다
    const rk = rank();
    const pts = K.reg.map(r => ({ r, x: X(r.p), y: Y(r.i), x0: X(r.p0), y0: Y(r.i0) }));
    const rad = Math.max(8, Math.min(11, cw / 7));
    for (let it = 0; it < 40; it++) {
      for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
        const A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 0.01, need = rad * 2 + 2;
        if (d < need) { const m = (need - d) / 2, ux = dx / d || 1, uy = dy / d; A.x -= ux * m; A.y -= uy * m; B.x += ux * m; B.y += uy * m; }
      }
      pts.forEach(P => { P.x = Math.max(pad.l + rad, Math.min(pad.l + cw * 5 - rad, P.x)); P.y = Math.max(pad.t + rad, Math.min(pad.t + cw * 5 - rad, P.y)); });
    }
    const vis = (r) => ui.cat === 'all' || r.cat === ui.cat;
    pts.forEach(P => { if (Math.hypot(P.x0 - P.x, P.y0 - P.y) > 3) s += `<line class="mx-arr${vis(P.r) ? '' : ' dim'}" x1="${P.x0.toFixed(1)}" y1="${P.y0.toFixed(1)}" x2="${P.x.toFixed(1)}" y2="${P.y.toFixed(1)}"/><circle class="mx-o${vis(P.r) ? '' : ' dim'}" cx="${P.x0.toFixed(1)}" cy="${P.y0.toFixed(1)}" r="2.6"/>`; });
    pts.forEach(P => {
      const r = P.r, on = ui.sel === r.id;
      s += `<g class="mx-p${on ? ' on' : ''}${vis(r) ? '' : ' dim'}" data-rid="${r.id}" tabindex="0" role="button" aria-label="${escH(r.name)} 잔여 ${r.s.toFixed(1)}" data-tip="<b>${r.id} ${escH(r.name)}</b><br>잔여 P${r.p.toFixed(1)} × I${r.i.toFixed(1)} = ${r.s.toFixed(1)}<br>고유 ${r.s0.toFixed(1)} → 잔여 ${r.s.toFixed(1)}">
        <circle cx="${P.x.toFixed(1)}" cy="${P.y.toFixed(1)}" r="${rad}" style="fill:${catTok(r.cat)}"/><text x="${P.x.toFixed(1)}" y="${(P.y + 3.4).toFixed(1)}" text-anchor="middle">${rk[r.id]}</text></g>`;
    });
    el.innerHTML = s + '</svg>';
    $('mx-lg').innerHTML = RISK_CAT_KEYS.map(k => `<span><i style="background:${catTok(k)}"></i>${RISK_CATS[k].name}</span>`).join('') +
      ['low', 'mid', 'high', 'crit'].map((k, j) => `<span class="lvk"><i class="rk-k ${k}"></i>${['낮음 <5', '보통 5–10', '높음 10–15', '매우 높음 15+'][j]}</span>`).join('');
  }

  // ---------- 선택한 위험의 근거 ----------
  function monthsOf(r) {
    const on = new Set();
    R.S.acts.filter(a => r.when.includes(a.cat)).forEach(a => { for (let m = Math.floor(a.start / MO); m <= Math.floor(a.end / MO); m++) on.add(m); });
    const arr = [...on].sort((a, b) => a - b);
    return arr.length ? [arr[0], arr[arr.length - 1]] : null;
  }
  function renderDetail() {
    const r = K.reg.find(x => x.id === ui.sel) || K.reg[0];
    if (!r) { $('det').innerHTML = '<p class="note">감지된 위험이 없습니다.</p>'; return; }
    const lv = LEVEL(r.s), lv0 = LEVEL(r.s0), mm = monthsOf(r), direct = R.E.direct;
    const myLv = LV.filter(g => g.risks.some(x => x.risk === r.id));
    const cut = r.s0 > 0 ? 1 - r.s / r.s0 : 0;
    $('det').innerHTML = `<div class="in-h"><span class="sx-code-s">${r.id} · ${r.en}</span>${dot(lv.name, lv.k === 'crit' || lv.k === 'high' ? 'acc' : 'mute')}</div>
      <h3 class="in-t">${escH(r.name)}</h3>
      <p class="rk-cat"><i style="background:${catTok(r.cat)}"></i>${RISK_CATS[r.cat].name} · 시기: ${r.when.map(c => CAT_NAME[c] || c).join(' · ')}${mm ? ` (${ym(dateAt(R.S.t0, mm[0] * MO))}–${ym(dateAt(R.S.t0, mm[1] * MO))})` : ''}</p>
      <dl class="rk-kv">
        <div><dt>발생 확률</dt><dd>${pc(r.prob)}<small>전통 ${pc(r.prob0)}</small></dd></div>
        <div><dt>영향 I</dt><dd>${r.i.toFixed(1)}<small>전통 ${r.i0.toFixed(1)}</small></dd></div>
        <div><dt>위험 점수</dt><dd>${r.s.toFixed(1)}<small>${lv0.name} ${r.s0.toFixed(1)} → ${cut > 0.005 ? '−' + pc(cut) : '변화 없음'}</small></dd></div>
      </dl>
      <div class="rk-blk"><span class="label-sm">근거 · BIM·공정·현장 데이터</span><ul>${r.why.map(w => `<li>${escH(w)}</li>`).join('')}</ul></div>
      <div class="rk-blk"><span class="label-sm">반영된 대응 · 고른 공법</span>${r.mit.length ? `<ul class="ok">${r.mit.map(w => `<li>${escH(w)}</li>`).join('')}</ul>` : '<p class="note">아직 이 위험을 줄이는 공법·기술을 고르지 않았습니다.</p>'}</div>
      <div class="rk-blk"><span class="label-sm">발생하면 · 삼각분포 (최소 / 최빈 / 최대)</span>
        <div class="rk-tri"><span>지연</span><b>${r.days.map(v => fmt(v, 0)).join(' / ')}일</b><span>주공정 영향 ${pc(r.crit)}</span></div>
        <div class="rk-tri"><span>추가 비용</span><b>${r.cost.map(v => fmt(v, 1)).join(' / ')}%</b><span>직접비 기준 ${eok(direct * r.cost[1] / 100)}</span></div></div>
      ${myLv.length ? `<div class="rk-blk"><span class="label-sm">AI 대응안</span>${myLv.map(g => { const x = g.risks.find(y => y.risk === r.id); return `<button type="button" class="rk-lvb" data-lever="${LV.indexOf(g)}"><span>${escH(WP_BY_ID[g.wp].name)} → <b>${escH(g.label)}</b></span><span class="num">${x.from.toFixed(1)} → ${x.to.toFixed(1)}</span><span class="ar">적용 →</span></button>`; }).join('')}</div>` : ''}`;
  }

  // ---------- 등록부 표 ----------
  function renderRegister() {
    const n = (k) => K.reg.filter(r => r.cat === k).length;
    $('rk-tabs').innerHTML = tabs([{ k: 'all', name: '전체', n: K.reg.length }, ...RISK_CAT_KEYS.filter(n).map(k => ({ k, name: RISK_CATS[k].name, n: n(k) }))], ui.cat, 'data-cat', '위험 분류');
    const rk = rank(), list = K.reg.filter(r => ui.cat === 'all' || r.cat === ui.cat);
    const bar = (v, cls) => `<span class="rk-sb ${cls}"><i style="width:${(v / 25 * 100).toFixed(1)}%"></i></span>`;
    $('reg').innerHTML = `<thead><tr><th>#</th><th>ID</th><th>위험</th><th>분류</th><th>시기</th><th class="r">발생 확률</th><th>고유 → 잔여 (P×I)</th><th>등급</th><th>대응</th></tr></thead>
      <tbody>${list.map(r => { const lv = LEVEL(r.s); return `<tr data-rid="${r.id}" class="${ui.sel === r.id ? 'on' : ''}" tabindex="0">
        <td class="num">${String(rk[r.id]).padStart(2, '0')}</td><td class="mono">${r.id}</td><td><b>${escH(r.name)}</b><small>${r.en}</small></td>
        <td><span class="rk-cat"><i style="background:${catTok(r.cat)}"></i>${RISK_CATS[r.cat].name}</span></td>
        <td class="rk-when">${r.when.map(c => CAT_NAME[c] || c).join(' · ')}</td>
        <td class="r num">${pc(r.prob)}</td>
        <td class="rk-sc"><span class="num">${r.s0.toFixed(1)} → <b>${r.s.toFixed(1)}</b></span>${bar(r.s0, 'g')}${bar(r.s, 'a')}</td>
        <td><span class="lv-chip ${lv.k}">${lv.name}</span></td>
        <td class="rk-mit">${r.mit.length ? escH(r.mit.slice(0, 2).join(' · ')) + (r.mit.length > 2 ? ` 외 ${r.mit.length - 2}` : '') : '<span class="note">—</span>'}</td></tr>`; }).join('')}</tbody>`;
  }

  // ---------- 확률 곡선 (CDF) + 분포 ----------
  function cdfChart(el, a, b, plan, f, unitFmt, key) {
    const w = Math.max(280, el.clientWidth || 420), H1 = 200, H2 = 44, pad = { l: 40, r: 14, t: 12, b: 26 }, H = pad.t + H1 + 10 + H2 + pad.b;
    const n = a.length, lo = Math.min(f(a[0]), f(b[0]), plan), hi = Math.max(f(a[Math.floor(n * 0.997)]), f(b[Math.floor(n * 0.997)]), plan);
    const span = hi - lo || 1, x0 = lo - span * 0.03, x1 = hi + span * 0.03;
    const X = (v) => pad.l + (v - x0) / (x1 - x0) * (w - pad.l - pad.r), Y = (p) => pad.t + (1 - p) * H1;
    let s = `<svg viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="${key === 'd' ? '공기' : '공사비'} 누적 확률">`;
    [0, 0.25, 0.5, 0.8, 1].forEach(p => { s += `<line class="gr${p === 0.8 ? ' p80' : ''}" x1="${pad.l}" x2="${w - pad.r}" y1="${Y(p)}" y2="${Y(p)}"/><text class="ax" x="${pad.l - 6}" y="${Y(p) + 3}" text-anchor="end">${p * 100}%</text>`; });
    const tk = ticks(x0, x1, Math.max(3, Math.floor(w / 90)));
    tk.forEach(v => { s += `<text class="ax" x="${X(v)}" y="${H - 8}" text-anchor="middle">${unitFmt(v)}</text>`; });
    const line = (arr) => { let d = ''; for (let q = 0; q <= 160; q++) { const i = Math.min(n - 1, Math.floor(q / 160 * (n - 1))); d += (q ? 'L' : 'M') + X(Math.min(x1, f(arr[i]))).toFixed(1) + ' ' + Y((i + 1) / n).toFixed(1); } return d; };
    s += `<line class="plan" x1="${X(plan)}" x2="${X(plan)}" y1="${pad.t}" y2="${pad.t + H1 + 10 + H2}"/><text class="plan-t" x="${X(plan) + 4}" y="${pad.t + 10}">계획 ${unitFmt(plan)}</text>`;
    s += `<path class="cdf raw" d="${line(b)}"/><path class="cdf res" d="${line(a)}"/>`;
    [[0.5, 'P50'], [0.8, 'P80']].forEach(([p, lb]) => { const v = f(a[Math.floor(p * n)]); s += `<circle class="mk" cx="${X(v)}" cy="${Y(p)}" r="4.5"/><text class="mk-t" x="${X(v) + 7}" y="${Y(p) + 13}">${lb} ${unitFmt(v)}</text>`; });
    // 분포 막대 (잔여)
    const B = Math.max(16, Math.min(40, Math.floor((w - pad.l - pad.r) / 9))), bw = (x1 - x0) / B, h = new Array(B).fill(0), h0 = new Array(B).fill(0);
    a.forEach(v => { const k = Math.floor((f(v) - x0) / bw); if (k >= 0 && k < B) h[k]++; });
    b.forEach(v => { const k = Math.floor((f(v) - x0) / bw); if (k >= 0 && k < B) h0[k]++; });
    const mx = Math.max(...h, ...h0) || 1, yb = pad.t + H1 + 10 + H2, pxw = (w - pad.l - pad.r) / B;
    let st = '';
    h0.forEach((c, k) => { const y = yb - c / mx * H2; st += (k ? 'L' : 'M') + (pad.l + k * pxw).toFixed(1) + ' ' + y.toFixed(1) + 'H' + (pad.l + (k + 1) * pxw).toFixed(1); });
    h.forEach((c, k) => { if (c) s += `<rect class="hb" x="${(pad.l + k * pxw + 1).toFixed(1)}" y="${(yb - c / mx * H2).toFixed(1)}" width="${Math.max(1, pxw - 2).toFixed(1)}" height="${(c / mx * H2).toFixed(1)}" rx="1.5"/>`; });
    s += `<path class="hb0" d="${st}"/><line class="base" x1="${pad.l}" x2="${w - pad.r}" y1="${yb}" y2="${yb}"/><text class="ax" x="${pad.l - 6}" y="${yb - H2 / 2 + 3}" text-anchor="end">분포</text>`;
    s += `<line class="xh" id="xh-${key}" x1="0" x2="0" y1="${pad.t}" y2="${yb}" visibility="hidden"/><rect class="hit" x="${pad.l}" y="${pad.t}" width="${w - pad.l - pad.r}" height="${yb - pad.t}"/>`;
    el.innerHTML = s + '</svg>';
    el.dataset.k = key;
    el._inv = (px) => x0 + (px - pad.l) / (w - pad.l - pad.r) * (x1 - x0);
    el._X = X;
  }
  function bindCdf(el, getA, getB, f, unitFmt, label) {
    el.addEventListener('pointermove', (e) => {
      if (!el._inv) return;
      const r = el.querySelector('svg').getBoundingClientRect(), v = el._inv(e.clientX - r.left), xh = el.querySelector('line.xh');
      const a = getA(), b = getB(); // v는 화면 단위(개월·억)
      const inv = (arr) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (f(arr[m]) <= v) lo = m + 1; else hi = m; } return lo / arr.length; };
      xh.setAttribute('x1', el._X(v)); xh.setAttribute('x2', el._X(v)); xh.setAttribute('visibility', 'visible');
      tip(`<b>${label} ${unitFmt(v)} 이내</b><br>고른 공법 ${pc(inv(a))} · 전통 공법 ${pc(inv(b))}`, e.clientX, e.clientY);
    });
    el.addEventListener('pointerleave', () => { tip(null); const xh = el.querySelector('line.xh'); if (xh) xh.setAttribute('visibility', 'hidden'); });
  }
  const mF = (d) => d / MO, cF = (c) => c / 1e4;
  const mFmt = (v) => fmt(v, 1) + '개월', cFmt = (v) => (v >= 1e4 ? fmt(v / 1e4, 2) + '조' : fmt(v, 0) + '억');
  function renderMC() {
    cdfChart($('cdf-d'), K.mc.sortedDays, K.mc0.sortedDays, R.S.end / MO, mF, mFmt, 'd');
    cdfChart($('cdf-c'), K.mc.sortedCost, K.mc0.sortedCost, R.E.total / 1e4, cF, cFmt, 'c');
    const mc = K.mc, mc0 = K.mc0, E = R.E;
    const buf = Math.max(0, mc.days.p80 - R.S.end), cont = Math.max(0, mc.cost.p80 - E.total);
    const row = (k, a, b) => `<tr><th>${k}</th><td class="a">${a}</td><td class="b">${b}</td></tr>`;
    $('pt').innerHTML = `<div class="sec-h"><h2>확률 표</h2><span class="hint">고른 공법 / 전통 공법</span></div>
      <table class="fx-t rk-pt-t"><tbody>
      ${['p10', 'p50', 'p80', 'p90'].map(p => row(p.toUpperCase() + ' 공기', fmt(mc.months[p], 1) + '개월', fmt(mc0.months[p], 1))).join('')}
      ${['p50', 'p80', 'p90'].map(p => row(p.toUpperCase() + ' 공사비', won(mc.cost[p]), won(mc0.cost[p]))).join('')}
      ${row('계획 공기 내 준공', pc(mc.pOnTime), pc(mc0.pOnTime))}${row('예산 내 준공', pc(mc.pOnBudget), pc(mc0.pOnBudget))}
      </tbody></table>
      <div class="rk-rec"><span class="label-sm">AI 권장 · P80 기준</span>
        <p>공정표에 <b>${fmt(Math.ceil(buf / 7), 0)}주</b>(${fmt(buf, 0)}일) 예비 기간을, 예산에 <b>${won(cont)}</b>(${pc(cont / E.total, 1)}) 예비비를 두면 10번 중 8번은 그 안에 끝납니다.</p>
        <p class="note">전통 공법이면 예비 기간 ${fmt(Math.max(0, mc0.days.p80 - R.S.end) / 7, 0)}주 · 예비비 ${won(Math.max(0, mc0.cost.p80 - E.total))}이 필요합니다.</p></div>`;
  }

  // ---------- 토네이도 ----------
  function renderTornado() {
    const c0 = Object.fromEntries(K.mc0.contrib.map(x => [x.id, x]));
    const list = K.mc.contrib.filter(x => x.d > 0.05 || x.c > 1).slice(0, 12);
    const all = [...list.map(x => [x, c0[x.id]])];
    const md = Math.max(1, ...all.map(([a, b]) => Math.max(a.d, b ? b.d : 0))), mcst = Math.max(1, ...all.map(([a, b]) => Math.max(a.c, b ? b.c : 0)));
    const byId = Object.fromEntries(K.reg.map(r => [r.id, r]));
    $('tor').innerHTML = `<div class="tor"><div class="tor-h"><span>예상 지연 · 일</span><span></span><span>예상 추가 비용</span></div>
      ${list.map(x => { const r = byId[x.id], g = c0[x.id] || { d: 0, c: 0 }; return `<div class="tor-r${ui.sel === x.id ? ' on' : ''}" data-rid="${x.id}" data-tip="<b>${x.id} ${escH(r.name)}</b><br>발생 ${pc(x.hit)} · 평균 지연 ${fmt(x.d, 1)}일 · 비용 ${eok(x.c)}<br>전통 공법: 발생 ${pc(g.hit || 0)} · ${fmt(g.d, 1)}일 · ${eok(g.c)}">
        <span class="tv l num">${fmt(x.d, 1)}</span>
        <span class="tb l"><i class="g" style="width:${(g.d / md * 100).toFixed(1)}%"></i><i style="width:${(x.d / md * 100).toFixed(1)}%;background:${catTok(r.cat)}"></i></span>
        <span class="tn"><b class="mono">${x.id}</b>${escH(r.name)}</span>
        <span class="tb r"><i class="g" style="width:${(g.c / mcst * 100).toFixed(1)}%"></i><i style="width:${(x.c / mcst * 100).toFixed(1)}%;background:${catTok(r.cat)}"></i></span>
        <span class="tv r num">${eok(x.c)}</span></div>`; }).join('')}</div>`;
  }

  // ---------- 월별 노출 ----------
  function renderTimeline() {
    const el = $('tl'), w = Math.max(300, el.clientWidth || 700), H1 = 190, pad = { l: 74, r: 8, t: 22, b: 22 };
    const tl = K.tl, NM = tl.NM, mx = Math.max(1, ...tl.total);
    const cw = (w - pad.l - pad.r) / NM, X = (m) => pad.l + m * cw, Y = (v) => pad.t + H1 - v / mx * H1;
    // 공정 띠 (4묶음)
    const bands = [['지하', ['survey', 'improve', 'prep', 'wall', 'earth', 'found']], ['골조', ['base', 'struct']], ['외장·설비', ['skin', 'mep']], ['마감·시운전', ['fin', 'comm', 'land']]];
    const BH = 9, by0 = pad.t + H1 + 12, H = by0 + bands.length * (BH + 4) + pad.b;
    let s = `<svg viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="월별 위험 노출">`;
    ticks(0, mx, 4).forEach(v => { s += `<line class="gr" x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${pad.l - 6}" y="${Y(v) + 3}" text-anchor="end">${fmt(v, 0)}</text>`; });
    for (let m = 0; m < NM; m++) {
      let acc = 0; const parts = [];
      tl.rows.forEach(row => { const v = row.v[m]; if (v > 0) { s += `<rect class="tl-b" x="${(X(m) + 0.5).toFixed(1)}" y="${Y(acc + v).toFixed(1)}" width="${Math.max(1, cw - 1).toFixed(1)}" height="${(Y(acc) - Y(acc + v)).toFixed(1)}" style="fill:${catTok(row.k)}"/>`; acc += v; parts.push(`${RISK_CATS[row.k].name} ${fmt(v, 0)}`); } });
      s += `<rect class="hit" data-m="${m}" data-tip="<b>${ym(dateAt(R.S.t0, m * MO))} · ${m + 1}개월 차</b><br>위험 노출 ${fmt(acc, 0)}${parts.length ? '<br>' + parts.join(' · ') : ''}" x="${X(m)}" y="${pad.t}" width="${cw}" height="${H1 + 12 + bands.length * (BH + 4)}"/>`;
    }
    const pk = tl.peak;
    s += `<line class="pk" x1="${X(pk) + cw / 2}" x2="${X(pk) + cw / 2}" y1="${pad.t - 14}" y2="${Y(tl.total[pk])}"/><text class="pk-t" x="${Math.min(w - 90, X(pk) + cw / 2 + 4)}" y="${pad.t - 8}">정점 ${ym(dateAt(R.S.t0, pk * MO))}</text>`;
    bands.forEach(([nm, cats], j) => {
      const y = by0 + j * (BH + 4);
      s += `<text class="ax" x="${pad.l - 6}" y="${y + BH - 1}" text-anchor="end">${nm}</text>`;
      const acts = R.S.acts.filter(a => cats.includes(a.cat));
      if (acts.length) { const a0 = Math.min(...acts.map(a => a.start)), a1 = Math.max(...acts.map(a => a.end)); s += `<rect class="tl-ph" x="${X(a0 / MO).toFixed(1)}" y="${y}" width="${Math.max(2, X(a1 / MO) - X(a0 / MO)).toFixed(1)}" height="${BH}" rx="2"/>`; }
    });
    const ny = Math.ceil(NM / 12);
    for (let yv = 0; yv <= ny; yv++) { const m = yv * 12; if (m <= NM) s += `<text class="ax" x="${X(m)}" y="${H - 6}" text-anchor="${yv ? 'middle' : 'start'}">${yv ? yv + '년' : '착공'}</text>`; }
    el.innerHTML = s + '</svg>';
    $('tl-lg').innerHTML = RISK_CAT_KEYS.filter(k => tl.rows.find(r => r.k === k).v.some(v => v > 0)).map(k => `<span><i style="background:${catTok(k)}"></i>${RISK_CATS[k].name}</span>`).join('');
    // 정점에서 진행 중인 공종과 위험
    const onCats = new Set(R.S.acts.filter(a => a.start / MO <= pk + 1 && a.end / MO >= pk).map(a => a.cat));
    const act = K.reg.filter(r => r.when.some(c => onCats.has(c))).slice(0, 5);
    const first = tl.total.findIndex(v => v >= mx * 0.7), last = tl.total.length - 1 - [...tl.total].reverse().findIndex(v => v >= mx * 0.7);
    $('peak').innerHTML = `<div class="sec-h"><h2>위험 정점</h2>${dot(ym(dateAt(R.S.t0, pk * MO)), 'acc')}</div>
      <p class="rk-pk"><b>${pk + 1}개월 차</b>에 위험 노출이 가장 큽니다 (P×I 합 ${fmt(tl.total[pk], 0)}). 정점의 70% 이상인 기간은 <b>${ym(dateAt(R.S.t0, first * MO))}–${ym(dateAt(R.S.t0, last * MO))}</b>입니다.</p>
      <span class="label-sm">이때 진행 중인 공종</span><p class="rk-on">${[...onCats].map(c => `<span>${CAT_NAME[c] || c}</span>`).join('')}</p>
      <span class="label-sm">집중 관리할 위험</span><ol class="rk-pkl">${act.map(r => `<li data-rid="${r.id}"><span class="mono">${r.id}</span>${escH(r.name)}<b class="num">${r.s.toFixed(1)}</b></li>`).join('')}</ol>
      <p class="note">AI 공정 관리: 정점 2주 전부터 안전 점검 주기를 줄이고, 위 위험의 계측·영상 감시를 우선 배치합니다.</p>`;
  }

  // ---------- AI 대응안 ----------
  let LV = [];
  function computeLevers() {
    LV = levers(K.reg, K.ctx, R.ms.picks || {}, (np) => resolveMethods(R.cond, R.d, np, R.prio), 8);
  }
  function renderLevers() {
    const byId = Object.fromEntries(K.reg.map(r => [r.id, r]));
    $('lv').innerHTML = LV.length ? LV.map((g, j) => {
      const wp = WP_BY_ID[g.wp], cur = g.wp === 'qa' ? null : (R.M.list.find(x => x.wp.id === g.wp) || {}).chosen;
      const curName = cur ? (wp.opts.find(o => o.id === cur) || {}).name : null;
      return `<article class="lv-card">
        <div class="lv-h"><span class="sx-code-s">LEVER ${String(j + 1).padStart(2, '0')} · ${wp.code}</span><span class="lv-gain num">−${g.gain.toFixed(1)}<small> P×I</small></span></div>
        <h3>${escH(wp.name)}</h3>
        <p class="lv-sw">${curName ? `<s>${escH(curName)}</s> → ` : '추가 → '}<b>${escH(g.label)}</b></p>
        <ul class="lv-rk">${g.risks.map(x => `<li data-rid="${x.risk}"><span class="mono">${x.risk}</span>${escH((byId[x.risk] || {}).name || x.name)}<span class="num">${x.from.toFixed(1)} → <b>${x.to.toFixed(1)}</b></span></li>`).join('')}</ul>
        <button type="button" class="btn acc sm" data-lever="${j}">적용 <span class="ar">→</span></button>
      </article>`;
    }).join('') : `<p class="note">상위 위험을 더 줄일 수 있는 공법 교체안이 없습니다. 지금 고른 공법이 위험 면에서 이미 가장 유리합니다.</p>`;
    const p = ui.prev;
    $('lv-res').innerHTML = p ? `<div class="panel pad lv-res"><span class="label-sm">적용함 · ${escH(p.label)}</span>
      <p>P80 공기 <b>${fmt(p.p80, 1)} → ${fmt(K.mc.months.p80, 1)}개월</b> · 계획 공기 내 준공 확률 <b>${pc(p.on)} → ${pc(K.mc.pOnTime)}</b> · P80 공사비 <b>${won(p.c80)} → ${won(K.mc.cost.p80)}</b></p>
      <p class="note">공법이 바뀌면 공정도 다시 짜이므로 이전 공정 최적화는 지웠습니다. 05 4D·간섭에서 다시 돌릴 수 있습니다.</p>
      <button type="button" class="btn ghost sm" id="lv-undo">되돌리기</button></div>` : '';
  }
  function applyLever(g) {
    const picks = { ...(R.ms.picks || {}) };
    if (g.wp === 'qa') picks.qa = [...new Set([...(Array.isArray(picks.qa) ? picks.qa : R.fx.qa || []), g.opt])];
    else picks[g.wp] = g.opt;
    ui.prev = { picks: R.ms.picks || {}, opt: optState(), p80: K.mc.months.p80, c80: K.mc.cost.p80, on: K.mc.pOnTime, label: `${WP_BY_ID[g.wp].name} → ${g.label}` };
    setMethodState({ picks }); setOptState(null);
    refresh();
    $('lv-res').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function undo() {
    if (!ui.prev) return;
    setMethodState({ picks: ui.prev.picks }); setOptState(ui.prev.opt || null);
    ui.prev = null; refresh();
  }

  function renderCharts() { renderMatrix(); renderMC(); renderTimeline(); }
  function renderAll() { computeLevers(); renderHead(); renderMatrix(); renderDetail(); renderRegister(); renderMC(); renderTornado(); renderTimeline(); renderLevers(); }
  function refresh() { R = pipeline(); K = R.risk(); if (ui.sel && !K.reg.find(r => r.id === ui.sel)) ui.sel = null; renderAll(); }
  function select(id) { ui.sel = id; renderMatrix(); renderDetail(); renderRegister(); renderTornado(); }

  // ---------- 이벤트 ----------
  root.addEventListener('click', (e) => {
    const lb = e.target.closest('[data-lever]'); if (lb) { const g = LV[+lb.dataset.lever]; if (g) applyLever(g); return; }
    if (e.target.id === 'lv-undo') { undo(); return; }
    if (e.target.id === 'rk-csv') {
      const rk = rank();
      download(`risk-register-${R.use}-${R.site.id}.csv`, csv([['순위', 'ID', '위험', '분류', '시기', '고유 P', '고유 I', '고유 점수', '잔여 P', '잔여 I', '잔여 점수', '발생 확률', '지연 최소', '지연 최빈', '지연 최대', '비용 % 최소', '비용 % 최빈', '비용 % 최대', '근거', '대응'],
        ...K.reg.map(r => [rk[r.id], r.id, r.name, RISK_CATS[r.cat].name, r.when.map(c => CAT_NAME[c] || c).join('/'), r.p0.toFixed(2), r.i0.toFixed(2), r.s0.toFixed(2), r.p.toFixed(2), r.i.toFixed(2), r.s.toFixed(2), (r.prob * 100).toFixed(1), ...r.days.map(v => v.toFixed(0)), ...r.cost.map(v => v.toFixed(2)), r.why.join(' / '), r.mit.join(' / ')])]), 'text/csv');
      return;
    }
    const tb = e.target.closest('[data-cat]'); if (tb) { ui.cat = tb.dataset.cat; renderRegister(); renderMatrix(); return; }
    const rr = e.target.closest('[data-rid]'); if (rr) { select(rr.dataset.rid); if (!rr.closest('#mx') && !rr.closest('#det')) $('det').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.rid) { e.preventDefault(); select(e.target.dataset.rid); } });
  const tipOn = (el) => { el.addEventListener('pointermove', (e) => { const t = e.target.closest('[data-tip]'); tip(t ? t.dataset.tip : null, e.clientX, e.clientY); }); el.addEventListener('pointerleave', () => tip(null)); };
  tipOn($('mx')); tipOn($('tor')); tipOn($('tl'));
  bindCdf($('cdf-d'), () => K.mc.sortedDays, () => K.mc0.sortedDays, mF, mFmt, '공기');
  bindCdf($('cdf-c'), () => K.mc.sortedCost, () => K.mc0.sortedCost, cF, cFmt, '공사비');

  ui.sel = K.reg[0] ? K.reg[0].id : null;
  renderAll();
  // 폭이 바뀌면 차트를 다시 그린다 (글자가 늘어나지 않게 실제 픽셀 크기로 그림)
  let rq = 0, lastW = root.clientWidth;
  const ro = new ResizeObserver(() => { if (Math.abs(root.clientWidth - lastW) < 4) return; lastW = root.clientWidth; cancelAnimationFrame(rq); rq = requestAnimationFrame(() => { if (alive) renderCharts(); }); });
  ro.observe(root);
  return () => { alive = false; ro.disconnect(); tip(null); };
}
