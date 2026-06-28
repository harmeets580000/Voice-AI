import { z } from "zod";

/**
 * Vapi API Tester contract (super-admin debug tool). Lets a super-admin run READ-ONLY Vapi
 * operations with a pasted key, the platform env key, or a selected org's stored key, and view the
 * raw response. The plaintext key is never echoed back: for the `platform`/`org` sources it is
 * resolved server-side; for `pasted` it is sent up once and never stored or returned.
 */

/** The read-only Vapi operations the website touches (no create/update/delete). */
export const VapiTesterOp = z.enum([
  "validateKey",
  "listAssistants",
  "getAssistant",
  "listPhoneNumbers",
  "getPhoneNumber",
  "listCalls",
  "getCall",
  "listVoices",
]);
export type VapiTesterOp = z.infer<typeof VapiTesterOp>;

export const VapiKeySource = z.enum(["pasted", "platform", "org"]);
export type VapiKeySource = z.infer<typeof VapiKeySource>;

export const VapiTestRequest = z
  .object({
    operation: VapiTesterOp,
    keySource: VapiKeySource,
    /** Required when keySource = "pasted". Sent once; never stored or echoed back. */
    apiKey: z.string().optional(),
    /** Required when keySource = "org". */
    organizationId: z.string().optional(),
    /** Operation params, e.g. { id, assistantId, limit }. */
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => v.keySource !== "pasted" || !!v.apiKey, {
    message: "apiKey is required when keySource is 'pasted'",
    path: ["apiKey"],
  })
  .refine((v) => v.keySource !== "org" || !!v.organizationId, {
    message: "organizationId is required when keySource is 'org'",
    path: ["organizationId"],
  });
export type VapiTestRequest = z.infer<typeof VapiTestRequest>;

export const VapiTestResponse = z.object({
  ok: z.boolean(),
  /** HTTP status from Vapi (200 on success, the error code on failure, null if unknown). */
  statusCode: z.number().nullable(),
  durationMs: z.number(),
  /** Raw response body from Vapi on success. */
  data: z.unknown().nullable(),
  error: z.string().nullable(),
});
export type VapiTestResponse = z.infer<typeof VapiTestResponse>;
