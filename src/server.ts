import { ClientToServerSchema } from "./protocol/client";
import { RoomManager } from "./rooms/manager";
import { Room } from "./rooms/room";
import type { WebSocketData, ChatClient } from "./server/types";
import type { RoomFactory } from "./rooms/manager";

export interface ChatServerOptions {
  port?: number;
  development?: boolean;
  roomFactory?: RoomFactory;
}

export class ChatServer {
  private rooms: RoomManager;
  private server: ReturnType<typeof Bun.serve<WebSocketData>> | null = null;
  private options: Required<ChatServerOptions>;

  constructor(options: ChatServerOptions = {}) {
    this.options = {
      port: options.port ?? 3000,
      development: options.development ?? true,
      roomFactory: options.roomFactory ?? ((id) => new Room(id)),
    };
    this.rooms = new RoomManager(this.options.roomFactory);
  }

  start() {
    if (this.server) {
      throw new Error("Server is already running");
    }

    this.server = Bun.serve<WebSocketData>({
      port: this.options.port,
      development: this.options.development,
      fetch: (req, server) => this.handleFetch(req, server),
      websocket: {
        open: (ws) => this.handleWebSocketOpen(ws),
        close: (ws) => this.handleWebSocketClose(ws),
        message: (ws, data) => this.handleWebSocketMessage(ws, data),
      },
    });

    console.log(`[Chat Streaming Lab] Listening at ${this.server.url}`);
    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  getServer() {
    return this.server;
  }

  getRooms() {
    return this.rooms;
  }

  private handleFetch(
    req: Request,
    server: ReturnType<typeof Bun.serve<WebSocketData>>
  ) {
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
  }

  private handleWebSocketOpen(ws: ChatClient) {
    const room = this.rooms.get(ws.data.room);
    room.join(ws);
  }

  private handleWebSocketClose(ws: ChatClient) {
    this.rooms.withRoom(ws.data.room, (room) => room.leave(ws));
    this.rooms.deleteIfEmpty(ws.data.room);
  }

  private handleWebSocketMessage(
    ws: ChatClient,
    data: string | ArrayBuffer | Uint8Array
  ) {
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
          type: "response.server.bad_request",
          error: "Invalid JSON",
          original_type: "unknown",
        })
      );
      return;
    }

    const result = ClientToServerSchema.safeParse(parsedJSON);
    if (!result.success) {
      ws.send(
        JSON.stringify({
          type: "response.server.bad_request",
          error: "Invalid event payload",
          original_type: parsedJSON["type"] ?? "unknown",
        })
      );
      return;
    }

    const event = result.data;

    switch (event.type) {
      case "response.user.sync":
        const room = this.rooms.get(ws.data.room);
        const sequence =
          this.rooms.withRoom(ws.data.room, (r) => r.chat.getServerSequence()) ??
          -1;
        if (
          event.last_known_sequence < 0 ||
          event.last_known_sequence > sequence
        ) {
          ws.send(
            JSON.stringify({
              type: "response.server.bad_request",
              error: "Invalid sync request",
              original_type: event.type,
            })
          );
          break;
        }
        this.rooms.withRoom(ws.data.room, (r) =>
          r.chat.sendSyncEvent(ws, event.last_known_sequence)
        );
        break;
      case "response.user.message":
        this.rooms.withRoom(ws.data.room, (r) => r.startRun(event.message));
        break;
      case "response.user.abort":
        this.rooms.withRoom(ws.data.room, (r) => r.abort());
        break;
    }
  }
}


const server = new ChatServer();
server.start();
