// ============================================================
// GOLD V2 — Trade Permission Engine
// Final consolidated approval gate. NO order may be opened
// unless this says so. All engines funnel through here.
// ============================================================

import type {
  DataIntegrityState, SpreadGateState, StructureState,
  RegimeState, EntryQualityState, RiskGovernorState,
  TradePermission
} from "../types";

export function buildTradePermission(
  dataIntegrity: DataIntegrityState,
  spreadGate: SpreadGateState,
  regime: RegimeState,
  entryQuality: EntryQualityState,
  riskGovernor: RiskGovernorState,
): TradePermission {
  const blockReasons: string[] = [];
  const warnings: string[] = [];

  // --- Layer 1: Data integrity (hard gate) ---
  if (!dataIntegrity.feedHealthy) {
    blockReasons.push(...dataIntegrity.blockReasons.map(r => `[DATA] ${r}`));
  }

  // --- Layer 2: Spread (hard gate) ---
  if (!spreadGate.spreadSafe) {
    blockReasons.push(...spreadGate.blockReasons.map(r => `[SPREAD] ${r}`));
  }
  if (spreadGate.spikeDetected) {
    warnings.push(`Spread spike detected (${spreadGate.spreadPoints}pts)`);
  }

  // --- Layer 3: Regime ---
  if (regime.noTrade || regime.regime === "unsafe") {
    blockReasons.push(`[REGIME] Unsafe: ${regime.regime}`);
  }
  warnings.push(...regime.warnings.map(w => `[REGIME] ${w}`));

  // --- Layer 4: Entry quality ---
  if (entryQuality.blockReasons.length > 0) {
    blockReasons.push(...entryQuality.blockReasons.map(r => `[ENTRY] ${r}`));
  }

  // --- Layer 5: Risk governor ---
  if (riskGovernor.blockAllEntries) {
    blockReasons.push(...riskGovernor.reasons
      .filter(r => !blockReasons.some(b => b.includes(r)))
      .map(r => `[RISK] ${r}`)
    );
  }

  // --- Compute direction permissions ---
  const dataOk = dataIntegrity.feedHealthy;
  const spreadOk = spreadGate.spreadSafe;
  const baseOk = dataOk && spreadOk && !regime.noTrade;

  const allowBuy = baseOk
    && regime.allowBuy
    && !riskGovernor.blockBuy
    && entryQuality.canBuy;

  const allowSell = baseOk
    && regime.allowSell
    && !riskGovernor.blockSell
    && entryQuality.canSell;

  const allowNewTrade = allowBuy || allowSell;

  return {
    allowBuy,
    allowSell,
    allowNewTrade,
    regime: regime.regime,
    confidence: regime.confidence,
    blockReasons,
    warnings,
  };
}

// ============================================================
// INTEGRATION HELPER: Check if a specific direction is permitted
// ============================================================

export function isDirectionPermitted(
  direction: "buy" | "sell",
  permission: TradePermission,
): { permitted: boolean; reasons: string[] } {
  if (direction === "buy") {
    return {
      permitted: permission.allowBuy,
      reasons: permission.allowBuy
        ? []
        : permission.blockReasons.filter(r =>
            r.toLowerCase().includes("buy") ||
            r.toLowerCase().includes("data") ||
            r.toLowerCase().includes("spread") ||
            r.toLowerCase().includes("risk") ||
            r.toLowerCase().includes("regime")
          ),
    };
  } else {
    return {
      permitted: permission.allowSell,
      reasons: permission.allowSell
        ? []
        : permission.blockReasons.filter(r =>
            r.toLowerCase().includes("sell") ||
            r.toLowerCase().includes("data") ||
            r.toLowerCase().includes("spread") ||
            r.toLowerCase().includes("risk") ||
            r.toLowerCase().includes("regime")
          ),
    };
  }
}
