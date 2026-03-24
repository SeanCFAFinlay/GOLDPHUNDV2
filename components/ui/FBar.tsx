"use client";
import { F, C } from "@/lib/theme";

interface FBarProps {
  label: string;
  score: number;
  min?: number;
  max?: number;
}

export function FBar({ label, score, min = -100, max = 100 }: FBarProps) {
  const rng = max - min;
  const pct = ((score - min) / rng) * 100;
  const mid = ((0 - min) / rng) * 100;
  const cl = score > 15 ? C.bu : score < -15 ? C.be : C.nu;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontFamily: F.s, fontSize: 13, color: C.t2 }}>{label}</span>
        <span style={{ fontFamily: F.m, fontSize: 13, fontWeight: 600, color: cl }}>
          {score > 0 ? "+" : ""}{score.toFixed(1)}
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: C.bd,
          borderRadius: 3,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {min < 0 && (
          <div
            style={{
              position: "absolute",
              left: `${mid}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: "#243045",
              zIndex: 1,
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            left: score >= 0 ? `${mid}%` : `${pct}%`,
            width: `${Math.abs(pct - mid)}%`,
            top: 0,
            bottom: 0,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${cl}66, ${cl})`,
            transition: "all 0.5s",
          }}
        />
      </div>
    </div>
  );
}

export default FBar;
