// ============================================================
// PHUND.CA — Complete Type Definitions
// ============================================================

export type SignalState =
  | "neutral" | "watch_long" | "watch_short"
  | "strong_bullish" | "strong_bearish"
  | "actionable_long" | "actionable_short"
  | "no_trade"
  | "breakout_watch_up" | "breakout_watch_down"
  | "reversal_watch_up" | "reversal_watch_down";

export type TradeMode = "disabled" | "alert_only" | "paper" | "live";
export type TradeDirection = "buy" | "sell";
export type TradeStatus = "intent" | "approved" | "rejected" | "sent" | "filled" | "partial" | "sl_hit" | "tp_hit" | "closed" | "cancelled" | "error";
export type AlertSeverity = "info" | "warning" | "critical" | "trade";
export type RiskLevel = "low" | "moderate" | "elevated" | "high_event_risk";
export type FeedSource = "mt5_broker" | "reference_api" | "manual";

export interface Bar { time: string; open: number; high: number; low: number; close: number; volume: number; }

export interface MT5Indicators {
  ema20?: number|null; ema50?: number|null; ema200?: number|null;
  rsi14?: number|null; macd_line?: number|null; macd_signal?: number|null; macd_hist?: number|null;
  atr14?: number|null; adx14?: number|null; plus_di?: number|null; minus_di?: number|null;
  bb_upper?: number|null; bb_mid?: number|null; bb_lower?: number|null;
}

export interface MT5MarketPayload {
  timestamp: string; account_id: string; terminal_id: string; symbol: string;
  bid: number; ask: number; spread_points: number;
  bars_10m: Bar[]; bars_1h?: Bar[]; bars_4h?: Bar[];
  indicators?: MT5Indicators; server_time?: string;
  dxy_bid?: number; dxy_prev_10m?: number; dxy_prev_30m?: number;
  us10y_bid?: number; us10y_prev_10m?: number; us10y_prev_30m?: number;
}

export interface MT5Position {
  ticket: number; symbol: string; direction: TradeDirection;
  volume: number; open_price: number; current_price: number;
  sl?: number; tp?: number; profit: number; swap: number; open_time: string;
}

export interface MT5AccountPayload {
  timestamp: string; account_id: string; terminal_id: string;
  balance: number; equity: number; margin: number; free_margin: number;
  margin_level?: number; profit: number; positions: MT5Position[];
}

export interface MT5HeartbeatPayload {
  timestamp: string; account_id: string; terminal_id: string;
  connected: boolean; symbols_active: string[]; server_ping_ms?: number;
}

export interface MT5ExecutionResult {
  timestamp: string; account_id: string; terminal_id: string;
  order_id: string; ticket?: number; status: TradeStatus;
  symbol: string; direction: TradeDirection; volume: number;
  price?: number; sl?: number; tp?: number;
  error_code?: number; error_message?: string;
}

export interface FactorResult { score: number; components: Record<string,number>; metadata: Record<string,any>; }

export interface SignalOutput {
  timestamp: string; symbol: string; price: number; bid: number; ask: number; spread: number;
  master_score: number; state: SignalState;
  bull_probability: number; bear_probability: number;
  confidence_label: string; confidence_pct: number;
  factors: Record<string, FactorResult>;
  risk_level: RiskLevel; key_level: number; invalidation: number;
  breakout_watch: string|null; reversal_watch: string|null;
  no_trade: boolean; no_trade_reason: string|null;
  data_quality: "full"|"degraded"|"partial";
  tf_biases: Record<string,number>;
  alert_fired: boolean; alert_reason?: string;
}

export interface MacroData {
  dxy_delta_10m: number; dxy_delta_30m: number;
  us10y_delta_10m: number; us10y_delta_30m: number; live: boolean;
}

export interface StructureLevels {
  pdh: number; pdl: number; swing_high: number; swing_low: number;
  session_high: number; session_low: number;
}

export interface RiskConfig {
  mode: TradeMode; live_enabled: boolean; max_risk_pct: number;
  max_concurrent_trades: number; max_daily_loss_pct: number;
  max_drawdown_pct: number; cooldown_sec: number; max_spread_points: number;
  allowed_sessions: string[]; min_score: number; min_confidence: number;
  sl_atr_mult: number; tp_rr_ratio: number;
}

export interface TradeDecision {
  order_id: string; timestamp: string; symbol: string;
  signal_state: SignalState; master_score: number;
  decision: "no_action"|"alert"|"paper_trade"|"live_trade";
  direction?: TradeDirection; volume?: number;
  entry_price?: number; sl?: number; tp?: number;
  risk_pct?: number;
  rejection_reasons: string[];
  gates: Record<string, { passed: boolean; detail: string }>;
  approved: boolean;
}

