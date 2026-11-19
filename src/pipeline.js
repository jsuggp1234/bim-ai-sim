// 단계 사이 계산을 한곳에서: 용도·입지 → 매스 → 물량 → 공법(현장 조건·추천) → 4D 공정 → 간섭 → 5D 예산 → 위험
import { DEFAULTS as MASS_D, generate } from './sim/massing.js';
import { generateX, XDEF } from './sim/massx.js';
import { isHousingGen, useOf } from './sim/uses.js';
import { quantities } from './sim/quantities.js';
import { schedule, P4_DEFAULTS } from './sim/process.js';
import { estimate, P5_DEFAULTS } from './sim/cost.js';
import { siteConditions, derive, resolveMethods, PRIO_DEFAULT, BASELINE } from './sim/methods.js';
import { detect } from './sim/clash.js';
import { register, monteCarlo, exposure, exposureTimeline } from './sim/risk.js';
import { store, currentSite, factsFor, paramsForSite } from './store.js';
import { condFromFacts } from './sim/sitefit.js';

// 용도·택지마다 따로 저장하는 설정의 열쇠
export const projKey = (s = store.get()) => `${s.use || 'housing'}@${currentSite(s).id}`;
export const methodState = (s = store.get()) => ((s.methods || {})[projKey(s)]) || {};
export const optState = (s = store.get()) => ((s.opt || {})[projKey(s)]) || null;
export function setMethodState(patch) {
  const s = store.get(), k = projKey(s);
  store.set({ methods: { ...(s.methods || {}), [k]: { ...methodState(s), ...patch } } });
}
export function setOptState(v) {
  const s = store.get(), k = projKey(s);
  const o = { ...(s.opt || {}) }; if (v) o[k] = v; else delete o[k];
  store.set({ opt: o });
}
// 최적화 결과(착공 시차·동 간격·후속 공종 간격·타설 분할) → 공정 변수
export const POUR_CAPS = [2500, 1800, 1200];
export function optProc(x, pp) {
  if (!x) return {};
  return { offsets: x.offsets, towerGap: x.towerGap ?? undefined, pourCap: POUR_CAPS[x.pour || 0],
    mepLagFl: (pp.mepLagFl ?? 4) + (x.lagAdd || 0), facadeLagFl: (pp.facadeLagFl ?? 8) + (x.lagAdd || 0) };
}

let memo = {};
export function pipeline(over = {}) {
  const s = store.get();
  const use = s.use || 'housing';
  const housing = isHousingGen(use);
  const site = currentSite(s);
  // 매스 단계를 거치지 않고 온 경우에도 그 택지의 물량·층수 기본값으로 계산한다 (예전에는 용산 기본값 6,000호·55층이 들어갔다)
  const mp = housing ? { ...MASS_D, ...(s.mass || paramsForSite(site, MASS_D)), ...(over.mass || {}), site, use }
    : { ...(XDEF[use] || {}), ...((s.massx || {})[use] || {}), ...(over.mass || {}), site, use };
  const ms = { ...methodState(s), ...(over.methods || {}) };
  const opt = over.noOpt ? null : optState(s);
  const cp = { ...P5_DEFAULTS, ...(s.cost || {}), ...(over.cost || {}) };
  const facts = s.useMap === false ? null : factsFor(site, s);
  const km = JSON.stringify(mp), kmeth = JSON.stringify(ms) + (facts ? JSON.stringify([facts.adj, facts.adjH, facts.nB, facts.rail, facts.road]) : ''), kc = JSON.stringify(cp);
  if (memo.km !== km) { memo = { km }; memo.gen = housing ? generate(mp) : generateX(mp); memo.Q = quantities(memo.gen); }
  if (memo.kmeth !== kmeth) {
    memo.kmeth = kmeth; memo.kp = null; memo.base = null;
    const cond0 = condFromFacts(siteConditions(site, memo.gen, memo.Q), facts);
    memo.cond0 = cond0;
    memo.cond = { ...cond0, ...(ms.cond || {}) };
    memo.d = derive(memo.cond, memo.gen, memo.Q, site);
    memo.prio = { ...PRIO_DEFAULT, ...(ms.prio || {}) };
    memo.M = resolveMethods(memo.cond, memo.d, ms.picks || {}, memo.prio);
  }
  const pp0 = { ...P4_DEFAULTS, ...(s.proc || {}), ...(over.proc || {}), fx: memo.M.fx };
  const pp = { ...pp0, ...optProc(opt && opt.x, pp0) };
  const kp = JSON.stringify(pp) + '|' + (opt ? opt.x.stagger : '');
  if (memo.kp !== kp) {
    memo.kp = kp; memo.kc = null; memo.risk = null; memo.base = null;
    memo.S = schedule(memo.gen, memo.Q, pp);
    memo.C = detect(memo.gen, memo.S, { stagger: !!(opt && opt.x.stagger), noise: memo.cond.noise });
  }
  if (memo.kc !== kc) { memo.kc = kc; memo.risk = null; memo.base = null; memo.E = estimate(memo.gen, memo.Q, memo.S, cp); }
  const m = memo;
  return {
    mp, pp, pp0, cp, use, u: useOf(use), site, gen: m.gen, Q: m.Q, S: m.S, E: m.E, C: m.C, opt,
    cond: m.cond, cond0: m.cond0, facts, d: m.d, M: m.M, fx: m.M.fx, prio: m.prio, ms,
    // 기준선(전통 공법) 공정·예산: 비교용, 필요할 때만 계산
    base() {
      if (!m.base) {
        const B = resolveMethods(m.cond, m.d, BASELINE, m.prio);
        const S0 = schedule(m.gen, m.Q, { ...pp0, fx: B.fx });
        m.base = { M: B, S: S0, E: estimate(m.gen, m.Q, S0, cp), C: detect(m.gen, S0, { noise: m.cond.noise }) };
      }
      return m.base;
    },
    // 위험 등록부 + 몬테카를로 (잔여·고유)
    risk() {
      if (!m.risk) {
        const ctx = { site, u: useOf(use), cond: m.cond, d: m.d, S: m.S, C: m.C, E: m.E, ex: exposure(m.S, m.Q), fx: m.M.fx };
        const reg = register(ctx);
        m.risk = { ctx, reg, mc: monteCarlo(reg, m.S, m.E, m.M.fx), mc0: monteCarlo(reg, m.S, m.E, m.M.fx, { mode: 'raw' }), tl: exposureTimeline(reg, m.S) };
      }
      return m.risk;
    },
  };
}

// 공통 서식
export const fmt = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
// 만원 → 조·억
export const won = (manwon, d) => {
  const eok = manwon / 1e4;
  if (Math.abs(eok) >= 1e4) return fmt(eok / 1e4, d == null ? 2 : d) + '조';
  return fmt(eok, d == null ? 0 : d) + '억';
};
export const download = (name, text, type) => {
  const blob = new Blob([text], { type }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const esc = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const csv = (rows) => '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');

// 떠 있는 툴팁 (차트 공통)
let tipEl = null;
export function tip(html, x, y) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl); }
  if (html == null) { tipEl.hidden = true; return; }
  tipEl.innerHTML = html; tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, x + 14), top = y + 16 + r.height > window.innerHeight ? y - r.height - 12 : y + 16;
  tipEl.style.left = Math.max(8, left) + 'px'; tipEl.style.top = Math.max(8, top) + 'px';
}

// 테마 바뀜 감지
export function onThemeChange(fn) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', fn);
  const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => { mq.removeEventListener('change', fn); mo.disconnect(); };
}
