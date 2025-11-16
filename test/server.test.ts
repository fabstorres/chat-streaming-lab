/**
 * @remarks
 * These tests require an `env.test.local` environment file for configuration.
 * Ensure that the timeout is set to 15000 for the tests that require it.
 */
import { ChatServer } from "../src/server";
import { expect, test } from "bun:test";

test("server, can stream a response", async () => {
  const server = new ChatServer({ development: true, port: 3001 });
  server.start();
  
  let accumulated_text = "";
  let isDone = false;
  
  const ws = new WebSocket('ws://localhost:3001?room=1');

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 2000);
    
    ws.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    
    ws.addEventListener("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data as string);
    
    if (data.type === "response.server.delta") {
      accumulated_text += data.delta;
    } else if (data.type === "response.server.done") {
      isDone = true;
    } else if (data.type === "response.server.error") {
      throw new Error(`Server error: ${data.error}`);
    }
  });

  ws.send(JSON.stringify({
    type: "response.user.message",
    message: "Hello, test message"
  }));

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Stream completion timeout")), 10000);
    
    const checkInterval = setInterval(() => {
      if (isDone) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve();
      }
    }, 50);
  });

  ws.close();

  const serverResponse = server.getRooms().withRoom("1", (r) => r.chat.currentResponse) ?? "";

  expect(accumulated_text).toBe(serverResponse);

  server.stop();
});

test("server, can sync with client and resync accumulated text", async () => {
  const server = new ChatServer({ development: true, port: 3002 });
  server.start();
  
  const ws1 = new WebSocket('ws://localhost:3002?room=2');

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 2000);
    
    ws1.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    
    ws1.addEventListener("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  const firstClientDone = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Stream completion timeout")), 10000);
    
    ws1.addEventListener("message", (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === "response.server.done") {
        clearTimeout(timeout);
        resolve();
      } else if (data.type === "response.server.error") {
        clearTimeout(timeout);
        reject(new Error(`Server error: ${data.error}`));
      }
    });
  });

  ws1.send(JSON.stringify({
    type: "response.user.message",
    message: "Test message for sync"
  }));

  await firstClientDone;
  ws1.close();

  const ws2 = new WebSocket('ws://localhost:3002?room=2');

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 2000);
    
    ws2.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    
    ws2.addEventListener("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  const syncResponse = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Sync response timeout")), 2000);
    
    ws2.addEventListener("message", (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === "response.server.sync") {
        clearTimeout(timeout);
        resolve(data);
      } else if (data.type === "response.server.bad_request") {
        clearTimeout(timeout);
        reject(new Error(`Server bad request: ${data.error}`));
      }
    });
  });

  ws2.send(JSON.stringify({
    type: "response.user.sync",
    last_known_sequence: 0
  }));

  const syncData = await syncResponse;
  ws2.close();

  const serverResponse = server.getRooms().withRoom("2", (r) => r.chat.currentResponse) ?? "";

  expect(syncData).not.toBeNull();
  expect(syncData.type).toBe("response.server.sync");
  expect(syncData.accumlated_text).toBe(serverResponse);

  server.stop();
});
