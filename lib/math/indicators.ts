// ============================================================
// PHUND.CA — Shared Technical Indicator Library
// Unified implementations used by all three engines
// ============================================================

// ============================================================
// CORE MATH UTILITIES
// ============================================================

/** Clamp a value between min and max */
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Normalize value to [-1, 1] range */
export const normalize = (v: number, min: number, max: number): number => {
  if (max === min) return 0;
  return clamp((v - min) / (max - min) * 2 - 1, -1, 1);
};

/** Sigmoid function for probability calculation */
export const sigmoid = (x: number, k = 18): number =>
  1 / (1 + Math.exp(-x / k));

/** Hyperbolic tangent scaled to [-100, 100] */
export const tanh100 = (v: number, s = 1): number =>
  Math.tanh(v / s) * 100;

/** Alias for tanh100 used in signal engine */
export const tanhN = tanh100;

// ============================================================
// MOVING AVERAGES
// ============================================================

/**
 * Exponential Moving Average
 * Returns array of EMA values for each data point
 */
export function ema(data: number[], period: number): number[] {
  if (!data.length) return [];
  const k = 2 / (period + 1);
  const result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/**
 * Simple Moving Average
 * Returns the SMA of the last `period` values
 */
export function sma(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ============================================================
// MOMENTUM INDICATORS
// ============================================================

/**
 * Relative Strength Index (RSI)
 */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

/**
 * Moving Average Convergence Divergence (MACD)
 */
export function macd(closes: number[]): { line: number; signal: number; histogram: number } {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const lineArr = e12.map((v, i) => v - e26[i]);
  const signalArr = ema(lineArr, 9);
  const L = closes.length - 1;
  return {
    line: lineArr[L] || 0,
    signal: signalArr[L] || 0,
    histogram: (lineArr[L] || 0) - (signalArr[L] || 0)
  };
}

/**
 * Stochastic Oscillator
 */
export function stochastic(highs: number[], lows: number[], closes: number[], kPeriod = 14, dPeriod = 3): { k: number; d: number } {
  if (closes.length < kPeriod) return { k: 50, d: 50 };
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highest = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    const lowest = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
    kValues.push(highest === lowest ? 50 : ((closes[i] - lowest) / (highest - lowest)) * 100);
  }
  const k = kValues[kValues.length - 1];
  const d = kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  return { k, d };
}

/**
 * Williams %R
 */
export function williamsR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period) return -50;
  const highest = Math.max(...highs.slice(-period));
  const lowest = Math.min(...lows.slice(-period));
  if (highest === lowest) return -50;
  return ((highest - closes[closes.length - 1]) / (highest - lowest)) * -100;
}

/**
 * Commodity Channel Index (CCI)
 */
export function cci(highs: number[], lows: number[], closes: number[], period = 20): number {
  if (closes.length < period) return 0;
  const tp = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
  const slice = tp.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const meanDev = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
  return meanDev > 0 ? (tp[tp.length - 1] - mean) / (0.015 * meanDev) : 0;
}

/**
 * Rate of Change (ROC)
 */
export function roc(closes: number[], period = 5): number {
  if (closes.length <= period) return 0;
  const prev = closes[closes.length - 1 - period];
  return prev ? ((closes[closes.length - 1] - prev) / prev) * 100 : 0;
}

/**
 * Momentum
 */
export function momentum(closes: number[], period = 10): number {
  if (closes.length <= period) return 0;
  return closes[closes.length - 1] - closes[closes.length - 1 - period];
}

/**
 * True Strength Index (TSI)
 */
export function tsi(closes: number[], longPeriod = 25, shortPeriod = 13): number {
  if (closes.length < longPeriod + 2) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    deltas.push(closes[i] - closes[i - 1]);
  }
  const smoothed1 = ema(deltas, longPeriod);
  const smoothed2 = ema(smoothed1, shortPeriod);
  const absDeltas = deltas.map(Math.abs);
  const absSmoothed1 = ema(absDeltas, longPeriod);
  const absSmoothed2 = ema(absSmoothed1, shortPeriod);
  const L = smoothed2.length - 1;
  return absSmoothed2[L] > 0 ? (smoothed2[L] / absSmoothed2[L]) * 100 : 0;
}

// ============================================================
// VOLATILITY INDICATORS
// ============================================================

