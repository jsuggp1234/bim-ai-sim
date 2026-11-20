// 맥락 지도 카드 (매스 단계 공통): 지도 상태 · 대지 자리(지도에 맞춘 내용) · 대지 네 변 바깥에서 실제로 잰 값.
// 실제 지도가 없을 때는 주변을 지어내지 않고 비워 두며, 그 사실을 적는다.
import { sideText } from '../sim/sitefit.js';
import { fmt } from '../pipeline.js';

const COMPASS = ['동', '남동', '남', '남서', '서', '북서', '북', '북동'];
const cmp = (dx, dz) => COMPASS[((Math.round(Math.atan2(dz, dx) * 180 / Math.PI / 45) % 8) + 8) % 8];

// o: { state: 'loading'|'osm'|'fallback'|'failed'|'off', msg, ctx, site, facts, stats, useFit }
export function mapCardHTML(o) {
  const { state, msg, ctx, site, facts: F, stats: st, useFit } = o;
  const preset = ctx.source === 'preset', real = ctx.source === 'osm';
  const fbName = preset ? '정리한 지형(용산)' : '주변 비움';
  const t = {
    loading: `<span class="dot busy"></span>실제 지도 받는 중${msg ? ' · ' + msg : ''}`,
    osm: `<span class="dot on"></span>실제 지도 (OpenStreetMap)${ctx.bundled ? ` · 사이트에 담아 둔 지도${ctx.at ? ' ' + ctx.at : ''}` : ctx.cached ? ' · 저장본' : ''}${ctx.partial ? ' · 대지 둘레 450m' : ''}`,
    fallback: `<span class="dot"></span>${preset ? fbName : '주변 지도 없음 · 대지만 표시'}`,
    failed: `<span class="dot off"></span>지도 서버에 연결하지 못했습니다 · ${fbName}`,
    off: `<span class="dot"></span>지도 끔 · ${fbName}`,
  }[state] || '';
  const f = site.fit;
  const fitLine = f ? `<div class="mf-fit"><b>대지 자리</b> 실제 도로망에 맞춰 ${f.byRoads ? `장축을 ${fmt(Math.abs(f.rot), 1)}° ${f.rot >= 0 ? '남' : '북'}쪽으로 돌리고` : '방향은 그대로 두고'} ${f.moved >= 5 ? `큰길·건물을 피해 ${cmp(f.off[0], f.off[1])}쪽으로 ${fmt(f.moved)}m 옮겼습니다` : '좌표 자리에 두었습니다'}. <button type="button" class="chipbtn" data-map="fit-off">원래 자리로</button></div>`
    : (real && useFit === false && !preset) ? `<div class="mf-fit"><b>대지 자리</b> 후보지 좌표 그대로(방향은 임의)입니다. <button type="button" class="chipbtn" data-map="fit-on">지도에 맞추기</button></div>` : '';
  const factsHtml = real && F ? `<div class="mf"><div class="mf-h">대지 둘레 · 실제 지도에서 잰 값</div>${F.rows.map(r => `<div class="mf-r"><span class="mf-d">${r.dirKo}</span><span>${sideText(r)}${r.bld && r.first && r.first.kind !== 'bld' ? ` · 건물 ${Math.round(r.bld.d)}m` : ''}</span></div>`).join('')}
      <div class="mf-s">120m 안 건물 ${fmt(F.nB)}동${F.maxH ? ` · 최고 약 ${fmt(F.maxH)}m` : ''} · 트인 변 ${F.openSides}/4${F.adj != null ? ` · 가장 가까운 건물 ${F.adjSide}쪽 ${fmt(F.adj)}m` : ' · 150m 안에 건물 없음'}</div></div>`
    : !real && !preset && state !== 'loading' ? `<div class="mf warn">주변 지도를 받지 못해 대지만 그렸습니다. 주변 건물·도로는 지어내지 않고 비워 두었고, 주변 일조 영향도 계산하지 않습니다. ‘실제 지도 받기’를 누르면 다시 시도합니다.</div>` : '';
  return `<span class="ms">${t}</span>${st ? `<span class="note">건물 ${fmt(st.buildings)} · 도로 ${fmt(st.roads)} · 수목 ${fmt(st.trees)}</span>` : ''}
    <span class="ma">${state === 'osm' ? `<button type="button" class="chipbtn" data-map="off">지도 끄기</button>` : state === 'loading' ? '' : `<button type="button" class="chipbtn" data-map="retry">실제 지도 받기</button>`}</span>${real && (fitLine || factsHtml) ? `<details class="mf-more"><summary>대지 자리 · 둘레 실측</summary>${fitLine}${factsHtml}</details>` : fitLine + factsHtml}`;
}
// 3D 화면 위 배지 글 (실제 지도면 빈 글)
export const ctxBadge = (state, ctx) => ctx.source === 'osm' || ctx.source === 'preset' ? '' : state === 'loading' ? '주변 지도 받는 중' : '주변 지도 없음 · 대지만 표시';
