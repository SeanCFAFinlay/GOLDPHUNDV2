// ============================================================
// PHUND.CA Signal Engine — 8-Factor Weighted Scoring Model
// Every function computes real values. No mock outputs.
// ============================================================

import type { Bar, FactorResult, SignalOutput, SignalState, RiskLevel, StructureLevels, MacroData, ActiveRegime } from "./types";
import {
  clamp, tanhN, sigmoid,
  ema, rsi, macd, atr, bollingerBands, adx, vwap, roc, range
} from "./math/indicators";
import { SIGNAL_ENGINE_WEIGHTS as W_CFG } from "./config/weights";
import { getMinutesToNextEventSync } from "./calendar";

// --- Local aliases for compatibility ---
const sigm = sigmoid;
const rsiC = rsi;
const atrC = atr;
const rocC = roc;
const vwapC = vwap;

function macdC(c: number[]) {
  const result = macd(c);
  const e12 = ema(c, 12), e26 = ema(c, 26);
  const line = e12.map((v, i) => v - e26[i]);
  const sig = ema(line, 9);
  return { line, signal: sig, hist: line.map((v, i) => v - sig[i]) };
}

function bbC(c: number[], p = 20, m = 2) {
  const bb = bollingerBands(c, p, m);
  return { u: bb.upper, l: bb.lower, mid: bb.middle, w: bb.width };
}

function adxC(h: number[], l: number[], c: number[], p = 14) {
  const result = adx(h, l, c, p);
  return { adx: result.adx, pdi: result.plusDI, mdi: result.minusDI };
}

// --- Weights ---
const MW = { trend: 0.26, momentum: 0.20, volatility: 0.10, structure: 0.18, macro: 0.14, session: 0.04, exhaustion: 0.04, event_risk: 0.04 };
const TW = { p20: 0.10, e2050: 0.15, e50200: 0.20, sl: 0.15, h1: 0.20, h4: 0.20 };

// --- REGIME-ADAPTIVE WEIGHT STACKS ---
const REGIME_MW: Record<ActiveRegime, typeof MW> = {
  TREND: { trend: 0.30, momentum: 0.22, volatility: 0.08, structure: 0.16, macro: 0.12, session: 0.04, exhaustion: 0.04, event_risk: 0.04 },
  RANGE: { trend: 0.18, momentum: 0.18, volatility: 0.12, structure: 0.26, macro: 0.14, session: 0.04, exhaustion: 0.04, event_risk: 0.04 },
  BREAKOUT: { trend: 0.24, momentum: 0.26, volatility: 0.14, structure: 0.14, macro: 0.10, session: 0.04, exhaustion: 0.04, event_risk: 0.04 },
  COMPRESSION: { trend: 0.20, momentum: 0.16, volatility: 0.20, structure: 0.20, macro: 0.12, session: 0.04, exhaustion: 0.04, event_risk: 0.04 },
};
const MoW = { rsi: 0.25, macd: 0.30, roc: 0.15, body: 0.15, per: 0.15 };
const VoW = { atr: 0.30, bbw: 0.25, rng: 0.25, brk: 0.20 };
const StW = { vw: 0.25, pd: 0.25, sw: 0.20, br: 0.20, rj: 0.10 };
const MaW = { d10: 0.35, d30: 0.25, y10: 0.25, y30: 0.15 };
const ExW = { rsi: 0.25, div: 0.25, vw: 0.20, em: 0.15, at: 0.15 };

