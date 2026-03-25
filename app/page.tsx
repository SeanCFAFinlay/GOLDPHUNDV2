"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface FR { score: number; components: Record<string, number>; metadata: Record<string, any>; }
interface Pos { ticket: number; symbol: string; direction: string; volume: number; open_price: number; current_price: number; sl?: number; tp?: number; profit: number; swap: number; open_time: string; }
interface Sig { timestamp: string; symbol: string; price: number; bid: number; ask: number; spread: number; master_score: number; state: string; bull_probability: number; bear_probability: number; confidence_label: string; confidence_pct: number; factors: Record<string, FR>; risk_level: string; key_level: number; invalidation: number; breakout_watch: string | null; reversal_watch: string | null; no_trade: boolean; no_trade_reason: string | null; data_quality: string; tf_biases: Record<string, number>; alert_fired: boolean; activeRegime?: string; }
interface EngineVote { engine: string; direction: string; score: number; confidence: number; weight: number; }
interface Consensus { direction: string; agreement: string; netScore: number; votes: EngineVote[]; divergenceFlag: boolean; timestamp: string; }
interface Alrt { id: string; timestamp: string; severity: string; title: string; body: string; signal_state: string; master_score: number; trigger_reason: string; channels_sent: string[]; telegram_sent: boolean; }
interface Acct { balance: number; equity: number; margin: number; free_margin: number; profit: number; positions: Pos[]; }
interface Health { mt5_connected: boolean; mt5_last_heartbeat: string | null; mt5_last_payload: string | null; total_payloads: number; alerts_count?: number; open_positions: number; daily_pnl: number; }
interface GoldV2Expl { regimeLabel: string; regimeColor: string; confidencePct: number; buyStatus: string; sellStatus: string; buyBlockReasons: string[]; sellBlockReasons: string[]; spreadLabel: string; spreadSafe: boolean; spreadDetails: { spread: number; atr: number; ratio: number; label: string }; structureNotes: string[]; structureFlags: { bosUp: boolean; bosDown: boolean; chochUp: boolean; chochDown: boolean; bullishSweep: boolean; bearishSweep: boolean }; indicatorSummary: { trend: number; momentum: number; volatility: number; participation: number; divergences: string[] }; actionLabel: string; actionColor: string; actionReasons: string[]; riskSummary: { openBuys: number; openSells: number; wrongSideFreeze: boolean; dailyLock: boolean; drawdownLock: boolean }; dataIntegrityOk: boolean; dataIntegrityIssues: string[]; cooldownActive: boolean; cooldownBarsLeft: number; }
interface GoldV2State { timestamp: string; regime: { regime: string; confidence: number; allowBuy: boolean; allowSell: boolean; noTrade: boolean; reasons: string[]; warnings: string[] }; spreadGate: { spreadPoints: number; atr: number; spreadToAtr: number; spreadSafe: boolean; spikeDetected: boolean; cooldownBarsRemaining: number; regime: string; blockReasons: string[] }; structure: { m5Trend: string; m15Trend: string; h1Bias: string; bosUp: boolean; bosDown: boolean; chochUp: boolean; chochDown: boolean; bullishSweep: boolean; bearishSweep: boolean; lastSwingHigh?: number; lastSwingLow?: number; structureConfidence: number; notes: string[] }; indicatorMatrix: { trendScore: number; momentumScore: number; volatilityScore: number; participationScore: number; overallBias: number; divergenceWarnings: string[]; summary: string[] }; riskGovernor: { blockAllEntries: boolean; blockBuy: boolean; blockSell: boolean; maxExposureReached: boolean; wrongSideFreeze: boolean; dailyLossLock: boolean; openBuys: number; openSells: number; reasons: string[] }; tradePermission: { allowBuy: boolean; allowSell: boolean; allowNewTrade: boolean; regime: string; confidence: number; blockReasons: string[]; warnings: string[] }; explanation: GoldV2Expl; }
interface Dash { timestamp: string; trade_mode: string; health: Health; latest_signal: Sig | null; scan_history: Sig[]; recent_alerts: Alrt[]; trade_history: any[]; market_cache: Record<string, any>; account: Acct | null; notification_channels: Record<string, boolean>; gold_logic?: GoldLogicSnapshot | null; spectre?: SpectreOutput | null; consensus?: Consensus | null; gold_v2?: GoldV2State | null; version?: string; }
interface SpectreOutput { timestamp: string; symbol: string; price: number; spectre_score: number; state: string; confidence: string; ichimoku: {score:number;meta:Record<string,any>}; squeeze: {score:number;meta:Record<string,any>}; smart_money: {score:number;meta:Record<string,any>}; fibonacci: {score:number;meta:Record<string,any>}; oscillators: {score:number;meta:Record<string,any>}; weights: Record<string,number>; data_quality: string; }

// Gold Logic AI Types (V2)
interface GoldIndicatorRow { name: string; category: string; rawValue: number|string|null; normalized: number|null; direction: string; weight: number; reliability: number; regimeFit: string; status: string; }
interface GoldScenarioBlock { trigger: string; invalidation: string; targets: string[]; }
interface GoldLogicSnapshot {
  symbol: string; timestamp: string; price: number;
  masterBias: string; probabilityUp: number; confidence: number;
  regime: string; tradeQuality: string; riskState: string;
  categoryScores: { trend: number; momentum: number; volatility: number; structure: number; macro: number };
  timeframeScores: { m5: number | null; m10: number; m15: number | null; h1: number; h4: number };
  indicators: GoldIndicatorRow[];
  scenarios: { bull: GoldScenarioBlock; bear: GoldScenarioBlock; noTrade: { reason: string; conditionToImprove: string } };
  alerts: string[]; engineVersion: string; dataQuality: string;
}

const F = { m: "'JetBrains Mono',monospace", s: "'DM Sans',sans-serif" };
const C = { bg: "#080c14", cd: "#0f1520", bd: "#1a2438", tx: "#e1e7ef", t2: "#8a96a8", t3: "#5a6578", bu: "#0fd492", bb: "#2cf0aa", be: "#f04848", br: "#ff6b6b", wa: "#f0a830", ac: "#3880f0", nu: "#5a6578", pu: "#a78bfa" };
const stC = (s: string) => { if (s?.includes("strong_bull")) return C.bb; if (s?.includes("bull") || s?.includes("long") || s === "breakout_watch_up") return C.bu; if (s?.includes("strong_bear")) return C.br; if (s?.includes("bear") || s?.includes("short") || s === "breakout_watch_down") return C.be; if (s?.includes("no_trade")) return C.wa; if (s?.includes("reversal") || s?.includes("breakout")) return C.pu; return C.nu; };
const scC = (s: number) => s >= 50 ? C.bb : s >= 25 ? C.bu : s > -25 ? C.nu : s > -50 ? C.be : C.br;
const sl = (s: string) => (s || "—").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const ft = (iso: string) => { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return "—"; } };
const fp = (n: number) => n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;

function Bdg({ t, c, sz = "sm" }: { t: string; c: string; sz?: string }) {
  const fs = sz === "lg" ? 15 : sz === "md" ? 13 : 12, px = sz === "lg" ? 16 : sz === "md" ? 12 : 9, py = sz === "lg" ? 7 : sz === "md" ? 5 : 4;
  return <span style={{ display: "inline-block", fontFamily: F.s, fontSize: fs, fontWeight: 700, padding: `${py}px ${px}px`, borderRadius: 4, background: `${c}1a`, color: c, border: `1px solid ${c}33`, lineHeight: 1, whiteSpace: "nowrap" }}>{t}</span>;
}
function FBar({ label, score, min = -100, max = 100 }: { label: string; score: number; min?: number; max?: number }) {
  const rng = max - min, pct = ((score - min) / rng) * 100, mid = ((0 - min) / rng) * 100;
  const cl = score > 15 ? C.bu : score < -15 ? C.be : C.nu;
  return (<div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
      <span style={{ fontFamily: F.s, fontSize: 13, color: C.t2 }}>{label}</span>
      <span style={{ fontFamily: F.m, fontSize: 13, fontWeight: 600, color: cl }}>{score > 0 ? "+" : ""}{score.toFixed(1)}</span>
    </div>
    <div style={{ height: 6, background: C.bd, borderRadius: 3, position: "relative", overflow: "hidden" }}>
      {min < 0 && <div style={{ position: "absolute", left: `${mid}%`, top: 0, bottom: 0, width: 1, background: "#243045", zIndex: 1 }} />}
      <div style={{ position: "absolute", left: score >= 0 ? `${mid}%` : `${pct}%`, width: `${Math.abs(pct - mid)}%`, top: 0, bottom: 0, borderRadius: 3, background: `linear-gradient(90deg, ${cl}66, ${cl})`, transition: "all 0.5s" }} />
    </div>
  </div>);
}
function DR({ l, v, c, m = true }: { l: string; v: string; c?: string; m?: boolean }) {
  return (<div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.bd}33` }}>
    <span style={{ fontFamily: F.s, fontSize: 13, color: C.t3 }}>{l}</span>
    <span style={{ fontFamily: m ? F.m : F.s, fontSize: 13, fontWeight: 600, color: c || C.tx }}>{v}</span>
  </div>);
}
function Arc({ p, sz = 120 }: { p: number; sz?: number }) {
  const r = sz / 2 - 8, cx = sz / 2, cy = sz / 2, ci = Math.PI * r;
  return (<svg width={sz} height={sz / 2 + 18} viewBox={`0 0 ${sz} ${sz / 2 + 18}`}>
    <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={C.bd} strokeWidth={7} strokeLinecap="round" />
    <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#pg)" strokeWidth={7} strokeLinecap="round" strokeDasharray={`${ci * p} ${ci * (1 - p)}`} style={{ transition: "stroke-dasharray 0.8s" }} />
    <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={C.bu} /><stop offset="100%" stopColor={C.be} /></linearGradient></defs>
    <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontFamily: F.m, fontSize: 20, fontWeight: 800, fill: C.tx }}>{(p * 100).toFixed(0)}%</text>
    <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontFamily: F.s, fontSize: 8, fill: C.t3, letterSpacing: "0.08em" }}>BULL PROB</text>
  </svg>);
}
function Dot({ ok }: { ok: boolean }) { return <div style={{ width: 8, height: 8, borderRadius: "50%", background: ok ? C.bu : C.be, boxShadow: `0 0 6px ${ok ? C.bu : C.be}66` }} />; }
function Card({ title, children, span }: { title: string; children: React.ReactNode; span?: number }) {
  return (<div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "16px 18px", gridColumn: span ? `span ${span}` : undefined, minWidth: 0 }}>
    <div style={{ fontFamily: F.s, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t2, marginBottom: 12 }}>{title}</div>
    {children}
  </div>);
}
function NoData() { return <div style={{ fontFamily: F.m, fontSize: 13, color: C.t3, textAlign: "center", padding: 24 }}>Awaiting MT5 data...</div>; }
function SChart({ hist }: { hist: Sig[] }) {
  if (hist.length < 2) return null;
  const scores = hist.slice(-40).map(s => s.master_score);
  const w = 280, h = 60, pad = 4;
  const xS = (i: number) => pad + (i / (scores.length - 1)) * (w - 2 * pad);
  const yS = (v: number) => pad + ((80 - v) / 160) * (h - 2 * pad);
  let path = `M ${xS(0)} ${yS(scores[0])}`;
  for (let i = 1; i < scores.length; i++) path += ` L ${xS(i)} ${yS(scores[i])}`;
  const last = scores[scores.length - 1], col = last >= 0 ? C.bu : C.be;
  const area = path + ` L ${xS(scores.length - 1)} ${yS(0)} L ${xS(0)} ${yS(0)} Z`;
  return (<svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
    <line x1={pad} x2={w - pad} y1={yS(0)} y2={yS(0)} stroke="#1a2438" strokeWidth={0.5} />
    <path d={area} fill={`${col}10`} /><path d={path} fill="none" stroke={col} strokeWidth={1.5} />
    <circle cx={xS(scores.length - 1)} cy={yS(last)} r={3} fill={col} />
  </svg>);
}

const LOT_SIZES = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00];

// Consensus & Regime helpers
const consensusDirColor = (d: string) => d === "UP" ? C.bu : d === "DOWN" ? C.be : C.nu;
const consensusDirArrow = (d: string) => d === "UP" ? "↑" : d === "DOWN" ? "↓" : "→";
const consensusAgreementColor = (a: string) => a === "STRONG_CONSENSUS" ? C.bb : a === "LEAN" ? C.bu : a === "MIXED" ? C.wa : C.be;
const regimeColor = (r: string) => r === "TREND" ? C.ac : r === "BREAKOUT" ? C.pu : r === "COMPRESSION" ? C.wa : C.nu;
const velocityColor = (v: string) => v === "accelerating" ? C.bu : v === "decelerating" ? C.be : C.nu;

function ConsensusBanner({ consensus }: { consensus: Consensus }) {
  const dirCol = consensusDirColor(consensus.direction);
  const agrCol = consensusAgreementColor(consensus.agreement);
  return (
    <div style={{ background: `${dirCol}0d`, borderBottom: `1px solid ${dirCol}22`, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: F.m, fontSize: 20, color: dirCol }}>{consensusDirArrow(consensus.direction)}</span>
        <span style={{ fontFamily: F.s, fontSize: 11, color: C.t2 }}>CONSENSUS</span>
        <Bdg t={consensus.agreement.replace(/_/g, " ")} c={agrCol} sz="md" />
        <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 800, color: dirCol }}>{consensus.netScore > 0 ? "+" : ""}{consensus.netScore}</span>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {consensus.votes.map(v => (
          <div key={v.engine} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3, textTransform: "uppercase" }}>{v.engine === "signal" ? "SIG" : v.engine === "gold_logic" ? "GL" : "SPE"}</span>
            <span style={{ fontFamily: F.m, fontSize: 11, fontWeight: 700, color: consensusDirColor(v.direction) }}>{consensusDirArrow(v.direction)}{Math.abs(v.score).toFixed(0)}</span>
          </div>
        ))}
      </div>
      {consensus.divergenceFlag && <Bdg t="DIVERGENCE" c={C.wa} sz="sm" />}
    </div>
  );
}

function TfRow({ tf, bias }: { tf: string; bias: number }) {
  const isBull = bias > 0.15, isBear = bias < -0.15;
  const strength = Math.abs(bias);
  const cl = isBull ? C.bu : isBear ? C.be : C.nu;
  const label = isBull ? (strength > 0.6 ? "STRONG BULL" : "BULL") : isBear ? (strength > 0.6 ? "STRONG BEAR" : "BEAR") : "NEUTRAL";
  const arrow = isBull ? "↑" : isBear ? "↓" : "→";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.bd}33` }}>
      <span style={{ fontFamily: F.m, fontSize: 13, color: C.t2, width: 36, fontWeight: 700 }}>{tf}</span>
      <span style={{ fontFamily: F.m, fontSize: 20, color: cl, lineHeight: 1 }}>{arrow}</span>
      <div style={{ flex: 1, height: 6, background: C.bd, borderRadius: 3, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#2a3a55" }} />
        {isBull && <div style={{ position: "absolute", left: "50%", width: `${strength * 50}%`, height: "100%", background: `linear-gradient(90deg, ${cl}66, ${cl})`, borderRadius: 2, transition: "all 0.6s" }} />}
        {isBear && <div style={{ position: "absolute", right: "50%", width: `${strength * 50}%`, height: "100%", background: `linear-gradient(270deg, ${cl}66, ${cl})`, borderRadius: 2, transition: "all 0.6s" }} />}
      </div>
      <Bdg t={label} c={cl} sz="sm" />
    </div>
  );
}