/**
 * Average True Range (ATR)
 */
export function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < 2) return 1;
  const tr: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  if (tr.length < period) return tr[tr.length - 1] || 1;
  let val = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    val = (val * (period - 1) + tr[i]) / period;
  }
  return Math.max(val, 0.001);
}

/**
 * Normalized Average True Range (NATR)
 */
export function natr(highs: number[], lows: number[], closes: number[], period = 14): number {
  const atrVal = atr(highs, lows, closes, period);
  const price = closes[closes.length - 1];
  return price > 0 ? (atrVal / price) * 100 : 0;
}

/**
 * Bollinger Bands
 */
export function bollingerBands(closes: number[], period = 20, mult = 2): {
  upper: number;
  lower: number;
  middle: number;
  width: number;
  percentB: number;
} {
  if (closes.length < period) {
    const x = closes[closes.length - 1] || 0;
    return { upper: x + 5, lower: x - 5, middle: x, width: 0, percentB: 0.5 };
  }
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period);
  const upper = middle + mult * std;
  const lower = middle - mult * std;
  const price = closes[closes.length - 1];
  return {
    upper,
    lower,
    middle,
    width: middle > 0 ? ((upper - lower) / middle) * 100 : 0,
    percentB: upper !== lower ? (price - lower) / (upper - lower) : 0.5
  };
}

/**
 * Keltner Channels
 */
export function keltnerChannels(highs: number[], lows: number[], closes: number[], period = 20, mult = 1.5): {
  upper: number;
  lower: number;
  middle: number;
  width: number;
} {
  const e = ema(closes, period);
  const middle = e[e.length - 1];
  const a = atr(highs, lows, closes, period);
  const upper = middle + mult * a;
  const lower = middle - mult * a;
  return {
    upper,
    lower,
    middle,
    width: middle > 0 ? ((upper - lower) / middle) * 100 : 0
  };
}

/**
 * Donchian Channels
 */
export function donchianChannels(highs: number[], lows: number[], period = 20): {
  upper: number;
  lower: number;
  middle: number;
  width: number;
} {
  const N = Math.min(period, highs.length);
  const upper = Math.max(...highs.slice(-N));
  const lower = Math.min(...lows.slice(-N));
  const middle = (upper + lower) / 2;
  return {
    upper,
    lower,
    middle,
    width: middle > 0 ? ((upper - lower) / middle) * 100 : 0
  };
}

// ============================================================
// TREND INDICATORS
// ============================================================

/**
 * Average Directional Index (ADX)
 */
export function adx(highs: number[], lows: number[], closes: number[], period = 14): {
  adx: number;
  plusDI: number;
  minusDI: number;
} {
  if (highs.length < period + 2) return { adx: 20, plusDI: 25, minusDI: 25 };
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }

  const smoothTR = ema(tr, period);
  const smoothPlusDM = ema(plusDM, period);
  const smoothMinusDM = ema(minusDM, period);
  const L = smoothTR.length - 1;

  const plusDI = smoothTR[L] > 0 ? (smoothPlusDM[L] / smoothTR[L]) * 100 : 0;
  const minusDI = smoothTR[L] > 0 ? (smoothMinusDM[L] / smoothTR[L]) * 100 : 0;
  const dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;

  return { adx: clamp(dx, 0, 100), plusDI, minusDI };
}

/**
 * SuperTrend
 */
export function supertrend(highs: number[], lows: number[], closes: number[], period = 10, mult = 3): {
  value: number;
  direction: number;
} {
  if (closes.length < period + 1) return { value: closes[closes.length - 1] || 0, direction: 0 };
  const atrVal = atr(highs, lows, closes, period);
  const hl2 = (highs[highs.length - 1] + lows[lows.length - 1]) / 2;
  const upperBand = hl2 + mult * atrVal;
  const lowerBand = hl2 - mult * atrVal;
  const price = closes[closes.length - 1];
  return {
    value: price > lowerBand ? lowerBand : upperBand,
    direction: price > lowerBand ? 1 : -1
  };
}

/**
 * Parabolic SAR
 */