// ============================================================
// FACTOR 1: TREND
// ============================================================
function scoreTrend(bars: Bar[], h1b = 0, h4b = 0): FactorResult {
  const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low);
  if (c.length < 20) return { score: 0, components: {}, metadata: { reason: "insufficient_data" } };
  const e20 = ema(c, 20), e50 = ema(c, Math.min(50, c.length)), e200 = ema(c, Math.min(200, c.length));
  const atr = atrC(h, l, c), L = c.length - 1, p = c[L];
  const sp = tanhN((p - e20[L]) / atr, 1.5);
  const s25 = tanhN((e20[L] - e50[L]) / atr, 2);
  const s52 = tanhN((e50[L] - e200[L]) / atr, 3);
  const ss = tanhN((e20[L] - (e20[Math.max(0, L - 3)] || e20[L])) / atr, 0.5);
  const s1 = clamp(h1b * 100, -100, 100), s4 = clamp(h4b * 100, -100, 100);
  const raw = TW.p20 * sp + TW.e2050 * s25 + TW.e50200 * s52 + TW.sl * ss + TW.h1 * s1 + TW.h4 * s4;
  const al = p > e20[L] && e20[L] > e50[L] && e50[L] > e200[L] ? "full_bull" : p < e20[L] && e20[L] < e50[L] && e50[L] < e200[L] ? "full_bear" : "mixed";
  return { score: clamp(raw, -100, 100), components: { sp, s25, s52, ss, s1, s4 }, metadata: { alignment: al, ema20: +e20[L].toFixed(2), ema50: +e50[L].toFixed(2), ema200: +e200[L].toFixed(2) } };
}

// ============================================================
// FACTOR 2: MOMENTUM (with velocity/slope dimension)
// ============================================================
function momentumSlope(closes: number[], period = 5): { slope: number; velocity: "accelerating" | "decelerating" | "steady" } {
  if (closes.length < period + 2) return { slope: 0, velocity: "steady" };

  // Calculate momentum values for the last few bars
  const momValues: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    const prev = closes[i - period] ?? closes[0];
    momValues.push(closes[i] - prev);
  }

  // Linear regression slope of momentum values
  const n = momValues.length;
  const xMean = (n - 1) / 2;
  const yMean = momValues.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (momValues[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;

  // Determine velocity state
  const velocity: "accelerating" | "decelerating" | "steady" =
    slope > 0.5 ? "accelerating" :
    slope < -0.5 ? "decelerating" : "steady";

  return { slope, velocity };
}

function scoreMomentum(bars: Bar[]): FactorResult {
  const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low);
  if (c.length < 15) return { score: 0, components: {}, metadata: {} };
  const rv = rsiC(c, 14), { hist } = macdC(c), rc = rocC(c, 5), atr = atrC(h, l, c), adx = adxC(h, l, c);
  const sR = clamp((rv - 50) * 2.5, -100, 100);
  const sM = tanhN((hist[hist.length - 1] || 0) / (atr * 0.01), 2);
  const sRo = tanhN(rc, 0.3);
  const rec = bars.slice(-5), bs = rec.reduce((a, b) => a + (b.close - b.open), 0);
  const ar = rec.reduce((a, b) => a + (b.high - b.low), 0) / 5;
  const sB = ar > 0 ? tanhN(bs / ar, 1) : 0;
  const bu = rec.filter(b => b.close > b.open).length, be = rec.filter(b => b.close < b.open).length;
  const sP = clamp(((bu - be) / 5) * 100, -100, 100);

  // Momentum slope/velocity
  const { slope, velocity } = momentumSlope(c, 5);
  const sSlope = tanhN(slope, 0.5);

  // Adjust weights to include slope (reduce others proportionally)
  const adjMoW = { rsi: 0.22, macd: 0.26, roc: 0.13, body: 0.13, per: 0.13, slope: 0.13 };
  const raw = adjMoW.rsi * sR + adjMoW.macd * sM + adjMoW.roc * sRo + adjMoW.body * sB + adjMoW.per * sP + adjMoW.slope * sSlope;

  return {
    score: clamp(raw, -100, 100),
    components: { sR, sM, sRo, sB, sP, sSlope },
    metadata: {
      rsi: +rv.toFixed(1),
      macdHist: +(hist[hist.length - 1] || 0).toFixed(4),
      roc: +rc.toFixed(3),
      adx,
      candlePressure: bs > 0 ? "bullish" : bs < 0 ? "bearish" : "flat",
      momentumSlope: +slope.toFixed(3),
      velocity,
    }
  };
}

