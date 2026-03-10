/**
 * API endpoint tests.
 *
 * Tests the REST route handlers directly — no server startup needed.
 * Uses the real Room and EngramStore implementations.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { handleRoutes } from "../src/api/routes.js";
import { Room } from "../src/runner/room.js";
import { EngramStore } from "../src/engram/store.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_ENGRAMS_DIR = join(process.cwd(), "tmp", "test-engrams");

function makeRequest(method: string, path: string, body?: unknown): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init);
}

describe("API routes", () => {
  let room: Room;
  let engramStore: EngramStore;

  beforeEach(() => {
    // Clean up test engrams dir
    if (existsSync(TEST_ENGRAMS_DIR)) {
      rmSync(TEST_ENGRAMS_DIR, { recursive: true });
    }
    mkdirSync(TEST_ENGRAMS_DIR, { recursive: true });

    room = new Room({
      name: "Test Room",
      tickRate: 5000,
      maxMessages: 100,
    });

    engramStore = new EngramStore(TEST_ENGRAMS_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_ENGRAMS_DIR)) {
      rmSync(TEST_ENGRAMS_DIR, { recursive: true });
    }
  });

  describe("GET /api/health", () => {
    it("returns ok status", async () => {
      const req = makeRequest("GET", "/api/health");
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("GET /api/status", () => {
    it("returns runner status", async () => {
      const req = makeRequest("GET", "/api/status");
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.running).toBe(false);
      expect(body.agentCount).toBe(0);
      expect(body.queueDepth).toBe(0);
    });
  });

  describe("POST /api/task", () => {
    it("submits a task and returns taskId", async () => {
      const req = makeRequest("POST", "/api/task", {
        topic: "Test Analysis",
        sourceMaterial: "Here is some test content to analyze.",
      });
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.taskId).toBeDefined();
      expect(body.status).toBe("queued");
    });

    it("rejects task with missing fields", async () => {
      const req = makeRequest("POST", "/api/task", {
        topic: "Missing source material",
      });
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);

      expect(res.status).toBe(400);
    });

    it("rejects invalid JSON body", async () => {
      const req = new Request("http://localhost:3000/api/task", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/engrams", () => {
    it("returns empty list initially", async () => {
      const req = makeRequest("GET", "/api/engrams");
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.count).toBe(0);
    });

    it("returns stored engrams", async () => {
      engramStore.store({
        tags: ["#test"],
        title: "Test Engram",
        summary: "A test.",
        content: { data: "hello" },
        contentType: "test",
        provenance: {
          generatedAt: new Date().toISOString(),
          activity: "test",
          agents: ["test-agent"],
          derivedFrom: [],
        },
        topicKey: "test-topic",
      });

      const req = makeRequest("GET", "/api/engrams");
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.count).toBe(1);
    });

    it("filters by tag", async () => {
      engramStore.store({
        tags: ["#alpha"],
        title: "Alpha Engram",
        summary: "A.",
        content: {},
        contentType: "test",
        provenance: {
          generatedAt: new Date().toISOString(),
          activity: "test",
          agents: [],
          derivedFrom: [],
        },
        topicKey: "alpha",
      });

      engramStore.store({
        tags: ["#beta"],
        title: "Beta Engram",
        summary: "B.",
        content: {},
        contentType: "test",
        provenance: {
          generatedAt: new Date().toISOString(),
          activity: "test",
          agents: [],
          derivedFrom: [],
        },
        topicKey: "beta",
      });

      const req = makeRequest("GET", "/api/engrams?tag=%23alpha");
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.count).toBe(1);
      expect(body.engrams[0].title).toBe("Alpha Engram");
    });
  });

  describe("GET /api/engrams/:id", () => {
    it("returns a specific engram", async () => {
      const engram = engramStore.store({
        tags: ["#test"],
        title: "Specific Engram",
        summary: "A specific test.",
        content: { value: 42 },
        contentType: "test",
        provenance: {
          generatedAt: new Date().toISOString(),
          activity: "test",
          agents: ["test-agent"],
          derivedFrom: [],
        },
        topicKey: "specific-test",
      });

      const req = makeRequest("GET", `/api/engrams/${engram.id}`);
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.id).toBe(engram.id);
      expect(body.title).toBe("Specific Engram");
      expect(body.content.value).toBe(42);
    });

    it("returns 404 for non-existent engram", async () => {
      const req = makeRequest("GET", "/api/engrams/nonexistent");
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);

      expect(res.status).toBe(404);
    });
  });

  describe("404 handling", () => {
    it("returns 404 for unknown routes", async () => {
      const req = makeRequest("GET", "/api/nonexistent");
      const url = new URL(req.url);
      const res = await handleRoutes(req, url, room, engramStore);

      expect(res.status).toBe(404);
    });
  });
});
