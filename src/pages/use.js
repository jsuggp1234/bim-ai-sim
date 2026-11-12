// 01 용도: 무엇을 지을지 먼저 정한다. 용도가 입지 기준(가중치)·규모·매스 생성기·공법·공사비 기준을 함께 정한다.
import { USES, USE_CATS, CRITERIA, CRIT_KEYS, useOf } from '../sim/uses.js';
import { eligibleCount, rankSites } from '../sim/siting.js';
import { KR_SITES } from '../sim/kr-sites.js';
import { store } from '../store.js';
import { fmt } from '../pipeline.js';
import { head, tabs, sub, glyph, dot, countUp, escH } from '../ui/sys.js';

export const title = '01 용도';

export function mount(root) {
  const counts = Object.fromEntries(USES.map(u => [u.id, eligibleCount(u.id)]));
  let cat = 'all';
  let cur = store.get().use || 'housing';
  const $ = (id) => root.querySelector('#' + id);

  root.innerHTML = head({
    n: 1, key: 'USE', title: '무엇을 지을까', status: 'SELECT PROGRAM',
    dim: `${USES.length}개 시설 용도 · ${USE_CATS.length}개 분류 · 전국 후보지 ${KR_SITES.length}곳`,
    desc: '용도를 고르면 입지 평가 기준과 가중치, 부지 규모, 매스 생성 규칙, 구조·공법 후보, 공사비·공기 기준이 함께 정해집니다. 다음 단계에서 이 용도에 맞는 전국 후보지를 순위로 봅니다.',
    stats: [['용도', `<b data-cu="${USES.length}">0</b>`, 'USE TYPES'], ['후보지', `<b data-cu="${KR_SITES.length}">0</b>`, 'SITES · 18 REGIONS'], ['평가 기준', `<b data-cu="${CRIT_KEYS.length}">0</b>`, 'CRITERIA']],
  }) + `
  <div class="wrap">
    <section class="sx-sec" aria-label="용도 목록">
      ${sub('01.1', '시설 용도', '카드를 누르면 고릅니다. 숫자는 이 용도로 갈 수 있는 전국 후보지 수입니다.')}
      <div id="u-tabs"></div>
      <div class="u-grid" id="u-grid" role="listbox" aria-label="시설 용도"></div>
    </section>
    <section class="sx-sec u-detail" id="u-detail" aria-live="polite"></section>
  </div>`;
  root.querySelectorAll('[data-cu]').forEach(el => countUp(el, +el.dataset.cu));

  function renderTabs() {
    const list = [{ k: 'all', name: '전체', n: USES.length }, ...USE_CATS.map(c => ({ k: c.k, name: c.name, n: USES.filter(u => u.cat === c.k).length }))];
    $('u-tabs').innerHTML = tabs(list, cat, 'data-cat', '용도 분류');
  }
  function card(u) {
    const on = u.id === cur;
    const top = Object.entries(u.w).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = Object.values(u.w).reduce((a, b) => a + b, 0) || 1;
    return `<button type="button" class="u-card${on ? ' on' : ''}" data-use="${u.id}" role="option" aria-selected="${on}">
      <span class="u-top"><span class="u-code">${u.code}</span>${on ? dot('SELECTED') : `<span class="u-cat">${USE_CATS.find(c => c.k === u.cat).en}</span>`}</span>
      <span class="u-gl">${glyph(u, 64)}</span>
      <span class="u-name">${u.name}</span>
      <span class="u-en">${u.en}</span>
      <span class="u-w">${top.map(([k, v]) => `<span><em>${CRITERIA[k].name}</em><i style="width:${(v / tot * 100 * 2.2).toFixed(0)}%"></i></span>`).join('')}</span>
      <span class="u-foot"><span><b>${counts[u.id]}</b> 후보지</span><span>${u.months[0]}–${u.months[1]}개월</span></span>
    </button>`;
  }
  function renderGrid() {
    const list = USES.filter(u => cat === 'all' || u.cat === cat);
    $('u-grid').innerHTML = list.map(card).join('');
  }
  function renderDetail() {
    const u = useOf(cur);
    const tot = Object.values(u.w).reduce((a, b) => a + b, 0) || 1;
    const top3 = rankSites(u.id).slice(0, 5);
    const rows = CRIT_KEYS.map(k => [k, u.w[k] || 0]).sort((a, b) => b[1] - a[1]);
    $('u-detail').innerHTML = `${sub('01.2', `${u.name} <span class="muted">${u.code}</span>`, u.desc)}
      <div class="u-dgrid">
        <div class="panel pad">
          <div class="sec-h"><h2>입지 평가 가중치</h2><span class="hint">합계 100 · 다음 단계에서 바꿀 수 있습니다</span></div>
          <div class="u-wlist">${rows.map(([k, v]) => `<div class="${v ? '' : 'z'}"><span class="k">${CRITERIA[k].name}<em>${CRITERIA[k].en}</em></span><span class="sx-hbar acc"><i style="width:${(v / tot * 100 * 2.5).toFixed(1)}%"></i></span><span class="v">${v ? Math.round(v / tot * 100) : '—'}</span></div>`).join('')}</div>
        </div>
        <div class="panel pad">
          <div class="sec-h"><h2>계획 기준</h2><span class="hint">시뮬레이션 기본값</span></div>
          <dl class="kv">
            <div><dt>부지 규모</dt><dd>최소 ${fmt(u.area[0] / 1e4, 1)}ha · 적정 ${fmt(u.area[1] / 1e4, 1)}ha</dd></div>
            <div><dt>구조 형식</dt><dd>${u.struct}</dd></div>
            <div><dt>기본 용적률</dt><dd>${u.far}% · 가용 ${u.net}%</dd></div>
            <div><dt>공사비 기준</dt><dd>${fmt(u.cost)}만원/㎡ (연면적, 설비 구입비 제외)</dd></div>
            <div><dt>대표 공기</dt><dd>${u.months[0]}–${u.months[1]}개월</dd></div>
            <div><dt>성과 지표</dt><dd>${u.kpi}</dd></div>
          </dl>
          <span class="label-sm" style="display:block;margin-top:14px">필수 조건</span>
          <ul class="u-needs">${u.needs.map(x => `<li>${escH(x)}</li>`).join('')}</ul>
        </div>
        <div class="panel pad">
          <div class="sec-h"><h2>적합도 상위 후보지</h2><span class="hint">${counts[u.id]}곳 중 · 기본 가중치</span></div>
          <ol class="u-top5">${top3.map((r, i) => `<li><span class="rk">${String(i + 1).padStart(2, '0')}</span><span class="nm">${escH(r.site.name)}<em>${r.site.region} · ${r.site.city}</em></span><span class="sc">${r.score}</span></li>`).join('')}</ol>
          <a class="btn acc wide" href="#/site">입지 후보 ${counts[u.id]}곳 보기 <span class="ar">→</span></a>
        </div>
      </div>`;
  }
  function choose(id) {
    if (id === cur) return;
    cur = id;
    const s = store.get();
    // 지금 택지가 새 용도에도 맞으면 그대로, 아니면 그 용도 1순위 택지로
    const rk = rankSites(id);
    const keep = s.site && rk.some(r => r.site.id === s.site.id);
    store.set({ use: id, site: keep ? s.site : (rk[0] ? { id: rk[0].site.id } : null) });
    renderGrid(); renderDetail();
  }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cat]'); if (t) { cat = t.dataset.cat; renderTabs(); renderGrid(); return; }
    const c = e.target.closest('[data-use]'); if (c) choose(c.dataset.use);
  });
  root.addEventListener('keydown', (e) => {
    const c = e.target.closest('[data-use]'); if (!c || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const all = [...root.querySelectorAll('[data-use]')]; const i = all.indexOf(c);
    const n = all[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
    n.focus(); e.preventDefault();
  });
  renderTabs(); renderGrid(); renderDetail();
}
