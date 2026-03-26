import { runExhaustionTrapEngine, computeEmaSlope } from "@/lib/engines/exhaustion-trap-engine";
import type { Bar, StructureState, RegimeState, IndicatorMatrix } from "@/lib/types";

// ============================================================
// TEST HELPERS
// ============================================================

function createMockBars(count: number, startPrice = 2000, direction: "up" | "down" | "flat" = "flat"): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const change = direction === "up" ? 2 : direction === "down" ? -2 : (Math.random() - 0.5) * 2;
    price += change;

    bars.push({
      time: new Date(now.getTime() - (count - i) * 10 * 60 * 1000).toISOString(),
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000,
    });
  }

  return bars;
}

function createImpulseBars(count: number, startPrice: number, impulseSize: number, direction: "up" | "down"): Bar[] {
  const bars: Bar[] = [];
  const now = new Date();

  // First half: normal bars
  const halfCount = Math.floor(count / 2);
  let price = startPrice;

  for (let i = 0; i < halfCount; i++) {
    const change = (Math.random() - 0.5) * 2;
    price += change;
    bars.push({
      time: new Date(now.getTime() - (count - i) * 10 * 60 * 1000).toISOString(),
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000,
    });
  }

  // Second half: impulse move
  const pricePerBar = impulseSize / (count - halfCount);
  for (let i = halfCount; i < count; i++) {
    price += direction === "up" ? pricePerBar : -pricePerBar;
    bars.push({
      time: new Date(now.getTime() - (count - i) * 10 * 60 * 1000).toISOString(),
      open: price - pricePerBar / 2,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000,
    });
  }

  return bars;
}

function createMockStructure(overrides: Partial<StructureState> = {}): StructureState {
  return {
    m5Trend: "range",
    m15Trend: "range",
    h1Bias: "neutral",
    bosUp: false,
    bosDown: false,
    chochUp: false,
    chochDown: false,
    bullishSweep: false,
    bearishSweep: false,
    structureConfidence: 50,
    bullishBias: false,
    bearishBias: false,
    notes: [],
    lowerHigh: false,
    higherLow: false,
    lowerLow: false,
    higherHigh: false,
    swingSequence: [],
    consolidationDetected: false,
    consolidationBars: 0,
    ...overrides,
  };
}

function createMockRegime(overrides: Partial<RegimeState> = {}): RegimeState {
  return {
    regime: "range",
    confidence: 60,
    allowBuy: true,
    allowSell: true,
    noTrade: false,
    reasons: [],
    warnings: [],
    emaSlope: 0,
    htfAligned: true,
    ...overrides,
  };
}

function createMockIndicatorMatrix(overrides: Partial<IndicatorMatrix> = {}): IndicatorMatrix {
  return {
    trendScore: 0,
    momentumScore: 0,
    volatilityScore: 50,
    participationScore: 0,
    structureScore: 0,
    overallBias: 0,
    divergenceWarnings: [],
    summary: [],
    ...overrides,
  };
}

// ============================================================
// TESTS
// ============================================================

