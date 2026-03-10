/**
 * FSM types for the Ontologies runner.
 *
 * Ported from fsm-agents, stripped of cosplay terminology.
 * Agents are analyst personas, not fictional characters.
 */

// FSM States — only RESPONDING triggers an Agent SDK query() call
export type FSMState = "IDLE" | "RESPONDING" | "EMOTING" | "COOLDOWN";

// Relevance levels from the zero-cost evaluation
export type RelevanceLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

// Engine events — the pulse of the system
export type EngineEvent =
  | { type: "message"; from: string; content: string; timestamp: number }
  | { type: "tick"; tickNumber: number; timestamp: number }
  | { type: "scene"; content: string; timestamp: number }
  | { type: "task"; taskId: string; content: string; timestamp: number };

// What the FSM decides to do
export interface FSMTransition {
  nextState: FSMState;
  action?: "respond" | "emote" | "initiate" | "none";
  emoteCategory?: string;
}

// Agent definition — loaded from TypeScript config files
export interface AgentConfig {
  name: string;
  role: string; // "technologist" | "strategist" | "contrarian" | "historian"
  model: string;
  maxTokens: number;
  systemPrompt: string;
  triggers: {
    keywords: string[];
    alwaysRespondTo: string[];
    randomChance: number;
  };
  energy: {
    max: number;
    responseCost: number;
    emoteCost: number;
    rechargeRate: number;
  };
  boredom: {
    threshold: number;
    increaseRate: number;
  };
  cooldownTicks: number;
  emotes: Record<string, string[]>;
  /** MCP tool names this agent has access to (empty = all available) */
  tools: string[];
}

// Mutable internal state per agent — evolves deterministically
export interface AgentState {
  fsm: FSMState;
  energy: number;
  boredom: number;
  mood: number; // -1 to 1
  cooldownRemaining: number;
  lastSpoke: number;
}

// An agent instance = config + state + conversation history
export interface Agent {
  config: AgentConfig;
  state: AgentState;
}

// Message in the room log
export interface RoomMessage {
  id: string;
  type: "message" | "emote" | "scene" | "system" | "task";
  from: string;
  content: string;
  timestamp: number;
  taskId?: string;
}

// Room configuration
export interface RoomConfig {
  name: string;
  tickRate: number; // ms between ticks
  maxMessages: number;
}

// Scene configuration for the roundtable topic
export interface SceneConfig {
  name: string;
  tone: string;
  tensionKeywords: string[];
  toneMap: Record<string, string[]>;
  events: Record<string, SceneEvent[]>;
  dmEscalationThreshold: number;
}

// Weighted scene event
export interface SceneEvent {
  weight: number; // 0-1 probability per tick
  content: string;
}

// Scene state — evolves deterministically
export interface SceneState {
  tension: number; // 0-10
  currentTone: string;
  pacing: number; // ticks since last scene event or message
  ticksSinceLastDM: number;
}

// Task submitted via API
export interface Task {
  id: string;
  topic: string;
  sourceMaterial: string;
  status: "queued" | "active" | "complete" | "failed";
  submittedAt: number;
  completedAt?: number;
  engramId?: string;
  error?: string;
}

// Event bus types
export interface EventMap {
  event: [EngineEvent];
  stateChange: [string, AgentState]; // agentName, newState
  roomMessage: [RoomMessage];
  taskComplete: [Task];
}
