/**
 * FSM evaluation tests.
 *
 * Tests the pure deterministic FSM logic — state transitions, energy
 * checks, cooldown handling, tick state updates.
 * No mocks — all internal modules exercised directly.
 */

import { describe, it, expect } from "bun:test";
import { evaluateFSM, tickState } from "../src/runner/fsm.js";
import type { AgentConfig, AgentState, EngineEvent } from "../src/runner/types.js";

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    name: "TestAgent",
    role: "technologist",
    model: "claude-sonnet-4-6",
    maxTokens: 500,
    systemPrompt: "You are a test agent.",
    triggers: {
      keywords: ["architecture", "performance"],
      alwaysRespondTo: ["@testagent", "@everyone"],
      randomChance: 0,
    },
    energy: {
      max: 100,
      responseCost: 30,
      emoteCost: 5,
      rechargeRate: 2,
    },
    boredom: {
      threshold: 50,
      increaseRate: 1.5,
    },
    cooldownTicks: 2,
    emotes: {
      idle: ["*thinking*"],
    },
    tools: [],
    ...overrides,
  };
}

function makeState(overrides?: Partial<AgentState>): AgentState {
  return {
    fsm: "IDLE",
    energy: 100,
    boredom: 0,
    mood: 0,
    cooldownRemaining: 0,
    lastSpoke: 0,
    ...overrides,
  };
}

describe("evaluateFSM", () => {
  describe("IDLE state", () => {
    it("transitions to RESPONDING on keyword match with energy", () => {
      const config = makeConfig();
      const state = makeState();
      const event: EngineEvent = {
        type: "message",
        from: "User",
        content: "What about the architecture of this system?",
        timestamp: Date.now(),
      };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("RESPONDING");
      expect(transition.action).toBe("respond");
    });

    it("transitions to EMOTING on keyword match without energy", () => {
      const config = makeConfig();
      const state = makeState({ energy: 5 }); // below responseCost of 30
      const event: EngineEvent = {
        type: "message",
        from: "User",
        content: "Let's discuss the architecture.",
        timestamp: Date.now(),
      };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("EMOTING");
      expect(transition.action).toBe("emote");
    });

    it("transitions to RESPONDING on alwaysRespondTo trigger", () => {
      const config = makeConfig();
      const state = makeState();
      const event: EngineEvent = {
        type: "message",
        from: "User",
        content: "@everyone Report!",
        timestamp: Date.now(),
      };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("RESPONDING");
      expect(transition.action).toBe("respond");
    });

    it("stays IDLE on irrelevant message with 0 randomChance", () => {
      const config = makeConfig({ triggers: { keywords: ["architecture"], alwaysRespondTo: [], randomChance: 0 } });
      const state = makeState();
      const event: EngineEvent = {
        type: "message",
        from: "User",
        content: "What's for lunch?",
        timestamp: Date.now(),
      };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("IDLE");
    });

    it("transitions to RESPONDING on boredom threshold exceeded", () => {
      const config = makeConfig();
      const state = makeState({ boredom: 55 }); // above threshold of 50
      const event: EngineEvent = {
        type: "tick",
        tickNumber: 1,
        timestamp: Date.now(),
      };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("RESPONDING");
      expect(transition.action).toBe("initiate");
    });

    it("does not initiate on boredom if no energy", () => {
      const config = makeConfig();
      const state = makeState({ boredom: 55, energy: 5 });
      const event: EngineEvent = {
        type: "tick",
        tickNumber: 1,
        timestamp: Date.now(),
      };

      const transition = evaluateFSM(event, state, config);
      // Should stay IDLE or emote, but not RESPONDING
      expect(transition.nextState).not.toBe("RESPONDING");
    });

    it("transitions to RESPONDING on task event with energy", () => {
      const config = makeConfig();
      const state = makeState();
      const event: EngineEvent = {
        type: "task",
        taskId: "t-123",
        content: "Analyze this completely unrelated topic",
        timestamp: Date.now(),
      };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("RESPONDING");
      expect(transition.action).toBe("respond");
    });

    it("stays IDLE on task event without energy", () => {
      const config = makeConfig();
      const state = makeState({ energy: 5 });
      const event: EngineEvent = {
        type: "task",
        taskId: "t-123",
        content: "Analyze this",
        timestamp: Date.now(),
      };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("IDLE");
    });

    it("transitions to RESPONDING on scene event (NMI, bypasses energy)", () => {
      const config = makeConfig();
      const state = makeState({ energy: 0 }); // no energy, doesn't matter
      const event: EngineEvent = {
        type: "scene",
        content: "*A new development emerges*",
        timestamp: Date.now(),
      };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("RESPONDING");
      expect(transition.action).toBe("respond");
    });
  });

  describe("RESPONDING state", () => {
    it("stays in RESPONDING regardless of events", () => {
      const config = makeConfig();
      const state = makeState({ fsm: "RESPONDING" });

      const tickEvent: EngineEvent = { type: "tick", tickNumber: 1, timestamp: Date.now() };
      const msgEvent: EngineEvent = { type: "message", from: "User", content: "@everyone", timestamp: Date.now() };

      expect(evaluateFSM(tickEvent, state, config).nextState).toBe("RESPONDING");
      expect(evaluateFSM(msgEvent, state, config).nextState).toBe("RESPONDING");
    });
  });

  describe("COOLDOWN state", () => {
    it("decrements cooldown on tick and stays in COOLDOWN", () => {
      const config = makeConfig();
      const state = makeState({ fsm: "COOLDOWN", cooldownRemaining: 2 });
      const event: EngineEvent = { type: "tick", tickNumber: 1, timestamp: Date.now() };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("COOLDOWN");
    });

    it("transitions to IDLE when cooldown reaches 0", () => {
      const config = makeConfig();
      const state = makeState({ fsm: "COOLDOWN", cooldownRemaining: 1 });
      const event: EngineEvent = { type: "tick", tickNumber: 1, timestamp: Date.now() };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("IDLE");
    });

    it("ignores non-tick events during cooldown", () => {
      const config = makeConfig();
      const state = makeState({ fsm: "COOLDOWN", cooldownRemaining: 5 });
      const event: EngineEvent = { type: "message", from: "User", content: "@everyone", timestamp: Date.now() };

      const transition = evaluateFSM(event, state, config);
      expect(transition.nextState).toBe("COOLDOWN");
    });
  });
});