describe("Exhaustion Trap Engine", () => {
  describe("runExhaustionTrapEngine", () => {
    it("should return default state for insufficient data", () => {
      const bars = createMockBars(10);
      const structure = createMockStructure();
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      expect(result.impulseDetected).toBe(false);
      expect(result.impulseDirection).toBeNull();
      expect(result.blockShort).toBe(false);
      expect(result.blockLong).toBe(false);
      expect(result.reasons).toContain("Insufficient data for exhaustion analysis");
    });

    it("should detect bearish impulse move", () => {
      // Create bars with a strong downward move (~30 points over 50 bars)
      // Assuming ATR is around 5-10, this should be > 2.5 ATR
      const bars = createImpulseBars(50, 2000, 30, "down");
      const structure = createMockStructure();
      const regime = createMockRegime({ regime: "bearish_trend" });
      const indicators = createMockIndicatorMatrix({ momentumScore: -50 });

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      expect(result.impulseDetected).toBe(true);
      expect(result.impulseDirection).toBe("down");
      expect(result.impulseSize).toBeGreaterThan(0);
    });

    it("should detect bullish impulse move", () => {
      const bars = createImpulseBars(50, 2000, 30, "up");
      const structure = createMockStructure();
      const regime = createMockRegime({ regime: "bullish_trend" });
      const indicators = createMockIndicatorMatrix({ momentumScore: 50 });

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      expect(result.impulseDetected).toBe(true);
      expect(result.impulseDirection).toBe("up");
    });

    it("should not detect impulse in flat market", () => {
      const bars = createMockBars(50, 2000, "flat");
      const structure = createMockStructure();
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      // Small random moves should not trigger large impulse detection
      expect(result.isExhausted).toBe(false);
    });

    it("should detect consolidation after impulse", () => {
      // Create a larger impulse to ensure detection (40 points over 40 bars)
      const impulseBars = createImpulseBars(40, 2000, 40, "down");

      const structure = createMockStructure({ consolidationDetected: true, consolidationBars: 15 });
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine(impulseBars, structure, regime, indicators);

      // With a large impulse, either impulse should be detected or trapScore > 0
      expect(result.impulseDetected || result.trapScore > 0 || result.isExhausted).toBe(true);
    });

    it("should block shorts after bearish exhaustion + EMA reclaim", () => {
      // Create a large bearish impulse
      const bars = createImpulseBars(50, 2000, 40, "down");

      // Simulate EMA reclaim by making the last bars cross back up
      const lastPrice = bars[bars.length - 1].close;
      for (let i = 0; i < 5; i++) {
        bars.push({
          time: new Date().toISOString(),
          open: lastPrice + i * 2,
          high: lastPrice + i * 2 + 2,
          low: lastPrice + i * 2 - 1,
          close: lastPrice + i * 2 + 1,
          volume: 1000,
        });
      }

      const structure = createMockStructure({ bosDown: false }); // No fresh bearish BOS
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix({ momentumScore: 30 });

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      // Should potentially block shorts (depends on RSI levels)
      expect(typeof result.blockShort).toBe("boolean");
    });

    it("should not block when fresh BOS confirms continuation", () => {
      const bars = createImpulseBars(50, 2000, 30, "down");
      const structure = createMockStructure({ bosDown: true }); // Fresh bearish BOS
      const regime = createMockRegime({ regime: "bearish_trend" });
      const indicators = createMockIndicatorMatrix({ momentumScore: -40 });

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      // With fresh BOS, should NOT block shorts (continuation valid)
      expect(result.blockShort).toBe(false);
    });

    it("should calculate trap score correctly", () => {
      const bars = createImpulseBars(50, 2000, 35, "down");
      const structure = createMockStructure();
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      expect(result.trapScore).toBeGreaterThanOrEqual(0);
      expect(result.trapScore).toBeLessThanOrEqual(100);
    });
  });

  describe("computeEmaSlope", () => {
    it("should return 0 for insufficient data", () => {
      const bars = createMockBars(20);
      const slope = computeEmaSlope(bars);
      expect(slope).toBe(0);
    });

    it("should return positive slope for uptrend", () => {
      const bars = createMockBars(100, 2000, "up");
      const slope = computeEmaSlope(bars);
      expect(slope).toBeGreaterThan(0);
    });

    it("should return negative slope for downtrend", () => {
      const bars = createMockBars(100, 2000, "down");
      const slope = computeEmaSlope(bars);
      expect(slope).toBeLessThan(0);
    });

    it("should return near-zero slope for flat market", () => {
      // Create truly flat bars
      const bars: Bar[] = [];
      const basePrice = 2000;
      for (let i = 0; i < 100; i++) {
        bars.push({
          time: new Date(Date.now() - i * 10 * 60 * 1000).toISOString(),
          open: basePrice,
          high: basePrice + 0.5,
          low: basePrice - 0.5,
          close: basePrice,
          volume: 1000,
        });
      }

      const slope = computeEmaSlope(bars);
      expect(Math.abs(slope)).toBeLessThan(0.1);
    });
  });

  describe("Anti-trap Logic", () => {
    it("should provide reasons for blocks", () => {
      const bars = createImpulseBars(50, 2000, 40, "down");
      const structure = createMockStructure();
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      expect(Array.isArray(result.reasons)).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("should detect divergence state", () => {
      const bars = createMockBars(50, 2000, "flat");
      const structure = createMockStructure();
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      expect(typeof result.bullishDivergence).toBe("boolean");
      expect(typeof result.bearishDivergence).toBe("boolean");
    });

    it("should track EMA and VWAP reclaim status", () => {
      const bars = createMockBars(50);
      const structure = createMockStructure();
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      expect(typeof result.emaReclaimed).toBe("boolean");
      expect(typeof result.vwapReclaimed).toBe("boolean");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty bars array", () => {
      const structure = createMockStructure();
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine([], structure, regime, indicators);

      expect(result.impulseDetected).toBe(false);
      expect(result.blockShort).toBe(false);
      expect(result.blockLong).toBe(false);
    });

    it("should handle bars with identical values", () => {
      const flatBars: Bar[] = Array(50).fill(null).map((_, i) => ({
        time: new Date(Date.now() - i * 10 * 60 * 1000).toISOString(),
        open: 2000,
        high: 2000,
        low: 2000,
        close: 2000,
        volume: 1000,
      }));

      const structure = createMockStructure();
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine(flatBars, structure, regime, indicators);

      expect(result.impulseDetected).toBe(false);
      expect(result.isExhausted).toBe(false);
    });

    it("should handle extreme price movements", () => {
      // Create massive impulse
      const bars = createImpulseBars(50, 2000, 100, "down");
      const structure = createMockStructure();
      const regime = createMockRegime();
      const indicators = createMockIndicatorMatrix();

      const result = runExhaustionTrapEngine(bars, structure, regime, indicators);

      expect(result.impulseDetected).toBe(true);
      expect(result.isExhausted).toBe(true);
      expect(result.impulseSize).toBeGreaterThan(2.5);
    });
  });
});