export interface TradeRecord {
  order_id: string; timestamp: string; symbol: string;
  direction: TradeDirection; volume: number;
  entry_price: number; sl: number; tp: number;
  status: TradeStatus; mode: TradeMode;
  signal_score: number; signal_state: SignalState;
  risk_pct: number; mt5_ticket?: number;
  fill_price?: number; fill_time?: string;
  exit_price?: number; exit_time?: string;
  profit?: number; close_reason?: string;
  lifecycle: { ts: string; event: string; detail: string }[];
}

export interface TradeInstruction {
  order_id: string; action: "open"|"modify"|"close"|"close_all";
  symbol: string; direction?: TradeDirection; volume?: number;
  price?: number; sl?: number; tp?: number;
  ticket?: number; comment: string; magic_number: number;
}

export interface AlertRecord {
  id: string; timestamp: string; symbol: string; severity: AlertSeverity;
  title: string; body: string; signal_state: string; master_score: number;
  trigger_reason: string; channels_sent: string[]; telegram_sent: boolean;
}

export interface FeedCheck {
  source: FeedSource; symbol: string; status: "ok"|"stale"|"mismatch"|"error";
  last_update: string|null; age_sec: number|null;
  bid?: number; ask?: number; spread?: number;
}

export interface DiagSnapshot {
  timestamp: string; mt5_connected: boolean;
  mt5_last_heartbeat: string|null; mt5_last_payload: string|null;
  mt5_latency_ms: number|null; feeds: FeedCheck[];
  api_uptime_sec: number; total_payloads: number; rejected_payloads: number;
  stale_symbols: string[]; feed_mismatches: number;
  exec_failures: number; notif_failures: number;
  trade_mode: TradeMode; open_positions: number; daily_pnl: number;
  kill_switch: boolean;
}

export interface AuditEntry {
  id: string; timestamp: string; action: string;
  actor: string; detail: string; metadata?: Record<string,any>;
}

export interface IngestResponse {
  accepted: boolean; payload_id?: string;
  warnings: string[]; errors: string[];
  signal?: Partial<SignalOutput>;
  trade_decision?: Partial<TradeDecision>;
  instructions?: TradeInstruction[];
}

// ============================================================
// Store & Cache Types
// ============================================================

export interface MarketCacheEntry {
  bid: number;
  ask: number;
  spread: number;
  last_update: string;
  source: string;
  feed_check: FeedCheck;
  bars_10m: Bar[];
  bars_1h: Bar[];
  bars_4h: Bar[];
}

export interface AlertEngineState {
  prev_state: string | null;
  prev_score: number;
  last_alert_time: number;
}

export interface DiagCounters {
  total: number;
  rejected: number;
  mismatches: number;
  exec_fail: number;
  notif_fail: number;
}

// ============================================================
// GOLD LOGIC AI Types (V2)
// ============================================================

export type GoldMasterBias = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
export type GoldMarketRegime = "TREND" | "RANGE" | "BREAKOUT" | "REVERSAL_RISK" | "EVENT_RISK" | "COMPRESSION";
export type GoldTradeQuality = "A_PLUS" | "A" | "B" | "C" | "NO_TRADE";
export type GoldRiskState = "NORMAL" | "CAUTION" | "HIGH_VOLATILITY" | "EVENT_LOCKOUT";
export type GoldIndicatorDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNAVAILABLE";

export interface GoldIndicatorRow {
  name: string;
  category: "trend" | "momentum" | "volatility" | "structure" | "macro";
  rawValue: number | string | null;
  normalized: number | null;
  direction: GoldIndicatorDirection;
  weight: number;
  reliability: number;
  regimeFit: string;
  status: "active" | "unavailable" | "stale";
}

export interface GoldScenarioBlock {
  trigger: string;
  invalidation: string;
  targets: string[];
}

export interface GoldLogicSnapshot {
  symbol: string;
  timestamp: string;
  price: number;
  masterBias: GoldMasterBias;
  probabilityUp: number;
  confidence: number;
  regime: GoldMarketRegime;
  tradeQuality: GoldTradeQuality;
  riskState: GoldRiskState;
  categoryScores: {
    trend: number;
    momentum: number;
    volatility: number;
    structure: number;
    macro: number;
  };
  timeframeScores: {
    m5: number;
    m10: number;
    m15: number;
    h1: number;
    h4: number;
  };
  indicators: GoldIndicatorRow[];
  scenarios: {
    bull: GoldScenarioBlock;
    bear: GoldScenarioBlock;
    noTrade: {
      reason: string;
      conditionToImprove: string;
    };
  };
  alerts: string[];
  engineVersion: string;
  dataQuality: "full" | "degraded" | "partial";
}
