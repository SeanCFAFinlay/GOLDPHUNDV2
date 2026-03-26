// ============================================================
// GOLD V2 — Exhaustion & Anti-Trap Engine
// Prevents false continuation entries during exhaustion,
// consolidation, and reversal transitions.
// ============================================================

import type { Bar, StructureState, RegimeState, IndicatorMatrix, ExhaustionTrapState } from "../types";
import { atr, ema, rsi, macd } from "../math/indicators";
import { EXHAUSTION, ANTI_TRAP, TRAP_SCORE_WEIGHTS } from "../config/thresholds";

// ============================================================
// IMPULSE MOVE DETECTION
// ============================================================

interface ImpulseResult {
  detected: boolean;
  direction: "up" | "down" | null;
  size: number; // ATR multiple
  isExtreme: boolean;
  isLarge: boolean;
}

/**
 * Measures recent move size vs ATR to detect impulse moves.
 * Looks at the recent N bars to find directional price moves.
 */
function detectImpulseMove(bars: Bar[], lookback = 10): ImpulseResult {
  if (bars.length < lookback + 14) {
    return { detected: false, direction: null, size: 0, isExtreme: false, isLarge: false };
  }

  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const closes = bars.map(b => b.close);

  const currentATR = atr(highs, lows, closes, 14);
  if (currentATR <= 0) {
    return { detected: false, direction: null, size: 0, isExtreme: false, isLarge: false };
  }

  // Find the high/low range over the lookback period
  const recentBars = bars.slice(-lookback);
  const highestHigh = Math.max(...recentBars.map(b => b.high));
  const lowestLow = Math.min(...recentBars.map(b => b.low));
  const moveRange = highestHigh - lowestLow;
  const moveSize = moveRange / currentATR;

  // Determine direction by comparing start and end of the period
  const startPrice = recentBars[0].close;
  const endPrice = recentBars[recentBars.length - 1].close;
  const priceChange = endPrice - startPrice;
  const changeATR = Math.abs(priceChange) / currentATR;

  // Need significant directional move
  const minDirectionalMove = 1.0; // At least 1 ATR directional move
  if (changeATR < minDirectionalMove) {
    return { detected: false, direction: null, size: moveSize, isExtreme: false, isLarge: false };
  }

  const direction: "up" | "down" = priceChange > 0 ? "up" : "down";
  const isExtreme = moveSize >= EXHAUSTION.IMPULSE_SIZE_EXTREME_ATR;
  const isLarge = moveSize >= EXHAUSTION.IMPULSE_SIZE_LARGE_ATR;

  return {
    detected: isLarge || isExtreme,
    direction,
    size: moveSize,
    isExtreme,
    isLarge,
  };
}

// ============================================================
// CONSOLIDATION DETECTION
// ============================================================

interface ConsolidationResult {
  inConsolidation: boolean;
  bars: number;
  rangeATR: number;
}

/**
 * Identifies post-impulse sideways action.
 * Consolidation = price range < threshold ATR for min bars.
 */
function detectConsolidation(bars: Bar[], minBars = EXHAUSTION.CONSOLIDATION_MIN_BARS): ConsolidationResult {
  if (bars.length < minBars + 14) {
    return { inConsolidation: false, bars: 0, rangeATR: 0 };
  }

  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const closes = bars.map(b => b.close);
  const currentATR = atr(highs, lows, closes, 14);

  if (currentATR <= 0) {
    return { inConsolidation: false, bars: 0, rangeATR: 0 };
  }

  // Check the most recent bars for consolidation
  let consolidationBars = 0;
  for (let i = bars.length - 1; i >= Math.max(0, bars.length - 20); i--) {
    const lookbackStart = Math.max(0, i - minBars + 1);
    const window = bars.slice(lookbackStart, i + 1);
    if (window.length < minBars) break;

    const windowHigh = Math.max(...window.map(b => b.high));
    const windowLow = Math.min(...window.map(b => b.low));
    const windowRange = windowHigh - windowLow;
    const rangeATR = windowRange / currentATR;

    if (rangeATR < EXHAUSTION.CONSOLIDATION_RANGE_ATR) {
      consolidationBars++;
    } else {
      break;
    }
  }

  const recentWindow = bars.slice(-minBars);
  const recentHigh = Math.max(...recentWindow.map(b => b.high));
  const recentLow = Math.min(...recentWindow.map(b => b.low));
  const recentRangeATR = (recentHigh - recentLow) / currentATR;

  return {
    inConsolidation: consolidationBars >= minBars && recentRangeATR < EXHAUSTION.CONSOLIDATION_RANGE_ATR,
    bars: consolidationBars,
    rangeATR: recentRangeATR,
  };
}

