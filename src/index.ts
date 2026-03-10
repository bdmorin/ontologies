/**
 * Ontologies Runner — main entry point.
 *
 * Starts the FSM room, loads agents, creates MCP tools,
 * starts the HTTP API server, and runs the persistent tick loop.
 */

import { resolve } from "node:path";
import { Room } from "./runner/room.js";
import { loadAgents } from "./agents/registry.js";
import { createResearchServer } from "./agents/tools.js";
import { executeAgentResponse, type AgentRuntimeConfig } from "./agents/runtime.js";
import { EngramStore } from "./engram/store.js";
import { startServer } from "./api/server.js";
import type { Agent, RoomMessage, Task } from "./runner/types.js";
import roundtableScene from "../scenes/roundtable.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const AGENTS_DIR = resolve(import.meta.dirname, "..", "agents");
const ENGRAMS_DIR = resolve(import.meta.dirname, "..", "engrams");

async function main() {
  console.log("=== Ontologies Runner ===");
  console.log(`PID: ${process.pid}`);

  // 1. Initialize engram store
  const engramStore = new EngramStore(ENGRAMS_DIR);
  console.log(`[Engram] Store at ${ENGRAMS_DIR}`);

  // 2. Create the room with the roundtable scene
  const room = new Room(
    {
      name: "Ontologies Roundtable",
      tickRate: 5000,
      maxMessages: 200,
    },
    roundtableScene,
  );

  // 3. Load agent definitions
  const agentConfigs = await loadAgents(AGENTS_DIR);
  if (agentConfigs.length === 0) {
    console.error("[FATAL] No agents loaded. Check agents/ directory.");
    process.exit(1);
  }

  for (const config of agentConfigs) {
    room.addAgent(config);
  }
  console.log(`[Room] ${agentConfigs.length} agents loaded`);

  // 4. Create MCP research tools server
  const researchServer = createResearchServer();
  const runtimeConfig: AgentRuntimeConfig = {
    mcpServers: { "ontologies-research": researchServer },
    maxTurns: 10,
    timeoutMs: 120_000,
  };

  // 5. Wire the response handler — bridges FSM RESPONDING to Agent SDK query()
  room.onNeedResponse(
    async (agent: Agent, context: RoomMessage[], task: Task | null) => {
      const response = await executeAgentResponse(
        agent,
        context,
        task,
        runtimeConfig,
      );
      return response.raw;
    },
  );

  // 6. Wire task completion to engram store
  room.on("taskComplete", (task: unknown, responses: unknown) => {
    const t = task as Task;
    const r = responses as Map<string, string>;

    try {
      const agentAnalyses: Record<string, unknown> = {};
      for (const [name, text] of r) {
        agentAnalyses[name] = text;
      }

      const engram = engramStore.store({
        tags: ["#ontologies", `#${t.topic.toLowerCase().replace(/\s+/g, "-")}`],
        title: `Analysis: ${t.topic}`,
        summary: `Multi-agent analysis of "${t.topic}" by ${r.size} agents.`,
        content: {
          topic: t.topic,
          agentAnalyses,
          sourceMaterial: t.sourceMaterial,
        },
        contentType: "multi-agent-analysis",
        provenance: {
          generatedAt: new Date().toISOString(),
          activity: "multi-agent",
          agents: [...r.keys()],
          derivedFrom: [],
          source: "api-task",
        },
        topicKey: t.topic.toLowerCase().replace(/\s+/g, "-"),
      });

      t.engramId = engram.id;
      console.log(`[Engram] Stored: ${engram.id} for task ${t.id}`);
    } catch (err) {
      console.error(`[Engram] Failed to store result for task ${t.id}:`, err);
    }
  });

  // 7. Start HTTP API server
  startServer(room, engramStore, {
    port: PORT,
    hostname: "0.0.0.0",
  });

  // 8. Start the tick loop
  room.start();

  // Add welcome message
  room.addMessage({
    id: crypto.randomUUID(),
    type: "system",
    from: "System",
    content: `Ontologies Roundtable initialized. ${agentConfigs.length} analysts present: ${agentConfigs.map((a) => a.name).join(", ")}. Submit tasks via POST /api/task.`,
    timestamp: Date.now(),
  });

  console.log(`\n[Ready] Ontologies runner operational on port ${PORT}`);
  console.log(`  POST /api/task        — submit a topic for analysis`);
  console.log(`  GET  /api/status      — runner status`);
  console.log(`  GET  /api/engrams     — list engrams`);
  console.log(`  WS   /ws             — real-time feed`);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[Shutdown] SIGINT received");
    room.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[Shutdown] SIGTERM received");
    room.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
