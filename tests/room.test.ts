/**
 * Room orchestration tests.
 *
 * Tests the Room's tick processing, agent management, task queue,
 * and FSM evaluation integration. Uses manual tick() calls to avoid
 * timing dependencies.
 *
 * Only external I/O is mocked (response handler simulates agent SDK).
 */

import { describe, it, expect } from "bun:test";
import { Room } from "../src/runner/room.js";
import type { AgentConfig, RoomMessage } from "../src/runner/types.js";

function makeAgentConfig(name: string, overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    name,
    role: "technologist",
    model: "claude-sonnet-4-6",
    maxTokens: 500,
    systemPrompt: "Test agent.",
    triggers: {
      keywords: ["architecture", "test"],
      alwaysRespondTo: ["@everyone"],
      randomChance: 0,
    },
    energy: {
      max: 100,
      responseCost: 30,
      emoteCost: 5,
      rechargeRate: 2,
    },
    boredom: {
      threshold: 1000, // very high — won't trigger during tests
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

describe("Room", () => {
  describe("agent management", () => {
    it("adds agents and retrieves them", () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 5000,
        maxMessages: 100,
      });

      room.addAgent(makeAgentConfig("Agent1"));
      room.addAgent(makeAgentConfig("Agent2"));

      expect(room.getAgents().size).toBe(2);
      expect(room.getAgent("Agent1")).toBeDefined();
      expect(room.getAgent("Agent2")).toBeDefined();
      expect(room.getAgent("NoSuchAgent")).toBeUndefined();
    });

    it("initializes agents with correct state", () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 5000,
        maxMessages: 100,
      });

      const config = makeAgentConfig("TestAgent");
      room.addAgent(config);

      const agent = room.getAgent("TestAgent")!;
      expect(agent.state.fsm).toBe("IDLE");
      expect(agent.state.energy).toBe(config.energy.max);
      expect(agent.state.boredom).toBe(0);
      expect(agent.state.mood).toBe(0);
      expect(agent.state.cooldownRemaining).toBe(0);
    });
  });

  describe("message management", () => {
    it("adds messages and retrieves them", () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 5000,
        maxMessages: 100,
      });

      const msg: RoomMessage = {
        id: "msg-1",
        type: "system",
        from: "System",
        content: "Hello world",
        timestamp: Date.now(),
      };

      room.addMessage(msg);
      expect(room.getMessages()).toHaveLength(1);
      expect(room.getMessages()[0].content).toBe("Hello world");
    });

    it("trims messages beyond maxMessages", () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 5000,
        maxMessages: 3,
      });

      for (let i = 0; i < 5; i++) {
        room.addMessage({
          id: `msg-${i}`,
          type: "system",
          from: "System",
          content: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const messages = room.getMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe("Message 2");
      expect(messages[2].content).toBe("Message 4");
    });
  });

  describe("tick processing", () => {
    it("recharges energy on tick", async () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 5000,
        maxMessages: 100,
      });

      const config = makeAgentConfig("TestAgent");
      room.addAgent(config);

      // Drain some energy
      const agent = room.getAgent("TestAgent")!;
      agent.state.energy = 50;

      await room.tick();

      expect(agent.state.energy).toBe(52); // +2 recharge
    });

    it("increases boredom on tick", async () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 5000,
        maxMessages: 100,
      });

      room.addAgent(makeAgentConfig("TestAgent"));
      const agent = room.getAgent("TestAgent")!;

      await room.tick();

      expect(agent.state.boredom).toBe(1.5); // increaseRate = 1.5
    });
  });

  describe("task queue", () => {
    it("queues tasks and reports queue depth", () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 5000,
        maxMessages: 100,
      });

      room.submitTask({
        id: "task-1",
        topic: "Test Topic",
        sourceMaterial: "Some source material",
        status: "queued",
        submittedAt: Date.now(),
      });

      expect(room.getTaskQueue()).toHaveLength(1);
    });

    it("activates task on tick when no active task", async () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 5000,
        maxMessages: 100,
      });

      room.addAgent(makeAgentConfig("TestAgent"));

      // Mock the response handler (external I/O)
      room.onNeedResponse(async () => {
        return '{"analysis": "test"}';
      });

      room.submitTask({
        id: "task-1",
        topic: "Test Topic",
        sourceMaterial: "Analyze this.",
        status: "queued",
        submittedAt: Date.now(),
      });

      await room.tick();

      // Task should be activated — check via messages (task message injected)
      const messages = room.getMessages();
      const taskMsg = messages.find((m) => m.type === "task");
      expect(taskMsg).toBeDefined();
      expect(taskMsg!.content).toContain("Test Topic");
    });
  });

  describe("status reporting", () => {
    it("reports comprehensive status", () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 5000,
        maxMessages: 100,
      });

      room.addAgent(makeAgentConfig("Agent1"));
      room.addAgent(makeAgentConfig("Agent2"));

      const status = room.getStatus();
      expect(status.running).toBe(false);
      expect(status.agentCount).toBe(2);
      expect(status.queueDepth).toBe(0);
      expect(status.activeTask).toBeNull();
      expect(status.agents.Agent1).toBeDefined();
      expect(status.agents.Agent2).toBeDefined();
    });
  });

  describe("lifecycle", () => {
    it("starts and stops cleanly", () => {
      const room = new Room({
        name: "Test Room",
        tickRate: 60000, // very long tick to avoid actual ticks
        maxMessages: 100,
      });

      room.addAgent(makeAgentConfig("TestAgent"));

      expect(room.isRunning()).toBe(false);
      room.start();
      expect(room.isRunning()).toBe(true);
      room.stop();
      expect(room.isRunning()).toBe(false);
    });
  });
});
