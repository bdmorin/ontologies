/**
 * Agent Runtime — bridges FSM RESPONDING state to Agent SDK query().
 *
 * When the FSM transitions an agent to RESPONDING, this module spawns
 * a query() call with the agent's config, system prompt, and MCP tools.
 * The Agent SDK runs as a subprocess with full tool access.
 *
 * This is NOT messages.create() — it's the full Claude Code Agent SDK
 * runtime with tool loops, permission bypass, and structured output.
 */

import {
  query,
  type SDKMessage,
  type SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";
import type { Agent, RoomMessage, Task } from "../runner/types.js";
import type { McpServer } from "./tools.js";

/** Extract JSON from text — multi-strategy, resilient to LLM prose preambles. */
export function extractJson(text: string): Record<string, unknown> | null {
  // Strategy 1: direct parse
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }

  // Strategy 2: fenced code block
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
  }

  // Strategy 3: first { to last }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // all strategies exhausted
    }
  }

  return null;
}

/** Build the user prompt from room context and active task. */
function buildPrompt(
  agent: Agent,
  context: RoomMessage[],
  task: Task | null,
): string {
  const parts: string[] = [];

  if (task) {
    parts.push(`## Active Task: ${task.topic}`);
    parts.push("");
    parts.push(task.sourceMaterial);
    parts.push("");
  }

  // Include recent conversation context
  if (context.length > 0) {
    parts.push("## Recent Discussion");
    parts.push("");
    for (const msg of context.slice(-10)) {
      if (msg.type === "emote") {
        parts.push(`*${msg.from} ${msg.content}*`);
      } else if (msg.type === "system" || msg.type === "scene") {
        parts.push(`[${msg.type}] ${msg.content}`);
      } else {
        parts.push(`[${msg.from}] ${msg.content}`);
      }
    }
    parts.push("");
  }

  parts.push("## Instructions");
  parts.push("");
  parts.push(
    "Analyze the material above from your analytical perspective. " +
      "Use the available research tools to verify claims and find additional context. " +
      "Return your analysis as valid JSON with this structure:",
  );
  parts.push("");
  parts.push(
    JSON.stringify(
      {
        analysis: "your analytical perspective (200-400 words)",
        keyPoints: ["point 1", "point 2"],
        concerns: ["concern or gap 1"],
        confidence: "HIGH | LIKELY | UNCERTAIN",
        sourcesChecked: ["url or source description"],
      },
      null,
      2,
    ),
  );

  return parts.join("\n");
}

export interface AgentRuntimeConfig {
  /** MCP servers to provide to agents */
  mcpServers: Record<string, McpServer>;
  /** Max turns for Agent SDK query() (default: 10) */
  maxTurns: number;
  /** Timeout per agent query in ms (default: 120000) */
  timeoutMs: number;
}

export interface AgentResponse {
  agentName: string;
  raw: string;
  parsed: Record<string, unknown> | null;
  tokenUsage: { input: number; output: number };
  durationMs: number;
}

/**
 * Execute an agent's response via the Agent SDK.
 *
 * Spawns query() with the agent's system prompt and available MCP tools.
 * Returns structured output if the agent produces valid JSON.
 */
export async function executeAgentResponse(
  agent: Agent,
  context: RoomMessage[],
  task: Task | null,
  runtimeConfig: AgentRuntimeConfig,
): Promise<AgentResponse> {
  const startTime = Date.now();
  const prompt = buildPrompt(agent, context, task);

  const queryStream = query({
    prompt,
    options: {
      model: agent.config.model,
      systemPrompt: agent.config.systemPrompt,
      maxTurns: runtimeConfig.maxTurns,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: [], // disable built-in Claude Code tools — MCP only
      mcpServers: runtimeConfig.mcpServers,
      persistSession: false,
    },
  });

  let resultMessage: SDKResultSuccess | null = null;

  // Race the query against a timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Agent ${agent.config.name} timed out after ${runtimeConfig.timeoutMs}ms`)),
      runtimeConfig.timeoutMs,
    );
  });

  try {
    const iterateQuery = async () => {
      for await (const message of queryStream as AsyncIterable<SDKMessage>) {
        if (message.type === "result" && message.subtype === "success") {
          resultMessage = message as SDKResultSuccess;
        }
      }
    };

    await Promise.race([iterateQuery(), timeoutPromise]);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error(`[AgentRuntime] ${agent.config.name} failed:`, err);
    return {
      agentName: agent.config.name,
      raw: `Error: ${err instanceof Error ? err.message : String(err)}`,
      parsed: null,
      tokenUsage: { input: 0, output: 0 },
      durationMs,
    };
  }

  const durationMs = Date.now() - startTime;

  if (!resultMessage) {
    return {
      agentName: agent.config.name,
      raw: "Agent SDK query completed without a success result",
      parsed: null,
      tokenUsage: { input: 0, output: 0 },
      durationMs,
    };
  }

  const resultText = (resultMessage as SDKResultSuccess).result;

  // Extract token usage
  let inputTokens = 0;
  let outputTokens = 0;
  if ((resultMessage as SDKResultSuccess).modelUsage) {
    for (const usage of Object.values(
      (resultMessage as SDKResultSuccess).modelUsage!,
    )) {
      inputTokens += (usage as { inputTokens: number; outputTokens: number }).inputTokens;
      outputTokens += (usage as { inputTokens: number; outputTokens: number }).outputTokens;
    }
  }

  const parsed = extractJson(resultText);

  console.log(
    `[AgentRuntime] ${agent.config.name} responded (${durationMs}ms, ` +
      `${inputTokens + outputTokens} tokens, ` +
      `JSON=${parsed ? "yes" : "no"})`,
  );

  return {
    agentName: agent.config.name,
    raw: resultText,
    parsed,
    tokenUsage: { input: inputTokens, output: outputTokens },
    durationMs,
  };
}
