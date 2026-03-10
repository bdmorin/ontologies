/**
 * Dynamic tick rate calculator tests.
 */

import { describe, it, expect } from "bun:test";
import {
  calculateTickRate,
  estimateComplexity,
  DEFAULT_TICK_CONFIG,
} from "../src/runner/tick.js";

describe("calculateTickRate", () => {
  it("returns baseTick with no agents and no complexity", () => {
    const rate = calculateTickRate(0, 0);
    expect(rate).toBe(DEFAULT_TICK_CONFIG.baseTick);
  });

  it("increases with more agents", () => {
    const rate0 = calculateTickRate(0, 0);
    const rate2 = calculateTickRate(2, 0);
    const rate4 = calculateTickRate(4, 0);

    expect(rate2).toBeGreaterThan(rate0);
    expect(rate4).toBeGreaterThan(rate2);
  });

  it("increases with higher complexity", () => {
    const rateLow = calculateTickRate(2, 0.1);
    const rateHigh = calculateTickRate(2, 0.9);

    expect(rateHigh).toBeGreaterThan(rateLow);
  });

  it("respects minimum tick", () => {
    const rate = calculateTickRate(0, 0, {
      ...DEFAULT_TICK_CONFIG,
      baseTick: 100,
      minTick: 3000,
    });
    expect(rate).toBe(3000);
  });

  it("respects maximum tick", () => {
    const rate = calculateTickRate(100, 1, {
      ...DEFAULT_TICK_CONFIG,
      maxTick: 30000,
    });
    expect(rate).toBe(30000);
  });

  it("clamps complexity to 0-1", () => {
    const rateNeg = calculateTickRate(2, -5);
    const rateZero = calculateTickRate(2, 0);
    const rateOver = calculateTickRate(2, 10);
    const rateOne = calculateTickRate(2, 1);

    expect(rateNeg).toBe(rateZero);
    expect(rateOver).toBe(rateOne);
  });

  it("returns an integer", () => {
    const rate = calculateTickRate(3, 0.7);
    expect(rate).toBe(Math.round(rate));
  });
});

describe("estimateComplexity", () => {
  it("returns 0 for empty input", () => {
    expect(estimateComplexity("")).toBe(0);
  });

  it("returns low complexity for short, simple text", () => {
    const score = estimateComplexity("Hello world.");
    expect(score).toBeLessThan(0.3);
  });

  it("returns higher complexity for technical text", () => {
    const simple = estimateComplexity("The cat sat on the mat.");
    const technical = estimateComplexity(
      "The API architecture uses a distributed protocol with infrastructure " +
        "running at https://example.com/api/v2. Performance metrics show 99.9% " +
        "uptime across 3.5 million requests per second. The SDK handles 12.4 " +
        "billion events with architecture version 2.1.0.",
    );

    expect(technical).toBeGreaterThan(simple);
  });

  it("returns values between 0 and 1", () => {
    const scores = [
      estimateComplexity("short"),
      estimateComplexity("a".repeat(100000)),
      estimateComplexity(
        "https://example.com API SDK protocol architecture 1.2.3 million billion percent",
      ),
    ];

    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