// ============================================================
// FACTOR 3: VOLATILITY
// ============================================================
function scoreVolatility(bars: Bar[]): FactorResult {
  const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low);
  if (c.length < 20) return { score: 0, components: {}, metadata: {} };
  const atr = atrC(h, l, c), bb = bbC(c), p = c[c.length - 1];
  const ha: number[] = [];
  for (let i = 28; i < c.length; i++) ha.push(atrC(h.slice(0, i + 1), l.slice(0, i + 1), c.slice(0, i + 1)));
  const avg = ha.length ? ha.reduce((a, b) => a + b, 0) / ha.length : atr;
  const ratio = avg > 0 ? atr / avg : 1;
  const sA = tanhN(ratio - 1, 0.5), sBb = tanhN(bb.w - 0.5, 0.3);
  const rr = Math.max(...h.slice(-5)) - Math.min(...l.slice(-5));
  const pr = h.length > 10 ? Math.max(...h.slice(-10, -5)) - Math.min(...l.slice(-10, -5)) : rr;
  const sRn = pr > 0 ? tanhN(rr / pr - 1, 0.5) : 0;
  const pos = bb.u !== bb.l ? (p - bb.l) / (bb.u - bb.l) : 0.5;
  const sBk = pos > 0.95 ? clamp((pos - 0.95) * 2000, 0, 100) : pos < 0.05 ? clamp((0.05 - pos) * -2000, -100, 0) : 0;
  const comp = bb.w < 0.4 && ratio < 0.85;
  const raw = VoW.atr * sA + VoW.bbw * sBb + VoW.rng * sRn + VoW.brk * sBk;
  return { score: clamp(raw, -100, 100), components: { sA, sBb, sRn, sBk }, metadata: { atr: +atr.toFixed(2), atrRatio: +ratio.toFixed(2), bb: { upper: +bb.u.toFixed(2), lower: +bb.l.toFixed(2), mid: +bb.mid.toFixed(2), width: +bb.w.toFixed(2) }, bbPos: +pos.toFixed(2), compressed: comp, expanding: ratio > 1.15, status: comp ? "compressed" : ratio > 1.15 ? "expanding" : "normal" } };
}

// ============================================================
// FACTOR 4: STRUCTURE
// ============================================================
function scoreStructure(bars: Bar[], lv: StructureLevels): FactorResult {
  const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low), v = bars.map(b => b.volume);
  if (c.length < 10) return { score: 0, components: {}, metadata: {} };
  const p = c[c.length - 1], atr = atrC(h, l, c), vw = vwapC(h, l, c, v);
  const sV = tanhN((p - vw) / atr, 1);
  const sP = p > lv.pdh ? tanhN((p - lv.pdh) / atr, 1) : p < lv.pdl ? tanhN((p - lv.pdl) / atr, 1) : tanhN((p - (lv.pdh + lv.pdl) / 2) / atr, 2);
  const dh = (p - lv.swing_high) / atr, dl = (p - lv.swing_low) / atr;
  const sS = Math.abs(dh) < Math.abs(dl) ? tanhN(dh, 1) : tanhN(dl, 1);
  const p3 = c.slice(-4, -1);
  const sB = p > lv.pdh && p3.some(x => x < lv.pdh) ? 60 : p < lv.pdl && p3.some(x => x > lv.pdl) ? -60 : 0;
  const lb = bars[bars.length - 1], wu = lb.high - Math.max(lb.open, lb.close), wd = Math.min(lb.open, lb.close) - lb.low, bd = Math.abs(lb.close - lb.open);
  const sR = bd > 0 ? tanhN((wu - wd) / bd, 2) * -1 : 0;
  const raw = StW.vw * sV + StW.pd * sP + StW.sw * sS + StW.br * sB + StW.rj * sR;
  const sh = Math.max(...h.slice(-30)), sl2 = Math.min(...l.slice(-30));
  return { score: clamp(raw, -100, 100), components: { sV, sP, sS, sB, sR }, metadata: { vwap: +vw.toFixed(2), pdh: lv.pdh, pdl: lv.pdl, swing_high: lv.swing_high, swing_low: lv.swing_low, session_high: +sh.toFixed(2), session_low: +sl2.toFixed(2), breakoutState: sB > 30 ? "above_pdh" : sB < -30 ? "below_pdl" : "none" } };
}

