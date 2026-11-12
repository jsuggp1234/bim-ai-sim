// 1단계: 서울 공동주택 택지 선정 (사업성·입지·추진 안정성 비교, 단순 매스)
import * as THREE from 'three';
import { SITES, GLOBAL_DEFAULTS, GLOBAL_META, SITE_META, PRICE_SOURCES, evaluate, sensitivity, scoreSite } from '../stage1/engine.js';
import { SEOUL } from '../stage1/seoulmap.js';
import { store, massParamsFromStage1 } from '../store.js';
import { DEFAULTS as MASS_DEFAULTS } from '../sim/massing.js';
import { createAtlas, lngLatToWorld, worldPerMeter } from '../ui/atlas.js';
import { onThemeChange } from '../pipeline.js';

export const title = '02 입지 · 서울 공동주택 상세';

const HEAD = `<div class="page-h">
  <div><span class="label-sm">// 02.90 SEC_SEOUL · 서울 공동주택 상세 · <a href="#/site">← 전국 지도</a></span><h1>어디에 지을까<span class="dim">서울 공동주택 후보 택지 8곳</span></h1>
  <p>지도에서 후보지를 살펴보고, 같은 기준으로 비교한 뒤, 한 곳을 골라 프로젝트를 시작합니다. 평가 가중치와 사업 변수를 바꾸면 세대수·사업성·순위가 바로 다시 계산됩니다.</p></div>
  <ol class="flow-mini" aria-label="이 단계에서 할 일"><li><a href="#atlas"><span>a</span>지도에서 보기</a></li><li><a href="#compare"><span>b</span>비교하기</a></li><li><a href="#detail"><span>c</span>검토하기</a></li><li><a href="#start"><span>d</span>프로젝트 시작</a></li></ol>
</div>`;

const BODY = `<section class="atlas" id="atlas" aria-label="후보지 지도">
  <div class="atlas-map" id="map"></div>
  <aside class="atlas-rank" id="rank" aria-label="후보지 순위">
    <div class="sec-h"><h2>후보지 순위</h2><span class="hint" id="wHint">가중치 기준</span></div>
    <ul class="sites" id="sites"></ul>
    <details class="wdet"><summary>평가 가중치 조정</summary>
      <div class="weights" id="weights"></div>
      <div class="bulk">
        <button class="chipbtn" id="allPlan" type="button">모든 후보지 발표안</button>
        <button class="chipbtn" id="allPrivate" type="button">모든 후보지 분양 최대화</button>
      </div>
    </details>
  </aside>
  <div class="atlas-pick" id="pickCard" aria-live="polite"></div>
  <div class="atlas-legend" aria-hidden="true"><span><i class="lg-pin"></i>숫자 = 종합 순위, 원 크기 = 세대수</span><span><i class="lg-foot"></i>점선 = 택지 면적을 원으로 환산</span></div>
</section>

<div class="p-site">
  <section class="sec" id="compare" aria-label="후보지 비교">
    <div class="sec-title"><span class="n">b</span><h2>후보지 비교</h2><span class="hint">같은 가정과 가중치로 계산한 8곳. 행이나 점을 누르면 그 택지를 고릅니다.</span></div>
    <div class="cmp-grid">
      <div class="panel pad"><div class="sec-h"><h2>평가 매트릭스</h2><span class="hint">항목별 0–100점 · 종합은 가중 합</span></div><div class="matrix" id="matrix"></div></div>
      <div class="panel pad"><div class="sec-h"><h2>공급 규모 × 수익률</h2><span class="hint">원 크기 = 택지 면적</span></div><div class="scatter" id="scatter"></div></div>
    </div>
    <details class="panel pad tdet" id="table"><summary><span>수치 비교표</span><span class="hint">세대수 · 용적률 · 사업비 · 이익</span></summary><div class="tw"><table id="cmp"></table></div></details>
  </section>

  <section class="sec" id="detail" aria-label="선택한 택지 검토">
    <div class="sec-title"><span class="n">c</span><h2 id="detTitle">선택한 택지 검토</h2><span class="hint">단순 매스로 본 배치 가능량과 사업성. 변수는 이 택지에만 적용됩니다.</span></div>
    <div class="det-grid">
      <section id="view" class="panel" aria-label="3D 매스">
        <div class="site-head" id="siteHead"></div>
        <div class="stage" id="stage">
          <canvas id="cv" aria-label="선택한 후보지의 3D 매스 모델. 드래그로 회전, 휠로 확대"></canvas>
          <div class="ov tl" id="legend3d">
            <span class="lg"><i style="background:var(--model)"></i>분양</span>
            <span class="lg"><i style="background:var(--rental)"></i>공공임대·장기전세</span>
            <span class="lg"><i style="background:var(--nonres)"></i>업무·상업</span>
          </div>
          <div class="ov tr seg" role="group" aria-label="시점">
            <button type="button" data-view="bird" aria-pressed="true">조감</button>
            <button type="button" data-view="top" aria-pressed="false">평면</button>
            <button type="button" data-view="south" aria-pressed="false">남측 입면</button>
          </div>
          <div class="ov bl" id="warn3d"></div>
        </div>
        <div class="sun">
          <label for="season" class="label-sm">shadow</label>
          <select id="season">
            <option value="-23.44">동지 12.22</option>
            <option value="0">춘분 3.20</option>
            <option value="23.44">하지 6.21</option>
          </select>
          <input id="hour" type="range" min="8" max="16" step="0.25" value="12" aria-label="시각">
          <span class="mono" id="hourOut">12:00</span>
          <span class="muted" id="sunOut"></span>
        </div>
        <div class="stats" id="stats"></div>
        <div class="insight" id="insight"></div>
      </section>

      <section id="vars" class="panel" aria-label="변수와 사업성">
        <div class="pad" style="padding-bottom:12px">
          <div class="sec-h"><h2>시나리오 변수</h2><button class="chipbtn" id="reset" type="button">기본값</button></div>
          <div class="presets" id="presets"></div>
        </div>
        <div class="grp"><span class="label-sm">대지·매스</span><div id="ctlMass"></div></div>
        <div class="grp"><span class="label-sm">가격·비용</span><div id="ctlCost"></div></div>
        <div class="result" id="result"></div>
      </section>
    </div>
    <section id="dossier" class="panel pad" aria-label="쟁점과 근거">
      <div class="sec-h"><h2 id="dosTitle">쟁점과 근거</h2></div>
      <div class="cols2">
        <div><span class="label-sm">쟁점</span><ul class="issues" id="issues"></ul><ul class="srcs" id="srcs"></ul></div>
        <div><span class="label-sm">모델 가정</span>
          <ul class="issues note" id="assume"></ul>
          <ul class="srcs" id="psrcs"></ul>
        </div>
      </div>
    </section>
  </section>

  <section class="sec" id="start" aria-label="프로젝트 시작">
    <div class="sec-title"><span class="n">d</span><h2>프로젝트 시작</h2><span class="hint">고른 택지와 시나리오를 2단계 매스 배치의 시작값으로 넘깁니다.</span></div>
    <div class="launch" id="export">
      <div id="nextCard"></div>
      <details class="jdet"><summary>JSON으로 내보내기</summary>
        <dl class="handoff" id="handoff"></dl>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <button class="btn ghost" id="copy" type="button">JSON 복사</button><span class="toast" id="toast" role="status"></span>
        </div>
        <textarea id="json" readonly aria-label="시나리오 JSON"></textarea>
      </details>
    </div>
  </section>
</div>`;

