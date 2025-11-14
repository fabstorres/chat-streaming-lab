import type { ServerToClientEvent } from "../protocol/events";
import type { ChatClient } from "../server/types";

export type Broadcaster = (payload: Readonly<ServerToClientEvent>) => void;

const MAX_BUFFERED_AMOUNT = 1024 * 1024; // 1MB per client

export function makeBroadcaster(clients: ChatClient[]): Broadcaster {
  return (payload) => {
    const data = JSON.stringify(payload);

    for (let i = clients.length - 1; i >= 0; i--) {
      const ws = clients.at(i);
      if (!ws) continue;

      if (ws.readyState !== WebSocket.OPEN) {
        console.log(
          `[Broadcaster ${ws.data.room}] Client ${ws.data.id} is no longer active, removing user...`
        );
        clients.splice(i, 1);
        continue;
      }

      // Back pressure check
      if (ws.getBufferedAmount() > MAX_BUFFERED_AMOUNT) {
        console.warn(
          `[Broadcaster ${ws.data.room}] Client ${
            ws.data.id
          } buffer full (${ws.getBufferedAmount()} bytes), skipping message`
        );
        // Skip this message (client will sync later)
        continue;
      }

      try {
        ws.send(data);
      } catch (error) {
        console.log(
          `[Broadcaster ${ws.data.room}] Failed to broadcast to user ${ws.data.id}: ${error}, removing user...`
        );
        clients.splice(i, 1);
      }
    }
  };
}
