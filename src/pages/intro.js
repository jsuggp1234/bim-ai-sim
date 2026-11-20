// 첫 화면: 시뮬레이터가 '돌아가는' 장면. 배경 전체에 화살표가 차선을 따라 흐르고(정보의 흐름), 붉은 데이터 패킷이 질주하며,
// 오른쪽 파이프라인 패널은 용도를 바꿔 가며 01 용도 → 07 위험까지 실제 계산 값을 한 줄씩 채운다. 아래에는 수치 티커가 흐른다.
import { fmt, won } from '../pipeline.js';
import { USES } from '../sim/uses.js';
import { KR_SITES } from '../sim/kr-sites.js';
import { WPS } from '../sim/methods.js';
import { RISKS } from '../sim/risk.js';
import { rankSites, programFor } from '../sim/siting.js';
import { countUp } from '../ui/sys.js';

export const title = 'BIM·AI 건설 시뮬레이터';

const STEPS = [
  ['01', '용도', '무엇을 지을지: 주거·오피스·반도체·박물관·플랜트', 'use', 'USE'],
  ['02', '입지', '전국 후보지를 용도별 기준으로 평가', 'site', 'SITE'],
  ['03', '매스', '형태를 고르고 동을 배치하고 물량 산출', 'mass', 'MASS'],
  ['04', '공법·재료', '공종마다 AI가 공법을 추천하고 시공을 시뮬레이션', 'method', 'METHOD'],
  ['05', '4D·간섭', '공정을 짜고 간섭을 찾아 AI가 최적화', 'process', 'CLASH'],
  ['06', '5D 예산', '공정에 따라 쌓이는 공사비', 'budget', 'COST'],
  ['07', '위험 예측', '위험 등록부와 몬테카를로 확률', 'risk', 'RISK'],
];
const pad = (n, k = 2) => String(n).padStart(k, '0');
const hsh = (a, b = 0) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };

