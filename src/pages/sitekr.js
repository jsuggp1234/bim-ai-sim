// 02 입지: 고른 용도로 전국 후보지를 평가한다. 지도 하나에 순위·선택 카드를 두고, 핀에 마우스를 올리면 종합 점수의 항목별 점수가 뜬다.
// 가중치는 '무엇을 중요하게 볼지' 프리셋 + 비중 막대 하나로 보이고, 항목별 슬라이더는 접어 둔다. 후보지 속성(교통·항만·전력·용수·인력·수요·토지비·지반·재해·이격·규모·정책) × 용도 가중치 → 적합도.
import { useOf, CRITERIA, CRIT_KEYS, isHousingGen } from '../sim/uses.js';
import { KR_SITES, REGIONS, REGION_ORDER, GROUND } from '../sim/kr-sites.js';
import { rankSites, scoreSite, reasonLine, programFor, critValue } from '../sim/siting.js';
import { store } from '../store.js';
import { fmt, won, onThemeChange, tip } from '../pipeline.js';
import { createAtlas, lngLatToWorld } from '../ui/atlas.js';
import { koreaSVG, KOREA_BOX, REGION_LABELS } from '../ui/korea.js';
import { head, sub, tabs, dot, hbar, escH } from '../ui/sys.js';

export const title = '02 입지';

