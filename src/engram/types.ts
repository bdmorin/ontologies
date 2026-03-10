/**
 * Engram types — content-addressed knowledge artifacts with provenance chains.
 */

export interface Engram {
  /** Content-addressed ID (sha256 of content + metadata) */
  id: string;

  /** Human-facing tags for discovery */
  tags: string[];
  title: string;
  summary: string;

  /** The actual analysis content */
  content: unknown;
  /** Type discriminator: "roundtable-analysis" | "agent-analysis" | "source-material" */
  contentType: string;

  /** W3C PROV-inspired provenance (system-managed, never human-edited) */
  provenance: {
    generatedAt: string;
    activity: string; // "roundtable" | "single-agent" | "multi-agent" | "manual"
    agents: string[];
    model?: string;
    tokenUsage?: { input: number; output: number; total: number };
    derivedFrom: string[]; // engram IDs this was built from
    wasRevisionOf?: string; // engram ID this supersedes
    source?: string; // original URL or file path
  };

  /** Normalized topic identifier for supersession chains */
  topicKey: string;
  createdAt: string;
}

export interface StoreIndex {
  engrams: Array<{
    id: string;
    topicKey: string;
    tags: string[];
    title: string;
    contentType: string;
    createdAt: string;
    supersededBy?: string;
  }>;
  topicChains: Record<string, string[]>;
}
