// 단계 라우터: #/site → #/mass → #/schedule → #/next (GitHub Pages에서도 동작하도록 해시 경로)
import './styles.css';
import { store } from './store.js';

const PAGES = {
  site: () => import('./pages/site.js'),
  mass: () => import('./pages/mass.js'),
  schedule: () => import('./pages/schedule.js'),
  next: () => import('./pages/next.js'),
};
const STEPS = [
  ['site', '1', '택지 선정'],
  ['mass', '2', '매스 배치'],
  ['schedule', '3', '층별 일람표'],
  ['next', '4', '공정·예산'],
];
const page = document.getElementById('page');
let cleanup = null, token = 0, current = null;

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  return { name: PAGES[name] ? name : 'site', arg: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

function renderSteps(active) {
  const s = store.get();
  const done = { site: !!s.handoff1, mass: !!s.mass && s.massFrom !== null, schedule: false, next: false };
  document.getElementById('steps').innerHTML = STEPS.map(([k, n, label], i) => {
    const cur = k === active ? ' aria-current="page"' : '';
    const cls = [done[k] && k !== active ? 'done' : '', k === 'next' ? 'soon' : ''].filter(Boolean).join(' ');
    return (i ? '<span class="sep" aria-hidden="true">›</span>' : '') +
      `<a href="#/${k}"${cur} class="${cls}"><span class="n">${done[k] && k !== active ? '✓' : n}</span>${label}${k === 'next' ? ' (준비 중)' : ''}</a>`;
  }).join('');
}

async function route() {
  const { name, arg } = parse();
  const my = ++token;
  renderSteps(name);
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  page.innerHTML = '<div class="empty">불러오는 중…</div>';
  let mod;
  try { mod = await PAGES[name](); }
  catch (e) { page.innerHTML = '<div class="empty">페이지를 불러오지 못했습니다. 새로고침해 주세요.</div>'; return; }
  if (my !== token) return;
  page.innerHTML = '';
  const c = mod.mount(page, arg);
  cleanup = typeof c === 'function' ? c : null;
  document.title = `${mod.title} · BIM 건설 시뮬레이터`;
  if (current !== name) { window.scrollTo(0, 0); page.focus({ preventScroll: true }); }
  current = name;
}

// 테마: 자동 → 밝게 → 어둡게
const THEMES = [['auto', '테마 자동'], ['light', '밝게'], ['dark', '어둡게']];
function themeNow() { const t = document.documentElement.dataset.theme; return t === 'light' || t === 'dark' ? t : 'auto'; }
function paintThemeBtn() { const t = themeNow(); document.getElementById('themeBtn').textContent = THEMES.find(x => x[0] === t)[1]; }
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
