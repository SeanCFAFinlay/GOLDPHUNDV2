// ============================================================
// GOLD V2 — Indicator Matrix
// Grouped indicator scoring. Indicators SUPPORT decisions,
// they do NOT independently determine direction.
// ============================================================

import type { Bar, IndicatorMatrix } from "../types";
import {
  ema, rsi, macd, stochastic, williamsR, cci, roc, atr,
  bollingerBands, keltnerChannels, adx, supertrend, vwap,
  donchianChannels, tanhN, clamp
} from "../math/indicators";

// ============================================================
// GROUP A: TREND INDICATORS (-100 to +100)
// ============================================================

function scoreTrend(bars: Bar[]): number {
  if (bars.length < 30) return 0;

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const last = closes[closes.length - 1];
  let score = 0;

  // EMA 9/20/50 alignment (50pts max)
  const e9 = ema(closes, 9);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e9v = e9[e9.length - 1];
  const e20v = e20[e20.length - 1];
  const e50v = e50[e50.length - 1];

  if (last > e9v) score += 10;
  else score -= 10;
  if (last > e20v) score += 10;
  else score -= 10;
  if (e9v > e20v) score += 10;
  else score -= 10;
  if (e20v > e50v) score += 10;
  else score -= 10;
  if (last > e50v) score += 10;
  else score -= 10;

  // ADX direction bias (30pts max)
  const adxResult = adx(highs, lows, closes, 14);
  if (adxResult.adx > 20) {
    const diDiff = adxResult.plusDI - adxResult.minusDI;
    score += clamp(diDiff * 1.5, -30, 30);
  }

  // SuperTrend (20pts max)
  if (bars.length >= 15) {
    const st = supertrend(highs, lows, closes, 10, 3);
    score += st.direction > 0 ? 20 : -20;
  }

  return clamp(score, -100, 100);
}

// ============================================================
// GROUP B: MOMENTUM INDICATORS (-100 to +100)
// ============================================================

function scoreMomentum(bars: Bar[]): number {
  if (bars.length < 20) return 0;

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  let score = 0;

  // RSI (25pts)
  const rsiVal = rsi(closes, 14);
  if (rsiVal > 70) score -= 15;       // Overbought penalty
  else if (rsiVal > 55) score += 25;
  else if (rsiVal < 30) score += 15;  // Oversold — potential bullish reversal
  else if (rsiVal < 45) score -= 25;
  else score += (rsiVal - 50) * 0.5;

  // MACD histogram (25pts)
  const macdResult = macd(closes);
  score += clamp(macdResult.histogram * 20, -25, 25);

  // Stochastic (20pts)
  if (bars.length >= 14) {
    const stoch = stochastic(highs, lows, closes, 14, 3);
    if (stoch.k > 80) score -= 15;
    else if (stoch.k > 60) score += 20;
    else if (stoch.k < 20) score += 15;
    else if (stoch.k < 40) score -= 20;
  }

  // CCI (15pts)
  const cciVal = cci(highs, lows, closes, 20);
  if (cciVal > 100) score += 10;
  else if (cciVal < -100) score -= 10;
  else score += cciVal * 0.05;

  // ROC (15pts)
  const rocVal = roc(closes, 5);
  score += clamp(rocVal * 3, -15, 15);

  return clamp(score, -100, 100);
}

// ============================================================
// GROUP C: VOLATILITY CONTEXT (0-100, not directional)
// ============================================================

function scoreVolatility(bars: Bar[]): number {
  if (bars.length < 20) return 50;

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);

  // ATR ratio (current vs historical)
  let atrScore = 50;
  if (bars.length >= 28) {
    const currentATR = atr(highs, lows, closes, 14);
    const histH = bars.slice(0, -14).map(b => b.high);
    const histL = bars.slice(0, -14).map(b => b.low);
    const histC = bars.slice(0, -14).map(b => b.close);
    const histATR = atr(histH, histL, histC, 14);
    const ratio = histATR > 0 ? currentATR / histATR : 1;
    // High volatility = high score (good for momentum trades)
    atrScore = clamp(ratio * 50, 10, 100);
  }

  // Bollinger Band width (compression = low, expansion = high)
  const bb = bollingerBands(closes, 20, 2);
  const bbWidthScore = clamp(bb.width * 500, 0, 100);

  return clamp((atrScore + bbWidthScore) / 2, 0, 100);
}

// ============================================================
// GROUP D: PARTICIPATION / VALUE (-100 to +100)
// ============================================================

function scoreParticipation(bars: Bar[]): number {
  if (bars.length < 20) return 0;

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);
  const last = closes[closes.length - 1];
  let score = 0;

  // VWAP deviation (50pts)
  if (volumes.some(v => v > 0)) {
    const vwapVal = vwap(highs, lows, closes, volumes);
    if (vwapVal > 0) {
      const dev = (last - vwapVal) / vwapVal;
      score += clamp(dev * 5000, -50, 50);
    }
  } else {
    // No volume — use price midpoint vs SMA as proxy
    const avg20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const dev = (last - avg20) / avg20;
    score += clamp(dev * 3000, -30, 30);
  }

  // Donchian Channels position (25pts)
  const dc = donchianChannels(highs, lows, 20);
  const dcMid = (dc.upper + dc.lower) / 2;
  if (dc.upper !== dc.lower) {
    const pos = (last - dcMid) / ((dc.upper - dc.lower) / 2);
    score += clamp(pos * 25, -25, 25);
  }

  // Volume trend (25pts) — recent volume vs average
  if (volumes.some(v => v > 0)) {
    const recentVol = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio = avgVol > 0 ? recentVol / avgVol : 1;
    // High volume in direction of price movement = participation score
    const lastDir = closes[closes.length - 1] > closes[closes.length - 4] ? 1 : -1;
    score += clamp(lastDir * (volRatio - 1) * 25, -25, 25);
  }

  return clamp(score, -100, 100);
}

