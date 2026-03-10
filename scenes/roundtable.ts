import type { SceneConfig } from "../src/runner/types.js";

/**
 * Default roundtable scene — analytical discussion atmosphere.
 *
 * Tension rises when the source material contains conflict signals
 * (disagreement, risk, failure). Tone shifts between analytical,
 * skeptical, and urgent based on conversation content.
 */
const config: SceneConfig = {
  name: "Analyst Roundtable",
  tone: "analytical",
  tensionKeywords: [
    "risk",
    "failure",
    "collapse",
    "breach",
    "vulnerability",
    "conflict",
    "crisis",
    "deadline",
    "critical",
    "urgent",
    "disagree",
    "wrong",
    "overestimate",
    "underestimate",
  ],
  toneMap: {
    analytical: [
      "data",
      "evidence",
      "analysis",
      "finding",
      "metric",
      "benchmark",
      "correlation",
    ],
    skeptical: [
      "hype",
      "overpromise",
      "assumption",
      "bias",
      "cherry-pick",
      "misleading",
      "exaggerate",
    ],
    urgent: [
      "critical",
      "deadline",
      "immediate",
      "emergency",
      "breaking",
      "urgent",
      "now",
    ],
    reflective: [
      "history",
      "pattern",
      "cycle",
      "reminds",
      "similar",
      "precedent",
      "learned",
    ],
  },
  events: {
    analytical: [
      {
        weight: 0.05,
        content:
          "*New data point surfaces from a parallel research stream — cross-referencing with current analysis.*",
      },
    ],
    skeptical: [
      {
        weight: 0.06,
        content:
          "*A contradictory report emerges from an independent source — reviewing for relevance.*",
      },
    ],
    urgent: [
      {
        weight: 0.08,
        content:
          "*Breaking development related to the topic under analysis — updating context.*",
      },
    ],
    reflective: [
      {
        weight: 0.04,
        content:
          "*Historical parallel identified in the archive — pulling the reference for comparison.*",
      },
    ],
  },
  dmEscalationThreshold: 7,
};

export default config;
