// providers/openai.ts
import { OpenAI } from "openai/client.js";
import type { LLMEvent } from "../chat/streamSource";

const client = new OpenAI({ apiKey: Bun.env.OPEN_AI_API_KEY! });

export async function makeOpenAIStream(opts: {
  model: string;
  prompt: string;
  signal: AbortSignal;
}): Promise<AsyncIterable<LLMEvent>> {
  const stream = await client.responses.create(
    { model: opts.model, input: opts.prompt, stream: true },
    { signal: opts.signal }
  );

  return stream as AsyncIterable<LLMEvent>;
}
