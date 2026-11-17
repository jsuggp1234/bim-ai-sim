// 첫 화면: 시뮬레이터가 '돌아가는' 장면. 배경 전체에 화살표가 차선을 따라 흐르고(정보의 흐름), 붉은 데이터 패킷이 질주하며,
// 오른쪽 파이프라인 패널은 용도를 바꿔 가며 01 용도 → 07 위험까지 실제 계산 값을 한 줄씩 채운다. 아래에는 수치 티커가 흐른다.
import { onThemeChange, fmt, won } from '../pipeline.js';
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
const ROW_MS = 1250, HOLD_MS = 2600;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = (n, k = 2) => String(n).padStart(k, '0');
const hsh = (a, b = 0) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };

export function mount(root) {
  document.title = 'BIM·AI 건설 시뮬레이터';
  const nOpts = WPS.reduce((a, w) => a + w.opts.length, 0);
  root.innerHTML = `<section class="intro sysx" aria-label="시작 화면">
    <canvas class="ix-flow" id="i-flow" aria-hidden="true"></canvas>
    <div class="ix-grid" aria-hidden="true"></div>
    <aside class="ix-pipe" aria-hidden="true">
      <div class="ix-ph"><span class="ix-code">// PIPELINE.RUN</span><b id="ip-use">—</b><span class="ix-pct" id="ip-pct">000%</span></div>
      <div class="ix-pbar"><i id="ip-bar"></i></div>
      <ol class="ix-rows" id="ip-rows">${STEPS.map(([n, t, , , en], i) => `<li data-i="${i}"><span class="c">${n}</span><span class="n"><em>${en}</em><b>${t}</b></span><span class="o" id="ip-o${i}">—</span><span class="s" id="ip-s${i}">IDLE</span><i class="b"><i></i></i></li>${i < STEPS.length - 1 ? '<li class="ar" aria-hidden="true"><i></i><i></i><i></i></li>' : ''}`).join('')}</ol>
      <div class="ix-log" id="ip-log"></div>
    </aside>
    <div class="intro-copy">
      <span class="sx-code intro-kicker" id="i-kick"><span class="sl">//</span> 00.00 SYS_BOOT <b>[00 / 07]</b></span>
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
    <div class="ix-tick" aria-hidden="true"><div class="ix-tt" id="i-tick"></div></div>
    <ol class="intro-steps" id="i-steps">${STEPS.map(([n, t, d, k]) => `<li><a href="#/${k}"><span class="n">${n}</span><b>${t}</b><span>${d}</span></a></li>`).join('')}</ol>
  </section>`;
  const $ = (id) => root.querySelector('#' + id);
  [['is-u', USES.length], ['is-s', KR_SITES.length], ['is-m', nOpts], ['is-r', RISKS.length]].forEach(([id, v]) => countUp($(id), v, { ms: 1400 }));

  // ---------- 티커: 숫자와 이름이 끝없이 흐른다 ----------
  const tickItems = [
    `${USES.length} PROGRAMS`, `${KR_SITES.length} SITES`, '15 CRITERIA', `${WPS.length} WORK PACKAGES`, `${nOpts} METHODS`, `${RISKS.length} RISK MODELS`,
    '4D SCHEDULE', 'CLASH DETECTION', '5D COST', 'MONTE CARLO P80', 'AI RECOMMEND', 'BIM LOD 300',
    ...USES.map(u => u.name), ...KR_SITES.slice(0, 18).map(s => s.name),
  ];
  const tk = tickItems.map(t => `<span><i>→</i>${t}</span>`).join('');
  $('i-tick').innerHTML = tk + tk;

  // ---------- 머리 코드 글자 섞기 ----------
  scramble($('i-kick').childNodes[1], ' 00.00 SYS_BOOT ', 900);

  // ---------- 파이프라인: 용도를 바꿔 가며 7단계를 계산해 채운다 ----------
  const CYC = ['office', 'fab', 'museum', 'hospital', 'dc', 'housing', 'logistics', 'hotel', 'arena', 'bio'].map(id => USES.find(u => u.id === id)).filter(Boolean);
  const rowsEl = $('ip-rows'), stepsEl = $('i-steps');
  let loop = 0, t0 = performance.now(), cur = null, lastRow = -2, alive = true, raf = 0, logN = 0;
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
  function log(line) {
    const el = $('ip-log'), d = document.createElement('div');
    const ts = new Date(), tt = `${pad(ts.getMinutes())}:${pad(ts.getSeconds())}.${pad(Math.floor(ts.getMilliseconds() / 10))}`;
    d.innerHTML = `<span>[${tt}]</span>${line}`; el.appendChild(d); logN++;
    while (el.children.length > 5) el.firstChild.remove();
  }
  function setRow(i, state, text) {
    const li = rowsEl.querySelector(`li[data-i="${i}"]`); if (!li) return;
    li.className = state; $('ip-s' + i).textContent = state === 'run' ? 'RUN' : state === 'done' ? 'DONE ✓' : 'IDLE';
    if (text != null) $('ip-o' + i).textContent = text;
    stepsEl.children[i] && stepsEl.children[i].classList.toggle('live', state === 'run');
  }
  function startLoop() {
    const u = CYC[loop % CYC.length]; cur = planFor(u, loop + 1); loop++; t0 = performance.now(); lastRow = -1;
    $('ip-use').textContent = cur.head; flow.burst = 1;
    STEPS.forEach((_, i) => setRow(i, '', '—'));
    rowsEl.querySelectorAll('li.ar').forEach(a => a.classList.remove('on'));
  }
  function tick(now) {
    if (!alive) return; raf = requestAnimationFrame(tick);
    if (!cur) startLoop();
    const el = Math.max(0, now - t0), i = Math.floor(el / ROW_MS), f = (el % ROW_MS) / ROW_MS;
    const total = STEPS.length * ROW_MS;
    $('ip-pct').textContent = pad(Math.min(100, Math.round(el / total * 100)), 3) + '%';
    $('ip-bar').style.width = Math.min(100, el / total * 100).toFixed(1) + '%';
    if (i !== lastRow) {
      if (lastRow >= 0 && lastRow < STEPS.length) { setRow(lastRow, 'done', cur.out[lastRow]); const a = rowsEl.querySelectorAll('li.ar')[lastRow]; if (a) a.classList.add('on'); }
      if (i < STEPS.length) { setRow(i, 'run'); log(cur.log[i]); flow.spawnBurst(i); }
      else if (i === STEPS.length) { log(`BUILD OK ✓ ${cur.head} · ${STEPS.length}/7 stages`); $('ip-use').textContent = 'BUILD OK ✓'; }
      lastRow = i;
    }
    if (i < STEPS.length) { // 계산 중인 줄: 글자가 섞이다 값으로 맞춰진다
      const li = rowsEl.querySelector(`li[data-i="${i}"]`); li.style.setProperty('--f', f.toFixed(3));
      $('ip-o' + i).textContent = garble(cur.out[i], f);
    }
    if (el > total + HOLD_MS) startLoop();
  }

  // ---------- 배경: 화살표가 흐르는 차선 + 붉은 패킷 + 훑는 선 ----------
  const flow = createFlow($('i-flow'), root.querySelector('.ix-pipe'));
  if (reduce()) {
    const u = CYC[0]; cur = planFor(u, 1); $('ip-use').textContent = cur.head;
    STEPS.forEach((_, i) => setRow(i, 'done', cur.out[i])); cur.log.forEach(log);
    $('ip-pct').textContent = '100%'; $('ip-bar').style.width = '100%';
  } else raf = requestAnimationFrame(tick);
  const offTheme = onThemeChange(() => flow.theme());
  return () => { alive = false; cancelAnimationFrame(raf); offTheme(); flow.dispose(); };
}

