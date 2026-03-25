// ============================================================
// POST /api/trade/manual — Manual Trade Execution & Management
// Supports: open, modify, close, close_all for both paper and live
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  addPendingInstruction,
  saveTrade,
  updateTrade,
  getOpenTrades,
  getRecentTrades,
  getMarket,
  getAccount,
  saveAuditEntry,
} from "@/lib/store";
import {
  executeManualPaperTrade,
  modifyPaperTrade,
  closePaperTrade,
  moveToBreakeven,
  buildTradePreview,
  type ManualTradeParams,
  type TradePreview,
} from "@/lib/trade-engine";
import type { TradeInstruction, TradeRecord, TradeDirection } from "@/lib/types";
import { env } from "@/lib/config/env";
import { sendTelegram } from "@/lib/telegram";

const UID = () => `PHD-M-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

function audit(action: string, detail: string, meta?: Record<string, any>) {
  return {
    id: `A-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    action,
    actor: "dashboard",
    detail,
    metadata: meta,
  };
}

interface ManualTradeRequest {
  action: "open" | "modify" | "close" | "close_all" | "breakeven" | "preview";
  symbol?: string;
  direction?: TradeDirection;
  volume?: number;
  sl?: number;
  tp?: number;
  ticket?: number;      // MT5 ticket for live trades
  order_id?: string;    // Paper trade order ID
  mode?: "paper" | "live";  // Force mode (defaults to env setting)
}

