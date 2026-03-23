// ============================================================
// PHUND.CA — Diagnostics & Observability
// Feed validation, health checks, audit trail, metrics.
// ============================================================

import type { FeedCheck, DiagSnapshot, AuditEntry, TradeMode, FeedSource } from "./types";

const START_TIME = Date.now();

// In-memory counters (reset on cold start; persisted snapshots go to DB)
let totalPayloads = 0;
let rejectedPayloads = 0;
let feedMismatches = 0;
let execFailures = 0;
let notifFailures = 0;
let killSwitch = false;

export function incPayloads() { totalPayloads++; }
export function incRejected() { rejectedPayloads++; }
export function incFeedMismatch() { feedMismatches++; }
export function incExecFailure() { execFailures++; }
export function incNotifFailure() { notifFailures++; }
export function setKillSwitch(v: boolean) { killSwitch = v; }
export function getKillSwitch() { return killSwitch; }

// ============================================================
// FEED VALIDATION
// ============================================================

export function validateFeed(
  symbol: string,
  brokerBid: number,
  brokerAsk: number,
  lastUpdate: string | null,
  referenceBid?: number,
  maxAgeSec = 120,
  maxDriftPct = 0.3,
): FeedCheck {
  const now = Date.now();
  let ageSec: number | null = null;
  let status: FeedCheck["status"] = "ok";

  if (lastUpdate) {
    ageSec = (now - new Date(lastUpdate).getTime()) / 1000;
    if (ageSec > maxAgeSec) status = "stale";
  } else {
    status = "error";
  }

  if (referenceBid && referenceBid > 0 && brokerBid > 0) {
    const drift = Math.abs(brokerBid - referenceBid) / referenceBid * 100;
    if (drift > maxDriftPct) {
      status = "mismatch";
      incFeedMismatch();
    }
  }

  return {
    source: "mt5_broker" as FeedSource, symbol, status,
    last_update: lastUpdate, age_sec: ageSec ? +ageSec.toFixed(0) : null,
    bid: brokerBid, ask: brokerAsk,
    spread: brokerAsk && brokerBid ? +(brokerAsk - brokerBid).toFixed(2) : undefined,
  };
}

// ============================================================
// PAYLOAD VALIDATION
// ============================================================

export interface PayloadValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateMarketPayload(p: any): PayloadValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!p) { errors.push("Empty payload"); return { valid: false, errors, warnings }; }
  if (typeof p.symbol !== "string" || !p.symbol) errors.push("Missing symbol");
  if (typeof p.bid !== "number" || p.bid <= 0) errors.push("Invalid bid");
  if (typeof p.ask !== "number" || p.ask <= 0) errors.push("Invalid ask");
  if (!Array.isArray(p.bars_10m) || p.bars_10m.length < 1) errors.push("Missing bars_10m");
  if (typeof p.timestamp !== "string") errors.push("Missing timestamp");
  if (typeof p.account_id !== "string") warnings.push("Missing account_id");
  if (typeof p.terminal_id !== "string") warnings.push("Missing terminal_id");

  if (p.bars_10m && p.bars_10m.length > 0) {
    const b = p.bars_10m[0];
    if (typeof b.open !== "number") errors.push("Bar missing open");
    if (typeof b.high !== "number") errors.push("Bar missing high");
    if (typeof b.low !== "number") errors.push("Bar missing low");
    if (typeof b.close !== "number") errors.push("Bar missing close");
  }

  if (p.spread_points !== undefined && typeof p.spread_points !== "number") warnings.push("spread_points not numeric");
  if (p.bars_10m?.length < 20) warnings.push("Less than 20 bars — signal quality degraded");

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================
// DIAGNOSTIC SNAPSHOT BUILDER
// ============================================================

export function buildDiagSnapshot(
  mt5Connected: boolean,
  mt5LastHB: string | null,
  mt5LastPayload: string | null,
  mt5Latency: number | null,
  feeds: FeedCheck[],
  tradeMode: TradeMode,
  openPositions: number,
  dailyPnl: number,
): DiagSnapshot {
  const staleSymbols = feeds.filter(f => f.status === "stale").map(f => f.symbol);

  return {
    timestamp: new Date().toISOString(),
    mt5_connected: mt5Connected,
    mt5_last_heartbeat: mt5LastHB,
    mt5_last_payload: mt5LastPayload,
    mt5_latency_ms: mt5Latency,
    feeds,
    api_uptime_sec: +((Date.now() - START_TIME) / 1000).toFixed(0),
    total_payloads: totalPayloads,
    rejected_payloads: rejectedPayloads,
    stale_symbols: staleSymbols,
    feed_mismatches: feedMismatches,
    exec_failures: execFailures,
    notif_failures: notifFailures,
    trade_mode: tradeMode,
    open_positions: openPositions,
    daily_pnl: dailyPnl,
    kill_switch: killSwitch,
  };
}

// ============================================================
// AUDIT LOGGER
// ============================================================

const auditBuffer: AuditEntry[] = [];

export function audit(action: string, actor: string, detail: string, meta?: Record<string, any>) {
  const entry: AuditEntry = {
    id: `AUD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`,
    timestamp: new Date().toISOString(), action, actor, detail, metadata: meta,
  };
  auditBuffer.push(entry);
  if (auditBuffer.length > 500) auditBuffer.splice(0, auditBuffer.length - 500);
  console.log(`[AUDIT] ${action} by ${actor}: ${detail}`);
  return entry;
}

export function getRecentAudit(limit = 50): AuditEntry[] {
  return auditBuffer.slice(-limit).reverse();
}

// ============================================================
// STRUCTURED LOG HELPER
// ============================================================

export function slog(level: "INFO"|"WARN"|"ERROR", module: string, msg: string, data?: Record<string,any>) {
  const entry = { ts: new Date().toISOString(), level, module, msg, ...data };
  if (level === "ERROR") console.error(JSON.stringify(entry));
  else if (level === "WARN") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}