// ============================================================
// EMA/VWAP RECLAIM DETECTION
// ============================================================

interface ReclaimResult {
  emaReclaimed: boolean;
  vwapReclaimed: boolean;
  ema20: number;
  vwap: number;
}

/**
 * Detects if price has reclaimed EMA20 or VWAP after an impulse.
 */
function detectReclaims(bars: Bar[], impulseDirection: "up" | "down" | null): ReclaimResult {
  if (bars.length < 20 || !impulseDirection) {
    return { emaReclaimed: false, vwapReclaimed: false, ema20: 0, vwap: 0 };
  }

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const currentPrice = closes[closes.length - 1];

  // EMA20
  const ema20Arr = ema(closes, 20);
  const ema20 = ema20Arr[ema20Arr.length - 1];

  // Simple VWAP (using volume = 1 for each bar as approximation)
  let cumVol = 0, cumTP = 0;
  for (let i = 0; i < bars.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumVol += 1;
    cumTP += tp;
  }
  const vwapVal = cumVol > 0 ? cumTP / cumVol : currentPrice;

  // Reclaim logic depends on impulse direction
  let emaReclaimed = false;
  let vwapReclaimed = false;

  if (impulseDirection === "down") {
    // After bearish impulse, reclaim = price crosses back ABOVE EMA20/VWAP
    emaReclaimed = currentPrice > ema20;
    vwapReclaimed = currentPrice > vwapVal;
  } else if (impulseDirection === "up") {
    // After bullish impulse, reclaim = price crosses back BELOW EMA20/VWAP
    emaReclaimed = currentPrice < ema20;
    vwapReclaimed = currentPrice < vwapVal;
  }

  return {
    emaReclaimed,
    vwapReclaimed,
    ema20,
    vwap: vwapVal,
  };
}

// ============================================================
// DIVERGENCE DETECTION
// ============================================================

interface DivergenceResult {
  bullishDivergence: boolean;
  bearishDivergence: boolean;
  rsiValues: number[];
  priceValues: number[];
}

/**
 * Detects RSI/price divergence for anti-trap signals.
 * Bullish divergence: price makes LL but RSI makes HL
 * Bearish divergence: price makes HH but RSI makes LH
 */
function detectDivergence(bars: Bar[], lookback = ANTI_TRAP.DIVERGENCE_LOOKBACK_BARS): DivergenceResult {
  if (bars.length < lookback + 14) {
    return { bullishDivergence: false, bearishDivergence: false, rsiValues: [], priceValues: [] };
  }

  const closes = bars.map(b => b.close);
  const recentBars = bars.slice(-lookback);
  const rsiValues: number[] = [];

  // Calculate RSI at each point in the lookback
  for (let i = bars.length - lookback; i < bars.length; i++) {
    const closesUpTo = closes.slice(0, i + 1);
    rsiValues.push(rsi(closesUpTo, 14));
  }

  const priceValues = recentBars.map(b => b.close);

  // Find swing lows and highs in the lookback period
  let bullishDivergence = false;
  let bearishDivergence = false;

  // Look for at least 2 swing points to compare
  const swingLowIndices: number[] = [];
  const swingHighIndices: number[] = [];

  for (let i = 1; i < priceValues.length - 1; i++) {
    if (priceValues[i] < priceValues[i - 1] && priceValues[i] < priceValues[i + 1]) {
      swingLowIndices.push(i);
    }
    if (priceValues[i] > priceValues[i - 1] && priceValues[i] > priceValues[i + 1]) {
      swingHighIndices.push(i);
    }
  }

  // Check for bullish divergence (price LL, RSI HL)
  if (swingLowIndices.length >= 2) {
    const lastIdx = swingLowIndices[swingLowIndices.length - 1];
    const prevIdx = swingLowIndices[swingLowIndices.length - 2];

    const priceMakesLL = priceValues[lastIdx] < priceValues[prevIdx];
    const rsiMakesHL = rsiValues[lastIdx] > rsiValues[prevIdx] + ANTI_TRAP.DIVERGENCE_RSI_THRESHOLD;

    bullishDivergence = priceMakesLL && rsiMakesHL;
  }

  // Check for bearish divergence (price HH, RSI LH)
  if (swingHighIndices.length >= 2) {
    const lastIdx = swingHighIndices[swingHighIndices.length - 1];
    const prevIdx = swingHighIndices[swingHighIndices.length - 2];

    const priceMakesHH = priceValues[lastIdx] > priceValues[prevIdx];
    const rsiMakesLH = rsiValues[lastIdx] < rsiValues[prevIdx] - ANTI_TRAP.DIVERGENCE_RSI_THRESHOLD;

    bearishDivergence = priceMakesHH && rsiMakesLH;
  }

  return {
    bullishDivergence,
    bearishDivergence,
    rsiValues,
    priceValues,
  };
}

