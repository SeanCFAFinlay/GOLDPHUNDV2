// ============================================================
// PHUND.CA — Centralized Threshold Configuration
// Anti-Trap, Exhaustion Detection, Entry Conditions, Risk Limits
// ============================================================

// ============================================================
// EXHAUSTION DETECTION
// ============================================================

/** Impulse size thresholds for exhaustion detection */
export const EXHAUSTION = {
  /** Move > 2.5 ATR = extreme impulse (high exhaustion risk) */
  IMPULSE_SIZE_EXTREME_ATR: 2.5,
  /** Move > 1.8 ATR = large impulse (caution) */
  IMPULSE_SIZE_LARGE_ATR: 1.8,
  /** Range < 0.5 ATR = consolidation */
  CONSOLIDATION_RANGE_ATR: 0.5,
  /** Min bars to confirm consolidation */
  CONSOLIDATION_MIN_BARS: 4,
  /** EMA/VWAP reclaim requires 50% pullback */
  RECLAIM_THRESHOLD: 0.5,
} as const;

// ============================================================
// ANTI-TRAP DETECTION
// ============================================================

/** Anti-trap thresholds for divergence and confirmation */
export const ANTI_TRAP = {
  /** RSI must diverge by 5+ points for divergence signal */
  DIVERGENCE_RSI_THRESHOLD: 5,
  /** Bars to check for divergence */
  DIVERGENCE_LOOKBACK_BARS: 10,
  /** EMA slope must exceed 0.15/bar for trend confirmation */
  EMA_SLOPE_MIN: 0.15,
  /** Momentum RSI threshold for reclaim confirmation */
  RECLAIM_RSI_THRESHOLD: 45,
} as const;

// ============================================================
// ENTRY CONDITIONS
// ============================================================

/** Entry condition thresholds for confirmation */
export const ENTRY_CONDITIONS = {
  /** LH must be 0.2 ATR below prior high for confirmation */
  LH_CONFIRMATION_BUFFER_ATR: 0.2,
  /** Breakdown candle body > 60% of range */
  BREAKDOWN_BODY_MIN_PCT: 0.6,
  /** Close must break level by 30% of ATR */
  BREAKDOWN_CLOSE_BEYOND_ATR_PCT: 0.3,
  /** HH must be 0.2 ATR above prior high */
  HH_CONFIRMATION_BUFFER_ATR: 0.2,
} as const;

// ============================================================
// RISK LIMITS
// ============================================================

/** Risk management thresholds */
export const RISK_LIMITS = {
  /** Max SL distance as % of account balance */
  STOP_SIZE_MAX_PCT: 2.0,
  /** Must be 0.5R in profit to add same direction */
  PROFIT_LOCK_MIN_R: 0.5,
  /** Minimum risk per trade (%) */
  MIN_RISK_PCT: 0.5,
  /** Maximum risk per trade (%) */
  MAX_RISK_PCT: 2.0,
} as const;

// ============================================================
// TRAP SCORE WEIGHTS
// ============================================================

/** Weights for computing trap score (0-100) */
export const TRAP_SCORE_WEIGHTS = {
  /** Weight for extreme impulse in trap score */
  EXTREME_IMPULSE: 30,
  /** Weight for large impulse in trap score */
  LARGE_IMPULSE: 15,
  /** Weight for consolidation in trap score */
  CONSOLIDATION: 20,
  /** Weight for EMA reclaim in trap score */
  EMA_RECLAIM: 15,
  /** Weight for VWAP reclaim in trap score */
  VWAP_RECLAIM: 10,
  /** Weight for divergence in trap score */
  DIVERGENCE: 20,
  /** Weight for weak slope in trap score */
  WEAK_SLOPE: 10,
} as const;

// ============================================================
// REGIME THRESHOLDS (enhanced)
// ============================================================

/** Enhanced regime classification thresholds */
export const REGIME = {
  /** Minimum EMA50 slope for bullish trend */
  EMA_SLOPE_BULLISH_MIN: 0.15,
  /** Maximum EMA50 slope for bearish trend (negative) */
  EMA_SLOPE_BEARISH_MAX: -0.15,
  /** ADX threshold for trend confirmation */
  ADX_TREND_MIN: 22,
  /** ADX threshold for strong trend */
  ADX_STRONG_TREND: 35,
  /** ADX threshold for chop market */
  ADX_CHOP: 18,
  /** ATR expansion ratio for breakout detection */
  ATR_EXPANSION_RATIO: 1.35,
  /** Minimum structure confidence for reversal call */
  REVERSAL_CONFIDENCE_MIN: 60,
} as const;

// ============================================================
// STRUCTURE THRESHOLDS (enhanced)
// ============================================================

/** Enhanced structure detection thresholds */
export const STRUCTURE = {
  /** Minimum bars needed for structure analysis */
  MIN_BARS_REQUIRED: 10,
  /** Swing lookback for detection */
  SWING_LOOKBACK: 3,
  /** HH/HL/LH/LL minimum difference threshold (ATR multiplier) */
  SWING_DIFF_THRESHOLD_ATR: 0.1,
} as const;

// ============================================================
// EXPORT ALL THRESHOLDS
// ============================================================

export const THRESHOLDS = {
  EXHAUSTION,
  ANTI_TRAP,
  ENTRY_CONDITIONS,
  RISK_LIMITS,
  TRAP_SCORE_WEIGHTS,
  REGIME,
  STRUCTURE,
} as const;
