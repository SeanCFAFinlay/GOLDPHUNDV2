// ============================================================
// PHUND.CA — Trade Decision Engine (V2)
// All risk gates. Paper trade execution. Kill switch.
// Decision generation fully separated from execution dispatch.
// Spread-aware entry pricing. Signal invalidation-first SL.
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

// ============================================================
// SPREAD-AWARE ENTRY PRICE HELPER
// BUY at ASK, SELL at BID — this is how real execution works
// ============================================================
export function getSpreadAwareEntry(signal: SignalOutput, direction: TradeDirection): number {
  // Use actual bid/ask from signal, fallback to price if not available
  if (direction === "buy") {
    return signal.ask > 0 ? signal.ask : signal.price;
  } else {
    return signal.bid > 0 ? signal.bid : signal.price;
  }
}

// ============================================================
// STOP LOSS SELECTION HIERARCHY
// 1. Signal invalidation (if valid and reasonable)
// 2. Structural stop (swing levels)
// 3. ATR-based fallback
// ============================================================
export function selectStopLoss(
  signal: SignalOutput,
  direction: TradeDirection,
  entryPrice: number,
  atrMult: number
): { sl: number; source: "invalidation" | "structure" | "atr" } {
  const atr = signal.factors?.volatility?.metadata?.atr || 3;
  const minSlDistance = atr * 0.5; // Minimum 0.5 ATR to prevent too-tight stops
  const maxSlDistance = atr * 4;   // Maximum 4 ATR to prevent absurd stops

  // 1. Try signal invalidation first
  if (signal.invalidation && signal.invalidation > 0) {
    const invDist = Math.abs(entryPrice - signal.invalidation);
    const isValidDirection = direction === "buy"
      ? signal.invalidation < entryPrice  // SL below entry for buys
      : signal.invalidation > entryPrice; // SL above entry for sells

    if (isValidDirection && invDist >= minSlDistance && invDist <= maxSlDistance) {
      return { sl: +signal.invalidation.toFixed(2), source: "invalidation" };
    }
  }

  // 2. Try structural levels (swing low for buys, swing high for sells)
  const structure = signal.factors?.structure?.metadata;
  if (structure) {
    if (direction === "buy" && structure.swing_low > 0) {
      const swingDist = entryPrice - structure.swing_low;
      if (swingDist >= minSlDistance && swingDist <= maxSlDistance) {
        return { sl: +(structure.swing_low - atr * 0.2).toFixed(2), source: "structure" };
      }
    }
    if (direction === "sell" && structure.swing_high > 0) {
      const swingDist = structure.swing_high - entryPrice;
      if (swingDist >= minSlDistance && swingDist <= maxSlDistance) {
        return { sl: +(structure.swing_high + atr * 0.2).toFixed(2), source: "structure" };
      }
    }
  }

  // 3. ATR-based fallback
  const slDist = atr * atrMult;
  const sl = direction === "buy" ? entryPrice - slDist : entryPrice + slDist;
  return { sl: +sl.toFixed(2), source: "atr" };
}

// ============================================================
// TAKE PROFIT CALCULATION
// Based on actual SL distance for correct R:R
// ============================================================
export function calculateTakeProfit(
  entryPrice: number,
  sl: number,
  direction: TradeDirection,
  rrRatio: number
): number {
  const slDistance = Math.abs(entryPrice - sl);
  const tpDistance = slDistance * rrRatio;
  const tp = direction === "buy" ? entryPrice + tpDistance : entryPrice - tpDistance;
  return +tp.toFixed(2);
}

// ============================================================
// POSITION SIZING (Gold-specific)
// ============================================================
export function calculateVolume(
  balance: number,
  riskPct: number,
  entryPrice: number,
  sl: number,
  minLot = 0.01,
  maxLot = 1.0
): number {
  const slDistance = Math.abs(entryPrice - sl);
  if (slDistance <= 0) return minLot;

  const riskAmount = balance * (riskPct / 100);
  // Gold (XAUUSD): ~$1 per pip per 0.01 lot (approximate)
  // 1 pip = 0.01 for gold, so slDistance * 100 = pips
  // Risk per 0.01 lot = slDistance * 100 * 0.01 = slDistance
  const riskPerLot = slDistance * 100;

  if (riskPerLot <= 0) return minLot;

  let volume = riskAmount / riskPerLot;
  volume = Math.round(volume * 100) / 100; // Round to 2 decimals
  volume = Math.max(minLot, Math.min(volume, maxLot));

  return volume;
}

