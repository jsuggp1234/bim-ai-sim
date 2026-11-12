// 가벼운 지도: 웹 메르카토르 타일(CARTO 밝은·어두운 바탕) + 벡터 겹(자치구 경계·한강·택지 범위) + 핀.
// 타일을 못 받으면 벡터 겹만으로도 지도가 되도록 자치구 면과 강을 채워 그린다.
// 좌표: 0~256 '월드' 좌표(줌 0의 픽셀). 화면 = (월드 − 중심) × 2^줌 + 화면 중앙.

const TILE = 256;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lngLatToWorld = (lng, lat) => {
  const s = Math.sin(lat * Math.PI / 180);
  return [(lng + 180) / 360 * TILE, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE];
};
// 월드 단위 / m (그 위도에서)
export const worldPerMeter = (lat) => TILE / (40075016.686 * Math.cos(lat * Math.PI / 180));

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t !== 'light';
};

export function createAtlas(el, { minZoom = 9.6, maxZoom = 16.5, onSelect = null, onHover = null } = {}) {
  el.classList.add('atlas-root');
  el.innerHTML = `<div class="at-tiles" aria-hidden="true"></div>
    <svg class="at-vec" aria-hidden="true"><g class="at-w"></g></svg>
    <div class="at-labels" aria-hidden="true"></div>
    <div class="at-pins" role="list"></div>
    <div class="at-ctl"><button type="button" data-z="1" aria-label="확대">+</button><button type="button" data-z="-1" aria-label="축소">−</button><button type="button" data-fit aria-label="후보지 전체 보기">⤢</button></div>
    <div class="at-hint" aria-hidden="true">Ctrl(⌘) + 스크롤로 확대·축소</div>
    <a class="at-attrib" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap · © CARTO</a>`;
  el.tabIndex = 0;
  el.setAttribute('aria-label', '후보지 지도. 드래그로 이동, 더하기·빼기 버튼이나 Ctrl+스크롤로 확대');
  const tilesEl = el.querySelector('.at-tiles'), svg = el.querySelector('.at-vec'), wg = el.querySelector('.at-w');
  const labelsEl = el.querySelector('.at-labels'), pinsEl = el.querySelector('.at-pins'), hint = el.querySelector('.at-hint');

  let cx = 218.3, cy = 99.3, z = 11, W = 0, H = 0;
  let pins = [], labels = [], fitBox = null, raf = 0, alive = true;
  let tileOK = 0, tileBad = 0;

  // ---------- 타일 ----------
  const sub = 'abcd';
  const url = (zi, x, y) => {
    const st = isDark() ? 'dark_all' : 'light_all', r = (window.devicePixelRatio || 1) > 1.2 ? '@2x' : '';
    return `https://${sub[(x + y) % 4]}.basemaps.cartocdn.com/${st}/${zi}/${x}/${y}${r}.png`;
  };
  let cur = null, prev = null;
  const mkLayer = (zi) => { const d = document.createElement('div'); d.className = 'at-layer'; tilesEl.appendChild(d); return { zi, el: d, tiles: new Map(), theme: isDark() }; };
  function layerTiles(L) {
    const n = 2 ** L.zi, k = 2 ** (z - L.zi), size = TILE * k;
    const ox = W / 2 - cx * n * k, oy = H / 2 - cy * n * k; // 타일 (0,0)의 화면 좌표
    L.el.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px) scale(${k.toFixed(5)})`;
    if (L !== cur) return;
    const x0 = Math.floor(-ox / size), x1 = Math.floor((W - ox) / size), y0 = Math.max(0, Math.floor(-oy / size)), y1 = Math.min(n - 1, Math.floor((H - oy) / size));
    const need = new Set();
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const xx = ((tx % n) + n) % n, key = tx + '/' + ty; need.add(key);
      if (L.tiles.has(key)) continue;
      const img = new Image(); img.alt = ''; img.decoding = 'async'; img.draggable = false;
      img.style.left = tx * TILE + 'px'; img.style.top = ty * TILE + 'px';
      img.onload = () => { img.classList.add('on'); tileOK++; el.classList.remove('notiles'); if (prev && L === cur && [...L.tiles.values()].every(i => i.complete)) dropPrev(); };
      img.onerror = () => { tileBad++; if (!tileOK && tileBad >= 3) el.classList.add('notiles'); };
      img.src = url(L.zi, xx, ty);
      L.tiles.set(key, img); L.el.appendChild(img);
    }
    for (const [key, img] of L.tiles) if (!need.has(key)) { img.remove(); L.tiles.delete(key); }
  }
  function dropPrev() { if (prev) { prev.el.remove(); prev = null; } }
  function tiles() {
    const zi = clamp(Math.round(z), 0, 18);
    if (!cur || cur.zi !== zi || cur.theme !== isDark()) {
      if (prev) dropPrev();
      prev = cur; cur = mkLayer(zi);
      if (prev) { prev.el.classList.add('prev'); setTimeout(() => { if (prev && alive) dropPrev(); }, 1600); }
    }
    if (prev) layerTiles(prev);
    layerTiles(cur);
  }

  // ---------- 그리기 ----------
  const toScreen = (wx, wy) => { const k = 2 ** z; return [(wx - cx) * k + W / 2, (wy - cy) * k + H / 2]; };
  function render() {
    raf = 0; if (!alive) return;
    W = el.clientWidth; H = el.clientHeight; if (!W || !H) return;
    tiles();
    const k = 2 ** z;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    wg.setAttribute('transform', `translate(${(W / 2 - cx * k).toFixed(2)} ${(H / 2 - cy * k).toFixed(2)}) scale(${k.toFixed(4)})`);
    el.style.setProperty('--zk', k.toFixed(3));
    labels.forEach(l => { const [x, y] = toScreen(l.wx, l.wy); l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; l.el.hidden = z < (l.minZ || 0); });
    pins.forEach(p => { const [x, y] = toScreen(p.wx, p.wy); p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; });
    el.classList.toggle('zin', z >= 12.6);
  }
  const ask = () => { if (!raf) raf = requestAnimationFrame(render); };

  // ---------- 벡터 겹 ----------
  function setVector(html) { wg.innerHTML = html; ask(); }
  function setLabels(list) {
    labelsEl.innerHTML = ''; labels = list.map(l => {
      const d = document.createElement('span'); d.className = 'at-lab ' + (l.cls || ''); d.textContent = l.text; labelsEl.appendChild(d);
      const [wx, wy] = lngLatToWorld(l.lng, l.lat); return { ...l, wx, wy, el: d };
    });
    ask();
  }

  // ---------- 핀 ----------
  function setPins(list) {
    pinsEl.innerHTML = '';
    pins = list.map(p => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'at-pin' + (p.on ? ' on' : ''); b.dataset.id = p.id; b.setAttribute('role', 'listitem');
      b.style.setProperty('--r', p.r + 'px');
      b.innerHTML = p.html; b.setAttribute('aria-label', p.label); b.setAttribute('aria-pressed', String(!!p.on));
      pinsEl.appendChild(b);
      const [wx, wy] = lngLatToWorld(p.lng, p.lat); return { ...p, wx, wy, el: b };
    });
    // 선택한 핀을 맨 위로
    pins.filter(p => p.on).forEach(p => pinsEl.appendChild(p.el));
    ask();
  }
  pinsEl.addEventListener('click', (e) => { const b = e.target.closest('.at-pin'); if (b && onSelect) onSelect(b.dataset.id); });
  pinsEl.addEventListener('pointerover', (e) => { const b = e.target.closest('.at-pin'); if (onHover) onHover(b ? b.dataset.id : null); });
  pinsEl.addEventListener('pointerout', (e) => { if (onHover && !e.relatedTarget?.closest?.('.at-pin')) onHover(null); });

  // ---------- 이동·확대 ----------
  let anim = 0;
  function stop() { if (anim) cancelAnimationFrame(anim); anim = 0; }
  function zoomAt(nz, sx, sy) {
    nz = clamp(nz, minZoom, maxZoom);
    const k0 = 2 ** z, k1 = 2 ** nz;
    const wx = cx + (sx - W / 2) / k0, wy = cy + (sy - H / 2) / k0;
    cx = wx - (sx - W / 2) / k1; cy = wy - (sy - H / 2) / k1; z = nz; ask();
  }
  function flyTo(tx, ty, tz, ms = 750) {
    stop();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    tz = clamp(tz, minZoom, maxZoom);
    if (reduce || ms <= 0 || !W) { cx = tx; cy = ty; z = tz; ask(); return; }
    const a = { cx, cy, z }, t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      z = a.z + (tz - a.z) * e;
      cx = a.cx + (tx - a.cx) * e; cy = a.cy + (ty - a.cy) * e;
      render();
      anim = u < 1 ? requestAnimationFrame(step) : 0;
    };
    anim = requestAnimationFrame(step);
  }
  // 지도 위에 떠 있는 패널 폭 (CSS 변수 --padl/--padr, 좁은 화면에서는 0)
  const sidePad = (n) => parseFloat(getComputedStyle(el).getPropertyValue(n)) || 0;
  function fit(box = fitBox, pad = 60, ms = 750) {
    if (!box) return;
    fitBox = box;
    W = el.clientWidth || W; H = el.clientHeight || H; if (!W || !H) return;
    const [x0, y0, x1, y1] = box;
    const padL = pad + sidePad('--padl'), padR = pad + sidePad('--padr');
    const kx = (W - padL - padR) / Math.max(1e-6, x1 - x0), ky = (H - pad * 2) / Math.max(1e-6, y1 - y0);
    const tz = clamp(Math.log2(Math.min(kx, ky)), minZoom, maxZoom), k = 2 ** tz;
    // 왼쪽·오른쪽 여백이 다르면 중심을 비켜 놓는다
    const shift = (padL - padR) / 2 / k;
    flyTo((x0 + x1) / 2 - shift, (y0 + y1) / 2, tz, ms);
  }
  function lookAt(lng, lat, tz, ms) {
    const [wx, wy] = lngLatToWorld(lng, lat);
    const padL = sidePad('--padl'), padR = sidePad('--padr');
    const k = 2 ** clamp(tz, minZoom, maxZoom);
    flyTo(wx - (padL - padR) / 2 / k, wy, tz, ms);
  }

  // 끌기 · 두 손가락 확대
  const ptrs = new Map(); let pinch = null, moved = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.at-ctl, .at-attrib, .at-pin')) return;
    stop(); el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; }
    el.classList.add('drag');
  });
  el.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = el.getBoundingClientRect();
      zoomAt(pinch.z + Math.log2(d / pinch.d), (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    const k = 2 ** z; cx -= dx / k; cy -= dy / k; ask();
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) el.classList.remove('drag'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  let hintT = 0;
  el.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey) && document.activeElement !== el) {
      hint.classList.add('on'); clearTimeout(hintT); hintT = setTimeout(() => hint.classList.remove('on'), 1200); return;
    }
    e.preventDefault(); stop();
    const r = el.getBoundingClientRect();
    zoomAt(z - e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  el.addEventListener('dblclick', (e) => {
    if (e.target.closest('.at-ctl, .at-pin')) return;
    const r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, k = 2 ** z;
    const wx = cx + (sx - W / 2) / k, wy = cy + (sy - H / 2) / k, nz = clamp(z + 1, minZoom, maxZoom), k1 = 2 ** nz;
    flyTo(wx - (sx - W / 2) / k1, wy - (sy - H / 2) / k1, nz, 350);
  });
  el.addEventListener('keydown', (e) => {
    const k = 2 ** z, d = 80 / k;
    if (e.key === 'ArrowLeft') cx -= d; else if (e.key === 'ArrowRight') cx += d; else if (e.key === 'ArrowUp') cy -= d; else if (e.key === 'ArrowDown') cy += d;
    else if (e.key === '+' || e.key === '=') { flyTo(cx, cy, z + 1, 250); return; } else if (e.key === '-') { flyTo(cx, cy, z - 1, 250); return; } else return;
    e.preventDefault(); ask();
  });
  el.querySelector('.at-ctl').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-fit')) fit(fitBox, 60); else flyTo(cx, cy, z + +b.dataset.z, 300);
  });
  const ro = new ResizeObserver(() => ask()); ro.observe(el);

  return {
    setVector, setLabels, setPins, fit, flyTo, lookAt, render: ask,
    toWorld: lngLatToWorld,
    get zoom() { return z; },
    theme() { ask(); },
    dispose() { alive = false; stop(); ro.disconnect(); if (raf) cancelAnimationFrame(raf); el.innerHTML = ''; },
    get tilesLoaded() { return tileOK; },
  };
}
