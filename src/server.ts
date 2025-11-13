import { ClientToServerSchema } from "./protocol/client";
import { RoomManager } from "./rooms/manager";
import { Room } from "./rooms/room";
import type { WebSocketData } from "./server/types";

const rooms = new RoomManager((id) => new Room(id));

const server = Bun.serve<WebSocketData>({
  port: 3000,
  development: true,
  fetch(req, server) {
    const roomId = new URL(req.url).searchParams.get("room");
    if (!roomId) {
      return new Response("Expected a room ID", { status: 400 });
    }
    if (
      server.upgrade(req, { data: { room: roomId, id: crypto.randomUUID() } })
    ) {
      return;
    }
    return new Response("Expected WebSocket upgrade", {
      status: 426,
      headers: { Upgrade: "websocket" },
    });
  },
  websocket: {
    open(ws) {
      const room = rooms.get(ws.data.room);
      room.join(ws);
    },
    close(ws) {
      rooms.withRoom(ws.data.room, (room) => room.leave(ws));
      rooms.deleteIfEmpty(ws.data.room);
    },
    message(ws, data) {
      const room = rooms.get(ws.data.room);
      const str =
        typeof data === "string" ? data : new TextDecoder().decode(data);
      const parsedJSON = (() => {
        try {
          return JSON.parse(str);
        } catch {
          return null;
        }
      })();

      if (!parsedJSON) {
        ws.send(
          JSON.stringify({
            type: "response.server.error",
            error: "Invalid JSON",
          })
        );
        return;
      }

      const result = ClientToServerSchema.safeParse(parsedJSON);
      if (!result.success) {
        ws.send(
          JSON.stringify({
            type: "response.server.error",
            error: "Invalid event payload",
          })
        );
        return;
      }

      const event = result.data;

      switch (event.type) {
        case "response.user.message":
          rooms.get(ws.data.room).startRun(event.message);
          break;
        case "response.user.abort":
          rooms.get(ws.data.room).abort();
          break;
      }
    },
  },
});

console.log(`[Chat Streaming Lab] Listening at ${server.url}`);
