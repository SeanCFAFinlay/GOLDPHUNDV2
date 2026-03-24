// ============================================================
// PHUND.CA — Trade Decision Engine
// All risk gates. Paper trade execution. Kill switch.
// Decision generation fully separated from execution dispatch.
// ============================================================

import type { SignalOutput, TradeDecision, TradeRecord, TradeInstruction, TradeDirection, RiskConfig } from "./types";

const UID = () => `PHD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`.toUpperCase();

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  mode: "live", live_enabled: true, max_risk_pct: 1.0,
  max_concurrent_trades: 3, max_daily_loss_pct: 3.0, max_drawdown_pct: 5.0,
  cooldown_sec: 300, max_spread_points: 40,
  allowed_sessions: ["London Session", "NY Open", "London/NY Overlap", "Late NY"],
  min_score: 25, min_confidence: 0.60, sl_atr_mult: 1.5, tp_rr_ratio: 2.0,
};

export interface AccountSnapshot {
  balance: number; equity: number; open_positions: number;
  daily_pnl: number; peak_equity: number; last_trade_time: number|null;
}

// ============================================================
// RISK GATE EVALUATOR
// ============================================================

export function evaluateTradeDecision(
  signal: SignalOutput,
  account: AccountSnapshot,
  config: RiskConfig,
  currentSpread: number,
): TradeDecision {
  const d: TradeDecision = {
    order_id: UID(), timestamp: new Date().toISOString(), symbol: signal.symbol,
    signal_state: signal.state, master_score: signal.master_score,
    decision: "no_action", rejection_reasons: [], gates: {}, approved: false,
  };

  // Gate 1: Mode
  if (config.mode === "disabled") {
    d.gates.mode = { passed: false, detail: "Trade mode disabled" };
    d.rejection_reasons.push("Disabled"); return d;
  }
  d.gates.mode = { passed: true, detail: `Mode: ${config.mode}` };

  // Gate 2: No-trade signal
  if (signal.no_trade) {
    d.gates.signal = { passed: false, detail: `No trade: ${signal.no_trade_reason}` };
    d.rejection_reasons.push(signal.no_trade_reason || "No trade");
    d.decision = config.mode === "alert_only" ? "alert" : "no_action"; return d;
  }

  // Gate 3: Direction
  let dir: TradeDirection | null = null;
  if (["strong_bullish","actionable_long","watch_long","breakout_watch_up"].includes(signal.state)) dir = "buy";
  else if (["strong_bearish","actionable_short","watch_short","breakout_watch_down"].includes(signal.state)) dir = "sell";
  if (!dir) {
    d.gates.direction = { passed: false, detail: `Non-directional: ${signal.state}` };
    d.rejection_reasons.push("No direction"); d.decision = "alert"; return d;
  }
  d.direction = dir;
  d.gates.direction = { passed: true, detail: dir };

  // Gate 4: Score threshold
  if (Math.abs(signal.master_score) < config.min_score) {
    d.gates.score = { passed: false, detail: `|${signal.master_score.toFixed(1)}| < ${config.min_score}` };
    d.rejection_reasons.push(`Score below ${config.min_score}`); d.decision = "alert"; return d;
  }
  d.gates.score = { passed: true, detail: `${signal.master_score.toFixed(1)} ≥ ${config.min_score}` };

  // Gate 5: Confidence
  if (signal.confidence_pct < config.min_confidence) {
    d.gates.confidence = { passed: false, detail: `${(signal.confidence_pct*100).toFixed(0)}% < ${(config.min_confidence*100).toFixed(0)}%` };
    d.rejection_reasons.push("Low confidence"); d.decision = "alert"; return d;
  }
  d.gates.confidence = { passed: true, detail: `${(signal.confidence_pct*100).toFixed(0)}%` };

  // Gate 6: Spread
  if (currentSpread > config.max_spread_points) {
    d.gates.spread = { passed: false, detail: `${currentSpread} > ${config.max_spread_points}` };
    d.rejection_reasons.push("Spread too wide"); d.decision = "alert"; return d;
  }
  d.gates.spread = { passed: true, detail: `${currentSpread.toFixed(1)} ≤ ${config.max_spread_points}` };

  // Gate 7: Session
  const sess = signal.factors?.session?.metadata?.label || "";
  if (config.allowed_sessions.length && !config.allowed_sessions.some(s => sess.includes(s) || s.includes(sess))) {
    d.gates.session = { passed: false, detail: `'${sess}' not allowed` };
    d.rejection_reasons.push(`Session '${sess}' blocked`); d.decision = "alert"; return d;
  }
  d.gates.session = { passed: true, detail: sess };

  // Gate 8: Concurrent trades
  if (account.open_positions >= config.max_concurrent_trades) {
    d.gates.concurrent = { passed: false, detail: `${account.open_positions} ≥ ${config.max_concurrent_trades}` };
    d.rejection_reasons.push("Max concurrent trades"); d.decision = "alert"; return d;
  }
  d.gates.concurrent = { passed: true, detail: `${account.open_positions}/${config.max_concurrent_trades}` };

  // Gate 9: Daily loss stop
  const dailyLossPct = account.balance > 0 ? Math.abs(Math.min(0, account.daily_pnl)) / account.balance * 100 : 0;
  if (account.daily_pnl < 0 && dailyLossPct >= config.max_daily_loss_pct) {
    d.gates.daily_loss = { passed: false, detail: `${dailyLossPct.toFixed(1)}% ≥ ${config.max_daily_loss_pct}%` };
    d.rejection_reasons.push("Daily loss limit"); d.decision = "no_action"; return d;
  }
  d.gates.daily_loss = { passed: true, detail: `${dailyLossPct.toFixed(1)}%` };

  // Gate 10: Drawdown kill switch
  const ddPct = account.peak_equity > 0 ? (1 - account.equity / account.peak_equity) * 100 : 0;
  if (ddPct >= config.max_drawdown_pct) {
    d.gates.drawdown = { passed: false, detail: `KILL SWITCH: ${ddPct.toFixed(1)}% ≥ ${config.max_drawdown_pct}%` };
    d.rejection_reasons.push("DRAWDOWN KILL SWITCH"); d.decision = "no_action"; return d;
  }
  d.gates.drawdown = { passed: true, detail: `${ddPct.toFixed(1)}%` };

  // Gate 11: Cooldown
  if (account.last_trade_time) {
    const elapsed = (Date.now() - account.last_trade_time) / 1000;
    if (elapsed < config.cooldown_sec) {
      d.gates.cooldown = { passed: false, detail: `${(config.cooldown_sec - elapsed).toFixed(0)}s remaining` };
      d.rejection_reasons.push("Cooldown"); d.decision = "alert"; return d;
    }
  }
  d.gates.cooldown = { passed: true, detail: "Clear" };

  // === ALL GATES PASSED: compute trade params ===
  const atr = signal.factors?.volatility?.metadata?.atr || 3;
  const slDist = atr * config.sl_atr_mult;
  const tpDist = slDist * config.tp_rr_ratio;
  const riskAmount = account.balance * (config.max_risk_pct / 100);
  // Gold: ~$1 per pip per 0.01 lot for XAUUSD (approx)
  // Volume calculation: riskAmount / (stopLossPoints * pointValue)
  // For XAUUSD: 1 pip = $1 per 0.01 lot, so slDist * 100 gives dollar risk per 0.01 lot
  let volume = slDist > 0 ? Math.round((riskAmount / (slDist * 100)) * 100) / 100 : 0.01;
  volume = Math.max(0.01, Math.min(volume, 1.0));

  d.entry_price = signal.price;
  d.volume = volume;
  d.risk_pct = config.max_risk_pct;
  d.sl = dir === "buy" ? +(signal.price - slDist).toFixed(2) : +(signal.price + slDist).toFixed(2);
  d.tp = dir === "buy" ? +(signal.price + tpDist).toFixed(2) : +(signal.price - tpDist).toFixed(2);
  d.approved = true;

  // Route to correct mode
  if (config.mode === "alert_only") d.decision = "alert";
  else if (config.mode === "paper") d.decision = "paper_trade";
  else if (config.mode === "live" && config.live_enabled) d.decision = "live_trade";
  else { d.decision = "paper_trade"; d.rejection_reasons.push("Live not enabled, routing to paper"); }

  return d;
}

