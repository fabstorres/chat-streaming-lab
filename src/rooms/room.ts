import { makeBroadcaster, type Broadcaster } from "../chat/broadcast";
import { Chat } from "../chat/chat";
import type { StreamSource } from "../chat/streamSource";
import { getStream } from "../providers/registery";
import type { ChatClient } from "../server/types";

export class Room {
  readonly id: string;
  private clients: ChatClient[] = [];
  readonly chat: Chat;

  constructor(id: string) {
    this.id = id;
    this.chat = new Chat();
  }

  join(ws: ChatClient) {
    this.clients.push(ws);
  }

  leave(ws: ChatClient) {
    this.clients = this.clients.filter(
      (client) => client.data.id !== ws.data.id
    );
  }

  isEmpty() {
    return this.clients.length === 0;
  }

  async startRun(prompt: string, cfg?: { provider?: string; model?: string }) {
    const provider =
      (cfg?.provider as "openai" | "anthropic" | "gemini") ?? "openai";
    const model = cfg?.model ?? "gpt-5-nano";
    const broadcast = makeBroadcaster(this.clients);
    await this.chat.streamRun({
      prompt,
      provider,
      model,
      getStream,
      broadcast,
    });
  }

  abort() {
    this.chat.abort();
  }
}