// ============================================================
// TRADE PREVIEW (for UI display before execution)
// ============================================================
export interface TradePreview {
  direction: TradeDirection;
  entry: number;
  sl: number;
  tp: number;
  slSource: "invalidation" | "structure" | "atr";
  slDistance: number;
  tpDistance: number;
  rrRatio: number;
  volume: number;
  riskAmount: number;
  riskPct: number;
  rewardAmount: number;
  spread: number;
  spreadCost: number;
  valid: boolean;
  validationErrors: string[];
}

export function buildTradePreview(
  signal: SignalOutput,
  direction: TradeDirection,
  balance: number,
  riskPct: number,
  rrRatio: number,
  atrMult: number,
  customSl?: number,
  customTp?: number,
  customVolume?: number
): TradePreview {
  const errors: string[] = [];

  // Get spread-aware entry
  const entry = getSpreadAwareEntry(signal, direction);

  // Get stop loss
  let sl: number;
  let slSource: "invalidation" | "structure" | "atr" = "atr";
  if (customSl && customSl > 0) {
    sl = customSl;
    // Custom SL is user-specified, keep source as "atr" for type compatibility
  } else {
    const slResult = selectStopLoss(signal, direction, entry, atrMult);
    sl = slResult.sl;
    slSource = slResult.source;
  }

  // Validate SL direction
  if (direction === "buy" && sl >= entry) {
    errors.push("SL must be below entry for BUY");
    sl = entry - 3; // Fallback
  }
  if (direction === "sell" && sl <= entry) {
    errors.push("SL must be above entry for SELL");
    sl = entry + 3; // Fallback
  }

  // Calculate TP
  let tp: number;
  if (customTp && customTp > 0) {
    tp = customTp;
  } else {
    tp = calculateTakeProfit(entry, sl, direction, rrRatio);
  }

  // Validate TP direction
  if (direction === "buy" && tp <= entry) {
    errors.push("TP must be above entry for BUY");
    tp = entry + Math.abs(entry - sl) * rrRatio;
  }
  if (direction === "sell" && tp >= entry) {
    errors.push("TP must be below entry for SELL");
    tp = entry - Math.abs(entry - sl) * rrRatio;
  }

  const slDistance = Math.abs(entry - sl);
  const tpDistance = Math.abs(tp - entry);
  const actualRR = slDistance > 0 ? tpDistance / slDistance : 0;

  // Calculate volume
  const volume = customVolume || calculateVolume(balance, riskPct, entry, sl);
  const riskAmount = slDistance * volume * 100;
  const rewardAmount = tpDistance * volume * 100;

  // Spread cost
  const spread = signal.spread || 0;
  const spreadCost = spread * volume * 0.01; // Approximate spread cost in dollars

  // Validate minimum distance
  const atr = signal.factors?.volatility?.metadata?.atr || 3;
  if (slDistance < atr * 0.3) {
    errors.push("SL too close to entry");
  }

  return {
    direction,
    entry: +entry.toFixed(2),
    sl: +sl.toFixed(2),
    tp: +tp.toFixed(2),
    slSource,
    slDistance: +slDistance.toFixed(2),
    tpDistance: +tpDistance.toFixed(2),
    rrRatio: +actualRR.toFixed(2),
    volume,
    riskAmount: +riskAmount.toFixed(2),
    riskPct,
    rewardAmount: +rewardAmount.toFixed(2),
    spread,
    spreadCost: +spreadCost.toFixed(2),
    valid: errors.length === 0,
    validationErrors: errors,
  };
}

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
  // Use spread-aware entry pricing (BUY at ASK, SELL at BID)
  const entryPrice = getSpreadAwareEntry(signal, dir);

  // Use hierarchical stop loss selection (invalidation > structure > ATR)
  const slResult = selectStopLoss(signal, dir, entryPrice, config.sl_atr_mult);

  // Calculate TP based on actual SL distance
  const tp = calculateTakeProfit(entryPrice, slResult.sl, dir, config.tp_rr_ratio);

  // Calculate volume based on actual risk
  const volume = calculateVolume(account.balance, config.max_risk_pct, entryPrice, slResult.sl);

  d.entry_price = entryPrice;
  d.volume = volume;
  d.risk_pct = config.max_risk_pct;
  d.sl = slResult.sl;
  d.tp = tp;
  d.approved = true;

  // Log SL source for transparency
  d.gates.sl_source = { passed: true, detail: `SL from ${slResult.source}: ${slResult.sl}` };

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

  const slSource = decision.gates?.sl_source?.detail || "ATR-based";

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
      { ts: new Date().toISOString(), event: "filled", detail: `Paper fill @ ${decision.entry_price} vol=${decision.volume} | ${slSource}` },
    ],
  };
}

