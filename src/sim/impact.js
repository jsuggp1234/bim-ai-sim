// 공종 하나를 고를 때마다: 그 선택이 만드는 이점 · 문제점 · 간섭(앞뒤 공종 · 인접 건물 · 공정)과
// 공기·공사비·위험 변화를 계산한다. 시공 시뮬레이션(ui/buildsim.js)이 같은 판정을 그림 위 표식으로 쓴다.
import { WPS, WP_BY_ID, BASELINE, resolveMethods } from './methods.js';
import { schedule } from './process.js';
import { estimate } from './cost.js';
import { RISKS, exposure } from './risk.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r0 = (v) => Math.round(v);
const r1 = (v) => Math.round(v * 10) / 10;
export const wpLabel = (id) => { const w = WP_BY_ID[id]; return w ? `${w.code} ${w.name}` : id; };
export const optName = (wp, id) => { const o = WP_BY_ID[wp].opts.find(x => x.id === id); return o ? o.name.split(' (')[0] : id; };

// ---------- 대표 단면 (시뮬레이션·판정 공통) ----------
// 가장 대표적인 건물 하나와 그 블록의 지하 외곽을 잘라 본다
const AUX = new Set(['stack', 'tank', 'rack', 'column', 'cool', 'ramp']);
export function mainBuilding(gen) {
  const bl = gen.bldgs.filter(b => b.kind !== 'basement');
  const w = (b) => { const r = b.rect || { u0: 0, u1: 20, v0: 0, v1: 20 }; return Math.min(r.u1 - r.u0, r.v1 - r.v0); };
  const cand = bl.filter(b => !AUX.has(b.kind) && w(b) >= 8);
  const pool = cand.length ? cand : bl;
  return pool.reduce((best, b) => { const s = Math.sqrt(w(b)) * (b.height || 10); return !best || s > best.s ? { b, s } : best; }, null).b;
}
export function sectionGeom(gen, d) {
  const main = mainBuilding(gen);
  const r = main.rect, bwRaw = Math.min(r.u1 - r.u0, r.v1 - r.v0);
  const bw = clamp(bwRaw, 12, 90);
  const bs = gen.bldgs.filter(b => b.kind === 'basement' && (b.block === main.block || !main.block));
  const bsAll = bs.length ? bs : gen.bldgs.filter(b => b.kind === 'basement');
  const bsW = bsAll.length ? Math.max(...bsAll.map(b => Math.min(b.rect.u1 - b.rect.u0, b.rect.v1 - b.rect.v0))) : 0;
  const pw = clamp(Math.max(bsW, bw + 8), 30, 150);
  const nB = Math.max(0, ...bsAll.map(b => b.basementLv || 0));
  const area = (b) => (b.rect.u1 - b.rect.u0) * (b.rect.v1 - b.rect.v0);
  const allB = gen.bldgs.filter(b => b.kind === 'basement'), tot = allB.reduce((a, b) => a + area(b), 0);
  const share = tot > 0 && bs.length ? clamp(bs.reduce((a, b) => a + area(b), 0) / tot, 0.01, 1) : 1;
  const depth = Math.max(0, d.depth || 0);
  const floors = (main.floors || []).map(f => ({ e0: f.y0, e1: f.y1, use: f.use }));
  const H = main.height || (floors.length ? floors[floors.length - 1].e1 : 20);
  const podium = gen.bldgs.find(b => b.kind === 'podium' && b.block === main.block);
  const bx0 = clamp((pw - bw) * 0.58, 4, pw - bw - 4);
  return {
    main, share, bw, pw, nB: depth > 0.5 ? Math.max(1, nB) : 0, depth, floors, H, bx0, bx1: bx0 + bw,
    core: { x0: bx0 + bw * 0.36, x1: bx0 + bw * 0.64 },
    podium: podium ? { h: Math.min(podium.height || 12, H * 0.5) } : null,
    stack: gen.bldgs.find(b => b.kind === 'stack') ? Math.min(140, Math.max(...gen.bldgs.filter(b => b.kind === 'stack').map(b => b.height || 40))) : 0,
    tank: gen.bldgs.some(b => b.kind === 'tank'),
    cyl: main.shape === 'cyl',
  };
}

// ---------- 공종별 시간 창 (4D 공정에서 대표 블록·대표 건물의 실제 일정) ----------
export function wpWindows(S, main) {
  const acts = S.acts.filter(a => a.block === main.block || a.block === '*');
  const A = (cat, bl) => {
    const xs = acts.filter(a => a.cat === cat && (!bl || a.bldg === main.id || !a.bldg));
    const ph = S.phases.find(p => p.key === cat);
    if (!xs.length) return ph && ph.n ? { s: ph.start, e: ph.end } : null;
    return { s: Math.min(...xs.map(a => a.start)), e: Math.max(...xs.map(a => a.end)) };
  };
  const st = A('struct', 1) || { s: S.end * 0.4, e: S.end * 0.8 };
  const sub = (f0, f1) => ({ s: st.s + (st.e - st.s) * f0, e: st.s + (st.e - st.s) * f1 });
  const wall = A('wall'), earth = A('earth');
  return {
    survey: A('survey') || { s: 0, e: 40 },
    improve: A('improve'),
    wall, support: earth, excav: earth,
    water: wall && earth ? { s: wall.s, e: earth.e } : wall || earth,
    found: A('found'), base: A('base'),
    frame: st, form: sub(0.42, 0.52), conc: sub(0.5, 0.58), lift: st,
    skin: A('skin', 1), mep: A('mep', 1),
    plan: { s: 0, e: S.end }, qa: { s: 0, e: S.end },
    prep: A('prep'), fin: A('fin', 1), comm: A('comm'), land: A('land'),
  };
}

