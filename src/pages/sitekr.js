// 02 입지: 고른 용도로 전국 후보지를 평가한다. 후보지 속성(교통·항만·전력·용수·인력·수요·토지비·지반·재해·이격·규모·정책) × 용도 가중치 → 적합도.
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
    <div class="atlas-legend" aria-hidden="true"><span><i class="lg-pin"></i>숫자 = 적합도 순위 · 진할수록 높은 점수</span><span><i class="lg-x"></i>회색 = 부지 성격·규모 부적합</span></div>
  </section>
  <div class="wrap">
    <section class="sx-sec" id="weights" aria-label="평가 가중치">
      ${sub('02.1', '평가 가중치', `${u.name} 기본값에서 시작합니다. 0이면 그 항목을 보지 않습니다.`, '<button type="button" class="chipbtn" id="w-reset">기본값</button>')}
      <div class="kr-w" id="w-list"></div>
    </section>
    <section class="sx-sec" aria-label="상위 후보지 비교">
      ${sub('02.2', '상위 후보지 비교', '항목 점수(0–100). 색이 진할수록 높고, 굵은 칸은 가중치가 큰 항목입니다. 행을 누르면 그 후보지를 고릅니다.')}
      <div class="panel"><div class="tw"><table class="kr-mx" id="mx"></table></div></div>
    </section>
    <section class="sx-sec" id="dossier" aria-label="선택한 후보지"></section>
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
    atlas = createAtlas($('map'), { minZoom: 5.6, maxZoom: 14, onSelect: (id) => select(id, true), onHover: (id) => { st.hover = id; } });
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
      <div class="pk-act"><button type="button" class="btn acc" id="go" ${r.eligible ? '' : 'disabled'}>이 택지로 매스 배치 <span class="ar">→</span></button><a class="chipbtn" href="#dossier">상세</a></div>`;
  }

  // ---------- 가중치 ----------
  function renderWeights() {
    const tot = Object.values(st.w).reduce((a, b) => a + b, 0) || 1;
    $('w-list').innerHTML = CRIT_KEYS.map(k => {
      const v = st.w[k] || 0, d = u.w[k] || 0;
      return `<div class="kr-wi${v ? '' : ' z'}${v !== d ? ' changed' : ''}"><label for="w-${k}"><b>${CRITERIA[k].name}</b><em>${CRITERIA[k].en}</em></label>
        <input type="range" id="w-${k}" data-w="${k}" min="0" max="40" step="1" value="${v}"><span class="v">${v}<small>${Math.round(v / tot * 100)}%</small></span><span class="hint">${CRITERIA[k].note}</span></div>`;
    }).join('');
  }

  // ---------- 비교 행렬 ----------
  function renderMatrix() {
    const top = view().slice(0, 14);
    if (st.sel && !top.find(r => r.site.id === st.sel)) { const r = all.find(x => x.site.id === st.sel); if (r) top.push(r); }
    const keys = CRIT_KEYS.filter(k => st.w[k] > 0).sort((a, b) => st.w[b] - st.w[a]);
    const wmax = Math.max(...keys.map(k => st.w[k]));
    $('mx').innerHTML = `<thead><tr><th>순위</th><th class="l">후보지</th>${keys.map(k => `<th class="${st.w[k] >= wmax * 0.6 ? 'hw' : ''}" title="${CRITERIA[k].note}">${CRITERIA[k].name}<small>${st.w[k]}</small></th>`).join('')}<th>적합</th><th>종합</th></tr></thead>
      <tbody>${top.map(r => `<tr data-id="${r.site.id}" class="${r.site.id === st.sel ? 'on' : ''}"><td class="mono">${r.eligible ? String(r.rank).padStart(2, '0') : '—'}</td><td class="l"><b>${escH(r.site.name)}</b><small>${r.site.region}</small></td>
        ${keys.map(k => { const v = r.parts[k] ? r.parts[k].v : critValue(r.site, use, k); return `<td class="hc" style="--h:${(v / 100).toFixed(2)}">${v}</td>`; }).join('')}
        <td class="mono">${Math.round(r.compat * 100)}%</td><td class="tot">${r.score}</td></tr>`).join('')}</tbody>`;
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
    renderPick(); renderMap(); renderMatrix(); renderDossier();
    $('r-list').querySelectorAll('[data-id]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    if (!fromMap && atlas) { const s = KR_SITES.find(x => x.id === id); atlas.lookAt(s.lng, s.lat, Math.max(atlas.zoom, 8.2), 700); }
  }
  function launch() {
    const s = store.get();
    store.set({ site: { id: st.sel }, mass: isHousingGen(use) ? null : s.mass, siteW: { ...(s.siteW || {}), [use]: st.w } });
    location.hash = '#/mass';
  }
  function refresh() { compute(); renderRank(); renderMap(); renderPick(); renderMatrix(); renderDossier(); }

  root.addEventListener('click', (e) => {
    if (e.target.closest('#go, #go2')) { launch(); return; }
    if (e.target.id === 'w-reset') { st.w = { ...u.w }; renderWeights(); refresh(); return; }
    const b = e.target.closest('#r-list [data-id], #mx tr[data-id]'); if (b) select(b.dataset.id);
  });
  $('r-reg').addEventListener('change', (e) => {
    st.region = e.target.value; renderRank(); renderMatrix();
    if (atlas) { if (st.region === 'all') atlas.fit(KOREA_BOX, 30); else { const list = KR_SITES.filter(s => s.reg === st.region); const xs = list.map(s => lngLatToWorld(s.lng, s.lat)); const pad = 0.05; atlas.fit([Math.min(...xs.map(p => p[0])) - pad, Math.min(...xs.map(p => p[1])) - pad, Math.max(...xs.map(p => p[0])) + pad, Math.max(...xs.map(p => p[1])) + pad], 60); } }
  });
  let wq = 0;
  $('w-list').addEventListener('input', (e) => {
    const k = e.target.dataset.w; if (!k) return;
    st.w = { ...st.w, [k]: +e.target.value };
    const row = e.target.closest('.kr-wi'); row.classList.toggle('z', !st.w[k]); row.classList.toggle('changed', st.w[k] !== (u.w[k] || 0));
    const tot = Object.values(st.w).reduce((a, b) => a + b, 0) || 1;
    root.querySelectorAll('.kr-wi').forEach(el => { const kk = el.querySelector('[data-w]').dataset.w; el.querySelector('.v').innerHTML = `${st.w[kk] || 0}<small>${Math.round((st.w[kk] || 0) / tot * 100)}%</small>`; });
    if (!wq) wq = requestAnimationFrame(() => { wq = 0; if (alive) refresh(); });
  });
  $('mx').addEventListener('pointermove', (e) => {
    const td = e.target.closest('td.hc'); if (!td) { tip(null); return; }
    const tr = td.closest('tr'), i = [...tr.children].indexOf(td) - 2, keys = CRIT_KEYS.filter(k => st.w[k] > 0).sort((a, b) => st.w[b] - st.w[a]);
    const k = keys[i]; if (!k) return;
    tip(`<b>${CRITERIA[k].name}</b> ${td.textContent}점<br><span class="muted">${CRITERIA[k].note}</span>`, e.clientX, e.clientY);
  });
  $('mx').addEventListener('pointerleave', () => tip(null));

  compute(); renderWeights(); renderRank(); initMap(); renderMap(); renderPick(); renderMatrix(); renderDossier();
  const offTheme = onThemeChange(() => { if (atlas) atlas.theme(); });
  return () => { alive = false; offTheme(); if (atlas) atlas.dispose(); tip(null); };
}