describe("tickState", () => {
  it("recharges energy up to max", () => {
    const config = makeConfig();
    const state = makeState({ energy: 50 });

    const newState = tickState(state, config);
    expect(newState.energy).toBe(52); // rechargeRate = 2
  });

  it("does not exceed max energy", () => {
    const config = makeConfig();
    const state = makeState({ energy: 99 });

    const newState = tickState(state, config);
    expect(newState.energy).toBe(100); // capped at max
  });

  it("increases boredom", () => {
    const config = makeConfig();
    const state = makeState({ boredom: 10 });

    const newState = tickState(state, config);
    expect(newState.boredom).toBe(11.5); // increaseRate = 1.5
  });

  it("decrements cooldown toward zero", () => {
    const config = makeConfig();
    const state = makeState({ cooldownRemaining: 3 });

    const newState = tickState(state, config);
    expect(newState.cooldownRemaining).toBe(2);
  });

  it("does not go below zero cooldown", () => {
    const config = makeConfig();
    const state = makeState({ cooldownRemaining: 0 });

    const newState = tickState(state, config);
    expect(newState.cooldownRemaining).toBe(0);
  });

  it("decays mood toward zero", () => {
    const config = makeConfig();
    const state = makeState({ mood: 0.5 });

    const newState = tickState(state, config);
    expect(newState.mood).toBe(0.49); // decay step 0.01
  });

  it("decays negative mood toward zero", () => {
    const config = makeConfig();
    const state = makeState({ mood: -0.5 });

    const newState = tickState(state, config);
    expect(newState.mood).toBe(-0.49);
  });
});
