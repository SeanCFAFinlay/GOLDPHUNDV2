"use client";
import { F, C } from "@/lib/theme";

interface ArcProps {
  p: number;
  sz?: number;
}

export function Arc({ p, sz = 120 }: ArcProps) {
  const r = sz / 2 - 8;
  const cx = sz / 2;
  const cy = sz / 2;
  const ci = Math.PI * r;

  return (
    <svg width={sz} height={sz / 2 + 18} viewBox={`0 0 ${sz} ${sz / 2 + 18}`}>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={C.bd}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="url(#pg)"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={`${ci * p} ${ci * (1 - p)}`}
        style={{ transition: "stroke-dasharray 0.8s" }}
      />
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.bu} />
          <stop offset="100%" stopColor={C.be} />
        </linearGradient>
      </defs>
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        style={{ fontFamily: F.m, fontSize: 20, fontWeight: 800, fill: C.tx }}
      >
        {(p * 100).toFixed(0)}%
      </text>
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        style={{ fontFamily: F.s, fontSize: 8, fill: C.t3, letterSpacing: "0.08em" }}
      >
        BULL PROB
      </text>
    </svg>
  );
}

export default Arc;
