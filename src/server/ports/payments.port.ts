/**
 * Payments PORT (Phase 4) — stub. A Stripe adapter will implement this behind the port.
 * Declared now so the seam exists from day one; no methods are used in Phase 1.
 */
export interface PaymentsProvider {
  readonly name: string;
}