// ============================================================
// EMA SLOPE CALCULATION
// ============================================================

/**
 * Computes EMA50 slope over the specified period.
 * Returns slope as price change per bar.
 */
export function computeEmaSlope(bars: Bar[], period = 5): number {
  if (bars.length < 50 + period) return 0;

  const closes = bars.map(b => b.close);
  const ema50Arr = ema(closes, 50);

  if (ema50Arr.length < period) return 0;

  const recentEMA = ema50Arr.slice(-period);
  const firstEMA = recentEMA[0];
  const lastEMA = recentEMA[recentEMA.length - 1];

  return (lastEMA - firstEMA) / period;
}

// ============================================================
// TRAP SCORE CALCULATION
// ============================================================

function calculateTrapScore(
  impulse: ImpulseResult,
  consolidation: ConsolidationResult,
  reclaims: ReclaimResult,
  divergence: DivergenceResult,
  emaSlope: number,
  impulseDirection: "up" | "down" | null,
): number {
  let score = 0;

  // Impulse contribution
  if (impulse.isExtreme) {
    score += TRAP_SCORE_WEIGHTS.EXTREME_IMPULSE;
  } else if (impulse.isLarge) {
    score += TRAP_SCORE_WEIGHTS.LARGE_IMPULSE;
  }

  // Consolidation contribution
  if (consolidation.inConsolidation) {
    score += TRAP_SCORE_WEIGHTS.CONSOLIDATION;
  }

  // Reclaim contribution
  if (reclaims.emaReclaimed) {
    score += TRAP_SCORE_WEIGHTS.EMA_RECLAIM;
  }
  if (reclaims.vwapReclaimed) {
    score += TRAP_SCORE_WEIGHTS.VWAP_RECLAIM;
  }

  // Divergence contribution
  if (impulseDirection === "down" && divergence.bullishDivergence) {
    score += TRAP_SCORE_WEIGHTS.DIVERGENCE;
  }
  if (impulseDirection === "up" && divergence.bearishDivergence) {
    score += TRAP_SCORE_WEIGHTS.DIVERGENCE;
  }

  // Weak slope contribution (counter to impulse direction)
  if (impulseDirection === "down" && emaSlope > -ANTI_TRAP.EMA_SLOPE_MIN) {
    score += TRAP_SCORE_WEIGHTS.WEAK_SLOPE;
  }
  if (impulseDirection === "up" && emaSlope < ANTI_TRAP.EMA_SLOPE_MIN) {
    score += TRAP_SCORE_WEIGHTS.WEAK_SLOPE;
  }

  return Math.min(100, score);
}

// ============================================================
// MAIN EXHAUSTION TRAP ENGINE
// ============================================================

