// ============================================================
// PHUND.CA — Telegram Alert Service
// Real Bot API calls. Real alert decision engine.
// ============================================================

import type { SignalOutput, AlertRecord, AlertSeverity } from "./types";

export async function sendTelegram(token: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!token || !chatId) return { ok: false, error: "Bot token or chat ID missing" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
    });
    const d = await r.json();
    return d.ok ? { ok: true } : { ok: false, error: d.description || "Telegram API error" };
  } catch (e: any) { return { ok: false, error: e.message }; }
}

export function formatAlert(s: SignalOutput): string {
  const f = s.factors;
  const ico: Record<string, string> = { strong_bullish: "🟢🟢", actionable_long: "🟢", watch_long: "🔵", strong_bearish: "🔴🔴", actionable_short: "🔴", watch_short: "🟠", neutral: "⚪", no_trade: "⛔", breakout_watch_up: "⚡🟢", breakout_watch_down: "⚡🔴", reversal_watch_up: "↩️🟢", reversal_watch_down: "↩️🔴" };
  const em = ico[s.state] || "📊";
  const sl = s.state.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const lines = [
    `${em} *XAUUSD 10M SIGNAL*`, `━━━━━━━━━━━━━━━━━━`,
    `*State:* ${sl}`, `*Score:* ${s.master_score > 0 ? "+" : ""}${s.master_score.toFixed(1)} / 100`,
    `*Bull:* ${(s.bull_probability * 100).toFixed(0)}% | *Bear:* ${(s.bear_probability * 100).toFixed(0)}%`,
    `*Confidence:* ${s.confidence_label}`, ``,
    `📈 *Factors:*`,
    `Trend: ${f.trend?.score?.toFixed(0) || 0} | Mom: ${f.momentum?.score?.toFixed(0) || 0} | Vol: ${f.volatility?.score?.toFixed(0) || 0}`,
    `Struct: ${f.structure?.score?.toFixed(0) || 0} | Macro: ${f.macro?.score?.toFixed(0) || 0} | Sess: ${f.session?.score?.toFixed(0) || 0}`,
  ];
  if ((f.exhaustion?.score || 0) < -10) lines.push(`⚠️ Exhaustion: ${f.exhaustion.score.toFixed(0)}`);
  if ((f.event_risk?.score || 0) < -10) lines.push(`⚠️ Event Risk: ${f.event_risk.score.toFixed(0)} (${f.event_risk.metadata?.minutes ?? "?"}min)`);
  lines.push(``, `💰 *Price:* ${s.price.toFixed(2)} | Spread: ${s.spread.toFixed(1)}`,
    `🎯 *Key:* ${s.key_level.toFixed(2)} | *Inv:* ${s.invalidation.toFixed(2)}`,
    `📊 *Risk:* ${s.risk_level.replace(/_/g, " ")}`);
  if (s.breakout_watch) lines.push(`⚡ *Breakout Watch:* ${s.breakout_watch.toUpperCase()}`);
  if (s.reversal_watch) lines.push(`↩️ *Reversal Watch:* ${s.reversal_watch.toUpperCase()}`);
  if (s.no_trade) lines.push(`⛔ *No Trade:* ${s.no_trade_reason}`);
  if (s.alert_reason) lines.push(``, `🔔 *Trigger:* ${s.alert_reason}`);
  lines.push(``, `_Phund.ca | OX Securities_`, `_${new Date(s.timestamp).toUTCString()}_`);
  return lines.join("\n");
}

// --- Alert Decision Engine ---
export interface AlertState { prev_state: string | null; prev_score: number; last_alert_time: number; }

export function shouldFireAlert(sig: SignalOutput, prev: AlertState, cooldownMs = 300000): { fire: boolean; reason: string; severity: AlertSeverity } {
  const now = Date.now();
  if (!prev.prev_state) return { fire: true, reason: "Initial scan", severity: "info" };
  if (prev.last_alert_time && now - prev.last_alert_time < cooldownMs) return { fire: false, reason: "Cooldown", severity: "info" };
  if (sig.no_trade && sig.confidence_pct < 0.55) return { fire: false, reason: "Low-quality", severity: "info" };

  if (sig.state !== prev.prev_state) {
    const sev: AlertSeverity = sig.state.includes("strong") || sig.state.includes("actionable") ? "critical" : "warning";
    return { fire: true, reason: `State: ${prev.prev_state} → ${sig.state}`, severity: sev };
  }
  if (sig.breakout_watch && !prev.prev_state?.includes("breakout")) return { fire: true, reason: `Breakout Watch: ${sig.breakout_watch}`, severity: "warning" };
  if (sig.reversal_watch && !prev.prev_state?.includes("reversal")) return { fire: true, reason: `Reversal Watch: ${sig.reversal_watch}`, severity: "warning" };
  if (Math.abs(sig.master_score - prev.prev_score) > 15) return { fire: true, reason: `Score shift: ${prev.prev_score.toFixed(0)} → ${sig.master_score.toFixed(0)}`, severity: "info" };
  return { fire: false, reason: "No change", severity: "info" };
}

export function makeAlertRecord(sig: SignalOutput, reason: string, severity: AlertSeverity, tgSent: boolean): AlertRecord {
  return {
    id: `ALT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(), symbol: sig.symbol, severity,
    title: `${sig.symbol} ${sig.state.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`,
    body: `Score: ${sig.master_score.toFixed(1)} | Bull: ${(sig.bull_probability * 100).toFixed(0)}% | ${reason}`,
    signal_state: sig.state, master_score: sig.master_score, trigger_reason: reason,
    channels_sent: tgSent ? ["telegram", "dashboard"] : ["dashboard"], telegram_sent: tgSent,
  };
}
