import type { LLMEvent } from "./streamSource";

export type GetStream = (opts: {
  provider: "openai" | "anthropic" | "gemini";
  model: string;
  prompt: string;
  signal: AbortSignal;
}) => Promise<AsyncIterable<LLMEvent>>;
