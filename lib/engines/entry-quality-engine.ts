// ============================================================
// GOLD V2 — Entry Quality Engine
// A trade is only valid if ALL conditions are met.
// Prevents entries into major obstacles or low-RR zones.
// ============================================================

import type {
  Bar, RegimeState, StructureState, SpreadGateState,
  IndicatorMatrix, EntryQualityState, ExhaustionTrapState
} from "../types";
import { atr } from "../math/indicators";
import { ENTRY_CONDITIONS } from "../config/thresholds";

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

// ============================================================
// NEW: LOWER HIGH CONFIRMATION CHECK
// ============================================================

/**
 * For short entries: confirms that we have a valid lower high.
 * LH must be at least 0.2 ATR below prior swing high.
 */
function checkLowerHighConfirmed(
  structure: StructureState,
  bars: Bar[],
): { confirmed: boolean; reason?: string } {
  // For sells, we want to see a lower high in structure
  if (!structure.lowerHigh) {
    return { confirmed: false, reason: "No lower high confirmed in structure" };
  }

  // Verify the LH is meaningful (not just noise)
  if (!structure.lastSwingHigh || !structure.prevSwingHigh) {
    return { confirmed: false, reason: "Insufficient swing highs for LH confirmation" };
  }

  const currentATR = computeCurrentATR(bars);
  const lhBuffer = currentATR * ENTRY_CONDITIONS.LH_CONFIRMATION_BUFFER_ATR;
  const difference = structure.prevSwingHigh - structure.lastSwingHigh;

  if (difference < lhBuffer) {
    return {
      confirmed: false,
      reason: `LH not significant: only ${difference.toFixed(2)} below prior (need ${lhBuffer.toFixed(2)})`,
    };
  }

  return { confirmed: true };
}

/**
 * For long entries: confirms that we have a valid higher low.
 * HL must be at least 0.2 ATR above prior swing low.
 */
function checkHigherLowConfirmed(
  structure: StructureState,
  bars: Bar[],
): { confirmed: boolean; reason?: string } {
  if (!structure.higherLow) {
    return { confirmed: false, reason: "No higher low confirmed in structure" };
  }

  if (!structure.lastSwingLow || !structure.prevSwingLow) {
    return { confirmed: false, reason: "Insufficient swing lows for HL confirmation" };
  }

  const currentATR = computeCurrentATR(bars);
  const hlBuffer = currentATR * ENTRY_CONDITIONS.HH_CONFIRMATION_BUFFER_ATR;
  const difference = structure.lastSwingLow - structure.prevSwingLow;

  if (difference < hlBuffer) {
    return {
      confirmed: false,
      reason: `HL not significant: only ${difference.toFixed(2)} above prior (need ${hlBuffer.toFixed(2)})`,
    };
  }

  return { confirmed: true };
}

// ============================================================
// NEW: BREAKDOWN CANDLE VALIDATION
// ============================================================

/**
 * Validates that the entry candle is a proper breakdown candle.
 * For sells: bearish body > 60% of range, close breaks level by 30% ATR
 */
