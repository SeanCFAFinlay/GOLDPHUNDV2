// ============================================================
// GOLD V2 — Risk Governor
// Hard trade governance. No execution path bypasses this.
// Enforces: wrong-side freeze, directional limits, drawdown lock.
// ============================================================

import type {
  TradeRecord, RegimeState, RiskGovernorState
} from "../types";
import { RISK_LIMITS } from "../config/thresholds";

// Configuration
const MAX_TRADES_PER_DIRECTION = 2;        // Max open trades in one direction
const MAX_TOTAL_OPEN_TRADES = 3;           // Hard limit on total open positions
const MIN_SPACING_SAME_DIR_MIN = 10;       // Min minutes between same-direction adds
const WRONG_SIDE_CONFIDENCE_THRESHOLD = 65; // Regime confidence needed to trigger freeze
const DAILY_LOSS_LOCK_PCT = 3.0;           // Freeze all entries if daily loss exceeds this %

// ============================================================
// WRONG-SIDE BASKET DETECTION
// ============================================================

function detectWrongSideBasket(
  openTrades: TradeRecord[],
  regime: RegimeState,
): {
  wrongSideFreeze: boolean;
  direction?: "buy" | "sell";
  reasons: string[];
} {
  const openBuys = openTrades.filter(t => t.direction === "buy" && t.status === "filled");
  const openSells = openTrades.filter(t => t.direction === "sell" && t.status === "filled");
  const reasons: string[] = [];

  // CRITICAL: If there are open sells and market is bullish
  if (openSells.length > 0 && (regime.regime === "bullish_trend" || regime.regime === "bullish_reversal")) {
    if (regime.confidence >= WRONG_SIDE_CONFIDENCE_THRESHOLD) {
      reasons.push(`Wrong-side freeze: ${openSells.length} open sell(s) but regime is ${regime.regime} (${regime.confidence}% confidence)`);
      return { wrongSideFreeze: true, direction: "sell", reasons };
    }
  }

  // CRITICAL: If there are open buys and market is bearish
  if (openBuys.length > 0 && (regime.regime === "bearish_trend" || regime.regime === "bearish_reversal")) {
    if (regime.confidence >= WRONG_SIDE_CONFIDENCE_THRESHOLD) {
      reasons.push(`Wrong-side freeze: ${openBuys.length} open buy(s) but regime is ${regime.regime} (${regime.confidence}% confidence)`);
      return { wrongSideFreeze: true, direction: "buy", reasons };
    }
  }

  return { wrongSideFreeze: false, reasons };
}

// ============================================================
// DIRECTIONAL EXPOSURE LIMITS
// ============================================================

function checkDirectionalLimits(
  openTrades: TradeRecord[],
  direction: "buy" | "sell",
): { exceeded: boolean; count: number; reason?: string } {
  const count = openTrades.filter(t => t.direction === direction && t.status === "filled").length;
  if (count >= MAX_TRADES_PER_DIRECTION) {
    return {
      exceeded: true,
      count,
      reason: `Max ${direction.toUpperCase()} trades reached: ${count}/${MAX_TRADES_PER_DIRECTION}`,
    };
  }
  return { exceeded: false, count };
}

// ============================================================
// TRADE SPACING ENFORCEMENT
// ============================================================

function checkMinSpacing(
  openTrades: TradeRecord[],
  direction: "buy" | "sell",
): { tooSoon: boolean; minutesAgo?: number; reason?: string } {
  const sameDirTrades = openTrades
    .filter(t => t.direction === direction && t.status === "filled")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (sameDirTrades.length === 0) return { tooSoon: false };

  const lastTradeTime = new Date(sameDirTrades[0].timestamp).getTime();
  const minutesAgo = (Date.now() - lastTradeTime) / 60000;

  if (minutesAgo < MIN_SPACING_SAME_DIR_MIN) {
    return {
      tooSoon: true,
      minutesAgo,
      reason: `Min spacing not met: last ${direction} was ${minutesAgo.toFixed(1)}m ago (min ${MIN_SPACING_SAME_DIR_MIN}m)`,
    };
  }
  return { tooSoon: false, minutesAgo };
}

// ============================================================
// DAILY LOSS LOCK
// ============================================================

function checkDailyLossLock(
  dailyPnL: number,
  balance: number,
): { locked: boolean; pct: number; reason?: string } {
  if (balance <= 0 || dailyPnL >= 0) return { locked: false, pct: 0 };
  const lossPct = Math.abs(dailyPnL) / balance * 100;
  if (lossPct >= DAILY_LOSS_LOCK_PCT) {
    return {
      locked: true,
      pct: lossPct,
      reason: `Daily loss lock: ${lossPct.toFixed(1)}% loss (limit ${DAILY_LOSS_LOCK_PCT}%)`,
    };
  }
  return { locked: false, pct: lossPct };
}

