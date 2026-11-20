#!/usr/bin/env python3
# 후보지 주변 실제 지도 뽑기: OpenStreetMap 한국 전체 파일(.osm.pbf, Geofabrik)에서 후보지마다 주변 건물·도로·철도·물·녹지·산을 골라
# 지도 서버(Overpass) 답과 같은 모양의 JSON으로 쓴다. 그 뒤 scripts/fetch-ctx.mjs --from 으로 줄여 public/ctx 에 담는다.
# 고르는 조건과 반경은 src/sim/osm.js 의 queries()와 같다. 지도 데이터 © OpenStreetMap contributors (ODbL)
#   python3 scripts/ctx_from_pbf.py <south-korea.osm.pbf> <sites.json> <outdir>
import json, math, os, sys, time
import osmium

R = dict(bldg=1000, major=2300, minor=1200, area=2700, rail=2300, peak=8000, coast=5200)
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
MINOR = {'unclassified', 'residential', 'living_street', 'pedestrian', 'service'}
RAIL = {'rail', 'light_rail', 'subway'}
W_LEISURE = {'park', 'garden', 'golf_course', 'pitch', 'playground'}
W_LANDUSE = {'forest', 'grass', 'recreation_ground', 'meadow', 'cemetery', 'village_green'}
W_NATURAL = {'water', 'wood', 'scrub', 'grassland'}
W_WATERWAY = {'riverbank', 'stream', 'canal'}
R_LEISURE = {'park', 'golf_course'}
R_LANDUSE = {'forest', 'grass'}
R_NATURAL = {'water', 'wood'}
KEEP = ['building', 'building:levels', 'height', 'name', 'name:ko', 'highway', 'service', 'oneway', 'junction', 'lanes', 'width', 'bridge', 'tunnel',
        'covered', 'layer', 'area', 'railway', 'natural', 'waterway', 'leisure', 'landuse', 'ele', 'type']


def way_radius(t):
    """(넓은 주변 질의 반경, 건물 질의 반경). 해당 없으면 0"""
    rf = 0
    hw = t.get('highway')
    if hw in MAJOR: rf = R['major']
    elif hw in MINOR: rf = R['minor']
    if t.get('railway') in RAIL: rf = max(rf, R['rail'])
    nat = t.get('natural')
    if nat in W_NATURAL or t.get('waterway') in W_WATERWAY or t.get('leisure') in W_LEISURE or t.get('landuse') in W_LANDUSE: rf = max(rf, R['area'])
    if nat == 'coastline': rf = max(rf, R['coast'])
    return rf, (R['bldg'] if 'building' in t else 0)


def rel_radius(t):
    rf = R['area'] if (t.get('natural') in R_NATURAL or t.get('waterway') == 'riverbank' or t.get('leisure') in R_LEISURE or t.get('landuse') in R_LANDUSE) else 0
    return rf, (R['bldg'] if 'building' in t else 0)


def tags_of(t):
    return {k: t[k] for k in KEEP if k in t}


CELL = 0.05  # 도 (약 5.5km × 4.4km)
cell_of = lambda lon, lat: (int(math.floor(lon / CELL)), int(math.floor(lat / CELL)))


class Sites:
    def __init__(self, sites, reach):
        self.sites = sites
        for s in sites:
            s['kx'] = 111320.0 * math.cos(math.radians(s['lat'])); s['ky'] = 110540.0
        self.grid = {}
        for i, s in enumerate(sites):
            dlat = reach / 110540.0 + CELL; dlon = reach / s['kx'] + CELL
            x0, y0 = cell_of(s['lng'] - dlon, s['lat'] - dlat); x1, y1 = cell_of(s['lng'] + dlon, s['lat'] + dlat)
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    self.grid.setdefault((x, y), []).append(i)

    def near(self, pts):
        """꺾은선 pts[(lon,lat)] 가까이에 있을 수 있는 택지 번호들"""
        g = self.grid; out = None; n = len(pts)
        for k in range(0, n, 3):
            c = g.get(cell_of(pts[k][0], pts[k][1]))
            if c: out = set(c) if out is None else out.union(c)
        c = g.get(cell_of(pts[-1][0], pts[-1][1]))
        if c: out = set(c) if out is None else out.union(c)
        return out

    def dist(self, i, pts, stop=0.0):
        """택지 i 중심에서 꺾은선까지 가장 가까운 거리(m). stop 아래로 내려가면 바로 돌려준다"""
        s = self.sites[i]; kx, ky, lng, lat = s['kx'], s['ky'], s['lng'], s['lat']
        px, py = (pts[0][0] - lng) * kx, (pts[0][1] - lat) * ky
        best = px * px + py * py; stop2 = stop * stop
        for k in range(1, len(pts)):
            qx, qy = (pts[k][0] - lng) * kx, (pts[k][1] - lat) * ky
            dx, dy = qx - px, qy - py; L2 = dx * dx + dy * dy
            if L2 > 0:
                t = -(px * dx + py * dy) / L2
                t = 0.0 if t < 0 else 1.0 if t > 1 else t
                cx, cy = px + dx * t, py + dy * t; d2 = cx * cx + cy * cy
            else: d2 = px * px + py * py
            if d2 < best:
                best = d2
                if best <= stop2: break
            px, py = qx, qy
        return math.sqrt(best)


