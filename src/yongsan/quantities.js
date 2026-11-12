// 예산 산정용 기초 물량: 외벽·지붕·굴토·용도별 면적
const FOOTING = 1.5; // 기초·버림 두께(m)

export function quantities(gen) {
  const perim = (b, f) => {
    const r = b.rect; let w = r.u1 - r.u0, d = r.v1 - r.v0;
    if (f.roof) { const s = Math.min(1, Math.max(0.35, Math.sqrt(f.area / (w * d)))); w *= s; d *= s; }
    return 2 * (w + d);
  };
  const facadeOf = (b, f) => (b.kind === 'basement' ? 0 : perim(b, f) * f.h);
  const facadeOfBldg = (b) => b.floors.reduce((s, f) => s + facadeOf(b, f), 0);
  const byUseMap = new Map();
  let facade = 0, roof = 0, floorCount = 0, floorCountAbove = 0;
  gen.bldgs.forEach(b => {
    b.floors.forEach(f => {
      const u = byUseMap.get(f.use) || { use: f.use, floors: 0, area: 0, hSum: 0, units: 0 };
      u.floors++; u.area += f.area; u.hSum += f.h; u.units += f.units; byUseMap.set(f.use, u);
      floorCount++; if (f.lv > 0) floorCountAbove++;
      facade += facadeOf(b, f);
    });
    if (b.kind !== 'basement') roof += (b.rect.u1 - b.rect.u0) * (b.rect.v1 - b.rect.v0);
  });
  const order = ['res', 'officetel', 'office', 'retail', 'lobby', 'refuge', 'mech', 'b1', 'parking'];
  const byUse = [...byUseMap.values()].map(u => ({ ...u, avgH: u.hSum / u.floors })).sort((a, b) => order.indexOf(a.use) - order.indexOf(b.use));
  const basements = gen.bldgs.filter(b => b.kind === 'basement').map(b => {
    const depth = b.floors.reduce((s, f) => s + f.h, 0) + FOOTING;
    const foot = b.floors[0].area;
    return { block: b.block, levels: b.basementLv, hB1: b.floors[0].h, hPark: b.floors[1] ? b.floors[1].h : 0, area: b.gfa, depth, volume: foot * depth, spaces: b.spaces };
  });
  const area = (use) => (byUseMap.get(use) || { area: 0 }).area;
  return {
    byUse, basements, facade, roof, floorCount, floorCountAbove, facadeOf, facadeOfBldg,
    excavation: basements.reduce((s, x) => s + x.volume, 0), maxDepth: Math.max(0, ...basements.map(x => x.depth)),
    resArea: area('res') + area('officetel'), officeArea: area('office'), retailArea: area('retail') + area('lobby'), refugeArea: area('refuge'),
    refugeCount: (byUseMap.get('refuge') || { floors: 0 }).floors,
  };
}
