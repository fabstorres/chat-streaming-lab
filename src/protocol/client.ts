import { z } from "zod";

export const ClientToServerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("response.user.message"),
    message: z.string().min(1, "message cannot be empty"),
  }),
  z.object({
    type: z.literal("response.user.abort"),
  }),
  z.object({
    type: z.literal("response.user.sync"),
    last_known_sequence: z.number(),
  }),
]);

export type ClientToServerEvent = z.infer<typeof ClientToServerSchema>;

export function parseClientEvent(
  input: unknown
): { ok: true; value: ClientToServerEvent } | { ok: false; error: string } {
  const res = ClientToServerSchema.safeParse(input);
  if (res.success) return { ok: true, value: res.data };
  const msg =
    res.error.issues.map((i) => i.message).join("; ") || res.error.message;
  return { ok: false, error: msg };
}
