// ============================================================
// GOLD V2 — Structure Engine
// Real market structure detection for XAUUSD.
// Detects swing points, BOS, CHoCH, liquidity sweeps.
// This engine is a PRIMARY DIRECTIONAL AUTHORITY.
// ============================================================

import type { Bar, StructureState, StructureTrend, SwingPoint, SwingClassification } from "../types";
import { EXHAUSTION, STRUCTURE } from "../config/thresholds";
import { atr } from "../math/indicators";

const SWING_LOOKBACK = 3; // Bars on each side to confirm swing point

// ============================================================
// SWING POINT DETECTION
// ============================================================

export function detectSwingHighs(bars: Bar[], lookback = SWING_LOOKBACK): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const high = bars[i].high;
    let isHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && bars[j].high >= high) { isHigh = false; break; }
    }
    if (isHigh) swings.push({ price: high, index: i, time: bars[i].time });
  }
  return swings;
}

export function detectSwingLows(bars: Bar[], lookback = SWING_LOOKBACK): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const low = bars[i].low;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && bars[j].low <= low) { isLow = false; break; }
    }
    if (isLow) swings.push({ price: low, index: i, time: bars[i].time });
  }
  return swings;
}

// ============================================================
// HH/HL/LH/LL CLASSIFICATION
// ============================================================

function classifySwingHighs(swingHighs: SwingPoint[]): { hh: boolean; lh: boolean } {
  if (swingHighs.length < 2) return { hh: false, lh: false };
  const last = swingHighs[swingHighs.length - 1].price;
  const prev = swingHighs[swingHighs.length - 2].price;
  return { hh: last > prev, lh: last < prev };
}

function classifySwingLows(swingLows: SwingPoint[]): { hl: boolean; ll: boolean } {
  if (swingLows.length < 2) return { hl: false, ll: false };
  const last = swingLows[swingLows.length - 1].price;
  const prev = swingLows[swingLows.length - 2].price;
  return { hl: last > prev, ll: last < prev };
}

// ============================================================
// SWING SEQUENCE BUILDER
// ============================================================

function buildSwingSequence(
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
): SwingClassification[] {
  const sequence: SwingClassification[] = [];

  // Classify all swing highs
  for (let i = 1; i < swingHighs.length; i++) {
    const curr = swingHighs[i];
    const prev = swingHighs[i - 1];
    const type: "HH" | "LH" = curr.price > prev.price ? "HH" : "LH";
    sequence.push({
      type,
      price: curr.price,
      index: curr.index,
      time: curr.time,
    });
  }

  // Classify all swing lows
  for (let i = 1; i < swingLows.length; i++) {
    const curr = swingLows[i];
    const prev = swingLows[i - 1];
    const type: "HL" | "LL" = curr.price > prev.price ? "HL" : "LL";
    sequence.push({
      type,
      price: curr.price,
      index: curr.index,
      time: curr.time,
    });
  }

  // Sort by index to get chronological order
  sequence.sort((a, b) => a.index - b.index);

  return sequence;
}

// ============================================================
// CONSOLIDATION DETECTION
// ============================================================

function detectStructureConsolidation(bars: Bar[]): { detected: boolean; bars: number } {
  if (bars.length < EXHAUSTION.CONSOLIDATION_MIN_BARS + 14) {
    return { detected: false, bars: 0 };
  }

  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const closes = bars.map(b => b.close);
  const currentATR = atr(highs, lows, closes, 14);

  if (currentATR <= 0) {
    return { detected: false, bars: 0 };
  }

  // Check recent bars for consolidation pattern
  let consolidationBars = 0;
  const minBars = EXHAUSTION.CONSOLIDATION_MIN_BARS;

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

  return {
    detected: consolidationBars >= minBars,
    bars: consolidationBars,
  };
}

// ============================================================
// BOS / CHoCH DETECTION
// Break of Structure: price closes beyond prior swing extreme
// Change of Character: the dominant swing direction reverses
// ============================================================

