/**
 * Dynamic tick rate calculator.
 *
 * Instead of a fixed 5s tick, the tick duration adapts based on
 * the number of active agents and the complexity of the current topic.
 * More agents or higher complexity = longer ticks to avoid rate-limiting
 * and give agents time to finish long query() calls.
 */

export interface TickConfig {
  /** Base tick interval in milliseconds (default: 5000) */
  baseTick: number;
  /** Multiplier per active agent (default: 0.15) */
  agentFactor: number;
  /** Multiplier for topic complexity 0-1 (default: 0.3) */
  complexityFactor: number;
  /** Minimum tick interval in ms (floor) */
  minTick: number;
  /** Maximum tick interval in ms (ceiling) */
  maxTick: number;
}

export const DEFAULT_TICK_CONFIG: TickConfig = {
  baseTick: 5000,
  agentFactor: 0.15,
  complexityFactor: 0.3,
  minTick: 3000,
  maxTick: 30000,
};

/**
 * Calculate the dynamic tick interval.
 *
 * Formula: baseTick * (1 + agentCount * agentFactor + complexity * complexityFactor)
 *
 * @param agentCount - Number of agents currently active (not in COOLDOWN/idle with no energy)
 * @param complexity - Topic complexity score 0-1 (derived from source material length, keyword density, etc.)
 * @param config - Tick configuration parameters
 * @returns Tick interval in milliseconds
 */
export function calculateTickRate(
  agentCount: number,
  complexity: number,
  config: TickConfig = DEFAULT_TICK_CONFIG,
): number {
  const clampedComplexity = Math.max(0, Math.min(1, complexity));
  const raw =
    config.baseTick *
    (1 + agentCount * config.agentFactor + clampedComplexity * config.complexityFactor);
  return Math.max(config.minTick, Math.min(config.maxTick, Math.round(raw)));
}

/**
 * Estimate topic complexity from source material.
 * Simple heuristic: length + keyword density.
 *
 * @param sourceMaterial - The raw source text
 * @returns Complexity score 0-1
 */
export function estimateComplexity(sourceMaterial: string): number {
  if (!sourceMaterial) return 0;

  // Length factor: more text = more complex, logarithmic scale
  const lengthScore = Math.min(1, Math.log10(sourceMaterial.length + 1) / 5);

  // Keyword density: technical terms, numbers, URLs
  const technicalPatterns = [
    /\b(?:api|sdk|protocol|architecture|infrastructure)\b/gi,
    /\bhttps?:\/\/\S+/g,
    /\b\d+(?:\.\d+)+\b/g, // version numbers
    /\b(?:million|billion|percent|%)\b/gi,
  ];

  let keywordHits = 0;
  for (const pattern of technicalPatterns) {
    const matches = sourceMaterial.match(pattern);
    if (matches) keywordHits += matches.length;
  }

  const densityScore = Math.min(1, keywordHits / 20);

  return (lengthScore * 0.6 + densityScore * 0.4);
}
