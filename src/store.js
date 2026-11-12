// 단계 사이에 넘기는 값과 각 단계의 설정을 한곳에 보관한다 (브라우저 저장소)
const KEY = 'bim-sim-pipeline-v1';
const listeners = new Set();
const blank = () => ({ handoff1: null, mass: null, massFrom: null });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return { ...blank(), ...s };
  } catch (e) { /* 저장소를 쓸 수 없으면 기본값 */ }
  return blank();
}
let state = load();

export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 저장 실패는 무시 */ }
    listeners.forEach(f => f(state));
  },
  subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 1단계 평균 전용면적 → 2단계 평형 구성(59·84·114㎡). 오피스텔(45㎡) 비중을 빼고 아파트 평균을 맞춘다
export function mixForAverage(avgUnit, officetelShare) {
  const s = officetelShare / 100;
  const t = clamp(s < 1 ? (avgUnit - s * 45) / (1 - s) : 84, 59, 114);
  let m59, m84, m114;
  if (t <= 71.5) { m114 = 0; m59 = (8400 - 100 * t) / 25; m84 = 100 - m59; }
  else if (t < 99) { m84 = 50; m59 = (9900 - 100 * t) / 55; m114 = 50 - m59; }
  else { m59 = 0; m114 = (100 * t - 8400) / 30; m84 = 100 - m114; }
  const r = [m59, m84, m114].map(v => Math.round(clamp(v, 0, 100)));
  r[1] = 100 - r[0] - r[2];
  return { mix59: r[0], mix84: r[1], mix114: r[2], aptAvg: t };
}

// 1단계 결과 → 2단계 변수
export function massParamsFromStage1(h, defaults) {
  const housingTarget = clamp(Math.round(h.units / 100) * 100, 2000, 14000);
  const mix = mixForAverage(h.avgUnit, defaults.officetelShare);
  return { ...defaults, housingTarget, mix59: mix.mix59, mix84: mix.mix84, mix114: mix.mix114, rentalShare: clamp(Math.round(h.rentalShare), 0, 60) };
}
