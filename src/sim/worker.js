// 일조·조망 분석을 화면 스레드 밖에서 계산한다. 같은 변수로 매스를 다시 만들어 결과 순서를 맞춘다
import { generate } from './massing.js';
import { analyze, unitSamples, contextSamples, projectBoxes } from './analysis.js';
// context: 지도에서 받은 주변 건물(대지 좌표 상자). 없으면 대지 계획의 근사 맥락

self.onmessage = (e) => {
  const { id, params, context } = e.data;
  try {
    const t0 = performance.now();
    const g = generate(params);
    const units = unitSamples(g.bldgs);
    const ctx = context && context.length ? context : g.plan.CONTEXT;
    const r = analyze({ projectBoxes: projectBoxes(g), units, ctxSamples: contextSamples(ctx), context: ctx, plan: g.plan });
    const ub = new Int32Array(units.length * 3);
    units.forEach((u, i) => { ub[i * 3] = u.b; ub[i * 3 + 1] = u.f; ub[i * 3 + 2] = u.k; });
    const msg = { id, ok: true, ms: performance.now() - t0, ub, total: r.total, cont: r.cont, river: r.river, riverCand: r.riverCand, namsan: r.namsan, ctx: r.ctx };
    self.postMessage(msg, [ub.buffer, r.total.buffer, r.cont.buffer, r.river.buffer, r.riverCand.buffer, r.namsan.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
