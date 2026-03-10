/**
 * The Room — central state manager and heart of the engine.
 *
 * Owns agents, message log, tick loop, and scene state.
 * Orchestrates FSM evaluation and dispatches to the agent runtime
 * for Agent SDK query() calls.
 *
 * Ported from fsm-agents/src/core/room.ts — adapted for:
 * - Analyst agents instead of fictional characters
 * - Async Agent SDK query() instead of messages.create()
 * - Task queue for API-submitted topics
 * - Dynamic tick rate
 * - No TUI (headless — API + WebSocket only)
 */

import type {
  Agent,
  AgentConfig,
  AgentState,
  RoomMessage,
  RoomConfig,
  SceneConfig,
  SceneState,
  EngineEvent,
  Task,
} from "./types.js";
import { evaluateFSM, tickState } from "./fsm.js";
import {
  rollSceneEvent,
  tickSceneState,
  createSceneState,
} from "./scene-engine.js";
import { calculateTickRate, estimateComplexity, DEFAULT_TICK_CONFIG } from "./tick.js";
import type { TickConfig } from "./tick.js";

type ResponseHandler = (
  agent: Agent,
  context: RoomMessage[],
  task: Task | null,
) => Promise<string>;

type EventHandler = (...args: unknown[]) => void;

/**
 * Lightweight event emitter — no external dependency needed.
 */
