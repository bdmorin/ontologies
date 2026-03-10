/**
 * Zero-cost relevance evaluation — pure string matching, no API calls.
 *
 * Determines how relevant an incoming message is to an agent based on
 * trigger words, direct mentions, and random chance.
 *
 * Ported from fsm-agents/src/core/relevance.ts.
 */

import type { AgentConfig, RelevanceLevel } from "./types.js";

export function evaluateRelevance(
  message: string,
  from: string,
  config: AgentConfig,
): RelevanceLevel {
  const lower = message.toLowerCase();

  // 1. Always-respond triggers (exact substring, case-insensitive)
  for (const trigger of config.triggers.alwaysRespondTo) {
    if (lower.includes(trigger.toLowerCase())) {
      return "HIGH";
    }
  }

  // 2. Direct @mention of the agent name
  const mentionPattern = "@" + config.name.toLowerCase();
  if (lower.includes(mentionPattern)) {
    return "HIGH";
  }

  // 3. Keyword triggers (word-boundary aware, case-insensitive)
  for (const keyword of config.triggers.keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(message)) {
      return "MEDIUM";
    }
  }

  // 4. Random chance roll
  if (Math.random() < config.triggers.randomChance) {
    return "LOW";
  }

  // 5. Not relevant
  return "NONE";
}
