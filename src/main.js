// 단계 라우터: #/ → #/site → #/mass → #/schedule → #/process → #/budget (GitHub Pages에서도 동작하도록 해시 경로)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import { store } from './store.js';

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
  const c = mod.mount(page, arg);
  cleanup = typeof c === 'function' ? c : null;
  document.title = `${mod.title} · 용산 BIM·AI 건설 시뮬레이터`;
  if (current !== name) { window.scrollTo(0, 0); page.focus({ preventScroll: true }); }
  current = name;
}

// 테마: 자동 → 밝게 → 어둡게
const THEMES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
function themeNow() { const t = document.documentElement.dataset.theme; return t === 'light' || t === 'dark' ? t : 'auto'; }
function paintThemeBtn() { const t = themeNow(); const b = document.getElementById('themeBtn'); b.innerHTML = '◐<span class="tt"> ' + THEMES.find(x => x[0] === t)[1] + '</span>'; b.setAttribute('aria-label', `화면 테마: ${({ auto: '자동', light: '밝게', dark: '어둡게' })[t]}. 눌러서 바꾸기`); }
document.getElementById('themeBtn').addEventListener('click', () => {
  const i = THEMES.findIndex(x => x[0] === themeNow()), next = THEMES[(i + 1) % THEMES.length][0];
  if (next === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
  try { if (next === 'auto') localStorage.removeItem('bim-sim-theme'); else localStorage.setItem('bim-sim-theme', next); } catch (e) { /* 무시 */ }
  paintThemeBtn();
});
paintThemeBtn();

store.subscribe(() => renderSteps(parse().name));
window.addEventListener('hashchange', route);
route();
