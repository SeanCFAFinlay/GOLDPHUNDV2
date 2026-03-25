// ============================================================
// GOLD V2 — Data Integrity Engine
// Validates market input quality BEFORE any signal or trade.
// If data integrity fails, force NO TRADE.
// ============================================================

import type { Bar, MT5MarketPayload, DataIntegrityState } from "../types";

const MIN_BARS_PRIMARY = 30;   // Minimum bars for meaningful analysis
const MIN_BARS_SECONDARY = 10; // Minimum bars for secondary TF
const MAX_STALENESS_SEC = 120; // Max age of timestamp before stale
const MAX_SPREAD_ABSOLUTE = 200; // Hard reject if spread > 200 points (obviously broken)
const MIN_VALID_PRICE = 1000;  // XAUUSD is always > $1000
const MAX_VALID_PRICE = 5000;  // XAUUSD won't exceed $5000 in normal conditions

function isValidBar(b: Bar): boolean {
  if (!b || typeof b.open !== "number" || typeof b.high !== "number"
      || typeof b.low !== "number" || typeof b.close !== "number") return false;
  if (b.high < b.low) return false;
  if (b.open <= 0 || b.close <= 0) return false;
  if (b.high < MIN_VALID_PRICE || b.low > MAX_VALID_PRICE) return false;
  // OHLC coherence: open/close must be within high-low range
  if (b.open > b.high || b.open < b.low) return false;
  if (b.close > b.high || b.close < b.low) return false;
  return true;
}

