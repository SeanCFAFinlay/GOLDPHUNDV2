// ============================================================
// GOLD V2 — Regime Engine
// Classifies market into explicit actionable states.
// Direction gates: allowBuy / allowSell / noTrade.
// ============================================================

import type {
  Bar, StructureState, SpreadGateState, DataIntegrityState,
  MarketRegimeV2, RegimeState
} from "../types";
import { adx, ema, atr } from "../math/indicators";
import { REGIME } from "../config/thresholds";

// Thresholds (use centralized config)
const ADX_TREND_MIN = REGIME.ADX_TREND_MIN;
const ADX_STRONG_TREND = REGIME.ADX_STRONG_TREND;
const ADX_CHOP = REGIME.ADX_CHOP;
const ATR_EXPANSION_RATIO = REGIME.ATR_EXPANSION_RATIO;
const REVERSAL_CONFIDENCE_MIN = REGIME.REVERSAL_CONFIDENCE_MIN;
const REGIME_CONFIDENCE_TREND = 75;
const REGIME_CONFIDENCE_REVERSAL = 65;
const REGIME_CONFIDENCE_RANGE = 60;

function computeADX(bars: Bar[]): { adxVal: number; plusDI: number; minusDI: number } {
  if (bars.length < 20) return { adxVal: 20, plusDI: 20, minusDI: 20 };
  const h = bars.map(b => b.high);
  const l = bars.map(b => b.low);
  const c = bars.map(b => b.close);
  const result = adx(h, l, c, 14);
  return { adxVal: result.adx, plusDI: result.plusDI, minusDI: result.minusDI };
}

function computeATRRatio(bars: Bar[]): number {
  if (bars.length < 28) return 1;
  const h = bars.map(b => b.high);
  const l = bars.map(b => b.low);
  const c = bars.map(b => b.close);
  const currentATR = atr(h, l, c, 14);
  // Compare to 28-bar historical ATR
  const histBars = bars.slice(0, -14);
  if (histBars.length < 14) return 1;
  const hH = histBars.map(b => b.high);
  const hL = histBars.map(b => b.low);
  const hC = histBars.map(b => b.close);
  const historicalATR = atr(hH, hL, hC, 14);
  return historicalATR > 0 ? currentATR / historicalATR : 1;
}

function computeEMAAlignment(bars: Bar[]): { bullish: boolean; bearish: boolean; neutral: boolean } {
  if (bars.length < 50) return { bullish: false, bearish: false, neutral: true };
  const closes = bars.map(b => b.close);
  const ema20arr = ema(closes, 20);
  const ema50arr = ema(closes, 50);
  const last = closes[closes.length - 1];
  const e20 = ema20arr[ema20arr.length - 1];
  const e50 = ema50arr[ema50arr.length - 1];

  const bullish = last > e20 && e20 > e50;
  const bearish = last < e20 && e20 < e50;
  return { bullish, bearish, neutral: !bullish && !bearish };
}

/**
 * Computes EMA50 slope over the specified period.
 * Returns slope as price change per bar.
 * Positive = uptrend, Negative = downtrend
 */
function computeEmaSlope(bars: Bar[], period = 5): number {
  if (bars.length < 50 + period) return 0;

  const closes = bars.map(b => b.close);
  const ema50Arr = ema(closes, 50);

  if (ema50Arr.length < period) return 0;

  const recentEMA = ema50Arr.slice(-period);
  const firstEMA = recentEMA[0];
  const lastEMA = recentEMA[recentEMA.length - 1];

  return (lastEMA - firstEMA) / period;
}

/**
 * Check if H1 bias aligns with M10 structure
 */
function checkHTFAlignment(structure: StructureState): boolean {
  const h1Bullish = structure.h1Bias === "bullish";
  const h1Bearish = structure.h1Bias === "bearish";
  const m10Bullish = structure.bullishBias || structure.bosUp || structure.chochUp;
  const m10Bearish = structure.bearishBias || structure.bosDown || structure.chochDown;

  // Aligned if both agree on direction
  if (h1Bullish && m10Bullish) return true;
  if (h1Bearish && m10Bearish) return true;
  // Neutral H1 = no conflict
  if (structure.h1Bias === "neutral") return true;

  return false;
}