export function mount(root) {
  const S0 = store.get();
  const use = S0.use || 'housing', u = useOf(use);
  const st = { w: { ...u.w, ...((S0.siteW || {})[use] || {}) }, region: 'all', sel: null, hover: null, show: 'fit' };
  const $ = (id) => root.querySelector('#' + id);
  let all = [], ranked = [], atlas = null, alive = true;

  root.innerHTML = head({
    n: 2, key: 'SITE', title: '어디에 지을까', status: `PROGRAM ${u.code} · ${u.en}`,
    dim: `${u.name} · 전국 후보지 ${KR_SITES.length}곳 평가`,
    desc: `후보지마다 ${CRIT_KEYS.length}개 항목을 0–100점으로 매기고 ${u.name} 가중치로 합칩니다. 부지 성격(산단·도심·항만 등)이 용도와 맞지 않거나 면적이 모자라면 후보에서 뺍니다. 가중치를 바꾸면 순위가 바로 다시 계산됩니다.`,
    stats: [['적합 후보지', '<b id="k-n">—</b>', 'ELIGIBLE'], ['1순위 적합도', '<b id="k-top">—</b>', 'TOP SCORE'], ['시도', '<b id="k-reg">—</b>', 'REGIONS']],
    actions: `<a class="btn ghost" href="#/use">← 01 용도</a>`,
  }) + `
  <section class="atlas kr" id="atlas" aria-label="전국 후보지 지도">
    <div class="atlas-map" id="map"></div>
    <aside class="atlas-rank" aria-label="후보지 순위">
      <div class="sec-h"><h2>적합도 순위</h2><span class="hint" id="r-hint"></span></div>
      <label class="sr" for="r-reg">시도</label>
      <select id="r-reg" class="sx-select"></select>
      <ol class="sites kr-list" id="r-list"></ol>
    </aside>
    <div class="atlas-pick" id="pick" aria-live="polite"></div>
    <div class="kr-hov" id="hov" hidden></div>
    <div class="atlas-legend" aria-hidden="true"><span><i class="lg-pin"></i>숫자 = 적합도 순위 · 핀에 마우스를 올리면 세부 점수</span><span><i class="lg-x"></i>회색 = 부지 성격·규모 부적합</span></div>
  </section>
  <div class="wrap">
    <section class="sx-sec" id="weights" aria-label="평가 기준">
      ${sub('02.1', '무엇을 중요하게 볼까', `${u.name} 기본 기준에서 시작합니다. 고르면 지도 순위가 바로 바뀝니다.`, '<button type="button" class="chipbtn" id="w-reset">기본값</button>')}
      <div class="kr-w2">
        <div class="kr-pre" id="w-pre" role="group" aria-label="평가 기준 프리셋"></div>
        <div class="kr-mix" id="w-mix" aria-label="항목별 비중"></div>
        <details class="kr-adv" id="w-adv"><summary><span>항목별로 직접 조정</span><small>${CRIT_KEYS.length}개 항목 · 0이면 보지 않음</small></summary><div class="kr-w" id="w-list"></div></details>
      </div>
    </section>
    <section class="sx-sec" id="dossier" aria-label="선택한 후보지" hidden></section>
  </div>`;

  // ---------- 계산 ----------
  function compute() {
    all = KR_SITES.map(s => scoreSite(s, use, st.w));
    ranked = all.filter(r => r.eligible).sort((a, b) => b.score - a.score);
    ranked.forEach((r, i) => { r.rank = i + 1; });
    if (!st.sel || !all.find(r => r.site.id === st.sel)) {
      const cur = S0.site && all.find(r => r.site.id === S0.site.id && r.eligible);
      st.sel = cur ? cur.site.id : ranked[0] ? ranked[0].site.id : KR_SITES[0].id;
    }
  }
  const view = () => ranked.filter(r => st.region === 'all' || r.site.reg === st.region);

  // ---------- 지도 ----------
  function initMap() {
    atlas = createAtlas($('map'), { minZoom: 5.6, maxZoom: 14, onSelect: (id) => select(id, true), onHover: (id) => { st.hover = id; showHover(id); } });
    atlas.setVector(koreaSVG());
    atlas.setLabels(REGION_LABELS.map(([t, lng, lat]) => ({ text: t, lng, lat, cls: 'kr-lab' })));
    atlas.fit(KOREA_BOX, 30, 0);
  }
  function renderMap() {
    if (!atlas) return;
    const maxA = Math.max(...KR_SITES.map(s => s.area));
    const pins = all.map(r => {
      const s = r.site, on = s.id === st.sel, ok = r.eligible;
      const rr = ok ? 6 + Math.sqrt(s.area / maxA) * 9 : 3.2;
      const lv = ok ? Math.max(0, Math.min(1, (r.score - 40) / 55)) : 0;
      return { id: s.id, lng: s.lng, lat: s.lat, r: Math.round(rr), on, label: `${ok ? r.rank + '위 ' : '부적합 '}${s.name}, 적합도 ${r.score}`,
        html: `<i class="dot ${ok ? '' : 'x'}" style="--lv:${lv.toFixed(2)}">${ok && r.rank <= 12 ? r.rank : ''}</i><span class="tag"><b>${escH(s.name)}</b><small>${s.region} · ${ok ? `${r.rank}위 · ${r.score}점` : '부적합'}</small></span>` };
    });
    // 부적합을 먼저 (아래에), 순위가 높을수록 위에
    pins.sort((a, b) => (a.on - b.on) || ((all.find(r => r.site.id === a.id).eligible) - (all.find(r => r.site.id === b.id).eligible)) || ((all.find(r => r.site.id === b.id).rank || 999) - (all.find(r => r.site.id === a.id).rank || 999)));
    atlas.setPins(pins);
  }

  // ---------- 순위 목록 ----------
  function renderRank() {
    const regs = REGION_ORDER.map(k => ({ k, n: ranked.filter(r => r.site.reg === k).length })).filter(x => x.n);
    $('r-reg').innerHTML = `<option value="all">전국 (${ranked.length})</option>` + regs.map(x => `<option value="${x.k}" ${st.region === x.k ? 'selected' : ''}>${REGIONS[x.k].name} (${x.n})</option>`).join('');
    $('r-hint').textContent = `${ranked.length} / ${KR_SITES.length}곳`;
    const list = view();
    $('r-list').innerHTML = list.map(r => `<li><button type="button" data-id="${r.site.id}" aria-pressed="${r.site.id === st.sel}">
      <span class="rk">${String(r.rank).padStart(2, '0')}</span>
      <span class="nm"><b>${escH(r.site.name)}</b><small>${r.site.region} · ${escH(r.site.city)}${r.focus ? ' · <em>지정</em>' : ''}</small></span>
      <span class="sc">${r.score}</span>${hbar(r.score / 100, 'acc thin')}</button></li>`).join('') || '<li class="note" style="padding:10px">이 시도에는 적합한 후보지가 없습니다.</li>';
    $('k-n').textContent = ranked.length; $('k-top').textContent = ranked[0] ? ranked[0].score : '—';
    $('k-reg').textContent = new Set(ranked.map(r => r.site.reg)).size;
  }

  // ---------- 지도 위 선택 카드 ----------
  function renderPick() {
    const r = all.find(x => x.site.id === st.sel); if (!r) return;
    const s = r.site, pg = programFor(s, use);
    $('pick').innerHTML = `<div class="pk-h"><span class="sx-code-s">SITE · ${s.id.toUpperCase()}</span>${r.eligible ? dot(`RANK ${String(r.rank).padStart(2, '0')}`) : dot('NOT ELIGIBLE', 'mute')}</div>
      <b class="pk-n">${escH(s.name)}</b><span class="pk-s">${s.region} ${escH(s.city)} · ${fmt(s.area / 1e4, 1)}ha · ${GROUND[s.a.g].short}</span>
      <div class="pk-score"><span class="big">${r.score}</span><span class="note">적합도 / 100<br>${escH(reasonLine(r)) || ''}</span></div>
      <div class="pk-kv"><span>1단계 시뮬레이션</span><b>${fmt(pg.simArea / 1e4, 1)}ha${pg.phase ? ' (일부 구역)' : ''}</b><span>연면적 추정</span><b>${fmt(pg.gfa / 1e4, 1)}만㎡</b>${pg.units ? `<span>세대 추정</span><b>${fmt(pg.units)}세대</b>` : ''}<span>공사비 추정</span><b>${won(pg.cost)}</b></div>
      <div class="pk-act"><button type="button" class="btn acc" id="go" ${r.eligible ? '' : 'disabled'}>이 택지로 매스 배치 <span class="ar">→</span></button><button type="button" class="chipbtn" id="dos-t" aria-expanded="${!$('dossier').hidden}">${$('dossier').hidden ? '상세 보기' : '상세 닫기'}</button></div>`;
  }

  // ---------- 가중치: 프리셋 · 비중 막대 · (접힌) 항목별 슬라이더 ----------
  // 프리셋은 용도 기본값에서 몇 항목을 두 배로 키운다 (그 용도에서 보지 않는 항목은 그대로 0)
  const PRESETS = [
    { id: 'base', n: '기본', d: `${u.name} 기본 기준` },
    { id: 'access', n: '접근성', d: '교통·도로·공항·항만', k: ['transit', 'road', 'air', 'port'] },
    { id: 'cost', n: '비용·규모', d: '토지비·부지 규모·지반', k: ['landc', 'scale', 'ground'] },
    { id: 'infra', n: '인프라·인력', d: '전력·용수·인재', k: ['power', 'water', 'labor'] },
    { id: 'safe', n: '안전·민원', d: '재해·주거 이격·지반', k: ['safety', 'buffer', 'ground'] },
    { id: 'market', n: '수요·정책', d: '배후·방문 수요·인허가', k: ['demand', 'tour', 'policy'] },
  ].filter(p => !p.k || p.k.some(k => (u.w[k] || 0) > 0));
  const presetW = (p) => { const w = { ...u.w }; (p.k || []).forEach(k => { if (w[k]) w[k] = Math.min(40, Math.round(w[k] * 2.2)); }); return w; };
  const sameW = (a, b) => CRIT_KEYS.every(k => (a[k] || 0) === (b[k] || 0));
  function renderWeights() { renderMix(); renderSliders(); }
  function renderMix() {
    const tot = Object.values(st.w).reduce((a, b) => a + b, 0) || 1;
    $('w-pre').innerHTML = PRESETS.map(p => `<button type="button" data-pre="${p.id}" aria-pressed="${sameW(st.w, presetW(p))}"><b>${p.n}</b><small>${p.d}</small></button>`).join('');
    const act = CRIT_KEYS.filter(k => st.w[k] > 0).sort((a, b) => st.w[b] - st.w[a]);
    $('w-mix').innerHTML = `<div class="kr-bar">${act.map((k, i) => { const f = st.w[k] / tot; return `<i style="--f:${f.toFixed(4)};--o:${(1 - i / Math.max(1, act.length) * 0.82).toFixed(2)}" data-k="${k}" title="${CRITERIA[k].name} ${Math.round(f * 100)}%">${f > 0.075 ? `<span>${CRITERIA[k].name}</span><em>${Math.round(f * 100)}%</em>` : ''}</i>`; }).join('')}</div>
      <div class="kr-bar-l">${act.map(k => `<span>${CRITERIA[k].name} <b>${Math.round(st.w[k] / tot * 100)}%</b></span>`).join('')}</div>`;
  }
  function renderSliders() {
    const tot = Object.values(st.w).reduce((a, b) => a + b, 0) || 1;
    $('w-list').innerHTML = CRIT_KEYS.map(k => {
      const v = st.w[k] || 0, d = u.w[k] || 0;
      return `<div class="kr-wi${v ? '' : ' z'}${v !== d ? ' changed' : ''}"><label for="w-${k}"><b>${CRITERIA[k].name}</b><em>${CRITERIA[k].en}</em></label>
        <input type="range" id="w-${k}" data-w="${k}" min="0" max="40" step="1" value="${v}"><span class="v">${v}<small>${Math.round(v / tot * 100)}%</small></span><span class="hint">${CRITERIA[k].note}</span></div>`;
    }).join('');
  }

  // ---------- 핀 위 세부 점수 (종합 점수 = 항목 점수 × 비중) ----------
  function hoverHTML(r) {
    const s = r.site, tot = Object.values(st.w).reduce((a, b) => a + b, 0) || 1;
    const rows = CRIT_KEYS.filter(k => st.w[k] > 0).map(k => ({ k, v: r.parts[k] ? r.parts[k].v : critValue(s, use, k), w: st.w[k] / tot })).sort((a, b) => b.w * b.v - a.w * a.v);
    return `<div class="kh-h"><span class="kh-rk">${r.eligible ? `#${String(r.rank).padStart(2, '0')}` : '—'}</span><span class="kh-n"><b>${escH(s.name)}</b><small>${s.region} ${escH(s.city)} · ${fmt(s.area / 1e4, 1)}ha</small></span><span class="kh-sc">${r.eligible ? r.score : '부적합'}</span></div>
      <div class="kh-rows">${rows.slice(0, 8).map(x => `<div class="${x.v >= 75 ? 'hi' : x.v < 50 ? 'lo' : ''}"><span class="k">${CRITERIA[x.k].name}</span><span class="b"><i style="width:${x.v}%"></i></span><span class="v">${x.v}</span><span class="w">×${Math.round(x.w * 100)}%</span></div>`).join('')}</div>
      <div class="kh-f">${rows.length > 8 ? `외 ${rows.length - 8}개 항목 · ` : ''}부지 성격 적합 ${Math.round(r.compat * 100)}%${r.focus ? ' · 정책 지정 +4' : ''}${r.eligible ? '' : ' · 성격·규모가 맞지 않아 제외'}</div>`;
  }
  function showHover(id) {
    const box = $('hov'); if (!id) { box.hidden = true; return; }
    const r = all.find(x => x.site.id === id), pin = $('map').querySelector(`.at-pin[data-id="${CSS.escape(id)}"]`); if (!r || !pin) { box.hidden = true; return; }
    box.innerHTML = hoverHTML(r); box.hidden = false;
    const A = $('atlas').getBoundingClientRect(), P = pin.getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
    let x = P.left - A.left + 18, y = P.top - A.top - bh / 2;
    if (x + bw > A.width - 8) x = P.left - A.left - bw - 18;
    y = Math.max(8, Math.min(A.height - bh - 8, y));
    box.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  // ---------- 상세 ----------
  function renderDossier() {
    const r = all.find(x => x.site.id === st.sel); if (!r) return;
    const s = r.site, pg = programFor(s, use), R = REGIONS[s.reg], G = GROUND[s.a.g];
    const rows = Object.entries(r.parts).sort((a, b) => b[1].w - a[1].w);
    const tw = rows.reduce((a, [, p]) => a + p.w, 0) || 1;
    $('dossier').innerHTML = `${sub('02.3', escH(s.name), `${s.region} ${escH(s.city)} · ${escH(s.status || '')}`, r.eligible ? dot(`RANK ${r.rank} / ${ranked.length}`) : dot('NOT ELIGIBLE', 'mute'))}
      <div class="kr-dos">
        <div class="panel pad">
          <div class="sec-h"><h2>항목별 점수와 기여</h2><span class="hint">막대 = 점수 · 오른쪽 = 가중 기여</span></div>
          <div class="kr-parts">${rows.map(([k, p]) => `<div class="${p.v >= 70 ? 'hi' : p.v < 55 ? 'lo' : ''}"><span class="k">${CRITERIA[k].name}</span>${hbar(p.v / 100, p.v >= 70 ? 'acc' : '')}<span class="v">${p.v}</span><span class="c">${(p.w * p.v / tw).toFixed(1)}</span></div>`).join('')}</div>
          <div class="note" style="margin-top:10px">가중 평균 ${r.base}점 → 점수 폭 보정 → 부지 성격 적합 ${Math.round(r.compat * 100)}%${r.focus ? ' · 정책 지정 +4' : ''} → <b>${r.score}점</b></div>
        </div>
        <div class="panel pad">
          <div class="sec-h"><h2>부지 프로필</h2><span class="hint">${s.kinds.map(k => k.toUpperCase()).join(' · ')}</span></div>
          <dl class="kv">
            <div><dt>면적</dt><dd>${fmt(s.area / 1e4, 1)}ha (${fmt(s.area)}㎡)</dd></div>
            <div><dt>지반</dt><dd>${G.name} · 지하수위 GL−${s.a.gw}m</dd></div>
            <div><dt>토지 단가 (추정)</dt><dd>${fmt(s.a.$)}만원/㎡</dd></div>
            <div><dt>재해 위험</dt><dd>${s.a.f} / 100</dd></div>
            <div><dt>주거 이격</dt><dd>${s.a.b} / 100</dd></div>
            <div><dt>정책·인허가</dt><dd>${s.a.pol} / 100</dd></div>
            <div><dt>좌표</dt><dd class="mono">${s.lat.toFixed(4)}°N, ${s.lng.toFixed(4)}°E</dd></div>
          </dl>
          ${s.sources.length ? `<span class="label-sm" style="display:block;margin-top:14px">근거 자료</span><ul class="srcs">${s.sources.map(x => `<li><a href="${x.url}" target="_blank" rel="noopener"><span>${x.d || ''}</span>${escH(x.t)}</a></li>`).join('')}</ul>` : `<div class="note" style="margin-top:12px">${R.name} 지역 평균 프로필에 부지 성격 보정을 더한 값입니다.</div>`}
        </div>
        <div class="panel pad">
          <div class="sec-h"><h2>이 부지의 ${u.name}</h2><span class="hint">다음 단계 시작값</span></div>
          <dl class="kv">
            <div><dt>시뮬레이션 구역</dt><dd>${fmt(pg.simArea / 1e4, 1)}ha${pg.phase ? ` · 전체 ${fmt(s.area / 1e4, 0)}ha 중 1단계` : ''}</dd></div>
            <div><dt>용적률 · 가용</dt><dd>${pg.far}% · ${pg.net}%</dd></div>
            <div><dt>연면적 추정</dt><dd>${fmt(pg.gfa)}㎡</dd></div>
            ${pg.units ? `<div><dt>세대 추정</dt><dd>${fmt(pg.units)}세대</dd></div>` : ''}
            <div><dt>공사비 추정</dt><dd>${won(pg.cost)} (지하 포함 개략)</dd></div>
            <div><dt>대표 공기</dt><dd>${u.months[0]}–${u.months[1]}개월</dd></div>
          </dl>
          <button type="button" class="btn acc wide" id="go2" ${r.eligible ? '' : 'disabled'} style="margin-top:16px">이 택지로 매스 배치 <span class="ar">→</span></button>
          ${isHousingGen(use) && s.stage1 ? `<a class="chipbtn" href="#/seoul" style="margin-top:8px">서울 8곳 사업성 상세 분석 →</a>` : ''}
        </div>
      </div>`;
  }

  function select(id, fromMap) {
    st.sel = id;
    renderPick(); renderMap(); renderDossier();
    $('r-list').querySelectorAll('[data-id]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    if (!fromMap && atlas) { const s = KR_SITES.find(x => x.id === id); atlas.lookAt(s.lng, s.lat, Math.max(atlas.zoom, 8.2), 700); }
  }
  function launch() {
    const s = store.get();
    store.set({ site: { id: st.sel }, mass: isHousingGen(use) ? null : s.mass, siteW: { ...(s.siteW || {}), [use]: st.w } });
    location.hash = '#/mass';
  }
  function refresh() { compute(); renderRank(); renderMap(); renderPick(); renderDossier(); }

  root.addEventListener('click', (e) => {
    if (e.target.closest('#go, #go2')) { launch(); return; }
    if (e.target.id === 'w-reset') { st.w = { ...u.w }; renderWeights(); refresh(); return; }
    const pr = e.target.closest('[data-pre]'); if (pr) { const P = PRESETS.find(x => x.id === pr.dataset.pre); st.w = presetW(P); renderWeights(); refresh(); return; }
    if (e.target.closest('#dos-t')) { const d = $('dossier'); d.hidden = !d.hidden; renderPick(); if (!d.hidden) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const b = e.target.closest('#r-list [data-id]'); if (b) select(b.dataset.id);
  });
  $('r-reg').addEventListener('change', (e) => {
    st.region = e.target.value; renderRank();
    if (atlas) { if (st.region === 'all') atlas.fit(KOREA_BOX, 30); else { const list = KR_SITES.filter(s => s.reg === st.region); const xs = list.map(s => lngLatToWorld(s.lng, s.lat)); const pad = 0.05; atlas.fit([Math.min(...xs.map(p => p[0])) - pad, Math.min(...xs.map(p => p[1])) - pad, Math.max(...xs.map(p => p[0])) + pad, Math.max(...xs.map(p => p[1])) + pad], 60); } }
  });
  let wq = 0;
  $('w-list').addEventListener('input', (e) => {
    const k = e.target.dataset.w; if (!k) return;
    st.w = { ...st.w, [k]: +e.target.value };
    const row = e.target.closest('.kr-wi'); row.classList.toggle('z', !st.w[k]); row.classList.toggle('changed', st.w[k] !== (u.w[k] || 0));
    const tot = Object.values(st.w).reduce((a, b) => a + b, 0) || 1;
    root.querySelectorAll('.kr-wi').forEach(el => { const kk = el.querySelector('[data-w]').dataset.w; el.querySelector('.v').innerHTML = `${st.w[kk] || 0}<small>${Math.round((st.w[kk] || 0) / tot * 100)}%</small>`; });
    if (!wq) wq = requestAnimationFrame(() => { wq = 0; if (!alive) return; refresh(); renderMix(); });
  });
  // 순위 목록에 마우스를 올려도 지도 위 세부 점수
  $('r-list').addEventListener('pointerover', (e) => { const b = e.target.closest('[data-id]'); if (b) showHover(b.dataset.id); });
  $('r-list').addEventListener('pointerleave', () => showHover(null));

  compute(); renderWeights(); renderRank(); initMap(); renderMap(); renderPick(); renderDossier();
  const offTheme = onThemeChange(() => { if (atlas) atlas.theme(); });
  return () => { alive = false; offTheme(); if (atlas) atlas.dispose(); tip(null); };
}
