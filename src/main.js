// 단계 라우터: #/(시작) → #/use → #/site → #/mass → #/method → #/process → #/budget → #/risk (GitHub Pages에서도 동작하도록 해시 경로)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import './system.css';
import { store, currentSite } from './store.js';
import { pipeline, fmt, won, projKey } from './pipeline.js';
import { isHousingGen, useOf } from './sim/uses.js';

const PAGES = {
  intro: () => import('./pages/intro.js'),
  use: () => import('./pages/use.js'),
  site: () => import('./pages/sitekr.js'),
  seoul: () => import('./pages/site.js'),
  mass: () => (isHousingGen(store.get().use || 'housing') ? import('./pages/mass.js') : import('./pages/massx.js')),
  schedule: () => import('./pages/schedule.js'),
  method: () => import('./pages/method.js'),
  process: () => import('./pages/process.js'),
  budget: () => import('./pages/budget.js'),
  risk: () => import('./pages/risk.js'),
};
const ALIAS = { next: 'process', '': 'intro', home: 'intro', methods: 'method' };
const STEPS = [
  ['use', '01', '용도'],
  ['site', '02', '입지'],
  ['mass', '03', '매스'],
  ['method', '04', '공법·재료'],
  ['process', '05', '4D·간섭'],
  ['budget', '06', '5D 예산'],
  ['risk', '07', '위험 예측'],
];
// 단계에 딸린 화면 (머리글에서는 부모 단계로 표시)
const PARENT = { seoul: 'site', schedule: 'mass' };
const page = document.getElementById('page');
let cleanup = null, token = 0, current = null;

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  let [name, ...rest] = h.split('/');
  name = ALIAS[name] || name;
  return { name: PAGES[name] ? name : 'intro', arg: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

// 진행 표시: 지나온 단계(완료) · 지금 단계 · 아직 안 간 단계
function renderSteps(active) {
  const s = store.get();
  const act = PARENT[active] || active;
  const ai = STEPS.findIndex(x => x[0] === act);
  const reached = Math.max(s.reached ?? -1, ai);
  document.getElementById('steps').innerHTML = STEPS.map(([k, n, label], i) => {
    const cur = k === act ? ' aria-current="step"' : '';
    const st = k === act ? 'cur' : i <= reached ? 'done' : 'ahead';
    return `<a href="#/${k}"${cur} class="${st}" title="${n} ${label}${st === 'done' ? ' (완료)' : ''}"><span class="n">${n}</span><span class="t">${label}</span></a>`;
  }).join('');
  // 좁은 화면: 지금 단계가 보이도록 단계 줄을 가로로 맞춘다
  const nav = document.getElementById('steps'), curEl = nav.querySelector('[aria-current]');
  if (curEl && nav.scrollWidth > nav.clientWidth) nav.scrollLeft += curEl.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - curEl.offsetWidth) / 2;
  const top = document.querySelector('.top');
  top.style.setProperty('--prog', ai < 0 ? 0 : ((ai + 1) / STEPS.length).toFixed(3));
  const u = useOf(s.use || 'housing');
  document.getElementById('top-proj').textContent = active === 'intro' ? 'SYS.READY' : `${u.en || u.id.toUpperCase()} @ ${currentSite(s).name}`;
}

async function route() {
  const { name, arg } = parse();
  const my = ++token;
  const si = STEPS.findIndex(x => x[0] === (PARENT[name] || name));
  if (si >= 0 && si > (store.get().reached ?? -1)) store.set({ reached: si });
  renderSteps(name);
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  page.innerHTML = '<div class="empty"><span class="sx-dot acc"><i></i>LOADING MODULE…</span></div>';
  let mod;
  try { mod = await PAGES[name](); }
  catch (e) { console.error(e); page.innerHTML = '<div class="empty">페이지를 불러오지 못했습니다. 새로고침해 주세요.</div>'; return; }
  if (my !== token) return;
  page.innerHTML = '';
  document.body.dataset.page = name;
  const before = document.title;
  let c;
  try { c = mod.mount(page, arg); }
  catch (e) { console.error(e); page.innerHTML = `<div class="empty">이 화면을 그리지 못했습니다. <a href="#/use">01 용도</a>부터 다시 시작해 보세요.<br><small>${String(e && e.message || e)}</small></div>`; return; }
  cleanup = typeof c === 'function' ? c : null;
  if (document.title === before) document.title = name === 'intro' ? 'BIM·AI 건설 시뮬레이터' : `${mod.title} · BIM·AI 건설 시뮬레이터`;
  addNext(name);
  paintFoot();
  if (current !== name) { window.scrollTo(0, 0); page.focus({ preventScroll: true }); }
  current = name;
}

