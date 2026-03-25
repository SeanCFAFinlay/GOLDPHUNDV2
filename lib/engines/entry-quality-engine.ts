// ============================================================
// GOLD V2 — Entry Quality Engine
// A trade is only valid if ALL conditions are met.
// Prevents entries into major obstacles or low-RR zones.
// ============================================================

import type {
  Bar, RegimeState, StructureState, SpreadGateState,
  IndicatorMatrix, EntryQualityState
} from "../types";
// Thresholds
const MIN_TARGET_SPACE_ATR = 1.0;      // Target must be at least 1 ATR away
const MIN_RR_AFTER_SPREAD = 1.5;       // Minimum RR after factoring spread cost
const INDICATOR_SUPPORT_MIN = 20;      // Indicator bias must be > 20 in entry direction
const MOMENTUM_CONFIRM_MIN = 15;       // Momentum must support direction by at least 15pts

function computeCurrentATR(bars: Bar[]): number {
  if (bars.length < 15) return 3;
  let tr = 0;
  for (let i = Math.max(1, bars.length - 14); i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    tr += Math.max(hl, hc, lc);
  }
  return tr / 14;
}

function checkTargetSpace(
  direction: "buy" | "sell",
  price: number,
  structure: StructureState,
  currentATR: number,
  prevDayHigh?: number,
  prevDayLow?: number,
): { ok: boolean; reason?: string } {
  const minSpace = currentATR * MIN_TARGET_SPACE_ATR;

  if (direction === "buy") {
    // For buys: target space is distance to nearest resistance
    const resistances = [
      structure.lastSwingHigh,
      structure.prevSwingHigh,
      prevDayHigh,
    ].filter(r => r !== undefined && r > price) as number[];

    if (resistances.length > 0) {
      const nearestResistance = Math.min(...resistances);
      const space = nearestResistance - price;
      if (space < minSpace) {
        return { ok: false, reason: `Buy into resistance at ${nearestResistance.toFixed(2)} (only ${space.toFixed(2)} space, need ${minSpace.toFixed(2)})` };
      }
    }
    // No resistance above = clear space
    return { ok: true };
  } else {
    // For sells: target space is distance to nearest support
    const supports = [
      structure.lastSwingLow,
      structure.prevSwingLow,
      prevDayLow,
    ].filter(s => s !== undefined && s < price) as number[];

    if (supports.length > 0) {
      const nearestSupport = Math.max(...supports);
      const space = price - nearestSupport;
      if (space < minSpace) {
        return { ok: false, reason: `Sell into support at ${nearestSupport.toFixed(2)} (only ${space.toFixed(2)} space, need ${minSpace.toFixed(2)})` };
      }
    }
    return { ok: true };
  }
}

function checkRR(
  direction: "buy" | "sell",
  price: number,
  structure: StructureState,
  spreadPoints: number,
  currentATR: number,
): boolean {
  // Estimate SL as 1 ATR (approximate)
  const slDistance = currentATR;
  // Estimate TP as distance to target
  const tpDistance = currentATR * 2;

  // Spread cost as fraction of ATR
  const spreadATR = spreadPoints / 100; // Convert points to price
  const effectiveTP = tpDistance - spreadATR;
  const effectiveRR = slDistance > 0 ? effectiveTP / slDistance : 0;

  return effectiveRR >= MIN_RR_AFTER_SPREAD;
}

function checkConfirmation(
  direction: "buy" | "sell",
  bars: Bar[],
): boolean {
  if (bars.length < 3) return false;

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  if (direction === "buy") {
    // Confirmation: recent bullish candle (close > open)
    const bullishBody = last.close > last.open;
    const prevLow = prev.low;
    const lastLow = last.low;
    // Not making a new low on confirmation bar
    const noNewLow = lastLow >= prevLow * 0.9998;
    return bullishBody && noNewLow;
  } else {
    // Confirmation: recent bearish candle
    const bearishBody = last.close < last.open;
    const prevHigh = prev.high;
    const lastHigh = last.high;
    const noNewHigh = lastHigh <= prevHigh * 1.0002;
    return bearishBody && noNewHigh;
  }
}

function checkPullbackValid(
  direction: "buy" | "sell",
  bars: Bar[],
  structure: StructureState,
  indicatorMatrix: IndicatorMatrix,
): boolean {
  // For a long: ideally price has pulled back (not extended from EMA)
  // For a short: ideally price has bounced up (not over-extended down)
  // Use indicator overallBias to gauge extension
  const bias = indicatorMatrix.overallBias;

  if (direction === "buy") {
    // Don't buy when already heavily overbought (bias > 80)
    return bias < 80;
  } else {
    // Don't sell when already heavily oversold (bias < -80)
    return bias > -80;
  }
}

