// 처음 화면: 3D 엑소노 히어로 + 단계 노드 다이어그램 + 데이터 흐름 매트릭스
import { createViewer } from '../yongsan/viewer.js';
import { pipeline, fmt, won, onThemeChange } from '../pipeline.js';
import { dateAt, ym } from '../yongsan/process.js';
import { TYPOLOGIES } from '../yongsan/massing.js';
import { store } from '../store.js';

export const title = '처음';

// ---------- 작은 등각 도해 ----------
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
const P = (x, y, z, ox, oy, k) => [ox + (x - y) * C30 * k, oy + (x + y) * S30 * k - z * k];
const pts = (a) => a.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
function isoBox(x, y, w, d, h, o, cls = 'fig-fill') {
  const { ox, oy, k } = o;
  const q = (a, b, c) => P(a, b, c, ox, oy, k);
  const top = [q(x, y, h), q(x + w, y, h), q(x + w, y + d, h), q(x, y + d, h)];
  const left = [q(x, y + d, 0), q(x + w, y + d, 0), q(x + w, y + d, h), q(x, y + d, h)];
  const right = [q(x + w, y, 0), q(x + w, y + d, 0), q(x + w, y + d, h), q(x + w, y, h)];
  return `<polygon class="${cls}" points="${pts(right)}" style="fill:color-mix(in srgb, var(--card) 80%, var(--ink))"/><polygon class="${cls}" points="${pts(left)}"/><polygon class="${cls}" points="${pts(top)}"/>`;
}
function figSite() {
  const dots = [[40, 52, 5], [62, 88, 4], [88, 40, 6], [110, 72, 5], [134, 50, 4], [148, 98, 6], [72, 116, 4]];
  return `<svg viewBox="0 0 200 150" aria-hidden="true">
    <path class="fig-dash" d="M10 108 C 50 90, 80 128, 120 104 S 180 84, 196 96" style="stroke:var(--water);stroke-dasharray:none;stroke-width:6;opacity:1"/>
    ${dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" class="fig-fill"/>`).join('')}
    <circle cx="110" cy="72" r="5" class="fig-acc"/><circle cx="110" cy="72" r="15" class="fig-acc-l"/>
    <path class="fig-dash" d="M122 63 L150 30 L172 30"/><rect x="150" y="18" width="44" height="12" style="fill:var(--ink)"/><text x="172" y="27" text-anchor="middle" style="font-family:var(--f-mono);font-size:7px;fill:var(--paper)">YONGSAN</text>
    <text class="fig-t" x="10" y="20">8 SITES · SCORE</text></svg>`;
}
function figMass() {
  const o = { ox: 96, oy: 66, k: 1.05 };
  const bx = [[-40, -40, 14, 14, 30], [-20, -40, 14, 14, 44], [0, -40, 14, 14, 36], [-40, -14, 14, 14, 22], [-20, -14, 14, 14, 30], [22, -38, 18, 18, 52], [6, -12, 14, 14, 26], [28, -10, 14, 14, 70]];
  const order = bx.slice().sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  const ground = [P(-50, -50, 0, o.ox, o.oy, o.k), P(52, -50, 0, o.ox, o.oy, o.k), P(52, 12, 0, o.ox, o.oy, o.k), P(-50, 12, 0, o.ox, o.oy, o.k)];
  const lm = P(35, -3, 70, o.ox, o.oy, o.k);
  return `<svg viewBox="0 0 200 150" aria-hidden="true"><polygon points="${pts(ground)}" class="fig-mute"/>
    ${order.map(b => isoBox(...b, o)).join('')}
    <path class="fig-dash" d="M${lm[0].toFixed(1)} ${lm[1].toFixed(1)} L${(lm[0] + 26).toFixed(1)} ${(lm[1] - 12).toFixed(1)} L${(lm[0] + 40).toFixed(1)} ${(lm[1] - 12).toFixed(1)}"/>
    <circle cx="${lm[0].toFixed(1)}" cy="${lm[1].toFixed(1)}" r="2" style="fill:var(--ink)"/>
    <rect x="${(lm[0] + 26).toFixed(1)}" y="${(lm[1] - 24).toFixed(1)}" width="46" height="12" style="fill:var(--accent)"/>
    <text x="${(lm[0] + 49).toFixed(1)}" y="${(lm[1] - 15).toFixed(1)}" text-anchor="middle" style="font-family:var(--f-mono);font-size:7px;fill:#fff">100F</text></svg>`;
}
function figStack() {
  const o = { ox: 92, oy: 128, k: 1 };
  let s = '';
  const lv = [0, 16, 32, 48, 64, 80];
  lv.forEach((z, i) => {
    const zz = 12 + z;
    const ref = i === 3;
    const q = (x, y) => P(x, y, zz, o.ox, o.oy, o.k);
    const top = [q(-30, -30), q(30, -30), q(30, 10), q(-30, 10)];
    s += `<polygon points="${pts(top)}" class="fig-fill" ${ref ? 'style="fill:var(--accent)"' : ''}/>`;
    const a = q(-30, 10);
    s += `<text class="fig-t" x="${(a[0] - 6).toFixed(1)}" y="${(a[1] + 3).toFixed(1)}" text-anchor="end">L${String(i + 1).padStart(2, '0')}</text>`;
  });
  [[30, -30], [30, 10], [-30, 10]].forEach(([x, y]) => { const a = P(x, y, 92, o.ox, o.oy, o.k), b = P(x, y, 12, o.ox, o.oy, o.k); s += `<line class="fig-dash" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`; });
  return `<svg viewBox="0 0 200 150" aria-hidden="true">${s}<text class="fig-t" x="150" y="140">FL · H · ㎡</text></svg>`;
}
function figGantt() {
  const rows = [[8, 40], [20, 70], [34, 96], [52, 120], [70, 150], [96, 180]];
  let s = '';
  for (let x = 10; x <= 190; x += 15) s += `<line x1="${x}" y1="20" x2="${x}" y2="130" style="stroke:var(--hair)"/>`;
  rows.forEach(([a, b], i) => { const y = 28 + i * 16; s += `<rect x="${a + 10}" y="${y}" width="${b - a}" height="8" style="fill:${i % 2 ? 'var(--ink)' : 'var(--accent)'};opacity:${i % 2 ? .85 : 1}"/>`; });
  s += `<line x1="112" y1="16" x2="112" y2="134" style="stroke:var(--accent);stroke-width:1.5"/><rect x="96" y="6" width="32" height="10" style="fill:var(--accent)"/><text x="112" y="14" text-anchor="middle" style="font-family:var(--f-mono);font-size:7px;fill:#fff">NOW</text>`;
  return `<svg viewBox="0 0 200 150" aria-hidden="true">${s}<text class="fig-t" x="10" y="146">2028 — 2033</text></svg>`;
}
function figCurve() {
  let s = '';
  const n = 16, xs = (i) => 16 + i * 11;
  const val = (i) => Math.sin(Math.PI * (i + 0.5) / n);
  for (let i = 0; i < n; i++) { const h = val(i) * 40; s += `<rect x="${xs(i)}" y="${(130 - h).toFixed(1)}" width="8" height="${h.toFixed(1)}" style="fill:var(--sunk);stroke:var(--line)"/>`; }
  let c = 0; const tot = Array.from({ length: n }, (_, i) => val(i)).reduce((a, b) => a + b, 0);
  const pth = Array.from({ length: n }, (_, i) => { c += val(i); return `${i ? 'L' : 'M'}${(xs(i) + 4).toFixed(1)} ${(130 - c / tot * 100).toFixed(1)}`; }).join(' ');
  s += `<path d="${pth}" style="fill:none;stroke:var(--ink);stroke-width:1.6"/><circle cx="${xs(10) + 4}" cy="${(130 - 0.75 * 100).toFixed(1)}" r="3" style="fill:var(--accent)"/>`;
  return `<svg viewBox="0 0 200 150" aria-hidden="true"><line x1="12" y1="130" x2="192" y2="130" style="stroke:var(--ink)"/>${s}<text class="fig-t" x="12" y="20">S-CURVE · 기성 누계</text></svg>`;
}

// ---------- 데이터 흐름 매트릭스 ----------
// 0 없음 · 1 만듦 · 2 받아 씀 · 3 자동 계산(분석)
const FLOW = [
  ['후보지 점수·사업성', [1, 0, 0, 0, 2]],
  ['세대수·평형·임대 비율', [1, 2, 0, 0, 0]],
  ['블록·동 배치, 주동 형식', [0, 1, 2, 2, 2]],
  ['인동간격 법규 검토', [0, 3, 0, 0, 0]],
  ['일조·조망·주변 영향', [0, 3, 0, 0, 0]],
  ['층고·FL·바닥면적', [0, 1, 2, 2, 2]],
  ['외벽·굴토·흙막이 물량', [0, 0, 3, 2, 2]],
  ['층별 골조 사이클·공기', [0, 0, 0, 1, 2]],
  ['4D 층 상태·크레인', [0, 0, 0, 3, 0]],
  ['월별 기성·S커브', [0, 0, 0, 0, 3]],
  ['1단계 개략 공사비', [1, 0, 0, 0, 2]],
];
function matrixSVG() {
  const L = 190, cw = 92, rh = 26, top = 34, W = L + cw * 5 + 20, H = top + rh * FLOW.length + 10;
  const cx = (i) => L + cw * i + cw / 2;
  let s = '';
  ['01 택지', '02 매스', '03 일람표', '04 공정', '05 예산'].forEach((t, i) => { s += `<text class="hd" x="${cx(i)}" y="16" text-anchor="middle">${t}</text>`; s += `<line class="gl" x1="${cx(i)}" y1="24" x2="${cx(i)}" y2="${H - 6}"/>`; });
  FLOW.forEach(([name, v], r) => {
    const y = top + r * rh + rh / 2;
    s += `<line class="gl" x1="0" y1="${y + rh / 2}" x2="${W}" y2="${y + rh / 2}"/>`;
    s += `<text class="rowl" x="0" y="${y + 4}">${name}</text>`;
    const on = v.map((x, i) => [x, i]).filter(([x]) => x);
    if (on.length > 1) s += `<line class="ln" x1="${cx(on[0][1])}" y1="${y}" x2="${cx(on[on.length - 1][1])}" y2="${y}"/>`;
    on.forEach(([x, i]) => { s += `<circle class="${x === 1 ? 'pr' : x === 2 ? 'cs' : 'ai'}" cx="${cx(i)}" cy="${y}" r="${x === 2 ? 4.5 : 5.5}"><title>${name} · ${['', '만듦', '받아 씀', '자동 계산'][x]}</title></circle>`; });
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="max-width:${Math.round(W * 1.2)}px" role="img" aria-label="단계별 데이터 흐름: 어느 단계가 값을 만들고 어느 단계가 받아 쓰는지">${s}</svg>`;
}

