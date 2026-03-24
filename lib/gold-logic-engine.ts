// ============================================================
// GOLD LOGIC AI — Advanced Market Intelligence Engine V2
// Top 30 Indicator Stack with Normalized Scoring
// ============================================================

import type { Bar, MacroData, FactorResult } from "./types";
import {
  clamp, normalize, sigmoid, tanh100,
  ema, sma, macd, adx, supertrend, parabolicSAR,
  rsi, stochastic, cci, roc, momentum, williamsR, tsi,
  atr, natr, bollingerBands, keltnerChannels, donchianChannels,
  vwap, zScore, pivotPoints, linearRegressionSlope,
  ichimokuCloud as ichimokuCloudShared
} from "./math/indicators";
import { GOLD_LOGIC_WEIGHTS } from "./config/weights";

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type MasterBias = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
export type MarketRegime = "TREND" | "RANGE" | "BREAKOUT" | "REVERSAL_RISK" | "EVENT_RISK" | "COMPRESSION";
export type TradeQuality = "A_PLUS" | "A" | "B" | "C" | "NO_TRADE";
export type RiskState = "NORMAL" | "CAUTION" | "HIGH_VOLATILITY" | "EVENT_LOCKOUT";
export type IndicatorDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNAVAILABLE";

export interface IndicatorRow {
  name: string;
  category: "trend" | "momentum" | "volatility" | "structure" | "macro";
  rawValue: number | string | null;
  normalized: number | null;
  direction: IndicatorDirection;
  weight: number;
  reliability: number;
  regimeFit: string;
  status: "active" | "unavailable" | "stale";
}

export interface ScenarioBlock {
  trigger: string;
  invalidation: string;
  targets: string[];
}

export interface GoldLogicSnapshot {
  symbol: string;
  timestamp: string;
  price: number;
  masterBias: MasterBias;
  probabilityUp: number;
  confidence: number;
  regime: MarketRegime;
  tradeQuality: TradeQuality;
  riskState: RiskState;
  categoryScores: {
    trend: number;
    momentum: number;
    volatility: number;
    structure: number;
    macro: number;
  };
  timeframeScores: {
    m5: number;
    m10: number;
    m15: number;
    h1: number;
    h4: number;
  };
  indicators: IndicatorRow[];
  scenarios: {
    bull: ScenarioBlock;
    bear: ScenarioBlock;
    noTrade: {
      reason: string;
      conditionToImprove: string;
    };
  };
  alerts: string[];
  engineVersion: string;
  dataQuality: "full" | "degraded" | "partial";
}

// ============================================================
// LOCAL HELPER FUNCTIONS
// ============================================================

/** Local wrapper for ichimokuCloud with position scoring */
function ichimokuCloud(highs: number[], lows: number[], closes: number[]): { position: string; tenkan: number; kijun: number; cloudTop: number; cloudBot: number; score: number } {
  const ichi = ichimokuCloudShared(highs, lows, closes);
  const { tenkan, kijun, cloudTop, cloudBot, price } = ichi;

  let position = "Inside";
  let score = 0;
  if (price > cloudTop) { position = "Above Cloud"; score = 70; }
  else if (price < cloudBot) { position = "Below Cloud"; score = -70; }
  else { position = "Inside Cloud"; score = 0; }

  if (tenkan > kijun) score += 30;
  else score -= 30;

  return { position, tenkan, kijun, cloudTop, cloudBot, score: clamp(score, -100, 100) };
}

/** Local wrapper for pivot distance calculation */
function pivotDistance(highs: number[], lows: number[], closes: number[]): { distance: number; nearestPivot: number; pivotType: string } {
  const price = closes[closes.length - 1];
  const pivots = pivotPoints(highs, lows, closes);

  const levels = [
    { level: pivots.r2, type: "R2" },
    { level: pivots.r1, type: "R1" },
    { level: pivots.pivot, type: "PP" },
    { level: pivots.s1, type: "S1" },
    { level: pivots.s2, type: "S2" }
  ];

  let nearest = levels[0];
  let minDist = Math.abs(price - levels[0].level);
  for (const l of levels) {
    const d = Math.abs(price - l.level);
    if (d < minDist) { minDist = d; nearest = l; }
  }

  return { distance: minDist, nearestPivot: nearest.level, pivotType: nearest.type };
}

// ============================================================
// CATEGORY SCORING
// ============================================================