// ============================================================
// FACTOR 5: MACRO (uses real DXY/yield deltas from MT5 bridge)
// ============================================================
function scoreMacro(data: MacroData): FactorResult {
  // Inverse correlation: DXY up = gold bearish, yields up = gold bearish
  const sd10 = tanhN(-data.dxy_delta_10m * 100, 0.3);
  const sd30 = tanhN(-data.dxy_delta_30m * 100, 0.5);
  const sy10 = tanhN(-data.us10y_delta_10m * 100, 0.2);
  const sy30 = tanhN(-data.us10y_delta_30m * 100, 0.3);
  const raw = MaW.d10 * sd10 + MaW.d30 * sd30 + MaW.y10 * sy10 + MaW.y30 * sy30;
  const bias = raw > 15 ? "USD weak / Gold bullish" : raw < -15 ? "USD strong / Gold bearish" : "Neutral";
  return { score: clamp(raw, -100, 100), components: { sd10, sd30, sy10, sy30 }, metadata: { bias, live: data.live, dxy_d10: data.dxy_delta_10m, dxy_d30: data.dxy_delta_30m, y10_d10: data.us10y_delta_10m, y10_d30: data.us10y_delta_30m } };
}

// ============================================================
// DST-AWARE SESSION HELPERS
// ============================================================

/**
 * Determines if US is currently observing DST
 * US DST: Second Sunday of March to First Sunday of November
 */
function isUSDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  // March: DST starts second Sunday
  if (month === 2) {
    let secondSunday = 8;
    while (new Date(Date.UTC(year, 2, secondSunday)).getUTCDay() !== 0) secondSunday++;
    return day >= secondSunday;
  }
  // November: DST ends first Sunday
  if (month === 10) {
    let firstSunday = 1;
    while (new Date(Date.UTC(year, 10, firstSunday)).getUTCDay() !== 0) firstSunday++;
    return day < firstSunday;
  }
  // April-October: DST active
  return month > 2 && month < 10;
}

/**
 * Determines if UK/EU is currently observing DST
 * EU DST: Last Sunday of March to Last Sunday of October
 */
function isEUDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  // March: DST starts last Sunday
  if (month === 2) {
    let lastSunday = 31;
    while (new Date(Date.UTC(year, 2, lastSunday)).getUTCDay() !== 0) lastSunday--;
    return day >= lastSunday;
  }
  // October: DST ends last Sunday
  if (month === 9) {
    let lastSunday = 31;
    while (new Date(Date.UTC(year, 9, lastSunday)).getUTCDay() !== 0) lastSunday--;
    return day < lastSunday;
  }
  // April-September: DST active
  return month > 2 && month < 9;
}

/**
 * Gets DST-adjusted session boundaries in UTC hours
 */
