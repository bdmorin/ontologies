/**
 * Agent definition loading and management.
 *
 * Loads agent configs from TypeScript files in the agents/ directory.
 * Each file exports a default AgentConfig object.
 */

import type { AgentConfig } from "../runner/types.js";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Load all agent definitions from a directory.
 * Each .ts file must export a default AgentConfig.
 */
export async function loadAgents(dirPath: string): Promise<AgentConfig[]> {
  const absDir = resolve(dirPath);
  const files = readdirSync(absDir).filter((f) => f.endsWith(".ts"));
  const agents: AgentConfig[] = [];

  for (const file of files) {
    const modulePath = join(absDir, file);
    try {
      const mod = await import(modulePath);
      const config = mod.default as AgentConfig;
      if (!config?.name || !config?.systemPrompt) {
        console.warn(
          `[Registry] Skipping ${file}: missing required fields (name, systemPrompt)`,
        );
        continue;
      }
      agents.push(config);
      console.log(`[Registry] Loaded agent: ${config.name} (${config.role})`);
    } catch (err) {
      console.error(`[Registry] Failed to load ${file}:`, err);
    }
  }

  return agents;
}

/**
 * Validate an agent config has all required fields.
 */
export function validateAgentConfig(config: unknown): config is AgentConfig {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;
  return (
    typeof c.name === "string" &&
    typeof c.role === "string" &&
    typeof c.model === "string" &&
    typeof c.systemPrompt === "string" &&
    typeof c.triggers === "object" &&
    typeof c.energy === "object" &&
    typeof c.boredom === "object"
  );
}
