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
interface Dash { timestamp: string; trade_mode: string; health: Health; latest_signal: Sig | null; scan_history: Sig[]; recent_alerts: Alrt[]; trade_history: any[]; market_cache: Record<string, any>; account: Acct | null; notification_channels: Record<string, boolean>; gold_logic?: GoldLogicSnapshot | null; spectre?: SpectreOutput | null; consensus?: Consensus | null; version?: string; }
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

function TradePanel({ signal, account, onTrade }: { signal: Sig | null; account: Acct | null; onTrade: (action: string, dir?: string, vol?: number, sl?: number, tp?: number, ticket?: number) => Promise<any> }) {
  const [lot, setLot] = useState(0.10);
  const [customLot, setCustomLot] = useState("");
  const [useSig, setUseSig] = useState(true);
  const [manSl, setManSl] = useState("");
  const [manTp, setManTp] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const activeLot = customLot ? parseFloat(customLot) || lot : lot;
  const sigSl = signal?.invalidation;
  const slDist = signal ? Math.abs(signal.price - signal.invalidation) : 0;
  const sigTp = signal ? (signal.price > signal.invalidation ? signal.price + slDist * 4 : signal.price - slDist * 4) : undefined;
  const finalSl = useSig ? sigSl : (manSl ? parseFloat(manSl) : undefined);
  const finalTp = useSig ? sigTp : (manTp ? parseFloat(manTp) : undefined);
  const dir = signal?.state.includes("bull") || signal?.state.includes("long") || signal?.state === "breakout_watch_up" ? "buy" :
    signal?.state.includes("bear") || signal?.state.includes("short") || signal?.state === "breakout_watch_down" ? "sell" : null;

  const exec = async (direction: string) => {
    if (loading) return;
    setLoading(true); setStatus(null);
    try {
      const r = await onTrade("open", direction, activeLot, finalSl, finalTp);
      setStatus({ ok: r?.ok, msg: r?.ok ? `✓ ${direction.toUpperCase()} ${activeLot} lot queued — ${r.order_id}` : `✗ ${r?.error || "Failed"}` });
    } catch (e: any) { setStatus({ ok: false, msg: `✗ ${e.message}` }); }
    setLoading(false);
  };

  const closeAll = async () => {
    if (loading) return;
    setLoading(true); setStatus(null);
    try {
      const r = await onTrade("close_all");
      setStatus({ ok: r?.ok, msg: r?.ok ? "✓ Close all queued" : `✗ ${r?.error}` });
    } catch (e: any) { setStatus({ ok: false, msg: `✗ ${e.message}` }); }
    setLoading(false);
  };

  return (
    <div>
      {/* Price display */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontFamily: F.m, fontSize: 11, color: C.t3, marginBottom: 3 }}>BID</div>
          <div style={{ fontFamily: F.m, fontSize: 22, fontWeight: 800, color: C.bu }}>{signal?.bid?.toFixed(2) || "—"}</div>
        </div>
        <div style={{ width: 1, height: 40, background: C.bd }} />
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontFamily: F.m, fontSize: 11, color: C.t3, marginBottom: 3 }}>ASK</div>
          <div style={{ fontFamily: F.m, fontSize: 22, fontWeight: 800, color: C.be }}>{signal?.ask?.toFixed(2) || "—"}</div>
        </div>
        <div style={{ width: 1, height: 40, background: C.bd }} />
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontFamily: F.m, fontSize: 11, color: C.t3, marginBottom: 3 }}>SPREAD</div>
          <div style={{ fontFamily: F.m, fontSize: 16, fontWeight: 700, color: (signal?.spread || 0) > 30 ? C.wa : C.t2 }}>{signal?.spread?.toFixed(1) || "—"}</div>
        </div>
      </div>

      {/* Signal recommendation */}
      {signal && dir && (
        <div style={{ padding: "7px 10px", background: `${stC(signal.state)}0d`, border: `1px solid ${stC(signal.state)}22`, borderRadius: 4, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: F.s, fontSize: 12, color: stC(signal.state) }}>Signal: {sl(signal.state)}</span>
          <span style={{ fontFamily: F.m, fontSize: 12, color: C.t3 }}>Score: {signal.master_score > 0 ? "+" : ""}{signal.master_score.toFixed(1)}</span>
        </div>
      )}
      {signal?.no_trade && (
        <div style={{ padding: "7px 10px", background: `${C.wa}0d`, border: `1px solid ${C.wa}22`, borderRadius: 4, marginBottom: 10 }}>
          <span style={{ fontFamily: F.s, fontSize: 12, color: C.wa }}>⊘ No Trade — {signal.no_trade_reason}</span>
        </div>
      )}

      {/* Lot size */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: F.s, fontSize: 12, color: C.t3, marginBottom: 5 }}>Lot Size</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {LOT_SIZES.map(l => (
            <button key={l} onClick={() => { setLot(l); setCustomLot(""); }}
              style={{ fontFamily: F.m, fontSize: 12, padding: "6px 10px", borderRadius: 4, border: `1px solid ${lot === l && !customLot ? C.ac : C.bd}`, background: lot === l && !customLot ? `${C.ac}1a` : "transparent", color: lot === l && !customLot ? C.ac : C.t2, cursor: "pointer" }}>
              {l}
            </button>
          ))}
          <input value={customLot} onChange={e => setCustomLot(e.target.value)} placeholder="custom"
            style={{ fontFamily: F.m, fontSize: 12, width: 64, padding: "6px 8px", borderRadius: 4, border: `1px solid ${customLot ? C.ac : C.bd}`, background: C.bg, color: C.tx, outline: "none" }} />
        </div>
      </div>

      {/* SL/TP */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
          <span style={{ fontFamily: F.s, fontSize: 12, color: C.t3 }}>SL / TP</span>
          <button onClick={() => setUseSig(!useSig)}
            style={{ fontFamily: F.s, fontSize: 11, padding: "3px 8px", borderRadius: 3, border: `1px solid ${useSig ? C.bu : C.bd}`, background: useSig ? `${C.bu}1a` : "transparent", color: useSig ? C.bu : C.t3, cursor: "pointer" }}>
            {useSig ? "Auto (signal)" : "Manual"}
          </button>
        </div>
        {useSig ? (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: F.m, fontSize: 12, color: C.be }}>SL: {sigSl?.toFixed(2) || "—"} <span style={{ color: C.t3 }}>({slDist.toFixed(2)} pts)</span></span>
            <span style={{ fontFamily: F.m, fontSize: 12, color: C.bu }}>TP: {sigTp?.toFixed(2) || "—"} <span style={{ color: C.t3 }}>(4:1)</span></span>
            {activeLot > 0 && slDist > 0 && <span style={{ fontFamily: F.m, fontSize: 12, color: C.t3 }}>Risk: ~${(activeLot * slDist * 100).toFixed(0)} → Reward: ~${(activeLot * slDist * 400).toFixed(0)}</span>}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={manSl} onChange={e => setManSl(e.target.value)} placeholder="SL price"
              style={{ fontFamily: F.m, fontSize: 12, width: 90, padding: "6px 8px", borderRadius: 4, border: `1px solid ${C.bd}`, background: C.bg, color: C.tx, outline: "none" }} />
            <input value={manTp} onChange={e => setManTp(e.target.value)} placeholder="TP price"
              style={{ fontFamily: F.m, fontSize: 12, width: 90, padding: "6px 8px", borderRadius: 4, border: `1px solid ${C.bd}`, background: C.bg, color: C.tx, outline: "none" }} />
          </div>
        )}
      </div>

      {/* Buy / Sell buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <button onClick={() => exec("buy")} disabled={loading}
          style={{ padding: "14px 0", borderRadius: 6, border: "none", background: loading ? `${C.bu}44` : `linear-gradient(135deg, #0fd49288, #0fd492)`, color: "#080c14", fontFamily: F.m, fontWeight: 800, fontSize: 16, cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.05em" }}>
          ▲ BUY
        </button>
        <button onClick={() => exec("sell")} disabled={loading}
          style={{ padding: "14px 0", borderRadius: 6, border: "none", background: loading ? `${C.be}44` : `linear-gradient(135deg, #f0484888, #f04848)`, color: "#fff", fontFamily: F.m, fontWeight: 800, fontSize: 16, cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.05em" }}>
          ▼ SELL
        </button>
      </div>

      {/* Close All */}
      {(account?.positions?.length || 0) > 0 && (
        <button onClick={closeAll} disabled={loading}
          style={{ width: "100%", padding: "9px 0", borderRadius: 5, border: `1px solid ${C.wa}44`, background: `${C.wa}0d`, color: C.wa, fontFamily: F.m, fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", marginBottom: 8 }}>
          ✕ CLOSE ALL POSITIONS
        </button>
      )}

      {/* Account summary */}
      {account && (
        <div style={{ borderTop: `1px solid ${C.bd}`, paddingTop: 10, marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
            <span style={{ fontFamily: F.m, fontSize: 12, color: C.t3 }}>Balance</span>
            <span style={{ fontFamily: F.m, fontSize: 12, color: C.tx }}>${account.balance?.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
            <span style={{ fontFamily: F.m, fontSize: 12, color: C.t3 }}>Equity</span>
            <span style={{ fontFamily: F.m, fontSize: 12, color: account.profit >= 0 ? C.bu : C.be }}>${account.equity?.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
            <span style={{ fontFamily: F.m, fontSize: 12, color: C.t3 }}>Open P&L</span>
            <span style={{ fontFamily: F.m, fontSize: 13, fontWeight: 700, color: account.profit >= 0 ? C.bu : C.be }}>{fp(account.profit)}</span>
          </div>
        </div>
      )}

      {status && (
        <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 4, background: status.ok ? `${C.bu}0d` : `${C.be}0d`, border: `1px solid ${status.ok ? C.bu : C.be}33` }}>
          <span style={{ fontFamily: F.m, fontSize: 12, color: status.ok ? C.bu : C.be }}>{status.msg}</span>
        </div>
      )}
    </div>
  );
}

function PositionsPanel({ positions, onClose }: { positions: Pos[]; onClose: (ticket: number) => Promise<any> }) {
  const [closing, setClosing] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Record<number, string>>({});

  const close = async (ticket: number) => {
    setClosing(ticket);
    try {
      const r = await onClose(ticket);
      setMsgs(m => ({ ...m, [ticket]: r?.ok ? "✓ Close queued" : `✗ ${r?.error}` }));
    } catch (e: any) { setMsgs(m => ({ ...m, [ticket]: `✗ ${e.message}` })); }
    setClosing(null);
  };

  if (!positions?.length) return <div style={{ fontFamily: F.m, fontSize: 13, color: C.t3, textAlign: "center", padding: 24 }}>No open positions</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F.m, fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `1px solid ${C.bd}` }}>
          {["Ticket", "Dir", "Vol", "Open", "Current", "SL", "TP", "P&L", ""].map(h => (
            <th key={h} style={{ padding: "6px 6px", textAlign: "left", color: C.t3, fontWeight: 500, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.ticket} style={{ borderBottom: `1px solid ${C.bd}15` }}>
              <td style={{ padding: "6px 6px", color: C.t2 }}>{p.ticket}</td>
              <td style={{ padding: "6px 6px" }}><Bdg t={p.direction.toUpperCase()} c={p.direction === "buy" ? C.bu : C.be} /></td>
              <td style={{ padding: "6px 6px", color: C.tx }}>{p.volume}</td>
              <td style={{ padding: "6px 6px", color: C.t2 }}>{p.open_price?.toFixed(2)}</td>
              <td style={{ padding: "6px 6px", color: C.tx }}>{p.current_price?.toFixed(2)}</td>
              <td style={{ padding: "6px 6px", color: C.be }}>{p.sl?.toFixed(2) || "—"}</td>
              <td style={{ padding: "6px 6px", color: C.bu }}>{p.tp?.toFixed(2) || "—"}</td>
              <td style={{ padding: "6px 6px", color: p.profit >= 0 ? C.bu : C.be, fontWeight: 700 }}>{fp(p.profit)}</td>
              <td style={{ padding: "6px 6px" }}>
                {msgs[p.ticket] ? (
                  <span style={{ fontSize: 11, color: msgs[p.ticket].startsWith("✓") ? C.bu : C.be }}>{msgs[p.ticket]}</span>
                ) : (
                  <button onClick={() => close(p.ticket)} disabled={closing === p.ticket}
                    style={{ fontFamily: F.m, fontSize: 11, padding: "4px 10px", borderRadius: 3, border: `1px solid ${C.be}44`, background: `${C.be}0d`, color: C.be, cursor: "pointer" }}>
                    Close
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [activeTab, setActiveTab] = useState<"phund"|"gold_logic"|"spectre">("phund");
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

  const sendTrade = async (action: string, direction?: string, volume?: number, slP?: number, tpP?: number, ticket?: number) => {
    const r = await fetch("/api/trade/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, direction, volume, sl: slP, tp: tpP, symbol: "XAUUSD", ticket }),
    });
    return r.json();
  };

  const closePosition = async (ticket: number) => sendTrade("close", undefined, undefined, undefined, undefined, ticket);
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
        {(["phund","gold_logic","spectre"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ background: "none", border: "none", borderBottom: activeTab === tab ? `2px solid ${tab === "spectre" ? C.pu : tab === "gold_logic" ? "#fbbf24" : C.ac}` : "2px solid transparent", padding: "8px 18px", cursor: "pointer", fontFamily: F.m, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: activeTab === tab ? (tab === "spectre" ? C.pu : tab === "gold_logic" ? "#fbbf24" : C.ac) : C.t3, textTransform: "uppercase", transition: "all 0.2s" }}>
            {tab === "phund" ? "OVERVIEW" : tab === "gold_logic" ? "GOLD V2" : "SPECTRE"}
          </button>
        ))}
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

      {!h?.mt5_connected && (
        <div style={{ background: `${C.ac}10`, borderBottom: `1px solid ${C.ac}33`, padding: "8px 16px", fontFamily: F.s, fontSize: 12, color: C.ac }}>
          <strong>MT5 not connected.</strong> Attach PhundBridge EA to XAUUSD M10 chart in OX Securities MT5.
        </div>
      )}
      {err && <div style={{ background: `${C.be}14`, padding: "7px 16px", fontFamily: F.m, fontSize: 11, color: C.be, borderBottom: `1px solid ${C.be}33` }}>API: {err}</div>}

      {/* MAIN GRID */}
      {activeTab === "phund" && <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 10 }}>

        {/* TRADE EXECUTION */}
        <Card title="Trade Execution — XAUUSD">
          <TradePanel signal={s ?? null} account={acct} onTrade={sendTrade} />
        </Card>

        {/* SIGNAL SUMMARY */}
        <Card title="Signal Summary">
          {s ? (<>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontFamily: F.m, fontSize: 32, fontWeight: 800, color: scC(s.master_score), lineHeight: 1 }}>{s.master_score > 0 ? "+" : ""}{s.master_score.toFixed(1)}</span>
                  <span style={{ fontFamily: F.m, fontSize: 11, color: C.t3 }}>/ 100</span>
                </div>
                <Bdg t={sl(s.state)} c={sc} sz="lg" />
                <div style={{ marginTop: 8 }}>
                  <DR l="Confidence" v={s.confidence_label} c={s.confidence_pct > 0.7 ? C.bu : s.confidence_pct > 0.55 ? C.wa : C.be} m={false} />
                  <DR l="Bull %" v={`${(s.bull_probability * 100).toFixed(1)}%`} c={C.bu} />
                  <DR l="Bear %" v={`${(s.bear_probability * 100).toFixed(1)}%`} c={C.be} />
                  <DR l="Risk" v={s.risk_level.replace(/_/g, " ")} c={s.risk_level === "low" ? C.bu : C.wa} m={false} />
                  <DR l="Key Level" v={s.key_level.toFixed(2)} />
                  <DR l="Invalidation" v={s.invalidation.toFixed(2)} c={C.be} />
                  <DR l="Quality" v={s.data_quality} c={s.data_quality === "full" ? C.bu : C.wa} m={false} />
                  <DR l="Scan" v={ft(s.timestamp)} />
                </div>
              </div>
              <Arc p={s.bull_probability} />
            </div>
            {scans.length > 2 && <div style={{ marginTop: 10 }}><div style={{ fontFamily: F.m, fontSize: 9, color: C.t3, marginBottom: 3 }}>SCORE TREND</div><SChart hist={scans} /></div>}
          </>) : <NoData />}
        </Card>

        {/* OPEN POSITIONS */}
        <Card title={`Open Positions (${positions.length})`} span={2}>
          <PositionsPanel positions={positions} onClose={closePosition} />
        </Card>

        {/* FACTOR MATRIX */}
        <Card title="Factor Matrix">
          {s ? (<>
            <FBar label="Trend" score={s.factors.trend?.score || 0} />
            <FBar label="Momentum" score={s.factors.momentum?.score || 0} />
            <FBar label="Volatility" score={s.factors.volatility?.score || 0} />
            <FBar label="Structure" score={s.factors.structure?.score || 0} />
            <FBar label="Macro" score={s.factors.macro?.score || 0} />
            <FBar label="Session" score={s.factors.session?.score || 0} min={-30} max={30} />
            <FBar label="Exhaustion" score={s.factors.exhaustion?.score || 0} min={-100} max={0} />
            <FBar label="Event Risk" score={s.factors.event_risk?.score || 0} min={-100} max={0} />
            <div style={{ marginTop: 6, fontFamily: F.m, fontSize: 9, color: C.t3 }}>T×.26 M×.20 V×.10 S×.18 C×.14 Q×.04 Ex×.04 Ev×.04</div>
          </>) : <NoData />}
        </Card>

        {/* TREND ALIGNMENT */}
        <Card title="Timeframe Directions">
          {s ? (<>
            {["10m", "1h", "4h"].map(tf => {
              const bias = (s.tf_biases || {})[tf] as number ?? 0;
              return <TfRow key={tf} tf={tf} bias={bias} />;
            })}
            <div style={{ marginTop: 8, padding: "5px 8px", background: `${sc}0d`, borderRadius: 4, border: `1px solid ${sc}1a` }}>
              <span style={{ fontFamily: F.s, fontSize: 10, color: sc }}>
                {s.factors.trend?.metadata?.alignment === "full_bull" ? "EMA Stack: Full Bullish ✓" : s.factors.trend?.metadata?.alignment === "full_bear" ? "EMA Stack: Full Bearish ✗" : "EMA Stack: Mixed"}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              {[["EMA 20", s.factors.trend?.metadata?.ema20], ["EMA 50", s.factors.trend?.metadata?.ema50], ["EMA 200", s.factors.trend?.metadata?.ema200]].map(([l, v]) => (
                <DR key={l as string} l={l as string} v={(v as number)?.toFixed(2) || "—"} c={s.price > (v as number) ? C.bu : C.be} />
              ))}
            </div>
          </>) : <NoData />}
        </Card>

        {/* STRUCTURE */}
        <Card title="Support & Resistance">
          {s ? <SRLadder signal={s} /> : <NoData />}
        </Card>

        {/* MOMENTUM */}
        <Card title="Momentum">
          {s?.factors.momentum ? (<>
            <DR l="RSI (14)" v={(s.factors.momentum.metadata.rsi || 50).toFixed(1)} c={s.factors.momentum.metadata.rsi > 70 ? C.be : s.factors.momentum.metadata.rsi < 30 ? C.bu : C.tx} />
            <div style={{ height: 4, background: C.bd, borderRadius: 2, margin: "2px 0 6px", position: "relative" }}>
              <div style={{ position: "absolute", left: "30%", width: "40%", height: "100%", background: `${C.nu}22` }} />
              <div style={{ position: "absolute", left: `${s.factors.momentum.metadata.rsi || 50}%`, top: -2, width: 6, height: 8, borderRadius: 3, background: s.factors.momentum.metadata.rsi > 70 ? C.be : s.factors.momentum.metadata.rsi < 30 ? C.bu : C.ac, transform: "translateX(-50%)" }} />
            </div>
            <DR l="MACD Hist" v={(s.factors.momentum.metadata.macdHist || 0).toFixed(4)} c={s.factors.momentum.metadata.macdHist > 0 ? C.bu : C.be} />
            <DR l="ROC (5)" v={`${(s.factors.momentum.metadata.roc || 0).toFixed(3)}%`} c={(s.factors.momentum.metadata.roc || 0) > 0 ? C.bu : C.be} />
            <DR l="ADX" v={(s.factors.momentum.metadata.adx?.adx || 0).toFixed(1)} c={(s.factors.momentum.metadata.adx?.adx || 0) > 25 ? C.ac : C.t3} />
            <DR l="Pressure" v={s.factors.momentum.metadata.candlePressure || "—"} c={s.factors.momentum.metadata.candlePressure === "bullish" ? C.bu : s.factors.momentum.metadata.candlePressure === "bearish" ? C.be : C.nu} m={false} />
            {s.factors.momentum.metadata.velocity && (
              <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: F.s, fontSize: 10, color: C.t3 }}>Velocity:</span>
                <Bdg t={s.factors.momentum.metadata.velocity.toUpperCase()} c={velocityColor(s.factors.momentum.metadata.velocity)} sz="sm" />
                {s.factors.momentum.metadata.momentumSlope !== undefined && (
                  <span style={{ fontFamily: F.m, fontSize: 10, color: C.t3 }}>({(s.factors.momentum.metadata.momentumSlope || 0).toFixed(2)})</span>
                )}
              </div>
            )}
          </>) : <NoData />}
        </Card>

        {/* VOLATILITY */}
        <Card title="Volatility">
          {s?.factors.volatility ? (<>
            <DR l="ATR (14)" v={(s.factors.volatility.metadata.atr || 0).toFixed(2)} />
            <DR l="ATR Ratio" v={(s.factors.volatility.metadata.atrRatio || 1).toFixed(2)} c={(s.factors.volatility.metadata.atrRatio || 1) > 1.3 ? C.wa : C.tx} />
            <DR l="BB Width" v={`${(s.factors.volatility.metadata.bb?.width || 0).toFixed(2)}%`} />
            <DR l="BB Pos" v={`${((s.factors.volatility.metadata.bbPos || 0.5) * 100).toFixed(0)}%`} />
            <div style={{ marginTop: 5 }}><Bdg t={(s.factors.volatility.metadata.status || "normal").toUpperCase()} c={s.factors.volatility.metadata.compressed ? C.pu : s.factors.volatility.metadata.expanding ? C.wa : C.nu} sz="md" /></div>
          </>) : <NoData />}
        </Card>

        {/* MACRO + SESSION + EVENT */}
        <Card title="Macro / Session / Events">
          {s ? (<>
            <DR l="Macro Bias" v={s.factors.macro?.metadata?.bias || "Neutral"} c={s.factors.macro?.metadata?.bias?.includes("bullish") ? C.bu : s.factors.macro?.metadata?.bias?.includes("bearish") ? C.be : C.nu} m={false} />
            <DR l="DXY Δ10m" v={`${((s.factors.macro?.metadata?.dxy_d10 || 0) * 100).toFixed(3)}%`} c={(s.factors.macro?.metadata?.dxy_d10 || 0) < 0 ? C.bu : C.be} />
            <DR l="US10Y Δ10m" v={`${((s.factors.macro?.metadata?.y10_d10 || 0) * 100).toFixed(3)}%`} c={(s.factors.macro?.metadata?.y10_d10 || 0) < 0 ? C.bu : C.be} />
            <DR l="Macro Live" v={s.factors.macro?.metadata?.live ? "Yes" : "No — add DXY to EA"} c={s.factors.macro?.metadata?.live ? C.bu : C.wa} m={false} />
            <div style={{ marginTop: 6, borderTop: `1px solid ${C.bd}33`, paddingTop: 5 }}>
              <DR l="Session" v={s.factors.session?.metadata?.label || "—"} c={(s.factors.session?.score || 0) > 0 ? C.bu : C.wa} m={false} />
              <DR l="Session Score" v={`${(s.factors.session?.score || 0) > 0 ? "+" : ""}${(s.factors.session?.score || 0).toFixed(0)}`} />
              {s.factors.session?.metadata?.dst && (
                <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
                  <Bdg t={`US DST: ${s.factors.session.metadata.dst.us ? "ON" : "OFF"}`} c={C.t3} sz="sm" />
                  <Bdg t={`EU DST: ${s.factors.session.metadata.dst.eu ? "ON" : "OFF"}`} c={C.t3} sz="sm" />
                </div>
              )}
            </div>
            <div style={{ marginTop: 6, borderTop: `1px solid ${C.bd}33`, paddingTop: 5 }}>
              <DR l="Event Risk" v={s.factors.event_risk?.metadata?.severity || "none"} c={(s.factors.event_risk?.score || 0) < -20 ? C.wa : C.bu} m={false} />
              <DR l="Next Event" v={s.factors.event_risk?.metadata?.minutes != null ? `${s.factors.event_risk.metadata.minutes} min` : "None near"} />
            </div>
          </>) : <NoData />}
        </Card>

        {/* SYSTEM HEALTH */}
        <Card title="System & Notifications">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Dot ok={h?.mt5_connected || false} />
            <span style={{ fontFamily: F.m, fontSize: 11, color: h?.mt5_connected ? C.bu : C.be }}>{h?.mt5_connected ? "OX Securities Connected" : "MT5 Disconnected"}</span>
          </div>
          <DR l="Last Heartbeat" v={h?.mt5_last_heartbeat ? ft(h.mt5_last_heartbeat) : "Never"} c={h?.mt5_connected ? C.t2 : C.be} />
          <DR l="Last Payload" v={h?.mt5_last_payload ? ft(h.mt5_last_payload) : "Never"} />
          <DR l="Payloads" v={String(h?.total_payloads || 0)} />
          <DR l="Open Positions" v={String(h?.open_positions || 0)} c={h?.open_positions ? C.wa : C.t2} />
          <DR l="Daily P&L" v={fp(h?.daily_pnl || 0)} c={(h?.daily_pnl || 0) >= 0 ? C.bu : C.be} />
          <DR l="Trade Mode" v={(data?.trade_mode || "—").toUpperCase()} c={data?.trade_mode === "live" ? C.be : C.ac} />
          <div style={{ marginTop: 8, borderTop: `1px solid ${C.bd}33`, paddingTop: 5 }}>
            <div style={{ fontFamily: F.s, fontSize: 10, color: C.t3, marginBottom: 4 }}>Notifications</div>
            <Bdg t={`TG: ${data?.notification_channels?.telegram ? "ON" : "OFF"}`} c={data?.notification_channels?.telegram ? C.bu : C.be} sz="sm" />
            <button onClick={testTG} style={{ marginLeft: 8, background: "none", border: `1px solid ${C.ac}44`, borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: F.m, fontSize: 10, color: C.ac }}>Test</button>
            {tgR && <div style={{ fontFamily: F.m, fontSize: 10, color: tgR.includes("✅") ? C.bu : C.be, marginTop: 4 }}>{tgR}</div>}
          </div>
        </Card>

        {/* ALERTS */}
        <Card title="Alerts Feed">
          {alerts.length === 0 ? <div style={{ fontFamily: F.m, fontSize: 11, color: C.t3, textAlign: "center", padding: 20 }}>Monitoring...</div> : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {alerts.map((a, i) => (
                <div key={a.id || i} style={{ padding: "5px 0", borderBottom: `1px solid ${C.bd}22` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <Bdg t={sl(a.signal_state)} c={stC(a.signal_state)} sz="sm" />
                    <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>{ft(a.timestamp)}</span>
                  </div>
                  <div style={{ fontFamily: F.m, fontSize: 10, color: C.t2 }}>{a.trigger_reason}</div>
                  <div style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>Score: {a.master_score?.toFixed(1)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* SCAN HISTORY */}
        <Card title="Scan History" span={2}>
          {scans.length === 0 ? <div style={{ fontFamily: F.m, fontSize: 11, color: C.t3, textAlign: "center", padding: 20 }}>No scans yet</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F.m, fontSize: 10 }}>
                <thead><tr style={{ borderBottom: `1px solid ${C.bd}` }}>
                  {["Time", "Score", "State", "Bull%", "Conf", "Risk", "Alert", "Qual"].map(x => <th key={x} style={{ padding: "4px 5px", textAlign: "left", color: C.t3, fontWeight: 500, fontSize: 9, whiteSpace: "nowrap" }}>{x}</th>)}
                </tr></thead>
                <tbody>
                  {scans.slice(0, 20).map((x, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.bd}15` }}>
                      <td style={{ padding: "3px 5px", color: C.t2, whiteSpace: "nowrap" }}>{ft(x.timestamp)}</td>
                      <td style={{ padding: "3px 5px", color: scC(x.master_score), fontWeight: 600 }}>{x.master_score > 0 ? "+" : ""}{x.master_score.toFixed(1)}</td>
                      <td style={{ padding: "3px 5px" }}><Bdg t={sl(x.state)} c={stC(x.state)} /></td>
                      <td style={{ padding: "3px 5px", color: C.bu }}>{(x.bull_probability * 100).toFixed(0)}%</td>
                      <td style={{ padding: "3px 5px", color: x.confidence_pct > 0.65 ? C.bu : C.wa }}>{x.confidence_label}</td>
                      <td style={{ padding: "3px 5px", color: x.risk_level === "low" ? C.bu : C.wa }}>{x.risk_level}</td>
                      <td style={{ padding: "3px 5px" }}>{x.alert_fired ? <Bdg t="✓" c={C.ac} /> : "—"}</td>
                      <td style={{ padding: "3px 5px", color: x.data_quality === "full" ? C.bu : C.wa }}>{x.data_quality}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

      </div>}

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
        <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>Gold Dashboard V2 — Gold Logic AI Engine — 30 Indicators — Real-time</span>
        <span style={{ fontFamily: F.m, fontSize: 9, color: C.t3 }}>Scans: {scans.length} | Alerts: {alerts.length} | Positions: {positions.length} | Poll: 10s</span>
      </footer>
    </div>
  );
}
