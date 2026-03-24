"use client";
import { C } from "@/lib/theme";

interface Sig {
  master_score: number;
}

interface SChartProps {
  hist: Sig[];
}

export function SChart({ hist }: SChartProps) {
  if (hist.length < 2) return null;

  const scores = hist.slice(-40).map((s) => s.master_score);
  const w = 280;
  const h = 60;
  const pad = 4;

  const xS = (i: number) => pad + (i / (scores.length - 1)) * (w - 2 * pad);
  const yS = (v: number) => pad + ((80 - v) / 160) * (h - 2 * pad);

  let path = `M ${xS(0)} ${yS(scores[0])}`;
  for (let i = 1; i < scores.length; i++) path += ` L ${xS(i)} ${yS(scores[i])}`;

  const last = scores[scores.length - 1];
  const col = last >= 0 ? C.bu : C.be;
  const area = path + ` L ${xS(scores.length - 1)} ${yS(0)} L ${xS(0)} ${yS(0)} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <line x1={pad} x2={w - pad} y1={yS(0)} y2={yS(0)} stroke="#1a2438" strokeWidth={0.5} />
      <path d={area} fill={`${col}10`} />
      <path d={path} fill="none" stroke={col} strokeWidth={1.5} />
      <circle cx={xS(scores.length - 1)} cy={yS(last)} r={3} fill={col} />
    </svg>
  );
}

export default SChart;
