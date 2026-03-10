import type { AgentConfig } from "../src/runner/types.js";
import { ANALYST_ROLES } from "../src/schema.js";

const config: AgentConfig = {
  name: "Strategist",
  role: "strategist",
  model: "claude-sonnet-4-6",
  maxTokens: 1000,
  systemPrompt: ANALYST_ROLES.strategist.system,
  triggers: {
    keywords: [
      "market",
      "competitive",
      "adoption",
      "strategy",
      "positioning",
      "revenue",
      "growth",
      "enterprise",
      "startup",
      "disrupt",
      "moat",
      "platform",
      "ecosystem",
      "business",
      "industry",
    ],
    alwaysRespondTo: ["@strategist", "@everyone", "@all"],
    randomChance: 0.10,
  },
  energy: {
    max: 90,
    responseCost: 25,
    emoteCost: 5,
    rechargeRate: 2,
  },
  boredom: {
    threshold: 45,
    increaseRate: 1.5,
  },
  cooldownTicks: 3,
  emotes: {
    idle: [
      "*mapping out the competitive landscape*",
      "*considering second-order market effects*",
      "*evaluating the adoption curve dynamics*",
    ],
  },
  tools: [],
};

export default config;