function detectBOS(bars: Bar[], swingHighs: SwingPoint[], swingLows: SwingPoint[]): {
  bosUp: boolean; bosDown: boolean;
} {
  if (bars.length < 2) return { bosUp: false, bosDown: false };

  const lastClose = bars[bars.length - 1].close;
  const prevClose = bars[bars.length - 2].close;

  // Bullish BOS: recent close breaks above a prior swing high
  let bosUp = false;
  if (swingHighs.length >= 2) {
    const prevSwingHigh = swingHighs[swingHighs.length - 2].price;
    // BOS requires the close to exceed the prior (not last) swing high
    bosUp = lastClose > prevSwingHigh && prevClose <= prevSwingHigh;
  }

  // Bearish BOS: recent close breaks below a prior swing low
  let bosDown = false;
  if (swingLows.length >= 2) {
    const prevSwingLow = swingLows[swingLows.length - 2].price;
    bosDown = lastClose < prevSwingLow && prevClose >= prevSwingLow;
  }

  return { bosUp, bosDown };
}

function detectCHoCH(
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
  bars: Bar[]
): { chochUp: boolean; chochDown: boolean } {
  // CHoCH: structure reversal
  // Bullish CHoCH: was making LH, now makes HH (shift from bearish to bullish structure)
  // Bearish CHoCH: was making HL, now makes LL (shift from bullish to bearish structure)

  const highsClass = classifySwingHighs(swingHighs);
  const lowsClass = classifySwingLows(swingLows);

  const lastClose = bars.length > 0 ? bars[bars.length - 1].close : 0;

  // Bullish CHoCH: prior structure was bearish (LH), now price makes a higher high
  // AND closes above prior swing high
  let chochUp = false;
  if (highsClass.hh && swingHighs.length >= 2) {
    const prevHigh = swingHighs[swingHighs.length - 2].price;
    // Previous high was LH (bearish structure) — but now we have HH
    // This is the reversal signal
    if (swingHighs.length >= 3) {
      const higherThanPrev = swingHighs[swingHighs.length - 1].price > swingHighs[swingHighs.length - 2].price;
      const prevWasLH = swingHighs[swingHighs.length - 2].price < swingHighs[swingHighs.length - 3].price;
      chochUp = higherThanPrev && prevWasLH;
    }
  }

  // Bearish CHoCH: prior structure was bullish (HL), now price makes LL
  let chochDown = false;
  if (lowsClass.ll && swingLows.length >= 3) {
    const lowerThanPrev = swingLows[swingLows.length - 1].price < swingLows[swingLows.length - 2].price;
    const prevWasHL = swingLows[swingLows.length - 2].price > swingLows[swingLows.length - 3].price;
    chochDown = lowerThanPrev && prevWasHL;
  }

  return { chochUp, chochDown };
}

// ============================================================
// LIQUIDITY SWEEP DETECTION
// Sweep = price wicks beyond swing extreme, then closes back
// ============================================================

function detectSweeps(bars: Bar[], swingHighs: SwingPoint[], swingLows: SwingPoint[]): {
  bullishSweep: boolean; bearishSweep: boolean;
} {
  if (bars.length < 3) return { bullishSweep: false, bearishSweep: false };

  const recent = bars.slice(-5);
  const lastBar = bars[bars.length - 1];
  const lastSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1].price : null;
  const lastSwingHigh = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1].price : null;

  // Bullish sweep: wick below swing low (stop hunt), close recovers above
  let bullishSweep = false;
  if (lastSwingLow !== null) {
    // Find if any recent bar swept below the swing low
    const swept = recent.some(b => b.low < lastSwingLow!);
    // Recovery: last close is back above the swing low level
    const recovered = lastBar.close > lastSwingLow;
    bullishSweep = swept && recovered;
  }

  // Bearish sweep: wick above swing high, close rejects back below
  let bearishSweep = false;
  if (lastSwingHigh !== null) {
    const swept = recent.some(b => b.high > lastSwingHigh!);
    const rejected = lastBar.close < lastSwingHigh;
    bearishSweep = swept && rejected;
  }

  return { bullishSweep, bearishSweep };
}

