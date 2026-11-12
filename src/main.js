// 단계 라우터: #/ → #/site → #/mass → #/schedule → #/process → #/budget (GitHub Pages에서도 동작하도록 해시 경로)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import { store, currentSite } from './store.js';

const PAGES = {
  home: () => import('./pages/home.js'),
  site: () => import('./pages/site.js'),
  mass: () => import('./pages/mass.js'),
  schedule: () => import('./pages/schedule.js'),
  process: () => import('./pages/process.js'),
  budget: () => import('./pages/budget.js'),
};
const ALIAS = { next: 'process', '': 'home' };
const STEPS = [
  ['site', '01', '택지 선정'],
  ['mass', '02', '매스 배치'],
  ['schedule', '03', '층별 일람표'],
  ['process', '04', '4D 공정'],
  ['budget', '05', '5D 예산'],
];
const page = document.getElementById('page');
let cleanup = null, token = 0, current = null;

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  let [name, ...rest] = h.split('/');
  name = ALIAS[name] || name;
  return { name: PAGES[name] ? name : 'home', arg: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

function renderSteps(active) {
  const s = store.get();
  const done = { site: !!s.handoff1, mass: !!s.mass, schedule: !!s.seen3, process: !!s.proc, budget: !!s.cost };
  document.getElementById('steps').innerHTML = STEPS.map(([k, n, label], i) => {
    const cur = k === active ? ' aria-current="page"' : '';
    return (i ? '<i class="cn" aria-hidden="true"></i>' : '') +
      `<a href="#/${k}"${cur} class="${done[k] && k !== active ? 'done' : ''}" title="${n} ${label}"><span class="n">${n}</span><span class="t">${label}</span></a>`;
  }).join('');
}

async function route() {
  const { name, arg } = parse();
  const my = ++token;
  renderSteps(name);
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  page.innerHTML = '<div class="empty">LOADING…</div>';
  let mod;
  try { mod = await PAGES[name](); }
  catch (e) { console.error(e); page.innerHTML = '<div class="empty">페이지를 불러오지 못했습니다. 새로고침해 주세요.</div>'; return; }
  if (my !== token) return;
  page.innerHTML = '';
  document.body.dataset.page = name;
  const before = document.title;
  const c = mod.mount(page, arg);
  cleanup = typeof c === 'function' ? c : null;
  if (document.title === before) document.title = name === 'home' ? 'BIM·AI 건설 시뮬레이터' : `${mod.title} · BIM·AI 건설 시뮬레이터`;
  addNext(name);
  paintFoot();
  if (current !== name) { window.scrollTo(0, 0); page.focus({ preventScroll: true }); }
  current = name;
}

// 단계 페이지 끝: 다음 단계로 넘어가는 큰 링크 (제품 상세의 Next Item처럼)
function addNext(name) {
  const i = STEPS.findIndex(x => x[0] === name);
  if (i < 0) return;
  const [k, n, label] = i < STEPS.length - 1 ? STEPS[i + 1] : ['site', '01', '다른 택지로 다시'];
  const el = document.createElement('nav'); el.className = 'next-item'; el.setAttribute('aria-label', '다음 단계');
  el.innerHTML = `<a href="#/${k}"><span class="k">next item</span><span class="t">${label}<span class="n">${n}</span></span><span class="ar" aria-hidden="true">→</span></a>`;
  page.appendChild(el);
}
// 바닥글: 지금 고른 택지와 좌표
function paintFoot() {
  const s = currentSite(store.get());
  const ns = (v, p, q) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? p : q}`;
  document.getElementById('foot-site').textContent = s.name;
  document.getElementById('foot-loc').textContent = `${ns(s.lat, 'N', 'S')}, ${ns(s.lng, 'E', 'W')}`;
}
// 서울 시각
const clockFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function tick() { document.getElementById('clock').textContent = 'seoul ' + clockFmt.format(new Date()); }
tick(); setInterval(tick, 1000);

// 테마: 자동 → 밝게 → 어둡게
const THEMES = [['auto', 'auto'], ['light', 'light'], ['dark', 'dark']];
function themeNow() { const t = document.documentElement.dataset.theme; return t === 'light' || t === 'dark' ? t : 'auto'; }
function paintThemeBtn() { const t = themeNow(); const b = document.getElementById('themeBtn'); b.innerHTML = '◐<span class="tt"> ' + THEMES.find(x => x[0] === t)[1] + '</span>'; b.setAttribute('aria-label', `화면 테마: ${({ auto: '자동', light: '밝게', dark: '어둡게' })[t]}. 눌러서 바꾸기`); }
document.getElementById('themeBtn').addEventListener('click', () => {
  const i = THEMES.findIndex(x => x[0] === themeNow()), next = THEMES[(i + 1) % THEMES.length][0];
  if (next === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
  try { if (next === 'auto') localStorage.removeItem('bim-sim-theme'); else localStorage.setItem('bim-sim-theme', next); } catch (e) { /* 무시 */ }
  paintThemeBtn();
});
paintThemeBtn();

store.subscribe(() => { renderSteps(parse().name); paintFoot(); });
window.addEventListener('hashchange', route);
route();
