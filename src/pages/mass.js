// 2단계: 용산국제업무지구 매스 배치 (블록·동·층고 + 일조·조망·주변 영향)
import { DEFAULTS, META, generate, USE_LABEL } from '../yongsan/massing.js';
import { meets, sunAltAz, analyze, unitSamples, contextSamples, projectBoxes } from '../yongsan/analysis.js';
import { BLOCKS, ZONES, CONTEXT } from '../yongsan/plan.js';
import { createViewer } from '../yongsan/viewer.js';
import { store, massParamsFromStage1 } from '../store.js';

export const title = '2단계 매스 배치';

const fmt = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
const man = (v) => fmt(v / 1e4, 1) + '만㎡';
const pct = (a, b) => (b ? (a / b * 100) : 0);
const KIND = { apt: '아파트', officetel: '오피스텔', office: '업무', landmark: '랜드마크 (업무·호텔)', podium: '포디움 (상업·근생)', basement: '지하층' };
const ZONE_TOKEN = { intl: '--office', mixed: '--officetel', supp: '--res' };
const PRESETS = [
  { key: 'seoul', label: '서울시안 6천 호', p: { housingTarget: 6000, officetelShare: 30, resMaxFloors: 55 } },
  { key: 'mid', label: '절충안 8천 호', p: { housingTarget: 8000, officetelShare: 35, resMaxFloors: 65 } },
  { key: 'gov', label: '정부안 1만 호', p: { housingTarget: 10000, officetelShare: 45, resMaxFloors: 75 } },
];
const TYPOLOGY = [['tower', '탑상형'], ['mixed', '혼합형'], ['slab', '판상형']];
const MODES = [['use', '용도'], ['sun', '일조 (동지)'], ['river', '한강 조망'], ['namsan', '남산 조망'], ['ctx', '주변 일조 영향']];
const VIEWS = [['bird', '조감'], ['top', '평면'], ['river', '한강에서'], ['east', '용산역에서'], ['namsan', '남산에서']];
const GROUPS = [['plan', '계획 물량', true], ['res', '주거동 배치', true], ['office', '업무·랜드마크', false], ['h', '층고', false], ['park', '주차', false]];
const SOURCES = [
  { d: '2024.02', t: '서울시 · 용산국제업무지구 개발계획(안)', url: 'https://scpm.seoul.go.kr/seoul-policy/evt0019' },
  { d: '2024.02', t: '내 손안에 서울 · 용산에 100층 랜드마크, 세계 최대 수직도시', url: 'https://mediahub.seoul.go.kr/archives/2010188' },
  { d: '2025.11', t: '아시아경제 · 용산국제업무지구 10년 만에 첫 삽, 27년 말 주택분양 목표', url: 'https://view.asiae.co.kr/article/2025111420160597212' },
  { d: '2026.08', t: '머니투데이 · 캠프킴·국제업무지구 공급, 어디까지 왔나', url: 'https://www.mt.co.kr/estate/2026/08/04/2026080413555876709' },
  { d: '2026.11', t: '서울Pn · 용산국제업무지구 6000호 원안 사수 주장', url: 'https://go.seoul.co.kr/news/newsView.php?id=20261105500183' },
  { d: '법령', t: '일조권 수인한도 판례 정리 (동지 09~15시 연속 2시간, 08~16시 합계 4시간)', url: 'https://korea.legal/wiki/%ec%9d%bc%ec%a1%b0%ea%b6%8c/' },
  { d: '법령', t: '피난안전구역 설치 기준 (건축법 시행령 제34조)', url: 'https://04noti.com/%ED%94%BC%EB%82%9C%EC%95%88%EC%A0%84%EA%B5%AC%EC%97%AD-%EC%84%A4%EC%B9%98%EB%8C%80%EC%83%81-%EA%B7%B8%EB%A6%AC%EA%B3%A0-%EA%B5%AC%EC%A1%B0-%EB%B0%8F-%EC%86%8C%EB%B0%A9%EC%8B%9C%EC%84%A4-%EC%84%A4/' },
];

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function mount(root) {
  const S = store.get();
  let params = { ...DEFAULTS, ...(S.mass || {}) };
  if (!S.mass) store.set({ mass: params, massFrom: 'default' });
  const ui = { mode: 'use', decl: -23.44, hour: 10, view: 'bird', pick: null, block: null };
  let gen = null, agg = null, viewer = null, worker = null, reqId = 0, alive = true, analysisMs = 0;
  const $ = (id) => root.querySelector('#' + id);

  root.innerHTML = `
  <div class="page-h">
    <div><span class="label-sm">2단계 · 매스 배치</span><h1>용산국제업무지구 매스 배치안</h1>
    <p>대지 49.5만㎡를 국제업무·업무복합·업무지원(주거) 존으로 나누고, 존별 용적률과 주거 물량에 맞춰 동을 배치합니다. 층마다 층고·면적·세대수를 기록하고, 동지 일조와 한강·남산 조망, 주변 주거의 일조 변화를 함께 계산합니다.</p></div>
    <div class="actions"><a class="btn ghost" href="#/site">← 1단계 택지 선정</a><a class="btn" href="#/schedule">3단계 층별 일람표 →</a></div>
  </div>
  <div class="p-mass">
    <section class="panel m-ctl" aria-label="배치 변수">
      <div class="src-banner" id="m-src"></div>
      <div class="grp">
        <div class="sec-h"><h2>시나리오</h2><button class="chipbtn" id="m-reset" type="button">기본값</button></div>
        <div class="presets" id="m-presets"></div>
        <div style="margin-top:10px"><span class="label-sm" style="display:block;margin-bottom:6px">주거동 형식</span><div class="seg" id="m-typo" role="group" aria-label="주거동 형식"></div>
        <div class="note" id="m-typo-note" style="margin-top:6px"></div></div>
      </div>
      ${GROUPS.map(([g, nm, open]) => `<details class="grp" ${open ? 'open' : ''}><summary><span class="label-sm">${nm}</span></summary><div id="m-g-${g}"></div></details>`).join('')}
    </section>

    <section class="panel m-view" aria-label="3D 매스">
      <div class="modes">
        <div class="seg" id="m-modes" role="group" aria-label="색 표시">${MODES.map(([k, n]) => `<button type="button" data-mode="${k}" aria-pressed="${k === ui.mode}">${n}</button>`).join('')}</div>
        <span class="busy" id="m-busy" hidden>일조·조망 계산 중</span>
      </div>
      <div class="stage" id="m-stage">
        <div class="ov tl" id="m-legend"></div>
        <div class="ov tr" id="m-views">${VIEWS.map(([k, n]) => `<button class="vbtn" type="button" data-view="${k}" aria-pressed="${k === ui.view}">${n}</button>`).join('')}</div>
        <div class="pickcard" id="m-pick" hidden></div>
      </div>
      <div class="sun">
        <label for="m-season">그림자</label>
        <select id="m-season"><option value="-23.44">동지 (12월 22일)</option><option value="0">춘분 (3월 20일)</option><option value="23.44">하지 (6월 21일)</option></select>
        <input id="m-hour" type="range" min="7" max="17" step="0.25" value="${ui.hour}" aria-label="시각 (진태양시)">
        <span class="mono" id="m-hourOut"></span><span class="muted" id="m-sunOut"></span>
      </div>
      <div class="stats" id="m-stats"></div>
    </section>

    <section class="panel m-side" id="m-side" aria-label="배치 결과"></section>

    <section class="panel pad m-blocks" aria-label="블록별 밀도">
      <div class="sec-h"><h2>블록별 밀도</h2><span class="hint">행을 누르면 3D에서 해당 블록으로 이동합니다. 블록 번호는 이 모델의 배치이며 실제 획지 번호와 다릅니다.</span></div>
      <div class="tw"><table id="m-table"></table></div>
    </section>

    <section class="panel pad m-elev" aria-label="남측 입면">
      <div class="sec-h"><h2>한강에서 본 남측 입면</h2><span class="hint">실제 축척. 앞열일수록 진하게 표시. 막대에 마우스를 올리면 동 정보</span></div>
      <div class="mixleg" id="m-elev-leg" style="grid-template-columns:repeat(auto-fit,minmax(110px,max-content));margin-bottom:8px"></div>
      <div class="elev" id="m-elev"></div>
    </section>

    <section class="panel pad m-basis" aria-label="가정과 근거">
      <div class="sec-h"><h2>배치 원칙과 근거</h2></div>
      <div class="cols2">
        <div><span class="label-sm">배치·분석 가정</span><ul class="issues note" id="m-assume"></ul></div>
        <div><span class="label-sm">근거 자료</span><ul class="srcs">${SOURCES.map(x => `<li><span class="d">${x.d}</span><a href="${x.url}" target="_blank" rel="noopener">${x.t}</a></li>`).join('')}</ul></div>
      </div>
    </section>
  </div>`;

  // ---------- 변수 패널 ----------
  function ctlHTML(k) {
    const m = META[k], v = params[k], changed = Math.abs(v - DEFAULTS[k]) > 1e-9 ? ' changed' : '';
    return `<div class="ctl${changed}">
      <label for="mc-${k}">${m.label}</label>
      <span class="inbox"><input type="number" id="mn-${k}" data-k="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}" aria-label="${m.label} 값"><span class="unit">${m.unit}</span></span>
      <input type="range" id="mc-${k}" data-k="${k}" value="${v}" min="${m.min}" max="${m.max}" step="${m.step}">
      ${m.note ? `<span class="hint">${m.note}</span>` : ''}</div>`;
  }
  function renderControls() {
    GROUPS.forEach(([g]) => { $('m-g-' + g).innerHTML = Object.keys(META).filter(k => META[k].group === g).map(ctlHTML).join('') + (g === 'res' ? `<div class="note" id="m-mixnote"></div>` : ''); });
    syncControls();
  }
  function syncControls() {
    root.querySelectorAll('.m-ctl [data-k]').forEach(el => {
      const k = el.dataset.k; if (document.activeElement !== el) el.value = params[k];
      el.closest('.ctl').classList.toggle('changed', Math.abs(params[k] - DEFAULTS[k]) > 1e-9);
    });
    const pr = PRESETS.find(x => Object.entries(x.p).every(([k, v]) => params[k] === v));
    $('m-presets').innerHTML = PRESETS.map(x => `<button type="button" class="chipbtn" data-preset="${x.key}" aria-pressed="${pr === x}">${x.label}</button>`).join('');
    $('m-typo').innerHTML = TYPOLOGY.map(([k, n]) => `<button type="button" data-typo="${k}" aria-pressed="${params.typology === k}">${n}</button>`).join('');
    $('m-typo-note').textContent = { tower: '모든 주거동을 탑상형으로. 동수가 같으면 엇배치합니다.', mixed: '북측 열 탑상형, 한강 쪽 남측 열 판상형(남향 일자형).', slab: '모든 주거동을 남향 판상형으로. 일조에 유리하지만 동이 길어집니다.' }[params.typology];
    const ms = params.mix59 + params.mix84 + params.mix114;
    const mn = $('m-mixnote');
    if (mn) mn.textContent = ms === 100 ? '' : `평형 비율 합계가 ${ms}%라서 비례로 환산해 씁니다.`;
  }
  function renderSource() {
    const st = store.get(), h = st.handoff1;
    let html;
    if (h) {
      const base = massParamsFromStage1(h, DEFAULTS);
      const edited = Object.keys(base).filter(k => typeof base[k] === 'number' && Math.abs(base[k] - params[k]) > 1e-9).length + (base.typology !== params.typology ? 1 : 0);
      html = `<span class="label-sm">1단계에서 넘겨받은 값</span>
        <span>${h.siteName} · ${h.presetLabel}: <b>${fmt(h.units)}</b>세대, 평균 전용 <b>${h.avgUnit}</b>㎡, 공공임대 <b>${h.rentalShare}</b>%</span>
        <span class="note">${edited ? `넘겨받은 뒤 변수 ${edited}개를 바꿨습니다.` : '넘겨받은 값 그대로입니다.'}</span>
        ${edited ? `<span><button class="chipbtn" type="button" id="m-reapply">1단계 값 다시 적용</button></span>` : ''}`;
    } else {
      html = `<span class="label-sm">시작 값</span><span>1단계를 거치지 않아 서울시 발표안(주거 6,000호)으로 시작했습니다.</span>
        <span><a class="chipbtn" href="#/site" style="text-decoration:none;display:inline-block">1단계에서 시나리오 고르기</a></span>`;
    }
    $('m-src').innerHTML = html;
  }

  // ---------- 계산 ----------
  let raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (alive) recompute(); }); }
  function recompute() {
    gen = generate(params);
    agg = null;
    if (viewer) { viewer.setModel(gen); viewer.paint(ui.mode, agg); }
    ui.pick = null; $('m-pick').hidden = true;
    store.set({ mass: params });
    syncControls(); renderSource(); renderStats(); renderSide(); renderTable(); renderElev(); renderLegend();
    requestAnalysis();
  }
  let aTimer = 0;
  function requestAnalysis() {
    clearTimeout(aTimer);
    $('m-busy').hidden = false;
    aTimer = setTimeout(() => {
      const id = ++reqId;
      if (worker) worker.postMessage({ id, params });
      else runInline(id);
    }, 220);
  }
  function runInline(id) {
    const t0 = performance.now();
    const units = unitSamples(gen.bldgs);
    const r = analyze({ projectBoxes: projectBoxes(gen), units, ctxSamples: contextSamples() });
    const ub = new Int32Array(units.length * 3); units.forEach((u, i) => { ub[i * 3] = u.b; ub[i * 3 + 1] = u.f; ub[i * 3 + 2] = u.k; });
    onResult({ id, ok: true, ms: performance.now() - t0, ub, ...r });
  }
  function onResult(m) {
    if (!alive || m.id !== reqId) return;
    $('m-busy').hidden = true;
    if (!m.ok) { agg = null; renderSide(m.error); return; }
    analysisMs = m.ms;
    agg = aggregate(m);
    if (viewer) viewer.paint(ui.mode, agg);
    renderStats(); renderSide(); renderLegend(); if (ui.pick) renderPick();
  }
  try {
    worker = new Worker(new URL('../yongsan/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => onResult(e.data);
    worker.onerror = () => { worker = null; runInline(reqId); };
  } catch (e) { worker = null; }

  function aggregate(m) {
    const floor = new Map(), bld = new Map();
    const z = () => ({ n: 0, sun: 0, river: 0, namsan: 0 });
    const tot = { apt: z(), officetel: z(), all: z() };
    const n = m.total.length;
    for (let i = 0; i < n; i++) {
      const b = m.ub[i * 3], f = m.ub[i * 3 + 1];
      const s = meets(m.total[i], m.cont[i]) ? 1 : 0, rv = m.river[i] >= 3 ? 1 : 0, ns = m.namsan[i] ? 1 : 0;
      const kf = b * 1000 + f;
      const F = floor.get(kf) || z(); F.n++; F.sun += s; F.river += rv; F.namsan += ns; floor.set(kf, F);
      const B = bld.get(b) || z(); B.n++; B.sun += s; B.river += rv; B.namsan += ns; bld.set(b, B);
      const kind = gen.bldgs[b] && gen.bldgs[b].kind;
      [tot.all, tot[kind]].forEach(T => { if (T) { T.n++; T.sun += s; T.river += rv; T.namsan += ns; } });
    }
    const ctx = new Map(); const ct = { n: 0, before: 0, after: 0, lost: 0 };
    m.ctx.forEach(c => {
      const bo = meets(c.before.total, c.before.cont), ao = meets(c.after.total, c.after.cont);
      const e = ctx.get(c.bid) || { n: 0, before: 0, after: 0, lost: 0 };
      e.n++; ct.n++;
      if (bo) { e.before++; ct.before++; } if (ao) { e.after++; ct.after++; } if (bo && !ao) { e.lost++; ct.lost++; }
      ctx.set(c.bid, e);
    });
    return { floor, bld, tot, ctx, ct };
  }

  // 같은 두 동이 양방향으로 잡힌 경우 한 건으로
  function uniqueViolations() {
    const seen = new Map();
    gen.violations.forEach(v => { const k = [v.a, v.b].sort().join('|'); const o = seen.get(k); if (!o || v.req - v.gap > o.req - o.gap) seen.set(k, v); });
    return [...seen.values()];
  }

  // ---------- 화면: 통계 ----------
  function renderStats() {
    const t = gen.totals, p = params;
    const short = t.units - p.housingTarget;
    const lm = gen.bldgs.find(b => b.kind === 'landmark');
    const aptB = gen.bldgs.filter(b => b.kind === 'apt'), otB = gen.bldgs.filter(b => b.kind === 'officetel');
    const refuge = gen.bldgs.reduce((s, b) => s + b.floors.filter(f => f.use === 'refuge').length, 0);
    const maxB = Math.max(...gen.blocks.map(b => b.basementLv));
    const vio = uniqueViolations();
    const cells = [
      ['주거 물량', fmt(t.units) + '호', `아파트 ${fmt(t.apt)} · 오피스텔 ${fmt(t.officetel)}`, ''],
      ['목표 대비', (short >= 0 ? '+' : '−') + fmt(Math.abs(short)), `목표 ${fmt(p.housingTarget)}호`, short < -p.housingTarget * 0.02 ? 'bad' : ''],
      ['지상 연면적', man(t.gfaAbove), `지하 ${man(t.gfaBelow)}`, ''],
      ['평균 용적률', fmt(t.far, 0) + '%', `획지 ${man(t.lotArea)} 기준`, ''],
      ['최고 높이', fmt(t.maxH, 0) + 'm', lm ? `랜드마크 ${lm.storeys}층` : '', ''],
      ['주거동', `${aptB.length + otB.length}동`, `아파트 최고 ${Math.max(0, ...aptB.map(b => b.storeys))}층 · 오피스텔 ${otB.length}동`, ''],
      ['주차', fmt(t.parking) + '대', `지하 최대 ${maxB}개 층`, ''],
      ['인동간격', vio.length ? `${vio.length}건 부족` : '적합', `피난안전층 ${refuge}개 층`, vio.length ? 'bad' : ''],
    ];
    $('m-stats').innerHTML = cells.map(([k, v, s, c]) => `<div class="stat"><span class="k">${k}</span><span class="v ${c}">${v}</span><span class="s">${s}</span></div>`).join('');
  }

  // ---------- 화면: 오른쪽 결과 ----------
  function meter(label, a, n, sub, hint) {
    const v = pct(a, n);
    return `<div class="meter"><div class="row"><span>${label}</span><b>${n ? fmt(v, 1) + '%' : '—'}</b></div>
      <div class="track" role="img" aria-label="${label} ${fmt(v, 1)}%"><i style="width:${v.toFixed(1)}%"></i></div>
      <div class="sub">${n ? `${fmt(a)} / ${fmt(n)}세대` : ''}${sub ? ' · ' + sub : ''}</div>${hint ? `<div class="sub">${hint}</div>` : ''}</div>`;
  }
  function renderSide(err) {
    const t = gen.totals;
    const types = [['t59', '59㎡', '--res'], ['t84', '84㎡', '--res'], ['t114', '114㎡', '--res']];
    const segs = [...types.map(([k, n], i) => [n, t.byType[k] || 0, `color-mix(in srgb, var(--res) ${100 - i * 28}%, var(--panel))`]), ['오피스텔', t.officetel, 'var(--officetel)']];
    const tot = segs.reduce((s, x) => s + x[1], 0) || 1;
    let html = `<div class="blk"><div class="sec-h" style="margin:0"><h2>주거 구성</h2><span class="hint">공공임대 ${fmt(t.rental)}세대 (아파트의 ${params.rentalShare}%)</span></div>
      <div class="mixbar" role="img" aria-label="세대 구성">${segs.filter(x => x[1]).map(([n, v, c]) => `<i style="width:${(v / tot * 100).toFixed(2)}%;background:${c}" title="${n} ${fmt(v)}세대"></i>`).join('')}</div>
      <div class="mixleg">${segs.map(([n, v, c]) => `<div><span><i style="background:${c}"></i>${n}</span><span class="num">${fmt(v)}</span></div>`).join('')}</div></div>`;
    html += `<div class="blk"><div class="sec-h" style="margin:0"><h2>일조·조망</h2><span class="hint">${agg ? `계산 ${fmt(analysisMs / 1000, 1)}초` : err ? '' : '계산 중'}</span></div>`;
    if (err) html += `<div class="warnbox">분석을 계산하지 못했습니다: ${err}</div>`;
    else if (!agg) html += `<div class="note">세대마다 창 위치에서 태양과 한강·남산 방향으로 가림을 계산하고 있습니다.</div>`;
    else {
      const T = agg.tot;
      html += meter('일조 기준 충족 · 아파트', T.apt.sun, T.apt.n, '동지 09~15시 연속 2시간 또는 08~16시 4시간');
      html += meter('일조 기준 충족 · 오피스텔', T.officetel.sun, T.officetel.n, '오피스텔은 법정 기준 대상은 아님');
      html += meter('한강 조망 세대', T.all.river, T.all.n, '창 정면 ±60° 안에 강 수면이 3곳 이상 보임');
      html += meter('남산 조망 세대', T.all.namsan, T.all.n, 'N서울타워 꼭대기가 보임');
    }
    html += `</div>`;
    // 주변 영향
    html += `<div class="blk"><div class="sec-h" style="margin:0"><h2>주변 주거 일조 영향</h2><span class="hint">근사 맥락</span></div>`;
    if (agg) {
      const c = agg.ct;
      const byName = new Map();
      agg.ctx.forEach((e, i) => { const nm = CONTEXT[i].name; byName.set(nm, (byName.get(nm) || 0) + e.lost); });
      const worst = [...byName.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
      html += `<dl class="kv"><dt>표본 창 (남측 면, 3개 층마다)</dt><dd>${fmt(c.n)}곳</dd><dt>사업 전 기준 충족</dt><dd>${fmt(c.before)}곳</dd><dt>사업 후 기준 충족</dt><dd>${fmt(c.after)}곳</dd>
        <dt>기준 미달로 바뀜</dt><dd class="${c.lost ? 'neg' : 'pos'}">${fmt(c.lost)}곳</dd></dl>`;
      html += worst.length ? `<div class="note">가장 영향이 큰 건물: ${worst.map(([nm, v]) => `${nm} ${v}곳`).join(', ')}. 색 표시를 ‘주변 일조 영향’으로 바꾸면 3D에서 볼 수 있습니다.</div>`
        : `<div class="note">주변 주거의 기준 충족 여부가 바뀌는 곳이 없습니다.</div>`;
    } else html += `<div class="note">계산 중</div>`;
    html += `</div>`;
    // 존별 밀도
    html += `<div class="blk"><div class="sec-h" style="margin:0"><h2>존별 밀도</h2></div><div class="tw"><table><thead><tr><th style="text-align:left">존</th><th>면적</th><th>용적률</th><th>최고층</th></tr></thead><tbody>
      ${t.zones.map(z => `<tr><td style="text-align:left;font-family:var(--f-body)"><span class="zdot" style="background:var(${ZONE_TOKEN[z.key]})"></span>${z.name}</td><td>${man(z.area)}</td><td>${fmt(z.far, 0)}%</td><td>${z.maxFloors}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    // 검토 사항
    const notes = [];
    uniqueViolations().slice(0, 4)
      .forEach(v => notes.push(`<div class="warnbox">인동간격 부족: ${v.a} ↔ ${v.b} (${v.dir}) ${fmt(v.gap, 1)}m, 필요 ${fmt(v.req, 1)}m</div>`));
    gen.warnings.slice(0, 6).forEach(w => notes.push(`<div class="warnbox">${w}</div>`));
    if (gen.warnings.some(w => w.includes('세대만 배치'))) notes.push(`<div class="note">주거 최고 층수를 올리거나, 오피스텔 비율을 늘리거나, 남측 동 높이 비율을 올리면 더 담을 수 있습니다. 서울시는 이 대지의 주거 한계를 약 8,000호로 보고 있습니다.</div>`);
    html += `<div class="blk"><div class="sec-h" style="margin:0"><h2>검토 사항</h2></div><div class="warnlist">${notes.length ? notes.join('') : '<div class="okbox">목표 물량을 모두 배치했고 인동간격 위반이 없습니다.</div>'}</div></div>`;
    $('m-side').innerHTML = html;
  }

  // ---------- 범례 ----------
  function renderLegend() {
    let html;
    if (ui.mode === 'use') {
      html = [['--res', '아파트'], ['--officetel', '오피스텔'], ['--office', '업무'], ['--retail', '상업·로비·근생'], ['--refuge', '피난안전층'], ['--mech', '옥탑·기계'], ['--ctx', '주변 건물 (근사)']]
        .map(([c, n]) => `<span class="lg"><i style="background:var(${c})"></i>${n}</span>`).join('');
    } else {
      const lbl = { sun: '층별 일조 기준 충족 비율 (동지)', river: '층별 한강 조망 세대 비율', namsan: '층별 남산 조망 세대 비율', ctx: '주변 주거 창 중 기준 미달로 바뀐 비율' }[ui.mode];
      html = `<span>${lbl}</span><div class="heatbar"><div class="bar"></div><div class="ends"><span>0%</span><span>50%</span><span>100%</span></div></div>
        ${agg ? '' : '<span class="note">계산이 끝나면 색이 칠해집니다</span>'}<span class="lg"><i style="background:var(--ctx)"></i>해당 없음 (비주거 층)</span>`;
    }
    $('m-legend').innerHTML = html;
  }

  // ---------- 선택 카드 ----------
  function renderPick() {
    const card = $('m-pick');
    if (!ui.pick) { card.hidden = true; return; }
    const b = gen.bldgs[ui.pick.bi], f = b.floors[ui.pick.fi];
    const typ = b.floors.filter(x => x.use === b.floors[Math.min(b.floors.length - 2, 3)].use && !x.roof);
    const refuge = b.floors.filter(x => x.use === 'refuge');
    const a = agg && agg.bld.get(ui.pick.bi);
    const blk = gen.blocks.find(x => x.id === b.block);
    card.innerHTML = `<div class="t"><b>${b.id}</b><span class="note">${KIND[b.kind]}${b.typeName ? ' · ' + b.typeName : ''}</span><button class="x" type="button" aria-label="닫기" id="m-pickx">×</button></div>
      <dl><dt>층수 · 높이</dt><dd>지상 ${b.storeys}층 · ${fmt(b.height, 1)}m</dd>
      <dt>연면적</dt><dd>${fmt(b.gfa)}㎡</dd>
      ${b.units ? `<dt>세대</dt><dd>${fmt(b.units)} (층당 ${b.upf})</dd>` : ''}
      <dt>층고</dt><dd>1층 ${fmt(b.floors[0].h, 1)} · 기준 ${fmt(typ.length ? typ[0].h : f.h, 2)}m</dd>
      ${refuge.length ? `<dt>피난안전층</dt><dd>${refuge.map(x => x.name).join(', ')} (${fmt(refuge[0].h, 1)}m)</dd>` : ''}
      <dt>선택한 층</dt><dd>${f.name} ${USE_LABEL[f.use]} · FL +${fmt(f.y0, 1)}m</dd>
      ${a ? `<dt>일조 충족</dt><dd>${fmt(a.sun)} / ${fmt(a.n)}세대</dd><dt>한강 · 남산 조망</dt><dd>${fmt(a.river)} · ${fmt(a.namsan)}세대</dd>` : ''}
      ${blk ? `<dt>블록 ${blk.id}</dt><dd>용적률 ${fmt(blk.far, 0)}% · 지하 ${blk.basementLv}층</dd>` : ''}</dl>
      <a class="chipbtn" href="#/schedule/${encodeURIComponent(b.id)}" style="text-decoration:none;justify-self:start">층별 일람표에서 보기 →</a>`;
    card.hidden = false;
    $('m-pickx').addEventListener('click', () => { ui.pick = null; card.hidden = true; if (viewer) viewer.select(null); });
  }

  // ---------- 블록 표 ----------
  function renderTable() {
    const rows = gen.blocks.map(b => {
      const n = gen.bldgs.filter(x => x.block === b.id && x.kind !== 'basement' && x.kind !== 'podium').length;
      const z = ZONES[b.zone];
      return `<tr data-block="${b.id}" class="${ui.block === b.id ? 'on' : ''}"><td class="mono">${b.id}</td><td><span class="zdot" style="background:var(${ZONE_TOKEN[b.zone]})"></span>${z.name}</td>
        <td>${fmt(b.area)}</td><td>${fmt(b.gfaAbove)}</td><td>${fmt(b.far, 0)}%</td><td>${fmt(b.bcr, 1)}%</td><td>${n}</td><td>${b.units ? fmt(b.units) : '—'}</td>
        <td>${b.maxFloors}</td><td>${fmt(b.maxH, 0)}</td><td>B${b.basementLv}</td><td>${fmt(b.parking)}</td></tr>`;
    }).join('');
    const t = gen.totals, bl = gen.blocks;
    const sum = (k) => bl.reduce((s, b) => s + b[k], 0);
    $('m-table').innerHTML = `<thead><tr><th>블록</th><th>존</th><th>획지 면적 ㎡</th><th>지상 연면적 ㎡</th><th>용적률</th><th>건폐율</th><th>동수</th><th>세대</th><th>최고층</th><th>최고 높이 m</th><th>지하</th><th>주차 대</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td></td><td>${fmt(sum('area'))}</td><td>${fmt(sum('gfaAbove'))}</td><td>${fmt(t.far, 0)}%</td><td>${fmt(bl.reduce((s, b) => s + b.bcr * b.area, 0) / sum('area'), 1)}%</td>
        <td>${t.towers}</td><td>${fmt(t.units)}</td><td>${Math.max(...bl.map(b => b.maxFloors))}</td><td>${fmt(t.maxH, 0)}</td><td></td><td>${fmt(t.parking)}</td></tr></tfoot>`;
  }

  // ---------- 남측 입면 ----------
  function renderElev() {
    const segColor = { res: 'var(--res)', officetel: 'var(--officetel)', office: 'var(--office)', retail: 'var(--retail)', lobby: 'var(--retail)', refuge: 'var(--refuge)', mech: 'var(--mech)' };
    const maxTop = Math.max(...gen.bldgs.map(b => b.top || 0));
    const Y = Math.max(500, Math.ceil((maxTop + 30) / 50) * 50);
    const L = 48, R = 12, U0 = -600, U1 = 600, Wd = L + (U1 - U0) + R, Ht = Y + 26;
    const X = u => L + (u - U0), Yp = y => Y - y + 6;
    const list = gen.bldgs.filter(b => b.kind !== 'basement').slice().sort((a, b) => a.rect.v1 - b.rect.v1);
    const vmin = Math.min(...list.map(b => b.rect.v1)), vmax = Math.max(...list.map(b => b.rect.v1));
    const grid = [];
    for (let y = 0; y <= Y - 20; y += 100) grid.push(`<line class="grid" x1="${L}" x2="${Wd - R}" y1="${Yp(y)}" y2="${Yp(y)}"></line><text x="${L - 6}" y="${Yp(y) + 4}" text-anchor="end">${y}m</text>`);
    const blds = list.map(b => {
      const op = 0.5 + 0.5 * (b.rect.v1 - vmin) / ((vmax - vmin) || 1);
      const segs = []; let cur = null;
      b.floors.forEach(f => { if (cur && cur.use === f.use && !f.roof) cur.y1 = f.y1; else { cur = { use: f.use, y0: f.y0, y1: f.y1, roof: f.roof }; segs.push(cur); } });
      const x0 = X(b.rect.u0), w = b.rect.u1 - b.rect.u0;
      const rects = segs.map(s => { const sx = s.roof ? x0 + w * 0.2 : x0, sw = s.roof ? w * 0.6 : w; return `<rect x="${sx.toFixed(1)}" y="${Yp(s.y1).toFixed(1)}" width="${sw.toFixed(1)}" height="${Math.max(0.5, s.y1 - s.y0).toFixed(1)}" style="fill:${segColor[s.use] || 'var(--mech)'}"></rect>`; }).join('');
      return `<g opacity="${op.toFixed(2)}" style="stroke:var(--panel)" stroke-width="0.6"><title>${b.id} · ${KIND[b.kind]} · 지상 ${b.storeys}층 · ${fmt(b.height, 0)}m</title>${rects}</g>`;
    }).join('');
    const ref = (y, t) => y < Y ? `<line class="ref" x1="${L}" x2="${Wd - R}" y1="${Yp(y)}" y2="${Yp(y)}"></line><text class="reft" x="${L + 6}" y="${Yp(y) - 5}">${t}</text>` : '';
    $('m-elev').innerHTML = `<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="남측 입면 스카이라인">${grid.join('')}${blds}
      ${ref(252, '남산 정상 높이 (해발 262m)')}${ref(470, 'N서울타워 꼭대기 (해발 약 480m)')}
      <line class="gl" x1="${L}" x2="${Wd - R}" y1="${Yp(0)}" y2="${Yp(0)}"></line>
      <text x="${X(-560)}" y="${Ht - 4}">서측 (원효대교)</text><text x="${X(560)}" y="${Ht - 4}" text-anchor="end">동측 (용산역)</text></svg>`;
    $('m-elev-leg').innerHTML = [['--res', '아파트'], ['--officetel', '오피스텔'], ['--office', '업무'], ['--retail', '상업·로비'], ['--refuge', '피난안전층'], ['--mech', '옥탑·기계']]
      .map(([c, n]) => `<div><span><i style="background:var(${c})"></i>${n}</span></div>`).join('');
  }

  // ---------- 가정 ----------
  $('m-assume').innerHTML = [
    '대지는 1,150m × 430m 직사각형으로 단순화하고 한강과 나란히 20° 기울였습니다. 블록 경계·번호는 이 모델의 배치이며, 존별 획지 면적만 발표 수치(국제업무 82,938㎡, 업무복합 81,036㎡, 업무지원 93,723㎡)에 맞췄습니다.',
    '주거(업무지원존)는 서부이촌동과 맞닿은 서측 6개 블록에 둡니다. 블록마다 북측 열은 높게, 한강 쪽 남측 열은 낮게(남저북고) 두고, 동수가 같으면 엇배치합니다. 큰 평형을 북측 고층 열에 둡니다.',
    '인동간격은 창이 있는 벽이 마주볼 때 낮은 건물 높이의 0.5배(조정 가능), 최소 10m입니다. 측면은 10m입니다. 블록을 넘어 마주보는 동도 검사합니다.',
    '피난안전층은 50층 또는 200m 이상이면 30개 층마다, 30층 또는 120m 이상이면 전체 층수의 절반 부근에 둡니다. 피난안전층은 세대 없이 별도 층고로 계산합니다.',
    '층당 세대: 84·114㎡ 4호, 59㎡ 6호(탑상) 또는 판상 일자형, 오피스텔 45㎡ 10호. 기준층 면적 = 층당 전용면적 ÷ 전용률. 지하 주차는 1대당 33㎡로 층수를 산정합니다.',
    '일조: 동지 진태양시 08~16시를 10분 간격으로, 세대의 대표 창(코너 세대는 두 면) 높이에서 태양 방향으로 가림을 판정합니다. 오피스텔은 법정 일조 기준 대상이 아니지만 비교용으로 표시합니다.',
    '조망: 창 정면 ±60° 안의 한강 수면 표적 31곳 중 3곳 이상이 보이면 한강 조망, N서울타워 꼭대기가 보이면 남산 조망으로 셉니다.',
    '주변 건물(서부이촌동·이촌동·신용산·용산전자상가 등)은 위치와 층수를 근사한 모델입니다. 실제 건물 데이터를 연결하면 주변 영향 수치가 바뀝니다.',
  ].map(x => `<li>${x}</li>`).join('');

  // ---------- 이벤트 ----------
  const onCtl = (e) => {
    const el = e.target, k = el.dataset.k; if (!k) return;
    let v = parseFloat(el.value); if (!isFinite(v)) return;
    const m = META[k]; v = Math.min(m.max, Math.max(m.min, v));
    params = { ...params, [k]: v };
    const twin = el.type === 'range' ? $('mn-' + k) : $('mc-' + k); if (twin) twin.value = v;
    schedule();
  };
  root.querySelector('.m-ctl').addEventListener('input', onCtl);
  root.querySelector('.m-ctl').addEventListener('click', e => {
    const pr = e.target.closest('[data-preset]'), ty = e.target.closest('[data-typo]');
    if (pr) { params = { ...params, ...PRESETS.find(x => x.key === pr.dataset.preset).p }; schedule(); }
    if (ty) { params = { ...params, typology: ty.dataset.typo }; schedule(); }
    if (e.target.id === 'm-reset') { params = { ...DEFAULTS }; store.set({ massFrom: 'default' }); schedule(); }
    if (e.target.id === 'm-reapply') { const h = store.get().handoff1; if (h) { params = massParamsFromStage1(h, DEFAULTS); schedule(); } }
  });
  $('m-modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    ui.mode = b.dataset.mode;
    $('m-modes').querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (viewer) viewer.paint(ui.mode, agg);
    renderLegend();
  });
  $('m-views').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b && viewer) viewer.setView(b.dataset.view); });
  $('m-table').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-block]'); if (!tr) return;
    ui.block = tr.dataset.block; renderTable(); if (viewer) viewer.focusBlock(ui.block);
    $('m-stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  function updateSun() {
    const h = Math.floor(ui.hour), mi = Math.round((ui.hour - h) * 60);
    $('m-hourOut').textContent = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    const s = sunAltAz(ui.decl, ui.hour);
    $('m-sunOut').textContent = s.alt > 0 ? `태양 고도 ${fmt(s.alt, 1)}°, 방위 ${fmt(s.az, 0)}°` : '해가 진 시각';
    if (viewer) viewer.setSun(ui.decl, ui.hour);
  }
  $('m-season').addEventListener('change', e => { ui.decl = +e.target.value; updateSun(); });
  $('m-hour').addEventListener('input', e => { ui.hour = +e.target.value; updateSun(); });

  // ---------- 3D ----------
  viewer = createViewer($('m-stage'), {
    onPick: (bi, fi) => { ui.pick = bi == null ? null : { bi, fi }; renderPick(); },
    onView: (k) => { ui.view = k; $('m-views').querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === k))); },
  });
  if (!viewer) $('m-stage').insertAdjacentHTML('beforeend', '<div class="ov bl"><div class="warnbox">이 기기에서 WebGL을 쓸 수 없어 3D를 표시하지 못했습니다. 표와 입면은 그대로 쓸 수 있습니다.</div></div>');
  const onTheme = () => { if (viewer) viewer.applyTheme(); };
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', onTheme);
  const mo = new MutationObserver(onTheme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  renderControls();
  recompute();
  updateSun();

  return () => {
    alive = false; if (raf) cancelAnimationFrame(raf); clearTimeout(aTimer);
    if (worker) worker.terminate();
    mq.removeEventListener('change', onTheme); mo.disconnect();
    if (viewer) viewer.dispose();
  };
}
