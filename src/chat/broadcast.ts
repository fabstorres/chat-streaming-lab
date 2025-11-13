import type { ServerToClientEvent } from "../protocol/events";
import type { ChatClient } from "../server/types";

export type Broadcaster = (payload: Readonly<ServerToClientEvent>) => void;

export function makeBroadcaster(clients: ChatClient[]): Broadcaster {
  return (payload) => {
    const data = JSON.stringify(payload);
    clients.forEach((ws, idx) => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.log(
          `[Broadcaster ${ws.data.room}] Client ${ws.data.id} is no longer active, removing user...`
        );
        clients.splice(idx, 1);
      }
      try {
        ws.send(data);
      } catch {
        console.log(
          `[Broadcaster ${ws.data.room}] Failed to broadcast to user ${ws.data.id}, removing user...`
        );
        clients.splice(idx, 1);
      }
    });
  };
}
