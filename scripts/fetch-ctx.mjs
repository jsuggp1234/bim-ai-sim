// 후보지 주변 실제 지도(OpenStreetMap)를 public/ctx/<id>.json 으로 담는다.
// 사이트를 여는 사람의 브라우저가 지도 서버(Overpass)에 못 붙어도 후보지 주변은 실제 지도로 보이게 하려는 것.
// 지도는 한국 전체 파일에서 뽑는다(scripts/ctx_from_pbf.py). 공개 지도 서버는 느리고 자주 끊겨 145곳을 받기 어렵다.
//   node scripts/fetch-ctx.mjs --list                     후보지 좌표 목록(JSON)을 출력 → ctx_from_pbf.py 의 입력
//   node scripts/fetch-ctx.mjs --from <dir> [--out dir]   ctx_from_pbf.py 가 쓴 <dir>/<id>.json 을 줄여서 담는다 (기본 public/ctx)
// GitHub Actions(fetch-ctx.yml)에서 돌린다. 지도 데이터 © OpenStreetMap contributors (ODbL)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { ALL_SITE_IDS, SITE_IDS, siteFrom } from '../src/sim/sites.js';
import { packElements, PACK_VER } from '../src/sim/ctxpack.js';

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const OUT = arg('out', 'public/ctx'), FROM = arg('from'), AT = arg('at') || new Date().toISOString().slice(0, 10);
const sites = [...new Set([...SITE_IDS, ...ALL_SITE_IDS])].map(id => siteFrom(id, {}, 'housing')).filter(s => s && isFinite(s.lat) && isFinite(s.lng)).map(s => ({ id: s.id, lat: s.lat, lng: s.lng }));

if (arg('list')) { process.stdout.write(JSON.stringify(sites)); process.exit(0); }
if (!FROM || FROM === true) { console.error('usage: node scripts/fetch-ctx.mjs --list | --from <dir> [--out dir]'); process.exit(2); }

mkdirSync(OUT, { recursive: true });
const rows = [], ids = [];
let total = 0;
for (const s of sites) {
  const f = `${FROM}/${s.id}.json`;
  if (!existsSync(f)) { console.log(`- ${s.id}: 뽑은 지도 없음`); continue; }
  const raw = JSON.parse(readFileSync(f, 'utf8'));
  const fe = (raw.feat && raw.feat.elements) || [], be = (raw.bldg && raw.bldg.elements) || [];
  // 건물도 길도 하나 없으면 담지 않는다 (좌표가 바다 한가운데이거나 지도가 빈 곳: 사이트는 그때 지도 서버에 묻는다)
  if (!fe.length && !be.length) { console.log(`- ${s.id}: 빈 지도`); continue; }
  const body = JSON.stringify({ v: PACK_VER, id: s.id, lat: s.lat, lng: s.lng, at: AT, src: 'OpenStreetMap contributors (ODbL)', feat: packElements(fe, s.lat, s.lng), bldg: packElements(be, s.lat, s.lng) });
  writeFileSync(`${OUT}/${s.id}.json`, body);
  ids.push(s.id); total += body.length;
  rows.push({ id: s.id, kb: Math.round(body.length / 1024), feat: fe.length, bldg: be.length });
}
writeFileSync(`${OUT}/index.json`, JSON.stringify({ v: PACK_VER, at: AT, ids }));
rows.forEach(r => console.log(`+ ${r.id}: feat ${r.feat}, bldg ${r.bldg}, ${r.kb}KB`));
console.log(`done: ${ids.length}/${sites.length} sites, ${(total / 1048576).toFixed(1)}MB`);
[...rows].sort((a, b) => b.kb - a.kb).slice(0, 12).forEach(r => console.log(`  big: ${r.id} ${r.kb}KB (feat ${r.feat}, bldg ${r.bldg})`));
if (!ids.length) process.exit(1);