export function parabolicSAR(highs: number[], lows: number[], closes: number[], step = 0.02, max = 0.2): {
  value: number;
  direction: number;
} {
  if (closes.length < 5) return { value: closes[closes.length - 1] || 0, direction: 0 };

  let af = step;
  let trend = 1;
  let sar = Math.min(...lows.slice(-5));
  let ep = Math.max(...highs.slice(-5));

  for (let i = 5; i < closes.length; i++) {
    if (trend === 1) {
      if (lows[i] < sar) {
        trend = -1;
        sar = ep;
        ep = lows[i];
        af = step;
      } else {
        if (highs[i] > ep) { ep = highs[i]; af = Math.min(af + step, max); }
        sar = sar + af * (ep - sar);
        sar = Math.min(sar, lows[i - 1], lows[i - 2]);
      }
    } else {
      if (highs[i] > sar) {
        trend = 1;
        sar = ep;
        ep = highs[i];
        af = step;
      } else {
        if (lows[i] < ep) { ep = lows[i]; af = Math.min(af + step, max); }
        sar = sar - af * (sar - ep);
        sar = Math.max(sar, highs[i - 1], highs[i - 2]);
      }
    }
  }

  return { value: sar, direction: trend };
}

/**
 * Ichimoku Cloud
 */
export function ichimokuCloud(highs: number[], lows: number[], closes: number[]): {
  tenkan: number;
  kijun: number;
  senkouA: number;
  senkouB: number;
  cloudTop: number;
  cloudBot: number;
  price: number;
  price26ago: number;
} {
  const hMax = (n: number) => Math.max(...highs.slice(-Math.min(n, highs.length)));
  const lMin = (n: number) => Math.min(...lows.slice(-Math.min(n, lows.length)));

  const tenkan = (hMax(9) + lMin(9)) / 2;
  const kijun = (hMax(26) + lMin(26)) / 2;
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = (hMax(52) + lMin(52)) / 2;
  const price = closes[closes.length - 1];
  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBot = Math.min(senkouA, senkouB);
  const price26ago = closes.length >= 27 ? closes[closes.length - 27] : closes[0];

  return { tenkan, kijun, senkouA, senkouB, cloudTop, cloudBot, price, price26ago };
}

// ============================================================
// STRUCTURE INDICATORS
// ============================================================

/**
 * Volume Weighted Average Price (VWAP)
 */
export function vwap(highs: number[], lows: number[], closes: number[], volumes: number[]): number {
  let cumVol = 0, cumTP = 0;
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumVol += volumes[i] || 1;
    cumTP += tp * (volumes[i] || 1);
  }
  return cumVol > 0 ? cumTP / cumVol : closes[closes.length - 1] || 0;
}

/**
 * Z-Score
 */
export function zScore(closes: number[], period = 20): number {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return std > 0 ? (closes[closes.length - 1] - mean) / std : 0;
}

/**
 * Pivot Points (Classic)
 */
export function pivotPoints(highs: number[], lows: number[], closes: number[]): {
  pivot: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
} {
  const price = closes[closes.length - 1];
  const prevH = highs.length > 1 ? highs[highs.length - 2] : price;
  const prevL = lows.length > 1 ? lows[lows.length - 2] : price;
  const prevC = closes.length > 1 ? closes[closes.length - 2] : price;

  const pivot = (prevH + prevL + prevC) / 3;
  const r1 = 2 * pivot - prevL;
  const s1 = 2 * pivot - prevH;
  const r2 = pivot + (prevH - prevL);
  const s2 = pivot - (prevH - prevL);

  return { pivot, r1, r2, s1, s2 };
}

/**
 * Linear Regression Slope
 */
export function linearRegressionSlope(closes: number[], period = 20): {
  slope: number;
  deviation: number;
} {
  if (closes.length < period) return { slope: 0, deviation: 0 };
  const slice = closes.slice(-period);
  const n = slice.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = slice.reduce((a, b) => a + b, 0);
  const sumXY = slice.reduce((a, b, i) => a + i * b, 0);
  const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  let sumSqDev = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i;
    sumSqDev += (slice[i] - predicted) ** 2;
  }
  const deviation = Math.sqrt(sumSqDev / n);

  return { slope, deviation };
}

// ============================================================
// HELPER UTILITIES
// ============================================================

/** Generate array of integers from a to b (exclusive) */
export function range(a: number, b: number): number[] {
  const result: number[] = [];
  for (let i = a; i < b; i++) result.push(i);
  return result;
}