export function runRegimeEngine(
  bars: Bar[],
  structure: StructureState,
  spreadGate: SpreadGateState,
  dataIntegrity: DataIntegrityState,
): RegimeState {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // --- Hard block conditions ---
  if (!dataIntegrity.feedHealthy) {
    return {
      regime: "unsafe",
      confidence: 0,
      allowBuy: false,
      allowSell: false,
      noTrade: true,
      reasons: ["Data integrity failed: " + dataIntegrity.blockReasons.join("; ")],
      warnings,
      emaSlope: 0,
      htfAligned: false,
    };
  }

  if (!spreadGate.spreadSafe) {
    return {
      regime: "unsafe",
      confidence: 0,
      allowBuy: false,
      allowSell: false,
      noTrade: true,
      reasons: ["Spread unsafe: " + spreadGate.blockReasons.join("; ")],
      warnings,
      emaSlope: 0,
      htfAligned: false,
    };
  }

  // --- Compute indicators ---
  const { adxVal, plusDI, minusDI } = computeADX(bars);
  const atrRatio = computeATRRatio(bars);
  const emaAlignment = computeEMAAlignment(bars);
  const emaSlope = computeEmaSlope(bars);
  const htfAligned = checkHTFAlignment(structure);

  // --- Classify regime ---
  let regime: MarketRegimeV2 = "range";
  let confidence = REGIME_CONFIDENCE_RANGE;

  const isTrending = adxVal >= ADX_TREND_MIN;
  const isStrongTrend = adxVal >= ADX_STRONG_TREND;
  const isChop = adxVal < ADX_CHOP;
  const isExpanding = atrRatio >= ATR_EXPANSION_RATIO;

  // Priority 1: Unsafe
  if (dataIntegrity.qualityScore < 40 || spreadGate.spikeDetected) {
    regime = "unsafe";
    confidence = 30;
    reasons.push("Low data quality or spread spike");
  }
  // Priority 2: Reversal (CHoCH detected with sufficient confidence)
  else if (structure.chochUp && structure.structureConfidence >= REVERSAL_CONFIDENCE_MIN) {
    regime = "bullish_reversal";
    confidence = REGIME_CONFIDENCE_REVERSAL;
    reasons.push(`Bullish CHoCH with ${structure.structureConfidence}% structure confidence`);
  }
  else if (structure.chochDown && structure.structureConfidence >= REVERSAL_CONFIDENCE_MIN) {
    regime = "bearish_reversal";
    confidence = REGIME_CONFIDENCE_REVERSAL;
    reasons.push(`Bearish CHoCH with ${structure.structureConfidence}% structure confidence`);
  }
  // Priority 3: Bullish trend (BOS up + trend indicators + slope check)
  else if (structure.bosUp && isTrending && plusDI > minusDI && emaAlignment.bullish) {
    regime = "bullish_trend";
    // Require minimum EMA slope for full trend confidence
    const slopeOk = emaSlope > REGIME.EMA_SLOPE_BULLISH_MIN;
    confidence = isStrongTrend ? REGIME_CONFIDENCE_TREND + 10 : REGIME_CONFIDENCE_TREND;
    if (!slopeOk) {
      confidence -= 10;
      warnings.push(`Weak EMA50 slope ${emaSlope.toFixed(3)} < ${REGIME.EMA_SLOPE_BULLISH_MIN}`);
    }
    if (!htfAligned) {
      confidence -= 5;
      warnings.push("H1 bias not aligned with M10 structure");
    }
    reasons.push(`Bullish BOS + ADX ${adxVal.toFixed(0)} + EMA alignment`);
  }
  // Priority 4: Bearish trend (slope check included)
  else if (structure.bosDown && isTrending && minusDI > plusDI && emaAlignment.bearish) {
    regime = "bearish_trend";
    const slopeOk = emaSlope < REGIME.EMA_SLOPE_BEARISH_MAX;
    confidence = isStrongTrend ? REGIME_CONFIDENCE_TREND + 10 : REGIME_CONFIDENCE_TREND;
    if (!slopeOk) {
      confidence -= 10;
      warnings.push(`Weak EMA50 slope ${emaSlope.toFixed(3)} > ${REGIME.EMA_SLOPE_BEARISH_MAX}`);
    }
    if (!htfAligned) {
      confidence -= 5;
      warnings.push("H1 bias not aligned with M10 structure");
    }
    reasons.push(`Bearish BOS + ADX ${adxVal.toFixed(0)} + EMA alignment`);
  }
  // Priority 5: Bullish trend (structure alone)
  else if (structure.bullishBias && isTrending) {
    regime = "bullish_trend";
    confidence = REGIME_CONFIDENCE_TREND - 5;
    if (!htfAligned) confidence -= 5;
    reasons.push(`Bullish structure bias + ADX ${adxVal.toFixed(0)}`);
  }
  // Priority 6: Bearish trend (structure alone)
  else if (structure.bearishBias && isTrending) {
    regime = "bearish_trend";
    confidence = REGIME_CONFIDENCE_TREND - 5;
    if (!htfAligned) confidence -= 5;
    reasons.push(`Bearish structure bias + ADX ${adxVal.toFixed(0)}`);
  }
  // Priority 7: Breakout expansion
  else if (isExpanding && (structure.bosUp || structure.bosDown)) {
    regime = "breakout_expansion";
    confidence = 65;
    const dir = structure.bosUp ? "upward" : "downward";
    reasons.push(`Breakout expansion ${dir} + ATR ratio ${atrRatio.toFixed(2)}x`);
  }
  // Priority 8: Bullish sweep (potential reversal, wait for confirmation)
  else if (structure.bullishSweep) {
    regime = "bullish_reversal";
    confidence = 55;
    reasons.push("Bullish sweep of lows detected");
  }
  else if (structure.bearishSweep) {
    regime = "bearish_reversal";
    confidence = 55;
    reasons.push("Bearish sweep of highs detected");
  }
  // Default: Range
  else {
    regime = "range";
    confidence = REGIME_CONFIDENCE_RANGE;
    if (isChop) {
      reasons.push(`Choppy market: ADX ${adxVal.toFixed(0)} < ${ADX_CHOP}`);
    } else {
      reasons.push(`Unclear structure: ADX ${adxVal.toFixed(0)}, no clear BOS/CHoCH`);
    }
  }

  // --- Determine directional permissions ---
  let allowBuy = false;
  let allowSell = false;
  let noTrade = false;

  switch (regime) {
    case "bullish_trend":
      allowBuy = true;
      allowSell = false; // Never sell into confirmed bullish trend
      reasons.push("Sell blocked: confirmed bullish trend");
      break;

    case "bearish_trend":
      allowBuy = false; // Never buy into confirmed bearish trend
      allowSell = true;
      reasons.push("Buy blocked: confirmed bearish trend");
      break;

    case "bullish_reversal":
      allowBuy = true;
      allowSell = false; // CRITICAL: Block sells after bullish shift
      reasons.push("Sell blocked: bullish reversal detected");
      break;

    case "bearish_reversal":
      allowBuy = false; // CRITICAL: Block buys after bearish shift
      allowSell = true;
      reasons.push("Buy blocked: bearish reversal detected");
      break;

    case "breakout_expansion":
      // Allow direction of BOS
      allowBuy = structure.bosUp;
      allowSell = structure.bosDown;
      if (!allowBuy && !allowSell) { allowBuy = true; allowSell = true; } // Unclear direction
      break;

    case "range":
      // In range: allow both directions but with higher quality threshold
      allowBuy = true;
      allowSell = true;
      warnings.push("Range market: require higher entry quality");
      break;

    case "unsafe":
      allowBuy = false;
      allowSell = false;
      noTrade = true;
      break;
  }

  // Final warnings
  if (adxVal < ADX_CHOP && regime !== "unsafe") {
    warnings.push(`Weak trend: ADX ${adxVal.toFixed(0)} (avoid trend-continuation entries)`);
  }
  if (spreadGate.cooldownBarsRemaining > 0) {
    warnings.push(`Spread cooldown: ${spreadGate.cooldownBarsRemaining} bars`);
  }

  return {
    regime,
    confidence,
    allowBuy,
    allowSell,
    noTrade,
    reasons,
    warnings,
    emaSlope,
    htfAligned,
  };
}
