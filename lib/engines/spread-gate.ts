// ============================================================
// GOLD V2 — Spread Gate Engine
// Spread is a FIRST-CLASS risk input, not an afterthought.
// Computes spread/ATR ratio, detects spikes, manages cooldowns.
// ============================================================

import type { Bar, SpreadGateState } from "../types";
import { atr } from "../math/indicators";

// Thresholds
const MAX_SPREAD_ABSOLUTE_POINTS = 35;      // Hard block above this (XAUUSD normal ~8-20pts)
const MAX_SPREAD_ATR_RATIO_TREND = 0.15;    // Max spread/ATR in trending market
const MAX_SPREAD_ATR_RATIO_RANGE = 0.10;    // Tighter limit in range/chop
const SPIKE_MULTIPLIER = 2.5;               // Spread is spike if > 2.5x recent avg
const COOLDOWN_BARS_AFTER_SPIKE = 5;        // Bars to wait after spread spike

// In-memory cooldown state (persists across calls within same server process)
// This is intentional — cooldowns should survive within a session
let spreadHistory: number[] = [];
let cooldownBarsRemaining = 0;
let lastSpreadAvg = 0;

/** Call this to reset cooldown state (e.g. on server restart or test reset) */
export function resetSpreadGateState(): void {
  spreadHistory = [];
  cooldownBarsRemaining = 0;
  lastSpreadAvg = 0;
}

/** Restore cooldown state from persisted value */
export function restoreSpreadGateState(state: { cooldownBarsRemaining: number; spreadHistory: number[] }): void {
  cooldownBarsRemaining = state.cooldownBarsRemaining;
  spreadHistory = state.spreadHistory;
}

/** Get current state for persistence */
export function getSpreadGatePersistedState(): { cooldownBarsRemaining: number; spreadHistory: number[] } {
  return { cooldownBarsRemaining, spreadHistory: [...spreadHistory] };
}

function computeATR(bars: Bar[]): number {
  if (bars.length < 14) return 3; // XAUUSD typical ATR fallback
  const h = bars.map(b => b.high);
  const l = bars.map(b => b.low);
  const c = bars.map(b => b.close);
  return atr(h, l, c, 14);
}

function computeRecentSpreadAvg(history: number[]): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-20);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function classifySpreadRegime(
  spreadPoints: number,
  spreadToAtr: number,
  spikeDetected: boolean
): SpreadGateState["regime"] {
  if (spikeDetected) return "spike";
  if (spreadPoints <= 15 && spreadToAtr <= 0.08) return "tight";
  if (spreadPoints <= MAX_SPREAD_ABSOLUTE_POINTS && spreadToAtr <= MAX_SPREAD_ATR_RATIO_TREND) return "normal";
  return "wide";
}

export function runSpreadGate(
  spreadPoints: number,
  bars: Bar[],
  isRangeMarket = false
): SpreadGateState {
  const blockReasons: string[] = [];

  // Track spread history
  spreadHistory.push(spreadPoints);
  if (spreadHistory.length > 50) spreadHistory = spreadHistory.slice(-50);

  // Compute ATR from bars
  const currentATR = computeATR(bars);
  const atrInPoints = currentATR * 100; // Convert price to points (1pt = 0.01 for XAUUSD)

  // Spread as fraction of ATR (primary normalized metric)
  const spreadToAtr = atrInPoints > 0 ? spreadPoints / atrInPoints : 0;

  // Spike detection: compare current spread to recent average
  const recentAvg = computeRecentSpreadAvg(spreadHistory.slice(0, -1)); // Exclude current
  const spikeDetected = recentAvg > 0 && spreadPoints > recentAvg * SPIKE_MULTIPLIER;
  lastSpreadAvg = recentAvg;

  // Handle cooldown
  if (spikeDetected) {
    cooldownBarsRemaining = COOLDOWN_BARS_AFTER_SPIKE;
  } else if (cooldownBarsRemaining > 0) {
    cooldownBarsRemaining--;
  }

  // Determine effective spread limit based on market condition
  const maxSpreadAtr = isRangeMarket ? MAX_SPREAD_ATR_RATIO_RANGE : MAX_SPREAD_ATR_RATIO_TREND;

  // Gate 1: Absolute spread limit
  if (spreadPoints > MAX_SPREAD_ABSOLUTE_POINTS) {
    blockReasons.push(`Spread ${spreadPoints}pts exceeds absolute max ${MAX_SPREAD_ABSOLUTE_POINTS}pts`);
  }

  // Gate 2: Spread/ATR ratio
  if (spreadToAtr > maxSpreadAtr) {
    blockReasons.push(`Spread/ATR ${(spreadToAtr * 100).toFixed(1)}% exceeds ${(maxSpreadAtr * 100).toFixed(0)}% limit`);
  }

  // Gate 3: Cooldown after spike
  if (cooldownBarsRemaining > 0) {
    blockReasons.push(`Spread spike cooldown: ${cooldownBarsRemaining} bars remaining`);
  }

  const spreadSafe = blockReasons.length === 0;
  const regime = classifySpreadRegime(spreadPoints, spreadToAtr, spikeDetected);

  return {
    spread: currentATR,         // ATR price value
    spreadPoints,               // Raw spread in points
    atr: currentATR,
    spreadToAtr,
    spreadSafe,
    spikeDetected,
    cooldownBarsRemaining,
    regime,
    blockReasons,
  };
}
