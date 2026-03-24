import {
  evaluateTradeDecision,
  executePaperTrade,
  buildTradeInstruction,
  updatePaperTrades,
  DEFAULT_RISK_CONFIG,
  type AccountSnapshot,
} from "@/lib/trade-engine";
import type { SignalOutput, TradeRecord } from "@/lib/types";

// Create a minimal valid signal for testing
function createMockSignal(overrides: Partial<SignalOutput> = {}): SignalOutput {
  return {
    timestamp: new Date().toISOString(),
    symbol: "XAUUSD",
    price: 2000,
    bid: 1999.5,
    ask: 2000.5,
    spread: 10,
    master_score: 50,
    state: "strong_bullish",
    bull_probability: 0.75,
    bear_probability: 0.25,
    confidence_label: "High Confidence",
    confidence_pct: 0.75,
    factors: {
      session: { score: 30, components: {}, metadata: { label: "London/NY Overlap" } },
      volatility: { score: 20, components: {}, metadata: { atr: 3 } },
    },
    risk_level: "low",
    key_level: 2000,
    invalidation: 1995,
    breakout_watch: null,
    reversal_watch: null,
    no_trade: false,
    no_trade_reason: null,
    data_quality: "full",
    tf_biases: { "10m": 0.5, "1h": 0.4, "4h": 0.3 },
    alert_fired: false,
    ...overrides,
  };
}

function createMockAccount(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    balance: 10000,
    equity: 10000,
    open_positions: 0,
    daily_pnl: 0,
    peak_equity: 10000,
    last_trade_time: null,
    ...overrides,
  };
}

