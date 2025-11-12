import { OpenAI } from "openai/client.js";

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

  async streamChat(ws: Bun.ServerWebSocket<undefined>, prompt: string) {
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
          ws.send(
            JSON.stringify({
              type: "response.server.created",
            })
          );
        }
        if (event.type === "response.output_text.delta") {
          this.currentResponse += event.delta;
          ws.send(
            JSON.stringify({
              type: "response.server.delta",
              delta: event.delta,
            })
          );
        }
        if (event.type === "response.completed") {
          this.status = "done";
          ws.send(
            JSON.stringify({
              type: "response.server.done",
            })
          );
        }
        if (event.type === "error") {
          this.status = "error";
          ws.send(
            JSON.stringify({
              type: "response.server.error",
              error: event.message,
            })
          );
          break;
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        ws.send(
          JSON.stringify({
            type: "response.server.error",
            error: err.message,
          })
        );
      }
    } finally {
      this.status = "done";
      ws.send(
        JSON.stringify({
          type: "response.server.done",
        })
      );
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

const chat = new Chat();

const server = Bun.serve({
  port: 3000,
  development: true,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return;
    }
    return new Response("Failed request", { status: 500 });
  },
  websocket: {
    open: (ws) => {
      ws.send("Welcome user!");
      console.log("Client connected");
    },
    message: (ws, message) => {
      const data =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);
      const event = JSON.parse(data) as ChatEvent;
      console.log("Client sent message", event);

      if (event.type === "response.user.message") {
        chat.streamChat(ws, event.message);
      }
      if (event.type === "response.user.abort") {
        if (chat.status === "in-progress") {
          chat.abortController!.abort();
        }
      }
    },
    close: (ws) => {
      console.log("Client disconnected");
    },
  },
});

console.log(`Listening on ${server.url}`);