// ---------- 공학 추정 (판정 근거 수치) ----------
const SUP_K = { strut: 0.85, anchor: 1.0, raker: 1.1, topdown: 0.6, sps: 0.8, self: 1.6 };
// 흙막이 벽 최대 수평 변위(mm)·인접 건물 침하(mm). 변위율 δ/H ≈ 0.1~0.5% (벽 강성·지보·연약층)
export function wallMove(ids, fx, d, cond) {
  const H = d.depth;
  if (H <= 0.5) return { defl: 0, settle: 0, zone: 0, dewater: 0, total: 0, allow: 25 };
  const stiff = fx.stiff ?? 0.6;
  const ratio = clamp(0.0011 / Math.pow(Math.max(0.15, stiff), 0.85) * (SUP_K[ids.support] || 1) * (1 + d.soft * 0.8), 0.0006, 0.006);
  const defl = ids.wall === 'open' ? H * 1000 * 0.004 : H * 1000 * ratio;
  const zone = 2 * H;
  const settle = cond.adj < zone ? defl * 0.75 * (1 - cond.adj / zone) : 0;
  // 지하수 양수(디워터링): 수위 저하 Δh가 압밀 침하를 만든다 (연약·모래 지반에서 큼)
  let dw = 0;
  if (ids.water === 'dewater' && d.belowGW > 0.5) {
    const dh = d.belowGW + 1, R = 40 + 15 * dh;
    const k = d.soft > 0.5 ? 9 : cond.ground === 'S' ? 4 : cond.ground === 'F' ? 6 : 1.5;
    if (cond.adj < R) dw = dh * k * (1 - cond.adj / R);
  }
  return { defl: r1(defl), settle: r1(settle), dewater: r1(dw), total: r1(settle + dw), zone: r1(zone), allow: 25 };
}
// 발파 진동 (환산거리식 PPV = K (D/√W)^−n, K=160, n=1.6, 지발당 장약 1kg 제어 발파)
export const ppv = (dist, W = 1) => r1(160 * Math.pow(Math.max(1, dist) / Math.sqrt(W), -1.6) * 100) / 100;
export const ppvLimit = (noise) => (noise === 'high' ? 0.3 : noise === 'mid' ? 0.5 : 1.0);
// 항타 소음 (디젤 해머 7.5m에서 105dB(A), 거리 감쇠 20log)
export const pileNoise = (dist) => r0(105 - 20 * Math.log10(Math.max(7.5, dist) / 7.5));
export const NOISE_LIMIT = 65; // 생활소음 규제기준 공사장 주간 (주거지역 등)
// 앵커 길이: 자유장(굴착 깊이의 약 0.6배) + 정착장 8m, 수평 투영
export const anchorLen = (depth) => r1(0.6 * depth + 8);
// 타워크레인 위치: 대표 건물 왼쪽 옆 (인접 건물 쪽 대지 경계에 가까운 일반 배치)
export const craneX = (G) => Math.max(3, G.bx0 - 5);