// ============================================================
// MANUAL PAPER TRADE EXECUTOR
// For dashboard-initiated trades with custom parameters
// ============================================================

export interface ManualTradeParams {
  symbol: string;
  direction: TradeDirection;
  volume: number;
  entryPrice: number;  // Should be bid for sell, ask for buy
  sl: number;
  tp: number;
  signalScore?: number;
  signalState?: string;
}

export function executeManualPaperTrade(params: ManualTradeParams): TradeRecord {
  const now = new Date().toISOString();
  const orderId = UID();

  // Validate SL/TP direction
  if (params.direction === "buy") {
    if (params.sl >= params.entryPrice) throw new Error("SL must be below entry for BUY");
    if (params.tp <= params.entryPrice) throw new Error("TP must be above entry for BUY");
  } else {
    if (params.sl <= params.entryPrice) throw new Error("SL must be above entry for SELL");
    if (params.tp >= params.entryPrice) throw new Error("TP must be below entry for SELL");
  }

  // Calculate risk percentage (approximate)
  const slDist = Math.abs(params.entryPrice - params.sl);
  const riskAmount = slDist * params.volume * 100;
  const assumedBalance = 10000; // Will be refined when we have account access
  const riskPct = (riskAmount / assumedBalance) * 100;

  return {
    order_id: orderId,
    timestamp: now,
    symbol: params.symbol,
    direction: params.direction,
    volume: params.volume,
    entry_price: params.entryPrice,
    sl: params.sl,
    tp: params.tp,
    status: "filled",
    mode: "paper",
    signal_score: params.signalScore || 0,
    signal_state: (params.signalState || "manual") as any,
    risk_pct: +riskPct.toFixed(2),
    fill_price: params.entryPrice,
    fill_time: now,
    lifecycle: [
      { ts: now, event: "manual_entry", detail: `Manual ${params.direction.toUpperCase()} ${params.volume} @ ${params.entryPrice}` },
      { ts: now, event: "filled", detail: `SL: ${params.sl} | TP: ${params.tp}` },
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
// Uses bid for exit checks (buy closes at bid, sell closes at ask but we check bid conservatively)
// ============================================================

export interface PaperTradeUpdateResult {
  trades: TradeRecord[];
  changed: TradeRecord[];  // Trades that had status change (SL/TP hit)
}

export function updatePaperTrades(trades: TradeRecord[], currentBid: number, currentAsk?: number): PaperTradeUpdateResult {
  const changed: TradeRecord[] = [];
  // For sells, exit at ask; for buys, exit at bid
  // If ask not provided, estimate it from spread (typical 3-4 points for gold)
  const ask = currentAsk || currentBid + 3;

  const updated = trades.map(t => {
    if (t.status !== "filled" || t.mode !== "paper") return t;

    // P&L calculation
    // Buys: profit = (current_bid - entry) * volume * 100
    // Sells: profit = (entry - current_ask) * volume * 100
    const exitPrice = t.direction === "buy" ? currentBid : ask;
    const pnl = t.direction === "buy"
      ? (currentBid - t.entry_price) * t.volume * 100
      : (t.entry_price - ask) * t.volume * 100;

    const now = new Date().toISOString();

    // Check SL/TP hits using appropriate price
    // BUY: check bid against SL (if bid drops to SL), bid against TP (if bid rises to TP)
    // SELL: check ask against SL (if ask rises to SL), ask against TP (if ask drops to TP)

    if (t.direction === "buy") {
      if (currentBid <= t.sl) {
        const closedTrade = {
          ...t,
          status: "sl_hit" as const,
          exit_price: t.sl,
          exit_time: now,
          profit: +((t.sl - t.entry_price) * t.volume * 100).toFixed(2),
          close_reason: "Stop Loss",
          lifecycle: [...t.lifecycle, { ts: now, event: "sl_hit", detail: `Bid ${currentBid.toFixed(2)} hit SL ${t.sl}` }]
        };
        changed.push(closedTrade);
        return closedTrade;
      }
      if (currentBid >= t.tp) {
        const closedTrade = {
          ...t,
          status: "tp_hit" as const,
          exit_price: t.tp,
          exit_time: now,
          profit: +((t.tp - t.entry_price) * t.volume * 100).toFixed(2),
          close_reason: "Take Profit",
          lifecycle: [...t.lifecycle, { ts: now, event: "tp_hit", detail: `Bid ${currentBid.toFixed(2)} hit TP ${t.tp}` }]
        };
        changed.push(closedTrade);
        return closedTrade;
      }
    }

    if (t.direction === "sell") {
      if (ask >= t.sl) {
        const closedTrade = {
          ...t,
          status: "sl_hit" as const,
          exit_price: t.sl,
          exit_time: now,
          profit: +((t.entry_price - t.sl) * t.volume * 100).toFixed(2),
          close_reason: "Stop Loss",
          lifecycle: [...t.lifecycle, { ts: now, event: "sl_hit", detail: `Ask ${ask.toFixed(2)} hit SL ${t.sl}` }]
        };
        changed.push(closedTrade);
        return closedTrade;
      }
      if (ask <= t.tp) {
        const closedTrade = {
          ...t,
          status: "tp_hit" as const,
          exit_price: t.tp,
          exit_time: now,
          profit: +((t.entry_price - t.tp) * t.volume * 100).toFixed(2),
          close_reason: "Take Profit",
          lifecycle: [...t.lifecycle, { ts: now, event: "tp_hit", detail: `Ask ${ask.toFixed(2)} hit TP ${t.tp}` }]
        };
        changed.push(closedTrade);
        return closedTrade;
      }
    }

    return { ...t, profit: +pnl.toFixed(2) };
  });

  return { trades: updated, changed };
}

// ============================================================
// PAPER TRADE MODIFICATION
// ============================================================

export function modifyPaperTrade(
  trade: TradeRecord,
  newSl?: number,
  newTp?: number
): TradeRecord {
  if (trade.status !== "filled") {
    throw new Error("Can only modify open (filled) trades");
  }

  const now = new Date().toISOString();
  const modifications: string[] = [];

  let updatedSl = trade.sl;
  let updatedTp = trade.tp;

  // Validate and apply new SL
  if (newSl !== undefined && newSl !== trade.sl) {
    if (trade.direction === "buy" && newSl >= trade.entry_price) {
      throw new Error("SL must be below entry for BUY positions");
    }
    if (trade.direction === "sell" && newSl <= trade.entry_price) {
      throw new Error("SL must be above entry for SELL positions");
    }
    modifications.push(`SL: ${trade.sl} → ${newSl}`);
    updatedSl = newSl;
  }

  // Validate and apply new TP
  if (newTp !== undefined && newTp !== trade.tp) {
    if (trade.direction === "buy" && newTp <= trade.entry_price) {
      throw new Error("TP must be above entry for BUY positions");
    }
    if (trade.direction === "sell" && newTp >= trade.entry_price) {
      throw new Error("TP must be below entry for SELL positions");
    }
    modifications.push(`TP: ${trade.tp} → ${newTp}`);
    updatedTp = newTp;
  }

  if (modifications.length === 0) {
    return trade; // No changes
  }

  return {
    ...trade,
    sl: updatedSl,
    tp: updatedTp,
    lifecycle: [
      ...trade.lifecycle,
      { ts: now, event: "modified", detail: modifications.join(", ") }
    ]
  };
}

// ============================================================
// PAPER TRADE MANUAL CLOSE
// ============================================================

export function closePaperTrade(
  trade: TradeRecord,
  exitPrice: number,
  reason = "Manual close"
): TradeRecord {
  if (trade.status !== "filled") {
    throw new Error("Can only close open (filled) trades");
  }

  const now = new Date().toISOString();
  const pnl = trade.direction === "buy"
    ? (exitPrice - trade.entry_price) * trade.volume * 100
    : (trade.entry_price - exitPrice) * trade.volume * 100;

  return {
    ...trade,
    status: "closed",
    exit_price: exitPrice,
    exit_time: now,
    profit: +pnl.toFixed(2),
    close_reason: reason,
    lifecycle: [
      ...trade.lifecycle,
      { ts: now, event: "closed", detail: `${reason} @ ${exitPrice} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` }
    ]
  };
}

// ============================================================
// MOVE SL TO BREAKEVEN
// ============================================================

export function moveToBreakeven(trade: TradeRecord, buffer = 0.5): TradeRecord {
  if (trade.status !== "filled") {
    throw new Error("Can only modify open (filled) trades");
  }

  // Add small buffer beyond entry to ensure slight profit
  const beLevel = trade.direction === "buy"
    ? trade.entry_price + buffer
    : trade.entry_price - buffer;

  // Only move if it improves the stop
  if (trade.direction === "buy" && beLevel <= trade.sl) {
    throw new Error("Breakeven would worsen stop position");
  }
  if (trade.direction === "sell" && beLevel >= trade.sl) {
    throw new Error("Breakeven would worsen stop position");
  }

  return modifyPaperTrade(trade, beLevel, undefined);
}
