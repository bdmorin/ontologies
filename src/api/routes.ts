/**
 * REST API route handlers.
 *
 * POST /api/task       — Submit a topic for analysis
 * GET  /api/engrams    — List engrams
 * GET  /api/engrams/:id — Get specific engram
 * GET  /api/status     — Runner status (agent states, queue depth, tick info)
 * GET  /api/health     — Health check
 */

import type { Room } from "../runner/room.js";
import type { EngramStore } from "../engram/store.js";
import type { Task } from "../runner/types.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return json({ error: message }, status);
}

export async function handleRoutes(
  req: Request,
  url: URL,
  room: Room,
  engramStore: EngramStore,
): Promise<Response> {
  const method = req.method;
  const path = url.pathname;

  // Health check
  if (path === "/api/health" && method === "GET") {
    return json({ status: "ok", timestamp: new Date().toISOString() });
  }

  // Runner status
  if (path === "/api/status" && method === "GET") {
    return json(room.getStatus());
  }

  // Submit task
  if (path === "/api/task" && method === "POST") {
    try {
      const body = (await req.json()) as {
        topic?: string;
        sourceMaterial?: string;
      };

      if (!body.topic || !body.sourceMaterial) {
        return errorResponse(
          "Missing required fields: topic, sourceMaterial",
          400,
        );
      }

      const task: Task = {
        id: crypto.randomUUID(),
        topic: body.topic,
        sourceMaterial: body.sourceMaterial,
        status: "queued",
        submittedAt: Date.now(),
      };

      room.submitTask(task);

      return json({ taskId: task.id, status: "queued" }, 201);
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
  }

  // List engrams
  if (path === "/api/engrams" && method === "GET") {
    const tag = url.searchParams.get("tag");
    const topic = url.searchParams.get("topic");

    if (tag) {
      const engrams = engramStore.byTag(tag);
      return json({ count: engrams.length, engrams });
    }

    if (topic) {
      const engrams = engramStore.chain(topic);
      return json({ count: engrams.length, engrams });
    }

    const index = engramStore.all();
    return json({
      count: index.engrams.length,
      engrams: index.engrams,
      topicChains: index.topicChains,
    });
  }

  // Get specific engram
  if (path.startsWith("/api/engrams/") && method === "GET") {
    const id = path.slice("/api/engrams/".length);
    if (!id) return errorResponse("Missing engram ID", 400);

    const engram = engramStore.getById(id);
    if (!engram) return errorResponse("Engram not found", 404);

    return json(engram);
  }

  // 404
  return errorResponse("Not found", 404);
}