function scoreTrendCategory(bars: Bar[], h1Bars?: Bar[], h4Bars?: Bar[]): { score: number; indicators: IndicatorRow[] } {
  const c = bars.map(b => b.close);
  const h = bars.map(b => b.high);
  const l = bars.map(b => b.low);
  const price = c[c.length - 1];
  const atrVal = atr(h, l, c);

  const indicators: IndicatorRow[] = [];
  let totalWeighted = 0;
  let totalWeight = 0;

  // EMA 9
  const ema9 = ema(c, 9);
  const ema9Val = ema9[ema9.length - 1];
  const ema9Norm = normalize(price - ema9Val, -atrVal * 2, atrVal * 2);
  indicators.push({
    name: "EMA 9", category: "trend", rawValue: +ema9Val.toFixed(2), normalized: +ema9Norm.toFixed(3),
    direction: ema9Norm > 0.15 ? "BULLISH" : ema9Norm < -0.15 ? "BEARISH" : "NEUTRAL",
    weight: 0.08, reliability: 0.75, regimeFit: "TREND", status: "active"
  });
  totalWeighted += ema9Norm * 0.08; totalWeight += 0.08;

  // EMA 21
  const ema21 = ema(c, 21);
  const ema21Val = ema21[ema21.length - 1];
  const ema21Norm = normalize(price - ema21Val, -atrVal * 2.5, atrVal * 2.5);
  indicators.push({
    name: "EMA 21", category: "trend", rawValue: +ema21Val.toFixed(2), normalized: +ema21Norm.toFixed(3),
    direction: ema21Norm > 0.15 ? "BULLISH" : ema21Norm < -0.15 ? "BEARISH" : "NEUTRAL",
    weight: 0.10, reliability: 0.80, regimeFit: "TREND", status: "active"
  });
  totalWeighted += ema21Norm * 0.10; totalWeight += 0.10;

  // EMA 50
  const ema50 = ema(c, Math.min(50, c.length));
  const ema50Val = ema50[ema50.length - 1];
  const ema50Norm = normalize(price - ema50Val, -atrVal * 3, atrVal * 3);
  indicators.push({
    name: "EMA 50", category: "trend", rawValue: +ema50Val.toFixed(2), normalized: +ema50Norm.toFixed(3),
    direction: ema50Norm > 0.15 ? "BULLISH" : ema50Norm < -0.15 ? "BEARISH" : "NEUTRAL",
    weight: 0.12, reliability: 0.85, regimeFit: "TREND", status: "active"
  });
  totalWeighted += ema50Norm * 0.12; totalWeight += 0.12;

  // EMA 200
  const ema200 = ema(c, Math.min(200, c.length));
  const ema200Val = ema200[ema200.length - 1];
  const ema200Norm = normalize(price - ema200Val, -atrVal * 5, atrVal * 5);
  indicators.push({
    name: "EMA 200", category: "trend", rawValue: +ema200Val.toFixed(2), normalized: +ema200Norm.toFixed(3),
    direction: ema200Norm > 0.10 ? "BULLISH" : ema200Norm < -0.10 ? "BEARISH" : "NEUTRAL",
    weight: 0.15, reliability: 0.90, regimeFit: "TREND", status: "active"
  });
  totalWeighted += ema200Norm * 0.15; totalWeight += 0.15;

  // SMA 200
  const sma200Val = sma(c, Math.min(200, c.length));
  const sma200Norm = normalize(price - sma200Val, -atrVal * 5, atrVal * 5);
  indicators.push({
    name: "SMA 200", category: "trend", rawValue: +sma200Val.toFixed(2), normalized: +sma200Norm.toFixed(3),
    direction: sma200Norm > 0.10 ? "BULLISH" : sma200Norm < -0.10 ? "BEARISH" : "NEUTRAL",
    weight: 0.10, reliability: 0.88, regimeFit: "TREND", status: "active"
  });
  totalWeighted += sma200Norm * 0.10; totalWeight += 0.10;

  // MACD Line
  const macdResult = macd(c);
  const macdNorm = normalize(macdResult.line, -atrVal * 0.5, atrVal * 0.5);
  indicators.push({
    name: "MACD Line", category: "trend", rawValue: +macdResult.line.toFixed(4), normalized: +macdNorm.toFixed(3),
    direction: macdNorm > 0.15 ? "BULLISH" : macdNorm < -0.15 ? "BEARISH" : "NEUTRAL",
    weight: 0.10, reliability: 0.80, regimeFit: "TREND", status: "active"
  });
  totalWeighted += macdNorm * 0.10; totalWeight += 0.10;

  // MACD Histogram
  const macdHistNorm = normalize(macdResult.histogram, -atrVal * 0.3, atrVal * 0.3);
  indicators.push({
    name: "MACD Hist", category: "trend", rawValue: +macdResult.histogram.toFixed(4), normalized: +macdHistNorm.toFixed(3),
    direction: macdHistNorm > 0.15 ? "BULLISH" : macdHistNorm < -0.15 ? "BEARISH" : "NEUTRAL",
    weight: 0.08, reliability: 0.75, regimeFit: "TREND", status: "active"
  });
  totalWeighted += macdHistNorm * 0.08; totalWeight += 0.08;

  // ADX
  const adxResult = adx(h, l, c);
  const adxTrendStrength = adxResult.adx > 25 ? 1 : adxResult.adx > 15 ? 0.5 : 0;
  const adxDirection = adxResult.plusDI > adxResult.minusDI ? 1 : -1;
  const adxNorm = adxTrendStrength * adxDirection;
  indicators.push({
    name: "ADX", category: "trend", rawValue: +adxResult.adx.toFixed(1), normalized: +adxNorm.toFixed(3),
    direction: adxResult.adx < 15 ? "NEUTRAL" : adxResult.plusDI > adxResult.minusDI ? "BULLISH" : "BEARISH",
    weight: 0.12, reliability: 0.85, regimeFit: "TREND", status: "active"
  });
  totalWeighted += adxNorm * 0.12; totalWeight += 0.12;

  // +DI / -DI
  const diDiff = normalize(adxResult.plusDI - adxResult.minusDI, -50, 50);
  indicators.push({
    name: "+DI / -DI", category: "trend", rawValue: `${adxResult.plusDI.toFixed(1)} / ${adxResult.minusDI.toFixed(1)}`, normalized: +diDiff.toFixed(3),
    direction: diDiff > 0.15 ? "BULLISH" : diDiff < -0.15 ? "BEARISH" : "NEUTRAL",
    weight: 0.07, reliability: 0.80, regimeFit: "TREND", status: "active"
  });
  totalWeighted += diDiff * 0.07; totalWeight += 0.07;

  // SuperTrend
  const st = supertrend(h, l, c);
  const stNorm = st.direction;
  indicators.push({
    name: "SuperTrend", category: "trend", rawValue: +st.value.toFixed(2), normalized: st.direction,
    direction: st.direction > 0 ? "BULLISH" : st.direction < 0 ? "BEARISH" : "NEUTRAL",
    weight: 0.08, reliability: 0.82, regimeFit: "TREND", status: "active"
  });
  totalWeighted += stNorm * 0.08; totalWeight += 0.08;

  const score = totalWeight > 0 ? (totalWeighted / totalWeight) * 100 : 0;
  return { score: clamp(score, -100, 100), indicators };
}

