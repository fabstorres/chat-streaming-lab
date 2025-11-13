import type { Broadcaster } from "./broadcast";
import type { GetStream } from "./llms";

export type ChatStatus = "idle" | "in-progress" | "done" | "error";

export class Chat {
  private status: ChatStatus = "idle";
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
          opts.broadcast({ type: "response.server.delta", delta: ev.delta });
        } else if (ev.type === "response.completed") {
          break;
        } else if (ev.type === "error") {
          this.status = "error";
          this.error = ev.message;
          opts.broadcast({
            type: "response.server.error",
            error: ev.message,
          });
          return;
        }
      }
    } finally {
      if (this.status !== "error") this.status = "done";
      opts.broadcast({ type: "response.server.done" });
    }
  }
}