export function mount(root) {
  const R = pipeline();
  const { gen, S, E, mp } = R;
  const t = gen.totals;
  const h1 = store.get().handoff1;
  const lm = gen.bldgs.find(b => b.kind === 'landmark');
  const stage1Cost = h1 && h1.stage1 ? h1.stage1.next_stage_inputs.budget.construction_cost_eok * 1e4 : null;

  root.innerHTML = `
  <section class="hero" aria-label="소개">
    <div class="stage" id="h-stage"></div>
    <div class="hero-txt">
      <span class="label-sm"><span class="tagbox">BIM · AI</span>CONSTRUCTION SIMULATOR</span>
      <h1>용산국제업무지구<br>택지에서 <em>예산</em>까지</h1>
      <p>서울 공동주택 택지 8곳을 비교하고, 용산 49.5만㎡에 동을 배치해 인동간격·일조·조망을 계산합니다. 그 결과를 층별 물량으로 펼쳐 4D 공정과 5D 예산까지 이어서 시뮬레이션합니다. 한 단계의 변수를 바꾸면 뒤 단계가 모두 다시 계산됩니다.</p>
      <div class="actions"><a class="btn" href="#/site">01 택지 선정부터 시작 <span class="ar">→</span></a><a class="btn ghost" href="#/mass">02 매스 배치 열기</a></div>
    </div>
    <nav class="hero-strip" aria-label="단계별 현재 결과">
      <a href="#/site"><span class="k">01 · Site</span><span class="v">${h1 ? h1.siteName.replace('국제업무지구', '') : '8 후보지'}</span><span class="s">${h1 ? h1.presetLabel : '사업성·입지·추진 안정성 비교'}</span></a>
      <a href="#/mass"><span class="k">02 · Mass</span><span class="v">${fmt(t.units)}호</span><span class="s">${TYPOLOGIES[mp.typology].name} · 최고 ${lm ? lm.storeys + '층 ' + fmt(lm.height, 0) + 'm' : fmt(t.maxH, 0) + 'm'}</span></a>
      <a href="#/schedule"><span class="k">03 · Schedule</span><span class="v">${fmt((t.gfaAbove + t.gfaBelow) / 1e4, 1)}만㎡</span><span class="s">${t.towers}개 동 · 지상 ${fmt(gen.bldgs.reduce((s, b) => s + b.floors.filter(f => f.lv > 0).length, 0))}개 층</span></a>
      <a href="#/process"><span class="k">04 · 4D</span><span class="v">${S.months}개월</span><span class="s">${ym(S.t0)} → ${ym(dateAt(S.t0, S.end))}</span></a>
      <a href="#/budget"><span class="k">05 · 5D</span><span class="v">${won(E.total)}</span><span class="s">평당 ${fmt(E.perPy, 0)}만원 · 물가상승 포함</span></a>
    </nav>
  </section>

  <div class="wrap">
    <div class="sec">
      <div class="sec-title"><span class="n">PIPELINE</span><h2>다섯 단계, 하나의 모델</h2><span class="hint">각 단계는 앞 단계가 넘긴 값으로 시작합니다. 점선은 다음 단계로 넘어가는 데이터입니다.</span></div>
      <div class="pipe">
        <article class="node"><div class="nh"><span class="tagbox">01 · Site</span></div><div class="fig">${figSite()}</div>
          <h3>택지 선정</h3><p>개발이 거론되는 서울 택지 8곳의 사업성·입지·추진 안정성을 같은 기준으로 점수화합니다.</p>
          <ul><li><span>비교 후보지</span><b>8곳</b></li><li><span>평가 축</span><b>5개 가중치</b></li></ul>
          <span class="pass">세대수 · 평형 · 임대 비율</span><a class="more" href="#/site">택지 비교 열기</a></article>
        <article class="node"><div class="nh"><span class="tagbox">02 · Mass</span></div><div class="fig">${figMass()}</div>
          <h3>매스 배치</h3><p>7가지 주동 형식과 높이 계획으로 동을 놓고, 인동간격 법규와 동지 일조·한강·남산 조망을 계산합니다.</p>
          <ul><li><span>주거</span><b>${fmt(t.units)}호</b></li><li><span>동수</span><b>${t.towers}동</b></li><li><span>인동간격 부족</span><b>${gen.violations.filter(v => v.scope === 'law').length}건</b></li></ul>
          <span class="pass">동 · 층 형상</span><a class="more" href="#/mass">매스 배치 열기</a></article>
        <article class="node"><div class="nh"><span class="tagbox">03 · Schedule</span></div><div class="fig">${figStack()}</div>
          <h3>층별 일람표</h3><p>모든 동을 층 단위로 펼쳐 층고·FL·바닥면적·세대·외벽 면적과 지하 굴토 물량을 정리합니다.</p>
          <ul><li><span>연면적</span><b>${fmt((t.gfaAbove + t.gfaBelow) / 1e4, 1)}만㎡</b></li><li><span>외벽</span><b>${fmt(R.Q.facade / 1e4, 1)}만㎡</b></li><li><span>굴토</span><b>${fmt(R.Q.excavation / 1e4, 0)}만㎥</b></li></ul>
          <span class="pass">층별 물량</span><a class="more" href="#/schedule">일람표 열기</a></article>
        <article class="node"><div class="nh"><span class="tagbox">04 · 4D</span></div><div class="fig">${figGantt()}</div>
          <h3>4D 공정</h3><p>블록별 흙막이·굴토·기초, 동별 층 단위 골조 사이클과 외장·마감을 작업일 달력으로 계산해 3D로 재생합니다.</p>
          <ul><li><span>공기</span><b>${S.months}개월</b></li><li><span>착공</span><b>${ym(S.t0)}</b></li><li><span>준공</span><b>${ym(dateAt(S.t0, S.end))}</b></li></ul>
          <span class="pass">공정 일정 · 월별 진척</span><a class="more" href="#/process">4D 공정 열기</a></article>
        <article class="node"><div class="nh"><span class="tagbox acc">05 · 5D</span></div><div class="fig">${figCurve()}</div>
          <h3>5D 예산</h3><p>층별 물량에 공종 단가를 곱하고 공정에 얹어 월별 기성과 누계 S커브, 물가상승까지 계산합니다.</p>
          <ul><li><span>총공사비</span><b>${won(E.total)}</b></li><li><span>평당</span><b>${fmt(E.perPy, 0)}만원</b></li>${stage1Cost ? `<li><span>1단계 개략 대비</span><b>${E.total >= stage1Cost ? '+' : '−'}${fmt(Math.abs(E.total / stage1Cost - 1) * 100, 0)}%</b></li>` : `<li><span>최대 월 기성</span><b>${won(E.peak.total)}</b></li>`}</ul>
          <span class="pass">예산 · 현금흐름</span><a class="more" href="#/budget">5D 예산 열기</a></article>
      </div>
    </div>

    <div class="sec">
      <div class="sec-title"><span class="n">DATA FLOW</span><h2>어느 단계가 무엇을 만들고 쓰는가</h2><span class="hint">검은 점은 그 단계가 만드는 값, 빈 점은 받아 쓰는 값, 주황 점은 모델이 자동으로 계산하는 분석입니다.</span></div>
      <div class="matrix">${matrixSVG()}
        <div class="matrix-leg"><span><i class="f"></i>만듦</span><span><i></i>받아 씀</span><span><i class="a"></i>자동 계산 (법규 검토·광선 추적·공정 상태·현금흐름)</span></div></div>
    </div>

    <div class="sec">
      <div class="sec-title"><span class="n">METHOD</span><h2>계산 방식</h2></div>
      <div class="method">
        <div><span class="label-sm">Rule-based massing</span><h3>법규를 지키는 배치</h3><p>건축법 시행령 제86조 제3항(인동간격 가~마목, 1호·3호)과 법 제61조 제2항의 일반상업지역 예외를 반영합니다. 높이 계획(서측 저층, 한강 앞열, 남저북고, 높이 리듬)을 먼저 정하고 간격이 모자라면 층수를 낮춥니다.</p></div>
        <div><span class="label-sm">Ray casting</span><h3>세대별 일조·조망</h3><p>모든 세대의 창 위치에서 동지 08~16시 태양, 한강 수면 31곳, N서울타워 꼭대기를 향해 광선을 쏘아 가림을 판정합니다. 계산은 백그라운드 작업자에서 돌려 화면이 멈추지 않습니다.</p></div>
        <div><span class="label-sm">Quantity-driven 4D·5D</span><h3>물량에서 공정·예산으로</h3><p>층별 바닥면적·외벽·굴토량으로 공종별 작업 기간과 공사비를 계산합니다. 작업일 달력(주말·동절기·장마)과 2026년 기준 단가, 연 물가상승률을 변수로 둡니다.</p></div>
      </div>
    </div>
  </div>`;

  let viewer = null, off = () => {};
  const stage = root.querySelector('#h-stage');
  viewer = createViewer(stage, { hero: true });
  if (viewer) {
    viewer.setModel(gen); viewer.paint('use', null); viewer.setSun(-10, 14.5);
    off = onThemeChange(() => viewer.applyTheme());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) viewer.setAutoRotate(false);
  }
  return () => { off(); if (viewer) viewer.dispose(); };
}
