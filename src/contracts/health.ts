import { z } from "zod";

export const HealthResponse = z.object({
  ok: z.literal(true),
  service: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