def main():
    pbf, sites_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
    sites = json.load(open(sites_path, encoding='utf-8'))
    S = Sites(sites, max(R['coast'], R['area'], R['major']) + 300)
    feat = [[] for _ in sites]; bldg = [[] for _ in sites]
    t0 = time.time()
    geom = lambda pts: [{'lat': round(p[1], 7), 'lon': round(p[0], 7)} for p in pts]

    # ① 관계(다각형 묶음): 조건에 맞는 것과 그 구성 길
    rels = {}; rel_ways = set()
    for o in osmium.FileProcessor(pbf, osmium.osm.RELATION).with_filter(osmium.filter.KeyFilter('building', 'natural', 'waterway', 'leisure', 'landuse')):
        t = o.tags; rf, rb = rel_radius(t)
        if not (rf or rb): continue
        mem = [(m.ref, m.role) for m in o.members if m.type == 'w']
        if not mem: continue
        rels[o.id] = (tags_of(t), mem, rf, rb)
        rel_ways.update(r for r, _ in mem)
    print(f'relations {len(rels)}, member ways {len(rel_ways)}, {time.time() - t0:.0f}s', flush=True)

    # ② 길(건물·도로·철도·물·녹지·해안선)과 산 정상
    way_d = {}  # 관계 구성 길 → {택지 번호: 거리}
    nw = 0; npk = 0
    fp = osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY).with_locations().with_filter(osmium.filter.TagFilter(('natural', 'peak')).enable_for(osmium.osm.NODE))
    for o in fp:
        if o.is_node():
            if o.tags.get('natural') != 'peak' or not o.location.valid(): continue
            lon, lat = o.location.lon, o.location.lat
            for i, s in enumerate(sites):
                dx, dy = (lon - s['lng']) * s['kx'], (lat - s['lat']) * s['ky']
                if dx * dx + dy * dy <= R['peak'] ** 2:
                    feat[i].append({'type': 'node', 'id': o.id, 'lat': round(lat, 7), 'lon': round(lon, 7), 'tags': tags_of(o.tags)}); npk += 1
            continue
        t = o.tags; rf, rb = way_radius(t); inrel = o.id in rel_ways
        if not (rf or rb or inrel): continue
        pts = [(n.location.lon, n.location.lat) for n in o.nodes if n.location.valid()]
        if len(pts) < 2: continue
        cand = S.near(pts)
        if not cand: continue
        el = None
        for i in cand:
            rmax = max(rf, rb, R['area'] if inrel else 0)
            d = S.dist(i, pts, 0.0 if inrel else rmax * 0.999)
            if d > rmax: continue
            if inrel: way_d.setdefault(o.id, {})[i] = d
            if (rf and d <= rf) or (rb and d <= rb):
                if el is None:
                    el = {'type': 'way', 'id': o.id, 'tags': tags_of(t), 'geometry': geom(pts)}
                    if 'highway' in t: el['nodes'] = [n.ref for n in o.nodes if n.location.valid()]
                if rf and d <= rf: feat[i].append(el)
                if rb and d <= rb: bldg[i].append(el)
                nw += 1
    print(f'ways matched {nw}, peaks {npk}, {time.time() - t0:.0f}s', flush=True)

    # ③ 택지 가까이에 구성 길이 하나라도 걸리는 관계를 고르고, 그 구성 길 전체의 좌표를 받는다
    hits = []; need = set()
    for rid, (tg, mem, rf, rb) in rels.items():
        best = {}
        for ref, _ in mem:
            for i, d in way_d.get(ref, {}).items():
                if d < best.get(i, 1e18): best[i] = d
        ok = [(i, d) for i, d in best.items() if (rf and d <= rf) or (rb and d <= rb)]
        if ok: hits.append((rid, ok)); need.update(r for r, _ in mem)
    wgeom = {}
    if need:
        fp = osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY).with_locations().with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)).with_filter(osmium.filter.IdFilter(need).enable_for(osmium.osm.WAY))
        for o in fp:
            if o.id in need: wgeom[o.id] = geom([(n.location.lon, n.location.lat) for n in o.nodes if n.location.valid()])
    nr = 0
    for rid, ok in hits:
        tg, mem, rf, rb = rels[rid]
        members = [{'type': 'way', 'ref': ref, 'role': role, 'geometry': wgeom[ref]} for ref, role in mem if len(wgeom.get(ref, ())) >= 2]
        if not members: continue
        el = {'type': 'relation', 'id': rid, 'tags': tg, 'members': members}
        for i, d in ok:
            if rf and d <= rf: feat[i].append(el)
            if rb and d <= rb: bldg[i].append(el)
            nr += 1
    print(f'relations matched {nr}, {time.time() - t0:.0f}s', flush=True)

    os.makedirs(out, exist_ok=True)
    for i, s in enumerate(sites):
        with open(os.path.join(out, s['id'] + '.json'), 'w', encoding='utf-8') as f:
            json.dump({'id': s['id'], 'lat': s['lat'], 'lng': s['lng'], 'feat': {'elements': feat[i]}, 'bldg': {'elements': bldg[i]}}, f, ensure_ascii=False, separators=(',', ':'))
        print(f"{s['id']}: feat {len(feat[i])}, bldg {len(bldg[i])}", flush=True)
    print(f'done {len(sites)} sites, {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
