// 기초 이후 세부 공종의 판정: 가설 · 지하 방수 · 철근 · 타설 · 철골 · 수직 운송 · 창호 · 단열 · 지붕 ·
// 공조 · 위생 · 소방 · 전기 · 통신 · 승강기 · 칸막이 · 바닥 · 천장 · 도장 · 조경 · 시운전.
// 각 판정은 대표 동(단면 시뮬레이션과 같은 건물)의 물량·높이로 공학 추정치를 내고 근거를 남긴다.
// 추정식은 국내 설계 기준·실무 경험치를 단순화한 값이라, 비교·순서 판단용이다.
import { exposure } from './risk.js';

const r0 = (v) => Math.round(v);
const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => Math.round(v).toLocaleString('ko-KR');
const COLD = ['GWD', 'GGN', 'CBK'];
const SOUTH = ['BSN', 'USN', 'DGU', 'GNM', 'JNM', 'JBK', 'GWJ', 'GBK'];
const CLEAN = ['fab', 'bio', 'battery'];
const PLANT = ['chem', 'power', 'water'];
// 냉방 부하 (W/㎡ 연면적) · 전기 수전 밀도 (VA/㎡) — 용도별 설계 경험치
const COOL = { housing: 45, mixed: 70, office: 110, retail: 150, hotel: 95, museum: 120, arena: 140, hospital: 140, lab: 180, fab: 900, battery: 450, bio: 350, dc: 1200, logistics: 35, chem: 250, power: 250, water: 120 };
const ELEC = { housing: 45, mixed: 80, office: 130, retail: 160, hotel: 110, museum: 120, arena: 140, hospital: 170, lab: 220, fab: 1100, battery: 700, bio: 450, dc: 1600, logistics: 50, chem: 400, power: 300, water: 250 };
// 철근 사용량 (t/㎡ 지상 연면적) — 골조 형식별
const REBAR = { rcwall: 0.09, rcframe: 0.1, hybrid: 0.06, src: 0.11, steel: 0.035, pc: 0.05, modular: 0.02, truss: 0.05, module: 0.02, stick: 0.02 };
const STEEL = { hybrid: 0.09, steel: 0.15, src: 0.12, truss: 0.08, module: 0.2, stick: 0.18 };
// 창 열관류율 기준 (W/㎡K, 외기 직접) — 에너지절약설계기준을 단순화
export function uLimit(reg, res) {
  const z = COLD.includes(reg) ? 0 : reg === 'JJU' ? 3 : SOUTH.includes(reg) ? 2 : 1;
  return (res ? [0.9, 1.0, 1.2, 1.6] : [1.3, 1.5, 1.8, 2.2])[z];
}
// 생활 소음: 수음점(인접 건물)에서 공사 소음 (dB(A)) — 굴착·브레이커 합성 음원 90dB(A)@7.5m, 거리 감쇠 + 가설 방음벽 감쇠
export const BARRIER = { std: 5, sound: 15, modular: 6, mini: 0 };
export const siteNoise = (adj, prep) => r0(90 - 20 * Math.log10(Math.max(7.5, adj) / 7.5) - (BARRIER[prep] ?? 5));
// 콘크리트 압송: 필요 압력 (MPa) ≈ 정수두 + 관 마찰 (수직 1m당 약 0.045MPa) + 여유
export const pumpMPa = (H) => r1(0.045 * H + 1.5);
export const BOOM_REACH = 58; // 붐 펌프카 수직 도달 (m)
// 승강기 정격 속도 (m/s)
export const elevSpeed = (id, H) => (id === 'dd' ? 9 : id === 'dest' ? (H > 150 ? 7 : 4) : id === 'rope' ? (H > 150 ? 6 : H > 60 ? 3 : 1.75) : id === 'mrl' ? (H > 60 ? 2.5 : 1.75) : 1);
// 호이스트 (속도 m/min · 1회 인원 · 대수)
export const HOIST = { rack: { v: 40, cap: 25, n: 2 }, fast: { v: 100, cap: 40, n: 2 }, jump: { v: 210, cap: 21, n: 3 }, lift: { v: 30, cap: 0, n: 1 } };

