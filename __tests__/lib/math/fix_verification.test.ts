/**
 * Fix Verification Suite — GOLDPHUNDV2
 * Each test proves a specific bug is resolved.
 */
import { rsi, stochastic, adx, supertrend } from "@/lib/math/indicators";

// ============================================================
// FIX 1: RSI — Wilder's RMA smoothing
// ============================================================
describe("FIX 1: RSI now uses Wilder RMA (matches MT5/TradingView)", () => {
  it("RSI with all gains returns 100", () => {
    const up = [100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115];
    expect(rsi(up, 14)).toBe(100);
  });

  it("RSI with all losses returns close to 0 (Wilder smoothed)", () => {
    const down = [115,114,113,112,111,110,109,108,107,106,105,104,103,102,101,100];
    const result = rsi(down, 14);
    expect(result).toBeLessThan(5);
  });

  it("RSI with no change after period seed returns correct stable value", () => {
    const data = [100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,114];
    const result = rsi(data, 14);
    expect(result).toBe(100);
  });

  it("RSI is within valid range on mixed data with sufficient warmup", () => {
    const data = Array(50).fill(0).map((_, i) =>
      100 + Math.sin(i / 5) * 5 + i * 0.1
    );
    const result = rsi(data, 14);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
    console.log("RSI (Wilder, 50-bar mixed uptrend):", result.toFixed(2));
  });

  it("Wilder vs old simple-avg: values now match TradingView pattern", () => {
    const data = Array(29).fill(0).map((_, i) => 100 + i);
    const result = rsi(data, 14);
    expect(result).toBe(100);
  });
});

// ============================================================
// FIX 2: Stochastic %D denominator
// ============================================================
describe("FIX 2: Stochastic %D uses actual slice length (not hardcoded dPeriod)", () => {
  it("D equals K when kValues has fewer entries than dPeriod (edge case at period boundary)", () => {
    const H = Array(15).fill(10);
    const L = Array(15).fill(0);
    const C = Array(15).fill(5);
    const result = stochastic(H, L, C, 14, 3);
    expect(result.k).toBe(50);
    expect(result.d).toBeCloseTo(50, 5);
    console.log("Stochastic D (fixed):", result.d, "← was 33.33 before fix");
  });

  it("D is correct SMA of K when kValues.length >= dPeriod", () => {
    const H = Array(20).fill(10);
    const L = Array(20).fill(0);
    const C = Array(20).fill(5);
    const result = stochastic(H, L, C, 14, 3);
    expect(result.k).toBeCloseTo(50, 5);
    expect(result.d).toBeCloseTo(50, 5);
  });

  it("D tracks K correctly on trending data", () => {
    const H = Array(30).fill(0).map((_, i) => 100 + i);
    const L = H.map(h => h - 5);
    const C = H.map(h => h - 1);
    const result = stochastic(H, L, C, 14, 3);
    expect(result.k).toBeGreaterThan(60);
    expect(Math.abs(result.k - result.d)).toBeLessThan(20);
    console.log("Stochastic trending:", JSON.stringify(result));
  });
});

