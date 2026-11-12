// 지하 시공 단면 시뮬레이션 (SVG): 지층·지하수위·고른 흙막이·지보·차수·기초·지반개량 공법으로
// 지반조사 → 지반 개량 → 흙막이 → 단계 굴착(+지보) → 기초 → 지하 골조 → 지상 착수 순서를 단계별로 그린다.
const r1 = (v) => Math.round(v * 10) / 10;

// 고른 공법으로 단계 목록을 만든다
export function sectionSteps(ids, d, cond, nB) {
  const depth = Math.max(3, d.depth), topdown = ids.support === 'topdown' || ids.base === 'topdown' || ids.base === 'updown' || ids.base === 'semi';
  const stepH = topdown ? Math.max(3.4, depth / Math.max(1, nB)) : 3.6;
  const lv = Math.max(1, Math.ceil(depth / stepH));
  const steps = [{ k: 'survey', t: '지반조사', d: ids.survey === 'ai' ? '시추 + 물리탐사 + 기존 자료로 3D 지층 모델 생성' : ids.survey === 'geo' ? '시추 + 전기비저항·탄성파 탐사' : ids.survey === 'cpt' ? '시추 + 콘관입시험으로 연약층 두께 측정' : '표준관입시험 시추' }];
  if (ids.improve && ids.improve !== 'none') steps.push({ k: 'improve', t: '지반 개량', d: { pbd: 'PBD 배수재 타입 + 선행 재하로 압밀', scp: '모래다짐말뚝으로 복합 지반', dcm: '시멘트 심층혼합 개량체 기둥', vac: '진공 펌프로 압밀 촉진' }[ids.improve] });
  steps.push({ k: 'wall', t: '흙막이·차수벽', d: { hpile: 'H형강 근입 → 굴착하며 토류판', sheet: '강널말뚝 진동 관입', cip: 'CIP 말뚝 + 사이 차수 그라우팅', scw: '소일시멘트 연속벽 + H형강', dwall: '안정액 굴착 → 철근망 → 트레미 타설 (영구 지하벽)', open: '경사 사면 굴착 (흙막이 없음)', nail: '단계 굴착하며 네일·숏크리트' }[ids.wall] + (ids.water && ids.water !== 'none' ? ` · 차수 ${({ grout: 'LW 그라우팅', jsp: '고압분사 차수', dewater: '디워터링 우물', drain: '영구 배수', anchor: '부력 앵커' })[ids.water]}` : '') });
  if (topdown) steps.push({ k: 'td0', t: '1층 슬래브 선시공', d: '기둥(철골)을 먼저 박고 지상 1층 바닥을 타설해 버팀으로 사용' });
  for (let i = 1; i <= lv; i++) steps.push({ k: 'ex', i, t: `${i}단 굴착`, d: topdown ? `슬래브 아래로 굴착 → B${Math.min(nB, i)} 슬래브 타설` : `GL−${r1(Math.min(depth, i * stepH))}m까지 굴착 → ${({ strut: '버팀보·띠장', anchor: '어스앵커 천공·긴장', raker: '레이커', sps: 'SPS 철골 버팀', self: '지보 없음 (자립)' })[ids.support] || '지보'} 설치` });
  steps.push({ k: 'found', t: '기초', d: { mat: '전면 매트 타설', phc: 'PHC 파일 항타 → 매트', bored: '대구경 현장타설말뚝 → 매트', piledraft: '파일 래프트', steel: '강관 말뚝 → 매트', micro: '마이크로파일 → 매트' }[ids.found] || '기초 타설' });
  steps.push({ k: 'base', t: topdown ? '지하 마감·코어 연결' : '지하 골조 (순타)', d: topdown ? '최하층 매트 연결, 지하 벽·코어 마무리' : `B${nB}부터 B1까지 바닥·벽 차례로, 지보 해체` });
  steps.push({ k: 'super', t: '지상 골조', d: topdown ? '역타: 지하와 동시에 지상 골조 진행' : '지하 완료 후 지상 골조 착수' });
  return { steps, lv, stepH, topdown, depth };
}

