// 2단계: 매스 배치 (택지 선택 → 블록·주동 형식·높이 계획·인동간격 + 일조·조망·주변 영향)
// 택지는 1단계 후보지 8곳 또는 직접 입력. 주변 맥락은 실제 지도(OpenStreetMap)를 받으면 그것으로, 아니면 자동 생성
import { DEFAULTS, META, generate, USE_LABEL, TYPOLOGIES, FORMS, RULES } from '../sim/massing.js';
import { gestureHTML, bindGesture } from '../ui/gesture-ui.js';
import { mainBuilding } from '../sim/impact.js';
import { meets, sunAltAz, analyze, unitSamples, contextSamples, projectBoxes } from '../sim/analysis.js';
import { makePlan } from '../sim/plan.js';
import { SITE_IDS, CUSTOM_DEFAULT, FABRICS, resolveSite, siteName } from '../sim/sites.js';
import { fallbackFor, osmFor, analysisBoxes } from '../sim/ctxload.js';
import { createViewer } from '../sim/viewer.js';
import { store, massParamsFromStage1, currentSite, paramsForSite } from '../store.js';
import { fmt, onThemeChange } from '../pipeline.js';
import { code, dot } from '../ui/sys.js';

export const title = '03 매스 배치';

const man = (v) => fmt(v / 1e4, 1) + '만㎡';
const pct = (a, b) => (b ? (a / b * 100) : 0);
const KIND = { apt: '아파트', officetel: '오피스텔', office: '업무', landmark: '랜드마크 (업무·호텔)', podium: '포디움 (상업·근생)', basement: '지하층' };
const ZONE_TOKEN = { intl: '--office', mixed: '--officetel', supp: '--res' };
const YS_PRESETS = [
  { key: 'seoul', label: '서울시안 6천 호', p: { housingTarget: 6000, officetelShare: 30, resMaxFloors: 55 } },
  { key: 'mid', label: '절충안 8천 호', p: { housingTarget: 8000, officetelShare: 35, resMaxFloors: 65 } },
  { key: 'gov', label: '정부안 1만 호', p: { housingTarget: 10000, officetelShare: 45, resMaxFloors: 75 } },
];
// 택지별 시나리오: 용산은 발표안 셋, 그 밖은 발표 세대수의 80·100·120%
const presetsFor = (site) => site.id === 'yongsan' ? YS_PRESETS : [0.8, 1, 1.2].map((k, i) => {
  const n = Math.max(100, Math.round(site.units * k / 50) * 50);
  return { key: 'k' + i, label: (k === 1 ? '발표 ' : k < 1 ? '저밀 ' : '고밀 ') + fmt(n) + '호', p: { housingTarget: n } };
});
// 주동 형식 평면 아이콘 (북쪽이 위)
const TYPO_ICON = {
  tower: '<rect x="4" y="3" width="11" height="11"/><rect x="19" y="12" width="11" height="11"/>',
  y: '<polygon points="15,2 19,2 19,10 27,16 24,19 17,13.5 10,19 7,16 15,10"/>',
  slab: '<rect x="3" y="9" width="28" height="8"/>',
  l: '<path d="M4 5h22v15h-7v-8H4z"/>',
  v: '<polygon points="2,5 8,3 17,15 26,3 32,5 19,22 15,22"/>',
  court: '<path d="M4 4h26v18h-8v-10H12v10H4z"/>',
  mixed: '<rect x="11" y="2" width="12" height="11"/><rect x="3" y="16" width="28" height="7"/>',
};
const TYPO_ORDER = ['tower', 'y', 'slab', 'l', 'v', 'court', 'mixed'];
// 조망 이름은 택지마다 다르다 (한강·양재천·중랑천 / 남산·청계산·불암산 …)
const modesFor = (pl) => [['real', '실사'], ['use', '용도'], ['sun', '일조'], ...(pl.views.water ? [['river', pl.views.water.name + ' 조망']] : []), ...(pl.views.peak ? [['namsan', pl.views.peak.name + ' 조망']] : []), ['ctx', '주변 영향'], ['model', '흰 모형']];
const viewsFor = (pl) => [['axon', 'AXON'], ['bird', '조감'], ['wide', '광역'], ['top', '평면'], ['street', '가로'], ...(pl.views.water ? [['river', pl.views.water.name]] : []), ['east', '동측'], ...(pl.views.peak ? [['namsan', pl.views.peak.name]] : [])];
const GROUPS = [['plan', '계획 물량', true], ['res', '주거 구성', false], ['height', '높이 계획', true], ['law', '인동간격', false], ['office', '업무·랜드마크', false], ['h', '층고', false], ['park', '주차', false]];
const YS_SOURCES = [
  { d: '2024.02', t: '서울시 · 용산국제업무지구 개발계획(안)', url: 'https://scpm.seoul.go.kr/seoul-policy/evt0019' },
  { d: '2024.02', t: '내 손안에 서울 · 용산에 100층 랜드마크, 세계 최대 수직도시', url: 'https://mediahub.seoul.go.kr/archives/2010188' },
  { d: '2025.11', t: '아시아경제 · 용산국제업무지구 10년 만에 첫 삽, 27년 말 주택분양 목표', url: 'https://view.asiae.co.kr/article/2025111420160597212' },
  { d: '2026.08', t: '머니투데이 · 캠프킴·국제업무지구 공급, 어디까지 왔나', url: 'https://www.mt.co.kr/estate/2026/08/04/2026080413555876709' },
  { d: '2026.11', t: '서울Pn · 용산국제업무지구 6000호 원안 사수 주장', url: 'https://go.seoul.co.kr/news/newsView.php?id=20261105500183' },
];
const LAW_SOURCES = [
  { d: '법령', t: '건축법 시행령 제86조 (일조 등의 확보를 위한 건축물의 높이 제한)', url: 'https://www.law.go.kr/법령/건축법시행령/제86조' },
  { d: '법령', t: '건축법 제61조 (일조 등의 확보를 위한 건축물의 높이 제한)', url: 'https://www.law.go.kr/법령/건축법/제61조' },
  { d: '법령', t: '일조권 수인한도 판례 정리 (동지 09~15시 연속 2시간, 08~16시 합계 4시간)', url: 'https://korea.legal/wiki/%ec%9d%bc%ec%a1%b0%ea%b6%8c/' },
  { d: '법령', t: '피난안전구역 설치 기준 (건축법 시행령 제34조)', url: 'https://www.law.go.kr/법령/건축법시행령/제34조' },
  { d: '지도', t: 'OpenStreetMap 기여자 · 주변 건물·도로·하천 (ODbL)', url: 'https://www.openstreetmap.org/copyright' },
];

