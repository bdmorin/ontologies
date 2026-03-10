/**
 * HTTP API server — Bun.serve() with REST endpoints and WebSocket.
 *
 * Accepts tasks, serves engrams, and provides real-time state updates.
 */

import type { Room } from "../runner/room.js";
import type { EngramStore } from "../engram/store.js";
import { handleRoutes } from "./routes.js";
import { handleWebSocket, type WSData } from "./websocket.js";

export interface ServerConfig {
  port: number;
  hostname: string;
}

export function startServer(
  room: Room,
  engramStore: EngramStore,
  config: ServerConfig = { port: 3000, hostname: "0.0.0.0" },
): ReturnType<typeof Bun.serve> {
  const server = Bun.serve<WSData>({
    port: config.port,
    hostname: config.hostname,

    fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req, {
          data: { connectedAt: Date.now() },
        });
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // REST API routes
      return handleRoutes(req, url, room, engramStore);
    },

    websocket: handleWebSocket(room),
  });

  console.log(`[API] Server listening on ${config.hostname}:${config.port}`);

  return server;
}