export function checksMore(wpId, R, G, h) {
  const { d, cond, fx, S, Q } = R;
  const ids = fx.ids, id = ids[wpId], u = d.u.id;
  const { pro, con, clash, W, days, wpLabel, optName, NEI, ROAD } = h;
  const above = (G.main.floors || []).filter(f => f.lv > 0);
  const nF = Math.max(1, above.length), H = G.H;
  const gfa = above.reduce((a, f) => a + (f.area || 0), 0) || G.bw * G.bw * nF;
  const plate = gfa / nF;
  const roofA = G.main.foot || plate;
  const typH = above.length ? above.slice(1, -1).reduce((a, f) => a + f.h, 0) / Math.max(1, above.length - 2) || above[0].h : 4;

  if (wpId === 'prep') {
    const L = siteNoise(cond.adj, id), L0 = siteNoise(cond.adj, 'std');
    const lim = 65;
    if (L > lim && cond.noise !== 'low') clash(L - lim > 10 ? 3 : 2, NEI, `굴착기 소음 ${L}dB(A) > 기준 ${lim}dB(A)`, `인접 건물(${cond.adj}m)에서 예상되는 굴착·브레이커 소음입니다. 가설 방음벽 ${BARRIER[id] ?? 5}dB 감쇠를 넣은 값이에요`, { mark: 'noise', fix: id !== 'sound' ? { wp: 'prep', opt: 'sound', label: '고차단 방음벽으로' } : null });
    else if (cond.noise !== 'low') pro(`인접 건물 소음 ${L}dB(A) (기준 ${lim})`, id === 'sound' ? `방음벽 감쇠 ${BARRIER.sound}dB로 표준 울타리(${L0}dB)보다 ${L0 - L}dB 낮습니다` : '거리 감쇠만으로 생활소음 기준 안쪽입니다');
    if (id === 'sound') pro('소음·분진 실시간 공개', '전광판·주민 앱으로 측정값을 공개해 민원을 미리 줄입니다 (RSK-21)');
    if (id === 'modular') pro('출입·인력 관리 자동화', `안면 인식 게이트로 근로자 이력·자격을 관리합니다. 착공 준비 ${days('prep')}일`);
    if (id === 'mini') pro(`착공 준비 ${days('prep')}일`, '외곽 부지라 펜스·출입 통제만 하고 바로 토공에 들어갑니다');
    if (id === 'std' && cond.noise === 'high') con(2, '3m 울타리로 고층 주거 소음 차단 한계', '울타리 높이보다 높은 층에는 감쇠가 거의 없습니다', { fix: { wp: 'prep', opt: 'sound', label: '고차단 방음벽으로' } });
    if (Q.excavation > 0) { const tr = r0(Q.excavation * G.share / Math.max(20, days('excav') || 60) / 15); if (tr > 0) pro(`세륜 대상 덤프 하루 약 ${fmt(tr)}대`, '토사 반출 덤프마다 바퀴를 씻어 도로 분진을 막습니다'); }
  }

  if (wpId === 'bwp') {
    if (d.depth <= 0.5) { pro('지하층 없음', '기초 하부 방습만 둡니다'); return; }
    const head = Math.max(0, d.belowGW), kPa = r0(9.81 * head);
    if (head > 0.5) pro(`외벽 하부 수압 ${kPa}kPa (수두 ${r1(head)}m)`, `지하수면 GL−${cond.gw}m 아래로 ${r1(head)}m 잠기는 외벽·기초의 방수 설계 압력입니다`);
    if (id === 'sheet' && cond.adj < 15) clash(3, `${wpLabel('wall')} · ${NEI}`, '외벽 바깥 작업 공간 없음 (합벽)', `인접 건물이 ${cond.adj}m라 흙막이에 붙여 외벽을 칩니다. 바깥에서 시트를 붙일 1m 공간이 없어요`, { mark: 'leak', fix: { wp: 'bwp', opt: 'pre', label: '선부착 시트로' } });
    if (id === 'cryst' && head > 4) con(2, `수두 ${r1(head)}m에 내방수`, '결정성 방수는 미세 균열만 메웁니다. 샌 물을 이중벽으로 모아 상시 배수해야 합니다', { mark: 'leak', fix: { wp: 'bwp', opt: 'pre', label: '선부착 시트로' } });
    if (id === 'pre') pro('구체와 일체 접착', '시트 위로 콘크리트를 쳐 붙여서, 시트 뒤로 물이 돌아다니는 길이 없습니다');
    if (id === 'tank') pro('구체 자체가 방수층', `수밀 배합 + 균열 제어 철근으로 시트 이음을 없앱니다. 이음부 지수판 약 ${fmt(2 * (G.pw + G.pw) * G.nB)}m`);
    if (id === 'bento' && cond.ground === 'F') con(2, '매립지 염분', '바닷물 성분이 벤토나이트 팽창을 떨어뜨립니다', { fix: { wp: 'bwp', opt: 'pre', label: '선부착 시트로' } });
    if (id === 'pre' || id === 'tank') con(1, '철근 작업 중 방수층 보호', '시트·지수판 위에서 철근을 엮어 찢김을 검측해야 합니다 (스페이서·보호판)');
    pro(`누수 지수 ${fx.leak.toFixed(2)}`, '1.0 = 외방수 시트 기준, 낮을수록 지하 누수 하자 가능성이 작습니다 (RSK-18)');
    if (ids.water === 'drain' && id === 'cryst') pro('영구 배수와 연계', '이중벽 배수판 → 집수정 → 영구 배수 펌프로 이어집니다');
  }

  if (wpId === 'rebar') {
    const t = r0(gfa * (REBAR[ids.frame] ?? 0.08));
    pro(`대표 동 철근 약 ${fmt(t)}t`, `${optName('frame', ids.frame)} 기준 ${(REBAR[ids.frame] ?? 0.08) * 1000}kg/㎡ × 지상 ${fmt(gfa)}㎡`);
    if (id === 'site' && cond.adj < 15) clash(2, `${wpLabel('prep')} · ${NEI}`, '현장 가공장 공간 부족', '절단·절곡장(약 1,000㎡)과 야적장을 둘 곳이 없어 도로 점용·이중 운반이 생깁니다', { mark: 'yard', fix: { wp: 'rebar', opt: 'shop', label: '공장 가공으로' } });
    if (id === 'site') con(1, '스크랩 손실 약 5%', `현장 절단 손실로 약 ${fmt(t * 0.05)}t이 버려집니다`);
    if (id === 'shop') pro(`손실 5% → 1.5% (약 ${fmt(t * 0.035)}t 절감)`, 'BIM 배근 모델에서 바로 절단·절곡 데이터를 뽑아 공장 가공합니다');
    if (id === 'cage') { pro('기둥·벽 철근을 지상에서 조립', '고소 결속 작업이 줄고 층 사이클이 빨라집니다'); clash(1, wpLabel('lift'), `케이지 인양 (개당 2~6t)`, '크레인 훅 시간을 골조 양중과 나눠 써야 합니다', { mark: 'crane' }); }
    if (id === 'coupler') pro(`겹침 이음 생략 · 약 ${fmt(t * 0.07)}t 절감`, 'SD600 고강도 철근 + 기계식 이음으로 과밀 배근을 풀고 철근량을 약 7% 줄입니다');
    if (id === 'mesh') pro('슬래브 배근을 공장 철망으로', ids.form === 'deck' ? '데크플레이트 위에 철망·트러스 데크를 깔아 바로 타설합니다' : '바닥 상부근을 용접 철망으로 대신합니다');
    pro(`골조 사이클 × ${fx.rebCyc.toFixed(2)}`, '1.0 = 공장 가공 기준, 낮을수록 층 사이클이 짧습니다');
  }

  if (wpId === 'pour') {
    const P = pumpMPa(H), ex = exposure(S, Q), win = r0((ex.winter || 0) * 100);
    const fa = S.acts.find(a => a.cat === 'found' && a.block === G.main.block) || S.acts.find(a => a.cat === 'found');
    if (id === 'boom' && H > BOOM_REACH) clash(2, wpLabel('lift'), `붐 도달 ${BOOM_REACH}m < 대표 동 ${r0(H)}m`, `상층 약 ${Math.max(1, r0((H - BOOM_REACH) / typH))}개 층은 붐이 닿지 않아 크레인 버킷·배관으로 바꿔야 합니다`, { mark: 'pump', fix: { wp: 'pour', opt: 'cpb', label: '고정 배관(CPB)으로' } });
    if (id === 'cpb' && P > 13) con(2, `필요 압송 압력 ${P}MPa`, `일반 고정 펌프(약 13MPa)로는 ${r0(H)}m 꼭대기까지 밀어 올리기 어렵습니다`, { mark: 'pump', fix: { wp: 'pour', opt: 'highp', label: '초고압 펌프로' } });
    else if (id === 'cpb' || id === 'highp') pro(`압송 ${r0(H)}m · 필요 압력 ${P}MPa`, id === 'highp' ? '초고압 펌프(약 35MPa)로 여유 있게 한 번에 올립니다' : '층마다 붐 없이 분배기로 타설합니다');
    if (fa && fa.matVol) {
      const tr = r0(fa.matVol / Math.max(1, fa.pourDays) / 6);
      pro(`기초 매트 ${fmt(fa.matVol)}㎥ ÷ 하루 ${fmt(fa.pourCap)}㎥ = ${fa.pourDays}일`, id === 'multi' ? '여러 대 펌프로 이음(콜드 조인트) 없이 연속 타설합니다' : '하루 타설 한도로 나눠 칩니다. 나눈 곳은 시공 이음이 됩니다');
      if (tr > 250 && cond.adj < 20) clash(2, ROAD, `레미콘 하루 약 ${fmt(tr)}대`, '도심 도로에 레미콘 대기열이 생깁니다. 야간·주말 타설과 대기 공간이 필요합니다', { mark: 'truck' });
    }
    if (win > 10 && id !== 'winter') con(win > 25 ? 2 : 1, `동절기 골조 ${win}%`, '보온·가열 양생 체계를 갖추지 않으면 겨울에 사이클이 늘어납니다 (RSK-11)', { fix: { wp: 'pour', opt: 'winter', label: '동절기 양생 체계로' } });
    if (id === 'winter') pro(`동절기 손실 ${r0((fx.winterK < 1 ? 1 - fx.winterK : 0.35) * 100)}% 감소`, '가열 양생·보온 거푸집으로 초기 동해를 막습니다');
    if (id === 'bucket') clash(1, wpLabel('lift'), '크레인으로 타설', '타설하는 동안 크레인이 다른 자재를 들 수 없습니다', { mark: 'crane' });
  }

  if (wpId === 'steel') {
    if (id === 'none') { pro('철골 접합 공정 없음', `${optName('frame', ids.frame)}에는 철골 부재가 없습니다`); return; }
    const t = r0(gfa * (STEEL[ids.frame] ?? 0.08)), bolts = r0(t * 14);
    pro(`대표 동 철골 약 ${fmt(t)}t`, `고력볼트 약 ${fmt(bolts)}개 · 기둥 이음 약 ${fmt(Math.max(4, r0(plate / 80)) * Math.ceil(nF / 3))}곳`);
    if (id === 'weld' && d.tall) con(2, '고층 현장 용접', '바람·고소 작업으로 용접 품질과 속도가 떨어집니다', { mark: 'weld', fix: { wp: 'steel', opt: 'robot', label: '로봇 용접으로' } });
    if ((id === 'weld' || id === 'robot') && ids.insul === 'spray') clash(3, wpLabel('insul'), '용접 불티 + 우레탄 단열', '같은 시기에 뿜칠 우레탄이 있으면 불티 한 점이 대형 화재가 됩니다 (RSK-08)', { mark: 'weld', fix: { wp: 'insul', opt: 'inner', label: '불연 단열로' } });
    if (id === 'robot') pro('로봇 용접 + 초음파 자동 검사', '기둥 이음 용접을 로봇이 하고 결함을 자동 검사합니다');
    if (id === 'block') { pro('지상 조립 → 일괄 인양', '고소 접합 작업을 지상으로 내립니다'); if (['tower', 'luffing', 'mobile'].includes(ids.lift)) clash(2, wpLabel('lift'), '대블록 무게 (30~200t)', `${optName('lift', ids.lift)}로는 대블록을 들 수 없습니다`, { mark: 'crane', fix: { wp: 'lift', opt: 'crawler', label: '크롤러 크레인으로' } }); }
    if (id === 'bolt') pro('현장 불꽃 작업 최소', '볼트 접합이라 용접 불티·흄이 거의 없습니다');
    con(1, '내화 피복', `철골 부재에 뿜칠 내화(약 ${fmt(t * 25)}㎡)가 들어갑니다. 아래층 설비와 겹치면 비산 보양이 필요합니다`);
  }

  if (wpId === 'hoist') {
    const hs = HOIST[id] || HOIST.rack;
    const workers = r0(Math.min(1500, Math.max(60, gfa / 220)));
    if (id === 'lift') pro('저층 간이 리프트', '자재는 리프트, 사람은 가설 계단으로 오릅니다');
    else {
      const trip = (2 * H / hs.v) + nF * 0.08 + 1.5; // 분: 왕복 + 정지
      const tmin = r0(workers / (hs.cap * hs.n) * trip);
      const msg = `아침 투입 약 ${fmt(workers)}명을 ${hs.n}대(1회 ${hs.cap}명, 분속 ${hs.v}m)로 올리는 데 약 ${tmin}분`;
      if (tmin > 60) con(tmin > 90 ? 3 : 2, `출근 수송 ${tmin}분`, msg + '. 작업 시작이 늦어지고 마감·설비 층 작업 시간이 줄어듭니다', { mark: 'hoist', fix: { wp: 'hoist', opt: id === 'rack' ? 'fast' : 'jump', label: id === 'rack' ? '고속 호이스트로' : '점프 엘리베이터로' } });
      else pro(`출근 수송 ${tmin}분`, msg);
    }
    if (id === 'rack' || id === 'fast') clash(1, wpLabel('skin'), '호이스트 자리 외장 마감 지연', '외벽에 붙은 호이스트를 철거할 때까지 그 줄의 외장·창호를 닫지 못합니다', { mark: 'hoist' });
    if (id === 'jump') pro('영구 승강기를 공사 중 사용', '승강로에서 기계실을 층마다 올리며 쓰다가 그대로 영구 승강기로 마감합니다. 외벽 개구부가 없습니다');
    pro(`설비·마감 층 작업 × ${(1 + ((fx.hoistK || 1) - 1) * Math.min(1, nF / 20)).toFixed(2)}`, '수직 운송 대기가 층 작업 속도에 주는 영향 (1.0 = 기준)');
  }

  if (wpId === 'glaz') {
    const res = d.res || u === 'hotel' || u === 'hospital', lim = uLimit(cond.reg, res), U = fx.uval;
    if (U > lim) con(2, `창 열관류율 ${U} > 기준 ${lim}W/㎡K`, `${res ? '주거' : '비주거'} 외기 직접 창 기준(지역 ${cond.reg})을 넘습니다. 냉난방 부하·결로가 커집니다`, { mark: 'uval', fix: { wp: 'glaz', opt: res && ['wet', 'pcpanel'].includes(ids.skin) ? 'pvc' : 'tpl', label: res && ['wet', 'pcpanel'].includes(ids.skin) ? 'PVC 삼중 창호로' : '삼중 유리로' } });
    else pro(`창 열관류율 ${U} ≤ 기준 ${lim}W/㎡K`, `${res ? '주거' : '비주거'} 외기 직접 창 기준을 맞춥니다`);
    const facade = Q.facadeOfBldg ? Q.facadeOfBldg(G.main) : 4 * Math.sqrt(plate) * H;
    if (id === 'bipv') { const kw = r0(facade * 0.25 * 0.12); pro(`BIPV 약 ${fmt(kw)}kW · 연 ${fmt(kw * 0.75)}MWh`, '남·서측 입면 약 25%에 발전 유리를 둔 가정 (수직면 연 750kWh/kW)'); clash(1, wpLabel('elec'), '입면 직류 배선', '유닛마다 커넥터·인버터 배선이 들어가 전기와 외장 공정을 맞춰야 합니다', { mark: 'pv' }); }
    if (id === 'tpl' && ids.skin === 'unitcw') con(1, '유리 무게 약 +45%', '삼중 유리 유닛이 무거워 앵커·양중 계획을 다시 봅니다');
    if (id === 'vac') con(1, '장납기 수입 유리', '진공 유리는 공급처가 적어 발주를 앞당겨야 합니다 (RSK-13)');
    if (id === 'pvc') pro('주거 기밀·단열 표준', 'PVC 시스템 창 + 삼중 유리로 결로·외풍을 줄입니다');
  }

  if (wpId === 'insul') {
    if (id === 'spray') { const hot = ['steel', 'hybrid', 'truss', 'src'].includes(ids.frame) || d.ind; clash(hot ? 3 : 2, `${wpLabel('steel')} · 화기 작업`, '우레탄 뿜칠 + 용접·절단 불티', '국내 물류창고·공장 대형 화재의 공통 원인입니다. 화기 작업과 시기를 반드시 분리합니다 (RSK-08)', { mark: 'fire', fix: { wp: 'insul', opt: ['unitcw', 'pcpanel', 'metal'].includes(ids.skin) ? 'sandwich' : 'inner', label: '불연 단열로' } }); }
    if (id === 'outer' && H > 22) con(2, `높이 ${r0(H)}m 외단열`, '22m 넘는 건물 외벽은 준불연 이상 + 층간 방화띠가 필요합니다. 불연 미네랄울로 시공합니다', { mark: 'fire' });
    if (id === 'outer') pro('열교 차단', '슬래브 끝·기둥을 바깥에서 감싸 결로 하자를 줄입니다');
    if (id === 'inner' && d.res) con(1, '슬래브 끝 열교', '외벽과 슬래브가 만나는 곳에 단열이 끊겨 결로가 생기기 쉽습니다 (단열 보강재 필요)', { mark: 'uval' });
    if (id === 'vip') { const per = 4 * Math.sqrt(plate); pro(`단열 두께 약 190mm 감소 → 층당 +${fmt(per * 0.19)}㎡`, `진공 단열재(약 30mm)가 일반 단열(약 220mm)을 대신해 전용 면적이 늘어납니다 (대표 동 ${fmt(per * 0.19 * nF)}㎡)`); }
    if (id === 'sandwich') pro('외피 공정 하나로 단열까지', `${optName('skin', ids.skin)} 속에 단열이 들어 있어 단열 공정이 따로 없습니다`);
  }

  if (wpId === 'roof') {
    pro(`지붕 ${fmt(roofA)}㎡ · ${fx.roofDays}일`, `골조 완료 후 지붕을 닫아야 최상층 마감·설비가 들어갑니다`);
    if (id === 'green') clash(2, wpLabel('frame'), `녹화 하중 약 3.5kN/㎡`, `포화 토양 300mm + 식재로 일반 지붕 하중(1.0kN/㎡)의 3배 이상입니다. 지붕 슬래브·보를 보강해야 합니다 (대표 동 약 ${fmt(roofA * 0.35)}t)`, { mark: 'load' });
    if (id === 'pv') { const kw = r0(roofA * 0.55 * 0.2); pro(`태양광 약 ${fmt(kw)}kW · 연 ${fmt(kw * 1.3)}MWh`, '지붕 면적 55%에 패널 (연 1,300kWh/kW)'); if (['central', 'vrf', 'clean', 'crac', 'process'].includes(ids.hvac)) clash(1, wpLabel('hvac'), '옥상 설비와 면적 다툼', `${optName('hvac', ids.hvac)}의 냉각탑·실외기가 지붕을 차지해 패널 면적이 줄어듭니다`, { mark: 'roofplant' }); }
    if (id === 'urethane' && d.tall) con(2, '고층 노출 도막', '자외선·풍압으로 들뜸 하자가 잦습니다', { fix: { wp: 'roof', opt: 'hybrid', label: '복합 방수로' } });
    if (id === 'hybrid') pro('설비 기초 관통부에 강함', '시트 위 도막으로 관통부·모서리를 이음 없이 덮습니다');
    if (id === 'metal') pro('장스팬 지붕을 빠르게 닫음', '단열 일체 금속 지붕으로 내부 공정을 앞당깁니다');
    if (id === 'asphalt') con(1, '보호 콘크리트 하중·양생', '방수층 위 누름 콘크리트(약 80mm)가 하중과 양생 기간을 더합니다');
  }

  if (wpId === 'hvac') {
    const kw = gfa * (COOL[u] ?? 100) / 1000, rt = r0(kw / 3.517);
    pro(`대표 동 냉방 부하 약 ${fmt(rt)}RT (${fmt(kw)}kW)`, `${d.u.name} ${COOL[u] ?? 100}W/㎡ × ${fmt(gfa)}㎡`);
    if (id === 'central') { pro('대용량·정밀 공조', '냉동기·보일러를 모아 효율과 공기질 관리가 좋습니다'); if (['pv', 'green'].includes(ids.roof)) clash(1, wpLabel('roof'), '냉각탑 자리', '옥상 냉각탑이 태양광·녹화 면적을 줄입니다', { mark: 'roofplant' }); }
    if (id === 'vrf') { const n = Math.max(1, r0(kw / 56)); pro(`실외기 약 ${n}대`, '구역별로 따로 켜고 끕니다'); if (H > 110) con(2, `냉매 배관 높이 ${r0(H)}m`, '실외기-실내기 높이 차 한계(약 110m)를 넘어 중간 실외기실이 필요합니다', { mark: 'vrf', fix: { wp: 'hvac', opt: 'central', label: '중앙식으로' } }); }
    if (id === 'geo') { const n = r0(kw * 0.6 / 7), need = n * 30, free = Math.max(0, (R.site.area || d.area) - G.main.foot * 2); pro(`지중 열교환 보어홀 약 ${fmt(n)}공`, '150m 깊이 · 공당 약 7kW'); if (need > free) clash(2, wpLabel('land'), `보어홀 필요 면적 ${fmt(need)}㎡`, '부지 빈 땅이 부족해 지하 주차장 아래까지 천공해야 합니다', { mark: 'geo' }); }
    if (id === 'clean') { const ffu = r0(plate * 0.6 / 1.44 * 0.5); pro(`FFU 약 ${fmt(ffu)}대/층`, '청정 구역 60% · 커버율 50% (ISO 5~6) 가정'); if (ids.ceil !== 'cleang') clash(3, wpLabel('ceil'), 'FFU를 얹을 천장 그리드 없음', '청정 공조는 FFU 그리드 천장과 짝입니다', { mark: 'duct', fix: { wp: 'ceil', opt: 'cleang', label: '클린룸 그리드로' } }); }
    if (id === 'crac') pro(`예상 PUE 약 ${ids.ict === 'twin' ? 1.25 : 1.35}`, '프리쿨링 + 항온항습기 이중화. 일반 중앙식(약 1.6)보다 운영 전력이 적습니다');
    if (id === 'district') pro('지역난방 + 바닥 난방', '세대 보일러가 없어 공사·유지관리가 단순합니다');
    if (id === 'radiant') con(1, '결로 제어', '복사 냉방 표면 온도를 이슬점 위로 유지해야 합니다 (DOAS 제습 연동)');
    if (id === 'process') pro('공정 냉각·국소 배기', '공정 발열과 유해 가스를 따로 처리합니다');
    if (ids.ceil === 'exposed' && id === 'central' && ids.mep === 'conv') con(1, '노출 덕트 정렬', '대형 덕트가 그대로 보여 현장 정렬 시공이 오래 걸립니다', { fix: { wp: 'mep', opt: 'prefab', label: '프리팹 랙으로' } });
  }

  if (wpId === 'plumb') {
    const p = r1(0.0098 * H);
    if (H > 70 && id !== 'zone') con(2, `최하층 정수압 ${p}MPa > 0.7MPa`, `한 구역으로 ${r0(H)}m를 급수하면 아래층 수압이 너무 높아 감압 밸브가 층마다 필요합니다`, { mark: 'press', fix: d.maxH >= 80 ? { wp: 'plumb', opt: 'zone', label: '구역 분할로' } : null });
    if (id === 'zone') pro(`급수 구역 ${Math.ceil(H / 70)}개`, '구역당 약 70m로 나눠 중간 수조·감압으로 수압을 맞춥니다');
    if (id === 'pod') { const n = r0(above.reduce((a, f) => a + (f.units || 0), 0) * (d.res ? 1.6 : 1)) || r0(gfa / 60); pro(`욕실 유닛 약 ${fmt(n)}개`, '공장에서 완성해 현장은 연결만 합니다'); clash(1, wpLabel('frame'), '욕실 바닥 단차 (Down Slab)', '유닛 바닥 두께만큼 슬래브를 낮춰 쳐야 합니다', { mark: 'pod' }); clash(1, wpLabel('hoist'), '유닛 반입 (개당 1~2t)', '층마다 반입 개구부와 양중 시간이 필요합니다', { mark: 'crane' }); }
    if (id === 'quiet') pro('층상 배관', '아래층 천장을 지나지 않아 배수 소음·누수 분쟁이 줄어듭니다');
    if (id === 'upw') pro('초순수 배관', 'PVDF·스테인리스 EP관을 오비탈 용접해 공정 용수 순도를 지킵니다');
    if (id === 'reuse') pro('상수 사용 약 30% 절감', `빗물·중수 저류조 약 ${fmt(roofA * 0.05)}㎥를 지하에 둡니다`);
  }

  if (wpId === 'fire') {
    const heads = r0(gfa / 10);
    pro(`스프링클러 헤드 약 ${fmt(heads)}개`, '헤드 1개당 약 10㎡ (대표 동)');
    if (id === 'wet' && ['dc', 'fab'].includes(u)) con(3, '전산·클린룸에 물 소화', '오작동·배관 누수 한 번이 장비 피해로 이어집니다', { mark: 'sprk', fix: { wp: 'fire', opt: u === 'dc' ? 'gas' : 'preaction', label: u === 'dc' ? '가스계로' : '준비작동식으로' } });
    if (id === 'gas') { pro('물 없이 소화', '청정 약제로 전산·수장고 장비를 보호합니다'); clash(1, `${wpLabel('part')} · ${wpLabel('ceil')}`, '방호 구역 기밀', '약제 농도를 유지하려면 벽·천장 틈을 막고 압력 배출구를 둬야 합니다', { mark: 'sprk' }); }
    if (id === 'deluge') pro(`일제살수·포 소화`, `탱크·공정 구역을 한꺼번에 덮습니다. 소화 수조 약 ${fmt(gfa * 0.02)}톤`);
    if (id === 'smart') pro('IoT 감지 + 제연 통합', '화재 위치를 바로 찾아 제연·피난 유도를 자동으로 엽니다');
    if (id === 'preaction') pro('배관 평상시 비어 있음', '감지기가 먼저 작동해야 물이 차서 오작동·동결 피해가 없습니다');
    if (ids.mep === 'conv' && !(fx.qa || []).includes('clash')) clash(1, wpLabel('hvac'), '스프링클러 배관 · 덕트 간섭', '천장 속에서 가지 배관과 덕트가 부딪혀 헤드 위치를 옮기는 일이 생깁니다 (RSK-12)', { mark: 'mep' });
  }

  if (wpId === 'elec') {
    const mva = r1(gfa * (ELEC[u] ?? 100) / 1e6 / 0.7);
    pro(`대표 동 수전 약 ${mva}MVA`, `${ELEC[u] ?? 100}VA/㎡ × ${fmt(gfa)}㎡ ÷ 수용률 0.7 · 변압기 약 ${Math.max(1, Math.ceil(mva / 2.5))}대`);
    const critical = ['dc', 'fab', 'hospital', 'bio'].includes(u);
    if (id === 'std' && critical) con(3, '단일 수전', '한 번의 정전이 공정 정지·의료 중단입니다', { mark: 'xfmr', fix: { wp: 'elec', opt: 'dual', label: '이중 수전으로' } });
    if (id === 'dual') pro('무정전 이중화', 'UPS·비상 발전기·이중 수전으로 정전에도 멈추지 않습니다');
    if (id === 'bus') pro('버스덕트 간선', `${r0(H)}m 간선을 굵은 케이블 여러 가닥 대신 한 줄로 올려 공기를 줄입니다`);
    if (id === 'renew') { con(2, 'ESS 배터리실 화재', '전용 방화 구획·열폭주 감지가 필요합니다', { mark: 'xfmr' }); if (['pv'].includes(ids.roof) || ids.glaz === 'bipv') pro('태양광 연계', '지붕·입면 발전을 ESS에 저장해 피크 전력을 줄입니다'); }
    if (id === 'smart') pro('회로별 사용량 계측', '스마트 차단기로 에너지 사용을 회로 단위로 봅니다');
    if (d.depth > 0.5 && cond.gw < 5 && G.nB > 0) con(1, '지하 전기실 침수', `지하수면이 얕습니다(GL−${cond.gw}m). 수변전실을 B1 이상 또는 지상으로 올리고 차수판을 둡니다`, { mark: 'xfmr' });
  }

  if (wpId === 'ict') {
    if (id === 'basic' && ['office', 'dc', 'hospital', 'lab'].includes(u)) con(1, '운영 자동화 없음', '설비를 따로따로 관리해 운영 인력·에너지가 많이 듭니다', { fix: { wp: 'ict', opt: 'ibs', label: '통합 자동제어로' } });
    if (id === 'twin') { pro('BIM 모델이 운영까지 이어짐', '시공 BIM에 센서·설비 이력을 붙여 고장을 미리 잡습니다'); if (ids.comm === 'digital') pro('디지털 커미셔닝과 연계', '시운전 데이터가 그대로 운영 트윈의 기준값이 됩니다'); }
    if (id === 'iot') pro(`센서 약 ${fmt(gfa / 25)}개`, '재실·온습도·CO₂ 25㎡당 1개 가정. BEMS로 에너지를 줄입니다');
    if (id === 'ibs') pro('통합 관제', '공조·조명·방범·승강기를 한 화면에서 제어합니다');
    if (id === 'basic' && d.res) pro('공동주택 표준', '홈네트워크·CCTV·방송 기본 구성');
  }

  if (wpId === 'elev') {
    if (d.plant) { pro('점검·화물용 승강기', '플랜트 구조물은 점검 계단과 화물용만 둡니다'); return; }
    const v = elevSpeed(id, H), n = Math.max(2, Math.ceil(gfa / (d.res ? 5500 : u === 'office' ? 4000 : 4500)));
    const tt = r0(H / v + 8);
    pro(`승강기 약 ${n}대 · 최상층까지 약 ${tt}초`, `정격 속도 ${v}m/s (대표 동 ${r0(H)}m)`);
    if (H > 150 && !['dd', 'dest'].includes(id)) con(2, `${r0(H)}m를 단일 존으로`, '승강로가 많아져 코어가 커지고 대기 시간이 깁니다', { fix: { wp: 'elev', opt: 'dd', label: '더블데크로' } });
    if (ids.hoist === 'jump') pro('점프 엘리베이터 → 영구 승강기', '공사 중 쓰던 승강기를 그대로 마감해 설치 기간이 짧습니다');
    if (id === 'mrl') pro('기계실 없음', '옥탑 기계실을 없애 높이·공사비를 줄입니다');
    if (id === 'dest') pro('행선층 예약 배차', '출근 피크 대기 시간을 약 30% 줄입니다');
    if (id === 'dd') pro('두 층을 한 번에', '승강로 수를 줄여 코어 면적을 아낍니다');
    if (id === 'freight') pro('대형 화물·장비 수송', '장비 반입과 운영 물류를 함께 해결합니다');
    pro(`설치·검사 ${r0(45 * fx.elevDays)}일`, '레일·카·안전 검사 (시운전 기간에 반영)');
  }

  if (wpId === 'part') {
    const KG = { block: 220, alc: 90, dry: 45, module: 60, cleanp: 30 };
    const wallA = gfa * (d.res ? 0.9 : 0.5), t = r0(wallA * (KG[id] || 60) / 1000);
    pro(`칸막이 약 ${fmt(wallA)}㎡ · ${fmt(t)}t`, `벽 1㎡당 ${KG[id] || 60}kg (대표 동)`);
    if (id === 'block') { clash(1, wpLabel('plumb'), '배관 매립 벽 따내기', '조적 후 전선관·배관을 묻으려 벽을 깨고 다시 미장합니다', { mark: 'chase' }); if (d.tall) con(2, '고층 습식 조적', '벽돌 양중과 미장 양생으로 층 작업이 느립니다', { fix: { wp: 'part', opt: 'dry', label: '건식벽으로' } }); }
    if (id === 'dry') { pro('양생 없이 다음 공정', '경량철골 + 석고보드로 바로 도장·설비 마감에 들어갑니다'); if (d.res) con(1, '세대 간 벽 차음', '세대 경계벽은 이중 보드·흡음재로 차음 성능을 확인해야 합니다'); }
    if (id === 'module' || id === 'cleanp') pro(id === 'module' ? '공장 제작 벽 패널' : '클린룸 패널 구획', id === 'module' ? '반복 실을 공장 패널로 끼워 넣습니다' : '정전기 방지 패널로 청정 구역을 기밀하게 나눕니다');
    if (id === 'alc') pro('가볍고 단열', '블록보다 약 60% 가볍고 단열·차음이 좋습니다');
  }

  if (wpId === 'floor') {
    if (id === 'wet') { con(d.tall ? 2 : 1, '방통 양생 약 21일', '기포 콘크리트·방통 모르타르가 마를 때까지 마감재를 깔 수 없습니다', { mark: 'wetfloor', fix: d.res ? { wp: 'floor', opt: 'dryondol', label: '건식 온돌로' } : null }); pro('공동주택 표준', '시공 실적이 가장 많고 단가가 낮습니다'); }
    if (id === 'dryondol') pro('바닥 충격음 1등급 목표', '고성능 완충재 + 건식 패널로 양생 없이 마감합니다 (사후 확인제 대응)');
    if (id === 'oa') { pro('이중 바닥 약 300mm', '배선·공조를 바닥 속에서 바꿀 수 있습니다'); }
    if (id === 'epoxy') pro('대전 방지·내화학', `에폭시 바닥 약 ${fmt(gfa)}㎡. 경화 3~7일 동안 출입을 막습니다`);
    if (id === 'polish') pro('마감재 없는 바닥', '타설 표면을 연마해 별도 바닥재가 없습니다');
    if (id === 'tile') pro(u === 'hospital' ? '이음 용접 비닐 시트' : '카펫·비닐 타일', u === 'hospital' ? '이음을 녹여 붙여 병실·복도 위생을 지킵니다' : '건식 접착이라 빠르고 교체가 쉽습니다');
    if (id === 'stone') con(1, '석재 하중·습식 시공', '붙임 모르타르 양생과 하중이 늘어납니다');
  }

  if (wpId === 'ceil') {
    const PLEN = { central: 0.9, vrf: 0.5, geo: 0.8, radiant: 0.35, district: 0.3, clean: 1.4, crac: 0.6, process: 0.8 };
    const fin = { oa: 0.3, wet: 0.12, dryondol: 0.08, stone: 0.08 }[ids.floor] || 0.03;
    const plen = id === 'exposed' ? 0 : PLEN[ids.hvac] ?? 0.6, clear = r1(typH - 0.25 - plen - fin);
    const need = d.res ? 2.3 : 2.6;
    if (clear < need && id !== 'exposed') con(2, `천장고 ${clear}m < ${need}m`, `층고 ${r1(typH)}m − 슬래브 0.25 − 천장 속 ${plen}m(${optName('hvac', ids.hvac)}) − 바닥 ${fin}m`, { mark: 'ceilgap', fix: ['office', 'retail', 'museum', 'lab', 'logistics'].includes(u) ? { wp: 'ceil', opt: 'exposed', label: '노출 천장으로' } : null });
    else pro(`천장고 약 ${clear}m`, `층고 ${r1(typH)}m − 슬래브 0.25 − 천장 속 ${plen}m − 바닥 ${fin}m`);
    if (id === 'exposed') { pro('천장 마감 생략', '층고를 그대로 쓰고 설비를 정렬해 도장합니다'); if (ids.mep === 'conv') con(1, '현장 설비 정렬', '보이는 배관·덕트를 현장에서 줄 맞춰 시공해야 합니다', { fix: { wp: 'mep', opt: 'prefab', label: '프리팹 랙으로' } }); }
    if (id === 'module') pro('조명·설비 일체 모듈', '천장판에 조명·디퓨저·스프링클러를 공장에서 붙여 옵니다');
    if (id === 'tbar') pro('점검이 쉬움', '천장판을 들어 설비를 바로 점검합니다');
    if (id === 'mbar' && ['central', 'vrf'].includes(ids.hvac)) con(1, '점검구 필요', '석고 천장은 설비 위치마다 점검구를 따로 둬야 합니다');
    if (id === 'cleang') pro('FFU 그리드', '젤 실 그리드로 필터·FFU를 기밀하게 얹습니다');
  }

  if (wpId === 'paint') {
    const area = gfa * (d.res ? 2.6 : 1.6);
    pro(`도장·벽지 약 ${fmt(area)}㎡`, '벽·천장 마감 면적 (대표 동)');
    if (id === 'robot') pro('하루 시공량 약 2배', '퍼티·도장 로봇이 넓은 벽면을 일정한 두께로 칠합니다');
    if (id === 'eco') { pro('실내 공기질', `무VOC 도료 + 베이크아웃으로 신축 실내 공기질 기준을 맞춥니다`); con(1, '베이크아웃 약 3일', '입주 전 난방 가열·환기 기간이 추가됩니다'); }
    if (id === 'airless') { pro('넓은 면을 빠르게', '스프레이로 산업 시설 벽·천장을 칠합니다'); if (ids.comm === 'phased') con(1, '사용 중 구역 비산', '부분 준공 구역 옆에서 뿌리면 비산 보양이 필요합니다'); }
    if (id === 'roller' && d.tall) con(1, '반복 층 인력 의존', '도장 인력 수급에 따라 마감 속도가 흔들립니다 (RSK-15)', { fix: { wp: 'paint', opt: 'robot', label: '도장 로봇으로' } });
    if (id === 'paper') pro('주거 표준', '초배·정배 벽지 마감');
  }

  if (wpId === 'land') {
    const ext = Math.max(0, (R.site.area || d.area) * G.share - G.main.foot);
    pro(`외부 공사 약 ${fmt(ext)}㎡ · ${days('land')}일`, '포장·식재·외부 시설 (대표 블록)');
    if (id === 'deck') clash(2, wpLabel('base'), `인공 지반 하중 약 25kN/㎡`, '지하 주차장 지붕 위에 흙 1.2m와 큰 나무가 올라갑니다. B1 상부 슬래브·기둥을 이 하중으로 설계해야 합니다', { mark: 'deckload' });
    if (id === 'lid') pro(`빗물 저류 약 ${fmt(ext * 0.05)}㎥`, '투수 포장·빗물 정원으로 유출을 줄입니다 (물순환 인증)');
    if (id === 'ind') pro('중차량 포장·방류 관리', '대형 트럭 하중과 방류 수질 기준을 맞춥니다');
    if (id === 'pre') pro('선행 조경', '외곽 녹지를 먼저 심어 준공 직전 병목을 줄입니다');
    if (id === 'std' && d.ind) con(2, '산업 하중 부족', '일반 포장은 대형 트럭 하중에 금방 깨집니다', { fix: { wp: 'land', opt: 'ind', label: '산업 단지 외부로' } });
  }

  if (wpId === 'comm') {
    pro(`시운전·준공 ${days('comm')}일`, `시운전 방식 × 승강기 설치 기간${fx.liftEarly ? ' × 점프 엘리베이터 조기 사용' : ''}`);
    const proc = [...CLEAN, ...PLANT, 'dc'].includes(u);
    if (proc && id !== 'perf') con(3, '공정 성능 시험 없음', '청정도·전력 품질·공정 성능을 보증하지 않고 가동하면 수율·안전 문제가 큽니다 (RSK-20)', { mark: 'comm', fix: { wp: 'comm', opt: 'perf', label: '성능 검증 시운전으로' } });
    if (id === 'perf') pro('가동 전 성능 보증', '장비 반입 → 훅업 → 단위·통합 성능 시험 → 램프업');
    if (id === 'digital') pro('BIM + BEMS 데이터 검증', '설비 수천 점의 시험 결과를 데이터로 확인합니다');
    if (id === 'tab') pro('TAB 풍량·수량 조정', '공조 풍량과 수량을 실별로 맞춥니다');
    if (id === 'phased') { pro('구역별 먼저 사용', '끝난 동부터 사용승인을 받아 운영을 앞당깁니다'); clash(1, `${wpLabel('land')} · ${ROAD}`, '입주 동선과 공사 차량', '먼저 쓰는 구역과 공사 구역의 출입 동선을 나눠야 합니다', { mark: 'truck' }); if (u === 'hospital') con(2, '병원 부분 개원', '공사 소음·분진이 진료 구역에 들어가지 않게 감염 관리를 해야 합니다'); }
    if (id === 'std' && !proc && (d.tall || d.area > 80000)) con(1, '공종별 단독 시운전', '설비끼리 연동 시험이 없어 입주 후 조정이 길어집니다', { fix: { wp: 'comm', opt: 'tab', label: '통합 시운전으로' } });
  }
}
