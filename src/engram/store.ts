/**
 * Content-addressed engram store.
 *
 * Every engram is immutable. Updates create new engrams with wasRevisionOf links.
 * Ported from spike-yntk/src/engram/store.ts.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Engram, StoreIndex } from "./types.js";

const DEFAULT_STORE_DIR = join(process.cwd(), "engrams");

export class EngramStore {
  private storeDir: string;

  constructor(storeDir?: string) {
    this.storeDir = storeDir ?? DEFAULT_STORE_DIR;
    this.ensureStore();
  }

  private ensureStore(): void {
    mkdirSync(this.storeDir, { recursive: true });
    const indexPath = join(this.storeDir, "index.json");
    if (!existsSync(indexPath)) {
      writeFileSync(
        indexPath,
        JSON.stringify({ engrams: [], topicChains: {} }, null, 2),
      );
    }
  }

  private computeId(engram: Omit<Engram, "id">): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(engram.content));
    hash.update(engram.topicKey);
    hash.update(engram.provenance.generatedAt);
    hash.update(engram.provenance.activity);
    return hash.digest("hex").slice(0, 16);
  }

  private readIndex(): StoreIndex {
    return JSON.parse(
      readFileSync(join(this.storeDir, "index.json"), "utf-8"),
    );
  }

  private writeIndex(index: StoreIndex): void {
    writeFileSync(
      join(this.storeDir, "index.json"),
      JSON.stringify(index, null, 2),
    );
  }

  /** Store an engram. Returns the complete engram with computed ID. */
  store(input: Omit<Engram, "id" | "createdAt">): Engram {
    const index = this.readIndex();

    const engram: Engram = {
      ...input,
      id: this.computeId({ ...input, createdAt: new Date().toISOString() }),
      createdAt: new Date().toISOString(),
    };

    // Supersession chain
    const chain = index.topicChains[engram.topicKey] || [];
    if (chain.length > 0) {
      const previousId = chain[chain.length - 1];
      engram.provenance.wasRevisionOf = previousId;
      const prev = index.engrams.find((e) => e.id === previousId);
      if (prev) prev.supersededBy = engram.id;
    }

    // Write engram file
    writeFileSync(
      join(this.storeDir, `${engram.id}.json`),
      JSON.stringify(engram, null, 2),
    );

    // Update index
    index.engrams.push({
      id: engram.id,
      topicKey: engram.topicKey,
      tags: engram.tags,
      title: engram.title,
      contentType: engram.contentType,
      createdAt: engram.createdAt,
    });

    // Update topic chain
    if (!index.topicChains[engram.topicKey]) {
      index.topicChains[engram.topicKey] = [];
    }
    index.topicChains[engram.topicKey].push(engram.id);

    this.writeIndex(index);
    return engram;
  }

  /** Get the latest engram for a topic. */
  latest(topicKey: string): Engram | null {
    const index = this.readIndex();
    const chain = index.topicChains[topicKey];
    if (!chain || chain.length === 0) return null;
    const latestId = chain[chain.length - 1];
    return this.getById(latestId);
  }

  /** Get the full supersession chain for a topic. */
  chain(topicKey: string): Engram[] {
    const index = this.readIndex();
    const ids = index.topicChains[topicKey] || [];
    return ids
      .map((id) => this.getById(id))
      .filter((e): e is Engram => e !== null);
  }

  /** Get a specific engram by ID. */
  getById(id: string): Engram | null {
    const path = join(this.storeDir, `${id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  /** Get all non-superseded engrams with a given tag. */
  byTag(tag: string): Engram[] {
    const index = this.readIndex();
    const matching = index.engrams.filter(
      (e) => e.tags.includes(tag) && !e.supersededBy,
    );
    return matching
      .map((entry) => this.getById(entry.id))
      .filter((e): e is Engram => e !== null);
  }

  /** Get the full store index. */
  all(): StoreIndex {
    return this.readIndex();
  }
}