// SVG 그리기. step: 0..steps.length-1
export function sectionSVG(ids, d, cond, nB, step, W = 920, H = 430) {
  const plan = sectionSteps(ids, d, cond, nB);
  const { steps, stepH, topdown, depth } = plan;
  const cur = steps[Math.min(step, steps.length - 1)];
  const idx = (k) => steps.findIndex(s => s.k === k);
  const reached = (k, i) => { const j = i != null ? steps.findIndex(s => s.k === k && s.i === i) : idx(k); return j >= 0 && step >= j; };
  const gw = cond.gw, rock = cond.rockDepth;
  const bottom = Math.max(depth * 1.9 + 6, rock + 6, 30);
  const y0 = 70, sc = (H - y0 - 22) / bottom, Y = (m) => y0 + m * sc;
  const cx = W / 2, pw = Math.min(520, W * 0.56), L = cx - pw / 2, Rr = cx + pw / 2;
  const out = [];
  const P = (s) => out.push(s);
  // 지층
  const G = cond.ground;
  const layers = G === 'R' ? [[0, 1.5, 'fill', '매립·표토'], [1.5, Math.max(2, rock), 'wr', '풍화암'], [Math.max(2, rock), bottom, 'rock', '경암']]
    : G === 'W' ? [[0, 2, 'fill', '매립·표토'], [2, rock * 0.55, 'soil', '풍화토'], [rock * 0.55, rock, 'wr', '풍화암'], [rock, bottom, 'rock', '연암·경암']]
      : G === 'S' ? [[0, 2, 'fill', '매립·표토'], [2, rock * 0.75, 'sand', '충적 모래·자갈'], [rock * 0.75, rock, 'wr', '풍화암'], [rock, bottom, 'rock', '기반암']]
        : G === 'C' ? [[0, 2, 'fill', '매립·표토'], [2, Math.min(rock * 0.7, 28), 'clay', '연약 점토 (해성)'], [Math.min(rock * 0.7, 28), rock, 'sand', '모래·자갈'], [rock, bottom, 'rock', '기반암']]
          : [[0, 6, 'fillw', '준설 매립토'], [6, Math.min(rock * 0.7, 30), 'clay', '연약 점토'], [Math.min(rock * 0.7, 30), rock, 'sand', '모래·자갈'], [rock, bottom, 'rock', '기반암']];
  P(`<defs>
    <pattern id="p-sand" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" class="pt"/><circle cx="6" cy="6" r=".7" class="pt"/></pattern>
    <pattern id="p-clay" width="14" height="6" patternUnits="userSpaceOnUse"><path d="M1 3h7" class="pt-l"/></pattern>
    <pattern id="p-rock" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" class="pt-l"/></pattern>
    <pattern id="p-wr" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L10 0" class="pt-l" stroke-dasharray="2 3"/></pattern>
    <pattern id="p-fill" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M2 3l2 2M6 6l1 -2" class="pt-l"/></pattern>
  </defs>`);
  layers.forEach(([a, b, k, nm]) => { if (b <= a) return; P(`<rect class="st st-${k}" x="0" y="${Y(a)}" width="${W}" height="${Y(b) - Y(a)}"/><rect x="0" y="${Y(a)}" width="${W}" height="${Y(b) - Y(a)}" fill="url(#p-${k === 'fillw' ? 'fill' : k === 'soil' ? 'fill' : k})" opacity=".55"/><text class="st-lab" x="10" y="${Y(a) + 14}">${nm}</text>`); });
  // 지하수위
  if (gw < bottom) P(`<path class="gw" d="M0 ${Y(gw)}H${W}"/><text class="gw-t" x="${W - 10}" y="${Y(gw) - 5}" text-anchor="end">▽ 지하수위 GL−${gw}m</text>`);
  // 지반조사: 시추공
  if (reached('survey')) {
    [0.12, 0.5, 0.88].forEach((f, i) => { const x = L - 60 + (pw + 120) * f, dd = Math.min(bottom - 2, Math.max(depth * 1.6, rock + 3)); P(`<path class="bore" d="M${x} ${Y(0)}V${Y(dd)}"/>`); for (let m = 1.5; m < dd; m += 3) P(`<circle class="spt" cx="${x}" cy="${Y(m)}" r="2"/>`); if (step === idx('survey')) P(`<path class="rig" d="M${x - 7} ${Y(0)}L${x} ${Y(0) - 26}L${x + 7} ${Y(0)}"/>`); });
    if (ids.survey === 'ai' || ids.survey === 'geo') { for (let m = 3; m < bottom - 2; m += 4) P(`<path class="geo" d="M${L - 60} ${Y(m)}H${Rr + 60}"/>`); }
  }
  // 지반 개량
  if (reached('improve')) {
    const k = ids.improve, top = 0, bot = Math.min(bottom - 2, Math.max(depth + 6, 18));
    for (let x = L - 40; x <= Rr + 40; x += k === 'dcm' ? 22 : 12) P(k === 'dcm' ? `<rect class="imp" x="${x - 6}" y="${Y(top + 1)}" width="12" height="${Y(bot) - Y(top + 1)}"/>` : `<path class="imp-l" d="M${x} ${Y(top + 1)}V${Y(bot)}"/>`);
  }
  // 흙막이 벽
  const open = ids.wall === 'open';
  const embed = Math.min(bottom - 1, depth + Math.max(3, depth * 0.45));
  if (reached('wall')) {
    if (open) { /* 사면: 굴착 단계에서 */ }
    else {
      const th = ids.wall === 'dwall' ? 9 : ids.wall === 'scw' ? 8 : ids.wall === 'cip' ? 7 : 4;
      [L, Rr].forEach(x => P(`<rect class="wall w-${ids.wall}" x="${x - th / 2}" y="${Y(-0.3)}" width="${th}" height="${Y(embed) - Y(-0.3)}"/>`));
      if (ids.water === 'grout' || ids.water === 'jsp') [L, Rr].forEach(x => P(`<rect class="grout" x="${x - 16}" y="${Y(Math.max(0, gw - 1))}" width="32" height="${Y(Math.min(bottom - 1, embed + 3)) - Y(Math.max(0, gw - 1))}"/>`));
      if (ids.water === 'dewater') [L - 50, Rr + 50].forEach(x => P(`<path class="well" d="M${x} ${Y(0)}V${Y(Math.min(bottom - 1, depth + 6))}"/><circle class="well-p" cx="${x}" cy="${Y(0) - 5}" r="4"/>`));
    }
  }
  // 굴착 (단계)
  let dug = 0;
  steps.forEach((s, j) => { if (s.k === 'ex' && step >= j) dug = Math.min(depth, s.i * stepH); });
  if (reached('found')) dug = depth;
  if (dug > 0) {
    if (open) {
      const sl = dug * sc; P(`<path class="pit" d="M${L - sl} ${Y(0)}L${L} ${Y(dug)}H${Rr}L${Rr + sl} ${Y(0)}Z"/><path class="slope" d="M${L - sl} ${Y(0)}L${L} ${Y(dug)}M${Rr} ${Y(dug)}L${Rr + sl} ${Y(0)}"/>`);
    } else P(`<rect class="pit" x="${L + 4}" y="${Y(0)}" width="${pw - 8}" height="${Y(dug) - Y(0)}"/>`);
    if (gw < dug && !reached('found')) P(`<rect class="pump" x="${cx - 6}" y="${Y(dug) - 10}" width="12" height="10"/>`);
  }
  // 지보
  if (!open) steps.forEach((s, j) => {
    if (s.k !== 'ex' || step < j || ids.support === 'self') return;
    const lvY = Math.max(1.2, (s.i - 1) * stepH + 1.2);
    if (topdown || ids.support === 'topdown') return; // 역타는 슬래브가 지보
    const gone = reached('base') && step > idx('base') - 0; // 순타 지하 골조 후 해체
    if (gone) return;
    if (ids.support === 'anchor') [[L, -1], [Rr, 1]].forEach(([x, sx]) => P(`<path class="anc" d="M${x} ${Y(lvY)}l${sx * 110} ${Math.min(80, sc * 6)}"/><circle class="anc-h" cx="${x + sx * 110}" cy="${Y(lvY) + Math.min(80, sc * 6)}" r="3"/>`));
    else if (ids.support === 'raker') { if (s.i === 1) [[L, 1], [Rr, -1]].forEach(([x, sx]) => P(`<path class="strut" d="M${x} ${Y(1.2)}L${x + sx * pw * 0.28} ${Y(Math.max(dug - 0.4, 2))}"/>`)); }
    else P(`<path class="strut" d="M${L + 4} ${Y(lvY)}H${Rr - 4}"/>${ids.support === 'sps' ? `<path class="strut sps" d="M${L + 4} ${Y(lvY) + 4}H${Rr - 4}"/>` : ''}`);
  });
  // 역타 슬래브
  if (topdown) {
    if (reached('td0')) P(`<rect class="slab" x="${L}" y="${Y(0) - 3}" width="${pw}" height="6"/>`);
    const cols = 5; if (reached('td0')) for (let i = 1; i < cols; i++) { const x = L + pw * i / cols; P(`<path class="kingpost" d="M${x} ${Y(0)}V${Y(Math.min(bottom - 1, depth + 6))}"/>`); }
    steps.forEach((s, j) => { if (s.k === 'ex' && step >= j) { const yb = Math.min(depth, s.i * stepH); if (s.i <= nB) P(`<rect class="slab" x="${L}" y="${Y(yb) - 3}" width="${pw}" height="6"/>`); } });
  }
  // 기초
  if (reached('found')) {
    const pile = ids.found !== 'mat';
    if (pile) { const n = 9, len = Math.max(4, Math.min(bottom - depth - 2, Math.max(rock - depth + 2, 8))); for (let i = 0; i < n; i++) { const x = L + 20 + (pw - 40) * i / (n - 1); P(`<rect class="pile ${ids.found}" x="${x - (ids.found === 'bored' ? 4 : 2)}" y="${Y(depth)}" width="${ids.found === 'bored' ? 8 : 4}" height="${len * sc}"/>`); } }
    P(`<rect class="mat" x="${L + 4}" y="${Y(depth) - 9}" width="${pw - 8}" height="11"/>`);
    if (ids.water === 'drain') P(`<path class="drain" d="M${L + 6} ${Y(depth) + 4}H${Rr - 6}"/>`);
    if (ids.water === 'anchor') for (let i = 0; i < 6; i++) { const x = L + 40 + (pw - 80) * i / 5; P(`<path class="anc" d="M${x} ${Y(depth)}V${Y(Math.min(bottom - 1, depth + 9))}"/>`); }
  }
  // 지하 골조 (순타)
  if (reached('base') && !topdown) {
    for (let k = 1; k < nB; k++) P(`<rect class="slab" x="${L + 4}" y="${Y(depth * k / nB) - 3}" width="${pw - 8}" height="6"/>`);
    P(`<rect class="slab" x="${L}" y="${Y(0) - 3}" width="${pw}" height="6"/>`);
    if (!open) [L + 4, Rr - 10].forEach(x => P(`<rect class="bwall" x="${x}" y="${Y(0)}" width="6" height="${Y(depth) - Y(0)}"/>`));
  }
  if (reached('base') || (topdown && reached('found'))) for (let i = 1; i < 6; i++) { const x = L + pw * i / 6; P(`<path class="col" d="M${x} ${Y(0)}V${Y(depth) - 9}"/>`); }
  // 지상
  if (reached('super') || (topdown && dug >= stepH * 1.5)) {
    const nF = reached('super') ? 6 : 2; for (let k = 1; k <= nF; k++) { P(`<rect class="sup" x="${L + 30}" y="${Y(0) - k * 13}" width="${pw - 60}" height="3"/>`); }
    for (let i = 0; i <= 6; i++) { const x = L + 30 + (pw - 60) * i / 6; P(`<path class="col" d="M${x} ${Y(0)}V${Y(0) - nF * 13}"/>`); }
  }
  // 지표선과 치수
  P(`<path class="gl" d="M0 ${Y(0)}H${W}"/><text class="dim-t" x="10" y="${Y(0) - 6}">GL ±0</text>`);
  P(`<path class="dim" d="M${Rr + 70} ${Y(0)}V${Y(depth)}"/><text class="dim-t" x="${Rr + 76}" y="${(Y(0) + Y(depth)) / 2}">굴착 ${r1(depth)}m</text>`);
  if (dug > 0 && dug < depth) P(`<path class="now" d="M${L - 30} ${Y(dug)}H${Rr + 30}"/><text class="now-t" x="${L - 34}" y="${Y(dug) + 4}" text-anchor="end">GL−${r1(dug)}m</text>`);
  // 단계 머리
  P(`<text class="cap-n" x="${W - 12}" y="22" text-anchor="end">STEP ${String(step + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}</text>`);
  return { svg: `<svg viewBox="0 0 ${W} ${H}" class="xsec" role="img" aria-label="지하 시공 단면: ${cur.t}">${out.join('')}</svg>`, steps, cur };
}