function getSessionBoundaries(date: Date): {
  londonOpen: number; londonClose: number;
  nyOpen: number; nyClose: number;
  asiaOpen: number; asiaClose: number;
} {
  const usDST = isUSDST(date);
  const euDST = isEUDST(date);

  // London: 8:00 AM local (GMT/BST)
  const londonOpen = euDST ? 7 : 8;   // UTC
  const londonClose = euDST ? 15 : 16; // UTC (4:00 PM local)

  // NY: 9:30 AM local (EST/EDT)
  const nyOpen = usDST ? 13 : 14;     // UTC (actually 13:30/14:30)
  const nyClose = usDST ? 20 : 21;    // UTC

  // Asia (Tokyo): 9:00 AM local (no DST in Japan)
  const asiaOpen = 0;   // UTC (midnight)
  const asiaClose = 6;  // UTC

  return { londonOpen, londonClose, nyOpen, nyClose, asiaOpen, asiaClose };
}

// ============================================================
// FACTOR 6: SESSION (DST-aware scoring)
// ============================================================
function scoreSession(): FactorResult {
  const now = new Date();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const hourFrac = h + m / 60; // e.g., 13:30 = 13.5

  const { londonOpen, londonClose, nyOpen, nyClose, asiaOpen, asiaClose } = getSessionBoundaries(now);

  // Calculate overlap window (most valuable trading time)
  const overlapStart = Math.max(londonOpen, nyOpen - 0.5); // NY opens 30 min into calculation
  const overlapEnd = Math.min(londonClose, nyOpen + 3);   // ~3 hours of overlap

  // Check sessions in priority order
  // 1. London/NY Overlap - highest liquidity
  if (hourFrac >= overlapStart && hourFrac < overlapEnd) {
    return { score: 30, components: {}, metadata: { label: "London/NY Overlap", dst: { us: isUSDST(now), eu: isEUDST(now) } } };
  }

  // 2. NY Open (first hour of NY session)
  if (hourFrac >= nyOpen - 0.5 && hourFrac < nyOpen + 1) {
    return { score: 25, components: {}, metadata: { label: "NY Open", dst: { us: isUSDST(now), eu: isEUDST(now) } } };
  }

  // 3. London Session (outside overlap)
  if (hourFrac >= londonOpen && hourFrac < londonClose) {
    return { score: 20, components: {}, metadata: { label: "London Session", dst: { us: isUSDST(now), eu: isEUDST(now) } } };
  }

  // 4. Late NY (after overlap ends)
  if (hourFrac >= overlapEnd && hourFrac < nyClose) {
    return { score: 5, components: {}, metadata: { label: "Late NY", dst: { us: isUSDST(now), eu: isEUDST(now) } } };
  }

  // 5. Asia Session (low gold liquidity)
  if (hourFrac >= asiaOpen && hourFrac < asiaClose) {
    return { score: -5, components: {}, metadata: { label: "Asia Session", dst: { us: isUSDST(now), eu: isEUDST(now) } } };
  }

  // 6. Off-hours / weekend
  const day = now.getUTCDay();
  if (day === 0 || day === 6) {
    return { score: -25, components: {}, metadata: { label: "Weekend", dst: { us: isUSDST(now), eu: isEUDST(now) } } };
  }

  return { score: -15, components: {}, metadata: { label: "Off-hours", dst: { us: isUSDST(now), eu: isEUDST(now) } } };
}

// ============================================================
// FACTOR 7: EXHAUSTION PENALTY
// ============================================================
function scoreExhaustion(bars: Bar[], mom: FactorResult, str: FactorResult): FactorResult {
  const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low);
  if (c.length < 20) return { score: 0, components: {}, metadata: {} };
  const rv = mom.metadata.rsi ?? 50, p = c[c.length - 1], atr = atrC(h, l, c);
  const vw = str.metadata.vwap ?? p, e20 = ema(c, 20);
  let pR = 0;
  if (rv > 72) pR = -clamp((rv - 72) * 4, 0, 100);
  else if (rv < 28) pR = -clamp((28 - rv) * 4, 0, 100);
  const p5 = c[Math.max(0, c.length - 6)], rD = rv - 50, pD2 = p - p5;
  const pDv = (pD2 > 0 && rD < -5) || (pD2 < 0 && rD > 5) ? -40 : 0;
  const vD = Math.abs(p - vw) / atr;
  const pVw = vD > 2 ? -clamp((vD - 2) * 30, 0, 100) : 0;
  const eD = Math.abs(p - e20[e20.length - 1]) / atr;
  const pEm = eD > 2.5 ? -clamp((eD - 2.5) * 25, 0, 100) : 0;
  const ap = c.length > 10 ? atrC(h.slice(0, -5), l.slice(0, -5), c.slice(0, -5)) : atr;
  const sp = atr / (ap || atr);
  const pAt = sp > 2 ? -clamp((sp - 2) * 40, 0, 100) : 0;
  const raw = ExW.rsi * pR + ExW.div * pDv + ExW.vw * pVw + ExW.em * pEm + ExW.at * pAt;
  return { score: clamp(raw, -100, 0), components: { pR, pDv, pVw, pEm, pAt }, metadata: { hasExhaustion: raw < -25, divergence: pDv < -20 } };
}

