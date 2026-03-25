// ============================================================
// GOLD V2 — Explanation Engine
// Transforms engine outputs into clear human-readable UI state.
// The dashboard must explain exactly what the bot sees and why.
// ============================================================

import type {
  DataIntegrityState, SpreadGateState, StructureState,
  RegimeState, IndicatorMatrix, EntryQualityState,
  RiskGovernorState, TradePermission, ExplanationOutput
} from "../types";

type Color = "green" | "red" | "yellow" | "gray";

function regimeColor(regime: string): Color {
  switch (regime) {
    case "bullish_trend":    return "green";
    case "bearish_trend":    return "red";
    case "bullish_reversal": return "green";
    case "bearish_reversal": return "red";
    case "range":            return "yellow";
    case "breakout_expansion": return "yellow";
    case "unsafe":           return "gray";
    default:                 return "gray";
  }
}

function regimeLabel(regime: string): string {
  switch (regime) {
    case "bullish_trend":      return "Bullish Trend";
    case "bearish_trend":      return "Bearish Trend";
    case "bullish_reversal":   return "Bullish Reversal";
    case "bearish_reversal":   return "Bearish Reversal";
    case "range":              return "Range / Chop";
    case "breakout_expansion": return "Breakout Expansion";
    case "unsafe":             return "Unsafe — No Trade";
    default:                   return "Unknown";
  }
}

function spreadLabel(spreadGate: SpreadGateState): string {
  const { spreadPoints, spreadToAtr, regime } = spreadGate;
  switch (regime) {
    case "tight":  return `Tight (${spreadPoints}pts / ${(spreadToAtr * 100).toFixed(1)}% ATR)`;
    case "normal": return `Normal (${spreadPoints}pts / ${(spreadToAtr * 100).toFixed(1)}% ATR)`;
    case "wide":   return `Wide (${spreadPoints}pts / ${(spreadToAtr * 100).toFixed(1)}% ATR)`;
    case "spike":  return `SPIKE (${spreadPoints}pts — cooldown active)`;
    default:       return `${spreadPoints}pts`;
  }
}

function actionLabel(
  permission: TradePermission,
  entryQuality: EntryQualityState,
  regime: RegimeState,
): ExplanationOutput["actionLabel"] {
  if (permission.allowBuy && entryQuality.canBuy && entryQuality.confirmationOk) return "BUY SETUP READY";
  if (permission.allowSell && entryQuality.canSell && entryQuality.confirmationOk) return "SELL SETUP READY";
  if (regime.regime === "unsafe" || !permission.allowNewTrade) return "NO TRADE";
  return "WAIT";
}

function actionColor(label: ExplanationOutput["actionLabel"]): Color {
  switch (label) {
    case "BUY SETUP READY":  return "green";
    case "SELL SETUP READY": return "red";
    case "WAIT":             return "yellow";
    case "NO TRADE":         return "gray";
  }
}

function buildBuyBlockReasons(
  permission: TradePermission,
  riskGovernor: RiskGovernorState,
  regime: RegimeState,
  spreadGate: SpreadGateState,
  dataIntegrity: DataIntegrityState,
): string[] {
  if (permission.allowBuy) return [];
  const reasons: string[] = [];

  if (!dataIntegrity.feedHealthy) reasons.push(...dataIntegrity.blockReasons);
  if (!spreadGate.spreadSafe) reasons.push(...spreadGate.blockReasons);
  if (!regime.allowBuy) {
    reasons.push(...regime.reasons.filter(r =>
      r.toLowerCase().includes("buy") || r.toLowerCase().includes("blocked")
    ));
  }
  if (riskGovernor.blockBuy) {
    const govReasons = riskGovernor.reasons.filter(r =>
      r.toLowerCase().includes("buy") ||
      r.toLowerCase().includes("freeze") ||
      r.toLowerCase().includes("wrong") ||
      r.toLowerCase().includes("max") ||
      r.toLowerCase().includes("daily")
    );
    reasons.push(...govReasons);
  }

  return [...new Set(reasons)].slice(0, 5);
}

