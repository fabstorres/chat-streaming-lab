import { OpenAI } from "openai/client.js";

type WebSocketData = {
  room: string;
  id: string;
};

type ChatClient = Bun.ServerWebSocket<WebSocketData>;

const client = new OpenAI({ apiKey: Bun.env.OPEN_AI_API_KEY! });

class Chat {
  currentResponse: string;
  abortController: AbortController | null;
  status: "in-progress" | "done" | "error";
  error: string | null;
  constructor() {
    this.currentResponse = "";
    this.abortController = null;
    this.status = "done";
    this.error = null;
  }

  async streamChat(clients: ChatClient[], prompt: string) {
    if (this.status === "in-progress") return;

    this.currentResponse = "";
    this.abortController = new AbortController();

    this.status = "in-progress";
    const streamPromise = client.responses.create(
      {
        model: "gpt-5-nano",
        input: prompt,
        stream: true,
      },
      { signal: this.abortController.signal }
    );

    const stream = await streamPromise;
    try {
      for await (const event of stream) {
        if (event.type === "response.created") {
          clients.forEach((ws) => {
            ws.send(
              JSON.stringify({
                type: "response.server.created",
              })
            );
          });
        }
        if (event.type === "response.output_text.delta") {
          this.currentResponse += event.delta;
          clients.forEach((ws) => {
            ws.send(
              JSON.stringify({
                type: "response.server.delta",
                delta: event.delta,
              })
            );
          });
        }
        if (event.type === "response.completed") {
          break;
        }
        if (event.type === "error") {
          this.status = "error";
          clients.forEach((ws) => {
            ws.send(
              JSON.stringify({
                type: "response.server.error",
                error: event.message,
              })
            );
          });

          break;
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        clients.forEach((ws) => {
          ws.send(
            JSON.stringify({
              type: "response.server.error",
              error: err.message,
            })
          );
        });
      }
    } finally {
      this.status = "done";
      clients.forEach((ws) => {
        ws.send(
          JSON.stringify({
            type: "response.server.done",
          })
        );
      });
    }
  }
}

interface UserMessageEvent {
  type: "response.user.message";
  message: string;
}

interface UserAbortEvent {
  type: "response.user.abort";
}

interface ServerDeltaEvent {
  type: "response.server.delta";
  delta: string;
}

interface ServerErrorEvent {
  type: "response.server.error";
  error: string;
}

interface ServerCreatedEvent {
  type: "response.server.created";
}

interface ServerDoneEvent {
  type: "response.server.done";
}

type ChatEvent =
  | UserMessageEvent
  | UserAbortEvent
  | ServerDeltaEvent
  | ServerErrorEvent
  | ServerCreatedEvent
  | ServerDoneEvent;

class Room {
  clients: ChatClient[];
  chat: Chat;
  constructor() {
    this.clients = [];
    this.chat = new Chat();
  }
}

const rooms: Record<string, Room> = {};

const server = Bun.serve<WebSocketData>({
  port: 3000,
  development: true,
  fetch(req, server) {
    const room = new URL(req.url).searchParams.get("room");
    if (
      room &&
      server.upgrade(req, { data: { room, id: crypto.randomUUID() } })
    ) {
      return;
    }
    return new Response("Failed request", { status: 500 });
  },
  websocket: {
    open: (ws) => {
      ws.send(`Welcome user ${ws.data.id} to room ${ws.data.room}!`);
      if (!(ws.data.room in rooms)) {
        rooms[ws.data.room] = new Room();
      }
      rooms[ws.data.room]!.clients.push(ws);
      console.log(`Client ${ws.data.id} connected`);
    },
    message: (ws, message) => {
      const data =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);
      const event = JSON.parse(data) as ChatEvent;
      console.log("Client sent message", event);

      if (event.type === "response.user.message") {
        const room = rooms[ws.data.room];
        if (!room) return;
        room.chat.streamChat(room.clients, event.message);
      }
      if (event.type === "response.user.abort") {
        const room = rooms[ws.data.room];
        if (!room) return;
        if (room.chat.status === "in-progress") {
          room.chat.abortController!.abort();
        }
      }
    },
    close: (ws) => {
      const room = rooms[ws.data.room];
      if (!room) return;
      room.clients = room.clients.filter(
        (client) => client.data.room != ws.data.room
      );
      rooms[ws.data.room];
      console.log("Client disconnected");
    },
  },
});

console.log(`Listening on ${server.url}`);
