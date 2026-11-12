// 단계 라우터: #/(시작 화면) → #/site → #/mass → #/schedule → #/process → #/budget (GitHub Pages에서도 동작하도록 해시 경로)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import { store, currentSite } from './store.js';
import { pipeline, fmt, won } from './pipeline.js';

const PAGES = {
  intro: () => import('./pages/intro.js'),
  site: () => import('./pages/site.js'),
  mass: () => import('./pages/mass.js'),
  schedule: () => import('./pages/schedule.js'),
  process: () => import('./pages/process.js'),
  budget: () => import('./pages/budget.js'),
};
const ALIAS = { next: 'process', '': 'intro', home: 'intro' };
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
  return { name: PAGES[name] ? name : 'intro', arg: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

// 진행 표시: 지나온 단계(완료) · 지금 단계 · 아직 안 간 단계
function renderSteps(active) {
  const s = store.get();
  const ai = STEPS.findIndex(x => x[0] === active);
  const reached = Math.max(s.reached ?? -1, ai);
  document.getElementById('steps').innerHTML = STEPS.map(([k, n, label], i) => {
    const cur = k === active ? ' aria-current="step"' : '';
    const st = k === active ? 'cur' : i < reached || (i === reached && k !== active) ? 'done' : 'ahead';
    return (i ? `<i class="cn${i <= reached ? ' on' : ''}" aria-hidden="true"></i>` : '') +
      `<a href="#/${k}"${cur} class="${st}" title="${n} ${label}${st === 'done' ? ' (완료)' : ''}"><span class="n">${st === 'done' ? '✓' : n}</span><span class="t">${label}</span></a>`;
  }).join('');
  document.querySelector('.top').style.setProperty('--prog', ai < 0 ? 0 : ((ai + 1) / STEPS.length).toFixed(3));
}

async function route() {
  const { name, arg } = parse();
  const my = ++token;
  const si = STEPS.findIndex(x => x[0] === name);
  if (si >= 0 && si > (store.get().reached ?? -1)) store.set({ reached: si });
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
  if (document.title === before) document.title = name === 'intro' ? 'BIM·AI 건설 시뮬레이터' : `${mod.title} · BIM·AI 건설 시뮬레이터`;
  addNext(name);
  paintFoot();
  if (current !== name) { window.scrollTo(0, 0); page.focus({ preventScroll: true }); }
  current = name;
}

// 단계 페이지 끝: 이 단계에서 정한 것 → 다음 단계로 넘기는 패널 (택지 선정은 페이지 안에 '프로젝트 시작'이 있다)
const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1); return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b); };
function stageSummary(name) {
  try {
    const { gen, Q, S, E } = pipeline();
    const maxF = Math.max(...gen.bldgs.map(b => b.storeys));
    if (name === 'mass') return [['동', fmt(gen.bldgs.length) + '동'], ['세대', fmt(gen.totals.units) + '세대'], ['최고 층수', maxF + '층'], ['지상 연면적', fmt(gen.totals.gfaAbove / 1e4, 1) + '만㎡']];
    if (name === 'schedule') return [['층 수 합계', fmt(gen.bldgs.reduce((a, b) => a + b.storeys, 0)) + '개 층'], ['세대', fmt(gen.totals.units) + '세대'], ['지하 연면적', fmt(gen.totals.gfaBelow / 1e4, 1) + '만㎡'], ['주차', fmt(gen.totals.parking) + '대']];
    if (name === 'process') return [['총 공기', S.months + '개월'], ['착공', String(S.p ? S.p.start : '').replace('-', '.')], ['공정 단계', S.phases.filter(p => p.n).length + '단계'], ['작업 항목', fmt(S.acts.length) + '건']];
    if (name === 'budget') return [['총사업비(공사)', won(E.total)], ['㎡당', fmt(E.perM2, 0) + '만원'], ['평당', fmt(E.perPy, 0) + '만원'], ['월 최대 집행', won(E.peak.total)]];
  } catch (e) { /* 계산 실패 시 요약 없이 */ }
  return [];
}
function addNext(name) {
  const i = STEPS.findIndex(x => x[0] === name);
  if (i < 0 || name === 'site') return;
  const last = i === STEPS.length - 1;
  const [k, n, label] = last ? ['site', '01', '다른 택지로 다시'] : STEPS[i + 1];
  const site = currentSite(store.get());
  const sum = stageSummary(name);
  const el = document.createElement('nav'); el.className = 'stage-done'; el.setAttribute('aria-label', '다음 단계');
  el.innerHTML = `<div class="sd-l"><span class="label-sm">stage ${STEPS[i][1]} ${last ? '· 시뮬레이션 완료' : '완료'} · ${site.name}</span>
      <b class="sd-t">${last ? '택지에서 예산까지 한 바퀴를 돌았습니다.' : `${josa(STEPS[i][2], '을', '를')} 마쳤습니다.`}</b>
      ${sum.length ? `<dl class="sd-kv">${sum.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>` : ''}</div>
    <a class="sd-r" href="#/${k}"><span class="label-sm">${last ? 'restart' : `next · stage ${n}`}</span><span class="sd-n">${label}</span><span class="sd-go">${last ? '처음 단계로' : '다음 단계로'} <span class="ar" aria-hidden="true">→</span></span></a>`;
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