export function mount(root) {
  const S = store.get();
  let site = currentSite(S), plan = makePlan(site), ctx = fallbackFor(plan);
  let params = { ...DEFAULTS, ...(S.mass || paramsForSite(site, DEFAULTS)) };
  delete params.site;
  if (!TYPOLOGIES[params.typology]) params.typology = DEFAULTS.typology;
  if (!S.mass) store.set({ mass: params, massFrom: 'default' });
  const ui = { mode: 'real', decl: -23.44, hour: 10, view: 'axon', pick: null, block: null };
  const map = { state: 'fallback', msg: '', ctl: null };
  let gxDrag = false; // 제스처 슬라이더를 끄는 중에는 패널을 다시 그리지 않는다
  let gen = null, agg = null, viewer = null, worker = null, reqId = 0, alive = true, analysisMs = 0;
  const gp = () => ({ ...params, site });
  const $ = (id) => root.querySelector('#' + id);

  root.innerHTML = `
  <header class="sx-head">
    <div class="sx-head-l">
      <div class="sx-meta">${code(3, 'MASS')}${dot('GENERATIVE MASSING · 공동주택')}</div>
      <h1 class="sx-title" id="m-title"></h1>
      <p class="sx-dim" id="m-dim"></p>
      <p class="sx-desc" id="m-intro"></p>
      <div class="sx-act"><a class="btn ghost" href="#/site">← 02 입지</a><a class="btn ghost" href="#/schedule">층별 일람표</a><a class="btn acc" href="#/method">04 공법·재료 <span class="ar">→</span></a></div>
    </div>
  </header>
  <section class="ws" id="m-ws" aria-label="3D 매스 작업 화면">
    <div class="stage" id="m-stage"></div>
    <div class="ov f-top"><div class="seg" id="m-modes" role="group" aria-label="색 표시"></div>
      <div class="seg" id="m-views" role="group" aria-label="시점"></div>
      <span class="busy" id="m-busy" hidden>Ray casting</span></div>
    <aside class="float f-l" id="m-fl" aria-label="배치 변수">
      <div class="f-head"><span class="label-sm">Parameters · 배치 변수</span><button type="button" data-fold="m-fl" aria-expanded="true" aria-label="변수 패널 접기">−</button></div>
      <div class="f-body m-ctl">
        <div class="grp site-pick">
          <label class="label-sm" for="m-site">택지 · site</label>
          <select id="m-site"></select>
          <div class="custom-site" id="m-custom" hidden></div>
          <div class="map-state" id="m-map" role="status"></div>
        </div>
        <div class="src-banner" id="m-src"></div>
        <div class="grp"><div class="sec-h" style="margin-bottom:8px"><span class="label-sm">Scenario</span><button class="chipbtn" id="m-reset" type="button">기본값</button></div><div class="presets" id="m-presets"></div></div>
        <div class="grp"><span class="label-sm">주동 형식</span><div class="typo" id="m-typo" role="group" aria-label="주동 형식"></div><div class="note" id="m-typo-note" style="margin-top:8px"></div></div>
        <div class="grp gx" id="m-gx"><div class="sec-h" style="margin-bottom:6px"><span class="label-sm">형태 제스처 · Form</span></div><div id="m-gxb"></div></div>
        <div class="grp"><span class="label-sm" style="display:block">용도지역 · 적용 법규</span>
          <div class="seg" id="m-zone" role="group" aria-label="업무지원존 용도지역" style="margin-top:6px"></div>
          <div class="note" id="m-zone-note" style="margin-top:6px"></div>
          <span class="label-sm" style="display:block;margin-top:10px">탑상·Y자 측면 창</span>
          <div class="seg" id="m-side-win" role="group" aria-label="측면 채광창" style="margin-top:6px"></div>
          <div class="note" id="m-sidewin-note" style="margin-top:6px"></div></div>
        ${GROUPS.map(([g, nm, open]) => `<details class="grp" ${open ? 'open' : ''}><summary><span class="label-sm">${nm}</span></summary><div id="m-g-${g}"></div></details>`).join('')}
      </div>
    </aside>
    <aside class="float f-r side" id="m-fr" aria-label="배치 결과">
      <div class="f-head"><span class="label-sm">Results · 검토 결과</span><button type="button" data-fold="m-fr" aria-expanded="true" aria-label="결과 패널 접기">−</button></div>
      <div class="f-body" id="m-side"></div>
    </aside>
    <div class="float f-leg" id="m-legend"></div>
    <div class="float f-sun"><label for="m-season" class="label-sm">Shadow</label>
      <select id="m-season"><option value="-23.44">동지 12.22</option><option value="0">춘분 3.20</option><option value="23.44">하지 6.21</option></select>
      <input id="m-hour" type="range" min="7" max="17" step="0.25" value="${ui.hour}" aria-label="시각 (진태양시)">
      <span class="mono" id="m-hourOut"></span><span class="muted" id="m-sunOut"></span></div>
    <div class="pickcard" id="m-pick" hidden></div>
  </section>
  <div class="statband"><div class="stats" id="m-stats"></div></div>
  <div class="wrap">
    <div class="sec">
      <div class="sec-title"><span class="n">02.1</span><h2>블록별 밀도</h2><span class="hint">행을 누르면 3D에서 그 블록으로 이동합니다. 블록 번호는 이 모델의 배치이며 실제 획지 번호와 다릅니다.</span></div>
      <div class="panel m-blocks"><div class="tw"><table id="m-table"></table></div></div>
    </div>
    <div class="sec">
      <div class="sec-title"><span class="n">02.2</span><h2 id="m-elev-h">남측 입면</h2><span class="hint">실제 축척. 앞열일수록 진하게. 막대에 마우스를 올리면 동 정보가 나옵니다.</span></div>
      <div class="panel pad"><div class="mixleg" id="m-elev-leg" style="grid-template-columns:repeat(auto-fit,minmax(110px,max-content));margin-bottom:10px"></div><div class="elev" id="m-elev"></div></div>
    </div>
    <div class="sec">
      <div class="sec-title"><span class="n">02.3</span><h2>배치 원칙과 근거</h2></div>
      <div class="cols2">
        <div><span class="label-sm">배치·분석 가정</span><ul class="issues" id="m-assume" style="margin-top:8px"></ul></div>
        <div><span class="label-sm">근거 자료</span><ul class="srcs" id="m-srcs"></ul></div>
      </div>
    </div>
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
    const PRESETS = presetsFor(site);
    const pr = PRESETS.find(x => Object.entries(x.p).every(([k, v]) => params[k] === v));
    $('m-presets').innerHTML = PRESETS.map(x => `<button type="button" class="chipbtn" data-preset="${x.key}" aria-pressed="${pr === x}">${x.label}</button>`).join('');
    $('m-typo').innerHTML = TYPO_ORDER.map(k => `<button type="button" data-typo="${k}" aria-pressed="${params.typology === k}" title="${TYPOLOGIES[k].name}"><svg viewBox="0 0 34 26" aria-hidden="true">${TYPO_ICON[k]}</svg>${TYPOLOGIES[k].name.replace(' 중정형', '')}</button>`).join('');
    const ty = TYPOLOGIES[params.typology];
    $('m-typo-note').textContent = params.typology === 'mixed' ? '북측 열은 탑상형, 남측 열은 판상형으로 둡니다. ' + FORMS.slab.note : FORMS[ty.rows[0]].note;
    $('m-zone').innerHTML = [['gc', '일반상업'], ['semi', '준주거']].map(([k, n]) => `<button type="button" data-zone="${k}" aria-pressed="${params.resZone === k}">${n}</button>`).join('');
    $('m-zone-note').textContent = params.resZone === 'gc'
      ? '업무지원존이 일반상업지역이면 건축법 제61조 제2항에 따라 공동주택 인동간격(시행령 86조③) 적용 대상이 아닙니다. 같은 기준을 설계 기준으로 검토합니다.'
      : '준주거지역이면 시행령 제86조 제3항이 법정 기준입니다. 같은 대지 안 동 사이는 2호 가~마목, 대지경계는 1호(높이 ≤ 경계 중심선까지 거리 × 4)를 지켜야 합니다.';
    $('m-side-win').innerHTML = [[0, '측벽 (0.5㎡ 미만 창)'], [1, '채광창 있음']].map(([k, n]) => `<button type="button" data-sidewin="${k}" aria-pressed="${params.sideWin === k}">${n}</button>`).join('');
    $('m-sidewin-note').textContent = params.sideWin ? '측면도 채광창 벽으로 보아 가목(0.5H)을 적용합니다. 동 사이가 넓어져 세대수가 줄어듭니다.' : '측면에는 0.5㎡ 미만 창만 두어 측벽으로 봅니다(마목 4m, 라목 8m).';
    if (!gxDrag) $('m-gxb').innerHTML = gestureHTML(params);
    gxDrag = false;
    const ms = params.mix59 + params.mix84 + params.mix114;
    const mn = $('m-mixnote');
    if (mn) mn.textContent = ms === 100 ? '' : `평형 비율 합계가 ${ms}%라서 비례로 환산해 씁니다.`;
  }
  function renderSource() {
    const st = store.get(), h = st.handoff1;
    let html;
    if (h && h.siteId === site.id) {
      const base = massParamsFromStage1(h, DEFAULTS);
      const edited = Object.keys(base).filter(k => typeof base[k] === 'number' && Math.abs(base[k] - params[k]) > 1e-9).length + (base.typology !== params.typology ? 1 : 0);
      html = `<span class="label-sm">From stage 01</span>
        <span>${h.siteName} · ${h.presetLabel}: <b>${fmt(h.units)}</b>세대, 평균 전용 <b>${h.avgUnit}</b>㎡, 공공임대 <b>${h.rentalShare}</b>%</span>
        <span class="note">${edited ? `넘겨받은 뒤 변수 ${edited}개를 바꿨습니다.` : '넘겨받은 값 그대로입니다.'}</span>
        ${edited ? `<span><button class="chipbtn" type="button" id="m-reapply">1단계 값 다시 적용</button></span>` : ''}`;
    } else {
      html = site.id === 'yongsan' ? `<span class="label-sm">start</span><span>1단계를 거치지 않아 서울시 발표안(주거 6,000호)으로 시작했습니다.</span>
        <span><a class="chipbtn" href="#/site">01 택지에서 시나리오 고르기</a></span>`
        : `<span class="label-sm">start</span><span>${site.name} 기본값으로 시작했습니다: 주거 <b>${fmt(site.units)}</b>호, 최고 ${site.maxFloors}층, 순주거용지 ${site.netRatio}%.</span>
        <span><a class="chipbtn" href="#/site">01 택지에서 사업성 시나리오 고르기</a></span>`;
    }
    $('m-src').innerHTML = html;
  }

  // ---------- 계산 ----------
  let raf = 0;
  function queue() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (alive) recompute(); }); }
  function recompute() {
    gen = generate(gp());
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
      if (worker) worker.postMessage({ id, params: gp(), context: analysisBoxes(ctx, plan) });
      else runInline(id);
    }, 220);
  }
  function runInline(id) {
    const t0 = performance.now();
    const units = unitSamples(gen.bldgs);
    const near = analysisBoxes(ctx, plan);
    const r = analyze({ projectBoxes: projectBoxes(gen), units, ctxSamples: contextSamples(near), context: near, plan: gen.plan });
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
    worker = new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' });
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
    gen.violations.forEach(v => { const k = [v.a, v.b].sort().join('|') + v.scope; const o = seen.get(k); if (!o || v.req - v.gap > o.req - o.gap) seen.set(k, v); });
    return [...seen.values()];
  }

  // ---------- 통계 띠 ----------
  function renderStats() {
    const t = gen.totals, p = params;
    const short = t.units - p.housingTarget;
    const lm = gen.bldgs.find(b => b.kind === 'landmark');
    const aptB = gen.bldgs.filter(b => b.kind === 'apt'), otB = gen.bldgs.filter(b => b.kind === 'officetel');
    const maxB = Math.max(...gen.blocks.map(b => b.basementLv));
    const vio = uniqueViolations(), law = vio.filter(v => v.scope === 'law');
    const sun = agg && agg.tot.apt.n ? pct(agg.tot.apt.sun, agg.tot.apt.n) : null;
    const cells = [
      ['주거 물량', fmt(t.units) + '호', `아파트 ${fmt(t.apt)} · 오피스텔 ${fmt(t.officetel)}`, ''],
      ['목표 대비', (short >= 0 ? '+' : '−') + fmt(Math.abs(short)), `목표 ${fmt(p.housingTarget)}호`, short < -p.housingTarget * 0.02 ? 'bad' : ''],
      ['지상 연면적', man(t.gfaAbove), `지하 ${man(t.gfaBelow)}`, ''],
      ['평균 용적률', fmt(t.far, 0) + '%', `획지 ${man(t.lotArea)} 기준`, ''],
      ['최고 높이', fmt(t.maxH, 0) + 'm', lm ? `랜드마크 ${lm.storeys}층` : '', ''],
      ['주거동', `${aptB.length + otB.length}동`, `아파트 최고 ${Math.max(0, ...aptB.map(b => b.storeys))}층`, ''],
      ['동지 일조 (아파트)', sun == null ? '…' : fmt(sun, 1) + '%', '연속 2시간 또는 합계 4시간', sun != null && sun < 70 ? 'bad' : ''],
      ['인동간격', law.length ? `법정 ${law.length}건 부족` : vio.length ? `권장 ${vio.length}건` : '적합', params.resZone === 'semi' ? '준주거 · 법정 기준' : '일반상업 · 설계 기준', law.length ? 'bad' : ''],
    ];
    $('m-stats').innerHTML = cells.map(([k, v, s, c]) => `<div class="stat"><span class="k">${k}</span><span class="v ${c}">${v}</span><span class="s">${s}</span></div>`).join('');
  }

  // ---------- 오른쪽 결과 ----------
  function meter(label, a, n, sub, acc) {
    const v = pct(a, n);
    return `<div class="meter${acc ? ' acc' : ''}"><div class="row"><span>${label}</span><b>${n ? fmt(v, 1) + '%' : '—'}</b></div>
      <div class="track" role="img" aria-label="${label} ${fmt(v, 1)}%"><i style="width:${v.toFixed(1)}%"></i></div>
      <div class="sub">${n ? `${fmt(a)} / ${fmt(n)}세대` : ''}${sub ? ' · ' + sub : ''}</div></div>`;
  }
  function renderSide(err) {
    const t = gen.totals;
    const segs = [['59㎡', t.byType.t59 || 0, 'color-mix(in srgb, var(--res) 45%, var(--card))'], ['84㎡', t.byType.t84 || 0, 'color-mix(in srgb, var(--res) 72%, var(--card))'], ['114㎡', t.byType.t114 || 0, 'var(--res)'], ['오피스텔', t.officetel, 'var(--officetel)']];
    const tot = segs.reduce((s, x) => s + x[1], 0) || 1;
    let html = `<div class="blk"><h3><span>주거 구성</span><span>임대 ${fmt(t.rental)}</span></h3>
      <div class="mixbar" role="img" aria-label="세대 구성">${segs.filter(x => x[1]).map(([n, v, c]) => `<i style="width:${(v / tot * 100).toFixed(2)}%;background:${c}" title="${n} ${fmt(v)}세대"></i>`).join('')}</div>
      <div class="mixleg">${segs.map(([n, v, c]) => `<div><span><i style="background:${c}"></i>${n}</span><span class="num">${fmt(v)}</span></div>`).join('')}</div></div>`;
    html += `<div class="blk"><h3><span>일조 · 조망</span><span>${agg ? `${fmt(analysisMs / 1000, 1)}초` : err ? '' : '계산 중'}</span></h3>`;
    if (err) html += `<div class="warnbox">분석을 계산하지 못했습니다: ${err}</div>`;
    else if (!agg) html += `<div class="note">세대마다 창 위치에서 태양과 조망 대상 방향으로 광선을 쏘아 가림을 계산하고 있습니다.</div>`;
    else {
      const T = agg.tot;
      html += meter('동지 일조 · 아파트', T.apt.sun, T.apt.n, '09~15시 연속 2시간 또는 08~16시 4시간', true);
      html += meter('동지 일조 · 오피스텔', T.officetel.sun, T.officetel.n, '법정 기준 대상 아님');
      if (plan.views.water) html += meter(plan.views.water.name + ' 조망', T.all.river, T.all.n, '창 정면 ±60°에 수면 3곳 이상');
      if (plan.views.peak) html += meter(plan.views.peak.name + ' 조망', T.all.namsan, T.all.n, '정상(꼭대기)이 보임');
    }
    html += `</div>`;
    // 인동간격
    const vio = uniqueViolations();
    const byRule = {}; vio.forEach(v => { const k = v.rule; byRule[k] = byRule[k] || { law: 0, design: 0 }; byRule[k][v.scope]++; });
    html += `<div class="blk"><h3><span>인동간격 · 시행령 86조③</span><span>${params.resZone === 'semi' ? '법정' : '설계 기준'}</span></h3>
      <div class="rulelist">${Object.keys(RULES).map(r => { const c = byRule[r]; const n = c ? c.law + c.design : 0; return `<div title="${RULES[r]}"><span class="r">${r}</span><span>${RULES[r].split('(')[0].slice(0, 30)}${RULES[r].length > 30 ? '…' : ''}</span><span class="c ${n ? 'neg' : ''}">${n ? n + '건' : '적합'}</span></div>`; }).join('')}</div>`;
    const top = vio.sort((a, b) => (b.scope === 'law') - (a.scope === 'law') || (b.req - b.gap) - (a.req - a.gap)).slice(0, 4);
    html += top.length ? top.map(v => `<div class="warnbox">${v.scope === 'law' ? '법정' : '권장'} ${v.rule} · ${v.a} ↔ ${v.b} (${v.dir}${v.where === 'cross' ? ', 블록 사이' : ''}) ${fmt(v.gap, 1)}m / 필요 ${fmt(v.req, 1)}m</div>`).join('')
      : `<div class="okbox">모든 주거동이 ${params.resZone === 'semi' ? '법정' : '설계'} 인동간격을 지킵니다. 블록이 다른 동 사이(도로·공원 건너)는 3호에 따라 권장 기준으로만 봅니다.</div>`;
    html += `</div>`;
    // 일조 단서 (블록별)
    if (agg) {
      const rows = gen.blocks.filter(b => b.zone === 'supp').map(bl => {
        let n = 0, s = 0; gen.bldgs.forEach((b, bi) => { if (b.block === bl.id && b.kind === 'apt') { const a = agg.bld.get(bi); if (a) { n += a.n; s += a.sun; } } });
        return { id: bl.id, n, s, r: pct(s, n) };
      }).filter(x => x.n);
      html += `<div class="blk"><h3><span>일조 단서 · 블록별</span><span>2시간 이상</span></h3>
        <div class="note">시행령 86조③ 단서: 모든 세대가 동지 연속 2시간 이상 해를 받으면 인동간격을 완화할 수 있습니다.</div>
        <div class="rulelist">${rows.map(x => `<div><span class="r">${x.id}</span><span><span class="hstack" style="display:inline-flex;width:100%;max-width:140px"><i style="width:${x.r.toFixed(1)}%;background:var(--ink)"></i></span></span><span class="c ${x.r >= 99.95 ? 'pos' : ''}">${x.r >= 99.95 ? '단서 가능' : fmt(x.r, 0) + '%'}</span></div>`).join('')}</div></div>`;
    }
    // 주변 영향
    html += `<div class="blk"><h3><span>주변 주거 일조 영향</span><span>${ctx.source === 'osm' ? '실제 지도' : ctx.source === 'preset' ? '정리한 지형' : '자동 생성 맥락'}</span></h3>`;
    if (agg) {
      const c = agg.ct;
      const byName = new Map();
      const near = analysisBoxes(ctx, plan);
      agg.ctx.forEach((e, i) => { const nm = near[i] ? near[i].name : '주변 건물'; byName.set(nm, (byName.get(nm) || 0) + e.lost); });
      const worst = [...byName.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
      html += `<dl class="kv"><dt>표본 창 (남측 면, 3개 층마다)</dt><dd>${fmt(c.n)}</dd><dt>사업 전 기준 충족</dt><dd>${fmt(c.before)}</dd><dt>사업 후 기준 충족</dt><dd>${fmt(c.after)}</dd>
        <dt>기준 미달로 바뀜</dt><dd class="${c.lost ? 'neg' : 'pos'}">${fmt(c.lost)}</dd></dl>`;
      html += worst.length ? `<div class="note">영향이 큰 곳: ${worst.map(([nm, v]) => `${nm} ${v}곳`).join(', ')}. 색 표시를 ‘주변 영향’으로 바꾸면 3D에서 보입니다.</div>`
        : `<div class="note">주변 주거의 기준 충족 여부가 바뀌는 곳이 없습니다.</div>`;
    } else html += `<div class="note">계산 중</div>`;
    html += `</div>`;
    // 존별 밀도
    html += `<div class="blk"><h3><span>존별 밀도</span></h3><div class="tw"><table><thead><tr><th style="text-align:left">존</th><th>용적률</th><th>최고층</th></tr></thead><tbody>
      ${t.zones.map(z => `<tr><td style="text-align:left;font-family:var(--f-body)"><span class="zdot" style="background:var(${ZONE_TOKEN[z.key]})"></span>${z.name}</td><td>${fmt(z.far, 0)}%</td><td>${z.maxFloors}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    // 검토 사항
    const notes = gen.warnings.slice(0, 6).map(w => `<div class="warnbox">${w}</div>`);
    if (gen.warnings.some(w => w.includes('세대만 배치'))) notes.push(`<div class="note">주거 최고 층수나 수변 앞열 층수를 올리거나, 세대가 많은 형식(탑상·ㄷ자)을 고르면 더 담을 수 있습니다.${site.id === 'yongsan' ? ' 서울시는 이 대지의 주거 한계를 약 8,000호로 봅니다.' : ''}</div>`);
    html += `<div class="blk"><h3><span>검토 사항</span></h3><div class="warnlist">${notes.length ? notes.join('') : '<div class="okbox">목표 물량을 모두 배치했습니다.</div>'}</div></div>`;
    $('m-side').innerHTML = html;
  }

  // ---------- 범례 ----------
  function renderLegend() {
    let html;
    if (ui.mode === 'real') {
      html = [['--s-glass', '유리 커튼월·창'], ['--s-w-res', '외벽 패널'], ['--s-frame', '멀리언·프레임'], ['--s-park', '조경·녹지'], ['--s-w-com', ctx.source === 'osm' ? '주변 건물 (실제 지도)' : '주변 건물 (근사)']]
        .map(([c, n]) => `<span class="lg"><i style="background:var(${c})"></i>${n}</span>`).join('') + '<span class="note">준공 후 모습 · 용도별 색은 \'용도\'</span>';
    } else if (ui.mode === 'use') {
      html = [['--res', '아파트'], ['--officetel', '오피스텔'], ['--office', '업무'], ['--retail', '상업·로비·근생'], ['--refuge', '피난안전층'], ['--mech', '옥탑·기계'], ['--s-w-com', ctx.source === 'osm' ? '주변 건물 (실제 지도)' : '주변 건물 (근사)']]
        .map(([c, n]) => `<span class="lg"><i style="background:var(${c})"></i>${n}</span>`).join('');
    } else if (ui.mode === 'model') {
      html = `<span class="lg"><i style="background:var(--model)"></i>모든 건물 흰 모형</span><span class="note">선택한 동은 주황으로 표시</span>`;
    } else {
      const lbl = { sun: '층별 동지 일조 충족 비율', river: `층별 ${plan.views.water ? plan.views.water.name : '수변'} 조망 세대 비율`, namsan: `층별 ${plan.views.peak ? plan.views.peak.name : '산'} 조망 세대 비율`, ctx: '주변 주거 창 중 기준 미달로 바뀐 비율' }[ui.mode];
      html = `<span>${lbl}</span><div class="heatbar"><div class="bar"></div><div class="ends"><span>0%</span><span>50%</span><span>100%</span></div></div>
        ${agg ? '' : '<span class="note">계산이 끝나면 색이 칠해집니다</span>'}<span class="lg"><i style="background:var(--model-na)"></i>해당 없음 (비주거 층)</span>`;
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
    card.innerHTML = `<div class="t"><b>${b.id}</b><span class="note">${KIND[b.kind]}${b.formName ? ' · ' + b.formName : ''}${b.typeName ? ' · ' + b.typeName : ''}</span><button class="x" type="button" aria-label="닫기" id="m-pickx">×</button></div>
      <dl><dt>층수 · 높이</dt><dd>지상 ${b.storeys}층 · ${fmt(b.height, 1)}m</dd>
      <dt>연면적</dt><dd>${fmt(b.gfa)}㎡</dd>
      ${b.units ? `<dt>세대</dt><dd>${fmt(b.units)} (층당 ${b.upf})</dd>` : ''}
      <dt>층고</dt><dd>1층 ${fmt(b.floors[0].h, 1)} · 기준 ${fmt(typ.length ? typ[0].h : f.h, 2)}m</dd>
      ${refuge.length ? `<dt>피난안전층</dt><dd>${refuge.map(x => x.name).join(', ')}</dd>` : ''}
      <dt>선택한 층</dt><dd>${f.name} ${USE_LABEL[f.use]} · FL +${fmt(f.y0, 1)}m</dd>
      ${a ? `<dt>일조 충족</dt><dd>${fmt(a.sun)} / ${fmt(a.n)}세대</dd><dt>${plan.views.water ? plan.views.water.name : '수변'} · ${plan.views.peak ? plan.views.peak.name : '산'} 조망</dt><dd>${fmt(a.river)} · ${fmt(a.namsan)}세대</dd>` : ''}
      ${blk ? `<dt>블록 ${blk.id}</dt><dd>용적률 ${fmt(blk.far, 0)}% · 지하 ${blk.basementLv}층</dd>` : ''}</dl>
      <a class="chipbtn go" href="#/schedule/${encodeURIComponent(b.id)}">층별 일람표에서 보기 →</a>`;
    card.hidden = false;
    $('m-pickx').addEventListener('click', () => { ui.pick = null; card.hidden = true; if (viewer) viewer.select(null); });
  }

  // ---------- 블록 표 ----------
  function renderTable() {
    const rows = gen.blocks.map(b => {
      const n = gen.bldgs.filter(x => x.block === b.id && x.kind !== 'basement' && x.kind !== 'podium').length;
      const z = gen.zones[b.zone];
      return `<tr data-block="${b.id}" class="${ui.block === b.id ? 'on' : ''}"><td class="mono">${b.id}</td><td><span class="zdot" style="background:var(${ZONE_TOKEN[b.zone]})"></span>${z.name}</td>
        <td>${fmt(b.area)}</td><td>${fmt(b.gfaAbove)}</td><td>${fmt(b.far, 0)}%</td><td>${fmt(b.bcr, 1)}%</td><td>${n}</td><td>${b.units ? fmt(b.units) : '—'}</td>
        <td>${b.maxFloors}</td><td>${fmt(b.maxH, 0)}</td><td>B${b.basementLv}</td><td>${fmt(b.parking)}</td></tr>`;
    }).join('');
    const t = gen.totals, bl = gen.blocks;
    const sum = (k) => bl.reduce((s, b) => s + b[k], 0);
    $('m-table').innerHTML = `<thead><tr><th>블록</th><th>존</th><th>획지 ㎡</th><th>지상 연면적 ㎡</th><th>용적률</th><th>건폐율</th><th>동수</th><th>세대</th><th>최고층</th><th>최고 높이 m</th><th>지하</th><th>주차 대</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td></td><td>${fmt(sum('area'))}</td><td>${fmt(sum('gfaAbove'))}</td><td>${fmt(t.far, 0)}%</td><td>${fmt(bl.reduce((s, b) => s + b.bcr * b.area, 0) / sum('area'), 1)}%</td>
        <td>${t.towers}</td><td>${fmt(t.units)}</td><td>${Math.max(...bl.map(b => b.maxFloors))}</td><td>${fmt(t.maxH, 0)}</td><td></td><td>${fmt(t.parking)}</td></tr></tfoot>`;
  }

  // ---------- 남측 입면 ----------
  function renderElev() {
    const segColor = { res: 'var(--res)', officetel: 'var(--officetel)', office: 'var(--office)', retail: 'var(--retail)', lobby: 'var(--retail)', refuge: 'var(--refuge)', mech: 'var(--mech)' };
    const maxTop = Math.max(...gen.bldgs.map(b => b.top || 0));
    const Y = Math.max(site.id === 'yongsan' ? 500 : 80, Math.ceil((maxTop + 30) / 50) * 50);
    const pad = Math.max(20, (plan.SITE.u1 - plan.SITE.u0) * 0.04);
    const L = 48, R = 12, U0 = plan.SITE.u0 - pad, U1 = plan.SITE.u1 + pad, Wd = L + (U1 - U0) + R, Ht = Y + 26;
    const X = u => L + (u - U0), Yp = y => Y - y + 6;
    const list = gen.bldgs.filter(b => b.kind !== 'basement').slice().sort((a, b) => a.rect.v1 - b.rect.v1);
    const vmin = Math.min(...list.map(b => b.rect.v1)), vmax = Math.max(...list.map(b => b.rect.v1));
    const grid = [];
    for (let y = 0; y <= Y - 20; y += 100) grid.push(`<line class="grid" x1="${L}" x2="${Wd - R}" y1="${Yp(y)}" y2="${Yp(y)}"></line><text x="${L - 6}" y="${Yp(y) + 4}" text-anchor="end">${y}m</text>`);
    const blds = list.map(b => {
      const op = 0.45 + 0.55 * (b.rect.v1 - vmin) / ((vmax - vmin) || 1);
      const segs = []; let cur = null;
      b.floors.forEach(f => { if (cur && cur.use === f.use && !f.roof && (cur.s || 1) === (f.s || 1)) cur.y1 = f.y1; else { cur = { use: f.use, y0: f.y0, y1: f.y1, roof: f.roof, s: f.s || 1 }; segs.push(cur); } });
      const cx = (b.rect.u0 + b.rect.u1) / 2, w = b.rect.u1 - b.rect.u0;
      const rects = segs.map(s => { const sw = s.roof ? w * 0.4 : w * s.s, sx = X(cx) - sw / 2; return `<rect x="${sx.toFixed(1)}" y="${Yp(s.y1).toFixed(1)}" width="${sw.toFixed(1)}" height="${Math.max(0.5, s.y1 - s.y0).toFixed(1)}" style="fill:${segColor[s.use] || 'var(--mech)'}"></rect>`; }).join('');
      return `<g opacity="${op.toFixed(2)}" style="stroke:var(--ink)" stroke-width="0.4"><title>${b.id} · ${KIND[b.kind]}${b.formName ? ' · ' + b.formName : ''} · 지상 ${b.storeys}층 · ${fmt(b.height, 0)}m</title>${rects}</g>`;
    }).join('');
    const ref = (y, t) => y < Y ? `<line class="ref" x1="${L}" x2="${Wd - R}" y1="${Yp(y)}" y2="${Yp(y)}"></line><text class="reft" x="${L + 6}" y="${Yp(y) - 5}">${t}</text>` : '';
    $('m-elev').innerHTML = `<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="남측 입면 스카이라인">${grid.join('')}${blds}
      ${site.id === 'yongsan' ? ref(252, '남산 정상 (해발 262m)') + ref(470, 'N서울타워 꼭대기 (해발 약 480m)') : plan.views.peak ? ref(plan.views.peak.pt[2], `${plan.views.peak.name} (대지 기준 약 ${fmt(plan.views.peak.pt[2])}m)`) : ''}
      <line class="gl" x1="${L}" x2="${Wd - R}" y1="${Yp(0)}" y2="${Yp(0)}"></line>
      <text x="${X(U0 + pad)}" y="${Ht - 4}">${site.id === 'yongsan' ? 'W · 원효대교' : 'W · 서쪽 끝'}</text><text x="${X(U1 - pad)}" y="${Ht - 4}" text-anchor="end">${site.id === 'yongsan' ? 'E · 용산역' : 'E · 동쪽 끝'}</text></svg>`;
    $('m-elev-leg').innerHTML = [['--res', '아파트'], ['--officetel', '오피스텔'], ['--office', '업무'], ['--retail', '상업·로비'], ['--refuge', '피난안전층'], ['--mech', '옥탑·기계']]
      .map(([c, n]) => `<div><span><i style="background:var(${c})"></i>${n}</span></div>`).join('');
  }

  // ---------- 가정 ----------
  const YS_ASSUME = [
    '대지는 1,150m × 430m 직사각형으로 단순화하고 한강과 나란히 20° 기울였습니다. 블록 경계·번호는 이 모델의 배치이며, 존별 획지 면적만 발표 수치(국제업무 82,938㎡, 업무복합 81,036㎡, 업무지원 93,723㎡)에 맞췄습니다.',
    '주동 형식 7가지: 탑상형(코어 둘레 4~6세대), Y자형(세 날개), 판상형(남향 일자), ㄱ자형(남향 동 + 동·서향 날개), V자형(두 날개를 남쪽으로 25° 벌림), ㄷ자 중정형(남쪽이 열린 중층 블록), 혼합형(북측 탑상 + 남측 판상).',
    '높이 계획: 서측(서부이촌동 쪽) 끝을 정점의 일정 비율로 낮추고 동쪽 랜드마크로 갈수록 높입니다. 한강변 앞열은 최고 층수를 따로 두고, 남측 열은 북측 열보다 낮게(남저북고), 같은 열 안에서는 높고 낮은 동을 번갈아 둡니다.',
    '인동간격(시행령 86조③ 2호): 채광창 벽이 마주보면 마주보는 건물 높이 × 계수(가목), 북측 동이 남향이고 남측 동이 낮으면 10m 이상이면서 낮은 동 높이의 0.5배(나목), 포디움과는 그 높이의 1배(다목), 채광창 없는 벽과 측벽 8m(라목), 측벽끼리 4m(마목). 간격이 모자라면 층수를 낮춥니다.',
    '블록이 다른 동 사이는 도로·공원을 건너므로 3호에 따라 가~다목을 적용하지 않고 권장 기준으로만 표시합니다. 준주거를 고르면 1호(높이 ≤ 인접 대지경계선 중심선까지 거리 × 4)도 검사합니다.',
    '피난안전층은 50층 또는 200m 이상이면 30개 층마다, 30층 또는 120m 이상이면 전체 층수의 절반 부근에 둡니다(시행령 34조). 세대 없이 별도 층고로 계산합니다.',
    '일조: 동지 진태양시 08~16시를 10분 간격으로, 세대의 대표 창(코너 세대는 두 면) 높이에서 태양 방향으로 가림을 판정합니다. 오피스텔은 법정 일조 기준 대상이 아니지만 비교용으로 표시합니다.',
    '조망: 창 정면 ±60° 안의 한강 수면 표적 31곳 중 3곳 이상이 보이면 한강 조망, N서울타워 꼭대기가 보이면 남산 조망입니다. 넓은 주변 맥락(여의도·노량진·이촌·남산 등 약 8천 동)은 화면용 근사 모델이며, 분석에는 대지 주변 근거리 맥락만 씁니다.',
  ];
  function renderAssume() {
    const S2 = plan.SITE, W = S2.u1 - S2.u0, D = S2.v1 - S2.v0;
    const list = site.id === 'yongsan' ? YS_ASSUME : [
      `대지는 ${fmt(W)}m × ${fmt(D)}m 직사각형(${fmt(site.area / 1e4, 1)}만㎡)으로 단순화하고, 장축을 동쪽에서 ${fmt(Math.abs(plan.rotDeg))}° ${plan.rotDeg >= 0 ? '남' : '북'}쪽으로 기울였습니다. 순주거용지 ${site.netRatio}%만큼 획지 ${plan.BLOCKS.length}곳을 만들고, 나머지는 단지 내 도로·공원${plan.publics.some(p => p.kind === 'school') ? '·학교' : ''}로 둡니다.`,
      `획지 사이 도로는 20m, 대지 둘레는 12m 띠로 비웁니다. 블록 번호(R 주거, M 복합)는 이 모델의 배치이며 실제 지구단위계획 획지와 다릅니다.`,
      YS_ASSUME[1], YS_ASSUME[3], YS_ASSUME[4], YS_ASSUME[5], YS_ASSUME[6],
      `조망: ${plan.views.water ? `창 정면 ±60° 안의 ${plan.views.water.name} 표적 ${plan.views.water.targets.length}곳 중 3곳 이상이 보이면 ${plan.views.water.name} 조망` : '수변 조망 대상 없음'}, ${plan.views.peak ? `${plan.views.peak.name} 정상이 보이면 ${plan.views.peak.name} 조망` : '산 조망 대상 없음'}으로 봅니다.`,
      `주변 맥락: ${ctx.source === 'osm' ? 'OpenStreetMap에서 받은 실제 건물·도로·하천·녹지입니다. 높이가 없는 건물은 층수나 용도로 추정합니다.' : '지도를 받지 못하면 택지 성격(' + (FABRICS[site.fabric] || '중층') + ')에 맞춰 도로망과 건물을 자동으로 만듭니다.'} 분석에는 대지 경계 300m 안 건물만 씁니다.`,
    ];
    $('m-assume').innerHTML = list.map(x => `<li>${x}</li>`).join('');
    $('m-srcs').innerHTML = [...(site.id === 'yongsan' ? YS_SOURCES : []), ...LAW_SOURCES].map(x => `<li><span class="d">${x.d}</span><a href="${x.url}" target="_blank" rel="noopener">${x.t}</a></li>`).join('');
  }


  // ---------- 이벤트 ----------
  const fl = $('m-fl');
  const onCtl = (e) => {
    const el = e.target, k = el.dataset.k; if (!k) return;
    let v = parseFloat(el.value); if (!isFinite(v)) return;
    const m = META[k]; v = Math.min(m.max, Math.max(m.min, v));
    params = { ...params, [k]: v };
    const twin = el.type === 'range' ? $('mn-' + k) : $('mc-' + k); if (twin) twin.value = v;
    queue();
  };
  fl.addEventListener('input', onCtl);
  bindGesture($('m-gx'), {
    get: () => params,
    onChange: (patch, slider) => { params = { ...params, ...patch }; gxDrag = !!slider; queue(); },
    main: () => (gen ? mainBuilding(gen) : null),
  });
  fl.addEventListener('click', e => {
    const pr = e.target.closest('[data-preset]'), ty = e.target.closest('[data-typo]'), zn = e.target.closest('[data-zone]'), sw = e.target.closest('[data-sidewin]');
    if (pr) { params = { ...params, ...presetsFor(site).find(x => x.key === pr.dataset.preset).p }; queue(); }
    if (ty) { params = { ...params, typology: ty.dataset.typo }; queue(); }
    if (zn) { params = { ...params, resZone: zn.dataset.zone }; queue(); }
    if (sw) { params = { ...params, sideWin: +sw.dataset.sidewin }; queue(); }
    if (e.target.id === 'm-reset') { params = paramsForSite(site, DEFAULTS); store.set({ massFrom: 'default' }); queue(); }
    if (e.target.id === 'm-reapply') { const h = store.get().handoff1; if (h) { params = massParamsFromStage1(h, DEFAULTS); queue(); } }
    if (e.target.id === 'm-map-retry') loadMap(true);
    if (e.target.id === 'm-map-off') { store.set({ useMap: false }); ctx = fallbackFor(plan); if (viewer) viewer.setContext(ctx); map.state = 'off'; renderMap(); requestAnalysis(); renderAssume(); }
  });
  root.querySelectorAll('[data-fold]').forEach(btn => btn.addEventListener('click', () => {
    const panel = $(btn.dataset.fold), off = !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', off);
    btn.textContent = off ? '+' : '−'; btn.setAttribute('aria-expanded', String(!off));
    $('m-ws').classList.toggle(btn.dataset.fold === 'm-fl' ? 'l-off' : 'r-off', off);
  }));
  // ---------- 택지 ----------
  function renderSitePick() {
    const ids = SITE_IDS.includes(site.id) || site.id === 'custom' ? SITE_IDS : [site.id, ...SITE_IDS];
    $('m-site').innerHTML = ids.map(id => `<option value="${id}">${id === site.id ? site.name : siteName(id)}${SITE_IDS.includes(id) ? '' : ' · 전국 후보'}</option>`).join('') + '<option value="custom">직접 입력 …</option>';
    $('m-site').value = site.id === 'custom' ? 'custom' : site.id;
    const c = $('m-custom');
    c.hidden = site.id !== 'custom';
    if (site.id === 'custom') {
      const f = [['lat', '위도', 0.0001], ['lng', '경도', 0.0001], ['area', '면적 ㎡', 1000], ['aspect', '장단변비', 0.1], ['rot', '장축 각도 °', 1], ['units', '계획 세대', 50], ['maxFloors', '최고 층수', 1], ['netRatio', '순주거용지 %', 1]];
      c.innerHTML = f.map(([k, n, st]) => `<label><span>${n}</span><input type="number" data-cs="${k}" step="${st}" value="${site[k]}"></label>`).join('')
        + `<label><span>용도지역</span><select data-cs="zoning"><option value="semi"${site.zoning === 'semi' ? ' selected' : ''}>준주거·주거</option><option value="gc"${site.zoning === 'gc' ? ' selected' : ''}>일반상업</option></select></label>`
        + `<label><span>주변 성격</span><select data-cs="fabric">${Object.entries(FABRICS).map(([k, n]) => `<option value="${k}"${site.fabric === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`
        + `<span class="note">위경도는 지도에서 대지 중심을 찍어 넣으세요. 바꾸면 블록 배치와 주변 지도를 다시 만듭니다.</span>`;
    }
  }
  function renderMap() {
    const el = $('m-map'); if (!el) return;
    const t = { loading: `<span class="dot busy"></span>실제 지도 받는 중 · ${map.msg || ''}`, osm: `<span class="dot on"></span>실제 지도 (OpenStreetMap)${ctx.cached ? ' · 저장본' : ''}`,
      fallback: `<span class="dot"></span>${ctx.source === 'preset' ? '정리한 지형(용산)' : '자동 생성 맥락'}`, failed: `<span class="dot off"></span>지도 서버에 연결하지 못해 ${ctx.source === 'preset' ? '정리한 지형' : '자동 생성 맥락'}을 씁니다`, off: `<span class="dot"></span>지도 끔 · ${ctx.source === 'preset' ? '정리한 지형' : '자동 생성 맥락'}` }[map.state] || '';
    const st = viewer && viewer.stats;
    el.innerHTML = `<span class="ms">${t}</span>${st ? `<span class="note">건물 ${fmt(st.buildings)} · 도로 ${fmt(st.roads)} · 수목 ${fmt(st.trees)}</span>` : ''}
      <span class="ma">${map.state === 'osm' ? `<button type="button" class="chipbtn" id="m-map-off">지도 끄기</button>` : map.state === 'loading' ? '' : `<button type="button" class="chipbtn" id="m-map-retry">실제 지도 받기</button>`}</span>`;
  }
  async function loadMap(force) {
    if (map.ctl) map.ctl.abort();
    if (!force && store.get().useMap === false) { map.state = 'off'; renderMap(); return; }
    if (force) store.set({ useMap: true });
    const ctl = new AbortController(); map.ctl = ctl;
    const pl = plan;
    map.state = 'loading'; map.msg = ''; renderMap();
    try {
      const c = await osmFor(pl, { signal: ctl.signal, onStep: (m) => { map.msg = m; if (map.ctl === ctl) renderMap(); } });
      if (!alive || pl !== plan || map.ctl !== ctl) return;
      ctx = c; map.state = 'osm';
      if (viewer) viewer.setContext(ctx);
      requestAnalysis(); renderAssume(); renderLegend();
    } catch (e) {
      if (!alive || pl !== plan || map.ctl !== ctl) return;
      map.state = 'failed'; map.msg = String(e && e.message || e);
    }
    renderMap();
  }
  function applySite(sel, resetParams) {
    store.set({ site: sel });
    site = resolveSite(sel, store.get().use || 'housing'); plan = makePlan(site); ctx = fallbackFor(plan);
    if (resetParams) { params = paramsForSite(site, DEFAULTS); store.set({ massFrom: 'default' }); }
    if (viewer) viewer.setPlan(plan, ctx);
    if (!plan.views.water && ui.mode === 'river') ui.mode = 'use';
    if (!plan.views.peak && ui.mode === 'namsan') ui.mode = 'use';
    renderHeader(); renderSitePick(); renderAssume(); map.state = 'fallback'; renderMap();
    recompute();
    if (viewer) viewer.setView('axon');
    loadMap(false);
  }
  function renderHeader() {
    const zs = Object.values(makePlan(site).ZONES).map(z => z.name.split('(')[0].trim());
    $('m-title').innerHTML = `${site.name}<span class="pd">.</span>`;
    $('m-dim').textContent = `매스 배치 · 대지 ${fmt(site.area / 1e4, 1)}만㎡ · ${site.region || site.gu || '서울'}`;
    $('m-intro').textContent = site.id === 'yongsan'
      ? '대지 49.5만㎡를 국제업무·업무복합·업무지원(주거) 존으로 나누고, 주동 형식과 높이 계획에 맞춰 동을 놓습니다. 인동간격은 건축법 시행령 제86조 제3항으로 검토하고, 모든 세대의 동지 일조와 한강·남산 조망, 주변 주거의 일조 변화를 계산합니다.'
      : `${site.gu ? site.gu + ' ' + site.dong + ' · ' : ''}대지를 ${zs.join('·')}으로 나누고 획지 ${plan.BLOCKS.length}곳에 주동을 놓습니다. 인동간격은 건축법 시행령 제86조 제3항으로 검토하고, 모든 세대의 동지 일조${plan.views.water ? '와 ' + plan.views.water.name : ''}${plan.views.peak ? '·' + plan.views.peak.name : ''} 조망, 주변 주거의 일조 변화를 계산합니다.`;
    $('m-modes').innerHTML = modesFor(plan).map(([k, n]) => `<button type="button" data-mode="${k}" aria-pressed="${k === ui.mode}">${n}</button>`).join('');
    $('m-views').innerHTML = viewsFor(plan).map(([k, n]) => `<button type="button" data-view="${k}" aria-pressed="${k === ui.view}">${n}</button>`).join('');
    $('m-elev-h').textContent = plan.views.water ? `${plan.views.water.name} 쪽에서 본 남측 입면` : '남측 입면';
    document.title = `03 매스 배치 · ${site.name}`;
  }
  $('m-site').addEventListener('change', e => {
    const id = e.target.value;
    if (id === 'custom') applySite({ ...CUSTOM_DEFAULT, id: 'custom' }, true);
    else applySite({ id }, true);
  });
  let csT = 0;
  $('m-custom').addEventListener('change', e => {
    const k = e.target.dataset.cs; if (!k) return;
    const v = e.target.tagName === 'SELECT' ? e.target.value : parseFloat(e.target.value);
    if (typeof v === 'number' && !isFinite(v)) return;
    const lim = { lat: [33, 39], lng: [124, 132], area: [3000, 3000000], aspect: [1, 4], rot: [-60, 60], units: [100, 30000], maxFloors: [5, 80], netRatio: [10, 100] }[k];
    const val = lim ? Math.min(lim[1], Math.max(lim[0], v)) : v;
    const sel = { ...CUSTOM_DEFAULT, ...(store.get().site || {}), id: 'custom', [k]: val };
    clearTimeout(csT); csT = setTimeout(() => applySite(sel, ['units', 'maxFloors', 'zoning'].includes(k)), 150);
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
    $('m-ws').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  function updateSun() {
    const h = Math.floor(ui.hour), mi = Math.round((ui.hour - h) * 60);
    $('m-hourOut').textContent = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    const s = sunAltAz(ui.decl, ui.hour);
    $('m-sunOut').textContent = s.alt > 0 ? `고도 ${fmt(s.alt, 1)}° · 방위 ${fmt(s.az, 0)}°` : '해가 진 시각';
    if (viewer) viewer.setSun(ui.decl, ui.hour);
  }
  $('m-season').addEventListener('change', e => { ui.decl = +e.target.value; updateSun(); });
  $('m-hour').addEventListener('input', e => { ui.hour = +e.target.value; updateSun(); });

  // ---------- 3D ----------
  viewer = createViewer($('m-stage'), {
    onPick: (bi, fi) => { ui.pick = bi == null ? null : { bi, fi }; renderPick(); },
    onView: (k) => { ui.view = k; $('m-views').querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === k))); },
  });
  if (viewer) viewer.setPlan(plan, ctx);
  if (!viewer) $('m-stage').insertAdjacentHTML('beforeend', '<div class="ov" style="left:14px;right:14px;top:60px"><div class="warnbox">이 기기에서 WebGL을 쓸 수 없어 3D를 표시하지 못했습니다. 표와 입면은 그대로 쓸 수 있습니다.</div></div>');
  const offTheme = onThemeChange(() => { if (viewer) viewer.applyTheme(); });

  renderHeader(); renderSitePick(); renderAssume(); renderMap();
  renderControls();
  recompute();
  updateSun();
  loadMap(false);

  return () => {
    alive = false; if (raf) cancelAnimationFrame(raf); clearTimeout(aTimer); clearTimeout(csT); if (map.ctl) map.ctl.abort();
    if (worker) worker.terminate();
    offTheme();
    if (viewer) viewer.dispose();
  };
}