class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.listeners.get(event) ?? []) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[EventBus] Handler error on "${event}":`, err);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

export class Room {
  readonly config: RoomConfig;
  private agents: Map<string, Agent> = new Map();
  private messages: RoomMessage[] = [];
  private responseHandler: ResponseHandler | null = null;
  private eventBus = new EventBus();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tickNumber = 0;
  private running = false;

  sceneConfig: SceneConfig | null = null;
  sceneState: SceneState | null = null;

  // Task queue
  private taskQueue: Task[] = [];
  private activeTask: Task | null = null;
  private activeTaskResponses: Map<string, string> = new Map();

  // Dynamic tick config
  private tickConfig: TickConfig = DEFAULT_TICK_CONFIG;
  private currentTickRate: number;

  constructor(config: RoomConfig, sceneConfig?: SceneConfig | null) {
    this.config = config;
    this.currentTickRate = config.tickRate;

    if (sceneConfig) {
      this.sceneConfig = sceneConfig;
      this.sceneState = createSceneState(sceneConfig);
    }
  }

  // -- Agent management --

  addAgent(config: AgentConfig): void {
    const initialState: AgentState = {
      fsm: "IDLE",
      energy: config.energy.max,
      boredom: 0,
      mood: 0,
      cooldownRemaining: 0,
      lastSpoke: 0,
    };

    this.agents.set(config.name, {
      config,
      state: initialState,
    });
  }

  getAgents(): Map<string, Agent> {
    return this.agents;
  }

  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  // -- Message management --

  addMessage(msg: RoomMessage): void {
    this.messages.push(msg);
    this.eventBus.emit("roomMessage", msg);

    if (this.messages.length > this.config.maxMessages) {
      this.messages = this.messages.slice(-this.config.maxMessages);
    }

    // Reset pacing when a real message arrives
    if (this.sceneState && msg.type === "message") {
      this.sceneState = { ...this.sceneState, pacing: 0 };
    }
  }

  getMessages(): RoomMessage[] {
    return this.messages;
  }

  getSceneState(): SceneState | null {
    return this.sceneState;
  }

  // -- Task queue --

  submitTask(task: Task): void {
    this.taskQueue.push(task);
    this.eventBus.emit("taskQueued", task);
  }

  getTaskQueue(): Task[] {
    return [...this.taskQueue];
  }

  getActiveTask(): Task | null {
    return this.activeTask;
  }

  // -- Event subscription --

  on(type: string, handler: EventHandler): void {
    this.eventBus.on(type, handler);
  }

  off(type: string, handler: EventHandler): void {
    this.eventBus.off(type, handler);
  }

  // -- Response callback --

  onNeedResponse(handler: ResponseHandler): void {
    this.responseHandler = handler;
  }

  // -- Lifecycle --

  start(): void {
    if (this.running) return;
    this.running = true;

    this.tickTimer = setInterval(() => {
      this.handleTick();
    }, this.currentTickRate);

    console.log(
      `[Room] Started — ${this.agents.size} agents, tick=${this.currentTickRate}ms`,
    );
  }

  stop(): void {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.eventBus.removeAllListeners();
    console.log("[Room] Stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Manual tick for testing — bypasses the interval clock. */
  async tick(): Promise<void> {
    return this.handleTick();
  }

  // -- Tick processing --

  private async handleTick(): Promise<void> {
    this.tickNumber++;

    // 1. Update internal state for each agent
    for (const [, agent] of this.agents) {
      agent.state = tickState(agent.state, agent.config);
    }

    // 2. Check task queue — activate next task if idle
    if (!this.activeTask && this.taskQueue.length > 0) {
      this.activateNextTask();
    }

    // 3. Scene state updates
    if (this.sceneConfig && this.sceneState) {
      this.sceneState = tickSceneState(
        this.sceneState,
        this.messages,
        this.sceneConfig,
      );

      const sceneContent = rollSceneEvent(this.sceneConfig, this.sceneState);
      if (sceneContent) {
        this.sceneState = { ...this.sceneState, pacing: 0 };

        const sceneMsg: RoomMessage = {
          id: crypto.randomUUID(),
          type: "scene",
          from: "Scene",
          content: sceneContent,
          timestamp: Date.now(),
        };
        this.addMessage(sceneMsg);

        const sceneEvent: EngineEvent = {
          type: "scene",
          content: sceneContent,
          timestamp: Date.now(),
        };

        for (const [, agent] of this.agents) {
          await this.evaluateAndAct(agent, sceneEvent);
        }
      }
    }

    // 4. Evaluate tick event against each agent
    const tickEvent: EngineEvent = {
      type: "tick",
      tickNumber: this.tickNumber,
      timestamp: Date.now(),
    };

    for (const [, agent] of this.agents) {
      await this.evaluateAndAct(agent, tickEvent);
    }

    // 5. Update dynamic tick rate
    this.updateTickRate();

    // 6. Emit tick event for WebSocket subscribers
    this.eventBus.emit("tick", {
      tickNumber: this.tickNumber,
      agentStates: this.getAgentStates(),
      queueDepth: this.taskQueue.length,
      activeTask: this.activeTask?.id ?? null,
    });
  }

  private activateNextTask(): void {
    const task = this.taskQueue.shift();
    if (!task) return;

    task.status = "active";
    this.activeTask = task;
    this.activeTaskResponses.clear();

    // Inject task as a message so all agents see it
    const taskMsg: RoomMessage = {
      id: crypto.randomUUID(),
      type: "task",
      from: "System",
      content: `NEW TASK: ${task.topic}\n\n${task.sourceMaterial}`,
      timestamp: Date.now(),
      taskId: task.id,
    };
    this.addMessage(taskMsg);

    // Fire task event against all agents
    const taskEvent: EngineEvent = {
      type: "task",
      taskId: task.id,
      content: taskMsg.content,
      timestamp: Date.now(),
    };

    for (const [, agent] of this.agents) {
      this.evaluateAndAct(agent, taskEvent);
    }

    console.log(`[Room] Activated task: ${task.id} — "${task.topic}"`);
  }

  // -- FSM evaluation and action dispatch --

  private async evaluateAndAct(
    agent: Agent,
    event: EngineEvent,
  ): Promise<void> {
    const transition = evaluateFSM(event, agent.state, agent.config);
    agent.state = { ...agent.state, fsm: transition.nextState };

    switch (transition.action) {
      case "emote":
        this.handleEmote(agent, transition.emoteCategory ?? "idle");
        break;

      case "respond":
      case "initiate":
        await this.handleResponse(agent);
        break;

      case "none":
      default:
        break;
    }

    this.eventBus.emit("stateChange", agent.config.name, { ...agent.state });
  }

  // -- Emoting --

  private handleEmote(agent: Agent, category: string): void {
    const emoteList =
      agent.config.emotes[category] ?? agent.config.emotes["idle"] ?? ["..."];
    const emote = emoteList[Math.floor(Math.random() * emoteList.length)];

    const msg: RoomMessage = {
      id: crypto.randomUUID(),
      type: "emote",
      from: agent.config.name,
      content: emote,
      timestamp: Date.now(),
    };
    this.addMessage(msg);

    agent.state = {
      ...agent.state,
      fsm: "IDLE",
      energy: Math.max(0, agent.state.energy - agent.config.energy.emoteCost),
      lastSpoke: Date.now(),
    };
  }

  // -- Responding (async Agent SDK bridge) --

  private async handleResponse(agent: Agent): Promise<void> {
    if (!this.responseHandler) {
      agent.state = { ...agent.state, fsm: "IDLE" };
      return;
    }

    agent.state = { ...agent.state, fsm: "RESPONDING" };
    this.eventBus.emit("stateChange", agent.config.name, { ...agent.state });

    try {
      const context = this.messages.slice(-20);
      const responseContent = await this.responseHandler(
        agent,
        context,
        this.activeTask,
      );

      const msg: RoomMessage = {
        id: crypto.randomUUID(),
        type: "message",
        from: agent.config.name,
        content: responseContent,
        timestamp: Date.now(),
      };
      this.addMessage(msg);

      // Track response for active task
      if (this.activeTask) {
        this.activeTaskResponses.set(agent.config.name, responseContent);
        this.checkTaskCompletion();
      }

      // Transition to COOLDOWN
      agent.state = {
        ...agent.state,
        fsm: "COOLDOWN",
        energy: Math.max(
          0,
          agent.state.energy - agent.config.energy.responseCost,
        ),
        cooldownRemaining: agent.config.cooldownTicks,
        boredom: 0,
        lastSpoke: Date.now(),
      };
    } catch (err) {
      console.error(
        `[Room] Response failed for ${agent.config.name}:`,
        err,
      );
      agent.state = { ...agent.state, fsm: "IDLE" };
    }

    this.eventBus.emit("stateChange", agent.config.name, { ...agent.state });
  }

  // -- Task completion check --

  private checkTaskCompletion(): void {
    if (!this.activeTask) return;

    // Task is complete when all agents have responded
    const allResponded = [...this.agents.keys()].every((name) =>
      this.activeTaskResponses.has(name),
    );

    if (allResponded) {
      this.activeTask.status = "complete";
      this.activeTask.completedAt = Date.now();
      this.eventBus.emit("taskComplete", this.activeTask, this.activeTaskResponses);
      console.log(`[Room] Task complete: ${this.activeTask.id}`);
      this.activeTask = null;
      this.activeTaskResponses.clear();
    }
  }

  // -- Dynamic tick rate --

  private updateTickRate(): void {
    const activeAgentCount = [...this.agents.values()].filter(
      (a) => a.state.fsm === "RESPONDING",
    ).length;

    const complexity = this.activeTask
      ? estimateComplexity(this.activeTask.sourceMaterial)
      : 0;

    const newRate = calculateTickRate(
      activeAgentCount,
      complexity,
      this.tickConfig,
    );

    if (newRate !== this.currentTickRate && this.running) {
      this.currentTickRate = newRate;
      if (this.tickTimer) {
        clearInterval(this.tickTimer);
        this.tickTimer = setInterval(() => {
          this.handleTick();
        }, this.currentTickRate);
      }
    }
  }

  // -- Status helpers --

  getAgentStates(): Record<string, AgentState> {
    const states: Record<string, AgentState> = {};
    for (const [name, agent] of this.agents) {
      states[name] = { ...agent.state };
    }
    return states;
  }

  getStatus(): {
    running: boolean;
    tickNumber: number;
    tickRate: number;
    agentCount: number;
    queueDepth: number;
    activeTask: string | null;
    agents: Record<string, AgentState>;
  } {
    return {
      running: this.running,
      tickNumber: this.tickNumber,
      tickRate: this.currentTickRate,
      agentCount: this.agents.size,
      queueDepth: this.taskQueue.length,
      activeTask: this.activeTask?.id ?? null,
      agents: this.getAgentStates(),
    };
  }
}
