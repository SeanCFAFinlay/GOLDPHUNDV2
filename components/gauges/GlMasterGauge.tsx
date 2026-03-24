"use client";
import { F, C, scoreColor } from "@/lib/theme";

interface GlMasterGaugeProps {
  score: number;
  label?: string;
}

export function GlMasterGauge({ score, label = "GOLD LOGIC SCORE" }: GlMasterGaugeProps) {
  const w = 260;
  const h = 60;
  const r = 50;
  const cx = w / 2;
  const cy = 60;
  const ci = Math.PI * r;
  const pct = (score + 100) / 200;
  const col = scoreColor(score);

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 10}`} style={{ display: "block" }}>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={C.bd}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={col}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${ci * pct} ${ci * (1 - pct)}`}
        style={{ transition: "stroke-dasharray 0.8s" }}
      />
      <text
        x={cx}
        y={cy - 14}
        textAnchor="middle"
        style={{
          fontFamily: F.m,
          fontSize: 22,
          fontWeight: 800,
          fill: col,
        }}
      >
        {score > 0 ? "+" : ""}
        {score.toFixed(1)}
      </text>
      <text
        x={cx}
        y={cy - 1}
        textAnchor="middle"
        style={{
          fontFamily: F.s,
          fontSize: 8,
          fill: C.t3,
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </text>
    </svg>
  );
}

export default GlMasterGauge;