function checkBreakdownCandle(
  bars: Bar[],
  direction: "buy" | "sell",
  structure: StructureState,
): { valid: boolean; reason?: string } {
  if (bars.length < 3) {
    return { valid: false, reason: "Insufficient bars for breakdown validation" };
  }

  const last = bars[bars.length - 1];
  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const bodyPct = range > 0 ? body / range : 0;

  const currentATR = computeCurrentATR(bars);
  const breakBeyond = currentATR * ENTRY_CONDITIONS.BREAKDOWN_CLOSE_BEYOND_ATR_PCT;

  if (direction === "sell") {
    // Bearish breakdown candle
    const isBearish = last.close < last.open;
    if (!isBearish) {
      return { valid: false, reason: "Not a bearish candle" };
    }

    if (bodyPct < ENTRY_CONDITIONS.BREAKDOWN_BODY_MIN_PCT) {
      return {
        valid: false,
        reason: `Weak breakdown: body ${(bodyPct * 100).toFixed(0)}% < ${ENTRY_CONDITIONS.BREAKDOWN_BODY_MIN_PCT * 100}%`,
      };
    }

    // Check if close breaks below the swing low
    if (structure.lastSwingLow && last.close > structure.lastSwingLow - breakBeyond) {
      return { valid: false, reason: "Close not convincingly below swing low" };
    }

    return { valid: true };
  } else {
    // Bullish breakout candle
    const isBullish = last.close > last.open;
    if (!isBullish) {
      return { valid: false, reason: "Not a bullish candle" };
    }

    if (bodyPct < ENTRY_CONDITIONS.BREAKDOWN_BODY_MIN_PCT) {
      return {
        valid: false,
        reason: `Weak breakout: body ${(bodyPct * 100).toFixed(0)}% < ${ENTRY_CONDITIONS.BREAKDOWN_BODY_MIN_PCT * 100}%`,
      };
    }

    if (structure.lastSwingHigh && last.close < structure.lastSwingHigh + breakBeyond) {
      return { valid: false, reason: "Close not convincingly above swing high" };
    }

    return { valid: true };
  }
}

// ============================================================
// NEW: EXHAUSTION TRAP CHECK
// ============================================================

function checkNotInExhaustionTrap(
  exhaustion: ExhaustionTrapState | undefined,
  direction: "buy" | "sell",
): { ok: boolean; reason?: string } {
  if (!exhaustion) {
    return { ok: true };
  }

  if (direction === "sell" && exhaustion.blockShort) {
    return {
      ok: false,
      reason: exhaustion.reasons.find(r => r.includes("Block SHORT")) || "Exhaustion trap blocks short",
    };
  }

  if (direction === "buy" && exhaustion.blockLong) {
    return {
      ok: false,
      reason: exhaustion.reasons.find(r => r.includes("Block LONG")) || "Exhaustion trap blocks long",
    };
  }

  return { ok: true };
}

// ============================================================
// NEW: CONSOLIDATION TRAP CHECK
// ============================================================

function checkNotInConsolidationTrap(
  structure: StructureState,
  exhaustion: ExhaustionTrapState | undefined,
): { ok: boolean; reason?: string } {
  // If we're in consolidation after a large impulse, it's risky to enter continuation
  if (structure.consolidationDetected && exhaustion?.isExhausted) {
    return {
      ok: false,
      reason: `Consolidation trap: ${structure.consolidationBars} bars post-exhaustion`,
    };
  }

  return { ok: true };
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
  exhaustionTrap?: ExhaustionTrapState,
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

  // --- NEW: Lower high / higher low confirmation ---
  if (direction === "sell") {
    const lhCheck = checkLowerHighConfirmed(structure, bars);
    if (!lhCheck.confirmed && lhCheck.reason) {
      reasons.push(lhCheck.reason); // Warning, not block
    }
  } else if (direction === "buy") {
    const hlCheck = checkHigherLowConfirmed(structure, bars);
    if (!hlCheck.confirmed && hlCheck.reason) {
      reasons.push(hlCheck.reason);
    }
  }

  // --- NEW: Breakdown candle validation ---
  const breakdownCheck = checkBreakdownCandle(bars, direction, structure);
  if (!breakdownCheck.valid && breakdownCheck.reason) {
    reasons.push(breakdownCheck.reason);
  }

  // --- NEW: Exhaustion trap check ---
  const exhaustionCheck = checkNotInExhaustionTrap(exhaustionTrap, direction);
  if (!exhaustionCheck.ok && exhaustionCheck.reason) {
    blockReasons.push(exhaustionCheck.reason);
  }

  // --- NEW: Consolidation trap check ---
  const consolidationCheck = checkNotInConsolidationTrap(structure, exhaustionTrap);
  if (!consolidationCheck.ok && consolidationCheck.reason) {
    blockReasons.push(consolidationCheck.reason);
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
