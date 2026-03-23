import { NextResponse } from "next/server";
import { getHeartbeat, getMarket, getRecentSignals, getRecentAlerts, getOpenTrades, getAccount, getDiagCounters } from "@/lib/store";
import { buildDiagSnapshot, validateFeed } from "@/lib/diagnostics";
import type { TradeMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [hb, mkt, signals, alerts, trades, acct, counters] = await Promise.all([
      getHeartbeat("ox_primary"), getMarket("XAUUSD"),
      getRecentSignals(5), getRecentAlerts(5), getOpenTrades(),
      getAccount("ox_main"), getDiagCounters(),
    ]);

    let mt5ok = false, mt5hb: string|null = null, mt5lat: number|null = null;
    if (hb) {
      const h = hb as any;
      mt5hb = h.received_at || h.timestamp;
      mt5ok = mt5hb ? (Date.now() - new Date(mt5hb).getTime()) / 1000 < 180 : false;
      mt5lat = h.server_ping_ms || null;
    }

    const feeds = [];
    if (mkt) {
      const m = mkt as any;
      feeds.push(validateFeed("XAUUSD", m.bid || 0, m.ask || 0, m.last_update));
    }

    const mode = (process.env.TRADE_MODE || "paper") as TradeMode;
    const snap = buildDiagSnapshot(mt5ok, mt5hb, signals[0]?.timestamp || null, mt5lat, feeds, mode, trades.length + (acct?.positions?.length || 0), acct?.profit || 0);

    // Override with persisted counters
    snap.total_payloads = counters.total || snap.total_payloads;
    snap.rejected_payloads = counters.rejected || snap.rejected_payloads;
    snap.exec_failures = counters.exec_fail || snap.exec_failures;
    snap.notif_failures = counters.notif_fail || snap.notif_failures;

    const overall = mt5ok && feeds.every(f => f.status === "ok") ? "healthy" : mt5ok ? "degraded" : "disconnected";

    return NextResponse.json({ status: overall, diagnostics: snap });
  } catch (e: any) {
    return NextResponse.json({ status: "error", error: e.message }, { status: 500 });
  }
}
