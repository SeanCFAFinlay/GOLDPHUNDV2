"use client";
import { F, C } from "@/lib/theme";

interface CardProps {
  title: string;
  children: React.ReactNode;
  span?: number;
}

export function Card({ title, children, span }: CardProps) {
  return (
    <div
      style={{
        background: C.cd,
        borderRadius: 8,
        border: `1px solid ${C.bd}`,
        padding: "16px 18px",
        gridColumn: span ? `span ${span}` : undefined,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: F.s,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: C.t2,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export default Card;