// ---------- 판정 ----------
// item: { kind: 'pro' | 'con' | 'clash', sev: 1~3, with, t, d, mark?, fix?: { wp, opt, label } }
export function checks(wpId, R, G) {
  const { d, cond, fx, S, C, Q } = R;
  const ids = fx.ids, out = [];
  const add = (kind, sev, with_, t, dsc, extra = {}) => out.push({ kind, sev, with: with_, t, d: dsc, ...extra });
  const pro = (t, dsc, extra) => add('pro', 1, null, t, dsc, extra);
  const con = (sev, t, dsc, extra) => add('con', sev, null, t, dsc, extra);
  const clash = (sev, w, t, dsc, extra) => add('clash', sev, w, t, dsc, extra);
  const mv = wallMove(ids, fx, d, cond);
  const W = wpWindows(S, G.main);
  const days = (k) => (W[k] ? r0(W[k].e - W[k].s) : 0);
  const id = ids[wpId];
  const NEI = '인접 건물', ROAD = '진입 도로·게이트';

  if (wpId === 'survey') {
    const unc = fx.unc;
    if (unc < 1) pro(`지층 불확실성 ${r0((1 - unc) * 100)}% 감소`, `흙막이 근입 깊이·말뚝 길이를 덜 보수적으로 잡아 L03·L07 물량을 줄입니다 (불확실성 계수 ${unc})`);
    if (id === 'spt' && (d.depth > 15 || d.heavy)) clash(2, `${wpLabel('wall')} · ${wpLabel('found')}`, '설계 정수 불확실', `시추 간격(50m)이 넓어 깊이 ${r1(d.depth)}m 굴착의 기반암 선을 놓칠 수 있습니다. 근입·말뚝 길이에 여유를 크게 둬야 합니다`, { mark: 'unknown', fix: { wp: 'survey', opt: 'geo', label: '물리탐사 추가' } });
    if (id === 'ai') pro('정보량이 큰 위치에 시추를 몰아 배치', '기존 시추 자료를 학습해 빈 곳만 새로 뚫습니다. 3D 지층·지하수 모델이 이후 모든 공종 판정에 쓰입니다');
    if (cond.ground === 'W' || cond.ground === 'R') { if (id === 'geo' || id === 'ai') pro('기반암 선을 연속으로 파악', `탄성파 탐사로 GL−${cond.rockDepth}m 부근 암반 경계를 면으로 잡아 굴착·발파 물량이 정확해집니다`); }
    if (d.soft > 0.5 && id !== 'cpt' && id !== 'ai') con(2, '연약층 압밀 특성을 점으로만 확인', '콘관입(CPTu)을 쓰지 않으면 연약 점토 두께·압밀 계수 오차가 지반 개량 기간 오차로 이어집니다', { fix: { wp: 'survey', opt: 'cpt', label: 'CPTu로 바꾸기' } });
  }

  if (wpId === 'improve') {
    if (d.soft < 0.5) pro('지반 개량 생략', '연약층이 없어 이 공종을 건너뜁니다. 공기·비용 영향 없음');
    else {
      if (id === 'none') con(3, '연약층 방치', `연약 점토 위에서 ${r0(d.maxH)}m 건물을 지으면 부등침하·측방유동 위험이 큽니다`, { mark: 'settle', fix: { wp: 'improve', opt: 'dcm', label: 'DCM으로 바꾸기' } });
      if (id === 'pbd') clash(2, `공정 · ${wpLabel('wall')}`, `선행재하 ${days('improve') || 210}일 동안 부지 점유`, '재하 성토가 부지를 덮고 있어 흙막이·가설 공사가 압밀이 끝난 뒤로 밀립니다', { mark: 'surcharge' });
      if (id === 'dcm' && d.depth > 0.5) clash(1, wpLabel('excav'), '굴착 범위 안의 고결 기둥', '굴착 구간에 만든 개량체를 다시 깨야 해 굴착 장비 부하가 늘어납니다. 굴착 범위 밖·아래만 개량하도록 배치를 조정합니다', { mark: 'dcm' });
      if (id === 'vac') pro('성토 없이 압밀', '대기압(−80kPa)으로 재하해 성토 측방 변위가 없고 인접 시설에 안전합니다');
      if (id === 'dcm') pro('침하를 거의 만들지 않는 고결', '개량과 동시에 강도가 나와 압밀 대기 기간이 없습니다');
      if (id === 'pbd' || id === 'vac') pro('개량비가 가장 낮음', '넓은 부지를 배수재와 재하로 한꺼번에 개량합니다');
    }
  }

  if (wpId === 'wall') {
    if (d.depth <= 0.5) pro('흙막이 불필요', '지하층이 없어 얕은 터파기만 합니다');
    else {
      pro(`최대 벽체 변위 약 ${mv.defl}mm`, `굴착 ${r1(d.depth)}m의 ${r1(mv.defl / d.depth / 10)}% 수준 (벽 강성 ${fx.stiff ?? '—'} × 지보 계수)`);
      if (mv.settle > 0) {
        const bad = mv.settle > mv.allow * 0.6;
        (bad ? clash : (s, w, t, x, e) => con(1, t, x, e))(mv.settle > mv.allow ? 3 : 2, NEI, `인접 건물 예상 침하 ${mv.settle}mm`, `인접 건물이 굴착 영향권(2H = ${mv.zone}m) 안 ${cond.adj}m에 있습니다. 허용 ${mv.allow}mm 대비 ${r0(mv.settle / mv.allow * 100)}%`, { mark: 'settle', fix: id !== 'dwall' ? { wp: 'wall', opt: 'dwall', label: '지하연속벽으로' } : null });
      }
      if (id === 'hpile' && d.belowGW > 1) clash(2, wpLabel('water'), '토류판 틈 누수', `지하수면 아래 ${r1(d.belowGW)}m를 토류판으로 막으면 물과 흙이 샙니다. L05에서 그라우팅·JSP 차수를 반드시 함께 골라야 합니다`, { mark: 'leak' });
      if (id === 'cip' && d.belowGW > 1) clash(1, wpLabel('water'), '말뚝 사이 틈', '원형 말뚝 사이가 비어 LW 그라우팅으로 메워야 합니다', { mark: 'leak' });
      if (id === 'sheet' && (cond.noise === 'high' || cond.adj < 15)) clash(2, NEI, '진동 해머 진동·소음', `진동 해머 관입 진동이 ${cond.adj}m 거리 인접 건물에 전달됩니다. 압입식(사일런트 파일러)으로 바꾸거나 시간대를 제한해야 합니다`, { mark: 'vibro' });
      if (id === 'open') { const sl = r1(d.depth * 1.2); if (cond.adj < sl + 5) clash(3, NEI, '사면 폭 부족', `경사 1:1.2 사면이 ${sl}m를 차지해 인접 건물(${cond.adj}m)까지 닿습니다`, { mark: 'slope' }); else pro('벽체 없이 가장 빠름', `사면 폭 ${sl}m를 둘 여유가 있습니다`); }
      if (id === 'dwall') { pro('영구 지하 외벽 겸용', '본 구조 지하 외벽을 따로 치지 않고, 역타·업다운과 바로 결합됩니다'); pro('차수·강성 최고', '안정액 굴착 연속벽이라 지하수·변위를 동시에 막습니다'); }
      if (id === 'scw' && d.belowGW > 1) pro('연속 차수벽', '흙과 시멘트를 섞은 벽이라 별도 차수가 거의 필요 없습니다');
      if (['hpile', 'sheet', 'nail', 'open'].includes(id) && d.depth >= 10) clash(1, wpLabel('support'), '역타 지보를 고를 수 없음', '역타(슬래브 지지)에는 영구벽 수준의 강성 벽체가 필요해 L04 선택지가 줄어듭니다');
      if ((id === 'sheet' || id === 'scw') && cond.rockDepth < d.depth) con(2, '암반 구간 근입 불가', `기반암 GL−${cond.rockDepth}m 아래로는 강널·교반이 들어가지 않습니다`);
    }
  }

  if (wpId === 'support') {
    if (d.depth <= 0.5 || ids.wall === 'open') pro('지보 불필요', ids.wall === 'open' ? '사면 개착은 지보 없이 팝니다' : '지하층이 없습니다');
    else {
      if (id === 'anchor') {
        const L = anchorLen(d.depth), into = r1(L * Math.cos(Math.PI / 9) - cond.adj);
        if (into > 0) clash(3, `${NEI} (지중)`, `앵커가 인접 대지 지하로 ${into}m 침범`, `앵커 길이 ${L}m(자유장 + 정착장 8m)가 ${cond.adj}m 떨어진 인접 건물 지하까지 들어갑니다. 지중 사용 동의가 없으면 인허가가 막힙니다`, { mark: 'anchor', fix: { wp: 'support', opt: d.depth >= 15 ? 'topdown' : 'strut', label: d.depth >= 15 ? '역타로 바꾸기' : '버팀보로 바꾸기' } });
        else pro('굴착 공간이 비어 장비가 자유로움', '버팀보 없이 굴착·기초 장비가 움직입니다');
        if (d.soft > 0.5) con(3, '연약 점토 정착력 부족', '정착장에서 인발 저항이 나오지 않습니다');
      }
      if (id === 'strut') {
        clash(d.lotW > 80 ? 2 : 1, `${wpLabel('excav')} · ${wpLabel('found')}`, '버팀보가 장비 동선을 막음', `버팀보 단 사이(약 3.5m)로만 장비가 다녀 굴착 생산성이 떨어지고, 항타·RCD 장비의 높이가 제한됩니다${d.lotW > 120 ? `. 폭 ${r0(d.lotW)}m로 버팀보가 길어 중간 말뚝이 필요합니다` : ''}`, { mark: 'strut' });
        pro('가장 확실한 지지', '좁은 굴착에서 변위가 작고 계측·보강이 쉽습니다');
      }
      if (id === 'raker') clash(1, wpLabel('found'), '레이커 받침 기초 선시공', '중앙부를 먼저 파 레이커 받침을 쳐야 해 매트를 나눠 타설합니다', { mark: 'raker' });
      if (id === 'topdown') {
        pro('지하 슬래브가 버팀 역할', `가설 버팀보 없이 B1~B${G.nB} 슬래브로 벽을 받칩니다. 변위·소음이 가장 작습니다`);
        pro('지상·지하 동시 시공', '1층 슬래브를 먼저 쳐 지상 골조를 지하 굴착과 함께 올립니다');
        con(1, '슬래브 아래 굴착 효율 저하', '개구부로 흙을 퍼 올려 굴착 생산성이 낮고 환기·조명이 필요합니다');
        if (!['dwall', 'cip', 'scw'].includes(ids.wall)) clash(3, wpLabel('wall'), '벽체 강성 부족', '역타에는 지하연속벽·CIP·SCW 같은 강성 벽체가 필요합니다', { mark: 'wall' });
      }
      if (id === 'sps') pro('버팀보 해체 공정 없음', '영구 철골 보를 버팀으로 쓰고 그대로 지하 구조가 됩니다');
    }
  }

  if (wpId === 'water') {
    const wt = fx.watertight ?? 0.5;
    if (d.belowGW < 0.5) pro('지하수 대책 불필요', `지하수면 GL−${cond.gw}m가 굴착 바닥(GL−${r1(d.depth)}m)보다 깊습니다`);
    else {
      if (id === 'none' && wt < 0.9) clash(3, wpLabel('wall'), '차수 없이 지하수면 아래 굴착', `벽체 틈으로 유입 → 바닥 보일링·토사 유출 위험. 지하수면 아래 ${r1(d.belowGW)}m`, { mark: 'leak', fix: { wp: 'water', opt: 'jsp', label: 'JSP 차수로' } });
      if (id === 'none' && wt >= 0.9) pro('벽체가 차수벽', '연속벽(D-Wall·SCW)이 지하수를 막아 별도 차수 비용이 없습니다');
      if (id === 'dewater') {
        if (mv.dewater > 3) clash(mv.dewater > 15 ? 3 : 2, NEI, `양수로 인접 건물 압밀 침하 약 ${mv.dewater}mm`, `지하수위를 ${r1(d.belowGW + 1)}m 낮추면 영향 반경 안 인접 건물(${cond.adj}m) 아래 지반이 압밀됩니다`, { mark: 'drawdown', fix: { wp: 'water', opt: 'jsp', label: '차수 그라우팅으로' } });
        else pro('양수가 가장 단순', '주변 건물이 멀어 수위 저하 영향이 작습니다');
        con(1, '지하수 배출 허가·처리', '양수량을 신고하고 탁수를 처리해야 합니다');
      }
      if ((id === 'grout' || id === 'jsp') && wt >= 0.9) clash(1, wpLabel('wall'), '중복 차수', `벽체가 이미 차수벽이라 차수 공사비(직접비의 ${fx.waterCost}%)가 중복됩니다`, { fix: { wp: 'water', opt: 'none', label: '대책 없음으로' } });
      if ((id === 'grout' || id === 'jsp') && wt < 0.9) pro('벽체 틈 차단', `투수성 벽체(${optName('wall', ids.wall)}) 바깥에 차수 커튼을 만듭니다`);
      if (id === 'drain') { pro(`부력 감소 → 기초 ${r0((fx.foundSave || 0) * 100)}% 절감`, `수두 ${r1(d.belowGW)}m의 부력을 상시 배수로 줄여 매트 두께를 아낍니다`); con(1, '영구 배수 운영비', '완공 후 펌프를 계속 돌리고 배수량을 관리해야 합니다'); }
      if (id === 'anchor') clash(1, wpLabel('found'), '부력 앵커·말뚝 배치 조정', '기초 말뚝과 부력 앵커가 같은 바닥을 쓰므로 배치를 엇갈려야 합니다', { mark: 'banchor' });
    }
  }

  if (wpId === 'excav') {
    if (d.depth <= 0.5) pro('얕은 터파기', '굴삭기 터파기만 합니다');
    else {
      const vol = (Q.excavation || 0) * (G.share ?? 1), w = W.excav ? (W.excav.e - W.excav.s) * 5 / 7 : 0;
      const trucks = w > 0 ? r0(vol * 1.25 / 12 / w) : 0;
      const tc = C.list.filter(c => c.type === 'truck');
      if (tc.length) clash(tc.some(c => c.sev === 3) ? 3 : 2, ROAD, `물류 차량 한도 초과 ${tc.length}건 (4D)`, `하루 차량이 게이트·진입 도로 한도를 넘는 구간 ${tc.length}곳, 최대 하루 ${Math.max(...tc.map(c => c.peak || 0)).toLocaleString()}대 (한도 ${Math.max(...tc.map(c => c.cap || 0)).toLocaleString()}대). 05 단계에서 착공 시차·분할 타설로 낮춥니다`, { mark: 'truck' });
      else if (trucks > 0) {
        const t = `반출 덤프 하루 약 ${trucks}대`, x = `굴착 ${Math.round(vol).toLocaleString()}㎥ × 부피 증가 1.25 ÷ 12㎥/대 ÷ 작업일 ${r0(w)}일`;
        if (trucks > 300) clash(trucks > 480 ? 3 : 2, ROAD, t, x + '. 게이트 하나의 하루 처리 한도(약 300대)를 넘어 게이트를 늘리거나 반출을 분산해야 합니다', { mark: 'truck' });
        else if (trucks > 220) con(1, t + ' · 게이트 한도 근접', x + '. 한도(약 300대)의 ' + r0(trucks / 3) + '%', { mark: 'truck' });
        else pro(t + ' · 게이트 여유', x);
      }
      if (d.rockCut > 0.5) {
        if (id === 'blast') {
          const v = ppv(cond.adj + 3), lim = ppvLimit(cond.noise);
          if (v > lim) clash(v > lim * 3 ? 3 : 2, NEI, `발파 진동 ${v >= 1 ? v.toFixed(1) : v.toFixed(2)}cm/s (허용 ${lim})`, `인접 건물까지 ${cond.adj + 3}m, 지발당 장약 1kg 제어 발파 기준. 무진동 파쇄나 혼합으로 바꾸거나 장약을 더 줄여야 합니다`, { mark: 'blast', fix: { wp: 'excav', opt: 'splitter', label: '무진동 파쇄로' } });
          else pro(`발파 진동 ${v >= 1 ? v.toFixed(1) : v.toFixed(2)}cm/s · 허용 이내`, `인접 시설까지 ${cond.adj + 3}m로 충분히 멀어 발파가 가장 빠릅니다`);
        }
        if (id === 'normal') con(2, `암반 ${r1(d.rockCut)}m를 브레이커로만`, '경암은 브레이커 생산성이 매우 낮아 굴착 공기가 길어집니다', { fix: { wp: 'excav', opt: cond.noise === 'high' ? 'splitter' : 'mix', label: '암반 공법으로' } });
        if (id === 'splitter') pro('진동 거의 없음', '유압 할암은 진동 0.1cm/s 미만이라 도심·정밀 시설 옆에서 씁니다');
        if (id === 'mix') pro('구역별 진동 기준 분리', '인접 쪽은 무진동, 먼 쪽은 미진동 발파로 속도와 민원을 절충합니다');
      } else pro('토사만 굴착', `기반암(GL−${cond.rockDepth}m)이 굴착 바닥보다 깊습니다`);
      if (ids.support === 'strut') clash(1, wpLabel('support'), '버팀보 사이 굴착', '버팀보 아래에서는 롱붐 굴삭기·클램셸로 퍼 올려야 합니다', { mark: 'strut' });
      if (ids.support === 'topdown') con(1, '슬래브 개구부로 반출', '역타는 슬래브 개구부로 흙을 올려 굴착 속도가 느립니다');
    }
  }

  if (wpId === 'found') {
    const pile = id !== 'mat';
    if (id === 'phc') { const L = pileNoise(cond.adj + 5); if (L > NOISE_LIMIT && cond.noise !== 'low') clash(L > 80 ? 3 : 2, NEI, `항타 소음 약 ${L}dB(A)`, `규제 ${NOISE_LIMIT}dB(A) 초과. 오거로 먼저 뚫는 매입(SDA) 공법으로 바꿔 소음을 줄여야 합니다`, { mark: 'noise' }); }
    if (pile && ids.support === 'strut') clash(2, wpLabel('support'), '항타기 리더 높이 제한', '버팀보 사이에서 말뚝을 박아야 해 장비 높이가 제한되고 이음이 늘어납니다', { mark: 'strut' });
    if (ids.support === 'topdown' && id !== 'bored' && d.depth > 0.5) clash(2, wpLabel('support'), '역타 기둥 지지', '역타 철골 기둥(플런지 칼럼)은 현장타설말뚝 위에 세워야 합니다', { fix: { wp: 'found', opt: 'bored', label: '현장타설말뚝으로' } });
    if (ids.water === 'anchor' && pile) clash(1, wpLabel('water'), '부력 앵커와 말뚝 배치', '같은 바닥에 부력 앵커와 말뚝이 들어가 간격을 맞춥니다', { mark: 'banchor' });
    if (id === 'mat' && (cond.ground === 'R' || cond.rockDepth <= d.depth + 2)) pro('암반 직접 지지', '굴착 바닥이 암반이라 말뚝 없이 매트로 지지합니다');
    if (id === 'mat' && !(cond.ground === 'R' || cond.rockDepth <= d.depth + 2) && (d.tall || d.superTall)) con(3, '토사 위 매트', `높이 ${r0(d.maxH)}m 건물 하중을 토사 위 매트만으로 받기 어렵습니다`, { mark: 'settle', fix: { wp: 'found', opt: 'piledraft', label: '파일 래프트로' } });
    if (id === 'bored') pro('암반 소켓 지지', '대구경 말뚝을 암반에 소켓해 초고층·중량 하중을 확실히 받습니다');
    if (id === 'piledraft') pro('부등침하 최소화', '매트와 말뚝이 하중을 나눠 말뚝 수를 줄입니다');
    if (id === 'steel' && d.soft > 0.5) pro('깊은 연약층 관통', `기반암 GL−${cond.rockDepth}m까지 강관으로 지지층에 닿습니다`);
    if (fx.foundSave > 0) pro(`영구배수로 매트 ${r0(fx.foundSave * 100)}% 절감`, 'L05에서 고른 영구배수가 부력을 줄여 기초 물량이 줄었습니다');
    if (ids.conc === 'lowheat' && d.depth >= 8) pro('매스 콘크리트 균열 관리', 'L11 저발열 배합이 두꺼운 매트의 수화열 균열을 막습니다');
  }

  if (wpId === 'base') {
    if (d.depth <= 0.5) pro('지하층 없음', '지상 골조로 바로 넘어갑니다');
    else {
      const st = W.frame, bs = W.base;
      if (id === 'topdown' || id === 'updown' || id === 'semi') {
        const lead = st && bs ? r0(bs.e - st.s) : 0;
        if (lead > 0) pro(`지상 골조 ${lead}일 앞당김`, `지하 골조가 끝나기 전에 지상 골조가 올라갑니다 (4D 공정: 지상 착수 D+${r0(st.s)}, 지하 완료 D+${r0(bs.e)})`);
        con(1, '지하 작업 환경', '슬래브 아래 작업이라 환기·조명·자재 반입 개구부 계획이 필요합니다');
      } else {
        pro('단순하고 검증된 순서', `B${G.nB}부터 B1까지 바닥·벽을 차례로 올립니다`);
        if (ids.support === 'strut' || ids.support === 'raker') clash(1, wpLabel('support'), '버팀보 해체 순서', '지하 바닥을 칠 때마다 그 위 버팀보를 풀어야 해 해체 순서를 지키지 않으면 벽이 다시 움직입니다', { mark: 'strut' });
      }
    }
  }

  if (wpId === 'frame') {
    const heavy = ['modular', 'pc', 'module', 'truss'].includes(id);
    if (heavy) clash(1, wpLabel('lift'), '대형 부재 양중', `${optName('frame', id)} 부재(한 개 10~40t)를 들 크레인이 필요합니다. L12에서 크롤러·링거급을 고려합니다`, { mark: 'crane' });
    if (id === 'steel' || id === 'hybrid') con(1, '내화 피복 공정 추가', '철골 부재에 내화 뿜칠·도료가 들어가 마감 전 공정이 하나 늘어납니다');
    if (id === 'hybrid') pro('코어 선행 + 철골 외곽', '코어가 먼저 올라가고 철골이 따라와 층당 사이클이 짧습니다');
    if (id === 'modular' || id === 'pc') pro('현장 작업의 대부분을 공장으로', '날씨·인력 영향을 덜 받고 품질이 고릅니다');
    if (id === 'rcwall' && d.res) pro('공동주택 표준', '층간소음·결로 대응 경험이 많고 협력사 수급이 쉽습니다');
    pro(`골조 사이클 계수 ${fx.structCycK.toFixed(2)}`, `골조 형식 × 거푸집 × 양중 × 품질 기술을 곱한 값 (1.0 = 기준, 낮을수록 빠름)`);
  }

  if (wpId === 'form') {
    if (id === 'conv' && (d.tall || d.res)) clash(1, '하부층 설비·마감 공종', '동바리·재동바리가 3개 층을 점유', '아래층에 설비·마감이 들어가는 시점이 늦어지고 같은 층 공종이 겹칩니다', { mark: 'shore' });
    if (id === 'gang' || id === 'alform') clash(1, wpLabel('lift'), '거푸집 인양 시간', '층마다 대형 패널을 크레인으로 옮겨 크레인 시간을 나눠 써야 합니다', { mark: 'crane' });
    if (id === 'acs') pro('코어 4~6층 선행', '유압으로 스스로 올라가 크레인 없이 코어를 먼저 올립니다. 고소 작업 추락 위험도 줄어듭니다');
    if (id === 'slip') { pro('끊김 없이 연속 상승', '하루 3~5m씩 24시간 타설합니다'); if (cond.noise === 'high') clash(2, NEI, '야간 연속 타설 소음', '주거 인접 현장은 야간 작업 허가가 필요합니다', { mark: 'noise' }); }
    if (id === 'deck') pro('동바리 없는 바닥', '철골 보 위에 데크를 깔아 아래층 작업이 바로 이어집니다');
    if (id === 'alform') pro('전용 횟수 100회 이상', '반복 평면에서 층당 4~5일 사이클이 나옵니다');
    const stk = C.list.filter(c => c.type === 'stack');
    if (stk.length) con(1, `공종 적층 ${stk.length}건 (4D)`, `같은 층·아래층에 골조와 설비가 겹치는 구간이 ${stk.reduce((a, c) => a + c.days, 0)}일입니다. 05 단계에서 간격을 조정합니다`);
  }

  if (wpId === 'conc') {
    const ex = exposure(S, Q);
    const win = r0((ex.winter || 0) * 100);
    if (id === 'lowheat' && d.depth >= 8) pro('매트 내외부 온도차 ↓', '수화열을 낮춰 두꺼운 기초의 온도 균열을 막습니다 (내외부 온도차 약 25 → 15℃)');
    if (id === 'high' && d.tall) pro('하부 기둥 단면 축소', '고강도로 기둥을 줄여 전용 면적을 얻습니다');
    if (id === 'high' && d.tall) clash(1, '압송 장비', '고강도·고층 압송', '점성이 높아 초고압 펌프와 배관 계획이 필요합니다', { mark: 'pump' });
    if (id === 'lowc') { pro('탄소 약 30% 감소', '고로슬래그·순환 골재로 시멘트를 줄입니다'); if (win > 10) con(2, `동절기 골조 ${win}%`, '초기 강도 발현이 늦어 겨울철 거푸집 해체가 늦어집니다', { fix: { wp: 'conc', opt: 'normal', label: '일반 강도로' } }); }
    if (win > 15 && id !== 'lowc') con(1, `동절기 골조 ${win}%`, '보온 양생·가열 비용이 듭니다. IoT 강도 센서(L16)로 해체 시점을 앞당길 수 있습니다');
    if (id === 'scc') pro('다짐 없이 충전', '철근이 촘촘한 곳에서 진동기 없이 채워 소음·결함이 줄어듭니다');
  }

  if (wpId === 'lift') {
    const R0 = fx.craneR, cx = craneX(G), dn = r1(cx + cond.adj), dr = r1(G.pw - cx + 6);
    if (id === 'luffing') pro('지브를 세워 선회 반경 축소', `작업 반경 ${R0}m 안에서 지브를 세워 인접 대지·도로 상공을 피합니다`);
    else if (!['mobile'].includes(id) && R0 > dn) clash(R0 > dn + 15 ? 3 : 2, `${NEI} (상공)`, `지브가 인접 건물 위를 지남`, `작업 반경 ${R0}m, 크레인에서 인접 건물까지 ${dn}m. 인접 대지 상공 통과 동의나 선회 제한 장치가 필요합니다`, { mark: 'oversail', fix: { wp: 'lift', opt: 'luffing', label: '러핑 크레인으로' } });
    if (id !== 'luffing' && id !== 'mobile' && R0 > dr) clash(1, '도로 상공', '도로 위 선회', `도로 쪽으로 ${r1(R0 - dr)}m 넘어갑니다. 도로 점용·통행 제한 시간에만 인양합니다`, { mark: 'road' });
    const cr = C.list.filter(c => c.type === 'crane');
    if (cr.length) clash(cr.some(c => c.sev === 3) ? 3 : 2, '다른 동 크레인', `크레인 반경 간섭 ${cr.length}건 (4D)`, `동시에 도는 크레인끼리 반경이 겹칩니다. 가장 긴 겹침 ${Math.max(...cr.map(c => c.days))}일, 중대 ${cr.filter(c => c.sev === 3).length}건. 05 단계 AI 최적화로 착공 시차·높이 차를 둡니다`, { mark: 'crane2' });
    if (['modular', 'pc', 'module', 'truss'].includes(ids.frame) && (id === 'tower' || id === 'luffing' || id === 'mobile')) con(2, '양중 능력 부족', `${optName('frame', ids.frame)} 부재 무게에 비해 ${optName('lift', id)} 정격 하중이 작습니다`);
    if (id === 'ringer') pro('모듈 일괄 인양', '반응기·탑을 통째로 세워 고소 작업과 인력 피크를 줄입니다');
  }

  if (wpId === 'skin') {
    if (id === 'unitcw') { pro('외부 비계 없이 층마다 닫음', '공장 조립 유닛을 안에서 걸어 고소 작업이 줄고 마감 착수가 빨라집니다'); clash(1, wpLabel('lift'), '유닛 양중 시간', '층마다 유닛을 크레인·모노레일로 올려 골조 양중과 시간을 나눕니다', { mark: 'crane' }); }
    if (id === 'stickcw') con(1, '현장 조립', '멀리언·유리를 현장에서 하나씩 끼워 날씨 영향을 받습니다');
    if (id === 'wet' && d.tall) con(3, '고층 외부 습식 작업', '비계·곤돌라 위 작업이 길어 추락 위험(RSK-06)이 큽니다', { fix: { wp: 'skin', opt: 'unitcw', label: '유닛 커튼월로' } });
    if (id === 'wet') pro('공사비가 가장 낮음', '석재·도장 마감은 단가가 낮고 보수가 쉽습니다');
    if (id === 'pcpanel') pro('공장 생산 외벽', '외벽 패널을 공장에서 만들어 단열·기밀이 고릅니다');
    if (id === 'metal' && d.ind) pro('대형 산업 외피 표준', '가볍고 빨라 넓은 벽면을 빠르게 닫습니다');
    const st = W.frame, sk = W.skin; if (st && sk) pro(`골조 착수 후 ${r0(sk.s - st.s)}일에 외장 시작`, `대표 동 기준. 골조 상부와 외장 하부가 동시에 진행됩니다`);
  }

  if (wpId === 'mep') {
    if (id === 'conv') clash(1, '현장 설비 공종 간', '현장에서 드러나는 배관·덕트 간섭', '천장 속 덕트·배관·트레이가 현장에서 부딪혀 재시공(RSK-12)이 생깁니다. L16 BIM 간섭검토를 함께 고르면 줄어듭니다', { mark: 'mep' });
    if (id === 'prefab') { pro('현장 설비 작업 약 25% 감소', '멀티 트레이드 랙을 공장에서 조립해 올립니다'); clash(1, wpLabel('lift'), '랙 모듈 양중', '모듈 반입 시간을 골조 양중과 나눠야 합니다', { mark: 'crane' }); }
    if (id === 'spool') pro('BIM 스풀 제작', '배관을 모델에서 잘라 공장 제작해 현장 용접을 줄입니다');
    if (id === 'hookup') pro('공정 장비 연결 전문화', '반도체·화학 공정 배관의 가동 일정을 맞춥니다');
  }

  if (wpId === 'plan') {
    const n = C.list.length, det = r0(n * fx.detect), sol = r0(det * fx.solve);
    pro(`공정 간섭 ${n}건 중 ${det}건 사전 발견`, `발견율 ${r0(fx.detect * 100)}% · 그중 ${r0(fx.solve * 100)}%(${sol}건)를 착공 전에 풀 수 있습니다`);
    if (n - det > 0) con(n - det > 10 ? 2 : 1, `현장에서 드러날 간섭 ${n - det}건`, '사전 발견하지 못한 간섭은 현장 재시공·대기로 이어집니다', { fix: fx.plan !== 'ai' ? { wp: 'plan', opt: 'ai', label: 'AI 공정 최적화로' } : null });
    if (fx.varCut > 0) pro(`생산성 변동 ${r0(fx.varCut * 100)}% 감소`, '몬테카를로 공기 분포 폭(P10~P90)이 좁아집니다');
    if (fx.lagCut > 0) pro(`공종 간 대기 ${fx.lagCut}단계 단축`, '후속 공종 간격을 줄여 층 사이클이 이어집니다');
  }

  if (wpId === 'qa') {
    const q = fx.qa || [];
    if (!q.length) con(2, '품질·안전 기술 없음', '위험 예측에서 사고·결함 발생 확률이 그대로 남습니다');
    q.forEach(k => { const o = WP_BY_ID.qa.opts.find(x => x.id === k); if (o) pro(o.name.split(' (')[0], o.how ? o.how[0] : ''); });
    if ((d.depth >= 15 || cond.adj < 15) && !q.includes('twin')) con(2, '굴착 변위 실시간 계측 없음', `깊은 굴착·근접 시공(인접 ${cond.adj}m)인데 디지털 트윈이 빠져 있습니다`, { fix: { wp: 'qa', opt: 'twin', label: '디지털 트윈 추가' } });
    if (fx.ids.mep === 'conv' && !q.includes('clash')) con(1, '현장 설비 간섭 대비 없음', 'L14를 재래식으로 골랐다면 BIM 간섭검토가 필요합니다', { fix: { wp: 'qa', opt: 'clash', label: 'BIM 간섭검토 추가' } });
  }

  // 같은 판정은 한 번만
  const seen = new Set();
  return out.filter(x => { const k = x.kind + x.t; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.kind === b.kind ? b.sev - a.sev : 0));
}

