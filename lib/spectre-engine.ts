// ============================================================
// SPECTRE — Secondary Pattern Engine for XAUUSD
// 5 factors, fully independent from PHUND signal engine
// ============================================================
import type { Bar } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const tanh100 = (v: number, s = 1) => Math.tanh(v / s) * 100;

function ema(d: number[], p: number): number[] {
  if (!d.length) return [];
  const k = 2 / (p + 1), r = [d[0]];
  for (let i = 1; i < d.length; i++) r.push(d[i] * k + r[i - 1] * (1 - k));
  return r;
}

function atrC(h: number[], l: number[], c: number[], p = 14): number {
  if (h.length < 2) return 1;
  const tr: number[] = [];
  for (let i = 1; i < h.length; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  if (tr.length < p) return tr[tr.length - 1] || 1;
  let v = tr.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < tr.length; i++) v = (v * (p - 1) + tr[i]) / p;
  return Math.max(v, 0.001);
}

function bbands(c: number[], p = 20, mult = 2): { u: number; l: number; mid: number } {
  if (c.length < p) { const x = c[c.length - 1] || 0; return { u: x + 5, l: x - 5, mid: x }; }
  const s = c.slice(-p), mn = s.reduce((a, b) => a + b, 0) / p;
  const std = Math.sqrt(s.reduce((a, b) => a + (b - mn) ** 2, 0) / p);
  return { u: mn + mult * std, l: mn - mult * std, mid: mn };
}

function keltner(h: number[], l: number[], c: number[], p = 20, mult = 1.5): { u: number; l: number; mid: number } {
  const e = ema(c, p), mid = e[e.length - 1], a = atrC(h, l, c, p);
  return { u: mid + mult * a, l: mid - mult * a, mid };
}

function stochastic(h: number[], l: number[], c: number[], kp = 14, dp = 3): { k: number; d: number } {
  if (c.length < kp) return { k: 50, d: 50 };
  const kArr: number[] = [];
  for (let i = kp - 1; i < c.length; i++) {
    const hi = Math.max(...h.slice(i - kp + 1, i + 1)), lo = Math.min(...l.slice(i - kp + 1, i + 1));
    kArr.push(hi === lo ? 50 : ((c[i] - lo) / (hi - lo)) * 100);
  }
  const k = kArr[kArr.length - 1], dSlice = kArr.slice(-dp);
  return { k, d: dSlice.reduce((a, b) => a + b, 0) / dSlice.length };
}

function williamsR(h: number[], l: number[], c: number[], p = 14): number {
  if (c.length < p) return -50;
  const hi = Math.max(...h.slice(-p)), lo = Math.min(...l.slice(-p));
  return hi === lo ? -50 : ((hi - c[c.length - 1]) / (hi - lo)) * -100;
}

function cci(h: number[], l: number[], c: number[], p = 20): number {
  if (c.length < p) return 0;
  const tp = h.map((hi, i) => (hi + l[i] + c[i]) / 3), slice = tp.slice(-p);
  const mean = slice.reduce((a, b) => a + b, 0) / p;
  const md = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / p;
  return md > 0 ? (tp[tp.length - 1] - mean) / (0.015 * md) : 0;
}

function ichimoku(h: number[], l: number[], c: number[]) {
  const hMax = (n: number) => Math.max(...h.slice(-Math.min(n, h.length)));
  const lMin = (n: number) => Math.min(...l.slice(-Math.min(n, l.length)));
  const tenkan = (hMax(9) + lMin(9)) / 2;
  const kijun = (hMax(26) + lMin(26)) / 2;
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = (hMax(52) + lMin(52)) / 2;
  const price26ago = c.length >= 27 ? c[c.length - 27] : c[0];
  return { tenkan, kijun, senkouA, senkouB, price26ago, price: c[c.length - 1] };
}

function supertrend(h: number[], l: number[], c: number[], p = 10, mult = 3): number {
  if (c.length < p + 1) return 0;
  const a = atrC(h, l, c, p);
  const hl2 = (h[h.length - 1] + l[l.length - 1]) / 2;
  const lower = hl2 - mult * a;
  return c[c.length - 1] > lower ? 1 : -1;
}

function swingStructure(h: number[], l: number[], n = 40) {
  const N = Math.min(n, h.length);
  const pH: number[] = [], pL: number[] = [];
  for (let i = 2; i < N - 2; i++) {
    const idx = h.length - N + i;
    if (h[idx] > h[idx-1] && h[idx] > h[idx-2] && h[idx] > h[idx+1] && h[idx] > h[idx+2]) pH.push(h[idx]);
    if (l[idx] < l[idx-1] && l[idx] < l[idx-2] && l[idx] < l[idx+1] && l[idx] < l[idx+2]) pL.push(l[idx]);
  }
  let hh = 0, lh = 0, hl = 0, ll = 0;
  for (let i = 1; i < pH.length; i++) pH[i] > pH[i-1] ? hh++ : lh++;
  for (let i = 1; i < pL.length; i++) pL[i] > pL[i-1] ? hl++ : ll++;
  const bull = hh + hl, bear = lh + ll;
  return { bias: clamp((bull - bear) / Math.max(bull + bear, 1) * 2, -1, 1), hh, hl, lh, ll };
}