function scoreMomentumCategory(bars: Bar[]): { score: number; indicators: IndicatorRow[] } {
  const c = bars.map(b => b.close);
  const h = bars.map(b => b.high);
  const l = bars.map(b => b.low);

  const indicators: IndicatorRow[] = [];
  let totalWeighted = 0;
  let totalWeight = 0;

  // RSI
  const rsiVal = rsi(c);
  const rsiNorm = normalize(rsiVal, 30, 70);
  indicators.push({
    name: "RSI (14)", category: "momentum", rawValue: +rsiVal.toFixed(1), normalized: +rsiNorm.toFixed(3),
    direction: rsiVal > 60 ? "BULLISH" : rsiVal < 40 ? "BEARISH" : "NEUTRAL",
    weight: 0.15, reliability: 0.85, regimeFit: "ALL", status: "active"
  });
  totalWeighted += rsiNorm * 0.15; totalWeight += 0.15;

  // Stochastic K
  const stochResult = stochastic(h, l, c);
  const stochKNorm = normalize(stochResult.k, 20, 80);
  indicators.push({
    name: "Stoch %K", category: "momentum", rawValue: +stochResult.k.toFixed(1), normalized: +stochKNorm.toFixed(3),
    direction: stochResult.k > 70 ? "BULLISH" : stochResult.k < 30 ? "BEARISH" : "NEUTRAL",
    weight: 0.12, reliability: 0.80, regimeFit: "RANGE", status: "active"
  });
  totalWeighted += stochKNorm * 0.12; totalWeight += 0.12;

  // Stochastic D
  const stochDNorm = normalize(stochResult.d, 20, 80);
  indicators.push({
    name: "Stoch %D", category: "momentum", rawValue: +stochResult.d.toFixed(1), normalized: +stochDNorm.toFixed(3),
    direction: stochResult.d > 70 ? "BULLISH" : stochResult.d < 30 ? "BEARISH" : "NEUTRAL",
    weight: 0.08, reliability: 0.78, regimeFit: "RANGE", status: "active"
  });
  totalWeighted += stochDNorm * 0.08; totalWeight += 0.08;

  // CCI
  const cciVal = cci(h, l, c);
  const cciNorm = normalize(cciVal, -100, 100);
  indicators.push({
    name: "CCI (20)", category: "momentum", rawValue: +cciVal.toFixed(1), normalized: +cciNorm.toFixed(3),
    direction: cciVal > 100 ? "BULLISH" : cciVal < -100 ? "BEARISH" : "NEUTRAL",
    weight: 0.12, reliability: 0.78, regimeFit: "BREAKOUT", status: "active"
  });
  totalWeighted += cciNorm * 0.12; totalWeight += 0.12;

  // ROC
  const rocVal = roc(c, 5);
  const rocNorm = normalize(rocVal, -1, 1);
  indicators.push({
    name: "ROC (5)", category: "momentum", rawValue: +rocVal.toFixed(3), normalized: +rocNorm.toFixed(3),
    direction: rocVal > 0.3 ? "BULLISH" : rocVal < -0.3 ? "BEARISH" : "NEUTRAL",
    weight: 0.10, reliability: 0.75, regimeFit: "TREND", status: "active"
  });
  totalWeighted += rocNorm * 0.10; totalWeight += 0.10;

  // Momentum
  const momVal = momentum(c, 10);
  const atrVal = atr(h, l, c);
  const momNorm = normalize(momVal, -atrVal * 2, atrVal * 2);
  indicators.push({
    name: "Momentum", category: "momentum", rawValue: +momVal.toFixed(2), normalized: +momNorm.toFixed(3),
    direction: momNorm > 0.2 ? "BULLISH" : momNorm < -0.2 ? "BEARISH" : "NEUTRAL",
    weight: 0.10, reliability: 0.75, regimeFit: "TREND", status: "active"
  });
  totalWeighted += momNorm * 0.10; totalWeight += 0.10;

  // Williams %R
  const wrVal = williamsR(h, l, c);
  const wrNorm = normalize(wrVal, -80, -20);
  indicators.push({
    name: "Williams %R", category: "momentum", rawValue: +wrVal.toFixed(1), normalized: +wrNorm.toFixed(3),
    direction: wrVal > -20 ? "BULLISH" : wrVal < -80 ? "BEARISH" : "NEUTRAL",
    weight: 0.12, reliability: 0.78, regimeFit: "RANGE", status: "active"
  });
  totalWeighted += wrNorm * 0.12; totalWeight += 0.12;

  // TSI
  const tsiVal = tsi(c);
  const tsiNorm = normalize(tsiVal, -25, 25);
  indicators.push({
    name: "TSI", category: "momentum", rawValue: +tsiVal.toFixed(1), normalized: +tsiNorm.toFixed(3),
    direction: tsiVal > 10 ? "BULLISH" : tsiVal < -10 ? "BEARISH" : "NEUTRAL",
    weight: 0.11, reliability: 0.80, regimeFit: "TREND", status: "active"
  });
  totalWeighted += tsiNorm * 0.11; totalWeight += 0.11;

  // Stoch Cross bonus
  const stochCross = stochResult.k > stochResult.d ? 0.1 : -0.1;
  totalWeighted += stochCross * 0.10; totalWeight += 0.10;

  const score = totalWeight > 0 ? (totalWeighted / totalWeight) * 100 : 0;
  return { score: clamp(score, -100, 100), indicators };
}