export function mount(root) {
  root.innerHTML = HEAD + BODY;
  let alive = true;
  const cleanups = [];
  const $ = (id) => root.querySelector('#' + id);
  const fmt = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  // 금액(만원) → 억/조
  const money = (v) => {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e8) return s + fmt(a / 1e8, 2) + '조';
    if (a >= 1e4) return s + fmt(a / 1e4, 0) + '억';
    return s + fmt(a, 0) + '만';
  };
  const sm = (v) => (v >= 0 ? '+' : '') + money(v);
  const pct = (v, d = 1) => (v < 0 ? '−' : '') + fmt(Math.abs(v * 100), d) + '%';

  // ---------- 상태 ----------
  const STORE = 'seoul-site-sim-v1';
  const DEFAULT_W = { feas: 30, loc: 25, risk: 20, scale: 15, speed: 10 };
  const W_META = [
    ['feas', '사업성', 'c-feas', '수익률(이익/총사업비)'],
    ['loc', '입지', 'c-loc', '역세권·업무지구 접근'],
    ['risk', '추진 안정성', 'c-risk', '소송·문화재·갈등이 적을수록 높음'],
    ['scale', '공급 규모', 'c-scale', '세대수(로그)'],
    ['speed', '착공 속도', 'c-speed', '착공 목표 연도'],
  ];
  function freshState() {
    const params = {}, preset = {};
    SITES.forEach(s => { params[s.id] = { ...s.p }; preset[s.id] = s.presets[0].key; });
    return { sel: null, w: { ...DEFAULT_W }, g: { ...GLOBAL_DEFAULTS }, params, preset, season: -23.44, hour: 12 };
  }
  let state = freshState();
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.params) {
        state.w = { ...state.w, ...s.w }; state.g = { ...state.g, ...s.g };
        SITES.forEach(x => { if (s.params[x.id]) state.params[x.id] = { ...state.params[x.id], ...s.params[x.id] }; if (s.preset && x.id in s.preset) state.preset[x.id] = s.preset[x.id]; });
        state.sel = s.sel || null; state.season = s.season ?? state.season; state.hour = s.hour ?? state.hour;
      }
    }
  } catch (e) { /* 저장소를 쓸 수 없으면 기본값 */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} };

  const siteById = Object.fromEntries(SITES.map(s => [s.id, s]));
  let evals = {}, scores = {}, order = [];

  function computeAll() {
    evals = {}; scores = {};
    SITES.forEach(s => { evals[s.id] = evaluate(s, state.params[s.id], state.g); scores[s.id] = scoreSite(s, evals[s.id], state.w); });
    order = SITES.map(s => s.id).sort((a, b) => scores[b].total - scores[a].total);
    if (!state.sel || !siteById[state.sel]) state.sel = order[0];
  }

  // ---------- 지도 위 순위 목록 ----------
  function renderRank() {
    const tw = Object.values(state.w).reduce((a, b) => a + b, 0) || 1;
    $('sites').innerHTML = order.map((id, i) => {
      const s = siteById[id], sc = scores[id], f = evals[id].f;
      const segs = W_META.map(([k, , cls]) => `<i class="${cls}" style="width:${(sc[k] * state.w[k] / tw).toFixed(2)}%"></i>`).join('');
      return `<li><button class="site-btn" type="button" data-id="${id}" aria-pressed="${id === state.sel}">
        <span class="rk">${String(i + 1).padStart(2, '0')}</span><span class="nm">${s.name}</span><span class="sc">${sc.total.toFixed(0)}</span>
        <span class="sub"><span>${s.gu}</span><span>${unitsShort(f.units)}세대</span><span class="${f.roi >= 0 ? '' : 'neg'}">수익률 ${pct(f.roi, 0)}</span></span>
        <span class="bar">${segs}</span></button></li>`;
    }).join('');
    const top = W_META.filter(([k]) => state.w[k] > 0).sort((a, b) => state.w[b[0]] - state.w[a[0]]).slice(0, 2).map(([, nm]) => nm);
    $('wHint').textContent = top.length ? `${top.join('·')} 중심` : '가중치 없음';
    renderMap();
  }
  const unitsShort = (u) => u >= 10000 ? fmt(u / 10000, 1) + '만' : fmt(u);
  function renderWeights() {
    $('weights').innerHTML = `<span class="label-sm">평가 가중치</span>` + W_META.map(([k, nm, cls, tip]) =>
      `<div class="w-row" title="${tip}"><span class="dot ${cls}"></span><label for="w-${k}">${nm}</label>
       <input id="w-${k}" type="range" min="0" max="50" step="1" value="${state.w[k]}" data-w="${k}"><output class="num" id="wo-${k}">${state.w[k]}</output></div>`).join('');
  }

  // ---------- 지도 ----------
  // 자치구 경계(SEOUL: 단순 등장방형 SVG 좌표) → 위경도 → 웹 메르카토르 월드 좌표
  const lng0 = 126.76, lat1 = 37.71, kcos = Math.cos(37.56 * Math.PI / 180), SX = SEOUL.W / ((127.19 - 126.76) * kcos);
  const svgToLL = (x, y) => [x / (kcos * SX) + lng0, lat1 - y / SX];
  const RIVER = [[126.795,37.596],[126.823,37.590],[126.862,37.574],[126.889,37.553],[126.903,37.543],[126.925,37.535],[126.937,37.530],[126.948,37.527],[126.958,37.517],[126.981,37.509],[126.996,37.514],[127.012,37.527],[127.020,37.536],[127.035,37.537],[127.054,37.536],[127.065,37.527],[127.083,37.519],[127.103,37.531],[127.118,37.540],[127.125,37.548],[127.135,37.560],[127.165,37.580],[127.185,37.587]];
  const LABEL_DIR = { yongsan: 'l', campkim: 'tr', smc: 'r', horse: 'tr', seoripul1: 'br', seoripul2: 'l', guryong: 'r', taereung: 'r' };
  const wp = (lng, lat) => lngLatToWorld(lng, lat).map(v => v.toFixed(4)).join(',');
  const GU = SEOUL.gu.map(g => {
    const d = g.d.replace(/([ML])\s*([-\d.]+)[ ,]([-\d.]+)/g, (_, c, x, y) => c + wp(...svgToLL(+x, +y)));
    const [lng, lat] = svgToLL(g.c[0], g.c[1]);
    return { n: g.n, d, lng, lat };
  });
  let atlas = null, hoverId = null;
  function initMap() {
    atlas = createAtlas($('map'), { onSelect: (id) => select(id, true), onHover: (id) => { hoverId = id; } });
    const river = RIVER.map((c, i) => (i ? 'L' : 'M') + wp(c[0], c[1])).join('');
    const rw = 780 * worldPerMeter(37.53);
    atlas.setVector(`<g class="v-gu">${GU.map(g => `<path d="${g.d}"/>`).join('')}</g>
      <path class="v-river" d="${river}" style="stroke-width:${rw.toFixed(5)}"/>
      <g class="v-foot" id="vFoot"></g>`);
    atlas.setLabels(GU.map(g => ({ text: g.n, lng: g.lng, lat: g.lat, cls: 'gu' })));
    cleanups.push(() => atlas.dispose());
    const box = SITES.reduce((b, s) => { const [x, y] = lngLatToWorld(s.lng, s.lat); return [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; }, [Infinity, Infinity, -Infinity, -Infinity]);
    requestAnimationFrame(() => atlas.fit(box, 70, 0));
  }
  function renderMap() {
    if (!atlas) return;
    const umax = Math.max(...order.map(id => evals[id].f.units));
    atlas.setPins(order.map((id, i) => {
      const s = siteById[id], f = evals[id].f, sc = scores[id];
      const r = 9 + Math.sqrt(f.units / umax) * 15;
      return {
        id, lng: s.lng, lat: s.lat, r: Math.round(r), on: id === state.sel, label: `${i + 1}위 ${s.name}, ${fmt(f.units)}세대, ${sc.total.toFixed(0)}점`,
        html: `<i class="dot">${i + 1}</i><span class="tag d-${LABEL_DIR[id] || 'r'}"><b>${s.name}</b><small>${unitsShort(f.units)}세대 · ${sc.total.toFixed(0)}점</small></span>`,
      };
    }));
    const foot = document.getElementById('vFoot');
    if (foot) foot.innerHTML = order.map(id => {
      const s = siteById[id], [x, y] = lngLatToWorld(s.lng, s.lat), r = Math.sqrt(s.area / Math.PI) * worldPerMeter(s.lat);
      return `<circle class="${id === state.sel ? 'on' : ''}" cx="${x.toFixed(5)}" cy="${y.toFixed(5)}" r="${r.toFixed(6)}"/>`;
    }).join('');
  }

  // ---------- 지도 위 선택 카드 ----------
  function renderPick() {
    const s = siteById[state.sel], { f, m } = evals[s.id], sc = scores[s.id], rank = order.indexOf(s.id) + 1;
    const tw = Object.values(state.w).reduce((a, b) => a + b, 0) || 1;
    const crit = W_META.map(([k, nm, cls]) => `<div class="cr"><span class="cn"><i class="${cls}"></i>${nm}</span><span class="ct"><i class="${cls}" style="width:${sc[k].toFixed(1)}%"></i></span><span class="cv">${sc[k].toFixed(0)}</span></div>`).join('');
    $('pickCard').innerHTML = `<div class="pk-h"><span class="pk-rank">${String(rank).padStart(2, '0')}<small>/ ${order.length}</small></span>
        <div><h3>${s.name}</h3><span class="pk-loc">${s.gu} ${s.dong}</span></div><span class="pk-score">${sc.total.toFixed(0)}<small>점</small></span></div>
      <p class="pk-status">${s.status}</p>
      <dl class="pk-kv">
        <div><dt>세대수</dt><dd>${fmt(f.units)}</dd></div>
        <div><dt>사업이익</dt><dd class="${f.profit >= 0 ? '' : 'neg'}">${money(f.profit)}</dd></div>
        <div><dt>수익률</dt><dd class="${f.roi >= 0 ? '' : 'neg'}">${pct(f.roi)}</dd></div>
        <div><dt>착공 목표</dt><dd>${s.start}</dd></div>
        <div><dt>택지 면적</dt><dd>${s.area >= 1e6 ? fmt(s.area / 1e6, 2) + '㎢' : fmt(s.area / 1e4, 1) + 'ha'}</dd></div>
        <div><dt>최고 층수</dt><dd>${m.floors}층</dd></div>
      </dl>
      <div class="pk-crit">${crit}</div>
      <div class="pk-act"><button class="btn" type="button" data-launch>이 택지로 프로젝트 시작 <span class="ar">→</span></button><a class="chipbtn" href="#detail">자세히 검토</a></div>`;
  }

  // ---------- 비교: 평가 매트릭스 ----------
  function renderMatrix() {
    const tw = Object.values(state.w).reduce((a, b) => a + b, 0) || 1;
    const head = `<div class="mx-row mx-head"><span class="mx-n">후보지</span>${W_META.map(([k, nm, cls]) => `<span class="mx-c"><i class="${cls}"></i>${nm}<small>×${state.w[k]}</small></span>`).join('')}<span class="mx-t">종합</span></div>`;
    const rows = order.map((id, i) => {
      const s = siteById[id], sc = scores[id];
      const cells = W_META.map(([k, , cls]) => `<span class="mx-c"><span class="mx-track"><i style="width:${sc[k].toFixed(1)}%"></i></span><span class="mx-v">${sc[k].toFixed(0)}</span></span>`).join('');
      const stack = W_META.map(([k, , cls]) => `<i class="${cls}" style="width:${(sc[k] * state.w[k] / tw).toFixed(2)}%"></i>`).join('');
      return `<button type="button" class="mx-row${id === state.sel ? ' on' : ''}" data-id="${id}"><span class="mx-n"><span class="rk">${i + 1}</span>${s.name}</span>${cells}<span class="mx-t"><span class="mx-stack">${stack}</span><b>${sc.total.toFixed(0)}</b></span></button>`;
    }).join('');
    $('matrix').innerHTML = head + rows;
  }

  // ---------- 비교: 공급 규모 × 수익률 산점도 ----------
  function renderScatter() {
    const Wd = 560, Hd = 340, L = 46, Rr = 18, T = 14, Bm = 36;
    const pts = order.map(id => ({ id, s: siteById[id], f: evals[id].f }));
    const xs = pts.map(p => p.f.units), ys = pts.map(p => p.f.roi * 100);
    const xmax = niceMax(Math.max(...xs) * 1.08), ylo = Math.min(-10, Math.floor(Math.min(...ys) / 10) * 10 - 5), yhi = Math.max(10, Math.ceil(Math.max(...ys) / 10) * 10 + 5);
    // 가로축은 제곱근 눈금: 2만 세대와 2백 세대가 함께 읽히도록
    const X = v => L + Math.sqrt(Math.max(0, v) / xmax) * (Wd - L - Rr), Y = v => T + (yhi - v) / (yhi - ylo) * (Hd - T - Bm);
    const xt = [0, 500, 2000, 5000, 10000, 20000].filter(v => v <= xmax);
    const yt = []; for (let v = Math.ceil(ylo / 10) * 10; v <= yhi; v += (yhi - ylo > 60 ? 20 : 10)) yt.push(v);
    const amax = Math.max(...pts.map(p => p.s.area));
    const g = [];
    yt.forEach(v => g.push(`<line class="gl${v === 0 ? ' zero' : ''}" x1="${L}" x2="${Wd - Rr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="tk" x="${L - 8}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${v > 0 ? '+' : ''}${v}%</text>`));
    xt.forEach(v => g.push(`<line class="gl v" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${T}" y2="${Hd - Bm}"/><text class="tk" x="${X(v).toFixed(1)}" y="${Hd - Bm + 16}" text-anchor="middle">${v >= 10000 ? v / 10000 + '만' : fmt(v)}</text>`));
    g.push(`<text class="ax" x="${Wd - Rr}" y="${Hd - 4}" text-anchor="end">세대수 →</text><text class="ax" x="${L - 40}" y="${T - 2}">↑ 수익률 (이익/총사업비)</text>`);
    const placed = [];
    const dots = pts.map((p, i) => {
      const x = X(p.f.units), y = Y(p.f.roi * 100), r = 4 + Math.sqrt(p.s.area / amax) * 22;
      let ly = y + 3.5, side = x > Wd * 0.72 ? -1 : 1;
      for (const q of placed) if (Math.abs(q.y - ly) < 12 && Math.abs(q.x - x) < 120) ly = q.y + (ly >= q.y ? 12 : -12);
      placed.push({ x, y: ly });
      const lx = x + side * (r + 6);
      return `<g class="pt${p.id === state.sel ? ' on' : ''}" data-id="${p.id}" tabindex="0" role="button" aria-label="${p.s.name}: ${fmt(p.f.units)}세대, 수익률 ${pct(p.f.roi)}">
        <circle class="halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 6).toFixed(1)}"/>
        <circle class="b" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/><circle class="c" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2"/>
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${side > 0 ? 'start' : 'end'}">${p.s.name}<tspan class="sub" dx="5">${pct(p.f.roi, 0)}</tspan></text>
        <title>${p.s.name} · ${fmt(p.f.units)}세대 · 수익률 ${pct(p.f.roi)} · 면적 ${fmt(p.s.area)}㎡</title></g>`;
    }).join('');
    $('scatter').innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="후보지별 세대수와 수익률">${g.join('')}${dots}</svg>
      <div class="note">가로축은 제곱근 눈금. 0% 선 위는 이익, 아래는 손실입니다.</div>`;
  }
  const niceMax = (v) => { const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p * 2) / 2 * p; };

  // ---------- 가운데: 대지 정보 + 통계 ----------
  function renderHead() {
    const s = siteById[state.sel];
    $('detTitle').textContent = `${s.name} 검토`;
    $('siteHead').innerHTML = `<div class="row1"><h2>${s.name}</h2><span class="loc">${s.gu} ${s.dong}</span></div>
      <div class="status">${s.status}</div>
      <div class="facts"><span class="fact">총면적 <b>${fmt(s.area)}㎡</b></span><span class="fact">발표 물량 <b>${fmt(s.plannedUnits)}호</b></span>
      <span class="fact">착공 목표 <b>${s.start}</b></span><span class="fact">${s.land}</span></div>`;
  }
  function renderStats() {
    const s = siteById[state.sel], p = state.params[s.id], { m, f } = evals[s.id];
    const diff = f.units - s.plannedUnits;
    const cells = [
      ['세대수', fmt(f.units), `분양 ${fmt(f.saleUnits)} · 임대 ${fmt(f.rentalUnits)}`, ''],
      ['발표 대비', (diff >= 0 ? '+' : '−') + fmt(Math.abs(diff)), `발표 ${fmt(s.plannedUnits)}호`, Math.abs(diff) / s.plannedUnits > 0.15 ? 'bad' : ''],
      ['주거동', `${fmt(m.bldgCount)}동`, `${m.floors}층 · 높이 ${fmt(m.heightM, 0)}m`, ''],
      ['실현 용적률', fmt(m.farReal, 0) + '%', `계획 ${fmt(p.far)}%`, m.farReal < p.far * 0.97 ? 'bad' : ''],
      ['건폐율', fmt(m.bcrReal, 1) + '%', `한도 ${p.bcrMax}%`, ''],
      ['가용 택지', fmt(m.net / 1e4, 1) + '만㎡', `${fmt(m.W, 0)} × ${fmt(m.D, 0)}m 가정`, ''],
      ['연면적', fmt(f.gfaTotal / 1e4, 1) + '만㎡', `지하 ${fmt(f.gfaBelow / 1e4, 1)}만㎡ · 주차 ${fmt(f.parking)}대`, ''],
      ['사업기간', `${f.months}개월`, `인허가 ${f.permitMonths} · 공사 ${f.constMonths}개월`, ''],
    ];
    $('stats').innerHTML = cells.map(([k, v, sub, cls]) => `<div class="stat"><span class="k">${k}</span><span class="v ${cls}">${v}</span><span class="s">${sub}</span></div>`).join('');
    $('warn3d').innerHTML = m.warnings.map(w => `<div class="warnbox">${w}</div>`).join('');
  }

  // ---------- 오른쪽: 변수 ----------
  const MASS_KEYS = ['netRatio', 'far', 'bcrMax', 'maxFloors', 'avgUnit', 'rentalShare', 'resShare'];
  const COST_SITE = ['marketPrice', 'landPrice'];
  const COST_G = ['capDiscount', 'constUnit', 'rentalBuy', 'nonResPrice', 'rate', 'parkRatio', 'spacing'];
  function ctlHTML(scope, key, meta, val, def) {
    const tag = scope === 'g' ? `<span class="tag ${meta.src === 'source' ? 'src' : ''}">${meta.src === 'source' ? '근거' : '추정'}</span>` : (key === 'marketPrice' || key === 'landPrice' ? '<span class="tag">추정</span>' : '');
    const changed = Math.abs(val - def) > 1e-9 ? ' changed' : '';
    return `<div class="ctl${changed}" title="${meta.note}">
      <label for="c-${key}">${meta.label}${tag}</label>
      <span class="inbox"><input type="number" id="n-${key}" data-s="${scope}" data-k="${key}" value="${val}" min="${meta.min}" max="${meta.max}" step="${meta.step}" aria-label="${meta.label} 값"><span class="unit">${meta.unit}</span></span>
      <input type="range" id="c-${key}" data-s="${scope}" data-k="${key}" value="${val}" min="${meta.min}" max="${meta.max}" step="${meta.step}">
    </div>`;
  }
  function renderVars() {
    const s = siteById[state.sel], p = state.params[s.id];
    $('presets').innerHTML = s.presets.map(pr => `<button type="button" class="chipbtn" data-preset="${pr.key}" aria-pressed="${state.preset[s.id] === pr.key}">${pr.label}</button>`).join('');
    $('ctlMass').innerHTML = MASS_KEYS.map(k => ctlHTML('p', k, SITE_META[k], p[k], s.p[k])).join('');
    $('ctlCost').innerHTML = COST_SITE.map(k => ctlHTML('p', k, SITE_META[k], p[k], s.p[k])).join('') +
      COST_G.map(k => ctlHTML('g', k, GLOBAL_META[k], state.g[k], GLOBAL_DEFAULTS[k])).join('');
  }
  function syncVarValues() {
    // 슬라이더 조작 중에는 DOM을 다시 만들지 않고 값만 맞춤
    const s = siteById[state.sel], p = state.params[s.id];
    document.querySelectorAll('#vars [data-k]').forEach(el => {
      const v = el.dataset.s === 'g' ? state.g[el.dataset.k] : p[el.dataset.k];
      if (document.activeElement !== el) el.value = v;
      const def = el.dataset.s === 'g' ? GLOBAL_DEFAULTS[el.dataset.k] : s.p[el.dataset.k];
      el.closest('.ctl').classList.toggle('changed', Math.abs(v - def) > 1e-9);
    });
    document.querySelectorAll('#presets [data-preset]').forEach(b => b.setAttribute('aria-pressed', String(state.preset[s.id] === b.dataset.preset)));
  }

  // ---------- 사업성 결과 ----------
  function renderResult() {
    const s = siteById[state.sel], p = state.params[s.id], { f } = evals[s.id];
    const R = [['sale', '분양', 'var(--sale)'], ['rental', '임대 매입', 'var(--rental)'], ['nonRes', '업무·상업', 'var(--nonres)']];
    const C = [['land', '토지', 'var(--ink)'], ['sitePrep', '택지 조성', 'var(--muted)'], ['construction', '공사', 'var(--accent)'], ['design', '설계·감리', 'var(--nonres)'], ['tax', '부담금·제세', 'var(--warn)'], ['sales', '판매', 'var(--rental)'], ['finance', '금융', 'var(--bad)']];
    const max = Math.max(f.revTotal, f.costTotal);
    const bar = (items, obj) => items.filter(([k]) => obj[k] > 0).map(([k, nm, c]) => `<i style="width:${(obj[k] / max * 100).toFixed(2)}%;background:${c}" title="${nm} ${money(obj[k])}"></i>`).join('');
    const leg = (items, obj) => items.filter(([k]) => obj[k] > 0).map(([k, nm, c]) => `<div><span><i style="background:${c}"></i>${nm}</span><span class="num">${money(obj[k])}</span></div>`).join('');
    const be = f.breakeven == null ? '분양 물량이 적어 산정 불가' : `${fmt(f.breakeven, 0)}만원/3.3㎡`;
    const beNote = f.breakeven == null ? '' : (f.breakeven <= p.marketPrice ? `현재 시세 ${fmt(p.marketPrice)} 이하` : `현재 시세보다 ${fmt(f.breakeven - p.marketPrice, 0)} 높음`);
    $('result').innerHTML = `
      <div class="headline">
        <div><div class="k">사업이익</div><div class="v ${f.profit >= 0 ? 'pos' : 'neg'}">${money(f.profit)}</div><div class="k">이익/총사업비 ${pct(f.roi)} · 매출 대비 ${pct(f.margin)}</div></div>
        <div><div class="k">손익분기 주변 시세</div><div class="v" style="font-size:17px">${be}</div><div class="k">${beNote}</div></div>
      </div>
      <div class="stack">
        <div class="row"><span>매출</span><span class="bars">${bar(R, f.rev)}</span></div>
        <div class="row"><span>비용</span><span class="bars">${bar(C, f.cost)}</span></div>
      </div>
      <div class="legend"><div>${leg(R, f.rev)}<div class="tot"><span>매출 합계</span><span class="num">${money(f.revTotal)}</span></div></div><div>${leg(C, f.cost)}<div class="tot"><span>총사업비</span><span class="num">${money(f.costTotal)}</span></div></div></div>
      <div class="note">분양가 ${fmt(f.salePrice, 0)}만원/3.3㎡ (시세의 ${100 - state.g.capDiscount}%), 사업기간 ${f.months}개월 (공사 ${f.constMonths}개월)</div>
      <div><span class="label-sm">민감도 · 사업이익 변화</span><div class="tornado" id="tornado"></div></div>`;
    renderTornado();
  }
  function renderInsight(t) {
    const s = siteById[state.sel], p = state.params[s.id], { m, f } = evals[s.id];
    const rank = order.indexOf(s.id) + 1, diff = (f.units - s.plannedUnits) / s.plannedUnits;
    const lines = [];
    lines.push(`현재 시나리오는 <b>${fmt(f.units)}</b>세대로 발표 물량 대비 <b>${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff * 100), 0)}%</b>이고, 종합 순위는 8곳 중 <b>${rank}</b>위입니다.`);
    if (m.warnings.length) lines.push(`층수·건폐율·동간거리 제약 때문에 계획 용적률 ${fmt(p.far)}% 중 <b>${fmt(m.farReal, 0)}%</b>만 배치됩니다. 최고 층수나 건폐율 한도를 올리거나 동간거리 계수를 낮추면 회복됩니다.`);
    if (f.breakeven == null) lines.push(`분양 물량이 거의 없어 사업비 대부분을 임대 매입가로 회수해야 합니다. 이익을 맞추려면 임대 매입가나 공공 재정 지원이 핵심 변수입니다.`);
    else if (f.profit < 0) lines.push(`사업이익은 <b>${money(f.profit)}</b>입니다. 손익을 맞추려면 주변 시세가 <b>${fmt(f.breakeven, 0)}</b>만원/3.3㎡는 되어야 하는데, 가정 시세보다 ${fmt((f.breakeven / p.marketPrice - 1) * 100, 0)}% 높습니다.`);
    else lines.push(`사업이익은 <b>${money(f.profit)}</b>(총사업비 대비 ${pct(f.roi)})입니다. 주변 시세가 ${fmt((1 - f.breakeven / p.marketPrice) * 100, 0)}% 떨어질 때까지 손실이 나지 않습니다.`);
    if (t && t[0]) lines.push(`이익에 가장 크게 작용하는 변수는 <b>${t[0].label}</b>로, 이익이 ${sm(Math.min(t[0].lo, t[0].hi))} ~ ${sm(Math.max(t[0].lo, t[0].hi))} 움직입니다.`);
    $('insight').innerHTML = `<span class="label-sm">시나리오 해석</span>` + lines.map(x => `<p>${x}</p>`).join('');
  }
  function renderTornado() {
    const s = siteById[state.sel];
    const t = sensitivity(s, state.params[s.id], state.g);
    renderInsight(t);
    const Wd = 360, rowH = 26, lab = 96, top = 6, H = top + t.length * rowH + 6;
    const ext = Math.max(1, ...t.map(r => Math.max(Math.abs(r.lo), Math.abs(r.hi))));
    const cx = lab + (Wd - lab) / 2, half = (Wd - lab) / 2 - 50;
    const X = v => cx + v / ext * half;
    const rows = t.map((r, i) => {
      const y = top + i * rowH;
      const seg = (v, side) => {
        const x0 = Math.min(cx, X(v)), w = Math.abs(X(v) - cx);
        const col = v >= 0 ? 'var(--good)' : 'var(--bad)';
        const tx = v >= 0 ? X(v) + 3 : X(v) - 3, anc = v >= 0 ? 'start' : 'end';
        return `<rect x="${x0.toFixed(1)}" y="${y + (side ? 11 : 3)}" width="${Math.max(0.5, w).toFixed(1)}" height="8" fill="${col}" fill-opacity="${side ? 0.85 : 0.5}"></rect>
                <text class="val" x="${tx.toFixed(1)}" y="${y + (side ? 18 : 10)}" text-anchor="${anc}">${money(v)}</text>`;
      };
      return `<text x="0" y="${y + 15}">${r.label}</text>${seg(r.lo, 0)}${seg(r.hi, 1)}`;
    }).join('');
    $('tornado').innerHTML = `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="민감도 차트"><line x1="${cx}" x2="${cx}" y1="0" y2="${H}" stroke="var(--line)"></line>${rows}</svg>
      <div class="note">위 막대: 변수 감소, 아래 막대: 변수 증가</div>`;
  }

  // ---------- 비교표 ----------
  function renderTable() {
    const pillStyle = v => { const c = v >= 70 ? 'var(--good)' : v >= 45 ? 'var(--warn)' : 'var(--bad)'; return `background:color-mix(in srgb, ${c} 18%, transparent);color:${c}`; };
    const head = `<thead><tr><th>순위</th><th>후보지</th><th>세대수</th><th>발표</th><th>실현 용적률</th><th>최고층</th><th>총사업비</th><th>사업이익</th><th>수익률</th><th>입지</th><th>추진 안정성</th><th>종합</th></tr></thead>`;
    const body = order.map((id, i) => {
      const s = siteById[id], { m, f } = evals[id], sc = scores[id];
      return `<tr data-id="${id}" class="${id === state.sel ? 'on' : ''}"><td>${i + 1}</td><td>${s.name}</td><td>${fmt(f.units)}</td><td>${fmt(s.plannedUnits)}</td>
        <td>${fmt(m.farReal, 0)}%</td><td>${m.floors}</td><td>${money(f.costTotal)}</td><td class="${f.profit >= 0 ? 'pos' : 'neg'}">${money(f.profit)}</td>
        <td class="${f.roi >= 0 ? 'pos' : 'neg'}">${pct(f.roi)}</td><td>${s.loc.score}</td><td>${s.risk.score}</td>
        <td><span class="pill" style="${pillStyle(sc.total)}">${sc.total.toFixed(1)}</span></td></tr>`;
    }).join('');
    $('cmp').innerHTML = head + `<tbody>${body}</tbody>`;
  }

  // ---------- 근거 ----------
  function renderDossier() {
    const s = siteById[state.sel];
    $('dosTitle').textContent = `${s.name} · 쟁점과 근거`;
    $('issues').innerHTML = s.risk.issues.map(t => `<li>${t}</li>`).join('') + `<li>입지: ${s.loc.note}</li>`;
    $('srcs').innerHTML = s.sources.map(x => `<li><span class="d">${x.d}</span><a href="${x.url}" target="_blank" rel="noopener">${x.t}</a></li>`).join('');
    $('assume').innerHTML = [
      '대지는 가용 택지 면적을 가진 직사각형으로 단순화했습니다. 실제 지적 경계는 다음 단계에서 연동합니다.',
      '주거동은 남향 판상형, 층당 4호, 층고 2.9m. 동간거리는 계수 × 높이(최소 12m)입니다.',
      '전용률 72%, 공급면적 = 전용 × 1.32, 지하 주차 1대당 35㎡로 계산합니다.',
      '분양가 = 주변 시세 × (1 − 상한제 할인율). 시세·토지 단가는 지역별 추정값이라 실제 값으로 바꿔 쓰세요.',
      '부담금·제세 4%(토지+공사), 설계·감리 6%(공사), 판매비 2%(분양매출), 30층 초과 시 층당 공사비 0.6% 할증.',
      '추진 안정성·입지 점수는 기사 내용을 바탕으로 매긴 정성 점수입니다.',
    ].map(t => `<li>${t}</li>`).join('');
    $('psrcs').innerHTML = PRICE_SOURCES.map(x => `<li><span class="d">${x.d}</span><a href="${x.url}" target="_blank" rel="noopener">${x.t}</a></li>`).join('');
  }

  // ---------- 내보내기 ----------
  function exportObj() {
    const s = siteById[state.sel], p = state.params[s.id], { m, f } = evals[s.id];
    const r = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
    return {
      schema: 'bim-sim/stage1-site@1',
      generated_at: new Date().toISOString(),
      site: { id: s.id, name: s.name, gu: s.gu, dong: s.dong, lat: s.lat, lng: s.lng, area_m2: s.area, planned_units: s.plannedUnits, start_year: s.start, status: s.status },
      scenario: { preset: state.preset[s.id], site_params: p, global_params: state.g, score: r(scores[s.id].total, 1) },
      mass: {
        net_land_m2: r(m.net), site_rect_m: [r(m.W, 1), r(m.D, 1)], far_target_pct: p.far, far_real_pct: r(m.farReal, 1), bcr_real_pct: r(m.bcrReal, 1),
        res_buildings: m.bldgCount, floors: m.floors, height_m: r(m.heightM, 1), units: f.units, units_sale: f.saleUnits, units_rental: f.rentalUnits,
        avg_unit_m2: p.avgUnit, gfa_above_m2: r(m.gfaAbove), gfa_below_m2: r(f.gfaBelow), gfa_total_m2: r(f.gfaTotal), nonres_gfa_m2: r(m.nonRes ? m.nonRes.gfa : 0), parking: f.parking,
        warnings: m.warnings,
      },
      finance_krw_eok: {
        revenue: r(f.revTotal / 1e4), revenue_sale: r(f.rev.sale / 1e4), revenue_rental: r(f.rev.rental / 1e4), revenue_nonres: r(f.rev.nonRes / 1e4),
        cost_total: r(f.costTotal / 1e4), cost_land: r(f.cost.land / 1e4), cost_construction: r(f.cost.construction / 1e4), cost_finance: r(f.cost.finance / 1e4),
        profit: r(f.profit / 1e4), roi_pct: r(f.roi * 100, 1), breakeven_market_price_manwon_per_py: f.breakeven == null ? null : r(f.breakeven),
      },
      next_stage_inputs: {
        quantity: { gfa_total_m2: r(f.gfaTotal), buildings: m.bldgCount + (m.nonRes ? m.nonRes.count : 0), floors: m.floors, units: f.units, basement_parking: f.parking },
        schedule: { start_year: s.start, construction_months: f.constMonths, project_months: f.months },
        budget: { construction_cost_eok: r(f.cost.construction / 1e4), unit_cost_manwon_per_py: state.g.constUnit },
      },
      buildings: m.buildings.slice(0, 2000).map((b, i) => ({ id: (b.type === 'res' ? 'R' : 'C') + String(i + 1).padStart(3, '0'), use: b.type === 'res' ? 'residential' : 'commercial', x: r(b.x, 1), z: r(b.z, 1), w: r(b.w, 1), d: r(b.d, 1), h: r(b.h, 1), floors: b.floors })),
    };
  }
  function renderExport() {
    const o = exportObj();
    const n = o.next_stage_inputs;
    $('handoff').innerHTML = [
      ['연면적 합계', fmt(n.quantity.gfa_total_m2) + '㎡'], ['동수', fmt(n.quantity.buildings) + '동'], ['최고 층수', n.quantity.floors + '층'],
      ['세대수', fmt(n.quantity.units)], ['공사기간', n.schedule.construction_months + '개월'], ['공사비', money(n.budget.construction_cost_eok * 1e4)],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('json').value = JSON.stringify(o, null, 2);
    renderNext();
  }

  // ---------- 3D ----------
  const V = { ok: false };
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }
  function init3D() {
    const canvas = $('cv');
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); }
    catch (e) { $('warn3d').innerHTML = '<div class="warnbox">이 기기에서 WebGL을 쓸 수 없어 3D를 표시하지 못했습니다.</div>'; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1.6, 1, 20000);
    const hemi = new THREE.HemisphereLight(0xeef3f8, 0x9a9890, 0.75 * Math.PI); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3e6, 1.15 * Math.PI); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; scene.add(sun); scene.add(sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const site = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1 }));
    site.rotation.x = -Math.PI / 2; site.position.y = 0.05; site.receiveShadow = true; scene.add(site);
    const siteLine = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x0b6e66 })); scene.add(siteLine);
    const northArrow = new THREE.Group(); scene.add(northArrow);
    const group = new THREE.Group(); scene.add(group);
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const edges = new THREE.EdgesGeometry(box);
    const mats = { res: new THREE.MeshStandardMaterial({ roughness: 0.8 }), rental: new THREE.MeshStandardMaterial({ roughness: 0.8 }), nonres: new THREE.MeshStandardMaterial({ roughness: 0.8 }) };
    const lineMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75 });
    Object.assign(V, { ok: true, renderer, scene, camera, sun, hemi, ground, site, siteLine, group, box, edges, mats, lineMat, northArrow,
      orbit: { theta: -0.55, phi: 0.95, r: 800, tx: 0, ty: 0, tz: 0 }, extent: 500, need: true });
    applyTheme();
    // 상호작용: 드래그 회전, Shift/오른쪽 드래그 이동, 휠·핀치 확대
    const ptrs = new Map(); let last = null, pinch = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    canvas.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const o = V.orbit;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) o.r = clampR(o.r * pinch / d); pinch = d; V.need = true; return; }
      const dx = e.clientX - last.x, dy = e.clientY - last.y; last.x = e.clientX; last.y = e.clientY;
      if (last.pan) { const s = o.r / 900; o.tx -= (Math.cos(o.theta) * dx) * s; o.tz += (Math.sin(o.theta) * dx) * s; o.tx -= Math.sin(o.theta) * dy * s; o.tz -= Math.cos(o.theta) * dy * s; }
      else { o.theta -= dx * 0.006; o.phi = Math.min(1.52, Math.max(0.08, o.phi - dy * 0.006)); }
      V.need = true;
    });
    const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { e.preventDefault(); V.orbit.r = clampR(V.orbit.r * Math.exp(e.deltaY * 0.0012)); V.need = true; }, { passive: false });
    const ro = new ResizeObserver(() => { V.need = true; }); ro.observe($('stage'));
    cleanups.push(() => { ro.disconnect(); renderer.dispose(); renderer.forceContextLoss(); });
    const loop = () => { if (!alive) return; if (V.need) { V.need = false; draw(); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  function clampR(r) { return Math.min(V.extent * 4, Math.max(V.extent * 0.15, r)); }
  function applyTheme() {
    if (!V.ok) return;
    const c = n => new THREE.Color(css(n));
    V.scene.background = c('--sky');
    V.ground.material.color = c('--ground');
    V.site.material.color = c('--site');
    V.siteLine.material.color = c('--accent');
    V.mats.res.color = c('--model'); V.mats.rental.color = c('--rental'); V.mats.nonres.color = c('--nonres');
    V.lineMat.color = c('--edge');
    V.northArrow.children.forEach(ch => { if (ch.material) ch.material.color = c('--ink'); });
    V.need = true;
  }
  function rebuild3D(refit) {
    if (!V.ok) return;
    const s = siteById[state.sel], p = state.params[s.id], { m, f } = evals[s.id];
    const g = V.group; while (g.children.length) { g.remove(g.children[0]); }
    const ext = Math.max(m.W, m.D, m.heightM * 1.4, 60);
    V.extent = ext;
    V.ground.scale.set(Math.max(m.W, m.D) * 3 + ext, Math.max(m.W, m.D) * 3 + ext, 1);
    V.site.scale.set(m.W, m.D, 1);
    const hw = m.W / 2, hd = m.D / 2;
    V.siteLine.geometry.dispose();
    V.siteLine.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-hw, 0.3, -hd), new THREE.Vector3(hw, 0.3, -hd), new THREE.Vector3(hw, 0.3, hd), new THREE.Vector3(-hw, 0.3, hd)]);
    // 북쪽 표시(-z)
    V.northArrow.clear();
    const na = new THREE.Mesh(new THREE.ConeGeometry(Math.max(m.W, m.D) * 0.02, Math.max(m.W, m.D) * 0.06, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--ink')) }));
    na.rotation.x = -Math.PI / 2; na.position.set(-hw - Math.max(m.W, m.D) * 0.06, 0.5, -hd + Math.max(m.W, m.D) * 0.03); V.northArrow.add(na);
    // 임대동: 북쪽 행부터 임대 비율만큼
    const res = m.buildings.filter(b => b.type === 'res');
    const nRental = Math.round(res.length * (f.units ? f.rentalUnits / f.units : 0));
    const sorted = res.map((b, i) => [b, i]).sort((a, b) => a[0].z - b[0].z);
    const rentalSet = new Set(sorted.slice(0, nRental).map(x => x[1]));
    const list = m.buildings.slice(0, 1500);
    let ri = 0;
    list.forEach(b => {
      let mat;
      if (b.type === 'res') { mat = rentalSet.has(ri) ? V.mats.rental : V.mats.res; ri++; } else mat = V.mats.nonres;
      const mesh = new THREE.Mesh(V.box, mat);
      mesh.scale.set(b.w, b.h, b.d); mesh.position.set(b.x, 0, b.z); mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
      if (list.length <= 600) { const ln = new THREE.LineSegments(V.edges, V.lineMat); ln.scale.copy(mesh.scale); ln.position.copy(mesh.position); g.add(ln); }
    });
    const sc = V.sun.shadow.camera, half = ext * 0.85;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = ext * 6; sc.updateProjectionMatrix();
    if (refit) setView('bird');
    updateSun();
  }
  function setView(kind) {
    const o = V.orbit, ext = V.extent;
    o.tx = 0; o.ty = 0; o.tz = 0;
    if (kind === 'top') { o.phi = 0.08; o.theta = 0; o.r = ext * 1.5; }
    else if (kind === 'south') { o.phi = 1.38; o.theta = 0; o.r = ext * 1.6; o.ty = V.extent * 0.12; }
    else { o.phi = 0.98; o.theta = -0.55; o.r = ext * 1.7; o.ty = Math.min(V.extent * 0.1, 20); }
    V.need = true;
  }
  function sunVector() {
    const phi = 37.55 * Math.PI / 180, dec = state.season * Math.PI / 180, H = (state.hour - 12) * 15 * Math.PI / 180;
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI; // 북에서 시계방향
    return { alt, az, v: [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)] };
  }
  function updateSun() {
    const { alt, az, v } = sunVector();
    const h = Math.floor(state.hour), mi = Math.round((state.hour - h) * 60);
    $('hourOut').textContent = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    $('sunOut').textContent = alt > 0 ? `태양 고도 ${fmt(alt * 180 / Math.PI, 1)}°, 방위 ${fmt(az * 180 / Math.PI, 0)}°` : '해가 진 시각';
    if (!V.ok) return;
    const d = V.extent * 2.5;
    V.sun.position.set(v[0] * d, Math.max(v[1], 0.02) * d, v[2] * d);
    V.sun.target.position.set(0, 0, 0);
    V.sun.intensity = (alt > 0 ? 1.15 : 0) * Math.PI;
    V.hemi.intensity = (alt > 0 ? 0.75 : 0.95) * Math.PI;
    V.need = true;
  }
  function draw() {
    const st = $('stage'), w = st.clientWidth, h = st.clientHeight;
    if (!w || !h) return;
    const r = V.renderer, cam = V.camera, o = V.orbit;
    if (r.domElement.width !== Math.round(w * r.getPixelRatio()) || r.domElement.height !== Math.round(h * r.getPixelRatio())) r.setSize(w, h, false);
    cam.aspect = w / h;
    cam.near = Math.max(0.5, o.r / 200); cam.far = o.r * 20; cam.updateProjectionMatrix();
    cam.position.set(o.tx + o.r * Math.sin(o.phi) * Math.sin(o.theta), o.ty + o.r * Math.cos(o.phi), o.tz + o.r * Math.sin(o.phi) * Math.cos(o.theta));
    cam.lookAt(o.tx, o.ty, o.tz);
    r.render(V.scene, cam);
  }

  // ---------- 갱신 ----------
  function refresh(opts = {}) {
    computeAll();
    renderRank(); renderTable(); renderPick(); renderMatrix(); renderScatter();
    if (opts.site) { renderHead(); renderVars(); renderDossier(); } else syncVarValues();
    renderStats(); renderResult(); renderExport();
    rebuild3D(!!opts.site);
    save();
  }
  let raf = 0, pendingSite = false;
  function schedule(site) { pendingSite = pendingSite || site; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (!alive) return; const s = pendingSite; pendingSite = false; refresh({ site: s }); }); }

  // 이벤트
  function select(id, fromMap) {
    if (!siteById[id]) return;
    const s = siteById[id];
    if (atlas) atlas.lookAt(s.lng, s.lat, Math.max(atlas.zoom, s.area > 5e5 ? 12.4 : 13.4));
    if (id === state.sel) return;
    state.sel = id; schedule(true);
  }
  $('sites').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) select(b.dataset.id); });
  $('sites').addEventListener('pointerover', e => { const b = e.target.closest('[data-id]'); $('map').querySelectorAll('.at-pin').forEach(p => p.classList.toggle('hl', !!b && p.dataset.id === b.dataset.id)); });
  $('sites').addEventListener('pointerleave', () => $('map').querySelectorAll('.at-pin.hl').forEach(p => p.classList.remove('hl')));
  $('matrix').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) select(b.dataset.id); });
  $('scatter').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) select(b.dataset.id); });
  $('scatter').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const b = e.target.closest('[data-id]'); if (b) { e.preventDefault(); select(b.dataset.id); } } });
  root.addEventListener('click', e => { if (e.target.closest('[data-launch]')) launch(); });
  $('cmp').addEventListener('click', e => { const b = e.target.closest('tr[data-id]'); if (b) select(b.dataset.id); });
  $('weights').addEventListener('input', e => { const k = e.target.dataset.w; if (!k) return; state.w[k] = +e.target.value; $('wo-' + k).textContent = e.target.value; schedule(false); });
  $('vars').addEventListener('input', e => {
    const el = e.target, k = el.dataset.k; if (!k) return;
    let v = parseFloat(el.value); if (!isFinite(v)) return;
    const meta = el.dataset.s === 'g' ? GLOBAL_META[k] : SITE_META[k];
    v = Math.min(meta.max, Math.max(meta.min, v));
    if (el.dataset.s === 'g') state.g[k] = v; else { state.params[state.sel][k] = v; state.preset[state.sel] = null; }
    const twin = el.type === 'range' ? $('n-' + k) : $('c-' + k); if (twin) twin.value = v;
    schedule(false);
  });
  $('presets').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]'); if (!b) return;
    const s = siteById[state.sel], pr = s.presets.find(x => x.key === b.dataset.preset);
    state.params[s.id] = { ...s.p, ...pr.p }; state.preset[s.id] = pr.key; schedule(false);
  });
  $('reset').addEventListener('click', () => { const s = siteById[state.sel]; state.params[s.id] = { ...s.p }; state.preset[s.id] = s.presets[0].key; state.g = { ...GLOBAL_DEFAULTS }; schedule(false); });
  $('allPlan').addEventListener('click', () => { SITES.forEach(s => { state.params[s.id] = { ...s.p, ...s.presets[0].p }; state.preset[s.id] = s.presets[0].key; }); schedule(false); });
  $('allPrivate').addEventListener('click', () => { SITES.forEach(s => { const pr = s.presets.find(x => x.key === 'private') || s.presets[s.presets.length - 1]; state.params[s.id] = { ...s.p, ...pr.p }; state.preset[s.id] = pr.key; }); schedule(false); });
  root.querySelectorAll('#view [data-view]').forEach(b => b.addEventListener('click', () => { setView(b.dataset.view); root.querySelectorAll('#view [data-view]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  $('season').addEventListener('change', e => { state.season = +e.target.value; updateSun(); save(); });
  $('hour').addEventListener('input', e => { state.hour = +e.target.value; updateSun(); save(); });
  $('copy').addEventListener('click', () => {
    const t = $('json').value;
    const done = msg => { $('toast').textContent = msg; setTimeout(() => { $('toast').textContent = ''; }, 2500); };
    try { navigator.clipboard.writeText(t).then(() => done('복사했습니다'), () => { $('json').select(); done('텍스트를 선택했습니다. Ctrl+C로 복사하세요'); }); }
    catch (e) { $('json').select(); done('텍스트를 선택했습니다. Ctrl+C로 복사하세요'); }
  });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', applyTheme);
  const mo = new MutationObserver(applyTheme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  cleanups.push(() => { mq.removeEventListener('change', applyTheme); mo.disconnect(); });

  // 시작
  $('season').value = String(state.season); $('hour').value = String(state.hour);
  renderWeights();
  initMap();
  init3D();
  refresh({ site: true });
  const offTheme = onThemeChange(() => atlas && atlas.theme()); cleanups.push(offTheme);

  // ---------- 프로젝트 시작: 2단계로 넘기기 ----------
  function handoffFor() {
    const s = siteById[state.sel], p = state.params[s.id], { f } = evals[s.id];
    const pr = s.presets.find(x => x.key === state.preset[s.id]);
    const zoning = s.id === 'yongsan' ? 'gc' : 'semi';
    const mp = massParamsFromStage1({ siteId: s.id, units: f.units, avgUnit: p.avgUnit, rentalShare: p.rentalShare, maxFloors: p.maxFloors, zoning, resShare: p.resShare }, MASS_DEFAULTS);
    return { s, p, f, pr, mp };
  }
  function renderNext() {
    const { s, p, f, pr, mp } = handoffFor();
    const items = [
      ['택지', s.name, `${s.gu} ${s.dong}`],
      ['시나리오', pr ? pr.label : '사용자 시나리오', `종합 ${scores[s.id].total.toFixed(0)}점 · ${order.indexOf(s.id) + 1}위`],
      ['주거 목표', fmt(mp.housingTarget) + '호', `1단계 ${fmt(f.units)}세대를 50호 단위로`],
      ['최고 층수', (mp.resMaxFloors || p.maxFloors) + '층', `용적률 ${fmt(p.far)}%`],
      ['평형 구성', `${mp.mix59}·${mp.mix84}·${mp.mix114}%`, `59·84·114㎡ (평균 전용 ${p.avgUnit}㎡)`],
      ['공공임대', p.rentalShare + '%', `임대 ${fmt(f.rentalUnits)}세대`],
    ];
    $('nextCard').innerHTML = `<div class="launch-card">
      <div class="lc-l"><span class="label-sm">02 매스 배치로 넘길 값</span>
        <dl class="lc-kv">${items.map(([k, v, sub]) => `<div><dt>${k}</dt><dd>${v}<small>${sub}</small></dd></div>`).join('')}</dl></div>
      <div class="lc-r"><span class="label-sm">next · stage 03</span><b class="lc-t">매스 배치</b>
        <p>실제 지도 위에 동을 배치하고 층수·평형·주동 형식을 바꿔 가며 일조·조망·인동간격을 검토합니다.</p>
        <button class="btn big" type="button" data-launch>${withRo(s.name)} 프로젝트 시작 <span class="ar">→</span></button></div>
    </div>`;
  }
  // '용산국제업무지구로', '태릉CC로', '부지로' (받침 있으면 '으로', ㄹ 받침은 '로')
  function withRo(w) { const c = w.charCodeAt(w.length - 1); if (c < 0xac00 || c > 0xd7a3) return w + '로'; const j = (c - 0xac00) % 28; return w + (j && j !== 8 ? '으로' : '로'); }
  function launch() {
    const o = exportObj();
    const { s, p, f, pr, mp } = handoffFor();
    store.set({
      handoff1: { siteId: s.id, siteName: s.name, preset: state.preset[s.id], presetLabel: pr ? pr.label : '사용자 시나리오', units: f.units, saleUnits: f.saleUnits, rentalUnits: f.rentalUnits,
        avgUnit: p.avgUnit, rentalShare: p.rentalShare, far: p.far, maxFloors: p.maxFloors, profit: f.profit, roi: f.roi, at: new Date().toISOString(), stage1: o },
      mass: mp, massFrom: 'stage1', site: { id: s.id, over: { netRatio: p.netRatio, resShare: p.resShare, units: f.units, maxFloors: p.maxFloors, far: p.far, avgUnit: p.avgUnit, rentalShare: p.rentalShare } },
    });
    location.hash = '#/mass';
  }
  root.addEventListener('click', e => { const b = e.target.closest('[data-goto]'); if (b) select(b.dataset.goto); });

  return () => { alive = false; if (raf) cancelAnimationFrame(raf); cleanups.forEach(f => f()); };
}
