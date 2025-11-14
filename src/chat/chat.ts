import type { ChatClient } from "../server/types";
import type { Broadcaster } from "./broadcast";
import type { GetStream } from "./llms";

export type ChatStatus = "idle" | "in-progress" | "done" | "error";

export class Chat {
  private status: ChatStatus = "idle";
  private serverSequence: number = 0;
  private abortController: AbortController | null = null;
  currentResponse = "";
  error: string | null = null;

  getStatus() {
    return this.status;
  }

  abort() {
    this.abortController?.abort();
  }

  async streamRun(opts: {
    prompt: string;
    provider: "openai" | "anthropic" | "gemini";
    model: string;
    getStream: GetStream;
    broadcast: Broadcaster;
  }) {
    if (this.status === "in-progress") return;

    this.status = "in-progress";
    this.currentResponse = "";
    this.serverSequence = 0;
    this.error = null;
    this.abortController = new AbortController();

    const it = await opts.getStream({
      provider: opts.provider,
      model: opts.model,
      prompt: opts.prompt,
      signal: this.abortController.signal,
    });

    try {
      opts.broadcast({ type: "response.server.created" });

      for await (const ev of it) {
        if (ev.type === "response.output_text.delta") {
          this.currentResponse += ev.delta;
          this.serverSequence += 1;
          opts.broadcast({
            type: "response.server.delta",
            delta: ev.delta,
            sequence: this.serverSequence,
          });
        } else if (ev.type === "response.completed") {
          break;
        } else if (ev.type === "error") {
          this.status = "error";
          this.error = ev.message;
          this.serverSequence += 1;
          opts.broadcast({
            type: "response.server.error",
            error: ev.message,
            sequence: this.serverSequence,
          });
          return;
        }
      }
      this.status = "done";
    } finally {
      if (this.status !== "error") {
        this.serverSequence += 1;
        opts.broadcast({
          type: "response.server.done",
          sequence: this.serverSequence,
        });
      }
    }
  }
  getServerSequence() {
    return this.serverSequence;
  }
  sendSyncEvent(client: ChatClient, last_known_sequence: number) {
    client.send(
      JSON.stringify({
        type: "response.server.sync",
        sequence: last_known_sequence + 1,
        server_sequence: this.serverSequence,
        accumlated_text: this.currentResponse,
        is_done: this.status === "done" || this.status === "idle",
      })
    );
  }
}