export function runEntryQualityEngine(
  direction: "buy" | "sell" | null,
  bars: Bar[],
  regime: RegimeState,
  structure: StructureState,
  spreadGate: SpreadGateState,
  indicatorMatrix: IndicatorMatrix,
  prevDayHigh?: number,
  prevDayLow?: number,
): EntryQualityState {
  const blockReasons: string[] = [];
  const reasons: string[] = [];

  const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
  const currentATR = computeCurrentATR(bars);

  // Default: no direction = no trade
  if (!direction) {
    return {
      canBuy: false, canSell: false,
      entryQualityScore: 0,
      targetSpaceOk: false, rrOk: false, confirmationOk: false, pullbackValid: false,
      reasons: ["No direction"],
      blockReasons: ["No trade direction"],
    };
  }

  // --- Check regime permits this direction ---
  if (direction === "buy" && !regime.allowBuy) {
    blockReasons.push(...regime.reasons.filter(r => r.toLowerCase().includes("buy") || r.toLowerCase().includes("blocked")));
    if (blockReasons.length === 0) blockReasons.push("Regime blocks BUY");
  }
  if (direction === "sell" && !regime.allowSell) {
    blockReasons.push(...regime.reasons.filter(r => r.toLowerCase().includes("sell") || r.toLowerCase().includes("blocked")));
    if (blockReasons.length === 0) blockReasons.push("Regime blocks SELL");
  }

  // --- Check indicator support ---
  const indicatorSupportsDirection = direction === "buy"
    ? indicatorMatrix.overallBias >= INDICATOR_SUPPORT_MIN
    : indicatorMatrix.overallBias <= -INDICATOR_SUPPORT_MIN;

  if (!indicatorSupportsDirection) {
    blockReasons.push(`Indicator matrix (${indicatorMatrix.overallBias.toFixed(0)}) doesn't support ${direction.toUpperCase()}`);
  }

  // --- Momentum confirmation ---
  const momentumConfirms = direction === "buy"
    ? indicatorMatrix.momentumScore >= MOMENTUM_CONFIRM_MIN
    : indicatorMatrix.momentumScore <= -MOMENTUM_CONFIRM_MIN;

  if (!momentumConfirms) {
    reasons.push(`Momentum ${indicatorMatrix.momentumScore.toFixed(0)} below threshold for ${direction}`);
  }

  // --- Target space ---
  const spaceCheck = checkTargetSpace(direction, currentPrice, structure, currentATR, prevDayHigh, prevDayLow);
  const targetSpaceOk = spaceCheck.ok;
  if (!spaceCheck.ok && spaceCheck.reason) {
    blockReasons.push(spaceCheck.reason);
  }

  // --- RR after spread ---
  const rrOk = checkRR(direction, currentPrice, structure, spreadGate.spreadPoints, currentATR);
  if (!rrOk) {
    blockReasons.push(`RR insufficient after spread cost (${spreadGate.spreadPoints}pts)`);
  }

  // --- Confirmation candle ---
  const confirmationOk = checkConfirmation(direction, bars);
  if (!confirmationOk) {
    reasons.push("No confirmation candle yet");
  }

  // --- Pullback validity (not over-extended) ---
  const pullbackValid = checkPullbackValid(direction, bars, structure, indicatorMatrix);
  if (!pullbackValid) {
    blockReasons.push("Entry over-extended, wait for pullback");
  }

  // --- Divergence warnings ---
  if (indicatorMatrix.divergenceWarnings.length > 0) {
    const adverseDivergences = indicatorMatrix.divergenceWarnings.filter(w => {
      if (direction === "buy" && w.toLowerCase().includes("bearish")) return true;
      if (direction === "sell" && w.toLowerCase().includes("bullish")) return true;
      return false;
    });
    if (adverseDivergences.length > 0) {
      blockReasons.push(...adverseDivergences.map(d => `Adverse divergence: ${d}`));
    }
  }

  // --- Entry quality score ---
  let qualityScore = 100;
  qualityScore -= blockReasons.length * 20;
  qualityScore -= reasons.length * 10;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  const canBuy = direction === "buy" && blockReasons.length === 0;
  const canSell = direction === "sell" && blockReasons.length === 0;

  return {
    canBuy,
    canSell,
    entryQualityScore: qualityScore,
    targetSpaceOk,
    rrOk,
    confirmationOk,
    pullbackValid,
    reasons,
    blockReasons,
  };
}
