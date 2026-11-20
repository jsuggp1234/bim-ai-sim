// 실제 현장 대비 카드: 4D 화면(공기)과 5D 화면(원가)에서 쓴다. 자료는 sim/bench.js (산군 현장DB·입찰DB)
import { benchFor, planSpan, verdict, BENCH_SRC, PUBLIC_REF, LH_AWARDS, COST_REF, GFA_PER_UNIT, contractOf } from '../sim/bench.js';
import { isHousingGen } from '../sim/uses.js';

const n1 = (v) => v.toFixed(1);
const num = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ymd = (s) => s.replace(/-/g, '.');
const sgn = (v, d = 1) => { const r = +v.toFixed(d); return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r).toFixed(d); };
const SRC = `출처: ${BENCH_SRC.name} (${ymd(BENCH_SRC.date)} 조회)`;

// 점 띠 그림: 점 하나가 실제 현장 하나, 마름모가 이 계획과 기준선
function strip(list, st, marks, extra = []) {
  const W = 760, PL = 18, PR = 34;
  const vals = [...list.map(r => r.months), ...marks.map(m => m.v), ...extra.map(m => m.v)];
  const lo = Math.floor((Math.min(...vals) - 1.5) / 6) * 6, hi = Math.ceil((Math.max(...vals) + 1.5) / 6) * 6;
  const x = (v) => PL + (v - lo) / (hi - lo) * (W - PL - PR);
  const pts = list.map(r => ({ r, x: x(r.months) })).sort((a, b) => a.x - b.x), rows = [];
  pts.forEach(p => { let k = 0; while (rows[k] != null && p.x - rows[k] < 12) k++; rows[k] = p.x; p.row = k; });
  const y0 = 62, dy = 12, yAx = y0 + Math.max(2, rows.length) * dy + 4, H = yAx + (extra.length ? 48 : 26);
  let s = '';
  // 가운데 절반 띠 + 중앙값
  s += `<rect x="${x(st.q1).toFixed(1)}" y="${y0 - 12}" width="${Math.max(2, x(st.q3) - x(st.q1)).toFixed(1)}" height="${yAx - y0 + 12}" fill="var(--line)" opacity=".55"/>`;
  s += `<line x1="${x(st.med).toFixed(1)}" x2="${x(st.med).toFixed(1)}" y1="${y0 - 12}" y2="${yAx}" stroke="var(--ink-2)" stroke-width="1.5"/>`;
  // 축
  s += `<line x1="${PL}" x2="${W - PR}" y1="${yAx}" y2="${yAx}" stroke="var(--line)"/>`;
  for (let v = lo; v <= hi; v += 6) s += `<line x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="${yAx}" y2="${yAx + 4}" stroke="var(--muted)"/><text x="${x(v).toFixed(1)}" y="${yAx + 16}" text-anchor="middle" class="bn-t">${v}${v === hi ? '개월' : ''}</text>`;
  // 이 계획·기준선: 글자는 위 두 줄에 나눠 쓰고 세로선으로 잇는다
  marks.forEach((m, i) => {
    const mx = x(m.v), ly = 12 + i * 15, anc = mx < 150 ? 'start' : mx > W - 170 ? 'end' : 'middle';
    s += `<line x1="${mx.toFixed(1)}" x2="${mx.toFixed(1)}" y1="${ly + 4}" y2="${yAx}" stroke="${m.main ? 'var(--accent)' : 'var(--ink)'}" stroke-width="${m.main ? 2 : 1.2}" ${m.main ? '' : 'stroke-dasharray="3 3"'}/>`;
    s += `<path d="M${mx.toFixed(1)} ${yAx - 7}l6 7l-6 7l-6 -7z" fill="${m.main ? 'var(--accent)' : 'var(--card)'}" stroke="${m.main ? 'var(--card)' : 'var(--ink)'}" stroke-width="${m.main ? 2 : 1.5}"/>`;
    s += `<text x="${(mx + (anc === 'start' ? -4 : anc === 'end' ? 4 : 0)).toFixed(1)}" y="${ly}" text-anchor="${anc}" class="bn-t b">${esc(m.label)} ${n1(m.v)}개월</text>`;
  });
  s += `<text x="${x(st.med).toFixed(1)}" y="${y0 - 16}" text-anchor="middle" class="bn-t m">실제 중앙값 ${n1(st.med)}</text>`;
  // 실제 현장 점
  pts.forEach(p => {
    const r = p.r, tipHtml = `<b>${esc(r.name)}</b><br>연면적 ${num(r.gfa)}㎡<br>${ymd(r.start)} 착공 → ${ymd(r.end)} 사용승인<br>${n1(r.months)}개월${r.note ? `<br>${esc(r.note)}` : ''}`;
    s += `<circle cx="${p.x.toFixed(1)}" cy="${y0 + p.row * dy}" r="5" fill="var(--muted)" stroke="var(--card)" stroke-width="2" data-tip="${esc(tipHtml)}" tabindex="0" aria-label="${esc(r.name)} ${n1(r.months)}개월"/>`;
  });
  // 공공 계약 공기 (아파트)
  extra.forEach(m => {
    const mx = x(m.v), anc = mx > W - 150 ? 'end' : 'middle';
    s += `<path d="M${mx.toFixed(1)} ${yAx + 21}l5 8h-10z" fill="var(--ink-2)" data-tip="${esc(`<b>${esc(m.name)}</b><br>${esc(m.note)}<br>${num(m.days)}일 = ${n1(m.v)}개월`)}"/><text x="${mx.toFixed(1)}" y="${yAx + 42}" text-anchor="${anc}" class="bn-t">${esc(m.label)} ${n1(m.v)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="bn-strip" role="img" aria-label="실제 준공 현장의 공기 분포와 이 계획의 위치">${s}</svg>`;
}

// 4D: 공기 비교. R = pipeline() 결과
export function scheduleBenchHTML(R) {
  const B = R.base(), rec = planSpan(R.S, R.gen), base = planSpan(B.S, R.gen);
  const bench = benchFor(R.use, rec.gfa), pub = R.S.p.owner === 'public';
  const owner = `<div class="bn-own"><span class="label-sm">발주</span><div class="seg" role="group" aria-label="발주 방식"><button type="button" data-owner="private" aria-pressed="${!pub}">민간 · 토요일 반일</button><button type="button" data-owner="public" aria-pressed="${pub}">공공 · 주 5일 표준 공기</button></div></div>`;
  const scope = rec.per === 'all' ? `블록 ${rec.n}곳 전체 (첫 착공 → 마지막 준공)` : `블록 ${rec.n}곳 가운데 중앙값 블록 한 곳`;
  if (!bench) {
    return `<div class="bn"><div class="bn-top"><div class="bn-k"><span class="k">이 계획 (고른 공법)</span><span class="v acc">${n1(rec.months)}<small>개월</small></span><span class="s">${scope}</span></div>
      <div class="bn-k"><span class="k">전통 공법 기준선</span><span class="v">${n1(base.months)}<small>개월</small></span><span class="s">같은 매스, 전통 공법 묶음</span></div></div>
      <p class="bn-v">${esc(R.u.name)}는 산군 현장DB에서 견줄 준공 현장 표본을 아직 모으지 않았습니다. 굴착·지하 골조·마감 기간·달력 보정은 아파트·업무·물류·병원·데이터센터 실제 현장과 맞춘 값을 그대로 씁니다.</p>${owner}</div>`;
  }
  const st = bench.st, v = verdict(rec.months, st), vb = verdict(base.months, st);
  const marks = [{ v: rec.months, label: '이 계획', main: true }, { v: base.months, label: '전통 공법 기준선' }];
  const extra = bench.g === 'housing' ? [{ ...PUBLIC_REF[0], v: PUBLIC_REF[0].months, label: 'LH 계약 공기' }] : [];
  const rows = bench.near.map(r => `<tr><td class="l">${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</td><td>${num(r.gfa)}</td><td class="mono">${ymd(r.start)}</td><td class="mono">${ymd(r.end)}</td><td><b>${n1(r.months)}</b></td></tr>`).join('');
  return `<div class="bn">
    <div class="bn-top">
      <div class="bn-k"><span class="k">이 계획 (고른 공법)</span><span class="v acc">${n1(rec.months)}<small>개월</small></span><span class="s">${scope} · 연면적 ${num(rec.gfa / 1e4, 1)}만㎡</span></div>
      <div class="bn-k"><span class="k">전통 공법 기준선</span><span class="v">${n1(base.months)}<small>개월</small></span><span class="s">같은 매스 · 실제 중앙값 대비 ${vb.diff}</span></div>
      <div class="bn-k"><span class="k">실제 현장 중앙값</span><span class="v">${n1(st.med)}<small>개월</small></span><span class="s">${esc(bench.group.name)} ${st.n}곳 · 가운데 절반 ${n1(st.q1)}~${n1(st.q3)}</span></div>
      <div class="bn-k"><span class="k">이 계획 − 실제 중앙값</span><span class="v">${v.diff.split('(')[0]}</span><span class="s">${v.diff.replace(/^.*\(/, '').replace(')', '')} · 실제 범위 ${n1(st.min)}~${n1(st.max)}개월</span></div>
    </div>
    ${strip(bench.list, st, marks, extra)}
    <div class="bn-leg"><span><i class="d"></i>실제 준공 현장 (착공일 → 사용승인일)</span><span><i class="band"></i>실제 현장의 가운데 절반</span><span><i class="dia a"></i>이 계획</span><span><i class="dia"></i>전통 공법 기준선</span>${extra.length ? '<span><i class="tri"></i>LH 계약 공기 (고양창릉 S-4BL, 1,324일)</span>' : ''}</div>
    <p class="bn-v"><b>${v.k === 'fast' ? '낙관적' : v.k === 'slow' ? '여유 있음' : '실제 범위 안'}</b> ${v.text}${pub ? ' 지금은 공공 발주(주 5일·표준 공기 여유 10%)로 계산했습니다.' : ''}</p>
    ${owner}
    <div class="tw"><table class="bn-tbl"><thead><tr><th class="l">연면적이 가까운 실제 현장</th><th>연면적 ㎡</th><th>착공</th><th>사용승인</th><th>공기 (개월)</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">${SRC} · ${esc(bench.group.note)}${bench.scoped ? ` 가운데 연면적이 이 계획의 0.4~2.5배인 ${st.n}곳` : ` ${st.n}곳 전체 (연면적이 가까운 표본이 적어 묶음 전체와 견줌)`}. 시공사·설계사·발주처는 조회한 요금제에서 잠겨 있어 싣지 않았습니다. 실제 공기에는 설계 변경·민원·자금 사정으로 멈춘 기간도 들어 있습니다.</p>
  </div>`;
}

// 5D: 원가 비교 (아파트: LH 낙찰 단가). R = pipeline() 결과
export function costBenchHTML(R) {
  const B = R.base(), g = R.E.gfa, t = R.gen.totals;
  const recC = contractOf(R.E) / g, baseC = contractOf(B.E) / g;
  if (!isHousingGen(R.use) || !t.units) {
    return `<div class="bn"><div class="bn-top"><div class="bn-k"><span class="k">이 계획 도급 범위 단가</span><span class="v acc">${num(recC)}<small>만원/㎡</small></span><span class="s">직접비 + 가설·공통 + 일반관리비·이윤 · 평당 ${num(recC * 3.3058)}만원</span></div>
      <div class="bn-k"><span class="k">전통 공법 기준선</span><span class="v">${num(baseC)}<small>만원/㎡</small></span><span class="s">같은 매스</span></div></div>
      <p class="bn-v">${esc(R.u.name)}는 산군 입찰DB에서 연면적까지 함께 확인되는 낙찰 사례를 찾지 못해 단가를 실제 금액으로 보정하지 못했습니다. 민간 공사 계약 금액은 공개되지 않고, 공공 건물 낙찰(예: 화성여자교도소 449억, 전북권역 재활병원 335억, 서대문경찰서 376억)은 건축 공사분만이라 연면적당 단가로 바꿀 수 없었습니다. 지하·토공·기초 단가는 아파트 낙찰 자료로 보정한 값을 같이 씁니다.</p></div>`;
  }
  const ref = COST_REF, full = ref.perM2 / ref.scope, perU = contractOf(R.E) / t.units / 1e4, gpu = (t.gfaAbove + t.gfaBelow) / t.units;
  const bars = [
    ['LH 낙찰 단가 (건축·토목 도급분)', ref.perM2, 'real', `${ref.name} · 세대당 ${ref.perUnit.toFixed(2)}억`],
    ['전체 공사비로 환산 (÷ 0.7, 가정)', full, 'real2', `세대당 ${(ref.perUnit / ref.scope).toFixed(2)}억 · 평당 ${num(full * 3.3058)}만원`],
    ['전통 공법 기준선 · 도급 범위', baseC, 'base', `실제 환산값 대비 ${sgn((baseC / full - 1) * 100, 0)}%`],
    ['이 계획 (고른 공법) · 도급 범위', recC, 'rec', `실제 환산값 대비 ${sgn((recC / full - 1) * 100, 0)}% · 세대당 ${perU.toFixed(2)}억`],
  ];
  const mx = Math.max(...bars.map(b => b[1])) * 1.08;
  const high = t.maxH > 110 || recC > full * 1.3;
  return `<div class="bn">
    <div class="bn-top">
      <div class="bn-k"><span class="k">이 계획 도급 범위 단가</span><span class="v acc">${num(recC)}<small>만원/㎡</small></span><span class="s">직접비 + 가설·공통 + 일반관리비·이윤 · 평당 ${num(recC * 3.3058)}만원</span></div>
      <div class="bn-k"><span class="k">실제 (LH 낙찰 → 전체 환산)</span><span class="v">${num(full)}<small>만원/㎡</small></span><span class="s">낙찰 ${num(ref.perM2)}만원/㎡ ÷ 0.7</span></div>
      <div class="bn-k"><span class="k">세대당 도급액</span><span class="v">${perU.toFixed(2)}<small>억</small></span><span class="s">실제 환산 ${(ref.perUnit / ref.scope).toFixed(2)}억 (낙찰 ${ref.perUnit.toFixed(2)}억)</span></div>
      <div class="bn-k"><span class="k">세대당 연면적 (지상+지하)</span><span class="v">${num(gpu, 1)}<small>㎡</small></span><span class="s">실제 ${GFA_PER_UNIT.map(x => `${x.name} ${num(x.v, 1)}`).join(' · ')}</span></div>
    </div>
    <div class="bn-bars" role="img" aria-label="연면적당 공사비 비교 막대">${bars.map(([nm, v, k, s]) => `<div class="bn-bar ${k}"><span class="n">${nm}</span><span class="t"><i style="width:${(v / mx * 100).toFixed(1)}%"></i></span><span class="v"><b>${num(v)}</b> 만원/㎡</span><span class="s">${s}</span></div>`).join('')}</div>
    <p class="bn-v"><b>${Math.abs(baseC / full - 1) <= 0.12 ? '실제 범위 안' : baseC > full ? '실제보다 높음' : '실제보다 낮음'}</b> LH 낙찰액은 건축·토목 도급분만의 금액입니다. 전기·통신·소방(분리 발주)과 발주처 지급자재를 합친 전체를 낙찰액의 1.4배쯤(도급분 70%)으로 가정해 견주었습니다. 이 비율은 산군 자료가 아니라 가정이므로, 실제 내역이 있으면 단가를 직접 바꿔 주세요.${high ? ' 초고층·업무 복합 비중이 큰 계획은 LH 일반 아파트보다 단가가 높게 나오는 것이 정상입니다.' : ''}</p>
    <div class="tw"><table class="bn-tbl"><thead><tr><th class="l">LH 아파트 건설공사 낙찰 (개찰 2025.11~2026.08)</th><th>낙찰액 (억)</th><th>낙찰률 (%)</th><th class="l">확인된 규모</th></tr></thead><tbody>${LH_AWARDS.map(a => `<tr><td class="l">${esc(a.name)}</td><td><b>${num(a.amount, 1)}</b></td><td>${a.rate.toFixed(2)}</td><td class="l">${[a.units ? `${num(a.units)}세대` : '', a.gfa ? `연면적 ${num(a.gfa)}㎡` : '', a.bldgs ? `${a.bldgs}개 동` : '', a.days ? `${num(a.days)}일` : '', a.note || ''].filter(Boolean).join(' · ') || '<span class="note">—</span>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">${SRC}. 고양창릉 S-4BL의 세대수·연면적·공사 기간은 보도 자료 값입니다. 낙찰률은 예정가격 대비 낙찰 금액입니다.</p>
  </div>`;
}

// 그림 위 툴팁 연결 (data-tip)
export function bindBenchTips(el, tip) {
  const show = (e) => { const t = e.target.closest('[data-tip]'); tip(t ? t.dataset.tip : null, e.clientX, e.clientY); };
  el.addEventListener('pointermove', show);
  el.addEventListener('pointerleave', () => tip(null));
  el.addEventListener('focusin', (e) => { const t = e.target.closest('[data-tip]'); if (t) { const r = t.getBoundingClientRect(); tip(t.dataset.tip, r.left + r.width / 2, r.bottom); } });
  el.addEventListener('focusout', () => tip(null));
}
