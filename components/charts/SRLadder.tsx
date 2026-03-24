"use client";
import { F, C } from "@/lib/theme";

interface FR {
  score: number;
  components: Record<string, number>;
  metadata: Record<string, unknown>;
}

interface Sig {
  price: number;
  factors: Record<string, FR>;
}

interface SRLadderProps {
  signal: Sig;
}

export function SRLadder({ signal }: SRLadderProps) {
  const st = (signal.factors?.structure?.metadata || {}) as Record<string, unknown>;
  const vt = (signal.factors?.volatility?.metadata || {}) as Record<string, unknown>;
  const tr = (signal.factors?.trend?.metadata || {}) as Record<string, unknown>;
  const price = signal.price;

  const bb = vt.bb as { upper?: number; lower?: number } | undefined;

  const raw = [
    { label: "BB Upper", px: bb?.upper, type: "resist" },
    { label: "Session H", px: st.session_high as number | undefined, type: "resist" },
    { label: "Swing H", px: st.swing_high as number | undefined, type: "resist" },
    { label: "PDH", px: st.pdh as number | undefined, type: "resist" },
    { label: "EMA 20", px: tr.ema20 as number | undefined, type: "ema" },
    { label: "EMA 50", px: tr.ema50 as number | undefined, type: "ema" },
    { label: "VWAP", px: st.vwap as number | undefined, type: "vwap" },
    { label: "EMA 200", px: tr.ema200 as number | undefined, type: "ema" },
    { label: "Swing L", px: st.swing_low as number | undefined, type: "support" },
    { label: "PDL", px: st.pdl as number | undefined, type: "support" },
    { label: "Session L", px: st.session_low as number | undefined, type: "support" },
    { label: "BB Lower", px: bb?.lower, type: "support" },
  ]
    .filter((l) => l.px && l.px > 0 && Math.abs((l.px as number) - price) < 150)
    .sort((a, b) => (b.px as number) - (a.px as number));

  const above = raw.filter((l) => (l.px as number) >= price);
  const below = raw.filter((l) => (l.px as number) < price);

  const typeColor = (t: string) =>
    t === "resist" ? C.be : t === "support" ? C.bu : t === "vwap" ? C.pu : C.wa;

  const dist = (px: number) => Math.abs(px - price).toFixed(2);

  return (
    <div style={{ fontFamily: F.m, fontSize: 11 }}>
      {above
        .slice(0, 5)
        .reverse()
        .map((l, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "2px 6px",
              borderBottom: `1px solid ${C.bd}22`,
            }}
          >
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ color: typeColor(l.type), fontSize: 8 }}>▲</span>
              <span style={{ color: C.t2 }}>{l.label}</span>
              <span style={{ color: C.t3, fontSize: 9 }}>+{dist(l.px as number)}</span>
            </div>
            <span style={{ fontWeight: 700, color: typeColor(l.type) }}>
              {(l.px as number).toFixed(2)}
            </span>
          </div>
        ))}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 6px",
          background: `${C.ac}22`,
          border: `1px solid ${C.ac}44`,
          borderRadius: 3,
          margin: "3px 0",
        }}
      >
        <span style={{ color: C.ac, fontWeight: 800, letterSpacing: "0.05em" }}>▶ PRICE</span>
        <span style={{ color: C.ac, fontWeight: 800 }}>{price.toFixed(2)}</span>
      </div>
      {below.slice(0, 5).map((l, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 6px",
            borderBottom: `1px solid ${C.bd}22`,
          }}
        >
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ color: typeColor(l.type), fontSize: 8 }}>▼</span>
            <span style={{ color: C.t2 }}>{l.label}</span>
            <span style={{ color: C.t3, fontSize: 9 }}>-{dist(l.px as number)}</span>
          </div>
          <span style={{ fontWeight: 700, color: typeColor(l.type) }}>
            {(l.px as number).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default SRLadder;
