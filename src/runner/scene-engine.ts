/**
 * Scene state management — tension tracking, tone detection, event rolling.
 *
 * Ported from fsm-agents/src/core/scene-engine.ts.
 * All operations are zero-cost (deterministic string matching, no API calls).
 */

import type { SceneConfig, SceneState, RoomMessage } from "./types.js";

/** Analyze recent messages for tension and tone keywords. */
export function analyzeConversation(
  messages: RoomMessage[],
  config: SceneConfig,
): { tensionDelta: number; detectedTone: string | null } {
  const recent = messages.slice(-5);
  const text = recent.map((m) => m.content).join(" ").toLowerCase();

  // Count tension keyword hits
  let tensionHits = 0;
  for (const keyword of config.tensionKeywords) {
    if (text.includes(keyword.toLowerCase())) tensionHits++;
  }

  // Detect dominant tone from toneMap
  let detectedTone: string | null = null;
  let maxHits = 0;
  for (const [tone, keywords] of Object.entries(config.toneMap)) {
    let hits = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) hits++;
    }
    if (hits > maxHits) {
      maxHits = hits;
      detectedTone = tone;
    }
  }

  return {
    tensionDelta: tensionHits,
    detectedTone: maxHits > 0 ? detectedTone : null,
  };
}

/** Tick the scene state forward (deterministic, zero-cost). */
export function tickSceneState(
  state: SceneState,
  messages: RoomMessage[],
  config: SceneConfig,
): SceneState {
  const { tensionDelta, detectedTone } = analyzeConversation(messages, config);

  const newTension = Math.max(
    0,
    Math.min(10, state.tension + tensionDelta * 0.5 - 0.1),
  );

  const currentTone =
    detectedTone ?? (newTension > 6 ? "tense" : config.tone);

  return {
    tension: newTension,
    currentTone,
    pacing: state.pacing + 1,
    ticksSinceLastDM: state.ticksSinceLastDM + 1,
  };
}

/** Roll for a scene event from the current tone's pool. */
export function rollSceneEvent(
  config: SceneConfig,
  state: SceneState,
): string | null {
  const pool =
    config.events[state.currentTone] ?? config.events[config.tone] ?? [];

  // Suppress events during active conversation (low pacing)
  if (state.pacing < 3) return null;

  for (const event of pool) {
    if (Math.random() < event.weight) {
      return event.content;
    }
  }
  return null;
}

/** Check if escalation conditions are met. */
export function shouldEscalate(
  state: SceneState,
  config: SceneConfig,
): boolean {
  return (
    state.tension >= config.dmEscalationThreshold &&
    state.ticksSinceLastDM >= 6 &&
    state.pacing >= 4
  );
}

/** Create initial scene state. */
export function createSceneState(config: SceneConfig): SceneState {
  return {
    tension: 0,
    currentTone: config.tone,
    pacing: 0,
    ticksSinceLastDM: 0,
  };
}
