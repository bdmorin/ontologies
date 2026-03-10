/**
 * WebSocket handler for real-time dashboard feed.
 *
 * Broadcasts agent FSM state changes, tick events, room messages,
 * and task completions to all connected clients.
 */

import type { Room } from "../runner/room.js";
import type { ServerWebSocket } from "bun";

export interface WSData {
  connectedAt: number;
}

type WSClient = ServerWebSocket<WSData>;

const clients = new Set<WSClient>();

/** Wire up Room events to broadcast to WebSocket clients. */
function wireRoomEvents(room: Room): void {
  room.on("stateChange", (agentName: unknown, state: unknown) => {
    broadcast({
      type: "stateChange",
      agent: agentName,
      state,
      timestamp: Date.now(),
    });
  });

  room.on("roomMessage", (msg: unknown) => {
    broadcast({
      type: "message",
      message: msg,
      timestamp: Date.now(),
    });
  });

  room.on("tick", (tickData: unknown) => {
    broadcast({
      type: "tick",
      data: tickData,
      timestamp: Date.now(),
    });
  });

  room.on("taskComplete", (task: unknown) => {
    broadcast({
      type: "taskComplete",
      task,
      timestamp: Date.now(),
    });
  });

  room.on("agentToolUsage", (data: unknown) => {
    broadcast({
      type: "agentToolUsage",
      ...(data as Record<string, unknown>),
      timestamp: Date.now(),
    });
  });
}

function broadcast(data: unknown): void {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    try {
      client.send(payload);
    } catch {
      clients.delete(client);
    }
  }
}

let wired = false;

export function handleWebSocket(
  room: Room,
): {
  open: (ws: WSClient) => void;
  message: (ws: WSClient, message: string | Buffer) => void;
  close: (ws: WSClient) => void;
} {
  if (!wired) {
    wireRoomEvents(room);
    wired = true;
  }

  return {
    open(ws: WSClient) {
      clients.add(ws);
      ws.send(
        JSON.stringify({
          type: "connected",
          status: room.getStatus(),
          timestamp: Date.now(),
        }),
      );
      console.log(`[WS] Client connected (${clients.size} total)`);
    },

    message(ws: WSClient, message: string | Buffer) {
      // Client messages reserved for future use (e.g., task submission via WS)
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch {
        // ignore malformed messages
      }
    },

    close(ws: WSClient) {
      clients.delete(ws);
      console.log(`[WS] Client disconnected (${clients.size} total)`);
    },
  };
}