// ---------- 위험 변화: 이 공종을 다른 공법으로 바꾸면 관련 위험 점수가 어떻게 되는가 ----------
const PH = { survey: 'survey', improve: 'survey', wall: 'wall', support: 'earth', water: 'wall', excav: 'earth', found: 'found', base: 'base', frame: 'struct', form: 'struct', conc: 'struct', lift: 'struct', skin: 'skin', mep: 'mep' };
export function relatedRisks(wpId) {
  return RISKS.filter(r => (r.levers || []).some(([w]) => w === wpId) || (PH[wpId] && r.when.includes(PH[wpId]) && wpId !== 'plan' && wpId !== 'qa'));
}
export function riskCtx(R) {
  return { site: R.site, u: R.u, cond: R.cond, d: R.d, S: R.S, C: R.C, E: R.E, ex: exposure(R.S, R.Q) };
}
export function riskShift(R, wpId, altPicks, ctx = riskCtx(R)) {
  const fxA = resolveMethods(R.cond, R.d, altPicks, R.prio).fx;
  return relatedRisks(wpId).map(K => {
    const a = K.f({ ...ctx, fx: R.fx }, R.fx), b = K.f({ ...ctx, fx: fxA }, fxA);
    const sc = (x) => (x ? clamp(x.p, 1, 5) * clamp(x.i, 1, 5) : 0);
    return { id: K.id, name: K.name, cat: K.cat, s: r1(sc(a)), alt: r1(sc(b)), levers: K.levers || [] };
  }).filter(x => x.s > 0 || x.alt > 0);
}

