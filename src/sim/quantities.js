// 예산 산정용 기초 물량: 외벽·지붕·굴토·흙막이·용도별 면적
import { perimK } from './gesture.js';
const FOOTING = 1.5; // 기초·버림 두께(m)

export function quantities(gen) {
  // 층 외벽 둘레: 형식별 외곽 둘레 × 층 축소율. 옥탑은 코어 위 정사각형
  const perimOf = (b, f) => (f.roof ? 4 * Math.sqrt(Math.max(0, f.area)) : (b.perim || 0) * perimK(f));
  const facadeOf = (b, f) => (b.kind === 'basement' ? 0 : perimOf(b, f) * f.h);
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
    if (b.kind !== 'basement') {
      const top = b.floors.filter(f => !f.roof).slice(-1)[0];
      roof += top ? top.area : 0;
    }
  });
  const order = ['res', 'officetel', 'office', 'retail', 'lobby', 'refuge', 'mech', 'b1', 'parking'];
  const byUse = [...byUseMap.values()].map(u => ({ ...u, avgH: u.hSum / u.floors })).sort((a, b) => order.indexOf(a.use) - order.indexOf(b.use));
  const basements = gen.bldgs.filter(b => b.kind === 'basement').map(b => {
    const depth = b.floors.reduce((s, f) => s + f.h, 0) + FOOTING;
    const foot = b.floors[0].area;
    const r = b.rect, wallLen = 2 * ((r.u1 - r.u0) + (r.v1 - r.v0));
    return { block: b.block, levels: b.basementLv, hB1: b.floors[0].h, hPark: b.floors[1] ? b.floors[1].h : 0, area: b.gfa, foot, depth,
      volume: foot / 0.9 * depth, retainWall: wallLen * (depth + 3), spaces: b.spaces };
  });
  const area = (use) => (byUseMap.get(use) || { area: 0 }).area;
  return {
    byUse, basements, facade, roof, floorCount, floorCountAbove, facadeOf, facadeOfBldg,
    excavation: basements.reduce((s, x) => s + x.volume, 0), retainWall: basements.reduce((s, x) => s + x.retainWall, 0),
    maxDepth: Math.max(0, ...basements.map(x => x.depth)),
    resArea: area('res') + area('officetel'), officeArea: area('office'), retailArea: area('retail') + area('lobby'), refugeArea: area('refuge'),
    refugeCount: (byUseMap.get('refuge') || { floors: 0 }).floors,
  };
}
