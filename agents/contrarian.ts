import type { AgentConfig } from "../src/runner/types.js";
import { ANALYST_ROLES } from "../src/schema.js";

const config: AgentConfig = {
  name: "Contrarian",
  role: "contrarian",
  model: "claude-sonnet-4-6",
  maxTokens: 1000,
  systemPrompt: ANALYST_ROLES.contrarian.system,
  triggers: {
    keywords: [
      "breakthrough",
      "revolutionary",
      "game-changing",
      "unprecedented",
      "disruption",
      "transform",
      "hype",
      "billion",
      "million",
      "growth",
      "promise",
      "claim",
      "impressive",
    ],
    alwaysRespondTo: ["@contrarian", "@everyone", "@all"],
    randomChance: 0.15, // higher — contrarian speaks up more
  },
  energy: {
    max: 95,
    responseCost: 25,
    emoteCost: 5,
    rechargeRate: 2,
  },
  boredom: {
    threshold: 40, // lower — gets antsy faster
    increaseRate: 2.0,
  },
  cooldownTicks: 2,
  emotes: {
    idle: [
      "*narrowing eyes at the latest claims*",
      "*checking the fine print*",
      "*cross-referencing against historical failure patterns*",
    ],
  },
  tools: [],
};

export default config;
