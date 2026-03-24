// ============================================================
// PHUND.CA — Indicator Weights and Thresholds Configuration
// Centralized configuration for all three analysis engines
// ============================================================

// ============================================================
// SIGNAL ENGINE WEIGHTS
// ============================================================

/** Master factor weights for the main signal engine */
export const SIGNAL_ENGINE_WEIGHTS = {
  master: {
    trend: 0.26,
    momentum: 0.20,
    volatility: 0.10,
    structure: 0.18,
    macro: 0.14,
    session: 0.04,
    exhaustion: 0.04,
    event_risk: 0.04,
  },
  trend: {
    priceVsEma20: 0.10,
    ema20vs50: 0.15,
    ema50vs200: 0.20,
    slope: 0.15,
    h1Bias: 0.20,
    h4Bias: 0.20,
  },
  momentum: {
    rsi: 0.25,
    macd: 0.30,
    roc: 0.15,
    bodyRatio: 0.15,
    persistence: 0.15,
  },
  volatility: {
    atr: 0.30,
    bbWidth: 0.25,
    rangeExpansion: 0.25,
    breakout: 0.20,
  },
  structure: {
    vwap: 0.25,
    prevDay: 0.25,
    swing: 0.20,
    breakout: 0.20,
    rejection: 0.10,
  },
  macro: {
    dxy10m: 0.35,
    dxy30m: 0.25,
    yield10m: 0.25,
    yield30m: 0.15,
  },
  exhaustion: {
    rsi: 0.25,
    divergence: 0.25,
    vwapDeviation: 0.20,
    emaDeviation: 0.15,
    atrSpike: 0.15,
  },
} as const;

// ============================================================
// GOLD LOGIC AI WEIGHTS
// ============================================================

/** Category weights for Gold Logic AI engine */
export const GOLD_LOGIC_WEIGHTS = {
  categories: {
    trend: 0.35,
    momentum: 0.25,
    volatility: 0.15,
    structure: 0.15,
    macro: 0.10,
  },
  trend: {
    ema9: 0.08,
    ema21: 0.10,
    ema50: 0.12,
    ema200: 0.15,
    sma200: 0.10,
    macdLine: 0.10,
    macdHist: 0.08,
    adx: 0.12,
    diDiff: 0.07,
    supertrend: 0.08,
  },
  momentum: {
    rsi: 0.15,
    stochK: 0.12,
    stochD: 0.08,
    cci: 0.15,
    williamsR: 0.12,
    roc: 0.10,
    momentum: 0.10,
    tsi: 0.10,
    macdSignal: 0.08,
  },
  volatility: {
    atr: 0.18,
    natr: 0.12,
    bbWidth: 0.15,
    bbPercentB: 0.15,
    keltnerWidth: 0.12,
    donchianWidth: 0.12,
    atrRatio: 0.16,
  },
  structure: {
    vwap: 0.18,
    zScore: 0.15,
    pivotDistance: 0.15,
    ichimokuScore: 0.18,
    sarDirection: 0.12,
    lrSlope: 0.12,
    atrMultiple: 0.10,
  },
} as const;

// ============================================================
// SPECTRE ENGINE WEIGHTS
// ============================================================

/** Factor weights for Spectre engine */
export const SPECTRE_WEIGHTS = {
  factors: {
    ichimoku: 0.25,
    squeeze: 0.20,
    smartMoney: 0.20,
    fibonacci: 0.20,
    oscillators: 0.15,
  },
  ichimoku: {
    priceVsCloud: 0.35,
    tkCross: 0.30,
    cloudTwist: 0.20,
    chikouBias: 0.15,
  },
  smartMoney: {
    structure: 0.50,
    fvg: 0.30,
    orderBlocks: 0.20,
  },
  oscillators: {
    stochastic: 0.25,
    stochCross: 0.10,
    williamsR: 0.20,
    cci: 0.25,
    supertrend: 0.20,
  },
} as const;

// ============================================================
// INDICATOR THRESHOLDS
// ============================================================

export const INDICATOR_THRESHOLDS = {
  rsi: {
    oversold: 30,
    overbought: 70,
    extremeOversold: 20,
    extremeOverbought: 80,
  },
  stochastic: {
    oversold: 20,
    overbought: 80,
  },
  williamsR: {
    oversold: -80,
    overbought: -20,
  },
  cci: {
    oversold: -100,
    overbought: 100,
  },
  adx: {
    weak: 15,
    moderate: 25,
    strong: 40,
    veryStrong: 50,
  },
  bbWidth: {
    compressed: 0.4,
    expanding: 1.5,
  },
  atr: {
    spikeMultiplier: 2.0,
    lowVolMultiplier: 0.5,
  },
  vwapDeviation: {
    maxAtrMultiple: 2.0,
  },
  emaDeviation: {
    maxAtrMultiple: 2.5,
  },
} as const;

// ============================================================
// EVENT RISK PENALTIES
// ============================================================

export const EVENT_RISK_PENALTIES = {
  /** Minutes before event -> penalty score */
  tiers: [
    { minutes: 120, penalty: 0 },
    { minutes: 60, penalty: -20 },
    { minutes: 30, penalty: -45 },
    { minutes: 15, penalty: -70 },
    { minutes: 0, penalty: -100 },
  ],
  severityThresholds: {
    critical: -70,
    high: -45,
    moderate: -20,
  },
} as const;

// ============================================================
// SESSION SCORING
// ============================================================

export const SESSION_SCORES = {
  "London/NY Overlap": 30,
  "NY Open": 25,
  "London Open": 20,
  "London Session": 20,
  "Late NY": 5,
  "Asia Quiet": -5,
  "Off-hours": -15,
} as const;

// ============================================================
// SIGNAL STATE THRESHOLDS
// ============================================================

export const SIGNAL_THRESHOLDS = {
  strongBullish: 50,
  actionableLong: 25,
  strongBearish: -50,
  actionableShort: -25,
  weakSignal: 8,
  highConfidence: 0.65,
} as const;

// ============================================================
// TRADE QUALITY THRESHOLDS
// ============================================================

export const TRADE_QUALITY = {
  aPlus: {
    minScore: 60,
    minConfidence: 0.80,
    maxEventPenalty: 0,
  },
  a: {
    minScore: 45,
    minConfidence: 0.70,
    maxEventPenalty: -20,
  },
  b: {
    minScore: 30,
    minConfidence: 0.60,
    maxEventPenalty: -45,
  },
  c: {
    minScore: 15,
    minConfidence: 0.50,
    maxEventPenalty: -70,
  },
} as const;