// 글자 섞기: f(0→1)만큼 앞에서부터 맞춰지고, 나머지는 기호로 깜빡인다
const GLY = '01#/<>=+*[]_:';
function garble(s, f) {
  const n = Math.floor(s.length * Math.min(1, f * 1.25));
  let out = s.slice(0, n);
  for (let i = n; i < Math.min(s.length, n + 10); i++) out += s[i] === ' ' ? ' ' : GLY[Math.floor(Math.random() * GLY.length)];
  return out;
}
function scramble(node, final, ms) {
  if (!node || reduce()) return;
  const t0 = performance.now();
  const step = (now) => { const f = Math.min(1, (now - t0) / ms); node.textContent = garble(final, f); if (f < 1) requestAnimationFrame(step); else node.textContent = final; };
  requestAnimationFrame(step);
}

function createFlow(canvas, pipe) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, pr = 1, lanes = [], packets = [], alive = true, raf = 0, last = performance.now(), visible = true;
  let C = { ink: '#f2f2f0', acc: '#d0103a', paper: '#000' };
  const css = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
  function theme() { C = { ink: css('--ink', '#f2f2f0'), acc: css('--accent', '#d0103a'), paper: css('--paper', '#000') }; }
  const LAB = ['SITE.EVAL', 'MASS.GEN', 'WP.SEQ', 'CLASH 0', 'P80', 'GFA', 'FAR', '4D', '5D', 'BIM', 'AI.REC', 'TBM', 'LOD300', 'IFC', 'RISK.MC', 'S-CURVE', 'QTO', 'CPM'];
  function layout() {
    const r = canvas.getBoundingClientRect(); pr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height); canvas.width = Math.round(W * pr); canvas.height = Math.round(H * pr);
    // 머리글(위)과 단계 목록(아래)은 비워 둔다
    const gap = W < 700 ? 30 : 26, y0 = 70, n = Math.max(1, Math.floor((H - y0 - 120) / gap));
    lanes = Array.from({ length: n }, (_, i) => {
      const r1 = hsh(i, 1), r2 = hsh(i, 2), r3 = hsh(i, 3);
      return { y: y0 + i * gap + gap / 2, dir: r1 < 0.22 ? -1 : 1, v: 16 + r2 * 70, sp: 18 + Math.floor(r3 * 4) * 12, kind: Math.floor(hsh(i, 4) * 3), a: 0.06 + hsh(i, 5) * 0.12, off: hsh(i, 6) * 400 };
    });
  }
  function spawn(fast) {
    if (!lanes.length) return;
    const L = lanes[Math.floor(Math.random() * lanes.length)];
    packets.push({ L, x: L.dir > 0 ? -160 : W + 160, v: (fast ? 520 : 300) + Math.random() * 380, len: 50 + Math.random() * 120, lab: LAB[Math.floor(Math.random() * LAB.length)] + ' ' + (Math.random() * 100).toFixed(Math.random() < 0.5 ? 0 : 1) });
  }
  let acc = 0;
  const api = {
    burst: 0, theme,
    spawnBurst(i) { for (let k = 0; k < 3 + (i % 3); k++) spawn(true); },
    dispose() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); },
  };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function draw(now) {
    if (!alive) return; raf = requestAnimationFrame(draw);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    const t = now / 1000, still = reduce();
    ctx.setTransform(pr, 0, 0, pr, 0, 0); ctx.clearRect(0, 0, W, H);
    const scanX = still ? -999 : ((t / 7) % 1) * (W + 300) - 150;
    const pipeR = pipe && pipe.offsetParent ? pipe.getBoundingClientRect() : null, cr = canvas.getBoundingClientRect();
    // 화살표 차선 (왼쪽 글 영역은 옅게, 훑는 선 가까이는 밝게)
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
    for (const L of lanes) {
      const s = L.sp, sh = ((still ? 0 : t * L.v * L.dir) + L.off) % s;
      for (let x = -s + (sh < 0 ? sh + s : sh); x < W + s; x += s) {
        const fade = (W < 700 ? 0.55 : 1) * (0.25 + 0.75 * sm(W * 0.18, W * 0.62, x)), glow = Math.max(0, 1 - Math.abs(x - scanX) / 90);
        const a = Math.min(0.85, L.a * fade + glow * 0.45 * fade);
        if (a < 0.02) continue;
        ctx.globalAlpha = a; const y = L.y, d = L.dir;
        ctx.beginPath();
        if (L.kind === 0) { ctx.moveTo(x - 3 * d, y - 4); ctx.lineTo(x + 2 * d, y); ctx.lineTo(x - 3 * d, y + 4); } // ›
        else if (L.kind === 1) { ctx.moveTo(x - 7 * d, y); ctx.lineTo(x + 4 * d, y); ctx.moveTo(x, y - 3); ctx.lineTo(x + 4 * d, y); ctx.lineTo(x, y + 3); } // →
        else { ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); } // —
        ctx.stroke();
      }
    }
    // 훑는 선
    if (!still) {
      const g = ctx.createLinearGradient(scanX - 120, 0, scanX + 4, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, C.acc);
      ctx.globalAlpha = 0.16; ctx.fillStyle = g; ctx.fillRect(scanX - 120, 0, 124, H);
      ctx.globalAlpha = 0.7; ctx.fillStyle = C.acc; ctx.fillRect(scanX, 0, 1, H);
    }
    // 붉은 패킷: 긴 화살표 + 꼬리 + 이름표
    if (!still) { acc += dt; const every = 0.42; while (acc > every) { acc -= every; if (packets.length < 14) spawn(false); } }
    ctx.font = `500 10px ${getComputedStyle(document.documentElement).getPropertyValue('--f-mono') || 'monospace'}`;
    packets = packets.filter(p => {
      p.x += p.v * dt * p.L.dir; const d = p.L.dir, y = p.L.y, x = p.x;
      if (d > 0 ? x - p.len > W + 40 : x + p.len < -40) return false;
      // 파이프라인 패널 뒤는 지나가지 않고 패널 가장자리에서 '들어간다'
      if (pipeR && d > 0 && x > pipeR.left - cr.left && y > pipeR.top - cr.top && y < pipeR.bottom - cr.top) { p.hit = (p.hit || 0) + dt; if (p.hit > 0.25) return false; }
      const g = ctx.createLinearGradient(x - p.len * d, 0, x, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, C.acc);
      const fz = 0.28 + 0.72 * sm(W * 0.08, W * 0.5, x); // 왼쪽 글 영역에서는 옅게
      ctx.globalAlpha = (p.hit ? 1 - p.hit * 4 : 0.95) * fz; ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - p.len * d, y); ctx.lineTo(x, y); ctx.stroke();
      ctx.strokeStyle = C.acc; ctx.beginPath(); ctx.moveTo(x - 6 * d, y - 4); ctx.lineTo(x, y); ctx.lineTo(x - 6 * d, y + 4); ctx.stroke();
      ctx.fillStyle = C.acc; ctx.globalAlpha *= 0.85; ctx.fillText(p.lab, d > 0 ? x - p.len * 0.9 : x + 10, y - 6);
      return true;
    });
    ctx.globalAlpha = 1;
  }
  const ro = new ResizeObserver(layout); ro.observe(canvas);
  const onVis = () => { visible = !document.hidden; }; document.addEventListener('visibilitychange', onVis);
  theme(); layout(); raf = requestAnimationFrame(draw);
  for (let i = 0; i < 6; i++) { spawn(false); if (packets.length) packets[packets.length - 1].x = Math.random() * W; }
  return api;
}