// 단계 페이지 끝: 이 단계에서 정한 것 → 다음 단계로 넘기는 패널 (용도·입지는 페이지 안에 시작 버튼이 있다)
function stageSummary(name) {
  try {
    const R = pipeline();
    const { gen, S, E, C } = R;
    const housing = !gen.x;
    if (name === 'mass') {
      if (housing) return [['동', fmt(gen.bldgs.filter(b => b.kind !== 'basement').length) + '동'], ['세대', fmt(gen.totals.units) + '세대'], ['최고 층수', Math.max(...gen.bldgs.map(b => b.storeys)) + '층'], ['지상 연면적', fmt(gen.totals.gfaAbove / 1e4, 1) + '만㎡']];
      const t = gen.totals;
      return [['용도', R.u.name], ['동·시설', fmt(gen.bldgs.filter(b => b.kind !== 'basement').length) + '개'], ['연면적', fmt((t.gfaAbove + (t.gfaBelow || 0)) / 1e4, 1) + '만㎡'], ['최고 높이', fmt(t.maxH || 0, 0) + 'm']];
    }
    if (name === 'schedule') return [['층 수 합계', fmt(gen.bldgs.reduce((a, b) => a + b.storeys, 0)) + '개 층'], ['세대', fmt(gen.totals.units || 0) + '세대'], ['지하 연면적', fmt((gen.totals.gfaBelow || 0) / 1e4, 1) + '만㎡'], ['주차', fmt(gen.totals.parking || 0) + '대']];
    if (name === 'method') {
      const rec = R.M.list.filter(L => (L.wp.multi ? !L.user : L.chosen === L.rec)).length;
      const done = Math.min(R.M.list.length, ((store.get().mdone || {})[projKey()]) || 0);
      return [['확정', `${done} / ${R.M.list.length} 공종`], ['공기', S.months + '개월'], ['공사비', won(E.total)], ['AI 추천 그대로', `${rec} / ${R.M.list.length} 공종`]];
    }
    if (name === 'process') return [['총 공기', S.months + '개월'], ['미해결 간섭', fmt(C.list.filter(c => !c.mit).length) + '건'], ['AI 공정 최적화', R.opt ? '적용함' : '아직'], ['작업 항목', fmt(S.acts.length) + '건']];
    if (name === 'budget') return [['총 공사비', won(E.total)], ['㎡당', fmt(E.perM2, 0) + '만원'], ['평당', fmt(E.perPy, 0) + '만원'], ['월 최대 집행', won(E.peak.total)]];
    if (name === 'risk') { const K = R.risk(); return [['P80 공기', fmt(K.mc.months.p80, 1) + '개월'], ['P80 공사비', won(K.mc.cost.p80)], ['계획 내 준공 확률', fmt(K.mc.pOnTime * 100, 0) + '%'], ['최고 위험', K.reg[0] ? K.reg[0].name : '—']]; }
  } catch (e) { console.warn(e); }
  return [];
}
function addNext(name) {
  const key = PARENT[name] || name;
  const i = STEPS.findIndex(x => x[0] === key);
  if (i < 0 || key === 'use' || key === 'site' || name === 'seoul') return;
  const last = i === STEPS.length - 1;
  const [k, n, label] = last ? ['use', '01', '다른 용도로 다시'] : STEPS[i + 1];
  const site = currentSite(store.get());
  const sum = stageSummary(name);
  const el = document.createElement('nav'); el.className = 'stage-done'; el.setAttribute('aria-label', '다음 단계');
  el.innerHTML = `<div class="sd-l"><span class="sx-code"><span class="sl">//</span> ${STEPS[i][1]}.99 SEC_DONE <b>[${STEPS[i][1]} / 07]</b></span>
      <b class="sd-t">${last ? '용도에서 위험까지, 한 바퀴를 돌았습니다.' : `${STEPS[i][2]} 단계 완료.`}</b>
      <span class="sd-s">${useOf(store.get().use || 'housing').name} · ${site.name}</span>
      ${sum.length ? `<dl class="sd-kv">${sum.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>` : ''}</div>
    <a class="sd-r" href="#/${k}"><span class="sx-code">${last ? 'RESTART' : `NEXT · ${n} / 07`}</span><span class="sd-n">${label}</span><span class="sd-go">${last ? '처음 단계로' : '다음 단계로'} <span class="ar" aria-hidden="true">→</span></span></a>`;
  page.appendChild(el);
}
// 바닥글: 지금 고른 용도·입지와 좌표
function paintFoot() {
  const st = store.get(), s = currentSite(st);
  const ns = (v, p, q) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? p : q}`;
  document.getElementById('foot-site').textContent = `${useOf(st.use || 'housing').name} · ${s.name}`;
  document.getElementById('foot-loc').textContent = `${ns(s.lat, 'N', 'S')}, ${ns(s.lng, 'E', 'W')}`;
}
// 서울 시각
const clockFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function tick() { document.getElementById('clock').textContent = 'SEOUL ' + clockFmt.format(new Date()); }
tick(); setInterval(tick, 1000);

// 테마: 기본은 검정, 누르면 밝게
function themeNow() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function paintThemeBtn() {
  const t = themeNow(), b = document.getElementById('themeBtn');
  b.innerHTML = `<i aria-hidden="true"></i><span class="tt">${t === 'light' ? 'LIGHT' : 'DARK'}</span>`;
  b.setAttribute('aria-label', `화면 테마: ${t === 'light' ? '밝게' : '어둡게'}. 눌러서 바꾸기`);
}
document.getElementById('themeBtn').addEventListener('click', () => {
  const next = themeNow() === 'light' ? 'dark' : 'light';
  if (next === 'light') document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
  try { if (next === 'light') localStorage.setItem('bim-sim-theme', 'light'); else localStorage.removeItem('bim-sim-theme'); } catch (e) { /* 무시 */ }
  paintThemeBtn();
});
paintThemeBtn();

store.subscribe(() => { renderSteps(parse().name); paintFoot(); });
window.addEventListener('hashchange', route);
route();