function detectFVGs(bars: Bar[], price: number) {
  const fvgs: { type: "bull"|"bear"; mid: number; filled: boolean }[] = [];
  const start = Math.max(0, bars.length - 30);
  for (let i = start + 1; i < bars.length - 1; i++) {
    const prev = bars[i-1], next = bars[i+1];
    if (prev.low > next.high) fvgs.push({ type: "bull", mid: (prev.low + next.high) / 2, filled: price <= prev.low });
    if (prev.high < next.low) fvgs.push({ type: "bear", mid: (next.low + prev.high) / 2, filled: price >= prev.high });
  }
  return fvgs.filter(f => !f.filled);
}

function detectOrderBlocks(bars: Bar[], price: number) {
  const bodies = bars.slice(-30).map(b => Math.abs(b.close - b.open));
  const avg = bodies.reduce((a, b) => a + b, 0) / bodies.length;
  const obs: { type: "bull"|"bear"; high: number; low: number; mid: number }[] = [];
  for (let i = Math.max(1, bars.length - 25); i < bars.length - 2; i++) {
    const b = bars[i], body = Math.abs(b.close - b.open);
    if (body < avg * 1.5) continue;
    const ob = bars[i - 1];
    const isValid = b.close > b.open ? price > ob.low : price < ob.high;
    if (isValid) obs.push({ type: b.close > b.open ? "bull" : "bear", high: ob.high, low: ob.low, mid: (ob.high + ob.low) / 2 });
  }
  return obs.slice(-4);
}

function autoFib(h: number[], l: number[], c: number[], p: number) {
  const n = Math.min(80, c.length);
  const swH = Math.max(...h.slice(-n)), swL = Math.min(...l.slice(-n));
  const range = swH - swL;
  const atr = atrC(h, l, c);
  if (range < atr * 0.5) return { levels: [], nearest: null, swH, swL, nearDist: Infinity };
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
  const levels = ratios.map(r => ({ r, label: `${(r*100).toFixed(1)}%`, px: swH - r * range }));
  const key = levels.filter(lv => [0.236,0.382,0.5,0.618,0.786].includes(lv.r));
  let nearest = key[0], minD = Infinity;
  for (const lv of key) { const d = Math.abs(lv.px - p); if (d < minD) { minD = d; nearest = lv; } }
  return { levels: key, nearest, swH, swL, nearDist: minD, atr };
}

export interface SpectreOutput {
  timestamp: string; symbol: string; price: number;
  spectre_score: number;
  state: "strong_bull"|"bull"|"neutral"|"bear"|"strong_bear"|"no_data";
  confidence: "High"|"Moderate"|"Low";
  ichimoku: { score: number; meta: Record<string,unknown> };
  squeeze: { score: number; meta: Record<string,unknown> };
  smart_money: { score: number; meta: Record<string,unknown> };
  fibonacci: { score: number; meta: Record<string,unknown> };
  oscillators: { score: number; meta: Record<string,unknown> };
  weights: Record<string,number>;
  data_quality: "full"|"degraded";
}

