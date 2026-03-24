"use client";
import { F, C } from "@/lib/theme";

export function NoData() {
  return (
    <div
      style={{
        fontFamily: F.m,
        fontSize: 13,
        color: C.t3,
        textAlign: "center",
        padding: 24,
      }}
    >
      Awaiting MT5 data...
    </div>
  );
}

export default NoData;