// ============================================================
// TREND CLASSIFICATION FROM BARS
// ============================================================

function classifyTrend(bars: Bar[], swingHighs: SwingPoint[], swingLows: SwingPoint[]): StructureTrend {
  if (bars.length < 10) return "range";

  const highsClass = classifySwingHighs(swingHighs);
  const lowsClass = classifySwingLows(swingLows);

  // Bullish: making HH and HL
  if (highsClass.hh && lowsClass.hl) return "bullish";
  // Bearish: making LH and LL
  if (highsClass.lh && lowsClass.ll) return "bearish";
  // Mixed or unclear → range
  return "range";
}

// ============================================================
// H1 BIAS FROM H1 BARS (if available)
// ============================================================

function computeH1Bias(bars1h: Bar[]): "bullish" | "bearish" | "neutral" {
  if (!bars1h || bars1h.length < 10) return "neutral";

  const swingH = detectSwingHighs(bars1h, 2);
  const swingL = detectSwingLows(bars1h, 2);
  const trend = classifyTrend(bars1h, swingH, swingL);

  if (trend === "bullish") return "bullish";
  if (trend === "bearish") return "bearish";

  // Fallback: EMA comparison
  const closes = bars1h.map(b => b.close);
  const last = closes[closes.length - 1];
  const avg20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
  if (last > avg20 * 1.002) return "bullish";
  if (last < avg20 * 0.998) return "bearish";
  return "neutral";
}

// ============================================================
// MAIN STRUCTURE ENGINE
// ============================================================

