/**
 * Messaging PORT (Phase 2/3 — SMS/WhatsApp) — stub. Twilio/Meta adapters implement it.
 * Declared now so the seam exists; no methods are used in Phase 1.
 */
export interface MessagingProvider {
  readonly name: string;
}