function validateBars(bars: Bar[], label: string, minCount: number): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!bars || bars.length === 0) {
    reasons.push(`${label}: no bars`);
    return { ok: false, reasons };
  }
  if (bars.length < minCount) {
    reasons.push(`${label}: only ${bars.length} bars (need ${minCount})`);
  }
  // Check for invalid OHLC in last 5 bars
  const recent = bars.slice(-5);
  const badBars = recent.filter(b => !isValidBar(b));
  if (badBars.length > 0) {
    reasons.push(`${label}: ${badBars.length} invalid OHLC bars in recent data`);
  }
  // Check for stale bars (last bar more than 1h old)
  const lastBar = bars[bars.length - 1];
  if (lastBar?.time) {
    const ageMs = Date.now() - new Date(lastBar.time).getTime();
    if (ageMs > 3600_000) {
      reasons.push(`${label}: last bar is ${Math.round(ageMs / 60000)}m old`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

function checkMTFAlignment(p: MT5MarketPayload): { aligned: boolean; note: string } {
  // MTF alignment: check that multi-timeframe trends broadly agree
  // (loose check — just ensure secondary bars aren't wildly different from primary)
  const primary = p.bars_10m;
  if (!primary || primary.length < 5) return { aligned: false, note: "Insufficient primary bars" };

  const primaryClose = primary[primary.length - 1]?.close || 0;
  const primaryOpen = primary[Math.max(0, primary.length - 10)]?.close || primaryClose;
  const primaryDir = primaryClose > primaryOpen ? 1 : -1;

  if (p.bars_1h && p.bars_1h.length >= 5) {
    const h1Close = p.bars_1h[p.bars_1h.length - 1]?.close || 0;
    const h1Open = p.bars_1h[Math.max(0, p.bars_1h.length - 5)]?.close || h1Close;
    const h1Dir = h1Close > h1Open ? 1 : -1;
    // Not a hard failure, but noted
    if (primaryDir !== h1Dir) {
      return { aligned: true, note: "M10/H1 direction conflict (MTF caution)" };
    }
  }

  return { aligned: true, note: "" };
}

export function runDataIntegrityEngine(p: MT5MarketPayload): DataIntegrityState {
  const blockReasons: string[] = [];
  const warnings: string[] = [];

  // 1. Bid/ask presence and sanity
  let spreadPresent = false;
  if (!p.bid || p.bid <= 0) {
    blockReasons.push("No valid bid price");
  } else if (!p.ask || p.ask <= 0) {
    blockReasons.push("No valid ask price");
  } else if (p.ask <= p.bid) {
    blockReasons.push("Ask <= Bid (data error)");
  } else {
    spreadPresent = true;
  }

  // 2. Price sanity
  const midPrice = p.bid && p.ask ? (p.bid + p.ask) / 2 : 0;
  if (midPrice < MIN_VALID_PRICE || midPrice > MAX_VALID_PRICE) {
    blockReasons.push(`Price ${midPrice.toFixed(2)} outside valid XAUUSD range`);
  }

  // 3. Spread sanity
  const spreadPoints = p.spread_points || (p.ask && p.bid ? Math.round((p.ask - p.bid) * 100) : 0);
  if (spreadPoints > MAX_SPREAD_ABSOLUTE) {
    blockReasons.push(`Spread ${spreadPoints} points is unrealistically wide (data error)`);
  }

  // 4. Timestamp freshness
  let staleData = false;
  if (!p.timestamp) {
    warnings.push("No timestamp in payload");
    staleData = true;
  } else {
    const ageSec = Math.abs(Date.now() - new Date(p.timestamp).getTime()) / 1000;
    if (ageSec > MAX_STALENESS_SEC) {
      staleData = true;
      blockReasons.push(`Payload is ${ageSec.toFixed(0)}s old (max ${MAX_STALENESS_SEC}s)`);
    }
  }

  // 5. Primary bar validation (bars_10m required)
  let enoughBars = false;
  const primaryCheck = validateBars(p.bars_10m || [], "M10", MIN_BARS_PRIMARY);
  if (!primaryCheck.ok) {
    // Don't hard block on bar count < min, just warn; do block on empty
    if (!p.bars_10m || p.bars_10m.length === 0) {
      blockReasons.push("No primary (M10) bars");
    } else {
      warnings.push(...primaryCheck.reasons);
      enoughBars = p.bars_10m.length >= 10; // Degraded but usable
    }
  } else {
    enoughBars = true;
  }

  // 6. Secondary bar validation (optional but checked if present)
  if (p.bars_1h && p.bars_1h.length > 0) {
    const h1Check = validateBars(p.bars_1h, "H1", MIN_BARS_SECONDARY);
    if (!h1Check.ok) warnings.push(...h1Check.reasons);
  }
  if (p.bars_4h && p.bars_4h.length > 0) {
    const h4Check = validateBars(p.bars_4h, "H4", MIN_BARS_SECONDARY);
    if (!h4Check.ok) warnings.push(...h4Check.reasons);
  }
  if (p.bars_5m && p.bars_5m.length > 0) {
    const m5Check = validateBars(p.bars_5m, "M5", MIN_BARS_SECONDARY);
    if (!m5Check.ok) warnings.push(...m5Check.reasons);
  }
  if (p.bars_15m && p.bars_15m.length > 0) {
    const m15Check = validateBars(p.bars_15m, "M15", MIN_BARS_SECONDARY);
    if (!m15Check.ok) warnings.push(...m15Check.reasons);
  }

  // 7. OHLC validity of primary bars
  let validOHLC = true;
  if (p.bars_10m && p.bars_10m.length > 0) {
    const invalidCount = p.bars_10m.filter(b => !isValidBar(b)).length;
    if (invalidCount > p.bars_10m.length * 0.1) {
      validOHLC = false;
      blockReasons.push(`${invalidCount}/${p.bars_10m.length} M10 bars have invalid OHLC`);
    }
  }

  // 8. MTF alignment check
  const mtf = checkMTFAlignment(p);
  if (!mtf.aligned) {
    warnings.push(mtf.note || "MTF alignment issue");
  } else if (mtf.note) {
    warnings.push(mtf.note);
  }
  const mtfAligned = mtf.aligned;

  // 9. Compute quality score (0-100)
  let qualityScore = 100;
  qualityScore -= blockReasons.length * 20;
  qualityScore -= warnings.length * 5;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  const feedHealthy = blockReasons.length === 0;

  return {
    feedHealthy,
    staleData,
    mtfAligned,
    spreadPresent,
    enoughBars,
    validOHLC,
    qualityScore,
    blockReasons,
    warnings,
  };
}