// ============================================================
// GROUP E: STRUCTURE SCORE (-100 to +100)
// ============================================================

function scoreStructure(bars: Bar[], prevDayHigh?: number, prevDayLow?: number, prevDayClose?: number): number {
  if (bars.length < 10) return 0;

  const last = bars[bars.length - 1].close;
  let score = 0;

  // Previous day levels interaction (40pts)
  if (prevDayHigh && prevDayLow) {
    const range = prevDayHigh - prevDayLow;
    if (range > 0) {
      const pos = (last - prevDayLow) / range; // 0=at PDL, 1=at PDH
      // Above PDH = very bullish (+40)
      if (last > prevDayHigh) score += 40;
      // Below PDL = very bearish (-40)
      else if (last < prevDayLow) score -= 40;
      // In upper half of prior range = mild bullish
      else score += (pos - 0.5) * 60; // -30 to +30
    }
  }

  // Previous day close (20pts)
  if (prevDayClose) {
    score += last > prevDayClose ? 20 : -20;
  }

  // Bollinger Bands position (20pts)
  const closes = bars.map(b => b.close);
  const bb = bollingerBands(closes, 20, 2);
  if (bb.upper !== bb.lower) {
    const pctB = (last - bb.lower) / (bb.upper - bb.lower);
    score += (pctB - 0.5) * 40; // -20 to +20
  }

  // Keltner channel position (20pts)
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const kc = keltnerChannels(highs, lows, closes, 20, 1.5);
  if (kc.upper !== kc.lower) {
    const kcPos = (last - kc.lower) / (kc.upper - kc.lower);
    score += (kcPos - 0.5) * 40;
  }

  return clamp(score, -100, 100);
}

// ============================================================
// DIVERGENCE DETECTION
// ============================================================

function detectDivergences(bars: Bar[]): string[] {
  const warnings: string[] = [];
  if (bars.length < 20) return warnings;

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);

  // RSI divergence: price making new high but RSI not
  const lastClose = closes[closes.length - 1];
  const prevHigh = Math.max(...closes.slice(-10, -1));
  const rsiNow = rsi(closes, 14);
  const rsiPrev = rsi(closes.slice(0, -5), 14);

  if (lastClose > prevHigh && rsiNow < rsiPrev - 5) {
    warnings.push("Bearish RSI divergence: price new high, RSI falling");
  }
  if (lastClose < Math.min(...closes.slice(-10, -1)) && rsiNow > rsiPrev + 5) {
    warnings.push("Bullish RSI divergence: price new low, RSI rising");
  }

  // MACD divergence
  const macdNow = macd(closes);
  const macdPrev = macd(closes.slice(0, -5));
  if (lastClose > prevHigh && macdNow.histogram < macdPrev.histogram - 0.5) {
    warnings.push("Bearish MACD divergence: price up, histogram falling");
  }

  return warnings;
}

// ============================================================
// MAIN INDICATOR MATRIX
// ============================================================

export function runIndicatorMatrix(
  bars: Bar[],
  prevDayHigh?: number,
  prevDayLow?: number,
  prevDayClose?: number,
): IndicatorMatrix {
  if (!bars || bars.length < 10) {
    return {
      trendScore: 0, momentumScore: 0, volatilityScore: 50,
      participationScore: 0, structureScore: 0, overallBias: 0,
      divergenceWarnings: ["Insufficient data"],
      summary: ["Not enough bars for indicator analysis"],
    };
  }

  const trendScore = scoreTrend(bars);
  const momentumScore = scoreMomentum(bars);
  const volatilityScore = scoreVolatility(bars);
  const participationScore = scoreParticipation(bars);
  const structureScore = scoreStructure(bars, prevDayHigh, prevDayLow, prevDayClose);
  const divergenceWarnings = detectDivergences(bars);

  // Weighted composite (trend and momentum lead, structure important)
  const overallBias = clamp(
    trendScore * 0.30
    + momentumScore * 0.25
    + participationScore * 0.15
    + structureScore * 0.30,
    -100, 100
  );

  const summary: string[] = [];
  if (Math.abs(trendScore) > 50) summary.push(`Trend: ${trendScore > 0 ? "bullish" : "bearish"} (${trendScore.toFixed(0)})`);
  if (Math.abs(momentumScore) > 40) summary.push(`Momentum: ${momentumScore > 0 ? "positive" : "negative"} (${momentumScore.toFixed(0)})`);
  if (volatilityScore > 70) summary.push("High volatility environment");
  if (volatilityScore < 30) summary.push("Low volatility / compression");
  if (Math.abs(participationScore) > 40) summary.push(`Participation: ${participationScore > 0 ? "above VWAP/value" : "below value"}`);
  if (divergenceWarnings.length > 0) summary.push(...divergenceWarnings.map(d => `⚠ ${d}`));

  return {
    trendScore,
    momentumScore,
    volatilityScore,
    participationScore,
    structureScore,
    overallBias,
    divergenceWarnings,
    summary,
  };
}