// V2 color helpers
const v2RegimeColor = (rc: string) => rc === "green" ? C.bu : rc === "red" ? C.be : rc === "yellow" ? C.wa : C.nu;
const v2ActionColor = (ac: string) => ac === "green" ? C.bu : ac === "red" ? C.be : ac === "yellow" ? C.wa : C.nu;

function GoldV2Banner({ v2 }: { v2: GoldV2State }) {
  const e = v2.explanation;
  const rc = v2RegimeColor(e.regimeColor);
  const ac = v2ActionColor(e.actionColor);
  return (
    <div style={{ background: `${rc}0a`, borderBottom: `1px solid ${rc}22`, padding: "6px 16px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
      {/* Regime */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3, letterSpacing: "0.08em" }}>V2 REGIME</span>
        <span style={{ fontFamily: F.m, fontSize: 12, fontWeight: 800, color: rc }}>{e.regimeLabel}</span>
        <span style={{ fontFamily: F.m, fontSize: 10, color: C.t3 }}>{e.confidencePct.toFixed(0)}%</span>
      </div>
      {/* Action */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>ACTION</span>
        <Bdg t={e.actionLabel} c={ac} sz="sm" />
      </div>
      {/* Direction gates */}
      <div style={{ display: "flex", gap: 8 }}>
        <span style={{ fontFamily: F.m, fontSize: 10, fontWeight: 700, color: e.buyStatus === "enabled" ? C.bu : C.be }}>BUY {e.buyStatus === "enabled" ? "✓" : "✗"}</span>
        <span style={{ fontFamily: F.m, fontSize: 10, fontWeight: 700, color: e.sellStatus === "enabled" ? C.bu : C.be }}>SELL {e.sellStatus === "enabled" ? "✓" : "✗"}</span>
      </div>
      {/* Spread */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Dot ok={e.spreadSafe} />
        <span style={{ fontFamily: F.m, fontSize: 10, color: e.spreadSafe ? C.t2 : C.be }}>{e.spreadLabel}</span>
      </div>
      {/* Structure flags */}
      <div style={{ display: "flex", gap: 5 }}>
        {e.structureFlags.bosUp && <Bdg t="BOS↑" c={C.bu} sz="sm" />}
        {e.structureFlags.bosDown && <Bdg t="BOS↓" c={C.be} sz="sm" />}
        {e.structureFlags.chochUp && <Bdg t="CHoCH↑" c={C.bb} sz="sm" />}
        {e.structureFlags.chochDown && <Bdg t="CHoCH↓" c={C.br} sz="sm" />}
        {e.structureFlags.bullishSweep && <Bdg t="SWEEP↑" c={C.bu} sz="sm" />}
        {e.structureFlags.bearishSweep && <Bdg t="SWEEP↓" c={C.be} sz="sm" />}
      </div>
      {/* Wrong-side freeze warning */}
      {e.riskSummary.wrongSideFreeze && <Bdg t="WRONG-SIDE FREEZE" c={C.wa} sz="sm" />}
      {e.cooldownActive && <Bdg t={`COOLDOWN ${e.cooldownBarsLeft}b`} c={C.wa} sz="sm" />}
      {!e.dataIntegrityOk && <Bdg t="DATA ISSUE" c={C.be} sz="sm" />}
    </div>
  );
}

function GoldV2Panel({ v2 }: { v2: GoldV2State }) {
  const e = v2.explanation;
  const rc = v2RegimeColor(e.regimeColor);
  const ac = v2ActionColor(e.actionColor);
  return (
    <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>

      {/* Regime + Permissions */}
      <Card title="Market Regime">
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontFamily: F.m, fontSize: 22, fontWeight: 900, color: rc, marginBottom: 4 }}>{e.regimeLabel}</div>
          <div style={{ fontFamily: F.m, fontSize: 13, color: C.t3 }}>Confidence: <span style={{ color: rc }}>{e.confidencePct.toFixed(0)}%</span></div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 12 }}>
          <div style={{ flex: 1, background: e.buyStatus === "enabled" ? `${C.bu}15` : `${C.be}10`, borderRadius: 6, padding: "8px 10px", border: `1px solid ${e.buyStatus === "enabled" ? C.bu : C.be}44`, textAlign: "center" }}>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.t3, marginBottom: 3 }}>BUY</div>
            <div style={{ fontFamily: F.m, fontSize: 18, fontWeight: 900, color: e.buyStatus === "enabled" ? C.bu : C.be }}>{e.buyStatus === "enabled" ? "✓" : "✗"}</div>
            {e.buyBlockReasons.slice(0, 2).map((r, i) => <div key={i} style={{ fontFamily: F.s, fontSize: 10, color: C.be, marginTop: 2, lineHeight: 1.3 }}>{r}</div>)}
          </div>
          <div style={{ flex: 1, background: e.sellStatus === "enabled" ? `${C.bu}15` : `${C.be}10`, borderRadius: 6, padding: "8px 10px", border: `1px solid ${e.sellStatus === "enabled" ? C.bu : C.be}44`, textAlign: "center" }}>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.t3, marginBottom: 3 }}>SELL</div>
            <div style={{ fontFamily: F.m, fontSize: 18, fontWeight: 900, color: e.sellStatus === "enabled" ? C.bu : C.be }}>{e.sellStatus === "enabled" ? "✓" : "✗"}</div>
            {e.sellBlockReasons.slice(0, 2).map((r, i) => <div key={i} style={{ fontFamily: F.s, fontSize: 10, color: C.be, marginTop: 2, lineHeight: 1.3 }}>{r}</div>)}
          </div>
        </div>
        <div style={{ padding: "10px", background: `${ac}10`, borderRadius: 6, border: `1px solid ${ac}33`, textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontFamily: F.m, fontSize: 15, fontWeight: 900, color: ac }}>{e.actionLabel}</div>
          {e.actionReasons.slice(0, 3).map((r, i) => <div key={i} style={{ fontFamily: F.s, fontSize: 11, color: C.t2, marginTop: 3 }}>{r}</div>)}
        </div>
        {v2.regime.reasons.slice(0, 3).map((r, i) => (
          <div key={i} style={{ fontFamily: F.s, fontSize: 11, color: C.t3, padding: "2px 0", borderBottom: `1px solid ${C.bd}22` }}>→ {r}</div>
        ))}
      </Card>

      {/* Spread Safety */}
      <Card title="Spread Gate">
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Dot ok={e.spreadSafe} />
            <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: e.spreadSafe ? C.bu : C.be }}>{e.spreadLabel}</span>
          </div>
          {e.cooldownActive && (
            <div style={{ padding: "5px 8px", background: `${C.wa}15`, border: `1px solid ${C.wa}33`, borderRadius: 4, marginBottom: 8 }}>
              <span style={{ fontFamily: F.m, fontSize: 11, color: C.wa }}>Cooldown: {e.cooldownBarsLeft} bars remaining</span>
            </div>
          )}
        </div>
        <DR l="Spread" v={`${e.spreadDetails.spread.toFixed(0)}pts`} c={e.spreadSafe ? C.bu : C.be} />
        <DR l="ATR" v={`${e.spreadDetails.atr.toFixed(1)}pts`} c={C.t2} />
        <DR l="Spread/ATR" v={`${e.spreadDetails.ratio.toFixed(1)}%`} c={e.spreadDetails.ratio > 15 ? C.be : C.bu} />
        <DR l="Regime" v={e.spreadDetails.label.toUpperCase()} c={e.spreadDetails.label === "spike" ? C.be : e.spreadDetails.label === "wide" ? C.wa : C.bu} />
        {v2.spreadGate.blockReasons.map((r, i) => (
          <div key={i} style={{ fontFamily: F.s, fontSize: 11, color: C.be, padding: "3px 0", marginTop: 2 }}>✗ {r}</div>
        ))}
      </Card>

      {/* Structure Panel */}
      <Card title="Structure Engine">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <Bdg t={`M5: ${v2.structure.m5Trend.toUpperCase()}`} c={v2.structure.m5Trend === "bullish" ? C.bu : v2.structure.m5Trend === "bearish" ? C.be : C.nu} sz="sm" />
          <Bdg t={`M15: ${v2.structure.m15Trend.toUpperCase()}`} c={v2.structure.m15Trend === "bullish" ? C.bu : v2.structure.m15Trend === "bearish" ? C.be : C.nu} sz="sm" />
          <Bdg t={`H1: ${v2.structure.h1Bias.toUpperCase()}`} c={v2.structure.h1Bias === "bullish" ? C.bu : v2.structure.h1Bias === "bearish" ? C.be : C.nu} sz="sm" />
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
          {e.structureFlags.bosUp && <Bdg t="BOS UP" c={C.bu} />}
          {e.structureFlags.bosDown && <Bdg t="BOS DOWN" c={C.be} />}
          {e.structureFlags.chochUp && <Bdg t="CHoCH UP" c={C.bb} />}
          {e.structureFlags.chochDown && <Bdg t="CHoCH DOWN" c={C.br} />}
          {e.structureFlags.bullishSweep && <Bdg t="SWEEP LOW ↑" c={C.bu} />}
          {e.structureFlags.bearishSweep && <Bdg t="SWEEP HIGH ↓" c={C.be} />}
        </div>
        <DR l="Confidence" v={`${v2.structure.structureConfidence.toFixed(0)}%`} c={v2.structure.structureConfidence > 70 ? C.bu : v2.structure.structureConfidence > 50 ? C.wa : C.be} />
        {v2.structure.lastSwingHigh && <DR l="Last Swing H" v={v2.structure.lastSwingHigh.toFixed(2)} c={C.be} />}
        {v2.structure.lastSwingLow && <DR l="Last Swing L" v={v2.structure.lastSwingLow.toFixed(2)} c={C.bu} />}
        <div style={{ marginTop: 8 }}>
          {e.structureNotes.slice(0, 4).map((n, i) => (
            <div key={i} style={{ fontFamily: F.s, fontSize: 11, color: C.t2, padding: "2px 0" }}>• {n}</div>
          ))}
        </div>
      </Card>

      {/* Indicator Matrix */}
      <Card title="Indicator Matrix">
        <FBar label="Overall Bias" score={v2.indicatorMatrix.overallBias} />
        <FBar label="Trend" score={v2.indicatorMatrix.trendScore} />
        <FBar label="Momentum" score={v2.indicatorMatrix.momentumScore} />
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontFamily: F.s, fontSize: 13, color: C.t2 }}>Volatility</span>
            <span style={{ fontFamily: F.m, fontSize: 13, fontWeight: 600, color: C.t2 }}>{v2.indicatorMatrix.volatilityScore.toFixed(0)}/100</span>
          </div>
          <div style={{ height: 6, background: C.bd, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${v2.indicatorMatrix.volatilityScore}%`, height: "100%", background: `linear-gradient(90deg, ${C.wa}66, ${C.wa})`, borderRadius: 3, transition: "width 0.5s" }} />
          </div>
        </div>
        <FBar label="Participation/Value" score={v2.indicatorMatrix.participationScore} />
        {v2.indicatorMatrix.divergenceWarnings.length > 0 && (
          <div style={{ marginTop: 8, padding: "6px 8px", background: `${C.wa}10`, borderRadius: 4, border: `1px solid ${C.wa}22` }}>
            <div style={{ fontFamily: F.m, fontSize: 10, color: C.wa, marginBottom: 4 }}>DIVERGENCE WARNINGS</div>
            {v2.indicatorMatrix.divergenceWarnings.map((w, i) => (
              <div key={i} style={{ fontFamily: F.s, fontSize: 11, color: C.wa }}>⚠ {w}</div>
            ))}
          </div>
        )}
        {v2.indicatorMatrix.summary.slice(0, 4).map((s, i) => (
          <div key={i} style={{ fontFamily: F.s, fontSize: 11, color: C.t3, padding: "2px 0" }}>{s}</div>
        ))}
      </Card>

      {/* Risk Governor */}
      <Card title="Risk Governor">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {v2.riskGovernor.wrongSideFreeze && <Bdg t="WRONG-SIDE FREEZE" c={C.wa} sz="md" />}
          {v2.riskGovernor.dailyLossLock && <Bdg t="DAILY LOSS LOCK" c={C.be} sz="md" />}
          {v2.riskGovernor.maxExposureReached && <Bdg t="MAX EXPOSURE" c={C.wa} sz="md" />}
          {v2.riskGovernor.blockAllEntries && <Bdg t="ALL ENTRIES BLOCKED" c={C.be} sz="md" />}
        </div>
        <DR l="Open Buys" v={String(v2.riskGovernor.openBuys)} c={v2.riskGovernor.openBuys > 0 ? C.bu : C.t3} />
        <DR l="Open Sells" v={String(v2.riskGovernor.openSells)} c={v2.riskGovernor.openSells > 0 ? C.be : C.t3} />
        <DR l="Buy Direction" v={v2.riskGovernor.blockBuy ? "BLOCKED" : "ALLOWED"} c={v2.riskGovernor.blockBuy ? C.be : C.bu} />
        <DR l="Sell Direction" v={v2.riskGovernor.blockSell ? "BLOCKED" : "ALLOWED"} c={v2.riskGovernor.blockSell ? C.be : C.bu} />
        {v2.riskGovernor.reasons.slice(0, 4).map((r, i) => (
          <div key={i} style={{ fontFamily: F.s, fontSize: 11, color: v2.riskGovernor.blockAllEntries ? C.be : C.wa, padding: "2px 0", borderBottom: `1px solid ${C.bd}22` }}>→ {r}</div>
        ))}
      </Card>

      {/* Data Integrity */}
      <Card title="Data Integrity">
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Dot ok={e.dataIntegrityOk} />
          <span style={{ fontFamily: F.m, fontSize: 13, fontWeight: 700, color: e.dataIntegrityOk ? C.bu : C.be }}>{e.dataIntegrityOk ? "Feed Healthy" : "Feed Issues"}</span>
        </div>
        <DR l="Quality Score" v={`${v2.regime.confidence.toFixed(0)}%`} c={v2.regime.confidence > 70 ? C.bu : v2.regime.confidence > 40 ? C.wa : C.be} />
        <DR l="Spread Present" v={v2.spreadGate.spreadPoints > 0 ? "Yes" : "No"} c={v2.spreadGate.spreadPoints > 0 ? C.bu : C.be} />
        <DR l="MTF Structure" v={`M5:${v2.structure.m5Trend[0].toUpperCase()} M15:${v2.structure.m15Trend[0].toUpperCase()} H1:${v2.structure.h1Bias[0].toUpperCase()}`} c={C.t2} />
        {e.dataIntegrityIssues.slice(0, 4).map((issue, i) => (
          <div key={i} style={{ fontFamily: F.s, fontSize: 11, color: C.be, padding: "2px 0" }}>✗ {issue}</div>
        ))}
        {v2.tradePermission.warnings.slice(0, 3).map((w, i) => (
          <div key={i} style={{ fontFamily: F.s, fontSize: 11, color: C.wa, padding: "2px 0" }}>⚠ {w}</div>
        ))}
      </Card>
    </div>
  );
}

function SRLadder({ signal }: { signal: Sig }) {
  const st = signal.factors?.structure?.metadata || {};
  const vt = signal.factors?.volatility?.metadata || {};
  const tr = signal.factors?.trend?.metadata || {};
  const price = signal.price;
  const raw = [
    { label: "BB Upper", px: vt.bb?.upper, type: "resist" },
    { label: "Session H", px: st.session_high, type: "resist" },
    { label: "Swing H", px: st.swing_high, type: "resist" },
    { label: "PDH", px: st.pdh, type: "resist" },
    { label: "EMA 20", px: tr.ema20, type: "ema" },
    { label: "EMA 50", px: tr.ema50, type: "ema" },
    { label: "VWAP", px: st.vwap, type: "vwap" },
    { label: "EMA 200", px: tr.ema200, type: "ema" },
    { label: "Swing L", px: st.swing_low, type: "support" },
    { label: "PDL", px: st.pdl, type: "support" },
    { label: "Session L", px: st.session_low, type: "support" },
    { label: "BB Lower", px: vt.bb?.lower, type: "support" },
  ].filter(l => l.px && l.px > 0 && Math.abs((l.px as number) - price) < 150)
   .sort((a, b) => (b.px as number) - (a.px as number));
  const above = raw.filter(l => (l.px as number) >= price);
  const below = raw.filter(l => (l.px as number) < price);
  const typeColor = (t: string) => t === "resist" ? C.be : t === "support" ? C.bu : t === "vwap" ? C.pu : C.wa;
  const dist = (px: number) => Math.abs(px - price).toFixed(2);
  return (
    <div style={{ fontFamily: F.m, fontSize: 11 }}>
      {above.slice(0, 5).reverse().map((l, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 6px", borderBottom: `1px solid ${C.bd}22` }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ color: typeColor(l.type), fontSize: 8 }}>▲</span>
            <span style={{ color: C.t2 }}>{l.label}</span>
            <span style={{ color: C.t3, fontSize: 9 }}>+{dist(l.px as number)}</span>
          </div>
          <span style={{ fontWeight: 700, color: typeColor(l.type) }}>{(l.px as number).toFixed(2)}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", background: `${C.ac}22`, border: `1px solid ${C.ac}44`, borderRadius: 3, margin: "3px 0" }}>
        <span style={{ color: C.ac, fontWeight: 800, letterSpacing: "0.05em" }}>▶ PRICE</span>
        <span style={{ color: C.ac, fontWeight: 800 }}>{price.toFixed(2)}</span>
      </div>
      {below.slice(0, 5).map((l, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 6px", borderBottom: `1px solid ${C.bd}22` }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ color: typeColor(l.type), fontSize: 8 }}>▼</span>
            <span style={{ color: C.t2 }}>{l.label}</span>
            <span style={{ color: C.t3, fontSize: 9 }}>-{dist(l.px as number)}</span>
          </div>
          <span style={{ fontWeight: 700, color: typeColor(l.type) }}>{(l.px as number).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function TradePanel({ signal, account, tradeMode, onTrade }: { signal: Sig | null; account: Acct | null; tradeMode: string; onTrade: (action: string, dir?: string, vol?: number, sl?: number, tp?: number, ticket?: number, orderId?: string) => Promise<any> }) {
  const [lot, setLot] = useState(0.10);
  const [customLot, setCustomLot] = useState("");
  const [useSig, setUseSig] = useState(true);
  const [manSl, setManSl] = useState("");
  const [manTp, setManTp] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [rrRatio, setRrRatio] = useState(2); // Configurable R:R

  const activeLot = customLot ? parseFloat(customLot) || lot : lot;
  const bid = signal?.bid || 0;
  const ask = signal?.ask || bid + 3;
  const atr = signal?.factors?.volatility?.metadata?.atr || 3;

  // Spread-aware entry prices
  const buyEntry = ask;
  const sellEntry = bid;

  // Signal-based SL (use invalidation if valid)
  const sigInvalidation = signal?.invalidation || 0;
  const useSigInvalidation = sigInvalidation > 0 && Math.abs(signal?.price || 0 - sigInvalidation) < atr * 4;

  // Calculate SL/TP for both directions
  const getBuySl = () => {
    if (!useSig && manSl) return parseFloat(manSl);
    if (useSigInvalidation && sigInvalidation < buyEntry) return sigInvalidation;
    return +(buyEntry - atr * 1.5).toFixed(2);
  };
  const getSellSl = () => {
    if (!useSig && manSl) return parseFloat(manSl);
    if (useSigInvalidation && sigInvalidation > sellEntry) return sigInvalidation;
    return +(sellEntry + atr * 1.5).toFixed(2);
  };

  const buySl = getBuySl();
  const sellSl = getSellSl();
  const buySlDist = Math.abs(buyEntry - buySl);
  const sellSlDist = Math.abs(sellEntry - sellSl);

  const getBuyTp = () => {
    if (!useSig && manTp) return parseFloat(manTp);
    return +(buyEntry + buySlDist * rrRatio).toFixed(2);
  };
  const getSellTp = () => {
    if (!useSig && manTp) return parseFloat(manTp);
    return +(sellEntry - sellSlDist * rrRatio).toFixed(2);
  };

  const buyTp = getBuyTp();
  const sellTp = getSellTp();

  // Risk calculations
  const balance = account?.balance || 10000;
  const buyRisk = buySlDist * activeLot * 100;
  const sellRisk = sellSlDist * activeLot * 100;
  const buyRiskPct = (buyRisk / balance) * 100;
  const sellRiskPct = (sellRisk / balance) * 100;
  const buyReward = buySlDist * rrRatio * activeLot * 100;
  const sellReward = sellSlDist * rrRatio * activeLot * 100;

  // Determine signal direction
  const dir = signal?.state.includes("bull") || signal?.state.includes("long") || signal?.state === "breakout_watch_up" ? "buy" :
    signal?.state.includes("bear") || signal?.state.includes("short") || signal?.state === "breakout_watch_down" ? "sell" : null;

  const exec = async (direction: string) => {
    if (loading) return;
    setLoading(true); setStatus(null);
    const sl = direction === "buy" ? buySl : sellSl;
    const tp = direction === "buy" ? buyTp : sellTp;
    try {
      const r = await onTrade("open", direction, activeLot, sl, tp);
      const modeLabel = r?.mode === "paper" ? "📝 PAPER" : "🔴 LIVE";
      setStatus({ ok: r?.ok, msg: r?.ok ? `✓ ${modeLabel} ${direction.toUpperCase()} ${activeLot} — ${r.order_id}` : `✗ ${r?.error || "Failed"}` });
    } catch (e: any) { setStatus({ ok: false, msg: `✗ ${e.message}` }); }
    setLoading(false);
  };

  const closeAll = async () => {
    if (loading) return;
    setLoading(true); setStatus(null);
    try {
      const r = await onTrade("close_all");
      setStatus({ ok: r?.ok, msg: r?.ok ? `✓ Closed ${r.paper_closed || 0} paper, live queued` : `✗ ${r?.error}` });
    } catch (e: any) { setStatus({ ok: false, msg: `✗ ${e.message}` }); }
    setLoading(false);
  };

  return (
    <div>
      {/* Trade Mode Indicator */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, padding: "6px 10px", background: tradeMode === "live" ? `${C.be}14` : `${C.ac}14`, borderRadius: 4, border: `1px solid ${tradeMode === "live" ? C.be : C.ac}33` }}>
        <span style={{ fontFamily: F.m, fontSize: 11, color: C.t2 }}>MODE</span>
        <Bdg t={tradeMode === "live" ? "🔴 LIVE" : tradeMode === "paper" ? "📝 PAPER" : tradeMode?.toUpperCase() || "—"} c={tradeMode === "live" ? C.be : C.ac} sz="md" />
      </div>

      {/* Price display with entry highlights */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontFamily: F.m, fontSize: 9, color: C.t3, marginBottom: 2 }}>SELL @ BID</div>
          <div style={{ fontFamily: F.m, fontSize: 22, fontWeight: 800, color: C.be }}>{bid?.toFixed(2) || "—"}</div>
        </div>
        <div style={{ width: 1, height: 45, background: C.bd }} />
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontFamily: F.m, fontSize: 9, color: C.t3, marginBottom: 2 }}>BUY @ ASK</div>
          <div style={{ fontFamily: F.m, fontSize: 22, fontWeight: 800, color: C.bu }}>{ask?.toFixed(2) || "—"}</div>
        </div>
        <div style={{ width: 1, height: 45, background: C.bd }} />
        <div style={{ textAlign: "center", flex: 0.6 }}>
          <div style={{ fontFamily: F.m, fontSize: 9, color: C.t3, marginBottom: 2 }}>SPREAD</div>
          <div style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: (signal?.spread || 0) > 30 ? C.wa : C.t2 }}>{signal?.spread?.toFixed(1) || "—"}</div>
        </div>
      </div>

      {/* Signal recommendation */}
      {signal && dir && (
        <div style={{ padding: "6px 10px", background: `${stC(signal.state)}0d`, border: `1px solid ${stC(signal.state)}22`, borderRadius: 4, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: F.s, fontSize: 11, color: stC(signal.state) }}>Signal: {sl(signal.state)}</span>
          <span style={{ fontFamily: F.m, fontSize: 11, color: C.t3 }}>Score: {signal.master_score > 0 ? "+" : ""}{signal.master_score.toFixed(1)} | Conf: {(signal.confidence_pct * 100).toFixed(0)}%</span>
        </div>
      )}
      {signal?.no_trade && (
        <div style={{ padding: "6px 10px", background: `${C.wa}0d`, border: `1px solid ${C.wa}22`, borderRadius: 4, marginBottom: 10 }}>
          <span style={{ fontFamily: F.s, fontSize: 11, color: C.wa }}>⊘ No Trade — {signal.no_trade_reason}</span>
        </div>
      )}

      {/* Lot size + R:R row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 2 }}>
          <div style={{ fontFamily: F.s, fontSize: 11, color: C.t3, marginBottom: 4 }}>Lot Size</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {LOT_SIZES.map(l => (
              <button key={l} onClick={() => { setLot(l); setCustomLot(""); }}
                style={{ fontFamily: F.m, fontSize: 11, padding: "5px 8px", borderRadius: 3, border: `1px solid ${lot === l && !customLot ? C.ac : C.bd}`, background: lot === l && !customLot ? `${C.ac}1a` : "transparent", color: lot === l && !customLot ? C.ac : C.t2, cursor: "pointer" }}>
                {l}
              </button>
            ))}
            <input value={customLot} onChange={e => setCustomLot(e.target.value)} placeholder="..."
              style={{ fontFamily: F.m, fontSize: 11, width: 50, padding: "5px 6px", borderRadius: 3, border: `1px solid ${customLot ? C.ac : C.bd}`, background: C.bg, color: C.tx, outline: "none" }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: F.s, fontSize: 11, color: C.t3, marginBottom: 4 }}>R:R Ratio</div>
          <div style={{ display: "flex", gap: 3 }}>
            {[1.5, 2, 3, 4].map(rr => (
              <button key={rr} onClick={() => setRrRatio(rr)}
                style={{ fontFamily: F.m, fontSize: 10, padding: "5px 7px", borderRadius: 3, border: `1px solid ${rrRatio === rr ? C.pu : C.bd}`, background: rrRatio === rr ? `${C.pu}1a` : "transparent", color: rrRatio === rr ? C.pu : C.t3, cursor: "pointer" }}>
                {rr}:1
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SL/TP Mode Toggle */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ fontFamily: F.s, fontSize: 11, color: C.t3 }}>SL / TP</span>
          <button onClick={() => setUseSig(!useSig)}
            style={{ fontFamily: F.s, fontSize: 10, padding: "2px 8px", borderRadius: 3, border: `1px solid ${useSig ? C.bu : C.bd}`, background: useSig ? `${C.bu}1a` : "transparent", color: useSig ? C.bu : C.t3, cursor: "pointer" }}>
            {useSig ? "Auto" : "Manual"}
          </button>
          {useSig && useSigInvalidation && <Bdg t="INV" c={C.pu} sz="sm" />}
          {useSig && !useSigInvalidation && <Bdg t="ATR" c={C.wa} sz="sm" />}
        </div>
        {!useSig && (
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={manSl} onChange={e => setManSl(e.target.value)} placeholder="SL price"
              style={{ fontFamily: F.m, fontSize: 11, width: 85, padding: "5px 7px", borderRadius: 3, border: `1px solid ${C.be}44`, background: C.bg, color: C.tx, outline: "none" }} />
            <input value={manTp} onChange={e => setManTp(e.target.value)} placeholder="TP price"
              style={{ fontFamily: F.m, fontSize: 11, width: 85, padding: "5px 7px", borderRadius: 3, border: `1px solid ${C.bu}44`, background: C.bg, color: C.tx, outline: "none" }} />
          </div>
        )}
      </div>

      {/* Trade Preview Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {/* BUY Preview */}
        <div style={{ padding: "8px 10px", background: `${C.bu}08`, border: `1px solid ${C.bu}22`, borderRadius: 5 }}>
          <div style={{ fontFamily: F.m, fontSize: 10, color: C.bu, marginBottom: 4, fontWeight: 700 }}>▲ BUY PREVIEW</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, fontFamily: F.m, fontSize: 10 }}>
            <span style={{ color: C.t3 }}>Entry:</span><span style={{ color: C.tx, textAlign: "right" }}>{buyEntry.toFixed(2)}</span>
            <span style={{ color: C.t3 }}>SL:</span><span style={{ color: C.be, textAlign: "right" }}>{buySl.toFixed(2)} <span style={{ color: C.t3, fontSize: 8 }}>(-{buySlDist.toFixed(1)})</span></span>
            <span style={{ color: C.t3 }}>TP:</span><span style={{ color: C.bu, textAlign: "right" }}>{buyTp.toFixed(2)} <span style={{ color: C.t3, fontSize: 8 }}>(+{(buySlDist * rrRatio).toFixed(1)})</span></span>
            <span style={{ color: C.t3 }}>Risk:</span><span style={{ color: buyRiskPct > 2 ? C.wa : C.tx, textAlign: "right" }}>${buyRisk.toFixed(0)} <span style={{ fontSize: 8 }}>({buyRiskPct.toFixed(1)}%)</span></span>
            <span style={{ color: C.t3 }}>Reward:</span><span style={{ color: C.bu, textAlign: "right" }}>${buyReward.toFixed(0)}</span>
          </div>
        </div>
        {/* SELL Preview */}
        <div style={{ padding: "8px 10px", background: `${C.be}08`, border: `1px solid ${C.be}22`, borderRadius: 5 }}>
          <div style={{ fontFamily: F.m, fontSize: 10, color: C.be, marginBottom: 4, fontWeight: 700 }}>▼ SELL PREVIEW</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, fontFamily: F.m, fontSize: 10 }}>
            <span style={{ color: C.t3 }}>Entry:</span><span style={{ color: C.tx, textAlign: "right" }}>{sellEntry.toFixed(2)}</span>
            <span style={{ color: C.t3 }}>SL:</span><span style={{ color: C.be, textAlign: "right" }}>{sellSl.toFixed(2)} <span style={{ color: C.t3, fontSize: 8 }}>(+{sellSlDist.toFixed(1)})</span></span>
            <span style={{ color: C.t3 }}>TP:</span><span style={{ color: C.bu, textAlign: "right" }}>{sellTp.toFixed(2)} <span style={{ color: C.t3, fontSize: 8 }}>(-{(sellSlDist * rrRatio).toFixed(1)})</span></span>
            <span style={{ color: C.t3 }}>Risk:</span><span style={{ color: sellRiskPct > 2 ? C.wa : C.tx, textAlign: "right" }}>${sellRisk.toFixed(0)} <span style={{ fontSize: 8 }}>({sellRiskPct.toFixed(1)}%)</span></span>
            <span style={{ color: C.t3 }}>Reward:</span><span style={{ color: C.bu, textAlign: "right" }}>${sellReward.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Buy / Sell buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <button onClick={() => exec("buy")} disabled={loading || !bid}
          style={{ padding: "14px 0", borderRadius: 6, border: "none", background: loading || !bid ? `${C.bu}44` : `linear-gradient(135deg, #0fd49288, #0fd492)`, color: "#080c14", fontFamily: F.m, fontWeight: 800, fontSize: 15, cursor: loading || !bid ? "not-allowed" : "pointer", letterSpacing: "0.05em" }}>
          ▲ BUY @ {ask.toFixed(2)}
        </button>
        <button onClick={() => exec("sell")} disabled={loading || !bid}
          style={{ padding: "14px 0", borderRadius: 6, border: "none", background: loading || !bid ? `${C.be}44` : `linear-gradient(135deg, #f0484888, #f04848)`, color: "#fff", fontFamily: F.m, fontWeight: 800, fontSize: 15, cursor: loading || !bid ? "not-allowed" : "pointer", letterSpacing: "0.05em" }}>
          ▼ SELL @ {bid.toFixed(2)}
        </button>
      </div>

      {/* Close All */}
      {(account?.positions?.length || 0) > 0 && (
        <button onClick={closeAll} disabled={loading}
          style={{ width: "100%", padding: "8px 0", borderRadius: 5, border: `1px solid ${C.wa}44`, background: `${C.wa}0d`, color: C.wa, fontFamily: F.m, fontWeight: 700, fontSize: 12, cursor: loading ? "not-allowed" : "pointer", marginBottom: 8 }}>
          ✕ CLOSE ALL ({account.positions.length})
        </button>
      )}

      {/* Account summary */}
      {account && (
        <div style={{ borderTop: `1px solid ${C.bd}`, paddingTop: 8, marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
            <span style={{ fontFamily: F.m, fontSize: 11, color: C.t3 }}>Balance</span>
            <span style={{ fontFamily: F.m, fontSize: 11, color: C.tx }}>${account.balance?.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
            <span style={{ fontFamily: F.m, fontSize: 11, color: C.t3 }}>Equity</span>
            <span style={{ fontFamily: F.m, fontSize: 11, color: account.profit >= 0 ? C.bu : C.be }}>${account.equity?.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
            <span style={{ fontFamily: F.m, fontSize: 11, color: C.t3 }}>Open P&L</span>
            <span style={{ fontFamily: F.m, fontSize: 12, fontWeight: 700, color: account.profit >= 0 ? C.bu : C.be }}>{fp(account.profit)}</span>
          </div>
        </div>
      )}

      {status && (
        <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, background: status.ok ? `${C.bu}0d` : `${C.be}0d`, border: `1px solid ${status.ok ? C.bu : C.be}33` }}>
          <span style={{ fontFamily: F.m, fontSize: 11, color: status.ok ? C.bu : C.be }}>{status.msg}</span>
        </div>
      )}
    </div>
  );
}

// Paper trade type for combined display
interface PaperTrade {
  order_id: string;
  direction: string;
  volume: number;
  entry_price: number;
  sl: number;
  tp: number;
  profit?: number;
  status: string;
  timestamp: string;
}

function PositionsPanel({
  positions,
  paperTrades,
  currentBid,
  onClose,
  onModify,
  onBreakeven,
}: {
  positions: Pos[];
  paperTrades?: PaperTrade[];
  currentBid: number;
  onClose: (ticket?: number, orderId?: string) => Promise<any>;
  onModify: (sl?: number, tp?: number, ticket?: number, orderId?: string) => Promise<any>;
  onBreakeven: (ticket?: number, orderId?: string) => Promise<any>;
}) {
  const [closing, setClosing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editSl, setEditSl] = useState("");
  const [editTp, setEditTp] = useState("");
  const [msgs, setMsgs] = useState<Record<string, string>>({});

  const close = async (id: string, ticket?: number, orderId?: string) => {
    setClosing(id);
    try {
      const r = await onClose(ticket, orderId);
      setMsgs(m => ({ ...m, [id]: r?.ok ? "✓ Closed" : `✗ ${r?.error}` }));
    } catch (e: any) { setMsgs(m => ({ ...m, [id]: `✗ ${e.message}` })); }
    setClosing(null);
  };

  const modify = async (id: string, ticket?: number, orderId?: string) => {
    const sl = editSl ? parseFloat(editSl) : undefined;
    const tp = editTp ? parseFloat(editTp) : undefined;
    if (!sl && !tp) { setEditing(null); return; }
    try {
      const r = await onModify(sl, tp, ticket, orderId);
      setMsgs(m => ({ ...m, [id]: r?.ok ? "✓ Modified" : `✗ ${r?.error}` }));
      setEditing(null); setEditSl(""); setEditTp("");
    } catch (e: any) { setMsgs(m => ({ ...m, [id]: `✗ ${e.message}` })); }
  };

  const breakeven = async (id: string, ticket?: number, orderId?: string) => {
    try {
      const r = await onBreakeven(ticket, orderId);
      setMsgs(m => ({ ...m, [id]: r?.ok ? `✓ BE @ ${r.sl?.toFixed(2)}` : `✗ ${r?.error}` }));
    } catch (e: any) { setMsgs(m => ({ ...m, [id]: `✗ ${e.message}` })); }
  };

  // Combine live and paper positions
  const allPositions = [
    ...positions.map(p => ({
      id: `live-${p.ticket}`,
      type: "live" as const,
      ticket: p.ticket,
      direction: p.direction,
      volume: p.volume,
      entry: p.open_price,
      current: p.current_price,
      sl: p.sl,
      tp: p.tp,
      profit: p.profit,
    })),
    ...(paperTrades || []).filter(t => t.status === "filled").map(t => ({
      id: `paper-${t.order_id}`,
      type: "paper" as const,
      orderId: t.order_id,
      direction: t.direction,
      volume: t.volume,
      entry: t.entry_price,
      current: t.direction === "buy" ? currentBid : currentBid + 3,
      sl: t.sl,
      tp: t.tp,
      profit: t.profit || (t.direction === "buy"
        ? (currentBid - t.entry_price) * t.volume * 100
        : (t.entry_price - currentBid) * t.volume * 100),
    })),
  ];

  if (!allPositions.length) {
    return <div style={{ fontFamily: F.m, fontSize: 13, color: C.t3, textAlign: "center", padding: 24 }}>No open positions</div>;
  }

  return (
    <div>
      {allPositions.map(p => {
        const isEditing = editing === p.id;
        const msg = msgs[p.id];
        const canBreakeven = p.direction === "buy" ? currentBid > p.entry : currentBid < p.entry;

        return (
          <div key={p.id} style={{ padding: "10px 12px", marginBottom: 8, background: `${p.type === "paper" ? C.ac : C.pu}08`, border: `1px solid ${p.type === "paper" ? C.ac : C.pu}22`, borderRadius: 6 }}>
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bdg t={p.direction.toUpperCase()} c={p.direction === "buy" ? C.bu : C.be} sz="md" />
                <span style={{ fontFamily: F.m, fontSize: 13, color: C.tx, fontWeight: 700 }}>{p.volume} lot</span>
                <Bdg t={p.type.toUpperCase()} c={p.type === "paper" ? C.ac : C.pu} sz="sm" />
              </div>
              <div style={{ fontFamily: F.m, fontSize: 15, fontWeight: 800, color: (p.profit || 0) >= 0 ? C.bu : C.be }}>
                {fp(p.profit || 0)}
              </div>
            </div>

            {/* Price info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>Entry</div>
                <div style={{ fontFamily: F.m, fontSize: 12, color: C.tx }}>{p.entry?.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>Current</div>
                <div style={{ fontFamily: F.m, fontSize: 12, color: C.tx }}>{p.current?.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontFamily: F.m, fontSize: 9, color: C.be }}>SL</div>
                {isEditing ? (
                  <input value={editSl} onChange={e => setEditSl(e.target.value)} placeholder={p.sl?.toFixed(2) || "—"}
                    style={{ fontFamily: F.m, fontSize: 11, width: "100%", padding: "3px 5px", borderRadius: 3, border: `1px solid ${C.be}44`, background: C.bg, color: C.tx, outline: "none" }} />
                ) : (
                  <div style={{ fontFamily: F.m, fontSize: 12, color: C.be }}>{p.sl?.toFixed(2) || "—"}</div>
                )}
              </div>
              <div>
                <div style={{ fontFamily: F.m, fontSize: 9, color: C.bu }}>TP</div>
                {isEditing ? (
                  <input value={editTp} onChange={e => setEditTp(e.target.value)} placeholder={p.tp?.toFixed(2) || "—"}
                    style={{ fontFamily: F.m, fontSize: 11, width: "100%", padding: "3px 5px", borderRadius: 3, border: `1px solid ${C.bu}44`, background: C.bg, color: C.tx, outline: "none" }} />
                ) : (
                  <div style={{ fontFamily: F.m, fontSize: 12, color: C.bu }}>{p.tp?.toFixed(2) || "—"}</div>
                )}
              </div>
            </div>

            {/* Actions */}
            {msg ? (
              <div style={{ fontFamily: F.m, fontSize: 11, color: msg.startsWith("✓") ? C.bu : C.be, padding: "4px 0" }}>{msg}</div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {isEditing ? (
                  <>
                    <button onClick={() => modify(p.id, p.type === "live" ? p.ticket : undefined, p.type === "paper" ? p.orderId : undefined)}
                      style={{ fontFamily: F.m, fontSize: 10, padding: "4px 10px", borderRadius: 3, border: `1px solid ${C.bu}44`, background: `${C.bu}1a`, color: C.bu, cursor: "pointer" }}>
                      Save
                    </button>
                    <button onClick={() => { setEditing(null); setEditSl(""); setEditTp(""); }}
                      style={{ fontFamily: F.m, fontSize: 10, padding: "4px 10px", borderRadius: 3, border: `1px solid ${C.t3}44`, background: "transparent", color: C.t3, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditing(p.id); setEditSl(""); setEditTp(""); }}
                      style={{ fontFamily: F.m, fontSize: 10, padding: "4px 10px", borderRadius: 3, border: `1px solid ${C.ac}44`, background: `${C.ac}0d`, color: C.ac, cursor: "pointer" }}>
                      Edit SL/TP
                    </button>
                    {canBreakeven && (
                      <button onClick={() => breakeven(p.id, p.type === "live" ? p.ticket : undefined, p.type === "paper" ? p.orderId : undefined)}
                        style={{ fontFamily: F.m, fontSize: 10, padding: "4px 10px", borderRadius: 3, border: `1px solid ${C.wa}44`, background: `${C.wa}0d`, color: C.wa, cursor: "pointer" }}>
                        → B/E
                      </button>
                    )}
                    <button onClick={() => close(p.id, p.type === "live" ? p.ticket : undefined, p.type === "paper" ? p.orderId : undefined)}
                      disabled={closing === p.id}
                      style={{ fontFamily: F.m, fontSize: 10, padding: "4px 10px", borderRadius: 3, border: `1px solid ${C.be}44`, background: `${C.be}0d`, color: C.be, cursor: closing === p.id ? "not-allowed" : "pointer" }}>
                      Close
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// SPECTRE HELPERS + COMPONENTS
// ============================================================
const spectreScoreColor = (s: number) => s >= 50 ? C.bb : s >= 20 ? C.bu : s > -20 ? C.nu : s > -50 ? C.be : C.br;
const spectreStateColor = (st: string) => st?.includes("strong_bull") ? C.bb : st?.includes("bull") ? C.bu : st?.includes("strong_bear") ? C.br : st?.includes("bear") ? C.be : C.nu;
const spectreStateLabel = (st: string) => (st||"—").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());

function SpectreGauge({ score }: { score: number }) {
  const w = 260, h = 60, r = 50, cx = w/2, cy = 60;
  const ci = Math.PI * r, pct = (score + 100) / 200;
  const col = spectreScoreColor(score);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h+10}`} style={{ display: "block" }}>
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={C.bd} strokeWidth={8} strokeLinecap="round" />
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={col} strokeWidth={8} strokeLinecap="round"
        strokeDasharray={`${ci * pct} ${ci * (1 - pct)}`} style={{ transition: "stroke-dasharray 0.8s" }} />
      <text x={cx} y={cy-14} textAnchor="middle" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 800, fill: col }}>{score > 0 ? "+" : ""}{score.toFixed(1)}</text>
      <text x={cx} y={cy-1} textAnchor="middle" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 8, fill: C.t3, letterSpacing: "0.08em" }}>SPECTRE SCORE</text>
    </svg>
  );
}

function SBar({ label, score, w = 0.25 }: { label: string; score: number; w?: number }) {
  const cl = score > 15 ? C.bu : score < -15 ? C.be : C.nu;
  const pct = ((score + 100) / 200) * 100, mid = 50;
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.t2 }}>{label}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.t3 }}>×{(w*100).toFixed(0)}%</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: cl }}>{score > 0 ? "+" : ""}{score.toFixed(1)}</span>
        </div>
      </div>
      <div style={{ height: 5, background: C.bd, borderRadius: 3, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#243045" }} />
        <div style={{ position: "absolute", left: score >= 0 ? `${mid}%` : `${pct}%`, width: `${Math.abs(pct - mid)}%`, top: 0, bottom: 0, borderRadius: 3, background: `linear-gradient(90deg, ${cl}66, ${cl})`, transition: "all 0.5s" }} />
      </div>
    </div>
  );
}

function SpectreTab({ data, phundScore, phundState }: { data: SpectreOutput; phundScore: number|null; phundState: string|null }) {
  const sc = spectreStateColor(data.state);
  const agreement = phundScore !== null && ((phundScore > 0 && data.spectre_score > 0) || (phundScore < 0 && data.spectre_score < 0));
  const divergence = phundScore !== null && ((phundScore > 15 && data.spectre_score < -15) || (phundScore < -15 && data.spectre_score > 15));
  return (
    <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 10 }}>

      {/* SPECTRE OVERVIEW */}
      <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "14px 16px" }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>SPECTRE Overview</div>
        <SpectreGauge score={data.spectre_score} />
        <div style={{ textAlign: "center", marginTop: 4 }}>
          <Bdg t={spectreStateLabel(data.state)} c={sc} sz="lg" />
          <span style={{ marginLeft: 8 }}><Bdg t={data.confidence + " Conf"} c={data.confidence === "High" ? C.bu : data.confidence === "Moderate" ? C.wa : C.t3} sz="md" /></span>
        </div>
        {phundScore !== null && (
          <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 6, background: divergence ? `${C.wa}14` : agreement ? `${C.bu}0d` : `${C.t3}0d`, border: `1px solid ${divergence ? C.wa : agreement ? C.bu : C.bd}33` }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.t3, letterSpacing: "0.08em", marginBottom: 4 }}>ENGINE COMPARISON</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 800, color: scC(phundScore) }}>{phundScore > 0 ? "+" : ""}{phundScore.toFixed(1)}</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.t3 }}>PHUND</div>
              </div>
              <div style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 18, color: divergence ? C.wa : agreement ? C.bu : C.t3, alignSelf: "center" }}>{divergence ? "!" : agreement ? "✓" : "~"}</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 800, color: spectreScoreColor(data.spectre_score) }}>{data.spectre_score > 0 ? "+" : ""}{data.spectre_score.toFixed(1)}</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.t3 }}>SPECTRE</div>
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 6, fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: divergence ? C.wa : agreement ? C.bu : C.t2, fontWeight: 600 }}>
              {divergence ? "Engines Diverge — Caution" : agreement ? "Engines Agree — Higher Conviction" : "Mixed — Wait for Clarity"}
            </div>
          </div>
        )}
        {phundState !== null && <div style={{ marginTop: 6, textAlign: "center" }}><Bdg t={`PHUND: ${(phundState||"—").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}`} c={C.t3} sz="sm" /></div>}
      </div>

      {/* FACTOR MATRIX */}
      <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "14px 16px" }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>Factor Matrix</div>
        <SBar label="Ichimoku Cloud" score={data.ichimoku.score} w={data.weights.ichimoku} />
        <SBar label="Squeeze Momentum" score={data.squeeze.score} w={data.weights.squeeze} />
        <SBar label="Smart Money Structure" score={data.smart_money.score} w={data.weights.smart_money} />
        <SBar label="Fibonacci Confluence" score={data.fibonacci.score} w={data.weights.fibonacci} />
        <SBar label="Multi-Oscillator" score={data.oscillators.score} w={data.weights.oscillators} />
        <div style={{ marginTop: 6, fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.t3 }}>Weights: Ichi×25 Sqz×20 SMC×20 Fib×20 Osc×15</div>
        <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
          <Bdg t={data.data_quality.toUpperCase()} c={data.data_quality === "full" ? C.bu : C.wa} sz="sm" />
          <Bdg t={`Last: ${new Date(data.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`} c={C.t3} sz="sm" />
        </div>
      </div>

      {/* ICHIMOKU */}
      <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "14px 16px" }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>Ichimoku Cloud ({data.ichimoku.meta.tf || "—"})</div>
        <div style={{ marginBottom: 8 }}>
          <Bdg t={data.ichimoku.meta.bias || "—"} c={data.ichimoku.meta.bias === "Above Cloud" ? C.bu : data.ichimoku.meta.bias === "Below Cloud" ? C.be : C.wa} sz="md" />
          <span style={{ marginLeft: 6 }}><Bdg t={`TK: ${data.ichimoku.meta.tkCross || "—"}`} c={data.ichimoku.meta.tkCross === "Bullish" ? C.bu : C.be} sz="md" /></span>
        </div>
        <DR l="Tenkan-sen (9)" v={(data.ichimoku.meta.tenkan || 0).toFixed(2)} c={data.price > data.ichimoku.meta.tenkan ? C.bu : C.be} />
        <DR l="Kijun-sen (26)" v={(data.ichimoku.meta.kijun || 0).toFixed(2)} c={data.price > data.ichimoku.meta.kijun ? C.bu : C.be} />
        <DR l="Cloud Top" v={(data.ichimoku.meta.cloudTop || 0).toFixed(2)} c={C.be} />
        <DR l="Cloud Bot" v={(data.ichimoku.meta.cloudBot || 0).toFixed(2)} c={C.bu} />
        <DR l="Score" v={`${data.ichimoku.score > 0 ? "+" : ""}${data.ichimoku.score.toFixed(1)}`} c={spectreScoreColor(data.ichimoku.score)} />
      </div>

      {/* SQUEEZE */}
      <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "14px 16px" }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>Squeeze Momentum</div>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <Bdg t={`◉ ${data.squeeze.meta.status || "FREE"}`} c={data.squeeze.meta.status === "ARMED" ? C.pu : data.squeeze.meta.status === "FIRED" ? C.wa : C.nu} sz="lg" />
        </div>
        <DR l="BB Width" v={(data.squeeze.meta.bbWidth || 0).toFixed(2)} />
        <DR l="KC Width" v={(data.squeeze.meta.kcWidth || 0).toFixed(2)} />
        <DR l="BB inside KC?" v={data.squeeze.meta.squeezed ? "YES — Energy Building" : "No"} c={data.squeeze.meta.squeezed ? C.pu : C.t2} m={false} />
        <DR l="Just Released?" v={data.squeeze.meta.released ? "YES — Watch Explosion" : "No"} c={data.squeeze.meta.released ? C.wa : C.t2} m={false} />
        <DR l="Mom Value" v={(data.squeeze.meta.momVal || 0).toFixed(2)} c={(data.squeeze.meta.momVal || 0) > 0 ? C.bu : C.be} />
        <DR l="Score" v={`${data.squeeze.score > 0 ? "+" : ""}${data.squeeze.score.toFixed(1)}`} c={spectreScoreColor(data.squeeze.score)} />
      </div>

      {/* SMART MONEY */}
      <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "14px 16px" }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>Smart Money Structure</div>
        <div style={{ marginBottom: 8 }}><Bdg t={data.smart_money.meta.structure || "—"} c={String(data.smart_money.meta.structure)?.includes("Bullish") ? C.bu : String(data.smart_money.meta.structure)?.includes("Bearish") ? C.be : C.nu} sz="md" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
          {(["HH", "HL", "LH", "LL"] as const).map((k) => {
            const v = data.smart_money.meta[k.toLowerCase()];
            const c = (k === "HH" || k === "HL") ? C.bu : C.be;
            return (
              <div key={k} style={{ background: C.bd + "44", borderRadius: 4, padding: "4px 8px", textAlign: "center" }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: c }}>{v as number}</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.t3 }}>{k}</div>
              </div>
            );
          })}
        </div>
        <DR l="Active FVGs" v={String(data.smart_money.meta.activeFVGs || 0)} c={(data.smart_money.meta.activeFVGs as number||0) > 0 ? C.ac : C.t3} />
        {((data.smart_money.meta.bullFVGs as number[])||[]).slice(0,2).map((p: number, i: number) => <DR key={i} l={`Bull FVG ${i+1}`} v={p.toFixed(2)} c={C.bu} />)}
        {((data.smart_money.meta.bearFVGs as number[])||[]).slice(0,2).map((p: number, i: number) => <DR key={i} l={`Bear FVG ${i+1}`} v={p.toFixed(2)} c={C.be} />)}
        {((data.smart_money.meta.orderBlocks as any[])||[]).slice(0,3).map((ob: any, i: number) => <DR key={i} l={`OB ${ob.type?.toUpperCase()}`} v={ob.level?.toFixed(2)} c={ob.type === "bull" ? C.bu : C.be} />)}
        <DR l="Score" v={`${data.smart_money.score > 0 ? "+" : ""}${data.smart_money.score.toFixed(1)}`} c={spectreScoreColor(data.smart_money.score)} />
      </div>

      {/* FIBONACCI */}
      <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "14px 16px" }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>Fibonacci Confluence ({data.fibonacci.meta.tf || "—"})</div>
        <DR l="Swing High" v={(data.fibonacci.meta.swingHigh as number || 0).toFixed(2)} c={C.be} />
        <DR l="Swing Low" v={(data.fibonacci.meta.swingLow as number || 0).toFixed(2)} c={C.bu} />
        <DR l="Position" v={data.fibonacci.meta.fibPos as string || "—"} />
        <DR l="Nearest Level" v={data.fibonacci.meta.nearest as string || "—"} c={data.fibonacci.meta.atKeyLevel ? C.wa : C.t2} m={false} />
        <DR l="Nearest Px" v={(data.fibonacci.meta.nearestPx as number || 0).toFixed(2)} c={data.fibonacci.meta.atKeyLevel ? C.wa : C.t2} />
        <DR l="Dist from Fib" v={(data.fibonacci.meta.distFromFib as number || 0).toFixed(2)} c={(data.fibonacci.meta.distFromFib as number || 999) < 3 ? C.wa : C.t2} />
        {data.fibonacci.meta.atKeyLevel && <div style={{ marginTop: 5 }}><Bdg t="AT KEY LEVEL" c={C.wa} sz="md" /></div>}
        <div style={{ marginTop: 8 }}>
          {((data.fibonacci.meta.levels as any[]) || []).map((lv: any, i: number) => {
            const dist = Math.abs(lv.px - data.price);
            const near = dist < 4;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", background: near ? `${C.wa}14` : "transparent", borderRadius: 3, marginBottom: 1 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: near ? C.wa : C.t3 }}>{lv.label}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 600, color: near ? C.wa : C.t2 }}>{lv.px.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
        <DR l="Score" v={`${data.fibonacci.score > 0 ? "+" : ""}${data.fibonacci.score.toFixed(1)}`} c={spectreScoreColor(data.fibonacci.score)} />
      </div>

      {/* OSCILLATORS */}
      <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "14px 16px" }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>Multi-Oscillator Panel</div>
        <div style={{ marginBottom: 8 }}><Bdg t={data.oscillators.meta.consensus as string || "MIXED"} c={String(data.oscillators.meta.consensus)?.includes("BULL") ? C.bu : String(data.oscillators.meta.consensus)?.includes("BEAR") ? C.be : C.nu} sz="md" /></div>
        <DR l="Stoch %K" v={(data.oscillators.meta.stochK as number || 50).toFixed(1)} c={(data.oscillators.meta.stochK as number||50) > 80 ? C.be : (data.oscillators.meta.stochK as number||50) < 20 ? C.bu : C.tx} />
        <DR l="Stoch %D" v={(data.oscillators.meta.stochD as number || 50).toFixed(1)} c={C.t2} />
        <DR l="Stoch Zone" v={data.oscillators.meta.stochZone as string || "—"} c={data.oscillators.meta.stochZone === "Overbought" ? C.be : data.oscillators.meta.stochZone === "Oversold" ? C.bu : C.nu} m={false} />
        <div style={{ height: 4, background: C.bd, borderRadius: 2, margin: "2px 0 8px", position: "relative" }}>
          <div style={{ position: "absolute", left: "20%", width: "60%", height: "100%", background: `${C.nu}22` }} />
          <div style={{ position: "absolute", left: `${data.oscillators.meta.stochK as number || 50}%`, top: -2, width: 6, height: 8, borderRadius: 3, background: (data.oscillators.meta.stochK as number||50) > 80 ? C.be : (data.oscillators.meta.stochK as number||50) < 20 ? C.bu : C.ac, transform: "translateX(-50%)" }} />
        </div>
        <DR l="Williams %R" v={(data.oscillators.meta.williamsR as number || -50).toFixed(1)} c={(data.oscillators.meta.williamsR as number||0) > -20 ? C.be : (data.oscillators.meta.williamsR as number||0) < -80 ? C.bu : C.tx} />
        <DR l="W%R Zone" v={data.oscillators.meta.wrZone as string || "—"} c={data.oscillators.meta.wrZone === "Overbought" ? C.be : data.oscillators.meta.wrZone === "Oversold" ? C.bu : C.nu} m={false} />
        <DR l="CCI (20)" v={(data.oscillators.meta.cci as number || 0).toFixed(1)} c={(data.oscillators.meta.cci as number||0) > 100 ? C.be : (data.oscillators.meta.cci as number||0) < -100 ? C.bu : C.tx} />
        <DR l="CCI Zone" v={data.oscillators.meta.cciZone as string || "—"} c={data.oscillators.meta.cciZone === "Overbought" ? C.be : data.oscillators.meta.cciZone === "Oversold" ? C.bu : C.nu} m={false} />
        <DR l="Supertrend" v={data.oscillators.meta.supertrend as string || "—"} c={data.oscillators.meta.supertrend === "Bullish" ? C.bu : C.be} m={false} />
        <DR l="Score" v={`${data.oscillators.score > 0 ? "+" : ""}${data.oscillators.score.toFixed(1)}`} c={spectreScoreColor(data.oscillators.score)} />
      </div>

    </div>
  );
}

// ============================================================
// GOLD LOGIC AI TAB COMPONENT (V2)
// ============================================================

const glBiasColor = (b: string) => b === "STRONG_BUY" ? C.bb : b === "BUY" ? C.bu : b === "STRONG_SELL" ? C.br : b === "SELL" ? C.be : C.nu;
const glQualityColor = (q: string) => q === "A_PLUS" ? C.bb : q === "A" ? C.bu : q === "B" ? C.wa : q === "C" ? C.be : C.t3;
const glRegimeColor = (r: string) => r === "TREND" ? C.ac : r === "BREAKOUT" ? C.pu : r === "COMPRESSION" ? C.wa : r === "REVERSAL_RISK" ? C.be : C.nu;
const glRiskColor = (r: string) => r === "NORMAL" ? C.bu : r === "CAUTION" ? C.wa : r === "HIGH_VOLATILITY" ? C.be : C.br;
const glDirColor = (d: string) => d === "BULLISH" ? C.bu : d === "BEARISH" ? C.be : d === "UNAVAILABLE" ? C.t3 : C.nu;
const glCatColor = (c: string) => c === "trend" ? C.ac : c === "momentum" ? C.pu : c === "volatility" ? C.wa : c === "structure" ? "#fb923c" : C.bu;

function GlScoreBar({ label, score, color }: { label: string; score: number; color?: string }) {
  const cl = color || (score > 25 ? C.bu : score < -25 ? C.be : C.nu);
  const pct = ((score + 100) / 200) * 100;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontFamily: F.s, fontSize: 11, color: C.t2 }}>{label}</span>
        <span style={{ fontFamily: F.m, fontSize: 11, fontWeight: 600, color: cl }}>{score > 0 ? "+" : ""}{score.toFixed(1)}</span>
      </div>
      <div style={{ height: 6, background: C.bd, borderRadius: 3, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#243045", zIndex: 1 }} />
        <div style={{ position: "absolute", left: score >= 0 ? "50%" : `${pct}%`, width: `${Math.abs(pct - 50)}%`, top: 0, bottom: 0, borderRadius: 3, background: `linear-gradient(90deg, ${cl}66, ${cl})`, transition: "all 0.5s" }} />
      </div>
    </div>
  );
}

function GlMasterGauge({ bias, confidence, probUp }: { bias: string; confidence: number; probUp: number }) {
  const w = 280, h = 80, r = 55, cx = w / 2, cy = 70;
  const ci = Math.PI * r, pct = probUp;
  const col = glBiasColor(bias);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h + 15}`} style={{ display: "block" }}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={C.bd} strokeWidth={10} strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={col} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${ci * pct} ${ci * (1 - pct)}`} style={{ transition: "stroke-dasharray 0.8s" }} />
        <text x={cx} y={cy - 22} textAnchor="middle" style={{ fontFamily: F.m, fontSize: 24, fontWeight: 800, fill: col }}>{bias.replace("_", " ")}</text>
        <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontFamily: F.m, fontSize: 12, fill: C.t2 }}>{(probUp * 100).toFixed(0)}% Bull | {confidence.toFixed(0)}% Conf</text>
      </svg>
    </div>
  );
}

function GoldLogicTab({ data }: { data: GoldLogicSnapshot }) {
  const [indicatorFilter, setIndicatorFilter] = useState<string>("all");
  const filteredIndicators = indicatorFilter === "all" ? data.indicators : data.indicators.filter(i => i.category === indicatorFilter);
  const bullCount = data.indicators.filter(i => i.direction === "BULLISH").length;
  const bearCount = data.indicators.filter(i => i.direction === "BEARISH").length;
  const neutralCount = data.indicators.filter(i => i.direction === "NEUTRAL").length;

  return (
    <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>

      {/* MASTER BIAS CARD */}
      <Card title="Master Analysis">
        <GlMasterGauge bias={data.masterBias} confidence={data.confidence} probUp={data.probabilityUp} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
          <div style={{ textAlign: "center", padding: "8px 6px", background: `${glRegimeColor(data.regime)}0d`, borderRadius: 6, border: `1px solid ${glRegimeColor(data.regime)}22` }}>
            <div style={{ fontFamily: F.m, fontSize: 12, fontWeight: 700, color: glRegimeColor(data.regime) }}>{data.regime}</div>
            <div style={{ fontFamily: F.s, fontSize: 9, color: C.t3 }}>Regime</div>
          </div>
          <div style={{ textAlign: "center", padding: "8px 6px", background: `${glQualityColor(data.tradeQuality)}0d`, borderRadius: 6, border: `1px solid ${glQualityColor(data.tradeQuality)}22` }}>
            <div style={{ fontFamily: F.m, fontSize: 12, fontWeight: 700, color: glQualityColor(data.tradeQuality) }}>{data.tradeQuality.replace("_", "+")}</div>
            <div style={{ fontFamily: F.s, fontSize: 9, color: C.t3 }}>Quality</div>
          </div>
          <div style={{ textAlign: "center", padding: "8px 6px", background: `${glRiskColor(data.riskState)}0d`, borderRadius: 6, border: `1px solid ${glRiskColor(data.riskState)}22` }}>
            <div style={{ fontFamily: F.m, fontSize: 12, fontWeight: 700, color: glRiskColor(data.riskState) }}>{data.riskState.replace("_", " ")}</div>
            <div style={{ fontFamily: F.s, fontSize: 9, color: C.t3 }}>Risk</div>
          </div>
        </div>
        <div style={{ marginTop: 10, padding: "6px 8px", background: `${C.bd}44`, borderRadius: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: F.m, fontSize: 10, color: C.t3 }}>Bullish</span>
            <span style={{ fontFamily: F.m, fontSize: 10, color: C.bu, fontWeight: 600 }}>{bullCount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: F.m, fontSize: 10, color: C.t3 }}>Bearish</span>
            <span style={{ fontFamily: F.m, fontSize: 10, color: C.be, fontWeight: 600 }}>{bearCount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: F.m, fontSize: 10, color: C.t3 }}>Neutral</span>
            <span style={{ fontFamily: F.m, fontSize: 10, color: C.nu, fontWeight: 600 }}>{neutralCount}</span>
          </div>
        </div>
      </Card>

      {/* CATEGORY ENGINES */}
      <Card title="Category Engines">
        <GlScoreBar label="Trend" score={data.categoryScores.trend} color={C.ac} />
        <GlScoreBar label="Momentum" score={data.categoryScores.momentum} color={C.pu} />
        <GlScoreBar label="Volatility" score={data.categoryScores.volatility} color={C.wa} />
        <GlScoreBar label="Structure" score={data.categoryScores.structure} color="#fb923c" />
        <GlScoreBar label="Macro" score={data.categoryScores.macro} color={C.bu} />
        <div style={{ marginTop: 8, fontFamily: F.m, fontSize: 9, color: C.t3 }}>
          Weights: Trend×28% Mom×22% Vol×12% Struct×20% Macro×18%
        </div>
      </Card>

      {/* TIMEFRAME ALIGNMENT */}
      <Card title="Timeframe Alignment">
        {(["m5", "m10", "m15", "h1", "h4"] as const).map(tf => {
          const score = data.timeframeScores[tf];
          // Handle null scores for M5/M15 (no real data from MT5 yet)
          if (score === null) {
            return (
              <div key={tf} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.bd}33`, opacity: 0.5 }}>
                <span style={{ fontFamily: F.m, fontSize: 12, color: C.t3, width: 36, fontWeight: 700 }}>{tf.toUpperCase()}</span>
                <span style={{ fontFamily: F.m, fontSize: 12, color: C.t3, fontStyle: "italic" }}>No data</span>
              </div>
            );
          }
          const cl = score > 15 ? C.bu : score < -15 ? C.be : C.nu;
          const arrow = score > 15 ? "↑" : score < -15 ? "↓" : "→";
          return (
            <div key={tf} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.bd}33` }}>
              <span style={{ fontFamily: F.m, fontSize: 12, color: C.t2, width: 36, fontWeight: 700 }}>{tf.toUpperCase()}</span>
              <span style={{ fontFamily: F.m, fontSize: 20, color: cl, lineHeight: 1 }}>{arrow}</span>
              <div style={{ flex: 1, height: 6, background: C.bd, borderRadius: 3, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#2a3a55" }} />
                {score > 0 && <div style={{ position: "absolute", left: "50%", width: `${Math.abs(score) / 2}%`, height: "100%", background: `linear-gradient(90deg, ${cl}66, ${cl})`, borderRadius: 2 }} />}
                {score < 0 && <div style={{ position: "absolute", right: "50%", width: `${Math.abs(score) / 2}%`, height: "100%", background: `linear-gradient(270deg, ${cl}66, ${cl})`, borderRadius: 2 }} />}
              </div>
              <span style={{ fontFamily: F.m, fontSize: 11, fontWeight: 600, color: cl, width: 40, textAlign: "right" }}>{score > 0 ? "+" : ""}{score.toFixed(0)}</span>
            </div>
          );
        })}
        <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
          <Bdg t={data.dataQuality.toUpperCase()} c={data.dataQuality === "full" ? C.bu : data.dataQuality === "degraded" ? C.wa : C.be} sz="sm" />
          <Bdg t={`v${data.engineVersion}`} c={C.t3} sz="sm" />
        </div>
      </Card>

      {/* SCENARIOS */}
      <Card title="Trade Scenarios">
        {/* Bull Scenario */}
        <div style={{ padding: "10px 12px", background: `${C.bu}0a`, borderRadius: 6, border: `1px solid ${C.bu}22`, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontFamily: F.m, fontSize: 14, color: C.bu }}>▲</span>
            <span style={{ fontFamily: F.s, fontSize: 11, fontWeight: 700, color: C.bu, letterSpacing: "0.05em" }}>BULL PATH</span>
          </div>
          <div style={{ fontFamily: F.s, fontSize: 10, color: C.t2, marginBottom: 4 }}><strong style={{ color: C.bu }}>Trigger:</strong> {data.scenarios.bull.trigger}</div>
          <div style={{ fontFamily: F.s, fontSize: 10, color: C.t2, marginBottom: 4 }}><strong style={{ color: C.be }}>Invalidation:</strong> {data.scenarios.bull.invalidation}</div>
          <div style={{ fontFamily: F.s, fontSize: 10, color: C.t2 }}><strong style={{ color: C.t3 }}>Targets:</strong> {data.scenarios.bull.targets.join(" → ")}</div>
        </div>
        {/* Bear Scenario */}
        <div style={{ padding: "10px 12px", background: `${C.be}0a`, borderRadius: 6, border: `1px solid ${C.be}22`, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontFamily: F.m, fontSize: 14, color: C.be }}>▼</span>
            <span style={{ fontFamily: F.s, fontSize: 11, fontWeight: 700, color: C.be, letterSpacing: "0.05em" }}>BEAR PATH</span>
          </div>
          <div style={{ fontFamily: F.s, fontSize: 10, color: C.t2, marginBottom: 4 }}><strong style={{ color: C.be }}>Trigger:</strong> {data.scenarios.bear.trigger}</div>
          <div style={{ fontFamily: F.s, fontSize: 10, color: C.t2, marginBottom: 4 }}><strong style={{ color: C.bu }}>Invalidation:</strong> {data.scenarios.bear.invalidation}</div>
          <div style={{ fontFamily: F.s, fontSize: 10, color: C.t2 }}><strong style={{ color: C.t3 }}>Targets:</strong> {data.scenarios.bear.targets.join(" → ")}</div>
        </div>
        {/* No Trade */}
        <div style={{ padding: "10px 12px", background: `${C.wa}0a`, borderRadius: 6, border: `1px solid ${C.wa}22` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontFamily: F.m, fontSize: 14, color: C.wa }}>⊘</span>
            <span style={{ fontFamily: F.s, fontSize: 11, fontWeight: 700, color: C.wa, letterSpacing: "0.05em" }}>NO TRADE</span>
          </div>
          <div style={{ fontFamily: F.s, fontSize: 10, color: C.t2, marginBottom: 4 }}><strong style={{ color: C.wa }}>Reason:</strong> {data.scenarios.noTrade.reason}</div>
          <div style={{ fontFamily: F.s, fontSize: 10, color: C.t2 }}><strong style={{ color: C.t3 }}>To Improve:</strong> {data.scenarios.noTrade.conditionToImprove}</div>
        </div>
      </Card>

      {/* ALERTS */}
      <Card title="Active Alerts">
        {data.alerts.length === 0 ? (
          <div style={{ fontFamily: F.m, fontSize: 11, color: C.t3, textAlign: "center", padding: 16 }}>No active alerts</div>
        ) : (
          <div>
            {data.alerts.map((alert, i) => (
              <div key={i} style={{ padding: "6px 8px", background: alert.includes("A+") ? `${C.bu}0d` : alert.includes("⚠") ? `${C.wa}0d` : `${C.t3}0d`, borderRadius: 4, marginBottom: 6, borderLeft: `3px solid ${alert.includes("A+") ? C.bu : alert.includes("⚠") ? C.wa : C.t3}` }}>
                <span style={{ fontFamily: F.s, fontSize: 11, color: C.tx }}>{alert}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* INDICATOR MATRIX */}
      <Card title="Indicator Agreement Matrix" span={2}>
        <div style={{ marginBottom: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["all", "trend", "momentum", "volatility", "structure", "macro"].map(cat => (
            <button key={cat} onClick={() => setIndicatorFilter(cat)} style={{
              fontFamily: F.m, fontSize: 10, padding: "4px 10px", borderRadius: 4,
              border: `1px solid ${indicatorFilter === cat ? (cat === "all" ? C.ac : glCatColor(cat)) : C.bd}`,
              background: indicatorFilter === cat ? `${cat === "all" ? C.ac : glCatColor(cat)}1a` : "transparent",
              color: indicatorFilter === cat ? (cat === "all" ? C.ac : glCatColor(cat)) : C.t2,
              cursor: "pointer", textTransform: "uppercase"
            }}>{cat}</button>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F.m, fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.bd}` }}>
                {["Indicator", "Cat", "Raw", "Norm", "Dir", "Wt", "Rel", "Fit", "Status"].map(h => (
                  <th key={h} style={{ padding: "5px 6px", textAlign: "left", color: C.t3, fontWeight: 500, fontSize: 9, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredIndicators.map((ind, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.bd}15` }}>
                  <td style={{ padding: "4px 6px", color: C.tx, fontWeight: 500 }}>{ind.name}</td>
                  <td style={{ padding: "4px 6px" }}><span style={{ color: glCatColor(ind.category), fontSize: 9 }}>{ind.category.slice(0, 3).toUpperCase()}</span></td>
                  <td style={{ padding: "4px 6px", color: C.t2 }}>{ind.rawValue !== null ? (typeof ind.rawValue === "number" ? ind.rawValue.toFixed(2) : ind.rawValue) : "—"}</td>
                  <td style={{ padding: "4px 6px", color: ind.normalized !== null ? (ind.normalized > 0.2 ? C.bu : ind.normalized < -0.2 ? C.be : C.nu) : C.t3 }}>{ind.normalized !== null ? ind.normalized.toFixed(2) : "—"}</td>
                  <td style={{ padding: "4px 6px" }}><Bdg t={ind.direction.slice(0, 4)} c={glDirColor(ind.direction)} /></td>
                  <td style={{ padding: "4px 6px", color: C.t2 }}>{(ind.weight * 100).toFixed(0)}%</td>
                  <td style={{ padding: "4px 6px", color: ind.reliability > 0.85 ? C.bu : ind.reliability > 0.75 ? C.wa : C.t3 }}>{(ind.reliability * 100).toFixed(0)}%</td>
                  <td style={{ padding: "4px 6px", color: C.t3, fontSize: 9 }}>{ind.regimeFit}</td>
                  <td style={{ padding: "4px 6px" }}>
                    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: ind.status === "active" ? C.bu : ind.status === "unavailable" ? C.be : C.wa }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, fontFamily: F.m, fontSize: 9, color: C.t3 }}>
          Showing {filteredIndicators.length} of {data.indicators.length} indicators | Last updated: {new Date(data.timestamp).toLocaleTimeString()}
        </div>
      </Card>

    </div>
  );
}

// ============================================================
// MAIN DASHBOARD
// ============================================================
export default function PhundDashboard() {
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cd, setCd] = useState(10);
  const [tgR, setTgR] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"phund"|"gold_logic"|"spectre"|"gold_v2">("phund");
  const [spectreData, setSpectreData] = useState<SpectreOutput|null>(null);
  const [goldLogicData, setGoldLogicData] = useState<GoldLogicSnapshot|null>(null);

  // Track if spectre data has been fetched initially to prevent infinite loops
  const spectreInitialFetchRef = useRef(false);

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard/state", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setData(json);
      if (json.gold_logic) setGoldLogicData(json.gold_logic);
      if (json.spectre) setSpectreData(json.spectre);
      setErr(null);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); setCd(10); }
  }, []);

  const fetchSpectre = useCallback(async () => {
    try {
      const r = await fetch("/api/spectre", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSpectreData(await r.json());
    } catch {
      // silent — spectre data is optional
    }
  }, []);

  useEffect(() => {
    fetchState();
    const i = setInterval(fetchState, 10000);
    const t = setInterval(() => setCd(c => Math.max(0, c - 1)), 1000);
    return () => { clearInterval(i); clearInterval(t); };
  }, [fetchState]);

  // Spectre data fetch - separate initial fetch from interval refresh
  useEffect(() => {
    if (activeTab !== "spectre") {
      spectreInitialFetchRef.current = false; // Reset when leaving tab
      return;
    }

    // Initial fetch only once per tab visit
    if (!spectreInitialFetchRef.current) {
      spectreInitialFetchRef.current = true;
      fetchSpectre();
    }

    // Set up refresh interval
    const i = setInterval(fetchSpectre, 15000);
    return () => clearInterval(i);
  }, [activeTab, fetchSpectre]);

  const sendTrade = async (action: string, direction?: string, volume?: number, slP?: number, tpP?: number, ticket?: number, orderId?: string) => {
    const r = await fetch("/api/trade/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, direction, volume, sl: slP, tp: tpP, symbol: "XAUUSD", ticket, order_id: orderId }),
    });
    return r.json();
  };

  const closePosition = async (ticket?: number, orderId?: string) => {
    return sendTrade("close", undefined, undefined, undefined, undefined, ticket, orderId);
  };

  const modifyPosition = async (sl?: number, tp?: number, ticket?: number, orderId?: string) => {
    return sendTrade("modify", undefined, undefined, sl, tp, ticket, orderId);
  };

  const breakevenPosition = async (ticket?: number, orderId?: string) => {
    const r = await fetch("/api/trade/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "breakeven", symbol: "XAUUSD", ticket, order_id: orderId }),
    });
    return r.json();
  };

  const testTG = async () => { setTgR("Sending..."); try { const r = await fetch("/api/telegram/test", { method: "POST" }); const j = await r.json(); setTgR(j.ok ? "✅ Sent!" : `❌ ${j.error}`); } catch (e: any) { setTgR(`❌ ${e.message}`); } };

  if (loading && !data) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 24, height: 24, border: `2px solid ${C.ac}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontFamily: F.m, fontSize: 13, color: C.ac }}>Connecting to Phund...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const s = data?.latest_signal;
  const h = data?.health as Health | undefined;
  const alerts = data?.recent_alerts || [];
  const scans = data?.scan_history || [];
  const acct = data?.account || null;
  const positions = acct?.positions || [];
  const sc = s ? stC(s.state) : C.nu;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: F.s, color: C.tx }}>
      {/* HEADER */}
      <header style={{ background: `linear-gradient(180deg, ${C.cd} 0%, ${C.bg} 100%)`, borderBottom: `1px solid ${C.bd}`, padding: "10px 16px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", boxShadow: "0 0 8px #fbbf2466" }} />
            <span style={{ fontFamily: F.m, fontWeight: 800, fontSize: 15, color: "#fbbf24", letterSpacing: "0.06em" }}>GOLD DASHBOARD</span>
            <span style={{ fontFamily: F.m, fontSize: 10, color: C.ac, background: `${C.ac}1a`, padding: "2px 6px", borderRadius: 3, fontWeight: 700 }}>V2</span>
            <span style={{ fontFamily: F.m, fontSize: 12, color: C.t2 }}>XAUUSD</span>
          </div>
          {s && <Bdg t={sl(s.state)} c={sc} sz="lg" />}
          {s?.activeRegime && <Bdg t={s.activeRegime} c={regimeColor(s.activeRegime)} sz="md" />}
          {s?.no_trade && <Bdg t="⊘ NO TRADE" c={C.wa} sz="md" />}
          {s?.breakout_watch && <Bdg t={`⚡ BREAKOUT ${s.breakout_watch.toUpperCase()}`} c={C.pu} sz="md" />}
          {s?.reversal_watch && <Bdg t={`↩ REVERSAL ${s.reversal_watch.toUpperCase()}`} c="#fb923c" sz="md" />}
          {positions.length > 0 && <Bdg t={`${positions.length} OPEN`} c={C.wa} sz="md" />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {s && <div style={{ fontFamily: F.m, fontSize: 18, fontWeight: 800 }}>{s.price.toFixed(2)}</div>}
          {acct && <div style={{ fontFamily: F.m, fontSize: 12, color: acct.profit >= 0 ? C.bu : C.be, fontWeight: 700 }}>{fp(acct.profit)}</div>}
          <div style={{ borderLeft: `1px solid ${C.bd}`, paddingLeft: 8 }}>
            <div style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>REFRESH</div>
            <div style={{ fontFamily: F.m, fontSize: 12, color: cd < 3 ? C.wa : C.t2 }}>{cd}s</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Dot ok={h?.mt5_connected || false} />
            <span style={{ fontFamily: F.m, fontSize: 10, color: h?.mt5_connected ? C.bu : C.be }}>{h?.mt5_connected ? "MT5 LIVE" : "MT5 OFF"}</span>
          </div>
          <Bdg t={data?.trade_mode?.toUpperCase() || "—"} c={data?.trade_mode === "live" ? C.be : C.ac} sz="md" />
          <button onClick={fetchState} style={{ background: C.ac, border: "none", borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontFamily: F.m, fontSize: 10, color: "#fff", fontWeight: 700 }}>↻</button>
        </div>
      </header>

      {/* TAB NAV */}
      <div style={{ background: C.cd, borderBottom: `1px solid ${C.bd}`, padding: "0 16px", display: "flex", gap: 0 }}>
        {(["phund","gold_v2","gold_logic","spectre"] as const).map(tab => {
          const tabColor = tab === "spectre" ? C.pu : tab === "gold_logic" ? "#fbbf24" : tab === "gold_v2" ? C.bu : C.ac;
          const tabLabel = tab === "phund" ? "OVERVIEW" : tab === "gold_v2" ? "V2 ENGINE" : tab === "gold_logic" ? "GOLD LOGIC" : "SPECTRE";
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ background: "none", border: "none", borderBottom: activeTab === tab ? `2px solid ${tabColor}` : "2px solid transparent", padding: "8px 18px", cursor: "pointer", fontFamily: F.m, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: activeTab === tab ? tabColor : C.t3, textTransform: "uppercase", transition: "all 0.2s" }}>
              {tabLabel}
            </button>
          );
        })}
        {goldLogicData && activeTab === "gold_logic" && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>MASTER BIAS</span>
            <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 800, color: goldLogicData.masterBias.includes("BUY") ? C.bu : goldLogicData.masterBias.includes("SELL") ? C.be : C.nu }}>{goldLogicData.masterBias.replace("_", " ")}</span>
            <span style={{ fontFamily: F.m, fontSize: 11, color: C.t2 }}>| {goldLogicData.confidence.toFixed(0)}%</span>
          </div>
        )}
        {spectreData && activeTab === "spectre" && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>SPECTRE SCORE</span>
            <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 800, color: spectreScoreColor(spectreData.spectre_score) }}>{spectreData.spectre_score > 0 ? "+" : ""}{spectreData.spectre_score.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* BANNERS */}
      {s && (s.no_trade || s.risk_level !== "low") && (
        <div style={{ background: s.no_trade ? `${C.wa}14` : `${C.be}14`, borderBottom: `1px solid ${s.no_trade ? C.wa : C.be}33`, padding: "7px 16px", textAlign: "center", fontFamily: F.m, fontSize: 11, color: s.no_trade ? C.wa : C.be }}>
          ⚠ {s.no_trade ? `NO TRADE — ${s.no_trade_reason}` : `${s.risk_level.toUpperCase().replace(/_/g, " ")} — Caution`}
        </div>
      )}
      {/* CONSENSUS BANNER */}
      {data?.consensus && <ConsensusBanner consensus={data.consensus} />}
      {/* V2 STATUS BANNER */}
      {data?.gold_v2 && <GoldV2Banner v2={data.gold_v2} />}

      {!h?.mt5_connected && (
        <div style={{ background: `${C.ac}10`, borderBottom: `1px solid ${C.ac}33`, padding: "8px 16px", fontFamily: F.s, fontSize: 12, color: C.ac }}>
          <strong>MT5 not connected.</strong> Attach PhundBridge EA to XAUUSD M10 chart in OX Securities MT5.
        </div>
      )}
      {err && <div style={{ background: `${C.be}14`, padding: "7px 16px", fontFamily: F.m, fontSize: 11, color: C.be, borderBottom: `1px solid ${C.be}33` }}>API: {err}</div>}

      {/* MAIN DASHBOARD — PLAIN ENGLISH LAYOUT */}
      {activeTab === "phund" && (() => {
        const v2 = data?.gold_v2;
        const regime = v2?.regime?.regime || "unknown";
        const structure = v2?.structure;
        const perm = v2?.tradePermission;
        const spreadGate = v2?.spreadGate;
        const indMatrix = v2?.indicatorMatrix;

        // Plain-English regime translation
        const getRegimeSentence = () => {
          if (!v2) return "Awaiting market data...";
          const bosUp = structure?.bosUp;
          const bosDown = structure?.bosDown;
          switch (regime) {
            case "bullish_trend": return "Gold is trending UP. The bot is looking to BUY.";
            case "bearish_trend": return "Gold is trending DOWN. The bot is looking to SELL.";
            case "bullish_reversal": return "Gold just reversed direction UPWARD. A new uptrend may be starting.";
            case "bearish_reversal": return "Gold just reversed direction DOWNWARD. A new downtrend may be starting.";
            case "breakout_expansion": return bosUp ? "Gold is BREAKING OUT to the upside. Strong momentum detected." : bosDown ? "Gold is BREAKING OUT to the downside. Strong momentum detected." : "Gold is in a breakout expansion phase.";
            case "range": return "Gold is moving SIDEWAYS with no clear direction.";
            case "unsafe": return "Market data is unreliable right now. The bot is standing aside.";
            default: return "Analyzing market conditions...";
          }
        };

        // Determine direction color for headline
        const getDirectionColor = () => {
          if (regime.includes("bullish") || regime === "breakout_expansion" && structure?.bosUp) return C.bu;
          if (regime.includes("bearish") || regime === "breakout_expansion" && structure?.bosDown) return C.be;
          if (regime === "unsafe") return C.be;
          return C.wa;
        };

        // Plain-English translation for block reasons
        const translateBlockReason = (reason: string) => {
          const map: Record<string, string> = {
            "wrong_side_freeze": "Wrong Direction — Trade Blocked",
            "daily_loss_lock": "Daily Loss Limit Reached",
            "max_exposure": "Maximum Positions Open",
            "cooldown": "Waiting After Spread Spike",
            "spread_unsafe": "Spread Too Wide",
            "feed_unhealthy": "MT5 Data Issue",
            "regime_blocks_buy": "Market conditions don't favor buying",
            "regime_blocks_sell": "Market conditions don't favor selling",
            "no_trade_regime": "Market is unclear — standing aside",
          };
          return map[reason] || reason.replace(/_/g, " ");
        };

        // Translate trend values
        const translateTrend = (t: string) => t === "bullish" ? "Rising" : t === "bearish" ? "Falling" : "Flat";

        // Get signal direction for trade recommendation
        const getSignalDirection = () => {
          if (s?.state.includes("bull") || s?.state.includes("long") || s?.state === "breakout_watch_up") return "buy";
          if (s?.state.includes("bear") || s?.state.includes("short") || s?.state === "breakout_watch_down") return "sell";
          return null;
        };

        // Overall bias verdict
        const getBiasVerdict = (score: number) => {
          if (score >= 50) return { text: "Strong Buy Signal", color: C.bb };
          if (score >= 25) return { text: "Moderate Buy Signal", color: C.bu };
          if (score >= 1) return { text: "Weak Buy Signal", color: C.bu };
          if (score === 0) return { text: "Neutral", color: C.nu };
          if (score >= -24) return { text: "Weak Sell Signal", color: C.be };
          if (score >= -49) return { text: "Moderate Sell Signal", color: C.be };
          return { text: "Strong Sell Signal", color: C.br };
        };

        const dirColor = getDirectionColor();
        const sigDir = getSignalDirection();
        const biasVerdict = getBiasVerdict(indMatrix?.overallBias || 0);

        // Calculate last data age
        const getLastDataAge = () => {
          if (!h?.mt5_last_payload) return 999;
          try {
            return Math.floor((Date.now() - new Date(h.mt5_last_payload).getTime()) / 1000);
          } catch { return 999; }
        };
        const lastDataAge = getLastDataAge();

        return (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* ============================================================ */}
            {/* SECTION 1 — THE HEADLINE CARD */}
            {/* ============================================================ */}
            <div style={{ background: `linear-gradient(90deg, ${dirColor}08, ${C.cd})`, borderRadius: 8, border: `1px solid ${C.bd}`, borderLeft: `4px solid ${dirColor}`, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                {/* Left side — Status sentence + Price */}
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div style={{ fontFamily: F.s, fontSize: 18, fontWeight: 600, color: C.tx, marginBottom: 12, lineHeight: 1.4 }}>
                    {getRegimeSentence()}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                    <span style={{ fontFamily: F.m, fontSize: 32, fontWeight: 800, color: C.tx }}>{s?.price?.toFixed(2) || "—"}</span>
                    <span style={{ fontFamily: F.s, fontSize: 13, color: C.t2 }}>XAUUSD</span>
                  </div>
                  <div style={{ fontFamily: F.s, fontSize: 13, color: spreadGate?.spreadSafe ? C.t2 : C.wa }}>
                    Spread: {spreadGate?.spreadPoints?.toFixed(0) || "—"} points — {spreadGate?.spreadSafe ? "Normal" : "Wide (bot waiting)"}
                  </div>
                </div>

                {/* Right side — Permission lights */}
                <div style={{ minWidth: 180 }}>
                  {perm?.blockReasons && perm.blockReasons.length > 0 && !perm.allowNewTrade ? (
                    <div style={{ background: `${C.wa}15`, border: `1px solid ${C.wa}33`, borderRadius: 6, padding: "10px 14px" }}>
                      <div style={{ fontFamily: F.m, fontSize: 13, fontWeight: 700, color: C.wa }}>
                        ⊘ Bot is standing aside
                      </div>
                      <div style={{ fontFamily: F.s, fontSize: 12, color: C.t2, marginTop: 4 }}>
                        {translateBlockReason(perm.blockReasons[0])}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: perm?.allowBuy ? C.bu : C.be, boxShadow: `0 0 8px ${perm?.allowBuy ? C.bu : C.be}44` }} />
                        <span style={{ fontFamily: F.s, fontSize: 13, fontWeight: 600, color: perm?.allowBuy ? C.bu : C.be }}>BUY ALLOWED</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: perm?.allowSell ? C.bu : C.be, boxShadow: `0 0 8px ${perm?.allowSell ? C.bu : C.be}44` }} />
                        <span style={{ fontFamily: F.s, fontSize: 13, fontWeight: 600, color: perm?.allowSell ? C.bu : C.be }}>SELL ALLOWED</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: perm?.allowNewTrade ? C.bu : C.be, boxShadow: `0 0 8px ${perm?.allowNewTrade ? C.bu : C.be}44` }} />
                        <span style={{ fontFamily: F.s, fontSize: 13, fontWeight: 600, color: perm?.allowNewTrade ? C.bu : C.be }}>NEW TRADE OK</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTION 2 — WHAT THE MARKET IS DOING */}
            {/* ============================================================ */}
            <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "16px 18px" }}>
              <div style={{ fontFamily: F.s, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t2, marginBottom: 14 }}>What the Market Is Doing Right Now</div>

              {/* Structure flags as explanation pills */}
              {structure && (structure.bosUp || structure.bosDown || structure.chochUp || structure.chochDown || structure.bullishSweep || structure.bearishSweep) ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                  {structure.bosUp && (
                    <div style={{ background: `${C.bu}12`, border: `1px solid ${C.bu}33`, borderRadius: 6, padding: "10px 14px", maxWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>↑</span>
                        <span style={{ fontFamily: F.s, fontSize: 13, fontWeight: 700, color: C.bu }}>Upward Breakout</span>
                      </div>
                      <div style={{ fontFamily: F.s, fontSize: 12, color: C.t2, lineHeight: 1.4 }}>Price just broke above a previous high. Buyers are in control.</div>
                    </div>
                  )}
                  {structure.bosDown && (
                    <div style={{ background: `${C.be}12`, border: `1px solid ${C.be}33`, borderRadius: 6, padding: "10px 14px", maxWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>↓</span>
                        <span style={{ fontFamily: F.s, fontSize: 13, fontWeight: 700, color: C.be }}>Downward Breakout</span>
                      </div>
                      <div style={{ fontFamily: F.s, fontSize: 12, color: C.t2, lineHeight: 1.4 }}>Price just broke below a previous low. Sellers are in control.</div>
                    </div>
                  )}
                  {structure.chochUp && (
                    <div style={{ background: `${C.bb}12`, border: `1px solid ${C.bb}33`, borderRadius: 6, padding: "10px 14px", maxWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 14 }}>🔄↑</span>
                        <span style={{ fontFamily: F.s, fontSize: 13, fontWeight: 700, color: C.bb }}>Trend Reversal UP</span>
                      </div>
                      <div style={{ fontFamily: F.s, fontSize: 12, color: C.t2, lineHeight: 1.4 }}>The market was falling but just switched to rising. A new uptrend is forming.</div>
                    </div>
                  )}
                  {structure.chochDown && (
                    <div style={{ background: `${C.br}12`, border: `1px solid ${C.br}33`, borderRadius: 6, padding: "10px 14px", maxWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 14 }}>🔄↓</span>
                        <span style={{ fontFamily: F.s, fontSize: 13, fontWeight: 700, color: C.br }}>Trend Reversal DOWN</span>
                      </div>
                      <div style={{ fontFamily: F.s, fontSize: 12, color: C.t2, lineHeight: 1.4 }}>The market was rising but just switched to falling. A new downtrend is forming.</div>
                    </div>
                  )}
                  {structure.bullishSweep && (
                    <div style={{ background: `${C.bu}12`, border: `1px solid ${C.bu}33`, borderRadius: 6, padding: "10px 14px", maxWidth: 280 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 14 }}>🧹↑</span>
                        <span style={{ fontFamily: F.s, fontSize: 13, fontWeight: 700, color: C.bu }}>Bear Trap (Bullish Sweep)</span>
                      </div>
                      <div style={{ fontFamily: F.s, fontSize: 12, color: C.t2, lineHeight: 1.4 }}>Price briefly dipped below support to shake out sellers, then reversed UP. Smart money is buying.</div>
                    </div>
                  )}
                  {structure.bearishSweep && (
                    <div style={{ background: `${C.be}12`, border: `1px solid ${C.be}33`, borderRadius: 6, padding: "10px 14px", maxWidth: 280 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 14 }}>🧹↓</span>
                        <span style={{ fontFamily: F.s, fontSize: 13, fontWeight: 700, color: C.be }}>Bull Trap (Bearish Sweep)</span>
                      </div>
                      <div style={{ fontFamily: F.s, fontSize: 12, color: C.t2, lineHeight: 1.4 }}>Price briefly pushed above resistance to shake out buyers, then reversed DOWN. Smart money is selling.</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontFamily: F.s, fontSize: 13, color: C.t3, marginBottom: 16, padding: "12px", background: `${C.bd}33`, borderRadius: 6 }}>
                  No significant market events detected.
                </div>
              )}

              {/* Timeframe summary */}
              <div style={{ fontFamily: F.s, fontSize: 13, color: C.t2, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span>Short-term (5 min): <strong style={{ color: structure?.m5Trend === "bullish" ? C.bu : structure?.m5Trend === "bearish" ? C.be : C.nu }}>{translateTrend(structure?.m5Trend || "neutral")}</strong></span>
                <span style={{ color: C.bd }}>·</span>
                <span>Medium-term (15 min): <strong style={{ color: structure?.m15Trend === "bullish" ? C.bu : structure?.m15Trend === "bearish" ? C.be : C.nu }}>{translateTrend(structure?.m15Trend || "neutral")}</strong></span>
                <span style={{ color: C.bd }}>·</span>
                <span>Longer-term (1 hour): <strong style={{ color: structure?.h1Bias === "bullish" ? C.bu : structure?.h1Bias === "bearish" ? C.be : C.nu }}>{translateTrend(structure?.h1Bias || "neutral")}</strong></span>
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTION 3 — INDICATOR STRENGTH BARS */}
            {/* ============================================================ */}
            <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "16px 18px" }}>
              <div style={{ fontFamily: F.s, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t2, marginBottom: 14 }}>How Strong Is the Signal?</div>

              {indMatrix ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Trend Strength */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div>
                        <span style={{ fontFamily: F.s, fontSize: 14, fontWeight: 600, color: C.tx }}>Trend Strength</span>
                        <span style={{ fontFamily: F.s, fontSize: 11, color: C.t3, marginLeft: 8 }}>Are the main moving averages pointing the same direction?</span>
                      </div>
                      <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: indMatrix.trendScore > 15 ? C.bu : indMatrix.trendScore < -15 ? C.be : C.nu }}>{indMatrix.trendScore > 0 ? "+" : ""}{indMatrix.trendScore.toFixed(0)}</span>
                    </div>
                    <FBar label="" score={indMatrix.trendScore} />
                  </div>

                  {/* Momentum */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div>
                        <span style={{ fontFamily: F.s, fontSize: 14, fontWeight: 600, color: C.tx }}>Momentum</span>
                        <span style={{ fontFamily: F.s, fontSize: 11, color: C.t3, marginLeft: 8 }}>Is price accelerating or slowing down?</span>
                      </div>
                      <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: indMatrix.momentumScore > 15 ? C.bu : indMatrix.momentumScore < -15 ? C.be : C.nu }}>{indMatrix.momentumScore > 0 ? "+" : ""}{indMatrix.momentumScore.toFixed(0)}</span>
                    </div>
                    <FBar label="" score={indMatrix.momentumScore} />
                  </div>

                  {/* Market Activity (Volatility 0-100) */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div>
                        <span style={{ fontFamily: F.s, fontSize: 14, fontWeight: 600, color: C.tx }}>Market Activity</span>
                        <span style={{ fontFamily: F.s, fontSize: 11, color: C.t3, marginLeft: 8 }}>How much is price moving? Higher = more opportunities, higher risk.</span>
                      </div>
                      <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: C.wa }}>{indMatrix.volatilityScore.toFixed(0)}/100</span>
                    </div>
                    <div style={{ height: 8, background: C.bd, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${indMatrix.volatilityScore}%`, height: "100%", background: `linear-gradient(90deg, ${C.wa}66, ${C.wa})`, borderRadius: 4, transition: "width 0.5s" }} />
                    </div>
                  </div>

                  {/* Market Participation */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div>
                        <span style={{ fontFamily: F.s, fontSize: 14, fontWeight: 600, color: C.tx }}>Market Participation</span>
                        <span style={{ fontFamily: F.s, fontSize: 11, color: C.t3, marginLeft: 8 }}>Is volume and price action confirming the move?</span>
                      </div>
                      <span style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: indMatrix.participationScore > 15 ? C.bu : indMatrix.participationScore < -15 ? C.be : C.nu }}>{indMatrix.participationScore > 0 ? "+" : ""}{indMatrix.participationScore.toFixed(0)}</span>
                    </div>
                    <FBar label="" score={indMatrix.participationScore} />
                  </div>

                  {/* Overall Bot Bias — with verdict */}
                  <div style={{ background: `${biasVerdict.color}0d`, border: `1px solid ${biasVerdict.color}33`, borderRadius: 6, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontFamily: F.s, fontSize: 14, fontWeight: 700, color: C.tx }}>Overall Bot Bias</span>
                        <span style={{ fontFamily: F.s, fontSize: 11, color: C.t3, marginLeft: 8 }}>Combined read of all signals.</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: F.m, fontSize: 16, fontWeight: 800, color: biasVerdict.color }}>{indMatrix.overallBias > 0 ? "+" : ""}{indMatrix.overallBias.toFixed(0)}</span>
                        <span style={{ fontFamily: F.s, fontSize: 12, fontWeight: 700, color: biasVerdict.color, background: `${biasVerdict.color}1a`, padding: "4px 10px", borderRadius: 4 }}>{biasVerdict.text}</span>
                      </div>
                    </div>
                    <FBar label="" score={indMatrix.overallBias} />
                  </div>

                  {/* Divergence warnings */}
                  {indMatrix.divergenceWarnings && indMatrix.divergenceWarnings.length > 0 && (
                    <div style={{ background: `${C.wa}12`, border: `1px solid ${C.wa}33`, borderRadius: 6, padding: "12px 14px" }}>
                      <div style={{ fontFamily: F.s, fontSize: 13, fontWeight: 700, color: C.wa, marginBottom: 6 }}>⚠ Warning: Conflicting Signals</div>
                      {indMatrix.divergenceWarnings.map((w, i) => (
                        <div key={i} style={{ fontFamily: F.s, fontSize: 12, color: C.t2, marginTop: 4 }}>{w}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <NoData />
              )}
            </div>

            {/* ============================================================ */}
            {/* SECTION 4 — TRADE PANEL + OPEN POSITIONS */}
            {/* ============================================================ */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 12 }}>
              {/* Left column — Execute a Trade */}
              <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "16px 18px" }}>
                <div style={{ fontFamily: F.s, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t2, marginBottom: 12 }}>Execute a Trade</div>

                {/* Recommendation tooltip */}
                <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: s?.no_trade ? `${C.wa}0d` : sigDir === "buy" ? `${C.bu}0d` : sigDir === "sell" ? `${C.be}0d` : `${C.nu}0d`, border: `1px solid ${s?.no_trade ? C.wa : sigDir === "buy" ? C.bu : sigDir === "sell" ? C.be : C.nu}22` }}>
                  {s?.no_trade ? (
                    <span style={{ fontFamily: F.s, fontSize: 12, color: C.wa }}>⊘ The bot recommends NO trade right now. Reason: {s.no_trade_reason || "Market unclear"}</span>
                  ) : sigDir === "buy" ? (
                    <span style={{ fontFamily: F.s, fontSize: 12, color: C.bu }}>💡 The bot recommends BUYING based on current signals.</span>
                  ) : sigDir === "sell" ? (
                    <span style={{ fontFamily: F.s, fontSize: 12, color: C.be }}>💡 The bot recommends SELLING based on current signals.</span>
                  ) : (
                    <span style={{ fontFamily: F.s, fontSize: 12, color: C.nu }}>→ No strong signal either way. Manual discretion.</span>
                  )}
                </div>

                <TradePanel signal={s ?? null} account={acct} tradeMode={data?.trade_mode || "paper"} onTrade={sendTrade} />
              </div>

              {/* Right column — Open Trades */}
              <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "16px 18px" }}>
                <div style={{ fontFamily: F.s, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t2, marginBottom: 12 }}>Open Trades</div>

                {(positions.length + (data?.trade_history?.filter((t: any) => t.status === "filled" && t.mode === "paper").length || 0)) === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 16px" }}>
                    <div style={{ fontFamily: F.s, fontSize: 14, color: C.t2, marginBottom: 6 }}>No open trades right now.</div>
                    <div style={{ fontFamily: F.s, fontSize: 12, color: C.t3 }}>When the bot opens a trade, it will appear here with live profit/loss.</div>
                  </div>
                ) : (
                  <PositionsPanel
                    positions={positions}
                    paperTrades={data?.trade_history?.filter((t: any) => t.mode === "paper")}
                    currentBid={s?.bid || 0}
                    onClose={closePosition}
                    onModify={modifyPosition}
                    onBreakeven={breakevenPosition}
                  />
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* SECTION 5 — ACCOUNT + STATUS BAR */}
            {/* ============================================================ */}
            <div style={{ background: C.cd, borderRadius: 8, border: `1px solid ${C.bd}`, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              {/* Group 1 — Account Health */}
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3, marginBottom: 2 }}>Balance</div>
                  <div style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: C.tx }}>${acct?.balance?.toFixed(2) || "—"}</div>
                </div>
                <div>
                  <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3, marginBottom: 2 }}>Equity</div>
                  <div style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: acct && acct.equity >= acct.balance ? C.bu : C.be }}>${acct?.equity?.toFixed(2) || "—"}</div>
                </div>
                <div>
                  <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3, marginBottom: 2 }}>Open P&L</div>
                  <div style={{ fontFamily: F.m, fontSize: 14, fontWeight: 700, color: (acct?.profit || 0) >= 0 ? C.bu : C.be }}>{fp(acct?.profit || 0)}</div>
                </div>
              </div>

              <div style={{ width: 1, height: 36, background: C.bd }} />

              {/* Group 2 — Bot Status */}
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: h?.mt5_connected ? C.bu : C.be, boxShadow: `0 0 6px ${h?.mt5_connected ? C.bu : C.be}66` }} />
                  <div>
                    <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3 }}>MT5 Connection</div>
                    <div style={{ fontFamily: F.m, fontSize: 12, fontWeight: 600, color: h?.mt5_connected ? C.bu : C.be }}>{h?.mt5_connected ? "Connected" : "Disconnected"}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3 }}>Last Data</div>
                  <div style={{ fontFamily: F.m, fontSize: 12, fontWeight: 600, color: lastDataAge > 60 ? C.be : lastDataAge > 30 ? C.wa : C.t2 }}>{lastDataAge < 999 ? `${lastDataAge}s ago` : "—"}</div>
                </div>
                <div>
                  <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3 }}>Trade Mode</div>
                  <div style={{ fontFamily: F.m, fontSize: 12, fontWeight: 700, color: data?.trade_mode === "live" ? C.be : C.wa }}>{(data?.trade_mode || "—").toUpperCase()}</div>
                </div>
              </div>

              <div style={{ width: 1, height: 36, background: C.bd }} />

              {/* Group 3 — Quick Stats */}
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3 }}>Scans today</div>
                  <div style={{ fontFamily: F.m, fontSize: 14, fontWeight: 600, color: C.t2 }}>{scans.length}</div>
                </div>
                <div>
                  <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3 }}>Alerts fired</div>
                  <div style={{ fontFamily: F.m, fontSize: 14, fontWeight: 600, color: C.t2 }}>{alerts.length}</div>
                </div>
                <div>
                  <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3 }}>Open trades</div>
                  <div style={{ fontFamily: F.m, fontSize: 14, fontWeight: 600, color: positions.length > 0 ? C.wa : C.t2 }}>{positions.length}</div>
                </div>
              </div>
            </div>

          </div>
        );
      })()}

      {activeTab === "gold_v2" && data?.gold_v2 && (
        <GoldV2Panel v2={data.gold_v2} />
      )}
      {activeTab === "gold_v2" && !data?.gold_v2 && (
        <div style={{ padding: 40, textAlign: "center", fontFamily: F.m, fontSize: 13, color: C.t3 }}>
          <div style={{ marginBottom: 12, fontSize: 15, color: C.t2 }}>V2 Engine — Awaiting first MT5 data payload</div>
          <div style={{ fontSize: 11, color: C.t3 }}>The V2 pipeline runs automatically on each MT5 market update.</div>
        </div>
      )}

      {activeTab === "gold_logic" && goldLogicData && (
        <GoldLogicTab data={goldLogicData} />
      )}
      {activeTab === "gold_logic" && !goldLogicData && (
        <div style={{ padding: 40, textAlign: "center", fontFamily: F.m, fontSize: 13, color: C.t3 }}>Loading Gold Logic AI data...</div>
      )}

      {activeTab === "spectre" && spectreData && (
        <SpectreTab data={spectreData} phundScore={s?.master_score ?? null} phundState={s?.state ?? null} />
      )}
      {activeTab === "spectre" && !spectreData && (
        <div style={{ padding: 40, textAlign: "center", fontFamily: F.m, fontSize: 13, color: C.t3 }}>Loading SPECTRE data...</div>
      )}

      <footer style={{ padding: "10px 16px", borderTop: `1px solid ${C.bd}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>Gold Dashboard V2.1 — V2 Structure/Regime/Spread Engine — 30 Indicators — Real-time</span>
        <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>Scans: {scans.length} | Alerts: {alerts.length} | Positions: {positions.length} | Poll: 10s</span>
      </footer>
    </div>
  );
}
