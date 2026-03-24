"use client";
import { F } from "@/lib/theme";

interface BdgProps {
  t: string;
  c: string;
  sz?: "sm" | "md" | "lg";
}

export function Bdg({ t, c, sz = "sm" }: BdgProps) {
  const fs = sz === "lg" ? 15 : sz === "md" ? 13 : 12;
  const px = sz === "lg" ? 16 : sz === "md" ? 12 : 9;
  const py = sz === "lg" ? 7 : sz === "md" ? 5 : 4;

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: F.s,
        fontSize: fs,
        fontWeight: 700,
        padding: `${py}px ${px}px`,
        borderRadius: 4,
        background: `${c}1a`,
        color: c,
        border: `1px solid ${c}33`,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {t}
    </span>
  );
}

export default Bdg;