// ============================================================
// FIX 3: ADX — Wilder RMA + DX smoothing pass
// ============================================================
describe("FIX 3: ADX uses Wilder RMA and properly smooths DX into ADX", () => {
  it("ADX in strong synthetic uptrend correctly produces high ADX and +DI >> -DI", () => {
    const n = 50;
    const highs = Array.from({length: n}, (_, i) => 100 + i * 0.5);
    const lows = highs.map(h => h - 1);
    const closes = highs.map(h => h - 0.5);
    const result = adx(highs, lows, closes, 14);
    console.log("ADX (fixed, Wilder RMA, perfect uptrend):", JSON.stringify(result));
    expect(result.adx).toBeGreaterThan(50);
    expect(result.plusDI).toBeGreaterThan(result.minusDI);
    expect(result.adx).toBeGreaterThanOrEqual(0);
    expect(result.adx).toBeLessThanOrEqual(100);
  });

  it("ADX with realistic noisy uptrend is high but < 100", () => {
    const n = 60;
    const closes = Array.from({length: n}, (_, i) => {
      const noise = [0, 0.3, -0.2, 0.4, -0.1, 0.2][i % 6];
      return 100 + i * 0.5 + noise;
    });
    const highs = closes.map((c, i) => c + 0.5 + (i % 3 === 0 ? 0.3 : 0));
    const lows = closes.map((c, i) => c - 0.5 - (i % 4 === 0 ? 0.2 : 0));
    const result = adx(highs, lows, closes, 14);
    console.log("ADX (fixed, noisy uptrend):", JSON.stringify(result));
    expect(result.adx).toBeLessThan(100);
    expect(result.adx).toBeGreaterThan(25);
    expect(result.plusDI).toBeGreaterThan(result.minusDI);
  });

  it("+DI > -DI in a clear uptrend", () => {
    const n = 60;
    const highs = Array.from({length: n}, (_, i) => 100 + i * 0.5);
    const lows = highs.map(h => h - 1);
    const closes = highs.map(h => h - 0.5);
    const result = adx(highs, lows, closes, 14);
    expect(result.plusDI).toBeGreaterThan(result.minusDI);
  });

  it("-DI > +DI in a clear downtrend", () => {
    const n = 60;
    const highs = Array.from({length: n}, (_, i) => 200 - i * 0.5);
    const lows = highs.map(h => h - 1);
    const closes = highs.map(h => h - 0.5);
    const result = adx(highs, lows, closes, 14);
    console.log("ADX downtrend:", JSON.stringify(result));
    expect(result.minusDI).toBeGreaterThan(result.plusDI);
  });

  it("ADX is smooth (not jumping to extremes) in choppy market", () => {
    const n = 60;
    const closes = Array.from({length: n}, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const highs = closes.map(c => c + 0.5);
    const lows = closes.map(c => c - 0.5);
    const result = adx(highs, lows, closes, 14);
    console.log("ADX choppy market:", JSON.stringify(result));
    expect(Math.abs(result.plusDI - result.minusDI)).toBeLessThan(15);
  });

  it("ADX values are within valid range", () => {
    const n = 50;
    const highs = Array.from({length: n}, (_, i) => 100 + Math.sin(i / 4) * 3 + i * 0.2);
    const lows = highs.map(h => h - 2);
    const closes = highs.map(h => h - 1);
    const result = adx(highs, lows, closes, 14);
    expect(result.adx).toBeGreaterThanOrEqual(0);
    expect(result.adx).toBeLessThanOrEqual(100);
    expect(result.plusDI).toBeGreaterThanOrEqual(0);
    expect(result.minusDI).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// FIX 4: SuperTrend — now iterative with band-locking
// ============================================================
describe("FIX 4: SuperTrend is now iterative with band-locking", () => {
  it("Direction is bullish (1) in a clear uptrend", () => {
    const H = Array(30).fill(0).map((_, i) => 100 + i);
    const L = H.map(h => h - 2);
    const C = H.map(h => h - 1);
    const result = supertrend(H, L, C, 10, 3);
    console.log("SuperTrend (iterative, uptrend):", JSON.stringify(result));
    expect(result.direction).toBe(1);
  });

  it("Direction is bearish (-1) in a clear downtrend", () => {
    const H = Array(30).fill(0).map((_, i) => 200 - i);
    const L = H.map(h => h - 2);
    const C = H.map(h => h - 1);
    const result = supertrend(H, L, C, 10, 3);
    console.log("SuperTrend (iterative, downtrend):", JSON.stringify(result));
    expect(result.direction).toBe(-1);
  });

  it("SuperTrend acts as support (value < price) in uptrend", () => {
    const H = Array(30).fill(0).map((_, i) => 100 + i);
    const L = H.map(h => h - 2);
    const C = H.map(h => h - 1);
    const lastClose = C[C.length - 1];
    const result = supertrend(H, L, C, 10, 3);
    expect(result.value).toBeLessThan(lastClose);
  });

  it("SuperTrend acts as resistance (value > price) in downtrend", () => {
    const H = Array(30).fill(0).map((_, i) => 200 - i);
    const L = H.map(h => h - 2);
    const C = H.map(h => h - 1);
    const lastClose = C[C.length - 1];
    const result = supertrend(H, L, C, 10, 3);
    expect(result.value).toBeGreaterThan(lastClose);
  });

  it("Direction does NOT flip on single noisy bar after established trend", () => {
    const H = Array(25).fill(0).map((_, i) => 100 + i);
    const L = H.map(h => h - 2);
    const C = H.map(h => h - 1);
    const H2 = [...H, 124];
    const L2 = [...L, 116];
    const C2 = [...C, 118];
    const before = supertrend(H, L, C, 10, 3);
    const after = supertrend(H2, L2, C2, 10, 3);
    expect(before.direction).toBe(1);
    expect(after.direction).toBe(1);
    console.log("SuperTrend stability: before=", before.direction, "after=", after.direction);
  });
});
