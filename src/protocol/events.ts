export type ClientToServerEvent =
  | { type: "response.user.message"; message: string }
  | { type: "response.user.abort" };

export type ServerToClientEvent =
  | { type: "response.server.created" }
  | { type: "response.server.delta"; delta: string }
  | { type: "response.server.done" }
  | { type: "response.server.error"; error: string };
