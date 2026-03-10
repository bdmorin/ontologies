import type { AgentConfig } from "../src/runner/types.js";
import { ANALYST_ROLES } from "../src/schema.js";

const config: AgentConfig = {
  name: "Technologist",
  role: "technologist",
  model: "claude-sonnet-4-6",
  maxTokens: 1000,
  systemPrompt: ANALYST_ROLES.technologist.system,
  triggers: {
    keywords: [
      "architecture",
      "implementation",
      "performance",
      "latency",
      "throughput",
      "api",
      "sdk",
      "protocol",
      "infrastructure",
      "technical",
      "system",
      "database",
      "cache",
      "compute",
      "deploy",
      "scale",
    ],
    alwaysRespondTo: ["@technologist", "@everyone", "@all"],
    randomChance: 0.12,
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
  cooldownTicks: 3,
  emotes: {
    idle: [
      "*reviewing the technical architecture diagrams*",
      "*running through the performance implications*",
      "*checking the implementation details against known patterns*",
    ],
  },
  tools: [], // all available
};

export default config;