export async function POST(req: NextRequest) {
  try {
    const p: ManualTradeRequest = await req.json();

    if (!p.action) {
      return NextResponse.json({ ok: false, error: "Missing action" }, { status: 400 });
    }

    const mode = p.mode || env.tradeMode || "paper";
    const symbol = p.symbol || "XAUUSD";

    // Get current market data for spread-aware pricing
    const market = await getMarket(symbol);
    const bid = market?.bid || 0;
    const ask = market?.ask || bid + 3;

    switch (p.action) {
      // ============================================================
      // PREVIEW - Calculate trade parameters without execution
      // ============================================================
      case "preview": {
        if (!p.direction) {
          return NextResponse.json({ ok: false, error: "Direction required for preview" }, { status: 400 });
        }

        // Build a mock signal for preview
        const mockSignal = {
          timestamp: new Date().toISOString(),
          symbol,
          price: (bid + ask) / 2,
          bid,
          ask,
          spread: ask - bid,
          master_score: 0,
          state: "neutral" as const,
          bull_probability: 0.5,
          bear_probability: 0.5,
          confidence_label: "Manual",
          confidence_pct: 1,
          factors: {
            volatility: { score: 0, components: {}, metadata: { atr: 3 } }
          },
          risk_level: "low" as const,
          key_level: 0,
          invalidation: p.direction === "buy" ? bid - 5 : ask + 5,
          breakout_watch: null,
          reversal_watch: null,
          no_trade: false,
          no_trade_reason: null,
          data_quality: "partial" as const,
          tf_biases: {},
          alert_fired: false,
        };

        const acct = await getAccount("ox_main");
        const balance = acct?.balance || 10000;

        const preview: TradePreview = buildTradePreview(
          mockSignal,
          p.direction,
          balance,
          1.0,  // 1% risk
          2.0,  // 2:1 RR
          1.5,  // 1.5x ATR
          p.sl,
          p.tp,
          p.volume
        );

        return NextResponse.json({ ok: true, preview });
      }

      // ============================================================
      // OPEN - Place new trade
      // ============================================================
      case "open": {
        if (!p.direction || !p.volume) {
          return NextResponse.json({ ok: false, error: "Direction and volume required" }, { status: 400 });
        }

        // Get spread-aware entry price
        const entryPrice = p.direction === "buy" ? ask : bid;

        // Validate SL/TP
        if (p.sl !== undefined) {
          if (p.direction === "buy" && p.sl >= entryPrice) {
            return NextResponse.json({ ok: false, error: "SL must be below entry for BUY" }, { status: 400 });
          }
          if (p.direction === "sell" && p.sl <= entryPrice) {
            return NextResponse.json({ ok: false, error: "SL must be above entry for SELL" }, { status: 400 });
          }
        }

        if (p.tp !== undefined) {
          if (p.direction === "buy" && p.tp <= entryPrice) {
            return NextResponse.json({ ok: false, error: "TP must be above entry for BUY" }, { status: 400 });
          }
          if (p.direction === "sell" && p.tp >= entryPrice) {
            return NextResponse.json({ ok: false, error: "TP must be below entry for SELL" }, { status: 400 });
          }
        }

        const orderId = UID();

        if (mode === "paper") {
          // Execute paper trade immediately
          const params: ManualTradeParams = {
            symbol,
            direction: p.direction,
            volume: p.volume,
            entryPrice,
            sl: p.sl || (p.direction === "buy" ? entryPrice - 5 : entryPrice + 5),
            tp: p.tp || (p.direction === "buy" ? entryPrice + 10 : entryPrice - 10),
          };

          const trade = executeManualPaperTrade(params);
          await saveTrade(trade);
          await saveAuditEntry(audit("manual_paper_open", `${trade.direction.toUpperCase()} ${trade.volume} @ ${trade.entry_price}`, { order_id: trade.order_id }));

          // Telegram notification
          if (env.hasTelegram) {
            await sendTelegram(env.telegramBotToken, env.telegramChatId,
              `📝 *MANUAL PAPER TRADE*\n${trade.direction.toUpperCase()} ${trade.volume} ${symbol}\n` +
              `Entry: ${trade.entry_price}\nSL: ${trade.sl} | TP: ${trade.tp}`
            );
          }

          return NextResponse.json({
            ok: true,
            order_id: trade.order_id,
            mode: "paper",
            trade: {
              direction: trade.direction,
              volume: trade.volume,
              entry: trade.entry_price,
              sl: trade.sl,
              tp: trade.tp,
            }
          });

        } else {
          // Queue live trade instruction for MT5
          const instruction: TradeInstruction = {
            order_id: orderId,
            action: "open",
            symbol,
            direction: p.direction,
            volume: p.volume,
            price: 0, // Market order
            sl: p.sl,
            tp: p.tp,
            comment: "PHUND-MANUAL",
            magic_number: 88888,
          };

          await addPendingInstruction(instruction);
          await saveAuditEntry(audit("manual_live_queued", `${p.direction.toUpperCase()} ${p.volume} queued for MT5`, { order_id: orderId }));

          return NextResponse.json({ ok: true, order_id: orderId, mode: "live", queued: true });
        }
      }

      // ============================================================
      // MODIFY - Change SL/TP on existing trade
      // ============================================================
      case "modify": {
        if (p.sl === undefined && p.tp === undefined) {
          return NextResponse.json({ ok: false, error: "Must provide sl or tp to modify" }, { status: 400 });
        }

        if (mode === "paper" || p.order_id) {
          // Paper trade modification
          if (!p.order_id) {
            return NextResponse.json({ ok: false, error: "order_id required for paper trade modification" }, { status: 400 });
          }

          const trades = await getRecentTrades(100);
          const trade = trades.find(t => t.order_id === p.order_id && t.status === "filled");

          if (!trade) {
            return NextResponse.json({ ok: false, error: "Open trade not found" }, { status: 404 });
          }

          try {
            const modified = modifyPaperTrade(trade, p.sl, p.tp);
            await updateTrade(trade.order_id, modified);
            await saveAuditEntry(audit("paper_modify", `Modified ${trade.order_id}`, { sl: p.sl, tp: p.tp }));

            return NextResponse.json({
              ok: true,
              order_id: trade.order_id,
              sl: modified.sl,
              tp: modified.tp,
            });
          } catch (e: any) {
            return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
          }

        } else {
          // Live trade modification via MT5
          if (!p.ticket) {
            return NextResponse.json({ ok: false, error: "ticket required for live trade modification" }, { status: 400 });
          }

          const instruction: TradeInstruction = {
            order_id: UID(),
            action: "modify",
            symbol,
            ticket: p.ticket,
            sl: p.sl,
            tp: p.tp,
            comment: "PHUND-MODIFY",
            magic_number: 88888,
          };

          await addPendingInstruction(instruction);
          await saveAuditEntry(audit("live_modify_queued", `Modify ticket ${p.ticket}`, { sl: p.sl, tp: p.tp }));

          return NextResponse.json({ ok: true, ticket: p.ticket, queued: true });
        }
      }

      // ============================================================
      // BREAKEVEN - Move SL to breakeven
      // ============================================================
      case "breakeven": {
        if (mode === "paper" || p.order_id) {
          if (!p.order_id) {
            return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });
          }

          const trades = await getRecentTrades(100);
          const trade = trades.find(t => t.order_id === p.order_id && t.status === "filled");

          if (!trade) {
            return NextResponse.json({ ok: false, error: "Open trade not found" }, { status: 404 });
          }

          try {
            const modified = moveToBreakeven(trade, 0.5);
            await updateTrade(trade.order_id, modified);
            await saveAuditEntry(audit("paper_breakeven", `Moved ${trade.order_id} to breakeven`, { new_sl: modified.sl }));

            return NextResponse.json({
              ok: true,
              order_id: trade.order_id,
              sl: modified.sl,
            });
          } catch (e: any) {
            return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
          }

        } else {
          // Live trade breakeven via MT5
          if (!p.ticket) {
            return NextResponse.json({ ok: false, error: "ticket required" }, { status: 400 });
          }

          // We need to know the entry price to set breakeven
          // For now, queue a modify with a flag that MT5 EA should handle
          const instruction: TradeInstruction = {
            order_id: UID(),
            action: "modify",
            symbol,
            ticket: p.ticket,
            comment: "PHUND-BREAKEVEN",
            magic_number: 88888,
          };

          await addPendingInstruction(instruction);

          return NextResponse.json({ ok: true, ticket: p.ticket, queued: true, action: "breakeven" });
        }
      }

      // ============================================================
      // CLOSE - Close single position
      // ============================================================
      case "close": {
        if (mode === "paper" || p.order_id) {
          if (!p.order_id) {
            return NextResponse.json({ ok: false, error: "order_id required" }, { status: 400 });
          }

          const trades = await getRecentTrades(100);
          const trade = trades.find(t => t.order_id === p.order_id && t.status === "filled");

          if (!trade) {
            return NextResponse.json({ ok: false, error: "Open trade not found" }, { status: 404 });
          }

          // Use current bid for buys, ask for sells
          const exitPrice = trade.direction === "buy" ? bid : ask;

          try {
            const closed = closePaperTrade(trade, exitPrice, "Manual close");
            await updateTrade(trade.order_id, closed);
            await saveAuditEntry(audit("paper_close", `Closed ${trade.order_id} @ ${exitPrice}`, { profit: closed.profit }));

            // Telegram notification
            if (env.hasTelegram) {
              const emoji = (closed.profit || 0) >= 0 ? "🟢" : "🔴";
              await sendTelegram(env.telegramBotToken, env.telegramChatId,
                `${emoji} *PAPER TRADE CLOSED*\n${closed.direction.toUpperCase()} ${closed.volume} ${symbol}\n` +
                `Entry: ${closed.entry_price} → Exit: ${exitPrice}\n` +
                `Manual Close | P&L: $${(closed.profit || 0) >= 0 ? '+' : ''}${closed.profit?.toFixed(2)}`
              );
            }

            return NextResponse.json({
              ok: true,
              order_id: trade.order_id,
              exit_price: exitPrice,
              profit: closed.profit,
            });
          } catch (e: any) {
            return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
          }

        } else {
          // Live trade close via MT5
          if (!p.ticket) {
            return NextResponse.json({ ok: false, error: "ticket required" }, { status: 400 });
          }

          const instruction: TradeInstruction = {
            order_id: UID(),
            action: "close",
            symbol,
            ticket: p.ticket,
            comment: "PHUND-CLOSE",
            magic_number: 88888,
          };

          await addPendingInstruction(instruction);
          await saveAuditEntry(audit("live_close_queued", `Close ticket ${p.ticket}`, {}));

          return NextResponse.json({ ok: true, ticket: p.ticket, queued: true });
        }
      }

      // ============================================================
      // CLOSE_ALL - Close all positions
      // ============================================================
      case "close_all": {
        const instructions: TradeInstruction[] = [];

        // Handle paper trades
        const openPaperTrades = await getOpenTrades();
        for (const trade of openPaperTrades) {
          const exitPrice = trade.direction === "buy" ? bid : ask;
          const closed = closePaperTrade(trade, exitPrice, "Close all");
          await updateTrade(trade.order_id, closed);
        }

        // Queue live trade closes
        const instruction: TradeInstruction = {
          order_id: UID(),
          action: "close_all",
          symbol,
          comment: "PHUND-CLOSE-ALL",
          magic_number: 88888,
        };
        await addPendingInstruction(instruction);

        await saveAuditEntry(audit("close_all", `Closed ${openPaperTrades.length} paper, queued live close_all`, {}));

        return NextResponse.json({
          ok: true,
          paper_closed: openPaperTrades.length,
          live_queued: true,
        });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${p.action}` }, { status: 400 });
    }

  } catch (e: any) {
    console.error("[trade/manual] Error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
