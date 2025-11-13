export type LLMEvent =
  | { type: "response.created" }
  | { type: "response.output_text.delta"; delta: string }
  | { type: "response.completed" }
  | { type: "error"; message: string };

export interface StreamSource {
  create(prompt: string, signal: AbortSignal): Promise<AsyncIterable<LLMEvent>>;
}
