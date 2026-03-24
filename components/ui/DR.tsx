"use client";
import { F, C } from "@/lib/theme";

interface DRProps {
  l: string;
  v: string;
  c?: string;
  m?: boolean;
}

export function DR({ l, v, c, m = true }: DRProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "5px 0",
        borderBottom: `1px solid ${C.bd}33`,
      }}
    >
      <span style={{ fontFamily: F.s, fontSize: 13, color: C.t3 }}>{l}</span>
      <span style={{ fontFamily: m ? F.m : F.s, fontSize: 13, fontWeight: 600, color: c || C.tx }}>
        {v}
      </span>
    </div>
  );
}

export default DR;
