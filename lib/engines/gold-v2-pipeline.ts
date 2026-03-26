// ============================================================
// GOLD V2 — Master Pipeline Orchestrator
// Runs all V2 engines in the correct order and returns a
// complete GoldV2State for decision-making and UI display.
// ============================================================

import type {
  MT5MarketPayload, TradeRecord, GoldV2State
} from "../types";

import { runDataIntegrityEngine } from "./data-integrity-engine";
import { runSpreadGate } from "./spread-gate";
import { runStructureEngine } from "./structure-engine";
import { runRegimeEngine } from "./regime-engine";
import { runIndicatorMatrix } from "./indicator-matrix";
import { runEntryQualityEngine } from "./entry-quality-engine";
import { runRiskGovernor } from "./risk-governor";
import { buildTradePermission } from "./trade-permission-engine";
import { buildExplanation } from "./explanation-engine";
import { runExhaustionTrapEngine } from "./exhaustion-trap-engine";

export interface V2PipelineOptions {
  openTrades?: TradeRecord[];
  dailyPnL?: number;
  balance?: number;
  tradeDirection?: "buy" | "sell" | null;
}

export function runGoldV2Pipeline(
  payload: MT5MarketPayload,
  options: V2PipelineOptions = {},
): GoldV2State {
  const {
    openTrades = [],
    dailyPnL = 0,
    balance = 10000,
    tradeDirection = null,
  } = options;

  // Step 1: Data Integrity
  const dataIntegrity = runDataIntegrityEngine(payload);

  // Step 2: Spread Gate
  // Use bars_10m or primary bars for ATR computation
  const primaryBars = payload.bars_10m || [];
  const isRangeMarket = false; // Will be refined after regime is computed
  const spreadGate = runSpreadGate(payload.spread_points || 0, primaryBars, isRangeMarket);

  // Step 3: Structure Engine (multi-timeframe)
  const structure = runStructureEngine(
    primaryBars,
    payload.bars_5m,
    payload.bars_15m,
    payload.bars_1h,
  );

  // Step 4: Regime Engine
  const regime = runRegimeEngine(primaryBars, structure, spreadGate, dataIntegrity);

  // Step 4.5: Exhaustion/Anti-trap Engine
  const indicatorMatrixForExhaustion = runIndicatorMatrix(
    primaryBars,
    payload.prev_day_high,
    payload.prev_day_low,
    payload.prev_day_close,
  );
  const exhaustionTrap = runExhaustionTrapEngine(
    primaryBars,
    structure,
    regime,
    indicatorMatrixForExhaustion,
  );

  // Step 5: Indicator Matrix
  const indicatorMatrix = runIndicatorMatrix(
    primaryBars,
    payload.prev_day_high,
    payload.prev_day_low,
    payload.prev_day_close,
  );

  // Step 6: Entry Quality (if we have a direction to evaluate)
  const entryQuality = runEntryQualityEngine(
    tradeDirection,
    primaryBars,
    regime,
    structure,
    spreadGate,
    indicatorMatrix,
    payload.prev_day_high,
    payload.prev_day_low,
    exhaustionTrap,
  );

  // Step 7: Risk Governor
  const riskGovernor = runRiskGovernor(openTrades, regime, dailyPnL, balance);

  // Step 8: Trade Permission (final gate)
  const tradePermission = buildTradePermission(
    dataIntegrity,
    spreadGate,
    regime,
    entryQuality,
    riskGovernor,
  );

  // Step 9: Explanation (for dashboard)
  const explanation = buildExplanation(
    dataIntegrity,
    spreadGate,
    structure,
    regime,
    indicatorMatrix,
    entryQuality,
    riskGovernor,
    tradePermission,
    exhaustionTrap,
  );

  return {
    timestamp: new Date().toISOString(),
    dataIntegrity,
    spreadGate,
    structure,
    regime,
    indicatorMatrix,
    entryQuality,
    riskGovernor,
    tradePermission,
    explanation,
    exhaustionTrap,
  };
}

// ============================================================
// HELPER: Determine if a signal direction should be blocked by V2
// Call this after signal engine to gate the final trade decision.
// ============================================================

export function v2GatesSignalDirection(
  signalDirection: "buy" | "sell" | null,
  v2: GoldV2State,
): { allowed: boolean; blockReasons: string[] } {
  if (!signalDirection) return { allowed: false, blockReasons: ["No direction"] };

  const perm = v2.tradePermission;

  if (signalDirection === "buy") {
    return {
      allowed: perm.allowBuy,
      blockReasons: perm.allowBuy ? [] : [
        ...perm.blockReasons.filter(r => !r.includes("SELL")),
        ...v2.explanation.buyBlockReasons,
      ],
    };
  } else {
    return {
      allowed: perm.allowSell,
      blockReasons: perm.allowSell ? [] : [
        ...perm.blockReasons.filter(r => !r.includes("BUY")),
        ...v2.explanation.sellBlockReasons,
      ],
    };
  }
}