// ============================================================
// FACTOR 8: EVENT RISK (real calendar-based)
// ============================================================
export function getMinutesToNextEvent(): number | null {
  // Uses the calendar module's synchronous function for hot path
  return getMinutesToNextEventSync();
}

function scoreEventRisk(minutesToEvent: number | null): FactorResult {
  if (minutesToEvent === null) return { score: 0, components: {}, metadata: { severity: "none", minutes: null } };
  let penalty = 0;
  if (minutesToEvent >= 120) penalty = 0;
  else if (minutesToEvent >= 60) penalty = -20;
  else if (minutesToEvent >= 30) penalty = -45;
  else if (minutesToEvent >= 15) penalty = -70;
  else penalty = -100;
  const severity = penalty <= -70 ? "critical" : penalty <= -45 ? "high" : penalty <= -20 ? "moderate" : "low";
  return { score: clamp(penalty, -100, 0), components: {}, metadata: { severity, minutes: minutesToEvent } };
}

// ============================================================
// HTF BIAS CALCULATOR
// ============================================================
function htfBias(bars: Bar[] | undefined, factor = 1): number {
  if (!bars || bars.length < 20) return 0;
  const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low);
  const e20 = ema(c, 20), e50 = ema(c, Math.min(50, c.length));
  const a = atrC(h, l, c);
  return clamp(Math.tanh((e20[e20.length - 1] - e50[e50.length - 1]) / (a * factor)) * factor, -1, 1);
}

// ============================================================
// CONFIDENCE LABELING
// ============================================================
const CL: [number, string][] = [[0.80, "High Confidence"], [0.65, "Moderate-High"], [0.55, "Moderate"], [0, "Weak / Mixed"]];
function confLbl(prob: number): [string, number] {
  const p = Math.max(prob, 1 - prob);
  for (const [t, l] of CL) if (p >= t) return [l, p];
  return ["Weak / Mixed", p];
}

// ============================================================
// REGIME DETECTION
// ============================================================
function detectRegime(bars: Bar[]): ActiveRegime {
  if (bars.length < 30) return "RANGE"; // Default for insufficient data

  const h = bars.map(b => b.high), l = bars.map(b => b.low), c = bars.map(b => b.close);
  const adxR = adxC(h, l, c);
  const bb = bbC(c, 20, 2);
  const atrVal = atrC(h, l, c);

  // Historical ATR for comparison
  const histBars = bars.slice(0, -10);
  const hH = histBars.map(b => b.high), hL = histBars.map(b => b.low), hC = histBars.map(b => b.close);
  const histAtr = histBars.length >= 20 ? atrC(hH, hL, hC) : atrVal;
  const atrRatio = histAtr > 0 ? atrVal / histAtr : 1;

  // Check for compression (squeeze)
  const bbWidth = bb.w;
  const isCompressed = bbWidth < 0.3 && atrRatio < 0.8;

  // Check for breakout (expanding volatility + strong momentum)
  const recent5 = c.slice(-5);
  const prev5 = c.slice(-10, -5);
  const recentRange = Math.max(...bars.slice(-5).map(b => b.high)) - Math.min(...bars.slice(-5).map(b => b.low));
  const prevRange = Math.max(...bars.slice(-10, -5).map(b => b.high)) - Math.min(...bars.slice(-10, -5).map(b => b.low));
  const rangeExpansion = prevRange > 0 ? recentRange / prevRange : 1;
  const isBreakout = atrRatio > 1.3 && rangeExpansion > 1.5;

  // Check for trend (ADX + directional movement)
  const isTrending = adxR.adx > 25 && Math.abs(adxR.pdi - adxR.mdi) > 10;

  if (isCompressed) return "COMPRESSION";
  if (isBreakout) return "BREAKOUT";
  if (isTrending) return "TREND";
  return "RANGE";
}

