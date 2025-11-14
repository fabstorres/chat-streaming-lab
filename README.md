# chat-streaming-lab

This project stems from a closely related private project.
It explores the question:
“How do you keep two different LLM chat clients in sync after a reconnect
and save the results to a database?”

The original approach (Convex + ReadableStream) didn’t address these issues:

- You can’t “reconnect” to the same ReadableStream; once the client disconnects,
  unread data is gone unless you persist it as it arrives.
- Convex actions/functions can’t hold a long-lived stream and then perform async
  writes afterward; async work must be awaited within the function’s lifecycle.
- Only the client that initiated the request received live deltas; a second client
  had to wait until the conversation was eventually saved.
- On disconnect, the readable stream didn’t persist; reconnecting clients had to
  wait for the eventual saved result, missing live progress.

Original (simplified) server snippet:

```ts
export const postChatStream = httpAction(async (ctx, request) => {
  //...
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();

  // Persist as data streams in
  const writer = writable.getWriter();
  const storedEvents: string[] = [];

  (async () => {
    try {
      for await (const event of openAIStream) {
        if (event.type === "response.output_text.delta") {
          const delta = event.delta;

          // Save locally
          storedEvents.push(delta);

          // Send live to client
          await writer.write(encoder.encode(JSON.stringify(event) + "\n"));
        }
      }
    } catch (err) {
      console.error("Stream failed:", err);
    } finally {
      writer.close();

      // Persist constructed response
      const fullMessage = storedEvents.join("");
      console.log(fullMessage);
    }
  })();

  return new Response(readable, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Digest",
      "Access-Control-Max-Age": "86400",
    },
  });
});
```

This project prototypes a WebSocket-based approach:

- Stream deltas to all clients in a room
- Provide a path to reconnection

To install dependencies:

```bash
bun install
```

Set your key:

```bash
export OPEN_AI_API_KEY=...
```

To run:

```bash
bun run src/server.ts
```

This project was created using `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## TODO

- Add testing to the server and create a small client.

## License

[MIT](https://github.com/fabstorres/chat-streaming-lab/blob/main/LICENSE)