// ============================================================
// PAPER TRADE EXECUTOR
// ============================================================

export function executePaperTrade(decision: TradeDecision): TradeRecord | null {
  if (!decision.approved || decision.decision !== "paper_trade") return null;
  return {
    order_id: decision.order_id, timestamp: decision.timestamp,
    symbol: decision.symbol, direction: decision.direction!,
    volume: decision.volume!, entry_price: decision.entry_price!,
    sl: decision.sl!, tp: decision.tp!,
    status: "filled", mode: "paper",
    signal_score: decision.master_score, signal_state: decision.signal_state,
    risk_pct: decision.risk_pct!,
    fill_price: decision.entry_price!, fill_time: new Date().toISOString(),
    lifecycle: [
      { ts: decision.timestamp, event: "intent", detail: `Signal: ${decision.signal_state} score=${decision.master_score}` },
      { ts: new Date().toISOString(), event: "approved", detail: `All ${Object.keys(decision.gates).length} gates passed` },
      { ts: new Date().toISOString(), event: "filled", detail: `Paper fill @ ${decision.entry_price} vol=${decision.volume}` },
    ],
  };
}

// ============================================================
// LIVE TRADE INSTRUCTION BUILDER
// ============================================================

export function buildTradeInstruction(decision: TradeDecision): TradeInstruction | null {
  if (!decision.approved || decision.decision !== "live_trade") return null;
  return {
    order_id: decision.order_id, action: "open",
    symbol: decision.symbol, direction: decision.direction,
    volume: decision.volume, price: 0, // market
    sl: decision.sl, tp: decision.tp,
    comment: `phund_${decision.signal_state}`, magic_number: 20250101,
  };
}

