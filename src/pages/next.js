// 4·5단계 안내: 지금까지의 결과가 공정·예산으로 어떻게 이어지는지
import { DEFAULTS, generate } from '../yongsan/massing.js';
import { quantities } from '../yongsan/quantities.js';
import { store } from '../store.js';

export const title = '4·5단계 공정·예산';
const fmt = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });

export function mount(root) {
  const S = store.get();
  const gen = generate({ ...DEFAULTS, ...(S.mass || {}) });
  const Q = quantities(gen), t = gen.totals;
  const typ = gen.bldgs.filter(b => b.kind === 'apt' || b.kind === 'officetel' || b.kind === 'office' || b.kind === 'landmark');
  const typFloors = typ.reduce((s, b) => s + b.floors.filter(f => ['res', 'officetel', 'office'].includes(f.use)).length, 0);
  root.innerHTML = `
  <div class="page-h"><div><span class="label-sm">4·5단계 · 준비 중</span><h1>공정 4D와 예산 5D로 이어질 값</h1>
    <p>3단계 일람표의 층 단위 물량이 다음 단계의 입력이 됩니다. 아래 값은 지금 2단계 배치안에서 바로 계산한 것입니다.</p></div>
    <div class="actions"><a class="btn ghost" href="#/schedule">← 3단계 층별 일람표</a></div></div>
  <div class="p-next">
    <section class="panel pad"><div class="sec-h"><h2>넘길 준비가 된 값</h2></div>
      <dl class="kv">
        <dt>동수 · 층 합계</dt><dd>${t.towers}동 · ${fmt(Q.floorCount)}개 층</dd>
        <dt>기준층 (골조 반복 사이클 대상)</dt><dd>${fmt(typFloors)}개 층</dd>
        <dt>지상 · 지하 연면적</dt><dd>${fmt(t.gfaAbove)}㎡ · ${fmt(t.gfaBelow)}㎡</dd>
        <dt>외벽 면적 (창 포함)</dt><dd>${fmt(Q.facade)}㎡</dd>
        <dt>굴토량 · 최대 깊이</dt><dd>${fmt(Q.excavation)}㎥ · ${fmt(Q.maxDepth, 1)}m</dd>
        <dt>세대 · 주차</dt><dd>${fmt(t.units)} · ${fmt(t.parking)}대</dd>
      </dl></section>
    <div class="road">
      <section class="panel pad"><h3>4단계 공정 4D</h3><p>동별 층수와 층고로 골조 사이클(기준층 5~7일)을 잡고, 굴토·기초·골조·외장·마감 공종의 선후관계로 공정표를 만듭니다. 타워크레인·호이스트 간섭을 동 배치에서 검토합니다.</p></section>
      <section class="panel pad"><h3>5단계 예산 5D</h3><p>층별 용도·면적·층고에 공종별 단가를 곱해 공사비를 산정하고, 공정표와 연결해 월별 기성·자금 흐름을 냅니다. 1단계 사업성 모델과 비교합니다.</p></section>
      <section class="panel pad"><h3>6단계 품질·자재·안전</h3><p>층별 물량으로 레미콘·철근·커튼월 반입 계획을 세우고, 공정 중첩 구간의 사고 위험을 예측합니다.</p></section>
    </div>
  </div>`;
  return () => {};
}
