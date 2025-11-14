export type ClientToServerEvent =
  | { type: "response.user.message"; message: string }
  | { type: "response.user.abort" }
  | { type: "response.user.sync"; last_known_sequence: number };

export type ServerToClientEvent =
  | { type: "response.server.created" }
  | { type: "response.server.delta"; delta: string; sequence: number }
  | { type: "response.server.done"; sequence: number }
  | { type: "response.server.error"; error: string; sequence: number }
  | {
      type: "response.server.bad_request";
      error: string;
      original_type: string;
    }
  | {
      type: "response.server.sync";
      accumlated_text: string;
      sequence: number;
      state_sequence: number;
      is_done: boolean;
    };
