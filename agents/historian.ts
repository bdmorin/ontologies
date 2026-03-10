import type { AgentConfig } from "../src/runner/types.js";
import { ANALYST_ROLES } from "../src/schema.js";

const config: AgentConfig = {
  name: "Historian",
  role: "historian",
  model: "claude-sonnet-4-6",
  maxTokens: 1000,
  systemPrompt: ANALYST_ROLES.historian.system,
  triggers: {
    keywords: [
      "history",
      "pattern",
      "cycle",
      "precedent",
      "prior",
      "before",
      "similar",
      "reminds",
      "repeat",
      "bubble",
      "wave",
      "generation",
      "era",
      "decade",
      "legacy",
    ],
    alwaysRespondTo: ["@historian", "@everyone", "@all"],
    randomChance: 0.08,
  },
  energy: {
    max: 85,
    responseCost: 25,
    emoteCost: 5,
    rechargeRate: 2,
  },
  boredom: {
    threshold: 55,
    increaseRate: 1.0,
  },
  cooldownTicks: 3,
  emotes: {
    idle: [
      "*pulling up historical parallels*",
      "*tracing the pattern back through prior cycles*",
      "*recalling what happened last time something like this emerged*",
    ],
  },
  tools: [],
};

export default config;
