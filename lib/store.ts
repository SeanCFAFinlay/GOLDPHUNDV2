// ============================================================
// PHUND.CA — Supabase Persistence Layer (Complete)
// ============================================================

import type { SignalOutput, AlertRecord, MT5AccountPayload, TradeRecord, RiskConfig, AuditEntry } from "./types";

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

async function sb(table: string, method: "GET"|"POST"|"PATCH"|"DELETE", q = "", body?: any) {
  const u = URL(), k = KEY();
  if (!u || !k) { console.warn("[STORE] Supabase not configured"); return null; }
  const h: Record<string,string> = { apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json", Prefer: method === "POST" ? "return=representation" : "return=minimal" };
  try {
    const r = await fetch(`${u}/rest/v1/${table}${q}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    if (!r.ok) { console.error(`[STORE] ${method} ${table}: ${r.status}`); return null; }
    return method === "GET" ? r.json() : true;
  } catch (e) { console.error("[STORE] err:", e); return null; }
}

// --- KV State ---
export async function getState<T>(key: string): Promise<T|null> {
  const d = await sb("phund_state", "GET", `?key=eq.${encodeURIComponent(key)}&select=value`);
  return d?.length > 0 ? d[0].value as T : null;
}
export async function setState(key: string, value: any): Promise<void> {
  const exists = await getState(key);
  if (exists !== null) await sb("phund_state", "PATCH", `?key=eq.${encodeURIComponent(key)}`, { value, updated_at: new Date().toISOString() });
  else await sb("phund_state", "POST", "", { key, value, updated_at: new Date().toISOString() });
}

// --- Signals ---
export async function saveSignal(s: SignalOutput) { await sb("phund_signals", "POST", "", { symbol: s.symbol, data: s }); }
export async function getRecentSignals(limit = 50): Promise<SignalOutput[]> {
  const d = await sb("phund_signals", "GET", `?order=created_at.desc&limit=${limit}&select=data`);
  return d ? d.map((r: any) => r.data) : [];
}

// --- Alerts ---
export async function saveAlert(a: AlertRecord) { await sb("phund_alerts", "POST", "", { symbol: a.symbol, data: a }); }
export async function getRecentAlerts(limit = 30): Promise<AlertRecord[]> {
  const d = await sb("phund_alerts", "GET", `?order=created_at.desc&limit=${limit}&select=data`);
  return d ? d.map((r: any) => r.data) : [];
}

// --- Trades ---
export async function saveTrade(t: TradeRecord) { await sb("phund_trades", "POST", "", { symbol: t.symbol, order_id: t.order_id, data: t }); }
export async function updateTrade(orderId: string, t: TradeRecord) { await sb("phund_trades", "PATCH", `?order_id=eq.${orderId}`, { data: t }); }
export async function getRecentTrades(limit = 50): Promise<TradeRecord[]> {
  const d = await sb("phund_trades", "GET", `?order=created_at.desc&limit=${limit}&select=data`);
  return d ? d.map((r: any) => r.data) : [];
}
export async function getOpenTrades(): Promise<TradeRecord[]> {
  const all = await getRecentTrades(100);
  return all.filter(t => t.status === "filled");
}

// --- Heartbeat ---
export async function saveHeartbeat(tid: string, p: any) { await setState(`hb:${tid}`, { ...p, received_at: new Date().toISOString() }); }
export async function getHeartbeat(tid: string) { return getState(`hb:${tid}`); }

// --- Account ---
export async function saveAccount(aid: string, d: MT5AccountPayload) { await setState(`acc:${aid}`, d); }
export async function getAccount(aid: string): Promise<MT5AccountPayload|null> { return getState(`acc:${aid}`); }

// --- Market cache ---
export async function saveMarket(sym: string, d: any) { await setState(`mkt:${sym}`, d); }
export async function getMarket(sym: string) { return getState(`mkt:${sym}`); }

// --- Alert engine state ---
export async function getAlertState(): Promise<{prev_state:string|null;prev_score:number;last_alert_time:number}> {
  return (await getState<any>("alert_state")) || { prev_state: null, prev_score: 0, last_alert_time: 0 };
}
export async function setAlertState(s: any) { await setState("alert_state", s); }

// --- Risk config ---
export async function getRiskConfig(): Promise<RiskConfig|null> { return getState<RiskConfig>("risk_config"); }
export async function setRiskConfig(c: RiskConfig) { await setState("risk_config", c); }

// --- Instructions queue ---
export async function getPendingInstructions(): Promise<any[]> { return (await getState<any[]>("pending_inst")) || []; }
export async function setPendingInstructions(i: any[]) { await setState("pending_inst", i); }
export async function popPendingInstructions(): Promise<any[]> { const c = await getPendingInstructions(); await setPendingInstructions([]); return c; }
export async function addPendingInstruction(i: any) { const c = await getPendingInstructions(); c.push(i); await setPendingInstructions(c); }

// --- Audit ---
export async function saveAuditEntry(e: AuditEntry) { await sb("phund_audit", "POST", "", { action: e.action, data: e }); }
export async function getRecentAudit(limit = 50): Promise<AuditEntry[]> {
  const d = await sb("phund_audit", "GET", `?order=created_at.desc&limit=${limit}&select=data`);
  return d ? d.map((r: any) => r.data) : [];
}

// --- Diagnostics counters ---
export async function getDiagCounters() { return (await getState<any>("diag_counters")) || { total: 0, rejected: 0, mismatches: 0, exec_fail: 0, notif_fail: 0 }; }
export async function incDiagCounter(field: string) {
  const c = await getDiagCounters();
  c[field] = (c[field] || 0) + 1;
  await setState("diag_counters", c);
}
