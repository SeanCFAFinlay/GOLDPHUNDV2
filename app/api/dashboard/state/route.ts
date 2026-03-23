import { NextResponse } from "next/server";
import { getRecentSignals, getRecentAlerts, getRecentTrades, getOpenTrades, getMarket, getHeartbeat, getAccount, getRiskConfig, getRecentAudit as getAuditDB, getDiagCounters } from "@/lib/store";
import { DEFAULT_RISK_CONFIG } from "@/lib/trade-engine";
import { getRecentAudit } from "@/lib/diagnostics";
import { validateFeed } from "@/lib/diagnostics";
import { buildGoldLogicSnapshot } from "@/lib/gold-logic-engine";
import type { TradeMode, MacroData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [signals, alerts, allTrades, openTrades, mkt, hb, acct, riskCfg, auditDB, counters] = await Promise.all([
      getRecentSignals(50), getRecentAlerts(30), getRecentTrades(50), getOpenTrades(),
      getMarket("XAUUSD"), getHeartbeat("ox_primary"), getAccount("ox_demo").then(a => a || getAccount("ox_main")),
      getRiskConfig(), getAuditDB(20), getDiagCounters(),
    ]);

    const latest = signals.length > 0 ? signals[0] : null;
    let mt5ok = false, mt5hb: string|null = null, mt5lat: number|null = null;
    if (hb) {
      const h = hb as any;
      mt5hb = h.received_at || h.timestamp;
      mt5ok = mt5hb ? (Date.now() - new Date(mt5hb).getTime()) / 1000 < 180 : false;
      mt5lat = h.server_ping_ms || null;
    }

    const feeds = [];
    if (mkt) { const m = mkt as any; feeds.push(validateFeed("XAUUSD", m.bid||0, m.ask||0, m.last_update)); }

    const rc = riskCfg || DEFAULT_RISK_CONFIG;
    rc.mode = (process.env.TRADE_MODE as TradeMode) || rc.mode || "paper";

    // Merge in-memory + DB audit
    const memAudit = getRecentAudit(20);
    const audit = [...memAudit, ...(auditDB||[])].sort((a,b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 30);

    const paperTrades = allTrades.filter(t => t.mode === "paper");
    const liveTrades = allTrades.filter(t => t.mode === "live");

    // Build Gold Logic AI snapshot
    let goldLogic = null;
    if (mkt) {
      const m = mkt as any;
      const bars10m = m.bars_10m || [];
      const bars1h = m.bars_1h || [];
      const bars4h = m.bars_4h || [];

      // Extract macro data from latest signal if available
      const macroData: MacroData | undefined = latest?.factors?.macro?.metadata?.live ? {
        dxy_delta_10m: latest.factors.macro.metadata.dxy_d10 || 0,
        dxy_delta_30m: latest.factors.macro.metadata.dxy_d30 || 0,
        us10y_delta_10m: latest.factors.macro.metadata.y10_d10 || 0,
        us10y_delta_30m: latest.factors.macro.metadata.y10_d30 || 0,
        live: true,
      } : undefined;

      try {
        goldLogic = buildGoldLogicSnapshot(bars10m, bars1h, bars4h, macroData, "XAUUSD");
      } catch (e) {
        console.error("Gold Logic AI error:", e);
        goldLogic = null;
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      trade_mode: rc.mode,
      health: {
        mt5_connected: mt5ok, mt5_last_heartbeat: mt5hb,
        mt5_last_payload: latest?.timestamp || null, mt5_latency_ms: mt5lat,
        feeds, api_uptime_sec: 0, // filled by diagnostics endpoint
        total_payloads: counters?.total || 0, rejected_payloads: counters?.rejected || 0,
        stale_symbols: feeds.filter(f => f.status === "stale").map(f => f.symbol),
        feed_mismatches: counters?.mismatches || 0,
        exec_failures: counters?.exec_fail || 0, notif_failures: counters?.notif_fail || 0,
        trade_mode: rc.mode, open_positions: openTrades.length + (acct?.positions?.length || 0),
        daily_pnl: acct?.profit || 0, kill_switch: false,
      },
      latest_signal: latest,
      scan_history: signals,
      recent_alerts: alerts,
      open_trades: openTrades,
      trade_history: allTrades,
      paper_trades: paperTrades,
      live_trades: liveTrades,
      account: acct,
      market_cache: { XAUUSD: mkt },
      risk_config: rc,
      notification_channels: { telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) },
      recent_audit: audit,
      gold_logic: goldLogic,
      version: "2.0.0",
    });
  } catch (e: any) {
    console.error("Dashboard err:", e);
    return NextResponse.json({ error: e.message, latest_signal: null, scan_history: [], recent_alerts: [], trade_history: [] }, { status: 500 });
  }
}