function scoreVolatilityCategory(bars: Bar[]): { score: number; indicators: IndicatorRow[]; regime: MarketRegime } {
  const c = bars.map(b => b.close);
  const h = bars.map(b => b.high);
  const l = bars.map(b => b.low);

  const indicators: IndicatorRow[] = [];
  let compressionScore = 0;
  let expansionScore = 0;

  // ATR
  const atrVal = atr(h, l, c);
  const historicalATRs: number[] = [];
  for (let i = 28; i < c.length; i++) {
    historicalATRs.push(atr(h.slice(0, i + 1), l.slice(0, i + 1), c.slice(0, i + 1)));
  }
  const avgATR = historicalATRs.length ? historicalATRs.reduce((a, b) => a + b, 0) / historicalATRs.length : atrVal;
  const atrRatio = avgATR > 0 ? atrVal / avgATR : 1;
  const atrNorm = normalize(atrRatio, 0.7, 1.3);

  indicators.push({
    name: "ATR (14)", category: "volatility", rawValue: +atrVal.toFixed(2), normalized: +atrNorm.toFixed(3),
    direction: atrRatio > 1.2 ? "BULLISH" : atrRatio < 0.8 ? "BEARISH" : "NEUTRAL",
    weight: 0.20, reliability: 0.90, regimeFit: "ALL", status: "active"
  });

  if (atrRatio < 0.8) compressionScore += 30;
  if (atrRatio > 1.3) expansionScore += 30;

  // NATR
  const natrVal = natr(h, l, c);
  const natrNorm = normalize(natrVal, 0.1, 0.4);
  indicators.push({
    name: "NATR", category: "volatility", rawValue: +natrVal.toFixed(3), normalized: +natrNorm.toFixed(3),
    direction: natrVal > 0.3 ? "BULLISH" : natrVal < 0.15 ? "BEARISH" : "NEUTRAL",
    weight: 0.15, reliability: 0.85, regimeFit: "ALL", status: "active"
  });

  // Bollinger Band Width
  const bb = bollingerBands(c);
  const bbWidthNorm = normalize(bb.width, 0.3, 1.5);
  indicators.push({
    name: "BB Width", category: "volatility", rawValue: +bb.width.toFixed(2), normalized: +bbWidthNorm.toFixed(3),
    direction: bb.width > 1 ? "BULLISH" : bb.width < 0.4 ? "BEARISH" : "NEUTRAL",
    weight: 0.18, reliability: 0.85, regimeFit: "ALL", status: "active"
  });

  if (bb.width < 0.4) compressionScore += 35;
  if (bb.width > 1.2) expansionScore += 25;

  // Bollinger %B
  const bbPercentBNorm = normalize(bb.percentB, 0.2, 0.8);
  indicators.push({
    name: "BB %B", category: "volatility", rawValue: +bb.percentB.toFixed(2), normalized: +bbPercentBNorm.toFixed(3),
    direction: bb.percentB > 0.8 ? "BULLISH" : bb.percentB < 0.2 ? "BEARISH" : "NEUTRAL",
    weight: 0.15, reliability: 0.80, regimeFit: "RANGE", status: "active"
  });

  // Keltner Width
  const kc = keltnerChannels(h, l, c);
  const kcWidthNorm = normalize(kc.width, 0.3, 1.5);
  indicators.push({
    name: "Keltner Width", category: "volatility", rawValue: +kc.width.toFixed(2), normalized: +kcWidthNorm.toFixed(3),
    direction: kc.width > 1 ? "BULLISH" : kc.width < 0.4 ? "BEARISH" : "NEUTRAL",
    weight: 0.16, reliability: 0.82, regimeFit: "ALL", status: "active"
  });

  // Donchian Width
  const dc = donchianChannels(h, l);
  const price = c[c.length - 1];
  const dcWidthPct = price > 0 ? ((dc.upper - dc.lower) / price) * 100 : 0;
  const dcWidthNorm = normalize(dcWidthPct, 0.3, 1.5);
  indicators.push({
    name: "Donchian Width", category: "volatility", rawValue: +dcWidthPct.toFixed(2), normalized: +dcWidthNorm.toFixed(3),
    direction: dcWidthPct > 1 ? "BULLISH" : dcWidthPct < 0.4 ? "BEARISH" : "NEUTRAL",
    weight: 0.16, reliability: 0.80, regimeFit: "BREAKOUT", status: "active"
  });

  // Squeeze detection (BB inside KC)
  const squeezed = bb.upper < kc.upper && bb.lower > kc.lower;
  if (squeezed) compressionScore += 35;

  // Determine regime
  let regime: MarketRegime = "RANGE";
  if (compressionScore >= 50) regime = "COMPRESSION";
  else if (expansionScore >= 40) regime = "BREAKOUT";

  const volScore = (atrNorm + bbWidthNorm + kcWidthNorm) / 3 * 100;
  return { score: clamp(volScore, -100, 100), indicators, regime };
}