function resolveActiveWeights(regime: ActiveRegime): typeof MW {
  return REGIME_MW[regime];
}

// ============================================================
// MASTER ENGINE — Combines all 8 factors
// ============================================================
export function runSignalEngine(
  bars10m: Bar[],
  bars1h?: Bar[],
  bars4h?: Bar[],
  macroData?: MacroData,
  structureLevels?: StructureLevels,
  symbol = "XAUUSD",
  bid = 0, ask = 0, spread = 0,
): SignalOutput {
  const now = new Date().toISOString();
  const empty: FactorResult = { score: 0, components: {}, metadata: {} };

  if (!bars10m || bars10m.length < 20) {
    return { timestamp: now, symbol, price: bid || 0, bid, ask, spread, master_score: 0, state: "no_trade", bull_probability: 0.5, bear_probability: 0.5, confidence_label: "Weak / Mixed", confidence_pct: 0.5, factors: { trend: empty, momentum: empty, volatility: empty, structure: empty, macro: empty, session: empty, exhaustion: empty, event_risk: empty }, risk_level: "low", key_level: 0, invalidation: 0, breakout_watch: null, reversal_watch: null, no_trade: true, no_trade_reason: "Insufficient bar data", data_quality: "partial", tf_biases: {}, alert_fired: false };
  }

  const price = bars10m[bars10m.length - 1].close;
  const m10b = htfBias(bars10m, 0.8), h1b = htfBias(bars1h, 1.2), h4b = htfBias(bars4h, 1.8);

  // Macro: use provided data or zero (no mock randomization)
  const macro: MacroData = macroData || { dxy_delta_10m: 0, dxy_delta_30m: 0, us10y_delta_10m: 0, us10y_delta_30m: 0, live: false };

  // Structure levels: derive from bars if not provided
  if (!structureLevels) {
    const hs = bars10m.map(b => b.high), ls = bars10m.map(b => b.low);
    const ds = bars10m.slice(-144);
    structureLevels = {
      pdh: Math.max(...ds.map(b => b.high)), pdl: Math.min(...ds.map(b => b.low)),
      swing_high: Math.max(...hs.slice(-50)), swing_low: Math.min(...ls.slice(-50)),
      session_high: Math.max(...hs.slice(-30)), session_low: Math.min(...ls.slice(-30)),
    };
  }

  // Event risk: real calendar
  const minsToEvent = getMinutesToNextEvent();

  // Score all 8 factors
  const trend = scoreTrend(bars10m, h1b, h4b);
  const momentum = scoreMomentum(bars10m);
  const volatility = scoreVolatility(bars10m);
  const structure = scoreStructure(bars10m, structureLevels);
  const macroF = scoreMacro(macro);
  const session = scoreSession();
  const exhaustion = scoreExhaustion(bars10m, momentum, structure);
  const eventRisk = scoreEventRisk(minsToEvent);

  const factors: Record<string, FactorResult> = { trend, momentum, volatility, structure, macro: macroF, session, exhaustion, event_risk: eventRisk };

  // Detect active regime and resolve weights
  const activeRegime = detectRegime(bars10m);
  let W = resolveActiveWeights(activeRegime);

  // Macro weight redistribution when feed is down
  if (!macro.live) {
    // Redistribute macro weight to trend and structure
    const macroWeight = W.macro;
    W = {
      ...W,
      macro: 0,  // Zero out macro weight
      trend: W.trend + macroWeight * 0.5,       // 50% to trend
      structure: W.structure + macroWeight * 0.5 // 50% to structure
    };
  }

  // Weighted master score (regime-adaptive)
  const master = clamp(
    W.trend * trend.score + W.momentum * momentum.score + W.volatility * volatility.score +
    W.structure * structure.score + W.macro * macroF.score + W.session * session.score +
    W.exhaustion * exhaustion.score + W.event_risk * eventRisk.score, -100, 100);

  const pBull = sigm(master), pBear = 1 - pBull;
  const [cl, cp] = confLbl(pBull);

  // Overlays
  let bw: string | null = null;
  if (volatility.metadata.compressed && Math.abs(trend.score) > 30 && Math.abs(momentum.score) > 25)
    bw = trend.score > 0 ? "up" : "down";
  let rw: string | null = null;
  if (exhaustion.metadata.hasExhaustion && exhaustion.metadata.divergence)
    rw = master > 0 ? "down" : "up";

  // No-trade gates
  let nt = false, ntr: string | null = null;
  const adxV = momentum.metadata.adx?.adx ?? 25;
  if (Math.abs(master) < 8 && cl === "Weak / Mixed") { nt = true; ntr = "Score too weak"; }
  else if (eventRisk.score <= -70) { nt = true; ntr = "High event risk"; }
  else if (Math.sign(trend.score) !== Math.sign(momentum.score) && Math.abs(trend.score) > 30 && Math.abs(momentum.score) > 30) { nt = true; ntr = "Trend/momentum conflict"; }
  else if (adxV < 15 && !bw) { nt = true; ntr = "ADX too weak"; }

  // State classification
  let state: SignalState = "neutral";
  if (nt) state = "no_trade";
  else if (bw) state = bw === "up" ? "breakout_watch_up" : "breakout_watch_down";
  else if (rw) state = rw === "up" ? "reversal_watch_up" : "reversal_watch_down";
  else if (master >= 50) state = "strong_bullish";
  else if (master >= 25) state = cp >= 0.65 ? "actionable_long" : "watch_long";
  else if (master <= -50) state = "strong_bearish";
  else if (master <= -25) state = cp >= 0.65 ? "actionable_short" : "watch_short";

  const atrV = volatility.metadata.atr ?? 1;
  const rl: RiskLevel = eventRisk.score <= -70 ? "high_event_risk" : eventRisk.score <= -20 ? "elevated" : exhaustion.metadata.hasExhaustion ? "moderate" : "low";

  const dq = macro.live ? "full" : (bars1h && bars1h.length > 0) ? "degraded" : "partial";

  return {
    timestamp: now, symbol, price: +price.toFixed(2), bid: bid || price, ask: ask || price, spread,
    master_score: +master.toFixed(2), state,
    bull_probability: +pBull.toFixed(4), bear_probability: +pBear.toFixed(4),
    confidence_label: cl, confidence_pct: +cp.toFixed(4),
    factors, risk_level: rl,
    key_level: +(structure.metadata.vwap ?? price).toFixed(2),
    invalidation: +(master > 0 ? price - atrV * 1.5 : price + atrV * 1.5).toFixed(2),
    breakout_watch: bw, reversal_watch: rw, no_trade: nt, no_trade_reason: ntr,
    data_quality: dq,
    tf_biases: { "10m": +m10b.toFixed(3), "1h": +h1b.toFixed(3), "4h": +h4b.toFixed(3) },
    alert_fired: false,
    activeRegime,
  };
}