// ============================================================
// REGIME INVALIDATION FREEZE
// ============================================================

function checkRegimeInvalidation(regime: RegimeState): boolean {
  // Freeze all entries when regime is unsafe or confidence too low
  return regime.regime === "unsafe" || regime.noTrade;
}

// ============================================================
// PROFIT LOCK CHECK
// ============================================================

/**
 * Check if existing same-direction trades are in sufficient profit
 * before allowing new same-direction entry (profit lock).
 */
function checkProfitLock(
  openTrades: TradeRecord[],
  direction: "buy" | "sell",
): { required: boolean; allowed: boolean; reason?: string } {
  const sameDirTrades = openTrades.filter(
    t => t.direction === direction && t.status === "filled"
  );

  // No existing trades = no profit lock required
  if (sameDirTrades.length === 0) {
    return { required: false, allowed: true };
  }

  // Check if all existing trades are at least MIN_R profit
  for (const trade of sameDirTrades) {
    const riskAmount = Math.abs(trade.entry_price - trade.sl);
    if (riskAmount <= 0) continue;

    const currentProfit = trade.profit || 0;
    const entryRisk = riskAmount * trade.volume;
    const rMultiple = entryRisk > 0 ? currentProfit / entryRisk : 0;

    if (rMultiple < RISK_LIMITS.PROFIT_LOCK_MIN_R) {
      return {
        required: true,
        allowed: false,
        reason: `Profit lock: existing ${direction} at ${rMultiple.toFixed(2)}R (need ${RISK_LIMITS.PROFIT_LOCK_MIN_R}R)`,
      };
    }
  }

  return { required: true, allowed: true };
}

// ============================================================
// STOP SIZE VALIDATION
// ============================================================

/**
 * Validate that the stop loss distance doesn't exceed max percentage of account.
 */
function checkStopSizeValid(
  slDistance: number,
  balance: number,
  riskPct: number,
  lotSize: number,
): { valid: boolean; maxAllowed: number; reason?: string } {
  if (balance <= 0 || slDistance <= 0) {
    return { valid: true, maxAllowed: 0 };
  }

  // Calculate the risk in dollars for this SL distance
  // Assuming standard lot size for gold (100 oz)
  const pipValue = 0.01; // Simplified, actual would depend on lot size
  const riskDollars = slDistance * lotSize * 100; // Approximate for gold
  const riskPctActual = (riskDollars / balance) * 100;

  const maxAllowed = balance * (RISK_LIMITS.STOP_SIZE_MAX_PCT / 100);

  if (riskPctActual > RISK_LIMITS.STOP_SIZE_MAX_PCT) {
    return {
      valid: false,
      maxAllowed,
      reason: `Stop size exceeds limit: ${riskPctActual.toFixed(2)}% > ${RISK_LIMITS.STOP_SIZE_MAX_PCT}%`,
    };
  }

  return { valid: true, maxAllowed };
}

// ============================================================
// MAIN RISK GOVERNOR
// ============================================================