function scoreStructureCategory(bars: Bar[]): { score: number; indicators: IndicatorRow[] } {
  const c = bars.map(b => b.close);
  const h = bars.map(b => b.high);
  const l = bars.map(b => b.low);
  const v = bars.map(b => b.volume);
  const price = c[c.length - 1];
  const atrVal = atr(h, l, c);

  const indicators: IndicatorRow[] = [];
  let totalWeighted = 0;
  let totalWeight = 0;

  // VWAP Distance
  const vwapVal = vwap(h, l, c, v);
  const vwapDist = (price - vwapVal) / atrVal;
  const vwapNorm = normalize(vwapDist, -2, 2);
  indicators.push({
    name: "VWAP Dist", category: "structure", rawValue: +vwapDist.toFixed(2), normalized: +vwapNorm.toFixed(3),
    direction: vwapDist > 0.5 ? "BULLISH" : vwapDist < -0.5 ? "BEARISH" : "NEUTRAL",
    weight: 0.18, reliability: 0.85, regimeFit: "ALL", status: "active"
  });
  totalWeighted += vwapNorm * 0.18; totalWeight += 0.18;

  // Rolling Z-Score
  const zScoreVal = zScore(c);
  const zNorm = normalize(zScoreVal, -2, 2);
  indicators.push({
    name: "Z-Score", category: "structure", rawValue: +zScoreVal.toFixed(2), normalized: +zNorm.toFixed(3),
    direction: zScoreVal > 1 ? "BULLISH" : zScoreVal < -1 ? "BEARISH" : "NEUTRAL",
    weight: 0.15, reliability: 0.80, regimeFit: "RANGE", status: "active"
  });
  totalWeighted += zNorm * 0.15; totalWeight += 0.15;

  // Pivot Distance
  const pivotResult = pivotDistance(h, l, c);
  const pivotNorm = normalize(price - pivotResult.nearestPivot, -atrVal * 2, atrVal * 2);
  indicators.push({
    name: "Pivot Dist", category: "structure", rawValue: pivotResult.pivotType, normalized: +pivotNorm.toFixed(3),
    direction: pivotNorm > 0.3 ? "BULLISH" : pivotNorm < -0.3 ? "BEARISH" : "NEUTRAL",
    weight: 0.15, reliability: 0.78, regimeFit: "RANGE", status: "active"
  });
  totalWeighted += pivotNorm * 0.15; totalWeight += 0.15;

  // Ichimoku Cloud Position
  const ichiResult = ichimokuCloud(h, l, c);
  const ichiNorm = ichiResult.score / 100;
  indicators.push({
    name: "Ichimoku", category: "structure", rawValue: ichiResult.position, normalized: +ichiNorm.toFixed(3),
    direction: ichiResult.score > 30 ? "BULLISH" : ichiResult.score < -30 ? "BEARISH" : "NEUTRAL",
    weight: 0.20, reliability: 0.88, regimeFit: "TREND", status: "active"
  });
  totalWeighted += ichiNorm * 0.20; totalWeight += 0.20;

  // Parabolic SAR
  const sarResult = parabolicSAR(h, l, c);
  indicators.push({
    name: "Parabolic SAR", category: "structure", rawValue: +sarResult.value.toFixed(2), normalized: sarResult.direction,
    direction: sarResult.direction > 0 ? "BULLISH" : sarResult.direction < 0 ? "BEARISH" : "NEUTRAL",
    weight: 0.15, reliability: 0.75, regimeFit: "TREND", status: "active"
  });
  totalWeighted += sarResult.direction * 0.15; totalWeight += 0.15;

  // Linear Regression Slope
  const lrResult = linearRegressionSlope(c);
  const lrNorm = normalize(lrResult.slope, -atrVal * 0.1, atrVal * 0.1);
  indicators.push({
    name: "LR Slope", category: "structure", rawValue: +lrResult.slope.toFixed(4), normalized: +lrNorm.toFixed(3),
    direction: lrNorm > 0.3 ? "BULLISH" : lrNorm < -0.3 ? "BEARISH" : "NEUTRAL",
    weight: 0.17, reliability: 0.82, regimeFit: "TREND", status: "active"
  });
  totalWeighted += lrNorm * 0.17; totalWeight += 0.17;

  const score = totalWeight > 0 ? (totalWeighted / totalWeight) * 100 : 0;
  return { score: clamp(score, -100, 100), indicators };
}

