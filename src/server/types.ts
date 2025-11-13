export type WebSocketData = {
  room: string;
  id: string;
};

export type ChatClient = Bun.ServerWebSocket<WebSocketData>;
