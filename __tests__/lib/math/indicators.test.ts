import {
  clamp,
  normalize,
  sigmoid,
  tanh100,
  ema,
  sma,
  rsi,
  macd,
  stochastic,
  williamsR,
  cci,
  roc,
  momentum,
  atr,
  bollingerBands,
  keltnerChannels,
  adx,
  supertrend,
  vwap,
  zScore,
} from "@/lib/math/indicators";

describe("Core Math Utilities", () => {
  describe("clamp", () => {
    it("should clamp value within range", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it("should handle edge cases", () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe("normalize", () => {
    it("should normalize to [-1, 1] range", () => {
      expect(normalize(50, 0, 100)).toBe(0);
      expect(normalize(0, 0, 100)).toBe(-1);
      expect(normalize(100, 0, 100)).toBe(1);
    });

    it("should handle equal min/max", () => {
      expect(normalize(50, 50, 50)).toBe(0);
    });
  });

  describe("sigmoid", () => {
    it("should return 0.5 for input 0", () => {
      expect(sigmoid(0)).toBe(0.5);
    });

    it("should return values between 0 and 1", () => {
      expect(sigmoid(100)).toBeLessThan(1);
      expect(sigmoid(100)).toBeGreaterThan(0);
      expect(sigmoid(-100)).toBeLessThan(1);
      expect(sigmoid(-100)).toBeGreaterThan(0);
    });
  });

  describe("tanh100", () => {
    it("should scale to [-100, 100] range", () => {
      expect(tanh100(0)).toBe(0);
      expect(tanh100(10)).toBeGreaterThan(0);
      expect(tanh100(10)).toBeLessThanOrEqual(100);
      expect(tanh100(-10)).toBeLessThan(0);
      expect(tanh100(-10)).toBeGreaterThanOrEqual(-100);
    });
  });
});

describe("Moving Averages", () => {
  describe("ema", () => {
    it("should return empty array for empty input", () => {
      expect(ema([], 14)).toEqual([]);
    });

    it("should compute EMA correctly", () => {
      const data = [10, 11, 12, 13, 14, 15];
      const result = ema(data, 3);
      expect(result.length).toBe(data.length);
      expect(result[0]).toBe(10);
      expect(result[result.length - 1]).toBeGreaterThan(13);
    });
  });

  describe("sma", () => {
    it("should compute simple moving average", () => {
      const data = [10, 20, 30, 40, 50];
      expect(sma(data, 5)).toBe(30);
    });

    it("should handle insufficient data", () => {
      const data = [10, 20];
      expect(sma(data, 5)).toBe(20);
    });
  });
});

describe("Momentum Indicators", () => {
  const closes = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111, 110, 112, 114, 113, 115];
  const highs = closes.map((c) => c + 1);
  const lows = closes.map((c) => c - 1);

  describe("rsi", () => {
    it("should return 50 for insufficient data", () => {
      expect(rsi([10, 11, 12], 14)).toBe(50);
    });

    it("should return value between 0 and 100", () => {
      const result = rsi(closes, 14);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });

    it("should return 100 for only gains", () => {
      const onlyUp = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      expect(rsi(onlyUp, 14)).toBe(100);
    });
  });

  describe("macd", () => {
    it("should compute MACD line, signal, and histogram", () => {
      const result = macd(closes);
      expect(result).toHaveProperty("line");
      expect(result).toHaveProperty("signal");
      expect(result).toHaveProperty("histogram");
    });
  });

  describe("stochastic", () => {
    it("should return default values for insufficient data", () => {
      const result = stochastic([10], [9], [10], 14);
      expect(result.k).toBe(50);
      expect(result.d).toBe(50);
    });

    it("should return values between 0 and 100", () => {
      const result = stochastic(highs, lows, closes, 14);
      expect(result.k).toBeGreaterThanOrEqual(0);
      expect(result.k).toBeLessThanOrEqual(100);
      expect(result.d).toBeGreaterThanOrEqual(0);
      expect(result.d).toBeLessThanOrEqual(100);
    });
  });

  describe("williamsR", () => {
    it("should return -50 for insufficient data", () => {
      expect(williamsR([10], [9], [10], 14)).toBe(-50);
    });

    it("should return value between -100 and 0", () => {
      const result = williamsR(highs, lows, closes, 14);
      expect(result).toBeGreaterThanOrEqual(-100);
      expect(result).toBeLessThanOrEqual(0);
    });
  });

  describe("cci", () => {
    it("should return 0 for insufficient data", () => {
      expect(cci([10], [9], [10], 20)).toBe(0);
    });

    it("should compute CCI value", () => {
      const extendedCloses = [...closes, ...closes];
      const extendedHighs = [...highs, ...highs];
      const extendedLows = [...lows, ...lows];
      const result = cci(extendedHighs, extendedLows, extendedCloses, 20);
      expect(typeof result).toBe("number");
    });
  });

  describe("roc", () => {
    it("should return 0 for insufficient data", () => {
      expect(roc([10, 11], 5)).toBe(0);
    });

    it("should compute rate of change percentage", () => {
      const data = [100, 101, 102, 103, 104, 110];
      const result = roc(data, 5);
      expect(result).toBe(10); // (110 - 100) / 100 * 100
    });
  });

  describe("momentum", () => {
    it("should return 0 for insufficient data", () => {
      expect(momentum([10, 11], 10)).toBe(0);
    });

    it("should compute price difference", () => {
      const data = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 115];
      const result = momentum(data, 10);
      expect(result).toBe(15);
    });
  });
});

describe("Volatility Indicators", () => {
  const closes = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111, 110, 112, 114, 113, 115];
  const highs = closes.map((c) => c + 2);
  const lows = closes.map((c) => c - 2);

  describe("atr", () => {
    it("should return 1 for insufficient data", () => {
      expect(atr([10], [9], [10])).toBe(1);
    });

    it("should compute ATR value", () => {
      const result = atr(highs, lows, closes, 14);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("bollingerBands", () => {
    it("should handle insufficient data", () => {
      const result = bollingerBands([10, 11, 12], 20);
      expect(result.middle).toBe(12);
    });

    it("should compute bands correctly", () => {
      const data = Array(30).fill(0).map((_, i) => 100 + i);
      const result = bollingerBands(data, 20);
      expect(result.upper).toBeGreaterThan(result.middle);
      expect(result.lower).toBeLessThan(result.middle);
      expect(result.percentB).toBeGreaterThanOrEqual(0);
      expect(result.percentB).toBeLessThanOrEqual(1);
    });
  });

  describe("keltnerChannels", () => {
    it("should compute channels", () => {
      const result = keltnerChannels(highs, lows, closes, 14);
      expect(result.upper).toBeGreaterThan(result.middle);
      expect(result.lower).toBeLessThan(result.middle);
    });
  });
});

describe("Trend Indicators", () => {
  const closes = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111, 110, 112, 114, 113, 115];
  const highs = closes.map((c) => c + 2);
  const lows = closes.map((c) => c - 2);

  describe("adx", () => {
    it("should return default values for insufficient data", () => {
      const result = adx([10], [9], [10], 14);
      expect(result.adx).toBe(20);
    });

    it("should compute ADX values", () => {
      const result = adx(highs, lows, closes, 14);
      expect(result.adx).toBeGreaterThanOrEqual(0);
      expect(result.adx).toBeLessThanOrEqual(100);
    });
  });

  describe("supertrend", () => {
    it("should return direction value", () => {
      const result = supertrend(highs, lows, closes, 10, 3);
      expect(result.direction).toBeOneOf([1, -1, 0]);
    });
  });
});

describe("Structure Indicators", () => {
  const closes = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111, 110, 112, 114, 113, 115];
  const highs = closes.map((c) => c + 2);
  const lows = closes.map((c) => c - 2);
  const volumes = closes.map(() => 1000);

  describe("vwap", () => {
    it("should compute VWAP", () => {
      const result = vwap(highs, lows, closes, volumes);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("zScore", () => {
    it("should return 0 for insufficient data", () => {
      expect(zScore([10, 11], 20)).toBe(0);
    });

    it("should compute z-score", () => {
      const data = Array(25).fill(0).map((_, i) => 100 + i);
      const result = zScore(data, 20);
      expect(typeof result).toBe("number");
    });
  });
});

// Custom matcher
expect.extend({
  toBeOneOf(received: unknown, expected: unknown[]) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(", ")}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(", ")}`,
        pass: false,
      };
    }
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: unknown[]): R;
    }
  }
}
