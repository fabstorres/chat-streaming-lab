import type { GetStream } from "../chat/llms";
import { makeOpenAIStream } from "./openai";

export const getStream: GetStream = async ({
  provider,
  model,
  prompt,
  signal,
}) => {
  switch (provider) {
    case "openai":
      return makeOpenAIStream({ model, prompt, signal });
    // case "anthropic": return makeAnthropicStream({ model, prompt, signal });
    // case "gemini": return makeGeminiStream({ model, prompt, signal });
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
};
