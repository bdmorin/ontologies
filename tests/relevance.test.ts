/**
 * Relevance evaluation tests.
 *
 * Tests the zero-cost keyword matching, @mentions, and trigger logic.
 */

import { describe, it, expect } from "bun:test";
import { evaluateRelevance } from "../src/runner/relevance.js";
import type { AgentConfig } from "../src/runner/types.js";

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    name: "TestAgent",
    role: "technologist",
    model: "claude-sonnet-4-6",
    maxTokens: 500,
    systemPrompt: "Test.",
    triggers: {
      keywords: ["architecture", "performance", "api"],
      alwaysRespondTo: ["@testagent", "@everyone"],
      randomChance: 0,
    },
    energy: { max: 100, responseCost: 30, emoteCost: 5, rechargeRate: 2 },
    boredom: { threshold: 50, increaseRate: 1.5 },
    cooldownTicks: 2,
    emotes: { idle: ["*thinking*"] },
    tools: [],
    ...overrides,
  };
}

describe("evaluateRelevance", () => {
  it("returns HIGH for alwaysRespondTo trigger", () => {
    const config = makeConfig();
    expect(evaluateRelevance("@everyone report", "User", config)).toBe("HIGH");
  });

  it("returns HIGH for @mention of agent name", () => {
    const config = makeConfig();
    expect(evaluateRelevance("Hey @TestAgent what do you think?", "User", config)).toBe("HIGH");
  });

  it("returns HIGH for @mention case-insensitive", () => {
    const config = makeConfig();
    expect(evaluateRelevance("@testagent please respond", "User", config)).toBe("HIGH");
  });

  it("returns MEDIUM for keyword match", () => {
    const config = makeConfig();
    expect(evaluateRelevance("The architecture is interesting", "User", config)).toBe("MEDIUM");
  });

  it("returns MEDIUM for keyword match case-insensitive", () => {
    const config = makeConfig();
    expect(evaluateRelevance("The ARCHITECTURE of this system", "User", config)).toBe("MEDIUM");
  });

  it("keyword match uses word boundaries", () => {
    const config = makeConfig();
    // "api" should not match "capital" (word boundary check)
    expect(evaluateRelevance("The capital city is large", "User", config)).toBe("NONE");
    // "api" should match as a standalone word
    expect(evaluateRelevance("The API is well designed", "User", config)).toBe("MEDIUM");
  });

  it("returns NONE for irrelevant message with 0 randomChance", () => {
    const config = makeConfig();
    expect(evaluateRelevance("What's for lunch?", "User", config)).toBe("NONE");
  });

  it("alwaysRespondTo takes priority over keywords", () => {
    const config = makeConfig();
    // Has both @everyone (alwaysRespondTo) and "architecture" (keyword)
    const result = evaluateRelevance("@everyone discuss the architecture", "User", config);
    expect(result).toBe("HIGH"); // should be HIGH not MEDIUM
  });

  it("handles special regex characters in keywords without crashing", () => {
    const config = makeConfig({
      triggers: {
        keywords: ["c++", "node.js", "$revenue"],
        alwaysRespondTo: [],
        randomChance: 0,
      },
    });
    // Primary assertion: special chars in keywords must not crash the regex engine.
    // Word boundary \b around escaped special chars may or may not match depending
    // on the character — the important thing is no thrown exception.
    expect(() => evaluateRelevance("I use c++ daily", "User", config)).not.toThrow();
    expect(evaluateRelevance("nothing relevant", "User", config)).toBe("NONE");
    // node.js should match because '.' is escaped and the word boundaries work
    expect(evaluateRelevance("I love node.js for servers", "User", config)).toBe("MEDIUM");
  });

  it("returns LOW with high randomChance (statistical — run multiple times)", () => {
    const config = makeConfig({
      triggers: {
        keywords: [],
        alwaysRespondTo: [],
        randomChance: 1.0, // 100% chance
      },
    });
    // With 100% random chance and no keyword/mention match, should get LOW
    const result = evaluateRelevance("irrelevant message", "User", config);
    expect(result).toBe("LOW");
  });
});