export function runRiskGovernor(
  openTrades: TradeRecord[],
  regime: RegimeState,
  dailyPnL: number,
  balance: number,
  proposedSlDistance?: number,
  proposedDirection?: "buy" | "sell",
  proposedLotSize?: number,
): RiskGovernorState {
  const reasons: string[] = [];

  const openBuys = openTrades.filter(t => t.direction === "buy" && t.status === "filled").length;
  const openSells = openTrades.filter(t => t.direction === "sell" && t.status === "filled").length;
  const totalOpen = openBuys + openSells;

  // Wrong-side basket detection
  const wrongSide = detectWrongSideBasket(openTrades, regime);
  if (wrongSide.wrongSideFreeze) reasons.push(...wrongSide.reasons);

  // NEW: Profit lock checks
  let profitLockRequired = false;
  let buyProfitLockBlocked = false;
  let sellProfitLockBlocked = false;

  const buyProfitLock = checkProfitLock(openTrades, "buy");
  if (buyProfitLock.required) {
    profitLockRequired = true;
    if (!buyProfitLock.allowed && buyProfitLock.reason) {
      buyProfitLockBlocked = true;
      reasons.push(buyProfitLock.reason);
    }
  }

  const sellProfitLock = checkProfitLock(openTrades, "sell");
  if (sellProfitLock.required) {
    profitLockRequired = true;
    if (!sellProfitLock.allowed && sellProfitLock.reason) {
      sellProfitLockBlocked = true;
      reasons.push(sellProfitLock.reason);
    }
  }

  // NEW: Stop size validation
  let stopSizeExceedsLimit = false;
  if (proposedSlDistance && proposedSlDistance > 0) {
    const stopCheck = checkStopSizeValid(
      proposedSlDistance,
      balance,
      RISK_LIMITS.MAX_RISK_PCT,
      proposedLotSize || 0.01,
    );
    if (!stopCheck.valid && stopCheck.reason) {
      stopSizeExceedsLimit = true;
      reasons.push(stopCheck.reason);
    }
  }

  // Daily loss lock
  const dailyLoss = checkDailyLossLock(dailyPnL, balance);
  if (dailyLoss.locked && dailyLoss.reason) reasons.push(dailyLoss.reason);

  // Regime invalidation
  const regimeFreeze = checkRegimeInvalidation(regime);
  if (regimeFreeze) reasons.push(`Regime invalidation: ${regime.regime}`);

  // Max total exposure
  const maxExposureReached = totalOpen >= MAX_TOTAL_OPEN_TRADES;
  if (maxExposureReached) reasons.push(`Max total trades reached: ${totalOpen}/${MAX_TOTAL_OPEN_TRADES}`);

  // Directional limits
  const buyLimits = checkDirectionalLimits(openTrades, "buy");
  const sellLimits = checkDirectionalLimits(openTrades, "sell");

  // Trade spacing
  const buySpacing = checkMinSpacing(openTrades, "buy");
  const sellSpacing = checkMinSpacing(openTrades, "sell");

  // Compile buy blocks
  let blockBuy = false;
  const buyBlockReasons: string[] = [];

  if (wrongSide.wrongSideFreeze && wrongSide.direction === "buy") {
    blockBuy = true;
    buyBlockReasons.push(...wrongSide.reasons);
  }
  if (dailyLoss.locked) {
    blockBuy = true;
    buyBlockReasons.push(dailyLoss.reason!);
  }
  if (regimeFreeze) {
    blockBuy = true;
    buyBlockReasons.push(`Regime unsafe for BUY`);
  }
  if (maxExposureReached) {
    blockBuy = true;
    buyBlockReasons.push(`Max exposure reached`);
  }
  if (buyLimits.exceeded) {
    blockBuy = true;
    buyBlockReasons.push(buyLimits.reason!);
  }
  if (buySpacing.tooSoon) {
    blockBuy = true;
    buyBlockReasons.push(buySpacing.reason!);
  }
  if (!regime.allowBuy) {
    blockBuy = true;
    buyBlockReasons.push(`Regime (${regime.regime}) does not allow BUY`);
  }
  // NEW: Profit lock block
  if (buyProfitLockBlocked) {
    blockBuy = true;
    buyBlockReasons.push(buyProfitLock.reason!);
  }
  // NEW: Stop size block (if direction is buy)
  if (proposedDirection === "buy" && stopSizeExceedsLimit) {
    blockBuy = true;
    buyBlockReasons.push("Stop size exceeds account limit");
  }

  // Compile sell blocks
  let blockSell = false;
  const sellBlockReasons: string[] = [];

  if (wrongSide.wrongSideFreeze && wrongSide.direction === "sell") {
    blockSell = true;
    sellBlockReasons.push(...wrongSide.reasons);
  }
  if (dailyLoss.locked) {
    blockSell = true;
    sellBlockReasons.push(dailyLoss.reason!);
  }
  if (regimeFreeze) {
    blockSell = true;
    sellBlockReasons.push(`Regime unsafe for SELL`);
  }
  if (maxExposureReached) {
    blockSell = true;
    sellBlockReasons.push(`Max exposure reached`);
  }
  if (sellLimits.exceeded) {
    blockSell = true;
    sellBlockReasons.push(sellLimits.reason!);
  }
  if (sellSpacing.tooSoon) {
    blockSell = true;
    sellBlockReasons.push(sellSpacing.reason!);
  }
  if (!regime.allowSell) {
    blockSell = true;
    sellBlockReasons.push(`Regime (${regime.regime}) does not allow SELL`);
  }
  // NEW: Profit lock block
  if (sellProfitLockBlocked) {
    blockSell = true;
    sellBlockReasons.push(sellProfitLock.reason!);
  }
  // NEW: Stop size block (if direction is sell)
  if (proposedDirection === "sell" && stopSizeExceedsLimit) {
    blockSell = true;
    sellBlockReasons.push("Stop size exceeds account limit");
  }

  const blockAllEntries = dailyLoss.locked || regimeFreeze || maxExposureReached;

  return {
    blockAllEntries,
    blockBuy: blockBuy || blockAllEntries,
    blockSell: blockSell || blockAllEntries,
    maxExposureReached,
    wrongSideFreeze: wrongSide.wrongSideFreeze,
    wrongSideFreezeDirection: wrongSide.direction,
    dailyLossLock: dailyLoss.locked,
    regimeInvalidationFreeze: regimeFreeze,
    reasons: [...new Set([...reasons, ...buyBlockReasons, ...sellBlockReasons])],
    openBuys,
    openSells,
    // NEW fields
    profitLockRequired,
    stopSizeExceedsLimit,
  };
}