// ============================================================
// PAPER TRADE P&L UPDATER
// ============================================================

export function updatePaperTrades(trades: TradeRecord[], currentPrice: number): TradeRecord[] {
  return trades.map(t => {
    if (t.status !== "filled" || t.mode !== "paper") return t;
    const pnl = t.direction === "buy"
      ? (currentPrice - t.entry_price) * t.volume * 100
      : (t.entry_price - currentPrice) * t.volume * 100;
    // Check SL/TP hits
    if (t.direction === "buy" && currentPrice <= t.sl) {
      return { ...t, status: "sl_hit" as const, exit_price: t.sl, exit_time: new Date().toISOString(), profit: (t.sl - t.entry_price) * t.volume * 100, close_reason: "SL hit", lifecycle: [...t.lifecycle, { ts: new Date().toISOString(), event: "sl_hit", detail: `Price ${currentPrice} hit SL ${t.sl}` }] };
    }
    if (t.direction === "buy" && currentPrice >= t.tp) {
      return { ...t, status: "tp_hit" as const, exit_price: t.tp, exit_time: new Date().toISOString(), profit: (t.tp - t.entry_price) * t.volume * 100, close_reason: "TP hit", lifecycle: [...t.lifecycle, { ts: new Date().toISOString(), event: "tp_hit", detail: `Price ${currentPrice} hit TP ${t.tp}` }] };
    }
    if (t.direction === "sell" && currentPrice >= t.sl) {
      return { ...t, status: "sl_hit" as const, exit_price: t.sl, exit_time: new Date().toISOString(), profit: (t.entry_price - t.sl) * t.volume * 100, close_reason: "SL hit", lifecycle: [...t.lifecycle, { ts: new Date().toISOString(), event: "sl_hit", detail: `Price ${currentPrice} hit SL ${t.sl}` }] };
    }
    if (t.direction === "sell" && currentPrice <= t.tp) {
      return { ...t, status: "tp_hit" as const, exit_price: t.tp, exit_time: new Date().toISOString(), profit: (t.entry_price - t.tp) * t.volume * 100, close_reason: "TP hit", lifecycle: [...t.lifecycle, { ts: new Date().toISOString(), event: "tp_hit", detail: `Price ${currentPrice} hit TP ${t.tp}` }] };
    }
    return { ...t, profit: +pnl.toFixed(2) };
  });
}