function scoreMacroCategory(macroData?: MacroData): { score: number; indicators: IndicatorRow[] } {
  const indicators: IndicatorRow[] = [];

  if (!macroData || !macroData.live) {
    // Return unavailable indicators
    indicators.push({
      name: "DXY Δ10m", category: "macro", rawValue: null, normalized: null,
      direction: "UNAVAILABLE", weight: 0.30, reliability: 0.90, regimeFit: "ALL", status: "unavailable"
    });
    indicators.push({
      name: "DXY Δ30m", category: "macro", rawValue: null, normalized: null,
      direction: "UNAVAILABLE", weight: 0.25, reliability: 0.88, regimeFit: "ALL", status: "unavailable"
    });
    indicators.push({
      name: "US10Y Δ10m", category: "macro", rawValue: null, normalized: null,
      direction: "UNAVAILABLE", weight: 0.25, reliability: 0.85, regimeFit: "ALL", status: "unavailable"
    });
    indicators.push({
      name: "US10Y Δ30m", category: "macro", rawValue: null, normalized: null,
      direction: "UNAVAILABLE", weight: 0.20, reliability: 0.83, regimeFit: "ALL", status: "unavailable"
    });
    return { score: 0, indicators };
  }

  let totalWeighted = 0;
  let totalWeight = 0;

  // DXY 10m (inverse correlation)
  const dxy10Norm = normalize(-macroData.dxy_delta_10m * 100, -0.3, 0.3);
  indicators.push({
    name: "DXY Δ10m", category: "macro", rawValue: +(macroData.dxy_delta_10m * 100).toFixed(3), normalized: +dxy10Norm.toFixed(3),
    direction: macroData.dxy_delta_10m < -0.001 ? "BULLISH" : macroData.dxy_delta_10m > 0.001 ? "BEARISH" : "NEUTRAL",
    weight: 0.30, reliability: 0.90, regimeFit: "ALL", status: "active"
  });
  totalWeighted += dxy10Norm * 0.30; totalWeight += 0.30;

  // DXY 30m
  const dxy30Norm = normalize(-macroData.dxy_delta_30m * 100, -0.5, 0.5);
  indicators.push({
    name: "DXY Δ30m", category: "macro", rawValue: +(macroData.dxy_delta_30m * 100).toFixed(3), normalized: +dxy30Norm.toFixed(3),
    direction: macroData.dxy_delta_30m < -0.002 ? "BULLISH" : macroData.dxy_delta_30m > 0.002 ? "BEARISH" : "NEUTRAL",
    weight: 0.25, reliability: 0.88, regimeFit: "ALL", status: "active"
  });
  totalWeighted += dxy30Norm * 0.25; totalWeight += 0.25;

  // US10Y 10m (inverse correlation)
  const y10mNorm = normalize(-macroData.us10y_delta_10m * 100, -0.2, 0.2);
  indicators.push({
    name: "US10Y Δ10m", category: "macro", rawValue: +(macroData.us10y_delta_10m * 100).toFixed(3), normalized: +y10mNorm.toFixed(3),
    direction: macroData.us10y_delta_10m < -0.001 ? "BULLISH" : macroData.us10y_delta_10m > 0.001 ? "BEARISH" : "NEUTRAL",
    weight: 0.25, reliability: 0.85, regimeFit: "ALL", status: "active"
  });
  totalWeighted += y10mNorm * 0.25; totalWeight += 0.25;

  // US10Y 30m
  const y30mNorm = normalize(-macroData.us10y_delta_30m * 100, -0.3, 0.3);
  indicators.push({
    name: "US10Y Δ30m", category: "macro", rawValue: +(macroData.us10y_delta_30m * 100).toFixed(3), normalized: +y30mNorm.toFixed(3),
    direction: macroData.us10y_delta_30m < -0.002 ? "BULLISH" : macroData.us10y_delta_30m > 0.002 ? "BEARISH" : "NEUTRAL",
    weight: 0.20, reliability: 0.83, regimeFit: "ALL", status: "active"
  });
  totalWeighted += y30mNorm * 0.20; totalWeight += 0.20;

  const score = totalWeight > 0 ? (totalWeighted / totalWeight) * 100 : 0;
  return { score: clamp(score, -100, 100), indicators };
}

