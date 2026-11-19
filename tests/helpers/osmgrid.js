// 합성 Overpass 응답 (시험용): θ만큼 기운 격자 도시. 건물로 찬 블록들 사이에 빈 블록 묶음(재개발 예정지)이 있고,
// 그 한쪽 변에 6차로 대로, 반대쪽 멀리 철도, 하천·공원이 있다. 실제 지도 서버 없이 대지 맞춤·주변 분석을 시험한다.
const M_LAT = 110574, mLng = (lat) => 111320 * Math.cos(lat * Math.PI / 180);
export function makeGrid(lat0, lng0, th = 23, o = {}) {
  const c = Math.cos(th * Math.PI / 180), s = Math.sin(th * Math.PI / 180);
  const W2 = (a, b) => [a * c - b * s, a * s + b * c];           // 격자 좌표 → 월드
  const ll = (a, b) => { const [x, z] = W2(a, b); return { lat: lat0 - z / M_LAT, lon: lng0 + x / mLng(lat0) }; };
  let id = 1; const el = [];
  const R = (() => { let a = 4242; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  const BW = 96, BD = 78;                                         // 블록 간격
  const eW = o.emptyW ?? 3, eD = o.emptyD ?? 3;                   // 빈 블록 수 (가로×세로)
  const oi = o.offI ?? 0, oj = o.offJ ?? 0;                       // 빈 블록 묶음의 시작 칸
  const N = 11;
  const ax = (i) => (i - 0.37) * BW, az = (j) => (j - 0.41) * BD;  // 격자선 (좌표와 어긋나게)
  const empty = (i, j) => i >= oi && i < oi + eW && j >= oj && j < oj + eD;
  const way = (pts, tags) => el.push({ type: 'way', id: id++, nodes: [], geometry: pts.map(([a, b]) => ll(a, b)), tags });
  for (let i = -N; i <= N; i++) {
    const kind = i === oi + eW ? 'primary' : (i + 40) % 4 === 0 ? 'secondary' : 'residential';
    // 빈 블록 묶음 안을 지나는 골목은 없다 (큰 필지)
    let run = [];
    for (let j = -N; j <= N; j++) {
      const inside = i > oi && i < oi + eW && j > oj && j < oj + eD;
      if (inside) { if (run.length > 1) way(run, { highway: kind }); run = []; continue; }
      run.push([ax(i), az(j)]);
    }
    if (run.length > 1) way(run, kind === 'primary' ? { highway: kind, name: '시험대로', lanes: '6' } : { highway: kind });
  }
  for (let j = -N; j <= N; j++) {
    const kind = (j + 40) % 5 === 0 ? 'tertiary' : 'residential';
    let run = [];
    for (let i = -N; i <= N; i++) {
      const inside = j > oj && j < oj + eD && i > oi && i < oi + eW;
      if (inside) { if (run.length > 1) way(run, { highway: kind }); run = []; continue; }
      run.push([ax(i), az(j)]);
    }
    if (run.length > 1) way(run, { highway: kind });
  }
  // 철도 (빈 터 반대쪽 3블록 밖)
  way([[ax(-N), az(oj - 3) + 20], [ax(N), az(oj - 3) + 20]], { railway: 'rail' });
  // 하천 + 공원
  const poly = (pts, tags) => el.push({ type: 'way', id: id++, nodes: [], geometry: pts.concat([pts[0]]).map(([a, b]) => ll(a, b)), tags });
  poly([[ax(-N), az(8)], [ax(N), az(8)], [ax(N), az(9)], [ax(-N), az(9)]], { natural: 'water', name: '시험천' });
  poly([[ax(-5) + 8, az(oj) + 8], [ax(-4) - 8, az(oj) + 8], [ax(-4) - 8, az(oj + 1) - 8], [ax(-5) + 8, az(oj + 1) - 8]], { leisure: 'park', name: '시험공원' });
  // 건물
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
    if (empty(i, j) || j === 8 || (i === -5 && j === oj)) continue;
    const a0 = ax(i) + 7, a1 = ax(i + 1) - 7, b0 = az(j) + 6, b1 = az(j + 1) - 6, t = R();
    if (t < 0.12) { // 아파트 두 동
      for (let k = 0; k < 2; k++) { const bb = b0 + 6 + k * 34; poly([[a0 + 4, bb], [a1 - 4, bb], [a1 - 4, bb + 13], [a0 + 4, bb + 13]], { building: 'apartments', 'building:levels': String(15 + Math.floor(R() * 12)) }); }
    } else if (t < 0.18) { poly([[a0 + 20, b0 + 16], [a1 - 20, b0 + 16], [a1 - 20, b1 - 16], [a0 + 20, b1 - 16]], { building: 'office', height: String(60 + Math.floor(R() * 70)), name: '시험타워' + id }); }
    else for (let a = a0; a < a1 - 12; a += 17) for (let b = b0; b < b1 - 10; b += 16) {
      if (R() < 0.12) continue; const w = 11 + R() * 4, d = 9 + R() * 5;
      poly([[a, b], [a + w, b], [a + w, b + d], [a, b + d]], { building: R() < 0.6 ? 'residential' : 'commercial', 'building:levels': String(2 + Math.floor(R() * 5)) });
    }
  }
  el.forEach(e => { if (e.tags) Object.keys(e.tags).forEach(k => e.tags[k] === undefined && delete e.tags[k]); });
  return { version: 0.6, elements: el };
}
