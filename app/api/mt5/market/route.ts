// ============================================================
// POST /api/mt5/market — Core ingest pipeline
// Validates → Signal Engine → Trade Decision → Telegram → Persist
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { runSignalEngine } from "@/lib/signal-engine";
import { sendTelegram, formatAlert, shouldFireAlert, makeAlertRecord } from "@/lib/telegram";
import { evaluateTradeDecision, executePaperTrade, buildTradeInstruction, updatePaperTrades, DEFAULT_RISK_CONFIG, type AccountSnapshot, type PaperTradeUpdateResult } from "@/lib/trade-engine";
import { updateTrade } from "@/lib/store";
import { validateMarketPayload, validateFeed, incPayloads, incRejected, audit, slog } from "@/lib/diagnostics";
import { saveSignal, saveAlert, saveMarket, saveTrade, getAlertState, setAlertState, getRiskConfig, getOpenTrades, getAccount, addPendingInstruction, incDiagCounter, saveAuditEntry, saveV2State } from "@/lib/store";
import { env } from "@/lib/config/env";
import type { MT5MarketPayload, MacroData } from "@/lib/types";
import { runGoldV2Pipeline, v2GatesSignalDirection } from "@/lib/engines/gold-v2-pipeline";

/**
 * Timing-safe string comparison to prevent timing attacks on API key validation.
 * Returns true if strings are equal, false otherwise.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time behavior
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function auth(req: NextRequest): boolean {
  const expectedKey = env.mt5ApiKey;
  // If no API key configured, allow all requests (development mode)
  if (!expectedKey) {
    return true;
  }
  const providedKey = req.headers.get("X-MT5-Key") || req.headers.get("x-mt5-key") || "";
  return timingSafeEqual(providedKey, expectedKey);
}
function fresh(ts: string): boolean {
  try { return Math.abs(Date.now() - new Date(ts).getTime()) / 1000 <= env.mt5PayloadMaxAge; } catch { return false; }
}
function normSym(s: string): string {
  let r = s.toUpperCase().trim();
  for (const x of [".RAW",".ECN",".PRO",".STD",".M",".S"]) if (r.endsWith(x)) r = r.slice(0, -x.length);
  return r;
}

export async function POST(req: NextRequest) {
  const payloadId = `M-${Date.now().toString(36)}`;
  const t0 = Date.now();

  try {
    // --- Auth ---
    if (!auth(req)) {
      incRejected(); await incDiagCounter("rejected");
      slog("WARN", "market", "Auth failed", { payloadId });
      return NextResponse.json({ accepted: false, errors: ["Invalid key"], payload_id: payloadId }, { status: 401 });
    }

    const raw = await req.json();
    incPayloads(); await incDiagCounter("total");

    // --- Strict payload validation ---
    const validation = validateMarketPayload(raw);
    if (!validation.valid) {
      incRejected(); await incDiagCounter("rejected");
      slog("WARN", "market", "Payload rejected", { payloadId, errors: validation.errors });
      return NextResponse.json({ accepted: false, errors: validation.errors, warnings: validation.warnings, payload_id: payloadId }, { status: 400 });
    }

    const p: MT5MarketPayload = raw;

    // --- Freshness ---
    if (p.timestamp && !fresh(p.timestamp)) {
      incRejected(); await incDiagCounter("rejected");
      slog("WARN", "market", "Stale payload", { payloadId, ts: p.timestamp });
      return NextResponse.json({ accepted: false, errors: ["Stale payload"], payload_id: payloadId }, { status: 400 });
    }

    const sym = normSym(p.symbol);
    const allWarnings = [...validation.warnings];

    // --- Feed validation ---
    const feedCheck = validateFeed(sym, p.bid, p.ask, p.timestamp);
    if (feedCheck.status !== "ok") allWarnings.push(`Feed: ${feedCheck.status}`);

    // --- Build macro data ---
    const macro: MacroData = {
      dxy_delta_10m: p.dxy_bid && p.dxy_prev_10m ? (p.dxy_bid - p.dxy_prev_10m) / p.dxy_prev_10m : 0,
      dxy_delta_30m: p.dxy_bid && p.dxy_prev_30m ? (p.dxy_bid - p.dxy_prev_30m) / p.dxy_prev_30m : 0,
      us10y_delta_10m: p.us10y_bid && p.us10y_prev_10m ? (p.us10y_bid - p.us10y_prev_10m) / p.us10y_prev_10m : 0,
      us10y_delta_30m: p.us10y_bid && p.us10y_prev_30m ? (p.us10y_bid - p.us10y_prev_30m) / p.us10y_prev_30m : 0,
      live: !!(p.dxy_bid && p.us10y_bid),
    };
    if (!macro.live) allWarnings.push("Macro factor using zero — DXY/yield not in payload");

    // --- Run Signal Engine ---
    const sig = runSignalEngine(p.bars_10m, p.bars_1h, p.bars_4h, macro, undefined, sym, p.bid, p.ask, p.spread_points);

    // --- Alert Engine ---
    const alertSt = await getAlertState();
    const alertDec = shouldFireAlert(sig, alertSt);
    let tgSent = false;

    if (alertDec.fire) {
      sig.alert_fired = true; sig.alert_reason = alertDec.reason;
      if (env.hasTelegram) {
        const r = await sendTelegram(env.telegramBotToken, env.telegramChatId, formatAlert(sig));
        tgSent = r.ok;
        if (!r.ok) { await incDiagCounter("notif_fail"); slog("ERROR", "telegram", "Send failed", { error: r.error }); }
      }
      const alertRec = makeAlertRecord(sig, alertDec.reason, alertDec.severity, tgSent);
      await saveAlert(alertRec);
      await setAlertState({ prev_state: sig.state, prev_score: sig.master_score, last_alert_time: Date.now() });
    } else {
      await setAlertState({ ...alertSt, prev_state: sig.state, prev_score: sig.master_score });
    }

    // --- Trade Decision Engine ---
    const riskCfg = (await getRiskConfig()) || DEFAULT_RISK_CONFIG;
    riskCfg.mode = env.tradeMode || riskCfg.mode || "paper";

    const acct = await getAccount(p.account_id || "ox_main");
    const openTrades = await getOpenTrades();
    const accountSnap: AccountSnapshot = {
      balance: acct?.balance || 10000, equity: acct?.equity || 10000,
      open_positions: openTrades.length + (acct?.positions?.length || 0),
      daily_pnl: acct?.profit || 0, peak_equity: Math.max(acct?.equity || 10000, acct?.balance || 10000),
      last_trade_time: openTrades.length > 0 ? new Date(openTrades[0].timestamp).getTime() : null,
    };

    // --- Gold V2 Pipeline ---
    // Determine candidate direction from V1 signal for quality evaluation
    let candidateDirection: "buy" | "sell" | null = null;
    if (["strong_bullish","actionable_long","watch_long","breakout_watch_up"].includes(sig.state)) candidateDirection = "buy";
    else if (["strong_bearish","actionable_short","watch_short","breakout_watch_down"].includes(sig.state)) candidateDirection = "sell";

    let v2State = null;
    let v2Block = false;
    let v2BlockReasons: string[] = [];
    try {
      v2State = runGoldV2Pipeline(p, {
        openTrades,
        dailyPnL: acct?.profit || 0,
        balance: acct?.balance || 10000,
        tradeDirection: candidateDirection,
      });

      // Check if V2 gates the candidate direction
      if (candidateDirection) {
        const v2Gate = v2GatesSignalDirection(candidateDirection, v2State);
        v2Block = !v2Gate.allowed;
        v2BlockReasons = v2Gate.blockReasons;

        if (v2Block) {
          slog("WARN", "market", "V2 gated signal", { payloadId, direction: candidateDirection, reasons: v2BlockReasons });
          allWarnings.push(`V2 blocked ${candidateDirection.toUpperCase()}: ${v2BlockReasons.slice(0, 2).join("; ")}`);
        }
      }

      // Persist V2 state for dashboard
      await saveV2State(sym, v2State).catch(() => {});
    } catch (v2Err: any) {
      slog("WARN", "market", "V2 pipeline error (non-blocking)", { error: v2Err.message });
    }

    // Apply V2 block: override signal to no_trade if V2 rejects
    if (v2Block && v2BlockReasons.length > 0) {
      sig.no_trade = true;
      sig.no_trade_reason = v2BlockReasons[0];
    }

    const tradeDec = evaluateTradeDecision(sig, accountSnap, riskCfg, p.spread_points);
    let tradeResult = null;
    let instruction = null;

    if (tradeDec.approved) {
      if (tradeDec.decision === "paper_trade") {
        tradeResult = executePaperTrade(tradeDec);
        if (tradeResult) {
          await saveTrade(tradeResult);
          const a = audit("paper_trade", "system", `${tradeResult.direction} ${tradeResult.volume} @ ${tradeResult.entry_price}`, { order_id: tradeResult.order_id });
          await saveAuditEntry(a);
          // Alert on trade
          if (env.hasTelegram) {
            await sendTelegram(env.telegramBotToken, env.telegramChatId, `💰 *PAPER TRADE*\n${tradeResult.direction.toUpperCase()} ${tradeResult.volume} ${sym}\nEntry: ${tradeResult.entry_price}\nSL: ${tradeResult.sl} | TP: ${tradeResult.tp}\nScore: ${sig.master_score.toFixed(1)} | ${sig.state}`);
          }
        }
      } else if (tradeDec.decision === "live_trade") {
        instruction = buildTradeInstruction(tradeDec);
        if (instruction) {
          await addPendingInstruction(instruction);
          const a = audit("live_trade_queued", "system", `${instruction.direction} ${instruction.volume} queued for MT5`, { order_id: instruction.order_id });
          await saveAuditEntry(a);
        }
      }
    }

    // --- Update paper trades P&L ---
    if (openTrades.length > 0) {
      const updateResult: PaperTradeUpdateResult = updatePaperTrades(openTrades, p.bid, p.ask);

      // Persist ALL updated trades (P&L changes)
      for (const t of updateResult.trades) {
        if (t.mode === "paper") {
          await updateTrade(t.order_id, t);
        }
      }

      // Log status changes (SL/TP hits)
      for (const t of updateResult.changed) {
        const a = audit("paper_close", "system", `${t.close_reason} @ ${t.exit_price} | P&L: $${t.profit?.toFixed(2)}`, { order_id: t.order_id, direction: t.direction });
        await saveAuditEntry(a);

        // Send Telegram notification for paper trade closure
        if (env.hasTelegram) {
          const emoji = (t.profit || 0) >= 0 ? "🟢" : "🔴";
          await sendTelegram(env.telegramBotToken, env.telegramChatId,
            `${emoji} *PAPER TRADE CLOSED*\n${t.direction.toUpperCase()} ${t.volume} ${sym}\n` +
            `Entry: ${t.entry_price} → Exit: ${t.exit_price}\n` +
            `${t.close_reason} | P&L: $${(t.profit || 0) >= 0 ? '+' : ''}${t.profit?.toFixed(2)}`
          );
        }
      }
    }

    // --- Persist ---
    await saveSignal(sig);
    await saveMarket(sym, { bid: p.bid, ask: p.ask, spread: p.spread_points, last_update: p.timestamp || new Date().toISOString(), source: "mt5_ox", feed_check: feedCheck, bars_10m: p.bars_10m, bars_1h: p.bars_1h || [], bars_4h: p.bars_4h || [] });

    const elapsed = Date.now() - t0;
    slog("INFO", "market", "Processed", {
      payloadId, sym, score: sig.master_score, state: sig.state,
      alert: sig.alert_fired, tg: tgSent, trade: tradeDec.decision,
      approved: tradeDec.approved, elapsed_ms: elapsed,
    });

    return NextResponse.json({
      accepted: true, payload_id: payloadId, warnings: allWarnings, errors: [],
      signal: { master_score: sig.master_score, state: sig.state, bull_probability: sig.bull_probability, confidence_label: sig.confidence_label, alert_fired: sig.alert_fired, telegram_sent: tgSent },
      trade_decision: { order_id: tradeDec.order_id, decision: tradeDec.decision, approved: tradeDec.approved, direction: tradeDec.direction, volume: tradeDec.volume, rejection_reasons: tradeDec.rejection_reasons },
      instructions: instruction ? [instruction] : [],
      v2: v2State ? {
        regime: v2State.regime.regime,
        confidence: v2State.regime.confidence,
        allowBuy: v2State.tradePermission.allowBuy,
        allowSell: v2State.tradePermission.allowSell,
        blockReasons: v2State.tradePermission.blockReasons,
        spreadSafe: v2State.spreadGate.spreadSafe,
        actionLabel: v2State.explanation.actionLabel,
        structure: { bosUp: v2State.structure.bosUp, bosDown: v2State.structure.bosDown, chochUp: v2State.structure.chochUp, chochDown: v2State.structure.chochDown },
      } : null,
    });

  } catch (e: any) {
    slog("ERROR", "market", "Unhandled", { payloadId, error: e.message, stack: e.stack?.slice(0, 300) });
    return NextResponse.json({ accepted: false, errors: [e.message], payload_id: payloadId }, { status: 500 });
  }
}