// ============================================================
// TIMEFRAME SCORING
// ============================================================

function scoreTimeframe(bars: Bar[] | undefined): number {
  if (!bars || bars.length < 20) return 0;
  const c = bars.map(b => b.close);
  const h = bars.map(b => b.high);
  const l = bars.map(b => b.low);

  const e20 = ema(c, 20);
  const e50 = ema(c, Math.min(50, c.length));
  const atrVal = atr(h, l, c);
  const price = c[c.length - 1];

  const emaBias = normalize(e20[e20.length - 1] - e50[e50.length - 1], -atrVal * 2, atrVal * 2);
  const priceBias = normalize(price - e20[e20.length - 1], -atrVal * 1.5, atrVal * 1.5);

  return clamp((emaBias * 0.6 + priceBias * 0.4) * 100, -100, 100);
}

// ============================================================
// MAIN ENGINE FUNCTION
// ============================================================

export function buildGoldLogicSnapshot(
  bars10m: Bar[],
  bars1h?: Bar[],
  bars4h?: Bar[],
  macroData?: MacroData,
  symbol = "XAUUSD"
): GoldLogicSnapshot {
  const now = new Date().toISOString();
  const price = bars10m.length > 0 ? bars10m[bars10m.length - 1].close : 0;

  // Default empty snapshot
  if (bars10m.length < 30) {
    return {
      symbol, timestamp: now, price,
      masterBias: "NEUTRAL",
      probabilityUp: 0.5,
      confidence: 0,
      regime: "RANGE",
      tradeQuality: "NO_TRADE",
      riskState: "CAUTION",
      categoryScores: { trend: 0, momentum: 0, volatility: 0, structure: 0, macro: 0 },
      timeframeScores: { m5: 0, m10: 0, m15: 0, h1: 0, h4: 0 },
      indicators: [],
      scenarios: {
        bull: { trigger: "Insufficient data", invalidation: "N/A", targets: [] },
        bear: { trigger: "Insufficient data", invalidation: "N/A", targets: [] },
        noTrade: { reason: "Insufficient bar data (< 30)", conditionToImprove: "Wait for more data" }
      },
      alerts: ["Insufficient data for analysis"],
      engineVersion: "2.0.0",
      dataQuality: "partial"
    };
  }

  const h = bars10m.map(b => b.high);
  const l = bars10m.map(b => b.low);
  const c = bars10m.map(b => b.close);
  const atrVal = atr(h, l, c);

  // Score all categories
  const trendResult = scoreTrendCategory(bars10m, bars1h, bars4h);
  const momentumResult = scoreMomentumCategory(bars10m);
  const volatilityResult = scoreVolatilityCategory(bars10m);
  const structureResult = scoreStructureCategory(bars10m);
  const macroResult = scoreMacroCategory(macroData);

  // Combine indicators
  const allIndicators = [
    ...trendResult.indicators,
    ...momentumResult.indicators,
    ...volatilityResult.indicators,
    ...structureResult.indicators,
    ...macroResult.indicators
  ];

  // Category scores
  const categoryScores = {
    trend: +trendResult.score.toFixed(2),
    momentum: +momentumResult.score.toFixed(2),
    volatility: +volatilityResult.score.toFixed(2),
    structure: +structureResult.score.toFixed(2),
    macro: +macroResult.score.toFixed(2)
  };

  // Timeframe scores
  const m5Score = scoreTimeframe(bars10m.slice(-6)); // Approximate M5 from M10
  const m10Score = scoreTimeframe(bars10m);
  const m15Score = scoreTimeframe(bars10m.slice(-Math.floor(bars10m.length * 1.5))); // Approximate
  const h1Score = scoreTimeframe(bars1h);
  const h4Score = scoreTimeframe(bars4h);

  const timeframeScores = {
    m5: +m5Score.toFixed(2),
    m10: +m10Score.toFixed(2),
    m15: +m15Score.toFixed(2),
    h1: +h1Score.toFixed(2),
    h4: +h4Score.toFixed(2)
  };

  // Weighted master score
  const weights = { trend: 0.28, momentum: 0.22, volatility: 0.12, structure: 0.20, macro: 0.18 };
  const masterScore = clamp(
    weights.trend * categoryScores.trend +
    weights.momentum * categoryScores.momentum +
    weights.volatility * categoryScores.volatility +
    weights.structure * categoryScores.structure +
    weights.macro * categoryScores.macro,
    -100, 100
  );

  // Probability and confidence
  const probabilityUp = sigmoid(masterScore);
  const confidence = Math.abs(masterScore) * (macroData?.live ? 1 : 0.8);

  // Master bias classification
  let masterBias: MasterBias = "NEUTRAL";
  if (masterScore >= 50) masterBias = "STRONG_BUY";
  else if (masterScore >= 25) masterBias = "BUY";
  else if (masterScore <= -50) masterBias = "STRONG_SELL";
  else if (masterScore <= -25) masterBias = "SELL";

  // Market regime
  let regime: MarketRegime = volatilityResult.regime;
  const adxIndicator = allIndicators.find(i => i.name === "ADX");
  const adxVal = typeof adxIndicator?.rawValue === "number" ? adxIndicator.rawValue : 20;

  if (regime === "COMPRESSION") {
    // Already set
  } else if (adxVal > 30 && Math.abs(categoryScores.trend) > 40) {
    regime = "TREND";
  } else if (adxVal < 20) {
    regime = "RANGE";
  }

  // Trade quality
  let tradeQuality: TradeQuality = "C";
  const alignedTF = [m10Score, h1Score, h4Score].filter(s => Math.sign(s) === Math.sign(masterScore)).length;

  if (Math.abs(masterScore) >= 50 && confidence >= 60 && alignedTF >= 2) {
    tradeQuality = "A_PLUS";
  } else if (Math.abs(masterScore) >= 35 && confidence >= 45 && alignedTF >= 2) {
    tradeQuality = "A";
  } else if (Math.abs(masterScore) >= 20 && confidence >= 30) {
    tradeQuality = "B";
  } else if (Math.abs(masterScore) < 10 || confidence < 20) {
    tradeQuality = "NO_TRADE";
  }

  // Risk state
  let riskState: RiskState = "NORMAL";
  const volIndicator = allIndicators.find(i => i.name === "ATR (14)");
  const atrRaw = typeof volIndicator?.rawValue === "number" ? volIndicator.rawValue : atrVal;
  const historicalATRs: number[] = [];
  for (let i = 28; i < c.length; i++) {
    historicalATRs.push(atr(h.slice(0, i + 1), l.slice(0, i + 1), c.slice(0, i + 1)));
  }
  const avgATR = historicalATRs.length ? historicalATRs.reduce((a, b) => a + b, 0) / historicalATRs.length : atrRaw;
  const currentATRRatio = avgATR > 0 ? atrRaw / avgATR : 1;

  if (currentATRRatio > 1.5) riskState = "HIGH_VOLATILITY";
  else if (tradeQuality === "NO_TRADE" || Math.abs(masterScore) < 15) riskState = "CAUTION";

  // Scenarios
  const bullTrigger = masterScore > 0
    ? `Break above ${(price + atrVal * 0.5).toFixed(2)} with volume confirmation`
    : `Reclaim ${(price + atrVal * 1.5).toFixed(2)} and hold above EMA 20`;
  const bullInvalidation = (price - atrVal * 1.5).toFixed(2);
  const bullTargets = [
    (price + atrVal * 1).toFixed(2),
    (price + atrVal * 2).toFixed(2),
    (price + atrVal * 3).toFixed(2)
  ];

  const bearTrigger = masterScore < 0
    ? `Break below ${(price - atrVal * 0.5).toFixed(2)} with momentum confirmation`
    : `Lose ${(price - atrVal * 1.5).toFixed(2)} and stay below EMA 20`;
  const bearInvalidation = (price + atrVal * 1.5).toFixed(2);
  const bearTargets = [
    (price - atrVal * 1).toFixed(2),
    (price - atrVal * 2).toFixed(2),
    (price - atrVal * 3).toFixed(2)
  ];

  const noTradeReason = tradeQuality === "NO_TRADE"
    ? "Score too weak or conflicting signals"
    : alignedTF < 2 ? "Timeframe misalignment" : "Mixed momentum/structure";
  const conditionToImprove = masterScore > 0
    ? "Wait for momentum confirmation or pullback to support"
    : masterScore < 0
      ? "Wait for structure breakdown or rally to resistance"
      : "Wait for directional clarity";

  // Alerts
  const alerts: string[] = [];
  if (regime === "COMPRESSION") alerts.push("🔵 Squeeze detected — watch for breakout");
  if (riskState === "HIGH_VOLATILITY") alerts.push("⚠️ Elevated volatility — reduce position size");
  if (alignedTF < 2) alerts.push("⚠️ Timeframe misalignment — lower conviction");
  if (!macroData?.live) alerts.push("ℹ️ Macro data unavailable — DXY/yield not factored");
  if (Math.abs(categoryScores.trend - categoryScores.momentum) > 40) {
    alerts.push("⚠️ Trend/Momentum divergence detected");
  }
  if (tradeQuality === "A_PLUS") alerts.push("🟢 A+ setup detected — high conviction entry");

  // Data quality
  const dataQuality = macroData?.live && bars4h && bars4h.length > 26
    ? "full"
    : bars1h && bars1h.length > 20
      ? "degraded"
      : "partial";

  return {
    symbol,
    timestamp: now,
    price: +price.toFixed(2),
    masterBias,
    probabilityUp: +probabilityUp.toFixed(4),
    confidence: +confidence.toFixed(1),
    regime,
    tradeQuality,
    riskState,
    categoryScores,
    timeframeScores,
    indicators: allIndicators,
    scenarios: {
      bull: { trigger: bullTrigger, invalidation: bullInvalidation, targets: bullTargets },
      bear: { trigger: bearTrigger, invalidation: bearInvalidation, targets: bearTargets },
      noTrade: { reason: noTradeReason, conditionToImprove }
    },
    alerts,
    engineVersion: "2.0.0",
    dataQuality
  };
}