export function runStructureEngine(
  primaryBars: Bar[],    // M10 (required)
  bars5m?: Bar[],        // M5 (optional)
  bars15m?: Bar[],       // M15 (optional)
  bars1h?: Bar[],        // H1 (optional)
): StructureState {
  const notes: string[] = [];

  if (!primaryBars || primaryBars.length < 10) {
    return {
      m5Trend: "range", m15Trend: "range", h1Bias: "neutral",
      bosUp: false, bosDown: false, chochUp: false, chochDown: false,
      bullishSweep: false, bearishSweep: false,
      structureConfidence: 0, bullishBias: false, bearishBias: false,
      notes: ["Insufficient data for structure analysis"],
      // New fields
      lowerHigh: false,
      higherLow: false,
      lowerLow: false,
      higherHigh: false,
      swingSequence: [],
      consolidationDetected: false,
      consolidationBars: 0,
    };
  }

  // --- Primary timeframe structure (M10) ---
  const primaryHighs = detectSwingHighs(primaryBars);
  const primaryLows = detectSwingLows(primaryBars);
  const primaryTrend = classifyTrend(primaryBars, primaryHighs, primaryLows);

  // --- BOS/CHoCH on primary ---
  const { bosUp, bosDown } = detectBOS(primaryBars, primaryHighs, primaryLows);
  const { chochUp, chochDown } = detectCHoCH(primaryHighs, primaryLows, primaryBars);

  // --- Sweeps on primary ---
  const { bullishSweep, bearishSweep } = detectSweeps(primaryBars, primaryHighs, primaryLows);

  // --- M5 trend ---
  let m5Trend: StructureTrend = "range";
  if (bars5m && bars5m.length >= 10) {
    const m5Highs = detectSwingHighs(bars5m, 2);
    const m5Lows = detectSwingLows(bars5m, 2);
    m5Trend = classifyTrend(bars5m, m5Highs, m5Lows);
  } else {
    m5Trend = primaryTrend; // Use primary as fallback
    if (!bars5m || bars5m.length === 0) notes.push("M5 data absent, using M10 trend");
  }

  // --- M15 trend ---
  let m15Trend: StructureTrend = "range";
  if (bars15m && bars15m.length >= 10) {
    const m15Highs = detectSwingHighs(bars15m, 2);
    const m15Lows = detectSwingLows(bars15m, 2);
    m15Trend = classifyTrend(bars15m, m15Highs, m15Lows);
  } else {
    m15Trend = primaryTrend; // Use primary as fallback
    if (!bars15m || bars15m.length === 0) notes.push("M15 data absent, using M10 trend");
  }

  // --- H1 bias ---
  const h1Bias = bars1h && bars1h.length >= 10
    ? computeH1Bias(bars1h)
    : (primaryTrend === "bullish" ? "bullish" : primaryTrend === "bearish" ? "bearish" : "neutral");

  // --- Key swing levels ---
  const lastSwingHigh = primaryHighs.length > 0 ? primaryHighs[primaryHighs.length - 1].price : undefined;
  const lastSwingLow = primaryLows.length > 0 ? primaryLows[primaryLows.length - 1].price : undefined;
  const prevSwingHigh = primaryHighs.length > 1 ? primaryHighs[primaryHighs.length - 2].price : undefined;
  const prevSwingLow = primaryLows.length > 1 ? primaryLows[primaryLows.length - 2].price : undefined;

  // --- Structural notes ---
  if (bosUp) notes.push("Bullish BOS: break above prior swing high");
  if (bosDown) notes.push("Bearish BOS: break below prior swing low");
  if (chochUp) notes.push("Bullish CHoCH: bearish-to-bullish structure shift");
  if (chochDown) notes.push("Bearish CHoCH: bullish-to-bearish structure shift");
  if (bullishSweep) notes.push("Bullish sweep: lows swept then recovered");
  if (bearishSweep) notes.push("Bearish sweep: highs swept then rejected");

  // --- Structural bias ---
  // Bullish bias: bullish BOS/CHoCH, bullish sweep, or bullish trends on multiple TFs
  const bullishSignals = [bosUp, chochUp, bullishSweep,
    m5Trend === "bullish", m15Trend === "bullish", h1Bias === "bullish"].filter(Boolean).length;
  const bearishSignals = [bosDown, chochDown, bearishSweep,
    m5Trend === "bearish", m15Trend === "bearish", h1Bias === "bearish"].filter(Boolean).length;

  const bullishBias = bullishSignals > bearishSignals && bullishSignals >= 2;
  const bearishBias = bearishSignals > bullishSignals && bearishSignals >= 2;

  // --- Confidence ---
  let structureConfidence = 50;
  if (primaryHighs.length >= 3 && primaryLows.length >= 3) structureConfidence += 15;
  if (bosUp || bosDown) structureConfidence += 15;
  if (chochUp || chochDown) structureConfidence += 10;
  if (bullishSignals >= 4 || bearishSignals >= 4) structureConfidence += 10;
  structureConfidence = Math.min(100, structureConfidence);

  // --- NEW: Explicit swing classification flags ---
  const highsClass = classifySwingHighs(primaryHighs);
  const lowsClass = classifySwingLows(primaryLows);

  // --- NEW: Swing sequence ---
  const swingSequence = buildSwingSequence(primaryHighs, primaryLows);

  // --- NEW: Consolidation detection ---
  const consolidation = detectStructureConsolidation(primaryBars);

  return {
    m5Trend,
    m15Trend,
    h1Bias,
    bosUp,
    bosDown,
    chochUp,
    chochDown,
    bullishSweep,
    bearishSweep,
    lastSwingHigh,
    lastSwingLow,
    prevSwingHigh,
    prevSwingLow,
    structureConfidence,
    bullishBias,
    bearishBias,
    notes,
    // New fields
    lowerHigh: highsClass.lh,
    higherLow: lowsClass.hl,
    lowerLow: lowsClass.ll,
    higherHigh: highsClass.hh,
    swingSequence,
    consolidationDetected: consolidation.detected,
    consolidationBars: consolidation.bars,
  };
}
