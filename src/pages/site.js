// 1단계: 서울 공동주택 택지 선정 (사업성·입지·추진 안정성 비교, 단순 매스)
import * as THREE from 'three';
import { SITES, GLOBAL_DEFAULTS, GLOBAL_META, SITE_META, PRICE_SOURCES, evaluate, sensitivity, scoreSite } from '../stage1/engine.js';
import { SEOUL } from '../stage1/seoulmap.js';
import { store, massParamsFromStage1 } from '../store.js';
import { DEFAULTS as MASS_DEFAULTS } from '../yongsan/massing.js';

export const title = '1단계 택지 선정';

const HEAD = `<div class="page-h">
  <div><span class="label-sm">1단계 · 매스·기획설계</span><h1>서울 공동주택 택지 사업성 비교</h1>
  <p>개발이 거론되거나 논란 중인 서울 택지 8곳을 같은 기준으로 비교합니다. 변수를 바꾸면 세대수, 사업성, 순위가 바로 다시 계산됩니다. 용산국제업무지구를 고르면 2단계 상세 매스 배치로 넘어갈 수 있습니다.</p></div>
</div>`;

const BODY = `<div class="p-site">
  <section id="rank" class="panel pad" aria-label="후보지 순위">
    <div class="sec-h"><h2>후보지 순위</h2><span class="hint">가중치로 순위 조정</span></div>
    <p class="pick" id="pick"></p>
    <ul class="sites" id="sites"></ul>
    <div class="weights" id="weights"></div>
    <div class="bulk">
      <button class="chipbtn" id="allPlan" type="button">모든 후보지 발표안</button>
      <button class="chipbtn" id="allPrivate" type="button">모든 후보지 분양 최대화</button>
    </div>
    <div class="map" id="map"></div>
    <div class="map-cap">원 크기는 세대수. 위치는 대략적인 지점입니다.</div>
  </section>

  <section id="view" class="panel" aria-label="3D 매스">
    <div class="site-head" id="siteHead"></div>
    <div class="stage" id="stage">
      <canvas id="cv" aria-label="선택한 후보지의 3D 매스 모델. 드래그로 회전, 휠로 확대"></canvas>
      <div class="ov tl" id="legend3d">
        <span class="lg"><i style="background:var(--sale)"></i>분양</span>
        <span class="lg"><i style="background:var(--rental)"></i>공공임대·장기전세</span>
        <span class="lg"><i style="background:var(--nonres)"></i>업무·상업</span>
      </div>
      <div class="ov tr">
        <button class="vbtn" type="button" data-view="bird">조감</button>
        <button class="vbtn" type="button" data-view="top">평면</button>
        <button class="vbtn" type="button" data-view="south">남측 입면</button>
      </div>
      <div class="ov bl" id="warn3d"></div>
    </div>
    <div class="sun">
      <label for="season">일조</label>
      <select id="season">
        <option value="-23.44">동지 (12월 22일)</option>
        <option value="0">춘분 (3월 20일)</option>
        <option value="23.44">하지 (6월 21일)</option>
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

  <section id="table" class="panel pad" aria-label="후보지 비교표">
    <div class="sec-h"><h2>후보지 비교</h2><span class="hint">각 후보지의 현재 변수 기준. 행을 누르면 선택</span></div>
    <div class="tw"><table id="cmp"></table></div>
  </section>

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

  <section id="export" class="panel pad" aria-label="다음 단계로 내보내기">
    <div class="sec-h"><h2>다음 단계로 넘길 값</h2><span class="hint">2단계 매스 배치 입력</span></div>
    <div id="nextCard"></div>
    <dl class="handoff" id="handoff"></dl>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <button class="btn" id="copy" type="button">JSON 복사</button><span class="toast" id="toast" role="status"></span>
    </div>
    <textarea id="json" readonly aria-label="시나리오 JSON"></textarea>
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

  // ---------- 왼쪽: 순위 ----------
  function renderRank() {
    const tw = Object.values(state.w).reduce((a, b) => a + b, 0) || 1;
    $('sites').innerHTML = order.map((id, i) => {
      const s = siteById[id], sc = scores[id], f = evals[id].f;
      const segs = W_META.map(([k, , cls]) => `<i class="${cls}" style="width:${(sc[k] * state.w[k] / tw).toFixed(2)}%"></i>`).join('');
      return `<li><button class="site-btn" type="button" data-id="${id}" aria-pressed="${id === state.sel}">
        <span class="rk">${i + 1}</span><span class="nm">${s.name}</span><span class="sc">${sc.total.toFixed(0)}</span>
        <span class="sub"><span>${s.gu}</span><span>${fmt(f.units)}세대</span><span>착공 ${s.start}</span><span>수익률 ${pct(f.roi, 0)}</span></span>
        <span class="bar">${segs}</span></button></li>`;
    }).join('');
    const top = order[0], s = siteById[top], sc = scores[top];
    const best = W_META.filter(([k]) => state.w[k] > 0).map(([k, nm]) => [nm, sc[k]]).sort((a, b) => b[1] - a[1]).slice(0, 2);
    $('pick').innerHTML = `현재 가중치로는 <b>${s.name}</b>(${sc.total.toFixed(0)}점)이 1순위입니다. 강점은 ${best.map(([n, v]) => `${n} ${v.toFixed(0)}`).join(', ')}.`;
    renderMap();
  }
  function renderWeights() {
    $('weights').innerHTML = `<span class="label-sm">평가 가중치</span>` + W_META.map(([k, nm, cls, tip]) =>
      `<div class="w-row" title="${tip}"><span class="dot ${cls}"></span><label for="w-${k}">${nm}</label>
       <input id="w-${k}" type="range" min="0" max="50" step="1" value="${state.w[k]}" data-w="${k}"><output class="num" id="wo-${k}">${state.w[k]}</output></div>`).join('');
  }

  // ---------- 지도 ----------
  const lng0 = 126.76, lat1 = 37.71, kcos = Math.cos(37.56 * Math.PI / 180), SX = SEOUL.W / ((127.19 - 126.76) * kcos);
  const proj = (lng, lat) => [(lng - lng0) * kcos * SX, (lat1 - lat) * SX];
  const RIVER = [[126.795,37.596],[126.823,37.590],[126.862,37.574],[126.889,37.553],[126.903,37.543],[126.925,37.535],[126.937,37.530],[126.948,37.527],[126.958,37.517],[126.981,37.509],[126.996,37.514],[127.012,37.527],[127.020,37.536],[127.035,37.537],[127.054,37.536],[127.065,37.527],[127.083,37.519],[127.103,37.531],[127.118,37.540],[127.125,37.548],[127.135,37.560],[127.165,37.580],[127.185,37.587]];
  function renderMap() {
    const river = RIVER.map((c, i) => (i ? 'L' : 'M') + proj(c[0], c[1]).map(v => v.toFixed(1)).join(',')).join('');
    const guP = SEOUL.gu.map(g => `<path class="gu" d="${g.d}"><title>${g.n}</title></path>`).join('');
    const guL = SEOUL.gu.map(g => `<text class="gu-l" x="${g.c[0]}" y="${g.c[1]}">${g.n.replace('구', '')}</text>`).join('');
    const pts = order.map((id, i) => {
      const s = siteById[id]; const [x, y] = proj(s.lng, s.lat);
      const r = 6 + Math.sqrt(evals[id].f.units) / 9;
      return `<g class="pt${id === state.sel ? ' on' : ''}" data-id="${id}" tabindex="0" role="button" aria-label="${s.name}">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"></circle>
        <text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}">${i + 1}</text><title>${s.name}</title></g>`;
    }).join('');
    $('map').innerHTML = `<svg viewBox="0 0 ${SEOUL.W} ${SEOUL.H}" role="img" aria-label="서울 후보지 위치">${guP}<path class="river" d="${river}" stroke-width="9"></path>${guL}${pts}</svg>`;
  }

  // ---------- 가운데: 대지 정보 + 통계 ----------
  function renderHead() {
    const s = siteById[state.sel];
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
    renderNext(o);
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
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1.6, 1, 20000);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445544, 0.55 * Math.PI); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9 * Math.PI); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; scene.add(sun); scene.add(sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const site = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
    site.rotation.x = -Math.PI / 2; site.position.y = 0.05; site.receiveShadow = true; scene.add(site);
    const siteLine = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x0b6e66 })); scene.add(siteLine);
    const northArrow = new THREE.Group(); scene.add(northArrow);
    const group = new THREE.Group(); scene.add(group);
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const edges = new THREE.EdgesGeometry(box);
    const mats = { res: new THREE.MeshLambertMaterial(), rental: new THREE.MeshLambertMaterial(), nonres: new THREE.MeshLambertMaterial() };
    const lineMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35 });
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
    V.mats.res.color = c('--sale'); V.mats.rental.color = c('--rental'); V.mats.nonres.color = c('--nonres');
    V.lineMat.color = c('--ink');
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
    V.sun.intensity = (alt > 0 ? 0.95 : 0) * Math.PI;
    V.hemi.intensity = (alt > 0 ? 0.55 : 0.75) * Math.PI;
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
    renderRank(); renderTable();
    if (opts.site) { renderHead(); renderVars(); renderDossier(); } else syncVarValues();
    renderStats(); renderResult(); renderExport();
    rebuild3D(!!opts.site);
    save();
  }
  let raf = 0, pendingSite = false;
  function schedule(site) { pendingSite = pendingSite || site; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (!alive) return; const s = pendingSite; pendingSite = false; refresh({ site: s }); }); }

  // 이벤트
  function select(id) { if (!siteById[id] || id === state.sel) return; state.sel = id; schedule(true); }
  $('sites').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) select(b.dataset.id); });
  $('map').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) select(b.dataset.id); });
  $('map').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const b = e.target.closest('[data-id]'); if (b) { e.preventDefault(); select(b.dataset.id); } } });
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
  root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
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
  init3D();
  refresh({ site: true });

  // ---------- 2단계로 넘기기 ----------
  function renderNext(o) {
    const s = siteById[state.sel], p = state.params[s.id], { f } = evals[s.id];
    const box = $('nextCard');
    if (s.id !== 'yongsan') {
      box.innerHTML = `<div class="next-card off"><b>2단계 상세 매스 배치</b><span>현재는 용산국제업무지구만 상세 매스(블록·동·층고·일조·조망)를 지원합니다. 다른 후보지는 단순 매스와 사업성까지 비교할 수 있습니다.</span>
        <span><button class="chipbtn" type="button" data-goto="yongsan">용산국제업무지구 선택</button></span></div>`;
      return;
    }
    const pr = s.presets.find(x => x.key === state.preset[s.id]);
    const mp = massParamsFromStage1({ units: f.units, avgUnit: p.avgUnit, rentalShare: p.rentalShare }, MASS_DEFAULTS);
    box.innerHTML = `<div class="next-card"><b>2단계 매스 배치로 넘길 값</b>
      <span>${pr ? pr.label : '사용자 시나리오'} · 주거 <b class="mono">${fmt(mp.housingTarget)}</b>호 (1단계 ${fmt(f.units)}세대를 100호 단위로), 평균 전용 ${p.avgUnit}㎡ → 59·84·114㎡ = ${mp.mix59}·${mp.mix84}·${mp.mix114}%, 공공임대 ${p.rentalShare}%</span>
      <span><button class="btn" type="button" id="toMass">2단계 매스 배치로 →</button></span></div>`;
    $('toMass').addEventListener('click', () => {
      store.set({
        handoff1: { siteId: s.id, siteName: s.name, preset: state.preset[s.id], presetLabel: pr ? pr.label : '사용자 시나리오', units: f.units, saleUnits: f.saleUnits, rentalUnits: f.rentalUnits,
          avgUnit: p.avgUnit, rentalShare: p.rentalShare, far: p.far, maxFloors: p.maxFloors, profit: f.profit, roi: f.roi, at: new Date().toISOString(), stage1: o },
        mass: mp, massFrom: 'stage1',
      });
      location.hash = '#/mass';
    });
  }
  root.addEventListener('click', e => { const b = e.target.closest('[data-goto]'); if (b) select(b.dataset.goto); });

  return () => { alive = false; if (raf) cancelAnimationFrame(raf); cleanups.forEach(f => f()); };
}