// ---------- 공기·공사비 변화 (공종 하나를 바꿔 다시 계산) ----------
const trialMemo = new Map();
export function trial(R, picks) {
  const key = JSON.stringify([R.use, R.site.id, R.mp, R.cond, R.prio, R.cp, picks]);
  if (trialMemo.has(key)) return trialMemo.get(key);
  const M = resolveMethods(R.cond, R.d, picks, R.prio);
  const S = schedule(R.gen, R.Q, { ...R.pp0, fx: M.fx });
  const E = estimate(R.gen, R.Q, S, R.cp);
  const v = { end: S.end, months: S.months, total: E.total, q: M.fx.index.quality, s: M.fx.index.safety, env: M.fx.index.env };
  if (trialMemo.size > 400) trialMemo.clear();
  trialMemo.set(key, v);
  return v;
}
// 이 공종에서 option 하나를 고른다면의 picks (여러 개 고르는 공종은 그 기술을 켜고 끈다)
export function picksWith(R, wpId, optId) {
  const p = { ...(R.ms.picks || {}) };
  const L = R.M.list.find(x => x.wp.id === wpId);
  if (L.wp.multi) { const s = new Set(L.chosen); if (s.has(optId)) s.delete(optId); else s.add(optId); p[wpId] = [...s]; }
  else p[wpId] = optId;
  return p;
}
// 지금 선택 그대로의 기준값 (최적화 전 공정으로 비교)
export const current = (R) => trial(R, R.M.list.reduce((p, L) => { p[L.wp.id] = L.chosen; return p; }, {}));
export function delta(R, wpId, optId) {
  const a = current(R), b = trial(R, picksWith(R, wpId, optId));
  return { days: r0(b.end - a.end), cost: b.total - a.total, q: b.q - a.q, s: b.s - a.s };
}
// 이 공종만 전통 공법(기준선)으로 했을 때와 비교
export function vsBaseline(R, wpId) {
  const L = R.M.list.find(x => x.wp.id === wpId);
  const bOpt = BASELINE[wpId];
  if (L.wp.multi) { const p = { ...(R.ms.picks || {}), [wpId]: [] }; const a = current(R), b = trial(R, p); return { opt: null, days: r0(a.end - b.end), cost: a.total - b.total, q: a.q - b.q, s: a.s - b.s }; }
  const ok = L.ev.find(e => e.o.id === bOpt && e.ok);
  if (!ok || L.chosen === bOpt) return { opt: bOpt, same: L.chosen === bOpt, na: !ok, days: 0, cost: 0, q: 0, s: 0 };
  const a = current(R), b = trial(R, { ...(R.ms.picks || {}), [wpId]: bOpt });
  return { opt: bOpt, days: r0(a.end - b.end), cost: a.total - b.total, q: a.q - b.q, s: a.s - b.s };
}

