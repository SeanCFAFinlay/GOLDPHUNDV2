// ============================================================
// PHUND.CA — Theme Constants
// Centralized theme configuration for the dashboard
// ============================================================

/** Font families */
export const F = {
  /** Monospace font for numbers/code */
  m: "'JetBrains Mono',monospace",
  /** Sans-serif font for UI text */
  s: "'DM Sans',sans-serif",
} as const;

/** Color palette */
export const C = {
  /** Main background */
  bg: "#080c14",
  /** Card background */
  cd: "#0f1520",
  /** Border color */
  bd: "#1a2438",
  /** Primary text */
  tx: "#e1e7ef",
  /** Secondary text */
  t2: "#8a96a8",
  /** Tertiary text */
  t3: "#5a6578",
  /** Bullish green */
  bu: "#0fd492",
  /** Bright bullish (strong) */
  bb: "#2cf0aa",
  /** Bearish red */
  be: "#f04848",
  /** Bright bearish (strong) */
  br: "#ff6b6b",
  /** Warning amber */
  wa: "#f0a830",
  /** Accent blue */
  ac: "#3880f0",
  /** Neutral gray */
  nu: "#5a6578",
  /** Purple (special) */
  pu: "#a78bfa",
  /** Gold accent */
  gold: "#fbbf24",
} as const;

/**
 * Get color for signal state
 */
export function stateColor(state: string): string {
  if (state?.includes("strong_bull")) return C.bb;
  if (state?.includes("bull") || state?.includes("long") || state === "breakout_watch_up") return C.bu;
  if (state?.includes("strong_bear")) return C.br;
  if (state?.includes("bear") || state?.includes("short") || state === "breakout_watch_down") return C.be;
  if (state?.includes("no_trade")) return C.wa;
  if (state?.includes("reversal") || state?.includes("breakout")) return C.pu;
  return C.nu;
}

/**
 * Get color for score value
 */
export function scoreColor(score: number): string {
  if (score >= 50) return C.bb;
  if (score >= 25) return C.bu;
  if (score > -25) return C.nu;
  if (score > -50) return C.be;
  return C.br;
}

/**
 * Format state string for display
 */
export function formatState(state: string): string {
  return (state || "—").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format timestamp for display
 */
export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

/**
 * Format profit/loss value
 */
export function formatPnL(value: number): string {
  return value >= 0 ? `+$${value.toFixed(2)}` : `-$${Math.abs(value).toFixed(2)}`;
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/**
 * Format number with sign
 */
export function formatSigned(value: number, decimals = 1): string {
  return value > 0 ? `+${value.toFixed(decimals)}` : value.toFixed(decimals);
}

// Re-export for backward compatibility with existing page.tsx imports
export const stC = stateColor;
export const scC = scoreColor;
export const sl = formatState;
export const ft = formatTime;
export const fp = formatPnL;