function buildSellBlockReasons(
  permission: TradePermission,
  riskGovernor: RiskGovernorState,
  regime: RegimeState,
  spreadGate: SpreadGateState,
  dataIntegrity: DataIntegrityState,
): string[] {
  if (permission.allowSell) return [];
  const reasons: string[] = [];

  if (!dataIntegrity.feedHealthy) reasons.push(...dataIntegrity.blockReasons);
  if (!spreadGate.spreadSafe) reasons.push(...spreadGate.blockReasons);
  if (!regime.allowSell) {
    reasons.push(...regime.reasons.filter(r =>
      r.toLowerCase().includes("sell") || r.toLowerCase().includes("blocked")
    ));
  }
  if (riskGovernor.blockSell) {
    const govReasons = riskGovernor.reasons.filter(r =>
      r.toLowerCase().includes("sell") ||
      r.toLowerCase().includes("freeze") ||
      r.toLowerCase().includes("wrong") ||
      r.toLowerCase().includes("max") ||
      r.toLowerCase().includes("daily")
    );
    reasons.push(...govReasons);
  }

  return [...new Set(reasons)].slice(0, 5);
}

function buildActionReasons(
  permission: TradePermission,
  entryQuality: EntryQualityState,
  regime: RegimeState,
  label: ExplanationOutput["actionLabel"],
): string[] {
  switch (label) {
    case "BUY SETUP READY":
      return ["Structure aligned bullish", "Regime permits buy", "Entry quality confirmed"];
    case "SELL SETUP READY":
      return ["Structure aligned bearish", "Regime permits sell", "Entry quality confirmed"];
    case "NO TRADE":
      return permission.blockReasons.slice(0, 4).map(r => r.replace(/^\[[A-Z]+\] /, ""));
    case "WAIT":
      const waitReasons = [];
      if (!entryQuality.confirmationOk) waitReasons.push("Waiting for confirmation candle");
      if (!entryQuality.targetSpaceOk) waitReasons.push("Insufficient target space");
      if (!entryQuality.rrOk) waitReasons.push("RR too low");
      if (regime.regime === "range") waitReasons.push("Range market: wait for range extremes");
      if (waitReasons.length === 0) waitReasons.push("Waiting for better setup quality");
      return waitReasons;
  }
}

export function buildExplanation(
  dataIntegrity: DataIntegrityState,
  spreadGate: SpreadGateState,
  structure: StructureState,
  regime: RegimeState,
  indicatorMatrix: IndicatorMatrix,
  entryQuality: EntryQualityState,
  riskGovernor: RiskGovernorState,
  permission: TradePermission,
): ExplanationOutput {
  const label = actionLabel(permission, entryQuality, regime);

  return {
    regimeLabel: regimeLabel(permission.regime),
    regimeColor: regimeColor(permission.regime),
    confidencePct: permission.confidence,

    buyStatus: permission.allowBuy ? "enabled" : "blocked",
    sellStatus: permission.allowSell ? "enabled" : "blocked",

    buyBlockReasons: buildBuyBlockReasons(permission, riskGovernor, regime, spreadGate, dataIntegrity),
    sellBlockReasons: buildSellBlockReasons(permission, riskGovernor, regime, spreadGate, dataIntegrity),

    spreadLabel: spreadLabel(spreadGate),
    spreadSafe: spreadGate.spreadSafe,
    spreadDetails: {
      spread: spreadGate.spreadPoints,
      atr: +(spreadGate.atr * 100).toFixed(1), // ATR in points
      ratio: +((spreadGate.spreadToAtr) * 100).toFixed(1),
      label: spreadGate.regime,
    },

    structureNotes: structure.notes.slice(0, 6),
    structureFlags: {
      bosUp: structure.bosUp,
      bosDown: structure.bosDown,
      chochUp: structure.chochUp,
      chochDown: structure.chochDown,
      bullishSweep: structure.bullishSweep,
      bearishSweep: structure.bearishSweep,
    },

    indicatorSummary: {
      trend: Math.round(indicatorMatrix.trendScore),
      momentum: Math.round(indicatorMatrix.momentumScore),
      volatility: Math.round(indicatorMatrix.volatilityScore),
      participation: Math.round(indicatorMatrix.participationScore),
      divergences: indicatorMatrix.divergenceWarnings,
    },

    actionLabel: label,
    actionColor: actionColor(label),
    actionReasons: buildActionReasons(permission, entryQuality, regime, label),

    riskSummary: {
      openBuys: riskGovernor.openBuys,
      openSells: riskGovernor.openSells,
      wrongSideFreeze: riskGovernor.wrongSideFreeze,
      dailyLock: riskGovernor.dailyLossLock,
      drawdownLock: riskGovernor.regimeInvalidationFreeze,
    },

    dataIntegrityOk: dataIntegrity.feedHealthy,
    dataIntegrityIssues: [...dataIntegrity.blockReasons, ...dataIntegrity.warnings].slice(0, 5),

    cooldownActive: spreadGate.cooldownBarsRemaining > 0,
    cooldownBarsLeft: spreadGate.cooldownBarsRemaining,
  };
}