export function runSpectreEngine(bars10m: Bar[], bars1h?: Bar[], bars4h?: Bar[], symbol = "XAUUSD"): SpectreOutput {
  const now = new Date().toISOString();
  const price = bars10m.length > 0 ? bars10m[bars10m.length - 1].close : 0;
  const empty = { score: 0, meta: { reason: "insufficient data" } };
  const W = { ichimoku: 0.25, squeeze: 0.20, smart_money: 0.20, fibonacci: 0.20, oscillators: 0.15 };

  if (bars10m.length < 30) {
    return { timestamp: now, symbol, price, spectre_score: 0, state: "no_data", confidence: "Low", ichimoku: empty, squeeze: empty, smart_money: empty, fibonacci: empty, oscillators: empty, weights: W, data_quality: "degraded" };
  }

  // --- FACTOR 1: ICHIMOKU (prefer H4 > H1 > 10m) ---
  const ichiBars = (bars4h && bars4h.length >= 52) ? bars4h : (bars1h && bars1h.length >= 52) ? bars1h : bars10m;
  const ih = ichiBars.map(b => b.high), il = ichiBars.map(b => b.low), ic = ichiBars.map(b => b.close);
  let ichiScore = 0, ichiMeta: Record<string,unknown> = { reason: "< 52 bars" };
  if (ichiBars.length >= 52) {
    const ichi = ichimoku(ih, il, ic);
    const { tenkan, kijun, senkouA, senkouB, price26ago, price: ip } = ichi;
    const atr = atrC(ih, il, ic), cloudTop = Math.max(senkouA, senkouB), cloudBot = Math.min(senkouA, senkouB);
    const pvCloud = ip > cloudTop ? clamp((ip - cloudTop) / atr * 40, 0, 100) : ip < cloudBot ? clamp((ip - cloudBot) / atr * 40, -100, 0) : clamp((ip - (cloudTop+cloudBot)/2) / atr * 20, -40, 40);
    const tkScore = clamp(tanh100((tenkan - kijun) / atr, 1.5), -100, 100);
    const cloudTwist = senkouA > senkouB ? 50 : -50;
    const chikouBias = ip > price26ago ? 40 : ip < price26ago ? -40 : 0;
    ichiScore = clamp(0.35*pvCloud + 0.30*tkScore + 0.20*cloudTwist + 0.15*chikouBias, -100, 100);
    ichiMeta = { tenkan: +tenkan.toFixed(2), kijun: +kijun.toFixed(2), cloudTop: +cloudTop.toFixed(2), cloudBot: +cloudBot.toFixed(2), bias: ip > cloudTop ? "Above Cloud" : ip < cloudBot ? "Below Cloud" : "Inside Cloud", tkCross: tenkan > kijun ? "Bullish" : "Bearish", tf: ichiBars === bars4h ? "H4" : ichiBars === bars1h ? "H1" : "10m" };
  }

  // --- FACTOR 2: SQUEEZE MOMENTUM ---
  const h = bars10m.map(b => b.high), l = bars10m.map(b => b.low), c = bars10m.map(b => b.close);
  let squeezeScore = 0, squeezeMeta: Record<string,unknown> = {};
  if (c.length >= 25) {
    const bb = bbands(c, 20, 2.0), kc = keltner(h, l, c, 20, 1.5);
    const squeezed = bb.u < kc.u && bb.l > kc.l;
    const prevC = c.slice(0, -3), prevH = h.slice(0, -3), prevL = l.slice(0, -3);
    const pbb = bbands(prevC, 20, 2.0), pkc = keltner(prevH, prevL, prevC, 20, 1.5);
    const wasSqueezed = pbb.u < pkc.u && pbb.l > pkc.l, released = wasSqueezed && !squeezed;
    const mid20H = Math.max(...h.slice(-20)), mid20L = Math.min(...l.slice(-20));
    const delta = c[c.length-1] - (mid20H + mid20L) / 2;
    const atr = atrC(h, l, c);
    const mom = clamp(tanh100(delta / atr, 1.5), -100, 100);
    squeezeScore = clamp(squeezed ? mom * 0.5 : released ? mom * 1.6 : mom, -100, 100);
    squeezeMeta = { squeezed, released, status: squeezed ? "ARMED" : released ? "FIRED" : "FREE", momVal: +delta.toFixed(2), bbWidth: +(bb.u-bb.l).toFixed(2), kcWidth: +(kc.u-kc.l).toFixed(2) };
  }

  // --- FACTOR 3: SMART MONEY STRUCTURE ---
  const swings = swingStructure(h, l, Math.min(40, h.length));
  const fvgs = detectFVGs(bars10m, price);
  const obs = detectOrderBlocks(bars10m, price);
  const structScore = clamp(swings.bias * 100, -100, 100);
  let fvgScore = 0;
  for (const fvg of fvgs.filter(f => Math.abs(f.mid - price) < 60)) { fvgScore += fvg.type === "bull" && fvg.mid < price ? 25 : fvg.type === "bear" && fvg.mid > price ? -25 : 0; }
  let obScore = 0;
  for (const ob of obs) { const d = Math.abs(ob.mid - price); if (d < 40) obScore += ob.type === "bull" ? 30 : -30; }
  const smcScore = clamp(0.50*structScore + 0.30*clamp(fvgScore,-100,100) + 0.20*clamp(obScore,-100,100), -100, 100);
  const smcMeta = { structure: swings.bias > 0.2 ? "Bullish HH/HL" : swings.bias < -0.2 ? "Bearish LH/LL" : "Mixed", hh: swings.hh, hl: swings.hl, lh: swings.lh, ll: swings.ll, activeFVGs: fvgs.length, bullFVGs: fvgs.filter(f=>f.type==="bull").map(f=>+f.mid.toFixed(2)), bearFVGs: fvgs.filter(f=>f.type==="bear").map(f=>+f.mid.toFixed(2)), orderBlocks: obs.map(o=>({ type: o.type, level: +o.mid.toFixed(2) })) };

  // --- FACTOR 4: FIBONACCI ---
  const fibBars = (bars1h && bars1h.length >= 30) ? bars1h : bars10m;
  const fh = fibBars.map(b => b.high), fl = fibBars.map(b => b.low), fc = fibBars.map(b => b.close);
  let fibScore = 0, fibMeta: Record<string,unknown> = {};
  if (fc.length >= 20) {
    const { levels, nearest, swH, swL, nearDist, atr: fa } = autoFib(fh, fl, fc, price);
    const range = swH - swL;
    const fibPos = range > 0 ? (swH - price) / range : 0.5;
    const atKey = fa ? nearDist < fa * 0.6 : nearDist < 3;
    const recentTrend = fc.length > 5 ? fc[fc.length-1] - fc[fc.length-6] : 0;
    const r = nearest?.r ?? 0.5;
    if (atKey && nearest) {
      const keyWeight = (r === 0.618 || r === 0.382) ? 70 : r === 0.5 ? 55 : 35;
      fibScore = clamp(recentTrend > 0 ? keyWeight : recentTrend < 0 ? -keyWeight : 0, -100, 100);
    }
    fibMeta = { swingHigh: +swH.toFixed(2), swingLow: +swL.toFixed(2), fibPos: +(fibPos*100).toFixed(1)+"%", nearest: nearest?.label || "—", nearestPx: nearest ? +(swH - (nearest.r)*range).toFixed(2) : 0, distFromFib: nearDist ? +nearDist.toFixed(2) : 0, atKeyLevel: atKey, levels: (levels||[]).map(lv => ({ label: lv.label, px: +lv.px.toFixed(2) })), tf: fibBars === bars1h ? "H1" : "10m" };
  }

  // --- FACTOR 5: MULTI-OSCILLATOR ---
  let oscScore = 0, oscMeta: Record<string,unknown> = {};
  if (c.length >= 20) {
    const { k, d } = stochastic(h, l, c, 14, 3);
    const wr = williamsR(h, l, c, 14);
    const cciVal = cci(h, l, c, 20);
    const st = supertrend(h, l, c, 10, 3);
    const stochS = clamp((k - 50) * 2.5, -100, 100);
    const stochCross = k > d ? 15 : -15;
    const wrS = clamp((wr + 50) * 2.5, -100, 100);
    const cciS = clamp(cciVal * 0.6, -100, 100);
    const stS = st * 60;
    oscScore = clamp(0.25*stochS + 0.10*stochCross + 0.20*wrS + 0.25*cciS + 0.20*stS, -100, 100);
    const votes = [stochS, wrS, cciS, stS].filter(s => Math.abs(s) > 20);
    const aligned = votes.length >= 3 && votes.every(s => Math.sign(s) === Math.sign(votes[0]));
    oscMeta = { stochK: +k.toFixed(1), stochD: +d.toFixed(1), stochZone: k > 80 ? "Overbought" : k < 20 ? "Oversold" : "Neutral", williamsR: +wr.toFixed(1), wrZone: wr > -20 ? "Overbought" : wr < -80 ? "Oversold" : "Neutral", cci: +cciVal.toFixed(1), cciZone: cciVal > 100 ? "Overbought" : cciVal < -100 ? "Oversold" : "Neutral", supertrend: st > 0 ? "Bullish" : "Bearish", consensus: aligned ? (oscScore > 0 ? "BULL ALIGNED" : "BEAR ALIGNED") : "MIXED" };
  }

  const master = clamp(W.ichimoku*ichiScore + W.squeeze*squeezeScore + W.smart_money*smcScore + W.fibonacci*fibScore + W.oscillators*oscScore, -100, 100);
  const state: SpectreOutput["state"] = master >= 55 ? "strong_bull" : master >= 20 ? "bull" : master <= -55 ? "strong_bear" : master <= -20 ? "bear" : "neutral";
  const confidence: SpectreOutput["confidence"] = Math.abs(master) >= 50 ? "High" : Math.abs(master) >= 25 ? "Moderate" : "Low";

  return {
    timestamp: now, symbol, price, spectre_score: +master.toFixed(2), state, confidence,
    ichimoku: { score: +ichiScore.toFixed(2), meta: ichiMeta },
    squeeze: { score: +squeezeScore.toFixed(2), meta: squeezeMeta },
    smart_money: { score: +smcScore.toFixed(2), meta: smcMeta },
    fibonacci: { score: +fibScore.toFixed(2), meta: fibMeta },
    oscillators: { score: +oscScore.toFixed(2), meta: oscMeta },
    weights: W,
    data_quality: (bars4h && bars4h.length > 26) ? "full" : "degraded",
  };
}