export function mount(root) {
  document.title = 'BIM·AI 건설 시뮬레이터';
  const nOpts = WPS.reduce((a, w) => a + w.opts.length, 0);
  root.innerHTML = `<section class="intro sysx" aria-label="시작 화면">
    <aside class="ix-pipe" aria-hidden="true">
      <div class="ix-ph"><span class="ix-code">7단계 결과 예시</span><b id="ip-use">—</b><span class="ix-pct" id="ip-pct">000%</span></div>
      <div class="ix-pbar"><i id="ip-bar"></i></div>
      <ol class="ix-rows" id="ip-rows">${STEPS.map(([n, t, , , en], i) => `<li data-i="${i}"><span class="c">${n}</span><span class="n"><em>${en}</em><b>${t}</b></span><span class="o" id="ip-o${i}">—</span><span class="s" id="ip-s${i}">IDLE</span><i class="b"><i></i></i></li>${i < STEPS.length - 1 ? '<li class="ar" aria-hidden="true"><i></i><i></i><i></i></li>' : ''}`).join('')}</ol>
    </aside>
    <div class="intro-copy">
      <h1>Build it <em>before</em><br>you build it<span class="ix-dot">.</span></h1>
      <p>용도를 정하고, 전국에서 입지를 고르고, 형태를 만들고, 공법을 고르고,<br>공정·간섭·예산·위험까지 BIM 모델 하나로 계산합니다. 짓기 전에 화면 위에서 먼저 지어 봅니다.</p>
      <dl class="intro-stats">
        <div><dt>용도</dt><dd id="is-u">0</dd></div>
        <div><dt>전국 후보지</dt><dd id="is-s">0</dd></div>
        <div><dt>공법·기술</dt><dd id="is-m">0</dd></div>
        <div><dt>위험 모델</dt><dd id="is-r">0</dd></div>
      </dl>
      <div class="intro-cta">
        <a class="btn acc big ix-go" href="#/use" id="i-start">시작하기 <span class="ar" aria-hidden="true">→</span></a>
        <span class="note">01 용도부터 07 위험 예측까지, 7단계 <span class="ix-arrows" aria-hidden="true"><i>›</i><i>›</i><i>›</i></span></span>
      </div>
    </div>
    <ol class="intro-steps" id="i-steps">${STEPS.map(([n, t, d, k]) => `<li><a href="#/${k}"><span class="n">${n}</span><b>${t}</b><span>${d}</span></a></li>`).join('')}</ol>
  </section>`;
  const $ = (id) => root.querySelector('#' + id);
  [['is-u', USES.length], ['is-s', KR_SITES.length], ['is-m', nOpts], ['is-r', RISKS.length]].forEach(([id, v]) => countUp($(id), v, { ms: 1400 }));

  // ---------- 파이프라인 예시: 한 용도의 7단계 결과 ----------
  const CYC = ['office', 'fab', 'museum', 'hospital', 'dc', 'housing', 'logistics', 'hotel', 'arena', 'bio'].map(id => USES.find(u => u.id === id)).filter(Boolean);
  const rowsEl = $('ip-rows'), stepsEl = $('i-steps');
  function planFor(u, k) {
    const R = rankSites(u.id), top = R[0], pg = top ? programFor(top.site, u.id) : null;
    const wp = WPS[Math.floor(hsh(k, 3) * WPS.length)], op = wp.opts[Math.floor(hsh(k, 4) * wp.opts.length)];
    const clash = 6 + Math.floor(hsh(k, 5) * 14), m0 = u.months ? u.months[0] : 30, m1 = u.months ? u.months[1] : 40;
    const rk = RISKS[Math.floor(hsh(k, 6) * RISKS.length)];
    return {
      head: `${u.code} · ${u.en}`,
      out: [
        `${u.name}`,
        top ? `${top.site.name} · ${top.score}점` : '—',
        pg ? `연면적 ${fmt(pg.gfa / 1e4, 1)}만㎡ · 용적률 ${pg.far}%` : '—',
        `${wp.code} ${wp.name} → ${op.name}`,
        `공기 ${Math.round((m0 + m1) / 2)}개월 · 간섭 ${clash}→0건`,
        pg ? `공사비 ${won(pg.cost)}` : '—',
        `P80 +${(4 + hsh(k, 7) * 9).toFixed(1)}% · ${rk.name}`,
      ],
      log: [
        `LOAD PROGRAM ${u.code} ${u.en} · 가중치 15항목`,
        `SITE.EVAL ${KR_SITES.length} sites → ${R.length} eligible · TOP ${top ? top.site.name : '—'}`,
        `MASS.GEN FAR ${pg ? pg.far : '—'}% · GFA ${pg ? fmt(pg.gfa) : '—'}㎡`,
        `METHOD.REC ${WPS.length} WP × ${nOpts} opts · ${wp.code} → ${op.name}`,
        `CLASH.SCAN ${clash} found → resequence → 0 open`,
        `COST.5D ${pg ? won(pg.cost) : '—'} · S-curve ok`,
        `RISK.MC n=2000 · ${rk.name}`,
      ],
    };
  }
  function setRow(i, state, text) {
    const li = rowsEl.querySelector(`li[data-i="${i}"]`); if (!li) return;
    li.className = state; $('ip-s' + i).textContent = state === 'run' ? 'RUN' : state === 'done' ? 'DONE ✓' : 'IDLE';
    if (text != null) $('ip-o' + i).textContent = text;
    stepsEl.children[i] && stepsEl.children[i].classList.toggle('live', state === 'run');
  }
  // 첫 화면은 조용하게: 배경 흐름·흘러가는 글·깜박이는 계산 연출 없이, 한 용도의 결과 예시를 그대로 보여 준다
  const cur = planFor(CYC[0], 1); $('ip-use').textContent = cur.head;
  STEPS.forEach((_, i) => setRow(i, 'done', cur.out[i]));
  $('ip-pct').textContent = ''; $('ip-bar').style.width = '100%';
  return () => {};
}
