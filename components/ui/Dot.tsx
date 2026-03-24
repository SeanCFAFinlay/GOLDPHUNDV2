"use client";
import { C } from "@/lib/theme";

interface DotProps {
  ok: boolean;
}

export function Dot({ ok }: DotProps) {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: ok ? C.bu : C.be,
        boxShadow: `0 0 6px ${ok ? C.bu : C.be}66`,
      }}
    />
  );
}

export default Dot;
