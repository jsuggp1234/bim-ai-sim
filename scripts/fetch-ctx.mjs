// 후보지 주변 실제 지도(OpenStreetMap)를 미리 받아 public/ctx/<id>.json 으로 담는다.
// 사이트를 여는 사람의 브라우저가 지도 서버(Overpass)에 못 붙어도 후보지 주변은 실제 지도로 보이게 하려는 것.
// 실행: node scripts/fetch-ctx.mjs [--only id,id] [--limit N] [--force] [--out dir]
//   기본은 아직 파일이 없는 택지만 받는다(--force면 다시). GitHub Actions(fetch-ctx.yml)에서 돌린다.
// 지도 데이터 © OpenStreetMap contributors (ODbL)
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { queries } from '../src/sim/osm.js';
import { ALL_SITE_IDS, SITE_IDS, siteFrom } from '../src/sim/sites.js';
import { packElements, PACK_VER } from '../src/sim/ctxpack.js';

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const OUT = arg('out', 'public/ctx'), ONLY = arg('only'), LIMIT = +arg('limit', 0) || 0, FORCE = !!arg('force');
const ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stat = { ok: 0, fail: 0, bytes: 0, byHost: {} };

async function ask(url, q, ms = 150000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'site-context-fetch/1.0', Accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    const j = JSON.parse(text);
    if (!j || !Array.isArray(j.elements)) throw new Error('bad shape');
    if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) throw new Error('remark: ' + j.remark.slice(0, 80));
    return { j, bytes: text.length };
  } finally { clearTimeout(timer); }
}
// 서버를 돌아가며 묻는다. 실패하면 다음 서버로, 한 바퀴 다 실패하면 쉬었다가 다시
async function overpass(q, start) {
  let last = null;
  for (let round = 0; round < 4; round++) {
    for (let k = 0; k < ENDPOINTS.length; k++) {
      const url = ENDPOINTS[(start + k) % ENDPOINTS.length], host = new URL(url).host;
      try { const r = await ask(url, q); stat.byHost[host] = (stat.byHost[host] || 0) + 1; stat.bytes += r.bytes; return r.j; }
      catch (e) { last = e; console.log(`    ! ${host}: ${String(e.message || e).slice(0, 90)}`); await sleep(1500); }
    }
    await sleep(8000 * (round + 1));
  }
  throw last || new Error('all endpoints failed');
}

const ids = [...new Set([...SITE_IDS, ...ALL_SITE_IDS])].filter(id => !ONLY || String(ONLY).split(',').includes(id));
mkdirSync(OUT, { recursive: true });
const todo = ids.filter(id => FORCE || !existsSync(`${OUT}/${id}.json`)).slice(0, LIMIT || undefined);
console.log(`sites ${ids.length}, to fetch ${todo.length}`);
const today = new Date().toISOString().slice(0, 10);
const rows = [];
let cursor = 0;
async function worker(w) {
  while (cursor < todo.length) {
    const id = todo[cursor++], site = siteFrom(id, {}, 'housing');
    if (!site || !isFinite(site.lat) || !isFinite(site.lng)) { console.log(`- ${id}: no coordinates`); continue; }
    const t0 = Date.now();
    try {
      const { feat, bldg } = queries(site.lat, site.lng);
      const jf = await overpass(feat, w); await sleep(1200);
      const jb = await overpass(bldg, w + 1);
      const pf = packElements(jf.elements, site.lat, site.lng), pb = packElements(jb.elements, site.lat, site.lng);
      const body = JSON.stringify({ v: PACK_VER, id, lat: site.lat, lng: site.lng, at: today, src: 'OpenStreetMap contributors (ODbL)', feat: pf, bldg: pb });
      writeFileSync(`${OUT}/${id}.json`, body);
      stat.ok++;
      rows.push({ id, kb: Math.round(body.length / 1024), feat: jf.elements.length, bldg: jb.elements.length });
      console.log(`+ ${id}: feat ${jf.elements.length}, bldg ${jb.elements.length}, ${Math.round(body.length / 1024)}KB, ${((Date.now() - t0) / 1000).toFixed(0)}s  [${stat.ok + stat.fail}/${todo.length}]`);
    } catch (e) { stat.fail++; console.log(`x ${id}: ${String(e.message || e).slice(0, 120)}`); }
    await sleep(1500);
  }
}
await Promise.all([0, 1, 2].map(w => worker(w)));
const total = ids.filter(id => existsSync(`${OUT}/${id}.json`));
const kb = total.reduce((s, id) => s + statSync(`${OUT}/${id}.json`).size, 0) / 1024;
writeFileSync(`${OUT}/index.json`, JSON.stringify({ v: PACK_VER, at: today, ids: total }));
console.log(`done: ok ${stat.ok}, fail ${stat.fail}, files ${total.length}/${ids.length}, ${(kb / 1024).toFixed(1)}MB on disk, downloaded ${(stat.bytes / 1e6).toFixed(0)}MB`, JSON.stringify(stat.byHost));
rows.sort((a, b) => b.kb - a.kb).slice(0, 12).forEach(r => console.log(`  big: ${r.id} ${r.kb}KB (feat ${r.feat}, bldg ${r.bldg})`));
if (todo.length && !stat.ok) process.exit(1);