// ---------- 한 공종의 종합 판정 ----------
export function wpImpact(R, wpId, G = sectionGeom(R.gen, R.d)) {
  const items = checks(wpId, R, G);
  const L = R.M.list.find(x => x.wp.id === wpId);
  const ev = L.wp.multi ? null : L.ev.find(e => e.o.id === L.chosen);
  // 공법 평가 규칙이 남긴 이유도 이점·문제점으로
  const KN = { time: '공기', cost: '비용', quality: '품질', safety: '안전', env: '환경' };
  if (ev) ev.reasons.forEach(r => {
    const dl = Object.entries(r.delta).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => v !== 0);
    if (!dl.length) return;
    const s = dl.reduce((a, [, v]) => a + v, 0);
    items.push({ kind: s >= 0 ? 'pro' : 'con', sev: s <= -25 ? 3 : s < 0 ? 2 : 1, with: null, t: r.why, d: '평가 점수 ' + dl.map(([k, v]) => `${KN[k]} ${v > 0 ? '+' : ''}${v}`).join(' · '), src: 'rule' });
  });
  // 위험: 이 공종을 전통 공법으로 했을 때보다 줄었나 늘었나
  const bOpt = BASELINE[wpId];
  const alt = L.wp.multi ? { ...(R.ms.picks || {}), qa: [] } : { ...(R.ms.picks || {}), [wpId]: bOpt };
  const rs = riskShift(R, wpId, alt);
  rs.forEach(x => {
    if (x.s < x.alt - 0.4) items.push({ kind: 'pro', sev: 1, t: `${x.id} ${x.name} 위험 ${x.alt} → ${x.s}`, d: `전통 공법(${L.wp.multi ? '기술 없음' : optName(wpId, bOpt)}) 대비 위험 점수(P×I)가 낮아집니다`, src: 'risk', risk: x.id });
    else if (x.s > x.alt + 0.4) items.push({ kind: 'con', sev: x.s >= 10 ? 3 : 2, t: `${x.id} ${x.name} 위험 ${x.alt} → ${x.s}`, d: `전통 공법 대비 위험 점수가 높아집니다`, src: 'risk', risk: x.id });
    else if (x.s >= 10) {
      // 이 공종에서 고를 수 있는 대응 공법이 있는데 아직 안 고른 경우만 문제로 올린다
      const cur = L.wp.multi ? L.chosen : [L.chosen];
      const lv = x.levers.find(([w, o]) => w === wpId && !cur.includes(o) && L.ev.find(e => e.o.id === o && e.ok));
      if (lv) items.push({ kind: 'con', sev: x.s >= 15 ? 3 : 2, t: `${x.id} ${x.name} 위험 ${x.s} (높음)`, d: `이 공종의 대응 공법: ${optName(lv[0], lv[1])}`, src: 'risk', risk: x.id, fix: { wp: wpId, opt: lv[1], label: L.wp.multi ? `${optName(lv[0], lv[1])} 추가` : `${optName(lv[0], lv[1])}로` } });
    }
  });
  // 걸리는 것이 하나도 없으면 그 사실과 이 공법의 강점을 알려 준다 (빈 칸 대신)
  if (!items.length) {
    const o = L.wp.multi ? null : L.wp.opts.find(x => x.id === L.chosen), others = o ? L.wp.opts.filter(x => x.id !== o.id) : [];
    const best = o && others.length ? Object.keys(KN).map(k => [k, o.b[k] - others.reduce((a, x) => a + x.b[k], 0) / others.length]).sort((a, b) => b[1] - a[1])[0] : null;
    items.push({ kind: 'pro', sev: 1, with: null, t: '이 현장 조건에서 걸리는 간섭·문제 없음', d: best ? `${o.name}: ${KN[best[0]]} 점수가 다른 선택지 평균보다 ${best[1] >= 0 ? '+' : ''}${Math.round(best[1])}` : '', src: 'rule' });
  }
  const by = (k) => items.filter(x => x.kind === k).sort((a, b) => b.sev - a.sev);
  return { pros: by('pro'), cons: by('con'), clashes: by('clash'), risks: rs, mv: wallMove(R.fx.ids, R.fx, R.d, R.cond), G };
}

// 순서: 공종 확정 진행 (앞에서부터 하나씩)
export const WP_ORDER = WPS.map(w => w.id);