describe("Trade Decision Engine", () => {
  describe("evaluateTradeDecision", () => {
    it("should reject when mode is disabled", () => {
      const signal = createMockSignal();
      const account = createMockAccount();
      const config = { ...DEFAULT_RISK_CONFIG, mode: "disabled" as const };

      const decision = evaluateTradeDecision(signal, account, config, 10);

      expect(decision.approved).toBe(false);
      expect(decision.decision).toBe("no_action");
      expect(decision.rejection_reasons).toContain("Disabled");
    });

    it("should reject no_trade signals", () => {
      const signal = createMockSignal({
        no_trade: true,
        no_trade_reason: "ADX too weak",
      });
      const account = createMockAccount();

      const decision = evaluateTradeDecision(signal, account, DEFAULT_RISK_CONFIG, 10);

      expect(decision.approved).toBe(false);
      expect(decision.rejection_reasons).toContain("ADX too weak");
    });

    it("should reject when score is below threshold", () => {
      const signal = createMockSignal({ master_score: 10 });
      const account = createMockAccount();

      const decision = evaluateTradeDecision(signal, account, DEFAULT_RISK_CONFIG, 10);

      expect(decision.approved).toBe(false);
      expect(decision.rejection_reasons).toContain(`Score below ${DEFAULT_RISK_CONFIG.min_score}`);
    });

    it("should reject when confidence is too low", () => {
      const signal = createMockSignal({
        master_score: 50,
        confidence_pct: 0.4,
      });
      const account = createMockAccount();

      const decision = evaluateTradeDecision(signal, account, DEFAULT_RISK_CONFIG, 10);

      expect(decision.approved).toBe(false);
      expect(decision.rejection_reasons).toContain("Low confidence");
    });

    it("should reject when spread is too wide", () => {
      const signal = createMockSignal();
      const account = createMockAccount();

      const decision = evaluateTradeDecision(signal, account, DEFAULT_RISK_CONFIG, 50);

      expect(decision.approved).toBe(false);
      expect(decision.rejection_reasons).toContain("Spread too wide");
    });

    it("should reject when max concurrent trades reached", () => {
      const signal = createMockSignal();
      const account = createMockAccount({ open_positions: 5 });

      const decision = evaluateTradeDecision(signal, account, DEFAULT_RISK_CONFIG, 10);

      expect(decision.approved).toBe(false);
      expect(decision.rejection_reasons).toContain("Max concurrent trades");
    });

    it("should reject when daily loss limit reached", () => {
      const signal = createMockSignal();
      const account = createMockAccount({
        balance: 10000,
        daily_pnl: -500, // 5% loss
      });

      const decision = evaluateTradeDecision(signal, account, DEFAULT_RISK_CONFIG, 10);

      expect(decision.approved).toBe(false);
      expect(decision.rejection_reasons).toContain("Daily loss limit");
    });

    it("should reject when drawdown kill switch triggered", () => {
      const signal = createMockSignal();
      const account = createMockAccount({
        equity: 9000,
        peak_equity: 10000, // 10% drawdown
      });

      const decision = evaluateTradeDecision(signal, account, DEFAULT_RISK_CONFIG, 10);

      expect(decision.approved).toBe(false);
      expect(decision.rejection_reasons).toContain("DRAWDOWN KILL SWITCH");
    });

    it("should reject during cooldown period", () => {
      const signal = createMockSignal();
      const account = createMockAccount({
        last_trade_time: Date.now() - 60000, // 1 minute ago
      });

      const decision = evaluateTradeDecision(signal, account, DEFAULT_RISK_CONFIG, 10);

      expect(decision.approved).toBe(false);
      expect(decision.rejection_reasons).toContain("Cooldown");
    });

    it("should approve valid trade in paper mode", () => {
      const signal = createMockSignal();
      const account = createMockAccount();
      const config = { ...DEFAULT_RISK_CONFIG, mode: "paper" as const };

      const decision = evaluateTradeDecision(signal, account, config, 10);

      expect(decision.approved).toBe(true);
      expect(decision.decision).toBe("paper_trade");
      expect(decision.direction).toBe("buy");
      expect(decision.sl).toBeDefined();
      expect(decision.tp).toBeDefined();
      expect(decision.volume).toBeGreaterThan(0);
    });

    it("should approve valid trade in live mode", () => {
      const signal = createMockSignal();
      const account = createMockAccount();
      const config = { ...DEFAULT_RISK_CONFIG, mode: "live" as const, live_enabled: true };

      const decision = evaluateTradeDecision(signal, account, config, 10);

      expect(decision.approved).toBe(true);
      expect(decision.decision).toBe("live_trade");
    });

    it("should correctly identify sell direction for bearish signals", () => {
      const signal = createMockSignal({
        state: "strong_bearish",
        master_score: -50,
      });
      const account = createMockAccount();
      const config = { ...DEFAULT_RISK_CONFIG, mode: "paper" as const };

      const decision = evaluateTradeDecision(signal, account, config, 10);

      expect(decision.direction).toBe("sell");
    });
  });

  describe("executePaperTrade", () => {
    it("should return null for non-approved decisions", () => {
      const signal = createMockSignal();
      const account = createMockAccount();
      const config = { ...DEFAULT_RISK_CONFIG, mode: "disabled" as const };
      const decision = evaluateTradeDecision(signal, account, config, 10);

      const result = executePaperTrade(decision);

      expect(result).toBeNull();
    });

    it("should create trade record for approved paper trades", () => {
      const signal = createMockSignal();
      const account = createMockAccount();
      const config = { ...DEFAULT_RISK_CONFIG, mode: "paper" as const };
      const decision = evaluateTradeDecision(signal, account, config, 10);

      const result = executePaperTrade(decision);

      expect(result).not.toBeNull();
      expect(result?.status).toBe("filled");
      expect(result?.mode).toBe("paper");
      expect(result?.direction).toBe("buy");
      expect(result?.lifecycle).toHaveLength(3);
    });
  });

  describe("buildTradeInstruction", () => {
    it("should return null for non-live trades", () => {
      const signal = createMockSignal();
      const account = createMockAccount();
      const config = { ...DEFAULT_RISK_CONFIG, mode: "paper" as const };
      const decision = evaluateTradeDecision(signal, account, config, 10);

      const result = buildTradeInstruction(decision);

      expect(result).toBeNull();
    });

    it("should create instruction for live trades", () => {
      const signal = createMockSignal();
      const account = createMockAccount();
      const config = { ...DEFAULT_RISK_CONFIG, mode: "live" as const, live_enabled: true };
      const decision = evaluateTradeDecision(signal, account, config, 10);

      const result = buildTradeInstruction(decision);

      expect(result).not.toBeNull();
      expect(result?.action).toBe("open");
      expect(result?.direction).toBe("buy");
      expect(result?.sl).toBeDefined();
      expect(result?.tp).toBeDefined();
    });
  });

  describe("updatePaperTrades", () => {
    it("should update P&L for open trades", () => {
      const trades: TradeRecord[] = [
        {
          order_id: "TEST-001",
          timestamp: new Date().toISOString(),
          symbol: "XAUUSD",
          direction: "buy",
          volume: 0.1,
          entry_price: 2000,
          sl: 1995,
          tp: 2010,
          status: "filled",
          mode: "paper",
          signal_score: 50,
          signal_state: "strong_bullish",
          risk_pct: 1,
          fill_price: 2000,
          fill_time: new Date().toISOString(),
          lifecycle: [],
        },
      ];

      const updated = updatePaperTrades(trades, 2005);

      expect(updated[0].profit).toBe(50); // (2005 - 2000) * 0.1 * 100
    });

    it("should trigger SL for buy trade", () => {
      const trades: TradeRecord[] = [
        {
          order_id: "TEST-001",
          timestamp: new Date().toISOString(),
          symbol: "XAUUSD",
          direction: "buy",
          volume: 0.1,
          entry_price: 2000,
          sl: 1995,
          tp: 2010,
          status: "filled",
          mode: "paper",
          signal_score: 50,
          signal_state: "strong_bullish",
          risk_pct: 1,
          fill_price: 2000,
          fill_time: new Date().toISOString(),
          lifecycle: [],
        },
      ];

      const updated = updatePaperTrades(trades, 1990);

      expect(updated[0].status).toBe("sl_hit");
      expect(updated[0].close_reason).toBe("SL hit");
    });

    it("should trigger TP for buy trade", () => {
      const trades: TradeRecord[] = [
        {
          order_id: "TEST-001",
          timestamp: new Date().toISOString(),
          symbol: "XAUUSD",
          direction: "buy",
          volume: 0.1,
          entry_price: 2000,
          sl: 1995,
          tp: 2010,
          status: "filled",
          mode: "paper",
          signal_score: 50,
          signal_state: "strong_bullish",
          risk_pct: 1,
          fill_price: 2000,
          fill_time: new Date().toISOString(),
          lifecycle: [],
        },
      ];

      const updated = updatePaperTrades(trades, 2015);

      expect(updated[0].status).toBe("tp_hit");
      expect(updated[0].close_reason).toBe("TP hit");
    });

    it("should not modify non-paper trades", () => {
      const trades: TradeRecord[] = [
        {
          order_id: "TEST-001",
          timestamp: new Date().toISOString(),
          symbol: "XAUUSD",
          direction: "buy",
          volume: 0.1,
          entry_price: 2000,
          sl: 1995,
          tp: 2010,
          status: "filled",
          mode: "live",
          signal_score: 50,
          signal_state: "strong_bullish",
          risk_pct: 1,
          fill_price: 2000,
          fill_time: new Date().toISOString(),
          lifecycle: [],
        },
      ];

      const updated = updatePaperTrades(trades, 2015);

      expect(updated[0].status).toBe("filled");
    });
  });
});