export function runExhaustionTrapEngine(
  bars: Bar[],
  structure: StructureState,
  regime: RegimeState,
  indicatorMatrix: IndicatorMatrix,
): ExhaustionTrapState {
  const reasons: string[] = [];

  // Default state (no trap detected)
  if (!bars || bars.length < 30) {
    return {
      impulseDetected: false,
      impulseDirection: null,
      impulseSize: 0,
      isExhausted: false,
      inConsolidation: false,
      consolidationBars: 0,
      emaReclaimed: false,
      vwapReclaimed: false,
      bullishDivergence: false,
      bearishDivergence: false,
      blockShort: false,
      blockLong: false,
      reasons: ["Insufficient data for exhaustion analysis"],
      trapScore: 0,
    };
  }

  // Step 1: Detect impulse move
  const impulse = detectImpulseMove(bars);

  // Step 2: Detect consolidation
  const consolidation = detectConsolidation(bars);

  // Step 3: Detect reclaims
  const reclaims = detectReclaims(bars, impulse.direction);

  // Step 4: Detect divergence
  const divergence = detectDivergence(bars);

  // Step 5: Compute EMA slope
  const emaSlope = computeEmaSlope(bars);

  // Step 6: Calculate trap score
  const trapScore = calculateTrapScore(
    impulse,
    consolidation,
    reclaims,
    divergence,
    emaSlope,
    impulse.direction,
  );

  // Step 7: Determine blocking conditions
  let blockShort = false;
  let blockLong = false;

  // Get current RSI for momentum check
  const closes = bars.map(b => b.close);
  const currentRSI = rsi(closes, 14);

  // BLOCK_SHORT conditions (after bearish exhaustion)
  if (impulse.direction === "down" && impulse.isExtreme) {
    if (consolidation.inConsolidation || reclaims.emaReclaimed || reclaims.vwapReclaimed) {
      // Check if there's a fresh bearish BOS to re-confirm continuation
      if (!structure.bosDown) {
        blockShort = true;
        reasons.push(`Block SHORT: Bearish exhaustion (${impulse.size.toFixed(1)} ATR) + no fresh BOS`);
      }
    }
  }

  // Block short on bullish divergence
  if (divergence.bullishDivergence) {
    blockShort = true;
    reasons.push("Block SHORT: Bullish divergence detected");
  }

  // Block short on EMA reclaim with positive momentum
  if (impulse.direction === "down" && reclaims.emaReclaimed && currentRSI > ANTI_TRAP.RECLAIM_RSI_THRESHOLD) {
    blockShort = true;
    reasons.push(`Block SHORT: EMA20 reclaimed + RSI ${currentRSI.toFixed(0)} > ${ANTI_TRAP.RECLAIM_RSI_THRESHOLD}`);
  }

  // BLOCK_LONG conditions (after bullish exhaustion)
  if (impulse.direction === "up" && impulse.isExtreme) {
    if (consolidation.inConsolidation || reclaims.emaReclaimed || reclaims.vwapReclaimed) {
      if (!structure.bosUp) {
        blockLong = true;
        reasons.push(`Block LONG: Bullish exhaustion (${impulse.size.toFixed(1)} ATR) + no fresh BOS`);
      }
    }
  }

  // Block long on bearish divergence
  if (divergence.bearishDivergence) {
    blockLong = true;
    reasons.push("Block LONG: Bearish divergence detected");
  }

  // Block long on EMA reclaim with negative momentum
  if (impulse.direction === "up" && reclaims.emaReclaimed && currentRSI < (100 - ANTI_TRAP.RECLAIM_RSI_THRESHOLD)) {
    blockLong = true;
    reasons.push(`Block LONG: EMA20 reclaimed + RSI ${currentRSI.toFixed(0)} < ${100 - ANTI_TRAP.RECLAIM_RSI_THRESHOLD}`);
  }

  // Add informational notes
  if (impulse.detected) {
    reasons.push(`Impulse ${impulse.direction}: ${impulse.size.toFixed(1)} ATR${impulse.isExtreme ? " (EXTREME)" : impulse.isLarge ? " (LARGE)" : ""}`);
  }
  if (consolidation.inConsolidation) {
    reasons.push(`In consolidation: ${consolidation.bars} bars, range ${consolidation.rangeATR.toFixed(2)} ATR`);
  }
  if (reclaims.emaReclaimed) {
    reasons.push(`EMA20 reclaimed at ${reclaims.ema20.toFixed(2)}`);
  }
  if (reclaims.vwapReclaimed) {
    reasons.push(`VWAP reclaimed at ${reclaims.vwap.toFixed(2)}`);
  }

  return {
    impulseDetected: impulse.detected,
    impulseDirection: impulse.direction,
    impulseSize: impulse.size,
    isExhausted: impulse.isExtreme,
    inConsolidation: consolidation.inConsolidation,
    consolidationBars: consolidation.bars,
    emaReclaimed: reclaims.emaReclaimed,
    vwapReclaimed: reclaims.vwapReclaimed,
    bullishDivergence: divergence.bullishDivergence,
    bearishDivergence: divergence.bearishDivergence,
    blockShort,
    blockLong,
    reasons,
    trapScore,
  };
}
