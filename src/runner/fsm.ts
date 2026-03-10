/**
 * Pure deterministic FSM evaluation.
 *
 * Given an event, the current agent state, and config, returns the
 * next state transition with an optional action.
 *
 * Ported from fsm-agents/src/core/fsm.ts — same state machine logic,
 * adapted for analyst agents instead of fictional characters.
 */

import type {
  FSMState,
  FSMTransition,
  EngineEvent,
  AgentConfig,
  AgentState,
} from "./types.js";
import { evaluateRelevance } from "./relevance.js";

export function evaluateFSM(
  event: EngineEvent,
  state: AgentState,
  config: AgentConfig,
  hasActiveTask = false,
): FSMTransition {
  const hasEnergy = state.energy >= config.energy.responseCost;

  switch (state.fsm) {
    case "IDLE":
      return evaluateIdle(event, state, config, hasEnergy, hasActiveTask);

    // RESPONDING state — the room handles transitioning to COOLDOWN
    // after the Agent SDK query() completes.
    case "RESPONDING":
      return { nextState: "RESPONDING" };

    // EMOTING state — room handles transitioning back to IDLE after emote.
    case "EMOTING":
      return { nextState: "EMOTING" };

    case "COOLDOWN":
      return evaluateCooldown(event, state);

    default:
      return { nextState: state.fsm };
  }
}

// -- IDLE sub-evaluation --

function evaluateIdle(
  event: EngineEvent,
  state: AgentState,
  config: AgentConfig,
  hasEnergy: boolean,
  hasActiveTask: boolean,
): FSMTransition {
  switch (event.type) {
    case "message": {
      const relevance = evaluateRelevance(event.content, event.from, config);

      switch (relevance) {
        case "HIGH":
        case "MEDIUM":
          if (hasEnergy) {
            return { nextState: "RESPONDING", action: "respond" };
          }
          return {
            nextState: "EMOTING",
            action: "emote",
            emoteCategory: "idle",
          };

        case "LOW":
          return {
            nextState: "EMOTING",
            action: "emote",
            emoteCategory: "idle",
          };

        case "NONE":
        default:
          return { nextState: "IDLE" };
      }
    }

    case "tick": {
      // Boredom-driven initiation — only when a task is active
      // (prevents idle void-screaming that burns tokens for nothing)
      if (hasActiveTask && state.boredom >= config.boredom.threshold && hasEnergy) {
        return { nextState: "RESPONDING", action: "initiate" };
      }

      // Random idle emote (5% chance per tick)
      if (Math.random() < 0.05) {
        return {
          nextState: "EMOTING",
          action: "emote",
          emoteCategory: "idle",
        };
      }

      return { nextState: "IDLE" };
    }

    // Tasks are high-priority — all agents evaluate them
    case "task": {
      const relevance = evaluateRelevance(event.content, "system", config);
      if (relevance !== "NONE" && hasEnergy) {
        return { nextState: "RESPONDING", action: "respond" };
      }
      // Even low-relevance tasks get a response if the agent has energy,
      // because tasks are explicitly submitted work items.
      if (hasEnergy) {
        return { nextState: "RESPONDING", action: "respond" };
      }
      return { nextState: "IDLE" };
    }

    // Scene events — only trigger responses when a task is active
    case "scene":
      if (hasActiveTask && hasEnergy) {
        return { nextState: "RESPONDING", action: "respond" };
      }
      // No task? Just emote in response to the scene
      return { nextState: "EMOTING", action: "emote", emoteCategory: "idle" };

    default:
      return { nextState: "IDLE" };
  }
}

// -- COOLDOWN sub-evaluation --

function evaluateCooldown(
  event: EngineEvent,
  state: AgentState,
): FSMTransition {
  if (event.type === "tick") {
    const remaining = state.cooldownRemaining - 1;
    if (remaining <= 0) {
      return { nextState: "IDLE" };
    }
    return { nextState: "COOLDOWN" };
  }

  // Non-tick events don't affect cooldown
  return { nextState: "COOLDOWN" };
}

/**
 * Called every tick to update internal agent state.
 * Returns a new state object (immutable update).
 */
export function tickState(
  state: AgentState,
  config: AgentConfig,
): AgentState {
  return {
    ...state,
    energy: Math.min(config.energy.max, state.energy + config.energy.rechargeRate),
    boredom: state.boredom + config.boredom.increaseRate,
    cooldownRemaining: Math.max(0, state.cooldownRemaining - 1),
    mood: decayTowardZero(state.mood, 0.01),
  };
}

/** Decay a value toward zero by a fixed step. */
function decayTowardZero(value: number, step: number): number {
  if (value > 0) return Math.max(0, value - step);
  if (value < 0) return Math.min(0, value + step);
  return 0;
}
